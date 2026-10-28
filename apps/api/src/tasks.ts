import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { ClinicalService } from './clinical';
import { assertTaskTransition, type TaskState } from './domain';
import { businessProjection } from './business-projection';
import { PrismaService } from './prisma.service';

const taskTypes = ['WEIGHT', 'DIET', 'EXERCISE', 'MEDICATION', 'QUESTIONNAIRE', 'GENERAL'] as const;
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const taskStatuses = ['PENDING', 'IN_PROGRESS', 'OVERDUE', 'COMPLETED', 'CANCELLED'] as const;
const asJson = (value: unknown) => value === undefined || value === null ? undefined : value as Prisma.InputJsonValue;

class TaskQueryDto {
  @IsString() @IsOptional() patientId?: string;
  @IsIn(taskStatuses) @IsOptional() status?: typeof taskStatuses[number];
  @IsIn(taskTypes) @IsOptional() taskType?: typeof taskTypes[number];
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 30;
}

class CreateTaskDto {
  @IsString() @IsOptional() patientId?: string;
  @IsIn(taskTypes) @IsOptional() taskType: typeof taskTypes[number] = 'GENERAL';
  @IsIn(priorities) @IsOptional() priority: typeof priorities[number] = 'NORMAL';
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(500) @IsOptional() description?: string;
  @IsObject() @IsOptional() content?: Record<string, unknown>;
  @IsObject() @IsOptional() recurrenceRule?: Record<string, unknown>;
  @IsDateString() @IsOptional() dueAt?: string;
}

class UpdateTaskDto {
  @IsIn(taskTypes) @IsOptional() taskType?: typeof taskTypes[number];
  @IsIn(priorities) @IsOptional() priority?: typeof priorities[number];
  @IsString() @MaxLength(120) @IsOptional() title?: string;
  @IsString() @MaxLength(500) @IsOptional() description?: string;
  @IsObject() @IsOptional() content?: Record<string, unknown>;
  @IsDateString() @IsOptional() dueAt?: string;
}

