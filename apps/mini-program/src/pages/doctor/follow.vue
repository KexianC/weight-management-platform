<template>
	<view class="follow-container staff-navigation-page">
		<!-- 头部统计区域 -->
		<view class="stats-section">
			<view class="stat-card">
				<text class="stat-number">{{ todayFollows }}</text>
				<text class="stat-label">今日随访</text>
			</view>
			<view class="stat-card">
				<text class="stat-number">{{ pendingFollows }}</text>
				<text class="stat-label">待随访</text>
			</view>
			<view class="stat-card">
				<text class="stat-number">{{ completedFollows }}</text>
				<text class="stat-label">已完成</text>
			</view>
		</view>

		<!-- 筛选区域 -->
		<view class="filter-section">
			<!-- 状态筛选标签 -->
			<view class="status-filter">
				<view 
					v-for="(tab, index) in filterTabs" 
					:key="index"
					:class="['filter-tab', { active: activeTab === index }]"
					@click="switchTab(index)"
				>
					{{ tab.name }}
				</view>
				
				<!-- 展开/收起按钮 -->
				<view class="filter-toggle" role="button" :aria-label="filterExpanded ? '收起高级筛选' : '展开高级筛选'" @click="toggleAdvancedFilter">
					<text class="toggle-text">{{ filterExpanded ? '收起' : '筛选' }}</text>
					<Icon 
						:name="filterExpanded ? 'Arrows/arrow-up-line.svg' : 'Arrows/arrow-down-s-line.svg'" 
						size="20" 
						color="$primary-color" 
						:class="['toggle-icon', { expanded: filterExpanded }]"
					/>
				</view>
			</view>
			
			<!-- 高级筛选 -->
			<view :class="['advanced-filter', { expanded: filterExpanded }]">
				<view class="advanced-filter-content">
					<!-- 随访类型筛选 -->
					<view class="filter-item">
						<text class="filter-label">随访类型</text>
						<picker 
							:value="selectedFollowTypeIndex" 
							:range="followTypeOptions" 
							:range-key="'name'"
							@change="onFollowTypeChange"
							class="filter-picker"
						>
							<view class="picker-content">
								<text class="picker-text">{{ followTypeOptions[selectedFollowTypeIndex].name }}</text>
								<Icon name="Arrows/arrow-down-s-line.svg" size="20" color="$gray-600" />
							</view>
						</picker>
					</view>
					
					<!-- 患者搜索 -->
					<view class="filter-item">
						<text class="filter-label">患者搜索</text>
						<view class="search-input-wrapper">
							<Icon name="System/search-line.svg" size="16" color="$gray-400" class="search-icon" />
							<input 
								v-model="patientSearchKeyword" 
								placeholder="输入患者姓名" 
								class="search-input"
								@input="onPatientSearch"
							/>
							<view 
								v-if="patientSearchKeyword" 
								class="clear-search" 
								role="button"
								aria-label="清空患者搜索"
								@click="clearPatientSearch"
							>
								<Icon name="System/close-line.svg" size="20" color="$gray-400" />
							</view>
						</view>
					</view>
					
					<!-- 清除筛选 -->
					<view class="filter-actions">
						<button class="clear-filters-btn" @click="clearFilters">
							<Icon name="System/refresh-line.svg" size="20" color="$gray-600" />
							<text>重置筛选</text>
						</button>
					</view>
				</view>
			</view>
		</view>

		<!-- 随访列表 -->
		<scroll-view 
			scroll-y 
			class="follow-list"
			@scrolltolower="loadMore"
			refresher-enabled
			:refresher-triggered="refresherTriggered"
			@refresherrefresh="onRefresh"
		>
			<view 
				v-for="follow in filteredFollows" 
				:key="follow.id"
				class="follow-card"
				@click="viewFollowRecord(follow)"
			>
				<view class="follow-header">
					<view class="patient-info">
						<view class="patient-avatar">
							<image v-if="follow.patientAvatar" :src="follow.patientAvatar" class="patient-avatar-image" mode="aspectFill"></image>
							<Icon v-else name="User/user-line.svg" size="20" color="$primary-color" />
						</view>
						<view class="patient-details">
							<text class="patient-name">{{ follow.patientName }}</text>
							<text class="patient-age">{{ follow.patientAge }}岁 {{ follow.patientGender }}</text>
						</view>
					</view>
					<view :class="['follow-status', follow.status]">{{ getStatusText(follow.status) }}</view>
				</view>
				
				<view class="follow-content">
					<view class="follow-type">
						<Icon
							:name="follow.type === 'weight_check' ? 'Others/scales-line.svg' : (follow.type === 'diet_guidance' ? 'Food/bowl-line.svg' : (follow.type === 'exercise_plan' ? 'Others/basketball-line.svg' : (follow.type === 'health_assessment' ? 'Health/heart-pulse-line.svg' : (follow.type === 'medication_review' ? 'Health/capsule-line.svg' : (follow.type === 'offline_visit' ? 'Buildings/hospital-line.svg' : (follow.type === 'phone_visit' ? 'Device/phone-line.svg' : 'Business/calendar-line.svg'))))))"
							size="16"
							color="$primary-color"
						></Icon>
						<text class="type-text">{{ getFollowTypeText(follow.type) }}</text>
					</view>
					
					<view class="follow-time">
						<text class="time-label">计划时间：</text>
						<text class="time-value">{{ follow.scheduledTime }}</text>
					</view>
					
					<view v-if="follow.completedAt" class="follow-time">
					<text class="time-label">完成时间：</text>
					<text class="time-value">{{ follow.completedAt }}</text>
				</view>
					
					<view class="follow-note">
						<text class="note-text">{{ follow.note || '暂无备注' }}</text>
					</view>
				</view>
				
				<!-- 留言预览区域 -->
				<view v-if="follow.lastMessage" class="message-preview">
					<view class="message-content">
						<text class="message-text">{{ follow.lastMessage.content }}</text>
						<view v-if="follow.unreadCount > 0" class="unread-badge">{{ follow.unreadCount }}</view>
					</view>
					<text class="message-time">{{ follow.lastMessage.time }}</text>
				</view>
				
				<view class="follow-actions">
					<button 
						v-if="follow.status === 'pending'"
						class="btn-start" 
						@click.stop="startFollow(follow)"
					>
						开始随访
					</button>
					<button 
						v-if="follow.status === 'completed'"
						class="btn-view" 
						@click.stop="viewFollowRecord(follow)"
					>
						查看记录
					</button>
					<button 
						v-if="follow.status !== 'cancelled' && follow.status !== 'completed'"
						class="btn-cancel" 
						@click.stop="cancelFollow(follow)"
					>
						取消随访
					</button>
					<button 
						class="btn-message" 
						@click.stop="openMessages(follow)"
					>
						<Icon name="Communication/message-line.svg" size="20" color="#ffffff" />
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
			<view v-if="!loading && filteredFollows.length === 0" class="empty-state">
				<Icon name="Business/calendar-line.svg" size="48" color="$gray-300"></Icon>
				<text class="empty-text">暂无随访数据</text>
			</view>
		</scroll-view>
		
		<!-- 添加随访按钮 -->
		<view class="fab-button" role="button" aria-label="添加随访" @click="addFollow">
			<Icon name="System/add-line.svg" size="20" color="#ffffff" />
		</view>
	</view>
	
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
      class="tab-item" role="tab" aria-selected="false" id="staff-nav-patients"
      @click="navigateToPage('/pages/doctor/patients')"
    >
      <view class="tab-icon"><Icon name="User/group-line.svg" size="20" color="$gray-400" /></view>
      <text class="tab-text">{{ staffNavigation.clients }}</text>
    </view>
    <view 
      class="tab-item active" role="tab" aria-selected="true" id="staff-nav-follow"
      @click="navigateToPage('/pages/doctor/follow')"
    >
      <view class="tab-icon"><Icon name="Document/clipboard-line.svg" size="20" color="$primary-color" /></view>
      <text class="tab-text">随访管理</text>
    </view>
  </view>
