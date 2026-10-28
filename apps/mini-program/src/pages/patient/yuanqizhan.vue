<template>
  <view class="yuanqizhan-page patient-theme">
    <view class="activity-heading">
      <text class="eyebrow">元气盏 · 每日健康记录</text>
      <text class="page-title">{{ today?.activity?.title || '元气盏活动打卡' }}</text>
      <text class="intro">从你加入当天算起，按北京时间自然日记录15天。</text>
    </view>
    <view v-if="loading && !today" class="state-card"><text>正在核对参与资格…</text></view>
    <view v-if="error" class="state-card error-card"><text>{{ error }}</text><button @tap="refresh">重新加载</button></view>
    <view v-if="!loading && !error && !activities.length" class="state-card"><text>暂无可查看的活动。管理员或健管师配置参与名单后才会显示入口。</text><button @tap="goHome">返回首页</button></view>
    <view v-if="activities.length > 1" class="activity-picker">
      <button v-for="item in activities" :key="item.id" :class="{ selected: item.id === activityId }" :disabled="saving || choosing" @tap="selectActivity(item.id)">{{ item.title }}</button>
    </view>
    <template v-if="today && !error">
      <view class="progress-card">
        <view class="progress-line"><text>{{ today.dayNumber == null ? '尚未开始' : today.dayNumber > 15 ? '15天活动已结束' : '第 ' + today.dayNumber + ' 天 / 15天' }}</text><text class="status-pill">{{ statusLabel(today.record?.status) }}</text></view>
        <text class="date-line">{{ today.date }} · 北京时间 · 加入日 {{ today.member.startDate }}</text>
        <text v-if="!today.canWrite" class="read-only-note">{{ writeBlockedLabel(today.writeBlockedReason) }}</text>
        <text v-else class="hint">Day1、Day8、Day15填写阶段表；其他天填写日常表。仅当天可保存、提交和修改。</text>
      </view>
      <view class="section-tabs">
        <button :class="{ selected: section === 'today' }" :disabled="saving || choosing" @tap="openToday">今日打卡</button>
        <button :class="{ selected: section === 'history' }" :disabled="saving || choosing" @tap="openHistory">历史记录</button>
      </view>
      <view v-if="section === 'history'" class="history-card">
        <text class="card-title">历史记录</text><text class="hint">草稿不计完成；过去日期仅可查看，不能补填或修改。</text>
        <text v-if="historyLoading" class="hint">加载记录中…</text>
        <text v-else-if="!history.length" class="hint">还没有已保存的记录。</text>
        <button v-for="record in history" :key="record.id" class="history-row" :class="{ selected: viewRecord?.id === record.id }" @tap="viewHistoryRecord(record)"><text>{{ record.date }} · 第{{ record.dayNumber }}天</text><text>{{ statusLabel(record.status) }}</text></button>
        <button v-if="historyHasMore" :disabled="historyLoading" @tap="loadHistory(true)">加载更多</button>
      </view>
      <view v-if="section === 'today' || viewRecord" class="form-card">
        <view class="form-heading"><text class="card-title">{{ form.title }}</text><text>{{ form.questionCount }}题</text></view>
        <text v-if="section === 'history'" class="read-only-note">{{ viewRecord.date }} · 第{{ viewRecord.dayNumber }}天 · {{ statusLabel(viewRecord.status) }} · 只读</text>
        <text v-if="section === 'today' && today.record?.status === 'SUBMITTED'" class="hint">今天已经提交，仍可在北京时间当天修改。保存不会覆盖他人或其他设备的更新。</text>
        <view class="privacy-note"><text class="privacy-title">资料与照片用途</text><text>用于本活动健康管理，由你主动填写、选择并提交。你本人及沿现有服务关系获得授权的医生、健管师可查看相应健康内容；当前有效绑定的营养师可只读查看本活动打卡回答与照片，姓名隐藏，解除绑定后不再可读。此权限仅适用于元气盏打卡，不扩展原始医学报告和签字同意书权限；管理员配置名单、运动老师不因此获得答案和原图权限。照片保存为私有原件并长期保留，移除或结束后你仍可查看本人历史。选择照片后将上传私有存储；上传不代表已完成打卡。</text><text>评分按原题分别记录，大便1–7为分类；不生成总分、诊断或自动健康建议。</text></view>
        <view v-if="conflict" class="conflict-note"><text>记录已在其他设备更新，当前输入已保留。请重新加载最新记录后再修改。</text><button @tap="reloadLatest">重新加载最新记录</button></view>
        <view v-if="saveMessage" class="save-note"><text>{{ saveMessage }}</text></view>
        <form @submit="submitForm">
          <view v-for="(question, index) in form.questions" :id="'q-' + question.key" :key="question.key" class="question-row">
            <view class="question-label"><text class="question-number">{{ index + 1 }}</text><text>{{ question.label }}</text><text class="required-star">*</text></view>
            <template v-if="question.type === 'text'">
              <view class="measurement-input"><input :name="question.key" :value="answers[question.key]" :type="question.unit ? 'digit' : 'text'" :maxlength="question.key === 'name' ? 80 : 20" :disabled="!editable" :adjust-position="true" :cursor-spacing="28" :placeholder="question.unit ? '填写数值' : '填写您的姓名'" @input="setAnswer(question.key, $event.detail.value)" /><text v-if="question.unit" class="unit">{{ question.unit }}</text></view>
              <text v-if="question.unit" class="hint">统一使用{{ question.unit }}，最多4位小数。</text>
            </template>
            <radio-group v-else-if="question.type === 'single_choice'" :name="question.key" @change="setChoice(question.key, $event.detail.value)">
              <label v-for="option in question.options" :key="option.value" class="option-row" :class="{ checked: answers[question.key] === option.value }"><radio :value="String(option.value)" :checked="answers[question.key] === option.value" :disabled="!editable" color="#168fb9" /><text>{{ option.label }}</text></label>
            </radio-group>
            <view v-else-if="question.type === 'inline_multiple_text'" class="bowel-fields">
              <view v-for="field in question.subfields" :key="field.key" class="bowel-field"><text class="subfield-label">{{ field.label }}</text><input :name="field.key" :value="answers.bowel_observation[field.key]" type="text" :maxlength="500" :disabled="!editable" :adjust-position="true" :cursor-spacing="28" :placeholder="field.key === 'bowel_extra' ? '可不填' : '自由填写'" @input="setBowel(field.key, $event.detail.value)" /><text class="hint">{{ field.hint }}</text></view>
              <text class="hint">本题三项任意一项填写即可，其他排便观察可留空。</text>
            </view>
            <view v-else-if="question.type === 'file_upload'" class="photo-slot">
              <view v-if="photos[question.key]?.assetId" class="photo-attached"><image v-if="photos[question.key].path" :src="photos[question.key].path" mode="aspectFit" @tap="previewPhoto(question.key)" /><text v-else>已上传私有照片</text><button @tap="previewPhoto(question.key)">查看原图</button></view>
              <view class="photo-actions"><button v-if="editable" :disabled="choosing" @tap="choosePhoto(question.key)">{{ photos[question.key]?.assetId ? '替换照片' : '选择并上传照片' }}</button><button v-if="editable && photos[question.key]?.assetId" class="text-button" @tap="removePhoto(question.key)">取消本次选用</button></view>
              <text class="hint">每项1张，≤10MiB（10485760字节），支持JPEG、PNG、WebP；使用原图，不自动压缩。已保存的历史原件不会因替换而删除。</text>
              <text v-if="photoErrors[question.key]" class="field-error">{{ photoErrors[question.key] }}</text>
            </view>
          </view>
          <view v-if="section === 'today'" class="form-actions">
            <text v-if="dirty" class="hint">{{ today.record?.status === 'SUBMITTED' ? '当前有未保存修改。已提交后请使用“提交当天修改”。' : '当前有未保存修改。请主动保存草稿或提交，草稿保存在服务端。' }}</text>
            <text v-if="!editable" class="read-only-note">{{ conflict ? '请先加载最新记录。' : writeBlockedLabel(today.writeBlockedReason) }}</text>
            <view class="action-buttons"><button :disabled="!editable || today.record?.status === 'SUBMITTED'" @tap="save('DRAFT')">保存草稿</button><button class="primary-button" :disabled="!editable" form-type="submit">{{ saving ? '保存中…' : today.record?.status === 'SUBMITTED' ? '提交当天修改' : '提交今日打卡' }}</button></view>
            <text class="hint">{{ saving ? '正在校验并保存，请稍候。' : '提交后才计完成；网络超时可重试，相同内容保留同一请求编号。' }}</text>
          </view>
        </form>
      </view>
    </template>
    <ProtectedMedia v-if="previewAsset && visible" :asset="previewAsset" @close="previewAsset = null" />
  </view>
