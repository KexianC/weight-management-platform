<template>
	<view class="container patient-home patient-theme">
    <view class="home-hero" :style="{ paddingTop: navigationTopInset + 'px' }">
      <view class="brand-row" :style="{ paddingRight: navigationRightInset + 'px' }">
        <view class="brand-lockup">
          <image class="brand-logo" src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" mode="aspectFit"></image>
          <text class="brand-name">MedTalent健康数字助手</text>
        </view>
      </view>
      <view class="greeting-row">
        <text class="greeting-date">{{ formattedDate }}</text>
        <text class="greeting-title">把健康，记录下来</text>
      </view>
    </view>
    <view class="section-block task-section">
      <view class="section-heading-row">
        <text class="section-heading">今日任务</text>
        <view class="section-link" role="button" @click="handleQuickAction({ action: 'record' })"><text>每日记录</text><Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-600" /></view>
      </view>
      <view class="task-card">
        <view class="task-row">
          <view class="task-icon-box"><Icon name="Document/clipboard-line.svg" size="32" color="$patient-primary" /></view>
          <view class="task-copy"><text class="task-title">记录今日体重</text><text class="task-desc">{{ todayWeightRecorded ? '今日已记录，可查看或修改' : '每天一次，关注身体变化' }}</text></view>
          <button class="task-cta" :class="{ completed: todayWeightRecorded }" @click="handleQuickAction({ action: 'weight' })">{{ todayWeightRecorded ? '已完成' : '去记录' }}</button>
        </view>
        <view class="task-row">
          <view class="task-icon-box cyan"><Icon name="Food/restaurant-line.svg" size="32" color="$patient-accent" /></view>
          <view class="task-copy"><text class="task-title">记录今日饮食</text><text class="task-desc">{{ mealProgressText }} · {{ mealDetailText }}</text></view>
          <button class="task-cta secondary" @click="handleQuickAction({ action: 'diet' })">去记录</button>
        </view>
      </view>
    </view>
    <view v-if="yuanqizhanLoading || yuanqizhanError || yuanqizhanEntries.length" class="section-block yuanqizhan-section">
      <text class="section-heading">元气盏活动</text>
      <view v-if="yuanqizhanLoading" class="clinical-card yuanqizhan-feedback"><text>正在刷新活动…</text></view>
      <view v-else-if="yuanqizhanError" class="clinical-card yuanqizhan-feedback" role="alert">
        <text>{{ yuanqizhanError }}</text>
        <button class="task-cta yuanqizhan-retry" :disabled="yuanqizhanLoading" @tap="loadYuanqizhanEntry">重试加载活动</button>
      </view>
      <view v-for="activity in yuanqizhanEntries" :key="activity.id" class="report-shortcut clinical-card yuanqizhan-entry">
        <view class="shortcut-icon"><Icon name="Document/clipboard-line.svg" size="28" color="$patient-primary" /></view>
        <view class="task-copy"><text class="task-title">{{ activity.title }}</text><text class="task-desc">{{ activity.canWrite ? '第' + activity.dayNumber + '天 · ' + activityStatus(activity.todayStatus) : '历史记录只读' }}</text></view>
        <button class="task-cta" :class="{ completed: activity.canWrite && activity.todayStatus === 'SUBMITTED', secondary: !activity.canWrite }" @tap="openYuanqizhan(activity.id)">{{ activity.canWrite ? (activity.todayStatus === 'SUBMITTED' ? '已完成' : '去打卡') : '查看历史' }}</button>
      </view>
    </view>
    <view class="record-shortcuts">
      <text class="section-heading">数据记录</text>
      <view class="shortcut-grid">
        <view class="shortcut-item" role="button" @click="handleQuickAction({ action: 'diet' })"><view class="shortcut-icon"><Icon name="Document/file-text-line.svg" size="24" color="$patient-primary" /></view><text>饮食记录</text><Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-600" /></view>
        <view class="shortcut-item" role="button" @click="handleQuickAction({ action: 'weight' })"><view class="shortcut-icon cyan"><Icon name="Document/clipboard-line.svg" size="24" color="$patient-accent" /></view><text>体重记录</text><Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-600" /></view>
      </view>
      <view class="report-shortcut" role="button" @click="handleQuickAction({ action: 'report' })">
        <view class="shortcut-icon"><Icon name="Document/file-text-line.svg" size="32" color="$patient-primary" /></view>
        <view class="task-copy"><text class="task-title">健康报告</text><text class="task-desc">查看阶段记录与变化</text></view><Icon name="Arrows/arrow-right-s-line.svg" size="20" color="$gray-600" />
      </view>
    </view>
		<view class="weight-primary-card clinical-card">
			<view class="card-heading">
				<view class="heading-main">
					<text class="heading-title">当前体重</text>
					<Icon name="Editor/info-i.svg" size="14" color="$gray-400" />
				</view>
				<text class="heading-meta">近7天趋势</text>
			</view>
			<view class="weight-overview-row">
				<view class="weight-reading">
					<view class="weight-number-line">
						<text class="weight-number">{{ displayWeight }}</text>
						<text class="weight-unit">kg</text>
					</view>
					<text class="weight-change" :class="latestWeightChange > 0 ? 'up' : 'down'">
						{{ latestWeightChangeLabel }}
					</text>
				</view>
				<view class="mini-trend" :class="{ empty: homeWeightTrend.length < 2 }">
					<view class="mini-baseline"></view>
					<view class="mini-point" v-for="(point, index) in miniTrendPoints" :key="index" :style="{ left: point.left + '%', bottom: point.bottom + '%' }"></view>
				</view>
			</view>
			<view class="metric-strip">
				<view class="metric-item">
					<text class="metric-label">BMI</text>
					<text class="metric-value">{{ bmiValue || '--' }}</text>
				</view>
				<view class="metric-divider"></view>
				<view class="metric-item" @tap="showTargetWeightModal">
					<text class="metric-label">目标体重</text>
					<text class="metric-value">{{ targetWeight ? `${targetWeight} kg` : '去设置' }}</text>
				</view>
				<view class="metric-divider"></view>
				<view class="metric-item">
					<text class="metric-label">目标进度</text>
					<text class="metric-value">{{ weightProgress == null ? '待记录' : weightProgress + '%' }}</text>
				</view>
			</view>
			<view class="primary-record-button" @click="handleQuickAction({ action: 'record' })">
				<Icon name="Design/edit-line.svg" size="18" color="#ffffff" />
				<text>记录今日体重</text>
			</view>
			<text class="record-helper">每日记录，让变化看得见</text>
		</view>

    <view class="care-reminder clinical-card" role="button" @click="handleCareReminder"><view class="task-icon-box cyan"><Icon name="Health/stethoscope-line.svg" size="24" color="$patient-accent" /></view><view class="task-copy"><text class="task-title">医生/营养师提醒</text><text class="task-desc">{{ careReminderText }}</text></view><Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-600" /></view>
		<view class="trend-card clinical-card">
			<view class="card-heading">
				<view class="heading-main">
					<Icon name="Business/line-chart-line.svg" size="18" color="$patient-primary" />
					<text class="heading-title">体重趋势（近7天）</text>
				</view>
				<text class="heading-meta">单位：kg</text>
			</view>
			<view class="home-chart-empty" v-if="homeWeightTrend.length === 0">
				<Icon name="Business/line-chart-line.svg" size="32" color="$gray-300" />
				<text>暂无体重数据，完成首次记录后即可查看趋势</text>
			</view>
			<canvas v-else canvas-id="homeWeightChart" id="homeWeightChart" class="home-weight-chart"></canvas>
		</view>

		<view class="health-note clinical-card">
			<view class="health-note-icon"><Icon name="Health/heart-pulse-line.svg" size="20" color="$patient-primary" /></view>
			<view class="health-note-copy">
				<text class="health-note-title">你的健康，我们一起守护</text>
				<text class="health-note-text">所有数据仅用于健康管理，不用于诊断。如有不适，请及时就医。</text>
			</view>
		</view>

		<view class="daily-tip clinical-card">
			<view class="daily-tip-icon"><Icon name="Food/cup-line.svg" size="20" color="$patient-primary" /></view>
			<view class="daily-tip-copy">
				<text class="daily-tip-title">饮水小贴士</text>
				<text class="daily-tip-text">建议今日饮水1500–1700ml，少量多次。</text>
			</view>
		</view>

		<view class="quick-actions section-block">
			<view class="section-heading-row">
				<view class="section-heading-main">
					<Icon name="Others/lightbulb-line.svg" size="18" color="$patient-primary" />
					<text class="section-heading">快捷服务</text>
				</view>
			</view>
			<view class="action-grid clinical-card">
				<view class="action-item" v-for="(action, index) in patientActions" :key="index" @click="handleQuickAction(action)">
					<view class="action-icon"><Icon :name="action.icon" size="20" color="$patient-primary" /></view>
					<text class="action-text">{{ action.text }}</text>
				</view>
			</view>
		</view>

		<view class="section-block recent-notifications" v-if="visibleNotifications.length > 0">
			<view class="section-heading-row">
				<view class="section-heading-main">
					<Icon name="System/notification-badge-line.svg" size="18" color="$patient-primary" />
					<text class="section-heading">最近通知</text>
				</view>
				<view class="notification-badge" v-if="unreadCount > 0"><text class="badge-text">{{ unreadCount }}</text></view>
			</view>
			<view class="task-card clinical-card">
				<view class="notification-wrapper" v-for="(item, index) in visibleNotifications" :key="item.id || `${item.title}-${index}`">
					<view class="task-row live-notification" @click.stop="handleNotification(item, index)" @touchstart="onTouchStart($event, index)" @touchmove="onTouchMove($event, index)" @touchend="onTouchEnd($event, index)" :style="{ transform: `translateX(${item.translateX || 0}px)` }">
						<view class="task-icon-box"><Icon :name="notificationIcon(item.type)" size="20" color="$patient-primary" /></view>
						<view class="task-copy">
							<view class="task-title-row"><text class="task-title">{{ item.title }}</text><view class="unread-dot" v-if="!item.read"></view></view>
							<text class="task-desc">{{ item.desc }}</text>
						</view>
						<text class="notification-time">{{ item.time }}</text>
					</view>
					<view class="delete-action" @click.stop="confirmDeleteNotification(item, index)"><text class="delete-text">删除</text></view>
				</view>
			</view>
		</view>

	</view>
		
		<!-- 目标体重设置弹窗 -->
		<view class="target-weight-overlay" v-if="showTargetModal" @tap="closeTargetWeightModal">
			<view class="target-weight-modal" @tap.stop>
				<view class="modal-header">
					<text class="modal-title">设置目标体重</text>
					<view class="close-btn" @tap="closeTargetWeightModal">
						<Icon name="System/close-line.svg" size="18" color="$gray-600" />
					</view>
				</view>
				<view class="modal-content">
					<view class="input-group">
						<text class="input-label">目标体重 (kg)</text>
						<input 
							class="weight-input" 
							v-model="newTargetWeight" 
							type="digit" 
							placeholder="请输入目标体重"
							maxlength="5"
						/>
					</view>
					<view class="tips">
						<view class="tips-text"><Icon name="Others/lightbulb-line.svg" size="16" color="$warning-color" /><text>建议设置合理的目标体重，有助于制定科学的减重计划</text></view>
					</view>
				</view>
				<view class="modal-footer">
					<button class="cancel-btn" @tap="closeTargetWeightModal">取消</button>
					<button class="confirm-btn" @tap="saveTargetWeight" :disabled="!newTargetWeight">保存</button>
				</view>
			</view>
		</view>
		
		<!-- 医患绑定提醒弹窗 -->
		<view class="binding-overlay" v-if="showBindingModal" @tap="closeBindingModal">
			<view class="binding-modal" @tap.stop>
				<view class="modal-header">
					<view class="modal-icon"><Icon name="User/handshake-line.svg" size="36" color="#FFFFFF" /></view>
					<text class="modal-title">医生/营养师绑定提醒</text>
				</view>
				<view class="modal-content">
					<text class="modal-desc">您还没有绑定医生/营养师，绑定后可以获得专业的健康指导和个性化的体重管理方案。</text>
					<view class="benefits">
						<view class="benefit-item">
							<Icon name="Health/stethoscope-line.svg" size="20" color="$patient-primary" />
							<text class="benefit-text">专业医生/营养师指导</text>
						</view>
						<view class="benefit-item">
							<Icon name="Document/clipboard-line.svg" size="20" color="$patient-primary" />
							<text class="benefit-text">个性化方案</text>
						</view>
						<view class="benefit-item">
							<Icon name="Business/line-chart-line.svg" size="20" color="$patient-primary" />
							<text class="benefit-text">实时健康监测</text>
						</view>
					</view>
				</view>
				<view class="modal-footer">
					<button class="later-btn" @tap="closeBindingModal">稍后绑定</button>
					<button class="bind-btn" @tap="goToBinding">立即绑定</button>
				</view>
			</view>
		</view>
	</template>

