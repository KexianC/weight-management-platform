<template>
	<view class="follow-record-container">
		<!-- 头部 -->
		<view class="header">
			<view class="header-content">
				<text class="header-title">随访记录详情</text>
				<text class="header-desc">查看患者提交的随访信息</text>
			</view>
		</view>

		<!-- 加载状态 -->
		<view v-if="loading" class="loading-container">
			<text class="loading-text">加载中...</text>
		</view>

		<!-- 记录内容 -->
		<view v-else-if="followRecord" class="record-content">
			<!-- 基本信息 -->
			<view class="info-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="User/user-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">基本信息</text>
				</view>
				<view class="info-card">
					<view class="info-row">
						<text class="info-label">客户：</text>
						<text class="info-value">{{ followRecord.patientName }}</text>
					</view>
					<view class="info-row">
						<text class="info-label">随访类型：</text>
						<text class="info-value">{{ getFollowTypeName(followRecord.followType) }}</text>
					</view>
					<view class="info-row">
					<text class="info-label">完成时间：</text>
					<text class="info-value">{{ formatDateTime(followRecord.completedAt) }}</text>
				</view>
					<view class="info-row">
						<text class="info-label">状态：</text>
						<text class="info-value status" :class="followRecord.status">{{ getStatusText(followRecord.status) }}</text>
					</view>
				</view>
			</view>

			<!-- 随访结果 -->
			<view v-if="followRecord.result" class="result-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="Document/clipboard-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">随访结果</text>
				</view>

				<!-- 体重检查结果 -->
				<view v-if="followRecord.followType === 'weight_check'" class="result-card">
					<view class="weight-result">
						<view class="weight-display">
							<text class="weight-number">{{ followUpWeight(followRecord.result) ?? '--' }}</text>
							<text class="weight-unit">kg</text>
						</view>
						<view v-if="followRecord.result.notes" class="weight-notes">
							<text class="notes-label">备注：</text>
							<text class="notes-content">{{ followRecord.result.notes }}</text>
						</view>
					</view>
				</view>

				<!-- 饮食指导结果 -->
				<view v-else-if="followRecord.followType === 'diet_guidance'" class="result-card">
					<view class="diet-result">
						<view v-if="followRecord.result.dietRecord" class="diet-record">
							<text class="record-label">饮食记录：</text>
							<text class="record-content">{{ followRecord.result.dietRecord }}</text>
						</view>
						<view v-if="followRecord.result.images && followRecord.result.images.length > 0" class="diet-images">
							<text class="images-label">饮食照片：</text>
							<view class="images-grid">
								<image 
									v-for="(image, index) in followRecord.result.images" 
									:key="index"
									class="diet-image" 
									:src="image" 
									mode="aspectFill"
									@click="previewImage(image, followRecord.result.images)"
								></image>
							</view>
						</view>
					</view>
				</view>

				<!-- 健康评估结果 -->
				<view v-else-if="followRecord.followType === 'health_assessment'" class="result-card">
					<view class="assessment-result">
						<view v-if="followRecord.result.answers" class="assessment-answers">
							<text class="answers-label">评估结果：</text>
							<view 
								v-for="(answer, index) in followRecord.result.answers" 
								:key="index"
								class="answer-item"
							>
								<text class="question-text">{{ answer.question }}</text>
								<text class="answer-text">{{ answer.answer }}</text>
							</view>
						</view>
					</view>
				</view>

				<!-- 运动计划结果 -->
				<view v-else-if="followRecord.followType === 'exercise_plan'" class="result-card">
					<view class="exercise-result">
						<view v-if="followRecord.result.exerciseRecord" class="exercise-record">
							<text class="record-label">运动记录：</text>
							<text class="record-content">{{ followRecord.result.exerciseRecord }}</text>
						</view>
						<view v-if="followRecord.result.completionNote" class="completion-note">
							<text class="note-label">完成情况：</text>
							<text class="note-content">{{ followRecord.result.completionNote }}</text>
						</view>
					</view>
				</view>

				<!-- 用药复查结果 -->
				<view v-else-if="followRecord.followType === 'medication_review'" class="result-card">
					<view class="medication-result">
						<view v-if="followRecord.result.medicationStatus" class="medication-status">
							<text class="status-label">用药状态：</text>
							<text class="status-content">{{ followRecord.result.medicationStatus }}</text>
						</view>
						<view v-if="followRecord.result.reviewNote" class="review-note">
							<text class="note-label">复查记录：</text>
							<text class="note-content">{{ followRecord.result.reviewNote }}</text>
						</view>
					</view>
				</view>

				<!-- 通用结果 -->
				<view v-else class="result-card">
					<view class="generic-result">
						<text class="content-label">内容：</text>
						<text class="content-text">{{ followRecord.result.content || followRecord.result }}</text>
					</view>
				</view>
			</view>

			<!-- 总结 -->
			<view v-if="followRecord.summary" class="summary-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="Design/edit-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">总结</text>
				</view>
				<view class="summary-card">
					<text class="summary-content">{{ followRecord.summary }}</text>
				</view>
			</view>
		</view>

		<!-- 错误状态 -->
		<view v-else class="error-container">
			<text class="error-text">记录不存在或加载失败</text>
			<button class="retry-btn" @click="loadFollowRecord">重试</button>
		</view>

		<!-- 操作按钮 -->
		<view class="action-section">
			<button class="btn-back" @click="goBack">返回</button>
			<button v-if="followRecord" class="btn-message" @click="openMessages">发消息</button>
		</view>
	</view>
