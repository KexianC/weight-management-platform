import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health';

describe('HealthController', () => {
  it('reports an operational process without claiming dependency readiness', () => {
    const result = new HealthController().check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('weight-care-api');
    expect(result.timestamp).toBeTruthy();
  });

  it('checks the database for readiness', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]) };
    const controller = new HealthController(prisma as never);
    await expect(controller.ready()).resolves.toMatchObject({ status: 'ready', database: 'up' });
  });

  it('fails readiness when the database is unavailable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('down')) };
    const controller = new HealthController(prisma as never);
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
