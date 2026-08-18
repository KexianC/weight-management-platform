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
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CareSummaryPeriod, Gender, PatientArchiveStatus, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import type { Request, Response } from 'express';
import * as QRCode from 'qrcode';
import { AuthService, type Actor } from './auth';
import { PrismaService } from './prisma.service';

class PatientQueryDto {
  @IsString() @IsOptional() search?: string;
  @IsString() @IsOptional() status?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 20;
}

const PHONE_PATTERN = /^(?:\+?86)?1[3-9]\d{9}$/;

export class CreateClinicalPatientDto {
  @IsString()
  @Matches(PHONE_PATTERN, { message: '请输入有效的手机号' })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  displayName?: string;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsNumber()
  @Min(80)
  @Max(250)
  @IsOptional()
  heightCm?: number;

  @IsNumber()
  @Min(25)
  @Max(350)
  @IsOptional()
  initialWeightKg?: number;

  @IsNumber()
  @Min(25)
  @Max(350)
  @IsOptional()
  targetWeightKg?: number;

  @IsBoolean()
  @Equals(true, { message: '请先确认患者已授权创建账号并建立照护关系' })
  patientAuthorizationConfirmed!: true;
}

export class UpsertPatientArchiveDto {
  @IsEnum(PatientArchiveStatus)
  status!: PatientArchiveStatus;

  @IsObject()
  answers!: Record<string, unknown>;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  completionPercent!: number;

  @IsDateString()
  @IsOptional()
  expectedUpdatedAt?: string;
}

export class PublishCareSummaryDto {
  @IsEnum(CareSummaryPeriod)
  periodType!: CareSummaryPeriod;

  @IsDateString()
  referenceDate!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment!: string;
}

class InviteDto {
  @IsInt() @Min(1) @Max(365) @IsOptional() validDays = 365;
  @IsInt() @Min(1) @Max(10000) @IsOptional() maxUses = 1000;
  @IsBoolean() @IsOptional() forceNew = false;
}

class EndRelationDto {
  @IsString() @MaxLength(500) @IsOptional() reason?: string;
}

const asNumber = (value: unknown) => value === null || value === undefined ? null : Number(value);
const normalizePhone = (value: string) => value.trim().replace(/^\+?86/, '');
const createArchiveNo = () => {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const suffix = randomInt(0, 36 ** 6).toString(36).padStart(6, '0').toUpperCase();
  return `TCM${date}${suffix}`;
};
const ageFromBirthDate = (birthDate: Date | null | undefined) => {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const month = now.getMonth() - birthDate.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age;
};
const calendarDate = (value: Date) => value.toISOString().slice(0, 10);
const shanghaiMidnight = (value: Date) => new Date(`${calendarDate(value)}T00:00:00+08:00`);
const summaryPeriodBounds = (periodType: CareSummaryPeriod, referenceDate: string) => {
  const [year, month, day] = referenceDate.slice(0, 10).split('-').map(Number);
  const reference = new Date(Date.UTC(year, month - 1, day, 12));
  if (!Number.isFinite(reference.getTime())) throw new BadRequestException('统计日期无效');
  let startCalendar: Date;
  let endCalendar: Date;
  if (periodType === CareSummaryPeriod.WEEKLY) {
    const mondayOffset = (reference.getUTCDay() + 6) % 7;
    startCalendar = new Date(reference);
    startCalendar.setUTCDate(reference.getUTCDate() - mondayOffset);
    endCalendar = new Date(startCalendar);
    endCalendar.setUTCDate(startCalendar.getUTCDate() + 6);
  } else {
    startCalendar = new Date(Date.UTC(year, month - 1, 1, 12));
    endCalendar = new Date(Date.UTC(year, month, 0, 12));
  }
  const nextCalendar = new Date(endCalendar);
  nextCalendar.setUTCDate(endCalendar.getUTCDate() + 1);
  return {
    periodStart: shanghaiMidnight(startCalendar),
    periodEnd: shanghaiMidnight(endCalendar),
    endExclusive: shanghaiMidnight(nextCalendar),
    days: Math.round((nextCalendar.getTime() - startCalendar.getTime()) / 86_400_000),
  };
};

@Injectable()
export class ClinicalService {
  constructor(readonly prisma: PrismaService, private readonly auth: AuthService) {}

  actor(req: Request) {
    return this.auth.actor(req);
  }

  assertPractitioner(actor: Actor) {
    this.auth.assertRole(actor, 'DOCTOR', 'NUTRITIONIST');
  }

  async assertCare(actor: Actor, patientId: string) {
    if (actor.role === 'PATIENT' && actor.sub === patientId) return;
    if (!['DOCTOR', 'NUTRITIONIST'].includes(actor.role)) throw new ForbiddenException('无权访问患者健康数据');
    await this.assertActiveRelation(patientId, actor.sub);
  }

  async assertActiveRelation(patientId: string, practitionerId: string) {
    const relation = await this.prisma.careRelation.findFirst({
      where: { patientId, practitionerId, status: 'ACTIVE' },
    });
    if (!relation) throw new ForbiddenException('不存在有效照护关系');
    return relation;
  }

