import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import { Actor, AdminLoginDto, AuthService } from './auth';
import { practitionerPhoneKey } from './domain';
import { PrismaService } from './prisma.service';

const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;
const phonePattern = /^(?:\+?86)?1[3-9]\d{9}$/;

class PageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize = 20;
}

class UserQueryDto extends PageQueryDto {
  @IsString()
  @MaxLength(80)
  @IsOptional()
  search?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;
}

class AuditQueryDto extends PageQueryDto {
  @IsString()
  @MaxLength(80)
  @IsOptional()
  search?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  action?: string;
}

class CreateManagedUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  displayName!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

class UpdateManagedUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  displayName?: string;

  @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED])
  @IsOptional()
  status?: UserStatus;
}

class ResetManagedPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (process.env.RECONSTRUCTION_LOCAL_ONLY === 'true') return;
    const isProduction = process.env.NODE_ENV === 'production';
    const configuredUsername = process.env.DEFAULT_ADMIN_USERNAME?.trim();
    const configuredPassword = process.env.DEFAULT_ADMIN_PASSWORD;

    // Local development keeps the historical convenience account. Production is
    // deliberately opt-in so a missing secret can never create admin/admin123.
    if (isProduction && !configuredUsername && !configuredPassword) return;
    if (isProduction && (!configuredUsername || !configuredPassword)) {
      throw new Error('DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD must be configured together');
    }

    const username = (configuredUsername || 'admin').toLowerCase();
    const password = configuredPassword || 'admin123';
    if (isProduction) {
      const normalized = password.trim().toLowerCase();
      const knownWeakPasswords = new Set(['admin123', 'password', 'password123', '12345678', 'changeme']);
      if (username.length < 4 || username.length > 32) {
        throw new Error('DEFAULT_ADMIN_USERNAME must contain between 4 and 32 characters');
      }
      if (password.length < 16 || password.length > 72 || knownWeakPasswords.has(normalized)) {
        throw new Error('DEFAULT_ADMIN_PASSWORD must contain between 16 and 72 non-default characters');
      }
    }
    const existing = await this.prisma.user.findUnique({
      where: { phone_role: { phone: username, role: UserRole.ADMIN } },
    });
    if (existing) return;
    await this.prisma.user.create({
      data: {
        phone: username,
        displayName: '系统管理员',
        role: UserRole.ADMIN,
        passwordHash: await argon2.hash(password, passwordOptions),
      },
    });
  }
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(actor: Actor) {
    this.assertAdmin(actor);
    const [totalUsers, activeUsers, disabledUsers, deletedUsers, auditLogs, byRole] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.DISABLED } }),
      this.prisma.user.count({ where: { status: UserStatus.DELETED } }),
      this.prisma.auditLog.count(),
      this.prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    ]);
    return {
      totalUsers,
      activeUsers,
      disabledUsers,
      deletedUsers,
      auditLogs,
      usersByRole: Object.fromEntries(byRole.map((row) => [row.role, row._count._all])),
    };
  }

  async listUsers(actor: Actor, query: UserQueryDto) {
    this.assertAdmin(actor);
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      role: query.role,
      status: query.status,
      ...(search
        ? {
            OR: [
              { phone: { contains: search } },
              { displayName: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          phone: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          deletedAt: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async createUser(actor: Actor, dto: CreateManagedUserDto) {
    this.assertAdmin(actor);
    if (dto.role === UserRole.PATIENT) throw new ForbiddenException('客户账号请由健康管理师建档创建');
    const username = dto.username.trim().toLowerCase();
    if (dto.role !== UserRole.ADMIN && !phonePattern.test(username)) {
      throw new BadRequestException('工作人员账号必须使用有效手机号');
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          phone: username,
          practitionerPhone: practitionerPhoneKey(dto.role, username),
          displayName: dto.displayName.trim(),
          role: dto.role,
          passwordHash: await argon2.hash(dto.password, passwordOptions),
        },
        select: { id: true, phone: true, displayName: true, role: true, status: true, createdAt: true },
      });
      await this.writeAudit(actor.sub, 'ADMIN_USER_CREATE', user.id, { role: user.role, username });
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        if (dto.role === UserRole.DOCTOR || dto.role === UserRole.NUTRITIONIST) {
          throw new ConflictException('该手机号已存在医生或营养师账号');
        }
        throw new ConflictException('该登录账号已存在');
      }
      throw error;
    }
  }

  async updateUser(actor: Actor, userId: string, dto: UpdateManagedUserDto) {
    this.assertAdmin(actor);
    if (dto.status !== undefined && dto.status !== UserStatus.ACTIVE && dto.status !== UserStatus.DISABLED) {
      throw new BadRequestException('账号状态只能设置为正常或停用；删除请使用删除操作');
    }
    if (actor.sub === userId && dto.status === UserStatus.DISABLED) {
      throw new ForbiddenException('不能停用当前管理员');
    }
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const current = await this.managedUser(tx, userId);
        if (current.status === UserStatus.DELETED || current.deletedAt) throw new ConflictException('账号已删除，不能修改或重新启用');
        if (dto.status === UserStatus.DISABLED) await this.protectLastAdmin(tx, current);
        const disabling = dto.status === UserStatus.DISABLED && current.status !== UserStatus.DISABLED;
        const changed = await tx.user.updateMany({
          where: { id: userId, status: current.status, sessionVersion: current.sessionVersion, deletedAt: null },
          data: {
            displayName: dto.displayName?.trim(),
            status: dto.status,
            ...(disabling ? { sessionVersion: { increment: 1 } } : {}),
            disabledAt: dto.status === UserStatus.DISABLED ? current.disabledAt ?? new Date() : dto.status === UserStatus.ACTIVE ? null : undefined,
          },
        });
        if (changed.count !== 1) throw new ConflictException('账号状态已变化，请刷新后重试');
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { id: true, phone: true, email: true, displayName: true, role: true, status: true, deletedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true },
        });
        if (dto.status === UserStatus.DISABLED) {
          await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
        }
        await tx.auditLog.create({
          data: { actorId: actor.sub, action: 'ADMIN_USER_UPDATE', resourceType: 'USER', resourceId: userId, metadata: dto as Prisma.InputJsonValue },
        });
        return user;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('账号正在被修改，请刷新后重试');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('该手机号已存在目标身份账号');
      }
      throw error;
    }
  }

  async resetPassword(actor: Actor, userId: string, dto: ResetManagedPasswordDto) {
    this.assertAdmin(actor);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.managedUser(tx, userId);
      if (current.status === UserStatus.DELETED || current.deletedAt) throw new ConflictException('账号已删除，不能重置密码');
      await tx.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(dto.newPassword, passwordOptions), sessionVersion: { increment: 1 }, mustChangePassword: true, initialPasswordExpiresAt: new Date(Date.now() + 24 * 3600000) } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'ADMIN_PASSWORD_RESET', resourceType: 'USER', resourceId: userId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { reset: true, sessionsRevoked: true };
  }

  async deleteUser(actor: Actor, userId: string) {
    this.assertAdmin(actor);
    if (actor.sub === userId) throw new ForbiddenException('不能删除当前管理员');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await this.managedUser(tx, userId);
        if (current.status === UserStatus.DELETED) return { deleted: true, sessionsRevoked: true };
        await this.protectLastAdmin(tx, current);
        const deletedAt = new Date();
        const changed = await tx.user.updateMany({
          where: { id: userId, status: current.status, sessionVersion: current.sessionVersion, deletedAt: null },
          data: { status: UserStatus.DELETED, deletedAt, disabledAt: current.disabledAt ?? deletedAt, sessionVersion: { increment: 1 } },
        });
        if (changed.count !== 1) throw new ConflictException('账号状态已变化，请刷新后重试');
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: deletedAt } });
        await tx.auditLog.create({ data: { actorId: actor.sub, action: 'ADMIN_USER_SOFT_DELETE', resourceType: 'USER', resourceId: userId,
          metadata: { previousStatus: current.status, role: current.role, deletedAt: deletedAt.toISOString(), recordsPreserved: true } } });
        return { deleted: true, sessionsRevoked: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new ConflictException('账号正在被修改，请刷新后重试');
      throw error;
    }
  }

  private async managedUser(tx: Prisma.TransactionClient, userId: string) {
    const current = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, disabledAt: true, deletedAt: true, sessionVersion: true } });
    if (!current) throw new NotFoundException('账号不存在');
    return current;
  }

  private async protectLastAdmin(tx: Prisma.TransactionClient, current: { role: UserRole; status: UserStatus }) {
    if (current.role !== UserRole.ADMIN || current.status !== UserStatus.ACTIVE) return;
    const activeAdmins = await tx.user.count({ where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE } });
    if (activeAdmins <= 1) throw new ForbiddenException('系统必须至少保留一个启用的管理员');
  }

  async listAuditLogs(actor: Actor, query: AuditQueryDto) {
    this.assertAdmin(actor);
    const search = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action.trim() } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search } },
              { resourceType: { contains: search } },
              { resourceId: { contains: search } },
              { actor: { is: { displayName: { contains: search } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, displayName: true, phone: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private assertAdmin(actor: Actor) {
    if (actor.role !== UserRole.ADMIN) throw new ForbiddenException('仅管理员可访问此功能');
  }

  private writeAudit(actorId: string, action: string, resourceId: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { actorId, action, resourceType: 'USER', resourceId, metadata } });
  }
}

@Controller('admin')
export class AdminController {
  constructor(private readonly auth: AuthService, private readonly admin: AdminService) {}

  @Post('auth/login')
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.auth.adminLogin(dto, req);
  }

  @Get('summary')
  async summary(@Req() req: Request) {
    return this.admin.summary(await this.auth.actor(req));
  }

  @Get('users')
  async users(@Query() query: UserQueryDto, @Req() req: Request) {
    return this.admin.listUsers(await this.auth.actor(req), query);
  }

  @Post('users')
  async createUser(@Body() dto: CreateManagedUserDto, @Req() req: Request) {
    return this.admin.createUser(await this.auth.actor(req), dto);
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateManagedUserDto, @Req() req: Request) {
    return this.admin.updateUser(await this.auth.actor(req), id, dto);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: Request) {
    return this.admin.deleteUser(await this.auth.actor(req), id);
  }

  @Post('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() dto: ResetManagedPasswordDto, @Req() req: Request) {
    return this.admin.resetPassword(await this.auth.actor(req), id, dto);
  }

  @Get('audit-logs')
  async auditLogs(@Query() query: AuditQueryDto, @Req() req: Request) {
    return this.admin.listAuditLogs(await this.auth.actor(req), query);
  }
}
