import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { activityDay, formDefinition, formTypeForDay, memberWindow, normalizedAnswers, normalizedPhotos, PHOTO_SLOTS, shanghaiDate, validCalendarDate } from './yuanqizhan-policy';

describe('Yuanqizhan original form and personal Shanghai calendar policy', () => {
  const fixture = JSON.parse(readFileSync(resolve(process.env.YUANQIZHAN_REPOSITORY_ROOT ?? resolve(__dirname, '../../..'), 'tests/reconstruction/yuanqizhan-activity-20261014/fixture-design.json'), 'utf8'));
  for (const sample of fixture.dateOracle.cases) {
    it(`matches the independent date oracle ${sample.id}`, () => {
      const joinedAt = new Date(sample.joinedAt), now = new Date(sample.now);
      const result = memberWindow({status: 'ACTIVE', durationDays: 15}, {status: 'ACTIVE', joinedAt, startDate: shanghaiDate(joinedAt)}, now);
      expect(result.dayNumber).toBe(sample.expectedDay);
      expect(result.formType).toBe(sample.expectedForm ?? null);
      expect(result.canWrite).toBe(sample.writeAllowedByPersonalDay);
    });
  }
  it('rejects impossible calendar dates and applies milestones only inside the personal period', () => {
    for (const date of ['2026-02-29', '2026-13-01', '2026-01-32', '2026-2-01', 'x']) expect(validCalendarDate(date)).toBe(false);
    expect(validCalendarDate('2028-02-29')).toBe(true);
    expect(() => activityDay('2026-02-29', '2026-03-01')).toThrow();
    expect(formTypeForDay(0)).toBe(null); expect(formTypeForDay(16)).toBe(null);
  });
  it('keeps the original nine/sixteen questions, time references, zero appetite and categorical stool', () => {
    const daily = formDefinition('daily'), milestone = formDefinition('milestone');
    expect(daily.questions).toHaveLength(9); expect(milestone.questions).toHaveLength(16);
    expect(daily.questions.find((q) => q.key === 'appetite')!.options!.map((o: {value: number}) => o.value)).toEqual([-2, -1, 0, 1, 2]);
    expect(daily.questions.find((q) => q.key === 'stool_type')!.options!.map((o: {value: number}) => o.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(daily.questions.find((q) => q.key === 'fasting_weight')!.unit).toBe('kg');
    expect(daily.questions.find((q) => q.key === 'sleep_quality')!.timeReference).toBe('last_night');
    expect(daily.questions.find((q) => q.key === 'fatigue')!.timeReference).toBe('yesterday');
    expect(milestone.questions.filter((q) => q.type === 'file_upload').map((q) => q.key)).toEqual(PHOTO_SLOTS);
    const side = milestone.questions.find((q) => q.key === 'body_side')!;
    expect(side.labelOriginal).toContain('测面'); expect(side.label).toContain('侧面');
    const bowel = daily.questions.find((q) => q.key === 'bowel_observation')!;
    expect(bowel.subfields!.find((f: {key: string; label: string}) => f.key === 'bowel_extra')!.label).toBe('其他排便观察');
    expect(bowel.subfields!.every((f: {required: boolean}) => f.required === false)).toBe(true);
  });
  const dailyAnswers = {name: '合成患者', fasting_weight: 63.125, fatigue: 2, hunger: 3, appetite: 0, sleep_quality: 4, energy_complexion: 4, bowel_observation: {bowel_count: '一次'}, stool_type: 4};
  it('accepts appetite zero and only one free-text bowel field; empty drafts remain incomplete', () => {
    expect(normalizedAnswers(dailyAnswers, 'daily', true).appetite).toBe(0);
    expect(normalizedAnswers(dailyAnswers, 'daily', true).bowel_observation).toEqual({bowel_count: '一次', bowel_ease: '', bowel_extra: ''});
    expect(normalizedAnswers({}, 'daily', false)).toEqual({});
    expect(() => normalizedAnswers({}, 'daily', true)).toThrow();
    expect(() => normalizedAnswers({...dailyAnswers, bowel_observation: {}}, 'daily', true)).toThrow();
  });
  it('refuses unknown values, implicit units, invalid scores, and cross-form answers', () => {
    for (const patch of [{fasting_weight: '63kg'}, {fasting_weight: 0}, {fasting_weight: 63.12345}, {appetite: 3}, {stool_type: 8}, {name: ' '}, {bowel_observation: {other: 'x'}}, {fasting_waist: 70}]) expect(() => normalizedAnswers({...dailyAnswers, ...patch}, 'daily', true)).toThrow();
    expect(() => normalizedAnswers({...dailyAnswers, fasting_waist: 70}, 'milestone', true)).not.toThrow();
  });
  it('requires all six distinct bound asset IDs for milestone submission; daily has no photo answers', () => {
    const photos = Object.fromEntries(PHOTO_SLOTS.map((slot) => [slot, 'synthetic_' + slot]));
    expect(normalizedPhotos(photos, 'milestone', true)).toEqual(photos);
    expect(() => normalizedPhotos({}, 'milestone', true)).toThrow();
    expect(normalizedPhotos({}, 'milestone', false)).toEqual({});
    expect(() => normalizedPhotos(photos, 'daily', false)).toThrow();
    expect(() => normalizedPhotos({...photos, body_side: photos.body_front}, 'milestone', true)).toThrow();
    expect(() => normalizedPhotos({...photos, face: ['synthetic_face']}, 'milestone', true)).toThrow();
  });
  it('makes removed and ended members read-only without changing their personal start', () => {
    const member = {status: 'REMOVED', joinedAt: new Date('2026-10-14T01:00:00Z'), startDate: '2026-10-14'};
    expect(memberWindow({status: 'ACTIVE', durationDays: 15}, member, new Date('2026-10-21T02:00:00Z')).canWrite).toBe(false);
    expect(memberWindow({status: 'ACTIVE', durationDays: 15}, {...member, status: 'ACTIVE'}, new Date('2026-10-21T02:00:00Z')).dayNumber).toBe(8);
    expect(memberWindow({status: 'ENDED', durationDays: 15}, {...member, status: 'ACTIVE'}, new Date('2026-10-21T02:00:00Z')).canWrite).toBe(false);
  });
});