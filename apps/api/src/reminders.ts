import { Controller, ForbiddenException, Injectable, Param, Post, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { ClinicalService } from './clinical';
import { PrismaService } from './prisma.service';

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService, private readonly clinical: ClinicalService) {}

  private async createReminder(followUpId: string, actorId?: string) {
    const follow = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      include: { patient: { select: { phone: true, displayName: true } }, practitioner: { select: { displayName: true } } },
    });
    if (!follow || !['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'].includes(follow.status)) return { sent: false, reason: '随访不存在或已经结束' };
    const existing = await this.prisma.notification.findFirst({
      where: { userId: follow.patientId, relatedType: 'FOLLOW_UP_REMINDER', relatedId: follow.id },
    });
    if (existing) return { sent: false, duplicate: true, notificationId: existing.id };
    let notification: { id: string };
    try {
      notification = await this.prisma.$transaction(async (tx) => {
        const created = await tx.notification.create({
          data: {
            id: `follow-reminder:${follow.id}`,
            userId: follow.patientId,
            type: 'FOLLOW_UP',
            priority: follow.priority,
            title: '随访时间提醒',
            content: `${follow.practitioner.displayName}安排的随访将在 ${follow.scheduledAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 进行。`,
            relatedType: 'FOLLOW_UP_REMINDER',
            relatedId: follow.id,
            actionPath: `/pages/patient/follow?followUpId=${follow.id}`,
          },
        });
        await tx.auditLog.create({
          data: { actorId, action: 'FOLLOW_UP_REMINDER_SEND', resourceType: 'FOLLOW_UP', resourceId: follow.id, metadata: { notificationId: created.id } },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { sent: false, duplicate: true, notificationId: `follow-reminder:${follow.id}` };
      }
      throw error;
    }
    await this.deliverExternal({
      phone: follow.patient.phone,
      patientName: follow.patient.displayName,
      practitionerName: follow.practitioner.displayName,
      scheduledAt: follow.scheduledAt.toISOString(),
      followUpId: follow.id,
    });
    return { sent: true, notificationId: notification.id };
  }

  async manual(req: Request, followUpId: string) {
    const actor = await this.clinical.actor(req);
    this.clinical.assertPractitioner(actor);
    const follow = await this.prisma.followUp.findUnique({ where: { id: followUpId } });
    if (!follow || follow.practitionerId !== actor.sub) throw new ForbiddenException('无权发送该随访提醒');
    await this.clinical.assertCare(actor, follow.patientId);
    return this.createReminder(followUpId, actor.sub);
  }

  async run(req: Request) {
    this.assertCronSecret(req.headers['x-cron-secret']);
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const rows = await this.prisma.followUp.findMany({
      where: { status: { in: ['SCHEDULED', 'IN_PROGRESS', 'OVERDUE'] }, scheduledAt: { gte: from, lte: to } },
      select: { id: true },
      take: 1000,
    });
    const results = [];
    for (const row of rows) results.push(await this.createReminder(row.id));
    return { scanned: rows.length, sent: results.filter((item) => item.sent).length, results };
  }

  private assertCronSecret(value: string | string[] | undefined) {
    const configured = process.env.REMINDER_CRON_SECRET;
    if (!configured || configured.length < 32 || Array.isArray(value) || !value) throw new ForbiddenException('提醒任务鉴权失败');
    const expected = createHash('sha256').update(configured).digest();
    const received = createHash('sha256').update(value).digest();
    if (!timingSafeEqual(expected, received)) throw new ForbiddenException('提醒任务鉴权失败');
  }

  private async deliverExternal(payload: Record<string, string>) {
    const endpoint = process.env.REMINDER_DELIVERY_WEBHOOK_URL;
    if (!endpoint) return;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.REMINDER_DELIVERY_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.REMINDER_DELIVERY_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!response?.ok) {
      // In-app reminders remain durable even when an optional SMS/WeChat adapter is unavailable.
      return;
    }
  }
}

@Controller()
export class RemindersController {
  constructor(private readonly service: RemindersService) {}

  @Post('reminders/follow-ups/:id')
  manual(@Req() req: Request, @Param('id') id: string) { return this.service.manual(req, id); }

  @Post('internal/reminders/run')
  run(@Req() req: Request) { return this.service.run(req); }
}
