import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';
import { MediaService } from './media';
import { canReadYuanqizhanHealth } from './yuanqizhan-media-access';
import { yuanqizhanNutritionView, type YuanqizhanPatientIdentity } from './yuanqizhan-nutrition-view';
import { activityDay, formDefinition, memberWindow, normalizedAnswers, normalizedPhotos, PHOTO_SLOTS, type PhotoSlot, shanghaiDate, validCalendarDate, YUANQIZHAN_NOTICE, YUANQIZHAN_SCHEMA_VERSION } from './yuanqizhan-policy';

export class YuanqizhanPageDto {
  @IsString() @MaxLength(120) @IsOptional() search?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize = 20;
}
export class YuanqizhanCreateDto {
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(2000) @IsOptional() description?: string;
  @IsInt() @Equals(15) @IsOptional() durationDays = 15;
}
export class YuanqizhanPatchDto {
  @IsString() @MaxLength(120) @IsOptional() title?: string;
  @IsString() @MaxLength(2000) @IsOptional() description?: string;
  @IsIn(['ACTIVE', 'ENDED']) @IsOptional() status?: 'ACTIVE' | 'ENDED';
  @IsInt() @Min(1) expectedVersion!: number;
}
export class YuanqizhanAddMembersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsString({each: true}) @MaxLength(191, {each: true}) patientIds!: string[];
}
export class YuanqizhanSaveDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsString() @Matches(/^[A-Za-z0-9_-]{16,96}$/) idempotencyKey!: string;
  @IsIn(['DRAFT', 'SUBMITTED']) status!: 'DRAFT' | 'SUBMITTED';
  @IsObject() answers!: Record<string, unknown>;
  @IsObject() photos!: Record<string, unknown>;
}
const pagination = (query: YuanqizhanPageDto) => {
  const page = query.page ?? 1, pageSize = query.pageSize ?? 20;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new BadRequestException('分页参数无效');
  return {page, pageSize, skip: (page - 1) * pageSize};
};
const pageResult = <T>(items: T[], total: number, page: number, pageSize: number) => ({items, total, page, pageSize, hasMore: page * pageSize < total});
const patientSelect = {id: true, displayName: true, status: true} as const;
type UploadFile = {buffer: Buffer; mimetype: string; size: number; originalname: string};

