import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Dysmsapi20170525, { SendSmsRequest } from '@alicloud/dysmsapi20170525';
import { $OpenApiUtil } from '@alicloud/openapi-core';

@Injectable()
export class SmsDeliveryService {
  private readonly logger = new Logger(SmsDeliveryService.name);
  private readonly client?: Dysmsapi20170525;
  private readonly signName?: string;
  private readonly templateCode?: string;

  constructor() {
    const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
    const accessKeySecret = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();
    this.signName = process.env.ALIYUN_SMS_SIGN_NAME?.trim();
    this.templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE?.trim();

    if (accessKeyId && accessKeySecret && this.signName && this.templateCode) {
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
