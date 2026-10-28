import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException,
  Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsObject,
  IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { ClinicalService } from './clinical';
import { estimateCalories, getRangeStart } from './domain';
import { businessProjection } from './business-projection';
import { PrismaService } from './prisma.service';

const recordTypes = ['WEIGHT', 'DIET', 'EXERCISE', 'MEDICATION', 'QUESTIONNAIRE', 'GENERAL', 'BLOOD_PRESSURE', 'SYMPTOM', 'SLEEP'] as const;
const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
const calorieSources = ['MANUAL', 'ITEM_SUM', 'ITEM_SUM_PARTIAL', 'ESTIMATE', 'UNKNOWN'] as const;
const reviewInclude = {
  practitioner: { select: { id: true, displayName: true, role: true } },
  replies: { select: { id: true, reviewId: true, comment: true, createdAt: true }, orderBy: { createdAt: 'asc' as const } },
};

export class RecordQueryDto {
  @IsIn(recordTypes) @IsOptional() recordType?: typeof recordTypes[number];
  @IsDateString() @IsOptional() startAt?: string;
  @IsDateString() @IsOptional() endAt?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 30;
}

export class MealItemDto {
  @IsString() @MaxLength(191) name!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(10_000) @IsOptional() weightGrams?: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(30_000) @IsOptional() caloriesKcal?: number;
  @IsIn(['MANUAL', 'ESTIMATE', 'UNKNOWN']) @IsOptional() caloriesSource?: 'MANUAL' | 'ESTIMATE' | 'UNKNOWN';
}

export class HealthRecordDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{16,80}$/) idempotencyKey?: string;
  @IsIn(recordTypes) recordType!: typeof recordTypes[number];
  @IsDateString() @IsOptional() recordedAt?: string;
  @IsDateString() @IsOptional() measuredAt?: string;
  @IsDateString() @IsOptional() mealTime?: string;
  @IsNumber() @Min(20) @Max(400) @IsOptional() weightKg?: number;
  @IsNumber() @Min(0) @Max(1000) @IsOptional() weightValue?: number;
  @IsIn(['KG', 'JIN', 'LB', 'kg', 'jin', 'lb']) @IsOptional() weightUnit?: string;
  @IsNumber() @Min(20) @Max(300) @IsOptional() waistCm?: number;
  @IsNumber() @Min(20) @Max(300) @IsOptional() hipCm?: number;
  @IsNumber() @Min(0) @Max(24) @IsOptional() sleepHours?: number;
  @IsNumber() @Min(1) @Max(80) @IsOptional() bodyFatPct?: number;
  @IsIn(mealTypes) @IsOptional() mealType?: typeof mealTypes[number];
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MealItemDto) @IsOptional() mealItems?: MealItemDto[];
  // The client can submit the currently edited food without first pressing "add".
  @ValidateNested() @Type(() => MealItemDto) @IsOptional() draftMealItem?: MealItemDto;
  @IsNumber() @Min(0) @Max(30000) @IsOptional() caloriesKcal?: number;
  @IsIn(calorieSources) @IsOptional() caloriesSource?: typeof calorieSources[number];
  // Compatibility alias: imageUrls contains asset IDs, never external URLs.
  @IsArray() @ArrayMaxSize(9) @IsString({ each: true }) @IsOptional() imageUrls?: string[];
  @IsArray() @ArrayMaxSize(9) @IsString({ each: true }) @IsOptional() imageAssetIds?: string[];
  @IsObject() @IsOptional() payload?: Record<string, unknown>;
  @IsString() @MaxLength(500) @IsOptional() note?: string;
  @IsString() @MaxLength(32) @IsOptional() source?: string;
  @IsNumber() @IsOptional() bmi?: number;
}

