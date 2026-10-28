import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor, AuthService } from './auth';
import { CareManagementService } from './care-management';
import { ClinicalService } from './clinical';
import type { PrismaService } from './prisma.service';
import { TasksService } from './tasks';

const manager: Actor = { sub: 'manager-1', role: 'HEALTH_MANAGER', typ: 'access', jti: 'manager-session' };
const doctor: Actor = { ...manager, sub: 'doctor-1', role: 'DOCTOR' };
const request = {} as Request;
const hiddenStatuses = ['DISABLED', 'DELETED'] as const;

function patient(id: string, status = 'ACTIVE') {
  return {
    id, status, role: 'PATIENT', displayName: `合成客户 ${id}`, phone: '13800000001', avatarUrl: null,
    patientProfile: null, patientRelations: [], healthRecords: [], receivedTasks: [], followUpsAsPatient: [],
  };
}

function enrollment(patientRow: ReturnType<typeof patient>) {
  return {
    id: `enrollment-${patientRow.id}`, patientId: patientRow.id, patient: patientRow,
    clientCode: `KH-${patientRow.id}`, packageName: '合成服务', healthManagerId: 'another-manager',
    doctorId: doctor.sub, nutritionistId: 'nutritionist-1', exerciseCoachId: 'coach-1',
    lifestyle: {}, createdAt: new Date('2026-10-01T00:00:00Z'),
  };
}

function careService(prisma: object) {
  return new CareManagementService(prisma as PrismaService, {
    actor: jest.fn().mockResolvedValue(manager),
  } as unknown as ClinicalService);
}

function clinicalService(prisma: object) {
  return new ClinicalService(prisma as PrismaService, {
    assertRole: jest.fn((actor: Actor, ...roles: string[]) => {
      if (!roles.includes(actor.role)) throw new ForbiddenException();
    }),
  } as unknown as AuthService);
}

