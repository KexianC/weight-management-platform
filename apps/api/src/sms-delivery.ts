import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Dysmsapi20170525, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { $OpenApiUtil } from '@alicloud/openapi-core';

export class SmsReminderRejectedError extends ServiceUnavailableException {}

export const FOLLOWUP_SMS_TEMPLATE_CODE = 'SMS_491365379';
export type FollowUpReminder = { patientName?: string; practitionerName?: string; scheduledTime?: string; content: string; date: string };

@Injectable()
export class SmsDeliveryService {
  private readonly logger = new Logger(SmsDeliveryService.name);
  private readonly client?: Dysmsapi20170525;
  private readonly signName?: string;
  private readonly templateCode?: string;
  private readonly followUpTemplateCode?: string;

  constructor() {
    const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
    const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();
    this.signName = process.env.ALIYUN_SMS_SIGN_NAME?.trim();
    this.templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE?.trim();
    // Existing approved "随访提醒" template, verified via read-only provider metadata.
    // An explicitly empty value disables direct reminder SMS.
    this.followUpTemplateCode = process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE === undefined
      ? FOLLOWUP_SMS_TEMPLATE_CODE : process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE.trim();

    if (accessKeyId && accessKeySecret && this.signName) {
      this.client = new Dysmsapi20170525(
        new $OpenApiUtil.Config({
          accessKeyId,
          accessKeySecret,
          endpoint: process.env.ALIYUN_SMS_ENDPOINT?.trim() || 'dysmsapi.aliyuncs.com',
          regionId: process.env.ALIYUN_SMS_REGION_ID?.trim() || 'cn-hangzhou',
          protocol: 'HTTPS',
          connectTimeout: 3_000,
          readTimeout: 8_000,
        }),
      );
    }
  }

  isConfigured() {
    return Boolean(this.client && this.signName && this.templateCode);
  }

  isFollowUpConfigured() {
    return Boolean((this.client && this.signName && this.followUpTemplateCode && this.followUpParameters())
      || process.env.REMINDER_DELIVERY_WEBHOOK_URL?.trim());
  }

  // The approved template appends 医生 after name: this is the practitioner,
  // never the patient. Custom templates require an explicit variable mapping.
  private followUpParameters(payload?: FollowUpReminder): Record<string, string> | null {
    try {
      const mapping: unknown = this.followUpTemplateCode === FOLLOWUP_SMS_TEMPLATE_CODE
        ? { name: 'practitionerName', time: 'scheduledTime', content: 'content' }
        : JSON.parse(process.env.ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS ?? 'null');
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return null;
      const result: Record<string, string> = {};
      for (const [key, field] of Object.entries(mapping)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || typeof field !== 'string'
          || !['patientName', 'practitionerName', 'scheduledTime', 'content', 'date'].includes(field)) return null;
        result[key] = payload ? payload[field as keyof FollowUpReminder] ?? '' : '';
      }
      return result;
    } catch { return null; }
  }

  async sendFollowUpReminder(phone: string, payload: FollowUpReminder) {
    const parameters = this.followUpParameters(payload);
    if (this.client && this.signName && this.followUpTemplateCode && parameters) {
      const response = await this.client.sendSms(new SendSmsRequest({
        phoneNumbers: phone, signName: this.signName, templateCode: this.followUpTemplateCode,
        templateParam: JSON.stringify(parameters),
      }));
      if (response.body?.code !== 'OK') throw new SmsReminderRejectedError('随访提醒短信未被受理');
      return { bizId: response.body.bizId, requestId: response.body.requestId };
    }
    // Reuse the same external reminder adapter as the follow-up feature.
    const endpoint = process.env.REMINDER_DELIVERY_WEBHOOK_URL?.trim();
    if (!endpoint) throw new ServiceUnavailableException('随访提醒短信模板未配置');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.REMINDER_DELIVERY_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.REMINDER_DELIVERY_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ phone, channel: 'SMS', templateName: '随访提醒', purpose: 'YUANQIZHAN_CHECK_IN', ...payload }),
      signal: AbortSignal.timeout(8_000),
    });
    // A successful HTTP response alone is not proof that an SMS was accepted.
    const receipt: unknown = await response.json().catch(() => null);
    if (receipt && typeof receipt === 'object' && !Array.isArray(receipt)) {
      const body = receipt as Record<string, unknown>;
      if (response.ok && body.accepted === true) return {
        ...(typeof body.bizId === 'string' ? { bizId: body.bizId } : {}),
        ...(typeof body.requestId === 'string' ? { requestId: body.requestId } : {}),
      };
      if (body.accepted === false) throw new SmsReminderRejectedError('随访提醒短信未被受理');
    }
    throw new ServiceUnavailableException('随访提醒短信受理结果未知');
  }

  async sendVerificationCode(phone: string, code: string) {
    if (!this.client || !this.signName || !this.templateCode) {
      throw new ServiceUnavailableException('短信服务未配置');
    }

    try {
      const response = await this.client.sendSms(
        new SendSmsRequest({
          phoneNumbers: phone,
          signName: this.signName,
          templateCode: this.templateCode,
          templateParam: JSON.stringify({ code }),
        }),
      );
      if (response.body?.code !== 'OK') {
        this.logger.error(
          `Aliyun SMS rejected request: code=${response.body?.code || 'UNKNOWN'} requestId=${response.body?.requestId || 'UNKNOWN'}`,
        );
        throw new ServiceUnavailableException('短信发送失败，请稍后重试');
      }
      return { bizId: response.body.bizId, requestId: response.body.requestId };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const errorCode =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || 'UNKNOWN')
          : 'UNKNOWN';
      this.logger.error(`Aliyun SMS request failed: code=${errorCode}`);
      throw new ServiceUnavailableException('短信发送失败，请稍后重试');
    }
  }
}
