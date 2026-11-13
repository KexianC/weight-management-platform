import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
const sharp: typeof import('sharp')['default'] = require('sharp');
import { assertDailyCheckInImageIntegrity, DAILY_IMAGE_LIMITS } from './daily-check-in-image';

// Independent bit-at-a-time CRC producer, also checked by libpng in the real decoder.
function fixtureCrc(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(fixtureCrc(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
function pngChunkOffset(png: Buffer, type: string) {
  let i = 8;
  while (i < png.length) {
    if (png.toString('ascii', i + 4, i + 8) === type) return i;
    i += 12 + png.readUInt32BE(i);
  }
  throw new Error('Synthetic fixture lacks ' + type);
}
function insertPngChunk(png: Buffer, type: string, data: Buffer): Buffer {
  const i = pngChunkOffset(png, 'IEND');
  return Buffer.concat([png.subarray(0, i), chunk(type, data), png.subarray(i)]);
}
function paddedPng(png: Buffer, bytes: number): Buffer {
  return insertPngChunk(png, 'npAd', Buffer.alloc(bytes - png.length - 12));
}
function noise(size: number): Buffer {
  const b = Buffer.alloc(size); let state = 0x12345678;
  for (let i = 0; i < size; i++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5; b[i] = state & 255;
  }
  return b;
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('daily meal image integrity before storage', () => {
  let png: Buffer, jpeg: Buffer, webp: Buffer, exact10MiB: Buffer, animatedWebp: Buffer;
  beforeAll(async () => {
    const raw = noise(128 * 96 * 3), input = {raw: {width: 128, height: 96, channels: 3 as const}};
    png = await sharp(raw, input).png().toBuffer();
    jpeg = await sharp(raw, input).jpeg({quality: 90}).toBuffer();
    webp = await sharp(raw, input).webp({lossless: true}).toBuffer();
    exact10MiB = paddedPng(png, 10485760);
    const frames = Buffer.alloc(16 * 32 * 4);
    for (let i = 0; i < frames.length; i += 4) {
      frames[i + (i < frames.length / 2 ? 0 : 2)] = 255; frames[i + 3] = 255;
    }
    animatedWebp = await sharp(frames, {raw: {width: 16, height: 32, channels: 4, pageHeight: 16}})
      .webp({loop: 0, delay: [100, 100]}).toBuffer();
  }, 30000);

  it.each(['png', 'jpeg', 'webp'])('fully decodes valid %s without changing original bytes', async (format) => {
    const b = ({png, jpeg, webp} as Record<string, Buffer>)[format]!;
    const before = sha(b), copy = Buffer.from(b);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/' + format)).resolves.toBeUndefined();
    expect(sha(b)).toBe(before); expect(b.equals(copy)).toBe(true);
  });
  it('accepts an EXIF orientation JPEG and preserves orientation/bytes', async () => {
    const b = await sharp(jpeg).withMetadata({orientation: 6}).jpeg().toBuffer(), before = sha(b);
    expect((await sharp(b).metadata()).orientation).toBe(6);
    await assertDailyCheckInImageIntegrity(b, 'image/jpeg');
    expect(sha(b)).toBe(before); expect((await sharp(b).metadata()).orientation).toBe(6);
  });
  it('accepts and preserves a CMYK JPEG', async () => {
    const b = await sharp(jpeg).toColourspace('cmyk').jpeg().toBuffer(), before = sha(b);
    expect((await sharp(b).metadata()).space).toBe('cmyk');
    await assertDailyCheckInImageIntegrity(b, 'image/jpeg'); expect(sha(b)).toBe(before);
  });
  it('accepts progressive JPEG, interlaced PNG and lossy WebP encoding variants', async () => {
    const variants = [
      [await sharp(jpeg).jpeg({progressive: true}).toBuffer(), 'image/jpeg'],
      [await sharp(png).png({progressive: true}).toBuffer(), 'image/png'],
      [await sharp(png).webp({quality: 75}).toBuffer(), 'image/webp'],
    ] as const;
    for (const [b, mime] of variants) {
      const before = sha(b); await assertDailyCheckInImageIntegrity(b, mime); expect(sha(b)).toBe(before);
    }
  });
  it('rejects concatenated JPEG images and accepts embedded JPEG bytes in length-delimited metadata', async () => {
    await expect(assertDailyCheckInImageIntegrity(Buffer.concat([jpeg, jpeg]), 'image/jpeg'))
      .rejects.toBeInstanceOf(BadRequestException);
    const comment = Buffer.alloc(4 + jpeg.length); comment[0] = 255; comment[1] = 254;
    comment.writeUInt16BE(jpeg.length + 2, 2); jpeg.copy(comment, 4);
    const embedded = Buffer.concat([jpeg.subarray(0, 2), comment, jpeg.subarray(2)]), before = sha(embedded);
    await assertDailyCheckInImageIntegrity(embedded, 'image/jpeg'); expect(sha(embedded)).toBe(before);
  });
  it('accepts 16-bit PNG while limiting its decoded output to 8-bit RGBA', async () => {
    const b = await sharp(png).toColourspace('rgb16').png().toBuffer(), before = sha(b);
    expect((await sharp(b).metadata()).depth).toBe('ushort');
    await assertDailyCheckInImageIntegrity(b, 'image/png'); expect(sha(b)).toBe(before);
  });
  it('accepts exactly 10MiB of complete PNG with legal ancillary padding and unchanged SHA', async () => {
    expect(exact10MiB.length).toBe(10485760);
    const before = sha(exact10MiB);
    // Decoder independently confirms complete image pixels, not merely header metadata.
    expect((await sharp(exact10MiB, {failOn: 'warning'}).raw().toBuffer()).length).toBe(128 * 96 * 3);
    await assertDailyCheckInImageIntegrity(exact10MiB, 'image/png'); expect(sha(exact10MiB)).toBe(before);
  });
  it.each([10485761, 20971520])('rejects %s complete PNG bytes above the 10MiB limit', async size => {
    const b = paddedPng(png, size), before = sha(b);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
    expect(sha(b)).toBe(before);
  });
  it('rejects a complete valid PNG at 10MiB+1', async () => {
    const b = paddedPng(png, 10485761);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects damaged PNG content at the 10MiB byte limit', async () => {
    const b = paddedPng(png, 10485760);
    const offset = pngChunkOffset(b, 'IDAT'), length = b.readUInt32BE(offset);
    b[offset + 8 + length - 1] ^= 1;
    b.writeUInt32BE(fixtureCrc(b.subarray(offset + 4, offset + 8 + length)), offset + 8 + length);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['png', 'jpeg', 'webp'])('rejects the original header-only %s repro', async (format) => {
    let b: Buffer;
    if (format === 'png') b = png.subarray(0, 33);
    else if (format === 'jpeg') b = Buffer.from([255, 216, 255, 255, 217]);
    else {
      b = Buffer.alloc(20); b.write('RIFF'); b.writeUInt32LE(12, 4); b.write('WEBPVP8L', 8);
    }
    await expect(assertDailyCheckInImageIntegrity(b, 'image/' + format)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each(['png', 'jpeg', 'webp'])('rejects truncated %s', async (format) => {
    const b = ({png, jpeg, webp} as Record<string, Buffer>)[format]!;
    await expect(assertDailyCheckInImageIntegrity(b.subarray(0, Math.floor(b.length / 2)), 'image/' + format))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a JPEG with readable metadata but truncated entropy even when EOI is restored', async () => {
    const b = Buffer.concat([jpeg.subarray(0, Math.floor(jpeg.length / 2)), Buffer.from([255, 217])]);
    expect((await sharp(b).metadata()).width).toBe(128);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/jpeg')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects WebP truncated pixel payload even when RIFF/chunk sizes are repaired', async () => {
    const len = Math.floor(webp.readUInt32LE(16) / 2), b = Buffer.from(webp.subarray(0, 20 + len + (len & 1)));
    b.writeUInt32LE(b.length - 8, 4); b.writeUInt32LE(len, 16); if (len & 1) b[b.length - 1] = 0;
    expect((await sharp(b).metadata()).width).toBe(128);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/webp')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a PNG with readable metadata and corrupt compressed data despite repaired chunk CRC', async () => {
    const b = Buffer.from(png), offset = pngChunkOffset(b, 'IDAT'), length = b.readUInt32BE(offset);
    b[offset + 8 + length - 1] ^= 1;
    b.writeUInt32BE(fixtureCrc(b.subarray(offset + 4, offset + 8 + length)), offset + 8 + length);
    expect((await sharp(b).metadata()).width).toBe(128);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects both critical and ancillary PNG CRC damage', async () => {
    for (const type of ['IHDR', 'npAd']) {
      const b = type === 'IHDR' ? Buffer.from(png) : insertPngChunk(png, 'npAd', Buffer.from('synthetic-only'));
      const offset = pngChunkOffset(b, type), length = b.readUInt32BE(offset);
      b[offset + 8 + length] ^= 1;
      await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
    }
  });
  it('rejects PNG without IEND or with trailing bytes', async () => {
    for (const b of [png.subarray(0, png.length - 12), Buffer.concat([png, Buffer.from([0])])]) {
      await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
    }
  });
  it('rejects mismatched actual format and claimed MIME, and disallowed format/MIME', async () => {
    for (const [b, mime] of [[png, 'image/jpeg'], [jpeg, 'image/png'], [webp, 'image/png'], [png, 'image/svg+xml']] as const) {
      await expect(assertDailyCheckInImageIntegrity(b, mime)).rejects.toBeInstanceOf(BadRequestException);
    }
  });
  it('rejects real animated WebP instead of inspecting only the first frame', async () => {
    expect((await sharp(animatedWebp, {animated: true}).metadata()).pages).toBe(2);
    await expect(assertDailyCheckInImageIntegrity(animatedWebp, 'image/webp')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a complete two-frame APNG instead of ignoring non-default frames', async () => {
    const acTL = Buffer.alloc(8); acTL.writeUInt32BE(2);
    const frame = (sequence: number) => {
      const b = Buffer.alloc(26); b.writeUInt32BE(sequence); b.writeUInt32BE(128, 4); b.writeUInt32BE(96, 8);
      b.writeUInt16BE(1, 20); b.writeUInt16BE(10, 22); return b;
    };
    const data: Buffer[] = [];
    for (let i = 33; i < png.length; i += 12 + png.readUInt32BE(i)) {
      if (png.toString('ascii', i + 4, i + 8) === 'IDAT') data.push(png.subarray(i + 8, i + 8 + png.readUInt32BE(i)));
    }
    const fdATSequence = Buffer.alloc(4); fdATSequence.writeUInt32BE(2);
    const b = Buffer.concat([png.subarray(0, 33), chunk('acTL', acTL), chunk('fcTL', frame(0)), chunk('IDAT', Buffer.concat(data)),
      chunk('fcTL', frame(1)), chunk('fdAT', Buffer.concat([fdATSequence, ...data])), chunk('IEND', Buffer.alloc(0))]);
    expect((await sharp(b, {failOn: 'warning'}).raw().toBuffer()).length).toBe(128 * 96 * 3);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
  it('bounds parsing of excessive PNG ancillary chunk counts', async () => {
    const offset = pngChunkOffset(png, 'IEND'), padding = chunk('npAd', Buffer.alloc(0));
    const b = Buffer.concat([png.subarray(0, offset), ...Array(DAILY_IMAGE_LIMITS.maxChunks).fill(padding), png.subarray(offset)]);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('continues to accept a complete 24MP phone image without changing the bytes', async () => {
    const b = await sharp({create: {width: 6000, height: 4000, channels: 3, background: 'white'}}).png().toBuffer();
    const before = sha(b);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).resolves.toBeUndefined();
    expect(sha(b)).toBe(before);
  }, 30000);
  it('accepts a complete 48MP phone JPEG while preserving its original bytes and EXIF orientation', async () => {
    const b = await sharp({create: {width: 8000, height: 6000, channels: 3, background: '#a9c8d7'}})
      .withMetadata({orientation: 6}).jpeg().toBuffer();
    const copy = Buffer.from(b), before = sha(b);
    expect(b.length).toBeLessThan(DAILY_IMAGE_LIMITS.maxBytes);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/jpeg')).resolves.toBeUndefined();
    expect(b.equals(copy)).toBe(true); expect(sha(b)).toBe(before);
    expect(await sharp(b).metadata()).toMatchObject({width: 8000, height: 6000, orientation: 6});
  }, 30000);
  it('accepts a complete 64MP PNG at the inclusive pixel limit with the same Buffer and SHA', async () => {
    const b = await sharp({create: {width: 8000, height: 8000, channels: 3, background: '#c5d8a8'}}).png().toBuffer();
    const copy = Buffer.from(b), before = sha(b);
    expect(b.length).toBeLessThan(DAILY_IMAGE_LIMITS.maxBytes);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).resolves.toBeUndefined();
    expect(b.equals(copy)).toBe(true); expect(sha(b)).toBe(before);
  }, 30000);
  it('accepts a complete image at the inclusive 16384-pixel edge limit', async () => {
    const b = await sharp({create: {width: 16384, height: 1, channels: 3, background: 'white'}}).png().toBuffer();
    const before = sha(b);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).resolves.toBeUndefined();
    expect(sha(b)).toBe(before);
  }, 30000);
  it('reports excess JPEG pixels before the decoder maps its input-limit error to a format error', async () => {
    // 5213 * 12277 is exactly 64000001, with both edges below the edge limit.
    const b = await sharp({ create: { width: 5213, height: 12277, channels: 3, background: 'white' } }).jpeg().toBuffer();
    expect(b.length).toBeLessThan(DAILY_IMAGE_LIMITS.maxBytes);
    expect((await sharp(b).metadata()).width).toBe(5213);
    const decode = jest.spyOn((sharp as any).prototype, 'toBuffer');
    try {
      await expect(assertDailyCheckInImageIntegrity(b, 'image/jpeg')).rejects.toThrow('照片不能超过6400万像素');
      expect(decode).not.toHaveBeenCalled();
    } finally { decode.mockRestore(); }
  }, 30000);
  it('rejects exactly 64MP+1 and edge 16384+1 before allocating decoded pixel output', async () => {
    for (const [width, height] of [[5213, 12277], [16385, 1]]) {
      const b = await sharp({create: {width, height, channels: 3, background: 'white'}}).png().toBuffer();
      const decode = jest.spyOn((sharp as any).prototype, 'toBuffer');
      try {
        await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toThrow('照片不能超过6400万像素，且任一边不能超过16384像素');
        expect(decode).not.toHaveBeenCalled();
      } finally { decode.mockRestore(); }
    }
  }, 30000);
  it('rejects a forged billion-pixel PNG before decoding', async () => {
    const b = Buffer.from(png); b.writeUInt32BE(65535, 16); b.writeUInt32BE(65535, 20);
    b.writeUInt32BE(fixtureCrc(b.subarray(12, 29)), 29);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/png')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('does not queue simultaneous compressed input Buffers and frees admission after completion', async () => {
    const pending = assertDailyCheckInImageIntegrity(png, 'image/png');
    await expect(assertDailyCheckInImageIntegrity(jpeg, 'image/jpeg')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await pending;
    await expect(assertDailyCheckInImageIntegrity(jpeg, 'image/jpeg')).resolves.toBeUndefined();
  });
  it('frees decoder admission after a failed decode', async () => {
    const b = Buffer.concat([jpeg.subarray(0, Math.floor(jpeg.length / 2)), Buffer.from([255, 217])]);
    await expect(assertDailyCheckInImageIntegrity(b, 'image/jpeg')).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertDailyCheckInImageIntegrity(png, 'image/png')).resolves.toBeUndefined();
  });
});

