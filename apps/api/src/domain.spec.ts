import { ConflictException } from '@nestjs/common';
import { assertFollowUpTransition, assertTaskTransition, estimateCalories, getRangeStart } from './domain';

describe('workflow domain rules', () => {
  it('allows a patient to complete a follow-up after the practitioner started it', () => {
    expect(() => assertFollowUpTransition('IN_PROGRESS', 'COMPLETED', 'PATIENT')).not.toThrow();
  });

  it('keeps completed follow-ups terminal', () => {
    expect(() => assertFollowUpTransition('COMPLETED', 'IN_PROGRESS', 'DOCTOR')).toThrow(ConflictException);
  });

  it('prevents a patient from cancelling an assigned task', () => {
    expect(() => assertTaskTransition('PENDING', 'CANCELLED', 'PATIENT')).toThrow(ConflictException);
  });

  it('uses the requested reporting range at Shanghai midnight', () => {
    const now = new Date('2026-08-17T00:00:00.000Z');
    expect(getRangeStart('30d', now).toISOString()).toBe('2026-07-18T16:00:00.000Z');
  });

  it('estimates known foods by amount', () => {
    expect(estimateCalories('蒸鸡胸肉', 150)).toMatchObject({ caloriesKcal: 200, source: 'COMMON_FOOD_DATABASE' });
  });
});
