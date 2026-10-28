<template>
  <view class="activity-records panel">
    <view class="heading"><text class="section-title">元气盏每日打卡</text><button size="mini" :disabled="activitiesLoading" @tap="refresh">刷新</button></view>
    <text class="muted">按日期查看已分配客户的打卡回答和照片，只读展示。</text>
    <view v-if="error" class="state"><text class="error">{{ error }}</text><button @tap="refresh">重新核对权限并加载</button></view>
    <text v-else-if="activitiesLoading && !activities.length" class="state muted">正在加载客户活动…</text>
    <template v-else>
      <text v-if="!activities.length" class="state muted">该客户暂无可查看的元气盏活动。</text>
      <view v-if="activities.length" class="activity-picker"><button v-for="activity in activities" :key="activity.id" :class="{ selected: activity.id === activityId }" @tap="selectActivity(activity.id)">{{ activity.title }}</button></view>
      <button v-if="activitiesHasMore" :disabled="activitiesLoading" @tap="loadActivities(true)">加载更多活动</button>
      <template v-if="selectedActivity">
        <text class="muted">{{ selectedActivity.member?.startDate ? '起算日 ' + selectedActivity.member.startDate : '首次提交后开始' }} · 已完成 {{ selectedActivity.completedCount || 0 }} / {{ selectedActivity.durationDays || 15 }} 天{{ selectedActivity.status === 'ENDED' ? ' · 活动已结束' : '' }}{{ selectedActivity.member?.status === 'REMOVED' ? ' · 已移除参与资格' : '' }}</text>
        <text class="access-note">{{ accessNotice }}</text>
        <text v-if="recordsLoading && !records.length" class="state muted">正在加载每日记录…</text>
        <text v-else-if="!records.length" class="state muted">暂无已保存打卡。草稿不计作完成。</text>
        <view class="record-list"><button v-for="item in records" :key="item.id" class="record-row" :class="{ selected: record?.id === item.id }" @tap="openRecord(item)"><text>{{ item.date }} · 第{{ item.dayNumber }}天</text><text>{{ statusLabel(item.status) }}</text></button></view>
        <button v-if="recordsHasMore" :disabled="recordsLoading" @tap="loadRecords(true)">{{ recordsLoading ? '正在加载…' : '加载更多日期' }}</button>
        <text v-if="records.length" class="muted count">已加载 {{ records.length }} / {{ recordsTotal }} 条 · 北京时间</text>
      </template>
      <text v-if="detailLoading" class="state muted">正在读取当日打卡…</text>
      <view v-else-if="record" class="detail">
        <text class="detail-title">{{ record.date }} · 第{{ record.dayNumber }}天 · {{ statusLabel(record.status) }}</text>
        <text class="muted">{{ form.title }} · 只读{{ record.submittedAt ? ' · 提交于 ' + time(record.submittedAt) : '' }}</text>
        <view v-for="(question, index) in form.questions" :key="question.key" class="answer-row">
          <text class="question">{{ index + 1 }}. {{ question.label }}</text>
          <view v-if="question.type === 'inline_multiple_text'" class="subfields"><text v-for="field in question.subfields" :key="field.key">{{ field.label }} {{ textValue(record.answers?.[question.key]?.[field.key]) }}</text></view>
          <view v-else-if="question.type === 'file_upload'" class="photo-answer"><button v-if="record.photos?.[question.key]" @tap="openPhoto(question.key)">查看{{ photoLabel(question) }}</button><text v-else class="muted">未上传</text></view>
          <text v-else class="answer">{{ answerLabel(question) }}</text>
        </view>
      </view>
    </template>
    <view v-if="previewAsset" class="photo-overlay"><view class="photo-panel"><view class="heading"><text>{{ previewAsset.label }}</text><button @tap="closePhoto">关闭</button></view><text v-if="photoLoading" class="state muted">正在校验权限并读取原图…</text><image v-else-if="photoPath" :src="photoPath" mode="widthFix" class="protected-image" /></view></view>
  </view>
</template>

<script>
import store from '../../store/index.js'
import { careSessionIdentity } from '../../utils/managed-care.js'
import { getClientActivities, getClientActivityRecords, getClientActivityRecord } from '../../utils/yuanqizhan-staff.js'
import { formFromServer, statusLabel } from '../../utils/yuanqizhan-model.js'
import { resolveMediaFile, releaseMediaFile } from '../../utils/media-access.js'

