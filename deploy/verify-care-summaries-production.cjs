const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();
const baseUrl = 'http://127.0.0.1:3000/api/v1';
const suffix = String(Date.now()).slice(-8);
const doctorPhone = `197${suffix}`;
const patientPhone = `198${suffix}`;
const password = 'CareSummaryQA!2026';
let doctor;
let patient;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function cleanup() {
  const userIds = [doctor?.id, patient?.id].filter(Boolean);
  if (!userIds.length) return;
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { resourceId: { in: userIds } }] } });
  if (patient?.id) {
    await prisma.notification.deleteMany({ where: { userId: patient.id } });
    await prisma.careSummary.deleteMany({ where: { patientId: patient.id } });
    await prisma.patientTask.deleteMany({ where: { patientId: patient.id } });
    await prisma.healthRecord.deleteMany({ where: { patientId: patient.id } });
    await prisma.careRelation.deleteMany({ where: { patientId: patient.id } });
  }
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  doctor = await prisma.user.create({
    data: {
      phone: doctorPhone, passwordHash, displayName: '周期总结验收医生', role: 'DOCTOR',
      practitionerProfile: { create: { hospital: '生产验收医院', department: '体重管理科', title: '验收医师', verifiedAt: new Date() } },
    },
  });
  patient = await prisma.user.create({
    data: {
      phone: patientPhone, passwordHash, displayName: '周期总结验收患者', role: 'PATIENT',
      patientProfile: { create: { heightCm: 170, targetWeightKg: 65, initialWeightKg: 72 } },
    },
  });
  await prisma.careRelation.create({ data: { patientId: patient.id, practitionerId: doctor.id, status: 'ACTIVE', bindMethod: 'PRODUCTION_ACCEPTANCE' } });
  const now = new Date();
  const earlier = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await prisma.healthRecord.createMany({ data: [
    { patientId: patient.id, recordType: 'WEIGHT', weightKg: 72, measuredAt: earlier, source: 'PRODUCTION_ACCEPTANCE' },
    { patientId: patient.id, recordType: 'WEIGHT', weightKg: 70.8, measuredAt: now, source: 'PRODUCTION_ACCEPTANCE' },
    { patientId: patient.id, recordType: 'DIET', caloriesKcal: 1380, measuredAt: now, source: 'PRODUCTION_ACCEPTANCE' },
    { patientId: patient.id, recordType: 'EXERCISE', measuredAt: now, source: 'PRODUCTION_ACCEPTANCE' },
  ] });
  await prisma.patientTask.createMany({ data: [
    { patientId: patient.id, assignedById: doctor.id, taskType: 'WEIGHT', title: '验收已完成任务', status: 'COMPLETED', completedAt: now },
    { patientId: patient.id, assignedById: doctor.id, taskType: 'DIET', title: '验收待完成任务', status: 'PENDING' },
  ] });

  const doctorSession = await request('/auth/practitioner-login', { method: 'POST', body: { phone: doctorPhone, password } });
  const patientSession = await request('/auth/login', { method: 'POST', body: { phone: patientPhone, password, role: 'PATIENT' } });
  const doctorHeaders = { authorization: `Bearer ${doctorSession.accessToken}` };
  const patientHeaders = { authorization: `Bearer ${patientSession.accessToken}` };
  const referenceDate = now.toISOString().slice(0, 10);
  const first = await request(`/clinical/patients/${patient.id}/care-summaries`, {
    method: 'POST', headers: doctorHeaders,
    body: { periodType: 'WEEKLY', referenceDate, comment: '生产验收首次点评：本周记录完整，请继续保持。' },
  });
  const updated = await request(`/clinical/patients/${patient.id}/care-summaries`, {
    method: 'POST', headers: doctorHeaders,
    body: { periodType: 'WEEKLY', referenceDate, comment: '生产验收更新点评：体重下降趋势平稳，请继续保持。' },
  });
  const summaries = await request('/care-summaries', { headers: patientHeaders });
  const notifications = await request('/notifications?pageSize=20', { headers: patientHeaders });
  const summary = summaries.find((item) => item.id === first.id);
  const notification = notifications.items.find((item) => item.relatedType === 'CARE_SUMMARY' && item.relatedId === first.id);
  if (first.id !== updated.id) throw new Error('同一医护同一周期产生了重复总结');
  if (!summary || summary.comment !== '生产验收更新点评：体重下降趋势平稳，请继续保持。') throw new Error('患者未读取到更新后的医护点评');
  if (summary.metrics.weightChangeKg !== -1.2 || summary.metrics.dietRecordCount !== 1 || summary.metrics.exerciseRecordCount !== 1) throw new Error(`统计指标不正确：${JSON.stringify(summary.metrics)}`);
  if (summary.metrics.taskCount !== 2 || summary.metrics.completedTaskCount !== 1) throw new Error(`任务统计不正确：${JSON.stringify(summary.metrics)}`);
  if (!notification || notification.actionPath !== '/pages/patient/report') throw new Error('患者通知或深链缺失');
  console.log(JSON.stringify({
    passed: true,
    samePeriodUpdatedInPlace: true,
    patientCanRead: true,
    metrics: summary.metrics,
    notification: { relatedType: notification.relatedType, actionPath: notification.actionPath },
  }));
}

main()
  .then(cleanup)
  .catch(async (error) => { console.error(error); await cleanup().catch((cleanupError) => console.error('cleanup failed', cleanupError)); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
