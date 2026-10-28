import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const fromSource = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
const forms = await fromSource(read('src/utils/yuanqizhan-form.js'))
const model = await fromSource(read('src/utils/yuanqizhan-model.js').replace(/^import .*$/m, `const SOURCE_FORMS = ${JSON.stringify(forms.SOURCE_FORMS)}`))
let session = 'synthetic-nutritionist:NUTRITIONIST'
const requests = []
let apiResponse
globalThis.__yuanqizhanStaffTest = { careSessionIdentity: () => session, get: async (url, data, options) => { requests.push({url, data, options}); if (apiResponse instanceof Error) throw apiResponse; return {data: apiResponse} } }
const service = await fromSource('const {get, careSessionIdentity} = globalThis.__yuanqizhanStaffTest;\n' + read('src/utils/yuanqizhan-staff.js').replace(/^import .*$/gm, ''))
const patientId = 'synthetic-client-a', activityId = 'synthetic-activity-a'
const baseRecord = (date = '2026-10-18', activity = activityId, patient = patientId) => ({
  id: `${activity}:${patient}:${date}`, activityId: activity, patientId: patient, date, dayNumber: date.endsWith('18') ? 2 : 1,
  status: 'SUBMITTED', formType: 'milestone', form: model.activityForm('milestone'),
  answers: {name: '姓名不可展示', fasting_weight: 70, appetite: 0, fatigue: 2, bowel_observation: {bowel_count: '1', bowel_ease: '顺畅', bowel_extra: ''}},
  photos: {face: 'synthetic-private-face'}, accessNotice: '当前有效绑定营养师可只读查看本活动记录，姓名隐藏。', canWrite: true,
})
const activity = (id = activityId, patient = patientId) => ({id, title: id.endsWith('b') ? '合成活动乙' : '合成活动甲', status: 'ACTIVE', durationDays: 15, completedCount: 1, member: {patientId: patient, startDate: null, status: 'ACTIVE'}})
apiResponse = {items: [activity()], total: 1, hasMore: false}
assert.equal((await service.getClientActivities(patientId)).items.length, 1)
assert.deepEqual(requests.at(-1), {url: `/yuanqizhan/patients/${patientId}/activities`, data: {page: 1, pageSize: 15}, options: {loading: false, showError: false}})
apiResponse = {items: [baseRecord()], total: 1, hasMore: false}
assert.equal((await service.getClientActivityRecords(activityId, patientId, 2)).items.length, 1)
assert.equal(requests.at(-1).url, `/yuanqizhan/${activityId}/patients/${patientId}/records`)
assert.deepEqual(requests.at(-1).data, {page: 2, pageSize: 15})
apiResponse = baseRecord()
await service.getClientActivityRecord(activityId, patientId, '2026-10-18')
assert.equal(requests.at(-1).url, `/yuanqizhan/${activityId}/patients/${patientId}/records/2026-10-18`)
apiResponse = {items: [activity('activity/with spaces', 'patient/with spaces')]}
await service.getClientActivities('patient/with spaces')
assert.equal(requests.at(-1).url, '/yuanqizhan/patients/patient%2Fwith%20spaces/activities')
apiResponse = {...baseRecord(), patientId: 'other-client'}
await assert.rejects(service.getClientActivityRecord(activityId, patientId, '2026-10-18'), /当前客户不一致/)
apiResponse = {...baseRecord(), date: '2026-10-17'}
await assert.rejects(service.getClientActivityRecord(activityId, patientId, '2026-10-18'), /日期不一致/)
apiResponse = {items: [{...baseRecord(), activityId: 'other-activity'}]}
await assert.rejects(service.getClientActivityRecords(activityId, patientId), /当前客户不一致/)
apiResponse = {items: [activity(activityId, 'other-client')]}
await assert.rejects(service.getClientActivities(patientId), /响应无效/)
session = ''
const beforeUnauthenticated = requests.length
await assert.rejects(service.getClientActivities(patientId), /营养师账号/)
assert.equal(requests.length, beforeUnauthenticated)
session = 'synthetic-nutritionist:NUTRITIONIST'