</template>

<script>
import { staffNavigationFor, staffPageTitle } from '../../utils/staff-navigation.js'
import store from '../../store/index.js'
import { isNutritionist, getAssignedClients } from '../../utils/managed-care.js'
import { getFollowUpList, createFollowUp, updateFollowUp, deleteFollowUp, cancelFollowUp, startFollowUp } from '../../api/follow.js'
import { showToast } from '../../utils/common.js'
import Icon from '../../components/Icon.vue'

export default {
	components: {
		Icon
	},
	data() {
			return {
			userInfo: {},
			activeTab: 0,
			loading: false,
			currentPage: 1,
			pageSize: 20,
			pageLoaded: false, // 标记页面是否已加载
			refresherTriggered: false,
			filterTabs: [
				{ name: '全部', value: 'all' },
				{ name: '待随访', value: 'pending' },
				{ name: '进行中', value: 'ongoing' },
				{ name: '已完成', value: 'completed' }
			],
			follows: [],
			// 筛选相关
			filterExpanded: false,
			selectedFollowTypeIndex: 0,
			patientSearchKeyword: '',
			followTypeOptions: [
				{ name: '全部类型', value: 'all' },
				{ name: '体重检查', value: 'weight_check' },
				{ name: '饮食指导', value: 'diet_guidance' },
				{ name: '运动计划', value: 'exercise_plan' },
				{ name: '健康评估', value: 'health_assessment' },
				{ name: '用药复查', value: 'medication_review' },
				{ name: '线下随访', value: 'offline_visit' },
				{ name: '电话随访', value: 'phone_visit' }
			]
		}
		},
	computed: { staffNavigation() { return staffNavigationFor(this.userInfo) },
		todayFollows() {
			const today = new Date().toISOString().split('T')[0]
			return this.follows.filter(follow => 
				follow.scheduledTime.includes(today)
			).length
		},
		pendingFollows() {
			return this.follows.filter(follow => follow.status === 'pending').length
		},
		completedFollows() {
			return this.follows.filter(follow => follow.status === 'completed').length
		},
		cancelledFollows() {
			return this.follows.filter(follow => follow.status === 'cancelled').length
		},
		filteredFollows() {
			let filtered = this.follows
			
			// 按状态筛选
			const currentTab = this.filterTabs[this.activeTab]
			if (currentTab.value !== 'all') {
				filtered = filtered.filter(follow => follow.status === currentTab.value)
			}
			
			// 按随访类型筛选
			const selectedType = this.followTypeOptions[this.selectedFollowTypeIndex]
			if (selectedType.value !== 'all') {
				filtered = filtered.filter(follow => follow.type === selectedType.value)
			}
			
			// 按患者姓名筛选
			if (this.patientSearchKeyword.trim()) {
				const keyword = this.patientSearchKeyword.trim().toLowerCase()
				filtered = filtered.filter(follow => 
					follow.patientName.toLowerCase().includes(keyword)
				)
			}
			
			return filtered
		}
	},
	onLoad() {
    this.userInfo = store.getUserInfo() || {}
    uni.setNavigationBarTitle({ title: staffPageTitle(this.userInfo, 'follow') })

		// 检查登录状态
		if (!store.isLogin()) {
			uni.reLaunch({
				url: '/pages/login/login'
			})
			return
		}
		
		// 标记页面已加载
		this.pageLoaded = true
		this.initPageData()
	},

	onShow() {
    this.userInfo = store.getUserInfo() || {}
    uni.setNavigationBarTitle({ title: staffPageTitle(this.userInfo, 'follow') })

		// 只有在页面已经加载过且不在加载中的情况下才刷新数据
		if (this.pageLoaded && !this.loading) {
			// 防抖处理，避免频繁刷新
			clearTimeout(this.refreshTimer)
			this.refreshTimer = setTimeout(() => {
				this.loadFollows(true)
			}, 500)
		}
		
		// 检查是否有从通知跳转的followId
		this.checkFollowIdFromStorage()
	},

	methods: {
		// 初始化页面数据
		async initPageData() {
			try {
				await Promise.all([
					this.loadFollows(),
					this.checkFollowIdFromStorage()
				])
			} catch (error) {
				console.error('初始化页面数据失败:', error)
			}
		},

		// 加载随访数据
		async loadFollows(refresh = false) {
			// 防止重复加载
			if (this.loading) return
			
			if (refresh) {
				this.currentPage = 1
				this.follows = []
			}
			
			try {
				this.loading = true
				
				const userInfo = store.getUserInfo()
				if (!userInfo || !userInfo.userId) {
					showToast('用户信息获取失败')
					return
				}
				
				const params = {
					doctorId: userInfo.userId,
					page: this.currentPage,
					limit: this.pageSize
				}
				
				const result = await getFollowUpList(params)
				if (result.code === 200) {
					let followUps = result.data.followUps || []
					if (isNutritionist(userInfo)) {
						const assigned = new Map((await getAssignedClients()).map((patient) => [patient.id, patient]))
						followUps = followUps.filter((follow) => assigned.has(follow.patientId)).map((follow) => ({ ...follow, patientInfo: { name: assigned.get(follow.patientId).name } }))
					}
					
					// 处理随访数据格式
					const processedFollows = followUps.map(follow => ({
						id: follow.followId,
						patientId: follow.patientId,
						patientName: follow.patientInfo?.name || '未知患者',
						patientAge: follow.patientInfo?.age || 0,
						patientGender: follow.patientInfo?.gender || '未知',
						patientAvatar: follow.patientInfo?.avatar || '',
						type: follow.followType,
						status: follow.status,
						scheduledTime: this.formatDateTime(follow.scheduledTime),
						completedAt: follow.completedAt ? this.formatDateTime(follow.completedAt) : '',
						note: follow.note || '',
						lastMessage: follow.lastMessage || null,
						unreadCount: follow.unreadCount || 0
					}))
					
					if (refresh) {
						this.follows = processedFollows
					} else {
						// 合并数据并去重
						const allFollows = this.follows.concat(processedFollows)
						const uniqueFollows = allFollows.filter((follow, index, self) => 
							index === self.findIndex(f => f.id === follow.id)
						)
						this.follows = uniqueFollows
					}
				} else {
					showToast(result.message || '获取随访列表失败')
				}
			} catch (error) {
				console.error('加载随访列表失败:', error)
				showToast('网络错误，请重试')
			} finally {
				this.loading = false
			}
		},
		
		// 切换标签
		switchTab(index) {
			if (this.activeTab === index) return // 避免重复切换
			
			this.activeTab = index
		},
		
		// 切换高级筛选展开状态
		toggleAdvancedFilter() {
			this.filterExpanded = !this.filterExpanded
		},
		
		// 随访类型筛选变更
		onFollowTypeChange(e) {
			this.selectedFollowTypeIndex = e.detail.value
		},
		
		// 患者搜索
		onPatientSearch(e) {
			// 实时搜索，无需额外处理
			// patientSearchKeyword 已通过 v-model 绑定
		},
		
		// 清除患者搜索
		clearPatientSearch() {
			this.patientSearchKeyword = ''
		},
		
		// 清除所有筛选
		clearFilters() {
			this.activeTab = 0
			this.selectedFollowTypeIndex = 0
			this.patientSearchKeyword = ''
			this.filterExpanded = false
			uni.showToast({
				title: '筛选已重置',
				icon: 'success',
				duration: 1500
			})
		},
		
		// 获取状态文本
		getStatusText(status) {
			const statusMap = {
				pending: '待随访',
				ongoing: '进行中',
				completed: '已完成',
				cancelled: '已取消'
			}
			return statusMap[status] || status
		},
		
		// 获取随访类型文本
		getFollowTypeText(type) {
			const typeMap = {
				weight_check: '体重检查',
				diet_guidance: '饮食指导',
				exercise_plan: '运动计划',
				health_assessment: '健康评估',
				medication_review: '用药复查',
				offline_visit: '线下随访',
				phone_visit: '电话随访'
			}
			return typeMap[type] || type
		},
		
		// 获取随访类型图标
		getFollowIcon(type) {
			const iconMap = {
				weight_check: 'System/loop-left-line.svg',
				diet_guidance: 'Health/heart-line.svg',
				exercise_plan: 'Others/lightbulb-line.svg',
				health_assessment: 'System/check-line.svg',
				medication_review: 'System/apps-line.svg',
				offline_visit: 'Buildings/home-line.svg',
				phone_visit: 'Device/phone-line.svg'
			}
			return iconMap[type] || 'Business/calendar-line.svg'
		},
		

		
		// 开始随访
		async startFollow(follow) {
			console.log('开始随访，传递的参数:', follow)
			uni.showModal({
				title: '开始随访',
				content: '确定要开始这次随访吗？开始后患者将收到通知。',
				success: async (res) => {
					if (res.confirm) {
						try {
							this.loading = true
							// 确保传递正确的followId
							const followId = follow.id || follow.followId
							console.log('调用startFollowUp，followId:', followId)
							const result = await this.startFollowUpRequest(followId)
							console.log('startFollowUp返回结果:', result)
							if (result.code === 200) {
								showToast(result.message || '随访已开始', 'success')
								this.loadFollows(true) // 刷新列表
							} else {
								showToast(result.message || '开始失败')
							}
						} catch (error) {
							console.error('开始随访失败:', error)
							showToast('网络错误，请重试')
						} finally {
							this.loading = false
						}
					}
				}
			})
		},
		
		// 检查从存储中获取的followId
		checkFollowIdFromStorage() {
			const followId = uni.getStorageSync('followId')
			if (followId) {
				// 清除存储的followId
				uni.removeStorageSync('followId')
				
				// 延迟执行，确保随访列表已加载
				setTimeout(() => {
					this.locateFollowById(followId)
				}, 1000)
			}
		},
		
		// 根据followId定位随访任务
		locateFollowById(followId) {
			const follow = this.follows.find(f => f.id === followId)
			if (follow) {
				// 如果找到对应的随访任务，自动打开详情
				this.viewFollowRecord(follow)
				uni.showToast({
					title: '已定位到相关随访',
					icon: 'success'
				})
			} else {
				// 如果没找到，可能需要重新加载数据
				uni.showToast({
					title: '未找到相关随访',
					icon: 'none'
				})
			}
		},
		
		// 开始随访请求
		async startFollowUpRequest(followId) {
			try {
				const result = await startFollowUp(followId)
				return result
			} catch (error) {
				console.error('开始随访失败:', error)
				throw error
			}
		},
		
		// 查看随访记录
		viewFollowRecord(follow) {
			uni.navigateTo({
				url: `/pages/doctor/follow-record?id=${follow.id}`
			})
		},
		
		// 取消随访
		async cancelFollow(follow) {
			uni.showModal({
				title: '取消随访',
				content: '确定要取消这次随访吗？取消后无法恢复。',
				success: async (res) => {
					if (res.confirm) {
						try {
							this.loading = true
							const result = await this.cancelFollowUp(follow.id)
							if (result.code === 200) {
								showToast('随访已取消', 'success')
								this.loadFollows(true) // 刷新列表
							} else {
								showToast(result.message || '取消失败')
							}
						} catch (error) {
							console.error('取消随访失败:', error)
							showToast('网络错误，请重试')
						} finally {
							this.loading = false
						}
					}
				}
			})
		},
		
		// 打开消息页面
		openMessages(follow) {
			uni.navigateTo({
				url: `/pages/common/messages?otherUserId=${follow.patientId}&otherUserName=${encodeURIComponent(follow.patientName)}&relatedId=${follow.id}&relatedType=follow_up`
			})
		},
		
		// 添加随访
		addFollow() {
			uni.navigateTo({
				url: '/pages/doctor/follow-add'
			})
		},
		
		// 格式化日期时间
		formatDateTime(dateTime) {
			const date = new Date(dateTime)
			if (!dateTime || !Number.isFinite(date.getTime())) return '时间未记录'
			return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
		},

		// 加载更多
		loadMore() {
			if (!this.loading) {
				this.currentPage++
				this.loadFollows()
			}
		},
		
		// 下拉刷新
		async onRefresh() {
			this.refresherTriggered = true
			try {
				await this.loadFollows(true)
			} finally {
				this.refresherTriggered = false
			}
		},
		
		// 创建新随访
		async createNewFollow(followData) {
			try {
				this.loading = true
				
				const result = await createFollowUp(followData)
				if (result.code === 200) {
					showToast('随访创建成功', 'success')
					this.loadFollows(true) // 刷新列表
				} else {
					showToast(result.message || '创建失败')
				}
			} catch (error) {
				console.error('创建随访失败:', error)
				showToast('网络错误，请重试')
			} finally {
				this.loading = false
			}
		},
		
		// 取消随访
		async cancelFollowUp(followId) {
			try {
				const result = await cancelFollowUp(followId)
				return result
			} catch (error) {
				console.error('取消随访失败:', error)
				throw error
			}
		},
		
		// 更新随访
		async updateFollow(followId, updateData) {
			try {
				this.loading = true
				
				const result = await updateFollowUp(followId, updateData)
				if (result.code === 200) {
					showToast('随访更新成功', 'success')
					this.loadFollows(true) // 刷新列表
				} else {
					showToast(result.message || '更新失败')
				}
			} catch (error) {
				console.error('更新随访失败:', error)
				showToast('网络错误，请重试')
			} finally {
				this.loading = false
			}
		},
		
		// 删除随访
		async deleteFollow(followId) {
			try {
				this.loading = true
				
				const result = await deleteFollowUp(followId)
				if (result.code === 200) {
					showToast('随访删除成功', 'success')
					this.loadFollows(true) // 刷新列表
				} else {
					showToast(result.message || '删除失败')
				}
			} catch (error) {
				console.error('删除随访失败:', error)
				showToast('网络错误，请重试')
			} finally {
				this.loading = false
			}
		},
		
		// 导航到指定页面
		navigateToPage(url) {
			if (url === '/pages/doctor/follow') {
				// 当前页面，不需要跳转
				return
			}
			// 使用redirectTo避免页面栈累积
			uni.redirectTo({
				url: url
			})
		}
	}
}
</script>

