import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, Equals, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Prisma, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Request } from 'express';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';

const staffRoles: UserRole[] = ['HEALTH_MANAGER', 'DOCTOR', 'NUTRITIONIST', 'EXERCISE_COACH', 'ADMIN'];
const assignmentFields = { HEALTH_MANAGER: 'healthManagerId', DOCTOR: 'doctorId', NUTRITIONIST: 'nutritionistId', EXERCISE_COACH: 'exerciseCoachId' } as const;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const patientSelect = { id: true, displayName: true, phone: true, avatarUrl: true, role: true, status: true } as const;
const shareSelect = { id: true, expiresAt: true, revokedAt: true } as const;

export class LifestyleDto {
  @IsNumber() @Min(0) @Max(24) sleepHours!: number;
  @IsIn(['LOW', 'MODERATE', 'HIGH']) activityLevel!: string;
  @IsInt() @Min(1) @Max(8) mealsPerDay!: number;
  @IsIn(['NEVER', 'FORMER', 'CURRENT']) smoking!: string;
  @IsIn(['NEVER', 'OCCASIONAL', 'FREQUENT']) alcohol!: string;
  @IsNumber() @Min(0) @Max(24) sedentaryHours!: number;
  @IsInt() @Min(0) @Max(10000) waterMl!: number;
}

export class EnrollPatientDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsString() @Matches(/^(?:\+?86)?1[3-9]\d{9}$/) phone!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) packageName!: string;
  @IsString() @IsNotEmpty() @MaxLength(191) nutritionistId!: string;
  @IsString() @IsNotEmpty() @MaxLength(191) doctorId!: string;
  @IsString() @IsNotEmpty() @MaxLength(191) exerciseCoachId!: string;
  @IsObject() @ValidateNested() @Type(() => LifestyleDto) @IsNotEmpty() lifestyle!: LifestyleDto;
}

export class BodyAssessmentDto {
  @IsDateString() measuredAt!: string;
  @IsOptional() @IsNumber() @Min(30) @Max(260) heightCm?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(500) weightKg?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(80) bodyFatPct?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(250) muscleMassKg?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(300) waistCm?: number;
  @IsOptional() @IsNumber() @Min(5) @Max(100) bmi?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(150) skeletalMuscleMassKg?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(300) hipCm?: number;
}

export class PosturePhotoDto {
  @IsString() @IsNotEmpty() @MaxLength(191) mediaAssetId!: string;
  @IsIn(['FRONT', 'SIDE', 'BACK']) view!: string;
  @IsBoolean() @Equals(true) faceProtected!: boolean;
}

export class ExerciseVideoDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsString() @IsNotEmpty() @MaxLength(191) mediaAssetId!: string;
  @IsInt() @Min(1) @Max(7200) durationSeconds!: number;
}

export class ExerciseItemDto {
  @IsString() @IsNotEmpty() @MaxLength(191) videoId!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) actionName!: string;
  @IsInt() @Min(1) @Max(20) sets!: number;
  @IsInt() @Min(1) @Max(200) reps!: number;
  @IsString() @IsNotEmpty() @MaxLength(80) tempo!: string;
  @IsInt() @Min(0) @Max(600) restSeconds!: number;
  @IsString() @IsNotEmpty() @MaxLength(80) frequency!: string;
}

export class ExerciseReportDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) assessment!: string;
  @IsOptional() @IsString() @MaxLength(1000) precautions?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ExerciseItemDto) items!: ExerciseItemDto[];
}

export class ShareExerciseReportDto {
  @IsOptional() @IsIn([1, 7, 14, 30]) expiresInDays?: number;
  @IsBoolean() @Equals(true) reviewed!: boolean;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{16,80}$/) idempotencyKey?: string;
}

export class AssignmentDto {
  @IsOptional() @IsString() @IsNotEmpty() nutritionistId?: string;
  @IsOptional() @IsString() @IsNotEmpty() doctorId?: string;
  @IsOptional() @IsString() @IsNotEmpty() exerciseCoachId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) packageName?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => LifestyleDto) lifestyle?: LifestyleDto;
}

export class UpdateExerciseVideoDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(7200) durationSeconds?: number;
}

type EnrollmentWithPatient = Prisma.CareEnrollmentGetPayload<{ include: { patient: { select: typeof patientSelect } } }>;
type LegacyNutritionClient = {
  patient: { id: string; displayName: string; role: 'PATIENT' };
  enrollment: null;
  legacyAccount: true;
  lifestyle: null;
  bodyReports: never[];
  exerciseReports: never[];
  posturePhotos: never[];
  capabilities?: never;
};

