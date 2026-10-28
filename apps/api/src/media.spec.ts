import { MediaService } from './media';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { ClinicalService } from './clinical';
import type { PrismaService } from './prisma.service';
import type { CareManagementService } from './care-management';

describe('care media boundaries', () => {
  const request = {} as Request;
  const actor = { sub: 'nutrition-1', role: 'NUTRITIONIST', typ: 'access', jti: 'test' } as const;
  const clinical = { actor: jest.fn().mockResolvedValue(actor) } as unknown as ClinicalService;

  it('does not let ownership bypass posture-photo role restrictions', async () => {
    const prisma = { mediaAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'photo-1', ownerId: actor.sub, status: 'READY', referenceType: 'POSTURE_PHOTO' }) } } as unknown as PrismaService;
    const care = { canAccessMedia: jest.fn().mockResolvedValue(false) } as unknown as CareManagementService;
    await expect(new MediaService(prisma, clinical, care).signedUrl(request, 'photo-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(care.canAccessMedia).toHaveBeenCalledWith(actor, 'photo-1');
  });

  it('denies raw legacy patient media before care-relation fallback', async () => {
    const prisma = { mediaAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'photo-1', ownerId: 'patient-1', status: 'READY', referenceType: 'LEGACY_ORIGINAL', referenceId: 'record-1' }) } } as unknown as PrismaService;
    await expect(new MediaService(prisma, clinical).signedUrl(request, 'photo-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects forged business bindings before writing media', async () => {
    const service = new MediaService({} as PrismaService, clinical);
    await expect(service.upload(request, { buffer: Buffer.from('x'), mimetype: 'image/png', size: 1, originalname: 'photo.png' }, { referenceType: 'POSTURE_PHOTO', referenceId: 'patient-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps published library assets from direct deletion', async () => {
    const prisma = { mediaAsset: { findUnique: jest.fn().mockResolvedValue({ id: 'video-1', ownerId: actor.sub, status: 'READY', referenceType: 'EXERCISE_VIDEO' }) } } as unknown as PrismaService;
    await expect(new MediaService(prisma, clinical).remove(request, 'video-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
