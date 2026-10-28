import { BadRequestException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MediaService } from './media';
import { YuanqizhanController, YuanqizhanService } from './yuanqizhan';
import { shanghaiDate } from './yuanqizhan-policy';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFasAAAAASUVORK5CYII=', 'base64');
function pngWithPadding(size: number) {
  // A synthetic text chunk keeps the image container intact at the exact boundary.
  const chunk = Buffer.alloc(size - png.length);
  chunk.writeUInt32BE(chunk.length - 12, 0);
  chunk.write('tEXt', 4, 'ascii');
  chunk.write('synthetic\0', 8, 'ascii');
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
}

// Real multipart HTTP -> production FileInterceptor -> production service and
// media size policy. Identity, SQL and final storage are isolated adapters.
describe('Yuanqizhan inclusive 10MiB multipart boundary', () => {
  let app: INestApplication, origin: string, media: MediaService, persist: jest.SpyInstance, tx: any;
  beforeAll(async () => {
    const date = shanghaiDate();
    const activity = {id: 'synthetic-activity', status: 'ACTIVE', durationDays: 15};
    const member = {id: 'synthetic-member', activityId: activity.id, patientId: 'synthetic-patient', status: 'ACTIVE', startDate: date, joinedAt: new Date(date + 'T00:00:00+08:00'), activity};
    tx = {$queryRaw: jest.fn().mockResolvedValue([]),
      yuanqizhanActivity: {findUnique: jest.fn().mockResolvedValue(activity)},
      yuanqizhanMember: {findUnique: jest.fn().mockResolvedValue(member)},
      yuanqizhanPhoto: {create: jest.fn(async ({data}: any) => data)}};
    const db = {...tx, $transaction: async (work: any) => work(tx)};
    const clinical = {actor: async () => ({sub: 'synthetic-patient', role: 'PATIENT', typ: 'access', jti: 'synthetic'})};
    media = new MediaService(db as any, clinical as any);
    persist = jest.spyOn(media as any, 'persistUpload').mockImplementation(async (_actor: any, file: any) => ({id: 'synthetic-asset', sizeBytes: file.size, mimeType: file.mimetype, scope: 'PRIVATE'}));
    const service = new YuanqizhanService(db as any, clinical as any, media);
    const module = await Test.createTestingModule({controllers: [YuanqizhanController], providers: [{provide: YuanqizhanService, useValue: service}]}).compile();
    app = module.createNestApplication({logger: false});
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  afterAll(async () => {persist.mockRestore(); await app?.close();});
  async function upload(size: number) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(pngWithPadding(size))], {type: 'image/png'}), 'synthetic-only.png');
    return fetch(origin + '/yuanqizhan/synthetic-activity/photos/face', {method: 'POST', body: form});
  }
  it('accepts exactly 10485760 bytes through the real interceptor', async () => {
    const response = await upload(10485760);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({sizeBytes: 10485760, slot: 'face'});
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][1].buffer.length).toBe(10485760);
  });
  it('rejects 10485761 bytes before storing or associating an image', async () => {
    const before = persist.mock.calls.length, associations = tx.yuanqizhanPhoto.create.mock.calls.length;
    const response = await upload(10485761);
    expect([400, 413]).toContain(response.status);
    expect(persist).toHaveBeenCalledTimes(before);
    expect(tx.yuanqizhanPhoto.create).toHaveBeenCalledTimes(associations);
  });
  it('retains the business-layer limit if the upload interceptor is bypassed internally', async () => {
    const file = {buffer: Buffer.alloc(10485761), size: 10485761, mimetype: 'image/png', originalname: 'synthetic-only.png'};
    await expect(media.uploadYuanqizhan({} as any, file, {memberId: 'synthetic-member', patientId: 'synthetic-patient', activityId: 'synthetic-activity', date: shanghaiDate(), slot: 'face'}, tx)).rejects.toBeInstanceOf(BadRequestException);
  });
});
