import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root=resolve(import.meta.dirname,'..')
const importText=source=>import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const model=await importText(readFileSync(resolve(root,'src/utils/record-model.js'),'utf8'))
const storage=new Map(), steps=[], requests=[], removed=[]
globalThis.uni={ request(options) { requests.push(options); const step=steps.shift(); assert.ok(step,'unexpected request'); assert.ok(options.url.endsWith(step.path),`${options.url} != ${step.path}`); queueMicrotask(()=>step.fail?options.fail({errMsg:'synthetic network failure'}):options.success({statusCode:step.status??200,data:step.data})) }, getStorageSync:k=>storage.get(k), setStorageSync:(k,v)=>storage.set(k,v), removeStorageSync:k=>{removed.push(k);storage.delete(k)}, reLaunch:()=>{} }
globalThis.__apiTest={...model,getStorage:k=>storage.get(k),showToast:()=>{},showLoading:()=>{},hideLoading:()=>{},generateUploadPath:()=>'',UPLOAD_PATHS:{},getImageUrl:x=>x,resolveMediaFile:async()=>'',setTimeout:()=>{}}
let apiSource=readFileSync(resolve(root,'src/utils/api.js'),'utf8').replace(/^import .*$/gm,'').replace('import.meta.env.VITE_API_BASE_URL',"'http://synthetic.test/api/v1'")
const api=await importText('const {getStorage,showToast,showLoading,hideLoading,generateUploadPath,UPLOAD_PATHS,getImageUrl,normalizeRecordPayload,resolveMediaFile,setTimeout}=globalThis.__apiTest;\n'+apiSource)
const login=()=>{ storage.clear();storage.set('token','synthetic-access');storage.set('refreshToken','synthetic-refresh');storage.set('userInfo',{id:'synthetic-patient',role:'PATIENT'});removed.length=0;requests.length=0 }
login();steps.push({path:'/health-records',status:401,data:{message:'expired'}},{path:'/auth/refresh',fail:true})
await assert.rejects(api.get('/health-records',{}, {loading:false,showError:false}), /刷新失败/)
assert.equal(storage.get('token'),'synthetic-access');assert.deepEqual(removed,[],'network failure must preserve session')
login();steps.push({path:'/health-records',status:401,data:{}},{path:'/auth/refresh',data:{accessToken:'synthetic-fresh',refreshToken:'synthetic-refresh2'}},{path:'/health-records',data:[]})
await api.get('/health-records',{}, {loading:false});assert.equal(requests.at(-1).header.Authorization,'Bearer synthetic-fresh')
login();steps.push({path:'/health-records',status:401,data:{}},{path:'/auth/refresh',status:401,data:{message:'invalid refresh'}})
await assert.rejects(api.get('/health-records',{}, {loading:false,showError:false}));assert.equal(storage.has('token'),false)
login();steps.push({path:'/health-records',status:401,data:{}},{path:'/auth/refresh',data:{accessToken:'synthetic-fresh',refreshToken:'synthetic-refresh2'}},{path:'/health-records',status:403,data:{message:'denied'}})
await assert.rejects(api.get('/health-records',{}, {loading:false,showError:false}),/denied/);assert.equal(storage.get('token'),'synthetic-fresh','resource denial must not log out')
login();steps.push({path:'/health-records',data:{id:'synthetic-diet'}})
await api.createHealthRecord({type:'diet',mealType:'breakfast',note:'虚构文字',mealItems:[{name:'虚构食物'}],imageAssetIds:['synthetic-photo']},{loading:false})
assert.equal(requests.at(-1).data.caloriesKcal,undefined);assert.equal(requests.at(-1).data.mealItems.length,1);assert.equal(requests.at(-1).data.imageAssetIds[0],'synthetic-photo')
login();steps.push({path:'/auth/me',data:{id:'synthetic-patient',role:'PATIENT'}})
let uploadedOptions
uni.uploadFile=options=>{uploadedOptions=options;queueMicrotask(()=>options.success({statusCode:201,data:JSON.stringify({id:'synthetic-upload',mimeType:'image/png'})}))}
const uploaded=await api.upload('/synthetic/original.png',{loading:false,formData:{scope:'FOLLOW_UP',path:'not-accepted',referenceType:'FOLLOW_UP',referenceId:'not-accepted'}})
assert.equal(uploaded.data.id,'synthetic-upload');assert.deepEqual(uploadedOptions.formData,{scope:'FOLLOW_UP'});assert.equal(uploadedOptions.header.Authorization,'Bearer synthetic-access')
login();steps.push({path:'/auth/me',data:{id:'synthetic-patient',role:'PATIENT'}})
uni.uploadFile=options=>{storage.set('userInfo',{id:'synthetic-other',role:'PATIENT'});queueMicrotask(()=>options.success({statusCode:201,data:JSON.stringify({id:'must-ignore'})}))}
await assert.rejects(api.upload('/synthetic/original.png',{loading:false}),/账号已切换/)
const mediaSource=readFileSync(resolve(root,'src/utils/media-access.js'),'utf8')
function targetSource(source,target){let active=true;const levels=[];return source.split('\n').filter(line=>{const match=line.match(/\/\/ #(ifdef|ifndef) (\S+)/);if(match){levels.push(active);active=active&&(match[1]==='ifdef'?match[2]===target:match[2]!==target);return false}if(line.includes('// #endif')){active=levels.pop();return false}return active}).join('\n').replace(/^import .*$/gm,'')}
let mediaUrl='http://synthetic.test/api/v1/media/synthetic-photo/content?sig=synthetic',fetchCalls=0,downloadCalls=0,revoked=[],unlinked=[]
globalThis.__mediaTest={get:async()=>({data:{url:mediaUrl}}),getApiBaseUrl:()=> 'http://synthetic.test/api/v1',getStorage:k=>storage.get(k),fetch:async(url,options)=>{fetchCalls++;assert.equal(options.headers.Authorization,'Bearer synthetic-access');return {ok:true,blob:async()=>({})}},URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:path=>revoked.push(path)}}
const media=await importText('const {get,getApiBaseUrl,getStorage,fetch,URL}=globalThis.__mediaTest;\n'+targetSource(mediaSource,'H5'))
login();const blob=await media.resolveMediaFile('synthetic-photo');assert.equal(blob,'blob:synthetic');media.releaseMediaFile(blob);assert.deepEqual(revoked,['blob:synthetic'])
mediaUrl='https://untrusted.invalid/private';await assert.rejects(media.resolveMediaFile('synthetic-photo'),/受保护/);assert.equal(fetchCalls,1,'credentials must never be sent off-origin')
mediaUrl='http://synthetic.test/api/v1/media/synthetic-photo/content?sig=synthetic';uni.downloadFile=options=>{downloadCalls++;assert.equal(options.header.Authorization,'Bearer synthetic-access');options.success({statusCode:200,tempFilePath:'wxfile://synthetic-download'})};uni.getFileSystemManager=()=>({unlink:({filePath})=>unlinked.push(filePath)})
const native=await importText('const {get,getApiBaseUrl,getStorage}=globalThis.__mediaTest;\n'+targetSource(mediaSource,'MP-WEIXIN'))
const file=await native.resolveMediaFile('synthetic-photo');assert.equal(file,'wxfile://synthetic-download');assert.equal(downloadCalls,1);native.releaseMediaFile(file);native.releaseMediaFile('wxfile://unowned-file');assert.deepEqual(unlinked,['wxfile://synthetic-download'])
console.log('API/session/media tests passed: refresh retry, offline retention, denial isolation, full record fields, upload whitelist/session guard, H5+WeChat Authorization downloads, external origin rejection, owned temporary cleanup.')
