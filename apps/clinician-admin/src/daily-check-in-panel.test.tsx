import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DailyCheckInPanel, { DailyCheckInRecordView } from './DailyCheckInPanel';
import { dailyCheckInAnswerLabel, dailyCheckInQuestions, dailyCheckInShareUrl } from './daily-check-in-api';

describe('daily check-in saved answer display', () => {
  it('preserves zero and negative choices, and distinguishes omitted answers from zero', () => {
    const appetite = dailyCheckInQuestions.find(question => question.key === 'appetite')!;
    const bowelCount = dailyCheckInQuestions.find(question => question.key === 'bowel_count')!;
    expect(dailyCheckInAnswerLabel(appetite, 0)).toBe('和平时一样');
    expect(dailyCheckInAnswerLabel(appetite, -2)).toBe('食欲明显减退');
    expect(dailyCheckInAnswerLabel(bowelCount, 0)).toBe('0');
    expect(dailyCheckInAnswerLabel(bowelCount, undefined)).toBe('未填写');
    expect(dailyCheckInAnswerLabel(appetite, 50)).toBe('未识别的选项');
  });
  it('renders only known answers and escapes customer-entered observations', () => {
    const html = renderToStaticMarkup(<DailyCheckInRecordView record={{ date: '2026-11-12', version: 1, weightKg: 62.5, updatedAt: '2026-11-12T03:00:00Z', answers: { appetite: 0, bowel_count: 0, bowel_extra: '<script>合成观察</script>', ...{ token: 'secret-not-displayable' } } }} />);
    for (const value of ['62.5', '和平时一样', '未填写', '北京时间', '&lt;script&gt;合成观察&lt;/script&gt;']) expect(html).toContain(value);
    expect(html).not.toContain('secret-not-displayable');
    expect(html).not.toContain('<script>');
  });
  it('does not expose share controls before the server returns management permission', () => {
    const html = renderToStaticMarkup(<DailyCheckInPanel patientId="synthetic-patient" canManageLink />);
    expect(html).toContain('正在加载填报记录');
    expect(html).not.toContain('查看专属链接与二维码');
    expect(html).not.toContain('重置链接');
  });
  it('distinguishes permission-hidden observations from answers that were not filled in', () => {
    const html = renderToStaticMarkup(<DailyCheckInRecordView record={{ date: '2026-11-12', version: 1, weightKg: 62.5, updatedAt: '2026-11-12T03:00:00Z', answers: { bowel_extra: '不得展示的自由文本' }, redactedAnswerKeys: ['bowel_extra'] }} />);
    expect(html).toContain('<dt>排便附加观察</dt><dd>当前权限不显示</dd>');
    expect(html).toContain('<dt>昨日疲劳感</dt><dd>未填写</dd>');
    expect(html).not.toContain('不得展示的自由文本');
  });
});

describe('daily check-in sharing URL', () => {
  it('rejects script, relative and embedded-credential links', () => {
    for (const url of ['javascript:alert(1)', '/#/daily-check-in/test', 'https://user:password@example.com/#/daily-check-in/test']) expect(dailyCheckInShareUrl(url)).toBeNull();
    expect(dailyCheckInShareUrl('https://example.com/#/daily-check-in/test')).toBe('https://example.com/#/daily-check-in/test');
  });
});
