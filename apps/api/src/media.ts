import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MediaAsset } from '@prisma/client';
import OSS = require('ali-oss');
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { Request, Response } from 'express';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

type UploadFile = { buffer: Buffer; mimetype: string; size: number; originalname: string };

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private ossClient() {
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    const bucket = process.env.OSS_BUCKET;
    const region = process.env.OSS_REGION;
    if (!accessKeyId || !accessKeySecret || !bucket || !region) return null;
    return new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
      endpoint: process.env.OSS_ENDPOINT,
      secure: true,
      authorizationV4: true,
    });
  }

  private signingSecret() {
    const secret = process.env.MEDIA_SIGNING_SECRET ?? process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) throw new ServiceUnavailableException('媒体签名密钥未配置');
    return secret;
  }

  private localDirectory() {
    return resolve(process.env.MEDIA_LOCAL_DIR ?? resolve(process.cwd(), 'uploads'));
  }

  private localUrl(id: string) {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const sig = createHmac('sha256', this.signingSecret()).update(`${id}.${expires}`).digest('hex');
    const origin = (process.env.API_PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return `${origin}/api/v1/media/${id}/content?expires=${expires}&sig=${sig}`;
  }

  async upload(req: Request, file: UploadFile | undefined, fields: Record<string, string>) {
    const actor = await this.clinical.actor(req);
    if (!file) throw new BadRequestException('请选择文件');
    const extension = mimeExtensions[file.mimetype];
    if (!extension) throw new BadRequestException('仅支持 JPG、PNG、WebP 和 PDF');
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new BadRequestException('文件大小必须在 10MB 以内');
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '/');
    const objectKey = `weight-care/${actor.sub}/${day}/${randomUUID()}${extension}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const oss = this.ossClient();
    let provider = 'LOCAL';
    let bucket: string | undefined;
    let localFullPath: string | undefined;
    if (oss) {
      await oss.put(objectKey, file.buffer, { mime: file.mimetype });
      provider = 'ALIYUN_OSS';
      bucket = process.env.OSS_BUCKET;
    } else {
      const directory = this.localDirectory();
      const fullPath = resolve(directory, objectKey);
      if (!fullPath.startsWith(`${directory}\\`) && !fullPath.startsWith(`${directory}/`)) throw new ForbiddenException('非法文件路径');
      await mkdir(resolve(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, file.buffer, { flag: 'wx' });
      localFullPath = fullPath;
    }
    let asset: MediaAsset;
    try {
      asset = await this.prisma.mediaAsset.create({
        data: {
          ownerId: actor.sub,
          provider,
          bucket,
          objectKey,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          sha256,
          scope: fields.scope ?? 'FOLLOW_UP',
          referenceType: fields.referenceType,
          referenceId: fields.referenceId,
          status: 'READY',
        },
      });
    } catch (error) {
      if (oss) await oss.delete(objectKey).catch(() => undefined);
      if (localFullPath) await unlink(localFullPath).catch(() => undefined);
      throw error;
    }
    const url = await this.signedUrlForAsset(asset);
    return { ...asset, sizeBytes: Number(asset.sizeBytes), url };
  }

  private async signedUrlForAsset(asset: { id: string; provider: string; objectKey: string; status: string }) {
    if (asset.status !== 'READY') throw new NotFoundException('文件不可用');
    if (asset.provider === 'ALIYUN_OSS') {
      const oss = this.ossClient();
      if (!oss) throw new ServiceUnavailableException('OSS 配置不可用');
      return oss.signatureUrlV4('GET', 600, undefined, asset.objectKey);
    }
    return this.localUrl(asset.id);
  }

  private async authorize(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.status !== 'READY') throw new NotFoundException('文件不存在');
    if (asset.ownerId === actor.sub) return asset;
    if (asset.referenceType === 'FOLLOW_UP' && asset.referenceId) {
      const follow = await this.prisma.followUp.findUnique({ where: { id: asset.referenceId } });
      if (follow && [follow.patientId, follow.practitionerId].includes(actor.sub)) return asset;
    }
    throw new ForbiddenException('无权访问该文件');
  }

  async signedUrl(req: Request, id: string) {
    const asset = await this.authorize(req, id);
    return { id, url: await this.signedUrlForAsset(asset), expiresIn: 600 };
  }

  async localFile(id: string, expiresText: string, signature: string) {
    const expires = Number(expiresText);
    if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) throw new ForbiddenException('文件链接已过期');
    const expected = createHmac('sha256', this.signingSecret()).update(`${id}.${expires}`).digest();
    let received: Buffer;
    try { received = Buffer.from(signature, 'hex'); } catch { throw new ForbiddenException('文件签名无效'); }
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new ForbiddenException('文件签名无效');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.provider !== 'LOCAL' || asset.status !== 'READY') throw new NotFoundException('文件不存在');
    const directory = this.localDirectory();
    const fullPath = resolve(directory, asset.objectKey);
    if (!fullPath.startsWith(`${directory}\\`) && !fullPath.startsWith(`${directory}/`)) throw new ForbiddenException('非法文件路径');
    return { fullPath, mimeType: asset.mimeType };
  }

  async remove(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.ownerId !== actor.sub) throw new NotFoundException('文件不存在');
    if (asset.status === 'DELETED') return { deleted: true, id };
    if (asset.provider === 'ALIYUN_OSS') {
      const oss = this.ossClient();
      if (!oss) throw new ServiceUnavailableException('OSS 配置不可用');
      await oss.delete(asset.objectKey);
    } else {
      const directory = this.localDirectory();
      const fullPath = resolve(directory, asset.objectKey);
      if (fullPath.startsWith(`${directory}\\`) || fullPath.startsWith(`${directory}/`)) await unlink(fullPath).catch(() => undefined);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date(), url: null } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'MEDIA_DELETE', resourceType: 'MEDIA_ASSET', resourceId: id } });
    });
    return { deleted: true, id };
  }
}

@Controller('media')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  upload(@Req() req: Request, @UploadedFile() file: UploadFile | undefined) {
    return this.service.upload(req, file, req.body as Record<string, string>);
  }

  @Get(':id/url')
  signedUrl(@Req() req: Request, @Param('id') id: string) { return this.service.signedUrl(req, id); }

  @Get(':id/content')
  async content(@Param('id') id: string, @Query('expires') expires: string, @Query('sig') sig: string, @Res() res: Response) {
    const file = await this.service.localFile(id, expires, sig);
    res.type(file.mimeType);
    return res.sendFile(file.fullPath);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req, id); }
}
