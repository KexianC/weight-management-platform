import { cloudPolicy, shanghaiDay, usageCostMicro, BODY_CLOUD_RESERVE_MICRO } from './body-cloud-policy';
import { configuredCloudBodyOcrProvider, configuredVisionOcrProvider } from './vision-ocr';
import { minimizeBodyImage } from './body-cloud-image';
const env={OCR_BODY_CLOUD_ENABLED:'true',OCR_BODY_CLOUD_DAILY_LIMIT_CNY:'100',OCR_BODY_CLOUD_PRICE_VERSION:'qwen3-vl-plus-cn-beijing-20261014',OCR_VISION_BASE_URL:'https://dashscope.aliyuncs.com/compatible-mode/v1',OCR_VISION_REGION:'cn-beijing',OCR_VISION_MODEL:'qwen3-vl-plus',DASHSCOPE_API_KEY:'synthetic-test-key-not-real'};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/9sAAAAASUVORK5CYII=','base64');
describe('single body image cloud policy and conservative pricing',()=>{
 it('is off by default and refuses uncertain provider, price, or budget configuration',()=>{
  expect(cloudPolicy({}).enabled).toBe(false);
  expect(cloudPolicy(env).enabled).toBe(true);
  for(const patch of [{OCR_BODY_CLOUD_DAILY_LIMIT_CNY:'101'},{OCR_BODY_CLOUD_PRICE_VERSION:'unknown'},{OCR_VISION_REGION:'ap-southeast-1'},{OCR_VISION_MODEL:'other'},{OCR_BODY_CLOUD_ENABLED:'false'}])expect(cloudPolicy({...env,...patch}).enabled).toBe(false);
 });
 it('uses the Shanghai date rather than UTC at rollover',()=>{
  expect(shanghaiDay(new Date('2026-10-14T15:59:59Z'))).toBe('2026-10-14');
  expect(shanghaiDay(new Date('2026-10-14T16:00:00Z'))).toBe('2026-10-15');
 });
 it('never treats missing, malformed or outside-contract usage as free',()=>{
  for(const value of [undefined,{inputTokens:0,outputTokens:1},{inputTokens:262145,outputTokens:1},{inputTokens:3000,outputTokens:1025},{inputTokens:3.5,outputTokens:1}])expect(usageCostMicro(value)).toBe(null);
  expect(usageCostMicro({inputTokens:3000,outputTokens:1000})).toBe(13000);
  expect(usageCostMicro({inputTokens:262144,outputTokens:1024})!).toBeLessThan(BODY_CLOUD_RESERVE_MICRO);
 });
 it('strips PNG text metadata from transmitted bytes and leaves original immutable',()=>{
  const text=Buffer.from('name\0SYNTHETIC IDENTITY'),meta=Buffer.alloc(12+text.length);meta.writeUInt32BE(text.length);meta.write('tEXt',4,'ascii');text.copy(meta,8);
  const original=Buffer.concat([png.subarray(0,33),meta,png.subarray(33)]),copy=Buffer.from(original);
  const result=minimizeBodyImage({bytes:original,mimeType:'image/png'});
  expect(result.bytes).toEqual(png);expect(original).toEqual(copy);expect(result.bytes.includes(text)).toBe(false);
 });
 it('rejects animated, unrelated, corrupt and unsupported image containers',()=>{
  expect(()=>minimizeBodyImage({bytes:png,mimeType:'application/pdf'})).toThrow();
  expect(()=>minimizeBodyImage({bytes:png.subarray(0,40),mimeType:'image/png'})).toThrow();
  const apng=Buffer.concat([png.subarray(0,33),Buffer.from([0,0,0,0,97,99,84,76,0,0,0,0]),png.subarray(33)]);
  expect(()=>minimizeBodyImage({bytes:apng,mimeType:'image/png'})).toThrow();
 });
 it('rejects arbitrary APP14 and strips other JPEG identity metadata',()=>{
  const metadata=Buffer.from('SYNTHETIC IDENTITY'),segment=Buffer.alloc(metadata.length+4);segment[0]=255;segment[1]=238;segment.writeUInt16BE(metadata.length+2,2);metadata.copy(segment,4);
  expect(()=>minimizeBodyImage({bytes:Buffer.concat([Buffer.from([255,216]),segment,Buffer.from([255,217])]),mimeType:'image/jpeg'})).toThrow();
  segment[1]=225;const image=Buffer.concat([Buffer.from([255,216]),segment,Buffer.from([255,217])]);
  expect(minimizeBodyImage({bytes:image,mimeType:'image/jpeg'}).bytes.includes(metadata)).toBe(false);
 });
 it('does not lift the existing synthetic adapter hash gate',async()=>{
  const fetcher=jest.fn();const synthetic=configuredVisionOcrProvider('bailian',{...env,OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST:'a'.repeat(64)},fetcher);
  const r=await synthetic.recognize({image:{bytes:png,mimeType:'image/png'}});expect(r.status).toBe('FAILED');expect(r.attempted).toBe(false);expect(fetcher).not.toHaveBeenCalled();
 });
 it('uses one official request and only eight labeled metrics, with verified supplier usage',async()=>{
  const fetcher=jest.fn().mockResolvedValue(new Response(JSON.stringify({usage:{prompt_tokens:3000,completion_tokens:1000,total_tokens:4000},choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({fields:{weightKg:{value:75,unit:'kg'}}})}}]}),{headers:{'content-type':'application/json'}}));
  const p=configuredCloudBodyOcrProvider(env,fetcher);const r=await p.recognize({image:{bytes:png,mimeType:'image/png'}});
  expect(p.syntheticOnly).toBe(false);expect(r.status).toBe('DRAFT');expect(r.usage).toEqual({inputTokens:3000,outputTokens:1000});expect(r.fields.weightKg?.confidence).toBe(null);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
 });
 it('does not invent usage when supplier returns valid fields without billing metadata',async()=>{
  const p=configuredCloudBodyOcrProvider(env,async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"fields":{"weightKg":{"value":75,"unit":"kg"}}}'}}]}),{headers:{'content-type':'application/json'}}));
  const r=await p.recognize({image:{bytes:png,mimeType:'image/png'}});expect(r.status).toBe('DRAFT');expect(r.attempted).toBe(true);expect(usageCostMicro(r.usage)).toBe(null);
 });
});

// Production cannot bypass the project ledger through the original synthetic route.
import { ReportWorkflowService } from './report-workflow';
it('blocks the old supplier route before image loading in production',async()=>{const old={...process.env};try{Object.assign(process.env,{...env,NODE_ENV:'production',OCR_PROVIDER:'bailian',OCR_EXTERNAL_SYNTHETIC_SHA256_ALLOWLIST:'a'.repeat(64)});const media={readOwnedImageForOcr:jest.fn()};const service=new ReportWorkflowService({} as any,{} as any,{} as any,media as any);const result=await (service as any).extract(undefined);expect(result.status).toBe('UNCONFIGURED');expect(media.readOwnedImageForOcr).not.toHaveBeenCalled();}finally{process.env=old;}});
