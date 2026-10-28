import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { HealthRecordDto, HealthRecordPatchDto, RecordsService } from './records';
import type { ClinicalService } from './clinical';
import type { PrismaService } from './prisma.service';

const req = {} as Request;
const patient = { sub: 'fictional-patient', role: 'PATIENT', typ: 'access', jti: 'unit-test' };
const measuredAt = new Date('2026-01-01T04:00:00Z');
const updatedAt = new Date('2026-01-01T05:00:00Z');

function setup(existing: any = null) {
  let current = existing;
  const healthRecord = {
    create: jest.fn(async ({ data }: any) => { current = { id: 'record-1', createdAt: measuredAt, updatedAt, ...data }; return current; }),
    findFirst: jest.fn(async () => existing),
    findUnique: jest.fn(async () => current),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    updateMany: jest.fn(async ({ data }: any) => { current = { ...current, ...data }; return { count: 1 }; }),
    delete: jest.fn(),
  };
  const mediaAsset = { findMany: jest.fn().mockResolvedValue([{ id: 'meal-image' }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const auditLog = { create: jest.fn() };
  const tx = { healthRecord, mediaAsset, auditLog };
  const prisma = { ...tx, $transaction: jest.fn(async (cb: any) => cb(tx)), user: { findUnique: jest.fn().mockResolvedValue({ patientProfile: { heightCm: 170, targetWeightKg: 65 } }) } };
  const clinical = { actor: jest.fn().mockResolvedValue(patient) };
  return { service: new RecordsService(prisma as unknown as PrismaService, clinical as unknown as ClinicalService), prisma, tx, clinical };
}

const dietRow = (overrides = {}) => ({
  id: 'record-1', patientId: patient.sub, recordType: 'DIET', mealType: 'LUNCH',
  note: '原餐食说明', mealItems: [{ name: '米饭', caloriesKcal: 200, weightGrams: 150 }],
  imageUrls: ['meal-image'], caloriesKcal: 200, caloriesSource: 'ITEM_SUM',
  payload: { details: '保留内容' }, measuredAt, updatedAt, source: 'MANUAL',
  weightKg: null, waistCm: null, hipCm: null, sleepHours: null, bodyFatPct: null,
  ...overrides,
});

describe('Records reconstruction: validation and persistence', () => {
  it.each([['KG', 70, 70], ['JIN', 140, 70], ['LB', 154.32358353, 70]])('stores %s input in canonical kg', async (weightUnit, weightValue, weightKg) => {
    const { service, tx } = setup();
    const result = await service.create(req, { recordType: 'WEIGHT', weightUnit: weightUnit as string, weightValue: weightValue as number, waistCm: 85, hipCm: 99 });
    expect(result).toMatchObject({ weightKg, weightUnit: 'kg', waistCm: 85, hipCm: 99 });
    expect(tx.healthRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ weightKg }) }));
  });

  it.each([
    { recordType: 'WEIGHT', weightValue: 70 },
    { recordType: 'WEIGHT', weightKg: 70, weightValue: 160, weightUnit: 'JIN' },
    { recordType: 'WEIGHT', weightValue: 10, weightUnit: 'KG' },
    { recordType: 'WEIGHT', weightKg: Number.NaN },
    { recordType: 'WEIGHT', weightKg: 70, hipCm: 500 },
    { recordType: 'SLEEP', sleepHours: 25 },
    { recordType: 'SLEEP' },
  ])('rejects invalid measurements without creating a record: %p', async (dto) => {
    const { service, tx } = setup();
    await expect(service.create(req, dto as HealthRecordDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.healthRecord.create).not.toHaveBeenCalled();
  });

  it('accepts text-only diet and keeps unknown calories explicit', async () => {
    const { service, tx } = setup();
    const result = await service.create(req, { recordType: 'DIET', mealType: 'LUNCH', note: '  今天吃了面条  ' });
    expect(result).toMatchObject({ note: '今天吃了面条', mealItems: [], caloriesKcal: null, caloriesSource: 'UNKNOWN' });
    expect(tx.mediaAsset.findMany).not.toHaveBeenCalled();
  });

  it('persists the food still being edited on submit and sums the full meal', async () => {
    const { service } = setup();
    const result = await service.create(req, { recordType: 'DIET', mealType: 'LUNCH', mealItems: [{ name: '米饭', caloriesKcal: 200 }], draftMealItem: { name: '  鸡蛋 ', caloriesKcal: 75, weightGrams: 50 } });
    expect(result.mealItems).toEqual([{ name: '米饭', caloriesKcal: 200 }, { name: '鸡蛋', caloriesKcal: 75, weightGrams: 50 }]);
    expect(result).toMatchObject({ caloriesKcal: 275, caloriesSource: 'ITEM_SUM' });
  });

  it('marks a partial food calorie sum instead of inventing unknown calories', async () => {
    const { service } = setup();
    const result = await service.create(req, { recordType: 'DIET', mealType: 'DINNER', mealItems: [{ name: '米饭', caloriesKcal: 200 }, { name: '蔬菜' }] });
    expect(result).toMatchObject({ caloriesKcal: 200, caloriesSource: 'ITEM_SUM_PARTIAL' });
  });

  it('allows a manual whole-meal estimate independently of the item sum', async () => {
    const { service } = setup();
    const result = await service.create(req, { recordType: 'DIET', mealType: 'DINNER', note: '外食估算', mealItems: [{ name: '米饭', caloriesKcal: 200 }], caloriesKcal: 550, caloriesSource: 'ESTIMATE' });
    expect(result).toMatchObject({ caloriesKcal: 550, caloriesSource: 'ESTIMATE' });
  });

  it('validates the whole-meal sum after adding the pending food', async () => {
    const { service } = setup();
    await expect(service.create(req, { recordType: 'DIET', mealType: 'LUNCH', mealItems: [{ name: '食物甲', caloriesKcal: 20000 }], draftMealItem: { name: '食物乙', caloriesKcal: 20000 } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([{ recordType: 'DIET', mealType: 'LUNCH' }, { recordType: 'DIET', mealType: 'LUNCH', note: '   ', mealItems: [], imageUrls: [] }])('rejects empty diet records', async (dto) => {
    const { service } = setup();
    await expect(service.create(req, dto as HealthRecordDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts image-only diet with owner, scope and binding restrictions', async () => {
    const { service, tx } = setup();
    const result = await service.create(req, { recordType: 'DIET', mealType: 'LUNCH', imageAssetIds: ['meal-image'] });
    expect(result.imageAssetIds).toEqual(['meal-image']);
    expect(tx.mediaAsset.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ ownerId: patient.sub, status: 'READY', deletedAt: null, posturePhoto: null, exerciseVideo: null, scope: { in: ['DIET_IMAGE', 'PRIVATE', 'GENERAL', 'FOLLOW_UP'] }, AND: [{ OR: [{ healthRecordId: null }, { healthRecordId: 'record-1' }] }, { OR: [{ referenceType: null }, { referenceType: 'HEALTH_RECORD', referenceId: 'record-1' }] }] }), select: { id: true } });
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scope: 'DIET_IMAGE', referenceType: 'HEALTH_RECORD', healthRecordId: 'record-1' }) }));
  });

  it('rejects an external URL as a new dietary attachment', async () => {
    const { service, tx } = setup();
    await expect(service.create(req, { recordType: 'DIET', mealType: 'LUNCH', imageUrls: ['https://invalid.example/private.jpg'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.healthRecord.create).not.toHaveBeenCalled();
  });

  it('rejects sensitive, foreign or already-bound media when lookup cannot authorize every ID', async () => {
    const { service, tx } = setup();
    tx.mediaAsset.findMany.mockResolvedValueOnce([]);
    await expect(service.create(req, { recordType: 'DIET', mealType: 'LUNCH', imageAssetIds: ['posture-image'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a concurrent media rebind within the transaction', async () => {
    const { service, tx } = setup();
    tx.mediaAsset.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.create(req, { recordType: 'DIET', mealType: 'LUNCH', imageAssetIds: ['meal-image'] })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('stores sleep duration as hours and supports zero as a recorded value', async () => {
    const { service } = setup();
    expect(await service.create(req, { recordType: 'SLEEP', sleepHours: 7.5 })).toMatchObject({ sleepHours: 7.5 });
    expect(await service.create(req, { recordType: 'SLEEP', sleepHours: 0 })).toMatchObject({ sleepHours: 0 });
  });

  it('limits writes to the authenticated patient', async () => {
    const { service, tx, clinical } = setup();
    clinical.actor.mockResolvedValueOnce({ ...patient, role: 'NUTRITIONIST' });
    await expect(service.create(req, { recordType: 'WEIGHT', weightKg: 70 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.healthRecord.create).not.toHaveBeenCalled();
  });
});

describe('Records reconstruction: edit and complete detail', () => {
  it('validates a partial PATCH without requiring recordType', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(pipe.transform({ note: '补充说明' }, { type: 'body', metatype: HealthRecordPatchDto })).resolves.toMatchObject({ note: '补充说明' });
  });

  it('preserves all dietary details when only editing text and time', async () => {
    const { service, tx } = setup(dietRow());
    const result = await service.update(req, 'record-1', { note: '补充说明', mealTime: '2026-01-01T06:00:00Z' } as HealthRecordPatchDto);
    expect(result).toMatchObject({ note: '补充说明', mealItems: [{ name: '米饭', caloriesKcal: 200, weightGrams: 150 }], imageAssetIds: ['meal-image'], caloriesKcal: 200, payload: { details: '保留内容' }, measuredAt: new Date('2026-01-01T06:00:00Z') });
    expect(tx.healthRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'record-1', patientId: patient.sub, updatedAt } }));
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
  });

  it('does not break a legacy record with an old raw URL when editing only text', async () => {
    const { service } = setup(dietRow({ imageUrls: ['https://invalid.example/legacy-meal.jpg'] }));
    await expect(service.update(req, 'record-1', { note: '兼容旧记录' } as HealthRecordPatchDto)).resolves.toMatchObject({ note: '兼容旧记录' });
  });

  it('keeps manual calorie corrections including zero and recalculates only automatic sums', async () => {
    const automatic = setup(dietRow());
    expect(await automatic.service.update(req, 'record-1', { mealItems: [{ name: '面条', caloriesKcal: 300 }] } as HealthRecordPatchDto)).toMatchObject({ caloriesKcal: 300, caloriesSource: 'ITEM_SUM' });
    const manual = setup(dietRow({ caloriesKcal: 500, caloriesSource: 'MANUAL' }));
    expect(await manual.service.update(req, 'record-1', { mealItems: [{ name: '面条', caloriesKcal: 300 }] } as HealthRecordPatchDto)).toMatchObject({ caloriesKcal: 500, caloriesSource: 'MANUAL' });
    expect(await manual.service.update(req, 'record-1', { caloriesKcal: 0 } as HealthRecordPatchDto)).toMatchObject({ caloriesKcal: 0, caloriesSource: 'MANUAL' });
  });

  it('does not relabel an existing record type', async () => {
    const { service, tx } = setup(dietRow());
    await expect(service.update(req, 'record-1', { recordType: 'WEIGHT', weightKg: 70 })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.healthRecord.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a stale edit without rebinding photos or producing audit side effects', async () => {
    const { service, tx } = setup(dietRow());
    tx.healthRecord.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.update(req, 'record-1', { note: '同时编辑' } as HealthRecordPatchDto)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects another patient record before update or detail', async () => {
    const { service, tx } = setup(null);
    await expect(service.update(req, 'foreign-record', { note: '不可修改' } as HealthRecordPatchDto)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detail(req, 'foreign-record')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.healthRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-record', patientId: patient.sub } }));
    expect(tx.healthRecord.updateMany).not.toHaveBeenCalled();
  });

  it('counts actual meals on the Shanghai calendar day and exposes missing sleep reminder', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-11T16:30:00Z'));
    try {
      const { service, tx } = setup();
      tx.healthRecord.findMany.mockResolvedValueOnce([
        dietRow({ measuredAt: new Date('2026-10-11T15:55:00Z'), mealType: 'DINNER' }),
        dietRow({ measuredAt: new Date('2026-10-11T16:15:00Z'), mealType: 'SNACK', caloriesKcal: null }),
      ] as never);
      const result = await service.report(req, '7d');
      expect(result.diet.today).toEqual({ date: '2026-10-12', timezone: 'Asia/Shanghai', mealCount: 1, mealCounts: { BREAKFAST: 0, LUNCH: 0, DINNER: 0, SNACK: 1 } });
      expect(result.nutrition.unknownMealCount).toBe(1);
      expect(result.sleep).toMatchObject({ recordedToday: false, reminder: '记录昨晚睡眠时长（小时）' });
    } finally { jest.useRealTimers(); }
  });
});

describe('saved food calorie provenance', () => {
  const foods = [
    { name: 'synthetic-egg', weightGrams: 100, caloriesKcal: 144, caloriesSource: 'ESTIMATE' as const },
    { name: 'synthetic-milk', weightGrams: 100, caloriesKcal: 54, caloriesSource: 'ESTIMATE' as const },
  ];
  it('preserves per-food estimate provenance through a saved manual override and clear', async () => {
    const create = setup();
    const saved = await create.service.create(req, { recordType: 'DIET', mealType: 'LUNCH', mealItems: foods,
      caloriesKcal: 420, caloriesSource: 'MANUAL', note: 'synthetic-meal', measuredAt: measuredAt.toISOString() });
    expect(saved).toMatchObject({ caloriesKcal: 420, caloriesSource: 'MANUAL', mealItems: foods });
    const reopened = setup(dietRow({ ...saved, mealItems: foods, measuredAt, updatedAt }));
    const cleared = await reopened.service.update(req, 'record-1', { caloriesKcal: null } as any);
    expect(cleared).toMatchObject({ caloriesKcal: 198, caloriesSource: 'ESTIMATE', mealItems: foods });
    expect(cleared.measuredAt).toEqual(measuredAt);
  });
  it('keeps partial sums and unestimated legacy items honest', async () => {
    const partial = setup();
    expect(await partial.service.create(req, { recordType: 'DIET', mealType: 'LUNCH', mealItems: [foods[0],
      { name: 'synthetic-unknown', caloriesSource: 'UNKNOWN' }] })).toMatchObject({ caloriesKcal: 144, caloriesSource: 'ITEM_SUM_PARTIAL',
        mealItems: [{ caloriesSource: 'ESTIMATE' }, { caloriesSource: 'UNKNOWN' }] });
    const legacy = setup(dietRow({ caloriesKcal: 420, caloriesSource: 'MANUAL' }));
    expect(await legacy.service.update(req, 'record-1', { caloriesKcal: null } as any)).toMatchObject({ caloriesKcal: 200, caloriesSource: 'ITEM_SUM' });
  });
  it.each([
    { name: 'synthetic-unknown', caloriesKcal: 100, caloriesSource: 'UNKNOWN' },
    { name: 'synthetic-missing', caloriesSource: 'ESTIMATE' },
    { name: 'synthetic-untrusted', caloriesKcal: 100, caloriesSource: 'DIAGNOSIS' },
  ])('rejects contradictory food provenance before writing: %p', async (food) => {
    const { service, tx } = setup();
    await expect(service.create(req, { recordType: 'DIET', mealType: 'LUNCH', mealItems: [food] as any })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.healthRecord.create).not.toHaveBeenCalled();
  });
  it('accepts the item marker through the actual DTO validation pipe', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const dto = await pipe.transform({ recordType: 'DIET', mealType: 'LUNCH', mealItems: foods },
      { type: 'body', metatype: HealthRecordDto });
    expect(dto.mealItems[0].caloriesSource).toBe('ESTIMATE');
  });
});
