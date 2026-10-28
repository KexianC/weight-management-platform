<template><view class="role-page">
  <text class="role-title">报告与资料</text><text v-if="client" class="role-hint">{{ client.enrollment?.clientCode || '历史客户' }} · {{ writable ? '本人负责，可新增资料' : '只读资料' }}</text>
  <text v-if="error" class="role-error">{{ error }}</text><text v-if="notice" class="role-success">{{ notice }}</text>
  <view v-for="category in categories" :key="category.value" class="role-panel"><text class="role-section">{{ category.label }}原件</text>
    <view v-for="f in files.filter(x=>x.category===category.value)" :key="f.id"><text class="role-text">{{ f.title }} · {{ day(f.createdAt) }}</text><button @tap="preview(f)">{{ f.mimeType==='application/pdf' ? '查看授权PDF' : '查看授权原图' }}</button></view>
    <text v-if="!files.some(x=>x.category===category.value)" class="role-hint">暂无原件</text>
  </view>
  <view class="role-panel"><text class="role-section">知情同意书</text><text v-if="consentError" class="role-error">{{ consentError }}</text><view v-for="c in consents" :key="c.id"><text class="role-text">版本 {{ c.version }} · {{ day(c.createdAt) }}</text><button @tap="preview(c)">查看授权同意书</button></view><text v-if="!consents.length && !consentError" class="role-hint">暂无留档</text></view>
  <view class="role-panel"><text class="role-section">体态资料</text><view v-for="p in client?.posturePhotos||[]" :key="p.id"><text class="role-text">{{ viewName(p.view) }} · {{ p.faceProtected ? '已确认身份保护' : '需保护身份' }}</text><button @tap="preview(p)">查看体态图</button></view><text v-if="!client?.posturePhotos?.length" class="role-hint">暂无体态资料</text></view>
  <form v-if="writable" @submit="saveFile" class="role-panel">
    <text class="role-section">新增 / 补传资料</text>
    <StaffChoice :options="modes" label="选择资料类型" label-key="label" value-key="value" :model-value="mode" @update:model-value="selectMode" />
    <view v-if="mode==='report'" class="role-field"><StaffChoice :options="categories" label="选择报告分类" label-key="label" value-key="value" :model-value="categories[categoryIndex].value" @update:model-value="selectCategory" /><input name="title" :value="title" @input="title=$event.detail.value" maxlength="120" placeholder="报告标题（选填）" /></view>
    <view v-if="mode==='consent'" class="role-field"><text class="role-label">同意书版本</text><input name="version" :value="version" @input="version=$event.detail.value" maxlength="32" placeholder="如 2026-10-13" /></view>
    <view v-if="mode==='posture'" class="role-field"><StaffChoice :options="views" label="选择体态方向" label-key="label" value-key="value" :model-value="views[viewIndex].value" @update:model-value="selectView" /><checkbox-group @change="faceProtected=$event.detail.value.includes('protected')"><label class="role-check"><checkbox value="protected" :checked="faceProtected" />已在上传前裁切或遮挡脸部等不必要身份信息</label></checkbox-group></view>
    <text v-if="mode==='ocr'" class="role-hint">{{ provider.message || '正在读取识别配置' }}。识别结果仅为草稿，须人工核对；本入口不会主动发送照片到第三方。</text>
    <view class="role-actions"><button @tap="choose('image')" :disabled="busy">选择图片 / 拍照</button><button v-if="mode==='report'" @tap="choose('pdf')" :disabled="busy">选择PDF</button></view>
    <text class="role-hint">{{ pendingAsset ? '文件已上传，尚待业务关联；重试会使用同一附件。' : selected ? '已选择文件，提交时上传。' : '尚未选择文件' }}</text>
    <button form-type="submit" :disabled="busy || (!selected&&!pendingAsset) || (mode==='ocr'&&!localDraftAllowed)" class="role-primary">{{ busy ? '提交中…' : mode==='ocr' ? '建立待核对草稿' : '上传并留档' }}</button>
  </form>
  <CloudBodyOcr v-if="writable" :patient-id="id" staff @draft="acceptCloudDraft" />
  <form v-if="writable" @submit="saveBody" class="role-panel">
    <text class="role-section">{{ draft ? '检测草稿 · 人工核对' : '人体检测 · 手工录入' }}</text>
    <text v-if="draft" class="role-hint">提供商 {{ draft.provider }} · 状态 {{ draft.status }} · {{ draft.errorMessage || '请逐项核对原件、数值及单位' }}</text>
    <view class="role-field"><text class="role-label">检测日期</text><picker mode="date" :value="body.measuredAt" @change="body.measuredAt=$event.detail.value"><view class="role-picker">{{ body.measuredAt }}</view></picker></view>
    <view v-for="f in metrics" :key="f.key" class="role-field"><text class="role-label">{{ f.label }}（{{ f.unit }}）</text><input :name="f.key" type="digit" :value="body[f.key]" @input="body[f.key]=$event.detail.value" :placeholder="'有效范围 '+f.min+'–'+f.max" /></view>
    <checkbox-group @change="reviewed=$event.detail.value.includes('reviewed')"><label class="role-check"><checkbox value="reviewed" :checked="reviewed" />已核对原件、当次日期、数值与单位</label></checkbox-group>
    <button class="role-primary" form-type="submit" :disabled="busy || !reviewed">{{ busy ? '保存中…' : draft ? '保存修订并确认草稿' : '人工核对并新增检测记录' }}</button>
    <button v-if="draft" @tap="reloadDraft" :disabled="busy">重新读取草稿（会替换当前输入）</button>
  </form>
  <view class="role-panel"><text class="role-section">检测记录</text><view v-for="b in client?.bodyReports||[]" :key="b.id"><text class="role-label">{{ day(b.measuredAt) }} · {{ b.source || '手工录入' }}</text><text v-for="f in metrics.filter(f=>b[f.key]!=null)" :key="f.key" class="role-text">{{ f.label }}：{{ b[f.key] }} {{ f.unit }}</text></view><text v-if="!client?.bodyReports?.length" class="role-hint">暂无检测记录</text></view>
  <button v-if="error" @tap="loadPage">重新读取资料</button><ProtectedMedia v-if="media" :asset="media" @close="media=null" /><StaffRoleNav role="HEALTH_MANAGER" active="clients" />
