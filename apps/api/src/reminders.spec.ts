import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { RemindersService } from './reminders';

describe('authenticated reminder scheduler integration', () => {
  const original = process.env.REMINDER_CRON_SECRET;
  const secret = 'synthetic-reminder-cron-secret-32-characters';
  afterEach(() => {
    if (original === undefined) delete process.env.REMINDER_CRON_SECRET;
    else process.env.REMINDER_CRON_SECRET = original;
  });
  function fixture() {
    process.env.REMINDER_CRON_SECRET = secret;
    const prisma = { followUp: { findMany: jest.fn().mockResolvedValue([]) } };
    const yuanqizhan = { run: jest.fn().mockResolvedValue({ accepted: 2, state: 'COMPLETE' }) };
    return { prisma, yuanqizhan, service: new RemindersService(prisma as never, {} as never, yuanqizhan as never) };
  }

  it.each([undefined, 'wrong-secret', [secret]])('rejects unauthorized scheduler calls before any work: %p', async (provided) => {
    const { prisma, yuanqizhan, service } = fixture();
    await expect(service.run({ headers: { 'x-cron-secret': provided } } as unknown as Request)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.followUp.findMany).not.toHaveBeenCalled();
    expect(yuanqizhan.run).not.toHaveBeenCalled();
  });

  it('runs the daily check-in scheduler through the existing cron route and preserves follow-up summary', async () => {
    const { prisma, yuanqizhan, service } = fixture();
    await expect(service.run({ headers: { 'x-cron-secret': secret } } as unknown as Request)).resolves.toEqual({
      scanned: 0, sent: 0, results: [], yuanqizhan: { accepted: 2, state: 'COMPLETE' },
    });
    expect(yuanqizhan.run).toHaveBeenCalledTimes(1);
    expect(prisma.followUp.findMany).toHaveBeenCalledTimes(1);
  });

  it('checks Yuanqizhan before a failing legacy follow-up query', async () => {
    const { prisma, yuanqizhan, service } = fixture();
    prisma.followUp.findMany.mockRejectedValue(new Error('synthetic database error'));
    await expect(service.run({ headers: { 'x-cron-secret': secret } } as unknown as Request)).rejects.toThrow('synthetic database error');
    expect(yuanqizhan.run).toHaveBeenCalledTimes(1);
  });
});
