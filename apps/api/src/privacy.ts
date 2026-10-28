import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { isYuanqizhanReadProjectionRoute } from './yuanqizhan-nutrition-view';

type Identity = { id: string; displayName: string; phone: string };
const hiddenFields = /^(phone|phoneMasked|mobile|telephone|email|avatarUrl|birthDate|address|idCard|identityNumber|emergencyContactName|emergencyContactPhone|photos?|images?|imageUrls?|photoUrls?|attachments?|attachmentUrls?|fileUrl|mediaUrl|mediaAssetId|objectKey|url|posturePhotos)$/i;
const archiveEnums = new Set(['UNKNOWN','MALE','FEMALE','OTHER','LOW','MODERATE','HIGH','NEVER','FORMER','CURRENT','OCCASIONAL','FREQUENT','YES','NO','ACTIVE','COMPLETED','PENDING']);
// Legacy data must fail closed: new/raw fields require an explicit reviewed projection.
const publicFields = new Set(`id patientId practitionerId userId senderId receiverId authorId role status displayName clientCode archiveNo archiveStatus archiveCompletionPercent archiveUpdatedAt type recordType taskType mealType measuredAt recordedAt mealTime createdAt updatedAt dueAt completedAt cancelledAt scheduledAt expiresAt revokedAt readAt lastContactAt lastRecordAt latestRecordAt lastLoginAt priority title description content comment note notes text author practitioner patient sender receiver comments reviews replies items mealItems amount unit amountGrams foodName foodId caloriesKcal caloriesSource estimatedKcal calorieEstimate source confidence weightKg heightCm waistCm hipCm bodyFatPct bmi muscleMassKg skeletalMuscleMassKg sleepHours targetWeightKg initialWeightKg currentWeightKg active attention completedGoal pendingTaskCount pendingFollowUpCount totalRecords totalFollowUps completedFollowUps completedGoalCount activeCount attentionCount total items patients records trend stats summary summaries plan plans template templates startDate endDate reviewDate period periodStart periodEnd periodType recommendation recommendations goals objective result recurrenceRule meals categories dailyCaloriesKcal proteinGrams carbsGrams fatGrams hydrationMl waterMl activityLevel mealsPerDay smoking alcohol sedentaryHours enrollment packageName healthManagerId nutritionistId doctorId exerciseCoachId lifestyle bodyReports exerciseReports posturePhotos shares assessment precautions publishedAt version reviewedAt sets reps tempo restSeconds frequency videoId videoTitle durationSeconds notificationId actionPath relatedType relatedId unreadCount unread total page pageSize hasMore label value questionId answers completionPercent templateVersion enabled key days count date totalKcal mealCount todayMealCount recordsCount recordCount data notifications relation careRelations riskLevel weightChangeKg bodyFatChangePct waistChangeCm checkInRate followUpCompletionRate taskCompletionRate completedTasks pendingTasks effectiveAt endedAt endedReason bindMethod`.split(/\s+/));
for (const field of ['imageAssetIds','name','weightGrams','weightUnit','authorRole','healthRecordId','reviewId']) publicFields.add(field);
const archiveFields = new Set(['questionId','value','gender','heightCm','weightKg','waistCm','hipCm','sleepHours','waterMl','activityLevel','mealsPerDay','smoking','alcohol','sedentaryHours']);
const privateText = '[隐私内容已隐藏]';

// Legacy archives contain unrestricted text and file links. Only numeric,
// boolean and enum answers are released; new onboarding uses a typed survey.
function safeArchive(value: unknown): unknown {
  if ((typeof value === 'number' || typeof value === 'string') && /^1[3-9]\d{9}$/.test(String(value))) return privateText;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 100000 ? value : privateText;
  if (typeof value === 'string') return archiveEnums.has(value) || (/^\d{1,6}(\.\d{1,4})?$/.test(value) && Number(value) <= 100000) ? value : privateText;
  if (Array.isArray(value)) return value.map(safeArchive);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => archiveFields.has(key) && !hiddenFields.test(key)).map(([key, item]) => [key, safeArchive(item)]));
  return null;
}

export function nutritionPrivacy(value: unknown, identities: Identity[]): unknown {
  const known = new Map(identities.map((row) => [row.id, row]));
  const scrubText = (text: string) => {
    let result = text.replace(/(?:\+?86[- ]?)?1[3-9](?:[- ]?\d){9}/g, privateText)
      .replace(/\b\d{17}[\dXx]\b/g, privateText)
      .replace(/https?:\/\/[^\s<>"']+/gi, privateText)
      .replace(/data:(?:image|video|application)\/[^\s<>"']+/gi, privateText)
      .replace(/\/api\/v1\/media\/[^\s<>"']+/gi, privateText)
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, privateText);
    for (const row of identities) {
      if (row.phone) result = result.split(row.phone).join(privateText);
      if (row.displayName) result = result.split(row.displayName).join(`客户${row.id.slice(-8).toUpperCase()}`);
    }
    return result;
  };
  const visit = (item: any): any => {
    if (item === null || item === undefined) return item;
    if (typeof item === 'string') return scrubText(item);
    if (typeof item !== 'object') return typeof item === 'number' && /^1[3-9]\d{9}$/.test(String(item)) ? privateText : item;
    if (item instanceof Date) return item;
    if (typeof item.toJSON === 'function') return visit(item.toJSON());
    if (Array.isArray(item)) return item.map(visit);
    const patient = known.get(item.id) || (item.role === 'PATIENT' ? { id: item.id ?? '匿名' } : undefined);
    const patientMessage = known.has(item.senderId);
    const output: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(item)) {
      if (!publicFields.has(key) || hiddenFields.test(key)) continue;
      if (key === 'displayName' && patient) output[key] = `客户${patient.id.slice(-8).toUpperCase()}`;
      else if (key === 'answers') output[key] = safeArchive(field);
      else if (['content', 'description', 'notes', 'note', 'text', 'title'].includes(key) && patientMessage) output[key] = privateText;
      else output[key] = visit(field);
    }
    return output;
  };
  return visit(value);
}

@Injectable()
export class NutritionPrivacyInterceptor implements NestInterceptor {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    // Bound-client activity reads have a dedicated field projection in their service.
    if (isYuanqizhanReadProjectionRoute(req.method, path)) return next.handle();
    // New care-management endpoints have explicit, role-specific projections.
    if (/\/(auth|admin|health|care-management|report-workflow|media)(\/|$)/.test(path) || !req.headers.authorization) return next.handle();
    const actor = await this.auth.actor(req);
    if (actor.role !== 'NUTRITIONIST') return next.handle();
    // Include ended relationships: historical messages must remain anonymous.
    const identities = await this.prisma.user.findMany({
      where: { role: 'PATIENT', OR: [{ patientRelations: { some: { practitionerId: actor.sub } } }, { careEnrollment: { nutritionistId: actor.sub } }] },
      select: { id: true, displayName: true, phone: true },
    });
    return next.handle().pipe(map((data) => nutritionPrivacy(data, identities)));
  }
}
