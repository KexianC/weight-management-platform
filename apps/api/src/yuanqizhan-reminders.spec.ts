import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SmsReminderRejectedError } from './sms-delivery';
import { YuanqizhanRemindersService, yuanqizhanReminderId, yuanqizhanReminderTime } from './yuanqizhan-reminders';

const DATE = '2026-10-18';
const PRIOR_DATE = '2026-10-17';
const AT_20 = new Date(`${DATE}T20:00:00+08:00`);

// Only the database and SMS boundary are mocked. The reminder's date, eligibility,
// claim, recheck, pagination and result logic all run through the real service.
function harness() {
  const members: any[] = [];
  const records = new Map<string, {id: string; status: string}>();
  const audits = new Map<string, any>();
  let beforeRecheck: (() => void) | undefined;
  const key = (activityId: string, patientId: string, date = DATE) => `${activityId}:${patientId}:${date}`;
  const submittedRecords = (member: any) => [...records.entries()]
    .filter(([recordKey, record]) => recordKey.startsWith(`${member.activityId}:${member.patientId}:`) && record.status === 'SUBMITTED')
    .map(([, record]) => ({id: record.id}));
  const snapshot = (id: string) => {
    const member = members.find((item) => item.id === id);
    if (!member) return null;
    return {...member, activity: {...member.activity}, patient: {...member.patient}, records: submittedRecords(member)};
  };
  const auditLog = {
    findUnique: jest.fn(async ({where}: any) => audits.get(where.id) ?? null),
    create: jest.fn(async ({data}: any) => {
      // Match the durable primary-key constraint even when two runs interleave.
      if (audits.has(data.id)) throw new Prisma.PrismaClientKnownRequestError('Synthetic duplicate claim', {code: 'P2002', clientVersion: '6.14.0'});
      audits.set(data.id, data);
      return data;
    }),
  };
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    yuanqizhanMember: {findUnique: jest.fn(async ({where}: any) => snapshot(where.id))},
    yuanqizhanDailyRecord: {findUnique: jest.fn(async ({where}: any) => {
      const {activityId, patientId, date} = where.activityId_patientId_date;
      return records.get(key(activityId, patientId, date)) ?? null;
    })},
    auditLog,
  };
  const prisma: any = {
    $transaction: jest.fn(async (work: any) => work(tx)),
    auditLog,
    yuanqizhanMember: {
      findUnique: jest.fn(async ({where}: any) => snapshot(where.id)),
      findMany: jest.fn(async ({where, cursor, skip = 0, take, include}: any) => {
        if (include) beforeRecheck?.();
        const candidates = members.filter((member) => member.status === where.status
          && (!where.patientId || member.patientId === where.patientId)
          && member.joinedAt <= where.joinedAt.lte
          && (!where.startDate || (member.startDate !== null && member.startDate <= where.startDate.lte))
          && member.activity.status === where.activity.status
          && member.patient.role === where.patient.role && member.patient.status === where.patient.status
          && (!where.records.some || submittedRecords(member).length > 0)
          && records.get(key(member.activityId, member.patientId, where.records.none.date))?.status !== where.records.none.status)
          .sort((a, b) => a.id.localeCompare(b.id));
        const offset = cursor ? candidates.findIndex((member) => member.id === cursor.id) + skip : 0;
        return candidates.slice(offset, take === undefined ? undefined : offset + take)
          .map(({id, activityId, patientId}) => include ? snapshot(id) : ({id, activityId, patientId}));
      }),
    },
  };
  const sms = {
    isFollowUpConfigured: jest.fn().mockReturnValue(true),
    sendFollowUpReminder: jest.fn().mockResolvedValue({bizId: 'synthetic-biz', requestId: 'synthetic-request'}),
  };
  const setRecord = (member: any, status: string, date = DATE) => records.set(key(member.activityId, member.patientId, date), {id: `record-${member.id}-${date}`, status});
  const clearRecords = (member: any) => {
    for (const recordKey of [...records.keys()]) if (recordKey.startsWith(`${member.activityId}:${member.patientId}:`)) records.delete(recordKey);
  };
  const add = (patch: any = {}) => {
    const {neverSubmitted = false, ...memberPatch} = patch;
    const index = members.length + 1;
    const member: any = {
      id: `member-${String(index).padStart(4, '0')}`, activityId: `activity-${index}`, patientId: `patient-${index}`,
      status: 'ACTIVE', joinedAt: new Date(`${DATE}T10:00:00+08:00`), startDate: DATE,
      ...memberPatch,
      activity: {status: 'ACTIVE', durationDays: 15, ...patch.activity},
      patient: {role: 'PATIENT', status: 'ACTIVE', phone: `139${String(index).padStart(8, '0')}`, patientRelations: [], ...patch.patient},
    };
    members.push(member);
    if (!neverSubmitted) setRecord(member, 'SUBMITTED', PRIOR_DATE);
    return member;
  };
  const claimRows = () => [...audits.values()].filter((audit) => audit.action === 'YUANQIZHAN_REMINDER_CLAIM');
  const resultRows = () => [...audits.values()].filter((audit) => audit.action === 'YUANQIZHAN_REMINDER_RESULT');
  return {service: new YuanqizhanRemindersService(prisma, sms as any), prisma, tx, sms, members, audits, add, setRecord, clearRecords, snapshot, claimRows, resultRows,
    onRecheck: (hook: () => void) => {beforeRecheck = hook;}};
}

