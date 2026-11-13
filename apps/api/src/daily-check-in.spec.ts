import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { DailyCheckInService, DailyCheckInSubmitDto, checkInDate, validateCheckInAnswers } from './daily-check-in';

jest.mock('qrcode', () => ({ toDataURL: jest.fn(async (url) => 'data:image/png;base64,' + Buffer.from(url).toString('base64')) }));

function harness() {
  let role = 'HEALTH_MANAGER';
  let assigned = true;
  let enrolled = true;
  const patient = { id: 'patient-one', displayName: '真实姓名', phone: '13912345678', role: 'PATIENT', status: 'ACTIVE', deletedAt: null };
  let links: any[] = [];
  let records: any[] = [];
  let health: any[] = [];
  const tx: any = {
    $queryRaw: jest.fn(async () => [{ id: patient.id }]),
    user: { findUnique: jest.fn(async ({ where }) => where.id === patient.id ? patient : null) },
    careEnrollment: { findUnique: jest.fn(async () => enrolled ? { healthManagerId: assigned ? 'staff' : 'other', doctorId: assigned ? 'staff' : 'other', nutritionistId: assigned ? 'staff' : 'other', clientCode: 'C-001' } : null) },
    careRelation: { findFirst: jest.fn(async () => assigned ? { id: 'relation' } : null) },
    dailyCheckInLink: {
      findUnique: jest.fn(async ({ where }) => links.find(row => where.patientId ? row.patientId === where.patientId : row.tokenHash === where.tokenHash) ?? null),
      create: jest.fn(async ({ data }) => { const row = { ...data, id: 'link-' + links.length, createdAt: new Date(), updatedAt: new Date() }; links.push(row); return row; }),
      update: jest.fn(async ({ where, data }) => { const row = links.find(row => row.patientId === where.patientId); Object.assign(row, data); return row; }),
    },
    dailyCheckInRecord: {
      findUnique: jest.fn(async ({ where }) => records.find(row => row.patientId === where.patientId_date.patientId && row.date === where.patientId_date.date) ?? null),
      create: jest.fn(async ({ data }) => { const row = { ...data, id: 'record-' + records.length, version: 1, updatedAt: new Date() }; records.push(row); return row; }),
      update: jest.fn(async ({ where, data }) => { const row = records.find(row => row.patientId === where.patientId_date.patientId && row.date === where.patientId_date.date); Object.assign(row, { ...data, version: row.version + data.version.increment, updatedAt: new Date() }); return row; }),
      findMany: jest.fn(async ({ where }) => records.filter(row => row.patientId === where.patientId)),
      count: jest.fn(async ({ where }) => records.filter(row => row.patientId === where.patientId).length),
    },
    healthRecord: {
      create: jest.fn(async ({ data }) => { const row = { ...data, id: 'health-' + health.length }; health.push(row); return row; }),
      update: jest.fn(async ({ where, data }) => { const row = health.find(row => row.id === where.id); Object.assign(row, data); return row; }),
    },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (work) => {
    const snapshot = structuredClone({ links, records, health });
    try { return await work(tx); } catch (error) { links = snapshot.links; records = snapshot.records; health = snapshot.health; throw error; }
  }) };
  const clinical: any = { actor: jest.fn(async () => ({ sub: 'staff', role })) };
  const service = new DailyCheckInService(prisma, clinical);
  const link = () => service.link({} as any, patient.id);
  const token = async () => (await link()).url.split('/daily-check-in/')[1];
  const submit = (token: string, patch = {}) => service.submit({ token, date: '2026-11-12', version: 0, weightKg: 70, ...patch });
  return { service, tx, prisma, clinical, patient, link, token, submit, state: () => ({ links, records, health }), setRole: (next: string) => { role = next; }, setAssigned: (value: boolean) => { assigned = value; }, setEnrolled: (value: boolean) => { enrolled = value; } };
}

