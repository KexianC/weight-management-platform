import { ConflictException, ForbiddenException } from '@nestjs/common';
import { YuanqizhanService } from './yuanqizhan';
import { formDefinition } from './yuanqizhan-policy';

const dailyAnswers = {name: '合成患者', fasting_weight: 70, fatigue: 2, hunger: 2, appetite: 0, sleep_quality: 4, energy_complexion: 4, bowel_observation: {bowel_count: '1'}, stool_type: 4};
function harness() {
  let role = 'PATIENT';
  const activity: any = {id: 'activity', title: '合成活动', durationDays: 15, status: 'ACTIVE', version: 1};
  const member: any = {id: 'member', activityId: activity.id, patientId: 'patient', status: 'ACTIVE', joinedAt: new Date('2026-10-14T01:00:00Z'), startDate: '2026-10-14', version: 1};
  let row: any = null;
  const revisions: any[] = [];
  const photoRows: any[] = [];
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    yuanqizhanActivity: {findUnique: jest.fn(async () => ({...activity}))},
    yuanqizhanMember: {
      findUnique: jest.fn(async () => ({...member, activity: {...activity}})),
      update: jest.fn(async ({data}) => {Object.assign(member, {...data, version: member.version + (data.version?.increment ?? 0)}); return {...member};}),
    },
    yuanqizhanDailyRecord: {
      findUnique: jest.fn(async () => row ? {...row} : null),
      create: jest.fn(async ({data}) => {row = {...data, id: 'record', version: 1}; return {...row};}),
      update: jest.fn(async ({data}) => {row = {...row, ...data, version: row.version + data.version.increment}; return {...row};}),
      findMany: jest.fn(async () => row ? [{...row}] : []), count: jest.fn(async () => row ? 1 : 0),
    },
    yuanqizhanRecordRevision: {
      findUnique: jest.fn(async ({where}) => {const found = revisions.find((r) => r.requestKey === where.memberId_requestKey.requestKey); return found ? {...found, record: {...row}} : null;}),
      create: jest.fn(async ({data}) => {const revision = {...data, id: 'revision' + revisions.length}; revisions.push(revision); return revision;}),
    },
    yuanqizhanPhoto: {findUnique: jest.fn(async () => null), create: jest.fn(async ({data}: any) => {photoRows.push(data); return data;})},
    user: {findUnique: jest.fn(async () => ({role: 'PATIENT', status: 'ACTIVE'})), findMany: jest.fn(async () => [{id: 'patient', displayName: '合成患者', status: 'ACTIVE'}])},
    auditLog: {create: jest.fn().mockResolvedValue({})},
  };
  const prisma: any = {...tx, $transaction: jest.fn(async (work) => {
    const prior = structuredClone(row), oldRevisions = revisions.length, oldPhotos = photoRows.length;
    try {return await work(tx);} catch (error) {row = prior; revisions.splice(oldRevisions); photoRows.splice(oldPhotos); throw error;}
  })};
  const clinical = {actor: jest.fn(async () => ({sub: role === 'PATIENT' ? 'patient' : 'staff', role}))};
  const media = {uploadYuanqizhan: jest.fn()};
  const service = new YuanqizhanService(prisma, clinical as any, media as any);
  const save = (patch = {}) => service.save({} as any, 'activity', {date: '2026-10-15', expectedVersion: 0, idempotencyKey: 'synthetic_request_0001', status: 'SUBMITTED', answers: dailyAnswers, photos: {}, ...patch});
  return {service, tx, prisma, member, activity, media, revisions, photoRows, save, setRole: (next: string) => {role = next;}, current: () => row};
}

