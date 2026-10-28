import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const app = readFileSync(resolve(import.meta.dirname, '..', 'src/App.vue'), 'utf8')
const patientRecord = readFileSync(resolve(import.meta.dirname, '..', 'src/pages/patient/record.vue'), 'utf8')
const required = [
  '@media screen and (min-width: 768px)',
  'max-width: 430px',
  'uni-page-body > view',
  'uni-tabbar.uni-tabbar-bottom .uni-tabbar',
  'left: 50% !important',
  'transform: translateX(-50%) !important',
]
const missing = required.filter((snippet) => !app.includes(snippet))
const recordRequired = [
  'placeholder="请输入体重"',
  '.row > input { flex: 1; min-width: 0; }',
  'box-sizing: border-box; width: 100%;',
  'env(safe-area-inset-bottom)',
]
const recordMissing = recordRequired.filter((snippet) => !patientRecord.includes(snippet))

if (missing.length || recordMissing.length) {
	console.error(`H5 桌面手机布局契约检查失败：缺少 ${[...missing, ...recordMissing].join('、')}`)
	process.exit(1)
}

console.log('H5 桌面布局契约检查通过：宽屏限制为手机宽度，页面根节点和 TabBar 同步约束，体重输入占位文案完整')
