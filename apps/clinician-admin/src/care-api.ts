import { api, type ApiClient } from './api';

export type Lifestyle = { sleepHours: number; activityLevel: 'LOW' | 'MODERATE' | 'HIGH'; mealsPerDay: number; smoking: 'NEVER' | 'FORMER' | 'CURRENT'; alcohol: 'NEVER' | 'OCCASIONAL' | 'FREQUENT'; sedentaryHours: number; waterMl: number };
export type CareEnrollment = { id: string; patientId: string; clientCode: string; packageName: string; healthManagerId: string; nutritionistId: string; doctorId: string; exerciseCoachId: string; createdAt: string };
export type CareClient = {
  patient: { id: string; displayName: string; phone?: string };
  enrollment: CareEnrollment | null;
  legacyAccount?: boolean;
  lifestyle?: Lifestyle | null; bodyReports?: BodyReport[]; exerciseReports?: ExerciseReport[]; posturePhotos?: PosturePhoto[];
};
export type Staff = { id: string; displayName: string; role: string };
export type StaffOptions = { doctors: Staff[]; nutritionists: Staff[]; exerciseCoaches: Staff[] };
export type EnrollmentInput = { name: string; phone: string; packageName: string; nutritionistId: string; doctorId: string; exerciseCoachId: string; lifestyle: Lifestyle };
export type EnrollmentResult = CareClient & { enrollment: CareEnrollment; credentials?: { account: string; initialPassword: string; role: 'PATIENT' } };
export type BodyInput = { measuredAt: string; heightCm?: number; weightKg?: number; bodyFatPct?: number; muscleMassKg?: number; skeletalMuscleMassKg?: number; waistCm?: number; hipCm?: number; bmi?: number };
export type BodyReport = BodyInput & { id: string; source?: string };
export type PosturePhoto = { id: string; mediaAssetId: string; view: 'FRONT' | 'SIDE' | 'BACK'; createdAt: string };
export type ExerciseVideo = { id: string; title: string; description?: string; mediaAssetId: string; durationSeconds: number; createdAt: string };
export type ExerciseItem = { videoId: string; actionName: string; sets: number; reps: number; tempo: string; restSeconds: number; frequency: string; videoTitle?: string; mediaAssetId?: string; durationSeconds?: number };
export type ExerciseInput = { assessment: string; precautions?: string; items: ExerciseItem[] };
export type ExerciseShare = { id: string; expiresAt: string; revokedAt?: string | null };
export type ExerciseReport = ExerciseInput & { id: string; patientId: string; createdAt: string; publishedAt?: string | null; version?: number; revisedFromId?: string | null; shares: ExerciseShare[] };
export type ShareResult = ExerciseShare & { url: string; path: string; delivery: 'IN_APP' | 'SIMULATED_IN_APP'; notificationId: string };
export type Review = { id: string; comment: string; createdAt: string; updatedAt?: string; practitioner?: Staff; replies?: { id: string; comment: string; createdAt: string; authorRole: 'PATIENT' }[] };
export type MealRecord = { id: string; measuredAt: string; mealType?: string; note?: string; caloriesKcal?: number | string; reviews?: Review[]; imageAssetIds?: string[]; mealItems?: { name: string; weightGrams?: number; caloriesKcal?: number }[] };
export type DietPlan = { id: string; title: string; summary?: string; instructions?: string; status: string; startsAt: string; endsAt?: string };
export type PlanTemplate = { id: string; title: string; summary?: string; content: Record<string, unknown> };
// UI availability only; server authorization remains authoritative.
export function ownsCareClient(client: CareClient | undefined, user: { id: string; role: string }): boolean {
  return user.role === 'HEALTH_MANAGER' && !!client?.enrollment && client.enrollment.healthManagerId === user.id;
}
export function matchesCareClient(client: CareClient, query: string): boolean {
  const term = query.trim().toLowerCase();
  return [client.patient.displayName, client.patient.phone, client.enrollment?.clientCode, client.patient.id].some(value => value?.toLowerCase().includes(term));
}
export type WorkbenchQueue = 'pendingDietReviews' | 'pendingPlans' | 'pendingSummaries' | 'dueRechecks';
export type WorkbenchItem = { patientId: string; clientCode?: string; recordId?: string; measuredAt?: string; mealType?: string; periodType?: 'WEEKLY'; periodStart?: string; followUpId?: string; type?: string; scheduledAt?: string; status?: string };
export type CareWorkbench = { asOf: string; date: string; timezone: string; counts: Record<WorkbenchQueue, number>; queues: Record<WorkbenchQueue, WorkbenchItem[]>; definitions: Record<WorkbenchQueue, string> };
export type BusinessRecord = { id: string; recordType: string; measuredAt: string; note?: string; weightKg?: number | string; waistCm?: number | string; hipCm?: number | string; bodyFatPct?: number | string; sleepHours?: number | string; caloriesKcal?: number | string; mealType?: string; mealItems?: { name?: string; weightGrams?: number; caloriesKcal?: number }[]; payload?: Record<string, unknown>; reviews?: Review[]; assets?: { id: string; mimeType?: string }[]; imageAssetIds?: string[] };
export type BusinessRecordPage = { items: BusinessRecord[]; total: number; page: number; pageSize: number; hasMore: boolean };
export const shareDurations = [1, 7, 14, 30] as const;
export const bodyFields = [
  { key: 'heightCm', label: '身高', unit: 'cm', min: 30, max: 260 },
  { key: 'weightKg', label: '体重', unit: 'kg', min: 1, max: 500 },
  { key: 'bodyFatPct', label: '体脂率', unit: '%', min: 1, max: 80 },
  { key: 'muscleMassKg', label: '肌肉量', unit: 'kg', min: 1, max: 250 },
  { key: 'skeletalMuscleMassKg', label: '骨骼肌量', unit: 'kg', min: 1, max: 150 },
  { key: 'hipCm', label: '臀围', unit: 'cm', min: 10, max: 300 },
  { key: 'waistCm', label: '腰围', unit: 'cm', min: 10, max: 300 },
  { key: 'bmi', label: 'BMI', unit: 'kg/m²', min: 5, max: 100 },
] as const;
export function bodyInput(form: FormData): BodyInput {
  const measuredAt = new Date(String(form.get('measuredAt')));
  if (!Number.isFinite(measuredAt.getTime())) throw new Error('请选择检测时间');
  if (measuredAt.getTime() > Date.now() + 60000) throw new Error('检测时间不能在未来');
  const input: BodyInput = { measuredAt: measuredAt.toISOString() };
  for (const field of bodyFields) {
    const raw = String(form.get(field.key) ?? '').trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < field.min || value > field.max) throw new Error(field.label + '超出有效范围');
    input[field.key] = value;
  }
  if (Object.keys(input).length === 1) throw new Error('至少填写一项检测指标');
  return input;
}
export function validateMedia(file: File, kind: 'image' | 'video') {
  const allowed = kind === 'image' ? ['image/jpeg', 'image/png', 'image/webp'] : ['video/mp4', 'video/webm'];
  const max = kind === 'image' ? 10 : 100;
  if (!allowed.includes(file.type)) throw new Error(kind === 'image' ? '请选择 JPG、PNG 或 WebP 图片' : '请选择 MP4 或 WebM 视频');
  if (!file.size || file.size > max * 1024 * 1024) throw new Error('文件大小须在 ' + max + ' MB 以内');
}
export function safeShareUrl(url: string): string | null {
  // Relative URLs cannot be copied as a customer-facing link: the admin and patient apps have different origins.
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null; } catch { return null; }
}
const part = encodeURIComponent;
export class CareApi {
  constructor(private client: ApiClient = api) {}
  patients() { return this.client.request<CareClient[]>('/care-management/patients'); }
  patient(id: string) { return this.client.request<CareClient>('/care-management/patients/' + part(id)); }
  workbench() { return this.client.request<CareWorkbench>('/care-management/workbench'); }
  records(id: string, page = 1, recordType = '') {
    const params = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (recordType) params.set('recordType', recordType);
    return this.client.request<BusinessRecordPage>('/clinical/patients/' + part(id) + '/records?' + params);
  }
  staff() { return this.client.request<StaffOptions>('/care-management/staff'); }
  enroll(body: EnrollmentInput) { return this.client.request<EnrollmentResult>('/care-management/patients', { method: 'POST', body }); }
  body(id: string, body: BodyInput) { return this.client.request<BodyReport>('/care-management/patients/' + part(id) + '/body-reports', { method: 'POST', body }); }
  posture(id: string, mediaAssetId: string, view: PosturePhoto['view']) { return this.client.request<PosturePhoto>('/care-management/patients/' + part(id) + '/posture-photos', { method: 'POST', body: { mediaAssetId, view, faceProtected: true } }); }
  videos() { return this.client.request<ExerciseVideo[]>('/care-management/videos'); }
  video(body: { title: string; description?: string; durationSeconds: number; mediaAssetId: string }) { return this.client.request<ExerciseVideo>('/care-management/videos', { method: 'POST', body }); }
  report(id: string, body: ExerciseInput) { return this.client.request<ExerciseReport>('/care-management/patients/' + part(id) + '/exercise-reports', { method: 'POST', body }); }
  share(id: string, expiresInDays: number, idempotencyKey?: string) {
    if (!shareDurations.some(x => x === expiresInDays)) throw new Error('请选择 1、7、14 或 30 天有效期');
    return this.client.request<ShareResult>('/care-management/exercise-reports/' + part(id) + '/share', { method: 'POST', body: { expiresInDays, reviewed: true, ...(idempotencyKey ? { idempotencyKey } : {}) } });
  }
  revoke(id: string, shareId: string) { return this.client.request('/care-management/exercise-reports/' + part(id) + '/share/' + part(shareId), { method: 'DELETE' }); }
  async upload(file: File, kind: 'image' | 'video') {
    validateMedia(file, kind);
    const body = new FormData(); body.append('file', file);
    return this.client.request<{ id: string }>('/media/upload', { method: 'POST', body });
  }
  mediaBlob(id: string, url: string) { return this.client.mediaBlob(id, url); }
  updateVideo(id: string, body: { title: string; description?: string; durationSeconds: number }) { return this.client.request('/care-management/videos/' + part(id), { method: 'PATCH', body }); }
  removeVideo(id: string) { return this.client.request('/care-management/videos/' + part(id), { method: 'DELETE' }); }
  revise(id: string, body: ExerciseInput) { return this.client.request<ExerciseReport>('/care-management/exercise-reports/' + part(id) + '/revisions', { method: 'POST', body }); }
  media(id: string) { return this.client.request<{ url: string }>('/media/' + part(id) + '/url'); }
  meals(id: string, page = 1) { return this.client.request<{ items: MealRecord[]; total: number }>('/nutrition/patients/' + part(id) + '/records?recordType=DIET&pageSize=30&page=' + page); }
  review(id: string, record: string, comment: string) { return this.client.request<Review>('/clinical/patients/' + part(id) + '/records/' + part(record) + '/review', { method: 'POST', body: { comment } }); }
  plans(id: string) { return this.client.request<DietPlan[]>('/clinical/patients/' + part(id) + '/diet-plans'); }
  templates() { return this.client.request<PlanTemplate[]>('/diet-plan-templates'); }
  plan(id: string, body: { templateId: string; instructions?: string; startsAt?: string; endsAt?: string }) { return this.client.request<DietPlan>('/clinical/patients/' + part(id) + '/diet-plans', { method: 'POST', body }); }
}
export const careApi = new CareApi();

