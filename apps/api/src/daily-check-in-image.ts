import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { Sharp } from 'sharp';
import { DAILY_PHOTO_MAX_BYTES } from './daily-check-in-photo-policy';
// This package uses CommonJS without esModuleInterop; sharp's actual CJS export is callable.
const sharp: typeof import('sharp')['default'] = require('sharp');

// Daily meal photographs only. Keep all persistence on the original upload Buffer.
export const DAILY_IMAGE_LIMITS = Object.freeze({
  maxBytes: DAILY_PHOTO_MAX_BYTES,
  maxPixels: 64_000_000,
  maxDimension: 16384,
  maxChunks: 4096,
  decodeSeconds: 10,
  concurrentDecodes: 1,
});

const formats: Record<string, string> = {
  'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp',
};
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function invalid(): never {
  throw new BadRequestException('照片内容与声明类型不符，或照片已损坏，请重新选择完整的 JPG、PNG 或 WebP 图片');
}
function dimensions(width: number | undefined, height: number | undefined) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !width || !height
    || width < 1 || height < 1 || width > DAILY_IMAGE_LIMITS.maxDimension
    || height > DAILY_IMAGE_LIMITS.maxDimension
    || width * height > DAILY_IMAGE_LIMITS.maxPixels) {
    throw new BadRequestException('照片不能超过6400万像素，且任一边不能超过16384像素，请缩小图片后重试');
  }
}
function assertPngContainer(buffer: Buffer) {
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(pngSignature)) invalid();
  let offset = 8, chunks = 0, sawHeader = false, sawData = false, dataEnded = false;
  while (offset < buffer.length) {
    if (++chunks > DAILY_IMAGE_LIMITS.maxChunks || offset + 12 > buffer.length) invalid();
    const length = buffer.readUInt32BE(offset), end = offset + 12 + length;
    if (length > 0x7fffffff || end > buffer.length) invalid();
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) invalid();
    if (crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) invalid();
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) invalid();
      sawHeader = true;
      dimensions(buffer.readUInt32BE(offset + 8), buffer.readUInt32BE(offset + 12));
    } else if (type === 'IHDR') invalid();
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) {
      throw new BadRequestException('餐食照片仅支持静态图片，请选择单帧照片');
    }
    // Unknown critical chunks cannot be interpreted safely by PNG decoders.
    if (type[0] === type[0].toUpperCase() && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type)) invalid();
    if (type === 'IDAT') {
      if (dataEnded) invalid();
      sawData = true;
    } else if (sawData) dataEnded = true;
    if (type === 'IEND') {
      if (length !== 0 || !sawData || end !== buffer.length) invalid();
      return;
    }
    offset = end;
  }
  invalid();
}
function assertWebpContainer(buffer: Buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'RIFF'
    || buffer.readUInt32LE(4) + 8 !== buffer.length || buffer.toString('ascii', 8, 12) !== 'WEBP') invalid();
  let offset = 12, chunks = 0;
  while (offset < buffer.length) {
    if (++chunks > DAILY_IMAGE_LIMITS.maxChunks || offset + 8 > buffer.length) invalid();
    const type = buffer.toString('ascii', offset, offset + 4), length = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + length, paddedEnd = end + (length & 1);
    if (paddedEnd > buffer.length || ((length & 1) && buffer[end] !== 0)) invalid();
    if (offset === 12 && !['VP8 ', 'VP8L', 'VP8X'].includes(type)) invalid();
    if (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && length > 0 && (buffer[offset + 8] & 2))) {
      throw new BadRequestException('餐食照片仅支持静态图片，请选择单帧照片');
    }
    if (type === 'VP8X') {
      if (offset !== 12 || length !== 10) invalid();
      dimensions(1 + buffer.readUIntLE(offset + 12, 3), 1 + buffer.readUIntLE(offset + 15, 3));
    }
    offset = paddedEnd;
  }
  if (offset !== buffer.length) invalid();
}
function assertJpegContainer(buffer: Buffer) {
  if (buffer.length < 5 || buffer[0] !== 255 || buffer[1] !== 216) invalid();
  let offset = 2, markers = 0, sawScan = false;
  while (offset < buffer.length) {
    if (++markers > DAILY_IMAGE_LIMITS.maxChunks || buffer[offset++] !== 255) invalid();
    while (offset < buffer.length && buffer[offset] === 255) offset++;
    if (offset >= buffer.length) invalid();
    const marker = buffer[offset++];
    if (marker === 217) {
      if (!sawScan || offset !== buffer.length) invalid();
      return;
    }
    if (marker === 216 || marker === 0 || (marker >= 208 && marker <= 215)) invalid();
    if (marker === 1) continue;
    if (offset + 2 > buffer.length) invalid();
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) invalid();
    // SOF stores dimensions before entropy decoding. Report the existing limits
    // explicitly rather than letting sharp's input limit become a format error.
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) invalid();
      dimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    offset += length;
    if (marker !== 218) continue;
    sawScan = true;
    // Scan every entropy byte. A stuffed FF00 and restart markers belong to this
    // scan; another marker starts a new segment/scan or the sole terminal EOI.
    while (offset < buffer.length) {
      if (buffer[offset] !== 255) { offset++; continue; }
      const markerStart = offset++;
      while (offset < buffer.length && buffer[offset] === 255) offset++;
      if (offset >= buffer.length) invalid();
      const next = buffer[offset];
      if (next === 0 || (next >= 208 && next <= 215)) { offset++; continue; }
      offset = markerStart; break;
    }
  }
  invalid();
}

