// 全局状态管理
import { getStorage, setStorage, removeStorage } from '../utils/common.js'

function normalizeUserRole(userInfo = {}) {
	const rawRole = String(userInfo.backendRole || userInfo.role || '').toUpperCase()
	if (!rawRole) return userInfo
	const role = rawRole === 'PATIENT'
		? 'patient'
		: ['DOCTOR', 'NUTRITIONIST', 'PRACTITIONER'].includes(rawRole)
			? 'doctor'
			: String(userInfo.role || '').toLowerCase()
	return { ...userInfo, role, backendRole: rawRole }
}

// 创建状态管理实例
class Store {
	constructor() {
		this.state = {
			// 用户信息
			user: {
				id: null,
				username: '',
				name: '',
				avatar: '',
				phone: '',
				email: '',
				role: 'patient', // patient | doctor
				isLogin: false
			},
			// 患者信息（当用户为患者时）
			patient: {
				id: null,
				age: null,
				gender: '',
				height: null,
				currentWeight: null,
				targetWeight: null,
				bmi: null,
				bmiStatus: '',
				lastRecordDate: null
			},
			// 医生信息（当用户为医生时）
			doctor: {
				id: null,
				title: '',
				department: '',
				hospital: '',
				specialty: [],
				patientCount: 0,
				licenseNumber: ''
			},
			// 应用设置
			app: {
				theme: 'light', // light | dark
				language: 'zh-CN',
				notificationEnabled: true,
				soundEnabled: true,
				vibrationEnabled: true,
				autoSync: true,
				syncInterval: 30, // 分钟
				dataRetention: 365 // 天
			},
			// 通知信息
			notifications: {
				unreadCount: 0,
				list: [],
				lastUpdateTime: null
			},
			// 缓存数据
			cache: {
				weightRecords: [],
				followUpTasks: [],
				patientList: [],
				dashboardData: null,
				lastCacheTime: null
			},
			// 网络状态
			network: {
				isOnline: true,
				networkType: 'wifi',
				lastSyncTime: null
			},
			// 加载状态
			loading: {
				global: false,
				page: {},
				api: {}
			}
		}
		
		// 监听器
		this.listeners = {}
		
		// 初始化
		this.init()
	}
	
	// 初始化状态
	init() {
		if (this.initialized) return
		this.initialized = true
		// 从本地存储恢复状态
		this.restoreFromStorage()
		
		// 监听网络状态变化
		uni.onNetworkStatusChange((res) => {
			this.setState('network', {
				isOnline: res.isConnected,
				networkType: res.networkType
			})
		})
	}
	
	// 从本地存储恢复状态
	restoreFromStorage() {
		try {
			// 恢复用户信息
			const userInfo = getStorage('userInfo')
			if (userInfo && (getStorage('token') || getStorage('refreshToken'))) {
				this.setState('user', { ...normalizeUserRole(userInfo), isLogin: true })
			}
			
			// 恢复患者信息
			const patientInfo = getStorage('patientInfo')
			if (patientInfo) {
				this.setState('patient', patientInfo)
			}
			
			// 恢复医生信息
			const doctorInfo = getStorage('doctorInfo')
			if (doctorInfo) {
				this.setState('doctor', doctorInfo)
			}
			
			// 恢复应用设置
			const appSettings = getStorage('appSettings')
			if (appSettings) {
				this.setState('app', appSettings)
			}
			
			// 恢复通知信息
			const notifications = getStorage('notifications')
			if (notifications) {
				this.setState('notifications', notifications)
			}
		} catch (error) {
			console.error('恢复状态失败:', error)
		}
	}
	
	// 保存状态到本地存储
	saveToStorage(key, data) {
		try {
			switch (key) {
				case 'user':
					setStorage('userInfo', data)
					break
				case 'patient':
					setStorage('patientInfo', data)
					break
				case 'doctor':
					setStorage('doctorInfo', data)
					break
				case 'app':
					setStorage('appSettings', data)
					break
				case 'notifications':
					setStorage('notifications', data)
					break
			}
		} catch (error) {
			console.error('保存状态失败:', error)
		}
	}
	
	// 获取状态
	getState(key) {
		if (key) {
			return this.state[key]
		}
		return this.state
	}
	
