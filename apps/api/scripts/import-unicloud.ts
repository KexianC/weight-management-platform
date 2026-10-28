import {
  FollowUpStatus,
  FollowUpType,
  HealthRecordType,
  InviteStatus,
  MealType,
  MessageType,
  NotificationType,
  Prisma,
  PrismaClient,
  Priority,
  RelationStatus,
  TaskStatus,
  TaskType,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { practitionerPhoneKey } from '../src/domain';

type LegacyRow = Record<string, any>;
const prisma = new PrismaClient();
const inputDir = process.argv[2] ? resolve(process.argv[2]) : '';
const dryRun = process.argv.includes('--dry-run');
const counts: Record<string, { imported: number; skipped: number }> = {};
const userIds = new Map<string, string>();

function track(collection: string, imported: boolean) {
  counts[collection] ??= { imported: 0, skipped: 0 };
  counts[collection][imported ? 'imported' : 'skipped'] += 1;
}

function text(value: unknown) {
  if (value && typeof value === 'object') {
    const wrapped = value as LegacyRow;
    for (const key of ['$oid', '$uuid', '$numberLong', '$numberInt', '$numberDouble', '$numberDecimal']) {
      if (wrapped[key] !== undefined && wrapped[key] !== null) return String(wrapped[key]).trim();
    }
  }
  return value === null || value === undefined ? '' : String(value).trim();
}

function id(row: LegacyRow) {
  return text(row._id || row.id || row.userId);
}

function legacyUserId(value: unknown) {
  const key = text(value);
  return userIds.get(key) || '';
}

function registerUserAliases(row: LegacyRow, targetId: string) {
  for (const value of [row.userId, row._id, row.id]) {
    const alias = text(value);
    if (alias) userIds.set(alias, targetId);
  }
}

function date(value: unknown, fallback = new Date()) {
  const raw = value && typeof value === 'object'
    ? (value as LegacyRow).$date ?? (value as LegacyRow).value ?? (value as LegacyRow).timestamp
    : value;
  if (typeof raw === 'number') {
    const parsed = new Date(raw < 10_000_000_000 ? raw * 1000 : raw);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }
  const parsed = raw ? new Date(String(raw)) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function role(value: unknown) {
  const normalized = text(value).toLowerCase();
  return normalized === 'doctor' ? UserRole.DOCTOR
    : normalized === 'nutritionist' ? UserRole.NUTRITIONIST
      : normalized === 'admin' ? UserRole.ADMIN
        : UserRole.PATIENT;
}

function priority(value: unknown) {
  const normalized = text(value).toUpperCase();
  return Object.values(Priority).includes(normalized as Priority) ? normalized as Priority : Priority.NORMAL;
}

function legacyPassword(row: LegacyRow) {
  const password = text(row.password || row.passwordHash);
  const salt = text(row.salt);
  if (/^[a-f0-9]{128}$/i.test(password) && salt) return `legacy-pbkdf2$10000$${salt}$${password.toLowerCase()}`;
  // The legacy reset function wrote an incompatible SHA-256 digest. Those accounts
  // deliberately require the new one-time SMS reset flow instead of guessing a format.
  return null;
}

async function collection(names: string[]) {
  const files = await readdir(inputDir);
  const found = files.find((file) => names.some((name) => file.toLowerCase() === `${name.toLowerCase()}.json`));
  if (!found) return [] as LegacyRow[];
  const content = (await readFile(resolve(inputDir, found), 'utf8')).replace(/^\uFEFF/, '').trim();
  if (!content) return [] as LegacyRow[];

  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed as LegacyRow[];
    for (const key of ['data', 'records', 'items']) if (Array.isArray(parsed?.[key])) return parsed[key] as LegacyRow[];
    return parsed && typeof parsed === 'object' ? [parsed as LegacyRow] : [];
  } catch {
    return content.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
      try {
        return JSON.parse(line) as LegacyRow;
      } catch {
        throw new Error(`${found}: invalid JSONL record at line ${index + 1}`);
      }
    });
  }
}