export default {
  props: { patientId: { type: String, required: true }, pageActive: { type: Boolean, default: false } },
  data: () => ({ activities: [], activitiesPage: 0, activitiesHasMore: false, activitiesLoading: false, activityId: '', records: [], recordsPage: 0, recordsTotal: 0, recordsHasMore: false, recordsLoading: false, record: null, detailLoading: false, error: '', ownerSession: '', ownerPatientId: '', epoch: 0, detailSequence: 0, mediaSequence: 0, previewAsset: null, photoPath: '', photoLoading: false, unsubscribeSession: null }),
  computed: {
    selectedActivity() { return this.activities.find(item => item.id === this.activityId) || null },
    form() { const form = formFromServer(this.record?.form, this.record?.formType); return { ...form, questions: form.questions.filter(question => question.key !== 'name') } },
    accessNotice() { return this.record?.accessNotice || this.selectedActivity?.accessNotice || '仅限当前有效绑定的营养师查看本活动打卡回答与照片；姓名已隐藏，原始医学报告和签字同意书仍受原有权限限制。' }
  },
  watch: {
    patientId: { immediate: true, handler() { if (this.pageActive) this.refresh(); else this.clearPrivateState() } },
    pageActive(active) { if (active) this.refresh(); else this.clearPrivateState() }
  },
  mounted() { this.unsubscribeSession = store.subscribe('user', () => { if (careSessionIdentity() !== this.ownerSession) this.clearPrivateState() }) },
  beforeUnmount() { this.clearPrivateState(); this.unsubscribeSession?.() },
  methods: {
    statusLabel,
    textValue(value) { return value === null || value === undefined || value === '' ? '未填写' : String(value) },
    time(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '时间未记录' },
    answerLabel(question) {
      const value = this.record?.answers?.[question.key]
      if (value === undefined || value === null || value === '') return '未填写'
      if (question.type === 'single_choice') return question.options.find(option => String(option.value) === String(value))?.label || String(value)
      return `${value}${question.unit ? ' ' + question.unit : ''}`
    },
    photoLabel(question) { return String(question.label || '照片').replace(/[：:]$/, '') },
    context() { return { epoch: this.epoch, session: this.ownerSession, patientId: this.patientId, activityId: this.activityId } },
    isCurrent(context) {
      if (context.epoch !== this.epoch || context.patientId !== this.patientId || context.activityId !== this.activityId || !this.pageActive) return false
      if (!context.session || careSessionIdentity() !== context.session || this.ownerSession !== context.session) { this.clearPrivateState(); this.error = '账号或权限已变化，请重新进入已分配客户'; return false }
      return true
    },
    closePhoto() { this.mediaSequence++; releaseMediaFile(this.photoPath); this.photoPath = ''; this.previewAsset = null; this.photoLoading = false },
    clearPrivateState() {
      this.epoch++; this.detailSequence++; this.closePhoto(); this.activities = []; this.activitiesPage = 0; this.activitiesHasMore = false; this.activitiesLoading = false; this.activityId = ''; this.records = []; this.recordsPage = 0; this.recordsTotal = 0; this.recordsHasMore = false; this.recordsLoading = false; this.record = null; this.detailLoading = false; this.error = ''; this.ownerSession = ''; this.ownerPatientId = ''
    },
    failRead(error, context) { if (this.isCurrent(context)) { this.clearPrivateState(); this.error = error.message || '当前无权读取该客户活动，请重新核对绑定关系' } },
    async refresh() {
      this.clearPrivateState()
      if (!this.pageActive) return
      const session = careSessionIdentity()
      if (!session || !this.patientId) { this.error = '请使用营养师账号从已分配客户进入'; return }
      this.ownerSession = session; this.ownerPatientId = this.patientId
      await this.loadActivities()
    },
    async loadActivities(more = false) {
      if (this.activitiesLoading) return
      const context = this.context(); if (!this.isCurrent(context)) return
      this.activitiesLoading = true
      try {
        const page = more === true ? this.activitiesPage + 1 : 1
        const result = await getClientActivities(this.patientId, page)
        if (!this.isCurrent(context)) return
        this.activities = more === true ? [...this.activities, ...result.items.filter(item => !this.activities.some(previous => previous.id === item.id))] : result.items
        this.activitiesPage = page; this.activitiesHasMore = result.hasMore === true; this.activitiesLoading = false
        if (!this.activities.some(item => item.id === this.activityId) && this.activities.length) await this.selectActivity(this.activities[0].id)
      } catch (error) { this.failRead(error, context) }
      finally { if (this.isCurrent(context)) this.activitiesLoading = false }
    },
    async selectActivity(activityId) {
      if (!this.activities.some(item => item.id === activityId) || !this.isCurrent(this.context())) return
      this.epoch++; this.detailSequence++; this.closePhoto(); this.activityId = activityId; this.record = null; this.records = []; this.recordsPage = 0; this.recordsTotal = 0; this.recordsHasMore = false; this.recordsLoading = false; this.activitiesLoading = false; this.detailLoading = false; this.error = ''
      await this.loadRecords()
    },
    async loadRecords(more = false) {
      if (!this.activityId || this.recordsLoading) return
      const context = this.context(); if (!this.isCurrent(context)) return
      this.recordsLoading = true
      try {
        const page = more === true ? this.recordsPage + 1 : 1
        const result = await getClientActivityRecords(this.activityId, this.patientId, page)
        if (!this.isCurrent(context)) return
        this.records = more === true ? [...this.records, ...result.items.filter(item => !this.records.some(previous => previous.id === item.id))] : result.items
        this.recordsPage = page; this.recordsTotal = result.total; this.recordsHasMore = result.hasMore === true
      } catch (error) { this.failRead(error, context) }
      finally { if (this.isCurrent(context)) this.recordsLoading = false }
    },
    async openRecord(item) {
      const context = this.context(); if (!this.isCurrent(context) || !this.records.some(row => row.id === item.id)) return
      const sequence = ++this.detailSequence
      this.closePhoto(); this.record = null; this.detailLoading = true
      try {
        const record = await getClientActivityRecord(this.activityId, this.patientId, item.date)
        if (this.isCurrent(context) && sequence === this.detailSequence) this.record = record
      } catch (error) { if (sequence === this.detailSequence) this.failRead(error, context) }
      finally { if (this.isCurrent(context) && sequence === this.detailSequence) this.detailLoading = false }
    },
    async openPhoto(slot) {
      const context = this.context(); if (!this.isCurrent(context) || !this.record?.photos?.[slot]) return
      const recordId = this.record.id, date = this.record.date
      this.closePhoto(); const sequence = this.mediaSequence
      this.previewAsset = { id: this.record.photos[slot], label: this.photoLabel(this.form.questions.find(question => question.key === slot) || {}) }; this.photoLoading = true
      try {
        // Recheck the binding and record before each original-photo request.
        const latest = await getClientActivityRecord(this.activityId, this.patientId, date)
        if (!this.isCurrent(context) || sequence !== this.mediaSequence || this.record?.id !== recordId) return
        if (latest.photos?.[slot] !== this.previewAsset?.id) throw new Error('该照片已更新，请重新加载当日记录')
        const path = await resolveMediaFile(this.previewAsset.id)
        if (!this.isCurrent(context) || sequence !== this.mediaSequence || this.record?.id !== recordId) { releaseMediaFile(path); return }
        this.photoPath = path
      } catch (error) { if (sequence === this.mediaSequence) this.failRead(error, context) }
      finally { if (this.isCurrent(context) && sequence === this.mediaSequence) this.photoLoading = false }
    }
  }
}
</script>

