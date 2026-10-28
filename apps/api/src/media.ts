import {
  BadRequestException,
  Controller,
  ConflictException,
  Delete,
  ForbiddenException,
  Get,
  HttpException,
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
import type { MediaAsset, Prisma } from '@prisma/client';
import OSS = require('ali-oss');
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';
import { CareManagementService } from './care-management';
import { canReadYuanqizhanMedia } from './yuanqizhan-media-access';
import { memberWindow, PHOTO_SLOTS } from './yuanqizhan-policy';

const URL_TTL_SECONDS = 600;
const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};
const businessMediaTypes = new Set([
  'POSTURE_PHOTO', 'EXERCISE_VIDEO', 'CONSENT_DOCUMENT', 'HEALTH_REPORT', 'OCR_SOURCE',
]);

type UploadFile = { buffer: Buffer; mimetype: string; size: number; originalname: string };
type MediaContent = {
  mimeType: string;
  fullPath?: string;
  stream?: Readable;
  statusCode?: number;
  contentLength?: string;
  contentRange?: string;
};

function hasExpectedFileSignature(buffer: Buffer, mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return buffer.length >= 5 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
    case 'image/png':
      return buffer.length >= 33
        && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        && buffer.readUInt32BE(8) === 13 && buffer.toString('ascii', 12, 16) === 'IHDR'
        && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0;
    case 'image/webp':
      return buffer.length >= 20 && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.readUInt32LE(4) + 8 === buffer.length
        && buffer.toString('ascii', 8, 12) === 'WEBP'
        && ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16));
    case 'application/pdf':
      return /^%PDF-(1\.[0-9]|2\.0)/.test(buffer.toString('ascii', 0, 8))
        && buffer.subarray(Math.max(0, buffer.length - 1024)).includes(Buffer.from('%%EOF'));
    case 'video/mp4':
      return buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp'
        && buffer.readUInt32BE(0) >= 16 && buffer.readUInt32BE(0) <= buffer.length;
    case 'video/webm':
      return buffer.length >= 8 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        && buffer.subarray(0, Math.min(buffer.length, 4096)).includes(Buffer.from('webm'));
    default:
      return false;
  }
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinical: ClinicalService,
    private readonly careManagement?: CareManagementService,
  ) {}

  private ossClient() {
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    const bucket = process.env.OSS_BUCKET;
    const region = process.env.OSS_REGION;
    if (!accessKeyId || !accessKeySecret || !bucket || !region) return null;
    return new OSS({
      accessKeyId, accessKeySecret, bucket, region,
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

  private localPath(objectKey: string) {
    const directory = this.localDirectory();
    const fullPath = resolve(directory, objectKey);
    const child = relative(directory, fullPath);
    if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) {
      throw new ForbiddenException('非法文件路径');
    }
    return fullPath;
  }

  private signature(id: string, actor: Actor, expires: number) {
    return createHmac('sha256', this.signingSecret())
      .update(JSON.stringify(['private-media-v2', id, actor.sub, actor.role, expires])).digest();
  }

  private privateUrl(id: string, actor: Actor) {
    const expires = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
    const sig = this.signature(id, actor, expires).toString('hex');
    const origin = (process.env.API_PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return origin + '/api/v1/media/' + encodeURIComponent(id) + '/content?expires=' + expires + '&sig=' + sig;
  }

  async upload(req: Request, file: UploadFile | undefined, fields: Record<string, string> = {}) {
    const actor = await this.clinical.actor(req);
    // Only a business transaction may associate a private upload with a client object.
    if (['referenceType', 'referenceId', 'healthRecordId'].some((key) => fields[key] !== undefined && fields[key] !== '')) {
      throw new BadRequestException('请先上传，再通过业务接口关联媒体');
    }
    return this.persistUpload(actor, file);
  }

  /** Only called while the activity service holds activity/member locks. */
  async uploadYuanqizhan(
    req: Request, file: UploadFile | undefined,
    context: { memberId: string; patientId: string; activityId: string; date: string; slot: string },
    tx: Prisma.TransactionClient,
  ) {
    const actor = await this.clinical.actor(req);
    if (actor.role !== 'PATIENT' || actor.sub !== context.patientId) throw new ForbiddenException('仅参与患者本人可上传活动照片');
    const member = await tx.yuanqizhanMember.findUnique({ where: { id: context.memberId }, include: { activity: true } });
    const window = member ? memberWindow(member.activity, member) : null;
    if (!member || member.patientId !== actor.sub || member.activityId !== context.activityId
      || !window?.canWrite || context.date !== window.date || window.formType !== 'milestone') {
      throw new ForbiddenException('当前无活动照片上传资格');
    }
    if (!PHOTO_SLOTS.includes(context.slot as typeof PHOTO_SLOTS[number])) {
      throw new BadRequestException('照片位置无效');
    }
    if (!file) throw new BadRequestException('请选择活动照片');
    if (file.size > 10485760) throw new BadRequestException('每张活动照片不能超过10MiB');
    // Mobile multipart clients may declare image/jpg or application/octet-stream.
    // Keep the original bytes and infer only the already supported image formats.
    const mimeType = Buffer.isBuffer(file.buffer)
      ? ['image/jpeg', 'image/png', 'image/webp'].find((candidate) => hasExpectedFileSignature(file.buffer, candidate))
      : undefined;
    if (!mimeType) throw new BadRequestException('活动照片仅支持有效的 JPG、PNG 和 WebP 图片；HEIC/HEIF 请先转为 JPG 或 PNG，文件损坏请重新选择');
    return this.persistUpload(actor, { ...file, mimetype: mimeType }, { referenceType: 'YUANQIZHAN_PHOTO', referenceId: member.id }, tx);
  }

  private async persistUpload(
    actor: Actor, file: UploadFile | undefined,
    binding?: { referenceType: 'YUANQIZHAN_PHOTO'; referenceId: string },
    database: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!file) throw new BadRequestException('请选择文件');
    const extension = mimeExtensions[file.mimetype];
    if (!extension) throw new BadRequestException('仅支持 JPG、PNG、WebP、PDF、MP4 和 WebM');
    const isVideo = file.mimetype.startsWith('video/');
    if (isVideo && !['EXERCISE_COACH', 'ADMIN'].includes(actor.role)) throw new ForbiddenException('视频仅由运动老师维护');
    const maxBytes = (isVideo ? 100 : 10) * 1024 * 1024;
    if (!Buffer.isBuffer(file.buffer) || !Number.isSafeInteger(file.size) || file.size !== file.buffer.length
      || file.size <= 0 || file.size > maxBytes) {
      throw new BadRequestException(isVideo ? '视频必须在100MB以内，且文件大小有效' : '文件必须在10MB以内，且文件大小有效');
    }
    if (!hasExpectedFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('文件内容与声明类型不符，或文件已损坏');
    }
    // Check configuration before persisting anything; never orphan a successful upload on a signing error.
    this.signingSecret();
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '/');
    const objectKey = 'weight-care/' + createHash('sha256').update(actor.sub).digest('hex').slice(0, 24)
      + '/' + day + '/' + randomUUID() + extension;
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
      const fullPath = this.localPath(objectKey);
      await mkdir(resolve(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, file.buffer, { flag: 'wx' });
      localFullPath = fullPath;
    }
    let asset: MediaAsset;
    try {
      asset = await database.mediaAsset.create({
        data: {
          ownerId: actor.sub, provider, bucket, objectKey, mimeType: file.mimetype,
          sizeBytes: BigInt(file.size), sha256, scope: 'PRIVATE', status: 'READY',
          ...(binding ? { referenceType: binding.referenceType, referenceId: binding.referenceId } : {}),
        },
      });
    } catch (error) {
      if (oss) await oss.delete(objectKey).catch(() => undefined);
      if (localFullPath) await unlink(localFullPath).catch(() => undefined);
      throw error;
    }
    // Explicit allowlist: no storage key, bucket, owner identity, hash, or raw OSS URL.
    return {
      id: asset.id, mimeType: asset.mimeType, sizeBytes: Number(asset.sizeBytes),
      status: asset.status, scope: 'PRIVATE', createdAt: asset.createdAt,
      url: this.privateUrl(asset.id, actor), expiresIn: URL_TTL_SECONDS, requiresAuthorization: true,
    };
  }

  private async authorize(actor: Actor, id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.status !== 'READY') throw new NotFoundException('文件不存在');
    if (asset.referenceType === 'YUANQIZHAN_PHOTO') {
      if (await canReadYuanqizhanMedia(this.prisma, actor, asset)) return asset;
      throw new ForbiddenException('无权访问该活动照片');
    }
    // Sensitive business media may never use upload ownership as an authorization shortcut.
    if (businessMediaTypes.has(asset.referenceType ?? '')) {
      if (this.careManagement && await this.careManagement.canAccessMedia(actor, id)) { if(actor.role==='HEALTH_MANAGER') await this.prisma.auditLog.create({data:{actorId:actor.sub,action:'HM_GLOBAL_MEDIA_READ',resourceType:'MEDIA_ASSET',resourceId:id}}); return asset; }
      throw new ForbiddenException('无权访问该文件');
    }
    if (asset.referenceType === 'HEALTH_RECORD' || asset.healthRecordId) {
      const recordId = asset.referenceId ?? asset.healthRecordId;
      if (!recordId || (asset.referenceId && asset.healthRecordId && asset.referenceId !== asset.healthRecordId)) {
        throw new ForbiddenException('媒体关联无效');
      }
      const record = await this.prisma.healthRecord.findUnique({
        where: { id: recordId }, select: { patientId: true, recordType: true },
      });
      if (!record) throw new ForbiddenException('媒体关联无效');
      if (actor.role === 'HEALTH_MANAGER') { await this.clinical.assertCare(actor, record.patientId); await this.prisma.auditLog.create({data:{actorId:actor.sub,action:'HM_GLOBAL_MEDIA_READ',resourceType:'MEDIA_ASSET',resourceId:id}}); return asset; }
      if (actor.role === 'PATIENT' && record.patientId === actor.sub) return asset;
      if (actor.role === 'NUTRITIONIST' && record.recordType !== 'DIET') {
        throw new ForbiddenException('营养师不可访问客户原始照片或附件');
      }
      if (actor.role === 'NUTRITIONIST') {
        const enrollment = await this.prisma.careEnrollment.findUnique({
          where: { patientId: record.patientId },
          select: { nutritionistId: true, patient: { select: { status: true } } },
        });
        if (enrollment && (enrollment.nutritionistId !== actor.sub || enrollment.patient.status !== 'ACTIVE')) {
          throw new ForbiddenException('该客户未分配给当前营养师或账号已停用');
        }
      }
      if (['DOCTOR', 'NUTRITIONIST'].includes(actor.role)) {
        const relation = await this.prisma.careRelation.findFirst({
          where: { patientId: record.patientId, practitionerId: actor.sub, status: 'ACTIVE' }, select: { id: true },
        });
        if (relation) return asset;
      }
      throw new ForbiddenException('无权访问该文件');
    }
    if (actor.role === 'NUTRITIONIST' && (asset.ownerId !== actor.sub || asset.referenceType || asset.referenceId)) {
      throw new ForbiddenException('营养师不可访问客户原始照片或附件');
    }
    if (asset.referenceType === 'FOLLOW_UP' && asset.referenceId) {
      const follow = await this.prisma.followUp.findUnique({ where: { id: asset.referenceId } });
      if (follow && actor.role === 'HEALTH_MANAGER') { await this.clinical.assertCare(actor, follow.patientId); await this.prisma.auditLog.create({data:{actorId:actor.sub,action:'HM_GLOBAL_MEDIA_READ',resourceType:'MEDIA_ASSET',resourceId:id}}); return asset; }
      if (follow && actor.role === 'PATIENT' && follow.patientId === actor.sub) return asset;
      if (follow && actor.role === 'DOCTOR' && follow.practitionerId === actor.sub) {
        const relation = await this.prisma.careRelation.findFirst({
          where: { patientId: follow.patientId, practitionerId: actor.sub, status: 'ACTIVE' }, select: { id: true },
        });
        if (relation) return asset;
      }
      throw new ForbiddenException('无权访问该文件');
    }
    if (asset.ownerId === actor.sub) return asset;
    throw new ForbiddenException('无权访问该文件');
  }

  // Internal OCR source reader. No public route, signed link, or supplier request.
  async readOwnedImageForOcr(actor: Actor, id: string): Promise<{ bytes: Buffer; mimeType: string }> {
    if (!['HEALTH_MANAGER', 'DOCTOR', 'PATIENT'].includes(actor.role)) throw new ForbiddenException('无权读取识别原图');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.ownerId !== actor.sub || asset.status !== 'READY') throw new ForbiddenException('请选择本人上传且可用的识别原图');
    if (asset.referenceType === 'YUANQIZHAN_PHOTO') throw new ForbiddenException('活动照片不用于识别或第三方处理');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType) || !asset.sha256 || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new BadRequestException('识别来源须为完整校验的图片');
    if (!asset.sizeBytes || Number(asset.sizeBytes) > 10 * 1024 * 1024) throw new BadRequestException('识别原图大小无效或超过10MB');
    let bytes: Buffer;
    if (asset.provider === 'LOCAL') {
      const directory = await realpath(this.localDirectory());
      const target = await realpath(this.localPath(asset.objectKey));
      const child = relative(directory, target);
      if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child)) throw new ForbiddenException('识别原图路径无效');
      const info = await stat(target);
      if (info.size !== Number(asset.sizeBytes)) throw new ConflictException('识别原图与元数据不一致');
      bytes = await readFile(target);
    } else if (asset.provider === 'ALIYUN_OSS') {
      const oss = this.ossClient();
      if (!oss) throw new ServiceUnavailableException('原件存储配置不可用');
      const result = await oss.get(asset.objectKey);
      bytes = Buffer.isBuffer(result.content) ? result.content : Buffer.from(result.content);
    } else throw new ServiceUnavailableException('识别来源存储类型不可用');
    if (bytes.length !== Number(asset.sizeBytes) || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new ConflictException('识别原图校验失败，请重新上传');
    return { bytes, mimeType: asset.mimeType };
  }

  async signedUrl(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const asset = await this.authorize(actor, id);
    return { id, mimeType: asset.mimeType, url: this.privateUrl(id, actor), expiresIn: URL_TTL_SECONDS, requiresAuthorization: true };
  }

  // Despite the legacy name, this serves LOCAL and OSS through the same authenticated route.
  async localFile(req: Request, id: string, expiresText: string, signature: string): Promise<MediaContent> {
    const actor = await this.clinical.actor(req);
    const now = Math.floor(Date.now() / 1000);
    const expires = Number(expiresText);
    if (!/^\d+$/.test(expiresText ?? '') || !Number.isSafeInteger(expires) || expires <= now || expires > now + URL_TTL_SECONDS) {
      throw new ForbiddenException('文件链接已过期或无效');
    }
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) throw new ForbiddenException('文件签名无效');
    const expected = this.signature(id, actor, expires);
    const received = Buffer.from(signature, 'hex');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new ForbiddenException('文件签名无效');
    // Repeat object authorization on every content request. Ending an assignment invalidates an already issued URL.
    const asset = await this.authorize(actor, id);
    if (asset.provider === 'LOCAL') return { fullPath: this.localPath(asset.objectKey), mimeType: asset.mimeType };
    if (asset.provider !== 'ALIYUN_OSS') throw new ServiceUnavailableException('未知媒体存储类型');
    const oss = this.ossClient();
    if (!oss) throw new ServiceUnavailableException('OSS 配置不完整');
    const range = req.headers.range;
    if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range)) throw new BadRequestException('仅支持单段文件范围请求');
    try {
      const result = await oss.getStream(asset.objectKey, { headers: range ? { Range: range } : {} });
      if (!result.stream || ![200, 206].includes(result.res.status)) throw new ServiceUnavailableException('文件读取失败');
      return {
        stream: result.stream as Readable, mimeType: asset.mimeType, statusCode: result.res.status,
        contentLength: (result.res.headers as Record<string, string | undefined>)['content-length'], contentRange: (result.res.headers as Record<string, string | undefined>)['content-range'],
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const storageError = error as { code?: string; status?: number };
      if (storageError.code === 'NoSuchKey' || storageError.status === 404) throw new NotFoundException('文件不存在');
      if (storageError.status === 416) throw new HttpException('文件范围无效', 416);
      throw new ServiceUnavailableException('媒体存储暂时不可用，请重试');
    }
  }

  async remove(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.ownerId !== actor.sub) throw new NotFoundException('文件不存在');
    if (asset.referenceType || asset.referenceId || asset.healthRecordId) {
      throw new ForbiddenException('已关联客户档案或报告的媒体不能直接删除');
    }
    if (asset.status === 'DELETED') return { deleted: true, id };
    // Claim the unbound asset atomically, so a concurrent business binding wins safely.
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.mediaAsset.updateMany({
        where: { id, ownerId: actor.sub, status: 'READY', referenceType: null, referenceId: null, healthRecordId: null },
        data: { status: 'DELETED', deletedAt: new Date(), url: null },
      });
      if (changed.count !== 1) throw new ForbiddenException('文件已被关联或不可删除');
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'MEDIA_DELETE', resourceType: 'MEDIA_ASSET', resourceId: id } });
    });
    return { archived: true, retained: true, deleted: true, id, retention: 'LONG_TERM_ORIGINAL', legalDeletionRequiresReview: true };
  }
}

@Controller('media')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }))
  upload(@Req() req: Request, @UploadedFile() file: UploadFile | undefined) {
    return this.service.upload(req, file, req.body as Record<string, string>);
  }

  @Get(':id/url')
  signedUrl(@Req() req: Request, @Param('id') id: string) { return this.service.signedUrl(req, id); }

  @Get(':id/content')
  async content(
    @Req() req: Request, @Param('id') id: string,
    @Query('expires') expires: string, @Query('sig') sig: string, @Res() res: Response,
  ) {
    const file = await this.service.localFile(req, id, expires, sig);
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', (file.mimeType === 'application/pdf' ? 'attachment' : 'inline')
      + '; filename="attachment' + (mimeExtensions[file.mimeType] ?? '.bin') + '"');
    res.type(file.mimeType);
    if (file.fullPath) return res.sendFile(file.fullPath, { dotfiles: 'allow' });
    if (!file.stream) throw new ServiceUnavailableException('文件读取失败');
    res.status(file.statusCode ?? 200);
    if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
    if (file.contentRange) res.setHeader('Content-Range', file.contentRange);
    res.setHeader('Accept-Ranges', 'bytes');
    await pipeline(file.stream, res);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req, id); }
}
