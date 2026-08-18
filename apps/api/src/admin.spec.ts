import { ForbiddenException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { AdminBootstrapService, AdminService } from './admin';
import type { Actor } from './auth';
import type { PrismaService } from './prisma.service';

const adminActor: Actor = { sub: 'admin-1', role: UserRole.ADMIN, typ: 'access', jti: 'jti-1' };

describe('AdminBootstrapService', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousUsername = process.env.DEFAULT_ADMIN_USERNAME;
  const previousPassword = process.env.DEFAULT_ADMIN_PASSWORD;

  afterEach(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousUsername === undefined) delete process.env.DEFAULT_ADMIN_USERNAME;
    else process.env.DEFAULT_ADMIN_USERNAME = previousUsername;
    if (previousPassword === undefined) delete process.env.DEFAULT_ADMIN_PASSWORD;
    else process.env.DEFAULT_ADMIN_PASSWORD = previousPassword;
  });

  it('creates the requested default administrator with an Argon2 hash', async () => {
    process.env.NODE_ENV = 'test';
    process.env.DEFAULT_ADMIN_USERNAME = 'admin';
    process.env.DEFAULT_ADMIN_PASSWORD = 'admin123';
    let created: Record<string, unknown> | undefined;
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => { created = data; return Promise.resolve(data); }),
      },
    } as unknown as PrismaService;

    await new AdminBootstrapService(prisma).onApplicationBootstrap();

    expect(created).toMatchObject({ phone: 'admin', displayName: '系统管理员', role: UserRole.ADMIN });
    expect(typeof created?.passwordHash).toBe('string');
    await expect(argon2.verify(String(created?.passwordHash), 'admin123')).resolves.toBe(true);
  });

  it('does not create an implicit administrator in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DEFAULT_ADMIN_USERNAME;
    delete process.env.DEFAULT_ADMIN_PASSWORD;
    const prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
    } as unknown as PrismaService;

    await new AdminBootstrapService(prisma).onApplicationBootstrap();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects weak administrator credentials in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEFAULT_ADMIN_USERNAME = 'admin';
    process.env.DEFAULT_ADMIN_PASSWORD = 'admin123';
    const prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
    } as unknown as PrismaService;

    await expect(new AdminBootstrapService(prisma).onApplicationBootstrap()).rejects.toThrow(
      'DEFAULT_ADMIN_PASSWORD',
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing administrator password', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1' }), create: jest.fn() },
    } as unknown as PrismaService;
    await new AdminBootstrapService(prisma).onApplicationBootstrap();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('AdminService permissions', () => {
  it('rejects non-admin access', async () => {
    const service = new AdminService({} as PrismaService);
    await expect(service.summary({ ...adminActor, role: UserRole.DOCTOR })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow an administrator to disable their own account', async () => {
    const service = new AdminService({} as PrismaService);
    await expect(service.updateUser(adminActor, adminActor.sub, { status: UserStatus.DISABLED })).rejects.toThrow('不能停用当前管理员');
  });
});
