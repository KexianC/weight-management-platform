import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { ClinicalService } from './clinical';
import { estimateCalories, getRangeStart } from './domain';
import { PrismaService } from './prisma.service';

const recordTypes = ['WEIGHT', 'DIET', 'EXERCISE', 'MEDICATION', 'QUESTIONNAIRE', 'GENERAL', 'BLOOD_PRESSURE', 'SYMPTOM'] as const;
const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;

class RecordQueryDto {
  @IsIn(recordTypes) @IsOptional() recordType?: typeof recordTypes[number];
  @IsDateString() @IsOptional() startAt?: string;
  @IsDateString() @IsOptional() endAt?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 30;
}

class MealItemDto {
  @IsString() @MaxLength(191) name!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(10_000) @IsOptional() weightGrams?: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(30_000) @IsOptional() caloriesKcal?: number;
}

class HealthRecordDto {
  @IsIn(recordTypes) recordType!: typeof recordTypes[number];
  @IsDateString() @IsOptional() recordedAt?: string;
  @IsDateString() @IsOptional() measuredAt?: string;
  @IsDateString() @IsOptional() mealTime?: string;
  @IsNumber() @Min(20) @Max(400) @IsOptional() weightKg?: number;
  @IsNumber() @Min(20) @Max(300) @IsOptional() waistCm?: number;
  @IsNumber() @Min(1) @Max(80) @IsOptional() bodyFatPct?: number;
  @IsIn(mealTypes) @IsOptional() mealType?: typeof mealTypes[number];
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MealItemDto) @IsOptional() mealItems?: MealItemDto[];
  @IsNumber() @Min(0) @Max(30000) @IsOptional() caloriesKcal?: number;
  @IsArray() @ArrayMaxSize(9) @IsString({ each: true }) @IsOptional() imageUrls?: string[];
  @IsObject() @IsOptional() payload?: Record<string, unknown>;
  @IsString() @MaxLength(500) @IsOptional() note?: string;
  @IsString() @MaxLength(32) @IsOptional() source?: string;
  @IsNumber() @IsOptional() bmi?: number;
}

class CalorieDto {
  @IsString() @MaxLength(191) foodName!: string;
  @IsNumber() @Min(1) @Max(10000) weightGrams!: number;
}

class ReportQueryDto {
  @IsIn(['7d', '30d', '90d']) @IsOptional() range = '7d';
}

