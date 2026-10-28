import {
  BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Actor } from './auth';
import type { CareManagementService } from './care-management';
import type { ClinicalService } from './clinical';
import type { PrismaService } from './prisma.service';
import { MediaService } from './media';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFasAAAAASUVORK5CYII=', 'base64');
const request = { headers: { authorization: 'Bearer fictional-unit-access' } } as Request;
const uploadFile = (buffer = png, mimetype = 'image/png') => ({
  buffer, mimetype, size: buffer.length, originalname: '../../fictional-private.png',
});
const baseAsset = {
  id: 'asset-test', ownerId: 'patient-test', status: 'READY', provider: 'LOCAL',
  objectKey: 'fictional/asset.png', mimeType: 'image/png', sizeBytes: BigInt(png.length), scope: 'PRIVATE',
  referenceType: null, referenceId: null, healthRecordId: null, createdAt: new Date('2026-01-01T00:00:00Z'),
};
const actorFor = (role: Actor['role'], sub = role === 'PATIENT' ? 'patient-test' : 'staff-test'): Actor => ({
  sub, role, typ: 'access', jti: 'fictional-unit-session',
});
const queryFor = (url: string) => {
  const parsed = new URL(url);
  return [parsed.searchParams.get('expires')!, parsed.searchParams.get('sig')!] as const;
};

