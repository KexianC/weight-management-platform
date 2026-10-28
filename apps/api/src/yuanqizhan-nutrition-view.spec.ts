import { isYuanqizhanReadProjectionRoute, yuanqizhanNutritionView } from './yuanqizhan-nutrition-view';
import { YUANQIZHAN_NOTICE } from './yuanqizhan-policy';
import { NutritionPrivacyInterceptor } from './privacy';
import { lastValueFrom, of } from 'rxjs';

describe('dedicated Yuanqizhan nutritionist read projection', () => {
  it.each([
    '/api/v1/yuanqizhan/patients/patient-a/activities?page=2',
    '/yuanqizhan/patients/patient-a/activities',
    '/api/v1/yuanqizhan/activity-a/patients/patient-a/records',
    '/api/v1/yuanqizhan/activity-a/patients/patient-a/records/2026-10-19',
  ])('exempts only the explicitly projected GET route %s', path => {
    expect(isYuanqizhanReadProjectionRoute('GET', path)).toBe(true);
    expect(isYuanqizhanReadProjectionRoute('POST', path)).toBe(false);
    expect(isYuanqizhanReadProjectionRoute('DELETE', path)).toBe(false);
  });
  it.each([
    '/api/v1/yuanqizhan/activities',
    '/api/v1/yuanqizhan/activity-a/today',
    '/api/v1/yuanqizhan/activity-a/records',
    '/api/v1/yuanqizhan/activity-a/patients/patient-a/records/2026-10-19/revisions',
    '/api/v1/yuanqizhan/activity-a/patients/patient-a/records/arbitrary',
    '/api/v1/yuanqizhan/activity-a/patients/patient-a/photos/face',
    '/api/v1/clinical/patients/patient-a/records',
    '/api/v1/messages',
    '/api/v2/yuanqizhan/patients/patient-a/activities',
  ])('keeps unrelated and unprojected routes under the existing privacy filter: %s', path => {
    expect(isYuanqizhanReadProjectionRoute('GET', path)).toBe(false);
  });
  it('preserves health observations and allowed photo IDs while removing identity and the name question', () => {
    const source = {
      canWrite: true, readOnly: false, title: '私有姓名的元气盏记录',
      answers: { name: '私有姓名', fasting_weight: 68.4, fatigue: 3, bowel_observation: { bowel_count: '每日一次', bowel_extra: '无腹痛，睡眠较昨日改善', name: '私有姓名' }, unexpected: '禁止带出' },
      photos: { face: 'asset_face', tongue_coating: 'asset_tongue', body_front: 'asset_front', arbitrary: 'not_allowed', body_back: 'https://invalid.example/raw' },
      form: { questions: [{ key: 'name', label: '姓名' }, { key: 'fatigue', label: '疲劳' }], questionCount: 2 },
      description: '联系13800000000或https://invalid.example/private',
    };
    const before = structuredClone(source);
    const result = yuanqizhanNutritionView(source, { id: 'patient-12345678', displayName: '私有姓名', phone: '13800000000' });
    expect(result).toMatchObject({ canWrite: false, readOnly: true, accessNotice: YUANQIZHAN_NOTICE });
    expect(result.answers).toEqual({ fasting_weight: 68.4, fatigue: 3, bowel_observation: { bowel_count: '每日一次', bowel_extra: '无腹痛，睡眠较昨日改善' } });
    expect(result.photos).toEqual({ face: 'asset_face', tongue_coating: 'asset_tongue', body_front: 'asset_front' });
    expect(result.form.questions).toEqual([{ key: 'fatigue', label: '疲劳' }]); expect(result.form.questionCount).toBe(1);
    expect(result.title).toBe('客户12345678的元气盏记录');
    expect(JSON.stringify(result)).not.toContain('私有姓名'); expect(JSON.stringify(result)).not.toContain('13800000000');
    expect(result.description).not.toContain('https://'); expect(source).toEqual(before);
  });
});

describe('Yuanqizhan projection at the global privacy interceptor boundary', () => {
  function setup(method: string, originalUrl: string) {
    const auth = { actor: jest.fn().mockResolvedValue({ sub: 'nutritionist-a', role: 'NUTRITIONIST' }) };
    const db = { user: { findMany: jest.fn().mockResolvedValue([{ id: 'patient-a', displayName: '合成姓名', phone: '13800000000' }]) } };
    const interceptor = new NutritionPrivacyInterceptor(auth as any, db as any);
    const context: any = { switchToHttp: () => ({ getRequest: () => ({ method, originalUrl, headers: { authorization: 'Bearer synthetic' } }) }) };
    const value: any = { id: 'record-a', answers: { fasting_weight: 68.4, bowel_observation: { bowel_extra: '无腹痛，精神较昨日改善' } }, photos: { face: 'synthetic_face' }, form: { questions: [{ key: 'fasting_weight', label: '体重' }] }, canWrite: false, readOnly: true, accessNotice: YUANQIZHAN_NOTICE };
    const next = { handle: jest.fn(() => of(value)) };
    return { auth, db, interceptor, context, value, next };
  }
  it('preserves the service-authorized dedicated projection instead of dropping observations and photos', async () => {
    const f = setup('GET', '/api/v1/yuanqizhan/activity-a/patients/patient-a/records/2026-10-19');
    const result = await lastValueFrom(await f.interceptor.intercept(f.context, f.next));
    expect(result).toEqual(f.value); expect(f.db.user.findMany).not.toHaveBeenCalled();
  });
  it.each([
    ['POST', '/api/v1/yuanqizhan/activity-a/patients/patient-a/records'],
    ['GET', '/api/v1/yuanqizhan/activity-a/patients/patient-a/records/2026-10-19/revisions'],
    ['GET', '/api/v1/clinical/patients/patient-a/records'],
  ])('keeps the existing privacy projection for %s %s', async (method, path) => {
    const f = setup(method, path);
    const result: any = await lastValueFrom(await f.interceptor.intercept(f.context, f.next));
    expect(result.photos).toBeUndefined(); expect(result.form).toBeUndefined();
    expect(f.auth.actor).toHaveBeenCalled(); expect(f.db.user.findMany).toHaveBeenCalledTimes(1);
  });
});