describe('daily check-in capability and persistence', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-12T02:00:00Z'));
    process.env.JWT_ACCESS_SECRET = 'daily-check-in-test-secret-at-least-32-characters';
    process.env.DAILY_CHECK_IN_APP_URL = 'https://weight.example.test';
  });
  afterEach(() => { jest.useRealTimers(); delete process.env.DAILY_CHECK_IN_APP_URL; });

  it('returns a stable opaque URL and QR while storing no bearer token', async () => {
    const h = harness(); const first = await h.link(); const second = await h.link();
    expect(first).toEqual(second);
    expect(first.url).toMatch(/^https:\/\/weight.example.test\/#\/daily-check-in\/[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(first.qrDataUrl).toContain('data:image/png;base64,');
    expect(first.url).not.toContain(h.patient.id);
    expect(h.state().links).toHaveLength(1);
    expect(h.state().links[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(h.state().links)).not.toContain(first.url.split('/daily-check-in/')[1]);
    expect(JSON.stringify(h.tx.auditLog.create.mock.calls)).not.toContain(first.url);
  });

  it('accepts only weight, keeps one daily row and synchronizes edits to the weight trend', async () => {
    const h = harness(); const token = await h.token();
    const first = await h.submit(token);
    expect(first).toMatchObject({ date: '2026-11-12', version: 1, weightKg: 70, answers: {} });
    const replay = await h.submit(token);
    expect(replay).toEqual(first);
    const edited = await h.submit(token, { version: 1, weightKg: 69.5, answers: { appetite: 0, bowel_count: 0 } });
    expect(edited).toMatchObject({ version: 2, weightKg: 69.5, answers: { appetite: 0, bowel_count: 0 } });
    expect(h.state().records).toHaveLength(1);
    expect(h.state().health).toHaveLength(1);
    expect(h.state().health[0]).toMatchObject({ patientId: h.patient.id, source: 'DAILY_CHECK_IN', recordType: 'WEIGHT', weightKg: 69.5 });
  });

  it('does not overwrite another device edit or append duplicates on a stale version', async () => {
    const h = harness(); const token = await h.token(); await h.submit(token);
    await expect(h.submit(token, { weightKg: 68 })).rejects.toBeInstanceOf(ConflictException);
    expect(h.state().health[0].weightKg).toBe(70);
    expect(h.state().records[0].version).toBe(1);
  });

  it('public context exposes only the anonymous label and current day, never identity or history', async () => {
    const h = harness(); const token = await h.token(); await h.submit(token);
    const context = await h.service.context({ token });
    expect(Object.keys(context).sort()).toEqual(['clientLabel', 'date', 'record']);
    expect(context.clientLabel).toMatch(/^客户[A-F0-9]{8}$/);
    expect(JSON.stringify(context)).not.toMatch(/真实姓名|13912345678|patient-one/);
    jest.setSystemTime(new Date('2026-11-13T02:00:00Z'));
    expect((await h.service.context({ token })).record).toBeNull();
    expect(h.state().records).toHaveLength(1);
  });

  it('rejects revoked, rotated, tampered, unknown and disabled-account links', async () => {
    const h = harness(); const token = await h.token();
    await h.service.revoke({} as any, h.patient.id);
    await expect(h.service.context({ token })).rejects.toBeInstanceOf(NotFoundException);
    expect(await h.link()).toEqual({ url: '', qrDataUrl: '', revoked: true });
    const fresh = await h.service.link({} as any, h.patient.id, true);
    expect(fresh.url).not.toContain(token);
    await expect(h.submit(token)).rejects.toBeInstanceOf(NotFoundException);
    const next = fresh.url.split('/daily-check-in/')[1];
    expect((await h.service.context({ token: next })).record).toBeNull();
    await expect(h.submit(next.slice(0, -1) + (next.endsWith('a') ? 'b' : 'a'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.submit('a'.repeat(43) + '.' + 'b'.repeat(43))).rejects.toBeInstanceOf(NotFoundException);
    h.patient.status = 'DISABLED';
    await expect(h.submit(next)).rejects.toBeInstanceOf(NotFoundException);
    expect(h.state().health).toHaveLength(0);
  });

  it('does not authorize a historical token after a signing-key rotation', async () => {
    const h = harness(); const before = await h.token();
    process.env.JWT_ACCESS_SECRET = 'rotated-daily-check-in-test-secret-32-characters';
    await expect(h.service.context({ token: before })).rejects.toBeInstanceOf(NotFoundException);
    const after = await h.token(); expect(after).not.toBe(before);
    expect((await h.service.context({ token: after })).record).toBeNull();
  });

  it('checks current authorization inside link mutations and supports legacy active relations', async () => {
    const h = harness();
    h.setAssigned(false);
    await expect(h.link()).rejects.toBeInstanceOf(ForbiddenException);
    expect(await h.service.records({} as any, h.patient.id)).toMatchObject({ canViewLink: false, canManageLink: false });
    h.setAssigned(true); h.setEnrolled(false);
    expect((await h.link()).revoked).toBe(false);
    h.setRole('DOCTOR');
    expect(await h.service.records({} as any, h.patient.id)).toMatchObject({ canViewLink: true, canManageLink: true });
    h.setAssigned(false);
    await expect(h.service.records({} as any, h.patient.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies administrators, coaches and patients, while nutritionists receive structured read-only records', async () => {
    const h = harness(); const token = await h.token();
    await h.submit(token, { answers: { appetite: 0, bowel_extra: '真实姓名13912345678', bowel_ease: 'SMOOTH' } });
    for (const role of ['ADMIN', 'EXERCISE_COACH', 'PATIENT']) {
      h.setRole(role);
      await expect(h.link()).rejects.toBeInstanceOf(ForbiddenException);
      await expect(h.service.records({} as any, h.patient.id)).rejects.toBeInstanceOf(ForbiddenException);
    }
    h.setRole('NUTRITIONIST');
    expect((await h.link()).url).toContain(token);
    const view = await h.service.records({} as any, h.patient.id);
    expect(view.canViewLink).toBe(true);
    expect(view.canManageLink).toBe(false);
    expect(view.items[0].answers).toEqual({ appetite: 0, bowel_ease: 'SMOOTH' });
    expect(view.items[0]).toHaveProperty('redactedAnswerKeys', ['bowel_extra']);
    expect(JSON.stringify(view)).not.toMatch(/真实姓名|13912345678/);
  });

  it('lets an assigned nutritionist obtain the stable link and QR on first use without reset or revoke rights', async () => {
    const h = harness(); h.setRole('NUTRITIONIST');
    const first = await h.link();
    expect(first.revoked).toBe(false); expect(first.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(await h.link()).toEqual(first); expect(h.state().links).toHaveLength(1);
    const before = structuredClone(h.state().links[0]);
    await expect(h.service.link({} as any, h.patient.id, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.revoke({} as any, h.patient.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.state().links[0]).toEqual(before);
    h.setRole('HEALTH_MANAGER'); expect(await h.link()).toEqual(first);
  });

  it('does not let a nutritionist revive a revoked link through the sharing entry', async () => {
    const h = harness(); await h.link(); await h.service.revoke({} as any, h.patient.id);
    const before = structuredClone(h.state().links[0]);
    h.setRole('NUTRITIONIST');
    expect(await h.link()).toEqual({ url: '', qrDataUrl: '', revoked: true });
    await expect(h.service.link({} as any, h.patient.id, true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.state().links[0]).toEqual(before);
  });

  it('requires both current enrollment assignment and an active relation for nutritionist sharing', async () => {
    const inactive = harness(); inactive.setRole('NUTRITIONIST');
    inactive.tx.careRelation.findFirst.mockResolvedValue(null);
    await expect(inactive.link()).rejects.toBeInstanceOf(ForbiddenException);
    expect(inactive.state().links).toHaveLength(0);
    const reassigned = harness(); reassigned.setRole('NUTRITIONIST');
    reassigned.tx.careEnrollment.findUnique.mockResolvedValue({ healthManagerId: 'staff', doctorId: 'staff', nutritionistId: 'other', clientCode: 'C-001' });
    await expect(reassigned.link()).rejects.toBeInstanceOf(ForbiddenException);
    expect(reassigned.state().links).toHaveLength(0);
    const legacy = harness(); legacy.setRole('NUTRITIONIST'); legacy.setEnrolled(false);
    expect((await legacy.link()).revoked).toBe(false);
    expect(await legacy.service.records({} as any, legacy.patient.id)).toMatchObject({ canViewLink: true, canManageLink: false });
  });

  it('rejects past/future dates and rolls back a write crossing Shanghai midnight', async () => {
    const h = harness(); const token = await h.token();
    for (const date of ['2026-11-11', '2026-11-13']) await expect(h.submit(token, { date })).rejects.toBeInstanceOf(ConflictException);
    const create = h.tx.dailyCheckInRecord.create.getMockImplementation();
    h.tx.dailyCheckInRecord.create.mockImplementation(async (input: any) => {
      const result = await create(input); jest.setSystemTime(new Date('2026-11-12T16:00:00Z')); return result;
    });
    await expect(h.submit(token)).rejects.toBeInstanceOf(ConflictException);
    expect(h.state().records).toHaveLength(0); expect(h.state().health).toHaveLength(0);
    expect(checkInDate(new Date('2026-11-12T15:59:59Z'))).toBe('2026-11-12');
    expect(checkInDate(new Date('2026-11-12T16:00:00Z'))).toBe('2026-11-13');
  });

  it('rejects missing/out-of-range weight and unknown or malformed optional fields', async () => {
    const h = harness(); const token = await h.token();
    for (const weightKg of [undefined, null, '', 0, 19, 401, NaN, 70.123]) await expect(h.submit(token, { weightKg })).rejects.toBeInstanceOf(BadRequestException);
    for (const answers of [null, [], { patientId: 'victim' }, { appetite: 3 }, { fatigue: '1' }, { stool_type: 0 }, { bowel_ease: 'OTHER' }, { bowel_extra: 'a'.repeat(201) }]) expect(() => validateCheckInAnswers(answers)).toThrow(BadRequestException);
    expect(h.state().records).toHaveLength(0);
  });

  it('rejects patient selection and extra top-level fields through the real validation pipe', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
    const h = harness(); const token = await h.token();
    const body = { token, date: '2026-11-12', version: 0, weightKg: 70 };
    await expect(pipe.transform({ ...body, patientId: 'victim' }, { type: 'body', metatype: DailyCheckInSubmitDto })).rejects.toBeInstanceOf(BadRequestException);
    expect(await pipe.transform(body, { type: 'body', metatype: DailyCheckInSubmitDto })).toMatchObject(body);
  });

  it('fails clearly without a public app URL and strips API paths from the configured fallback', async () => {
    const h = harness(); delete process.env.DAILY_CHECK_IN_APP_URL;
    const prior = process.env.API_PUBLIC_URL; delete process.env.API_PUBLIC_URL;
    await expect(h.link()).rejects.toThrow('每日填报访问地址未配置');
    process.env.API_PUBLIC_URL = 'https://weight.example.test/api/v1';
    expect((await h.link()).url).toMatch(/^https:\/\/weight.example.test\/#\//);
    if (prior === undefined) delete process.env.API_PUBLIC_URL; else process.env.API_PUBLIC_URL = prior;
  });
});
