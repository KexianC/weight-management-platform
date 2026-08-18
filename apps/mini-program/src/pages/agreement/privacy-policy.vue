<template>
	<view class="privacy-container">
		<!-- 自定义导航栏 -->
		<view class="custom-navbar">
			<view class="navbar-content">
				<view class="navbar-left" role="button" aria-label="返回" @click="goBack">
					<Icon name="Arrows/arrow-left-line.svg" size="20" color="#ffffff" />
				</view>
				<view class="navbar-title">
					<text class="title-text">隐私政策</text>
				</view>
				<view class="navbar-right"></view>
			</view>
		</view>

		<!-- 隐私政策内容 -->
		<scroll-view class="privacy-content" scroll-y="true">
			<view class="content-wrapper">
				<!-- 政策标题 -->
				<view class="privacy-header">
					<view class="brand-lockup">
						<view class="brand-mark">
							<image class="brand-logo" src="/static/logo.png" mode="aspectFit"></image>
						</view>
						<text class="brand-name">数字减重助手</text>
					</view>
					<text class="privacy-title">数字减重助手隐私政策</text>
					<text class="update-time">更新时间：{{updateTime}}</text>
				</view>

				<!-- 政策正文 -->
				<view class="privacy-body">
					<view class="section">
						<text class="section-title">引言</text>
						<text class="section-content">
							数字减重助手（以下简称"我们"）深知个人信息对您的重要性，并会尽全力保护您的个人信息安全可靠。我们致力于维持您对我们的信任，恪守以下原则，保护您的个人信息：权责一致原则、目的明确原则、选择同意原则、最少够用原则、确保安全原则、主体参与原则、公开透明原则等。
						</text>
					</view>

					<view class="section">
						<text class="section-title">1. 我们收集的信息</text>
						<text class="section-content">
							1.1 账户信息
							• 手机号码（用于账户注册和登录）
							• 姓名（用于身份识别）
							• 性别、年龄（用于健康分析）
							• 身高（用于BMI计算）
							
							1.2 健康数据
							• 体重记录
							• 饮食记录
							• 运动数据
							• 健康目标设置
							
							1.3 使用信息
							• 应用使用记录
							• 设备信息（设备型号、操作系统版本）
							• 网络信息（IP地址、网络类型）
						</text>
					</view>

					<view class="section">
						<text class="section-title">2. 信息使用目的</text>
						<text class="section-content">
							2.1 为您提供服务
							• 账户管理和身份验证
							• 健康数据记录和分析
							• 个性化健康建议
							• 医生/营养师沟通服务
							
							2.2 改善服务质量
							• 分析用户使用习惯
							• 优化产品功能
							• 提升用户体验
							
							2.3 安全保障
							• 防范安全风险
							• 检测违规行为
							• 保护用户权益
						</text>
					</view>

					<view class="section">
						<text class="section-title">3. 信息共享与披露</text>
						<text class="section-content">
							3.1 我们不会向第三方出售、出租或以其他方式披露您的个人信息，除非：
							• 获得您的明确同意
							• 法律法规要求
							• 司法机关或行政机关要求
							• 保护我们的合法权益
							
							3.2 医生/营养师沟通
							在您同意的情况下，我们会将您的健康数据与您指定的医生/营养师共享，以便为您提供专业的健康建议和随访服务。
						</text>
					</view>

					<view class="section">
						<text class="section-title">4. 信息存储与保护</text>
						<text class="section-content">
							4.1 存储地点
							您的个人信息将存储在中华人民共和国境内的服务器上。
							
							4.2 保护措施
							• 数据加密传输和存储
							• 访问权限控制
							• 定期安全审计
							• 员工保密协议
							
							4.3 存储期限
							我们仅在为实现目的所必需的期间内保留您的个人信息。当您注销账户时，我们将删除您的个人信息，法律法规另有规定的除外。
						</text>
					</view>

					<view class="section">
						<text class="section-title">5. 您的权利</text>
						<text class="section-content">
							5.1 访问权
							您有权访问我们持有的关于您的个人信息。
							
							5.2 更正权
							如果您发现我们处理的关于您的个人信息有错误，您有权要求我们更正。
							
							5.3 删除权
							在特定情况下，您有权要求我们删除关于您的个人信息。
							
							5.4 撤回同意
							您有权随时撤回您对个人信息处理的同意。
						</text>
					</view>

					<view class="section">
						<text class="section-title">6. 未成年人保护</text>
						<text class="section-content">
							我们非常重视对未成年人个人信息的保护。如果您是18周岁以下的未成年人，建议您请您的父母或监护人仔细阅读本隐私政策，并在征得您的父母或监护人同意后使用我们的服务或向我们提供信息。
						</text>
					</view>

					<view class="section">
						<text class="section-title">7. 政策更新</text>
						<text class="section-content">
							我们可能适时修订本政策的条款，该等修订构成本政策的一部分。如该等修订造成您在本政策下权利的实质减少，我们将在修订生效前通过在主页上显著位置提示或向您发送电子邮件或以其他方式通知您。
						</text>
					</view>

					<view class="section">
						<text class="section-title">8. 联系我们</text>
						<text class="section-content">
							如果您对本隐私政策有任何疑问、意见或建议，请通过以下方式与我们联系：
							• 邮箱：medtalent@medtalent.com.cn
							• 客服热线：13456725720
							• 工作时间：周一至周五 9:00-18:00
							• 地址：杭州余杭区浙江(杭州)数字·健康产业园3幢4楼
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
				title: '隐私政策'
			})
		},
		methods: {
			// 返回上一页
			goBack() {
				uni.navigateBack()
			},
			
			// 同意政策并返回
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
	.privacy-container {
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

	/* 隐私政策内容 */
	.privacy-content {
		flex: 1;
		margin-top: calc(var(--status-bar-height, 44rpx) + 88rpx);
		margin-bottom: 120rpx;
	}

	.content-wrapper {
		padding: 40rpx 30rpx;
	}

	.privacy-header {
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

	.privacy-title {
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

	.privacy-body {
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
