<template><view class="role-page">
  <text class="role-title">{{ revision ? '修订人工运动处方' : '人工运动处方' }}</text><text class="role-hint">{{ client?.enrollment?.clientCode }} · 根据授权资料人工制定，不自动作诊疗决策。</text>
  <text v-if="error" class="role-error">{{ error }}</text>
  <view v-if="result" class="role-panel"><text class="role-section">已提交营养师待核对 · 第{{ result.version }}版</text><text class="role-hint">{{ result.delivery==='SIMULATED_IN_APP' ? '模拟应用内通知，未真实外发客户消息。' : '已发送应用内待核对通知。' }} 客户须经营养师人工核对及限时发送后读取。</text><button @tap="go('/pages/exercise-coach/client',id)">返回客户档案查看</button></view>
  <form v-else @submit="submit">
    <view class="role-panel"><view class="role-field"><text class="role-label">人工评估说明</text><textarea name="assessment" :value="form.assessment" @input="form.assessment=$event.detail.value" maxlength="2000" placeholder="根据授权体态和评估资料填写；不含姓名、手机号和链接" /></view><view class="role-field"><text class="role-label">注意事项</text><textarea name="precautions" :value="form.precautions" @input="form.precautions=$event.detail.value" maxlength="1000" /></view></view>
    <view v-for="(item,index) in form.items" :key="item.key" class="role-panel"><text class="role-section">动作 {{ index+1 }}</text>
      <view class="role-field"><text class="role-label">关联当前有效动作视频</text><StaffChoice :options="videos" label="关联当前有效视频" label-key="title" v-model="item.videoId" placeholder="请选择有效视频" /></view>
      <view class="role-field"><text class="role-label">动作名称</text><input :name="'item_'+index+'_actionName'" :value="item.actionName" @input="item.actionName=$event.detail.value" maxlength="120" /></view>
      <view class="role-grid"><view class="role-field"><text class="role-label">组数（1–20）</text><input :name="'item_'+index+'_sets'" :value="item.sets" @input="item.sets=$event.detail.value" type="number" /></view><view class="role-field"><text class="role-label">每组次数（1–200）</text><input :name="'item_'+index+'_reps'" :value="item.reps" @input="item.reps=$event.detail.value" type="number" /></view></view>
      <view class="role-field"><text class="role-label">动作节奏</text><input :name="'item_'+index+'_tempo'" :value="item.tempo" @input="item.tempo=$event.detail.value" maxlength="80" placeholder="如 缓慢抬起2秒、放下3秒" /></view>
      <view class="role-field"><text class="role-label">组间休息（0–600秒）</text><input :name="'item_'+index+'_restSeconds'" :value="item.restSeconds" @input="item.restSeconds=$event.detail.value" type="number" /></view>
      <view class="role-field"><text class="role-label">跟练频率</text><input :name="'item_'+index+'_frequency'" :value="item.frequency" @input="item.frequency=$event.detail.value" maxlength="80" placeholder="填写人工确定的频率" /></view>
      <button v-if="form.items.length>1" @tap="form.items.splice(index,1)">移除此动作</button>
    </view>
    <button @tap="add" :disabled="form.items.length>=30 || busy">添加动作（最多30个）</button>
    <checkbox-group @change="reviewed=$event.detail.value.includes('reviewed')"><label class="role-check"><checkbox value="reviewed" :checked="reviewed" />已人工核对动作、节奏、频率及注意事项</label></checkbox-group>
    <text class="role-hint">提交后新增版本并通知营养师；失败时先刷新客户报告，核对是否已经提交，再决定重试。</text>
    <button class="role-primary" form-type="submit" :disabled="busy || loading || !reviewed || !videos.length">{{ busy ? '提交中…' : '提交营养师待核对' }}</button>
  </form><StaffRoleNav role="EXERCISE_COACH" active="clients" :confirm-leave="!result && !!form.assessment" />
</view></template>
<script>
import StaffChoice from '../../components/StaffChoice.vue'
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import { care, staffPage } from '../../utils/staff-care.js'
import { prescriptionPayload, inputSnapshot, idOf } from '../../utils/staff-role-model.js'
let sequence=0
const item=()=>({key:++sequence,videoId:'',actionName:'',sets:1,reps:10,tempo:'',restSeconds:30,frequency:''})
export default {components:{StaffRoleNav,StaffChoice},mixins:[staffPage('EXERCISE_COACH')],data:()=>({id:'',revision:'',client:null,videos:[],form:{assessment:'',precautions:'',items:[item()]},reviewed:false,result:null,initialized:false}),onLoad(q){this.id=q.id||'';this.revision=q.reportId||''},computed:{videoOptions(){return [{id:'',title:'请选择有效视频'},...this.videos]}},methods:{
 loadPage(){return this.read(async()=>{this.client=await care.client(this.id);this.videos=await care.videos();if(!this.initialized&&this.revision){const r=this.client.exerciseReports.find(r=>r.id===this.revision&&r.coachId===idOf(this.actor));if(!r)throw new Error('此报告不可由当前运动老师修订');this.form={assessment:r.assessment,precautions:r.precautions||'',items:r.items.map(i=>({...item(),...i}))}}this.initialized=true})},
 videoPosition(id){return Math.max(0,this.videoOptions.findIndex(v=>v.id===id))},videoName(id){return this.videos.find(v=>v.id===id)?.title},selectVideo(i,e){const v=this.videoOptions[Number(e.detail.value)];this.form.items[i].videoId=v?.id||'';if(!this.form.items[i].actionName)this.form.items[i].actionName=v?.title||''},add(){if(this.form.items.length<30)this.form.items.push(item())},
 submit(e){return this.run(async()=>{if(!this.reviewed)throw new Error('请先人工核对处方');const values=e.detail.value;const form=inputSnapshot(this.form,values);form.items=this.form.items.map((i,index)=>{const row={...i};for(const key of ['actionName','sets','reps','tempo','restSeconds','frequency'])if(Object.prototype.hasOwnProperty.call(values,'item_'+index+'_'+key))row[key]=values['item_'+index+'_'+key];return row});this.result=await care.prescribe(this.id,prescriptionPayload(form,this.videos),this.revision);this.form={assessment:'',precautions:'',items:[item()]};this.reviewed=false})},
 clearPrivate(){this.client=null;this.videos=[];this.result=null;this.form={assessment:'',precautions:'',items:[item()]};this.initialized=false;this.reviewed=false}
}}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';</style>
