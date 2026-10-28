<template>
	<view class="patients-container staff-navigation-page">
		<!-- 头部搜索区域 -->
		<view class="header-section">
			<view class="search-bar">
				<Icon name="System/search-line.svg" size="16" color="$gray-400"></Icon>
				<input 
					v-model="searchKeyword" 
					:placeholder="nutritionistView ? '搜索客户编号' : '搜索患者姓名或手机号'"
					class="search-input"
					@input="handleSearch"
				/>

			</view>
			<view class="filter-tabs">
				<view 
					v-for="(tab, index) in filterTabs" 
				:key="index"
				:class="['filter-tab', { active: activeTab === index }]"
				@click="switchTab(index)"
				>
					{{ tab.name }}
				</view>
			</view>
		</view>
		


		<!-- 患者列表 -->
		<scroll-view 
			scroll-y 
			class="patients-list"
			@scrolltolower="loadMore"
			refresher-enabled
			:refresher-triggered="refresherTriggered"
			@refresherrefresh="onRefresh"
		>
			<view 
				v-for="patient in filteredPatients" 
				:key="patient.id"
				class="patient-card"
				@click="viewPatientDetail(patient)"
			>
				<!-- 患者卡片右上角菜单按钮 -->
				<view v-if="!nutritionistView" class="card-menu-button" role="button" :aria-label="patient.showMenu ? '关闭患者操作菜单' : '打开患者操作菜单'" @click.stop="togglePatientMenu(patient.id)">
					<view class="three-dots">
						<view class="dot"></view>
						<view class="dot"></view>
						<view class="dot"></view>
					</view>
				</view>
				
				<!-- 患者卡片菜单下拉 -->
				<view v-if="patient.showMenu" class="card-dropdown-menu" @click.stop>
					<view class="card-menu-overlay" @click="closePatientMenu(patient.id)"></view>
					<view class="card-menu-content">
						<view class="card-menu-item" role="button" aria-label="解除绑定" @click="unbindSinglePatient(patient)">
							<Icon name="System/delete-bin-line.svg" size="20" color="$error-color"></Icon>
							<text class="card-menu-text">解除绑定</text>
						</view>
					</view>
				</view>
				
				<view class="patient-avatar">
					<view class="avatar-text">
						{{ getAvatarText(patient.name) }}
					</view>
					<view :class="['status-dot', patient.status]"></view>
				</view>
				
				<view class="patient-info">
					<view class="info-row">
						<text class="patient-name">{{ patient.name }}</text>
						<text v-if="!nutritionistView" class="patient-age">{{ patient.age }}岁</text>
					</view>
					<view class="info-row">
						<text class="patient-phone">{{ patient.phone }}</text>
						<text v-if="!nutritionistView" class="patient-gender">{{ getGenderText(patient.gender) }}</text>
					</view>
					<view class="info-row">
						<text v-if="nutritionistView" class="last-visit">记录及点评：进入详情查看</text><text v-else class="last-visit">最近记录：{{ patient.lastVisit }}</text>
					</view>
				</view>
				
				<view class="patient-stats">
					<view class="stat-item">
						<text class="stat-value">{{ patient.currentWeight }}</text>
						<text class="stat-label">当前体重(kg)</text>
					</view>
					<view class="stat-item">
						<text class="stat-value">{{ patient.targetWeight }}</text>
						<text class="stat-label">目标体重(kg)</text>
					</view>
				</view>
				
				<view class="action-buttons">
					<button 
						class="btn-follow" 
						@click.stop="startFollow(patient)"
					>
						随访
					</button>
					<button 
						class="btn-message" 
						@click.stop="sendMessage(patient)"
					>
						留言
					</button>
				</view>
			</view>
			
			<!-- 加载更多 -->
			<view v-if="loading" class="loading-more">
				<view class="clinical-loading-spinner"></view>
				<text class="clinical-loading-text">加载中...</text>
			</view>
			
			<!-- 暂无数据 -->
			<view v-if="!loading && filteredPatients.length === 0" class="empty-state">
				<Icon name="User/user-line.svg" size="48" color="$gray-300"></Icon>
				<text class="empty-text">暂无患者数据</text>
			</view>
		</scroll-view>
	
		<!-- 医生端底部导航 -->
  <view class="doctor-tabbar" role="tablist" :aria-label="staffNavigation.role + '导航'">
    <view 
      class="tab-item" role="tab" aria-selected="false" id="staff-nav-index"
      @click="navigateToPage('/pages/doctor/index')"
    >
      <view class="tab-icon"><Icon name="Buildings/home-line.svg" size="20" color="$gray-400" /></view>
      <text class="tab-text">{{ staffNavigation.home }}</text>
    </view>
    <view 
      class="tab-item" role="tab" aria-selected="false" id="staff-nav-dashboard"
      @click="navigateToPage('/pages/doctor/dashboard')"
    >
      <view class="tab-icon"><Icon name="Business/bar-chart-line.svg" size="20" color="$gray-400" /></view>
      <text class="tab-text">数据看板</text>
    </view>
    <view 
      class="tab-item active" role="tab" aria-selected="true" id="staff-nav-patients"
      @click="navigateToPage('/pages/doctor/patients')"
    >
      <view class="tab-icon"><Icon name="User/group-line.svg" size="20" color="$primary-color" /></view>
      <text class="tab-text">{{ staffNavigation.clients }}</text>
    </view>
    <view 
      class="tab-item" role="tab" aria-selected="false" id="staff-nav-follow"
      @click="navigateToPage('/pages/doctor/follow')"
    >
      <view class="tab-icon"><Icon name="Document/clipboard-line.svg" size="20" color="$gray-400" /></view>
      <text class="tab-text">随访管理</text>
    </view>
  </view>
		

	</view>
