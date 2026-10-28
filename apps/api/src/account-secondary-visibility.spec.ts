import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { CommunicationsService } from './communications';
import { FollowUpsService } from './followups';
import { MediaService } from './media';
import { YuanqizhanService } from './yuanqizhan';

// In-memory query adapter: run real services against mixed account states and
// evaluate their Prisma predicates, so pagination/count assertions catch leaks.
function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]: [string, any]) => {
    if (expected === undefined) return true;
    if (key === 'AND') return (Array.isArray(expected) ? expected : [expected]).every((part) => matches(row, part));
    if (key === 'OR') return expected.some((part: any) => matches(row, part));
    if (key === 'NOT') return !(Array.isArray(expected) ? expected : [expected]).some((part) => matches(row, part));
    const actual = row?.[key];
    if (expected === null || typeof expected !== 'object' || expected instanceof Date) return actual === expected;
    if ('in' in expected) return expected.in.includes(actual);
    if ('notIn' in expected) return !expected.notIn.includes(actual);
    if ('not' in expected) return actual !== expected.not;
    if ('contains' in expected) return String(actual).includes(expected.contains);
    if ('gte' in expected && actual < expected.gte) return false;
    if ('gt' in expected && actual <= expected.gt) return false;
    if ('lt' in expected && actual >= expected.lt) return false;
    if ('gte' in expected || 'gt' in expected || 'lt' in expected) return true;
    return matches(actual, expected);
  });
}

function table(rows: any[]) {
  return {
    findMany: jest.fn(async ({ where, skip = 0, take }: any = {}) => rows.filter((row) => matches(row, where)).slice(skip, take === undefined ? undefined : skip + take)),
    findUnique: jest.fn(async ({ where }: any) => rows.find((row) => matches(row, where)) ?? null),
    findFirst: jest.fn(async ({ where }: any) => rows.find((row) => matches(row, where)) ?? null),
    count: jest.fn(async ({ where }: any) => rows.filter((row) => matches(row, where)).length),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const selected = rows.filter((row) => matches(row, where));
      selected.forEach((row) => Object.assign(row, data));
      return { count: selected.length };
    }),
  };
}

const request = {} as any;
const actor = (role: Actor['role'] = 'HEALTH_MANAGER'): Actor => ({ sub: 'manager', role, typ: 'access', jti: 'test-account-visibility' });
function clinical(prisma: any, current = actor()) {
  return new ClinicalService(prisma, {
    actor: jest.fn().mockResolvedValue(current),
    assertRole: jest.fn((who: Actor, ...roles: string[]) => { if (!roles.includes(who.role)) throw new ForbiddenException(); }),
  } as any);
}
const accounts = () => [
  { id: 'active', role: 'PATIENT', status: 'ACTIVE', displayName: '正常患者' },
  { id: 'disabled', role: 'PATIENT', status: 'DISABLED', displayName: '停用患者' },
  { id: 'deleted', role: 'PATIENT', status: 'DELETED', displayName: '逻辑删除患者' },
  { id: 'manager', role: 'HEALTH_MANAGER', status: 'ACTIVE', displayName: '健管师' },
  { id: 'doctor', role: 'DOCTOR', status: 'ACTIVE', displayName: '医生' },
];
const auditLog = () => ({ create: jest.fn().mockResolvedValue({}) });

