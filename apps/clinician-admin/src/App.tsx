import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon, BellIcon, CalendarIcon, ChatBubbleIcon, CheckCircledIcon,
  ClipboardIcon, Cross2Icon, DashboardIcon, ExitIcon, ExclamationTriangleIcon,
  MagnifyingGlassIcon, PaperPlaneIcon, PersonIcon, PlusIcon, ReaderIcon, ReloadIcon,
} from '@radix-ui/react-icons';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api, ApiError } from './api';
import ArchiveView from './ArchiveView';
import AdminConsole from './AdminConsole';
import ManagedCare from './ManagedCare';
import YuanqizhanActivity from './YuanqizhanActivity';
import { archiveCompletion } from './archive-schema';
import logoUrl from './assets/medtalent-logo.png';
import {
  deriveClinicalSummary, displayMetric, followUpStatusLabel, formatDateTime, riskLabel,
} from './model';
import type {
  AuthSession, CareSummary, ClinicalSummary, Conversation, CreateFollowUpInput, FollowUp,
  CreatePatientInput, CreatePatientResult, FollowUpStatus, HealthRecord, NotificationItem, Patient, PatientArchive, Practitioner,
  PublishCareSummaryInput,
} from './types';

type ViewName = 'yuanqizhan-activities' | 'managed-care' | 'dashboard' | 'patients' | 'patient-detail' | 'patient-archive' | 'follow-ups' | 'messages' | 'notifications';
type AppData = {
  patients: Patient[]; patientTotal: number; followUps: FollowUp[]; summary: ClinicalSummary;
  conversations: Conversation[]; notifications: NotificationItem[];
};
const emptyData: AppData = { patients: [], patientTotal: 0, followUps: [], summary: {}, conversations: [], notifications: [] };
const roleLabels: Record<Practitioner['role'], string> = { DOCTOR: '医生', NUTRITIONIST: '营养师', HEALTH_MANAGER: '健管师', EXERCISE_COACH: '运动老师', ADMIN: '管理员' };
const followUpTypes: Record<string, string> = {
  WEIGHT: '体重随访', DIET: '饮食随访', HEALTH: '健康问卷', EXERCISE: '运动随访',
  MEDICATION: '用药随访', GENERAL: '常规随访',
};

function readStoredUser(): Practitioner | null {
  try {
    const value = localStorage.getItem('weightcare_user');
    if (!value) return null;
    const user = JSON.parse(value) as Practitioner;
    return user?.id && user?.displayName && user?.role ? user : null;
  } catch { return null; }
}
function errorText(error: unknown): string { return error instanceof Error ? error.message : '请求失败，请稍后重试'; }
function dateTimeLocalValue(hoursAhead = 24): string {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
function compactPhone(phone?: string): string { return phone ? phone.replace(/^(\d{3})\d{4}(\d+)/, '$1****$2') : '未填写手机号'; }
function initials(name: string): string { return name.trim().slice(0, 1) || '患'; }
function dateOnly(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
}

function LoginScreen({ onSuccess, notice }: { onSuccess: (session: AuthSession) => void; notice?: string }) {
  const [mode, setMode] = useState<'admin' | 'clinical'>('clinical');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      const account = String(data.get('account') ?? '');
      const session = mode === 'admin'
        ? await api.adminLogin(account, String(data.get('password') ?? ''))
        : await api.login(account, String(data.get('password') ?? ''), String(data.get('role')) as 'DOCTOR' | 'NUTRITIONIST' | 'HEALTH_MANAGER' | 'EXERCISE_COACH');
      localStorage.setItem('weightcare_access_token', session.accessToken);
      localStorage.setItem('weightcare_user', JSON.stringify(session.user));
      if (session.refreshToken) localStorage.setItem('weightcare_refresh_token', session.refreshToken); else localStorage.removeItem('weightcare_refresh_token');
      onSuccess(session);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSubmitting(false); }
  }
  return <main className="login-page">
    <section className="login-story"><div className="login-brand"><span><img src={logoUrl} alt="MedTalent 健康数字助手" /></span><b>MedTalent 健康数字助手</b></div><div>
      <p className="eyebrow">临床体重管理平台</p><h1>让每一次随访，都有清晰可执行的健康管理安排。</h1>
      <p className="login-copy">医生与营养师可在同一工作台查看患者真实记录、安排随访并保持连续沟通。</p>
    </div><div className="login-points"><span><CheckCircledIcon /> 患者授权关系隔离</span><span><CheckCircledIcon /> 全流程操作留痕</span><span><CheckCircledIcon /> 数据来自独立后端</span></div></section>
    <section className="login-card-wrap"><form className="login-card" onSubmit={submit}><p className="eyebrow">欢迎回来</p><h2>{mode === 'admin' ? '登录系统管理后台' : '登录临床管理后台'}</h2><p>{mode === 'admin' ? '管理平台用户、账号状态与审计日志。' : '请使用健管师、营养师、医生或运动老师账号。'}</p>
      <div className="login-mode" role="tablist"><button type="button" className={mode === 'admin' ? 'active' : ''} onClick={() => { setMode('admin'); setError(''); }}>管理员</button><button type="button" className={mode === 'clinical' ? 'active' : ''} onClick={() => { setMode('clinical'); setError(''); }}>工作人员</button></div>
      {notice && <div className="form-warning" role="status"><ExclamationTriangleIcon />{notice}</div>}
      {error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}
      <label>{mode === 'admin' ? '管理员账号' : '手机号'}<input name="account" inputMode={mode === 'admin' ? 'text' : 'tel'} autoComplete="username" required defaultValue={mode === 'admin' ? 'admin' : ''} key={mode} placeholder={mode === 'admin' ? '请输入管理员账号' : '请输入手机号'} /></label>
      {mode === 'clinical' && <label>工作岗位<select name="role" required defaultValue="NUTRITIONIST"><option value="NUTRITIONIST">营养师</option><option value="HEALTH_MANAGER">健管师</option><option value="DOCTOR">医生</option><option value="EXERCISE_COACH">运动老师</option></select></label>}
      <label>密码<input name="password" type="password" autoComplete="current-password" required placeholder="请输入密码" /></label>
      <button className="primary wide" disabled={submitting}>{submitting ? '正在登录…' : '安全登录'}</button>{mode === 'clinical' && <small>无法登录请联系机构管理员重置账号。</small>}
    </form></section>
  </main>;
}

function LoadingPanel({ label = '正在加载数据…' }: { label?: string }) { return <div className="loading-panel"><ReloadIcon className="spin" /><span>{label}</span></div>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><ClipboardIcon /><b>{title}</b><p>{detail}</p></div>; }
function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-banner" role="alert"><ExclamationTriangleIcon /><span>{message}</span>{onRetry && <button onClick={onRetry}><ReloadIcon />重试</button>}</div>;
}

