<template><view class="role-page">
      <text class="role-title">全部客户</text>
      <input :value="search" @input="search=$event.detail.value" class="role-input" placeholder="搜索客户姓名 / 手机号 / 客户编号" />
      <text v-if="error" class="role-error">{{ error }}</text><text v-if="loading" class="role-hint">正在读取客户列表…</text>
      <text v-else class="role-hint">匹配 {{ filtered.length }} / {{ clients.length }} 位客户</text>
      <view v-for="row in displayed" :key="row.patient.id" class="role-panel">
        <text class="role-section">{{ row.patient.displayName || row.enrollment?.clientCode || '历史客户' }}</text>
        <text class="role-text">{{ row.patient.phone }}</text>
        <text class="role-hint">{{ row.enrollment?.clientCode || '尚无管理档案' }} · {{ row.enrollment?.packageName || '未登记套餐' }}</text>
        <text class="role-badge">{{ canWriteClient(row, actor) ? "本人负责，可办理资料" : "只读客户" }}</text>
        <button @tap="go('/pages/health-manager/client',row.patient.id)">查看档案</button>
      </view>
      <view v-if="!loading && !filtered.length" class="role-panel"><text>暂无匹配客户</text></view>
      <button v-if="displayed.length<filtered.length" @tap="visibleCount+=30">继续显示客户（{{ displayed.length }}/{{ filtered.length }}）</button><button v-if="error" @tap="loadPage">重新读取</button><StaffRoleNav role="HEALTH_MANAGER" active="clients" />
    </view></template><script>import StaffRoleNav from '../../components/StaffRoleNav.vue'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { care, staffPage, user, call, day, go } from '../../utils/staff-care.js'
import { canWriteClient, idOf } from '../../utils/staff-role-model.js'

    export default {components:{StaffRoleNav},mixins:[staffPage('HEALTH_MANAGER')],data:()=>({clients:[],search:'',visibleCount:30}),
    watch:{search(){this.visibleCount=30}},computed:{displayed(){return this.filtered.slice(0,this.visibleCount)},filtered(){const q=this.search.trim().toLowerCase();return this.clients.filter(x=>[x.patient.displayName,x.patient.phone,x.enrollment?.clientCode].filter(Boolean).some(v=>String(v).toLowerCase().includes(q)))}},
    methods:{canWriteClient,loadPage(){return this.read(async()=>{this.clients=await care.clients()})},clearPrivate(){this.clients=[];this.search=''}}}
    </script><style scoped lang="scss">@import "../../styles/role-workspace.scss";</style>