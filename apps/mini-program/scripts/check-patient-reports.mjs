import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const root = path.resolve(import.meta.dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const calls = []
let getPayload = null
let postFailure = null
let postPayloadOverride = null
globalThis.__patientReportTestApi = {
  get: async (...args) => { calls.push(['get', ...args]); return { code: 200, data: getPayload } },
  post: async (...args) => { calls.push(['post', ...args]); if (postFailure) throw postFailure; return { code: 201, data: postPayloadOverride || { id: 'synthetic-report', ...args[1] } } },
  upload: async (...args) => { calls.push(['upload', ...args]); return { code: 201, data: { id: 'synthetic-media' } } }
}
const utilitySource = read('src/utils/patient-reports.js').replace("import { get, post, upload } from './api.js'", 'const {get, post, upload} = globalThis.__patientReportTestApi')
const helpers = await import('data:text/javascript;base64,' + Buffer.from(utilitySource).toString('base64'))
const patient = { id: 'synthetic-patient', backendRole: 'PATIENT', role: 'patient' }

assert.equal(helpers.healthReportFileKind({ mimeType: 'application/pdf' }), 'pdf')
assert.equal(helpers.healthReportFileKind({ mimeType: 'IMAGE/PNG' }), 'image')
assert.equal(helpers.healthReportFileKind({ mimeType: 'text/html', title: 'pretend.pdf' }), '')
assert.equal(helpers.healthReportFileKind({ title: 'no-type.pdf' }), '', 'never infer protected file format from a title')
assert.deepEqual(helpers.REPORT_CATEGORIES.map(row => row.category), ['BODY_COMPOSITION', 'EXERCISE_ASSESSMENT', 'MEDICAL_EXAMINATION'])
assert.deepEqual(helpers.bodyMetrics({ heightCm: null, weightKg: '72.4', bodyFatPct: '', hipCm: 95 }).map(row => row.key), ['weightKg', 'hipCm'])
assert.match(helpers.reportOcrStatus({ provider: 'disabled', status: 'UNCONFIGURED', photoRecognitionConfigured: false, sendsToThirdParty: false }), /尚未配置/)
assert.match(helpers.reportOcrStatus({ provider: 'local', status: 'AVAILABLE', photoRecognitionConfigured: false }), /不进行照片 OCR/)
assert.match(helpers.reportOcrStatus({ provider: 'mock', status: 'AVAILABLE', photoRecognitionConfigured: false }), /虚构指标与图片无关/)
assert.match(helpers.reportOcrStatus({ configured: true, isSimulation: false }), /尚未确认/, 'obsolete fields must never claim real photo OCR is configured')
assert.match(helpers.bodyReportSource({ source: 'MOCK_REVIEWED' }), /模拟虚构/)
assert.match(helpers.bodyReportSource({ source: 'LOCAL_TEXT_REVIEWED' }), /未识别照片/)
assert.match(helpers.bodyReportSource({ source: 'MANUAL_REVIEWED' }), /手工填写/)
assert.equal(helpers.isPatientSession({ role: 'doctor', backendRole: 'NUTRITIONIST' }), false)
assert.throws(() => helpers.patientIdOf({ role: 'NUTRITIONIST', id: patient.id }), /客户账号/)
assert.throws(() => helpers.validateShareLocator({ token: 'broken', reportId: 'synthetic-report' }), /无效/)
assert.throws(() => helpers.validateShareLocator({ shareId: '../../other' }), /无效/)
assert.deepEqual(helpers.validateShareLocator({ token: 'a'.repeat(43) }), { token: 'a'.repeat(43) })

await assert.rejects(helpers.savePatientMedicalReport(patient, { title: ' ', filePath: 'synthetic.jpg' }), /报告名称/)
await assert.rejects(helpers.savePatientMedicalReport(patient, { title: '虚构体检报告' }), /原图/)
assert.equal(calls.length, 0, 'invalid drafts must never upload')
const draft = { title: '  虚构体检报告  ', filePath: 'synthetic.jpg', mediaAssetId: '' }
postFailure = Object.assign(new Error('service unavailable'), { statusCode: 503 })
await assert.rejects(helpers.savePatientMedicalReport(patient, draft, { onUploaded: id => { draft.mediaAssetId = id } }), /unavailable/)
assert.equal(draft.mediaAssetId, 'synthetic-media', 'retry retains successfully uploaded media id')
postFailure = null
const saved = await helpers.savePatientMedicalReport(patient, draft)
assert.equal(saved.data.id, 'synthetic-report')
assert.equal(calls.filter(row => row[0] === 'upload').length, 1, 'retry must reuse prior uploaded file')
assert.deepEqual(calls.at(-1).slice(0, 3), ['post', '/report-workflow/patients/synthetic-patient/health-reports', { mediaAssetId: 'synthetic-media', category: 'MEDICAL_EXAMINATION', title: '虚构体检报告' }])

postPayloadOverride = { id: 'synthetic-report', mediaAssetId: 'wrong-synthetic-media', category: 'MEDICAL_EXAMINATION' }
await assert.rejects(helpers.savePatientMedicalReport(patient, draft), /未确认/, 'mismatched upload binding must never show a success state')
postPayloadOverride = null
getPayload = [{ id: 'synthetic-health-file', category: 'MEDICAL_EXAMINATION', title: '虚构报告', mediaAssetId: 'synthetic-media', createdAt: '2026-10-12T00:00:00.000Z' }]
const healthFileResponse = await helpers.getPatientHealthFiles(patient)
assert.deepEqual(helpers.reportItems(healthFileResponse.data), getPayload)
assert.equal(calls.at(-1)[1], '/report-workflow/patients/synthetic-patient/health-reports')

getPayload = { id: 'synthetic-prescription', items: [] }
await helpers.getSharedExerciseReport({ shareId: 'synthetic-share' }, patient)
assert.equal(calls.at(-1)[1], '/care-management/shared-reports/by-share/synthetic-share')
await helpers.getSharedExerciseReport({ token: 'a'.repeat(43) }, patient)
assert.equal(calls.at(-1)[1], '/care-management/shared-reports/' + 'a'.repeat(43))
const bodySaved = await helpers.savePatientBodyReport(patient, {title:'虚构人体成分报告',mediaAssetId:'synthetic-body-media'});
assert.equal(bodySaved.data.category,'BODY_COMPOSITION'); assert.equal(calls.at(-1)[2].category,'BODY_COMPOSITION');
await assert.rejects(helpers.savePatientBodyReport({role:'NUTRITIONIST',id:'synthetic-nutritionist'},{title:'越权',filePath:'fake.png'}),/客户账号/);
const beforeRejectedSession = calls.length
await assert.rejects(helpers.getSharedExerciseReport({ shareId: 'synthetic-share' }, { role: 'NUTRITIONIST', id: patient.id }), /客户账号/)
assert.equal(calls.length, beforeRejectedSession)
getPayload = { exerciseReports: [{ id: 'synthetic-prescription', assessment: '仅本地虚构数据' }] }
assert.equal((await helpers.getSharedExerciseReport({ reportId: 'synthetic-prescription' }, patient)).data.id, 'synthetic-prescription')
getPayload = { exerciseReports: [] }
await assert.rejects(helpers.getSharedExerciseReport({ reportId: 'synthetic-prescription' }, patient), /过期/)

const reportSource = read('src/pages/patient/report.vue')
const sharedSource = read('src/pages/shared-report/shared-report.vue')
const reportTemplate = reportSource.split('<script>')[0]
assert.doesNotMatch(reportTemplate, /activeTab === '(?:diet|nutrition)'/)
assert.match(reportTemplate, /weightChart/)
assert.match(reportTemplate, /医护点评/)
assert.match(reportTemplate, /医学体检报告/)
assert.match(reportSource, /resolveMediaFile\(file.mediaAssetId\)/)
assert.doesNotMatch(sharedSource, /<video[^>]+:src="(?:item|report)\./)
assert.match(sharedSource, /pendingPatientRoute/)

// Check real lifecycle methods with delayed synthetic responses (no API or identity data).
let finishLoad
const released = []
const globals = {
  getStorage: key => key === 'userInfo' ? patient : 'synthetic-token',
  showToast: () => {},
  getSharedExerciseReport: () => new Promise(resolve => { finishLoad = resolve }),
  isPatientSession: helpers.isPatientSession,
  reportItems: helpers.reportItems,
  validateShareLocator: helpers.validateShareLocator,
  resolveMediaFile: async () => 'synthetic-local-video',
  releaseMediaFile: value => released.push(value),
  uni: { setStorageSync() {}, reLaunch() {} },
  module: { exports: {} }
}
const script = sharedSource.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replace('export default', 'module.exports =')
vm.runInNewContext(script, globals)
const component = globals.module.exports
const page = { ...component.data() }
for (const [name, fn] of Object.entries(component.methods)) page[name] = fn.bind(page)
page.locator = { shareId: 'synthetic-share' }
page.pageVisible = true
const loading = page.loadReport()
component.onHide.call(page)
finishLoad({ code: 200, data: { id: 'synthetic-prescription' } })
await loading
assert.equal(page.report, null, 'late response after onHide must not restore protected content')
page.videoPath = 'synthetic-local-video'
component.onUnload.call(page)
assert.deepEqual(released, ['synthetic-local-video'])

page.pageVisible = true
const accountSwitchLoad = page.loadReport()
globals.getStorage = key => key === 'userInfo' ? { ...patient, id: 'different-synthetic-patient' } : 'different-synthetic-token'
finishLoad({ code: 200, data: { id: 'synthetic-prescription' } })
await accountSwitchLoad
assert.equal(page.report, null, 'response for the previous account must not appear after a session switch')
const authActions = []
globals.uni = { setStorageSync: (...args) => authActions.push(['store', ...args]), reLaunch: (...args) => authActions.push(['launch', ...args]) }
globals.getStorage = key => key === 'userInfo' ? { ...patient, mustChangePassword: true } : 'synthetic-token'
await page.loadReport()
assert.deepEqual(authActions[0], ['store', 'pendingPatientRoute', '/pages/shared-report/shared-report?shareId=synthetic-share'])
assert.equal(authActions[1][1].url, '/pages/change-password/change-password', 'forced password change keeps the intended report route')
assert.equal(page.report, null)

let currentPatient = patient
const reportGlobals = {
  ...helpers,
  getStorage: key => key === 'userInfo' ? currentPatient : 'synthetic-token',
  showToast: () => {}, hideLoading: () => {}, Icon: {},
  getCareSummaries: async () => ({ code: 200, data: [] }),
  getHealthRecords: async () => ({ code: 200, data: [] }),
  getHealthReports: async () => ({ code: 200, data: {} }),
  resolveMediaFile: async () => 'synthetic-original-image',
  releaseMediaFile: value => released.push(value),
  setTimeout, clearTimeout,
  uni: { getStorageSync() {}, removeStorageSync() {}, showModal() {} },
  module: { exports: {} }
}
const reportScript = reportSource.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^\s*import [^\n]*$/gm, '').replace('export default', 'module.exports =')
vm.runInNewContext(reportScript, reportGlobals)
const reportComponent = reportGlobals.module.exports
const reportPage = { ...reportComponent.data() }
for (const [name, fn] of Object.entries(reportComponent.methods)) reportPage[name] = fn.bind(reportPage)
assert.equal(reportPage.healthReportFileKind({mimeType:'application/pdf'}),'pdf','report template must expose the MIME helper');
reportPage.initUserInfo()
reportPage.activeTab = 'medical'
reportPage.medicalDraft = { title: '虚构体检', filePath: 'synthetic-camera.jpg', mediaAssetId: '' }
reportPage.previewPath = 'synthetic-original-image'
reportPage.bodyReports = [{ id: 'synthetic-body' }]
reportComponent.onHide.call(reportPage)
assert.equal(reportPage.previewPath, '')
assert.equal(reportPage.bodyReports.length, 0)
assert.equal(reportPage.activeTab, 'medical', 'camera/background return retains selected category')
assert.equal(reportPage.medicalDraft.filePath, 'synthetic-camera.jpg', 'same-account camera flow retains pending draft')
assert.ok(released.includes('synthetic-original-image'), 'onHide releases protected report original')
currentPatient = { ...patient, id: 'different-synthetic-patient' }
reportPage.initUserInfo()
assert.equal(reportPage.activeTab, 'weight')
assert.equal(reportPage.medicalDraft.title, '', 'account switch clears pending health draft')
assert.equal(reportPage.medicalDraft.filePath, '')

// Execute each platform branch independently; raw SFC comments are not a runtime switch.
const scriptFor = platform => reportScript
  .replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/g, block => platform === 'H5' ? block : '')
  .replace(/\/\/ #ifndef H5[\s\S]*?\/\/ #endif/g, block => platform === 'H5' ? '' : block)
const makeReportInstance = component => {
  const instance = { ...component.data() }
  for (const [name, fn] of Object.entries(component.methods)) instance[name] = fn.bind(instance)
  instance.initUserInfo()
  instance.reportPageVisible = true
  return instance
}
currentPatient = patient
let nativeOpenOptions
let appHideListener
let nativePage
const nativeGlobals = { ...reportGlobals,
  module: { exports: {} },
  getCurrentPages: () => [{ route: 'pages/patient/report' }],
  resolveMediaFile: async () => 'synthetic-protected.pdf',
  uni: { ...reportGlobals.uni,
    onAppHide: callback => { appHideListener = callback },
    offAppHide: callback => { if (appHideListener === callback) appHideListener = null },
    openDocument: options => { nativeOpenOptions = options; nativeComponent.onHide.call(nativePage) }
  }
}
vm.runInNewContext(scriptFor('MP-WEIXIN'), nativeGlobals)
const nativeComponent = nativeGlobals.module.exports
nativePage = makeReportInstance(nativeComponent)
nativePage.registerPreviewPrivacyHooks()
nativePage.activeTab = 'medical'
const releasesBeforeOpen = released.length
await nativePage.previewHealthFile({ mediaAssetId: 'synthetic-pdf-media', mimeType: 'application/pdf' })
assert.equal(nativeOpenOptions.filePath, 'synthetic-protected.pdf')
assert.equal(nativeOpenOptions.fileType, 'pdf')
assert.equal(nativeOpenOptions.showMenu, false)
assert.equal(nativePage.previewPath, '', 'native PDF does not mount an image/blob preview')
assert.equal(nativePage.nativeDocumentPath, 'synthetic-protected.pdf')
assert.equal(released.length, releasesBeforeOpen, 'page hide while openDocument takes the file must not unlink it')
appHideListener()
assert.equal(released.length, releasesBeforeOpen, 'opening hand-off tolerates the accompanying app hide')
nativeOpenOptions.success()
assert.equal(nativePage.nativeDocumentOpening, false)
nativePage.initPageData = nativePage.loadCareReports = nativePage.loadHealthFiles = () => {}
nativeComponent.onShow.call(nativePage)
assert.equal(nativePage.nativeDocumentPath, '', 'return from system reader releases the temporary PDF')
assert.equal(released.at(-1), 'synthetic-protected.pdf')
assert.equal(nativePage.activeTab, 'medical')

nativePage.openNativeDocument('synthetic-failure.pdf')
nativeOpenOptions.fail()
assert.equal(nativePage.nativeDocumentPath, '')
assert.equal(released.at(-1), 'synthetic-failure.pdf')
assert.match(nativePage.previewError, /PDF 无法打开/)

nativePage.openNativeDocument('synthetic-background.pdf')
nativeOpenOptions.success()
appHideListener()
assert.equal(nativePage.nativeDocumentPath, '', 'actual background after hand-off releases the local copy')
assert.equal(released.at(-1), 'synthetic-background.pdf')

nativePage.openNativeDocument('synthetic-account.pdf')
currentPatient = { ...patient, id: 'different-synthetic-patient' }
nativePage.initUserInfo()
assert.equal(nativePage.nativeDocumentPath, '', 'switching account releases a native document lease')
assert.equal(released.at(-1), 'synthetic-account.pdf')
nativeOpenOptions.success()
assert.equal(nativePage.nativeDocumentPath, '', 'late native success cannot restore an old account document')
nativeComponent.onUnload.call(nativePage)
assert.equal(appHideListener, null)

currentPatient = patient
const h5Globals = { ...reportGlobals, module: { exports: {} }, resolveMediaFile: async () => 'blob:synthetic-authenticated-pdf' }
vm.runInNewContext(scriptFor('H5'), h5Globals)
const h5Component = h5Globals.module.exports
const h5Page = makeReportInstance(h5Component)
await h5Page.previewHealthFile({ mediaAssetId: 'synthetic-pdf-media', mimeType: 'application/pdf' })
assert.equal(h5Page.previewKind, 'pdf')
assert.equal(h5Page.previewPath, 'blob:synthetic-authenticated-pdf')
h5Component.onHide.call(h5Page)
assert.equal(h5Page.previewPath, '')
assert.equal(released.at(-1), 'blob:synthetic-authenticated-pdf')
assert.match(reportSource, /sizeType: \['original'\]/, 'report image chooser must preserve original pixels')
assert.doesNotMatch(reportSource, /\/media\/[^\s]+DELETE|deleteMedia|removeMedia/, 'preview cleanup must not delete server originals')

const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
for (const file of ['src/pages/patient/report.vue', 'src/pages/shared-report/shared-report.vue']) {
  const source = read(file)
  const { descriptor, errors } = parse(source, { filename: file })
  assert.deepEqual(errors, [], file + ': parse')
  compileScript(descriptor, { id: file })
  const output = compileTemplate({ source: descriptor.template.content, filename: file, id: file })
  assert.deepEqual(output.errors, [], file + ': template compile')
}
delete globalThis.__patientReportTestApi
console.log('Patient report checks passed: PDF MIME routing and native/H5 privacy lifecycle, original image selection, actual health-report response shape, disabled/local/mock OCR, source labels, categories, upload binding/retry, patient-only shared reads, expired report handling, lifecycle race protection, media cleanup, Vue compilation. Synthetic local data only; backend and real WeChat remain integration checks.')
