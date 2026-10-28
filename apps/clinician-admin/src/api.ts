import {
  listFrom,
  normalizeChatMessage,
  normalizeConversation,
  normalizeCareSummary,
  normalizeFollowUp,
  normalizeHealthRecord,
  normalizeNotification,
  normalizePatient,
  normalizeSummary,
} from './model';
import type {
  AuthSession,
  ChatMessage,
  ClinicalSummary,
  Conversation,
  CreatePatientInput,
  CreatePatientResult,
  CreateFollowUpInput,
  FollowUp,
  FollowUpStatus,
  HealthRecord,
  NotificationItem,
  Paginated,
  Patient,
  PatientArchive,
  PatientTask,
  SavePatientArchiveInput,
  AdminSummary,
  AuditLogEntry,
  CareSummary,
  PublishCareSummaryInput,
  ManagedUser,
  UserRole,
  UserStatus,
} from './types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  authenticated?: boolean;
};

type ErrorPayload = { message?: string | string[]; error?: string; code?: string | number };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const row = payload as ErrorPayload;
    if (Array.isArray(row.message)) return row.message.join('；');
    if (typeof row.message === 'string' && row.message) return row.message;
    if (typeof row.error === 'string' && row.error) return row.error;
  }
  return `请求失败（HTTP ${status}）`;
}

function unwrapEnvelope(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  const code = row.code;
  if (code !== undefined && ![0, 200, '0', '200'].includes(code as never)) {
    throw new ApiError(errorMessage(value, 200), 200, value);
  }
  if ('data' in row && (
    'code' in row
    || 'success' in row
    || Object.keys(row).every((key) => ['data', 'message', 'total', 'page', 'pageSize'].includes(key))
  )) return row.data;
  return value;
}

function pageFrom<T>(value: unknown, normalize: (item: unknown) => T): Paginated<T> {
  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const items = listFrom(value).map(normalize);
  const rawTotal = row.total ?? row.totalCount;
  const total = Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : items.length;
  return {
    items,
    total,
    page: Number.isFinite(Number(row.page)) ? Number(row.page) : undefined,
    pageSize: Number.isFinite(Number(row.pageSize)) ? Number(row.pageSize) : undefined,
  };
}

function withQuery(path: string, query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function normalizeSession(value: unknown): AuthSession {
  if (!value || typeof value !== 'object') throw new ApiError('登录响应格式不正确', 200, value);
  const row = value as Record<string, unknown>;
  const user = row.user && typeof row.user === 'object' ? row.user as Record<string, unknown> : {};
  const accessToken = typeof row.accessToken === 'string' ? row.accessToken : '';
  const role = typeof user.role === 'string' ? user.role.toUpperCase() : '';
  if (!accessToken || !['DOCTOR', 'NUTRITIONIST', 'HEALTH_MANAGER', 'EXERCISE_COACH', 'ADMIN'].includes(role)) {
    throw new ApiError('当前账号无权访问管理后台', 403, value);
  }
  const practitionerProfile = user.practitionerProfile && typeof user.practitionerProfile === 'object'
    ? user.practitionerProfile as Record<string, unknown>
    : {};
  return {
    accessToken,
    refreshToken: typeof row.refreshToken === 'string' ? row.refreshToken : undefined,
    user: {
      id: typeof user.id === 'string' ? user.id : '',
      displayName: typeof user.displayName === 'string' ? user.displayName : '管理人员',
      role: role as AuthSession['user']['role'],
      mustChangePassword: user.mustChangePassword === true,
      initialPasswordExpiresAt: typeof user.initialPasswordExpiresAt === 'string' ? user.initialPasswordExpiresAt : null,
      hospital: typeof practitionerProfile.hospital === 'string' ? practitionerProfile.hospital : undefined,
      department: typeof practitionerProfile.department === 'string' ? practitionerProfile.department : undefined,
      title: typeof practitionerProfile.title === 'string' ? practitionerProfile.title : undefined,
    },
  };
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['true', '1', 'yes', 'created', 'new'].includes(value.toLowerCase());
  return fallback;
}

export function normalizeCreatePatientResult(value: unknown): CreatePatientResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('新增患者响应格式不正确', 200, value);
  }
  const row = value as Record<string, unknown>;
  const patientValue = row.patient ?? row.user ?? row;
  const patient = normalizePatient(patientValue);
  if (!patient.id) throw new ApiError('后端未返回患者信息', 502, value);
  const accountCreated = booleanValue(row.accountCreated ?? row.created ?? row.isNewAccount);
  const relationCreated = booleanValue(row.relationCreated ?? row.bound ?? row.bindingCreated, true);
  const temporaryPassword = typeof row.temporaryPassword === 'string'
    ? row.temporaryPassword
    : typeof row.initialPassword === 'string' ? row.initialPassword : undefined;
  const passwordSetupRequired = booleanValue(
    row.passwordSetupRequired ?? row.passwordResetRequired ?? row.mustChangePassword,
    Boolean(temporaryPassword),
  );
  return {
    patient,
    accountCreated,
    relationCreated,
    relationActivated: row.relationActivated === undefined ? undefined : booleanValue(row.relationActivated),
    temporaryPassword,
    passwordSetupRequired,
    nextStep: typeof row.nextStep === 'string' ? row.nextStep : undefined,
    message: typeof row.message === 'string' ? row.message : undefined,
  };
}

