import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const srcUrl = new URL('../src/', import.meta.url)
const sourceRoot = decodeURIComponent(srcUrl.pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)))
const iconsRoot = join(sourceRoot, 'static', 'icons')
const violations = []
const allowedNamedSizes = new Set(['xs', 'sm', 'md', 'lg', 'xl'])
const allowedNumericSizes = new Set([12, 14, 16, 18, 20, 24, 32, 36, 40, 48, 64])
const allowedColors = new Set([
  '$primary-color',
  '$secondary-color',
  '$accent-color',
  '$success-color',
  '$warning-color',
  '$error-color',
  '$gray-300',
  '$gray-400',
  '$gray-500',
  '$gray-600',
  '$gray-700',
  '$gray-800',
  '#ffffff'
])

let iconInstanceCount = 0
let checkedReferenceCount = 0

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function readAttribute(tag, name) {
  const doubleQuoted = tag.match(new RegExp(`\\s(:?${name})="([^"]*)"`, 'i'))
  if (doubleQuoted) return { dynamic: doubleQuoted[1].startsWith(':'), value: doubleQuoted[2] }

  const singleQuoted = tag.match(new RegExp(`\\s(:?${name})='([^']*)'`, 'i'))
  if (singleQuoted) return { dynamic: singleQuoted[1].startsWith(':'), value: singleQuoted[2] }

  return null
}

function validateSize(file, line, attribute) {
  if (!attribute) {
    violations.push(`${file}:${line}: Icon 必须显式声明 size`)
    return
  }
  if (attribute.dynamic) {
    violations.push(`${file}:${line}: Icon size 不允许动态表达式，需使用统一尺寸档位`)
    return
  }

  const numericSize = Number(attribute.value)
  if (Number.isFinite(numericSize)) {
    if (!allowedNumericSizes.has(numericSize)) {
      violations.push(`${file}:${line}: Icon size=${attribute.value} 不在统一尺寸档位中`)
    }
    return
  }

  if (!allowedNamedSizes.has(attribute.value)) {
    violations.push(`${file}:${line}: Icon size=${attribute.value} 不是有效命名尺寸`)
  }
}

function validateColor(file, line, attribute) {
  if (!attribute) {
    violations.push(`${file}:${line}: Icon 必须显式声明语义 color`)
    return
  }

  const tokens = attribute.dynamic
    ? attribute.value.match(/\$[A-Za-z0-9-]+|#[A-Fa-f0-9]{3,8}/g) || []
    : [attribute.value]

  if (tokens.length === 0) {
    violations.push(`${file}:${line}: Icon 动态 color 未包含可验证的语义颜色`)
    return
  }

  for (const token of tokens) {
    const normalized = token.startsWith('#') ? token.toLowerCase() : token
    if (!allowedColors.has(normalized)) {
      violations.push(`${file}:${line}: Icon color=${token} 未使用统一语义色`)
    }
  }
}

function validateVueFile(absolutePath) {
  const content = readFileSync(absolutePath, 'utf8')
  const file = relative(sourceRoot, absolutePath)

  for (const match of content.matchAll(/<Icon\b[^>]*>/g)) {
    iconInstanceCount += 1
    const line = lineNumberAt(content, match.index)
    validateSize(file, line, readAttribute(match[0], 'size'))
    validateColor(file, line, readAttribute(match[0], 'color'))
  }

  for (const match of content.matchAll(/["']([A-Za-z][A-Za-z &-]*\/[A-Za-z0-9][A-Za-z0-9-]*\.svg)["']/g)) {
    checkedReferenceCount += 1
    const iconPath = match[1]
    const line = lineNumberAt(content, match.index)

    if (/[ &]/.test(iconPath.split('/')[0])) {
      violations.push(`${file}:${line}: 图标目录 ${iconPath.split('/')[0]} 含空格或特殊符号，H5 路径不稳定`)
    }
    if (!existsSync(join(iconsRoot, ...iconPath.split('/')))) {
      violations.push(`${file}:${line}: 缺少图标 ${iconPath}`)
    }
  }
}

function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry)
    const stat = statSync(absolutePath)

    if (stat.isDirectory()) {
      visit(absolutePath)
      continue
    }
    if (entry.endsWith('.vue')) validateVueFile(absolutePath)
  }
}

visit(join(sourceRoot, 'pages'))
visit(join(sourceRoot, 'components'))

if (violations.length > 0) {
  console.error(`图标契约检查失败（${violations.length} 项）：`)
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log(`图标契约检查通过：${iconInstanceCount} 个 Icon 实例、${checkedReferenceCount} 个静态/动态 SVG 引用均符合尺寸、颜色与路径规范`)
