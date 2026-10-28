import { Transform } from 'class-transformer';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Optional, Param, Patch, Post, Req } from '@nestjs/common';
import { Equals, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, isISO8601, Matches, MaxLength } from 'class-validator';
import { Prisma, UserRole } from '@prisma/client';
import type { Request } from 'express';
import type { Actor } from './auth';
import { CareManagementService } from './care-management';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';
import { MediaService } from './media';
import { configuredVisionOcrProvider, metricRules, type VisionImage, type VisionSource } from './vision-ocr';
export { metricRules } from './vision-ocr';

export const reportCategories = ['BODY_COMPOSITION', 'EXERCISE_ASSESSMENT', 'MEDICAL_EXAMINATION'] as const;
type ReportCategory = typeof reportCategories[number];
const reportTitles: Record<ReportCategory, string> = { BODY_COMPOSITION: '人体成分检测报告', EXERCISE_ASSESSMENT: '运动评估报告', MEDICAL_EXAMINATION: '医学检查报告' };
const rawRoles: UserRole[] = ['HEALTH_MANAGER', 'DOCTOR', 'PATIENT'];
const sourceKinds = ['INBODY_270', 'INBODY270', ...reportCategories, 'OTHER_REPORT'] as const;
const editableStatuses = ['DRAFT', 'FAILED', 'UNCONFIGURED'];
const json = (value: unknown) => value as Prisma.InputJsonValue;

export class HealthReportDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(191) mediaAssetId!: string;
  @IsIn(reportCategories) category!: ReportCategory;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
}
export class ConsentDocumentDto {
  @IsString() @IsNotEmpty() @MaxLength(191) mediaAssetId!: string;
  @IsString() @Matches(/^[A-Za-z0-9._-]{1,32}$/) version!: string;
}
export class CreateOcrDraftDto {
  @IsString() @IsNotEmpty() @MaxLength(191) mediaAssetId!: string;
  @IsIn(sourceKinds) sourceKind!: string;
  @IsOptional() @IsDateString() measuredAt?: string;
  @IsOptional() @IsString() @MaxLength(12000) localText?: string;
  @IsOptional() @Transform(({ obj, key }) => obj[key]) @IsBoolean() localOnly?: boolean;
}
export class UpdateOcrDraftDto {
  @IsOptional() @IsObject() fields?: Record<string, unknown>;
  @IsOptional() @IsDateString() measuredAt?: string;
  @IsDateString() expectedUpdatedAt!: string;
}
export class ConfirmOcrDraftDto {
  @Transform(({ obj, key }) => obj[key]) @IsBoolean() @Equals(true) reviewed!: boolean;
  @IsDateString() expectedUpdatedAt!: string;
}
export class RetryOcrDraftDto {
  @IsOptional() @IsString() @MaxLength(12000) localText?: string;
}

export type MetricKey = keyof typeof metricRules;
export type OcrField = { value: number; unit: string; confidence: number | null; reviewRequired: boolean; source: 'LOCAL_TEXT' | 'MOCK' | 'MANUAL' | VisionSource };
export type OcrFields = Partial<Record<MetricKey, OcrField>>;
type Extraction = { status: 'DRAFT' | 'FAILED' | 'UNCONFIGURED'; fields: OcrFields; errorMessage: string | null };
export interface OcrProvider {
  readonly key: 'disabled' | 'mock' | 'local' | 'bailian' | 'deepseek';
  readonly status: 'UNCONFIGURED' | 'AVAILABLE';
  readonly message: string;
  readonly requiresImage?: boolean;
  readonly syntheticOnly?: boolean;
  recognize(input: { localText?: string; image?: VisionImage }): Promise<Extraction>;
}

function canonicalUnit(value: string) {
  const unit = value.trim().toLowerCase().replace(/\s/g, '').replace('％', '%');
  if (['kg/m2', 'kg/m²', 'kg/㎡'].includes(unit)) return 'kg/m²';
  if (unit === '公斤' || unit === '千克') return 'kg';
  if (unit === '厘米' || unit === '㎝') return 'cm';
  return unit;
}

