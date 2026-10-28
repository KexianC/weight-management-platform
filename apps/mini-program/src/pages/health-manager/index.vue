<template><view class="role-page">
      <text class="role-title">健康管理师工作台</text><text class="role-hint">全部客户均可查看；写操作按负责关系授权。</text>
      <text v-if="error" class="role-error">{{ error }}</text>
      <view class="role-panel"><text class="role-label">全部客户</text><text class="role-number">{{ loading ? '…' : error ? '—' : clients.length }}</text>
        <text class="role-hint">{{ loading ? '正在读取' : error ? '尚未成功读取客户列表' : '以上为当前接口实际返回数量' }}</text>
        <button @tap="go('/pages/health-manager/clients')">进入客户列表</button><button class="role-primary" @tap="go('/pages/health-manager/enroll')">新建客户档案</button>
      </view>
      <view class="role-panel"><text class="role-section">工作流程</text><text class="role-text">建档与分配 → 采集资料 → 人工核对体测 → 查看客户业务记录。</text></view>
      <button v-if="error" @tap="loadPage">重新读取</button><StaffRoleNav role="HEALTH_MANAGER" active="index" />
    </view></template><script>
    import StaffRoleNav from '../../components/StaffRoleNav.vue'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { care, staffPage, user, call, day, go } from '../../utils/staff-care.js'
import { canWriteClient, idOf } from '../../utils/staff-role-model.js'

    export default { components:{StaffRoleNav},mixins:[staffPage('HEALTH_MANAGER')],data:()=>({clients:[]}),methods:{
      loadPage(){return this.read(async()=>{this.clients=await care.clients()})},clearPrivate(){this.clients=[]}
    } }
    </script><style scoped lang="scss">@import "../../styles/role-workspace.scss";</style>