<template>
  <view v-if="pageActive" class="care-client">
    <view v-if="loading" class="panel">正在加载已分配客户…</view>
    <view v-else-if="error" class="panel"><text class="error">{{ error }}</text><button @click="reload">重试</button></view>
    <template v-else-if="client">
      <view class="panel profile">
        <text class="eyebrow">MedTalent健康数字助手 · 营养师工作台</text>
        <text class="title">{{ client.patient.name }}</text>
        <text class="muted">仅展示已分配客户。客户姓名、电话及原始医学报告、签字同意书仍脱敏；元气盏打卡回答与照片仅可按当前有效绑定只读查看。</text>
        <view class="actions"><button @click="openMessages">客户留言</button><button @click="createFollow">新建随访</button><button @click="openFollow">随访记录</button></view>
      </view>

      <view class="panel">
        <text class="section-title">身体指标</text>
        <text v-if="!client.bodyReports.length" class="muted">暂无已核验的人体成分数据</text>
        <view v-for="body in client.bodyReports.slice(0, 3)" :key="body.id" class="entry">
          <text class="muted">{{ time(body.measuredAt) }}</text>
          <view class="metrics"><text>体重 {{ metric(body.weightKg, 'kg') }}</text><text>体脂 {{ metric(body.bodyFatPct, '%') }}</text><text>腰围 {{ metric(body.waistCm, 'cm') }}</text><text>臀围 {{ metric(body.hipCm, 'cm') }}</text><text>肌肉量 {{ metric(body.muscleMassKg, 'kg') }}</text><text>BMI {{ metric(body.bmi) }}</text></view>
        </view>
      </view>

      <YuanqizhanClientRecords :patient-id="patientId" :page-active="pageActive" />

      <view class="panel">
        <text class="section-title">运动报告 · 核对后发送</text>
        <text class="muted">每个新版都须重新核对。模拟发送不会真实外发，投递状态以回执为准；链接仅所属客户登录可读，到期或撤销后不可访问。</text>
        <text v-if="!client.exerciseReports.length" class="empty">运动老师尚未提交报告</text>
        <view v-for="report in client.exerciseReports" :key="report.id" class="entry report">
          <text class="sub-title">{{ report.version ? `第 ${report.version} 版` : '运动评估' }} · {{ time(report.createdAt) }}</text>
          <text class="body-copy">{{ report.assessment }}</text>
          <text v-if="report.precautions" class="caution">注意事项：{{ report.precautions }}</text>
          <view v-for="(item, index) in report.items" :key="`${report.id}-${index}`" class="exercise-item">
            <text class="sub-title">{{ index + 1 }}. {{ item.actionName }}</text>
            <text>{{ item.sets }} 组 × {{ item.reps }} 次 · 节奏 {{ item.tempo }} · 休息 {{ item.restSeconds }} 秒</text>
            <text>{{ item.frequency }} · 视频 {{ item.videoTitle || '训练示范' }}</text>
            <button v-if="item.mediaAssetId" size="mini" @click="playVideo(item.mediaAssetId)">核对动作视频</button>
          </view>
          <checkbox-group @change="reviewChanged(report, $event)"><label class="review-check"><checkbox value="reviewed" :checked="reviewed[report.id] === fingerprint(report)" /><text>已核对本版评估、动作、频次及注意事项</text></label></checkbox-group>
          <picker :disabled="busy || !!shareAttempts[report.id]" :range="expiryLabels" :value="expiryIndexes[report.id] === undefined ? 1 : expiryIndexes[report.id]" @change="expiryIndexes[report.id] = Number($event.detail.value)"><view class="expiry">有效期：{{ expiryLabels[expiryIndexes[report.id] === undefined ? 1 : expiryIndexes[report.id]] }}（点击修改）</view></picker>
          <text v-if="shareAttempts[report.id]" class="caution">{{ shareAttempts[report.id].message }}</text><button class="primary" :disabled="busy || reviewed[report.id] !== fingerprint(report) || (shareAttempts[report.id] && shareAttempts[report.id].status !== 'pending')" @click="sendReport(report)">{{ shareButtonText(report) }}</button><button v-if="shareAttempts[report.id] && ['sent', 'conflict'].includes(shareAttempts[report.id].status)" :disabled="busy" @click="startNewSend(report)">明确重新发送（新请求）</button>
          <view v-for="share in report.shares" :key="share.id" class="share-row">
            <text>{{ state(share) }} · {{ time(share.expiresAt) }} 到期</text><text v-if="share.delivery" class="muted">{{ deliveryMessage(share.delivery) }}</text>
            <view v-if="state(share) === '有效'" class="actions"><button size="mini" :disabled="busy" @click="copyShare(share)">复制受限分享</button><button size="mini" :disabled="busy" @click="revoke(report, share)">撤销此分享</button></view>
          </view>
        </view>
      </view>

      <view class="panel">
        <text class="section-title">健康记录与点评</text>
        <text class="muted">仅显示服务端授权的数据，餐食照片通过登录鉴权读取；记录按实际提交次数展示。</text>
        <view v-if="recordsError" class="entry"><text class="error">{{ recordsError }}</text><button @click="loadRecords">重试记录服务</button></view>
        <text v-else-if="recordsLoading" class="empty">正在加载记录…</text>
        <template v-else>
          <view class="actions filters"><button v-for="filter in filters" :key="filter.value" :class="{ selected: recordFilter === filter.value }" @click="recordFilter = filter.value">{{ filter.label }}</button></view>
          <text class="muted">已加载 {{ records.length }} / {{ recordsTotal }} 条。运动打卡尚未开放营养工作台读取。</text><text v-if="!filteredRecords.length" class="empty">已加载记录中暂无该分类，可继续加载历史</text><button v-if="records.length < recordsTotal" :disabled="recordsLoading" @click="loadRecords(true)">加载更多历史记录</button>
          <view v-for="record in filteredRecords" :key="record.id" class="entry">
            <text class="sub-title">{{ recordLabel(record) }} · {{ time(record.measuredAt || record.recordedAt || record.createdAt) }}</text>
            <text v-if="record.note || record.notes" class="body-copy">{{ record.note || record.notes }}</text>
            <view class="metrics"><text v-if="has(record.weightKg)">体重 {{ metric(record.weightKg, 'kg') }}</text><text v-if="has(record.waistCm)">腰围 {{ metric(record.waistCm, 'cm') }}</text><text v-if="has(record.hipCm)">臀围 {{ metric(record.hipCm, 'cm') }}</text><text v-if="has(record.sleepHours)">睡眠 {{ metric(record.sleepHours, '小时') }}</text><text v-if="has(record.durationMinutes)">运动 {{ metric(record.durationMinutes, '分钟') }}</text></view>
            <template v-if="record.recordType === 'DIET'">
              <text class="calories">整餐 {{ has(record.caloriesKcal) ? `${record.caloriesKcal} kcal` : '热量未估算' }} · {{ calorieSource(record.caloriesSource) }}</text>
              <text v-for="(food, index) in record.mealItems || []" :key="`${record.id}-food-${index}`" class="food">{{ food.name || '食物' }} {{ has(food.weightGrams) ? `${food.weightGrams}g` : '' }} {{ has(food.caloriesKcal) ? `· ${food.caloriesKcal} kcal` : '' }}</text>
              <view class="photos"><view v-for="asset in mealAssets(record)" :key="asset" class="photo-tile"><image v-if="mediaPaths[asset]" :src="mediaPaths[asset]" mode="aspectFill" @click="previewMeal(asset)" /><button v-else size="mini" @click="loadMealPhoto(asset)">{{ mediaErrors[asset] || '查看餐食照' }}</button></view></view>
            </template>
            <template v-if="['DIET','WEIGHT'].includes(record.recordType)">
              <button size="mini" @click="loadReviews(record)">查看全部点评与客户回复</button>
              <text v-if="reviewErrors[record.id]" class="error">{{ reviewErrors[record.id] }}</text>
              <view v-for="review in reviews[record.id] || []" :key="review.id" class="review">
                <text class="muted">{{ review.practitioner?.displayName || '服务团队' }} · {{ time(review.createdAt || review.updatedAt) }}</text><text>{{ review.comment }}</text>
                <view v-for="reply in review.replies || []" :key="reply.id" class="reply"><text class="muted">客户回复 · {{ time(reply.createdAt) }}</text><text>{{ reply.comment }}</text></view>
              </view>
              <view v-if="reviews[record.id]" class="review-form"><textarea v-model="reviewDrafts[record.id]" maxlength="2000" placeholder="新增点评；保留已有点评和回复" /><button class="primary" :disabled="busy || !String(reviewDrafts[record.id] || '').trim()" @click="submitReview(record)">新增点评</button></view>
            </template>
          </view>
        </template>
      </view>
      <view v-if="videoPath" class="video-overlay"><view class="video-panel"><video :src="videoPath" controls /><button @click="closeVideo">关闭视频</button></view></view>
    </template>
  </view>
