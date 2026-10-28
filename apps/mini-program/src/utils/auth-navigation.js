import { staffHome } from './staff-role-model.js'
export function miniRole(user = {}) {
  return String(user.backendRole || user.role || '').toUpperCase()
}

export function isSupportedMiniRole(user) {
  return ['PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PRACTITIONER', 'HEALTH_MANAGER', 'EXERCISE_COACH'].includes(miniRole(user))
}

export function safePendingPatientRoute(value) {
  if (typeof value !== 'string') return ''
  return /^\/pages\/shared-report\/shared-report\?(token|shareId)=[A-Za-z0-9._~%+-]{1,2048}$/.test(value) ? value : ''
}

export function navigateAfterLogin(user, runtime = { showToast: uni.showToast, reLaunch: uni.reLaunch, getStorageSync: uni.getStorageSync, removeStorageSync: uni.removeStorageSync, switchTab: uni.switchTab, navigateTo: uni.navigateTo }) {
  if (!isSupportedMiniRole(user)) {
    runtime.showToast({ title: '此账号请使用管理端登录', icon: 'none' })
    return false
  }
  if (user.mustChangePassword === true) {
    runtime.reLaunch({ url: '/pages/change-password/change-password' })
    return true
  }
  const pending = safePendingPatientRoute(runtime.getStorageSync('pendingPatientRoute'))
  if (miniRole(user) === 'PATIENT') {
    runtime.switchTab({
      url: '/pages/patient/index',
      success: () => {
        if (pending) {
          runtime.navigateTo({ url: pending, success: () => runtime.removeStorageSync('pendingPatientRoute') })
        } else {
          runtime.removeStorageSync('pendingPatientRoute')
        }
      }
    })
  } else {
    runtime.removeStorageSync('pendingPatientRoute')
    runtime.reLaunch({ url: staffHome(miniRole(user)) })
  }
  return true
}

let initialPasswordRedirectPending = false
export function guardInitialPasswordChange(user = {}, runtime = { reLaunch: uni.reLaunch }, pages = getCurrentPages()) {
  if (!user.isLogin || user.mustChangePassword !== true || !isSupportedMiniRole(user)) return false
  const route = pages[pages.length - 1]?.route || ''
  if (!route || route === 'pages/change-password/change-password' || route === 'pages/login/login' || route === 'pages/splash/splash' || route.startsWith('pages/agreement/')) return false
  if (!initialPasswordRedirectPending) {
    initialPasswordRedirectPending = true
    runtime.reLaunch({ url: '/pages/change-password/change-password', complete: () => { initialPasswordRedirectPending = false } })
  }
  return true
}
