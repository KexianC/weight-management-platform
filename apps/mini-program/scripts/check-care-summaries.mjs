import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const api = readFileSync(resolve(root, 'src/utils/api.js'), 'utf8')
const report = readFileSync(resolve(root, 'src/pages/patient/report.vue'), 'utf8')
const home = readFileSync(resolve(root, 'src/pages/patient/index.vue'), 'utf8')

const requirements = [
  [api, "get('/care-summaries'", '患者总结接口'],
  [report, "activeTab === 'summary'", '医护总结选项卡'],
  [report, '医护点评', '点评内容'],
  [report, 'loadCareSummaries', '总结加载逻辑'],
  [home, "'CARE_SUMMARY'", '总结通知识别'],
  [home, "uni.setStorageSync('patientReportTab', 'summary')", '通知直达总结选项卡'],
]

const missing = requirements.filter(([source, snippet]) => !source.includes(snippet)).map(([, , label]) => label)
if (missing.length) {
  console.error(`医护周期总结契约检查失败：缺少 ${missing.join('、')}`)
  process.exit(1)
}

console.log('医护周期总结契约检查通过：患者可查看周/月点评，通知可直达总结选项卡')
