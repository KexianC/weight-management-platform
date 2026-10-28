import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
const root = resolve(import.meta.dirname, '..')
const model = await import(`data:text/javascript;base64,${Buffer.from(readFileSync(resolve(root, 'src/utils/record-model.js'), 'utf8')).toString('base64')}`)
const { buildDietPayload, normalizeRecordPayload, mergeMealItems, mealCalories, optionalNumber } = model
const base = { mealType: 'BREAKFAST', date: '2026-10-10', time: '08:10', mealItems: [], note: '', imageAssetIds: [] }
assert.throws(() => buildDietPayload(base), /文字|照片|食物/)
assert.throws(() => buildDietPayload({ ...base, note: '   ' }), /文字|照片|食物/)
assert.equal(buildDietPayload({ ...base, note: '虚构：少量早餐' }).caloriesSource, 'UNKNOWN')
assert.deepEqual(buildDietPayload({ ...base, imageAssetIds: ['synthetic-meal-image'] }).imageAssetIds, ['synthetic-meal-image'])
assert.equal(buildDietPayload(base, { name: '虚构食物' }).mealItems.length, 1)
assert.equal(buildDietPayload(base, { name: '虚构食物' }).caloriesKcal, undefined)
assert.throws(() => buildDietPayload({ ...base, note: '已填文字' }, { name: '', weightGrams: 100 }), /名称/)
assert.equal(normalizeRecordPayload(buildDietPayload({ ...base, note: '虚构清空热量', expectedUpdatedAt: '2026-10-10T02:00:00Z' })).caloriesKcal, null, 'editing unknown calories must clear a previously manual value')
const foods = [{ name: '虚构食物甲', caloriesKcal: 120 }, { name: '虚构食物乙' }]
assert.deepEqual(mealCalories(foods), { caloriesKcal: 120, caloriesSource: 'ITEM_SUM_PARTIAL' })
assert.deepEqual(mealCalories(foods, 0), { caloriesKcal: 0, caloriesSource: 'MANUAL' })
assert.equal(mealCalories([{ name: '虚构食物', caloriesKcal: 0 }]).caloriesSource, 'ITEM_SUM')
assert.equal(mealCalories(foods, '245', true).caloriesSource, 'ESTIMATE')
assert.throws(() => mergeMealItems([], { name: '虚构食物', caloriesKcal: '-1' }), /热量/)
assert.throws(() => optionalNumber('Infinity', 24, '睡眠'), /数值/)
assert.throws(() => optionalNumber(24.1, 24, '睡眠'), /数值/)
const draft = { name: '未按添加的虚构食物', caloriesKcal: 60 }
const form = { ...base, note: '虚构测试记录', mealItems: foods, calories: 230, imageAssetIds: ['synthetic-meal-image'], expectedUpdatedAt: '2026-10-10T02:00:00Z' }
const payload = normalizeRecordPayload(buildDietPayload(form, draft))
assert.equal(payload.mealItems.length, 3)
assert.equal(payload.mealItems[2].name, draft.name)
assert.equal(payload.caloriesSource, 'MANUAL')
assert.equal(payload.caloriesKcal, 230)
assert.equal(payload.imageAssetIds[0], 'synthetic-meal-image')
assert.equal(payload.expectedUpdatedAt, form.expectedUpdatedAt)
assert.equal(form.mealItems.length, 2, 'submission must not mutate draft before the server confirms')
assert.equal(draft.name, '未按添加的虚构食物')
assert.equal(normalizeRecordPayload({ recordType: 'WEIGHT', weightValue: 140, weightUnit: 'JIN', waistCm: 80, hipCm: 95 }).weightKg, undefined)
assert.deepEqual(normalizeRecordPayload({ recordType: 'SLEEP', sleepHours: 7.5 }), { recordType: 'SLEEP', sleepHours: 7.5 })
assert.equal(normalizeRecordPayload({ recordType: 'DIET', mealType: 'breakfast', note: '', mealItems: [], imageAssetIds: [] }).note, '')
const retryA=model.prepareRecordSubmission({recordType:'WEIGHT',weightValue:70,recordedAt:'2026-10-12T00:00:00Z'});const retryB=model.prepareRecordSubmission({recordType:'WEIGHT',weightValue:70,recordedAt:'2026-10-12T00:00:10Z'},retryA);assert.equal(retryB.payload.recordedAt,retryA.payload.recordedAt);assert.equal(normalizeRecordPayload(retryB.payload).idempotencyKey,retryA.payload.idempotencyKey);
const source = readFileSync(resolve(root, 'src/pages/patient/record.vue'), 'utf8')
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
compileScript(descriptor, { id: 'synthetic-patient-record' })
assert.deepEqual(compileTemplate({ id: 'synthetic-patient-record', source: descriptor.template.content, filename: 'record.vue' }).errors, [])
assert.ok(!source.includes('savePromises'), 'one meal must be one business request')
assert.ok(source.includes("r.data?.source === 'GENERIC_ESTIMATE'"), 'unknown food must not claim a reference match')
assert.ok(source.includes('uni.chooseImage'), 'camera/albums must use native cross-platform entry')
assert.ok(source.includes('expectedUpdatedAt'), 'editing must prevent silent concurrent overwrite')
// Exercise the actual page methods with a fake API; no health data, network, or credentials are used.
let script = descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'const page =')
const calls = []
const estimateCalls = []; let estimateResponse = async (name, weight) => ({ code: 200, data: { calories: weight * 1.55, source: name === '鸡蛋' ? 'COMMON_FOOD_DATABASE' : 'GENERIC_ESTIMATE' } });
const calculateCaloriesWithAI = async (...args) => { estimateCalls.push(args); return estimateResponse(...args) }
let saveError = null
let rejectUpload = false
const createHealthRecord = async data => { calls.push(['create', data]); if (saveError) throw saveError; return { code: 200, data: { id: 'synthetic-record' } } }
const updateHealthRecord = async (id,data) => { calls.push(['update',id,data]); if(saveError)throw saveError; return { code:200 } }
const upload = async path => { calls.push(['upload',path]); if(rejectUpload)throw new Error('synthetic upload failure'); return {code:200,data:{id:'synthetic-photo'}} }
let savedForReopen; const getHealthRecord=async()=>({code:200,data:structuredClone(savedForReopen)});
const page = new Function('deps', `const {uni,getHealthRecord,foodEstimateKey,completeMealEstimates,calculateCaloriesWithAI,store, createHealthRecord,updateHealthRecord,upload, resolveMediaFile,releaseMediaFile, CALORIE_LABELS,prepareRecordSubmission,buildDietPayload,foodItem,mergeMealItems,mealCalories,localDate,optionalNumber,isPresent} = deps; ${script}; return page;`)({ ...model, uni:{pageScrollTo(){}},getHealthRecord,store: {}, calculateCaloriesWithAI, createHealthRecord, updateHealthRecord, upload, releaseMediaFile: () => {} })
const state = () => { const vm = { ...page.data() }; for (const [key,fn] of Object.entries(page.methods)) vm[key] = fn.bind(vm); vm.sameAccount = () => true; vm.accountId = "synthetic"; vm.toast = () => {}; vm.loadHistory = async () => {}; return vm }
const vm = state(); vm.diet = { ...form, mealItems: [...foods] }; vm.draftFood = { ...draft }
await vm.saveDiet(); assert.equal(calls.filter(c=>c[0]==='create').length,1); assert.equal(calls.at(-1)[1].mealItems.length,3); assert.equal(vm.draftFood.name,'')
const failed = state(); failed.diet.note='虚构失败保留'; failed.draftFood.name='当前输入'; saveError = new Error('synthetic failure'); await failed.saveDiet(); assert.equal(failed.diet.note,'虚构失败保留'); assert.equal(failed.draftFood.name,'当前输入'); assert.equal(failed.saving,false)
const failedKey=calls.at(-1)[1].idempotencyKey; assert.match(failedKey,/^[A-Za-z0-9_-]{16,80}$/,'actual diet create must carry an idempotency key'); await failed.saveDiet(); assert.equal(calls.at(-1)[1].idempotencyKey,failedKey,'unchanged retry must retain request key');
saveError=null; calls.length=0; const withPhoto=state(); withPhoto.photos=[{key:'local',path:'synthetic-local-photo',assetId:''}]; rejectUpload=true; await withPhoto.saveDiet(); assert.equal(calls.filter(c=>c[0]==='create').length,0); assert.equal(withPhoto.photos.length,1)
rejectUpload=false; saveError=new Error('synthetic business failure'); await withPhoto.saveDiet(); assert.equal(withPhoto.photos[0].assetId,'synthetic-photo'); saveError=null; calls.length=0; await withPhoto.saveDiet(); assert.equal(calls.filter(c=>c[0]==='upload').length,0, 'retry must not reupload a completed photo'); assert.equal(calls.filter(c=>c[0]==='create').length,1)
console.log('Patient record behavior passed: text/photo/food, whole meal, draft preservation, edit fields, failed uploads/retries, source labels, units, sleep, SFC.')

