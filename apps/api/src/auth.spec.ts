import { JwtService } from '@nestjs/jwt';
import { SmsPurpose, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { pbkdf2Sync } from 'node:crypto';
import { AuthService } from './auth';
import type { PrismaService } from './prisma.service';
import type { SmsDeliveryService } from './sms-delivery';

describe('AuthService', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  const previousWebhook = process.env.SMS_DELIVERY_WEBHOOK_URL;
  const previousSmsPepper = process.env.SMS_CODE_PEPPER;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
    process.env.JWT_ACCESS_SECRET = previousSecret;
    process.env.SMS_DELIVERY_WEBHOOK_URL = previousWebhook;
    process.env.SMS_CODE_PEPPER = previousSmsPepper;
    jest.restoreAllMocks();
  });

  it('stores only an SMS digest and exposes debugCode outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ACCESS_SECRET = 'test-only-secret-that-is-at-least-32-characters';
    let createData: Record<string, unknown> | undefined;
    const prisma = {
      smsChallenge: {
        findFirst: jest.fn().mockResolvedValueOnce(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => {
          createData = data;
          return Promise.resolve({ id: 'challenge-1', ...data });
        }),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as JwtService);

    const response = await service.sendSms({
      phone: '13800000003',
      purpose: SmsPurpose.LOGIN,
    });

    expect(response.debugCode).toMatch(/^\d{6}$/);
    expect(createData?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createData?.codeHash).not.toBe(response.debugCode);
  });

  it('uses the configured Aliyun delivery service without exposing the production code', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_CODE_PEPPER = 'test-only-sms-pepper-that-is-at-least-32-characters';
    delete process.env.SMS_DELIVERY_WEBHOOK_URL;
    const prisma = {
      smsChallenge: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'challenge-2' }),
        delete: jest.fn(),
      },
    } as unknown as PrismaService;
    const smsDelivery = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendVerificationCode: jest.fn().mockResolvedValue({ requestId: 'request-1' }),
    } as unknown as SmsDeliveryService;
    const service = new AuthService(prisma, {} as JwtService, smsDelivery);

    const response = await service.sendSms({
      phone: '13800000003',
      purpose: SmsPurpose.LOGIN,
    });

    expect(smsDelivery.sendVerificationCode).toHaveBeenCalledWith(
      '13800000003',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(response).not.toHaveProperty('debugCode');
  });

  it('rejects a JWT whose role no longer matches the database', async () => {
    process.env.JWT_ACCESS_SECRET = 'test-only-secret-that-is-at-least-32-characters';
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: UserRole.PATIENT,
          status: 'ACTIVE',
        }),
      },
    } as unknown as PrismaService;
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        role: UserRole.DOCTOR,
        typ: 'access',
        jti: 'jti-1',
      }),
    } as unknown as JwtService;
    const service = new AuthService(prisma, jwt);
    const request = {
      headers: { authorization: 'Bearer token' },
    } as unknown as Request;

    await expect(service.actor(request)).rejects.toThrow('账号不可用');
  });

  it('verifies imported legacy PBKDF2 passwords so they can be upgraded on login', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const digest = pbkdf2Sync('LegacyPass!2026', salt, 10_000, 64, 'sha512').toString('hex');
    const service = new AuthService({} as PrismaService, {} as JwtService);
    const verifyPassword = (service as unknown as { verifyPassword(hash: string, password: string): Promise<boolean> }).verifyPassword.bind(service);
    await expect(verifyPassword(`legacy-pbkdf2$10000$${salt}$${digest}`, 'LegacyPass!2026')).resolves.toBe(true);
    await expect(verifyPassword(`legacy-pbkdf2$10000$${salt}$${digest}`, 'wrong')).resolves.toBe(false);
  });

  it('resolves a shared phone number by the selected account role', async () => {
    const doctor = {
      id: 'doctor-1', phone: '13800000003', role: UserRole.DOCTOR, status: 'ACTIVE',
      patientProfile: null, practitionerProfile: { userId: 'doctor-1' },
    };
    const findUnique = jest.fn().mockResolvedValue(doctor);
    const prisma = { user: { findUnique, findMany: jest.fn() } } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as JwtService);
    const resolve = (service as unknown as {
      findUserByPhoneAndRole(client: PrismaService, phone: string, role?: Exclude<UserRole, 'ADMIN'>): Promise<unknown>;
    }).findUserByPhoneAndRole.bind(service);

    await expect(resolve(prisma, '13800000003', UserRole.DOCTOR)).resolves.toBe(doctor);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { phone_role: { phone: '13800000003', role: UserRole.DOCTOR } },
    }));
  });

  it('requires an identity choice when a legacy login phone has multiple roles', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 'patient-1', role: UserRole.PATIENT },
          { id: 'doctor-1', role: UserRole.DOCTOR },
        ]),
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as JwtService);
    const resolve = (service as unknown as {
      findUserByPhoneAndRole(client: PrismaService, phone: string, role?: Exclude<UserRole, 'ADMIN'>): Promise<unknown>;
    }).findUserByPhoneAndRole.bind(service);

    await expect(resolve(prisma, '13800000003')).rejects.toThrow('该手机号存在多个身份账号，请选择登录身份');
  });

  it('infers the practitioner role from a unique doctor or nutritionist phone', async () => {
    const doctor = {
      id: 'doctor-1', phone: '13800000003', role: UserRole.DOCTOR, status: 'ACTIVE',
      passwordHash: 'hash', patientProfile: null, practitionerProfile: { userId: 'doctor-1' },
    };
    const findMany = jest.fn().mockResolvedValue([doctor]);
    const prisma = { user: { findMany } } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as JwtService);
    const completePasswordLogin = jest
      .spyOn(service as unknown as { completePasswordLogin: (...args: unknown[]) => Promise<unknown> }, 'completePasswordLogin')
      .mockResolvedValue({ accessToken: 'token' });

    await expect(service.practitionerLogin({ phone: '13800000003', password: 'Password!2026' })).resolves.toEqual({ accessToken: 'token' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        phone: '13800000003',
        role: { in: [UserRole.DOCTOR, UserRole.NUTRITIONIST] },
      },
      take: 2,
    }));
    expect(completePasswordLogin).toHaveBeenCalledWith(doctor, 'Password!2026', undefined);
  });

  it('rejects ambiguous practitioner accounts instead of guessing a role', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'doctor-1', role: UserRole.DOCTOR },
          { id: 'nutritionist-1', role: UserRole.NUTRITIONIST },
        ]),
      },
    } as unknown as PrismaService;
    const service = new AuthService(prisma, {} as JwtService);

    await expect(
      service.practitionerLogin({ phone: '13800000003', password: 'Password!2026' }),
    ).rejects.toThrow('该手机号存在多个执业身份账号，请联系管理员处理');
  });
});