/** Only explicit labels on a single measurement line are read. Raw text is never returned or stored. */
export function parseLocalReportText(text: string): Extraction {
  if (typeof text !== 'string' || !text.trim() || text.length > 12000) return { status: 'FAILED', fields: {}, errorMessage: '本地模式需要明确标注指标与单位的当次报告文本，请重新输入或手工填写。' };
  const labels: Array<[MetricKey, string]> = [
    ['skeletalMuscleMassKg', '骨骼肌量|骨骼肌质量|SMM|Skeletal\\s+Muscle\\s+Mass'],
    ['muscleMassKg', '肌肉量|肌肉质量|Muscle\\s+Mass'],
    ['heightCm', '身高|Height'], ['weightKg', '体重|Weight'],
    ['bodyFatPct', '体脂率|体脂百分比|PBF|Percent\\s+Body\\s+Fat'],
    ['bmi', 'BMI|身体质量指数|体质指数|Body\\s+Mass\\s+Index'],
    ['waistCm', '腰围|Waist(?:\\s+Circumference)?'], ['hipCm', '臀围|Hip(?:\\s+Circumference)?'],
  ];
  const fields: OcrFields = {};
  for (const line of text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    for (const [key, label] of labels) {
      const pattern = new RegExp(`^(?:${label})\\s*(?:[（(]\\s*([^）)]+)\\s*[）)])?\\s*[:：]?\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*([^\\s]*)\\s*$`, 'i');
      const match = line.match(pattern);
      if (!match) continue;
      if (fields[key]) return { status: 'FAILED', fields: {}, errorMessage: '检测到重复指标，可能含历史或参考值。请仅输入当次检测数据后重试。' };
      const beforeUnit = canonicalUnit(match[1] ?? '');
      const afterUnit = canonicalUnit(match[3] ?? '');
      if (beforeUnit && afterUnit && beforeUnit !== afterUnit) return { status: 'FAILED', fields: {}, errorMessage: '同一指标单位冲突，请核对原报告后重试。' };
      const unit = beforeUnit || afterUnit;
      const value = Number(match[2]);
      const rule = metricRules[key];
      if (unit && unit !== rule.unit) return { status: 'FAILED', fields: {}, errorMessage: '检测指标单位不受支持，请核对原报告后手工填写标准单位。' };
      if (!Number.isFinite(value) || value < rule.min || value > rule.max) return { status: 'FAILED', fields: {}, errorMessage: '检测指标数值无效或超出范围，请核对原报告后手工填写。' };
      // No image recognition took place, so no OCR confidence is invented.
      fields[key] = { value, unit, confidence: null, reviewRequired: true, source: 'LOCAL_TEXT' };
      break;
    }
  }
  return Object.keys(fields).length ? { status: 'DRAFT', fields, errorMessage: null } : { status: 'FAILED', fields: {}, errorMessage: '未找到明确标签的当次指标。不会猜测手写数字或将腰臀比映射成腰围、臀围，请手工核对填写。' };
}

class DisabledOcrProvider implements OcrProvider {
  readonly key = 'disabled' as const;
  readonly status = 'UNCONFIGURED' as const;
  constructor(readonly message = '真实 OCR 尚未配置。照片不会发送第三方，请手工填写并核对检测数值。') {}
  async recognize(): Promise<Extraction> { return { status: 'UNCONFIGURED', fields: {}, errorMessage: this.message }; }
}
class LocalTextOcrProvider implements OcrProvider {
  readonly key = 'local' as const;
  readonly status = 'AVAILABLE' as const;
  readonly message = '本地标签文本解析模式，不进行照片 OCR，不发送第三方；结果必须人工核对。';
  async recognize(input: { localText?: string }) { return parseLocalReportText(input.localText ?? ''); }
}
class MockOcrProvider implements OcrProvider {
  readonly key = 'mock' as const;
  readonly status = 'AVAILABLE' as const;
  readonly message = '模拟模式：返回固定虚构指标，与上传图片内容无关，不能作为真实识别或诊疗依据。';
  async recognize(): Promise<Extraction> {
    const values: Partial<Record<MetricKey, number>> = { heightCm: 168, weightKg: 72, bodyFatPct: 28, bmi: 25.5, skeletalMuscleMassKg: 28 };
    const fields: OcrFields = {};
    for (const [key, value] of Object.entries(values)) {
      const metric = key as MetricKey;
      fields[metric] = { value, unit: metricRules[metric].unit, confidence: null, reviewRequired: true, source: 'MOCK' };
    }
    return { status: 'DRAFT', fields, errorMessage: null };
  }
}
export function configuredOcrProvider(env: NodeJS.ProcessEnv = process.env): OcrProvider {
  const choice = env.OCR_PROVIDER ?? 'disabled';
  if (choice === 'bailian' || choice === 'deepseek') return configuredVisionOcrProvider(choice, env);
  if (choice === 'local') return new LocalTextOcrProvider();
  if (choice === 'mock') return ['test', 'development'].includes(env.NODE_ENV ?? '') && env.OCR_MOCK_ENABLED === 'true'
    ? new MockOcrProvider() : new DisabledOcrProvider('模拟 OCR 仅在测试或开发环境显式启用时可用。真实 OCR 尚未配置。');
  return new DisabledOcrProvider(choice === 'disabled' ? undefined : 'OCR 提供商配置不受支持，识别已禁用。真实 OCR 尚未配置。');
}

