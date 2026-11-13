<template>
 <view class="routine-card">
  <view class="routine-heading"><view><text class="routine-title">今日记录</text><text class="routine-date">{{ context?.date || '' }}</text></view><button size="mini" :disabled="busy || uploading" @tap="reload">刷新</button></view>
  <text v-if="loading" class="routine-muted">正在加载今日记录…</text>
  <view v-else-if="context">
   <template v-if="tab === 'weight'">
    <view class="routine-grid"><label class="routine-field">体重 kg<input :disabled="busy" v-model="weight" type="digit" placeholder="未填写" @input="dirty = true" /></label><label class="routine-field">腰围 cm<input :disabled="busy" :value="answers.waist_cm ?? ''" type="digit" placeholder="未填写" @input="answer('waist_cm', $event.detail.value, true)" /></label><label class="routine-field">饮水 ml<input :disabled="busy" :value="answers.water_ml ?? ''" type="number" placeholder="未填写" @input="answer('water_ml', $event.detail.value, true)" /></label></view>
    <view class="routine-state"><text class="routine-title">今日状态</text>
     <label v-for="question in questions" :key="question.key" class="routine-field">{{ question.label }}<picker :disabled="busy" :range="choices(question)" range-key="label" :value="choiceIndex(question)" @change="choose(question, $event.detail.value)"><view class="routine-picker">{{ choices(question)[choiceIndex(question)].label }} ▾</view></picker></label>
     <label class="routine-field">今日排便次数<input :disabled="busy" :value="answers.bowel_count ?? ''" type="number" placeholder="未填写" @input="answer('bowel_count', $event.detail.value, true)" /></label>
     <label class="routine-field">排便附加观察<textarea :disabled="busy" :value="answers.bowel_extra || ''" maxlength="200" placeholder="选填" @input="answer('bowel_extra', $event.detail.value)" /></label>
    </view>
   </template>
   <template v-if="tab === 'sleep'">
    <view class="routine-grid"><label class="routine-field">入睡时间<picker :disabled="busy" mode="time" :value="answers.sleep_start || ''" @change="answer('sleep_start', $event.detail.value)"><view class="routine-picker">{{ answers.sleep_start || '选择时间' }} ▾</view></picker><button v-if="answers.sleep_start" :disabled="busy" size="mini" @tap="answer('sleep_start','')">清空</button></label><label class="routine-field">起床时间<picker :disabled="busy" mode="time" :value="answers.sleep_end || ''" @change="answer('sleep_end', $event.detail.value)"><view class="routine-picker">{{ answers.sleep_end || '选择时间' }} ▾</view></picker><button v-if="answers.sleep_end" :disabled="busy" size="mini" @tap="answer('sleep_end','')">清空</button></label></view>
    <text v-if="sleepMinutes !== null" class="routine-duration">睡眠时长 {{ sleepLabel }}</text>
    <label v-else class="routine-field">睡眠时长（小时）<input :disabled="busy" :value="answers.sleep_hours ?? ''" type="digit" placeholder="未填写" @input="answer('sleep_hours',$event.detail.value,true)" /></label>
   </template>
   <label v-if="tab === 'exercise'" class="routine-field">今日运动（分钟）<input :disabled="busy" :value="answers.exercise_minutes ?? ''" type="number" placeholder="未填写" @input="answer('exercise_minutes',$event.detail.value,true)" /></label>
   <view v-if="tab === 'diet'"><text class="routine-muted">已记录 {{ mealCount }}/3 餐</text>
    <view v-for="meal in meals" :key="meal.key" class="routine-meal"><label class="routine-field">{{ meal.label }}<textarea :disabled="busy" :value="answers[meal.key+'_text'] || ''" maxlength="500" placeholder="吃了什么" @input="answer(meal.key+'_text',$event.detail.value)" /></label>
     <view class="routine-photos"><view v-for="photo in mealPhotos(meal.key)" :key="photo.key" class="routine-photo"><image v-if="photo.path" :src="photo.path" mode="aspectFill" @tap="preview(photo)" /><button v-else size="mini" :disabled="photo.previewLoading" @tap="loadPhoto(photo)">{{ photo.previewLoading ? '加载中' : '查看照片' }}</button><button :disabled="busy" size="mini" @tap="removePhoto(photo)">删除</button><text v-if="photo.status === 'uploading'" class="routine-muted">上传中…</text><text v-if="photo.error" class="routine-error">{{ photo.error }}</text><button v-if="photo.status === 'failed'" :disabled="busy || reloadRequired" size="mini" @tap="queueUpload(photo)">重试上传</button></view></view>
     <button :disabled="busy || reloadRequired || mealPhotos(meal.key).length >= 9" size="mini" @tap="choosePhotos(meal.key)">添加{{ meal.label }}照片（{{ mealPhotos(meal.key).length }}/9）</button>
    </view>
   </view>
   <text v-if="notice" class="routine-success">{{ notice }}</text>
   <button class="routine-save" :disabled="busy || uploading || reloadRequired" @tap="save">{{ busy ? '保存中…' : uploading ? '照片上传中…' : '保存今日记录' }}</button>
  </view>
  <text v-if="error" class="routine-error">{{ error }}</text><button v-if="error && (!context || reloadRequired)" size="mini" :disabled="busy" @tap="reload">重新载入今日记录</button>
  <view class="routine-history"><button size="mini" :disabled="busy" @tap="toggleHistory">{{ historyOpen ? '收起每日记录' : '查看每日记录' }}</button>
   <view v-if="historyOpen"><text v-if="historyLoading" class="routine-muted">正在加载…</text><text v-if="historyError" class="routine-error">{{ historyError }}</text><button v-if="historyError" size="mini" @tap="loadHistory(true)">重试</button>
    <view v-for="record in history" :key="record.date" class="routine-history-item"><text class="routine-title">{{ record.date }}</text><text v-for="row in historyRows(record)" :key="row.label" class="routine-history-row">{{ row.label }}：{{ row.value }}</text><view v-if="tab === 'diet'" class="routine-photos"><view v-for="photo in historyPhotos(record)" :key="photo.id" class="routine-photo"><image v-if="historyPaths[photo.id]" :src="historyPaths[photo.id]" mode="aspectFill" @tap="previewHistory(photo.id)" /><button v-else size="mini" @tap="loadHistoryPhoto(photo.id)">{{ photo.label }}</button></view></view></view>
    <text v-if="!historyLoading && !history.length" class="routine-muted">暂无每日记录</text><button v-if="hasMore" :disabled="historyLoading" size="mini" @tap="loadHistory(false)">加载更多</button>
   </view>
  </view>
 </view>
