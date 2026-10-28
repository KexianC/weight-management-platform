import { ForbiddenException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import type { Actor } from './auth';
import type { ClinicalService } from './clinical';
import type { CareManagementService } from './care-management';
import type { PrismaService } from './prisma.service';
import type { MediaService } from './media';
import { configuredOcrProvider, ConfirmOcrDraftDto, parseLocalReportText, ReportWorkflowService, validateOcrFields } from './report-workflow';

const request = {} as Request;
const time = new Date('2026-09-01T08:00:00.000Z');
const metric = (value = 72, unit = 'kg') => ({ value, unit, confidence: 0.85, reviewRequired: true, source: 'LOCAL_TEXT' });
const actor = (role: Actor['role'] = 'HEALTH_MANAGER', sub = 'manager-fixture'): Actor => ({ sub, role, typ: 'access', jti: 'synthetic-session' });
const draft = (overrides: Record<string, unknown> = {}) => ({ id: 'draft-fixture', patientId: 'patient-fixture', mediaAssetId: 'asset-fixture', provider: 'local', status: 'DRAFT', fields: { weightKg: metric() }, sourceKind: 'INBODY_270', measuredAt: time, createdById: 'manager-fixture', createdAt: time, updatedAt: time, confirmedAt: null, bodyAssessmentId: null, errorMessage: null, ...overrides });

function fixture(currentActor = actor()) {
  const prisma = {
    healthReportDocument: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn() },
    consentDocument: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn() },
    ocrDraft: { findUnique: jest.fn().mockResolvedValue(draft()), create: jest.fn().mockImplementation(({ data }) => Promise.resolve(draft(data))), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue(draft()), findUniqueOrThrow: jest.fn().mockResolvedValue(draft()) },
    mediaAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'asset-fixture', ownerId: currentActor.sub, status: 'READY', mimeType: 'image/png', referenceType: null, referenceId: null, healthRecordId: null }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    bodyAssessment: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'assessment-new', ...data })) },
    user: { findUnique: jest.fn().mockResolvedValue({ role: currentActor.role, status: 'ACTIVE' }) },
    careEnrollment: { findUnique: jest.fn().mockResolvedValue({ patient: { status: 'ACTIVE' }, healthManagerId: currentActor.role === 'HEALTH_MANAGER' ? currentActor.sub : 'manager-fixture', doctorId: currentActor.role === 'DOCTOR' ? currentActor.sub : 'doctor-fixture' }) },
    careRelation: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-fixture' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  const clinical = { actor: jest.fn().mockResolvedValue(currentActor), assertCare: jest.fn().mockResolvedValue(undefined) };
  const care = { assertSelfPatient: jest.fn().mockResolvedValue({ role: 'PATIENT', status: 'ACTIVE' }), assertEnrollment: jest.fn().mockResolvedValue({ patientId: 'patient-fixture' }) };
  return { prisma, clinical, care, service: new ReportWorkflowService(prisma as unknown as PrismaService, clinical as unknown as ClinicalService, care as unknown as CareManagementService) };
}
const boundSource = { id: 'asset-fixture', ownerId: 'manager-fixture', status: 'READY', mimeType: 'image/png', referenceType: 'OCR_SOURCE', referenceId: 'draft-fixture', healthRecordId: null };

