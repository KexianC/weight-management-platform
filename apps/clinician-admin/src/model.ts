import type {
  ChatMessage,
  CareSummary,
  ClinicalSummary,
  Conversation,
  FollowUp,
  HealthRecord,
  NotificationItem,
  Patient,
  PatientTask,
} from './types';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function number(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function textList(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean);
    return items.length ? items.join('、') : undefined;
  }
  return text(value);
}

export function listFrom<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  const object = record(value);
  if (Array.isArray(object.items)) return object.items as T[];
  if (Array.isArray(object.list)) return object.list as T[];
  if (Array.isArray(object.records)) return object.records as T[];
  if (Array.isArray(object.data)) return object.data as T[];
  return [];
}

export function ageFromBirthDate(birthDate?: string, now = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime()) || date > now) return undefined;
  let age = now.getFullYear() - date.getFullYear();
  const beforeBirthday = now.getMonth() < date.getMonth()
    || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : undefined;
}

export function normalizeHealthRecord(value: unknown): HealthRecord {
  const row = record(value);
  return {
    id: text(row.id) ?? text(row._id) ?? '',
    recordType: text(row.recordType) ?? text(row.type),
    weightKg: number(row.weightKg ?? row.weight ?? row.value),
    bmi: number(row.bmi),
    measuredAt: text(row.measuredAt) ?? text(row.recordedAt) ?? text(row.createdAt) ?? '',
    note: text(row.note ?? row.remark),
  };
}

export function normalizeCareSummary(value: unknown): CareSummary {
  const row = record(value);
  const metrics = record(row.metrics);
  const practitioner = record(row.practitioner);
  const practitionerProfile = record(practitioner.practitionerProfile ?? practitioner.profile);
  const rawPeriodType = (text(row.periodType) ?? 'WEEKLY').toUpperCase();
  return {
    id: text(row.id) ?? '',
    patientId: text(row.patientId) ?? '',
    practitionerId: text(row.practitionerId ?? practitioner.id) ?? '',
    periodType: rawPeriodType === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY',
    periodStart: text(row.periodStart) ?? '',
    periodEnd: text(row.periodEnd) ?? '',
    metrics: {
      recordCount: number(metrics.recordCount),
      weightRecordCount: number(metrics.weightRecordCount),
      startingWeightKg: number(metrics.startingWeightKg),
      endingWeightKg: number(metrics.endingWeightKg),
      weightChangeKg: number(metrics.weightChangeKg),
      dietRecordCount: number(metrics.dietRecordCount),
      totalCaloriesKcal: number(metrics.totalCaloriesKcal),
      averageDailyCaloriesKcal: number(metrics.averageDailyCaloriesKcal),
      exerciseRecordCount: number(metrics.exerciseRecordCount),
      taskCount: number(metrics.taskCount),
      completedTaskCount: number(metrics.completedTaskCount),
    },
    comment: text(row.comment) ?? '',
    publishedAt: text(row.publishedAt) ?? '',
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    practitioner: text(practitioner.id) ? {
      id: text(practitioner.id) ?? '',
      displayName: text(practitioner.displayName) ?? '医护人员',
      role: (text(practitioner.role)?.toUpperCase() === 'NUTRITIONIST' ? 'NUTRITIONIST' : 'DOCTOR'),
      hospital: text(practitioner.hospital ?? practitionerProfile.hospital),
      department: text(practitioner.department ?? practitionerProfile.department),
      title: text(practitioner.title ?? practitionerProfile.title),
    } : undefined,
  };
}

function normalizeTask(value: unknown): PatientTask {
  const row = record(value);
  return {
    id: text(row.id) ?? text(row._id) ?? '',
    title: text(row.title ?? row.name) ?? '未命名任务',
    description: text(row.description ?? row.instructions),
    type: text(row.type ?? row.taskType),
    status: text(row.status) ?? 'PENDING',
    dueAt: text(row.dueAt ?? row.deadline),
    createdAt: text(row.createdAt),
    completedAt: text(row.completedAt),
  };
}