@Injectable()
export class CareManagementService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private assertRole(actor: Actor, ...roles: UserRole[]) {
    if (!roles.includes(actor.role)) throw new ForbiddenException('当前岗位无权执行此操作');
  }

  /** Self archive access is independent of managed-care enrollment. Never creates a relationship. */
  async assertSelfPatient(actor: Actor, patientId: string, database: Pick<Prisma.TransactionClient, 'user'> = this.prisma) {
    if (actor.role !== 'PATIENT' || actor.sub !== patientId) throw new ForbiddenException('只能查看本人档案');
    const patient = await database.user.findUnique({ where: { id: patientId }, select: patientSelect });
    if (!patient || patient.role !== 'PATIENT' || patient.status !== 'ACTIVE') throw new NotFoundException('客户账号不存在或已停用');
    return patient;
  }

  async assertEnrollment(actor: Actor, patientId: string) {
    const row = await this.prisma.careEnrollment.findUnique({ where: { patientId }, include: { patient: { select: patientSelect } } });
    if (!row || row.patient.status !== 'ACTIVE') throw new NotFoundException('客户档案不存在或已停用');
    if (actor.role === 'HEALTH_MANAGER') { await this.prisma.auditLog.create({ data: { actorId: actor.sub, action: 'HM_GLOBAL_CLIENT_READ', resourceType: 'PATIENT', resourceId: patientId } }); return row; }
    if (actor.role === 'ADMIN') throw new ForbiddenException('管理员不能访问客户健康档案');
    if (actor.role === 'PATIENT') {
      if (actor.sub !== patientId) throw new ForbiddenException('只能查看本人档案');
      return row;
    }
    const field = assignmentFields[actor.role as keyof typeof assignmentFields];
    if (!field || row[field] !== actor.sub) throw new ForbiddenException('该客户未分配给您');
    const relation = await this.prisma.careRelation.findUnique({ where: { patientId_practitionerId: { patientId, practitionerId: actor.sub } }, select: { status: true } });
    if (relation?.status !== 'ACTIVE') throw new ForbiddenException('服务关系已结束');
    return row;
  }

  private async assertWriteEnrollment(actor: Actor, patientId: string) {
    const row = await this.assertEnrollment(actor,patientId);
    if (actor.role === 'HEALTH_MANAGER') {
      if (row.healthManagerId !== actor.sub || row.patient.status !== 'ACTIVE') throw new ForbiddenException('全量查看仅为只读，不能修改其他健管师客户');
      const relation = await this.prisma.careRelation.findUnique({ where:{patientId_practitionerId:{patientId,practitionerId:actor.sub}},select:{status:true} });
      if (relation?.status !== 'ACTIVE') throw new ForbiddenException('写入服务关系已结束');
    }
    return row;
  }

  private projection(actor: Actor, row: EnrollmentWithPatient, activeManagerRelation = false) {
    const anonymous = ['NUTRITIONIST', 'EXERCISE_COACH'].includes(actor.role);
    return {
      patient: anonymous
        ? { id: row.patientId, displayName: row.clientCode, role: row.patient.role }
        : { id: row.patientId, displayName: row.patient.displayName, phone: row.patient.phone, avatarUrl: row.patient.avatarUrl, role: row.patient.role, status: row.patient.status },
      ...(actor.role === 'HEALTH_MANAGER' ? { capabilities: { writeManagedCare: row.patient.status === 'ACTIVE' && row.healthManagerId === actor.sub && activeManagerRelation } } : {}),
      enrollment: { id: row.id, patientId: row.patientId, clientCode: row.clientCode, packageName: row.packageName, healthManagerId: row.healthManagerId, nutritionistId: row.nutritionistId, doctorId: row.doctorId, exerciseCoachId: row.exerciseCoachId, createdAt: row.createdAt },
    };
  }

  private legacyNutritionProjection(patient: { id: string }): LegacyNutritionClient {
    return {
      patient: { id: patient.id, displayName: `客户${patient.id.slice(-8).toUpperCase()}`, role: 'PATIENT' as const },
      enrollment: null,
      legacyAccount: true,
      lifestyle: null,
      bodyReports: [],
      exerciseReports: [],
      posturePhotos: [],
    };
  }

  /** Legacy relationships never override a managed-care assignment or authorize its reports/writes. */
  private async legacyNutritionPatients(actor: Actor, patientId?: string) {
    if (actor.role !== 'NUTRITIONIST') return [];
    const practitioner = await this.prisma.user.findUnique({ where: { id: actor.sub }, select: { role: true, status: true } });
    if (!practitioner || practitioner.role !== 'NUTRITIONIST' || practitioner.status !== 'ACTIVE') {
      throw new ForbiddenException('营养师账号不存在或已停用');
    }
    return this.prisma.user.findMany({
      where: {
        ...(patientId ? { id: patientId } : {}),
        role: 'PATIENT', status: 'ACTIVE', careEnrollment: null,
        patientRelations: { some: { practitionerId: actor.sub, status: 'ACTIVE' } },
      },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async staff(req: Request) {
    this.assertRole(await this.clinical.actor(req), 'HEALTH_MANAGER', 'ADMIN');
    const rows = await this.prisma.user.findMany({ where: { role: { in: ['DOCTOR', 'NUTRITIONIST', 'EXERCISE_COACH'] }, status: 'ACTIVE' }, select: { id: true, displayName: true, role: true }, orderBy: { displayName: 'asc' }, take: 2000 });
    return { doctors: rows.filter((x) => x.role === 'DOCTOR'), nutritionists: rows.filter((x) => x.role === 'NUTRITIONIST'), exerciseCoaches: rows.filter((x) => x.role === 'EXERCISE_COACH') };
  }

  async enroll(req: Request, dto: EnrollPatientDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'HEALTH_MANAGER');
    const name = dto.name.trim();
    const packageName = dto.packageName.trim();
    if (!name || !packageName) throw new BadRequestException('客户姓名与购买套餐不能为空');
    const phone = dto.phone.replace(/^\+?86/, '');
    this.assertNoIdentity(packageName, { displayName: name, phone });
    const initialPassword = `${randomBytes(15).toString('base64url')}!9a`;
    const passwordHash = await argon2.hash(initialPassword, { type: argon2.argon2id });
    const initialPasswordExpiresAt = new Date(Date.now() + 24 * 3600000);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { phone_role: { phone, role: 'PATIENT' } }, select: { id: true } });
        if (existing) throw new ConflictException('该手机号已有客户账号，不能重复建档或覆盖已有档案');
        const assignments = [{ id: dto.doctorId, role: 'DOCTOR' }, { id: dto.nutritionistId, role: 'NUTRITIONIST' }, { id: dto.exerciseCoachId, role: 'EXERCISE_COACH' }, { id: actor.sub, role: 'HEALTH_MANAGER' }] as const;
        const staff = await tx.user.findMany({ where: { id: { in: assignments.map((x) => x.id) }, status: 'ACTIVE' }, select: { id: true, role: true } });
        if (assignments.some((a) => !staff.some((s) => s.id === a.id && s.role === a.role))) throw new BadRequestException('分配人员不存在、岗位不匹配或已停用');
        const patient = await tx.user.create({ data: { phone, displayName: name, role: 'PATIENT', passwordHash, mustChangePassword: true, initialPasswordExpiresAt, status: 'ACTIVE', patientProfile: { create: {} } } });
        await tx.careRelation.createMany({ data: assignments.map((x) => ({ patientId: patient.id, practitionerId: x.id, status: 'ACTIVE' as const, bindMethod: 'HEALTH_MANAGER_ENROLLMENT' })) });
        const enrollment = await tx.careEnrollment.create({ data: { patientId: patient.id, clientCode: `KH${randomBytes(8).toString('hex').toUpperCase()}`, packageName, healthManagerId: actor.sub, doctorId: dto.doctorId, nutritionistId: dto.nutritionistId, exerciseCoachId: dto.exerciseCoachId, lifestyle: json(dto.lifestyle) }, include: { patient: { select: patientSelect } } });
        await tx.auditLog.create({ data: { actorId: actor.sub, action: 'CARE_ENROLLMENT_CREATE', resourceType: 'CARE_ENROLLMENT', resourceId: enrollment.id } });
        return enrollment;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { ...this.projection(actor, row, true), credentials: { account: phone, initialPassword, role: 'PATIENT' as const, mustChangePassword: true, expiresAt: initialPasswordExpiresAt } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('建档信息冲突，请刷新并确认客户是否已经建档');
      throw error;
    }
  }

  async patients(req: Request) {
    const actor = await this.clinical.actor(req);
    if (actor.role === 'HEALTH_MANAGER') {
      const rows = await this.prisma.user.findMany({ where:{role:'PATIENT',status:'ACTIVE'},select:{...patientSelect,careEnrollment:true},orderBy:[{createdAt:'desc'},{id:'asc'}] });
      await this.prisma.auditLog.create({ data:{actorId:actor.sub,action:'HM_GLOBAL_CLIENT_LIST',resourceType:'PATIENT',metadata:{returnedCount:rows.length,complete:true}} });
      const relations = await this.prisma.careRelation.findMany({ where: { practitionerId: actor.sub, status: 'ACTIVE' }, select: { patientId: true } });
      const activeIds = new Set(relations.map(x => x.patientId));
      return rows.map(({careEnrollment,...patient})=>careEnrollment ? this.projection(actor,{...careEnrollment,patient} as EnrollmentWithPatient,activeIds.has(patient.id)) : {patient,enrollment:null,legacyAccount:true,capabilities:{writeManagedCare:false}});
    }
    if (actor.role === 'ADMIN') throw new ForbiddenException('管理员不能访问客户健康档案');
    const legacy = await this.legacyNutritionPatients(actor);
    const where: Prisma.CareEnrollmentWhereInput = { patient: { status: 'ACTIVE' } };
    if (actor.role === 'PATIENT') where.patientId = actor.sub;
    else {
      const field = assignmentFields[actor.role as keyof typeof assignmentFields];
      if (!field) throw new ForbiddenException('无权访问客户档案');
      where[field] = actor.sub;
      where.patient = { status: 'ACTIVE', patientRelations: { some: { practitionerId: actor.sub, status: 'ACTIVE' } } };
    }
    const rows = await this.prisma.careEnrollment.findMany({ where, include: { patient: { select: patientSelect } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    const result = new Map<string, ReturnType<CareManagementService['projection']> | ReturnType<CareManagementService['legacyNutritionProjection']>>();
    for (const row of rows) result.set(row.patientId, this.projection(actor, row));
    for (const patient of legacy) if (!result.has(patient.id)) result.set(patient.id, this.legacyNutritionProjection(patient));
    return [...result.values()];
  }

  private validShareWhere(nutritionistId: string, now = new Date()): Prisma.ExerciseReportShareWhereInput {
    return { nutritionistId, revokedAt: null, expiresAt: { gt: now }, nutritionist: { status: 'ACTIVE', role: 'NUTRITIONIST' } };
  }

  private async nutritionistActive(row: { patientId: string; nutritionistId: string }) {
    return Boolean(await this.prisma.careRelation.findFirst({ where: { patientId: row.patientId, practitionerId: row.nutritionistId, status: 'ACTIVE', practitioner: { status: 'ACTIVE', role: 'NUTRITIONIST' } }, select: { id: true } }));
  }

  async patient(req: Request, patientId: string) {
    const actor = await this.clinical.actor(req);
    const legacyNutritionPatient = (await this.legacyNutritionPatients(actor, patientId))[0];
    if (legacyNutritionPatient) return this.legacyNutritionProjection(legacyNutritionPatient);
    if (actor.role === 'PATIENT') await this.assertSelfPatient(actor, patientId);
    if (actor.role === 'HEALTH_MANAGER' || actor.role === 'PATIENT') {
      const legacy = await this.prisma.user.findUnique({where:{id:patientId},select:{...patientSelect,careEnrollment:{select:{id:true}}}});
      if (!legacy || legacy.role !== 'PATIENT' || legacy.status !== 'ACTIVE') throw new NotFoundException('客户不存在或已停用');
      if (!legacy.careEnrollment) {
        const {careEnrollment,...patient}=legacy;
        if (actor.role === 'HEALTH_MANAGER') await this.prisma.auditLog.create({data:{actorId:actor.sub,action:'HM_GLOBAL_LEGACY_READ',resourceType:'PATIENT',resourceId:patientId}});
        const [bodyReports, posturePhotos] = actor.role === 'PATIENT' ? await Promise.all([
          this.prisma.bodyAssessment.findMany({ where: { patientId }, orderBy: [{ measuredAt: 'desc' }, { id: 'asc' }], take: 100 }),
          this.prisma.posturePhoto.findMany({ where: { patientId, mediaAsset: { status: 'READY' } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100 }),
        ]) : [[], []];
        // Without an active managed-care recipient, no exercise prescription/share is authorized.
        return {patient,enrollment:null,legacyAccount:true,lifestyle:null,bodyReports,exerciseReports:[],posturePhotos};
      }
    }
    const row = await this.assertEnrollment(actor, patientId);
    const patientView = actor.role === 'PATIENT';
    const activeNutritionist = !patientView || await this.nutritionistActive(row);
    const [bodyReports, exerciseReports, posturePhotos] = await Promise.all([
      this.prisma.bodyAssessment.findMany({ where: { patientId }, orderBy: [{ measuredAt: 'desc' }, { id: 'asc' }], ...(actor.role === 'HEALTH_MANAGER' ? {} : { take: 100 }) }),
      activeNutritionist ? this.prisma.exercisePrescription.findMany({ where: { patientId, ...(patientView ? { publishedAt: { not: null }, shares: { some: this.validShareWhere(row.nutritionistId) } } : {}) }, include: { shares: { select: shareSelect } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...(actor.role === 'HEALTH_MANAGER' ? {} : { take: 100 }) }) : [],
      actor.role === 'NUTRITIONIST' ? [] : this.prisma.posturePhoto.findMany({ where: { patientId, ...(actor.role === 'EXERCISE_COACH' ? { faceProtected: true } : {}), mediaAsset: { status: 'READY' } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], ...(actor.role === 'HEALTH_MANAGER' ? {} : { take: 100 }) }),
    ]);
    const activeManagerRelation = actor.role === 'HEALTH_MANAGER' && (await this.prisma.careRelation.findUnique({ where: { patientId_practitionerId: { patientId, practitionerId: actor.sub } }, select: { status: true } }))?.status === 'ACTIVE';
    return { ...this.projection(actor, row, activeManagerRelation), lifestyle: row.lifestyle, bodyReports, exerciseReports: patientView ? exerciseReports.map(({ shares: _shares, ...report }) => report) : exerciseReports, posturePhotos };
  }

  async createBodyReport(req: Request, patientId: string, dto: BodyAssessmentDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'HEALTH_MANAGER', 'DOCTOR', 'PATIENT');
    await this.assertWriteEnrollment(actor, patientId);
    const metrics = ['heightCm', 'weightKg', 'bodyFatPct', 'muscleMassKg', 'skeletalMuscleMassKg', 'waistCm', 'hipCm', 'bmi'] as const;
    if (!metrics.some((key) => dto[key] !== undefined && dto[key] !== null)) throw new BadRequestException('至少填写一项检测指标');
    if (new Date(dto.measuredAt).getTime() > Date.now() + 60000) throw new BadRequestException('检测日期不能在未来');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.bodyAssessment.create({ data: { ...dto, measuredAt: new Date(dto.measuredAt), patientId, createdById: actor.sub } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'BODY_ASSESSMENT_CREATE', resourceType: 'BODY_ASSESSMENT', resourceId: row.id } });
      return row;
    });
  }

  private async assertUnboundAsset(tx: Prisma.TransactionClient, actor: Actor, mediaAssetId: string, kind: 'image/' | 'video/') {
    const asset = await tx.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset || asset.ownerId !== actor.sub || asset.status !== 'READY' || !asset.mimeType.startsWith(kind)) throw new BadRequestException('请选择本人上传且已就绪的对应媒体文件');
    if (asset.referenceId || asset.referenceType || asset.healthRecordId) throw new ConflictException('该媒体已绑定其他业务，不能重复使用');
    return asset;
  }

  private async bindAsset(tx: Prisma.TransactionClient, mediaAssetId: string, referenceType: string, referenceId: string) {
    const result = await tx.mediaAsset.updateMany({ where: { id: mediaAssetId, status: 'READY', referenceType: null, referenceId: null, healthRecordId: null }, data: { referenceType, referenceId, scope: referenceType } });
    if (result.count !== 1) throw new ConflictException('文件已被绑定或删除，请刷新后重试');
  }

  async createPosturePhoto(req: Request, patientId: string, dto: PosturePhotoDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'HEALTH_MANAGER', 'PATIENT');
    await this.assertWriteEnrollment(actor, patientId);
    if (dto.faceProtected !== true) throw new BadRequestException('请先裁切或遮挡脸部等身份信息后上传');
    return this.prisma.$transaction(async (tx) => {
      await this.assertUnboundAsset(tx, actor, dto.mediaAssetId, 'image/');
      const row = await tx.posturePhoto.create({ data: { patientId, mediaAssetId: dto.mediaAssetId, view: dto.view, faceProtected: dto.faceProtected } });
      await this.bindAsset(tx, dto.mediaAssetId, 'POSTURE_PHOTO', row.id);
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'POSTURE_PHOTO_CREATE', resourceType: 'POSTURE_PHOTO', resourceId: row.id } });
      return row;
    });
  }

  async videos(req: Request) {
    const actor = await this.clinical.actor(req);
    if (actor.role !== 'PATIENT') this.assertRole(actor, ...staffRoles);
    let ids: string[] | undefined;
    if (actor.role === 'PATIENT') {
      const row = await this.assertEnrollment(actor, actor.sub);
      if (!await this.nutritionistActive(row)) return [];
      const reports = await this.prisma.exercisePrescription.findMany({ where: { patientId: actor.sub, publishedAt: { not: null }, shares: { some: this.validShareWhere(row.nutritionistId) } }, select: { items: true } });
      ids = reports.flatMap((r) => Array.isArray(r.items) ? r.items.map((item) => (item as { videoId: string }).videoId) : []);
    }
    return this.prisma.exerciseVideo.findMany({ where: { ...(ids ? { id: { in: ids } } : { active: true }), mediaAsset: { status: 'READY' } }, select: { id: true, title: true, description: true, mediaAssetId: true, durationSeconds: true, active: true, archivedAt: true, updatedAt: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  private assertNoIdentity(text: string, patient?: { displayName: string; phone: string }) {
    if (/(?:\+?86)?1[3-9][\s-]?\d(?:[\s-]?\d){8}|https?:\/\/|data:image\//i.test(text)
      || (patient && ((patient.displayName.length >= 2 && text.includes(patient.displayName)) || text.includes(patient.phone)))) {
      throw new BadRequestException('报告和视频说明请勿填写客户姓名、手机号、照片或外部链接');
    }
  }

  async createVideo(req: Request, dto: ExerciseVideoDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'EXERCISE_COACH', 'ADMIN');
    if (!dto.title.trim()) throw new BadRequestException('视频名称不能为空');
    this.assertNoIdentity(`${dto.title}\n${dto.description ?? ''}`);
    return this.prisma.$transaction(async (tx) => {
      await this.assertUnboundAsset(tx, actor, dto.mediaAssetId, 'video/');
      const row = await tx.exerciseVideo.create({ data: { title: dto.title.trim(), description: dto.description?.trim(), mediaAssetId: dto.mediaAssetId, durationSeconds: dto.durationSeconds, createdById: actor.sub } });
      await this.bindAsset(tx, dto.mediaAssetId, 'EXERCISE_VIDEO', row.id);
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'EXERCISE_VIDEO_CREATE', resourceType: 'EXERCISE_VIDEO', resourceId: row.id } });
      return row;
    });
  }

  async createExerciseReport(req: Request, patientId: string, dto: ExerciseReportDto, revision?: { id: string; version: number }) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'EXERCISE_COACH');
    const enrollment = await this.assertEnrollment(actor, patientId);
    if (!dto.assessment.trim() || dto.items.some((item) => !item.actionName.trim() || !item.tempo.trim() || !item.frequency.trim())) throw new BadRequestException('请填写评估、动作、节奏及频率');
    this.assertNoIdentity(JSON.stringify(dto), enrollment.patient);
    const videoIds = [...new Set(dto.items.map((item) => item.videoId))];
    return this.prisma.$transaction(async (tx) => {
      const recipient = await tx.careRelation.findFirst({ where: { patientId, practitionerId: enrollment.nutritionistId, status: 'ACTIVE', practitioner: { status: 'ACTIVE', role: 'NUTRITIONIST' } }, select: { id: true } });
      if (!recipient) throw new ForbiddenException('负责营养师或服务关系已停用，请先恢复有效服务分配');
      const videos = await tx.exerciseVideo.findMany({ where: { id: { in: videoIds }, active: true, mediaAsset: { status: 'READY' } } });
      if (videos.length !== videoIds.length) throw new BadRequestException('所选视频不存在或已不可用');
      const items = dto.items.map((item) => {
        const video = videos.find((v) => v.id === item.videoId)!;
        this.assertNoIdentity(`${video.title}\n${video.description ?? ''}`, enrollment.patient);
        return { ...item, videoTitle: video.title, mediaAssetId: video.mediaAssetId, durationSeconds: video.durationSeconds };
      });
      const report = await tx.exercisePrescription.create({ data: { patientId, coachId: actor.sub, assessment: dto.assessment.trim(), precautions: dto.precautions?.trim(), items: json(items), ...(revision ? { revisedFromId: revision.id, version: revision.version + 1 } : {}) } });
      const notification = await tx.notification.create({ data: {
        id: `exercise-ready:${report.id}`,
        userId: enrollment.nutritionistId,
        type: 'GENERAL',
        title: '有新的运动处方待处理',
        content: '运动老师已提交运动评估与跟练报告，请查看并发送给客户。',
        relatedType: 'EXERCISE_REPORT_READY', relatedId: report.id,
        actionPath: `/pages/care/client?id=${encodeURIComponent(patientId)}&reportId=${encodeURIComponent(report.id)}`,
      } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'EXERCISE_REPORT_CREATE', resourceType: 'EXERCISE_REPORT', resourceId: report.id } });
      return { ...report, shares: [], notificationId: notification.id, delivery: (process.env.MESSAGE_DELIVERY_MODE === 'in_app' ? 'IN_APP' : 'SIMULATED_IN_APP') as string };
    });
  }

  async shareExerciseReport(req: Request, id: string, dto: ShareExerciseReportDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'NUTRITIONIST');
    const report = await this.prisma.exercisePrescription.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('运动报告不存在');
    await this.assertEnrollment(actor, report.patientId);
    const expiresInDays = dto.expiresInDays ?? 7;
    if (![1, 7, 14, 30].includes(expiresInDays)) throw new BadRequestException('有效期须选择 1、7、14 或 30 天');
    if (dto.reviewed !== true) throw new BadRequestException('请人工复核运动报告后再发送');
    const requestKey = hashToken(`${actor.sub}.${id}.${expiresInDays}.${dto.idempotencyKey ?? 'default'}`);
    const response = (row: { id: string; expiresAt: Date; revokedAt: Date | null }) => {
      if (row.revokedAt || row.expiresAt <= new Date()) throw new ConflictException('该发送请求已失效，请使用新的发送请求键');
      const path = `/pages/shared-report/shared-report?shareId=${encodeURIComponent(row.id)}`;
      const origin = (process.env.PATIENT_APP_URL ?? process.env.PATIENT_H5_URL ?? '').replace(/\/+$/, '').replace(/\/#.*$/, '');
      return { id: row.id, expiresAt: row.expiresAt, path, url: `${origin}/#${path}`, notificationId: `exercise-shared:${row.id}`, delivery: process.env.MESSAGE_DELIVERY_MODE === 'in_app' ? 'IN_APP' : 'SIMULATED_IN_APP' };
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const share = await this.prisma.$transaction(async (tx) => {
          const enrollment = await tx.careEnrollment.findUnique({ where: { patientId: report.patientId }, select: { nutritionistId: true } });
          const relation = await tx.careRelation.findFirst({ where: { patientId: report.patientId, practitionerId: actor.sub, status: 'ACTIVE', practitioner: { role: 'NUTRITIONIST', status: 'ACTIVE' } }, select: { id: true } });
          if (!enrollment || enrollment.nutritionistId !== actor.sub || !relation) throw new ForbiddenException('报告分配或服务关系已失效');
          const existing = await tx.exerciseReportShare.findUnique({ where: { requestKey } });
          if (existing) return existing;
          const expiresAt = new Date(Date.now() + expiresInDays * 86400000);
          const token = randomBytes(32).toString('base64url');
          const row = await tx.exerciseReportShare.create({ data: { reportId: id, nutritionistId: actor.sub, tokenHash: hashToken(token), requestKey, expiresAt } });
          await tx.exercisePrescription.update({ where: { id }, data: { publishedAt: report.publishedAt ?? new Date(), reviewedById: actor.sub, reviewedAt: new Date() } });
          await tx.notification.create({ data: {
            id: `exercise-shared:${row.id}`, userId: report.patientId, type: 'GENERAL',
            title: '您收到一份运动处方报告', content: '营养师已复核并为您发送运动评估与跟练报告。',
            relatedType: 'EXERCISE_REPORT_SHARED', relatedId: row.id,
            actionPath: `/pages/shared-report/shared-report?shareId=${encodeURIComponent(row.id)}`, expiresAt,
          } });
          await tx.notification.updateMany({ where: { userId: actor.sub, relatedType: 'EXERCISE_REPORT_READY', relatedId: id, readAt: null }, data: { readAt: new Date() } });
          await tx.auditLog.create({ data: { actorId: actor.sub, action: 'EXERCISE_REPORT_SHARE', resourceType: 'EXERCISE_REPORT', resourceId: id, metadata: { shareId: row.id, expiresAt: expiresAt.toISOString() } } });
          return row;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return response(share);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await this.prisma.exerciseReportShare.findUnique({ where: { requestKey } });
          if (existing) return response(existing);
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
        throw error;
      }
    }
    throw new ConflictException('发送竞争，请使用同一请求键重试');
  }

  async revokeShare(req: Request, id: string, shareId: string) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'NUTRITIONIST');
    const report = await this.prisma.exercisePrescription.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('运动报告不存在');
    await this.assertEnrollment(actor, report.patientId);
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.exerciseReportShare.updateMany({ where: { id: shareId, reportId: id, nutritionistId: actor.sub, revokedAt: null }, data: { revokedAt: new Date() } });
      if (result.count !== 1) throw new NotFoundException('有效分享链接不存在');
      await tx.notification.updateMany({ where: { userId: report.patientId, relatedType: 'EXERCISE_REPORT_SHARED', relatedId: shareId }, data: { expiresAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'EXERCISE_REPORT_SHARE_REVOKE', resourceType: 'EXERCISE_REPORT', resourceId: id, metadata: { shareId } } });
      return { revoked: true, id: shareId };
    });
  }

  async sharedReport(req: Request, token: string) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'PATIENT');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('分享链接无效或已过期');
    const share = await this.prisma.exerciseReportShare.findUnique({ where: { tokenHash: hashToken(token) }, include: { report: true } });
    return this.authorizeSharedReport(actor, share);
  }

  async sharedReportByShare(req: Request, shareId: string) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'PATIENT');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(shareId)) throw new NotFoundException('分享链接无效或已过期');
    const share = await this.prisma.exerciseReportShare.findUnique({ where: { id: shareId }, include: { report: true } });
    return this.authorizeSharedReport(actor, share);
  }

  private async authorizeSharedReport(actor: Actor, share: Prisma.ExerciseReportShareGetPayload<{ include: { report: true } }> | null) {
    if (!share || share.revokedAt || share.expiresAt <= new Date() || !share.report.publishedAt) throw new NotFoundException('分享链接无效或已过期');
    if (share.report.patientId !== actor.sub) throw new ForbiddenException('请使用报告所属客户账号登录');
    const enrollment = await this.assertEnrollment(actor, actor.sub);
    if (enrollment.nutritionistId !== share.nutritionistId || !await this.nutritionistActive(enrollment)) throw new ForbiddenException('报告分享服务关系已失效');
    return share.report;
  }



  async enrollExisting(req: Request, patientId: string, dto: EnrollPatientDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'HEALTH_MANAGER');
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.user.findUnique({ where: { id: patientId }, select: patientSelect });
      if (!patient || patient.role !== 'PATIENT' || patient.status !== 'ACTIVE' || patient.phone !== dto.phone.replace(/^\+?86/, '')) throw new NotFoundException('既有客户账号不匹配或不可用');
      const existing = await tx.careEnrollment.findUnique({ where: { patientId }, select: { id: true } });
      if (existing) throw new ConflictException('客户已建档，请通过分配更新流程处理');
      this.assertNoIdentity(dto.packageName, patient);
      const assignments = [{ id: dto.doctorId, role: 'DOCTOR' }, { id: dto.nutritionistId, role: 'NUTRITIONIST' }, { id: dto.exerciseCoachId, role: 'EXERCISE_COACH' }, { id: actor.sub, role: 'HEALTH_MANAGER' }] as const;
      const staff = await tx.user.findMany({ where: { id: { in: assignments.map((x) => x.id) }, status: 'ACTIVE' }, select: { id: true, role: true } });
      if (assignments.some((a) => !staff.some((r) => r.id === a.id && r.role === a.role))) throw new BadRequestException('分配人员岗位或状态不匹配');
      for (const assignment of assignments) await tx.careRelation.upsert({ where: { patientId_practitionerId: { patientId, practitionerId: assignment.id } }, create: { patientId, practitionerId: assignment.id, status: 'ACTIVE', bindMethod: 'HEALTH_MANAGER_LEGACY_ENROLLMENT' }, update: { status: 'ACTIVE', endedAt: null, endedReason: null } });
      const row = await tx.careEnrollment.create({ data: { patientId, clientCode: `KH${randomBytes(8).toString('hex').toUpperCase()}`, packageName: dto.packageName.trim(), healthManagerId: actor.sub, doctorId: dto.doctorId, nutritionistId: dto.nutritionistId, exerciseCoachId: dto.exerciseCoachId, lifestyle: json(dto.lifestyle) }, include: { patient: { select: patientSelect } } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'LEGACY_CLIENT_ENROLLMENT', resourceType: 'CARE_ENROLLMENT', resourceId: row.id, metadata: { passwordPreserved: true, originalIdentityPreserved: true } } });
      return { ...this.projection(actor, row), legacyAccount: true, passwordPreserved: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async workbench(req: Request) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'NUTRITIONIST', 'HEALTH_MANAGER', 'DOCTOR', 'EXERCISE_COACH');
    const legacy = await this.legacyNutritionPatients(actor);
    const field = assignmentFields[actor.role as keyof typeof assignmentFields];
    const enrollments = await this.prisma.careEnrollment.findMany({ where: { [field]: actor.sub, patient: { status: 'ACTIVE', patientRelations: { some: { practitionerId: actor.sub, status: 'ACTIVE' } } } }, select: { patientId: true, clientCode: true, nutritionistId: true, doctorId: true } });
    const clients = new Map(enrollments.map((row) => [row.patientId, { patientId: row.patientId, clientCode: row.clientCode }]));
    for (const patient of legacy) if (!clients.has(patient.id)) clients.set(patient.id, { patientId: patient.id, clientCode: this.legacyNutritionProjection(patient).patient.displayName });
    const assigned = [...clients.values()];
    const ids = assigned.map((row) => row.patientId);
    const codes = new Map(assigned.map((row) => [row.patientId, row.clientCode]));
    const now = new Date();
    const local = new Date(now.getTime() + 8 * 3600000);
    const start = new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()) - 8 * 3600000);
    const end = new Date(start.getTime() + 86400000);
    const weeklyStart = new Date(start.getTime() - ((local.getUTCDay() + 6) % 7) * 86400000);
    const nutrition = actor.role === 'NUTRITIONIST';
    const [diet, plans, summaries, followups] = await Promise.all([
      nutrition ? this.prisma.healthRecord.findMany({ where: { patientId: { in: ids }, recordType: 'DIET', measuredAt: { gte: start, lt: end }, reviews: { none: { practitionerId: actor.sub } } }, select: { id: true, patientId: true, measuredAt: true, mealType: true }, orderBy: [{ measuredAt: 'asc' }, { id: 'asc' }] }) : [],
      nutrition ? this.prisma.dietPlan.findMany({ where: { patientId: { in: ids }, practitionerId: actor.sub, status: 'ACTIVE', startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { patientId: true } }) : [],
      nutrition ? this.prisma.careSummary.findMany({ where: { patientId: { in: ids }, practitionerId: actor.sub, periodType: 'WEEKLY', periodStart: { gte: weeklyStart }, publishedAt: { lte: now } }, select: { patientId: true } }) : [],
      this.prisma.followUp.findMany({ where: { patientId: { in: ids }, ...(actor.role === 'HEALTH_MANAGER' ? {} : { practitionerId: actor.sub }), status: { in: ['SCHEDULED','IN_PROGRESS','OVERDUE'] }, scheduledAt: { lt: end } }, select: { id: true, patientId: true, type: true, scheduledAt: true, status: true }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }] }),
    ]);
    const planned = new Set(plans.map((r) => r.patientId));
    const summarized = new Set(summaries.map((r) => r.patientId));
    const queues = {
      pendingDietReviews: diet.map((r) => ({ recordId:r.id,patientId:r.patientId,clientCode:codes.get(r.patientId),measuredAt:r.measuredAt,mealType:r.mealType })),
      pendingPlans: nutrition ? assigned.filter((r) => !planned.has(r.patientId)).map((r) => ({ patientId:r.patientId,clientCode:r.clientCode })) : [],
      pendingSummaries: nutrition ? assigned.filter((r) => !summarized.has(r.patientId)).map((r) => ({ patientId:r.patientId,clientCode:r.clientCode,periodType:'WEEKLY',periodStart:weeklyStart })) : [],
      dueRechecks: followups.map((r) => ({ followUpId:r.id,patientId:r.patientId,clientCode:codes.get(r.patientId),type:r.type,scheduledAt:r.scheduledAt,status:r.status })),
    };
    return { asOf:now,date:local.toISOString().slice(0,10),timezone:'Asia/Shanghai',counts:Object.fromEntries(Object.entries(queues).map(([key,rows])=>[key,rows.length])),queues,definitions:{ pendingDietReviews:'今日提交且本人尚未点评的饮食记录',pendingPlans:'目前没有有效饮食方案的已分配客户',pendingSummaries:'本周尚未发布周总结的已分配客户',dueRechecks:'今日结束前应随访且尚未完成（含逾期）' } };
  }

  async updateAssignment(req: Request, patientId: string, dto: AssignmentDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'HEALTH_MANAGER');
    const current = await this.assertWriteEnrollment(actor, patientId);
    if (dto.packageName) this.assertNoIdentity(dto.packageName, current.patient);
    const fields = { nutritionistId: 'NUTRITIONIST', doctorId: 'DOCTOR', exerciseCoachId: 'EXERCISE_COACH' } as const;
    return this.prisma.$transaction(async (tx) => {
      for (const [field, role] of Object.entries(fields)) {
        const next = dto[field as keyof typeof fields];
        if (!next || next === current[field as keyof typeof fields]) continue;
        const staff = await tx.user.findUnique({ where: { id: next }, select: { role: true, status: true } });
        if (!staff || staff.role !== role || staff.status !== 'ACTIVE') throw new BadRequestException('分配人员岗位或状态不匹配');
        await tx.careRelation.updateMany({ where: { patientId, practitionerId: current[field as keyof typeof fields], status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date(), endedReason: 'HEALTH_MANAGER_REASSIGNED' } });
        await tx.careRelation.upsert({ where: { patientId_practitionerId: { patientId, practitionerId: next } }, create: { patientId, practitionerId: next, status: 'ACTIVE', bindMethod: 'HEALTH_MANAGER_ASSIGNMENT' }, update: { status: 'ACTIVE', endedAt: null, endedReason: null, bindMethod: 'HEALTH_MANAGER_ASSIGNMENT' } });
        if (field === 'nutritionistId') await tx.exerciseReportShare.updateMany({ where: { report: { patientId }, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const updated = await tx.careEnrollment.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: { nutritionistId: dto.nutritionistId, doctorId: dto.doctorId, exerciseCoachId: dto.exerciseCoachId, packageName: dto.packageName?.trim(), ...(dto.lifestyle ? { lifestyle: json(dto.lifestyle) } : {}) } });
      if (updated.count !== 1) throw new ConflictException('分配已被更新，请刷新重试');
      const row = await tx.careEnrollment.findUniqueOrThrow({ where: { patientId }, include: { patient: { select: patientSelect } } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'CARE_ASSIGNMENT_UPDATE', resourceType: 'CARE_ENROLLMENT', resourceId: row.id } });
      return this.projection(actor, row);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async reissueInitialCredentials(req: Request, patientId: string) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'HEALTH_MANAGER');
    await this.assertWriteEnrollment(actor, patientId);
    const password = `${randomBytes(18).toString('base64url')}!9a`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const expiresAt = new Date(Date.now() + 24 * 3600000);
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({ where: { id: patientId, role: 'PATIENT', mustChangePassword: true, status: 'ACTIVE' }, data: { passwordHash, initialPasswordExpiresAt: expiresAt, sessionVersion: { increment: 1 } } });
      if (result.count !== 1) throw new ConflictException('仅未完成首次改密的初始账号可补发，已有账号密码不得覆盖');
      await tx.refreshToken.updateMany({ where: { userId: patientId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'INITIAL_CREDENTIAL_REISSUE', resourceType: 'USER', resourceId: patientId } });
    });
    return { initialPassword: password, expiresAt, mustChangePassword: true };
  }

  async updateVideo(req: Request, id: string, dto: UpdateExerciseVideoDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'EXERCISE_COACH', 'ADMIN');
    const video = await this.prisma.exerciseVideo.findUnique({ where: { id } });
    if (!video || (actor.role !== 'ADMIN' && video.createdById !== actor.sub)) throw new NotFoundException('视频不存在或无权维护');
    this.assertNoIdentity(`${dto.title ?? ''} ${dto.description ?? ''}`);
    return this.prisma.exerciseVideo.update({ where: { id }, data: dto });
  }

  async archiveVideo(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'EXERCISE_COACH', 'ADMIN');
    const video = await this.prisma.exerciseVideo.findUnique({ where: { id } });
    if (!video || (actor.role !== 'ADMIN' && video.createdById !== actor.sub)) throw new NotFoundException('视频不存在或无权维护');
    await this.prisma.exerciseVideo.update({ where: { id }, data: { active: false, archivedAt: new Date() } });
    return { id, archived: true, historyPreserved: true };
  }

  async reviseExerciseReport(req: Request, id: string, dto: ExerciseReportDto) {
    const actor = await this.clinical.actor(req);
    this.assertRole(actor, 'EXERCISE_COACH');
    const report = await this.prisma.exercisePrescription.findUnique({ where: { id } });
    if (!report || report.coachId !== actor.sub) throw new NotFoundException('报告不存在或无权修改');
    return this.createExerciseReport(req, report.patientId, dto, { id, version: report.version });
  }

  /** Called before owner fallback by MediaService; no signed URL or object key is returned here. */
  async canAccessMedia(actor: Actor, mediaAssetId: string): Promise<boolean> {
    const photo = await this.prisma.posturePhoto.findUnique({ where: { mediaAssetId }, select: { patientId: true, faceProtected: true } });
    if (photo) {
      if (actor.role === 'NUTRITIONIST' || (actor.role === 'EXERCISE_COACH' && !photo.faceProtected)) return false;
      try { if (actor.role === 'PATIENT') await this.assertSelfPatient(actor, photo.patientId); else await this.assertEnrollment(actor, photo.patientId); return true; } catch { return false; }
    }
    for (const model of [this.prisma.consentDocument, this.prisma.healthReportDocument, this.prisma.ocrDraft]) {
      const document = await (model.findUnique as any)({ where: { mediaAssetId }, select: { patientId: true } });
      if (!document) continue;
      if (!['PATIENT', 'HEALTH_MANAGER', 'DOCTOR'].includes(actor.role)) return false;
      try {
        if (actor.role === 'PATIENT') await this.assertSelfPatient(actor, document.patientId);
        else if (actor.role === 'HEALTH_MANAGER') await this.clinical.assertCare(actor, document.patientId);
        else await this.assertEnrollment(actor, document.patientId);
        return true;
      } catch { return false; }
    }
    const video = await this.prisma.exerciseVideo.findUnique({ where: { mediaAssetId }, select: { id: true } });
    if (!video) return false;
    if (staffRoles.includes(actor.role)) return true;
    if (actor.role !== 'PATIENT') return false;
    try {
      const row = await this.assertEnrollment(actor, actor.sub);
      if (!await this.nutritionistActive(row)) return false;
      const reports = await this.prisma.exercisePrescription.findMany({ where: { patientId: actor.sub, publishedAt: { not: null }, shares: { some: this.validShareWhere(row.nutritionistId) } }, select: { items: true } });
      return reports.some((report) => Array.isArray(report.items) && report.items.some((item) => item && typeof item === 'object' && !Array.isArray(item) && item.mediaAssetId === mediaAssetId));
    } catch { return false; }
  }
}

