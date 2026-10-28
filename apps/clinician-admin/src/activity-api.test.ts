import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { activityApi, activityManagerAllowed, candidateSelectable, patientIdBatches, updatePatientSelection } from './activity-api';
import type { Candidate } from './activity-api';

const candidate = (id: string, patch: Partial<Candidate> = {}): Candidate => ({ id, displayName: `合成患者 ${id}`, status: 'ACTIVE', membership: null, ...patch });

afterEach(() => vi.restoreAllMocks());

describe('activity participation selection', () => {
  it('retains 101 selected patients across six pages and removes only the unchecked page', () => {
    const rows = Array.from({ length: 101 }, (_, index) => candidate(`synthetic-${index + 1}`));
    let selected = {};
    for (let offset = 0; offset < rows.length; offset += 20) selected = updatePatientSelection(selected, rows.slice(offset, offset + 20), true);
    expect(Object.keys(selected)).toHaveLength(101);
    expect(patientIdBatches(Object.keys(selected)).map((batch) => batch.length)).toEqual([100, 1]);
    selected = updatePatientSelection(selected, rows.slice(20, 40), false);
    expect(Object.keys(selected)).toHaveLength(81);
    expect(selected).toHaveProperty('synthetic-1');
    expect(selected).toHaveProperty('synthetic-101');
    expect(selected).not.toHaveProperty('synthetic-21');
  });

  it('includes a patient without enrollment and rejoining patient, while skipping disabled and already active patients', () => {
    const removed = candidate('removed', { membership: { id: 'membership-removed', status: 'REMOVED', joinedAt: '2026-10-01T14:00:00Z', startDate: '2026-10-01' } });
    const current = candidate('active', { membership: { id: 'membership-active', status: 'ACTIVE', joinedAt: '2026-10-01T14:00:00Z', startDate: '2026-10-01' } });
    const disabled = candidate('disabled', { status: 'DISABLED' });
    expect(updatePatientSelection({}, [candidate('legacy'), removed, current, disabled], true)).toEqual({ legacy: '合成患者 legacy', removed: '合成患者 removed' });
    expect(candidateSelectable(current)).toBe(false);
    expect(removed.membership?.startDate).toBe('2026-10-01');
  });

  it('only grants configuration UI to admins and health managers', () => {
    expect(['ADMIN', 'HEALTH_MANAGER'].map(activityManagerAllowed)).toEqual([true, true]);
    expect(['DOCTOR', 'NUTRITIONIST', 'EXERCISE_COACH', 'PATIENT'].map(activityManagerAllowed)).toEqual([false, false, false, false]);
  });
});

describe('dedicated activity management API contract', () => {
  it('paginates and encodes candidate search and activity IDs without using care or health endpoints', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ items: [], total: 0, page: 6, pageSize: 20, hasMore: false });
    await activityApi.candidates('synthetic/activity', { search: '同名 + 合成', page: 6, pageSize: 20 });
    expect(request).toHaveBeenCalledExactlyOnceWith('/yuanqizhan/activities/synthetic%2Factivity/candidates?search=%E5%90%8C%E5%90%8D+%2B+%E5%90%88%E6%88%90&page=6&pageSize=20');
  });

  it('sends only selected patient IDs and the expected configuration version', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({});
    await activityApi.addMembers('synthetic-a', ['synthetic-p1', 'synthetic-p101']);
    await activityApi.update('synthetic-a', { status: 'ENDED', expectedVersion: 4 });
    await activityApi.removeMember('synthetic-a', 'synthetic/p1');
    expect(request.mock.calls).toEqual([
      ['/yuanqizhan/activities/synthetic-a/members', { method: 'POST', body: { patientIds: ['synthetic-p1', 'synthetic-p101'] } }],
      ['/yuanqizhan/activities/synthetic-a', { method: 'PATCH', body: { status: 'ENDED', expectedVersion: 4 } }],
      ['/yuanqizhan/activities/synthetic-a/members/synthetic%2Fp1', { method: 'DELETE' }],
    ]);
  });
});
