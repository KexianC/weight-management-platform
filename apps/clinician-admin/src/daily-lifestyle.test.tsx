import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { dailyMealCount, dailySleepLabel, dailySleepMinutes, validateDailyPhoto } from './daily-check-in-api';
import { normalizedDailyWeight, serializeDailyAnswers } from './PublicDailyCheckIn';
import { DailyCheckInRecordView } from './DailyCheckInPanel';

describe('daily lifestyle values', () => {
  it('calculates 24-hour times including midnight and overnight without defaults', () => {
    expect(dailySleepMinutes()).toBeNull();
    expect(dailySleepMinutes('00:00')).toBeNull();
    expect(dailySleepMinutes(undefined, '09:00')).toBeNull();
    expect(dailySleepMinutes('00:00', '09:00')).toBe(540);
    expect(dailySleepLabel('00:00', '09:00')).toBe('9小时');
    expect(dailySleepMinutes('23:30', '07:15')).toBe(465);
    expect(dailySleepLabel('23:30', '07:15')).toBe('7小时45分钟');
    expect(dailySleepMinutes('09:00', '09:00')).toBe(0);
    for (const invalid of ['24:00', '9:00', '09:60', '12:30:00']) expect(dailySleepMinutes(invalid, '09:00')).toBeNull();
  });
  it('keeps weight required and preserves the existing kg/jin conversion', () => {
    expect(() => normalizedDailyWeight('', 'KG')).toThrow();
    expect(normalizedDailyWeight('131', 'JIN')).toBe(65.5);
    expect(normalizedDailyWeight('65.5', 'KG')).toBe(65.5);
  });
  it('submits weight-only answers empty, keeps explicit zero/partial times and omits failed or deleted photos', () => {
    expect(serializeDailyAnswers({}, [])).toEqual({});
    const answer = serializeDailyAnswers({ exercise_minutes: 0, water_ml: 0, sleep_start: '00:00', breakfast_text: '', breakfast_photo_ids: ['deleted'] }, [
      { meal: 'breakfast', status: 'failed', id: 'never-submit' },
      { meal: 'lunch', status: 'uploading' },
      { meal: 'dinner', status: 'ready', id: 'successful' },
    ]);
    expect(answer).toEqual({ exercise_minutes: 0, water_ml: 0, sleep_start: '00:00', dinner_photo_ids: ['successful'] });
    expect(serializeDailyAnswers({ dinner_photo_ids: ['successful'] }, [])).toEqual({});
    expect(() => serializeDailyAnswers({}, Array.from({ length: 4 }, (_, index) => ({ meal: 'breakfast' as const, status: 'ready' as const, id: String(index) })))).toThrow('每餐最多');
  });
  it('accepts only supported nonempty images within the 10 MiB boundary', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(() => validateDailyPhoto({ type, size: 10 * 1024 * 1024 })).not.toThrow();
    for (const file of [{ type: 'image/gif', size: 10 }, { type: 'image/png', size: 0 }, { type: 'image/webp', size: 10 * 1024 * 1024 + 1 }]) expect(() => validateDailyPhoto(file)).toThrow();
  });
  it('counts meals from text or successfully retained photos without requiring all meals', () => {
    expect(dailyMealCount({})).toBe(0);
    expect(dailyMealCount({ breakfast_text: '  ', lunch_photo_ids: [], dinner_text: '鱼和蔬菜' })).toBe(1);
    expect(dailyMealCount({ breakfast_text: '鸡蛋', breakfast_photo_ids: ['a'], lunch_photo_ids: ['b'] })).toBe(2);
  });
});

describe('daily lifestyle staff history', () => {
  it('displays optional metrics, time/duration and meals for staff including nutritionists, loading only referenced photos', () => {
    const html = renderToStaticMarkup(<DailyCheckInRecordView record={{ date: '2026-11-13', version: 2, weightKg: 65.5, updatedAt: '2026-11-13T02:00:00Z',
      answers: { waist_cm: 82.5, exercise_minutes: 0, water_ml: 2000, sleep_start: '23:30', sleep_end: '07:15', breakfast_text: '<早餐>', breakfast_photo_ids: ['photo-breakfast'], dinner_text: '晚餐蔬菜' },
      redactedAnswerKeys: ['bowel_extra'], photos: [{ id: 'photo-breakfast', mimeType: 'image/png', url: 'https://example.com/private' }, { id: 'unreferenced', mimeType: 'image/png', url: 'https://example.com/extra' }] }} />);
    for (const expected of ['82.5 cm', '0 分钟', '2000 ml', '23:30 → 07:15', '7小时45分钟', '&lt;早餐&gt;', '晚餐蔬菜', '查看早餐照片1', '已记录 2/3 餐']) expect(html).toContain(expected);
    expect(html).toContain('当前权限不显示');
    expect(html).not.toContain('<早餐>');
    expect(html).not.toContain('https://example.com/');
    expect(html).not.toContain('unreferenced');
  });
  it('supports legacy weight-only records and incomplete sleep without inventing values', () => {
    const html = renderToStaticMarkup(<DailyCheckInRecordView record={{ date: '2026-11-13', version: 1, weightKg: 62.5, updatedAt: '2026-11-13T02:00:00Z', answers: { sleep_start: '00:00' } }} />);
    expect(html).toContain('<dt>腰围</dt><dd>未填写</dd>');
    expect(html).toContain('<dt>睡眠时段</dt><dd>00:00 → 未填写</dd>');
    expect(html).toContain('<dt>睡眠时长</dt><dd>未填写</dd>');
    expect(html).toContain('已记录 0/3 餐');
  });
});
