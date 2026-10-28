<template>
  <view class="record-page patient-theme" :class="{ 'diet-active': activeTab === 'diet' }">
    <view class="intro"><text class="title">记录每一天</text><text class="muted">MedTalent健康数字助手 · 以真实记录支持持续管理</text></view>
    <view class="tabs"><button :disabled="saving" v-for="tab in tabs" :key="tab.key" :class="{ active: activeTab === tab.key }" @tap="activeTab = tab.key">{{ tab.label }}</button></view>
    <view v-if="activeTab === 'weight'" class="card">
      <text class="heading">体重与围度</text>
      <view class="row"><input :disabled="saving" v-model="weight.value" type="digit" placeholder="请输入体重" /><picker :disabled="saving" :range="['kg', '斤']" :value="weight.unit === 'kg' ? 0 : 1" @change="changeWeightUnit"><view class="picker">{{ weight.unit }} ▾</view></picker></view>
      <view class="row"><text>腰围 cm（选填）</text><input :disabled="saving" v-model="weight.waistCm" type="digit" placeholder="例如 80" /></view>
      <view class="row"><text>臀围 cm（选填）</text><input :disabled="saving" v-model="weight.hipCm" type="digit" placeholder="例如 95" /></view>
      <text v-if="bmiValue" class="hint">BMI {{ bmiValue }}（按资料中的身高计算）</text>
      <button class="primary" :disabled="saving" @tap="saveWeight">{{ saving ? '保存中…' : '保存体重与围度' }}</button>
    </view>
    <view v-if="activeTab === 'sleep'" class="card">
      <text class="heading">昨晚睡眠</text><text class="muted">记录实际睡眠时长，单位小时</text>
      <input :disabled="saving" v-model="sleepHours" type="digit" placeholder="例如 7.5 小时" />
      <button class="primary" :disabled="saving" @tap="saveSleep">保存睡眠记录</button>
    </view>
    <view v-if="activeTab === 'exercise'" class="card">
      <text class="heading">运动打卡</text>
      <input :disabled="saving" v-model="exercise.activity" maxlength="80" placeholder="运动名称，如散步、跟练" />
      <input :disabled="saving" v-model="exercise.durationMinutes" type="digit" placeholder="实际运动分钟数" />
      <textarea :disabled="saving" v-model="exercise.note" maxlength="500" placeholder="运动感受或备注（选填）" />
      <button class="primary" :disabled="saving" @tap="saveExercise">保存运动打卡</button>
    </view>
    <view v-if="activeTab === 'diet'">
      <view v-for="plan in plans" :key="plan.id" class="card plan"><text class="heading">{{ plan.title }}</text><text>{{ plan.summary }}</text><text class="hint">{{ plan.instructions }}</text></view>
      <form :key="editingId || diet.mealType" class="card diet-form" @submit="submitDietForm"><view class="meal-form-content">
        <view class="row"><text class="heading">{{ editingId ? '修改这餐' : '填写每日饮食' }}</text><button :disabled="saving" v-if="editingId" size="mini" @tap="cancelEdit">取消修改</button></view>
        <text class="hint">{{ editingId ? '修改后点击保存，其他餐次的待提交内容会保留。' : '早餐、午餐、晚餐分别填写，切换餐次会保留内容，最后一键提交。只提交已填写的餐次。' }}</text>
        <view class="meal-tabs"><button :disabled="saving || !!editingId" v-for="meal in meals" :key="meal.key" :class="{ active: diet.mealType === meal.key, filled: !editingId && hasMealContent(mealDraftFor(meal.key)) }" @tap="switchMeal(meal.key)"><text>{{ meal.label }}</text><text v-if="!editingId && hasMealContent(mealDraftFor(meal.key))" class="meal-draft-label">待提交</text></button></view>
        <view class="row"><picker :disabled="saving" mode="date" :value="diet.date" :end="today" @change="diet.date = $event.detail.value"><view class="picker">{{ diet.date }} ▾</view></picker><picker :disabled="saving" mode="time" :value="diet.time" @change="diet.time = $event.detail.value"><view class="picker">{{ diet.time }} ▾</view></picker></view>
        <textarea ref="dietNoteInput" name="note" :disabled="saving" v-model="diet.note" maxlength="500" auto-height placeholder="这餐吃了什么？可以先写文字，不必逐项添加食物" />
        <view class="photos"><view v-for="(photo, index) in photos" :key="photo.key" class="photo"><image v-if="photo.path" :src="photo.path" mode="aspectFill" @tap="previewPhoto(photo)" /><text v-else class="hint">照片待加载</text><button :disabled="saving" size="mini" @tap="removePhoto(index)">移除</button></view></view>
        <button :disabled="saving || photos.length >= 9" @tap="choosePhotos">拍照 / 相册添加餐食照片（{{ photos.length }}/9）</button>
        <text v-if="photoError" class="error">{{ photoError }}</text>
        <view class="divider"></view><text class="heading">食物明细与热量</text>
        <view v-for="(food, index) in diet.mealItems" :key="index" class="food-row"><view><text>{{ food.name }}</text><text class="muted">{{ food.weightGrams == null ? '重量未填' : food.weightGrams + ' g' }} · {{ food.caloriesKcal == null ? '热量待补充' : food.caloriesKcal + ' kcal' }}</text></view><button :disabled="saving" size="mini" @tap="editFood(index)">修改</button><button :disabled="saving" size="mini" @tap="diet.mealItems.splice(index, 1)">移除</button></view>
        <input ref="foodNameInput" name="foodName" :disabled="saving" v-model="draftFood.name" @input="markDraftFoodManual" maxlength="191" placeholder="食物名称（填好后可直接提交，无需先添加）" />
        <view class="row"><input ref="foodWeightInput" name="foodWeightGrams" :disabled="saving" v-model="draftFood.weightGrams" @input="markDraftFoodManual" type="digit" placeholder="重量 g（选填）" /><input ref="foodCaloriesInput" name="foodCaloriesKcal" :disabled="saving" v-model="draftFood.caloriesKcal" type="digit" placeholder="热量 kcal（选填）" @input="markDraftFoodManual" /></view>
        <view class="row"><button :disabled="saving" size="mini" @tap="addFood">添加到列表</button><button size="mini" :disabled="estimating || saving" @tap="estimateFood">{{ estimating ? '查询中…' : '重新估算整餐' }}</button></view>
        <text class="muted">填写食物名称与重量后自动估算整餐，无需逐项点击。参考值来自常见食物数据，并非照片识别；未知食物不推算。</text>
        <text class="hint estimate-status" aria-live="polite">{{ autoEstimateText }}</text><view class="total"><text>整餐热量 {{ calorieSummary.caloriesKcal == null ? '待补充' : calorieSummary.caloriesKcal + ' kcal' }}</text><text class="muted">{{ calorieLabel(calorieSummary.caloriesSource) }} · 包含当前输入</text></view>
        <input ref="mealCaloriesInput" name="mealCaloriesKcal" :disabled="saving" v-model="diet.calories" type="digit" placeholder="修正整餐热量 kcal（留空则自动汇总）" />
        <text v-if="dietSubmitMessage" class="diet-submit-message" role="status">{{ dietSubmitMessage }}</text>
        <text v-if="dietSubmitError" class="error" role="alert">{{ dietSubmitError }}</text>
        <view class="diet-submit-bar">
          <view class="diet-submit-copy"><text class="heading">{{ editingId ? '修改已保存记录' : '已填写 ' + pendingMealCount + ' 餐' }}</text><text class="muted">{{ saving ? (submittingMeal ? '正在提交' + mealLabel(submittingMeal) + '…' : '正在保存…') : editingId ? '待提交的其他餐次会保留' : '切换餐次保留内容，填完统一提交' }}</text></view>
          <button class="primary" form-type="submit" :disabled="saving">{{ saving ? '正在提交…' : editingId ? '保存修改' : '一键提交' }}</button>
        </view>
      </view></form>
    </view>
    <view class="section-row"><text class="heading">{{ currentTabLabel }}历史</text><button size="mini" :disabled="loadingHistory" @tap="loadHistory(true)">刷新</button></view>
    <text v-if="historyError" class="error">{{ historyError }}</text>
    <text v-if="!history.length && !loadingHistory && !historyError" class="empty">暂无记录，保存后会显示在这里</text>
    <view v-for="record in history" :key="record.id" class="card history-card">
      <view class="row"><text class="heading">{{ record.type === 'diet' ? mealLabel(record.mealType) : currentTabLabel }}</text><text class="muted">{{ record.recordDate }} {{ record.mealTime || '' }}</text></view>
      <template v-if="record.type === 'diet'">
        <text v-if="record.note" class="paragraph">{{ record.note }}</text>
        <text v-for="(food, i) in record.mealItems || []" :key="i" class="muted">{{ food.name }} · {{ food.weightGrams == null ? '重量未填' : food.weightGrams + 'g' }} · {{ food.caloriesKcal == null ? '热量未填' : food.caloriesKcal + 'kcal' }}</text>
        <text class="total">整餐 {{ record.caloriesKcal == null ? '热量待补充' : record.caloriesKcal + ' kcal' }} · {{ calorieLabel(record.caloriesSource) }}</text>
        <text v-if="(record.imageAssetIds || record.imageUrls || []).length" class="hint">包含 {{ (record.imageAssetIds || record.imageUrls).length }} 张餐食照片，查看时获取授权</text>
        <button size="mini" :disabled="saving" @tap="editDiet(record)">查看 / 修改这一餐</button>
      </template>
      <template v-else-if="record.type === 'weight'"><text class="metric">{{ record.weight }} kg / {{ (Number(record.weight) * 2).toFixed(1) }} 斤</text><text class="muted">腰围 {{ record.waistCm == null ? '未填' : record.waistCm + 'cm' }} · 臀围 {{ record.hipCm == null ? '未填' : record.hipCm + 'cm' }}</text></template>
      <template v-else-if="record.type === 'sleep'"><text class="metric">{{ record.sleepHours }} 小时</text></template>
      <template v-else><text>{{ record.payload?.activity || '运动打卡' }} · {{ record.payload?.durationMinutes || '—' }} 分钟</text><text>{{ record.note }}</text></template>
      <view v-for="review in record.reviews || []" :key="review.id" class="review"><text class="hint">{{ review.practitioner?.displayName || '服务团队' }} · {{ formatTime(review.createdAt) }}</text><text class="paragraph">{{ review.comment }}</text><view v-for="reply in review.replies || []" :key="reply.id" class="reply"><text class="muted">我的回复 · {{ formatTime(reply.createdAt) }}</text><text>{{ reply.comment }}</text></view><input :disabled="saving" v-model="replyDrafts[review.id]" maxlength="2000" placeholder="回复这条点评" /><button size="mini" :disabled="replying === review.id" @tap="replyReview(record.id, review.id)">添加回复</button></view>
      <button class="delete" size="mini" :disabled="saving" @tap="deleteRecord(record)">删除记录</button>
    </view>
    <button v-if="hasMore" :disabled="loadingHistory" @tap="loadHistory(false)">{{ loadingHistory ? '加载中…' : '加载更多历史' }}</button>
    <view class="bottom-space"></view>
  </view>
