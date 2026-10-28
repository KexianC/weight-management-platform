import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
const root = resolve(import.meta.dirname, '..')
const sourceModule = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(resolve(root, 'src/utils/yuanqizhan-form.js'), 'utf8')).toString('base64'))
const source = readFileSync(resolve(root, 'src/utils/yuanqizhan-model.js'), 'utf8').replace(/^import .*$/m, 'const SOURCE_FORMS = ' + JSON.stringify(sourceModule.SOURCE_FORMS))
const model = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const contract = JSON.parse(readFileSync(resolve(root, '../../tests/reconstruction/yuanqizhan-activity-20261014/source-contract.json'), 'utf8'))
for (const form of contract.spec.forms) {
  const derived = model.activityForm(form.id)
  assert.equal(derived.questionCount, form.question_count)
  assert.deepEqual(derived.questions.map(question => question.key), form.questions.map(question => question.key))
  for (const question of form.questions) {
    const result = derived.questions.find(item => item.key === question.key)
    assert.equal(result.labelOriginal, question.label_original)
    assert.deepEqual(result.options.map(option => option.labelOriginal), (question.options || []).map(option => option.label_original))
    assert.deepEqual(result.options.map(option => option.value), (question.options || []).map(option => option.display_score ?? option.order))
  }
}
const daily = model.activityForm('daily'), milestone = model.activityForm('milestone')
assert.equal(daily.questions.length, 9); assert.equal(milestone.questions.length, 16)
assert.equal(daily.questions.find(item => item.key === 'fasting_weight').unit, 'kg')
assert.equal(milestone.questions.find(item => item.key === 'fasting_waist').unit, 'cm')
assert.equal(milestone.questions.find(item => item.key === 'body_side').label, '晨起排便后身材侧面照：')
assert.equal(daily.questions.find(item => item.key === 'bowel_observation').subfields[2].label, '其他排便观察（可选）')
const input = { ...model.emptyAnswers(), name: '合成患者', fasting_weight: '70.1234', fatigue: 2, hunger: 3, appetite: 0, sleep_quality: 4, energy_complexion: 5, stool_type: 7, bowel_observation: { bowel_count: '', bowel_ease: '自由观察', bowel_extra: '' } }
assert.equal(model.buildActivityAnswers('daily', input, 'SUBMITTED').appetite, 0)
for (const appetite of [-2, -1, 0, 1, 2]) assert.equal(model.buildActivityAnswers('daily', { ...input, appetite }, 'SUBMITTED').appetite, appetite)
assert.equal(model.buildActivityAnswers('daily', input, 'SUBMITTED').stool_type, 7)
assert.throws(() => model.buildActivityAnswers('daily', { ...input, appetite: null }, 'SUBMITTED'), /请选择/)
assert.throws(() => model.buildActivityAnswers('daily', { ...input, fasting_weight: '70.12345' }, 'SUBMITTED'), /4位/)
assert.throws(() => model.buildActivityAnswers('daily', { ...input, fasting_weight: 'Infinity' }, 'SUBMITTED'), /正数/)
assert.throws(() => model.buildActivityAnswers('daily', { ...input, bowel_observation: {} }, 'SUBMITTED'), /任意一项/)
assert.doesNotThrow(() => model.buildActivityAnswers('daily', model.emptyAnswers(), 'DRAFT'))
assert.throws(() => model.buildActivityPhotos('milestone', model.photoState(), 'SUBMITTED'), /照片/)
assert.equal(model.PHOTO_MAX_BYTES, 10485760)
assert.match(model.writeBlockedLabel('MEMBER_REMOVED'), /参与资格已移除/); assert.ok(!model.writeBlockedLabel('PERSONAL_PERIOD_ENDED').includes('PERSONAL_'))
assert.deepEqual(model.buildActivityPhotos('daily', model.photoState(), 'SUBMITTED'), {})
const first = model.prepareActivitySubmission({ date: '2026-10-14', status: 'DRAFT', expectedVersion: 0, answers: {}, photos: {} })
assert.match(first.payload.idempotencyKey, /^[A-Za-z0-9_-]{16,80}$/)
assert.equal(model.prepareActivitySubmission({ date: '2026-10-14', status: 'DRAFT', expectedVersion: 0, answers: {}, photos: {} }, first), first)
assert.notEqual(model.prepareActivitySubmission({ ...first.payload, status: 'SUBMITTED', idempotencyKey: undefined }, first).payload.idempotencyKey, first.payload.idempotencyKey)

