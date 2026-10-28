import {
  BadRequestException,
  Body,
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
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { Actor } from './auth';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';

const messageTypes = ['TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'HEALTH_RECORD'] as const;
const notificationTypes = ['GENERAL', 'FOLLOW_UP', 'MESSAGE', 'TASK', 'HEALTH_ALERT', 'RELATION', 'SYSTEM'] as const;
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const asJson = (value: unknown) => value === undefined || value === null ? undefined : value as Prisma.InputJsonValue;

class SendMessageDto {
  @IsString() @IsOptional() receiverId?: string;
  @IsString() @MaxLength(4000) @IsOptional() content = '';
  @IsIn(messageTypes) @IsOptional() messageType: typeof messageTypes[number] = 'TEXT';
  @IsIn(messageTypes) @IsOptional() type?: typeof messageTypes[number];
  @IsString() @MaxLength(80) @IsOptional() relatedId?: string;
  @IsString() @MaxLength(50) @IsOptional() relatedType?: string;
  @IsArray() @IsOptional() attachments?: Array<Record<string, unknown>>;
}

class MessageQueryDto {
  @IsString() @IsOptional() peerId?: string;
  @IsString() @IsOptional() receiverId?: string;
  @IsString() @IsOptional() relatedId?: string;
  @IsString() @IsOptional() relatedType?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 30;
}

class ReadMessagesDto {
  @IsArray() @IsOptional() messageIds?: string[];
  @IsString() @IsOptional() peerId?: string;
  @IsString() @IsOptional() senderId?: string;
  @IsString() @IsOptional() otherUserId?: string;
}

class NotificationQueryDto {
  @IsIn(notificationTypes) @IsOptional() type?: typeof notificationTypes[number];
  @IsString() @IsOptional() unread?: string;
  @Type(() => Number) @IsInt() @Min(1) @IsOptional() page: number = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() pageSize: number = 30;
}

class CreateNotificationDto {
  @IsString() @IsOptional() userId?: string;
  @IsIn(notificationTypes) @IsOptional() type: typeof notificationTypes[number] = 'GENERAL';
  @IsIn(priorities) @IsOptional() priority: typeof priorities[number] = 'NORMAL';
  @IsString() @MaxLength(120) title!: string;
  @IsString() @MaxLength(500) content!: string;
  @IsString() @MaxLength(50) @IsOptional() relatedType?: string;
  @IsString() @MaxLength(80) @IsOptional() relatedId?: string;
  @IsString() @MaxLength(500) @IsOptional() actionPath?: string;
  @IsObject() @IsOptional() metadata?: Record<string, unknown>;
}

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private messageAccounts(actor: Actor): Prisma.MessageWhereInput {
    return actor.role === 'HEALTH_MANAGER' ? { sender: { status: 'ACTIVE' }, receiver: { status: 'ACTIVE' } } : {};
  }

  private async assertVisiblePeer(actor: Actor, peerId: string) {
    if (actor.role !== 'HEALTH_MANAGER') return;
    const peer = await this.prisma.user.findUnique({ where: { id: peerId }, select: { status: true } });
    if (!peer || peer.status !== 'ACTIVE') throw new NotFoundException('用户不存在');
  }

  // Historic message notifications carry the sender's name and message body.
  // Keep the same visibility as their source message, including counts and reads.
  private async notificationAccounts(actor: Actor): Promise<Prisma.NotificationWhereInput> {
    if (actor.role !== 'HEALTH_MANAGER') return {};
    const messages = await this.prisma.message.findMany({
      where: { OR: [
        { senderId: actor.sub, receiver: { status: { not: 'ACTIVE' } } },
        { receiverId: actor.sub, sender: { status: { not: 'ACTIVE' } } },
      ] },
      select: { id: true },
    });
    return messages.length ? { AND: [{ OR: [
      { relatedType: null }, { relatedType: { not: 'MESSAGE' } },
      { relatedId: null }, { relatedId: { notIn: messages.map((message) => message.id) } },
    ] }] } : {};
  }

  async send(req: Request, dto: SendMessageDto) {
    const actor = await this.clinical.actor(req);
    if (!dto.receiverId) throw new BadRequestException('请选择消息接收人');
    const receiverId = dto.receiverId;
    const relation = await this.clinical.assertPeer(actor, receiverId);
    const type = dto.type ?? dto.messageType;
    if (type === 'SYSTEM') throw new ForbiddenException('系统消息只能由服务端生成');
    if (!dto.content.trim() && (!dto.attachments || dto.attachments.length === 0)) throw new ForbiddenException('消息内容不能为空');
    if ((dto.attachments?.length ?? 0) > 10) throw new ForbiddenException('单条消息最多包含 10 个附件');
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          senderId: actor.sub,
          receiverId,
          type,
          content: dto.content.trim(),
          attachments: asJson(dto.attachments),
          contextType: dto.relatedType,
          contextId: dto.relatedId,
        },
      });
      const sender = await tx.user.findUnique({ where: { id: actor.sub }, select: { displayName: true } });
      const notificationContent = Array.from(dto.content.trim() || '[附件]').slice(0, 500).join('');
      await tx.notification.create({
        data: {
          userId: receiverId,
          type: 'MESSAGE',
          title: `${sender?.displayName ?? '服务联系人'}发来新消息`,
          content: notificationContent,
          relatedType: 'MESSAGE',
          relatedId: message.id,
          metadata: asJson({ contextType: dto.relatedType ?? null, contextId: dto.relatedId ?? null }),
          actionPath: `/pages/common/messages?userId=${actor.sub}`,
        },
      });
      await tx.careRelation.update({ where: { id: relation.id }, data: { lastContactAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'MESSAGE_SEND', resourceType: 'MESSAGE', resourceId: message.id, metadata: { receiverId, type } } });
      return message;
    });
  }

  async messages(req: Request, query: MessageQueryDto, routePeerId?: string) {
    const actor = await this.clinical.actor(req);
    const peerId = routePeerId ?? query.peerId ?? query.receiverId;
    if (!peerId) return this.conversations(req);
    await this.assertVisiblePeer(actor, peerId);
    const relation = await this.prisma.careRelation.findFirst({
      where: actor.role === 'PATIENT' ? { patientId: actor.sub, practitionerId: peerId } : { patientId: peerId, practitionerId: actor.sub },
    });
    if (!relation) throw new ForbiddenException('没有与该用户的服务关系');
    const visibility = {
      ...this.messageAccounts(actor),
      // A care relationship has one continuous conversation. Context fields are
      // retained as message metadata, but must not partition what either side sees.
      OR: [
        { senderId: actor.sub, receiverId: peerId, deletedBySenderAt: null },
        { senderId: peerId, receiverId: actor.sub, deletedByReceiverAt: null },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.message.findMany({
        where: visibility,
        orderBy: { createdAt: 'desc' },
        skip: (Number(query.page) - 1) * Number(query.pageSize),
        take: Number(query.pageSize),
      }),
      this.prisma.message.count({ where: visibility }),
    ]);
    return { items: rows.reverse(), total, page: Number(query.page), pageSize: Number(query.pageSize), canSend: relation.status === 'ACTIVE', peerId };
  }

  async conversations(req: Request) {
    const actor = await this.clinical.actor(req);
    const messages = await this.prisma.message.findMany({
      where: {
        ...this.messageAccounts(actor),
        OR: [
          { senderId: actor.sub, deletedBySenderAt: null },
          { receiverId: actor.sub, deletedByReceiverAt: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const peers = new Map<string, { latest: typeof messages[number]; unreadCount: number }>();
    for (const message of messages) {
      const peerId = message.senderId === actor.sub ? message.receiverId : message.senderId;
      const current = peers.get(peerId);
      if (!current) peers.set(peerId, { latest: message, unreadCount: 0 });
      if (message.receiverId === actor.sub && !message.readAt) peers.get(peerId)!.unreadCount += 1;
    }
    const users = await this.prisma.user.findMany({ where: { id: { in: [...peers.keys()] }, ...(actor.role === 'HEALTH_MANAGER' ? { status: 'ACTIVE' as const } : {}) }, select: { id: true, displayName: true, avatarUrl: true, role: true } });
    const relations = await this.prisma.careRelation.findMany({
      where: actor.role === 'PATIENT' ? { patientId: actor.sub, practitionerId: { in: [...peers.keys()] } } : { practitionerId: actor.sub, patientId: { in: [...peers.keys()] } },
    });
    const relationByPeer = new Map(relations.map((relation) => [actor.role === 'PATIENT' ? relation.practitionerId : relation.patientId, relation]));
    const userById = new Map(users.map((user) => [user.id, user]));
    return [...peers.entries()].filter(([peerId]) => actor.role !== 'HEALTH_MANAGER' || userById.has(peerId)).map(([peerId, data]) => ({
      id: peerId,
      peerId,
      peer: userById.get(peerId),
      latestMessage: data.latest,
      unreadCount: data.unreadCount,
      canSend: relationByPeer.get(peerId)?.status === 'ACTIVE',
    }));
  }

  async read(req: Request, dto: ReadMessagesDto, singleId?: string) {
    const actor = await this.clinical.actor(req);
    const ids = singleId ? [singleId] : dto.messageIds;
    const peerId = dto.peerId ?? dto.senderId ?? dto.otherUserId;
    if (!ids?.length && !peerId) throw new BadRequestException('请指定要标记已读的消息或对话');
    if (peerId) await this.assertVisiblePeer(actor, peerId);
    const result = await this.prisma.message.updateMany({
      where: { receiverId: actor.sub, readAt: null, ...this.messageAccounts(actor), ...(ids?.length ? { id: { in: ids } } : {}), ...(peerId ? { senderId: peerId } : {}) },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async removeMessage(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const message = await this.prisma.message.findUnique({ where: { ...this.messageAccounts(actor), id } });
    if (!message || ![message.senderId, message.receiverId].includes(actor.sub)) throw new NotFoundException('消息不存在');
    await this.prisma.message.update({
      where: { id },
      data: message.senderId === actor.sub ? { deletedBySenderAt: new Date() } : { deletedByReceiverAt: new Date() },
    });
    return { deleted: true, id };
  }

  async message(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const message = await this.prisma.message.findUnique({
      where: { ...this.messageAccounts(actor), id },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true, role: true } },
        receiver: { select: { id: true, displayName: true, avatarUrl: true, role: true } },
      },
    });
    if (!message || ![message.senderId, message.receiverId].includes(actor.sub)) throw new NotFoundException('消息不存在');
    if ((message.senderId === actor.sub && message.deletedBySenderAt) || (message.receiverId === actor.sub && message.deletedByReceiverAt)) {
      throw new NotFoundException('消息不存在');
    }
    return message;
  }

  async unreadMessages(req: Request) {
    const actor = await this.clinical.actor(req);
    return { count: await this.prisma.message.count({ where: { receiverId: actor.sub, readAt: null, deletedByReceiverAt: null, ...this.messageAccounts(actor) } }) };
  }

  async activities(req: Request) {
    const actor = await this.clinical.actor(req);
    const notificationAccounts = await this.notificationAccounts(actor);
    const [messages, notifications] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          ...this.messageAccounts(actor),
          OR: [
            { senderId: actor.sub, deletedBySenderAt: null },
            { receiverId: actor.sub, deletedByReceiverAt: null },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.notification.findMany({
        where: { userId: actor.sub, ...notificationAccounts, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return [...messages.map((item) => ({ kind: 'MESSAGE', at: item.createdAt, item })), ...notifications.map((item) => ({ kind: 'NOTIFICATION', at: item.createdAt, item }))]
      .sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20);
  }

  async notifications(req: Request, query: NotificationQueryDto) {
    const actor = await this.clinical.actor(req);
    const where = {
      userId: actor.sub,
      ...await this.notificationAccounts(actor),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      ...(query.type ? { type: query.type } : {}),
      ...(query.unread === 'true' ? { readAt: null } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (Number(query.page) - 1) * Number(query.pageSize), take: Number(query.pageSize) }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page: Number(query.page), pageSize: Number(query.pageSize) };
  }

  async createNotification(req: Request, dto: CreateNotificationDto) {
    const actor = await this.clinical.actor(req);
    if (['EXERCISE_REPORT_READY', 'EXERCISE_REPORT_SHARED'].includes(dto.relatedType?.toUpperCase() ?? '')) {
      throw new ForbiddenException('运动报告通知只能通过处方提交或报告分享生成');
    }
    const userId = dto.userId ?? actor.sub;
    if (userId !== actor.sub) {
      this.clinical.assertPractitioner(actor);
      await this.clinical.assertCare(actor, userId);
    }
    return this.prisma.notification.create({
      data: { userId, type: dto.type, priority: dto.priority, title: dto.title, content: dto.content, relatedType: dto.relatedType, relatedId: dto.relatedId, actionPath: dto.actionPath, metadata: asJson(dto.metadata) },
    });
  }

  async readNotification(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const result = await this.prisma.notification.updateMany({ where: { id, userId: actor.sub, ...await this.notificationAccounts(actor) }, data: { readAt: new Date() } });
    if (!result.count) throw new NotFoundException('通知不存在');
    return { read: true, id };
  }

  async readAllNotifications(req: Request) {
    const actor = await this.clinical.actor(req);
    const result = await this.prisma.notification.updateMany({ where: { userId: actor.sub, readAt: null, ...await this.notificationAccounts(actor) }, data: { readAt: new Date() } });
    return { updated: result.count };
  }

  async unreadNotifications(req: Request) {
    const actor = await this.clinical.actor(req);
    return { count: await this.prisma.notification.count({ where: { userId: actor.sub, readAt: null, ...await this.notificationAccounts(actor), OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }) };
  }

  async removeNotification(req: Request, id: string) {
    const actor = await this.clinical.actor(req);
    const result = await this.prisma.notification.deleteMany({ where: { id, userId: actor.sub, ...await this.notificationAccounts(actor) } });
    if (!result.count) throw new NotFoundException('通知不存在');
    return { deleted: true, id };
  }
}

@Controller()
export class CommunicationsController {
  constructor(private readonly service: CommunicationsService) {}

  @Get('messages/conversations')
  conversations(@Req() req: Request) { return this.service.conversations(req); }

  @Get('messages/unread-count')
  unread(@Req() req: Request) { return this.service.unreadMessages(req); }

  @Get('messages/activities')
  activities(@Req() req: Request) { return this.service.activities(req); }

  @Get('messages/item/:id')
  message(@Req() req: Request, @Param('id') id: string) { return this.service.message(req, id); }

  @Get('messages/conversations/:peerId/messages')
  conversation(@Req() req: Request, @Param('peerId') peerId: string, @Query() query: MessageQueryDto) { return this.service.messages(req, query, peerId); }

  @Post('messages/conversations/:peerId/messages')
  sendConversation(@Req() req: Request, @Param('peerId') peerId: string, @Body() dto: SendMessageDto) { dto.receiverId = peerId; return this.service.send(req, dto); }

  @Get('messages')
  messages(@Req() req: Request, @Query() query: MessageQueryDto) { return this.service.messages(req, query); }

  @Post('messages')
  send(@Req() req: Request, @Body() dto: SendMessageDto) { return this.service.send(req, dto); }

  @Patch('messages/read')
  read(@Req() req: Request, @Body() dto: ReadMessagesDto) { return this.service.read(req, dto); }

  @Patch('messages/:id/read')
  readOne(@Req() req: Request, @Param('id') id: string) { return this.service.read(req, {}, id); }

  @Get('messages/:peerId')
  legacyMessages(@Req() req: Request, @Param('peerId') peerId: string, @Query() query: MessageQueryDto) { return this.service.messages(req, query, peerId); }

  @Delete('messages/:id')
  removeMessage(@Req() req: Request, @Param('id') id: string) { return this.service.removeMessage(req, id); }

  @Get('notifications/unread-count')
  unreadNotifications(@Req() req: Request) { return this.service.unreadNotifications(req); }

  @Get('notifications')
  notifications(@Req() req: Request, @Query() query: NotificationQueryDto) { return this.service.notifications(req, query); }

  @Post('notifications')
  createNotification(@Req() req: Request, @Body() dto: CreateNotificationDto) { return this.service.createNotification(req, dto); }

  @Patch(['notifications/read-all', 'notifications'])
  readAllNotifications(@Req() req: Request) { return this.service.readAllNotifications(req); }

  @Patch(['notifications/:id/read', 'notifications/:id'])
  readNotification(@Req() req: Request, @Param('id') id: string) { return this.service.readNotification(req, id); }

  @Delete('notifications/:id')
  removeNotification(@Req() req: Request, @Param('id') id: string) { return this.service.removeNotification(req, id); }
}
