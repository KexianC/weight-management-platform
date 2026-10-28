import { ForbiddenException } from '@nestjs/common';
import { MediaService } from './media';
import type { Actor } from './auth';
import type { Request } from 'express';

const request = { headers: {} } as Request;
const asset = { id: 'photo-a', ownerId: 'patient-a', status: 'READY', referenceType: 'YUANQIZHAN_PHOTO', referenceId: 'member-a', healthRecordId: null, mimeType: 'image/png', provider: 'LOCAL', objectKey: 'synthetic/photo-a.png' };
const actor = (role: Actor['role'], sub = 'staff-a'): Actor => ({ role, sub, typ: 'access', jti: 'synthetic' });
function setup(current: Actor) {
  const users = new Map<string, any>([
    ['patient-a', { role: 'PATIENT', status: 'ACTIVE' }],
    ['staff-a', { role: current.role, status: 'ACTIVE' }],
  ]);
  const db = {
    mediaAsset: { findUnique: jest.fn().mockResolvedValue(asset) },
    user: { findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    careRelation: { findFirst: jest.fn().mockResolvedValue({ id: 'relation-a' }) },
    careEnrollment: { findUnique: jest.fn().mockResolvedValue(null) },
    yuanqizhanPhoto: { findUnique: jest.fn().mockResolvedValue({ memberId: 'member-a', member: { patientId: 'patient-a' } }) },
  };
  return { db, users, service: new MediaService(db as any, { actor: jest.fn().mockResolvedValue(current) } as any) };
}
describe('activity media url and content routes', () => {
  const previousSecret = process.env.MEDIA_SIGNING_SECRET;
  beforeAll(() => { process.env.MEDIA_SIGNING_SECRET = 'synthetic-yuanqizhan-test-secret-32-characters'; });
  afterAll(() => { if (previousSecret === undefined) delete process.env.MEDIA_SIGNING_SECRET; else process.env.MEDIA_SIGNING_SECRET = previousSecret; });
  it.each(['DOCTOR', 'NUTRITIONIST'] as const)('rechecks current %s care authorization after issuing a signed link', async (role) => {
    const { db, service } = setup(actor(role));
    const signed = await service.signedUrl(request, asset.id);
    const url = new URL(signed.url);
    db.careRelation.findFirst.mockResolvedValue(null as any);
    await expect(service.localFile(request, asset.id, url.searchParams.get('expires')!, url.searchParams.get('sig')!)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['ADMIN', 'EXERCISE_COACH'] as const)('does not give %s a link via upload ownership', async (role) => {
    const { db, service } = setup(actor(role, 'patient-a'));
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.careRelation.findFirst).not.toHaveBeenCalled();
  });
  it('allows a bound nutritionist to load an activity original through its authenticated signed route', async () => {
    const { service } = setup(actor('NUTRITIONIST'));
    const signed = await service.signedUrl(request, asset.id);
    const url = new URL(signed.url);
    const content = await service.localFile(request, asset.id, url.searchParams.get('expires')!, url.searchParams.get('sig')!);
    expect(content.mimeType).toBe('image/png'); expect(content.fullPath).toContain('photo-a.png');
  });
  it('rejects a nutrient whose managed assignment changes after a signed link was issued', async () => {
    const { db, service } = setup(actor('NUTRITIONIST'));
    db.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: 'staff-a' } as any);
    const signed = await service.signedUrl(request, asset.id), url = new URL(signed.url);
    db.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: 'staff-b' } as any);
    await expect(service.localFile(request, asset.id, url.searchParams.get('expires')!, url.searchParams.get('sig')!)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['staff-a', 'patient-a'])('rechecks disabled %s before serving a previously signed activity original', async (id) => {
    const { users, service } = setup(actor('NUTRITIONIST'));
    const signed = await service.signedUrl(request, asset.id), url = new URL(signed.url);
    users.get(id).status = 'DISABLED';
    await expect(service.localFile(request, asset.id, url.searchParams.get('expires')!, url.searchParams.get('sig')!)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects unbound nutritionists before producing a media link', async () => {
    const { db, service } = setup(actor('NUTRITIONIST'));
    db.careRelation.findFirst.mockResolvedValue(null as any);
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('keeps activity access from authorizing unrelated health-record originals', async () => {
    const { db, service } = setup(actor('NUTRITIONIST'));
    db.mediaAsset.findUnique.mockResolvedValue({ ...asset, referenceType: 'HEALTH_RECORD', referenceId: 'other-record' } as any);
    (db as any).healthRecord = { findUnique: jest.fn().mockResolvedValue({ id: 'other-record', patientId: 'patient-a', recordType: 'WEIGHT' }) };
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('retains patient access without an active activity membership or a service relationship', async () => {
    const { db, service } = setup(actor('PATIENT', 'patient-a'));
    db.careRelation.findFirst.mockResolvedValue(null as any);
    const signed = await service.signedUrl(request, asset.id);
    const url = new URL(signed.url);
    const content = await service.localFile(request, asset.id, url.searchParams.get('expires')!, url.searchParams.get('sig')!);
    expect(content.mimeType).toBe('image/png');
    expect(content.fullPath).toContain('photo-a.png');
  });
  it('keeps originals from generic deletion and OCR reads', async () => {
    const { service } = setup(actor('PATIENT', 'patient-a'));
    await expect(service.remove(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.readOwnedImageForOcr(actor('PATIENT', 'patient-a'), asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
