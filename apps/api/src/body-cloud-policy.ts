import { createHash } from 'node:crypto';
import { visionEndpoint, type VisionExtraction } from './vision-ocr';

export const BODY_CLOUD_NOTICE_VERSION = 'body-cloud-20261014-v1';
export const BODY_CLOUD_NOTICE = '仅识别这张人体成分报告的当次指标。请先裁剪或遮盖姓名、手机号、脸部、签名、条码等无关身份信息；选择的整张图片仍会发送给阿里云百炼 qwen3-vl-plus，而非只发送指标。使用北京接入与存储区域，推理范围依百炼当前模型部署规则；不承诺仅在北京计算。按量 API 数据不用于模型训练，但不能承诺调用数据立即删除。原图、授权记录和核对记录由本项目保留。结果可能有误，仅为可编辑草稿，须工作人员核对数值、单位及当次日期后保存；不会自动覆盖历史或作诊疗决定。可拒绝并手工录入，授权在调用前可以撤回；已发送的数据不能保证由本项目从供应商删除。费用由项目承担，项目北京时间每日调用预算100元，不等同阿里云账号账单硬限额。';
export const BODY_CLOUD_NOTICE_SHA256 = createHash('sha256').update(BODY_CLOUD_NOTICE).digest('hex');
export const BODY_CLOUD_PRICE_VERSION = 'qwen3-vl-plus-cn-beijing-20261014';
export const BODY_CLOUD_LIMIT_MICRO = 100_000_000;
// Entire supported 256K context at the highest published tier + 1024 output tokens < CNY1.
// Unknown usage never releases this reservation; it also blocks the day pending reconciliation.
export const BODY_CLOUD_RESERVE_MICRO = 1_000_000;
export function shanghaiDay(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
export function cloudPolicy(env: NodeJS.ProcessEnv = process.env) {
  const target = visionEndpoint('bailian', env.OCR_VISION_BASE_URL ?? '', env.OCR_VISION_REGION);
  const enabled = env.OCR_BODY_CLOUD_ENABLED === 'true'
    && env.OCR_BODY_CLOUD_DAILY_LIMIT_CNY === '100'
    && env.OCR_BODY_CLOUD_PRICE_VERSION === BODY_CLOUD_PRICE_VERSION
    && env.OCR_VISION_MODEL === 'qwen3-vl-plus' && target?.region === 'cn-beijing';
  return { enabled, provider: 'bailian', model: 'qwen3-vl-plus', region: 'cn-beijing', noticeVersion: BODY_CLOUD_NOTICE_VERSION,
    noticeSha256: BODY_CLOUD_NOTICE_SHA256, noticeText: BODY_CLOUD_NOTICE, dailyLimitCny: 100, reservationCny: 1, timezone: 'Asia/Shanghai', projectBudgetOnly: true };
}
export function usageCostMicro(usage: VisionExtraction['usage']): number | null {
  if (!usage || !Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens)
    || usage.inputTokens < 1 || usage.inputTokens > 262144 || usage.outputTokens < 0 || usage.outputTokens > 1024) return null;
  const inputRate = usage.inputTokens <= 32768 ? 1 : usage.inputTokens <= 131072 ? 1.5 : 3;
  const outputRate = inputRate * 10;
  return Math.ceil(usage.inputTokens * inputRate + usage.outputTokens * outputRate);
}
