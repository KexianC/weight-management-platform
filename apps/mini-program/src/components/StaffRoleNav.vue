<template>
  <view v-if="keyboardHeight === 0" class="role-nav" role="tablist" :aria-label="label + '导航'">
    <view v-for="tab in tabs" :key="tab.path" class="role-nav-item" :class="{ selected: selected(tab.path) }" role="tab" :aria-selected="selected(tab.path)" :id="'role-nav-' + tab.path.split('/').pop()" @tap="go(tab.path)">
      <Icon :name="tab.icon" size="20" :color="selected(tab.path) ? '$primary-color' : '$gray-500'" />
      <text class="role-nav-text">{{ tab.text }}</text>
    </view>
  </view>
</template>
<script>
import Icon from './Icon.vue'
import { staffTabs } from '../utils/staff-role-model.js'
export default {
  components: { Icon }, props: { role: { type: String, required: true }, active: { type: String, default: '' }, confirmLeave: { type: Boolean, default: false } },
  data() { return { keyboardHeight: 0, keyboardHandler: null } },
  computed: { tabs() { return staffTabs(this.role) }, label() { return this.role === 'HEALTH_MANAGER' ? '健康管理师' : '运动老师' } },
  mounted() { this.keyboardHandler = value => { this.keyboardHeight = Number(value.height || 0) }; if (typeof uni.onKeyboardHeightChange === 'function') uni.onKeyboardHeightChange(this.keyboardHandler) },
  beforeUnmount() { if (typeof uni.offKeyboardHeightChange === 'function' && this.keyboardHandler) uni.offKeyboardHeightChange(this.keyboardHandler) },
  methods: { selected(path) { return this.active === path || this.active === path.split('/').pop() }, go(path) { const pages = getCurrentPages(); const route = pages[pages.length - 1]?.route || ''; if ('/' + route.replace(/^\//, '') === path) return; const visit = () => uni.reLaunch({ url: path }); if (this.confirmLeave) uni.showModal({ title: '离开当前表单', content: '未保存的内容将被清除，是否离开？', success: r => { if (r.confirm) visit() } }); else visit() } }
}
</script>
<style scoped>
.role-nav { position:fixed; left:0; right:0; bottom:0; height:calc(64px + env(safe-area-inset-bottom)); padding:0 0 env(safe-area-inset-bottom); box-sizing:border-box; display:flex; align-items:flex-start; background:#fff; border-top:1px solid #dcecf2; box-shadow:0 -4px 14px rgba(30,95,119,.08); z-index:900; }
.role-nav-item { flex:1 1 0; min-width:0; height:63px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; position:relative; }
.role-nav-text { font-size:12px; line-height:18px; white-space:nowrap; color:#687e8d; }
.selected .role-nav-text { color:#167fa5; font-weight:600; }
.selected::before { content:''; position:absolute; top:0; width:22px; height:3px; background:#1688b1; border-radius:0 0 4px 4px; }
</style>