<style lang="scss" scoped>
.follow-container {
	background-color: $gray-50;
	min-height: 100vh;
	padding-bottom: 140rpx;
}

.stats-section {
	display: flex;
	padding: $spacing-md;
	gap: $spacing-sm;
}

.stat-card {
	flex: 1;
	@include card-base;
	padding: 25rpx;
	text-align: center;
}

.stat-number {
	display: block;
	font-size: 36rpx;
	font-weight: bold;
	color: #2E86AB;
	margin-bottom: 8rpx;
}

.stat-label {
	font-size: 24rpx;
	color: #666;
}

.filter-section {
	@include card-base;
	margin: $spacing-md;
	padding: 0;
	overflow: hidden;
}

.status-filter {
	display: flex;
	align-items: center;
	padding: $spacing-md;
	gap: $spacing-sm;
	background: $white;
}

.filter-tab {
	padding: $spacing-sm $spacing-md;
	border-radius: $border-radius-xl;
	background: $gray-100;
	color: $gray-600;
	font-size: $font-size-sm;
	font-weight: $font-weight-medium;
	transition: all 0.3s ease;
	border: 2rpx solid transparent;
	white-space: nowrap;
	flex-shrink: 0;
	
	&.active {
		background: $primary-color;
		color: $white;
		box-shadow: $shadow-primary;
	}
	
	&:active {
		transform: scale(0.98);
	}
}

