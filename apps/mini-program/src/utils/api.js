import { showToast, showLoading, hideLoading, getStorage } from './common.js'
import { UPLOAD_PATHS, getImageUrl } from './config.js'
import { normalizeRecordPayload } from './record-model.js'
import { resolveMediaFile } from './media-access.js'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000/api/v1'
const BASE_URL = String(import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
export const getApiBaseUrl = () => BASE_URL
const TIMEOUT = 15000
let authRedirectScheduled = false
let refreshPromise = null

function joinUrl(path) {
	if (/^https?:\/\//i.test(path)) return path
	return `${BASE_URL}/${String(path || '').replace(/^\/+/, '')}`
}

function successfulCode(statusCode) {
	return statusCode >= 200 && statusCode < 300
}

function normalizeResponse(body, statusCode = 200) {
	const hasLegacyEnvelope = body && typeof body === 'object' && (
		Object.prototype.hasOwnProperty.call(body, 'data') ||
		Object.prototype.hasOwnProperty.call(body, 'message') ||
		Object.prototype.hasOwnProperty.call(body, 'msg') ||
		(typeof body.code === 'number' && Number.isFinite(body.code) && body.code >= 0 && body.code <= 599)
	)
	if (hasLegacyEnvelope && Number.isFinite(Number(body.code))) {
		return {
			...body,
			code: Number(body.code),
			data: body.data ?? null,
			message: body.message || body.msg || (successfulCode(statusCode) ? '操作成功' : '操作失败')
		}
	}

	return {
		code: successfulCode(statusCode) ? 200 : statusCode,
		data: body ?? null,
		message: body?.message || body?.error || (successfulCode(statusCode) ? '操作成功' : `请求失败 ${statusCode}`)
	}
}

function handleUnauthorized(message, options, expectedToken) {
	if (expectedToken && getStorage('token') !== expectedToken) return
	uni.removeStorageSync('token')
	uni.removeStorageSync('refreshToken')
	uni.removeStorageSync('userInfo')
	if (options.showError !== false) showToast(message, 'none')
	if (authRedirectScheduled) return
	authRedirectScheduled = true
	setTimeout(() => {
		authRedirectScheduled = false
		uni.reLaunch({ url: '/pages/login/login' })
	}, 800)
}

function errorMessage(body, statusCode) {
	const raw = body?.message || body?.msg || body?.error
	if (Array.isArray(raw)) return raw.join('；')
	if (raw) return String(raw)
	if (statusCode === 401) return '登录已过期，请重新登录'
	if (statusCode === 403) return '无权执行此操作'
	if (statusCode === 404) return '请求的资源不存在'
	return `请求失败 ${statusCode}`
}

function refreshAccessToken() {
	if (refreshPromise) return refreshPromise
	const refreshToken = getStorage('refreshToken')
	if (!refreshToken) return Promise.reject(new Error('登录已过期，请重新登录'))

	refreshPromise = new Promise((resolve, reject) => {
		uni.request({
			url: joinUrl('/auth/refresh'),
			method: 'POST',
			data: { refreshToken },
			header: { 'Content-Type': 'application/json', Accept: 'application/json' },
			timeout: TIMEOUT,
			success: (res) => {
				if (!successfulCode(res.statusCode)) {
					const error = new Error(errorMessage(res.data, res.statusCode))
					error.statusCode = res.statusCode
					reject(error)
					return
				}
				if (getStorage('refreshToken') !== refreshToken) { reject(new Error('账号会话已变化，请重新加载')); return }
				const payload = normalizeResponse(res.data, res.statusCode).data || {}
				if (!payload.accessToken || !payload.refreshToken) {
					reject(new Error('会话刷新响应无效'))
					return
				}
				uni.setStorageSync('token', payload.accessToken)
				uni.setStorageSync('refreshToken', payload.refreshToken)
				if (payload.user) uni.setStorageSync('userInfo', adaptUser(payload.user))
				resolve(payload.accessToken)
			},
			fail: () => reject(new Error('会话刷新失败，请在网络恢复后重试'))
		})
	}).finally(() => {
		refreshPromise = null
	})

	return refreshPromise
}

export function request(options = {}) {
	return new Promise((resolve, reject) => {
		const useLoading = options.loading !== false
		if (useLoading) showLoading(options.loadingText || '请求中...')

		const token = getStorage('token')
		const requestAccount = getStorage('userInfo')?.userId || getStorage('userInfo')?.id
		const header = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...options.header
		}
		if (token) header.Authorization = `Bearer ${token}`

		uni.request({
			url: joinUrl(options.url),
			method: options.method || 'GET',
			data: options.data ?? {},
			header,
			timeout: options.timeout || TIMEOUT,
			success: (res) => {
				if (useLoading) hideLoading()
				if (requestAccount !== (getStorage('userInfo')?.userId || getStorage('userInfo')?.id)) { reject(new Error('账号已切换，请重新加载')); return }
				if (successfulCode(res.statusCode)) {
					resolve(normalizeResponse(res.data, res.statusCode))
					return
				}

				const message = errorMessage(res.data, res.statusCode)
				const authBootstrapRequest = /^\/auth\/(?:login|register|wechat\/login|sms(?:\/|$)|password\/reset|refresh)/.test(String(options.url || ''))
				const canRefresh = res.statusCode === 401 && getStorage('refreshToken') && !options._authRetried && !authBootstrapRequest
				if (canRefresh) {
					refreshAccessToken()
						.then(() => request({ ...options, _authRetried: true, loading: false }))
						.then(resolve)
						.catch((refreshError) => {
							if (refreshError.statusCode === 401) handleUnauthorized(refreshError.message || message, options, token)
						else if (options.showError !== false) showToast(refreshError.message || '网络恢复后请重试', 'none')
							reject(refreshError)
						})
					return
				}
				if (res.statusCode === 401 && token && !authBootstrapRequest) handleUnauthorized(message, options, token)
				else if (options.showError !== false) showToast(message, 'none')
				const error = new Error(message)
				error.statusCode = res.statusCode
				error.response = res.data
				reject(error)
			},
			fail: (err) => {
				if (useLoading) hideLoading()
				const message = err?.errMsg?.includes('timeout') ? '请求超时' : '网络连接失败'
				if (options.showError !== false) showToast(message, 'none')
				const error = new Error(message)
				error.cause = err
				reject(error)
			}
		})
	})
}

export const get = (url, data = {}, options = {}) => request({ url, method: 'GET', data, ...options })
export const post = (url, data = {}, options = {}) => request({ url, method: 'POST', data, ...options })
export const put = (url, data = {}, options = {}) => request({ url, method: 'PUT', data, ...options })
export const patch = (url, data = {}, options = {}) => request({ url, method: 'PATCH', data, ...options })
export const del = (url, data = {}, options = {}) => request({ url, method: 'DELETE', data, ...options })

function withData(result, data) {
	return { ...result, data }
}

function unsupportedOperation(feature, options = {}) {
	const message = `${feature}尚未由独立后端提供`
	if (options.showError !== false) showToast(message, 'none')
	const error = new Error(message)
	error.code = 'UNSUPPORTED_OPERATION'
	return Promise.reject(error)
}

function collection(result, names = []) {
	const payload = result.data
	if (Array.isArray(payload)) return payload
	for (const name of ['items', ...names]) {
		if (Array.isArray(payload?.[name])) return payload[name]
	}
	return []
}

function paginationTotal(result, items) {
	return result.data?.total ?? result.data?.pagination?.total ?? items.length
}

function apiRole(role) {
	const value = String(role || '').toLowerCase()
	if (value === 'doctor' || value === 'practitioner') return 'DOCTOR'
	if (value === 'nutritionist') return 'NUTRITIONIST'
	if (value === 'patient') return 'PATIENT'
	return role
}

function legacyRole(role) {
	const value = String(role || '').toUpperCase()
	if (value === 'PATIENT') return 'patient'
	if (value === 'PRACTITIONER' || value === 'DOCTOR' || value === 'NUTRITIONIST') return 'doctor'
	return String(role || '').toLowerCase()
}

function adaptUser(user) {
	if (!user || typeof user !== 'object') return user
	const patient = user.patientProfile || {}
	const practitioner = user.practitionerProfile || {}
	const backendRole = String(user.backendRole || user.role || '').toUpperCase()
	const birthDate = patient.birthDate ? new Date(patient.birthDate) : null
	let age = user.age
	if (!age && birthDate && !Number.isNaN(birthDate.getTime())) {
		const today = new Date()
		age = today.getFullYear() - birthDate.getFullYear()
		if (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate())) age -= 1
	}
	return {
		...user,
		...patient,
		...practitioner,
		userId: user.userId || user.id,
		name: user.name || user.displayName,
		avatar: user.avatar || user.avatarUrl,
		// 旧页面继续使用 patient / doctor 路由组，同时保留真实执业身份供展示与注册复用。
		role: legacyRole(backendRole || user.role),
		backendRole,
		age,
		height: user.height ?? patient.heightCm,
		targetWeight: user.targetWeight ?? patient.targetWeightKg,
		weight: user.weight ?? patient.initialWeightKg,
		specialization: user.specialization || practitioner.specialty
	}
}

