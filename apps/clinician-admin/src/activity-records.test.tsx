import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { activityRecordsApi, type ActivityDailyRecord } from './activity-records-api';
import { activityAnswer, YuanqizhanRecordView } from './YuanqizhanRecords';

afterEach(() => vi.restoreAllMocks());

describe('patient-scoped Yuanqizhan read API', () => {
  it('paginates activities and daily records using the dedicated, encoded patient read routes', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({});
    await activityRecordsApi.activities('synthetic/patient', 3);
    await activityRecordsApi.records('synthetic/activity', 'synthetic/patient', 2);
    await activityRecordsApi.record('synthetic/activity', 'synthetic/patient', '2026-10-18');
    expect(request.mock.calls).toEqual([
      ['/yuanqizhan/patients/synthetic%2Fpatient/activities?page=3&pageSize=20'],
      ['/yuanqizhan/synthetic%2Factivity/patients/synthetic%2Fpatient/records?page=2&pageSize=20'],
      ['/yuanqizhan/synthetic%2Factivity/patients/synthetic%2Fpatient/records/2026-10-18'],
    ]);
  });
  it('propagates a withdrawn or missing patient binding rather than manufacturing empty history', async () => {
    const denied = new Error('无权查看该客户活动记录');
    vi.spyOn(api, 'request').mockRejectedValue(denied);
    await expect(activityRecordsApi.records('synthetic-a', 'synthetic-p')).rejects.toBe(denied);
  });
});

describe('saved activity-answer display', () => {
  it('uses historical option labels, preserves zero and negative answers, and appends the saved unit', () => {
    const question = { key: 'appetite', type: 'single_choice', options: [{ value: -2, label: '历史选项：明显减少' }, { value: 0, label: '历史选项：正常' }] };
    expect(activityAnswer(question, -2)).toBe('历史选项：明显减少');
    expect(activityAnswer(question, 0)).toBe('历史选项：正常');
    expect(activityAnswer({ key: 'weight', type: 'number', unit: 'kg' }, 61.25)).toBe('61.25 kg');
    expect(activityAnswer({ key: 'weight', type: 'number', unit: 'kg' }, null)).toBe('未填写');
  });
  it('renders only the original named subfields and does not expose unrelated nested metadata', () => {
    expect(activityAnswer({ key: 'bowel_observation', type: 'inline_multiple_text', subfields: [{ key: 'count', label: '次数' }, { key: 'extra', label: '其他' }] }, { count: 0, extra: '', token: 'not-a-display-field' })).toBe('次数：0\n其他：未填写');
  });
});

describe('read-only daily check-in detail', () => {
  const record: ActivityDailyRecord = {
    id: 'synthetic-r', activityId: 'synthetic-a', patientId: 'synthetic-p', date: '2026-10-18', dayNumber: 8,
    status: 'SUBMITTED', formType: 'milestone', groupLabel: '基础减重组', canWrite: false, readOnly: true,
    submittedAt: '2026-10-18T10:00:00Z',
    accessNotice: '当前规则：已绑定营养师可以只读查看元气盏打卡。',
    form: { title: '合成阶段打卡', notice: '历史声明：营养师不得查看这些照片', questions: [
      { key: 'name', label: '姓名', type: 'text' },
      { key: 'fasting_weight', label: '今日空腹体重', type: 'number', unit: 'kg' },
      { key: 'appetite', label: '食欲', type: 'single_choice', options: [{ value: 0, label: '正常' }] },
      { key: 'bowel_observation', label: '今日排便观察', type: 'inline_multiple_text', subfields: [{ key: 'extra', label: '其他排便观察' }] },
      { key: 'tongue_coating', label: '原表舌苔照片', type: 'file_upload' },
    ] },
    answers: { name: '不应显示的身份', fasting_weight: 61.25, appetite: 0, bowel_observation: { extra: '<script>合成自由回答</script>' }, token: 'not-a-display-field' },
    photos: { tongue_coating: 'synthetic-private-photo' },
  };

  it('shows date, day, submission, saved answers and protected photo controls without editing or identity fields', () => {
    const html = renderToStaticMarkup(<YuanqizhanRecordView record={record} />);
    for (const text of ['2026-10-18', 'Day 8', '已完成打卡', '今日空腹体重', '61.25 kg', '正常', '原表舌苔照片', '查看照片']) expect(html).toContain(text);
    for (const text of ['不应显示的身份', 'not-a-display-field', 'synthetic-private-photo', '<input', '<textarea', '删除', '<script>']) expect(html).not.toContain(text);
    expect(html).toContain('&lt;script&gt;合成自由回答&lt;/script&gt;');
  });
  it('uses the current access notice instead of the obsolete historical form notice', () => {
    const html = renderToStaticMarkup(<YuanqizhanRecordView record={record} />);
    expect(html).toContain('当前规则：已绑定营养师可以只读查看元气盏打卡。');
    expect(html).not.toContain('历史声明：营养师不得查看这些照片');
  });
  it('distinguishes a draft from a finished check-in and reports absent attachments honestly', () => {
    const html = renderToStaticMarkup(<YuanqizhanRecordView record={{ ...record, status: 'DRAFT', submittedAt: null, photos: {} }} />);
    expect(html).toContain('草稿 · 尚未完成');
    expect(html).toContain('尚未提交');
    expect(html).toContain('本次记录未附照片。');
    expect(html).not.toContain('已完成打卡');
  });
});