function finitePercent(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : 0;
}

export function normalizePatientArchive(value: unknown): PatientArchive | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  const archiveValue = 'archive' in envelope ? envelope.archive : value;
  if (archiveValue === null || archiveValue === undefined) return null;
  if (typeof archiveValue !== 'object' || Array.isArray(archiveValue)) {
    throw new ApiError('患者档案响应格式不正确', 502, value);
  }
  const row = archiveValue as Record<string, unknown>;
  const rawStatus = typeof row.status === 'string' ? row.status.toUpperCase() : '';
  if (!['DRAFT', 'COMPLETED'].includes(rawStatus)) throw new ApiError('患者档案状态不正确', 502, value);
  const answers = row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
    ? row.answers as Record<string, unknown>
    : {};
  return {
    id: typeof row.id === 'string' ? row.id : '',
    archiveNo: typeof row.archiveNo === 'string' ? row.archiveNo : undefined,
    patientId: typeof row.patientId === 'string' ? row.patientId : '',
    status: rawStatus as PatientArchive['status'],
    templateVersion: typeof row.templateVersion === 'string' ? row.templateVersion : 'TCM_WEIGHT_V1',
    answers,
    completionPercent: finitePercent(row.completionPercent),
    createdById: typeof row.createdById === 'string' ? row.createdById : undefined,
    updatedById: typeof row.updatedById === 'string' ? row.updatedById : undefined,
    completedAt: typeof row.completedAt === 'string' ? row.completedAt : null,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
  };
}

export class ApiClient {
  constructor(
    private readonly getAccessToken: () => string | null,
    private readonly baseUrl = API_BASE,
  ) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { authenticated = true, body, headers, ...init } = options;
    const token = authenticated ? this.getAccessToken() : null;
    if (authenticated && !token) throw new ApiError('登录状态已失效，请重新登录', 401);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(body === undefined || body instanceof FormData ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    if (!response.ok) {
      if (authenticated && response.status === 401 && this.getAccessToken() === token && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event('medtalent:session-expired'));
      throw new ApiError(errorMessage(payload, response.status), response.status, payload);
    }
    return unwrapEnvelope(payload) as T;
  }