.filter-toggle {
	display: flex;
	align-items: center;
	gap: $spacing-xs;
	margin-left: auto;
	padding: $spacing-sm $spacing-md;
	border-radius: $border-radius-md;
	background: rgba($primary-color, 0.1);
	transition: all 0.3s ease;
	min-height: 88rpx;
	box-sizing: border-box;
	
	&:active {
		transform: scale(0.98);
		background: rgba($primary-color, 0.15);
	}
}

.toggle-text {
	font-size: $font-size-sm;
	color: $primary-color;
	font-weight: $font-weight-medium;
}

.toggle-icon {
	transition: transform 0.3s ease;
	
	&.expanded {
		transform: rotate(180deg);
	}
}

/* 高级筛选样式 */
.advanced-filter {
	max-height: 0;
	overflow: hidden;
	transition: max-height 0.3s ease;
	background: $gray-50;
	border-top: 1rpx solid $gray-200;
	
	&.expanded {
		max-height: 500rpx;
	}
}

.advanced-filter-content {
	padding: $spacing-lg;
	animation: fadeIn 0.3s ease-out;
}

.filter-item {
	margin-bottom: $spacing-lg;
	
	&:last-child {
		margin-bottom: 0;
	}
}

.filter-label {
	font-size: $font-size-md;
	color: $gray-700;
	font-weight: $font-weight-medium;
	margin-bottom: $spacing-sm;
	display: block;
}