describe('secondary account visibility for health managers (service tests with synthetic data)', () => {
  it('excludes disabled/deleted patients from follow-up lists, pagination totals and statistics', async () => {
    const users = accounts().map((user) => ({ ...user, yuanqizhanMemberships: [] }));
    const rows = users.filter((user) => user.role === 'PATIENT').map((patient) => ({
      id: `follow-${patient.id}`, patientId: patient.id, patient,
      practitionerId: 'doctor', practitioner: users[4], status: 'SCHEDULED', scheduledAt: new Date(),
    }));
    const followUp = { ...table(rows), groupBy: jest.fn(async ({ where }: any) => [{ status: 'SCHEDULED', _count: { _all: rows.filter((row) => matches(row, where)).length } }]) };
    const prisma: any = { user: table(users), followUp, auditLog: auditLog() };
    const service = new FollowUpsService(prisma, clinical(prisma));
    const list = await service.list(request, { page: 1, pageSize: 20 } as any);
    expect(list.items.map((item) => item.id)).toEqual(['follow-active']);
    expect(list.total).toBe(1);
    expect(await service.stats(request, {} as any)).toEqual({ today: 1, SCHEDULED: 1 });
    expect(followUp.updateMany).not.toHaveBeenCalled();
    await expect(service.list(request, { patientId: 'disabled' } as any)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.detail(request, 'follow-deleted')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps existing doctor follow-up history visible without widening health-manager detail access', async () => {
    const patient = accounts()[1];
    const rows = [{ id: 'historic', patientId: patient.id, patient, practitionerId: 'manager', status: 'COMPLETED', scheduledAt: new Date() }];
    const prisma: any = { followUp: table(rows) };
    const doctor = new FollowUpsService(prisma, clinical(prisma, actor('DOCTOR')));
    expect((await doctor.list(request, { page: 1, pageSize: 20 } as any)).items.map((row) => row.id)).toEqual(['historic']);
  });

  it('filters activity candidates, member rows and counts for managers while retaining administrator audit states', async () => {
    const users = accounts().map((user) => ({ ...user, yuanqizhanMemberships: [] }));
    const activity = { id: 'activity', title: '元气盏', status: 'ACTIVE' };
    const members = users.filter((user) => user.role === 'PATIENT').map((patient) => ({ id: `member-${patient.id}`, activityId: 'activity', patientId: patient.id, patient, status: 'ACTIVE' }));
    const user = table(users);
    const yuanqizhanMember = table(members);
    const yuanqizhanActivity = {
      ...table([activity]),
      findMany: jest.fn(async (query: any) => [{ ...activity, _count: { members: members.filter((row) => matches(row, query.include._count.select.members.where)).length } }]),
    };
    const prisma: any = { user, yuanqizhanMember, yuanqizhanActivity, auditLog: auditLog(), $transaction: jest.fn() };
    const manager = new YuanqizhanService(prisma, clinical(prisma), {} as any);
    const admin = new YuanqizhanService(prisma, clinical(prisma, actor('ADMIN')), {} as any);
    const page = { page: 1, pageSize: 20 };
    expect((await manager.candidates(request, 'activity', page)).items.map((row) => row.id)).toEqual(['active']);
    const visibleMembers = await manager.members(request, 'activity', { ...page, search: '患者' });
    expect(visibleMembers.items.map((row) => row.patientId)).toEqual(['active']);
    expect(visibleMembers.total).toBe(1);
    expect((await manager.activities(request, page)).items[0].memberCount).toBe(1);
    expect((await admin.members(request, 'activity', page)).items.map((row) => row.patient.status)).toEqual(['ACTIVE', 'DISABLED', 'DELETED']);
    expect((await admin.candidates(request, 'activity', page)).total).toBe(3);
    expect((await admin.activities(request, page)).items[0].memberCount).toBe(3);
    await expect(manager.removeMember(request, 'activity', 'deleted')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function messaging() {
    const users = accounts();
    const rows = users.filter((user) => user.role === 'PATIENT').map((sender) => ({
      id: `message-${sender.id}`, senderId: sender.id, sender, receiverId: 'manager', receiver: users[3],
      content: `${sender.displayName}的消息`, createdAt: new Date(), readAt: null, deletedBySenderAt: null, deletedByReceiverAt: null,
    }));
    const notices = rows.map((message) => ({ id: `notice-${message.id}`, userId: 'manager', relatedType: 'MESSAGE', relatedId: message.id, createdAt: new Date(), expiresAt: null, readAt: null }));
    notices.push({ id: 'general', userId: 'manager', relatedType: null as any, relatedId: null as any, createdAt: new Date(), expiresAt: null, readAt: null });
    const relations = rows.map((row) => ({ patientId: row.senderId, practitionerId: 'manager', status: 'ACTIVE' }));
    const prisma: any = { user: table(users), message: table(rows), notification: table(notices), careRelation: table(relations) };
    return { prisma, rows, service: new CommunicationsService(prisma, clinical(prisma)) };
  }

  it('hides inactive account conversations and their unread counts, and rejects old message URLs', async () => {
    const { prisma, service } = messaging();
    expect((await service.conversations(request)).map((row) => row.peerId)).toEqual(['active']);
    expect(await service.unreadMessages(request)).toEqual({ count: 1 });
    const conversation = await service.messages(request, { page: 1, pageSize: 20, peerId: 'active' } as any);
    expect('total' in conversation ? conversation.total : null).toBe(1);
    for (const id of ['disabled', 'deleted']) {
      await expect(service.messages(request, { page: 1, pageSize: 20, peerId: id } as any)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.message(request, `message-${id}`)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.read(request, { peerId: id })).rejects.toBeInstanceOf(NotFoundException);
    }
    expect((await service.message(request, 'message-active')).id).toBe('message-active');
    expect(await service.read(request, { messageIds: ['message-disabled', 'message-deleted'] })).toEqual({ updated: 0 });
    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sender: { status: 'ACTIVE' }, receiver: { status: 'ACTIVE' } }) }));
  });

  it('also filters historical message notifications in activity feeds, pages, counters and direct reads', async () => {
    const { service } = messaging();
    const notifications = await service.notifications(request, { page: 1, pageSize: 20 } as any);
    expect(notifications.items.map((row) => row.id)).toEqual(['notice-message-active', 'general']);
    expect(notifications.total).toBe(2);
    expect(await service.unreadNotifications(request)).toEqual({ count: 2 });
    expect((await service.activities(request)).map((row) => row.item.id).sort()).toEqual(['general', 'message-active', 'notice-message-active']);
    await expect(service.readNotification(request, 'notice-message-disabled')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not change existing patient, doctor or administrator message query permissions', async () => {
    const { prisma } = messaging();
    for (const role of ['PATIENT', 'DOCTOR', 'ADMIN'] as const) {
      const service = new CommunicationsService(prisma, clinical(prisma, actor(role)));
      expect((await service.conversations(request)).map((row) => row.peerId)).toEqual(['active', 'disabled', 'deleted']);
      expect((await service.message(request, 'message-disabled')).id).toBe('message-disabled');
    }
  });

  it.each(['HEALTH_RECORD', 'FOLLOW_UP'])('rechecks a patient account on both new and already signed %s media URLs', async (referenceType) => {
    const users = accounts();
    const asset = { id: 'asset', ownerId: 'active', status: 'READY', referenceType, referenceId: 'source', mimeType: 'image/png', provider: 'LOCAL', objectKey: 'synthetic.png' };
    const prisma: any = {
      user: table(users), mediaAsset: table([asset]), auditLog: auditLog(),
      healthRecord: table([{ id: 'source', patientId: 'active', recordType: 'WEIGHT' }]),
      followUp: table([{ id: 'source', patientId: 'active', practitionerId: 'doctor' }]),
    };
    const service = new MediaService(prisma, clinical(prisma));
    const previous = process.env.MEDIA_SIGNING_SECRET;
    process.env.MEDIA_SIGNING_SECRET = 'synthetic-account-visibility-signing-secret';
    try {
      const signed = new URL((await service.signedUrl(request, 'asset')).url);
      for (const status of ['DISABLED', 'DELETED']) {
        users[0].status = status;
        await expect(service.signedUrl(request, 'asset')).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.localFile(request, 'asset', signed.searchParams.get('expires')!, signed.searchParams.get('sig')!)).rejects.toBeInstanceOf(NotFoundException);
      }
    } finally {
      if (previous === undefined) delete process.env.MEDIA_SIGNING_SECRET;
      else process.env.MEDIA_SIGNING_SECRET = previous;
    }
  });
});