</template>

<script>
import { staffNavigationFor, staffPageTitle } from '../../utils/staff-navigation.js'
import store from '../../store/index.js'
import { getPatientDetail, getPatientStats, unbindPatient } from '../../utils/api.js'
import { managedPatientList as getPatientList, isNutritionist } from '../../utils/managed-care.js'
import { showToast } from '../../utils/common.js'
import Icon from '../../components/Icon.vue'

export default {
	components: {
		Icon
	},
	data() {
		return {
			searchKeyword: '',
			activeTab: 0,
			loading: false,
			loadingMore: false,
			hasMore: true,
			currentPage: 1,
			pageSize: 10,
			totalCount: 0,
			refresherTriggered: false,
			filterTabs: [
				{ name: '全部', value: 'all' },
				{ name: '活跃', value: 'active' },
				{ name: '需关注', value: 'attention' },
				{ name: '已完成', value: 'completed' }
			],
			patients: [],
			userInfo: {},
			currentUnbindPatient: null
		}
	},
	computed: { staffNavigation() { return staffNavigationFor(this.userInfo) },
		nutritionistView() { return isNutritionist(this.userInfo) },
		filteredPatients() {
			// 后端已处理过滤逻辑，直接返回患者列表
			return this.patients
		}
	},
	onShow() {
    this.userInfo = store.getUserInfo() || {}
    uni.setNavigationBarTitle({ title: staffPageTitle(this.userInfo, 'patients') })
  },
  onLoad() {
    this.userInfo = store.getUserInfo() || {}
    uni.setNavigationBarTitle({ title: staffPageTitle(this.userInfo, 'patients') })

		this.getUserInfo()
		this.loadPatients()
	},
	methods: {
		// 获取用户信息
		getUserInfo() {
			this.userInfo = store.getUserInfo() || {}
			if (isNutritionist(this.userInfo)) this.filterTabs = [{ name: '已分配客户', value: 'all' }]
		},
		
		// 加载患者数据
		async loadPatients(isRefresh = false) {
			if (isRefresh) {
				this.currentPage = 1
				this.patients = []
				this.hasMore = true
			}
			
			if (this.loading || this.loadingMore || !this.hasMore) {
				return
			}
			
			try {
				if (this.currentPage === 1) {
					this.loading = true
				} else {
					this.loadingMore = true
				}
				
				const doctorId = this.userInfo.userId
				if (!doctorId) {
					showToast('医生/营养师信息获取失败')
					return
				}
				
				// 构建查询参数
				const params = {
					doctorId,
					page: this.currentPage,
					limit: this.pageSize,
					keyword: this.searchKeyword
				}
				
				// 根据选中的标签设置状态过滤
				const currentTab = this.filterTabs[this.activeTab]
				if (currentTab.value !== 'all') {
					params.status = currentTab.value
				}
				
				const result = await getPatientList(params)
				
				if (result.code === 200) {
					const { patients, total } = result.data
					
					// 处理患者数据，添加额外信息
					const processedPatients = await this.processPatientData(patients)
					
					if (this.currentPage === 1) {
						this.patients = processedPatients
					} else {
						this.patients = [...this.patients, ...processedPatients]
					}
					
					this.totalCount = total
					this.hasMore = this.patients.length < total
					this.currentPage++
				} else {
					showToast(result.message || '获取患者列表失败')
				}
			} catch (error) {
				console.error('加载患者数据失败:', error)
				this.patients = []; this.totalCount = 0
				showToast(error.message || '客户服务暂不可用，请重试')
			} finally {
				this.loading = false
				this.loadingMore = false
			}
		},
		
		// 处理患者数据，添加统计信息
		async processPatientData(patients) {
			const processedPatients = []
			
			// 限制并发数量，避免请求过多
			const batchSize = 3
			for (let i = 0; i < patients.length; i += batchSize) {
				const batch = patients.slice(i, i + batchSize)
				
				const batchResults = await Promise.allSettled(
					batch.map(async (patient) => {
						try {
							// 只获取统计数据，减少请求数量
							const statsResult = await getPatientStats({ patientId: patient.userId })
							
							let processedPatient = {
								id: patient.userId,
								name: patient.name || '未知',
								age: patient.age || 0,
								gender: patient.gender || '未知',
								phone: this.maskPhone(patient.phone || ''),
								avatar: this.getAvatarText(patient.name),
								status: this.getPatientStatus(patient),
								currentWeight: patient.currentWeight ?? '--',
								targetWeight: patient.targetWeight ?? '--',
								progress: 0,
								lastVisit: this.formatDate(patient.lastRecordDate),
								showMenu: false
							}
							
							// 添加统计信息（包含体重数据）
							if (statsResult.code === 200 && statsResult.data) {
								const stats = statsResult.data
								processedPatient.currentWeight = stats.currentWeight ?? '--'
								processedPatient.targetWeight = stats.targetWeight ?? '--'
								if (stats.progress !== undefined && stats.progress !== null) {
									processedPatient.progress = stats.progress
								} else {
									const initial = Number(patient.initialWeight ?? patient.initialWeightKg)
									const current = Number(stats.currentWeight)
									const target = Number(stats.targetWeight)
									if ([initial, current, target].every(Number.isFinite) && initial !== target) {
										processedPatient.progress = Math.round(Math.max(0, Math.min(100, ((current - initial) / (target - initial)) * 100)))
									}
								}
							}
							
							return processedPatient
						} catch (error) {
							console.error('处理患者数据失败:', error)
							// 使用基础信息
							return {
								id: patient.userId,
								name: patient.name || '未知',
								age: patient.age || 0,
								gender: patient.gender || '未知',
								phone: this.maskPhone(patient.phone || ''),
								avatar: this.getAvatarText(patient.name),
								status: this.getPatientStatus(patient),
								currentWeight: patient.currentWeight ?? '--',
								targetWeight: patient.targetWeight ?? '--',
								progress: 0,
								lastVisit: this.formatDate(patient.lastRecordDate),
								showMenu: false
							}
						}
					})
				)
				
				// 处理批次结果
				batchResults.forEach(result => {
					if (result.status === 'fulfilled') {
						processedPatients.push(result.value)
					}
				})
			}
			
			return processedPatients
		},
		
		// 获取患者状态
		getPatientStatus(patient) {
			// 状态口径由后端统一计算，避免把“关系更新时间”误当作患者活跃度。
			if (patient.completedGoal) return 'completed'
			if (patient.attention) return 'attention'
			if (patient.active) return 'active'
			return 'neutral'
		},
		
		// 手机号脱敏
		maskPhone(phone) {
			if (!phone || phone.length < 7) return phone
			return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
		},
		
		// 格式化日期
		formatDate(timestamp) {
			if (!timestamp) return '暂无记录'
			
			const date = new Date(timestamp)
			const year = date.getFullYear()
			const month = String(date.getMonth() + 1).padStart(2, '0')
			const day = String(date.getDate()).padStart(2, '0')
			
			return `${year}-${month}-${day}`
		},
		
		// 切换标签
		switchTab(index) {
			if (this.activeTab !== index) {
				this.activeTab = index
				this.loadPatients(true) // 重新加载数据
			}
		},
		
		// 搜索处理
		handleSearch() {
			// 防抖处理
			clearTimeout(this.searchTimer)
			this.searchTimer = setTimeout(() => {
				this.loadPatients(true)
			}, 500)
		},
		
		// 查看患者详情
		viewPatientDetail(patient) {
			uni.navigateTo({
				url: `/pages/doctor/patient-detail?id=${patient.id}&name=${encodeURIComponent(patient.name)}`
			})
		},
		
		// 开始随访
		startFollow(patient) {
			uni.navigateTo({
				url: `/pages/doctor/follow-add?patientId=${patient.id}&patientName=${encodeURIComponent(patient.name)}`
			})
		},
		
		// 发送消息
		sendMessage(patient) {
			uni.navigateTo({
				url: `/pages/common/messages?otherUserId=${patient.id}&otherUserName=${encodeURIComponent(patient.name)}&relatedId=${patient.id}&relatedType=patient`
			})
		},
		
		// 加载更多
		loadMore() {
			if (!this.loading && !this.loadingMore && this.hasMore) {
				this.loadPatients()
			}
		},
		
		// 下拉刷新
		async onRefresh() {
			this.refresherTriggered = true
			try {
				await this.loadPatients(true)
			} finally {
				this.refresherTriggered = false
			}
		},
		
		// 获取进度样式类
		getProgressClass(progress) {
			if (progress >= 80) return 'success'
			if (progress >= 50) return 'warning'
			return 'danger'
		},
		
		// 导航到指定页面
		navigateToPage(url) {
			if (url === '/pages/doctor/patients') {
				// 当前页面，不需要跳转
				return
			}
			// 使用redirectTo避免页面栈累积
			uni.redirectTo({
				url: url
			})
		},
		
		// 刷新数据
		refreshData() {
			this.loadPatients(true)
		},
		
		// 获取头像文本（姓名首字符）
		getAvatarText(name) {
			if (!name || name === '未知') {
				return '?'
			}
			return name.charAt(0).toUpperCase()
		},
		
		// 获取性别中文显示
		getGenderText(gender) {
			const genderMap = {
				'male': '男',
				'female': '女',
				'M': '男',
				'F': '女',
				'男': '男',
				'女': '女'
			}
			return genderMap[gender] || '未知'
		},
		

		
		// 切换患者菜单显示
		togglePatientMenu(patientId) {
			// 关闭所有其他患者的菜单
			this.patients.forEach(patient => {
				if (patient.id !== patientId) {
					patient.showMenu = false
				}
			})
			
			// 切换当前患者的菜单状态
			const patient = this.patients.find(p => p.id === patientId)
			if (patient) {
				patient.showMenu = !patient.showMenu
			}
		},
		
		// 关闭患者菜单
		closePatientMenu(patientId) {
			const patient = this.patients.find(p => p.id === patientId)
			if (patient) {
				patient.showMenu = false
			}
		},
		
		// 解绑单个患者
		unbindSinglePatient(patient) {
			this.currentUnbindPatient = patient
			patient.showMenu = false
			
			uni.showModal({
				title: '确认解绑',
				content: `确定要解除与患者"${patient.name}"的绑定关系吗？此操作不可撤销。`,
				confirmText: '确认解绑',
				cancelText: '取消',
				confirmColor: '#EF4444',
				success: (res) => {
					if (res.confirm) {
						this.confirmSingleUnbind()
					}
				}
			})
		},
		
		// 确认解绑单个患者
		async confirmSingleUnbind() {
			if (!this.currentUnbindPatient) return
			
			try {
				uni.showLoading({ title: '解绑中...' })
				
				// 后端从登录令牌识别当前医生，只提交待解绑患者 ID
				const result = await unbindPatient(this.currentUnbindPatient.id)
				
				uni.hideLoading()
				
				if (result.code === 200) {
					uni.showToast({
						title: `成功解绑患者"${this.currentUnbindPatient.name}"`,
						icon: 'success'
					})
					// 刷新患者列表
					this.loadPatients(true)
				} else {
					uni.showToast({
						title: result.message || '解绑失败',
						icon: 'none'
					})
				}
			} catch (error) {
				uni.hideLoading()
				console.error('解绑失败:', error)
				uni.showToast({
					title: '解绑失败',
					icon: 'none'
				})
			} finally {
				this.currentUnbindPatient = null
			}
		}
	},
	
	// 页面销毁时清理定时器
	onUnload() {
		if (this.searchTimer) {
			clearTimeout(this.searchTimer)
		}
	}
}
</script>