</template>

<script>
import YuanqizhanClientRecords from './YuanqizhanClientRecords.vue'
import { SHARE_DAYS, getManagedClient, getNutritionRecords, getRecordReviews, addRecordReview, shareExerciseReport, revokeExerciseShare, restrictedShareText, reportFingerprint, shareState, createShareRequestKey, careSessionIdentity, shareDeliveryMessage, loadShareAttempt, saveShareAttempt, clearShareAttempt } from '../../utils/managed-care.js'
import { resolveMediaFile, releaseMediaFile } from '../../utils/media-access.js'

export default {
  components: { YuanqizhanClientRecords },
  props: { patientId: { type: String, required: true }, activeRevision: { type: Number, default: 0 }, pageActive: { type: Boolean, default: false } },
  data() { return { client: null, loading: true, error: '', records: [], recordsPage: 0, recordsTotal: 0, recordsLoading: false, recordsError: '', recordFilter: 'ALL', filters: [{ value: 'ALL', label: '全部' }, { value: 'DIET', label: '饮食' }, { value: 'WEIGHT', label: '体重' }, { value: 'SLEEP', label: '睡眠' }], reviewed: {}, expiryIndexes: {}, expiryLabels: SHARE_DAYS.map((days) => `${days} 天`), busy: false, reviews: {}, reviewDrafts: {}, reviewErrors: {}, shareAttempts: {}, mediaPaths: {}, mediaErrors: {}, videoPath: '', loadSequence: 0, recordsSequence: 0, reviewSequences: {}, videoSequence: 0, ownerSession: '', ownerPatientId: '' } },
  computed: { filteredRecords() { return this.records.filter((row) => this.recordFilter === 'ALL' || row.recordType === this.recordFilter) } },
  watch: {
    patientId: { immediate: true, handler() { if (this.pageActive) this.reload() } },
    pageActive(active) { if (active) this.reload(); else this.suspend() }
  },
  beforeUnmount() { this.suspend(); this.clearPrivateState() },
  methods: {
    fingerprint: reportFingerprint, state: shareState, deliveryMessage: shareDeliveryMessage,
    has(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) },
    metric(value, unit = '') { return this.has(value) ? `${Number(value)} ${unit}`.trim() : '未记录' },
    time(value) { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '时间未记录' },
    notify(message) { if (this.pageActive) uni.showToast({ title: message, icon: 'none' }) },
    context() { return { sequence: this.loadSequence, session: careSessionIdentity(), patientId: this.patientId } },
    isCurrent(context) {
      if (context.sequence !== this.loadSequence || context.patientId !== this.patientId) return false
      const session = careSessionIdentity()
      if (!session || context.session !== session || this.ownerSession !== session) {
        this.clearPrivateState(); this.error = '账号或权限已改变，请重新进入客户页面'; return false
      }
      return this.pageActive && context.sequence === this.loadSequence && context.patientId === this.patientId
    },
    clearPrivateState() {
      this.loadSequence++; this.releaseMedia(); this.client = null; this.records = []; this.reviews = {}; this.reviewDrafts = {}; this.reviewErrors = {}; this.reviewed = {}; this.shareAttempts = {}; this.expiryIndexes = {}; this.ownerSession = ''; this.ownerPatientId = ''; this.loading = false; this.recordsLoading = false; this.busy = false
    },
    suspend() {
      // Keep drafts only for the same in-memory account/page; opaque request keys are account-scoped.
      // Late network/media responses cannot repopulate hidden page data.
      this.loadSequence++; this.releaseMedia(); this.client = null; this.records = []; this.reviews = {}; this.reviewErrors = {}; this.loading = false; this.recordsLoading = false; this.busy = false
    },
    async reload() {
      if (!this.pageActive) return
      const session = careSessionIdentity()
      if (!session) { this.clearPrivateState(); this.error = '请使用营养师账号重新登录'; return }
      if (!this.patientId) { this.loading = false; this.error = '缺少客户标识，请从已分配客户列表进入'; return }
      if (this.ownerSession !== session || this.ownerPatientId !== this.patientId) this.clearPrivateState()
      this.ownerSession = session; this.ownerPatientId = this.patientId; this.loadSequence++
      const context = this.context()
      this.loading = true; this.recordsLoading = false; this.error = ''; this.client = null; this.records = []; this.reviews = {}; this.releaseMedia()
      try {
        const client = await getManagedClient(this.patientId)
        if (!this.isCurrent(context)) return
        for (const report of client.exerciseReports) { if (this.reviewed[report.id] !== reportFingerprint(report)) delete this.reviewed[report.id]; this.restoreAttempt(report) }
        this.client = client; await this.loadRecords()
      } catch (error) { if (this.isCurrent(context)) this.error = error.message || '客户资料加载失败' }
      finally { if (this.isCurrent(context)) this.loading = false }
    },
    async loadRecords(more = false) {
      if (!this.pageActive || this.recordsLoading) return
      const context = this.context(); if (!this.isCurrent(context)) return
      const requestSequence = ++this.recordsSequence
      this.recordsLoading = true; this.recordsError = ''
      try {
        const page = more === true ? this.recordsPage + 1 : 1
        const result = await getNutritionRecords(this.patientId, page)
        if (!this.isCurrent(context) || requestSequence !== this.recordsSequence) return
        this.records = more === true ? [...this.records, ...result.items.filter((item) => !this.records.some((previous) => previous.id === item.id))] : result.items
        this.recordsPage = page; this.recordsTotal = result.total
      } catch (error) { if (this.isCurrent(context) && requestSequence === this.recordsSequence) this.recordsError = `记录服务暂不可用：${error.message || '请稍后重试'}` }
      finally { if (this.isCurrent(context) && requestSequence === this.recordsSequence) this.recordsLoading = false }
    },
    recordLabel(record) { const meal = { BREAKFAST: '早餐', LUNCH: '午餐', DINNER: '晚餐', SNACK: '加餐' }; return record.recordType === 'DIET' ? meal[String(record.mealType).toUpperCase()] || '一餐饮食' : ({ WEIGHT: '体重', EXERCISE: '运动打卡', SLEEP: '睡眠', BODY_COMPOSITION: '身体指标' })[record.recordType] || '健康记录' },
    calorieSource(value) { return ({ MANUAL: '人工修正', ITEM_SUM: '食物合计', ITEM_SUM_PARTIAL: '部分食物合计', ESTIMATE: '参考估算', ESTIMATED: '估算值', PROVIDER: '服务估算', FOOD_DATABASE: '食物库汇总', FOOD_SUM: '食物明细汇总', LEGACY: '历史记录来源', UNKNOWN: '未估算' })[value] || '来源未注明' },
    mealAssets(record) {
      if (record.recordType !== 'DIET') return []
      const rows = record.imageAssetIds || record.mediaAssets || record.media || []
      return [...new Set(rows.map((asset) => typeof asset === 'string' ? asset : asset.id || asset.mediaAssetId).filter((id) => /^[A-Za-z0-9_-]{1,191}$/.test(String(id))))]
    },
    async loadMealPhoto(id) {
      const context = this.context(); if (!this.isCurrent(context)) return
      try {
        const path = await resolveMediaFile(id)
        if (!this.isCurrent(context)) { releaseMediaFile(path); return }
        if (this.mediaPaths[id]) releaseMediaFile(this.mediaPaths[id])
        this.mediaPaths[id] = path; delete this.mediaErrors[id]
      } catch (error) { if (this.isCurrent(context)) { this.mediaErrors[id] = '照片未能读取，点击重试'; this.notify(error.message || '照片读取失败') } }
    },
    previewMeal(id) { if (this.isCurrent(this.context()) && this.mediaPaths[id]) uni.previewImage({ current: this.mediaPaths[id], urls: [this.mediaPaths[id]] }) },
    async playVideo(id) {
      const context = this.context(); if (!this.isCurrent(context)) return
      this.closeVideo(); const requestSequence = this.videoSequence
      try {
        const path = await resolveMediaFile(id)
        if (!this.isCurrent(context) || requestSequence !== this.videoSequence) { releaseMediaFile(path); return }
        this.videoPath = path
      } catch (error) { if (this.isCurrent(context) && requestSequence === this.videoSequence) this.notify(error.message || '视频读取失败') }
    },
    closeVideo() { this.videoSequence++; if (this.videoPath) releaseMediaFile(this.videoPath); this.videoPath = '' },
    releaseMedia() { Object.values(this.mediaPaths).forEach(releaseMediaFile); this.mediaPaths = {}; this.closeVideo() },
    async loadReviews(record) {
      const context = this.context(); if (!this.isCurrent(context)) return
      const requestSequence = (this.reviewSequences[record.id] || 0) + 1; this.reviewSequences[record.id] = requestSequence
      try {
        const reviews = await getRecordReviews(this.patientId, record.id)
        if (!this.isCurrent(context) || this.reviewSequences[record.id] !== requestSequence) return
        this.reviews[record.id] = reviews; delete this.reviewErrors[record.id]
      } catch (error) { if (this.isCurrent(context) && this.reviewSequences[record.id] === requestSequence) this.reviewErrors[record.id] = `点评服务暂不可用：${error.message}` }
    },
    async submitReview(record) {
      if (this.busy || !this.reviews[record.id]) return
      const context = this.context(); if (!this.isCurrent(context)) return
      this.busy = true
      try {
        await addRecordReview(this.patientId, record.id, this.reviewDrafts[record.id])
        if (!this.isCurrent(context)) return
        this.reviewDrafts[record.id] = ''; await this.loadReviews(record)
        if (this.isCurrent(context)) this.notify('点评已保存')
      } catch (error) { if (this.isCurrent(context)) this.notify(error.message || '点评保存失败，内容已保留') }
      finally { if (this.isCurrent(context)) this.busy = false }
    },
    reviewChanged(report, event) { if (event.detail.value.includes('reviewed')) this.reviewed[report.id] = reportFingerprint(report); else delete this.reviewed[report.id] },
    restoreAttempt(report) {
      if (this.shareAttempts[report.id]) return this.shareAttempts[report.id]
      const saved = loadShareAttempt(this.patientId, report.id)
      if (!saved) return null
      const message = saved.status === 'sent' ? shareDeliveryMessage(saved.delivery) : saved.status === 'conflict' ? '原发送请求已失效，请明确重新发送并核对本版报告。' : '上次发送尚未确认。重新核对后重试原发送，将复用原请求，避免重复通知。'
      this.shareAttempts[report.id] = { ...saved, fingerprint: reportFingerprint(report), message }
      this.expiryIndexes[report.id] = SHARE_DAYS.indexOf(saved.expiresInDays)
      return this.shareAttempts[report.id]
    },
    shareButtonText(report) {
      const status = this.shareAttempts[report.id]?.status
      return status === 'pending' ? '重试原发送（避免重复通知）' : status === 'sent' ? '本次发送已确认' : status === 'conflict' ? '原请求已失效，请明确重新发送' : '核对并应用内发送'
    },
    startNewSend(report) {
      if (this.busy || !this.isCurrent(this.context())) return
      const attempt = this.shareAttempts[report.id]
      if (!attempt || !['sent', 'conflict'].includes(attempt.status)) return
      try { clearShareAttempt(this.patientId, report.id) } catch { this.notify('无法重建发送请求，请稍后重试'); return }
      delete this.shareAttempts[report.id]; delete this.reviewed[report.id]
      this.notify('请重新核对；下次发送将创建新的请求')
    },
    async sendReport(report) {
      if (this.busy) return
      const context = this.context(); if (!this.isCurrent(context)) return
      let existing
      try { existing = this.restoreAttempt(report) } catch (error) { this.notify(error.message); return }
      if (existing && ['sent', 'conflict'].includes(existing.status)) return
      const reviewed = this.reviewed[report.id]
      if (reviewed !== reportFingerprint(report)) { this.notify('请重新核对本版运动报告'); return }
      const attempt = existing || { idempotencyKey: createShareRequestKey(), expiresInDays: SHARE_DAYS[this.expiryIndexes[report.id] === undefined ? 1 : this.expiryIndexes[report.id]], fingerprint: reviewed, status: 'pending', message: '本次发送尚未确认。失败重试将复用原请求，避免重复通知。' }
      if (attempt.fingerprint !== reviewed) { attempt.status = 'conflict'; attempt.message = '报告内容已变化，请明确重新发送并核对新版。'; return }
      try { saveShareAttempt(this.patientId, report.id, attempt) } catch { this.notify('无法保存发送请求状态，本次未发送，请稍后重试'); return }
      this.shareAttempts[report.id] = attempt; this.busy = true
      try {
        const latest = await getManagedClient(this.patientId)
        if (!this.isCurrent(context)) return
        const current = latest.exerciseReports.find((item) => item.id === report.id)
        if (!current || reportFingerprint(current) !== attempt.fingerprint) { attempt.status = 'conflict'; throw new Error('报告已更新或不可用，请明确重新发送并核对新版') }
        const share = await shareExerciseReport(current, reviewed, attempt.expiresInDays, attempt.idempotencyKey)
        if (!this.isCurrent(context)) return
        current.shares = [...current.shares.filter((item) => item.id !== share.id), share]
        this.client = latest; attempt.status = 'sent'; attempt.delivery = share.delivery; attempt.message = shareDeliveryMessage(share.delivery); attempt.shareId = share.id
        try { saveShareAttempt(this.patientId, report.id, attempt) } catch { attempt.message += '；本机状态保存失败，重新进入后请重试原请求核实' }
        delete this.reviewed[report.id]; this.notify(attempt.message)
      } catch (error) {
        if (!this.isCurrent(context)) return
        if (Number(error.statusCode) === 409) { attempt.status = 'conflict'; attempt.message = '原发送请求已到期、被撤销或已发生冲突。请点击“明确重新发送”，重新核对后创建新请求。' }
        else attempt.message = attempt.status === 'conflict' ? error.message : `发送未确认：${error.message || '网络异常'}。请重试原发送，避免重复通知。`
        try { saveShareAttempt(this.patientId, report.id, attempt) } catch { /* Pending durable key still allows safe retry. */ }
        this.notify(attempt.message)
      } finally { if (this.isCurrent(context)) this.busy = false }
    },
    copyShare(share) {
      const context = this.context(); if (!this.isCurrent(context)) return
      try { const data = restrictedShareText({ ...share, path: share.path || `/pages/shared-report/shared-report?shareId=${encodeURIComponent(share.id)}` }); uni.setClipboardData({ data, success: () => { if (this.isCurrent(context)) this.notify('已复制；仅所属客户登录可读') }, fail: () => { if (this.isCurrent(context)) this.notify('复制失败，请重试') } }) } catch (error) { this.notify(error.message) }
    },
    async revoke(report, share) {
      if (this.busy) return
      const context = this.context(); if (!this.isCurrent(context)) return
      this.busy = true
      try { await revokeExerciseShare(report.id, share.id); if (!this.isCurrent(context)) return; share.revokedAt = new Date().toISOString(); this.notify('该分享已撤销') }
      catch (error) { if (this.isCurrent(context)) this.notify(error.message || '撤销失败') }
      finally { if (this.isCurrent(context)) this.busy = false }
    },
    createFollow() { if (this.isCurrent(this.context())) uni.navigateTo({ url: `/pages/doctor/follow-add?patientId=${encodeURIComponent(this.patientId)}` }) },
    openFollow() { if (this.isCurrent(this.context())) uni.navigateTo({ url: '/pages/doctor/follow' }) },
    openMessages() { if (this.isCurrent(this.context())) uni.navigateTo({ url: `/pages/common/messages?otherUserId=${encodeURIComponent(this.patientId)}&otherUserName=${encodeURIComponent(this.client.patient.name)}&relatedId=${encodeURIComponent(this.patientId)}&relatedType=patient` }) }
  }
}
</script>