function adaptAuth(result) {
	const payload = result.data || {}
	if (payload.refreshToken) uni.setStorageSync('refreshToken', payload.refreshToken)
	return withData(result, {
		...payload,
		token: payload.token || payload.accessToken,
		user: adaptUser(payload.user || payload)
	})
}

function smsPurpose(value) {
	const normalized = String(value || '').toLowerCase().replace(/-/g, '_')
	if (normalized === 'login') return 'LOGIN'
	if (normalized === 'reset_password' || normalized === 'password_reset') return 'RESET_PASSWORD'
	if (normalized === 'verify_phone' || normalized === 'wechat') return 'VERIFY_PHONE'
	return 'REGISTER'
}

function smsChallengeKey(phone, purpose) {
	return `smsChallenge:${String(phone || '')}:${purpose}`
}

function storedChallenge(phone, purpose) {
	return getStorage(smsChallengeKey(phone, purpose)) || ''
}

function birthDateFromAge(age) {
	const numericAge = Number(age)
	if (!Number.isFinite(numericAge) || numericAge < 0 || numericAge > 120) return undefined
	return `${new Date().getFullYear() - numericAge}-01-01`
}

function optionalNumber(value) {
	if (value === undefined || value === null || value === '') return undefined
	const numeric = Number(value)
	return Number.isFinite(numeric) ? numeric : undefined
}

