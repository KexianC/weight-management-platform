import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'src');
const config = JSON.parse(fs.readFileSync(path.join(root, 'pages.json'), 'utf8'));
const missing = config.pages.filter((page) => !fs.existsSync(path.join(root, `${page.path}.vue`))).map((page) => page.path);
if (missing.length) {
  console.error(`Missing page files: ${missing.join(', ')}`);
  process.exit(1);
}
const required = [
  'pages/login/login', 'pages/register/register', 'pages/patient/index', 'pages/patient/record',
  'pages/patient/report', 'pages/patient/follow', 'pages/patient/profile', 'pages/patient-bind/patient-bind',
  'pages/doctor/index', 'pages/doctor/dashboard', 'pages/doctor/patients', 'pages/doctor/patient-detail', 'pages/doctor/follow',
  'pages/doctor/follow-add', 'pages/common/messages', 'pages/forgot-password/forgot-password',
];
const declared = new Set(config.pages.map((page) => page.path));
const absent = required.filter((route) => !declared.has(route));
if (absent.length) {
  console.error(`Missing required routes: ${absent.join(', ')}`);
  process.exit(1);
}
const tabRoutes = config.tabBar?.list?.map((item) => item.pagePath) || [];
if (tabRoutes.length !== 5 || !tabRoutes.includes('pages/patient/profile')) {
  console.error('Patient TabBar must contain five entries including pages/patient/profile.');
  process.exit(1);
}
console.log(`Route contract passed (${config.pages.length} pages, patient and doctor flows present).`);
