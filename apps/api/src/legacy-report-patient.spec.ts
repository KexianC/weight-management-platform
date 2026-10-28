import { CareManagementService } from './care-management';
import { ReportWorkflowService } from './report-workflow';
const req = {} as any;
const self = {sub:'legacy',role:'PATIENT',typ:'access',jti:'synthetic'} as const;
function setup(actor: any = self) {
  const db: any = {
    user:{findUnique:jest.fn().mockResolvedValue({id:'legacy',role:'PATIENT',status:'ACTIVE',careEnrollment:null,displayName:'Synthetic',phone:'synthetic',avatarUrl:null})},
    careEnrollment:{findUnique:jest.fn().mockResolvedValue(null)},
    bodyAssessment:{findMany:jest.fn().mockResolvedValue([{id:'own-body',patientId:'legacy'}])},
    posturePhoto:{findMany:jest.fn().mockResolvedValue([]),findUnique:jest.fn().mockResolvedValue(null)},
    exercisePrescription:{findMany:jest.fn()},
    healthReportDocument:{findMany:jest.fn().mockResolvedValue([]),findUnique:jest.fn().mockResolvedValue({patientId:'legacy'}),create:jest.fn().mockResolvedValue({id:'report',patientId:'legacy',mediaAssetId:'asset',category:'BODY_COMPOSITION'})},
    consentDocument:{findUnique:jest.fn().mockResolvedValue(null)},ocrDraft:{findUnique:jest.fn().mockResolvedValue(null)},
    mediaAsset:{findUnique:jest.fn().mockResolvedValue({id:'asset',ownerId:'legacy',status:'READY',mimeType:'image/png',referenceType:null,referenceId:null,healthRecordId:null}),updateMany:jest.fn().mockResolvedValue({count:1})},
    auditLog:{create:jest.fn()},careRelation:{findUnique:jest.fn()},
  };
  db.$transaction=jest.fn((fn)=>fn(db));
  const clinical: any = {actor:jest.fn().mockResolvedValue(actor),assertCare:jest.fn()};
  const care=new CareManagementService(db,clinical);
  return {db,care,workflow:new ReportWorkflowService(db,clinical,care)};
}
describe('legacy self report boundary',()=>{
  it('returns actual own archive without manufacturing enrollment or exercise authorization',async()=>{
    const {db,care}=setup(); const result=await care.patient(req,'legacy');
    expect(result).toMatchObject({enrollment:null,legacyAccount:true,bodyReports:[{id:'own-body'}],exerciseReports:[]});
    expect(db.exercisePrescription.findMany).not.toHaveBeenCalled();expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('reads own document list without enrollment and authorizes original through both gates',async()=>{
    const {care,workflow}=setup();expect(await workflow.healthReports(req,'legacy')).toEqual([]);
    expect(await care.canAccessMedia(self,'asset')).toBe(true);expect(await workflow.canAccessMedia(self,'asset')).toBe(true);
  });
  it('binds a self-uploaded original with transaction user status recheck, no enrollment writes',async()=>{
    const {db,workflow}=setup();await workflow.createHealthReport(req,'legacy',{mediaAssetId:'asset',category:'BODY_COMPOSITION'});
    expect(db.user.findUnique).toHaveBeenCalledTimes(2);expect(db.careEnrollment.findUnique).not.toHaveBeenCalled();
    expect(db.mediaAsset.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({ownerId:'legacy',referenceType:null}),data:expect.objectContaining({referenceType:'HEALTH_REPORT'})}));
  });
  it('denies another patient before any report or identity query',async()=>{
    const {db,care,workflow}=setup();await expect(care.patient(req,'other')).rejects.toThrow('本人');await expect(workflow.healthReports(req,'other')).rejects.toThrow('本人');
    db.healthReportDocument.findUnique.mockResolvedValue({patientId:'other'});expect(await care.canAccessMedia(self,'other-asset')).toBe(false);
    expect(db.user.findUnique).not.toHaveBeenCalled();expect(db.healthReportDocument.findMany).not.toHaveBeenCalled();
  });
  it.each([{role:'PATIENT',status:'DISABLED'},{role:'DOCTOR',status:'ACTIVE'},null])('denies stale self user state %j',async(user)=>{
    const {db,care,workflow}=setup();db.user.findUnique.mockResolvedValue(user);
    await expect(care.patient(req,'legacy')).rejects.toThrow();await expect(workflow.healthReports(req,'legacy')).rejects.toThrow();
    expect(await care.canAccessMedia(self,'asset')).toBe(false);
  });
  it('rejects status changed before transactional original binding',async()=>{
    const {db,workflow}=setup();db.user.findUnique.mockResolvedValueOnce({id:'legacy',role:'PATIENT',status:'ACTIVE'}).mockResolvedValue({role:'PATIENT',status:'DISABLED'});
    await expect(workflow.createHealthReport(req,'legacy',{mediaAssetId:'asset',category:'BODY_COMPOSITION'})).rejects.toThrow();
    expect(db.healthReportDocument.create).not.toHaveBeenCalled();
  });
  it('keeps consent/OCR writes behind actual enrollment',async()=>{
    const {db,workflow}=setup();await expect(workflow.createConsentDocument(req,'legacy',{mediaAssetId:'asset',version:'1.0'})).rejects.toThrow('档案');
    expect(db.mediaAsset.updateMany).not.toHaveBeenCalled();
  });
  it.each(['NUTRITIONIST','EXERCISE_COACH','DOCTOR','ADMIN'])('does not expand %s assignment/original permission',async(role)=>{
    const {care,workflow}=setup({...self,sub:'staff',role});await expect(workflow.healthReports(req,'legacy')).rejects.toThrow();expect(await care.canAccessMedia({...self,sub:'staff',role} as any,'asset')).toBe(false);
  });
});
