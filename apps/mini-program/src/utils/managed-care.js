import { get, post, del, getPatientList, getDoctorPatientRelations } from './api.js'
import { getStorage } from './common.js'

export const SHARE_DAYS = Object.freeze([1, 7, 14, 30])
export const isNutritionist = (user = getStorage('userInfo') || {}) => String(user.backendRole || user.role || '').toUpperCase() === 'NUTRITIONIST'
const key = (value) => encodeURIComponent(String(value || ''))
const optionsFor = (options) => ({ loading: false, showError: false, ...options })

export function clientLabel(row = {}) {
  const code = String(row.enrollment?.clientCode || row.clientCode || '')
  return /^KH[A-Z0-9]{4,40}$/i.test(code) ? code : `客户${String(row.patient?.id || row.patientId || row.id || '').slice(-8).toUpperCase()}`
}

// An allowlist prevents identity fields from legacy adapters entering the nutritionist UI.
export function assignedClient(row) {
  const id = row?.patient?.id || row?.enrollment?.patientId
  if (!id) return null
  return { id, userId: id, patientId: id, name: clientLabel(row), displayName: clientLabel(row), phone: '身份信息已隐藏', avatar: '', clientCode: clientLabel(row), packageName: row.enrollment?.packageName || '', relationInfo: { createdAt: row.enrollment?.createdAt } }
}

export async function getAssignedClients(options = {}) {
  const response = await get('/care-management/patients', {}, optionsFor(options))
  if (!Array.isArray(response.data)) throw new Error('客户分配接口响应无效')
  return response.data.map(assignedClient).filter(Boolean)
}

export async function managedPatientList(params = {}, options = {}) {
  if (!isNutritionist()) return getPatientList(params, options)
  let patients = await getAssignedClients(options)
  const query = String(params.keyword || params.search || '').trim().toLowerCase()
  if (query) patients = patients.filter((row) => row.name.toLowerCase().includes(query))
  const total = patients.length
  const page = Math.max(1, Number(params.page || 1))
  const pageSize = Math.max(1, Number(params.pageSize || params.limit || 500))
  return { code: 200, data: { patients: patients.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize } }
}

export function managedPatientRelations(params = {}, options = {}) {
  return isNutritionist() ? managedPatientList(params, options) : getDoctorPatientRelations(params, options)
}

export async function getManagedClient(patientId, options = {}) {
  const response = await get(`/care-management/patients/${key(patientId)}`, {}, optionsFor(options))
  if (response.data?.patient?.id !== patientId) throw new Error('未找到已分配客户')
  const data = response.data
  return { patient: assignedClient(data), lifestyle: data.lifestyle || {}, bodyReports: data.bodyReports || [], exerciseReports: (data.exerciseReports || []).map(normalizeExerciseReport) }
}

export function normalizeExerciseReport(report = {}) {
  return { id: report.id, version: report.version, createdAt: report.createdAt, updatedAt: report.updatedAt, assessment: report.assessment || '', precautions: report.precautions || '', publishedAt: report.publishedAt, items: Array.isArray(report.items) ? report.items : [], shares: Array.isArray(report.shares) ? report.shares : [] }
}

export function reportFingerprint(report) {
  return JSON.stringify([report.id, report.version, report.assessment || '', report.precautions || '', report.items || []])
}

export function shareState(share, now = Date.now()) {
  if (share?.revokedAt) return '已撤销'
  const expiry = new Date(share?.expiresAt).getTime()
  return Number.isFinite(expiry) && expiry > now ? '有效' : '已到期'
}

let shareRequestCounter = 0
export function createShareRequestKey() {
  shareRequestCounter = (shareRequestCounter + 1) % 0x1000000
  // This is a uniqueness key, never a credential or public access token.
  const random = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10).padEnd(8, '0')).join('')
  return `exercise_${Date.now().toString(36)}_${shareRequestCounter.toString(36)}_${random}`
}

export function careSessionIdentity() {
  const user = getStorage('userInfo') || {}
  const id = user.userId || user.id
  return id && isNutritionist(user) && getStorage('token') ? `${id}:NUTRITIONIST` : ''
}

function shareAttemptStorageKey(patientId, reportId) {
  const session = careSessionIdentity()
  if (!session || !patientId || !reportId) throw new Error('请重新登录并进入已分配客户')
  return `managed-share-request:${session}:${key(patientId)}:${key(reportId)}`
}