@Injectable()
export class YuanqizhanService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService, private readonly media: MediaService) {}
  private manage(actor: Actor) { if (!['ADMIN', 'HEALTH_MANAGER'].includes(actor.role)) throw new ForbiddenException('仅管理员、健管师可管理活动及名单'); }
  private patient(actor: Actor) { if (actor.role !== 'PATIENT') throw new ForbiddenException('仅患者本人可填写活动'); }
  private activityView(row: any) { return {id: row.id, title: row.title, description: row.description, durationDays: row.durationDays, status: row.status, version: row.version, endedAt: row.endedAt, createdAt: row.createdAt, updatedAt: row.updatedAt, ...(row._count ? {memberCount: row._count.members} : {})}; }
  private memberView(row: any) { return {id: row.id, activityId: row.activityId, patientId: row.patientId, status: row.status, joinedAt: row.joinedAt, startDate: row.startDate, version: row.version, removedAt: row.removedAt, ...(row.patient ? {patient: row.patient} : {})}; }
  private recordView(row: any, activity: any, member: any, now = new Date()) {
    const window = this.readWindow(activity, member, now);
    const canWrite = window.canWrite && window.date === row.date;
    return {id: row.id, activityId: row.activityId, patientId: row.patientId, date: row.date, dayNumber: row.dayNumber, formType: row.formType,
      schemaVersion: row.schemaVersion, form: row.formSnapshot, status: row.status, version: row.version, answers: row.answers, photos: row.photos,
      submittedAt: row.submittedAt, createdAt: row.createdAt, updatedAt: row.updatedAt, canWrite, readOnly: !canWrite};
  }
  private readWindow(activity: any, member: any, now = new Date()) {
    // Preserve the live first-submission rule even with older local client types.
    return { ...memberWindow(activity, member.startDate === null ? { ...member, startDate: shanghaiDate(now) } : member, now), pendingStart: member.startDate === null };
  }
  private async readIdentity(actor: Actor, patientId: string): Promise<YuanqizhanPatientIdentity | null> {
    if (actor.role !== 'NUTRITIONIST') return null;
    const patient = await this.prisma.user.findUnique({ where: { id: patientId }, select: { id: true, displayName: true, phone: true } });
    if (!patient) throw new ForbiddenException('无权读取该客户的活动记录');
    return patient;
  }
  private readView<T extends Record<string, any>>(actor: Actor, view: T, identity: YuanqizhanPatientIdentity | null): T {
    if (actor.role === 'NUTRITIONIST') return yuanqizhanNutritionView(view, identity!);
    return { ...view, accessNotice: YUANQIZHAN_NOTICE, ...(actor.role !== 'PATIENT' ? { canWrite: false, readOnly: true } : {}) };
  }
  private async recheckRead(actor: Actor, patientId: string) {
    if (actor.role === 'NUTRITIONIST' && !await canReadYuanqizhanHealth(this.prisma, actor, patientId)) throw new ForbiddenException('客户绑定或账号状态已改变，请重新进入');
  }
  async patientActivities(req: Request, patientId: string, query: YuanqizhanPageDto) {
    const actor = await this.clinical.actor(req);
    if (!await canReadYuanqizhanHealth(this.prisma, actor, patientId)) throw new ForbiddenException('无权读取该客户的活动记录');
    const { page, pageSize, skip } = pagination(query);
    const identity = await this.readIdentity(actor, patientId);
    const where: Prisma.YuanqizhanMemberWhereInput = { patientId, OR: [{ status: 'ACTIVE' }, { records: { some: {} } }] };
    const [rows, total] = await Promise.all([
      this.prisma.yuanqizhanMember.findMany({ where, include: { activity: true, _count: { select: { records: { where: { status: 'SUBMITTED' } } } } }, orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }], skip, take: pageSize }),
      this.prisma.yuanqizhanMember.count({ where }),
    ]);
    const now = new Date(), date = shanghaiDate(now);
    const todayRows = rows.length ? await this.prisma.yuanqizhanDailyRecord.findMany({ where: { patientId, date, activityId: { in: rows.map(row => row.activityId) } }, select: { activityId: true, status: true } }) : [];
    await this.recheckRead(actor, patientId);
    await this.prisma.auditLog.create({ data: { actorId: actor.sub, action: 'YUANQIZHAN_PATIENT_ACTIVITIES_READ', resourceType: 'PATIENT', resourceId: patientId, metadata: { returnedCount: rows.length, readOnly: true } } });
    return pageResult(rows.map(row => this.readView(actor, {
      ...this.activityView(row.activity), member: this.memberView(row), ...this.readWindow(row.activity, row, now),
      todayStatus: todayRows.find(record => record.activityId === row.activityId)?.status ?? null, completedCount: row._count.records,
      canWrite: false, readOnly: true,
    }, identity)), total, page, pageSize);
  }
  private async activityById(activityId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const activity = await db.yuanqizhanActivity.findUnique({where: {id: activityId}});
    if (!activity) throw new NotFoundException('活动不存在');
    return activity;
  }
  private async memberByPatient(activityId: string, patientId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const member = await db.yuanqizhanMember.findUnique({where: {activityId_patientId: {activityId, patientId}}, include: {activity: true}});
    if (!member) throw new ForbiddenException('未加入该活动');
    return member;
  }
  // Every write locks in the same activity -> member order. Removal and ending
  // use these same rows, so authorization cannot change during a write/upload.
  private async lockActivity(tx: Prisma.TransactionClient, activityId: string) {
    await tx.$queryRaw`SELECT id FROM YuanqizhanActivity WHERE id = ${activityId} FOR UPDATE`;
    return this.activityById(activityId, tx);
  }
  private async lockMember(tx: Prisma.TransactionClient, activityId: string, patientId: string) {
    await tx.$queryRaw`SELECT id FROM YuanqizhanMember WHERE activityId = ${activityId} AND patientId = ${patientId} FOR UPDATE`;
    return this.memberByPatient(activityId, patientId, tx);
  }
  private writable(activity: any, member: any, now = new Date()) {
    const window = memberWindow(activity, member, now);
    if (!window.canWrite) throw new ForbiddenException({message: '当前活动已不能填写，请查看本人历史记录', code: window.writeBlockedReason});
    return window;
  }
  private transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(work, {isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 30000});
  }
  async activities(req: Request, query: YuanqizhanPageDto) {
    const actor = await this.clinical.actor(req); this.manage(actor);
    const {page, pageSize, skip} = pagination(query);
    const where = query.search?.trim() ? {title: {contains: query.search.trim()}} : {};
    const [rows, total] = await Promise.all([this.prisma.yuanqizhanActivity.findMany({where, orderBy: [{createdAt: 'desc'}, {id: 'asc'}], skip, take: pageSize,
      include: {_count: {select: {members: {where: {status: 'ACTIVE', ...(actor.role === 'HEALTH_MANAGER' ? {patient: {status: 'ACTIVE'}} : {})}}}}}}), this.prisma.yuanqizhanActivity.count({where})]);
    return pageResult(rows.map((row) => this.activityView(row)), total, page, pageSize);
  }
  async createActivity(req: Request, dto: YuanqizhanCreateDto) {
    const actor = await this.clinical.actor(req); this.manage(actor);
    if (typeof dto.title !== 'string' || !dto.title.trim() || dto.title.trim().length > 120 || (dto.durationDays ?? 15) !== 15) throw new BadRequestException('请填写活动名称；本期活动为15天');
    if (dto.description !== undefined && (typeof dto.description !== 'string' || dto.description.length > 2000)) throw new BadRequestException('活动说明最多2000字');
    return this.transaction(async (tx) => {
      const row = await tx.yuanqizhanActivity.create({data: {title: dto.title.trim(), description: dto.description?.trim(), durationDays: 15, createdById: actor.sub}});
      await tx.auditLog.create({data: {actorId: actor.sub, action: 'YUANQIZHAN_ACTIVITY_CREATE', resourceType: 'YUANQIZHAN_ACTIVITY', resourceId: row.id}});
      return this.activityView(row);
    });
  }
  async patchActivity(req: Request, activityId: string, dto: YuanqizhanPatchDto) {
    const actor = await this.clinical.actor(req); this.manage(actor);
    if (!Number.isSafeInteger(dto.expectedVersion) || dto.expectedVersion < 1) throw new BadRequestException('请提供活动版本');
    if (dto.title !== undefined && (typeof dto.title !== 'string' || !dto.title.trim() || dto.title.trim().length > 120)) throw new BadRequestException('活动名称须为1至120字');
    if (dto.description !== undefined && (typeof dto.description !== 'string' || dto.description.length > 2000)) throw new BadRequestException('活动说明最多2000字');
    if (dto.status !== undefined && !['ACTIVE', 'ENDED'].includes(dto.status)) throw new BadRequestException('活动状态无效');
    return this.transaction(async (tx) => {
      const prior = await this.lockActivity(tx, activityId);
      if (prior.version !== dto.expectedVersion) throw new ConflictException('活动已更新，请刷新后修改');
      if (prior.status === 'ENDED' && dto.status === 'ACTIVE') throw new ConflictException('已结束的活动不可重新开始');
      const row = await tx.yuanqizhanActivity.update({where: {id: activityId}, data: {title: dto.title?.trim(), description: dto.description?.trim(), status: dto.status, ...(dto.status === 'ENDED' && prior.status !== 'ENDED' ? {endedAt: new Date()} : {}), version: {increment: 1}}});
      await tx.auditLog.create({data: {actorId: actor.sub, action: 'YUANQIZHAN_ACTIVITY_UPDATE', resourceType: 'YUANQIZHAN_ACTIVITY', resourceId: row.id}});
      return this.activityView(row);
    });
  }
  async candidates(req: Request, activityId: string, query: YuanqizhanPageDto) {
    const actor = await this.clinical.actor(req); this.manage(actor); await this.activityById(activityId);
    const {page, pageSize, skip} = pagination(query);
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {role: 'PATIENT', ...(actor.role === 'HEALTH_MANAGER' ? {status: 'ACTIVE'} : {}), ...(search ? {OR: [{displayName: {contains: search}}, {id: {contains: search}}]} : {})};
    const [rows, total] = await Promise.all([this.prisma.user.findMany({where, select: {...patientSelect, yuanqizhanMemberships: {where: {activityId}}}, orderBy: [{createdAt: 'desc'}, {id: 'asc'}], skip, take: pageSize}), this.prisma.user.count({where})]);
    return pageResult(rows.map(({yuanqizhanMemberships, ...row}) => ({...row, membership: yuanqizhanMemberships[0] ? this.memberView(yuanqizhanMemberships[0]) : null})), total, page, pageSize);
  }
  async members(req: Request, activityId: string, query: YuanqizhanPageDto) {
    const actor = await this.clinical.actor(req); this.manage(actor); await this.activityById(activityId);
    const {page, pageSize, skip} = pagination(query);
    const search = query.search?.trim();
    const where: Prisma.YuanqizhanMemberWhereInput = {activityId,
      ...((search || actor.role === 'HEALTH_MANAGER') ? {patient: {...(actor.role === 'HEALTH_MANAGER' ? {status: 'ACTIVE' as const} : {}), ...(search ? {OR: [{displayName: {contains: search}}, {id: {contains: search}}]} : {})}} : {})};
    const [rows, total] = await Promise.all([this.prisma.yuanqizhanMember.findMany({where, include: {patient: {select: patientSelect}}, orderBy: [{joinedAt: 'desc'}, {id: 'asc'}], skip, take: pageSize}), this.prisma.yuanqizhanMember.count({where})]);
    return pageResult(rows.map((row) => this.memberView(row)), total, page, pageSize);
  }
  async addMembers(req: Request, activityId: string, dto: YuanqizhanAddMembersDto) {
    const actor = await this.clinical.actor(req); this.manage(actor);
    if (!Array.isArray(dto.patientIds) || dto.patientIds.length < 1 || dto.patientIds.length > 100 || dto.patientIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,191}$/.test(id)) || new Set(dto.patientIds).size !== dto.patientIds.length) throw new BadRequestException('每批请选择1至100位已有患者');
    return this.transaction(async (tx) => {
      const activity = await this.lockActivity(tx, activityId);
      if (activity.status !== 'ACTIVE') throw new ForbiddenException('活动已结束，不能加入参与人');
      const patients = await tx.user.findMany({where: {id: {in: dto.patientIds}, role: 'PATIENT', status: 'ACTIVE'}, select: patientSelect});
      if (patients.length !== dto.patientIds.length) throw new BadRequestException('患者不存在、账号已停用或角色不符');
      const items = [];
      const now = new Date();
      for (const patientId of [...dto.patientIds].sort()) {
        const prior = await tx.yuanqizhanMember.findUnique({where: {activityId_patientId: {activityId, patientId}}});
        const row = prior ? prior.status === 'ACTIVE' ? prior : await tx.yuanqizhanMember.update({where: {id: prior.id}, data: {status: 'ACTIVE', removedAt: null, version: {increment: 1}}})
          : await tx.yuanqizhanMember.create({data: {activityId, patientId, joinedAt: now, startDate: shanghaiDate(now)}});
        items.push(this.memberView({...row, patient: patients.find((patient) => patient.id === patientId)}));
      }
      await tx.auditLog.create({data: {actorId: actor.sub, action: 'YUANQIZHAN_MEMBERS_ADD', resourceType: 'YUANQIZHAN_ACTIVITY', resourceId: activityId, metadata: {count: dto.patientIds.length}}});
      return {items};
    });
  }
  async removeMember(req: Request, activityId: string, patientId: string) {
    const actor = await this.clinical.actor(req); this.manage(actor);
    if (actor.role === 'HEALTH_MANAGER') await this.clinical.assertCare(actor, patientId);
    return this.transaction(async (tx) => {
      await this.lockActivity(tx, activityId);
      const prior = await this.lockMember(tx, activityId, patientId);
      const row = prior.status === 'REMOVED' ? prior : await tx.yuanqizhanMember.update({where: {id: prior.id}, data: {status: 'REMOVED', removedAt: new Date(), version: {increment: 1}}});
      await tx.auditLog.create({data: {actorId: actor.sub, action: 'YUANQIZHAN_MEMBER_REMOVE', resourceType: 'YUANQIZHAN_MEMBER', resourceId: row.id}});
      return this.memberView(row);
    });
  }
  async myActivities(req: Request) {
    const actor = await this.clinical.actor(req); this.patient(actor);
    const rows = await this.prisma.yuanqizhanMember.findMany({where: {patientId: actor.sub, OR: [{status: 'ACTIVE'}, {records: {some: {}}}]}, include: {activity: true, _count: {select: {records: {where: {status: 'SUBMITTED'}}}}}, orderBy: [{joinedAt: 'desc'}, {id: 'asc'}]});
    const now = new Date(), date = shanghaiDate(now);
    const todayRows = await this.prisma.yuanqizhanDailyRecord.findMany({where: {patientId: actor.sub, date}, select: {activityId: true, status: true}});
    return {items: rows.map((row) => ({...this.activityView(row.activity), member: this.memberView(row), ...memberWindow(row.activity, row, now), todayStatus: todayRows.find((record) => record.activityId === row.activityId)?.status ?? null, completedCount: row._count.records}))};
  }
  async today(req: Request, activityId: string) {
    const actor = await this.clinical.actor(req); this.patient(actor);
    const member = await this.memberByPatient(activityId, actor.sub);
    const now = new Date(), window = memberWindow(member.activity, member, now);
    const record = await this.prisma.yuanqizhanDailyRecord.findUnique({where: {activityId_patientId_date: {activityId, patientId: actor.sub, date: window.date}}});
    return {activity: this.activityView(member.activity), member: this.memberView(member), ...window, record: record ? this.recordView(record, member.activity, member, now) : null, form: window.formType ? formDefinition(window.formType) : null};
  }
  private async readMember(req: Request, activityId: string, patientId?: string) {
    const actor = await this.clinical.actor(req);
    const id = patientId ?? actor.sub;
    if (!patientId) this.patient(actor);
    if (!await canReadYuanqizhanHealth(this.prisma, actor, id)) throw new ForbiddenException('无权读取该患者的活动健康内容');
    const member = await this.memberByPatient(activityId, id);
    if (actor.role !== 'PATIENT') await this.prisma.auditLog.create({data: {actorId: actor.sub, action: 'YUANQIZHAN_HEALTH_READ', resourceType: 'YUANQIZHAN_MEMBER', resourceId: member.id}});
    return {actor, member, identity: await this.readIdentity(actor, id)};
  }
  async records(req: Request, activityId: string, query: YuanqizhanPageDto, patientId?: string) {
    const {actor, member, identity} = await this.readMember(req, activityId, patientId);
    const {page, pageSize, skip} = pagination(query);
    const where = {memberId: member.id};
    const [rows, total] = await Promise.all([this.prisma.yuanqizhanDailyRecord.findMany({where, orderBy: [{date: 'desc'}, {id: 'asc'}], skip, take: pageSize}), this.prisma.yuanqizhanDailyRecord.count({where})]);
    const now = new Date();
    await this.recheckRead(actor, member.patientId);
    return pageResult(rows.map((row) => this.readView(actor, this.recordView(row, member.activity, member, now), identity)), total, page, pageSize);
  }
  async record(req: Request, activityId: string, date: string, patientId?: string) {
    if (!validCalendarDate(date)) throw new BadRequestException('记录日期无效');
    const {actor, member, identity} = await this.readMember(req, activityId, patientId);
    const row = await this.prisma.yuanqizhanDailyRecord.findUnique({where: {activityId_patientId_date: {activityId, patientId: member.patientId, date}}});
    if (!row) throw new NotFoundException('该日没有活动记录');
    await this.recheckRead(actor, member.patientId);
    return this.readView(actor, this.recordView(row, member.activity, member), identity);
  }
  async revisions(req: Request, activityId: string, date: string, patientId?: string) {
    if (!validCalendarDate(date)) throw new BadRequestException('记录日期无效');
    const {actor, member, identity} = await this.readMember(req, activityId, patientId);
    const row = await this.prisma.yuanqizhanDailyRecord.findUnique({where: {activityId_patientId_date: {activityId, patientId: member.patientId, date}}});
    if (!row) throw new NotFoundException('该日没有活动记录');
    const revisions = await this.prisma.yuanqizhanRecordRevision.findMany({where: {recordId: row.id}, orderBy: {version: 'desc'}});
    await this.recheckRead(actor, member.patientId);
    return {items: revisions.map((revision) => this.readView(actor, this.recordView({...row, status: revision.status, version: revision.version, answers: revision.answers, photos: revision.photos, submittedAt: revision.submittedAt, updatedAt: revision.createdAt}, member.activity, member), identity))};
  }
  async save(req: Request, activityId: string, dto: YuanqizhanSaveDto) {
    const actor = await this.clinical.actor(req); this.patient(actor);
    if (!validCalendarDate(dto.date) || !Number.isSafeInteger(dto.expectedVersion) || dto.expectedVersion < 0 || !/^[A-Za-z0-9_-]{16,96}$/.test(dto.idempotencyKey) || !['DRAFT', 'SUBMITTED'].includes(dto.status)) throw new BadRequestException('保存参数无效');
    return this.transaction(async (tx) => {
      const activity = await this.lockActivity(tx, activityId), member = await this.lockMember(tx, activityId, actor.sub);
      const now = new Date(), window = this.writable(activity, member, now);
      if (dto.date !== window.date) throw new ForbiddenException('仅允许保存北京时间当天记录，不支持未来填写或补填');
      const type = window.formType!;
      const answers = normalizedAnswers(dto.answers, type, dto.status === 'SUBMITTED'), photos = normalizedPhotos(dto.photos, type, dto.status === 'SUBMITTED');
      const fingerprint = createHash('sha256').update(JSON.stringify({date: dto.date, expectedVersion: dto.expectedVersion, status: dto.status, answers, photos})).digest('hex');
      const replay = await tx.yuanqizhanRecordRevision.findUnique({where: {memberId_requestKey: {memberId: member.id, requestKey: dto.idempotencyKey}}, include: {record: true}});
      if (replay) {
        if (replay.requestFingerprint !== fingerprint) throw new ConflictException('幂等键已用于不同内容，请刷新后重试');
        return {...this.recordView({...replay.record, status: replay.status, version: replay.version, answers: replay.answers, photos: replay.photos, submittedAt: replay.submittedAt, updatedAt: replay.createdAt}, activity, member, now), idempotentReplay: true};
      }
      const prior = await tx.yuanqizhanDailyRecord.findUnique({where: {activityId_patientId_date: {activityId, patientId: actor.sub, date: dto.date}}});
      if ((prior?.version ?? 0) !== dto.expectedVersion) throw new ConflictException({message: '记录已在其他页面更新，请刷新后修改', code: 'VERSION_CONFLICT', currentVersion: prior?.version ?? 0});
      if (prior?.status === 'SUBMITTED' && dto.status === 'DRAFT') throw new ConflictException('已提交记录不能改回草稿；请修改后提交');
      for (const [slot, assetId] of Object.entries(photos)) {
        const photo = await tx.yuanqizhanPhoto.findUnique({where: {assetId}, include: {asset: true}});
        if (!photo || photo.memberId !== member.id || photo.date !== dto.date || photo.slot !== slot || photo.asset.ownerId !== actor.sub || photo.asset.referenceType !== 'YUANQIZHAN_PHOTO' || photo.asset.referenceId !== member.id || photo.asset.healthRecordId || photo.asset.status !== 'READY' || photo.asset.scope !== 'PRIVATE' || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.asset.mimeType) || !photo.asset.sizeBytes || photo.asset.sizeBytes > 10485760n) throw new ForbiddenException('照片须通过本活动、当天对应槽位上传');
      }
      if (shanghaiDate() !== dto.date) throw new ConflictException('北京时间日期已切换，请刷新今日表单');
      const submittedAt = prior?.submittedAt ?? (dto.status === 'SUBMITTED' ? now : null);
      const row = prior ? await tx.yuanqizhanDailyRecord.update({where: {id: prior.id}, data: {status: dto.status, version: {increment: 1}, answers, photos, submittedAt, updatedAt: now}})
        : await tx.yuanqizhanDailyRecord.create({data: {activityId, memberId: member.id, patientId: actor.sub, date: dto.date, dayNumber: activityDay(member.startDate, dto.date), formType: type, schemaVersion: YUANQIZHAN_SCHEMA_VERSION, formSnapshot: formDefinition(type), status: dto.status, answers, photos, submittedAt, createdAt: now, updatedAt: now}});
      await tx.yuanqizhanRecordRevision.create({data: {recordId: row.id, memberId: member.id, version: row.version, status: row.status, answers, photos, submittedAt, requestKey: dto.idempotencyKey, requestFingerprint: fingerprint, createdAt: row.updatedAt}});
      await tx.auditLog.create({data: {actorId: actor.sub, action: dto.status === 'SUBMITTED' ? 'YUANQIZHAN_RECORD_SUBMIT' : 'YUANQIZHAN_RECORD_DRAFT', resourceType: 'YUANQIZHAN_RECORD', resourceId: row.id, metadata: {version: row.version}}});
      const finalNow = new Date(), finalWindow = this.writable(activity, member, finalNow);
      if (finalWindow.date !== dto.date) throw new ConflictException('北京时间日期已切换，请刷新今日表单');
      return this.recordView(row, activity, member, finalNow);
    });
  }
  async uploadPhoto(req: Request, activityId: string, slot: string, file?: UploadFile) {
    const actor = await this.clinical.actor(req); this.patient(actor);
    if (!PHOTO_SLOTS.includes(slot as PhotoSlot)) throw new BadRequestException('照片槽无效');
    return this.transaction(async (tx) => {
      const activity = await this.lockActivity(tx, activityId), member = await this.lockMember(tx, activityId, actor.sub);
      const window = this.writable(activity, member);
      if (window.formType !== 'milestone') throw new ForbiddenException('仅第1、8、15天可上传阶段照片');
      const asset = await this.media.uploadYuanqizhan(req, file, {memberId: member.id, patientId: actor.sub, activityId, date: window.date, slot}, tx);
      // Recheck date before committing, including a slow upload crossing midnight.
      const finalWindow = this.writable(activity, member);
      if (finalWindow.date !== window.date) throw new ConflictException('北京时间日期已切换，请刷新今日表单后重新上传');
      await tx.yuanqizhanPhoto.create({data: {memberId: member.id, date: window.date, slot, assetId: asset.id}});
      const committedWindow = this.writable(activity, member);
      if (committedWindow.date !== window.date) throw new ConflictException('北京时间日期已切换，请刷新今日表单后重新上传');
      return {...asset, date: window.date, slot};
    });
  }
}

