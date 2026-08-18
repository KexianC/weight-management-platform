// 通用工具函数

/**
 * 日期格式化
 * @param {Date|string|number} date 日期
 * @param {string} format 格式 'YYYY-MM-DD' | 'YYYY-MM-DD HH:mm' | 'MM-DD' | 'HH:mm'
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'YYYY-MM-DD') {
	if (!date) return ''
	
	const d = new Date(date)
	if (isNaN(d.getTime())) return ''
	
	const year = d.getFullYear()
	const month = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	const hours = String(d.getHours()).padStart(2, '0')
	const minutes = String(d.getMinutes()).padStart(2, '0')
	
	switch (format) {
		case 'YYYY-MM-DD':
			return `${year}-${month}-${day}`
		case 'YYYY-MM-DD HH:mm':
			return `${year}-${month}-${day} ${hours}:${minutes}`
		case 'MM-DD':
			return `${month}-${day}`
		case 'HH:mm':
			return `${hours}:${minutes}`
		default:
			return `${year}-${month}-${day}`
	}
}

/**
 * 获取相对时间描述
 * @param {Date|string|number} date 日期
 * @returns {string} 相对时间描述
 */
export function getRelativeTime(date) {
	if (!date) return ''
	
	const d = new Date(date)
	if (isNaN(d.getTime())) return ''
	
	const now = new Date()
	const diff = now.getTime() - d.getTime()
	const seconds = Math.floor(diff / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)
	
	if (seconds < 60) {
		return '刚刚'
	} else if (minutes < 60) {
		return `${minutes}分钟前`
	} else if (hours < 24) {
		return `${hours}小时前`
	} else if (days < 7) {
		return `${days}天前`
	} else {
		return formatDate(date, 'MM-DD')
	}
}

/**
 * 验证手机号
 * @param {string} phone 手机号
 * @returns {boolean} 是否有效
 */
export function validatePhone(phone) {
	const phoneRegex = /^1[3-9]\d{9}$/
	return phoneRegex.test(phone)
}

/**
 * 验证身份证号
 * @param {string} idCard 身份证号
 * @returns {boolean} 是否有效
 */
export function validateIdCard(idCard) {
	const idCardRegex = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/
	return idCardRegex.test(idCard)
}

/**
 * 验证密码强度
 * @param {string} password 密码
 * @returns {boolean} 是否有效
 */
export function validatePassword(password) {
	if (!password || typeof password !== 'string') return false
	// 密码长度至少8位，包含字母和数字
	const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/
	return passwordRegex.test(password)
}

/**
 * 验证体重值
 * @param {number|string} weight 体重
 * @returns {boolean} 是否有效
 */
export function validateWeight(weight) {
	const w = parseFloat(weight)
	return !isNaN(w) && w > 0 && w < 1000
}

/**
 * 验证身高值
 * @param {number|string} height 身高
 * @returns {boolean} 是否有效
 */
export function validateHeight(height) {
	const h = parseFloat(height)
	return !isNaN(h) && h > 0 && h < 300
}

/**
 * 计算BMI
 * @param {number} weight 体重(kg)
 * @param {number} height 身高(cm)
 * @returns {number} BMI值
 */
export function calculateBMI(weight, height) {
	if (!weight || !height) return 0
	const heightInM = height / 100
	return Math.round((weight / (heightInM * heightInM)) * 10) / 10
}

/**
 * 获取BMI状态
 * @param {number} bmi BMI值
 * @returns {object} BMI状态信息
 */
export function getBMIStatus(bmi) {
	if (bmi < 18.5) {
		return { status: 'underweight', text: '偏瘦', color: '#17A2B8' }
	} else if (bmi < 24) {
		return { status: 'normal', text: '正常', color: '#28A745' }
	} else if (bmi < 28) {
		return { status: 'overweight', text: '超重', color: '#FFC107' }
	} else {
		return { status: 'obese', text: '肥胖', color: '#DC3545' }
	}
}

/**
 * 计算理想体重范围
 * @param {number} height 身高(cm)
 * @returns {object} 理想体重范围
 */
