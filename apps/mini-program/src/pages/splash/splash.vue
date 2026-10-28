<template>
	<view class="splash-container">
		<!-- 背景渐变 -->
		<view class="background-gradient"></view>
		
		<!-- 主要内容 -->
		<view class="content">
			<!-- Logo 区域 -->
			<view class="logo-section">
				<image 
					class="logo" 
					src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" 
					mode="aspectFit"
					:class="{ 'logo-animate': showLogo }"
				></image>
				<view class="app-name" :class="{ 'name-animate': showName }">
					MedTalent健康数字助手
				</view>
				<view class="app-slogan" :class="{ 'slogan-animate': showSlogan }">
					专业陪伴，让健康管理更从容
				</view>
			</view>
			
			<!-- 加载动画 -->
			<view class="loading-section" :class="{ 'loading-animate': showLoading }">
				<view class="loading-dots">
					<view class="dot" :class="{ 'dot-animate': showLoading }"></view>
					<view class="dot" :class="{ 'dot-animate': showLoading }" style="animation-delay: 0.2s;"></view>
					<view class="dot" :class="{ 'dot-animate': showLoading }" style="animation-delay: 0.4s;"></view>
				</view>
				<text class="loading-text">正在加载...</text>
			</view>
		</view>
		
		<!-- 版本信息 -->
		<view class="version-info" :class="{ 'version-animate': showVersion }">
			v1.0.0
		</view>
	</view>
</template>

<script>
import store from '../../store/index.js'
import { navigateAfterLogin } from '../../utils/auth-navigation.js'

export default {
	data() {
		return {
			showLogo: false,
			showName: false,
			showSlogan: false,
			showLoading: false,
			showVersion: false
		}
	},
	onLoad() {
		this.startAnimation()
	},
	methods: {
		// 启动动画序列
		startAnimation() {
			// Logo 动画
			setTimeout(() => {
				this.showLogo = true
			}, 100)
			
			// 应用名称动画
			setTimeout(() => {
				this.showName = true
			}, 600)
			
			// 标语动画
			setTimeout(() => {
				this.showSlogan = true
			}, 1000)
			
			// 加载动画
			setTimeout(() => {
				this.showLoading = true
			}, 1400)
			
			// 版本信息动画
			setTimeout(() => {
				this.showVersion = true
			}, 1800)
			
			// 检查登录状态并跳转
			setTimeout(() => {
				this.checkLoginAndNavigate()
			}, 2600)
		},
		
		// 检查登录状态并跳转
		async checkLoginAndNavigate() {
			try {
				if (await store.checkAutoLogin()) {
					if (navigateAfterLogin(store.getUserInfo())) return
					store.logout()
				}
				this.fallbackToLogin()
			} catch (error) {
				this.fallbackToLogin()
			}
		},

		// 回退到登录页面
		fallbackToLogin() {
			console.log('执行回退到登录页面')
			setTimeout(() => {
				uni.reLaunch({
					url: '/pages/login/login',
					success: () => {
						console.log('成功跳转到登录页面')
					},
					fail: (err) => {
						console.error('跳转到登录页面失败:', err)
					}
				})
			}, 100)
		}
	}
}
</script>

<style lang="scss" scoped>
.splash-container {
	position: relative;
	width: 100vw;
	height: 100vh;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	overflow: hidden;
}

.background-gradient {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: linear-gradient(155deg, #1f6786 0%, #3589a8 48%, #79bdcf 100%);
	z-index: 1;
}

.content {
	position: relative;
	z-index: 2;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	flex: 1;
}

.logo-section {
	display: flex;
	flex-direction: column;
	align-items: center;
	margin-bottom: 80rpx;
	padding: 64rpx 56rpx 54rpx;
	border: 1rpx solid rgba(255, 255, 255, 0.18);
	border-radius: 32rpx;
	background: rgba(255, 255, 255, 0.08);
	box-shadow: 0 24rpx 64rpx rgba(18, 67, 87, 0.18);
}

.logo {
	width: 200rpx;
	height: 200rpx;
	margin-bottom: 40rpx;
	opacity: 0;
	transform: scale(0.5);
	transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.logo-animate {
	opacity: 1;
	transform: scale(1);
}

.app-name {
	font-size: 48rpx;
	font-weight: bold;
	color: #ffffff;
	margin-bottom: 20rpx;
	opacity: 0;
	transform: translateY(30rpx);
	transition: all 0.6s ease-out;
	letter-spacing: 5rpx;
}

.name-animate {
	opacity: 1;
	transform: translateY(0);
}

.app-slogan {
	font-size: 28rpx;
	color: rgba(255, 255, 255, 0.8);
	text-align: center;
	opacity: 0;
	transform: translateY(20rpx);
	transition: all 0.6s ease-out;
}

.slogan-animate {
	opacity: 1;
	transform: translateY(0);
}

.loading-section {
	display: flex;
	flex-direction: column;
	align-items: center;
	opacity: 0;
	transform: translateY(30rpx);
	transition: all 0.5s ease-out;
}

.loading-animate {
	opacity: 1;
	transform: translateY(0);
}

.loading-dots {
	display: flex;
	align-items: center;
	margin-bottom: 20rpx;
}

.dot {
	width: 12rpx;
	height: 12rpx;
	background-color: rgba(255, 255, 255, 0.8);
	border-radius: 50%;
	margin: 0 8rpx;
	opacity: 0.3;
}

.dot-animate {
	animation: dotPulse 1.5s infinite ease-in-out;
}

@keyframes dotPulse {
	0%, 80%, 100% {
		opacity: 0.3;
		transform: scale(1);
	}
	40% {
		opacity: 1;
		transform: scale(1.2);
	}
}

.loading-text {
	font-size: 24rpx;
	color: rgba(255, 255, 255, 0.7);
}

.version-info {
	position: absolute;
	bottom: 60rpx;
	left: 50%;
	transform: translateX(-50%);
	font-size: 22rpx;
	color: rgba(255, 255, 255, 0.6);
	z-index: 2;
	opacity: 0;
	transition: opacity 0.5s ease-out;
}

.version-animate {
	opacity: 1;
}

/* 响应式设计 */
@media screen and (max-width: 750rpx) {
	.logo {
		width: 160rpx;
		height: 160rpx;
	}
	
	.app-name {
		font-size: 40rpx;
	}
	
	.app-slogan {
		font-size: 24rpx;
		padding: 0 40rpx;
	}
}
</style>