/** Validate again at confirmation; database JSON is not trusted as reviewed input. */
export function validateOcrFields(value: unknown, manual = false): OcrFields {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('指标字段必须是对象');
  const entries = Object.entries(value);
  if (entries.length > 8) throw new BadRequestException('检测指标数量无效');
  const output: OcrFields = {};
  for (const [name, input] of entries) {
    if (!Object.prototype.hasOwnProperty.call(metricRules, name)) throw new BadRequestException('包含不支持的检测指标');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('每个指标须包含数值与单位');
    const field = input as Record<string, unknown>;
    if (Object.keys(field).some((key) => !['value', 'unit', 'confidence', 'reviewRequired', 'source'].includes(key))) throw new BadRequestException('指标中包含不支持的字段');
    const key = name as MetricKey;
    const rule = metricRules[key];
    if (typeof field.value !== 'number' || !Number.isFinite(field.value) || field.value < rule.min || field.value > rule.max) throw new BadRequestException(`${name} 数值必须在 ${rule.min}–${rule.max} 范围内`);
    if (typeof field.unit !== 'string' || canonicalUnit(field.unit) !== rule.unit) throw new BadRequestException(`${name} 单位必须为 ${rule.unit}`);
    if (field.confidence !== undefined && field.confidence !== null && (typeof field.confidence !== 'number' || !Number.isFinite(field.confidence) || field.confidence < 0 || field.confidence > 1)) throw new BadRequestException('置信度必须为 0–1 或空值');
    if (field.reviewRequired !== undefined && typeof field.reviewRequired !== 'boolean') throw new BadRequestException('待核对状态无效');
    if (field.source !== undefined && (typeof field.source !== 'string' || !['LOCAL_TEXT', 'MOCK', 'MANUAL', 'BAILIAN_VISION', 'DEEPSEEK_VISION'].includes(field.source))) throw new BadRequestException('指标来源无效');
    output[key] = { value: field.value, unit: rule.unit, confidence: manual ? null : (field.confidence as number | null | undefined) ?? null, reviewRequired: true, source: manual ? 'MANUAL' : (field.source as OcrField['source'] | undefined) ?? 'MANUAL' };
  }
  return output;
}

type DraftRow = { id: string; patientId: string; mediaAssetId: string; provider: string; status: string; fields: unknown; sourceKind: string; measuredAt: Date | null; errorMessage: string | null; createdById: string; createdAt: Date; updatedAt: Date; confirmedAt: Date | null; bodyAssessmentId: string | null };