export function getIdealWeightRange(height) {
	if (!height) return { min: 0, max: 0 }
	const heightInM = height / 100
	const min = Math.round(18.5 * heightInM * heightInM * 10) / 10
	const max = Math.round(24 * heightInM * heightInM * 10) / 10
	return { min, max }
}

/**
 * 防抖函数
 * @param {Function} func 要防抖的函数
 * @param {number} delay 延迟时间(ms)
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay = 300) {
	let timeoutId
	return function (...args) {
		clearTimeout(timeoutId)
		timeoutId = setTimeout(() => func.apply(this, args), delay)
	}
}

/**
 * 节流函数
 * @param {Function} func 要节流的函数
 * @param {number} delay 延迟时间(ms)
 * @returns {Function} 节流后的函数
 */
export function throttle(func, delay = 300) {
	let lastTime = 0
	return function (...args) {
		const now = Date.now()
		if (now - lastTime >= delay) {
			lastTime = now
			func.apply(this, args)
		}
	}
}

/**
 * 深拷贝
 * @param {any} obj 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
export function deepClone(obj) {
	if (obj === null || typeof obj !== 'object') return obj
	if (obj instanceof Date) return new Date(obj.getTime())
	if (obj instanceof Array) return obj.map(item => deepClone(item))
	if (typeof obj === 'object') {
		const clonedObj = {}
		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				clonedObj[key] = deepClone(obj[key])
			}
		}
		return clonedObj
	}
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
export function generateId() {
	return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的文件大小
 */
export function formatFileSize(bytes) {
	if (bytes === 0) return '0 B'
	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 获取文件扩展名
 * @param {string} filename 文件名
 * @returns {string} 扩展名
 */
export function getFileExtension(filename) {
	return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2)
}

/**
 * 数组去重
 * @param {Array} arr 数组
 * @param {string} key 去重的键名(对象数组时使用)
 * @returns {Array} 去重后的数组
 */
export function uniqueArray(arr, key) {
	if (!Array.isArray(arr)) return []
	if (key) {
		const seen = new Set()
		return arr.filter(item => {
			const val = item[key]
			if (seen.has(val)) {
				return false
			}
			seen.add(val)
			return true
		})
	}
	return [...new Set(arr)]
}

/**
 * 数字格式化
 * @param {number} num 数字
 * @param {number} decimals 小数位数
 * @returns {string} 格式化后的数字
 */
export function formatNumber(num, decimals = 1) {
	if (isNaN(num)) return '0'
	return Number(num).toFixed(decimals)
}

/**
 * 获取随机颜色
 * @returns {string} 十六进制颜色值
 */
export function getRandomColor() {
	const colors = [
		'#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
		'#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
	]
	return colors[Math.floor(Math.random() * colors.length)]
}

/**
 * 存储数据
 * @param {string} key 键名
 * @param {any} value 数据值
 */
export function setStorage(key, value) {
	if (typeof value === 'object') {
		value = JSON.stringify(value)
	}
	uni.setStorageSync(key, value)
}

/**
 * 获取存储数据
 * @param {string} key 键名
 * @returns {any} 数据值
 */
export function getStorage(key) {
	const value = uni.getStorageSync(key)
	try {
		return JSON.parse(value)
	} catch (e) {
		return value
	}
}

/**
 * 删除存储数据
 * @param {string} key 键名
 */
export function removeStorage(key) {
	uni.removeStorageSync(key)
}

/**
 * 清空所有存储数据
 */
export function clearStorage() {
	uni.clearStorageSync()
}

/**
 * 显示提示信息
 * @param {string} title 提示标题
 * @param {string} icon 图标类型 'success' | 'error' | 'loading' | 'none'
 * @param {number} duration 显示时长(ms)
 */
export function showToast(title, icon = 'none', duration = 2000) {
	uni.showToast({
		title,
		icon,
		duration
	})
}

/**
 * 显示加载提示
 * @param {string} title 提示文字
 */
export function showLoading(title = '加载中...') {
	uni.showLoading({
		title
	})
}

/**
 * 隐藏加载提示
 */
export function hideLoading() {
	uni.hideLoading()
}

/**
 * 显示确认对话框
 * @param {string} content 对话框内容
 * @param {string} title 对话框标题
 * @returns {Promise<boolean>} 用户是否确认
 */
