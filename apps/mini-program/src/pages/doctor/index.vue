<template>
	<view class="container">
		<view class="doctor-brand" :style="{ paddingTop: navigationTopInset + 'px', paddingRight: navigationRightInset + 'px' }">
			<view class="doctor-brand-logo-tile">
				<image class="doctor-brand-logo" src="/static/logo.png" mode="aspectFit"></image>
			</view>
			<view class="doctor-brand-copy">
				<text class="doctor-brand-name">数字减重助手</text>
				<text class="doctor-brand-subtitle">医生/营养师工作台</text>
			</view>
		</view>
		<!-- 医生信息头部 -->
		<view class="user-header">
			<view class="user-info">
				<view class="avatar">
					<text v-if="userInfo.name" class="avatar-text">{{ userInfo.name.charAt(0) }}</text>
					<Icon v-else name="User/user-line.svg" size="24" color="$primary-color" />
				</view>
				<view class="user-details">
					<text class="user-name">{{userInfo.name || '医生/营养师'}}</text>
					<text class="user-role">{{userInfo.backendRole === 'NUTRITIONIST' ? '营养师' : '医生'}}</text>
					<text class="user-dept">{{doctorInfo.department || '科室未设置'}}</text>
				</view>
			</view>
			<view class="user-actions">
				<view class="action-btn" @click="logout">
					<text class="action-text">退出</text>
				</view>
			</view>
		</view>

		<!-- 绑定码区域 -->
		<view class="bind-code-section">
			<view class="section-title">
				<view class="title-text"><Icon name="Business/links-line.svg" size="16" color="$primary-color" /><text>患者绑定</text></view>
			</view>
			<view class="bind-code-card">
				<view class="bind-code-content">
					<view class="code-display">
						<text class="code-label">绑定码</text>
						<text class="code-value">{{bindCode || '生成中...'}}</text>
						<view class="code-actions">
							<view class="code-copy" @click="copyBindCode">
								<text class="copy-text">复制</text>
							</view>
							<view class="refresh-btn" @click="refreshBindCode">
								<text class="refresh-text">刷新</text>
							</view>
						</view>
					</view>
					<view class="qr-code-display">
						<view class="qr-code" @click="showQRCode">
						<image v-if="qrCodeUrl" :src="qrCodeUrl" class="qr-image" @error="switchQRService"></image>
						<view v-else class="qr-placeholder">
							<text class="qr-text">点击生成二维码</text>
						</view>

					</view>
					<text class="qr-label">二维码绑定</text>
				</view>
				</view>
				<view class="bind-info">
					<text class="info-text">患者可通过绑定码或扫描二维码与您建立健康服务关系</text>
					<text class="expire-text">{{bindCodeExpiryText}}</text>
				</view>
			</view>
		</view>

		<!-- 工作概览 -->
		<view class="work-overview">
			<view class="section-title">
				<view class="title-text"><Icon name="Health/stethoscope-line.svg" size="16" color="$primary-color" /><text>工作概览</text></view>
			</view>
			<view class="overview-grid">
				<view class="overview-card patients">
					<view class="card-icon"><Icon name="User/group-line.svg" size="24" color="$primary-color" /></view>
					<view class="card-info">
						<text class="card-value">{{totalPatients}}</text>
						<text class="card-label">管理患者</text>
						<view class="card-change positive">
							<text class="change-text">+{{newPatients}} 新增</text>
						</view>
					</view>
				</view>
				<view class="overview-card active">
					<view class="card-icon"><Icon name="Business/line-chart-line.svg" size="24" color="$success-color" /></view>
					<view class="card-info">
						<text class="card-value">{{activePatients}}</text>
						<text class="card-label">活跃患者</text>
						<view class="card-change">
							<text class="change-text">{{activeRate}}% 活跃率</text>
						</view>
					</view>
				</view>
				<view class="overview-card tasks">
					<view class="card-icon"><Icon name="Document/file-text-line.svg" size="24" color="$warning-color" /></view>
					<view class="card-info">
						<text class="card-value">{{pendingTasks}}</text>
						<text class="card-label">待处理</text>
						<view class="card-change warning">
							<text class="change-text">需要关注</text>
						</view>
					</view>
				</view>
				<view class="overview-card completion">
					<view class="card-icon"><Icon name="System/checkbox-circle-line.svg" size="24" color="$success-color" /></view>
					<view class="card-info">
						<text class="card-value">{{completionRate}}%</text>
						<text class="card-label">完成率</text>
						<view class="card-change positive">
							<text class="change-text">统计不含已取消随访</text>
						</view>
					</view>
				</view>
			</view>
		</view>

		<!-- 通知中心 -->
		<view class="notification-center">
			<view class="section-title">
				<view class="title-text"><Icon name="System/notification-badge-line.svg" size="16" color="$primary-color" /><text>通知中心</text></view>
				<view class="notification-badge" v-if="unreadCount > 0">
					<text class="badge-text">{{unreadCount}}</text>
				</view>
			</view>
			<view class="notification-list">
				<!-- 空状态显示 -->
				<view class="empty-state" v-if="doctorNotifications.length === 0">
					<view class="empty-icon"><Icon name="Business/inbox-line.svg" size="48" color="$gray-300" /></view>
					<text class="empty-text">暂无未处理通知</text>
				</view>
				<!-- 通知列表 -->
				<view 
					class="notification-wrapper" 
					v-for="(item, index) in doctorNotifications" 
					:key="index"
					v-else
				>
					<view 
						class="notification-item"
						@click="handleNotification(item)"
						@touchstart="onTouchStart($event, index)"
						@touchmove="onTouchMove($event, index)"
						@touchend="onTouchEnd($event, index)"
						:style="{transform: `translateX(${item.translateX || 0}px)`}"
					>
						<view class="notification-content">
							<text class="notification-title">{{item.title}}</text>
							<text class="notification-desc">{{item.desc}}</text>
							<text class="notification-time">{{item.time}}</text>
						</view>
						<view class="notification-status" v-if="!item.read">
							<view class="unread-dot"></view>
						</view>
					</view>
					<view class="delete-action" @click="confirmDeleteNotification(item, index)">
						<text class="delete-text">删除</text>
					</view>
				</view>
			</view>
		</view>



		<!-- 患者动态 -->
		<view class="patient-activities">
			<view class="section-title">
				<view class="title-text"><Icon name="Business/bar-chart-line.svg" size="16" color="$primary-color" /><text>患者动态</text></view>
				<view class="section-action" role="button" aria-label="查看全部患者动态" @click="viewAllActivities">
					<text class="action-text">查看全部</text>
					<Icon name="Arrows/arrow-right-s-line.svg" size="20" color="$gray-600" />
				</view>
			</view>
			<view class="activity-list">
				<view 
					class="activity-item" 
					v-for="(activity, index) in recentActivities" 
					:key="index"
					@click="handleActivity(activity)"
				>
					<view class="activity-avatar">
						<text class="avatar-text">{{activity.patientName.charAt(0)}}</text>
					</view>
					<view class="activity-content">
						<text class="activity-title">{{activity.patientName}}</text>
						<text class="activity-desc">{{activity.action}}</text>
						<text class="activity-time">{{activity.time}}</text>
					</view>
					<view class="activity-status" :class="activity.type">
						<text class="status-text">{{activity.status}}</text>
					</view>
				</view>
			</view>
		</view>


	</view>
		<!-- 医生端底部导航 -->
		<view class="doctor-tabbar">
			<view 
				class="tab-item active"
				@click="navigateToPage('/pages/doctor/index')"
			>
				<view class="tab-icon"><Icon name="Buildings/home-line.svg" size="20" color="$primary-color" /></view>
				<text class="tab-text">医生/营养师首页</text>
			</view>
			<view 
				class="tab-item"
				@click="navigateToPage('/pages/doctor/dashboard')"
			>
				<view class="tab-icon"><Icon name="Business/bar-chart-line.svg" size="20" color="$gray-400" /></view>
				<text class="tab-text">数据看板</text>
			</view>
			<view 
				class="tab-item"
				@click="navigateToPage('/pages/doctor/patients')"
			>
				<view class="tab-icon"><Icon name="User/group-line.svg" size="20" color="$gray-400" /></view>
				<text class="tab-text">患者管理</text>
			</view>
			<view 
				class="tab-item"
				@click="navigateToPage('/pages/doctor/follow')"
			>
				<view class="tab-icon"><Icon name="Document/clipboard-line.svg" size="20" color="$gray-400" /></view>
				<text class="tab-text">随访管理</text>
			</view>
		</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'
	import store from '../../store/index.js'
	import { getDoctorPatientRelations, getFollowUpStatistics, getOverallStats, getUnreadMessageCount, generateInviteCode, getInviteQrUrl, getNotifications, getUnreadNotificationCount, markNotificationAsRead, getFollowUps, getHealthRecords, deleteNotification, getMessages, logout as apiLogout } from '../../utils/api.js'
	import { showToast } from '../../utils/common.js'
	import { getCustomNavigationLayout } from '../../utils/navigation.js'
	
	export default {
		components: {
			Icon
		},
		data() {
			return {
				userInfo: {},
				navigationTopInset: 10,
				navigationRightInset: 0,
				doctorInfo: {},
				totalPatients: 0,
				newPatients: 0,
				activePatients: 0,
				activeRate: 0,
				pendingTasks: 0,
				completionRate: 0,
				unreadCount: 0,
				loading: false,
				// 绑定码相关
				bindCode: '',
				qrCodeUrl: '',
				bindCodeId: '',
				bindCodeExpiryText: '绑定码有效期加载中…',
				// 滑动删除相关
				touchStartX: 0,
				touchStartY: 0,
				currentSwipeIndex: -1,
				doctorNotifications: [],

				recentActivities: [],

			}
		},

		onLoad() {
			this.setupNavigationLayout()
			this.getUserInfo()
			this.checkLoginStatus()
			// 优化：串行加载数据，避免并发请求过多
			this.initPageData()
		},
		

		methods: {
			setupNavigationLayout() {
				const layout = getCustomNavigationLayout()
				this.navigationTopInset = layout.topInset
				this.navigationRightInset = layout.rightInset
			},

			// 初始化页面数据
			async initPageData() {
				try {
					uni.showLoading({ title: '加载中...' })
					
					// 串行加载核心数据，减少并发请求
					await this.loadDashboardData()
					await this.loadNotifications()
					
					// 非核心数据可以并行加载
					Promise.all([
						this.loadPatientActivities(),
						this.generateBindCode()
					]).catch(error => {
						console.error('非核心数据加载失败:', error)
					})
					
				} catch (error) {
					console.error('页面初始化失败:', error)
					uni.showToast({
						title: '加载失败，请重试',
						icon: 'none'
					})
				} finally {
					uni.hideLoading()
				}
			},
			
			// 获取用户信息
			getUserInfo() {
				this.userInfo = store.getUserInfo() || {}
				
				// 从store获取医生信息
				let doctorInfo = store.getState('doctor') || {}
				
				// 如果store中的医生信息不完整，从用户信息中提取
				if (!doctorInfo.department && this.userInfo.department) {
					doctorInfo = {
						id: this.userInfo.userId,
						department: this.userInfo.department || '',
						hospital: this.userInfo.hospital || '',
						title: this.userInfo.title || '',
						specialty: this.userInfo.specialization ? [this.userInfo.specialization] : [],
						licenseNumber: this.userInfo.licenseNumber || '',
						...doctorInfo
					}
					
					// 更新store中的医生信息
					store.updateDoctorInfo(doctorInfo)
				}
				
				this.doctorInfo = doctorInfo
			},
			
			// 检查登录状态
			checkLoginStatus() {
				if (!store.isLogin()) {
					uni.reLaunch({
						url: '/pages/login/login'
					})
				}
			},
			
			// 退出登录
			logout() {
				uni.showModal({
					title: '确认退出',
					content: '确定要退出登录吗？',
					success: async (res) => {
						if (res.confirm) {
							try {
								await apiLogout({ loading: false, showError: false })
							} catch (error) {
								console.warn('服务端退出失败，已继续清理本地会话:', error)
							} finally {
								store.logout()
								uni.reLaunch({ url: '/pages/login/login' })
							}
						}
					}
				})
			},
			
			// 处理通知点击
			async handleNotification(item) {
				try {
					// 标记通知为已读
					if (!item.read && item.id) {
						const result = await markNotificationAsRead(item.id, this.userInfo.userId)
						if (result.code === 200) {
							// 更新本地状态
							item.read = true
							this.unreadCount = Math.max(0, this.unreadCount - 1)
						}
					} else {
						// 兼容旧数据格式
						item.read = true
						this.updateUnreadCount()
					}
					
					// 根据通知类型进行相应跳转
			switch(item.type) {
				case 'warning':
				case 'reminder':
					// 警告和提醒通知，跳转到患者管理页面查看具体患者
					if (item.relatedId) {
						// 对于有具体患者ID的情况，使用redirectTo并通过全局变量传递参数
						uni.getStorageSync('patientId') && uni.removeStorageSync('patientId')
						uni.setStorageSync('patientId', item.relatedId)
						uni.redirectTo({ url: '/pages/doctor/patients' })
					} else {
						uni.redirectTo({ url: '/pages/doctor/patients' })
					}
					break
				case 'message':
					// 消息通知，跳转到消息页面
					if (item.relatedId) {
						// 先通过messageId获取消息详情，确定对话对象
						this.handleMessageNotification(item.relatedId)
					} else {
						// 如果没有具体消息ID，跳转到患者管理页面
						uni.redirectTo({ url: '/pages/doctor/patients' })
					}
					break
				case 'follow':
				case 'follow_up':
					// 随访通知，跳转到随访管理页面
					if (item.relatedId) {
						// 对于有具体随访ID的情况，使用redirectTo并通过全局变量传递参数
						uni.getStorageSync('followId') && uni.removeStorageSync('followId')
						uni.setStorageSync('followId', item.relatedId)
						uni.redirectTo({ url: '/pages/doctor/follow' })
				} else {
					uni.redirectTo({ url: '/pages/doctor/follow' })
					}
					break
				case 'request':
				case 'task':
					// 请求和任务通知，跳转到患者管理页面
					if (item.relatedId) {
						// 对于有具体任务ID的情况，使用redirectTo并通过全局变量传递参数
						uni.getStorageSync('taskId') && uni.removeStorageSync('taskId')
						uni.setStorageSync('taskId', item.relatedId)
						uni.redirectTo({ url: '/pages/doctor/patients' })
					} else {
						uni.redirectTo({ url: '/pages/doctor/patients' })
					}
					break
				case 'system':
					// 系统通知，显示详情
					uni.showModal({
						title: item.title,
						content: item.desc,
						showCancel: false
					})
					break
				default:
					// 未知类型通知，显示详情
					uni.showModal({
						title: item.title || '通知详情',
						content: item.desc || '查看通知详情',
						showCancel: false
					})
			}
				} catch (error) {
					console.error('处理通知失败:', error)
					showToast('处理通知失败')
				}
			},
			

			
			// 滑动删除相关方法
			onTouchStart(e, index) {
				this.touchStartX = e.touches[0].clientX
				this.touchStartY = e.touches[0].clientY
				// 重置其他项的位移
				this.resetAllSwipe(index)
			},
			
			onTouchMove(e, index) {
				const currentX = e.touches[0].clientX
				const currentY = e.touches[0].clientY
				const deltaX = currentX - this.touchStartX
				const deltaY = currentY - this.touchStartY
				
				// 判断是否为水平滑动
				if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
					e.preventDefault()
					
					// 只允许向左滑动
					if (deltaX < 0) {
						const translateX = Math.max(deltaX, -80) // 最大滑动80px
						this.doctorNotifications[index].translateX = translateX
						this.currentSwipeIndex = index
					}
				}
			},
			
			onTouchEnd(e, index) {
				const item = this.doctorNotifications[index]
				const translateX = item.translateX || 0
				
				// 如果滑动距离超过40px，显示删除按钮
				if (translateX < -40) {
					this.doctorNotifications[index].translateX = -80
				} else {
					// 否则回弹
					this.doctorNotifications[index].translateX = 0
				}
			},
			
			// 重置所有项的滑动状态
			resetAllSwipe(excludeIndex = -1) {
				this.doctorNotifications.forEach((item, index) => {
					if (index !== excludeIndex) {
						item.translateX = 0
					}
				})
				if (excludeIndex === -1) {
					this.currentSwipeIndex = -1
				}
			},
			
			// 确认删除通知
			confirmDeleteNotification(item, index) {
				uni.showModal({
					title: '确认删除',
					content: '确定要删除这条通知吗？',
					success: (res) => {
						if (res.confirm) {
							this.deleteNotificationItem(item, index)
						} else {
						// 取消删除，回弹
						this.doctorNotifications[index].translateX = 0
					}
					}
				})
			},
			
			// 删除通知
			async deleteNotificationItem(item, index) {
				try {
					uni.showLoading({ title: '删除中...' })
					
					// 如果有通知ID，调用API删除
					if (item.id) {
						const result = await deleteNotification(item.id, this.userInfo.userId)
						if (result.code !== 200) {
							throw new Error(result.message || '删除失败')
						}
					}
					
					// 从本地列表中移除
					this.doctorNotifications.splice(index, 1)
					
					// 更新未读数量
					if (!item.read) {
						this.unreadCount = Math.max(0, this.unreadCount - 1)
					}
					
					// 重置滑动状态
					this.currentSwipeIndex = -1
					
					showToast('删除成功')
				} catch (error) {
					console.error('删除通知失败:', error)
					showToast('删除失败，请重试')
					// 恢复滑动状态
					this.doctorNotifications[index].translateX = 0
				} finally {
					uni.hideLoading()
				}
			},
			
			// 处理患者动态点击
			handleActivity(activity) {
				uni.redirectTo({ 
					url: `/pages/doctor/patients?patient=${activity.patientName}` 
				})
			},
			
			// 查看所有动态
			viewAllActivities() {
				uni.redirectTo({ url: '/pages/doctor/dashboard' })
			},
			

			
			// 更新未读数量
			updateUnreadCount() {
				this.unreadCount = this.doctorNotifications.filter(item => !item.read).length
			},
			
			// 导航到指定页面
		navigateToPage(url) {
			if (url === '/pages/doctor/index') {
				// 当前页面，不需要跳转
				return
			}
			// 使用redirectTo避免页面栈累积
			uni.redirectTo({ url: url })
		},
			
			// 加载仪表板数据（优化版本）
			async loadDashboardData() {
				try {
					this.loading = true
					const userId = this.userInfo.userId
					if (!userId) return
					
					console.log('开始加载仪表板数据，医生ID:', userId)
					
					// 优化：使用Promise.allSettled并行请求，但限制请求数量
					const [patientResult, followResult, overallResult] = await Promise.allSettled([
						getDoctorPatientRelations({ doctorId: userId, pageSize: 100 }),
						getFollowUpStatistics({ doctorId: userId }),
						getOverallStats({ doctorId: userId })
					])
					
					console.log('患者关系数据结果:', patientResult)
					console.log('随访统计数据结果:', followResult)
					
					// 处理患者关系数据
					if (patientResult.status === 'fulfilled' && patientResult.value.code === 200) {
						// 处理独立后端返回的数据结构
						let patients = []
						const data = patientResult.value.data
						if (Array.isArray(data)) {
							patients = data
						} else if (data && Array.isArray(data.patients)) {
							patients = data.patients
						} else if (data && typeof data === 'object') {
							patients = Object.values(data).filter(item => 
								item && typeof item === 'object' && (item.patientId || item.userId)
							)
						}
						
						console.log('处理后的患者数据:', patients)
						this.totalPatients = Number(data?.total ?? patients.length)
						
						// 计算活跃患者和新患者
            await this.calculatePatientStats(patients)
						
					} else {
						console.log('患者关系数据获取失败:', patientResult)
						// 请求失败时设置默认值
						this.totalPatients = 0
						this.activePatients = 0
						this.newPatients = 0
						this.activeRate = 0
					}

					// 总览接口基于全部患者统计，覆盖分页列表的近似值。
					if (overallResult.status === 'fulfilled' && overallResult.value.code === 200) {
						const overall = overallResult.value.data || {}
						this.totalPatients = Number(overall.totalPatients || 0)
						this.activePatients = Number(overall.activePatients || 0)
						this.newPatients = Number(overall.newPatients || 0)
						this.activeRate = this.totalPatients > 0 ? Math.round((this.activePatients / this.totalPatients) * 100) : 0
					}
					
					// 处理随访统计数据
					if (followResult.status === 'fulfilled' && followResult.value.code === 200) {
						const stats = followResult.value.data || {}
						console.log('随访统计原始数据:', stats)
						
						// 修正字段映射 - 使用API实际返回的字段名
						this.pendingTasks = Number(stats.pending || 0) + Number(stats.ongoing || 0) + Number(stats.overdue || 0)
						
						// 修正完成率计算逻辑
						const totalTasks = stats.total || 0
						const completedTasks = stats.completed || 0
						const ongoingTasks = stats.ongoing || 0
						const pendingTasks = stats.pending || 0
						const overdueTasks = stats.overdue || 0
						
						// 有效任务数包含逾期状态，仅排除已取消随访。
						const validTasks = pendingTasks + ongoingTasks + overdueTasks + completedTasks
						
						// 完成率 = 已完成 / 有效任务总数 * 100，确保不超过100%
						if (validTasks > 0) {
							this.completionRate = Math.min(100, Math.round((completedTasks / validTasks) * 100))
						} else {
							this.completionRate = 0
						}
						
						console.log('处理后的随访数据 - 总任务:', totalTasks, '有效任务:', validTasks, '已完成:', completedTasks, '待处理:', this.pendingTasks, '完成率:', this.completionRate)
					} else {
						console.log('随访统计数据获取失败:', followResult)
						// 请求失败时设置默认值
						this.pendingTasks = 0
						this.completionRate = 0
					}
					
					// 优化：未读消息数单独获取，避免阻塞主要数据
					this.loadUnreadCount(userId)
					
				} catch (error) {
					console.error('加载仪表板数据失败:', error)
					// 设置默认值，避免界面异常
					this.totalPatients = 0
					this.activePatients = 0
					this.newPatients = 0
					this.activeRate = 0
					this.pendingTasks = 0
					this.completionRate = 0
				} finally {
					this.loading = false
				}
			},
			
			// 计算患者统计数据
			async calculatePatientStats(patients) {
				try {
					const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
					const activeCount = patients.filter(patient => patient.active).length
					const newCount = patients.filter(patient => {
						const createdAt = patient.relationInfo?.createdAt || patient.relation?.createdAt
						const timestamp = createdAt ? new Date(createdAt).getTime() : NaN
						return Number.isFinite(timestamp) && timestamp >= thirtyDaysAgo
					}).length
					
					this.activePatients = activeCount
					this.newPatients = newCount
					this.activeRate = this.totalPatients > 0 ? Math.round((activeCount / this.totalPatients) * 100) : 0
					
				} catch (error) {
					console.error('计算患者统计数据失败:', error)
					this.activePatients = 0
					this.newPatients = 0
					this.activeRate = 0
				}
			},
			
			// 单独加载未读消息数
			async loadUnreadCount(userId) {
				try {
					const messageResult = await getUnreadMessageCount(userId)
					if (messageResult.code === 200) {
						this.unreadCount = messageResult.data.unreadCount || 0
					}
				} catch (error) {
					console.error('获取未读消息数失败:', error)
					this.unreadCount = 0
				}
			},
			
			// 加载通知数据（优化版本）
			async loadNotifications() {
				try {
					const userId = this.userInfo.userId
					if (!userId) {
						// 如果没有用户ID，清空通知列表
						this.doctorNotifications = []
						return
					}
					
					// 优化：并行请求通知列表和未读数量，减少串行等待时间
					const [notificationResult, unreadResult] = await Promise.allSettled([
						getNotifications({ userId, limit: 3, page: 1 }), // 减少获取数量
						getUnreadNotificationCount({ userId })
					])
					
					// 处理通知列表
					if (notificationResult.status === 'fulfilled' && notificationResult.value.code === 200) {
						const notifications = notificationResult.value.data.notifications || []
						// 转换通知格式
						this.doctorNotifications = notifications.map(notification => ({
							title: notification.title,
							desc: notification.content,
							time: this.formatTime(notification.createdAt),
							read: notification.isRead,
							type: notification.type,
							id: notification.notificationId,
							relatedId: notification.relatedId,
							relatedType: notification.relatedType,
							priority: notification.priority
						}))
					} else {
						// API调用失败，设置为空数组
						this.doctorNotifications = []
					}
					
					// 处理未读通知数量
					if (unreadResult.status === 'fulfilled' && unreadResult.value.code === 200) {
						this.unreadCount = unreadResult.value.data.unreadCount || 0
					} else {
						this.unreadCount = 0
					}
				} catch (error) {
					console.error('加载通知失败:', error)
					// 发生异常时，确保显示空状态
					this.doctorNotifications = []
					this.unreadCount = 0
				}
			},
			
			// 格式化时间
			formatTime(timestamp) {
				if (!timestamp) return '刚刚'
				
				const now = new Date()
				const time = new Date(timestamp)
				const diff = now - time
				
				if (diff < 60000) return '刚刚'
				if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
				if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
				return Math.floor(diff / 86400000) + '天前'
			},
			
			// 加载患者动态数据（优化版本）
			async loadPatientActivities() {
				try {
					const userId = this.userInfo.userId
					if (!userId) return
					
					// 获取医生的患者关系
					const patientResult = await getDoctorPatientRelations({ doctorId: userId })
					if (patientResult.code !== 200) return
					
					// 处理独立后端返回的数据结构
					let patients = []
					if (Array.isArray(patientResult.data)) {
						patients = patientResult.data
					} else if (patientResult.data && Array.isArray(patientResult.data.patients)) {
						patients = patientResult.data.patients
					} else if (patientResult.data && typeof patientResult.data === 'object') {
						patients = Object.values(patientResult.data).filter(item => 
							item && typeof item === 'object' && (item.patientId || item.userId)
						)
					}
					
					if (patients.length === 0) return
					
					// 优化：限制并发请求数量，只获取前3个患者的数据
					const limitedPatients = patients.slice(0, 3)
					const activities = []
					
					// 优化：使用Promise.allSettled控制并发，避免一个失败影响全部
					const patientPromises = limitedPatients.map(async (patient) => {
						try {
							// 只获取最新的一条体重记录，减少数据量
							const healthResult = await getHealthRecords({ 
								patientId: patient.userId,
								type: 'weight',
								limit: 1,
								skip: 0
							})
							
							if (healthResult.code === 200 && healthResult.data && healthResult.data.length > 0) {
								const record = healthResult.data[0]
								if (record.weight) {
									return {
										patientName: patient.name || '患者',
										action: `记录体重 ${record.weight}kg`,
										time: this.formatTime(record.recordDate || record.createTime),
										status: this.getWeightStatus(record.weight, patient.targetWeight),
										type: this.getActivityType(record.weight, patient.targetWeight),
										patientId: patient.userId,
										timestamp: new Date(record.recordDate || record.createTime)
									}
								}
							}
						} catch (error) {
							console.error(`获取患者${patient.name || '未知患者'}数据失败:`, error)
						}
						return null
					})
					
					// 等待所有请求完成
					const results = await Promise.allSettled(patientPromises)
					
					// 收集成功的结果
					results.forEach(result => {
						if (result.status === 'fulfilled' && result.value) {
							activities.push(result.value)
						}
					})
					
					// 按时间排序并更新数据
					activities.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
					this.recentActivities = activities.slice(0, 3)
					
				} catch (error) {
					console.error('加载患者动态失败:', error)
					// 失败时设置空数组，避免界面异常
					this.recentActivities = []
				}
			},
			
			// 获取体重状态
			getWeightStatus(currentWeight, targetWeight) {
				if (!targetWeight) return '正常'
				
				const diff = Math.abs(currentWeight - targetWeight)
				if (diff <= 2) return '正常'
				else if (diff <= 5) return '注意'
				else return '异常'
			},
			
			// 获取活动类型
			getActivityType(currentWeight, targetWeight) {
				if (!targetWeight) return 'normal'
				
				const diff = Math.abs(currentWeight - targetWeight)
				if (diff <= 2) return 'normal'
				else if (diff <= 5) return 'warning'
				else return 'danger'
			},
			
			// 生成绑定码
			async generateBindCode() {
				try {
					const doctorId = this.userInfo.userId
					if (!doctorId) {
						console.error('医生ID不存在')
						return
					}
					
					// 后端最长允许 365 天；界面展示实际到期日。
					const result = await generateInviteCode(doctorId, 365)
					
					if (result.code === 200) {
						const isExisting = result.message === '获取现有邀请码成功'
						this.bindCode = result.data.inviteCode
						this.bindCodeId = result.data.id
						this.bindCodeExpiryText = this.inviteExpiryText(result.data.expiresAt)
						this.generateQRCode()
						
						// 如果是新生成的邀请码，显示提示
						if (!isExisting) {
							console.log('生成新的绑定码:', this.bindCode)
						} else {
							console.log('使用现有绑定码:', this.bindCode)
						}
					} else {
						showToast('生成绑定码失败')
					}
				} catch (error) {
					console.error('生成绑定码失败:', error)
					showToast('生成绑定码失败')
				}
			},
			
			// 刷新绑定码
			async refreshBindCode() {
				uni.showLoading({ title: '生成中...' })
				try {
					const doctorId = this.userInfo.userId
					if (!doctorId) {
						console.error('医生ID不存在')
						return
					}
					
					// 强制生成新的 365 天有效邀请码
					const result = await generateInviteCode(doctorId, 365, true)
					
					if (result.code === 200) {
						this.bindCode = result.data.inviteCode
						this.bindCodeId = result.data.id
						this.bindCodeExpiryText = this.inviteExpiryText(result.data.expiresAt)
						this.generateQRCode()
						showToast('绑定码已刷新')
					} else {
						showToast('刷新绑定码失败')
					}
				} catch (error) {
					console.error('刷新绑定码失败:', error)
					showToast('刷新绑定码失败')
				} finally {
					uni.hideLoading()
				}
			},
			
			// 复制绑定码
			copyBindCode() {
				if (!this.bindCode) {
					showToast('绑定码不存在')
					return
				}
				
				uni.setClipboardData({
					data: this.bindCode,
					success: () => {
						showToast('绑定码已复制')
					},
					fail: () => {
						showToast('复制失败')
					}
				})
			},
			
			// 生成二维码
			generateQRCode() {
				if (!this.bindCode) return
				// 二维码由自有后端生成，图片请求和二维码内容都不再发送至第三方服务。
				this.qrCodeUrl = getInviteQrUrl(this.bindCode)
			},

			inviteExpiryText(value) {
				const date = new Date(value)
				if (Number.isNaN(date.getTime())) return '绑定码最长 365 天有效，点击刷新可重新生成'
				const dateText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
				return `有效至 ${dateText}，点击刷新可重新生成`
			},
			
			// 显示二维码
			showQRCode() {
				if (!this.qrCodeUrl) {
					this.generateQRCode()
				}
				
				uni.previewImage({
					current: this.qrCodeUrl,
					urls: [this.qrCodeUrl],
					fail: () => {
						this.switchQRService()
					}
				})
			},
			
			// 二维码加载失败时保持绑定码可复制，不向外部服务降级。
			switchQRService() {
				this.qrCodeUrl = ''
				showToast('二维码加载失败，请使用绑定码或稍后重试')
			},
			

			// 处理消息通知跳转
			async handleMessageNotification(messageId) {
				try {
					uni.showLoading({ title: '加载中...' })
					
					// 通过消息ID获取消息详情
					const result = await getMessages({ 
						messageId,
						userId: this.userInfo.userId
					})
					
					if (result.code === 200 && result.data.messages && result.data.messages.length > 0) {
						const message = result.data.messages[0]
						const currentUserId = this.userInfo.userId
						
						// 确定对话对象
						let otherUserId, otherUserName
						if (message.senderId === currentUserId) {
							// 当前用户是发送者，对话对象是接收者
							otherUserId = message.receiverId
							otherUserName = message.receiverInfo?.name || '患者'
						} else {
							// 当前用户是接收者，对话对象是发送者
							otherUserId = message.senderId
							otherUserName = message.senderInfo?.name || '患者'
						}
						
						// 构造跳转URL
						const url = `/pages/common/messages?otherUserId=${otherUserId}&otherUserName=${encodeURIComponent(otherUserName)}&messageId=${messageId}&relatedType=message`
						
						uni.navigateTo({ url })
					} else {
						// 无法获取消息详情，跳转到患者管理页面
						uni.showToast({
							title: '消息已失效',
							icon: 'none'
						})
						uni.redirectTo({ url: '/pages/doctor/patients' })
					}
				} catch (error) {
					console.error('获取消息详情失败:', error)
					uni.showToast({
						title: '加载失败',
						icon: 'none'
					})
					uni.redirectTo({ url: '/pages/doctor/patients' })
				} finally {
					uni.hideLoading()
				}
			}
		}
	}
