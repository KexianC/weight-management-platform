import { get, post, getApiBaseUrl } from './api.js'
import { getStorage } from './common.js'
const quiet = { loading: false, showError: false }
export function routineIdentity() {
 const actor = getStorage('userInfo') || {}
 return String(actor.backendRole || actor.role || '').toUpperCase() === 'PATIENT' && (getStorage('token') || getStorage('refreshToken')) ? String(actor.userId || actor.id || '') : ''
}
async function request(action, body, method = 'GET') {
 const identity = routineIdentity(); if (!identity) throw new Error('请使用本人客户账号登录')
 const result = await (method === 'GET' ? get('/daily-check-in/' + action, body, quiet) : post('/daily-check-in/' + action, body, quiet))
 if (identity !== routineIdentity()) throw new Error('账号已切换，请重新打开记录')
 if (result.code !== 200) throw new Error(result.message || '今日记录暂不可用')
 return result.data
}
export const getRoutineToday = () => request('today', {})
export const getRoutineHistory = (page = 1) => request('records', { page })
export const saveRoutine = payload => request('submit', payload, 'POST')
export async function uploadRoutinePhoto(filePath, date, meal) {
 const identity = routineIdentity(); if (!identity) throw new Error('请先登录')
 await get('/auth/me', {}, quiet)
 if (identity !== routineIdentity()) throw new Error('账号已切换，请重新打开记录')
 return new Promise((resolve, reject) => uni.uploadFile({
  url: getApiBaseUrl() + '/daily-check-in/photos', filePath, name: 'file', formData: { date, meal },
  header: { Authorization: 'Bearer ' + getStorage('token') }, timeout: 60000,
  success: response => {
   if (identity !== routineIdentity()) { reject(new Error('账号已切换，请重新打开记录')); return }
   let data; try { data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data } catch { reject(new Error('照片上传结果异常')); return }
   if (response.statusCode < 200 || response.statusCode >= 300 || !data?.id) { const error = new Error(data?.message || '照片上传失败，请重试'); error.statusCode = response.statusCode; reject(error); return }
   resolve(data)
  }, fail: () => reject(new Error('照片上传失败，请检查网络后重试'))
 }))
}
