import 'reflect-metadata';
import { ConflictException, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizeBodyCloudDto, BodyCloudOcrService, PrepareBodyCloudDto } from './body-cloud-ocr';
import { ConfirmOcrDraftDto, CreateOcrDraftDto } from './report-workflow';

describe('production OCR consent transformation',()=>{
 const pipe=new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true,transformOptions:{enableImplicitConversion:true}});
 const prepare={mediaAssetId:'synthetic',requestKey:'synthetic_request_key'};
 const auth={noticeVersion:'v1',noticeSha256:'a'.repeat(64),imageSha256:'b'.repeat(64)};
 const transform=(type:any,value:any)=>pipe.transform(value,{type:'body',metatype:type});
 it.each(['false','true',0,1,null,undefined])('rejects non-Boolean minimization and consent %p',async bad=>{
  await expect(transform(PrepareBodyCloudDto,{...prepare,dataMinimized:bad})).rejects.toThrow();
  await expect(transform(AuthorizeBodyCloudDto,{...auth,approved:bad})).rejects.toThrow();
  await expect(transform(ConfirmOcrDraftDto,{expectedUpdatedAt:new Date().toISOString(),reviewed:bad})).rejects.toThrow();
 });
 it('accepts only explicit true minimization/review, and preserves explicit decline',async()=>{
  expect((await transform(PrepareBodyCloudDto,{...prepare,dataMinimized:true})).dataMinimized).toBe(true);
  expect((await transform(AuthorizeBodyCloudDto,{...auth,approved:false})).approved).toBe(false);
  await expect(transform(PrepareBodyCloudDto,{...prepare,dataMinimized:false})).rejects.toThrow();
  await expect(transform(ConfirmOcrDraftDto,{expectedUpdatedAt:new Date().toISOString(),reviewed:false})).rejects.toThrow();
 });
 it('does not interpret a string local-only switch as a Boolean',async()=>{
  await expect(transform(CreateOcrDraftDto,{mediaAssetId:'synthetic',localOnly:'false'})).rejects.toThrow();
 });
});

describe('cloud ledger transaction retry boundaries',()=>{
 const error=(code:string,meta?:Record<string,unknown>)=>new Prisma.PrismaClientKnownRequestError('synthetic failure',{code,clientVersion:'test',meta});
 const run=(impl:any)=>{
  const db={$transaction:jest.fn(impl)};
  const service=new BodyCloudOcrService(db as any,{} as any,{} as any,{} as any);
  return {db,transaction:(work:any)=>(service as any).transaction(work)};
 };
 it.each([error('P2034'),error('P2010',{code:'1213'})])('retries a confirmed rolled-back transaction only',async fail=>{
  let attempts=0;const {db,transaction}=run(async(work:any)=>{if(attempts++===0)throw fail;return work({});});
  const work=jest.fn(async()=>42);
  expect(await transaction(work)).toBe(42);expect(db.$transaction).toHaveBeenCalledTimes(2);expect(work).toHaveBeenCalledTimes(1);
 });
 it('stops persistent known conflicts after three transaction attempts with 409',async()=>{
  const {db,transaction}=run(async()=>{throw error('P2034');});
  await expect(transaction(async()=>42)).rejects.toBeInstanceOf(ConflictException);expect(db.$transaction).toHaveBeenCalledTimes(3);
 });
 it.each([error('P2010',{code:'1205'}),error('P2028'),new Error('unknown commit outcome')])('never retries an uncertain outcome',async fail=>{
  const {db,transaction}=run(async()=>{throw fail;});
  await expect(transaction(async()=>42)).rejects.toBeInstanceOf(ServiceUnavailableException);expect(db.$transaction).toHaveBeenCalledTimes(1);
 });
 it('maps a uniqueness collision to 409 without retrying',async()=>{
  const {db,transaction}=run(async()=>{throw error('P2002');});
  await expect(transaction(async()=>42)).rejects.toBeInstanceOf(ConflictException);expect(db.$transaction).toHaveBeenCalledTimes(1);
 });
});