</script>

<style lang="scss">
	.container {
		padding: $spacing-md;
		padding-bottom: 140rpx;
		background-color: $gray-50;
		min-height: 100vh;
	}

	/* 用户头部样式 */
	.user-header {
		@include card-base;
		background: $medical-gradient;
		padding: $spacing-lg;
		margin-bottom: $spacing-lg;
		display: flex;
		align-items: center;
		justify-content: space-between;
		box-shadow: 0 4rpx 20rpx rgba(46, 134, 171, 0.2);
	}

	.user-info {
		display: flex;
		align-items: center;
	}

	.avatar {
		width: 80rpx;
		height: 80rpx;
		border-radius: 50%;
		background-color: rgba(255, 255, 255, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 20rpx;
		border: 3rpx solid rgba(255, 255, 255, 0.5);
	}

	.avatar-text {
		font-size: 36rpx;
		font-weight: 600;
		color: #ffffff;
	}

	.user-details {
		display: flex;
		flex-direction: column;
	}

	.user-name {
		font-size: 32rpx;
		font-weight: 600;
		color: #ffffff;
		margin-bottom: 8rpx;
	}

	.user-role {
		font-size: 24rpx;
		color: rgba(255, 255, 255, 0.8);
		background-color: rgba(255, 255, 255, 0.2);
		padding: 4rpx 12rpx;
		border-radius: 12rpx;
		align-self: flex-start;
		margin-bottom: 4rpx;
	}

	.user-dept {
		font-size: 22rpx;
		color: rgba(255, 255, 255, 0.7);
	}

	.user-actions {
		display: flex;
		align-items: center;
	}

	.action-btn {
		background-color: rgba(255, 255, 255, 0.2);
		border: 2rpx solid rgba(255, 255, 255, 0.3);
		border-radius: 20rpx;
		padding: 12rpx 24rpx;
		transition: all 0.3s ease;
	}

	.action-btn:active {
		background-color: rgba(255, 255, 255, 0.3);
		transform: scale(0.95);
	}

	.action-text {
		font-size: 28rpx;
		color: #ffffff;
		font-weight: 500;
	}

	/* 绑定码区域样式 */
	.bind-code-section {
		margin-bottom: $spacing-lg;
	}

	.bind-code-card {
		@include card-base;
		padding: $spacing-lg;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #ffffff;
		box-shadow: 0 8rpx 32rpx rgba(102, 126, 234, 0.3);
	}

	.bind-code-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: $spacing-md;
	}

	.code-display {
		flex: 1;
		margin-right: $spacing-md;
	}

	.code-label {
		font-size: 24rpx;
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 8rpx;
		display: block;
	}

	.code-value {
		font-size: 48rpx;
		font-weight: 700;
		color: #ffffff;
		letter-spacing: 4rpx;
		margin-bottom: 12rpx;
		display: block;
	}

	.code-actions {
		display: flex;
		gap: 12rpx;
		margin-top: 12rpx;
	}

	.code-copy {
		padding: 8rpx 16rpx;
		width: 160rpx;
		background-color: rgba(255, 255, 255, 0.2);
		border-radius: 12rpx;
		border: 1rpx solid rgba(255, 255, 255, 0.3);
		text-align: center;
	}

	.copy-text {
		font-size: 24rpx;
		color: #ffffff;
	}

	.qr-code-display {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.qr-code {
		width: 180rpx;
		height: 180rpx;
		border-radius: 12rpx;
		background-color: rgba(255, 255, 255, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 8rpx;
		overflow: hidden;
	}

	.qr-image {
		width: 100%;
		height: 100%;
	}

	.qr-actions {
		margin-top: 10rpx;
		display: flex;
		justify-content: center;
	}

	.switch-btn {
		font-size: 20rpx;
		padding: 4rpx 12rpx;
		background-color: rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.8);
		border: 1rpx solid rgba(255, 255, 255, 0.3);
		border-radius: 12rpx;
	}

	.qr-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.qr-text {
		font-size: 20rpx;
		color: #666666;
		text-align: center;
	}

	.qr-label {
		font-size: 22rpx;
		color: rgba(255, 255, 255, 0.8);
		text-align: center;
	}

	.bind-info {
		border-top: 1rpx solid rgba(255, 255, 255, 0.2);
		padding-top: $spacing-md;
	}

	.info-text {
		font-size: 24rpx;
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 8rpx;
		display: block;
	}

	.expire-text {
		font-size: 22rpx;
		color: rgba(255, 255, 255, 0.7);
		display: block;
	}

	.refresh-btn {
		padding: 8rpx 16rpx;
		width: 160rpx;
		background-color: rgba(255, 255, 255, 0.9);
		border-radius: 16rpx;
		border: 1rpx solid rgba(255, 255, 255, 1);
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
		text-align: center;
	}

	.refresh-text {
		font-size: 24rpx;
		color: #2E86AB;
		font-weight: 500;
	}

	/* 工作概览样式 */
	.work-overview {
		margin-bottom: $spacing-lg;
	}

	.overview-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: $spacing-md;
	}

	.overview-card {
		@include card-base;
		padding: $spacing-lg;
		display: flex;
		align-items: center;
	}

	.card-icon {
		font-size: 48rpx;
		margin-right: 20rpx;
	}

	.card-info {
		flex: 1;
	}

	.card-value {
		font-size: 32rpx;
		font-weight: 600;
		color: #2E86AB;
		display: block;
		margin-bottom: 8rpx;
	}

	.card-label {
		font-size: 24rpx;
		color: #666666;
		display: block;
		margin-bottom: 4rpx;
	}

	.card-change {
		font-size: 20rpx;
	}

	.card-change.positive .change-text {
		color: #4CAF50;
	}

	.card-change.warning .change-text {
		color: #FF9800;
	}

	.change-text {
		color: #666666;
	}

	/* 通知中心样式 */
	.notification-center {
		margin-bottom: $spacing-lg;
	}

	.section-title {
		display: flex;
		align-items: center;
		margin-bottom: 20rpx;
		position: relative;
	}

	.title-text {
		font-size: 36rpx;
		font-weight: 600;
		color: #333333;
	}

	.notification-badge {
		background-color: #F77F00;
		border-radius: 50%;
		padding: 0;
		margin-left: 20rpx;
		min-width: 32rpx;
		width: 32rpx;
		height: 32rpx;
		line-height: 32rpx;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.badge-text {
		font-size: 24rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.section-action {
		margin-left: auto;
		display: flex;
		align-items: center;
	}

	.action-text {
		font-size: 28rpx;
		color: #2E86AB;
		margin-right: 8rpx;
	}

	.action-arrow {
		font-size: 24rpx;
		color: #2E86AB;
	}

	.todo-count {
		background-color: #2E86AB;
		border-radius: 20rpx;
		padding: 4rpx 12rpx;
		margin-left: auto;
	}

	.count-text {
		font-size: 24rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.notification-list {
		@include card-base;
		overflow: hidden;
	}

	/* 空状态样式 */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 80rpx 40rpx;
		text-align: center;
	}

	.empty-icon {
		font-size: 80rpx;
		margin-bottom: 20rpx;
		opacity: 0.6;
	}

	.empty-text {
		font-size: 28rpx;
		color: #999999;
		line-height: 1.4;
	}

	.notification-item {
		display: flex;
		align-items: center;
		padding: 30rpx;
		border-bottom: 1rpx solid #F0F0F0;
		position: relative;
	}

	.notification-item:last-child {
		border-bottom: none;
	}

	.notification-content {
		flex: 1;
	}

	.notification-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
		display: block;
		margin-bottom: 10rpx;
	}

	.notification-desc {
		font-size: 28rpx;
		color: #666666;
		display: block;
		margin-bottom: 10rpx;
		line-height: 1.4;
	}

	.notification-time {
		font-size: 24rpx;
		color: #999999;
		display: block;
	}

	.notification-status {
		position: relative;
	}

	.unread-dot {
		width: 16rpx;
		height: 16rpx;
		background-color: #F77F00;
		border-radius: 50%;
	}

	/* 快速操作样式 */
	.quick-actions {
		margin-bottom: $spacing-lg;
	}

	.action-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: $spacing-md;
	}

	.action-item {
		@include card-base;
		padding: 40rpx $spacing-md;
		text-align: center;
		transition: all 0.3s ease;
	}

	.action-item:active {
		transform: scale(0.95);
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.1);
	}

	.action-icon {
		margin-bottom: 20rpx;
	}

	.icon-text {
		font-size: 60rpx;
		line-height: 1;
	}

	/* 患者动态样式 */
	.patient-activities {
		margin-bottom: $spacing-lg;
	}

	.activity-list {
		@include card-base;
		overflow: hidden;
	}

	.activity-item {
		display: flex;
		align-items: center;
		padding: 30rpx;
		border-bottom: 1rpx solid #F0F0F0;
	}

	.activity-item:last-child {
		border-bottom: none;
	}

	.activity-avatar {
		width: 60rpx;
		height: 60rpx;
		border-radius: 50%;
		background-color: #2E86AB;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 20rpx;
	}

	.activity-avatar .avatar-text {
		font-size: 28rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.activity-content {
		flex: 1;
	}

	.activity-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
		display: block;
		margin-bottom: 8rpx;
	}

	.activity-desc {
		font-size: 28rpx;
		color: #666666;
		display: block;
		margin-bottom: 8rpx;
	}

	.activity-time {
		font-size: 24rpx;
		color: #999999;
		display: block;
	}

	.activity-status {
		padding: 8rpx 16rpx;
		border-radius: 12rpx;
		margin-left: 20rpx;
	}

	.activity-status.normal {
		background-color: #E8F5E8;
	}

	.activity-status.warning {
		background-color: #FFF3E0;
	}

	.activity-status.success {
		background-color: #E3F2FD;
	}

	.activity-status .status-text {
		font-size: 24rpx;
		font-weight: 500;
	}

	.activity-status.normal .status-text {
		color: #4CAF50;
	}

	.activity-status.warning .status-text {
		color: #FF9800;
	}

	.activity-status.success .status-text {
		color: #2196F3;
	}

	/* 待办事项样式 */
	.todo-section {
		margin-bottom: $spacing-lg;
	}

	.todo-list {
		@include card-base;
		overflow: hidden;
	}

	.todo-item {
		display: flex;
		align-items: center;
		padding: 30rpx;
		border-bottom: 1rpx solid #F0F0F0;
		transition: all 0.3s ease;
	}

	.todo-item:last-child {
		border-bottom: none;
	}

	.todo-item.completed {
		opacity: 0.6;
	}

	.todo-icon {
		margin-right: 20rpx;
	}

	.todo-emoji {
		font-size: 40rpx;
	}

	.todo-content {
		flex: 1;
	}

	.todo-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
		display: block;
		margin-bottom: 8rpx;
	}

	.todo-desc {
		font-size: 28rpx;
		color: #666666;
		display: block;
	}

	.todo-priority {
		padding: 6rpx 12rpx;
		border-radius: 12rpx;
		margin-left: 20rpx;
	}

	.todo-priority.high {
		background-color: #FFEBEE;
	}

	.todo-priority.medium {
		background-color: #FFF3E0;
	}

	.todo-priority.low {
		background-color: #E8F5E8;
	}

	.priority-text {
		font-size: 24rpx;
		font-weight: 500;
	}

	.todo-priority.high .priority-text {
		color: #F44336;
	}

	.todo-priority.medium .priority-text {
		color: #FF9800;
	}

	.todo-priority.low .priority-text {
		color: #4CAF50;
	}
	
	/* 医生端底部导航样式 */
	.doctor-tabbar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 100rpx;
		background-color: #ffffff;
		border-top: 1rpx solid #E5E5E5;
		display: flex;
		align-items: center;
		justify-content: space-around;
		padding-bottom: env(safe-area-inset-bottom);
		z-index: 1000;
		box-shadow: 0 -2rpx 10rpx rgba(0, 0, 0, 0.1);
	}
	
	.tab-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		height: 100%;
		transition: all 0.3s ease;
	}
	
	.tab-item.active .tab-icon {
		transform: scale(1.1);
	}
	
	.tab-item.active .tab-text {
		color: #2E86AB;
		font-weight: 600;
	}
	
	.tab-icon {
		font-size: 40rpx;
		margin-bottom: 8rpx;
		transition: all 0.3s ease;
	}
	
	.tab-text {
		font-size: 22rpx;
		color: #666666;
		transition: all 0.3s ease;
	}
	
	/* 滑动删除样式 */
	.notification-wrapper {
		position: relative;
		overflow: hidden;
	}
	
	.notification-item {
		transition: transform 0.3s ease;
		background-color: #ffffff;
		z-index: 2;
	}
	
	.delete-action {
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 80px;
		background-color: #ff4757;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1;
	}
	
	.delete-text {
		color: #ffffff;
		font-size: 28rpx;
		font-weight: 600;
	}
	
	.delete-action:active {
		background-color: #ff3742;
	}

	/* 2026 clinical visual refresh */
	.container {
		padding: 0 24rpx calc(148rpx + env(safe-area-inset-bottom));
		background:
			radial-gradient(circle at 88% 2%, rgba(104, 205, 230, 0.2), transparent 300rpx),
			linear-gradient(180deg, #eaf7fc 0, #f7fbfd 360rpx, #f5f9fb 100%);
		color: #15324a;
	}

	.doctor-brand {
		display: flex;
		align-items: center;
		gap: 16rpx;
		padding: 8rpx 6rpx 22rpx;
	}

	.doctor-brand-logo-tile {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 66rpx;
		height: 66rpx;
		border-radius: 16rpx;
		background: linear-gradient(135deg, #157FA5 0%, #1B9CC1 100%);
		box-shadow: 0 7rpx 18rpx rgba(25, 122, 158, 0.18);
	}

	.doctor-brand-logo {
		width: 54rpx;
		height: 54rpx;
	}

	.doctor-brand-copy {
		display: flex;
		flex-direction: column;
		gap: 2rpx;
	}

	.doctor-brand-name {
		font-size: 30rpx;
		font-weight: 700;
		letter-spacing: 1rpx;
		color: #17354b;
	}

	.doctor-brand-subtitle {
		font-size: 21rpx;
		color: #718797;
	}

	.user-header {
		margin-bottom: 28rpx;
		padding: 28rpx;
		border: 1rpx solid rgba(198, 226, 237, 0.92);
		border-radius: 26rpx;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 12rpx 32rpx rgba(31, 119, 151, 0.08);
	}

	.avatar {
		width: 84rpx;
		height: 84rpx;
		margin-right: 20rpx;
		border: 2rpx solid #bfe5f1;
		background: linear-gradient(145deg, #e2f6fb, #c9eef7);
	}

	.avatar-text,
	.user-name {
		color: #15324a;
	}

	.avatar-text {
		font-size: 34rpx;
	}

	.user-name {
		font-size: 31rpx;
		margin-bottom: 7rpx;
	}

	.user-role {
		margin: 0 0 5rpx;
		padding: 4rpx 14rpx;
		color: #157fa5;
		background: #e7f7fb;
		border-radius: 999rpx;
	}

	.user-dept {
		color: #6f8493;
	}

	.action-btn {
		padding: 12rpx 22rpx;
		background: #f4fafc;
		border: 1rpx solid #cfe6ef;
		border-radius: 999rpx;
	}

	.action-text {
		font-size: 25rpx;
		color: #4d6879;
	}

	.bind-code-section,
	.work-overview,
	.notification-center,
	.patient-activities {
		margin-bottom: 32rpx;
	}

	.section-title {
		margin-bottom: 18rpx;
		padding: 0 4rpx;
	}

	.title-text {
		display: flex;
		align-items: center;
		gap: 10rpx;
		font-size: 30rpx;
		font-weight: 700;
		color: #18374d;
	}

	.bind-code-card {
		padding: 28rpx;
		color: #15324a;
		background: #ffffff;
		border: 1rpx solid #d8ecf3;
		border-radius: 26rpx;
		box-shadow: 0 12rpx 32rpx rgba(31, 119, 151, 0.08);
	}

	.code-label,
	.qr-label,
	.info-text,
	.expire-text {
		color: #607989;
	}

	.code-value {
		font-size: 46rpx;
		letter-spacing: 6rpx;
		color: #1688b1;
	}

	.code-copy,
	.refresh-btn {
		width: auto;
		min-width: 118rpx;
		padding: 10rpx 18rpx;
		background: #e8f7fb;
		border: 1rpx solid #bde3ee;
		border-radius: 14rpx;
		box-shadow: none;
	}

	.copy-text,
	.refresh-text {
		font-size: 24rpx;
		font-weight: 600;
		color: #167fa5;
	}

	.qr-code {
		width: 172rpx;
		height: 172rpx;
		background: #f8fcfd;
		border: 1rpx solid #d6eaf1;
		border-radius: 18rpx;
	}

	.bind-info {
		border-top-color: #e2eef2;
	}

	.overview-grid {
		gap: 18rpx;
	}

	.overview-card {
		min-height: 132rpx;
		padding: 24rpx;
		background: #ffffff;
		border: 1rpx solid #dcecf2;
		border-radius: 22rpx;
		box-shadow: 0 8rpx 24rpx rgba(31, 119, 151, 0.06);
	}

	.card-icon {
		width: 62rpx;
		height: 62rpx;
		margin-right: 16rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #e9f8fb;
		border-radius: 18rpx;
	}

	.card-value {
		font-size: 36rpx;
		font-weight: 700;
		color: #1688b1;
	}

	.card-label {
		color: #516b7b;
	}

	.notification-list,
	.activity-list {
		background: #ffffff;
		border: 1rpx solid #dcecf2;
		border-radius: 24rpx;
		box-shadow: 0 10rpx 28rpx rgba(31, 119, 151, 0.07);
	}

	.notification-item,
	.activity-item {
		padding: 26rpx;
		border-bottom-color: #eaf1f4;
	}

	.notification-title,
	.activity-title {
		font-size: 29rpx;
		color: #17364c;
	}

	.notification-desc,
	.activity-desc {
		font-size: 25rpx;
		color: #5f7584;
	}

	.notification-time,
	.activity-time {
		font-size: 22rpx;
		color: #93a3ae;
	}

	.activity-avatar {
		width: 66rpx;
		height: 66rpx;
		background: linear-gradient(145deg, #2ba5c9, #1685ad);
		box-shadow: 0 6rpx 14rpx rgba(22, 133, 173, 0.18);
	}

	.notification-badge,
	.unread-dot {
		background: #ef8d4b;
	}

	.doctor-tabbar {
		height: 108rpx;
		background: rgba(255, 255, 255, 0.97);
		border-top-color: #dcecf2;
		box-shadow: 0 -8rpx 28rpx rgba(30, 95, 119, 0.08);
	}

	.tab-item {
		position: relative;
	}

	.tab-item.active::before {
		content: '';
		position: absolute;
		top: 0;
		width: 42rpx;
		height: 5rpx;
		border-radius: 0 0 8rpx 8rpx;
		background: #1688b1;
	}

	.tab-item.active .tab-icon {
		transform: none;
	}

	.tab-item.active .tab-text {
		color: #167fa5;
	}

	.tab-text {
		font-size: 21rpx;
		color: #8294a0;
	}
</style>
