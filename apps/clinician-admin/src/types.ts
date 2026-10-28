export type PractitionerRole = 'DOCTOR' | 'NUTRITIONIST' | 'HEALTH_MANAGER' | 'EXERCISE_COACH' | 'ADMIN';

export type Practitioner = {
  id: string;
  displayName: string;
  role: PractitionerRole;
  mustChangePassword?: boolean;
  initialPasswordExpiresAt?: string | null;
  hospital?: string;
  department?: string;
  title?: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken?: string;
  user: Practitioner;
};

export type HealthRecord = {
  id: string;
  recordType?: string;
  weightKg?: number;
  bmi?: number;
  measuredAt: string;
  note?: string;
};

export type PatientTask = {
  id: string;
  title: string;
  description?: string;
  type?: string;
  status: string;
  dueAt?: string;
  createdAt?: string;
  completedAt?: string;
};

export type CareSummaryPeriod = 'WEEKLY' | 'MONTHLY';

export type CareSummaryMetrics = {
  recordCount?: number;
  weightRecordCount?: number;
  startingWeightKg?: number;
  endingWeightKg?: number;
  weightChangeKg?: number;
  dietRecordCount?: number;
  totalCaloriesKcal?: number;
  averageDailyCaloriesKcal?: number;
  exerciseRecordCount?: number;
  taskCount?: number;
  completedTaskCount?: number;
};

export type CareSummary = {
  id: string;
  patientId: string;
  practitionerId: string;
  periodType: CareSummaryPeriod;
  periodStart: string;
  periodEnd: string;
  metrics: CareSummaryMetrics;
  comment: string;
  publishedAt: string;
  createdAt?: string;
  updatedAt?: string;
  practitioner?: Pick<Practitioner, 'id' | 'displayName' | 'role' | 'hospital' | 'department' | 'title'>;
};

export type PublishCareSummaryInput = {
  periodType: CareSummaryPeriod;
  referenceDate: string;
  comment: string;
};

export type Patient = {
  id: string;
  displayName: string;
  phone?: string;
  gender?: string;
  birthDate?: string;
  age?: number;
  heightCm?: number;
  targetWeightKg?: number;
  currentWeightKg?: number;
  bmi?: number;
  weightDelta30d?: number;
  adherencePct?: number;
  riskLevel?: string;
  status?: string;
  requiresAttention?: boolean;
  lastRecordAt?: string;
  healthRecords: HealthRecord[];
  receivedTasks: PatientTask[];
  pendingTaskCount?: number;
  pendingFollowUpCount?: number;
  medicalHistory?: string;
  allergies?: string;
  relationStartedAt?: string;
  archiveStatus?: ArchiveStatus | null;
  archiveCompletionPercent?: number | null;
  archiveUpdatedAt?: string | null;
};

export type ArchiveStatus = 'DRAFT' | 'COMPLETED';
export type ArchiveAnswerValue = string | number | boolean | string[] | null | undefined;
export type ClinicalArchiveData = Record<string, unknown>;

export type PatientArchive = {
  id: string;
  archiveNo?: string;
  patientId: string;
  status: ArchiveStatus;
  templateVersion: 'TCM_WEIGHT_V1' | string;
  answers: ClinicalArchiveData;
  completionPercent: number;
  createdById?: string;
  updatedById?: string;
  completedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SavePatientArchiveInput = {
  status: ArchiveStatus;
  answers: ClinicalArchiveData;
  completionPercent: number;
  expectedUpdatedAt?: string;
};

export type CreatePatientInput = {
  phone: string;
  displayName?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  birthDate?: string;
  heightCm?: number;
  initialWeightKg?: number;
  targetWeightKg?: number;
  patientAuthorizationConfirmed: true;
};

export type CreatePatientResult = {
  patient: Patient;
  accountCreated: boolean;
  relationCreated: boolean;
  relationActivated?: boolean;
  temporaryPassword?: string;
  passwordSetupRequired?: boolean;
  nextStep?: string;
  message?: string;
};

export type ClinicalSummary = {
  totalPatients?: number;
  dueToday?: number;
  overdueFollowUps?: number;
  averageAdherencePct?: number;
  highRiskPatients?: number;
  activePatients?: number;
  completedGoals?: number;
  pendingFollowUps?: number;
  completedFollowUps?: number;
  followUpCompletionRate?: number;
};

export type FollowUpStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'OVERDUE';

export type FollowUp = {
  id: string;
  patientId: string;
  patientName?: string;
  practitionerId?: string;
  type?: string;
  priority?: string;
  status: FollowUpStatus;
  scheduledAt: string;
  summary?: string;
  notes?: string;
  recurrence?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export type CreateFollowUpInput = {
  patientId: string;
  type: string;
  priority: string;
  scheduledAt: string;
  note?: string;
  recurrence?: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  peerId: string;
  peerName: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  readAt?: string;
  messageType?: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  content: string;
  type?: string;
  createdAt: string;
  readAt?: string;
  relatedId?: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
};

export type UserRole = 'PATIENT' | 'DOCTOR' | 'NUTRITIONIST' | 'HEALTH_MANAGER' | 'EXERCISE_COACH' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'DELETED';

export type ManagedUser = {
  id: string;
  phone: string;
  email?: string | null;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  deletedAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type AdminSummary = {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  deletedUsers: number;
  auditLogs: number;
  usersByRole: Partial<Record<UserRole, number>>;
};

export type AuditLogEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  metadata?: unknown;
  createdAt: string;
  actor?: { id: string; displayName: string; phone: string; role: UserRole } | null;
};
