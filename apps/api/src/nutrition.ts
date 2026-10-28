import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { ClinicalService } from './clinical';
import type { Actor } from './auth';
import { PrismaService } from './prisma.service';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

class TemplateQueryDto {
  @IsString() @IsOptional() active?: string;
}

class CreateDietPlanTemplateDto {
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(500) @IsOptional() summary?: string;
  @IsObject() content!: Record<string, unknown>;
  @Type(() => Number) @IsInt() @Min(500) @Max(6000) @IsOptional() dailyCaloriesKcal?: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(365) @IsOptional() durationDays?: number;
  @IsBoolean() @IsOptional() active: boolean = true;
}

class UpdateDietPlanTemplateDto {
  @IsString() @MaxLength(120) @IsOptional() title?: string;
  @IsString() @MaxLength(500) @IsOptional() summary?: string;
  @IsObject() @IsOptional() content?: Record<string, unknown>;
  @Type(() => Number) @IsInt() @Min(500) @Max(6000) @IsOptional() dailyCaloriesKcal?: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(365) @IsOptional() durationDays?: number;
  @IsBoolean() @IsOptional() active?: boolean;
}

class AssignDietPlanDto {
  @IsString() @IsOptional() templateId?: string;
  @IsString() @MaxLength(120) @IsOptional() title?: string;
  @IsString() @MaxLength(500) @IsOptional() summary?: string;
  @IsObject() @IsOptional() content?: Record<string, unknown>;
  @IsString() @MaxLength(5000) @IsOptional() instructions?: string;
  @IsDateString() @IsOptional() startsAt?: string;
  @IsDateString() @IsOptional() endsAt?: string;
}

export class ReviewRecordDto {
  @IsString() @MaxLength(2000) comment!: string;
}