describe('Yuanqizhan save lifecycle (mock transaction; SQL races verified separately)', () => {
  beforeEach(() => {jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-15T02:00:00Z'));});
  afterEach(() => jest.useRealTimers());
  it('locks activity then membership before creating a unique day record and immutable revision', async () => {
    const h = harness(); const saved = await h.save();
    expect(saved.status).toBe('SUBMITTED'); expect(saved.version).toBe(1); expect(saved.answers.appetite).toBe(0);
    expect(h.revisions).toHaveLength(1); expect(h.current().formSnapshot).toEqual(formDefinition('daily'));
    expect(h.tx.$queryRaw.mock.calls.map(([template]: [TemplateStringsArray]) => template.join(''))).toEqual([
      'SELECT id FROM YuanqizhanActivity WHERE id =  FOR UPDATE',
      'SELECT id FROM YuanqizhanMember WHERE activityId =  AND patientId =  FOR UPDATE',
    ]);
  });
  it('replays the original revision after a later edit and rejects key reuse with different payload', async () => {
    const h = harness(); const first = await h.save();
    await h.save({expectedVersion: 1, idempotencyKey: 'synthetic_request_0002', answers: {...dailyAnswers, fasting_weight: 69}});
    const replay = await h.save();
    expect(replay.version).toBe(1); expect(replay.answers.fasting_weight).toBe(first.answers.fasting_weight);
    expect((replay as any).idempotentReplay).toBe(true); expect(h.current().version).toBe(2); expect(h.revisions).toHaveLength(2);
    await expect(h.save({answers: {...dailyAnswers, fasting_weight: 68}})).rejects.toBeInstanceOf(ConflictException);
  });
  it('requires optimistic version on edits and cannot demote a submitted record to draft', async () => {
    const h = harness(); await h.save();
    await expect(h.save({idempotencyKey: 'synthetic_request_0002'})).rejects.toBeInstanceOf(ConflictException);
    await expect(h.save({expectedVersion: 1, idempotencyKey: 'synthetic_request_0003', status: 'DRAFT'})).rejects.toBeInstanceOf(ConflictException);
    expect(h.current().status).toBe('SUBMITTED'); expect(h.revisions).toHaveLength(1);
  });
  it('persists incomplete drafts and requires validation when promoting to submitted', async () => {
    const h = harness(); const draft = await h.save({status: 'DRAFT', answers: {name: '合成患者'}});
    expect(draft.status).toBe('DRAFT'); expect(draft.submittedAt).toBe(null);
    await expect(h.save({expectedVersion: 1, idempotencyKey: 'synthetic_request_0002', answers: {name: '合成患者'}})).rejects.toThrow();
    const submitted = await h.save({expectedVersion: 1, idempotencyKey: 'synthetic_request_0003'});
    expect(submitted.status).toBe('SUBMITTED'); expect(submitted.version).toBe(2);
  });
  it('rejects future/backfill dates, removed members, ended activities and unbound photos before mutation', async () => {
    for (const patch of [{date: '2026-10-14'}, {date: '2026-10-16'}]) {
      const h = harness(); await expect(h.save(patch)).rejects.toBeInstanceOf(ForbiddenException); expect(h.current()).toBe(null);
    }
    const removed = harness(); removed.member.status = 'REMOVED'; await expect(removed.save()).rejects.toBeInstanceOf(ForbiddenException);
    const ended = harness(); ended.activity.status = 'ENDED'; await expect(ended.save()).rejects.toBeInstanceOf(ForbiddenException);
    const photo = harness(); jest.setSystemTime(new Date('2026-10-14T02:00:00Z'));
    await expect(photo.save({date: '2026-10-14', answers: {...dailyAnswers, fasting_waist: 80}, photos: Object.fromEntries(['tongue_coating', 'tongue_underside', 'face', 'body_front', 'body_side', 'body_back'].map((slot) => [slot, 'asset_' + slot]))})).rejects.toBeInstanceOf(ForbiddenException);
    expect(photo.current()).toBe(null);
  });
  for (const status of ['DRAFT', 'SUBMITTED']) it(`rolls back a ${status} save which crosses Shanghai midnight during persistence`, async () => {
    const h = harness(); jest.setSystemTime(new Date('2026-10-15T15:59:59.999Z'));
    const originalCreate = h.tx.yuanqizhanDailyRecord.create.getMockImplementation();
    h.tx.yuanqizhanDailyRecord.create.mockImplementation(async (input: any) => {
      const result = await originalCreate(input); jest.setSystemTime(new Date('2026-10-15T16:00:00.000Z')); return result;
    });
    await expect(h.save({status})).rejects.toBeInstanceOf(ConflictException);
    expect(h.current()).toBe(null); expect(h.revisions).toHaveLength(0);
  });
  it('rolls back a photo association which crosses Shanghai midnight during metadata persistence', async () => {
    const h = harness(); jest.setSystemTime(new Date('2026-10-14T15:59:59.999Z'));
    h.media.uploadYuanqizhan.mockResolvedValue({id: 'synthetic_photo'});
    const originalCreate = h.tx.yuanqizhanPhoto.create.getMockImplementation();
    h.tx.yuanqizhanPhoto.create.mockImplementation(async (input: any) => {
      const result = await originalCreate(input); jest.setSystemTime(new Date('2026-10-14T16:00:00.000Z')); return result;
    });
    await expect(h.service.uploadPhoto({} as any, 'activity', 'face', {buffer: Buffer.from('synthetic'), size: 9, mimetype: 'image/png', originalname: 'synthetic.png'})).rejects.toBeInstanceOf(ConflictException);
    expect(h.photoRows).toHaveLength(0);
  });
  it('reactivates a removed member with their original start without touching service enrollment', async () => {
    const h = harness(); h.setRole('ADMIN'); h.member.status = 'REMOVED';
    const result = await h.service.addMembers({} as any, 'activity', {patientIds: ['patient']});
    expect(result.items[0].status).toBe('ACTIVE'); expect(result.items[0].startDate).toBe('2026-10-14'); expect(result.items[0].joinedAt).toEqual(new Date('2026-10-14T01:00:00Z'));
    expect(h.tx.yuanqizhanMember.update.mock.calls[0][0].data.joinedAt).toBeUndefined();
    expect(h.tx.careEnrollment).toBeUndefined(); expect(h.tx.careRelation).toBeUndefined();
  });
  it('does not let ADMIN or exercise coach read activity health answers', async () => {
    for (const role of ['ADMIN', 'EXERCISE_COACH']) {
      const h = harness(); h.setRole(role);
      await expect(h.service.records({} as any, 'activity', {page: 1, pageSize: 20}, 'patient')).rejects.toBeInstanceOf(ForbiddenException);
      expect(h.tx.yuanqizhanDailyRecord.findMany).not.toHaveBeenCalled();
    }
  });
  it('denies an unbound nutritionist before loading activity answers', async () => {
    const h = harness(); h.setRole('NUTRITIONIST');
    h.prisma.user.findUnique.mockImplementation(async ({ where }: any) => ({ role: where.id === 'staff' ? 'NUTRITIONIST' : 'PATIENT', status: 'ACTIVE' }));
    (h.prisma as any).careRelation = { findFirst: jest.fn().mockResolvedValue(null) };
    (h.prisma as any).careEnrollment = { findUnique: jest.fn().mockResolvedValue(null) };
    await expect(h.service.records({} as any, 'activity', {page: 1, pageSize: 20}, 'patient')).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.tx.yuanqizhanDailyRecord.findMany).not.toHaveBeenCalled();
  });
});