@Controller('care-management')
export class CareManagementController {
  constructor(private readonly service: CareManagementService) {}
  @Get('workbench') workbench(@Req() req: Request) { return this.service.workbench(req); }
  @Post('existing-patients/:id/enrollment') enrollExisting(@Req() req: Request, @Param('id') id: string, @Body() dto: EnrollPatientDto) { return this.service.enrollExisting(req,id,dto); }
  @Get('staff') staff(@Req() req: Request) { return this.service.staff(req); }
  @Get('patients') patients(@Req() req: Request) { return this.service.patients(req); }
  @Post('patients') enroll(@Req() req: Request, @Body() dto: EnrollPatientDto) { return this.service.enroll(req, dto); }
  @Patch('patients/:id/assignment') assign(@Req() req: Request, @Param('id') id: string, @Body() dto: AssignmentDto) { return this.service.updateAssignment(req, id, dto); }
  @Post('patients/:id/credentials/reissue') reissue(@Req() req: Request, @Param('id') id: string) { return this.service.reissueInitialCredentials(req, id); }
  @Get('patients/:id') patient(@Req() req: Request, @Param('id') id: string) { return this.service.patient(req, id); }
  @Post('patients/:id/body-reports') createBodyReport(@Req() req: Request, @Param('id') id: string, @Body() dto: BodyAssessmentDto) { return this.service.createBodyReport(req, id, dto); }
  @Post('patients/:id/posture-photos') createPhoto(@Req() req: Request, @Param('id') id: string, @Body() dto: PosturePhotoDto) { return this.service.createPosturePhoto(req, id, dto); }
  @Get('videos') videos(@Req() req: Request) { return this.service.videos(req); }
  @Patch('videos/:id') updateVideo(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateExerciseVideoDto) { return this.service.updateVideo(req, id, dto); }
  @Delete('videos/:id') archiveVideo(@Req() req: Request, @Param('id') id: string) { return this.service.archiveVideo(req, id); }
  @Post('videos') createVideo(@Req() req: Request, @Body() dto: ExerciseVideoDto) { return this.service.createVideo(req, dto); }
  @Post('patients/:id/exercise-reports') createReport(@Req() req: Request, @Param('id') id: string, @Body() dto: ExerciseReportDto) { return this.service.createExerciseReport(req, id, dto); }
  @Post('exercise-reports/:id/revisions') revise(@Req() req: Request, @Param('id') id: string, @Body() dto: ExerciseReportDto) { return this.service.reviseExerciseReport(req, id, dto); }
  @Post('exercise-reports/:id/share') share(@Req() req: Request, @Param('id') id: string, @Body() dto: ShareExerciseReportDto) { return this.service.shareExerciseReport(req, id, dto); }
  @Delete('exercise-reports/:id/share/:shareId') revoke(@Req() req: Request, @Param('id') id: string, @Param('shareId') shareId: string) { return this.service.revokeShare(req, id, shareId); }
  @Get('shared-reports/:token') shared(@Req() req: Request, @Param('token') token: string) { return this.service.sharedReport(req, token); }
  @Get('shared-reports/by-share/:shareId') sharedById(@Req() req: Request, @Param('shareId') shareId: string) { return this.service.sharedReportByShare(req, shareId); }
}
