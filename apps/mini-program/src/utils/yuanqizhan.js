import { get, post, upload } from './api.js'
import { getStorage } from './common.js'

const quiet = { loading: false, showError: false }
const idPart = value => encodeURIComponent(String(value || ''))
export function patientActivitySession() {
  const user = getStorage('userInfo') || {}
  if (String(user.backendRole || user.role || '').toUpperCase() !== 'PATIENT' || !(getStorage('token') || getStorage('refreshToken'))) return ''
  return String(user.userId || user.id || '')
}
export async function getMyActivities() { const result = await get('/yuanqizhan/my/activities', {}, quiet); return result.data?.items || [] }
export async function getActivityToday(id) { return (await get(`/yuanqizhan/${idPart(id)}/today`, {}, quiet)).data }
export async function getActivityRecords(id, page = 1) { return (await get(`/yuanqizhan/${idPart(id)}/records`, { page, pageSize: 15 }, quiet)).data }
export async function getActivityRecord(id, date) { return (await get(`/yuanqizhan/${idPart(id)}/records/${idPart(date)}`, {}, quiet)).data }
export async function saveActivityRecord(id, payload) { return (await post(`/yuanqizhan/${idPart(id)}/records`, payload, quiet)).data }
export async function uploadActivityPhoto(id, slot, filePath) { return (await upload(filePath, { url: `/yuanqizhan/${idPart(id)}/photos/${idPart(slot)}`, ...quiet })).data }