.filter-picker {
	width: 100%;
}

.picker-content {
	@include input-base;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: $spacing-md;
	height: 88rpx;
	box-sizing: border-box;
}

.picker-text {
	flex: 1;
	font-size: $font-size-md;
	color: $gray-800;
}

.search-input-wrapper {
	@include input-base;
	display: flex;
	align-items: center;
	padding: $spacing-md;
	height: 88rpx;
	box-sizing: border-box;
	position: relative;
}

.search-icon {
	margin-right: $spacing-sm;
	flex-shrink: 0;
}

.search-input {
	flex: 1;
	font-size: $font-size-md;
	border: none;
	outline: none;
	background: transparent;
	color: $gray-800;
	
	&::placeholder {
		color: $gray-400;
	}
}

.clear-search {
	margin-left: $spacing-sm;
	width: 88rpx;
	height: 88rpx;
	min-width: 88rpx;
	padding: 0;
	border-radius: $border-radius-sm;
	transition: all 0.3s ease;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	
	&:active {
		background: $gray-200;
		transform: scale(0.95);
	}
}

.filter-actions {
	display: flex;
	justify-content: center;
	margin-top: $spacing-md;
}

.clear-filters-btn {
	@include btn-secondary;
	display: flex;
	align-items: center;
	gap: $spacing-xs;
	padding: $spacing-sm $spacing-lg;
	font-size: $font-size-sm;
	height: 88rpx;
	box-sizing: border-box;
	
	text {
		color: inherit;
	}
}

