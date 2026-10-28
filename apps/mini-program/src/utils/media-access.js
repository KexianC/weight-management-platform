import { get, getApiBaseUrl } from './api.js'
import { getStorage } from './common.js'

const downloadedFiles = new Set()

export async function resolveMediaFile(assetId) {
  if (!assetId || !/^[A-Za-z0-9_-]{1,191}$/.test(assetId)) throw new Error('附件ID无效')
  const session = getStorage('userInfo')?.userId || getStorage('userInfo')?.id
  const result = await get(`/media/${encodeURIComponent(assetId)}/url`, {}, { loading: false, showError: false })
  const url = result.data?.url
  const base = getApiBaseUrl()
  // Never send credentials to an arbitrary URL supplied in a media response.
  if (!url || !url.startsWith(`${base}/media/`)) throw new Error('媒体服务未返回受保护的应用内地址')
  const token = getStorage('token')
  if (!token) throw new Error('请先登录')
  const header = { Authorization: `Bearer ${token}` }
  let filePath
  // #ifdef H5
  const response = await fetch(url, { headers: header, cache: 'no-store' })
  if (!response.ok) throw new Error(response.status === 403 ? '无权查看此附件' : '附件不可用，请刷新后重试')
  filePath = URL.createObjectURL(await response.blob())
  // #endif
  // #ifndef H5
  filePath = await new Promise((resolve, reject) => uni.downloadFile({ url, header,
    success: res => res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath ? resolve(res.tempFilePath) : reject(new Error('附件已失效或无权访问')),
    fail: () => reject(new Error('附件下载失败，请检查网络'))
  }))
  // #endif
  downloadedFiles.add(filePath)
  if (session !== (getStorage('userInfo')?.userId || getStorage('userInfo')?.id)) { releaseMediaFile(filePath); throw new Error('账号已切换，请重新加载') }
  return filePath
}
export function releaseMediaFile(filePath) {
  if (!downloadedFiles.has(filePath)) return
  downloadedFiles.delete(filePath)
  // #ifdef H5
  if (typeof filePath === 'string' && filePath.startsWith('blob:')) URL.revokeObjectURL(filePath)
  // #endif
  // #ifndef H5
  if (typeof uni.getFileSystemManager === 'function') uni.getFileSystemManager().unlink({ filePath, fail: () => {} })
  // #endif
}