describe('account status visibility in managed care', () => {
  it('keeps active enrolled and legacy clients in the complete manager list and excludes disabled/deleted accounts', async () => {
    const rows = ['ACTIVE', ...hiddenStatuses].flatMap((status) => [
      { ...patient(`${status}-legacy`, status), careEnrollment: null },
      { ...patient(`${status}-managed`, status), careEnrollment: enrollment(patient(`${status}-managed`, status)) },
    ]);
    const prisma = {
      user: { findMany: jest.fn(async ({ where }) => rows.filter((row) => row.role === where.role && (!where.status || row.status === where.status))) },
      careRelation: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
    };

    const result = await careService(prisma).patients(request);

    expect(result.map((row) => row.patient.id)).toEqual(['ACTIVE-legacy', 'ACTIVE-managed']);
    expect(result.every((row) => row.capabilities?.writeManagedCare === false)).toBe(true);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'PATIENT', status: 'ACTIVE' } }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { returnedCount: 2, complete: true } }),
    }));
  });

  it.each(hiddenStatuses)('rejects %s clients before the global enrollment read shortcut', async (status) => {
    const prisma = {
      careEnrollment: { findUnique: jest.fn().mockResolvedValue(enrollment(patient('hidden', status))) },
      auditLog: { create: jest.fn() },
    };

    await expect(careService(prisma).assertEnrollment(manager, 'hidden')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(hiddenStatuses)('rejects the direct legacy profile of a %s account before any reports are read', async (status) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...patient('hidden', status), careEnrollment: null }) },
      auditLog: { create: jest.fn() },
      bodyAssessment: { findMany: jest.fn() },
      posturePhoto: { findMany: jest.fn() },
    };

    await expect(careService(prisma).patient(request, 'hidden')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.bodyAssessment.findMany).not.toHaveBeenCalled();
    expect(prisma.posturePhoto.findMany).not.toHaveBeenCalled();
  });

  it.each(hiddenStatuses)('does not authorize posture media for a %s patient', async (status) => {
    const prisma = {
      posturePhoto: { findUnique: jest.fn().mockResolvedValue({ patientId: 'hidden', faceProtected: true }) },
      careEnrollment: { findUnique: jest.fn().mockResolvedValue(enrollment(patient('hidden', status))) },
      auditLog: { create: jest.fn() },
    };

    await expect(careService(prisma).canAccessMedia(manager, 'posture-asset')).resolves.toBe(false);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('preserves the audited global read of an active patient assigned to another manager', async () => {
    const row = enrollment(patient('active'));
    const prisma = {
      careEnrollment: { findUnique: jest.fn().mockResolvedValue(row) },
      auditLog: { create: jest.fn() },
    };

    await expect(careService(prisma).assertEnrollment(manager, 'active')).resolves.toEqual(row);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'HM_GLOBAL_CLIENT_READ', resourceId: 'active' }),
    }));
  });

  it('keeps disabled/deleted workers out of assignment options', async () => {
    const rows = ['DOCTOR', 'NUTRITIONIST', 'EXERCISE_COACH'].flatMap((role) =>
      ['ACTIVE', ...hiddenStatuses].map((status) => ({ id: `${role}-${status}`, displayName: '合成工作人员', role, status })));
    const prisma = {
      user: { findMany: jest.fn(async ({ where }) => rows.filter((row) => where.role.in.includes(row.role) && (!where.status || row.status === where.status))) },
    };

    const result = await careService(prisma).staff(request);

    expect(result.doctors.map((row) => row.id)).toEqual(['DOCTOR-ACTIVE']);
    expect(result.nutritionists.map((row) => row.id)).toEqual(['NUTRITIONIST-ACTIVE']);
    expect(result.exerciseCoaches.map((row) => row.id)).toEqual(['EXERCISE_COACH-ACTIVE']);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ACTIVE' }) }));
  });

  it('keeps disabled/deleted patients out of the manager workbench follow-up queue', async () => {
    const rows = ['ACTIVE', ...hiddenStatuses].map((status) => ({ ...enrollment(patient(status, status)), healthManagerId: manager.sub }));
    const prisma = {
      careEnrollment: { findMany: jest.fn(async ({ where }) => rows.filter((row) =>
        row.healthManagerId === where.healthManagerId && (!where.patient?.status || row.patient.status === where.patient.status))) },
      followUp: { findMany: jest.fn(async ({ where }) => rows.filter((row) => where.patientId.in.includes(row.patientId))
        .map((row) => ({ id: `followup-${row.patientId}`, patientId: row.patientId, type: 'REGULAR', scheduledAt: new Date(), status: 'SCHEDULED' }))) },
    };

    const result = await careService(prisma).workbench(request);

    expect(result.queues.dueRechecks.map((row) => row.patientId)).toEqual(['ACTIVE']);
    expect(result.counts.dueRechecks).toBe(1);
    expect(prisma.careEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      healthManagerId: manager.sub, patient: expect.objectContaining({ status: 'ACTIVE' }),
    }) }));
  });
});

