import { BadRequestException, Body, CanActivate, ConflictException, Controller, Delete, ExecutionContext, ForbiddenException, Get, HttpException, Injectable, NotFoundException, Param, Post, Query, Req, Res, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DailyCheckInLink, DailyCheckInRecord, MediaAsset, Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import * as QRCode from 'qrcode';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';
import { MediaService, UploadFile } from './media';
import { DAILY_MEALS, DAILY_PHOTO_DAILY_LIMIT, DAILY_PHOTO_MAX_BYTES, DAILY_PHOTO_TYPE, DailyMeal, mealPhotoIds } from './daily-check-in-photo-policy';
import { assertDailyCheckInImageIntegrity, dailyImageMime } from './daily-check-in-image';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;
const SOURCE = 'DAILY_CHECK_IN';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const checkInDate = (now = new Date()) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const invalidLink = () => new NotFoundException('填报链接无效或已停用，请联系服务人员获取新链接');
type Database = Prisma.TransactionClient;
type Answers = Record<string, number | string | string[]>;

export class DailyCheckInTokenDto {
  @IsString({ message: '填报链接无效，请联系服务人员获取新链接' })
  @Matches(TOKEN_PATTERN, { message: '填报链接无效，请联系服务人员获取新链接' }) token!: string;
}

export class DailyCheckInSubmitDto extends DailyCheckInTokenDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsInt() @Min(0) @Max(1000000) version!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(20) @Max(400) weightKg!: number;
  @IsOptional() @IsObject() answers?: Record<string, unknown>;
}

export class DailyCheckInPhotoRefreshDto extends DailyCheckInTokenDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsArray() @ArrayMaxSize(9) @ArrayUnique() @IsString({ each: true })
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, { each: true }) photoIds!: string[];
}

/** All answers are optional; explicit zero is preserved and unfamiliar fields fail closed. */
export function validateCheckInAnswers(raw: unknown): Answers {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('选填信息格式不正确');
  const result: Answers = {};
  const ranges: Record<string, [number, number]> = {
    fatigue: [1, 5], hunger: [1, 5], appetite: [-2, 2], sleep_quality: [1, 5],
    energy_complexion: [1, 5], bowel_count: [0, 30], stool_type: [1, 7],
    exercise_minutes: [0, 1440], water_ml: [0, 20000],
  };
  for (const [key, value] of Object.entries(raw)) {
    if (Object.prototype.hasOwnProperty.call(ranges, key)) {
      const [min, max] = ranges[key];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new BadRequestException('选填数值或选项无效');
      result[key] = value;
    } else if (key === 'waist_cm') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 30 || value > 300 || Math.abs(value * 10 - Math.round(value * 10)) > 1e-7) throw new BadRequestException('腰围需为30至300 cm，最多一位小数');
      result[key] = value;
    } else if (key === 'sleep_start' || key === 'sleep_end') {
      if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new BadRequestException('睡眠时间需为有效的24小时制时分');
      result[key] = value;
    } else if (DAILY_MEALS.some(meal => key === `${meal}_text`)) {
      if (typeof value !== 'string' || value.length > 500) throw new BadRequestException('每餐文字最多填写500字');
      if (value.trim()) result[key] = value.trim();
    } else if (DAILY_MEALS.some(meal => key === `${meal}_photo_ids`)) {
      if (!Array.isArray(value) || value.length > 3 || new Set(value).size !== value.length || value.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id))) throw new BadRequestException('每餐最多选择3张有效照片');
      if (value.length) result[key] = value;
    } else if (key === 'bowel_ease') {
      if (typeof value !== 'string' || !['SMOOTH', 'STRAINED', 'DIFFICULT', 'BLOATING'].includes(value)) throw new BadRequestException('排便感受选项无效');
      result[key] = value;
    } else if (key === 'bowel_extra') {
      if (typeof value !== 'string' || value.length > 200) throw new BadRequestException('附加观察最多填写200字');
      if (value.trim()) result[key] = value.trim();
    } else throw new BadRequestException('包含不支持的填报字段');
  }
  return result;
}