.follow-list {
	height: calc(100vh - 300rpx);
	padding: 20rpx;
}

.follow-card {
	background: white;
	border-radius: 15rpx;
	padding: 25rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 2rpx 10rpx rgba(0,0,0,0.1);
}

.follow-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 20rpx;
}

.patient-info {
	display: flex;
	align-items: center;
}

.patient-avatar {
	width: 60rpx;
	height: 60rpx;
	border-radius: 50%;
	margin-right: 15rpx;
	background: #f0f0f0;
	display: flex;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	box-sizing: border-box;
}

.patient-avatar-image {
	width: 100%;
	height: 100%;
	display: block;
}

.patient-details {
	display: flex;
	flex-direction: column;
}

.patient-name {
	font-size: 30rpx;
	font-weight: bold;
	color: #333;
	margin-bottom: 5rpx;
}

.patient-age {
	font-size: 24rpx;
	color: #666;
}

.follow-status {
	padding: 8rpx 16rpx;
	border-radius: 15rpx;
	font-size: 22rpx;
	color: white;
}

.follow-status.pending {
	background: #faad14;
}

.follow-status.ongoing {
	background: #1890ff;
}

.follow-status.completed {
	background: #52c41a;
}

.follow-status.cancelled {
	background: #ff4d4f;
}

