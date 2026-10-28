import React,{useEffect,useRef,useState} from 'react';
import {api} from './api';
import {careApi} from './care-api';
import {CareMedia} from './ManagedCare';
type Grant={id:string;draftId:string;mediaAssetId:string;state:string;noticeText:string;expiresAt:string;actualCny:number|null;sentAt?:string};
type Policy={available:boolean;message:string;dailyLimitCny:number;reservationCny:number;timezone:string};
type Scope={id:string;alive:boolean};
export function CloudBodyOcr({id,onDraft}:{id:string;onDraft:(id:string)=>void}){
 const [policy,setPolicy]=useState<Policy>(),[rows,setRows]=useState<Grant[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[minimized,setMinimized]=useState(false);
 const uploaded=useRef<{file:File;assetId:string;key:string}|undefined>(undefined),retryKeys=useRef<Record<string,string>>({}),scope=useRef<Scope>({id,alive:true});
 const prefix='/body-cloud-ocr',patient=prefix+'/patients/'+encodeURIComponent(id)+'/requests',path=(r:Grant)=>prefix+'/requests/'+encodeURIComponent(r.id);
 const isCurrent=(owner:Scope)=>owner.alive&&scope.current===owner&&owner.id===id;
 function guard(owner:Scope){if(!isCurrent(owner))throw Error('客户或账号已切换，停止后续提交');}
 async function reload(owner:Scope){
  guard(owner);const p=await api.request<Policy>(prefix+'/provider');guard(owner);
  const list=await api.request<Grant[]>(patient);guard(owner);setPolicy(p);setRows(list);
 }
 useEffect(()=>{
  const owner={id,alive:true};scope.current=owner;uploaded.current=undefined;retryKeys.current={};setRows([]);setPolicy(undefined);setError('');setMinimized(false);
  reload(owner).catch(e=>{if(isCurrent(owner))setError(e.message)});
  return()=>{owner.alive=false;};
 },[id]);
 async function action(fn:(current:()=>void)=>Promise<void>){
  if(busy)return;const owner=scope.current;guard(owner);setBusy(true);setError('');
  try{await fn(()=>guard(owner));guard(owner);await reload(owner);}
  catch(e){if(isCurrent(owner))setError(e instanceof Error?e.message:'操作失败，请读取状态');}
  finally{if(isCurrent(owner))setBusy(false);}
 }
 async function prepare(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();const form=e.currentTarget,data=new FormData(form),file=data.get('file') as File,accepted=minimized;
  await action(async current=>{
   const p=await api.request<Policy>(prefix+'/provider');current();if(!p.available||!accepted)throw Error('云配置或身份保护未确认，不能申请');
   if(!file||!['image/png','image/jpeg'].includes(file.type)||file.size>10*1024*1024)throw Error('仅支持10MB以内单张PNG/JPEG人体成分报告');
   if(!uploaded.current||uploaded.current.file!==file){const asset=await careApi.upload(file,'image');current();uploaded.current={file,assetId:asset.id,key:crypto.randomUUID().replaceAll('-','')};}
   current();await api.request(patient,{method:'POST',body:{mediaAssetId:uploaded.current.assetId,requestKey:uploaded.current.key,dataMinimized:true,measuredAt:new Date(String(data.get('date'))).toISOString()}});
   current();uploaded.current=undefined;form.reset();setMinimized(false);
  });
 }
 async function revoke(r:Grant){await action(async current=>{await api.request(path(r)+'/revoke',{method:'POST',body:{}});current();});}
 async function run(r:Grant){await action(async current=>{await api.request(path(r)+'/run',{method:'POST',body:{}});current();});}
 async function retry(r:Grant){await action(async current=>{
  retryKeys.current[r.id]??=crypto.randomUUID().replaceAll('-','');const key=retryKeys.current[r.id];
  await api.request(patient,{method:'POST',body:{draftId:r.draftId,requestKey:key,dataMinimized:true}});current();delete retryKeys.current[r.id];
 });}
 async function manual(r:Grant){await action(async current=>{
  if(['WAITING_AUTH','APPROVED'].includes(r.state)){await api.request(path(r)+'/revoke',{method:'POST',body:{}});current();}
  current();onDraft(r.draftId);
 });}
 const labels:Record<string,string>={WAITING_AUTH:'待客户逐图授权',APPROVED:'客户已授权，尚未发送',DECLINED:'客户已拒绝',REVOKED:'已撤回',IN_FLIGHT:'处理中，不自动重试',SUCCEEDED:'草稿待人工核对',FAILED:'识别失败，可手工录入',UNKNOWN:'用量未知，费用预占保留'};
 return <section className="panel care-panel">
  <h3>人体成分 · 逐图授权云识别</h3><p>{policy?.message||'正在核对提供商及预算；状态未确认时不能发送。'}</p>
  {policy&&<p>北京时间每日本项目预算 {policy.dailyLimitCny} 元，单次预占 {policy.reservationCny} 元；不等同阿里云账号账单硬限额。</p>}
  {error&&<p role="alert">{error}</p>}<button disabled={busy} onClick={()=>void action(async()=>{})}>读取授权与调用状态</button>
  {policy?.available&&<form key={id} onSubmit={prepare}><fieldset disabled={busy}>
   <legend>保存单图来源（尚不发送）</legend><p>先裁剪或遮盖姓名、手机号、脸部、签名、条码等无关信息。系统会剔除元数据，不会自动遮挡图片中的身份信息。</p>
   <label><input type="checkbox" checked={minimized} onChange={e=>setMinimized(e.target.checked)}/>已检查身份保护，仅含当次人体成分报告</label>
   <label>人工核对当次检测日期<input name="date" type="datetime-local" required/></label>
   <label>单张PNG/JPEG，10MB以内<input name="file" type="file" accept="image/png,image/jpeg" required onChange={()=>{uploaded.current=undefined}}/></label>
   <button disabled={!minimized}>保存并申请客户本人授权</button>
  </fieldset></form>}
  {rows.map(r=><article className="care-record" key={r.id}>
   <h4>{labels[r.state]||r.state}</h4><small>授权截止 {new Date(r.expiresAt).toLocaleString()}</small>
   <details><summary>本次处理告知与原图</summary><p>{r.noticeText}</p><CareMedia id={r.mediaAssetId}/></details>
   {r.state==='WAITING_AUTH'&&<p>客户需在本人小程序“健康报告 → 人体成分”授权；工作人员不能代为同意。</p>}
   {['WAITING_AUTH','APPROVED'].includes(r.state)&&<button disabled={busy} onClick={()=>void revoke(r)}>撤回尚未发送请求</button>}
   {r.state==='APPROVED'&&<button disabled={busy||!policy?.available} onClick={()=>void run(r)}>客户已授权，执行一次识别</button>}
   {r.sentAt&&<p>{r.actualCny===null?'用量未核实，预占保留':'按用量估计 '+r.actualCny+' 元'}；不会自动再次调用。</p>}
   {['FAILED','UNKNOWN'].includes(r.state)&&<button disabled={busy||!policy?.available} onClick={()=>void retry(r)}>重新申请该图授权后重试</button>}
   {r.state!=='IN_FLIGHT'&&<button disabled={busy} onClick={()=>void manual(r)}>{r.state==='SUCCEEDED'?'读取结果并人工核对':'改为手工核对草稿'}</button>}
  </article>)}
  {!rows.length&&<p>暂无云识别请求，原有手工录入可继续使用。</p>}
 </section>;
}
