import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apiBase = (process.env.E2E_API_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const testPhone = `139${String(Date.now()).slice(-8)}`;
const password = 'E2ePatient!2026';
const createdIds = { relation: '', followUp: '', message: '' };
let patientId = '';
let inviteSnapshot: { id: string; useCount: number; status: any } | null = null;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers: { accept: 'application/json', ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function expectStatus(path: string, status: number, options: { method?: string; token?: string; body?: unknown } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method: options.method ?? 'GET',
    headers: { accept: 'application/json', ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  check(response.status === status, `Expected ${status} for ${path}, got ${response.status}: ${await response.text()}`);
}

async function cleanup() {
  if (!patientId) {
    patientId = (await prisma.user.findUnique({
      where: { phone_role: { phone: testPhone, role: 'PATIENT' } },
      select: { id: true },
    }))?.id ?? '';
  }
  if (createdIds.relation) await prisma.notification.deleteMany({ where: { relatedId: createdIds.relation } });
  if (createdIds.followUp) await prisma.notification.deleteMany({ where: { relatedId: createdIds.followUp } });
  if (createdIds.message) await prisma.notification.deleteMany({ where: { relatedId: createdIds.message } });
  if (patientId) {
    await prisma.message.deleteMany({ where: { OR: [{ senderId: patientId }, { receiverId: patientId }] } });
    await prisma.notification.deleteMany({ where: { userId: patientId } });
    await prisma.mediaAsset.deleteMany({ where: { ownerId: patientId } });
    await prisma.calorieEstimate.deleteMany({ where: { userId: patientId } });
    await prisma.healthRecord.deleteMany({ where: { patientId } });
    await prisma.patientTask.deleteMany({ where: { patientId } });
    await prisma.followUp.deleteMany({ where: { patientId } });
    await prisma.careRelation.deleteMany({ where: { patientId } });
    await prisma.refreshToken.deleteMany({ where: { userId: patientId } });
    await prisma.consent.deleteMany({ where: { userId: patientId } });
    await prisma.authIdentity.deleteMany({ where: { userId: patientId } });
    const resourceIds = [patientId, createdIds.relation, createdIds.followUp, createdIds.message].filter(Boolean);
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: patientId }, { resourceId: { in: resourceIds } }] } });
    await prisma.patientProfile.deleteMany({ where: { userId: patientId } });
    await prisma.user.deleteMany({ where: { id: patientId } });
  }
  await prisma.smsChallenge.deleteMany({ where: { phone: testPhone } });
  if (inviteSnapshot) await prisma.careInvite.update({ where: { id: inviteSnapshot.id }, data: { useCount: inviteSnapshot.useCount, status: inviteSnapshot.status } });
}

