import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DailyCheckInLink, DailyCheckInRecord, Prisma } from '@prisma/client';
import type { Request } from 'express';
import * as QRCode from 'qrcode';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;
const SOURCE = 'DAILY_CHECK_IN';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const checkInDate = (now = new Date()) => new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const invalidLink = () => new NotFoundException('填报链接无效或已停用，请联系服务人员获取新链接');
type Database = Prisma.TransactionClient;
type Answers = Record<string, number | string>;

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

/** All answers are optional; explicit zero is preserved and unfamiliar fields fail closed. */
export function validateCheckInAnswers(raw: unknown): Answers {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('选填信息格式不正确');
  const result: Answers = {};
  const ranges: Record<string, [number, number]> = {
    fatigue: [1, 5], hunger: [1, 5], appetite: [-2, 2], sleep_quality: [1, 5],
    energy_complexion: [1, 5], bowel_count: [0, 30], stool_type: [1, 7],
  };
  for (const [key, value] of Object.entries(raw)) {
    if (Object.prototype.hasOwnProperty.call(ranges, key)) {
      const [min, max] = ranges[key];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new BadRequestException('选填数值或选项无效');
      result[key] = value;
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
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

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

  private recordView(row: DailyCheckInRecord) {
    return { date: row.date, version: row.version, weightKg: Number(row.weightKg), answers: row.answers as Answers, updatedAt: row.updatedAt };
  }

  async context(dto: DailyCheckInTokenDto) {
    const link = await this.resolve(this.prisma, dto.token);
    return this.prisma.$transaction(async (tx) => {
      await this.lockPatient(tx, link.patientId);
      await this.resolve(tx, dto.token);
      const date = checkInDate();
      const row = await tx.dailyCheckInRecord.findUnique({ where: { patientId_date: { patientId: link.patientId, date } } });
      return { date, clientLabel: `客户${hash(link.patientId).slice(0, 8).toUpperCase()}`, record: row ? this.recordView(row) : null };
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
        await this.resolve(tx, dto.token);
        if (dto.date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面填写今天的信息');
        const where = { patientId_date: { patientId: link.patientId, date: dto.date } };
        const prior = await tx.dailyCheckInRecord.findUnique({ where });
        // A retry of the same payload is safe even after a lost successful response.
        if (prior && dto.version === prior.version - 1 && Number(prior.weightKg) === dto.weightKg && hash(JSON.stringify(Object.entries(prior.answers as Answers).sort())) === hash(JSON.stringify(Object.entries(answers).sort()))) return this.recordView(prior);
        if ((prior?.version ?? 0) !== dto.version) throw new ConflictException('今天的填报已更新，请重新加载后确认再保存');
        const now = new Date();
        const healthData = { weightKg: dto.weightKg, measuredAt: now };
        const health = prior
          ? await tx.healthRecord.update({ where: { id: prior.healthRecordId }, data: healthData })
          : await tx.healthRecord.create({ data: { patientId: link.patientId, recordType: 'WEIGHT', source: SOURCE, ...healthData } });
        const row = prior
          ? await tx.dailyCheckInRecord.update({ where, data: { weightKg: dto.weightKg, answers, version: { increment: 1 } } })
          : await tx.dailyCheckInRecord.create({ data: { patientId: link.patientId, date: dto.date, weightKg: dto.weightKg, answers, healthRecordId: health.id } });
        await tx.auditLog.create({ data: { actorId: null, action: 'DAILY_CHECK_IN_SUBMIT', resourceType: 'DAILY_CHECK_IN_RECORD', resourceId: row.id, metadata: { patientId: link.patientId, date: dto.date, version: row.version, access: 'CAPABILITY_LINK' } } });
        if (dto.date !== checkInDate()) throw new ConflictException('填报日期已变化，请刷新页面填写今天的信息');
        return this.recordView(row);
      });
    } catch (error) {
      if (['P2002', 'P2034'].includes(String((error as { code?: string }).code))) throw new ConflictException('今天的填报已更新，请重新加载后确认再保存');
      throw error;
    }
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
    const items = rows.map((row) => {
      const result = this.recordView(row);
      if (actor.role === 'NUTRITIONIST') {
        // Free text can contain identity; nutritionists receive only structured values.
        const { bowel_extra: _privateText, ...safe } = result.answers;
        return { ...result, answers: safe, redactedAnswerKeys: ['bowel_extra'] };
      }
      return result;
    });
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

@Controller('public/daily-check-in')
export class DailyCheckInPublicController {
  constructor(private readonly service: DailyCheckInService) {}
  @Post('context') context(@Body() dto: DailyCheckInTokenDto) { return this.service.context(dto); }
  @Post('submit') submit(@Body() dto: DailyCheckInSubmitDto) { return this.service.submit(dto); }
}
