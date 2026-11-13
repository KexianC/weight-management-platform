import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const root = resolve(import.meta.dirname, '..')
const source = readFileSync(resolve(root, 'src/utils/daily-check-in-share.js'), 'utf8')
let actor = { userId: 'synthetic-doctor', backendRole: 'DOCTOR' }
let token = 'synthetic-session'
let response
const requests = [], writes = [], unlinks = [], copies = []
const bindings = {
  getStorage: key => key === 'userInfo' ? actor : key === 'token' ? token : null,
  roleOf: user => String(user.backendRole || user.role || '').toUpperCase(),
  idOf: user => String(user.userId || user.id || ''),
  get: async (path, data, options) => { requests.push({ path, data, options }); return { data: await (typeof response === 'function' ? response(path) : response) } }
}
globalThis.__dailyShareTest = bindings
globalThis.wx = { env: { USER_DATA_PATH: '/synthetic-private' }, getFileSystemManager: () => ({
  writeFile(options) { writes.push(options); options.success() },
  unlink(options) { unlinks.push(options.filePath) }
}) }
const moduleFrom = code => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const platformSource = platform => source.replace(/^import .*\n/gm, '').replace(/\s*\/\/ #ifdef ([A-Z0-9-]+)\n([\s\S]*?)\s*\/\/ #endif/g, (_, target, body) => target === platform ? `\n${body}\n` : '\n')
const h5 = await moduleFrom('const {get,getStorage,roleOf,idOf}=globalThis.__dailyShareTest;\n' + platformSource('H5'))
const native = await moduleFrom('const {get,getStorage,roleOf,idOf}=globalThis.__dailyShareTest;\n' + platformSource('MP-WEIXIN'))
// Match the API's base64url nonce.signature shape, including the separating dot.
const signedToken = `${'a'.repeat(43)}.${'b'.repeat(43)}`
const valid = { url: `https://synthetic.invalid/#/daily-check-in/${signedToken}`, qrDataUrl: 'data:image/png;base64,aGVsbG8=', revoked: false }

response = valid
assert.equal((await h5.getDailyCheckInLink('synthetic-patient')).url, valid.url)
assert.equal((await native.getDailyCheckInLink('synthetic-patient')).url, valid.url)
assert.equal(requests.at(-1).path, '/care-management/patients/synthetic-patient/daily-check-in/link')
for (const malformedToken of ['synthetic_token', signedToken.slice(1), signedToken + '.extra', signedToken.replace('.', '')]) {
  response = { ...valid, url: `https://synthetic.invalid/#/daily-check-in/${malformedToken}` }
  await assert.rejects(h5.getDailyCheckInLink('synthetic-patient'), /地址/)
}
response = valid
actor = { userId: 'synthetic-nutritionist', backendRole: 'NUTRITIONIST' }
assert.equal((await h5.getDailyCheckInLink('synthetic-patient')).url, valid.url)
const count = requests.length
actor = { userId: 'synthetic-coach', backendRole: 'EXERCISE_COACH' }
await assert.rejects(h5.getDailyCheckInLink('synthetic-patient'), /健管师、医生或营养师/)
assert.equal(requests.length, count)
actor = { userId: 'synthetic-doctor', backendRole: 'DOCTOR' }
await assert.rejects(h5.getDailyCheckInLink('../other'), /标识/)
response = { ...valid, revoked: true }
assert.deepEqual(await h5.getDailyCheckInLink('synthetic-patient'), { revoked: true, url: '', qrDataUrl: '' })
response = { ...valid, url: 'javascript:alert(1)' }
await assert.rejects(h5.getDailyCheckInLink('synthetic-patient'), /地址/)
response = async () => { actor = { userId: 'synthetic-other-doctor', backendRole: 'DOCTOR' }; return valid }
await assert.rejects(h5.getDailyCheckInLink('synthetic-patient'), /账号已切换/)
actor = { userId: 'synthetic-doctor', backendRole: 'DOCTOR' }
response = { items: Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${12-i}`, weightKg: 70, answers: { private: true } })), canViewLink: true, canManageLink: false }
const recent = await h5.getDailyCheckInRecords('synthetic-patient')
assert.equal(recent.items.length, 5)
assert.equal(recent.canViewLink, true)
assert.ok(recent.items.every(record => !('answers' in record)))
for (const [capabilities, expected] of [[{ canManageLink: true }, true], [{ canViewLink: false, canManageLink: true }, false], [{}, false]]) {
  response = { items: [], ...capabilities }
  assert.equal((await h5.getDailyCheckInRecords('synthetic-patient')).canViewLink, expected)
}
assert.equal((await h5.dailyCheckInQrAsset(valid.qrDataUrl)).path, valid.qrDataUrl)
await assert.rejects(h5.dailyCheckInQrAsset('data:image/svg+xml;base64,aGVsbG8='), /二维码/)
const asset = await native.dailyCheckInQrAsset(valid.qrDataUrl)
assert.equal(writes.at(-1).encoding, 'base64')
native.releaseDailyCheckInQr(asset)
assert.deepEqual(unlinks, [asset.path])
native.releaseDailyCheckInQr({ ownedTemp: true, path: '/unrelated-file' })
assert.equal(unlinks.length, 1)

const componentFile = resolve(root, 'src/components/DailyCheckInShare.vue')
const componentSource = readFileSync(componentFile, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
let linkLoader = async () => valid
let recordsLoader = async () => recent
let qrLoader = async () => ({ path: 'synthetic-qr', ownedTemp: true })
const released = []
globalThis.__dailyComponentTest = { ...h5, getDailyCheckInLink: (...args) => linkLoader(...args), getDailyCheckInRecords: (...args) => recordsLoader(...args), dailyCheckInQrAsset: (...args) => qrLoader(...args), releaseDailyCheckInQr: asset => { if (asset) released.push(asset.path) } }
globalThis.uni = { setClipboardData(options) { copies.push(options.data); options.success() }, showToast() {} }
const component = (await moduleFrom('const {canShareDailyCheckIn,dailyShareIdentity,getDailyCheckInLink,getDailyCheckInRecords,dailyCheckInQrAsset,releaseDailyCheckInQr}=globalThis.__dailyComponentTest;\n' + componentSource.replace(/^import .*\n/gm, ''))).default
function view() {
  const value = { ...component.data(), patientId: 'synthetic-patient', canShare: true, pageActive: true }
  for (const [name, method] of Object.entries(component.methods)) value[name] = method.bind(value)
  return value
}
const normal = view()
await normal.load()
assert.equal(normal.link, valid.url)
assert.equal(normal.records.length, 5)
normal.copyLink()
assert.deepEqual(copies, [valid.url])
normal.suspend()
assert.equal(normal.link, '')
assert.ok(released.includes('synthetic-qr'))

actor = { userId: 'synthetic-nutritionist', backendRole: 'NUTRITIONIST' }
const nutritionist = view(); await nutritionist.load()
assert.equal(nutritionist.link, valid.url)
nutritionist.copyLink(); assert.deepEqual(copies, [valid.url, valid.url])
let attemptedLinks = 0
linkLoader = async () => { attemptedLinks++; return valid }
recordsLoader = async () => ({ items: recent.items, canViewLink: false })
const readOnly = view(); await readOnly.load()
assert.equal(attemptedLinks, 0)
assert.equal(readOnly.link, '')
assert.equal(readOnly.records.length, 5)
assert.match(readOnly.error, /仅可查看/)
recordsLoader = async () => recent
actor = { userId: 'synthetic-doctor', backendRole: 'DOCTOR' }

let releaseLink
linkLoader = () => new Promise(resolve => { releaseLink = resolve })
const pending = view(), loading = pending.load()
await Promise.resolve(); await Promise.resolve()
pending.patientId = 'synthetic-other-patient'; pending.suspend()
releaseLink(valid); await loading
assert.equal(pending.link, '')
assert.deepEqual(pending.records, [])

linkLoader = async () => valid
let releaseQr
qrLoader = () => new Promise(resolve => { releaseQr = resolve })
const hidden = view(), pendingQr = hidden.load()
for (let i = 0; i < 5; i++) await Promise.resolve()
hidden.pageActive = false; hidden.suspend()
releaseQr({ path: 'synthetic-stale-qr', ownedTemp: true }); await pendingQr
assert.ok(released.includes('synthetic-stale-qr'))
assert.equal(hidden.qrAsset, null)

qrLoader = async () => { throw new Error('二维码失败') }
const qrFailure = view(); await qrFailure.load()
assert.equal(qrFailure.link, valid.url)
assert.equal(qrFailure.qrError, '二维码失败')
actor = { userId: 'synthetic-other-doctor', backendRole: 'DOCTOR' }
qrFailure.copyLink()
assert.equal(copies.length, 2)
assert.equal(qrFailure.link, '')

actor = { userId: 'synthetic-doctor', backendRole: 'DOCTOR' }
recordsLoader = async () => { const error = new Error('服务关系已结束'); error.statusCode = 403; throw error }
const revoked = view(); await revoked.load()
assert.equal(revoked.link, '')
assert.match(revoked.error, /权限已变化/)

for (const relative of ['src/components/DailyCheckInShare.vue', 'src/pages/health-manager/client.vue', 'src/pages/doctor/patient-detail.vue', 'src/pages/doctor/NutritionistClient.vue']) {
  const filename = resolve(root, relative)
  const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename })
  assert.deepEqual(errors, [])
  compileScript(descriptor, { id: relative })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: relative }).errors, [])
}
console.log('PASS daily check-in sharing: assigned nutritionist view capability, legacy capability fallback, denied role/read-only token suppression, session/client/hide races, revoked links, native QR lifecycle, copying and SFC compilation')