describe('local report parsing and providers', () => {
  it('separates skeletal muscle mass from generic muscle and reads explicit units', () => {
    const result = parseLocalReportText('骨骼肌量 (kg): 28.2\n肌肉量: 44 kg\n体脂率 (%): 28\nBMI: 25.5 kg/m2');
    expect(result.status).toBe('DRAFT');
    expect(result.fields.skeletalMuscleMassKg?.value).toBe(28.2);
    expect(result.fields.muscleMassKg?.value).toBe(44);
    expect(result.fields.bmi?.unit).toBe('kg/m²');
    expect(Object.values(result.fields).every((field) => field.reviewRequired)).toBe(true);
  });
  it('never guesses unlabelled handwritten values or treats other metrics as weight/waist/fat percent', () => {
    const result = parseLocalReportText('75 90 0.83\n腰臀比: 0.83\n体脂肪量: 18 kg\n去脂体重: 52 kg');
    expect(result).toMatchObject({ status: 'FAILED', fields: {} });
  });
  it('refuses duplicate current/history labels rather than merging or keeping the last value', () => {
    expect(parseLocalReportText('体重: 72 kg\n体重: 70 kg')).toMatchObject({ status: 'FAILED', fields: {} });
  });
  it('does not pick a number from reference/target/history columns', () => {
    expect(parseLocalReportText('体重: 72 kg 参考范围 50-65\n目标体重: 60 kg')).toMatchObject({ status: 'FAILED', fields: {} });
  });
  it('keeps a missing unit pending so it cannot be confirmed without correction', () => {
    const result = parseLocalReportText('体重: 72');
    expect(result.fields.weightKg?.unit).toBe('');
    expect(() => validateOcrFields(result.fields)).toThrow('单位');
  });
  it('rejects conflicting before/after units and overly long local text', () => {
    expect(parseLocalReportText('体重 (kg): 72 cm').status).toBe('FAILED');
    expect(parseLocalReportText('x'.repeat(12001)).status).toBe('FAILED');
  });
  it('drops raw identity text and returns only safe metric keys', () => {
    const result = parseLocalReportText('姓名: 合成测试姓名\n设备编号: SYNTHETIC-DEMO\n体重 (kg): 72');
    expect(Object.keys(result.fields)).toEqual(['weightKg']);
    expect(JSON.stringify(result)).not.toContain('合成测试姓名');
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC-DEMO');
  });
  it('never stores arbitrary identity strings disguised as units or non-finite numeric values', () => {
    for (const text of ['Weight 70 kgalice@example.invalid', 'Weight (kgalice@example.invalid) 70', `Weight ${'9'.repeat(400)} kg`]) {
      const result = parseLocalReportText(text);
      expect(result).toMatchObject({ status: 'FAILED', fields: {} });
      expect(JSON.stringify(result)).not.toContain('alice');
    }
  });
  it('defaults to clearly unconfigured with no fabricated extracted fields', async () => {
    const provider = configuredOcrProvider({});
    expect(provider.key).toBe('disabled');
    expect(await provider.recognize({ localText: '体重: 72 kg' })).toMatchObject({ status: 'UNCONFIGURED', fields: {} });
    expect(provider.message).toContain('尚未配置');
  });
  it.each([
    { OCR_PROVIDER: 'mock', NODE_ENV: 'production', OCR_MOCK_ENABLED: 'true' },
    { OCR_PROVIDER: 'mock', NODE_ENV: 'test', OCR_MOCK_ENABLED: 'false' },
    { OCR_PROVIDER: 'mock', OCR_MOCK_ENABLED: 'true' },
    { OCR_PROVIDER: 'unknown', NODE_ENV: 'test' },
  ])('fails closed for disabled/unsafe provider config %j', async (env) => {
    expect((await configuredOcrProvider(env).recognize({})).status).toBe('UNCONFIGURED');
  });
  it('marks explicit development mock metrics as fictional', async () => {
    const provider = configuredOcrProvider({ OCR_PROVIDER: 'mock', OCR_MOCK_ENABLED: 'true', NODE_ENV: 'development' });
    const result = await provider.recognize({});
    expect(provider.message).toContain('虚构');
    expect(result.fields.skeletalMuscleMassKg).toMatchObject({ source: 'MOCK', reviewRequired: true, confidence: null });
  });
  it('local and mock providers do not call the network', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must remain unused'));
    try {
      await configuredOcrProvider({ OCR_PROVIDER: 'local' }).recognize({ localText: '体重: 72 kg' });
      await configuredOcrProvider({ OCR_PROVIDER: 'mock', OCR_MOCK_ENABLED: 'true', NODE_ENV: 'test' }).recognize({});
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
});

describe('external vision workflow (synthetic images and mocked fetch only)', () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jUZkAAAAASUVORK5CYII=', 'base64');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const envKeys = ['OCR_PROVIDER', 'OCR_MOCK_ENABLED', 'NODE_ENV', 'OCR_VISION_BASE_URL', 'OCR_VISION_MODEL', 'OCR_VISION_REGION', 'OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST', 'OCR_VISION_TIMEOUT_MS', 'DASHSCOPE_API_KEY', 'BAILIAN_API_KEY', 'DEEPSEEK_API_KEY'] as const;
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let fetchSpy: jest.SpyInstance;
  const response = (content = '{"fields":{"weightKg":{"value":72,"unit":"kg"}}}') => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }] }), { headers: { 'content-type': 'application/json' } });
  function remoteFixture(currentActor = actor()) {
    const base = fixture(currentActor);
    const media = { readOwnedImageForOcr: jest.fn().mockResolvedValue({ bytes, mimeType: 'image/png' }) };
    return { ...base, media, service: new ReportWorkflowService(base.prisma as unknown as PrismaService, base.clinical as unknown as ClinicalService, base.care as unknown as CareManagementService, media as unknown as MediaService) };
  }
  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    Object.assign(process.env, { NODE_ENV: 'test', OCR_PROVIDER: 'bailian', OCR_VISION_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', OCR_VISION_MODEL: 'qwen3-vl-plus', OCR_VISION_TIMEOUT_MS: '1000', DASHSCOPE_API_KEY: 'unit-test-key-not-real', OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST: sha256 });
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response());
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    for (const key of envKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  });

  it('reports remote configuration honestly and makes missing media-loader configuration unavailable', async () => {
    const { service } = remoteFixture();
    expect(await service.provider(request)).toMatchObject({ provider: 'bailian', status: 'AVAILABLE', photoRecognitionConfigured: true, sendsToThirdParty: true, syntheticOnly: true });
    expect(await fixture().service.provider(request)).toMatchObject({ provider: 'bailian', status: 'UNCONFIGURED', photoRecognitionConfigured: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('loads only an owned image and saves validated provider-labelled review-required metrics', async () => {
    const { service, media, prisma } = remoteFixture();
    const result = await service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' });
    expect(media.readOwnedImageForOcr).toHaveBeenCalledWith(actor(), 'asset-fixture');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ provider: 'bailian', status: 'DRAFT', recognitionMode: 'VISION_REVIEW_REQUIRED', syntheticOnly: true, fields: { weightKg: { value: 72, unit: 'kg', source: 'BAILIAN_VISION', confidence: null, reviewRequired: true } } });
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
    expect(JSON.stringify(prisma.ocrDraft.create.mock.calls)).not.toMatch(/data:image|unit-test-key/);
  });
  it.each(['disabled', 'local', 'mock'] as const)('does not load images or send anything in %s mode', async (provider) => {
    process.env.OCR_PROVIDER = provider;
    if (provider === 'mock') { process.env.OCR_MOCK_ENABLED = 'true'; }
    const { service, media } = remoteFixture();
    await service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270', localText: '体重: 72 kg' });
    expect(media.readOwnedImageForOcr).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.OCR_MOCK_ENABLED;
  });
  it('does not read or transmit an image when the supplier key/model/allowlist is missing', async () => {
    delete process.env.OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST;
    const { service, media } = remoteFixture();
    expect(await service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).toMatchObject({ status: 'UNCONFIGURED', fields: {}, recognitionMode: 'UNCONFIGURED' });
    expect(media.readOwnedImageForOcr).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('blocks health-manager cross-assignment before the loader or supplier even when list access was allowed', async () => {
    const { service, media, prisma, clinical } = remoteFixture();
    prisma.careEnrollment.findUnique.mockResolvedValue({ patient: { status: 'ACTIVE' }, healthManagerId: 'other-manager', doctorId: 'doctor-fixture' });
    await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).rejects.toThrow('重新分配');
    expect(clinical.assertCare).toHaveBeenCalled();
    expect(media.readOwnedImageForOcr).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.ocrDraft.create).not.toHaveBeenCalled();
  });
  it('blocks ended relationships and disabled users before sending', async () => {
    const { service, media, prisma } = remoteFixture();
    prisma.careRelation.findUnique.mockResolvedValue({ status: 'ENDED' });
    await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).rejects.toThrow('关系已结束');
    prisma.user.findUnique.mockResolvedValue({ role: 'HEALTH_MANAGER', status: 'DISABLED' });
    await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).rejects.toThrow('失效');
    expect(media.readOwnedImageForOcr).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('checks ownership again after the asynchronous loader, preventing late replacement', async () => {
    const { service, media, prisma } = remoteFixture();
    media.readOwnedImageForOcr.mockImplementation(async () => {
      prisma.mediaAsset.findUnique.mockResolvedValue({ id: 'asset-fixture', ownerId: 'other-owner', status: 'READY', mimeType: 'image/png', referenceType: null, referenceId: null, healthRecordId: null });
      return { bytes, mimeType: 'image/png' };
    });
    await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).rejects.toThrow('本人上传');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.ocrDraft.create).not.toHaveBeenCalled();
  });
  it('does not send after a relationship ends while the loader is reading', async () => {
    const { service, media, prisma } = remoteFixture();
    media.readOwnedImageForOcr.mockImplementation(async () => { prisma.careRelation.findUnique.mockResolvedValue({ status: 'ENDED' }); return { bytes, mimeType: 'image/png' }; });
    await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).rejects.toThrow('关系已结束');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rejects a content hash outside the synthetic list without trusting stored metadata', async () => {
    const { service, media, prisma } = remoteFixture();
    const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
    media.readOwnedImageForOcr.mockResolvedValue({ bytes: changed, mimeType: 'image/png' });
    expect(await service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).toMatchObject({ status: 'FAILED', fields: {}, recognitionMode: 'VISION_FAILED' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });
  it('discards unknown fields and PII trailing text without storing raw supplier output', async () => {
    fetchSpy.mockResolvedValue(response('{"fields":{"weightKg":{"value":72,"unit":"kg"}}}\nsynthetic private tail'));
    const { service, prisma } = remoteFixture();
    const result = await service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' });
    expect(result).toMatchObject({ status: 'FAILED', fields: {}, recognitionMode: 'VISION_FAILED' });
    expect(JSON.stringify(prisma.ocrDraft.create.mock.calls)).not.toContain('private tail');
    expect(JSON.stringify(result)).not.toContain('private tail');
  });
  it('does not persist draft or historical records when final transactional authorization fails after a mocked response', async () => {
    const { service, prisma } = remoteFixture();
    fetchSpy.mockImplementation(async () => { prisma.careRelation.findUnique.mockResolvedValue({ status: 'ENDED' }); return response(); });
    await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270' })).rejects.toThrow('关系已结束');
    expect(prisma.ocrDraft.create).not.toHaveBeenCalled();
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });
  it('requires the original source owner for an external retry', async () => {
    const { service, media, prisma } = remoteFixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'FAILED', provider: 'bailian' }));
    prisma.mediaAsset.findUnique.mockResolvedValue({ ...boundSource, ownerId: 'other-owner' });
    await expect(service.retryOcrDraft(request, 'draft-fixture')).rejects.toThrow('本人上传');
    expect(media.readOwnedImageForOcr).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('retries a failed owned image and saves only verified vision metrics', async () => {
    const { service, prisma } = remoteFixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'FAILED', provider: 'bailian' }));
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    await service.retryOcrDraft(request, 'draft-fixture');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(prisma.ocrDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provider: 'bailian', status: 'DRAFT', fields: { weightKg: expect.objectContaining({ source: 'BAILIAN_VISION', reviewRequired: true }) } }) }));
  });
  it.each(['bailian', 'deepseek'] as const)('confirms %s vision only after human review and records supplier provenance', async (provider) => {
    const { service, prisma } = remoteFixture();
    const source = provider === 'bailian' ? 'BAILIAN_VISION' : 'DEEPSEEK_VISION';
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ provider, fields: { weightKg: { ...metric(), source, confidence: null } } }));
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    await service.confirmOcrDraft(request, 'draft-fixture', { reviewed: true, expectedUpdatedAt: time.toISOString() });
    expect(prisma.bodyAssessment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: `${source}_REVIEWED`, sourceDraftId: 'draft-fixture' }) }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('marks edited supplier fields MANUAL and does not claim supplier success for all-manual values', async () => {
    const { service, prisma } = remoteFixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ provider: 'bailian' }));
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    prisma.ocrDraft.findUniqueOrThrow.mockResolvedValue(draft({ provider: 'bailian', fields: { weightKg: { ...metric(), source: 'MANUAL', confidence: null } } }));
    const result = await service.updateOcrDraft(request, 'draft-fixture', { fields: { weightKg: { ...metric(), source: 'BAILIAN_VISION' } }, expectedUpdatedAt: time.toISOString() });
    expect(result).toMatchObject({ recognitionMode: 'MANUAL_DRAFT', fields: { weightKg: expect.objectContaining({ source: 'MANUAL' }) } });
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ provider: 'bailian', fields: { weightKg: { ...metric(), source: 'MANUAL' } } }));
    await service.confirmOcrDraft(request, 'draft-fixture', { reviewed: true, expectedUpdatedAt: time.toISOString() });
    expect(prisma.bodyAssessment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: 'MANUAL_REVIEWED' }) }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('metric validation and review DTO', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 501, '72', null])('rejects invalid weight %p', (value) => {
    expect(() => validateOcrFields({ weightKg: { ...metric(), value } })).toThrow('数值');
  });
  it('rejects wrong units, unknown metric/identity keys and unexpected nested data', () => {
    expect(() => validateOcrFields({ weightKg: metric(72, 'cm') })).toThrow('单位');
    expect(() => validateOcrFields({ name: metric() })).toThrow('不支持');
    expect(() => validateOcrFields({ weightKg: { ...metric(), rawText: 'synthetic' } })).toThrow('不支持');
    expect(() => validateOcrFields({ weightKg: { ...metric(), source: ['MANUAL'] } })).toThrow('来源');
    expect(() => validateOcrFields([])).toThrow('对象');
  });
  it('rejects invalid confidence and resets human edits to manual review', () => {
    expect(() => validateOcrFields({ weightKg: { ...metric(), confidence: 1.1 } })).toThrow('置信度');
    expect(validateOcrFields({ weightKg: metric() }, true).weightKg).toMatchObject({ source: 'MANUAL', confidence: null, reviewRequired: true });
  });
  it('requires reviewed true and a valid expected draft timestamp', () => {
    expect(validateSync(Object.assign(new ConfirmOcrDraftDto(), { reviewed: true })).map((e) => e.property)).toContain('expectedUpdatedAt');
    expect(validateSync(Object.assign(new ConfirmOcrDraftDto(), { reviewed: false, expectedUpdatedAt: time.toISOString() })).map((e) => e.property)).toContain('reviewed');
  });
});

