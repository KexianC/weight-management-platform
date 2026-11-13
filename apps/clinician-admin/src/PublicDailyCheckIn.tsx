import React, { useEffect, useRef, useState } from 'react';
import { CheckCircledIcon, ChevronDownIcon, ReloadIcon } from '@radix-ui/react-icons';
import logoUrl from './assets/medtalent-logo.png';
import { bowelEaseOptions, dailyCheckInQuestions, dailyMealCount, dailyMeals, dailySleepLabel, dailySleepMinutes, validateDailyPhoto } from './daily-check-in-api';
import type { DailyCheckInAnswers, DailyCheckInContext, DailyCheckInPhoto, DailyCheckInRecord, DailyMeal } from './daily-check-in-api';
import './public-daily-check-in.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
class PublicFormError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function publicResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (Array.isArray(data?.message) ? data.message.join('；') : data?.message)
      || (response.status === 404 ? '此填报链接已停用或无效，请联系您的服务人员获取新链接。' : undefined);
    throw new PublicFormError(typeof message === 'string' ? message : '操作失败，请稍后重试。', response.status);
  }
  return data as T;
}
async function publicRequest<T>(action: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return publicResponse<T>(await fetch(`${API_BASE}/public/daily-check-in/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error', signal,
  }));
}
async function uploadPhoto(token: string, date: string, meal: DailyMeal, file: File, signal: AbortSignal): Promise<DailyCheckInPhoto> {
  const body = new FormData();
  body.set('file', file); body.set('date', date); body.set('meal', meal);
  const photo = await publicResponse<DailyCheckInPhoto>(await fetch(`${API_BASE}/public/daily-check-in/photos`, {
    method: 'POST', headers: { 'X-Daily-Check-In-Token': token }, body, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error', signal,
  }));
  if (!photo?.id || !['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType)) throw new Error('照片上传结果异常，请重试');
  return photo;
}
export function normalizedDailyWeight(raw: string, unit: 'KG' | 'JIN'): number {
  if (!raw.trim()) throw new Error('请填写今日空腹体重。');
  const value = Number(raw) / (unit === 'JIN' ? 2 : 1);
  if (!Number.isFinite(value) || value < 20 || value > 400) throw new Error('请确认体重和单位：20–400 公斤，或 40–800 斤。');
  return Math.round(value * 100) / 100;
}
type PhotoDraft = {
  key: string; meal: DailyMeal; status: 'uploading' | 'ready' | 'failed'; id?: string;
  preview: string; ownedPreview?: boolean; file?: File; error?: string; previewError?: boolean; refreshing?: boolean; controller?: AbortController;
};
export function serializeDailyAnswers(answers: DailyCheckInAnswers, photos: Pick<PhotoDraft, 'meal' | 'status' | 'id'>[]): DailyCheckInAnswers {
  const result = Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== undefined && value !== '')) as DailyCheckInAnswers;
  for (const meal of dailyMeals) {
    const ids = photos.filter(photo => photo.meal === meal.key && photo.status === 'ready' && photo.id).map(photo => photo.id!);
    if (ids.length > 3) throw new Error('每餐最多添加 3 张照片');
    if (ids.length) result[meal.photoKey] = ids;
    else delete result[meal.photoKey];
  }
  return result;
}
type FormScope = { epoch: number; token: string; date: string };

export default function PublicDailyCheckIn({ token }: { token: string }) {
  // Remount before paint on token changes; requests also check the captured date and epoch.
  return <DailyCheckInForm key={token} token={token} />;
}
function DailyCheckInForm({ token }: { token: string }) {
  const [context, setContext] = useState<DailyCheckInContext>();
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'KG' | 'JIN'>('KG');
  const [answers, setAnswers] = useState<DailyCheckInAnswers>({});
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [mealErrors, setMealErrors] = useState<Partial<Record<DailyMeal, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  const sequence = useRef(0);
  const savingNow = useRef(false);
  const photoState = useRef<PhotoDraft[]>([]);
  const scope = useRef<FormScope | undefined>(undefined);
  const requests = useRef(new Set<AbortController>());
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  function updatePhotos(updater: (current: PhotoDraft[]) => PhotoDraft[]) {
    photoState.current = updater(photoState.current); setPhotos(photoState.current);
  }
  function current(captured: FormScope) {
    return scope.current?.epoch === captured.epoch && scope.current.token === captured.token && scope.current.date === captured.date;
  }
  function clearRequests() {
    requests.current.forEach(controller => controller.abort()); requests.current.clear();
    uploadQueue.current = Promise.resolve();
    photoState.current.forEach(photo => { if (photo.ownedPreview) URL.revokeObjectURL(photo.preview); });
    photoState.current = [];
  }
  useEffect(() => {
    const previous = document.title; document.title = '每日健康填报 · MedTalent';
    return () => { document.title = previous; };
  }, []);
  useEffect(() => {
    const generation = ++epoch.current;
    scope.current = undefined; clearRequests(); setPhotos([]); setMealErrors({});
    savingNow.current = false; setSaving(false); setLoading(true); setError(''); setContext(undefined); setSaved(false); setNeedsReload(false);
    setWeight(''); setAnswers({}); setUnit('KG');
    const controller = new AbortController(); requests.current.add(controller);
    publicRequest<DailyCheckInContext>('context', { token }, controller.signal).then(data => {
      if (controller.signal.aborted || generation !== epoch.current) return;
      scope.current = { epoch: generation, token, date: data.date };
      setContext(data); setWeight(data.record ? String(data.record.weightKg) : '');
      setAnswers(data.record?.answers ?? {});
      const metadata = data.record?.photos ?? [];
      updatePhotos(() => dailyMeals.flatMap(meal => (data.record?.answers[meal.photoKey] ?? []).map(id => {
        const photo = metadata.find(item => item.id === id);
        return { key: `saved-${meal.key}-${id}`, meal: meal.key, status: 'ready' as const, id, preview: photo?.url ?? '', previewError: !photo?.url };
      })));
    }).catch(reason => {
      if (!controller.signal.aborted && generation === epoch.current) setError(reason instanceof PublicFormError ? reason.message : '暂时无法打开填报页面，请检查网络后重试。');
    }).finally(() => { requests.current.delete(controller); if (!controller.signal.aborted && generation === epoch.current) setLoading(false); });
    return () => { ++epoch.current; scope.current = undefined; clearRequests(); };
  }, [token, reload]);

  function answer(key: keyof DailyCheckInAnswers, value: string, numeric = false) {
    setAnswers(previous => {
      const next = { ...previous };
      if (value === '') delete next[key]; else Object.assign(next, { [key]: numeric ? Number(value) : value });
      return next;
    });
  }
  function changeUnit(next: 'KG' | 'JIN') {
    if (unit === next) return;
    if (weight.trim() && Number.isFinite(Number(weight))) setWeight(String(Math.round(Number(weight) * (next === 'JIN' ? 2 : 0.5) * 100) / 100));
    setUnit(next);
  }
  async function startUpload(photo: PhotoDraft) {
    const captured = scope.current;
    if (!captured || !photo.file || savingNow.current || needsReload) return;
    const existing = photoState.current.find(item => item.key === photo.key);
    if (!existing || (existing.controller && !existing.controller.signal.aborted)) return;
    const controller = new AbortController(); requests.current.add(controller);
    updatePhotos(items => items.map(item => item.key === photo.key ? { ...item, status: 'uploading', error: undefined, controller } : item));
    const preceding = uploadQueue.current;
    let release!: () => void;
    uploadQueue.current = new Promise<void>(resolve => { release = resolve; });
    try {
      await preceding;
      if (controller.signal.aborted || !current(captured) || !photoState.current.some(item => item.key === photo.key)) return;
      validateDailyPhoto(photo.file);
      const uploaded = await uploadPhoto(captured.token, captured.date, photo.meal, photo.file, controller.signal);
      if (!controller.signal.aborted && current(captured)) updatePhotos(items => items.map(item => item.key === photo.key ? { ...item, status: 'ready', id: uploaded.id, controller: undefined } : item));
    } catch (reason) {
      if (!controller.signal.aborted && current(captured)) {
        updatePhotos(items => items.map(item => item.key === photo.key ? { ...item, status: 'failed', controller: undefined, error: reason instanceof Error ? reason.message : '上传失败，请重试' } : item));
        if (reason instanceof PublicFormError && [404, 409].includes(reason.status)) { setNeedsReload(true); setError(reason.message); }
      }
    } finally { release(); requests.current.delete(controller); }
  }
  function addPhotos(meal: DailyMeal, files: FileList | null) {
    if (!files || savingNow.current || needsReload || !scope.current) return;
    let issue = '';
    for (const file of Array.from(files)) {
      if (photoState.current.filter(photo => photo.meal === meal).length >= 3) { issue = '每餐最多添加 3 张照片'; break; }
      try { validateDailyPhoto(file); } catch (reason) { issue = (reason as Error).message; continue; }
      const photo: PhotoDraft = { key: `upload-${++sequence.current}`, meal, file, preview: URL.createObjectURL(file), ownedPreview: true, status: 'uploading' };
      updatePhotos(items => [...items, photo]); void startUpload(photo);
    }
    setMealErrors(previous => ({ ...previous, [meal]: issue }));
  }
  function removePhoto(photo: PhotoDraft) {
    if (savingNow.current) return;
    photo.controller?.abort();
    if (photo.ownedPreview) URL.revokeObjectURL(photo.preview);
    updatePhotos(items => items.filter(item => item.key !== photo.key));
    setMealErrors(previous => ({ ...previous, [photo.meal]: '' }));
  }
  async function refreshPhoto(photo: PhotoDraft) {
    const captured = scope.current;
    if (!captured || !photo.id || photoState.current.find(item => item.key === photo.key)?.refreshing || savingNow.current || needsReload) return;
    const controller = new AbortController(); requests.current.add(controller);
    updatePhotos(items => items.map(item => item.key === photo.key ? { ...item, refreshing: true, error: undefined } : item));
    try {
      const result = await publicRequest<{ photos: DailyCheckInPhoto[] }>('photos/refresh', { token: captured.token, date: captured.date, photoIds: [photo.id] }, controller.signal);
      const refreshed = result.photos.find(item => item.id === photo.id);
      if (!refreshed?.url) throw new Error('照片预览暂不可用');
      if (!controller.signal.aborted && current(captured)) updatePhotos(items => items.map(item => {
        if (item.key !== photo.key) return item;
        if (item.ownedPreview) URL.revokeObjectURL(item.preview);
        return { ...item, preview: refreshed.url, ownedPreview: false, previewError: false };
      }));
    } catch (reason) {
      if (!controller.signal.aborted && current(captured)) {
        updatePhotos(items => items.map(item => item.key === photo.key ? { ...item, error: reason instanceof Error ? reason.message : '照片预览暂不可用' } : item));
        if (reason instanceof PublicFormError && reason.status === 409) { setNeedsReload(true); setError(reason.message); }
      }
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted && current(captured)) updatePhotos(items => items.map(item => item.key === photo.key ? { ...item, refreshing: false } : item));
    }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const captured = scope.current;
    if (!captured || !context || savingNow.current || needsReload || photoState.current.some(photo => photo.status === 'uploading')) return;
    setError('');
    let weightKg: number; let submittedAnswers: DailyCheckInAnswers;
    try { weightKg = normalizedDailyWeight(weight, unit); submittedAnswers = serializeDailyAnswers(answers, photoState.current); }
    catch (reason) { setError((reason as Error).message); return; }
    savingNow.current = true; setSaving(true);
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const record = await publicRequest<DailyCheckInRecord>('submit', { token: captured.token, date: captured.date, version: context.record?.version ?? 0, weightKg, answers: submittedAnswers }, controller.signal);
      if (!controller.signal.aborted && current(captured)) {
        setContext({ ...context, record }); setAnswers(record.answers); setSaved(true); window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (reason) {
      if (!controller.signal.aborted && current(captured)) {
        setError(reason instanceof PublicFormError ? reason.message : '网络连接中断，尚未确认保存结果。请重新载入今日填报，核对后再提交。');
        setNeedsReload(!(reason instanceof PublicFormError) || reason.status === 409 || reason.status === 404);
      }
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted && current(captured)) { savingNow.current = false; setSaving(false); }
    }
  }
  const uploading = photos.some(photo => photo.status === 'uploading');
  const sleepDuration = dailySleepMinutes(answers.sleep_start, answers.sleep_end);
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
            <div className="daily-metric-grid">
              <label className="daily-answer-field">腰围 (cm)<input type="number" inputMode="decimal" min="30" max="300" step="0.1" placeholder="未填写" value={answers.waist_cm ?? ''} onChange={event => answer('waist_cm', event.target.value, true)} /></label>
              <label className="daily-answer-field">运动 (分钟)<input type="number" inputMode="numeric" min="0" max="1440" step="1" placeholder="未填写" value={answers.exercise_minutes ?? ''} onChange={event => answer('exercise_minutes', event.target.value, true)} /></label>
              <label className="daily-answer-field">饮水 (ml)<input type="number" inputMode="numeric" min="0" max="20000" step="1" placeholder="未填写" value={answers.water_ml ?? ''} onChange={event => answer('water_ml', event.target.value, true)} /></label>
            </div>
            <div className="daily-sleep-grid">
              <label className="daily-answer-field">入睡时间<input type="time" value={answers.sleep_start ?? ''} onChange={event => answer('sleep_start', event.target.value)} /></label>
              <label className="daily-answer-field">起床时间<input type="time" value={answers.sleep_end ?? ''} onChange={event => answer('sleep_end', event.target.value)} /></label>
            </div>
            {sleepDuration !== null && <p className="daily-sleep-duration" role="status">睡眠时长 {dailySleepLabel(answers.sleep_start, answers.sleep_end)}</p>}
            {dailyCheckInQuestions.filter(question => question.options?.length && question.key !== 'bowel_ease').map(question => <label className="daily-answer-field" key={question.key}>{question.label}<select value={answers[question.key] ?? ''} onChange={event => answer(question.key, event.target.value, true)}><option value="">暂不填写</option>{question.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
            <label className="daily-answer-field">今日排便次数<input type="number" inputMode="numeric" min="0" max="30" step="1" placeholder="未填写" value={answers.bowel_count ?? ''} onChange={event => answer('bowel_count', event.target.value, true)} /></label>
            <label className="daily-answer-field">排便是否顺畅<select value={answers.bowel_ease ?? ''} onChange={event => answer('bowel_ease', event.target.value)}><option value="">暂不填写</option>{bowelEaseOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="daily-answer-field">排便附加观察<textarea rows={3} maxLength={200} placeholder="选填" value={answers.bowel_extra ?? ''} onChange={event => answer('bowel_extra', event.target.value)} /></label>
          </fieldset>
        </details>
        <section className="daily-public-card daily-meals"><h2>三餐记录 <small>选填 · 已记录 {dailyMealCount(serializeDailyAnswers(answers, photos))}/3 餐</small></h2>
          {dailyMeals.map(meal => <fieldset className="daily-meal" key={meal.key} disabled={saving}>
            <label className="daily-answer-field">{meal.label}<textarea aria-label={meal.label} rows={2} maxLength={500} placeholder="吃了什么" value={answers[meal.textKey] ?? ''} onChange={event => answer(meal.textKey, event.target.value)} /></label>
            <div className="daily-photo-grid">{photos.filter(photo => photo.meal === meal.key).map((photo, index) => <div className="daily-photo" key={photo.key}>
              {photo.preview && !photo.previewError ? <a href={photo.preview} target="_blank" rel="noreferrer"><img src={photo.preview} alt={`${meal.label}照片${index + 1}`} crossOrigin="anonymous" referrerPolicy="no-referrer" onError={() => updatePhotos(items => items.map(item => item.key === photo.key ? { ...item, previewError: true } : item))} /></a> : <div className="daily-photo-missing">照片预览暂不可用</div>}
              <button className="daily-photo-remove" type="button" aria-label={`删除${meal.label}照片${index + 1}`} onClick={() => removePhoto(photo)}>×</button>
              {photo.status === 'uploading' && <p role="status">上传中…</p>}
              {photo.status === 'failed' && <div className="daily-photo-error"><p role="alert">{photo.error || '上传失败'}</p><button type="button" disabled={needsReload} onClick={() => void startUpload(photo)}>重试上传</button></div>}
              {photo.status === 'ready' && photo.previewError && <div className="daily-photo-error">{photo.error && <p role="alert">{photo.error}</p>}<button type="button" disabled={photo.refreshing || needsReload} onClick={() => void refreshPhoto(photo)}>{photo.refreshing ? '加载中…' : '重试预览'}</button></div>}
            </div>)}</div>
            <label className="daily-photo-add">添加{meal.label}照片 ({photos.filter(photo => photo.meal === meal.key).length}/3)<input aria-label={`添加${meal.label}照片`} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={saving || needsReload || photos.filter(photo => photo.meal === meal.key).length >= 3} onChange={event => { addPhotos(meal.key, event.currentTarget.files); event.currentTarget.value = ''; }} /></label>
            {mealErrors[meal.key] && <p className="daily-meal-error" role="alert">{mealErrors[meal.key]}</p>}
          </fieldset>)}
        </section>
        {error && <div className="daily-public-error" role="alert">{error}{needsReload && <button type="button" onClick={() => setReload(x => x + 1)}>重新载入今日填报</button>}</div>}
        <button className="daily-public-submit" type="submit" disabled={saving || needsReload || uploading}>{saving ? '正在保存…' : uploading ? '照片上传中…' : context.record ? '保存今日修改' : '提交今日填报'}</button>
      </form>)}
    </div>
  </main>;
}