async function importUsers() {
  for (const row of await collection(['users'])) {
    const sourceId = text(row.userId || row._id || row.id);
    const phone = text(row.phone);
    if (!sourceId || !phone) { track('users', false); continue; }
    if (dryRun) { registerUserAliases(row, sourceId); track('users', true); continue; }
    const userRole = role(row.role);
    const user = await prisma.user.upsert({
      where: { phone_role: { phone, role: userRole } },
      create: {
        id: sourceId,
        phone,
        practitionerPhone: practitionerPhoneKey(userRole, phone),
        passwordHash: legacyPassword(row),
        displayName: text(row.name || row.displayName || row.nickname) || '未命名用户',
        avatarUrl: text(row.avatarUrl || row.avatar) || undefined,
        role: userRole,
        status: ['inactive', 'banned', 'disabled'].includes(text(row.status).toLowerCase()) ? UserStatus.DISABLED : UserStatus.ACTIVE,
        createdAt: date(row.createTime || row.createdAt),
      },
      update: {
        displayName: text(row.name || row.displayName || row.nickname) || '未命名用户',
        role: userRole,
        practitionerPhone: practitionerPhoneKey(userRole, phone),
        status: ['inactive', 'banned', 'disabled'].includes(text(row.status).toLowerCase()) ? UserStatus.DISABLED : UserStatus.ACTIVE,
        ...(legacyPassword(row) ? { passwordHash: legacyPassword(row) } : {}),
      },
    });
    registerUserAliases(row, user.id);
    if (userRole === UserRole.PATIENT) {
      const age = number(row.age);
      await prisma.patientProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          gender: text(row.gender).toUpperCase() === 'MALE' ? 'MALE' : text(row.gender).toUpperCase() === 'FEMALE' ? 'FEMALE' : 'UNKNOWN',
          birthDate: row.birthDate ? date(row.birthDate) : age ? new Date(new Date().getFullYear() - age, 0, 1) : undefined,
          heightCm: number(row.height || row.heightCm),
          initialWeightKg: number(row.initialWeight || row.weight),
          targetWeightKg: number(row.targetWeight || row.targetWeightKg),
          medicalHistory: json(row.medicalHistory),
          allergies: json(row.allergies),
        },
        update: {
          heightCm: number(row.height || row.heightCm),
          initialWeightKg: number(row.initialWeight || row.weight),
          targetWeightKg: number(row.targetWeight || row.targetWeightKg),
          medicalHistory: json(row.medicalHistory),
          allergies: json(row.allergies),
        },
      });
    } else if (userRole === UserRole.DOCTOR || userRole === UserRole.NUTRITIONIST) {
      await prisma.practitionerProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, hospital: text(row.hospital) || undefined, department: text(row.department) || undefined, title: text(row.title) || undefined, specialty: text(row.specialty) || undefined },
        update: { hospital: text(row.hospital) || undefined, department: text(row.department) || undefined, title: text(row.title) || undefined, specialty: text(row.specialty) || undefined },
      });
    }
    track('users', true);
  }
}

async function importInvites() {
  for (const row of await collection(['invite_codes', 'inviteCodes'])) {
    const sourceId = id(row);
    const practitionerId = legacyUserId(row.doctorId || row.practitionerId || row.userId);
    const code = text(row.code || row.inviteCode);
    if (!sourceId || !practitionerId || !code) { track('invite_codes', false); continue; }
    if (!dryRun) await prisma.careInvite.upsert({
      where: { code },
      create: {
        id: sourceId,
        code,
        practitionerId,
        expiresAt: date(row.expiresAt || row.expireTime, new Date(Date.now() + 365 * 86_400_000)),
        maxUses: Math.max(1, number(row.maxUses) ?? 1000),
        useCount: row.used || row.isUsed ? 1 : number(row.useCount) ?? 0,
        status: text(row.status).toLowerCase() === 'revoked' ? InviteStatus.REVOKED : text(row.status).toLowerCase() === 'expired' ? InviteStatus.EXPIRED : InviteStatus.ACTIVE,
      },
      update: { practitionerId, expiresAt: date(row.expiresAt || row.expireTime, new Date(Date.now() + 365 * 86_400_000)) },
    });
    track('invite_codes', true);
  }
}

async function importRelations() {
  for (const row of await collection(['doctor_patient_relations', 'care_relations'])) {
    const sourceId = id(row);
    const patientId = legacyUserId(row.patientId);
    const practitionerId = legacyUserId(row.doctorId || row.practitionerId);
    if (!sourceId || !patientId || !practitionerId) { track('doctor_patient_relations', false); continue; }
    const normalizedStatus = text(row.status).toLowerCase();
    if (!dryRun) await prisma.careRelation.upsert({
      where: { patientId_practitionerId: { patientId, practitionerId } },
      create: {
        id: sourceId,
        patientId,
        practitionerId,
        status: normalizedStatus === 'active' ? RelationStatus.ACTIVE : normalizedStatus === 'pending' ? RelationStatus.PENDING : RelationStatus.ENDED,
        bindMethod: text(row.bindMethod || row.bindingMethod) || 'LEGACY_IMPORT',
        note: text(row.note || row.notes) || undefined,
        lastContactAt: row.lastContactAt ? date(row.lastContactAt) : undefined,
        createdAt: date(row.createTime || row.createdAt),
        endedAt: row.endedAt || row.unbindTime ? date(row.endedAt || row.unbindTime) : undefined,
        endedReason: text(row.endedReason || row.unbindReason) || undefined,
      },
      update: { status: normalizedStatus === 'active' ? RelationStatus.ACTIVE : normalizedStatus === 'pending' ? RelationStatus.PENDING : RelationStatus.ENDED },
    });
    track('doctor_patient_relations', true);
  }
}