const automatic=state(); automatic.activeTab="diet"; automatic.draftFood={name:"鸡蛋",weightGrams:100,caloriesKcal:""}; automatic.scheduleMealEstimate(); automatic.draftFood.weightGrams=200; automatic.scheduleMealEstimate(); await new Promise(r=>setTimeout(r,700)); assert.equal(estimateCalls.length,1,"typing is debounced"); assert.equal(estimateCalls[0][1],200); assert.equal(page.computed.calorieSummary.call(automatic).caloriesKcal,310); assert.equal(page.computed.calorieSummary.call(automatic).caloriesSource,"ESTIMATE");
automatic.diet.calories=500; assert.equal(page.computed.calorieSummary.call(automatic).caloriesKcal,500); assert.equal(page.computed.calorieSummary.call(automatic).caloriesSource,"MANUAL"); automatic.diet.calories=""; automatic.diet.mealItems=[{name:"手工食物",caloriesKcal:30}]; calls.length=0; await automatic.saveDiet(); assert.equal(calls.at(-1)[1].caloriesKcal,340); assert.equal(calls.at(-1)[1].caloriesSource,"ESTIMATE"); assert.equal(calls.at(-1)[1].mealItems.length,2); assert.equal(estimateCalls.length,1,"save reuses current estimate");
const snapshot=state(); snapshot.diet.note='旧文字'; snapshot.diet.calories=420; snapshot.draftFood={name:'旧食物',weightGrams:100,caloriesKcal:420}; calls.length=0; await snapshot.saveDiet({detail:{value:{note:'当前表单文字',foodName:'鸡蛋',foodWeightGrams:'100',foodCaloriesKcal:'',mealCaloriesKcal:''}}}); assert.equal(calls.at(-1)[1].note,'当前表单文字'); assert.equal(calls.at(-1)[1].mealItems[0].name,'鸡蛋'); assert.equal(calls.at(-1)[1].caloriesKcal,155); assert.equal(calls.at(-1)[1].caloriesSource,'ESTIMATE','cleared current form must override stale model');
// Serialization represents a fresh API read, with no estimate cache or previous page state.
const referenceItems=[{name:'鸡蛋',weightGrams:100,caloriesKcal:144,caloriesSource:'ESTIMATE'},{name:'牛奶',weightGrams:100,caloriesKcal:54,caloriesSource:'ESTIMATE'}];
const readback=state(); savedForReopen={id:'synthetic-source-roundtrip',...base,recordDate:base.date,mealTime:base.time,updatedAt:'2026-10-12T02:00:00Z',mealItems:referenceItems,caloriesKcal:198,caloriesSource:'ESTIMATE'};
await readback.editDiet({id:savedForReopen.id}); assert.equal(page.computed.calorieSummary.call(readback).caloriesSource,'ESTIMATE');
readback.diet.calories=420; calls.length=0; await readback.saveDiet(); const manualSaved=calls.at(-1)[2]; assert.equal(manualSaved.caloriesSource,'MANUAL'); assert.ok(manualSaved.mealItems.every(i=>i.caloriesSource==='ESTIMATE'));
savedForReopen={...savedForReopen,...JSON.parse(JSON.stringify(manualSaved)),mealTime:base.time,recordDate:base.date}; await readback.editDiet({id:savedForReopen.id}); assert.equal(readback.diet.estimated,false); assert.equal(page.computed.calorieSummary.call(readback).caloriesSource,'MANUAL');
calls.length=0; await readback.saveDiet({detail:{value:{note:'来源保留回归',foodName:'',foodWeightGrams:'',foodCaloriesKcal:'',mealCaloriesKcal:''}}}); const restored=calls.at(-1)[2]; assert.equal(restored.caloriesKcal,198); assert.equal(restored.caloriesSource,'ESTIMATE'); assert.ok(restored.mealItems.every(i=>i.caloriesSource==='ESTIMATE'));
savedForReopen={...savedForReopen,...JSON.parse(JSON.stringify(restored)),mealTime:base.time,recordDate:base.date}; await readback.editDiet({id:savedForReopen.id}); assert.equal(page.computed.calorieSummary.call(readback).caloriesSource,'ESTIMATE'); assert.match(page.computed.autoEstimateText.call(readback),/参考估算/);
assert.equal(model.foodItem({name:'无热量',caloriesSource:'ESTIMATE'}).caloriesSource,'UNKNOWN'); assert.equal(mealCalories([{name:'无热量',caloriesSource:'ESTIMATE'}]).caloriesSource,'UNKNOWN');
const edited=state(); edited.draftFood={...referenceItems[0],caloriesKcal:180}; edited.markDraftFoodManual(); assert.equal(model.foodItem(edited.draftFood).caloriesSource,'MANUAL');
const manualItems=referenceItems.map(i=>({...i,caloriesSource:'MANUAL'})); assert.equal(mealCalories(manualItems).caloriesSource,'ITEM_SUM'); assert.throws(()=>mergeMealItems([],{foodWeight:100,caloriesSource:'UNKNOWN'}),/名称/);
console.log('Calorie provenance roundtrip passed: reference items, manual total, fresh reopen, immediate clear, source restored, unknown not estimated.');
const unknown=state(); unknown.draftFood={name:"未匹配虚构菜",weightGrams:100,caloriesKcal:""}; await unknown.estimateMealNow(); assert.equal(page.computed.calorieSummary.call(unknown).caloriesKcal,undefined); assert.match(page.computed.autoEstimateText.call(unknown),/未匹配/); assert.equal(buildDietPayload({...base,mealItems:[],estimates:unknown.estimateCache},unknown.draftFood).mealItems[0].caloriesSource,'UNKNOWN');
let resolveLate; estimateResponse=()=>new Promise(r=>{resolveLate=r}); const late=state(); late.draftFood={name:"鸡蛋",weightGrams:100,caloriesKcal:""}; const pending=late.estimateMealNow(); late.cancelMealEstimate(); late.recordVisible=false; resolveLate({code:200,data:{calories:155,source:"COMMON_FOOD_DATABASE"}}); await pending; assert.deepEqual(late.estimateCache,{},"hidden-page response must not refill estimates");
console.log("Automatic meal regression passed: debounce, whole-meal sum, no per-food click, manual override, unknown foods, cached save, current form snapshot and hidden-page response.");