<style lang="scss" scoped>
.patients-container {
	background-color: #f5f5f5;
	min-height: 100vh;
	padding-bottom: 140rpx;
}

.header-section {
	background: white;
	padding: 20rpx 10rpx;
	border-bottom: 1rpx solid #eee;
}

.search-bar {
	display: flex;
	align-items: center;
	background: #f8f8f8;
	border-radius: 25rpx;
	padding: 15rpx 20rpx;
	margin-bottom: 20rpx;
	position: relative;
}



.search-input {
	flex: 1;
	margin-left: 15rpx;
	font-size: 28rpx;
	border: none;
	background: transparent;
}

.filter-tabs {
	display: flex;
	gap: 20rpx;
}

.filter-tab {
	padding: 10rpx 20rpx;
	border-radius: 20rpx;
	background: #f0f0f0;
	color: #666;
	font-size: 26rpx;
	transition: all 0.3s;
}

.filter-tab.active {
	background: #2E86AB;
	color: white;
}

.patients-list {
	height: calc(100vh - 200rpx);
	padding: 20rpx 22rpx;
}

.patient-card {
	background: white;
	border-radius: 15rpx;
	padding: 25rpx 60rpx 25rpx 25rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.1);
	position: relative;
	width: calc(100% - 20rpx);
	max-width: calc(100vw - 40rpx);
	box-sizing: border-box;
	overflow: hidden;
}

