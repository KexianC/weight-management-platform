import React, { useState } from 'react';
import { careApi, type WorkbenchQueue } from './care-api';
import { CareError, useCareResource } from './ManagedCare';
import { formatDateTime } from './model';

const queues = [
  { key: 'pendingDietReviews', title: '待餐食点评', section: 'nutrition' },
  { key: 'pendingPlans', title: '待饮食方案', section: 'plans' },
  { key: 'pendingSummaries', title: '待阶段总结', section: 'summaries' },
  { key: 'dueRechecks', title: '待复查', section: 'followups' },
] as const;
export default function NutritionWorkbench({ userId, onOpen }: { userId: string; onOpen: (id: string, section: string) => void }) {
  const resource = useCareResource('workbench:' + userId, () => careApi.workbench());
  const [selected, setSelected] = useState<WorkbenchQueue>('pendingDietReviews');
  const current = queues.find(q => q.key === selected)!;
  return <section className="panel care-panel" aria-label="营养管理待办">
    <div className="care-section-head"><div><h2>每日服务待办</h2>{resource.data && <p>{resource.data.date} · 上海时间 · 更新于 {new Date(resource.data.asOf).toLocaleString('zh-CN', { timeZone: resource.data.timezone, hour12: false })}</p>}</div><button onClick={resource.reload} disabled={resource.loading}>刷新待办</button></div>
    <CareError message={resource.error} />
    {resource.loading && <p role="status">正在读取待办队列…</p>}
    {resource.error && <p>待办暂时无法读取，请重试；也可从下方客户档案进入业务页面。</p>}
    {resource.data && <>
      <div className="care-workflows">{queues.map(q => <button key={q.key} aria-pressed={selected === q.key} className={selected === q.key ? 'selected' : ''} onClick={() => setSelected(q.key)}><b>{q.title} · {resource.data!.counts[q.key]}</b><span>{resource.data!.definitions[q.key]}</span></button>)}</div>
      <h3>{current.title}</h3><p>{resource.data.definitions[selected]}</p>
      <div className="care-queue">{resource.data.queues[selected].map((item, index) => <div className="care-record care-section-head" key={item.recordId ?? item.followUpId ?? item.patientId + ':' + index}><div><b>{item.clientCode ?? '客户编号未提供'}</b>{(item.measuredAt || item.scheduledAt) && <p>{formatDateTime((item.measuredAt ?? item.scheduledAt)!)}</p>}{item.periodType === 'WEEKLY' && <p>本周阶段总结</p>}</div><button onClick={() => onOpen(item.patientId, current.section)}>进入处理</button></div>)}</div>
      {!resource.data.queues[selected].length && <p className="care-empty">当前暂无{current.title}。</p>}
    </>}
  </section>;
}
