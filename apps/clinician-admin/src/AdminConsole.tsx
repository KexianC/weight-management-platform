import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircledIcon,
  Cross2Icon,
  DashboardIcon,
  ExitIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PersonIcon,
  PlusIcon,
  ReaderIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';
import { api, ApiError } from './api';
import logoUrl from './assets/medtalent-logo.png';
import YuanqizhanActivity from './YuanqizhanActivity';
import type { AdminSummary, AuditLogEntry, ManagedUser, Practitioner, UserRole, UserStatus } from './types';

type AdminView = 'overview' | 'users' | 'logs' | 'activities';
type AccountAction = 'disable' | 'enable' | 'delete';
const roleLabels: Record<UserRole, string> = { PATIENT: '患者', DOCTOR: '医生', NUTRITIONIST: '营养师', HEALTH_MANAGER: '健管师', EXERCISE_COACH: '运动老师', ADMIN: '管理员' };
const statusLabels: Record<UserStatus, string> = { ACTIVE: '正常', DISABLED: '已停用', DELETED: '已删除' };
const actionLabels: Record<string, string> = {
  ADMIN_PASSWORD_LOGIN: '管理员登录', ADMIN_USER_CREATE: '创建用户', ADMIN_USER_UPDATE: '修改用户',
  ADMIN_USER_SOFT_DELETE: '删除用户',
  ADMIN_PASSWORD_RESET: '重置密码', AUTH_PASSWORD_LOGIN: '密码登录', AUTH_LOGOUT: '退出登录',
  AUTH_REGISTER: '用户注册', USER_PROFILE_UPDATE: '更新资料', AUTH_PASSWORD_CHANGE: '修改密码',
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

function formatDate(value?: string | null) {
  if (!value) return '从未';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function initials(name: string) { return name.trim().slice(0, 1) || '管'; }

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError('');
    const data = new FormData(event.currentTarget);
    try {
      await api.createManagedUser({
        username: String(data.get('username') ?? '').trim(),
        displayName: String(data.get('displayName') ?? '').trim(),
        role: String(data.get('role')) as UserRole,
        password: String(data.get('password') ?? ''),
      });
      onCreated();
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setSubmitting(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal-card compact-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">账号管理</p><h2>新建用户账号</h2></div><button type="button" className="close-button" onClick={onClose}><Cross2Icon /></button></div>
    {error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}
    <div className="form-grid">
      <label className="full">登录账号<input name="username" required maxLength={32} autoComplete="off" placeholder="医患角色填写手机号；管理员可用自定义账号" /></label>
      <label>姓名<input name="displayName" required maxLength={80} placeholder="用户显示名称" /></label>
      <label>角色<select name="role" defaultValue="PATIENT"><option value="PATIENT">患者</option><option value="DOCTOR">医生</option><option value="NUTRITIONIST">营养师</option><option value="ADMIN">管理员</option></select></label>
      <label className="full">初始密码<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="至少 8 位" /></label>
    </div>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={submitting}>{submitting ? '正在创建…' : '创建账号'}</button></div>
  </form></div>;
}

function ResetPasswordModal({ user, onClose, onReset }: { user: ManagedUser; onClose: () => void; onReset: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError('');
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    try { await api.resetManagedUserPassword(user.id, password); onReset(); }
    catch (requestError) { setError(errorText(requestError)); }
    finally { setSubmitting(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal-card compact-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">安全操作</p><h2>重置 {user.displayName} 的密码</h2></div><button type="button" className="close-button" onClick={onClose}><Cross2Icon /></button></div>
    <p className="modal-intro">重置后，该用户当前所有登录会话都会立即失效。</p>
    {error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}
    <label>新密码<input name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" placeholder="至少 8 位" /></label>
    <div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={submitting}>{submitting ? '正在重置…' : '确认重置'}</button></div>
  </form></div>;
}

function AccountActionModal({ user, action, onClose, onConfirm }: { user: ManagedUser; action: AccountAction; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const label = { disable: '停用', enable: '启用', delete: '删除' }[action];
  const description = {
    disable: '停用后，该账号将无法登录，健管师端也不再显示。历史记录会保留，之后可在本页重新启用。',
    enable: '启用后，该账号可以重新登录，并恢复原有的可见范围。',
    delete: '删除后，该账号将无法登录，健管师端也不再显示。历史健康记录、活动记录和操作记录会保留；该账号不能直接恢复。',
  }[action];
  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError('');
    try { await onConfirm(); }
    catch (requestError) { setError(errorText(requestError)); }
    finally { setSubmitting(false); }
  }
  function close() { if (!submitting) onClose(); }
  return <div className="modal-backdrop" onMouseDown={close} onKeyDown={(event) => { if (event.key === 'Escape') close(); }}><form className="modal-card compact-modal" role="dialog" aria-modal="true" aria-labelledby="account-action-title" onSubmit={confirm} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">账号管理</p><h2 id="account-action-title">确认{label}账号？</h2></div><button type="button" className="close-button" aria-label="关闭确认窗口" disabled={submitting} onClick={close}><Cross2Icon /></button></div>
    <div className="account-action-target"><strong>{user.displayName}</strong><span>登录账号：{user.phone}</span><span>角色：{roleLabels[user.role]}</span></div>
    <p className={`modal-intro ${action === 'delete' ? 'account-delete-intro' : ''}`}>{description}</p>
    {error && <div className="form-error" role="alert"><ExclamationTriangleIcon />{error}</div>}
    <div className="modal-actions"><button type="button" disabled={submitting} onClick={close}>取消</button><button className={action === 'delete' ? 'danger' : 'primary'} disabled={submitting}>{submitting ? '正在处理…' : `确认${label}`}</button></div>
  </form></div>;
}

export default function AdminConsole({ user, onLogout }: { user: Practitioner; onLogout: () => Promise<void> }) {
  const [view, setView] = useState<AdminView>('overview');
  const [summary, setSummary] = useState<AdminSummary>();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [logSearch, setLogSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser>();
  const [accountAction, setAccountAction] = useState<{ user: ManagedUser; action: AccountAction }>();

  const title = useMemo(() => ({
    overview: ['管理概览', '掌握用户规模、账号状态与系统操作动态。'],
    users: ['用户管理', '创建账号，调整用户角色、状态与登录凭据。'],
    logs: ['审计日志', '查询后台与业务操作记录，支持责任追溯。'],
    activities: ['元气盏活动', '配置活动与参与人员，不授予健康内容读取权限。'],
  }[view]), [view]);

  function showToast(message: string) { setToast(message); window.setTimeout(() => setToast(''), 2800); }

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [summaryResult, usersResult, logsResult] = await Promise.all([
        api.getAdminSummary(),
        api.listManagedUsers({ search, role, status, pageSize: 100 }),
        api.listAuditLogs({ search: logSearch, pageSize: 100 }),
      ]);
      setSummary(summaryResult); setUsers(usersResult.items); setUserTotal(usersResult.total);
      setLogs(logsResult.items); setLogTotal(logsResult.total);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) await onLogout();
      else setError(errorText(requestError));
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadAll(); }, []);

  async function updateUser(target: ManagedUser, patch: { role?: UserRole; status?: Exclude<UserStatus, 'DELETED'> }) {
    if (target.status === 'DELETED') return;
    setError('');
    try {
      const updated = await api.updateManagedUser(target.id, patch);
      setUsers((items) => items.map((item) => item.id === updated.id ? updated : item));
      const fresh = await api.getAdminSummary(); setSummary(fresh);
      showToast('用户信息已更新');
    } catch (requestError) { setError(errorText(requestError)); }
  }

  async function confirmAccountAction(target: ManagedUser, action: AccountAction) {
    if (target.status === 'DELETED' || (target.id === user.id && action !== 'enable')) return;
    if (action === 'delete') await api.deleteManagedUser(target.id);
    else await api.updateManagedUser(target.id, { status: action === 'disable' ? 'DISABLED' : 'ACTIVE' });
    setAccountAction(undefined);
    showToast(action === 'delete' ? '账号已删除，历史记录已保留' : action === 'disable' ? '账号已停用，健管师端不再显示' : '账号已启用');
    await loadAll();
  }

  const metrics = [
    ['全部用户', summary?.totalUsers ?? '--', '平台注册账号'],
    ['正常账号', summary?.activeUsers ?? '--', '当前可登录'],
    ['停用账号', summary?.disabledUsers ?? '--', '已禁止访问'],
    ['审计记录', summary?.auditLogs ?? '--', '累计操作留痕'],
  ];

  return <div className="app-shell admin-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark"><img src={logoUrl} alt="MedTalent 健康数字助手" /></span><div><b>MedTalent 健康数字助手</b><small>系统管理中心</small></div></div>
    <nav>
      <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}><DashboardIcon /><span>管理概览</span></button>
      <button className={view === 'users' ? 'active' : ''} onClick={() => setView('users')}><PersonIcon /><span>用户管理</span></button>
      <button className={view === 'logs' ? 'active' : ''} onClick={() => setView('logs')}><ReaderIcon /><span>审计日志</span></button>
      <button className={view === 'activities' ? 'active' : ''} onClick={() => setView('activities')}><ReaderIcon /><span>元气盏活动</span></button>
    </nav>
    <div className="sidebar-foot"><i>{initials(user.displayName)}</i><div><b>{user.displayName}</b><small>系统管理员</small></div><button onClick={() => void onLogout()} title="退出登录"><ExitIcon /></button></div>
  </aside><main className="main-content"><header className="topbar"><div><h1>{title[0]}</h1><p>{title[1]}</p></div><div className="top-actions"><span className="role-chip admin-role-chip">管理员</span>{view !== 'activities' && <button className="icon-button" disabled={loading} onClick={() => void loadAll()} title="刷新数据"><ReloadIcon className={loading ? 'spin' : ''} /></button>}</div></header>
    {toast && <div className="toast"><CheckCircledIcon />{toast}</div>}
    {error && view !== 'activities' && <div className="error-banner" role="alert"><ExclamationTriangleIcon /><span>{error}</span><button onClick={() => void loadAll()}><ReloadIcon />重试</button></div>}

    {view === 'activities' && <YuanqizhanActivity user={user} />}
    {view === 'overview' && <>
      <section className="admin-metric-grid">{metrics.map(([label, value, note]) => <article className="panel" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>
      <section className="admin-overview-grid"><article className="panel admin-role-card"><div className="admin-card-head"><div><h2>用户构成</h2><p>按业务角色统计当前账号</p></div></div><div className="role-breakdown">{(Object.keys(roleLabels) as UserRole[]).map((item) => <div key={item}><span className={`role-dot role-${item.toLowerCase()}`} /><b>{roleLabels[item]}</b><strong>{summary?.usersByRole[item] ?? 0}</strong></div>)}</div></article>
      <article className="panel admin-latest"><div className="admin-card-head"><div><h2>最近操作</h2><p>最新 6 条系统审计记录</p></div><button onClick={() => setView('logs')}>查看全部</button></div><div className="audit-list">{logs.slice(0, 6).map((item) => <div key={item.id}><span className="audit-mark" /><div><b>{actionLabels[item.action] ?? item.action}</b><small>{item.actor?.displayName ?? '系统'} · {item.resourceType}</small></div><time>{formatDate(item.createdAt)}</time></div>)}</div></article></section>
    </>}

    {view === 'users' && <section className="panel admin-page-panel"><div className="page-toolbar"><div><h2>全部用户</h2><p>共 {userTotal} 个账号</p></div><button className="primary admin-add-button" onClick={() => setCreateOpen(true)}><PlusIcon />新建账号</button></div>
      <form className="admin-filter" onSubmit={(event) => { event.preventDefault(); void loadAll(); }}><label><MagnifyingGlassIcon /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、账号或邮箱" /></label><select aria-label="筛选角色" value={role} onChange={(event) => setRole(event.target.value as UserRole | '')}><option value="">全部角色</option>{(Object.keys(roleLabels) as UserRole[]).map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select><select aria-label="筛选账号状态" value={status} onChange={(event) => setStatus(event.target.value as UserStatus | '')}><option value="">全部状态</option><option value="ACTIVE">正常</option><option value="DISABLED">已停用</option><option value="DELETED">已删除</option></select><button>查询</button></form>
      <div className="admin-user-table"><div className="admin-user-row admin-table-head"><span>用户</span><span>登录账号</span><span>角色</span><span>状态</span><span>最近登录</span><span>操作</span></div>{users.map((item) => <div className={`admin-user-row ${item.status === 'DELETED' ? 'admin-user-deleted' : ''}`} key={item.id}><span className="admin-user-name"><i>{initials(item.displayName)}</i><b>{item.displayName}<small>{item.status === 'DELETED' && item.deletedAt ? `删除于 ${formatDate(item.deletedAt)}` : item.email || `创建于 ${formatDate(item.createdAt)}`}</small></b></span><span className="mono-cell">{item.phone}</span><span><select aria-label={`${item.displayName}的角色`} value={item.role} disabled={item.id === user.id || item.status === 'DELETED'} onChange={(event) => void updateUser(item, { role: event.target.value as UserRole })}>{(Object.keys(roleLabels) as UserRole[]).map((roleItem) => <option key={roleItem} value={roleItem}>{roleLabels[roleItem]}</option>)}</select></span><span><span className={`status-button ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span></span><span>{formatDate(item.lastLoginAt)}</span><span className="admin-user-actions"><button className="table-action" disabled={item.status === 'DELETED'} onClick={() => setResetUser(item)}>重置密码</button><button className="table-action" disabled={item.id === user.id || item.status === 'DELETED'} title={item.id === user.id ? '不能停用当前登录账号' : undefined} onClick={() => setAccountAction({ user: item, action: item.status === 'ACTIVE' ? 'disable' : 'enable' })}>{item.status === 'DISABLED' ? '启用' : '停用'}</button><button className="table-action danger-action" disabled={item.id === user.id || item.status === 'DELETED'} title={item.id === user.id ? '不能删除当前登录账号' : undefined} onClick={() => setAccountAction({ user: item, action: 'delete' })}>删除</button></span></div>)}</div>
      {!users.length && !loading && <div className="empty-state"><PersonIcon /><b>没有匹配用户</b><p>请调整搜索条件后重试。</p></div>}
    </section>}

    {view === 'logs' && <section className="panel admin-page-panel"><div className="page-toolbar"><div><h2>操作审计</h2><p>共 {logTotal} 条记录</p></div></div><form className="admin-filter" onSubmit={(event) => { event.preventDefault(); void loadAll(); }}><label><MagnifyingGlassIcon /><input value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="搜索动作、资源或操作人" /></label><button>查询</button></form>
      <div className="admin-log-table"><div className="admin-log-row admin-table-head"><span>时间</span><span>操作人</span><span>动作</span><span>资源</span><span>资源 ID</span><span>IP 地址</span></div>{logs.map((item) => <div className="admin-log-row" key={item.id}><time>{formatDate(item.createdAt)}</time><span><b>{item.actor?.displayName ?? '系统'}</b><small>{item.actor ? roleLabels[item.actor.role] : '自动任务'}</small></span><span><em>{actionLabels[item.action] ?? item.action}</em><small>{item.action}</small></span><span>{item.resourceType}</span><span className="mono-cell">{item.resourceId ?? '--'}</span><span className="mono-cell">{item.ipAddress ?? '--'}</span></div>)}</div>
      {!logs.length && !loading && <div className="empty-state"><ReaderIcon /><b>暂无审计记录</b><p>系统操作发生后会自动记录在这里。</p></div>}
    </section>}
  </main>{createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void loadAll(); showToast('用户账号已创建'); }} />}{resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(undefined)} onReset={() => { setResetUser(undefined); void loadAll(); showToast('密码已重置，原会话已失效'); }} />}{accountAction && <AccountActionModal user={accountAction.user} action={accountAction.action} onClose={() => setAccountAction(undefined)} onConfirm={() => confirmAccountAction(accountAction.user, accountAction.action)} />}</div>;
}
