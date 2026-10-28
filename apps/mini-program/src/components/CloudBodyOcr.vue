<template><view class="cloud-panel">
 <text class="cloud-title">人体成分 · 逐图授权云识别</text>
 <text class="cloud-note">{{ policy?.message || '正在核对云识别配置；状态未确认时不能发送。' }}</text>
 <text v-if="policy" class="cloud-note">北京时间每日项目预算 {{ policy.dailyLimitCny }} 元；单次先预占 {{ policy.reservationCny }} 元。未知用量不按免费处理。</text>
 <text v-if="error" class="cloud-error">{{ error }}</text>
 <button @tap="refresh" :disabled="busy">读取授权与调用状态</button>
 <view v-if="staff && policy?.available" class="cloud-create">
  <text class="cloud-note">先在相册裁剪或遮挡姓名、手机号、脸部、签名、条码等无关信息；仅支持一张 PNG / JPEG 人体成分报告，10MB以内。系统剔除图片元数据，不会自动遮挡像素中的身份信息。</text>
  <checkbox-group @change="minimized=$event.detail.value.includes('minimized')"><label class="cloud-check"><checkbox value="minimized" :checked="minimized" />已检查并去除无关身份信息，所选图片仅含当次人体成分报告</label></checkbox-group>
  <text class="cloud-note">人工核对报告当次检测日期</text><picker mode="date" :value="measuredDate" @change="measuredDate=$event.detail.value"><view class="cloud-date">{{ measuredDate || '选择报告上的检测日期' }}</view></picker>
  <button @tap="choose" :disabled="busy || !minimized">选择已处理的单张图片</button>
  <image v-if="selected" :src="selected.path" mode="aspectFit" class="cloud-image" />
  <text v-if="asset" class="cloud-note">原件已上传；重试使用同一附件和请求键，不再次上传。</text>
  <button @tap="prepare" :disabled="busy || !minimized || !measuredDate || (!selected&&!asset)">保存来源并申请客户逐图授权（尚不发送）</button>
 </view>
 <text v-if="!requests.length" class="cloud-note">暂无云识别授权请求；可继续原有上传和手工录入。</text>
 <view v-for="r in requests" :key="r.id" class="cloud-request">
  <text class="cloud-title">{{ stateText(r.state) }}</text><text class="cloud-note">{{ r.model }} · 授权截止 {{ time(r.expiresAt) }} · {{ r.noticeVersion }}</text>
  <button @tap="preview(r)" :disabled="busy">查看该次授权原图</button>
  <view v-if="r.state==='WAITING_AUTH' && !staff">
   <text class="cloud-notice">{{ r.noticeText }}</text>
   <checkbox-group @change="setCheck(r.id,$event)"><label class="cloud-check"><checkbox :value="r.id" :checked="checks[r.id]===true" />我已查看本图及上述处理告知，同意本次发送</label></checkbox-group>
   <button @tap="authorize(r,true)" :disabled="busy || checks[r.id]!==true">同意本图本次云识别</button><button @tap="authorize(r,false)" :disabled="busy">拒绝，继续手工核对</button>
  </view>
  <text v-else-if="staff && r.state==='WAITING_AUTH'" class="cloud-note">客户须在本人账号“健康报告 → 人体成分”查看原图后授权；工作人员不能代为勾选。</text>
  <button v-if="['WAITING_AUTH','APPROVED'].includes(r.state)" @tap="revoke(r)" :disabled="busy">撤回尚未发送的请求</button>
  <button v-if="staff && r.state==='APPROVED'" @tap="run(r)" :disabled="busy || !policy?.available">客户已授权，执行本图一次识别</button>
  <text v-if="r.sentAt" class="cloud-note">{{ r.actualCny===null ? '用量未核实，费用预占保留' : '本项目估计用量费用 '+r.actualCny+' 元' }}；不会自动重复调用。</text>
  <button v-if="staff && ['FAILED','UNKNOWN'].includes(r.state)" @tap="retry(r)" :disabled="busy || !policy?.available">重新申请本图授权后重试</button>
  <button v-if="staff && r.state!=='IN_FLIGHT'" @tap="manual(r)" :disabled="busy">{{ r.state==='SUCCEEDED' ? '读取结果并人工核对' : '读取草稿，改为手工核对' }}</button>
 </view>
 <ProtectedMedia v-if="media" :asset="media" @close="media=null" />
