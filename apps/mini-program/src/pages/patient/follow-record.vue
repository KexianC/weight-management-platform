<template>
	<view class="follow-record-container">
		<!-- 头部 -->
		<view class="header">
			<view class="back-btn" @click="goBack">
				<Icon name="Arrows/arrow-left-line.svg" size="20" color="$gray-600" />
			</view>
			<view class="title">随访记录详情</view>
			<view class="action-btn" @click="openMessages">
				<Icon name="Communication/message-line.svg" size="20" color="$gray-600" />
			</view>
		</view>

		<!-- 加载状态 -->
		<view v-if="loading" class="loading">
			<text>加载中...</text>
		</view>

		<!-- 错误状态 -->
		<view v-else-if="error" class="error">
			<text>{{ error }}</text>
			<button @click="loadFollowRecord" class="retry-btn">重试</button>
		</view>

		<!-- 记录内容 -->
		<view v-else class="content">
			<!-- 基本信息 -->
			<view class="info-card">
				<view class="card-title">基本信息</view>
				<view class="info-item">
					<text class="label">随访类型：</text>
					<text class="value">{{ getFollowTypeName(followRecord.followType) }}</text>
				</view>
				<view class="info-item">
					<text class="label">完成时间：</text>
					<text class="value">{{ formatDateTime(followRecord.completedAt) }}</text>
				</view>
				<view class="info-item">
					<text class="label">状态：</text>
					<text class="value status" :class="followRecord.status">{{ getStatusText(followRecord.status) }}</text>
				</view>
				<view class="info-item" v-if="followRecord.doctorInfo">
					<text class="label">负责医生/营养师：</text>
					<text class="value">{{ followRecord.doctorInfo.name }}</text>
				</view>
			</view>

			<!-- 随访结果 -->
			<view class="result-card">
				<view class="card-title">随访结果</view>
				
				<!-- 体重检查结果 -->
				<view v-if="followRecord.followType === 'weight_check'" class="result-content">
					<view class="result-item">
						<text class="label">体重：</text>
						<text class="value weight">{{ followRecord.result?.weight || '--' }} kg</text>
					</view>
					<view class="result-item" v-if="followRecord.result?.note">
						<text class="label">备注：</text>
						<text class="value">{{ followRecord.result.note }}</text>
					</view>
				</view>

				<!-- 饮食指导结果 -->
				<view v-else-if="followRecord.followType === 'diet_guidance'" class="result-content">
					<view class="result-item" v-if="followRecord.result?.dietRecord">
						<text class="label">饮食记录：</text>
						<text class="value">{{ followRecord.result.dietRecord }}</text>
					</view>
					<view class="result-item" v-if="followRecord.result?.images && followRecord.result.images.length > 0">
						<text class="label">饮食照片：</text>
						<view class="image-list">
							<image 
								v-for="(image, index) in followRecord.result.images" 
								:key="index"
								:src="image" 
								class="diet-image"
								mode="aspectFill"
								@click="previewImage(image, followRecord.result.images)"
							/>
						</view>
					</view>
				</view>

				<!-- 健康评估结果 -->
				<view v-else-if="followRecord.followType === 'health_assessment'" class="result-content">
					<view v-if="followRecord.result?.questions && followRecord.result.questions.length > 0">
						<view v-for="(item, index) in followRecord.result.questions" :key="index" class="question-item">
							<view class="question">{{ index + 1 }}. {{ item.question }}</view>
							<view class="answer">{{ item.answer }}</view>
						</view>
					</view>
				</view>

				<!-- 运动计划结果 -->
				<view v-else-if="followRecord.followType === 'exercise_plan'" class="result-content">
					<view class="result-item" v-if="followRecord.result?.exerciseRecord">
						<text class="label">运动记录：</text>
						<text class="value">{{ followRecord.result.exerciseRecord }}</text>
					</view>
					<view class="result-item" v-if="followRecord.result?.completionNote">
						<text class="label">完成情况：</text>
						<text class="value">{{ followRecord.result.completionNote }}</text>
					</view>
				</view>

				<!-- 用药复查结果 -->
				<view v-else-if="followRecord.followType === 'medication_review'" class="result-content">
					<view class="result-item" v-if="followRecord.result?.medicationStatus">
						<text class="label">用药状况：</text>
						<text class="value">{{ followRecord.result.medicationStatus }}</text>
					</view>
					<view class="result-item" v-if="followRecord.result?.reviewNote">
						<text class="label">复查备注：</text>
						<text class="value">{{ followRecord.result.reviewNote }}</text>
					</view>
				</view>

				<!-- 通用结果 -->
				<view v-else class="result-content">
					<view class="result-item" v-if="followRecord.result?.content">
						<text class="label">内容：</text>
						<text class="value">{{ followRecord.result.content }}</text>
					</view>
				</view>
			</view>

			<!-- 总结 -->
			<view v-if="followRecord.summary" class="summary-card">
				<view class="card-title">总结</view>
				<view class="summary-content">
					<text>{{ followRecord.summary }}</text>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import { getFollowUpDetail } from '@/utils/api.js'
import { showToast } from '@/utils/common.js'
import Icon from '@/components/Icon.vue'

