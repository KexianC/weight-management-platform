import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(root, 'package.json'))
const vue = require('vue')
const renderer = require('vue/server-renderer')
const { parse, compileTemplate } = require('@vue/compiler-sfc')
const importText = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const { followUpWeight } = await importText(readFileSync(resolve(root, 'src/utils/follow-result.js'), 'utf8'))

// Exercise the shipped HTTP adapter, with synthetic responses and no network access.
const steps = []
let requests = 0
globalThis.uni = {
	request(options) {
		const step = steps.shift()
		assert.ok(step, 'unexpected request')
		assert.ok(options.url.endsWith(`/follow-ups/${step.id}`))
		requests++
		queueMicrotask(() => options.success({ statusCode: 200, data: step }))
	},
	getStorageSync: () => undefined,
	setStorageSync: () => {},
	removeStorageSync: () => {},
	reLaunch: () => { throw new Error('unexpected navigation') }
}
globalThis.__followTest = {
	getStorage: key => ({ token: 'synthetic-access', userInfo: { id: 'synthetic-patient', role: 'PATIENT' } })[key],
	showToast: () => {}, showLoading: () => {}, hideLoading: () => {}, generateUploadPath: () => '',
	UPLOAD_PATHS: {}, getImageUrl: value => value, normalizeRecordPayload: value => value,
	resolveMediaFile: async () => { throw new Error('text-only result must not load media') }, setTimeout: () => {}
}
const apiSource = readFileSync(resolve(root, 'src/utils/api.js'), 'utf8')
	.replace(/^import .*$/gm, '')
	.replace('import.meta.env.VITE_API_BASE_URL', "'http://synthetic.test/api/v1'")
const api = await importText('const {getStorage,showToast,showLoading,hideLoading,generateUploadPath,UPLOAD_PATHS,getImageUrl,normalizeRecordPayload,resolveMediaFile,setTimeout}=globalThis.__followTest;\n' + apiSource)

function pageComponent(role) {
	const filename = resolve(root, `src/pages/${role}/follow-record.vue`)
	const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename })
	assert.deepEqual(errors, [])
	const script = descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'return')
	const component = new Function('getFollowUpDetail', 'followUpWeight', 'showToast', 'Icon', 'store', 'isNutritionist', 'getManagedClient', script)(
		api.getFollowUpDetail, followUpWeight, () => {}, { render: () => null }, { isLogin: () => true }, () => false, async () => ({ patient: { name: 'synthetic' } })
	)
	const compiled = compileTemplate({ source: descriptor.template.content, filename, id: `synthetic-${role}`, ssr: true, ssrCssVars: descriptor.cssVars, compilerOptions: { isCustomElement: tag => ['view', 'text', 'image'].includes(tag) } })
	assert.deepEqual(compiled.errors, [])
	const code = compiled.code
		.replace(/import \{([\s\S]*?)\} from ["']([^"']+)["'];?/g, (_, names, from) => `const {${names.replace(/\bas\b/g, ':')}}=${from.includes('server-renderer') ? '__renderer' : '__vue'};`)
		.replace('export function ssrRender', 'return function ssrRender')
	component.ssrRender = new Function('__vue', '__renderer', code)(vue, renderer)
	return component
}

const components = Object.fromEntries(['patient', 'doctor'].map(role => [role, pageComponent(role)]))
let renderedCases = 0
async function renderCase(role, type, result) {
	const component = components[role]
	const context = { ...component.data(), followId: `synthetic-follow-${renderedCases}` }
	for (const [name, method] of Object.entries(component.methods)) context[name] = method.bind(context)
	const original = structuredClone(result)
	steps.push({ id: context.followId, patientId: 'synthetic-patient', type, status: 'COMPLETED', completedAt: '2026-10-21T09:00:00.000Z', result })
	await context.loadFollowRecord()
	assert.equal(context.loading, false)
	assert.ok(context.followRecord?.result, 'detail load failed')
	assert.deepEqual(result, original, 'display adapter must not mutate the API result')
	const app = vue.createSSRApp({ ...component, data: () => ({ followId: context.followId, followRecord: context.followRecord, loading: false, error: '' }) })
	app.config.warnHandler = () => {}
	const html = await renderer.renderToString(app)
	renderedCases++
	return html
}

const weightCases = [
	[{ weightKg: 79.5 }, '79.5'],
	[{ weight: 78.25 }, '78.25'],
	[{ weightData: { weightKg: 77.75 } }, '77.75'],
	[{ weightData: { weight: 76.5 } }, '76.5'],
	[{ weightKg: 79.5, weight: 70 }, '79.5'],
	[{ weightKg: null, weight: 78 }, '78'],
	[{ weightKg: 0, weight: 79.5 }, '0'],
	[{ weight: 0 }, '0'],
	[{ weightData: { weightKg: 0 } }, '0'],
	[{ weightKg: '79.50' }, '79.50'],
	[{}, '--']
]
for (const role of ['patient', 'doctor']) {
	for (const [result, expected] of weightCases) {
		const html = await renderCase(role, 'WEIGHT', result)
		const weightText = html.match(/<text[^>]*class="[^"]*(?:value weight|weight-number)[^"]*"[^>]*>([^<]*)<\/text>/)?.[1]?.trim()
		assert.equal(weightText, role === 'patient' ? `${expected} kg` : expected, `${role}: ${JSON.stringify(result)}`)
	}
	for (const [type, result, expected] of [
		['DIET', { dietRecord: '合成饮食内容' }, '合成饮食内容'],
		['EXERCISE', { exerciseRecord: '合成运动内容', completionNote: '合成完成情况' }, '合成运动内容'],
		['MEDICATION', { medicationStatus: '合成用药状态', reviewNote: '合成复查说明' }, '合成用药状态'],
		['QUESTIONNAIRE', { questions: [{ question: '合成问题', answer: '合成回答' }], answers: [{ question: '合成问题', answer: '合成回答' }] }, '合成回答'],
		['GENERAL', { content: '合成通用随访内容' }, '合成通用随访内容']
	]) assert.ok((await renderCase(role, type, result)).includes(expected), `${role}: ${type} regressed`)
}
assert.equal(followUpWeight(null), undefined)
assert.equal(followUpWeight(undefined), undefined)
assert.equal(steps.length, 0)
assert.equal(requests, renderedCases)
console.log(JSON.stringify({ passed: true, renderedPatientAndDoctorCases: renderedCases, actualApiAdapterAndPageLoadUsed: true, zeroAndLegacyShapesPreserved: true, otherFollowTypesPreserved: true, networkAccessed: false, productionChanged: false }))
