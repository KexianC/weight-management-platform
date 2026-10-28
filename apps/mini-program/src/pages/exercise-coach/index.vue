<template><view class="role-page">
      <text class="role-title">运动老师工作台</text><text class="role-hint">使用脱敏客户编号，人工制定跟练处方。</text>
      <text v-if="error" class="role-error">{{ error }}</text>
      <view class="role-panel"><text class="role-label">已分配客户</text><text class="role-number">{{ loading ? '…' : error ? '—' : clients.length }}</text>
        <text class="role-hint">{{ loading ? '正在读取' : error ? '尚未成功读取客户列表' : '以上为当前接口实际返回数量' }}</text>
        <button @tap="go('/pages/exercise-coach/clients')">进入客户列表</button><button class="role-primary" @tap="go('/pages/exercise-coach/videos')">维护动作视频库</button>
      </view>
      <view class="role-panel"><text class="role-section">工作流程</text><text class="role-text">查看授权体态 → 选择动作视频 → 人工填写节奏与注意事项 → 提交营养师核对。</text></view>
      <button v-if="error" @tap="loadPage">重新读取</button><StaffRoleNav role="EXERCISE_COACH" active="index" />
    </view></template><script>
    import StaffRoleNav from '../../components/StaffRoleNav.vue'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { care, staffPage, user, call, day, go } from '../../utils/staff-care.js'
import { canWriteClient, idOf } from '../../utils/staff-role-model.js'

    export default { components:{StaffRoleNav},mixins:[staffPage('EXERCISE_COACH')],data:()=>({clients:[]}),methods:{
      loadPage(){return this.read(async()=>{this.clients=await care.clients()})},clearPrivate(){this.clients=[]}
    } }
    </script><style scoped lang="scss">@import "../../styles/role-workspace.scss";</style>