<style scoped>
.panel{padding:28rpx;margin-bottom:24rpx;background:#fff;border:1rpx solid #e0ebef;border-radius:24rpx;color:#19323d}.heading{display:flex;align-items:center;justify-content:space-between;gap:16rpx}.section-title{font-size:31rpx;font-weight:700}.muted{display:block;color:#647e89;font-size:24rpx;line-height:1.7;overflow-wrap:anywhere}.state{display:block;padding:24rpx 0}.error{display:block;color:#9e4437;font-size:26rpx;line-height:1.6}.activity-picker{display:flex;flex-wrap:wrap;gap:12rpx;margin:24rpx 0}.activity-picker button{flex:1 1 200rpx;margin:0}.activity-records button{min-height:44px;height:auto;display:flex;align-items:center;justify-content:center;padding:10px 14px;line-height:1.5;font-size:14px;max-width:100%;white-space:normal;overflow-wrap:anywhere;background:#edf6f8;color:#205c73;border-radius:12rpx}.activity-records button::after{border:0}.activity-records .selected{background:#237c98;color:#fff}.access-note{display:block;background:#f1f7f9;padding:20rpx;margin:16rpx 0;color:#486975;font-size:24rpx;line-height:1.7}.record-list{display:flex;flex-direction:column;gap:12rpx;margin:24rpx 0}.record-row{width:100%;display:flex;justify-content:space-between!important;gap:12rpx;text-align:left}.record-row text{display:block}.count{margin-top:16rpx}.detail{margin-top:28rpx;border-top:1rpx solid #e6eef2;padding-top:24rpx}.detail-title{display:block;font-size:28rpx;font-weight:700;line-height:1.6;margin-bottom:12rpx}.answer-row{padding:24rpx 0;border-bottom:1rpx solid #e6eef2}.question{display:block;font-size:27rpx;font-weight:600;line-height:1.7}.answer,.subfields{display:block;margin-top:16rpx;font-size:26rpx;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere}.subfields text{display:block}.photo-answer{margin-top:16rpx}.photo-overlay{position:fixed;inset:0;z-index:1250;padding:20px 12px calc(20px + env(safe-area-inset-bottom));box-sizing:border-box;background:rgba(14,33,44,.65);display:flex;align-items:center;justify-content:center}.photo-panel{box-sizing:border-box;width:100%;max-width:540px;max-height:90vh;overflow:auto;border-radius:14px;background:white;padding:16px}.photo-panel .heading{position:sticky;top:0;background:white;padding-bottom:12px;font-size:16px}.photo-panel .heading button{margin:0;flex-shrink:0}.protected-image{display:block;width:100%}
</style>
