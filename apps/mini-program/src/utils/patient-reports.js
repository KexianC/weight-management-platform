import { get, post, upload } from './api.js'

export const REPORT_CATEGORIES = [
  { key: 'weight', category: 'BODY_COMPOSITION', label: '人体成分' },
  { key: 'exercise', category: 'EXERCISE_ASSESSMENT', label: '运动评估' },
  { key: 'medical', category: 'MEDICAL_EXAMINATION', label: '医学体检' }
]

export function isPatientSession(user) {
  return String(user?.backendRole || user?.role || '').toUpperCase() === 'PATIENT'
}

export function patientIdOf(user) {
  if (!isPatientSession(user)) throw new Error('请使用本报告所属客户账号登录')
  const id = user?.userId || user?.id
  if (!id) throw new Error('登录信息不完整，请重新登录')
  return String(id)
}

export function reportItems(value) {
  if (Array.isArray(value)) return value
  return Array.isArray(value?.items) ? value.items : []
}

export function healthReportFileKind(file = {}) {
  const mimeType = String(file.mimeType || '').split(';')[0].trim().toLowerCase()
  if (mimeType === 'application/pdf') return 'pdf'
  if (['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return 'image'
  return ''
}

export function reportOcrStatus(provider = {}) {
  if (provider.status === 'UNCONFIGURED' || provider.provider === 'disabled') return '本原件入口不会触发图片识别；云识别须以上方逐图授权状态为准，结果仍须工作人员核对。'
  if (provider.provider === 'mock') return '当前为模拟模式：虚构指标与图片无关，不能作为真实识别结果；本页仅保存原图。'
  if (provider.provider === 'local') return '当前仅支持本地标签文本解析，不进行照片 OCR；本页仅保存原图，指标须由医护人员核对。'
  if (provider.photoRecognitionConfigured === true) return '照片识别服务已配置；本页上传仅保存原图，识别结果仍需由医护人员核对。'
  return '照片 OCR 配置尚未确认；本页仅保存原图，不会自动生成识别结果。'
}

export function bodyReportSource(report = {}) {
  const source = String(report.source || '')
  if (source.includes('MOCK')) return '模拟虚构指标（与报告图片无关）'
  if (source === 'LOCAL_TEXT_REVIEWED') return '本地标签文本解析，已人工核对（未识别照片）'
  if (source === 'BAILIAN_VISION_REVIEWED') return '百炼云识别，经工作人员人工核对'
  if (source === 'MANUAL_REVIEWED') return '手工填写，已人工核对'
  if (source === 'MANUAL') return '人工录入'
  return '来源未标注'
}

export function bodyMetrics(report) {
  const labels = [
    ['heightCm', '身高', 'cm'], ['weightKg', '体重', 'kg'],
    ['bodyFatPct', '体脂率', '%'], ['bmi', 'BMI', ''],
    ['skeletalMuscleMassKg', '骨骼肌量', 'kg'], ['muscleMassKg', '肌肉量', 'kg'],
    ['waistCm', '腰围', 'cm'], ['hipCm', '臀围', 'cm']
  ]
  return labels.filter(([key]) => report?.[key] !== null && report?.[key] !== undefined && report?.[key] !== '' && Number.isFinite(Number(report[key])))
    .map(([key, label, unit]) => ({ key, label, value: Number(report[key]), unit }))
}

export function validateShareLocator(locator = {}) {
  if (locator.shareId && /^[A-Za-z0-9_-]{1,80}$/.test(locator.shareId)) return { shareId: locator.shareId }
  if (locator.token && /^[A-Za-z0-9_-]{43}$/.test(locator.token)) return { token: locator.token }
  if (!locator.shareId && !locator.token && locator.reportId && /^[A-Za-z0-9_-]{1,191}$/.test(locator.reportId)) return { reportId: locator.reportId }
  throw new Error('报告链接不完整或无效')
}

export const getPatientCareReports = (user, options = {}) => get('/care-management/patients/' + encodeURIComponent(patientIdOf(user)), {}, options)
export const getPatientHealthFiles = (user, options = {}) => get('/report-workflow/patients/' + encodeURIComponent(patientIdOf(user)) + '/health-reports', {}, options)
export const getReportOcrProvider = (options = {}) => get('/report-workflow/ocr/provider', {}, options)

export const savePatientMedicalReport = (user, draft, options = {}) => savePatientHealthReport(user, draft, 'MEDICAL_EXAMINATION', options)
export const savePatientBodyReport = (user, draft, options = {}) => savePatientHealthReport(user, draft, 'BODY_COMPOSITION', options)
export async function savePatientHealthReport(user, draft, category, options = {}) {
  if (!['BODY_COMPOSITION', 'MEDICAL_EXAMINATION'].includes(category)) throw new Error('报告类别无效')
  const patientId = patientIdOf(user)
  const title = String(draft?.title || '').trim()
  if (!title || title.length > 120) throw new Error('请填写 1 至 120 字的报告名称')
  if (!draft?.mediaAssetId && !draft?.filePath) throw new Error('请选择报告原图')
  let mediaAssetId = draft.mediaAssetId
  if (!mediaAssetId) {
    const uploaded = await upload(draft.filePath, { loading: false, showError: false })
    mediaAssetId = uploaded.data?.id
    if (!mediaAssetId) throw new Error('文件上传未返回有效编号，请重试')
    options.onUploaded?.(mediaAssetId)
  }
  // A report is saved only when the business endpoint confirms the media binding.
  const saved = await post('/report-workflow/patients/' + encodeURIComponent(patientId) + '/health-reports', {
    mediaAssetId, category, title
  }, { loading: false, showError: false })
  if (!saved.data?.id || saved.data.mediaAssetId !== mediaAssetId || saved.data.category !== category) throw new Error('服务端未确认报告与原图关联成功，请保留输入并重试')
  return saved
}

export async function getSharedExerciseReport(locator, user, options = {}) {
  patientIdOf(user)
  const value = validateShareLocator(locator)
  if (value.shareId) return get('/care-management/shared-reports/by-share/' + encodeURIComponent(value.shareId), {}, options)
  if (value.token) return get('/care-management/shared-reports/' + encodeURIComponent(value.token), {}, options)
  const response = await getPatientCareReports(user, options)
  const report = reportItems(response.data?.exerciseReports).find(item => item.id === value.reportId)
  if (!report) throw new Error('报告已过期、已撤销或尚未发送，请联系营养师')
  return { ...response, data: report }
}
