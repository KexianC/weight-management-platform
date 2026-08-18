import {
  FollowUpStatus,
  HealthRecordType,
  MealType,
  NotificationType,
  Priority,
  PrismaClient,
  TaskStatus,
  TaskType,
  UserRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function upsertUser(input: {
  phone: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { phone_role: { phone: input.phone, role: input.role } },
    create: input,
    update: {
      displayName: input.displayName,
      role: input.role,
      passwordHash: input.passwordHash,
      status: 'ACTIVE',
      disabledAt: null,
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Refusing to create demo accounts in production without ALLOW_DEMO_SEED=true');
  }

  const password = process.env.SEED_DEMO_PASSWORD || 'WeightCareDemo!2026';
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const [admin, doctor, nutritionist, patient] = await Promise.all([
    upsertUser({ phone: '13800000000', displayName: '系统管理员', role: UserRole.ADMIN, passwordHash }),
    upsertUser({ phone: '13800000001', displayName: '林医生', role: UserRole.DOCTOR, passwordHash }),
    upsertUser({ phone: '13800000002', displayName: '周营养师', role: UserRole.NUTRITIONIST, passwordHash }),
    upsertUser({ phone: '13800000003', displayName: '陈晨', role: UserRole.PATIENT, passwordHash }),
  ]);

  await Promise.all([
    prisma.patientProfile.upsert({
      where: { userId: patient.id },
      create: {
        userId: patient.id,
        gender: 'FEMALE',
        birthDate: new Date('1992-04-18T00:00:00.000Z'),
        heightCm: 165,
        initialWeightKg: 74.8,
        targetWeightKg: 62,
      },
      update: { heightCm: 165, initialWeightKg: 74.8, targetWeightKg: 62 },
    }),
    prisma.practitionerProfile.upsert({
      where: { userId: doctor.id },
      create: {
        userId: doctor.id,
        hospital: '示范市中心医院',
        department: '内分泌科',
        title: '主治医师',
        specialty: '肥胖与代谢综合征管理',
        licenseNumber: 'DEMO-DOCTOR-001',
        verifiedAt: new Date(),
      },
      update: {
        hospital: '示范市中心医院',
        department: '内分泌科',
        title: '主治医师',
        specialty: '肥胖与代谢综合征管理',
        verifiedAt: new Date(),
      },
    }),
    prisma.practitionerProfile.upsert({
      where: { userId: nutritionist.id },
      create: {
        userId: nutritionist.id,
        hospital: '示范市中心医院',
        department: '营养科',
        title: '注册营养师',
        specialty: '医学营养减重',
        licenseNumber: 'DEMO-NUTRITION-001',
        verifiedAt: new Date(),
      },
      update: {
        hospital: '示范市中心医院',
        department: '营养科',
        title: '注册营养师',
        specialty: '医学营养减重',
        verifiedAt: new Date(),
      },
    }),
  ]);

  const invite = await prisma.careInvite.upsert({
    where: { code: 'DEMO2026' },
    create: {
      code: 'DEMO2026',
      practitionerId: doctor.id,
      expiresAt: new Date('2099-12-31T23:59:59.000Z'),
      maxUses: 100,
      useCount: 1,
    },
    update: {
      practitionerId: doctor.id,
      expiresAt: new Date('2099-12-31T23:59:59.000Z'),
      maxUses: 100,
      status: 'ACTIVE',
    },
  });

  await Promise.all([
    prisma.careRelation.upsert({
      where: { patientId_practitionerId: { patientId: patient.id, practitionerId: doctor.id } },
      create: {
        patientId: patient.id,
        practitionerId: doctor.id,
        inviteId: invite.id,
        status: 'ACTIVE',
        bindMethod: 'SEED',
      },
      update: { inviteId: invite.id, status: 'ACTIVE', endedAt: null, endedReason: null },
    }),
    prisma.careRelation.upsert({
      where: {
        patientId_practitionerId: { patientId: patient.id, practitionerId: nutritionist.id },
      },
      create: {
        patientId: patient.id,
        practitionerId: nutritionist.id,
        status: 'ACTIVE',
        bindMethod: 'SEED',
      },
      update: { status: 'ACTIVE', endedAt: null, endedReason: null },
    }),
  ]);

  const now = Date.now();
  await Promise.all([
    prisma.healthRecord.upsert({
      where: { id: 'seed-weight-001' },
      create: {
        id: 'seed-weight-001',
        patientId: patient.id,
        recordType: HealthRecordType.WEIGHT,
        weightKg: 69.6,
        waistCm: 82.5,
        measuredAt: new Date(now - 24 * 60 * 60 * 1000),
        source: 'SEED',
      },
      update: { patientId: patient.id, weightKg: 69.6, waistCm: 82.5 },
    }),
    prisma.healthRecord.upsert({
      where: { id: 'seed-weight-002' },
      create: {
        id: 'seed-weight-002',
        patientId: patient.id,
        recordType: HealthRecordType.WEIGHT,
        weightKg: 70.2,
        measuredAt: new Date(now - 8 * 24 * 60 * 60 * 1000),
        source: 'SEED',
      },
      update: { patientId: patient.id, weightKg: 70.2 },
    }),
    prisma.healthRecord.upsert({
      where: { id: 'seed-diet-001' },
      create: {
        id: 'seed-diet-001',
        patientId: patient.id,
        recordType: HealthRecordType.DIET,
        mealType: MealType.LUNCH,
        mealItems: [
          { foodName: '杂粮饭', amountGrams: 120, caloriesKcal: 180 },
          { foodName: '清炒时蔬', amountGrams: 220, caloriesKcal: 145 },
          { foodName: '鸡胸肉', amountGrams: 100, caloriesKcal: 165 },
        ],
        caloriesKcal: 490,
        measuredAt: new Date(now - 6 * 60 * 60 * 1000),
        source: 'SEED',
      },
      update: { patientId: patient.id, caloriesKcal: 490 },
    }),
  ]);

  await prisma.patientTask.upsert({
    where: { id: 'seed-task-001' },
    create: {
      id: 'seed-task-001',
      patientId: patient.id,
      assignedById: nutritionist.id,
      taskType: TaskType.DIET,
      priority: Priority.NORMAL,
      title: '记录今日三餐',
      description: '请完整记录三餐及加餐内容',
      status: TaskStatus.PENDING,
      dueAt: new Date(now + 24 * 60 * 60 * 1000),
    },
    update: {
      patientId: patient.id,
      assignedById: nutritionist.id,
      status: TaskStatus.PENDING,
    },
  });

  await prisma.followUp.upsert({
    where: { id: 'seed-follow-up-001' },
    create: {
      id: 'seed-follow-up-001',
      patientId: patient.id,
      practitionerId: doctor.id,
      type: 'WEIGHT',
      priority: Priority.NORMAL,
      scheduledAt: new Date(now + 2 * 24 * 60 * 60 * 1000),
      status: FollowUpStatus.SCHEDULED,
      note: '复核最近一周体重变化与用药情况',
    },
    update: {
      patientId: patient.id,
      practitionerId: doctor.id,
      status: FollowUpStatus.SCHEDULED,
    },
  });

  await Promise.all([
    prisma.message.upsert({
      where: { id: 'seed-message-001' },
      create: {
        id: 'seed-message-001',
        senderId: doctor.id,
        receiverId: patient.id,
        content: '最近的体重下降节奏很好，请继续保持规律记录。',
      },
      update: { senderId: doctor.id, receiverId: patient.id },
    }),
    prisma.notification.upsert({
      where: { id: 'seed-notification-001' },
      create: {
        id: 'seed-notification-001',
        userId: patient.id,
        type: NotificationType.FOLLOW_UP,
        priority: Priority.NORMAL,
        title: '随访提醒',
        content: '两天后有一次体重管理随访，请提前完成健康记录。',
        relatedType: 'FOLLOW_UP',
        relatedId: 'seed-follow-up-001',
        actionPath: '/pages/patient/follow-up-detail?id=seed-follow-up-001',
      },
      update: { userId: patient.id, readAt: null },
    }),
    prisma.calorieEstimate.upsert({
      where: { id: 'seed-calorie-estimate-001' },
      create: {
        id: 'seed-calorie-estimate-001',
        userId: patient.id,
        foodName: '杂粮饭',
        amountGrams: 120,
        estimatedKcal: 180,
        source: 'SEED_RULE',
        result: { unitKcalPer100g: 150 },
        status: 'COMPLETED',
      },
      update: { userId: patient.id, estimatedKcal: 180, status: 'COMPLETED' },
    }),
  ]);

  console.log(
    `Seed complete: ${[admin.phone, doctor.phone, nutritionist.phone, patient.phone].join(', ')} (password from SEED_DEMO_PASSWORD or local default)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
