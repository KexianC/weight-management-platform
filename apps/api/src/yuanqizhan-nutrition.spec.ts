import { ForbiddenException } from '@nestjs/common';
import type { Actor } from './auth';
import { YuanqizhanService } from './yuanqizhan';
import { formDefinition, PHOTO_SLOTS, YUANQIZHAN_NOTICE } from './yuanqizhan-policy';

const request = {} as any;
function fixture() {
  let actor: Actor = { sub: 'nutritionist-a', role: 'NUTRITIONIST', typ: 'access', jti: 'synthetic' };
  let bound = true;
  let enrollment: any = null;
  const users = new Map<string, any>([
    ['nutritionist-a', { id: 'nutritionist-a', role: 'NUTRITIONIST', status: 'ACTIVE' }],
    ['patient-a', { id: 'patient-a', role: 'PATIENT', status: 'ACTIVE', displayName: '合成私有姓名', phone: '13800000000' }],
    ['patient-b', { id: 'patient-b', role: 'PATIENT', status: 'ACTIVE', displayName: '其他客户', phone: '13900000000' }],
  ]);
  const activities = [1, 2, 3].map(index => ({ id: `activity-${index}`, title: `合成活动${index}`, status: index === 2 ? 'ENDED' : 'ACTIVE', durationDays: 15, version: 1, createdAt: new Date(`2026-10-${String(10 + index).padStart(2, '0')}T00:00:00Z`) }));
  const members = activities.map((activity, index) => ({ id: `member-${index}`, activityId: activity.id, patientId: index === 2 ? 'patient-b' : 'patient-a', status: index === 1 ? 'REMOVED' : 'ACTIVE', joinedAt: new Date('2026-10-18T01:00:00Z'), startDate: '2026-10-18', group: 'A', version: 1, activity, _count: { records: 1 } }));
  const photos = Object.fromEntries(PHOTO_SLOTS.map(slot => [slot, `synthetic_${slot}`]));
  const row: any = { id: 'record-a', activityId: 'activity-1', memberId: 'member-0', patientId: 'patient-a', date: '2026-10-19', dayNumber: 2, formType: 'milestone', schemaVersion: 'synthetic', formSnapshot: formDefinition('milestone'), status: 'SUBMITTED', version: 1, answers: { name: '合成私有姓名', fasting_weight: 68.4, fatigue: 3, bowel_observation: { bowel_count: '每日一次', bowel_extra: '无腹痛，精神较昨日改善' } }, photos, submittedAt: new Date('2026-10-19T01:00:00Z'), createdAt: new Date('2026-10-19T01:00:00Z'), updatedAt: new Date('2026-10-19T01:00:00Z') };
  const filtered = (where: any) => members.filter(member => !where.patientId || member.patientId === where.patientId);
  const db: any = {
    user: { findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    careRelation: { findFirst: jest.fn(async ({ where }: any) => bound && where.patientId === 'patient-a' && where.practitionerId === 'nutritionist-a' ? { id: 'relation-a' } : null) },
    careEnrollment: { findUnique: jest.fn(async () => enrollment) },
    yuanqizhanActivity: { findUnique: jest.fn(async ({ where }: any) => activities.find(activity => activity.id === where.id) ?? null) },
    yuanqizhanMember: {
      findUnique: jest.fn(async ({ where }: any) => members.find(member => member.activityId === where.activityId_patientId.activityId && member.patientId === where.activityId_patientId.patientId) ?? null),
      findMany: jest.fn(async ({ where, skip = 0, take }: any) => filtered(where).slice(skip, take === undefined ? undefined : skip + take)),
      count: jest.fn(async ({ where }: any) => filtered(where).length),
    },
    yuanqizhanDailyRecord: {
      findMany: jest.fn(async ({ where }: any) => where.memberId === row.memberId ? [structuredClone(row)] : []),
      count: jest.fn(async ({ where }: any) => where.memberId === row.memberId ? 1 : 0),
      findUnique: jest.fn(async ({ where }: any) => { const key = where.activityId_patientId_date; return key.activityId === row.activityId && key.patientId === row.patientId && key.date === row.date ? structuredClone(row) : null; }),
    },
    auditLog: { create: jest.fn(async ({ data }: any) => data) },
    $transaction: jest.fn(async () => { throw new Error('Nutritionist reads must not write business state'); }),
  };
  const service: any = new YuanqizhanService(db, { actor: jest.fn(async () => actor) } as any, {} as any);
  return { service, db, row, photos, users, members, setBound: (next: boolean) => { bound = next; }, setEnrollment: (next: any) => { enrollment = next; }, setActor: (next: Actor) => { actor = next; } };
}

describe('bound nutritionist activity history', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-19T02:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  it('lists only the bound customer activities with pagination, including retained ended history', async () => {
    const f = fixture();
    const first = await f.service.patientActivities(request, 'patient-a', { page: 1, pageSize: 1 });
    const second = await f.service.patientActivities(request, 'patient-a', { page: 2, pageSize: 1 });
    expect(first).toMatchObject({ total: 2, page: 1, pageSize: 1, hasMore: true }); expect(second).toMatchObject({ total: 2, page: 2, hasMore: false });
    expect(first.items).toHaveLength(1); expect(second.items).toHaveLength(1);
    expect(JSON.stringify([first, second])).not.toContain('activity-3');
    expect(f.db.yuanqizhanMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ patientId: 'patient-a' }), skip: 1, take: 1 }));
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });
  it('returns health answers, photos and full form labels with a read-only identity-safe projection', async () => {
    const f = fixture(), before = structuredClone(f.row);
    const list = await f.service.records(request, 'activity-1', { page: 1, pageSize: 20 }, 'patient-a');
    const detail = await f.service.record(request, 'activity-1', '2026-10-19', 'patient-a');
    for (const value of [list.items[0], detail]) {
      expect(value).toMatchObject({ canWrite: false, readOnly: true, accessNotice: YUANQIZHAN_NOTICE, status: 'SUBMITTED' });
      expect(value.answers).toEqual({ fasting_weight: 68.4, fatigue: 3, bowel_observation: { bowel_count: '每日一次', bowel_extra: '无腹痛，精神较昨日改善' } });
      expect(value.photos).toEqual(f.photos); expect(value.form.questions.some((question: any) => question.key === 'name')).toBe(false);
      expect(value.form.questions.some((question: any) => question.key === 'fasting_weight' && question.label)).toBe(true);
      expect(JSON.stringify(value)).not.toContain('合成私有姓名'); expect(JSON.stringify(value)).not.toContain('13800000000');
    }
    expect(f.row).toEqual(before); expect(f.db.$transaction).not.toHaveBeenCalled();
    for (const call of f.db.auditLog.create.mock.calls) { const serialized = JSON.stringify(call[0]); expect(serialized).not.toContain('合成私有姓名'); expect(serialized).not.toContain('13800000000'); expect(serialized).not.toContain('无腹痛'); expect(serialized).not.toContain('synthetic_face'); }
  });
  it('rechecks binding on every activity list and record request after revocation', async () => {
    const f = fixture(); await f.service.record(request, 'activity-1', '2026-10-19', 'patient-a');
    f.setBound(false); f.db.yuanqizhanMember.findMany.mockClear(); f.db.yuanqizhanDailyRecord.findUnique.mockClear();
    await expect(f.service.patientActivities(request, 'patient-a', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.record(request, 'activity-1', '2026-10-19', 'patient-a')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.yuanqizhanMember.findMany).not.toHaveBeenCalled(); expect(f.db.yuanqizhanDailyRecord.findUnique).not.toHaveBeenCalled();
  });
  it.each(['revoked', 'reassigned', 'patient-disabled'])('does not return records when access becomes %s during the database read', async change => {
    const f = fixture();
    f.db.yuanqizhanDailyRecord.findMany.mockImplementation(async () => {
      if (change === 'revoked') f.setBound(false);
      else if (change === 'reassigned') f.setEnrollment({ nutritionistId: 'nutritionist-b' });
      else f.users.get('patient-a').status = 'DISABLED';
      return [structuredClone(f.row)];
    });
    await expect(f.service.records(request, 'activity-1', { page: 1, pageSize: 20 }, 'patient-a')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['unbound', 'managed-other'])('denies %s access despite knowing a member or activity ID', async kind => {
    const f = fixture(); if (kind === 'unbound') f.setBound(false); else f.setEnrollment({ nutritionistId: 'nutritionist-b' });
    await expect(f.service.patientActivities(request, 'patient-a', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.records(request, 'activity-1', { page: 1, pageSize: 20 }, 'patient-a')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.yuanqizhanDailyRecord.findMany).not.toHaveBeenCalled();
  });
  it('accepts current managed assignment but cannot read another customer', async () => {
    const f = fixture(); f.setEnrollment({ nutritionistId: 'nutritionist-a' });
    expect((await f.service.records(request, 'activity-1', { page: 1, pageSize: 20 }, 'patient-a')).total).toBe(1);
    await expect(f.service.records(request, 'activity-3', { page: 1, pageSize: 20 }, 'patient-b')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not authorize record writes, uploads or activity administration', async () => {
    const f = fixture();
    await expect(f.service.save(request, 'activity-1', {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.uploadPhoto(request, 'activity-1', 'face', { buffer: Buffer.from('synthetic'), size: 9, mimetype: 'image/png', originalname: 'synthetic.png' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.addMembers(request, 'activity-1', { patientIds: ['patient-a'] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });
});