let activeDecodes = 0;
// sharp is introduced for this validator; do not retain pixel/cache data after validation.
sharp.cache(false);
sharp.concurrency(1);

/** Fully decode after quota admission and before disk write or OSS PUT; never re-encode the original. */
export async function assertDailyCheckInImageIntegrity(buffer: Buffer, mimeType: string): Promise<void> {
  if (!Buffer.isBuffer(buffer) || !formats[mimeType] || buffer.length < 1
    || buffer.length > DAILY_IMAGE_LIMITS.maxBytes) invalid();
  if (activeDecodes >= DAILY_IMAGE_LIMITS.concurrentDecodes) {
    throw new ServiceUnavailableException('照片校验繁忙，请稍后重试');
  }
  // Admission occurs synchronously before async decoding. Reject excess requests without a Buffer queue.
  activeDecodes++;
  let decoder: Sharp | undefined;
  try {
    if (mimeType === 'image/png') assertPngContainer(buffer);
    else if (mimeType === 'image/webp') assertWebpContainer(buffer);
    else assertJpegContainer(buffer);
    decoder = sharp(buffer, {
      failOn: 'warning', limitInputPixels: DAILY_IMAGE_LIMITS.maxPixels,
      limitInputChannels: 4, sequentialRead: true, unlimited: false, pages: 1,
    }).timeout({ seconds: DAILY_IMAGE_LIMITS.decodeSeconds });
    const metadata = await decoder.metadata();
    if (metadata.format !== formats[mimeType]) invalid();
    if ((metadata.pages ?? 1) !== 1) throw new BadRequestException('餐食照片仅支持静态图片，请选择单帧照片');
    dimensions(metadata.width, metadata.height);
    // metadata() alone does not decode pixels. Request full-size 8-bit RGBA pixels,
    // without resizing, so malformed/truncated entropy data in any region is read.
    const { data, info } = await decoder.toColourspace('srgb').ensureAlpha().raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
    dimensions(info.width, info.height);
    if (info.width !== metadata.width || info.height !== metadata.height || info.channels !== 4
      || data.length !== info.width * info.height * 4) invalid();
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    invalid();
  } finally {
    decoder?.destroy();
    activeDecodes--;
  }
}


export function dailyImageMime(buffer: Buffer): string {
  if (Buffer.isBuffer(buffer)) {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(pngSignature)) return 'image/png';
    if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  }
  throw new BadRequestException('餐食照片仅支持 JPG、PNG 和 WebP 静态图片；HEIC/HEIF 请先转换后上传');
}
