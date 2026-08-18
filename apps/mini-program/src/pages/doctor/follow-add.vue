<template>
	<view class="follow-add-container">
		<!-- 头部 -->
		<view class="header">
			<view class="header-content">
				<text class="header-title">添加随访任务</text>
				<text class="header-desc">为患者创建新的随访计划</text>
			</view>
		</view>

		<!-- 表单内容 -->
		<view class="form-container">
			<!-- 患者选择 -->
			<view class="form-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="User/user-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">选择患者</text>
					<text class="selected-count" v-if="selectedPatients.length > 0">(已选{{ selectedPatients.length }}人)</text>
				</view>
				<view class="patient-selector" @click="showPatientPicker">
					<view class="selector-content">
						<text class="selector-text" :class="{placeholder: selectedPatients.length === 0}">
							{{ selectedPatients.length === 0 ? '请选择患者' : selectedPatients.map(p => p.name).join('、') }}
						</text>
						<Icon name="Arrows/arrow-right-s-line.svg" size="20" color="$gray-600" />
					</view>
				</view>
			</view>

			<!-- 随访类型 -->
			<view class="form-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="Document/clipboard-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">随访类型</text>
				</view>
				<view class="type-grid">
					<view 
						class="type-item" 
						v-for="(type, index) in followTypes" 
						:key="index"
						:class="{active: followData.followType === type.value}"
						role="radio"
						:aria-checked="followData.followType === type.value"
						@click="selectFollowType(type.value)"
					>
						<Icon
							:name="type.value === 'weight_check' ? 'Others/scales-line.svg' : (type.value === 'diet_guidance' ? 'Food/bowl-line.svg' : (type.value === 'exercise_plan' ? 'Others/basketball-line.svg' : (type.value === 'health_assessment' ? 'Health/heart-pulse-line.svg' : (type.value === 'offline_visit' ? 'Buildings/hospital-line.svg' : 'Device/phone-line.svg'))))"
							size="24"
							:color="followData.followType === type.value ? '#ffffff' : '$gray-600'"
							class="type-icon"
						/>
						<text class="type-name">{{ type.name }}</text>
					</view>
				</view>
			</view>

			<!-- 时间与重复设置 -->
			<view class="form-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="System/time-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">时间设置</text>
				</view>
				
				<!-- 基础时间设置 -->
				<view class="time-basic">
					<view class="datetime-container">
						<picker mode="date" :value="followData.date" :start="minDate" @change="onDateChange" class="datetime-picker" :disabled="followData.isRepeat">
							<view class="datetime-item" :class="{disabled: followData.isRepeat}">
								<text class="datetime-label">日期</text>
								<text class="datetime-value" :class="{placeholder: !followData.date, disabled: followData.isRepeat}">{{ followData.isRepeat ? '重复随访已启用' : (followData.date || '请选择日期') }}</text>
							</view>
						</picker>
						<picker mode="time" :value="followData.time || '09:00'" @change="onTimeChange" class="datetime-picker">
							<view class="datetime-item">
								<text class="datetime-label">时间</text>
								<text class="datetime-value" :class="{placeholder: !followData.time}">{{ followData.time || '请选择时间' }}</text>
							</view>
						</picker>
					</view>
				</view>
				
				<!-- 重复设置 -->
				<view class="repeat-section">
					<view class="repeat-toggle">
						<text class="toggle-label">启用重复随访</text>
						<switch :checked="followData.isRepeat" @change="onRepeatToggle" color="#1688B1" />
					</view>
					
					<view v-if="followData.isRepeat" class="repeat-config">
						<!-- 重复频率 -->
						<view class="config-item">
							<text class="config-label">重复频率</text>
							<view class="frequency-list">
								<view 
									class="frequency-item" 
									v-for="(freq, index) in frequencies" 
									:key="index"
									:class="{active: followData.frequency === freq.value}"
									@click="selectFrequency(freq.value)"
								>
									<text class="frequency-name">{{ freq.name }}</text>
								</view>
							</view>
						</view>
						
						<!-- 自定义日期选择 -->
						<view v-if="followData.frequency === 'custom'" class="config-item">
							<text class="config-label">自定义日期</text>
							<view class="custom-date-selector" @click="showCustomDatePicker">
								<view class="custom-date-content">
									<text class="custom-date-text" :class="{placeholder: customDates.length === 0}">
										{{ customDates.length === 0 ? '点击选择日期' : `已选择${customDates.length}个日期` }}
									</text>
									<Icon name="Arrows/arrow-right-s-line.svg" size="20" color="$gray-600" />
								</view>
							</view>
							<!-- 已选日期列表 -->
							<view v-if="customDates.length > 0" class="selected-dates">
								<view 
								class="date-tag" 
								v-for="date in customDates" 
								:key="date"
								@click="removeCustomDateByValue(date)"
							>
									<text class="date-text">{{ formatDateDisplay(date) }}</text>
									<text class="date-remove">×</text>
								</view>
							</view>
						</view>
						
						<!-- 日期范围（非自定义时显示） -->
						<view v-if="followData.frequency !== 'custom'" class="config-item">
							<text class="config-label">有效期</text>
							<view class="date-range">
								<picker mode="date" :value="followData.startDate" :start="minDate" @change="onStartDateChange" class="date-picker">
									<view class="date-item">
										<text class="date-label">开始日期</text>
										<text class="date-value" :class="{placeholder: !followData.startDate}">{{ followData.startDate || '请选择' }}</text>
									</view>
								</picker>
								<picker mode="date" :value="followData.endDate" :start="followData.startDate || minDate" @change="onEndDateChange" class="date-picker">
									<view class="date-item">
										<text class="date-label">结束日期</text>
										<text class="date-value" :class="{placeholder: !followData.endDate}">{{ followData.endDate || '请选择' }}</text>
									</view>
								</picker>
							</view>
						</view>
					</view>
				</view>
			</view>

			<!-- 优先级 -->
			<view class="form-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="Business/flag-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">优先级</text>
				</view>
				<view class="priority-list">
					<view 
						class="priority-item" 
						v-for="(priority, index) in priorities" 
						:key="index"
						:class="{active: followData.priority === priority.value}"
						@click="selectPriority(priority.value)"
					>
						<view class="priority-dot" :class="priority.value"></view>
						<text class="priority-name">{{ priority.name }}</text>
					</view>
				</view>
			</view>

			<!-- 备注说明 -->
			<view class="form-section">
				<view class="section-title">
					<view class="title-icon"><Icon name="Document/file-text-line.svg" size="16" color="$primary-color" /></view>
					<text class="title-text">备注说明</text>
				</view>
				<textarea 
					class="note-textarea" 
					v-model="followData.note"
					placeholder="请输入随访相关说明或注意事项"
					maxlength="200"
				></textarea>
				<view class="char-count">
					<text class="count-text">{{ followData.note.length }}/200</text>
				</view>
			</view>
		</view>

		<!-- 底部按钮 -->
		<view class="footer">
			<button class="cancel-btn" @click="goBack">取消</button>
			<button class="submit-btn" @click="submitFollow" :disabled="!canSubmit || loading">{{ loading ? '创建中...' : '创建随访' }}</button>
		</view>

		<!-- 患者选择弹窗 -->
		<view class="patient-modal" v-if="showPatientModal" @click="hidePatientPicker">
			<view class="modal-content" @click.stop>
				<view class="modal-header">
					<text class="modal-title">选择患者</text>
					<view class="modal-actions">
						<text class="select-all" @click="selectAllPatients" v-if="selectedPatients.length < patients.length">全选</text>
						<text class="clear-all" @click="clearAllPatients" v-if="selectedPatients.length > 0">清空</text>
						<view class="modal-close" role="button" aria-label="关闭患者选择" @click="hidePatientPicker">
							<Icon name="System/close-line.svg" size="20" color="$gray-600" />
						</view>
					</view>
				</view>
				<view class="patient-list">
					<view 
						class="patient-item" 
						v-for="(patient, index) in patients" 
						:key="index"
						role="checkbox"
						:aria-checked="isPatientSelected(patient)"
						:aria-label="'选择患者' + patient.name"
						@click="togglePatient(patient)"
					>
						<view class="patient-avatar">
							<image v-if="patient.avatar" class="patient-avatar-image" :src="patient.avatar" mode="aspectFill"></image>
							<Icon v-else name="User/user-line.svg" size="20" color="$primary-color" />
						</view>
						<view class="patient-info">
							<text class="patient-name">{{ patient.name }}</text>
							<text class="patient-desc">{{ patient.age }}岁 · {{ patient.gender === 'male' ? '男' : '女' }}</text>
						</view>
						<view class="patient-check" :class="{checked: isPatientSelected(patient)}">
							<Icon v-if="isPatientSelected(patient)" name="System/check-line.svg" size="16" color="#ffffff" />
						</view>
					</view>
				</view>
				<view v-if="patients.length === 0" class="empty-patients">
					<text class="empty-text">暂无患者数据</text>
				</view>
				<view class="modal-footer" v-if="selectedPatients.length > 0">
					<button class="confirm-btn" @click="confirmPatientSelection">确认选择({{ selectedPatients.length }})</button>
				</view>
			</view>
		</view>
		
		<!-- 自定义日期选择弹窗 -->
		<view class="custom-date-modal" v-if="showCustomDateModal" @click="hideCustomDatePicker">
			<view class="custom-modal-content" @click.stop>
				<view class="custom-modal-header">
					<text class="custom-modal-title">选择随访日期</text>
					<view class="custom-modal-actions">
						<text class="clear-dates" @click="clearCustomDates" v-if="customDates.length > 0">清空</text>
						<view class="custom-modal-close" role="button" aria-label="关闭日期选择" @click="hideCustomDatePicker">
							<Icon name="System/close-line.svg" size="20" color="$gray-600" />
						</view>
					</view>
				</view>
				<view class="custom-date-picker-container">
					<picker mode="date" :value="tempDate" :start="minDate" @change="onTempDateChange" class="temp-date-picker">
						<view class="temp-date-item">
							<text class="temp-date-label">选择日期</text>
							<text class="temp-date-value" :class="{placeholder: !tempDate}">{{ tempDate || '请选择日期' }}</text>
						</view>
					</picker>
				</view>
				<view v-if="customDates.length > 0" class="custom-selected-list">
					<text class="list-title">已选择的日期：</text>
					<view class="custom-date-list">
						<view 
						class="custom-date-item" 
						v-for="date in sortedCustomDates" 
						:key="date"
						@click="removeCustomDateByValue(date)"
					>
							<text class="custom-date-text">{{ formatDateDisplay(date) }}</text>
							<text class="custom-date-delete">删除</text>
						</view>
					</view>
				</view>
				<view class="custom-modal-footer">
					<button class="custom-confirm-btn" @click="confirmCustomDates" :disabled="customDates.length === 0">确认选择({{ customDates.length }})</button>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
