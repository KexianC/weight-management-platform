<template>
	<view class="container">
		<view class="test-header">
			<view class="brand-lockup">
				<view class="brand-mark">
					<image class="brand-logo" src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" mode="aspectFit"></image>
				</view>
				<text class="brand-name">MedTalent健康数字助手</text>
			</view>
			<view class="test-title-row">
				<Icon name="Device/cpu-line.svg" size="24" color="$primary-color" />
				<text class="test-title">AI 卡路里计算测试</text>
			</view>
			<text class="test-subtitle">根据食物名称与重量估算能量</text>
		</view>
		
		<view class="test-form">
			<view class="input-group">
				<text class="input-label">食物名称：</text>
				<input 
					class="test-input" 
					type="text" 
					v-model="foodName"
					placeholder="例如：苹果"
				/>
			</view>
			
			<view class="input-group">
				<text class="input-label">食物重量（克）：</text>
				<input 
					class="test-input" 
					type="digit" 
					v-model="foodWeight"
					placeholder="例如：100"
				/>
			</view>
			
			<button 
				class="test-btn" 
				@click="testCalculate"
				:disabled="calculating"
			>
				{{calculating ? '计算中...' : '开始计算'}}
			</button>
		</view>
		
		<view class="result-section" v-if="result">
			<view class="result-header">
				<view class="section-title-row"><Icon name="Business/bar-chart-line.svg" size="20" color="$primary-color" /><text class="result-title">计算结果</text></view>
			</view>
			<view class="result-content">
				<text class="result-text">食物：{{result.foodName}}</text>
				<text class="result-text">重量：{{result.foodWeight}}g</text>
				<text class="result-text calories">卡路里：{{result.calories}}kcal</text>
			</view>
		</view>
		
		<view class="error-section" v-if="error">
			<view class="error-header">
				<view class="section-title-row"><Icon name="System/error-warning-line.svg" size="20" color="$error-color" /><text class="error-title">错误信息</text></view>
			</view>
			<view class="error-content">
				<text class="error-text">{{error}}</text>
			</view>
		</view>
	</view>
</template>

<script>
	import Icon from '@/components/Icon.vue'
import { calculateCaloriesWithAI } from '../../utils/api.js'
	import { showToast } from '../../utils/common.js'
	import store from '../../store/index.js'
	
	export default {
		components: {
		Icon
	},
	data() {
			return {
				foodName: '',
				foodWeight: '',
				calculating: false,
				result: null,
				error: null
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
		},
		methods: {
			async testCalculate() {
				if (!this.foodName || !this.foodWeight) {
					showToast('请输入食物名称和重量')
					return
				}
				
				this.calculating = true
				this.result = null
				this.error = null
				
				try {
					const response = await calculateCaloriesWithAI(this.foodName, this.foodWeight)
					
					if (response.code === 200) {
						this.result = response.data
						showToast('计算成功', 'success')
					} else {
						this.error = response.message || '计算失败'
						showToast(this.error)
					}
				} catch (error) {
					console.error('AI计算测试失败:', error)
					this.error = error.message || '网络错误'
					showToast(this.error)
				} finally {
					this.calculating = false
				}
			}
		}
	}
</script>

<style>
	.container {
		padding: 40rpx;
		background: linear-gradient(180deg, #e8f4f8 0%, #f7fbfd 55%, #ffffff 100%);
		min-height: 100vh;
		box-sizing: border-box;
	}
	
	.test-header {
		text-align: center;
		margin-bottom: 40rpx;
		padding: 38rpx 30rpx;
		background: rgba(255, 255, 255, 0.94);
		border: 1rpx solid rgba(46, 134, 171, 0.12);
		border-radius: 24rpx;
		box-shadow: 0 14rpx 36rpx rgba(31, 86, 109, 0.1);
	}

	.brand-lockup {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14rpx;
		margin-bottom: 26rpx;
	}

	.brand-mark {
		width: 64rpx;
		height: 64rpx;
		border-radius: 16rpx;
		background: linear-gradient(135deg, #2e86ab 0%, #7fc6d7 100%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.brand-logo {
		width: 48rpx;
		height: 48rpx;
	}

	.brand-name {
		font-size: 28rpx;
		font-weight: 700;
		letter-spacing: 3rpx;
		color: #173b4d;
	}

	.test-title-row,
	.section-title-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10rpx;
	}
	
	.test-title {
		font-size: 36rpx;
		font-weight: 700;
		color: #173b4d;
	}

	.test-subtitle {
		display: block;
		margin-top: 14rpx;
		font-size: 24rpx;
		color: #6b8390;
	}
	
	.test-form {
		background-color: #ffffff;
		border: 1rpx solid rgba(46, 134, 171, 0.1);
		border-radius: 24rpx;
		padding: 40rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 14rpx 36rpx rgba(31, 86, 109, 0.08);
	}
	
	.input-group {
		margin-bottom: 30rpx;
	}
	
	.input-label {
		font-size: 28rpx;
		color: #173b4d;
		font-weight: 600;
		margin-bottom: 10rpx;
		display: block;
	}
	
	.test-input {
		width: 100%;
		padding: 20rpx;
		border: 2rpx solid #dce8ed;
		border-radius: 12rpx;
		font-size: 28rpx;
		color: #333333;
		background-color: #f6fafc;
		box-sizing: border-box;
	}
	
	.test-input:focus {
		border-color: #2E86AB;
		background-color: #ffffff;
	}
	
	.test-btn {
		width: 100%;
		padding: 25rpx;
		background: linear-gradient(135deg, #2e86ab 0%, #246f90 100%);
		color: #ffffff;
		font-size: 32rpx;
		font-weight: 600;
		border: none;
		border-radius: 16rpx;
		box-shadow: 0 10rpx 24rpx rgba(46, 134, 171, 0.26);
		transition: all 0.3s ease;
	}
	
	.test-btn:active {
		transform: scale(0.98);
	}
	
	.test-btn:disabled {
		opacity: 0.6;
		transform: none;
	}
	
	.result-section, .error-section {
		background-color: #ffffff;
		border: 1rpx solid rgba(46, 134, 171, 0.1);
		border-radius: 24rpx;
		padding: 30rpx;
		margin-bottom: 30rpx;
		box-shadow: 0 14rpx 36rpx rgba(31, 86, 109, 0.08);
	}
	
	.result-header, .error-header {
		margin-bottom: 20rpx;
		padding-bottom: 15rpx;
		border-bottom: 2rpx solid #e2edf1;
	}
	
	.result-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #173b4d;
	}
	
	.error-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #8f3d3d;
	}
	
	.result-content {
		display: flex;
		flex-direction: column;
		gap: 10rpx;
	}
	
	.result-text {
		font-size: 28rpx;
		color: #333333;
	}
	
	.result-text.calories {
		font-weight: 600;
		color: #2e86ab;
		font-size: 32rpx;
	}
	
	.error-text {
		font-size: 28rpx;
		color: #dc3545;
	}
</style>
