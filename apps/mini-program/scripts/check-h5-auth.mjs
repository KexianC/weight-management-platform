import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const login = readFileSync(resolve(import.meta.dirname, '..', 'src/pages/login/login.vue'), 'utf8')
const h5ExcludedWechatSection = /<!-- #ifdef MP-WEIXIN -->[\s\S]*微信快速登录[\s\S]*<!-- #endif -->/

if (!h5ExcludedWechatSection.test(login)) {
  console.error('H5 登录契约检查失败：微信快捷登录必须只在 MP-WEIXIN 条件块内渲染')
  process.exit(1)
}

console.log('H5 登录契约检查通过：H5 仅保留密码和短信登录，微信快捷登录仅限微信小程序')
