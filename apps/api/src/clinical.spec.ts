import { ConflictException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthService, Actor } from './auth';
import { ClinicalService, type CreateClinicalPatientDto, PublishCareSummaryDto, UpsertPatientArchiveDto } from './clinical';
import type { PrismaService } from './prisma.service';

const doctorActor: Actor = {
  sub: 'doctor-1',
  role: 'DOCTOR',
  typ: 'access',
  jti: 'jti-1',
};

const dto: CreateClinicalPatientDto = {
  phone: '13800000009',
  displayName: '新患者',
  gender: 'FEMALE',
  birthDate: '1990-01-02',
  heightCm: 165,
  initialWeightKg: 75,
  targetWeightKg: 65,
  patientAuthorizationConfirmed: true,
};

const relation = {
  id: 'relation-1',
  patientId: 'patient-1',
  practitionerId: 'doctor-1',
  status: 'ACTIVE',
  bindMethod: 'PRACTITIONER_ASSISTED',
};

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'patient-1',
    phone: '13800000009',
    passwordHash: null,
    displayName: '新患者',
    avatarUrl: null,
    role: 'PATIENT',
    status: 'ACTIVE',
    patientProfile: {
      gender: 'FEMALE',
      birthDate: new Date('1990-01-02'),
      heightCm: 165,
      initialWeightKg: 75,
      targetWeightKg: 65,
      medicalHistory: null,
    },
    patientRelations: [relation],
    healthRecords: [],
    receivedTasks: [],
    followUpsAsPatient: [],
    ...overrides,
  };
}

function authMock() {
  return {
    assertRole: jest.fn((actor: Actor, ...roles: string[]) => {
      if (!roles.includes(actor.role)) throw new ForbiddenException();
    }),
  } as unknown as AuthService;
}