/* 患者卡片菜单按钮 */
.card-menu-button {
	position: absolute;
	top: 10rpx;
	right: 10rpx;
	width: 88rpx;
	height: 88rpx;
	min-width: 88rpx;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: background-color 0.3s;
	z-index: 10;
	background-color: rgba(255, 255, 255, 0.9);
	box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.1);
}

.card-menu-button:active {
	background-color: #f0f0f0;
}

/* 三个点样式 */
.three-dots {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 3rpx;
}

.dot {
	width: 6rpx;
	height: 6rpx;
	border-radius: 50%;
	background-color: #999;
}

/* 患者卡片下拉菜单 */
.card-dropdown-menu {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: 1000;
	pointer-events: none;
}

.card-menu-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: transparent;
	pointer-events: auto;
	z-index: 999;
}

.card-menu-content {
	position: absolute;
	top: 50rpx;
	right: 10rpx;
	background: white;
	border-radius: 10rpx;
	box-shadow: 0 4rpx 20rpx rgba(0,0,0,0.15);
	min-width: 160rpx;
	overflow: hidden;
	z-index: 1001;
	pointer-events: auto;
}

.card-menu-item {
	display: flex;
	align-items: center;
	min-height: 88rpx;
	box-sizing: border-box;
	padding: 20rpx 25rpx;
	transition: background-color 0.3s;
	border-bottom: 1rpx solid #f0f0f0;
}

