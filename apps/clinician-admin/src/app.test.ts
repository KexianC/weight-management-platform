import { describe, expect, it } from 'vitest';
import { deriveClinicalSummary, normalizePatient, riskLabel } from './model';
import { archiveCompletion, nextArchiveCheckboxValues } from './archive-schema';
import type { FollowUp, Patient } from './types';

describe('clinical model', () => {
  it('does not invent age, BMI, risk or adherence when the API omits them', () => {
    const patient = normalizePatient({
      id: 'patient-1',
      displayName: '测试患者',
      healthRecords: [{ id: 'record-1', weightKg: '72.5', measuredAt: '2026-08-17T08:00:00.000Z' }],
    });
    expect(patient.currentWeightKg).toBe(72.5);
    expect(patient.age).toBeUndefined();
    expect(patient.bmi).toBeUndefined();
    expect(patient.riskLevel).toBeUndefined();
    expect(patient.adherencePct).toBeUndefined();
    expect(riskLabel(patient.riskLevel)).toBe('未分级');
  });

  it('derives BMI only from real height and weight fields', () => {
    const patient = normalizePatient({ id: 'p', displayName: '患者', heightCm: 170, currentWeightKg: 68 });
    expect(patient.bmi).toBe(23.5);
  });

  it('maps backend patient attention and latest-record fields without inventing a risk score', () => {
    const patient = normalizePatient({
      id: 'p', displayName: '患者', attention: true, active: true,
      latestRecordAt: '2026-08-17T08:00:00.000Z', medicalHistory: ['高血压', '脂肪肝'],
    });
    expect(patient.requiresAttention).toBe(true);
    expect(patient.riskLevel).toBe('ATTENTION');
    expect(patient.status).toBe('ACTIVE');
    expect(patient.lastRecordAt).toBe('2026-08-17T08:00:00.000Z');
    expect(patient.medicalHistory).toBe('高血压、脂肪肝');
  });

  it('calculates dashboard metrics only from supplied API rows', () => {
    const patients = [
      { id: 'p1', displayName: '甲', riskLevel: 'HIGH', adherencePct: 80, healthRecords: [], receivedTasks: [] },
      { id: 'p2', displayName: '乙', adherencePct: 60, healthRecords: [], receivedTasks: [] },
    ] as Patient[];
    const followUps = [
      { id: 'f1', patientId: 'p1', scheduledAt: '2026-08-17T09:00:00+08:00', status: 'PENDING' },
      { id: 'f2', patientId: 'p2', scheduledAt: '2026-08-16T09:00:00+08:00', status: 'IN_PROGRESS' },
    ] as FollowUp[];
    const summary = deriveClinicalSummary(patients, followUps, {}, new Date('2026-08-17T08:00:00+08:00'));
    expect(summary).toMatchObject({ totalPatients: 2, dueToday: 1, overdueFollowUps: 1, averageAdherencePct: 70, highRiskPatients: 1 });
  });

  it('normalizes the patient archive summary without inventing a record', () => {
    expect(normalizePatient({
      id: 'p1', displayName: '患者甲', archiveStatus: 'DRAFT', archiveCompletionPercent: 35,
      archiveUpdatedAt: '2026-08-18T08:00:00.000Z',
    })).toMatchObject({ archiveStatus: 'DRAFT', archiveCompletionPercent: 35, archiveUpdatedAt: '2026-08-18T08:00:00.000Z' });
    expect(normalizePatient({ id: 'p2', displayName: '患者乙' }).archiveStatus).toBeNull();
  });

  it('calculates archive completion from filled fields instead of touched sections', () => {
    const completion = archiveCompletion({ archiveDate: '2026-08-18', occupation: 'TEACHER', obesitySymptoms: ['SNORING'] });
    expect(completion.filledFields).toBe(3);
    expect(completion.completedSections).toBe(2);
    expect(completion.percentage).toBe(Math.round((3 / completion.totalFields) * 100));
  });

  it('keeps none and normal options mutually exclusive in archive multi-selects', () => {
    expect(nextArchiveCheckboxValues('pastWeightLossMethods', ['EXERCISE'], 'NONE', true)).toEqual(['NONE']);
    expect(nextArchiveCheckboxValues('pastWeightLossMethods', ['NONE'], 'DIET', true)).toEqual(['DIET']);
    expect(nextArchiveCheckboxValues('urinationStatus', ['NORMAL'], 'POLYURIA', true)).toEqual(['POLYURIA']);
  });
});
