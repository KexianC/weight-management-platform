import { ConflictException } from '@nestjs/common';

export type BusinessRole = 'PATIENT' | 'DOCTOR' | 'NUTRITIONIST' | 'HEALTH_MANAGER' | 'EXERCISE_COACH' | 'ADMIN';
export type FollowState = 'SCHEDULED' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';
export type TaskState = 'PENDING' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';

const practitionerRoles = new Set<BusinessRole>(['DOCTOR', 'NUTRITIONIST']);

export function practitionerPhoneKey(role: BusinessRole, phone: string) {
  return ['DOCTOR', 'NUTRITIONIST', 'HEALTH_MANAGER', 'EXERCISE_COACH'].includes(role) ? phone : null;
}

export function assertFollowUpTransition(current: FollowState, next: FollowState, role: BusinessRole) {
  if (current === next) return;
  const patientTransitions: Record<FollowState, FollowState[]> = {
    SCHEDULED: ['IN_PROGRESS', 'COMPLETED'],
    IN_PROGRESS: ['COMPLETED'],
    OVERDUE: ['IN_PROGRESS', 'COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const practitionerTransitions: Record<FollowState, FollowState[]> = {
    SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    OVERDUE: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const allowed = practitionerRoles.has(role) ? practitionerTransitions[current] : patientTransitions[current];
  if (!allowed.includes(next)) {
    throw new ConflictException(`随访状态不能从 ${current} 变更为 ${next}`);
  }
}

export function assertTaskTransition(current: TaskState, next: TaskState, role: BusinessRole) {
  if (current === next) return;
  const patientTransitions: Record<TaskState, TaskState[]> = {
    PENDING: ['IN_PROGRESS', 'COMPLETED'],
    IN_PROGRESS: ['COMPLETED'],
    OVERDUE: ['IN_PROGRESS', 'COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const practitionerTransitions: Record<TaskState, TaskState[]> = {
    PENDING: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    OVERDUE: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  const allowed = practitionerRoles.has(role) ? practitionerTransitions[current] : patientTransitions[current];
  if (!allowed.includes(next)) {
    throw new ConflictException(`任务状态不能从 ${current} 变更为 ${next}`);
  }
}

export function getRangeStart(range: string | undefined, now = new Date()) {
  const days = range === '90d' ? 90 : range === '30d' ? 30 : 7;
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const startUtc = Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth(),
    shanghaiNow.getUTCDate() - (days - 1),
  ) - 8 * 60 * 60 * 1000;
  return new Date(startUtc);
}

const commonCaloriesPer100g: Record<string, number> = {
  米饭: 116,
  馒头: 223,
  面条: 110,
  鸡蛋: 144,
  鸡胸肉: 133,
  牛肉: 125,
  猪肉: 242,
  鱼: 113,
  牛奶: 54,
  苹果: 53,
  香蕉: 93,
  西兰花: 36,
  青菜: 20,
  豆腐: 84,
  燕麦: 338,
};

export function estimateCalories(foodName: string, amountGrams: number) {
  const normalized = foodName.trim();
  const match = Object.entries(commonCaloriesPer100g).find(([name]) => normalized.includes(name));
  const per100g = match?.[1] ?? 120;
  return {
    caloriesKcal: Math.round((per100g * amountGrams) / 100),
    caloriesPer100g: per100g,
    source: match ? 'COMMON_FOOD_DATABASE' : 'GENERIC_ESTIMATE',
    disclaimer: '热量为估算值，仅用于体重管理参考，不能替代营养师评估。',
  };
}
