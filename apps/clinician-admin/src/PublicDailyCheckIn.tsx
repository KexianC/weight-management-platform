import React, { useEffect, useState } from 'react';
import { CheckCircledIcon, ChevronDownIcon, ReloadIcon } from '@radix-ui/react-icons';
import logoUrl from './assets/medtalent-logo.png';
import { bowelEaseOptions, dailyCheckInQuestions } from './daily-check-in-api';
import type { DailyCheckInAnswers, DailyCheckInContext, DailyCheckInRecord } from './daily-check-in-api';
import './public-daily-check-in.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
class PublicFormError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function publicRequest<T>(action: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}/public/daily-check-in/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 404 ? '此填报链接已停用或无效，请联系您的服务人员获取新链接。'
      : Array.isArray(data?.message) ? data.message.join('；') : data?.message;
    throw new PublicFormError(typeof message === 'string' ? message : '暂时无法保存，请稍后重试。', response.status);
  }
  return data as T;
}

export function normalizedDailyWeight(raw: string, unit: 'KG' | 'JIN'): number {
  if (!raw.trim()) throw new Error('请填写今日空腹体重。');
  const value = Number(raw) / (unit === 'JIN' ? 2 : 1);
  if (!Number.isFinite(value) || value < 20 || value > 400) throw new Error('请确认体重和单位：20–400 公斤，或 40–800 斤。');
  return Math.round(value * 100) / 100;
}

export default function PublicDailyCheckIn({ token }: { token: string }) {
  const [context, setContext] = useState<DailyCheckInContext>();
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'KG' | 'JIN'>('KG');
  const [answers, setAnswers] = useState<DailyCheckInAnswers>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const previous = document.title;
    document.title = '每日健康填报 · MedTalent';
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setContext(undefined); setSaved(false); setNeedsReload(false);
    publicRequest<DailyCheckInContext>('context', { token }, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setContext(data); setWeight(data.record ? String(data.record.weightKg) : ''); setUnit('KG');
      setAnswers(data.record?.answers ?? {});
    }).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof PublicFormError ? reason.message : '暂时无法打开填报页面，请检查网络后重试。');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, reload]);

  function answer(key: keyof DailyCheckInAnswers, value: string, numeric = false) {
    setAnswers(current => {
      const next = { ...current };
      if (value === '') delete next[key];
      else Object.assign(next, { [key]: numeric ? Number(value) : value });
      return next;
    });
  }
  function changeUnit(next: 'KG' | 'JIN') {
    if (unit === next) return;
    if (weight.trim() && Number.isFinite(Number(weight))) setWeight(String(Math.round(Number(weight) * (next === 'JIN' ? 2 : 0.5) * 100) / 100));
    setUnit(next);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context || saving || needsReload) return;
    setError('');
    let weightKg: number;
    try { weightKg = normalizedDailyWeight(weight, unit); }
    catch (reason) { setError((reason as Error).message); return; }
    setSaving(true);
    try {
      const record = await publicRequest<DailyCheckInRecord>('submit', {
        token, date: context.date, version: context.record?.version ?? 0, weightKg, answers,
      });
      setContext({ ...context, record }); setSaved(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) {
      setError(reason instanceof PublicFormError ? reason.message : '网络连接中断，尚未确认保存结果。请重新载入今日填报，核对后再提交。');
      setNeedsReload(!(reason instanceof PublicFormError) || reason.status === 409 || reason.status === 404);
    } finally { setSaving(false); }
  }

  return <main className="daily-public">
    <div className="daily-public-shell">
      <header className="daily-public-brand"><img src={logoUrl} alt="" /><span>MedTalent <small>健康数字助手</small></span></header>
      <section className="daily-public-intro"><h1>每日健康填报</h1></section>
      {loading && <section className="daily-public-card daily-public-loading" role="status"><ReloadIcon className="spin" /> 正在打开您的填报页面…</section>}
      {!loading && !context && <section className="daily-public-card"><h2>暂时无法打开</h2><p role="alert">{error}</p><button type="button" onClick={() => setReload(x => x + 1)}>重新加载</button></section>}
      {!loading && context && (saved ? <section className="daily-public-card daily-public-success" role="status">
        <CheckCircledIcon /><h2>今日填报已保存</h2><p>{context.date} · {context.clientLabel}</p><strong>{Number(context.record?.weightKg).toFixed(2)} <small>公斤</small></strong>
        <button type="button" onClick={() => setSaved(false)}>修改今日填报</button>
      </section> : <form onSubmit={submit}>
        <section className="daily-public-card daily-weight-card">
          <div className="daily-public-date"><span>{context.clientLabel}</span><time dateTime={context.date}>{context.date}</time></div>
          {context.record && <p className="daily-submitted-note"><CheckCircledIcon /> 今日已填报</p>}
          <label htmlFor="daily-weight" className="daily-weight-label">今日空腹体重 <span>必填</span></label>
          <div className="daily-weight-input"><input id="daily-weight" name="weight" type="number" inputMode="decimal" required min={unit === 'KG' ? 20 : 40} max={unit === 'KG' ? 400 : 800} step="0.01" placeholder={unit === 'KG' ? '例如 65.5' : '例如 131'} value={weight} onChange={event => setWeight(event.target.value)} disabled={saving} /><select aria-label="体重单位" value={unit} onChange={event => changeUnit(event.target.value as 'KG' | 'JIN')} disabled={saving}><option value="KG">公斤 (kg)</option><option value="JIN">斤</option></select></div>
        </section>
        <details className="daily-public-card daily-optional" open>
          <summary><span>今日状态 <small>选填</small></span><ChevronDownIcon className="daily-expand-icon" aria-hidden="true" /></summary>
          <fieldset disabled={saving}>
            {dailyCheckInQuestions.filter(question => question.options?.length && question.key !== 'bowel_ease').map(question => <label className="daily-answer-field" key={question.key}>{question.label}<select value={answers[question.key] ?? ''} onChange={event => answer(question.key, event.target.value, true)}><option value="">暂不填写</option>{question.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
            <label className="daily-answer-field">今日排便次数<input type="number" inputMode="numeric" min="0" max="30" step="1" placeholder="未填写" value={answers.bowel_count ?? ''} onChange={event => answer('bowel_count', event.target.value, true)} /></label>
            <label className="daily-answer-field">排便是否顺畅<select value={answers.bowel_ease ?? ''} onChange={event => answer('bowel_ease', event.target.value)}><option value="">暂不填写</option>{bowelEaseOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="daily-answer-field">排便附加观察<textarea rows={3} maxLength={200} placeholder="选填" value={answers.bowel_extra ?? ''} onChange={event => answer('bowel_extra', event.target.value)} /></label>
          </fieldset>
        </details>
        {error && <div className="daily-public-error" role="alert">{error}{needsReload && <button type="button" onClick={() => setReload(x => x + 1)}>重新载入今日填报</button>}</div>}
        <button className="daily-public-submit" type="submit" disabled={saving || needsReload}>{saving ? '正在保存…' : context.record ? '保存今日修改' : '提交今日填报'}</button>
      </form>)}
    </div>
  </main>;
}
