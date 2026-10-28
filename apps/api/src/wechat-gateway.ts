import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

const identity = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,191}$/.test(value);
const invalid = () => new UnauthorizedException({ code: 'WECHAT_CODE_INVALID', message: '微信凭证无效或已过期，请重新授权。' });

/** Official server exchanges only; never accept a client openid or client phone as proof. */
export class WechatGateway {
  private cachedToken?: { appId: string; value: string; expiresAt: number };
  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  configured() { return !!this.env.WECHAT_MINI_APP_ID?.trim() && !!this.env.WECHAT_MINI_APP_SECRET?.trim(); }
  appId() {
    if (!this.configured()) throw new ServiceUnavailableException({ code: 'WECHAT_NOT_CONFIGURED', message: '微信登录服务未配置，请使用已开通账号的密码登录。' });
    return this.env.WECHAT_MINI_APP_ID!.trim();
  }
  private async request(url: string, init: RequestInit = {}): Promise<Record<string, any>> {
    try {
      const response = await this.fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (response.status !== 200 || response.redirected) throw Error('UNAVAILABLE');
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > 16384) throw Error('UNAVAILABLE');
      const result = JSON.parse(text);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error('UNAVAILABLE');
      return result;
    } catch { throw new ServiceUnavailableException({ code: 'WECHAT_SERVICE_UNAVAILABLE', message: '微信验证服务暂时不可用，请稍后重新授权或使用密码登录。' }); }
  }
  async exchangeLoginCode(code: string): Promise<{ openid: string; unionid?: string }> {
    const appId = this.appId();
    const query = new URLSearchParams({ appid: appId, secret: this.env.WECHAT_MINI_APP_SECRET!, js_code: code, grant_type: 'authorization_code' });
    const result = await this.request(`https://api.weixin.qq.com/sns/jscode2session?${query}`);
    if (result.errcode || !identity(result.openid) || (result.unionid !== undefined && !identity(result.unionid))) throw invalid();
    // session_key is deliberately neither returned nor persisted.
    return { openid: result.openid, ...(result.unionid ? { unionid: result.unionid } : {}) };
  }
  private async accessToken() {
    const appId = this.appId();
    if (this.cachedToken?.appId === appId && this.cachedToken.expiresAt > Date.now()) return this.cachedToken.value;
    const result = await this.request('https://api.weixin.qq.com/cgi-bin/stable_token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credential', appid: appId, secret: this.env.WECHAT_MINI_APP_SECRET!, force_refresh: false }),
    });
    if (result.errcode || typeof result.access_token !== 'string' || !/^[\x21-\x7e]{8,4096}$/.test(result.access_token) || !Number.isFinite(result.expires_in) || result.expires_in <= 120) {
      throw new ServiceUnavailableException({ code: 'WECHAT_PHONE_UNAVAILABLE', message: '微信手机号验证暂时不可用，请使用短信验证或密码登录。' });
    }
    this.cachedToken = { appId, value: result.access_token, expiresAt: Date.now() + Math.min(result.expires_in - 120, 3600) * 1000 };
    return result.access_token;
  }
  async exchangePhoneCode(code: string): Promise<string> {
    const appId = this.appId();
    const token = await this.accessToken();
    const query = new URLSearchParams({ access_token: token });
    const result = await this.request(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?${query}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    if (result.errcode) {
      if ([40001, 42001, 48001].includes(result.errcode)) {
        this.cachedToken = undefined;
        throw new ServiceUnavailableException({ code: 'WECHAT_PHONE_UNAVAILABLE', message: '微信手机号接口权限或服务不可用，请使用短信验证或密码登录。' });
      }
      throw invalid();
    }
    const info = result.phone_info;
    if (!info || info.countryCode !== '86' || typeof info.purePhoneNumber !== 'string' || !/^1[3-9]\d{9}$/.test(info.purePhoneNumber)
      || typeof info.phoneNumber !== 'string' || info.phoneNumber.replace(/^(?:\+?86)/, '') !== info.purePhoneNumber
      || info.watermark?.appid !== appId || typeof info.watermark?.timestamp !== 'number' || !Number.isFinite(info.watermark.timestamp)
      || Math.abs(Date.now() / 1000 - info.watermark.timestamp) > 300) throw invalid();
    return info.purePhoneNumber;
  }
}
