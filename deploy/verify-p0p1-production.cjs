const { PrismaClient } = require('@prisma/client')
const argon2 = require('argon2')

const prisma = new PrismaClient()
const apiBase = process.env.ACCEPTANCE_API_BASE || 'https://kxjzapi.hzmwmt.cn/api/v1'
const suffix = String(Date.now()).slice(-8)
const doctorPhone = `196${suffix}`
const patientPhone = `195${suffix}`
const password = 'P0P1Acceptance!2026'
let doctor
let patient

async function request(path, { method = 'GET', token, body, raw = false } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      accept: raw ? 'image/png' : 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (raw) return { response, bytes: Buffer.from(await response.arrayBuffer()) }
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

function ensure(condition, message) {
  if (!condition) throw new Error(message)
}

async function cleanup() {
  const ids = [doctor?.id, patient?.id].filter(Boolean)
  if (!ids.length) return
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } })
  await prisma.followUp.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { practitionerId: { in: ids } }] } })
  await prisma.healthRecord.deleteMany({ where: { patientId: { in: ids } } })
  await prisma.careRelation.deleteMany({ where: { OR: [{ patientId: { in: ids } }, { practitionerId: { in: ids } }] } })
  await prisma.careInvite.deleteMany({ where: { practitionerId: { in: ids } } })
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } })
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { resourceId: { in: ids } }] } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
}

async function verifyCleanup() {
  const [users, records] = await Promise.all([
    prisma.user.count({ where: { displayName: { startsWith: 'P0P1验收' } } }),
    prisma.healthRecord.count({ where: { source: 'PRODUCTION_ACCEPTANCE', patient: { displayName: { startsWith: 'P0P1验收' } } } }),
  ])
  ensure(users === 0 && records === 0, `验收数据清理不完整：users=${users}, records=${records}`)
  console.log(JSON.stringify({ cleanupVerified: true, acceptanceUsers: users, acceptanceRecords: records }))
}

async function main() {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  doctor = await prisma.user.create({
    data: {
      phone: doctorPhone,
      passwordHash,
      displayName: 'P0P1验收医生',
      role: 'DOCTOR',
      practitionerProfile: { create: { hospital: '生产验收医院', department: '体重管理科', verifiedAt: new Date() } },
    },
  })
  patient = await prisma.user.create({
    data: {
      phone: patientPhone,
      passwordHash,
      displayName: 'P0P1验收患者',
      role: 'PATIENT',
      patientProfile: { create: { heightCm: 165, targetWeightKg: 65, initialWeightKg: 72 } },
    },
  })
  await prisma.careRelation.create({
    data: { patientId: patient.id, practitionerId: doctor.id, status: 'ACTIVE', bindMethod: 'PRODUCTION_ACCEPTANCE' },
  })

  const now = new Date()
  await prisma.healthRecord.createMany({
    data: [
      { patientId: patient.id, recordType: 'WEIGHT', weightKg: 71, measuredAt: new Date(now.getTime() - 86_400_000), source: 'PRODUCTION_ACCEPTANCE' },
      { patientId: patient.id, recordType: 'WEIGHT', weightKg: 70, measuredAt: now, source: 'PRODUCTION_ACCEPTANCE' },
      { patientId: patient.id, recordType: 'DIET', mealType: 'SNACK', caloriesKcal: 420, mealItems: [{ name: '验收加餐', caloriesKcal: 420 }], measuredAt: now, source: 'PRODUCTION_ACCEPTANCE' },
    ],
  })
  await prisma.followUp.createMany({
    data: [
      { patientId: patient.id, practitionerId: doctor.id, type: 'GENERAL', status: 'SCHEDULED', scheduledAt: new Date(now.getTime() + 10 * 60_000), note: '区间内验收随访' },
      { patientId: patient.id, practitionerId: doctor.id, type: 'GENERAL', status: 'SCHEDULED', scheduledAt: new Date(now.getTime() + 7 * 86_400_000), note: '区间外验收随访' },
    ],
  })

  const doctorLogin = await request('/auth/practitioner-login', { method: 'POST', body: { phone: doctorPhone, password } })
  const patientLogin = await request('/auth/login', { method: 'POST', body: { phone: patientPhone, password, role: 'PATIENT' } })
  ensure(doctorLogin.response.ok && doctorLogin.payload?.accessToken, '医生登录失败')
  ensure(patientLogin.response.ok && patientLogin.payload?.accessToken && patientLogin.payload?.refreshToken, '患者登录失败')

  const report = await request('/reports?range=7d', { token: patientLogin.payload.accessToken })
  ensure(report.response.ok, `健康报告失败：${report.response.status}`)
  ensure(Number(report.payload?.targetWeightKg) === 65, '报告未使用真实目标体重')
  ensure(Number(report.payload?.nutrition?.totalCaloriesKcal) === 420, '报告营养总量不正确')
  ensure(report.payload?.diet?.meals?.SNACK?.length === 1, '报告缺少加餐记录')

  const detail = await request(`/care/patients/${patient.id}`, { token: doctorLogin.payload.accessToken })
  ensure(detail.response.ok && Array.isArray(detail.payload?.healthRecords) && Array.isArray(detail.payload?.followUps), '医护患者详情失败')

  const startAt = new Date(now.getTime() - 60 * 60_000).toISOString()
  const endAt = new Date(now.getTime() + 60 * 60_000).toISOString()
  const stats = await request(`/follow-ups/stats?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`, { token: doctorLogin.payload.accessToken })
  ensure(stats.response.ok && Number(stats.payload?.SCHEDULED) === 1, `随访区间统计不正确：${JSON.stringify(stats.payload)}`)

  const invite = await request('/care/invites', { method: 'POST', token: doctorLogin.payload.accessToken, body: { validDays: 1, forceNew: true } })
  ensure(invite.response.ok && invite.payload?.code, '生成绑定码失败')
  const qr = await request(`/care/invites/${encodeURIComponent(invite.payload.code)}/qr`, { raw: true })
  ensure(qr.response.ok && qr.response.headers.get('content-type')?.startsWith('image/png'), '自有二维码接口未返回 PNG')
  ensure(qr.bytes.length > 8 && qr.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), '二维码 PNG 文件头无效')

  const refreshed = await request('/auth/refresh', { method: 'POST', body: { refreshToken: patientLogin.payload.refreshToken } })
  ensure(refreshed.response.ok && refreshed.payload?.accessToken !== patientLogin.payload.accessToken && refreshed.payload?.refreshToken !== patientLogin.payload.refreshToken, '刷新令牌未轮换')
  const logout = await request('/auth/logout', { method: 'POST', token: refreshed.payload.accessToken, body: { refreshToken: refreshed.payload.refreshToken } })
  ensure(logout.response.ok, '服务端退出失败')
  const reused = await request('/auth/refresh', { method: 'POST', body: { refreshToken: refreshed.payload.refreshToken } })
  ensure(reused.response.status === 401, '退出后的刷新令牌仍可使用')

  console.log(JSON.stringify({
    passed: true,
    patientDetail: true,
    reportUsesBackendTargets: true,
    snackIncluded: true,
    weeklyFollowUpFilter: true,
    ownedQrPng: true,
    refreshRotation: true,
    logoutRevocation: true,
  }))
}

main()
  .then(async () => {
    await cleanup()
    await verifyCleanup()
  })
  .catch(async (error) => {
    console.error(error)
    await cleanup().catch((cleanupError) => console.error('cleanup failed', cleanupError))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
