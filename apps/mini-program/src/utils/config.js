const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '')
const STORAGE_BASE_URL = String(import.meta.env.VITE_STORAGE_BASE_URL || API_BASE_URL.replace(/\/api\/v1$/, '')).replace(/\/$/, '')

export function getCloudStorageConfig() {
	return { uploadDomain: API_BASE_URL, downloadDomain: STORAGE_BASE_URL }
}

export function getUploadDomain() {
	return API_BASE_URL
}

export function getDownloadDomain() {
	return STORAGE_BASE_URL
}

export function getImageUrl(fileIdOrPath) {
	if (!fileIdOrPath) return ''
	if (/^(https?:|data:|blob:)/i.test(fileIdOrPath)) return fileIdOrPath
	return `${STORAGE_BASE_URL}/${String(fileIdOrPath).replace(/^\/+/, '')}`
}

export function getAvatarUrl(avatarPath) {
	return avatarPath ? getImageUrl(avatarPath) : '/static/default-avatar.png'
}

export const getWeightImageUrl = getImageUrl
export const getTaskImageUrl = getImageUrl

export const UPLOAD_PATHS = {
	AVATAR: 'avatars',
	WEIGHT_IMAGE: 'weight-images',
	TASK_IMAGE: 'task-images',
	FOLLOW_IMAGE: 'follow-images',
	UPLOADS: 'uploads'
}

export function generateUploadPath(type, extension = 'jpg') {
	const folder = Object.values(UPLOAD_PATHS).includes(type) ? type : UPLOAD_PATHS.UPLOADS
	const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}.${extension}`
	return `${folder}/${filename}`
}

export default {
	getCloudStorageConfig,
	getUploadDomain,
	getDownloadDomain,
	getImageUrl,
	getAvatarUrl,
	getWeightImageUrl,
	getTaskImageUrl,
	UPLOAD_PATHS,
	generateUploadPath
}
