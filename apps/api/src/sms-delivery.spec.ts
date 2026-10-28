import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { SmsDeliveryService, SmsReminderRejectedError } from './sms-delivery';

const mockSendSms = jest.fn();
jest.mock('@alicloud/dysmsapi20170525', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ sendSms: mockSendSms })),
  SendSmsRequest: class {
    constructor(input: Record<string, unknown>) { Object.assign(this, input); }
  },
}));

const originalEnvironment = process.env;
const originalFetch = globalThis.fetch;
const phone = '13800000000';
const reminder = { patientName: '测试成员', content: '请完成元气盏今日打卡', date: '2026-10-18' };
const approvedReminder = { practitionerName: '测试医生', scheduledTime: '2026-10-18 20:00:00', content: '元气盏活动今日打卡尚未完成，请及时完成记录', date: '2026-10-18' };

function configureDirect(overrides: NodeJS.ProcessEnv = {}) {
  Object.assign(process.env, {
    ALIBABA_CLOUD_ACCESS_KEY_ID: 'synthetic-access-id',
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'synthetic-secret-not-real',
    ALIYUN_SMS_SIGN_NAME: '测试签名',
    ALIYUN_SMS_TEMPLATE_CODE: 'SMS_SYNTHETIC_OTP',
    ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE: 'SMS_SYNTHETIC_FOLLOWUP',
    ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS: JSON.stringify({ name: 'patientName', reminder: 'content', day: 'date' }),
    ...overrides,
  });
}

function configureWebhook() {
  process.env.REMINDER_DELIVERY_WEBHOOK_URL = 'https://reminder-adapter.invalid/deliver';
  process.env.REMINDER_DELIVERY_WEBHOOK_TOKEN = 'synthetic-webhook-token-not-real';
}