describe('account status visibility in clinical entry points', () => {
  const readPaths = [
    'patient', 'patientArchive', 'patientRecords', 'weightTrend', 'patientCareSummaries', 'patientStats',
  ] as const;

  it.each(hiddenStatuses.flatMap((status) => readPaths.map((path) => ({ status, path }))))('blocks $path for $status patients through shared authorization', async ({ status, path }) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(patient('hidden', status)) },
      auditLog: { create: jest.fn() },
      patientArchive: { findUnique: jest.fn() },
      healthRecord: { findMany: jest.fn(), count: jest.fn() },
      careSummary: { findMany: jest.fn() },
      followUp: { groupBy: jest.fn() },
    };
    const service = clinicalService(prisma);

    await expect(service[path](manager, 'hidden')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'hidden' }, select: { role: true, status: true } });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.patientArchive.findUnique).not.toHaveBeenCalled();
    expect(prisma.healthRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.healthRecord.count).not.toHaveBeenCalled();
    expect(prisma.careSummary.findMany).not.toHaveBeenCalled();
    expect(prisma.followUp.groupBy).not.toHaveBeenCalled();
  });

  it('still allows the global business read of active patients without requiring a personal care relation', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(patient('active')) },
      careRelation: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    await expect(clinicalService(prisma).assertCare(manager, 'active')).resolves.toBeUndefined();
    expect(prisma.careRelation.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'HM_GLOBAL_BUSINESS_READ', resourceId: 'active' }),
    }));
  });

  it('excludes disabled/deleted accounts from traditional patient search and list totals', async () => {
    const rows = ['ACTIVE', ...hiddenStatuses].map((status) => patient(status, status));
    const prisma = {
      user: { findMany: jest.fn(async ({ where }) => rows.filter((row) => !where.status || row.status === where.status)) },
    };

    const result = await clinicalService(prisma).patients(doctor, { search: '合成', page: 1, pageSize: 20 });

    expect(result.items.map((row) => row.id)).toEqual(['ACTIVE']);
    expect(result.total).toBe(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      role: 'PATIENT', status: 'ACTIVE', patientRelations: { some: { practitionerId: doctor.sub, status: 'ACTIVE' } },
      OR: [{ displayName: { contains: '合成' } }, { phone: { contains: '合成' } }],
    } }));
  });

  it('keeps pending/completed follow-up counts and completion rate limited to active patients', async () => {
    const rows = ['ACTIVE', ...hiddenStatuses].map((status) => patient(status, status));
    const followUps = ['ACTIVE', ...hiddenStatuses].flatMap((patientStatus) =>
      ['SCHEDULED', 'COMPLETED'].map((status) => ({ patientStatus, status })));
    const prisma = {
      user: { findMany: jest.fn(async ({ where }) => rows.filter((row) => !where.status || row.status === where.status)) },
      followUp: { count: jest.fn(async ({ where }) => followUps.filter((row) =>
        (!where.patient?.status || row.patientStatus === where.patient.status)
        && (typeof where.status === 'string' ? row.status === where.status : where.status.in.includes(row.status))).length) },
    };

    await expect(clinicalService(prisma).summary(doctor)).resolves.toMatchObject({
      totalPatients: 1, pendingFollowUps: 1, completedFollowUps: 1, followUpCompletionRate: 50,
    });
    expect(prisma.followUp.count).toHaveBeenCalledTimes(2);
    for (const [args] of prisma.followUp.count.mock.calls) expect(args.where.patient).toEqual({ status: 'ACTIVE' });
  });
});

describe('account status visibility in manager task lists', () => {
  it('filters hidden patients from task rows and pagination totals while retaining their stored history', async () => {
    const rows = ['ACTIVE', ...hiddenStatuses].flatMap((status) => ['PENDING', 'COMPLETED'].map((taskStatus) => ({
      id: `${status}-${taskStatus}`, patientId: status, patient: patient(status, status), status: taskStatus,
    })));
    const matching = ({ where }: { where: any }) => rows.filter((row) =>
      (!where.patient?.status || row.patient.status === where.patient.status) && (!where.patientId || row.patientId === where.patientId));
    const prisma = {
      patientTask: {
        findMany: jest.fn(async (args) => matching(args)), count: jest.fn(async (args) => matching(args).length),
        updateMany: jest.fn(), deleteMany: jest.fn(),
      },
    };
    const clinical = { actor: jest.fn().mockResolvedValue(manager) } as unknown as ClinicalService;
    const service = new TasksService(prisma as unknown as PrismaService, clinical);

    const result = await service.list(request, { page: 1, pageSize: 30 });

    expect(result.items.map((row) => row.id)).toEqual(['ACTIVE-PENDING', 'ACTIVE-COMPLETED']);
    expect(result.total).toBe(2);
    expect(prisma.patientTask.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { patient: { status: 'ACTIVE' } } }));
    expect(prisma.patientTask.count).toHaveBeenCalledWith({ where: { patient: { status: 'ACTIVE' } } });
    expect(prisma.patientTask.updateMany).not.toHaveBeenCalled();
    expect(prisma.patientTask.deleteMany).not.toHaveBeenCalled();
    expect(rows).toHaveLength(6);
  });

  it.each(hiddenStatuses)('rejects a direct task-list request for a %s account through clinical authorization', async (status) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(patient('hidden', status)) },
      patientTask: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const clinical = clinicalService(prisma);
    jest.spyOn(clinical, 'actor').mockResolvedValue(manager);
    const service = new TasksService(prisma as unknown as PrismaService, clinical);

    await expect(service.list(request, { patientId: 'hidden', page: 1, pageSize: 30 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.patientTask.findMany).not.toHaveBeenCalled();
    expect(prisma.patientTask.count).not.toHaveBeenCalled();
    expect(prisma.patientTask.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
