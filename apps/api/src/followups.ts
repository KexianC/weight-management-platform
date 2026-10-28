import {
  BadRequestException,
  Body,
  ConflictException,
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
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { createHash, randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { ClinicalService } from './clinical';
import { assertFollowUpTransition, type FollowState } from './domain';
import { businessProjection } from './business-projection';
import { PrismaService } from './prisma.service';

const followTypes = ['WEIGHT', 'DIET', 'EXERCISE', 'MEDICATION', 'QUESTIONNAIRE', 'GENERAL', 'OFFLINE', 'PHONE'] as const;
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const followStatuses = ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE', 'COMPLETED', 'CANCELLED'] as const;
const asJson = (value: unknown) => value === undefined || value === null ? undefined : value as Prisma.InputJsonValue;
const notificationText = (value: string | null | undefined, fallback: string) =>
  Array.from(value?.trim() || fallback).slice(0, 500).join('');

class FollowQueryDto {
  @IsString() @IsOptional() patientId?: string;
  @IsIn(followStatuses) @IsOptional() status?: typeof followStatuses[number];
  @IsIn(followTypes) @IsOptional() followType?: typeof followTypes[number];
  @IsDateString() @IsOptional() startAt?: string;
  @IsDateString() @IsOptional() endAt?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 30;
}

class CreateFollowDto {
  @IsString() @IsOptional() patientId?: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @IsOptional() patientIds?: string[];
  @IsIn(followTypes) @IsOptional() followType?: typeof followTypes[number];
  @IsIn(followTypes) @IsOptional() type?: typeof followTypes[number];
  @IsIn(priorities) @IsOptional() priority: typeof priorities[number] = 'NORMAL';
  @IsDateString() scheduledAt!: string;
  @IsString() @MaxLength(5000) @IsOptional() note?: string;
  @IsString() @MaxLength(5000) @IsOptional() instructions?: string;
  @IsObject() @IsOptional() recurrence?: Record<string, unknown>;
  @IsObject() @IsOptional() recurrenceRule?: Record<string, unknown>;
}

class UpdateFollowDto {
  @IsIn(followTypes) @IsOptional() followType?: typeof followTypes[number];
  @IsIn(followTypes) @IsOptional() type?: typeof followTypes[number];
  @IsIn(priorities) @IsOptional() priority?: typeof priorities[number];
  @IsDateString() @IsOptional() scheduledAt?: string;
  @IsString() @MaxLength(5000) @IsOptional() note?: string;
  @IsString() @MaxLength(5000) @IsOptional() instructions?: string;
  @IsIn(followStatuses) @IsOptional() status?: typeof followStatuses[number];
  @IsObject() @IsOptional() result?: Record<string, unknown>;
  @IsString() @MaxLength(5000) @IsOptional() summary?: string;
}

class CompleteFollowDto {
  @IsObject() @IsOptional() result?: Record<string, unknown>;
  @IsString() @MaxLength(5000) @IsOptional() summary?: string;
}

const dateWithBaseTime = (value: string, base: Date) => {
  const parsed = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) parsed.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0);
  return parsed;
};

export const followUpId = (practitionerId: string, patientId: string, type: string, scheduledAt: Date) =>
  `fu_${createHash('sha256')
    .update(`${practitionerId}\u0000${patientId}\u0000${type}\u0000${scheduledAt.toISOString()}`)
    .digest('hex')}`;

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const isoInShanghai = (value: Date | null | undefined) => {
  if (!value) return value;
  return new Date(value.getTime() + SHANGHAI_OFFSET_MS).toISOString().replace('Z', '+08:00');
};

type FollowUpDateRow = {
  scheduledAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
};

export function followUpView<T extends FollowUpDateRow>(row: T) {
  return {
    ...businessProjection(row),
    scheduledTime: isoInShanghai(row.scheduledAt),
    ...(row.startedAt === undefined ? {} : { startedAt: isoInShanghai(row.startedAt) }),
    ...(row.completedAt === undefined ? {} : { completedAt: isoInShanghai(row.completedAt) }),
    ...(row.cancelledAt === undefined ? {} : { cancelledAt: isoInShanghai(row.cancelledAt) }),
  };
}

