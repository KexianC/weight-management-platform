import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(import.meta.dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const modelUrl=moduleUrl(read('src/utils/staff-role-model.js'))
const authUrl = moduleUrl(read('src/utils/auth-navigation.js').replace("'./staff-role-model.js'", JSON.stringify(modelUrl)))
const auth = await import(authUrl)
const tabs = await import(moduleUrl(read('src/utils/tab-bar.js').replace("'./auth-navigation.js'", JSON.stringify(authUrl))))
const config = JSON.parse(read('src/pages.json'))
assert.deepEqual(tabs.PATIENT_TAB_ROUTES, config.tabBar.list.map(item => item.pagePath))
assert.equal(config.tabBar.list.length, 5)
assert.equal(config.pages[0].path, 'pages/splash/splash')

const calls = []
const storage = new Map()
let pageStack = []
const runtime = {
  showTabBar: options => calls.push(['show', options.animation]),
  switchTab: options => { calls.push(['tab', options.url]); options.success?.() },
  navigateTo: options => { calls.push(['navigate', options.url]); options.success?.() },
  reLaunch: options => { calls.push(['launch', options.url]); options.complete?.() },
  showToast: options => calls.push(['toast', options.title]),
  getStorageSync: key => storage.get(key),
  removeStorageSync: key => storage.delete(key)
}
globalThis.uni = runtime
globalThis.getCurrentPages = () => pageStack
const patient = { role: 'patient', backendRole: 'PATIENT', isLogin: true }
const draft = { text: '本地虚构晚餐', photo: '/tmp/fictional.jpg', selectedDate: '2026-10-12' }
const lifecycle = tabs.createPatientTabBarLifecycle(() => patient)
for (let round = 0; round < 8; round++) {
  for (const route of tabs.PATIENT_TAB_ROUTES) {
    pageStack = [{ route, data: draft }]
    const before = calls.length
    tabs.restorePatientTabBar(patient)
    lifecycle.onShow()
    lifecycle.onReady()
    // App hide/show and native camera return both use the same non-navigating restoration.
    lifecycle.onShow()
    assert.equal(calls.length - before, 4)
    assert.equal(pageStack[0].route, route)
    assert.equal(pageStack[0].data, draft)
  }
}
assert.equal(calls.filter(call => call[0] === 'show').length, 160)
assert.ok(calls.every(call => call[0] === 'show'))
assert.equal(tabs.restorePatientTabBar(patient, runtime, []), false)
for (const route of ['pages/doctor/index', 'pages/login/login', 'pages/common/messages']) {
  assert.equal(tabs.restorePatientTabBar(patient, runtime, [{ route }]), false)
}
assert.equal(tabs.restorePatientTabBar({ role: 'doctor', isLogin: true }, runtime, [{ route: tabs.PATIENT_TAB_ROUTES[4] }]), false)
assert.equal(tabs.restorePatientTabBar({ role: 'patient', isLogin: false }, runtime, [{ route: tabs.PATIENT_TAB_ROUTES[4] }]), false)
assert.equal(tabs.restorePatientTabBar(patient, { showTabBar() { throw Error('not ready') } }, [{ route: tabs.PATIENT_TAB_ROUTES[4] }]), false)
assert.doesNotMatch(read('src/App.vue'), /hideTabBar|setTabBarItem|switchTab|reLaunch/)
assert.match(read('src/main.js'), /app\.mixin\(createPatientTabBarLifecycle/)

calls.length = 0
storage.set('pendingPatientRoute', '/pages/shared-report/shared-report?token=fictional_token')
assert.equal(auth.navigateAfterLogin({ ...patient, mustChangePassword: true }, runtime), true)
assert.deepEqual(calls, [['launch', '/pages/change-password/change-password']])
assert.ok(storage.has('pendingPatientRoute'))
calls.length = 0
auth.navigateAfterLogin(patient, runtime)
assert.deepEqual(calls, [['tab', '/pages/patient/index'], ['navigate', '/pages/shared-report/shared-report?token=fictional_token']])
assert.equal(storage.has('pendingPatientRoute'), false)
for (const invalid of ['https://other.invalid', '/pages/doctor/index', '/pages/shared-report/shared-report?token=abc&next=/pages/doctor/index', '/pages/shared-report/shared-report#token=abc', null]) {
  assert.equal(auth.safePendingPatientRoute(invalid), '')
}
assert.equal(auth.safePendingPatientRoute('/pages/shared-report/shared-report?shareId=fictional-123'), '/pages/shared-report/shared-report?shareId=fictional-123')
for (const role of ['ADMIN', '']) {
  calls.length = 0
  assert.equal(auth.navigateAfterLogin({ role: 'patient', backendRole: role || 'UNKNOWN' }, runtime), false)
  assert.ok(calls.every(call => call[0] === 'toast'))
}
for (const [role, route] of [['HEALTH_MANAGER','/pages/health-manager/index'],['EXERCISE_COACH','/pages/exercise-coach/index']]) {
  calls.length = 0
  auth.navigateAfterLogin({ backendRole:role },runtime)
  assert.deepEqual(calls,[['launch',route]])
  calls.length = 0
  auth.navigateAfterLogin({backendRole:role,mustChangePassword:true},runtime)
  assert.deepEqual(calls,[['launch','/pages/change-password/change-password']])
}
for (const role of ['NUTRITIONIST','DOCTOR']) {
  calls.length = 0
  auth.navigateAfterLogin({ role: 'doctor', backendRole: role }, runtime)
  assert.deepEqual(calls, [['launch', '/pages/doctor/index']])
}

let networkSubscriptions = 0
const sessionStorage = new Map([
  ['userInfo', { ...patient, userId: 'fictional-patient' }],
  ['token', `x.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.x`],
  ['refreshToken', 'fictional-refresh-token']
])
const storeSource = read('src/store/index.js')
  .replace(/import .*?from .*?\r?\n/, '')
  .replace('export default store', 'globalThis.testStore = store')
  .replace('export { Store }', '')
const context = vm.createContext({
  getStorage: key => sessionStorage.get(key),
  setStorage: (key,value) => sessionStorage.set(key,value),
  removeStorage: key => sessionStorage.delete(key),
  uni: { onNetworkStatusChange() { networkSubscriptions++ }, removeStorageSync: key => sessionStorage.delete(key) },
  console: { log() {}, error() {} }, Date, Uint8Array
})
vm.runInContext(storeSource, context)
const store = context.testStore
store.init()
assert.equal(networkSubscriptions, 1, 'network listeners must not accumulate across launches')
assert.equal(store.isLogin(), true, 'expired access token with refresh token retains the recoverable session')
assert.equal(await store.checkAutoLogin(), true)
assert.equal(sessionStorage.get('refreshToken'), 'fictional-refresh-token')
sessionStorage.delete('token')
assert.equal(store.isLogin(), true, 'refresh-only session can still recover')
assert.equal(await store.checkAutoLogin(), true)
sessionStorage.delete('refreshToken')
assert.equal(store.isLogin(), false)
assert.ok(sessionStorage.has('userInfo'), 'read checks must not destroy saved state')
const futureToken = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.x`
assert.equal(store.validateToken(futureToken), true, 'native base64 fallback handles padding correctly')
sessionStorage.set('token', futureToken)
assert.equal(store.isLogin(), true)
store.logout()
assert.equal(sessionStorage.has('token'), false)
assert.equal(sessionStorage.has('userInfo'), false)

const login = read('src/pages/login/login.vue')
const register = read('src/pages/register/register.vue')
assert.match(login, /患者账号由健管师提供/)
assert.match(register, /canRegister\(\)\s*\{\s*if \(this.selectedRole !== 'doctor'\) return false/)
assert.doesNotMatch(register, /@click="selectRole\('patient'\)"/)
assert.match(register, /async handleRegister\(\)\s*\{\s*if \(this.selectedRole !== 'doctor'\)/)
assert.match(read('src/pages/change-password/change-password.vue'), /mustChangePassword !== true/)
for (const file of ['src/pages/agreement/privacy-policy.vue','src/pages/agreement/user-agreement.vue']) {
  assert.match(read(file), /木吾木同\(杭州\)医疗管理有限公司/)
    assert.match(read(file), /13456725720/)
    assert.match(read(file), /2026-10-13/)
    assert.match(read(file), /仅(?:服务|面向)成年人/)
    assert.doesNotMatch(read(file), /待审草案|待审/)
  assert.match(read(file), /MedTalent健康数字助手/)
}
console.log('PASS: five native tabs x 8 rounds / background-camera lifecycle, route & draft retention, session refresh preservation, role routing, pending report, initial-password gate, patient provisioning, confirmed legal scope')
console.log('Scope: synthetic runtime checks only; real WeChat device foreground/camera/safe-area verification remains required.')

// Exercise the actual first-password component with synthetic API acknowledgements.
const passwordSource = read('src/pages/change-password/change-password.vue')
  .match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*$/gm, '')
  .replace('export default', 'globalThis.passwordDefinition =')
let flagged = true
let changeRequests = 0
let logoutCount = 0
let acknowledgment = { code: 200, data: { changed: false } }
const passwordContext = vm.createContext({
  uni: runtime, Date,
  store: { isLogin: () => true, getUserInfo: () => ({ ...patient, mustChangePassword: flagged }), updateUserInfo() {}, logout() { logoutCount++ } },
  getUserInfo: async () => ({ code: 200, data: { ...patient, mustChangePassword: flagged } }),
  navigateAfterLogin() {},
  changePassword: async () => { changeRequests++; return acknowledgment }
})
vm.runInContext(passwordSource, passwordContext)
const definition = passwordContext.passwordDefinition
const page = { ...definition.data() }
for (const [name, fn] of Object.entries(definition.methods)) page[name] = fn.bind(page)
flagged = false
await definition.onLoad.call(page)
await page.submit()
assert.equal(changeRequests, 0, 'existing accounts must not issue first-password changes')
flagged = true
await definition.onLoad.call(page)
page.currentPassword = 'fictional-initial-34'
page.newPassword = 'fictional-new-56'
page.confirmation = page.newPassword
await page.submit()
assert.equal(changeRequests, 1)
assert.equal(logoutCount, 0, 'no successful acknowledgement means no success/logout')
acknowledgment = { code: 200, data: { changed: true, sessionsRevoked: true } }
storage.set('pendingPatientRoute', '/pages/shared-report/shared-report?shareId=fictional-pending')
await page.submit()
assert.equal(logoutCount, 1)
assert.equal(page.currentPassword, '')
assert.equal(page.newPassword, '')
assert.ok(storage.has('pendingPatientRoute'), 'shared-report continuation survives required re-login')
assert.equal(calls.at(-1)[0], 'launch')
assert.equal(calls.at(-1)[1], '/pages/login/login')
console.log('PASS: first-password component blocks existing users, requires backend changed:true, clears password fields and reauthenticates while retaining shared-report continuation')