export default {
	components: {
		Icon
	},
	data() {
		return {
			followId: '',
			followRecord: {},
			loading: true,
			error: ''
		}
	},
	onLoad(options) {
		if (options.followId) {
			this.followId = options.followId
			this.loadFollowRecord()
		} else {
			this.error = '缺少随访ID参数'
			this.loading = false
		}
	},
	methods: {
		// 加载随访记录
		async loadFollowRecord() {
			try {
				this.loading = true
				this.error = ''
				
				const result = await getFollowUpDetail(this.followId)
				
				if (result.code === 200) {
					this.followRecord = result.data
				} else {
					this.error = result.message || '获取随访记录失败'
				}
			} catch (error) {
				console.error('加载随访记录失败:', error)
				this.error = '网络错误，请重试'
			} finally {
				this.loading = false
			}
		},
		
		// 获取随访类型名称
		getFollowTypeName(followType) {
			const typeMap = {
				weight_check: '体重检查',
				diet_guidance: '饮食指导',
				exercise_plan: '运动计划',
				health_assessment: '健康评估',
				medication_review: '用药复查',
				offline_visit: '线下随访',
				phone_visit: '电话随访'
			}
			return typeMap[followType] || '随访任务'
		},
		
		// 获取状态文本
		getStatusText(status) {
			const statusMap = {
				pending: '待完成',
				in_progress: '进行中',
				ongoing: '进行中',
				completed: '已完成',
				overdue: '已逾期',
				cancelled: '已取消'
			}
			return statusMap[status] || '未知'
		},
		
		// 格式化日期时间
		formatDateTime(dateTime) {
			if (!dateTime) return '--'
			
			// 直接解析ISO时间字符串，避免时区转换
			const timeStr = dateTime.replace('T', ' ').replace(/\.\d{3}Z$/, '')
			const [datePart, timePart] = timeStr.split(' ')
			const [year, month, day] = datePart.split('-').map(Number)
			const [hour, minute] = timePart.split(':').map(Number)
			
			return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
		},
		
		// 预览图片
		previewImage(current, urls) {
			uni.previewImage({
				current,
				urls
			})
		},
		
		// 打开消息
		openMessages() {
			if (this.followRecord.doctorId) {
				uni.navigateTo({
					url: `/pages/common/messages?otherUserId=${this.followRecord.doctorId}&otherUserName=${this.followRecord.doctorInfo?.name || '医生/营养师'}&relatedId=${this.followId}&relatedType=follow`
				})
			} else {
				showToast('医生/营养师信息不完整')
			}
		},
		
		// 返回
		goBack() {
			uni.navigateBack()
		}
	}
}
</script>

<style scoped>
.follow-record-container {
	background-color: #f5f5f5;
	min-height: 100vh;
}

/* 头部样式 */
.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 20rpx 30rpx;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	position: sticky;
	top: 0;
	z-index: 100;
}

.back-btn, .action-btn {
	width: 60rpx;
	height: 60rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.2);
	font-size: 32rpx;
}

.title {
	font-size: 36rpx;
	font-weight: bold;
}

/* 加载和错误状态 */
.loading, .error {
	padding: 100rpx 40rpx;
	text-align: center;
	color: #666;
}

.retry-btn {
	margin-top: 20rpx;
	padding: 20rpx 40rpx;
	background: #667eea;
	color: white;
	border: none;
	border-radius: 10rpx;
}

/* 内容区域 */
.content {
	padding: 20rpx;
}

/* 卡片样式 */
.info-card, .result-card, .summary-card {
	background: white;
	border-radius: 16rpx;
	padding: 30rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
}

.card-title {
	font-size: 32rpx;
	font-weight: bold;
	color: #333;
	margin-bottom: 20rpx;
	padding-bottom: 15rpx;
	border-bottom: 2rpx solid #f0f0f0;
}

/* 信息项样式 */
.info-item, .result-item {
	display: flex;
	margin-bottom: 15rpx;
	align-items: flex-start;
}

.info-item:last-child, .result-item:last-child {
	margin-bottom: 0;
}

.label {
	font-size: 28rpx;
	color: #666;
	min-width: 140rpx;
	flex-shrink: 0;
}

.value {
	font-size: 28rpx;
	color: #333;
	flex: 1;
	word-break: break-all;
}

.value.weight {
	font-size: 32rpx;
	font-weight: bold;
	color: #667eea;
}

/* 状态样式 */
.status {
	padding: 4rpx 12rpx;
	border-radius: 8rpx;
	font-size: 24rpx;
	color: white;
}

.status.completed {
	background: #52c41a;
}

.status.pending {
	background: #faad14;
}

.status.overdue {
	background: #ff4d4f;
}

.status.cancelled {
	background: #d9d9d9;
	color: #666;
}

/* 图片列表 */
.image-list {
	display: flex;
	flex-wrap: wrap;
	gap: 10rpx;
	margin-top: 10rpx;
}

.diet-image {
	width: 150rpx;
	height: 150rpx;
	border-radius: 8rpx;
	border: 2rpx solid #f0f0f0;
}

