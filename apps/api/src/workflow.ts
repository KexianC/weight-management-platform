import { Body, Controller, ForbiddenException, Get, Injectable, Param, Patch, Post, Req } from '@nestjs/common';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Request } from 'express';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';

class WeightDto { @IsNumber() @Min(30) @Max(300) weightKg!: number; @IsNumber() @Min(30) @Max(300) @IsOptional() waistCm?: number; @IsNumber() @Min(1) @Max(80) @IsOptional() bodyFatPct?: number; @IsDateString() measuredAt!: string; @IsString() @IsOptional() note?: string; }
class MessageDto { @IsString() @IsNotEmpty() receiverId!: string; @IsString() @IsNotEmpty() content!: string; }
class FollowUpDto { @IsString() @IsNotEmpty() patientId!: string; @IsDateString() scheduledAt!: string; @IsString() @IsOptional() summary?: string; }
class StatusDto { @IsIn(['IN_PROGRESS','COMPLETED','CANCELLED']) status!: 'IN_PROGRESS'|'COMPLETED'|'CANCELLED'; @IsString() @IsOptional() summary?: string; }

@Injectable()
export class WorkflowService {
  constructor(private prisma: PrismaService, private clinical: ClinicalService) {}
  async dashboard(req: Request) {
    const actor = await this.clinical.actor(req);
    if (actor.role !== 'PATIENT') throw new ForbiddenException();
    const [records,tasks,notifications] = await Promise.all([
      this.prisma.healthRecord.findMany({where:{patientId:actor.sub},orderBy:{measuredAt:'desc'},take:30}),
      this.prisma.patientTask.findMany({where:{patientId:actor.sub},orderBy:{createdAt:'desc'},take:20}),
      this.prisma.notification.findMany({where:{userId:actor.sub},orderBy:{createdAt:'desc'},take:20}),
    ]);
    return { records, tasks, notifications };
  }
  async addWeight(req:Request,dto:WeightDto){
    const actor=await this.clinical.actor(req); if(actor.role!=='PATIENT') throw new ForbiddenException();
    const record=await this.prisma.healthRecord.create({data:{patientId:actor.sub,weightKg:dto.weightKg,waistCm:dto.waistCm,bodyFatPct:dto.bodyFatPct,measuredAt:new Date(dto.measuredAt),note:dto.note}});
    await this.prisma.auditLog.create({data:{actorId:actor.sub,action:'HEALTH_RECORD_CREATE',resourceType:'HEALTH_RECORD',resourceId:record.id}}); return record;
  }
  async completeTask(req:Request,id:string){
    const actor=await this.clinical.actor(req); if(actor.role!=='PATIENT') throw new ForbiddenException();
    const task=await this.prisma.patientTask.findFirst({where:{id,patientId:actor.sub}}); if(!task) throw new ForbiddenException();
    return this.prisma.patientTask.update({where:{id},data:{status:'COMPLETED',completedAt:new Date()}});
  }
  async sendMessage(req:Request,dto:MessageDto){
    const actor=await this.clinical.actor(req); const patientId=actor.role==='PATIENT'?actor.sub:dto.receiverId; const practitionerId=actor.role==='PATIENT'?dto.receiverId:actor.sub;
    await this.clinical.assertCare(actor.role==='PATIENT'?{...actor,sub:practitionerId,role:'DOCTOR'}:actor,patientId);
    return this.prisma.message.create({data:{senderId:actor.sub,receiverId:dto.receiverId,content:dto.content.slice(0,4000)}});
  }
  async messages(req:Request,peerId:string){
    const actor=await this.clinical.actor(req); const patientId=actor.role==='PATIENT'?actor.sub:peerId; const practitionerId=actor.role==='PATIENT'?peerId:actor.sub;
    const relation=await this.prisma.careRelation.findFirst({where:{patientId,practitionerId,status:'ACTIVE'}}); if(!relation) throw new ForbiddenException();
    return this.prisma.message.findMany({where:{OR:[{senderId:actor.sub,receiverId:peerId},{senderId:peerId,receiverId:actor.sub}]},orderBy:{createdAt:'asc'},take:200});
  }
  async createFollowUp(req:Request,dto:FollowUpDto){
    const actor=await this.clinical.actor(req); await this.clinical.assertCare(actor,dto.patientId); if(actor.role==='PATIENT') throw new ForbiddenException();
    return this.prisma.followUp.create({data:{patientId:dto.patientId,practitionerId:actor.sub,scheduledAt:new Date(dto.scheduledAt),summary:dto.summary}});
  }
  async updateFollowUp(req:Request,id:string,dto:StatusDto){
    const actor=await this.clinical.actor(req); const row=await this.prisma.followUp.findFirst({where:{id,practitionerId:actor.sub}}); if(!row) throw new ForbiddenException();
    const updated=await this.prisma.followUp.update({where:{id},data:{status:dto.status,summary:dto.summary}}); await this.prisma.auditLog.create({data:{actorId:actor.sub,action:'FOLLOW_UP_STATUS_CHANGE',resourceType:'FOLLOW_UP',resourceId:id,metadata:{status:dto.status}}}); return updated;
  }
  async readAll(req:Request){const actor=await this.clinical.actor(req);return this.prisma.notification.updateMany({where:{userId:actor.sub,readAt:null},data:{readAt:new Date()}})}
}

@Controller('workflow')
export class WorkflowController {
  constructor(private service:WorkflowService){}
  @Get('me/dashboard') dashboard(@Req() req:Request){return this.service.dashboard(req)}
  @Post('me/health-records') weight(@Req() req:Request,@Body() dto:WeightDto){return this.service.addWeight(req,dto)}
  @Patch('me/tasks/:id/complete') task(@Req() req:Request,@Param('id') id:string){return this.service.completeTask(req,id)}
  @Get('messages/:peerId') messages(@Req() req:Request,@Param('peerId') peerId:string){return this.service.messages(req,peerId)}
  @Post('messages') message(@Req() req:Request,@Body() dto:MessageDto){return this.service.sendMessage(req,dto)}
  @Post('follow-ups') followUp(@Req() req:Request,@Body() dto:FollowUpDto){return this.service.createFollowUp(req,dto)}
  @Patch('follow-ups/:id') updateFollowUp(@Req() req:Request,@Param('id') id:string,@Body() dto:StatusDto){return this.service.updateFollowUp(req,id,dto)}
  @Patch('me/notifications/read-all') readAll(@Req() req:Request){return this.service.readAll(req)}
}