describe('private reconstruction media', () => {
  let actor: Actor;
  let asset: Omit<typeof baseAsset, 'referenceType' | 'referenceId' | 'healthRecordId'> & { referenceType: string | null; referenceId: string | null; healthRecordId: string | null };
  let prisma: any;
  let clinical: { actor: jest.Mock };
  let care: { canAccessMedia: jest.Mock };
  let service: MediaService;
  let directory: string;
  let previousDirectory: string | undefined;
  let previousSecret: string | undefined;
  let previousOrigin: string | undefined;

  beforeEach(async () => {
    actor = actorFor('PATIENT');
    asset = { ...baseAsset };
    directory = await mkdtemp(join(tmpdir(), 'reconstruction-media-test-'));
    previousDirectory = process.env.MEDIA_LOCAL_DIR;
    previousSecret = process.env.MEDIA_SIGNING_SECRET;
    previousOrigin = process.env.API_PUBLIC_URL;
    process.env.MEDIA_LOCAL_DIR = directory;
    process.env.MEDIA_SIGNING_SECRET = 'fictional-unit-only-signing-key-longer-than-32';
    process.env.API_PUBLIC_URL = 'http://localhost:3000';
    prisma = {
      mediaAsset: {
        findUnique: jest.fn(async () => asset),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseAsset, ...data })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      healthRecord: { findUnique: jest.fn(async () => ({ patientId: 'patient-test', recordType: 'DIET' })) },
      careEnrollment: { findUnique: jest.fn(async () => null) },
      careRelation: { findFirst: jest.fn(async () => ({ id: 'assigned-test' })) },
      followUp: { findUnique: jest.fn(async () => ({ patientId: 'patient-test', practitionerId: 'staff-test' })) },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (callback: (client: any) => Promise<unknown>) => callback(prisma)),
    };
    clinical = { actor: jest.fn(async (req: Request) => {
      if (!req.headers?.authorization) throw new UnauthorizedException();
      return actor;
    }) };
    care = { canAccessMedia: jest.fn(async () => false) };
    service = new MediaService(prisma as PrismaService, clinical as unknown as ClinicalService, care as unknown as CareManagementService);
    jest.spyOn(service as any, 'ossClient').mockReturnValue(null);
  });

  afterEach(async () => {
    if (previousDirectory === undefined) delete process.env.MEDIA_LOCAL_DIR;
    else process.env.MEDIA_LOCAL_DIR = previousDirectory;
    if (previousSecret === undefined) delete process.env.MEDIA_SIGNING_SECRET;
    else process.env.MEDIA_SIGNING_SECRET = previousSecret;
    if (previousOrigin === undefined) delete process.env.API_PUBLIC_URL;
    else process.env.API_PUBLIC_URL = previousOrigin;
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('accepts a fictional PNG, forces private unbound storage, and returns no storage or owner metadata', async () => {
    const result = await service.upload(request, uploadFile(), { scope: 'PUBLIC', ownerId: 'forged-user' });
    expect(result).toEqual(expect.objectContaining({ id: 'asset-test', scope: 'PRIVATE', requiresAuthorization: true }));
    for (const forbidden of ['ownerId', 'objectKey', 'bucket', 'provider', 'sha256', 'referenceId']) {
      expect(result).not.toHaveProperty(forbidden);
    }
    const data = prisma.mediaAsset.create.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ ownerId: 'patient-test', scope: 'PRIVATE', sizeBytes: BigInt(png.length) }));
    expect(data).not.toHaveProperty('referenceType');
    expect(data.objectKey).not.toContain('patient-test');
    expect(data.objectKey).not.toContain('..');
    expect(result.url).toContain('/api/v1/media/asset-test/content?');
  });

  it.each(['HEALTH_RECORD', 'FOLLOW_UP', 'POSTURE_PHOTO', 'EXERCISE_VIDEO', 'CONSENT_DOCUMENT', 'HEALTH_REPORT', 'OCR_SOURCE', 'UNRECOGNIZED'])(
    'rejects forged upload binding %s before persistence', async (referenceType) => {
      await expect(service.upload(request, uploadFile(), { referenceType, referenceId: 'other-patient' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.mediaAsset.create).not.toHaveBeenCalled();
      expect(await readdir(directory)).toEqual([]);
    },
  );

  it.each([{ referenceId: 'other-record', healthRecordId: '' }, { healthRecordId: 'other-record', referenceId: '' }])('rejects standalone client binding %j', async (fields) => {
    await expect(service.upload(request, uploadFile(), fields)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm'])(
    'rejects an HTML payload falsely labelled as %s', async (mimetype) => {
      actor = actorFor('EXERCISE_COACH');
      await expect(service.upload(request, uploadFile(Buffer.from('<html>fictional</html>'), mimetype), {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.mediaAsset.create).not.toHaveBeenCalled();
    },
  );

  it('rejects unsupported MIME, empty files, mismatched size, and oversized images', async () => {
    await expect(service.upload(request, uploadFile(png, 'image/svg+xml'), {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(request, uploadFile(Buffer.alloc(0)), {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(request, { ...uploadFile(), size: png.length + 1 }, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(request, uploadFile(Buffer.alloc(10 * 1024 * 1024 + 1)), {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['PATIENT', 'NUTRITIONIST', 'DOCTOR', 'HEALTH_MANAGER'] as const)('denies video upload for %s', async (role) => {
    actor = actorFor(role);
    await expect(service.upload(request, uploadFile(Buffer.from('fictional-video'), 'video/mp4'), {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cleans up a local file when database persistence fails', async () => {
    prisma.mediaAsset.create.mockRejectedValue(new Error('fictional database unavailable'));
    await expect(service.upload(request, uploadFile(), {})).rejects.toThrow('fictional database unavailable');
    const files = await readdir(directory, { recursive: true });
    expect(files.some((file) => String(file).endsWith('.png'))).toBe(false);
  });

  it('allows only the assigned nutritionist to read DIET images without additional doctor approval', async () => {
    actor = actorFor('NUTRITIONIST');
    asset.referenceType = 'HEALTH_RECORD';
    asset.referenceId = 'diet-test';
    asset.healthRecordId = 'diet-test';
    await expect(service.signedUrl(request, asset.id)).resolves.toEqual(expect.objectContaining({ requiresAuthorization: true }));
    expect(prisma.healthRecord.findUnique).toHaveBeenCalledWith({
      where: { id: 'diet-test' }, select: { patientId: true, recordType: true },
    });
    expect(prisma.careRelation.findFirst).toHaveBeenCalledWith({
      where: { patientId: 'patient-test', practitionerId: 'staff-test', status: 'ACTIVE' }, select: { id: true },
    });
    prisma.careRelation.findFirst.mockResolvedValue(null);
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires the current managed nutrition assignment as well as an ACTIVE clinical relation', async () => {
    actor = actorFor('NUTRITIONIST');
    asset.referenceType = 'HEALTH_RECORD';
    asset.referenceId = 'diet-test';
    prisma.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: 'another-staff', patient: { status: 'ACTIVE' } });
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.careRelation.findFirst).not.toHaveBeenCalled();
    prisma.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: actor.sub, patient: { status: 'DISABLED' } });
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: actor.sub, patient: { status: 'ACTIVE' } });
    await expect(service.signedUrl(request, asset.id)).resolves.toHaveProperty('url');
    prisma.careRelation.findFirst.mockResolvedValue(null);
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('invalidates a previously issued DIET URL after managed nutrition reassignment despite a stale ACTIVE relation', async () => {
    actor = actorFor('NUTRITIONIST');
    asset.referenceType = 'HEALTH_RECORD';
    asset.referenceId = 'diet-test';
    prisma.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: actor.sub, patient: { status: 'ACTIVE' } });
    const [expires, sig] = queryFor((await service.signedUrl(request, asset.id)).url);
    prisma.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: 'another-staff', patient: { status: 'ACTIVE' } });
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['WEIGHT', 'BODY_COMPOSITION', 'EXERCISE', 'REPORT', 'OTHER'])(
    'denies nutritionist access to non-DIET %s originals, even if upload owner', async (recordType) => {
      actor = actorFor('NUTRITIONIST');
      asset.ownerId = actor.sub;
      asset.referenceType = 'HEALTH_RECORD';
      asset.referenceId = 'record-test';
      prisma.healthRecord.findUnique.mockResolvedValue({ patientId: 'patient-test', recordType });
      await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.careRelation.findFirst).not.toHaveBeenCalled();
    },
  );

  it('rejects an inconsistent health-record binding and a deleted/missing record', async () => {
    asset.referenceType = 'HEALTH_RECORD';
    asset.referenceId = 'record-A';
    asset.healthRecordId = 'record-B';
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
    asset.healthRecordId = 'record-A';
    prisma.healthRecord.findUnique.mockResolvedValue(null);
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['POSTURE_PHOTO', 'EXERCISE_VIDEO', 'CONSENT_DOCUMENT', 'HEALTH_REPORT', 'OCR_SOURCE'])(
    'delegates %s to business access rules before any owner shortcut', async (referenceType) => {
      asset.referenceType = referenceType;
      asset.referenceId = 'business-test';
      await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect(care.canAccessMedia).toHaveBeenCalledWith(actor, asset.id);
      care.canAccessMedia.mockResolvedValue(true);
      await expect(service.signedUrl(request, asset.id)).resolves.toHaveProperty('url');
    },
  );

  it('denies unrelated actors and nutritionist access to another owner unbound original', async () => {
    actor = actorFor('PATIENT', 'another-patient');
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
    actor = actorFor('NUTRITIONIST');
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies an unknown legacy linked original for a nutritionist even when they uploaded it', async () => {
    actor = actorFor('NUTRITIONIST');
    asset.ownerId = actor.sub;
    asset.referenceType = 'LEGACY_ORIGINAL';
    asset.referenceId = 'client-original-test';
    await expect(service.signedUrl(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires authenticated identity and binds even a valid URL to the issuing actor', async () => {
    const { url } = await service.signedUrl(request, asset.id);
    const [expires, sig] = queryFor(url);
    await expect(service.localFile({ headers: {} } as Request, asset.id, expires, sig)).rejects.toBeInstanceOf(UnauthorizedException);
    actor = actorFor('PATIENT', 'another-patient');
    asset.ownerId = actor.sub;
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.toBeInstanceOf(ForbiddenException);
    actor = actorFor('PATIENT');
    asset.ownerId = actor.sub;
    await expect(service.localFile(request, asset.id, expires, sig)).resolves.toHaveProperty('fullPath');
  });

  it('rechecks the current relation when downloading, invalidating a previously issued URL after reassignment', async () => {
    actor = actorFor('NUTRITIONIST');
    asset.referenceType = 'HEALTH_RECORD';
    asset.referenceId = 'diet-test';
    const { url } = await service.signedUrl(request, asset.id);
    const [expires, sig] = queryFor(url);
    prisma.careRelation.findFirst.mockResolvedValue(null);
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechecks business access on download after report-share revocation', async () => {
    asset.referenceType = 'EXERCISE_VIDEO';
    care.canAccessMedia.mockResolvedValue(true);
    const { url } = await service.signedUrl(request, asset.id);
    const [expires, sig] = queryFor(url);
    care.canAccessMedia.mockResolvedValue(false);
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects expired, overlong, malformed, truncated, and tampered signatures', async () => {
    const { url } = await service.signedUrl(request, asset.id);
    const [expires, sig] = queryFor(url);
    for (const invalidExpires of ['0', '-1', '1.5', '', String(Number(expires) + 601)]) {
      await expect(service.localFile(request, asset.id, invalidExpires, sig)).rejects.toBeInstanceOf(ForbiddenException);
    }
    for (const invalidSig of ['', 'gg'.repeat(32), sig.slice(0, -2), (sig[0] === '0' ? '1' : '0') + sig.slice(1), sig + '00']) {
      await expect(service.localFile(request, asset.id, expires, invalidSig)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('rejects a signed URL after asset deletion and prevents local traversal outside storage', async () => {
    const { url } = await service.signedUrl(request, asset.id);
    const [expires, sig] = queryFor(url);
    asset.status = 'DELETED';
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.toBeInstanceOf(NotFoundException);
    asset.status = 'READY';
    asset.objectKey = '../outside.png';
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never emits a raw OSS URL and proxies fictional OSS bytes after authorization', async () => {
    asset.provider = 'ALIYUN_OSS';
    asset.objectKey = 'private-object-test.png';
    const bytes = Readable.from(png);
    const oss = {
      getStream: jest.fn(async () => ({ stream: bytes, res: { status: 200, headers: { 'content-length': String(png.length) } } })),
      signatureUrlV4: jest.fn(() => 'https://must-never-be-returned.invalid/raw'),
    };
    (service as any).ossClient.mockReturnValue(oss);
    const { url } = await service.signedUrl(request, asset.id);
    expect(url).toMatch(/^http:\/\/localhost:3000\/api\/v1\/media\/asset-test\/content\?/);
    expect(oss.signatureUrlV4).not.toHaveBeenCalled();
    const [expires, sig] = queryFor(url);
    const content = await service.localFile(request, asset.id, expires, sig);
    expect(content).toEqual(expect.objectContaining({ stream: bytes, mimeType: 'image/png' }));
    expect(oss.getStream).toHaveBeenCalledWith('private-object-test.png', { headers: {} });
  });

  it('supports a single OSS byte range and sanitizes unavailable storage errors', async () => {
    asset.provider = 'ALIYUN_OSS';
    const oss = { getStream: jest.fn(async () => ({
      stream: Readable.from(png.subarray(0, 5)),
      res: { status: 206, headers: { 'content-length': '5', 'content-range': 'bytes 0-4/68' } },
    })) };
    (service as any).ossClient.mockReturnValue(oss);
    const [expires, sig] = queryFor((await service.signedUrl(request, asset.id)).url);
    const rangeReq = { headers: { ...request.headers, range: 'bytes=0-4' } } as Request;
    await expect(service.localFile(rangeReq, asset.id, expires, sig)).resolves.toEqual(expect.objectContaining({ statusCode: 206, contentRange: 'bytes 0-4/68' }));
    expect(oss.getStream).toHaveBeenCalledWith(asset.objectKey, { headers: { Range: 'bytes=0-4' } });
    await expect(service.localFile({ headers: { ...request.headers, range: 'bytes=0-4,10-20' } } as Request, asset.id, expires, sig)).rejects.toBeInstanceOf(BadRequestException);
    oss.getStream.mockRejectedValue(new Error('fictional upstream sensitive details'));
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.localFile(request, asset.id, expires, sig)).rejects.not.toThrow('sensitive details');
  });

  it.each(['POSTURE_PHOTO', 'EXERCISE_VIDEO', 'CONSENT_DOCUMENT', 'HEALTH_REPORT', 'OCR_SOURCE', 'HEALTH_RECORD', 'FOLLOW_UP'])(
    'rejects direct deletion of %s history', async (referenceType) => {
      asset.referenceType = referenceType;
      await expect(service.remove(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('atomically rejects deleting an asset bound after the initial read', async () => {
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(request, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: { id: 'asset-test', ownerId: 'patient-test', status: 'READY', referenceType: null, referenceId: null, healthRecordId: null },
      data: expect.objectContaining({ status: 'DELETED', url: null }),
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
