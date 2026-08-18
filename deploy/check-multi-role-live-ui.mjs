import { chromium } from '../apps/patient-mobile/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  await page.goto('https://kxjz.hzmwmt.cn/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '医生 / 营养师' }).click();
  const roleSelect = page.locator('select[name="role"]');
  await roleSelect.waitFor({ state: 'visible' });
  assert(await roleSelect.locator('option').allTextContents().then((values) => values.join(',')) === '医生,营养师', '医护后台登录身份选项不完整');

  await page.goto('https://kxjz.hzmwmt.cn/h5/#/pages/login/login', { waitUntil: 'networkidle' });
  await page.getByText('医生/营养师', { exact: true }).click();
  const practitionerOptions = page.locator('.practitioner-role-option');
  await practitionerOptions.first().waitFor({ state: 'visible' });
  assert(await practitionerOptions.allTextContents().then((values) => values.join(',')) === '医生,营养师', 'H5 登录身份选项不完整');
  await practitionerOptions.getByText('营养师', { exact: true }).click();
  assert(await practitionerOptions.getByText('营养师', { exact: true }).evaluate((element) => element.classList.contains('active')), 'H5 无法选中营养师身份');
  const loginWidth = await page.locator('.login-container').evaluate((element) => element.getBoundingClientRect().width);
  assert(loginWidth <= 430, `H5 桌面宽度超出手机效果限制：${loginWidth}`);

  await page.getByText('忘记密码？', { exact: true }).click();
  await page.getByText('重置账号身份', { exact: true }).waitFor({ state: 'visible' });
  const resetOptions = page.locator('.identity-option');
  assert(await resetOptions.count() >= 2, '找回密码页缺少身份选择');
  await page.screenshot({ path: 'multi-role-live-qa.png', fullPage: true });

  console.log(JSON.stringify({
    adminRoles: ['医生', '营养师'],
    h5Roles: ['医生', '营养师'],
    resetIdentitySelector: true,
    desktopMobileWidth: loginWidth,
  }));
} finally {
  await browser.close();
}