</template>
<script>
import store from '../../store/index.js'
import { createHealthRecord, updateHealthRecord, getHealthRecord, getHealthRecords, deleteHealthRecord, replyToRecordReview, calculateCaloriesWithAI, upload, getDietPlans } from '../../utils/api.js'
import { resolveMediaFile, releaseMediaFile } from '../../utils/media-access.js'
import { foodEstimateKey, completeMealEstimates, CALORIE_LABELS, prepareRecordSubmission, buildDietPayload, foodItem, mergeMealItems, mealCalories, localDate, optionalNumber, isPresent } from '../../utils/record-model.js'
const emptyFood = () => ({ name: '', weightGrams: '', caloriesKcal: '' })
const emptyDiet = () => ({ mealType: 'BREAKFAST', date: localDate(), time: new Date().toTimeString().slice(0, 5), note: '', mealItems: [], calories: '', estimated: false, expectedUpdatedAt: undefined })
export default {
  data() { return { activeTab: 'weight', tabs: [{ key: 'weight', label: '体重围度' }, { key: 'diet', label: '饮食' }, { key: 'sleep', label: '睡眠' }, { key: 'exercise', label: '运动' }], meals: [{ key: 'BREAKFAST', label: '早餐' }, { key: 'LUNCH', label: '午餐' }, { key: 'DINNER', label: '晚餐' }, { key: 'SNACK', label: '加餐' }], today: localDate(), weight: { value: '', unit: 'kg', waistCm: '', hipCm: '' },
    height: null, // 仅使用用户资料中的真实身高；缺失时不推算 BMI
    sleepHours: '', exercise: { activity: '', durationMinutes: '', note: '' }, diet: emptyDiet(), draftFood: emptyFood(), photos: [], photoError: '', editingId: '', mealDrafts: {}, resumeMeal: 'BREAKFAST', dietSession: 0, dietSubmitMessage: '', dietSubmitError: '', submittingMeal: '', saving: false, estimating: false, history: [], historyError: '', loadingHistory: false, historyPage: 1, hasMore: false, replyDrafts: {}, replying: '', plans: [], accountId: '', loadSequence: 0, pendingCreates: {}, estimateCache: {}, estimateGeneration: 0, recordVisible: true }
  },
  computed: {
    currentTabLabel() { return this.tabs.find(t => t.key === this.activeTab)?.label || '' },
    pendingMealCount() { return this.meals.filter(meal => this.hasMealContent(this.mealDraftFor(meal.key))).length },
    bmiValue() { const kg = Number(this.weight.value) * (this.weight.unit === '斤' ? 0.5 : 1); return kg > 0 && this.height > 0 ? (kg / (this.height / 100) ** 2).toFixed(1) : null },
    calorieSummary() { try { const result = completeMealEstimates(mergeMealItems(this.diet.mealItems, this.draftFood), this.estimateCache); return mealCalories(result.items, this.diet.calories, !isPresent(this.diet.calories) && (result.estimated || this.diet.estimated)) } catch { return { caloriesSource: "UNKNOWN" } } },
    autoEstimateText() {
      if (isPresent(this.diet.calories)) return "整餐采用手工修正值，可清空后恢复自动汇总。"
      let items; try { items = mergeMealItems(this.diet.mealItems, this.draftFood) } catch { return "请补全当前食物名称，自动估算会保留已有输入。" }
      const missing = items.filter(i => !isPresent(i.caloriesKcal)); if (!missing.length) return (items.some(i => i.caloriesSource === "ESTIMATE") || this.diet.estimated) ? "参考估算，供记录使用，可按实际情况修正。" : "自动汇总已填写的食物热量；可直接修正整餐热量。"
      const states = missing.map(i => i.weightGrams > 0 ? this.estimateCache[foodEstimateKey(i)]?.status || "waiting" : "weight");
      const matched = states.filter(s => s === "matched").length;
      if (states.some(s => s === "waiting" || s === "loading")) return "正在自动估算整餐热量…"
      if (states.every(s => s === "matched")) return matched + " 项使用常见食物参考估算，可手动修正。"
      const reason = states.includes("error") ? "参考服务暂不可用" : states.includes("unknown") ? "有食物未匹配参考数据" : "补充食物重量后可自动估算";
      return (matched ? matched + " 项已参考估算；" : "") + reason + "，未估算部分可手动填写或留空。"
    }
  },
  watch: { activeTab() { this.loadHistory(true); this.scheduleMealEstimate() }, draftFood: { deep: true, handler() { this.scheduleMealEstimate() } }, 'diet.mealItems': { deep: true, handler() { this.scheduleMealEstimate() } } },
  onLoad(options = {}) { if (this.tabs.some(t => t.key === options.tab)) this.activeTab = options.tab },
  onShow() {
    this.recordVisible = true
    if (!store.isLogin()) { uni.reLaunch({ url: '/pages/login/login' }); return }
    const user = store.getUserInfo(); const id = user.userId || user.id
    if (this.accountId && this.accountId !== id) { this.resetAllDietDrafts(); this.history = []; this.plans = []; this.replyDrafts = {}; this.pendingCreates = {}; this.weight = { value: '', unit: 'kg', waistCm: '', hipCm: '' }; this.sleepHours = ''; this.exercise = { activity: '', durationMinutes: '', note: '' } }
    this.accountId = id; this.height = user.height || null; this.today = localDate()
    const tab = uni.getStorageSync('patientRecordTab'); if (this.tabs.some(t => t.key === tab)) { this.activeTab = tab; uni.removeStorageSync('patientRecordTab') }
    this.loadHistory(true); this.scheduleMealEstimate()
    if (!this.plans.length) getDietPlans({ loading: false, showError: false }).then(r => { if (this.sameAccount()) this.plans = (Array.isArray(r.data) ? r.data : []).filter(p => p.status === 'ACTIVE') }).catch(() => {})
  },
  onHide() { this.captureDietForm(); this.stashMealDraft(); this.recordVisible = false; this.cancelMealEstimate() },
  onUnload() { this.recordVisible = false; this.cancelMealEstimate(); this.releaseAllDietPhotos(); this.dietSession++ },
  methods: {
    sameAccount() { const u = store.getUserInfo(); return this.accountId === (u.userId || u.id) && store.isLogin() },
    toast(title) { uni.showToast({ title: String(title).slice(0, 80), icon: 'none' }) },
    calorieLabel(source) { return CALORIE_LABELS[source] || '历史来源' },
    mealLabel(value) { return this.meals.find(m => m.key === String(value).toUpperCase())?.label || '饮食' },
    formatTime(value) { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : `${localDate(d)} ${d.toTimeString().slice(0, 5)}` },
    currentMealDraft() { return { diet: this.diet, draftFood: this.draftFood, photos: this.photos, photoError: this.photoError, estimateCache: this.estimateCache } },
    mealDraftFor(key) { return !this.editingId && this.diet.mealType === key ? this.currentMealDraft() : this.mealDrafts[key] },
    hasMealContent(draft) { return !!draft && (String(draft.diet.note || '').trim().length > 0 || draft.diet.mealItems.length > 0 || draft.photos.length > 0 || isPresent(draft.diet.calories) || Object.values(draft.draftFood).some(value => isPresent(value) && String(value).trim() !== '')) },
    stashMealDraft() {
      if (this.editingId) return
      const key = this.diet.mealType, draft = this.currentMealDraft(), previous = this.mealDrafts[key]
      this.mealDrafts[key] = previous?.diet === this.diet ? Object.assign(previous, draft) : draft
    },
    restoreMealDraft(key, date = this.diet.date) {
      const draft = this.mealDrafts[key] || { diet: { ...emptyDiet(), mealType: key, date }, draftFood: emptyFood(), photos: [], photoError: '', estimateCache: {} }
      this.diet = draft.diet; this.draftFood = draft.draftFood; this.photos = draft.photos; this.photoError = draft.photoError; this.estimateCache = draft.estimateCache
    },
    captureDietForm(event) {
      let values = event?.detail?.value
      // #ifdef H5
      // Capture native field values before switching: Uni H5 throttles v-model by 100 ms.
      if (!values) {
        values = {}
        for (const [name, ref] of Object.entries({ note: 'dietNoteInput', foodName: 'foodNameInput', foodWeightGrams: 'foodWeightInput', foodCaloriesKcal: 'foodCaloriesInput', mealCaloriesKcal: 'mealCaloriesInput' })) {
          const field = this.$refs?.[ref]?.$el?.querySelector('input, textarea')
          if (field) values[name] = field.value
        }
      }
      // #endif
      if (!values || !Object.prototype.hasOwnProperty.call(values, 'mealCaloriesKcal')) return
      this.diet.note = String(values.note ?? ''); this.diet.calories = values.mealCaloriesKcal
      const current = { name: String(values.foodName ?? ''), weightGrams: values.foodWeightGrams ?? '', caloriesKcal: values.foodCaloriesKcal ?? '' }
      const unchanged = foodEstimateKey(current) === foodEstimateKey(this.draftFood) && String(current.caloriesKcal) === String(this.draftFood.caloriesKcal ?? '')
      this.draftFood = { ...current, ...(isPresent(current.caloriesKcal) ? { caloriesSource: unchanged ? this.draftFood.caloriesSource || 'MANUAL' : 'MANUAL' } : {}) }
    },
    switchMeal(key) {
      if (this.saving || this.editingId || !this.meals.some(meal => meal.key === key) || key === this.diet.mealType) return
      this.captureDietForm(); this.cancelMealEstimate(); this.stashMealDraft(); this.restoreMealDraft(key); this.dietSubmitError = ''; this.scheduleMealEstimate()
    },
    releaseAllDietPhotos() { const paths = new Set([...this.photos, ...Object.values(this.mealDrafts).flatMap(draft => draft.photos)].map(photo => photo.path)); paths.forEach(path => releaseMediaFile(path)) },
    resetAllDietDrafts() {
      this.dietSession++; this.cancelMealEstimate(); this.releaseAllDietPhotos(); this.mealDrafts = {}; this.diet = emptyDiet(); this.draftFood = emptyFood(); this.photos = []; this.photoError = ''; this.estimateCache = {}; this.editingId = ''; this.resumeMeal = 'BREAKFAST'; this.dietSubmitMessage = ''; this.dietSubmitError = ''; this.submittingMeal = ''; this.saving = false
    },
    submitDietForm(event) { return this.editingId ? this.saveDiet(event) : this.saveAllDiet(event) },
    async loadHistory(reset = true) {
      if (!this.sameAccount()) return
      const sequence = ++this.loadSequence, tab = this.activeTab, page = reset ? 1 : this.historyPage + 1
      this.loadingHistory = true; this.historyError = ''; if (reset) this.history = []
      try { const r = await getHealthRecords({ type: tab, page, pageSize: 20 }, { loading: false, showError: false }); if (sequence !== this.loadSequence || !this.sameAccount()) return; this.history = reset ? r.data : [...this.history, ...r.data]; this.historyPage = page; this.hasMore = r.data.length === 20 }
      catch (e) { if (sequence === this.loadSequence) this.historyError = e.message || '加载失败，请重试' }
      finally { if (sequence === this.loadSequence) this.loadingHistory = false }
    },
    changeWeightUnit(event) { const unit = Number(event.detail.value) === 1 ? '斤' : 'kg'; if (this.weight.value && unit !== this.weight.unit) this.weight.value = String(Number(this.weight.value) * (unit === '斤' ? 2 : 0.5)); this.weight.unit = unit },
    async createRecord(payload) { const attempt = prepareRecordSubmission(payload, this.pendingCreates[payload.recordType]); this.pendingCreates[payload.recordType] = attempt; const result = await createHealthRecord(attempt.payload); if (result.code === 200) delete this.pendingCreates[payload.recordType]; return result },
    async saveSimple(payload, clear) { if (this.saving) return; this.saving = true; try { const r = await this.createRecord(payload); if (r.code !== 200) throw new Error(r.message); clear(); this.toast('已保存'); await this.loadHistory(true) } catch (e) { this.toast(e.message || '保存失败，输入已保留') } finally { this.saving = false } },
    saveWeight() { try { const weightValue = optionalNumber(this.weight.value, this.weight.unit === '斤' ? 800 : 400, '体重', this.weight.unit === '斤' ? 40 : 20); if (weightValue === undefined) throw new Error('请输入体重'); this.saveSimple({ recordType: 'WEIGHT', recordedAt: new Date().toISOString(), weightValue, weightUnit: this.weight.unit === '斤' ? 'JIN' : 'KG', waistCm: optionalNumber(this.weight.waistCm, 300, '腰围', 20), hipCm: optionalNumber(this.weight.hipCm, 300, '臀围', 20) }, () => { this.weight.value = ''; this.weight.waistCm = ''; this.weight.hipCm = '' }) } catch(e) { this.toast(e.message) } },
    saveSleep() { try { const sleepHours = optionalNumber(this.sleepHours, 24, '睡眠时长'); if (sleepHours === undefined) throw new Error('请输入睡眠时长'); this.saveSimple({ recordType: 'SLEEP', recordedAt: new Date().toISOString(), sleepHours }, () => { this.sleepHours = '' }) } catch(e) { this.toast(e.message) } },
    saveExercise() { try { const activity = this.exercise.activity.trim(), durationMinutes = optionalNumber(this.exercise.durationMinutes, 1440, '运动分钟', 1); if (!activity || durationMinutes === undefined) throw new Error('请填写运动名称和实际分钟数'); this.saveSimple({ recordType: 'EXERCISE', recordedAt: new Date().toISOString(), note: this.exercise.note.trim(), payload: { activity, durationMinutes } }, () => { this.exercise = { activity: '', durationMinutes: '', note: '' } }) } catch(e) { this.toast(e.message) } },
    markDraftFoodManual() { this.draftFood.caloriesSource = isPresent(this.draftFood.caloriesKcal) ? "MANUAL" : undefined },
    addFood() { try { const item = foodItem(this.draftFood); if (this.diet.mealItems.length >= 50) throw new Error('最多50种食物'); this.diet.mealItems.push(item); this.draftFood = emptyFood() } catch(e) { this.toast(e.message) } },
    editFood(index) { if (Object.values(this.draftFood).some(isPresent)) { this.toast('请先将当前输入添加到列表'); return } const item = this.diet.mealItems.splice(index, 1)[0]; this.draftFood = { ...emptyFood(), ...item } },
    cancelMealEstimate() { clearTimeout(this._estimateTimer); this.estimateGeneration++; this._estimatePending = {}; this.estimateCache = Object.fromEntries(Object.entries(this.estimateCache).filter(([,result]) => result.status !== "loading")); this.estimating = false },
    scheduleMealEstimate() { clearTimeout(this._estimateTimer); if (!this.recordVisible || this.activeTab !== "diet" || this.saving) return; this._estimateTimer = setTimeout(() => this.estimateMealNow(), 600) },
    async estimateMealNow(force = false) {
      clearTimeout(this._estimateTimer); if (!this.recordVisible || !this.sameAccount()) return;
      let items; try { items = mergeMealItems(this.diet.mealItems, this.draftFood) } catch { return }
      const generation = this.estimateGeneration, account = this.accountId; this._estimatePending ||= {};
      const eligible = [...new Map(items.filter(i => !isPresent(i.caloriesKcal) && i.weightGrams > 0).map(i => [foodEstimateKey(i), i])).entries()];
      const tasks = eligible.map(([key, food]) => {
        if (this._estimatePending[key]) return this._estimatePending[key];
        if (this.estimateCache[key] && (!force || this.estimateCache[key].status === "matched")) return null;
        this.estimateCache[key] = { status: "loading" };
        const task = (async () => {
          const current = () => this.recordVisible && generation === this.estimateGeneration && account === this.accountId && this.sameAccount();
          try {
            const r = await calculateCaloriesWithAI(food.name, food.weightGrams, { loading: false, showError: false, timeout: 8000 });
            if (!current()) return;
            if (r.data?.source === 'GENERIC_ESTIMATE') { this.estimateCache[key] = { status: "unknown" }; return }
            const calories = Number(r.data?.calories ?? r.data?.caloriesKcal);
            if (r.code !== 200 || r.data?.source !== "COMMON_FOOD_DATABASE" || !Number.isFinite(calories) || calories < 0) throw new Error("参考估算不可用");
            this.estimateCache[key] = { status: "matched", caloriesKcal: calories, source: r.data.source };
          } catch { if (current()) this.estimateCache[key] = { status: "error" } }
          finally { if (generation === this.estimateGeneration) delete this._estimatePending[key] }
        })(); this._estimatePending[key] = task; return task;
      }).filter(Boolean);
      if (!tasks.length) return; this.estimating = true; await Promise.all(tasks); if (generation === this.estimateGeneration) this.estimating = false;
    },
    async estimateFood() { await this.estimateMealNow(true) },
    choosePhotos() {
      if (this.saving) return
      const account = this.accountId, session = this.dietSession
      let draft = this.currentMealDraft()
      if (!this.editingId) {
        this.mealDrafts[this.diet.mealType] = draft
        // Keep the callback on the reactive draft when the picker hides the page.
        draft = this.mealDrafts[this.diet.mealType]
      }
      const current = () => session === this.dietSession && account === this.accountId && this.sameAccount()
      const fail = message => { if (current()) { draft.photoError = message; if (draft.photos === this.photos) this.photoError = message } }
      uni.chooseImage({ count: 9 - draft.photos.length, sizeType: ['original'], sourceType: ['album', 'camera'], success: res => {
        if (!current()) return
        for (const [i, path] of res.tempFilePaths.entries()) { if (res.tempFiles?.[i]?.size > 10 * 1024 * 1024) { fail('照片不能超过10MB'); continue } if (draft.photos.length < 9) draft.photos.push({ key: `${Date.now()}-${i}`, path, assetId: '' }) }
      }, fail: e => { if (!String(e.errMsg).includes('cancel')) fail('无法打开相机或相册，请检查权限后重试') } })
    },
    removePhoto(index) { if (this.saving) return; releaseMediaFile(this.photos[index].path); this.photos.splice(index, 1) },
    previewPhoto(photo) { if (photo.path) uni.previewImage({ current: photo.path, urls: this.photos.filter(p => p.path).map(p => p.path) }) },
    resetDiet() {
      const wasEditing = !!this.editingId, key = this.diet.mealType
      this.cancelMealEstimate(); this.photos.forEach(p => releaseMediaFile(p.path)); this.editingId = ''
      if (!wasEditing) delete this.mealDrafts[key]
      this.restoreMealDraft(wasEditing ? this.resumeMeal : key); this.scheduleMealEstimate()
    },
    cancelEdit() { uni.showModal({ title: '取消修改', content: '尚未保存的修改将被丢弃，原记录不变。', success: r => { if (r.confirm) this.resetDiet() } }) },
    async estimateDietDraft(draft, session, account) {
      const items = mergeMealItems(draft.diet.mealItems, draft.draftFood)
      const eligible = [...new Map(items.filter(item => !isPresent(item.caloriesKcal) && item.weightGrams > 0).map(item => [foodEstimateKey(item), item])).entries()]
      await Promise.all(eligible.map(async ([key, item]) => {
        if (draft.estimateCache[key] && draft.estimateCache[key].status !== 'loading') return
        let result
        try {
          const r = await calculateCaloriesWithAI(item.name, item.weightGrams, { loading: false, showError: false, timeout: 8000 })
          const calories = Number(r.data?.calories ?? r.data?.caloriesKcal)
          result = r.code === 200 && r.data?.source === 'COMMON_FOOD_DATABASE' && Number.isFinite(calories) && calories >= 0 ? { status: 'matched', caloriesKcal: calories, source: r.data.source } : { status: 'unknown' }
        } catch { result = { status: 'error' } }
        if (session !== this.dietSession || account !== this.accountId || !this.sameAccount()) throw new Error('账号已变化，已停止提交')
        draft.estimateCache[key] = result
      }))
    },
    async saveAllDiet(event) {
      if (this.saving || this.editingId || !this.sameAccount()) return
      this.captureDietForm(event); this.cancelMealEstimate(); this.stashMealDraft()
      const session = this.dietSession, account = this.accountId, submitted = []
      const current = () => session === this.dietSession && account === this.accountId && this.sameAccount()
      let mealKey = ''
      this.dietSubmitMessage = ''; this.dietSubmitError = ''
      try {
        const queue = this.meals.map(meal => [meal.key, this.mealDrafts[meal.key]]).filter(([, draft]) => this.hasMealContent(draft))
        if (!queue.length) throw new Error('请先填写至少一餐的文字、照片或食物')
        // Validate every meal before uploading photos or creating any records.
        for (const [key, draft] of queue) {
          mealKey = key
          const payload = buildDietPayload({ ...draft.diet, estimates: draft.estimateCache, imageAssetIds: draft.photos.map(photo => photo.assetId || photo.key) }, draft.draftFood)
          if (new Date(payload.recordedAt).getTime() > Date.now() + 5 * 60 * 1000) throw new Error('不能记录未来时间，请检查日期和时间')
        }
        this.saving = true
        for (const [key, draft] of queue) {
          if (!current()) return
          mealKey = key; this.submittingMeal = key
          const slot = 'DIET:' + key
          const inputFingerprint = JSON.stringify({ diet: draft.diet, food: draft.draftFood, photos: draft.photos.map(photo => photo.key) })
          let attempt = this.pendingCreates[slot]
          if (attempt?.inputFingerprint !== inputFingerprint) {
            await this.estimateDietDraft(draft, session, account)
            for (const photo of draft.photos) {
              if (!current()) return
              if (!photo.assetId) {
                const result = await upload(photo.path, { formData: { scope: 'DIET_IMAGE' }, loading: false })
                if (!current()) return
                if (result.code !== 200 || !result.data?.id) throw new Error('照片上传未完成')
                photo.assetId = result.data.id
              }
            }
            if (!current()) return
            const payload = buildDietPayload({ ...draft.diet, estimates: draft.estimateCache, imageAssetIds: draft.photos.map(photo => photo.assetId) }, draft.draftFood)
            attempt = { ...prepareRecordSubmission(payload), inputFingerprint }
            this.pendingCreates[slot] = attempt
          }
          const result = await createHealthRecord(attempt.payload)
          if (!current()) return
          if (result.code !== 200) throw new Error(result.message || '提交失败')
          delete this.pendingCreates[slot]; delete this.mealDrafts[key]
          draft.photos.forEach(photo => releaseMediaFile(photo.path))
          if (this.diet === draft.diet) this.restoreMealDraft(key)
          submitted.push(this.mealLabel(key))
          this.dietSubmitMessage = '已提交：' + submitted.join('、')
        }
        this.toast('已提交 ' + submitted.length + ' 餐'); await this.loadHistory(true)
      } catch (e) {
        if (!current()) return
        if (!this.saving && mealKey) this.switchMeal(mealKey)
        this.dietSubmitError = (mealKey ? this.mealLabel(mealKey) + '：' : '') + (e.message || '提交失败') + '。未提交内容已保留，请修改或重试。'
        this.toast((submitted.length ? '已提交 ' + submitted.length + ' 餐；' : '') + this.dietSubmitError)
        if (submitted.length) await this.loadHistory(true)
      } finally { if (current()) { this.saving = false; this.submittingMeal = ''; this.scheduleMealEstimate() } }
    },
    async saveDiet(event) {
      if (this.saving) return
      this.captureDietForm(event)
      try { mergeMealItems(this.diet.mealItems, this.draftFood); if (!this.diet.note.trim() && !this.diet.mealItems.length && !this.draftFood.name.trim() && !this.photos.length) throw new Error('请填写饮食文字、选择照片或添加食物'); this.saving = true
        await this.estimateMealNow()
        for (const photo of this.photos) { if (!photo.assetId) { const r = await upload(photo.path, { formData: { scope: 'DIET_IMAGE' }, loading: false }); if (r.code !== 200 || !r.data?.id) throw new Error('照片上传未完成，输入已保留'); photo.assetId = r.data.id } }
        const payload = buildDietPayload({ ...this.diet, estimates: this.estimateCache, imageAssetIds: this.photos.map(p => p.assetId) }, this.draftFood)
        const r = this.editingId ? await updateHealthRecord(this.editingId, payload) : await this.createRecord(payload)
        if (r.code !== 200) throw new Error(r.message || '保存失败')
        this.resetDiet(); this.toast('整餐已保存'); await this.loadHistory(true)
      } catch(e) { this.toast(e.statusCode === 409 ? '记录已被更新，请重新打开后修改；当前输入已保留' : e.message || '保存失败，输入已保留') } finally { this.saving = false }
    },
    async editDiet(record) {
      if (this.saving) return
      this.captureDietForm()
      if (this.editingId) { const accepted = await new Promise(resolve => uni.showModal({ title: '切换修改记录', content: '当前尚未保存的修改将被替换，是否继续？', success: r => resolve(r.confirm) })); if (!accepted) return }
      else { this.resumeMeal = this.diet.mealType; this.cancelMealEstimate(); this.stashMealDraft() }
      this.saving = true
      try { const result = await getHealthRecord(record.id, { loading: false }); if (!this.sameAccount()) return; if (result.code !== 200) throw new Error(result.message || '记录加载失败'); const row = result.data; this.cancelMealEstimate(); if (this.editingId) this.photos.forEach(photo => releaseMediaFile(photo.path)); this.estimateCache = {}; this.photoError = ''; this.editingId = row.id; this.diet = { ...emptyDiet(), mealType: String(row.mealType).toUpperCase(), date: row.recordDate, time: row.mealTime, note: row.note || '', mealItems: (row.mealItems || []).map(i => ({ ...i })), calories: row.caloriesSource === 'MANUAL' || row.caloriesSource === 'LEGACY' ? (row.caloriesKcal ?? '') : '', estimated: row.caloriesSource === 'ESTIMATE' && !(row.mealItems || []).some(item => item.caloriesSource), expectedUpdatedAt: row.updatedAt }; this.draftFood = emptyFood(); this.photos = (row.imageAssetIds || row.imageUrls || []).map(id => ({ key: id, assetId: id, path: '' })); uni.pageScrollTo({ scrollTop: 0, duration: 200 }); for (const photo of this.photos) { try { const path = await resolveMediaFile(photo.assetId); if (!this.sameAccount()) { releaseMediaFile(path); return } photo.path = path } catch(e) { if (this.sameAccount()) this.photoError = e.message } } }
      catch(e) { this.toast(e.message || '记录加载失败') } finally { this.saving = false }
    },
    async replyReview(recordId, reviewId) { const comment = String(this.replyDrafts[reviewId] || '').trim(); if (!comment || this.replying) return; this.replying = reviewId; try { const r = await replyToRecordReview(recordId, reviewId, comment); if (r.code !== 200) throw new Error(r.message); this.replyDrafts[reviewId] = ''; this.toast('回复已添加'); await this.loadHistory(true) } catch(e) { this.toast(e.message || '回复未保存，请重试') } finally { this.replying = '' } },
    deleteRecord(record) { uni.showModal({ title: '删除记录', content: '确定删除这条记录及其关联展示吗？', success: async r => { if (!r.confirm) return; try { const result = await deleteHealthRecord(record.id); if (result.code !== 200) throw new Error(result.message); if (this.editingId === record.id) this.resetDiet(); await this.loadHistory(true) } catch(e) { this.toast(e.message) } } }) }
  }
}
</script>
<style scoped>
.record-page { padding: 28rpx; color: #254654; background: #f4f9fb; min-height: 100vh; }
.intro,.card,.food-row > view { display: flex; flex-direction: column; gap: 12rpx; }
.title { font-size: 40rpx; font-weight: 700; }.heading { font-size: 30rpx; font-weight: 650; }.muted { display: block; font-size: 24rpx; color: #657f8c; line-height: 1.6; }.hint { display: block; font-size: 25rpx; color: #427589; line-height: 1.6; }.error { display: block; padding: 14rpx; color: #b64242; }.empty { display: block; padding: 40rpx 12rpx; color: #71858f; }
.tabs,.meal-tabs { display: flex; gap: 10rpx; margin: 24rpx 0; }.tabs button,.meal-tabs button { flex: 1; margin: 0; padding: 0 8rpx; font-size: 25rpx; }.tabs .active,.meal-tabs .active { background: #167f9f; color: white; }
.card { background: white; border-radius: 24rpx; padding: 26rpx; margin-bottom: 26rpx; border: 1rpx solid #e2edf2; }.row,.food-row,.section-row { display: flex; align-items: center; gap: 14rpx; justify-content: space-between; }.row > input { flex: 1; min-width: 0; }.food-row > view { flex: 1; }.food-row button { flex-shrink: 0; margin: 0; }.section-row { margin: 32rpx 0 18rpx; }
input,textarea { box-sizing: border-box; width: 100%; background: #f4f8fa; border: 1rpx solid #dce8ee; border-radius: 14rpx; padding: 20rpx; min-height: 84rpx; font-size: 28rpx; }textarea { min-height: 150rpx; margin: 12rpx 0; }.picker { padding: 20rpx; background: #f4f8fa; border-radius: 14rpx; font-size: 26rpx; }button { font-size: 26rpx; border-radius: 14rpx; background: #edf5f7; color: #235e72; }button.primary { width: 100%; background: #1686a8; color: white; margin-top: 18rpx; }button[disabled] { opacity: .6; }.divider { border-top: 1rpx solid #dce8ee; margin: 24rpx 0; }.total { padding: 20rpx 0; font-weight: 600; }.metric { font-size: 36rpx; color: #1686a8; }.paragraph { display: block; white-space: pre-wrap; line-height: 1.7; }.review { border-top: 1rpx solid #e3eef2; margin-top: 18rpx; padding-top: 18rpx; }.reply { margin: 14rpx 0 14rpx 20rpx; padding: 14rpx; background: #f4f8fa; }.delete { align-self: flex-end; color: #a95555; }.photos { display: flex; flex-wrap: wrap; gap: 16rpx; }.photo { width: 176rpx; }.photo image { width: 176rpx; height: 176rpx; border-radius: 14rpx; }.photo button { font-size: 22rpx; }.plan { border-left: 6rpx solid #1686a8; }.bottom-space { height: calc(32rpx + env(safe-area-inset-bottom)); }
</style>

<style scoped lang="scss">
@import "../../styles/patient-theme.scss";
.record-page { padding: 32rpx 28rpx calc(120rpx + env(safe-area-inset-bottom)); }
.record-page .intro { margin: -32rpx -28rpx 28rpx; padding: 40rpx 34rpx 36rpx; background: white url('../../static/brand/third-wave.webp') no-repeat right center; background-size: cover; }
.record-page .title { font-size: 42rpx; color: #08163d; }.record-page .muted { color: #63718e; }.record-page .heading { color: #14244b; }.record-page .hint { color: #5d6b8d; }
.record-page .tabs { background: #fff; padding: 8rpx; border: 1px solid #e3e8f2; border-radius: 14rpx; }
.record-page .tabs button, .record-page .meal-tabs button { min-height: 44px; display: flex; align-items: center; justify-content: center; line-height: 1.5; color: #596889; background: transparent; }
.record-page .tabs .active { background: #2b5fff; color: #fff; }.record-page .meal-tabs .active { background: #edf2ff; color: #2458e8; }
.record-page .card { border-color: #e3e8f2; border-radius: 16rpx; padding: 28rpx; box-shadow: none; }
.record-page input, .record-page textarea { background: #fff; border-color: #d6deed; border-radius: 12rpx; }
.record-page input:focus, .record-page textarea:focus { border-color: #2b5fff; }
.record-page .picker { background: #f3f6fc; color: #4f628c; }
.record-page button { color: #2a55c5; background: #edf2ff; }.record-page button.primary { background: #2b5fff; color: #fff; }.record-page .metric { color: #2b5fff; }
.record-page .row { flex-wrap: wrap; }.record-page .row > input { min-width: 120rpx; }.record-page .food-row { align-items: flex-start; flex-wrap: wrap; }.record-page .food-row > view { min-width: 220rpx; overflow-wrap: anywhere; }
.record-page .food-row button { min-height: 36px; }.record-page .reply { background: #f5f7fc; }.record-page .plan { border-left-color: #00adbe; }

</style>

<style scoped>
/* Narrow-screen action spacing and reachable controls. */
.meal-form-content { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.meal-form-content > .row { gap: 8px; }
.meal-form-content > .row > button { margin: 0; min-width: 0; flex: 1; }
.meal-form-content > .row > input { min-width: 0; }
</style>

<style scoped>
/* Final touch target audit: layout only. */
.record-page .food-row button { min-height: 44px; }
.record-page.diet-active { padding-bottom: calc(180px + env(safe-area-inset-bottom)); }
.record-page .meal-tabs button { flex-direction: column; gap: 2px; padding: 8px 2px; }
.record-page .meal-tabs .meal-draft-label { font-size: 11px; line-height: 1.2; color: #52627a; }
.record-page .meal-tabs .filled { box-shadow: inset 0 -2px #96a8c5; }
.record-page .diet-submit-message { color: #38634c; line-height: 1.6; }
.record-page .diet-submit-bar { position: fixed; z-index: 20; left: 0; right: 0; bottom: calc(56px + env(safe-area-inset-bottom)); display: flex; align-items: center; gap: 12px; min-height: 82px; padding: 12px 16px; box-sizing: border-box; background: #fff; border-top: 1px solid #e3e8f2; box-shadow: 0 -3px 12px rgba(20,36,75,.06); }
.record-page .diet-submit-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.record-page .diet-submit-copy .heading { font-size: 15px; line-height: 1.4; }
.record-page .diet-submit-copy .muted { font-size: 11px; line-height: 1.5; }
.record-page .diet-submit-bar button.primary { flex: none; width: 112px; margin: 0; min-height: 44px; font-size: 15px; }
@media screen and (min-width: 768px) { .record-page .diet-submit-bar { max-width: 430px; margin: 0 auto; } }
</style>