@Controller('yuanqizhan')
export class YuanqizhanController {
  constructor(private readonly service: YuanqizhanService) {}
  @Get('activities') activities(@Req() req: Request, @Query() dto: YuanqizhanPageDto) { return this.service.activities(req, dto); }
  @Post('activities') create(@Req() req: Request, @Body() dto: YuanqizhanCreateDto) { return this.service.createActivity(req, dto); }
  @Patch('activities/:activityId') patch(@Req() req: Request, @Param('activityId') id: string, @Body() dto: YuanqizhanPatchDto) { return this.service.patchActivity(req, id, dto); }
  @Get('activities/:activityId/candidates') candidates(@Req() req: Request, @Param('activityId') id: string, @Query() dto: YuanqizhanPageDto) { return this.service.candidates(req, id, dto); }
  @Get('activities/:activityId/members') members(@Req() req: Request, @Param('activityId') id: string, @Query() dto: YuanqizhanPageDto) { return this.service.members(req, id, dto); }
  @Post('activities/:activityId/members') add(@Req() req: Request, @Param('activityId') id: string, @Body() dto: YuanqizhanAddMembersDto) { return this.service.addMembers(req, id, dto); }
  @Delete('activities/:activityId/members/:patientId') remove(@Req() req: Request, @Param('activityId') id: string, @Param('patientId') patientId: string) { return this.service.removeMember(req, id, patientId); }
  @Get('my/activities') my(@Req() req: Request) { return this.service.myActivities(req); }
  @Get('patients/:patientId/activities') patientActivities(@Req() req: Request, @Param('patientId') patientId: string, @Query() dto: YuanqizhanPageDto) { return this.service.patientActivities(req, patientId, dto); }
  @Get(':activityId/today') today(@Req() req: Request, @Param('activityId') id: string) { return this.service.today(req, id); }
  @Get(':activityId/records') records(@Req() req: Request, @Param('activityId') id: string, @Query() dto: YuanqizhanPageDto) { return this.service.records(req, id, dto); }
  @Get(':activityId/records/:date') record(@Req() req: Request, @Param('activityId') id: string, @Param('date') date: string) { return this.service.record(req, id, date); }
  @Get(':activityId/records/:date/revisions') revisions(@Req() req: Request, @Param('activityId') id: string, @Param('date') date: string) { return this.service.revisions(req, id, date); }
  @Post(':activityId/records') save(@Req() req: Request, @Param('activityId') id: string, @Body() dto: YuanqizhanSaveDto) { return this.service.save(req, id, dto); }
  @Post(':activityId/photos/:slot') @UseInterceptors(FileInterceptor('file', {limits: {fileSize: 10485760 + 1, files: 1, fields: 0}})) photo(@Req() req: Request, @Param('activityId') id: string, @Param('slot') slot: string, @UploadedFile() file?: UploadFile) { return this.service.uploadPhoto(req, id, slot, file); }
  @Get(':activityId/patients/:patientId/records') patientRecords(@Req() req: Request, @Param('activityId') id: string, @Param('patientId') patientId: string, @Query() dto: YuanqizhanPageDto) { return this.service.records(req, id, dto, patientId); }
  @Get(':activityId/patients/:patientId/records/:date') patientRecord(@Req() req: Request, @Param('activityId') id: string, @Param('patientId') patientId: string, @Param('date') date: string) { return this.service.record(req, id, date, patientId); }
}
