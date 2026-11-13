import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DailyCheckInService, validateCheckInAnswers } from './daily-check-in';
import { MediaService } from './media';
import { DAILY_PHOTO_TYPE, canReadDailyCheckInPhoto } from './daily-check-in-photo-policy';
const sharp: typeof import('sharp')['default'] = require('sharp');
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async () => 'data:image/png;base64,c3ludGhldGlj') }));

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('startsWith' in value) return row[key]?.startsWith(value.startsWith);
    }
    return row[key] === value || (value === null && row[key] == null);
  });
}
function harness() {
  let role = 'HEALTH_MANAGER';
  let state: any = { links: [], records: [], photos: [], health: [] };
  const patient = { id: 'patient-one', role: 'PATIENT', status: 'ACTIVE', deletedAt: null };
  const db: any = {
    $queryRaw: jest.fn(async () => []),
    user: { findUnique: jest.fn(async ({ where }) => where.id === patient.id ? patient : null) },
    careEnrollment: { findUnique: jest.fn(async () => ({ healthManagerId: 'staff', doctorId: 'staff', nutritionistId: 'staff' })) },
    careRelation: { findFirst: jest.fn(async () => ({ id: 'relation' })) },
    auditLog: { create: jest.fn(async () => ({})) },
  };
  for (const [table, key] of [['dailyCheckInLink', 'links'], ['dailyCheckInRecord', 'records'], ['mediaAsset', 'photos'], ['healthRecord', 'health']]) {
    const filter = (where: any) => where?.patientId_date ?? where;
    db[table] = {
      findUnique: jest.fn(async ({ where }) => state[key].find((r: any) => matches(r, filter(where))) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }) => { const found = state[key].find((r: any) => matches(r, filter(where))); if (!found) throw new Error('missing'); return found; }),
      findMany: jest.fn(async ({ where }) => state[key].filter((r: any) => matches(r, filter(where)))),
      count: jest.fn(async ({ where }) => state[key].filter((r: any) => matches(r, filter(where))).length),
      create: jest.fn(async ({ data }) => { const row = { id: key + '-' + state[key].length, version: 1, deletedAt: null, updatedAt: new Date(), ...data }; state[key].push(row); return row; }),
      update: jest.fn(async ({ where, data }) => { const row = state[key].find((r: any) => matches(r, filter(where))); Object.assign(row, { ...data, ...(data.version ? { version: row.version + data.version.increment } : {}) }); return row; }),
      updateMany: jest.fn(async ({ where, data }) => { const rows = state[key].filter((r: any) => matches(r, filter(where))); rows.forEach((r: any) => Object.assign(r, data)); return { count: rows.length }; }),
    };
  }
  db.$transaction = jest.fn(async (work) => { const before = structuredClone(state); try { return await work(db); } catch (error) { state = before; throw error; } });
  const clinical: any = { actor: jest.fn(async () => ({ sub: 'staff', role })) };
  const media = new MediaService(db, clinical);
  const write = jest.spyOn(media, 'storeDailyCheckInPhoto').mockResolvedValue(undefined);
  const content = jest.spyOn(media, 'dailyCheckInPhotoContent').mockResolvedValue({ mimeType: 'image/png', fullPath: '/synthetic/photo.png' });
  const service = new DailyCheckInService(db, clinical, media);
  const token = async () => (await service.link({} as any, patient.id)).url.split('/daily-check-in/')[1];
  const submit = (token: string, answers: Record<string, unknown> = {}, version = 0) => service.submit({ token, date: '2026-11-13', weightKg: 70, version, answers });
  const read = (url: string) => { const u = new URL(url); return service.photoContent(u.pathname.split('/').at(-2)!, u.searchParams.get('link')!, u.searchParams.get('expires')!, u.searchParams.get('sig')!); };
  return { db, service, media, patient, token, submit, read, write, content, state: () => state, role: (r: string) => { role = r; } };
}

