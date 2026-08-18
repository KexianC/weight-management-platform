import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  Gender,
  Prisma,
  SmsPurpose,
  UserRole,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Equals,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import * as argon2 from 'argon2';
import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from './prisma.service';
import { SmsDeliveryService } from './sms-delivery';

const PHONE_PATTERN = /^(?:\+?86)?1[3-9]\d{9}$/;
const SMS_CODE_PATTERN = /^\d{6}$/;
const ACCESS_TOKEN_TYPE = 'access';

class RateLimitException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export type Actor = {
  sub: string;
  role: UserRole;
  typ: typeof ACCESS_TOKEN_TYPE;
  jti: string;
};

type SessionMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

type UserWithProfile = Prisma.UserGetPayload<{
  include: { patientProfile: true; practitionerProfile: true };
}>;

class PhoneDto {
  @IsString()
  @Matches(PHONE_PATTERN, { message: '请输入有效的手机号' })
  phone!: string;
}

export class RegisterDto extends PhoneDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  displayName!: string;

  @IsIn([UserRole.PATIENT, UserRole.DOCTOR, UserRole.NUTRITIONIST])
  role!: Exclude<UserRole, 'ADMIN'>;

  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Matches(SMS_CODE_PATTERN)
  code!: string;

  @IsBoolean()
  @Equals(true, { message: '注册前需同意用户协议与隐私政策' })
  acceptedTerms!: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(32)
  consentVersion?: string;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsNumber()
  @Min(80)
  @Max(250)
  @IsOptional()
  heightCm?: number;

  @IsNumber()
  @Min(25)
  @Max(350)
  @IsOptional()
  targetWeightKg?: number;

  @IsString()
  @MaxLength(160)
  @IsOptional()
  hospital?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  department?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  specialty?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  licenseNumber?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  practitionerInviteCode?: string;
}

export class LoginDto extends PhoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;

  @IsIn([UserRole.PATIENT, UserRole.DOCTOR, UserRole.NUTRITIONIST])
  @IsOptional()
  role?: Exclude<UserRole, 'ADMIN'>;
}

export class PractitionerLoginDto extends PhoneDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

export class PractitionerSmsLoginDto extends PhoneDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Matches(SMS_CODE_PATTERN)
  code!: string;
}

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}

export class SendSmsDto extends PhoneDto {
  @IsEnum(SmsPurpose)
  purpose!: SmsPurpose;
}

export class VerifySmsDto extends PhoneDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsEnum(SmsPurpose)
  purpose!: SmsPurpose;

  @IsString()
  @Matches(SMS_CODE_PATTERN)
  code!: string;
}

export class SmsLoginDto extends PhoneDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Matches(SMS_CODE_PATTERN)
  code!: string;

  @IsIn([UserRole.PATIENT, UserRole.DOCTOR, UserRole.NUTRITIONIST])
  @IsOptional()
  role?: Exclude<UserRole, 'ADMIN'>;
}

export class WechatLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  code!: string;

  @IsString()
  @Matches(PHONE_PATTERN, { message: '请输入有效的手机号' })
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  challengeId?: string;

  @IsString()
  @Matches(SMS_CODE_PATTERN)
  @IsOptional()
  smsCode?: string;

  @IsIn([UserRole.PATIENT, UserRole.DOCTOR, UserRole.NUTRITIONIST])
  @IsOptional()
  role?: Exclude<UserRole, 'ADMIN'>;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  displayName?: string;

  @IsBoolean()
  @Equals(true, { message: '注册前需同意用户协议与隐私政策' })
  @IsOptional()
  acceptedTerms?: boolean;

  @IsString()
  @MaxLength(32)
  @IsOptional()
  consentVersion?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  practitionerInviteCode?: string;
}

export class ResetPasswordDto extends PhoneDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Matches(SMS_CODE_PATTERN)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;

  @IsIn([UserRole.PATIENT, UserRole.DOCTOR, UserRole.NUTRITIONIST])
  @IsOptional()
  role?: Exclude<UserRole, 'ADMIN'>;
}

