<template>
	<view class="agreement-container">
		<!-- 自定义导航栏 -->
		<view class="custom-navbar">
			<view class="navbar-content">
				<view class="navbar-left" role="button" aria-label="返回" @click="goBack">
					<Icon name="Arrows/arrow-left-line.svg" size="20" color="#ffffff" />
				</view>
				<view class="navbar-title">
					<text class="title-text">用户协议</text>
				</view>
				<view class="navbar-right"></view>
			</view>
		</view>

		<!-- 协议内容 -->
		<scroll-view class="agreement-content" scroll-y="true">
			<view class="content-wrapper">
				<!-- 协议标题 -->
				<view class="agreement-header">
					<view class="brand-lockup">
						<view class="brand-mark">
							<image class="brand-logo" src="/static/logo.png" mode="aspectFit"></image>
						</view>
						<text class="brand-name">数字减重助手</text>
					</view>
					<text class="agreement-title">数字减重助手用户协议</text>
					<text class="update-time">更新时间：{{updateTime}}</text>
				</view>

				<!-- 协议正文 -->
				<view class="agreement-body">
					<view class="section">
						<text class="section-title">1. 协议的接受</text>
						<text class="section-content">
							欢迎使用数字减重助手！本协议是您与我们之间关于您使用数字减重助手服务所订立的协议。请您仔细阅读本协议，您点击"同意"、"下一步"或您的注册、使用等行为或者您以其他任何明示或者默示方式表示接受本协议的，即视为您已阅读并同意本协议的约束。
						</text>
					</view>

					<view class="section">
						<text class="section-title">2. 服务内容</text>
						<text class="section-content">
							数字减重助手为用户提供以下服务：
							• 体重记录与管理
							• 饮食记录与卡路里计算
							• 健康数据分析与报告
							• 医生/营养师沟通与随访管理
							• AI智能健康建议
						</text>
					</view>

					<view class="section">
						<text class="section-title">3. 用户义务</text>
						<text class="section-content">
							3.1 您应当为自己注册账户下的一切行为负责，包括您所发表的任何内容以及由此产生的任何后果。
							
							3.2 您应当保证所提供的健康数据真实、准确、完整，不得故意提供虚假信息。
							
							3.3 您不得利用本服务进行任何违法违规活动，不得传播有害信息。
						</text>
					</view>

					<view class="section">
						<text class="section-title">4. 隐私保护</text>
						<text class="section-content">
							我们高度重视用户隐私保护，严格按照《隐私政策》的规定收集、使用、存储和保护您的个人信息。您的健康数据将采用加密技术进行保护，仅用于为您提供更好的服务。
						</text>
					</view>

					<view class="section">
						<text class="section-title">5. 免责声明</text>
						<text class="section-content">
							5.1 本应用提供的健康建议仅供参考，不能替代专业医疗诊断和治疗。
							
							5.2 我们不对因使用本服务而产生的任何直接或间接损失承担责任。
							
							5.3 如遇紧急医疗情况，请立即就医或拨打急救电话。
						</text>
					</view>

					<view class="section">
						<text class="section-title">6. 服务变更与终止</text>
						<text class="section-content">
							我们保留随时修改或中断服务的权利，恕不另行通知。我们不对任何服务中断或终止对您或第三方造成的损害承担责任。
						</text>
					</view>

					<view class="section">
						<text class="section-title">7. 协议修改</text>
						<text class="section-content">
							我们有权随时修改本协议条款。修改后的协议将在应用内公布，您继续使用服务即视为同意修改后的协议。
						</text>
					</view>

					<view class="section">
						<text class="section-title">8. 联系我们</text>
						<text class="section-content">
							如果您对本协议有任何疑问，请通过以下方式联系我们：
							• 邮箱：medtalent@medtalent.com.cn
							• 客服热线：13456725720
							• 工作时间：周一至周五 9:00-18:00
						</text>
					</view>
				</view>
			</view>
		</scroll-view>

		<!-- 底部操作按钮 -->
		<view class="footer-actions">
			<button class="agree-btn" @click="agreeAndReturn">
				<text class="btn-text">我已阅读并同意</text>
			</button>
		</view>
	</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'

	export default {
		components: {
			Icon
		},
		data() {
			return {
				updateTime: '2024-01-01'
			}
		},
		onLoad() {
			// 设置状态栏
			uni.setNavigationBarTitle({
				title: '用户协议'
			})
		},
		methods: {
			// 返回上一页
			goBack() {
				uni.navigateBack()
			},
			
			// 同意协议并返回
			agreeAndReturn() {
				uni.showToast({
					title: '已确认同意',
					icon: 'success'
				})
				
				setTimeout(() => {
					uni.navigateBack()
				}, 1000)
			}
		}
	}
