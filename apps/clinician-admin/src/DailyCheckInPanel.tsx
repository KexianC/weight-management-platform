import React, { useEffect, useRef, useState } from 'react';
import { dailyCheckInAnswerLabel, dailyCheckInApi, dailyCheckInQuestions, dailyCheckInShareUrl, dailyMealCount, dailyMeals, dailySleepLabel, type DailyCheckInPhoto, type DailyCheckInLink, type DailyCheckInRecord, type DailyCheckInRecordPage } from './daily-check-in-api';
import './daily-check-in-panel.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试';
const updatedTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export function DailyCheckInRecordView({ record }: { record: DailyCheckInRecord }) {
  const metric = (key: 'waist_cm' | 'exercise_minutes' | 'water_ml', suffix: string) => record.answers[key] === undefined ? '未填写' : `${record.answers[key]} ${suffix}`;
  return <article className="daily-staff-record">
    <header><div><h4>{record.date}</h4><small>更新于 {updatedTime(record.updatedAt)} · 北京时间</small></div><strong>{record.weightKg} <small>kg</small></strong></header>
    <details><summary>查看每日信息</summary><dl>
      <div><dt>腰围</dt><dd>{metric('waist_cm', 'cm')}</dd></div>
      <div><dt>运动</dt><dd>{metric('exercise_minutes', '分钟')}</dd></div>
      <div><dt>饮水</dt><dd>{metric('water_ml', 'ml')}</dd></div>
      <div><dt>睡眠时段</dt><dd>{record.answers.sleep_start || record.answers.sleep_end ? `${record.answers.sleep_start ?? '未填写'} → ${record.answers.sleep_end ?? '未填写'}` : '未填写'}</dd></div>
      <div><dt>睡眠时长</dt><dd>{dailySleepLabel(record.answers.sleep_start, record.answers.sleep_end)}</dd></div>
      {dailyCheckInQuestions.map(question => <div key={question.key}><dt>{question.label}</dt><dd>{record.redactedAnswerKeys?.includes(question.key) ? '当前权限不显示' : dailyCheckInAnswerLabel(question, record.answers[question.key])}</dd></div>)}
    </dl><p>三餐记录 · 已记录 {dailyMealCount(record.answers)}/3 餐</p><div className="daily-staff-meals">{dailyMeals.map(meal => <section key={meal.key}><h5>{meal.label}</h5><p>{record.answers[meal.textKey] || '未填写'}</p>
      <div className="daily-staff-photos">{(record.answers[meal.photoKey] ?? []).map((id, index) => {
        const photo = record.photos?.find(item => item.id === id);
        return photo ? <DailyRecordPhoto key={`${id}:${photo.url}:${record.updatedAt}`} photo={photo} label={`${meal.label}照片${index + 1}`} /> : <span key={id}>照片暂不可用</span>;
      })}</div>
    </section>)}</div></details>
  </article>;
}

function DailyRecordPhoto({ photo, label }: { photo: DailyCheckInPhoto; label: string }) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const objectUrl = useRef('');
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);
  async function load() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const blob = await dailyCheckInApi.photoBlob(photo);
      if (!alive.current) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('照片格式不可预览');
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob); setPreview(objectUrl.current);
    } catch {
      if (alive.current) setError('照片暂不可用，请重试或刷新记录。');
    } finally { if (alive.current) { pending.current = false; setBusy(false); } }
  }
  return <div className="daily-staff-photo">{preview ? <a href={preview} target="_blank" rel="noreferrer"><img src={preview} alt={label} /></a> : <button type="button" disabled={busy} onClick={() => void load()}>{busy ? '加载中…' : `查看${label}`}</button>}{error && <p role="alert">{error}</p>}</div>;
}

type PanelProps = { patientId: string; canManageLink: boolean };
export default function DailyCheckInPanel(props: PanelProps) {
  // A patient or permission change must discard pending responses and previously revealed links.
  return <DailyCheckInPanelContent key={props.patientId + ':' + props.canManageLink} {...props} />;
}

