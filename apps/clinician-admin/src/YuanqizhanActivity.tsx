import React, { useEffect, useRef, useState } from 'react';
import { CalendarIcon, CheckCircledIcon, Cross2Icon, ExclamationTriangleIcon, MagnifyingGlassIcon, PlusIcon, ReloadIcon } from '@radix-ui/react-icons';
import { activityApi, activityManagerAllowed, candidateSelectable, patientIdBatches, updatePatientSelection } from './activity-api';
import type { Activity, ActivityMember, ActivityPage, Candidate, PatientSelection } from './activity-api';
import type { Practitioner } from './types';
import './yuanqizhan-activity.css';

const emptyPage = <T,>(pageSize: number): ActivityPage<T> => ({ items: [], total: 0, page: 1, pageSize, hasMore: false });
const errorText = (error: unknown) => error instanceof Error ? error.message : '请求失败，请稍后重试';
const dateText = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
type ConfirmAction = { kind: 'add' } | { kind: 'end'; activity: Activity } | { kind: 'remove'; member: ActivityMember };

function useModalFocus(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = ref.current;
    if (!element) return;
    const fields = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'));
    (fields()[0] ?? element).focus();
    function keepFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const values = fields();
      if (!values.length) { event.preventDefault(); element?.focus(); return; }
      const first = values[0], last = values[values.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    element.addEventListener('keydown', keepFocus);
    return () => { element.removeEventListener('keydown', keepFocus); if (previous?.isConnected) previous.focus(); };
  }, [ref]);
}

function Pagination({ page, total, pageSize, busy, onPage }: { page: number; total: number; pageSize: number; busy: boolean; onPage: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return <div className="yq-pagination"><span>共 {total} 人 / 项 · 第 {page} / {pageCount} 页</span><div><button type="button" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>上一页</button><button type="button" disabled={busy || page >= pageCount} onClick={() => onPage(page + 1)}>下一页</button></div></div>;
}

function ActivityForm({ initial, onClose, onSaved }: { initial?: Activity; onClose: () => void; onSaved: (activity: Activity) => void }) {
  const firstInput = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  useModalFocus(dialogRef);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { firstInput.current?.focus(); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    if (!title) { setError('请输入活动名称'); firstInput.current?.focus(); return; }
    setBusy(true); setError('');
    try {
      const input = { title, description: String(form.get('description') ?? '').trim() };
      const result = initial ? await activityApi.update(initial.id, { ...input, expectedVersion: initial.version }) : await activityApi.create({ ...input, durationDays: 15 });
      onSaved(result);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop yq-modal-backdrop" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose(); }}><form ref={dialogRef} tabIndex={-1} className="modal-card yq-config-modal" role="dialog" aria-modal="true" aria-labelledby="yq-config-title" onSubmit={submit}>
    <div className="modal-title"><div><p className="eyebrow">元气盏活动</p><h2 id="yq-config-title">{initial ? '编辑活动配置' : '创建活动'}</h2></div><button type="button" className="close-button" disabled={busy} onClick={onClose} aria-label="关闭活动配置"><Cross2Icon /></button></div>
    {error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}
    <div className="form-grid"><label className="full">活动名称<input ref={firstInput} name="title" required maxLength={120} defaultValue={initial?.title ?? '元气盏'} placeholder="例如：元气盏 15 日活动" /></label><label className="full">活动说明<textarea name="description" maxLength={2000} defaultValue={initial?.description ?? ''} placeholder="可填写本期活动说明，患者会看到此说明" /></label></div>
    <div className="yq-rule-note"><CalendarIcon /><div><b>每人从加入当天开始，共 15 天</b><p>采用北京时间自然日。第 1、8、15 天填写阶段表，其余天填写日常表。仅支持当天填写和修改。</p></div></div>
    <p className="yq-muted">创建后再从已有患者中配置参与人员。重加患者保留其原始加入日和历史记录。</p>
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy}>{busy ? '保存中…' : initial ? '保存配置' : '创建活动'}</button></div>
  </form></div>;
}

function Confirmation({ action, count, busy, error, onClose, onConfirm }: { action: ConfirmAction; count: number; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocus(dialogRef);
  const title = action.kind === 'add' ? `确认加入 ${count} 位患者` : action.kind === 'end' ? '结束本活动' : `移除 ${action.member.patient.displayName}`;
  return <div className="modal-backdrop yq-modal-backdrop" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) onClose(); }}><section ref={dialogRef} tabIndex={-1} className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="yq-confirm-title">
    <div className="modal-title"><h2 id="yq-confirm-title">{title}</h2><button type="button" className="close-button" disabled={busy} onClick={onClose} aria-label="关闭确认"><Cross2Icon /></button></div>
    {action.kind === 'add' ? <><p className="modal-intro">确认后，所选患者会看到本活动入口。首次加入当天为 Day1；重新加入仍沿用原始加入日，历史记录保留，不会自动开始新一期。</p><p className="yq-muted">这项操作仅配置活动名单，不创建档案或修改服务关系，也不授予工作人员读取健康内容或照片的权限。</p></> : <><p className="modal-intro">{action.kind === 'end' ? '结束后所有参与患者均停止新填写和修改；结束操作不可撤回。' : '移除后该患者停止新填写和修改。日后重新加入仍沿用原始加入日。'}</p><p className="yq-retention">患者仍可只读查看本人历史记录，已保存的历史记录及原图长期保留，不会因本操作删除。</p></>}
    {error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}
    <div className="modal-actions"><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="button" className={action.kind === 'add' ? 'primary' : 'yq-danger'} disabled={busy} onClick={onConfirm}>{busy ? '处理中…' : action.kind === 'add' ? '确认加入' : action.kind === 'end' ? '确认结束' : '确认移除'}</button></div>
  </section></div>;
}