describe('daily lifestyle and meal photo isolation', () => {
  let png: Buffer;
  const file = () => ({ buffer: png, size: png.length, mimetype: 'application/octet-stream', originalname: 'meal.bin' });
  beforeAll(async () => { png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#cdefab' } }).png().toBuffer(); });
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] }); jest.setSystemTime(new Date('2026-11-13T02:00:00Z'));
    process.env.JWT_ACCESS_SECRET = 'test-only-daily-lifestyle-secret-at-least32';
    process.env.MEDIA_SIGNING_SECRET = 'test-only-distinct-media-signing-secret32';
    process.env.DAILY_CHECK_IN_APP_URL = 'https://daily.example.test';
    delete process.env.OSS_ACCESS_KEY_ID; delete process.env.OSS_ACCESS_KEY_SECRET; delete process.env.OSS_REGION; delete process.env.OSS_BUCKET;
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); delete process.env.MEDIA_SIGNING_SECRET; });

  it('preserves explicit zero, partial sleep and meal text, and clears removed waist from the weight trend', async () => {
    const h = harness(), token = await h.token();
    const answers = { waist_cm: 88.1, exercise_minutes: 0, water_ml: 0, sleep_start: '23:05', breakfast_text: '鸡蛋和牛奶' };
    expect((await h.submit(token, answers)).answers).toEqual(answers);
    expect(h.state().health[0].waistCm).toBe(88.1);
    h.role('NUTRITIONIST'); expect((await h.service.records({} as any, h.patient.id)).items[0].answers.breakfast_text).toBe('鸡蛋和牛奶');
    await h.submit(token, {}, 1); expect(h.state().health[0].waistCm).toBeNull();
  });
  it.each([
    { waist_cm: 19.9 }, { waist_cm: 300.1 }, { waist_cm: 80.123 }, { exercise_minutes: -1 }, { exercise_minutes: 1.5 },
    { exercise_minutes: 1441 }, { water_ml: 20001 }, { water_ml: 1.1 }, { sleep_start: '24:00' }, { sleep_end: '9:01' },
    { breakfast_text: 'x'.repeat(501) }, { lunch_photo_ids: Array.from({ length: 10 }, (_, i) => 'p' + i) }, { dinner_photo_ids: ['a', 'a'] },
    { breakfast_photo_ids: ['../other'] }, { sleep_duration: 20 },
  ])('rejects invalid lifestyle input %j', answers => { expect(() => validateCheckInAnswers(answers)).toThrow(BadRequestException); });

  it('uploads an owner/date/meal-bound draft, exposes it only publicly, then allows assigned staff after submission', async () => {
    const h = harness(), token = await h.token();
    const uploaded = await h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, file());
    expect(Object.keys(uploaded).sort()).toEqual(['id', 'mimeType', 'url']);
    expect(uploaded.mimeType).toBe('image/png'); expect(uploaded.url).not.toContain(token);
    expect(h.state().photos[0]).toMatchObject({ ownerId: h.patient.id, referenceType: DAILY_PHOTO_TYPE, referenceId: '2026-11-13:breakfast', status: 'READY', scope: 'PRIVATE' });
    expect(h.state().photos[0].objectKey).toMatch(/\/daily-meals\/2026-11-13\/.*\.png$/);
    await expect(h.read(uploaded.url)).resolves.toMatchObject({ mimeType: 'image/png' });
    await expect(h.media.signedUrl({} as any, uploaded.id)).rejects.toBeInstanceOf(ForbiddenException);
    const saved = await h.submit(token, { breakfast_photo_ids: [uploaded.id] });
    expect(saved.photos[0].id).toBe(uploaded.id);
    expect((await h.service.context({ token })).record?.photos[0].id).toBe(uploaded.id);
    h.role('NUTRITIONIST');
    expect((await h.service.records({} as any, h.patient.id)).items[0].photos[0].url).toContain('/api/v1/media/');
    await expect(h.media.signedUrl({} as any, uploaded.id)).resolves.toMatchObject({ id: uploaded.id, requiresAuthorization: true });
    h.db.careRelation.findFirst.mockResolvedValue(null);
    await expect(h.media.signedUrl({} as any, uploaded.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects another owner, day, meal, missing id and non-ready photo before any weight write', async () => {
    for (const patch of [{ ownerId: 'victim' }, { referenceId: '2026-11-12:breakfast' }, { referenceId: '2026-11-13:lunch' }, { status: 'PENDING' }, { referenceType: 'HEALTH_RECORD' }]) {
      const h = harness(), token = await h.token();
      h.state().photos.push({ id: 'photo', ownerId: h.patient.id, referenceType: DAILY_PHOTO_TYPE, referenceId: '2026-11-13:breakfast', status: 'READY', deletedAt: null, ...patch });
      await expect(h.submit(token, { breakfast_photo_ids: ['photo'] })).rejects.toBeInstanceOf(BadRequestException);
      expect(h.state().health).toHaveLength(0);
    }
    const h = harness(), token = await h.token();
    await expect(h.submit(token, { breakfast_photo_ids: ['missing'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.submit(token, { breakfast_photo_ids: ['a'], lunch_photo_ids: ['a'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes removed photo URLs while retaining originals; identical replay does not change the version', async () => {
    const h = harness(), token = await h.token();
    const p = await h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'lunch' }, file());
    const answers = { lunch_photo_ids: [p.id] };
    expect((await h.submit(token, answers)).version).toBe(1);
    expect((await h.submit(token, answers)).version).toBe(1);
    await h.submit(token, {}, 1);
    expect(h.state().photos[0].status).toBe('DELETED'); expect(h.state().photos[0].objectKey).toBeTruthy();
    await expect(h.read(p.url)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.service.refreshPhotos({ token, date: '2026-11-13', photoIds: [p.id] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.media.signedUrl({} as any, p.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(h.submit(token, answers, 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('invalidates signed photos on reset, revoke, JWT rotation, disabled patient, expiry and changed date', async () => {
    for (const mutation of ['reset', 'revoke', 'secret', 'disabled', 'expiry', 'date']) {
      const h = harness(), token = await h.token();
      const p = await h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'dinner' }, file());
      if (mutation === 'reset') await h.service.link({} as any, h.patient.id, true);
      if (mutation === 'revoke') await h.service.revoke({} as any, h.patient.id);
      if (mutation === 'secret') process.env.JWT_ACCESS_SECRET = 'rotated-only-jwt-secret-media-unchanged32';
      if (mutation === 'disabled') h.patient.status = 'DISABLED';
      if (mutation === 'expiry') jest.setSystemTime(new Date('2026-11-13T02:10:01Z'));
      if (mutation === 'date') jest.setSystemTime(new Date('2026-11-13T16:00:00Z'));
      await expect(h.read(p.url)).rejects.toBeDefined();
      expect(h.content).not.toHaveBeenCalled();
      jest.setSystemTime(new Date('2026-11-13T02:00:00Z'));
    }
  });

  it('reserves failed attempts and rejects all-state daily quota, including deleted and failed files', async () => {
    const h = harness(), token = await h.token();
    h.write.mockRejectedValueOnce(new Error('synthetic storage failure'));
    await expect(h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, file())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(h.state().photos[0].status).toBe('FAILED');
    for (let i = 1; i < 30; i++) h.state().photos.push({ id: 'photo-' + i, ownerId: h.patient.id, referenceType: DAILY_PHOTO_TYPE, referenceId: '2026-11-13:lunch', status: i % 2 ? 'DELETED' : 'PENDING' });
    await expect(h.service.authorizePhotoUpload(token)).rejects.toMatchObject({ status: 429 });
    await expect(h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, file())).rejects.toMatchObject({ status: 429 });
    expect(h.state().photos).toHaveLength(30); expect(h.write).toHaveBeenCalledTimes(1);
    expect((await h.submit(token)).weightKg).toBe(70);
  });

  it('rechecks capability after storage and retains a failed reservation if a reset wins', async () => {
    const h = harness(), token = await h.token();
    h.write.mockImplementationOnce(async () => { await h.service.link({} as any, h.patient.id, true); });
    await expect(h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, file())).rejects.toBeInstanceOf(NotFoundException);
    expect(h.state().photos[0].status).toBe('FAILED');
  });

  it('counts decoder failures without writing their corrupt bytes to storage', async () => {
    const h = harness(), token = await h.token();
    const truncated = { ...file(), buffer: png.subarray(0, 33), size: 33 };
    await expect(h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, truncated)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.state().photos).toHaveLength(1); expect(h.state().photos[0].status).toBe('FAILED');
    expect(h.write).not.toHaveBeenCalled();
  });

  it('rejects invalid formats, oversized files, extra fields and old dates before reservation/storage', async () => {
    const h = harness(), token = await h.token();
    const bad = { ...file(), buffer: Buffer.from('<svg/>'), size: 6 };
    await expect(h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, bad)).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast', patientId: 'victim' }, file())).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.service.uploadPhoto(token, { date: '2026-11-12', meal: 'breakfast' }, file())).rejects.toBeInstanceOf(ConflictException);
    await expect(h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, { ...file(), buffer: Buffer.alloc(10485761), size: 10485761 })).rejects.toBeInstanceOf(BadRequestException);
    expect(h.db.mediaAsset.create).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled();
  });

  it('does not permit owner shortcuts, generic OCR, unrelated assignments or unsupported roles', async () => {
    const h = harness(), token = await h.token();
    const p = await h.service.uploadPhoto(token, { date: '2026-11-13', meal: 'breakfast' }, file());
    await h.submit(token, { breakfast_photo_ids: [p.id] });
    const asset = h.state().photos[0];
    for (const role of ['ADMIN', 'EXERCISE_COACH']) expect(await canReadDailyCheckInPhoto(h.db, { sub: h.patient.id, role } as any, asset)).toBe(false);
    expect(await canReadDailyCheckInPhoto(h.db, { sub: h.patient.id, role: 'PATIENT' } as any, asset)).toBe(true);
    expect(await canReadDailyCheckInPhoto(h.db, { sub: 'other-patient', role: 'PATIENT' } as any, asset)).toBe(false);
    await expect(h.media.readOwnedImageForOcr({ sub: h.patient.id, role: 'PATIENT' } as any, p.id)).rejects.toBeInstanceOf(ForbiddenException);
    h.db.careEnrollment.findUnique.mockResolvedValue({ doctorId: 'other', nutritionistId: 'other' });
    expect(await canReadDailyCheckInPhoto(h.db, { sub: 'staff', role: 'NUTRITIONIST' } as any, asset)).toBe(false);
    expect(await canReadDailyCheckInPhoto(h.db, { sub: 'staff', role: 'DOCTOR' } as any, asset)).toBe(false);
    expect(await canReadDailyCheckInPhoto(h.db, { sub: 'unassigned-hm', role: 'HEALTH_MANAGER' } as any, asset)).toBe(true);
  });
});