function addMonthsClamped(date: Date, months: number, preferredDay: number) {
  const next = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(preferredDay, lastDay));
  return new Date(next.getTime() - SHANGHAI_OFFSET_MS);
}

export function recurrenceDates(base: Date, rule?: Record<string, unknown>) {
  if (!rule || Object.keys(rule).length === 0 || ['none', 'once', 'single'].includes(String(rule.type ?? rule.frequency ?? '').toLowerCase())) return [base];
  const custom = rule.customDates ?? rule.dates;
  if (Array.isArray(custom) && custom.length) {
    const rows = custom.slice(0, 100).map((value) => dateWithBaseTime(String(value), base)).filter((date) => !Number.isNaN(date.getTime()));
    return [...new Map([base, ...rows].map((date) => [date.getTime(), date])).values()].sort((a, b) => a.getTime() - b.getTime());
  }
  const frequency = String(rule.frequency ?? rule.type ?? 'weekly').toLowerCase();
  const count = Math.max(1, Math.min(100, Number(rule.count ?? rule.occurrences ?? 1)));
  const endAt = rule.endDate ? new Date(String(rule.endDate)) : null;
  const dates: Date[] = [];
  let cursor = new Date(base);
  const monthlyDay = new Date(base.getTime() + SHANGHAI_OFFSET_MS).getUTCDate();
  for (let index = 0; index < count; index += 1) {
    if (endAt && cursor > endAt) break;
    dates.push(new Date(cursor));
    if (frequency === 'daily') cursor = addCalendarDays(cursor, 1);
    else if (frequency === 'biweekly') cursor = addCalendarDays(cursor, 14);
    else if (frequency === 'monthly') cursor = addMonthsClamped(cursor, 1, monthlyDay);
    else cursor = addCalendarDays(cursor, 7);
  }
  return dates;
}

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private async rowForActor(req: Request, id: string, readOnly = false) {
    const actor = await this.clinical.actor(req);
    if (actor.role !== 'PATIENT' && actor.role !== 'HEALTH_MANAGER') this.clinical.assertPractitioner(actor);
    const row = await this.prisma.followUp.findUnique({
      where: { id },
      include: { patient: { select: { id: true, displayName: true, avatarUrl: true } }, practitioner: { select: { id: true, displayName: true, avatarUrl: true, role: true, status: true } } },
    });
    if (actor.role === 'HEALTH_MANAGER' && !readOnly) throw new ForbiddenException('健管师全量随访权限仅为只读');
    if (row && actor.role === 'HEALTH_MANAGER' && readOnly) {
      if (row.practitioner.status !== 'ACTIVE') throw new NotFoundException('随访不存在');
      await this.clinical.assertCare(actor,row.patientId);
      return {actor,row};
    }
    if (!row || (actor.role === 'PATIENT' ? row.patientId !== actor.sub : row.practitionerId !== actor.sub)) throw new NotFoundException('随访不存在');
    return { actor, row };
  }

  async list(req: Request, query: FollowQueryDto) {
    const actor = await this.clinical.actor(req);
    const baseWhere = actor.role === 'PATIENT' ? { patientId: actor.sub } : actor.role === 'HEALTH_MANAGER' ? { patient: { status: 'ACTIVE' as const }, practitioner: { status: 'ACTIVE' as const } } : { practitionerId: actor.sub };
    if (actor.role !== 'PATIENT') {
      if (actor.role !== 'HEALTH_MANAGER') this.clinical.assertPractitioner(actor);
      if (query.patientId) await this.clinical.assertCare(actor, query.patientId);
    }
    if (actor.role !== 'HEALTH_MANAGER') await this.prisma.followUp.updateMany({
      where: { ...baseWhere, status: 'SCHEDULED', scheduledAt: { lt: new Date() } },
      data: { status: 'OVERDUE' },
    });
    const scheduledAt = query.startAt || query.endAt ? {
      ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
      ...(query.endAt ? { lte: new Date(query.endAt) } : {}),
    } : undefined;
    const where = {
      ...baseWhere,
      ...(actor.role !== 'PATIENT' && query.patientId ? { patientId: query.patientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.followType ? { type: query.followType } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.followUp.findMany({
        where,
        include: { patient: { select: { id: true, displayName: true, avatarUrl: true } }, practitioner: { select: { id: true, displayName: true, avatarUrl: true, role: true } } },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
        skip: (Number(query.page) - 1) * Number(query.pageSize),
        take: Number(query.pageSize),
      }),
      this.prisma.followUp.count({ where }),
    ]);
    return { items: items.map(followUpView), total, page: Number(query.page), pageSize: Number(query.pageSize) };
  }

  async create(req: Request, dto: CreateFollowDto) {
    const actor = await this.clinical.actor(req);
    this.clinical.assertPractitioner(actor);
    const patientIds = [...new Set([...(dto.patientIds ?? []), ...(dto.patientId ? [dto.patientId] : [])]
      .map((patientId) => patientId.trim())
      .filter(Boolean))];
    if (!patientIds.length) throw new BadRequestException('请至少选择一位患者');
    for (const patientId of patientIds) await this.clinical.assertCare(actor, patientId);
    const base = new Date(dto.scheduledAt);
    if (Number.isNaN(base.getTime())) throw new BadRequestException('随访时间无效');
    const rule = dto.recurrence ?? dto.recurrenceRule;
    const dates = recurrenceDates(base, rule);
    if (!dates.length) throw new BadRequestException('重复随访没有有效日期');
    if (patientIds.length * dates.length > 500) throw new BadRequestException('单次最多创建 500 条随访安排');
    const seriesId = dates.length > 1 ? randomUUID() : null;
    const type = dto.followType ?? dto.type ?? 'GENERAL';
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.followUp.findMany({
          where: {
            practitionerId: actor.sub,
            patientId: { in: patientIds },
            type,
            scheduledAt: { in: dates },
          },
          select: { id: true },
          take: 1,
        });
        if (existing.length) throw new ConflictException('已存在相同患者、类型和时间的随访安排');

        const rows = [];
        for (const patientId of patientIds) {
          for (let index = 0; index < dates.length; index += 1) {
            rows.push(await tx.followUp.create({
              data: {
                id: followUpId(actor.sub, patientId, type, dates[index]),
                patientId,
                practitionerId: actor.sub,
                type,
                priority: dto.priority,
                scheduledAt: dates[index],
                note: dto.note,
                instructions: dto.instructions,
                recurrenceSeriesId: seriesId,
                recurrenceRule: asJson(rule),
                occurrenceIndex: index,
              },
            }));
          }
          const first = rows.find((row) => row.patientId === patientId);
          await tx.notification.create({
            data: {
              userId: patientId,
              type: 'FOLLOW_UP',
              priority: dto.priority,
              title: dates.length > 1 ? `收到 ${dates.length} 次重复随访安排` : '收到新的随访安排',
              content: notificationText(dto.note, '请按计划完成随访内容。'),
              relatedType: 'FOLLOW_UP',
              relatedId: first?.id,
              actionPath: `/pages/patient/follow?followUpId=${first?.id}`,
            },
          });
        }
        await tx.auditLog.create({
          data: { actorId: actor.sub, action: 'FOLLOW_UP_CREATE', resourceType: 'FOLLOW_UP', resourceId: seriesId ?? rows[0]?.id, metadata: { patientIds, occurrences: dates.length, total: rows.length } },
        });
        return { items: rows.map(followUpView), total: rows.length, recurrenceSeriesId: seriesId };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('已存在相同患者、类型和时间的随访安排');
      }
      throw error;
    }
  }

  async detail(req: Request, id: string) {
    return followUpView((await this.rowForActor(req, id, true)).row);
  }

  async update(req: Request, id: string, dto: UpdateFollowDto) {
    const { actor, row } = await this.rowForActor(req, id);
    this.clinical.assertPractitioner(actor);
    await this.clinical.assertCare(actor, row.patientId);
    if (dto.status && dto.status !== row.status) return this.transition(req, id, dto.status, { result: dto.result, summary: dto.summary });
    if (!['SCHEDULED', 'OVERDUE'].includes(row.status)) throw new ForbiddenException('已开始或已结束随访不能修改安排');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.followUp.updateMany({
        where: { id, status: row.status },
        data: {
          type: dto.followType ?? dto.type,
          priority: dto.priority,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          note: dto.note,
          instructions: dto.instructions,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('随访状态已变化，请刷新后重试');
      const updated = await tx.followUp.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('随访不存在');
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'FOLLOW_UP_UPDATE', resourceType: 'FOLLOW_UP', resourceId: id } });
      return followUpView(updated);
    });
  }

  async transition(req: Request, id: string, next: FollowState, dto: CompleteFollowDto = {}) {
    const { actor, row } = await this.rowForActor(req, id);
    if (row.status === next) return followUpView(row);
    if (actor.role !== 'PATIENT') {
      this.clinical.assertPractitioner(actor);
    }
    await this.clinical.assertActiveRelation(row.patientId, row.practitionerId);
    if (next === 'CANCELLED' && actor.role === 'PATIENT') throw new ForbiddenException('患者不能取消医护安排的随访');
    assertFollowUpTransition(row.status as FollowState, next, actor.role);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.followUp.updateMany({
        where: { id, status: row.status },
        data: {
          status: next,
          result: asJson(dto.result),
          summary: dto.summary,
          ...(next === 'IN_PROGRESS' ? { startedAt: row.startedAt ?? new Date() } : {}),
          ...(next === 'COMPLETED' ? { completedAt: new Date(), startedAt: row.startedAt ?? new Date() } : {}),
          ...(next === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        },
      });
      if (claimed.count !== 1) throw new ConflictException('随访状态已变化，请刷新后重试');
      if (next === 'COMPLETED' && dto.result?.images !== undefined) {
        const images = dto.result.images;
        if (!Array.isArray(images) || images.length > 10) throw new BadRequestException('随访图片最多10张，须使用受控assetId');
        const ids = images.map((image: any) => {
          if (!image || typeof image !== 'object' || Array.isArray(image) || Object.keys(image).some(key=>key!=='assetId') || typeof image.assetId !== 'string' || !/^[A-Za-z0-9_-]{1,191}$/.test(image.assetId)) throw new BadRequestException('随访图片只能使用上传的assetId');
          return image.assetId as string;
        });
        if (new Set(ids).size !== ids.length) throw new BadRequestException('随访图片不能重复');
        for (const assetId of ids) {
          const asset = await tx.mediaAsset.findUnique({where:{id:assetId}});
          if (!asset || asset.ownerId !== actor.sub || asset.status !== 'READY' || !asset.mimeType.startsWith('image/') || asset.referenceId || asset.referenceType || asset.healthRecordId) throw new ForbiddenException('只可关联本人未绑定的随访图片');
          const bound = await tx.mediaAsset.updateMany({where:{id:assetId,ownerId:actor.sub,status:'READY',referenceType:null,referenceId:null,healthRecordId:null},data:{referenceType:'FOLLOW_UP',referenceId:id,scope:'FOLLOW_UP_IMAGE'}});
          if (bound.count !== 1) throw new ConflictException('随访图片已被绑定或删除，请重试');
        }
      }
      const updated = await tx.followUp.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('随访不存在');
      if (next === 'COMPLETED' && row.type === 'WEIGHT') {
        const rawWeight = dto.result?.weightKg ?? dto.result?.weight ?? (dto.result?.weightData as Record<string, unknown> | undefined)?.weightKg;
        const weightKg = Number(rawWeight);
        if (Number.isFinite(weightKg) && weightKg >= 20 && weightKg <= 400) {
          await tx.healthRecord.create({
            data: {
              patientId: row.patientId,
              recordType: 'WEIGHT',
              weightKg,
              measuredAt: new Date(),
              source: 'FOLLOW_UP',
              payload: asJson({ followUpId: row.id }),
              note: dto.summary ? notificationText(dto.summary, '') : undefined,
            },
          });
        }
      }
      const notifyUserId = actor.role === 'PATIENT' ? row.practitionerId : row.patientId;
      await tx.notification.create({
        data: {
          userId: notifyUserId,
          type: 'FOLLOW_UP',
          title: next === 'COMPLETED' ? '随访已完成' : next === 'CANCELLED' ? '随访已取消' : '随访已开始',
          content: notificationText(dto.summary || row.note, '随访状态已更新。'),
          relatedType: 'FOLLOW_UP',
          relatedId: id,
          actionPath: actor.role === 'PATIENT' ? `/pages/doctor/follow-record?id=${id}` : `/pages/patient/follow-record?id=${id}`,
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: `FOLLOW_UP_${next}`, resourceType: 'FOLLOW_UP', resourceId: id } });
      return followUpView(updated);
    });
  }

  async remove(req: Request, id: string) {
    const { actor, row } = await this.rowForActor(req, id);
    this.clinical.assertPractitioner(actor);
    if (!['SCHEDULED', 'CANCELLED'].includes(row.status)) throw new ForbiddenException('进行中或已完成随访不能删除');
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'FOLLOW_UP_DELETE', resourceType: 'FOLLOW_UP', resourceId: id } });
      const deleted = await tx.followUp.deleteMany({ where: { id, status: row.status } });
      if (deleted.count !== 1) throw new ConflictException('随访状态已变化，请刷新后重试');
    });
    return { deleted: true, id };
  }

  async stats(req: Request, query: FollowQueryDto) {
    const actor = await this.clinical.actor(req);
    const baseWhere = actor.role === 'PATIENT' ? { patientId: actor.sub } : actor.role === 'HEALTH_MANAGER' ? { patient: { status: 'ACTIVE' as const }, practitioner: { status: 'ACTIVE' as const } } : { practitionerId: actor.sub };
    if (actor.role !== 'PATIENT') {
      if (actor.role !== 'HEALTH_MANAGER') this.clinical.assertPractitioner(actor);
      if (query.patientId) await this.clinical.assertCare(actor, query.patientId);
    }
    const scheduledAt = query.startAt || query.endAt ? {
      ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
      ...(query.endAt ? { lt: new Date(query.endAt) } : {}),
    } : undefined;
    const where = {
      ...baseWhere,
      ...(actor.role !== 'PATIENT' && query.patientId ? { patientId: query.patientId } : {}),
      ...(query.followType ? { type: query.followType } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
    };
    const nowInShanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const startOfToday = new Date(Date.UTC(nowInShanghai.getUTCFullYear(), nowInShanghai.getUTCMonth(), nowInShanghai.getUTCDate()) - 8 * 60 * 60 * 1000);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const todayWhere = {
      ...baseWhere,
      ...(actor.role !== 'PATIENT' && query.patientId ? { patientId: query.patientId } : {}),
      ...(query.followType ? { type: query.followType } : {}),
      scheduledAt: { gte: startOfToday, lt: startOfTomorrow },
    };
    const [groups, today] = await Promise.all([
      this.prisma.followUp.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.followUp.count({ where: todayWhere }),
    ]);
    return { today, ...Object.fromEntries(groups.map((group) => [group.status, group._count._all])) };
  }
}

@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly service: FollowUpsService) {}

  @Get()
  list(@Req() req: Request, @Query() query: FollowQueryDto) { return this.service.list(req, query); }

  @Get('stats')
  stats(@Req() req: Request, @Query() query: FollowQueryDto) { return this.service.stats(req, query); }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateFollowDto) { return this.service.create(req, dto); }

  @Post('batch')
  batch(@Req() req: Request, @Body() dto: CreateFollowDto) { return this.service.create(req, dto); }

  @Get(':id')
  detail(@Req() req: Request, @Param('id') id: string) { return this.service.detail(req, id); }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFollowDto) { return this.service.update(req, id, dto); }

  @Post(':id/start')
  start(@Req() req: Request, @Param('id') id: string) { return this.service.transition(req, id, 'IN_PROGRESS'); }

  @Post(':id/complete')
  complete(@Req() req: Request, @Param('id') id: string, @Body() dto: CompleteFollowDto) { return this.service.transition(req, id, 'COMPLETED', dto); }

  @Post(':id/cancel')
  cancel(@Req() req: Request, @Param('id') id: string) { return this.service.transition(req, id, 'CANCELLED'); }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req, id); }
}
