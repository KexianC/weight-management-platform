import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const here = dirname(fileURLToPath(import.meta.url))
let actor = { userId: 'fictional-nutritionist-1', backendRole: 'NUTRITIONIST' }
const requests = [], attemptStorage = new Map()
let answer
const call = async (method, url, data, options) => { requests.push({ method, url, data, options }); const result = await (typeof answer === 'function' ? answer(method, url, data) : answer); if (result instanceof Error) throw result; return { code: 200, data: result } }
globalThis.__managedTest = { get: (...args) => call('GET', ...args), post: (...args) => call('POST', ...args), del: (...args) => call('DELETE', ...args), getStorage: (key) => key === 'token' ? 'fictional-test-token-not-a-credential' : key === 'userInfo' ? actor : attemptStorage.has(key) ? JSON.parse(attemptStorage.get(key)) : null, getPatientList: async () => ({ doctorFallback: true }), getDoctorPatientRelations: async () => ({ doctorFallback: true }) }
const source = readFileSync(resolve(here, '../../utils/managed-care.js'), 'utf8').replace(/^import .*\n/gm, '')
const service = await import(`data:text/javascript;base64,${Buffer.from('const {get,post,del,getStorage,getPatientList,getDoctorPatientRelations} = globalThis.__managedTest;\n' + source).toString('base64')}`)
const { assignedClient, clientLabel, getAssignedClients, managedPatientList, getManagedClient, getNutritionRecords, getRecordReviews, addRecordReview, shareExerciseReport, reportFingerprint, shareState, restrictedShareText, revokeExerciseShare } = service
const fixture = { patient: { id: 'fictional-client-01', displayName: '虚构姓名甲', phone: '13900000001', avatarUrl: 'https://invalid.test/portrait' }, enrollment: { patientId: 'fictional-client-01', clientCode: 'KH0001FAKE', createdAt: '2026-10-01T00:00:00Z' } }
const client = assignedClient(fixture)
assert.equal(client.name, 'KH0001FAKE')
for (const prohibited of ['虚构姓名甲', '13900000001', 'portrait']) assert.ok(!JSON.stringify(client).includes(prohibited))
assert.equal(assignedClient({}), null)
assert.equal(clientLabel({ id: 'fictional-test', displayName: '姓名不能透传' }), '客户NAL-TEST')
answer = [fixture, { patient: { id: 'client-02' }, enrollment: { clientCode: 'KH0002FAKE' } }]
assert.equal((await getAssignedClients()).length, 2)
assert.equal((await managedPatientList({ keyword: '0001', page: 1, limit: 1 })).data.total, 1)
assert.equal(requests.at(-1).url, '/care-management/patients')
assert.equal((await managedPatientList({ keyword: '13900000001' })).data.total, 0)
answer = new Error('403 已解除分配')
await assert.rejects(getAssignedClients(), /解除分配/)
actor = { role: 'doctor' }
assert.equal((await managedPatientList()).doctorFallback, true)
actor = { userId: 'fictional-nutritionist-1', backendRole: 'NUTRITIONIST' }
answer = { ...fixture, posturePhotos: [{ mediaAssetId: 'private-photo' }], exerciseReports: [] }
const detail = await getManagedClient('fictional-client-01')
assert.equal(detail.posturePhotos, undefined)
assert.equal(detail.patient.avatar, '')
await assert.rejects(getManagedClient('somebody-else'), /已分配客户/)
answer = { items: [{ id: 'diet-1', recordType: 'DIET', imageAssetIds: ['meal-1'], mealItems: [{ name: '虚构餐食' }] }], total: 61 }
assert.equal((await getNutritionRecords('fictional-client-01', 2)).items[0].imageAssetIds[0], 'meal-1')
assert.deepEqual(requests.at(-1).data, { page: 2, pageSize: 30 })
answer = { items: [{ id: 'review-1', comment: '第一条', replies: [{ id: 'reply-1', comment: '回复' }] }, { id: 'review-2', comment: '第二条', replies: [] }] }
assert.equal((await getRecordReviews('fictional-client-01', 'diet-1')).length, 2)
answer = {}
await assert.rejects(getRecordReviews('fictional-client-01', 'diet-1'), /响应无效/)
await assert.rejects(addRecordReview('fictional-client-01', 'diet-1', '   '), /请填写/)
answer = { id: 'review-3' }
await addRecordReview('fictional-client-01', 'diet-1', ' 新增点评 ')
assert.deepEqual(requests.at(-1).data, { comment: '新增点评' })
const report = { id: 'report-v1', version: 1, updatedAt: '2026-10-12T00:00:00Z', assessment: '虚构评估', items: [{ actionName: '测试动作', reps: 8 }] }
const reviewed = reportFingerprint(report)
const requestKey = service.createShareRequestKey()
assert.match(requestKey, /^[A-Za-z0-9_-]{16,80}$/)
assert.notEqual(service.createShareRequestKey(), requestKey)
const before = requests.length
await assert.rejects(shareExerciseReport(report, '', 7, requestKey), /重新核对/)
await assert.rejects(shareExerciseReport({ ...report, version: 2 }, reviewed, 7, requestKey), /重新核对/)
await assert.rejects(shareExerciseReport(report, reviewed, 2, requestKey), /请选择/)
await assert.rejects(shareExerciseReport(report, reviewed, 7, 'bad-key'), /请求标识无效/)
assert.equal(requests.length, before)
answer = { id: 'share-1', expiresAt: '2099-01-01T00:00:00Z', delivery: 'IN_APP', path: '/pages/shared-report/shared-report?shareId=share-1' }
for (const days of [1, 7, 14, 30]) { await shareExerciseReport(report, reviewed, days, requestKey); assert.deepEqual(requests.at(-1).data, { expiresInDays: days, reviewed: true, idempotencyKey: requestKey }) }
assert.equal(shareState(answer), '有效')
assert.match(restrictedShareText(answer), /仅所属客户登录后可查看/)
assert.throws(() => restrictedShareText({ ...answer, revokedAt: '2026-10-12' }), /到期或撤销/)
assert.equal(shareState({ expiresAt: '2020-01-01' }), '已到期')
assert.equal(shareState({ expiresAt: 'invalid' }), '已到期')
actor = { backendRole: 'DOCTOR' }
await assert.rejects(shareExerciseReport(report, reviewed, 7, requestKey), /仅营养师/)
actor = { userId: 'fictional-nutritionist-1', backendRole: 'NUTRITIONIST' }
answer = new Error('模拟发送失败')
await assert.rejects(shareExerciseReport(report, reviewed, 7, requestKey), /模拟发送失败/)
answer = { revoked: true, id: 'share-1' }
await revokeExerciseShare('report-v1', 'share-1')
assert.equal(requests.at(-1).method, 'DELETE')
answer = { revoked: false }
await assert.rejects(revokeExerciseShare('report-v1', 'share-1'), /未确认/)
// Exercise the real component methods with deferred, synthetic promises. Nothing is sent.
const notices = [], releasedPaths = []
globalThis.uni = { setStorageSync: (key, value) => attemptStorage.set(key, value), removeStorageSync: (key) => attemptStorage.delete(key), showToast: ({ title }) => notices.push(title), setClipboardData: () => {}, navigateTo: () => {}, previewImage: () => {} }
let resolveFile = async () => 'blob:fictional'
globalThis.__componentTest = { ...service, resolveMediaFile: (id) => resolveFile(id), releaseMediaFile: (path) => releasedPaths.push(path) }
const componentSource = readFileSync(resolve(here, 'NutritionistClient.vue'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
const bindings = [...componentSource.matchAll(/^import\s*\{([^}]+)\}[^\n]*$/gm)].map((item) => item[1]).join(',')
const componentCode = `const YuanqizhanClientRecords = {}; const {${bindings}} = globalThis.__componentTest;\n` + componentSource.replace(/^import .*\n/gm, '')
const component = (await import(`data:text/javascript;base64,${Buffer.from(componentCode).toString('base64')}`)).default
function makeView() {
  actor = { userId: 'fictional-nutritionist-1', backendRole: 'NUTRITIONIST' }
  const view = { ...component.data(), patientId: 'fictional-client-01', pageActive: true, activeRevision: 1 }
  for (const [name, method] of Object.entries(component.methods)) view[name] = method.bind(view)
  view.ownerSession = service.careSessionIdentity(); view.ownerPatientId = view.patientId
  return view
}
const latestClient = () => ({ ...fixture, exerciseReports: [{ ...report, updatedAt: '2026-10-13T00:00:00Z', shares: [] }] })
let shareFailure = new Error('synthetic network timeout')
answer = (method, url) => method === 'GET' ? latestClient() : shareFailure || { id: 'synthetic-share', expiresAt: '2099-01-01T00:00:00Z', delivery: 'SIMULATED_IN_APP' }
const sendView = makeView()
sendView.reviewed[report.id] = reviewed
await sendView.sendReport(report)
const retryKey = sendView.shareAttempts[report.id].idempotencyKey
assert.equal(sendView.shareAttempts[report.id].status, 'pending')
assert.equal(requests.at(-1).data.idempotencyKey, retryKey)
const reopenedView = makeView()
assert.equal(reopenedView.restoreAttempt(report).idempotencyKey, retryKey, 'leaving/reopening retains the unresolved request key')
assert.ok(![...attemptStorage.values()].join('').includes(report.assessment), 'persistent retry metadata contains no assessment or report content')
actor = { userId: 'fictional-nutritionist-2', backendRole: 'NUTRITIONIST' }
assert.equal(service.loadShareAttempt('fictional-client-01', report.id), null, 'saved keys cannot cross accounts')
actor = { userId: 'fictional-nutritionist-1', backendRole: 'NUTRITIONIST' }
shareFailure = null
await sendView.sendReport(report)
assert.equal(requests.at(-1).data.idempotencyKey, retryKey)
assert.equal(sendView.shareAttempts[report.id].status, 'sent')
assert.match(sendView.shareAttempts[report.id].message, /模拟.*未真实外发/)
const sentCount = requests.length
await sendView.sendReport(report)
assert.equal(requests.length, sentCount, 'confirmed send cannot silently create another request')
sendView.startNewSend(report)
assert.equal(sendView.reviewed[report.id], undefined, 'new send requires manual review again')
sendView.reviewed[report.id] = reviewed
await sendView.sendReport(report)
assert.notEqual(requests.at(-1).data.idempotencyKey, retryKey)
sendView.startNewSend(report); sendView.reviewed[report.id] = reviewed
shareFailure = Object.assign(new Error('synthetic expired key'), { statusCode: 409 })
await sendView.sendReport(report)
const conflictedKey = sendView.shareAttempts[report.id].idempotencyKey
assert.equal(sendView.shareAttempts[report.id].status, 'conflict')
assert.match(sendView.shareAttempts[report.id].message, /明确重新发送/)
const conflictCount = requests.length
await sendView.sendReport(report)
assert.equal(requests.length, conflictCount, '409 does not automatically generate a fresh key')
sendView.startNewSend(report); sendView.reviewed[report.id] = reviewed; shareFailure = null
await sendView.sendReport(report)
assert.notEqual(requests.at(-1).data.idempotencyKey, conflictedKey)
assert.equal(reportFingerprint({ ...report, updatedAt: '2099-01-01' }), reviewed, 'server publication timestamp is not a clinical revision')
assert.notEqual(reportFingerprint({ ...report, assessment: 'revised assessment' }), reviewed)
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
for (const operation of ['records', 'reviews', 'video', 'mealPhoto']) {
  for (const change of ['hide', 'account']) {
    const view = makeView(), response = deferred()
    view.reviewDrafts = { 'diet-1': 'fictional draft' }
    if (operation === 'records' || operation === 'reviews') answer = response.promise
    else resolveFile = () => response.promise
    const pending = operation === 'records' ? view.loadRecords() : operation === 'reviews' ? view.loadReviews({ id: 'diet-1' }) : operation === 'video' ? view.playVideo('movie-1') : view.loadMealPhoto('photo-1')
    if (change === 'hide') { view.pageActive = false; view.suspend() }
    else actor = { userId: 'fictional-nutritionist-2', backendRole: 'NUTRITIONIST' }
    const path = `blob:fictional-${operation}-${change}`
    response.resolve(operation === 'records' ? { items: [{ id: 'private-late-record' }], total: 1 } : operation === 'reviews' ? { items: [{ id: 'private-late-review' }] } : path)
    await pending
    assert.deepEqual(view.records, [], `${operation}/${change}: late record response is discarded`)
    assert.deepEqual(view.reviews, {}, `${operation}/${change}: late review response is discarded`)
    assert.equal(view.videoPath, '', `${operation}/${change}: late video response is discarded`)
    assert.deepEqual(view.mediaPaths, {}, `${operation}/${change}: late photo response is discarded`)
    if (operation === 'video' || operation === 'mealPhoto') assert.ok(releasedPaths.includes(path), 'late media file is released')
    if (change === 'account') assert.deepEqual(view.reviewDrafts, {}, 'drafts cannot cross accounts')
    else assert.equal(view.reviewDrafts['diet-1'], 'fictional draft', 'same-account hide preserves unsent draft')
  }
}
// A late failure from an old scope must not clear a newer, successfully loaded account.
const replacedView = makeView(), oldResponse = deferred(); answer = oldResponse.promise
const oldPending = replacedView.loadRecords()
replacedView.suspend(); actor = { userId: 'fictional-nutritionist-2', backendRole: 'NUTRITIONIST' }
replacedView.ownerSession = service.careSessionIdentity(); replacedView.records = [{ id: 'new-account-record' }]
oldResponse.reject(new Error('old session failed')); await oldPending
assert.equal(replacedView.records[0].id, 'new-account-record')
const parentPage = readFileSync(resolve(here, 'patient-detail.vue'), 'utf8')
assert.match(parentPage, /onHide\(\).*nutritionistClient\?\.suspend\(\)/)
assert.match(service.shareDeliveryMessage('SIMULATED_IN_APP'), /模拟.*未真实外发/)
assert.ok(!service.shareDeliveryMessage('UNKNOWN').includes('已通过'))
let compiled = 0
for (const filename of readdirSync(here).filter((file) => file.endsWith('.vue'))) {
  const text = readFileSync(resolve(here, filename), 'utf8')
  const result = parse(text, { filename })
  assert.deepEqual(result.errors, [], filename)
  if (result.descriptor.script) compileScript(result.descriptor, { id: filename })
  const template = compileTemplate({ source: result.descriptor.template.content, filename, id: filename })
  assert.deepEqual(template.errors, [], filename)
  compiled++
}
console.log(`PASS: assigned privacy, records/reply contracts, manual review/version gate, 4 expiry choices, idempotent retry/new-send/409, simulated delivery, stale async results on hide/account switch; ${compiled} Vue SFCs parsed and templates compiled. Synthetic in-process fixtures only; no network or patient messages.`)