@Injectable()
export class ReportWorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService, private readonly care: CareManagementService, @Optional() private readonly media?: MediaService) {}

  private assertRawRole(actor: Actor) { if (!rawRoles.includes(actor.role)) throw new ForbiddenException('当前岗位不可访问原始报告、同意书或识别图片'); }
  private async access(req: Request, patientId: string, raw = false) {
    const actor = await this.clinical.actor(req);
    if (raw) this.assertRawRole(actor);
    if (actor.role === 'PATIENT') await this.care.assertSelfPatient(actor, patientId);
    else if (actor.role === 'HEALTH_MANAGER') await this.clinical.assertCare(actor, patientId);
    else await this.care.assertEnrollment(actor, patientId);
    return actor;
  }
  private measuredAt(value: string | undefined) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !isISO8601(value, { strict: true })) throw new BadRequestException('检测时间须为有效 ISO 日期，请人工核对');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1900 || date.getTime() > Date.now() + 60000) throw new BadRequestException('检测时间无效或在未来，请人工核对');
    return date;
  }
  private nextTimestamp(previous: Date) { return new Date(Math.max(Date.now(), previous.getTime() + 1)); }
  /** Serializable reads lock current assignments/user state until the write commits on MySQL. */
  async assertCurrentEnrollment(tx: Prisma.TransactionClient, actor: Actor, patientId: string) {
    this.assertRawRole(actor);
    const user = await tx.user.findUnique({ where: { id: actor.sub }, select: { role: true, status: true } });
    if (!user || user.status !== 'ACTIVE' || user.role !== actor.role) throw new ForbiddenException('账号或岗位已失效');
    const enrollment = await tx.careEnrollment.findUnique({ where: { patientId }, include: { patient: { select: { status: true } } } });
    if (!enrollment || enrollment.patient.status !== 'ACTIVE') throw new ForbiddenException('客户档案已停用');
    if (actor.role === 'PATIENT') {
      if (actor.sub !== patientId) throw new ForbiddenException('只能访问本人档案');
      return;
    }
    const field = actor.role === 'HEALTH_MANAGER' ? 'healthManagerId' : 'doctorId';
    if (enrollment[field] !== actor.sub) throw new ForbiddenException('客户已重新分配，请刷新后重试');
    const relation = await tx.careRelation.findUnique({ where: { patientId_practitionerId: { patientId, practitionerId: actor.sub } }, select: { status: true } });
    if (relation?.status !== 'ACTIVE') throw new ForbiddenException('服务关系已结束');
  }
  async assertBoundSource(tx: Prisma.TransactionClient, row: DraftRow) {
    const asset = await tx.mediaAsset.findUnique({ where: { id: row.mediaAssetId } });
    if (!asset || asset.status !== 'READY' || asset.referenceType !== 'OCR_SOURCE' || asset.referenceId !== row.id) throw new ConflictException('草稿来源图片不可用');
  }
  async assertAsset(tx: Prisma.TransactionClient, actor: Actor, id: string, imageOnly = false) {
    const asset = await tx.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.ownerId !== actor.sub || asset.status !== 'READY' || !(asset.mimeType.startsWith('image/') || (!imageOnly && asset.mimeType === 'application/pdf'))) throw new BadRequestException('请选择本人上传且已就绪的报告图片或 PDF');
    if (asset.referenceType || asset.referenceId || asset.healthRecordId) throw new ConflictException('该媒体已绑定其他业务，不能重复使用');
  }
  async bind(tx: Prisma.TransactionClient, actor: Actor, mediaAssetId: string, type: string, id: string) {
    const result = await tx.mediaAsset.updateMany({ where: { id: mediaAssetId, ownerId: actor.sub, status: 'READY', referenceType: null, referenceId: null, healthRecordId: null }, data: { referenceType: type, referenceId: id, scope: type } });
    if (result.count !== 1) throw new ConflictException('媒体已被绑定或删除，请刷新后重试');
  }
  async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) throw new ConflictException('记录已更新或媒体被占用，请刷新后重试');
      throw error;
    }
  }

  async healthReports(req: Request, patientId: string) {
    const actor = await this.access(req, patientId);
    const rows = await this.prisma.healthReportDocument.findMany({ where: { patientId, ...(actor.role === 'EXERCISE_COACH' ? { category: 'EXERCISE_ASSESSMENT' } : {}), mediaAsset: { status: 'READY' } }, include: { mediaAsset: { select: { mimeType: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    return rows.map((row) => ({ id: row.id, category: row.category, title: rawRoles.includes(actor.role) ? row.title : reportTitles[row.category as ReportCategory] ?? '健康报告', createdAt: row.createdAt, ...(rawRoles.includes(actor.role) ? { mediaAssetId: row.mediaAssetId, mimeType: row.mediaAsset?.mimeType } : {}) }));
  }
  async createHealthReport(req: Request, patientId: string, dto: HealthReportDocumentDto) {
    const actor = await this.access(req, patientId, true);
    if (!reportCategories.includes(dto.category)) throw new BadRequestException('报告类别无效');
    const title = dto.title?.trim() || reportTitles[dto.category];
    if (title.length > 120) throw new BadRequestException('报告标题过长');
    return this.transaction(async (tx) => {
      if (actor.role === 'PATIENT') await this.care.assertSelfPatient(actor, patientId, tx);
      else await this.assertCurrentEnrollment(tx, actor, patientId);
      await this.assertAsset(tx, actor, dto.mediaAssetId);
      const row = await tx.healthReportDocument.create({ data: { patientId, mediaAssetId: dto.mediaAssetId, category: dto.category, title, createdById: actor.sub } });
      await this.bind(tx, actor, dto.mediaAssetId, 'HEALTH_REPORT', row.id);
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'HEALTH_REPORT_CREATE', resourceType: 'HEALTH_REPORT', resourceId: row.id, metadata: { category: dto.category } } });
      return { id: row.id, category: row.category, title: row.title, mediaAssetId: row.mediaAssetId, createdAt: row.createdAt };
    });
  }
  async consentDocuments(req: Request, patientId: string) {
    await this.access(req, patientId, true);
    const rows = await this.prisma.consentDocument.findMany({ where: { patientId, mediaAsset: { status: 'READY' } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    return rows.map((row) => ({ id: row.id, version: row.version, mediaAssetId: row.mediaAssetId, createdAt: row.createdAt }));
  }
  async createConsentDocument(req: Request, patientId: string, dto: ConsentDocumentDto) {
    const actor = await this.access(req, patientId, true);
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(dto.version)) throw new BadRequestException('同意书版本格式无效');
    return this.transaction(async (tx) => {
      await this.assertCurrentEnrollment(tx, actor, patientId);
      await this.assertAsset(tx, actor, dto.mediaAssetId);
      const row = await tx.consentDocument.create({ data: { patientId, mediaAssetId: dto.mediaAssetId, version: dto.version, createdById: actor.sub } });
      await this.bind(tx, actor, dto.mediaAssetId, 'CONSENT_DOCUMENT', row.id);
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'CONSENT_DOCUMENT_ADD', resourceType: 'CONSENT_DOCUMENT', resourceId: row.id, metadata: { version: dto.version } } });
      return { id: row.id, version: row.version, mediaAssetId: row.mediaAssetId, createdAt: row.createdAt };
    });
  }
  async provider(req: Request) {
    const actor = await this.clinical.actor(req);
    this.assertRawRole(actor);
    const provider = configuredOcrProvider();
    const ledgerRequired = (provider.key === 'bailian' || provider.key === 'deepseek') && process.env.NODE_ENV !== 'test';
    if (ledgerRequired) return { provider: provider.key, status: 'UNCONFIGURED', message: '付费图片识别仅通过人体成分逐图授权及预算入口办理；本旧入口只支持手工核对，不发送图片。', photoRecognitionConfigured: false, sendsToThirdParty: false, syntheticOnly: true };
    const canLoad = !provider.requiresImage || !!this.media;
    const available = provider.status === 'AVAILABLE' && canLoad;
    return { provider: provider.key, status: canLoad ? provider.status : 'UNCONFIGURED', message: canLoad ? provider.message : '视觉识别媒体读取服务尚未配置，图片未发送。', photoRecognitionConfigured: !!provider.requiresImage && available, sendsToThirdParty: !!provider.requiresImage && available, syntheticOnly: !!provider.syntheticOnly };
  }
  private async assertBeforeExternal(actor: Actor, patientId: string, mediaAssetId: string, draft?: DraftRow) {
    const database = this.prisma as unknown as Prisma.TransactionClient;
    await this.assertCurrentEnrollment(database, actor, patientId);
    if (draft) {
      await this.assertBoundSource(database, draft);
      const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
      if (!asset || asset.ownerId !== actor.sub) throw new ForbiddenException('只能发送本人上传的识别来源图片');
    } else await this.assertAsset(database, actor, mediaAssetId, true);
  }
  private async extract(localText?: string, context?: { actor: Actor; patientId: string; mediaAssetId: string; draft?: DraftRow }) {
    const provider = configuredOcrProvider();
    if ((provider.key === 'bailian' || provider.key === 'deepseek') && process.env.NODE_ENV !== 'test') return {provider:provider.key,status:'UNCONFIGURED' as const,fields:{},errorMessage:'旧入口不进行付费图片发送；请使用人体成分逐图授权及预算入口，或手工核对。'};
    let image: VisionImage | undefined;
    if (provider.requiresImage && provider.status === 'AVAILABLE') {
      if (!context || !this.media) return { provider: provider.key, status: 'UNCONFIGURED' as const, fields: {}, errorMessage: '视觉识别媒体读取服务尚未配置，图片未发送。' };
      // Health managers may have broad list access; write assignment must pass before any image is sent.
      await this.assertBeforeExternal(context.actor, context.patientId, context.mediaAssetId, context.draft);
      try { image = await this.media.readOwnedImageForOcr(context.actor, context.mediaAssetId); }
      catch (error) {
        if (error instanceof ForbiddenException || error instanceof BadRequestException || error instanceof ConflictException) throw error;
        return { provider: provider.key, status: 'FAILED' as const, fields: {}, errorMessage: '读取识别来源图片失败，图片未发送，请核对上传状态后重试。' };
      }
      // Recheck assignment, user status and source ownership after the asynchronous loader.
      await this.assertBeforeExternal(context.actor, context.patientId, context.mediaAssetId, context.draft);
    }
    try {
      const result = await provider.recognize({ localText, image });
      if (result.status === 'DRAFT' && provider.requiresImage) result.fields = validateOcrFields(result.fields);
      return { provider: provider.key, ...result };
    }
    catch { return { provider: provider.key, status: 'FAILED', fields: {}, errorMessage: '识别草稿生成失败，请重新提交本地文本或手工填写；未自动保存检测记录。' } as const; }
  }
  private draftView(actor: Actor, row: DraftRow) {
    const fields = actor.role === 'NUTRITIONIST'
      ? Object.fromEntries(Object.entries(validateOcrFields(row.fields)).map(([key, field]) => [key, { ...field, reviewRequired: false }])) : row.fields;
    const safe = { id: row.id, status: row.status, fields, sourceKind: row.sourceKind, simulated: row.provider === 'mock', measuredAt: row.measuredAt, createdAt: row.createdAt, updatedAt: row.updatedAt, confirmedAt: row.confirmedAt, bodyAssessmentId: row.bodyAssessmentId };
    if (actor.role === 'NUTRITIONIST') return safe;
    const cloud = row.provider === 'bailian-cloud';
    const remote = cloud || row.provider === 'bailian' || row.provider === 'deepseek';
    const sources = row.fields && typeof row.fields === 'object' ? Object.values(row.fields).map((field) => field && typeof field === 'object' ? (field as OcrField).source : undefined) : [];
    const visionSource = sources.some((source) => source === 'BAILIAN_VISION' || source === 'DEEPSEEK_VISION');
    const recognitionMode = cloud ? (row.status === 'PROCESSING' ? 'CLOUD_PROCESSING' : visionSource ? 'CLOUD_REVIEW_REQUIRED' : 'MANUAL_DRAFT') : row.provider === 'mock' ? 'MOCK_FICTIONAL_DATA' : row.provider === 'local' ? 'LOCAL_TEXT_ONLY'
      : !remote || row.status === 'UNCONFIGURED' ? 'UNCONFIGURED' : row.status === 'FAILED' ? 'VISION_FAILED' : visionSource ? 'VISION_REVIEW_REQUIRED' : 'MANUAL_DRAFT';
    const message = cloud ? '人体成分逐图授权云识别：结果仅为草稿，须工作人员核对；原图和授权记录保留，不自动覆盖历史。' : row.provider === 'mock' ? '模拟指标与图片内容无关，须人工核对，不代表真实识别。' : row.provider === 'local' ? '仅解析明确标签的本地文本，未识别图片。'
      : remote && row.status === 'FAILED' ? '供应商视觉识别失败，未保存检测记录；可重试或人工填写。'
        : remote && row.status === 'UNCONFIGURED' ? row.errorMessage ?? '视觉识别供应商尚未配置，图片未发送。'
          : remote && visionSource ? `${row.provider === 'bailian' ? '百炼' : 'DeepSeek'}合成图片视觉识别结果仍须逐项人工核对，不能自动保存或作诊疗决策。`
            : remote ? '当前指标为人工填写，不能当作供应商识别成功。' : '真实 OCR 尚未配置，可手工填写并核对。';
    return { ...safe, provider: row.provider, mediaAssetId: row.mediaAssetId, errorMessage: row.errorMessage, recognitionMode, message, ...(remote ? { syntheticOnly: !cloud } : {}) };
  }
  private async draft(req: Request, id: string, write = false) {
    const actor = await this.clinical.actor(req);
    if (write || actor.role !== 'NUTRITIONIST') this.assertRawRole(actor);
    const row = await this.prisma.ocrDraft.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('识别草稿不存在');
    await this.care.assertEnrollment(actor, row.patientId);
    if (actor.role === 'NUTRITIONIST' && row.status !== 'CONFIRMED') throw new ForbiddenException('营养师只能查看人工确认后的检测数值');
    return { actor, row };
  }
  async createOcrDraft(req: Request, patientId: string, dto: CreateOcrDraftDto) {
    const actor = await this.access(req, patientId, true);
    if (!(sourceKinds as readonly string[]).includes(dto.sourceKind)) throw new BadRequestException('检测来源类型无效');
    const measuredAt = this.measuredAt(dto.measuredAt);
    // Ownership/availability is checked before any parsing, then repeated transactionally.
    await this.assertAsset(this.prisma as unknown as Prisma.TransactionClient, actor, dto.mediaAssetId, true);
    // The manual-only entrance must remain local even if provider configuration changes after its status read.
    const result = dto.localOnly === true
      ? { provider: 'disabled' as const, status: 'UNCONFIGURED' as const, fields: {}, errorMessage: '本入口仅建立人工核对草稿，未执行图片识别，照片未发送第三方。' }
      : await this.extract(dto.localText, { actor, patientId, mediaAssetId: dto.mediaAssetId });
    const row = await this.transaction(async (tx) => {
      await this.assertCurrentEnrollment(tx, actor, patientId);
      await this.assertAsset(tx, actor, dto.mediaAssetId, true);
      const draft = await tx.ocrDraft.create({ data: { patientId, mediaAssetId: dto.mediaAssetId, provider: result.provider, status: result.status, fields: json(result.fields), sourceKind: dto.sourceKind === 'INBODY270' ? 'INBODY_270' : dto.sourceKind, measuredAt, errorMessage: result.errorMessage, createdById: actor.sub } });
      await this.bind(tx, actor, dto.mediaAssetId, 'OCR_SOURCE', draft.id);
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'OCR_DRAFT_CREATE', resourceType: 'OCR_DRAFT', resourceId: draft.id, metadata: { provider: result.provider, status: result.status } } });
      return draft;
    });
    return this.draftView(actor, row);
  }
  async getOcrDraft(req: Request, id: string) { const { actor, row } = await this.draft(req, id); return this.draftView(actor, row); }
  async updateOcrDraft(req: Request, id: string, dto: UpdateOcrDraftDto) {
    const { actor, row } = await this.draft(req, id, true);
    if (!editableStatuses.includes(row.status)) throw new ConflictException('已确认的检测记录不可修改，请新建草稿');
    if (typeof dto.expectedUpdatedAt !== 'string' || new Date(dto.expectedUpdatedAt).getTime() !== row.updatedAt.getTime()) throw new ConflictException('草稿已更新，请刷新并重新核对');
    if (dto.fields === undefined && dto.measuredAt === undefined) throw new BadRequestException('请提交要修改的指标或检测时间');
    const fields = dto.fields === undefined ? undefined : validateOcrFields(dto.fields, true);
    const measuredAt = this.measuredAt(dto.measuredAt);
    const updated = await this.transaction(async (tx) => {
      await this.assertCurrentEnrollment(tx, actor, row.patientId);
      await this.assertBoundSource(tx, row);
      const changed = await tx.ocrDraft.updateMany({ where: { id, status: { in: editableStatuses }, updatedAt: row.updatedAt }, data: { ...(fields === undefined ? {} : { fields: json(fields), status: 'DRAFT', errorMessage: null }), ...(measuredAt === undefined ? {} : { measuredAt }), updatedAt: this.nextTimestamp(row.updatedAt) } });
      if (changed.count !== 1) throw new ConflictException('草稿已更新，请刷新并重新核对');
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'OCR_DRAFT_EDIT', resourceType: 'OCR_DRAFT', resourceId: id } });
      return tx.ocrDraft.findUniqueOrThrow({ where: { id } });
    });
    return this.draftView(actor, updated);
  }
  async confirmOcrDraft(req: Request, id: string, dto: ConfirmOcrDraftDto) {
    const { actor, row } = await this.draft(req, id, true);
    if (dto.reviewed !== true) throw new BadRequestException('请逐项人工核对数值、单位与检测时间并确认');
    if (typeof dto.expectedUpdatedAt !== 'string' || new Date(dto.expectedUpdatedAt).getTime() !== row.updatedAt.getTime()) throw new ConflictException('草稿已更新，请刷新并逐项核对当前版本');
    if (row.status !== 'DRAFT') throw new ConflictException('只有待核对草稿可确认；识别未配置或失败时请先手工填写');
    const fields = validateOcrFields(row.fields);
    if (!Object.keys(fields).length) throw new BadRequestException('至少填写一项有效检测指标');
    if (!row.measuredAt) throw new BadRequestException('请人工填写当次检测时间');
    this.measuredAt(row.measuredAt.toISOString());
    const report = await this.transaction(async (tx) => {
      await this.assertCurrentEnrollment(tx, actor, row.patientId);
      await this.assertBoundSource(tx, row);
      // Claim first. Concurrent confirmation/edit/retry loses the CAS and rolls back.
      const changed = await tx.ocrDraft.updateMany({ where: { id, status: 'DRAFT', updatedAt: row.updatedAt, bodyAssessmentId: null }, data: { status: 'CONFIRMED', confirmedAt: new Date(), updatedAt: this.nextTimestamp(row.updatedAt), fields: json(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, { ...field, reviewRequired: false }]))) } });
      if (changed.count !== 1) throw new ConflictException('草稿已确认或更新，请刷新后核对');
      const metrics = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value]));
      const source = row.provider === 'mock' || Object.values(fields).some((field) => field.source === 'MOCK') ? 'MOCK_REVIEWED'
        : Object.values(fields).every((field) => field.source === 'MANUAL') ? 'MANUAL_REVIEWED'
          : Object.values(fields).some((field) => field.source === 'BAILIAN_VISION') ? 'BAILIAN_VISION_REVIEWED'
            : Object.values(fields).some((field) => field.source === 'DEEPSEEK_VISION') ? 'DEEPSEEK_VISION_REVIEWED' : 'LOCAL_TEXT_REVIEWED';
      const created = await tx.bodyAssessment.create({ data: { patientId: row.patientId, createdById: actor.sub, measuredAt: row.measuredAt!, ...metrics, source, sourceDraftId: id } });
      await tx.ocrDraft.update({ where: { id }, data: { bodyAssessmentId: created.id, errorMessage: null } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'OCR_DRAFT_CONFIRM', resourceType: 'BODY_ASSESSMENT', resourceId: created.id, metadata: { sourceDraftId: id, provider: row.provider, manuallyReviewed: true } } });
      return created;
    });
    return { confirmed: true, bodyAssessmentId: report.id, report };
  }
  async retryOcrDraft(req: Request, id: string, dto: RetryOcrDraftDto = {}) {
    const { actor, row } = await this.draft(req, id, true);
    if (row.provider === 'bailian-cloud') throw new ConflictException('云识别重试须重新申请该图片的客户授权，不能使用旧重试入口');
    if (!['FAILED', 'UNCONFIGURED'].includes(row.status)) throw new ConflictException('仅失败或未配置的草稿可重试；已确认记录不受影响');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: row.mediaAssetId } });
    if (!asset || asset.status !== 'READY' || asset.referenceType !== 'OCR_SOURCE' || asset.referenceId !== id) throw new ConflictException('草稿来源图片不可用');
    const result = await this.extract(dto.localText, { actor, patientId: row.patientId, mediaAssetId: row.mediaAssetId, draft: row });
    const updated = await this.transaction(async (tx) => {
      await this.assertCurrentEnrollment(tx, actor, row.patientId);
      await this.assertBoundSource(tx, row);
      const changed = await tx.ocrDraft.updateMany({ where: { id, status: { in: ['FAILED', 'UNCONFIGURED'] }, updatedAt: row.updatedAt }, data: { provider: result.provider, status: result.status, fields: json(result.fields), errorMessage: result.errorMessage, updatedAt: this.nextTimestamp(row.updatedAt) } });
      if (changed.count !== 1) throw new ConflictException('草稿已更新，请刷新后重试');
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'OCR_DRAFT_RETRY', resourceType: 'OCR_DRAFT', resourceId: id, metadata: { provider: result.provider, status: result.status } } });
      return tx.ocrDraft.findUniqueOrThrow({ where: { id } });
    });
    return this.draftView(actor, updated);
  }
  /** Root integrates equivalent checks into CareManagement before any owner fallback. */
  async canAccessMedia(actor: Actor, mediaAssetId: string): Promise<boolean> {
    if (!rawRoles.includes(actor.role)) return false;
    const [report, consent, draft] = await Promise.all([
      this.prisma.healthReportDocument.findUnique({ where: { mediaAssetId }, select: { patientId: true } }),
      this.prisma.consentDocument.findUnique({ where: { mediaAssetId }, select: { patientId: true } }),
      this.prisma.ocrDraft.findUnique({ where: { mediaAssetId }, select: { patientId: true } }),
    ]);
    const document = report ?? consent ?? draft;
    if (!document) return false;
    try {
      if (actor.role === 'PATIENT') await this.care.assertSelfPatient(actor, document.patientId);
      else if (actor.role === 'HEALTH_MANAGER') await this.clinical.assertCare(actor, document.patientId);
      else await this.care.assertEnrollment(actor, document.patientId);
      return true;
    } catch { return false; }
  }
}