export default function YuanqizhanActivity({ user }: { user: Practitioner }) {
  const allowed = activityManagerAllowed(user.role);
  const [activities, setActivities] = useState(emptyPage<Activity>(10));
  const [activityPage, setActivityPage] = useState(1);
  const [active, setActive] = useState<Activity>();
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState('');
  const [members, setMembers] = useState(emptyPage<ActivityMember>(20));
  const [memberPage, setMemberPage] = useState(1);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState(emptyPage<Candidate>(20));
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [candidateError, setCandidateError] = useState('');
  const [selection, setSelection] = useState<PatientSelection>({});
  const [form, setForm] = useState<{ initial?: Activity }>();
  const [confirmation, setConfirmation] = useState<ConfirmAction>();
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const selectedCount = Object.keys(selection).length;

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    setListBusy(true); setListError('');
    activityApi.list({ page: activityPage, pageSize: 10 }).then((result) => {
      if (!current) return;
      setActivities(result);
      setActive((value) => value ? result.items.find((item) => item.id === value.id) ?? value : result.items[0]);
    }).catch((error) => { if (current) setListError(errorText(error)); }).finally(() => { if (current) setListBusy(false); });
    return () => { current = false; };
  }, [allowed, activityPage, revision]);

  useEffect(() => {
    if (!allowed || !active?.id) return;
    let current = true;
    setMemberBusy(true); setMemberError('');
    activityApi.members(active.id, { page: memberPage, pageSize: 20, search: memberQuery }).then((result) => {
      if (current) { setMembers(result); if (!result.items.length && memberPage > 1 && result.total > 0) setMemberPage(Math.ceil(result.total / 20)); }
    }).catch((error) => { if (current) setMemberError(errorText(error)); }).finally(() => { if (current) setMemberBusy(false); });
    return () => { current = false; };
  }, [allowed, active?.id, memberPage, memberQuery, revision]);

  useEffect(() => {
    if (!allowed || !active?.id || !pickerOpen) return;
    let current = true;
    setCandidateBusy(true); setCandidateError('');
    activityApi.candidates(active.id, { page: candidatePage, pageSize: 20, search: candidateQuery }).then((result) => {
      if (!current) return;
      setCandidates(result);
      setSelection((value) => updatePatientSelection(value, result.items.filter((item) => !candidateSelectable(item)), false));
    }).catch((error) => { if (current) setCandidateError(errorText(error)); }).finally(() => { if (current) setCandidateBusy(false); });
    return () => { current = false; };
  }, [allowed, active?.id, pickerOpen, candidatePage, candidateQuery, revision]);

  function selectActivity(activity: Activity) {
    setActive(activity); setMemberPage(1); setMemberQuery(''); setMemberSearch('');
    setMembers(emptyPage<ActivityMember>(20)); setPickerOpen(false); setSelection({});
    setCandidatePage(1); setCandidateQuery(''); setCandidateSearch(''); setNotice('');
  }
  function openPicker() { setPickerOpen(true); setCandidatePage(1); setCandidateQuery(''); setCandidateSearch(''); setSelection({}); setCandidates(emptyPage<Candidate>(20)); }
  function requestConfirmation(action: ConfirmAction) { setMutationError(''); setConfirmation(action); }
  async function confirmMutation() {
    if (!confirmation || !active) return;
    setMutationBusy(true); setMutationError(''); setNotice('');
    let added = 0;
    try {
      if (confirmation.kind === 'add') {
        for (const batch of patientIdBatches(Object.keys(selection))) {
          await activityApi.addMembers(active.id, batch);
          added += batch.length;
          setSelection((value) => { const next = { ...value }; for (const id of batch) delete next[id]; return next; });
        }
        setPickerOpen(false); setNotice(`已配置 ${added} 位患者参与活动。重新加入者保留原始加入日。`);
      } else if (confirmation.kind === 'end') {
        const ended = await activityApi.update(active.id, { status: 'ENDED', expectedVersion: confirmation.activity.version });
        setActive(ended); setPickerOpen(false); setSelection({}); setNotice('活动已结束。患者本人历史记录与原图继续保留。');
      } else {
        await activityApi.removeMember(active.id, confirmation.member.patientId);
        setActive((value) => value ? { ...value, memberCount: Math.max(0, value.memberCount - 1) } : value);
        setNotice('参与资格已移除，历史记录与原图继续保留。');
      }
      setConfirmation(undefined);
    } catch (error) {
      setMutationError(`${added ? `已成功加入 ${added} 人，其余选择已保留。` : ''}${errorText(error)} 请刷新核对名单后重试。`);
    } finally { setRevision((value) => value + 1); setMutationBusy(false); }
  }

  if (!allowed) return <section className="panel yq-no-access" role="alert">当前角色无权配置活动或参与名单。</section>;
  const eligiblePage = candidates.items.filter(candidateSelectable);
  const allPageSelected = eligiblePage.length > 0 && eligiblePage.every((item) => Boolean(selection[item.id]));
  return <div className="yq-workspace">
    <div className="yq-privacy-note"><ExclamationTriangleIcon /><p><b>活动名单与健康授权分开管理</b><span>本页只配置活动及参与名单。加入活动不创建档案、不修改服务关系；管理员不会因此获得健康答案或照片读取权限。</span></p></div>
    {notice && <div className="yq-success" role="status"><CheckCircledIcon />{notice}</div>}
    <section className="panel yq-activity-list"><div className="page-toolbar"><div><h2>元气盏活动</h2><p>每人从原始加入当天算 Day1，默认 15 天</p></div><div className="page-toolbar-actions"><button type="button" disabled={listBusy} onClick={() => setRevision((value) => value + 1)}><ReloadIcon />刷新</button><button type="button" className="primary" onClick={() => setForm({})}><PlusIcon />创建活动</button></div></div>
      {listError && <div className="form-error yq-inline-error" role="alert">{listError}<button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></div>}
      <div className="yq-activity-cards" aria-busy={listBusy}>{activities.items.map((item) => <button type="button" key={item.id} className={`yq-activity-card ${active?.id === item.id ? 'selected' : ''}`} onClick={() => selectActivity(item)} aria-pressed={active?.id === item.id}><span className={`yq-status ${item.status.toLowerCase()}`}>{item.status === 'ACTIVE' ? '进行中' : '已结束'}</span><b>{item.title}</b><small>15 天 · {item.memberCount} 位当前成员</small><small>创建于 {dateText(item.createdAt)}</small></button>)}</div>
      {!activities.items.length && !listBusy && !listError && <div className="empty-state"><CalendarIcon /><b>暂无活动</b><p>创建活动后，从已有患者中配置参与人员。</p></div>}
      {listBusy && <p className="yq-loading" role="status">正在加载活动…</p>}
      <Pagination page={activityPage} total={activities.total} pageSize={10} busy={listBusy} onPage={setActivityPage} />
    </section>
    {active && <section className="panel yq-member-panel"><div className="page-toolbar"><div><h2>{active.title} <span className={`yq-status ${active.status.toLowerCase()}`}>{active.status === 'ACTIVE' ? '进行中' : '已结束'}</span></h2><p>北京时间 · 15 天 / 人 · 第 1、8、15 天为阶段表</p></div><div className="page-toolbar-actions"><button type="button" onClick={() => setForm({ initial: active })}>编辑配置</button><button type="button" disabled={active.status !== 'ACTIVE'} onClick={() => requestConfirmation({ kind: 'end', activity: active })}>结束活动</button></div></div>
      {active.description && <p className="yq-description">{active.description}</p>}
      {active.status === 'ENDED' && <p className="yq-retention yq-ended-note">本活动已结束，不能新增参与或继续填写。患者本人可只读查看历史记录，原图长期保留。</p>}
      <div className="yq-member-toolbar"><form className="yq-search" onSubmit={(event) => { event.preventDefault(); setMemberPage(1); setMemberQuery(memberSearch.trim()); }}><label><MagnifyingGlassIcon /><input aria-label="搜索活动成员" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="按成员姓名或患者 ID 搜索" /></label><button type="submit">查询</button></form><button type="button" className="primary" disabled={active.status !== 'ACTIVE' || pickerOpen} onClick={openPicker}><PlusIcon />配置参与人员</button></div>
      {memberError && <div className="form-error yq-inline-error" role="alert">{memberError}<button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></div>}
      <div className="yq-table-scroll"><table className="yq-table" aria-label="活动参与名单" aria-busy={memberBusy}><thead><tr><th>患者姓名</th><th>患者 ID</th><th>原始加入日（Day1）</th><th>状态</th><th>操作</th></tr></thead><tbody>{members.items.map((member) => <tr key={member.id}><td><b>{member.patient.displayName}</b></td><td className="yq-id">{member.patientId}</td><td>{dateText(member.startDate)}</td><td><span className={`yq-status ${member.status.toLowerCase()}`}>{member.status === 'ACTIVE' ? '参与中' : '已移除'}</span>{member.patient.status !== 'ACTIVE' && <small className="yq-muted">{member.patient.status === 'DELETED' ? '账号已删除' : '账号已停用'}</small>}</td><td><button type="button" disabled={memberBusy || active.status !== 'ACTIVE' || member.status !== 'ACTIVE'} onClick={() => requestConfirmation({ kind: 'remove', member })}>移除</button></td></tr>)}</tbody></table></div>
      {!members.items.length && !memberBusy && !memberError && <div className="yq-empty">{memberQuery ? '没有匹配的活动成员' : '暂无参与人员，请从已有患者中配置。'}</div>}
      {memberBusy && <p className="yq-loading" role="status">正在加载参与名单…</p>}
      <Pagination page={memberPage} total={members.total} pageSize={20} busy={memberBusy} onPage={setMemberPage} />
    </section>}
    {active && pickerOpen && <section className="panel yq-candidate-panel" aria-label="选择已有患者"><div className="page-toolbar"><div><h2>选择已有患者</h2><p>包含未建立服务档案的患者；仅加入活动，不改变服务关系</p></div><button type="button" disabled={mutationBusy} onClick={() => { setPickerOpen(false); setSelection({}); }}><Cross2Icon />关闭选择</button></div>
      <form className="yq-search yq-candidate-search" onSubmit={(event) => { event.preventDefault(); setCandidatePage(1); setCandidateQuery(candidateSearch.trim()); }}><label><MagnifyingGlassIcon /><input aria-label="搜索候选患者" value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="按患者姓名或 ID 搜索" /></label><button type="submit">查询</button></form>
      <div className="yq-selection-bar"><div><b>已选 {selectedCount} 人</b><span>翻页或搜索不会清空已选人员</span></div><div><button type="button" disabled={!selectedCount || mutationBusy} onClick={() => setSelection({})}>清空选择</button><button type="button" className="primary" disabled={!selectedCount || candidateBusy || mutationBusy || active.status !== 'ACTIVE'} onClick={() => requestConfirmation({ kind: 'add' })}>确认加入（{selectedCount}）</button></div></div>
      {selectedCount > 0 && <details className="yq-selected-details"><summary>查看已选人员</summary><div>{Object.entries(selection).map(([id, name]) => <span key={id}><b>{name}</b><small className="yq-id">{id}</small><button type="button" aria-label={`取消选择 ${name} ${id}`} onClick={() => setSelection((value) => { const next = { ...value }; delete next[id]; return next; })}><Cross2Icon /></button></span>)}</div></details>}
      {candidateError && <div className="form-error yq-inline-error" role="alert">{candidateError}<button type="button" onClick={() => setRevision((value) => value + 1)}>重试</button></div>}
      <div className="yq-table-scroll"><table className="yq-table" aria-label="已有患者候选名单" aria-busy={candidateBusy}><thead><tr><th><label className="yq-checkbox"><input type="checkbox" aria-label="选择本页可加入患者" checked={allPageSelected} disabled={!eligiblePage.length || candidateBusy} onChange={(event) => setSelection((value) => updatePatientSelection(value, eligiblePage, event.target.checked))} />本页选择</label></th><th>患者姓名</th><th>患者 ID</th><th>状态</th></tr></thead><tbody>{candidates.items.map((candidate) => <tr key={candidate.id}><td><input type="checkbox" aria-label={`选择 ${candidate.displayName} ${candidate.id}`} checked={Boolean(selection[candidate.id])} disabled={!candidateSelectable(candidate) || candidateBusy} onChange={(event) => setSelection((value) => updatePatientSelection(value, [candidate], event.target.checked))} /></td><td><b>{candidate.displayName}</b></td><td className="yq-id">{candidate.id}</td><td>{candidate.status !== 'ACTIVE' ? <span className="yq-status removed">{candidate.status === 'DELETED' ? '账号已删除' : '账号已停用'}</span> : candidate.membership?.status === 'ACTIVE' ? <span className="yq-status active">已参与</span> : candidate.membership?.status === 'REMOVED' ? <><span className="yq-status removed">可重新加入</span><small className="yq-muted">原始 Day1：{dateText(candidate.membership.startDate)}</small></> : <span className="yq-muted">可加入</span>}</td></tr>)}</tbody></table></div>
      {!candidates.items.length && !candidateBusy && !candidateError && <div className="yq-empty">没有匹配的已有患者</div>}
      {candidateBusy && <p className="yq-loading" role="status">正在加载候选患者…</p>}
      <Pagination page={candidatePage} total={candidates.total} pageSize={20} busy={candidateBusy} onPage={setCandidatePage} />
    </section>}
    {form && <ActivityForm initial={form.initial} onClose={() => setForm(undefined)} onSaved={(activity) => { setForm(undefined); selectActivity(activity); setActivityPage(1); setRevision((value) => value + 1); setNotice('活动配置已保存。'); }} />}
    {confirmation && <Confirmation action={confirmation} count={selectedCount} busy={mutationBusy} error={mutationError} onClose={() => { setConfirmation(undefined); setMutationError(''); }} onConfirm={() => void confirmMutation()} />}
  </div>;
}

