import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, '..', 'src');
const read = (relativePath) => fs.readFileSync(path.join(src, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Business logic contract failed: ${message}`);
    process.exit(1);
  }
};

const report = read('pages/patient/report.vue');
const record = read('pages/patient/record.vue');
const dashboard = read('pages/doctor/dashboard.vue');
const doctorHome = read('pages/doctor/index.vue');
const login = read('pages/login/login.vue');
const patientFollow = read('pages/patient/follow.vue');
const api = read('utils/api.js');
const store = read('store/index.js');

assert(report.includes('getHealthReports'), 'patient report must use the backend report contract');
assert(report.includes("snack: {"), 'patient report must render snack records');
assert(!report.includes('targetCalories: 1800'), 'patient report must not contain a fabricated calorie target');
assert(!report.includes('height: 170'), 'patient report must not contain a fabricated height fallback');
assert(record.includes('height: null // 仅使用用户资料中的真实身高'), 'patient record entry must not contain a fabricated height fallback');
assert(!report.includes('currentWeight - 5'), 'patient report must not fabricate a target weight');
assert(!report.includes("createTime.split(' ')"), 'record dates must be parsed safely');

assert(dashboard.includes('stats.activePatients'), 'dashboard must use the backend active-patient total');
assert(dashboard.includes('stats.attentionPatients'), 'dashboard must use the backend attention total');
assert(api.includes('startAt: params.startAt || params.startDate'), 'follow-up statistics must forward date filters');
assert(api.includes("joinUrl('/auth/refresh')"), 'expired access tokens must be refreshed');
assert(api.includes('_authRetried'), 'refreshed requests must be retried at most once');
assert(store.includes("removeStorageSync('refreshToken')"), 'logout must clear the refresh token');

assert(doctorHome.includes('getInviteQrUrl'), 'invite QR images must come from the owned API');
assert(!doctorHome.includes('api.pwmqr.com') && !doctorHome.includes('api.cl2wm.cn'), 'invite data must not be sent to third-party QR services');
assert(!doctorHome.includes('绑定码永久有效'), 'invite expiry copy must match the backend expiry');
assert(!doctorHome.includes('+5.2% 提升'), 'dashboard must not display a fabricated improvement');

assert(!login.includes('open-type="getPhoneNumber"'), 'existing WeChat login must not require phone permission');
assert(!login.includes('onGetPhoneNumber'), 'WeChat login must use the backend first-login verification flow');
assert(patientFollow.includes("ongoing: '进行中'"), 'patient follow-up status must recognize ongoing');

console.log('Business logic contract passed (P0/P1 regression guards active).');