</script>

<style lang="scss">
	.agreement-container {
		min-height: 100vh;
		background: linear-gradient(180deg, #e8f4f8 0%, #f7fbfd 55%, #ffffff 100%);
		display: flex;
		flex-direction: column;
	}

	/* 自定义导航栏 */
	.custom-navbar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		background: linear-gradient(135deg, #236f8e 0%, #4b9fba 100%);
		padding-top: var(--status-bar-height, 44rpx);
		box-shadow: 0 8rpx 24rpx rgba(31, 86, 109, 0.18);
	}

	.navbar-content {
		height: 88rpx;
		display: flex;
		align-items: center;
		padding: 0 30rpx;
	}

	.navbar-left {
		width: 88rpx;
		height: 88rpx;
		min-width: 88rpx;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.back-icon {
		font-size: 36rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.navbar-title {
		flex: 1;
		text-align: center;
	}

	.title-text {
		font-size: 36rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.navbar-right {
		width: 80rpx;
	}

	/* 协议内容 */
	.agreement-content {
		flex: 1;
		margin-top: calc(var(--status-bar-height, 44rpx) + 88rpx);
		margin-bottom: 120rpx;
	}

	.content-wrapper {
		padding: 40rpx 30rpx;
	}

	.agreement-header {
		text-align: center;
		margin-bottom: 50rpx;
		padding: 40rpx 30rpx;
		background-color: #ffffff;
		border: 1rpx solid rgba(46, 134, 171, 0.12);
		border-radius: 24rpx;
		box-shadow: 0 14rpx 36rpx rgba(31, 86, 109, 0.1);
	}

	.brand-lockup {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14rpx;
		margin-bottom: 24rpx;
	}

	.brand-mark {
		width: 64rpx;
		height: 64rpx;
		border-radius: 16rpx;
		background: linear-gradient(135deg, #2e86ab 0%, #7fc6d7 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8rpx 20rpx rgba(31, 86, 109, 0.16);
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

	.agreement-title {
		font-size: 42rpx;
		font-weight: 700;
		color: #2E86AB;
		display: block;
		margin-bottom: 20rpx;
	}

	.update-time {
		font-size: 26rpx;
		color: #666666;
		display: block;
	}

	.agreement-body {
		background-color: #ffffff;
		border: 1rpx solid rgba(46, 134, 171, 0.1);
		border-radius: 24rpx;
		padding: 40rpx 30rpx;
		box-shadow: 0 14rpx 36rpx rgba(31, 86, 109, 0.08);
	}

	.section {
		margin-bottom: 40rpx;
	}

	.section:last-child {
		margin-bottom: 0;
	}

	.section-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #173b4d;
		display: block;
		margin-bottom: 20rpx;
		padding-bottom: 15rpx;
		border-bottom: 2rpx solid #dceaf0;
	}

	.section-content {
		font-size: 28rpx;
		color: #496673;
		line-height: 1.8;
		display: block;
		white-space: pre-line;
	}

	/* 底部操作按钮 */
	.footer-actions {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 30rpx;
		background-color: rgba(255, 255, 255, 0.96);
		border-top: 1rpx solid rgba(46, 134, 171, 0.1);
		box-shadow: 0 -8rpx 24rpx rgba(31, 86, 109, 0.08);
	}

	.agree-btn {
		width: 100%;
		height: 88rpx;
		background: linear-gradient(135deg, #2e86ab 0%, #246f90 100%);
		color: #ffffff;
		font-size: 32rpx;
		font-weight: 600;
		border: none;
		border-radius: 16rpx;
		box-shadow: 0 10rpx 24rpx rgba(46, 134, 171, 0.26);
		transition: all 0.3s ease;
	}

	.agree-btn:active {
		transform: scale(0.98);
	}

	.btn-text {
		color: #ffffff;
		font-size: 32rpx;
		font-weight: 600;
	}
</style>