/* 问题项样式 */
.question-item {
	margin-bottom: 20rpx;
	padding: 20rpx;
	background: #f8f9fa;
	border-radius: 12rpx;
}

.question {
	font-size: 28rpx;
	color: #333;
	margin-bottom: 10rpx;
	font-weight: 500;
}

.answer {
	font-size: 26rpx;
	color: #666;
	padding-left: 20rpx;
	border-left: 4rpx solid #667eea;
}

/* 总结内容 */
.summary-content {
	font-size: 28rpx;
	color: #333;
	line-height: 1.6;
}
</style>

<style scoped>
.follow-record-container {
	box-sizing: border-box;
	min-height: 100vh;
	padding-bottom: 80rpx;
	background: linear-gradient(180deg, #eaf8fd 0, #f5fafc 260rpx, #f3f7f9 100%);
	color: #193b4e;
}

.follow-record-container view,
.follow-record-container text,
.follow-record-container image,
.follow-record-container button {
	box-sizing: border-box;
}

.header {
	position: sticky;
	top: 0;
	z-index: 10;
	height: auto;
	min-height: 106rpx;
	padding: calc(env(safe-area-inset-top) + 14rpx) 24rpx 14rpx;
	border-bottom: 1rpx solid rgba(42, 119, 151, 0.08);
	background: rgba(244, 251, 253, 0.94);
	backdrop-filter: blur(12rpx);
}

.back-btn,
.action-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 88rpx;
	height: 88rpx;
	border: 1rpx solid #dce9ee;
	border-radius: 20rpx;
	background: #ffffff;
	box-shadow: 0 5rpx 16rpx rgba(25, 81, 106, 0.06);
}

.title {
	font-size: 31rpx;
	font-weight: 700;
	letter-spacing: 1rpx;
	color: #193b4e;
}

.loading,
.error {
	min-height: 460rpx;
	margin: 24rpx;
	border: 1rpx dashed #c9dce4;
	border-radius: 24rpx;
	background: rgba(255, 255, 255, 0.76);
	font-size: 24rpx;
	color: #7b909b;
}

.retry-btn {
	min-width: 160rpx;
	height: 68rpx;
	margin-top: 22rpx;
	border: 0;
	border-radius: 18rpx;
	background: #168fb9;
	font-size: 23rpx;
	font-weight: 650;
	color: #ffffff;
}

.retry-btn::after {
	border: 0;
}

.content {
	padding: 24rpx;
}

.info-card,
.result-card,
.summary-card {
	margin-bottom: 20rpx;
	padding: 26rpx;
	border: 1rpx solid rgba(35, 115, 149, 0.07);
	border-radius: 24rpx;
	background: #ffffff;
	box-shadow: 0 10rpx 30rpx rgba(25, 81, 106, 0.065);
}

.card-title {
	position: relative;
	padding: 0 0 20rpx 20rpx;
	margin-bottom: 2rpx;
	border-bottom: 1rpx solid #eaf1f4;
	font-size: 29rpx;
	font-weight: 700;
	color: #193b4e;
}

.card-title::before {
	position: absolute;
	top: 4rpx;
	left: 0;
	width: 7rpx;
	height: 28rpx;
	border-radius: 5rpx;
	background: #168fb9;
	content: '';
}

.info-item,
.result-item {
	min-height: 80rpx;
	padding: 18rpx 0;
	border-bottom: 1rpx solid #edf3f5;
}

.info-item:last-child,
.result-item:last-child {
	border-bottom: 0;
}

.label {
	font-size: 23rpx;
	color: #7b909b;
}

.value {
	font-size: 24rpx;
	font-weight: 600;
	line-height: 1.55;
	color: #294b5e;
}

.value.weight {
	font-size: 38rpx;
	font-weight: 700;
	color: #168fb9;
}

.status {
	padding: 6rpx 12rpx;
	border-radius: 12rpx;
	font-size: 21rpx;
}

.status.completed {
	background: #eaf8f2;
	color: #31936f;
}

.status.pending {
	background: #fff5e8;
	color: #c9823e;
}

.status.overdue {
	background: #fff0ee;
	color: #d7655a;
}

.image-list {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12rpx;
	margin-top: 15rpx;
}

.diet-image {
	width: 100%;
	height: 188rpx;
	margin: 0;
	border: 1rpx solid #dce9ee;
	border-radius: 18rpx;
	background: #f1f7f9;
}

.question-item {
	margin-bottom: 16rpx;
	padding: 20rpx;
	border: 0;
	border-radius: 18rpx;
	background: #f5fafc;
}

.question {
	font-size: 24rpx;
	font-weight: 650;
	line-height: 1.5;
	color: #294b5e;
}

.answer {
	margin-top: 12rpx;
	padding: 15rpx 17rpx;
	border-left: 5rpx solid #78c5d9;
	border-radius: 0 14rpx 14rpx 0;
	background: #eaf8fc;
	font-size: 23rpx;
	line-height: 1.6;
	color: #476574;
}

.summary-content {
	padding: 20rpx;
	border-radius: 18rpx;
	background: #f4fafc;
	font-size: 24rpx;
	line-height: 1.75;
	color: #476574;
}
</style>
