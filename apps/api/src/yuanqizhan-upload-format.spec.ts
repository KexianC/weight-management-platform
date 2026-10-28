import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaService } from './media';
import { YuanqizhanController, YuanqizhanService } from './yuanqizhan';
import { PHOTO_SLOTS, shanghaiDate } from './yuanqizhan-policy';

// Anonymous 1x1 fixtures; JPEG and WebP were encoded from a white pixel with Pillow.
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==', 'base64');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFasAAAAASUVORK5CYII=', 'base64');
const webp = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=', 'base64');

// Multipart parsing, activity policy, signature validation and local storage are real.
// Authentication identity and SQL are isolated adapters; OSS is explicitly disabled.
describe('Yuanqizhan photo content type compatibility', () => {
  let app: INestApplication, origin: string, directory: string, db: any;
  let role = 'PATIENT';
  let activity: any;
  let media: MediaService;
  let storedCount = 0;
  const envKeys = ['MEDIA_LOCAL_DIR', 'MEDIA_SIGNING_SECRET', 'API_PUBLIC_URL'] as const;
  const priorEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'yuanqizhan-photo-format-'));
    process.env.MEDIA_LOCAL_DIR = directory;
    process.env.MEDIA_SIGNING_SECRET = 'synthetic-photo-signing-secret-longer-than-32';
    process.env.API_PUBLIC_URL = 'http://127.0.0.1';
    const date = shanghaiDate();
    activity = {id: 'synthetic-activity', status: 'ACTIVE', durationDays: 15};
    const member = {id: 'synthetic-member', activityId: activity.id, patientId: 'synthetic-patient', status: 'ACTIVE', startDate: date, joinedAt: new Date(date + 'T00:00:00+08:00'), activity};
    db = {$queryRaw: jest.fn().mockResolvedValue([]),
      yuanqizhanActivity: {findUnique: jest.fn().mockResolvedValue(activity)},
      yuanqizhanMember: {findUnique: jest.fn().mockResolvedValue(member)},
      yuanqizhanPhoto: {create: jest.fn(async ({data}: any) => data)},
      mediaAsset: {create: jest.fn(async ({data}: any) => ({...data, id: `synthetic-asset-${++storedCount}`, createdAt: new Date()}))}};
    db.$transaction = async (work: any) => work(db);
    const clinical = {actor: async () => ({sub: 'synthetic-patient', role, typ: 'access', jti: 'synthetic'})};
    media = new MediaService(db, clinical as any);
    jest.spyOn(media as any, 'ossClient').mockReturnValue(null);
    const service = new YuanqizhanService(db, clinical as any, media);
    const module = await Test.createTestingModule({controllers: [YuanqizhanController], providers: [{provide: YuanqizhanService, useValue: service}]}).compile();
    app = module.createNestApplication({logger: false});
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    await rm(directory, {recursive: true, force: true});
    for (const key of envKeys) {
      if (priorEnv[key] === undefined) delete process.env[key];
      else process.env[key] = priorEnv[key];
    }
    jest.restoreAllMocks();
  });

  function upload(slot: string, bytes: Buffer, declaredType: string, filename = 'synthetic-only.jpg') {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], {type: declaredType}), filename);
    return fetch(`${origin}/yuanqizhan/synthetic-activity/photos/${slot}`, {method: 'POST', body: form});
  }

  it.each([
    ['body_front', 'application/octet-stream', 'synthetic-only.heic'],
    ['body_side', 'image/jpg', 'synthetic-only.jpg'],
    ['body_back', 'image/png', 'synthetic-only.png'],
    ...PHOTO_SLOTS.filter((slot) => !slot.startsWith('body_')).map((slot) => [slot, 'application/octet-stream', 'synthetic-only']),
  ])('accepts real JPEG bytes for %s with declared %s and an unreliable filename', async (slot, declaredType, filename) => {
    const before = storedCount;
    const response = await upload(slot, jpeg, declaredType, filename);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({mimeType: 'image/jpeg', sizeBytes: jpeg.length, slot});
    expect(storedCount).toBe(before + 1);
    const persisted = db.mediaAsset.create.mock.calls.at(-1)[0].data;
    expect(persisted.objectKey).toMatch(/\.jpg$/);
    expect(await readFile(join(directory, persisted.objectKey))).toEqual(jpeg);
  });

  it.each([
    ['JPEG', jpeg, 'image/jpeg', '.jpg'],
    ['PNG', png, 'image/png', '.png'],
    ['WebP', webp, 'image/webp', '.webp'],
  ] as const)('recognizes %s bytes from multipart octet-stream without modifying the original', async (_format, bytes, mimeType, extension) => {
    const response = await upload('body_front', bytes, 'application/octet-stream', 'synthetic-only.bin');
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({mimeType, sizeBytes: bytes.length});
    const persisted = db.mediaAsset.create.mock.calls.at(-1)[0].data;
    expect(persisted.objectKey.endsWith(extension)).toBe(true);
    expect(await readFile(join(directory, persisted.objectKey))).toEqual(bytes);
  });

  it.each([
    ['HEIC container signature', Buffer.from('00000018667479706865696300000000686569636d696631', 'hex')],
    ['HTML', Buffer.from('<html>synthetic-only</html>')],
    ['unknown content', Buffer.from('synthetic-only')],
    ['truncated JPEG', jpeg.subarray(0, jpeg.length - 2)],
    ['truncated PNG signature', png.subarray(0, 20)],
    ['truncated WebP', webp.subarray(0, webp.length - 1)],
  ] as const)('rejects %s even when multipart declares JPEG', async (_description, bytes) => {
    const before = storedCount;
    const response = await upload('body_front', bytes, 'image/jpeg');
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/JPG.*PNG.*WebP/);
    expect(storedCount).toBe(before);
  });

  it('retains the strict generic media upload contract', async () => {
    await expect(media.upload({} as any, {buffer: jpeg, size: jpeg.length, mimetype: 'application/octet-stream', originalname: 'synthetic-only.jpg'})).rejects.toThrow('仅支持 JPG');
  });
  it('rejects an unknown slot before storage', async () => {
    const before = storedCount;
    expect((await upload('body_other', jpeg, 'image/jpeg')).status).toBe(400);
    expect(storedCount).toBe(before);
  });
  it('requires the patient role even with a valid image', async () => {
    const before = storedCount;
    role = 'NUTRITIONIST';
    try { expect((await upload('body_front', jpeg, 'image/jpeg')).status).toBe(403); }
    finally { role = 'PATIENT'; }
    expect(storedCount).toBe(before);
  });
  it('rejects photos after the activity has ended', async () => {
    const before = storedCount;
    activity.status = 'ENDED';
    try { expect((await upload('body_front', jpeg, 'image/jpeg')).status).toBe(403); }
    finally { activity.status = 'ACTIVE'; }
    expect(storedCount).toBe(before);
  });
});
