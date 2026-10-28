import { BadRequestException } from '@nestjs/common';
import { YUANQIZHAN_SOURCE_FORMS } from './yuanqizhan-source';

export const PHOTO_SLOTS = ['tongue_coating', 'tongue_underside', 'face', 'body_front', 'body_side', 'body_back'] as const;
export type PhotoSlot = typeof PHOTO_SLOTS[number];
export const YUANQIZHAN_SCHEMA_VERSION = 'yuanqizhan-v0-native-20261014-v1';
export const YUANQIZHAN_NOTICE = '本活动由您主动填写，用于健康管理中的日常记录与阶段观察。本人可填写和查看，已有服务授权的医生、健管师以及当前有效绑定的营养师可查看健康回答和舌苔、舌底、面部及体态照片。营养师仅限只读，查看时不展示姓名、电话字段；此权限不扩大到其他原始医学资料，解绑或重新分配后原营养师不能继续访问。管理员仅管理活动及参与名单，运动老师不因此获得这些照片权限。原始照片和历史记录长期保留；本表不生成诊断或总评分。不会调用问卷星、OCR或第三方识别。';
export type FormType = 'daily' | 'milestone';
export function shanghaiDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}
export function validCalendarDate(date: string): boolean {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
}
export function activityDay(startDate: string, date: string): number {
  if (!validCalendarDate(startDate) || !validCalendarDate(date)) throw new BadRequestException('活动日期无效');
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86_400_000) + 1;
}
export function formTypeForDay(day: number, durationDays = 15): FormType | null {
  return day < 1 || day > durationDays ? null : [1, 8, 15].includes(day) ? 'milestone' : 'daily';
}
export function memberWindow(activity: {status: string; durationDays: number}, member: {status: string; joinedAt: Date; startDate: string}, now = new Date()) {
  const date = shanghaiDate(now);
  const beforeJoin = now.getTime() < new Date(member.joinedAt).getTime();
  const dayNumber = beforeJoin ? null : activityDay(member.startDate, date);
  const formType = dayNumber === null ? null : formTypeForDay(dayNumber, activity.durationDays);
  const writeBlockedReason = beforeJoin ? 'BEFORE_EFFECTIVE_JOIN' : member.status !== 'ACTIVE' ? 'MEMBER_REMOVED'
    : activity.status !== 'ACTIVE' ? 'ACTIVITY_ENDED' : !formType ? 'PERSONAL_PERIOD_ENDED' : null;
  return {date, dayNumber, formType, canWrite: writeBlockedReason === null, readOnly: writeBlockedReason !== null, writeBlockedReason};
}
const corrected = (value: string) => value.replaceAll('分::', '分：').replaceAll('+2:分:', '+2分：').replaceAll('测面', '侧面').replaceAll('（腹泻)', '（腹泻）');
export function formDefinition(type: FormType) {
  const source = YUANQIZHAN_SOURCE_FORMS.find((form) => form.id === type)!;
  const questions = source.questions.map((sourceQuestion) => {
    const question = sourceQuestion as any;
    const label = question.key === 'fasting_weight' ? '今日空腹体重（kg）'
      : question.key === 'fasting_waist' ? '今日空腹腰围（cm）'
      : question.key === 'bowel_observation' ? '今日排便观察' : corrected(question.label_original);
    return {key: question.key, type: question.type, required: question.required, labelOriginal: question.label_original,
      label, timeReference: question.time_reference, unit: question.key === 'fasting_weight' ? 'kg' : question.key === 'fasting_waist' ? 'cm' : null,
      ...(question.options ? {options: question.options.map((option: any) => ({value: question.key === 'stool_type' ? option.order : option.display_score, label: corrected(option.label_original), labelOriginal: option.label_original}))} : {}),
      ...(question.subfields ? {subfields: question.subfields.map((field: any) => ({key: field.key, labelOriginal: field.label_original,
        label: field.key === 'bowel_extra' ? '其他排便观察' : field.label_original, required: false,
        hint: field.key === 'bowel_extra' ? '' : field.hint_original ?? ''}))} : {}),
      ...(question.type === 'file_upload' ? {maxFiles: 1, maxBytes: 10485760, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']} : {}),
    };
  });
  return {id: type, title: source.title, questionCount: source.question_count, schemaVersion: YUANQIZHAN_SCHEMA_VERSION, notice: YUANQIZHAN_NOTICE, questions};
}
const commonKeys = ['name', 'fasting_weight', 'fatigue', 'hunger', 'appetite', 'sleep_quality', 'energy_complexion', 'bowel_observation', 'stool_type'];
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function normalizedAnswers(value: unknown, type: FormType, submitted: boolean): Record<string, any> {
  if (!object(value)) throw new BadRequestException('回答格式无效');
  const keys = type === 'milestone' ? [...commonKeys, 'fasting_waist'] : commonKeys;
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new BadRequestException('回答含未知题目或当前日期不适用的题目');
  const result: Record<string, any> = {};
  for (const key of keys) {
    const item = value[key];
    if (item === undefined || item === null || item === '') { if (submitted) throw new BadRequestException('请完成全部必答题'); continue; }
    if (key === 'name') {
      if (typeof item !== 'string' || !item.trim() || item.trim().length > 80) throw new BadRequestException('姓名须为1至80字');
      result[key] = item.trim();
    } else if (key === 'fasting_weight' || key === 'fasting_waist') {
      // Storage bounds, not a diagnostic range; no implicit unit conversion.
      if (typeof item !== 'number' || !Number.isFinite(item) || item <= 0 || item > 10000 || Math.abs(item * 10000 - Math.round(item * 10000)) > 0.000001) throw new BadRequestException('体重kg、腰围cm须为正数，最多4位小数且不超过10000');
      result[key] = item;
    } else if (key === 'bowel_observation') {
      if (!object(item) || Object.keys(item).some((field) => !['bowel_count', 'bowel_ease', 'bowel_extra'].includes(field))) throw new BadRequestException('排便观察格式无效');
      const bowel: Record<string, string> = {};
      for (const field of ['bowel_count', 'bowel_ease', 'bowel_extra']) {
        const text = item[field] ?? '';
        if (typeof text !== 'string' || text.length > 500) throw new BadRequestException('排便观察每项最多500字');
        bowel[field] = text.trim();
      }
      if (submitted && !Object.values(bowel).some(Boolean)) throw new BadRequestException('排便观察请至少填写一项');
      result[key] = bowel;
    } else {
      const range = key === 'appetite' ? [-2, -1, 0, 1, 2] : key === 'stool_type' ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
      if (typeof item !== 'number' || !range.includes(item)) throw new BadRequestException('请选择原题提供的选项');
      result[key] = item;
    }
  }
  return result;
}
export function normalizedPhotos(value: unknown, type: FormType, submitted: boolean): Partial<Record<PhotoSlot, string>> {
  if (!object(value) || Object.keys(value).some((slot) => !PHOTO_SLOTS.includes(slot as PhotoSlot))) throw new BadRequestException('照片槽格式无效');
  if (type !== 'milestone' && Object.keys(value).length) throw new BadRequestException('日常表不接收阶段照片');
  const result: Partial<Record<PhotoSlot, string>> = {};
  for (const slot of PHOTO_SLOTS) {
    const id = value[slot];
    if (id === undefined || id === null || id === '') { if (submitted && type === 'milestone') throw new BadRequestException('请完成六个照片槽'); continue; }
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,191}$/.test(id)) throw new BadRequestException('每个照片槽仅接收一个已上传的图片ID');
    result[slot] = id;
  }
  if (new Set(Object.values(result)).size !== Object.values(result).length) throw new BadRequestException('六个照片槽须分别上传');
  return result;
}