function PatientTable({ patients, selectedId, onOpen }: { patients: Patient[]; selectedId?: string; onOpen: (patient: Patient) => void }) {
  if (!patients.length) return <EmptyState title="暂无患者" detail="患者完成绑定后会显示在这里。" />;
  return <div className="data-table patient-table"><div className="table-row table-head"><span>患者</span><span>最新体重</span><span>BMI</span><span>依从度</span><span>风险</span><span>最近记录</span></div>
    {patients.map((patient) => <button className={`table-row ${selectedId === patient.id ? 'selected' : ''}`} onClick={() => onOpen(patient)} key={patient.id}>
      <span className="patient-cell"><i>{initials(patient.displayName)}</i><b>{patient.displayName}<small>{patient.age === undefined ? compactPhone(patient.phone) : `${patient.age}岁 · ${compactPhone(patient.phone)}`}</small></b></span>
      <span><b>{displayMetric(patient.currentWeightKg, ' kg')}</b>{patient.weightDelta30d !== undefined && <small className={patient.weightDelta30d > 0 ? 'metric-up' : 'metric-down'}>{patient.weightDelta30d > 0 ? '+' : ''}{patient.weightDelta30d.toFixed(1)} kg / 30天</small>}</span>
      <span>{displayMetric(patient.bmi)}</span><span>{patient.adherencePct === undefined ? '--' : <><b>{patient.adherencePct.toFixed(0)}%</b><small className="progress"><i style={{ width: `${Math.max(0, Math.min(100, patient.adherencePct))}%` }} /></small></>}</span>
      <span><i className={`risk risk-${patient.riskLevel?.toLowerCase() ?? 'unknown'}`}>{riskLabel(patient.riskLevel)}</i></span><span>{formatDateTime(patient.lastRecordAt)}</span>
    </button>)}</div>;
}

function PatientPreview({ patient, onOpen, onFollowUp, onMessage }: { patient?: Patient; onOpen: () => void; onFollowUp: () => void; onMessage: () => void }) {
  if (!patient) return <section className="panel patient-preview"><EmptyState title="选择一位患者" detail="点击患者行查看摘要。" /></section>;
  return <section className="panel patient-preview"><div className="preview-head"><i>{initials(patient.displayName)}</i><div><h2>{patient.displayName}</h2><p>{compactPhone(patient.phone)}</p></div><button className="quiet" onClick={onOpen}>完整档案</button></div>
    <div className="preview-metrics"><div><small>当前体重</small><b>{displayMetric(patient.currentWeightKg, ' kg')}</b></div><div><small>BMI</small><b>{displayMetric(patient.bmi)}</b></div><div><small>目标体重</small><b>{displayMetric(patient.targetWeightKg, ' kg')}</b></div></div>
    <dl className="preview-info"><div><dt>风险分层</dt><dd>{riskLabel(patient.riskLevel)}</dd></div><div><dt>最近记录</dt><dd>{formatDateTime(patient.lastRecordAt)}</dd></div><div><dt>待完成任务</dt><dd>{patient.pendingTaskCount ?? patient.receivedTasks.filter((task) => task.status === 'PENDING').length} 项</dd></div></dl>
    <div className="preview-actions"><button className="primary" onClick={onFollowUp}><CalendarIcon />创建随访</button><button onClick={onMessage}><ChatBubbleIcon />发消息</button></div>
  </section>;
}

