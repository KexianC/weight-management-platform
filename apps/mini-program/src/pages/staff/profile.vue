<template><view class="role-page"><text class="role-title">我的工作账号</text><text v-if="error" class="role-error">{{ error }}</text><view class="role-panel"><text class="role-section">{{ actor.displayName || actor.name || '工作人员' }}</text><text class="role-text">{{ role==='HEALTH_MANAGER' ? '健康管理师' : '运动老师' }}</text><text class="role-hint">账号由机构负责人开通。客户资料按岗位和分配关系授权。</text></view><button class="danger" @tap="signOut" :disabled="busy">退出当前账号</button><StaffRoleNav :role="role" active="profile" /></view></template>
<script>
import StaffRoleNav from '../../components/StaffRoleNav.vue'
import { staffPage, call } from '../../utils/staff-care.js'
import { logout } from '../../utils/api.js'
import { roleOf } from '../../utils/staff-role-model.js'
import store from '../../store/index.js'
export default {components:{StaffRoleNav},mixins:[staffPage()],computed:{role(){return roleOf(this.actor)}},methods:{loadPage(){return this.read(async()=>{const me=await call('get','/auth/me');this.actor={id:me.id,userId:me.id,backendRole:me.role,displayName:me.displayName}})},signOut(){return this.run(async()=>{try{await logout({loading:false,showError:false})}finally{store.logout();this.actor={};uni.reLaunch({url:'/pages/login/login'})}})},clearPrivate(){this.actor={}}}}
</script><style scoped lang="scss">@import '../../styles/role-workspace.scss';</style>
