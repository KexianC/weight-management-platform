import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DailyCheckInPhotoUploadGuard, DailyCheckInPublicController, DailyCheckInService } from './daily-check-in';

describe('daily meal multipart authentication order', () => {
  let app: any, origin: string;
  const service = {
    authorizePhotoUpload: jest.fn(async (token) => { if (token !== 'synthetic-valid-capability') throw new NotFoundException('无效链接'); }),
    uploadPhoto: jest.fn(async () => ({ id: 'synthetic-photo', mimeType: 'image/png', url: 'https://example.test/photo' })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [DailyCheckInPublicController], providers: [DailyCheckInPhotoUploadGuard, { provide: DailyCheckInService, useValue: service }] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { jest.clearAllMocks(); });

  it('rejects invalid capability before parsing an invalid multipart stream', async () => {
    const res = await fetch(origin + '/public/daily-check-in/photos', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data', 'X-Daily-Check-In-Token': 'invalid' }, body: 'not multipart' });
    expect(res.status).toBe(404); expect(service.authorizePhotoUpload).toHaveBeenCalledWith('invalid'); expect(service.uploadPhoto).not.toHaveBeenCalled();
  });
  it('does not accept a capability supplied only in the multipart body', async () => {
    const body = new FormData(); body.set('token', 'synthetic-valid-capability'); body.set('date', '2026-11-13'); body.set('meal', 'breakfast');
    const res = await fetch(origin + '/public/daily-check-in/photos', { method: 'POST', body });
    expect(res.status).toBe(404); expect(service.authorizePhotoUpload).not.toHaveBeenCalled(); expect(service.uploadPhoto).not.toHaveBeenCalled();
  });
  it('accepts the header capability and passes exact date/meal/file to the business service', async () => {
    const body = new FormData(); body.set('date', '2026-11-13'); body.set('meal', 'breakfast'); body.set('file', new Blob(['synthetic-bytes'], { type: 'image/png' }), 'meal.png');
    const res = await fetch(origin + '/public/daily-check-in/photos', { method: 'POST', headers: { 'X-Daily-Check-In-Token': 'synthetic-valid-capability' }, body });
    expect(res.status).toBe(201);
    expect(service.uploadPhoto).toHaveBeenCalledWith('synthetic-valid-capability', expect.objectContaining({ date: '2026-11-13', meal: 'breakfast' }), expect.objectContaining({ mimetype: 'image/png', size: 15 }));
  });
  it('enforces the 10MiB upload limit before business storage', async () => {
    const body = new FormData(); body.set('date', '2026-11-13'); body.set('meal', 'lunch'); body.set('file', new Blob([new Uint8Array(10485761)], { type: 'image/png' }), 'too-large.png');
    const res = await fetch(origin + '/public/daily-check-in/photos', { method: 'POST', headers: { 'X-Daily-Check-In-Token': 'synthetic-valid-capability' }, body });
    expect(res.status).toBe(413); expect(service.uploadPhoto).not.toHaveBeenCalled();
  });
});
