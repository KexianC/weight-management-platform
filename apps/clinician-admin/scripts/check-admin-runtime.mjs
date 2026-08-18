import { chromium } from '../../patient-mobile/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const baseUrl = process.env.ADMIN_PREVIEW_URL || 'http://127.0.0.1:4175/';
const screenshotPath = fileURLToPath(new URL('../admin-system-browser.png', import.meta.url));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const failures = [];
page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
page.on('response', (response) => {
  if (response.status() >= 400) failures.push(`${response.status()} ${response.request().method()} ${response.url()}`);
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '登录临床管理后台' }).waitFor();
  await page.getByRole('button', { name: '管理员' }).click();
  await page.getByRole('heading', { name: '登录系统管理后台' }).waitFor();
  await page.getByLabel('管理员账号').fill('admin');
  await page.getByLabel('密码').fill('admin123');
  await page.getByRole('button', { name: '安全登录' }).click();
  await page.getByRole('heading', { name: '管理概览' }).waitFor();
  await page.getByText('全部用户').first().waitFor();

  await page.getByRole('button', { name: '用户管理' }).click();
  await page.getByRole('heading', { name: '用户管理' }).waitFor();
  await page.getByText('系统管理员').first().waitFor();
  await page.getByText('admin', { exact: true }).first().waitFor();

  await page.getByRole('button', { name: '审计日志' }).click();
  await page.getByRole('heading', { name: '审计日志' }).waitFor();
  await page.getByText('操作审计').waitFor();
  await page.getByText('管理员登录').first().waitFor();

  await page.getByRole('button', { name: '管理概览' }).click();
  await page.getByRole('heading', { name: '管理概览' }).waitFor();
  await page.screenshot({ path: screenshotPath, fullPage: true });
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ passed: true, url: baseUrl, screenshotPath }, null, 2));
} finally {
  await browser.close();
}