function dateBoundary(value, endOfDay = false) {
	if (!value || typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
	const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
	return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function registrationPayload(data) {
	const purpose = 'REGISTER'
	return Object.fromEntries(Object.entries({
		phone: data.phone,
		password: data.password,
		displayName: data.displayName || data.name,
		role: apiRole(data.role),
		challengeId: data.challengeId || storedChallenge(data.phone, purpose),
		code: data.code || data.smsCode,
		acceptedTerms: data.acceptedTerms ?? true,
		consentVersion: data.consentVersion || '2026-10-13',
		gender: data.gender ? String(data.gender).toUpperCase() : undefined,
		birthDate: data.birthDate || birthDateFromAge(data.age),
		heightCm: optionalNumber(data.heightCm ?? data.height),
		targetWeightKg: optionalNumber(data.targetWeightKg ?? data.targetWeight),
		hospital: data.hospital,
		department: data.department,
		title: data.title,
		specialty: data.specialty || data.specialization,
		licenseNumber: data.licenseNumber,
		practitionerInviteCode: data.practitionerInviteCode || data.inviteCode
	}).filter(([, value]) => value !== undefined && value !== ''))
}

function profilePayload(data) {
	return Object.fromEntries(Object.entries({
		displayName: data.displayName || data.name,
		avatarUrl: data.avatarUrl || data.avatar,
		email: data.email,
		gender: data.gender ? String(data.gender).toUpperCase() : undefined,
		birthDate: data.birthDate || birthDateFromAge(data.age),
		heightCm: optionalNumber(data.heightCm ?? data.height),
		initialWeightKg: optionalNumber(data.initialWeightKg ?? data.weight),
		medicalHistory: data.medicalHistory,
		allergies: data.allergies,
		emergencyContactName: data.emergencyContactName,
		emergencyContactPhone: data.emergencyContactPhone,
		hospital: data.hospital,
		department: data.department,
		title: data.title,
		specialty: data.specialty || data.specialization,
		licenseNumber: data.licenseNumber,
		introduction: data.introduction
	}).filter(([, value]) => value !== undefined && value !== ''))
}

export async function upload(filePath, options = {}) {
	// Refresh an expired camera-return session before sending bytes.
	await get('/auth/me', {}, { loading: false, showError: options.showError })
	return new Promise((resolve, reject) => {
		const useLoading = options.loading !== false
		if (useLoading) showLoading(options.loadingText || '上传中...')
		const token = getStorage('token')
		const uploadAccount = getStorage('userInfo')?.userId || getStorage('userInfo')?.id
		const header = { ...options.header }
		if (token) header.Authorization = `Bearer ${token}`

		uni.uploadFile({
			url: joinUrl(options.url || '/media/upload'),
			filePath,
			name: options.name || 'file',
			header,
			// Business endpoints bind uploaded asset ids. Upload accepts only optional scope.
			formData: options.formData?.scope ? { scope: options.formData.scope } : {},
			timeout: options.timeout || 60000,
			success: (res) => {
				if (useLoading) hideLoading()
				if (uploadAccount !== (getStorage('userInfo')?.userId || getStorage('userInfo')?.id)) { reject(new Error('账号已切换，上传结果已忽略')); return }
				let body = res.data
				try { body = typeof body === 'string' ? JSON.parse(body) : body } catch { body = null }
				if (!successfulCode(res.statusCode) || !body) {
					const message = errorMessage(body, res.statusCode)
					if (options.showError !== false) showToast(message, 'none')
					reject(new Error(message))
					return
				}
				const result = normalizeResponse(body, res.statusCode)
				const file = result.data || {}
				const url = file.url || file.downloadUrl || file.tempFileURL || ''
				resolve(withData(result, {
					...file,
					fileID: file.fileID || file.id || file.key,
					tempFileURL: file.tempFileURL || url,
					downloadUrl: file.downloadUrl || url,
					cloudPath: file.cloudPath || file.key || options.formData?.path
				}))
			},
			fail: (err) => {
				if (useLoading) hideLoading()
				if (options.showError !== false) showToast('上传失败', 'none')
				const error = new Error('上传失败')
				error.cause = err
				reject(error)
			}
		})
	})
}

// Authentication and profile
export const register = (data, options = {}) => post('/auth/register', registrationPayload(data), options).then(adaptAuth)
export function login(data, options = {}) {
	const practitionerLogin = String(data.role || '').toLowerCase() === 'practitioner'
	if (data.loginType === 'sms') {
		return post(practitionerLogin ? '/auth/practitioner-sms-login' : '/auth/sms/login', {
			phone: data.phone,
			role: practitionerLogin ? undefined : apiRole(data.role),
			challengeId: data.challengeId || storedChallenge(data.phone, 'LOGIN'),
			code: data.code || data.smsCode
		}, options).then(adaptAuth)
	}
	return post(practitionerLogin ? '/auth/practitioner-login' : '/auth/login', {
		phone: data.phone,
		password: data.password,
		role: practitionerLogin ? undefined : apiRole(data.role)
	}, options).then(adaptAuth)
}
export const getUserInfo = (options = {}) => get('/auth/me', {}, options).then((result) => withData(result, adaptUser(result.data)))
export function sendSmsCode(phoneOrData, type = 'register', options = {}) {
	const input = phoneOrData && typeof phoneOrData === 'object' ? phoneOrData : { phone: phoneOrData }
	const purpose = smsPurpose(input.purpose || input.type || type)
	return post('/auth/sms/send', {
		phone: input.phone,
		purpose
	}, options).then((result) => {
		if (result.data?.challengeId) uni.setStorageSync(smsChallengeKey(input.phone, purpose), result.data.challengeId)
		return withData(result, { ...result.data, code: result.data?.debugCode })
	})
}
export function verifySmsCode(phone, code, purpose = 'password-reset', options = {}) {
	const normalizedPurpose = smsPurpose(purpose)
	return post('/auth/sms/verify', {
		phone,
		challengeId: storedChallenge(phone, normalizedPurpose),
		purpose: normalizedPurpose,
		code
	}, options)
}
export function resetPassword(data, options = {}) {
	const practitionerAccount = String(data.role || '').toLowerCase() === 'practitioner'
	return post(practitionerAccount ? '/auth/practitioner-password/reset' : '/auth/password/reset', {
		phone: data.phone,
		role: practitionerAccount ? undefined : apiRole(data.role),
		challengeId: data.challengeId || storedChallenge(data.phone, 'RESET_PASSWORD'),
		code: data.code || data.smsCode,
		newPassword: data.newPassword
	}, options)
}

// Phone authorization is the sole fast-login proof; no wx.login or binding stage.
export function wechatPhoneLogin(data, options = {}) {
  return post('/auth/wechat/phone-login', {
    phoneCode: data.phoneCode, acceptedTerms: data.acceptedTerms === true, consentVersion: data.consentVersion || '2026-10-13'
  }, { ...options, showError: false }).then((result) => {
    const payload = result.data || {}
    if (!payload.accessToken || !payload.refreshToken || !payload.user) throw new Error('手机号登录响应无效')
    // Commit only after the page validates its current attempt; no early storage.
    return withData(result, { ...payload, token: payload.accessToken, user: adaptUser(payload.user) })
  })
}
export function wechatLogin() { return Promise.reject(new Error('请使用手机号快捷登录')) }
export function wechatRegister() { return Promise.reject(new Error('账号由健康管理师开通，请从登录页验证手机号')) }
export const updateUserInfo = (data, options = {}) => patch('/auth/me', profilePayload(data), options).then((result) => withData(result, adaptUser(result.data)))
export const changePassword = (data, options = {}) => patch('/auth/change-password', {
	currentPassword: data.currentPassword || data.oldPassword,
	newPassword: data.newPassword
}, options)
export const logout = (options = {}) => post('/auth/logout', { refreshToken: getStorage('refreshToken') }, options)

// Health records
function normalizeHealthRecord(data) {
	return normalizeRecordPayload(data)
}

function adaptHealthRecord(record) {
	if (!record || typeof record !== 'object') return record
	const item = record.mealItems?.[0] || {}
	const occurredAt = record.recordDate || record.recordedAt || record.measuredAt
	const occurredDate = occurredAt ? new Date(occurredAt) : null
	const recordDate = occurredDate && !Number.isNaN(occurredDate.getTime())
		? `${occurredDate.getFullYear()}-${String(occurredDate.getMonth() + 1).padStart(2, '0')}-${String(occurredDate.getDate()).padStart(2, '0')}`
		: occurredAt
	const rawMealTime = record.mealTime || occurredAt
	const mealDate = rawMealTime ? new Date(rawMealTime) : null
	const mealTime = mealDate && !Number.isNaN(mealDate.getTime())
		? `${String(mealDate.getHours()).padStart(2, '0')}:${String(mealDate.getMinutes()).padStart(2, '0')}`
		: rawMealTime
	return {
		...record,
		_id: record._id || record.id,
		type: String(record.type || record.recordType || '').toLowerCase(),
		recordDate,
		createTime: record.createTime || record.createdAt,
		weight: record.weight ?? record.weightKg,
		mealType: String(record.mealType || '').toLowerCase(),
		mealTime,
		foodName: record.foodName || item.name,
		foodWeight: record.foodWeight ?? item.weightGrams,
		calories: record.calories ?? record.caloriesKcal ?? item.caloriesKcal,
		notes: record.notes ?? record.note
	}
}

export function getHealthRecords(params = {}, options = {}) {
	const recordType = params.recordType || params.type
	const query = Object.fromEntries(Object.entries({
		recordType: recordType ? String(recordType).toUpperCase() : undefined,
		startAt: dateBoundary(params.startAt || params.startDate),
		endAt: dateBoundary(params.endAt || params.endDate, true),
		page: Number(params.page || (params.skip && params.limit ? Math.floor(Number(params.skip) / Number(params.limit)) + 1 : 1)),
		pageSize: Number(params.pageSize || params.limit || 30)
	}).filter(([, value]) => value !== undefined && value !== ''))
	const user = getStorage('userInfo') || {}
	const practitionerView = legacyRole(user.role) === 'doctor' && params.patientId
	const endpoint = practitionerView ? `/clinical/patients/${encodeURIComponent(params.patientId)}/health-records` : '/health-records'
	const requestQuery = practitionerView ? (query.recordType ? { recordType: query.recordType } : {}) : query
	return get(endpoint, requestQuery, options).then((result) => withData(result, collection(result, ['records', 'healthRecords']).map(adaptHealthRecord)))
}
export const createHealthRecord = (data, options = {}) => post('/health-records', normalizeHealthRecord(data), options).then((result) => withData(result, adaptHealthRecord(result.data)))
export const updateHealthRecord = (recordId, data, options = {}) => patch(`/health-records/${encodeURIComponent(recordId)}`, normalizeHealthRecord(data), options)
export const getHealthRecord = (recordId, options = {}) => get(`/health-records/${encodeURIComponent(recordId)}`, {}, options).then((result) => withData(result, adaptHealthRecord(result.data)))
export const replyToRecordReview = (recordId, reviewId, comment, options = {}) => post(`/me/health-records/${encodeURIComponent(recordId)}/reviews/${encodeURIComponent(reviewId)}/replies`, { comment }, options)
export const getDietPlans = (options = {}) => get('/diet-plans', {}, options)
export const deleteHealthRecord = (recordId, options = {}) => del(`/health-records/${encodeURIComponent(recordId)}`, {}, options)
export function getHealthRecordStats(params = {}, options = {}) {
	if (params.patientId) {
		return get(`/care/patients/${encodeURIComponent(params.patientId)}/stats`, {}, options)
			.then((result) => withData(result, adaptPatientStats(result.data)))
	}
	const days = Number(params.days || 0)
	const range = params.range || (days <= 7 && days > 0 ? '7d' : days <= 30 && days > 0 ? '30d' : '90d')
	return get('/health-records/stats', { range }, options)
}

// Care relationships and invitations. The authenticated actor is derived from JWT.
function adaptPatient(patient) {
	if (!patient || typeof patient !== 'object') return patient
	return {
		...patient,
		userId: patient.userId || patient.patientId || patient.id,
		name: patient.name || patient.displayName,
		avatar: patient.avatar || patient.avatarUrl,
		height: patient.height ?? patient.heightCm,
		currentWeight: patient.currentWeight ?? patient.currentWeightKg,
		weight: patient.weight ?? patient.currentWeightKg,
		targetWeight: patient.targetWeight ?? patient.targetWeightKg,
		initialWeight: patient.initialWeight ?? patient.initialWeightKg,
		gender: patient.gender ? String(patient.gender).toLowerCase() : patient.gender,
		relationInfo: patient.relationInfo || patient.relation,
		lastRecordDate: patient.lastRecordDate || patient.latestRecordAt
	}
}
function adaptDoctor(doctor) {
	if (!doctor || typeof doctor !== 'object') return doctor
	const relation = doctor.practitioner ? doctor : null
	const user = relation?.practitioner || doctor
	const profile = user.practitionerProfile || {}
	const doctorId = user.doctorId || user.practitionerId || user.id || doctor.practitionerId
	return {
		...doctor,
		...user,
		...profile,
		relationId: relation?.id,
		relationInfo: doctor.relationInfo || relation || undefined,
		userId: doctorId,
		doctorId,
		name: user.name || user.displayName,
		doctorName: user.doctorName || user.displayName,
		avatar: user.avatar || user.avatarUrl
	}
}
function patientListResult(result) {
	const patients = collection(result, ['patients']).map(adaptPatient)
	return withData(result, { ...(Array.isArray(result.data) ? {} : result.data), patients, total: paginationTotal(result, patients) })
}
export function getDoctorPatientRelations(params = {}, options = {}) {
	const query = Object.fromEntries(Object.entries({
		search: params.search || params.keyword,
		status: params.status,
		page: Number(params.page || 1),
		pageSize: Number(params.pageSize || params.limit || 20)
	}).filter(([, value]) => value !== undefined && value !== ''))
	return get('/care/patients', query, options).then(patientListResult)
}
export const getPatientList = getDoctorPatientRelations
export const bindPatient = (data, options = {}) => {
	const inviteCode = data?.inviteCode || data?.code
	return inviteCode
		? bindByInviteCode(inviteCode, data?.patientId, options)
		: unsupportedOperation('无邀请码的患者直接绑定', options)
}
export function unbindPatient(counterpartyId, options = {}) {
	const user = getStorage('userInfo') || {}
	const resource = legacyRole(user.role) === 'patient' ? 'doctors' : 'patients'
	return del(`/care/${resource}/${encodeURIComponent(counterpartyId)}`, {}, options)
}
export const generateInviteCode = (_doctorId, validDays = 7, forceNew = false, options = {}) => post('/care/invites', { validDays, forceNew }, options).then((result) => withData(result, {
	...result.data,
	inviteCode: result.data?.inviteCode || result.data?.code
}))
export const getInviteQrUrl = (inviteCode) => joinUrl(`/care/invites/${encodeURIComponent(inviteCode)}/qr`)
export const getInviteInfo = (inviteCode, options = {}) => get(`/care/invites/${encodeURIComponent(inviteCode)}`, {}, options).then((result) => {
	const practitioner = adaptDoctor(result.data?.practitioner || result.data?.doctorInfo || result.data?.doctor)
	return withData(result, { ...result.data, practitioner, doctorInfo: practitioner })
})
export const bindByInviteCode = (inviteCode, _patientId, options = {}) => post(`/care/invites/${encodeURIComponent(inviteCode)}/bind`, {}, options)
export function getPatientDoctors(_patientId, options = {}) {
	return get('/care/doctors', {}, options).then((result) => {
		const doctors = collection(result, ['doctors', 'practitioners', 'relations']).map(adaptDoctor)
		return withData(result, { ...(Array.isArray(result.data) ? {} : result.data), doctors })
	})
}
export function getDoctorInfo(options = {}) {
	const user = getStorage('userInfo') || {}
	if (legacyRole(user.role) === 'doctor') return getUserInfo(options).then((result) => withData(result, adaptDoctor(result.data)))
	return getPatientDoctors(user.userId, options).then((result) => withData(result, result.data?.doctors?.[0] || null))
}
export const getPatientDetail = (patientId, options = {}) => get(`/care/patients/${encodeURIComponent(patientId)}`, {}, options).then((result) => withData(result, adaptPatient(result.data)))
export const createPatient = bindPatient
export const updatePatient = (_patientId, _data, options = {}) => unsupportedOperation('医护端修改患者资料', options)
export const deletePatient = unbindPatient
function adaptPatientStats(stats = {}) {
	const currentWeight = stats.currentWeight ?? stats.currentWeightKg
	const targetWeight = stats.targetWeight ?? stats.targetWeightKg
	const initialWeight = stats.initialWeight ?? stats.initialWeightKg
	let progress = stats.progress
	const progressValues = [currentWeight, targetWeight, initialWeight]
	if (progress === undefined && progressValues.every((value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) && Number(initialWeight) !== Number(targetWeight)) {
		progress = Math.round(Math.max(0, Math.min(100, ((Number(currentWeight) - Number(initialWeight)) / (Number(targetWeight) - Number(initialWeight))) * 100)))
	}
	return { ...stats, currentWeight, targetWeight, initialWeight, progress }
}
export function getPatientStats(params = {}, options = {}) {
	if (!params.patientId) return get('/clinical/summary', {}, options)
	return get(`/care/patients/${encodeURIComponent(params.patientId)}/stats`, {}, options).then((result) => withData(result, adaptPatientStats(result.data)))
}

// Follow-ups
const FOLLOW_TYPE_TO_API = {
	weight_check: 'WEIGHT',
	weight_tracking: 'WEIGHT',
	diet_guidance: 'DIET',
	exercise_plan: 'EXERCISE',
	health_assessment: 'QUESTIONNAIRE',
	medication_review: 'MEDICATION',
	offline_visit: 'OFFLINE',
	phone_visit: 'PHONE',
	phone_call: 'PHONE',
	general: 'GENERAL'
}
const FOLLOW_TYPE_TO_LEGACY = {
	WEIGHT: 'weight_check',
	DIET: 'diet_guidance',
	EXERCISE: 'exercise_plan',
	QUESTIONNAIRE: 'health_assessment',
	MEDICATION: 'medication_review',
	OFFLINE: 'offline_visit',
	PHONE: 'phone_visit',
	GENERAL: 'general'
}
const FOLLOW_STATUS_TO_API = {
	pending: 'SCHEDULED',
	scheduled: 'SCHEDULED',
	ongoing: 'IN_PROGRESS',
	in_progress: 'IN_PROGRESS',
	overdue: 'OVERDUE',
	completed: 'COMPLETED',
	cancelled: 'CANCELLED',
	canceled: 'CANCELLED'
}
const FOLLOW_STATUS_TO_LEGACY = {
	SCHEDULED: 'pending',
	IN_PROGRESS: 'ongoing',
	OVERDUE: 'overdue',
	COMPLETED: 'completed',
	CANCELLED: 'cancelled'
}

function apiFollowType(value) {
	const raw = String(value || '')
	return FOLLOW_TYPE_TO_API[raw.toLowerCase()] || raw.toUpperCase()
}

function apiFollowStatus(value) {
	const raw = String(value || '')
	return FOLLOW_STATUS_TO_API[raw.toLowerCase()] || raw.toUpperCase()
}

function apiTaskStatus(value) {
	const raw = String(value || '')
	const statuses = {
		pending: 'PENDING',
		ongoing: 'IN_PROGRESS',
		in_progress: 'IN_PROGRESS',
		overdue: 'OVERDUE',
		completed: 'COMPLETED',
		cancelled: 'CANCELLED',
		canceled: 'CANCELLED'
	}
	return statuses[raw.toLowerCase()] || raw.toUpperCase()
}

function normalizeFollowUp(data, mode = 'create') {
	const patientIds = data.patientIds || (data.patientId ? [data.patientId] : undefined)
	let scheduledAt = data.scheduledAt || data.scheduledTime || data.scheduledDate || data.followDate || data.date
	// 旧页面把本地选择时间直接拼成 Z 后缀；这里按设备本地时区转换为真实 UTC。
	if (data.scheduledTime && /T\d{2}:\d{2}:\d{2}\.000Z$/.test(data.scheduledTime)) {
		const localDate = new Date(data.scheduledTime.replace(/\.000Z$/, ''))
		if (!Number.isNaN(localDate.getTime())) scheduledAt = localDate.toISOString()
	}
	const base = {
		patientIds,
		followType: apiFollowType(data.followType || data.type),
		scheduledAt,
		priority: data.priority ? String(data.priority).toUpperCase() : undefined,
		note: data.note ?? data.notes ?? data.description,
		recurrence: data.recurrence || data.recurrenceRule
	}
	if (mode === 'update') {
		delete base.patientIds
		delete base.recurrence
		base.status = data.status ? apiFollowStatus(data.status) : undefined
		base.result = data.result
		base.summary = data.summary
	}
	return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined && value !== ''))
}
function adaptFollowUp(item) {
	if (!item || typeof item !== 'object') return item
	const rawType = String(item.followType || item.type || '').toUpperCase()
	const rawStatus = String(item.status || '').toUpperCase()
	return {
		...item,
		followId: item.followId || item.id,
		patientId: item.patientId || item.patient?.id,
		patientName: item.patientName || item.patient?.displayName,
		patientInfo: item.patientInfo || (item.patient ? { ...item.patient, name: item.patient.displayName } : undefined),
		doctorId: item.doctorId || item.practitionerId || item.practitioner?.id,
		doctorInfo: item.doctorInfo || (item.practitioner ? { ...item.practitioner, name: item.practitioner.displayName } : undefined),
		followType: FOLLOW_TYPE_TO_LEGACY[rawType] || rawType.toLowerCase(),
		priority: String(item.priority || '').toLowerCase(),
		status: FOLLOW_STATUS_TO_LEGACY[rawStatus] || rawStatus.toLowerCase(),
		scheduledDate: item.scheduledDate || item.scheduledAt,
		scheduledTime: item.scheduledTime || item.scheduledAt
	}
}
function followImageAssetId(image) {
	if (!image || typeof image !== 'object') return ''
	return image.assetId || image.mediaId || image.id || ''
}
async function hydrateFollowUpImages(item, options = {}) {
	const adapted = adaptFollowUp(item)
	const images = adapted?.result?.images
	if (!Array.isArray(images) || images.length === 0) return adapted
	const resolvedImages = await Promise.all(images.map(async (image) => {
		if (typeof image === 'string') return image
		const assetId = followImageAssetId(image)
		if (!assetId) throw new Error('随访图片资产数据无效')
		try {
			// resolveMediaFile requests /media/${encodeURIComponent(assetId)}/url and downloads with Authorization.
			return await resolveMediaFile(assetId)
		} catch (cause) {
			const error = new Error('随访图片授权地址获取失败')
			error.cause = cause
			throw error
		}
	}))
	return {
		...adapted,
		result: {
			...adapted.result,
			imageAssets: images,
			images: resolvedImages
		}
	}
}
function followListResult(result) {
	const followUps = collection(result, ['followUps', 'follows']).map(adaptFollowUp)
	return withData(result, { ...(Array.isArray(result.data) ? {} : result.data), followUps, total: paginationTotal(result, followUps) })
}
export function getFollowUps(params = {}, options = {}) {
	const query = Object.fromEntries(Object.entries({
		patientId: params.patientId,
		status: params.status && params.status !== 'all' ? apiFollowStatus(params.status) : undefined,
		followType: params.followType && params.followType !== 'all' ? apiFollowType(params.followType) : undefined,
		startAt: params.startAt || params.startDate,
		endAt: params.endAt || params.endDate,
		page: Number(params.page || 1),
		pageSize: Number(params.pageSize || params.limit || 30)
	}).filter(([, value]) => value !== undefined && value !== ''))
	return get('/follow-ups', query, options).then(followListResult)
}
export const createFollowUp = (data, options = {}) => post('/follow-ups', normalizeFollowUp(data, 'create'), options)
export const updateFollowUp = (followId, data, options = {}) => patch(`/follow-ups/${encodeURIComponent(followId)}`, normalizeFollowUp(data, 'update'), options)
export const completeFollowUp = (data, options = {}) => post(`/follow-ups/${encodeURIComponent(data.followId)}/complete`, { result: data.result, summary: data.summary }, options)
export const getFollowUpDetail = (followId, options = {}) => get(`/follow-ups/${encodeURIComponent(followId)}`, {}, options)
	.then(async (result) => withData(result, await hydrateFollowUpImages(result.data, options)))
export const cancelFollowUp = (followId, options = {}) => post(`/follow-ups/${encodeURIComponent(followId)}/cancel`, {}, options)
export const deleteFollowUp = (followId, options = {}) => del(`/follow-ups/${encodeURIComponent(followId)}`, {}, options)
export const startFollowUp = (followId, options = {}) => post(`/follow-ups/${encodeURIComponent(followId)}/start`, {}, options)
export const getFollowUpStatistics = (params = {}, options = {}) => get('/follow-ups/stats', Object.fromEntries(Object.entries({
	patientId: params.patientId,
	followType: params.followType && params.followType !== 'all' ? apiFollowType(params.followType) : undefined,
	startAt: params.startAt || params.startDate,
	endAt: params.endAt || params.endDate
}).filter(([, value]) => value !== undefined && value !== '')), options).then((result) => {
	const stats = result.data || {}
	const pending = stats.pending ?? stats.SCHEDULED ?? 0
	const ongoing = stats.ongoing ?? stats.IN_PROGRESS ?? 0
	const overdue = stats.overdue ?? stats.OVERDUE ?? 0
	const completed = stats.completed ?? stats.COMPLETED ?? 0
	const cancelled = stats.cancelled ?? stats.CANCELLED ?? 0
	return withData(result, {
		...stats,
		pending,
		ongoing,
		overdue,
		completed,
		cancelled,
		total: stats.total ?? pending + ongoing + overdue + completed + cancelled
	})
})

// Tasks retained for backward compatibility.
export function getTasks(params = {}, options = {}) {
	const query = Object.fromEntries(Object.entries({
		patientId: params.patientId,
		status: params.status ? apiTaskStatus(params.status) : undefined,
		taskType: (params.taskType || params.type) ? apiFollowType(params.taskType || params.type) : undefined,
		page: Number(params.page || 1),
		pageSize: Number(params.pageSize || params.limit || 30)
	}).filter(([, value]) => value !== undefined && value !== ''))
	return get('/tasks', query, options).then((result) => {
		const tasks = collection(result, ['tasks']).map((task) => ({
			...task,
			taskId: task.taskId || task.id,
			taskType: String(task.taskType || task.type || 'GENERAL').toLowerCase(),
			status: String(task.status || '').toLowerCase(),
			dueDate: task.dueDate || task.dueAt
		}))
		return withData(result, { ...(Array.isArray(result.data) ? {} : result.data), tasks, total: paginationTotal(result, tasks) })
	})
}
function normalizeTask(data, includePatient = false) {
	return Object.fromEntries(Object.entries({
		patientId: includePatient ? data.patientId : undefined,
		taskType: data.taskType || data.type ? apiFollowType(data.taskType || data.type) : undefined,
		priority: data.priority ? String(data.priority).toUpperCase() : undefined,
		title: data.title,
		description: data.description || data.note,
		content: data.content,
		recurrenceRule: includePatient ? (data.recurrenceRule || data.recurrence) : undefined,
		dueAt: data.dueAt || data.dueDate
	}).filter(([, value]) => value !== undefined && value !== ''))
}
export const createTask = (data, options = {}) => post('/tasks', normalizeTask(data, true), options)
export const updateTask = (taskId, data, options = {}) => patch(`/tasks/${encodeURIComponent(taskId)}`, normalizeTask(data, false), options)
export const completeTask = (taskId, data = {}, options = {}) => post(`/tasks/${encodeURIComponent(taskId)}/complete`, { result: data.result || data }, options)
export const deleteTask = (taskId, options = {}) => del(`/tasks/${encodeURIComponent(taskId)}`, {}, options)

// Messages
function adaptMessage(item) {
	if (!item || typeof item !== 'object') return item
	const adaptPeer = (peer) => peer ? {
		...peer,
		userId: peer.userId || peer.id,
		name: peer.name || peer.displayName,
		avatar: peer.avatar || peer.avatarUrl,
		role: legacyRole(peer.role)
	} : undefined
	return {
		...item,
		messageId: item.messageId || item.id,
		messageType: String(item.messageType || item.type || 'TEXT').toLowerCase(),
		isRead: item.isRead ?? Boolean(item.readAt),
		relatedId: item.relatedId || item.contextId,
		relatedType: item.relatedType || item.contextType,
		senderInfo: item.senderInfo || adaptPeer(item.sender),
		receiverInfo: item.receiverInfo || adaptPeer(item.receiver)
	}
}
export function getMessages(params = {}, options = {}) {
	const query = Object.fromEntries(Object.entries({
		peerId: params.peerId || params.otherUserId || params.receiverId,
		relatedId: params.relatedId,
		relatedType: params.relatedType,
		page: Number(params.page || 1),
		pageSize: Number(params.pageSize || params.limit || 30)
	}).filter(([, value]) => value !== undefined && value !== ''))
	const endpoint = params.messageId ? `/messages/item/${encodeURIComponent(params.messageId)}` : '/messages'
	return get(endpoint, params.messageId ? {} : query, options).then((result) => {
		if (params.messageId) return withData(result, { messages: result.data ? [adaptMessage(result.data)] : [], total: result.data ? 1 : 0 })
		const messages = collection(result, ['messages']).map(adaptMessage)
		return withData(result, { ...(Array.isArray(result.data) ? {} : result.data), messages, total: paginationTotal(result, messages) })
	})
}
export const sendMessage = (data, options = {}) => post('/messages', {
	receiverId: data.receiverId,
	content: data.content,
	messageType: String(data.messageType || data.type || 'TEXT').replace(/-/g, '_').toUpperCase(),
	relatedId: data.relatedId,
	relatedType: data.relatedType,
	attachments: data.attachments
}, options).then((result) => withData(result, adaptMessage(result.data)))
export const markMessageAsRead = (data, options = {}) => patch('/messages/read', { peerId: data.peerId || data.otherUserId, messageIds: data.messageIds }, options)
export const deleteMessage = (messageId, options = {}) => del(`/messages/${encodeURIComponent(messageId)}`, {}, options)
export const getUnreadMessageCount = (_userId, options = {}) => get('/messages/unread-count', {}, options).then((result) => withData(result, {
	...result.data,
	unreadCount: result.data?.unreadCount ?? result.data?.count ?? 0
}))

// Reports and dashboards
function reportRange(params = {}) {
	if (['7d', '30d', '90d'].includes(params.range)) return params.range
	const days = Number(params.days || 0)
	return days > 0 && days <= 7 ? '7d' : days > 0 && days <= 30 ? '30d' : '90d'
}
export const getHealthReports = (params = {}, options = {}) => get('/reports', { range: reportRange(params) }, options)
export function getCareSummaries(options = {}) {
	return get('/care-summaries', {}, options).then((result) => withData(result, collection(result, ['careSummaries', 'summaries'])))
}
export const generateHealthReport = (data = {}, options = {}) => getHealthReports(data, options)
export const getHealthReportDetail = (_reportId, options = {}) => unsupportedOperation('持久化报告详情', options)
export const downloadHealthReport = (_reportId, options = {}) => unsupportedOperation('报告文件下载', options)
export const getDashboardData = (params = {}, options = {}) => get('/dashboard', params, options)
export function getPatientTrendData(params = {}, options = {}) {
	const user = getStorage('userInfo') || {}
	if (legacyRole(user.role) === 'doctor') {
		if (!params.patientId) return unsupportedOperation('未指定患者的体重趋势', options)
		return get(`/clinical/patients/${encodeURIComponent(params.patientId)}/weight-trend`, {}, options).then((result) => withData(result, collection(result).map(adaptHealthRecord)))
	}
	return getHealthRecordStats(params, options)
}
export const getWeightDistributionData = (_params = {}, options = {}) => unsupportedOperation('患者体重分布聚合', options)
export const getRecentActivities = (_params = {}, options = {}) => get('/messages/activities', {}, options)

// Notifications. User ownership is always taken from the JWT.
export function getNotifications(params = {}, options = {}) {
	const query = Object.fromEntries(Object.entries({
		type: params.type ? String(params.type).toUpperCase() : undefined,
		unread: params.unread === undefined ? undefined : String(params.unread),
		page: Number(params.page || 1),
		pageSize: Number(params.pageSize || params.limit || 30)
	}).filter(([, value]) => value !== undefined && value !== ''))
	return get('/notifications', query, options).then((result) => {
		const notifications = collection(result, ['notifications']).map((item) => ({
			...item,
			notificationId: item.notificationId || item.id,
			type: String(item.type || 'GENERAL').toLowerCase(),
			read: item.read ?? Boolean(item.readAt),
			isRead: item.isRead ?? Boolean(item.readAt)
		}))
		return withData(result, { ...(Array.isArray(result.data) ? {} : result.data), notifications, total: paginationTotal(result, notifications) })
	})
}
export const createNotification = (data, options = {}) => post('/notifications', Object.fromEntries(Object.entries({
	userId: data.userId,
	type: data.type ? String(data.type).toUpperCase() : undefined,
	priority: data.priority ? String(data.priority).toUpperCase() : undefined,
	title: data.title,
	content: data.content,
	relatedType: data.relatedType,
	relatedId: data.relatedId,
	actionPath: data.actionPath,
	metadata: data.metadata
}).filter(([, value]) => value !== undefined && value !== '')), options)
export const markNotificationAsRead = (notificationId, _userId, options = {}) => patch(`/notifications/${encodeURIComponent(notificationId)}/read`, {}, options)
export const markAllNotificationsAsRead = (_userId, options = {}) => patch('/notifications/read-all', {}, options)
export function getUnreadNotificationCount(params = {}, options = {}) {
	return get('/notifications/unread-count', {}, options).then((result) => withData(result, {
		...result.data,
		unreadCount: result.data?.unreadCount ?? result.data?.count ?? 0
	}))
}
export const deleteNotification = (notificationId, _userId, options = {}) => del(`/notifications/${encodeURIComponent(notificationId)}`, {}, options)

function uploadWithPath(filePath, type, options = {}) {
	return upload(filePath, { ...options, formData: { scope: options.formData?.scope || type } })
}
export const uploadAvatar = (filePath, options = {}) => uploadWithPath(filePath, UPLOAD_PATHS.AVATAR, options)
export const uploadWeightImage = (filePath, options = {}) => uploadWithPath(filePath, UPLOAD_PATHS.WEIGHT_IMAGE, options)
export const uploadTaskImage = (filePath, options = {}) => uploadWithPath(filePath, UPLOAD_PATHS.TASK_IMAGE, options)
export const uploadFollowImage = (filePath, options = {}) => uploadWithPath(filePath, UPLOAD_PATHS.FOLLOW_IMAGE, options)

// Settings, search, export and aggregate compatibility exports.
export const getSystemSettings = (options = {}) => unsupportedOperation('系统设置', options)
export const updateSystemSettings = (_data, options = {}) => unsupportedOperation('系统设置', options)
export const getUserSettings = (options = {}) => unsupportedOperation('用户偏好设置', options)
export const updateUserSettings = (_data, options = {}) => unsupportedOperation('用户偏好设置', options)
export const setTargetWeight = (targetWeight, options = {}) => patch('/auth/me/target-weight', { targetWeightKg: Number(targetWeight) }, options)
export const getOverallStats = (_params = {}, options = {}) => getPatientStats({}, options)
export const getPatientStatistics = getPatientStats
export const getWeightStatistics = getHealthRecordStats
export const searchPatients = (keyword, params = {}, options = {}) => getDoctorPatientRelations({ ...params, search: keyword }, options)
export const searchRecords = (keyword, params = {}, options = {}) => getHealthRecords(params, options).then((result) => {
	const query = String(keyword || '').trim().toLowerCase()
	if (!query) return result
	return withData(result, result.data.filter((record) => [record.foodName, record.notes, record.note, record.type]
		.some((value) => String(value || '').toLowerCase().includes(query))))
})
export const searchFollowUpPlans = (keyword, params = {}, options = {}) => getFollowUps(params, options).then((result) => {
	const query = String(keyword || '').trim().toLowerCase()
	if (!query) return result
	const followUps = (result.data?.followUps || []).filter((follow) => [follow.patientName, follow.note, follow.notes, follow.summary, follow.followType]
		.some((value) => String(value || '').toLowerCase().includes(query)))
	return withData(result, { ...result.data, followUps, total: followUps.length })
})
export const exportPatientData = (_params = {}, options = {}) => unsupportedOperation('患者数据导出', options)
export const exportWeightRecords = (_params = {}, options = {}) => unsupportedOperation('健康记录导出', options)
export const exportFollowUpData = (_params = {}, options = {}) => unsupportedOperation('随访数据导出', options)
export const exportStatisticsReport = (_params = {}, options = {}) => unsupportedOperation('统计报表导出', options)

export const calculateCaloriesWithAI = (foodName, foodWeight, options = {}) => post('/ai/calories', {
	foodName,
	weightGrams: Number(foodWeight)
}, {
	...options,
	loadingText: options.loadingText || '正在计算卡路里，请稍候...',
	timeout: options.timeout || 20000
}).then((result) => withData(result, {
	...result.data,
	calories: result.data?.calories ?? result.data?.caloriesKcal
}))

// Legacy aliases used by the retained patient and practitioner pages.
export const getWeightRecords = getHealthRecords
export const createWeightRecord = createHealthRecord
export const updateWeightRecord = updateHealthRecord
export const deleteWeightRecord = deleteHealthRecord
export const getWeightTrend = getHealthRecordStats
export const getFollowUpPlans = getFollowUps
export const createFollowUpPlan = createFollowUp
export const updateFollowUpPlan = updateFollowUp
export const deleteFollowUpPlan = deleteFollowUp
export const getFollowUpTasks = getTasks
export const completeFollowUpTask = completeTask
export const getFollowUpStats = getFollowUpStatistics
export const getPatients = getPatientList

export { getImageUrl }

export default {
	request, get, post, put, patch, del, upload,
	login, register, getUserInfo, updateUserInfo, changePassword, logout, sendSmsCode, verifySmsCode,
	resetPassword, wechatLogin, wechatRegister, getImageUrl,
	getHealthRecords, createHealthRecord, updateHealthRecord, deleteHealthRecord, getHealthRecordStats,
	getDoctorPatientRelations, bindPatient, unbindPatient, generateInviteCode, getInviteInfo, bindByInviteCode,
	getPatientDoctors, getPatientList, getDoctorInfo, getPatientDetail, createPatient, updatePatient,
	deletePatient, getPatientStats, getPatients, getFollowUps, getFollowUpDetail, createFollowUp, updateFollowUp,
	completeFollowUp, cancelFollowUp, deleteFollowUp, startFollowUp, getFollowUpStatistics,
	getTasks, createTask, updateTask, completeTask, deleteTask,
	getMessages, sendMessage, markMessageAsRead, deleteMessage, getUnreadMessageCount,
	getCareSummaries,
	getNotifications, createNotification, markNotificationAsRead, markAllNotificationsAsRead,
	getUnreadNotificationCount, deleteNotification, uploadAvatar, uploadWeightImage, uploadTaskImage,
	uploadFollowImage, setTargetWeight, calculateCaloriesWithAI
}
