import { get, getInviteQrUrl } from './api.js'
import { getStorage } from './common.js'
import { roleOf, idOf } from './staff-role-model.js'

function identity() {const user=getStorage('userInfo')||{};return `${idOf(user)}:${roleOf(user)}`}
export async function loadInviteQr(code) {
  if(!/^\d{6}$/.test(String(code)))throw new Error('绑定码格式无效')
  const owner=identity()
  const role=roleOf(getStorage('userInfo')||{})
  if(role!=='DOCTOR'||!getStorage('token'))throw new Error('请使用医生账号重新登录')
  await get('/auth/me',{}, {loading:false,showError:false})
  if(owner!==identity())throw new Error('登录身份已变化，二维码加载已取消')
  const url=getInviteQrUrl(code),token=getStorage('token')
  let asset
  // #ifdef H5
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000)
  try {
    const response=await fetch(url,{mode:'cors',credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{Authorization:'Bearer '+token},signal:controller.signal})
    if(!response.ok||!/^image\/png(?:;|$)/i.test(response.headers.get('content-type')||''))throw new Error('二维码暂不可用，请稍后重试')
    const blob=await response.blob()
    if(!blob.size||blob.size>512*1024)throw new Error('二维码图片无效')
    const bytes=new Uint8Array(await blob.slice(0,8).arrayBuffer())
    if([137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n))throw new Error('二维码图片格式无效')
    asset={path:URL.createObjectURL(blob),ownedBlob:true}
  } finally {clearTimeout(timer)}
  // #endif
  // #ifndef H5
  asset=await new Promise((resolve,reject)=>uni.downloadFile({url,header:{Authorization:'Bearer '+token},timeout:15000,success:r=>{
    if(r.statusCode===200&&r.tempFilePath)resolve({path:r.tempFilePath,ownedTemp:true})
    else reject(new Error('二维码暂不可用，请稍后重试'))
  },fail:()=>reject(new Error('二维码加载失败，请稍后重试'))}))
  // #endif
  if(owner!==identity()){releaseInviteQr(asset);throw new Error('登录身份已变化，二维码加载已取消')}
  return asset
}
export function releaseInviteQr(asset) {
  // #ifdef H5
  if(asset?.ownedBlob&&asset.path)URL.revokeObjectURL(asset.path)
  // #endif
  // #ifndef H5
  if(asset?.ownedTemp&&asset.path&&typeof uni.getFileSystemManager==='function')uni.getFileSystemManager().unlink({filePath:asset.path,fail(){}})
  // #endif
}
