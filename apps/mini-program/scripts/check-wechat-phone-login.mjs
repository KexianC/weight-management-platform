import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve(import.meta.dirname,'..')
const importText=s=>import(`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`)
const storage=new Map(),requests=[],toasts=[],sessions=[],navigations=[]
let response={status:201,data:{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',user:{id:'synthetic-existing-customer',role:'PATIENT',phone:'19900006001'}}},deferred=null
globalThis.uni={request(options){assert.ok(options.url.startsWith('http://synthetic.test/api/v1/'));requests.push(options);const done=()=>options.success({statusCode:response.status,data:response.data});if(deferred)deferred.done=done;else queueMicrotask(done)},getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),reLaunch:()=>{},navigateTo:()=>{}}
globalThis.__phoneApi={getStorage:k=>storage.get(k),showToast:()=>{},showLoading:()=>{},hideLoading:()=>{},UPLOAD_PATHS:{},getImageUrl:x=>x,normalizeRecordPayload:x=>x,resolveMediaFile:()=>{},setTimeout:()=>{}}
const apiSource=readFileSync(resolve(root,'src/utils/api.js'),'utf8').replace(/^import .*$/gm,'').replace('import.meta.env.VITE_API_BASE_URL',"'http://synthetic.test/api/v1'")
const api=await importText('const {getStorage,showToast,showLoading,hideLoading,UPLOAD_PATHS,getImageUrl,normalizeRecordPayload,resolveMediaFile,setTimeout}=globalThis.__phoneApi;\n'+apiSource)
const source=readFileSync(resolve(root,'src/pages/login/login.vue'),'utf8')
assert.ok(source.indexOf('class="login-tabs"')<source.indexOf('field-label">手机号'))
assert.match(source,/open-type="getPhoneNumber"\s+@getphonenumber="handleWechatPhoneLogin"/)
assert.ok(!/bindingRequired|bindToken|handleWechatLogin|getWechatLoginCode|wechat-binding-card/.test(source))
let script=source.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*$/gm,'')
globalThis.__phonePage={Icon:{},login:()=>{},sendSmsCode:()=>{},wechatPhoneLogin:d=>api.wechatPhoneLogin(d,{loading:false,showError:false}),validatePhone:v=>/^1[3-9]\d{9}$/.test(v),showToast:message=>toasts.push(message),setStorage:()=>{},store:{logout(){storage.clear()},login(user,token){sessions.push({user,token})},getUserInfo(){return sessions.at(-1)?.user}},navigateAfterLogin:user=>navigations.push(user),isSupportedMiniRole:u=>u?.backendRole==='PATIENT'}
const page=(await importText('const {Icon,login,sendSmsCode,wechatPhoneLogin,validatePhone,showToast,setStorage,store,navigateAfterLogin,isSupportedMiniRole}=globalThis.__phonePage;\n'+script)).default
function vm(){const v=page.data();for(const[k,fn]of Object.entries(page.methods))v[k]=fn.bind(v);v.agreeToTerms=true;return v}
function reset(){storage.clear();requests.length=0;toasts.length=0;sessions.length=0;navigations.length=0;deferred=null;response={status:201,data:{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',user:{id:'synthetic-existing-customer',role:'PATIENT',phone:'19900006001'}}}}
reset();let view=vm();await view.handleWechatPhoneLogin({detail:{errMsg:'getPhoneNumber:fail user deny'}});assert.equal(requests.length,0);assert.equal(sessions.length,0);assert.equal(navigations.length,0)
reset();view=vm();view.agreeToTerms=false;await view.handleWechatPhoneLogin({detail:{code:'synthetic_phone_code'}});assert.equal(requests.length,0)
reset();const result=await api.wechatPhoneLogin({phoneCode:'synthetic_phone_code',phone:'19900006999',userId:'other',bindToken:'fake',role:'ADMIN',acceptedTerms:true},{loading:false});assert.deepEqual(Object.keys(requests[0].data).sort(),['acceptedTerms','consentVersion','phoneCode']);assert.equal(storage.size,0,'API must not persist before page current-attempt check');assert.equal(result.data.user.userId,'synthetic-existing-customer')
reset();view=vm();await view.handleWechatPhoneLogin({detail:{code:'synthetic_phone_code'}});assert.equal(sessions.length,1);assert.equal(navigations.length,1);assert.equal(storage.get('token'),'synthetic-access');assert.equal(storage.get('refreshToken'),'synthetic-refresh')
reset();view=vm();deferred={};const first=view.handleWechatPhoneLogin({detail:{code:'synthetic_phone_code'}});await view.handleWechatPhoneLogin({detail:{code:'synthetic_phone_code'}});assert.equal(requests.length,1);deferred.done();await first;assert.equal(sessions.length,1)
for(const action of ['mode','role','unload']){reset();view=vm();deferred={};const pending=view.handleWechatPhoneLogin({detail:{code:'synthetic_phone_code'}});if(action==='mode')view.switchLoginType('sms');if(action==='role')view.selectRole('doctor');if(action==='unload')page.onUnload.call(view);deferred.done();await pending;assert.equal(sessions.length,0,action);assert.equal(storage.size,0,action)}
reset();view=vm();response={status:401,data:{code:'PHONE_ACCOUNT_UNAVAILABLE',message:'无法完成账号验证，请联系健康管理师核对已开通账号。'}};await view.handleWechatPhoneLogin({detail:{code:'synthetic_phone_code'}});assert.equal(sessions.length,0);assert.equal(navigations.length,0);assert.equal(storage.size,0);assert.ok(toasts.some(t=>t.includes('健康管理师')))
reset();response={status:201,data:{bindingRequired:true,bindToken:'x'.repeat(43),expiresInSeconds:300}};await assert.rejects(api.wechatPhoneLogin({phoneCode:'synthetic_phone_code',acceptedTerms:true},{loading:false}));assert.equal(storage.size,0)
await assert.rejects(api.wechatLogin({code:'legacy'}),/手机号/);await assert.rejects(api.wechatRegister({code:'legacy'}),/健康管理师/)
console.log('Single-step phone-login fixture checks PASS: native-button/source order, cancel/consent, payload whitelist, no early storage, success, double-click, stale mode/role/unload, unavailable account, old binding response refusal. No network/provider/real account.')
