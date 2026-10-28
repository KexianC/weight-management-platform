import { assertSyntheticDatabaseBoundary } from './prisma.service';
import { nutritionPrivacy } from './privacy';
import { CareManagementService } from './care-management';
import type { PrismaService } from './prisma.service';
import type { ClinicalService } from './clinical';

describe('synthetic-only recovery boundary', () => {
  const restore = { RECONSTRUCTION_LOCAL_ONLY:'true', NODE_ENV:'test', API_BIND_ADDRESS:'127.0.0.1', PORT:'3311', RECONSTRUCTION_RESTORE_DB:'rebuild_weightcare_restore_abcdefgh', DATABASE_URL:'mysql://synthetic:synthetic@127.0.0.1:3307/rebuild_weightcare_restore_abcdefgh' };
  it('allows the standard synthetic database and explicit new loopback recovery database', () => {
    expect(() => assertSyntheticDatabaseBoundary({ ...restore, DATABASE_URL:'mysql://synthetic:synthetic@127.0.0.1:3307/rebuild_weightcare_test' })).not.toThrow();
    expect(() => assertSyntheticDatabaseBoundary(restore)).not.toThrow();
  });
  it.each([
    { NODE_ENV:'production' }, { API_BIND_ADDRESS:'0.0.0.0' }, { PORT:'3300' }, { RECONSTRUCTION_RESTORE_DB:'another' },
    { DATABASE_URL:'mysql://synthetic:synthetic@120.27.195.39:3307/rebuild_weightcare_restore_abcdefgh' },
    { DATABASE_URL:'mysql://synthetic:synthetic@127.0.0.1:3306/rebuild_weightcare_restore_abcdefgh' },
    { DATABASE_URL:'mysql://synthetic:synthetic@127.0.0.1:3307/production', RECONSTRUCTION_RESTORE_DB:'production' },
  ])('rejects boundary alteration %j', (patch) => {
    expect(() => assertSyntheticDatabaseBoundary({ ...restore,...patch })).toThrow('isolated synthetic boundary');
  });
});

describe('legacy numeric identity and complete client lists', () => {
  it('redacts identity-sized survey values and ID-card text while preserving numeric health answers', () => {
    const result=nutritionPrivacy({ answers:[{questionId:1,value:'11010119900101001X'},{questionId:2,value:110101199001010000},{questionId:3,value:'001234567890123456'},{questionId:4,value:1800},{questionId:5,value:'7.5'}], note:'合成证件 11010119900101001X' },[]);
    const text=JSON.stringify(result);
    expect(text).not.toContain('110101199001010');
    expect(text).not.toContain('001234567890123456');
    expect(text).toContain('1800');
    expect(text).toContain('7.5');
  });
  it('returns all 503 clients including legacy entries, with audited complete count and no write operation', async () => {
    const rows=Array.from({length:503},(_,n)=>({ id:'synthetic-'+n,role:'PATIENT',status:'ACTIVE',phone:'synthetic',displayName:'synthetic',careEnrollment:null }));
    const prisma={user:{findMany:jest.fn().mockImplementation(({take})=>Promise.resolve(take?rows.slice(0,take):rows))},auditLog:{create:jest.fn()},careRelation:{findMany:jest.fn().mockResolvedValue([])},$transaction:jest.fn()};
    const clinical={actor:jest.fn().mockResolvedValue({sub:'manager',role:'HEALTH_MANAGER'})};
    const service=new CareManagementService(prisma as unknown as PrismaService,clinical as unknown as ClinicalService);
    const result=await service.patients({} as any);
    expect(result).toHaveLength(503);
    expect(result[502]).toMatchObject({patient:{id:'synthetic-502'},enrollment:null,legacyAccount:true});
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({metadata:{returnedCount:503,complete:true}})}));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('dedicated cloud OCR synthetic database boundary',()=>{
 const good={RECONSTRUCTION_LOCAL_ONLY:'true',NODE_ENV:'test',API_BIND_ADDRESS:'127.0.0.1',PORT:'3359',RECONSTRUCTION_BODY_OCR_DB:'rebuild_body_cloud_20261014t024937z',DATABASE_URL:'mysql://synthetic:synthetic@127.0.0.1:3307/rebuild_body_cloud_20261014t024937z'};
 it('allows only the explicit same local OCR database and exact port',()=>{expect(()=>assertSyntheticDatabaseBoundary(good)).not.toThrow();for(const patch of [{NODE_ENV:'production'},{PORT:'3300'},{API_BIND_ADDRESS:'0.0.0.0'},{RECONSTRUCTION_BODY_OCR_DB:'other'},{DATABASE_URL:'mysql://synthetic:synthetic@120.27.195.39:3307/rebuild_body_cloud_20261014t024937z'}])expect(()=>assertSyntheticDatabaseBoundary({...good,...patch})).toThrow('isolated synthetic boundary');});
});
