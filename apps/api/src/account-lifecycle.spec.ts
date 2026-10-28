import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { AdminService } from './admin';
import type { Actor } from './auth';
import type { PrismaService } from './prisma.service';

const actor: Actor = { sub: 'admin-one', role: 'ADMIN', typ: 'access', jti: 'synthetic' };
const account = (id: string, extra: Record<string, unknown> = {}) => ({
  id, phone: id, role: 'PATIENT', status: 'ACTIVE', displayName: id, sessionVersion: 3,
  deletedAt: null, disabledAt: null, passwordHash: 'synthetic-existing-hash', ...extra,
});

function fixture(extra: Record<string, unknown> = {}) {
  const users: any[] = [account(actor.sub, { role: 'ADMIN' }), account('patient-one', extra), account('other-patient')];
  const refresh = [{ userId: 'patient-one', revokedAt: null }, { userId: 'other-patient', revokedAt: null }];
  const audits: any[] = [];
  const matches = (row: any, where: any) => Object.entries(where ?? {}).every(([key, value]) => value === undefined || row[key] === value);
  const tx: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => structuredClone(users.find(row => matches(row, where)) ?? null)),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const row = users.find(row => matches(row, where));if (!row) throw new Error('not found');return structuredClone(row);
      }),
      count: jest.fn(async ({ where } = {} as any) => users.filter(row => matches(row, where)).length),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const target = users.find(row => matches(row, where));
        if (!target) return { count: 0 };
        for (const [key, value] of Object.entries(data) as [string, any][]) if (value !== undefined) target[key] = value?.increment ? target[key] + value.increment : value;
        return { count: 1 };
      }),
      update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
    },
    refreshToken: { updateMany: jest.fn(async ({ where, data }: any) => {
      const rows = refresh.filter(row => matches(row, where));
      rows.forEach(row => Object.assign(row, data)); return { count: rows.length };
    }) },
    auditLog: { create: jest.fn(async ({ data }: any) => { audits.push(data); return data; }) },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (work: any) => {
    const before = structuredClone({ users, refresh, audits });
    try { return await work(tx); } catch (error) {
      users.splice(0, users.length, ...before.users);refresh.splice(0, refresh.length, ...before.refresh);audits.splice(0, audits.length, ...before.audits);throw error;
    }
  }) };
  return { users, refresh, audits, tx, prisma, service: new AdminService(prisma as PrismaService) };
}

describe('administrator account lifecycle', () => {
  it('disables an account atomically and revokes only its sessions; enabling never revives old sessions', async () => {
    const f = fixture();
    await f.service.updateUser(actor, 'patient-one', { status: UserStatus.DISABLED });
    expect(f.users[1]).toMatchObject({ status: 'DISABLED', sessionVersion: 4, deletedAt: null });
    expect(f.users[1].disabledAt).toBeInstanceOf(Date);
    expect(f.refresh[0].revokedAt).toBeInstanceOf(Date);expect(f.refresh[1].revokedAt).toBeNull();
    await f.service.updateUser(actor, 'patient-one', { status: UserStatus.ACTIVE });
    expect(f.users[1]).toMatchObject({ status: 'ACTIVE', disabledAt: null, sessionVersion: 4 });
    expect(f.refresh[0].revokedAt).toBeInstanceOf(Date);
  });

  it('soft deletes without hard deletion, preserving identity and all other accounts', async () => {
    const f = fixture();const other = structuredClone(f.users[2]);
    await expect(f.service.deleteUser(actor, 'patient-one')).resolves.toEqual({ deleted: true, sessionsRevoked: true });
    expect(f.users[1]).toMatchObject({ id: 'patient-one', phone: 'patient-one', role: 'PATIENT', status: 'DELETED', sessionVersion: 4, passwordHash: 'synthetic-existing-hash' });
    expect(f.users[1].deletedAt).toBeInstanceOf(Date);expect(f.users[2]).toEqual(other);
    expect(f.tx.user.delete).not.toHaveBeenCalled();expect(f.tx.user.deleteMany).not.toHaveBeenCalled();
    expect(f.audits).toEqual([expect.objectContaining({ action: 'ADMIN_USER_SOFT_DELETE', resourceId: 'patient-one', metadata: expect.objectContaining({ previousStatus: 'ACTIVE', recordsPreserved: true }) })]);
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('repeating delete is idempotent', async () => {
    const f = fixture();await f.service.deleteUser(actor, 'patient-one');const after = structuredClone(f.users[1]);
    await f.service.deleteUser(actor, 'patient-one');expect(f.users[1]).toEqual(after);expect(f.audits).toHaveLength(1);
  });

  it('can delete a disabled account while retaining its original disabled date', async () => {
    const disabledAt = new Date('2026-10-17T00:00:00Z');const f = fixture({ status: 'DISABLED', disabledAt });
    await f.service.deleteUser(actor, 'patient-one');expect(f.users[1]).toMatchObject({ status: 'DELETED', disabledAt, sessionVersion: 4 });
  });

  it.each(['ACTIVE', 'DISABLED'] as const)('cannot change a deleted account to %s', async status => {
    const f = fixture({ status: 'DELETED', deletedAt: new Date() });
    await expect(f.service.updateUser(actor, 'patient-one', { status })).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('cannot reset the password of a deleted account', async () => {
    const f = fixture({ status: 'DELETED', deletedAt: new Date() });
    await expect(f.service.resetPassword(actor, 'patient-one', { newPassword: 'SyntheticOnly!18' })).rejects.toBeInstanceOf(ConflictException);
    expect(f.tx.user.update).not.toHaveBeenCalled();
  });

  it('cannot bypass deletion through the generic status update', async () => {
    const f = fixture();await expect(f.service.updateUser(actor, 'patient-one', { status: UserStatus.DELETED })).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects self deletion and non-admin deletion before touching the database', async () => {
    const f = fixture();
    await expect(f.service.deleteUser(actor, actor.sub)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(f.service.deleteUser({ ...actor, role: 'HEALTH_MANAGER' }, 'patient-one')).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['delete', 'disable'] as const)('preserves the last active administrator during %s', async action => {
    const f = fixture();
    const operation = action === 'delete' ? f.service.deleteUser({ ...actor, sub: 'separate-admin' }, actor.sub) : f.service.updateUser({ ...actor, sub: 'separate-admin' }, actor.sub, { status: UserStatus.DISABLED });
    await expect(operation).rejects.toBeInstanceOf(ForbiddenException);expect(f.tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns not found for a missing account', async () => {
    await expect(fixture().service.deleteUser(actor, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rolls back the account and token changes if audit persistence fails', async () => {
    const f = fixture();const before = structuredClone({ users: f.users, refresh: f.refresh });
    f.tx.auditLog.create.mockRejectedValue(new Error('synthetic-audit-failure'));
    await expect(f.service.deleteUser(actor, 'patient-one')).rejects.toThrow('synthetic-audit-failure');
    expect({ users: f.users, refresh: f.refresh }).toEqual(before);
  });

  it('returns conflict for stale state and transaction conflicts', async () => {
    const stale = fixture();stale.tx.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(stale.service.deleteUser(actor, 'patient-one')).rejects.toBeInstanceOf(ConflictException);
    const concurrent = fixture();concurrent.prisma.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('synthetic-conflict', { code: 'P2034', clientVersion: 'test' }));
    await expect(concurrent.service.deleteUser(actor, 'patient-one')).rejects.toBeInstanceOf(ConflictException);
  });
});