.card-menu-item:last-child {
	border-bottom: none;
}

.card-menu-item:active {
	background-color: #f8f8f8;
}

.card-menu-text {
	margin-left: 15rpx;
	font-size: 26rpx;
	color: #ff4757;
}

.patient-avatar {
	position: relative;
	width: 80rpx;
	height: 80rpx;
	margin-bottom: 15rpx;
}

.avatar-text {
	width: 80rpx;
	height: 80rpx;
	border-radius: 50%;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 32rpx;
	font-weight: bold;
	text-transform: uppercase;
}

.status-dot {
	position: absolute;
	bottom: 0;
	right: 0;
	width: 20rpx;
	height: 20rpx;
	border-radius: 50%;
	border: 2rpx solid white;
}

.status-dot.active {
	background: #52c41a;
}

.status-dot.attention {
	background: #faad14;
}

.status-dot.completed {
	background: #1890ff;
}

.patient-info {
	margin-bottom: 20rpx;
}

.info-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 8rpx;
}

.patient-name {
	font-size: 32rpx;
	font-weight: bold;
	color: #333;
}

.patient-age {
	font-size: 26rpx;
	color: #666;
}

.patient-phone {
	font-size: 26rpx;
	color: #666;
}

.patient-gender {
	font-size: 26rpx;
	color: #666;
}

