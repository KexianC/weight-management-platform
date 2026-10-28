<template><view class="role-page">
  <text class="role-title">客户档案</text><text v-if="error" class="role-error">{{ error }}</text>
  <view v-if="client" class="role-panel">
    <text class="role-section">{{ client.patient.displayName }}</text><text class="role-text">{{ client.patient.phone }}</text>
    <text class="role-hint">{{ client.enrollment?.clientCode || '历史客户 · 尚无管理档案' }} · {{ client.enrollment?.packageName || '未登记套餐' }}</text>
    <text class="role-badge">{{ writable ? '本人负责，可办理资料' : '全部业务只读' }}</text>
    <button @tap="go('/pages/health-manager/records',id)">全部健康记录、点评与回复</button><button @tap="go('/pages/health-manager/reports',id)">报告、同意书与体态资料</button>
    <button v-if="!client.enrollment && client.patient.status==='ACTIVE'" @tap="go('/pages/health-manager/enroll',id)">补齐管理档案（保留账号密码）</button>
  </view>
  <view v-if="client" class="role-panel lifestyle-summary"><text class="role-section">生活习惯调查表</text><view v-for="row in lifestyleRows" :key="row.key" class="lifestyle-summary-row"><text class="role-label">{{ row.label }}</text><text class="role-text">{{ row.value }}</text></view><text v-if="lifestyleHint" class="role-hint">{{ lifestyleHint }}</text></view>
  <form v-if="writable" @submit="saveAssignment" class="role-panel">
    <text class="role-section">套餐与服务分配</text><text class="role-hint">更新人员将同步后端服务关系；原报告与业务记录保留。</text>
    <view class="role-field"><text class="role-label">购买套餐</text><input name="packageName" :value="assignment.packageName" @input="assignment.packageName=$event.detail.value" maxlength="120" /></view>
    <view v-for="g in assignmentFields" :key="g.key" class="role-field"><text class="role-label">{{ g.label }}</text><StaffChoice :options="staff[g.list]||[]" :label="g.label" :model-value="assignment[g.key]" @update:model-value="assignment[g.key]=$event" /></view>
    <LifestyleFields v-model="lifestyle" />
    <button form-type="submit" :disabled="busy" class="role-primary">{{ busy ? '保存中…' : '保存套餐、分配与问卷' }}</button>
  </form>
  <view v-for="section in sections" :key="section.key" class="role-panel">
    <text class="role-section">{{ section.title }} · 只读</text><text v-if="section.error" class="role-error">{{ section.error }}</text>
    <view v-for="(item,index) in section.items" :key="item.id||index" class="role-record"><text class="role-label">{{ item.title || item.archiveNo || day(item.createdAt) }}</text><text class="role-text">{{ readable(item,section.key) }}</text></view>
    <text v-if="!section.items.length && !section.error" class="role-hint">暂无记录</text>
    <view v-if="section.key==='followups' && !section.error"><text class="role-hint">已读取 {{ section.items.length }} / {{ section.total }} 条随访</text><button v-if="section.hasMore" @tap="moreFollowups(section)" :disabled="followLoading || loading">{{ followLoading ? '读取中…' : '继续读取随访历史' }}</button></view>
  </view>
  <button v-if="error" @tap="loadPage">重新读取</button><StaffRoleNav role="HEALTH_MANAGER" active="clients" />