export class NutritionRecordQueryDto {
  @IsIn(['WEIGHT', 'DIET', 'SLEEP']) @IsOptional() recordType?: 'WEIGHT' | 'DIET' | 'SLEEP';
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 30;
}
@Injectable()
export class NutritionService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private assertAdmin(actor: { role: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('仅管理员可维护饮食方案模板');
  }

  private assertPractitioner(actor: { role: string }) {
    if (!['DOCTOR', 'NUTRITIONIST'].includes(actor.role)) throw new ForbiddenException('仅医生或营养师可执行此操作');
  }

  private async assertNutritionCare(actor: Actor, patientId: string) {
    this.assertPractitioner(actor);
    if (actor.role === 'NUTRITIONIST') {
      const enrollment = await this.prisma.careEnrollment.findUnique({ where: { patientId }, select: { nutritionistId: true } });
      if (enrollment) {
        if (enrollment.nutritionistId !== actor.sub) throw new ForbiddenException('只能访问健管师分配给本人的客户');
        return;
      }
    }
    // Keep existing active care relationships usable for patients not enrolled yet.
    await this.clinical.assertCare(actor, patientId);
  }

  private async assertReadCare(actor: Actor, patientId: string) { if (actor.role === 'HEALTH_MANAGER') return this.clinical.assertCare(actor,patientId); return this.assertNutritionCare(actor,patientId); }

  private safeText(value: unknown) {
    if (typeof value !== 'string') return null;
    return value
      .replace(/(?:\+?86[-\s]?)?1[3-9]\d{9}/g, '[手机号已隐藏]')
      .replace(/\b[1-9]\d{16}[\dXx]\b/g, '[身份信息已隐藏]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已隐藏]')
      .replace(/https?:\/\/[^\s<]+/gi, '[外部链接已隐藏]');
  }

  private reviewView(review: any, redact: boolean) {
    return {
      id: review.id, healthRecordId: review.healthRecordId,
      comment: redact ? this.safeText(review.comment) : review.comment,
      createdAt: review.createdAt, updatedAt: review.updatedAt,
      practitioner: review.practitioner ? { id: review.practitioner.id, displayName: review.practitioner.displayName, role: review.practitioner.role } : undefined,
      replies: (review.replies ?? []).map((reply: any) => ({ id: reply.id, reviewId: reply.reviewId, comment: redact ? this.safeText(reply.comment) : reply.comment, createdAt: reply.createdAt, authorRole: 'PATIENT' })),
    };
  }

  async patientRecords(req: Request, patientId: string, query: NutritionRecordQueryDto) {
    const actor = await this.clinical.actor(req);
    await this.assertReadCare(actor, patientId);
    if (query.recordType && !['WEIGHT', 'DIET', 'SLEEP'].includes(query.recordType)) throw new BadRequestException('营养工作台仅支持体重、饮食与睡眠记录');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where = { patientId, recordType: query.recordType ? query.recordType : { in: ['WEIGHT', 'DIET', 'SLEEP'] as ('WEIGHT' | 'DIET' | 'SLEEP')[] } };
    const [rows, total] = await Promise.all([
      this.prisma.healthRecord.findMany({
        where,
        select: {
          id: true, recordType: true, weightKg: true, waistCm: true, hipCm: true, bodyFatPct: true, sleepHours: true,
          mealType: true, mealItems: true, caloriesKcal: true, caloriesSource: true, note: true, measuredAt: true, createdAt: true, updatedAt: true,
          assets: { where: { scope: 'DIET_IMAGE', referenceType: 'HEALTH_RECORD', status: 'READY', deletedAt: null }, select: { id: true, referenceId: true, ownerId: true } },
          reviews: { include: { practitioner: { select: { id: true, displayName: true, role: true } }, replies: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { measuredAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.healthRecord.count({ where }),
    ]);
    return { items: rows.map((row) => ({
      id: row.id, recordType: row.recordType, measuredAt: row.measuredAt, recordedAt: row.measuredAt, createdAt: row.createdAt, updatedAt: row.updatedAt,
      weightKg: row.weightKg == null ? null : Number(row.weightKg), weightUnit: 'kg',
      waistCm: row.waistCm == null ? null : Number(row.waistCm), hipCm: row.hipCm == null ? null : Number(row.hipCm),
      bodyFatPct: row.bodyFatPct == null ? null : Number(row.bodyFatPct), sleepHours: row.sleepHours == null ? null : Number(row.sleepHours),
      mealType: row.mealType, caloriesKcal: row.caloriesKcal == null ? null : Number(row.caloriesKcal), caloriesSource: row.caloriesSource ?? (row.caloriesKcal == null ? 'UNKNOWN' : 'LEGACY'),
      note: this.safeText(row.note),
      mealItems: Array.isArray(row.mealItems) ? row.mealItems.map((item: any) => ({ name: this.safeText(item?.name), weightGrams: typeof item?.weightGrams === 'number' && Number.isFinite(item.weightGrams) ? item.weightGrams : null, caloriesKcal: typeof item?.caloriesKcal === 'number' && Number.isFinite(item.caloriesKcal) ? item.caloriesKcal : null, caloriesSource: ['MANUAL', 'ESTIMATE', 'UNKNOWN'].includes(item?.caloriesSource) ? item.caloriesSource : null })) : [],
      imageAssetIds: row.recordType === 'DIET' ? row.assets.filter((asset) => asset.referenceId === row.id && asset.ownerId === patientId).map((asset) => asset.id) : [],
      reviews: row.reviews.map((review) => this.reviewView(review, actor.role === 'NUTRITIONIST')),
    })), total, page, pageSize };
  }

  async recordReviews(req: Request, recordId: string, patientId?: string) {
    const actor = await this.clinical.actor(req);
    const target = patientId ?? actor.sub;
    if (actor.role === 'PATIENT') {
      if (target !== actor.sub) throw new ForbiddenException('只能查看本人的点评历史');
    } else await this.assertReadCare(actor, target);
    const record = await this.prisma.healthRecord.findFirst({ where: { id: recordId, patientId: target, recordType: { in: ['WEIGHT', 'DIET'] } }, select: { id: true } });
    if (!record) throw new NotFoundException('体重或饮食记录不存在');
    const reviews = await this.prisma.healthRecordReview.findMany({ where: { healthRecordId: recordId }, include: { practitioner: { select: { id: true, displayName: true, role: true } }, replies: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    return { items: reviews.map((review) => this.reviewView(review, actor.role === 'NUTRITIONIST')) };
  }

  async replyToReview(req: Request, recordId: string, reviewId: string, dto: ReviewRecordDto) {
    const actor = await this.clinical.actor(req);
    if (actor.role !== 'PATIENT') throw new ForbiddenException('只有客户可以回复本人记录的点评');
    const comment = dto.comment.trim();
    if (!comment) throw new BadRequestException('回复内容不能为空');
    const review = await this.prisma.healthRecordReview.findFirst({ where: { id: reviewId, healthRecordId: recordId, healthRecord: { patientId: actor.sub } }, include: { practitioner: { select: { id: true, role: true } } } });
    if (!review) throw new NotFoundException('点评不存在');
    let notify = false;
    try {
      await this.assertNutritionCare({ ...actor, sub: review.practitionerId, role: review.practitioner.role }, actor.sub);
      notify = true;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) throw error;
    }
    return this.prisma.$transaction(async (tx) => {
      const reply = await tx.healthRecordReviewReply.create({ data: { reviewId, patientId: actor.sub, comment } });
      if (notify) await tx.notification.create({ data: { userId: review.practitionerId, type: 'GENERAL', title: '客户回复了您的点评', content: '请在客户饮食或体重记录中查看回复。', relatedType: 'HEALTH_RECORD_REVIEW', relatedId: recordId, actionPath: `/pages/doctor/patients?patientId=${actor.sub}&recordId=${recordId}` } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'HEALTH_RECORD_REVIEW_REPLY', resourceType: 'HEALTH_RECORD_REVIEW', resourceId: reviewId, metadata: { recordId } } });
      return { id: reply.id, reviewId: reply.reviewId, comment: reply.comment, createdAt: reply.createdAt, authorRole: 'PATIENT' };
    });
  }
  async templates(req: Request, query: TemplateQueryDto, admin = false) {
    const actor = await this.clinical.actor(req);
    if (admin) this.assertAdmin(actor); else this.assertPractitioner(actor);
    const active = admin
      ? query.active === undefined ? undefined : query.active === 'true'
      : true;
    return this.prisma.dietPlanTemplate.findMany({
      where: active === undefined ? {} : { active },
      include: { createdBy: { select: { id: true, displayName: true } } },
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createTemplate(req: Request, dto: CreateDietPlanTemplateDto) {
    const actor = await this.clinical.actor(req);
    this.assertAdmin(actor);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('模板名称不能为空');
    const template = await this.prisma.dietPlanTemplate.create({
      data: {
        title,
        summary: dto.summary?.trim() || null,
        content: asJson(dto.content),
        dailyCaloriesKcal: dto.dailyCaloriesKcal,
        durationDays: dto.durationDays,
        active: dto.active,
        createdById: actor.sub,
      },
    });
    await this.prisma.auditLog.create({ data: { actorId: actor.sub, action: 'DIET_PLAN_TEMPLATE_CREATE', resourceType: 'DIET_PLAN_TEMPLATE', resourceId: template.id } });
    return template;
  }

  async updateTemplate(req: Request, id: string, dto: UpdateDietPlanTemplateDto) {
    const actor = await this.clinical.actor(req);
    this.assertAdmin(actor);
    const existing = await this.prisma.dietPlanTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('饮食方案模板不存在');
    if (dto.title !== undefined && !dto.title.trim()) throw new BadRequestException('模板名称不能为空');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dietPlanTemplate.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          summary: dto.summary === undefined ? undefined : dto.summary.trim() || null,
          content: dto.content === undefined ? undefined : asJson(dto.content),
          dailyCaloriesKcal: dto.dailyCaloriesKcal,
          durationDays: dto.durationDays,
          active: dto.active,
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'DIET_PLAN_TEMPLATE_UPDATE', resourceType: 'DIET_PLAN_TEMPLATE', resourceId: id, metadata: { active: row.active } } });
      return row;
    });
    return updated;
  }

  async patientPlans(req: Request, patientId?: string) {
    const actor = await this.clinical.actor(req);
    const targetPatientId = patientId ?? actor.sub;
    if (actor.role === 'PATIENT') {
      if (targetPatientId !== actor.sub) throw new ForbiddenException('只能查看本人的饮食方案');
    } else {
      if (actor.role !== 'HEALTH_MANAGER') this.assertPractitioner(actor);
      await this.assertReadCare(actor, targetPatientId);
    }
    return this.prisma.dietPlan.findMany({
      where: { patientId: targetPatientId },
      include: {
        practitioner: { select: { id: true, displayName: true, role: true, practitionerProfile: { select: { title: true } } } },
        template: { select: { id: true, title: true } },
      },
      orderBy: [{ status: 'asc' }, { startsAt: 'desc' }, { id: 'asc' }],
      ...(actor.role === 'HEALTH_MANAGER' ? {} : { take: 50 }),
    });
  }

  async assignPlan(req: Request, patientId: string, dto: AssignDietPlanDto) {
    const actor = await this.clinical.actor(req);
    this.assertPractitioner(actor);
    await this.assertNutritionCare(actor, patientId);
    const template = dto.templateId
      ? await this.prisma.dietPlanTemplate.findFirst({ where: { id: dto.templateId, active: true } })
      : null;
    if (dto.templateId && !template) throw new NotFoundException('饮食方案模板不存在或已停用');
    const title = dto.title?.trim() || template?.title;
    const content = dto.content ?? (template?.content as Record<string, unknown> | null);
    if (!title || !content) throw new BadRequestException('请选择模板或填写完整饮食方案');
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const durationDays = template?.durationDays;
    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : durationDays ? new Date(startsAt.getTime() + durationDays * 86_400_000) : null;
    if (endsAt && endsAt <= startsAt) throw new BadRequestException('方案结束时间必须晚于开始时间');
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.dietPlan.updateMany({ where: { patientId, status: 'ACTIVE' }, data: { status: 'ENDED', endsAt: new Date() } });
      const created = await tx.dietPlan.create({
        data: {
          patientId,
          practitionerId: actor.sub,
          templateId: template?.id,
          title,
          summary: dto.summary?.trim() || template?.summary || null,
          content: asJson(content),
          instructions: dto.instructions?.trim() || null,
          startsAt,
          endsAt,
        },
        include: { practitioner: { select: { id: true, displayName: true, role: true } }, template: { select: { id: true, title: true } } },
      });
      await tx.notification.create({
        data: {
          userId: patientId,
          type: 'GENERAL',
          title: '收到新的饮食方案',
          content: `${actor.role === 'NUTRITIONIST' ? '营养师' : '医生'}已为您配置“${title}”`,
          relatedType: 'DIET_PLAN',
          relatedId: created.id,
          actionPath: '/pages/patient/record?tab=diet',
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'DIET_PLAN_ASSIGN', resourceType: 'DIET_PLAN', resourceId: created.id, metadata: { patientId, templateId: template?.id ?? null } } });
      return created;
    });
    return plan;
  }

  async reviewRecord(req: Request, patientId: string, recordId: string, dto: ReviewRecordDto) {
    const actor = await this.clinical.actor(req);
    this.assertPractitioner(actor);
    await this.assertNutritionCare(actor, patientId);
    const comment = dto.comment.trim();
    if (!comment) throw new BadRequestException('点评内容不能为空');
    const record = await this.prisma.healthRecord.findFirst({ where: { id: recordId, patientId } });
    if (!record || !['WEIGHT', 'DIET'].includes(record.recordType)) throw new NotFoundException('体重或饮食记录不存在');
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.healthRecordReview.create({
        data: { healthRecordId: recordId, practitionerId: actor.sub, comment },
        include: { practitioner: { select: { id: true, displayName: true, role: true } }, replies: true },
      });
      await tx.notification.create({
        data: {
          userId: patientId,
          type: 'GENERAL',
          title: `${record.recordType === 'DIET' ? '饮食' : '体重'}记录收到新点评`,
          content: Array.from(comment).slice(0, 180).join(''),
          relatedType: 'HEALTH_RECORD_REVIEW',
          relatedId: recordId,
          actionPath: `/pages/patient/record?tab=${record.recordType === 'DIET' ? 'diet' : 'weight'}&recordId=${recordId}`,
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'HEALTH_RECORD_REVIEW_CREATE', resourceType: 'HEALTH_RECORD', resourceId: recordId, metadata: { patientId, recordType: record.recordType } } });
      return review;
    });
  }
}

@Controller()
export class NutritionController {
  constructor(private readonly service: NutritionService) {}

  @Get('nutrition/patients/:patientId/records')
  records(@Req() req: Request, @Param('patientId') patientId: string, @Query() query: NutritionRecordQueryDto) { return this.service.patientRecords(req, patientId, query); }

  @Get('nutrition/patients/:patientId/records/:recordId/reviews')
  reviews(@Req() req: Request, @Param('patientId') patientId: string, @Param('recordId') recordId: string) { return this.service.recordReviews(req, recordId, patientId); }

  @Get(['me/health-records/:recordId/reviews', 'health-records/:recordId/reviews'])
  myReviews(@Req() req: Request, @Param('recordId') recordId: string) { return this.service.recordReviews(req, recordId); }

  @Post(['me/health-records/:recordId/reviews/:reviewId/replies', 'health-records/:recordId/reviews/:reviewId/replies'])
  reply(@Req() req: Request, @Param('recordId') recordId: string, @Param('reviewId') reviewId: string, @Body() dto: ReviewRecordDto) { return this.service.replyToReview(req, recordId, reviewId, dto); }
  @Get('diet-plan-templates')
  templates(@Req() req: Request) { return this.service.templates(req, {}); }

  @Get('diet-plans')
  myPlans(@Req() req: Request) { return this.service.patientPlans(req); }

  @Get('clinical/patients/:patientId/diet-plans')
  patientPlans(@Req() req: Request, @Param('patientId') patientId: string) { return this.service.patientPlans(req, patientId); }

  @Post('clinical/patients/:patientId/diet-plans')
  assign(@Req() req: Request, @Param('patientId') patientId: string, @Body() dto: AssignDietPlanDto) { return this.service.assignPlan(req, patientId, dto); }

  @Post('clinical/patients/:patientId/records/:recordId/review')
  review(@Req() req: Request, @Param('patientId') patientId: string, @Param('recordId') recordId: string, @Body() dto: ReviewRecordDto) {
    return this.service.reviewRecord(req, patientId, recordId, dto);
  }
}

@Controller('admin/diet-plan-templates')
export class DietPlanTemplateAdminController {
  constructor(private readonly service: NutritionService) {}

  @Get()
  list(@Req() req: Request, @Query() query: TemplateQueryDto) { return this.service.templates(req, query, true); }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateDietPlanTemplateDto) { return this.service.createTemplate(req, dto); }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateDietPlanTemplateDto) { return this.service.updateTemplate(req, id, dto); }
}