	// 设置状态
	setState(key, value) {
		if (typeof key === 'object') {
			// 批量更新
			Object.keys(key).forEach(k => {
				this.state[k] = { ...this.state[k], ...key[k] }
				this.saveToStorage(k, this.state[k])
				this.notify(k, this.state[k])
			})
		} else {
			// 单个更新
			this.state[key] = { ...this.state[key], ...value }
			this.saveToStorage(key, this.state[key])
			this.notify(key, this.state[key])
		}
	}
	
	// 重置状态
	resetState(key) {
		if (key) {
			// 重置指定状态
			switch (key) {
				case 'user':
					this.state.user = {
						id: null,
						username: '',
						name: '',
						avatar: '',
						phone: '',
						email: '',
						role: 'patient',
						isLogin: false
					}
					removeStorage('userInfo')
					removeStorage('token')
					break
				case 'patient':
					this.state.patient = {
						id: null,
						age: null,
						gender: '',
						height: null,
						currentWeight: null,
						targetWeight: null,
						bmi: null,
						bmiStatus: '',
						lastRecordDate: null
					}
					removeStorage('patientInfo')
					break
				case 'doctor':
					this.state.doctor = {
						id: null,
						title: '',
						department: '',
						hospital: '',
						specialty: [],
						patientCount: 0,
						licenseNumber: ''
					}
					removeStorage('doctorInfo')
					break
				case 'cache':
					this.state.cache = {
						weightRecords: [],
						followUpTasks: [],
						patientList: [],
						dashboardData: null,
						lastCacheTime: null
					}
					break
			}
			this.notify(key, this.state[key])
		}
	}
	
	// 添加监听器
	subscribe(key, callback) {
		if (!this.listeners[key]) {
			this.listeners[key] = []
		}
		this.listeners[key].push(callback)
		
		// 返回取消订阅函数
		return () => {
			const index = this.listeners[key].indexOf(callback)
			if (index > -1) {
				this.listeners[key].splice(index, 1)
			}
		}
	}
	
	// 通知监听器
	notify(key, value) {
		if (this.listeners[key]) {
			this.listeners[key].forEach(callback => {
				try {
					callback(value)
				} catch (error) {
					console.error('监听器执行失败:', error)
				}
			})
		}
	}
	
	// ==================== 用户相关方法 ====================
	
	// 登录
	login(userInfo, token) {
		const normalizedUser = normalizeUserRole(userInfo)
		this.setState('user', { ...normalizedUser, isLogin: true })
		setStorage('token', token)
		
		// 医生与营养师共用从业者工作台数据。
		if (normalizedUser.role === 'doctor') {
			const doctorInfo = {
				id: normalizedUser.userId,
				department: normalizedUser.department || '',
				hospital: normalizedUser.hospital || '',
				title: normalizedUser.title || '',
				specialty: normalizedUser.specialization ? [normalizedUser.specialization] : [],
				licenseNumber: normalizedUser.licenseNumber || '',
				patientCount: 0
			}
			this.setState('doctor', doctorInfo)
		}
		
		// 如果是患者，自动提取患者信息
		if (normalizedUser.role === 'patient') {
			const patientInfo = {
				id: normalizedUser.userId,
				age: normalizedUser.age || null,
				gender: normalizedUser.gender || '',
				height: normalizedUser.height || null,
				currentWeight: normalizedUser.weight || null,
				targetWeight: normalizedUser.targetWeight || null,
				bmi: null,
				bmiStatus: '',
				lastRecordDate: null
			}
			this.setState('patient', patientInfo)
		}
	}
	

	
	// 更新用户信息
	updateUserInfo(userInfo) {
		this.setState('user', normalizeUserRole(userInfo))
	}
	
	// 切换用户角色
	switchRole(role) {
		this.setState('user', { role })
	}
	
	// 退出登录
	logout() {
		// 清除用户信息
		this.resetState('user')
		this.resetState('patient')
		this.resetState('doctor')
		// 清除缓存
		this.clearCache()
		// 清除本地存储的token
		try {
			uni.removeStorageSync('token')
			uni.removeStorageSync('refreshToken')
			uni.removeStorageSync('userInfo')
			uni.removeStorageSync('patientInfo')
			uni.removeStorageSync('doctorInfo')
		} catch (error) {
			console.error('清除本地存储失败:', error)
		}
	}
	