  async mediaBlob(id: string, signedUrl: string): Promise<Blob> {
    const base = new URL(this.baseUrl, window.location.origin);
    const url = new URL(signedUrl, base);
    if (url.origin !== base.origin || url.pathname !== base.pathname.replace(/\/$/, '') + '/media/' + encodeURIComponent(id) + '/content') {
      throw new ApiError('媒体地址与当前服务不匹配', 400);
    }
    const token = this.getAccessToken();
    if (!token) throw new ApiError('登录状态已失效，请重新登录', 401);
    const response = await fetch(url.href, { headers: { authorization: 'Bearer ' + token }, cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new ApiError('文件不可用或访问权限已失效', response.status);
    return response.blob();
  }

  async requestCandidates<T>(paths: string[], options: RequestOptions = {}): Promise<T> {
    let lastError: ApiError | undefined;
    for (const path of paths) {
      try {
        return await this.request<T>(path, options);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new ApiError('接口不可用', 404);
  }

  async login(phone: string, password: string, role?: 'DOCTOR' | 'NUTRITIONIST' | 'HEALTH_MANAGER' | 'EXERCISE_COACH'): Promise<AuthSession> {
    const value = await this.request<unknown>(role ? '/auth/login' : '/auth/practitioner-login', {
      method: 'POST',
      authenticated: false,
      body: { phone, password, ...(role ? { role } : {}) },
    });
    return normalizeSession(value);
  }

  async adminLogin(username: string, password: string): Promise<AuthSession> {
    const value = await this.request<unknown>('/admin/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { username, password },
    });
    const session = normalizeSession(value);
    if (session.user.role !== 'ADMIN') throw new ApiError('当前账号不是管理员账号', 403, value);
    return session;
  }

  getAdminSummary(): Promise<AdminSummary> {
    return this.request<AdminSummary>('/admin/summary');
  }

  listManagedUsers(query: { search?: string; role?: UserRole | ''; status?: UserStatus | ''; page?: number; pageSize?: number } = {}): Promise<Paginated<ManagedUser>> {
    return this.request<Paginated<ManagedUser>>(withQuery('/admin/users', query));
  }

  createManagedUser(input: { username: string; displayName: string; role: UserRole; password: string }): Promise<ManagedUser> {
    return this.request<ManagedUser>('/admin/users', { method: 'POST', body: input });
  }

  updateManagedUser(id: string, input: { displayName?: string; role?: UserRole; status?: Exclude<UserStatus, 'DELETED'> }): Promise<ManagedUser> {
    return this.request<ManagedUser>(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
  }

  deleteManagedUser(id: string): Promise<{ deleted: boolean; sessionsRevoked: boolean }> {
    return this.request(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  resetManagedUserPassword(id: string, newPassword: string): Promise<{ reset: boolean; sessionsRevoked: boolean }> {
    return this.request(`/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: { newPassword } });
  }

  listAuditLogs(query: { search?: string; action?: string; page?: number; pageSize?: number } = {}): Promise<Paginated<AuditLogEntry>> {
    return this.request<Paginated<AuditLogEntry>>(withQuery('/admin/audit-logs', query));
  }

  async refreshSession(refreshToken: string): Promise<AuthSession> {
    const value = await this.request<unknown>('/auth/refresh', {
      method: 'POST', authenticated: false, body: { refreshToken },
    });
    return normalizeSession(value);
  }

  async logout(refreshToken?: string): Promise<void> {
    await this.request<void>('/auth/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {} });
  }

  async getClinicalSummary(): Promise<ClinicalSummary> {
    const value = await this.requestCandidates<unknown>([
      '/clinical/summary',
      '/clinical/dashboard',
    ]);
    return normalizeSummary(value);
  }

  async listPatients(query: { search?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<Paginated<Patient>> {
    const value = await this.request<unknown>(withQuery('/clinical/patients', query));
    return pageFrom(value, normalizePatient);
  }

  async createPatient(input: CreatePatientInput): Promise<CreatePatientResult> {
    const value = await this.request<unknown>('/clinical/patients', {
      method: 'POST',
      body: input,
    });
    return normalizeCreatePatientResult(value);
  }

  async getPatient(patientId: string): Promise<Patient> {
    const id = encodeURIComponent(patientId);
    const value = await this.requestCandidates<unknown>([
      `/clinical/patients/${id}`,
      `/clinical/patients/${id}/detail`,
    ]);
    return normalizePatient(value);
  }

  async getPatientRecords(patientId: string): Promise<HealthRecord[]> {
    const id = encodeURIComponent(patientId);
    const value = await this.requestCandidates<unknown>([
      `/clinical/patients/${id}/records?type=WEIGHT&pageSize=90`,
      `/clinical/patients/${id}/weight-trend?days=90`,
    ]);
    return listFrom(value).map(normalizeHealthRecord);
  }

  async getPatientArchive(patientId: string): Promise<PatientArchive | null> {
    const value = await this.request<unknown>(`/clinical/patients/${encodeURIComponent(patientId)}/archive`);
    return normalizePatientArchive(value);
  }

  async savePatientArchive(patientId: string, input: SavePatientArchiveInput): Promise<PatientArchive> {
    const value = await this.request<unknown>(`/clinical/patients/${encodeURIComponent(patientId)}/archive`, {
      method: 'PUT',
      body: input,
    });
    const archive = normalizePatientArchive(value);
    if (!archive) throw new ApiError('后端未返回已保存的患者档案', 502, value);
    return archive;
  }

  async createPatientTask(patientId: string, input: { title: string; description?: string; dueAt?: string }): Promise<PatientTask> {
    return this.request<PatientTask>(`/clinical/patients/${encodeURIComponent(patientId)}/tasks`, {
      method: 'POST',
      body: input,
    });
  }

  async listPatientCareSummaries(patientId: string): Promise<CareSummary[]> {
    const value = await this.request<unknown>(`/clinical/patients/${encodeURIComponent(patientId)}/care-summaries`);
    return listFrom(value).map(normalizeCareSummary);
  }

  async publishPatientCareSummary(patientId: string, input: PublishCareSummaryInput): Promise<CareSummary> {
    const value = await this.request<unknown>(`/clinical/patients/${encodeURIComponent(patientId)}/care-summaries`, {
      method: 'POST',
      body: input,
    });
    return normalizeCareSummary(value);
  }

  async listFollowUps(query: { status?: string; patientId?: string; page?: number; pageSize?: number } = {}): Promise<Paginated<FollowUp>> {
    const paths = [
      withQuery('/follow-ups', query),
      withQuery('/workflow/follow-ups', query),
    ];
    const value = await this.requestCandidates<unknown>(paths);
    return pageFrom(value, normalizeFollowUp);
  }

  async createFollowUp(input: CreateFollowUpInput): Promise<FollowUp> {
    const value = await this.requestCandidates<unknown>(['/follow-ups', '/workflow/follow-ups'], {
      method: 'POST',
      body: {
        patientIds: [input.patientId],
        followType: input.type,
        priority: input.priority,
        scheduledAt: input.scheduledAt,
        note: input.note,
        ...(input.recurrence ? { recurrence: input.recurrence } : {}),
      },
    });
    const created = listFrom(value)[0];
    if (!created) throw new ApiError('后端未返回已创建的随访记录', 502, value);
    return normalizeFollowUp(created);
  }

  async updateFollowUp(id: string, status: FollowUpStatus, summary?: string): Promise<FollowUp> {
    const encodedId = encodeURIComponent(id);
    const value = await this.requestCandidates<unknown>([
      `/follow-ups/${encodedId}`,
      `/workflow/follow-ups/${encodedId}`,
    ], {
      method: 'PATCH',
      body: { status, summary },
    });
    return normalizeFollowUp(value);
  }

  async listConversations(): Promise<Conversation[]> {
    const value = await this.requestCandidates<unknown>([
      '/messages/conversations?pageSize=100',
      '/workflow/messages/conversations?pageSize=100',
    ]);
    return listFrom(value).map(normalizeConversation);
  }

  async listMessages(peerId: string): Promise<ChatMessage[]> {
    const id = encodeURIComponent(peerId);
    const value = await this.requestCandidates<unknown>([
      `/messages/conversations/${id}/messages?pageSize=100`,
      `/workflow/messages/${id}`,
    ]);
    return listFrom(value).map(normalizeChatMessage);
  }

  async sendMessage(peerId: string, content: string): Promise<ChatMessage> {
    const id = encodeURIComponent(peerId);
    try {
      const value = await this.request<unknown>(`/messages/conversations/${id}/messages`, {
        method: 'POST',
        body: { content },
      });
      return normalizeChatMessage(value);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      const value = await this.request<unknown>('/workflow/messages', {
        method: 'POST',
        body: { receiverId: peerId, content },
      });
      return normalizeChatMessage(value);
    }
  }

  async markMessageRead(messageId: string): Promise<void> {
    await this.request<void>(`/messages/${encodeURIComponent(messageId)}/read`, { method: 'PATCH' });
  }

  async listNotifications(): Promise<NotificationItem[]> {
    const value = await this.requestCandidates<unknown>([
      '/notifications?pageSize=100',
      '/workflow/me/notifications?pageSize=100',
    ]);
    return listFrom(value).map(normalizeNotification);
  }

  async readNotification(id: string): Promise<void> {
    await this.requestCandidates<void>([
      `/notifications/${encodeURIComponent(id)}/read`,
      `/workflow/me/notifications/${encodeURIComponent(id)}/read`,
    ], { method: 'PATCH' });
  }

  async readAllNotifications(): Promise<void> {
    await this.requestCandidates<void>([
      '/notifications/read-all',
      '/workflow/me/notifications/read-all',
    ], { method: 'PATCH' });
  }
}

export const api = new ApiClient(() => localStorage.getItem('weightcare_access_token'));

// Kept for older imports while the dashboard migrates to the typed client.
export async function fetchClinicalPatients(token: string): Promise<Patient[]> {
  const client = new ApiClient(() => token);
  return (await client.listPatients({ pageSize: 100 })).items;
}