@Injectable()
export class DailyCheckInService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService, private readonly media?: MediaService) {}

  private token(patientId: string, nonce: string) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('每日填报签名配置未完成');
    const signature = createHmac('sha256', secret).update(`daily-check-in:v1:${patientId}:${nonce}`).digest('base64url');
    return `${nonce}.${signature}`;
  }

  private appUrl() {
    try {
      const configured = process.env.DAILY_CHECK_IN_APP_URL?.trim();
      const url = configured ? new URL(configured) : new URL(new URL(process.env.API_PUBLIC_URL ?? '').origin);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      return url.toString().replace(/\/$/, '');
    } catch { throw new ServiceUnavailableException('每日填报访问地址未配置，请设置 DAILY_CHECK_IN_APP_URL 或 API_PUBLIC_URL'); }
  }

  private async patient(database: Database, patientId: string) {
    const patient = await database.user.findUnique({ where: { id: patientId }, select: { id: true, role: true, status: true, deletedAt: true, displayName: true, phone: true } });
    if (!patient || patient.role !== 'PATIENT' || patient.status !== 'ACTIVE' || patient.deletedAt) throw invalidLink();
    return patient;
  }

  private async authorize(database: Database, actor: Actor, patientId: string, action: 'records' | 'share' | 'manage' = 'records') {
    if (!['HEALTH_MANAGER', 'DOCTOR', 'NUTRITIONIST'].includes(actor.role)) throw new ForbiddenException('当前岗位无权访问每日填报');
    if (action === 'manage' && actor.role === 'NUTRITIONIST') throw new ForbiddenException('当前岗位不能重置或停用客户填报链接');
    const patient = await this.patient(database, patientId);
    const enrollment = await database.careEnrollment.findUnique({ where: { patientId }, select: { healthManagerId: true, doctorId: true, nutritionistId: true, clientCode: true } });
    const relation = await database.careRelation.findFirst({ where: { patientId, practitionerId: actor.sub, status: 'ACTIVE' }, select: { id: true } });
    const field = actor.role === 'HEALTH_MANAGER' ? 'healthManagerId' : actor.role === 'DOCTOR' ? 'doctorId' : 'nutritionistId';
    const assigned = !!relation && (!enrollment || enrollment[field] === actor.sub);
    const canViewLink = assigned;
    const canManageLink = assigned && actor.role !== 'NUTRITIONIST';
    if ((action === 'share' && !canViewLink) || (action === 'manage' && !canManageLink) || (actor.role !== 'HEALTH_MANAGER' && !assigned)) throw new ForbiddenException('该客户未分配给您或服务关系已结束');
    return { patient, canViewLink, canManageLink };
  }

  private async lockPatient(database: Database, patientId: string) {
    // This stable parent row serializes first-submit, edits, reset and revoke operations.
    await database.$queryRaw`SELECT id FROM User WHERE id = ${patientId} FOR UPDATE`;
  }

  private async linkView(row: DailyCheckInLink) {
    if (row.revokedAt) return { url: '', qrDataUrl: '', revoked: true };
    const url = `${this.appUrl()}/#/daily-check-in/${this.token(row.patientId, row.nonce)}`;
    return { url, qrDataUrl: await QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: 'M' }), revoked: false };
  }

  async link(req: Request, patientId: string, reset = false) {
    const actor = await this.clinical.actor(req);
    this.appUrl();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockPatient(tx, patientId);
      await this.authorize(tx, actor, patientId, reset ? 'manage' : 'share');
      const prior = await tx.dailyCheckInLink.findUnique({ where: { patientId } });
      if (prior && !reset) {
        // Recompute after signing-key rotation so reissued staff links stay usable.
        const tokenHash = hash(this.token(patientId, prior.nonce));
        if (!prior.revokedAt && prior.tokenHash !== tokenHash) return tx.dailyCheckInLink.update({ where: { patientId }, data: { tokenHash } });
        return prior;
      }
      const nonce = randomBytes(32).toString('base64url');
      const data = { nonce, tokenHash: hash(this.token(patientId, nonce)), revokedAt: null };
      const next = prior ? await tx.dailyCheckInLink.update({ where: { patientId }, data }) : await tx.dailyCheckInLink.create({ data: { patientId, ...data } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: reset ? 'DAILY_CHECK_IN_LINK_RESET' : 'DAILY_CHECK_IN_LINK_CREATE', resourceType: 'PATIENT', resourceId: patientId } });
      return next;
    });
    return this.linkView(row);
  }

  async revoke(req: Request, patientId: string) {
    const actor = await this.clinical.actor(req);
    await this.prisma.$transaction(async (tx) => {
      await this.lockPatient(tx, patientId);
      await this.authorize(tx, actor, patientId, 'manage');
      const row = await tx.dailyCheckInLink.findUnique({ where: { patientId } });
      if (row && !row.revokedAt) {
        await tx.dailyCheckInLink.update({ where: { patientId }, data: { revokedAt: new Date() } });
        await tx.auditLog.create({ data: { actorId: actor.sub, action: 'DAILY_CHECK_IN_LINK_REVOKE', resourceType: 'PATIENT', resourceId: patientId } });
      }
    });
    return { revoked: true };
  }

  private async resolve(database: Database, token: string) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw invalidLink();
    const row = await database.dailyCheckInLink.findUnique({ where: { tokenHash: hash(token) } });
    if (!row || row.revokedAt) throw invalidLink();
    const expected = this.token(row.patientId, row.nonce);
    if (token.length !== expected.length || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) throw invalidLink();
    await this.patient(database, row.patientId);
    return row;
  }

  private async recordView(row: DailyCheckInRecord, database: Database = this.prisma, link?: DailyCheckInLink, actor?: Actor) {
    const ids = mealPhotoIds(row.answers);
    const photos = ids.length ? await Promise.all((await this.selectedPhotos(database, row.patientId, row.date, row.answers as Answers))
      .map(asset => link ? this.publicPhotoView(asset, link) : this.media!.dailyCheckInPhotoView(actor!, asset.id))) : [];
    return { date: row.date, version: row.version, weightKg: Number(row.weightKg), answers: row.answers as Answers, updatedAt: row.updatedAt, photos };
  }

  async context(dto: DailyCheckInTokenDto) {
    const link = await this.resolve(this.prisma, dto.token);
    return this.prisma.$transaction(async (tx) => {
      await this.lockPatient(tx, link.patientId);
      const currentLink = await this.resolve(tx, dto.token);
      const date = checkInDate();
      const row = await tx.dailyCheckInRecord.findUnique({ where: { patientId_date: { patientId: link.patientId, date } } });
      return { date, clientLabel: `客户${hash(link.patientId).slice(0, 8).toUpperCase()}`, record: row ? await this.recordView(row, tx, currentLink) : null };
    });
  }

  async submit(dto: DailyCheckInSubmitDto) {
    if (typeof dto.weightKg !== 'number' || !Number.isFinite(dto.weightKg) || dto.weightKg < 20 || dto.weightKg > 400 || Math.abs(dto.weightKg * 100 - Math.round(dto.weightKg * 100)) > 1e-7) throw new BadRequestException('请填写20至400 kg之间的体重，最多两位小数');
    if (!Number.isInteger(dto.version) || dto.version < 0 || dto.version > 1000000) throw new BadRequestException('填报版本无效，请重新打开页面');
    const answers = validateCheckInAnswers(dto.answers);
    const link = await this.resolve(this.prisma, dto.token);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockPatient(tx, link.patientId);
        const currentLink = await this.resolve(tx, dto.token);
        if (dto.date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面填写今天的信息');
        const where = { patientId_date: { patientId: link.patientId, date: dto.date } };
        const prior = await tx.dailyCheckInRecord.findUnique({ where });
        // A retry of the same payload is safe even after a lost successful response.
        if (prior && dto.version === prior.version - 1 && Number(prior.weightKg) === dto.weightKg && hash(JSON.stringify(Object.entries(prior.answers as Answers).sort())) === hash(JSON.stringify(Object.entries(answers).sort()))) return this.recordView(prior, tx, currentLink);
        if ((prior?.version ?? 0) !== dto.version) throw new ConflictException('今天的填报已更新，请重新加载后确认再保存');
        await this.selectedPhotos(tx, link.patientId, dto.date, answers);
        const removedIds = mealPhotoIds(prior?.answers).filter(id => !mealPhotoIds(answers).includes(id));
        if (removedIds.length) await tx.mediaAsset.updateMany({ where: { id: { in: removedIds }, ownerId: link.patientId, referenceType: DAILY_PHOTO_TYPE, referenceId: { startsWith: dto.date + ':' }, status: 'READY' }, data: { status: 'DELETED', deletedAt: new Date() } });
        const now = new Date();
        const healthData = { weightKg: dto.weightKg, waistCm: typeof answers.waist_cm === 'number' ? answers.waist_cm : null, measuredAt: now };
        const health = prior
          ? await tx.healthRecord.update({ where: { id: prior.healthRecordId }, data: healthData })
          : await tx.healthRecord.create({ data: { patientId: link.patientId, recordType: 'WEIGHT', source: SOURCE, ...healthData } });
        const row = prior
          ? await tx.dailyCheckInRecord.update({ where, data: { weightKg: dto.weightKg, answers, version: { increment: 1 } } })
          : await tx.dailyCheckInRecord.create({ data: { patientId: link.patientId, date: dto.date, weightKg: dto.weightKg, answers, healthRecordId: health.id } });
        await tx.auditLog.create({ data: { actorId: null, action: 'DAILY_CHECK_IN_SUBMIT', resourceType: 'DAILY_CHECK_IN_RECORD', resourceId: row.id, metadata: { patientId: link.patientId, date: dto.date, version: row.version, access: 'CAPABILITY_LINK' } } });
        if (dto.date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面填写今天的信息');
        return this.recordView(row, tx, currentLink);
      });
    } catch (error) {
      if (['P2002', 'P2034'].includes(String((error as { code?: string }).code))) throw new ConflictException('今天的填报已更新，请重新加载后确认再保存');
      throw error;
    }
  }

  private async selectedPhotos(database: Database, patientId: string, date: string, answers: Answers): Promise<MediaAsset[]> {
    const ids = mealPhotoIds(answers);
    if (!ids.length) return [];
    if (new Set(ids).size !== ids.length) throw new BadRequestException('同一照片不能重复用于不同餐次');
    const assets = await database.mediaAsset.findMany({ where: { id: { in: ids }, ownerId: patientId, referenceType: DAILY_PHOTO_TYPE, status: 'READY', deletedAt: null } });
    return DAILY_MEALS.flatMap(meal => {
      const selected = answers[`${meal}_photo_ids`] as string[] | undefined;
      return (selected ?? []).map(id => {
        const asset = assets.find(item => item.id === id && item.referenceId === `${date}:${meal}`);
        if (!asset) throw new BadRequestException('餐食照片已失效或不属于当前客户、日期和餐次，请重新选择');
        return asset;
      });
    });
  }

  private photoSignature(asset: MediaAsset, link: DailyCheckInLink, expires: number) {
    const secret = process.env.MEDIA_SIGNING_SECRET ?? process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('媒体签名密钥未配置');
    return createHmac('sha256', secret).update(JSON.stringify(['daily-check-in-photo:v1', asset.id, asset.ownerId, asset.referenceId, link.id, link.tokenHash, expires])).digest('hex');
  }

  private publicPhotoView(asset: MediaAsset, link: DailyCheckInLink) {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const origin = (process.env.API_PUBLIC_URL ?? new URL(this.appUrl()).origin).replace(/\/$/, '');
    const url = `${origin}/api/v1/public/daily-check-in/photos/${encodeURIComponent(asset.id)}/content?link=${encodeURIComponent(link.id)}&expires=${expires}&sig=${this.photoSignature(asset, link, expires)}`;
    return { id: asset.id, mimeType: asset.mimeType, url };
  }

  private async checkPhotoQuota(database: Database, patientId: string, date: string) {
    const count = await database.mediaAsset.count({ where: { ownerId: patientId, referenceType: DAILY_PHOTO_TYPE, referenceId: { startsWith: date + ':' } } });
    if (count >= DAILY_PHOTO_DAILY_LIMIT) throw new HttpException('今天上传照片次数已达30次，请明天再试；仍可保存文字和体重', 429);
  }

  /** Runs as a guard before Multer allocates an upload buffer. Rechecked under the patient lock. */
  async authorizePhotoUpload(token: string) {
    const link = await this.resolve(this.prisma, token);
    await this.checkPhotoQuota(this.prisma, link.patientId, checkInDate());
  }

  async uploadPhoto(token: string, fields: Record<string, unknown>, file: UploadFile | undefined) {
    const link = await this.resolve(this.prisma, token);
    const date = fields.date;
    const meal = fields.meal;
    if (Object.keys(fields).some(key => !['date', 'meal'].includes(key)) || typeof date !== 'string'
      || typeof meal !== 'string' || !DAILY_MEALS.includes(meal as DailyMeal)) throw new BadRequestException('请提供有效的填报日期和餐次');
    if (date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面填写今天的信息');
    if (!file || !Buffer.isBuffer(file.buffer) || file.size !== file.buffer.length || file.size < 1 || file.size > DAILY_PHOTO_MAX_BYTES) throw new BadRequestException('每张餐食照片需在10MiB以内');
    const mimeType = dailyImageMime(file.buffer);
    const validated = { ...file, mimetype: mimeType };
    const data = this.media!.dailyCheckInPhotoData(link.patientId, date, meal as DailyMeal, validated);
    // Reserve outside the storage/finalization transaction: failed uploads still consume quota.
    const reservation = await this.prisma.$transaction(async tx => {
      await this.lockPatient(tx, link.patientId);
      await this.resolve(tx, token);
      if (date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面');
      await this.checkPhotoQuota(tx, link.patientId, date);
      return tx.mediaAsset.create({ data });
    });
    try {
      // Decode after quota admission, but before any original bytes reach local/OSS storage.
      await assertDailyCheckInImageIntegrity(file.buffer, mimeType);
      await this.media!.storeDailyCheckInPhoto(reservation, validated);
      return await this.prisma.$transaction(async tx => {
        await this.lockPatient(tx, link.patientId);
        const currentLink = await this.resolve(tx, token);
        if (date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面');
        const changed = await tx.mediaAsset.updateMany({ where: { id: reservation.id, ownerId: link.patientId, status: 'PENDING', referenceType: DAILY_PHOTO_TYPE, referenceId: `${date}:${meal}` }, data: { status: 'READY' } });
        if (changed.count !== 1) throw new ConflictException('照片上传状态已变化，请重试');
        const asset = await tx.mediaAsset.findUniqueOrThrow({ where: { id: reservation.id } });
        await tx.auditLog.create({ data: { actorId: null, action: 'DAILY_CHECK_IN_PHOTO_UPLOAD', resourceType: 'MEDIA_ASSET', resourceId: asset.id, metadata: { patientId: link.patientId, date, meal, access: 'CAPABILITY_LINK' } } });
        return this.publicPhotoView(asset, currentLink);
      });
    } catch (error) {
      // Retain any original bytes and their metadata for normal retention; never expose failed uploads.
      await this.prisma.mediaAsset.updateMany({ where: { id: reservation.id, ownerId: link.patientId, status: 'PENDING' }, data: { status: 'FAILED' } });
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('照片上传暂时失败，请稍后重试');
    }
  }

  async refreshPhotos(dto: DailyCheckInPhotoRefreshDto) {
    const link = await this.resolve(this.prisma, dto.token);
    if (dto.date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面');
    if (!Array.isArray(dto.photoIds) || dto.photoIds.length > 9 || new Set(dto.photoIds).size !== dto.photoIds.length
      || dto.photoIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id))) throw new BadRequestException('照片列表无效');
    return this.prisma.$transaction(async tx => {
      await this.lockPatient(tx, link.patientId);
      const currentLink = await this.resolve(tx, dto.token);
      if (dto.date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面');
      const assets = await tx.mediaAsset.findMany({ where: { id: { in: dto.photoIds }, ownerId: link.patientId, status: 'READY', deletedAt: null, referenceType: DAILY_PHOTO_TYPE, referenceId: { in: DAILY_MEALS.map(meal => `${dto.date}:${meal}`) } } });
      if (assets.length !== dto.photoIds.length) throw new NotFoundException('餐食照片不存在或已失效');
      return { photos: dto.photoIds.map(id => this.publicPhotoView(assets.find(asset => asset.id === id)!, currentLink)) };
    });
  }

  async photoContent(id: string, linkId: string, expiresText: string, sig: string) {
    const now = Math.floor(Date.now() / 1000), expires = Number(expiresText);
    if (!/^\d+$/.test(expiresText ?? '') || !Number.isSafeInteger(expires) || expires <= now || expires > now + 600
      || !/^[a-f0-9]{64}$/.test(sig ?? '')) throw new ForbiddenException('照片链接已过期或无效');
    const link = typeof linkId === 'string' ? await this.prisma.dailyCheckInLink.findUnique({ where: { id: linkId } }) : null;
    if (!link || link.revokedAt || link.tokenHash !== hash(this.token(link.patientId, link.nonce))) throw invalidLink();
    await this.patient(this.prisma, link.patientId);
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.ownerId !== link.patientId || asset.referenceType !== DAILY_PHOTO_TYPE || asset.status !== 'READY' || asset.deletedAt
      || !DAILY_MEALS.some(meal => asset.referenceId === `${checkInDate()}:${meal}`)) throw new NotFoundException('餐食照片不存在或已失效');
    const expected = this.photoSignature(asset, link, expires);
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) throw new ForbiddenException('照片链接已过期或无效');
    return this.media!.dailyCheckInPhotoContent(asset);
  }

  async records(req: Request, patientId: string, requestedPage?: string) {
    const actor = await this.clinical.actor(req);
    const { patient, canViewLink, canManageLink } = await this.authorize(this.prisma, actor, patientId);
    const page = requestedPage === undefined ? 1 : Number(requestedPage);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new BadRequestException('页码无效');
    const pageSize = 30;
    const [rows, total] = await Promise.all([
      this.prisma.dailyCheckInRecord.findMany({ where: { patientId }, orderBy: { date: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.dailyCheckInRecord.count({ where: { patientId } }),
    ]);
    const items = await Promise.all(rows.map(async (row) => {
      const result = await this.recordView(row, this.prisma, undefined, actor);
      if (actor.role === 'NUTRITIONIST') {
        // Bowel observations remain private; meal descriptions support assigned nutrition care.
        const { bowel_extra: _privateText, ...safe } = result.answers;
        return { ...result, answers: safe, redactedAnswerKeys: ['bowel_extra'] };
      }
      return result;
    }));
    await this.prisma.auditLog.create({ data: { actorId: actor.sub, action: 'DAILY_CHECK_IN_RECORDS_READ', resourceType: 'PATIENT', resourceId: patient.id } });
    return { items, total, page, pageSize, hasMore: page * pageSize < total, canViewLink, canManageLink };
  }
}

@Controller('care-management/patients/:patientId/daily-check-in')
export class DailyCheckInStaffController {
  constructor(private readonly service: DailyCheckInService) {}
  @Get('link') link(@Req() req: Request, @Param('patientId') id: string) { return this.service.link(req, id); }
  @Post('link/reset') reset(@Req() req: Request, @Param('patientId') id: string) { return this.service.link(req, id, true); }
  @Delete('link') revoke(@Req() req: Request, @Param('patientId') id: string) { return this.service.revoke(req, id); }
  @Get('records') records(@Req() req: Request, @Param('patientId') id: string, @Query('page') page?: string) { return this.service.records(req, id, page); }
}

@Injectable()
export class DailyCheckInPhotoUploadGuard implements CanActivate {
  constructor(private readonly service: DailyCheckInService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-daily-check-in-token'];
    if (typeof token !== 'string') throw invalidLink();
    await this.service.authorizePhotoUpload(token);
    return true;
  }
}

@Controller('public/daily-check-in')
export class DailyCheckInPublicController {
  constructor(private readonly service: DailyCheckInService) {}
  @Post('context') context(@Body() dto: DailyCheckInTokenDto) { return this.service.context(dto); }
  @Post('submit') submit(@Body() dto: DailyCheckInSubmitDto) { return this.service.submit(dto); }
  @Post('photos/refresh') refresh(@Body() dto: DailyCheckInPhotoRefreshDto) { return this.service.refreshPhotos(dto); }
  @Post('photos')
  @UseGuards(DailyCheckInPhotoUploadGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DAILY_PHOTO_MAX_BYTES, files: 1, fields: 2, fieldSize: 100, parts: 4 } }))
  uploadPhoto(@Req() req: Request, @UploadedFile() file: UploadFile | undefined) {
    return this.service.uploadPhoto(req.headers['x-daily-check-in-token'] as string, req.body as Record<string, unknown>, file);
  }
  @Get('photos/:id/content')
  async photoContent(@Param('id') id: string, @Query('link') link: string, @Query('expires') expires: string, @Query('sig') sig: string, @Res() res: Response) {
    const file = await this.service.photoContent(id, link, expires, sig);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline; filename="meal-photo"');
    res.type(file.mimeType);
    if (file.fullPath) return res.sendFile(file.fullPath, { dotfiles: 'allow' });
    if (!file.stream) throw new ServiceUnavailableException('文件读取失败');
    await pipeline(file.stream, res);
  }
}