describe('report documents and object/field privacy', () => {
  it('projects nutrition report metadata with fixed labels and no raw IDs or free-text identity', async () => {
    const { service, prisma, care } = fixture(actor('NUTRITIONIST', 'nutrition-fixture'));
    prisma.healthReportDocument.findMany.mockResolvedValue([{ id: 'report-fixture', patientId: 'patient-fixture', category: 'BODY_COMPOSITION', title: '合成姓名 / private scan', mediaAssetId: 'private-image', createdById: 'manager-fixture', createdAt: time, url: 'https://invalid.example/private' }]);
    const result = await service.healthReports(request, 'patient-fixture');
    expect(care.assertEnrollment).toHaveBeenCalledWith(expect.objectContaining({ role: 'NUTRITIONIST' }), 'patient-fixture');
    expect(result).toEqual([{ id: 'report-fixture', category: 'BODY_COMPOSITION', title: '人体成分检测报告', createdAt: time }]);
    expect(JSON.stringify(result)).not.toMatch(/private-image|合成姓名|https:|createdById/);
  });
  it('restricts exercise coaches to exercise report metadata without original media', async () => {
    const { service, prisma } = fixture(actor('EXERCISE_COACH', 'coach-fixture'));
    await service.healthReports(request, 'patient-fixture');
    expect(prisma.healthReportDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ category: 'EXERCISE_ASSESSMENT' }) }));
  });
  it.each(['NUTRITIONIST', 'EXERCISE_COACH', 'ADMIN'] as const)('denies %s even consent metadata and writes', async (role) => {
    const { service, prisma } = fixture(actor(role, 'staff-fixture'));
    await expect(service.consentDocuments(request, 'patient-fixture')).rejects.toThrow('不可访问');
    await expect(service.createConsentDocument(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', version: '1.0' })).rejects.toThrow('不可访问');
    expect(prisma.consentDocument.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('checks current assignment before querying another customer', async () => {
    const { service, prisma, care } = fixture(actor('NUTRITIONIST', 'nutrition-fixture'));
    care.assertEnrollment.mockRejectedValue(new ForbiddenException('客户未分配'));
    await expect(service.healthReports(request, 'other-patient')).rejects.toThrow('未分配');
    expect(prisma.healthReportDocument.findMany).not.toHaveBeenCalled();
  });
  it('adds consent versions without changing or replacing previous documents', async () => {
    const { service, prisma } = fixture();
    prisma.consentDocument.create.mockResolvedValue({ id: 'consent-added', version: '2.0', mediaAssetId: 'asset-fixture', createdAt: time });
    expect(await service.createConsentDocument(request, 'patient-fixture', { version: '2.0', mediaAssetId: 'asset-fixture' })).toEqual({ id: 'consent-added', version: '2.0', mediaAssetId: 'asset-fixture', createdAt: time });
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: 'manager-fixture', referenceType: null, referenceId: null, healthRecordId: null }), data: expect.objectContaining({ referenceType: 'CONSENT_DOCUMENT', referenceId: 'consent-added' }) }));
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it.each([
    { ownerId: 'other-fixture', status: 'READY', mimeType: 'image/png' },
    { ownerId: 'manager-fixture', status: 'DELETED', mimeType: 'image/png' },
    { ownerId: 'manager-fixture', status: 'READY', mimeType: 'video/mp4' },
    { ownerId: 'manager-fixture', status: 'READY', mimeType: 'image/png', referenceType: 'HEALTH_REPORT' },
  ])('rejects forged/unavailable/already bound media %j', async (asset) => {
    const { service, prisma } = fixture();
    prisma.mediaAsset.findUnique.mockResolvedValue(asset);
    await expect(service.createHealthReport(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', category: 'BODY_COMPOSITION' })).rejects.toThrow();
    expect(prisma.healthReportDocument.create).not.toHaveBeenCalled();
  });
  it('propagates a lost media binding CAS as a conflict', async () => {
    const { service, prisma } = fixture();
    prisma.healthReportDocument.create.mockResolvedValue({ id: 'report-added' });
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createHealthReport(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', category: 'BODY_COMPOSITION' })).rejects.toThrow('媒体已被绑定');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('OCR draft lifecycle (Prisma unit doubles; real transactions need local MySQL integration)', () => {
  const envKeys = ['OCR_PROVIDER', 'OCR_MOCK_ENABLED', 'NODE_ENV'] as const;
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  beforeEach(() => { process.env.OCR_PROVIDER = 'disabled'; process.env.OCR_MOCK_ENABLED = 'false'; process.env.NODE_ENV = 'test'; });
  afterAll(() => { for (const key of envKeys) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; } });

  it('creates an explicit unconfigured empty draft without a detection record', async () => {
    const { service, prisma } = fixture();
    const result = await service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY270' });
    expect(result).toMatchObject({ provider: 'disabled', status: 'UNCONFIGURED', fields: {}, recognitionMode: 'UNCONFIGURED' });
    expect(prisma.ocrDraft.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceKind: 'INBODY_270' }) }));
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });
  it('stores only parsed metrics and safe provenance, never local identity/raw text', async () => {
    process.env.OCR_PROVIDER = 'local';
    const { service, prisma } = fixture();
    await service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270', localText: '姓名: 合成测试姓名\n体重: 72 kg' });
    const stored = JSON.stringify(prisma.ocrDraft.create.mock.calls[0]);
    expect(stored).not.toContain('localText');
    expect(stored).not.toContain('合成测试姓名');
    expect(stored).toContain('weightKg');
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain('合成测试姓名');
  });
  it('checks source ownership before provider parsing and draft creation', async () => {
    const { service, prisma } = fixture();
    prisma.mediaAsset.findUnique.mockResolvedValue({ ownerId: 'other-fixture', status: 'READY', mimeType: 'image/png' });
    await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270', localText: '体重: 72 kg' })).rejects.toThrow('本人上传');
    expect(prisma.ocrDraft.create).not.toHaveBeenCalled();
  });
  it('requires explicit review of the current draft version', async () => {
    const { service, prisma } = fixture();
    await expect(service.confirmOcrDraft(request, 'draft-fixture', { reviewed: false, expectedUpdatedAt: time.toISOString() })).rejects.toThrow('人工核对');
    await expect(service.confirmOcrDraft(request, 'draft-fixture', { reviewed: true, expectedUpdatedAt: new Date(time.getTime() - 1).toISOString() })).rejects.toThrow('当前版本');
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });
  it.each([
    { status: 'CONFIRMED' }, { status: 'UNCONFIGURED', fields: {} },
    { measuredAt: null }, { fields: {} }, { fields: { weightKg: metric(72, 'cm') } },
    { measuredAt: new Date('2099-01-01T00:00:00Z') },
  ])('does not save an invalid/unreviewable draft %j', async (override) => {
    const { service, prisma } = fixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft(override));
    await expect(service.confirmOcrDraft(request, 'draft-fixture', { reviewed: true, expectedUpdatedAt: time.toISOString() })).rejects.toThrow();
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });
  it('creates a new assessment with distinct SMM, provenance and immutable sourceDraftId', async () => {
    const { service, prisma } = fixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ fields: { skeletalMuscleMassKg: metric(28), muscleMassKg: metric(44) } }));
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    const result = await service.confirmOcrDraft(request, 'draft-fixture', { reviewed: true, expectedUpdatedAt: time.toISOString() });
    expect(result).toMatchObject({ confirmed: true, bodyAssessmentId: 'assessment-new' });
    expect(prisma.bodyAssessment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ skeletalMuscleMassKg: 28, muscleMassKg: 44, sourceDraftId: 'draft-fixture', source: 'LOCAL_TEXT_REVIEWED', measuredAt: time }) });
    expect(prisma.ocrDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'draft-fixture', status: 'DRAFT', updatedAt: time, bodyAssessmentId: null }, data: expect.objectContaining({ status: 'CONFIRMED', fields: expect.objectContaining({ skeletalMuscleMassKg: expect.objectContaining({ reviewRequired: false }) }) }) }));
  });
  it('does not create an assessment when confirm CAS loses to an edit or another confirmation', async () => {
    const { service, prisma } = fixture();
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    prisma.ocrDraft.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.confirmOcrDraft(request, 'draft-fixture', { reviewed: true, expectedUpdatedAt: time.toISOString() })).rejects.toThrow('已确认或更新');
    expect(prisma.bodyAssessment.create).not.toHaveBeenCalled();
  });
  it('supports manually correcting an unconfigured draft but never mutates confirmed history', async () => {
    const { service, prisma } = fixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'UNCONFIGURED', fields: {} }));
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    await service.updateOcrDraft(request, 'draft-fixture', { fields: { weightKg: metric() }, measuredAt: time.toISOString(), expectedUpdatedAt: time.toISOString() });
    expect(prisma.ocrDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT', fields: { weightKg: expect.objectContaining({ source: 'MANUAL', confidence: null, reviewRequired: true }) } }) }));
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'CONFIRMED' }));
    await expect(service.updateOcrDraft(request, 'draft-fixture', { fields: { weightKg: metric() }, expectedUpdatedAt: time.toISOString() })).rejects.toThrow('不可修改');
  });
  it('allows failed-local retry using newly supplied text without storing it', async () => {
    process.env.OCR_PROVIDER = 'local';
    const { service, prisma } = fixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'FAILED', fields: {} }));
    prisma.mediaAsset.findUnique.mockResolvedValue({ status: 'READY', referenceType: 'OCR_SOURCE', referenceId: 'draft-fixture' });
    await service.retryOcrDraft(request, 'draft-fixture', { localText: '体重: 72 kg' });
    expect(prisma.ocrDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT', fields: expect.objectContaining({ weightKg: { ...metric(), confidence: null } }) }) }));
    expect(JSON.stringify(prisma.ocrDraft.updateMany.mock.calls)).not.toContain('localText');
  });
  it('does not retry an unavailable source or confirmed record', async () => {
    const { service, prisma } = fixture();
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'FAILED' }));
    prisma.mediaAsset.findUnique.mockResolvedValue({ status: 'DELETED' });
    await expect(service.retryOcrDraft(request, 'draft-fixture')).rejects.toThrow('来源图片不可用');
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'CONFIRMED' }));
    await expect(service.retryOcrDraft(request, 'draft-fixture')).rejects.toThrow('仅失败');
  });
  it('gives nutritionists only confirmed numeric projection and denies edits/raw drafts', async () => {
    const { service, prisma } = fixture(actor('NUTRITIONIST', 'nutrition-fixture'));
    await expect(service.getOcrDraft(request, 'draft-fixture')).rejects.toThrow('人工确认后');
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ status: 'CONFIRMED', confirmedAt: time, bodyAssessmentId: 'assessment-fixture' }));
    const result = await service.getOcrDraft(request, 'draft-fixture');
    expect(result).toMatchObject({ status: 'CONFIRMED', fields: { weightKg: expect.objectContaining({ value: 72, reviewRequired: false }) } });
    expect(result).not.toHaveProperty('mediaAssetId');
    expect(result).not.toHaveProperty('createdById');
    expect(result).not.toHaveProperty('errorMessage');
    await expect(service.updateOcrDraft(request, 'draft-fixture', { fields: {}, expectedUpdatedAt: time.toISOString() })).rejects.toThrow('不可访问');
  });
  it.each(['NUTRITIONIST', 'EXERCISE_COACH', 'ADMIN'] as const)('denies %s original report media before ownership fallback', async (role) => {
    const { service, prisma } = fixture(actor(role, 'staff-fixture'));
    expect(await service.canAccessMedia(actor(role, 'staff-fixture'), 'asset-fixture')).toBe(false);
    expect(prisma.healthReportDocument.findUnique).not.toHaveBeenCalled();
  });
  it('revokes doctor original media access when the current care assignment ends', async () => {
    const currentActor = actor('DOCTOR', 'doctor-fixture');
    const { service, prisma, care } = fixture(currentActor);
    prisma.healthReportDocument.findUnique.mockResolvedValue({ patientId: 'patient-fixture' });
    care.assertEnrollment.mockRejectedValue(new ForbiddenException('服务关系已结束'));
    expect(await service.canAccessMedia(currentActor, 'asset-fixture')).toBe(false);
  });
  it('rechecks relationship and actor state inside the write transaction', async () => {
    const { service, prisma } = fixture();
    prisma.careRelation.findUnique.mockResolvedValue({ status: 'ENDED' });
    await expect(service.createConsentDocument(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', version: '1.0' })).rejects.toThrow('关系已结束');
    expect(prisma.consentDocument.create).not.toHaveBeenCalled();
    prisma.user.findUnique.mockResolvedValue({ role: 'HEALTH_MANAGER', status: 'DISABLED' });
    await expect(service.createHealthReport(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', category: 'BODY_COMPOSITION' })).rejects.toThrow('失效');
  });
  it('keeps mock ancestry after editing and confirmation', async () => {
    const { service, prisma } = fixture();
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    prisma.ocrDraft.findUnique.mockResolvedValue(draft({ provider: 'mock', fields: { weightKg: { ...metric(), source: 'MANUAL' } } }));
    await service.confirmOcrDraft(request, 'draft-fixture', { reviewed: true, expectedUpdatedAt: time.toISOString() });
    expect(prisma.bodyAssessment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: 'MOCK_REVIEWED' }) }));
  });
  it('rejects null and invalid-calendar measurement dates rather than defaulting to epoch', async () => {
    const { service } = fixture();
    for (const date of [null, '2026-02-30']) {
      await expect(service.createOcrDraft(request, 'patient-fixture', { mediaAssetId: 'asset-fixture', sourceKind: 'INBODY_270', measuredAt: date as unknown as string })).rejects.toThrow('日期');
    }
  });
  it('requires the client edit version and increases the timestamp for every successful edit', async () => {
    const { service, prisma } = fixture();
    prisma.mediaAsset.findUnique.mockResolvedValue(boundSource);
    await expect(service.updateOcrDraft(request, 'draft-fixture', { fields: {}, expectedUpdatedAt: '2026-08-01T00:00:00Z' })).rejects.toThrow('重新核对');
    await service.updateOcrDraft(request, 'draft-fixture', { fields: { weightKg: metric() }, expectedUpdatedAt: time.toISOString() });
    expect(prisma.ocrDraft.updateMany.mock.calls[0][0].data.updatedAt.getTime()).toBeGreaterThan(time.getTime());
  });
});
