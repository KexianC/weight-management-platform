<template>
  <view v-if="canShare" class="daily-share-card">
    <text class="daily-share-title">每日填报</text>
    <text class="daily-share-hint">每位客户一个专属入口，体重必填，其余选填。请将链接或二维码发到该客户本人的服务群。</text>
    <button class="daily-share-action" :disabled="loading || !pageActive" @tap="load">{{ loading ? '正在获取…' : link ? '刷新链接与填报记录' : '获取专属链接和二维码' }}</button>
    <text v-if="error" class="daily-share-error">{{ error }}</text>
    <text v-if="revoked" class="daily-share-hint">此客户的填报链接已停用，请在电脑管理端重新启用。</text>
    <view v-if="link" class="daily-share-result">
      <image v-if="qrAsset && qrAsset.path" :src="qrAsset.path" mode="aspectFit" class="daily-share-qr" @error="qrFailed" />
      <text v-if="qrError" class="daily-share-error">{{ qrError }}</text>
      <text class="daily-share-hint">扫码或打开链接即可免登录填报。链接仅供此客户使用。</text>
      <button class="daily-share-copy" @tap="copyLink">复制专属填报链接</button>
    </view>
    <view v-if="loaded" class="daily-share-records">
      <text class="daily-share-subtitle">最近填报</text>
      <text v-if="recordsError" class="daily-share-error">{{ recordsError }}</text>
      <view v-for="record in records" :key="record.date" class="daily-share-record"><text>{{ record.date }}</text><text>{{ record.weightKg }} kg</text></view>
      <text v-if="!records.length && !recordsError" class="daily-share-hint">客户尚未提交每日填报。</text>
      <text v-if="records.length" class="daily-share-hint">显示最近5条，完整填报内容可在电脑管理端查看。</text>
    </view>
  </view>
</template>

<script>
import { canShareDailyCheckIn, dailyShareIdentity, getDailyCheckInLink, getDailyCheckInRecords, dailyCheckInQrAsset, releaseDailyCheckInQr } from '../utils/daily-check-in-share.js'

export default {
  props: { patientId: { type: String, required: true }, canShare: { type: Boolean, default: false }, pageActive: { type: Boolean, default: false }, activeRevision: { type: Number, default: 0 } },
  data: () => ({ link: '', qrAsset: null, records: [], error: '', recordsError: '', qrError: '', revoked: false, loading: false, loaded: false, epoch: 0, owner: '' }),
  watch: {
    patientId() { this.suspend() },
    canShare() { this.suspend() },
    pageActive() { this.suspend() },
    activeRevision() { this.suspend() }
  },
  beforeUnmount() { this.suspend() },
  methods: {
    suspend() {
      this.epoch++
      releaseDailyCheckInQr(this.qrAsset)
      this.link = ''; this.qrAsset = null; this.records = []; this.error = ''; this.qrError = ''; this.recordsError = ''; this.revoked = false; this.loaded = false; this.loading = false; this.owner = ''
    },
    current(context) {
      return this.pageActive && this.canShare && canShareDailyCheckIn() && context.epoch === this.epoch && context.patientId === this.patientId && context.owner === dailyShareIdentity()
    },
    async load() {
      if (this.loading || !this.pageActive || !this.canShare) return
      this.suspend()
      if (!canShareDailyCheckIn()) { this.error = '请使用负责此客户的健管师或医生账号'; return }
      const context = { epoch: this.epoch, patientId: this.patientId, owner: dailyShareIdentity() }
      this.owner = context.owner; this.loading = true
      try {
        const result = await getDailyCheckInLink(context.patientId)
        if (!this.current(context)) return
        this.revoked = result.revoked
        this.link = result.url
        if (this.link) {
          try {
            const asset = await dailyCheckInQrAsset(result.qrDataUrl)
            if (!this.current(context)) { releaseDailyCheckInQr(asset); return }
            this.qrAsset = asset
          } catch (error) { if (this.current(context)) this.qrError = error.message || '二维码显示失败，可先复制链接' }
        }
        if (!this.current(context)) return
        try {
          const records = await getDailyCheckInRecords(context.patientId)
          if (this.current(context)) { this.records = records; this.loaded = true }
        } catch (error) {
          if (this.current(context)) {
            if ([401, 403, 404].includes(error.statusCode)) { this.suspend(); this.error = '客户权限已变化，请重新进入客户档案'; return }
            this.recordsError = error.message || '填报记录读取失败'; this.loaded = true
          }
        }
      } catch (error) { if (this.current(context)) this.error = error.message || '专属填报入口获取失败，请稍后重试' }
      finally { if (context.epoch === this.epoch) { if (this.current(context)) this.loading = false; else this.suspend() } }
    },
    copyLink() {
      const context = { epoch: this.epoch, patientId: this.patientId, owner: this.owner }
      if (!this.link || !this.current(context)) { this.suspend(); return }
      uni.setClipboardData({ data: this.link, success: () => { if (this.current(context)) uni.showToast({ title: '已复制，请发到该客户服务群', icon: 'none' }) }, fail: () => { if (this.current(context)) this.error = '复制失败，请重试' } })
    },
    qrFailed() { releaseDailyCheckInQr(this.qrAsset); this.qrAsset = null; this.qrError = '二维码显示失败，可复制专属链接或刷新重试' }
  }
}
</script>

<style scoped>
.daily-share-card{padding:20px;background:#fff;border:1px solid #dce8ed;border-radius:18px;margin:18px 0;color:#213941}
.daily-share-title,.daily-share-subtitle{display:block;font-size:18px;font-weight:600;margin-bottom:10px}.daily-share-subtitle{font-size:15px}
.daily-share-hint,.daily-share-error{display:block;font-size:13px;line-height:1.7;margin:10px 0;overflow-wrap:anywhere}.daily-share-hint{color:#667d85}.daily-share-error{color:#a1373c}
.daily-share-action,.daily-share-copy{font-size:14px;line-height:1.6;min-height:44px;display:flex;align-items:center;justify-content:center;margin:14px 0 0;border-radius:10px;padding:10px 12px;background:#e8f3f7;color:#1a647f}.daily-share-copy{background:#167c9b;color:#fff}
.daily-share-result{text-align:center;padding-top:16px}.daily-share-qr{display:block;width:220px;height:220px;max-width:100%;margin:0 auto;background:#fff}
.daily-share-records{border-top:1px solid #e5edf0;margin-top:18px;padding-top:16px}.daily-share-record{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:9px 0;border-bottom:1px solid #f0f4f6}
</style>
