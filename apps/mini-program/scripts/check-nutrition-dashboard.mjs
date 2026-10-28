import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
const root=path.resolve(import.meta.dirname,'..')
const source=fs.readFileSync(path.join(root,'src/pages/doctor/index.vue'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^\s*import .*$/mg,'').replace('export default','globalThis.page =')
let overallCalls=0
const sandbox={Icon:{},console:{log(){},error(){}},store:{},isNutritionist:()=>true,getAssignedPatientRelations:async()=>({code:200,data:{patients:[{userId:'synthetic',relationInfo:{createdAt:new Date().toISOString()}}],total:5}}),getFollowUpStatistics:async()=>({code:200,data:{pending:1,completed:2}}),getOverallStats:async()=>{overallCalls++;return{code:200,data:{totalPatients:2,activePatients:1,newPatients:0}}}}
vm.runInNewContext(source,sandbox)
const methods=sandbox.page.methods
for(const nutritionist of [true,false]){
 const state={...sandbox.page.data(),userInfo:{userId:'synthetic-care-user'},nutritionistView:nutritionist,loadUnreadCount(){}}
 for(const name of ['loadDashboardData','calculatePatientStats'])state[name]=methods[name].bind(state)
 await state.loadDashboardData()
 assert.equal(state.totalPatients,nutritionist?5:2,'nutritionist assignment count must not be replaced by doctor relationship statistics')
 assert.equal(state.pendingTasks,1);assert.equal(state.completionRate,67);assert.equal(state.loading,false)
}
assert.equal(overallCalls,1,'nutritionist must not call the physician summary')
console.log('营养师已分配数量与医生总览隔离回归通过')
