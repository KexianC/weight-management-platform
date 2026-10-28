<template>
  <view class="password-page">
    <text class="brand">MedTalent健康数字助手</text>
    <text class="title">首次登录，请设置新密码</text>
    <text class="hint">请使用健管师提供的初始密码验证身份。设置成功后，使用新密码重新登录。</text>
    <text v-if="expiryLabel" class="hint">初始密码有效期至 {{ expiryLabel }}；过期请联系健管师。</text>
    <view class="field"><text>初始密码</text><input v-model="currentPassword" password maxlength="72" placeholder="请输入初始密码" /></view>
    <view class="field"><text>新密码</text><input v-model="newPassword" password maxlength="72" placeholder="请输入 8–72 位新密码" /></view>
    <view class="field"><text>确认新密码</text><input v-model="confirmation" password maxlength="72" placeholder="再次输入新密码" /></view>
    <text v-if="errorMessage" class="error">{{ errorMessage }}</text>
    <button :disabled="submitting" :loading="submitting" @tap="submit">设置新密码</button>
    <button class="secondary" :disabled="submitting" @tap="returnToLogin">返回登录</button>
  </view>
</template>

<script>
import store from '../../store/index.js'
import { changePassword, getUserInfo } from '../../utils/api.js'
import { navigateAfterLogin } from '../../utils/auth-navigation.js'
export default {
  data() { return { currentPassword: '', newPassword: '', confirmation: '', submitting: false, errorMessage: '', expiryLabel: '', ready: false } },
  async onLoad() {
    if (!store.isLogin()) { uni.reLaunch({ url: '/pages/login/login' }); return }
    try {
      const result = await getUserInfo({ loading: false, showError: false })
      if (!result.data || result.code !== 200) throw new Error('无法确认账号状态，请稍后重试')
      store.updateUserInfo(result.data)
      if (result.data.mustChangePassword !== true) { navigateAfterLogin(store.getUserInfo()); return }
      this.ready = true
      const expires = result.data.initialPasswordExpiresAt
      this.expiryLabel = expires ? new Date(expires).toLocaleString() : ''
    } catch (error) { this.errorMessage = error.message || '无法确认账号状态，请返回登录后重试' }
  },
  onUnload() { this.currentPassword = ''; this.newPassword = ''; this.confirmation = '' },
  methods: {
    async submit() {
      if (this.submitting) return
      this.errorMessage = ''
      if (!this.ready || store.getUserInfo().mustChangePassword !== true) { this.errorMessage = '请先确认账号状态'; return }
      if (this.currentPassword.length < 8 || this.currentPassword.length > 72) { this.errorMessage = '请输入有效的初始密码'; return }
      if (this.newPassword.length < 8 || this.newPassword.length > 72) { this.errorMessage = '新密码需为 8–72 位'; return }
      if (this.newPassword === this.currentPassword) { this.errorMessage = '新密码不能与初始密码相同'; return }
      if (this.newPassword !== this.confirmation) { this.errorMessage = '两次新密码不一致'; return }
      this.submitting = true
      try {
        const result = await changePassword({ currentPassword: this.currentPassword, newPassword: this.newPassword }, { loading: false, showError: false })
        if (result.code !== 200 || result.data?.changed !== true) throw new Error(result.message || '密码未修改，请重试')
        this.currentPassword = ''; this.newPassword = ''; this.confirmation = ''
        // The backend revokes old sessions. Do not pretend this token remains usable.
        store.logout()
        uni.showToast({ title: '设置成功，请重新登录', icon: 'none' })
        uni.reLaunch({ url: '/pages/login/login' })
      } catch (error) { this.errorMessage = error.message || '设置失败，请重试' }
      finally { this.submitting = false }
    },
    returnToLogin() { store.logout(); uni.reLaunch({ url: '/pages/login/login' }) }
  }
}
</script>

<style scoped>
.password-page { min-height: 100vh; padding: 40rpx 32rpx calc(48rpx + env(safe-area-inset-bottom)); background: #f4f9fb; }
.brand,.title,.hint,.error { display: block; }
.brand { color: #168fb5; font-size: 26rpx; margin-bottom: 36rpx; }
.title { color: #173b4d; font-size: 36rpx; font-weight: 600; margin-bottom: 24rpx; }
.hint { color: #536a75; font-size: 26rpx; line-height: 1.7; margin-bottom: 20rpx; }
.field { background: #fff; padding: 26rpx; border-radius: 18rpx; margin: 22rpx 0; }
.field text { color: #274b5f; font-size: 26rpx; }
.field input { min-height: 80rpx; font-size: 28rpx; }
button { margin-top: 28rpx; background: #168fb5; color: #fff; font-size: 28rpx; }
button.secondary { background: #fff; color: #274b5f; }
.error { color: #b33131; line-height: 1.6; font-size: 26rpx; }
</style>

<style scoped>
/* Populated-state layout audit: no account or data changes. */
.password-page button { min-height: 44px; height: auto; width: 100%; display: flex; align-items: center; justify-content: center; padding: 10px 14px; line-height: 1.5; font-size: 14px; }
.password-page .field input { min-height: 44px; }
</style>
