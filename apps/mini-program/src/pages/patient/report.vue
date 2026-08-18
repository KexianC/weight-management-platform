<template>
	<view class="container">
		<!-- 加载状态 -->
		<view v-if="loading" class="loading-container">
			<view class="loading-content">
				<Icon name="Business/bar-chart-line.svg" size="16" color="$gray-500" />
				<text class="loading-text">正在加载健康数据...</text>
			</view>
		</view>

		<!-- 报告选项卡 -->
		<view class="report-tabs">
			<view 
				class="tab-item" 
				:class="{active: activeTab === 'weight'}"
				@click="switchTab('weight')"
			>
				<Icon name="Business/line-chart-line.svg" size="16" :color="activeTab === 'weight' ? '$primary-color' : '$gray-500'" />
				<text class="tab-text">体重趋势</text>
			</view>
			<view 
				class="tab-item" 
				:class="{active: activeTab === 'nutrition'}"
				@click="switchTab('nutrition')"
			>
				<Icon name="Food/bowl-line.svg" size="16" :color="activeTab === 'nutrition' ? '$primary-color' : '$gray-500'" />
				<text class="tab-text">营养分析</text>
			</view>
			<view 
				class="tab-item" 
				:class="{active: activeTab === 'diet'}"
				@click="switchTab('diet')"
			>
				<Icon name="Food/restaurant-line.svg" size="16" :color="activeTab === 'diet' ? '$primary-color' : '$gray-500'" />
				<text class="tab-text">饮食记录</text>
			</view>
			<view
				class="tab-item"
				:class="{active: activeTab === 'summary'}"
				@click="switchTab('summary')"
			>
				<Icon name="Business/stack-line.svg" size="16" :color="activeTab === 'summary' ? '$primary-color' : '$gray-500'" />
				<text class="tab-text">医护总结</text>
			</view>
		</view>

		<!-- 体重趋势 -->
		<view class="report-content" v-if="activeTab === 'weight'">
			<!-- 时间筛选 -->
			<view class="time-filter">
				<view 
					class="filter-item" 
					:class="{active: timeRange === '7d'}"
					@click="setTimeRange('7d')"
				>
					<text class="filter-text">7天</text>
				</view>
				<view 
					class="filter-item" 
					:class="{active: timeRange === '30d'}"
					@click="setTimeRange('30d')"
				>
					<text class="filter-text">30天</text>
				</view>
				<view 
					class="filter-item" 
					:class="{active: timeRange === '90d'}"
					@click="setTimeRange('90d')"
				>
					<text class="filter-text">90天</text>
				</view>
			</view>

			<!-- 体重统计卡片 -->
			<view class="stats-cards">
				<view class="stat-card">
					<text class="stat-label">当前体重</text>
					<text class="stat-value">{{displayMetric(currentWeight, 'kg')}}</text>
					<text class="stat-change" :class="weightChange > 0 ? 'increase' : 'decrease'">
						{{weightChangeText}}
					</text>
				</view>
				<view class="stat-card">
					<text class="stat-label">目标体重</text>
					<text class="stat-value">{{displayMetric(targetWeight, 'kg')}}</text>
					<text class="stat-change normal">
						{{weightRemainingText}}
					</text>
				</view>
				<view class="stat-card">
					<text class="stat-label">BMI指数</text>
					<text class="stat-value">{{displayMetric(currentBMI)}}</text>
					<text class="stat-change" :class="bmiStatus.class">{{bmiStatus.text}}</text>
				</view>
			</view>

			<!-- 体重趋势图 -->
			<view class="chart-container">
				<view class="chart-header">
				<Icon name="Business/bar-chart-line.svg" size="16" color="$primary-color" />
				<text class="chart-title">体重变化趋势</text>
				<text class="chart-subtitle">最近{{timeRange.replace('d', '')}}天</text>
			</view>
			<view v-if="weightData.records.length === 0" class="empty-state">
				<Icon name="Business/bar-chart-line.svg" size="32" color="$gray-300" />
				<text class="empty-text">暂无体重数据</text>
					<text class="empty-tip">请先添加体重记录</text>
				</view>
				<view v-else class="chart-wrapper">
					<canvas 
						canvas-id="weightChart" 
						id="weightChart"
						class="weight-chart"
						@touchstart="onChartTouch"
					></canvas>
					<view class="chart-info">
						<text class="chart-records">共{{weightData.records.length}}条记录</text>
						<text class="chart-trend" :class="weightTrendClass">{{weightTrendText}}</text>
					</view>
				</view>
			</view>
		</view>

		<!-- 营养分析 -->
		<view class="report-content" v-if="activeTab === 'nutrition'">
			<!-- 营养摄入概览 -->
			<view class="nutrition-overview">
				<view class="overview-header">
				<Icon name="Food/bowl-line.svg" size="16" color="$primary-color" />
				<text class="overview-title">{{calorieRangeTitle}}营养摄入</text>
				<text class="overview-date">统计区间总量</text>
			</view>
				<view class="nutrition-circle">
					<view class="circle-chart">
						<text class="circle-value">{{totalCalories}}</text>
						<text class="circle-unit">kcal</text>
					</view>
					<text class="circle-target">日均: {{averageDailyCalories}}kcal</text>
				</view>
			</view>

			<!-- 卡路里摄入趋势图 -->
			<view class="chart-container">
				<view class="chart-header">
				<Icon name="Business/line-chart-line.svg" size="16" color="$primary-color" />
				<text class="chart-title">卡路里摄入趋势</text>
					<view class="time-filter">
						<text 
							class="time-btn" 
							:class="{active: calorieTimeRange === '7d'}"
							@click="setCalorieTimeRange('7d')"
						>7天</text>
						<text 
							class="time-btn" 
							:class="{active: calorieTimeRange === '30d'}"
							@click="setCalorieTimeRange('30d')"
						>30天</text>
						<text 
							class="time-btn" 
							:class="{active: calorieTimeRange === '90d'}"
							@click="setCalorieTimeRange('90d')"
						>90天</text>
					</view>
				</view>
				<view v-if="calorieData.records.length === 0" class="empty-state">
				<Icon name="Business/bar-chart-line.svg" size="32" color="$gray-300" />
				<text class="empty-text">暂无卡路里数据</text>
					<text class="empty-tip">请先添加饮食记录</text>
				</view>
				<view v-else class="chart-wrapper">
					<canvas 
						canvas-id="calorieChart" 
						class="calorie-chart"
						@touchstart="onCalorieChartTouch"
					></canvas>
					<view class="chart-info">
						<text class="chart-records">{{calorieData.records.length}}条记录</text>
						<text class="chart-trend" :class="calorieTrendClass">{{calorieTrendText}}</text>
					</view>
				</view>
			</view>


		</view>

		<!-- 饮食记录 -->
		<view class="report-content" v-if="activeTab === 'diet'">
			<!-- 日期选择 -->
			<view class="date-selector">
				<view class="date-nav" @click="changeDay(-1)">
				<Icon name="Arrows/arrow-left-line.svg" size="18" color="$gray-600" />
			</view>
			<view class="date-display" @click="toggleCalendar">
				<text class="date-text">{{selectedDate}}</text>
				<Icon name="Business/calendar-line.svg" size="18" color="$gray-600" />
			</view>
			<view class="date-nav" @click="changeDay(1)">
				<Icon name="Arrows/arrow-right-line.svg" size="18" color="$gray-600" />
			</view>
			</view>
			
			<!-- 日历预览 -->
			<view class="calendar-container" v-if="showCalendar">
				<view class="calendar-header">
					<view class="month-nav" @click="changeCalendarMonth(-1)">
						<Icon name="Arrows/arrow-left-line.svg" size="18" color="$gray-600" />
					</view>
					<view class="month-display">
						<text class="month-text">{{currentCalendarMonthText}}</text>
					</view>
					<view class="month-nav" @click="changeCalendarMonth(1)">
						<Icon name="Arrows/arrow-right-line.svg" size="18" color="$gray-600" />
					</view>
				</view>
				<view class="calendar-weekdays">
					<text class="weekday" v-for="day in weekdays" :key="day">{{day}}</text>
				</view>
				<view class="calendar-days">
					<view 
						class="calendar-day" 
						:class="{
							'other-month': day.isOtherMonth,
							'selected': day.date === selectedDate,
							'today': day.isToday,
							'has-record': day.hasRecord
						}"
						v-for="day in calendarDays" 
						:key="day.key"
						@click="selectDate(day)"
					>
						<text class="day-text">{{day.day}}</text>
					</view>
				</view>
			</view>

			<!-- 饮食记录列表 -->
			<view class="diet-records">
				<view v-if="!hasDietRecords" class="empty-state">
				<Icon name="Food/restaurant-line.svg" size="32" color="$gray-300" />
				<text class="empty-text">今日暂无饮食记录</text>
					<text class="empty-tip">点击下方按钮添加饮食记录</text>
				</view>
				<view 
					v-else
					class="meal-section" 
					v-for="(meal, mealType) in dietData.records" 
					:key="mealType"
				>
					<view class="meal-header">
						<Icon :name="meal.icon" size="16" color="$primary-color" />
						<text class="meal-name">{{meal.name}}</text>
						<text class="meal-calories">{{meal.totalCalories}}kcal</text>
					</view>
					<view class="food-list">
						<view 
							class="food-item" 
							v-for="(food, index) in meal.foods" 
							:key="index"
						>
							<view class="food-info">
								<text class="food-name">{{food.name}}</text>
								<text class="food-amount">{{food.amount}}</text>
							</view>
							<text class="food-calories">{{food.calories}}kcal</text>
						</view>
					</view>
				</view>
			</view>

			<!-- 添加饮食记录按钮 -->
			<view class="add-diet-btn" @click="addDietRecord">
				<text class="add-btn-text">+ 添加饮食记录</text>
			</view>
		</view>

		<!-- 医护周期总结 -->
		<view class="report-content care-summary-content" v-if="activeTab === 'summary'">
			<view class="summary-intro">
				<Icon name="Business/stack-line.svg" size="24" color="$primary-color" />
				<view><text class="summary-intro-title">我的医护总结</text><text class="summary-intro-copy">查看医生或营养师对每周、每月健康记录的专业点评</text></view>
			</view>
			<view v-if="careSummaries.length === 0" class="empty-state summary-empty">
				<Icon name="Business/stack-line.svg" size="36" color="$gray-300" />
				<text class="empty-text">暂无医护总结</text>
				<text class="empty-tip">医护人员发布后会显示在这里，并向您发送通知</text>
			</view>
			<view v-else class="patient-summary-list">
				<view class="patient-summary-card" v-for="summary in careSummaries" :key="summary.id">
					<view class="patient-summary-head"><text class="patient-summary-badge">{{summary.periodType === 'MONTHLY' ? '每月总结' : '每周总结'}}</text><view><text class="patient-summary-period">{{formatSummaryDate(summary.periodStart)}} — {{formatSummaryDate(summary.periodEnd)}}</text><text class="patient-summary-author">{{summary.practitioner && summary.practitioner.displayName ? summary.practitioner.displayName : '医护人员'}} · {{formatSummaryDate(summary.publishedAt)}}发布</text></view></view>
					<view class="patient-summary-metrics"><view><text>体重变化</text><text>{{summaryMetric(summary, 'weightChangeKg', ' kg', true)}}</text></view><view><text>饮食记录</text><text>{{summaryMetric(summary, 'dietRecordCount', ' 次')}}</text></view><view><text>运动记录</text><text>{{summaryMetric(summary, 'exerciseRecordCount', ' 次')}}</text></view><view><text>任务完成</text><text>{{summaryTaskMetric(summary)}}</text></view></view>
					<view class="patient-summary-comment"><text class="patient-summary-comment-title">医护点评</text><text class="patient-summary-comment-copy">{{summary.comment}}</text></view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import { getCareSummaries, getHealthRecords, getHealthReports } from '@/utils/api.js'
	import { getStorage, showToast, hideLoading } from '@/utils/common.js'
	import Icon from '@/components/Icon.vue'

	export default {
		components: {
			Icon
		},
		data() {
			return {
				activeTab: 'weight',
				timeRange: '7d',
				currentDate: '',
				selectedDate: '',
				loading: false,
				userInfo: null,
				careSummaries: [],
				// 日历相关
				showCalendar: false,
				currentCalendarYear: new Date().getFullYear(),
				currentCalendarMonth: new Date().getMonth() + 1,
				weekdays: ['日', '一', '二', '三', '四', '五', '六'],
				dietRecordDates: [], // 有饮食记录的日期
				// 体重数据
				currentWeight: null,
				targetWeight: null,
				weightChange: 0,
				currentBMI: null,
				weightRecords: [],
				weightData: {
					records: []
				},
				// 营养数据
				totalCalories: 0,
				averageDailyCalories: 0,
				// 卡路里数据
				calorieTimeRange: '7d',
				calorieRecords: [],
				calorieData: {
					records: []
				},
				// 饮食记录
				dietRecords: {
					breakfast: {
						name: '早餐',
						icon: 'Weather/sun-line.svg',
						totalCalories: 0,
						foods: []
					},
					lunch: {
						name: '午餐',
						icon: 'Weather/sun-line.svg',
						totalCalories: 0,
						foods: []
					},
					dinner: {
						name: '晚餐',
						icon: 'Weather/moon-line.svg',
						totalCalories: 0,
						foods: []
					},
					snack: {
						name: '加餐',
						icon: 'Food/cake-line.svg',
						totalCalories: 0,
						foods: []
					}
				},
				dietData: {
					records: {}
				}
			}
		},
		computed: {
			hasDietRecords() {
				return Object.values(this.dietData.records || {}).some(meal => Array.isArray(meal.foods) && meal.foods.length > 0)
			},
			calorieRangeTitle() {
				return ({ '7d': '近7天', '30d': '近30天', '90d': '近90天' })[this.calorieTimeRange] || '本期'
			},
			weightChangeText() {
				if (!this.weightData.records.length) return '暂无区间数据'
				const value = Number(this.weightChange)
				return `${value > 0 ? '+' : ''}${value.toFixed(1)}kg`
			},
			weightRemainingText() {
				const current = Number(this.currentWeight)
				const target = Number(this.targetWeight)
				if (!Number.isFinite(current) || !Number.isFinite(target) || this.currentWeight === null || this.targetWeight === null) return '目标未设置'
				const difference = current - target
				if (difference <= 0) return '已达到目标'
				return `还需${difference.toFixed(1)}kg`
			},
			// 当前日历月份显示文本
			currentCalendarMonthText() {
				return `${this.currentCalendarYear}年${this.currentCalendarMonth}月`
			},
			// 日历天数数组
			calendarDays() {
				const year = this.currentCalendarYear
				const month = this.currentCalendarMonth
				const today = new Date()
				const todayStr = this.formatDate(today)
				
				// 当月第一天
				const firstDay = new Date(year, month - 1, 1)
				// 当月最后一天
				const lastDay = new Date(year, month, 0)
				// 当月第一天是星期几
				const firstDayWeek = firstDay.getDay()
				// 当月天数
				const daysInMonth = lastDay.getDate()
				
				const days = []
				
				// 添加上个月的日期
				const prevMonth = month === 1 ? 12 : month - 1
				const prevYear = month === 1 ? year - 1 : year
				const prevMonthLastDay = new Date(prevYear, prevMonth, 0).getDate()
				
				for (let i = firstDayWeek - 1; i >= 0; i--) {
					const day = prevMonthLastDay - i
					const date = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
					days.push({
						day: day,
						date: date,
						isOtherMonth: true,
						isToday: date === todayStr,
						hasRecord: this.dietRecordDates.includes(date),
						key: `prev-${day}`
					})
				}
				
				// 添加当月的日期
				for (let day = 1; day <= daysInMonth; day++) {
					const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
					days.push({
						day: day,
						date: date,
						isOtherMonth: false,
						isToday: date === todayStr,
						hasRecord: this.dietRecordDates.includes(date),
						key: `current-${day}`
					})
				}
				
				// 添加下个月的日期，补齐6行
				const totalCells = 42 // 6行 × 7列
				const remainingCells = totalCells - days.length
				const nextMonth = month === 12 ? 1 : month + 1
				const nextYear = month === 12 ? year + 1 : year
				
				for (let day = 1; day <= remainingCells; day++) {
					const date = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
					days.push({
						day: day,
						date: date,
						isOtherMonth: true,
						isToday: date === todayStr,
						hasRecord: this.dietRecordDates.includes(date),
						key: `next-${day}`
					})
				}
				
				return days
			},
			// BMI状态
			bmiStatus() {
				const bmi = this.currentBMI
				if (!Number.isFinite(Number(bmi)) || bmi === null) {
					return { text: '暂无数据', class: 'normal' }
				} else if (bmi < 18.5) {
					return { text: '偏瘦', class: 'underweight' }
				} else if (bmi < 24) {
					return { text: '正常', class: 'normal' }
				} else if (bmi < 28) {
					return { text: '超重', class: 'overweight' }
				} else {
					return { text: '肥胖', class: 'obese' }
				}
			},
			// 体重趋势文本
			weightTrendText() {
				if (this.weightData.records.length < 2) return '数据不足'
				const latest = this.weightData.records[0].weight
				const previous = this.weightData.records[1].weight
				const change = latest - previous
				if (change > 0) {
					return `上升 ${change.toFixed(1)}kg`
				} else if (change < 0) {
					return `下降 ${Math.abs(change).toFixed(1)}kg`
				} else {
					return '保持稳定'
				}
			},
			// 体重趋势样式类
			weightTrendClass() {
				if (this.weightData.records.length < 2) return 'trend-stable'
				const latest = this.weightData.records[0].weight
				const previous = this.weightData.records[1].weight
				const change = latest - previous
				if (change > 0) {
					return 'trend-up'
				} else if (change < 0) {
					return 'trend-down'
				} else {
					return 'trend-stable'
				}
			},
			// 卡路里趋势文本
			calorieTrendText() {
				if (this.calorieData.records.length < 2) return '数据不足'
				const latest = this.calorieData.records[0].calories
				const previous = this.calorieData.records[1].calories
				const change = latest - previous
				if (change > 0) {
					return `上升 ${change}kcal`
				} else if (change < 0) {
					return `下降 ${Math.abs(change)}kcal`
				} else {
					return '保持稳定'
				}
			},
			// 卡路里趋势样式类
			calorieTrendClass() {
				if (this.calorieData.records.length < 2) return 'trend-stable'
				const latest = this.calorieData.records[0].calories
				const previous = this.calorieData.records[1].calories
				const change = latest - previous
				if (change > 0) {
					return 'trend-up'
				} else if (change < 0) {
					return 'trend-down'
				} else {
					return 'trend-stable'
				}
			}
		},
		onLoad() {
			this.getCurrentDate()
			this.selectedDate = this.currentDate
			this.initUserInfo()
			this.consumeRequestedTab()
			this.initPageData()
		},
		onShow() {
			if (this.consumeRequestedTab() && this.userInfo) this.loadCareSummaries()
		},
		methods: {
			optionalNumber(value) {
				if (value === null || value === undefined || value === '') return null
				const number = Number(value)
				return Number.isFinite(number) ? number : null
			},
			displayMetric(value, unit = '') {
				const number = this.optionalNumber(value)
				return number === null ? '--' : `${number.toFixed(1).replace(/\.0$/, '')}${unit}`
			},
			dateKey(value) {
				if (!value) return ''
				if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
				const date = new Date(value)
				return Number.isNaN(date.getTime()) ? '' : this.formatDate(date)
			},
			consumeRequestedTab() {
				const requested = uni.getStorageSync('patientReportTab')
				if (requested !== 'summary') return false
				uni.removeStorageSync('patientReportTab')
				this.activeTab = 'summary'
				return true
			},
			// 初始化用户信息
			initUserInfo() {
				this.userInfo = getStorage('userInfo')
				if (!this.userInfo) {
					uni.showModal({
						title: '提示',
						content: '请先登录',
						showCancel: false,
						success: () => {
							uni.reLaunch({
								url: '/pages/login/login'
							})
						}
					})
					return
				}
			},

			// 初始化页面数据
			async initPageData() {
				if (!this.userInfo) return
				
				this.loading = true
				try {
					// 根据当前选项卡只加载必要的数据
					if (this.activeTab === 'weight') {
						await this.loadWeightData()
					} else if (this.activeTab === 'nutrition') {
						await this.loadCalorieData()
					} else if (this.activeTab === 'diet') {
						await this.loadDietData()
					} else if (this.activeTab === 'summary') {
						await this.loadCareSummaries()
					}
				} catch (error) {
					console.error('加载数据失败:', error)
					showToast('数据加载失败')
				} finally {
					this.loading = false
				}
			},

			// 加载健康数据（保留原方法供其他地方调用）
			async loadHealthData() {
				if (!this.userInfo) return
				
				this.loading = true
				try {
					// 根据当前选项卡只加载对应数据
					if (this.activeTab === 'weight') {
						await this.loadWeightData()
					} else if (this.activeTab === 'nutrition') {
						await this.loadCalorieData()
					} else if (this.activeTab === 'diet') {
						await this.loadDietData()
					} else if (this.activeTab === 'summary') {
						await this.loadCareSummaries()
					}
				} catch (error) {
					console.error('加载健康数据失败:', error)
					showToast('数据加载失败')
				} finally {
					this.loading = false
				}
			},

			// 加载体重数据
			async loadWeightData() {
				try {
					const result = await getHealthReports({ range: this.timeRange })
					
					if (result.code === 200) {
						const report = result.data || {}
						const records = Array.isArray(report.weight?.records) ? report.weight.records : []
						this.weightRecords = records
							.map(record => ({
								...record,
								weight: Number(record.weightKg),
								createTime: record.measuredAt || record.recordedAt || record.createdAt
							}))
							.filter(record => Number.isFinite(record.weight))
							.sort((a, b) => new Date(b.createTime) - new Date(a.createTime))
						this.weightData.records = this.weightRecords
						this.currentWeight = this.optionalNumber(report.currentWeightKg)
						this.targetWeight = this.optionalNumber(report.targetWeightKg)
						this.currentBMI = this.optionalNumber(report.bmi)
						this.weightChange = Number(report.weight?.changeKg || 0)
					
						// 绘制体重图表
						this.$nextTick(() => {
							setTimeout(() => {
								this.drawWeightChart()
							}, 100)
						})
					}
				} catch (error) {
					console.error('加载体重数据失败:', error)
				}
			},

			// 加载饮食数据
			async loadDietData() {
				try {
					const result = await getHealthRecords({
						type: 'diet',
						startDate: this.selectedDate,
						endDate: this.selectedDate,
						page: 1,
						pageSize: 50
					})
					
					if (result.code === 200) {
						this.processDietRecords(result.data || [])
					}
				} catch (error) {
					console.error('加载饮食数据失败:', error)
				}
			},

			async loadCareSummaries() {
				try {
					const result = await getCareSummaries()
					this.careSummaries = result.code === 200 ? (Array.isArray(result.data) ? result.data : []) : []
				} catch (error) {
					console.error('加载医护总结失败:', error)
					this.careSummaries = []
					showToast('医护总结加载失败')
				}
			},

			formatSummaryDate(value) {
				const date = new Date(value)
				return Number.isNaN(date.getTime()) ? '--' : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
			},
			summaryMetric(summary, key, suffix = '', signed = false) {
				const value = summary && summary.metrics ? Number(summary.metrics[key]) : NaN
				if (!Number.isFinite(value)) return '--'
				return `${signed && value > 0 ? '+' : ''}${key === 'weightChangeKg' ? value.toFixed(1) : value}${suffix}`
			},
			summaryTaskMetric(summary) {
				const metrics = summary && summary.metrics ? summary.metrics : {}
				return `${Number(metrics.completedTaskCount || 0)}/${Number(metrics.taskCount || 0)}`
			},

			// 处理饮食记录
			processDietRecords(records) {
				// 重置饮食记录
				Object.keys(this.dietRecords).forEach(mealType => {
					this.dietRecords[mealType].foods = []
					this.dietRecords[mealType].totalCalories = 0
				})
				
				// 处理记录数据
				records.forEach(record => {
					const mealType = String(record.mealType || '').toLowerCase()
					if (mealType && this.dietRecords[mealType]) {
						const food = {
							name: record.foodName || '未知食物',
							amount: record.amount || (record.foodWeight ? `${record.foodWeight}g` : '未记录份量'),
							calories: Number(record.calories || 0)
						}
						this.dietRecords[mealType].foods.push(food)
						this.dietRecords[mealType].totalCalories += food.calories
					}
				})
				
				// 更新 dietData.records
				this.dietData.records = this.dietRecords
				
			},

			// 加载卡路里数据
			async loadCalorieData() {
				try {
					const result = await getHealthReports({ range: this.calorieTimeRange })
					
					if (result.code === 200) {
						const nutrition = result.data?.nutrition || {}
						this.totalCalories = Number(nutrition.totalCaloriesKcal || 0)
						this.averageDailyCalories = Number(nutrition.averageDailyCaloriesKcal || 0)
						this.processCalorieRecords(Array.isArray(nutrition.trend) ? nutrition.trend : [])
						
						// 绘制卡路里图表
						this.$nextTick(() => {
							setTimeout(() => {
								this.drawCalorieChart()
							}, 100)
						})
					}
				} catch (error) {
					console.error('加载卡路里数据失败:', error)
				}
			},

			// 处理卡路里记录
			processCalorieRecords(records) {
				// 按日期分组统计每日卡路里摄入
				const dailyCalories = {}
				
				records.forEach(record => {
					const date = this.dateKey(record.date || record.recordDate || record.measuredAt || record.createTime)
					if (!date) return
					if (!dailyCalories[date]) {
						dailyCalories[date] = 0
					}
					dailyCalories[date] += Number(record.caloriesKcal ?? record.calories ?? 0)
				})
				
				// 转换为数组格式
				this.calorieRecords = Object.keys(dailyCalories)
					.map(date => ({
						date: date,
						calories: dailyCalories[date],
						createTime: date
					}))
					.sort((a, b) => new Date(b.date) - new Date(a.date)) // 按日期倒序
				
				this.calorieData.records = this.calorieRecords
			},

			// 切换选项卡
			switchTab(tab) {
				if (this.activeTab === tab) return // 避免重复加载
				
				this.activeTab = tab
				
				// 延迟加载，避免频繁切换时的多次请求
				clearTimeout(this.switchTimer)
				this.switchTimer = setTimeout(() => {
					if (tab === 'weight') {
						this.loadWeightData()
					} else if (tab === 'diet') {
						this.loadDietData()
					} else if (tab === 'nutrition') {
						this.loadCalorieData()
					} else if (tab === 'summary') {
						this.loadCareSummaries()
					}
				}, 100)
			},
			
			// 设置时间范围
			setTimeRange(range) {
				if (this.timeRange === range) return // 避免重复加载
				
				this.timeRange = range
				
				// 防抖处理
				clearTimeout(this.timeRangeTimer)
				this.timeRangeTimer = setTimeout(() => {
					this.loadWeightData()
				}, 200)
			},
			
			// 设置卡路里时间范围
			setCalorieTimeRange(range) {
				if (this.calorieTimeRange === range) return // 避免重复加载
				
				this.calorieTimeRange = range
				
				// 防抖处理
				clearTimeout(this.calorieTimeRangeTimer)
				this.calorieTimeRangeTimer = setTimeout(() => {
					this.loadCalorieData()
				}, 200)
			},
			
			// 格式化日期
			formatDate(date) {
				const year = date.getFullYear()
				const month = String(date.getMonth() + 1).padStart(2, '0')
				const day = String(date.getDate()).padStart(2, '0')
				return `${year}-${month}-${day}`
			},

			// 获取当前日期
			getCurrentDate() {
				const now = new Date()
				this.currentDate = this.formatDate(now)
			},
			
			// 切换日历显示
			toggleCalendar() {
				this.showCalendar = !this.showCalendar
				if (this.showCalendar) {
					// 加载有饮食记录的日期
					this.loadDietRecordDates()
				}
			},
			
			// 选择日期
			selectDate(day) {
				if (day.isOtherMonth) {
					// 如果选择的是其他月份的日期，先切换月份
					const selectedDate = new Date(day.date)
					this.currentCalendarYear = selectedDate.getFullYear()
					this.currentCalendarMonth = selectedDate.getMonth() + 1
				}
				this.selectedDate = day.date
				this.showCalendar = false
				// 重新加载对应日期的饮食记录
				this.loadDietData()
			},
			
			// 切换日期（日期选择器）
			changeDay(direction) {
				const currentDate = new Date(this.selectedDate)
				
				// 按天切换日期
				currentDate.setDate(currentDate.getDate() + direction)
				
				this.selectedDate = this.formatDate(currentDate)
				
				// 同时更新日历显示的月份（如果跨月了）
				const newYear = currentDate.getFullYear()
				const newMonth = currentDate.getMonth() + 1
				if (this.currentCalendarYear !== newYear || this.currentCalendarMonth !== newMonth) {
					this.currentCalendarYear = newYear
					this.currentCalendarMonth = newMonth
					
					// 如果日历是展开状态，需要重新加载该月份的饮食记录日期
					if (this.showCalendar) {
						this.loadDietRecordDates()
					}
				}
				
				// 自动加载当天的饮食记录数据
				this.loadDietData()
			},
			
			// 切换日历月份
			changeCalendarMonth(direction) {
				if (direction === 1) {
					if (this.currentCalendarMonth === 12) {
						this.currentCalendarYear++
						this.currentCalendarMonth = 1
					} else {
						this.currentCalendarMonth++
					}
				} else {
					if (this.currentCalendarMonth === 1) {
						this.currentCalendarYear--
						this.currentCalendarMonth = 12
					} else {
						this.currentCalendarMonth--
					}
				}
				// 重新加载有饮食记录的日期
				this.loadDietRecordDates()
			},
			
			// 加载有饮食记录的日期
			async loadDietRecordDates() {
				try {
					// 获取当前月份的第一天和最后一天
					const startDate = new Date(this.currentCalendarYear, this.currentCalendarMonth - 1, 1)
					const endDate = new Date(this.currentCalendarYear, this.currentCalendarMonth, 0)
					
					const result = await getHealthRecords({
						type: 'diet',
						startDate: this.formatDate(startDate),
						endDate: this.formatDate(endDate),
						page: 1,
						pageSize: 1000
					})
					
					if (result.code === 200) {
						// 提取有记录的日期
						const recordDates = new Set()
						result.data.forEach(record => {
							const date = this.dateKey(record.recordDate || record.measuredAt || record.recordedAt || record.createTime)
							if (date) recordDates.add(date)
						})
						this.dietRecordDates = Array.from(recordDates)
					}
				} catch (error) {
					console.error('加载饮食记录日期失败:', error)
				}
			},
			
			// 添加饮食记录
			addDietRecord() {
				// 使用switchTab跳转到tabbar页面
				uni.switchTab({
					url: '/pages/patient/record'
				})
			},

			// 绘制体重趋势图
			drawWeightChart() {
				if (this.weightData.records.length === 0) return
				
				const ctx = uni.createCanvasContext('weightChart', this)
				const canvasWidth = 320
				const canvasHeight = 200
				const padding = 40
				const chartWidth = canvasWidth - padding * 2
				const chartHeight = canvasHeight - padding * 2
				
				// 清空画布
				ctx.clearRect(0, 0, canvasWidth, canvasHeight)
				
				// 获取体重数据
				const weights = this.weightData.records.map(record => record.weight).reverse()
				const dates = this.weightData.records.map(record => {
					const date = new Date(record.createTime)
					return `${date.getMonth() + 1}/${date.getDate()}`
				}).reverse()
				
				if (weights.length === 0) return
				
				// 计算数据范围
				const minWeight = Math.min(...weights)
				const maxWeight = Math.max(...weights)
				const weightRange = maxWeight - minWeight || 1
				const weightPadding = weightRange * 0.1
				const yMin = minWeight - weightPadding
				const yMax = maxWeight + weightPadding
				const yRange = yMax - yMin
				
				// 绘制背景网格
				ctx.setStrokeStyle('#E5E5E5')
				ctx.setLineWidth(1)
				for (let i = 0; i <= 4; i++) {
					const y = padding + (chartHeight / 4) * i
					ctx.beginPath()
					ctx.moveTo(padding, y)
					ctx.lineTo(padding + chartWidth, y)
					ctx.stroke()
				}
				
				// 绘制Y轴标签
				ctx.setFillStyle('#666666')
				ctx.setFontSize(12)
				for (let i = 0; i <= 4; i++) {
					const y = padding + (chartHeight / 4) * i
					const value = (yMax - (yRange / 4) * i).toFixed(1)
					ctx.fillText(value, 5, y + 4)
				}
				
				// 计算点的坐标
				const weightIntervals = Math.max(weights.length - 1, 1)
				const points = weights.map((weight, index) => {
					const x = padding + (chartWidth / weightIntervals) * index
					const y = padding + chartHeight - ((weight - yMin) / yRange) * chartHeight
					return { x, y, weight, date: dates[index] }
				})
				
				// 绘制趋势线
				ctx.setStrokeStyle('#2E86AB')
				ctx.setLineWidth(3)
				ctx.beginPath()
				points.forEach((point, index) => {
					if (index === 0) {
						ctx.moveTo(point.x, point.y)
					} else {
						ctx.lineTo(point.x, point.y)
					}
				})
				ctx.stroke()
				
				// 绘制数据点
				points.forEach(point => {
					// 外圈
					ctx.setFillStyle('#FFFFFF')
					ctx.beginPath()
					ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI)
					ctx.fill()
					
					// 内圈
					ctx.setFillStyle('#2E86AB')
					ctx.beginPath()
					ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI)
					ctx.fill()
				})
				
				// 绘制X轴日期标签
				ctx.setFillStyle('#666666')
				ctx.setFontSize(10)
				points.forEach((point, index) => {
					if (index % Math.ceil(points.length / 4) === 0 || index === points.length - 1) {
						ctx.fillText(point.date, point.x - 15, canvasHeight - 10)
					}
				})
				
				ctx.draw()
			},
			
			// 图表触摸事件
			onChartTouch(e) {
				// 可以在这里添加触摸交互逻辑
				console.log('图表被触摸', e)
			},
			
			// 卡路里图表触摸事件
			onCalorieChartTouch(e) {
				console.log('卡路里图表被触摸', e)
			},
			
			// 绘制卡路里趋势图
			drawCalorieChart() {
				if (this.calorieData.records.length === 0) return
				
				const ctx = uni.createCanvasContext('calorieChart', this)
				const canvasWidth = 320
				const canvasHeight = 200
				const padding = 40
				const chartWidth = canvasWidth - padding * 2
				const chartHeight = canvasHeight - padding * 2
				
				// 清空画布
				ctx.clearRect(0, 0, canvasWidth, canvasHeight)
				
				// 获取卡路里数据
				const calories = this.calorieData.records.map(record => record.calories).reverse()
				const dates = this.calorieData.records.map(record => {
					const date = new Date(record.date)
					return `${date.getMonth() + 1}/${date.getDate()}`
				}).reverse()
				
				if (calories.length === 0) return
				
				// 计算数据范围
				const minCalorie = Math.min(...calories)
				const maxCalorie = Math.max(...calories)
				const calorieRange = maxCalorie - minCalorie || 1
				const caloriePadding = calorieRange * 0.1
				const yMin = Math.max(minCalorie - caloriePadding, 0)
				const yMax = maxCalorie + caloriePadding
				const yRange = yMax - yMin
				
				// 绘制背景网格
				ctx.setStrokeStyle('#E5E5E5')
				ctx.setLineWidth(1)
				for (let i = 0; i <= 4; i++) {
					const y = padding + (chartHeight / 4) * i
					ctx.beginPath()
					ctx.moveTo(padding, y)
					ctx.lineTo(padding + chartWidth, y)
					ctx.stroke()
				}
				
				// 绘制Y轴标签
				ctx.setFillStyle('#666666')
				ctx.setFontSize(12)
				for (let i = 0; i <= 4; i++) {
					const y = padding + (chartHeight / 4) * i
					const value = Math.round(yMax - (yRange / 4) * i)
					ctx.fillText(value, 5, y + 4)
				}
				
				// 计算点的坐标
				const calorieIntervals = Math.max(calories.length - 1, 1)
				const points = calories.map((calorie, index) => {
					const x = padding + (chartWidth / calorieIntervals) * index
					const y = padding + chartHeight - ((calorie - yMin) / yRange) * chartHeight
					return { x, y, calorie, date: dates[index] }
				})
				
				// 绘制趋势线
				ctx.setStrokeStyle('#FF6B6B')
				ctx.setLineWidth(3)
				ctx.beginPath()
				points.forEach((point, index) => {
					if (index === 0) {
						ctx.moveTo(point.x, point.y)
					} else {
						ctx.lineTo(point.x, point.y)
					}
				})
				ctx.stroke()
				
				// 绘制数据点
				points.forEach(point => {
					// 外圈
					ctx.setFillStyle('#FFFFFF')
					ctx.beginPath()
					ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI)
					ctx.fill()
					
					// 内圈
					ctx.setFillStyle('#FF6B6B')
					ctx.beginPath()
					ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI)
					ctx.fill()
				})
				
				// 绘制X轴日期标签
				ctx.setFillStyle('#666666')
				ctx.setFontSize(10)
				points.forEach((point, index) => {
					if (index % Math.ceil(points.length / 4) === 0 || index === points.length - 1) {
						ctx.fillText(point.date, point.x - 15, canvasHeight - 10)
					}
				})
				
				ctx.draw()
			},
			
			// 刷新数据
			refreshData() {
				this.loadHealthData()
			}
		}
	}