  async assertPeer(actor: Actor, peerId: string) {
    if (actor.sub === peerId) throw new ForbiddenException('不能给自己发送消息');
    const patientId = actor.role === 'PATIENT' ? actor.sub : peerId;
    const practitionerId = actor.role === 'PATIENT' ? peerId : actor.sub;
    if (!['PATIENT', 'DOCTOR', 'NUTRITIONIST'].includes(actor.role)) throw new ForbiddenException();
    const relation = await this.prisma.careRelation.findFirst({
      where: { patientId, practitionerId, status: 'ACTIVE' },
    });
    if (!relation) throw new ForbiddenException('解绑后不能继续发送消息');
    return relation;
  }

  private patientView(row: any) {
    const profile = row.patientProfile;
    const latestRecord = row.healthRecords?.find((record: any) => record.recordType === 'WEIGHT' && record.weightKg !== null)
      ?? row.healthRecords?.[0]
      ?? null;
    const heightCm = asNumber(profile?.heightCm);
    const currentWeightKg = asNumber(latestRecord?.weightKg);
    const targetWeightKg = asNumber(profile?.targetWeightKg);
    const bmi = heightCm && currentWeightKg ? Number((currentWeightKg / ((heightCm / 100) ** 2)).toFixed(1)) : null;
    const lastRecordAt = latestRecord?.measuredAt ?? null;
    const daysSinceRecord = lastRecordAt ? (Date.now() - new Date(lastRecordAt).getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    const hasOverdue = row.followUpsAsPatient?.some((follow: any) =>
      follow.status === 'OVERDUE' || (follow.status === 'SCHEDULED' && new Date(follow.scheduledAt).getTime() < Date.now()));
    const completedGoal = currentWeightKg !== null && targetWeightKg !== null && currentWeightKg <= targetWeightKg;
    const attention = !completedGoal && (daysSinceRecord > 14 || hasOverdue || (bmi !== null && bmi >= 28));
    const active = daysSinceRecord <= 7;
    return {
      id: row.id,
      displayName: row.displayName,
      phone: row.phone,
      phoneMasked: row.phone.length >= 7 ? `${row.phone.slice(0, 3)}****${row.phone.slice(-4)}` : row.phone,
      avatarUrl: row.avatarUrl,
      gender: profile?.gender ?? 'UNKNOWN',
      birthDate: profile?.birthDate ?? null,
      age: ageFromBirthDate(profile?.birthDate),
      heightCm,
      currentWeightKg,
      initialWeightKg: asNumber(profile?.initialWeightKg),
      targetWeightKg,
      bmi,
      medicalHistory: profile?.medicalHistory ?? [],
      latestRecordAt: lastRecordAt,
      active,
      attention,
      completedGoal,
      pendingTaskCount: row.receivedTasks?.filter((task: any) => ['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(task.status)).length ?? 0,
      pendingFollowUpCount: row.followUpsAsPatient?.filter((follow: any) => ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'].includes(follow.status)).length ?? 0,
      relation: row.patientRelations?.[0] ?? undefined,
      archiveStatus: row.patientArchive?.status ?? null,
      archiveCompletionPercent: row.patientArchive?.completionPercent ?? null,
      archiveUpdatedAt: row.patientArchive?.updatedAt?.toISOString?.() ?? row.patientArchive?.updatedAt ?? null,
    };
  }

  private careSummaryView(row: any) {
    return {
      id: row.id,
      patientId: row.patientId,
      practitionerId: row.practitionerId,
      periodType: row.periodType,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      metrics: row.metrics,
      comment: row.comment,
      publishedAt: row.publishedAt,
      updatedAt: row.updatedAt,
      practitioner: row.practitioner ? {
        id: row.practitioner.id,
        displayName: row.practitioner.displayName,
        role: row.practitioner.role,
        hospital: row.practitioner.practitionerProfile?.hospital,
        department: row.practitioner.practitionerProfile?.department,
        title: row.practitioner.practitionerProfile?.title,
      } : undefined,
    };
  }

  async patientCareSummaries(actor: Actor, patientId: string) {
    await this.assertCare(actor, patientId);
    const rows = await this.prisma.careSummary.findMany({
      where: { patientId },
      include: { practitioner: { include: { practitionerProfile: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => this.careSummaryView(row));
  }

  async myCareSummaries(actor: Actor) {
    if (actor.role !== 'PATIENT') throw new ForbiddenException('仅患者可查看本人周期总结');
    return this.patientCareSummaries(actor, actor.sub);
  }

  async publishCareSummary(actor: Actor, patientId: string, dto: PublishCareSummaryDto, req?: Request) {
    this.assertPractitioner(actor);
    await this.assertActiveRelation(patientId, actor.sub);
    const { periodStart, periodEnd, endExclusive, days } = summaryPeriodBounds(dto.periodType, dto.referenceDate);
    const [records, tasks] = await Promise.all([
      this.prisma.healthRecord.findMany({
        where: { patientId, measuredAt: { gte: periodStart, lt: endExclusive } },
        orderBy: { measuredAt: 'asc' },
      }),
      this.prisma.patientTask.findMany({
        where: { patientId, createdAt: { gte: periodStart, lt: endExclusive } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const weights = records.filter((record) => record.recordType === 'WEIGHT' && record.weightKg !== null);
    const diets = records.filter((record) => record.recordType === 'DIET');
    const exercises = records.filter((record) => record.recordType === 'EXERCISE');
    const startingWeightKg = weights.length ? asNumber(weights[0].weightKg) : null;
    const endingWeightKg = weights.length ? asNumber(weights.at(-1)?.weightKg) : null;
    const totalCaloriesKcal = diets.reduce((sum, record) => sum + Number(record.caloriesKcal ?? 0), 0);
    const metrics = {
      recordCount: records.length,
      weightRecordCount: weights.length,
      startingWeightKg,
      endingWeightKg,
      weightChangeKg: startingWeightKg !== null && endingWeightKg !== null
        ? Number((endingWeightKg - startingWeightKg).toFixed(2))
        : null,
      dietRecordCount: diets.length,
      totalCaloriesKcal: Number(totalCaloriesKcal.toFixed(1)),
      averageDailyCaloriesKcal: Number((totalCaloriesKcal / days).toFixed(1)),
      exerciseRecordCount: exercises.length,
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((task) => task.status === 'COMPLETED').length,
    };
    const comment = dto.comment.trim();
    const periodLabel = dto.periodType === CareSummaryPeriod.WEEKLY ? '每周总结' : '每月总结';

    return this.prisma.$transaction(async (tx) => {
      const relation = await tx.careRelation.findFirst({
        where: { patientId, practitionerId: actor.sub, status: 'ACTIVE' },
      });
      if (!relation) throw new ForbiddenException('不存在有效照护关系');
      const unique = {
        patientId_practitionerId_periodType_periodStart: {
          patientId,
          practitionerId: actor.sub,
          periodType: dto.periodType,
          periodStart,
        },
      };
      const existing = await tx.careSummary.findUnique({ where: unique });
      const summary = await tx.careSummary.upsert({
        where: unique,
        create: {
          patientId,
          practitionerId: actor.sub,
          periodType: dto.periodType,
          periodStart,
          periodEnd,
          metrics: metrics as Prisma.InputJsonValue,
          comment,
        },
        update: {
          periodEnd,
          metrics: metrics as Prisma.InputJsonValue,
          comment,
          publishedAt: new Date(),
        },
        include: { practitioner: { include: { practitionerProfile: true } } },
      });
      await tx.notification.create({
        data: {
          userId: patientId,
          type: 'GENERAL',
          priority: 'NORMAL',
          title: `${periodLabel}${existing ? '已更新' : '已发布'}`,
          content: `医护点评：${Array.from(comment).slice(0, 450).join('')}`,
          relatedType: 'CARE_SUMMARY',
          relatedId: summary.id,
          actionPath: '/pages/patient/report',
          metadata: {
            periodType: dto.periodType,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: existing ? 'CARE_SUMMARY_UPDATE' : 'CARE_SUMMARY_PUBLISH',
          resourceType: 'CARE_SUMMARY',
          resourceId: summary.id,
          ipAddress: req?.ip || req?.socket?.remoteAddress,
          metadata: { patientId, periodType: dto.periodType, periodStart: periodStart.toISOString() },
        },
      });
      return this.careSummaryView(summary);
    });
  }

  private patientInclude(actorId: string) {
    return {
      patientProfile: true,
      patientArchive: {
        select: { status: true, completionPercent: true, updatedAt: true },
      },
      patientRelations: { where: { practitionerId: actorId, status: 'ACTIVE' }, take: 1 },
      healthRecords: { where: { recordType: 'WEIGHT' }, orderBy: { measuredAt: 'desc' }, take: 30 },
      receivedTasks: { where: { assignedById: actorId }, orderBy: { createdAt: 'desc' }, take: 30 },
      followUpsAsPatient: { where: { practitionerId: actorId }, orderBy: { scheduledAt: 'desc' }, take: 50 },
    } as const;
  }

  async patients(actor: Actor, query: PatientQueryDto = new PatientQueryDto()) {
    this.assertPractitioner(actor);
    const search = query.search?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        role: 'PATIENT',
        status: 'ACTIVE',
        patientRelations: { some: { practitionerId: actor.sub, status: 'ACTIVE' } },
        ...(search ? { OR: [{ displayName: { contains: search } }, { phone: { contains: search } }] } : {}),
      },
      include: this.patientInclude(actor.sub),
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
    let items = rows.map((row) => this.patientView(row));
    if (query.status === 'active') items = items.filter((item) => item.active);
    if (query.status === 'attention') items = items.filter((item) => item.attention);
    if (query.status === 'completed') items = items.filter((item) => item.completedGoal);
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);
    const total = items.length;
    items = items.slice((page - 1) * pageSize, page * pageSize);
    return { items, total, page, pageSize };
  }

  async createPatient(actor: Actor, dto: CreateClinicalPatientDto, req?: Request) {
    this.assertPractitioner(actor);
    const phone = normalizePhone(dto.phone);
    const ipAddress = req?.ip || req?.socket?.remoteAddress;

    const persist = () => this.prisma.$transaction(async (tx) => {
      let accountCreated = false;
      let relationCreated = false;
      let relationActivated = false;
      let patient = await tx.user.findUnique({
        where: { phone_role: { phone, role: 'PATIENT' } },
        include: { patientProfile: true },
      });

      if (patient) {
        if (patient.status !== 'ACTIVE') {
          throw new ConflictException('该患者账号已停用，无法建立照护关系');
        }
        if (!patient.patientProfile) {
          await tx.patientProfile.create({ data: { userId: patient.id } });
        }
      } else {
        accountCreated = true;
        patient = await tx.user.create({
          data: {
            phone,
            passwordHash: null,
            displayName: dto.displayName?.trim() || `尾号${phone.slice(-4)}患者`,
            role: 'PATIENT',
            patientProfile: {
              create: {
                gender: dto.gender,
                birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
                heightCm: dto.heightCm,
                initialWeightKg: dto.initialWeightKg,
                targetWeightKg: dto.targetWeightKg,
              },
            },
          },
          include: { patientProfile: true },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.sub,
            action: 'PATIENT_ACCOUNT_AUTO_REGISTER',
            resourceType: 'USER',
            resourceId: patient.id,
            ipAddress,
            metadata: {
              patientAuthorizationConfirmed: true,
              authentication: 'SMS_LOGIN_OR_PASSWORD_RESET',
            },
          },
        });
      }

      const existingRelation = await tx.careRelation.findUnique({
        where: {
          patientId_practitionerId: {
            patientId: patient.id,
            practitionerId: actor.sub,
          },
        },
      });

      let relation = existingRelation;
      if (!existingRelation) {
        relationCreated = true;
        relationActivated = true;
        relation = await tx.careRelation.create({
          data: {
            patientId: patient.id,
            practitionerId: actor.sub,
            status: 'ACTIVE',
            bindMethod: 'PRACTITIONER_ASSISTED',
            note: '医生/营养师确认已取得患者线下授权',
          },
        });
      } else if (existingRelation.status !== 'ACTIVE') {
        const activated = await tx.careRelation.updateMany({
          where: { id: existingRelation.id, status: existingRelation.status },
          data: {
            status: 'ACTIVE',
            bindMethod: 'PRACTITIONER_ASSISTED',
            note: '医生/营养师确认已取得患者线下授权',
            endedAt: null,
            endedReason: null,
          },
        });
        relation = await tx.careRelation.findUnique({ where: { id: existingRelation.id } });
        if (!relation) throw new ConflictException('照护关系创建失败，请重试');
        if (activated.count === 1) {
          relationActivated = true;
        } else if (relation.status !== 'ACTIVE') {
          throw new ConflictException('照护关系状态已变化，请重试');
        }
      }

      if (!relation) throw new ConflictException('照护关系创建失败，请重试');

      if (relationActivated) {
        await tx.notification.create({
          data: {
            userId: patient.id,
            type: 'RELATION',
            title: '照护关系已建立',
            content: '医生/营养师已将您加入照护列表，请登录后完善账号资料。',
            relatedType: 'CARE_RELATION',
            relatedId: relation.id,
            actionPath: '/pages/patient/index',
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.sub,
            action: existingRelation ? 'CARE_RELATION_REACTIVATE_ASSISTED' : 'CARE_RELATION_CREATE_ASSISTED',
            resourceType: 'CARE_RELATION',
            resourceId: relation.id,
            ipAddress,
            metadata: {
              patientId: patient.id,
              patientAuthorizationConfirmed: true,
              bindMethod: 'PRACTITIONER_ASSISTED',
            },
          },
        });
      }

      const patientConsent = await tx.consent.findFirst({
        where: {
          userId: patient.id,
          scope: 'TERMS_AND_PRIVACY',
          revokedAt: null,
        },
        select: { id: true },
      });
      const row = await tx.user.findUnique({
        where: { id: patient.id },
        include: this.patientInclude(actor.sub),
      });
      if (!row) throw new ConflictException('患者账号创建失败，请重试');

      const patientConsentRequired = !patientConsent;
      return {
        patient: this.patientView(row),
        relation,
        accountCreated,
        relationCreated,
        relationActivated,
        passwordSetupRequired: !patient.passwordHash,
        patientConsentRequired,
        nextStep: patientConsentRequired
          ? 'PATIENT_SMS_LOGIN_AND_COMPLETE_ONBOARDING'
          : accountCreated
            ? 'PATIENT_SMS_LOGIN_OR_PASSWORD_RESET'
            : 'ACCOUNT_REUSED',
        message: accountCreated
          ? '患者账号与照护关系已创建，请患者使用手机号验证码登录后完善资料并按页面提示确认协议。'
          : relationActivated
            ? '已使用现有患者账号并建立照护关系。'
            : '该患者已在您的照护列表中。',
      };
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await persist();
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError
          && ['P2002', 'P2034'].includes(error.code);
        if (!retryable || attempt === 1) throw error;
      }
    }
    throw new ConflictException('患者账号创建失败，请重试');
  }

  async patient(actor: Actor, patientId: string) {
    await this.assertCare(actor, patientId);
    if (actor.role === 'PATIENT') throw new ForbiddenException('患者请通过本人资料接口访问');
    const row = await this.prisma.user.findUnique({
      where: { id: patientId },
      include: {
        ...this.patientInclude(actor.sub),
        healthRecords: { orderBy: { measuredAt: 'desc' }, take: 100 },
        receivedTasks: { where: { assignedById: actor.sub }, orderBy: { createdAt: 'desc' }, take: 100 },
        followUpsAsPatient: { where: { practitionerId: actor.sub }, orderBy: { scheduledAt: 'desc' }, take: 100 },
      },
    });
    if (!row || row.role !== 'PATIENT') throw new NotFoundException('患者不存在');
    return {
      ...this.patientView(row),
      healthRecords: row.healthRecords.map((record) => ({
        ...record,
        weightKg: asNumber(record.weightKg),
        waistCm: asNumber(record.waistCm),
        bodyFatPct: asNumber(record.bodyFatPct),
        caloriesKcal: asNumber(record.caloriesKcal),
      })),
      tasks: row.receivedTasks,
      followUps: row.followUpsAsPatient,
    };
  }

  private archiveView(row: any) {
    const iso = (value: Date | string | null | undefined) => value
      ? (value instanceof Date ? value.toISOString() : value)
      : null;
    return {
      id: row.id,
      archiveNo: row.archiveNo,
      patientId: row.patientId,
      status: row.status,
      templateVersion: row.templateVersion,
      answers: row.answers,
      completionPercent: row.completionPercent,
      createdById: row.createdById,
      updatedById: row.updatedById,
      completedAt: iso(row.completedAt),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private validateArchivePayload(dto: UpsertPatientArchiveDto) {
    let encoded: string;
    try {
      encoded = JSON.stringify(dto.answers);
    } catch {
      throw new BadRequestException('档案内容必须是有效 JSON');
    }
    if (Buffer.byteLength(encoded, 'utf8') > 512 * 1024) {
      throw new BadRequestException('档案内容超过 512KB 限制');
    }

    let nodes = 0;
    const visit = (value: unknown, depth: number) => {
      nodes += 1;
      if (nodes > 10_000 || depth > 16) {
        throw new BadRequestException('档案内容过于复杂');
      }
      if (value === null || ['string', 'boolean'].includes(typeof value)) return;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new BadRequestException('档案中的数值必须有效');
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (typeof value !== 'object') throw new BadRequestException('档案内容必须是有效 JSON');
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new BadRequestException('档案字段名无效');
        }
        visit(item, depth + 1);
      }
    };
    visit(dto.answers, 0);
  }

  async patientArchive(actor: Actor, patientId: string) {
    this.assertPractitioner(actor);
    await this.assertActiveRelation(patientId, actor.sub);
    const archive = await this.prisma.patientArchive.findUnique({ where: { patientId } });
    return { archive: archive ? this.archiveView(archive) : null };
  }

  async upsertPatientArchive(actor: Actor, patientId: string, dto: UpsertPatientArchiveDto, req?: Request) {
    this.assertPractitioner(actor);
    this.validateArchivePayload(dto);
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    const expectedUpdatedAt = dto.expectedUpdatedAt ? new Date(dto.expectedUpdatedAt) : null;

    try {
      const archive = await this.prisma.$transaction(async (tx) => {
        const relation = await tx.careRelation.findFirst({
          where: { patientId, practitionerId: actor.sub, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!relation) throw new ForbiddenException('不存在有效照护关系');

        const existing = await tx.patientArchive.findUnique({ where: { patientId } });
        if (!existing && expectedUpdatedAt) {
          throw new ConflictException('档案状态已变化，请刷新后重试');
        }
        if (existing && !expectedUpdatedAt) {
          throw new ConflictException('档案已存在，请刷新后再保存');
        }
        const completedAt = dto.status === 'COMPLETED'
          ? (existing?.completedAt ?? new Date())
          : null;

        const data = {
          status: dto.status,
          answers: dto.answers as Prisma.InputJsonObject,
          completionPercent: dto.completionPercent,
          updatedById: actor.sub,
          completedAt,
        };

        let saved;
        if (!existing) {
          saved = await tx.patientArchive.create({
            data: {
              archiveNo: createArchiveNo(),
              patientId,
              templateVersion: 'TCM_WEIGHT_V1',
              createdById: actor.sub,
              ...data,
            },
          });
        } else {
          const result = await tx.patientArchive.updateMany({
            where: { id: existing.id, updatedAt: expectedUpdatedAt! },
            data,
          });
          if (result.count !== 1) {
            throw new ConflictException('档案已被其他人更新，请刷新后重试');
          }
          saved = await tx.patientArchive.findUnique({ where: { id: existing.id } });
          if (!saved) throw new ConflictException('档案保存失败，请重试');
        }

        const action = !existing
          ? 'PATIENT_ARCHIVE_CREATE'
          : existing.status !== 'COMPLETED' && dto.status === 'COMPLETED'
            ? 'PATIENT_ARCHIVE_COMPLETE'
            : existing.status === 'COMPLETED' && dto.status === 'DRAFT'
              ? 'PATIENT_ARCHIVE_REOPEN'
              : 'PATIENT_ARCHIVE_UPDATE';
        await tx.auditLog.create({
          data: {
            actorId: actor.sub,
            action,
            resourceType: 'PATIENT_ARCHIVE',
            resourceId: saved.id,
            ipAddress,
            metadata: {
              patientId,
              status: dto.status,
              completionPercent: dto.completionPercent,
              templateVersion: saved.templateVersion,
            },
          },
        });
        return saved;
      });
      return { archive: this.archiveView(archive) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('档案已被其他会话创建，请刷新后继续编辑');
      }
      throw error;
    }
  }

  async patientRecords(actor: Actor, patientId: string, recordType?: string) {
    await this.assertCare(actor, patientId);
    const allowed = ['WEIGHT', 'DIET', 'EXERCISE', 'MEDICATION', 'QUESTIONNAIRE', 'GENERAL', 'BLOOD_PRESSURE', 'SYMPTOM'];
    return this.prisma.healthRecord.findMany({
      where: { patientId, ...(recordType && allowed.includes(recordType.toUpperCase()) ? { recordType: recordType.toUpperCase() as any } : {}) },
      orderBy: { measuredAt: 'desc' },
      take: 200,
    });
  }

  async weightTrend(actor: Actor, patientId: string) {
    await this.assertCare(actor, patientId);
    const rows = await this.prisma.healthRecord.findMany({
      where: { patientId, recordType: 'WEIGHT', weightKg: { not: null } },
      orderBy: { measuredAt: 'asc' },
      take: 180,
    });
    return rows.map((row) => ({ id: row.id, measuredAt: row.measuredAt, weightKg: asNumber(row.weightKg), bodyFatPct: asNumber(row.bodyFatPct) }));
  }

  async patientStats(actor: Actor, patientId: string) {
    const patient = await this.patient(actor, patientId);
    const completedFollowUps = patient.followUps.filter((item: any) => item.status === 'COMPLETED').length;
    return {
      currentWeightKg: patient.currentWeightKg,
      targetWeightKg: patient.targetWeightKg,
      bmi: patient.bmi,
      active: patient.active,
      attention: patient.attention,
      totalRecords: patient.healthRecords.length,
      totalFollowUps: patient.followUps.length,
      completedFollowUps,
      followUpCompletionRate: patient.followUps.length ? Math.round((completedFollowUps / patient.followUps.length) * 100) : 0,
    };
  }

  async summary(actor: Actor) {
    const list = await this.patients(actor, { page: 1, pageSize: 500, search: undefined, status: undefined });
    const items = list.items;
    const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
    const pendingFollowUps = await this.prisma.followUp.count({
      where: { practitionerId: actor.sub, status: { in: ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'] } },
    });
    const completedFollowUps = await this.prisma.followUp.count({ where: { practitionerId: actor.sub, status: 'COMPLETED' } });
    const totalFollowUps = pendingFollowUps + completedFollowUps;
    return {
      totalPatients: list.total,
      activePatients: items.filter((item) => item.active).length,
      attentionPatients: items.filter((item) => item.attention).length,
      completedGoals: items.filter((item) => item.completedGoal).length,
      newPatients: items.filter((item) => {
        const timestamp = item.relation?.createdAt ? new Date(item.relation.createdAt).getTime() : NaN;
        return Number.isFinite(timestamp) && timestamp >= thirtyDaysAgo;
      }).length,
      pendingFollowUps,
      completedFollowUps,
      followUpCompletionRate: totalFollowUps ? Math.round((completedFollowUps / totalFollowUps) * 100) : 0,
    };
  }
}

@Injectable()
export class CareService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private async uniqueCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      if (!(await this.prisma.careInvite.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
    throw new ConflictException('暂时无法生成绑定码，请稍后重试');
  }

  async createInvite(actor: Actor, dto: InviteDto) {
    this.clinical.assertPractitioner(actor);
    const now = new Date();
    const current = await this.prisma.careInvite.findFirst({
      where: { practitionerId: actor.sub, status: 'ACTIVE', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (current && current.useCount < current.maxUses && !dto.forceNew) return current;
    if (current && current.useCount >= current.maxUses) {
      await this.prisma.careInvite.update({ where: { id: current.id }, data: { status: 'EXPIRED' } });
    }
    if (dto.forceNew) {
      await this.prisma.careInvite.updateMany({ where: { practitionerId: actor.sub, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
    }
    return this.prisma.careInvite.create({
      data: {
        practitionerId: actor.sub,
        code: await this.uniqueCode(),
        maxUses: dto.maxUses,
        expiresAt: new Date(now.getTime() + dto.validDays * 86_400_000),
      },
    });
  }

  async invites(actor: Actor) {
    this.clinical.assertPractitioner(actor);
    return this.prisma.careInvite.findMany({ where: { practitionerId: actor.sub }, orderBy: { createdAt: 'desc' }, take: 20 });
  }

  async preview(code: string) {
    const invite = await this.prisma.careInvite.findUnique({
      where: { code },
      include: { practitioner: { include: { practitionerProfile: true } } },
    });
    if (!invite || invite.status !== 'ACTIVE' || invite.expiresAt <= new Date() || invite.useCount >= invite.maxUses) {
      throw new NotFoundException('绑定码不存在或已失效');
    }
    return {
      code: invite.code,
      expiresAt: invite.expiresAt,
      remainingUses: invite.maxUses - invite.useCount,
      practitioner: {
        id: invite.practitioner.id,
        displayName: invite.practitioner.displayName,
        role: invite.practitioner.role,
        avatarUrl: invite.practitioner.avatarUrl,
        hospital: invite.practitioner.practitionerProfile?.hospital,
        department: invite.practitioner.practitionerProfile?.department,
        title: invite.practitioner.practitionerProfile?.title,
        specialty: invite.practitioner.practitionerProfile?.specialty,
      },
    };
  }

  async bind(actor: Actor, code: string) {
    if (actor.role !== 'PATIENT') throw new ForbiddenException('只有患者可以确认绑定');
    const now = new Date();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const invite = await tx.careInvite.findUnique({ where: { code }, include: { practitioner: true } });
        if (!invite || invite.status !== 'ACTIVE' || invite.expiresAt <= now || invite.useCount >= invite.maxUses) {
          throw new ConflictException('绑定码不存在或已失效');
        }
        if (!['DOCTOR', 'NUTRITIONIST'].includes(invite.practitioner.role) || invite.practitioner.status !== 'ACTIVE') {
          throw new ConflictException('该医护账号当前不可绑定');
        }
        const existing = await tx.careRelation.findUnique({
          where: { patientId_practitionerId: { patientId: actor.sub, practitionerId: invite.practitionerId } },
        });
        if (existing?.status === 'ACTIVE') return existing;

        let relation;
        if (existing) {
          const claimed = await tx.careRelation.updateMany({
            where: { id: existing.id, status: existing.status },
            data: {
              inviteId: invite.id,
              status: 'ACTIVE',
              endedAt: null,
              endedReason: null,
              bindMethod: 'INVITE',
            },
          });
          if (claimed.count !== 1) throw new ConflictException('绑定关系状态已变化，请重试');
          relation = await tx.careRelation.findUnique({ where: { id: existing.id } });
          if (!relation) throw new ConflictException('绑定关系状态已变化，请重试');
        } else {
          relation = await tx.careRelation.create({
            data: {
              patientId: actor.sub,
              practitionerId: invite.practitionerId,
              inviteId: invite.id,
              status: 'ACTIVE',
              bindMethod: 'INVITE',
            },
          });
        }

        const consumed = await tx.careInvite.updateMany({
          where: { id: invite.id, status: 'ACTIVE', expiresAt: { gt: now }, useCount: { lt: invite.maxUses } },
          data: { useCount: { increment: 1 } },
        });
        if (consumed.count !== 1) throw new ConflictException('绑定码已被其他请求使用完毕');
        const consumedInvite = await tx.careInvite.findUnique({ where: { id: invite.id } });
        if (consumedInvite && consumedInvite.useCount >= consumedInvite.maxUses) {
          await tx.careInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
        }
        await tx.notification.create({
          data: {
            userId: invite.practitionerId,
            type: 'RELATION',
            title: '新患者已绑定',
            content: '一位患者已通过绑定码加入您的照护列表。',
            relatedType: 'CARE_RELATION',
            relatedId: relation.id,
            actionPath: `/pages/doctor/patients?patientId=${actor.sub}`,
          },
        });
        await tx.auditLog.create({
          data: { actorId: actor.sub, action: 'CARE_RELATION_BIND', resourceType: 'CARE_RELATION', resourceId: relation.id, metadata: { inviteId: invite.id } },
        });
        return relation;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const invite = await this.prisma.careInvite.findUnique({ where: { code }, select: { practitionerId: true } });
        if (invite) {
          const existing = await this.prisma.careRelation.findUnique({
            where: { patientId_practitionerId: { patientId: actor.sub, practitionerId: invite.practitionerId } },
          });
          if (existing?.status === 'ACTIVE') return existing;
        }
      }
      throw error;
    }
  }

  async practitioners(actor: Actor) {
    if (actor.role !== 'PATIENT') throw new ForbiddenException();
    return this.prisma.careRelation.findMany({
      where: { patientId: actor.sub, status: 'ACTIVE' },
      include: { practitioner: { include: { practitionerProfile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async endByPeer(actor: Actor, peerId: string, reason?: string) {
    const relation = await this.prisma.careRelation.findFirst({
      where: actor.role === 'PATIENT'
        ? { patientId: actor.sub, practitionerId: peerId, status: 'ACTIVE' }
        : { patientId: peerId, practitionerId: actor.sub, status: 'ACTIVE' },
    });
    if (!relation) throw new NotFoundException('有效照护关系不存在');
    return this.end(actor, relation.id, reason);
  }

  async end(actor: Actor, relationId: string, reason?: string) {
    const relation = await this.prisma.careRelation.findUnique({ where: { id: relationId } });
    if (!relation || ![relation.patientId, relation.practitionerId].includes(actor.sub)) throw new NotFoundException('照护关系不存在');
    if (relation.status !== 'ACTIVE') return relation;
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const ended = await tx.careRelation.updateMany({
        where: { id: relation.id, status: 'ACTIVE' },
        data: { status: 'ENDED', endedAt: now, endedReason: reason?.trim() || '由用户主动解绑' },
      });
      if (ended.count !== 1) {
        const current = await tx.careRelation.findUnique({ where: { id: relation.id } });
        if (!current) throw new NotFoundException('照护关系不存在');
        return current;
      }
      await tx.followUp.updateMany({
        where: {
          patientId: relation.patientId,
          practitionerId: relation.practitionerId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'] },
        },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      await tx.patientTask.updateMany({
        where: {
          patientId: relation.patientId,
          assignedById: relation.practitionerId,
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      const otherUserId = actor.sub === relation.patientId ? relation.practitionerId : relation.patientId;
      await tx.notification.create({
        data: { userId: otherUserId, type: 'RELATION', title: '照护关系已结束', content: '对方已结束照护关系，历史记录仍可审计查看。', relatedType: 'CARE_RELATION', relatedId: relation.id },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'CARE_RELATION_END', resourceType: 'CARE_RELATION', resourceId: relation.id } });
      const updated = await tx.careRelation.findUnique({ where: { id: relation.id } });
      if (!updated) throw new NotFoundException('照护关系不存在');
      return updated;
    });
  }
}

@Controller('clinical')
export class ClinicalController {
  constructor(private readonly service: ClinicalService) {}

  @Get(['summary', 'dashboard'])
  async summary(@Req() req: Request) { return this.service.summary(await this.service.actor(req)); }

  @Get('patients')
  async patients(@Req() req: Request, @Query() query: PatientQueryDto) { return this.service.patients(await this.service.actor(req), query); }

  @Post('patients')
  async createPatient(@Req() req: Request, @Body() dto: CreateClinicalPatientDto) {
    return this.service.createPatient(await this.service.actor(req), dto, req);
  }

  @Get('patients/:id')
  async patient(@Req() req: Request, @Param('id') id: string) { return this.service.patient(await this.service.actor(req), id); }

  @Get('patients/:id/archive')
  async archive(@Req() req: Request, @Param('id') id: string) {
    return this.service.patientArchive(await this.service.actor(req), id);
  }

  @Put('patients/:id/archive')
  async saveArchive(@Req() req: Request, @Param('id') id: string, @Body() dto: UpsertPatientArchiveDto) {
    return this.service.upsertPatientArchive(await this.service.actor(req), id, dto, req);
  }

  @Get('patients/:id/weight-trend')
  async weightTrend(@Req() req: Request, @Param('id') id: string) { return this.service.weightTrend(await this.service.actor(req), id); }

  @Get(['patients/:id/records', 'patients/:id/health-records'])
  async records(@Req() req: Request, @Param('id') id: string, @Query('type') type?: string, @Query('recordType') recordType?: string) {
    return this.service.patientRecords(await this.service.actor(req), id, recordType ?? type);
  }

  @Get('patients/:id/stats')
  async stats(@Req() req: Request, @Param('id') id: string) { return this.service.patientStats(await this.service.actor(req), id); }

  @Get('patients/:id/care-summaries')
  async careSummaries(@Req() req: Request, @Param('id') id: string) {
    return this.service.patientCareSummaries(await this.service.actor(req), id);
  }

  @Post('patients/:id/care-summaries')
  async publishCareSummary(@Req() req: Request, @Param('id') id: string, @Body() dto: PublishCareSummaryDto) {
    return this.service.publishCareSummary(await this.service.actor(req), id, dto, req);
  }
}

@Controller('care-summaries')
export class CareSummariesController {
  constructor(private readonly service: ClinicalService) {}

  @Get()
  async mine(@Req() req: Request) {
    return this.service.myCareSummaries(await this.service.actor(req));
  }
}

@Controller('care')
export class CareController {
  constructor(private readonly care: CareService, private readonly clinical: ClinicalService) {}

  @Post('invites')
  async invite(@Req() req: Request, @Body() dto: InviteDto) { return this.care.createInvite(await this.clinical.actor(req), dto); }

  @Get('invites')
  async invites(@Req() req: Request) { return this.care.invites(await this.clinical.actor(req)); }

  @Get('invites/:code')
  preview(@Param('code') code: string) { return this.care.preview(code.trim()); }

  @Get('invites/:code/qr')
  async inviteQr(@Param('code') code: string, @Res() response: Response) {
    const invite = await this.care.preview(code.trim());
    const image = await QRCode.toBuffer(JSON.stringify({
      type: 'care_invite',
      code: invite.code,
    }), {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    response
      .set({
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image);
  }

  @Post('invites/:code/bind')
  async bind(@Req() req: Request, @Param('code') code: string) { return this.care.bind(await this.clinical.actor(req), code.trim()); }

  @Get('doctors')
  async practitioners(@Req() req: Request) { return this.care.practitioners(await this.clinical.actor(req)); }

  @Get('patients')
  async patients(@Req() req: Request, @Query() query: PatientQueryDto) { return this.clinical.patients(await this.clinical.actor(req), query); }

  @Get('patients/:id')
  async patient(@Req() req: Request, @Param('id') id: string) { return this.clinical.patient(await this.clinical.actor(req), id); }

  @Get('patients/:id/stats')
  async stats(@Req() req: Request, @Param('id') id: string) { return this.clinical.patientStats(await this.clinical.actor(req), id); }

  @Delete('patients/:peerId')
  async endPeer(@Req() req: Request, @Param('peerId') peerId: string, @Body() dto: EndRelationDto) {
    return this.care.endByPeer(await this.clinical.actor(req), peerId, dto.reason);
  }

  @Delete('doctors/:doctorId')
  async endDoctor(@Req() req: Request, @Param('doctorId') doctorId: string, @Body() dto: EndRelationDto) {
    return this.care.endByPeer(await this.clinical.actor(req), doctorId, dto.reason);
  }

  @Delete('relations/:id')
  async end(@Req() req: Request, @Param('id') id: string, @Body() dto: EndRelationDto) {
    return this.care.end(await this.clinical.actor(req), id, dto.reason);
  }
}