</template>
<script>
import store from '../../store/index.js'
import ProtectedMedia from '../../components/ProtectedMedia.vue'
import { resolveMediaFile, releaseMediaFile } from '../../utils/media-access.js'
import { patientActivitySession, getMyActivities, getActivityToday, getActivityRecords, getActivityRecord, saveActivityRecord, uploadActivityPhoto } from '../../utils/yuanqizhan.js'
import { activityForm, formFromServer, emptyAnswers, hydrateAnswers, buildActivityAnswers, buildActivityPhotos, prepareActivitySubmission, statusLabel, writeBlockedLabel, photoState, PHOTO_MAX_BYTES } from '../../utils/yuanqizhan-model.js'

export default {
  components: { ProtectedMedia },
  data: () => ({ activities: [], activityId: '', accountId: '', today: null, section: 'today', viewRecord: null, answers: emptyAnswers(), photos: photoState(), photoErrors: {}, previewAsset: null, history: [], historyPage: 0, historyHasMore: false, historyLoading: false, loading: false, saving: false, choosing: false, visible: false, dirty: false, conflict: false, pendingSubmission: null, baseVersion: 0, error: '', saveMessage: '', epoch: 0, mediaEpoch: 0, unsubscribeSession: null }),
  computed: {
    form() { return this.section === 'history' ? formFromServer(this.viewRecord?.form, this.viewRecord?.formType) : formFromServer(this.today?.form, this.today?.formType) },
    editable() { return this.visible && this.section === 'today' && this.today?.canWrite === true && !this.loading && !this.saving && !this.choosing && !this.conflict && Boolean(this.accountId) }
  },
  onLoad(options) {
    this.activityId = typeof options?.activityId === 'string' ? options.activityId : ''
    this.unsubscribeSession = store.subscribe('user', () => { if (patientActivitySession() !== this.accountId) this.clearSession() })
  },
  onShow() { this.visible = true; this.refresh() },
  onHide() { this.visible = false; this.epoch++; this.loading = false; this.previewAsset = null; this.releasePhotos() },
  onUnload() { this.visible = false; this.clearSession(); this.unsubscribeSession?.() },
  onPullDownRefresh() { this.refresh().finally(() => uni.stopPullDownRefresh()) },
  methods: {
    statusLabel, writeBlockedLabel,
    toast(message) { uni.showToast({ title: message, icon: 'none' }) },
    sameAccount(account = this.accountId) { return Boolean(account) && account === patientActivitySession() },
    releasePhotos() { this.mediaEpoch++; for (const photo of Object.values(this.photos)) { releaseMediaFile(photo.path); photo.path = '' } },
    clearSession() { this.epoch++; this.releasePhotos(); this.accountId = ''; this.activities = []; this.activityId = ''; this.today = null; this.answers = emptyAnswers(); this.photos = photoState(); this.photoErrors = {}; this.history = []; this.viewRecord = null; this.previewAsset = null; this.dirty = false; this.conflict = false; this.pendingSubmission = null; this.saving = false; this.choosing = false; this.error = ''; this.saveMessage = '' },
    async refresh() {
      const account = patientActivitySession()
      if (!account) { this.clearSession(); uni.reLaunch({ url: '/pages/login/login' }); return }
      if (this.accountId && this.accountId !== account) this.clearSession()
      this.accountId = account
      const epoch = ++this.epoch
      this.loading = true; this.error = ''
      try {
        const activities = await getMyActivities()
        if (!this.sameAccount(account) || epoch !== this.epoch || !this.visible) return
        this.activities = activities
        if (!activities.some(item => item.id === this.activityId)) this.activityId = activities[0]?.id || ''
        if (!this.activityId) { this.today = null; this.releasePhotos(); this.answers = emptyAnswers(); this.photos = photoState(); return }
        const today = await getActivityToday(this.activityId)
        if (!this.sameAccount(account) || epoch !== this.epoch || !this.visible) return
        const dateChanged = this.today && this.today.date !== today.date
        const oldVersion = this.baseVersion
        this.today = today
        if (dateChanged) { this.dirty = false; this.pendingSubmission = null; this.conflict = false; this.viewRecord = null; this.section = 'today'; this.saveMessage = '北京时间日期已切换，旧日期不能继续提交。已保存的记录可在历史中查看。' }
        if (this.section === 'today' && (!this.choosing || dateChanged) && !this.saving) {
          if (!this.dirty) this.hydrate(today.record)
          else if (oldVersion !== (today.record?.version || 0) && !this.pendingSubmission) this.conflict = true
        }
        if (this.section === 'history') { await this.loadHistory(); if (this.viewRecord) await this.loadPhotoPaths() }
        else await this.loadPhotoPaths()
      } catch (error) {
        if (this.sameAccount(account) && epoch === this.epoch && this.visible) { this.error = error.message || '活动加载失败'; this.today = null; this.releasePhotos(); this.previewAsset = null }
      } finally { if (epoch === this.epoch) this.loading = false }
    },
    hydrate(record) { this.releasePhotos(); this.baseVersion = record?.version || 0; this.answers = hydrateAnswers(record); this.photos = photoState(record); this.photoErrors = {}; this.dirty = false; this.conflict = false },
    async selectActivity(id) { if (this.saving || this.choosing || id === this.activityId) return; if (this.dirty && !(await this.confirmDiscard())) return; this.activityId = id; this.today = null; this.section = 'today'; this.viewRecord = null; this.pendingSubmission = null; this.history = []; this.hydrate(null); this.saveMessage = ''; await this.refresh() },
    confirmDiscard() { return new Promise(resolve => uni.showModal({ title: '有未保存修改', content: '离开当前表单会丢弃尚未保存的输入。可以取消后保存草稿。', confirmText: '继续离开', cancelText: '返回保存', success: result => resolve(result.confirm), fail: () => resolve(false) })) },
    async openHistory() { if (this.saving || this.choosing) return; if (this.section === 'today' && this.dirty && !(await this.confirmDiscard())) return; this.section = 'history'; this.viewRecord = null; this.pendingSubmission = null; this.hydrate(null); await this.loadHistory() },
    async openToday() { if (this.saving || this.choosing || this.section === 'today') return; this.section = 'today'; this.viewRecord = null; this.hydrate(this.today?.record); this.saveMessage = ''; await this.refresh() },
    async loadHistory(more = false) {
      if (!this.activityId || this.historyLoading) return
      const account = this.accountId, id = this.activityId, epoch = this.epoch
      const page = more ? this.historyPage + 1 : 1
      this.historyLoading = true
      try { const data = await getActivityRecords(id, page); if (!this.sameAccount(account) || id !== this.activityId || epoch !== this.epoch || !this.visible) return; this.history = more ? [...this.history, ...(data.items || [])] : data.items || []; this.historyPage = page; this.historyHasMore = data.hasMore === true }
      catch (error) { if (this.sameAccount(account) && epoch === this.epoch) this.toast(error.message || '历史读取失败') }
      finally { this.historyLoading = false }
    },
    async viewHistoryRecord(item) {
      const account = this.accountId, id = this.activityId, epoch = ++this.epoch
      this.viewRecord = null; this.releasePhotos()
      try { const record = await getActivityRecord(id, item.date); if (!this.sameAccount(account) || epoch !== this.epoch || !this.visible || this.section !== 'history') return; this.viewRecord = record; this.hydrate(record); await this.loadPhotoPaths() }
      catch (error) { if (this.sameAccount(account) && epoch === this.epoch) this.toast(error.message || '记录读取失败') }
    },
    setAnswer(key, value) { if (!this.editable) return; this.answers[key] = value; this.dirty = true; this.saveMessage = '' },
    setChoice(key, value) { if (!this.editable) return; this.setAnswer(key, Number(value)) },
    setBowel(key, value) { if (!this.editable) return; this.answers.bowel_observation[key] = value; this.dirty = true; this.saveMessage = '' },
    submitForm(event) {
      if (!this.editable) return
      const values = event?.detail?.value || {}
      for (const question of this.form.questions) {
        if (question.type === 'single_choice' && Object.prototype.hasOwnProperty.call(values, question.key)) this.answers[question.key] = values[question.key] === '' ? null : Number(values[question.key])
        else if (question.type === 'text' && Object.prototype.hasOwnProperty.call(values, question.key)) this.answers[question.key] = values[question.key]
        else if (question.type === 'inline_multiple_text') for (const field of question.subfields) if (Object.prototype.hasOwnProperty.call(values, field.key)) this.answers.bowel_observation[field.key] = values[field.key]
      }
      this.save('SUBMITTED')
    },
    async save(status) {
      if (!this.editable) return
      if (status === 'DRAFT' && this.today.record?.status === 'SUBMITTED') { this.toast('已提交后请使用“提交当天修改”'); return }
      let prepared
      try { prepared = prepareActivitySubmission({ date: this.today.date, expectedVersion: this.baseVersion, status, answers: buildActivityAnswers(this.today.formType, this.answers, status), photos: buildActivityPhotos(this.today.formType, this.photos, status) }, this.pendingSubmission) }
      catch (error) { this.toast(error.message); return }
      const account = this.accountId, id = this.activityId, date = this.today.date
      const retrying = prepared === this.pendingSubmission
      this.pendingSubmission = prepared; this.saving = true; this.saveMessage = ''
      try {
        const current = await getActivityToday(id)
        if (!this.sameAccount(account)) return
        if (date !== current.date) { this.today = current; this.hydrate(current.record); this.pendingSubmission = null; throw new Error('北京时间日期已切换，旧日期不能提交；已加载今天的表单') }
        if (!current.canWrite) { this.today = { ...this.today, canWrite: false, readOnly: true, writeBlockedReason: current.writeBlockedReason }; throw new Error(writeBlockedLabel(current.writeBlockedReason)) }
        if (!retrying && (current.record?.version || 0) !== prepared.payload.expectedVersion) { this.conflict = true; throw new Error('记录已在其他设备更新，请加载最新记录后修改') }
        const result = await saveActivityRecord(id, prepared.payload)
        if (!this.sameAccount(account)) return
        const record = result.record || result
        this.today = { ...current, record }; this.hydrate(record); this.pendingSubmission = null
        this.saveMessage = status === 'DRAFT' ? '草稿已保存在服务端，尚未计为完成。' : '今日打卡已提交；当天仍可修改。'
        if (this.visible) await this.loadPhotoPaths()
      } catch (error) {
        if (!this.sameAccount(account)) return
        if (error.statusCode === 409 && (error.response?.code === 'VERSION_CONFLICT' || error.response?.data?.code === 'VERSION_CONFLICT')) this.conflict = true
        this.saveMessage = error.message || '保存未确认，请检查网络后重试。当前输入已保留。'
      } finally { if (this.sameAccount(account)) this.saving = false }
    },
    async reloadLatest() { if (this.saving || this.choosing) return; if (this.dirty && !(await this.confirmDiscard())) return; this.dirty = false; this.conflict = false; this.pendingSubmission = null; await this.refresh() },
    async choosePhoto(slot) {
      if (!this.editable) return
      const account = this.accountId, id = this.activityId, date = this.today.date
      this.choosing = true; this.photoErrors[slot] = ''
      try {
        const selection = await new Promise((resolve, reject) => uni.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album', 'camera'], success: resolve, fail: reject }))
        if (!this.sameAccount(account)) return
        const path = selection.tempFilePaths?.[0]
        if (!path) throw new Error('未选择照片')
        let size = selection.tempFiles?.[0]?.size
        if (!Number.isFinite(Number(size))) size = await new Promise((resolve, reject) => uni.getFileInfo({ filePath: path, success: file => resolve(file.size), fail: reject }))
        if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > PHOTO_MAX_BYTES) throw new Error('照片需大于0且不超过10MiB（10485760字节）')
        const current = await getActivityToday(id)
        if (!this.sameAccount(account)) return
        if (current.date !== date) { this.today = current; this.hydrate(current.record); this.pendingSubmission = null; throw new Error('北京时间日期已切换，请重新选择今天的照片') }
        this.today = current
        if (!current.canWrite) throw new Error(writeBlockedLabel(current.writeBlockedReason))
        const asset = await uploadActivityPhoto(id, slot, path)
        if (!this.sameAccount(account) || id !== this.activityId) return
        if (!asset?.id) throw new Error('照片上传未返回有效附件编号，请重试')
        releaseMediaFile(this.photos[slot].path)
        this.photos[slot] = { assetId: asset.id, path: '', mimeType: asset.mimeType || 'image/jpeg' }; this.dirty = true; this.saveMessage = '照片已上传私有存储，请保存草稿或提交打卡。'
        if (this.visible) await this.loadPhotoPaths()
      } catch (error) { if (this.sameAccount(account) && !/cancel/i.test(error.errMsg || '')) this.photoErrors[slot] = error.message || '照片选择或上传失败，请重试' }
      finally { if (this.sameAccount(account)) { if (this.visible) await this.refresh(); this.choosing = false } }
    },
    removePhoto(slot) { if (!this.editable) return; releaseMediaFile(this.photos[slot].path); this.photos[slot] = { assetId: '', path: '', mimeType: 'image/jpeg' }; this.photoErrors[slot] = ''; this.dirty = true },
    async loadPhotoPaths() {
      const account = this.accountId, epoch = ++this.mediaEpoch
      await Promise.all(Object.entries(this.photos).map(async ([slot, photo]) => {
        if (!photo.assetId || photo.path) return
        try { const path = await resolveMediaFile(photo.assetId); if (!this.sameAccount(account) || !this.visible || epoch !== this.mediaEpoch || this.photos[slot].assetId !== photo.assetId) releaseMediaFile(path); else this.photos[slot].path = path }
        catch (error) { if (this.sameAccount(account) && epoch === this.mediaEpoch && this.visible) this.photoErrors[slot] = error.message || '照片读取失败，可点击查看原图重试' }
      }))
    },
    previewPhoto(slot) { if (!this.visible || !this.sameAccount()) return; const photo = this.photos[slot]; if (photo?.assetId) this.previewAsset = { id: photo.assetId, mimeType: photo.mimeType } },
    goHome() { uni.switchTab({ url: '/pages/patient/index' }) }
  }
}
</script>
<style scoped>
.yuanqizhan-page{box-sizing:border-box;min-height:100vh;max-width:900px;margin:0 auto;padding:24rpx 24rpx calc(40rpx + env(safe-area-inset-bottom));background:#f4f9fb;color:#193b4e;overflow-wrap:anywhere}
.activity-heading{padding:24rpx 4rpx 28rpx}.eyebrow,.intro,.page-title{display:block}.eyebrow{font-size:24rpx;color:#168fb9}.page-title{font-size:38rpx;font-weight:700;line-height:1.5;margin:10rpx 0}.intro,.hint,.date-line{font-size:24rpx;line-height:1.6;color:#667d89;display:block}.progress-card,.form-card,.state-card,.history-card{background:#fff;border:1rpx solid #dce9ee;border-radius:24rpx;padding:24rpx;margin-bottom:20rpx}.progress-line,.form-heading{display:flex;justify-content:space-between;align-items:center;gap:12rpx;flex-wrap:wrap;font-size:29rpx;font-weight:600}.status-pill{background:#e9f7fc;border-radius:12rpx;padding:6rpx 12rpx;color:#168fb9;font-size:24rpx}.date-line{margin:16rpx 0}.read-only-note,.conflict-note,.field-error{display:block;color:#995526;font-size:26rpx;line-height:1.6;margin-top:12rpx}.section-tabs,.activity-picker,.action-buttons,.photo-actions{display:flex;gap:16rpx;flex-wrap:wrap}.section-tabs,.activity-picker{margin:20rpx 0}.section-tabs button,.action-buttons button{flex:1;min-width:0}.selected{border-color:#168fb9!important;background:#e9f7fc!important;color:#168fb9!important}.card-title{font-size:30rpx;font-weight:700}.privacy-note{margin:24rpx 0;padding:20rpx;background:#eff7fa;border-radius:18rpx;font-size:24rpx;line-height:1.65;color:#486372}.privacy-note text{display:block;margin-bottom:12rpx}.privacy-title{font-weight:700;color:#294b5e}.question-row{padding:26rpx 0;border-top:1rpx solid #dce9ee}.question-label{display:flex;align-items:flex-start;gap:12rpx;font-weight:600;font-size:28rpx;line-height:1.6;margin-bottom:16rpx}.question-number{flex:none;color:#168fb9}.required-star{color:#b54143}.measurement-input{display:flex;align-items:center;border:1rpx solid #bbd2dc;border-radius:14rpx;padding:0 20rpx;min-height:96rpx;gap:12rpx}.measurement-input input{flex:1;min-width:0;font-size:28rpx;height:90rpx}.unit{font-size:26rpx;font-weight:600;color:#486372}.option-row{display:flex;align-items:flex-start;gap:14rpx;min-height:88rpx;padding:18rpx 14rpx;margin-bottom:12rpx;border:1rpx solid #dce9ee;border-radius:14rpx;font-size:27rpx;line-height:1.65;box-sizing:border-box}.option-row radio{flex:none;margin-top:5rpx;transform:scale(.85);transform-origin:center}.option-row.checked{border-color:#168fb9;background:#effaff}.bowel-field{margin-bottom:20rpx}.subfield-label{display:block;font-size:26rpx;margin-bottom:8rpx}.bowel-field input{border:1rpx solid #bbd2dc;border-radius:14rpx;padding:0 20rpx;min-height:90rpx;font-size:27rpx}.photo-attached{display:flex;align-items:center;gap:16rpx;flex-wrap:wrap;margin-bottom:12rpx}.photo-attached image{width:220rpx;height:220rpx;background:#f4f9fb;border:1rpx solid #dce9ee;border-radius:12rpx}.form-actions{border-top:1rpx solid #dce9ee;padding-top:24rpx}.action-buttons{margin:18rpx 0}.save-note{background:#ecf8f1;color:#286b51;border-radius:14rpx;font-size:26rpx;line-height:1.6;padding:20rpx;margin:16rpx 0}.conflict-note{background:#fff4e8;padding:20rpx;border-radius:14rpx}.history-row{display:flex;justify-content:space-between;align-items:center;width:100%;gap:12rpx;flex-wrap:wrap;margin-top:12rpx;text-align:left}.state-card{line-height:1.7;font-size:27rpx}.error-card{color:#a53640}.text-button{background:#fff!important;color:#667d89!important}.primary-button{background:#168fb9!important;color:#fff!important}button{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:44px;font-size:26rpx;line-height:1.5;white-space:normal;padding:18rpx 20rpx;margin:0;border:1rpx solid #b6ccd6;border-radius:16rpx;background:#fff;color:#294b5e}button::after{border:none}button[disabled]{opacity:.52}.history-card>.hint,.question-row>.hint{margin-top:12rpx}.photo-actions{margin:12rpx 0}.photo-actions button{flex:1}.photo-slot>.hint{margin:12rpx 0}
</style>