describe('SmsDeliveryService follow-up reminders', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ALIYUN_SMS_') || key.startsWith('ALIBABA_CLOUD_') || key.startsWith('REMINDER_DELIVERY_WEBHOOK_')) delete process.env[key];
    }
    mockSendSms.mockReset().mockResolvedValue({ body: { code: 'OK', bizId: 'synthetic-biz', requestId: 'synthetic-request' } });
    fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockRejectedValue(new Error('Unexpected synthetic network request')) as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fetchMock;
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.fetch = originalFetch;
    process.env = originalEnvironment;
  });

  it('preserves OTP parameters and uses the separately configured follow-up template and explicit variable mapping', async () => {
    configureDirect();
    const service = new SmsDeliveryService();
    expect(service.isConfigured()).toBe(true);
    expect(service.isFollowUpConfigured()).toBe(true);

    await expect(service.sendVerificationCode(phone, '123456')).resolves.toEqual({ bizId: 'synthetic-biz', requestId: 'synthetic-request' });
    await expect(service.sendFollowUpReminder(phone, reminder)).resolves.toEqual({ bizId: 'synthetic-biz', requestId: 'synthetic-request' });

    expect(mockSendSms).toHaveBeenNthCalledWith(1, expect.objectContaining({
      phoneNumbers: phone, signName: '测试签名', templateCode: 'SMS_SYNTHETIC_OTP', templateParam: JSON.stringify({ code: '123456' }),
    }));
    expect(mockSendSms).toHaveBeenNthCalledWith(2, expect.objectContaining({
      phoneNumbers: phone, signName: '测试签名', templateCode: 'SMS_SYNTHETIC_FOLLOWUP',
      templateParam: JSON.stringify({ name: reminder.patientName, reminder: reminder.content, day: reminder.date }),
    }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('constructs a usable follow-up client when no OTP template is configured', async () => {
    configureDirect({ ALIYUN_SMS_TEMPLATE_CODE: '' });
    const service = new SmsDeliveryService();
    expect(service.isConfigured()).toBe(false);
    expect(service.isFollowUpConfigured()).toBe(true);
    await expect(service.sendVerificationCode(phone, '123456')).rejects.toThrow('短信服务未配置');
    await expect(service.sendFollowUpReminder(phone, reminder)).resolves.toMatchObject({ bizId: 'synthetic-biz' });
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockSendSms.mock.calls[0][0].templateCode).toBe('SMS_SYNTHETIC_FOLLOWUP');
  });

  it.each(['', '   '])('keeps an explicit blank follow-up template disabled rather than using the default or OTP (%j)', async (templateCode) => {
    configureDirect({ ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE: templateCode });
    const service = new SmsDeliveryService();
    expect(service.isConfigured()).toBe(true);
    expect(service.isFollowUpConfigured()).toBe(false);
    await expect(service.sendFollowUpReminder(phone, reminder)).rejects.toThrow('随访提醒短信模板未配置');
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the existing approved follow-up template by default with doctor, time and content variables and no patient-name requirement', async () => {
    configureDirect();
    delete process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE;
    delete process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS;
    delete process.env.ALIYUN_SMS_TEMPLATE_CODE;
    const service = new SmsDeliveryService();
    expect(service.isConfigured()).toBe(false);
    expect(service.isFollowUpConfigured()).toBe(true);
    await expect(service.sendFollowUpReminder(phone, approvedReminder)).resolves.toMatchObject({ bizId: 'synthetic-biz' });
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(mockSendSms.mock.calls[0][0]).toEqual({
      phoneNumbers: phone, signName: '测试签名', templateCode: 'SMS_491365379',
      templateParam: JSON.stringify({ name: approvedReminder.practitionerName, time: approvedReminder.scheduledTime, content: approvedReminder.content }),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    undefined, 'not-json', '{}',
    JSON.stringify({ name: 'patientName', time: 'date', content: 'patientName' }),
  ])('fixes the existing approved template mapping to the doctor and scheduled time even if the custom mapping is %s', async (mapping) => {
    configureDirect({ ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE: 'SMS_491365379' });
    if (mapping === undefined) delete process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS;
    else process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS = mapping;
    const service = new SmsDeliveryService();
    expect(service.isFollowUpConfigured()).toBe(true);
    await service.sendFollowUpReminder(phone, { ...approvedReminder, patientName: '禁止当成医生姓名的测试成员' });
    const params = JSON.parse(mockSendSms.mock.calls[0][0].templateParam);
    expect(params).toEqual({ name: '测试医生', time: '2026-10-18 20:00:00', content: '元气盏活动今日打卡尚未完成，请及时完成记录' });
    expect(JSON.stringify(params)).not.toContain('禁止当成医生姓名的测试成员');
  });

  it('allows custom approved templates to map doctor and scheduled time explicitly alongside patient and date', async () => {
    configureDirect({ ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS: JSON.stringify({
      doctor: 'practitionerName', start_time: 'scheduledTime', member: 'patientName', day: 'date', reminder: 'content',
    }) });
    const service = new SmsDeliveryService();
    expect(service.isFollowUpConfigured()).toBe(true);
    await service.sendFollowUpReminder(phone, { ...approvedReminder, patientName: reminder.patientName });
    expect(mockSendSms.mock.calls[0][0].templateCode).toBe('SMS_SYNTHETIC_FOLLOWUP');
    expect(JSON.parse(mockSendSms.mock.calls[0][0].templateParam)).toEqual({
      doctor: approvedReminder.practitionerName, start_time: approvedReminder.scheduledTime,
      member: reminder.patientName, day: reminder.date, reminder: approvedReminder.content,
    });
  });

  it.each([
    undefined, '', '{', 'null', '[]', '"name"',
    '{"name":"unknownField"}', '{"name":1}', '{"name":null}',
    '{"patient-name":"patientName"}', '{"_name":"patientName"}',
    JSON.stringify({ ['a'.repeat(41)]: 'patientName' }),
  ])('disables direct delivery for absent or invalid explicit template variables: %s', async (mapping) => {
    configureDirect();
    if (mapping === undefined) delete process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS;
    else process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS = mapping;
    const service = new SmsDeliveryService();
    expect(service.isFollowUpConfigured()).toBe(false);
    await expect(service.sendFollowUpReminder(phone, reminder)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an explicitly configured template with no variables', async () => {
    configureDirect({ ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS: '{}' });
    const service = new SmsDeliveryService();
    expect(service.isFollowUpConfigured()).toBe(true);
    await service.sendFollowUpReminder(phone, reminder);
    expect(mockSendSms.mock.calls[0][0].templateParam).toBe('{}');
  });

  it.each(['isv.BUSINESS_LIMIT_CONTROL', undefined])('classifies an explicit unsuccessful Aliyun response as rejected without exposing its body (%s)', async (code) => {
    configureDirect();
    mockSendSms.mockResolvedValue({ body: { code, message: `private-provider-body-${phone}`, requestId: 'private-response-id' } });
    configureWebhook();
    const result = new SmsDeliveryService().sendFollowUpReminder(phone, reminder);
    await expect(result).rejects.toBeInstanceOf(SmsReminderRejectedError);
    await expect(result).rejects.toThrow('随访提醒短信未被受理');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('does not retry an ambiguous SDK transport failure through the webhook or log raw errors', async () => {
    configureDirect();
    configureWebhook();
    const failure = Object.assign(new Error(`private-provider-timeout-${phone}-synthetic-secret-not-real`), { code: 'ETIMEDOUT' });
    mockSendSms.mockRejectedValue(failure);
    await expect(new SmsDeliveryService().sendFollowUpReminder(phone, reminder)).rejects.toBe(failure);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('reuses the follow-up webhook and requires an explicit acceptance receipt', async () => {
    configureWebhook();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true, bizId: 'adapter-biz', requestId: 'adapter-request' })));
    const service = new SmsDeliveryService();
    expect(service.isConfigured()).toBe(false);
    expect(service.isFollowUpConfigured()).toBe(true);
    await expect(service.sendFollowUpReminder(phone, reminder)).resolves.toEqual({ bizId: 'adapter-biz', requestId: 'adapter-request' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://reminder-adapter.invalid/deliver');
    expect(options).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic-webhook-token-not-real' } });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options?.body as string)).toEqual({ phone, channel: 'SMS', templateName: '随访提醒', purpose: 'YUANQIZHAN_CHECK_IN', ...reminder });
    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('uses the existing webhook when the separate direct template mapping is incomplete', async () => {
    configureDirect({ ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS: '' });
    configureWebhook();
    delete process.env.REMINDER_DELIVERY_WEBHOOK_TOKEN;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true, bizId: 1, requestId: null })));
    const service = new SmsDeliveryService();
    expect(service.isFollowUpConfigured()).toBe(true);
    await expect(service.sendFollowUpReminder(phone, reminder)).resolves.toEqual({});
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'content-type': 'application/json' });
  });

  it.each([
    [200, '{}'], [200, '{"success":true}'], [200, '{"accepted":"true"}'],
    [200, '[]'], [200, 'null'], [200, 'not-json'],
    [503, '{"accepted":true,"message":"private-provider-response"}'],
  ])('treats HTTP %s with body %s as unknown rather than accepted', async (status, body) => {
    configureWebhook();
    fetchMock.mockResolvedValue(new Response(body, { status }));
    const result = new SmsDeliveryService().sendFollowUpReminder(phone, reminder);
    await expect(result).rejects.toThrow('随访提醒短信受理结果未知');
    try { await result; } catch (error) { expect(error).not.toBeInstanceOf(SmsReminderRejectedError); }
    expect(errorLog).not.toHaveBeenCalled();
  });

  it.each([200, 429])('classifies an explicit negative webhook receipt as rejected for HTTP %s', async (status) => {
    configureWebhook();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: false, message: `private-provider-response-${phone}` }), { status }));
    const result = new SmsDeliveryService().sendFollowUpReminder(phone, reminder);
    await expect(result).rejects.toBeInstanceOf(SmsReminderRejectedError);
    await expect(result).rejects.toThrow('随访提醒短信未被受理');
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('leaves an ambiguous webhook timeout unaccepted and does not log the raw failure', async () => {
    configureWebhook();
    const failure = new DOMException(`private-timeout-${phone}-synthetic-webhook-token-not-real`, 'TimeoutError');
    fetchMock.mockRejectedValue(failure);
    await expect(new SmsDeliveryService().sendFollowUpReminder(phone, reminder)).rejects.toBe(failure);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockSendSms).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });
});