</template>

<script>
import Icon from '@/components/Icon.vue'
import { getFollowUpDetail } from '../../api/follow.js'
import { showToast } from '../../utils/common.js'
import store from '../../store/index.js'
import { isNutritionist, getManagedClient } from '../../utils/managed-care.js'
import { followUpWeight } from '../../utils/follow-result.js'

export default {
	components: {
		Icon
	},
	data() {
		return {
			followId: '',
			followRecord: null,
			loading: true
		}
	},
	onLoad(options) {
		// 检查登录状态
		if (!store.isLogin()) {
			uni.reLaunch({
				url: '/pages/login/login'
			})
			return
		}

		if (options.id) {
			this.followId = options.id
			this.loadFollowRecord()
		} else {
			showToast('参数错误')
			uni.navigateBack()
		}
	},
	methods: {
		followUpWeight,
		// 加载随访记录
		async loadFollowRecord() {
			try {
				this.loading = true
				
				const result = await getFollowUpDetail(this.followId)
				if (result.code === 200) {
					if (isNutritionist()) {
						const assigned = await getManagedClient(result.data.patientId)
						result.data.patientName = assigned.patient.name
						result.data.patientInfo = { name: assigned.patient.name }
						if (result.data.result) result.data.result = { ...result.data.result, images: [] }
					}
					this.followRecord = result.data
				} else {
					showToast(result.message || '加载失败')
				}
			} catch (error) {
				this.followRecord = null
				console.error('加载随访记录失败:', error)
				showToast('网络错误，请重试')
			} finally {
				this.loading = false
			}
		},

		// 获取随访类型名称
		getFollowTypeName(type) {
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

		// 获取状态文本
		getStatusText(status) {
			const statusMap = {
				pending: '待随访',
				in_progress: '进行中',
				completed: '已完成',
				cancelled: '已取消'
			}
			return statusMap[status] || status
		},

		// 格式化日期时间
		formatDateTime(dateTime) {
			if (!dateTime) return ''
			
			const date = new Date(dateTime)
			return date.toLocaleString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			})
		},

		// 预览图片
		previewImage(current, urls) {
			uni.previewImage({
				current: current,
				urls: urls
			})
		},

		// 打开消息页面
		openMessages() {
			if (!this.followRecord) return
			
			uni.navigateTo({
				url: `/pages/common/messages?otherUserId=${this.followRecord.patientId}&otherUserName=${encodeURIComponent(this.followRecord.patientName)}&relatedId=${this.followRecord.id}&relatedType=follow_up`
			})
		},

		// 返回
		goBack() {
			uni.navigateBack()
		}
	}
}
</script>

<style lang="scss" scoped>
.follow-record-container {
	background-color: #f5f5f5;
	min-height: 100vh;
	padding-bottom: 120rpx;
}