const decimal = (value: unknown) => value === null || value === undefined ? null : Number(value);
const asJson = (value: unknown) => value === undefined || value === null ? undefined : value as Prisma.InputJsonValue;

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private recordView(record: any) {
    return {
      ...record,
      weightKg: decimal(record.weightKg),
      waistCm: decimal(record.waistCm),
      bodyFatPct: decimal(record.bodyFatPct),
      caloriesKcal: decimal(record.caloriesKcal),
      recordedAt: record.measuredAt,
    };
  }

  private validateRecord(dto: HealthRecordDto) {
    if (dto.recordType === 'WEIGHT' && dto.weightKg === undefined) throw new BadRequestException('体重记录必须填写体重');
    if (dto.recordType === 'DIET' && !dto.mealType) throw new BadRequestException('饮食记录必须选择餐次');
    if (dto.recordType === 'DIET' && (!dto.mealItems || dto.mealItems.length === 0)) throw new BadRequestException('饮食记录至少包含一种食物');
    if (dto.mealItems?.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new BadRequestException('饮食项目格式无效');
    }
    if (dto.mealItems?.some((item) => {
      if (item.caloriesKcal === undefined || item.caloriesKcal === null) return false;
      const calories = Number(item.caloriesKcal);
      return !Number.isFinite(calories) || calories < 0 || calories > 30_000;
    })) {
      throw new BadRequestException('饮食项目热量无效');
    }
    const measuredAt = new Date(dto.recordedAt ?? dto.measuredAt ?? dto.mealTime ?? new Date().toISOString());
    if (Number.isNaN(measuredAt.getTime())) throw new BadRequestException('记录时间无效');
    if (measuredAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('不能记录未来时间');
    return measuredAt;
  }

  private async patientActor(req: Request) {
    const actor = await this.clinical.actor(req);
    if (actor.role !== 'PATIENT') throw new ForbiddenException('只有患者可以修改本人健康记录');
    return actor;
  }

  async list(req: Request, query: RecordQueryDto) {
    const actor = await this.patientActor(req);
    const measuredAt = query.startAt || query.endAt ? {
      ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
      ...(query.endAt ? { lte: new Date(query.endAt) } : {}),
    } : undefined;
    const where = { patientId: actor.sub, ...(query.recordType ? { recordType: query.recordType } : {}), ...(measuredAt ? { measuredAt } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.healthRecord.findMany({
        where,
        orderBy: { measuredAt: 'desc' },
        skip: (Number(query.page) - 1) * Number(query.pageSize),
        take: Number(query.pageSize),
      }),
      this.prisma.healthRecord.count({ where }),
    ]);
    return { items: items.map((item) => this.recordView(item)), total, page: Number(query.page), pageSize: Number(query.pageSize) };
  }

  async create(req: Request, dto: HealthRecordDto) {
    const actor = await this.patientActor(req);
    const measuredAt = this.validateRecord(dto);
    const caloriesKcal = dto.caloriesKcal ?? (dto.recordType === 'DIET'
      ? dto.mealItems?.reduce((sum, item) => sum + Number(item.caloriesKcal ?? 0), 0)
      : undefined);
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.healthRecord.create({
        data: {
          patientId: actor.sub,
          recordType: dto.recordType,
          weightKg: dto.weightKg,
          waistCm: dto.waistCm,
          bodyFatPct: dto.bodyFatPct,
          mealType: dto.mealType,
          mealItems: asJson(dto.mealItems),
          caloriesKcal,
          imageUrls: asJson(dto.imageUrls),
          payload: asJson(dto.payload),
          measuredAt,
          source: dto.source ?? 'MANUAL',
          note: dto.note,
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'HEALTH_RECORD_CREATE', resourceType: 'HEALTH_RECORD', resourceId: created.id, metadata: { recordType: dto.recordType } } });
      return created;
    });
    return this.recordView(record);
  }

  async detail(req: Request, id: string) {
    const actor = await this.patientActor(req);
    const record = await this.prisma.healthRecord.findFirst({ where: { id, patientId: actor.sub } });
    if (!record) throw new NotFoundException('健康记录不存在');
    return this.recordView(record);
  }

  async update(req: Request, id: string, dto: HealthRecordDto) {
    const actor = await this.patientActor(req);
    const existing = await this.prisma.healthRecord.findFirst({ where: { id, patientId: actor.sub } });
    if (!existing) throw new NotFoundException('健康记录不存在');
    const measuredAt = this.validateRecord(dto);
    const caloriesKcal = dto.caloriesKcal ?? (dto.recordType === 'DIET'
      ? dto.mealItems?.reduce((sum, item) => sum + Number(item.caloriesKcal ?? 0), 0)
      : undefined);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.healthRecord.update({
        where: { id },
        data: {
          recordType: dto.recordType,
          weightKg: dto.weightKg,
          waistCm: dto.waistCm,
          bodyFatPct: dto.bodyFatPct,
          mealType: dto.mealType,
          mealItems: asJson(dto.mealItems),
          caloriesKcal,
          imageUrls: asJson(dto.imageUrls),
          payload: asJson(dto.payload),
          measuredAt,
          source: dto.source ?? existing.source,
          note: dto.note,
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'HEALTH_RECORD_UPDATE', resourceType: 'HEALTH_RECORD', resourceId: id } });
      return row;
    });
    return this.recordView(updated);
  }

  async remove(req: Request, id: string) {
    const actor = await this.patientActor(req);
    const record = await this.prisma.healthRecord.findFirst({ where: { id, patientId: actor.sub } });
    if (!record) throw new NotFoundException('健康记录不存在');
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'HEALTH_RECORD_DELETE', resourceType: 'HEALTH_RECORD', resourceId: id, metadata: { recordType: record.recordType, measuredAt: record.measuredAt } } });
      await tx.healthRecord.delete({ where: { id } });
    });
    return { deleted: true, id };
  }

  async report(req: Request, range: string) {
    const actor = await this.patientActor(req);
    const start = getRangeStart(range);
    const [records, user, latestWeight] = await Promise.all([
      this.prisma.healthRecord.findMany({ where: { patientId: actor.sub, measuredAt: { gte: start } }, orderBy: { measuredAt: 'asc' } }),
      this.prisma.user.findUnique({ where: { id: actor.sub }, include: { patientProfile: true } }),
      this.prisma.healthRecord.findFirst({
        where: { patientId: actor.sub, recordType: 'WEIGHT', weightKg: { not: null } },
        orderBy: { measuredAt: 'desc' },
      }),
    ]);
    const weights = records.filter((item) => item.recordType === 'WEIGHT' && item.weightKg !== null);
    const diets = records.filter((item) => item.recordType === 'DIET');
    const heightCm = decimal(user?.patientProfile?.heightCm);
    const currentWeightKg = decimal(latestWeight?.weightKg);
    const targetWeightKg = decimal(user?.patientProfile?.targetWeightKg);
    const bmi = currentWeightKg && heightCm ? Number((currentWeightKg / ((heightCm / 100) ** 2)).toFixed(1)) : null;
    const mealGroups: Record<string, any[]> = { BREAKFAST: [], LUNCH: [], DINNER: [], SNACK: [] };
    for (const entry of diets) if (entry.mealType) mealGroups[entry.mealType].push(this.recordView(entry));
    const totalCalories = diets.reduce((sum, item) => sum + Number(item.caloriesKcal ?? 0), 0);
    const rangeDays = range === '90d' ? 90 : range === '30d' ? 30 : 7;
    return {
      range,
      startAt: start,
      generatedAt: new Date(),
      targetWeightKg,
      currentWeightKg,
      bmi,
      weight: {
        records: weights.map((item) => this.recordView(item)),
        changeKg: weights.length > 1 ? Number((Number(weights.at(-1)?.weightKg) - Number(weights[0].weightKg)).toFixed(2)) : 0,
      },
      nutrition: {
        totalCaloriesKcal: Number(totalCalories.toFixed(1)),
        averageDailyCaloriesKcal: Number((totalCalories / rangeDays).toFixed(1)),
        trend: diets.map((item) => ({ date: item.measuredAt, caloriesKcal: decimal(item.caloriesKcal), mealType: item.mealType })),
      },
      diet: { records: diets.map((item) => this.recordView(item)), meals: mealGroups },
    };
  }

  async dashboard(req: Request) {
    const actor = await this.patientActor(req);
    const [report, tasks, notifications, practitioners] = await Promise.all([
      this.report(req, '30d'),
      this.prisma.patientTask.findMany({ where: { patientId: actor.sub }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.notification.findMany({ where: { userId: actor.sub, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.careRelation.findMany({ where: { patientId: actor.sub, status: 'ACTIVE' }, include: { practitioner: { include: { practitionerProfile: true } } } }),
    ]);
    return { report, records: report.weight.records, tasks, notifications, practitioners };
  }

  async estimate(req: Request, dto: CalorieDto) {
    const actor = await this.patientActor(req);
    const result = estimateCalories(dto.foodName, dto.weightGrams);
    const row = await this.prisma.calorieEstimate.create({
      data: {
        userId: actor.sub,
        foodName: dto.foodName,
        amountGrams: dto.weightGrams,
        estimatedKcal: result.caloriesKcal,
        source: result.source,
        result,
        provider: 'BUILT_IN',
        model: 'common-food-v1',
        status: 'COMPLETED',
      },
    });
    return { id: row.id, ...result, foodName: dto.foodName, weightGrams: dto.weightGrams };
  }
}

@Controller()
export class RecordsController {
  constructor(private readonly service: RecordsService) {}

  @Get(['health-records', 'me/health-records'])
  list(@Req() req: Request, @Query() query: RecordQueryDto) { return this.service.list(req, query); }

  @Post(['health-records', 'me/health-records'])
  create(@Req() req: Request, @Body() dto: HealthRecordDto) { return this.service.create(req, dto); }

  @Get(['health-records/stats', 'me/health-records/stats'])
  stats(@Req() req: Request, @Query() query: ReportQueryDto) { return this.service.report(req, query.range); }

  @Get(['health-records/:id', 'me/health-records/:id'])
  detail(@Req() req: Request, @Param('id') id: string) { return this.service.detail(req, id); }

  @Patch(['health-records/:id', 'me/health-records/:id'])
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: HealthRecordDto) { return this.service.update(req, id, dto); }

  @Delete(['health-records/:id', 'me/health-records/:id'])
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req, id); }

  @Get(['reports', 'reports/health', 'reports/weight', 'reports/nutrition', 'reports/diet'])
  report(@Req() req: Request, @Query() query: ReportQueryDto) { return this.service.report(req, query.range); }

  @Get(['dashboard', 'dashboard/patient', 'workflow/me/dashboard'])
  dashboard(@Req() req: Request) { return this.service.dashboard(req); }

  @Post(['ai/calories', 'nutrition/calorie-estimates'])
  estimate(@Req() req: Request, @Body() dto: CalorieDto) { return this.service.estimate(req, dto); }
}
