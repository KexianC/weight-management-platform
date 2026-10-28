import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const login = read('src/pages/login/login.vue')
const register = read('src/pages/register/register.vue')
const forgotPassword = read('src/pages/forgot-password/forgot-password.vue')
const pages = read('src/pages.json')
const api = read('src/utils/api.js')
const store = read('src/store/index.js')
const doctorHome = read('src/pages/doctor/index.vue')
const violations = []

const requireText = (content, snippet, message) => {
  if (!content.includes(snippet)) violations.push(message)
}

const forbidText = (content, snippet, message) => {
  if (content.includes(snippet)) violations.push(message)
}

requireText(login, 'staffLoginOptions', '工作人员登录必须提供岗位选择');
const staffModel=read('src/utils/staff-role-model.js');
for(const role of ['practitioner','DOCTOR','NUTRITIONIST','HEALTH_MANAGER','EXERCISE_COACH'])requireText(staffModel,"value: '"+role+"'",'岗位选择必须覆盖 '+role)
requireText(login, 'class="staff-entry-button"', '必须保留底部工作人员入口')
requireText(login, "selectedRole: 'patient'", '登录必须默认客户角色')
requireText(login, "selectRole(selectedRole === 'patient' ? 'doctor' : 'patient')", '工作人员入口必须支持返回客户身份')
requireText(register, '<text class="role-text">医生/营养师</text>', '注册页从业者入口必须显示“医生/营养师”')
requireText(register, "practitionerRole: 'doctor'", '注册页必须保留医生/营养师子角色状态')
requireText(register, "role: this.selectedRole === 'doctor' ? this.practitionerRole : 'patient'", '注册请求必须提交真实医生/营养师角色')
requireText(login, "return this.selectedRole === 'doctor' ? this.staffRoleChoice : 'patient'", '岗位选择必须提交对应账号身份')
requireText(forgotPassword, '重置账号身份', '找回密码页必须让用户选择要重置的身份账号')
requireText(forgotPassword, "return this.selectedRole === 'doctor' ? 'practitioner' : 'patient'", '从业者重置密码不得区分医生和营养师')
requireText(api, "if (value === 'nutritionist') return 'NUTRITIONIST'", 'API 必须支持 NUTRITIONIST 请求映射')
requireText(api, "'/auth/practitioner-login'", '密码登录必须使用统一从业者接口')
requireText(api, "'/auth/practitioner-sms-login'", '短信登录必须使用统一从业者接口')
requireText(api, "'/auth/practitioner-password/reset'", '从业者重置密码必须使用统一接口')
requireText(api, 'backendRole,', '用户适配器必须保留后端真实角色')
requireText(store, "['DOCTOR', 'NUTRITIONIST', 'PRACTITIONER'].includes(rawRole)", 'Store 必须把营养师归入从业者工作台')
requireText(doctorHome, "userInfo.backendRole === 'NUTRITIONIST' ? '营养师' : '医生'", '工作台必须按真实角色显示医生或营养师')

forbidText(login, '<text class="role-text">医生</text>', '登录页仍存在旧的单一医生入口')
forbidText(login, 'practitioner-role-options', '登录页仍要求选择医生或营养师')
forbidText(login, "practitionerRole: 'doctor'", '登录页仍保留医生/营养师子角色状态')
forbidText(forgotPassword, 'identity-sub-options', '找回密码页仍要求选择医生或营养师')
forbidText(register, '<text class="role-text">医生</text>', '注册页仍存在旧的单一医生入口')
forbidText(pages, '"navigationBarTitleText": "医生首页"', '页面标题仍使用旧的“医生首页”')
forbidText(pages, '"navigationBarTitleText": "医生工作台"', '页面标题仍使用旧的“医生工作台”')

if (violations.length) {
  console.error(`角色契约检查失败（${violations.length} 项）：`)
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('角色契约检查通过：默认客户登录、工作人员岗位选择、统一医生营养师兼容及注册执业身份')
