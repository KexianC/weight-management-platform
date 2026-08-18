import { ConflictException } from '@nestjs/common';
import type { Request } from 'express';
import { CareService, type ClinicalService } from './clinical';
import { CommunicationsService } from './communications';
import { FollowUpsService, followUpId } from './followups';
import type { PrismaService } from './prisma.service';
import { TasksService } from './tasks';

const request = {} as Request;
const patientActor = { sub: 'patient-1', role: 'PATIENT', typ: 'access', jti: 'jti-1' } as const;

describe('workflow persistence guards', () => {
  it('uses a stable primary key to reject retried duplicate follow-up creation', () => {
    const scheduledAt = new Date('2026-08-18T02:00:00.000Z');
    expect(followUpId('doctor-1', 'patient-1', 'WEIGHT', scheduledAt)).toBe(
      followUpId('doctor-1', 'patient-1', 'WEIGHT', scheduledAt),
    );
    expect(followUpId('doctor-1', 'patient-2', 'WEIGHT', scheduledAt)).not.toBe(
      followUpId('doctor-1', 'patient-1', 'WEIGHT', scheduledAt),
    );
  });

  it('does not emit completion side effects when a concurrent follow-up transition wins', async () => {
    const row = {
      id: 'follow-1',
      patientId: 'patient-1',
      practitionerId: 'doctor-1',
      type: 'WEIGHT',
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      note: null,
    };
    const tx = {
      followUp: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      healthRecord: { create: jest.fn() },
      notification: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      followUp: { findUnique: jest.fn().mockResolvedValue(row) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const clinical = {
      actor: jest.fn().mockResolvedValue(patientActor),
      assertPractitioner: jest.fn(),
      assertCare: jest.fn(),
      assertActiveRelation: jest.fn().mockResolvedValue({ id: 'relation-1' }),
    } as unknown as ClinicalService;

    const service = new FollowUpsService(prisma, clinical);
    await expect(service.transition(request, row.id, 'COMPLETED', { result: { weightKg: 70 } }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.healthRecord.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not let a patient override their follow-up scope with a patientId query', async () => {
    const prisma = {
      followUp: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;
    const clinical = {
      actor: jest.fn().mockResolvedValue(patientActor),
      assertPractitioner: jest.fn(),
      assertCare: jest.fn(),
    } as unknown as ClinicalService;
    const service = new FollowUpsService(prisma, clinical);

    await service.list(request, {
      patientId: 'patient-2',
      page: 1,
      pageSize: 30,
    } as never);

    expect((prisma as any).followUp.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ patientId: patientActor.sub }),
    }));
    expect((prisma as any).followUp.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ patientId: patientActor.sub }),
    }));
    expect((clinical as any).assertCare).not.toHaveBeenCalled();
  });

  it('treats a retried task completion as idempotent', async () => {
    const task = {
      id: 'task-1',
      patientId: 'patient-1',
      assignedById: 'doctor-1',
      status: 'COMPLETED',
    };
    const prisma = {
      patientTask: { findUnique: jest.fn().mockResolvedValue(task) },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const clinical = {
      actor: jest.fn().mockResolvedValue(patientActor),
      assertPractitioner: jest.fn(),
    } as unknown as ClinicalService;

    const service = new TasksService(prisma, clinical);
    await expect(service.transition(request, task.id, 'COMPLETED')).resolves.toBe(task);
    expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).not.toHaveBeenCalled();
  });

  it('atomically cancels unfinished work when a care relation ends', async () => {
    const relation = {
      id: 'relation-1',
      patientId: 'patient-1',
      practitionerId: 'doctor-1',
      status: 'ACTIVE',
    };
    const ended = { ...relation, status: 'ENDED' };
    const tx = {
      careRelation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(ended),
      },
      followUp: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      patientTask: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notice-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      careRelation: { findUnique: jest.fn().mockResolvedValue(relation) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new CareService(prisma, {} as ClinicalService);

    await expect(service.end(patientActor, relation.id, 'test cleanup')).resolves.toBe(ended);
    expect(tx.followUp.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ patientId: 'patient-1', practitionerId: 'doctor-1' }),
    }));
    expect(tx.patientTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ patientId: 'patient-1', assignedById: 'doctor-1' }),
    }));
  });

  it('does not consume an invite when another bind request already claimed the relation', async () => {
    const tx = {
      careInvite: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite-1',
          code: '123456',
          practitionerId: 'doctor-1',
          practitioner: { role: 'DOCTOR', status: 'ACTIVE' },
          status: 'ACTIVE',
          useCount: 0,
          maxUses: 10,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: jest.fn(),
      },
      careRelation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'relation-1',
          patientId: 'patient-1',
          practitionerId: 'doctor-1',
          status: 'ENDED',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new CareService(prisma, {} as ClinicalService);

    await expect(service.bind(patientActor, '123456')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.careInvite.updateMany).not.toHaveBeenCalled();
  });

  it('keeps long messages deliverable by limiting the notification preview', async () => {
    const tx = {
      message: { create: jest.fn().mockResolvedValue({ id: 'message-1' }) },
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: '医生' }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notice-1' }) },
      careRelation: { update: jest.fn().mockResolvedValue({ id: 'relation-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const clinical = {
      actor: jest.fn().mockResolvedValue({ ...patientActor, role: 'DOCTOR', sub: 'doctor-1' }),
      assertPeer: jest.fn().mockResolvedValue({ id: 'relation-1' }),
    } as unknown as ClinicalService;
    const service = new CommunicationsService(prisma, clinical);

    await service.send(request, {
      receiverId: 'patient-1',
      content: '😀'.repeat(600),
      messageType: 'TEXT',
    } as never);

    const preview = tx.notification.create.mock.calls[0][0].data.content as string;
    expect(Array.from(preview)).toHaveLength(500);
  });
});
