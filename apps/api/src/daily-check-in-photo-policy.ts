import type { MediaAsset, Prisma } from '@prisma/client';
import type { Actor } from './auth';

export const DAILY_PHOTO_TYPE = 'DAILY_CHECK_IN_MEAL_PHOTO';
export const DAILY_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type DailyMeal = typeof DAILY_MEALS[number];
export const DAILY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const DAILY_PHOTO_DAILY_LIMIT = 30;

export function mealPhotoIds(answers: unknown): string[] {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return [];
  return DAILY_MEALS.flatMap(meal => {
    const value = (answers as Record<string, unknown>)[`${meal}_photo_ids`];
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  });
}

/** Business authorization is independent of upload ownership and capability links. */
export async function canReadDailyCheckInPhoto(db: Prisma.TransactionClient, actor: Actor, asset: MediaAsset) {
  if (asset.referenceType !== DAILY_PHOTO_TYPE || asset.status !== 'READY' || asset.deletedAt
    || !['HEALTH_MANAGER', 'DOCTOR', 'NUTRITIONIST'].includes(actor.role)) return false;
  const match = /^(\d{4}-\d{2}-\d{2}):(breakfast|lunch|dinner)$/.exec(asset.referenceId ?? '');
  if (!match) return false;
  const patient = await db.user.findUnique({ where: { id: asset.ownerId }, select: { role: true, status: true, deletedAt: true } });
  if (!patient || patient.role !== 'PATIENT' || patient.status !== 'ACTIVE' || patient.deletedAt) return false;
  const record = await db.dailyCheckInRecord.findUnique({ where: { patientId_date: { patientId: asset.ownerId, date: match[1] } } });
  const ids = (record?.answers as Record<string, unknown> | undefined)?.[`${match[2]}_photo_ids`];
  if (!Array.isArray(ids) || !ids.includes(asset.id)) return false;
  if (actor.role === 'HEALTH_MANAGER') return true;
  const [enrollment, relation] = await Promise.all([
    db.careEnrollment.findUnique({ where: { patientId: asset.ownerId }, select: { doctorId: true, nutritionistId: true } }),
    db.careRelation.findFirst({ where: { patientId: asset.ownerId, practitionerId: actor.sub, status: 'ACTIVE' }, select: { id: true } }),
  ]);
  const field = actor.role === 'DOCTOR' ? 'doctorId' : 'nutritionistId';
  return !!relation && (!enrollment || enrollment[field] === actor.sub);
}