function healthType(value: unknown) {
  const normalized = text(value).toLowerCase();
  const map: Record<string, HealthRecordType> = { weight: HealthRecordType.WEIGHT, diet: HealthRecordType.DIET, measurement: HealthRecordType.GENERAL, symptom: HealthRecordType.SYMPTOM, blood_pressure: HealthRecordType.BLOOD_PRESSURE, exercise: HealthRecordType.EXERCISE, medication: HealthRecordType.MEDICATION };
  return map[normalized] ?? HealthRecordType.GENERAL;
}

async function importHealthRecords() {
  for (const row of await collection(['health_records', 'healthRecords'])) {
    const sourceId = id(row);
    const patientId = legacyUserId(row.patientId || row.userId);
    if (!sourceId || !patientId) { track('health_records', false); continue; }
    const type = healthType(row.type || row.recordType);
    const meal = text(row.mealType).toUpperCase();
    if (!dryRun) await prisma.healthRecord.upsert({
      where: { id: sourceId },
      create: {
        id: sourceId,
        patientId,
        recordType: type,
        weightKg: number(row.weight || row.weightKg),
        waistCm: number(row.waist || row.waistCm),
        bodyFatPct: number(row.bodyFat || row.bodyFatPct),
        mealType: Object.values(MealType).includes(meal as MealType) ? meal as MealType : undefined,
        mealItems: json(row.mealItems || row.foods || (row.foodName ? [{ name: row.foodName, weightGrams: row.foodWeight, caloriesKcal: row.calories }] : undefined)),
        caloriesKcal: number(row.calories || row.caloriesKcal || row.totalCalories),
        imageUrls: json(row.imageUrls || row.images),
        payload: json(row.payload || row.data || row.details),
        measuredAt: date(row.recordDate || row.measuredAt || row.createTime || row.createdAt),
        source: text(row.source) || 'LEGACY_IMPORT',
        note: text(row.note || row.notes) || undefined,
      },
      update: { patientId, recordType: type },
    });
    track('health_records', true);
  }
}

function followType(value: unknown) {
  const normalized = text(value).toLowerCase();
  const map: Record<string, FollowUpType> = { weight: FollowUpType.WEIGHT, weight_check: FollowUpType.WEIGHT, diet: FollowUpType.DIET, diet_guidance: FollowUpType.DIET, exercise: FollowUpType.EXERCISE, exercise_plan: FollowUpType.EXERCISE, medication: FollowUpType.MEDICATION, medication_review: FollowUpType.MEDICATION, health: FollowUpType.QUESTIONNAIRE, health_assessment: FollowUpType.QUESTIONNAIRE, offline: FollowUpType.OFFLINE, offline_visit: FollowUpType.OFFLINE, phone: FollowUpType.PHONE, phone_call: FollowUpType.PHONE };
  return map[normalized] ?? FollowUpType.GENERAL;
}

function followStatus(value: unknown) {
  const normalized = text(value).toLowerCase();
  return normalized === 'completed' ? FollowUpStatus.COMPLETED : normalized === 'cancelled' || normalized === 'canceled' ? FollowUpStatus.CANCELLED : normalized === 'ongoing' || normalized === 'in_progress' ? FollowUpStatus.IN_PROGRESS : normalized === 'overdue' ? FollowUpStatus.OVERDUE : FollowUpStatus.SCHEDULED;
}

async function importFollowUps() {
  for (const row of await collection(['follow_ups', 'followUps'])) {
    const sourceId = id(row);
    const patientId = legacyUserId(row.patientId);
    const practitionerId = legacyUserId(row.doctorId || row.practitionerId);
    if (!sourceId || !patientId || !practitionerId) { track('follow_ups', false); continue; }
    const status = followStatus(row.status);
    if (!dryRun) await prisma.followUp.upsert({
      where: { id: sourceId },
      create: {
        id: sourceId,
        patientId,
        practitionerId,
        type: followType(row.followType || row.type),
        priority: priority(row.priority),
        scheduledAt: date(row.scheduledAt || row.scheduledTime || row.followDate),
        status,
        note: text(row.note || row.notes || row.description) || undefined,
        summary: text(row.summary) || undefined,
        result: json(row.result || row.followResult),
        startedAt: row.startedAt || row.startTime ? date(row.startedAt || row.startTime) : undefined,
        completedAt: row.completedAt || row.completeTime ? date(row.completedAt || row.completeTime) : undefined,
        cancelledAt: row.cancelledAt || row.cancelTime ? date(row.cancelledAt || row.cancelTime) : undefined,
        createdAt: date(row.createTime || row.createdAt),
      },
      update: { patientId, practitionerId, status, result: json(row.result || row.followResult) },
    });
    track('follow_ups', true);
  }
}