async function main() {
  const doctorSession = await request('/auth/login', { method: 'POST', body: { phone: '13800000001', role: 'DOCTOR', password: process.env.SEED_DEMO_PASSWORD ?? 'WeightCareDemo!2026' } });
  const doctorToken = doctorSession.accessToken as string;
  const doctorId = doctorSession.user.id as string;
  check(doctorToken && doctorSession.user.role === 'DOCTOR', 'Doctor login failed');

  const challenge = await request('/auth/sms/send', { method: 'POST', body: { phone: testPhone, purpose: 'REGISTER' } });
  check(challenge.challengeId && challenge.debugCode, 'Test SMS challenge did not expose a debug code');
  const patientSession = await request('/auth/register', {
    method: 'POST',
    body: {
      phone: testPhone,
      password,
      displayName: '跨端验收临时患者',
      role: 'PATIENT',
      challengeId: challenge.challengeId,
      code: challenge.debugCode,
      acceptedTerms: true,
      gender: 'FEMALE',
      heightCm: 165,
      targetWeightKg: 62,
    },
  });
  const patientToken = patientSession.accessToken as string;
  patientId = patientSession.user.id as string;
  check(patientId && patientToken, 'Patient registration failed');

  const before = await request(`/clinical/patients?search=${testPhone}`, { token: doctorToken });
  check(before.total === 0, 'Patient appeared before confirming the invite');
  const invite = await prisma.careInvite.findFirstOrThrow({ where: { practitionerId: doctorId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  inviteSnapshot = { id: invite.id, useCount: invite.useCount, status: invite.status };
  const preview = await request(`/care/invites/${encodeURIComponent(invite.code)}`);
  check(preview.practitioner.id === doctorId, 'Invite preview returned the wrong practitioner');
  const relation = await request(`/care/invites/${encodeURIComponent(invite.code)}/bind`, { method: 'POST', token: patientToken, body: {} });
  createdIds.relation = relation.id;
  const after = await request(`/clinical/patients?search=${testPhone}`, { token: doctorToken });
  check(after.total === 1 && after.items[0].id === patientId, 'Patient did not appear after binding');

  await request('/health-records', { method: 'POST', token: patientToken, body: { recordType: 'WEIGHT', recordedAt: new Date().toISOString(), weightKg: 70.4 } });
  await request('/health-records', { method: 'POST', token: patientToken, body: { recordType: 'DIET', recordedAt: new Date().toISOString(), mealType: 'SNACK', mealItems: [{ name: '苹果', weightGrams: 180, caloriesKcal: 95 }], caloriesKcal: 95 } });
  const report = await request('/reports?range=7d', { token: patientToken });
  check(report.currentWeightKg === 70.4, 'Weight report did not use the persisted record');
  check(report.diet.meals.SNACK.length === 1, 'Snack record was dropped from the report');
  const patientDetail = await request(`/clinical/patients/${patientId}`, { token: doctorToken });
  check(patientDetail.currentWeightKg === 70.4, 'Practitioner could not see the patient record');

  const followResult = await request('/follow-ups', { method: 'POST', token: doctorToken, body: { patientIds: [patientId], followType: 'WEIGHT', priority: 'NORMAL', scheduledAt: new Date(Date.now() + 3_600_000).toISOString(), note: '真实闭环随访' } });
  const follow = followResult.items?.[0];
  check(follow?.id, 'Follow-up creation did not return an item');
  createdIds.followUp = follow.id;
  await request(`/follow-ups/${follow.id}/start`, { method: 'POST', token: doctorToken, body: {} });
  await request(`/follow-ups/${follow.id}/complete`, { method: 'POST', token: patientToken, body: { result: { weightKg: 69.8 }, summary: '患者已提交' } });
  await request(`/follow-ups/${follow.id}/complete`, { method: 'POST', token: patientToken, body: { result: { weightKg: 69.8 }, summary: '幂等重试' } });
  const records = await request('/health-records?recordType=WEIGHT&pageSize=100', { token: patientToken });
  check(records.items.filter((item: any) => item.source === 'FOLLOW_UP').length === 1, 'Repeated completion created duplicate weight records');

  const message = await request('/messages', { method: 'POST', token: doctorToken, body: { receiverId: patientId, content: '请继续保持记录', messageType: 'TEXT', relatedType: 'FOLLOW_UP', relatedId: follow.id } });
  createdIds.message = message.id;
  const unread = await request('/messages/unread-count', { token: patientToken });
  check(unread.count === 1, 'Unread message count was not updated');
  const item = await request(`/messages/item/${message.id}`, { token: patientToken });
  check(item.id === message.id && item.contextId === follow.id, 'Message deep link lost its context');
  const notifications = await request('/notifications?pageSize=100', { token: patientToken });
  check(notifications.items.some((notice: any) => notice.type === 'MESSAGE' && notice.relatedId === message.id), 'Message notification did not link to the message id');
  await request('/messages/read', { method: 'PATCH', token: patientToken, body: { peerId: doctorId } });
  check((await request('/messages/unread-count', { token: patientToken })).count === 0, 'Read state was not persisted');

  await request(`/care/doctors/${doctorId}`, { method: 'DELETE', token: patientToken, body: { reason: '自动验收清理' } });
  await expectStatus('/messages', 403, { method: 'POST', token: doctorToken, body: { receiverId: patientId, content: '解绑后不应发送', messageType: 'TEXT' } });
  console.log('E2E smoke passed: auth -> preview/bind -> records/report -> follow-up -> message/notification -> unbind authorization.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await cleanup().catch((error) => { console.error('Cleanup failed', error); process.exitCode = 1; });
  await prisma.$disconnect();
});
