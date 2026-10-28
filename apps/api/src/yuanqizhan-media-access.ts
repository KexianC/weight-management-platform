import type { MediaAsset, Prisma } from '@prisma/client';
import type { Actor } from './auth';

type AccessDatabase = Pick<Prisma.TransactionClient, 'user' | 'careRelation' | 'careEnrollment' | 'yuanqizhanPhoto'>;

/** Activity selection never grants a staff member access to health content. */
export async function canReadYuanqizhanHealth(prisma: AccessDatabase, actor: Actor, patientId: string): Promise<boolean> {
  if (!['PATIENT', 'DOCTOR', 'HEALTH_MANAGER', 'NUTRITIONIST'].includes(actor.role)) return false;
  if (actor.role === 'PATIENT' && actor.sub !== patientId) return false;
  const patient = await prisma.user.findUnique({ where: { id: patientId }, select: { role: true, status: true } });
  if (!patient || patient.role !== 'PATIENT' || patient.status !== 'ACTIVE') return false;
  if (actor.role === 'PATIENT') return true;
  if (actor.role === 'NUTRITIONIST') {
    const staff = await prisma.user.findUnique({ where: { id: actor.sub }, select: { role: true, status: true } });
    if (!staff || staff.role !== 'NUTRITIONIST' || staff.status !== 'ACTIVE') return false;
  }
  const [relation, enrollment] = await Promise.all([
    prisma.careRelation.findFirst({ where: { patientId, practitionerId: actor.sub, status: 'ACTIVE' }, select: { id: true } }),
    prisma.careEnrollment.findUnique({ where: { patientId }, select: { healthManagerId: true, doctorId: true, nutritionistId: true } }),
  ]);
  if (!relation) return false;
  // Legacy patients can have a valid relation without a managed-care enrollment.
  if (!enrollment) return true;
  const assigned = actor.role === 'DOCTOR' ? enrollment.doctorId : actor.role === 'NUTRITIONIST' ? enrollment.nutritionistId : enrollment.healthManagerId;
  return assigned === actor.sub;
}

export async function canReadYuanqizhanMedia(
  prisma: AccessDatabase, actor: Actor,
  asset: Pick<MediaAsset, 'id' | 'ownerId' | 'referenceType' | 'referenceId' | 'healthRecordId'>,
): Promise<boolean> {
  if (asset.referenceType !== 'YUANQIZHAN_PHOTO' || !asset.referenceId || asset.healthRecordId) return false;
  const photo = await prisma.yuanqizhanPhoto.findUnique({
    where: { assetId: asset.id }, select: { memberId: true, member: { select: { patientId: true } } },
  });
  if (!photo || photo.memberId !== asset.referenceId || photo.member.patientId !== asset.ownerId) return false;
  // Removed/ended members retain originals; access still requires current health authorization.
  return canReadYuanqizhanHealth(prisma, actor, photo.member.patientId);
}