.header {
	background: linear-gradient(135deg, #2E86AB 0%, #A23B72 100%);
	padding: 60rpx 30rpx 40rpx;
	color: white;
}

.header-content {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.header-title {
	font-size: 36rpx;
	font-weight: bold;
	margin-bottom: 10rpx;
}

.header-desc {
	font-size: 26rpx;
	opacity: 0.9;
}

.loading-container {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 400rpx;
}

.loading-text {
	font-size: 28rpx;
	color: #666;
}

.record-content {
	padding: 30rpx;
}

.info-section,
.result-section,
.summary-section {
	margin-bottom: 30rpx;
}

.section-title {
	display: flex;
	align-items: center;
	margin-bottom: 20rpx;
}

.title-icon {
	font-size: 32rpx;
	margin-right: 15rpx;
}

.title-text {
	font-size: 32rpx;
	font-weight: bold;
	color: #333;
}

.info-card,
.result-card,
.summary-card {
	background: white;
	border-radius: 20rpx;
	padding: 30rpx;
	box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
}

.info-row {
	display: flex;
	align-items: center;
	margin-bottom: 20rpx;
}

.info-row:last-child {
	margin-bottom: 0;
}

.info-label {
	font-size: 28rpx;
	color: #666;
	width: 160rpx;
	flex-shrink: 0;
}

.info-value {
	font-size: 28rpx;
	color: #333;
	flex: 1;
}

.status {
	padding: 8rpx 16rpx;
	border-radius: 12rpx;
	font-size: 24rpx;
	color: white;
}

.status.completed {
	background: #52c41a;
}

.status.pending {
	background: #faad14;
}

.status.in_progress {
	background: #1890ff;
}

.status.cancelled {
	background: #f5222d;
}

.weight-result {
	text-align: center;
}

.weight-display {
	margin-bottom: 30rpx;
}

.weight-number {
	font-size: 72rpx;
	font-weight: bold;
	color: #2E86AB;
}

.weight-unit {
	font-size: 36rpx;
	color: #666;
	margin-left: 10rpx;
}

.weight-notes {
	text-align: left;
}

.notes-label,
.record-label,
.images-label,
.answers-label,
.status-label,
.note-label,
.content-label {
	font-size: 28rpx;
	color: #666;
	margin-bottom: 15rpx;
	display: block;
}

.notes-content,
.record-content,
.status-content,
.note-content,
.content-text {
	font-size: 30rpx;
	color: #333;
	line-height: 1.6;
}

.images-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 15rpx;
	margin-top: 15rpx;
}

.diet-image {
	width: 200rpx;
	height: 200rpx;
	border-radius: 12rpx;
}

.assessment-answers {
	margin-top: 15rpx;
}

.answer-item {
	margin-bottom: 25rpx;
	padding: 20rpx;
	background: #f8f9fa;
	border-radius: 12rpx;
}

.answer-item:last-child {
	margin-bottom: 0;
}

.question-text {
	font-size: 28rpx;
	color: #666;
	margin-bottom: 10rpx;
	display: block;
}

.answer-text {
	font-size: 30rpx;
	color: #333;
	line-height: 1.5;
}

.exercise-record,
.completion-note,
.medication-status,
.review-note {
	margin-bottom: 25rpx;
}

.exercise-record:last-child,
.completion-note:last-child,
.medication-status:last-child,
.review-note:last-child {
	margin-bottom: 0;
}

.summary-content {
	font-size: 30rpx;
	color: #333;
	line-height: 1.6;
}

.error-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	height: 400rpx;
}

.error-text {
	font-size: 28rpx;
	color: #666;
	margin-bottom: 30rpx;
}

.retry-btn {
	padding: 20rpx 40rpx;
	background: #2E86AB;
	color: white;
	border: none;
	border-radius: 12rpx;
	font-size: 28rpx;
}

.action-section {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	background: white;
	padding: 30rpx;
	border-top: 1rpx solid #eee;
	display: flex;
	gap: 20rpx;
}

.btn-back,
.btn-message {
	flex: 1;
	height: 80rpx;
	border: none;
	border-radius: 12rpx;
	font-size: 30rpx;
	display: flex;
	align-items: center;
	justify-content: center;
}

.btn-back {
	background: #f0f0f0;
	color: #666;
}

.btn-message {
	background: #2E86AB;
	color: white;
}

