import { api } from './api';

export type ActivityRecordPage<T> = { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean };
export type PatientActivity = {
  id: string; title: string; status: 'ACTIVE' | 'ENDED'; durationDays: number;
  member: { id: string; status: 'ACTIVE' | 'REMOVED'; joinedAt: string; startDate: string | null; groupLabel?: string | null };
  pendingStart?: boolean; completedCount?: number; todayStatus?: 'DRAFT' | 'SUBMITTED' | null;
  accessNotice?: string; canWrite: false; readOnly: true;
};
export type ActivityQuestion = {
  key: string; type: string; label?: string; labelOriginal?: string; unit?: string | null;
  options?: { value: string | number | boolean; label: string }[];
  subfields?: { key: string; label?: string; labelOriginal?: string }[];
};
export type ActivityDailyRecord = {
  id: string; activityId: string; patientId: string; date: string; dayNumber: number;
  status: 'DRAFT' | 'SUBMITTED'; formType: string; groupLabel?: string | null; pendingStart?: boolean;
  form?: { title?: string; notice?: string; questions?: ActivityQuestion[] };
  answers: Record<string, unknown>; photos: Record<string, string>;
  submittedAt?: string | null; updatedAt?: string; accessNotice?: string; canWrite: false; readOnly: true;
};

const part = encodeURIComponent;
const patientRecordsPath = (activityId: string, patientId: string) => `/yuanqizhan/${part(activityId)}/patients/${part(patientId)}/records`;
const paged = (path: string, page: number) => `${path}?${new URLSearchParams({ page: String(page), pageSize: '20' })}`;

// This client consumes only patient-scoped, authorized read projections.
export const activityRecordsApi = {
  activities(patientId: string, page = 1) {
    return api.request<ActivityRecordPage<PatientActivity>>(paged(`/yuanqizhan/patients/${part(patientId)}/activities`, page));
  },
  records(activityId: string, patientId: string, page = 1) {
    return api.request<ActivityRecordPage<ActivityDailyRecord>>(paged(patientRecordsPath(activityId, patientId), page));
  },
  record(activityId: string, patientId: string, date: string) {
    return api.request<ActivityDailyRecord>(`${patientRecordsPath(activityId, patientId)}/${part(date)}`);
  },
};
