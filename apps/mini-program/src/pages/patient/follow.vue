<template>
	<view class="follow-container patient-theme">
		<!-- 头部统计区域 -->
		<view class="stats-section">
			<view class="stat-card">
				<text class="stat-number">{{ todayFollows }}</text>
				<text class="stat-label">今日随访</text>
			</view>
			<view class="stat-card">
				<text class="stat-number">{{ pendingFollows }}</text>
				<text class="stat-label">待完成</text>
			</view>
			<view class="stat-card">
				<text class="stat-number">{{ completedFollows }}</text>
				<text class="stat-label">已完成</text>
			</view>
			<view class="stat-card">
				<text class="stat-number">{{ overdueFollows }}</text>
				<text class="stat-label">已逾期</text>
			</view>
		</view>

		<!-- 随访筛选 -->
		<view class="filter-section">
			<view 
				class="filter-item" 
				:class="{active: followFilter === 'all'}"
				@click="setFollowFilter('all')"
			>
				<text class="filter-text">全部</text>
			</view>
			<view 
				class="filter-item" 
				:class="{active: followFilter === 'pending'}"
				@click="setFollowFilter('pending')"
			>
				<text class="filter-text">待完成</text>
				<view class="filter-badge" v-if="pendingFollows > 0">
					<text class="badge-text">{{ pendingFollows }}</text>
				</view>
			</view>
			<view 
				class="filter-item" 
				:class="{active: followFilter === 'completed'}"
				@click="setFollowFilter('completed')"
			>
				<text class="filter-text">已完成</text>
			</view>
			<view 
				class="filter-item" 
				:class="{active: followFilter === 'overdue'}"
				@click="setFollowFilter('overdue')"
			>
				<text class="filter-text">已逾期</text>
				<view class="filter-badge" v-if="overdueFollows > 0">
					<text class="badge-text">{{ overdueFollows }}</text>
				</view>
			</view>
		</view>

		<!-- 随访列表 -->
		<scroll-view 
			class="follow-list" 
			scroll-y 
			@scrolltolower="loadMore"
			refresher-enabled
			:refresher-triggered="refresherTriggered"
			@refresherrefresh="onRefresh"
		>
			<view 
				class="follow-item" 
				v-for="(follow, index) in filteredFollows" 
				:key="index"
				@click="handleFollow(follow)"
			>
				<view class="follow-header">
					<view class="follow-info">
						<Icon :name="getFollowIcon(follow.followType)" size="20" color="$patient-primary" />
						<view class="follow-details">
							<text class="follow-title">{{ getFollowTitle(follow.followType) }}</text>
							<text class="follow-desc">{{ follow.note || '请按时完成随访任务' }}</text>
						</view>
					</view>
					<view class="follow-status">
						<view class="status-badge" :class="follow.status">
							<text class="status-text">{{ getStatusText(follow.status) }}</text>
						</view>
					</view>
				</view>
				<view class="follow-meta">
					<view class="follow-time">
						<Icon name="System/time-line.svg" size="14" color="$gray-500" />
						<text>{{ formatTime(follow.scheduledTime) }}</text>
					</view>
					<Icon name="User/user-line.svg" size="14" color="$gray-500" />
				<text class="follow-doctor">{{ follow.doctorInfo?.name || '医生/营养师' }}</text>
					<text class="follow-priority" :class="follow.priority">{{ getPriorityText(follow.priority) }}</text>
				</view>
				<view class="follow-actions" v-if="follow.status === 'pending' || follow.status === 'ongoing' || follow.status === 'overdue'">
					<button 
						class="btn-start" 
						:class="{overdue: follow.status === 'overdue'}"
						@click.stop="startFollow(follow)"
					>
						{{ follow.status === 'overdue' ? '补充完成' : follow.status === 'ongoing' ? '继续完成' : '开始随访' }}
					</button>
					<button 
						class="btn-message" 
						@click.stop="openMessages(follow)"
					>
						留言
					</button>
				</view>
				<view class="follow-actions" v-else-if="follow.status === 'completed'">
					<button 
						class="btn-view" 
						@click.stop="viewFollowRecord(follow)"
					>
						查看记录
					</button>
					<button 
						class="btn-message" 
						@click.stop="openMessages(follow)"
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
			<view v-if="!loading && filteredFollows.length === 0" class="empty-state">
				<Icon name="Business/calendar-line.svg" size="40" color="$gray-300"></Icon>
				<text class="empty-text">暂无随访数据</text>
			</view>
		</scroll-view>

		<!-- 随访详情弹窗 -->
		<view class="follow-modal" v-if="showModal" @click="closeModal">
			<view class="modal-content" @click.stop>
				<view class="modal-header">
					<text class="modal-title">{{ selectedFollow && selectedFollow.followType ? getFollowTitle(selectedFollow.followType) : '随访详情' }}</text>
					<view class="modal-close" @click="closeModal">
						<Icon name="System/close-line.svg" size="18" color="$gray-600" />
					</view>
				</view>

				<view class="modal-body">
					<!-- 体重检查 -->
					<view v-if="selectedFollow && selectedFollow.followType === 'weight_check'" class="follow-form">
						<view class="form-title">
						<Icon name="Business/bar-chart-line.svg" size="16" color="$patient-primary" />
						体重记录
					</view>
						<view class="form-group">
							<text class="form-label">当前体重 (kg)</text>
							<input 
						class="form-input" 
						type="number" 
						v-model="followData.weight"
						placeholder="请输入体重"
						maxlength="6"
						:max="1000"
						:min="1"
						step="0.1"
					/>
						</view>
						<view class="form-group">
							<text class="form-label">备注</text>
							<textarea 
								class="form-textarea" 
								v-model="followData.note"
								placeholder="记录身体状况、饮食情况等"
								maxlength="200"
							></textarea>
						</view>
					</view>

					<!-- 饮食指导 -->
					<view v-else-if="selectedFollow && selectedFollow.followType === 'diet_guidance'" class="follow-form">
						<view class="form-title">
						<Icon name="Food/bowl-line.svg" size="16" color="$patient-primary" />
						饮食记录
					</view>
						<view class="form-group">
							<text class="form-label">今日饮食情况</text>
							<textarea 
								class="form-textarea" 
								v-model="followData.dietRecord"
								placeholder="请详细记录今日三餐及加餐情况"
								maxlength="500"
							></textarea>
						</view>
						<view class="form-group">
							<text class="form-label">饮食照片</text>
							<view class="upload-grid">
								<view 
									class="upload-item" 
									v-for="(image, index) in followData.images" 
									:key="index"
								>
									<image class="upload-image" :src="image" mode="aspectFill"></image>
									<view class="image-delete" @click="deleteImage(index)">
										<Icon name="System/close-line.svg" size="16" color="#FFFFFF" />
									</view>
								</view>
								<view class="upload-add" @click="chooseImage" v-if="followData.images.length < 3">
									<Icon name="System/add-line.svg" size="20" color="$patient-primary" />
									<text class="add-text">添加照片</text>
								</view>
							</view>
						</view>
					</view>

					<!-- 健康评估 -->
					<view v-else-if="selectedFollow && selectedFollow.followType === 'health_assessment'" class="follow-form">
						<view class="form-title">
						<Icon name="Buildings/hospital-line.svg" size="16" color="$patient-primary" />
						健康评估问卷
					</view>
						<template v-if="healthQuestions && healthQuestions.length > 0">
							<view 
								class="question-item" 
								v-for="(question, qIndex) in healthQuestions" 
								:key="qIndex"
							>
							<text class="question-text">{{ qIndex + 1 }}. {{ question.question }}</text>
							
							<!-- 单选题 -->
							<view v-if="question.type === 'radio'" class="options">
								<view 
									class="option-item" 
									v-for="(option, oIndex) in question.options" 
									:key="oIndex"
									@click="selectedFollow && healthQuestions ? selectOption(qIndex, oIndex) : null"
								>
									<view class="option-radio" :class="{selected: question.answer === oIndex}">
										<view class="radio-dot" v-if="question.answer === oIndex"></view>
									</view>
									<text class="option-text">{{ option }}</text>
								</view>
							</view>
							
							<!-- 文本题 -->
							<textarea 
								v-else
								class="question-textarea" 
								v-model="question.answer"
								:placeholder="question.placeholder"
								maxlength="300"
								></textarea>
							</view>
						</template>
					</view>

					<!-- 运动计划 -->
					<view v-else-if="selectedFollow && selectedFollow.followType === 'exercise_plan'" class="follow-form">
						<view class="form-title">
						<Icon name="Others/basketball-line.svg" size="16" color="$patient-primary" />
						运动记录
					</view>
						<view class="form-group">
							<text class="form-label">运动完成情况</text>
							<textarea 
								class="form-textarea" 
								v-model="followData.content"
								placeholder="请详细记录运动类型、时长、强度等情况"
								maxlength="500"
							></textarea>
						</view>
						<view class="form-group">
							<text class="form-label">备注</text>
							<textarea 
								class="form-textarea" 
								v-model="followData.note"
								placeholder="记录运动感受、身体反应等"
								maxlength="200"
							></textarea>
						</view>
					</view>

					<!-- 用药复查 -->
					<view v-else-if="selectedFollow && selectedFollow.followType === 'medication_review'" class="follow-form">
						<view class="form-title">
						<Icon name="Health/capsule-line.svg" size="16" color="$patient-primary" />
						用药情况
					</view>
						<view class="form-group">
							<text class="form-label">用药依从性</text>
							<textarea 
								class="form-textarea" 
								v-model="followData.content"
								placeholder="请详细记录用药情况、是否按时服药、有无漏服等"
								maxlength="500"
							></textarea>
						</view>
						<view class="form-group">
							<text class="form-label">不良反应</text>
							<textarea 
								class="form-textarea" 
								v-model="followData.note"
								placeholder="如有不良反应或不适症状，请详细描述"
								maxlength="200"
							></textarea>
						</view>
					</view>

					<!-- 其他类型 -->
					<view v-else class="follow-form">
						<view class="form-title">
						<Icon name="Document/file-text-line.svg" size="16" color="$patient-primary" />
						随访记录
					</view>
						<view class="form-group">
							<text class="form-label">随访内容</text>
							<textarea 
								class="form-textarea" 
								v-model="followData.content"
								placeholder="请填写随访相关内容"
								maxlength="500"
							></textarea>
						</view>
					</view>
				</view>

				<view class="modal-footer">
					<button class="cancel-btn" @click="closeModal">取消</button>
					<button class="submit-btn" @click="submitFollow" :disabled="!canSubmit">提交</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import store from '../../store/index.js'
