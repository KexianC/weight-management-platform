import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:5185';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Only local preview URLs are allowed');
const modulePath = process.env.PLAYWRIGHT_MODULE || process.env.PATH.split(path.delimiter).map(p => path.resolve(p,'..','playwright','index.mjs')).find(p => fs.existsSync(p));
if (!modulePath) throw new Error('Run with npm exec --package=playwright -- node scripts/check-managed-care.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors=[]; const evidence=path.resolve('output/playwright'); fs.mkdirSync(evidence,{recursive:true});
const checks=[];
function fixture(role) {
  return {patient:{id:'client-fixture',displayName:['NUTRITIONIST','EXERCISE_COACH'].includes(role)?'KH-FIXTURE':'虚构客户甲',...(['NUTRITIONIST','EXERCISE_COACH'].includes(role)?{}:{phone:'13800000001'})},
    enrollment:{id:'enrollment-fixture',patientId:'client-fixture',clientCode:'KH-FIXTURE',packageName:'虚构管理套餐',nutritionistId:'nutrition-fixture',doctorId:'doctor-fixture',exerciseCoachId:'coach-fixture',healthManagerId:'staff-fixture',createdAt:'2026-10-01T00:00:00Z'},
    lifestyle:{sleepHours:7.5,activityLevel:'LOW',mealsPerDay:3,smoking:'NEVER',alcohol:'NEVER',sedentaryHours:8,waterMl:1600},
    bodyReports:[],posturePhotos:[],exerciseReports:[{id:'report-fixture',patientId:'client-fixture',assessment:'虚构评估：动作控制稳定',precautions:'按舒适节奏训练',createdAt:'2026-10-12T00:00:00Z',items:[{videoId:'video-fixture',actionName:'坐姿抬腿',sets:3,reps:10,tempo:'抬起2秒放下3秒',restSeconds:45,frequency:'每周3次',videoTitle:'坐姿抬腿',mediaAssetId:'video-media-fixture',durationSeconds:30}],shares:[]}]};
}
async function scenario(role, viewport={width:1365,height:920}, outsideAssignment=false,mode='') {
  const context=await browser.newContext({viewport});
  const legacy={patient:{id:'legacy-fixture',displayName:'虚构历史客户乙',phone:'13800000002'},enrollment:null,legacyAccount:true,lifestyle:null,bodyReports:[],exerciseReports:[],posturePhotos:[]};let workbenchUnavailable=mode==='workbench-retry';
  const client=fixture(role);if(outsideAssignment)client.enrollment.healthManagerId='different-manager-fixture';const requests=[];let draft;const documents=[];let shareAttempts=0;const reviews=[{id:'review-1',comment:'第一条虚构点评',createdAt:'2026-10-12T01:00:00Z',practitioner:{id:'nutrition-fixture',displayName:'虚构营养师',role:'NUTRITIONIST'},replies:[{id:'reply-1',comment:'这是虚构客户回复',createdAt:'2026-10-12T02:00:00Z',authorRole:'PATIENT'}]}];
  await context.addInitScript(role=>{localStorage.setItem('weightcare_access_token','fixture-token-never-real');localStorage.setItem('weightcare_user',JSON.stringify({id:'staff-fixture',displayName:'虚构测试人员',role}));},role);
  await context.route('**/*',async route=>{
    const request=route.request();const url=new URL(request.url());
    if(url.pathname.startsWith('/api/v1/')){
      let p=url.pathname.slice('/api/v1'.length);const method=request.method();let body;
      if(request.headers()['content-type']?.includes('application/json')) body=request.postDataJSON();
      requests.push({p,query:url.search,method,body,authorization:request.headers().authorization});
      const answer=data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      if(p==='/care-management/patients/legacy-fixture')return answer(legacy);
      p=p.replace('/patients/legacy-fixture','/patients/client-fixture');
      if(p==='/care-management/workbench'){
        if(workbenchUnavailable)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构待办加载失败'})});
        return answer({asOf:'2026-10-12T00:00:00Z',date:'2026-10-12',timezone:'Asia/Shanghai',counts:{pendingDietReviews:1,pendingPlans:1,pendingSummaries:1,dueRechecks:0},queues:{pendingDietReviews:[{patientId:client.patient.id,clientCode:'KH-FIXTURE',recordId:'meal-fixture',measuredAt:'2026-10-12T00:00:00Z'}],pendingPlans:[{patientId:client.patient.id,clientCode:'KH-FIXTURE'}],pendingSummaries:[{patientId:client.patient.id,clientCode:'KH-FIXTURE',periodType:'WEEKLY',periodStart:'2026-10-12T00:00:00Z'}],dueRechecks:[]},definitions:{pendingDietReviews:'今日提交且本人尚未点评的饮食记录',pendingPlans:'目前没有有效饮食方案的已分配客户',pendingSummaries:'本周尚未发布周总结的已分配客户',dueRechecks:'今日结束前应随访且尚未完成（含逾期）'}});
      }
      if(p==='/report-workflow/patients/client-fixture/health-reports')return answer([]);
      if(p==='/media/upload')return answer({id:'upload-fixture'});
      if(p==='/report-workflow/patients/client-fixture/ocr-drafts'){draft={id:'draft-fixture',status:'UNCONFIGURED',fields:{},sourceKind:body.sourceKind,updatedAt:'2026-10-12T00:00:00Z',simulated:false,message:'真实 OCR 尚未配置，可手工填写并核对。',mediaAssetId:'upload-fixture'};return answer(draft);}
      if(p==='/report-workflow/ocr-drafts/draft-fixture'&&method==='PATCH'){assert.equal(body.expectedUpdatedAt,draft.updatedAt);draft={...draft,status:'DRAFT',fields:body.fields,measuredAt:body.measuredAt,updatedAt:'2026-10-12T00:01:00Z'};return answer(draft);}
      if(p==='/report-workflow/ocr-drafts/draft-fixture/confirm'){assert.equal(body.reviewed,true);assert.equal(body.expectedUpdatedAt,draft.updatedAt);draft.status='CONFIRMED';const report={id:'ocr-body-fixture',measuredAt:draft.measuredAt,...Object.fromEntries(Object.entries(draft.fields).map(([key,field])=>[key,field.value]))};client.bodyReports.unshift(report);return answer({confirmed:true,bodyAssessmentId:report.id,report});}
      if(p==='/report-workflow/ocr-drafts/draft-fixture')return answer(draft);
      if(p==='/report-workflow/patients/client-fixture/consent-documents'){if(method==='GET')return answer(documents);const document={id:'consent-fixture',version:body.version,mediaAssetId:body.mediaAssetId,createdAt:'2026-10-12T00:00:00Z'};documents.push(document);return answer(document);}
      if(p==='/care-management/patients'&&method==='GET')return answer(mode==='legacy-only'?[legacy]:mode==='mixed'?[client,legacy]:[client]);
      if(p==='/care-management/staff')return answer({nutritionists:[{id:'nutrition-fixture',displayName:'虚构营养师'}],doctors:[{id:'doctor-fixture',displayName:'虚构医生'}],exerciseCoaches:[{id:'coach-fixture',displayName:'虚构运动老师'}]});
      if(p==='/care-management/patients'&&method==='POST')return answer({...client,credentials:{account:'13800000001',initialPassword:'Synthetic-only!123',role:'PATIENT'}});
      if(p==='/clinical/patients/client-fixture/records'){const records=[{id:'weight-fixture',recordType:'WEIGHT',measuredAt:'2026-10-12T00:00:00Z',weightKg:61.5,waistCm:82,hipCm:96},{id:'sleep-fixture',recordType:'SLEEP',measuredAt:'2026-10-12T00:00:00Z',sleepHours:7.5},{id:'exercise-fixture',recordType:'EXERCISE',measuredAt:'2026-10-12T00:00:00Z',payload:{activity:'虚构步行',durationMinutes:20,passwordHash:'NEVER_RENDER_FIXTURE_SECRET',nested:{accessToken:'NEVER_RENDER_FIXTURE_TOKEN',businessNote:'虚构业务说明'}}},...Array.from({length:29},(_,i)=>({id:'old-'+i,recordType:'WEIGHT',measuredAt:'2026-01-01T00:00:00Z',note:'较早的虚构历史记录'+(i+4),weightKg:62}))];const filtered=records.filter(r=>!url.searchParams.get('recordType')||r.recordType===url.searchParams.get('recordType'));const page=Number(url.searchParams.get('page')??1),pageSize=Number(url.searchParams.get('pageSize')??30);return answer({items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize,hasMore:page*pageSize<filtered.length});}
      if(p==='/clinical/patients/client-fixture/archive')return answer({id:'archive-fixture',patientId:'client-fixture',status:'DRAFT',templateVersion:'TCM_WEIGHT_V1',completionPercent:10,answers:{occupation:'TEACHER',heightCm:168,passwordHash:'NEVER_RENDER_FIXTURE_SECRET'}});
      if(p==='/clinical/patients/client-fixture')return answer({...client.patient,tasks:[{id:'task-fixture',title:'虚构健康任务',description:'测试用任务说明',status:'PENDING'}]});
      if(p==='/clinical/patients/client-fixture/diet-plans')return answer([{id:'plan-fixture',title:'虚构历史饮食方案',status:'ACTIVE',startsAt:'2026-10-01T00:00:00Z'}]);
      if(p==='/clinical/patients/client-fixture/care-summaries')return answer([]);
      if(p==='/follow-ups')return answer({items:[{id:'followup-fixture',patientId:'client-fixture',scheduledAt:'2026-10-12T00:00:00Z',status:'PENDING'}],total:1});
      if(p==='/care-management/patients/client-fixture')return answer(client);
      if(p==='/care-management/patients/client-fixture/body-reports'){const r={id:'body-fixture',...body};client.bodyReports.unshift(r);return answer(r);}
      if(p==='/care-management/videos')return answer([{id:'video-fixture',title:'坐姿抬腿',durationSeconds:30,mediaAssetId:'video-media-fixture',createdAt:'2026-10-12T00:00:00Z'}]);
      if(p==='/nutrition/patients/client-fixture/records')return answer({items:[{id:'meal-fixture',measuredAt:'2026-10-12T00:00:00Z',mealType:'BREAKFAST',note:'虚构早餐',caloriesKcal:350,imageAssetIds:['meal-image-fixture'],reviews}],total:1,page:1,pageSize:30});
      if(p.endsWith('/records/meal-fixture/review')){const r={id:'review-'+(reviews.length+1),comment:body.comment,createdAt:'2026-10-12T03:00:00Z',replies:[]};reviews.push(r);return answer(r);}
      if(p==='/media/meal-image-fixture/url')return answer({url:'http://127.0.0.1:3300/api/v1/media/meal-image-fixture/content?sig=fixture'});
      if(p==='/media/meal-image-fixture/content')return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKb8AAAAASUVORK5CYII=','base64')});
      if(p==='/care-management/exercise-reports/report-fixture/share'&&method==='POST'){if(shareAttempts++===0)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'虚构网络错误，请重试'})});const share={id:'share-fixture',expiresAt:'2099-01-01T00:00:00Z',url:'https://patient.example/#/report?token=fixture',path:'/report',delivery:'SIMULATED_IN_APP',notificationId:'notification-fixture'};client.exerciseReports[0].shares=[share];return answer(share);}
      if(p==='/care-management/exercise-reports/report-fixture/share/share-fixture'&&method==='DELETE'){client.exerciseReports[0].shares[0].revokedAt='2026-10-12T04:00:00Z';return answer({revoked:true});}
      if(p==='/care-management/patients/client-fixture/exercise-reports'){client.exerciseReports.unshift({id:'report-new',...body,createdAt:'2026-10-12T05:00:00Z',shares:[]});return answer(client.exerciseReports[0]);}
      if(p==='/report-workflow/ocr/provider')return answer({provider:'disabled',status:'UNCONFIGURED',message:'真实 OCR 尚未配置',photoRecognitionConfigured:false,sendsToThirdParty:false});
      if(p==='/auth/logout')return answer({});
      errors.push('Unexpected API request: '+method+' '+p);return route.fulfill({status:501,contentType:'application/json',body:JSON.stringify({message:'Unmocked test route'})});
    }
    if(url.origin===new URL(base).origin || ['data:','blob:'].includes(url.protocol))return route.continue();
    errors.push('Blocked external request: '+url.origin);return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByRole('heading',{name:role==='HEALTH_MANAGER'?'全部客户':'我的客户',exact:true}).waitFor();
  return {page,context,requests,client,recoverWorkbench:()=>{workbenchUnavailable=false;}};
}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'horizontal overflow');}
try {
  const h=await scenario('HEALTH_MANAGER',{width:390,height:844});
  await noOverflow(h.page);await h.page.getByRole('button',{name:'＋ 客户建档',exact:true}).click();
  await h.page.getByLabel('姓名',{exact:true}).fill('虚构客户甲');await h.page.getByLabel('手机号',{exact:true}).fill('13800000001');await h.page.getByLabel('购买套餐').fill('虚构管理套餐');
  await h.page.getByLabel('负责营养师').selectOption('nutrition-fixture');await h.page.getByLabel('归属医生').selectOption('doctor-fixture');await h.page.locator('select[name="exerciseCoachId"]').selectOption('coach-fixture');
  for(const [name,value] of [['每日睡眠（小时）','7.5'],['每日久坐（小时）','8'],['每日饮水（mL）','1600'],['每日餐数','3']])await h.page.getByLabel(name,{exact:true}).fill(value);
  await h.page.getByLabel('活动水平').selectOption('LOW');await h.page.getByLabel('吸烟情况').selectOption('NEVER');await h.page.getByLabel('饮酒情况').selectOption('NEVER');
  await h.page.getByRole('button',{name:'确认建档',exact:true}).click();await h.page.getByRole('heading',{name:'客户建档成功'}).waitFor();
  const enroll=h.requests.find(r=>r.p==='/care-management/patients'&&r.method==='POST');
  assert.equal(enroll.body.lifestyle.sleepHours,7.5);assert.equal(enroll.body.exerciseCoachId,'coach-fixture');
  assert.equal(await h.page.evaluate(()=>JSON.stringify(localStorage).includes('Synthetic-only')),false);
  await h.page.getByRole('button',{name:'进入客户档案'}).click();await h.page.getByRole('button',{name:'体测指标',exact:true}).click();
  await h.page.getByLabel('体重（kg）',{exact:true}).fill('60');await h.page.getByLabel('腰围（cm）',{exact:true}).fill('82');await h.page.getByLabel('臀围（cm）',{exact:true}).fill('96');await h.page.getByLabel('骨骼肌量（kg）',{exact:true}).fill('25.5');
  await h.page.getByRole('button',{name:'生成待复核草稿'}).click();assert.equal(h.requests.filter(r=>r.p.endsWith('/body-reports')).length,0);
  await h.page.getByRole('button',{name:'复核无误，保存报告'}).click();await h.page.getByRole('heading',{name:'历史指标'}).waitFor();
  await h.page.getByRole('button',{name:'复核无误，保存报告',exact:true}).waitFor({state:'hidden'});
  await h.page.getByText('25.5 kg',{exact:true}).waitFor();
  assert.equal(h.requests.find(r=>r.p.endsWith('/body-reports')).body.hipCm,96);
  await h.page.getByRole('button',{name:'上传来源并手工录入',exact:true}).waitFor();
  await h.page.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='上传来源并手工录入');return button&&!button.closest('fieldset').disabled;});
  await h.page.locator('input[type="file"]').setInputFiles({name:'synthetic-report.png',mimeType:'image/png',buffer:Buffer.from('synthetic image fixture')});
  await h.page.getByRole('button',{name:'上传来源并手工录入'}).click();
  const ocrGroup=h.page.getByRole('group',{name:'逐项核对数值与单位'});
  await ocrGroup.getByLabel('当次检测时间').fill('2026-01-01T12:00');
  await ocrGroup.getByLabel('体重（kg）',{exact:false}).fill('61.5');
  assert.equal(await h.page.getByRole('button',{name:'确认入库为正式体测报告'}).isDisabled(),true);
  await ocrGroup.getByRole('button',{name:'保存人工修订'}).click();
  await h.page.getByLabel('已逐项核对原报告、检测日期、数值及单位').check();
  assert.equal(h.requests.filter(r=>r.p.endsWith('/confirm')).length,0);
  await h.page.getByRole('button',{name:'确认入库为正式体测报告'}).click();
  await h.page.getByText('61.5 kg',{exact:true}).waitFor();
  await h.page.getByRole('button',{name:'知情书照片',exact:true}).click();
  await h.page.getByLabel('文件版本').fill('v1.0');await h.page.locator('input[type="file"]').setInputFiles({name:'synthetic-consent.png',mimeType:'image/png',buffer:Buffer.from('synthetic consent fixture')});
  await h.page.getByRole('button',{name:'上传并留档'}).click();await h.page.getByRole('heading',{name:'知情书 · v1.0'}).waitFor();
  await h.page.getByText('照片仅用于资料留档，不代表电子签署或身份认证。',{exact:true}).waitFor();
  checks.push('Disabled OCR truthfully shown; manual draft edit uses expectedUpdatedAt; explicit review required; consent photo archive');
  await h.page.getByRole('button',{name:'体测指标',exact:true}).click();
  await noOverflow(h.page);await h.page.screenshot({path:path.join(evidence,'managed-care-mobile.png'),fullPage:true});checks.push('HM onboarding, memory-only credential, manual report review, cm/kg, 390px layout');await h.context.close();
  const n=await scenario('NUTRITIONIST',undefined,false,'workbench-retry');
  await n.page.getByText('虚构待办加载失败',{exact:true}).waitFor();
  assert.equal(await n.page.locator('.care-workflows button').count(),0);
  n.recoverWorkbench();await n.page.getByRole('button',{name:'刷新待办',exact:true}).click();
  await n.page.getByRole('button',{name:'待餐食点评 · 1',exact:false}).waitFor();
  for(const title of ['待饮食方案 · 1','待阶段总结 · 1','待复查 · 0'])await n.page.getByRole('button',{name:title,exact:false}).click();
  await n.page.getByText('当前暂无待复查。',{exact:true}).waitFor();
  await n.page.getByRole('button',{name:'待餐食点评 · 1',exact:false}).click();
  await n.page.screenshot({path:path.join(evidence,'managed-care-desktop.png'),fullPage:true});
  await n.page.getByRole('button',{name:'进入处理',exact:true}).click();assert.equal(await n.page.getByRole('button',{name:'知情书照片',exact:true}).count(),0);assert.equal(await n.page.getByRole('button',{name:'体态照片',exact:true}).count(),0);
  await n.page.getByRole('button',{name:'餐食点评',exact:true}).click();await n.page.getByText('这是虚构客户回复',{exact:true}).waitFor();
  await n.page.getByRole('button',{name:'查看照片',exact:true}).click();await n.page.locator('.care-media img').waitFor();assert.equal(n.requests.find(r=>r.p.endsWith('/content')).authorization,'Bearer fixture-token-never-real');
  await n.page.getByLabel('新增点评').fill('第二条虚构点评');await n.page.getByRole('button',{name:'追加点评并通知客户'}).click();await n.page.getByText('第二条虚构点评',{exact:true}).waitFor();await n.page.getByText('第一条虚构点评',{exact:true}).waitFor();
  await n.page.getByRole('button',{name:'运动处方',exact:true}).click();const send=n.page.getByRole('button',{name:'发送到客户应用内'});assert.equal(await send.isDisabled(),true);
  await n.page.getByLabel('已核对运动评估、动作、节奏、组次及注意事项').check();await n.page.getByLabel('有效期').selectOption('14');await send.click();await n.page.getByText('虚构网络错误，请重试',{exact:true}).waitFor();assert.equal(await n.page.getByRole('button',{name:'复制分享链接'}).count(),0);await send.click();
  await n.page.getByRole('button',{name:'复制分享链接'}).waitFor();
  await n.page.getByText('已记录模拟应用内发送；未发送真实客户消息',{exact:false}).waitFor();
  const sendRequests=n.requests.filter(r=>r.p.endsWith('/share')&&r.method==='POST');assert.equal(sendRequests.length,2);assert.equal(sendRequests[0].body.idempotencyKey,sendRequests[1].body.idempotencyKey);assert.equal(sendRequests[0].body.reviewed,true);assert.equal(n.requests.find(r=>r.p.endsWith('/share')&&r.method==='POST').body.expiresInDays,14);
  await n.page.getByRole('button',{name:'撤销分享',exact:true}).click();await n.page.getByText('已撤销',{exact:false}).waitFor();
  await noOverflow(n.page);checks.push('N anonymous response rendering, appended comments/replies, authenticated meal image, review gate, 14-day share and revoke');await n.context.close();
  checks.push('Server workbench failure/retry, four queue counts, empty state and direct meal navigation');
  const c=await scenario('EXERCISE_COACH');await c.page.locator('.care-client-card').first().click();await c.page.getByRole('button',{name:'运动处方',exact:true}).click();await c.page.getByRole('button',{name:'新建运动处方'}).click();
  await c.page.getByLabel('运动评估',{exact:true}).fill('虚构评估：按耐受程度训练');await c.page.getByLabel('跟练视频').selectOption('video-fixture');await c.page.getByLabel('动作节奏',{exact:true}).fill('抬起2秒，放下3秒');await c.page.getByLabel('训练频率',{exact:true}).fill('每周3次');await c.page.getByRole('button',{name:'提交营养师复核'}).click();await c.page.getByText('虚构评估：按耐受程度训练',{exact:false}).waitFor();
  const report=c.requests.find(r=>r.p.endsWith('/exercise-reports')&&r.method==='POST');assert.equal(report.body.items[0].tempo,'抬起2秒，放下3秒');assert.equal(c.requests.filter(r=>r.p.endsWith('/share')).length,0);
  checks.push('Coach version draft sends to nutrition review only');await c.context.close();
  const hm=await scenario('HEALTH_MANAGER',undefined,true);await hm.page.locator('.care-client-card').first().click();
  assert.equal(await hm.page.getByRole('button',{name:'保存服务分配'}).count(),0);
  await hm.page.getByRole('button',{name:'全部业务记录',exact:true}).click();await hm.page.getByText('7.5 小时',{exact:true}).waitFor();
  await hm.page.getByText('查看记录详情',{exact:true}).click();await hm.page.getByText('虚构步行',{exact:false}).waitFor();
  assert.equal((await hm.page.locator('body').innerText()).includes('NEVER_RENDER'),false);
  await hm.page.getByRole('button',{name:'电子档案',exact:true}).click();await hm.page.getByText('教师',{exact:true}).waitFor();
  await hm.page.getByRole('button',{name:'客户任务',exact:true}).click();await hm.page.getByText('虚构健康任务',{exact:true}).waitFor();
  await hm.page.getByRole('button',{name:'餐食点评',exact:true}).click();await hm.page.getByText('这是虚构客户回复',{exact:true}).waitFor();assert.equal(await hm.page.getByLabel('新增点评').count(),0);
  await hm.page.getByRole('button',{name:'饮食方案',exact:true}).click();await hm.page.getByText('虚构历史饮食方案',{exact:false}).waitFor();assert.equal(await hm.page.getByRole('button',{name:'确认下发方案'}).count(),0);
  await hm.page.getByRole('button',{name:'阶段总结',exact:true}).click();assert.equal(await hm.page.getByRole('button',{name:'发布并通知客户'}).count(),0);
  await hm.page.getByRole('button',{name:'复查安排',exact:true}).click();assert.equal(await hm.page.getByRole('button',{name:'创建复查安排'}).count(),0);
  await hm.page.getByRole('button',{name:'体测指标',exact:true}).click();assert.equal(await hm.page.getByRole('button',{name:'生成待复核草稿'}).count(),0);
  await hm.page.getByRole('button',{name:'知情书照片',exact:true}).click();assert.equal(await hm.page.getByRole('button',{name:'上传并留档'}).count(),0);
  assert.equal(hm.requests.some(r=>r.method!=='GET'),false);assert.equal(hm.requests.some(r=>r.p==='/diet-plan-templates'),false);
  checks.push('HM cross-assignment business records, archive, tasks, replies and plans are read-only; no writes or auth-secret rendering');await hm.context.close();

  for(const mode of ['legacy-only','mixed']){
    const legacy=await scenario('HEALTH_MANAGER',{width:390,height:844},false,mode);
    await legacy.page.getByText('历史客户 · 未建立服务档案',{exact:true}).waitFor();
    assert.equal(await legacy.page.locator('.care-client-card').count(),mode==='mixed'?2:1);
    await legacy.page.getByLabel('查找客户',{exact:true}).fill('13800000002');
    assert.equal(await legacy.page.locator('.care-client-card').count(),1);
    await legacy.page.locator('.care-client-card').first().click();
    await legacy.page.getByRole('heading',{name:'虚构历史客户乙',exact:true}).waitFor();
    await legacy.page.getByText('尚无生活习惯问卷。',{exact:true}).waitFor();
    assert.equal(await legacy.page.getByRole('button',{name:'保存服务分配'}).count(),0);
    assert.equal(await legacy.page.getByRole('button',{name:'补发初始登录信息'}).count(),0);
    for(const tab of ['体测指标','健康报告','体态照片','知情书照片','运动处方']){
      await legacy.page.getByRole('button',{name:tab,exact:true}).click();
      assert.equal(await legacy.page.locator('.managed-care input[type="file"]').count(),0);
      assert.equal(await legacy.page.getByRole('button',{name:'生成待复核草稿'}).count(),0);
    }
    await legacy.page.getByRole('button',{name:'全部业务记录',exact:true}).click();
    await legacy.page.getByText('共 32 条记录 · 第 1 / 2 页',{exact:true}).waitFor();
    await legacy.page.getByRole('button',{name:'下一页',exact:true}).click();
    await legacy.page.getByText('较早的虚构历史记录31',{exact:true}).waitFor();
    assert.equal(await legacy.page.getByRole('button',{name:'下一页',exact:true}).isDisabled(),true);
    await legacy.page.getByLabel('记录类型',{exact:true}).selectOption('SLEEP');
    await legacy.page.getByText('共 1 条记录 · 第 1 / 1 页',{exact:true}).waitFor();
    await legacy.page.getByText('7.5 小时',{exact:true}).waitFor();
    assert.equal(await legacy.page.getByRole('button',{name:'上一页',exact:true}).isDisabled(),true);
    assert.equal(legacy.requests.some(r=>r.method!=='GET'),false);
    assert.equal(legacy.requests.some(r=>r.p==='/care-management/staff'),false);
    await noOverflow(legacy.page);
    await legacy.page.screenshot({path:path.join(evidence,'managed-care-'+mode+'.png'),fullPage:true});
    if(mode==='mixed'){
      await legacy.page.locator('.care-breadcrumb').getByRole('button',{name:'服务工作台',exact:true}).click();
      await legacy.page.getByLabel('查找客户',{exact:true}).fill('KH-FIXTURE');
      await legacy.page.locator('.care-client-card').first().click();
      await legacy.page.getByRole('button',{name:'保存服务分配',exact:true}).waitFor();
      await legacy.page.getByRole('button',{name:'体测指标',exact:true}).click();
      await legacy.page.getByRole('button',{name:'生成待复核草稿',exact:true}).waitFor();
    }
    checks.push(mode+': null enrollment renders/searches/opens all read-only tabs; historical pagination/filter reset; original assigned writes retained');
    await legacy.context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'managed-care-results.json'),JSON.stringify({passed:true,environment:'Browser route mocks only; no API or DB writes',checks},null,2));
  console.log(JSON.stringify({passed:true,checks,evidence},null,2));
} catch(error) { console.error('Browser page/request errors:',JSON.stringify(errors)); const page=browser.contexts().at(-1)?.pages().at(-1);if(page)await page.screenshot({path:path.join(evidence,'managed-care-failure.png'),fullPage:true}).catch(()=>{});throw error; } finally {await browser.close();}