function DashboardView({ data, selectedPatient, onSelectPatient, onOpenPatient, onCreateFollowUp, onMessage, onOpenFollowUps }: {
  data: AppData; selectedPatient?: Patient; onSelectPatient: (patient: Patient) => void; onOpenPatient: (patient: Patient) => void;
  onCreateFollowUp: (patient?: Patient) => void; onMessage: (patient: Patient) => void; onOpenFollowUps: () => void;
}) {
  const metrics = deriveClinicalSummary(data.patients, data.followUps, { ...data.summary, totalPatients: data.summary.totalPatients ?? data.patientTotal });
  const upcoming = data.followUps.filter((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()).slice(0, 5);
  return <><section className="metric-grid">
    <article><span className="metric-icon blue"><PersonIcon /></span><small>管理患者</small><strong>{metrics.totalPatients}</strong><em>当前授权关系</em></article>
    <article><span className="metric-icon cyan"><CalendarIcon /></span><small>今日待随访</small><strong>{metrics.dueToday}</strong><em className={metrics.overdueFollowUps ? 'warning' : ''}>{metrics.overdueFollowUps} 项已逾期</em></article>
    <article><span className="metric-icon green"><CheckCircledIcon /></span><small>随访完成率</small><strong>{data.summary.followUpCompletionRate === undefined ? '--' : `${data.summary.followUpCompletionRate.toFixed(0)}%`}</strong><em>基于已结束随访</em></article>
    <article><span className="metric-icon orange"><ExclamationTriangleIcon /></span><small>重点关注</small><strong>{metrics.highRiskPatients}</strong><em>高风险或需关注</em></article>
  </section><section className="dashboard-grid"><div className="panel patient-list-panel"><div className="panel-title"><div><h2>患者概览</h2><p>展示真实最新记录与风险分层</p></div><button className="quiet" onClick={() => selectedPatient && onOpenPatient(selectedPatient)} disabled={!selectedPatient}>查看档案</button></div><PatientTable patients={data.patients.slice(0, 8)} selectedId={selectedPatient?.id} onOpen={onSelectPatient} /></div>
    <PatientPreview patient={selectedPatient} onOpen={() => selectedPatient && onOpenPatient(selectedPatient)} onFollowUp={() => onCreateFollowUp(selectedPatient)} onMessage={() => selectedPatient && onMessage(selectedPatient)} />
  </section><section className="panel upcoming-panel"><div className="panel-title"><div><h2>近期随访</h2><p>按计划时间排序</p></div><button className="quiet" onClick={onOpenFollowUps}>全部随访</button></div>
    {upcoming.length ? <div className="follow-up-strip">{upcoming.map((item) => <article key={item.id}><span className={`status-dot status-${item.status.toLowerCase()}`} /><div><b>{item.patientName ?? data.patients.find((patient) => patient.id === item.patientId)?.displayName ?? '患者'}</b><small>{followUpTypes[item.type ?? ''] ?? item.type ?? '常规随访'}</small></div><time>{formatDateTime(item.scheduledAt)}</time><i className={`status status-${item.status.toLowerCase()}`}>{followUpStatusLabel(item.status)}</i></article>)}</div> : <EmptyState title="暂无待办随访" detail="创建随访后会按时间显示在这里。" />}
  </section></>;
}

function PatientsView({ patients, total, onOpen, onCreatePatient, onCreateFollowUp }: { patients: Patient[]; total: number; onOpen: (patient: Patient) => void; onCreatePatient: () => void; onCreateFollowUp: (patient?: Patient) => void }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('ALL');
  const rows = useMemo(() => patients.filter((patient) => {
    const matchesQuery = patient.displayName.toLowerCase().includes(query.toLowerCase()) || patient.phone?.includes(query) || patient.id.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === 'ALL' || (filter === 'ACTIVE' && patient.status?.toUpperCase() === 'ACTIVE') || (filter === 'ATTENTION' && (patient.requiresAttention || patient.riskLevel?.toUpperCase() === 'HIGH')) || (filter === 'COMPLETED' && patient.status?.toUpperCase() === 'COMPLETED');
    return Boolean(matchesQuery && matchesFilter);
  }), [filter, patients, query]);
  return <section className="panel page-panel"><div className="page-toolbar"><div><h2>患者管理</h2><p>共 {total} 位已授权患者</p></div><div className="page-toolbar-actions"><button onClick={() => onCreateFollowUp()}><CalendarIcon />创建随访</button><span className="care-muted">新客户由健管师统一建档</span></div></div>
    <div className="filter-row"><label className="search-field"><MagnifyingGlassIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、手机号或患者 ID" /></label><div className="segmented">{[['ALL', '全部'], ['ACTIVE', '管理中'], ['ATTENTION', '重点关注'], ['COMPLETED', '已结案']].map(([value, label]) => <button key={value} className={filter === value ? 'on' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    <PatientTable patients={rows} onOpen={onOpen} />
  </section>;
}

function PatientDetailView({ patientId, practitionerId, onBack, onCreateFollowUp, onMessage, onOpenArchive, onTaskCreated }: {
  patientId: string; practitionerId: string; onBack: () => void; onCreateFollowUp: (patient: Patient) => void;
  onMessage: (patient: Patient) => void; onOpenArchive: (patient: Patient) => void; onTaskCreated: () => void;
}) {
  const [patient, setPatient] = useState<Patient>(); const [records, setRecords] = useState<HealthRecord[]>([]); const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [patientArchive, setPatientArchive] = useState<PatientArchive | null>(null);
  const [summaries, setSummaries] = useState<CareSummary[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [taskOpen, setTaskOpen] = useState(false); const [summaryOpen, setSummaryOpen] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try {
      const [patientValue, recordsValue, followUpsValue, archiveValue, summaryValues] = await Promise.all([api.getPatient(patientId), api.getPatientRecords(patientId), api.listFollowUps({ patientId, pageSize: 100 }), api.getPatientArchive(patientId), api.listPatientCareSummaries(patientId)]);
      setPatient(patientValue); setRecords(recordsValue); setFollowUps(followUpsValue.items); setPatientArchive(archiveValue); setSummaries(summaryValues);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [patientId]);
  if (loading) return <LoadingPanel label="正在加载患者档案…" />;
  if (error) return <><button className="back-button" onClick={onBack}><ArrowLeftIcon />返回患者列表</button><ErrorBanner message={error} onRetry={() => void load()} /></>;
  if (!patient) return <EmptyState title="患者不存在" detail="该患者可能已解除绑定或无访问权限。" />;
  const chartData = records.filter((item) => item.weightKg !== undefined && item.measuredAt).sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()).map((item) => ({ date: new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(item.measuredAt)), weight: item.weightKg }));
  const archiveStatus = patientArchive?.status ?? patient.archiveStatus;
  const archiveActionLabel = archiveStatus === 'COMPLETED' ? '编辑档案' : archiveStatus === 'DRAFT' ? '继续补录' : '建立档案';
  const archivePercent = patientArchive ? archiveCompletion(patientArchive.answers).percentage : patient.archiveCompletionPercent ?? 0;
  return <><div className="detail-toolbar"><button className="back-button" onClick={onBack}><ArrowLeftIcon />返回患者列表</button><div><button onClick={() => onMessage(patient)}><ChatBubbleIcon />发消息</button><button onClick={() => setTaskOpen(true)}><ClipboardIcon />下发任务</button><button onClick={() => onCreateFollowUp(patient)}><PlusIcon />创建随访</button><button className="primary" onClick={() => setSummaryOpen(true)}><ReaderIcon />发布总结</button></div></div>
    <section className="patient-hero panel"><div className="hero-person"><i>{initials(patient.displayName)}</i><div><h2>{patient.displayName}</h2><p>{compactPhone(patient.phone)} · {patient.gender ?? '性别未填写'} · {patient.age === undefined ? '年龄未填写' : `${patient.age}岁`}</p><span className={`risk risk-${patient.riskLevel?.toLowerCase() ?? 'unknown'}`}>{riskLabel(patient.riskLevel)}</span></div></div><div className="hero-metrics"><div><small>当前体重</small><b>{displayMetric(patient.currentWeightKg, ' kg')}</b></div><div><small>BMI</small><b>{displayMetric(patient.bmi)}</b></div><div><small>目标体重</small><b>{displayMetric(patient.targetWeightKg, ' kg')}</b></div><div><small>依从度</small><b>{patient.adherencePct === undefined ? '--' : `${patient.adherencePct.toFixed(0)}%`}</b></div></div></section>
    <section className="archive-summary-card panel"><div className="archive-summary-icon"><ReaderIcon /></div><div><div className="archive-summary-heading"><h2>中医体重管理档案</h2><span className={`archive-state archive-state-${archiveStatus?.toLowerCase() ?? 'empty'}`}>{archiveStatus === 'COMPLETED' ? '已完成' : archiveStatus === 'DRAFT' ? '草稿' : '未建档'}</span></div><p>{archiveStatus ? `当前完成度 ${archivePercent}%${patient.archiveUpdatedAt ? ` · 最近更新 ${formatDateTime(patient.archiveUpdatedAt)}` : ''}` : '尚未录入纸质档案中的疾病、检验、生活方式与管理计划。'}</p><div className="archive-summary-progress"><span style={{ width: `${archivePercent}%` }} /></div></div><button className={archiveStatus ? '' : 'primary'} onClick={() => onOpenArchive(patient)}><ClipboardIcon />{archiveActionLabel}</button></section>
    <section className="detail-grid"><div className="panel chart-panel"><div className="panel-title"><div><h2>体重趋势</h2><p>来源于患者提交的体重记录</p></div><span>{chartData.length} 条记录</span></div>{chartData.length ? <div className="weight-chart"><ResponsiveContainer><LineChart data={chartData}><CartesianGrid stroke="#e9f0f2" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} /><YAxis domain={['dataMin - 2', 'dataMax + 2']} axisLine={false} tickLine={false} width={38} /><Tooltip formatter={(value) => [`${value} kg`, '体重']} /><Line isAnimationActive={false} type="monotone" dataKey="weight" stroke="#1488ad" strokeWidth={3} dot={{ fill: '#fff', stroke: '#1488ad', strokeWidth: 2, r: 3 }} /></LineChart></ResponsiveContainer></div> : <EmptyState title="暂无体重趋势" detail="患者提交体重记录后将自动生成曲线。" />}</div>
      <div className="panel profile-panel"><div className="panel-title"><div><h2>基础信息</h2><p>患者档案与授权信息</p></div></div><dl><div><dt>身高</dt><dd>{displayMetric(patient.heightCm, ' cm', 0)}</dd></div><div><dt>病史</dt><dd>{patient.medicalHistory ?? '未填写'}</dd></div><div><dt>过敏史</dt><dd>{patient.allergies ?? '未填写'}</dd></div><div><dt>绑定时间</dt><dd>{formatDateTime(patient.relationStartedAt)}</dd></div></dl></div>
    </section><section className="detail-grid lower"><div className="panel"><div className="panel-title"><div><h2>随访记录</h2><p>该患者的随访计划与状态</p></div></div>{followUps.length ? <div className="compact-list">{followUps.map((item) => <article key={item.id}><span className={`status-dot status-${item.status.toLowerCase()}`} /><div><b>{followUpTypes[item.type ?? ''] ?? item.type ?? '常规随访'}</b><small>{item.summary ?? '暂无说明'}</small></div><time>{formatDateTime(item.scheduledAt)}</time><i className={`status status-${item.status.toLowerCase()}`}>{followUpStatusLabel(item.status)}</i></article>)}</div> : <EmptyState title="暂无随访" detail="可为该患者创建新的随访计划。" />}</div>
      <div className="panel"><div className="panel-title"><div><h2>患者任务</h2><p>医生或营养师已下发任务</p></div></div>{patient.receivedTasks.length ? <div className="task-list">{patient.receivedTasks.map((task) => <article key={task.id}><div><b>{task.title}</b><small>{task.description ?? '暂无执行说明'}</small></div><span className={`status status-${task.status.toLowerCase()}`}>{task.status === 'COMPLETED' ? '已完成' : '待完成'}</span><time>{task.dueAt ? `截止 ${formatDateTime(task.dueAt)}` : '无截止时间'}</time></article>)}</div> : <EmptyState title="暂无任务" detail="可下发饮食、体重或运动记录任务。" />}</div>
    </section><section className="panel care-summary-panel"><div className="panel-title"><div><h2>周期总结与医护点评</h2><p>发布后将立即推送到患者健康报告</p></div><button className="primary" onClick={() => setSummaryOpen(true)}><ReaderIcon />发布周/月总结</button></div>{summaries.length ? <div className="care-summary-list">{summaries.map((summary) => <article key={summary.id}><header><span>{summary.periodType === 'WEEKLY' ? '每周总结' : '每月总结'}</span><div><b>{dateOnly(summary.periodStart)} — {dateOnly(summary.periodEnd)}</b><small>{summary.practitioner?.displayName ?? '医护人员'} · {formatDateTime(summary.publishedAt)}</small></div></header><div className="care-summary-metrics"><div><small>体重变化</small><b>{summary.metrics.weightChangeKg === undefined ? '--' : `${summary.metrics.weightChangeKg > 0 ? '+' : ''}${summary.metrics.weightChangeKg.toFixed(1)} kg`}</b></div><div><small>饮食记录</small><b>{summary.metrics.dietRecordCount ?? 0} 次</b></div><div><small>运动记录</small><b>{summary.metrics.exerciseRecordCount ?? 0} 次</b></div><div><small>任务完成</small><b>{summary.metrics.completedTaskCount ?? 0}/{summary.metrics.taskCount ?? 0}</b></div></div><blockquote>{summary.comment}</blockquote></article>)}</div> : <EmptyState title="尚未发布周期总结" detail="选择每周或每月，系统会自动汇总患者记录，您补充专业点评后即可推送。" />}</section>{taskOpen && <TaskModal patient={patient} practitionerId={practitionerId} onClose={() => setTaskOpen(false)} onCreated={() => { setTaskOpen(false); onTaskCreated(); void load(); }} />}{summaryOpen && <CareSummaryModal patient={patient} onClose={() => setSummaryOpen(false)} onPublished={(published) => { setSummaries((current) => [published, ...current.filter((item) => item.id !== published.id)]); setSummaryOpen(false); }} />}</>;
}