export function showConfirm(content, title = '提示') {
	return new Promise((resolve) => {
		uni.showModal({
			title,
			content,
			success: (res) => {
				resolve(res.confirm)
			},
			fail: () => {
				resolve(false)
			}
		})
	})
}

/**
 * 页面跳转
 * @param {string} url 页面路径
 * @param {object} params 传递参数
 */
export function navigateTo(url, params = {}) {
	const query = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')
	const fullUrl = query ? `${url}?${query}` : url
	uni.navigateTo({ url: fullUrl })
}

/**
 * 页面重定向
 * @param {string} url 页面路径
 * @param {object} params 传递参数
 */
export function redirectTo(url, params = {}) {
	const query = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')
	const fullUrl = query ? `${url}?${query}` : url
	uni.redirectTo({ url: fullUrl })
}

/**
 * 返回上一页
 * @param {number} delta 返回层数
 */
export function navigateBack(delta = 1) {
	uni.navigateBack({ delta })
}

/**
 * 获取系统信息
 * @returns {Promise<object>} 系统信息
 */
export function getSystemInfo() {
	return new Promise((resolve, reject) => {
		uni.getSystemInfo({
			success: resolve,
			fail: reject
		})
	})
}

/**
 * 获取网络状态
 * @returns {Promise<object>} 网络状态信息
 */
export function getNetworkType() {
	return new Promise((resolve, reject) => {
		uni.getNetworkType({
			success: resolve,
			fail: reject
		})
	})
}

/**
 * 复制到剪贴板
 * @param {string} data 要复制的内容
 * @returns {Promise<boolean>} 是否复制成功
 */
export function setClipboardData(data) {
	return new Promise((resolve) => {
		uni.setClipboardData({
			data,
			success: () => {
				showToast('复制成功', 'success')
				resolve(true)
			},
			fail: () => {
				showToast('复制失败', 'error')
				resolve(false)
			}
		})
	})
}

/**
 * 获取当前页面路径
 * @returns {string} 当前页面路径
 */
export function getCurrentPagePath() {
	const pages = getCurrentPages()
	if (pages.length > 0) {
		return pages[pages.length - 1].route
	}
	return ''
}

/**
 * 获取当前页面参数
 * @returns {object} 当前页面参数
 */
export function getCurrentPageOptions() {
	const pages = getCurrentPages()
	if (pages.length > 0) {
		return pages[pages.length - 1].options || {}
	}
	return {}
}

/**
 * 检查是否为空值
 * @param {any} value 要检查的值
 * @returns {boolean} 是否为空
 */
export function isEmpty(value) {
	if (value === null || value === undefined) return true
	if (typeof value === 'string') return value.trim() === ''
	if (Array.isArray(value)) return value.length === 0
	if (typeof value === 'object') return Object.keys(value).length === 0
	return false
}

/**
 * 检查是否为有效的URL
 * @param {string} url URL字符串
 * @returns {boolean} 是否为有效URL
 */
export function isValidUrl(url) {
	try {
		new URL(url)
		return true
	} catch {
		return false
	}
}

/**
 * 获取文件名（不含扩展名）
 * @param {string} filename 完整文件名
 * @returns {string} 文件名（不含扩展名）
 */
export function getFileNameWithoutExt(filename) {
	return filename.replace(/\.[^/.]+$/, '')
}

/**
 * 计算两个日期之间的天数差
 * @param {Date|string} date1 开始日期
 * @param {Date|string} date2 结束日期
 * @returns {number} 天数差
 */
export function getDaysDiff(date1, date2) {
	const d1 = new Date(date1)
	const d2 = new Date(date2)
	const timeDiff = Math.abs(d2.getTime() - d1.getTime())
	return Math.ceil(timeDiff / (1000 * 3600 * 24))
}

/**
 * 格式化价格
 * @param {number} price 价格
 * @param {number} decimals 小数位数
 * @returns {string} 格式化后的价格
 */
export function formatPrice(price, decimals = 2) {
	if (isNaN(price)) return '0.00'
	return Number(price).toFixed(decimals)
}

/**
 * 生成指定长度的随机字符串
 * @param {number} length 字符串长度
 * @returns {string} 随机字符串
 */
export function generateRandomString(length = 8) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let result = ''
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}