	// 验证token有效性
	validateToken(token) {
		if (!token) return false
		
		try {
			// 解析JWT token（简单的base64解码）
			const parts = token.split('.')
			if (parts.length !== 3) return false
			
			// 微信小程序兼容的base64解码
			const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
			// 补齐base64字符串的padding
			const paddedBase64 = base64Payload + '='.repeat((4 - base64Payload.length % 4) % 4)
			
			// 使用微信小程序的base64解码
			let decodedStr
			try {
				// 尝试使用uni.base64ToArrayBuffer然后转换为字符串
				const buffer = uni.base64ToArrayBuffer(paddedBase64)
				const uint8Array = new Uint8Array(buffer)
				decodedStr = String.fromCharCode.apply(null, uint8Array)
			} catch (e) {
				// 如果uni.base64ToArrayBuffer不可用，使用自定义base64解码
				decodedStr = this.base64Decode(paddedBase64)
			}
			
			const payload = JSON.parse(decodedStr)
			const now = Math.floor(Date.now() / 1000)
			
			// 检查token是否过期
			if (payload.exp && payload.exp <= now) {
				console.log('Token已过期')
				return false
			}
			
			return true
		} catch (error) {
			console.error('Token验证失败:', error)
			return false
		}
	}
	
	// 自定义base64解码函数（微信小程序兼容）
	base64Decode(str) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
		let result = ''
		let i = 0
		
