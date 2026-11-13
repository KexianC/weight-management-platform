import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';

export const ROUTINE_SOURCE = 'DAILY_ROUTINE';
export const ROUTINE_TYPES = ['WEIGHT', 'DIET', 'SLEEP', 'EXERCISE'] as const;
export const ROUTINE_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type RoutineAnswers = Record<string, number | string | string[]>;
export const routineDate = (date: Date) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const routineKey = (patientId: string, date: string) => createHash('sha256').update(`daily-routine:v1:${patientId}:${date}`).digest('hex');
export function routineWindow(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new BadRequestException('填报日期无效');
  const gte = new Date(Date.parse(date) - 8 * 3600000);
  return { gte, lt: new Date(gte.getTime() + 86400000) };
}
export function routineSlot(row: { recordType: string; mealType?: string | null }) {
  return row.recordType === 'DIET' ? String(row.mealType ?? '').toLowerCase() : row.recordType.toLowerCase();
}
export function sleepDuration(start: unknown, end: unknown): number | undefined {
  if (typeof start !== 'string' || typeof end !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return undefined;
  const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return Math.round(((minutes(end) - minutes(start) + 1440) % 1440) / 60 * 100) / 100;
}
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const numeric = (value: unknown) => value === null || value === undefined ? null : Number(value);
const photoIds = (row: any): string[] => Array.isArray(row?.imageUrls) ? row.imageUrls.filter((id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,191}$/.test(id)) : [];

@Injectable()
export class DailyRoutineService {
  constructor(private readonly prisma: PrismaService) {}

  async lock(tx: Prisma.TransactionClient, patientId: string) { await tx.$queryRaw`SELECT id FROM User WHERE id = ${patientId} FOR UPDATE`; }

  /** Reads only. Legacy optional fields remain visible until the explicit conversion or next write. */
  async read(tx: Prisma.TransactionClient, patientId: string, date: string) {
    const [meta, legacy, rows] = await Promise.all([
      tx.healthRecord.findUnique({ where: { requestKey: routineKey(patientId, date) } }),
      tx.dailyCheckInRecord.findUnique({ where: { patientId_date: { patientId, date } } }),
      tx.healthRecord.findMany({ where: { patientId, recordType: { in: [...ROUTINE_TYPES] }, measuredAt: routineWindow(date) }, orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] }),
    ]);
    if (meta && (meta.source !== ROUTINE_SOURCE || meta.patientId !== patientId || meta.recordType !== 'GENERAL')) throw new ConflictException('每日记录状态不一致，请联系服务人员');
    const state = object(meta?.payload);
    const answers: RoutineAnswers = { ...object(meta ? state.answers : legacy?.answers) };
    const resolved = new Set<string>(Array.isArray(state.resolvedSlots) ? state.resolvedSlots : []);
    const refs: Record<string, any> = {};
    const recordCounts: Record<string, number> = { weight: 0, breakfast: 0, lunch: 0, dinner: 0, snack: 0, sleep: 0, exercise: 0 };
    for (const row of rows) { const slot = routineSlot(row); recordCounts[slot] = (recordCounts[slot] ?? 0) + 1; if (!refs[slot]) refs[slot] = row; }
    const weight = refs.weight;
    if (weight || resolved.has('weight')) { delete answers.waist_cm; if (weight?.waistCm != null) answers.waist_cm = Number(weight.waistCm); }
    for (const meal of ROUTINE_MEALS) {
      const row = refs[meal];
      if (row || resolved.has(meal)) {
        delete answers[`${meal}_text`]; delete answers[`${meal}_photo_ids`];
        if (row?.note) answers[`${meal}_text`] = row.note;
        if (photoIds(row).length) answers[`${meal}_photo_ids`] = photoIds(row);
      }
    }
    const sleep = refs.sleep;
    if (sleep || resolved.has('sleep')) {
      delete answers.sleep_hours; delete answers.sleep_start; delete answers.sleep_end;
      if (sleep?.sleepHours != null) answers.sleep_hours = Number(sleep.sleepHours);
      const extra = object(sleep?.payload);
      if (extra.sleep_start) answers.sleep_start = extra.sleep_start;
      if (extra.sleep_end) answers.sleep_end = extra.sleep_end;
    } else if (answers.sleep_hours === undefined) {
      const duration = sleepDuration(answers.sleep_start, answers.sleep_end);
      if (duration !== undefined) answers.sleep_hours = duration;
    }
    const exercise = refs.exercise;
    if (exercise || resolved.has('exercise')) {
      delete answers.exercise_minutes;
      const duration = object(exercise?.payload).durationMinutes;
      if (typeof duration === 'number' && Number.isFinite(duration)) answers.exercise_minutes = duration;
    }
    const version = Number.isSafeInteger(state.version) ? state.version : legacy?.version ?? 0;
    const revision = createHash('sha256').update(JSON.stringify({ date, version, answers, rows: rows.map(row => [row.id, row.updatedAt.toISOString(), row.measuredAt.toISOString()]) })).digest('hex');
    const updatedAt = [meta?.updatedAt, legacy?.updatedAt, ...rows.map(row => row.updatedAt)].filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const legacyMediaUnlinked = ROUTINE_MEALS.filter(meal => Array.isArray(refs[meal]?.imageUrls) && refs[meal].imageUrls.length !== photoIds(refs[meal]).length);
    return { date, version, revision, weightKg: numeric(weight?.weightKg), answers, refs, recordCounts, updatedAt, hasData: !!meta || !!legacy || !!rows.length, meta, legacy, legacyMediaUnlinked,
      legacyAnchor: rows.find(row => row.id === legacy?.healthRecordId)?.measuredAt };
  }

  /** Caller holds the patient lock. Metadata is private and never a user-facing health entry. */
  async ensure(tx: Prisma.TransactionClient, patientId: string, date: string) {
    const current = await this.read(tx, patientId, date);
    if (current.meta) return current.meta;
    return tx.healthRecord.create({ data: { patientId, recordType: 'GENERAL', source: ROUTINE_SOURCE, measuredAt: routineWindow(date).gte,
      requestKey: routineKey(patientId, date), payload: { date, version: current.version, answers: current.answers, resolvedSlots: [] } } });
  }

  async changed(tx: Prisma.TransactionClient, patientId: string, date: string, slots: string[] = [], extraAnswers?: RoutineAnswers) {
    const meta = await this.ensure(tx, patientId, date), state = object(meta.payload);
    await tx.healthRecord.update({ where: { id: meta.id }, data: { payload: { ...state, date, version: Number(state.version ?? 0) + 1,
      answers: extraAnswers ?? object(state.answers), resolvedSlots: [...new Set([...(state.resolvedSlots ?? []), ...slots])] } } });
    let snapshot = await this.read(tx, patientId, date);
    const prior = snapshot.legacy;
    if (snapshot.weightKg !== null && snapshot.refs.weight) {
      const data = { weightKg: snapshot.weightKg, healthRecordId: snapshot.refs.weight.id, answers: snapshot.answers, version: snapshot.version };
      if (prior) await tx.dailyCheckInRecord.update({ where: { id: prior.id }, data });
      else await tx.dailyCheckInRecord.create({ data: { patientId, date, ...data } });
    } else if (prior) {
      // The day metadata and typed entries retain all other information when weight is removed.
      await tx.dailyCheckInRecord.delete({ where: { id: prior.id } });
    }
    snapshot = await this.read(tx, patientId, date);
    return snapshot;
  }

  async beforeDelete(tx: Prisma.TransactionClient, row: any) {
    const date = routineDate(row.measuredAt);
    await this.ensure(tx, row.patientId, date);
    await tx.dailyCheckInRecord.deleteMany({ where: { patientId: row.patientId, healthRecordId: row.id } });
  }

  /** Changes only fields this surface owns; original record IDs, food details and reviews survive. */
  async apply(tx: Prisma.TransactionClient, patientId: string, date: string, weightKg: number | undefined, answers: RoutineAnswers, changedFields: string[], anchoredAt?: Date) {
    const before = await this.read(tx, patientId, date);
    await this.ensure(tx, patientId, date);
    const next: RoutineAnswers = { ...before.answers };
    for (const field of changedFields) { if (field === 'weightKg') continue; if (answers[field] === undefined) delete next[field]; else next[field] = answers[field]; }
    const affected: string[] = [];
    const write = async (slot: string, recordType: any, data: any) => {
      const existing = before.refs[slot];
      const row = existing ? await tx.healthRecord.update({ where: { id: existing.id }, data })
        : await tx.healthRecord.create({ data: { patientId, recordType, source: 'DAILY_CHECK_IN', measuredAt: anchoredAt ?? (routineDate(new Date()) === date ? new Date() : new Date(routineWindow(date).gte.getTime() + 12 * 3600000)), ...data } });
      affected.push(slot); return row;
    };
    if (changedFields.includes('weightKg') || changedFields.includes('waist_cm')) {
      const value = changedFields.includes('weightKg') ? weightKg : before.weightKg;
      if (value != null) await write('weight', 'WEIGHT', { weightKg: value, waistCm: next.waist_cm ?? null });
      else if (changedFields.includes('waist_cm') && next.waist_cm !== undefined) throw new BadRequestException('请先填写当天体重，再填写腰围');
    }
    for (const meal of ROUTINE_MEALS) {
      if (!changedFields.some(field => field === `${meal}_text` || field === `${meal}_photo_ids`)) continue;
      const ids = (next[`${meal}_photo_ids`] ?? []) as string[], note = (next[`${meal}_text`] ?? '') as string;
      if (before.refs[meal] || ids.length || note) {
        const row = await write(meal, 'DIET', { mealType: meal.toUpperCase(), note, imageUrls: ids });
        const priorIds = photoIds(before.refs[meal]);
        const removed = priorIds.filter(id => !ids.includes(id));
        if (removed.length) await tx.mediaAsset.updateMany({ where: { id: { in: removed }, ownerId: patientId, healthRecordId: row.id }, data: { healthRecordId: null } });
        if (ids.length) await tx.mediaAsset.updateMany({ where: { id: { in: ids }, ownerId: patientId, status: 'READY' }, data: { healthRecordId: row.id } });
      }
      affected.push(meal);
    }
    if (changedFields.some(field => ['sleep_hours', 'sleep_start', 'sleep_end'].includes(field))) {
      const previousPayload = object(before.refs.sleep?.payload);
      const payload = { ...previousPayload };
      if (changedFields.includes('sleep_hours') && !changedFields.some(field => ['sleep_start', 'sleep_end'].includes(field))) { delete next.sleep_start; delete next.sleep_end; }
      const derived = sleepDuration(next.sleep_start, next.sleep_end);
      if (changedFields.includes('sleep_hours') && derived !== undefined && next.sleep_hours !== undefined && Math.abs(Number(next.sleep_hours) - derived) > 0.01) throw new BadRequestException('睡眠时长与起止时间不一致');
      if (derived !== undefined) next.sleep_hours = derived;
      for (const field of ['sleep_start', 'sleep_end']) { if (next[field] === undefined) delete payload[field]; else payload[field] = next[field]; }
      if (before.refs.sleep || next.sleep_hours !== undefined) await write('sleep', 'SLEEP', { sleepHours: next.sleep_hours ?? null, payload });
      // Preserve partial start/end in metadata until a duration exists, without inventing a time.
      if (before.refs.sleep || next.sleep_hours !== undefined) affected.push('sleep');
    }
    if (changedFields.includes('exercise_minutes')) {
      const payload = { ...object(before.refs.exercise?.payload) };
      if (next.exercise_minutes === undefined) delete payload.durationMinutes; else payload.durationMinutes = next.exercise_minutes;
      if (before.refs.exercise || next.exercise_minutes !== undefined) await write('exercise', 'EXERCISE', { payload });
      affected.push('exercise');
    }
    return this.changed(tx, patientId, date, affected, next);
  }

  /** Explicit release conversion, never invoked from GET/context. Existing typed entries win. */
  async importLegacy(tx: Prisma.TransactionClient, patientId: string, date: string, expectedVersion: number) {
    await this.lock(tx, patientId);
    const snapshot = await this.read(tx, patientId, date);
    if (object(snapshot.meta?.payload).legacyImport?.sourceVersion === expectedVersion) return { converted: false, version: snapshot.version, alreadyConverted: true };
    if (!snapshot.legacy || snapshot.legacy.version !== expectedVersion) throw new ConflictException('历史填报已变化，请重新核对转换计划');
    const answers = object(snapshot.legacy.answers) as RoutineAnswers;
    const fields: string[] = [];
    for (const meal of ROUTINE_MEALS) if (!snapshot.refs[meal]) fields.push(`${meal}_text`, `${meal}_photo_ids`);
    if (!snapshot.refs.sleep) fields.push('sleep_hours', 'sleep_start', 'sleep_end');
    if (!snapshot.refs.exercise) fields.push('exercise_minutes');
    if (!fields.some(field => answers[field] !== undefined)) return { converted: false, version: snapshot.version };
    const result = await this.apply(tx, patientId, date, undefined, answers, fields, snapshot.legacyAnchor ?? new Date(routineWindow(date).gte.getTime() + 12 * 3600000));
    await tx.healthRecord.update({ where: { id: result.meta!.id }, data: { payload: { ...object(result.meta!.payload), legacyImport: { sourceVersion: expectedVersion, recordId: snapshot.legacy.id } } } });
    return { converted: true, version: result.version };
  }
}