</template>
<script>
import { dailyCheckInQuestions, routineMeals, routineSleepMinutes, routineSleepLabel, routineView, routineMealCount, routinePayload } from '../utils/daily-routine-model.js'
import { getRoutineToday, getRoutineHistory, saveRoutine, uploadRoutinePhoto, routineIdentity } from '../utils/daily-routine-api.js'
import { resolveMediaFile, releaseMediaFile } from '../utils/media-access.js'
export default {
 props: { tab: { type: String, default: 'weight' }, accountId: { type: String, default: '' }, active: { type: Boolean, default: true } },
 emits: ['saved'],
 data: () => ({ context: null, weight: '', answers: {}, photos: [], loading: false, busy: false, error: '', notice: '', dirty: false, reloadRequired: false, generation: 0, live: true, sequence: 0, queue: Promise.resolve(), historyOpen: false, history: [], historyPage: 1, hasMore: false, historyLoading: false, historyError: '', historyPaths: {}, meals: routineMeals, questions: dailyCheckInQuestions.filter(question => question.options?.length) }),
 computed: { uploading() { return this.photos.some(photo => photo.status === 'uploading') }, sleepMinutes() { return routineSleepMinutes(this.answers.sleep_start, this.answers.sleep_end) }, sleepLabel() { return routineSleepLabel(this.answers) }, mealCount() { return routineMealCount(this.serializedAnswers()) } },
 watch: { accountId: { immediate: true, handler() { this.clear(); if (this.accountId && this.active) this.reload() } }, active(value) { if (value && !this.dirty && !this.busy && !this.uploading && this.accountId) this.reload() } },
 beforeUnmount() { this.live = false; this.clear() },
 methods: {
  identity() { return routineIdentity() }, current(generation, owner) { return this.live && generation === this.generation && owner === this.identity() && owner === this.accountId },
  refreshAfterRecord() { if (this.dirty || this.busy || this.uploading) { this.reloadRequired = true; this.error = '今日记录已更新，请重新载入后修改。'; return }; this.reload() },
  clear() { this.generation++; this.photos.forEach(photo => releaseMediaFile(photo.path)); Object.values(this.historyPaths).forEach(releaseMediaFile); this.context = null; this.answers = {}; this.weight = ''; this.photos = []; this.queue = Promise.resolve(); this.dirty = false; this.busy = false; this.loading = false; this.error = ''; this.notice = ''; this.reloadRequired = false; this.history = []; this.historyPaths = {}; this.historyOpen = false; this.historyLoading = false },
  async reload() {
   if (this.busy || this.uploading || !this.identity()) return
   const owner = this.identity(), generation = ++this.generation; this.loading = true; this.error = ''; this.notice = ''; this.reloadRequired = false
   Object.values(this.historyPaths).forEach(releaseMediaFile); this.historyPaths = {}; this.history = []; this.historyOpen = false; this.historyLoading = false; this.historyError = ''
   try { const context = await getRoutineToday(); if (!this.current(generation, owner)) return
    this.photos.forEach(photo => releaseMediaFile(photo.path)); this.context = context; const record = routineView(context); this.weight = record.weightKg == null ? '' : String(record.weightKg); this.answers = { ...record.answers }; this.photos = this.meals.flatMap(meal => (record.answers[meal.key+'_photo_ids'] || []).map(id => ({ key: 'saved-'+meal.key+'-'+id, meal: meal.key, id, path: '', status: 'ready' }))); this.dirty = false
   } catch (error) { if (this.current(generation, owner)) this.error = error.message || '今日记录暂不可用' }
   finally { if (this.current(generation, owner)) this.loading = false }
  },
  answer(key, value, numeric = false) { this.dirty = true; this.notice = ''; const next = { ...this.answers }; if (value === '') delete next[key]; else next[key] = numeric ? Number(value) : value
   if (key === 'sleep_start' || key === 'sleep_end') { const minutes = routineSleepMinutes(next.sleep_start, next.sleep_end); if (minutes !== null) next.sleep_hours = Math.round(minutes / 60 * 100) / 100 }
   if (key === 'sleep_hours') { delete next.sleep_start; delete next.sleep_end } this.answers = next
  },
  choices(question) { return [{ value: '', label: '未填写' }, ...question.options] }, choiceIndex(question) { return Math.max(0, this.choices(question).findIndex(option => option.value === this.answers[question.key])) }, choose(question, index) { const value = this.choices(question)[Number(index)].value; this.answer(question.key, value, typeof value === 'number') },
  mealPhotos(meal) { return this.photos.filter(photo => photo.meal === meal) },
  serializedAnswers() { const answers = { ...this.answers }; for (const meal of this.meals) { const ids = this.mealPhotos(meal.key).filter(photo => photo.status === 'ready' && photo.id).map(photo => photo.id); if (ids.length) answers[meal.key+'_photo_ids'] = ids; else delete answers[meal.key+'_photo_ids'] } return answers },
  choosePhotos(meal) {
   if (this.busy || this.reloadRequired || !this.context) return
   const generation = this.generation, owner = this.identity(), date = this.context.date
   uni.chooseImage({ count: 9-this.mealPhotos(meal).length, sizeType: ['original'], sourceType: ['album','camera'], success: response => {
    if (!this.current(generation, owner) || this.context?.date !== date) return
    response.tempFilePaths.forEach((path,index) => { if (this.mealPhotos(meal).length >= 9) return; if (response.tempFiles?.[index]?.size > 10*1024*1024) { this.error = '每张照片不能超过10MB'; return }; const photo = { key: 'new-'+(++this.sequence), meal, localPath: path, path, status: 'uploading' }; this.photos.push(photo); this.dirty = true; this.queueUpload(this.photos[this.photos.length-1]) })
   }, fail: error => { if (this.current(generation, owner) && !String(error.errMsg).includes('cancel')) this.error = '无法选择照片，请重试' } })
  },
  queueUpload(photo) {
   if (this.busy || this.reloadRequired || photo.queued || !photo.localPath) return
   const generation = this.generation, owner = this.identity(), date = this.context.date; photo.queued = true; photo.status = 'uploading'; photo.error = ''
   this.queue = this.queue.catch(() => {}).then(async () => {
    if (!this.current(generation, owner) || this.context?.date !== date || !this.photos.some(item => item.key === photo.key)) return
    try { const uploaded = await uploadRoutinePhoto(photo.localPath, date, photo.meal); if (!this.current(generation, owner) || !this.photos.some(item => item.key === photo.key)) return; photo.id = uploaded.id; photo.status = 'ready' }
    catch (error) { if (!this.current(generation, owner) || !this.photos.some(item => item.key === photo.key)) return; photo.status = 'failed'; photo.error = error.message || '上传失败'; if (error.statusCode === 409) { this.reloadRequired = true; this.error = error.message } }
    finally { photo.queued = false }
   })
  },
  removePhoto(photo) { if (this.busy) return; this.photos = this.photos.filter(item => item.key !== photo.key); releaseMediaFile(photo.path); this.dirty = true },
  async loadPhoto(photo) { if (photo.previewLoading || !photo.id) return; const generation = this.generation, owner = this.identity(); photo.previewLoading = true; photo.error = ''; try { const path = await resolveMediaFile(photo.id); if (!this.current(generation, owner) || !this.photos.includes(photo)) { releaseMediaFile(path); return }; photo.path = path } catch (error) { if (this.current(generation, owner)) photo.error = error.message } finally { photo.previewLoading = false } },
  preview(photo) { if (photo.path) uni.previewImage({ current: photo.path, urls: this.mealPhotos(photo.meal).map(item => item.path).filter(Boolean) }) },
  async save() {
   if (this.busy || this.uploading || this.reloadRequired || !this.context) return
   const generation = this.generation, owner = this.identity(); this.error = ''; this.notice = ''
   try { const payload = routinePayload(this.context, this.weight, this.serializedAnswers(), this.tab); if (!payload.changedFields.length) { this.notice = '今日记录已是最新'; return }; this.busy = true; const record = await saveRoutine(payload); if (!this.current(generation, owner)) return
    this.context = { ...this.context, revision: record.revision, record: record.weightKg == null ? null : record, draft: record.weightKg == null ? record : null }; this.answers = { ...record.answers }; this.dirty = false; this.notice = '今日记录已保存'; this.$emit('saved'); if (this.historyOpen) this.loadHistory(true)
   } catch (error) { if (this.current(generation, owner)) { this.error = error.message || '保存失败，请重试'; this.reloadRequired = error.statusCode === 409 } }
   finally { if (this.current(generation, owner)) this.busy = false }
  },
  async toggleHistory() { this.historyOpen = !this.historyOpen; if (this.historyOpen) await this.loadHistory(true) },
  async loadHistory(reset) { const generation = this.generation, owner = this.identity(), page = reset ? 1 : this.historyPage+1; if (this.historyLoading) return; this.historyLoading = true; this.historyError = ''; try { const result = await getRoutineHistory(page); if (!this.current(generation, owner)) return; this.history = reset ? result.items : [...this.history,...result.items]; this.historyPage = page; this.hasMore = result.hasMore } catch (error) { if (this.current(generation, owner)) this.historyError = error.message } finally { if (this.current(generation, owner)) this.historyLoading = false } },
  historyRows(record) { const answers = record.answers || {}, field = (key,label,suffix='') => ({ label, value: answers[key] == null || answers[key] === '' ? '未填写' : answers[key]+suffix }); if (this.tab === 'diet') return this.meals.map(meal => field(meal.key+'_text',meal.label)); if (this.tab === 'sleep') return [field('sleep_start','入睡时间'),field('sleep_end','起床时间'),{label:'睡眠时长',value:routineSleepLabel(answers)}]; if (this.tab === 'exercise') return [field('exercise_minutes','运动',' 分钟')]; return [{label:'体重',value:record.weightKg == null?'未填写':record.weightKg+' kg'},field('waist_cm','腰围',' cm'),field('water_ml','饮水',' ml'),...dailyCheckInQuestions.map(question => ({ label:question.label,value:answers[question.key] == null?'未填写':question.options?.find(option=>option.value===answers[question.key])?.label??String(answers[question.key]) }))] },
  historyPhotos(record) { return this.meals.flatMap(meal => (record.answers?.[meal.key+'_photo_ids'] || []).map((id,index) => ({id,label:meal.label+'照片'+(index+1)}))) },
  async loadHistoryPhoto(id) { const generation = this.generation, owner = this.identity(); try { const path = await resolveMediaFile(id); if (!this.current(generation, owner)) { releaseMediaFile(path); return }; releaseMediaFile(this.historyPaths[id]); this.historyPaths = { ...this.historyPaths, [id]:path } } catch (error) { if (this.current(generation, owner)) this.historyError = error.message } },
  previewHistory(id) { uni.previewImage({current:this.historyPaths[id],urls:[this.historyPaths[id]]}) }
 }
}
</script>
<style scoped>
.routine-card{padding:18px;margin:16px 0;background:#fff;border:1px solid #dce8ed;border-radius:16px;color:#18384e}.routine-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.routine-heading>view{display:flex;flex-direction:column;gap:4px}.routine-title{font-size:17px;font-weight:600}.routine-date,.routine-muted{font-size:12px;color:#71838e;display:block;line-height:1.6}.routine-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.routine-field{display:block;font-size:14px;line-height:1.6;margin:14px 0}.routine-field input,.routine-field textarea,.routine-picker{box-sizing:border-box;display:block;width:100%;min-height:44px;margin-top:8px;padding:10px;border:1px solid #d5e4e9;border-radius:10px;background:#f8fbfc;color:#284e5e;font-size:15px}.routine-field textarea{height:90px}.routine-state{border-top:1px solid #e9f0f3;margin-top:18px;padding-top:18px}.routine-card button{font-size:13px;min-height:36px;line-height:36px;border-radius:8px;color:#176680}.routine-save{margin-top:18px;background:#187f8d!important;color:white!important;width:100%;min-height:44px!important;line-height:44px!important}.routine-meal{padding-bottom:16px;margin-bottom:14px;border-bottom:1px solid #edf2f5}.routine-photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.routine-photo{min-width:0;background:#f4f8fa;border-radius:8px;padding:4px}.routine-photo image{width:100%;height:90px;display:block;border-radius:6px}.routine-photo button{padding:0 4px;font-size:12px}.routine-error{display:block;color:#a34432;font-size:12px;line-height:1.6;overflow-wrap:anywhere;margin:8px 0}.routine-success,.routine-duration{display:block;color:#187f8d;font-size:14px;margin-top:12px}.routine-history{margin-top:18px;border-top:1px solid #edf2f5;padding-top:14px}.routine-history-item{margin-top:16px;padding:14px;background:#f7fafb;border-radius:10px}.routine-history-row{display:block;font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