export function normalizePatient(value: unknown): Patient {
  const row = record(value);
  const profile = record(row.patientProfile ?? row.profile);
  const relation = record(row.relation);
  const rawRecords = listFrom(row.healthRecords ?? row.records);
  const healthRecords = rawRecords.map(normalizeHealthRecord).filter((item) => item.id || item.measuredAt);
  const newestWeight = healthRecords.find((item) => item.weightKg !== undefined);
  const heightCm = number(row.heightCm ?? profile.heightCm ?? profile.height);
  const currentWeightKg = number(row.currentWeightKg ?? row.weightKg ?? newestWeight?.weightKg);
  const explicitBmi = number(row.bmi ?? row.currentBmi ?? profile.bmi ?? newestWeight?.bmi);
  const calculatedBmi = currentWeightKg !== undefined && heightCm
    ? currentWeightKg / ((heightCm / 100) ** 2)
    : undefined;
  const birthDate = text(row.birthDate ?? profile.birthDate ?? profile.birthday);
  const attention = boolean(row.attention ?? row.requiresAttention ?? row.needsAttention);
  const active = boolean(row.active);
  const completedGoal = boolean(row.completedGoal);
  const rawArchiveStatus = text(row.archiveStatus)?.toUpperCase();
  return {
    id: text(row.id) ?? text(row._id) ?? '',
    displayName: text(row.displayName ?? row.name ?? row.nickname) ?? '未命名患者',
    phone: text(row.phone ?? row.mobile),
    gender: text(row.gender ?? profile.gender),
    birthDate,
    age: number(row.age ?? profile.age) ?? ageFromBirthDate(birthDate),
    heightCm,
    targetWeightKg: number(row.targetWeightKg ?? profile.targetWeightKg ?? profile.targetWeight),
    currentWeightKg,
    bmi: explicitBmi ?? (calculatedBmi === undefined ? undefined : Number(calculatedBmi.toFixed(1))),
    weightDelta30d: number(row.weightDelta30d ?? row.weightChange30d),
    adherencePct: number(row.adherencePct ?? row.adherence ?? row.completionRate),
    riskLevel: text(row.riskLevel ?? row.risk) ?? (attention ? 'ATTENTION' : undefined),
    status: text(row.status ?? row.relationStatus) ?? (completedGoal ? 'COMPLETED' : active ? 'ACTIVE' : undefined),
    requiresAttention: attention,
    lastRecordAt: text(row.latestRecordAt ?? row.lastRecordAt ?? newestWeight?.measuredAt),
    healthRecords,
    receivedTasks: listFrom(row.receivedTasks ?? row.tasks).map(normalizeTask),
    pendingTaskCount: number(row.pendingTaskCount),
    pendingFollowUpCount: number(row.pendingFollowUpCount),
    medicalHistory: textList(row.medicalHistory ?? profile.medicalHistory),
    allergies: textList(row.allergies ?? profile.allergies),
    relationStartedAt: text(row.relationStartedAt ?? row.boundAt ?? relation.startedAt ?? relation.createdAt),
    archiveStatus: rawArchiveStatus === 'DRAFT' || rawArchiveStatus === 'COMPLETED' ? rawArchiveStatus : null,
    archiveCompletionPercent: number(row.archiveCompletionPercent) ?? null,
    archiveUpdatedAt: text(row.archiveUpdatedAt) ?? null,
  };
}

export function normalizeFollowUp(value: unknown): FollowUp {
  const row = record(value);
  const patient = record(row.patient);
  const rawStatus = (text(row.status) ?? 'PENDING').toUpperCase();
  const allowed = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE'];
  return {
    id: text(row.id) ?? text(row._id) ?? '',
    patientId: text(row.patientId ?? patient.id) ?? '',
    patientName: text(row.patientName ?? patient.displayName ?? patient.name),
    practitionerId: text(row.practitionerId),
    type: text(row.type ?? row.followUpType),
    priority: text(row.priority),
    status: (allowed.includes(rawStatus) ? rawStatus : 'PENDING') as FollowUp['status'],
    scheduledAt: text(row.scheduledAt ?? row.followUpAt ?? row.dueAt) ?? '',
    summary: text(row.summary ?? row.note ?? row.instructions ?? row.content),
    notes: text(row.notes ?? row.note),
    recurrence: text(row.recurrence ?? row.repeatRule),
    createdAt: text(row.createdAt),
    startedAt: text(row.startedAt),
    completedAt: text(row.completedAt),
  };
}

