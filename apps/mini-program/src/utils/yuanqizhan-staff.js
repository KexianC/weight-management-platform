import { get } from './api.js'
import { careSessionIdentity } from './managed-care.js'

const quiet = { loading: false, showError: false }
const part = value => encodeURIComponent(String(value || ''))
function requireClient(patientId) {
  if (!careSessionIdentity() || !patientId) throw new Error('请使用营养师账号从已分配客户进入')
}
function checkRecord(record, activityId, patientId) {
  if (!record || record.activityId !== activityId || record.patientId !== patientId) throw new Error('活动记录响应与当前客户不一致，请重新加载')
  return record
}
export async function getClientActivities(patientId, page = 1) {
  requireClient(patientId)
  const result = (await get(`/yuanqizhan/patients/${part(patientId)}/activities`, { page, pageSize: 15 }, quiet)).data
  if (!Array.isArray(result?.items) || result.items.some(item => !item.id || item.member?.patientId !== patientId)) throw new Error('客户活动接口响应无效')
  return result
}
export async function getClientActivityRecords(activityId, patientId, page = 1) {
  requireClient(patientId)
  const result = (await get(`/yuanqizhan/${part(activityId)}/patients/${part(patientId)}/records`, { page, pageSize: 15 }, quiet)).data
  if (!Array.isArray(result?.items)) throw new Error('活动记录列表响应无效')
  result.items.forEach(record => checkRecord(record, activityId, patientId))
  return result
}
export async function getClientActivityRecord(activityId, patientId, date) {
  requireClient(patientId)
  const record = (await get(`/yuanqizhan/${part(activityId)}/patients/${part(patientId)}/records/${part(date)}`, {}, quiet)).data
  if (record?.date !== date) throw new Error('活动记录日期不一致，请重新加载')
  return checkRecord(record, activityId, patientId)
}
