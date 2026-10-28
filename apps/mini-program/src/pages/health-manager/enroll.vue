<template><view class="role-page">
  <text class="role-title">{{ existing ? '补齐既有客户管理档案' : '新建客户档案' }}</text>
  <text class="role-hint">{{ existing ? '保留既有身份和密码，不生成新凭据。' : '账号由服务端建立，首次登录须改密，初始凭据24小时有效。' }}</text>
  <text v-if="error" class="role-error">{{ error }}</text>
  <view v-if="result" class="role-panel">
    <text class="role-section">建档成功</text><text class="role-text">客户编号：{{ result.enrollment?.clientCode }}</text>
    <view v-if="credential" class="role-credential"><text class="role-text">登录账号：{{ credential.account }}</text><text class="role-text">初始密码：{{ credential.initialPassword }}</text>
      <text class="role-hint">有效至 {{ credential.expiresAt }}。仅本次显示，请当面交付客户；不写入本地存储。</text><button @tap="credential=null">已交付，清除凭据</button></view>
    <text v-else class="role-hint">{{ existing ? '既有账号密码保持不变。' : '凭据显示已关闭。' }}</text>
    <button @tap="openClient">进入客户档案</button>
  </view>
  <form v-else @submit="submit">
    <view class="role-panel">
      <view class="role-field"><text class="role-label">客户姓名</text><input name="name" :value="form.name" @input="form.name=$event.detail.value" :disabled="!!existing" maxlength="80" placeholder="填写客户姓名" /></view>
      <view class="role-field"><text class="role-label">手机号</text><input name="phone" :value="form.phone" @input="form.phone=$event.detail.value" :disabled="!!existing" type="number" maxlength="11" placeholder="客户登录账号" /></view>
      <view class="role-field"><text class="role-label">购买套餐</text><input name="packageName" :value="form.packageName" @input="form.packageName=$event.detail.value" maxlength="120" placeholder="套餐名称，不包含客户身份信息" /></view>
      <view v-for="g in assignments" :key="g.key" class="role-field"><text class="role-label">{{ g.label }}</text><StaffChoice :options="staff[g.list]||[]" :label="g.label" :model-value="form[g.key]" @update:model-value="form[g.key]=$event" /></view>
    </view>
    <view class="role-panel"><text class="role-section">生活习惯调查表</text><LifestyleFields v-model="lifestyle" /></view>
    <text class="role-hint">请核对资料与分配人员后建档。提交失败时先查看客户列表，确认未成功后再重试，避免重复建档。</text>
    <button class="role-primary" form-type="submit" :disabled="busy || loading">{{ busy ? '正在建档…' : '确认建档' }}</button>
  </form>
  <StaffRoleNav role="HEALTH_MANAGER" active="enroll" :confirm-leave="!result && dirty" />
</view></template>
<script>
import StaffChoice from '../../components/StaffChoice.vue'
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import LifestyleFields from '../../components/LifestyleFields.vue'
import { care, staffPage, go } from '../../utils/staff-care.js'
import { enrollmentPayload, inputSnapshot } from '../../utils/staff-role-model.js'
export default {components:{StaffRoleNav,LifestyleFields,StaffChoice},mixins:[staffPage('HEALTH_MANAGER')],data:()=>({existing:'',form:{name:'',phone:'',packageName:'',nutritionistId:'',doctorId:'',exerciseCoachId:''},lifestyle:{sleepHours:8,mealsPerDay:3,sedentaryHours:6,waterMl:1500,activityLevel:'LOW',smoking:'NEVER',alcohol:'NEVER'},staff:{},result:null,credential:null,
 assignments:[{key:'doctorId',list:'doctors',label:'归属医生'},{key:'nutritionistId',list:'nutritionists',label:'分配营养师'},{key:'exerciseCoachId',list:'exerciseCoaches',label:'分配运动老师'}]}),
 onLoad(q){this.existing=q.id||''},computed:{dirty(){return !!(this.form.name || this.form.phone || this.form.packageName)}},
 methods:{
   loadPage(){return this.read(async()=>{this.staff=await care.staff();if(this.existing&&!this.form.phone){const row=await care.client(this.existing);if(row.enrollment)throw new Error('客户已经建档，请进入档案查看');this.form.name=row.patient.displayName;this.form.phone=row.patient.phone}})},
   choices(g){return [{id:'',displayName:'请选择'},...(this.staff[g.list]||[])]},position(g){return Math.max(0,this.choices(g).findIndex(x=>x.id===this.form[g.key]))},select(g,e){this.form[g.key]=this.choices(g)[Number(e.detail.value)]?.id||''},staffName(g){return this.staff[g.list]?.find(x=>x.id===this.form[g.key])?.displayName},
   submit(e){return this.run(async()=>{const values=e.detail.value;const dto=enrollmentPayload({...inputSnapshot(this.form,values),...inputSnapshot(this.lifestyle,values)});const result=await care.enroll(dto,this.existing);this.result={patient:result.patient,enrollment:result.enrollment};this.credential=result.credentials?{...result.credentials}:null;this.form={name:'',phone:'',packageName:'',nutritionistId:'',doctorId:'',exerciseCoachId:''}})},
   openClient(){this.credential=null;go('/pages/health-manager/client',this.result.patient.id)},
   clearTransient(){this.credential=null},clearPrivate(){this.result=null;this.credential=null;this.staff={};this.form={name:'',phone:'',packageName:'',nutritionistId:'',doctorId:'',exerciseCoachId:''}}
 }}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';</style>
