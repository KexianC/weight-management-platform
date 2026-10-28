import { get, post, patch, del, upload, getApiBaseUrl } from './api.js'
import { getStorage } from './common.js'
import { roleOf, idOf, NEW_STAFF_ROLES } from './staff-role-model.js'

export const user = () => getStorage('userInfo') || {}
const identity = () => idOf(user()) + ':' + roleOf(user())
export const message = e => e?.message || '服务暂不可用，请重试'
export const day = value => value ? String(value).slice(0, 10) : '未填写'
export const pathId = value => {
  if (!/^[A-Za-z0-9_-]{1,191}$/.test(String(value || ''))) throw new Error('客户或记录标识无效')
  return encodeURIComponent(value)
}
export async function call(method, path, payload = {}) {
  const owner = identity()
  if (!getStorage('token') || !NEW_STAFF_ROLES.includes(roleOf(user()))) throw new Error('请使用对应工作人员账号登录')
  const result = await ({ get, post, patch, del })[method](path, payload, { loading: false, showError: false })
  if (owner !== identity()) throw new Error('账号已切换，请重新加载')
  return result.data
}
export const care = {
  clients: () => call('get', '/care-management/patients'),
  client: id => call('get', '/care-management/patients/' + pathId(id)),
  staff: () => call('get', '/care-management/staff'),
  enroll: (dto, existing) => call('post', existing ? '/care-management/existing-patients/' + pathId(existing) + '/enrollment' : '/care-management/patients', dto),
  assign: (id, dto) => call('patch', '/care-management/patients/' + pathId(id) + '/assignment', dto),
  body: (id, dto) => call('post', '/care-management/patients/' + pathId(id) + '/body-reports', dto),
  posture: (id, dto) => call('post', '/care-management/patients/' + pathId(id) + '/posture-photos', dto),
  files: id => call('get', '/report-workflow/patients/' + pathId(id) + '/health-reports'),
  consent: id => call('get', '/report-workflow/patients/' + pathId(id) + '/consent-documents'),
  addFile: (id, dto) => call('post', '/report-workflow/patients/' + pathId(id) + '/health-reports', dto),
  addConsent: (id, dto) => call('post', '/report-workflow/patients/' + pathId(id) + '/consent-documents', dto),
  records: (id, page) => call('get', '/clinical/patients/' + pathId(id) + '/records', { page, pageSize: 30 }),
  videos: () => call('get', '/care-management/videos'),
  addVideo: dto => call('post', '/care-management/videos', dto),
  editVideo: (id, dto) => call('patch', '/care-management/videos/' + pathId(id), dto),
  archiveVideo: id => call('del', '/care-management/videos/' + pathId(id)),
  prescribe: (id, dto, revision) => call('post', revision ? '/care-management/exercise-reports/' + pathId(revision) + '/revisions' : '/care-management/patients/' + pathId(id) + '/exercise-reports', dto)
}
export function go(url, id, extra = '') { uni.navigateTo({ url: url + (id ? '?id=' + pathId(id) + extra : '') }) }
export function staffPage(role) {
  return {
    data: () => ({ actor: {}, error: '', busy: false, loading: false, media: null, _identity: '' }),
    onShow() {
      const current = user()
      if (!getStorage('token') || (role ? roleOf(current) !== role : !NEW_STAFF_ROLES.includes(roleOf(current)))) {
        this.clearPrivate?.(); this.media = null; this.actor = {}; uni.reLaunch({ url: '/pages/login/login' }); return
      }
      if (current.mustChangePassword) { uni.reLaunch({ url: '/pages/change-password/change-password' }); return }
      if (this._identity && this._identity !== identity()) this.clearPrivate?.()
      this._identity = identity(); this.actor = { ...current }
      this.loadPage?.()
    },
    onHide() { this.media = null; this.clearTransient?.() },
    onUnload() { this.media = null; this.clearPrivate?.() },
    methods: {
      day, go, message,
      async run(action) {
        if (this.busy) return
        this.error = ''; this.busy = true
        try { return await action() } catch (e) { this.error = message(e); if ([401,403,404].includes(e.statusCode)) { this.media=null; this.clearPrivate?.() } if (this._identity !== identity()) { this.clearPrivate?.(); this.actor = {}; uni.reLaunch({ url: '/pages/login/login' }) } } finally { this.busy = false }
      },
      async read(action) {
        this.error = ''; this.loading = true
        try { await action() } catch (e) { this.error = message(e); if ([401,403,404].includes(e.statusCode)) { this.media=null; this.clearPrivate?.() } if (this._identity !== identity()) { this.clearPrivate?.(); this.actor = {}; uni.reLaunch({ url: '/pages/login/login' }) } } finally { this.loading = false }
      },
      preview(asset, mimeType = 'image/png') {
        const id = asset?.mediaAssetId || asset?.assetId || asset?.id
        if (id) this.media = { id, mimeType: asset.mimeType || mimeType }
      }
    }
  }
}

