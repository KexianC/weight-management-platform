import { api } from './api';

export type DailyCheckInAnswers = {
  fatigue?: number;
  hunger?: number;
  appetite?: number;
  sleep_quality?: number;
  energy_complexion?: number;
  bowel_count?: number;
  bowel_ease?: 'SMOOTH' | 'STRAINED' | 'DIFFICULT' | 'BLOATING';
  bowel_extra?: string;
  stool_type?: number;
  waist_cm?: number;
  exercise_minutes?: number;
  water_ml?: number;
  sleep_start?: string;
  sleep_end?: string;
  breakfast_text?: string;
  lunch_text?: string;
  dinner_text?: string;
  breakfast_photo_ids?: string[];
  lunch_photo_ids?: string[];
  dinner_photo_ids?: string[];
};
export type DailyCheckInPhoto = { id: string; mimeType: string; url: string };
export type DailyCheckInRecord = { date: string; version: number; weightKg: number; answers: DailyCheckInAnswers; updatedAt: string; photos?: DailyCheckInPhoto[]; redactedAnswerKeys?: (keyof DailyCheckInAnswers)[] };
export type DailyCheckInContext = { date: string; clientLabel: string; record: DailyCheckInRecord | null };
export type DailyCheckInLink = { url: string; qrDataUrl: string; revoked: boolean };
export type DailyCheckInRecordPage = { items: DailyCheckInRecord[]; total: number; page: number; pageSize: number; hasMore: boolean; canViewLink?: boolean; canManageLink?: boolean };
export type DailyCheckInQuestion = { key: keyof DailyCheckInAnswers; label: string; options?: ReadonlyArray<{ value: number | string; label: string }> };

export const dailyMeals = [
  { key: 'breakfast', label: '早餐', textKey: 'breakfast_text', photoKey: 'breakfast_photo_ids' },
  { key: 'lunch', label: '午餐', textKey: 'lunch_text', photoKey: 'lunch_photo_ids' },
  { key: 'dinner', label: '晚餐', textKey: 'dinner_text', photoKey: 'dinner_photo_ids' },
] as const;
export type DailyMeal = typeof dailyMeals[number]['key'];
export function dailyMealCount(answers: DailyCheckInAnswers): number {
  return dailyMeals.filter(meal => answers[meal.textKey]?.trim() || answers[meal.photoKey]?.length).length;
}
export function dailySleepMinutes(start?: string, end?: string): number | null {
  const valid = (value?: string): value is string => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!valid(start) || !valid(end)) return null;
  const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return (minute(end) - minute(start) + 24 * 60) % (24 * 60);
}
export function dailySleepLabel(start?: string, end?: string): string {
  const minutes = dailySleepMinutes(start, end);
  if (minutes === null) return '未填写';
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ''}`;
}
export function validateDailyPhoto(file: Pick<File, 'type' | 'size'>): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 照片');
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('每张照片须大于 0 且不超过 10 MB');
}

export const bowelEaseOptions = [
  { value: 'SMOOTH', label: '顺畅' }, { value: 'STRAINED', label: '稍费力' },
  { value: 'DIFFICULT', label: '困难' }, { value: 'BLOATING', label: '腹胀' },
] as const;

export const dailyCheckInQuestions: readonly DailyCheckInQuestion[] = [
  { key: 'fatigue', label: '昨日疲劳感', options: [
    { value: 1, label: '精力充沛，下班后仍有体力' }, { value: 2, label: '偶有疲惫，休息后恢复' },
    { value: 3, label: '一般疲惫，需要提神' }, { value: 4, label: '明显乏力，经常想休息' }, { value: 5, label: '极度疲劳，全天提不起劲' },
  ] },
  { key: 'hunger', label: '昨日下午至晚餐前的饥饿感', options: [
    { value: 1, label: '完全不饿，饭点也无食欲' }, { value: 2, label: '轻微饿感，喝水后缓解' },
    { value: 3, label: '正常饥饿' }, { value: 4, label: '明显饥饿，影响注意力' }, { value: 5, label: '强烈饥饿，出现头晕、手抖或心慌' },
  ] },
  { key: 'appetite', label: '昨日食欲变化', options: [
    { value: -2, label: '食欲明显减退' }, { value: -1, label: '比平时略少' }, { value: 0, label: '和平时一样' },
    { value: 1, label: '比平时略多' }, { value: 2, label: '食欲亢进，总想吃东西' },
  ] },
  { key: 'sleep_quality', label: '昨晚睡眠质量', options: [
    { value: 1, label: '几乎没睡好，多梦易醒或入睡困难' }, { value: 2, label: '睡眠浅，醒来仍疲惫' },
    { value: 3, label: '一般' }, { value: 4, label: '睡得较沉，晨起状态不错' }, { value: 5, label: '一觉到天亮，神清气爽' },
  ] },
  { key: 'energy_complexion', label: '昨日精力与气色', options: [
    { value: 1, label: '面色暗沉，精神萎靡' }, { value: 2, label: '面色略差，略有疲态' },
    { value: 3, label: '与平日无明显差异' }, { value: 4, label: '面色红润，状态不错' }, { value: 5, label: '神采奕奕，明显好于平日' },
  ] },
  { key: 'bowel_count', label: '今日排便次数' },
  { key: 'bowel_ease', label: '排便是否顺畅', options: bowelEaseOptions },
  { key: 'bowel_extra', label: '排便附加观察' },
  { key: 'stool_type', label: '大便性状', options: [
    { value: 1, label: '1型：坚硬颗粒状' }, { value: 2, label: '2型：腊肠状，表面凹凸结块' },
    { value: 3, label: '3型：腊肠状，表面有裂痕' }, { value: 4, label: '4型：光滑柔软的腊肠或蛇形' },
    { value: 5, label: '5型：柔软块状，边缘清晰' }, { value: 6, label: '6型：糊状，边缘蓬松' }, { value: 7, label: '7型：完全水状' },
  ] },
];

export function dailyCheckInAnswerLabel(question: DailyCheckInQuestion, value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写';
  const option = question.options?.find(item => item.value === value);
  if (question.options) return option?.label ?? '未识别的选项';
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '未填写';
}

export function dailyCheckInShareUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const endpoint = (patientId: string) => '/care-management/patients/' + encodeURIComponent(patientId) + '/daily-check-in';
export const dailyCheckInApi = {
  photoBlob: (photo: DailyCheckInPhoto) => api.mediaBlob(photo.id, photo.url),
  link: (patientId: string) => api.request<DailyCheckInLink>(endpoint(patientId) + '/link'),
  reset: (patientId: string) => api.request<DailyCheckInLink>(endpoint(patientId) + '/link/reset', { method: 'POST' }),
  revoke: (patientId: string) => api.request(endpoint(patientId) + '/link', { method: 'DELETE' }),
  records: (patientId: string, page = 1) => api.request<DailyCheckInRecordPage>(endpoint(patientId) + '/records?page=' + Math.max(1, Math.trunc(page))),
};
