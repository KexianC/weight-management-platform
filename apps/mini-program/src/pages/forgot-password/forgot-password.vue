<template>
	<view class="forgot-password-container">
		<!-- 自定义导航栏 -->
		<view class="custom-navbar">
			<view class="navbar-content">
				<view class="navbar-left" role="button" aria-label="返回" @click="goBack">
					<Icon name="Arrows/arrow-left-line.svg" size="20" color="$gray-600" />
				</view>
				<view class="navbar-title">
					<text class="title-text">忘记密码</text>
				</view>
				<view class="navbar-right"></view>
			</view>
		</view>

		<!-- 背景装饰 -->
		<view class="bg-decoration">
			<view class="bg-circle circle-1"></view>
			<view class="bg-circle circle-2"></view>
			<view class="bg-circle circle-3"></view>
		</view>

		<!-- 主要内容 -->
		<view class="main-content">
			<!-- 头部说明 -->
			<view class="header-section">
				<view class="brand-lockup">
					<view class="brand-mark">
						<image class="brand-logo" src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" mode="aspectFit"></image>
					</view>
					<text class="brand-name">MedTalent健康数字助手</text>
				</view>
				<view class="icon-container">
					<Icon name="System/lock-password-line.svg" size="40" color="$primary-color" />
				</view>
				<text class="page-title">重置密码</text>
				<text class="page-desc">请输入您的手机号，我们将发送验证码帮您重置密码</text>
			</view>

			<!-- 重置密码表单 -->
			<view class="form-section">
				<view class="form-container">
					<!-- 步骤指示器 -->
					<view class="step-indicator">
						<view class="step-item" :class="{active: currentStep >= 1, completed: currentStep > 1}">
							<view class="step-number">1</view>
							<text class="step-text">验证手机</text>
						</view>
						<view class="step-line" :class="{active: currentStep > 1}"></view>
						<view class="step-item" :class="{active: currentStep >= 2, completed: currentStep > 2}">
							<view class="step-number">2</view>
							<text class="step-text">设置新密码</text>
						</view>
						<view class="step-line" :class="{active: currentStep > 2}"></view>
						<view class="step-item" :class="{active: currentStep >= 3}">
							<view class="step-number">3</view>
							<text class="step-text">完成</text>
						</view>
					</view>

					<!-- 步骤1：验证手机号 -->
					<view class="step-content" v-if="currentStep === 1">
						<view class="form-item">
							<text class="form-label">重置账号身份</text>
							<view class="identity-options">
								<view class="identity-option" :class="{active: selectedRole === 'patient'}" @click="selectedRole = 'patient'">患者</view>
								<view class="identity-option" :class="{active: selectedRole === 'doctor'}" @click="selectedRole = 'doctor'">医生 / 营养师</view>
							</view>
						</view>
						<view class="form-item">
							<text class="form-label">手机号码</text>
							<view class="input-wrapper">
								<view class="input-icon"><Icon name="Device/phone-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input" 
									type="text" 
									placeholder="请输入注册时的手机号"
									v-model="formData.phone"
									maxlength="11"
								/>
							</view>
						</view>

						<view class="form-item">
							<text class="form-label">验证码</text>
							<view class="input-wrapper sms-wrapper">
								<view class="input-icon"><Icon name="Business/mail-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input sms-input" 
									type="number" 
									placeholder="请输入验证码"
									v-model="formData.smsCode"
									maxlength="6"
								/>
								<view 
									class="sms-btn" 
									:class="{disabled: smsCountdown > 0 || !canSendSms}"
									@click="sendSmsCode"
								>
									<text class="sms-text">
										{{smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码'}}
									</text>
								</view>
							</view>
						</view>

						<view class="form-actions">
							<button 
								class="next-btn" 
								:class="{disabled: !canVerifyPhone}"
								:disabled="!canVerifyPhone"
								@click="verifyPhone"
							>
								<text class="btn-text">验证手机号</text>
							</button>
						</view>
					</view>

					<!-- 步骤2：设置新密码 -->
					<view class="step-content" v-if="currentStep === 2">
						<view class="form-item">
							<text class="form-label">新密码</text>
							<view class="input-wrapper">
								<view class="input-icon"><Icon name="System/lock-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input" 
									:type="showNewPassword ? 'text' : 'password'"
									placeholder="请输入新密码（8-20位）"
									v-model="formData.newPassword"
									maxlength="20"
								/>
								<view class="password-toggle" role="button" :aria-label="showNewPassword ? '隐藏新密码' : '显示新密码'" @click="toggleNewPassword">
									<Icon :name="showNewPassword ? 'System/eye-off-line.svg' : 'System/eye-line.svg'" size="20" color="$gray-600" />
								</view>
							</view>
						</view>

						<view class="form-item">
							<text class="form-label">确认密码</text>
							<view class="input-wrapper">
								<view class="input-icon"><Icon name="System/lock-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input" 
									:type="showConfirmPassword ? 'text' : 'password'"
									placeholder="请再次输入新密码"
									v-model="formData.confirmPassword"
									maxlength="20"
								/>
								<view class="password-toggle" role="button" :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'" @click="toggleConfirmPassword">
									<Icon :name="showConfirmPassword ? 'System/eye-off-line.svg' : 'System/eye-line.svg'" size="20" color="$gray-600" />
								</view>
							</view>
						</view>

						<!-- 密码强度提示 -->
						<view class="password-strength" v-if="formData.newPassword">
							<text class="strength-label">密码强度：</text>
							<view class="strength-bar">
								<view class="strength-item" :class="{active: passwordStrength >= 1}"></view>
								<view class="strength-item" :class="{active: passwordStrength >= 2}"></view>
								<view class="strength-item" :class="{active: passwordStrength >= 3}"></view>
							</view>
							<text class="strength-text" :class="strengthClass">{{strengthText}}</text>
						</view>

						<view class="form-actions">
							<button 
								class="next-btn" 
								:class="{disabled: !canSetPassword}"
								:disabled="!canSetPassword"
								@click="setNewPassword"
							>
								<text class="btn-text">设置新密码</text>
							</button>
						</view>
					</view>

					<!-- 步骤3：完成 -->
					<view class="step-content" v-if="currentStep === 3">
						<view class="success-content">
							<view class="success-icon">
								<Icon name="System/checkbox-circle-line.svg" size="64" color="$success-color" />
							</view>
							<text class="success-title">密码重置成功</text>
							<text class="success-desc">您的密码已成功重置，请使用新密码登录</text>
						</view>

						<view class="form-actions">
							<button class="login-btn" @click="goToLogin">
								<text class="btn-text">立即登录</text>
							</button>
						</view>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'
	import { sendSmsCode, verifySmsCode, resetPassword } from '../../utils/api.js'
	import { validatePhone, validatePassword, showToast } from '../../utils/common.js'

	export default {
		components: {
			Icon
		},
		data() {
			return {
				// 当前步骤
				currentStep: 1,
				selectedRole: 'patient',
				// 表单数据
				formData: {
					phone: '',
					smsCode: '',
					newPassword: '',
					confirmPassword: ''
				},
				// 密码显示状态
				showNewPassword: false,
				showConfirmPassword: false,
				// 短信倒计时
				smsCountdown: 0,
				// 倒计时定时器
				countdownTimer: null
			}
		},
		computed: {
			accountRole() {
				return this.selectedRole === 'doctor' ? 'practitioner' : 'patient'
			},

			// 是否可以发送短信
			canSendSms() {
				return validatePhone(this.formData.phone) && this.smsCountdown === 0
			},
			
			// 是否可以验证手机号
			canVerifyPhone() {
				return validatePhone(this.formData.phone) && this.formData.smsCode.length === 6
			},
			
			// 是否可以设置密码
			canSetPassword() {
				return this.formData.newPassword.length >= 6 && 
					   this.formData.newPassword === this.formData.confirmPassword
			},
			
			// 密码强度
			passwordStrength() {
				const password = this.formData.newPassword
				if (!password) return 0
				
				let strength = 0
				// 长度检查
				if (password.length >= 8) strength++
				// 包含数字和字母
				if (/(?=.*[0-9])(?=.*[a-zA-Z])/.test(password)) strength++
				// 包含特殊字符
				if (/[^a-zA-Z0-9]/.test(password)) strength++
				
				return strength
			},
			
			// 密码强度文本
			strengthText() {
				switch (this.passwordStrength) {
					case 1: return '弱'
					case 2: return '中'
					case 3: return '强'
					default: return '弱'
				}
			},
			
			// 密码强度样式类
			strengthClass() {
				switch (this.passwordStrength) {
					case 1: return 'weak'
					case 2: return 'medium'
					case 3: return 'strong'
					default: return 'weak'
				}
			}
		},
		onLoad(options = {}) {
			if (options.role === 'doctor' || options.role === 'nutritionist' || options.role === 'practitioner') {
				this.selectedRole = 'doctor'
			}
			// 设置状态栏
			uni.setNavigationBarTitle({
				title: '忘记密码'
			})
		},
		onUnload() {
			// 清除定时器
			if (this.countdownTimer) {
				clearInterval(this.countdownTimer)
			}
		},
		methods: {
			// 返回上一页
			goBack() {
				uni.navigateBack()
			},
			
			// 发送短信验证码
			async sendSmsCode() {
				if (!this.canSendSms) return
				
				try {
					showToast('发送中...', 'loading')
					
					const result = await sendSmsCode({
						phone: this.formData.phone,
						type: 'reset_password'
					})
					
					if (result.code === 200) {
						showToast('验证码已发送', 'success')
						this.startCountdown()
					} else {
						showToast(result.message || '发送失败')
					}
				} catch (error) {
					console.error('发送验证码失败:', error)
					showToast('发送失败，请重试')
				}
			},
			
			// 开始倒计时
			startCountdown() {
				this.smsCountdown = 60
				this.countdownTimer = setInterval(() => {
					this.smsCountdown--
					if (this.smsCountdown <= 0) {
						clearInterval(this.countdownTimer)
						this.countdownTimer = null
					}
				}, 1000)
			},
			
			// 验证手机号
			async verifyPhone() {
				if (!this.canVerifyPhone) return
				
				try {
					showToast('验证中...', 'loading')
					
					await verifySmsCode(this.formData.phone, this.formData.smsCode, 'password-reset')
					
					showToast('验证成功', 'success')
					this.currentStep = 2
				} catch (error) {
					console.error('验证失败:', error)
					showToast('验证失败，请重试')
				}
			},
			
			// 设置新密码
			async setNewPassword() {
				if (!this.canSetPassword) return
				
				// 密码格式验证
				if (!validatePassword(this.formData.newPassword)) {
					showToast('密码格式不正确，请输入8-20位且包含字母和数字')
					return
				}
				
				try {
					showToast('设置中...', 'loading')
					
					const result = await resetPassword({
						phone: this.formData.phone,
						role: this.accountRole,
						smsCode: this.formData.smsCode,
						newPassword: this.formData.newPassword
					})
					
					if (result.code === 200) {
						showToast('密码重置成功', 'success')
						this.currentStep = 3
					} else {
						showToast(result.message || '重置失败')
					}
				} catch (error) {
					console.error('重置密码失败:', error)
					showToast('重置失败，请重试')
				}
			},
			
			// 切换新密码显示
			toggleNewPassword() {
				this.showNewPassword = !this.showNewPassword
			},
			
			// 切换确认密码显示
			toggleConfirmPassword() {
				this.showConfirmPassword = !this.showConfirmPassword
			},
			
			// 跳转到登录页面
			goToLogin() {
				uni.reLaunch({
					url: '/pages/login/login'
				})
			}
		}
	}
</script>

<style lang="scss">
	.forgot-password-container {
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		position: relative;
		overflow: hidden;
	}

	/* 自定义导航栏 */
	.custom-navbar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}

	.navbar-content {
		display: flex;
		align-items: center;
		height: 88rpx;
		padding: 0 30rpx;
		padding-top: var(--status-bar-height);
	}

	.navbar-left,
	.navbar-right {
		width: 88rpx;
		height: 88rpx;
		min-width: 88rpx;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.back-icon {
		font-size: 36rpx;
		color: #333333;
		font-weight: bold;
	}

	.navbar-title {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.title-text {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	/* 背景装饰 */
	.bg-decoration {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.bg-circle {
		position: absolute;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		animation: float 6s ease-in-out infinite;
	}

	.circle-1 {
		width: 200rpx;
		height: 200rpx;
		top: 15%;
		left: -50rpx;
		animation-delay: 0s;
	}

	.circle-2 {
		width: 150rpx;
		height: 150rpx;
		top: 65%;
		right: -30rpx;
		animation-delay: 2s;
	}

	.circle-3 {
		width: 100rpx;
		height: 100rpx;
		top: 35%;
		right: 20%;
		animation-delay: 4s;
	}

	@keyframes float {
		0%, 100% {
			transform: translateY(0px) rotate(0deg);
		}
		50% {
			transform: translateY(-20px) rotate(180deg);
		}
	}

	/* 主要内容 */
	.main-content {
		padding-top: calc(88rpx + var(--status-bar-height));
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	/* 头部区域 */
	.header-section {
		padding: 80rpx 40rpx 60rpx;
		text-align: center;
	}

	.icon-container {
		margin-bottom: 30rpx;
	}

	.forgot-icon {
		font-size: 120rpx;
		display: block;
	}

	.page-title {
		font-size: 48rpx;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 20rpx;
		display: block;
		text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.3);
	}

	.page-desc {
		font-size: 26rpx;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.5;
		display: block;
	}

	/* 表单区域 */
	.form-section {
		flex: 1;
		padding: 0 40rpx;
	}

	.form-container {
		background-color: #ffffff;
		border-radius: 30rpx;
		padding: 50rpx 40rpx;
		min-height: calc(100vh - 500rpx);
		box-shadow: 0 -10rpx 30rpx rgba(0, 0, 0, 0.1);
	}

	/* 步骤指示器 */
	.step-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 60rpx;
	}

	.step-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		position: relative;
	}

	.step-number {
		width: 60rpx;
		height: 60rpx;
		border-radius: 50%;
		background-color: #E9ECEF;
		color: #6C757D;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 24rpx;
		font-weight: 600;
		margin-bottom: 15rpx;
		transition: all 0.3s ease;
	}

	.step-item.active .step-number {
		background-color: #667eea;
		color: #ffffff;
	}

	.step-item.completed .step-number {
		background-color: #28a745;
		color: #ffffff;
	}

	.step-text {
		font-size: 22rpx;
		color: #6C757D;
		transition: all 0.3s ease;
	}

	.step-item.active .step-text {
		color: #667eea;
		font-weight: 600;
	}

	.step-line {
		width: 80rpx;
		height: 4rpx;
		background-color: #E9ECEF;
		margin: 0 20rpx;
		margin-bottom: 35rpx;
		transition: all 0.3s ease;
	}

	.step-line.active {
		background-color: #28a745;
	}

	/* 表单项 */
	.form-item {
		margin-bottom: 40rpx;
	}

	.identity-options {
		display: flex;
		gap: 16rpx;
	}

	.identity-option {
		flex: 1;
		padding: 20rpx 16rpx;
		border: 2rpx solid #E9ECEF;
		border-radius: 15rpx;
		text-align: center;
		font-size: 26rpx;
		color: #6C757D;
		background: #F8F9FA;
	}

	.identity-option.active {
		border-color: $primary-color;
		color: $primary-color;
		background: rgba(102, 126, 234, 0.08);
		font-weight: 600;
	}

	.form-label {
		font-size: 28rpx;
		color: #333333;
		font-weight: 600;
		margin-bottom: 20rpx;
		display: block;
	}

	.input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		background-color: #F8F9FA;
		border: 2rpx solid #E9ECEF;
		border-radius: 15rpx;
		padding: 0 30rpx;
		height: 100rpx;
		transition: all 0.3s ease;
	}

	.input-wrapper:focus-within {
		border-color: #667eea;
		background-color: #ffffff;
		box-shadow: 0 0 0 6rpx rgba(102, 126, 234, 0.1);
	}

	.input-icon {
		font-size: 32rpx;
		margin-right: 20rpx;
		color: #6C757D;
	}

	.form-input {
		flex: 1;
		font-size: 28rpx;
		color: #333333;
		background: transparent;
		border: none;
		outline: none;
	}

	.form-input::placeholder {
		color: #ADB5BD;
	}

	/* 短信验证码 */
	.sms-wrapper {
		padding-right: 20rpx;
	}

	.sms-input {
		margin-right: 20rpx;
	}

	.sms-btn {
		padding: 20rpx 30rpx;
		background-color: #667eea;
		border-radius: 10rpx;
		transition: all 0.3s ease;
	}

	.sms-btn.disabled {
		background-color: #E9ECEF;
		pointer-events: none;
	}

	.sms-text {
		font-size: 24rpx;
		color: #ffffff;
		font-weight: 500;
	}

	.sms-btn.disabled .sms-text {
		color: #6C757D;
	}

	/* 密码切换 */
	.password-toggle {
		width: 88rpx;
		height: 88rpx;
		min-width: 88rpx;
		padding: 0;
		margin-left: 20rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}

	.toggle-icon {
		font-size: 32rpx;
		color: #6C757D;
	}

	/* 密码强度 */
	.password-strength {
		display: flex;
		align-items: center;
		margin-top: 20rpx;
		padding: 0 30rpx;
	}

	.strength-label {
		font-size: 24rpx;
		color: #6C757D;
		margin-right: 20rpx;
	}

	.strength-bar {
		display: flex;
		gap: 8rpx;
		margin-right: 20rpx;
	}

	.strength-item {
		width: 40rpx;
		height: 8rpx;
		background-color: #E9ECEF;
		border-radius: 4rpx;
		transition: all 0.3s ease;
	}

	.strength-item.active {
		background-color: #28a745;
	}

	.strength-text {
		font-size: 24rpx;
		font-weight: 500;
	}

	.strength-text.weak {
		color: #dc3545;
	}

	.strength-text.medium {
		color: #ffc107;
	}

	.strength-text.strong {
		color: #28a745;
	}

	/* 按钮 */
	.form-actions {
		margin-top: 60rpx;
	}

	.next-btn,
	.login-btn {
		width: 100%;
		height: 100rpx;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 15rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		box-shadow: 0 8rpx 20rpx rgba(102, 126, 234, 0.3);
	}

	.next-btn.disabled {
		background: #E9ECEF;
		box-shadow: none;
		pointer-events: none;
	}

	.btn-text {
		font-size: 32rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.next-btn.disabled .btn-text {
		color: #6C757D;
	}

	/* 成功页面 */
	.success-content {
		text-align: center;
		padding: 80rpx 0;
	}

	.success-icon {
		margin-bottom: 40rpx;
	}

	.icon-text {
		font-size: 120rpx;
		display: block;
	}

	.success-title {
		font-size: 36rpx;
		font-weight: 700;
		color: #333333;
		margin-bottom: 20rpx;
		display: block;
	}

	.success-desc {
		font-size: 26rpx;
		color: #6C757D;
		line-height: 1.5;
		display: block;
	}

	/* MedTalent健康数字助手：蓝白临床视觉 */
	.forgot-password-container {
		background: linear-gradient(180deg, #236f8e 0%, #4b9fba 34%, #eaf5f9 34%, #f7fbfd 100%);
		overflow-x: hidden;
		overflow-y: auto;
	}

	.custom-navbar {
		background: rgba(244, 250, 252, 0.96);
		border-bottom: 1rpx solid rgba(46, 134, 171, 0.12);
		box-shadow: 0 4rpx 18rpx rgba(31, 86, 109, 0.08);
	}

	.title-text {
		color: #173b4d;
	}

	.bg-decoration {
		display: none;
	}

	.header-section {
		padding: 52rpx 40rpx 48rpx;
	}

	.brand-lockup {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14rpx;
		margin-bottom: 30rpx;
	}

	.brand-mark {
		width: 64rpx;
		height: 64rpx;
		border-radius: 16rpx;
		background: linear-gradient(135deg, #2e86ab 0%, #7fc6d7 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 8rpx 20rpx rgba(14, 62, 83, 0.18);
	}

	.brand-logo {
		width: 48rpx;
		height: 48rpx;
	}

	.brand-name {
		font-size: 30rpx;
		font-weight: 700;
		letter-spacing: 3rpx;
		color: #ffffff;
	}

	.icon-container {
		width: 112rpx;
		height: 112rpx;
		margin: 0 auto 24rpx;
		border-radius: 28rpx;
		background: rgba(255, 255, 255, 0.92);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 14rpx 32rpx rgba(19, 68, 88, 0.18);
	}

	.page-title {
		font-size: 44rpx;
		text-shadow: none;
	}

	.page-desc {
		color: rgba(255, 255, 255, 0.9);
	}

	.form-section {
		padding: 0 28rpx 44rpx;
	}

	.form-container {
		min-height: auto;
		padding: 44rpx 34rpx;
		border: 1rpx solid rgba(46, 134, 171, 0.12);
		border-radius: 28rpx;
		box-shadow: 0 18rpx 48rpx rgba(31, 86, 109, 0.14);
	}

	.step-item.active .step-number,
	.sms-btn {
		background: #2e86ab;
	}

	.step-item.active .step-text {
		color: #2e86ab;
	}

	.input-wrapper {
		background: #f7fafc;
		border-color: #dce8ed;
	}

	.input-wrapper:focus-within {
		border-color: #2e86ab;
		box-shadow: 0 0 0 6rpx rgba(46, 134, 171, 0.1);
	}

	.next-btn,
	.login-btn {
		background: linear-gradient(135deg, #2e86ab 0%, #246f90 100%);
		border-radius: 16rpx;
		box-shadow: 0 10rpx 24rpx rgba(46, 134, 171, 0.26);
	}
</style>

<style scoped>
/* Final touch target audit: layout only. */
.next-btn { min-height: 44px; height: auto; display: flex; align-items: center; justify-content: center; line-height: 1.5; padding: 10px 14px; }
</style>

<style scoped>
/* Interactive view touch targets: layout only. */
.navbar-left { min-width: 44px; min-height: 44px; flex-shrink: 0; }
</style>