describe('Yuanqizhan 20:00 SMS reminders (mock SMS and database)', () => {
  let priorNotBefore: string | undefined;
  beforeEach(() => {
    priorNotBefore = process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE;
    delete process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE;
    jest.useFakeTimers(); jest.setSystemTime(AT_20);
  });
  afterEach(() => {
    if (priorNotBefore === undefined) delete process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE;
    else process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE = priorNotBefore;
    jest.useRealTimers(); jest.restoreAllMocks();
  });

  it('uses Shanghai 20:00 regardless of the server timezone and opens the next day at its own 20:00', () => {
    expect(yuanqizhanReminderTime(new Date('2026-10-18T11:59:59.999Z'))).toEqual({date: DATE, dueAt: AT_20, due: false});
    expect(yuanqizhanReminderTime(new Date('2026-10-18T12:00:00.000Z'))).toEqual({date: DATE, dueAt: AT_20, due: true});
    expect(yuanqizhanReminderTime(new Date('2026-10-18T16:00:00.000Z'))).toEqual({date: '2026-10-19', dueAt: new Date('2026-10-19T12:00:00Z'), due: false});
  });

  it('does not query members or create claims at 19:59, then sends at exactly 20:00', async () => {
    const h = harness(); h.add();
    jest.setSystemTime(new Date(`${DATE}T19:59:59+08:00`));
    expect(await h.service.run()).toMatchObject({state: 'BEFORE_20_00', scanned: 0, accepted: 0});
    expect(h.prisma.yuanqizhanMember.findMany).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
    jest.setSystemTime(AT_20);
    expect(await h.service.run()).toMatchObject({state: 'COMPLETE', accepted: 1});
  });

  it('reminds previously submitted members for missing records or drafts, while today\'s submission completes the day', async () => {
    const h = harness(); const missing = h.add(); const draft = h.add(); const submitted = h.add();
    h.setRecord(draft, 'DRAFT'); h.setRecord(submitted, 'SUBMITTED');
    expect(await h.service.run()).toMatchObject({scanned: 2, accepted: 2, skipped: 0});
    expect(h.sms.sendFollowUpReminder.mock.calls.map(([phone]) => phone)).toEqual([missing.patient.phone, draft.patient.phone]);
    expect(h.prisma.yuanqizhanMember.findMany.mock.calls[0][0].where).toMatchObject({startDate: {lte: DATE}, records: {some: {status: 'SUBMITTED'}, none: {date: DATE, status: 'SUBMITTED'}}});
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledWith(missing.patient.phone, {
      practitionerName: '随访', scheduledTime: `${DATE} 20:00:00`, content: '元气盏活动今日打卡尚未完成，请及时完成记录', date: DATE,
    });
    expect(h.resultRows().map((audit) => audit.metadata)).toEqual([
      {date: DATE, state: 'ACCEPTED', bizId: 'synthetic-biz', requestId: 'synthetic-request'},
      {date: DATE, state: 'ACCEPTED', bizId: 'synthetic-biz', requestId: 'synthetic-request'},
    ]);
  });

  it.each([
    ['张三', '张三'], ['李明医生', '李明'], ['Dr7', 'Dr7'], ['', '随访'], ['医生', '随访'], ['赵*', '随访'], ['A'.repeat(21), '随访'],
  ])('uses the current actual doctor name safely in the approved template: %s', async (displayName, expectedName) => {
    const h = harness(); const member = h.add({patient: {displayName: '患者姓名', patientRelations: [{practitioner: {displayName}}]}});
    expect(await h.service.run()).toMatchObject({accepted: 1});
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledWith(member.patient.phone, {
      practitionerName: expectedName, scheduledTime: `${DATE} 20:00:00`, content: '元气盏活动今日打卡尚未完成，请及时完成记录', date: DATE,
    });
    const finalQuery = h.prisma.yuanqizhanMember.findMany.mock.calls.find(([query]: any[]) => query.include)[0];
    expect(finalQuery.include.patient.select.patientRelations).toMatchObject({
      where: {status: 'ACTIVE', practitioner: {status: 'ACTIVE', role: 'DOCTOR'}},
      select: {practitioner: {select: {displayName: true}}},
      orderBy: [{createdAt: 'asc'}, {id: 'asc'}], take: 1,
    });
  });

  it('includes the first and last personal activity day and excludes days outside the duration', async () => {
    const h = harness(); const first = h.add(); const last = h.add({startDate: '2026-10-04', joinedAt: new Date('2026-10-04T10:00:00+08:00')});
    h.add({startDate: '2026-10-03', joinedAt: new Date('2026-10-03T10:00:00+08:00')});
    h.add({startDate: '2026-10-19'});
    expect(await h.service.run()).toMatchObject({scanned: 3, accepted: 2, skipped: 1});
    expect(h.sms.sendFollowUpReminder.mock.calls.map(([phone]) => phone)).toEqual([first.patient.phone, last.patient.phone]);
  });

  it.each([
    ['pending without records', null, false], ['pending with only a draft', null, true],
    ['legacy start without records', DATE, false], ['legacy start with only a draft', DATE, true],
  ])('does not claim or send before the first submission: %s', async (_label, startDate, withDraft) => {
    const h = harness(); const member = h.add({startDate, neverSubmitted: true});
    if (withDraft) h.setRecord(member, 'DRAFT');
    const originalMember = structuredClone(member);
    expect(await h.service.run()).toMatchObject({scanned: 0, accepted: 0, skipped: 0, failed: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.resultRows()).toHaveLength(0);
    expect(h.prisma.$transaction).not.toHaveBeenCalled(); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
    expect(member).toEqual(originalMember);
    expect(h.tx.yuanqizhanMember.update).toBeUndefined(); expect(h.tx.yuanqizhanDailyRecord.create).toBeUndefined();
  });

  it('does not remind a member with a null start even if an inconsistent historical submission exists', async () => {
    const h = harness(); h.add({startDate: null});
    expect(await h.service.run()).toMatchObject({scanned: 0, accepted: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('includes members effective by 20:00 and excludes those added after the deadline', async () => {
    const h = harness(); const atDeadline = h.add({joinedAt: AT_20}); h.add({joinedAt: new Date(`${DATE}T20:00:00.001+08:00`)});
    jest.setSystemTime(new Date(`${DATE}T21:00:00+08:00`));
    expect(await h.service.run()).toMatchObject({accepted: 1, scanned: 1});
    expect(h.sms.sendFollowUpReminder.mock.calls[0][0]).toBe(atDeadline.patient.phone);
  });

  it('excludes disabled patients, staff accounts, removed members and ended activities from scanning', async () => {
    const h = harness(); h.add({patient: {status: 'DISABLED'}}); h.add({patient: {role: 'DOCTOR'}});
    h.add({status: 'REMOVED'}); h.add({activity: {status: 'ENDED'}});
    expect(await h.service.run()).toMatchObject({scanned: 0, accepted: 0});
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
    expect(h.claimRows()).toHaveLength(0);
  });

  it.each([
    ['disabled patient', {patient: {status: 'DISABLED'}}],
    ['staff account', {patient: {role: 'DOCTOR'}}],
    ['removed member', {status: 'REMOVED'}],
    ['ended activity', {activity: {status: 'ENDED'}}],
    ['late joined member', {joinedAt: new Date(`${DATE}T20:01:00+08:00`)}],
  ])('revalidates a stale candidate before claiming: %s', async (_label, patch) => {
    const h = harness(); const member = h.add(patch);
    h.prisma.yuanqizhanMember.findMany.mockResolvedValueOnce([{id: member.id, activityId: member.activityId, patientId: member.patientId}]);
    expect(await h.service.run()).toMatchObject({scanned: 1, skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it.each([
    ['null start and no submission', null, true, false],
    ['null start despite an inconsistent submission', null, false, false],
    ['legacy start and no submission', DATE, true, false],
    ['legacy start and only a draft', DATE, true, true],
    ['future start despite a previous submission', '2026-10-19', false, false],
  ])('rejects a forced stale scan in the locked transaction: %s', async (_label, startDate, neverSubmitted, withDraft) => {
    const h = harness(); const member = h.add({startDate, neverSubmitted});
    if (withDraft) h.setRecord(member, 'DRAFT', PRIOR_DATE);
    h.prisma.yuanqizhanMember.findMany.mockResolvedValueOnce([{id: member.id, activityId: member.activityId, patientId: member.patientId}]);
    expect(await h.service.run()).toMatchObject({scanned: 1, skipped: 1, accepted: 0});
    expect(h.tx.yuanqizhanMember.findUnique).toHaveBeenCalledWith(expect.objectContaining({include: expect.objectContaining({
      records: {where: {status: 'SUBMITTED'}, select: {id: true}, take: 1},
    })}));
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('rechecks the activity\'s submission history inside the transaction after a stale scan', async () => {
    const h = harness(); const member = h.add();
    h.tx.yuanqizhanMember.findUnique.mockImplementationOnce(async () => {
      h.clearRecords(member);
      return h.snapshot(member.id);
    });
    expect(await h.service.run()).toMatchObject({scanned: 1, skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('rechecks submitted records after scanning and before creating a durable claim', async () => {
    const h = harness(); const member = h.add();
    h.tx.yuanqizhanMember.findUnique.mockImplementationOnce(async () => {
      h.setRecord(member, 'SUBMITTED');
      return h.snapshot(member.id);
    });
    expect(await h.service.run()).toMatchObject({skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it.each(['submitted', 'removed', 'ended', 'disabled', 'phone changed', 'member deleted', 'start cleared', 'history cleared', 'future start'])('cancels an existing claim if eligibility changes before sending: %s', async (change) => {
    const h = harness(); const member = h.add();
    h.onRecheck(() => {
      if (change === 'submitted') h.setRecord(member, 'SUBMITTED');
      if (change === 'removed') member.status = 'REMOVED';
      if (change === 'ended') member.activity.status = 'ENDED';
      if (change === 'disabled') member.patient.status = 'DISABLED';
      if (change === 'phone changed') member.patient.phone = '13900009999';
      if (change === 'member deleted') h.members.splice(0);
      if (change === 'start cleared') member.startDate = null;
      if (change === 'history cleared') h.clearRecords(member);
      if (change === 'future start') member.startDate = '2026-10-19';
    });
    expect(await h.service.run()).toMatchObject({skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(1);
    expect(h.resultRows()[0].metadata.state).toBe('CANCELLED');
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('still sends if one activity completes after claiming but another activity remains incomplete', async () => {
    const h = harness(); const first = h.add(); h.add({patientId: first.patientId, patient: {phone: first.patient.phone}});
    h.onRecheck(() => h.setRecord(first, 'SUBMITTED'));
    expect(await h.service.run()).toMatchObject({accepted: 1, skipped: 1});
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(1);
    expect(h.claimRows()).toHaveLength(1); expect(h.resultRows()[0].metadata.state).toBe('ACCEPTED');
  });

  it.each([null, DATE])('does not borrow another activity\'s first submission when this activity has never submitted (start=%s)', async (startDate) => {
    const h = harness(); const started = h.add(); h.setRecord(started, 'SUBMITTED');
    const pending = h.add({patientId: started.patientId, patient: {phone: started.patient.phone}, startDate, neverSubmitted: true});
    h.setRecord(pending, 'DRAFT');
    expect(await h.service.run()).toMatchObject({scanned: 0, accepted: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it.each([null, DATE])('cancels after a claim when its activity completes and the other activity has never submitted (start=%s)', async (startDate) => {
    const h = harness(); const started = h.add();
    const pending = h.add({patientId: started.patientId, patient: {phone: started.patient.phone}, startDate, neverSubmitted: true});
    h.setRecord(pending, 'DRAFT');
    h.onRecheck(() => h.setRecord(started, 'SUBMITTED'));
    expect(await h.service.run()).toMatchObject({scanned: 1, skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(1); expect(h.resultRows()[0].metadata.state).toBe('CANCELLED');
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
    const recheck = h.prisma.yuanqizhanMember.findMany.mock.calls.find(([query]: any[]) => query.include)[0];
    expect(recheck.where).toMatchObject({patientId: started.patientId, startDate: {lte: DATE}, records: {some: {status: 'SUBMITTED'}, none: {date: DATE, status: 'SUBMITTED'}}});
  });

  it('uses a deterministic patient/day claim across activities and subsequent runs', async () => {
    const h = harness(); const member = h.add(); h.add({patientId: member.patientId, patient: {phone: member.patient.phone}});
    expect(yuanqizhanReminderId(member.patientId, DATE)).toMatch(/^yuanqizhan-sms:2026-10-18:[a-f0-9]{64}$/);
    expect(yuanqizhanReminderId(member.patientId, DATE)).not.toBe(yuanqizhanReminderId(member.patientId, '2026-10-19'));
    expect(yuanqizhanReminderId(member.patientId, DATE)).not.toContain(member.patientId);
    expect(await h.service.run()).toMatchObject({accepted: 1, skipped: 1});
    expect(await h.service.run()).toMatchObject({accepted: 0, skipped: 2});
    expect(h.claimRows()).toHaveLength(1); expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(1);
    expect(h.claimRows()[0].id).toBe(yuanqizhanReminderId(member.patientId, DATE));
    jest.setSystemTime(new Date('2026-10-19T20:00:00+08:00'));
    expect(await h.service.run()).toMatchObject({accepted: 1, skipped: 1});
    expect(h.claimRows()).toHaveLength(2); expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(2);
  });

  it('allows only one sender when concurrent runs race for the same patient/day claim', async () => {
    const h = harness(); h.add();
    const results = await Promise.all([h.service.run(), h.service.run()]);
    expect(results.reduce((sum, result) => sum + result.accepted, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.skipped, 0)).toBe(1);
    expect(results.every((result) => result.failed === 0)).toBe(true);
    expect(h.claimRows()).toHaveLength(1); expect(h.resultRows()).toHaveLength(1);
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(1);
  });

  it('does not claim yesterday when a candidate lookup crosses Shanghai midnight', async () => {
    const h = harness(); const member = h.add(); jest.setSystemTime(new Date(`${DATE}T23:59:59.999+08:00`));
    h.tx.yuanqizhanMember.findUnique.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date('2026-10-19T00:00:00+08:00'));
      return h.snapshot(member.id);
    });
    expect(await h.service.run()).toMatchObject({date: DATE, skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('cancels yesterday\'s claim when the final recheck crosses Shanghai midnight', async () => {
    const h = harness(); h.add(); jest.setSystemTime(new Date(`${DATE}T23:59:59.999+08:00`));
    h.onRecheck(() => {jest.setSystemTime(new Date('2026-10-19T00:00:00+08:00'));});
    expect(await h.service.run()).toMatchObject({date: DATE, skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(1); expect(h.resultRows()[0].metadata.state).toBe('CANCELLED');
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('does not scan or consume daily claims when the follow-up template is unconfigured', async () => {
    const h = harness(); h.add(); h.sms.isFollowUpConfigured.mockReturnValue(false);
    expect(await h.service.run()).toMatchObject({state: 'NOT_CONFIGURED', scanned: 0, accepted: 0});
    expect(h.prisma.yuanqizhanMember.findMany).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled(); expect(h.claimRows()).toHaveLength(0);
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
    h.sms.isFollowUpConfigured.mockReturnValue(true);
    expect(await h.service.run()).toMatchObject({accepted: 1});
  });

  it('does not send a late-night catch-up before the configured activation time', async () => {
    const h = harness(); h.add({startDate: null, neverSubmitted: true});
    process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE = '2026-10-19T20:00:00+08:00';
    jest.setSystemTime(new Date(`${DATE}T23:00:00+08:00`));
    expect(await h.service.run()).toMatchObject({state: 'BEFORE_ACTIVATION', scanned: 0, accepted: 0});
    expect(h.prisma.yuanqizhanMember.findMany).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled(); expect(h.claimRows()).toHaveLength(0);
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
    jest.setSystemTime(new Date('2026-10-19T20:00:00+08:00'));
    expect(await h.service.run()).toMatchObject({date: '2026-10-19', state: 'COMPLETE', scanned: 0, accepted: 0});
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled(); expect(h.claimRows()).toHaveLength(0);
  });

  it.each(['not-a-date', '2026-13-45T20:00:00+08:00'])('does not consume claims when the activation time is invalid: %s', async (activation) => {
    const h = harness(); h.add(); process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE = activation;
    expect(await h.service.run()).toMatchObject({state: 'NOT_CONFIGURED', scanned: 0, accepted: 0});
    expect(h.prisma.yuanqizhanMember.findMany).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled(); expect(h.claimRows()).toHaveLength(0);
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('keeps the normal 20:00 boundary after activation is already allowed', async () => {
    const h = harness(); h.add(); process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE = `${DATE}T19:00:00+08:00`;
    jest.setSystemTime(new Date(`${DATE}T19:59:59+08:00`));
    expect(await h.service.run()).toMatchObject({state: 'BEFORE_20_00', scanned: 0, accepted: 0});
    expect(h.prisma.yuanqizhanMember.findMany).not.toHaveBeenCalled(); expect(h.claimRows()).toHaveLength(0);
    jest.setSystemTime(AT_20);
    expect(await h.service.run()).toMatchObject({state: 'COMPLETE', accepted: 1});
  });

  it.each(['', '1380013800', '138001380000', '+8613800138000', 'invalid'])('skips an invalid phone without consuming its claim: %s', async (phone) => {
    const h = harness(); h.add({patient: {phone}});
    expect(await h.service.run()).toMatchObject({scanned: 1, skipped: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(0); expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled();
  });

  it('continues after one SMS failure and preserves an unknown claim to prevent a duplicate retry', async () => {
    const h = harness(); const failed = h.add(); const accepted = h.add();
    h.sms.sendFollowUpReminder.mockRejectedValueOnce(new Error('synthetic timeout'));
    expect(await h.service.run()).toMatchObject({state: 'PARTIAL_FAILURE', scanned: 2, unknown: 1, accepted: 1, failed: 0});
    expect(h.sms.sendFollowUpReminder.mock.calls.map(([phone]) => phone)).toEqual([failed.patient.phone, accepted.patient.phone]);
    expect(h.resultRows().map((audit) => audit.metadata.state)).toEqual(['UNKNOWN', 'ACCEPTED']);
    expect(await h.service.run()).toMatchObject({state: 'PARTIAL_FAILURE', skipped: 1, unknown: 1, accepted: 0});
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(2);
  });

  it('distinguishes a provider rejection from an unknown timeout and continues to the next recipient', async () => {
    const h = harness(); h.add(); h.add();
    h.sms.sendFollowUpReminder.mockRejectedValueOnce(new SmsReminderRejectedError('Synthetic rejection'));
    expect(await h.service.run()).toMatchObject({state: 'PARTIAL_FAILURE', failed: 1, accepted: 1, unknown: 0});
    expect(h.resultRows().map((audit) => audit.metadata.state)).toEqual(['FAILED', 'ACCEPTED']);
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(2);
  });

  it('keeps an accepted send claim when persisting the delivery result fails', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = harness(); h.add();
    const original = h.prisma.auditLog.create.getMockImplementation();
    h.prisma.auditLog.create.mockImplementation(async (input: any) => {
      if (input.data.action === 'YUANQIZHAN_REMINDER_RESULT') throw new Error('Synthetic audit write failure');
      return original(input);
    });
    expect(await h.service.run()).toMatchObject({state: 'PARTIAL_FAILURE', unknown: 1, accepted: 0});
    expect(h.claimRows()).toHaveLength(1); expect(h.resultRows()).toHaveLength(0);
    expect(await h.service.run()).toMatchObject({state: 'PARTIAL_FAILURE', unknown: 1, skipped: 0, accepted: 0});
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(1);
  });

  it('reports a stale durable claim with no result as unknown and never resends it', async () => {
    const h = harness(); const member = h.add();
    const id = yuanqizhanReminderId(member.patientId, DATE);
    h.audits.set(id, {id, action: 'YUANQIZHAN_REMINDER_CLAIM', resourceId: member.id, metadata: {date: DATE, state: 'CLAIMED'}});
    expect(await h.service.run()).toMatchObject({state: 'PARTIAL_FAILURE', unknown: 1, skipped: 0, accepted: 0});
    expect(h.sms.sendFollowUpReminder).not.toHaveBeenCalled(); expect(h.claimRows()).toHaveLength(1);
  });

  it('preserves a claim and continues to other recipients if the final eligibility query fails', async () => {
    const h = harness(); h.add(); const second = h.add(); let failed = false;
    h.onRecheck(() => {if (!failed) {failed = true; throw new Error('Synthetic recheck failure');}});
    expect(await h.service.run()).toMatchObject({state: 'PARTIAL_FAILURE', unknown: 1, accepted: 1, failed: 0});
    expect(h.resultRows().map((audit) => audit.metadata.state)).toEqual(['UNKNOWN', 'ACCEPTED']);
    expect(h.sms.sendFollowUpReminder).toHaveBeenCalledTimes(1);
    expect(h.sms.sendFollowUpReminder.mock.calls[0][0]).toBe(second.patient.phone);
  });

  it('pages beyond 200 recipients without losing or repeating any member', async () => {
    const h = harness(); for (let index = 0; index < 401; index++) h.add();
    expect(await h.service.run()).toMatchObject({scanned: 401, accepted: 401, skipped: 0, failed: 0});
    const pageQueries: any[] = h.prisma.yuanqizhanMember.findMany.mock.calls.map(([query]: any[]) => query).filter((query: any) => query.select);
    expect(pageQueries).toHaveLength(3);
    expect(pageQueries.map((query) => ({take: query.take, cursor: query.cursor, skip: query.skip}))).toEqual([
      {take: 200, cursor: undefined, skip: undefined},
      {take: 200, cursor: {id: 'member-0200'}, skip: 1},
      {take: 200, cursor: {id: 'member-0400'}, skip: 1},
    ]);
    expect(new Set(h.sms.sendFollowUpReminder.mock.calls.map(([phone]) => phone)).size).toBe(401);
    expect(h.claimRows()).toHaveLength(401); expect(h.resultRows()).toHaveLength(401);
  });
});