function FollowUpsView({ followUps, patients, onCreate, onUpdated }: { followUps: FollowUp[]; patients: Patient[]; onCreate: () => void; onUpdated: (item: FollowUp) => void }) {
  const [filter, setFilter] = useState('ALL'); const [workingId, setWorkingId] = useState(''); const [error, setError] = useState('');
  const visible = followUps.filter((item) => filter === 'ALL' || item.status === filter);
  async function update(item: FollowUp, status: FollowUpStatus) { setWorkingId(item.id); setError(''); try { onUpdated(await api.updateFollowUp(item.id, status)); } catch (requestError) { setError(errorText(requestError)); } finally { setWorkingId(''); } }
  return <section className="panel page-panel"><div className="page-toolbar"><div><h2>随访管理</h2><p>创建计划、跟进执行并记录状态</p></div><button className="primary" onClick={onCreate}><PlusIcon />创建随访</button></div>{error && <ErrorBanner message={error} />}
    <div className="filter-row"><div className="segmented">{[['ALL', '全部'], ['PENDING', '待开始'], ['IN_PROGRESS', '进行中'], ['OVERDUE', '已逾期'], ['COMPLETED', '已完成'], ['CANCELLED', '已取消']].map(([value, label]) => <button className={filter === value ? 'on' : ''} onClick={() => setFilter(value)} key={value}>{label}</button>)}</div></div>
    {visible.length ? <div className="follow-up-table"><div className="follow-row follow-head"><span>患者</span><span>类型</span><span>计划时间</span><span>优先级</span><span>状态</span><span>操作</span></div>{visible.map((item) => <div className="follow-row" key={item.id}><span className="patient-cell"><i>{initials(item.patientName ?? patients.find((patient) => patient.id === item.patientId)?.displayName ?? '患')}</i><b>{item.patientName ?? patients.find((patient) => patient.id === item.patientId)?.displayName ?? '未命名患者'}<small>{item.patientId}</small></b></span><span>{followUpTypes[item.type ?? ''] ?? item.type ?? '常规随访'}</span><span>{formatDateTime(item.scheduledAt)}</span><span>{item.priority === 'HIGH' ? '高' : item.priority === 'LOW' ? '低' : '普通'}</span><span><i className={`status status-${item.status.toLowerCase()}`}>{followUpStatusLabel(item.status)}</i></span>
      <span className="row-actions">{item.status === 'PENDING' && <button disabled={workingId === item.id} onClick={() => void update(item, 'IN_PROGRESS')}>开始</button>}{['PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(item.status) && <button disabled={workingId === item.id} onClick={() => void update(item, 'COMPLETED')}>完成</button>}{['PENDING', 'IN_PROGRESS'].includes(item.status) && <button className="danger-link" disabled={workingId === item.id} onClick={() => void update(item, 'CANCELLED')}>取消</button>}{['COMPLETED', 'CANCELLED'].includes(item.status) && <span>—</span>}</span></div>)}</div> : <EmptyState title="当前筛选下暂无随访" detail="调整筛选条件或创建新的随访计划。" />}
  </section>;
}

function MessagesView({ practitionerId, conversations, selectedPeerId, onSelectedPeer, onConversationRead, onConversationUpdated }: {
  practitionerId: string; conversations: Conversation[]; selectedPeerId?: string; onSelectedPeer: (peerId: string) => void;
  onConversationRead: (peerId: string) => void; onConversationUpdated: (peerId: string, message: string, timestamp: string) => void;
}) {
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof api.listMessages>>>([]); const [loading, setLoading] = useState(false); const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const selected = conversations.find((item) => item.peerId === selectedPeerId) ?? conversations[0];
  useEffect(() => {
    if (!selected) return; if (selected.peerId !== selectedPeerId) onSelectedPeer(selected.peerId); setLoading(true); setError('');
    void api.listMessages(selected.peerId).then(async (items) => { setMessages(items); const unread = items.filter((item) => item.receiverId === practitionerId && !item.readAt && item.id); if (unread.length) { await Promise.all(unread.map((item) => api.markMessageRead(item.id))); onConversationRead(selected.peerId); } }).catch((requestError) => setError(errorText(requestError))).finally(() => setLoading(false));
  }, [practitionerId, selected?.peerId]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; const form = event.currentTarget; const input = form.elements.namedItem('message') as HTMLInputElement; const content = input.value.trim(); if (!content) return;
    setSending(true); setError(''); try { const message = await api.sendMessage(selected.peerId, content); setMessages((current) => [...current, message]); onConversationUpdated(selected.peerId, message.content, message.createdAt); form.reset(); } catch (requestError) { setError(errorText(requestError)); } finally { setSending(false); }
  }
  return <section className="panel messages-layout"><aside className="conversation-list"><div className="message-heading"><h2>消息中心</h2><p>{conversations.reduce((total, item) => total + item.unreadCount, 0)} 条未读</p></div>{conversations.length ? conversations.map((item) => <button className={selected?.peerId === item.peerId ? 'active' : ''} onClick={() => onSelectedPeer(item.peerId)} key={item.id}><i>{initials(item.peerName)}</i><div><b>{item.peerName}</b><p>{item.lastMessage ?? '暂无消息'}</p></div><span><time>{formatDateTime(item.lastMessageAt)}</time>{item.unreadCount > 0 && <em>{item.unreadCount}</em>}</span></button>) : <EmptyState title="暂无会话" detail="从患者档案发起消息后会显示在这里。" />}</aside>
    <div className="chat-panel">{selected ? <><header className="chat-head"><i>{initials(selected.peerName)}</i><div><b>{selected.peerName}</b><small>患者会话</small></div></header>{error && <ErrorBanner message={error} />}{loading ? <LoadingPanel label="正在加载消息…" /> : <div className="message-stream">{messages.length ? messages.map((message) => <article className={message.senderId === practitionerId ? 'mine' : ''} key={message.id}><div>{message.content}</div><time>{formatDateTime(message.createdAt)}{message.senderId === practitionerId && <span>{message.readAt ? ' · 已读' : ' · 已发送'}</span>}</time></article>) : <EmptyState title="还没有消息" detail="发送第一条消息开始沟通。" />}</div>}<form className="message-composer" onSubmit={submit}><input name="message" maxLength={4000} placeholder="输入消息，回车发送" autoComplete="off" /><button className="primary" disabled={sending}><PaperPlaneIcon />{sending ? '发送中' : '发送'}</button></form></> : <EmptyState title="请选择会话" detail="从左侧选择一位患者。" />}</div>
  </section>;
}

function NotificationsView({ notifications, onRead, onReadAll }: { notifications: NotificationItem[]; onRead: (id: string) => Promise<void>; onReadAll: () => Promise<void> }) {
  const [working, setWorking] = useState(''); const [error, setError] = useState('');
  async function run(id: string, action: () => Promise<void>) { setWorking(id); setError(''); try { await action(); } catch (requestError) { setError(errorText(requestError)); } finally { setWorking(''); } }
  const unread = notifications.filter((item) => !item.readAt).length;
  return <section className="panel page-panel notifications-page"><div className="page-toolbar"><div><h2>通知中心</h2><p>{unread ? `${unread} 条未读通知` : '暂无未读通知'}</p></div><button disabled={!unread || Boolean(working)} onClick={() => void run('all', onReadAll)}><CheckCircledIcon />全部已读</button></div>{error && <ErrorBanner message={error} />}{notifications.length ? <div className="notification-list">{notifications.map((item) => <article className={!item.readAt ? 'unread' : ''} key={item.id}><span className="notification-icon"><BellIcon /></span><div><div><b>{item.title}</b>{!item.readAt && <i>未读</i>}</div><p>{item.content}</p><time>{formatDateTime(item.createdAt)}</time></div>{!item.readAt && <button disabled={Boolean(working)} onClick={() => void run(item.id, () => onRead(item.id))}>标为已读</button>}</article>)}</div> : <EmptyState title="暂无通知" detail="随访提醒和患者动态会显示在这里。" />}</section>;
}

function CreatePatientModal({ onClose, onCreated, onStartArchive }: { onClose: () => void; onCreated: (result: CreatePatientResult, startArchive: boolean) => Promise<void> | void; onStartArchive: (patient: Patient) => void }) {
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<CreatePatientResult>();
  const [archiveMode, setArchiveMode] = useState<'LATER' | 'NOW'>('LATER');
  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstFieldRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') onClose(); }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(''); const data = new FormData(event.currentTarget);
    const numberField = (name: string) => { const value = String(data.get(name) ?? '').trim(); return value ? Number(value) : undefined; };
    const input: CreatePatientInput = {
      phone: String(data.get('phone') ?? '').replace(/\s+/g, ''),
      displayName: String(data.get('displayName') ?? '').trim(),
      gender: (String(data.get('gender') ?? '') || undefined) as CreatePatientInput['gender'],
      birthDate: String(data.get('birthDate') ?? '') || undefined,
      heightCm: numberField('heightCm'),
      initialWeightKg: numberField('initialWeightKg'),
      targetWeightKg: numberField('targetWeightKg'),
      patientAuthorizationConfirmed: true,
    };
    try {
      const created = await api.createPatient(input);
      await onCreated(created, archiveMode === 'NOW');
      if (archiveMode === 'NOW') onClose(); else setResult(created);
    }
    catch (requestError) { setError(errorText(requestError)); }
    finally { setSubmitting(false); }
  }
  const resultTitle = result?.accountCreated ? '患者账号已创建并绑定' : result?.relationCreated ? '已有患者账号已绑定' : '患者关系已确认';
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal-card create-patient-modal" role="dialog" aria-modal="true" aria-labelledby="create-patient-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">患者管理</p><h2 id="create-patient-title">{result ? resultTitle : '新增并绑定患者'}</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="关闭新增患者窗口"><Cross2Icon /></button></div>
    {result ? <div className="create-patient-result" aria-live="polite"><span className="result-icon"><CheckCircledIcon /></span><h3>{resultTitle}</h3><p>{result.message ?? `${result.patient.displayName} 已加入您的患者列表。`}</p><dl><div><dt>患者</dt><dd>{result.patient.displayName}</dd></div><div><dt>登录手机号</dt><dd>{result.patient.phone ?? '以登记手机号为准'}</dd></div><div><dt>账号状态</dt><dd>{result.accountCreated ? '已自动注册' : '已有账号，无需重复注册'}</dd></div></dl>
      {result.temporaryPassword ? <div className="credential-notice"><b>临时登录密码</b><code>{result.temporaryPassword}</code><p>临时密码仅显示一次，请通过安全方式告知患者，并提醒首次登录后修改。</p></div> : <div className="credential-notice sms"><b>{result.accountCreated ? '下一步：通知患者登录' : '绑定已完成'}</b><p>{result.accountCreated || result.passwordSetupRequired ? '患者可使用该手机号通过短信验证码登录；如需密码登录，可在登录页“忘记密码”中设置密码。' : '该手机号对应账号可继续使用原登录方式，无需重新注册。'}</p></div>}
      <div className="modal-actions"><button type="button" onClick={onClose}>稍后处理</button><button className="primary" type="button" onClick={() => onStartArchive(result.patient)}><ClipboardIcon />现在去建档</button></div></div>
      : <form onSubmit={submit}><p className="modal-intro">手机号将作为患者登录账号。若账号不存在，系统会自动注册；若已存在，则仅建立或恢复服务关系，不覆盖原有资料。</p>{error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}<div className="form-grid">
        <label>患者姓名<input ref={firstFieldRef} name="displayName" required maxLength={50} autoComplete="name" placeholder="请输入患者姓名" /></label>
        <label>手机号<input name="phone" required inputMode="tel" autoComplete="tel" maxLength={14} pattern="[+]?861[3-9][0-9]{9}|1[3-9][0-9]{9}" title="请输入 11 位中国大陆手机号，可带 +86" placeholder="请输入手机号" /></label>
        <label>性别<select name="gender" defaultValue=""><option value="">暂不填写</option><option value="MALE">男</option><option value="FEMALE">女</option><option value="OTHER">其他</option></select></label>
        <label>出生日期<input name="birthDate" type="date" max={new Date().toISOString().slice(0, 10)} /></label>
        <label>身高（cm）<input name="heightCm" type="number" min="80" max="250" step="0.1" inputMode="decimal" placeholder="例如 170" /></label>
        <label>当前体重（kg）<input name="initialWeightKg" type="number" min="25" max="350" step="0.1" inputMode="decimal" placeholder="例如 70.5" /></label>
        <label>目标体重（kg）<input name="targetWeightKg" type="number" min="25" max="350" step="0.1" inputMode="decimal" placeholder="例如 65" /></label>
        <fieldset className="archive-mode-picker full"><legend>电子建档</legend><p>患者账号和档案分开保存，检验结果暂缺也可以先保存草稿。</p><label className={archiveMode === 'LATER' ? 'selected' : ''}><input type="radio" name="archiveMode" value="LATER" checked={archiveMode === 'LATER'} onChange={() => setArchiveMode('LATER')} /><span><b>仅创建账号，稍后补录</b><small>创建后可从患者详情进入电子档案。</small></span></label><label className={archiveMode === 'NOW' ? 'selected' : ''}><input type="radio" name="archiveMode" value="NOW" checked={archiveMode === 'NOW'} onChange={() => setArchiveMode('NOW')} /><span><b>创建账号后立即建档</b><small>创建成功后直接进入独立建档页面。</small></span></label></fieldset>
        <label className="authorization-check full"><input name="authorizationConfirmed" type="checkbox" required /><span><b>已核对手机号并取得患者授权</b><small>我确认患者同意创建账号，并与当前医生/营养师建立服务关系。</small></span></label>
      </div><div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={submitting}>{submitting ? '正在新增并绑定…' : '确认新增患者'}</button></div></form>}
  </section></div>;
}

function FollowUpModal({ patients, initialPatient, onClose, onCreated }: { patients: Patient[]; initialPatient?: Patient; onClose: () => void; onCreated: (item: FollowUp) => void }) {
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(''); const data = new FormData(event.currentTarget);
    const recurrenceValue = String(data.get('recurrence') ?? 'NONE');
    const input: CreateFollowUpInput = {
      patientId: String(data.get('patientId') ?? ''), type: String(data.get('type') ?? 'GENERAL'),
      priority: String(data.get('priority') ?? 'NORMAL'), scheduledAt: new Date(String(data.get('scheduledAt'))).toISOString(),
      note: String(data.get('note') ?? '').trim() || undefined,
      recurrence: recurrenceValue === 'NONE' ? undefined : { frequency: recurrenceValue.toLowerCase(), count: Number(data.get('recurrenceCount') ?? 4) },
    };
    try { onCreated(await api.createFollowUp(input)); } catch (requestError) { setError(errorText(requestError)); } finally { setSubmitting(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal-card" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-title"><div><p className="eyebrow">新建计划</p><h2>创建患者随访</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="关闭"><Cross2Icon /></button></div>{error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}<div className="form-grid">
    <label className="full">患者<select name="patientId" required defaultValue={initialPatient?.id ?? ''}><option value="" disabled>请选择患者</option>{patients.map((patient) => <option value={patient.id} key={patient.id}>{patient.displayName} · {compactPhone(patient.phone)}</option>)}</select></label><label>随访类型<select name="type" defaultValue="WEIGHT">{Object.entries(followUpTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>优先级<select name="priority" defaultValue="NORMAL"><option value="LOW">低</option><option value="NORMAL">普通</option><option value="HIGH">高</option></select></label><label>计划时间<input name="scheduledAt" type="datetime-local" defaultValue={dateTimeLocalValue()} required /></label><label>重复规则<select name="recurrence" defaultValue="NONE"><option value="NONE">不重复</option><option value="DAILY">每天</option><option value="WEEKLY">每周</option><option value="BIWEEKLY">每两周</option><option value="MONTHLY">每月</option></select></label><label>生成次数<input name="recurrenceCount" type="number" min="2" max="100" defaultValue="4" /></label><label className="full">随访说明<textarea name="note" maxLength={1000} placeholder="填写本次随访目标、关注问题或注意事项" /></label></div><div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={submitting}>{submitting ? '正在创建…' : '确认创建'}</button></div></form></div>;
}

function TaskModal({ patient, practitionerId, onClose, onCreated }: { patient: Patient; practitionerId: string; onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(''); const data = new FormData(event.currentTarget);
    try { await api.createPatientTask(patient.id, { title: String(data.get('title') ?? '').trim(), description: String(data.get('description') ?? '').trim() || undefined, dueAt: data.get('dueAt') ? new Date(String(data.get('dueAt'))).toISOString() : undefined }); onCreated(); }
    catch (requestError) { setError(errorText(requestError)); } finally { setSubmitting(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal-card compact-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-title"><div><p className="eyebrow">患者任务</p><h2>给 {patient.displayName} 下发任务</h2></div><button type="button" className="close-button" onClick={onClose}><Cross2Icon /></button></div>{error && <div className="form-error"><ExclamationTriangleIcon />{error}</div>}<input type="hidden" name="assignedById" value={practitionerId} /><div className="form-grid"><label className="full">任务名称<input name="title" required maxLength={100} placeholder="例如：连续记录三日饮食" /></label><label className="full">执行说明<textarea name="description" maxLength={1000} placeholder="填写记录方式、频次和注意事项" /></label><label className="full">截止时间<input name="dueAt" type="datetime-local" defaultValue={dateTimeLocalValue(72)} /></label></div><div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={submitting}>{submitting ? '正在下发…' : '确认下发'}</button></div></form></div>;
}

function CareSummaryModal({ patient, onClose, onPublished }: { patient: Patient; onClose: () => void; onPublished: (summary: CareSummary) => void }) {
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(''); const data = new FormData(event.currentTarget);
    const input: PublishCareSummaryInput = {
      periodType: String(data.get('periodType') ?? 'WEEKLY') as PublishCareSummaryInput['periodType'],
      referenceDate: String(data.get('referenceDate') ?? ''),
      comment: String(data.get('comment') ?? '').trim(),
    };
    try { onPublished(await api.publishPatientCareSummary(patient.id, input)); }
    catch (requestError) { setError(errorText(requestError)); }
    finally { setSubmitting(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal-card care-summary-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><div className="modal-title"><div><p className="eyebrow">周期健康管理</p><h2>给 {patient.displayName} 发布总结</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="关闭"><Cross2Icon /></button></div><p className="modal-intro">系统会按所选日期自动汇总体重、饮食、运动和任务数据。点评发布后，患者将收到站内通知并可在“健康报告”中查看。</p>{error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}<div className="form-grid"><label>总结周期<select name="periodType" defaultValue="WEEKLY"><option value="WEEKLY">每周总结</option><option value="MONTHLY">每月总结</option></select></label><label>周期内任一日期<input name="referenceDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><label className="full">医护点评<textarea name="comment" required minLength={2} maxLength={2000} rows={7} placeholder="结合患者本周期数据给出专业评价、风险提示和下一阶段建议" /></label></div><div className="summary-publish-note"><BellIcon /><span><b>发布即推送</b><small>同一医护人员再次发布相同周期时，将更新原总结并发送更新通知。</small></span></div><div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={submitting}>{submitting ? '正在汇总并推送…' : '确认发布并推送'}</button></div></form></div>;
}

export default function App() {
  const [user, setUser] = useState<Practitioner | null>(() => readStoredUser()); const [view, setView] = useState<ViewName>('managed-care'); const [data, setData] = useState<AppData>(emptyData);
  const [selectedPatientId, setSelectedPatientId] = useState(''); const [selectedPeerId, setSelectedPeerId] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [toast, setToast] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const [createPatientOpen, setCreatePatientOpen] = useState(false);
  const [archivePatient, setArchivePatient] = useState<Patient>();
  const [archiveDirty, setArchiveDirty] = useState(false);
  const [followUpModal, setFollowUpModal] = useState<{ open: boolean; patient?: Patient }>({ open: false });
  const selectedPatient = data.patients.find((patient) => patient.id === selectedPatientId) ?? data.patients[0];
  const unreadNotifications = data.notifications.filter((item) => !item.readAt).length; const unreadMessages = data.conversations.reduce((total, item) => total + item.unreadCount, 0);
  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3200); }
  function clearSession() { localStorage.removeItem('weightcare_access_token'); localStorage.removeItem('weightcare_refresh_token'); localStorage.removeItem('weightcare_user'); setUser(null); setData(emptyData); }
  useEffect(() => { const expired = () => { clearSession(); setSessionNotice('登录状态已失效，请重新登录。'); }; window.addEventListener('medtalent:session-expired', expired); return () => window.removeEventListener('medtalent:session-expired', expired); }, []);
  async function logOut() {
    if (view === 'patient-archive' && archiveDirty && !window.confirm('电子档案有未保存修改，确定退出登录吗？')) return;
    setError('');
    try { await api.logout(localStorage.getItem('weightcare_refresh_token') ?? undefined); }
    catch (requestError) { setSessionNotice(`本地登录已清除，但服务器会话注销失败：${errorText(requestError)}`); }
    finally { clearSession(); }
  }
  async function loadCore() {
    if (!user) return; setLoading(true); setError('');
    const results = await Promise.allSettled([api.listPatients({ pageSize: 100 }), api.listFollowUps({ pageSize: 100 }), api.getClinicalSummary(), api.listConversations(), api.listNotifications()]);
    const errors = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (errors.some((result) => result.reason instanceof ApiError && result.reason.status === 401)) { setSessionNotice('登录状态已失效，请重新登录。'); clearSession(); setLoading(false); return; }
    setData((current) => ({ patients: results[0].status === 'fulfilled' ? results[0].value.items : current.patients, patientTotal: results[0].status === 'fulfilled' ? results[0].value.total : current.patientTotal, followUps: results[1].status === 'fulfilled' ? results[1].value.items : current.followUps, summary: results[2].status === 'fulfilled' ? results[2].value : current.summary, conversations: results[3].status === 'fulfilled' ? results[3].value : current.conversations, notifications: results[4].status === 'fulfilled' ? results[4].value : current.notifications }));
    if (errors.length) setError(errors.map((result) => errorText(result.reason)).filter((value, index, all) => all.indexOf(value) === index).join('；')); setLoading(false);
  }
  useEffect(() => { if (user && !user.mustChangePassword && ['DOCTOR', 'NUTRITIONIST'].includes(user.role) && view !== 'managed-care') void loadCore(); }, [user?.id, view === 'managed-care']);
  useEffect(() => { if (!selectedPatientId && data.patients[0]) setSelectedPatientId(data.patients[0].id); }, [data.patients, selectedPatientId]);
  if (!user || !localStorage.getItem('weightcare_access_token')) return <LoginScreen notice={sessionNotice} onSuccess={(session) => { setSessionNotice(''); setUser(session.user); }} />;
  if (user.mustChangePassword) return <InitialPassword onLogout={logOut} onChanged={() => { clearSession(); setSessionNotice('密码已更新，请使用新密码重新登录。'); }} />;
  if (user.role === 'ADMIN') return <AdminConsole user={user} onLogout={logOut} />;
  const navItems: Array<{ view: ViewName; label: string; icon: React.ReactNode; badge?: number }> = [
    { view: 'managed-care', label: '服务工作台', icon: <DashboardIcon /> },
    { view: 'yuanqizhan-activities', label: '元气盏活动', icon: <CalendarIcon /> },
    { view: 'dashboard', label: '临床工作台', icon: <DashboardIcon /> }, { view: 'patients', label: '患者管理', icon: <PersonIcon /> }, { view: 'follow-ups', label: '随访管理', icon: <ReaderIcon /> }, { view: 'messages', label: '消息中心', icon: <ChatBubbleIcon />, badge: unreadMessages }, { view: 'notifications', label: '通知中心', icon: <BellIcon />, badge: unreadNotifications },
  ];
  const titles: Record<ViewName, { title: string; detail: string }> = { 'yuanqizhan-activities': { title: '元气盏活动', detail: '配置活动与参与人员，每人从加入当天开始。' }, 'managed-care': { title: '服务工作台', detail: '客户建档、营养管理与运动处方协作。' }, dashboard: { title: `你好，${user.displayName}`, detail: '查看患者最新记录与今天的服务安排。' }, patients: { title: '患者管理', detail: '查看已建立授权关系的患者档案。' }, 'patient-detail': { title: '患者档案', detail: '临床数据、随访与任务记录。' }, 'patient-archive': { title: '电子建档', detail: '录入中医体重管理档案，支持草稿与后续补录。' }, 'follow-ups': { title: '随访管理', detail: '安排、执行并追踪患者随访。' }, messages: { title: '消息中心', detail: '与已授权患者保持连续沟通。' }, notifications: { title: '通知中心', detail: '处理患者动态与系统提醒。' } };
  function navigate(next: ViewName) {
    if (view === 'patient-archive' && next !== 'patient-archive' && archiveDirty && !window.confirm('电子档案有未保存修改，确定离开吗？')) return;
    setView(next); setError('');
  }
  function openPatient(patient: Patient) { setSelectedPatientId(patient.id); navigate('patient-detail'); }
  function openArchive(patient: Patient) { setSelectedPatientId(patient.id); setArchivePatient(patient); navigate('patient-archive'); }
  function openMessage(patient: Patient) { const conversation = data.conversations.find((item) => item.peerId === patient.id); if (!conversation) { navigate('messages'); setError('该患者尚无可用会话，请先由后端创建或返回患者会话。'); return; } setSelectedPeerId(patient.id); navigate('messages'); }
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark"><img src={logoUrl} alt="MedTalent 健康数字助手" /></span><div><b>MedTalent 健康数字助手</b><small>临床管理平台</small></div></div><nav>{navItems.filter(item => item.view === 'yuanqizhan-activities' ? user.role === 'HEALTH_MANAGER' : ['DOCTOR', 'NUTRITIONIST'].includes(user.role) || item.view === 'managed-care').map((item) => <button key={item.view} aria-label={item.label} title={item.label} className={(view === item.view || (['patient-detail', 'patient-archive'].includes(view) && item.view === 'patients')) ? 'active' : ''} onClick={() => navigate(item.view)}>{item.icon}<span>{item.label}</span>{Boolean(item.badge) && <em>{item.badge}</em>}</button>)}</nav><div className="sidebar-foot"><i>{initials(user.displayName)}</i><div><b>{user.displayName}</b><small>{roleLabels[user.role]}{user.department ? ` · ${user.department}` : ''}</small></div><button onClick={() => void logOut()} title="退出登录"><ExitIcon /></button></div></aside>
    <main className="main-content"><header className="topbar"><div><h1>{titles[view].title}</h1><p>{titles[view].detail}</p></div><div className="top-actions"><span className="role-chip">{roleLabels[user.role]}</span><button className="quiet" onClick={() => void logOut()}>退出</button>{view !== 'managed-care' && view !== 'yuanqizhan-activities' && <><button className="icon-button" onClick={() => navigate('notifications')} title="通知"><BellIcon />{unreadNotifications > 0 && <i>{unreadNotifications}</i>}</button><button className="icon-button" disabled={loading} onClick={() => void loadCore()} title="刷新数据"><ReloadIcon className={loading ? 'spin' : ''} /></button></>}</div></header>
      {toast && <div className="toast"><CheckCircledIcon />{toast}</div>}{error && <ErrorBanner message={error} onRetry={() => void loadCore()} />}{loading && !data.patients.length ? <LoadingPanel /> : <>
        {view === 'managed-care' && <ManagedCare user={user} />}
        {view === 'yuanqizhan-activities' && user.role === 'HEALTH_MANAGER' && <YuanqizhanActivity user={user} />}
        {view === 'dashboard' && <DashboardView data={data} selectedPatient={selectedPatient} onSelectPatient={(patient) => setSelectedPatientId(patient.id)} onOpenPatient={openPatient} onCreateFollowUp={(patient) => setFollowUpModal({ open: true, patient })} onMessage={openMessage} onOpenFollowUps={() => navigate('follow-ups')} />}
        {view === 'patients' && <PatientsView patients={data.patients} total={data.patientTotal} onOpen={openPatient} onCreatePatient={() => setCreatePatientOpen(true)} onCreateFollowUp={(patient) => setFollowUpModal({ open: true, patient })} />}
        {view === 'patient-detail' && selectedPatientId && <PatientDetailView patientId={selectedPatientId} practitionerId={user.id} onBack={() => navigate('patients')} onCreateFollowUp={(patient) => setFollowUpModal({ open: true, patient })} onMessage={openMessage} onOpenArchive={openArchive} onTaskCreated={() => showToast('任务已成功下发')} />}
        {view === 'patient-archive' && archivePatient && <ArchiveView patient={archivePatient} onBack={() => navigate('patient-detail')} onDirtyChange={setArchiveDirty} onSaved={(saved: PatientArchive) => { const patch = { archiveStatus: saved.status, archiveCompletionPercent: saved.completionPercent, archiveUpdatedAt: saved.updatedAt ?? null }; setArchivePatient((current) => current ? { ...current, ...patch } : current); setData((current) => ({ ...current, patients: current.patients.map((patient) => patient.id === saved.patientId ? { ...patient, ...patch } : patient) })); showToast(saved.status === 'COMPLETED' ? '患者档案已完成' : '档案草稿已保存'); }} />}
        {view === 'follow-ups' && <FollowUpsView followUps={data.followUps} patients={data.patients} onCreate={() => setFollowUpModal({ open: true })} onUpdated={(updated) => { setData((current) => ({ ...current, followUps: current.followUps.map((item) => item.id === updated.id ? updated : item) })); showToast('随访状态已更新'); }} />}
        {view === 'messages' && <MessagesView practitionerId={user.id} conversations={data.conversations} selectedPeerId={selectedPeerId} onSelectedPeer={setSelectedPeerId} onConversationRead={(peerId) => setData((current) => ({ ...current, conversations: current.conversations.map((item) => item.peerId === peerId ? { ...item, unreadCount: 0 } : item) }))} onConversationUpdated={(peerId, message, timestamp) => setData((current) => ({ ...current, conversations: current.conversations.map((item) => item.peerId === peerId ? { ...item, lastMessage: message, lastMessageAt: timestamp } : item) }))} />}
        {view === 'notifications' && <NotificationsView notifications={data.notifications} onRead={async (id) => { await api.readNotification(id); setData((current) => ({ ...current, notifications: current.notifications.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item) })); showToast('通知已标为已读'); }} onReadAll={async () => { await api.readAllNotifications(); const now = new Date().toISOString(); setData((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? now })) })); showToast('所有通知已标为已读'); }} />}
      </>}
    </main>{createPatientOpen && <CreatePatientModal onClose={() => setCreatePatientOpen(false)} onStartArchive={(patient) => { setCreatePatientOpen(false); openArchive(patient); }} onCreated={async (created, startArchive) => { setSelectedPatientId(created.patient.id); setArchivePatient(created.patient); await loadCore(); showToast(created.accountCreated ? '患者账号已创建并完成绑定' : '患者已完成绑定'); if (startArchive) setView('patient-archive'); }} />}{followUpModal.open && <FollowUpModal patients={data.patients} initialPatient={followUpModal.patient} onClose={() => setFollowUpModal({ open: false })} onCreated={(created) => { setData((current) => ({ ...current, followUps: [created, ...current.followUps] })); setFollowUpModal({ open: false }); showToast('随访计划已创建'); }} />}
  </div>;
}

function InitialPassword({onChanged,onLogout}:{onChanged:()=>void;onLogout:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const next=String(f.get('newPassword'));if(next!==String(f.get('confirmPassword'))){setError('两次新密码不一致');return;}setBusy(true);setError('');try{await api.request('/auth/change-password',{method:'PATCH',body:{currentPassword:String(f.get('currentPassword')),newPassword:next}});onChanged();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  return <main className="login-page"><section className="login-card-wrap"><form className="login-card" onSubmit={submit}><h1>设置新的登录密码</h1><p>初始密码仅用于首次登录，请设置新密码后继续使用。</p>{error && <div className="form-error" role="alert">{error}</div>}<label>初始密码<input name="currentPassword" type="password" required minLength={8} maxLength={72} autoComplete="current-password"/></label><label>新密码<input name="newPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password"/></label><label>再次输入新密码<input name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password"/></label><button className="primary" disabled={busy}>{busy?'保存中…':'保存新密码'}</button><button type="button" disabled={busy} onClick={()=>void onLogout()}>退出登录</button></form></section></main>;
}

