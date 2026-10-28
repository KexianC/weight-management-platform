/** Pure record contract. Missing calories stay unknown, never become a fabricated zero. */
export const CALORIE_LABELS = { MANUAL: '手动修正', ITEM_SUM: '食物合计', ITEM_SUM_PARTIAL: '部分食物合计', ESTIMATE: '参考估算', UNKNOWN: '待补充', LEGACY: '历史记录' }
export const isPresent = value => value !== '' && value !== null && value !== undefined
export function optionalNumber(value, max, label, min = 0) {
  if (!isPresent(value)) return undefined
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label}须为 ${min}–${max} 的数值`)
  return Math.round(number * 100) / 100
}
export function foodItem(food = {}) {
  const name = String(food.name ?? food.foodName ?? '').trim()
  if (!name) throw new Error('请填写食物名称，避免遗漏当前输入')
  if (name.length > 191) throw new Error('食物名称最多191字')
  const caloriesKcal = optionalNumber(food.caloriesKcal ?? food.calories, 30000, '食物热量')
  const caloriesSource = ['MANUAL', 'ESTIMATE', 'UNKNOWN'].includes(food.caloriesSource) ? (caloriesKcal === undefined ? 'UNKNOWN' : food.caloriesSource) : undefined
  return Object.fromEntries(Object.entries({ name, weightGrams: optionalNumber(food.weightGrams ?? food.foodWeight, 10000, '食物重量'), caloriesKcal, caloriesSource }).filter(([, v]) => v !== undefined))
}
export function mergeMealItems(items = [], draft = {}) {
  const hasDraft = [draft.name, draft.foodName, draft.weightGrams, draft.foodWeight, draft.caloriesKcal, draft.calories].some(v => isPresent(v) && String(v).trim() !== '')
  const merged = [...items.map(foodItem), ...(hasDraft ? [foodItem(draft)] : [])]
  if (merged.length > 50) throw new Error('每餐最多50项食物')
  return merged
}
export function mealCalories(items = [], manual = '', estimated = false) {
  if (isPresent(manual)) return { caloriesKcal: optionalNumber(manual, 30000, '整餐热量'), caloriesSource: estimated ? 'ESTIMATE' : 'MANUAL' }
  const known = items.filter(i => isPresent(i.caloriesKcal))
  return { caloriesKcal: known.length ? optionalNumber(known.reduce((sum, i) => sum + Number(i.caloriesKcal), 0), 30000, '整餐热量') : undefined,
    caloriesSource: known.length ? known.length === items.length ? (estimated || known.some(item => item.caloriesSource === 'ESTIMATE') ? 'ESTIMATE' : 'ITEM_SUM') : 'ITEM_SUM_PARTIAL' : 'UNKNOWN' }
}
export function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function localDateTime(date, time) {
  const value = new Date(`${date}T${time || '00:00'}:00`)
  if (Number.isNaN(value.getTime())) throw new Error('请选择有效日期与时间')
  return value.toISOString()
}
export function buildDietPayload(form, draft = {}) {
  const resolved = completeMealEstimates(mergeMealItems(form.mealItems, draft), form.estimates)
  const mealItems = resolved.items
  const note = String(form.note || '').trim()
  const imageAssetIds = [...(form.imageAssetIds || [])]
  if (!note && !mealItems.length && !imageAssetIds.length) throw new Error('请填写饮食文字、选择照片或添加食物')
  if (note.length > 500) throw new Error('饮食文字最多500字')
  const summary = mealCalories(mealItems, form.calories, !isPresent(form.calories) && (resolved.estimated || form.estimated))
  // Explicit null clears a previously manual total on PATCH; missing values otherwise mean keep existing.
  if (form.expectedUpdatedAt && summary.caloriesKcal === undefined) summary.caloriesKcal = null
  return { recordType: 'DIET', mealType: form.mealType, recordedAt: localDateTime(form.date, form.time), mealTime: localDateTime(form.date, form.time), note, mealItems, imageAssetIds, ...summary, expectedUpdatedAt: form.expectedUpdatedAt }
}
export function normalizeRecordPayload(data) {
  const recordType = String(data.recordType || data.type || '').toUpperCase()
  const payload = { recordType, recordedAt: data.recordedAt || data.measuredAt, note: data.note ?? data.notes }
  if (!payload.recordedAt && (data.recordDate || data.date)) payload.recordedAt = localDateTime(data.recordDate || data.date, /^\d{2}:\d{2}$/.test(data.mealTime || '') ? data.mealTime : '00:00')
  for (const key of ['idempotencyKey','weightValue','weightUnit','waistCm','hipCm','sleepHours','bodyFatPct','payload','source','expectedUpdatedAt','imageAssetIds','imageUrls','caloriesSource','draftMealItem']) {
    if (data[key] !== undefined) payload[key] = data[key]
  }
  if (recordType === 'WEIGHT') {
    if (data.weightKg !== undefined || data.weight !== undefined) payload.weightKg = Number(data.weightKg ?? data.weight)
    if (isPresent(data.bmi)) payload.bmi = Number(data.bmi)
  }
  if (recordType === 'DIET') {
    payload.mealType = String(data.mealType || '').toUpperCase()
    payload.mealTime = data.mealTime?.includes('T') ? data.mealTime : payload.recordedAt
    payload.mealItems = data.mealItems || (data.foodName ? [foodItem(data)] : [])
    if (data.caloriesKcal === null) payload.caloriesKcal = null
    else if (isPresent(data.caloriesKcal ?? data.calories)) payload.caloriesKcal = Number(data.caloriesKcal ?? data.calories)
  }
  // Preserve empty note/image/item arrays during editing so explicit removals reach the API.
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined))
}
export function prepareRecordSubmission(payload, previous) {
  const content = { ...payload }
  if (content.recordType !== 'DIET') delete content.recordedAt
  const fingerprint = JSON.stringify(content)
  if (previous?.fingerprint === fingerprint) return previous
  const idempotencyKey = `record_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}_${Math.random().toString(36).slice(2, 8)}`
  return { fingerprint, payload: { ...payload, idempotencyKey } }
}

export function foodEstimateKey(food) { return JSON.stringify([String(food.name || "").trim(), Number(food.weightGrams)]) }
export function completeMealEstimates(items, cache = {}) {
  let estimated = items.some(food => isPresent(food.caloriesKcal) && food.caloriesSource === 'ESTIMATE')
  const resolved = items.map(food => { const result = cache[foodEstimateKey(food)]; if (isPresent(food.caloriesKcal)) return food; if (result?.status !== "matched") return { ...food, caloriesSource: 'UNKNOWN' }; estimated = true; return { ...food, caloriesKcal: result.caloriesKcal, caloriesSource: 'ESTIMATE' } })
  return { items: resolved, estimated }
}
