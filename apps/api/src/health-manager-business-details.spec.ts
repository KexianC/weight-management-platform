import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { FollowUpsService } from './followups';
import { TasksService } from './tasks';

type Module = 'tasks' | 'followups';
const request = {} as any;

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) return matches(row?.[key], expected);
    return row?.[key] === expected;
  });
}

// Run the real authorization service against synthetic rows. In particular,
// assertPractitioner must reject HEALTH_MANAGER so a permissive mock cannot
// conceal the detail/list permission mismatch.
function setup(module: Module, role: Actor['role'] = 'HEALTH_MANAGER', options: {
  actorId?: string; authorRole?: 'DOCTOR' | 'NUTRITIONIST'; patientStatus?: string; authorStatus?: string;
} = {}) {
  const patient = { id: 'patient-1', role: 'PATIENT', status: options.patientStatus ?? 'ACTIVE' };
  const author = { id: 'author-1', role: options.authorRole ?? 'DOCTOR', status: options.authorStatus ?? 'ACTIVE' };
  const row: any = {
    id: 'business-1', patientId: patient.id, patient, title: 'Synthetic business detail',
    status: 'COMPLETED', result: { content: 'Synthetic completed result' },
    assignedById: author.id, assignedBy: author, practitionerId: author.id, practitioner: author,
    scheduledAt: new Date('2026-10-21T10:00:00+08:00'), dueAt: new Date('2026-10-21T10:00:00+08:00'),
  };
  const table = {
    findUnique: jest.fn(async ({ where }: any) => matches(row, where) ? row : null),
    findMany: jest.fn(async ({ where }: any) => matches(row, where) ? [row] : []),
    count: jest.fn(async ({ where }: any) => matches(row, where) ? 1 : 0),
    create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn(),
  };
  const actor: Actor = {
    sub: options.actorId ?? (role === 'PATIENT' ? patient.id : role === 'DOCTOR' || role === 'NUTRITIONIST' ? author.id : 'reader-1'),
    role, typ: 'access', jti: 'synthetic-business-details',
  };
  const prisma: any = {
    patientTask: table, followUp: table,
    user: { findUnique: jest.fn(async ({ where }: any) => where.id === patient.id ? patient : where.id === author.id ? author : null) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(() => { throw new Error('Read-only/denied operation reached a write transaction'); }),
  };
  const clinical = new ClinicalService(prisma, {
    actor: jest.fn().mockResolvedValue(actor),
    assertRole: (current: Actor, ...roles: string[]) => { if (!roles.includes(current.role)) throw new ForbiddenException(); },
  } as any);
  const service = module === 'tasks' ? new TasksService(prisma, clinical) : new FollowUpsService(prisma, clinical);
  return { service, prisma, table, row };
}

describe.each<Module>(['tasks', 'followups'])('%s health-manager detail permissions', (module) => {
  it('opens an active patient detail already visible in the health-manager list without changing business state', async () => {
    const { service, prisma, table, row } = setup(module);
    const before = JSON.stringify(row);
    const page = await service.list(request, { patientId: row.patientId, page: 1, pageSize: 30 } as any);
    expect(page.items.map((item: any) => item.id)).toEqual([row.id]);
    expect(await service.detail(request, row.id)).toMatchObject({ id: row.id, status: 'COMPLETED', result: row.result });
    expect(JSON.stringify(row)).toBe(before);
    expect(table.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'HM_GLOBAL_BUSINESS_READ', resourceId: row.patientId }) }));
  });

  it.each(['DISABLED', 'DELETED'])('hides a %s patient from both list and direct detail', async (patientStatus) => {
    const { service, row } = setup(module, 'HEALTH_MANAGER', { patientStatus });
    expect((await service.list(request, { page: 1, pageSize: 30 } as any)).items).toEqual([]);
    await expect(service.detail(request, row.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns not found for a missing detail', async () => {
    const { service } = setup(module);
    await expect(service.detail(request, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['DOCTOR', 'NUTRITIONIST'] as const)('preserves %s author access and rejects another author', async (authorRole) => {
    const own = setup(module, authorRole, { authorRole });
    expect((await own.service.detail(request, own.row.id)).id).toBe(own.row.id);
    const other = setup(module, authorRole, { actorId: 'other-author', authorRole });
    await expect(other.service.detail(request, other.row.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('preserves patient access to self and hides another patient detail', async () => {
    const own = setup(module, 'PATIENT');
    expect((await own.service.detail(request, own.row.id)).id).toBe(own.row.id);
    const other = setup(module, 'PATIENT', { actorId: 'other-patient' });
    await expect(other.service.detail(request, other.row.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['ADMIN', 'EXERCISE_COACH'] as const)('continues rejecting %s detail access', async (role) => {
    const { service, row } = setup(module, role);
    await expect(service.detail(request, row.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['create', 'update', 'start', 'complete', 'cancel', 'remove'] as const)('continues rejecting health-manager %s writes', async (operation) => {
    const { service, prisma, table, row } = setup(module);
    row.status = module === 'tasks' ? 'PENDING' : 'SCHEDULED';
    const target = service as any;
    const call = operation === 'create'
      ? () => target.create(request, { patientId: row.patientId, title: 'Synthetic task', scheduledAt: row.scheduledAt.toISOString() })
      : operation === 'update' ? () => target.update(request, row.id, { title: 'Changed', note: 'Changed' })
      : operation === 'remove' ? () => target.remove(request, row.id)
      : () => target.transition(request, row.id, { start: 'IN_PROGRESS', complete: 'COMPLETED', cancel: 'CANCELLED' }[operation], {});
    await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(table.create).not.toHaveBeenCalled();
    expect(table.updateMany).not.toHaveBeenCalled();
    expect(table.deleteMany).not.toHaveBeenCalled();
  });
});

describe('health-manager detail visibility follows each module list policy', () => {
  it.each(['DISABLED', 'DELETED'])('hides follow-ups by a %s practitioner from list and detail', async (authorStatus) => {
    const { service, row } = setup('followups', 'HEALTH_MANAGER', { authorStatus });
    expect((await service.list(request, { page: 1, pageSize: 30 } as any)).items).toEqual([]);
    await expect(service.detail(request, row.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retains task history visible in its list when the patient is active and the author is disabled', async () => {
    const { service, row } = setup('tasks', 'HEALTH_MANAGER', { authorStatus: 'DISABLED' });
    expect((await service.list(request, { page: 1, pageSize: 30 } as any)).items.map((item: any) => item.id)).toEqual([row.id]);
    expect((await service.detail(request, row.id)).id).toBe(row.id);
  });
});
