import { api } from './api';
import type { UserStatus } from './types';

export type ActivityStatus = 'ACTIVE' | 'ENDED';
export type MembershipStatus = 'ACTIVE' | 'REMOVED';
export type Activity = {
  id: string; title: string; description: string | null; durationDays: 15;
  status: ActivityStatus; version: number; createdAt: string; updatedAt: string; memberCount: number;
};
export type Candidate = {
  id: string; displayName: string; status: UserStatus;
  membership: null | { id: string; status: MembershipStatus; joinedAt: string; startDate: string };
};
export type ActivityMember = {
  id: string; activityId: string; patientId: string; status: MembershipStatus;
  joinedAt: string; startDate: string; version: number;
  patient: { id: string; displayName: string; status: UserStatus };
};
export type ActivityPage<T> = { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean };
export type ActivityQuery = { search?: string; page?: number; pageSize?: number };
export type ActivityInput = { title: string; description?: string; durationDays?: 15 };
export type ActivityPatch = { title?: string; description?: string; status?: ActivityStatus; expectedVersion: number };

const base = '/yuanqizhan/activities';
const activityPath = (id: string) => `${base}/${encodeURIComponent(id)}`;
function queryPath(path: string, query: ActivityQuery) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
  return params.size ? `${path}?${params}` : path;
}
export function activityManagerAllowed(role: string) { return role === 'ADMIN' || role === 'HEALTH_MANAGER'; }
export function candidateSelectable(candidate: Candidate) { return candidate.status === 'ACTIVE' && candidate.membership?.status !== 'ACTIVE'; }
export type PatientSelection = Record<string, string>;
export function updatePatientSelection(current: PatientSelection, candidates: Candidate[], checked: boolean): PatientSelection {
  const next = { ...current };
  for (const candidate of candidates) {
    if (!checked) delete next[candidate.id];
    else if (candidateSelectable(candidate)) next[candidate.id] = candidate.displayName;
  }
  return next;
}
export function patientIdBatches(patientIds: string[]) {
  const unique = [...new Set(patientIds)];
  const batches: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += 100) batches.push(unique.slice(offset, offset + 100));
  return batches;
}

// Only the activity management projection is consumed here; no health-data or media endpoints.
export const activityApi = {
  list(query: ActivityQuery = {}) { return api.request<ActivityPage<Activity>>(queryPath(base, query)); },
  create(input: ActivityInput) { return api.request<Activity>(base, { method: 'POST', body: input }); },
  update(id: string, input: ActivityPatch) { return api.request<Activity>(activityPath(id), { method: 'PATCH', body: input }); },
  candidates(id: string, query: ActivityQuery = {}) { return api.request<ActivityPage<Candidate>>(queryPath(`${activityPath(id)}/candidates`, query)); },
  members(id: string, query: ActivityQuery = {}) { return api.request<ActivityPage<ActivityMember>>(queryPath(`${activityPath(id)}/members`, query)); },
  addMembers(id: string, patientIds: string[]) { return api.request<{ items: ActivityMember[] }>(`${activityPath(id)}/members`, { method: 'POST', body: { patientIds } }); },
  removeMember(id: string, patientId: string) { return api.request<ActivityMember>(`${activityPath(id)}/members/${encodeURIComponent(patientId)}`, { method: 'DELETE' }); },
};
