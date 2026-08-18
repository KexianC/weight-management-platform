import type { Request } from 'express';
import { FollowUpsService } from './followups';

describe('FollowUpsService statistics', () => {
  it('applies the requested week as an exclusive date range', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { status: 'SCHEDULED', _count: { _all: 2 } },
      { status: 'COMPLETED', _count: { _all: 3 } },
    ]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = { followUp: { groupBy, count } } as any;
    const clinical = {
      actor: jest.fn().mockResolvedValue({ sub: 'doctor-1', role: 'DOCTOR' }),
      assertPractitioner: jest.fn(),
      assertCare: jest.fn(),
    } as any;
    const service = new FollowUpsService(prisma, clinical);
    const startAt = '2026-08-16T00:00:00.000Z';
    const endAt = '2026-08-23T00:00:00.000Z';

    const result = await service.stats({} as Request, { startAt, endAt } as any);

    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        practitionerId: 'doctor-1',
        scheduledAt: { gte: new Date(startAt), lt: new Date(endAt) },
      },
    }));
    expect(result).toEqual(expect.objectContaining({ SCHEDULED: 2, COMPLETED: 3 }));
  });

  it('checks the care relationship before filtering practitioner stats by patient', async () => {
    const prisma = {
      followUp: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    const clinical = {
      actor: jest.fn().mockResolvedValue({ sub: 'doctor-1', role: 'DOCTOR' }),
      assertPractitioner: jest.fn(),
      assertCare: jest.fn().mockResolvedValue(undefined),
    } as any;
    const service = new FollowUpsService(prisma, clinical);

    await service.stats({} as Request, { patientId: 'patient-1' } as any);

    expect(clinical.assertCare).toHaveBeenCalledWith(expect.objectContaining({ sub: 'doctor-1' }), 'patient-1');
    expect(prisma.followUp.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { practitionerId: 'doctor-1', patientId: 'patient-1' },
    }));
  });
});
