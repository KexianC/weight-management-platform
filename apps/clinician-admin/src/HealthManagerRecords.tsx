import React, { useState } from 'react';
import { api } from './api';
import { CareError, CareMedia, useCareResource } from './ManagedCare';
import { archiveSections } from './archive-schema';
import { formatDateTime } from './model';
import { careApi } from './care-api';

const kinds=[['','全部类型'],['WEIGHT','体重'],['DIET','饮食'],['EXERCISE','运动'],['SLEEP','睡眠'],['MEDICATION','用药'],['QUESTIONNAIRE','问卷'],['GENERAL','综合'],['BLOOD_PRESSURE','血压'],['SYMPTOM','症状']] as const;
const metrics=[['weightKg','体重','kg'],['waistCm','腰围','cm'],['hipCm','臀围','cm'],['bodyFatPct','体脂率','%'],['sleepHours','睡眠','小时'],['caloriesKcal','热量','kcal']] as const;
// Business payloads are JSON, but authentication metadata is never a display field.
export function businessPayload(value:unknown):unknown {
  if(value===null||['string','number','boolean'].includes(typeof value))return value;
  if(Array.isArray(value))return value.map(businessPayload);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/password|passphrase|token|secret|credential|api.?key|authorization|cookie|session|private.?key|password.?hash/i.test(key)).map(([key,item])=>[key,businessPayload(item)]));
  return undefined;
}
export default function HealthManagerRecords({id}:{id:string}) {
  const [tab,setTab]=useState<'records'|'archive'|'tasks'>('records');
  return <section className="panel care-panel"><h2>全部业务记录 · 只读</h2><p>健管师可跨服务分配查看客户业务资料；此页面不提供修改、删除或批量导出。</p><nav className="care-tabs" aria-label="业务记录分类">{([['records','健康记录'],['archive','电子档案'],['tasks','客户任务']] as const).map(([value,label])=><button key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}>{label}</button>)}</nav>{tab==='records'&&<RecordList id={id}/>} {tab==='archive'&&<ArchiveReadOnly id={id}/>} {tab==='tasks'&&<TasksReadOnly id={id}/>}</section>;
}
function RecordList({id}:{id:string}) {
  const [kind,setKind]=useState('');const [page,setPage]=useState(1);const resource=useCareResource('manager-records:'+id+':'+kind+':'+page,()=>careApi.records(id,page,kind));
  return <><div className="care-section-head"><label>记录类型<select aria-label="记录类型" value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}>{kinds.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><button disabled={resource.loading} onClick={resource.reload}>刷新记录</button></div><CareError message={resource.error}/>{resource.loading&&<p>正在读取业务记录…</p>}{resource.data&&<p role="status">共 {resource.data.total} 条记录 · 第 {resource.data.page} / {Math.max(1,Math.ceil(resource.data.total/resource.data.pageSize))} 页</p>}{resource.data?.items.map(r=><article className="care-record" key={r.id}><div className="care-section-head"><h3>{kinds.find(([key])=>key===r.recordType)?.[1]??r.recordType}</h3><time>{formatDateTime(r.measuredAt)}</time></div><dl className="care-metrics">{metrics.filter(([key])=>r[key]!=null).map(([key,label,unit])=><div key={key}><dt>{label}</dt><dd>{r[key]} {unit}</dd></div>)}</dl>{r.note&&<p className="care-prewrap">{r.note}</p>}{r.mealItems?.length?<ul>{r.mealItems.map((item,i)=><li key={i}>{item.name}{item.weightGrams!=null?' · '+item.weightGrams+' g':''}{item.caloriesKcal!=null?' · '+item.caloriesKcal+' kcal':''}</li>)}</ul>:null}{r.payload&&<details><summary>查看记录详情</summary><pre className="care-payload">{JSON.stringify(businessPayload(r.payload),null,2)}</pre></details>}<div className="care-photo-grid">{[...new Set([...(r.imageAssetIds??[]),...(r.assets??[]).map(a=>a.id)])].map(assetId=><CareMedia key={assetId} id={assetId} video={r.assets?.find(a=>a.id===assetId)?.mimeType?.startsWith('video/')} />)}</div>{r.reviews?.map(review=><div className="care-comment" key={review.id}><small>{review.practitioner?.displayName??'工作人员'} · {formatDateTime(review.createdAt)}</small><p>{review.comment}</p>{review.replies?.map(reply=><blockquote key={reply.id}><small>客户回复 · {formatDateTime(reply.createdAt)}</small><p>{reply.comment}</p></blockquote>)}</div>)}</article>)}{resource.data?.items.length===0&&<p className="care-empty">暂无此类业务记录。</p>}<nav className="care-actions" aria-label="健康记录分页"><button disabled={resource.loading||page===1} onClick={()=>setPage(p=>p-1)}>上一页</button><button disabled={resource.loading||!resource.data?.hasMore} onClick={()=>setPage(p=>p+1)}>下一页</button></nav></>;
}
function ArchiveReadOnly({id}:{id:string}) {
  const resource=useCareResource('manager-archive:'+id,()=>api.getPatientArchive(id));
  return <><CareError message={resource.error}/>{resource.error&&<button onClick={resource.reload}>重试读取档案</button>}{resource.loading&&<p>正在读取电子档案…</p>}{resource.data===null&&<p className="care-empty">尚无电子档案。</p>}{resource.data&&<><p>档案编号：{resource.data.archiveNo??'未提供'} · {resource.data.status==='COMPLETED'?'已完成':'草稿'}</p>{archiveSections.map(section=>{const fields=section.fields.filter(f=>resource.data?.answers[f.key]!=null&&resource.data.answers[f.key]!=='');if(!fields.length)return null;return <article className="care-record" key={section.id}><h3>{section.title}</h3><dl className="care-metrics">{fields.map(field=>{const raw=resource.data?.answers[field.key];const values=Array.isArray(raw)?raw:[raw];return <div key={field.key}><dt>{field.label}</dt><dd className="care-archive-value">{values.map(value=>field.options?.find(o=>o.value===value)?.label??String(value)).join('、')}{field.unit?' '+field.unit:''}</dd></div>;})}</dl></article>;})}</>}</>;
}
function TasksReadOnly({id}:{id:string}) {
  const resource=useCareResource('manager-tasks:'+id,()=>api.getPatient(id));
  return <><CareError message={resource.error}/>{resource.error&&<button onClick={resource.reload}>重试读取任务</button>}{resource.loading&&<p>正在读取任务…</p>}{resource.data?.receivedTasks.map(task=><article className="care-record" key={task.id}><h3>{task.title}</h3><p>{({PENDING:'待完成',IN_PROGRESS:'进行中',COMPLETED:'已完成',CANCELLED:'已取消'} as Record<string,string>)[task.status]??task.status}</p><p className="care-prewrap">{task.description}</p><small>{task.dueAt?'截止 '+formatDateTime(task.dueAt):'无截止日期'}</small></article>)}{resource.data?.receivedTasks.length===0&&<p className="care-empty">暂无客户任务。</p>}</>;
}

