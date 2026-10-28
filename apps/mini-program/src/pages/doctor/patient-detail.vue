<template>
	<NutritionistClient ref="nutritionistClient" v-if="nutritionistView" :patient-id="patientId" :active-revision="activeRevision" :page-active="pageActive" /><view v-else class="detail-page">
		<view v-if="loading" class="state-card">
			<view class="clinical-loading-spinner"></view>
			<text>正在加载患者资料…</text>
		</view>

		<view v-else-if="errorMessage" class="state-card">
			<text class="state-title">患者资料加载失败</text>
			<text class="state-desc">{{ errorMessage }}</text>
			<button class="secondary-button" @click="loadPatient">重新加载</button>
		</view>

		<template v-else-if="patient">
			<view class="profile-card">
				<view class="avatar">{{ avatarText }}</view>
				<view class="profile-main">
					<view class="name-row">
						<text class="patient-name">{{ patient.name || '未命名患者' }}</text>
						<text class="status-tag" :class="patientStatus.className">{{ patientStatus.label }}</text>
					</view>
					<text class="profile-meta">{{ patient.phoneMasked || maskPhone(patient.phone) || '手机号未提供' }}</text>
					<text class="profile-meta">{{ genderText }} · {{ patient.age ? `${patient.age}岁` : '年龄未知' }} · {{ patient.height ? `${patient.height}cm` : '身高未记录' }}</text>
				</view>
			</view>

			<view class="metric-grid">
				<view class="metric-card">
					<text class="metric-value">{{ metric(patient.currentWeight) }}</text>
					<text class="metric-label">当前体重 kg</text>
				</view>
				<view class="metric-card">
					<text class="metric-value">{{ metric(patient.targetWeight) }}</text>
					<text class="metric-label">目标体重 kg</text>
				</view>
				<view class="metric-card">
					<text class="metric-value">{{ metric(patient.bmi) }}</text>
					<text class="metric-label">BMI</text>
				</view>
			</view>

			<view class="section-card">
				<view class="section-header">
					<text class="section-title">服务概况</text>
					<text class="section-note">最近记录 {{ formatDate(patient.lastRecordDate) }}</text>
				</view>
				<view class="summary-list">
					<view class="summary-item">
						<text>待处理任务</text>
						<text class="summary-value">{{ patient.pendingTaskCount || 0 }}</text>
					</view>
					<view class="summary-item">
						<text>待处理随访</text>
						<text class="summary-value">{{ patient.pendingFollowUpCount || 0 }}</text>
					</view>
					<view class="summary-item">
						<text>健康档案</text>
						<text class="summary-value">{{ archiveText }}</text>
					</view>
				</view>
			</view>

			<view class="section-card">
				<view class="section-header">
					<text class="section-title">最近健康记录</text>
					<text class="section-note">最多展示 5 条</text>
				</view>
				<view v-if="recentRecords.length" class="record-list">
					<view v-for="record in recentRecords" :key="record.id" class="record-row">
						<view>
							<text class="record-title">{{ recordTypeText(record.recordType) }}</text>
							<text class="record-time">{{ formatDateTime(record.measuredAt || record.recordedAt || record.createdAt) }}</text>
						</view>
						<text class="record-value">{{ recordValue(record) }}</text>
					</view>
				</view>
				<text v-else class="empty-text">暂无健康记录</text>
			</view>

			<view class="section-card">
				<view class="section-header">
					<text class="section-title">最近随访</text>
					<text class="section-note">最多展示 5 条</text>
				</view>
				<view v-if="recentFollowUps.length" class="record-list">
					<view v-for="item in recentFollowUps" :key="item.id" class="record-row">
						<view>
							<text class="record-title">{{ followTypeText(item.type || item.followType) }}</text>
							<text class="record-time">{{ formatDateTime(item.scheduledAt) }}</text>
						</view>
						<text class="follow-status">{{ followStatusText(item.status) }}</text>
					</view>
				</view>
				<text v-else class="empty-text">暂无随访记录</text>
			</view>

			<view class="action-bar">
				<button class="secondary-button" @click="openMessages">留言</button>
				<button class="primary-button" @click="createFollowUp">新建随访</button>
			</view>
		</template>
	</view>
</template>

<script>
import store from '../../store/index.js'
import NutritionistClient from './NutritionistClient.vue'
import { isNutritionist } from '../../utils/managed-care.js'
import { getPatientDetail } from '../../utils/api.js'

