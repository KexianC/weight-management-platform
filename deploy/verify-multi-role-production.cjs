const { createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const apiBase = 'http://127.0.0.1:3000/api/v1';
const phone = `139${String(Date.now()).slice(-8)}`;
const password = 'MultiRoleAcceptance!2026';
const code = '246810';

async function request(path, body) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function challenge() {
  const pepper = process.env.SMS_CODE_PEPPER;
  if (!pepper) throw new Error('SMS_CODE_PEPPER is not configured');
  return prisma.smsChallenge.create({
    data: {
      phone,
      purpose: 'REGISTER',
      codeHash: createHash('sha256').update(`${phone}:REGISTER:${code}:${pepper}`).digest('hex'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

async function register(role, displayName) {
  const sms = await challenge();
  const body = {
    phone,
    password,
    displayName,
    role,
    challengeId: sms.id,
    code,
    acceptedTerms: true,
  };
  if (role !== 'PATIENT') {
    const inviteCode = String(process.env.PRACTITIONER_REGISTRATION_CODES || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)[0];
    if (!inviteCode) throw new Error('Practitioner self-registration is not configured');
    body.practitionerInviteCode = inviteCode;
  }
  const result = await request('/auth/register', body);
  if (result.status !== 201) {
    throw new Error(`Registration for ${role} failed with HTTP ${result.status}`);
  }
  return result.payload;
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone }, select: { id: true } });
  const ids = users.map((user) => user.id);
  if (ids.length) {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: ids } }, { resourceId: { in: ids } }] },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.consent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.patientProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.practitionerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.smsChallenge.deleteMany({ where: { phone } });
}

async function main() {
  await cleanup();
  try {
    const patient = await register('PATIENT', '多身份验收患者');
    const nutritionist = await register('NUTRITIONIST', '多身份验收营养师');
    const patientLogin = await request('/auth/login', { phone, password, role: 'PATIENT' });
    const nutritionistLogin = await request('/auth/login', { phone, password, role: 'NUTRITIONIST' });
    const ambiguousLogin = await request('/auth/login', { phone, password });
    const accounts = await prisma.user.findMany({
      where: { phone },
      select: { role: true },
      orderBy: { role: 'asc' },
    });
    const indexes = await prisma.$queryRawUnsafe('SHOW INDEX FROM `User`');
    const compositeIndex = indexes
      .filter((row) => row.Key_name === 'User_phone_role_key')
      .sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index))
      .map((row) => String(row.Column_name));

    if (patient.user?.role !== 'PATIENT' || nutritionist.user?.role !== 'NUTRITIONIST') {
      throw new Error('Registration returned the wrong role');
    }
    if (patientLogin.status !== 201 || patientLogin.payload?.user?.role !== 'PATIENT') {
      throw new Error('Patient role login failed');
    }
    if (nutritionistLogin.status !== 201 || nutritionistLogin.payload?.user?.role !== 'NUTRITIONIST') {
      throw new Error('Nutritionist role login failed');
    }
    if (ambiguousLogin.status !== 400) throw new Error('Ambiguous legacy login was not rejected');
    if (accounts.length !== 2) throw new Error('Expected two role accounts for one phone');
    if (compositeIndex.join(',') !== 'phone,role') throw new Error('Composite unique index is missing');

    console.log(JSON.stringify({
      registeredRoles: accounts.map((account) => account.role),
      patientLoginStatus: patientLogin.status,
      nutritionistLoginStatus: nutritionistLogin.status,
      ambiguousLoginStatus: ambiguousLogin.status,
      compositeUniqueIndex: compositeIndex,
    }));
  } finally {
    await cleanup();
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    await prisma.$disconnect();
    process.exit(1);
  });
