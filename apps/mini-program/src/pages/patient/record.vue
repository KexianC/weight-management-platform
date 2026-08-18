<template>
	<view class="container">	
		<!-- 切换标签 -->
		<view class="tab-container">
			<view 
				class="tab-item" 
				:class="{active: activeTab === 'weight'}"
				@click="switchTab('weight')"
			>
				<view class="tab-text"><Icon name="Others/scales-line.svg" size="16" :color="activeTab === 'weight' ? '$primary-color' : '$gray-500'" /><text>体重记录</text></view>
			</view>
			<view 
				class="tab-item" 
				:class="{active: activeTab === 'diet'}"
				@click="switchTab('diet')"
			>
				<view class="tab-text"><Icon name="Food/restaurant-line.svg" size="16" :color="activeTab === 'diet' ? '$primary-color' : '$gray-500'" /><text>饮食记录</text></view>
			</view>
		</view>

		<!-- 体重记录 -->
		<view class="record-content" v-if="activeTab === 'weight'">
			<view class="record-card">
				<view class="card-header">
					<text class="card-title">今日体重</text>
					<text class="card-date">{{currentDate}}</text>
				</view>
				<view class="weight-input">
					<input 
						class="weight-number" 
						type="digit" 
						v-model="weightData.weight"
						placeholder="请输入体重"
						maxlength="5"
					/>
					<text class="weight-unit">kg</text>
				</view>
				<view class="bmi-display" v-if="bmiValue">
					<text class="bmi-label">BMI指数：</text>
					<text class="bmi-value" :class="bmiStatus.class">{{bmiValue}}</text>
					<text class="bmi-status" :class="bmiStatus.class">{{bmiStatus.text}}</text>
				</view>
				<view class="target-display" v-if="targetWeight && weightData.weight">
					<text class="target-label">目标体重：</text>
					<text class="target-value">{{targetWeight}}kg</text>
					<text class="diff-label">距离目标：</text>
					<text class="diff-value" :class="weightDiff > 0 ? 'over-target' : 'under-target'">
						{{weightDiff > 0 ? '+' : ''}}{{weightDiff}}kg
					</text>
				</view>
				<view class="record-actions">
					<button class="save-btn" @click="saveWeight">保存记录</button>
				</view>
			</view>

			<!-- 历史记录 -->
			<view class="history-section">
				<view class="section-title">
				<view class="title-text"><Icon name="Business/bar-chart-line.svg" size="16" color="$primary-color" /><text>历史记录</text></view>
			</view>
				<view class="history-list">
					<view 
						class="history-item" 
						v-for="(item, index) in weightHistory" 
						:key="index"
					>
						<view class="history-date">
							<text class="date-text">{{item.date}}</text>
						</view>
						<view class="history-weight">
							<text class="weight-text">{{item.weight}}kg</text>
							<text class="change-text" :class="item.change > 0 ? 'increase' : 'decrease'">
								{{item.change > 0 ? '+' : ''}}{{item.change}}kg
							</text>
						</view>
					</view>
				</view>
			</view>
		</view>
		
		<!-- 饮食记录 -->
		<view class="record-content" v-if="activeTab === 'diet'">
			<view class="record-card">
				<view class="card-header">
					<text class="card-title">今日饮食</text>
					<text class="card-date">{{currentDate}}</text>
				</view>
				
				<!-- 餐次选择 -->
				<view class="meal-type-selector">
					<view class="meal-type-label">餐次：</view>
					<view class="meal-type-options">
						<view 
						class="meal-option" 
						:class="{active: dietData.mealType === 'breakfast'}"
						@click="selectMealType('breakfast')"
					>
						<view class="meal-text"><Icon name="Weather/sun-line.svg" size="16" :color="dietData.mealType === 'breakfast' ? '$primary-color' : '$gray-500'" /><text>早餐</text></view>
					</view>
					<view 
						class="meal-option" 
						:class="{active: dietData.mealType === 'lunch'}"
						@click="selectMealType('lunch')"
					>
						<view class="meal-text"><Icon name="Weather/sun-line.svg" size="16" :color="dietData.mealType === 'lunch' ? '$primary-color' : '$gray-500'" /><text>午餐</text></view>
					</view>
					<view 
						class="meal-option" 
						:class="{active: dietData.mealType === 'dinner'}"
						@click="selectMealType('dinner')"
					>
						<view class="meal-text"><Icon name="Weather/moon-line.svg" size="16" :color="dietData.mealType === 'dinner' ? '$primary-color' : '$gray-500'" /><text>晚餐</text></view>
					</view>
					<view 
						class="meal-option" 
						:class="{active: dietData.mealType === 'snack'}"
						@click="selectMealType('snack')"
					>
						<view class="meal-text"><Icon name="Food/cake-line.svg" size="16" :color="dietData.mealType === 'snack' ? '$primary-color' : '$gray-500'" /><text>加餐</text></view>
					</view>
					</view>
				</view>
				
				<!-- 已添加的食物列表 -->
				<view class="added-foods-section" v-if="dietData.foods.length > 0">
					<view class="section-title">
					<view class="title-text"><Icon name="Food/restaurant-line.svg" size="16" color="$primary-color" /><text>已添加食物</text></view>
				</view>
					<view class="food-list">
						<view 
							class="food-item" 
							v-for="(food, index) in dietData.foods" 
							:key="index"
						>
							<view class="food-info">
								<text class="food-name">{{food.foodName}}</text>
								<view class="food-details">
									<text class="food-weight">{{food.foodWeight}}g</text>
									<text class="food-calories">{{food.calories}}kcal</text>
								</view>
							</view>
							<button class="remove-food-btn" @click="removeFood(index)">
							<Icon name="System/close-line.svg" size="16" color="$error-color" class="remove-text" />
						</button>
						</view>
					</view>
					<view class="total-calories">
						<text class="total-label">总卡路里：</text>
						<text class="total-value">{{totalCalories}}kcal</text>
					</view>
				</view>
				
				<!-- 添加食物输入 -->
				<view class="food-input-section">
					<view class="section-title">
					<view class="title-text"><Icon name="System/add-line.svg" size="16" color="$primary-color" /><text>添加食物</text></view>
				</view>
					<view class="input-group">
						<text class="input-label">食物名称：</text>
						<input 
							class="food-input" 
							type="text" 
							v-model="currentFood.foodName"
							placeholder="请输入食物名称"
							maxlength="50"
						/>
					</view>
					
					<view class="input-group">
						<text class="input-label">食物重量：</text>
						<view class="input-with-unit">
							<input 
								class="food-input" 
								type="digit" 
								v-model="currentFood.foodWeight"
								placeholder="请输入重量"
								maxlength="6"
							/>
							<text class="input-unit">g</text>
						</view>
					</view>
					
					<view class="input-group">
						<text class="input-label">卡路里：</text>
						<view class="input-with-unit">
							<input 
								class="food-input" 
								type="digit" 
								v-model="currentFood.calories"
								placeholder="请输入卡路里"
								maxlength="6"
							/>
							<text class="input-unit">kcal</text>
							<button 
								class="ai-calc-btn" 
								@click="calculateCalories"
								:disabled="aiCalculating"
							>
								<text class="ai-btn-text">{{aiCalculating ? 'AI计算中...' : 'AI计算'}}</text>
							</button>
						</view>
					</view>
					
					<view class="add-food-actions">
					<button class="add-food-btn" @click="addFood"><Icon name="System/add-line.svg" size="16" color="#FFFFFF" /> 添加到列表</button>
				</view>
					
					<view class="input-group">
						<text class="input-label">用餐时间：</text>
						<picker 
						mode="time" 
						@change="onTimeChange"
						class="time-picker"
					>
							<view class="time-display">
							<text class="time-text">{{dietData.mealTime || '请选择时间'}}</text>
							<Icon name="System/time-line.svg" size="16" color="$gray-500" class="time-icon" />
						</view>
						</picker>
					</view>
				</view>
				
				<view class="record-actions">
					<button class="save-btn" @click="saveDiet">保存记录</button>
				</view>
			</view>
			
			<!-- 饮食历史记录 -->
			<view class="history-section">
				<view class="section-title">
				<view class="title-text"><Icon name="Food/restaurant-line.svg" size="16" color="$primary-color" /><text>饮食记录</text></view>
			</view>
				<view class="history-list">
					<view 
					class="diet-history-wrapper" 
					v-for="(item, index) in dietHistory" 
					:key="index"
				>
					<view 
						class="diet-history-item"
						@touchstart="onTouchStart($event, index)"
						@touchmove="onTouchMove($event, index)"
						@touchend="onTouchEnd($event, index)"
						:style="{transform: `translateX(${item.translateX || 0}px)`}"
					>
						<view class="diet-header">
							<view class="diet-date">
								<text class="date-text">{{item.date}}</text>
								<text class="meal-type-text">{{getMealTypeText(item.mealType)}}</text>
							</view>
							<view class="diet-time">
								<text class="time-text">{{item.mealTime}}</text>
							</view>
						</view>
						<view class="diet-content">
							<text class="food-name">{{item.foodName}}</text>
							<view class="food-details">
								<text class="food-weight">{{item.foodWeight}}g</text>
								<text class="food-calories">{{item.calories}}kcal</text>
							</view>
						</view>
					</view>
					<view class="delete-action" @click="confirmDeleteDietRecord(item, index)">
						<text class="delete-text">删除</text>
					</view>
				</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import { createHealthRecord, getHealthRecords, calculateCaloriesWithAI, deleteHealthRecord } from '../../utils/api.js'
	import { showToast } from '../../utils/common.js'
	import store from '../../store/index.js'
	import Icon from '../../components/Icon.vue'
	
	export default {
		components: {
			Icon
		},
		data() {
			return {
			activeTab: 'weight', // 当前激活的标签页
			currentDate: '',
			loading: false,
			targetWeight: 0,
			// 体重数据
			weightData: {
				weight: '',
				height: null // 仅使用用户资料中的真实身高；缺失时不推算 BMI
			},
			// 饮食数据
			dietData: {
				mealType: 'breakfast', // 餐次类型
				mealTime: '', // 用餐时间
				foods: [] // 食物列表
			},
			// 当前正在添加的食物
			currentFood: {
				foodName: '', // 食物名称
				foodWeight: '', // 食物重量
				calories: '' // 卡路里
			},
			// AI计算状态
			aiCalculating: false,
			// 体重历史记录
			weightHistory: [],
			// 饮食历史记录
			dietHistory: [],
			// 滑动删除相关
			touchStartX: 0,
			touchStartY: 0,
			currentSwipeIndex: -1
		}
		},
		computed: {
			// 计算BMI值
			bmiValue() {
				if (this.weightData.weight && this.weightData.height) {
					const bmi = (this.weightData.weight / Math.pow(this.weightData.height / 100, 2)).toFixed(1)
					return bmi
				}
				return null
			},
			// BMI状态
			bmiStatus() {
				if (!this.bmiValue) return { text: '', class: '' }
				
				const bmi = parseFloat(this.bmiValue)
				if (bmi < 18.5) {
					return { text: '偏瘦', class: 'underweight' }
				} else if (bmi < 24) {
					return { text: '正常', class: 'normal' }
				} else if (bmi < 28) {
					return { text: '超重', class: 'overweight' }
				} else {
					return { text: '肥胖', class: 'obese' }
				}
			},
			// 计算与目标体重的差值
			weightDiff() {
				if (this.weightData.weight && this.targetWeight) {
					return (parseFloat(this.weightData.weight) - this.targetWeight).toFixed(1)
				}
				return 0
			},
			// 计算总卡路里
			totalCalories() {
				return this.dietData.foods.reduce((total, food) => {
					return total + (parseFloat(food.calories) || 0)
				}, 0)
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
			
			// 处理从其他页面传递的tab参数
			if (options.tab) {
				this.activeTab = options.tab
			}
			
			this.getCurrentDate()
			this.setDefaultMealTime()
			this.loadUserInfo()
			this.loadWeightHistory()
			this.loadDietHistory()
		},
		methods: {
			// 获取当前日期
			getCurrentDate() {
				const now = new Date()
				const year = now.getFullYear()
				const month = String(now.getMonth() + 1).padStart(2, '0')
				const day = String(now.getDate()).padStart(2, '0')
				this.currentDate = `${year}-${month}-${day}`
			},
			
			// 设置默认用餐时间为当前时间
			setDefaultMealTime() {
				const now = new Date()
				const hours = String(now.getHours()).padStart(2, '0')
				const minutes = String(now.getMinutes()).padStart(2, '0')
				this.dietData.mealTime = `${hours}:${minutes}`
			},
			
			// 保存体重记录
			async saveWeight() {
				// 检查登录状态
				if (!store.isLogin()) {
					uni.showModal({
						title: '提示',
						content: '请先登录',
						success: (res) => {
							if (res.confirm) {
								uni.reLaunch({
									url: '/pages/login/login'
								})
							}
						}
					})
					return
				}
				
				if (!this.weightData.weight) {
					showToast('请输入体重')
					return
				}
				
				try {
					this.loading = true
					
					// 计算BMI
				const weight = parseFloat(this.weightData.weight)
				const height = this.weightData.height
				const bmi = height ? (weight / Math.pow(height / 100, 2)).toFixed(1) : null
				
				// 调用独立后端保存体重记录
				const recordData = {
					type: 'weight',
					weight: weight,
					height: height,
					bmi: bmi ? parseFloat(bmi) : null,
					recordDate: this.currentDate,
					notes: '体重记录'
				}
					
					const result = await createHealthRecord(recordData)
					if (result.code === 200) {
						showToast('保存成功', 'success')
						
						// 重新加载历史记录
						await this.loadWeightHistory()
						
						// 清空输入
						this.weightData.weight = ''
					} else {
						showToast(result.message || '保存失败')
					}
				} catch (error) {
					console.error('保存体重记录失败:', error)
					showToast('保存失败，请重试')
				} finally {
					this.loading = false
				}
			},
			

			
			// 加载用户信息
			async loadUserInfo() {
				try {
					const userInfo = store.getUserInfo()
					if (userInfo) {
						if (userInfo.height) {
							this.weightData.height = userInfo.height
						}
						if (userInfo.targetWeight) {
							this.targetWeight = userInfo.targetWeight
						}
					}
				} catch (error) {
					console.error('加载用户信息失败:', error)
				}
			},
			
			// 加载体重历史记录
			async loadWeightHistory() {
				// 检查登录状态
				if (!store.isLogin()) {
					return
				}
				
				try {
					const result = await getHealthRecords({ 
						type: 'weight', 
						limit: 10, 
						orderBy: 'createTime', 
						order: 'desc' 
					})
					
					if (result.code === 200) {
						const records = result.data || []
						this.weightHistory = records.map((record, index) => {
							const prevRecord = records[index + 1]
							const change = prevRecord ? (record.weight - prevRecord.weight).toFixed(1) : 0
							
							return {
								date: record.recordDate,
								weight: record.weight,
								change: parseFloat(change)
							}
						})
					}
				} catch (error) {
					console.error('加载体重历史失败:', error)
					if (error.message && error.message.includes('未登录')) {
						uni.reLaunch({
							url: '/pages/login/login'
						})
					}
				}
			},
			
			// 切换标签页
			switchTab(tab) {
				this.activeTab = tab
			},
			
			// 选择餐次类型
			selectMealType(mealType) {
				this.dietData.mealType = mealType
			},
			
			// AI自动计算卡路里（优化版本）
			async calculateCalories() {
				if (!this.currentFood.foodName || !this.currentFood.foodWeight) {
					showToast('请先输入食物名称和重量')
					return
				}
				
				if (this.aiCalculating) {
					uni.showModal({
						title: 'AI计算中',
						content: 'AI计算中，请稍等\n计算结果仅供参考',
						showCancel: false,
						confirmText: '知道了'
					})
					return
				}
				
				try {
					this.aiCalculating = true
					
					// 显示计算提示
					uni.showModal({
						title: 'AI计算中',
						content: 'AI计算中，请稍等\n计算结果仅供参考',
						showCancel: false,
						confirmText: '知道了'
					})
					
					// 调用优化后的AI计算接口
					const result = await calculateCaloriesWithAI(
						this.currentFood.foodName,
						this.currentFood.foodWeight,
						{
							showError: false // 自定义错误处理
						}
					)
					
					if (result.code === 200) {
						this.currentFood.calories = result.data.calories.toString()
						uni.showToast({
							title: `计算成功！${result.data.calories}卡路里`,
							icon: 'success',
							duration: 2000
						})
					} else {
						this.showAICalculationError(result.message || 'AI计算失败')
					}
				} catch (error) {
					console.error('AI计算卡路里失败:', error)
					
					// 根据错误类型显示不同提示
					if (error.message && error.message.includes('超时')) {
						this.showAICalculationError('AI计算超时，请稍后重试', true)
					} else {
						this.showAICalculationError('AI计算失败，请检查网络后重试', true)
					}
				} finally {
					this.aiCalculating = false
				}
			},
			
			// 显示AI计算错误并提供降级方案
			showAICalculationError(message, showFallback = false) {
				if (showFallback) {
					uni.showModal({
						title: 'AI计算失败',
						content: `${message}\n\n是否查看常见食物卡路里参考？`,
						confirmText: '查看参考',
						cancelText: '手动输入',
						success: (res) => {
							if (res.confirm) {
								this.showCommonFoodCalories()
							}
						}
					})
				} else {
					showToast(message)
				}
			},
			
			// 显示常见食物卡路里参考
			showCommonFoodCalories() {
				const commonFoods = [
					{ name: '米饭', calories: '116卡/100g' },
					{ name: '面条', calories: '109卡/100g' },
					{ name: '鸡蛋', calories: '144卡/100g' },
					{ name: '鸡胸肉', calories: '133卡/100g' },
					{ name: '苹果', calories: '54卡/100g' },
					{ name: '香蕉', calories: '93卡/100g' }
				]
				
				const content = commonFoods.map(food => `${food.name}: ${food.calories}`).join('\n')
				
				uni.showModal({
					title: '常见食物卡路里参考',
					content: content + '\n\n请根据实际重量计算卡路里',
					showCancel: false,
					confirmText: '知道了'
				})
			},
			
			// 添加食物到列表
			addFood() {
				// 验证必填字段
				if (!this.currentFood.foodName) {
					showToast('请输入食物名称')
					return
				}
				if (!this.currentFood.foodWeight) {
					showToast('请输入食物重量')
					return
				}
				if (!this.currentFood.calories) {
					showToast('请输入卡路里')
					return
				}
				
				// 添加到食物列表
				this.dietData.foods.push({
					foodName: this.currentFood.foodName,
					foodWeight: parseFloat(this.currentFood.foodWeight),
					calories: parseFloat(this.currentFood.calories)
				})
				
				// 清空当前输入
				this.currentFood = {
					foodName: '',
					foodWeight: '',
					calories: ''
				}
				
				showToast('添加成功', 'success')
			},
			
			// 移除食物
			removeFood(index) {
				this.dietData.foods.splice(index, 1)
				showToast('已移除', 'success')
			},
			
			// 时间选择器变化
			onTimeChange(e) {
				this.dietData.mealTime = e.detail.value
			},
			
			// 获取餐次类型文本
			getMealTypeText(mealType) {
				const mealTypeMap = {
					breakfast: '早餐',
					lunch: '午餐',
					dinner: '晚餐',
					snack: '加餐'
				}
				return mealTypeMap[mealType] || mealType
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
						this.dietHistory[index].translateX = translateX
						this.currentSwipeIndex = index
					}
				}
			},
			
			onTouchEnd(e, index) {
				const item = this.dietHistory[index]
				const translateX = item.translateX || 0
				
				// 如果滑动距离超过40px，显示删除按钮
				if (translateX < -40) {
					this.dietHistory[index].translateX = -80
				} else {
					// 否则回弹
					this.dietHistory[index].translateX = 0
				}
			},
			
			// 重置所有项的滑动状态
			resetAllSwipe(excludeIndex = -1) {
				this.dietHistory.forEach((item, index) => {
					if (index !== excludeIndex) {
						item.translateX = 0
					}
				})
				if (excludeIndex === -1) {
					this.currentSwipeIndex = -1
				}
			},
			
			// 确认删除饮食记录
			confirmDeleteDietRecord(item, index) {
				uni.showModal({
					title: '确认删除',
					content: `确定要删除这条饮食记录吗？\n${item.foodName}`,
					success: (res) => {
						if (res.confirm) {
							this.deleteDietRecord(index)
						} else {
							// 取消删除，回弹
							this.dietHistory[index].translateX = 0
						}
					}
				})
			},
			
			// 删除饮食记录
			async deleteDietRecord(index) {
				const item = this.dietHistory[index]
				
				try {
					// 如果有记录ID，调用API删除
					if (item.id) {
						const result = await deleteHealthRecord(item.id)
						if (result.code !== 200) {
							showToast(result.message || '删除失败')
							return
						}
					}
					
					// 从本地数组中删除
					this.dietHistory.splice(index, 1)
					
					// 重置所有项的滑动状态
					this.resetAllSwipe()
					
					showToast('删除成功', 'success')
					
					// 重新加载数据以确保同步
					await this.loadDietHistory()
				} catch (error) {
					console.error('删除饮食记录失败:', error)
					showToast('删除失败，请重试')
				}
			},
			
			// 保存饮食记录
			async saveDiet() {
				// 检查登录状态
				if (!store.isLogin()) {
					uni.showModal({
						title: '提示',
						content: '请先登录',
						success: (res) => {
							if (res.confirm) {
								uni.reLaunch({
									url: '/pages/login/login'
								})
							}
						}
					})
					return
				}
				
				// 验证必填字段
				if (this.dietData.foods.length === 0) {
					showToast('请至少添加一种食物')
					return
				}
				if (!this.dietData.mealTime) {
					showToast('请选择用餐时间')
					return
				}
				
				try {
					this.loading = true
					
					// 为每种食物创建一条记录
					const savePromises = this.dietData.foods.map(food => {
						const recordData = {
							type: 'diet',
							mealType: this.dietData.mealType,
							foodName: food.foodName,
							foodWeight: food.foodWeight,
							calories: food.calories,
							mealTime: this.dietData.mealTime,
							recordDate: this.currentDate,
							notes: `${this.getMealTypeText(this.dietData.mealType)}记录`
						}
						return createHealthRecord(recordData)
					})
					
					const results = await Promise.all(savePromises)
					
					// 检查是否所有记录都保存成功
					const allSuccess = results.every(result => result.code === 200)
					
					if (allSuccess) {
						showToast(`成功保存${this.dietData.foods.length}种食物记录`, 'success')
						
						// 重新加载历史记录
						await this.loadDietHistory()
						
						// 清空输入
						this.dietData.foods = []
						this.currentFood = {
							foodName: '',
							foodWeight: '',
							calories: ''
						}
						// 重新设置默认时间
						this.setDefaultMealTime()
					} else {
						showToast('部分记录保存失败，请重试')
					}
				} catch (error) {
					console.error('保存饮食记录失败:', error)
					showToast('保存失败，请重试')
				} finally {
					this.loading = false
				}
			},
			
			// 加载饮食历史记录
			async loadDietHistory() {
				// 检查登录状态
				if (!store.isLogin()) {
					return
				}
				
				try {
					const result = await getHealthRecords({ 
						type: 'diet', 
						limit: 20, 
						orderBy: 'createTime', 
						order: 'desc' 
					})
					
					if (result.code === 200) {
					const records = result.data || []
					this.dietHistory = records.map(record => {
						const item = {
							id: record._id || record.id,
							date: record.recordDate,
							mealType: record.mealType,
							foodName: record.foodName,
							foodWeight: record.foodWeight,
							calories: record.calories,
							mealTime: record.mealTime,
							translateX: 0
						}
						return item
					})
				}
				} catch (error) {
					console.error('加载饮食历史失败:', error)
					if (error.message && error.message.includes('未登录')) {
						uni.reLaunch({
							url: '/pages/login/login'
						})
					}
				}
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

	/* 记录卡片样式 */
	.record-card {
		background-color: #ffffff;
		border-radius: 20rpx;
		padding: 30rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 30rpx;
		padding-bottom: 20rpx;
		border-bottom: 2rpx solid #F0F0F0;
	}

	.card-title {
		font-size: 36rpx;
		font-weight: 600;
		color: #333333;
	}

	.card-date {
		font-size: 28rpx;
		color: #666666;
	}

	/* 体重输入样式 */
	.weight-input {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 40rpx 0;
	}

	.weight-number {
		font-size: 80rpx;
		font-weight: 600;
		color: #2E86AB;
		text-align: center;
		border: none;
		outline: none;
		min-width: 200rpx;
		line-height: 1.2;
		padding: 10rpx 0;
		height: auto;
	}

	.weight-unit {
		font-size: 40rpx;
		color: #666666;
		margin-left: 20rpx;
	}

	/* BMI显示样式 */
	.bmi-display {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 30rpx 0;
		padding: 20rpx;
		background-color: #F8F9FA;
		border-radius: 16rpx;
	}

	.bmi-label {
		font-size: 28rpx;
		color: #666666;
		margin-right: 10rpx;
	}

	.bmi-value {
		font-size: 32rpx;
		font-weight: 600;
		margin-right: 10rpx;
	}

	.bmi-status {
		font-size: 28rpx;
		font-weight: 600;
	}

	.normal { color: #28a745; }
	.underweight { color: #17a2b8; }
	.overweight { color: #ffc107; }
	.obese { color: #dc3545; }

	/* 目标体重显示样式 */
	.target-display {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 20rpx 0;
		padding: 20rpx;
		background-color: #F0F8FF;
		border-radius: 16rpx;
		border: 2rpx solid #E3F2FD;
	}

	.target-label, .diff-label {
		font-size: 28rpx;
		color: #666666;
		margin-right: 10rpx;
	}

	.target-value {
		font-size: 32rpx;
		font-weight: 600;
		color: #2E86AB;
		margin-right: 20rpx;
	}

	.diff-value {
		font-size: 32rpx;
		font-weight: 600;
	}

	.over-target {
		color: #dc3545;
	}

	.under-target {
		color: #28a745;
	}



	/* 历史记录样式 */
	.history-section {
		margin-top: 30rpx;
	}

	.section-title {
		margin-bottom: 20rpx;
	}

	.title-text {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.history-list {
		background-color: #ffffff;
		border-radius: 20rpx;
		overflow: hidden;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}

	.history-item {
		display: flex;
		align-items: center;
		padding: 25rpx 30rpx;
		border-bottom: 1rpx solid #F0F0F0;
	}

	.history-item:last-child {
		border-bottom: none;
	}

	.history-date {
		width: 200rpx;
	}

	.date-text {
		font-size: 28rpx;
		color: #666666;
	}

	.history-weight {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.weight-text {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.change-text {
		font-size: 28rpx;
		font-weight: 600;
	}

	.increase { color: #dc3545; }
	.decrease { color: #28a745; }

	/* 操作按钮样式 */
	.record-actions {
		margin-top: 40rpx;
		text-align: center;
	}

	.save-btn {
		width: 100%;
		padding: 25rpx;
		background: linear-gradient(135deg, #2E86AB 0%, #A8DADC 100%);
		color: #ffffff;
		font-size: 32rpx;
		font-weight: 600;
		border: none;
		border-radius: 16rpx;
		box-shadow: 0 4rpx 15rpx rgba(46, 134, 171, 0.3);
	}

	.save-btn:active {
		transform: scale(0.98);
	}
	
	/* Tab切换样式 */
	.tab-container {
		display: flex;
		background-color: #ffffff;
		border-radius: 20rpx;
		margin-bottom: 30rpx;
		padding: 10rpx;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
	}
	
	.tab-item {
		flex: 1;
		padding: 20rpx;
		text-align: center;
		border-radius: 16rpx;
		transition: all 0.3s ease;
	}
	
	.tab-item.active {
		background: linear-gradient(135deg, #2E86AB 0%, #A8DADC 100%);
		box-shadow: 0 4rpx 15rpx rgba(46, 134, 171, 0.3);
	}
	
	.tab-text {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8rpx;
		font-size: 28rpx;
		font-weight: 600;
		color: #666666;
		transition: color 0.3s ease;
	}
	
	.tab-item.active .tab-text {
		color: #ffffff;
	}
	
	/* 餐次选择样式 */
	.meal-type-selector {
		margin: 30rpx 0;
	}
	
	.meal-type-label {
		font-size: 28rpx;
		color: #333333;
		font-weight: 600;
		margin-bottom: 20rpx;
	}
	
	.meal-type-options {
		display: flex;
		flex-wrap: wrap;
		gap: 15rpx;
	}
	
	.meal-option {
		padding: 15rpx 25rpx;
		border: 2rpx solid #E0E0E0;
		border-radius: 25rpx;
		background-color: #F8F9FA;
		transition: all 0.3s ease;
	}
	
	.meal-option.active {
		border-color: #2E86AB;
		background-color: #E3F2FD;
	}
	
	.meal-text {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8rpx;
		font-size: 26rpx;
		color: #666666;
		font-weight: 500;
	}
	
	.meal-option.active .meal-text {
		color: #2E86AB;
		font-weight: 600;
	}
	
	/* 食物输入区域样式 */
	.food-input-section {
		margin: 30rpx 0;
	}
	
	.input-group {
		margin-bottom: 25rpx;
	}
	
	.input-label {
		font-size: 28rpx;
		color: #333333;
		font-weight: 600;
		margin-bottom: 10rpx;
		display: block;
	}
	
	.food-input {
		width: 100%;
		height: 80rpx;
		padding: 0 20rpx;
		border: 2rpx solid #E0E0E0;
		border-radius: 12rpx;
		font-size: 28rpx;
		color: #333333;
		background-color: #F8F9FA;
		box-sizing: border-box;
		line-height: 80rpx;
		text-align: left;
		vertical-align: top;
	}
	
	.food-input::placeholder {
		color: #999999;
		font-size: 28rpx;
		line-height: 80rpx;
		vertical-align: top;
		text-align: left;
	}
	
	.food-input:focus {
		border-color: #2E86AB;
		background-color: #ffffff;
	}
	
	.input-with-unit {
		display: flex;
		align-items: center;
		gap: 10rpx;
	}
	
	.input-with-unit .food-input {
		flex: 1;
	}
	
	.input-unit {
		font-size: 28rpx;
		color: #666666;
		font-weight: 600;
	}
	
	/* 时间选择器样式 */
	.time-picker {
		width: 100%;
	}
	
	.time-display {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20rpx;
		border: 2rpx solid #E0E0E0;
		border-radius: 12rpx;
		background-color: #F8F9FA;
	}
	
	.time-text {
		font-size: 28rpx;
		color: #333333;
	}
	
	.time-icon {
		font-size: 24rpx;
	}
	
	/* 饮食历史记录样式 */
	.diet-history-wrapper {
		position: relative;
		overflow: hidden;
		border-bottom: 1rpx solid #F0F0F0;
	}
	
	.diet-history-wrapper:last-child {
		border-bottom: none;
	}
	
	.diet-history-item {
		padding: 25rpx 30rpx;
		background-color: #ffffff;
		width: 100%;
		box-sizing: border-box;
		position: relative;
		z-index: 2;
		transition: transform 0.3s ease;
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
	
	.delete-action:active {
		background-color: #ff3742;
	}
	
	.delete-text {
		color: #ffffff;
		font-size: 28rpx;
		font-weight: 600;
	}
	
	.diet-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10rpx;
	}
	
	.diet-date {
		display: flex;
		align-items: center;
		gap: 15rpx;
	}
	
	.meal-type-text {
		font-size: 24rpx;
		color: #2E86AB;
		background-color: #E3F2FD;
		padding: 4rpx 12rpx;
		border-radius: 12rpx;
		font-weight: 600;
	}
	
	.diet-time .time-text {
		font-size: 24rpx;
		color: #999999;
	}
	
	.diet-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 50rpx;
		padding: 5rpx 0;
	}
	
	.food-name {
		font-size: 30rpx;
		font-weight: 600;
		color: #333333;
		line-height: 1.4;
		word-wrap: break-word;
		overflow: visible;
		flex: 1;
		margin-right: 15rpx;
	}
	
	.food-details {
		display: flex;
		align-items: center;
		gap: 15rpx;
		flex-shrink: 0;
	}
	
	.food-weight {
		font-size: 26rpx;
		color: #666666;
		line-height: 1.2;
		white-space: nowrap;
		padding: 2rpx 8rpx;
		background-color: #F0F8FF;
		border-radius: 8rpx;
	}
	
	.food-calories {
		font-size: 26rpx;
		color: #FF6B6B;
		font-weight: 600;
		line-height: 1.2;
		white-space: nowrap;
		padding: 2rpx 8rpx;
		background-color: #FFF5F5;
		border-radius: 8rpx;
	}
	
	/* AI计算按钮样式 */
	.ai-calc-btn {
		padding: 15rpx 20rpx;
		background: linear-gradient(135deg, #FF6B6B 0%, #FFE66D 100%);
		color: #ffffff;
		font-size: 24rpx;
		font-weight: 600;
		border: none;
		border-radius: 20rpx;
		box-shadow: 0 2rpx 10rpx rgba(255, 107, 107, 0.3);
		transition: all 0.3s ease;
		min-width: 120rpx;
	}
	
	.ai-calc-btn:active {
		transform: scale(0.95);
	}
	
	.ai-calc-btn:disabled {
		opacity: 0.6;
		transform: none;
	}
	
	.ai-btn-text {
		font-size: 22rpx;
		color: #ffffff;
		font-weight: 600;
	}
	
	/* 已添加食物列表样式 */
	.added-foods-section {
		margin: 30rpx 0;
	}
	
	.food-list {
		background-color: #ffffff;
		border-radius: 20rpx;
		overflow: hidden;
		box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.05);
		margin-bottom: 20rpx;
	}
	
	.food-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20rpx 25rpx;
		border-bottom: 1rpx solid #F0F0F0;
		transition: background-color 0.3s ease;
	}
	
	.food-item:last-child {
		border-bottom: none;
	}
	
	.food-item:active {
		background-color: #F8F9FA;
	}
	
	.food-info {
		flex: 1;
		min-height: 60rpx;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	
	.food-info .food-name {
		font-size: 28rpx;
		font-weight: 600;
		color: #333333;
		margin-bottom: 8rpx;
		line-height: 1.4;
		word-wrap: break-word;
		overflow: visible;
	}
	
	.food-info .food-details {
		display: flex;
		align-items: center;
		gap: 20rpx;
		min-height: 32rpx;
	}
	
	.food-info .food-weight {
		font-size: 24rpx;
		color: #666666;
		background-color: #F0F8FF;
		padding: 6rpx 12rpx;
		border-radius: 12rpx;
		line-height: 1.2;
		white-space: nowrap;
	}
	
	.food-info .food-calories {
		font-size: 24rpx;
		color: #FF6B6B;
		font-weight: 600;
		background-color: #FFF5F5;
		padding: 6rpx 12rpx;
		border-radius: 12rpx;
		line-height: 1.2;
		white-space: nowrap;
	}
	
	.remove-food-btn {
		padding: 10rpx;
		background-color: transparent;
		border: none;
		border-radius: 50%;
		transition: all 0.3s ease;
	}
	
	.remove-food-btn:active {
		transform: scale(0.9);
		background-color: #FFE6E6;
	}
	
	.remove-text {
		font-size: 20rpx;
	}
	
	/* 总卡路里显示样式 */
	.total-calories {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20rpx;
		background: linear-gradient(135deg, #FFE66D 0%, #FF6B6B 100%);
		border-radius: 16rpx;
		box-shadow: 0 4rpx 15rpx rgba(255, 107, 107, 0.2);
	}
	
	.total-label {
		font-size: 28rpx;
		color: #ffffff;
		font-weight: 600;
		margin-right: 10rpx;
	}
	
	.total-value {
		font-size: 32rpx;
		color: #ffffff;
		font-weight: 700;
	}
	
	/* 添加食物按钮样式 */
	.add-food-actions {
		margin-top: 25rpx;
		text-align: center;
	}
	
	.add-food-btn {
		width: 100%;
		padding: 20rpx;
		background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
		color: #ffffff;
		font-size: 28rpx;
		font-weight: 600;
		border: none;
		border-radius: 16rpx;
		box-shadow: 0 4rpx 15rpx rgba(40, 167, 69, 0.3);
		transition: all 0.3s ease;
	}
	
	.add-food-btn:active {
		transform: scale(0.98);
	}
</style>

<style lang="scss">
	.container {
		box-sizing: border-box;
		min-height: 100vh;
		padding: 24rpx 24rpx 160rpx;
		background: linear-gradient(180deg, #eaf8fd 0, #f5fafc 250rpx, #f3f7f9 100%);
		color: #193b4e;
	}

	.container view,
	.container text,
	.container input,
	.container button {
		box-sizing: border-box;
	}

	.tab-container {
		display: flex;
		gap: 8rpx;
		margin-bottom: 22rpx;
		padding: 8rpx;
		border: 1rpx solid rgba(35, 115, 149, 0.08);
		border-radius: 22rpx;
		background: rgba(255, 255, 255, 0.92);
		box-shadow: 0 8rpx 24rpx rgba(25, 81, 106, 0.06);
	}

	.tab-container .tab-item {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 88rpx;
		padding: 0 16rpx;
		border-radius: 17rpx;
		background: transparent;
	}

	.tab-container .tab-item.active {
		background: #e8f7fc;
		box-shadow: inset 0 0 0 1rpx rgba(23, 147, 190, 0.08);
	}

	.tab-container .tab-text {
		font-size: 26rpx;
		font-weight: 600;
		color: #748995;
	}

	.tab-container .tab-item.active .tab-text {
		color: #168fb9;
	}

	.record-card,
	.history-list,
	.added-foods-section,
	.food-input-section {
		border: 1rpx solid rgba(35, 115, 149, 0.07);
		border-radius: 24rpx;
		background: #ffffff;
		box-shadow: 0 10rpx 30rpx rgba(25, 81, 106, 0.065);
	}

	.record-card {
		padding: 28rpx;
		margin-bottom: 30rpx;
	}

	.card-header {
		padding-bottom: 20rpx;
		margin-bottom: 22rpx;
		border-bottom: 1rpx solid #eaf1f4;
	}

	.card-title,
	.title-text {
		display: flex;
		align-items: center;
		gap: 8rpx;
		font-size: 30rpx;
		font-weight: 700;
		color: #193b4e;
	}

	.card-date {
		padding: 6rpx 12rpx;
		border-radius: 13rpx;
		background: #f0f8fb;
		font-size: 21rpx;
		color: #718995;
	}

	.weight-input {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		height: 170rpx;
		margin: 0 0 20rpx;
		padding: 24rpx 30rpx 28rpx;
		border: 0;
		border-radius: 22rpx;
		background: linear-gradient(135deg, #edf9fd, #f8fcfd);
	}

	.weight-number {
		flex: 0 1 360rpx;
		width: 360rpx;
		min-width: 0;
		max-width: calc(100% - 70rpx);
		height: 104rpx;
		border: 0;
		border-bottom: 3rpx solid #88cada;
		border-radius: 0;
		background: transparent;
		font-size: 70rpx;
		line-height: 104rpx;
		font-weight: 700;
		text-align: center;
		color: #168fb9;
	}

	.weight-unit {
		margin: 0 0 18rpx 12rpx;
		font-size: 24rpx;
		font-weight: 600;
		color: #496776;
	}

	.bmi-display,
	.target-display {
		min-height: 66rpx;
		padding: 14rpx 18rpx;
		border: 0;
		border-radius: 16rpx;
		background: #f4fafc;
	}

	.bmi-label,
	.target-label,
	.diff-label {
		font-size: 23rpx;
		color: #748a96;
	}

	.bmi-value,
	.bmi-status,
	.target-value,
	.diff-value {
		font-size: 24rpx;
		font-weight: 650;
	}

	.record-actions {
		margin-top: 24rpx;
	}

	.save-btn,
	.add-food-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 88rpx;
		border: 0;
		border-radius: 22rpx;
		background: linear-gradient(102deg, #188eb8 0%, #20a5ca 100%);
		box-shadow: 0 10rpx 22rpx rgba(22, 143, 184, 0.2);
		font-size: 28rpx;
		font-weight: 700;
		color: #ffffff;
	}

	.save-btn::after,
	.add-food-btn::after,
	.ai-calc-btn::after,
	.remove-food-btn::after {
		border: 0;
	}

	.history-section {
		margin-top: 28rpx;
	}

	.section-title {
		display: flex;
		align-items: center;
		min-height: 48rpx;
		margin-bottom: 14rpx;
		padding: 0 8rpx;
	}

	.history-list {
		overflow: hidden;
		padding: 0 24rpx;
	}

	.history-item {
		min-height: 102rpx;
		padding: 18rpx 0;
		border-bottom: 1rpx solid #eaf1f4;
	}

	.date-text,
	.weight-text,
	.food-name {
		color: #294b5e;
	}

	.weight-text {
		font-size: 30rpx;
		font-weight: 700;
	}

	.meal-type-selector {
		margin-bottom: 24rpx;
	}

	.meal-type-label,
	.input-label {
		font-size: 24rpx;
		font-weight: 600;
		color: #345465;
	}

	.meal-type-options {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10rpx;
		margin-top: 14rpx;
	}

	.meal-option {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 88rpx;
		padding: 0 6rpx;
		border: 1rpx solid #dfebf0;
		border-radius: 17rpx;
		background: #f8fbfc;
	}

	.meal-option.active {
		border-color: #8ed1e3;
		background: #e9f8fc;
	}

	.meal-text,
	.meal-option.active .meal-text {
		font-size: 22rpx;
		font-weight: 600;
		color: #2f5668;
	}

	.meal-option.active .meal-text {
		color: #168fb9;
	}

	.added-foods-section,
	.food-input-section {
		margin-top: 22rpx;
		padding: 24rpx;
		box-shadow: none;
		background: #f9fcfd;
	}

	.input-group {
		margin-bottom: 22rpx;
	}

	.food-input,
	.time-display {
		height: 88rpx;
		border: 1rpx solid #dce9ee;
		border-radius: 17rpx;
		background: #ffffff;
		font-size: 25rpx;
		color: #294b5d;
	}

	.food-input:focus {
		border-color: #65bed8;
		box-shadow: 0 0 0 5rpx rgba(23, 148, 188, 0.08);
	}

	.ai-calc-btn {
		min-width: 118rpx;
		height: 62rpx;
		margin-left: 10rpx;
		border: 1rpx solid #8bcfe1;
		border-radius: 16rpx;
		background: #edf9fc;
		box-shadow: none;
	}

	.ai-btn-text {
		font-size: 21rpx;
		font-weight: 650;
		color: #168fb9;
	}

	.food-list {
		border-radius: 18rpx;
		box-shadow: none;
		background: #ffffff;
	}

	.food-item,
	.diet-history-item {
		border-bottom-color: #eaf1f4;
		background: #ffffff;
	}

	.total-calories {
		border: 0;
		border-radius: 16rpx;
		background: #eaf8fc;
	}

	.total-value,
	.food-calories {
		color: #168fb9;
	}

	.diet-history-wrapper {
		border-bottom: 1rpx solid #eaf1f4;
		background: #ffffff;
	}

	.delete-action {
		background: #e86761;
	}

	.meal-type-text {
		border-radius: 12rpx;
		background: #eaf8fc;
		color: #168fb9;
	}

	.remove-food-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 88rpx;
		height: 88rpx;
		border-radius: 17rpx;
		background: #fff2ef;
	}
</style>
