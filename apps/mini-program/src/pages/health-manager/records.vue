<template><view class="role-page">
  <text class="role-title">全部健康记录 · 只读</text><text class="role-hint">按接口分页读取全部历史记录，附件逐件鉴权。</text>
  <text v-if="error" class="role-error">{{ error }}</text><text class="role-hint">共 {{ total }} 条 · 第 {{ page }} 页</text>
  <view v-for="r in items" :key="r.id" class="role-panel">
    <text class="role-section">{{ labels[r.recordType] || r.recordType }} · {{ day(r.measuredAt) }}</text>
    <text v-for="entry in entries(r)" :key="entry.label" class="role-text">{{ entry.label }}：{{ entry.value }}</text>
    <text v-if="r.payload" class="role-text">{{ safeBusinessText(r.payload) }}</text>
    <button v-for="a in assets(r)" :key="a.id" @tap="preview(a)">{{ a.mimeType?.startsWith('video/') ? '查看授权视频' : a.mimeType==='application/pdf' ? '查看PDF原件' : '查看授权图片' }}</button>
    <view v-for="review in r.reviews||[]" :key="review.id" class="record-review"><text class="role-label">{{ review.practitioner?.displayName || '工作人员' }}点评</text><text class="role-text">{{ review.comment }}</text>
      <text v-for="reply in review.replies||[]" :key="reply.id" class="role-text">客户回复：{{ reply.comment }}</text>
    </view>
  </view>
  <text v-if="!loading && !items.length && !error" class="role-hint">本页暂无记录</text>
  <view class="role-actions"><button :disabled="loading || page===1" @tap="turn(-1)">上一页</button><button :disabled="loading || !hasMore" @tap="turn(1)">下一页</button></view>
  <button v-if="error" @tap="loadPage">重新读取当前页</button>
  <ProtectedMedia v-if="media" :asset="media" @close="media=null" /><StaffRoleNav role="HEALTH_MANAGER" active="clients" />
</view></template>
<script>
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { care, staffPage } from '../../utils/staff-care.js'
import { businessEntries, safeBusinessText } from '../../utils/staff-role-model.js'
export default {components:{StaffRoleNav,ProtectedMedia},mixins:[staffPage('HEALTH_MANAGER')],data:()=>({id:'',items:[],page:1,total:0,hasMore:false,labels:{DIET:'饮食',WEIGHT:'体重',EXERCISE:'运动',SLEEP:'睡眠',QUESTIONNAIRE:'问卷',GENERAL:'综合',BLOOD_PRESSURE:'血压',MEDICATION:'用药',SYMPTOM:'症状'}}),onLoad(q){this.id=q.id||''},
 methods:{entries:businessEntries,safeBusinessText,loadPage(){return this.read(async()=>{const result=await care.records(this.id,this.page);if(!Array.isArray(result?.items))throw new Error('记录分页响应异常');this.items=result.items;this.total=result.total;this.hasMore=result.hasMore})},turn(delta){this.page+=delta;this.items=[];this.loadPage();uni.pageScrollTo({scrollTop:0,duration:0})},assets(r){const rows=r.assets||[];return [...new Set([...(r.imageAssetIds||[]),...rows.map(x=>x.id)])].map(id=>({id,mimeType:rows.find(a=>a.id===id)?.mimeType||'image/png'}))},clearPrivate(){this.items=[];this.page=1;this.total=0}}
}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';.record-review{border-left:3px solid #add6e2;padding-left:12px;margin-top:16px}</style>
