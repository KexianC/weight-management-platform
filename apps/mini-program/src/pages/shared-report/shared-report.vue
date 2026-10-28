<template>
  <view class="shared-report-page">
    <view class="report-header"><text class="brand">MedTalent健康数字助手</text><text class="page-title">运动评估与处方</text><text class="hint">营养师核对后发送，仅报告所属客户登录可读。</text></view>
    <view v-if="loading" class="state-card"><text>正在核验报告权限…</text></view>
    <view v-else-if="errorText" class="state-card"><text class="error-text">{{ errorText }}</text><button v-if="needsLogin" type="primary" @click="loginToRead">登录并阅读</button><button v-else @click="loadReport">重新核验</button></view>
    <template v-else-if="report">
      <view class="report-card"><text class="section-title">运动评估</text><text class="date">发送时间：{{ displayDate(report.publishedAt) }}</text><text class="report-copy">{{ report.assessment }}</text></view>
      <view v-if="report.precautions" class="report-card precautions"><text class="section-title">注意事项</text><text class="report-copy">{{ report.precautions }}</text></view>
      <view v-for="(item, index) in items" :key="item.videoId + '-' + index" class="report-card">
        <text class="section-title">{{ index + 1 }}. {{ item.actionName }}</text>
        <view class="prescription-metrics"><view><text>组数 / 次数</text><text>{{ item.sets }} 组 × {{ item.reps }} 次</text></view><view><text>动作节奏</text><text>{{ item.tempo }}</text></view><view><text>组间休息</text><text>{{ item.restSeconds }} 秒</text></view><view><text>运动频率</text><text>{{ item.frequency }}</text></view></view>
        <text v-if="item.videoTitle" class="hint">示范：{{ item.videoTitle }}</text>
        <video v-if="activeVideoId === item.mediaAssetId && videoPath" :id="'exercise-video-' + index" class="exercise-video" :src="videoPath" :show-download-btn="false" :controls="true" @error="videoFailed" />
        <button v-else-if="item.mediaAssetId" class="video-button" :disabled="Boolean(loadingVideoId)" :loading="loadingVideoId === item.mediaAssetId" @click="playVideo(item)">授权加载动作视频</button>
        <text v-else class="hint">此动作暂无可用视频</text>
      </view>
      <view class="footer-note"><text>报告访问权限由服务端实时核验。分享过期、被撤销或服务关系变化后将停止访问；新版本需营养师重新核对发送。</text></view>
    </template>
  </view>
</template>

<script>
import { getStorage, showToast } from '@/utils/common.js'
import { getSharedExerciseReport, isPatientSession, reportItems, validateShareLocator } from '@/utils/patient-reports.js'
import { resolveMediaFile, releaseMediaFile } from '@/utils/media-access.js'

