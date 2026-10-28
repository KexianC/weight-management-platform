import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpException, Inject, Injectable, Optional, Param, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Equals, IsBoolean, IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';
import { MediaService } from './media';
import { ReportWorkflowService } from './report-workflow';
import { configuredCloudBodyOcrProvider, type VisionExtraction, type VisionOcrProvider } from './vision-ocr';
import { BODY_CLOUD_LIMIT_MICRO, BODY_CLOUD_RESERVE_MICRO, cloudPolicy, shanghaiDay, usageCostMicro } from './body-cloud-policy';
import { minimizeBodyImage } from './body-cloud-image';

// Only a server dependency override in an isolated synthetic Nest test app; never a request/env switch.
export const BODY_CLOUD_TRANSPORT = Symbol('BODY_CLOUD_TRANSPORT');
export class PrepareBodyCloudDto {
  @IsOptional() @IsString() @MaxLength(191) mediaAssetId?: string;
  @IsOptional() @IsString() @MaxLength(191) draftId?: string;
  @IsString() @Matches(/^[a-zA-Z0-9_-]{16,96}$/) requestKey!: string;
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean() @Equals(true) dataMinimized!: boolean;
  @IsOptional() @IsDateString() measuredAt?: string;
}
export class AuthorizeBodyCloudDto {
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean() approved!: boolean;
  @IsString() @MaxLength(32) noticeVersion!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) noticeSha256!: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) imageSha256!: string;
}
type CloudRow = Prisma.BodyCloudOcrRequestGetPayload<Record<string, never>>;
const json = (v: unknown) => v as Prisma.InputJsonValue;

