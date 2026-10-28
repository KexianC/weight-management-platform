import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const base=process.env.ADMIN_PREVIEW_URL||'http://127.0.0.1:5185';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const modulePath=process.env.PLAYWRIGHT_MODULE||process.env.PATH.split(path.delimiter).map(p=>path.resolve(p,'..','playwright','index.mjs')).find(p=>fs.existsSync(p));
assert.ok(modulePath,'Run through npm exec --package=playwright');
const {chromium}=await import(pathToFileURL(modulePath).href);
const browser=await chromium.launch({headless:true,channel:'msedge'});
const errors=[],checks=[];
const out=path.resolve('output/playwright');fs.mkdirSync(out,{recursive:true});
const expectedHash='055d0cde8d3294b449153383788b10ae3d57ac0dc48d15a6a3c9aa62c6604a02';
assert.equal(createHash('sha256').update(fs.readFileSync('src/assets/medtalent-logo.png')).digest('hex'),expectedHash);
async function screen(name,role,viewport){
  const context=await browser.newContext({viewport});
  if(role)await context.addInitScript(role=>{
    localStorage.setItem('weightcare_access_token','synthetic-logo-preview-only');
    localStorage.setItem('weightcare_user',JSON.stringify({id:'logo-test-staff',displayName:'虚构测试人员',role}));
  },role);
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.startsWith('/api/v1/')){
      const p=url.pathname.slice('/api/v1'.length);
      assert.equal(req.method(),'GET','Logo check must not write business data');
      let value;
      if(p==='/care-management/patients')value=[];
      else if(p==='/admin/summary')value={totalUsers:0,activeUsers:0,disabledUsers:0,auditLogs:0,usersByRole:{}};
      else if(['/admin/users','/admin/audit-logs'].includes(p))value={items:[],total:0,page:1,pageSize:100};
      else{errors.push('Unexpected mock route '+p);return route.abort();}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
    }
    if(url.origin===new URL(base).origin||['data:','blob:'].includes(url.protocol))return route.continue();
    errors.push('External request blocked');return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  if(role==='ADMIN')await page.getByRole('heading',{name:'管理概览',exact:true}).waitFor();
  else if(role)await page.getByRole('heading',{name:'全部客户',exact:true}).waitFor();
  else await page.getByRole('heading',{name:'登录临床管理后台',exact:true}).waitFor();
  const logo=page.getByRole('img',{name:'MedTalent 健康数字助手',exact:true});
  await logo.waitFor({state:'visible'});
  await logo.evaluate(img=>img.decode());
  await page.evaluate(()=>window.scrollTo(0,0));
  const geometry=await logo.evaluate(img=>{
    const box=img.getBoundingClientRect(),parent=img.parentElement.getBoundingClientRect(),css=getComputedStyle(img),parentStyle=getComputedStyle(img.parentElement);
    return {naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,y:box.y,scrollY:window.scrollY,parentY:parent.y,width:box.width,height:box.height,inside:box.left>=parent.left-.1&&box.top>=parent.top-.1&&box.right<=parent.right+.1&&box.bottom<=parent.bottom+.1,objectFit:css.objectFit,transform:css.transform,overflow:parentStyle.overflow,background:parentStyle.backgroundColor,src:img.currentSrc};
  });
  assert.ok(geometry.y>=0,'Logo above viewport: '+JSON.stringify(geometry));
  assert.equal(geometry.naturalWidth,522);assert.equal(geometry.naturalHeight,540);
  assert.equal(geometry.width,40);assert.equal(geometry.height,40);
  assert.equal(geometry.objectFit,'contain');assert.equal(geometry.transform,'none');
  assert.equal(geometry.overflow,'visible');assert.equal(geometry.inside,true);
  assert.equal(geometry.background,'rgba(0, 0, 0, 0)');
  assert.equal(new URL(geometry.src).origin,new URL(base).origin);
  const served=await page.request.get(geometry.src);
  assert.equal(createHash('sha256').update(await served.body()).digest('hex'),expectedHash,'Browser must receive original PNG bytes');
  if(viewport.width>900||!role)await page.getByText('MedTalent 健康数字助手',{exact:true}).waitFor();
  if(role&&viewport.width>900)await page.getByText(role==='ADMIN'?'系统管理中心':'临床管理平台',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal overflow');
  const screenshot='logo-'+name+'.png';
  await page.screenshot({path:path.join(out,screenshot),fullPage:true});
  checks.push({screen:name,screenshot,naturalSize:[522,540],displayBox:[40,40],originalBytes:true,noCropping:true,brandAlt:true});
  await context.close();
}
try{
  await screen('login-desktop',null,{width:1440,height:960});
  await screen('login-mobile',null,{width:390,height:844});
  await screen('care-desktop','HEALTH_MANAGER',{width:1365,height:920});
  await screen('care-tablet','HEALTH_MANAGER',{width:820,height:1000});
  await screen('admin-desktop','ADMIN',{width:1365,height:920});
  assert.deepEqual(errors,[]);
  const result={passed:true,source:'User-confirmed local original PNG',sourceSha256:expectedHash,environment:'Local browser with synthetic read-only route mocks; no production or business writes',checks};
  fs.writeFileSync(path.join(out,'logo-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
