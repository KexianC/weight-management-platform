import { get, post } from './api.js'
import { getStorage } from './common.js'
import { roleOf, idOf } from './staff-role-model.js'
const identity=()=>{const u=getStorage('userInfo')||{};return idOf(u)+':'+roleOf(u)}
// A purpose-specific client, preserving the staff-only wrapper's original restriction.
export async function cloudCall(method,path,payload={}){
 const user=getStorage('userInfo')||{},owner=identity()
 if(!getStorage('token')||!['PATIENT','HEALTH_MANAGER','DOCTOR'].includes(roleOf(user)))throw new Error('请使用客户本人或有权限的工作人员账号登录')
 if(!['get','post'].includes(method)||(!path.startsWith('/body-cloud-ocr/')&&!(method==='get'&&/^\/report-workflow\/ocr-drafts\/[A-Za-z0-9_-]{1,191}$/.test(path))))throw new Error('云识别请求路径无效')
 const result=await ({get,post})[method](path,payload,{loading:false,showError:false})
 if(owner!==identity())throw new Error('账号已切换，请重新读取授权')
 return result.data
}
