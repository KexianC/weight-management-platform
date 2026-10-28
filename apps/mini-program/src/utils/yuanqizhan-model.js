import { SOURCE_FORMS } from './yuanqizhan-form.js'

export const PHOTO_MAX_BYTES = 10485760
export const PHOTO_SLOTS = ['tongue_coating', 'tongue_underside', 'face', 'body_front', 'body_side', 'body_back']
export const BOWEL_KEYS = ['bowel_count', 'bowel_ease', 'bowel_extra']
export const DISPLAY_CORRECTIONS = {
  '+1分::略微比平时想吃/吃得多': '+1分：略微比平时想吃/吃得多',
  '+2:分:食欲亢进，总想吃东西': '+2分：食欲亢进，总想吃东西',
  '晨起排便后身材测面照:': '晨起排便后身材侧面照：',
  '型7：完全水状、无固体（腹泻)': '型7：完全水状、无固体（腹泻）'
}
export function displayLabel(original) { return DISPLAY_CORRECTIONS[original] || String(original || '').replace(/:/g, '：') }
export function activityForm(type = 'daily') {
  const source = SOURCE_FORMS.find(form => form.id === type) || SOURCE_FORMS[0]
  return { ...source, questions: source.questions.map(question => ({
    ...question,
    label: question.key === 'fasting_weight' ? '今日空腹体重（kg）：' : question.key === 'fasting_waist' ? '今日空腹腰围（cm）：' : question.key === 'bowel_observation' ? '今日排便观察' : displayLabel(question.labelOriginal),
    unit: question.key === 'fasting_weight' ? 'kg' : question.key === 'fasting_waist' ? 'cm' : null,
    options: question.options.map(option => ({ ...option, label: displayLabel(option.labelOriginal) })),
    subfields: question.subfields.map(field => ({ ...field,
      label: field.key === 'bowel_extra' ? '其他排便观察（可选）' : displayLabel(field.labelOriginal),
      hint: field.key === 'bowel_extra' ? '自由填写其他观察，不必填写' : field.hintOriginal || '自由填写'
    }))
  })) }
}
export function formFromServer(form, type) {
  if (!Array.isArray(form?.questions)) return activityForm(type)
  const fallback = activityForm(type)
  return { ...fallback, ...form, questions: form.questions.map(question => {
    const reference = fallback.questions.find(item => item.key === question.key) || {}
    return { ...reference, ...question, label: question.label || reference.label,
      options: (question.options || reference.options || []).map(option => ({ ...option, label: option.label || displayLabel(option.labelOriginal) })),
      subfields: (question.subfields || reference.subfields || []).map(field => ({ ...field, label: field.key === 'bowel_extra' ? '其他排便观察（可选）' : field.label || displayLabel(field.labelOriginal), hint: field.key === 'bowel_extra' ? '自由填写其他观察，不必填写' : field.hint || field.hintOriginal || '自由填写' }))
    }
  }) }
}
export function emptyAnswers() {
  return { name: '', fasting_weight: '', fasting_waist: '', fatigue: null, hunger: null, appetite: null, sleep_quality: null, energy_complexion: null, stool_type: null, bowel_observation: { bowel_count: '', bowel_ease: '', bowel_extra: '' } }
}
export function hydrateAnswers(record) {
  const answers = { ...emptyAnswers(), ...(record?.answers || {}) }
  answers.bowel_observation = { ...emptyAnswers().bowel_observation, ...(record?.answers?.bowel_observation || {}) }
  return answers
}
export function hasAnswer(value) { return value !== '' && value !== null && value !== undefined }
function positiveMeasurement(value, label) {
  const text = String(value).trim()
  if (!/^\d+(?:\.\d{1,4})?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0 || Number(text) > 10000) throw new Error(`${label}请填正数，最多4位小数（上限10000）`)
  return Number(text)
}
export function buildActivityAnswers(type, input, status) {
  const output = {}
  for (const question of activityForm(type).questions) {
    if (question.type === 'file_upload') continue
    const value = input[question.key]
    if (question.type === 'inline_multiple_text') {
      const fields = Object.fromEntries(BOWEL_KEYS.map(key => [key, String(value?.[key] ?? '').trim()]))
      if (Object.values(fields).some(text => text.length > 500)) throw new Error('排便观察每项最多500字')
      if (status === 'SUBMITTED' && !Object.values(fields).some(Boolean)) throw new Error('请填写今日排便观察，三项任意一项有内容即可')
      output[question.key] = fields
    } else if (question.type === 'single_choice') {
      if (!hasAnswer(value)) {
        if (status === 'SUBMITTED') throw new Error(`请选择${question.label}`)
      } else {
        const number = Number(value)
        if (!question.options.some(option => option.value === number)) throw new Error(`${question.label}选项无效`)
        output[question.key] = number
      }
    } else if (question.unit) {
      if (!hasAnswer(value)) {
        if (status === 'SUBMITTED') throw new Error(`请填写${question.label}`)
      } else output[question.key] = positiveMeasurement(value, question.label)
    } else {
      const text = String(value ?? '').trim()
      if (text.length > 80) throw new Error('姓名最多80字')
      if (!text && status === 'SUBMITTED') throw new Error('请填写您的姓名')
      output[question.key] = text
    }
  }
  return output
}
export function buildActivityPhotos(type, photos, status) {
  const output = {}
  if (type !== 'milestone') return output
  for (const slot of PHOTO_SLOTS) {
    const assetId = photos[slot]?.assetId || ''
    if (status === 'SUBMITTED' && !assetId) throw new Error(`请选择${activityForm(type).questions.find(question => question.key === slot).label}`)
    if (assetId) output[slot] = assetId
  }
  return output
}
export function prepareActivitySubmission(base, prior) {
  const fingerprint = JSON.stringify(base)
  if (prior?.fingerprint === fingerprint) return prior
  const idempotencyKey = `yqz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}_${Math.random().toString(36).slice(2, 10)}`
  return { fingerprint, payload: { ...base, idempotencyKey } }
}
export function writeBlockedLabel(reason) {
  const labels = { BEFORE_EFFECTIVE_JOIN: '尚未到加入时间，暂时不能填写。', MEMBER_REMOVED: '参与资格已移除，不能继续填写；本人历史仍可查看。', ACTIVITY_ENDED: '活动已结束，不能继续填写；本人历史仍可查看。', PERSONAL_PERIOD_ENDED: '你的15天活动已结束，历史记录仍可查看。' }
  return labels[reason] || (reason && !/^[A-Z_]+$/.test(reason) ? reason : '当前不可写，历史记录只读。')
}
export function statusLabel(status) { return status === 'SUBMITTED' ? '已提交' : status === 'DRAFT' ? '草稿（未完成）' : '未打卡' }
export function photoState(record) {
  return Object.fromEntries(PHOTO_SLOTS.map(slot => [slot, { assetId: record?.photos?.[slot] || '', path: '', mimeType: 'image/jpeg' }]))
}