.last-visit {
	font-size: 24rpx;
	color: #999;
}

.patient-stats {
	display: flex;
	justify-content: space-between;
	margin-bottom: 20rpx;
	padding: 15rpx;
	background: #f8f9fa;
	border-radius: 10rpx;
}

.stat-item {
	text-align: center;
	flex: 1;
}

.stat-value {
	display: block;
	font-size: 28rpx;
	font-weight: bold;
	color: #333;
	margin-bottom: 5rpx;
}

.stat-value.success {
	color: #52c41a;
}

.stat-value.warning {
	color: #faad14;
}

.stat-value.danger {
	color: #ff4d4f;
}

.stat-label {
	font-size: 22rpx;
	color: #999;
}

.action-buttons {
	display: flex;
	gap: 15rpx;
}

.btn-follow,
.btn-message {
	flex: 1;
	height: 60rpx;
	border-radius: 8rpx;
	font-size: 26rpx;
	border: none;
}

.btn-follow {
	background: #2E86AB;
	color: white;
}

.btn-message {
	background: #f0f0f0;
	color: #666;
}

.loading-more {
	padding: 30rpx;
	text-align: center;
}

.empty-state {
	text-align: center;
	padding: 100rpx 0;
}

.empty-text {
	display: block;
	margin-top: 20rpx;
	color: #999;
	font-size: 28rpx;
}

