<template><view class="role-page">
  <text class="role-title">运动服务档案</text><text v-if="error" class="role-error">{{ error }}</text>
  <view v-if="client" class="role-panel"><text class="role-section">{{ client.enrollment?.clientCode || client.patient.displayName }}</text><text class="role-hint">仅使用脱敏客户标识；原始医学报告、手机号和签字资料不在本岗位展示。</text><button class="role-primary" @tap="go('/pages/exercise-coach/prescription',id)">人工开具跟练处方</button></view>
  <view class="role-panel"><text class="role-section">授权体态照片</text><view v-for="photo in client?.posturePhotos||[]" :key="photo.id"><text class="role-text">{{ views[photo.view] || photo.view }} · 已确认身份保护</text><button @tap="preview(photo)">查看授权体态图</button></view><text v-if="!client?.posturePhotos?.length" class="role-hint">暂无可读取的身份保护体态照片，请由负责健管师补充。</text></view>
  <view class="role-panel"><text class="role-section">人体检测指标</text><view v-for="b in client?.bodyReports||[]" :key="b.id"><text class="role-label">{{ day(b.measuredAt) }}</text><text v-for="f in metrics.filter(f=>b[f.key]!=null)" :key="f.key" class="role-text">{{ f.label }}：{{ b[f.key] }} {{ f.unit }}</text></view><text v-if="!client?.bodyReports?.length" class="role-hint">暂无检测指标</text></view>
  <view v-for="r in client?.exerciseReports||[]" :key="r.id" class="role-panel"><text class="role-section">人工运动报告 · 第{{ r.version }}版</text><text class="role-badge">{{ r.publishedAt ? '营养师已核对发送' : '营养师待核对' }}</text><text class="role-text">{{ r.assessment }}</text><text class="role-text">注意事项：{{ r.precautions || '未填写' }}</text>
    <view v-for="(item,i) in r.items||[]" :key="i" class="action-detail"><text class="role-label">{{ i+1 }}. {{ item.actionName }}</text><text class="role-text">{{ item.sets }}组 × {{ item.reps }}次 · 节奏 {{ item.tempo }} · 休息 {{ item.restSeconds }}秒</text><text class="role-text">频率：{{ item.frequency }} · {{ item.videoTitle }}</text><button @tap="preview(item,'video/mp4')">查看处方视频快照</button></view>
    <button v-if="r.coachId===actorId" @tap="go('/pages/exercise-coach/prescription',id,'&reportId='+r.id)">基于此版修订（保留历史）</button>
  </view>
  <text class="role-hint">本岗位报告由接口返回最近最多100版；营养师负责人工核对及限时发送。</text>
  <button v-if="error" @tap="loadPage">重新读取</button><ProtectedMedia v-if="media" :asset="media" @close="media=null" /><StaffRoleNav role="EXERCISE_COACH" active="clients" />
</view></template>
<script>
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { care, staffPage } from '../../utils/staff-care.js'
import { BODY_FIELDS, idOf } from '../../utils/staff-role-model.js'
export default {components:{StaffRoleNav,ProtectedMedia},mixins:[staffPage('EXERCISE_COACH')],data:()=>({id:'',client:null,metrics:BODY_FIELDS,views:{FRONT:'正面',SIDE:'侧面',BACK:'背面'}}),onLoad(q){this.id=q.id||''},computed:{actorId(){return idOf(this.actor)}},methods:{loadPage(){return this.read(async()=>{const row=await care.client(this.id);this.client={patient:{id:row.patient.id,displayName:row.enrollment?.clientCode||row.patient.displayName},enrollment:row.enrollment,bodyReports:row.bodyReports||[],posturePhotos:(row.posturePhotos||[]).filter(p=>p.faceProtected),exerciseReports:row.exerciseReports||[]}})},clearPrivate(){this.client=null}}}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';.action-detail{padding:12px 0;border-bottom:1px solid #e8eef1}</style>
