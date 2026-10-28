import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { SmsDeliveryService, SmsReminderRejectedError } from './sms-delivery';
import { memberWindow, shanghaiDate } from './yuanqizhan-policy';

export function yuanqizhanReminderTime(now = new Date()) {
  const date = shanghaiDate(now);
  const dueAt = new Date(`${date}T20:00:00+08:00`);
  return { date, dueAt, due: now.getTime() >= dueAt.getTime() };
}

export function yuanqizhanReminderId(patientId: string, date: string) {
  return `yuanqizhan-sms:${date}:${createHash('sha256').update(patientId).digest('hex')}`;
}

@Injectable()
export class YuanqizhanRemindersService {
  private readonly logger = new Logger(YuanqizhanRemindersService.name);

  constructor(private readonly prisma: PrismaService, private readonly sms: SmsDeliveryService) {}

  async run() {
    const startedAt = new Date();
    const { date, dueAt, due } = yuanqizhanReminderTime(startedAt);
    const summary = { date, state: 'COMPLETE', scanned: 0, accepted: 0, skipped: 0, failed: 0, unknown: 0 };
    if (!due) return { ...summary, state: 'BEFORE_20_00' };
    const activation = process.env.YUANQIZHAN_REMINDERS_NOT_BEFORE?.trim();
    if (activation) {
      const activationTime = Date.parse(activation);
      if (!Number.isFinite(activationTime)) return { ...summary, state: 'NOT_CONFIGURED' };
      if (startedAt.getTime() < activationTime) return { ...summary, state: 'BEFORE_ACTIVATION' };
    }
    if (!this.sms.isFollowUpConfigured()) return { ...summary, state: 'NOT_CONFIGURED' };

    // Cursor pagination ensures a large activity cannot silently lose recipients.
    let cursor: string | undefined;
    while (true) {
      const rows = await this.prisma.yuanqizhanMember.findMany({
        where: {
          status: 'ACTIVE', joinedAt: { lte: dueAt }, startDate: { lte: date },
          activity: { status: 'ACTIVE' }, patient: { role: 'PATIENT', status: 'ACTIVE' },
          records: { some: { status: 'SUBMITTED' }, none: { date, status: 'SUBMITTED' } },
        },
        select: { id: true, activityId: true, patientId: true },
        orderBy: { id: 'asc' }, take: 200,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const row of rows) {
        summary.scanned++;
        try {
          const result = await this.remind(row, date, dueAt);
          if (result === 'ACCEPTED') summary.accepted++;
          else if (result === 'UNKNOWN') summary.unknown++;
          else if (result === 'FAILED') summary.failed++;
          else summary.skipped++;
        } catch {
          // Never log phone numbers, template parameters or provider exception bodies.
          this.logger.error('Yuanqizhan reminder processing failed; inspect reminder audit records');
          summary.failed++;
        }
      }
      if (rows.length < 200) break;
      cursor = rows[rows.length - 1].id;
    }
    if (summary.failed || summary.unknown) summary.state = 'PARTIAL_FAILURE';
    return summary;
  }

  private async remind(candidate: { id: string; activityId: string; patientId: string }, date: string, dueAt: Date) {
    const id = yuanqizhanReminderId(candidate.patientId, date);
    const claim = await this.prisma.$transaction(async (tx) => {
      // Same lock order as check-in submission, member removal and activity ending.
      await tx.$queryRaw`SELECT id FROM YuanqizhanActivity WHERE id = ${candidate.activityId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM YuanqizhanMember WHERE id = ${candidate.id} FOR UPDATE`;
      const member = await tx.yuanqizhanMember.findUnique({
        where: { id: candidate.id }, include: {
          activity: true, patient: { select: { phone: true, status: true, role: true } },
          records: { where: { status: 'SUBMITTED' }, select: { id: true }, take: 1 },
        },
      });
      const now = new Date();
      if (shanghaiDate(now) !== date || !member || member.joinedAt > dueAt || !member.records.length
        || member.patient.status !== 'ACTIVE' || member.patient.role !== 'PATIENT'
        || !this.canWrite(member, now)) return null;
      const submitted = await tx.yuanqizhanDailyRecord.findUnique({
        where: { activityId_patientId_date: { activityId: member.activityId, patientId: member.patientId, date } },
        select: { status: true },
      });
      if (submitted?.status === 'SUBMITTED' || !/^1\d{10}$/.test(member.patient.phone)) return null;
      if (await tx.auditLog.findUnique({ where: { id }, select: { id: true } })) return { duplicate: true } as const;
      // Durable, immutable send claim, independent of removable in-app notifications.
      // One patient receives at most one reminder per day even across activities.
      await tx.auditLog.create({ data: {
        id, action: 'YUANQIZHAN_REMINDER_CLAIM', resourceType: 'YUANQIZHAN_MEMBER', resourceId: member.id,
        metadata: { date, activityId: member.activityId, patientId: member.patientId, state: 'CLAIMED', template: '随访提醒' },
      } });
      return { phone: member.patient.phone, activityId: member.activityId, memberId: member.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10_000, timeout: 30_000 }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      throw error;
    });
    if (!claim) return 'SKIPPED';
    if ('duplicate' in claim) {
      const result = await this.prisma.auditLog.findUnique({ where: { id: `${id}:result` }, select: { metadata: true } });
      const metadata = result?.metadata as Record<string, unknown> | null | undefined;
      return !result || metadata?.state === 'UNKNOWN' ? 'UNKNOWN' : 'SKIPPED';
    }

    // Recheck after committing the claim, immediately before the external request.
    const current = await this.prisma.yuanqizhanMember.findMany({
      where: {
        patientId: candidate.patientId, status: 'ACTIVE', joinedAt: { lte: dueAt }, startDate: { lte: date },
        activity: { status: 'ACTIVE' }, patient: { status: 'ACTIVE', role: 'PATIENT' },
        records: { some: { status: 'SUBMITTED' }, none: { date, status: 'SUBMITTED' } },
      },
      include: { activity: true, patient: { select: {
        phone: true, status: true, role: true,
        patientRelations: {
          where: { status: 'ACTIVE', practitioner: { status: 'ACTIVE', role: 'DOCTOR' } },
          select: { practitioner: { select: { displayName: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1,
        },
      } } },
    }).catch(async () => {
      await this.recordResult(id, claim.memberId, date, 'UNKNOWN').catch(() => undefined);
      return null;
    });
    if (!current) return 'UNKNOWN';
    const now = new Date();
    const eligible = current.find((member) => member.patient.status === 'ACTIVE'
      && member.patient.role === 'PATIENT' && member.patient.phone === claim.phone && this.canWrite(member, now));
    if (shanghaiDate(now) !== date || !eligible) {
      await this.recordResult(id, claim.memberId, date, 'CANCELLED');
      return 'SKIPPED';
    }

    let state: 'ACCEPTED' | 'FAILED' | 'UNKNOWN';
    let receipt: { bizId?: string; requestId?: string } = {};
    try {
      const doctorName = eligible.patient.patientRelations?.[0]?.practitioner.displayName?.trim().replace(/医生$/, '') || '';
      receipt = await this.sms.sendFollowUpReminder(claim.phone, {
        practitionerName: /^[\u4e00-\u9fffA-Za-z0-9]{1,20}$/.test(doctorName) ? doctorName : '随访',
        scheduledTime: `${date} 20:00:00`, content: '元气盏活动今日打卡尚未完成，请及时完成记录', date,
      });
      state = 'ACCEPTED';
    } catch (error) {
      // A timeout may occur after the provider accepts the SMS. Never resend blindly.
      state = error instanceof SmsReminderRejectedError ? 'FAILED' : 'UNKNOWN';
    }
    const recorded = await this.recordResult(id, claim.memberId, date, state, receipt).catch(() => null);
    if (!recorded) {
      this.logger.error('Yuanqizhan SMS result could not be persisted; inspect reminder claim');
      return 'UNKNOWN';
    }
    return state;
  }

  private canWrite(member: { activity: { status: string; durationDays: number }; status: string; joinedAt: Date; startDate: string | null }, now: Date) {
    // Reminders begin only after a successful first submission starts the period.
    // History is checked separately because older calendar members can already
    // have a startDate without ever having submitted a check-in.
    if (member.startDate === null) return false;
    return memberWindow(member.activity, { ...member, startDate: member.startDate }, now).canWrite;
  }

  private recordResult(claimId: string, memberId: string, date: string, state: string, receipt: { bizId?: string; requestId?: string } = {}) {
    return this.prisma.auditLog.create({ data: {
      id: `${claimId}:result`, action: 'YUANQIZHAN_REMINDER_RESULT', resourceType: 'YUANQIZHAN_MEMBER', resourceId: memberId,
      metadata: { date, state, ...receipt },
    } });
  }
}
