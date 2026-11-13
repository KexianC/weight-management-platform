export const bowelEaseOptions = [
  { value: 'SMOOTH', label: '顺畅' }, { value: 'STRAINED', label: '稍费力' },
  { value: 'DIFFICULT', label: '困难' }, { value: 'BLOATING', label: '腹胀' },
];

export const dailyCheckInQuestions = [
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


export const routineMeals = [{key:'breakfast',label:'早餐'},{key:'lunch',label:'午餐'},{key:'dinner',label:'晚餐'}]
export const routineTabFields = {
 weight: ['weightKg','waist_cm','water_ml','fatigue','hunger','appetite','sleep_quality','energy_complexion','bowel_count','bowel_ease','bowel_extra','stool_type'],
 sleep: ['sleep_start','sleep_end','sleep_hours'], exercise: ['exercise_minutes'],
 diet: routineMeals.flatMap(meal => [meal.key+'_text',meal.key+'_photo_ids'])
}
export function routineSleepMinutes(start,end) {
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start||'')||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end||''))return null
 const m=value=>Number(value.slice(0,2))*60+Number(value.slice(3));return(m(end)-m(start)+1440)%1440
}
export function routineSleepLabel(answers={}) { const minutes=routineSleepMinutes(answers.sleep_start,answers.sleep_end);if(minutes===null)return answers.sleep_hours==null?'未填写':answers.sleep_hours+'小时';return Math.floor(minutes/60)+'小时'+(minutes%60?minutes%60+'分钟':'') }
export function routineView(context) { return context?.record||context?.draft||{weightKg:null,answers:{},photos:[],version:0} }
export function routineMealCount(answers={}) { return routineMeals.filter(meal=>String(answers[meal.key+'_text']||'').trim()||(answers[meal.key+'_photo_ids']||[]).length).length }
export function routinePayload(context,weight,answers,tab) {
 const previous=routineView(context), result=Object.fromEntries(Object.entries(answers).filter(([,value])=>value!==''&&value!==undefined&&value!==null));
 for(const meal of routineMeals)if(Array.isArray(result[meal.key+'_photo_ids'])&&!result[meal.key+'_photo_ids'].length)delete result[meal.key+'_photo_ids'];
 const changedFields=[...new Set(Object.values(routineTabFields).flat())].filter(key=>key==='weightKg'?String(weight??'').trim()!==''&&Number(weight)!==previous.weightKg:JSON.stringify(previous.answers?.[key])!==JSON.stringify(result[key]));
 const payload={date:context.date,revision:context.revision,answers:result,changedFields};
 if(changedFields.includes('weightKg')){const value=Number(weight);if(!Number.isFinite(value)||value<20||value>400)throw Error('体重须为20至400公斤');payload.weightKg=Math.round(value*100)/100}
 return payload
}