</script>

<style>
	.container {
		padding: 20rpx;
		background-color: #F5F5F5;
		min-height: 100vh;
	}

	/* 选项卡样式 */
	.report-tabs {
		display: flex;
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 10rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 4rpx 20rpx rgba(46, 134, 171, 0.1);
	}

	.tab-item {
		flex: 1;
		text-align: center;
		padding: 20rpx 10rpx;
		border-radius: 16rpx;
		transition: all 0.3s ease;
	}

	.tab-item.active {
		background: linear-gradient(135deg, #2E86AB 0%, #A8DADC 100%);
		box-shadow: 0 4rpx 15rpx rgba(46, 134, 171, 0.3);
	}

	.tab-text {
		font-size: 28rpx;
		font-weight: 600;
		color: #666666;
	}

	.tab-item.active .tab-text {
		color: #ffffff;
	}

	/* 时间筛选样式 */
	.time-filter {
		display: flex;
		background-color: #ffffff;
		border-radius: 16rpx;
		padding: 8rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
	}

	.filter-item {
		flex: 1;
		text-align: center;
		padding: 15rpx;
		border-radius: 12rpx;
		transition: all 0.3s ease;
	}

	.filter-item.active {
		background-color: #2E86AB;
	}

	.filter-text {
		font-size: 26rpx;
		color: #666666;
		font-weight: 500;
	}

	.filter-item.active .filter-text {
		color: #ffffff;
	}

	/* 统计卡片样式 */
	.stats-cards {
		display: flex;
		gap: 20rpx;
		margin-bottom: 30rpx;
	}

	.stat-card {
		flex: 1;
		background-color: #ffffff;
		border-radius: 16rpx;
		padding: 25rpx 20rpx;
		text-align: center;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.stat-label {
		font-size: 24rpx;
		color: #666666;
		display: block;
		margin-bottom: 10rpx;
	}

	.stat-value {
		font-size: 36rpx;
		font-weight: 600;
		color: #333333;
		display: block;
		margin-bottom: 8rpx;
	}

	.stat-change {
		font-size: 22rpx;
		font-weight: 500;
		display: block;
	}

	.increase { color: #dc3545; }
	.decrease { color: #28a745; }
	.normal { color: #2E86AB; }
	.underweight { color: #17a2b8; }
	.overweight { color: #ffc107; }
	.obese { color: #dc3545; }

	/* 加载状态样式 */
	.loading-container {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(255, 255, 255, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.loading-content {
		padding: 40rpx;
		background: white;
		border-radius: 20rpx;
		box-shadow: 0 8rpx 30rpx rgba(0, 0, 0, 0.1);
		text-align: center;
	}

	.loading-text {
		font-size: 28rpx;
		color: #666666;
	}

	/* 空状态样式 */
	.empty-state {
		height: 300rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background-color: #F8F9FA;
		border-radius: 16rpx;
		border: 2rpx dashed #DEE2E6;
	}

	.empty-text {
		font-size: 28rpx;
		color: #666666;
		margin-bottom: 10rpx;
	}

	.empty-tip {
		font-size: 24rpx;
		color: #999999;
	}

	/* 图表容器样式 */
	.chart-container {
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 30rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.chart-header {
		margin-bottom: 30rpx;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.chart-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.time-filter {
		display: flex;
		background-color: #F8F9FA;
		border-radius: 12rpx;
		padding: 4rpx;
	}

	.time-btn {
		padding: 8rpx 16rpx;
		font-size: 24rpx;
		color: #666666;
		border-radius: 8rpx;
		transition: all 0.3s ease;
		cursor: pointer;
	}

	.time-btn.active {
		background-color: #2E86AB;
		color: #ffffff;
	}

	/* 图表包装器样式 */
	.chart-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.weight-chart {
		width: 640rpx;
		height: 400rpx;
		border-radius: 16rpx;
		background-color: #FAFAFA;
		border: 1rpx solid #E5E5E5;
	}
	
	.calorie-chart {
		width: 640rpx;
		height: 400rpx;
		border-radius: 16rpx;
		background-color: #FAFAFA;
		border: 1rpx solid #E5E5E5;
	}

	.chart-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		margin-top: 20rpx;
		padding: 0 20rpx;
	}

	.chart-records {
		font-size: 24rpx;
		color: #666666;
	}

	.chart-trend {
		font-size: 26rpx;
		font-weight: 600;
		padding: 8rpx 16rpx;
		border-radius: 20rpx;
	}

	.trend-up {
		color: #dc3545;
		background-color: rgba(220, 53, 69, 0.1);
	}

	.trend-down {
		color: #28a745;
		background-color: rgba(40, 167, 69, 0.1);
	}

	.trend-stable {
		color: #2E86AB;
		background-color: rgba(46, 134, 171, 0.1);
	}

	.placeholder-text {
		font-size: 32rpx;
		color: #666666;
		margin-bottom: 10rpx;
	}

	.placeholder-desc {
		font-size: 24rpx;
		color: #999999;
	}

	/* 营养概览样式 */
	.nutrition-overview {
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 30rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.overview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 30rpx;
	}

	.overview-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.overview-date {
		font-size: 26rpx;
		color: #666666;
	}

	.nutrition-circle {
		text-align: center;
	}

	.circle-chart {
		width: 200rpx;
		height: 200rpx;
		border-radius: 50%;
		background: conic-gradient(#2E86AB 0deg 216deg, #E9ECEF 216deg 360deg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin: 0 auto 20rpx;
		position: relative;
	}

	.circle-chart::before {
		content: '';
		position: absolute;
		width: 140rpx;
		height: 140rpx;
		background-color: #ffffff;
		border-radius: 50%;
	}

	.circle-value {
		font-size: 48rpx;
		font-weight: 600;
		color: #2E86AB;
		z-index: 1;
	}

	.circle-unit {
		font-size: 24rpx;
		color: #666666;
		z-index: 1;
	}

	.circle-target {
		font-size: 24rpx;
		color: #666666;
	}

	/* 营养详情样式 */
	.nutrition-details {
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 30rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.nutrition-item {
		margin-bottom: 30rpx;
	}

	.nutrition-item:last-child {
		margin-bottom: 0;
	}

	.nutrition-info {
		display: flex;
		align-items: center;
		margin-bottom: 15rpx;
	}

	.nutrition-icon {
		font-size: 32rpx;
		margin-right: 15rpx;
	}

	.nutrition-text {
		flex: 1;
	}

	.nutrition-name {
		font-size: 28rpx;
		font-weight: 600;
		color: #333333;
		display: block;
		margin-bottom: 5rpx;
	}

	.nutrition-amount {
		font-size: 24rpx;
		color: #666666;
		display: block;
	}

	.nutrition-progress {
		display: flex;
		align-items: center;
		gap: 15rpx;
	}

	.progress-bar {
		flex: 1;
		height: 12rpx;
		background-color: #E9ECEF;
		border-radius: 6rpx;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: 6rpx;
		transition: width 0.3s ease;
	}

	.progress-percent {
		font-size: 24rpx;
		color: #666666;
		font-weight: 500;
		min-width: 60rpx;
		text-align: right;
	}

	/* 营养建议样式 */
	.nutrition-advice {
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 30rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.advice-header {
		margin-bottom: 20rpx;
	}

	.advice-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.advice-list {
		padding-left: 20rpx;
	}

	.advice-item {
		margin-bottom: 15rpx;
		position: relative;
	}

	.advice-item::before {
		content: '•';
		position: absolute;
		left: -20rpx;
		color: #2E86AB;
		font-weight: 600;
	}

	.advice-text {
		font-size: 26rpx;
		color: #666666;
		line-height: 1.5;
	}

	/* 日期选择器样式 */
	.date-selector {
		display: flex;
		align-items: center;
		background-color: #ffffff;
		border-radius: 16rpx;
		padding: 20rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
	}

	.date-nav {
		width: 60rpx;
		height: 60rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #F8F9FA;
		border-radius: 50%;
		transition: all 0.3s ease;
	}

	.date-nav:active {
		background-color: #2E86AB;
	}

	.nav-icon {
		font-size: 32rpx;
		color: #666666;
		font-weight: 600;
	}

	.date-nav:active .nav-icon {
		color: #ffffff;
	}

	.date-display {
		flex: 1;
		text-align: center;
	}

	.date-text {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
		cursor: pointer;
	}
	
	/* 日历样式 */
	.calendar-container {
		background-color: #ffffff;
		border-radius: 16rpx;
		padding: 20rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
	}
	
	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20rpx;
		padding: 0 10rpx;
	}
	
	.month-nav {
		width: 50rpx;
		height: 50rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #F8F9FA;
		border-radius: 50%;
		transition: all 0.3s ease;
	}
	
	.month-nav:active {
		background-color: #2E86AB;
	}
	
	.month-nav:active .nav-icon {
		color: #ffffff;
	}
	
	.month-display {
		flex: 1;
		text-align: center;
	}
	
	.month-text {
		font-size: 28rpx;
		font-weight: 600;
		color: #333333;
	}
	
	.calendar-weekdays {
		display: flex;
		margin-bottom: 10rpx;
	}
	
	.weekday {
		flex: 1;
		text-align: center;
		padding: 10rpx 0;
		font-size: 24rpx;
		color: #666666;
		font-weight: 500;
	}
	
	.calendar-days {
		display: flex;
		flex-wrap: wrap;
	}
	
	.calendar-day {
		width: 14.28%;
		height: 70rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		cursor: pointer;
		transition: all 0.3s ease;
	}
	
	.day-text {
		font-size: 26rpx;
		color: #333333;
		z-index: 2;
		position: relative;
	}
	
	.calendar-day.other-month .day-text {
		color: #CCCCCC;
	}
	
	.calendar-day.selected {
		background-color: #2E86AB;
		border-radius: 50%;
	}
	
	.calendar-day.selected .day-text {
		color: #ffffff;
		font-weight: 600;
	}
	
	.calendar-day.has-record::after {
		content: '';
		position: absolute;
		bottom: 8rpx;
		left: 50%;
		transform: translateX(-50%);
		width: 8rpx;
		height: 8rpx;
		background-color: #FF6B6B;
		border-radius: 50%;
		z-index: 1;
	}
	
	.calendar-day.selected.has-record::after {
		background-color: #ffffff;
	}

	/* 饮食记录样式 */
	.diet-records {
		margin-bottom: 30rpx;
	}

	.meal-section {
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 30rpx;
		margin-bottom: 20rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.meal-header {
		display: flex;
		align-items: center;
		margin-bottom: 20rpx;
		padding-bottom: 15rpx;
		border-bottom: 2rpx solid #F0F0F0;
	}

	.meal-icon {
		font-size: 32rpx;
		margin-right: 15rpx;
	}

	.meal-name {
		flex: 1;
		font-size: 30rpx;
		font-weight: 600;
		color: #333333;
	}

	.meal-calories {
		font-size: 28rpx;
		color: #2E86AB;
		font-weight: 600;
	}

	.food-list {
		padding-left: 20rpx;
	}

	.food-item {
		display: flex;
		align-items: center;
		padding: 10rpx 0;
		border-bottom: 1rpx solid #F8F9FA;
	}

	.food-item:last-child {
		border-bottom: none;
	}

	.food-info {
		flex: 1;
	}

	.food-name {
		font-size: 26rpx;
		color: #333333;
		display: block;
		margin-bottom: 5rpx;
	}

	.food-amount {
		font-size: 22rpx;
		color: #666666;
		display: block;
	}

	.food-calories {
		font-size: 24rpx;
		color: #666666;
		font-weight: 500;
	}

	/* 添加按钮样式 */
	.add-diet-btn {
		background: linear-gradient(135deg, #2E86AB 0%, #A8DADC 100%);
		border-radius: 16rpx;
		padding: 25rpx;
		text-align: center;
		box-shadow: 0 4rpx 15rpx rgba(46, 134, 171, 0.3);
	}

	.add-btn-text {
		font-size: 30rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.add-diet-btn:active {
		transform: scale(0.98);
	}
	
	/* 重定向提示样式 */
	.redirect-notice {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100vh;
		padding: 40rpx;
	}
	
	.notice-content {
		text-align: center;
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 60rpx 40rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.1);
	}
	
	.notice-icon {
		font-size: 80rpx;
		display: block;
		margin-bottom: 30rpx;
	}
	
	.notice-title {
		font-size: 36rpx;
		font-weight: 600;
		color: #333333;
		display: block;
		margin-bottom: 20rpx;
	}
	
	.notice-text {
		font-size: 28rpx;
		color: #666666;
		display: block;
	}
</style>

<style>
	.container {
		box-sizing: border-box;
		min-height: 100vh;
		padding: 24rpx 24rpx 160rpx;
		background: linear-gradient(180deg, #eaf8fd 0, #f5fafc 250rpx, #f3f7f9 100%);
		color: #193b4e;
	}

	.container view,
	.container text,
	.container canvas {
		box-sizing: border-box;
	}

	.report-tabs {
		display: flex;
		gap: 8rpx;
		margin-bottom: 22rpx;
		padding: 8rpx;
		border: 1rpx solid rgba(35, 115, 149, 0.08);
		border-radius: 22rpx;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 8rpx 24rpx rgba(25, 81, 106, 0.06);
	}

	.report-tabs .tab-item {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6rpx;
		min-height: 88rpx;
		padding: 0 8rpx;
		border-radius: 17rpx;
		background: transparent;
	}

	.report-tabs .tab-item.active {
		background: #e8f7fc;
		box-shadow: inset 0 0 0 1rpx rgba(23, 147, 190, 0.08);
	}

	.report-tabs .tab-text {
		font-size: 23rpx;
		font-weight: 600;
		color: #748995;
	}

	.report-tabs .tab-item.active .tab-text {
		color: #168fb9;
	}

	.report-content > .time-filter {
		display: flex;
		gap: 8rpx;
		margin-bottom: 22rpx;
		padding: 7rpx;
		border-radius: 18rpx;
		background: #ffffff;
		box-shadow: 0 6rpx 20rpx rgba(25, 81, 106, 0.05);
	}

	.filter-item {
		min-height: 58rpx;
		padding: 0;
		border-radius: 14rpx;
		line-height: 58rpx;
	}

	.filter-item.active {
		background: #e8f7fc;
	}

	.filter-text,
	.filter-item.active .filter-text {
		font-size: 23rpx;
		font-weight: 600;
		color: #6f8591;
	}

	.filter-item.active .filter-text {
		color: #168fb9;
	}

	.stats-cards {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12rpx;
		margin-bottom: 22rpx;
	}

	.stat-card {
		padding: 24rpx 8rpx;
		border: 1rpx solid rgba(35, 115, 149, 0.07);
		border-radius: 22rpx;
		background: #ffffff;
		box-shadow: 0 8rpx 24rpx rgba(25, 81, 106, 0.06);
	}

	.stat-label {
		font-size: 20rpx;
		color: #8497a2;
	}

	.stat-value {
		margin: 9rpx 0 6rpx;
		font-size: 32rpx;
		font-weight: 700;
		color: #1d4c64;
	}

	.stat-change {
		font-size: 19rpx;
	}

	.chart-container,
	.nutrition-overview,
	.nutrition-details,
	.nutrition-advice,
	.date-selector,
	.calendar-container,
	.meal-section,
	.notice-content {
		border: 1rpx solid rgba(35, 115, 149, 0.07);
		border-radius: 24rpx;
		background: #ffffff;
		box-shadow: 0 10rpx 30rpx rgba(25, 81, 106, 0.065);
	}

	.chart-container,
	.nutrition-overview,
	.nutrition-details,
	.nutrition-advice {
		padding: 26rpx 24rpx;
		margin-bottom: 22rpx;
	}

	.chart-header,
	.overview-header {
		display: flex;
		align-items: center;
		gap: 9rpx;
		margin-bottom: 20rpx;
	}

	.chart-title,
	.overview-title,
	.advice-title {
		font-size: 29rpx;
		font-weight: 700;
		color: #193b4e;
	}

	.chart-subtitle,
	.overview-date {
		margin-left: auto;
		font-size: 20rpx;
		color: #8699a3;
	}

	.chart-header .time-filter {
		margin-left: auto;
		padding: 5rpx;
		border-radius: 15rpx;
		background: #f1f7f9;
		box-shadow: none;
	}

	.time-btn {
		padding: 7rpx 12rpx;
		border-radius: 11rpx;
		font-size: 20rpx;
		color: #718692;
	}

	.time-btn.active {
		background: #168fb9;
		color: #ffffff;
	}

	.weight-chart,
	.calorie-chart {
		display: block;
		width: 100%;
		height: 390rpx;
		border: 0;
		border-radius: 18rpx;
		background: #f9fcfd;
	}

	.chart-info {
		margin-top: 16rpx;
		padding: 0;
	}

	.chart-records {
		font-size: 21rpx;
		color: #8497a2;
	}

	.chart-trend {
		padding: 7rpx 12rpx;
		border-radius: 12rpx;
		font-size: 20rpx;
	}

	.empty-state {
		height: auto;
		min-height: 240rpx;
		padding: 34rpx;
		border: 1rpx dashed #c9dce4;
		border-radius: 20rpx;
		background: #f8fbfc;
	}

	.empty-text {
		margin: 14rpx 0 5rpx;
		font-size: 25rpx;
		font-weight: 600;
		color: #647d89;
	}

	.empty-tip {
		font-size: 21rpx;
		color: #91a1aa;
	}

	.circle-chart {
		width: 210rpx;
		height: 210rpx;
		background: conic-gradient(#168fb9 0deg 216deg, #e7f1f4 216deg 360deg);
	}

	.circle-value {
		font-size: 46rpx;
		color: #168fb9;
	}

	.circle-target {
		font-size: 21rpx;
		color: #80949f;
	}

	.progress-bar {
		background: #e5eff3;
	}

	.progress-fill {
		background: #168fb9 !important;
	}

	.advice-item::before {
		color: #168fb9;
	}

	.date-selector {
		padding: 15rpx;
		margin-bottom: 20rpx;
	}

	.date-nav,
	.month-nav {
		width: 88rpx;
		height: 88rpx;
		background: #edf7fa;
	}

	.date-display {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12rpx;
		min-height: 88rpx;
	}

	.date-text,
	.month-text {
		font-size: 27rpx;
		font-weight: 700;
		color: #284b5e;
	}

	.calendar-container {
		padding: 22rpx;
		margin-bottom: 20rpx;
	}

	.calendar-day.selected {
		background: #168fb9;
	}

	.calendar-day.has-record::after {
		background: #ef8963;
	}

	.meal-section {
		padding: 24rpx;
		margin-bottom: 16rpx;
	}

	.meal-header {
		border-bottom-color: #eaf1f4;
	}

	.meal-name {
		font-size: 27rpx;
		color: #294b5e;
	}

	.meal-calories,
	.food-calories {
		color: #168fb9;
	}

	.add-diet-btn {
		border-radius: 22rpx;
		background: linear-gradient(102deg, #188eb8 0%, #20a5ca 100%);
		box-shadow: 0 10rpx 22rpx rgba(22, 143, 184, 0.2);
	}

	.add-btn-text {
		font-size: 27rpx;
		font-weight: 700;
	}

	.loading-container {
		background: rgba(240, 248, 251, 0.92);
		backdrop-filter: blur(6rpx);
	}

	.loading-content {
		border-radius: 22rpx;
		box-shadow: 0 12rpx 34rpx rgba(25, 81, 106, 0.1);
	}

	.summary-intro {
		display: flex;
		align-items: center;
		gap: 18rpx;
		padding: 26rpx;
		margin-bottom: 20rpx;
		border: 1rpx solid rgba(35, 115, 149, 0.08);
		border-radius: 24rpx;
		background: linear-gradient(135deg, #e8f7fb, #f8fcfd);
	}

	.summary-intro-title,
	.summary-intro-copy { display: block; }
	.summary-intro-title { font-size: 29rpx; font-weight: 700; color: #1c5068; }
	.summary-intro-copy { margin-top: 7rpx; font-size: 21rpx; line-height: 1.5; color: #718a96; }
	.summary-empty { min-height: 360rpx; border-radius: 24rpx; background: #fff; }
	.patient-summary-list { display: grid; gap: 20rpx; }
	.patient-summary-card { padding: 26rpx; border: 1rpx solid rgba(35, 115, 149, 0.08); border-radius: 24rpx; background: #fff; box-shadow: 0 10rpx 30rpx rgba(25, 81, 106, 0.065); }
	.patient-summary-head { display: flex; align-items: center; gap: 16rpx; }
	.patient-summary-badge { flex: 0 0 auto; padding: 9rpx 14rpx; border-radius: 22rpx; background: #e3f5f9; color: #1687aa; font-size: 21rpx; font-weight: 700; }
	.patient-summary-period,
	.patient-summary-author { display: block; }
	.patient-summary-period { font-size: 25rpx; font-weight: 700; color: #284b5d; }
	.patient-summary-author { margin-top: 6rpx; font-size: 19rpx; color: #8a9ba3; }
	.patient-summary-metrics { display: grid; grid-template-columns: 1fr 1fr; margin: 24rpx 0; border: 1rpx solid #e5eef1; border-radius: 18rpx; overflow: hidden; }
	.patient-summary-metrics view { padding: 18rpx 20rpx; border-right: 1rpx solid #e8eff1; border-bottom: 1rpx solid #e8eff1; }
	.patient-summary-metrics view:nth-child(2n) { border-right: 0; }
	.patient-summary-metrics view:nth-last-child(-n+2) { border-bottom: 0; }
	.patient-summary-metrics text { display: block; }
	.patient-summary-metrics text:first-child { font-size: 19rpx; color: #8599a2; }
	.patient-summary-metrics text:last-child { margin-top: 7rpx; font-size: 28rpx; font-weight: 700; color: #24546a; }
	.patient-summary-comment { padding: 22rpx; border-left: 6rpx solid #38a3bf; border-radius: 0 16rpx 16rpx 0; background: #eff8fa; }
	.patient-summary-comment-title,
	.patient-summary-comment-copy { display: block; }
	.patient-summary-comment-title { font-size: 21rpx; font-weight: 700; color: #187a96; }
	.patient-summary-comment-copy { margin-top: 10rpx; font-size: 24rpx; line-height: 1.75; color: #3c5d69; white-space: pre-wrap; }
</style>
