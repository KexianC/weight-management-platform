import { get } from './api.js'
import { getStorage } from './common.js'
import { roleOf, idOf } from './staff-role-model.js'

export function dailyShareIdentity() {
  const actor = getStorage('userInfo') || {}
  return `${idOf(actor)}:${roleOf(actor)}`
}

export function canShareDailyCheckIn() {
  const actor = getStorage('userInfo') || {}
  return Boolean(getStorage('token') && idOf(actor) && !actor.mustChangePassword && ['HEALTH_MANAGER', 'DOCTOR', 'NUTRITIONIST'].includes(roleOf(actor)))
}

async function readDaily(patientId, suffix, data = {}) {
  if (!/^[A-Za-z0-9_-]{1,191}$/.test(String(patientId || ''))) throw new Error('客户标识无效，请重新进入客户档案')
  if (!canShareDailyCheckIn()) throw new Error('请使用负责此客户的健管师、医生或营养师账号')
  const identity = dailyShareIdentity()
  const response = await get(`/care-management/patients/${encodeURIComponent(patientId)}/daily-check-in/${suffix}`, data, { loading: false, showError: false })
  if (!canShareDailyCheckIn() || identity !== dailyShareIdentity()) throw new Error('账号已切换，请重新进入客户档案')
  return response.data
}

export async function getDailyCheckInLink(patientId) {
  const result = await readDaily(patientId, 'link')
  if (result?.revoked === true) return { revoked: true, url: '', qrDataUrl: '' }
  if (!result || typeof result.url !== 'string' || !/^https?:\/\/[^\s]+\/#\/daily-check-in\/[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(result.url)) throw new Error('专属链接暂不可用，请联系管理员核对填报地址')
  return { revoked: false, url: result.url, qrDataUrl: result.qrDataUrl }
}

export async function getDailyCheckInRecords(patientId) {
  const result = await readDaily(patientId, 'records', { page: 1 })
  if (!Array.isArray(result?.items)) throw new Error('填报记录暂不可用，请稍后重试')
  return {
    canViewLink: result.canViewLink === undefined ? result.canManageLink === true : result.canViewLink === true,
    items: result.items.slice(0, 5).map(record => ({ date: String(record.date || '').slice(0, 10), weightKg: record.weightKg, version: record.version }))
  }
}

export async function dailyCheckInQrAsset(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 700000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) throw new Error('二维码图片暂不可用，可先复制专属链接')
  // #ifdef H5
  return { path: dataUrl, ownedTemp: false }
  // #endif
  // #ifdef MP-WEIXIN
  const path = `${wx.env.USER_DATA_PATH}/daily-checkin-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({
    filePath: path, data: dataUrl.split(',')[1], encoding: 'base64', success: resolve,
    fail: () => reject(new Error('二维码显示失败，可先复制专属链接'))
  }))
  return { path, ownedTemp: true }
  // #endif
}

export function releaseDailyCheckInQr(asset) {
  // #ifdef MP-WEIXIN
  if (asset?.ownedTemp && asset.path?.startsWith(`${wx.env.USER_DATA_PATH}/daily-checkin-`)) wx.getFileSystemManager().unlink({ filePath: asset.path, fail() {} })
  // #endif
}