export default {
	components: { NutritionistClient },
	data() {
		return {
			patientId: '',
			activeRevision: 0,
			pageActive: false,
			fallbackName: '',
			patient: null,
			loading: true,
			errorMessage: ''
		}
	},
	computed: {
		nutritionistView() { return isNutritionist(store.getUserInfo() || {}) },
		avatarText() {
			return String(this.patient?.name || this.fallbackName || '?').slice(0, 1)
		},
		genderText() {
			const value = String(this.patient?.gender || '').toLowerCase()
			return value === 'male' ? '男' : value === 'female' ? '女' : '性别未知'
		},
		patientStatus() {
			if (this.patient?.completedGoal) return { label: '已达标', className: 'completed' }
			if (this.patient?.attention) return { label: '需关注', className: 'attention' }
			if (this.patient?.active) return { label: '活跃', className: 'active' }
			return { label: '暂无近期记录', className: 'neutral' }
		},
		archiveText() {
			if (!this.patient?.archiveStatus) return '未建档'
			const percent = Number(this.patient.archiveCompletionPercent)
			return Number.isFinite(percent) ? `${percent}%` : '已建档'
		},
		recentRecords() {
			return Array.isArray(this.patient?.healthRecords) ? this.patient.healthRecords.slice(0, 5) : []
		},
		recentFollowUps() {
			return Array.isArray(this.patient?.followUps) ? this.patient.followUps.slice(0, 5) : []
		}
	},
	onLoad(options = {}) {
		const user = store.getUserInfo() || {}
		if (!store.isLogin() || user.role !== 'doctor') {
			uni.reLaunch({ url: '/pages/login/login' })
			return
		}
		this.patientId = String(options.id || '')
		this.fallbackName = decodeURIComponent(options.name || '')
		if (!this.patientId) {
			this.loading = false
			this.errorMessage = '缺少患者标识，请返回患者列表后重试'
			return
		}
		if (!this.nutritionistView) this.loadPatient()
	},
	onShow() { this.pageActive = true; this.activeRevision++ },
	onHide() { this.pageActive = false; this.$refs.nutritionistClient?.suspend() },
	onUnload() { this.pageActive = false; this.$refs.nutritionistClient?.suspend() },
	methods: {
		async loadPatient() {
			this.loading = true
			this.errorMessage = ''
			try {
				const result = await getPatientDetail(this.patientId, { loading: false, showError: false })
				this.patient = result.data
				if (!this.patient) throw new Error('未找到患者资料')
			} catch (error) {
				this.patient = null
				this.errorMessage = error?.message || '网络异常，请稍后重试'
			} finally {
				this.loading = false
			}
		},
		metric(value) {
			const number = Number(value)
			return Number.isFinite(number) && value !== null && value !== '' ? number.toFixed(1).replace(/\.0$/, '') : '--'
		},
		maskPhone(value) {
			return String(value || '').replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
		},
		formatDate(value) {
			if (!value) return '暂无'
			const date = new Date(value)
			return Number.isNaN(date.getTime()) ? '暂无' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
		},
		formatDateTime(value) {
			if (!value) return '时间未记录'
			const date = new Date(value)
			if (Number.isNaN(date.getTime())) return '时间未记录'
			return `${this.formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
		},
		recordTypeText(type) {
			return ({ WEIGHT: '体重', BODY_COMPOSITION: '身体成分', DIET: '饮食', EXERCISE: '运动' })[String(type || '').toUpperCase()] || '健康记录'
		},
		recordValue(record) {
			if (record.weightKg !== null && record.weightKg !== undefined) return `${record.weightKg} kg`
			if (record.caloriesKcal !== null && record.caloriesKcal !== undefined) return `${record.caloriesKcal} kcal`
			if (record.waistCm !== null && record.waistCm !== undefined) return `${record.waistCm} cm`
			return '已记录'
		},
		followTypeText(type) {
			return ({ WEIGHT: '体重随访', DIET: '饮食指导', EXERCISE: '运动计划', MEDICATION: '用药复查', QUESTIONNAIRE: '健康评估', PHONE: '电话随访', OFFLINE: '线下随访' })[String(type || '').toUpperCase()] || '常规随访'
		},
		followStatusText(status) {
			return ({ SCHEDULED: '待开始', IN_PROGRESS: '进行中', OVERDUE: '已逾期', COMPLETED: '已完成', CANCELLED: '已取消' })[String(status || '').toUpperCase()] || '未知状态'
		},
		createFollowUp() {
			uni.navigateTo({ url: `/pages/doctor/follow-add?patientId=${encodeURIComponent(this.patientId)}&patientName=${encodeURIComponent(this.patient?.name || this.fallbackName)}` })
		},
		openMessages() {
			const name = this.patient?.name || this.fallbackName
			uni.navigateTo({ url: `/pages/common/messages?otherUserId=${encodeURIComponent(this.patientId)}&otherUserName=${encodeURIComponent(name)}&relatedId=${encodeURIComponent(this.patientId)}&relatedType=patient` })
		}
	}
}
</script>

<style scoped>
.detail-page { min-height: 100vh; padding: 24rpx 24rpx 180rpx; box-sizing: border-box; background: #f4f9fb; color: #172b36; }
.state-card, .profile-card, .section-card { background: #fff; border: 1rpx solid #e5eef2; border-radius: 24rpx; box-shadow: 0 10rpx 28rpx rgba(33, 91, 116, .06); }
.state-card { min-height: 360rpx; padding: 64rpx 40rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20rpx; text-align: center; }
.state-title { font-size: 34rpx; font-weight: 700; }
.state-desc, .empty-text, .section-note { color: #71838d; font-size: 24rpx; }
.profile-card { padding: 32rpx; display: flex; align-items: center; gap: 24rpx; }
.avatar { width: 104rpx; height: 104rpx; flex: 0 0 104rpx; border-radius: 32rpx; background: #dff2f7; color: #237a9e; display: flex; align-items: center; justify-content: center; font-size: 42rpx; font-weight: 700; }
.profile-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 10rpx; }
.name-row { display: flex; align-items: center; gap: 16rpx; }
.patient-name { font-size: 38rpx; font-weight: 700; }
.profile-meta { color: #5e737d; font-size: 25rpx; }
.status-tag { padding: 6rpx 14rpx; border-radius: 999rpx; font-size: 22rpx; }
.status-tag.active { color: #14754a; background: #e2f6ec; }
.status-tag.attention { color: #9a5b00; background: #fff1d6; }
.status-tag.completed { color: #236aa2; background: #e2f0fb; }
.status-tag.neutral { color: #60717a; background: #edf1f3; }
.metric-grid { margin: 20rpx 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; }
.metric-card { padding: 28rpx 12rpx; background: #fff; border-radius: 20rpx; text-align: center; border: 1rpx solid #e5eef2; }
.metric-value { display: block; color: #206f91; font-size: 40rpx; font-weight: 700; }
.metric-label { display: block; margin-top: 8rpx; color: #71838d; font-size: 21rpx; }
.section-card { margin-top: 20rpx; padding: 30rpx; }
.section-header { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-bottom: 22rpx; }
.section-title { font-size: 30rpx; font-weight: 700; }
.summary-list, .record-list { display: flex; flex-direction: column; }
.summary-item, .record-row { min-height: 76rpx; display: flex; align-items: center; justify-content: space-between; gap: 20rpx; border-top: 1rpx solid #edf2f4; }
.summary-item:first-child, .record-row:first-child { border-top: 0; }
.summary-value { color: #206f91; font-weight: 700; }
.record-row > view { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 6rpx; }
.record-title { font-size: 26rpx; font-weight: 600; }
.record-time { color: #71838d; font-size: 22rpx; }
.record-value, .follow-status { color: #206f91; font-size: 25rpx; font-weight: 600; }
.action-bar { position: fixed; z-index: 10; left: 0; right: 0; bottom: 0; padding: 18rpx 24rpx calc(18rpx + env(safe-area-inset-bottom)); display: flex; gap: 16rpx; background: rgba(255, 255, 255, .96); border-top: 1rpx solid #e5eef2; }
.action-bar button, .state-card button { margin: 0; border-radius: 18rpx; font-size: 28rpx; }
.action-bar button { flex: 1; }
.primary-button { color: #fff; background: #2e86ab; }
.secondary-button { color: #216e8e; background: #edf7fa; }
button::after { border: 0; }
</style>

<style scoped>
/* Narrow-screen action spacing and reachable controls. */
.detail-page button { min-height: 44px; height: auto; display: flex; align-items: center; justify-content: center; padding: 10px 14px; line-height: 1.5; font-size: 14px; }
.detail-page .action-bar { gap: 12px; }
.detail-page { padding-bottom: calc(100px + env(safe-area-inset-bottom)); }
.detail-page .name-row { flex-wrap: wrap; }
.detail-page .patient-name { overflow-wrap: anywhere; }
</style>
