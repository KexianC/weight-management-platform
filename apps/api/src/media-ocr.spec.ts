import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaService } from './media';
import type { Actor } from './auth';

const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFasAAAAASUVORK5CYII=', 'base64');
const actor = { sub: 'synthetic-owner', role: 'PATIENT', typ: 'access', jti: 'synthetic-test' } as Actor;
describe('OCR internal original bytes', () => {
  let directory: string;
  let prior: string | undefined;
  let asset: any;
  let service: MediaService;
  beforeEach(async () => {
    prior = process.env.MEDIA_LOCAL_DIR;
    directory = await mkdtemp(join(tmpdir(), 'rebuild-ocr-media-'));
    process.env.MEDIA_LOCAL_DIR = directory;
    await mkdir(join(directory, 'synthetic'));
    await writeFile(join(directory, 'synthetic', 'report.png'), bytes);
    asset = { id: 'synthetic-asset', ownerId: actor.sub, status: 'READY', deletedAt: null,
      provider: 'LOCAL', mimeType: 'image/png', objectKey: 'synthetic/report.png', sizeBytes: BigInt(bytes.length),
      sha256: createHash('sha256').update(bytes).digest('hex') };
    service = new MediaService({ mediaAsset: { findUnique: async () => asset } } as any, {} as any, {} as any);
  });
  afterEach(async () => {
    if (prior === undefined) delete process.env.MEDIA_LOCAL_DIR; else process.env.MEDIA_LOCAL_DIR = prior;
    await rm(directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  it('loads the actual original buffer after hash and size verification', async () => {
    expect(await service.readOwnedImageForOcr(actor, asset.id)).toEqual({ bytes, mimeType: 'image/png' });
  });
  it.each([
    ['NUTRITIONIST', actor.sub, 'READY'], ['EXERCISE_COACH', actor.sub, 'READY'],
    ['HEALTH_MANAGER', 'another-owner', 'READY'], ['PATIENT', actor.sub, 'DELETED'],
  ])('denies a disallowed role, owner or state without returning bytes', async (role, ownerId, status) => {
    asset.ownerId = ownerId; asset.status = status;
    await expect(service.readOwnedImageForOcr({ ...actor, role } as Actor, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects non-image metadata', async () => {
    asset.mimeType = 'application/pdf';
    await expect(service.readOwnedImageForOcr(actor, asset.id)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects traversal metadata', async () => {
    asset.objectKey = '../outside.png';
    await expect(service.readOwnedImageForOcr(actor, asset.id)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('detects a same-size original whose bytes no longer match the recorded SHA', async () => {
    const damaged = Buffer.from(bytes); damaged[damaged.length-1] ^= 1;
    await writeFile(join(directory, 'synthetic', 'report.png'), damaged);
    await expect(service.readOwnedImageForOcr(actor, asset.id)).rejects.toBeInstanceOf(ConflictException);
  });
  it('checks the size before reading bytes', async () => {
    asset.sizeBytes = BigInt(bytes.length+1);
    await expect(service.readOwnedImageForOcr(actor, asset.id)).rejects.toBeInstanceOf(ConflictException);
  });
});