export class HealthRecordPatchDto extends HealthRecordDto {
  @IsOptional() @IsIn(recordTypes) recordType: typeof recordTypes[number] = undefined!;
  @IsDateString() @IsOptional() expectedUpdatedAt?: string;
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
const shanghaiDate = (value: Date) => new Date(value.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private recordView(record: any) {
    return {
      ...businessProjection(record),
      weightKg: decimal(record.weightKg),
      weightUnit: 'kg',
      waistCm: decimal(record.waistCm),
      hipCm: decimal(record.hipCm),
      sleepHours: decimal(record.sleepHours),
      bodyFatPct: decimal(record.bodyFatPct),
      caloriesKcal: decimal(record.caloriesKcal),
      caloriesSource: record.caloriesSource ?? (record.caloriesKcal == null ? 'UNKNOWN' : 'LEGACY'),
      recordedAt: record.measuredAt,
      imageAssetIds: Array.isArray(record.imageUrls) ? record.imageUrls.filter((id:unknown)=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,191}$/.test(id)) : [],
      legacyMediaUnlinked: Array.isArray(record.imageUrls)&&record.imageUrls.some((id:unknown)=>typeof id!=='string'||! /^[A-Za-z0-9_-]{1,191}$/.test(id)),
    };
  }

  private number(value: unknown, min: number, max: number, label: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw new BadRequestException(`${label}必须为 ${min} 至 ${max} 的有效数值`);
    }
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private normalizeRecord(input: HealthRecordDto, validateImages = true) {
    const dto = { ...input };
    if (!recordTypes.includes(dto.recordType)) throw new BadRequestException('健康记录类型无效');
    if (dto.weightValue !== undefined) {
      if (typeof dto.weightValue !== 'number' || !Number.isFinite(dto.weightValue)) throw new BadRequestException('体重数值无效');
      const unit = dto.weightUnit?.toUpperCase();
      if (!unit || !['KG', 'JIN', 'LB'].includes(unit)) throw new BadRequestException('请选择体重单位 kg、斤或 lb');
      const kg = dto.weightValue * (unit === 'JIN' ? 0.5 : unit === 'LB' ? 0.45359237 : 1);
      const normalized = this.number(kg, 20, 400, '体重（kg）');
      if (dto.weightKg !== undefined && Math.abs(Number(dto.weightKg) - normalized!) > 0.005) throw new BadRequestException('体重与单位换算结果不一致');
      dto.weightKg = normalized;
    } else if (dto.weightUnit !== undefined) {
      throw new BadRequestException('选择体重单位时请同时填写 weightValue');
    }
    dto.weightKg = this.number(dto.weightKg, 20, 400, '体重（kg）');
    dto.waistCm = this.number(dto.waistCm, 20, 300, '腰围（cm）');
    dto.hipCm = this.number(dto.hipCm, 20, 300, '臀围（cm）');
    dto.bodyFatPct = this.number(dto.bodyFatPct, 1, 80, '体脂率（%）');
    dto.sleepHours = this.number(dto.sleepHours, 0, 24, '睡眠时长（小时）');
    if (dto.recordType === 'WEIGHT' && dto.weightKg === undefined) throw new BadRequestException('体重记录必须填写体重');
    if (dto.recordType === 'SLEEP' && dto.sleepHours === undefined) throw new BadRequestException('睡眠记录必须填写睡眠时长');
    if (dto.note !== undefined && (typeof dto.note !== 'string' || dto.note.length > 500)) throw new BadRequestException('文字说明最多 500 字');
    dto.note = dto.note?.trim();
    if (dto.mealItems !== undefined && !Array.isArray(dto.mealItems)) throw new BadRequestException('饮食项目格式无效');
    const items = [...(dto.mealItems ?? []), ...(dto.draftMealItem ? [dto.draftMealItem] : [])];
    if (items.length > 50) throw new BadRequestException('食物最多 50 项');
    dto.mealItems = dto.recordType === 'DIET' || dto.mealItems !== undefined ? items.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 191) throw new BadRequestException('每项食物必须填写名称');
      if (item.caloriesSource !== undefined && !['MANUAL', 'ESTIMATE', 'UNKNOWN'].includes(item.caloriesSource)) throw new BadRequestException('Invalid food calorie source');
      if (item.caloriesSource === 'UNKNOWN' && item.caloriesKcal != null) throw new BadRequestException('Unknown food calories must remain empty');
      if (item.caloriesSource && item.caloriesSource !== 'UNKNOWN' && item.caloriesKcal == null) throw new BadRequestException('Food calorie source requires a value');
      return {
        name: item.name.trim(),
        ...(item.weightGrams == null ? {} : { weightGrams: this.number(item.weightGrams, 0, 10_000, '食物重量（g）') }),
        ...(item.caloriesKcal == null ? {} : { caloriesKcal: this.number(item.caloriesKcal, 0, 30_000, '食物热量（kcal）') }),
        ...(item.caloriesSource === undefined ? {} : { caloriesSource: item.caloriesSource }),
      };
    }) : undefined;
    if (dto.imageAssetIds !== undefined && dto.imageUrls !== undefined && JSON.stringify(dto.imageAssetIds) !== JSON.stringify(dto.imageUrls)) throw new BadRequestException('附件 ID 列表不一致');
    const imageIds = dto.imageAssetIds ?? dto.imageUrls;
    if (imageIds !== undefined && validateImages) {
      if (!Array.isArray(imageIds) || imageIds.length > 9 || imageIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,191}$/.test(id.trim()))) throw new BadRequestException('请使用已上传的附件 ID，最多 9 张');
      dto.imageUrls = [...new Set(imageIds.map((id) => id.trim()))];
    }
    if (dto.recordType === 'DIET') {
      if (!dto.mealType || !mealTypes.includes(dto.mealType)) throw new BadRequestException('饮食记录必须选择餐次');
      if (!dto.note && !dto.mealItems?.length && !dto.imageUrls?.length) throw new BadRequestException('饮食记录请至少填写文字、上传照片或添加一种食物');
      if (dto.caloriesSource && !calorieSources.includes(dto.caloriesSource)) throw new BadRequestException('热量来源无效');
      if (dto.caloriesKcal != null) {
        dto.caloriesKcal = this.number(dto.caloriesKcal, 0, 30_000, '整餐热量（kcal）');
        dto.caloriesSource ??= 'MANUAL';
      } else {
        const knownItems = dto.mealItems?.filter((item) => item.caloriesKcal != null) ?? [];
        dto.caloriesKcal = knownItems.length ? this.number(knownItems.reduce((sum, item) => sum + item.caloriesKcal!, 0), 0, 30_000, '整餐热量（kcal）') : undefined;
        dto.caloriesSource = !knownItems.length ? 'UNKNOWN'
          : knownItems.length !== dto.mealItems?.length ? 'ITEM_SUM_PARTIAL'
          : knownItems.some((item) => item.caloriesSource === 'ESTIMATE') ? 'ESTIMATE' : 'ITEM_SUM';
      }
    }
    const measuredAt = new Date(dto.recordedAt ?? dto.measuredAt ?? dto.mealTime ?? new Date().toISOString());
    if (Number.isNaN(measuredAt.getTime())) throw new BadRequestException('记录时间无效');
    if (measuredAt.getTime() > Date.now() + 5 * 60_000) throw new BadRequestException('不能记录未来时间');
    return { dto, measuredAt };
  }

  private async patientActor(req: Request) {
    const actor = await this.clinical.actor(req);
    if (actor.role !== 'PATIENT') throw new ForbiddenException('只有患者可以修改本人健康记录');
    return actor;
  }

  private async attachImages(tx: Prisma.TransactionClient, ownerId: string, recordId: string, recordType: string, imageIds: string[] | undefined) {
    const ids = [...new Set(imageIds ?? [])];
    if (!ids.length) return;
    const scopes = recordType === 'DIET' ? ['DIET_IMAGE', 'PRIVATE', 'GENERAL', 'FOLLOW_UP'] : ['HEALTH_RECORD_IMAGE', 'PRIVATE', 'GENERAL', 'FOLLOW_UP'];
    const where = {
      id: { in: ids }, ownerId, status: 'READY' as const, deletedAt: null, scope: { in: scopes },
      posturePhoto: null, exerciseVideo: null,
      AND: [
        { OR: [{ healthRecordId: null }, { healthRecordId: recordId }] },
        { OR: [{ referenceType: null }, { referenceType: 'HEALTH_RECORD', referenceId: recordId }] },
      ],
    };
    const assets = await tx.mediaAsset.findMany({ where, select: { id: true } });
    if (assets.length !== ids.length) throw new BadRequestException('附件不存在、不属于本人或用途不允许；体态照和同意书不能作为饮食照片');
    const changed = await tx.mediaAsset.updateMany({
      where,
      data: { healthRecordId: recordId, referenceType: 'HEALTH_RECORD', referenceId: recordId, scope: recordType === 'DIET' ? 'DIET_IMAGE' : 'HEALTH_RECORD_IMAGE' },
    });
    if (changed.count !== ids.length) throw new ConflictException('附件状态已变化，请刷新后重试');
  }

  private data(dto: HealthRecordDto, measuredAt: Date) {
    return {
      recordType: dto.recordType, weightKg: dto.weightKg ?? null, waistCm: dto.waistCm ?? null,
      hipCm: dto.hipCm ?? null, sleepHours: dto.sleepHours ?? null, bodyFatPct: dto.bodyFatPct ?? null,
      mealType: dto.mealType ?? null, mealItems: asJson(dto.mealItems),
      caloriesKcal: dto.caloriesKcal ?? null, caloriesSource: dto.caloriesSource ?? null,
      imageUrls: asJson(dto.imageUrls), payload: asJson(dto.payload), measuredAt,
      source: dto.source ?? 'MANUAL', note: dto.note ?? null,
    };
  }

  async list(req: Request, query: RecordQueryDto) {
    const actor = await this.patientActor(req);
    if (query.startAt && query.endAt && new Date(query.startAt) > new Date(query.endAt)) throw new BadRequestException('开始时间必须早于结束时间');
    const measuredAt = query.startAt || query.endAt ? {
      ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
      ...(query.endAt ? { lte: new Date(query.endAt) } : {}),
    } : undefined;
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 30);
    const where = { patientId: actor.sub, ...(query.recordType ? { recordType: query.recordType } : {}), ...(measuredAt ? { measuredAt } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.healthRecord.findMany({ where, include: { reviews: { include: reviewInclude, orderBy: { createdAt: 'asc' } } }, orderBy: { measuredAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.healthRecord.count({ where }),
    ]);
    return { items: items.map((item) => this.recordView(item)), total, page, pageSize };
  }

  async create(req: Request, input: HealthRecordDto) {
    const actor = await this.patientActor(req);
    const { dto, measuredAt } = this.normalizeRecord(input);
    const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key,v])=>key!=='idempotencyKey'&&v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,stable(v)])):value;
    const fingerprint=createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');
    const requestKey=input.idempotencyKey||input.measuredAt||input.recordedAt||input.mealTime?createHash('sha256').update(`${actor.sub}.${input.idempotencyKey??fingerprint}`).digest('hex'):undefined;
    const check=(row:any)=>{if(row.requestFingerprint&&row.requestFingerprint!==fingerprint)throw new ConflictException('同一提交键不能用于不同记录内容');return this.recordView(row);};
    for(let attempt=0;attempt<3;attempt++){
      try{
        const record=await this.prisma.$transaction(async tx=>{
          if(requestKey){const previous=await tx.healthRecord.findUnique({where:{requestKey}});if(previous)return previous;}
          const created=await tx.healthRecord.create({data:{patientId:actor.sub,...this.data(dto,measuredAt),...(requestKey?{requestKey,requestFingerprint:fingerprint}:{})}});
          await this.attachImages(tx,actor.sub,created.id,dto.recordType,dto.imageUrls);
          await tx.auditLog.create({data:{actorId:actor.sub,action:'HEALTH_RECORD_CREATE',resourceType:'HEALTH_RECORD',resourceId:created.id,metadata:{recordType:dto.recordType}}});
          return created;
        },{isolationLevel:'Serializable'});
        return check(record);
      }catch(error){
        const code=(error as {code?:string}).code;
        if(code==='P2002'&&requestKey){const row=await this.prisma.healthRecord.findUnique({where:{requestKey}});if(row)return check(row);}
        if(code==='P2034'&&attempt<2)continue;
        throw error;
      }
    }
    throw new ConflictException('提交竞争，请使用同一提交键重试');
  }

  async detail(req: Request, id: string) {
    const actor = await this.patientActor(req);
    const record = await this.prisma.healthRecord.findFirst({ where: { id, patientId: actor.sub }, include: { reviews: { include: reviewInclude, orderBy: { createdAt: 'asc' } } } });
    if (!record) throw new NotFoundException('健康记录不存在');
    return this.recordView(record);
  }

  async update(req: Request, id: string, patch: HealthRecordPatchDto) {
    const actor = await this.patientActor(req);
    const existing = await this.prisma.healthRecord.findFirst({ where: { id, patientId: actor.sub } });
    if (!existing) throw new NotFoundException('健康记录不存在');
    if (patch.recordType && patch.recordType !== existing.recordType) throw new BadRequestException('不能更改已有记录的类型，请新建记录');
    const edits = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<HealthRecordDto>;
    const merged: HealthRecordDto = {
      recordType: existing.recordType, measuredAt: patch.recordedAt ?? patch.measuredAt ?? patch.mealTime ?? existing.measuredAt.toISOString(),
      weightKg: decimal(existing.weightKg) ?? undefined, waistCm: decimal(existing.waistCm) ?? undefined,
      hipCm: decimal(existing.hipCm) ?? undefined, sleepHours: decimal(existing.sleepHours) ?? undefined,
      bodyFatPct: decimal(existing.bodyFatPct) ?? undefined, mealType: existing.mealType ?? undefined,
      mealItems: (existing.mealItems ?? undefined) as any, caloriesKcal: decimal(existing.caloriesKcal) ?? undefined,
      caloriesSource: existing.caloriesSource as any, imageUrls: (existing.imageUrls ?? undefined) as any,
      payload: existing.payload as any, note: existing.note ?? undefined, source: existing.source,
      ...edits,
    };
    if (patch.weightValue !== undefined && patch.weightKg === undefined) merged.weightKg = undefined;
    if (patch.imageAssetIds !== undefined && patch.imageUrls === undefined) merged.imageUrls = undefined;
    if (patch.caloriesKcal !== undefined && patch.caloriesSource === undefined) merged.caloriesSource = 'MANUAL';
    if ((patch as any).caloriesKcal === null) { merged.caloriesKcal=undefined; merged.caloriesSource=undefined; }
    if ((patch.mealItems !== undefined || patch.draftMealItem !== undefined) && patch.caloriesKcal === undefined && existing.caloriesSource !== 'MANUAL') {
      merged.caloriesKcal = undefined;
      merged.caloriesSource = undefined;
    }
    const { dto, measuredAt } = this.normalizeRecord(merged, patch.imageUrls !== undefined || patch.imageAssetIds !== undefined);
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.healthRecord.updateMany({
        where: { id, patientId: actor.sub, updatedAt: patch.expectedUpdatedAt ? new Date(patch.expectedUpdatedAt) : existing.updatedAt },
        data: this.data(dto, measuredAt),
      });
      if (changed.count !== 1) throw new ConflictException('记录已被其他会话修改，请刷新后重试');
      if (patch.imageUrls !== undefined || patch.imageAssetIds !== undefined) {
        await tx.mediaAsset.updateMany({ where: { healthRecordId: id, ownerId: actor.sub, ...(dto.imageUrls?.length ? { id: { notIn: dto.imageUrls } } : {}) }, data: { healthRecordId: null, referenceType: null, referenceId: null } });
        await this.attachImages(tx, actor.sub, id, dto.recordType, dto.imageUrls);
      }
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'HEALTH_RECORD_UPDATE', resourceType: 'HEALTH_RECORD', resourceId: id } });
      const row = await tx.healthRecord.findUnique({ where: { id }, include: { reviews: { include: reviewInclude, orderBy: { createdAt: 'asc' } } } });
      if (!row) throw new NotFoundException('健康记录不存在');
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
      this.prisma.healthRecord.findFirst({ where: { patientId: actor.sub, recordType: 'WEIGHT', weightKg: { not: null } }, orderBy: { measuredAt: 'desc' } }),
    ]);
    const weights = records.filter((item) => item.recordType === 'WEIGHT' && item.weightKg !== null);
    const diets = records.filter((item) => item.recordType === 'DIET');
    const sleep = records.filter((item) => item.recordType === 'SLEEP');
    const heightCm = decimal(user?.patientProfile?.heightCm);
    const currentWeightKg = decimal(latestWeight?.weightKg);
    const targetWeightKg = decimal(user?.patientProfile?.targetWeightKg);
    const bmi = currentWeightKg && heightCm ? Number((currentWeightKg / ((heightCm / 100) ** 2)).toFixed(1)) : null;
    const mealGroups: Record<string, any[]> = { BREAKFAST: [], LUNCH: [], DINNER: [], SNACK: [] };
    for (const entry of diets) if (entry.mealType) mealGroups[entry.mealType].push(this.recordView(entry));
    const totalCalories = diets.reduce((sum, item) => sum + Number(item.caloriesKcal ?? 0), 0);
    const rangeDays = range === '90d' ? 90 : range === '30d' ? 30 : 7;
    const date = shanghaiDate(new Date());
    const todayDiets = diets.filter((item) => shanghaiDate(item.measuredAt) === date);
    const mealCounts = Object.fromEntries(mealTypes.map((type) => [type, todayDiets.filter((item) => item.mealType === type).length]));
    return {
      range, startAt: start, generatedAt: new Date(), targetWeightKg, currentWeightKg, bmi,
      weight: {
        records: weights.map((item) => this.recordView(item)),
        changeKg: weights.length > 1 ? Number((Number(weights.at(-1)?.weightKg) - Number(weights[0].weightKg)).toFixed(2)) : 0,
      },
      nutrition: {
        totalCaloriesKcal: Number(totalCalories.toFixed(1)),
        unknownMealCount: diets.filter((item) => item.caloriesKcal == null).length,
        averageDailyCaloriesKcal: Number((totalCalories / rangeDays).toFixed(1)),
        trend: diets.map((item) => ({ date: item.measuredAt, caloriesKcal: decimal(item.caloriesKcal), mealType: item.mealType })),
      },
      diet: { records: diets.map((item) => this.recordView(item)), meals: mealGroups, today: { date, timezone: 'Asia/Shanghai', mealCount: todayDiets.length, mealCounts } },
      sleep: { records: sleep.map((item) => this.recordView(item)), recordedToday: sleep.some((item) => shanghaiDate(item.measuredAt) === date), reminder: '记录昨晚睡眠时长（小时）' },
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
    const row = await this.prisma.calorieEstimate.create({ data: { userId: actor.sub, foodName: dto.foodName, amountGrams: dto.weightGrams, estimatedKcal: result.caloriesKcal, source: result.source, result, provider: 'BUILT_IN', model: 'common-food-v1', status: 'COMPLETED' } });
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
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: HealthRecordPatchDto) { return this.service.update(req, id, dto); }
  @Delete(['health-records/:id', 'me/health-records/:id'])
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req, id); }
  @Get(['reports', 'reports/health', 'reports/weight', 'reports/nutrition', 'reports/diet'])
  report(@Req() req: Request, @Query() query: ReportQueryDto) { return this.service.report(req, query.range); }
  @Get(['dashboard', 'dashboard/patient', 'workflow/me/dashboard'])
  dashboard(@Req() req: Request) { return this.service.dashboard(req); }
  @Post(['ai/calories', 'nutrition/calorie-estimates'])
  estimate(@Req() req: Request, @Body() dto: CalorieDto) { return this.service.estimate(req, dto); }
}