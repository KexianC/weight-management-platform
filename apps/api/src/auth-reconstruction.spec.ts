import 'reflect-metadata';
import { Controller, Get, INestApplication, Req, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, SmsPurpose, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { AuthController, AuthService, type Actor } from './auth';
import type { PrismaService } from './prisma.service';

// All fixtures are invented. No production database, SMS provider or WeChat service is used.
const PHONE = '19900000001';
const INITIAL_PASSWORD = 'FictionalInitial!23';
const NEW_PASSWORD = 'FictionalChosen!24';
const JWT_SECRET = 'fictional-local-auth-test-secret-at-least-32-characters';

function legacyHash(password: string) {
  const salt = 'fictional-auth-fixture-salt';
  return 'legacy-pbkdf2$1000$' + salt + '$' + pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

// Native HTTP avoids Fetch's forbidden-port list when Windows assigns an ephemeral test port.
function localRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; json: () => Promise<any> }>((resolve, reject) => {
    const request = httpRequest(url, { method: options.method, headers: options.headers }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (part) => { body += part; });
      response.on('end', () => resolve({ status: response.statusCode ?? 0, json: async () => JSON.parse(body) }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(options.body);
  });
}

function fixture(overrides: Record<string, unknown> = {}) {
  const user: any = {
    id: 'fictional-patient-1', phone: PHONE, email: null, displayName: '虚构客户', avatarUrl: null,
    role: UserRole.PATIENT, status: 'ACTIVE', passwordHash: legacyHash(INITIAL_PASSWORD),
    mustChangePassword: true, initialPasswordExpiresAt: new Date(Date.now() + 60_000), sessionVersion: 0,
    lastLoginAt: null, patientProfile: null, practitionerProfile: null, ...overrides,
  };
  const tokens: any[] = [];
  const audits: any[] = [];
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, expected]: [string, any]) => {
    if (expected && typeof expected === 'object' && 'gt' in expected) return row[key] > expected.gt;
    return row[key] === expected;
  });
  const prisma: any = {
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        const selected = where.id ? where.id === user.id : where.phone_role?.phone === user.phone && where.phone_role?.role === user.role;
        return selected ? { ...user } : null;
      }),
      findMany: jest.fn(async ({ where }: any) => where.phone === user.phone && where.role.in.includes(user.role) ? [{ ...user }] : []),
      update: jest.fn(async ({ where, data }: any) => {
        if (!matches(user, where)) throw new Prisma.PrismaClientKnownRequestError('stale fixture', { code: 'P2025', clientVersion: 'test' });
        for (const [key, value] of Object.entries(data) as [string, any][]) {
          if (value === undefined || key === 'authIdentities') continue;
          user[key] = value && typeof value === 'object' && 'increment' in value ? user[key] + value.increment : value;
        }
        return { ...user };
      }),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const token = { id: 'fictional-token-' + tokens.length, revokedAt: null, ...data };
        tokens.push(token);
        return { ...token };
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const token = tokens.find((entry) => entry.tokenHash === where.tokenHash);
        return token ? { ...token, user: { ...user } } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const token of tokens) if (matches(token, where)) { Object.assign(token, data); count += 1; }
        return { count };
      }),
    },
    auditLog: { create: jest.fn(async ({ data }: any) => { audits.push(data); return data; }) },
    authIdentity: { findUnique: jest.fn(async () => ({ user: { ...user } })) },
    consent: { findFirst: jest.fn(async () => ({ id: 'fictional-consent-1' })) },
  };
  prisma.$transaction = jest.fn(async (work: any) => typeof work === 'function' ? work(prisma) : Promise.all(work));
  const jwt = new JwtService();
  const service = new AuthService(prisma as PrismaService, jwt);
  const consume = jest.spyOn(service as any, 'consumeChallenge').mockResolvedValue(true);
  jest.spyOn(service as any, 'claimWechatPhoneCode').mockResolvedValue(undefined);
  jest.spyOn((service as any).wechatGateway, 'exchangePhoneCode').mockResolvedValue(PHONE);
  const previousFindMany = prisma.user.findMany.getMockImplementation();
  prisma.user.findMany.mockImplementation(async (query: any) => query.where.phone?.in ? (query.where.phone.in.includes(user.phone) && query.where.role === 'PATIENT' ? [{...user}] : []) : previousFindMany(query));
  jest.spyOn(service as any, 'exchangeWechatCode').mockResolvedValue({ openid: 'fictional-wechat-id' });
  const request = (token: string, method = 'GET', path = '/api/v1/auth/me') => ({
    headers: { authorization: 'Bearer ' + token }, method, originalUrl: path,
  }) as unknown as Request;
  const login = () => service.login({ phone: PHONE, password: INITIAL_PASSWORD, role: UserRole.PATIENT });
  return { user, tokens, audits, prisma, jwt, service, consume, request, login };
}