describe('ClinicalService legacy createPatient entry is closed', () => {
  it.each(['PATIENT','DOCTOR','NUTRITIONIST','EXERCISE_COACH','HEALTH_MANAGER','ADMIN'] as const)('rejects %s without touching existing accounts or relations', async (role) => {
    const prisma = { $transaction: jest.fn(), user: { create: jest.fn(), update: jest.fn() }, careRelation: { create: jest.fn(), updateMany: jest.fn() } };
    const service = new ClinicalService(prisma as unknown as PrismaService, authMock());
    await expect(service.createPatient({ ...doctorActor, role }, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.careRelation.create).not.toHaveBeenCalled();
    expect(prisma.careRelation.updateMany).not.toHaveBeenCalled();
  });
});

describe('ClinicalService periodic care summaries', () => {
  it('publishes a weekly snapshot, doctor comment and patient notification', async () => {
    const summaryRow = {
      id: 'summary-1',
      patientId: 'patient-1',
      practitionerId: doctorActor.sub,
      periodType: 'WEEKLY',
      periodStart: new Date('2026-08-16T16:00:00.000Z'),
      periodEnd: new Date('2026-08-22T16:00:00.000Z'),
      metrics: {},
      comment: '体重稳步下降，请继续保持规律早餐。',
      publishedAt: new Date('2026-08-18T12:00:00.000Z'),
      updatedAt: new Date('2026-08-18T12:00:00.000Z'),
      practitioner: {
        id: doctorActor.sub,
        displayName: '林医生',
        role: 'DOCTOR',
        practitionerProfile: { hospital: '中心医院', department: '内分泌科', title: '主治医师' },
      },
    };
    const tx = {
      careRelation: { findFirst: jest.fn().mockResolvedValue(relation) },
      careSummary: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(summaryRow),
      },
      notification: { create: jest.fn().mockResolvedValue({ id: 'notification-1' }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      careRelation: { findFirst: jest.fn().mockResolvedValue(relation) },
      healthRecord: { findMany: jest.fn().mockResolvedValue([
        { recordType: 'WEIGHT', weightKg: 80, caloriesKcal: null, measuredAt: new Date('2026-08-17T01:00:00.000Z') },
        { recordType: 'DIET', weightKg: null, caloriesKcal: 600, measuredAt: new Date('2026-08-17T04:00:00.000Z') },
        { recordType: 'WEIGHT', weightKg: 79.2, caloriesKcal: null, measuredAt: new Date('2026-08-18T01:00:00.000Z') },
        { recordType: 'EXERCISE', weightKg: null, caloriesKcal: null, measuredAt: new Date('2026-08-18T10:00:00.000Z') },
      ]) },
      patientTask: { findMany: jest.fn().mockResolvedValue([
        { status: 'COMPLETED', createdAt: new Date('2026-08-17T02:00:00.000Z') },
        { status: 'PENDING', createdAt: new Date('2026-08-18T02:00:00.000Z') },
      ]) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());
    const dto: PublishCareSummaryDto = {
      periodType: 'WEEKLY',
      referenceDate: '2026-08-18',
      comment: '体重稳步下降，请继续保持规律早餐。',
    };

    const result = await service.publishCareSummary(doctorActor, 'patient-1', dto);

    expect(tx.careSummary.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        periodStart: new Date('2026-08-16T16:00:00.000Z'),
        periodEnd: new Date('2026-08-22T16:00:00.000Z'),
        metrics: expect.objectContaining({
          weightRecordCount: 2,
          startingWeightKg: 80,
          endingWeightKg: 79.2,
          weightChangeKg: -0.8,
          dietRecordCount: 1,
          exerciseRecordCount: 1,
          taskCount: 2,
          completedTaskCount: 1,
        }),
      }),
    }));
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'patient-1',
        title: '每周总结已发布',
        relatedType: 'CARE_SUMMARY',
        relatedId: 'summary-1',
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'CARE_SUMMARY_PUBLISH', resourceId: 'summary-1' }),
    });
    expect(result).toMatchObject({ id: 'summary-1', periodType: 'WEEKLY', comment: dto.comment });
  });

  it('does not publish after the care relation has ended', async () => {
    const prisma = {
      careRelation: { findFirst: jest.fn().mockResolvedValue(null) },
      healthRecord: { findMany: jest.fn() },
      patientTask: { findMany: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    await expect(service.publishCareSummary(doctorActor, 'patient-1', {
      periodType: 'MONTHLY',
      referenceDate: '2026-08-18',
      comment: '本月点评',
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma as unknown as { healthRecord: { findMany: jest.Mock } }).healthRecord.findMany).not.toHaveBeenCalled();
  });
});

describe('ClinicalService patient archive', () => {
  const draftDto: UpsertPatientArchiveDto = {
    status: 'DRAFT',
    answers: {
      basic: { neckCm: 36, waistCm: 92 },
      dietRiskFactors: ['REFINED_CARBS', 'SALTY_TASTE'],
    },
    completionPercent: 35,
  };

  const archiveRow = {
    id: 'archive-1',
    archiveNo: 'TCM20260818ABC123',
    patientId: 'patient-1',
    status: 'DRAFT',
    templateVersion: 'TCM_WEIGHT_V1',
    answers: draftDto.answers,
    completionPercent: 35,
    createdById: doctorActor.sub,
    updatedById: doctorActor.sub,
    completedAt: null,
    createdAt: new Date('2026-08-18T01:00:00.000Z'),
    updatedAt: new Date('2026-08-18T01:00:00.000Z'),
  };

  it('returns an explicit null archive after verifying the active care relation', async () => {
    const prisma = {
      careRelation: { findFirst: jest.fn().mockResolvedValue(relation) },
      patientArchive: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    await expect(service.patientArchive(doctorActor, 'patient-1')).resolves.toEqual({ archive: null });
    expect((prisma as any).careRelation.findFirst).toHaveBeenCalledWith({
      where: { patientId: 'patient-1', practitionerId: doctorActor.sub, status: 'ACTIVE' },
    });
  });

  it('creates a draft archive and audits only summary metadata', async () => {
    const tx = {
      careRelation: { findFirst: jest.fn().mockResolvedValue({ id: relation.id }) },
      patientArchive: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(archiveRow),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-archive-1' }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    const result = await service.upsertPatientArchive(doctorActor, 'patient-1', draftDto);

    expect(tx.patientArchive.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId: 'patient-1',
        archiveNo: expect.stringMatching(/^TCM\d{8}[0-9A-Z]{6}$/),
        status: 'DRAFT',
        templateVersion: 'TCM_WEIGHT_V1',
        createdById: doctorActor.sub,
        updatedById: doctorActor.sub,
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PATIENT_ARCHIVE_CREATE',
        resourceType: 'PATIENT_ARCHIVE',
        metadata: {
          patientId: 'patient-1',
          status: 'DRAFT',
          completionPercent: 35,
          templateVersion: 'TCM_WEIGHT_V1',
        },
      }),
    });
    expect((tx.auditLog.create.mock.calls[0][0].data.metadata as Record<string, unknown>)).not.toHaveProperty('answers');
    expect(result.archive.updatedAt).toBe('2026-08-18T01:00:00.000Z');
  });

  it('completes an archive with optimistic concurrency protection', async () => {
    const saved = {
      ...archiveRow,
      status: 'COMPLETED',
      completionPercent: 100,
      completedAt: new Date('2026-08-18T02:00:00.000Z'),
      updatedAt: new Date('2026-08-18T02:00:00.000Z'),
    };
    const tx = {
      careRelation: { findFirst: jest.fn().mockResolvedValue({ id: relation.id }) },
      patientArchive: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(archiveRow)
          .mockResolvedValueOnce(saved),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-archive-2' }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    const result = await service.upsertPatientArchive(doctorActor, 'patient-1', {
      status: 'COMPLETED',
      answers: draftDto.answers,
      completionPercent: 100,
      expectedUpdatedAt: archiveRow.updatedAt.toISOString(),
    });

    expect(tx.patientArchive.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: archiveRow.id, updatedAt: archiveRow.updatedAt },
      data: expect.objectContaining({ status: 'COMPLETED', completionPercent: 100 }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'PATIENT_ARCHIVE_COMPLETE' }),
    });
    expect(result.archive.status).toBe('COMPLETED');
    expect(result.archive.completedAt).toBe('2026-08-18T02:00:00.000Z');
  });

  it('rejects stale writes without creating an audit record', async () => {
    const tx = {
      careRelation: { findFirst: jest.fn().mockResolvedValue({ id: relation.id }) },
      patientArchive: {
        findUnique: jest.fn().mockResolvedValue(archiveRow),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    await expect(service.upsertPatientArchive(doctorActor, 'patient-1', {
      ...draftDto,
      expectedUpdatedAt: '2026-08-17T01:00:00.000Z',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('requires the last seen updatedAt for every update', async () => {
    const tx = {
      careRelation: { findFirst: jest.fn().mockResolvedValue({ id: relation.id }) },
      patientArchive: {
        findUnique: jest.fn().mockResolvedValue(archiveRow),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    await expect(service.upsertPatientArchive(doctorActor, 'patient-1', draftDto))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.patientArchive.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows completing the initial archive with optional fields still unfilled', async () => {
    const saved = {
      ...archiveRow,
      status: 'COMPLETED',
      completionPercent: 62,
      completedAt: new Date('2026-08-18T02:00:00.000Z'),
    };
    const tx = {
      careRelation: { findFirst: jest.fn().mockResolvedValue({ id: relation.id }) },
      patientArchive: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(saved),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-archive-partial' }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    await expect(service.upsertPatientArchive(doctorActor, 'patient-1', {
      status: 'COMPLETED',
      answers: { basic: { heightCm: 170 } },
      completionPercent: 62,
    })).resolves.toEqual(expect.objectContaining({
      archive: expect.objectContaining({ status: 'COMPLETED', completionPercent: 62 }),
    }));
  });

  it('allows nutritionists but rejects patient actors before archive access', async () => {
    const prisma = { $transaction: jest.fn(), careRelation: { findFirst: jest.fn() } } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());
    const nutritionistActor = { ...doctorActor, sub: 'nutritionist-1', role: 'NUTRITIONIST' } as Actor;
    const patientActor = { ...doctorActor, sub: 'patient-2', role: 'PATIENT' } as Actor;

    expect(() => service.assertPractitioner(nutritionistActor)).not.toThrow();
    await expect(service.patientArchive(patientActor, 'patient-2')).rejects.toBeInstanceOf(ForbiddenException);
    expect((prisma as any).careRelation.findFirst).not.toHaveBeenCalled();
  });

  it('rejects archive writes when the practitioner no longer has an active relation', async () => {
    const tx = {
      careRelation: { findFirst: jest.fn().mockResolvedValue(null) },
      patientArchive: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new ClinicalService(prisma, authMock());

    await expect(service.upsertPatientArchive(doctorActor, 'patient-1', draftDto))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.patientArchive.findUnique).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects unknown top-level archive DTO fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    });

    await expect(pipe.transform({
      ...draftDto,
      unexpectedMedicalField: 'must not be silently accepted',
    }, {
      type: 'body',
      metatype: UpsertPatientArchiveDto,
    })).rejects.toThrow();
  });
});