const pageSource = readFileSync(resolve(root, 'src/pages/patient/yuanqizhan.vue'), 'utf8')
const { descriptor, errors } = parse(pageSource)
assert.deepEqual(errors, []); compileScript(descriptor, { id: 'synthetic-yuanqizhan' })
assert.deepEqual(compileTemplate({ id: 'synthetic-yuanqizhan', source: descriptor.template.content, filename: 'yuanqizhan.vue' }).errors, [])
assert.ok(!/<web-view|<iframe|wjx\.cn|OCR/.test(pageSource), 'Activity form must be native and have no third-party questionnaires or OCR')
assert.match(pageSource, /sizeType: \['original'\]/)
const calls = [], released = [], toasts = []
let account = 'synthetic-patient-a', saveFailure = null, lateList = null
const original = { activity: { id: 'synthetic-activity', title: '合成活动' }, member: { startDate: '2026-10-13' }, date: '2026-10-14', dayNumber: 2, formType: 'daily', canWrite: true, record: null }
let serverToday = structuredClone(original)
const deps = { ...model, ProtectedMedia: {}, store: { subscribe: () => () => {} }, patientActivitySession: () => account,
  getMyActivities: async () => lateList ? await lateList : [{ id: 'synthetic-activity', member: { status: 'ACTIVE' } }],
  getActivityToday: async () => structuredClone(serverToday), getActivityRecords: async () => ({ items: [], hasMore: false }), getActivityRecord: async () => ({}),
  saveActivityRecord: async (id, payload) => { calls.push(structuredClone(payload)); if (saveFailure) throw saveFailure; serverToday.record = { id: 'synthetic-record', date: payload.date, formType: 'daily', version: payload.expectedVersion + 1, status: payload.status, answers: payload.answers, photos: payload.photos }; return structuredClone(serverToday.record) },
  uploadActivityPhoto: async () => ({ id: 'synthetic-image', mimeType: 'image/png' }), resolveMediaFile: async id => 'synthetic-local-' + id, releaseMediaFile: path => released.push(path),
  uni: { showToast: options => toasts.push(options.title), reLaunch: () => {}, showModal: options => options.success({ confirm: true }), chooseImage: options => options.success({ tempFilePaths: ['synthetic-path'], tempFiles: [{ size: 10485761 }] }), switchTab: () => {} }
}
const script = descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'const page =')
const page = new Function('deps', `const {${Object.keys(deps).join(',')}} = deps; ${script}; return page;`)(deps)
function state() { const vm = { ...page.data(), visible: true, accountId: account, activityId: 'synthetic-activity', today: structuredClone(serverToday) }; for (const [key, fn] of Object.entries(page.methods)) vm[key] = fn.bind(vm); for (const [key, fn] of Object.entries(page.computed)) Object.defineProperty(vm, key, { get: () => fn.call(vm) }); return vm }
const vm = state(); vm.answers = structuredClone(input); vm.dirty = true
vm.photos.face = { assetId: 'synthetic-unsaved-photo', path: '', mimeType: 'image/png' }; await vm.openToday(); assert.equal(vm.answers.name, input.name); assert.equal(vm.photos.face.assetId, 'synthetic-unsaved-photo'); assert.equal(vm.dirty, true, 'Tapping current Today tab may not discard unsaved inputs')
saveFailure = new Error('合成网络超时'); await vm.save('SUBMITTED'); assert.equal(vm.answers.appetite, 0); assert.equal(vm.dirty, true); assert.equal(vm.saving, false)
const retryKey = calls.at(-1).idempotencyKey
await vm.save('SUBMITTED'); assert.equal(calls.at(-1).idempotencyKey, retryKey, 'Unchanged timeout retry reuses the original key')
saveFailure = null; await vm.save('SUBMITTED'); assert.equal(calls.at(-1).idempotencyKey, retryKey); assert.equal(vm.dirty, false); assert.equal(vm.baseVersion, 1); assert.equal(vm.today.record.status, 'SUBMITTED')
const countBeforeDraft = calls.length; vm.setAnswer('name', '合成当天修改'); await vm.save('DRAFT'); assert.equal(calls.length, countBeforeDraft); assert.equal(vm.conflict, false); assert.equal(vm.answers.name, '合成当天修改'); assert.match(toasts.at(-1), /提交当天修改/)
// The refresh can update the remote record but may not silently update the edit base.
vm.setAnswer('name', '当前未保存输入'); serverToday.record.version = 2; await vm.refresh(); assert.equal(vm.answers.name, '当前未保存输入'); assert.equal(vm.baseVersion, 1); assert.equal(vm.conflict, true)
const beforeConflict = calls.length; await vm.save('SUBMITTED'); assert.equal(calls.length, beforeConflict)
// Removal and midnight are checked before a business write.
serverToday = structuredClone(original); const removed = state(); removed.answers = structuredClone(input); serverToday.canWrite = false; serverToday.writeBlockedReason = '成员已移除'; await removed.save('SUBMITTED'); assert.equal(calls.length, beforeConflict); assert.equal(removed.today.canWrite, false); assert.equal(removed.answers.name, input.name)
serverToday = structuredClone(original); const midnight = state(); midnight.answers = structuredClone(input); midnight.dirty = true; serverToday.date = '2026-10-15'; serverToday.dayNumber = 3; await midnight.save('SUBMITTED'); assert.equal(calls.length, beforeConflict); assert.equal(midnight.today.date, '2026-10-15'); assert.equal(midnight.answers.name, '')
serverToday = structuredClone(original); const photo = state(); await photo.choosePhoto('face'); assert.match(photo.photoErrors.face || '', /10MiB/); assert.equal(photo.photos.face.assetId, '')
serverToday = structuredClone(original); const businessConflict = state(); businessConflict.answers = structuredClone(input); saveFailure = Object.assign(new Error('合成业务冲突'), { statusCode: 409, response: { message: '合成业务冲突' } }); await businessConflict.save('SUBMITTED'); assert.equal(businessConflict.conflict, false, 'Business 409 must not claim another device updated the record')
saveFailure = Object.assign(new Error('合成版本冲突'), { statusCode: 409, response: { code: 'VERSION_CONFLICT' } }); await businessConflict.save('SUBMITTED'); assert.equal(businessConflict.conflict, true); saveFailure = null
// Outgoing account responses must be discarded and all in-memory health/media data cleared.
let resolveList; lateList = new Promise(resolve => { resolveList = resolve }); const switching = state(); const refreshing = switching.refresh(); account = 'synthetic-patient-b'; switching.clearSession(); resolveList([{ id: 'synthetic-old-account' }]); await refreshing; assert.deepEqual(switching.activities, []); assert.equal(switching.today, null); assert.equal(switching.pendingSubmission, null); assert.equal(switching.previewAsset, null)
lateList = null; serverToday = structuredClone(original); const hidden = state(); hidden.photos.face = { assetId: 'synthetic-image', path: 'synthetic-local-file', mimeType: 'image/png' }; hidden.previewAsset = { id: 'synthetic-image' }; page.onHide.call(hidden); assert.equal(hidden.visible, false); assert.equal(hidden.previewAsset, null); assert.equal(hidden.photos.face.path, ''); assert.ok(released.includes('synthetic-local-file'))
// Exercise the actual home entry methods, including delayed outgoing-account responses.
const homeSource = readFileSync(resolve(root, 'src/pages/patient/index.vue'), 'utf8')
const homeDescriptor = parse(homeSource).descriptor
compileScript(homeDescriptor, { id: 'synthetic-yuanqizhan-entry' })
const homeScript = homeDescriptor.script.content.replace(/^\s*import .*$/gm, '').replace('export default', 'const page =')
const home = new Function('deps', `const {Icon,store,getMyActivities,patientActivitySession,statusLabel} = deps; ${homeScript}; return page;`)({ ...deps, Icon: {} })
function homeState() { const vm = { ...home.data() }; for (const [key, fn] of Object.entries(home.methods)) vm[key] = fn.bind(vm); return vm }
const entry = homeState(); await entry.loadYuanqizhanEntry(); assert.equal(entry.yuanqizhanEntries.length, 1); home.onHide.call(entry); assert.deepEqual(entry.yuanqizhanEntries, [])
let resolveEntry; lateList = new Promise(resolve => { resolveEntry = resolve }); const staleEntry = homeState(); const entryLoading = staleEntry.loadYuanqizhanEntry(); account = 'synthetic-patient-c'; staleEntry.clearYuanqizhanEntry(); resolveEntry([{ id: 'synthetic-outgoing-entry' }]); await entryLoading; assert.deepEqual(staleEntry.yuanqizhanEntries, []); lateList = null
assert.match(homeSource, /v-if="yuanqizhanEntries.length"/)
const historicalForm = model.formFromServer({ ...daily, title: '服务端保留的历史版本标题' }, 'daily'); assert.equal(historicalForm.title, '服务端保留的历史版本标题')
const report = { passed: true, executedAt: new Date().toISOString(), scope: 'Synthetic client model and page-method tests; no real API/SQL/storage/native-device execution', assertions: ['9/16 question keys and every original option', 'Explicit display mapping and kg/cm', 'Appetite negative/zero/positive and category stool', 'Free bowel whole-question validation', 'Finite precision and draft rules', 'Retry idempotency and version conflict', 'Submitted edits cannot downgrade to draft; business 409 differs from version conflict', 'Preflight removal and Beijing midnight handling', 'Photo byte limit', 'Account-switch and hidden-page media cleanup', 'Current Today tab preserves unsaved inputs/photos', 'Home entry eligibility and delayed account response', 'Historical schema snapshot', 'Vue SFC compilation'], networkRequests: 0, nativeDeviceExecuted: false }
mkdirSync(resolve(root, 'output/yuanqizhan-activity-20261014'), { recursive: true }); writeFileSync(resolve(root, 'output/yuanqizhan-activity-20261014/client-tests.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))