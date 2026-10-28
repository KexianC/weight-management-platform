import { guardInitialPasswordChange } from './auth-navigation.js'

// Native tabs belong only to the five patient pages in pages.json.
// Restoring visibility never navigates, changes a selected tab, or resets page data.
export const PATIENT_TAB_ROUTES = Object.freeze([
  'pages/patient/index',
  'pages/patient/record',
  'pages/patient/follow',
  'pages/patient/report',
  'pages/patient/profile'
])

export function restorePatientTabBar(userInfo = {}, runtime = { showTabBar: uni.showTabBar }, pages = getCurrentPages()) {
  const role = String(userInfo.backendRole || userInfo.role || '').toUpperCase()
  const currentPage = pages[pages.length - 1]
  const route = String(currentPage?.route || '').replace(/^\//, '').split('?')[0]
  if (role !== 'PATIENT' || !userInfo.isLogin || !PATIENT_TAB_ROUTES.includes(route)) return false
  if (typeof runtime.showTabBar !== 'function') return false
  try {
    runtime.showTabBar({ animation: false, fail: () => {} })
    return true
  } catch (error) {
    // App onShow can precede native page readiness; page onShow/onReady retry.
    return false
  }
}

export function createPatientTabBarLifecycle(getUserInfo) {
  return {
    onShow() {
      const user = getUserInfo()
      if (!guardInitialPasswordChange(user)) restorePatientTabBar(user)
    },
    onReady() { restorePatientTabBar(getUserInfo()) }
  }
}