<script>
	import Icon from '../../components/Icon.vue'
	import store from '../../store/index.js'
	import { getHealthRecords, getHealthReports, getUnreadMessageCount, setTargetWeight, getNotifications, getUnreadNotificationCount, markNotificationAsRead, getPatientDoctors, deleteNotification } from '../../utils/api.js'
	import { showToast } from '../../utils/common.js'
	import { getCustomNavigationLayout } from '../../utils/navigation.js'
	import { getMyActivities, patientActivitySession } from '../../utils/yuanqizhan.js'
	import { statusLabel } from '../../utils/yuanqizhan-model.js'
	
	export default {
		components: {
			Icon
		},
		data() {
				return {
				userInfo: {},
				yuanqizhanEntries: [],
				yuanqizhanAccount: '',
				yuanqizhanEpoch: 0,
				yuanqizhanLoading: false,
				yuanqizhanError: '',
				unsubscribeYuanqizhan: null,
				navigationTopInset: 10,
				navigationRightInset: 0,
				currentWeight: 0,
				todayWeightRecorded: false,
				healthDataEpoch: 0,
				targetWeight: 0,
				bmiValue: 0,
				weightProgress: null,
				homeWeightTrend: [],
				unreadCount: 0,
				loading: false,
			newTargetWeight: '',
			showTargetModal: false,
				// 医患绑定相关
				showBindingModal: false,
				hasDoctorBinding: false,
				// 滑动删除相关
				touchStartX: 0,
				touchStartY: 0,
				currentSwipeIndex: -1,
				patientNotifications: [],
				mealCounts: null,
				patientActions: [
				{ icon: 'Others/scales-line.svg', text: '记录体重', action: 'record' },
				{ icon: 'Business/bar-chart-line.svg', text: '查看报告', action: 'report' },
				{ icon: 'Document/file-text-line.svg', text: '随访管理', action: 'follow' },
				{ icon: 'Business/links-line.svg', text: '医生/营养师绑定', action: 'bind' }
			],

			}
		},

		computed: {
      mealProgressText() { if (!this.mealCounts) return '待加载'; return '已记录 ' + ['BREAKFAST', 'LUNCH', 'DINNER'].filter(k => Number(this.mealCounts[k]) > 0).length + '/3 餐' },
      mealDetailText() { if (!this.mealCounts) return '拍照、文字或食物均可记录'; return ['BREAKFAST','LUNCH','DINNER','SNACK'].map((k,i) => ['早','午','晚','加餐'][i] + ' ' + Number(this.mealCounts[k] || 0) + ' 条').join(' · ') },
			displayWeight() {
				return Number(this.currentWeight) > 0 ? Number(this.currentWeight).toFixed(1) : '--'
			},
			formattedDate() {
				const date = new Date()
				const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
				return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`
			},
			greeting() {
				const hour = new Date().getHours()
				if (hour < 11) return '早上好'
				if (hour < 14) return '中午好'
				if (hour < 18) return '下午好'
				return '晚上好'
			},
			latestWeightChange() {
				if (this.homeWeightTrend.length < 2) return 0
				const latest = Number(this.homeWeightTrend[this.homeWeightTrend.length - 1].weight || 0)
				const previous = Number(this.homeWeightTrend[this.homeWeightTrend.length - 2].weight || 0)
				return Number((latest - previous).toFixed(1))
			},
			latestWeightChangeLabel() {
				if (this.homeWeightTrend.length < 2) return '暂无对比数据'
				if (this.latestWeightChange === 0) return '较前次持平'
				return `较前次 ${this.latestWeightChange > 0 ? '+' : ''}${this.latestWeightChange.toFixed(1)} kg`
			},
			miniTrendPoints() {
				const values = this.homeWeightTrend.map(item => Number(item.weight)).filter(value => Number.isFinite(value))
				if (values.length === 0) return []
				const min = Math.min(...values)
				const max = Math.max(...values)
				const range = max - min || 1
				return values.map((value, index) => ({
					left: values.length === 1 ? 50 : (index / (values.length - 1)) * 92 + 4,
					bottom: ((value - min) / range) * 42 + 27
				}))
			},
			visibleNotifications() {
				return this.patientNotifications.slice(0, 2)
			},
			careReminderText() {
				if (!this.hasDoctorBinding) return '绑定医生/营养师后，可获取专业的个性化健康建议'
				return '规律记录饮食与体重，有助于更精准地调整方案'
			}
		},

		onLoad() {
			this.unsubscribeYuanqizhan = store.subscribe('user', () => { if (patientActivitySession() !== this.yuanqizhanAccount) this.clearYuanqizhanEntry() })
				this.setupNavigationLayout()
				this.getUserInfo()
				this.checkLoginStatus()
				// 延迟加载数据，确保用户信息已获取
				this.$nextTick(() => {
					if (this.userInfo && this.userInfo.userId) {
						this.initPageData()
					} else {
						// 如果仍然没有用户信息，延迟重试
						setTimeout(() => {
							this.getUserInfo()
							if (this.userInfo && this.userInfo.userId) {
								this.initPageData()
							}
						}, 100)
					}
				})
			},
		

		onShow() { this.clearYuanqizhanEntry(); if (store.isLogin()) { this.getUserInfo(); this.initPageData(); this.loadYuanqizhanEntry() } },
		onHide() { this.clearYuanqizhanEntry() },
		onUnload() { this.clearYuanqizhanEntry(); this.unsubscribeYuanqizhan?.() },
		methods: {
      activityStatus: statusLabel,
      clearYuanqizhanEntry() { this.yuanqizhanEpoch++; this.yuanqizhanEntries = []; this.yuanqizhanAccount = ''; this.yuanqizhanLoading = false; this.yuanqizhanError = '' },
      async loadYuanqizhanEntry() {
        const account = patientActivitySession(), epoch = ++this.yuanqizhanEpoch
        this.yuanqizhanEntries = []; this.yuanqizhanError = ''; this.yuanqizhanLoading = false
        this.yuanqizhanAccount = account
        if (!account) return
        this.yuanqizhanLoading = true
        try { const items = await getMyActivities(); if (account === patientActivitySession() && epoch === this.yuanqizhanEpoch) this.yuanqizhanEntries = items }
        catch { if (account === patientActivitySession() && epoch === this.yuanqizhanEpoch) this.yuanqizhanError = '活动刷新失败，暂未获取最新状态，请重试。' }
        finally { if (account === patientActivitySession() && epoch === this.yuanqizhanEpoch) this.yuanqizhanLoading = false }
      },
      openYuanqizhan(id) {
        if (!this.yuanqizhanAccount || patientActivitySession() !== this.yuanqizhanAccount || !this.yuanqizhanEntries.some(item => item.id === id)) { this.clearYuanqizhanEntry(); return }
        uni.navigateTo({ url: '/pages/patient/yuanqizhan?activityId=' + encodeURIComponent(id) })
      },
			setupNavigationLayout() {
				const layout = getCustomNavigationLayout()
				this.navigationTopInset = layout.topInset
				this.navigationRightInset = layout.rightInset
			},

			notificationIcon(type) {
				const icons = {
					follow: 'Business/calendar-line.svg',
					follow_up: 'Business/calendar-line.svg',
					warning: 'Health/heart-pulse-line.svg',
					reminder: 'System/notification-badge-line.svg',
					task: 'Document/clipboard-line.svg',
					message: 'Communication/message-line.svg',
					system: 'System/notification-badge-line.svg'
				}
				return icons[type] || 'System/notification-badge-line.svg'
			},

			handleCareReminder() {
				if (this.hasDoctorBinding) {
					uni.switchTab({ url: '/pages/patient/follow' })
					return
				}
				this.goToBinding()
			},
			// 获取用户信息
			getUserInfo() {
				this.userInfo = store.getUserInfo() || {}
			},
			
			// 检查登录状态
			checkLoginStatus() {
				if (!store.isLogin()) {
					uni.reLaunch({
						url: '/pages/login/login'
					})
				}
			},
			
			// 处理通知包装器点击（点击空白区域重置滑动状态）
			onNotificationWrapperClick(event) {
				// 如果点击的是通知项本身，不处理
				if (event.target.closest('.notification-item')) {
					return
				}
				// 重置所有滑动状态
				this.resetAllSwipe()
			},
			
			// 处理通知点击
			async handleNotification(item, index) {
				try {
					// 重置其他通知的滑动状态
					this.resetAllSwipe(index)
					
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
					
					// Map only known notification routes; never navigate to an arbitrary server URL.
          if (String(item.relatedType || '').toUpperCase() === 'EXERCISE_REPORT_SHARED' && item.relatedId) {
            uni.navigateTo({ url: '/pages/shared-report/shared-report?shareId=' + encodeURIComponent(item.relatedId) }); return
          }
          if (['HEALTH_RECORD_REVIEW', 'DIET_PLAN'].includes(String(item.relatedType || '').toUpperCase())) {
            uni.setStorageSync('patientRecordTab', 'diet'); uni.switchTab({ url: '/pages/patient/record' }); return
          }
          // 根据通知类型进行相应跳转
					if (String(item.relatedType || '').toUpperCase() === 'CARE_SUMMARY') {
						uni.setStorageSync('patientReportTab', 'summary')
						uni.switchTab({ url: '/pages/patient/report' })
						return
					}
			switch(item.type) {
				case 'follow':
			case 'follow_up':
				// 跳转到随访页面，如果有关联ID则通过存储传递参数
				if (item.relatedId) {
					// 清除之前的followId并设置新的
					uni.getStorageSync('followId') && uni.removeStorageSync('followId')
					uni.setStorageSync('followId', item.relatedId)
					uni.switchTab({ url: '/pages/patient/follow' })
				} else {
					uni.switchTab({ url: '/pages/patient/follow' })
				}
				break
				case 'warning':
				case 'reminder':
					// 跳转到报告页面查看健康数据
					uni.switchTab({ url: '/pages/patient/report' })
					break
				case 'message':
					// 跳转到消息页面，传递相关参数
					if (item.relatedId) {
						uni.navigateTo({ 
							url: `/pages/common/messages?messageId=${item.relatedId}&relatedType=message` 
						})
					} else {
						// 如果没有具体消息ID，跳转到消息列表
						uni.navigateTo({ url: '/pages/common/messages' })
					}
					break
				case 'task':
					// 跳转到记录页面进行数据记录
					if (item.relatedId) {
						// 对于有具体任务ID的情况，使用switchTab并通过全局变量传递参数
						uni.getStorageSync('taskId') && uni.removeStorageSync('taskId')
						uni.setStorageSync('taskId', item.relatedId)
						uni.switchTab({ url: '/pages/patient/record' })
					} else {
						uni.switchTab({ url: '/pages/patient/record' })
					}
					break
				case 'system':
					// 系统通知，显示详情或跳转到设置页面
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
			
			// 处理快速操作
			handleQuickAction(action) {
				switch(action.action) {
					case 'diet':
						uni.setStorageSync('patientRecordTab', 'diet')
						uni.switchTab({ url: '/pages/patient/record' })
						break
					case 'weight':
						uni.setStorageSync('patientRecordTab', 'weight')
						uni.switchTab({ url: '/pages/patient/record' })
						break
					case 'record':
						uni.switchTab({ url: '/pages/patient/record' })
						break
					case 'report':
						uni.switchTab({ url: '/pages/patient/report' })
						break
					case 'follow':
						uni.switchTab({ url: '/pages/patient/follow' })
						break
					case 'bind':
						uni.navigateTo({ url: '/pages/patient-bind/patient-bind' })
						break
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
					e.preventDefault?.()
					
					// 只允许向左滑动
					if (deltaX < 0) {
						const translateX = Math.max(deltaX, -80) // 最大滑动80px
						this.patientNotifications[index].translateX = translateX
						this.currentSwipeIndex = index
					}
				}
			},
			
			onTouchEnd(e, index) {
				const item = this.patientNotifications[index]
				const translateX = item.translateX || 0
				
				// 如果滑动距离超过40px，显示删除按钮
				if (translateX < -40) {
					this.patientNotifications[index].translateX = -80
				} else {
					// 否则回弹
					this.patientNotifications[index].translateX = 0
				}
			},
			
			// 重置所有项的滑动状态
			resetAllSwipe(excludeIndex = -1) {
				this.patientNotifications.forEach((item, index) => {
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
						this.patientNotifications[index].translateX = 0
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
					this.patientNotifications.splice(index, 1)
					
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
					this.patientNotifications[index].translateX = 0
				} finally {
					uni.hideLoading()
				}
			},
			

			
			// 更新未读数量
			updateUnreadCount() {
				this.unreadCount = this.patientNotifications.filter(item => !item.read).length
			},
			
			// 初始化页面数据
			async initPageData() {
				if (!this.userInfo || !this.userInfo.userId) return
				
				try {
					// 串行加载核心数据
					await this.loadHealthData()
					
					// 并行加载非核心数据
					await Promise.allSettled([
						this.loadNotifications(),
						this.checkDoctorBinding()
					])
				} catch (error) {
					console.error('初始化页面数据失败:', error)
				}
			},

			// 加载健康数据
			async loadHealthData() {
				const epoch = ++this.healthDataEpoch
				this.todayWeightRecorded = false
				try {
					this.loading = true
					
					// 获取用户信息中的目标体重
					const userInfo = store.getUserInfo() || {}
					this.targetWeight = userInfo.targetWeight || 0
					
					// 获取近7条体重记录，同时用于首页趋势展示
					const weightResult = await getHealthRecords({ 
						type: 'weight', 
						limit: 7, 
						orderBy: 'createTime', 
						order: 'desc' 
					})
					if (weightResult.code === 200 && weightResult.data && weightResult.data.length > 0) {
						const sortedRecords = [...weightResult.data].sort((a, b) => new Date(b.createTime || b.recordDate || 0) - new Date(a.createTime || a.recordDate || 0))
						const latestWeightRecord = sortedRecords[0]
						this.homeWeightTrend = sortedRecords.slice(0, 7).reverse()
						this.currentWeight = latestWeightRecord.weight || 0
						
						// 计算BMI（需要身高数据）
						if (userInfo.height && latestWeightRecord.weight) {
							const heightInM = userInfo.height / 100
							this.bmiValue = (latestWeightRecord.weight / (heightInM * heightInM)).toFixed(1)
						}
						
						// 仅使用真实初始体重计算进度
						if (this.targetWeight > 0 && this.currentWeight > 0 && Number(userInfo.weight || userInfo.initialWeightKg) > this.targetWeight) {
							const initialWeight = Number(userInfo.weight || userInfo.initialWeightKg)
							const weightLoss = initialWeight - this.currentWeight
							const totalWeightLoss = initialWeight - this.targetWeight
							this.weightProgress = Math.min(100, Math.max(0, Math.round((weightLoss / totalWeightLoss) * 100)))
						}
						this.$nextTick(() => this.drawHomeWeightChart())
					} else {
						this.homeWeightTrend = []
					}
					
					const reportResult = await getHealthReports({}, { loading: false, showError: false })
          if (epoch !== this.healthDataEpoch) return
          const report = reportResult.code === 200 ? reportResult.data : null
          const today = report?.diet?.today?.date
          this.todayWeightRecorded = Boolean(today && report?.weight?.records?.some(record => {
            const measuredAt = new Date(record.recordedAt || record.measuredAt).getTime()
            return Number(record.weightKg ?? record.weight) > 0 && Number.isFinite(measuredAt) && new Date(measuredAt + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) === today
          }))
          this.mealCounts = reportResult.data?.diet?.today?.mealCounts || null
          // 单独获取未读消息数（非阻塞）
					this.loadUnreadCount()
					
				} catch (error) {
					console.error('加载健康数据失败:', error)
					showToast('数据加载失败')
				} finally {
					this.loading = false
				}
			},

			// 加载未读消息数
			async loadUnreadCount() {
				try {
					const messageResult = await getUnreadMessageCount(this.userInfo.userId)
					if (messageResult.code === 200) {
						this.unreadCount = messageResult.data.unreadCount || 0
					}
				} catch (error) {
					console.error('获取未读消息数失败:', error)
					this.unreadCount = 0
				}
			},
			
			// 加载通知数据
			async loadNotifications() {
				try {
					// 检查用户信息
					if (!this.userInfo || !this.userInfo.userId) {
						console.warn('用户信息不完整，无法加载通知')
						// 清空通知列表
						this.patientNotifications = []
						return
					}
					
					// 并行获取通知列表和未读数量
					const [result, countResult] = await Promise.allSettled([
						getNotifications({ userId: this.userInfo.userId, limit: 3 }), // 减少获取数量
						getUnreadNotificationCount({ userId: this.userInfo.userId })
					])
					
					// 处理通知列表
					if (result.status === 'fulfilled' && result.value.code === 200) {
						const notifications = result.value.data.notifications || []
						// 格式化通知数据
						this.patientNotifications = notifications.map(notification => ({
							title: notification.title,
							desc: notification.content,
							time: this.formatTime(notification.createdAt),
							read: notification.isRead,
							type: notification.type,
							id: notification.notificationId,
							relatedId: notification.relatedId,
							relatedType: notification.relatedType,
							actionPath: notification.actionPath,
							priority: notification.priority
						}))
					} else {
						// API调用失败，设置为空数组
						this.patientNotifications = []
					}
					
					// 处理未读数量
					if (countResult.status === 'fulfilled' && countResult.value.code === 200) {
						this.unreadCount = countResult.value.data.unreadCount || 0
					} else {
						this.unreadCount = 0
					}
				} catch (error) {
					console.error('加载通知失败:', error)
					// 发生异常时，确保显示空状态
					this.patientNotifications = []
					this.unreadCount = 0
				}
			},
			
			// 加载每日任务

			

			
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

			drawHomeWeightChart() {
				const records = this.homeWeightTrend
				if (!records.length) return
				const values = records.map(item => Number(item.weight)).filter(value => Number.isFinite(value))
				if (!values.length) return
				const ctx = uni.createCanvasContext('homeWeightChart', this)
				const width = 330
				const height = 142
				const padding = { left: 34, right: 12, top: 18, bottom: 28 }
				const chartWidth = width - padding.left - padding.right
				const chartHeight = height - padding.top - padding.bottom
				const rawMin = Math.min(...values)
				const rawMax = Math.max(...values)
				const spread = rawMax - rawMin || 1
				const min = rawMin - Math.max(0.3, spread * 0.18)
				const max = rawMax + Math.max(0.3, spread * 0.18)
				const range = max - min
				const points = values.map((value, index) => ({
					x: padding.left + (values.length === 1 ? chartWidth / 2 : chartWidth * index / (values.length - 1)),
					y: padding.top + chartHeight - ((value - min) / range) * chartHeight,
					value,
					date: this.formatTrendDate(records[index].createTime || records[index].recordDate)
				}))

				ctx.clearRect(0, 0, width, height)
				ctx.setStrokeStyle('#e7f0f5')
				ctx.setLineWidth(1)
				for (let i = 0; i < 3; i += 1) {
					const y = padding.top + (chartHeight / 2) * i
					ctx.beginPath()
					ctx.moveTo(padding.left, y)
					ctx.lineTo(width - padding.right, y)
					ctx.stroke()
				}

				ctx.setFillStyle('rgba(24, 151, 193, 0.10)')
				ctx.beginPath()
				ctx.moveTo(points[0].x, padding.top + chartHeight)
				points.forEach(point => ctx.lineTo(point.x, point.y))
				ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight)
				ctx.closePath()
				ctx.fill()

				ctx.setStrokeStyle('#168fbb')
				ctx.setLineWidth(2)
				ctx.beginPath()
				points.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y))
				ctx.stroke()

				points.forEach((point, index) => {
					ctx.setFillStyle('#ffffff')
					ctx.beginPath()
					ctx.arc(point.x, point.y, index === points.length - 1 ? 4 : 3, 0, Math.PI * 2)
					ctx.fill()
					ctx.setStrokeStyle('#168fbb')
					ctx.setLineWidth(2)
					ctx.stroke()
					ctx.setFillStyle(index === points.length - 1 ? '#168fbb' : '#647985')
					ctx.setFontSize(index === points.length - 1 ? 10 : 9)
					ctx.fillText(point.value.toFixed(1), point.x - 10, Math.max(10, point.y - 8))
					ctx.setFillStyle(index === points.length - 1 ? '#168fbb' : '#8496a0')
					ctx.setFontSize(9)
					ctx.fillText(point.date, point.x - 11, height - 8)
				})
				ctx.draw()
			},

			formatTrendDate(value) {
				const date = value ? new Date(value) : new Date()
				if (Number.isNaN(date.getTime())) return '--'
				return `${date.getMonth() + 1}/${date.getDate()}`
			},
			

			

			
			// 显示目标体重设置弹窗
			showTargetWeightModal() {
				this.newTargetWeight = this.targetWeight ? this.targetWeight.toString() : ''
				this.showTargetModal = true
			},
			
			// 关闭目标体重设置弹窗
			closeTargetWeightModal() {
				this.showTargetModal = false
				this.newTargetWeight = ''
			},
			
			// 保存目标体重
			async saveTargetWeight() {
				if (!this.newTargetWeight || isNaN(this.newTargetWeight)) {
					uni.showToast({
						title: '请输入有效的体重值',
						icon: 'none'
					})
					return
				}
				
				const weight = parseFloat(this.newTargetWeight)
				if (weight <= 0 || weight > 300) {
					uni.showToast({
						title: '请输入合理的体重值(0-300kg)',
						icon: 'none'
					})
					return
				}
				
				try {
					uni.showLoading({ title: '保存中...' })
					
					const result = await setTargetWeight(weight)
					if (result.code === 200) {
						this.targetWeight = weight
						
						// 更新store中的用户信息
					const userInfo = store.getUserInfo() || {}
					userInfo.targetWeight = weight
					store.updateUserInfo(userInfo)
						
						this.closeTargetWeightModal()
						uni.showToast({
							title: '目标体重设置成功',
							icon: 'success'
						})
						
						// 重新计算进度
						if (this.currentWeight > 0) {
							const initialWeight = weight + 10
							const weightLoss = initialWeight - this.currentWeight
							const totalWeightLoss = initialWeight - weight
							this.weightProgress = Math.min(100, Math.max(0, Math.round((weightLoss / totalWeightLoss) * 100)))
						}
					} else {
						uni.showToast({
							title: result.message || '设置失败',
							icon: 'none'
						})
					}
				} catch (error) {
					console.error('设置目标体重失败:', error)
					uni.showToast({
						title: '设置失败，请重试',
						icon: 'none'
					})
				} finally {
					uni.hideLoading()
				}
			},
			
			// 检查医患绑定状态
			async checkDoctorBinding() {
				try {
					if (!this.userInfo || !this.userInfo.userId) {
						return
					}
					
					const result = await getPatientDoctors(this.userInfo.userId)
					if (result.code === 200) {
						const doctors = result.data.doctors || []
						this.hasDoctorBinding = doctors.length > 0
						
						// 如果没有绑定医生，显示提醒弹窗
						if (!this.hasDoctorBinding) {
							// 延迟显示弹窗，确保页面加载完成
							setTimeout(() => {
								this.showBindingModal = true
							}, 1000)
						}
					} else {
						console.warn('获取医患绑定状态失败:', result.message)
					}
				} catch (error) {
					console.error('检查医患绑定状态失败:', error)
				}
			},
			
			// 关闭绑定提醒弹窗
			closeBindingModal() {
				this.showBindingModal = false
			},
			
			// 去绑定医生
			goToBinding() {
				this.closeBindingModal()
				uni.navigateTo({
					url: '/pages/patient-bind/patient-bind'
				})
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

	/* 健康概览样式 */
	.health-overview {
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
	}

	.card-action {
		display: flex;
		align-items: center;
	}

	.action-arrow {
		font-size: 24rpx;
		color: #999999;
		font-weight: 600;
	}

	/* 目标体重弹窗样式 */
	.target-weight-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.target-weight-modal {
		background-color: #ffffff;
		border-radius: 20rpx;
		width: 600rpx;
		max-width: 90vw;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 40rpx 40rpx 20rpx;
		border-bottom: 1rpx solid #F0F0F0;
	}

	.modal-title {
		font-size: 36rpx;
		font-weight: 600;
		color: #333333;
	}

	.close-btn {
		width: 88rpx;
		height: 88rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background-color: #F5F5F5;
	}

	.close-text {
		font-size: 40rpx;
		color: #999999;
		line-height: 1;
	}

	.modal-content {
		padding: 40rpx;
	}

	.input-group {
		margin-bottom: 30rpx;
	}

	.input-label {
		font-size: 28rpx;
		color: #333333;
		font-weight: 500;
		display: block;
		margin-bottom: 20rpx;
	}

	.weight-input {
		width: 100%;
		height: 80rpx;
		border: 2rpx solid #E0E0E0;
		border-radius: 12rpx;
		padding: 0 20rpx;
		font-size: 32rpx;
		color: #333333;
		background-color: #FAFAFA;
	}

	.weight-input:focus {
		border-color: #2E86AB;
		background-color: #ffffff;
	}

	.tips {
		background-color: #F0F8FF;
		border-radius: 12rpx;
		padding: 20rpx;
	}

	.tips-text {
		display: flex;
		align-items: flex-start;
		gap: 10rpx;
		font-size: 24rpx;
		color: #666666;
		line-height: 1.5;
	}

	.modal-footer {
		display: flex;
		gap: 20rpx;
		padding: 20rpx 40rpx 40rpx;
	}

	.cancel-btn, .confirm-btn {
		flex: 1;
		height: 80rpx;
		border-radius: 12rpx;
		font-size: 32rpx;
		font-weight: 500;
		border: none;
	}

	.cancel-btn {
		background-color: #F5F5F5;
		color: #666666;
	}

	.confirm-btn {
		background-color: #2E86AB;
		color: #ffffff;
	}

	.confirm-btn:disabled {
		background-color: #CCCCCC;
		color: #999999;
	}

	/* 医患绑定提醒弹窗样式 */
	.binding-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.3s ease;
	}

	.binding-modal {
		width: 640rpx;
		background-color: #ffffff;
		border-radius: 24rpx;
		overflow: hidden;
		box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.15);
		animation: slideUp 0.3s ease;
	}

	.binding-modal .modal-header {
		padding: 50rpx 40rpx 30rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #ffffff;
		border-bottom: none;
	}

	.modal-icon {
		font-size: 60rpx;
		margin-bottom: 20rpx;
	}

	.binding-modal .modal-title {
		font-size: 36rpx;
		font-weight: 600;
		color: #ffffff;
	}

	.binding-modal .modal-content {
		padding: 40rpx;
	}

	.modal-desc {
		font-size: 28rpx;
		color: #666666;
		line-height: 1.6;
		text-align: center;
		margin-bottom: 40rpx;
	}

	.benefits {
		display: flex;
		flex-direction: column;
		gap: 24rpx;
	}

	.benefit-item {
		display: flex;
		align-items: center;
		padding: 20rpx;
		background-color: #F8F9FA;
		border-radius: 16rpx;
		border-left: 6rpx solid #2E86AB;
	}

	.benefit-icon {
		font-size: 32rpx;
		margin-right: 20rpx;
	}

	.benefit-text {
		font-size: 26rpx;
		color: #666666;
		font-weight: 500;
	}

	.binding-modal .modal-footer {
		padding: 20rpx 40rpx 50rpx;
		display: flex;
		gap: 24rpx;
	}

	.later-btn, .bind-btn {
		flex: 1;
		height: 88rpx;
		border-radius: 16rpx;
		font-size: 30rpx;
		font-weight: 600;
		border: none;
		transition: all 0.3s ease;
	}

	.later-btn {
		background-color: #F5F5F5;
		color: #999999;
		border: 2rpx solid #E0E0E0;
	}

	.later-btn:active {
		background-color: #EEEEEE;
		transform: scale(0.98);
	}

	.bind-btn {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #ffffff;
		box-shadow: 0 8rpx 20rpx rgba(102, 126, 234, 0.3);
	}

	.bind-btn:active {
		transform: scale(0.98);
		box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.4);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			transform: translateY(100rpx);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* 通知中心样式 */
	.notification-center {
		margin-bottom: $spacing-lg;
	}

	.section-title {
		display: flex;
		align-items: center;
		margin-bottom: $spacing-md;
		position: relative;
	}

	.title-text {
		font-size: $font-size-xl;
		font-weight: 600;
		color: $gray-800;
	}

	.notification-badge {
		background-color: $accent-color;
		border-radius: 50%;
		padding: 0;
		margin-left: $spacing-md;
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
		font-size: $font-size-sm;
		color: $white;
		font-weight: 600;
	}

	.task-progress {
		background-color: $primary-color;
		border-radius: $border-radius-full;
		padding: 4rpx 12rpx;
		margin-left: auto;
	}

	.progress-text {
		font-size: $font-size-sm;
		color: $white;
		font-weight: 600;
	}

	.notification-list {
		@include card-base;
		overflow: hidden;
	}

	.notification-item {
		display: flex;
		align-items: center;
		padding: 30rpx;
		border-bottom: 1rpx solid #F0F0F0;
		position: relative;
		transition: transform 0.3s ease;
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
		margin-bottom: 30rpx;
	}

	.action-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20rpx;
	}
	
	.action-grid .action-item:nth-child(odd):last-child {
		grid-column: 1 / -1;
		max-width: 50%;
		margin: 0 auto;
	}

	.action-item {
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 40rpx 20rpx;
		text-align: center;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
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

	.action-text {
		font-size: 28rpx;
		color: #333333;
		font-weight: 500;
	}

	/* 今日任务样式 */
	.daily-tasks {
		margin-bottom: 30rpx;
	}

	.task-list {
		background-color: #ffffff;
		border-radius: 20rpx;
		overflow: hidden;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.notification-list {
		background-color: #ffffff;
		border-radius: 20rpx;
		overflow: hidden;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
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

	.task-item {
		display: flex;
		align-items: center;
		padding: 30rpx;
		border-bottom: 1rpx solid #F0F0F0;
		transition: all 0.3s ease;
	}

	.task-item:last-child {
		border-bottom: none;
	}

	.task-item.completed {
		opacity: 0.6;
	}

	.task-icon {
		margin-right: 20rpx;
	}

	.task-emoji {
		font-size: 40rpx;
	}

	.task-content {
		flex: 1;
	}

	.task-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
		display: block;
		margin-bottom: 8rpx;
	}

	.task-desc {
		font-size: 28rpx;
		color: #666666;
		display: block;
	}

	.task-status {
		margin-left: 20rpx;
	}

	.status-icon {
		width: 40rpx;
		height: 40rpx;
		border-radius: 50%;
		border: 2rpx solid #CCCCCC;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
	}

	.status-icon.completed {
		background-color: #2E86AB;
		border-color: #2E86AB;
	}

	.status-text {
		font-size: 24rpx;
		color: #CCCCCC;
		font-weight: 600;
	}

	.status-icon.completed .status-text {
		color: #ffffff;
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
</style>

<style lang="scss">
	.patient-home {
		box-sizing: border-box;
		min-height: 100vh;
		padding: 0 24rpx 160rpx;
		background: linear-gradient(180deg, #eaf8fd 0, #f6fbfd 270rpx, #f4f8fa 100%);
		color: #18384b;
	}

	.patient-home view,
	.patient-home text,
	.patient-home image,
	.patient-home canvas {
		box-sizing: border-box;
	}

	.home-hero {
		padding: 20rpx 4rpx 28rpx;
	}

	.brand-row,
	.greeting-row,
	.card-heading,
	.heading-main,
	.section-heading-row,
	.section-heading-main,
	.weight-overview-row,
	.weight-number-line,
	.task-title-row {
		display: flex;
		align-items: center;
	}

	.brand-row,
	.card-heading,
	.section-heading-row {
		justify-content: space-between;
	}

	.brand-row {
		min-height: 88rpx;
	}

	.brand-lockup {
		display: flex;
		flex: 1;
		align-items: center;
		min-width: 0;
	}

	.brand-logo-tile {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 68rpx;
		height: 68rpx;
		margin-right: 14rpx;
		border-radius: 16rpx;
		background: linear-gradient(135deg, #157FA5 0%, #1B9CC1 100%);
		box-shadow: 0 7rpx 18rpx rgba(20, 93, 126, 0.18);
	}

	.brand-logo {
		width: 56rpx;
		height: 56rpx;
	}

	.brand-copy,
	.greeting-copy,
	.task-copy,
	.health-note-copy,
	.daily-tip-copy {
		display: flex;
		flex: 1;
		min-width: 0;
		flex-direction: column;
	}

	.brand-name {
		display: block;
		overflow: hidden;
		font-size: 30rpx;
		line-height: 1.25;
		font-weight: 700;
		letter-spacing: 1rpx;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #173c50;
	}

	.brand-tagline {
		margin-top: 3rpx;
		font-size: 20rpx;
		color: #78909d;
		letter-spacing: 1rpx;
	}

	.greeting-row {
		margin-top: 30rpx;
	}

	.greeting-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72rpx;
		height: 72rpx;
		margin-right: 16rpx;
		border-radius: 22rpx;
		background: rgba(255, 255, 255, 0.72);
	}

	.greeting-title {
		max-width: 590rpx;
		overflow: hidden;
		font-size: 34rpx;
		line-height: 1.35;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #15374a;
	}

	.greeting-date {
		margin-top: 7rpx;
		font-size: 23rpx;
		color: #78909c;
	}

	.clinical-card {
		border: 1rpx solid rgba(42, 119, 151, 0.08);
		border-radius: 24rpx;
		background: rgba(255, 255, 255, 0.96);
		box-shadow: 0 10rpx 30rpx rgba(25, 81, 106, 0.07);
	}

	.weight-primary-card {
		padding: 28rpx 28rpx 22rpx;
	}

	.heading-main {
		gap: 9rpx;
	}

	.heading-title,
	.section-heading {
		font-size: 30rpx;
		font-weight: 700;
		color: #18394b;
	}

	.heading-meta,
	.section-note {
		font-size: 21rpx;
		color: #8799a3;
	}

	.weight-overview-row {
		min-height: 142rpx;
		justify-content: space-between;
	}

	.weight-reading {
		width: 42%;
	}

	.weight-number {
		font-size: 76rpx;
		line-height: 1;
		font-weight: 700;
		letter-spacing: -3rpx;
		color: #168fbb;
	}

	.weight-unit {
		align-self: flex-end;
		margin: 0 0 8rpx 10rpx;
		font-size: 24rpx;
		font-weight: 600;
		color: #395969;
	}

	.weight-change {
		display: block;
		margin-top: 10rpx;
		font-size: 22rpx;
		color: #36a27d;
	}

	.weight-change.up {
		color: #df755c;
	}

	.mini-trend {
		position: relative;
		width: 52%;
		height: 100rpx;
		margin-top: 8rpx;
	}

	.mini-baseline {
		position: absolute;
		left: 4%;
		right: 4%;
		bottom: 48%;
		height: 3rpx;
		border-radius: 2rpx;
		background: linear-gradient(90deg, #36a4c9, #168ab4);
		opacity: 0.72;
	}

	.mini-trend.empty .mini-baseline {
		background: repeating-linear-gradient(90deg, #bfd4de 0, #bfd4de 10rpx, transparent 10rpx, transparent 18rpx);
	}

	.mini-point {
		position: absolute;
		width: 13rpx;
		height: 13rpx;
		border: 3rpx solid #ffffff;
		border-radius: 50%;
		background: #168fb8;
		box-shadow: 0 0 0 2rpx rgba(22, 143, 184, 0.25);
		transform: translate(-50%, 50%);
	}

	.metric-strip {
		display: flex;
		align-items: stretch;
		margin: 6rpx 0 22rpx;
		padding: 18rpx 8rpx;
		border-radius: 18rpx;
		background: #f4fafc;
	}

	.metric-item {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		min-width: 0;
	}

	.metric-label {
		font-size: 20rpx;
		color: #8497a2;
	}

	.metric-value {
		margin-top: 6rpx;
		font-size: 25rpx;
		font-weight: 700;
		color: #274b5f;
	}

	.metric-divider {
		width: 1rpx;
		background: #dceaf0;
	}

	.primary-record-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12rpx;
		height: 88rpx;
		border-radius: 22rpx;
		background: linear-gradient(102deg, #188eb8 0%, #20a5ca 100%);
		box-shadow: 0 10rpx 22rpx rgba(22, 143, 184, 0.22);
		font-size: 29rpx;
		font-weight: 700;
		color: #ffffff;
	}

	.primary-record-button:active,
	.task-cta:active,
	.patient-home .action-item:active {
		transform: scale(0.98);
	}

	.record-helper {
		display: block;
		margin-top: 14rpx;
		font-size: 21rpx;
		text-align: center;
		color: #8b9ba5;
	}

	.section-block {
		margin-top: 30rpx;
	}

	.section-heading-row {
		min-height: 48rpx;
		padding: 0 8rpx;
		margin-bottom: 14rpx;
	}

	.section-heading-main {
		gap: 9rpx;
		min-width: 0;
	}

	.section-link {
		display: flex;
		align-items: center;
		min-height: 88rpx;
		padding: 0 12rpx;
		margin-right: -12rpx;
		font-size: 22rpx;
		color: #758997;
	}

	.task-card {
		overflow: hidden;
		padding: 0 22rpx;
	}

	.task-row {
		position: relative;
		display: flex;
		align-items: center;
		min-height: 112rpx;
		padding: 20rpx 0;
		border-bottom: 1rpx solid #eaf1f4;
		background: #ffffff;
		transition: transform 0.25s ease;
		z-index: 2;
	}

	.task-row:last-child {
		border-bottom: none;
	}

	.task-icon-box {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64rpx;
		height: 64rpx;
		margin-right: 16rpx;
		border-radius: 20rpx;
		background: #eaf8fc;
	}

	.task-icon-box.portrait {
		background: #eef7f5;
	}

	.task-copy {
		padding-right: 12rpx;
	}

	.task-title-row {
		flex-wrap: wrap;
		gap: 8rpx;
	}

	.task-title {
		font-size: 26rpx;
		line-height: 1.35;
		font-weight: 650;
		color: #1b3c4f;
	}

	.task-pill {
		padding: 4rpx 10rpx;
		border-radius: 12rpx;
		background: #fff4eb;
		font-size: 18rpx;
		color: #d78655;
	}

	.task-desc {
		display: -webkit-box;
		overflow: hidden;
		margin-top: 6rpx;
		font-size: 21rpx;
		line-height: 1.45;
		color: #7b8f9b;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}

	.task-cta {
		flex-shrink: 0;
		padding: 12rpx 18rpx;
		border: 1rpx solid #29a0c6;
		border-radius: 16rpx;
		font-size: 22rpx;
		font-weight: 600;
		color: #168fb9;
	}

	.patient-home .notification-wrapper {
		position: relative;
		overflow: hidden;
	}

	.live-notification {
		min-height: 104rpx;
	}

	.live-notification .notification-time {
		align-self: flex-start;
		flex-shrink: 0;
		margin-top: 2rpx;
		font-size: 19rpx;
		color: #9aaab3;
	}

	.live-notification .unread-dot {
		width: 12rpx;
		height: 12rpx;
		border-radius: 50%;
		background: #f28d68;
	}

	.patient-home .delete-action {
		width: 130rpx;
		border-radius: 0;
		background: #e86761;
	}

	.patient-home .action-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0;
		overflow: hidden;
		padding: 10rpx;
	}

	.patient-home .action-grid .action-item,
	.patient-home .action-grid .action-item:nth-child(odd):last-child {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		max-width: none;
		min-height: 122rpx;
		margin: 0;
		padding: 14rpx 4rpx;
		border-right: 1rpx solid #edf3f5;
		border-radius: 16rpx;
		background: transparent;
		box-shadow: none;
	}

	.patient-home .action-grid .action-item:last-child {
		border-right: 0;
	}

	.patient-home .action-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64rpx;
		height: 64rpx;
		margin-bottom: 8rpx;
		border-radius: 18rpx;
		background: #ebf8fc;
	}

	.patient-home .action-text {
		font-size: 21rpx;
		font-weight: 600;
		color: #345565;
	}

	.trend-card {
		margin-top: 28rpx;
		padding: 26rpx 24rpx 18rpx;
	}

	.home-weight-chart {
		display: block;
		width: 100%;
		height: 284rpx;
		margin-top: 14rpx;
	}

	.home-chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 16rpx;
		min-height: 220rpx;
		padding: 20rpx 60rpx;
		font-size: 22rpx;
		line-height: 1.5;
		text-align: center;
		color: #8ca0aa;
	}

	.health-note,
	.daily-tip {
		display: flex;
		align-items: center;
		margin-top: 24rpx;
		padding: 22rpx 24rpx;
	}

	.health-note-icon,
	.daily-tip-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 72rpx;
		height: 72rpx;
		margin-right: 18rpx;
		border-radius: 20rpx;
		background: #e9f7fc;
	}

	.health-note-title,
	.daily-tip-title {
		font-size: 24rpx;
		line-height: 1.35;
		font-weight: 700;
		color: #27495b;
	}

	.health-note-text,
	.daily-tip-text {
		margin-top: 5rpx;
		font-size: 20rpx;
		line-height: 1.5;
		color: #83959f;
	}

	.patient-home + .target-weight-overlay,
	.patient-home + .target-weight-overlay + .binding-overlay,
	.patient-home ~ .target-weight-overlay,
	.patient-home ~ .binding-overlay {
		backdrop-filter: blur(6rpx);
	}

	.binding-modal .modal-header,
	.binding-modal .bind-btn {
		background: linear-gradient(112deg, #188eb8 0%, #20a5ca 100%);
	}

	.binding-modal .benefit-item {
		border-left-color: #168fb9;
		background: #f1f9fc;
	}

	.binding-modal .bind-btn {
		box-shadow: 0 8rpx 20rpx rgba(22, 143, 185, 0.22);
	}
</style>

<style scoped lang="scss">
@import "./home-third.scss";
</style>

<style scoped>
/* Narrow-screen action spacing and reachable controls. */
.target-weight-modal button, .binding-modal button { min-height: 44px; height: auto; display: flex; align-items: center; justify-content: center; padding: 10px 14px; line-height: 1.5; font-size: 14px; }
.target-weight-modal .modal-footer, .binding-modal .modal-footer { gap: 12px; }
.target-weight-modal, .binding-modal { max-height: calc(100vh - 32px - env(safe-area-inset-bottom)); overflow-y: auto; }
</style>