@Controller('report-workflow')
export class ReportWorkflowController {
  constructor(private readonly service: ReportWorkflowService) {}
  @Get('patients/:id/health-reports') reports(@Req() req: Request, @Param('id') id: string) { return this.service.healthReports(req, id); }
  @Post('patients/:id/health-reports') addReport(@Req() req: Request, @Param('id') id: string, @Body() dto: HealthReportDocumentDto) { return this.service.createHealthReport(req, id, dto); }
  @Get('patients/:id/consent-documents') consents(@Req() req: Request, @Param('id') id: string) { return this.service.consentDocuments(req, id); }
  @Post('patients/:id/consent-documents') addConsent(@Req() req: Request, @Param('id') id: string, @Body() dto: ConsentDocumentDto) { return this.service.createConsentDocument(req, id, dto); }
  @Get('ocr/provider') provider(@Req() req: Request) { return this.service.provider(req); }
  @Post('patients/:id/ocr-drafts') createDraft(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateOcrDraftDto) { return this.service.createOcrDraft(req, id, dto); }
  @Get('ocr-drafts/:id') getDraft(@Req() req: Request, @Param('id') id: string) { return this.service.getOcrDraft(req, id); }
  @Patch('ocr-drafts/:id') editDraft(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateOcrDraftDto) { return this.service.updateOcrDraft(req, id, dto); }
  @Post('ocr-drafts/:id/confirm') confirm(@Req() req: Request, @Param('id') id: string, @Body() dto: ConfirmOcrDraftDto) { return this.service.confirmOcrDraft(req, id, dto); }
  @Post('ocr-drafts/:id/retry') retry(@Req() req: Request, @Param('id') id: string, @Body() dto: RetryOcrDraftDto) { return this.service.retryOcrDraft(req, id, dto); }
}