/* 2026 clinical visual refresh */
.follow-record-container {
	padding-bottom: calc(150rpx + env(safe-area-inset-bottom));
	background:
		radial-gradient(circle at 88% 1%, rgba(102, 203, 229, 0.2), transparent 300rpx),
		linear-gradient(180deg, #eaf7fc 0, #f7fbfd 340rpx, #f5f9fb 100%);
	color: #15324a;
}

.header {
	padding: 36rpx 30rpx 26rpx;
	color: #15324a;
	background: transparent;
}

.header-content {
	align-items: flex-start;
}

.header-title {
	font-size: 36rpx;
	font-weight: 700;
	letter-spacing: 1rpx;
}

.header-desc {
	font-size: 24rpx;
	color: #68808e;
	opacity: 1;
}

.loading-container,
.error-container {
	height: 460rpx;
	margin: 0 24rpx;
	background: rgba(255, 255, 255, 0.84);
	border: 1rpx solid #dcecf2;
	border-radius: 24rpx;
}

.loading-text,
.error-text {
	color: #718692;
}

.record-content {
	padding: 0 24rpx 24rpx;
}

.info-section,
.result-section,
.summary-section {
	margin-bottom: 28rpx;
}

.section-title {
	margin-bottom: 18rpx;
	padding: 0 4rpx;
}

.title-icon {
	width: 54rpx;
	height: 54rpx;
	margin-right: 14rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	background: #eaf7fb;
	border-radius: 15rpx;
}

.title-text {
	font-size: 30rpx;
	font-weight: 700;
	color: #17364c;
}

.info-card,
.result-card,
.summary-card {
	padding: 28rpx;
	background: #ffffff;
	border: 1rpx solid #dcecf2;
	border-radius: 24rpx;
	box-shadow: 0 10rpx 28rpx rgba(31, 119, 151, 0.07);
}

.info-row {
	min-height: 64rpx;
	margin-bottom: 0;
	border-bottom: 1rpx solid #edf3f5;
}

.info-row:last-child {
	border-bottom: 0;
}

.info-label {
	font-size: 25rpx;
	color: #718692;
}

.info-value {
	font-size: 27rpx;
	font-weight: 500;
	color: #28485b;
}

.status {
	flex: none;
	padding: 7rpx 16rpx;
	border-radius: 999rpx;
	font-size: 23rpx;
	font-weight: 600;
}

.status.completed {
	color: #26895a;
	background: #e7f7ef;
}

.status.pending {
	color: #aa671f;
	background: #fff3e5;
}

.status.in_progress {
	color: #167fa5;
	background: #e7f6fb;
}

.status.cancelled {
	color: #b55558;
	background: #fdecee;
}

.weight-display {
	margin: 10rpx 0 30rpx;
	padding: 28rpx 20rpx;
	background: #f1fafc;
	border-radius: 20rpx;
}

.weight-number {
	font-size: 78rpx;
	font-weight: 700;
	color: #1688b1;
}

.weight-unit {
	font-size: 30rpx;
	color: #607786;
}

.notes-label,
.record-label,
.images-label,
.answers-label,
.status-label,
.note-label,
.content-label {
	font-size: 25rpx;
	color: #718692;
}

.notes-content,
.diet-record .record-content,
.status-content,
.note-content,
.content-text,
.summary-content {
	font-size: 28rpx;
	color: #365567;
	line-height: 1.7;
}

.diet-image {
	width: calc((100% - 30rpx) / 3);
	height: 190rpx;
	border-radius: 16rpx;
	border: 1rpx solid #dcebf0;
}

.answer-item {
	padding: 22rpx;
	background: #f6fafc;
	border: 1rpx solid #e2eef2;
	border-radius: 16rpx;
}

.question-text {
	color: #718692;
}

.answer-text {
	color: #29495b;
}

.retry-btn {
	color: #ffffff;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	border-radius: 18rpx;
	box-shadow: 0 7rpx 18rpx rgba(22, 132, 173, 0.18);
}

.action-section {
	padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
	background: rgba(255, 255, 255, 0.97);
	border-top-color: #dcecf2;
	box-shadow: 0 -8rpx 28rpx rgba(30, 95, 119, 0.08);
}

.btn-back,
.btn-message {
	height: 78rpx;
	border-radius: 18rpx;
	font-size: 28rpx;
}

.btn-back {
	color: #536d7c;
	background: #f2f7f9;
	border: 1rpx solid #d8e7ed;
}

.btn-message {
	color: #ffffff;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	box-shadow: 0 7rpx 18rpx rgba(22, 132, 173, 0.18);
}
</style>

<style scoped>
/* Final touch target audit: layout only. */
.follow-record-container button { min-height: 44px; height: auto; display: flex; align-items: center; justify-content: center; padding: 10px 14px; line-height: 1.5; font-size: 14px; }
.follow-record-container .action-section { gap: 12px; }
</style>