export function normalizeConversation(value: unknown): Conversation {
  const row = record(value);
  const peer = record(row.peer ?? row.patient ?? row.user);
  const latestMessage = record(row.latestMessage);
  const peerId = text(row.peerId ?? peer.id ?? row.patientId) ?? '';
  return {
    id: text(row.id ?? row.conversationId) ?? peerId,
    peerId,
    peerName: text(row.peerName ?? peer.displayName ?? peer.name ?? row.patientName) ?? '未命名患者',
    lastMessage: text(row.lastMessage ?? row.preview ?? latestMessage.content),
    lastMessageAt: text(row.lastMessageAt ?? latestMessage.createdAt ?? row.updatedAt),
    unreadCount: number(row.unreadCount) ?? 0,
  };
}

export function normalizeChatMessage(value: unknown): ChatMessage {
  const row = record(value);
  return {
    id: text(row.id) ?? text(row._id) ?? '',
    senderId: text(row.senderId ?? row.fromUserId) ?? '',
    receiverId: text(row.receiverId ?? row.toUserId) ?? '',
    content: text(row.content ?? row.text) ?? '',
    createdAt: text(row.createdAt ?? row.sentAt) ?? '',
    readAt: text(row.readAt),
    messageType: text(row.messageType ?? row.type),
  };
}

export function normalizeNotification(value: unknown): NotificationItem {
  const row = record(value);
  return {
    id: text(row.id) ?? text(row._id) ?? '',
    title: text(row.title) ?? '系统通知',
    content: text(row.content ?? row.message) ?? '',
    type: text(row.type),
    createdAt: text(row.createdAt) ?? '',
    readAt: text(row.readAt),
    relatedId: text(row.relatedId),
  };
}

export function normalizeSummary(value: unknown): ClinicalSummary {
  const row = record(value);
  return {
    totalPatients: number(row.totalPatients ?? row.patientTotal),
    dueToday: number(row.dueToday ?? row.todayFollowUps),
    overdueFollowUps: number(row.overdueFollowUps ?? row.overdue),
    averageAdherencePct: number(row.averageAdherencePct ?? row.averageAdherence),
    highRiskPatients: number(row.highRiskPatients ?? row.highRisk ?? row.attentionPatients),
    activePatients: number(row.activePatients),
    completedGoals: number(row.completedGoals),
    pendingFollowUps: number(row.pendingFollowUps),
    completedFollowUps: number(row.completedFollowUps),
    followUpCompletionRate: number(row.followUpCompletionRate),
  };
}

function sameLocalDay(value: string, today: Date): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

export function deriveClinicalSummary(
  patients: Patient[],
  followUps: FollowUp[],
  supplied: ClinicalSummary = {},
  today = new Date(),
): Required<Pick<ClinicalSummary, 'totalPatients' | 'dueToday' | 'overdueFollowUps' | 'averageAdherencePct' | 'highRiskPatients'>> {
  const adherenceValues = patients
    .map((patient) => patient.adherencePct)
    .filter((value): value is number => value !== undefined);
  const dueToday = followUps.filter((item) =>
    !['COMPLETED', 'CANCELLED'].includes(item.status) && sameLocalDay(item.scheduledAt, today)).length;
  const overdue = followUps.filter((item) => item.status === 'OVERDUE'
    || (!['COMPLETED', 'CANCELLED'].includes(item.status)
      && Boolean(item.scheduledAt)
      && new Date(item.scheduledAt) < today)).length;
  return {
    totalPatients: supplied.totalPatients ?? patients.length,
    dueToday: supplied.dueToday ?? dueToday,
    overdueFollowUps: supplied.overdueFollowUps ?? overdue,
    averageAdherencePct: supplied.averageAdherencePct
      ?? (adherenceValues.length
        ? adherenceValues.reduce((total, value) => total + value, 0) / adherenceValues.length
        : 0),
    highRiskPatients: supplied.highRiskPatients
      ?? patients.filter((patient) => patient.riskLevel?.toUpperCase() === 'HIGH' || patient.requiresAttention).length,
  };
}

export function formatDateTime(value?: string): string {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function displayMetric(value: number | undefined, suffix = '', digits = 1): string {
  return value === undefined ? '--' : `${value.toFixed(digits)}${suffix}`;
}

export function riskLabel(value?: string): string {
  const normalized = value?.toUpperCase();
  if (normalized === 'HIGH') return '高风险';
  if (normalized === 'MEDIUM') return '中风险';
  if (normalized === 'LOW') return '低风险';
  if (normalized === 'ATTENTION') return '需关注';
  return '未分级';
}

export function followUpStatusLabel(value: FollowUp['status']): string {
  return {
    PENDING: '待开始',
    IN_PROGRESS: '进行中',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    OVERDUE: '已逾期',
  }[value];
}