@Controller('fixture-business')
class ProtectedFixtureController {
  constructor(private readonly auth: AuthService) {}
  @Get()
  async protectedBusiness(@Req() req: Request) {
    await this.auth.actor(req);
    return { permitted: true };
  }
}

describe('reconstruction credential lifecycle and session revocation', () => {
  const savedSecret = process.env.JWT_ACCESS_SECRET;
  const savedIssuer = process.env.JWT_ISSUER;
  const savedAudience = process.env.JWT_AUDIENCE;
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = JWT_SECRET;
    process.env.JWT_ISSUER = 'fictional-auth-tests';
    process.env.JWT_AUDIENCE = 'fictional-auth-clients';
  });
  afterEach(() => {
    if (savedSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = savedSecret;
    if (savedIssuer === undefined) delete process.env.JWT_ISSUER; else process.env.JWT_ISSUER = savedIssuer;
    if (savedAudience === undefined) delete process.env.JWT_AUDIENCE; else process.env.JWT_AUDIENCE = savedAudience;
    jest.restoreAllMocks();
  });

  it('returns the initial credential deadline and restricted state without exposing password hashes', async () => {
    const f = fixture();
    const session = await f.login();
    expect(session.user.mustChangePassword).toBe(true);
    expect(session.user.initialPasswordExpiresAt).toEqual(f.user.initialPasswordExpiresAt);
    expect(session.user).not.toHaveProperty('passwordHash');
    expect(session.user).not.toHaveProperty('sessionVersion');
    expect(session.refreshToken).toMatch(/^v0\.[A-Za-z0-9_-]{64}$/);
    expect(f.tokens[0].tokenHash).toBe(createHash('sha256').update(session.refreshToken).digest('hex'));
    expect(f.tokens[0]).not.toHaveProperty('refreshToken');
    expect(f.jwt.decode(session.accessToken)).toEqual(expect.objectContaining({ sv: 0, typ: 'access' }));
  });

  it.each([
    ['GET', '/api/v1/auth/me'],
    ['GET', '/api/v1/auth/me?refresh=1'],
    ['POST', '/api/v1/auth/logout'],
    ['PATCH', '/api/v1/auth/password'],
    ['PATCH', '/api/v1/auth/change-password'],
  ])('allows the first-password route %s %s', async (method, path) => {
    const f = fixture();
    const session = await f.login();
    await expect(f.service.actor(f.request(session.accessToken, method, path))).resolves.toEqual(expect.objectContaining({ sub: f.user.id }));
  });

  it.each([
    ['GET', '/api/v1/patient/reports'],
    ['GET', '/api/v1/auth/profile'],
    ['PATCH', '/api/v1/auth/me'],
    ['GET', '/api/v1/auth/logout'],
    ['POST', '/api/v1/auth/password'],
    ['PATCH', '/api/v1/auth/password/extra'],
    ['GET', '/api/v1/unrelated/auth/me'],
    ['PATCH', '/api/v1/auth/me/target-weight'],
  ])('blocks all other first-login operations %s %s', async (method, path) => {
    const f = fixture();
    const session = await f.login();
    await expect(f.service.actor(f.request(session.accessToken, method, path))).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }),
    });
  });

  it.each([new Date(Date.now() - 1000), null])('rejects expired or absent initial expiry using the same generic credential error', async (expiresAt) => {
    const f = fixture({ initialPasswordExpiresAt: expiresAt });
    await expect(f.login()).rejects.toThrow('账号或密码错误');
    await expect(f.service.login({ phone: '19900000999', password: INITIAL_PASSWORD, role: UserRole.PATIENT })).rejects.toThrow('账号或密码错误');
    await expect(f.service.login({ phone: PHONE, password: 'WrongPassword!12', role: UserRole.PATIENT })).rejects.toThrow('账号或密码错误');
    expect(f.tokens).toHaveLength(0);
  });

  it('does not expire an established account or reset its existing password', async () => {
    const f = fixture({ mustChangePassword: false, initialPasswordExpiresAt: new Date(Date.now() - 60_000) });
    const session = await f.login();
    await expect(f.service.actor(f.request(session.accessToken, 'GET', '/api/v1/patient/reports'))).resolves.toMatchObject({ sv: 0 });
    expect(f.user.mustChangePassword).toBe(false);
    expect(f.user.sessionVersion).toBe(0);
  });

  it('changes the password once, clears initial restrictions, revokes all sessions and requires a fresh login', async () => {
    const f = fixture();
    const session = await f.login();
    const actor = await f.service.actor(f.request(session.accessToken, 'PATCH', '/api/v1/auth/password'));
    await expect(f.service.changePassword(actor, { currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD })).resolves.toEqual({ changed: true, sessionsRevoked: true });
    expect(f.user).toMatchObject({ mustChangePassword: false, initialPasswordExpiresAt: null, sessionVersion: 1 });
    expect(f.user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(f.tokens.every((token) => token.revokedAt instanceof Date)).toBe(true);
    await expect(f.service.actor(f.request(session.accessToken))).rejects.toThrow('会话已失效');
    await expect(f.service.refresh({ refreshToken: session.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(f.login()).rejects.toThrow('账号或密码错误');
    const renewed = await f.service.login({ phone: PHONE, password: NEW_PASSWORD, role: UserRole.PATIENT });
    expect(renewed.refreshToken).toMatch(/^v1\./);
    await expect(f.service.actor(f.request(renewed.accessToken, 'GET', '/api/v1/patient/reports'))).resolves.toMatchObject({ sv: 1 });
    expect(f.audits.some((entry) => entry.action === 'AUTH_PASSWORD_CHANGE')).toBe(true);
  });

  it('rejects unchanged, phone-derived, invalid-length and expired initial password changes without altering the account', async () => {
    const f = fixture();
    const session = await f.login();
    const actor = await f.service.actor(f.request(session.accessToken, 'PATCH', '/api/v1/auth/password'));
    for (const newPassword of [INITIAL_PASSWORD, PHONE, '+86' + PHONE, 'short', 'a'.repeat(73)]) {
      await expect(f.service.changePassword(actor, { currentPassword: INITIAL_PASSWORD, newPassword })).rejects.toThrow();
    }
    f.user.initialPasswordExpiresAt = new Date(Date.now() - 1);
    await expect(f.service.changePassword(actor, { currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INITIAL_PASSWORD_EXPIRED' }) });
    expect(f.user.mustChangePassword).toBe(true);
    expect(f.user.sessionVersion).toBe(0);
    expect(f.tokens[0].revokedAt).toBeNull();
  });

  it('SMS login retains first-change restrictions even after the initial password expired', async () => {
    const f = fixture({ initialPasswordExpiresAt: new Date(Date.now() - 1000) });
    const session = await f.service.smsLogin({ phone: PHONE, challengeId: 'fictional-challenge', code: '123456', role: UserRole.PATIENT });
    expect(f.consume).toHaveBeenCalledWith('fictional-challenge', PHONE, SmsPurpose.LOGIN, '123456');
    expect(session.user.mustChangePassword).toBe(true);
    await expect(f.service.actor(f.request(session.accessToken, 'GET', '/api/v1/patient/reports'))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }) });
    await expect(f.service.refresh({ refreshToken: session.refreshToken })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }) });
  });

  it('verified WeChat phone login retains the first-password restriction', async () => {
    const f = fixture();
    const session = await f.service.wechatPhoneLogin({ phoneCode: 'fictional-phone-code', acceptedTerms: true });
    expect(session.user.mustChangePassword).toBe(true);
    await expect(f.service.actor(f.request(session.accessToken, 'GET', '/api/v1/patient/reports'))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }) });
    expect(f.user.sessionVersion).toBe(0);
  });
  it('does not allow patient self-registration or legacy WeChat implicit creation', async () => {
    const f = fixture();
    await expect(f.service.register({ role: UserRole.PATIENT } as any)).rejects.toThrow();
    await expect(f.service.wechatLogin({code:'fictional-code'})).rejects.toMatchObject({response:{code:'WECHAT_PHONE_AUTH_REQUIRED'}});
    expect(f.tokens).toHaveLength(0);
  });

  it('a verified SMS reset recovers an expired initial account and revokes previously issued sessions', async () => {
    const f = fixture();
    const session = await f.login();
    f.user.initialPasswordExpiresAt = new Date(Date.now() - 1000);
    await expect(f.service.resetPassword({ phone: PHONE, challengeId: 'fictional-reset', code: '654321', newPassword: NEW_PASSWORD, role: UserRole.PATIENT })).resolves.toEqual({ reset: true });
    expect(f.consume).toHaveBeenCalledWith('fictional-reset', PHONE, SmsPurpose.RESET_PASSWORD, '654321');
    expect(f.user).toMatchObject({ mustChangePassword: false, initialPasswordExpiresAt: null, sessionVersion: 1 });
    await expect(f.service.actor(f.request(session.accessToken))).rejects.toThrow('会话已失效');
    await expect(f.service.refresh({ refreshToken: session.refreshToken })).rejects.toThrow();
    await expect(f.service.login({ phone: PHONE, password: NEW_PASSWORD, role: UserRole.PATIENT })).resolves.toMatchObject({ user: { mustChangePassword: false } });
  });

  it('practitioner SMS reset also revokes access sessions and never keeps a first-change flag', async () => {
    const f = fixture({ role: UserRole.NUTRITIONIST });
    const session = await f.service.practitionerLogin({ phone: PHONE, password: INITIAL_PASSWORD });
    await f.service.practitionerResetPassword({ phone: PHONE, challengeId: 'fictional-reset', code: '654321', newPassword: NEW_PASSWORD });
    expect(f.user).toMatchObject({ mustChangePassword: false, initialPasswordExpiresAt: null, sessionVersion: 1 });
    await expect(f.service.actor(f.request(session.accessToken))).rejects.toThrow('会话已失效');
  });

  it('legacy access and refresh tokens without a version work only until the account changes its session version', async () => {
    const f = fixture({ mustChangePassword: false });
    const oldAccess = await f.jwt.signAsync({ sub: f.user.id, role: f.user.role, typ: 'access', jti: 'fictional-legacy' }, { secret: JWT_SECRET, issuer: 'fictional-auth-tests', audience: 'fictional-auth-clients', expiresIn: '15m' });
    const oldRefresh = 'fictional-old-unversioned-random-token';
    f.tokens.push({ id: 'legacy-refresh', tokenHash: createHash('sha256').update(oldRefresh).digest('hex'), userId: f.user.id, familyId: 'fictional-family', revokedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    await expect(f.service.actor(f.request(oldAccess, 'GET', '/api/v1/patient/reports'))).resolves.toMatchObject({ sub: f.user.id });
    const rotated = await f.service.refresh({ refreshToken: oldRefresh });
    expect(rotated.refreshToken).toMatch(/^v0\./);
    f.user.sessionVersion = 1;
    await expect(f.service.actor(f.request(oldAccess))).rejects.toThrow('会话已失效');
    await expect(f.service.refresh({ refreshToken: rotated.refreshToken })).rejects.toThrow('刷新令牌无效');
  });

  it.each([-1, 0.5, '0', Number.MAX_SAFE_INTEGER + 1])('rejects a malformed signed session version %s', async (sv) => {
    const f = fixture({ mustChangePassword: false });
    const token = await f.jwt.signAsync({ sub: f.user.id, role: f.user.role, typ: 'access', jti: 'fictional-jti', sv }, { secret: JWT_SECRET, issuer: 'fictional-auth-tests', audience: 'fictional-auth-clients', expiresIn: '15m' });
    await expect(f.service.actor(f.request(token))).rejects.toThrow('访问令牌类型无效');
  });

  it('logout invalidates the current access token and all refresh sessions immediately', async () => {
    const f = fixture({ mustChangePassword: false });
    const first = await f.login();
    const second = await f.login();
    const actor = await f.service.actor(f.request(first.accessToken, 'POST', '/api/v1/auth/logout'));
    await expect(f.service.logout(actor, { refreshToken: first.refreshToken })).resolves.toEqual({ loggedOut: true, sessionsRevoked: true });
    expect(f.user.sessionVersion).toBe(1);
    expect(f.tokens.every((token) => token.revokedAt instanceof Date)).toBe(true);
    for (const session of [first, second]) {
      await expect(f.service.actor(f.request(session.accessToken))).rejects.toThrow('会话已失效');
      await expect(f.service.refresh({ refreshToken: session.refreshToken })).rejects.toThrow();
    }
  });

  it('concurrent stale refresh results cannot recreate an effective session after password revocation', async () => {
    const f = fixture({ mustChangePassword: false });
    const session = await f.login();
    const originalCreate = f.prisma.refreshToken.create.getMockImplementation();
    f.prisma.refreshToken.create.mockImplementationOnce(async (input: any) => {
      // A password reset commits after refresh loaded the account but before it returns tokens.
      f.user.sessionVersion += 1;
      return originalCreate!(input);
    });
    const stale = await f.service.refresh({ refreshToken: session.refreshToken });
    await expect(f.service.actor(f.request(stale.accessToken))).rejects.toThrow('会话已失效');
    await expect(f.service.refresh({ refreshToken: stale.refreshToken })).rejects.toThrow('刷新令牌无效');
  });

  it('rejects an old actor trying to change a password again after another session already changed it', async () => {
    const f = fixture();
    const session = await f.login();
    const actor = await f.service.actor(f.request(session.accessToken, 'PATCH', '/api/v1/auth/password'));
    await f.service.changePassword(actor, { currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD });
    await expect(f.service.changePassword(actor, { currentPassword: NEW_PASSWORD, newPassword: 'AnotherFictional!25' })).rejects.toThrow('账号或密码错误');
    expect(f.user.sessionVersion).toBe(1);
  });

  it('a legacy hash upgrade cannot overwrite a password reset that commits while hashing', async () => {
    const f = fixture({ mustChangePassword: false });
    const recoveredHash = legacyHash(NEW_PASSWORD);
    jest.spyOn(f.service as any, 'hashPassword').mockImplementation(async () => {
      f.user.passwordHash = recoveredHash;
      f.user.sessionVersion = 1;
      return 'fictional-old-hash-upgrade';
    });
    await expect(f.login()).rejects.toThrow('账号或密码错误');
    expect(f.user.passwordHash).toBe(recoveredHash);
    expect(f.user.sessionVersion).toBe(1);
    expect(f.tokens).toHaveLength(0);
  });

  it('a concurrent password change cannot overwrite a newer reset or issue a second audit', async () => {
    const f = fixture();
    const session = await f.login();
    const actor = await f.service.actor(f.request(session.accessToken, 'PATCH', '/api/v1/auth/password'));
    const recoveredHash = legacyHash('FictionalRecovery!25');
    jest.spyOn(f.service as any, 'hashPassword').mockImplementation(async () => {
      f.user.passwordHash = recoveredHash;
      f.user.sessionVersion = 1;
      f.user.mustChangePassword = false;
      return 'fictional-concurrent-hash';
    });
    await expect(f.service.changePassword(actor, { currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD })).rejects.toThrow('会话已失效');
    expect(f.user.passwordHash).toBe(recoveredHash);
    expect(f.user.sessionVersion).toBe(1);
    expect(f.audits.filter((entry) => entry.action === 'AUTH_PASSWORD_CHANGE')).toHaveLength(0);
  });

  it('practitioner SMS login keeps the initial restriction and does not permit business reads', async () => {
    const f = fixture({ role: UserRole.NUTRITIONIST });
    const session = await f.service.practitionerSmsLogin({ phone: PHONE, challengeId: 'fictional-practitioner-sms', code: '123456' });
    expect(session.user.mustChangePassword).toBe(true);
    await expect(f.service.actor(f.request(session.accessToken, 'GET', '/api/v1/clinical/patients'))).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }) });
  });

  it('an actual local HTTP flow returns 403 before first change, then rejects old tokens and permits a new login', async () => {
    const f = fixture();
    let app: INestApplication | undefined;
    try {
      const module = await Test.createTestingModule({ controllers: [AuthController, ProtectedFixtureController], providers: [{ provide: AuthService, useValue: f.service }] }).compile();
      app = module.createNestApplication();
      app.setGlobalPrefix('api/v1');
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const loginResponse = await localRequest(base + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: PHONE, password: INITIAL_PASSWORD, role: UserRole.PATIENT }) });
      expect(loginResponse.status).toBe(201);
      const session = await loginResponse.json() as any;
      const authorization = { authorization: 'Bearer ' + session.accessToken };
      const me = await localRequest(base + '/api/v1/auth/me', { headers: authorization });
      expect(me.status).toBe(200);
      expect((await me.json() as any).mustChangePassword).toBe(true);
      const blocked = await localRequest(base + '/api/v1/fixture-business', { headers: authorization });
      expect(blocked.status).toBe(403);
      expect((await blocked.json() as any).code).toBe('PASSWORD_CHANGE_REQUIRED');
      const changed = await localRequest(base + '/api/v1/auth/change-password', { method: 'PATCH', headers: { ...authorization, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD }) });
      expect(changed.status).toBe(200);
      expect((await changed.json() as any).sessionsRevoked).toBe(true);
      expect((await localRequest(base + '/api/v1/auth/me', { headers: authorization })).status).toBe(401);
      const renewed = await f.service.login({ phone: PHONE, password: NEW_PASSWORD, role: UserRole.PATIENT });
      const permitted = await localRequest(base + '/api/v1/fixture-business', { headers: { authorization: 'Bearer ' + renewed.accessToken } });
      expect(permitted.status).toBe(200);
      expect(await permitted.json()).toEqual({ permitted: true });
    } finally {
      await app?.close();
    }
  });
});