import store from '../../store/index.js'
import { createFollowUp, getPatients } from '../../utils/api.js'
import { showToast } from '../../utils/common.js'
import Icon from '../../components/Icon.vue'

export default {
	components: {
		Icon
	},
	data() {
		return {
			loading: false,
			showPatientModal: false,
			selectedPatients: [],
			patients: [],
			followData: {
				followType: '',
				date: '',
				time: '',
				priority: 'normal',
				note: '',
				isRepeat: false,
				frequency: 'weekly',
				startDate: '',
				endDate: ''
			},
			followTypes: [
					{ value: 'weight_check', name: '体重检查', icon: 'Others/scales-line.svg' },
					{ value: 'diet_guidance', name: '饮食指导', icon: 'Food/bowl-line.svg' },
					{ value: 'exercise_plan', name: '运动计划', icon: 'Others/basketball-line.svg' },
					{ value: 'health_assessment', name: '健康评估', icon: 'Buildings/hospital-line.svg' },
					{ value: 'offline_visit', name: '线下随访', icon: 'Buildings/hospital-line.svg' },
					{ value: 'phone_visit', name: '电话随访', icon: 'Device/phone-line.svg' }
				],
			priorities: [
				{ value: 'low', name: '低优先级' },
				{ value: 'normal', name: '普通' },
				{ value: 'high', name: '高优先级' },
				{ value: 'urgent', name: '紧急' }
			],
			frequencies: [
				{ value: 'daily', name: '每日' },
				{ value: 'weekly', name: '每周' },
				{ value: 'biweekly', name: '每两周' },
				{ value: 'monthly', name: '每月' },
				{ value: 'custom', name: '自定义' }
			],
			showCustomDateModal: false,
			customDates: [],
			tempDate: ''
		}
	},
	computed: {
		canSubmit() {
			// 基础验证：患者、随访类型、时间
			const basicValid = this.selectedPatients.length > 0 && 
							   this.followData.followType && 
							   this.followData.time
			
			if (!basicValid) return false
			
			// 如果启用重复，需要验证重复设置
			if (this.followData.isRepeat) {
				if (this.followData.frequency === 'custom') {
					return this.customDates.length > 0
				} else {
					return this.followData.frequency && 
						   this.followData.startDate && 
						   this.followData.endDate
				}
			} else {
				// 如果不是重复随访，需要验证基础日期
				return this.followData.date
			}
		},
		sortedCustomDates() {
			return [...this.customDates].sort((a, b) => new Date(a) - new Date(b))
		},
		minDate() {
			const today = new Date()
			return today.toISOString().split('T')[0]
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
		
		this.loadPatients()
	},
	methods: {
		// 加载患者列表
		async loadPatients() {
			try {
				const userInfo = store.getUserInfo()
				if (!userInfo || !userInfo.userId) {
					showToast('用户信息获取失败')
					return
				}
				
				const result = await getPatients({ doctorId: userInfo.userId })
				if (result.code === 200) {
					this.patients = result.data.patients || []
				} else {
					showToast(result.message || '获取患者列表失败')
				}
			} catch (error) {
				console.error('加载患者列表失败:', error)
				showToast('网络错误，请重试')
			}
		},
		
		// 显示患者选择器
		showPatientPicker() {
			this.showPatientModal = true
		},
		
		// 隐藏患者选择器
		hidePatientPicker() {
			this.showPatientModal = false
		},
		
		// 切换患者选择状态
		togglePatient(patient) {
			const index = this.selectedPatients.findIndex(p => p.userId === patient.userId)
			if (index > -1) {
				this.selectedPatients.splice(index, 1)
			} else {
				this.selectedPatients.push(patient)
			}
		},
		
		// 判断患者是否已选择
		isPatientSelected(patient) {
			return this.selectedPatients.some(p => p.userId === patient.userId)
		},
		
		// 全选患者
		selectAllPatients() {
			this.selectedPatients = [...this.patients]
		},
		
		// 清空选择
		clearAllPatients() {
			this.selectedPatients = []
		},
		
		// 确认患者选择
		confirmPatientSelection() {
			this.hidePatientPicker()
		},
		
		// 选择随访类型
		selectFollowType(type) {
			this.followData.followType = type
		},
		
		// 选择优先级
		selectPriority(priority) {
			this.followData.priority = priority
		},
		
		// 日期选择改变事件
		onDateChange(e) {
			this.followData.date = e.detail.value
		},
		
		// 时间选择改变事件
		onTimeChange(e) {
			this.followData.time = e.detail.value
		},
		
		// 重复开关切换
		onRepeatToggle(e) {
			this.followData.isRepeat = e.detail.value
			if (this.followData.isRepeat) {
				// 默认设置开始日期为选择的日期
				this.followData.startDate = this.followData.date
				// 默认结束日期为一个月后
				if (this.followData.date) {
					const endDate = new Date(this.followData.date)
					endDate.setMonth(endDate.getMonth() + 1)
					this.followData.endDate = endDate.toISOString().split('T')[0]
				}
			} else {
				this.followData.startDate = ''
				this.followData.endDate = ''
			}
		},
		
		// 选择重复频率
		selectFrequency(frequency) {
			this.followData.frequency = frequency
			// 如果切换到非自定义频率，清空自定义日期
			if (frequency !== 'custom') {
				this.customDates = []
			}
		},
		
		// 开始日期选择
		onStartDateChange(e) {
			this.followData.startDate = e.detail.value
		},
		
		// 结束日期选择
		onEndDateChange(e) {
			this.followData.endDate = e.detail.value
		},
		
		// 显示自定义日期选择器
		showCustomDatePicker() {
			this.showCustomDateModal = true
			this.tempDate = ''
		},
		
		// 隐藏自定义日期选择器
		hideCustomDatePicker() {
			this.showCustomDateModal = false
			this.tempDate = ''
		},
		
		// 临时日期选择
		onTempDateChange(e) {
			this.tempDate = e.detail.value
			// 选择日期后自动添加
			if (this.tempDate && !this.customDates.includes(this.tempDate)) {
				this.customDates.push(this.tempDate)
				this.tempDate = ''
			}
		},
		
		// 添加自定义日期
		addCustomDate() {
			if (this.tempDate && !this.customDates.includes(this.tempDate)) {
				this.customDates.push(this.tempDate)
				this.tempDate = ''
			}
		},
		
		// 删除自定义日期
		removeCustomDate(index) {
			this.customDates.splice(index, 1)
		},
		
		// 根据日期值删除自定义日期
		removeCustomDateByValue(date) {
			const index = this.customDates.indexOf(date)
			if (index > -1) {
				this.customDates.splice(index, 1)
			}
		},
		
		// 清空自定义日期
		clearCustomDates() {
			this.customDates = []
		},
		
		// 确认自定义日期选择
		confirmCustomDates() {
			this.hideCustomDatePicker()
		},
		
		// 格式化日期显示
		formatDateDisplay(date) {
			if (!date) return ''
			const dateObj = new Date(date)
			const month = dateObj.getMonth() + 1
			const day = dateObj.getDate()
			return `${month}月${day}日`
		},
		
		// 提交随访
		async submitFollow() {
			if (!this.canSubmit) {
				showToast('请完善随访信息')
				return
			}
			
			try {
				this.loading = true
				
				const userInfo = store.getUserInfo()
				if (!userInfo || !userInfo.userId) {
					showToast('用户信息获取失败')
					return
				}
				
				let successCount = 0
				let totalCount = 0
				
				// 为每个选中的患者创建随访
				for (const patient of this.selectedPatients) {
					if (this.followData.isRepeat) {
						// 创建重复随访
						const followDates = this.generateFollowDates()
						for (const date of followDates) {
							totalCount++
							const followUpData = {
								doctorId: userInfo.userId,
								patientId: patient.userId,
								followType: this.followData.followType,
								scheduledTime: `${date}T${this.followData.time}:00.000Z`,
								priority: this.followData.priority,
								note: this.followData.note,
								isRepeat: true,
								frequency: this.followData.frequency
							}
							
							try {
								const result = await createFollowUp(followUpData)
								if (result.code === 200) {
									successCount++
								}
							} catch (error) {
								console.error('创建重复随访失败:', error)
							}
						}
					} else {
						// 创建单次随访
						totalCount++
						const followUpData = {
							doctorId: userInfo.userId,
							patientId: patient.userId,
							followType: this.followData.followType,
							scheduledTime: `${this.followData.date}T${this.followData.time}:00.000Z`,
							priority: this.followData.priority,
							note: this.followData.note,
							isRepeat: false
						}
						
						try {
							const result = await createFollowUp(followUpData)
							if (result.code === 200) {
								successCount++
							}
						} catch (error) {
							console.error('创建随访失败:', error)
						}
					}
				}
				
				if (successCount === totalCount) {
					showToast(`随访创建成功，共创建${successCount}个随访任务`, 'success')
				} else if (successCount > 0) {
					showToast(`部分创建成功，成功${successCount}个，失败${totalCount - successCount}个`)
				} else {
					showToast('随访创建失败，请重试')
				}
				
				// 返回上一页
				if (successCount > 0) {
					setTimeout(() => {
						uni.navigateBack()
					}, 1500)
				}
			} catch (error) {
				console.error('创建随访失败:', error)
				showToast('网络错误，请重试')
			} finally {
				this.loading = false
			}
		},
		
		// 生成重复随访日期
		generateFollowDates() {
			// 如果是自定义频率，直接返回自定义日期
			if (this.followData.frequency === 'custom') {
				return [...this.customDates].sort((a, b) => new Date(a) - new Date(b))
			}
			
			// 其他频率的处理逻辑
			const dates = []
			const startDate = new Date(this.followData.startDate)
			const endDate = new Date(this.followData.endDate)
			const currentDate = new Date(startDate)
			
			while (currentDate <= endDate) {
				dates.push(currentDate.toISOString().split('T')[0])
				
				// 根据频率增加日期
				switch (this.followData.frequency) {
					case 'daily':
						currentDate.setDate(currentDate.getDate() + 1)
						break
					case 'weekly':
						currentDate.setDate(currentDate.getDate() + 7)
						break
					case 'biweekly':
						currentDate.setDate(currentDate.getDate() + 14)
						break
					case 'monthly':
						currentDate.setMonth(currentDate.getMonth() + 1)
						break
					default:
						currentDate.setDate(currentDate.getDate() + 7)
				}
			}
			
			return dates
		},
		
		// 返回上一页
		goBack() {
			uni.navigateBack()
		}
	}
}
</script>

<style scoped>
.follow-add-container {
	padding: 0;
	background-color: #f5f5f5;
	min-height: 100vh;
}

/* 头部 */
.header {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	padding: 40rpx 30rpx 30rpx;
	color: white;
}

.header-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
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

/* 表单容器 */
.form-container {
	padding: 30rpx;
}

.form-section {
	background: white;
	border-radius: 16rpx;
	padding: 30rpx;
	margin-bottom: 20rpx;
	box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
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
	font-size: 30rpx;
	font-weight: bold;
	color: #333;
}

.selected-count {
	font-size: 24rpx;
	color: #667eea;
	margin-left: 10rpx;
	font-weight: 500;
}

/* 患者选择器 */
.patient-selector {
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	padding: 20rpx;
	transition: all 0.3s ease;
}

.patient-selector:active {
	background-color: #f9f9f9;
}

.selector-content {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.selector-text {
	font-size: 28rpx;
	color: #333;
}

.selector-text.placeholder {
	color: #999;
}

.selector-arrow {
	font-size: 32rpx;
	color: #999;
	transform: rotate(90deg);
}

/* 随访类型网格 */
.type-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 15rpx;
}

.type-item {
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	padding: 25rpx 15rpx;
	text-align: center;
	transition: all 0.3s ease;
	box-sizing: border-box;
}

.type-item.active {
	border-color: #667eea;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
}

.type-icon {
	display: block;
	margin-bottom: 10rpx;
}

.type-name {
	font-size: 24rpx;
	font-weight: 500;
}

/* 时间基础设置 */
.time-basic {
	margin-bottom: 25rpx;
}

/* 日期时间容器 */
.datetime-container {
	display: flex;
	gap: 15rpx;
}

.datetime-picker {
	flex: 1;
	width: 40%;
}

.datetime-item {
	width: 90%;
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	padding: 20rpx;
	text-align: center;
	transition: all 0.3s ease;
}

.datetime-item:active {
	background-color: #f9f9f9;
}

.datetime-label {
	font-size: 24rpx;
	color: #666;
	display: block;
	margin-bottom: 8rpx;
}

.datetime-value {
	font-size: 28rpx;
	color: #333;
	font-weight: 500;
}

.datetime-value.placeholder {
	color: #999;
}

.datetime-item.disabled {
	opacity: 0.5;
	pointer-events: none;
}

.datetime-value.disabled {
	color: #999;
	font-style: italic;
}

/* 重复设置区域 */
.repeat-section {
	padding-top: 25rpx;
	border-top: 2rpx solid #f0f0f0;
}

/* 重复设置样式 */
.repeat-toggle {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 20rpx;
}

.toggle-label {
	font-size: 28rpx;
	color: #333;
	font-weight: 500;
}

.repeat-config {
	margin-top: 20rpx;
	padding-top: 20rpx;
	border-top: 2rpx solid #f0f0f0;
}

.config-item {
	margin-bottom: 25rpx;
}

.config-label {
	font-size: 26rpx;
	color: #666;
	display: block;
	margin-bottom: 15rpx;
}

.frequency-list {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10rpx;
}

.frequency-item {
	border: 2rpx solid #eee;
	border-radius: 8rpx;
	padding: 15rpx;
	text-align: center;
	transition: all 0.3s ease;
}

.frequency-item.active {
	border-color: #667eea;
	background-color: #667eea;
	color: white;
}

.frequency-name {
	font-size: 24rpx;
	font-weight: 500;
}

.date-range {
	display: flex;
	gap: 15rpx;
}

.date-picker {
	flex: 1;
}

.date-item {
	border: 2rpx solid #eee;
	border-radius: 8rpx;
	padding: 15rpx;
	text-align: center;
	transition: all 0.3s ease;
}

.date-item:active {
	background-color: #f9f9f9;
}

.date-label {
	font-size: 22rpx;
	color: #666;
	display: block;
	margin-bottom: 5rpx;
}

.date-value {
	font-size: 26rpx;
	color: #333;
	font-weight: 500;
}

.date-value.placeholder {
	color: #999;
}

/* 自定义日期选择器 */
.custom-date-selector {
	border: 2rpx solid #eee;
	border-radius: 8rpx;
	padding: 15rpx;
	transition: all 0.3s ease;
	margin-bottom: 15rpx;
}

.custom-date-selector:active {
	background-color: #f9f9f9;
}

.custom-date-content {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.custom-date-text {
	font-size: 24rpx;
	color: #333;
}

.custom-date-text.placeholder {
	color: #999;
}

.custom-date-arrow {
	font-size: 28rpx;
	color: #999;
	transform: rotate(90deg);
}

/* 已选日期标签 */
.selected-dates {
	display: flex;
	flex-wrap: wrap;
	gap: 8rpx;
	margin-top: 10rpx;
}

.date-tag {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	border-radius: 20rpx;
	padding: 8rpx 15rpx;
	display: flex;
	align-items: center;
	gap: 8rpx;
	font-size: 22rpx;
}

.date-text {
	font-size: 22rpx;
}

.date-remove {
	font-size: 24rpx;
	font-weight: bold;
	opacity: 0.8;
}

/* 优先级列表 */
.priority-list {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 15rpx;
}

.priority-item {
	display: flex;
	align-items: center;
	padding: 20rpx;
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	transition: all 0.3s ease;
}

.priority-item.active {
	border-color: #667eea;
	background-color: #f0f4ff;
}

.priority-dot {
	width: 20rpx;
	height: 20rpx;
	border-radius: 50%;
	margin-right: 20rpx;
}

.priority-dot.low {
	background-color: #4caf50;
}

.priority-dot.normal {
	background-color: #2196f3;
}

.priority-dot.high {
	background-color: #ff9800;
}

.priority-dot.urgent {
	background-color: #f44336;
}

.priority-name {
	font-size: 28rpx;
	color: #333;
}

/* 备注输入 */
.note-textarea {
	width: 100%;
	min-height: 120rpx;
	padding: 20rpx;
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	font-size: 28rpx;
	box-sizing: border-box;
	resize: none;
}

.note-textarea:focus {
	border-color: #667eea;
	outline: none;
}

.char-count {
	text-align: right;
	margin-top: 10rpx;
}

.count-text {
	font-size: 24rpx;
	color: #999;
}

/* 底部按钮 */
.footer {
	display: flex;
	gap: 20rpx;
	padding: 30rpx;
	background: white;
	border-top: 1rpx solid #eee;
}

.cancel-btn,
.submit-btn {
	flex: 1;
	padding: 28rpx 0;
	border-radius: 12rpx;
	font-size: 30rpx;
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

/* 患者选择弹窗 */
.patient-modal {
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
}

.modal-content {
	width: 90%;
	max-height: 80%;
	background: white;
	border-radius: 16rpx;
	overflow: hidden;
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

.modal-actions {
	display: flex;
	align-items: center;
	gap: 20rpx;
}

.select-all, .clear-all {
	font-size: 26rpx;
	color: #667eea;
	padding: 10rpx 15rpx;
	border-radius: 6rpx;
	transition: all 0.3s ease;
}

.select-all:active, .clear-all:active {
	background-color: #f0f0f0;
}

.modal-close {
	width: 88rpx;
	height: 88rpx;
	min-width: 88rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 50%;
	background: #f5f5f5;
}

.close-icon {
	font-size: 36rpx;
	color: #666;
}

.patient-list {
	max-height: 600rpx;
	overflow-y: auto;
}

.patient-item {
	display: flex;
	align-items: center;
	padding: 25rpx 30rpx;
	border-bottom: 1rpx solid #f0f0f0;
	transition: all 0.3s ease;
}

.patient-item:active {
	background-color: #f9f9f9;
}

.patient-avatar {
	width: 80rpx;
	height: 80rpx;
	border-radius: 50%;
	margin-right: 20rpx;
	display: flex;
	align-items: center;
	justify-content: center;
	background: #edf8fb;
	overflow: hidden;
	box-sizing: border-box;
}

.patient-avatar-image {
	width: 100%;
	height: 100%;
	display: block;
}

.patient-info {
	flex: 1;
}

.patient-name {
	font-size: 30rpx;
	font-weight: bold;
	color: #333;
	display: block;
	margin-bottom: 8rpx;
}

.patient-desc {
	font-size: 24rpx;
	color: #666;
}

.patient-check {
	width: 40rpx;
	height: 40rpx;
	border: 2rpx solid #ddd;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.3s ease;
}

.patient-check.checked {
	background: #667eea;
	border-color: #667eea;
}

.check-icon {
	color: transparent;
	font-size: 24rpx;
	font-weight: bold;
	transition: all 0.3s ease;
}

.patient-check.checked .check-icon {
	color: white;
}

.empty-patients {
	padding: 60rpx 30rpx;
	text-align: center;
}

.empty-text {
	font-size: 28rpx;
	color: #999;
}

.modal-footer {
	padding: 20rpx 30rpx;
	border-top: 1rpx solid #eee;
}

.confirm-btn {
	width: 100%;
	padding: 25rpx 0;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	border: none;
	border-radius: 12rpx;
	font-size: 28rpx;
	font-weight: 500;
	transition: all 0.3s ease;
}

.confirm-btn:active {
	transform: scale(0.95);
}

/* 自定义日期弹窗 */
.custom-date-modal {
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

.custom-modal-content {
	width: 90%;
	max-width: 600rpx;
	max-height: 80%;
	background: white;
	border-radius: 20rpx;
	overflow: hidden;
}

.custom-modal-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 30rpx;
	border-bottom: 2rpx solid #f0f0f0;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
}

.custom-modal-title {
	font-size: 32rpx;
	font-weight: bold;
}

.custom-modal-actions {
	display: flex;
	align-items: center;
	gap: 20rpx;
}

.clear-dates {
	font-size: 26rpx;
	color: white;
	opacity: 0.9;
	padding: 8rpx 15rpx;
	border-radius: 15rpx;
	background-color: rgba(255, 255, 255, 0.2);
}

.custom-modal-close {
	width: 88rpx;
	height: 88rpx;
	min-width: 88rpx;
	border-radius: 50%;
	background-color: rgba(255, 255, 255, 0.2);
	display: flex;
	align-items: center;
	justify-content: center;
}

/* 日期选择器容器 */
.custom-date-picker-container {
	padding: 30rpx;
	border-bottom: 2rpx solid #f0f0f0;
}

.temp-date-picker {
	margin-bottom: 20rpx;
}

.temp-date-item {
	border: 2rpx solid #eee;
	border-radius: 12rpx;
	padding: 20rpx;
	text-align: center;
	transition: all 0.3s ease;
}

.temp-date-item:active {
	background-color: #f9f9f9;
}

.temp-date-label {
	font-size: 24rpx;
	color: #666;
	display: block;
	margin-bottom: 8rpx;
}

.temp-date-value {
	font-size: 28rpx;
	color: #333;
	font-weight: 500;
}

.temp-date-value.placeholder {
	color: #999;
}

.add-date-btn {
	width: 100%;
	height: 70rpx;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	border: none;
	border-radius: 12rpx;
	font-size: 26rpx;
	font-weight: bold;
}

.add-date-btn:disabled {
	background: #ccc;
	color: #999;
}

/* 已选日期列表 */
.custom-selected-list {
	padding: 20rpx 30rpx;
	max-height: 300rpx;
	overflow-y: auto;
	border-bottom: 2rpx solid #f0f0f0;
}

.list-title {
	font-size: 26rpx;
	color: #666;
	margin-bottom: 15rpx;
	display: block;
}

.custom-date-list {
	display: flex;
	flex-direction: column;
	gap: 10rpx;
}

.custom-date-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 15rpx 20rpx;
	background-color: #f8f9fa;
	border-radius: 8rpx;
	transition: all 0.3s ease;
}

.custom-date-item:active {
	background-color: #e9ecef;
}

.custom-date-text {
	font-size: 26rpx;
	color: #333;
}

.custom-date-delete {
	font-size: 24rpx;
	color: #dc3545;
	font-weight: 500;
}

.custom-modal-footer {
	padding: 20rpx 30rpx;
}

.custom-confirm-btn {
	width: 100%;
	height: 80rpx;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	border: none;
	border-radius: 12rpx;
	font-size: 28rpx;
	font-weight: bold;
}

.custom-confirm-btn:disabled {
	background: #ccc;
	color: #999;
}

/* 2026 clinical visual refresh */
.follow-add-container {
	padding-bottom: calc(148rpx + env(safe-area-inset-bottom));
	background:
		radial-gradient(circle at 88% 1%, rgba(102, 203, 229, 0.2), transparent 300rpx),
		linear-gradient(180deg, #eaf7fc 0, #f7fbfd 340rpx, #f5f9fb 100%);
	color: #15324a;
}

.header {
	padding: 34rpx 30rpx 28rpx;
	color: #15324a;
	background: transparent;
}

.header-content {
	align-items: flex-start;
	text-align: left;
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

.form-container {
	padding: 0 24rpx 24rpx;
}

.form-section {
	padding: 28rpx;
	margin-bottom: 20rpx;
	background: #ffffff;
	border: 1rpx solid #dcecf2;
	border-radius: 24rpx;
	box-shadow: 0 10rpx 28rpx rgba(31, 119, 151, 0.07);
}

.section-title {
	margin-bottom: 22rpx;
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
	font-size: 29rpx;
	color: #17364c;
}

.selected-count {
	color: #167fa5;
}

.patient-selector,
.datetime-item,
.date-item,
.custom-date-selector,
.note-textarea,
.temp-date-item {
	background: #f9fcfd;
	border: 1rpx solid #d8e9ef;
	border-radius: 16rpx;
}

.patient-selector {
	padding: 22rpx;
}

.selector-text,
.datetime-value,
.date-value,
.custom-date-text,
.temp-date-value {
	color: #28485b;
}

.selector-text.placeholder,
.datetime-value.placeholder,
.date-value.placeholder,
.custom-date-text.placeholder,
.temp-date-value.placeholder {
	color: #91a1aa;
}

.selector-arrow,
.custom-date-arrow {
	color: #6c8796;
}

.type-grid {
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 12rpx;
}

.type-item {
	min-height: 116rpx;
	padding: 22rpx 8rpx;
	color: #506a7a;
	background: #f8fbfc;
	border: 1rpx solid #dbeaf0;
	border-radius: 18rpx;
}

.type-item.active {
	color: #126f91;
	background: #e7f7fb;
	border-color: #56b5cf;
	box-shadow: inset 0 0 0 1rpx rgba(58, 161, 190, 0.2);
}

.type-name {
	font-size: 23rpx;
}

.datetime-container,
.date-range {
	gap: 14rpx;
}

.datetime-item {
	width: auto;
	padding: 20rpx 12rpx;
}

.datetime-label,
.date-label,
.temp-date-label {
	color: #758995;
}

.repeat-section,
.repeat-config {
	border-top-color: #e5eff3;
}

.toggle-label {
	color: #29485b;
}

.config-label {
	color: #607786;
}

.frequency-list {
	gap: 12rpx;
}

.frequency-item {
	padding: 16rpx;
	color: #5b7381;
	background: #f8fbfc;
	border: 1rpx solid #dbeaf0;
	border-radius: 14rpx;
}

.frequency-item.active {
	color: #ffffff;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	border-color: transparent;
}

.date-tag {
	padding: 9rpx 16rpx;
	background: #e4f5fa;
	color: #16799d;
	border: 1rpx solid #b9dfeb;
	border-radius: 999rpx;
}

.priority-list {
	gap: 12rpx;
}

.priority-item {
	padding: 20rpx;
	background: #f9fcfd;
	border: 1rpx solid #dceaf0;
	border-radius: 16rpx;
}

.priority-item.active {
	background: #eaf7fb;
	border-color: #69bdd3;
}

.priority-name {
	color: #385668;
}

.note-textarea {
	min-height: 160rpx;
	padding: 22rpx;
	color: #28485b;
}

.note-textarea:focus {
	border-color: #58b3cd;
}

.footer {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 50;
	padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
	background: rgba(255, 255, 255, 0.97);
	border-top: 1rpx solid #dcecf2;
	box-shadow: 0 -8rpx 28rpx rgba(30, 95, 119, 0.08);
}

.cancel-btn,
.submit-btn {
	height: 78rpx;
	padding: 0;
	line-height: 78rpx;
	border-radius: 18rpx;
	font-size: 28rpx;
}

.cancel-btn {
	color: #536d7c;
	background: #f2f7f9;
	border: 1rpx solid #d8e7ed;
}

.submit-btn {
	color: #ffffff;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	box-shadow: 0 7rpx 18rpx rgba(22, 132, 173, 0.18);
}

.submit-btn:disabled {
	color: #97a7af;
	background: #e7eef1;
	box-shadow: none;
}

.patient-modal,
.custom-date-modal {
	align-items: flex-end;
	background: rgba(13, 38, 51, 0.42);
	backdrop-filter: blur(4px);
}

.modal-content,
.custom-modal-content {
	width: 100%;
	max-width: none;
	max-height: 82%;
	border-radius: 28rpx 28rpx 0 0;
	box-shadow: 0 -18rpx 50rpx rgba(16, 59, 77, 0.18);
}

.modal-header,
.custom-modal-header {
	padding: 28rpx 30rpx;
	color: #17364c;
	background: #ffffff;
	border-bottom: 1rpx solid #e1edf2;
}

.modal-title,
.custom-modal-title {
	font-size: 31rpx;
	color: #17364c;
}

.select-all,
.clear-all,
.clear-dates {
	color: #167fa5;
	background: #eaf7fb;
	border-radius: 999rpx;
	opacity: 1;
}

.modal-close,
.custom-modal-close {
	background: #f1f7f9;
}

.patient-item {
	padding: 24rpx 30rpx;
	border-bottom-color: #e7f0f3;
}

.patient-name {
	color: #17364c;
}

.patient-desc {
	color: #718692;
}

.patient-check {
	border-color: #bfd5dd;
}

.patient-check.checked {
	background: #1688b1;
	border-color: #1688b1;
}

.modal-footer,
.custom-modal-footer {
	padding: 20rpx 30rpx calc(20rpx + env(safe-area-inset-bottom));
	border-top-color: #e1edf2;
}

.confirm-btn,
.custom-confirm-btn,
.add-date-btn {
	color: #ffffff;
	background: linear-gradient(135deg, #1684ad, #1b9fc2);
	border-radius: 18rpx;
	box-shadow: 0 7rpx 18rpx rgba(22, 132, 173, 0.16);
}

.custom-date-picker-container,
.custom-selected-list {
	border-bottom-color: #e4eef2;
}

.custom-date-item {
	padding: 18rpx 20rpx;
	background: #f4fafc;
	border: 1rpx solid #e0edf2;
	border-radius: 14rpx;
}

.custom-date-text {
	color: #365567;
}
</style>