import { getFollowUpList, getFollowUpDetail, updateFollowUp, completeFollowUp } from '../../api/follow.js'
import { showToast } from '../../utils/common.js'
import Icon from '../../components/Icon.vue'

export default {
	components: {
		Icon
	},
	data() {
		return {
			followFilter: 'all',
			showModal: false,
			selectedFollow: {},
			loading: false,
			currentPage: 1,
			pageSize: 20,
			follows: [],
			pageLoaded: false,
			listLoading: false,
			listRequest: 0,
			hasMore: true,
			refresherTriggered: false,
			// 随访数据
			followData: {
				weight: '',
				note: '',
				dietRecord: '',
				images: [],
				content: ''
			},
			// 健康评估问卷
			healthQuestions: [
				{
					question: '您最近一周的整体身体状况如何？',
					type: 'radio',
					options: ['很好', '良好', '一般', '较差', '很差'],
					answer: null
				},
				{
					question: '您是否有食欲不振的情况？',
					type: 'radio',
					options: ['从未', '偶尔', '经常', '总是'],
					answer: null
				},
				{
					question: '请描述您最近的睡眠质量',
					type: 'text',
					placeholder: '请详细描述您的睡眠情况...',
					answer: ''
				},
				{
					question: '您最近是否有不适症状？',
					type: 'text',
					placeholder: '如有不适，请详细描述症状...',
					answer: ''
				}
			]
		}
	},
	computed: {
		// 过滤后的随访列表
		filteredFollows() {
			if (this.followFilter === 'all') {
				return this.follows
			} else {
				return this.follows.filter(follow => follow.status === this.followFilter)
			}
		},
		// 今日随访数量
		todayFollows() {
			const today = new Date().toDateString()
			return this.follows.filter(follow => {
				return new Date(follow.scheduledTime).toDateString() === today
			}).length
		},
		// 待完成随访数量
		pendingFollows() {
			return this.follows.filter(follow => follow.status === 'pending').length
		},
		// 已完成随访数量
		completedFollows() {
			return this.follows.filter(follow => follow.status === 'completed').length
		},
		// 已逾期随访数量
		overdueFollows() {
			return this.follows.filter(follow => follow.status === 'overdue').length
		},
		// 是否可以提交
		canSubmit() {
			if (!this.selectedFollow || !this.selectedFollow.followType) return false
			
			switch (this.selectedFollow.followType) {
				case 'weight_check': {
					// 验证体重输入
					const weight = parseFloat(this.followData.weight)
					return this.followData.weight && !isNaN(weight) && weight > 0 && weight <= 1000
				}
				case 'diet_guidance':
					return this.followData.dietRecord && this.followData.dietRecord.trim().length > 0
				case 'health_assessment':
					return this.healthQuestions.every(q => q.answer !== null && q.answer !== '')
				case 'exercise_plan':
					return this.followData.content && this.followData.content.trim().length > 0
				case 'medication_review':
					return this.followData.content && this.followData.content.trim().length > 0
				default:
					return this.followData.content && this.followData.content.trim().length > 0
			}
		}
	},
	onLoad() {
		// 检查登录状态
		if (!store.isLogin()) {
			uni.reLaunch({
				url: '/pages/login/login'
			})
			return
		}
		
		// The initial onShow performs the sole first-page request.
		this.pageLoaded = true
		
		// 检查是否有从通知跳转的followId
		this.checkFollowIdFromStorage()
	},
	onShow() {
		// 页面显示时刷新数据（避免首次加载时重复调用）
		if (this.pageLoaded) {
			this.loadFollows(true)
		}
		
		// 检查是否有从通知跳转的followId
		this.checkFollowIdFromStorage()
	},

	onUnload() { this.listRequest++; this.follows = []; this.showModal = false },
	methods: {
		// 设置随访筛选
		setFollowFilter(filter) {
			this.followFilter = filter
		},
		
		// 加载随访列表
		async loadFollows(refresh = false, requestedPage = this.currentPage) {
			if (this.listLoading || (!refresh && !this.hasMore)) return
			const userInfo = store.getUserInfo()
			const patientId = userInfo?.userId || userInfo?.id
			if (!patientId) { this.follows = []; showToast('请重新登录'); return }
			const page = refresh ? 1 : requestedPage
			const request = ++this.listRequest
			this.listLoading = true
			this.loading = true
			try {
				const result = await getFollowUpList({ patientId, page, limit: this.pageSize })
				const currentUser = store.getUserInfo()
				if (request !== this.listRequest || patientId !== (currentUser?.userId || currentUser?.id)) return
				if (result.code !== 200) throw new Error(result.message || '获取随访列表失败')
				const rows = result.data.followUps || []
				const merged = refresh ? rows : this.follows.concat(rows)
				const unique = new Map()
				for (const row of merged) { const id = row.followId || row.id; if (id) unique.set(id, row) }
				this.follows = [...unique.values()]
				this.currentPage = page
				const total = Number(result.data.total)
				this.hasMore = typeof result.data.hasMore === 'boolean' ? result.data.hasMore : Number.isFinite(total) ? page * this.pageSize < total : rows.length >= this.pageSize
			} catch (error) {
				if (request === this.listRequest) showToast(error.message || '网络错误，请重试')
			} finally {
				if (request === this.listRequest) { this.listLoading = false; this.loading = false }
			}
		},
		loadMore() {
			if (!this.loading && !this.listLoading && this.hasMore) this.loadFollows(false, this.currentPage + 1)
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
		
		// 获取随访图标
		getFollowIcon(followType) {
			const iconMap = {
				weight_check: 'Others/scales-line.svg',
				diet_guidance: 'Food/bowl-line.svg',
				exercise_plan: 'Others/basketball-line.svg',
				health_assessment: 'Buildings/hospital-line.svg',
				medication_review: 'Health/capsule-line.svg'
			}
			return iconMap[followType] || 'Document/clipboard-line.svg'
		},
		
		// 获取随访标题
		getFollowTitle(followType) {
			const titleMap = {
				weight_check: '体重检查',
				diet_guidance: '饮食指导',
				exercise_plan: '运动计划',
				health_assessment: '健康评估',
				medication_review: '用药复查',
				offline_visit: '线下随访',
				phone_visit: '电话随访'
			}
			return titleMap[followType] || '随访任务'
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
		
		// 获取优先级文本
		getPriorityText(priority) {
			const priorityMap = {
				low: '低',
				normal: '普通',
				high: '高',
				urgent: '紧急'
			}
			return priorityMap[priority] || ''
		},
		
		// 格式化时间
		formatTime(time) {
			if (!time) return ''
			
			// 直接解析ISO时间字符串，避免时区转换
			const timeStr = time.replace('T', ' ').replace(/\.\d{3}Z$/, '')
			const [datePart, timePart] = timeStr.split(' ')
			const [year, month, day] = datePart.split('-').map(Number)
			const [hour, minute] = timePart.split(':').map(Number)
			
			// 获取当前日期
			const now = new Date()
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
			const targetDate = new Date(year, month - 1, day)
			
			// 计算日期差异
			const diffDays = Math.floor((targetDate - today) / (1000 * 60 * 60 * 24))
			const formattedTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
			
			if (diffDays === 0) {
				return `今天 ${formattedTime}`
			} else if (diffDays === 1) {
				return `明天 ${formattedTime}`
			} else if (diffDays === -1) {
				return `昨天 ${formattedTime}`
			} else {
				return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${formattedTime}`
			}
		},
		
		// 处理随访点击
		handleFollow(follow) {
			if (follow.status === 'completed') {
				this.viewFollowRecord(follow)
			} else if (follow.status === 'pending' || follow.status === 'ongoing' || follow.status === 'overdue') {
				this.startFollow(follow)
			}
		},
		
		// 开始随访
		startFollow(follow) {
			this.selectedFollow = follow
			this.showModal = true
			this.resetFormData()
		},
		
		// 查看随访记录
		viewFollowRecord(follow) {
			uni.navigateTo({
				url: `/pages/patient/follow-record?followId=${follow.followId}`
			})
		},
		
		// 打开消息
		openMessages(follow) {
			uni.navigateTo({
				url: `/pages/common/messages?otherUserId=${follow.doctorId}&otherUserName=${follow.doctorInfo?.name || '医生/营养师'}&relatedId=${follow.followId}&relatedType=follow`
			})
		},
		
		// 关闭弹窗
		closeModal() {
			this.showModal = false
			this.selectedFollow = {}
			this.resetFormData()
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
			const follow = this.follows.find(f => f.followId === followId)
			if (follow) {
				// 如果找到对应的随访任务，自动打开
				this.handleFollow(follow)
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
		
		// 重置表单数据
		resetFormData() {
			this.followData = {
				weight: '',
				note: '',
				dietRecord: '',
				images: [],
				content: ''
			}
			
			// 重置问卷答案
			this.healthQuestions.forEach(question => {
				question.answer = question.type === 'radio' ? null : ''
			})
		},
		
		// 选择选项
		selectOption(questionIndex, optionIndex) {
			if (this.healthQuestions && this.healthQuestions[questionIndex]) {
				this.healthQuestions[questionIndex].answer = optionIndex
			}
		},
		
		// 选择图片
		chooseImage() {
			uni.chooseImage({
				count: 3 - this.followData.images.length,
				sizeType: ['compressed'],
				sourceType: ['camera', 'album'],
				success: (res) => {
					this.followData.images = this.followData.images.concat(res.tempFilePaths)
				}
			})
		},
		
		// 删除图片
		deleteImage(index) {
			this.followData.images.splice(index, 1)
		},
		
		// 提交随访
		async submitFollow() {
			if (!this.canSubmit) {
				// 根据随访类型给出具体提示
				if (this.selectedFollow.followType === 'weight_check') {
					const weight = parseFloat(this.followData.weight)
					if (!this.followData.weight) {
						showToast('请输入体重')
					} else if (isNaN(weight) || weight <= 0) {
						showToast('请输入有效的体重数值')
					} else if (weight > 1000) {
						showToast('体重不能超过1000kg')
					} else {
						showToast('请完成必填项')
					}
				} else {
					showToast('请完成必填项')
				}
				return
			}
			
			try {
				this.loading = true
				
				// 构建提交数据
			let resultData = {}
			
			// 预先声明变量以避免lexical declaration错误
			const weight = parseFloat(this.followData.weight)
			
			switch (this.selectedFollow.followType) {
				case 'weight_check':
					// 再次验证体重数据
					if (isNaN(weight) || weight <= 0 || weight > 1000) {
						showToast('体重数据无效，请输入0-1000之间的数值')
						return
					}
					resultData = {
						weight: weight,
						note: this.followData.note
					}
					break
				case 'diet_guidance':
					resultData = {
						dietRecord: this.followData.dietRecord,
						images: this.followData.images
					}
					break
				case 'health_assessment':
					resultData = {
						questions: this.healthQuestions.map(q => ({
							question: q.question,
							answer: q.type === 'radio' ? q.options[q.answer] : q.answer
						}))
					}
					break
				case 'exercise_plan':
					resultData = {
						exerciseRecord: this.followData.content,
						completionNote: this.followData.note || ''
					}
					break
				case 'medication_review':
					resultData = {
						medicationStatus: this.followData.content,
						reviewNote: this.followData.note || ''
					}
					break
				default:
					resultData = {
						content: this.followData.content
					}
			}
				
				// 调用完成随访API
				const result = await completeFollowUp(
					this.selectedFollow.followId,
					resultData,
					`患者完成${this.getFollowTitle(this.selectedFollow.followType)}随访`
				)
				
				if (result.code === 200) {
					showToast('随访提交成功', 'success')
					this.closeModal()
					this.loadFollows(true) // 刷新列表
				} else {
					showToast(result.message || '提交失败')
				}
			} catch (error) {
				console.error('提交随访失败:', error)
				showToast('网络错误，请重试')
			} finally {
				this.loading = false
			}
		}
	}
}
</script>

<style scoped>
.follow-container {
	padding: 20rpx;
	background-color: #f5f5f5;
	min-height: 100vh;
}

/* 统计区域 */
.stats-section {
	display: flex;
	justify-content: space-between;
	margin-bottom: 20rpx;
}

.stat-card {
	flex: 1;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	border-radius: 16rpx;
	padding: 30rpx 20rpx;
	margin: 0 10rpx;
	text-align: center;
	color: white;
	box-shadow: 0 8rpx 20rpx rgba(102, 126, 234, 0.3);
}

.stat-card:first-child {
	margin-left: 0;
}

.stat-card:last-child {
	margin-right: 0;
}

.stat-number {
	font-size: 48rpx;
	font-weight: bold;
	display: block;
	margin-bottom: 10rpx;
}

.stat-label {
	font-size: 24rpx;
	opacity: 0.9;
}

/* 筛选区域 */
.filter-section {
	display: flex;
	background: white;
	border-radius: 16rpx;
	padding: 10rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
}

.filter-item {
	flex: 1;
	padding: 20rpx;
	text-align: center;
	border-radius: 12rpx;
	position: relative;
	transition: all 0.3s ease;
}

.filter-item.active {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);
}

.filter-text {
	font-size: 28rpx;
	font-weight: 500;
}

.filter-badge {
	position: absolute;
	top: 10rpx;
	right: 10rpx;
	background: #ff4757;
	color: white;
	border-radius: 20rpx;
	min-width: 32rpx;
	height: 32rpx;
	line-height: 32rpx;
	font-size: 20rpx;
	text-align: center;
}

.badge-text {
	font-size: 20rpx;
}

/* 随访列表 */
.follow-list {
	height: calc(100vh - 300rpx);
}

.follow-item {
	background: white;
	border-radius: 16rpx;
	padding: 30rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
	transition: all 0.3s ease;
}

.follow-item:active {
	transform: scale(0.98);
}

.follow-header {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 20rpx;
}

.follow-info {
	display: flex;
	align-items: flex-start;
	flex: 1;
}

.follow-icon {
	font-size: 40rpx;
	margin-right: 20rpx;
	margin-top: 5rpx;
}

.follow-details {
	flex: 1;
}

.follow-title {
	font-size: 32rpx;
	font-weight: bold;
	color: #333;
	display: block;
	margin-bottom: 10rpx;
}

.follow-desc {
	font-size: 26rpx;
	color: #666;
	line-height: 1.4;
}

.follow-status {
	margin-left: 20rpx;
}

.status-badge {
	padding: 8rpx 16rpx;
	border-radius: 20rpx;
	font-size: 22rpx;
	text-align: center;
}

.status-badge.pending {
	background: #fff3cd;
	color: #856404;
}

.status-badge.in_progress,
.status-badge.ongoing {
	background: #d1ecf1;
	color: #0c5460;
}

.status-badge.completed {
	background: #d4edda;
	color: #155724;
}

.status-badge.overdue {
	background: #f8d7da;
	color: #721c24;
}

.status-badge.cancelled {
	background: #e2e3e5;
	color: #383d41;
}

.follow-meta {
	display: flex;
	align-items: center;
	gap: 20rpx;
	margin-bottom: 20rpx;
	flex-wrap: wrap;
}

.follow-time,
.follow-doctor {
	font-size: 24rpx;
	color: #666;
}

.follow-priority {
	font-size: 22rpx;
	padding: 4rpx 12rpx;
	border-radius: 12rpx;
	font-weight: 500;
}

.follow-priority.low {
	background: #e8f5e8;
	color: #4caf50;
}

.follow-priority.normal {
	background: #e3f2fd;
	color: #2196f3;
}

.follow-priority.high {
	background: #fff3e0;
	color: #ff9800;
}

.follow-priority.urgent {
	background: #ffebee;
	color: #f44336;
}

.follow-actions {
	display: flex;
	gap: 15rpx;
	margin-top: 20rpx;
}

.btn-start,
.btn-view,
.btn-message {
	flex: 1;
	height: 60rpx;
	border-radius: 8rpx;
	font-size: 26rpx;
	border: none;
	transition: all 0.3s ease;
	display: flex;
	align-items: center;
	justify-content: center;
}

.btn-start {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
}

.btn-start.overdue {
	background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
	color: white;
}

.btn-view {
	background: #52c41a;
	color: white;
}

.btn-message {
	background: #f0f0f0;
	color: #666;
}

.btn-start:active,
.btn-view:active,
.btn-message:active {
	transform: scale(0.95);
}

/* 加载和空状态 */
.loading-more {
	padding: 40rpx;
	text-align: center;
}

.empty-state {
	padding: 100rpx 40rpx;
	text-align: center;
}

.empty-text {
	font-size: 28rpx;
	color: #999;
	margin-top: 20rpx;
	display: block;
}

/* 弹窗样式 */
.follow-modal {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 1000;
	overflow: hidden;
}

.modal-content {
	width: 90%;
	max-width: 600rpx;
	max-height: 85vh;
	background: white;
	border-radius: 20rpx;
	overflow: hidden;
	display: flex;
	flex-direction: column;
}

.modal-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 30rpx;
	border-bottom: 1rpx solid #eee;
}

.modal-title {
	font-size: 32rpx;
	font-weight: bold;
	color: #333;
}

.modal-close {
	width: 88rpx;
	height: 88rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	background: #f5f5f5;
}

.close-icon {
	font-size: 40rpx;
	color: #999;
}

.modal-body {
	flex: 1;
	overflow-y: auto;
	padding: 30rpx;
	min-height: 0;
}

.follow-form {
	width: 100%;
}

.form-title {
	font-size: 28rpx;
	font-weight: bold;
	color: #333;
	margin-bottom: 30rpx;
	padding-bottom: 15rpx;
	border-bottom: 2rpx solid #eee;
}

.form-group {
	margin-bottom: 30rpx;
}

.form-label {
	font-size: 28rpx;
	color: #333;
	display: block;
	margin-bottom: 15rpx;
}

.form-input {
	width: 100%;
	padding: 20rpx;
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	font-size: 28rpx;
	box-sizing: border-box;
	line-height: 1.4;
	min-height: 80rpx;
}

.form-textarea {
	width: 100%;
	min-height: 120rpx;
	padding: 20rpx;
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	font-size: 28rpx;
	box-sizing: border-box;
	resize: none;
}

.form-input:focus,
.form-textarea:focus {
	border-color: #667eea;
	outline: none;
}

/* 问卷样式 */
.question-item {
	margin-bottom: 40rpx;
}

.question-text {
	font-size: 28rpx;
	color: #333;
	line-height: 1.5;
	display: block;
	margin-bottom: 20rpx;
}

.options {
	margin-top: 20rpx;
}

.option-item {
	display: flex;
	align-items: center;
	padding: 15rpx 0;
	cursor: pointer;
}

.option-radio {
	width: 36rpx;
	height: 36rpx;
	border: 3rpx solid #ddd;
	border-radius: 50%;
	margin-right: 20rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
}

.option-radio.selected {
	border-color: #667eea;
}

.radio-dot {
	width: 20rpx;
	height: 20rpx;
	background: #667eea;
	border-radius: 50%;
}

.option-text {
	font-size: 26rpx;
	color: #333;
	flex: 1;
}

.question-textarea {
	width: 100%;
	min-height: 120rpx;
	padding: 20rpx;
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	font-size: 26rpx;
	box-sizing: border-box;
	resize: none;
	margin-top: 15rpx;
}

/* 图片上传 */
.upload-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 20rpx;
	margin-top: 15rpx;
}

.upload-item {
	position: relative;
	width: 160rpx;
	height: 160rpx;
}

.upload-image {
	width: 100%;
	height: 100%;
	border-radius: 12rpx;
}

.image-delete {
	position: absolute;
	top: -24rpx;
	right: -24rpx;
	width: 88rpx;
	height: 88rpx;
	background: transparent;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
}

.image-delete::before {
	position: absolute;
	width: 48rpx;
	height: 48rpx;
	border-radius: 50%;
	background: #e25f63;
	content: '';
}

.image-delete .icon {
	position: relative;
	z-index: 1;
}

.delete-icon {
	color: white;
	font-size: 24rpx;
}

.upload-add {
	width: 160rpx;
	height: 160rpx;
	border: 2rpx dashed #ddd;
	border-radius: 12rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	color: #999;
}

.add-icon {
	font-size: 40rpx;
	margin-bottom: 10rpx;
}

.add-text {
	font-size: 22rpx;
}

.modal-footer {
	display: flex;
	gap: 20rpx;
	padding: 30rpx;
	border-top: 1rpx solid #eee;
}

.cancel-btn,
.submit-btn {
	flex: 1;
	padding: 24rpx 0;
	border-radius: 12rpx;
	font-size: 28rpx;
	border: none;
	transition: all 0.3s ease;
}

.cancel-btn {
	background: #f5f5f5;
	color: #666;
}

.submit-btn {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
}

.submit-btn:disabled {
	background: #ddd;
	color: #999;
}

.cancel-btn:active,
.submit-btn:active {
	transform: scale(0.95);
}
</style>

<style scoped>
.follow-container {
	box-sizing: border-box;
	min-height: 100vh;
	padding: 24rpx 24rpx 160rpx;
	background: linear-gradient(180deg, #eaf8fd 0, #f5fafc 250rpx, #f3f7f9 100%);
	color: #193b4e;
}

.follow-container view,
.follow-container text,
.follow-container input,
.follow-container textarea,
.follow-container button,
.follow-container image {
	box-sizing: border-box;
}

.stats-section {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10rpx;
	margin-bottom: 22rpx;
	padding: 12rpx;
	border: 1rpx solid rgba(35, 115, 149, 0.07);
	border-radius: 24rpx;
	background: #ffffff;
	box-shadow: 0 10rpx 30rpx rgba(25, 81, 106, 0.06);
}

.stat-card,
.stat-card:first-child,
.stat-card:last-child {
	padding: 22rpx 6rpx;
	border: 0;
	border-right: 1rpx solid #eaf1f4;
	border-radius: 16rpx;
	background: transparent;
	box-shadow: none;
}

.stat-card:last-child {
	border-right: 0;
}

.stat-number {
	font-size: 36rpx;
	font-weight: 700;
	color: #168fb9;
}

.stat-label {
	margin-top: 7rpx;
	font-size: 19rpx;
	color: #7e929d;
}

.filter-section {
	display: flex;
	gap: 7rpx;
	margin-bottom: 20rpx;
	padding: 7rpx;
	border: 1rpx solid rgba(35, 115, 149, 0.07);
	border-radius: 20rpx;
	background: rgba(255, 255, 255, 0.94);
	box-shadow: 0 7rpx 22rpx rgba(25, 81, 106, 0.05);
}

.filter-item {
	min-height: 66rpx;
	padding: 0 8rpx;
	border-radius: 15rpx;
}

.filter-item.active {
	background: #e8f7fc;
}

.filter-text,
.filter-item.active .filter-text {
	font-size: 22rpx;
	font-weight: 600;
	color: #728792;
}

.filter-item.active .filter-text {
	color: #168fb9;
}

.filter-badge {
	top: 3rpx;
	right: 5rpx;
	min-width: 25rpx;
	height: 25rpx;
	padding: 0 5rpx;
	border-radius: 13rpx;
	background: #ef8562;
	line-height: 25rpx;
}

.badge-text {
	font-size: 16rpx;
}

.follow-list {
	height: calc(100vh - 390rpx);
	padding: 0 0 30rpx;
}

.follow-item {
	margin-bottom: 18rpx;
	padding: 24rpx;
	border: 1rpx solid rgba(35, 115, 149, 0.07);
	border-radius: 24rpx;
	background: #ffffff;
	box-shadow: 0 9rpx 28rpx rgba(25, 81, 106, 0.06);
}

.follow-item:active {
	transform: scale(0.992);
	box-shadow: 0 5rpx 18rpx rgba(25, 81, 106, 0.08);
}

.follow-header {
	align-items: flex-start;
	padding-bottom: 18rpx;
	border-bottom: 1rpx solid #eaf1f4;
}

.follow-info {
	align-items: flex-start;
	gap: 14rpx;
	min-width: 0;
}

.follow-info > view:first-child {
	flex-shrink: 0;
	padding: 12rpx;
	border-radius: 17rpx;
	background: #eaf8fc;
}

.follow-title {
	font-size: 28rpx;
	font-weight: 700;
	color: #1e4052;
}

.follow-desc {
	margin-top: 7rpx;
	font-size: 21rpx;
	line-height: 1.45;
	color: #7c919c;
}

.status-badge {
	padding: 7rpx 13rpx;
	border-radius: 13rpx;
	font-size: 19rpx;
}

.status-badge.pending {
	background: #fff5e8;
	color: #c9823e;
}

.status-badge.in_progress,
.status-badge.ongoing {
	background: #e9f7fc;
	color: #168fb9;
}

.status-badge.completed {
	background: #eaf8f2;
	color: #31936f;
}

.status-badge.overdue {
	background: #fff0ee;
	color: #d7655a;
}

.follow-meta {
	display: flex;
	align-items: center;
	gap: 8rpx;
	padding: 17rpx 0 0;
}

.follow-time {
	display: flex;
	align-items: center;
	gap: 6rpx;
}

.follow-time,
.follow-time text,
.follow-doctor {
	font-size: 20rpx;
	color: #708692;
}

.follow-priority {
	margin-left: auto;
	padding: 5rpx 10rpx;
	border-radius: 11rpx;
	font-size: 18rpx;
}

.follow-actions {
	display: flex;
	gap: 12rpx;
	margin-top: 20rpx;
	padding-top: 0;
	border-top: 0;
}

.btn-start,
.btn-view,
.btn-message {
	height: 72rpx;
	margin: 0;
	border: 0;
	border-radius: 18rpx;
	font-size: 23rpx;
	font-weight: 650;
}

.btn-start,
.btn-view {
	background: linear-gradient(102deg, #188eb8 0%, #20a5ca 100%);
	box-shadow: 0 7rpx 17rpx rgba(22, 143, 184, 0.16);
	color: #ffffff;
}

.btn-start.overdue {
	background: #e96f64;
}

.btn-message {
	border: 1rpx solid #b6dce7;
	background: #f1f9fb;
	color: #247e9d;
}

.btn-start::after,
.btn-view::after,
.btn-message::after,
.cancel-btn::after,
.submit-btn::after {
	border: 0;
}

.empty-state {
	min-height: 360rpx;
	margin-top: 10rpx;
	border: 1rpx dashed #c9dce4;
	border-radius: 24rpx;
	background: rgba(255, 255, 255, 0.72);
}

.empty-text {
	margin-top: 16rpx;
	font-size: 24rpx;
	color: #81949e;
}

.follow-modal {
	padding: 24rpx;
	background: rgba(20, 43, 55, 0.48);
	backdrop-filter: blur(7rpx);
}

.modal-content {
	width: 100%;
	max-height: 86vh;
	border-radius: 28rpx;
	background: #ffffff;
	box-shadow: 0 20rpx 55rpx rgba(19, 58, 76, 0.2);
}

.modal-header {
	padding: 26rpx 28rpx;
	border-bottom-color: #eaf1f4;
	background: linear-gradient(180deg, #f1fbfe, #ffffff);
}

.modal-title,
.form-title {
	font-size: 29rpx;
	font-weight: 700;
	color: #193b4e;
}

.modal-close {
	background: #eef6f8;
}

.modal-body {
	padding: 26rpx 28rpx;
}

.form-input,
.form-textarea,
.question-textarea {
	border: 1rpx solid #dbe8ed;
	border-radius: 18rpx;
	background: #f9fcfd;
	font-size: 24rpx;
	color: #294b5e;
}

.form-input:focus,
.form-textarea:focus,
.question-textarea:focus {
	border-color: #70c4db;
	box-shadow: 0 0 0 5rpx rgba(23, 148, 188, 0.08);
}

.option-radio.selected {
	border-color: #168fb9;
	background: #168fb9;
}

.radio-dot {
	background: #ffffff;
}

.upload-add {
	border-color: #9fd2e0;
	border-radius: 18rpx;
	background: #eff9fb;
}

.submit-btn {
	background: linear-gradient(102deg, #188eb8 0%, #20a5ca 100%);
	color: #ffffff;
}

.cancel-btn {
	border: 1rpx solid #dbe8ed;
	background: #f4f8f9;
	color: #657b87;
}
</style>

<style scoped lang="scss">
@import "../../styles/patient-theme.scss";
.follow-container { padding: 28rpx 28rpx calc(120rpx + env(safe-area-inset-bottom)); background: #f4f7fb; }
.follow-container .stats-section { border: 1px solid #e3e8f2; border-radius: 16rpx; background: white; box-shadow: none; }
.follow-container .stat-number { color: #2b5fff; }.follow-container .stat-label { color: #63718e; font-size: 23rpx; }.follow-container .filter-section { box-shadow: none; border-color: #e3e8f2; border-radius: 14rpx; }
.follow-container .filter-item { min-height: 44px; }.follow-container .filter-item.active { background: #2b5fff; }.follow-container .filter-item.active .filter-text { color: white; }.follow-container .filter-text { font-size: 26rpx; }
.follow-container .follow-item { box-shadow: none; border-color: #e3e8f2; border-radius: 16rpx; }.follow-container .follow-title { color: #12234c; }.follow-container .follow-desc { color: #63718e; font-size: 24rpx; overflow-wrap: anywhere; }
.follow-container .follow-details { min-width: 0; }.follow-container .follow-meta { flex-wrap: wrap; }.follow-container .follow-list { height: calc(100vh - 390rpx); }
.follow-container .btn-start, .follow-container .btn-view, .follow-container .submit-btn { background: #2b5fff; box-shadow: none; }.follow-container .btn-message { background: #edf2ff; color: #2458db; border-color: #cfdbfd; }.follow-container .btn-start.overdue { background: #b84b46; }
.follow-container .empty-state { background: white; border-color: #e3e8f2; border-radius: 16rpx; }

</style>

<style scoped>
.follow-container { display: flex; flex-direction: column; height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px)); min-height: 0; padding-bottom: 0; overflow: hidden; }
.follow-container .stats-section, .follow-container .filter-section { flex: none; }
.follow-container .follow-list { height: 0; min-height: 0; flex: 1; padding-bottom: 24rpx; }
</style>

<style scoped>
/* Populated-state layout audit: no account or data changes. */
.follow-modal .modal-close { min-width: 44px; min-height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.follow-modal .option-item { min-height: 44px; box-sizing: border-box; }
.follow-modal .modal-header, .follow-modal .modal-footer { flex-shrink: 0; }
</style>