@Injectable()
export class BodyCloudOcrService {
  constructor(private readonly db: PrismaService, private readonly clinical: ClinicalService,
    private readonly reports: ReportWorkflowService, private readonly media: MediaService,
    @Optional() @Inject(BODY_CLOUD_TRANSPORT) private readonly transport?: () => VisionOcrProvider) {}
  private async transaction<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
    // Retry only transactions explicitly rolled back by a database deadlock.
    // Supplier I/O is outside every callback; this cannot repeat a paid request.
    for(let attempt=0;attempt<3;attempt++){
      try{return await this.db.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
      catch(error){
        if(error instanceof HttpException)throw error;
        const known=error instanceof Prisma.PrismaClientKnownRequestError;
        const rolledBack=known && (error.code==='P2034' || error.code==='P2010' && String(error.meta?.code)==='1213');
        if(rolledBack){if(attempt<2)continue;throw new ConflictException('识别状态发生并发冲突，请重新读取当前请求；不会自动重发图片。');}
        if(known && error.code==='P2002')throw new ConflictException('请求或图片已被占用，请重新读取当前状态。');
        throw new ServiceUnavailableException('云识别状态保存失败，不会自动重试；费用预占不会被当作免费释放，请人工核查。');
      }
    }
    throw new ConflictException('请重新读取当前识别状态');
  }
  private provider() { return this.transport ? this.transport() : configuredCloudBodyOcrProvider(); }
  private async recoverStale() {
    // A crash after claiming a call cannot be guessed as free. No automatic transport retry.
    const cutoff=new Date(Date.now()-5*60000);
    const stale=await this.db.bodyCloudOcrRequest.findMany({where:{state:'IN_FLIGHT',sentAt:{lt:cutoff}},take:20});
    for(const row of stale)await this.transaction(async tx=>{
      const changed=await tx.bodyCloudOcrRequest.updateMany({where:{id:row.id,state:'IN_FLIGHT',sentAt:{lt:cutoff}},data:{state:'UNKNOWN',errorCode:'PROCESS_INTERRUPTED',finishedAt:new Date()}});
      if(changed.count!==1)return;
      if(row.budgetDay)await tx.bodyCloudOcrBudget.update({where:{day:row.budgetDay},data:{blocked:true}});
      await tx.ocrDraft.updateMany({where:{id:row.draftId,status:'PROCESSING'},data:{status:'FAILED',errorMessage:'调用进程中断，用量未核实；费用预占保留，未自动重试，可手工核对。'}});
      await tx.auditLog.create({data:{actorId:row.createdById,action:'BODY_CLOUD_INTERRUPTED',resourceType:'BODY_CLOUD_REQUEST',resourceId:row.id}});
    });
  }
  private enabled() {
    const policy = cloudPolicy();
    if (!policy.enabled || this.provider().status !== 'AVAILABLE') throw new ServiceUnavailableException('云识别未启用或预算/提供商配置未确认，可继续手工录入；图片未发送。');
    return policy;
  }
  private async actor(req: Request, patientId: string, tx: Prisma.TransactionClient = this.db as unknown as Prisma.TransactionClient) {
    const actor = await this.clinical.actor(req);
    await this.reports.assertCurrentEnrollment(tx, actor, patientId);
    return actor;
  }
  private staff(actor: Actor) { if (!['HEALTH_MANAGER','DOCTOR'].includes(actor.role)) throw new ForbiddenException('仅当前负责的工作人员可建立或执行云识别请求'); }
  private view(row: CloudRow) {
    return { id: row.id, draftId: row.draftId, patientId: row.patientId, mediaAssetId: row.mediaAssetId, imageSha256: row.imageSha256,
      inputSha256:row.inputSha256, state: row.state, noticeVersion: row.noticeVersion, noticeSha256: row.noticeSha256, noticeText: row.noticeText,
      provider: row.provider, model: row.model, region: row.region, expiresAt: row.expiresAt, createdAt: row.createdAt,
      authorizedAt: row.authorizedAt, sentAt: row.sentAt, finishedAt: row.finishedAt,
      budgetDay: row.budgetDay, reservationCny: row.reservedMicro / 1_000_000,
      actualCny: row.actualMicro === null ? null : row.actualMicro / 1_000_000,
      usageVerified: row.actualMicro !== null, errorCode: row.errorCode };
  }
  private async row(req: Request, id: string) {
    const row = await this.db.bodyCloudOcrRequest.findUnique({ where: { id } });
    if (!row) throw new ForbiddenException('请求不存在或不可访问');
    const actor = await this.actor(req, row.patientId);
    if (actor.role !== 'PATIENT' && row.createdById !== actor.sub) throw new ForbiddenException('只能办理本人创建的云识别请求');
    return { actor, row };
  }
  async providerStatus(req: Request) {
    const actor = await this.clinical.actor(req);
    if (!['PATIENT','HEALTH_MANAGER','DOCTOR'].includes(actor.role)) throw new ForbiddenException('当前岗位不可使用原图云识别');
    await this.recoverStale();
    const policy = cloudPolicy(); const configured = this.provider().status === 'AVAILABLE';
    const budget = await this.db.bodyCloudOcrBudget.findUnique({ where: { day: shanghaiDay() } });
    const room=!budget || !budget.blocked && budget.limitMicro===BODY_CLOUD_LIMIT_MICRO && budget.usedMicro+budget.heldMicro+BODY_CLOUD_RESERVE_MICRO<=budget.limitMicro;
    return { ...policy, configured, available: policy.enabled && configured && room,
      message: !policy.enabled || !configured ? '真实云识别未启用，可手工录入，图片不会发送。'
        : budget?.blocked ? '当天存在未核实调用用量，已暂停云识别，可手工录入。' : !room ? '今日项目预算不足或账本配置待核实，云识别暂停，可手工录入。' : '客户逐图授权后才能发送；识别结果须工作人员核对。',
      budget: { day: shanghaiDay(), usedCny: (budget?.usedMicro ?? 0) / 1e6, heldCny: (budget?.heldMicro ?? 0) / 1e6, blocked: budget?.blocked ?? false } };
  }
  async list(req: Request, patientId: string) {
    const actor = await this.actor(req, patientId);
    await this.recoverStale();
    return (await this.db.bodyCloudOcrRequest.findMany({ where: { patientId, ...(actor.role === 'PATIENT' ? {} : { createdById: actor.sub }) }, orderBy: [{ createdAt:'desc' },{ id:'asc' }], take:100 })).map(r => this.view(r));
  }
  async get(req: Request, id: string) { await this.row(req,id);await this.recoverStale();return this.view((await this.row(req,id)).row); }
  async prepare(req: Request, patientId: string, dto: PrepareBodyCloudDto) {
    const policy = this.enabled(); const actor = await this.actor(req,patientId); this.staff(actor);
    if (dto.dataMinimized !== true || !/^[a-zA-Z0-9_-]{16,96}$/.test(dto.requestKey) || (!!dto.mediaAssetId === !!dto.draftId)) throw new BadRequestException('请选择一张已去除无关身份信息的图片，或一个失败草稿，并使用稳定请求键');
    const measuredAt = dto.measuredAt ? new Date(dto.measuredAt) : undefined;
    if (measuredAt && (!Number.isFinite(measuredAt.getTime()) || measuredAt.getUTCFullYear()<1900 || measuredAt.getTime()>Date.now()+60000)) throw new BadRequestException('请人工核对当次检测日期');
    const inputKey = JSON.stringify({ patientId, mediaAssetId: dto.mediaAssetId ?? null, draftId: dto.draftId ?? null, measuredAt: measuredAt?.toISOString() ?? null });
    const existing=await this.db.bodyCloudOcrRequest.findUnique({where:{createdById_requestKey:{createdById:actor.sub,requestKey:dto.requestKey}}});
    if(existing){if(existing.inputKey!==inputKey)throw new ConflictException('同一请求键不能用于不同图片、客户或日期');return this.view(existing);}
    const sourceId=dto.mediaAssetId ?? (await this.db.ocrDraft.findUnique({where:{id:dto.draftId!}}))?.mediaAssetId;
    if(!sourceId)throw new BadRequestException('草稿或来源图片不存在');
    let minimized;
    try {minimized=minimizeBodyImage(await this.media.readOwnedImageForOcr(actor,sourceId));}
    catch {throw new BadRequestException('单图格式或元数据处理失败，未发送供应商；请另选PNG/JPEG或手工录入');}
    return this.transaction(async tx => {
      await this.reports.assertCurrentEnrollment(tx,actor,patientId);
      const prior = await tx.bodyCloudOcrRequest.findUnique({ where: { createdById_requestKey:{ createdById:actor.sub,requestKey:dto.requestKey } } });
      if (prior) { if (prior.inputKey !== inputKey) throw new ConflictException('同一请求键不能用于不同图片、客户或日期'); return this.view(prior); }
      let draft;
      if (dto.draftId) {
        draft = await tx.ocrDraft.findUnique({ where:{id:dto.draftId} });
        if (!draft || draft.patientId!==patientId || draft.createdById!==actor.sub || !['FAILED','UNCONFIGURED'].includes(draft.status) || !['BODY_COMPOSITION','INBODY_270'].includes(draft.sourceKind)) throw new ConflictException('只能为本人失败或未识别的人体成分草稿重新申请授权');
        await this.reports.assertBoundSource(tx,draft);
        const pending = await tx.bodyCloudOcrRequest.count({ where:{draftId:draft.id,state:{in:['WAITING_AUTH','APPROVED','IN_FLIGHT']}} });
        if (pending) throw new ConflictException('该图片已有待处理请求，请读取或撤回后再申请');
      } else {
        await this.reports.assertAsset(tx,actor,dto.mediaAssetId!,true);
        draft = await tx.ocrDraft.create({data:{patientId,mediaAssetId:dto.mediaAssetId!,provider:'bailian-cloud',status:'UNCONFIGURED',fields:{},sourceKind:'BODY_COMPOSITION',measuredAt,createdById:actor.sub,errorMessage:'等待客户逐图授权；尚未发送，亦可手工核对。'}});
        await this.reports.bind(tx,actor,draft.mediaAssetId,'OCR_SOURCE',draft.id);
      }
      const asset = await tx.mediaAsset.findUniqueOrThrow({where:{id:draft.mediaAssetId}});
      if (asset.ownerId!==actor.sub || !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '') || !['image/png','image/jpeg'].includes(asset.mimeType)) throw new BadRequestException('图片归属、格式或完整性信息不可用');
      const request = await tx.bodyCloudOcrRequest.create({data:{patientId,draftId:draft.id,mediaAssetId:asset.id,imageSha256:asset.sha256!,inputSha256:minimized.sha256,createdById:actor.sub,requestKey:dto.requestKey,inputKey,
        state:'WAITING_AUTH',noticeVersion:policy.noticeVersion,noticeSha256:policy.noticeSha256,noticeText:policy.noticeText,provider:policy.provider,model:policy.model,region:policy.region,
        expiresAt:new Date(Date.now()+30*60000),dataMinimizedAt:new Date()}});
      await tx.auditLog.create({data:{actorId:actor.sub,action:'BODY_CLOUD_PREPARE',resourceType:'BODY_CLOUD_REQUEST',resourceId:request.id,metadata:{draftId:draft.id,noticeVersion:policy.noticeVersion}}});
      return this.view(request);
    });
  }
  async authorize(req: Request,id: string,dto: AuthorizeBodyCloudDto) {
    const {actor,row} = await this.row(req,id);
    if (actor.role!=='PATIENT' || actor.sub!==row.patientId) throw new ForbiddenException('须客户在本人账号确认，工作人员不能代为授权');
    if (dto.noticeVersion!==row.noticeVersion || dto.noticeSha256!==row.noticeSha256 || dto.imageSha256!==row.imageSha256 || typeof dto.approved!=='boolean') throw new BadRequestException('告知版本或图片已改变，请重新查看');
    return this.transaction(async tx => {
      await this.reports.assertCurrentEnrollment(tx,actor,row.patientId);
      if (row.expiresAt.getTime()<=Date.now()) throw new ConflictException('授权请求已过期，请工作人员重新申请');
      await this.reports.assertBoundSource(tx,await tx.ocrDraft.findUniqueOrThrow({where:{id:row.draftId}}));
      const changed = await tx.bodyCloudOcrRequest.updateMany({where:{id,state:'WAITING_AUTH',expiresAt:{gt:new Date()}},data:{state:dto.approved?'APPROVED':'DECLINED',authorizedById:actor.sub,authorizedAt:new Date()}});
      if (changed.count!==1) throw new ConflictException('此授权已办理或已撤回，请重新读取');
      await tx.auditLog.create({data:{actorId:actor.sub,action:dto.approved?'BODY_CLOUD_AUTHORIZE':'BODY_CLOUD_DECLINE',resourceType:'BODY_CLOUD_REQUEST',resourceId:id,metadata:{noticeVersion:row.noticeVersion,imageSha256:row.imageSha256}}});
      return this.view(await tx.bodyCloudOcrRequest.findUniqueOrThrow({where:{id}}));
    });
  }
  async revoke(req: Request,id: string) {
    const {actor,row} = await this.row(req,id);
    return this.transaction(async tx => {
      await this.reports.assertCurrentEnrollment(tx,actor,row.patientId);
      const changed=await tx.bodyCloudOcrRequest.updateMany({where:{id,state:{in:['WAITING_AUTH','APPROVED']}},data:{state:'REVOKED'}});
      if(changed.count!==1)throw new ConflictException('已发起或结束的调用不能撤回供应商已接收的数据；不会再次自动发送');
      await tx.auditLog.create({data:{actorId:actor.sub,action:'BODY_CLOUD_REVOKE',resourceType:'BODY_CLOUD_REQUEST',resourceId:id}});
      return this.view(await tx.bodyCloudOcrRequest.findUniqueOrThrow({where:{id}}));
    });
  }
  async run(req: Request,id: string) {
    const {actor,row} = await this.row(req,id); this.staff(actor);
    // Replays only return current persisted state. They never invoke the transport a second time.
    if (['IN_FLIGHT','SUCCEEDED','FAILED','UNKNOWN','CANCELLED'].includes(row.state)) return {request:this.view(row),draft:await this.reports.getOcrDraft(req,row.draftId)};
    const policy = this.enabled(); const provider = this.provider(); const day = shanghaiDay();
    await this.transaction(async tx => {
      await this.reports.assertCurrentEnrollment(tx,actor,row.patientId);
      const current = await tx.bodyCloudOcrRequest.findUniqueOrThrow({where:{id}});
      if(current.state!=='APPROVED' || current.expiresAt.getTime()<=Date.now() || current.authorizedById!==row.patientId
        || current.model!==policy.model || current.region!==policy.region || current.noticeSha256!==policy.noticeSha256) throw new ConflictException('缺少该图片的有效逐次授权，或配置/告知已改变');
      const draft=await tx.ocrDraft.findUniqueOrThrow({where:{id:row.draftId}});
      if(!['FAILED','UNCONFIGURED'].includes(draft.status))throw new ConflictException('草稿已修改或确认，请重新读取，未发送');
      await this.reports.assertBoundSource(tx,draft);
      const asset=await tx.mediaAsset.findUniqueOrThrow({where:{id:row.mediaAssetId}});
      if(asset.ownerId!==actor.sub || asset.sha256!==row.imageSha256)throw new ForbiddenException('图片归属或内容已改变');
      await tx.bodyCloudOcrBudget.upsert({where:{day},create:{day,limitMicro:BODY_CLOUD_LIMIT_MICRO},update:{}});
      const held=await tx.$executeRaw`UPDATE BodyCloudOcrBudget SET heldMicro=heldMicro+${BODY_CLOUD_RESERVE_MICRO}, updatedAt=NOW(3) WHERE day=${day} AND blocked=false AND limitMicro=${BODY_CLOUD_LIMIT_MICRO} AND usedMicro+heldMicro+${BODY_CLOUD_RESERVE_MICRO}<=limitMicro`;
      if(held!==1)throw new ServiceUnavailableException('今日项目云识别预算不足或用量待核实，可手工录入；图片未发送');
      const claimed=await tx.bodyCloudOcrRequest.updateMany({where:{id,state:'APPROVED'},data:{state:'IN_FLIGHT',budgetDay:day,reservedMicro:BODY_CLOUD_RESERVE_MICRO,sentAt:new Date()}});
      if(claimed.count!==1)throw new ConflictException('请求已办理，请读取结果；不会重复发送');
      await tx.ocrDraft.update({where:{id:row.draftId},data:{provider:'bailian-cloud',status:'PROCESSING',errorMessage:'云识别处理中；不得自动重试或确认。'}});
      await tx.auditLog.create({data:{actorId:actor.sub,action:'BODY_CLOUD_CLAIM',resourceType:'BODY_CLOUD_REQUEST',resourceId:id,metadata:{day,reservedMicro:BODY_CLOUD_RESERVE_MICRO}}});
    });
    let result: VisionExtraction;
    try {
      const image=await this.media.readOwnedImageForOcr(actor,row.mediaAssetId);
      // Loader verifies stored byte hash; recheck the consent hash too before any transport.
      const {createHash}=await import('node:crypto');
      if(createHash('sha256').update(image.bytes).digest('hex')!==row.imageSha256)throw new Error('image changed');
      await this.actor(req,row.patientId);
      // A throwing transport has an unknown outcome, never a free pre-send failure.
      const minimized=minimizeBodyImage(image);
      if(minimized.sha256!==row.inputSha256)throw new Error('input changed');
      try { result=await provider.recognize({image:minimized}); }
      catch { result={status:'FAILED',fields:{},errorMessage:'供应商调用结果未核实，请手工核对。',attempted:true}; }
    } catch { result={status:'FAILED',fields:{},errorMessage:'发送前校验或读取失败，未进行供应商调用，可手工核对。',attempted:false}; }
    const actual=usageCostMicro(result.usage);
    const unknown=result.attempted!==false && actual===null;
    const charged=result.attempted===false?0:actual;
    await this.transaction(async tx => {
      const current=await tx.bodyCloudOcrRequest.findUniqueOrThrow({where:{id}});
      if(current.state!=='IN_FLIGHT')throw new ConflictException('调用状态已改变；保留预算预占，禁止自动重试');
      if(unknown) await tx.bodyCloudOcrBudget.update({where:{day},data:{blocked:true}});
      else await tx.bodyCloudOcrBudget.update({where:{day},data:{heldMicro:{decrement:BODY_CLOUD_RESERVE_MICRO},usedMicro:{increment:charged!}}});
      const success=result.status==='DRAFT' && !unknown;
      const saved=await tx.ocrDraft.updateMany({where:{id:row.draftId,status:'PROCESSING'},data:{status:success?'DRAFT':'FAILED',fields:json(success?result.fields:{}),errorMessage:success?null:unknown?'供应商调用用量未核实；保留费用预占并暂停当天云识别，可手工核对。':result.errorMessage ?? '识别失败，可手工核对。'}});
      if(saved.count!==1)throw new ConflictException('草稿状态已改变，保留费用预占并人工核查');
      await tx.bodyCloudOcrRequest.update({where:{id},data:{state:unknown?'UNKNOWN':success?'SUCCEEDED':'FAILED',actualMicro:charged, inputTokens:result.usage?.inputTokens,outputTokens:result.usage?.outputTokens,finishedAt:new Date(),errorCode:unknown?'USAGE_UNKNOWN':success?null:result.attempted===false?'PRE_SEND_FAILED':'PROVIDER_FAILED'}});
      await tx.auditLog.create({data:{actorId:actor.sub,action:'BODY_CLOUD_FINISH',resourceType:'BODY_CLOUD_REQUEST',resourceId:id,metadata:{day,state:unknown?'UNKNOWN':success?'SUCCEEDED':'FAILED',usageVerified:!unknown,...(result.supplierRequestId?{supplierRequestId:result.supplierRequestId}:{})}}});
    });
    const final=await this.db.bodyCloudOcrRequest.findUniqueOrThrow({where:{id}});
    return {request:this.view(final),draft:await this.reports.getOcrDraft(req,row.draftId)};
  }
}
@Controller('body-cloud-ocr')
export class BodyCloudOcrController {
  constructor(private readonly service:BodyCloudOcrService){}
  @Get('provider') provider(@Req() req:Request){return this.service.providerStatus(req);}
  @Get('patients/:id/requests') list(@Req() req:Request,@Param('id') id:string){return this.service.list(req,id);}
  @Post('patients/:id/requests') prepare(@Req() req:Request,@Param('id') id:string,@Body() dto:PrepareBodyCloudDto){return this.service.prepare(req,id,dto);}
  @Get('requests/:id') get(@Req() req:Request,@Param('id') id:string){return this.service.get(req,id);}
  @Post('requests/:id/authorize') authorize(@Req() req:Request,@Param('id') id:string,@Body() dto:AuthorizeBodyCloudDto){return this.service.authorize(req,id,dto);}
  @Post('requests/:id/revoke') revoke(@Req() req:Request,@Param('id') id:string){return this.service.revoke(req,id);}
  @Post('requests/:id/run') run(@Req() req:Request,@Param('id') id:string){return this.service.run(req,id);}
}