/* 医生端底部导航样式 */
	
	
	
	
	
	
	
	
	
	
	

	/* 2026 clinical visual refresh */
	.patients-container {
		padding-bottom: calc(148rpx + env(safe-area-inset-bottom));
		background:
			radial-gradient(circle at 88% 1%, rgba(102, 203, 229, 0.18), transparent 300rpx),
			linear-gradient(180deg, #eaf7fc 0, #f7fbfd 340rpx, #f5f9fb 100%);
		color: #15324a;
	}

	.header-section {
		position: sticky;
		top: 0;
		z-index: 20;
		padding: 22rpx 24rpx 18rpx;
		background: rgba(244, 250, 253, 0.96);
		border-bottom: 1rpx solid rgba(205, 229, 238, 0.85);
		box-shadow: 0 6rpx 18rpx rgba(31, 119, 151, 0.05);
	}

	.search-bar {
		height: 78rpx;
		box-sizing: border-box;
		padding: 0 22rpx;
		margin-bottom: 18rpx;
		background: #ffffff;
		border: 1rpx solid #cfe7ef;
		border-radius: 20rpx;
		box-shadow: 0 6rpx 18rpx rgba(31, 119, 151, 0.05);
	}

	.search-input {
		font-size: 26rpx;
		color: #17364c;
	}

	.filter-tabs {
		gap: 12rpx;
		overflow-x: auto;
	}

	.filter-tab {
		padding: 11rpx 22rpx;
		color: #607786;
		background: rgba(255, 255, 255, 0.82);
		border: 1rpx solid #d8e9ef;
		border-radius: 999rpx;
		white-space: nowrap;
	}

	.filter-tab.active {
		color: #ffffff;
		background: linear-gradient(135deg, #1684ad, #1b9fc2);
		border-color: transparent;
		box-shadow: 0 6rpx 16rpx rgba(22, 132, 173, 0.18);
	}

	.patients-list {
		height: calc(100vh - 218rpx);
		padding: 22rpx 24rpx;
		box-sizing: border-box;
	}

	.patient-card {
		display: grid;
		grid-template-columns: 92rpx minmax(0, 1fr);
		column-gap: 20rpx;
		width: 100%;
		max-width: none;
		box-sizing: border-box;
		padding: 26rpx;
		margin-bottom: 20rpx;
		background: #ffffff;
		border: 1rpx solid #dcecf2;
		border-radius: 24rpx;
		box-shadow: 0 10rpx 28rpx rgba(31, 119, 151, 0.07);
		overflow: visible;
	}

	.card-menu-button {
		top: 18rpx;
		right: 18rpx;
		width: 88rpx;
		height: 88rpx;
		background: #f3f9fb;
		box-shadow: none;
	}

	.dot {
		width: 5rpx;
		height: 5rpx;
		background: #77909f;
	}

	.card-menu-content {
		top: 64rpx;
		right: 18rpx;
		border: 1rpx solid #e1edf2;
		border-radius: 16rpx;
		box-shadow: 0 12rpx 36rpx rgba(24, 78, 99, 0.14);
	}

	.patient-avatar {
		grid-column: 1;
		grid-row: 1;
		width: 88rpx;
		height: 88rpx;
		margin: 0;
	}

	.avatar-text {
		width: 88rpx;
		height: 88rpx;
		font-size: 32rpx;
		background: linear-gradient(145deg, #31a8c9, #1683ac);
		box-shadow: 0 7rpx 16rpx rgba(22, 131, 172, 0.16);
	}

	.patient-info {
		grid-column: 2;
		grid-row: 1;
		min-width: 0;
		padding-right: 42rpx;
		margin: 0;
	}

	.info-row {
		justify-content: flex-start;
		gap: 16rpx;
		margin-bottom: 7rpx;
	}

	.patient-name {
		font-size: 30rpx;
		color: #17364c;
	}

	.patient-age,
	.patient-phone,
	.patient-gender {
		font-size: 24rpx;
		color: #607786;
	}

	.last-visit {
		font-size: 22rpx;
		color: #8b9ca6;
	}

	.patient-stats {
		grid-column: 1 / -1;
		margin: 24rpx 0 20rpx;
		padding: 20rpx 12rpx;
		background: #f5fafc;
		border: 1rpx solid #e2eef3;
		border-radius: 18rpx;
	}

	.stat-item + .stat-item {
		border-left: 1rpx solid #dce9ee;
	}

	.stat-value {
		font-size: 31rpx;
		color: #167fa5;
	}

	.stat-label {
		font-size: 21rpx;
		color: #748994;
	}

	.action-buttons {
		grid-column: 1 / -1;
		gap: 14rpx;
	}

	.btn-follow,
	.btn-message {
		height: 68rpx;
		line-height: 68rpx;
		border-radius: 16rpx;
		font-size: 25rpx;
	}

	.btn-follow {
		color: #ffffff;
		background: linear-gradient(135deg, #1684ad, #1b9fc2);
		box-shadow: 0 6rpx 14rpx rgba(22, 132, 173, 0.16);
	}

	.btn-message {
		color: #167fa5;
		background: #eaf7fb;
		border: 1rpx solid #bfe3ee;
	}

	.empty-state {
		padding: 130rpx 0;
	}

	.empty-text {
		color: #81949f;
	}

	

	

	

	

	

	


@import '../../styles/staff-navigation.scss';
</style>

<style scoped>
/* Narrow-screen action spacing and reachable controls. */
.patients-container .btn-follow, .patients-container .btn-message { min-height: 44px; height: auto; display: flex; align-items: center; justify-content: center; padding: 10px 14px; line-height: 1.5; font-size: 14px; min-width: 0; }
.patients-container .patient-actions { gap: 8px; }
</style>

<style scoped>
/* Interactive view touch targets: layout only. */
.card-menu-button { min-width: 44px; min-height: 44px; flex-shrink: 0; }
</style>
