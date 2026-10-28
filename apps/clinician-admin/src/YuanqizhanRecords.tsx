import React, { useState } from 'react';
import { activityRecordsApi, type ActivityDailyRecord, type ActivityQuestion, type ActivityRecordPage, type PatientActivity } from './activity-records-api';
import { CareError, CareMedia, useCareResource } from './ManagedCare';
import { formatDateTime } from './model';
import './yuanqizhan-records.css';

const photoSlots = [
  ['tongue_coating', '舌苔照片'], ['tongue_underside', '舌底照片'], ['face', '面部照片'],
  ['body_front', '体态正面照片'], ['body_side', '体态侧面照片'], ['body_back', '体态背面照片'],
] as const;
const questionLabel = (question: { key: string; label?: string; labelOriginal?: string }) => question.label || question.labelOriginal || question.key;
const scalar = (value: unknown): string => value === null || value === undefined || value === '' ? '未填写'
  : typeof value === 'boolean' ? value ? '是' : '否' : typeof value === 'string' || typeof value === 'number' ? String(value) : '未提供可读内容';

export function activityAnswer(question: ActivityQuestion, value: unknown): string {
  if (question.subfields?.length) {
    const fields = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    return question.subfields.map(field => `${questionLabel(field)}：${scalar(fields[field.key])}`).join('\n');
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map(item => {
    const option = question.options?.find(candidate => String(candidate.value) === String(item));
    const label = option?.label ?? scalar(item);
    return !option && question.unit && item !== null && item !== undefined && item !== '' ? `${label} ${question.unit}` : label;
  }).join('、');
}

export function YuanqizhanRecordView({ record }: { record: ActivityDailyRecord }) {
  // Use the saved question snapshot and current access notice. Identity fields are
  // not a display field for a nutritionist, even if an older response includes one.
  const questions = (record.form?.questions ?? []).filter(question => question.key !== 'name' && question.type !== 'file_upload');
  const photos = photoSlots.filter(([slot]) => typeof record.photos?.[slot] === 'string' && record.photos[slot]);
  return <article className="care-record yq-record-detail" aria-label="元气盏打卡详情">
    <div className="care-section-head"><div><h3>{record.date} · Day {record.dayNumber}</h3><p>{record.form?.title ?? (record.formType === 'milestone' ? '阶段打卡' : '日常打卡')}{record.groupLabel ? ` · ${record.groupLabel}` : ''}</p></div><span className="care-tag">{record.status === 'SUBMITTED' ? '已完成打卡' : '草稿 · 尚未完成'}</span></div>
    <p className="care-muted">{record.submittedAt ? `提交于 ${formatDateTime(record.submittedAt)}` : '尚未提交'}{record.updatedAt ? ` · 更新于 ${formatDateTime(record.updatedAt)}` : ''}</p>
    {record.accessNotice && <p className="care-notice">{record.accessNotice}</p>}
    {questions.length ? <dl className="yq-record-answers">{questions.map(question => <div key={question.key}><dt>{questionLabel(question)}</dt><dd>{activityAnswer(question, record.answers?.[question.key])}</dd></div>)}</dl> : <p className="care-empty">此记录暂无可显示的问卷内容。</p>}
    <h3>本次打卡照片</h3><div className="care-photo-grid">{photos.map(([slot, fallback]) => <section className="yq-record-photo" key={slot}><h4>{record.form?.questions?.find(question => question.key === slot)?.label ?? fallback}</h4><CareMedia key={record.photos[slot]} id={record.photos[slot]} /></section>)}</div>
    {!photos.length && <p className="care-muted">本次记录未附照片。</p>}
  </article>;
}

function Pagination({ data, page, loading, label, onPage }: { data?: ActivityRecordPage<unknown>; page: number; loading: boolean; label: string; onPage: (page: number) => void }) {
  return <nav className="care-actions yq-record-pagination" aria-label={`${label}分页`}>
    <button disabled={loading || page === 1} onClick={() => onPage(page - 1)}>上一页{label}</button>
    {data && <span role="status">共 {data.total} 条 · 第 {data.page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span>}
    <button disabled={loading || !data?.hasMore} onClick={() => onPage(page + 1)}>下一页{label}</button>
  </nav>;
}

function RecordDetail({ patientId, activityId, date, onBack }: { patientId: string; activityId: string; date: string; onBack: () => void }) {
  const resource = useCareResource(`yuanqizhan-detail:${patientId}:${activityId}:${date}`, () => activityRecordsApi.record(activityId, patientId, date));
  return <><div className="care-section-head"><button onClick={onBack}>返回打卡列表</button><button disabled={resource.loading} onClick={resource.reload}>刷新本日记录</button></div><CareError message={resource.error} />{resource.error && <button onClick={resource.reload}>重试读取本日打卡</button>}{resource.loading && <p role="status">正在读取 {date} 的打卡内容…</p>}{resource.data && <YuanqizhanRecordView record={resource.data} />}</>;
}

function ActivityHistory({ patientId, activity }: { patientId: string; activity: PatientActivity }) {
  const [page, setPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState('');
  const resource = useCareResource(`yuanqizhan-records:${patientId}:${activity.id}:${page}`, () => activityRecordsApi.records(activity.id, patientId, page));
  if (selectedDate) return <RecordDetail key={selectedDate} patientId={patientId} activityId={activity.id} date={selectedDate} onBack={() => setSelectedDate('')} />;
  return <><div className="care-section-head"><h3>每日打卡记录</h3><button disabled={resource.loading} onClick={resource.reload}>刷新打卡记录</button></div><CareError message={resource.error} />{resource.error && <button onClick={resource.reload}>重试读取打卡记录</button>}{resource.loading && <p role="status">正在读取每日打卡记录…</p>}
    <div className="yq-record-list">{resource.data?.items.map(record => <article className="care-record care-section-head" key={record.id}><div><h3>{record.date} · Day {record.dayNumber}</h3><p>{record.formType === 'milestone' ? '阶段打卡' : '日常打卡'}{record.groupLabel ? ` · ${record.groupLabel}` : ''}</p><span className="care-tag">{record.status === 'SUBMITTED' ? '已完成打卡' : '草稿 · 尚未完成'}</span>{record.submittedAt && <p className="care-muted">提交于 {formatDateTime(record.submittedAt)}</p>}</div><button onClick={() => setSelectedDate(record.date)} aria-label={`查看 ${record.date} 打卡详情`}>查看详情</button></article>)}</div>
    {resource.data?.items.length === 0 && <p className="care-empty">此活动尚无保存的打卡记录。</p>}
    <Pagination data={resource.data} page={page} loading={resource.loading} label="记录" onPage={setPage} />
  </>;
}

export default function YuanqizhanRecords({ patientId }: { patientId: string }) {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const resource = useCareResource(`yuanqizhan-activities:${patientId}:${page}`, () => activityRecordsApi.activities(patientId, page));
  const activity = resource.data?.items.find(item => item.id === selectedId) ?? resource.data?.items[0];
  return <section className="panel care-panel yq-records" aria-label="客户元气盏打卡记录"><div className="care-section-head"><div><h2>元气盏打卡</h2><p>查看客户的每日回答和阶段照片，草稿尚未完成打卡。</p></div><button disabled={resource.loading} onClick={resource.reload}>刷新活动</button></div>
    <CareError message={resource.error} />{resource.error && <button onClick={resource.reload}>重试读取参与活动</button>}{resource.loading && <p role="status">正在读取客户参与的活动…</p>}
    {resource.data?.items.length === 0 && <p className="care-empty">此客户暂无可查看的元气盏活动。</p>}
    {activity && <><label className="yq-record-activity">选择活动<select aria-label="选择元气盏活动" value={activity.id} onChange={event => setSelectedId(event.target.value)}>{resource.data?.items.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status === 'ENDED' ? '已结束' : '进行中'}{item.member.status === 'REMOVED' ? ' · 已退出' : ''}</option>)}</select></label>
      <p className="care-muted">{activity.member.startDate ? `开始日期：${activity.member.startDate}` : '待首次完成打卡后开始个人周期'}{activity.member.groupLabel ? ` · ${activity.member.groupLabel}` : ''}{activity.completedCount !== undefined ? ` · 已完成 ${activity.completedCount} 次打卡` : ''}</p>
      {activity.accessNotice && <p className="care-notice">{activity.accessNotice}</p>}
      <ActivityHistory key={`${patientId}:${activity.id}`} patientId={patientId} activity={activity} />
    </>}
    {resource.data && (resource.data.hasMore || page > 1) && <Pagination data={resource.data} page={page} loading={resource.loading} label="活动" onPage={next => { setSelectedId(''); setPage(next); }} />}
  </section>;
}
