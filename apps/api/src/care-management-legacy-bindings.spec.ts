import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor, AuthService } from './auth';
import { CareManagementService } from './care-management';
import { ClinicalService } from './clinical';
import { NutritionService } from './nutrition';
import type { PrismaService } from './prisma.service';

const req = {} as Request;
const now = new Date('2026-10-18T04:00:00.000Z');
const actorFor = (id: string): Actor => ({ sub: id, role: 'NUTRITIONIST', typ: 'access', jti: 'synthetic-test' });
const label = (id: string) => `客户${id.slice(-8).toUpperCase()}`;

function fixture() {
  const nutritionists = Array.from({ length: 7 }, (_, i) => ({ id: `nutritionist-${i}`, role: 'NUTRITIONIST', status: 'ACTIVE', displayName: `测试营养师${i}` }));
  const patients = Array.from({ length: 7 }, (_, i) => ({
    id: `patient-0000000${i}`, role: 'PATIENT', status: 'ACTIVE', displayName: `私有客户姓名${i}`,
    phone: `1380000000${i}`, avatarUrl: `https://invalid.example/private-${i}`, patientProfile: { medicalHistory: '私有病史' },
  }));
  const users: any[] = [...nutritionists, ...patients];
  const relations: any[] = nutritionists.flatMap(nutritionist => patients.map(patient => ({
    id: `${nutritionist.id}:${patient.id}`, patientId: patient.id, practitionerId: nutritionist.id, status: 'ACTIVE',
  })));
  const enrollments: any[] = [];
  const records: any[] = [];
  const plans: any[] = [];
  const summaries: any[] = [];
  const followups: any[] = [];
  let actor = actorFor(nutritionists[0].id);
  const related = (patientId: string, filter: any) => relations.some(row => row.patientId === patientId
    && row.practitionerId === filter.practitionerId && row.status === filter.status);
  const selected = (row: any, select: any) => row && select
    ? Object.fromEntries(Object.keys(select).filter(key => select[key] === true).map(key => [key, row[key]])) : row;
  const recordMatches = (row: any, where: any) => (typeof where.patientId === 'string' ? row.patientId === where.patientId : where.patientId.in.includes(row.patientId))
    && (typeof where.recordType === 'string' ? row.recordType === where.recordType : where.recordType.in.includes(row.recordType))
    && (!where.measuredAt || (row.measuredAt >= where.measuredAt.gte && row.measuredAt < where.measuredAt.lt))
    && (!where.reviews || !row.reviews.some((review: any) => review.practitionerId === where.reviews.none.practitionerId));
  const db: any = {
    user: {
      findUnique: jest.fn(async ({ where, select }: any) => selected(users.find(row => row.id === where.id) ?? null, select)),
      findMany: jest.fn(async ({ where, select }: any) => users.filter(row => (!where.id || row.id === where.id)
        && row.role === where.role && row.status === where.status
        && (where.careEnrollment !== null || !enrollments.some(enrollment => enrollment.patientId === row.id))
        && (!where.patientRelations || related(row.id, where.patientRelations.some)))
        .map(row => selected(row, select))),
    },
    careEnrollment: {
      findUnique: jest.fn(async ({ where }: any) => {
        const row = enrollments.find(enrollment => enrollment.patientId === where.patientId);
        return row ? { ...row, patient: users.find(user => user.id === row.patientId) } : null;
      }),
      findMany: jest.fn(async ({ where }: any) => enrollments.filter(row => {
        const patient = users.find(user => user.id === row.patientId);
        return Object.entries(where).every(([key, value]) => key === 'patient'
          ? patient?.status === (value as any).status && related(patient.id, (value as any).patientRelations.some)
          : row[key] === value);
      }).map(row => ({ ...row, patient: users.find(user => user.id === row.patientId) }))),
    },
    careRelation: {
      findUnique: jest.fn(async ({ where }: any) => relations.find(row => row.patientId === where.patientId_practitionerId.patientId
        && row.practitionerId === where.patientId_practitionerId.practitionerId) ?? null),
      findFirst: jest.fn(async ({ where }: any) => relations.find(row => row.patientId === where.patientId
        && row.practitionerId === where.practitionerId && row.status === where.status) ?? null),
    },
    healthRecord: {
      findMany: jest.fn(async ({ where }: any) => records.filter(row => recordMatches(row, where))),
      count: jest.fn(async ({ where }: any) => records.filter(row => recordMatches(row, where)).length),
    },
    dietPlan: { findMany: jest.fn(async ({ where }: any) => plans.filter(row => where.patientId.in.includes(row.patientId)
      && row.practitionerId === where.practitionerId && row.status === where.status && row.startsAt <= where.startsAt.lte
      && (!row.endsAt || row.endsAt > where.OR[1].endsAt.gt))) },
    careSummary: { findMany: jest.fn(async ({ where }: any) => summaries.filter(row => where.patientId.in.includes(row.patientId)
      && row.practitionerId === where.practitionerId && row.periodType === where.periodType
      && row.periodStart >= where.periodStart.gte && row.publishedAt <= where.publishedAt.lte)) },
    followUp: { findMany: jest.fn(async ({ where }: any) => followups.filter(row => where.patientId.in.includes(row.patientId)
      && (!where.practitionerId || row.practitionerId === where.practitionerId)
      && where.status.in.includes(row.status) && row.scheduledAt < where.scheduledAt.lt)) },
    bodyAssessment: { findMany: jest.fn().mockResolvedValue([]) },
    posturePhoto: { findMany: jest.fn().mockResolvedValue([]) },
    exercisePrescription: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const auth = { actor: jest.fn(async () => actor), assertRole: jest.fn((who: Actor, ...roles: string[]) => {
    if (!roles.includes(who.role)) throw new ForbiddenException();
  }) };
  const clinical = new ClinicalService(db as PrismaService, auth as unknown as AuthService);
  const service = new CareManagementService(db as PrismaService, clinical);
  const nutrition = new NutritionService(db as PrismaService, clinical);
  function enroll(patientId: string, nutritionistId: string) {
    enrollments.push({
      id: `enrollment-${patientId}`, patientId, nutritionistId, doctorId: 'doctor-real', exerciseCoachId: 'coach-real',
      healthManagerId: 'manager-real', clientCode: `KHMANAGED${patientId.slice(-4)}`, packageName: '已登记真实服务',
      lifestyle: { sleepHours: 7 }, createdAt: new Date('2026-10-01T00:00:00Z'),
    });
  }
  return { service, nutrition, db, users, patients, nutritionists, relations, enrollments, records, plans, summaries, followups, enroll,
    as: (id: string, role: Actor['role'] = 'NUTRITIONIST') => { actor = { ...actorFor(id), role }; },
  };
}

describe('managed-care compatibility for explicit legacy nutrition relationships', () => {
  beforeEach(() => jest.useFakeTimers({ now }));
  afterEach(() => jest.useRealTimers());

  it('shows all seven clients to each of seven nutritionists, with readable details and shared workbench scope', async () => {
    const f = fixture();
    const originalState = JSON.stringify([f.users, f.relations, f.enrollments]);
    for (const nutritionist of f.nutritionists) {
      f.as(nutritionist.id);
      const list = await f.service.patients(req);
      expect(list.map(row => row.patient.id).sort()).toEqual(f.patients.map(row => row.id).sort());
      for (const patient of f.patients) {
        expect(await f.service.patient(req, patient.id)).toEqual({
          patient: { id: patient.id, displayName: label(patient.id), role: 'PATIENT' },
          enrollment: null, legacyAccount: true, lifestyle: null, bodyReports: [], exerciseReports: [], posturePhotos: [],
        });
      }
      const workbench = await f.service.workbench(req);
      expect(workbench.counts).toEqual({ pendingDietReviews: 0, pendingPlans: 7, pendingSummaries: 7, dueRechecks: 0 });
      expect(workbench.queues.pendingPlans.map(row => row.patientId).sort()).toEqual(f.patients.map(row => row.id).sort());
    }
    expect(JSON.stringify([f.users, f.relations, f.enrollments])).toBe(originalState);
    expect(f.db.$transaction).not.toHaveBeenCalled();
    expect(f.db.bodyAssessment.findMany).not.toHaveBeenCalled();
    expect(f.db.exercisePrescription.findMany).not.toHaveBeenCalled();
    expect(f.db.posturePhoto.findMany).not.toHaveBeenCalled();
  });

  it.each(['unbound', 'ENDED'])('excludes a %s client from list, details and every workbench queue', async status => {
    const f = fixture(); const patient = f.patients[0];
    const relation = f.relations.find(row => row.patientId === patient.id && row.practitionerId === f.nutritionists[0].id);
    if (status === 'unbound') f.relations.splice(f.relations.indexOf(relation), 1); else relation.status = status;
    f.records.push({ id: 'diet-hidden', patientId: patient.id, recordType: 'DIET', measuredAt: now, reviews: [] });
    f.followups.push({ id: 'follow-hidden', patientId: patient.id, practitionerId: f.nutritionists[0].id, status: 'SCHEDULED', scheduledAt: now });
    expect((await f.service.patients(req)).map(row => row.patient.id)).not.toContain(patient.id);
    await expect(f.service.patient(req, patient.id)).rejects.toBeInstanceOf(NotFoundException);
    const result = await f.service.workbench(req);
    expect(result.counts).toEqual({ pendingDietReviews: 0, pendingPlans: 6, pendingSummaries: 6, dueRechecks: 0 });
    expect(JSON.stringify(result.queues)).not.toContain(patient.id);
  });

  it.each(['DISABLED', 'DELETED'])('excludes %s patients even while their relationship remains active', async status => {
    const f = fixture(); f.patients[0].status = status;
    expect(await f.service.patients(req)).toHaveLength(6);
    await expect(f.service.patient(req, f.patients[0].id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await f.service.workbench(req)).counts.pendingPlans).toBe(6);
  });

  it('never treats a related staff account as a legacy patient', async () => {
    const f = fixture(); f.patients[0].role = 'DOCTOR';
    expect(await f.service.patients(req)).toHaveLength(6);
    await expect(f.service.patient(req, f.patients[0].id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await f.service.workbench(req)).counts.pendingPlans).toBe(6);
  });

  it.each(['DISABLED', 'DELETED', 'wrong-role', 'missing'])('rejects a stale %s nutritionist before querying patient data', async status => {
    const f = fixture();
    if (status === 'missing') f.users.splice(f.users.indexOf(f.nutritionists[0]), 1);
    else if (status === 'wrong-role') f.nutritionists[0].role = 'DOCTOR';
    else f.nutritionists[0].status = status;
    await expect(f.service.patients(req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.patient(req, f.patients[0].id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.workbench(req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.user.findMany).not.toHaveBeenCalled();
    expect(f.db.careEnrollment.findMany).not.toHaveBeenCalled();
    expect(f.db.healthRecord.findMany).not.toHaveBeenCalled();
  });

  it('keeps a managed client assigned exclusively to the enrollment nutritionist despite other active relationships', async () => {
    const f = fixture(); const patient = f.patients[0];
    f.enroll(patient.id, f.nutritionists[1].id);
    expect(await f.service.patients(req)).toHaveLength(6);
    await expect(f.service.patient(req, patient.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await f.service.workbench(req)).counts.pendingPlans).toBe(6);
    f.as(f.nutritionists[1].id);
    const list = await f.service.patients(req);
    expect(list).toHaveLength(7);
    expect(list.find(row => row.patient.id === patient.id)).toMatchObject({ patient: { displayName: f.enrollments[0].clientCode }, enrollment: { id: f.enrollments[0].id } });
    expect(await f.service.patient(req, patient.id)).toMatchObject({ enrollment: { id: f.enrollments[0].id }, lifestyle: { sleepHours: 7 } });
    expect((await f.service.workbench(req)).counts.pendingPlans).toBe(7);
  });

  it('does not restore a managed client through legacy fallback after their assigned relationship ends', async () => {
    const f = fixture(); const patient = f.patients[0];
    f.enroll(patient.id, f.nutritionists[0].id);
    f.relations.find(row => row.patientId === patient.id && row.practitionerId === f.nutritionists[0].id).status = 'ENDED';
    expect(await f.service.patients(req)).toHaveLength(6);
    await expect(f.service.patient(req, patient.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await f.service.workbench(req)).counts.pendingPlans).toBe(6);
  });

  it('uses a patient allowlist even if a database adapter returns identity and medical fields', async () => {
    const f = fixture();
    f.db.user.findMany.mockResolvedValue(f.patients);
    const list = await f.service.patients(req);
    const detail = await f.service.patient(req, f.patients[0].id);
    const workbench = await f.service.workbench(req);
    expect(Object.keys(detail.patient).sort()).toEqual(['displayName', 'id', 'role']);
    const serialized = JSON.stringify([list, detail, workbench]);
    for (const value of ['私有客户姓名', '1380000000', 'https://', '私有病史', 'patientProfile', 'avatarUrl', 'phone']) expect(serialized).not.toContain(value);
  });

  it('preserves historical timestamp account IDs verbatim in list, detail and queue links', async () => {
    const f = fixture(); const previousId = f.patients[0].id; const historicalId = 'user_1786674762384_x';
    f.patients[0].id = historicalId;
    for (const relation of f.relations) if (relation.patientId === previousId) relation.patientId = historicalId;
    expect((await f.service.patients(req)).find(row => row.patient.id === historicalId)?.patient).toEqual({ id: historicalId, displayName: label(historicalId), role: 'PATIENT' });
    expect((await f.service.patient(req, historicalId)).patient.id).toBe(historicalId);
    expect((await f.service.workbench(req)).queues.pendingPlans.find(row => row.patientId === historicalId)?.clientCode).toBe(label(historicalId));
  });

  it('deduplicates repeated and overlapping adapter rows while preserving the managed projection', async () => {
    const f = fixture(); const [first, second] = f.patients;
    f.enroll(first.id, f.nutritionists[0].id);
    f.db.user.findMany.mockResolvedValue([first, first, second, second]);
    const list = await f.service.patients(req);
    expect(list).toHaveLength(2);
    expect(list.find(row => row.patient.id === first.id)?.patient.displayName).toBe(f.enrollments[0].clientCode);
    const workbench = await f.service.workbench(req);
    expect(workbench.counts.pendingPlans).toBe(2);
    expect(workbench.queues.pendingPlans.find(row => row.patientId === first.id)?.clientCode).toBe(f.enrollments[0].clientCode);
  });

  it('computes real legacy queues using own reviews, current plans, weekly summaries and due followups', async () => {
    const f = fixture(); const [first, second] = f.patients; const owner = f.nutritionists[0].id;
    f.records.push(
      { id: 'pending-diet', patientId: first.id, recordType: 'DIET', measuredAt: now, reviews: [] },
      { id: 'reviewed-diet', patientId: first.id, recordType: 'DIET', measuredAt: now, reviews: [{ practitionerId: owner }] },
      { id: 'peer-reviewed-diet', patientId: second.id, recordType: 'DIET', measuredAt: now, reviews: [{ practitionerId: 'another-nutritionist' }] },
      { id: 'yesterday-diet', patientId: first.id, recordType: 'DIET', measuredAt: new Date(now.getTime() - 86400000), reviews: [] },
    );
    f.plans.push({ patientId: first.id, practitionerId: owner, status: 'ACTIVE', startsAt: new Date('2026-10-01'), endsAt: null });
    f.summaries.push({ patientId: second.id, practitionerId: owner, periodType: 'WEEKLY', periodStart: new Date('2026-10-12T00:00:00+08:00'), publishedAt: now });
    f.followups.push(
      { id: 'own-due', patientId: first.id, practitionerId: owner, status: 'SCHEDULED', scheduledAt: now },
      { id: 'peer-due', patientId: second.id, practitionerId: 'another-nutritionist', status: 'SCHEDULED', scheduledAt: now },
      { id: 'completed', patientId: second.id, practitionerId: owner, status: 'COMPLETED', scheduledAt: now },
    );
    const result = await f.service.workbench(req);
    expect(result.counts).toEqual({ pendingDietReviews: 2, pendingPlans: 6, pendingSummaries: 6, dueRechecks: 1 });
    expect(result.queues.pendingDietReviews.map(row => row.recordId)).toEqual(['pending-diet', 'peer-reviewed-diet']);
    expect(result.queues.dueRechecks).toEqual([expect.objectContaining({ followUpId: 'own-due', clientCode: label(first.id) })]);
    expect(result.queues.pendingPlans.map(row => row.patientId)).not.toContain(first.id);
    expect(result.queues.pendingSummaries.map(row => row.patientId)).not.toContain(second.id);
  });

  it('keeps managed writes and exercise sharing closed for a relation-only client', async () => {
    const f = fixture(); const patient = f.patients[0];
    f.db.exercisePrescription.findUnique.mockResolvedValue({ id: 'exercise-foreign', patientId: patient.id });
    await expect(f.service.assertEnrollment(actorFor(f.nutritionists[0].id), patient.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(f.service.shareExerciseReport(req, 'exercise-foreign', { reviewed: true })).rejects.toBeInstanceOf(NotFoundException);
    await expect(f.service.createBodyReport(req, patient.id, { measuredAt: now.toISOString(), weightKg: 70 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the existing authorized nutrition records entry usable without manufacturing enrollment', async () => {
    const f = fixture(); const patient = f.patients[0];
    f.records.push({ id: 'legacy-weight', patientId: patient.id, recordType: 'WEIGHT', measuredAt: now, weightKg: 70, assets: [], reviews: [] });
    expect(await f.nutrition.patientRecords(req, patient.id, { page: 1, pageSize: 30 })).toMatchObject({ total: 1, items: [{ id: 'legacy-weight', weightKg: 70 }] });
    f.relations.find(row => row.patientId === patient.id && row.practitionerId === f.nutritionists[0].id).status = 'ENDED';
    await expect(f.nutrition.patientRecords(req, patient.id, { page: 1, pageSize: 30 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.enrollments).toHaveLength(0);
  });
});