.follow-content {
	margin-bottom: 20rpx;
}

.follow-type {
	display: flex;
	align-items: center;
	margin-bottom: 15rpx;
}

.type-text {
	margin-left: 10rpx;
	font-size: 28rpx;
	font-weight: bold;
	color: #2E86AB;
}

.follow-time {
	display: flex;
	margin-bottom: 10rpx;
}

.time-label {
	font-size: 26rpx;
	color: #666;
	width: 150rpx;
}

.time-value {
	font-size: 26rpx;
	color: #333;
}

.follow-note {
	margin-top: 15rpx;
	padding: 15rpx;
	background: #f8f9fa;
	border-radius: 8rpx;
}

.note-text {
	font-size: 26rpx;
	color: #666;
	line-height: 1.5;
}

.follow-actions {
	display: flex;
	gap: 15rpx;
}

.btn-start,
.btn-view,
.btn-cancel {
	flex: 1;
	height: 60rpx;
	border-radius: 8rpx;
	font-size: 26rpx;
	border: none;
}

.btn-start {
	background: $primary-color;
	color: $white;
}

.btn-view {
	background: $success-color;
	color: $white;
}

.btn-cancel {
	background: #ff4757;
	color: white;
}

.btn-message {
	flex: 1;
	height: 60rpx;
	border-radius: 8rpx;
	font-size: 26rpx;
	border: none;
	background: #f0f0f0;
	color: #666;
}

.message-preview {
	margin: 15rpx 0;
	padding: 15rpx;
	background: #f8f9fa;
	border-radius: 8rpx;
	border-left: 3rpx solid #2E86AB;
}

.message-content {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8rpx;
}

.message-text {
	font-size: 26rpx;
	color: #333;
	line-height: 1.4;
	flex: 1;
}

.unread-badge {
	background: #ff4d4f;
	color: white;
	font-size: 20rpx;
	padding: 0;
	border-radius: 50%;
	min-width: 32rpx;
	width: 32rpx;
	height: 32rpx;
	line-height: 32rpx;
	text-align: center;
	margin-left: 10rpx;
	display: flex;
	align-items: center;
	justify-content: center;
}