</view></template>
<script>
import ProtectedMedia from './ProtectedMedia.vue'
import { pathId, pickMedia, releaseSelection, uploadSelected } from '../utils/staff-care.js'
import { cloudCall as call } from '../utils/body-cloud-client.js'
const states={WAITING_AUTH:'待客户逐图授权',APPROVED:'客户已授权，尚未发送',DECLINED:'客户已拒绝，未发送',REVOKED:'已撤回，未发送',IN_FLIGHT:'处理中，请读取状态，不要重复发起',SUCCEEDED:'识别草稿待工作人员核对',FAILED:'识别失败，可手工核对',UNKNOWN:'调用用量未核实，费用预占保留',CANCELLED:'发送前取消'}
export default {components:{ProtectedMedia},props:{patientId:{type:String,required:true},staff:{type:Boolean,default:false}},emits:['draft'],data:()=>({policy:null,requests:[],error:'',busy:false,selected:null,asset:null,key:'',minimized:false,measuredDate:'',media:null,checks:{},retryKeys:{},generation:0}),
 watch:{patientId:{immediate:true,handler(){this.clear();this.refresh()}}},beforeUnmount(){this.clear()},
 methods:{
  clear(){this.generation++;this.busy=false;releaseSelection(this.selected);this.selected=null;this.asset=null;this.key='';this.requests=[];this.checks={};this.retryKeys={};this.media=null;this.policy=null;this.error='';this.minimized=false;this.measuredDate=''},
  current(g,pid){if(g!==this.generation||pid!==this.patientId)throw new Error('客户已切换，停止后续提交，请重新读取')},
  stateText(s){return states[s]||'状态未知，请重新读取'},time(v){return new Date(v).toLocaleString()},path(r){return '/body-cloud-ocr/requests/'+pathId(r.id)},
  async operation(fn){if(this.busy)return;this.busy=true;this.error='';const generation=this.generation;try{await fn(generation)}catch(e){if(generation===this.generation)this.error=e.message||'操作失败，请读取状态'}finally{if(generation===this.generation)this.busy=false}},
  refresh(){if(!this.patientId)return;return this.operation(async g=>{const pid=this.patientId,p=await call('get','/body-cloud-ocr/provider');this.current(g,pid);const rows=await call('get','/body-cloud-ocr/patients/'+pathId(pid)+'/requests');this.current(g,pid);this.policy=p;this.requests=Array.isArray(rows)?rows:[]})},
  async reload(g,pid){this.current(g,pid);const rows=await call('get','/body-cloud-ocr/patients/'+pathId(pid)+'/requests');this.current(g,pid);this.requests=Array.isArray(rows)?rows:[]},
  choose(){return this.operation(async g=>{if(!this.minimized)throw new Error('请先检查身份保护');const f=await pickMedia('image');if(g!==this.generation){releaseSelection(f);return}releaseSelection(this.selected);this.selected=f;this.asset=null;this.key='body_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,14)})},
  prepare(){return this.operation(async g=>{const pid=this.patientId,selected=this.selected,key=this.key,date=this.measuredDate,minimized=this.minimized;let asset=this.asset;const policy=await call('get','/body-cloud-ocr/provider');this.current(g,pid);this.policy=policy;if(!policy?.available || !minimized || !date)throw new Error('配置、身份保护或检测日期未确认，不能申请');if(!asset){asset=await uploadSelected(selected);this.current(g,pid);this.asset=asset;}this.current(g,pid);await call('post','/body-cloud-ocr/patients/'+pathId(pid)+'/requests',{mediaAssetId:asset.id,requestKey:key,dataMinimized:true,measuredAt:date+'T00:00:00+08:00'});this.current(g,pid);releaseSelection(selected);this.selected=null;this.asset=null;this.minimized=false;this.measuredDate='';await this.reload(g,pid)})},
  setCheck(id,e){this.checks={...this.checks,[id]:e.detail.value.includes(id)}},
  authorize(r,approved){return this.operation(async g=>{const pid=this.patientId;this.current(g,r.patientId);if(approved&&this.checks[r.id]!==true)throw new Error('请查看原图、告知并确认本次授权');await call('post',this.path(r)+'/authorize',{approved,noticeVersion:r.noticeVersion,noticeSha256:r.noticeSha256,imageSha256:r.imageSha256});this.current(g,pid);this.checks={...this.checks,[r.id]:false};await this.reload(g,pid)})},
  revoke(r){return this.operation(async g=>{const pid=this.patientId;this.current(g,r.patientId);await call('post',this.path(r)+'/revoke',{});await this.reload(g,pid)})},
  run(r){return this.operation(async g=>{const pid=this.patientId;this.current(g,r.patientId);await call('post',this.path(r)+'/run',{});await this.reload(g,pid);const policy=await call('get','/body-cloud-ocr/provider');this.current(g,pid);this.policy=policy})},
  retry(r){return this.operation(async g=>{const pid=this.patientId;this.current(g,r.patientId);const key=this.retryKeys[r.id]||('retry_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,14));this.retryKeys={...this.retryKeys,[r.id]:key};await call('post','/body-cloud-ocr/patients/'+pathId(pid)+'/requests',{draftId:r.draftId,requestKey:key,dataMinimized:true});this.current(g,pid);delete this.retryKeys[r.id];await this.reload(g,pid)})},
  manual(r){return this.operation(async g=>{const pid=this.patientId;this.current(g,r.patientId);if(['WAITING_AUTH','APPROVED'].includes(r.state)){await call('post',this.path(r)+'/revoke',{});this.current(g,pid);}const d=await call('get','/report-workflow/ocr-drafts/'+pathId(r.draftId));this.current(g,pid);this.$emit('draft',d);await this.reload(g,pid)})},
  preview(r){this.media={id:r.mediaAssetId,mimeType:'image/png'}}
 }}
</script>
<style scoped>
.cloud-panel{margin:24rpx 0;padding:24rpx;border:1px solid #cce6f2;border-radius:20rpx;background:#fff;box-sizing:border-box;overflow-wrap:anywhere}.cloud-title{display:block;font-size:30rpx;font-weight:600;color:#173d59}.cloud-note,.cloud-notice{display:block;font-size:26rpx;line-height:1.65;margin:16rpx 0;white-space:pre-wrap}.cloud-notice{padding:20rpx;background:#f0f7fb}.cloud-check{display:flex;align-items:flex-start;line-height:1.6;font-size:26rpx;margin:20rpx 0}.cloud-panel button{font-size:28rpx;min-height:44px;line-height:1.4;height:auto;padding:12px;margin:16rpx 0;display:flex;align-items:center;justify-content:center;white-space:normal;box-sizing:border-box}.cloud-request{border-top:1px solid #dde9ef;margin-top:24rpx;padding-top:24rpx}.cloud-error{display:block;color:#ab2d35;font-size:26rpx;line-height:1.6}.cloud-image{width:100%;height:360rpx}.cloud-date{min-height:44px;border:1px solid #bcd4e2;border-radius:12rpx;padding:16rpx;box-sizing:border-box}
</style>
