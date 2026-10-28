const numeric = [
  {key:'sleepHours',label:'每日睡眠',unit:'小时',min:0,max:24},
  {key:'mealsPerDay',label:'每日进餐',unit:'次',min:1,max:8,integer:true},
  {key:'sedentaryHours',label:'每日久坐',unit:'小时',min:0,max:24},
  {key:'waterMl',label:'每日饮水',unit:'毫升',min:0,max:10000,integer:true}
]
const choices = [
  {key:'activityLevel',label:'日常活动量',values:{LOW:'较少',MODERATE:'适中',HIGH:'较多'}},
  {key:'smoking',label:'吸烟情况',values:{NEVER:'从不吸烟',FORMER:'已戒烟',CURRENT:'目前吸烟'}},
  {key:'alcohol',label:'饮酒情况',values:{NEVER:'不饮酒',OCCASIONAL:'偶尔饮酒',FREQUENT:'经常饮酒'}}
]
const blank=value=>value==null || (typeof value==='string'&&!value.trim())
// Display canonical survey fields without changing stored answers or guessing unknown choices.
export function lifestyleRows(value) {
  const data=value&&typeof value==='object'&&!Array.isArray(value)?value:{}
  return [...numeric.map(field=>{
    const raw=data[field.key]
    const n=typeof raw==='number'?raw:typeof raw==='string'?Number(raw.trim()):NaN
    const valid=Number.isFinite(n)&&n>=field.min&&n<=field.max&&(!field.integer||Number.isInteger(n))
    return {key:field.key,label:field.label,value:blank(raw)?'未填写':valid?`${n} ${field.unit}`:'旧值无效，待核对'}
  }),...choices.map(field=>{
    const raw=data[field.key],key=typeof raw==='string'?raw.trim().toUpperCase():''
    return {key:field.key,label:field.label,value:blank(raw)?'未填写':field.values[key]||'旧选项未识别，待核对'}
  })]
}
export function lifestyleHistoryHint(value) {
  if(value==null)return '尚未填写调查表'
  if(typeof value!=='object'||Array.isArray(value))return '旧版调查内容格式待核对，未自动转换'
  const known=new Set([...numeric,...choices].map(x=>x.key))
  const count=Object.keys(value).filter(key=>!known.has(key)&&!/password|token|secret|credential|authorization|key/i.test(key)).length
  return count?`另有 ${count} 项旧版调查内容待核对；原记录保留`:''
}