.message-time {
	font-size: 22rpx;
	color: #999;
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

.fab-button {
	position: fixed;
	bottom: 180rpx;
	right: 30rpx;
	width: 100rpx;
	height: 100rpx;
	background: $primary-color;
	border-radius: $border-radius-full;
	display: flex;
	align-items: center;
	justify-content: center;
	box-shadow: $shadow-lg;
	z-index: 999;
}

.fab-icon {
	color: white;
	font-size: 48rpx;
	font-weight: bold;
	line-height: 1;
}

/* 医生端底部导航样式 */












/* 2026 clinical visual refresh */
.follow-container {
	padding-bottom: calc(148rpx + env(safe-area-inset-bottom));
	background:
		radial-gradient(circle at 88% 1%, rgba(102, 203, 229, 0.18), transparent 300rpx),
		linear-gradient(180deg, #eaf7fc 0, #f7fbfd 340rpx, #f5f9fb 100%);
	color: #15324a;
}

.stats-section {
	gap: 16rpx;
	padding: 24rpx;
}

.stat-card {
	min-height: 118rpx;
	padding: 22rpx 12rpx;
	background: rgba(255, 255, 255, 0.96);
	border: 1rpx solid #d8ecf3;
	border-radius: 22rpx;
	box-shadow: 0 9rpx 26rpx rgba(31, 119, 151, 0.07);
}

.stat-number {
	font-size: 38rpx;
	font-weight: 700;
	color: #1688b1;
}

.stat-label {
	font-size: 23rpx;
	color: #687e8c;
}

.filter-section {
	margin: 0 24rpx 22rpx;
	background: #ffffff;
	border: 1rpx solid #dcecf2;
	border-radius: 24rpx;
	box-shadow: 0 9rpx 26rpx rgba(31, 119, 151, 0.06);
}

.status-filter {
	gap: 10rpx;
	padding: 18rpx;
	background: transparent;
	overflow-x: auto;
}

.filter-tab {
	padding: 10rpx 18rpx;
	font-size: 24rpx;
	color: #607786;
	background: #f3f8fa;
	border: 1rpx solid #dbe9ee;
	border-radius: 999rpx;
}

.filter-tab.active {
	color: #ffffff;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	border-color: transparent;
	box-shadow: 0 6rpx 16rpx rgba(22, 132, 173, 0.18);
}

.filter-toggle {
	padding: 10rpx 16rpx;
	background: #eaf7fb;
	border-radius: 999rpx;
}

.toggle-text {
	font-size: 23rpx;
	color: #167fa5;
}

.advanced-filter {
	background: #f6fafc;
	border-top-color: #e0edf2;
}

.advanced-filter-content {
	padding: 24rpx;
}

.filter-label {
	color: #526d7d;
}

.picker-content,
.search-input-wrapper {
	height: 88rpx;
	background: #ffffff;
	border: 1rpx solid #d8e9ef;
	border-radius: 16rpx;
}

.clear-filters-btn {
	color: #536d7c;
	background: #ffffff;
	border: 1rpx solid #d5e7ee;
	border-radius: 999rpx;
}

.follow-list {
	height: calc(100vh - 330rpx);
	padding: 0 24rpx 24rpx;
	box-sizing: border-box;
}

.follow-card {
	padding: 26rpx;
	margin-bottom: 20rpx;
	background: #ffffff;
	border: 1rpx solid #dcecf2;
	border-radius: 24rpx;
	box-shadow: 0 10rpx 28rpx rgba(31, 119, 151, 0.07);
}

.follow-header {
	margin-bottom: 20rpx;
	padding-bottom: 18rpx;
	border-bottom: 1rpx solid #e8f0f3;
}

.patient-avatar {
	width: 68rpx;
	height: 68rpx;
	margin-right: 16rpx;
	border: 2rpx solid #d5ebf2;
	background: #edf8fb;
}

.patient-name {
	font-size: 29rpx;
	color: #17364c;
}

.patient-age {
	color: #718692;
}

.follow-status {
	padding: 7rpx 16rpx;
	border-radius: 999rpx;
	font-weight: 500;
}

.follow-status.pending {
	color: #aa671f;
	background: #fff3e5;
}

.follow-status.ongoing {
	color: #167fa5;
	background: #e7f6fb;
}

.follow-status.completed {
	color: #26895a;
	background: #e7f7ef;
}

.follow-status.cancelled {
	color: #b55558;
	background: #fdecee;
}

.follow-content {
	margin-bottom: 18rpx;
}

.type-text {
	font-size: 27rpx;
	color: #167fa5;
}

.time-label {
	color: #758995;
}

.time-value {
	color: #29485b;
}

.follow-note,
.message-preview {
	padding: 18rpx;
	background: #f6fafc;
	border: 1rpx solid #e2eef2;
	border-radius: 16rpx;
}

.message-preview {
	border-left: 5rpx solid #39a7c5;
}

.note-text,
.message-text {
	color: #5e7482;
}

.follow-actions {
	gap: 12rpx;
}

.btn-start,
.btn-view,
.btn-cancel,
.btn-message {
	height: 88rpx;
	line-height: 88rpx;
	border-radius: 15rpx;
	font-size: 24rpx;
}

.btn-start,
.btn-message {
	color: #ffffff;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	box-shadow: 0 6rpx 14rpx rgba(22, 132, 173, 0.14);
}

.btn-view {
	color: #257d55;
	background: #e7f7ef;
	border: 1rpx solid #bee6cf;
}

.btn-cancel {
	color: #b55f2b;
	background: #fff4ea;
	border: 1rpx solid #f2d2b8;
}

.fab-button {
	bottom: calc(144rpx + env(safe-area-inset-bottom));
	right: 28rpx;
	width: 94rpx;
	height: 94rpx;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	border: 6rpx solid rgba(255, 255, 255, 0.92);
	box-shadow: 0 12rpx 30rpx rgba(20, 117, 153, 0.25);
}












@import '../../styles/staff-navigation.scss';
</style>

<style scoped>
/* Final touch target audit: layout only. */
.clear-filters-btn { min-height: 44px; height: auto; display: flex; align-items: center; justify-content: center; line-height: 1.5; padding: 10px 14px; }
</style>

<style scoped>
/* Interactive view touch targets: layout only. */
.filter-toggle, .filter-tab { min-height: 44px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }
.fab-button { min-width: 44px; min-height: 44px; }
</style>
