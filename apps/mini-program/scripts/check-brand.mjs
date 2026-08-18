import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = new URL('../src/', import.meta.url)
const sourceRoot = decodeURIComponent(root.pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)))
const textExtensions = new Set(['.vue', '.js', '.json', '.scss', '.css', '.html'])
const forbiddenNames = ['轻盈伴行', '体重管理助手', '轻衡健康', '木吾木同']
const violations = []
let expectedBrandCount = 0

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry)
    const stat = statSync(absolutePath)

    if (stat.isDirectory()) {
      visit(absolutePath)
      continue
    }

    if (!textExtensions.has(extname(entry))) continue

    const content = readFileSync(absolutePath, 'utf8')
    const file = relative(sourceRoot, absolutePath)
    expectedBrandCount += content.split('数字减重助手').length - 1

    for (const forbidden of forbiddenNames) {
      if (content.includes(forbidden)) {
        violations.push(`${file}: 禁止品牌文本 “${forbidden}”`)
      }
    }

    if (entry.endsWith('.vue')) {
      const logoTags = content.match(/<image\b[^>]*class=["'][^"']*logo[^"']*["'][^>]*>/gi) || []
      for (const tag of logoTags) {
        if (!/src=["']\/static\/logo\.png["']/i.test(tag)) {
          violations.push(`${file}: Logo 必须统一使用 /static/logo.png`)
        }
      }
    }
  }
}

visit(sourceRoot)

if (expectedBrandCount === 0) {
  violations.push('源码中未找到统一品牌名 “数字减重助手”')
}

if (violations.length > 0) {
  console.error(`品牌契约检查失败（${violations.length} 项）：`)
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`品牌契约检查通过：数字减重助手（${expectedBrandCount} 处），Logo 统一为 /static/logo.png`)