</view></template>
<script>
import CloudBodyOcr from '../../components/CloudBodyOcr.vue'
import StaffChoice from '../../components/StaffChoice.vue'
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { care, staffPage, pickMedia, uploadSelected, releaseSelection, call, pathId } from '../../utils/staff-care.js'
import { canWriteClient, BODY_FIELDS, REPORT_TYPES, bodyPayload, inputSnapshot } from '../../utils/staff-role-model.js'
export default {components:{StaffRoleNav,ProtectedMedia,StaffChoice,CloudBodyOcr},mixins:[staffPage('HEALTH_MANAGER')],data:()=>({id:'',client:null,files:[],consents:[],consentError:'',provider:{},providerLoaded:false,providerVerified:false,notice:'',categories:REPORT_TYPES,metrics:BODY_FIELDS,modeIndex:0,categoryIndex:0,viewIndex:0,title:'',version:'2026-10-13',faceProtected:false,selected:null,pendingAsset:null,draft:null,reviewed:false,body:{measuredAt:new Date().toISOString().slice(0,10)},modes:[{value:'report',label:'健康报告原件'},{value:'consent',label:'知情同意书照片'},{value:'posture',label:'身份保护后的体态照片'},{value:'ocr',label:'检测报告核对草稿'}],views:[{value:'FRONT',label:'正面'},{value:'SIDE',label:'侧面'},{value:'BACK',label:'背面'}]}),
 onLoad(q){this.id=q.id||''},computed:{writable(){return canWriteClient(this.client,this.actor)},mode(){return this.modes[this.modeIndex].value},localDraftAllowed(){return this.providerLoaded && this.providerVerified && this.provider.sendsToThirdParty === false}},
 methods:{
  loadPage(){return this.read(async()=>{this.client=await care.client(this.id);this.files=await care.files(this.id);try{this.consents=await care.consent(this.id);this.consentError=''}catch(e){this.consentError=e.message}await this.verifyProvider()})},
  async verifyProvider(){this.providerLoaded=false;this.providerVerified=false;try{const value=await call('get','/report-workflow/ocr/provider');this.provider=value||{};this.providerVerified=typeof this.provider.sendsToThirdParty==='boolean'}catch(e){this.provider={message:'提供商状态读取失败，请重试；暂不能创建草稿。'};}finally{this.providerLoaded=true}},
  selectMode(value){this.changeMode({detail:{value:this.modes.findIndex(x=>x.value===value)}})},selectCategory(value){this.categoryIndex=this.categories.findIndex(x=>x.value===value)},selectView(value){this.viewIndex=this.views.findIndex(x=>x.value===value)},viewName(v){return this.views.find(x=>x.value===v)?.label||v},changeMode(e){if(this.busy)return;releaseSelection(this.selected);this.selected=null;this.pendingAsset=null;this.modeIndex=Number(e.detail.value);this.notice=''},
  async choose(kind){await this.run(async()=>{if(this.mode==='posture'&&!this.faceProtected)throw new Error('请先保护身份并勾选确认，再选择照片');const selected=await pickMedia(kind);releaseSelection(this.selected);this.selected=selected;this.pendingAsset=null})},
  saveFile(e){return this.run(async()=>{
    if(!this.writable)throw new Error('此客户资料只读')
    if(this.mode==='posture'&&!this.faceProtected)throw new Error('须先保护不必要身份信息')
    if(this.mode==='ocr'){await this.verifyProvider();if(!this.localDraftAllowed)throw new Error('未确认本地提供商状态；此入口已停止提交，不发送照片。')}
    const values=e.detail.value
    if(this.mode==='consent'&&!/^[A-Za-z0-9._-]{1,32}$/.test(values.version||this.version))throw new Error('请填写有效同意书版本')
    if(!this.pendingAsset)this.pendingAsset=await uploadSelected(this.selected)
    const mediaAssetId=this.pendingAsset.id
    if(this.mode==='report')await care.addFile(this.id,{mediaAssetId,category:this.categories[this.categoryIndex].value,title:values.title||this.title||undefined})
    else if(this.mode==='consent')await care.addConsent(this.id,{mediaAssetId,version:values.version||this.version})
    else if(this.mode==='posture')await care.posture(this.id,{mediaAssetId,view:this.views[this.viewIndex].value,faceProtected:true})
    else{this.draft=await call('post','/report-workflow/patients/'+pathId(this.id)+'/ocr-drafts',{mediaAssetId,sourceKind:'BODY_COMPOSITION',localOnly:true});this.fillDraft()}
    releaseSelection(this.selected);this.selected=null;this.pendingAsset=null;this.notice=this.mode==='ocr'?'草稿已建立，尚未确认保存检测指标。':'资料已留档，原件长期保留。';await this.loadPage()
  })},
  acceptCloudDraft(d){this.draft=d;this.fillDraft()},
  fillDraft(){this.body={measuredAt:(this.draft.measuredAt||new Date().toISOString()).slice(0,10)};for(const f of this.metrics)this.body[f.key]=this.draft.fields?.[f.key]?.value??'';this.reviewed=false},
  reloadDraft(){return this.run(async()=>{this.draft=await call('get','/report-workflow/ocr-drafts/'+pathId(this.draft.id));this.fillDraft()})},
  saveBody(e){return this.run(async()=>{if(!this.writable||!this.reviewed)throw new Error('请核对指标并确认');const dto=bodyPayload(inputSnapshot(this.body,e.detail.value));if(this.draft){const fields={};for(const f of this.metrics)if(dto[f.key]!=null)fields[f.key]={value:dto[f.key],unit:f.unit,confidence:null,reviewRequired:true,source:'MANUAL'};this.draft=await call('patch','/report-workflow/ocr-drafts/'+pathId(this.draft.id),{fields,measuredAt:dto.measuredAt,expectedUpdatedAt:this.draft.updatedAt});await call('post','/report-workflow/ocr-drafts/'+pathId(this.draft.id)+'/confirm',{reviewed:true,expectedUpdatedAt:this.draft.updatedAt});this.draft=null}else await care.body(this.id,dto);this.reviewed=false;this.body={measuredAt:new Date().toISOString().slice(0,10)};this.notice='已新增人工核对记录，未覆盖历史检测。';await this.loadPage()})},
  clearPrivate(){releaseSelection(this.selected);this.selected=null;this.pendingAsset=null;this.client=null;this.files=[];this.consents=[];this.provider={};this.providerLoaded=false;this.providerVerified=false;this.draft=null;this.body={measuredAt:new Date().toISOString().slice(0,10)};this.reviewed=false}
 }}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';</style>