</view></template>
<script>
import { lifestyleRows as displayLifestyleRows, lifestyleHistoryHint } from '../../utils/lifestyle-display.js'
import StaffChoice from '../../components/StaffChoice.vue'
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import LifestyleFields from '../../components/LifestyleFields.vue'
import { care, staffPage, call, pathId } from '../../utils/staff-care.js'
import { canWriteClient, inputSnapshot, lifestylePayload, safeBusinessText } from '../../utils/staff-role-model.js'
export default {components:{StaffRoleNav,LifestyleFields,StaffChoice},mixins:[staffPage('HEALTH_MANAGER')],data:()=>({id:'',client:null,staff:{},assignment:{},lifestyle:{},sections:[],followLoading:false,followEpoch:0,
 assignmentFields:[{key:'doctorId',list:'doctors',label:'归属医生'},{key:'nutritionistId',list:'nutritionists',label:'营养师'},{key:'exerciseCoachId',list:'exerciseCoaches',label:'运动老师'}]}),
 onLoad(q){this.id=q.id||''},computed:{writable(){return canWriteClient(this.client,this.actor)},lifestyleRows(){return displayLifestyleRows(this.client?.lifestyle)},lifestyleHint(){return lifestyleHistoryHint(this.client?.lifestyle)}},
 methods:{
  async loadPage(){return this.read(async()=>{
    const epoch=++this.followEpoch
    this.client=await care.client(this.id)
    if(this.writable){this.staff=await care.staff();this.assignment={packageName:this.client.enrollment.packageName,doctorId:this.client.enrollment.doctorId,nutritionistId:this.client.enrollment.nutritionistId,exerciseCoachId:this.client.enrollment.exerciseCoachId};this.lifestyle={...this.client.lifestyle}}
    const prefix='/clinical/patients/'+pathId(this.id)
    const definitions=[['archive','电子档案',prefix+'/archive'],['tasks','客户任务',prefix],['plans','饮食方案',prefix+'/diet-plans'],['summaries','阶段总结',prefix+'/care-summaries'],['followups','复查随访','/follow-ups']]
    this.sections=await Promise.all(definitions.map(async([key,title,path])=>{try{const value=await call('get',path,key==='followups'?{patientId:this.id,page:1,pageSize:30}:{});const list=key==='tasks'?value?.tasks||value?.receivedTasks:key==='archive'?(value?.archive?[value.archive]:[]):value;return{key,title,items:Array.isArray(list)?list:list?.items||[],error:'',...(key==='followups'?{page:value.page||1,pageSize:value.pageSize||30,total:value.total,hasMore:(value.page||1)*(value.pageSize||30)<value.total,epoch}: {})}}catch(e){return{key,title,items:[],error:e.message}}}))
  })},
  moreFollowups(section){if(this.followLoading||this.loading||!section.hasMore)return;this.followLoading=true;const epoch=this.followEpoch;return this.read(async()=>{const value=await call('get','/follow-ups',{patientId:this.id,page:section.page+1,pageSize:30});if(epoch!==this.followEpoch||!this.sections.includes(section))return;section.items=[...new Map([...section.items,...value.items].map(x=>[x.id,x])).values()];section.page=value.page;section.pageSize=value.pageSize;section.total=value.total;section.hasMore=value.page*value.pageSize<value.total}).finally(()=>{this.followLoading=false})},
  choices(g){return [{id:'',displayName:'请选择'},...(this.staff[g.list]||[])]},position(g){return Math.max(0,this.choices(g).findIndex(x=>x.id===this.assignment[g.key]))},select(g,e){this.assignment[g.key]=this.choices(g)[Number(e.detail.value)]?.id||''},name(g){return this.staff[g.list]?.find(x=>x.id===this.assignment[g.key])?.displayName},
  saveAssignment(e){return this.run(async()=>{if(!this.writable)throw new Error('此客户只读');const values=e.detail.value;const dto={...inputSnapshot(this.assignment,values),lifestyle:lifestylePayload(inputSnapshot(this.lifestyle,values))};if(!dto.packageName.trim()||this.assignmentFields.some(g=>!dto[g.key]))throw new Error('请完整核对套餐和服务人员');await care.assign(this.id,dto);uni.showToast({title:'分配与问卷已保存',icon:'none'});await this.loadPage()})},
  readable(item,key){const allowed=key==='archive'?['answers','status']:key==='tasks'?['description','status','dueAt']:key==='followups'?['type','status','scheduledAt','dueAt','result','note']:key==='plans'?['content','goals','recommendations','startDate','endDate','status','publishedAt','templateSnapshot']:['content','summary','metrics','recommendations','periodStart','periodEnd','publishedAt'];return safeBusinessText(Object.fromEntries(allowed.filter(k=>item[k]!=null).map(k=>[k,item[k]])))},
  clearPrivate(){this.followEpoch++;this.client=null;this.sections=[];this.staff={};this.assignment={};this.lifestyle={}}
 }}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';.role-record{padding:14px 0;border-bottom:1px solid #edf1f4}.lifestyle-summary-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0}.lifestyle-summary-row .role-label,.lifestyle-summary-row .role-text{margin:0;overflow-wrap:anywhere}.lifestyle-summary-row .role-text{text-align:right}</style>