export class PractitionerResetPasswordDto extends PhoneDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Matches(SMS_CODE_PATTERN)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @IsOptional()
  displayName?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  avatarUrl?: string;

  @IsEmail()
  @MaxLength(191)
  @IsOptional()
  email?: string;

  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @IsNumber()
  @Min(80)
  @Max(250)
  @IsOptional()
  heightCm?: number;

  @IsNumber()
  @Min(25)
  @Max(350)
  @IsOptional()
  initialWeightKg?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  medicalHistory?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergies?: string[];

  @IsString()
  @MaxLength(80)
  @IsOptional()
  emergencyContactName?: string;

  @IsString()
  @Matches(PHONE_PATTERN)
  @IsOptional()
  emergencyContactPhone?: string;

  @IsString()
  @MaxLength(160)
  @IsOptional()
  hospital?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  department?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  title?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  specialty?: string;

  @IsString()
  @MaxLength(80)
  @IsOptional()
  licenseNumber?: string;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  introduction?: string;
}

export class TargetWeightDto {
  @IsNumber()
  @Min(25)
  @Max(350)
  targetWeightKg!: number;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly smsDelivery?: SmsDeliveryService,
  ) {}

  async register(dto: RegisterDto, req?: Request) {
    const phone = this.normalizePhone(dto.phone);
    const metadata = this.requestMetadata(req);

    if (dto.role === UserRole.DOCTOR || dto.role === UserRole.NUTRITIONIST) {
      this.assertPractitionerRegistrationCode(dto.practitionerInviteCode);
    }

    await this.consumeChallenge(
      dto.challengeId,
      phone,
      SmsPurpose.REGISTER,
      dto.code,
    );
    const passwordHash = await this.hashPassword(dto.password);

    let user: UserWithProfile;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { phone_role: { phone, role: dto.role } },
        });
        if (existing) throw new ConflictException('该手机号已注册当前身份账号');

        const created = await tx.user.create({
          data: {
            phone,
            passwordHash,
            displayName: dto.displayName.trim(),
            role: dto.role,
            lastLoginAt: new Date(),
            patientProfile:
              dto.role === UserRole.PATIENT
                ? {
                    create: {
                      gender: dto.gender,
                      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
                      heightCm: dto.heightCm,
                      targetWeightKg: dto.targetWeightKg,
                    },
                  }
                : undefined,
            practitionerProfile:
              dto.role === UserRole.DOCTOR || dto.role === UserRole.NUTRITIONIST
                ? {
                    create: {
                      hospital: dto.hospital?.trim(),
                      department: dto.department?.trim(),
                      title: dto.title?.trim(),
                      specialty: dto.specialty?.trim(),
                      licenseNumber: dto.licenseNumber?.trim(),
                    },
                  }
                : undefined,
            consents: {
              create: {
                version: dto.consentVersion?.trim() || '1.0',
                scope: 'TERMS_AND_PRIVACY',
              },
            },
          },
          include: { patientProfile: true, practitionerProfile: true },
        });

        await tx.auditLog.create({
          data: {
            actorId: created.id,
            action: 'AUTH_REGISTER',
            resourceType: 'USER',
            resourceId: created.id,
            ipAddress: metadata.ipAddress,
            metadata: { role: created.role },
          },
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('手机号、邮箱或执业证号已存在');
      }
      throw error;
    }

    return this.issueSession(user, metadata);
  }

  async login(dto: LoginDto, req?: Request) {
    const phone = this.normalizePhone(dto.phone);
    const user = await this.findUserByPhoneAndRole(this.prisma, phone, dto.role);

    return this.completePasswordLogin(user, dto.password, req);
  }

  async practitionerLogin(dto: PractitionerLoginDto, req?: Request) {
    const phone = this.normalizePhone(dto.phone);
    const user = await this.findPractitionerByPhone(this.prisma, phone);
    return this.completePasswordLogin(user, dto.password, req);
  }

  private async completePasswordLogin(
    user: UserWithProfile | null,
    password: string,
    req?: Request,
  ) {

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !user.passwordHash ||
      !(await this.verifyPassword(user.passwordHash, password))
    ) {
      throw new UnauthorizedException('手机号或密码错误');
    }

    if (this.isLegacyPasswordHash(user.passwordHash)) {
      user.passwordHash = await this.hashPassword(password);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: user.passwordHash } });
    }

    const metadata = this.requestMetadata(req);
    await this.recordSuccessfulLogin(user.id, metadata, 'AUTH_PASSWORD_LOGIN');
    return this.issueSession(user, metadata);
  }

  async adminLogin(dto: AdminLoginDto, req?: Request) {
    const username = dto.username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { phone_role: { phone: username, role: UserRole.ADMIN } },
      include: { patientProfile: true, practitionerProfile: true },
    });
    if (
      !user ||
      user.role !== UserRole.ADMIN ||
      user.status !== 'ACTIVE' ||
      !user.passwordHash ||
      !(await this.verifyPassword(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException('管理员账号或密码错误');
    }
    const metadata = this.requestMetadata(req);
    await this.recordSuccessfulLogin(user.id, metadata, 'ADMIN_PASSWORD_LOGIN');
    return this.issueSession(user, metadata);
  }

  async sendSms(dto: SendSmsDto) {
    const phone = this.normalizePhone(dto.phone);
    const isProduction = process.env.NODE_ENV === 'production';
    if (
      isProduction &&
      !this.smsDelivery?.isConfigured() &&
      !process.env.SMS_DELIVERY_WEBHOOK_URL
    ) {
      throw new ServiceUnavailableException('短信服务未配置');
    }

    const now = new Date();
    const recent = await this.prisma.smsChallenge.findFirst({
      where: { phone, createdAt: { gt: new Date(now.getTime() - 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) throw new RateLimitException('请稍后再获取验证码');

    const hourlyCount = await this.prisma.smsChallenge.count({
      where: { phone, createdAt: { gt: new Date(now.getTime() - 60 * 60_000) } },
    });
    if (hourlyCount >= 5) {
      throw new RateLimitException('验证码发送次数过多，请一小时后重试');
    }

    const code = String(randomInt(100_000, 1_000_000));
    const challenge = await this.prisma.smsChallenge.create({
      data: {
        phone,
        purpose: dto.purpose,
        codeHash: this.hashSmsCode(phone, dto.purpose, code),
        expiresAt: new Date(now.getTime() + this.smsTtlSeconds() * 1000),
      },
    });

    try {
      await this.deliverSms(phone, dto.purpose, code);
    } catch (error) {
      await this.prisma.smsChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw error;
    }

    return {
      challengeId: challenge.id,
      expiresInSeconds: this.smsTtlSeconds(),
      retryAfterSeconds: 60,
      ...(isProduction ? {} : { debugCode: code }),
    };
  }

  async verifySms(dto: VerifySmsDto) {
    const phone = this.normalizePhone(dto.phone);
    await this.verifyChallenge(
      this.prisma,
      dto.challengeId,
      phone,
      dto.purpose,
      dto.code,
      false,
    );
    return { verified: true, challengeId: dto.challengeId };
  }

  async smsLogin(dto: SmsLoginDto, req?: Request) {
    const phone = this.normalizePhone(dto.phone);
    const metadata = this.requestMetadata(req);
    await this.consumeChallenge(dto.challengeId, phone, SmsPurpose.LOGIN, dto.code);
    const user = await this.prisma.$transaction(async (tx) => {
      const found = await this.findUserByPhoneAndRole(tx, phone, dto.role);
      if (!found || found.status !== 'ACTIVE') {
        throw new UnauthorizedException('验证码无效或账号不可用');
      }
      await tx.user.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorId: found.id,
          action: 'AUTH_SMS_LOGIN',
          resourceType: 'USER',
          resourceId: found.id,
          ipAddress: metadata.ipAddress,
        },
      });
      return found;
    });
    return this.issueSession(user, metadata);
  }

  async practitionerSmsLogin(dto: PractitionerSmsLoginDto, req?: Request) {
    const phone = this.normalizePhone(dto.phone);
    const metadata = this.requestMetadata(req);
    await this.consumeChallenge(dto.challengeId, phone, SmsPurpose.LOGIN, dto.code);
    const user = await this.prisma.$transaction(async (tx) => {
      const found = await this.findPractitionerByPhone(tx, phone);
      if (!found || found.status !== 'ACTIVE') {
        throw new UnauthorizedException('验证码无效或账号不可用');
      }
      await tx.user.update({ where: { id: found.id }, data: { lastLoginAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorId: found.id,
          action: 'AUTH_SMS_LOGIN',
          resourceType: 'USER',
          resourceId: found.id,
          ipAddress: metadata.ipAddress,
        },
      });
      return found;
    });
    return this.issueSession(user, metadata);
  }

  async wechatLogin(dto: WechatLoginDto, req?: Request) {
    const wechat = await this.exchangeWechatCode(dto.code);
    const metadata = this.requestMetadata(req);
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_externalId: {
          provider: 'WECHAT_MINI_PROGRAM',
          externalId: wechat.openid,
        },
      },
      include: {
        user: { include: { patientProfile: true, practitionerProfile: true } },
      },
    });

    if (existingIdentity) {
      if (existingIdentity.user.status !== 'ACTIVE') {
        throw new UnauthorizedException('账号不可用');
      }
      await this.recordSuccessfulLogin(
        existingIdentity.user.id,
        metadata,
        'AUTH_WECHAT_LOGIN',
      );
      return this.issueSession(existingIdentity.user, metadata);
    }

    if (
      !dto.phone ||
      !dto.challengeId ||
      !dto.smsCode ||
      !dto.role ||
      dto.acceptedTerms !== true
    ) {
      throw new BadRequestException(
        '首次微信登录需提供手机号、短信验证码、角色并同意用户协议与隐私政策',
      );
    }

    const phone = this.normalizePhone(dto.phone);
    await this.consumeChallenge(
      dto.challengeId,
      phone,
      SmsPurpose.VERIFY_PHONE,
      dto.smsCode,
    );
    let user: UserWithProfile;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const byPhone = await tx.user.findUnique({
          where: { phone_role: { phone, role: dto.role! } },
          include: { patientProfile: true, practitionerProfile: true },
        });
        if (byPhone?.status === 'DISABLED') throw new UnauthorizedException('账号不可用');
        if (!byPhone && (dto.role === UserRole.DOCTOR || dto.role === UserRole.NUTRITIONIST)) {
          this.assertPractitionerRegistrationCode(dto.practitionerInviteCode);
        }

        const linked = byPhone
          ? await tx.user.update({
              where: { id: byPhone.id },
              data: {
                authIdentities: {
                  create: {
                    provider: 'WECHAT_MINI_PROGRAM',
                    externalId: wechat.openid,
                    unionId: wechat.unionid,
                  },
                },
                lastLoginAt: new Date(),
              },
              include: { patientProfile: true, practitionerProfile: true },
            })
          : await tx.user.create({
              data: {
                phone,
                passwordHash: null,
                displayName: dto.displayName?.trim() || '微信用户',
                role: dto.role!,
                lastLoginAt: new Date(),
                authIdentities: {
                  create: {
                    provider: 'WECHAT_MINI_PROGRAM',
                    externalId: wechat.openid,
                    unionId: wechat.unionid,
                  },
                },
                patientProfile:
                  dto.role === UserRole.PATIENT ? { create: {} } : undefined,
                practitionerProfile:
                  dto.role === UserRole.DOCTOR || dto.role === UserRole.NUTRITIONIST
                    ? { create: {} }
                    : undefined,
                consents: {
                  create: {
                    version: dto.consentVersion?.trim() || '1.0',
                    scope: 'TERMS_AND_PRIVACY',
                  },
                },
              },
              include: { patientProfile: true, practitionerProfile: true },
            });
        await tx.auditLog.create({
          data: {
            actorId: linked.id,
            action: byPhone ? 'AUTH_WECHAT_LINK' : 'AUTH_WECHAT_REGISTER',
            resourceType: 'USER',
            resourceId: linked.id,
            ipAddress: metadata.ipAddress,
          },
        });
        return linked;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('微信账号或手机号已绑定');
      }
      throw error;
    }
    return this.issueSession(user, metadata);
  }

  async resetPassword(dto: ResetPasswordDto, req?: Request) {
    const phone = this.normalizePhone(dto.phone);
    const metadata = this.requestMetadata(req);

    await this.consumeChallenge(
      dto.challengeId,
      phone,
      SmsPurpose.RESET_PASSWORD,
      dto.code,
    );
    const passwordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      const user = await this.findUserByPhoneAndRole(tx, phone, dto.role);
      if (!user || user.status !== 'ACTIVE') {
        throw new BadRequestException('验证码无效或账号不可用');
      }
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'AUTH_PASSWORD_RESET',
          resourceType: 'USER',
          resourceId: user.id,
          ipAddress: metadata.ipAddress,
        },
      });
    });
    return { reset: true };
  }

  async practitionerResetPassword(dto: PractitionerResetPasswordDto, req?: Request) {
    const phone = this.normalizePhone(dto.phone);
    const metadata = this.requestMetadata(req);
    await this.consumeChallenge(
      dto.challengeId,
      phone,
      SmsPurpose.RESET_PASSWORD,
      dto.code,
    );
    const passwordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      const user = await this.findPractitionerByPhone(tx, phone);
      if (!user || user.status !== 'ACTIVE') {
        throw new BadRequestException('验证码无效或账号不可用');
      }
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'AUTH_PASSWORD_RESET',
          resourceType: 'USER',
          resourceId: user.id,
          ipAddress: metadata.ipAddress,
        },
      });
    });
    return { reset: true };
  }

  async refresh(dto: RefreshDto, req?: Request) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { patientProfile: true, practitionerProfile: true } },
      },
    });

    if (!stored || stored.expiresAt <= new Date() || stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('检测到刷新令牌重复使用，请重新登录');
    }

    const metadata = this.requestMetadata(req);
    const nextRawToken = this.newRefreshToken();
    const nextTokenId = randomUUID();
    const nextExpiresAt = this.refreshExpiresAt();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, lastUsedAt: now, replacedById: nextTokenId },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException('刷新令牌已被使用');
      }
      await tx.refreshToken.create({
        data: {
          id: nextTokenId,
          userId: stored.userId,
          tokenHash: this.hashRefreshToken(nextRawToken),
          familyId: stored.familyId,
          expiresAt: nextExpiresAt,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: stored.userId,
          action: 'AUTH_TOKEN_REFRESH',
          resourceType: 'REFRESH_TOKEN',
          resourceId: nextTokenId,
          ipAddress: metadata.ipAddress,
        },
      });
    });

    return {
      accessToken: await this.signAccessToken(stored.user),
      refreshToken: nextRawToken,
      user: this.userView(stored.user),
    };
  }

  async logout(actor: Actor, dto: LogoutDto = {}) {
    const now = new Date();
    if (dto.refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId: actor.sub,
          tokenHash: this.hashRefreshToken(dto.refreshToken),
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId: actor.sub, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'AUTH_LOGOUT',
        resourceType: 'USER',
        resourceId: actor.sub,
      },
    });
    return { loggedOut: true };
  }

  async actor(req: Request): Promise<Actor> {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const secret = this.accessSecret();
    if (!token) throw new UnauthorizedException('缺少访问令牌');

    let payload: Actor;
    try {
      payload = await this.jwt.verifyAsync<Actor>(token, {
        secret,
        issuer: process.env.JWT_ISSUER || 'weight-care-api',
        audience: process.env.JWT_AUDIENCE || 'weight-care-clients',
      });
    } catch {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }
    if (
      payload.typ !== ACCESS_TOKEN_TYPE ||
      !payload.sub ||
      !Object.values(UserRole).includes(payload.role)
    ) {
      throw new UnauthorizedException('访问令牌类型无效');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.role !== payload.role) {
      throw new UnauthorizedException('账号不可用');
    }
    return payload;
  }

  verifyRequest(req: Request) {
    return this.actor(req);
  }

  assertRole(actor: Actor, ...allowedRoles: UserRole[]) {
    if (!allowedRoles.includes(actor.role)) {
      throw new ForbiddenException('当前角色无权执行此操作');
    }
  }

  async profile(actor: Actor) {
    const user = await this.findActiveUserWithProfile(actor.sub);
    return this.userView(user);
  }

  async updateProfile(actor: Actor, dto: UpdateProfileDto) {
    const user = await this.findActiveUserWithProfile(actor.sub);
    const patientData =
      user.role === UserRole.PATIENT
        ? {
            gender: dto.gender,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
            heightCm: dto.heightCm,
            initialWeightKg: dto.initialWeightKg,
            medicalHistory: dto.medicalHistory,
            allergies: dto.allergies,
            emergencyContactName: dto.emergencyContactName?.trim(),
            emergencyContactPhone: dto.emergencyContactPhone
              ? this.normalizePhone(dto.emergencyContactPhone)
              : undefined,
          }
        : undefined;
    const practitionerData =
      user.role === UserRole.DOCTOR || user.role === UserRole.NUTRITIONIST
        ? {
            hospital: dto.hospital?.trim(),
            department: dto.department?.trim(),
            title: dto.title?.trim(),
            specialty: dto.specialty?.trim(),
            licenseNumber: dto.licenseNumber?.trim(),
            introduction: dto.introduction?.trim(),
          }
        : undefined;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.user.update({
          where: { id: actor.sub },
          data: {
            displayName: dto.displayName?.trim(),
            avatarUrl: dto.avatarUrl?.trim(),
            email: dto.email?.trim().toLowerCase(),
            patientProfile: patientData
              ? { upsert: { create: patientData, update: patientData } }
              : undefined,
            practitionerProfile: practitionerData
              ? { upsert: { create: practitionerData, update: practitionerData } }
              : undefined,
          },
          include: { patientProfile: true, practitionerProfile: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.sub,
            action: 'USER_PROFILE_UPDATE',
            resourceType: 'USER',
            resourceId: actor.sub,
          },
        });
        return row;
      });
      return this.userView(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('邮箱或执业证号已被使用');
      }
      throw error;
    }
  }

  async updateTargetWeight(actor: Actor, dto: TargetWeightDto) {
    this.assertRole(actor, UserRole.PATIENT);
    const profile = await this.prisma.patientProfile.upsert({
      where: { userId: actor.sub },
      create: { userId: actor.sub, targetWeightKg: dto.targetWeightKg },
      update: { targetWeightKg: dto.targetWeightKg },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: actor.sub,
        action: 'PATIENT_TARGET_WEIGHT_UPDATE',
        resourceType: 'PATIENT_PROFILE',
        resourceId: profile.id,
        metadata: { targetWeightKg: dto.targetWeightKg },
      },
    });
    return { targetWeightKg: Number(profile.targetWeightKg) };
  }

  async changePassword(actor: Actor, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.sub } });
    if (!user?.passwordHash || !(await this.verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('当前密码错误');
    }
    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.sub }, data: { passwordHash } });
      await tx.refreshToken.updateMany({ where: { userId: actor.sub, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: actor.sub, action: 'AUTH_PASSWORD_CHANGE', resourceType: 'USER', resourceId: actor.sub } });
    });
    return { changed: true, sessionsRevoked: true };
  }

  private async issueSession(user: UserWithProfile, metadata: SessionMetadata) {
    const refreshToken = this.newRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        familyId: randomUUID(),
        expiresAt: this.refreshExpiresAt(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      user: this.userView(user),
    };
  }

  private async signAccessToken(user: Pick<UserWithProfile, 'id' | 'role'>) {
    const payload: Actor = {
      sub: user.id,
      role: user.role,
      typ: ACCESS_TOKEN_TYPE,
      jti: randomUUID(),
    };
    return this.jwt.signAsync(payload, {
      secret: this.accessSecret(),
      expiresIn: (process.env.ACCESS_TOKEN_TTL || '15m') as never,
      issuer: process.env.JWT_ISSUER || 'weight-care-api',
      audience: process.env.JWT_AUDIENCE || 'weight-care-clients',
    });
  }

  private async recordSuccessfulLogin(
    userId: string,
    metadata: SessionMetadata,
    action: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
      this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action,
          resourceType: 'USER',
          resourceId: userId,
          ipAddress: metadata.ipAddress,
        },
      }),
    ]);
  }

  private async findActiveUserWithProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { patientProfile: true, practitionerProfile: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('账号不可用');
    return user;
  }

  private async findUserByPhoneAndRole(
    client: PrismaService | Prisma.TransactionClient,
    phone: string,
    role?: Exclude<UserRole, 'ADMIN'>,
  ): Promise<UserWithProfile | null> {
    const users = (client as Prisma.TransactionClient).user;
    if (role) {
      return users.findUnique({
        where: { phone_role: { phone, role } },
        include: { patientProfile: true, practitionerProfile: true },
      });
    }

    const matches = await users.findMany({
      where: {
        phone,
        role: { in: [UserRole.PATIENT, UserRole.DOCTOR, UserRole.NUTRITIONIST] },
      },
      include: { patientProfile: true, practitionerProfile: true },
      take: 2,
    });
    if (matches.length > 1) {
      throw new BadRequestException('该手机号存在多个身份账号，请选择登录身份');
    }
    return matches[0] ?? null;
  }

  private async findPractitionerByPhone(
    client: PrismaService | Prisma.TransactionClient,
    phone: string,
  ): Promise<UserWithProfile | null> {
    const users = (client as Prisma.TransactionClient).user;
    const matches = await users.findMany({
      where: {
        phone,
        role: { in: [UserRole.DOCTOR, UserRole.NUTRITIONIST] },
      },
      include: { patientProfile: true, practitionerProfile: true },
      take: 2,
    });
    if (matches.length > 1) {
      throw new BadRequestException('该手机号存在多个执业身份账号，请联系管理员处理');
    }
    return matches[0] ?? null;
  }

  private async consumeChallenge(
    challengeId: string,
    phone: string,
    purpose: SmsPurpose,
    code: string,
  ) {
    return this.verifyChallenge(
      this.prisma,
      challengeId,
      phone,
      purpose,
      code,
      true,
    );
  }

  private async verifyChallenge(
    client: Pick<Prisma.TransactionClient, 'smsChallenge'>,
    challengeId: string,
    phone: string,
    purpose: SmsPurpose,
    code: string,
    consume: boolean,
  ) {
    const now = new Date();
    const challenge = await client.smsChallenge.findFirst({
      where: {
        id: challengeId,
        phone,
        purpose,
        usedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!challenge || challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException('验证码无效或已过期');
    }

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(this.hashSmsCode(phone, purpose, code), 'hex');
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!matches) {
      await client.smsChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('验证码无效或已过期');
    }

    const claimed = await client.smsChallenge.updateMany({
      where: {
        id: challenge.id,
        usedAt: null,
        attempts: { lt: challenge.maxAttempts },
        expiresAt: { gt: now },
      },
      data: {
        verifiedAt: challenge.verifiedAt || now,
        usedAt: consume ? now : undefined,
      },
    });
    if (claimed.count !== 1) throw new BadRequestException('验证码已被使用');
    return true;
  }

  private userView(user: UserWithProfile) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      patientProfile: user.patientProfile
        ? {
            gender: user.patientProfile.gender,
            birthDate: user.patientProfile.birthDate,
            heightCm: this.decimalNumber(user.patientProfile.heightCm),
            targetWeightKg: this.decimalNumber(user.patientProfile.targetWeightKg),
            initialWeightKg: this.decimalNumber(user.patientProfile.initialWeightKg),
            medicalHistory: user.patientProfile.medicalHistory,
            allergies: user.patientProfile.allergies,
            emergencyContactName: user.patientProfile.emergencyContactName,
            emergencyContactPhone: user.patientProfile.emergencyContactPhone,
          }
        : null,
      practitionerProfile: user.practitionerProfile
        ? {
            hospital: user.practitionerProfile.hospital,
            department: user.practitionerProfile.department,
            title: user.practitionerProfile.title,
            specialty: user.practitionerProfile.specialty,
            licenseNumber: user.practitionerProfile.licenseNumber,
            introduction: user.practitionerProfile.introduction,
            verifiedAt: user.practitionerProfile.verifiedAt,
          }
        : null,
    };
  }

  private decimalNumber(value: Prisma.Decimal | null) {
    return value === null ? null : value.toNumber();
  }

  private normalizePhone(phone: string) {
    return phone.replace(/^\+?86/, '');
  }

  private assertPractitionerRegistrationCode(value?: string) {
    const configured = (process.env.PRACTITIONER_REGISTRATION_CODES ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!configured.length) {
      throw new ServiceUnavailableException('医护人员自助注册暂未开放，请联系管理员');
    }
    if (!value) throw new ForbiddenException('请输入有效的医护注册邀请码');
    const actual = createHash('sha256').update(value.trim()).digest();
    const matches = configured.some((item) => {
      const expected = createHash('sha256').update(item).digest();
      return timingSafeEqual(actual, expected);
    });
    if (!matches) throw new ForbiddenException('医护注册邀请码无效');
  }

  private accessSecret() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
    }
    return secret;
  }

  private smsPepper() {
    const pepper = process.env.SMS_CODE_PEPPER || process.env.JWT_ACCESS_SECRET;
    if (!pepper || pepper.length < 32) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('SMS_CODE_PEPPER must contain at least 32 characters');
      }
      return 'local-development-sms-pepper-only-change-me';
    }
    return pepper;
  }

  private hashSmsCode(phone: string, purpose: SmsPurpose, code: string) {
    return createHash('sha256')
      .update(`${phone}:${purpose}:${code}:${this.smsPepper()}`)
      .digest('hex');
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private newRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private refreshExpiresAt() {
    const configured = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
    const days = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 365) : 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private smsTtlSeconds() {
    const configured = Number.parseInt(process.env.SMS_CODE_TTL_SECONDS || '300', 10);
    return Number.isFinite(configured) ? Math.min(Math.max(configured, 120), 600) : 300;
  }

  private hashPassword(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  private async verifyPassword(passwordHash: string, password: string) {
    if (this.isLegacyPasswordHash(passwordHash)) {
      const [, iterationsText, salt, expectedHex] = passwordHash.split('$');
      const iterations = Number(iterationsText);
      if (!salt || !expectedHex || !Number.isInteger(iterations) || iterations < 1) return false;
      const expected = Buffer.from(expectedHex, 'hex');
      const actual = pbkdf2Sync(password, salt, iterations, expected.length, 'sha512');
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    }
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  private isLegacyPasswordHash(passwordHash: string) {
    return passwordHash.startsWith('legacy-pbkdf2$');
  }

  private requestMetadata(req?: Request): SessionMetadata {
    if (!req) return {};
    return {
      ipAddress: (req.ip || req.socket.remoteAddress || '').slice(0, 64) || undefined,
      userAgent: req.headers['user-agent']?.slice(0, 500),
    };
  }

  private async deliverSms(phone: string, purpose: SmsPurpose, code: string) {
    if (this.smsDelivery?.isConfigured()) {
      await this.smsDelivery.sendVerificationCode(phone, code);
      return;
    }
    const endpoint = process.env.SMS_DELIVERY_WEBHOOK_URL;
    if (!endpoint) return;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.SMS_DELIVERY_WEBHOOK_TOKEN
            ? { authorization: `Bearer ${process.env.SMS_DELIVERY_WEBHOOK_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ phone, purpose, code, ttlSeconds: this.smsTtlSeconds() }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ServiceUnavailableException('短信发送失败，请稍后重试');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('短信发送失败，请稍后重试');
    }
  }

  private async exchangeWechatCode(code: string): Promise<{
    openid: string;
    unionid?: string;
  }> {
    const appId = process.env.WECHAT_MINI_APP_ID;
    const appSecret = process.env.WECHAT_MINI_APP_SECRET;
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException('微信小程序登录未配置');
    }
    const query = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    });
    let response: Response;
    try {
      response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${query}`, {
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ServiceUnavailableException('微信登录服务暂时不可用');
    }
    if (!response.ok) throw new ServiceUnavailableException('微信登录服务暂时不可用');
    let payload: { openid?: string; unionid?: string; errcode?: number };
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      throw new ServiceUnavailableException('微信登录服务暂时不可用');
    }
    if (!payload.openid || payload.errcode) {
      throw new UnauthorizedException('微信登录凭证无效或已过期');
    }
    return { openid: payload.openid, unionid: payload.unionid };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, req);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, req);
  }

  @Post('practitioner-login')
  practitionerLogin(@Body() dto: PractitionerLoginDto, @Req() req: Request) {
    return this.auth.practitionerLogin(dto, req);
  }

  @Post('practitioner-sms-login')
  practitionerSmsLogin(@Body() dto: PractitionerSmsLoginDto, @Req() req: Request) {
    return this.auth.practitionerSmsLogin(dto, req);
  }

  @Post('sms/send')
  sendSms(@Body() dto: SendSmsDto) {
    return this.auth.sendSms(dto);
  }

  @Post('send-sms')
  sendSmsLegacy(@Body() dto: SendSmsDto) {
    return this.auth.sendSms(dto);
  }

  @Post('sms/verify')
  verifySms(@Body() dto: VerifySmsDto) {
    return this.auth.verifySms(dto);
  }

  @Post('sms/login')
  smsLogin(@Body() dto: SmsLoginDto, @Req() req: Request) {
    return this.auth.smsLogin(dto, req);
  }

  @Post('wechat/login')
  wechatLogin(@Body() dto: WechatLoginDto, @Req() req: Request) {
    return this.auth.wechatLogin(dto, req);
  }

  @Post('wechat/register')
  wechatRegister(@Body() dto: WechatLoginDto, @Req() req: Request) {
    return this.auth.wechatLogin(dto, req);
  }

  @Post('password/reset')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, req);
  }

  @Post('practitioner-password/reset')
  practitionerResetPassword(@Body() dto: PractitionerResetPasswordDto, @Req() req: Request) {
    return this.auth.practitionerResetPassword(dto, req);
  }

  @Post('forgot-password/reset')
  resetPasswordLegacy(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto, req);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto, req);
  }

  @Post('logout')
  async logout(@Body() dto: LogoutDto, @Req() req: Request) {
    return this.auth.logout(await this.auth.actor(req), dto);
  }

  @Get('me')
  async profile(@Req() req: Request) {
    return this.auth.profile(await this.auth.actor(req));
  }

  @Get('profile')
  async profileLegacy(@Req() req: Request) {
    return this.auth.profile(await this.auth.actor(req));
  }

  @Patch('me')
  async updateProfile(@Body() dto: UpdateProfileDto, @Req() req: Request) {
    return this.auth.updateProfile(await this.auth.actor(req), dto);
  }

  @Patch('profile')
  async updateProfileLegacy(@Body() dto: UpdateProfileDto, @Req() req: Request) {
    return this.auth.updateProfile(await this.auth.actor(req), dto);
  }

  @Patch('me/target-weight')
  async updateTargetWeight(@Body() dto: TargetWeightDto, @Req() req: Request) {
    return this.auth.updateTargetWeight(await this.auth.actor(req), dto);
  }

  @Patch('password')
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.auth.changePassword(await this.auth.actor(req), dto);
  }
}