function DailyCheckInPanelContent({ patientId, canManageLink }: PanelProps) {
  const alive = useRef(true);
  const loadSequence = useRef(0);
  const linkSequence = useRef(0);
  const access = useRef({ view: false, manage: false });
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<DailyCheckInRecordPage>();
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [reload, setReload] = useState(0);
  const [link, setLink] = useState<DailyCheckInLink>();
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<'reset' | 'revoke' | null>(null);
  const shareInput = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const sequence = ++loadSequence.current;
    linkSequence.current++; access.current = { view: false, manage: false };
    setLink(undefined); setLinkBusy(false); setLinkError(''); setNotice(''); setConfirmation(null);
    setHistoryLoading(true); setHistoryError(''); setHistory(undefined);
    dailyCheckInApi.records(patientId, page).then(result => {
      if (alive.current && loadSequence.current === sequence) setHistory(result);
    }).catch(error => {
      if (alive.current && loadSequence.current === sequence) setHistoryError(errorText(error));
    }).finally(() => {
      if (alive.current && loadSequence.current === sequence) setHistoryLoading(false);
    });
    return () => { loadSequence.current++; };
  }, [patientId, page, reload]);

  const mayView = history?.canViewLink === true;
  const mayManage = mayView && canManageLink && history?.canManageLink === true;
  access.current = { view: mayView, manage: mayManage };
  async function linkAction(action: 'load' | 'reset' | 'revoke') {
    if (linkBusy || !(action === 'load' ? access.current.view : access.current.manage)) return;
    const sequence = ++linkSequence.current;
    const current = () => alive.current && sequence === linkSequence.current && (action === 'load' ? access.current.view : access.current.manage);
    setLinkBusy(true); setLinkError(''); setNotice(''); setConfirmation(null); setLink(undefined);
    try {
      if (action === 'revoke') {
        await dailyCheckInApi.revoke(patientId);
        if (current()) { setLink({ url: '', qrDataUrl: '', revoked: true }); setNotice('填报链接已停用，原链接和二维码不可再填报。'); }
      } else {
        const result = await (action === 'reset' ? dailyCheckInApi.reset(patientId) : dailyCheckInApi.link(patientId));
        if (!result.revoked && (!dailyCheckInShareUrl(result.url) || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.qrDataUrl))) throw new Error('专属链接或二维码暂不可用，请重试');
        if (current()) { setLink(result); if (action === 'reset') setNotice('已生成新链接，原链接和二维码已失效，请重新发到服务群。'); }
      }
    } catch (error) { if (current()) setLinkError(errorText(error)); }
    finally { if (current()) setLinkBusy(false); }
  }
  async function copy(withMessage: boolean) {
    if (!access.current.view || !link || link.revoked) return;
    const sequence = linkSequence.current;
    const current = () => alive.current && sequence === linkSequence.current && access.current.view;
    setNotice(''); setLinkError('');
    const content = withMessage ? `您的专属每日填报链接：\n${link.url}\n每天打开同一链接即可免登录填报。体重必填，其余选填；当天可修改。请仅在本人的服务群内使用。` : link.url;
    try {
      await navigator.clipboard.writeText(content);
      if (current()) setNotice(withMessage ? '群通知文案已复制，可粘贴到客户服务群。' : '专属链接已复制。');
    } catch {
      if (current()) { shareInput.current?.focus(); shareInput.current?.select(); setLinkError('自动复制未成功，请长按或选中上方链接手动复制。'); }
    }
  }
  return <section className="panel daily-staff-panel">
    <div className="daily-staff-heading"><div><h2>每日填报</h2><p>体重必填，其他信息选填。客户每天使用同一链接或二维码。</p></div><button type="button" disabled={historyLoading} onClick={() => setReload(value => value + 1)}>刷新记录</button></div>
    <DailyCheckInShareView mayView={mayView} mayManage={mayManage} link={link} linkBusy={linkBusy} linkError={linkError} notice={notice} confirmation={confirmation} shareInput={shareInput} onAction={linkAction} onCopy={copy} onConfirm={setConfirmation} />
    <div className="daily-staff-history"><h3>填报记录{history ? ` · ${history.total} 天` : ''}</h3>
      {historyLoading && <p role="status">正在加载填报记录…</p>}
      {historyError && <div className="form-error" role="alert">{historyError}<button type="button" onClick={() => setReload(value => value + 1)}>重试加载</button></div>}
      {history && !history.items.length && <p className="daily-staff-empty">暂无每日填报记录。</p>}
      {history?.items.map(record => <DailyCheckInRecordView key={record.date} record={record} />)}
      {(page > 1 || history?.hasMore) && <div className="daily-staff-pagination"><button type="button" disabled={page <= 1 || historyLoading} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页</span><button type="button" disabled={!history?.hasMore || historyLoading} onClick={() => setPage(value => value + 1)}>下一页</button></div>}
    </div>
  </section>;
}