export function loadShareAttempt(patientId, reportId) {
  const value = getStorage(shareAttemptStorageKey(patientId, reportId))
  if (!value) return null
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(String(value.idempotencyKey || '')) || !SHARE_DAYS.includes(value.expiresInDays) || !['pending', 'sent', 'conflict'].includes(value.status)) throw new Error('原发送状态无法读取，请刷新并核实分享记录')
  return { idempotencyKey: value.idempotencyKey, expiresInDays: value.expiresInDays, status: value.status, delivery: value.delivery }
}

export function saveShareAttempt(patientId, reportId, attempt) {
  // Persist only opaque operation metadata. Never persist clinical content, report URLs or tokens.
  uni.setStorageSync(shareAttemptStorageKey(patientId, reportId), JSON.stringify({ idempotencyKey: attempt.idempotencyKey, expiresInDays: attempt.expiresInDays, status: attempt.status, delivery: attempt.delivery }))
}

export function clearShareAttempt(patientId, reportId) {
  uni.removeStorageSync(shareAttemptStorageKey(patientId, reportId))
}
export function shareDeliveryMessage(delivery) {
  if (delivery === 'SIMULATED_IN_APP') return '模拟应用内发送已记录，未真实外发'
  if (delivery === 'IN_APP') return '已创建应用内通知；未发送微信或短信'
  return '分享记录已创建，投递状态未确认；未确认真实外发'
}
export async function shareExerciseReport(report, reviewedFingerprint, expiresInDays, idempotencyKey, options = {}) {
  if (!isNutritionist()) throw new Error('仅营养师可发送运动报告')
  if (!report?.id || reviewedFingerprint !== reportFingerprint(report)) throw new Error('请重新核对本版运动报告')
  if (!SHARE_DAYS.includes(Number(expiresInDays))) throw new Error('请选择 1、7、14 或 30 天有效期')
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(String(idempotencyKey || ''))) throw new Error('发送请求标识无效，请明确重新发送')
  const response = await post(`/care-management/exercise-reports/${key(report.id)}/share`, { expiresInDays: Number(expiresInDays), reviewed: true, idempotencyKey }, optionsFor(options))
  if (!response.data?.id || !response.data.expiresAt) throw new Error('发送响应缺少分享记录，请刷新核实，勿重复发送')
  return response.data
}

export async function revokeExerciseShare(reportId, shareId, options = {}) {
  const response = await del(`/care-management/exercise-reports/${key(reportId)}/share/${key(shareId)}`, {}, optionsFor(options))
  if (response.data?.revoked !== true) throw new Error('撤销尚未确认，请刷新核实')
  return response.data
}

export function restrictedShareText(share) {
  if (shareState(share) !== '有效') throw new Error('分享已到期或撤销')
  const address = /^https:\/\//i.test(String(share.url || '')) ? share.url : share.path
  if (!address || !/^https:\/\/|^\/pages\/shared-report\/shared-report\?/.test(address)) throw new Error('可复制分享地址尚未配置，请客户从应用内通知查看')
  return `MedTalent健康数字助手 · 运动报告\n仅所属客户登录后可查看，有效至 ${new Date(share.expiresAt).toLocaleString('zh-CN')}\n${address}`
}

export async function getNutritionRecords(patientId, page = 1, options = {}) {
  const response = await get(`/nutrition/patients/${key(patientId)}/records`, { page, pageSize: 30 }, optionsFor(options))
  const rows = Array.isArray(response.data) ? response.data : response.data?.items || response.data?.records
  if (!Array.isArray(rows)) throw new Error('营养记录服务尚未返回可用数据')
  return { items: rows, total: Number(response.data?.total ?? rows.length), page }
}

export async function getRecordReviews(patientId, recordId, options = {}) {
  const response = await get(`/nutrition/patients/${key(patientId)}/records/${key(recordId)}/reviews`, {}, optionsFor(options))
  const rows = Array.isArray(response.data) ? response.data : response.data?.items || response.data?.reviews
  if (!Array.isArray(rows)) throw new Error('点评历史服务响应无效')
  return rows
}

export async function addRecordReview(patientId, recordId, comment, options = {}) {
  const text = String(comment || '').trim()
  if (!text || text.length > 2000) throw new Error('请填写 1 至 2000 字点评')
  const response = await post(`/clinical/patients/${key(patientId)}/records/${key(recordId)}/review`, { comment: text }, optionsFor(options))
  if (!response.data?.id) throw new Error('点评保存未确认，请刷新历史核实，内容已保留')
  return response
}