async function importTasks() {
  for (const row of await collection(['patient_tasks', 'tasks'])) {
    const sourceId = id(row);
    const patientId = legacyUserId(row.patientId);
    const assignedById = legacyUserId(row.doctorId || row.assignedById || row.creatorId);
    if (!sourceId || !patientId || !assignedById) { track('patient_tasks', false); continue; }
    const rawType = text(row.taskType || row.type).toUpperCase();
    const type = Object.values(TaskType).includes(rawType as TaskType) ? rawType as TaskType : TaskType.GENERAL;
    const rawStatus = text(row.status).toUpperCase();
    const status = Object.values(TaskStatus).includes(rawStatus as TaskStatus) ? rawStatus as TaskStatus : TaskStatus.PENDING;
    if (!dryRun) await prisma.patientTask.upsert({
      where: { id: sourceId },
      create: { id: sourceId, patientId, assignedById, taskType: type, priority: priority(row.priority), title: text(row.title || row.name) || '健康任务', description: text(row.description || row.instructions) || undefined, content: json(row.content || row.data), result: json(row.result), status, dueAt: row.dueAt || row.deadline ? date(row.dueAt || row.deadline) : undefined, completedAt: row.completedAt ? date(row.completedAt) : undefined, createdAt: date(row.createTime || row.createdAt) },
      update: { patientId, assignedById, status, result: json(row.result) },
    });
    track('patient_tasks', true);
  }
}

async function importMessages() {
  for (const row of await collection(['messages'])) {
    const sourceId = id(row);
    const senderId = legacyUserId(row.senderId || row.fromUserId);
    const receiverId = legacyUserId(row.receiverId || row.toUserId);
    if (!sourceId || !senderId || !receiverId) { track('messages', false); continue; }
    const rawType = text(row.messageType || row.type).toUpperCase();
    const type = Object.values(MessageType).includes(rawType as MessageType) ? rawType as MessageType : MessageType.TEXT;
    if (!dryRun) await prisma.message.upsert({
      where: { id: sourceId },
      create: { id: sourceId, senderId, receiverId, type, content: text(row.content || row.text), attachments: json(row.attachments), contextType: text(row.relatedType) || undefined, contextId: text(row.relatedId) || undefined, readAt: row.readAt || row.isRead ? date(row.readAt || row.updateTime) : undefined, createdAt: date(row.createTime || row.createdAt) },
      update: { senderId, receiverId, readAt: row.readAt || row.isRead ? date(row.readAt || row.updateTime) : undefined },
    });
    track('messages', true);
  }
}

async function importNotifications() {
  for (const row of await collection(['notifications'])) {
    const sourceId = id(row);
    const userId = legacyUserId(row.userId || row.receiverId);
    if (!sourceId || !userId) { track('notifications', false); continue; }
    const rawType = text(row.type).toUpperCase();
    const type = Object.values(NotificationType).includes(rawType as NotificationType) ? rawType as NotificationType : NotificationType.GENERAL;
    if (!dryRun) await prisma.notification.upsert({
      where: { id: sourceId },
      create: { id: sourceId, userId, type, priority: priority(row.priority), title: text(row.title) || '系统通知', content: text(row.content || row.message), relatedType: text(row.relatedType) || undefined, relatedId: text(row.relatedId) || undefined, actionPath: text(row.actionPath || row.path) || undefined, metadata: json(row.metadata), expiresAt: row.expiresAt ? date(row.expiresAt) : undefined, readAt: row.readAt || row.isRead ? date(row.readAt || row.updateTime) : undefined, createdAt: date(row.createTime || row.createdAt) },
      update: { userId, readAt: row.readAt || row.isRead ? date(row.readAt || row.updateTime) : undefined },
    });
    track('notifications', true);
  }
}

async function main() {
  if (!inputDir) throw new Error('Usage: npm run import:unicloud -- <export-directory> [--dry-run]');
  await importUsers();
  await importInvites();
  await importRelations();
  await importHealthRecords();
  await importFollowUps();
  await importTasks();
  await importMessages();
  await importNotifications();
  console.table(counts);
  console.log(dryRun ? 'Dry run complete; no database rows were written.' : 'uniCloud import complete. Run count and sample reconciliation before cutover.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
