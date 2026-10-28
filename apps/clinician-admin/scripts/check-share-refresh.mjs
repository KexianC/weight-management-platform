import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// Usage: node scripts/check-share-refresh.mjs --cli /absolute/path/to/playwright-cli.js
// A real React/browser interaction test with synthetic HTTP responses only.
// No account fixture, credentials, environment file or production service is used.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = process.argv[process.argv.indexOf('--cli') + 1];
assert.ok(process.argv.includes('--cli') && cliPath, 'Pass an installed offline Playwright CLI with --cli');
const browserName = process.argv.includes('--browser') ? process.argv[process.argv.indexOf('--browser') + 1] : 'chrome';
const executablePath = process.argv.includes('--executable') ? process.argv[process.argv.indexOf('--executable') + 1] : undefined;
const staticDir = process.argv.includes('--static-dir') ? path.resolve(process.argv[process.argv.indexOf('--static-dir') + 1]) : undefined;
const output = path.join(appRoot, 'output/playwright/' + (staticDir ? 'share-refresh-live-static' : 'share-refresh'));
await fs.mkdir(output, { recursive: true });
const base = 'http://127.0.0.1:5197';
const apiOrigin = staticDir ? 'http://127.0.0.1:3371' : base;
const fixtureId = '\0share-refresh-fixture.js';
const server = await createServer({
  root: staticDir || appRoot, configFile: false, envDir: false,
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(base + '/api/v1') },
  plugins: staticDir ? [] : [react(), {
    name: 'synthetic-share-refresh-fixture',
    resolveId(id) { if (id === 'virtual:share-refresh-fixture') return fixtureId; },
    load(id) {
      if (id !== fixtureId) return;
      return `import React from 'react';import{createRoot}from'react-dom/client';import ManagedCare from '/src/ManagedCare.tsx';
        localStorage.setItem('weightcare_access_token','synthetic-local-component-fixture');
        const role=new URLSearchParams(location.search).get('role')||'NUTRITIONIST';
        createRoot(document.getElementById('root')).render(React.createElement(ManagedCare,{user:{id:'synthetic-staff',role,displayName:'合成测试人员'}}));`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/') return next();
        const html = await vite.transformIndexHtml(req.url, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>本地分享状态交互验证</title><div id="root"></div><script type="module" src="/@id/virtual:share-refresh-fixture"></script></html>');
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5197, strictPort: true },
});
const exec = promisify(execFile);
const session = `share-refresh-${process.pid}`;
const cli = async (...args) => (await exec(process.execPath, [path.resolve(cliPath), `-s=${session}`, ...args], { cwd: appRoot, timeout: 60000, maxBuffer: 1024 * 1024 })).stdout;
const runner = path.join(output, 'interactions.js');
const screenshot = path.join(output, 'share-refreshed.png');
const failureScreenshot = path.join(output, 'failure.png');
const browserConfig = path.join(output, 'browser-config.json');
if (executablePath) await fs.writeFile(browserConfig, JSON.stringify({ browser: { browserName: 'chromium', isolated: true, launchOptions: { executablePath: path.resolve(executablePath), headless: true } } }));
await fs.writeFile(runner, `async page => {
  const base=${JSON.stringify(base)};
  const apiOrigin=${JSON.stringify(apiOrigin)};
  const staticMode=${Boolean(staticDir)};
  const checks=[], unexpected=[], errors=[], posts=[];
  let reads=0, failNextShare=true, revoked=false;
  let report={id:'synthetic-report-v2',patientId:'synthetic-patient',version:2,assessment:'合成运动评估',createdAt:'2026-10-20T02:00:00Z',publishedAt:null,items:[{videoId:'synthetic-video',actionName:'合成深蹲',sets:3,reps:8,tempo:'下蹲3秒起身2秒',restSeconds:60,frequency:'每周3次'}],shares:[]};
  const historical={...report,id:'synthetic-report-v1',version:1,publishedAt:'2026-10-19T02:00:00Z',shares:[{id:'synthetic-history-share',expiresAt:'2099-01-01T00:00:00Z',revokedAt:'2026-10-20T01:00:00Z'}]};
  const client=()=>({patient:{id:'synthetic-patient',displayName:'KH-SYNTHETIC'},enrollment:null,exerciseReports:[report,historical]});
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  if(staticMode)await page.addInitScript(()=>{
    localStorage.setItem('weightcare_access_token','synthetic-local-component-fixture');
    localStorage.setItem('weightcare_user',JSON.stringify({id:'synthetic-staff',displayName:'合成测试人员',role:new URLSearchParams(location.search).get('role')||'NUTRITIONIST'}));
  });
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==base&&url.origin!==apiOrigin){unexpected.push(url.origin);return route.abort();}
    if(!url.pathname.startsWith('/api/v1/')){if(url.origin===base)return route.continue();unexpected.push(url.origin+url.pathname);return route.abort();}
    const p=url.pathname.slice('/api/v1'.length),method=request.method();
    const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type,accept','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'},body:JSON.stringify(body)});
    if(method==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Headers':'authorization,content-type,accept','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}});
    if(method==='GET'&&p==='/care-management/patients')return reply([client()]);
    if(method==='GET'&&p==='/care-management/workbench')return reply({asOf:'2026-10-21T02:00:00Z',date:'2026-10-21',timezone:'Asia/Shanghai',definitions:{},counts:{pendingDietReviews:0,pendingPlans:0,pendingSummaries:0,dueRechecks:0},queues:{pendingDietReviews:[],pendingPlans:[],pendingSummaries:[],dueRechecks:[]}});
    if(method==='GET'&&p==='/care-management/patients/synthetic-patient'){reads++;return reply(client());}
    if(method==='POST'&&p==='/care-management/exercise-reports/synthetic-report-v2/share'){
      const body=request.postDataJSON();posts.push(body);
      if(failNextShare){failNextShare=false;return reply({message:'合成可重试失败'},503);}
      const share={id:'synthetic-current-share',expiresAt:'2099-01-01T00:00:00Z',url:base+'/synthetic-share',path:'/synthetic-share',delivery:'SIMULATED_IN_APP',notificationId:'synthetic-notification'};
      report={...report,publishedAt:'2026-10-21T02:00:00Z',shares:[share]};return reply(share,201);
    }
    if(method==='DELETE'&&p==='/care-management/exercise-reports/synthetic-report-v2/share/synthetic-current-share'){
      revoked=true;report={...report,shares:report.shares.map(s=>({...s,revokedAt:'2026-10-21T03:00:00Z'}))};return reply({revoked:true});
    }
    unexpected.push(method+' '+p);return reply({message:'Unexpected synthetic request'},500);
  });
  async function open(role){
    await page.goto(base+'/?role='+role);
    await page.locator('.care-client-card').click();
    await page.getByRole('button',{name:'运动处方',exact:true}).click();
    await page.locator('.care-record').filter({has:page.getByRole('heading',{name:/第 2 版/})}).waitFor();
  }
  const current=()=>page.locator('.care-record').filter({has:page.getByRole('heading',{name:/第 2 版/})});
  try{
    await open('NUTRITIONIST');
    const send=()=>current().getByRole('button',{name:'发送到客户应用内',exact:true});
    assert(await send().isDisabled(),'Review is required');
    assert(await current().locator('.care-tag').innerText()==='待营养师复核','Initial badge');
    checks.push('Unchecked review prevents sending');
    await current().getByRole('checkbox').check();
    await send().click();
    await page.getByRole('alert').filter({hasText:'合成可重试失败'}).waitFor();
    assert(reads===1,'Failed share must not refresh the parent');
    assert(posts.length===1,'One POST on failed attempt');
    assert(await current().locator('.care-tag').innerText()==='待营养师复核','Failed share must not mark sent');
    checks.push('Rejected share preserves pending badge, error and retry');
    await send().click();
    await current().locator('.care-tag').filter({hasText:'已发送'}).waitFor({timeout:5000});
    assert(reads===2,'Successful share refreshes exactly once');
    assert(posts.length===2,'No automatic duplicate POST during refresh');
    assert(posts[0].idempotencyKey&&posts[0].idempotencyKey===posts[1].idempotencyKey,'Retry preserves idempotency key');
    assert(posts.every(p=>p.expiresInDays===7&&p.reviewed===true),'Review and duration contract preserved');
    assert(await current().getByText('分享有效',{exact:false}).count()===1,'Current share not duplicated');
    assert(await page.getByRole('heading',{name:/第 1 版/}).count()===1,'Historical revision preserved');
    assert(await page.getByText('已撤销',{exact:false}).count()===1,'Historical revoked share preserved');
    checks.push('Success refreshes parent badge without manual refresh or duplicate POST; retry key and history preserved');
    await page.screenshot({path:${JSON.stringify(screenshot)},fullPage:true});
    await current().getByRole('button',{name:'撤销分享',exact:true}).click();
    await current().getByText('已撤销',{exact:false}).waitFor();
    assert(revoked&&reads===3,'Revoke refreshes parent');
    assert(posts.length===2,'Revoke and refresh do not resend');
    assert(await page.evaluate(()=>sessionStorage.getItem('medtalent:share:synthetic-staff:synthetic-report-v2:7'))===null,'Revoke clears share retry key');
    checks.push('Revoke preserves history, clears retry key and refreshes without POST');
    for(const role of ['DOCTOR','EXERCISE_COACH']){
      await open(role);
      assert(await page.getByRole('button',{name:'发送到客户应用内',exact:true}).count()===0,'Only nutritionist can share');
    }
    checks.push('Doctor and coach do not expose nutritionist share control');
    assert(unexpected.length===0,'No unexpected or external requests');
    assert(errors.length===0,'No uncaught browser errors');
    return {marker:'SHARE_REFRESH_PASS',passed:true,checks,sharePostCount:posts.length,clientGetCount:reads,environment:staticMode?'Exact public PC runtime + four-byte callback repair + loopback API substitution; localhost synthetic HTTP mock only':'localhost React component + synthetic HTTP mock; no login or production access'};
  }catch(error){await page.screenshot({path:${JSON.stringify(failureScreenshot)},fullPage:true});throw new Error(error.message+'; browserErrors='+JSON.stringify(errors)+'; unexpected='+JSON.stringify(unexpected));}
}`);
try {
  await server.listen();
  await cli('open', ...(executablePath ? ['--config', browserConfig] : [`--browser=${browserName}`]));
  const result = await cli('run-code', '--filename', runner);
  await fs.writeFile(path.join(output, 'results.txt'), result);
  assert.ok(result.includes('SHARE_REFRESH_PASS'), 'Browser interaction checks failed; see output/playwright/share-refresh/results.txt');
  console.log(result);
} catch (error) {
  await fs.writeFile(path.join(output, 'results.txt'), error.stdout || error.message);
  throw new Error('Local browser checks did not pass; see output/playwright/share-refresh/results.txt');
} finally {
  await cli('close').catch(() => {});
  await server.close();
}