<style scoped>
.care-client{padding:24rpx 24rpx calc(40rpx + env(safe-area-inset-bottom));background:#f3f8fa;min-height:100vh;color:#19323d;box-sizing:border-box}.panel{padding:28rpx;margin-bottom:24rpx;background:#fff;border:1rpx solid #e0ebef;border-radius:24rpx}.profile,.entry,.review,.reply,.exercise-item{display:flex;flex-direction:column;gap:12rpx}.title{font-size:38rpx;font-weight:700;word-break:break-all}.eyebrow,.muted,.empty{color:#647e89;font-size:24rpx;line-height:1.6}.section-title{display:block;font-size:31rpx;font-weight:700;margin-bottom:16rpx}.sub-title{font-size:27rpx;font-weight:600}.body-copy{white-space:pre-wrap;line-height:1.7;word-break:break-word}.entry{margin-top:24rpx;padding-top:24rpx;border-top:1rpx solid #e6eef2}.metrics,.actions{display:flex;flex-wrap:wrap;gap:12rpx}.metrics text{font-size:25rpx;padding:8rpx;background:#f1f7f9}.actions button{font-size:24rpx;margin:0;min-width:130rpx;background:#edf6f8;color:#205c73}.primary{background:#237c98;color:white;width:100%;font-size:27rpx}.primary[disabled]{background:#e3ebee;color:#70838c}.review-check{display:flex;align-items:center;font-size:25rpx;line-height:1.5;padding:12rpx 0}.expiry{padding:18rpx;background:#edf6f8;border-radius:12rpx;font-size:26rpx}.exercise-item,.review{padding:20rpx;background:#f5f8fa;border-radius:12rpx;font-size:25rpx}.caution{padding:16rpx;background:#fff6df;font-size:25rpx}.share-row{font-size:24rpx;padding:16rpx 0;color:#54717e}.reply{border-left:4rpx solid #add4e0;padding-left:16rpx}.review-form textarea{box-sizing:border-box;width:100%;height:150rpx;background:#f4f7f8;margin:16rpx 0;padding:16rpx;font-size:26rpx}.calories,.food{font-size:25rpx}.photos{display:flex;flex-wrap:wrap;gap:12rpx}.photo-tile image{width:180rpx;height:180rpx;border-radius:12rpx}.error{display:block;color:#9e4437;font-size:26rpx;line-height:1.6}.empty{display:block;margin-top:20rpx}.filters{margin:20rpx 0}.filters .selected{background:#237c98;color:white}.video-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center}.video-panel{width:92%;background:#fff;padding:20rpx}.video-panel video{width:100%}button::after{border:0}
</style>

<style scoped>
/* Narrow-screen action spacing and reachable controls. */
.care-client button { min-height: 44px; height: auto; display: flex; align-items: center; justify-content: center; padding: 10px 14px; line-height: 1.5; font-size: 14px; overflow-wrap: anywhere; max-width: 100%; }
.care-client .actions { gap: 8px; }
.care-client .actions button { flex: 1 1 96px; min-width: 0; margin: 0; }
.care-client .filters button { flex-basis: 44px; padding: 10px 6px; }
.care-client .review-form, .care-client .video-panel { display: flex; flex-direction: column; gap: 12px; }
.care-client .review-form textarea { margin: 0; }
.care-client .video-panel { max-height: calc(100vh - 32px - env(safe-area-inset-bottom)); overflow-y: auto; }
</style>
