import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const login = readFileSync(resolve(import.meta.dirname, '..', 'src/pages/login/login.vue'), 'utf8')
const blocks = [...login.matchAll(/<!-- #ifdef MP-WEIXIN -->([\s\S]*?)<!-- #endif -->/g)].map(match => match[1])
const phoneButtons = blocks.filter(block => /open-type="getPhoneNumber"/.test(block))
assert.equal(phoneButtons.length, 1, 'Exactly one native phone-authorization button must be in a WeChat-only block')
assert.match(phoneButtons[0], /@getphonenumber="handleWechatPhoneLogin"/)
const h5Template = login.slice(0, login.indexOf('</template>')).replace(/<!-- #ifdef MP-WEIXIN -->[\s\S]*?<!-- #endif -->/g, '')
assert.doesNotMatch(h5Template, /open-type="getPhoneNumber"|@getphonenumber=/, 'H5 must not render a native phone authorization button')
assert.match(h5Template, /loginType/)
assert.doesNotMatch(login, /@tap="handleWechatLogin"|@getphonenumber="handleWechatPhoneBinding"/, 'Obsolete two-stage account binding must not be rendered')
console.log('H5 auth platform checks PASS: password/SMS retained; single phone authorization is WeChat-only')