export default {
  data() {
    return { locator: null, report: null, loading: false, needsLogin: false, errorText: '', activeVideoId: '', videoPath: '', loadingVideoId: '', pageVisible: false, loadVersion: 0 }
  },
  computed: { items() { return reportItems(this.report?.items) } },
  onLoad(query) {
    try {
      this.locator = validateShareLocator(query)
      const user = getStorage('userInfo')
      if (!getStorage('token') || !isPatientSession(user) || user?.mustChangePassword) this.rememberReturnRoute()
    }
    catch (error) { this.errorText = error.message }
  },
  onShow() {
    this.pageVisible = true
    this.loadReport()
  },
  onHide() { this.clearProtectedContent() },
  onUnload() { this.clearProtectedContent() },
  methods: {
    clearVideo() {
      if (this.videoPath) releaseMediaFile(this.videoPath)
      this.videoPath = ''; this.activeVideoId = ''; this.loadingVideoId = ''
    },
    clearProtectedContent() {
      this.pageVisible = false
      this.loadVersion += 1
      this.report = null
      this.clearVideo()
      this.loading = false
    },
    async loadReport() {
      if (!this.locator) return
      const version = ++this.loadVersion
      this.report = null
      this.clearVideo()
      const user = getStorage('userInfo')
      if (user?.mustChangePassword === true) {
        this.rememberReturnRoute()
        this.loading = false
        uni.reLaunch({ url: '/pages/change-password/change-password' })
        return
      }
      const requestedAccount = String(user?.userId || user?.id || '')
      const hasToken = Boolean(getStorage('token'))
      this.needsLogin = !hasToken || !isPatientSession(user)
      this.loading = false
      if (this.needsLogin) {
        this.errorText = hasToken ? '请切换到本报告所属客户账号后阅读。' : '请使用本报告所属客户账号登录后阅读。'
        return
      }
      this.loading = true
      this.errorText = ''
      try {
        const result = await getSharedExerciseReport(this.locator, user, { loading: false, showError: false })
        if (version !== this.loadVersion || !this.pageVisible || requestedAccount !== String(getStorage('userInfo')?.userId || getStorage('userInfo')?.id || '')) return
        if (!result.data?.id) throw new Error('服务端未返回有效报告，请稍后重试')
        this.report = result.data
      } catch (error) {
        if (version !== this.loadVersion) return
        this.errorText = error.statusCode === 404 ? '报告已过期、已撤销或链接无效，请联系营养师。' : (error.message || '报告读取失败，请稍后重试')
        this.needsLogin = error.statusCode === 401
        if (this.needsLogin) this.rememberReturnRoute()
      } finally { if (version === this.loadVersion) this.loading = false }
    },
    rememberReturnRoute() {
      if (!this.locator) return
      const entry = Object.entries(this.locator)[0]
      uni.setStorageSync('pendingPatientRoute', '/pages/shared-report/shared-report?' + entry[0] + '=' + encodeURIComponent(entry[1]))
      },
    loginToRead() {
      this.rememberReturnRoute()
      uni.reLaunch({ url: '/pages/login/login' })
    },
    async playVideo(item) {
      if (this.loadingVideoId || !item.mediaAssetId) return
      const version = this.loadVersion
      this.clearVideo()
      this.loadingVideoId = item.mediaAssetId
      let path = ''
      try {
        // Recheck this specific share before acquiring media, including revoke/expiry.
        const result = await getSharedExerciseReport(this.locator, getStorage('userInfo'), { loading: false, showError: false })
        if (!reportItems(result.data?.items).some(row => row.mediaAssetId === item.mediaAssetId)) throw new Error('报告中的动作视频已不可用')
        path = await resolveMediaFile(item.mediaAssetId)
        if (version !== this.loadVersion || !this.pageVisible) { releaseMediaFile(path); return }
        this.report = result.data
        this.videoPath = path
        this.activeVideoId = item.mediaAssetId
      } catch (error) {
        if (path) releaseMediaFile(path)
        if (version !== this.loadVersion) return
        if ([401, 403, 404].includes(error.statusCode)) {
          this.report = null; this.errorText = error.message || '报告授权已失效，请重新核验'
          if (error.statusCode === 401) { this.needsLogin = true; this.rememberReturnRoute() }
        }
        else showToast(error.message || '视频加载失败，请稍后重试')
      } finally { if (version === this.loadVersion) this.loadingVideoId = '' }
    },
    videoFailed() { this.clearVideo(); showToast('视频无法播放，请重新授权加载') },
    displayDate(value) {
      if (!value) return '未提供'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return '未提供'
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
    }
  }
}
</script>

<style scoped>
.shared-report-page { min-height: 100vh; background: #f3f7f8; padding: 32rpx 28rpx calc(48rpx + env(safe-area-inset-bottom)); box-sizing: border-box; color: #213941; }
.report-header { padding: 16rpx 4rpx 28rpx; }
.brand { display: block; font-size: 23rpx; color: #497585; }
.page-title { display: block; font-size: 42rpx; font-weight: 650; margin: 18rpx 0; }
.report-card, .state-card { background: #fff; padding: 30rpx; border-radius: 22rpx; margin-bottom: 24rpx; }
.section-title { display: block; font-size: 31rpx; font-weight: 600; }
.date, .hint { display: block; color: #667d85; font-size: 25rpx; line-height: 1.7; margin-top: 14rpx; }
.report-copy { display: block; font-size: 28rpx; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 18rpx; }
.precautions { border-left: 6rpx solid #dfa958; }
.prescription-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 24rpx; margin-top: 24rpx; }
.prescription-metrics text { display: block; font-size: 27rpx; line-height: 1.7; overflow-wrap: anywhere; }
.prescription-metrics text:first-child { color: #788c93; font-size: 24rpx; }
.video-button { margin: 24rpx 0 0; font-size: 27rpx; color: #226b8b; background: #e7f4f7; }
.exercise-video { display: block; width: 100%; height: 370rpx; margin-top: 24rpx; border-radius: 12rpx; }
.error-text { display: block; color: #a84431; font-size: 28rpx; line-height: 1.7; margin-bottom: 24rpx; }
.footer-note { font-size: 24rpx; line-height: 1.8; color: #74878f; padding: 8rpx; }
</style>

<style scoped>
/* Keep actions usable after the shared font reset, including narrow screens. */
.shared-report-page button { min-height: 44px; padding: 10px 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; border-radius: 10px; }
.state-card button { width: 100%; margin: 16px 0 0; }
.prescription-metrics { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
</style>
