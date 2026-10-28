import { PHOTO_SLOTS, YUANQIZHAN_NOTICE } from './yuanqizhan-policy';

export type YuanqizhanPatientIdentity = { id: string; displayName?: string | null; phone?: string | null };
const answerKeys = new Set(['fasting_weight', 'fasting_waist', 'fatigue', 'hunger', 'appetite', 'sleep_quality', 'energy_complexion', 'bowel_observation', 'stool_type']);
const textFields = new Set(['title', 'description', 'label', 'labelOriginal', 'groupLabel', 'groupName', 'name', 'notice']);

/** These exact GET routes apply their own authorized nutritionist projection. */
export function isYuanqizhanReadProjectionRoute(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  return /^(?:\/api\/v1)?\/yuanqizhan\/(?:patients\/[^/]+\/activities|[^/]+\/patients\/[^/]+\/records(?:\/\d{4}-\d{2}-\d{2})?)\/?$/.test(path.split('?')[0]);
}

export function yuanqizhanNutritionView<T extends Record<string, any>>(view: T, identity: YuanqizhanPatientIdentity): T {
  const anonymous = `客户${identity.id.slice(-8).toUpperCase()}`;
  const scrub = (value: string) => {
    let result = value.replace(/(?:\+?86[- ]?)?1[3-9](?:[- ]?\d){9}/g, '[隐私内容已隐藏]')
      .replace(/\b\d{17}[\dXx]\b/g, '[隐私内容已隐藏]')
      .replace(/https?:\/\/[^\s<>"']+/gi, '[隐私内容已隐藏]')
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[隐私内容已隐藏]');
    if (identity.phone) result = result.split(identity.phone).join('[隐私内容已隐藏]');
    if (identity.displayName) result = result.split(identity.displayName).join(anonymous);
    return result;
  };
  const answers = (value: unknown): unknown => {
    if (typeof value === 'string') return scrub(value);
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(answers);
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'name').map(([key, item]) => [key, answers(item)]));
  };
  const copy = (value: any): any => {
    if (value === null || typeof value !== 'object' || value instanceof Date) return value;
    if (Array.isArray(value)) return value.map(copy);
    const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'string' && textFields.has(key) ? scrub(item) : copy(item)]));
    if (value.answers && typeof value.answers === 'object') result.answers = answers(Object.fromEntries(Object.entries(value.answers).filter(([key]) => answerKeys.has(key))));
    if (value.photos && typeof value.photos === 'object') result.photos = Object.fromEntries(Object.entries(value.photos).filter(([key, id]) => PHOTO_SLOTS.includes(key as typeof PHOTO_SLOTS[number]) && typeof id === 'string' && /^[A-Za-z0-9_-]{1,191}$/.test(id)));
    if (Array.isArray(value.questions)) {
      result.questions = value.questions.filter((question: any) => question?.key !== 'name').map(copy);
      result.questionCount = result.questions.length;
    }
    return result;
  };
  return { ...copy(view), canWrite: false, readOnly: true, accessNotice: YUANQIZHAN_NOTICE };
}