type ShareViewProps = {
  mayView: boolean; mayManage: boolean; link?: DailyCheckInLink; linkBusy?: boolean;
  linkError?: string; notice?: string; confirmation?: 'reset' | 'revoke' | null;
  shareInput?: React.Ref<HTMLInputElement>;
  onAction: (action: 'load' | 'reset' | 'revoke') => void;
  onCopy: (withMessage: boolean) => void;
  onConfirm: (action: 'reset' | 'revoke' | null) => void;
};
export function DailyCheckInShareView({ mayView, mayManage, link, linkBusy, linkError, notice, confirmation, shareInput, onAction, onCopy, onConfirm }: ShareViewProps) {
  if (!mayView) return null;
  return <div className="daily-staff-sharing">
      <h3>客户专属填报入口</h3><p>发送到该客户的服务群，点开链接或扫码即可免登录填写当天信息。</p>
      {!link && <button type="button" className="primary" disabled={linkBusy} onClick={() => onAction('load')}>{linkBusy ? '正在处理…' : '查看专属链接与二维码'}</button>}
      {link?.revoked && <p className="daily-staff-disabled">{mayManage ? '填报链接已停用。如需继续使用，请生成新链接。' : '填报链接已停用，请联系负责的健管师或医生重新启用。'}</p>}
      {link && !link.revoked && <div className="daily-staff-share-grid"><div>
        <label className="daily-staff-link">专属填报链接<input ref={shareInput} readOnly value={link.url} onFocus={event => event.currentTarget.select()} aria-label="专属填报链接" /></label>
        <div className="daily-staff-actions"><button type="button" disabled={linkBusy} onClick={() => onCopy(false)}>复制链接</button><button type="button" disabled={linkBusy} onClick={() => onCopy(true)}>复制群通知文案</button></div>
        <p className="daily-staff-hint">此入口仅供该客户使用，请勿转发到公共群。链接停用或重置后，原二维码也会失效。</p>
      </div><figure><img src={link.qrDataUrl} alt="客户专属每日填报二维码" width="200" height="200" /><figcaption><a href={link.qrDataUrl} download="每日填报二维码.png">下载二维码</a></figcaption></figure></div>}
      {link && mayManage && <div className="daily-staff-actions daily-staff-manage"><button type="button" disabled={linkBusy} onClick={() => onConfirm('reset')}>{link.revoked ? '生成新链接' : '重置链接'}</button>{!link.revoked && <button type="button" disabled={linkBusy} onClick={() => onConfirm('revoke')}>停用链接</button>}</div>}
      {confirmation && mayManage && <div className="daily-staff-confirm" role="alert"><p>{confirmation === 'reset' ? '确认生成新链接？原链接和二维码将立即失效，历史填报记录保留。' : '确认停用此客户的填报链接？原链接和二维码将立即失效，历史填报记录保留。'}</p><div className="daily-staff-actions"><button type="button" className="primary" disabled={linkBusy} onClick={() => onAction(confirmation)}>{confirmation === 'reset' ? '确认生成新链接' : '确认停用'}</button><button type="button" onClick={() => onConfirm(null)}>取消</button></div></div>}
      {linkError && <p className="form-error" role="alert">{linkError}</p>}{notice && <p className="daily-staff-success" role="status">{notice}</p>}
    </div>;
}
