import { canReadYuanqizhanHealth, canReadYuanqizhanMedia } from './yuanqizhan-media-access';
import type { Actor } from './auth';

const actor = (role: Actor['role'], sub = 'staff-a'): Actor => ({ role, sub, typ: 'access', jti: 'synthetic' });
const asset = { id: 'photo-a', ownerId: 'patient-a', referenceType: 'YUANQIZHAN_PHOTO', referenceId: 'member-a', healthRecordId: null };
function database() {
  const users = new Map<string, any>([
    ['patient-a', { role: 'PATIENT', status: 'ACTIVE' }],
    ['staff-a', { role: 'NUTRITIONIST', status: 'ACTIVE' }],
  ]);
  return {
    users,
    user: { findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null) },
    careRelation: { findFirst: jest.fn().mockResolvedValue(null) },
    careEnrollment: { findUnique: jest.fn().mockResolvedValue(null) },
    yuanqizhanPhoto: { findUnique: jest.fn().mockResolvedValue({ memberId: 'member-a', member: { patientId: 'patient-a' } }) },
  };
}
describe('activity health and photo permissions', () => {
  it.each(['ADMIN', 'EXERCISE_COACH'] as const)('denies %s even if it knows a valid activity asset', async (role) => {
    const db = database();
    expect(await canReadYuanqizhanMedia(db as any, actor(role), asset)).toBe(false);
    expect(db.careRelation.findFirst).not.toHaveBeenCalled();
  });
  it('allows a currently bound legacy nutritionist to read retained records and activity originals', async () => {
    const db = database(); db.careRelation.findFirst.mockResolvedValue({ id: 'relation-a' } as any);
    expect(await canReadYuanqizhanHealth(db as any, actor('NUTRITIONIST'), 'patient-a')).toBe(true);
    expect(await canReadYuanqizhanMedia(db as any, actor('NUTRITIONIST'), asset)).toBe(true);
    expect(db.careRelation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ patientId: 'patient-a', practitionerId: 'staff-a', status: 'ACTIVE' }) }));
  });
  it('requires the assigned nutritionist even when another active legacy relation remains', async () => {
    const db = database(); db.careRelation.findFirst.mockResolvedValue({ id: 'relation-a' } as any);
    db.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: 'staff-b', doctorId: 'doctor', healthManagerId: 'manager' } as any);
    expect(await canReadYuanqizhanMedia(db as any, actor('NUTRITIONIST'), asset)).toBe(false);
    db.careEnrollment.findUnique.mockResolvedValue({ nutritionistId: 'staff-a', doctorId: 'doctor', healthManagerId: 'manager' } as any);
    expect(await canReadYuanqizhanMedia(db as any, actor('NUTRITIONIST'), asset)).toBe(true);
    db.careRelation.findFirst.mockResolvedValue(null);
    expect(await canReadYuanqizhanMedia(db as any, actor('NUTRITIONIST'), asset)).toBe(false);
  });
  it.each(['DISABLED', 'DELETED', 'wrong-role', 'missing'])('rejects a %s nutritionist despite a valid binding', async (status) => {
    const db = database(); db.careRelation.findFirst.mockResolvedValue({ id: 'relation-a' } as any);
    if (status === 'missing') db.users.delete('staff-a');
    else db.users.set('staff-a', { role: status === 'wrong-role' ? 'DOCTOR' : 'NUTRITIONIST', status: status === 'wrong-role' ? 'ACTIVE' : status });
    expect(await canReadYuanqizhanHealth(db as any, actor('NUTRITIONIST'), 'patient-a')).toBe(false);
  });
  it.each(['DISABLED', 'DELETED'])('rejects a %s patient even if a nutritionist relation remains active', async (status) => {
    const db = database(); db.careRelation.findFirst.mockResolvedValue({ id: 'relation-a' } as any);
    db.users.set('patient-a', { role: 'PATIENT', status });
    expect(await canReadYuanqizhanMedia(db as any, actor('NUTRITIONIST'), asset)).toBe(false);
  });
  it('rejects an unbound nutritionist and cannot bypass business binding checks', async () => {
    const db = database();
    expect(await canReadYuanqizhanMedia(db as any, actor('NUTRITIONIST'), asset)).toBe(false);
    db.careRelation.findFirst.mockResolvedValue({ id: 'relation-a' } as any);
    for (const patch of [{ referenceId: 'other-member' }, { ownerId: 'patient-b' }, { healthRecordId: 'diet-record' }, { referenceType: 'HEALTH_RECORD' }]) {
      expect(await canReadYuanqizhanMedia(db as any, actor('NUTRITIONIST'), { ...asset, ...patch })).toBe(false);
    }
  });
  it('allows only the patient whose retained membership owns the original', async () => {
    const db = database();
    expect(await canReadYuanqizhanMedia(db as any, actor('PATIENT', 'patient-a'), asset)).toBe(true);
    expect(await canReadYuanqizhanMedia(db as any, actor('PATIENT', 'patient-b'), asset)).toBe(false);
    expect(db.careRelation.findFirst).not.toHaveBeenCalled();
  });
  it('does not turn HM activity-management eligibility into global health access', async () => {
    const db = database();
    expect(await canReadYuanqizhanHealth(db as any, actor('HEALTH_MANAGER'), 'patient-a')).toBe(false);
  });
  it.each(['DOCTOR', 'HEALTH_MANAGER'] as const)('permits an existing active legacy relation to %s without enrollment', async (role) => {
    const db = database(); db.careRelation.findFirst.mockResolvedValue({ id: 'relation-a' } as any);
    expect(await canReadYuanqizhanHealth(db as any, actor(role), 'patient-a')).toBe(true);
  });
  it('requires the matching managed-care assignment in addition to an active relation', async () => {
    const db = database(); db.careRelation.findFirst.mockResolvedValue({ id: 'relation-a' } as any);
    db.careEnrollment.findUnique.mockResolvedValue({ doctorId: 'staff-b', healthManagerId: 'staff-b' } as any);
    expect(await canReadYuanqizhanHealth(db as any, actor('DOCTOR'), 'patient-a')).toBe(false);
    expect(await canReadYuanqizhanHealth(db as any, actor('HEALTH_MANAGER'), 'patient-a')).toBe(false);
  });
  it('fails closed for inactive patients and for missing or mismatched business bindings', async () => {
    const db = database(); db.user.findUnique.mockResolvedValue({ role: 'PATIENT', status: 'DISABLED' } as any);
    expect(await canReadYuanqizhanMedia(db as any, actor('PATIENT', 'patient-a'), asset)).toBe(false);
    db.user.findUnique.mockResolvedValue({ role: 'PATIENT', status: 'ACTIVE' });
    expect(await canReadYuanqizhanMedia(db as any, actor('PATIENT', 'patient-a'), { ...asset, referenceId: 'member-b' })).toBe(false);
    expect(await canReadYuanqizhanMedia(db as any, actor('PATIENT', 'patient-a'), { ...asset, ownerId: 'patient-b' })).toBe(false);
    expect(await canReadYuanqizhanMedia(db as any, actor('PATIENT', 'patient-a'), { ...asset, healthRecordId: 'diet-a' })).toBe(false);
    db.yuanqizhanPhoto.findUnique.mockResolvedValue(null as any);
    expect(await canReadYuanqizhanMedia(db as any, actor('PATIENT', 'patient-a'), asset)).toBe(false);
  });
});