		while (i < str.length) {
			const encoded1 = chars.indexOf(str.charAt(i++))
			const encoded2 = chars.indexOf(str.charAt(i++))
			const encoded3 = chars.indexOf(str.charAt(i++))
			const encoded4 = chars.indexOf(str.charAt(i++))
			
			const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4
			
			result += String.fromCharCode((bitmap >> 16) & 255)
			if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255)
			if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255)
		}
		
		return result
	}
	
	// 检查是否登录
	isLogin() {
		if (!this.state.user.isLogin) return false
		const token = getStorage('token')
		// Expired access tokens are recoverable by the API refresh flow. Reading
		// cached session state must not discard a refresh token or page drafts.
		if (getStorage('refreshToken')) return true
		return Boolean(token && this.validateToken(token))
	}
	
	// 自动登录检查
	async checkAutoLogin() {
		try {
			const token = getStorage('token')
			const userInfo = getStorage('userInfo')
			
			if ((!token && !getStorage('refreshToken')) || !userInfo) {
				return false
			}
			
			// 验证token有效性
			if (!getStorage('refreshToken') && !this.validateToken(token)) {
				return false
			}
			
			// 恢复登录状态
			const normalizedUser = normalizeUserRole(userInfo)
			this.setState('user', { ...normalizedUser, isLogin: true })
			
			// 根据角色恢复相应信息
			if (normalizedUser.role === 'doctor') {
				const doctorInfo = getStorage('doctorInfo')
				if (doctorInfo) {
					this.setState('doctor', doctorInfo)
				}
			} else if (normalizedUser.role === 'patient') {
				const patientInfo = getStorage('patientInfo')
				if (patientInfo) {
					this.setState('patient', patientInfo)
				}
			}
			
			// The API, not this cached-state check, authenticates each request.
			return true
		} catch (error) {
			console.error('自动登录检查失败:', error)
			// A transient storage/platform error must not destroy the saved session.
			return false
		}
	}
	
	// 检查是否为医生
	isDoctor() {
		return this.state.user.role === 'doctor'
	}
	
	// 检查是否为患者
	isPatient() {
		return this.state.user.role === 'patient'
	}
	
	// 获取用户信息
	getUserInfo() {
		return this.state.user
	}
	
	// ==================== 患者相关方法 ====================
	
	// 更新患者信息
	updatePatientInfo(patientInfo) {
		this.setState('patient', patientInfo)
	}
	
	// 更新体重记录
	updateWeightRecord(weight) {
		const bmi = this.calculateBMI(weight, this.state.patient.height)
		const bmiStatus = this.getBMIStatus(bmi)
		
		this.setState('patient', {
			currentWeight: weight,
			bmi,
			bmiStatus,
			lastRecordDate: new Date().toISOString()
		})
	}
	
	// ==================== 医生相关方法 ====================
	
	// 更新医生信息
	updateDoctorInfo(doctorInfo) {
		this.setState('doctor', doctorInfo)
	}
	
	// 更新患者数量
	updatePatientCount(count) {
		this.setState('doctor', { patientCount: count })
	}
	
	// ==================== 通知相关方法 ====================
	
	// 添加通知
	addNotification(notification) {
		const notifications = this.state.notifications
		notifications.list.unshift({
			id: Date.now(),
			...notification,
			createdAt: new Date().toISOString(),
			isRead: false
		})
		notifications.unreadCount += 1
		notifications.lastUpdateTime = new Date().toISOString()
		
		this.setState('notifications', notifications)
	}
	
	// 标记通知为已读
	markNotificationAsRead(notificationId) {
		const notifications = this.state.notifications
		const notification = notifications.list.find(n => n.id === notificationId)
		
		if (notification && !notification.isRead) {
			notification.isRead = true
			notifications.unreadCount = Math.max(0, notifications.unreadCount - 1)
			this.setState('notifications', notifications)
		}
	}
	
	// 标记所有通知为已读
	markAllNotificationsAsRead() {
		const notifications = this.state.notifications
		notifications.list.forEach(n => n.isRead = true)
		notifications.unreadCount = 0
		this.setState('notifications', notifications)
	}
	
	// 删除通知
	removeNotification(notificationId) {
		const notifications = this.state.notifications
		const index = notifications.list.findIndex(n => n.id === notificationId)
		
		if (index > -1) {
			const notification = notifications.list[index]
			if (!notification.isRead) {
				notifications.unreadCount = Math.max(0, notifications.unreadCount - 1)
			}
			notifications.list.splice(index, 1)
			this.setState('notifications', notifications)
		}
	}
	
	// ==================== 缓存相关方法 ====================
	
	// 更新缓存数据
	updateCache(key, data) {
		const cache = this.state.cache
		cache[key] = data
		cache.lastCacheTime = new Date().toISOString()
		this.setState('cache', cache)
	}
	
	// 获取缓存数据
	getCache(key) {
		return this.state.cache[key]
	}
	
	// 清除缓存
	clearCache(key) {
		if (key) {
			const cache = this.state.cache
			cache[key] = key === 'weightRecords' || key === 'followUpTasks' || key === 'patientList' ? [] : null
			this.setState('cache', cache)
		} else {
			this.resetState('cache')
		}
	}
	
	// ==================== 加载状态相关方法 ====================
	
	// 设置全局加载状态
	setGlobalLoading(loading) {
		this.setState('loading', { global: loading })
	}
	
	// 设置页面加载状态
	setPageLoading(page, loading) {
		const loadingState = this.state.loading
		loadingState.page[page] = loading
		this.setState('loading', loadingState)
	}
	
	// 设置API加载状态
	setApiLoading(api, loading) {
		const loadingState = this.state.loading
		loadingState.api[api] = loading
		this.setState('loading', loadingState)
	}
	
	// ==================== 工具方法 ====================
	
	// 计算BMI
	calculateBMI(weight, height) {
		if (!weight || !height) return 0
		const heightInM = height / 100
		return Math.round((weight / (heightInM * heightInM)) * 10) / 10
	}
	
	// 获取BMI状态
	getBMIStatus(bmi) {
		if (bmi < 18.5) return '偏瘦'
		if (bmi < 24) return '正常'
		if (bmi < 28) return '超重'
		return '肥胖'
	}
	
	// 检查缓存是否过期
	isCacheExpired(maxAge = 5 * 60 * 1000) { // 默认5分钟
		const lastCacheTime = this.state.cache.lastCacheTime
		if (!lastCacheTime) return true
		
		const now = new Date().getTime()
		const cacheTime = new Date(lastCacheTime).getTime()
		return (now - cacheTime) > maxAge
	}
	
	// 获取应用版本信息
	getAppVersion() {
		return {
			version: '1.0.0',
			buildNumber: '1',
			buildDate: '2024-01-01'
		}
	}
}

// 创建全局实例
const store = new Store()

// 导出实例和类
export default store
export { Store }