const source = read('src/pages/doctor/YuanqizhanClientRecords.vue')
const {descriptor, errors} = parse(source)
assert.deepEqual(errors, [])
compileScript(descriptor, {id: 'synthetic-staff-activity-records'})
assert.deepEqual(compileTemplate({id: 'synthetic-staff-activity-records', filename: 'YuanqizhanClientRecords.vue', source: descriptor.template.content}).errors, [])
assert.ok(!/<(?:input|textarea|radio|checkbox|form)\b/.test(descriptor.template.content), 'Staff records must have no editing or upload controls')
assert.ok(!/saveActivityRecord|uploadActivityPhoto|\bpost\(|\bdel\(/.test(source + read('src/utils/yuanqizhan-staff.js')), 'The staff viewer has read-only API operations')
assert.match(read('src/pages/doctor/NutritionistClient.vue'), /<YuanqizhanClientRecords :patient-id="patientId" :page-active="pageActive"/)

const calls = [], released = []
let activityResponse = async (patient, page) => ({items: [activity(page === 1 ? activityId : 'synthetic-activity-b', patient)], total: 2, hasMore: page === 1})
let recordsResponse = async (id, patient, page) => ({items: page === 1 ? [{...baseRecord('2026-10-18', id, patient), status: 'DRAFT'}] : [baseRecord('2026-10-18', id, patient), baseRecord('2026-10-17', id, patient)], total: 2, hasMore: page === 1})
let detailResponse = async (id, patient, date) => baseRecord(date, id, patient)
let fileResponse = async id => `blob:${id}`
let userChanged = () => {}
const deps = {
  ...model, store: {subscribe: (_event, callback) => {userChanged = callback; return () => {userChanged = () => {}}}},
  careSessionIdentity: () => session,
  getClientActivities: (...args) => {calls.push(['activities', ...args]); return activityResponse(...args)},
  getClientActivityRecords: (...args) => {calls.push(['records', ...args]); return recordsResponse(...args)},
  getClientActivityRecord: (...args) => {calls.push(['detail', ...args]); return detailResponse(...args)},
  resolveMediaFile: id => {calls.push(['photo', id]); return fileResponse(id)}, releaseMediaFile: path => {if (path) released.push(path)},
}
const script = descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'const component =')
const component = new Function('deps', `const {${Object.keys(deps).join(',')}} = deps; ${script}; return component;`)(deps)
function view() {
  const vm = {...component.data(), patientId, pageActive: true}
  for (const [name, method] of Object.entries(component.methods)) vm[name] = method.bind(vm)
  for (const [name, method] of Object.entries(component.computed)) Object.defineProperty(vm, name, {get: () => method.call(vm)})
  return vm
}
const vm = view()
await vm.refresh()
assert.equal(vm.activities.length, 1); assert.equal(vm.activityId, activityId); assert.equal(vm.records[0].status, 'DRAFT')
assert.equal(vm.record, null); assert.equal(vm.recordsLoading, false); assert.equal(vm.activitiesLoading, false)
await vm.openRecord(vm.records[0])
assert.equal(vm.record.date, '2026-10-18'); assert.equal(vm.record.dayNumber, 2)
assert.ok(!vm.form.questions.some(question => question.key === 'name'), 'A legacy snapshot may not reintroduce the hidden name question')
assert.equal(vm.answerLabel(vm.form.questions.find(question => question.key === 'appetite')), '0分：和平时一样')
assert.equal(vm.answerLabel(vm.form.questions.find(question => question.key === 'fasting_weight')), '70 kg')
assert.equal(vm.textValue(vm.record.answers.bowel_observation.bowel_count), '1')
assert.equal(vm.textValue(''), '未填写'); assert.equal(vm.textValue(0), '0')
assert.equal(vm.accessNotice, vm.record.accessNotice, 'The current access policy takes precedence over an old form snapshot notice')
await vm.loadActivities(true)
assert.equal(vm.activities.length, 2); assert.equal(vm.activityId, activityId); assert.equal(vm.activitiesHasMore, false)
await vm.loadRecords(true)
assert.equal(vm.records.length, 2); assert.equal(vm.recordsTotal, 2); assert.equal(vm.recordsHasMore, false)
await vm.openPhoto('face')
assert.equal(vm.photoPath, 'blob:synthetic-private-face')
assert.equal(calls.at(-2)[0], 'detail', 'Each photo open rechecks the authorized record before downloading')
assert.equal(calls.at(-1)[0], 'photo')
await vm.selectActivity('synthetic-activity-b')
assert.equal(vm.record, null); assert.equal(vm.previewAsset, null); assert.equal(vm.photoPath, '')
assert.ok(released.includes('blob:synthetic-private-face')); assert.equal(vm.records[0].activityId, 'synthetic-activity-b')

// A delayed old customer/activity response cannot refill the newly selected view.
await vm.openRecord(vm.records[0])
let resolveOldDetail
detailResponse = () => new Promise(resolve => {resolveOldDetail = resolve})
const outgoingDetail = vm.openRecord(vm.records[0])
vm.patientId = 'synthetic-client-b'
await vm.refresh()
resolveOldDetail(baseRecord('2026-10-18', 'synthetic-activity-b', patientId))
await outgoingDetail
assert.equal(vm.record, null); assert.equal(vm.records[0].patientId, 'synthetic-client-b')
detailResponse = async (id, patient, date) => baseRecord(date, id, patient)
await vm.openRecord(vm.records[0])

// Unbinding failures clear prior answers, dates and downloaded private media.
vm.photoPath = 'blob:prior-private-image'
detailResponse = async () => {throw Object.assign(new Error('已解除客户绑定'), {statusCode: 403})}
await vm.openPhoto('face')
assert.deepEqual(vm.activities, []); assert.deepEqual(vm.records, []); assert.equal(vm.record, null)
assert.equal(vm.previewAsset, null); assert.equal(vm.photoPath, ''); assert.match(vm.error, /解除客户绑定/)
assert.ok(released.includes('blob:prior-private-image'))
detailResponse = async (id, patient, date) => baseRecord(date, id, patient)
await vm.refresh(); await vm.openRecord(vm.records[0])

// Session changes immediately clear private state; a late photo is released.
component.mounted.call(vm)
let resolveOldPhoto
fileResponse = () => new Promise(resolve => {resolveOldPhoto = resolve})
const outgoingPhoto = vm.openPhoto('face')
await Promise.resolve(); await Promise.resolve()
session = 'another-nutritionist:NUTRITIONIST'; userChanged()
assert.equal(vm.record, null); assert.deepEqual(vm.records, []); assert.equal(vm.previewAsset, null)
resolveOldPhoto('blob:late-old-account')
await outgoingPhoto
assert.ok(released.includes('blob:late-old-account')); assert.equal(vm.photoPath, '')
session = 'synthetic-nutritionist:NUTRITIONIST'; fileResponse = async id => `blob:${id}`
await vm.refresh(); await vm.openRecord(vm.records[0]); await vm.openPhoto('face')
vm.pageActive = false; component.watch.pageActive.call(vm, false)
assert.equal(vm.record, null); assert.deepEqual(vm.records, []); assert.equal(vm.photoPath, '')
assert.equal(vm.ownerSession, '')
component.beforeUnmount.call(vm)

console.log('元气盏营养师只读查看检查通过：真实组件及 GET 路由、分页、完整回答、姓名隐藏、受保护照片、切换隔离与解绑清理；全部使用合成数据，未连接真实客户或上传微信。')
