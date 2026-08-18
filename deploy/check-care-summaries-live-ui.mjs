import { chromium } from '../apps/patient-mobile/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ headless: true })
const summary = {
  id: 'summary-ui-1', patientId: 'patient-ui-1', practitionerId: 'doctor-ui-1', periodType: 'WEEKLY',
  periodStart: '2026-08-16T16:00:00.000Z', periodEnd: '2026-08-22T16:00:00.000Z',
  metrics: { weightChangeKg: -1.2, dietRecordCount: 6, exerciseRecordCount: 3, taskCount: 4, completedTaskCount: 3 },
  comment: '本周体重下降节奏平稳，饮食记录完整。建议继续保持当前运动频率，并注意蛋白质摄入。',
  publishedAt: '2026-08-18T12:00:00.000Z',
  practitioner: { id: 'doctor-ui-1', displayName: '陈医生', role: 'DOCTOR', title: '主任医师' },
}
const patient = {
  id: 'patient-ui-1', displayName: '验收患者', phone: '13800000000', gender: 'FEMALE', age: 35,
  heightCm: 165, currentWeightKg: 68.8, targetWeightKg: 62, bmi: 25.3, adherencePct: 86,
  healthRecords: [], receivedTasks: [], archiveStatus: 'COMPLETED', archiveCompletionPercent: 100,
}
const json = (route, value) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })

try {
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await admin.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (path.endsWith('/clinical/patients/patient-ui-1/care-summaries')) return json(route, route.request().method() === 'POST' ? summary : [summary])
    if (path.endsWith('/clinical/patients/patient-ui-1/archive')) return json(route, null)
    if (path.includes('/clinical/patients/patient-ui-1/records')) return json(route, [])
    if (path.endsWith('/clinical/patients/patient-ui-1')) return json(route, patient)
    if (path.endsWith('/clinical/patients')) return json(route, { items: [patient], total: 1 })
    if (path.endsWith('/clinical/summary')) return json(route, { totalPatients: 1, averageAdherencePct: 86 })
    if (path.endsWith('/follow-ups')) return json(route, { items: [], total: 0 })
    if (path.includes('/messages/conversations')) return json(route, { items: [], total: 0 })
    if (path.endsWith('/notifications')) return json(route, { items: [], total: 0 })
    return json(route, {})
  })
  await admin.addInitScript(() => {
    localStorage.setItem('weightcare_access_token', 'visual-qa-token')
    localStorage.setItem('weightcare_user', JSON.stringify({ id: 'doctor-ui-1', displayName: '陈医生', role: 'DOCTOR', department: '体重管理科' }))
  })
  await admin.goto('https://kxjz.hzmwmt.cn/', { waitUntil: 'networkidle' })
  await admin.getByRole('button', { name: '患者管理' }).click()
  await admin.getByRole('button').filter({ hasText: '验收患者' }).first().click()
  await admin.getByRole('heading', { name: '周期总结与医护点评' }).waitFor()
  await admin.getByText('本周体重下降节奏平稳，饮食记录完整。建议继续保持当前运动频率，并注意蛋白质摄入。').waitFor()
  await admin.getByRole('button', { name: '发布周/月总结' }).click()
  await admin.getByRole('heading', { name: '给 验收患者 发布总结' }).waitFor()
  await admin.getByLabel('医护点评').fill('继续保持当前体重管理计划。')
  await admin.screenshot({ path: 'apps/clinician-admin/care-summary-live-qa.png', fullPage: true })

  const h5 = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await h5.route('**/api/v1/**', (route) => json(route, route.request().url().includes('/care-summaries') ? [summary] : []))
  await h5.addInitScript(() => {
    localStorage.setItem('token', 'visual-qa-token')
    localStorage.setItem('userInfo', JSON.stringify({ userId: 'patient-ui-1', id: 'patient-ui-1', displayName: '验收患者', role: 'patient' }))
    localStorage.setItem('patientReportTab', 'summary')
  })
  await h5.goto('https://kxjz.hzmwmt.cn/h5/#/pages/patient/report', { waitUntil: 'networkidle' })
  await h5.getByText('我的医护总结', { exact: true }).waitFor()
  await h5.getByText('医护点评', { exact: true }).waitFor()
  const width = await h5.locator('.container').evaluate((element) => element.getBoundingClientRect().width)
  if (width > 430) throw new Error(`H5 桌面宽度超出手机效果限制：${width}`)
  await h5.screenshot({ path: 'apps/mini-program/care-summary-live-qa.png', fullPage: true })
  console.log(JSON.stringify({ passed: true, adminPublishModal: true, patientSummaryView: true, desktopMobileWidth: width }))
} finally {
  await browser.close()
}