export async function pickMedia(kind = 'image') {
  // H5 uses an explicit file chooser, native uses the platform camera/message picker.
  // #ifdef H5
  const selected = await new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'
    input.accept = kind === 'video' ? 'video/mp4,video/webm' : kind === 'pdf' ? 'application/pdf' : 'image/jpeg,image/png,image/webp'
    input.onchange = () => { const file = input.files?.[0]; input.remove(); file ? resolve({ path: URL.createObjectURL(file), file, size: file.size, name: file.name, ownedBlob: true }) : reject(new Error('已取消选择')) }
    input.oncancel = () => { input.remove(); reject(new Error('已取消选择')) }
    input.click()
  })
  return validateSelection(selected, kind)
  // #endif
  // #ifndef H5
  const selected = await new Promise((resolve, reject) => {
    const fail = () => reject(new Error('选择已取消或当前平台不支持此文件类型'))
    if (kind === 'video') uni.chooseVideo({ sourceType: ['album', 'camera'], maxDuration: 7200, compressed: false, success: r => resolve({ path: r.tempFilePath, size: r.size, duration: r.duration }), fail })
    else if (kind === 'pdf') {
      if (typeof uni.chooseMessageFile !== 'function') { fail(); return }
      uni.chooseMessageFile({ count: 1, type: 'file', extension: ['pdf'], success: r => resolve({ path: r.tempFiles[0].path, size: r.tempFiles[0].size, name: r.tempFiles[0].name }), fail })
    } else uni.chooseImage({ count: 1, sizeType: ['original'], sourceType: ['album', 'camera'], success: r => resolve({ path: r.tempFilePaths[0], size: r.tempFiles?.[0]?.size }), fail })
  })
  return validateSelection(selected, kind)
  // #endif
}
function validateSelection(selected, kind) {
  const max = kind === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024
  if (!selected.path || !selected.size || selected.size > max) { releaseSelection(selected); throw new Error(kind === 'video' ? '请选择100MB以内视频' : '请选择10MB以内图片或PDF') }
  return selected
}
export function releaseSelection(selected) {
  // #ifdef H5
  if (selected?.ownedBlob && selected.path) URL.revokeObjectURL(selected.path)
  // #endif
}
export async function uploadSelected(selected) {
  const owner = identity()
  let result
  // #ifdef H5
  // Send the actual selected File; a DOM blob URL is not a uni temporary-file cache key.
  await get('/auth/me', {}, { loading: false, showError: false })
  if (owner !== identity()) throw new Error('账号已切换，上传已取消')
  const data = new FormData(); data.append('file', selected.file, selected.file.name)
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000)
  let response,body
  try { response = await fetch(getApiBaseUrl() + '/media/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + getStorage('token') }, body: data,signal:controller.signal });body=await response.json() }
  catch(e){throw new Error(e.name==='AbortError'?'上传超时，请检查网络后重试':'上传失败，请检查网络后重试')}
  finally {clearTimeout(timer)}
  if (!response.ok) {const error=new Error(Array.isArray(body.message) ? body.message.join('；') : body.message || '上传失败');error.statusCode=response.status;throw error}
  result = { data: body.data || body }
  // #endif
  // #ifndef H5
  result = await upload(selected.path, { loading: false, showError: false })
  // #endif
  if (owner !== identity()) throw new Error('账号已切换，上传结果已忽略')
  if (!result.data?.id) throw new Error('上传未返回附件标识，请重新检查')
  return result.data
}
