import assert from 'node:assert/strict'
import { routinePayload, routineSleepMinutes, routineSleepLabel, routineView, routineMealCount } from '../src/utils/daily-routine-model.js'
const context={date:'2026-11-13',revision:'snapshot-revision',record:null,draft:{weightKg:null,answers:{sleep_hours:7.5,lunch_text:'米饭',lunch_photo_ids:Array.from({length:9},(_,i)=>'p'+i),water_ml:0},photos:[],version:0}}
assert.equal(routineView(context).weightKg,null)
assert.equal(routineSleepLabel(context.draft.answers),'7.5小时')
assert.equal(routineSleepMinutes(undefined,'09:00'),null)
assert.equal(routineSleepMinutes('00:00','09:00'),540)
assert.equal(routineSleepMinutes('23:30','07:00'),450)
assert.equal(routineMealCount(context.draft.answers),1)
const unchanged=routinePayload(context,'',context.draft.answers,'diet');assert.deepEqual(unchanged.changedFields,[]);assert.equal(unchanged.weightKg,undefined);assert.equal(unchanged.answers.lunch_photo_ids.length,9)
const edited=routinePayload(context,'65.5',{...context.draft.answers,water_ml:1800,lunch_text:''},'diet')
assert.deepEqual(edited.changedFields.sort(),['lunch_text','water_ml','weightKg'].sort());assert.equal(edited.revision,context.revision);assert.equal(edited.date,context.date);assert.equal(edited.answers.sleep_hours,7.5);assert.equal(edited.answers.lunch_photo_ids.length,9);assert.equal(edited.answers.lunch_text,undefined)
assert.throws(()=>routinePayload(context,'19',{},'weight'),/体重/)
const removed=routinePayload(context,'',{...context.draft.answers,lunch_photo_ids:[]},'diet');assert.deepEqual(removed.changedFields,['lunch_photo_ids']);assert.equal(removed.answers.lunch_photo_ids,undefined)
console.log('daily shared routine contract checks passed')