class CompleteTaskDto {
  @IsObject() @IsOptional() result?: Record<string, unknown>;
}

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private async actor(req: Request) { return this.clinical.actor(req); }

  private async taskForActor(req: Request, id: string, readOnly = false) {
    const actor = await this.actor(req);
    if (actor.role !== 'PATIENT' && actor.role !== 'HEALTH_MANAGER') this.clinical.assertPractitioner(actor);
    const task = await this.prisma.patientTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');
    if (actor.role === 'HEALTH_MANAGER' && !readOnly) throw new ForbiddenException('健管师全量任务权限仅为只读');
    if (actor.role === 'HEALTH_MANAGER' && readOnly) { await this.clinical.assertCare(actor,task.patientId); return {actor,task}; }
    if (actor.role === 'PATIENT' ? task.patientId !== actor.sub : task.assignedById !== actor.sub) throw new NotFoundException('任务不存在');
    return { actor, task };
  }

  async list(req: Request, query: TaskQueryDto) {
    const actor = await this.actor(req);
    if (actor.role === 'PATIENT') {
      await this.prisma.patientTask.updateMany({
        where: { patientId: actor.sub, status: 'PENDING', dueAt: { lt: new Date() } },
        data: { status: 'OVERDUE' },
      });
    } else if (actor.role !== 'HEALTH_MANAGER') {
      this.clinical.assertPractitioner(actor);
      await this.prisma.patientTask.updateMany({
        where: { assignedById: actor.sub, status: 'PENDING', dueAt: { lt: new Date() } },
        data: { status: 'OVERDUE' },
      });
      if (query.patientId) await this.clinical.assertCare(actor, query.patientId);
    } else if (query.patientId) {
      await this.clinical.assertCare(actor, query.patientId);
    }
    const where = actor.role === 'PATIENT'
      ? { patientId: actor.sub }
      : actor.role === 'HEALTH_MANAGER' ? { patient: { status: 'ACTIVE' as const }, ...(query.patientId ? { patientId: query.patientId } : {}) } : { assignedById: actor.sub, ...(query.patientId ? { patientId: query.patientId } : {}) };
    const filters = { ...where, ...(query.status ? { status: query.status } : {}), ...(query.taskType ? { taskType: query.taskType } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.patientTask.findMany({
        where: filters,
        include: { patient: { select: { id: true, displayName: true, avatarUrl: true } }, assignedBy: { select: { id: true, displayName: true, role: true } } },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: (Number(query.page) - 1) * Number(query.pageSize),
        take: Number(query.pageSize),
      }),
      this.prisma.patientTask.count({ where: filters }),
    ]);
    return { items:businessProjection(items), total, page: Number(query.page), pageSize: Number(query.pageSize) };
  }

  async create(req: Request, dto: CreateTaskDto, routePatientId?: string) {
    const actor = await this.actor(req);
    this.clinical.assertPractitioner(actor);
    const patientId = routePatientId ?? dto.patientId;
    if (!patientId) throw new NotFoundException('请选择患者');
    await this.clinical.assertCare(actor, patientId);
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.patientTask.create({
        data: {
          patientId,
          assignedById: actor.sub,
          taskType: dto.taskType,
          priority: dto.priority,
          title: dto.title.trim(),
          description: dto.description,
          content: asJson(dto.content),
          recurrenceRule: asJson(dto.recurrenceRule),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        },
      });
      await tx.notification.create({
        data: { userId: patientId, type: 'TASK', priority: dto.priority, title: '收到新的健康任务', content: dto.title, relatedType: 'PATIENT_TASK', relatedId: task.id, actionPath: `/pages/common/task-detail?id=${task.id}` },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'TASK_CREATE', resourceType: 'PATIENT_TASK', resourceId: task.id, metadata: { patientId } } });
      return task;
    });
  }

  async detail(req: Request, id: string) {
    const { task } = await this.taskForActor(req, id, true);
    return businessProjection(task);
  }

  async update(req: Request, id: string, dto: UpdateTaskDto) {
    const { actor, task } = await this.taskForActor(req, id);
    this.clinical.assertPractitioner(actor);
    await this.clinical.assertCare(actor, task.patientId);
    if (!['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(task.status)) throw new ForbiddenException('已结束任务不能编辑');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.patientTask.updateMany({
        where: { id, status: task.status },
        data: {
          taskType: dto.taskType,
          priority: dto.priority,
          title: dto.title?.trim(),
          description: dto.description,
          content: asJson(dto.content),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        },
      });
      if (claimed.count !== 1) throw new ConflictException('任务状态已变化，请刷新后重试');
      const updated = await tx.patientTask.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('任务不存在');
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'TASK_UPDATE', resourceType: 'PATIENT_TASK', resourceId: id } });
      return updated;
    });
  }

  async transition(req: Request, id: string, next: TaskState, dto: CompleteTaskDto = {}) {
    const { actor, task } = await this.taskForActor(req, id);
    if (task.status === next) return task;
    if (next === 'CANCELLED') this.clinical.assertPractitioner(actor);
    await this.clinical.assertActiveRelation(task.patientId, task.assignedById);
    assertTaskTransition(task.status as TaskState, next, actor.role);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.patientTask.updateMany({
        where: { id, status: task.status },
        data: {
          status: next,
          result: asJson(dto.result),
          ...(next === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(next === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
        },
      });
      if (claimed.count !== 1) throw new ConflictException('任务状态已变化，请刷新后重试');
      const updated = await tx.patientTask.findUnique({ where: { id } });
      if (!updated) throw new NotFoundException('任务不存在');
      const notifyUserId = actor.role === 'PATIENT' ? task.assignedById : task.patientId;
      await tx.notification.create({
        data: { userId: notifyUserId, type: 'TASK', title: next === 'COMPLETED' ? '健康任务已完成' : next === 'CANCELLED' ? '健康任务已取消' : '健康任务已开始', content: task.title, relatedType: 'PATIENT_TASK', relatedId: id },
      });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: `TASK_${next}`, resourceType: 'PATIENT_TASK', resourceId: id } });
      return updated;
    });
  }

  async remove(req: Request, id: string) {
    const { actor, task } = await this.taskForActor(req, id);
    this.clinical.assertPractitioner(actor);
    if (!['PENDING', 'CANCELLED'].includes(task.status)) throw new ForbiddenException('进行中或已完成任务不能删除');
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'TASK_DELETE', resourceType: 'PATIENT_TASK', resourceId: id } });
      const deleted = await tx.patientTask.deleteMany({ where: { id, status: task.status } });
      if (deleted.count !== 1) throw new ConflictException('任务状态已变化，请刷新后重试');
    });
    return { deleted: true, id };
  }

  async stats(req: Request) {
    const actor = await this.actor(req);
    const where = actor.role === 'PATIENT' ? { patientId: actor.sub } : { assignedById: actor.sub };
    if (actor.role !== 'PATIENT') this.clinical.assertPractitioner(actor);
    const groups = await this.prisma.patientTask.groupBy({ by: ['status'], where, _count: { _all: true } });
    return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  }
}

@Controller()
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get(['tasks', 'me/tasks'])
  list(@Req() req: Request, @Query() query: TaskQueryDto) { return this.service.list(req, query); }

  @Get('tasks/stats')
  stats(@Req() req: Request) { return this.service.stats(req); }

  @Post('tasks')
  create(@Req() req: Request, @Body() dto: CreateTaskDto) { return this.service.create(req, dto); }

  @Post('clinical/patients/:patientId/tasks')
  createForPatient(@Req() req: Request, @Param('patientId') patientId: string, @Body() dto: CreateTaskDto) { return this.service.create(req, dto, patientId); }

  @Get(['tasks/:id', 'me/tasks/:id'])
  detail(@Req() req: Request, @Param('id') id: string) { return this.service.detail(req, id); }

  @Patch('tasks/:id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateTaskDto) { return this.service.update(req, id, dto); }

  @Post(['tasks/:id/start', 'me/tasks/:id/start'])
  start(@Req() req: Request, @Param('id') id: string) { return this.service.transition(req, id, 'IN_PROGRESS'); }

  @Post(['tasks/:id/complete', 'me/tasks/:id/complete'])
  complete(@Req() req: Request, @Param('id') id: string, @Body() dto: CompleteTaskDto) { return this.service.transition(req, id, 'COMPLETED', dto); }

  @Patch('me/tasks/:id/complete')
  completeLegacy(@Req() req: Request, @Param('id') id: string, @Body() dto: CompleteTaskDto) { return this.service.transition(req, id, 'COMPLETED', dto); }

  @Post('tasks/:id/cancel')
  cancel(@Req() req: Request, @Param('id') id: string) { return this.service.transition(req, id, 'CANCELLED'); }

  @Delete('tasks/:id')
  remove(@Req() req: Request, @Param('id') id: string) { return this.service.remove(req, id); }
}
