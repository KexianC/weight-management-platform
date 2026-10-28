import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api';
import { CareApi, matchesCareClient, ownsCareClient, type CareClient, bodyInput, safeShareUrl, validateMedia } from './care-api';
const json = (v:unknown,status=200) => new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json'}});
afterEach(()=>vi.unstubAllGlobals());
describe('managed care contract',()=>{
  it.each(['HEALTH_MANAGER','EXERCISE_COACH','NUTRITIONIST','DOCTOR'] as const)('logs in with explicit %s role',async(role)=>{
    const mock=vi.fn().mockResolvedValue(json({accessToken:'test-only-token',user:{id:'staff-test',displayName:'虚构人员',role,mustChangePassword:true}}));
    vi.stubGlobal('fetch',mock);
    const client=new ApiClient(()=>null,'http://127.0.0.1:3300/api/v1');
    const result=await client.login('13800000001','fixture-only',role);
    expect(result.user.role).toBe(role);expect(result.user.mustChangePassword).toBe(true);
    expect(mock.mock.calls[0][0]).toBe('http://127.0.0.1:3300/api/v1/auth/login');
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({phone:'13800000001',password:'fixture-only',role});
  });
  it('sends uploads as multipart without forging business references',async()=>{
    const mock=vi.fn().mockResolvedValue(json({id:'media-test'}));vi.stubGlobal('fetch',mock);
    const client=new CareApi(new ApiClient(()=>'test-only-token','http://127.0.0.1:3300/api/v1'));
    await client.upload(new File(['fixture'],'fixture.png',{type:'image/png'}),'image');
    const options=mock.mock.calls[0][1];
    expect(options.headers['content-type']).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect([...options.body.keys()]).toEqual(['file']);
    expect(options.headers.authorization).toBe('Bearer test-only-token');
  });
  it('does not rename muscle mass to skeletal muscle mass or convert circumference units',()=>{
    const form=new FormData();form.set('measuredAt','2026-01-01T10:00');form.set('muscleMassKg','40.5');form.set('skeletalMuscleMassKg','25.2');form.set('waistCm','90');form.set('hipCm','101.5');
    expect(bodyInput(form)).toMatchObject({muscleMassKg:40.5,skeletalMuscleMassKg:25.2,waistCm:90,hipCm:101.5});
    expect(bodyInput(form).weightKg).toBeUndefined();
    form.set('weightKg','0');expect(()=>bodyInput(form)).toThrow('体重超出有效范围');
  });
  it('does not invent metrics for an empty report',()=>{
    const form=new FormData();form.set('measuredAt','2026-01-01T10:00');expect(()=>bodyInput(form)).toThrow('至少填写一项');
  });
  it('rejects unsupported media before any upload',()=>{
    expect(()=>validateMedia(new File(['fixture'],'x.pdf',{type:'application/pdf'}),'image')).toThrow();
  });
  it('requires the configured API origin and media content path before sending a token',async()=>{
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);vi.stubGlobal('window',{location:{origin:'http://127.0.0.1:5173'}});
    const client=new ApiClient(()=>'test-only-token','http://127.0.0.1:3300/api/v1');
    await expect(client.mediaBlob('asset','https://external.example/api/v1/media/asset/content')).rejects.toThrow('媒体地址');
    await expect(client.mediaBlob('asset','http://127.0.0.1:3300/api/v1/media/other/content')).rejects.toThrow('媒体地址');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('authenticates media content and surfaces revoked access instead of an image',async()=>{
    const mock=vi.fn().mockResolvedValue(new Response('Forbidden',{status:403}));vi.stubGlobal('fetch',mock);vi.stubGlobal('window',{location:{origin:'http://127.0.0.1:5173'}});
    const client=new ApiClient(()=>'test-only-token','http://127.0.0.1:3300/api/v1');
    await expect(client.mediaBlob('asset','http://127.0.0.1:3300/api/v1/media/asset/content?sig=fixture')).rejects.toThrow('权限已失效');
    expect(mock.mock.calls[0][1]).toEqual({headers:{authorization:'Bearer test-only-token'},cache:'no-store',redirect:'error'});
  });
  it('keeps shared report delivery restricted to allowed durations and does not manufacture a patient origin',async()=>{
    const mock=vi.fn().mockResolvedValue(json({id:'s1'}));vi.stubGlobal('fetch',mock);
    const client=new CareApi(new ApiClient(()=>'test-only-token','http://127.0.0.1:3300/api/v1'));
    expect(()=>client.share('r1',2)).toThrow('1、7、14 或 30');
    expect(mock).not.toHaveBeenCalled();
    await client.share('r1',14);
    expect(JSON.parse(mock.mock.calls[0][1].body)).toEqual({expiresInDays:14,reviewed:true});
    expect(safeShareUrl('/#/pages/shared-report/shared-report?token=fixture')).toBeNull();
    expect(safeShareUrl('javascript:alert(1)')).toBeNull();
    expect(safeShareUrl('https://patient.example/#/report')).toBe('https://patient.example/#/report');
  });
  it('uses the typed nutrition endpoint, preserving reply history',async()=>{
    const fixture={items:[{id:'meal',reviews:[{id:'r1',comment:'第一条',replies:[{id:'reply',comment:'客户回复'}]},{id:'r2',comment:'第二条'}]}],total:1};
    const mock=vi.fn().mockResolvedValue(json(fixture));vi.stubGlobal('fetch',mock);
    const client=new CareApi(new ApiClient(()=>'test-only-token','http://127.0.0.1:3300/api/v1'));
    expect(await client.meals('client/1')).toEqual(fixture);
    expect(mock.mock.calls[0][0]).toContain('/nutrition/patients/client%2F1/records?recordType=DIET&pageSize=30&page=1');
  });
});


describe('legacy clients and history contracts',()=>{
  const legacy:CareClient={patient:{id:'legacy-1',displayName:'虚构历史客户',phone:'13800000002'},enrollment:null,legacyAccount:true,lifestyle:null};
  const enrolled:CareClient={patient:{id:'enrolled-1',displayName:'虚构建档客户'},enrollment:{id:'e1',patientId:'enrolled-1',clientCode:'KH-TEST',packageName:'虚构套餐',healthManagerId:'manager-1',nutritionistId:'n1',doctorId:'d1',exerciseCoachId:'c1',createdAt:'2026-01-01T00:00:00Z'}};
  it('keeps legacy clients searchable without manufacturing an enrollment',()=>{
    expect(matchesCareClient(legacy,'历史')).toBe(true);
    expect(matchesCareClient(legacy,'13800000002')).toBe(true);
    expect(matchesCareClient(legacy,'legacy-1')).toBe(true);
    expect(matchesCareClient(legacy,'KH-TEST')).toBe(false);
    expect(legacy.enrollment).toBeNull();
  });
  it('handles mixed search results and retains assignment-only manager write availability',()=>{
    expect([legacy,enrolled].filter(c=>matchesCareClient(c,''))).toHaveLength(2);
    expect([legacy,enrolled].filter(c=>matchesCareClient(c,'kh-test'))).toEqual([enrolled]);
    expect(ownsCareClient(legacy,{id:'manager-1',role:'HEALTH_MANAGER'})).toBe(false);
    expect(ownsCareClient(undefined,{id:'manager-1',role:'HEALTH_MANAGER'})).toBe(false);
    expect(ownsCareClient(enrolled,{id:'manager-1',role:'HEALTH_MANAGER'})).toBe(true);
    expect(ownsCareClient(enrolled,{id:'other',role:'HEALTH_MANAGER'})).toBe(false);
    expect(ownsCareClient(enrolled,{id:'manager-1',role:'NUTRITIONIST'})).toBe(false);
  });
  it('preserves nullable enrollment and mixed API rows without normalizing away clients',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(json([legacy,enrolled])));
    const client=new CareApi(new ApiClient(()=>'fixture-only-token','http://127.0.0.1:3300/api/v1'));
    expect(await client.patients()).toEqual([legacy,enrolled]);
  });
  it('requests an explicit historical page and preserves reply/media metadata',async()=>{
    const result={items:[{id:'older',recordType:'DIET',assets:[{id:'asset',mimeType:'image/png'}],reviews:[{id:'r',replies:[{id:'reply',comment:'虚构回复'}]}]}],total:31,page:2,pageSize:30,hasMore:false};
    const mock=vi.fn().mockResolvedValue(json(result));vi.stubGlobal('fetch',mock);
    const client=new CareApi(new ApiClient(()=>'fixture-only-token','http://127.0.0.1:3300/api/v1'));
    expect(await client.records('client/1',2,'DIET')).toEqual(result);
    expect(mock.mock.calls[0][0]).toBe('http://127.0.0.1:3300/api/v1/clinical/patients/client%2F1/records?page=2&pageSize=30&recordType=DIET');
  });
  it('uses server workbench definitions/counts and propagates failures instead of empty success',async()=>{
    const response={asOf:'2026-10-12T00:00:00Z',date:'2026-10-12',timezone:'Asia/Shanghai',counts:{pendingDietReviews:2,pendingPlans:1,pendingSummaries:1,dueRechecks:0},queues:{pendingDietReviews:[],pendingPlans:[],pendingSummaries:[],dueRechecks:[]},definitions:{pendingDietReviews:'实际接口口径'}};
    const mock=vi.fn().mockResolvedValueOnce(json(response)).mockResolvedValueOnce(json({message:'虚构队列错误'},503));vi.stubGlobal('fetch',mock);
    const client=new CareApi(new ApiClient(()=>'fixture-only-token','http://127.0.0.1:3300/api/v1'));
    expect(await client.workbench()).toEqual(response);
    expect(mock.mock.calls[0][0]).toBe('http://127.0.0.1:3300/api/v1/care-management/workbench');
    await expect(client.workbench()).rejects.toThrow('虚构队列错误');
  });
});
