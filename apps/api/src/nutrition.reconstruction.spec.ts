import { BadRequestException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import { NutritionRecordQueryDto, NutritionService, ReviewRecordDto } from './nutrition';
import type { ClinicalService } from './clinical';
import type { PrismaService } from './prisma.service';

const req = {} as Request;
const nutritionist = { sub: 'fictional-nutritionist', role: 'NUTRITIONIST', typ: 'access', jti: 'unit-test' };
const patient = { sub: 'fictional-patient', role: 'PATIENT', typ: 'access', jti: 'unit-test' };
const practitioner = { id: nutritionist.sub, displayName: '测试营养师', role: nutritionist.role };

function setup(actor = nutritionist, enrollment: any = { nutritionistId: nutritionist.sub }) {
  const reviews: any[] = [];
  const replies: any[] = [];
  const healthRecordReview = {
    create: jest.fn(async ({ data }: any) => { const row = { id: `review-${reviews.length + 1}`, ...data, practitioner, createdAt: new Date(), updatedAt: new Date(), replies: [] }; reviews.push(row); return row; }),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn(async () => reviews),
    upsert: jest.fn(),
  };
  const healthRecordReviewReply = { create: jest.fn(async ({ data }: any) => { const row = { id: `reply-${replies.length + 1}`, ...data, createdAt: new Date() }; replies.push(row); return row; }) };
  const healthRecord = { findFirst: jest.fn().mockResolvedValue({ id: 'record-1', patientId: patient.sub, recordType: 'DIET' }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) };
  const careEnrollment = { findUnique: jest.fn().mockResolvedValue(enrollment) };
  const notification = { create: jest.fn() };
  const auditLog = { create: jest.fn() };
  const tx = { healthRecordReview, healthRecordReviewReply, healthRecord, careEnrollment, notification, auditLog };
  const prisma = { ...tx, $transaction: jest.fn(async (cb: any) => cb(tx)) };
  const clinical = { actor: jest.fn().mockResolvedValue(actor), assertCare: jest.fn().mockResolvedValue(undefined) };
  return { service: new NutritionService(prisma as unknown as PrismaService, clinical as unknown as ClinicalService), prisma, tx, clinical, reviews, replies };
}

describe('Nutrition reconstruction: assigned dietary reviews', () => {
  it('allows an assigned nutritionist to append multiple reviews without doctor authorization or overwriting history', async () => {
    const { service, tx, clinical, reviews } = setup();
    const first = await service.reviewRecord(req, patient.sub, 'record-1', { comment: '第一条点评' });
    const second = await service.reviewRecord(req, patient.sub, 'record-1', { comment: '第二条点评' });
    expect(first.id).not.toBe(second.id);
    expect(reviews.map((row) => row.comment)).toEqual(['第一条点评', '第二条点评']);
    expect(tx.healthRecordReview.create).toHaveBeenCalledTimes(2);
    expect(tx.healthRecordReview.upsert).not.toHaveBeenCalled();
    expect(clinical.assertCare).not.toHaveBeenCalled();
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
  });

  it('rejects an unassigned nutritionist even when an old care relation could authorize them', async () => {
    const { service, tx, clinical } = setup(nutritionist, { nutritionistId: 'another-nutritionist' });
    await expect(service.reviewRecord(req, patient.sub, 'record-1', { comment: '无权点评' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(clinical.assertCare).not.toHaveBeenCalled();
    expect(tx.healthRecord.findFirst).not.toHaveBeenCalled();
    expect(tx.healthRecordReview.create).not.toHaveBeenCalled();
  });

  it('preserves authorized legacy relations only for patients without managed enrollment', async () => {
    const { service, clinical } = setup(nutritionist, null);
    await expect(service.reviewRecord(req, patient.sub, 'record-1', { comment: '旧照护关系点评' })).resolves.toMatchObject({ comment: '旧照护关系点评' });
    expect(clinical.assertCare).toHaveBeenCalledWith(nutritionist, patient.sub);
  });

  it('denies an inactive legacy relationship', async () => {
    const { service, tx, clinical } = setup(nutritionist, null);
    clinical.assertCare.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.reviewRecord(req, patient.sub, 'record-1', { comment: '不能点评' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.healthRecordReview.create).not.toHaveBeenCalled();
  });

  it('still checks active object scope for doctors', async () => {
    const actor = { ...nutritionist, role: 'DOCTOR' };
    const { service, clinical } = setup(actor);
    await service.reviewRecord(req, patient.sub, 'record-1', { comment: '医生点评' });
    expect(clinical.assertCare).toHaveBeenCalledWith(actor, patient.sub);
  });

  it.each(['PATIENT', 'EXERCISE_COACH', 'HEALTH_MANAGER', 'ADMIN'])('prevents %s from writing practitioner reviews', async (role) => {
    const { service, tx } = setup({ ...nutritionist, role });
    await expect(service.reviewRecord(req, patient.sub, 'record-1', { comment: '错误角色' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.healthRecordReview.create).not.toHaveBeenCalled();
  });

  it('rejects a foreign or posture record before writing a review', async () => {
    const { service, tx } = setup();
    tx.healthRecord.findFirst.mockResolvedValueOnce(null);
    await expect(service.reviewRecord(req, patient.sub, 'foreign-record', { comment: '不存在' })).rejects.toBeInstanceOf(NotFoundException);
    tx.healthRecord.findFirst.mockResolvedValueOnce({ id: 'posture-record', patientId: patient.sub, recordType: 'EXERCISE' });
    await expect(service.reviewRecord(req, patient.sub, 'posture-record', { comment: '体态' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.healthRecordReview.create).not.toHaveBeenCalled();
  });

  it('rejects empty review text', async () => {
    const { service, tx } = setup();
    await expect(service.reviewRecord(req, patient.sub, 'record-1', { comment: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.healthRecordReview.create).not.toHaveBeenCalled();
  });
});

describe('Nutrition reconstruction: field and object privacy', () => {
  it('returns dietary asset IDs and a field whitelist without customer identity, raw URLs, posture assets or arbitrary payload', async () => {
    const { service, tx } = setup();
    tx.healthRecord.findMany.mockResolvedValueOnce([{
      id: 'record-1', recordType: 'DIET', patientId: patient.sub, phone: '13800000001', displayName: '虚构身份', avatarUrl: 'https://invalid.example/avatar',
      weightKg: null, waistCm: null, hipCm: null, bodyFatPct: null, sleepHours: null,
      mealType: 'LUNCH', mealItems: [{ name: '米饭', caloriesKcal: 200, identity: '私有内容' }, { name: '联系电话13800000001', weightGrams: { private: '不可泄漏' } }],
      caloriesKcal: 200, caloriesSource: 'ITEM_SUM_PARTIAL',
      note: '联系方式13800000001，附件https://invalid.example/private', payload: { signature: '签字', originalUrl: 'https://invalid.example/consent' }, imageUrls: ['https://invalid.example/posture'],
      assets: [{ id: 'meal-image', referenceId: 'record-1', ownerId: patient.sub }, { id: 'foreign-image', referenceId: 'record-1', ownerId: 'foreign-patient' }, { id: 'other-record-image', referenceId: 'record-2', ownerId: patient.sub }],
      reviews: [{ id: 'review-1', healthRecordId: 'record-1', practitioner, comment: '联系13800000001', replies: [{ id: 'reply-1', reviewId: 'review-1', patientId: patient.sub, comment: '电话13800000001' }] }], measuredAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
    }]);
    const result = await service.patientRecords(req, patient.sub, { page: 1, pageSize: 30 });
    const row = result.items[0];
    expect(row.imageAssetIds).toEqual(['meal-image']);
    expect(row).not.toHaveProperty('patientId');
    expect(row).not.toHaveProperty('phone');
    expect(row).not.toHaveProperty('displayName');
    expect(row).not.toHaveProperty('avatarUrl');
    expect(row).not.toHaveProperty('payload');
    expect(row).not.toHaveProperty('imageUrls');
    expect(JSON.stringify(result)).not.toContain('13800000001');
    expect(JSON.stringify(result)).not.toContain('https://');
    expect(JSON.stringify(result)).not.toContain('不可泄漏');
    expect(row.reviews[0].replies[0]).not.toHaveProperty('patientId');
    expect(tx.healthRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { patientId: patient.sub, recordType: { in: ['WEIGHT', 'DIET', 'SLEEP'] } },
      select: expect.objectContaining({ assets: { where: { scope: 'DIET_IMAGE', referenceType: 'HEALTH_RECORD', status: 'READY', deletedAt: null }, select: { id: true, referenceId: true, ownerId: true } } }),
    }));
  });

  it('never exposes image IDs from non-diet records', async () => {
    const { service, tx } = setup();
    tx.healthRecord.findMany.mockResolvedValueOnce([{ id: 'record-1', recordType: 'WEIGHT', assets: [{ id: 'hidden-image', referenceId: 'record-1', ownerId: patient.sub }], reviews: [] }]);
    expect((await service.patientRecords(req, patient.sub, { page: 1, pageSize: 30 })).items[0].imageAssetIds).toEqual([]);
  });

  it('rejects an arbitrary record category and denies foreign enrollment before querying data', async () => {
    const first = setup();
    await expect(first.service.patientRecords(req, patient.sub, { recordType: 'EXERCISE' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(first.tx.healthRecord.findMany).not.toHaveBeenCalled();
    const second = setup(nutritionist, { nutritionistId: 'another-nutritionist' });
    await expect(second.service.patientRecords(req, patient.sub, { page: 1, pageSize: 30 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(second.tx.healthRecord.findMany).not.toHaveBeenCalled();
  });

  it('validates query pagination and required review content via the HTTP DTO contract', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    await expect(pipe.transform({ recordType: 'EXERCISE', pageSize: 500 }, { type: 'query', metatype: NutritionRecordQueryDto })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ comment: 42 }, { type: 'body', metatype: ReviewRecordDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Nutrition reconstruction: patient replies and readable history', () => {
  it('appends customer replies and makes them visible alongside chronological practitioner reviews', async () => {
    const { service, tx, clinical, replies } = setup(patient);
    const review = { id: 'review-1', healthRecordId: 'record-1', practitionerId: nutritionist.sub, practitioner, comment: '测试点评', createdAt: new Date('2026-01-01'), replies: [] as any[] };
    tx.healthRecordReview.findFirst.mockResolvedValue(review);
    await service.replyToReview(req, 'record-1', 'review-1', { comment: '第一条客户回复' });
    await service.replyToReview(req, 'record-1', 'review-1', { comment: '第二条客户回复' });
    review.replies = replies;
    tx.healthRecordReview.findMany.mockResolvedValueOnce([review]);
    clinical.actor.mockResolvedValueOnce(nutritionist);
    const history = await service.recordReviews(req, 'record-1', patient.sub);
    expect(history.items[0].replies.map((row: any) => row.comment)).toEqual(['第一条客户回复', '第二条客户回复']);
    expect(history.items[0].replies[0]).not.toHaveProperty('patientId');
    expect(tx.healthRecordReview.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'review-1', healthRecordId: 'record-1', healthRecord: { patientId: patient.sub } } }));
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
  });

  it('denies a reply to another customer or record without writing anything', async () => {
    const { service, tx } = setup(patient);
    await expect(service.replyToReview(req, 'foreign-record', 'review-1', { comment: '不能回复' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.healthRecordReviewReply.create).not.toHaveBeenCalled();
  });

  it('denies practitioner impersonation as a customer reply', async () => {
    const { service, tx } = setup();
    await expect(service.replyToReview(req, 'record-1', 'review-1', { comment: '不能代替客户' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.healthRecordReviewReply.create).not.toHaveBeenCalled();
  });

  it('preserves customer history without notifying a removed nutritionist', async () => {
    const { service, tx } = setup(patient, { nutritionistId: 'new-nutritionist' });
    tx.healthRecordReview.findFirst.mockResolvedValueOnce({ id: 'review-1', practitionerId: nutritionist.sub, practitioner });
    await expect(service.replyToReview(req, 'record-1', 'review-1', { comment: '保留历史回复' })).resolves.toMatchObject({ comment: '保留历史回复' });
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('denies another customer review history even with an explicit patientId', async () => {
    const { service, tx } = setup(patient);
    await expect(service.recordReviews(req, 'record-1', 'foreign-patient')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.healthRecordReview.findMany).not.toHaveBeenCalled();
  });
});