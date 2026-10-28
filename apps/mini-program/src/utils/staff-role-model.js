export const STAFF_LOGIN_OPTIONS = Object.freeze([
  { value: 'practitioner', label: '医生 / 营养师（自动识别）' },
  { value: 'DOCTOR', label: '医生' },
  { value: 'NUTRITIONIST', label: '营养师' },
  { value: 'HEALTH_MANAGER', label: '健康管理师' },
  { value: 'EXERCISE_COACH', label: '运动老师' }
])
export const NEW_STAFF_ROLES = Object.freeze(['HEALTH_MANAGER', 'EXERCISE_COACH'])
export const roleOf = (user = {}) => String(user.backendRole || user.role || '').toUpperCase()
export const idOf = (user = {}) => String(user.userId || user.id || '')
export function staffHome(role) {
  return role === 'HEALTH_MANAGER' ? '/pages/health-manager/index' : role === 'EXERCISE_COACH' ? '/pages/exercise-coach/index' : '/pages/doctor/index'
}
export function staffTabs(role) {
  if (role === 'HEALTH_MANAGER') return [
    { path: '/pages/health-manager/index', text: '工作台', icon: 'Buildings/home-line.svg' },
    { path: '/pages/health-manager/clients', text: '客户管理', icon: 'User/group-line.svg' },
    { path: '/pages/health-manager/enroll', text: '客户建档', icon: 'System/add-line.svg' },
    { path: '/pages/staff/profile', text: '我的', icon: 'User/user-line.svg' }
  ]
  if (role === 'EXERCISE_COACH') return [
    { path: '/pages/exercise-coach/index', text: '工作台', icon: 'Buildings/home-line.svg' },
    { path: '/pages/exercise-coach/clients', text: '分配客户', icon: 'User/group-line.svg' },
    { path: '/pages/exercise-coach/videos', text: '动作视频', icon: 'Document/file-text-line.svg' },
    { path: '/pages/staff/profile', text: '我的', icon: 'User/user-line.svg' }
  ]
  return []
}
export function canWriteClient(client, user) {
  return roleOf(user) === 'HEALTH_MANAGER' && !!client?.enrollment && client.enrollment.healthManagerId === idOf(user) && client.patient?.status === 'ACTIVE' && client.capabilities?.writeManagedCare === true
}
export const LIFESTYLE_FIELDS = Object.freeze([
  { key: 'sleepHours', label: '每日睡眠（小时）', min: 0, max: 24, value: 8 },
  { key: 'mealsPerDay', label: '每日进餐次数', min: 1, max: 8, integer: true, value: 3 },
  { key: 'sedentaryHours', label: '每日久坐（小时）', min: 0, max: 24, value: 6 },
  { key: 'waterMl', label: '每日饮水（mL）', min: 0, max: 10000, integer: true, value: 1500 }
])
export const BODY_FIELDS = Object.freeze([
  { key: 'heightCm', label: '身高', unit: 'cm', min: 30, max: 260 },
  { key: 'weightKg', label: '体重', unit: 'kg', min: 1, max: 500 },
  { key: 'bodyFatPct', label: '体脂率', unit: '%', min: 1, max: 80 },
  { key: 'muscleMassKg', label: '肌肉量', unit: 'kg', min: 1, max: 250 },
  { key: 'skeletalMuscleMassKg', label: '骨骼肌量', unit: 'kg', min: 1, max: 150 },
  { key: 'waistCm', label: '腰围', unit: 'cm', min: 10, max: 300 },
  { key: 'hipCm', label: '臀围', unit: 'cm', min: 10, max: 300 },
  { key: 'bmi', label: 'BMI', unit: 'kg/m²', min: 5, max: 100 }
])
export const REPORT_TYPES = Object.freeze([
  { value: 'BODY_COMPOSITION', label: '人体成分' },
  { value: 'EXERCISE_ASSESSMENT', label: '运动评估' },
  { value: 'MEDICAL_EXAMINATION', label: '医学体检' }
])
function text(value, label, max, required = true) {
  const s = String(value ?? '').trim()
  if ((required && !s) || s.length > max) throw new Error(label + '不能为空或超出长度')
  return s
}
function number(value, label, min, max, integer = false) {
  if (String(value ?? '').trim() === '') throw new Error('请填写' + label)
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(label + '超出有效范围')
  return n
}
export function lifestylePayload(form) {
  const result = {}
  for (const f of LIFESTYLE_FIELDS) result[f.key] = number(form[f.key], f.label, f.min, f.max, f.integer)
  for (const [key, values] of [['activityLevel', ['LOW', 'MODERATE', 'HIGH']], ['smoking', ['NEVER', 'FORMER', 'CURRENT']], ['alcohol', ['NEVER', 'OCCASIONAL', 'FREQUENT']]]) {
    if (!values.includes(form[key])) throw new Error('请完整选择生活习惯')
    result[key] = form[key]
  }
  return result
}
export function enrollmentPayload(form) {
  const phone = String(form.phone || '').trim().replace(/^\+?86/, '')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入有效手机号')
  return { name: text(form.name, '客户姓名', 80), phone, packageName: text(form.packageName, '购买套餐', 120),
    nutritionistId: text(form.nutritionistId, '营养师', 191), doctorId: text(form.doctorId, '归属医生', 191),
    exerciseCoachId: text(form.exerciseCoachId, '运动老师', 191), lifestyle: lifestylePayload(form) }
}
export function bodyPayload(form, now = Date.now()) {
  const at = new Date(form.measuredAt)
  if (!Number.isFinite(at.getTime()) || at.getTime() > now + 60000) throw new Error('请核对检测日期，不能为未来时间')
  const result = { measuredAt: at.toISOString() }
  for (const f of BODY_FIELDS) if (String(form[f.key] ?? '').trim() !== '') result[f.key] = number(form[f.key], f.label, f.min, f.max)
  if (Object.keys(result).length === 1) throw new Error('至少填写一项检测指标')
  return result
}
export function prescriptionPayload(form, videos) {
  if (!Array.isArray(form.items) || !form.items.length || form.items.length > 30) throw new Error('请添加1至30个动作')
  return { assessment: text(form.assessment, '人工评估', 2000), precautions: text(form.precautions, '注意事项', 1000, false),
    items: form.items.map(item => {
      if (!videos.some(v => v.id === item.videoId)) throw new Error('请为每个动作选择当前有效视频')
      return { videoId: item.videoId, actionName: text(item.actionName, '动作名称', 120), sets: number(item.sets, '组数', 1, 20, true),
        reps: number(item.reps, '每组次数', 1, 200, true), tempo: text(item.tempo, '动作节奏', 80),
        restSeconds: number(item.restSeconds, '休息秒数', 0, 600, true), frequency: text(item.frequency, '跟练频率', 80) }
    }) }
}
export function inputSnapshot(form, detail = {}) {
  const next = { ...form }
  for (const key of Object.keys(form)) if (Object.prototype.hasOwnProperty.call(detail, key)) next[key] = detail[key]
  return next
}
export function businessEntries(record = {}) {
  const labels = { weightKg: '体重（kg）', waistCm: '腰围（cm）', hipCm: '臀围（cm）', bodyFatPct: '体脂率（%）', sleepHours: '睡眠（小时）', caloriesKcal: '整餐热量（kcal）', mealType: '餐别', note: '记录说明', activity: '运动项目', durationMinutes: '运动时长（分钟）', minutes: '时长（分钟）', value: '记录值', unit: '单位' }
  const result = []
  for (const [key, label] of Object.entries(labels)) {
    const value = record[key] ?? record.payload?.[key]
    if (value !== undefined && value !== null && value !== '') result.push({ label, value: String(value) })
  }
  if (record.mealItems?.length) result.push({ label: '食物明细', value: record.mealItems.map(x => [x.name, x.weightGrams === undefined ? '' : x.weightGrams + 'g', x.caloriesKcal === undefined ? '' : x.caloriesKcal + 'kcal'].filter(Boolean).join(' · ')).join('；') })
  return result
}

export function safeBusinessText(value) {
  function clean(v) {
    if (v === null || ['string','number','boolean'].includes(typeof v)) return v
    if (Array.isArray(v)) return v.map(clean)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !/password|passphrase|token|secret|credential|api.?key|authorization|cookie|session|private.?key/i.test(k)).map(([k,v]) => [k,clean(v)]))
    return undefined
  }
  const sanitized = clean(value)
  return sanitized == null ? '' : typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized, null, 2)
}
