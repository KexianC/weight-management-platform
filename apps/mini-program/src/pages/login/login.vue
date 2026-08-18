<template>
	<view class="login-container">
		<!-- 背景装饰 -->
		<view class="bg-decoration">
			<view class="bg-circle circle-1"></view>
			<view class="bg-circle circle-2"></view>
			<view class="bg-circle circle-3"></view>
		</view>
		
		<!-- 头部Logo区域 -->
		<view class="header-section">
			<view class="logo-container">
				<image class="logo" src="/static/logo.png" mode="aspectFit"></image>
				<text class="app-name">数字减重助手</text>
				<text class="app-desc">专业体重管理与健康随访</text>
			</view>
		</view>
		
		<!-- 登录表单区域 -->
		<view class="form-section">
			<view class="form-container">
				<!-- 角色选择 -->
				<view class="role-selector">
					<view class="role-title">选择身份</view>
					<view class="role-options">
						<view 
							class="role-option" 
							:class="{active: selectedRole === 'patient'}"
							role="radio"
							:aria-checked="selectedRole === 'patient'"
							@click="selectRole('patient')"
						>
							<view class="role-icon"><Icon name="User/user-line.svg" size="24" :color="selectedRole === 'patient' ? '$primary-color' : '$gray-500'" /></view>
							<text class="role-text">患者</text>
						</view>
						<view 
							class="role-option" 
							:class="{active: selectedRole === 'doctor'}"
							role="radio"
							:aria-checked="selectedRole === 'doctor'"
							@click="selectRole('doctor')"
						>
							<view class="role-icon"><Icon name="Health/stethoscope-line.svg" size="24" :color="selectedRole === 'doctor' ? '$primary-color' : '$gray-500'" /></view>
							<text class="role-text">医生/营养师</text>
						</view>
					</view>
				</view>
				
				<!-- 登录方式切换 -->
				<view class="login-tabs">
					<view 
						class="tab-item" 
						:class="{active: loginType === 'password'}"
						@click="switchLoginType('password')"
					>
						<text class="tab-text">密码登录</text>
					</view>
					<view 
						class="tab-item" 
						:class="{active: loginType === 'sms'}"
						@click="switchLoginType('sms')"
					>
						<text class="tab-text">短信登录</text>
					</view>
				</view>
				
				<!-- 密码登录表单 -->
				<view class="login-form" v-if="loginType === 'password'">
					<view class="form-item">
						<view class="input-wrapper">
							<view class="input-icon"><Icon name="Device/phone-line.svg" size="16" color="$gray-500" /></view>
							<input 
								class="form-input" 
								type="text" 
								placeholder="请输入手机号"
								v-model="formData.phone"
								maxlength="11"
							/>
						</view>
					</view>
					
					<view class="form-item">
						<view class="input-wrapper">
							<view class="input-icon"><Icon name="System/lock-line.svg" size="16" color="$gray-500" /></view>
							<input 
								class="form-input" 
								:type="showPassword ? 'text' : 'password'"
								placeholder="请输入密码"
								v-model="formData.password"
							/>
							<view class="password-toggle" role="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="togglePassword">
								<Icon :name="showPassword ? 'System/eye-off-line.svg' : 'System/eye-line.svg'" size="20" color="$gray-600" />
							</view>
						</view>
					</view>
				</view>
				
				<!-- 短信登录表单 -->
				<view class="login-form" v-if="loginType === 'sms'">
					<view class="form-item">
						<view class="input-wrapper">
							<view class="input-icon"><Icon name="Device/phone-line.svg" size="16" color="$gray-500" /></view>
							<input 
								class="form-input" 
								type="text" 
								placeholder="请输入手机号"
								v-model="formData.phone"
								maxlength="11"
							/>
						</view>
					</view>
					
					<view class="form-item">
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
				</view>
				
				<!-- 记住账号和忘记密码 -->
				<view class="form-options" v-if="loginType === 'password'">
					<view class="remember-password" @click="toggleRememberPassword">
						<view class="checkbox" :class="{checked: rememberPassword}">
							<Icon v-if="rememberPassword" name="System/check-line.svg" size="12" color="#ffffff" />
						</view>
						<text class="option-text">记住账号</text>
					</view>
					<view class="forgot-password" @click="forgotPassword">
						<text class="forgot-text">忘记密码？</text>
					</view>
				</view>
				
				<!-- 协议同意 -->
				<view class="agreement-section">
					<view class="agreement-checkbox" @click="toggleAgreement">
						<view class="checkbox" :class="{checked: agreeToTerms}">
							<Icon v-if="agreeToTerms" name="System/check-line.svg" size="12" color="#ffffff" />
						</view>
						<text class="agreement-text">我已阅读并同意</text>
						<text class="agreement-link" @click.stop="viewUserAgreement">《用户协议》</text>
						<text class="agreement-text">和</text>
						<text class="agreement-link" @click.stop="viewPrivacyPolicy">《隐私政策》</text>
					</view>
				</view>
				
				<!-- 登录按钮 -->
				<view class="login-actions">
					<button 
						class="login-btn" 
						:class="{disabled: !canLogin}"
						:disabled="!canLogin"
						@click="handleLogin"
					>
						<text class="btn-text">{{loginType === 'password' ? '登录' : '验证登录'}}</text>
					</button>
				</view>
				
				<!-- #ifdef MP-WEIXIN -->
				<!-- 分隔线（仅微信小程序） -->
				<view class="divider-section">
					<view class="divider-line"></view>
					<text class="divider-text">或</text>
					<view class="divider-line"></view>
				</view>
				
				<!-- 微信登录 -->
				<view class="wechat-login-section">
					<button 
						class="wechat-login-btn" 
						@click="handleWechatLogin"
					>
						<view class="wechat-btn-content">
							<view class="wechat-icon">
								<Icon name="Logos/wechat-fill.svg" size="20" color="#ffffff" />
							</view>
							<text class="wechat-btn-text">微信快速登录</text>
						</view>
					</button>
					<text class="wechat-tip">已有微信账号可直接登录；首次使用需完成手机号验证</text>
				</view>
				<!-- #endif -->
				
				<!-- 注册链接 -->
				<view class="register-section">
					<text class="register-text">还没有账号？</text>
					<text class="register-link" @click="goToRegister">立即注册</text>
				</view>
			</view>
		</view>
		

	</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'
	import { login, sendSmsCode, wechatLogin } from '../../utils/api.js'
	import { validatePhone, showToast, setStorage } from '../../utils/common.js'
	import store from '../../store/index.js'
	
	export default {
		components: {
			Icon
		},
		data() {
				return {
					// 选择的角色
					selectedRole: 'patient',
					// 登录方式
					loginType: 'password',
					// 表单数据
					formData: {
						phone: '',
						password: '',
						smsCode: ''
					},
					// 密码显示状态
					showPassword: false,
					// 记住密码
					rememberPassword: false,
					// 协议同意状态
					agreeToTerms: false,
					// 短信倒计时
					smsCountdown: 0,
					// 倒计时定时器
					countdownTimer: null
				}
			},
		
		computed: {
			// 从业者登录由后端根据账号自动识别医生或营养师。
			accountRole() {
				return this.selectedRole === 'doctor' ? 'practitioner' : 'patient'
			},

			// 是否可以发送短信
			canSendSms() {
				return validatePhone(this.formData.phone) && this.smsCountdown === 0
			},
			
			// 表单完整且已同意协议后才允许登录
			canLogin() {
				const basicValidation = this.loginType === 'password' 
					? validatePhone(this.formData.phone) && this.formData.password.length >= 6
					: validatePhone(this.formData.phone) && this.formData.smsCode.length === 6
				
				return basicValidation && this.agreeToTerms
			}
		},
		
		onLoad() {
			// 检查是否有记住的登录信息
			this.loadRememberedInfo()
		},
		
		onUnload() {
			// 清除倒计时定时器
			if (this.countdownTimer) {
				clearInterval(this.countdownTimer)
			}
		},
		
		methods: {
			// 选择角色
			selectRole(role) {
				this.selectedRole = role
			},
			
			// 切换登录方式
			switchLoginType(type) {
				this.loginType = type
				// 清空表单数据
				this.formData = {
					phone: this.formData.phone,
					password: '',
					smsCode: ''
				}
			},
			
			// 切换密码显示状态
			togglePassword() {
				this.showPassword = !this.showPassword
			},
			
			// 切换记住密码
			toggleRememberPassword() {
				this.rememberPassword = !this.rememberPassword
			},
			
			// 切换协议同意状态
			toggleAgreement() {
				this.agreeToTerms = !this.agreeToTerms
			},
			
			// 发送短信验证码
			async sendSmsCode() {
				if (!this.canSendSms) return
				
				try {
					// 通过独立后端发送短信验证码
					const result = await sendSmsCode(this.formData.phone, 'login')
					
					showToast('验证码已发送', 'success')
					
					// 开发环境显示验证码
					if (result.data && result.data.code) {
						console.log('验证码:', result.data.code)
						uni.showModal({
							title: '开发提示',
							content: `验证码: ${result.data.code}`,
							showCancel: false
						})
					}
					
					// 开始倒计时
					this.startCountdown()
				} catch (error) {
					showToast(error.message || '发送失败，请重试')
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
			
			// 处理登录
			async handleLogin() {
				// 首先检查协议同意状态
				if (!this.agreeToTerms) {
					showToast('请先阅读并同意用户协议和隐私政策')
					return
				}
				
				// 然后检查表单数据完整性
				if (!this.canLogin) {
					showToast('请填写完整的登录信息')
					return
				}
				
				try {
					// 显示加载状态
					uni.showLoading({
						title: '登录中...'
					})
					
					// 准备登录数据
					const loginData = {
						phone: this.formData.phone,
						loginType: this.loginType,
						role: this.accountRole
					}
					
					if (this.loginType === 'password') {
						loginData.password = this.formData.password
					} else {
						loginData.smsCode = this.formData.smsCode
					}
					
					// 调用独立后端登录接口
					const result = await login(loginData)
					
					uni.hideLoading()
					
					if (result.code === 200) {
						// 登录成功
						const { token, user } = result.data
						
						// 保存token
						uni.setStorageSync('token', token)
						
						// 保存到store
						store.login(user, token)
						
						// 保存记住的登录信息
						if (this.rememberPassword && this.loginType === 'password') {
							this.saveRememberedInfo()
						} else {
							// 清除记住的信息
							uni.removeStorageSync('rememberedLoginInfo')
						}
						
						showToast('登录成功', 'success')
						
						// 根据角色跳转到对应页面
						setTimeout(() => {
							if (user.role === 'doctor') {
								// 医生跳转到医生端首页
								uni.reLaunch({
									url: '/pages/doctor/index'
								})
							} else {
								// 患者跳转到患者端首页
								uni.switchTab({
									url: '/pages/patient/index'
								})
							}
						}, 1000)
					} else {
						showToast(result.message || '登录失败')
					}
				} catch (error) {
					uni.hideLoading()
					console.error('登录错误:', error)
					showToast(error.message || '登录失败，请重试')
				}
			},
			
			// 忘记密码
			forgotPassword() {
				uni.navigateTo({
					url: `/pages/forgot-password/forgot-password?role=${this.accountRole}`
				})
			},
			
			// 去注册页面
			goToRegister() {
				uni.navigateTo({
					url: '/pages/register/register'
				})
			},
			
			// 处理微信登录按钮点击
			async handleWechatLogin() {
				if (!this.agreeToTerms) {
					showToast('请先阅读并同意用户协议和隐私政策')
					return
				}
				
				try {
					// 显示加载状态
					uni.showLoading({
						title: '微信登录中...'
					})
					
					// 获取微信登录code
					const loginRes = await this.getWechatLoginCode()
					if (!loginRes.code) {
						throw new Error('获取微信授权码失败')
					}
					
					// 准备微信登录数据
					const wechatLoginData = {
						code: loginRes.code,
						role: this.accountRole
					}
					
					console.log('微信登录数据:', wechatLoginData)
					
					// 调用独立后端微信登录接口
					const result = await wechatLogin(wechatLoginData)
					
					uni.hideLoading()
					
					if (result.code === 200) {
					// 登录成功
					const { token, user, isNewUser } = result.data
					console.log('微信登录成功，用户信息:', user)
					
					// 保存token
					uni.setStorageSync('token', token)
					
					// 保存到store
					store.login(user, token)
					
					// 显示成功提示
					const message = isNewUser ? '注册并登录成功' : '登录成功'
					showToast(message, 'success')
					
					// 根据角色跳转到对应页面，增加延迟确保真机稳定性
					setTimeout(() => {
						if (user.role === 'doctor') {
							console.log('微信登录成功，跳转到医生主页')
							// 医生跳转到医生端首页
							uni.reLaunch({
								url: '/pages/doctor/index',
								success: () => {
									console.log('成功跳转到医生主页')
								},
								fail: (err) => {
									console.error('跳转到医生主页失败:', err)
								}
							})
						} else {
							console.log('微信登录成功，跳转到患者主页')
							// 患者跳转到患者端首页，使用reLaunch确保页面栈清空
							uni.reLaunch({
								url: '/pages/patient/index',
								success: () => {
									console.log('成功跳转到患者主页')
								},
								fail: (err) => {
									console.error('跳转到患者主页失败:', err)
								}
							})
						}
					}, 1500)
					} else if (result.code === 201) {
						// 需要注册，跳转到注册页面
						const { wechatInfo } = result.data
						
						// 将微信信息存储到本地，供注册页面使用
						uni.setStorageSync('wechatRegisterInfo', wechatInfo)
						
						showToast('检测到您是新用户，请完成注册', 'none')
						
						// 跳转到注册页面
						setTimeout(() => {
							uni.navigateTo({
								url: '/pages/register/register?fromWechat=true'
							})
						}, 1500)
					} else {
						showToast(result.message || '微信登录失败')
					}
				} catch (error) {
					uni.hideLoading()
					console.error('微信登录错误:', error)
					showToast(error.message || '微信登录失败，请重试')
				}
			},
			
			// 获取微信登录code
			getWechatLoginCode() {
				return new Promise((resolve, reject) => {
					uni.login({
						provider: 'weixin',
						success: (res) => {
							console.log('微信登录code获取成功:', res)
							resolve(res)
						},
						fail: (err) => {
							console.error('微信登录code获取失败:', err)
							reject(new Error('获取微信授权码失败'))
						}
					})
				})
			},
			
			// QQ登录
			qqLogin() {
				showToast('QQ登录功能开发中')
			},
			
			// 支付宝登录
			alipayLogin() {
				showToast('支付宝登录功能开发中')
			},
			
			// 查看用户协议
			viewUserAgreement() {
				uni.navigateTo({
					url: '/pages/agreement/user-agreement'
				})
			},
			
			// 查看隐私政策
			viewPrivacyPolicy() {
				uni.navigateTo({
					url: '/pages/agreement/privacy-policy'
				})
			},
			
			// 加载记住的登录信息
			loadRememberedInfo() {
				try {
					const rememberedInfo = uni.getStorageSync('rememberedLoginInfo')
					if (rememberedInfo) {
						this.formData.phone = rememberedInfo.phone || ''
						this.selectedRole = ['doctor', 'nutritionist', 'practitioner'].includes(rememberedInfo.role) ? 'doctor' : 'patient'
						this.rememberPassword = true
						// 迁移旧数据时立即清除曾经明文保存的密码
						uni.setStorageSync('rememberedLoginInfo', {
							phone: this.formData.phone,
							role: this.accountRole
						})
					}
				} catch (error) {
					console.error('加载记住的登录信息失败:', error)
				}
			},
			
			// 保存记住的登录信息
			saveRememberedInfo() {
				try {
					const rememberedInfo = {
						phone: this.formData.phone,
						role: this.accountRole
					}
					uni.setStorageSync('rememberedLoginInfo', rememberedInfo)
				} catch (error) {
					console.error('保存记住的登录信息失败:', error)
				}
			}
		}
	}
</script>

<style lang="scss">
	.login-container {
		min-height: 100vh;
		background: $medical-gradient;
		position: relative;
		overflow: hidden;
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
		top: 10%;
		left: -50rpx;
		animation-delay: 0s;
	}

	.circle-2 {
		width: 150rpx;
		height: 150rpx;
		top: 60%;
		right: -30rpx;
		animation-delay: 2s;
	}

	.circle-3 {
		width: 100rpx;
		height: 100rpx;
		top: 30%;
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

	/* 头部区域 */
	.header-section {
		padding: 60rpx 40rpx 40rpx;
		text-align: center;
	}

	.logo-container {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.logo {
		width: 100rpx;
		height: 100rpx;
		margin-bottom: 20rpx;
		border-radius: 20rpx;
	}

	.app-name {
		font-size: 42rpx;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 10rpx;
		text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.3);
	}

	.app-desc {
		font-size: 26rpx;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.4;
	}

	/* 表单区域 */
	.form-section {
		flex: 1;
		padding: 0 40rpx;
	}

	.form-container {
		background-color: #ffffff;
		border-radius: 30rpx;
		padding: 35rpx 40rpx;
		min-height: calc(100vh - 530rpx);
		box-shadow: 0 -10rpx 30rpx rgba(0, 0, 0, 0.1);
	}

	/* 角色选择 */
	.role-selector {
		margin-bottom: 25rpx;
	}

	.role-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #333333;
		margin-bottom: 20rpx;
		text-align: center;
	}

	.role-options {
		display: flex;
		gap: 30rpx;
		justify-content: center;
	}

	.role-option {
		flex: 1;
		max-width: 180rpx;
		padding: 20rpx 15rpx;
		border: 3rpx solid #E9ECEF;
		border-radius: $border-radius-lg;
		text-align: center;
		transition: all 0.3s ease;
		background-color: #ffffff;
	}

	.role-option.active {
		border-color: $primary-color;
		background-color: #F8F9FF;
		transform: scale(1.05);
		box-shadow: $shadow-md;
	}

	.role-icon {
		font-size: 40rpx;
		margin-bottom: 10rpx;
		display: block;
	}

	.role-text {
		font-size: 24rpx;
		color: #333333;
		font-weight: 500;
	}

	.role-option.active .role-text {
		color: #667eea;
		font-weight: 600;
	}

	/* 登录方式切换 */
	.login-tabs {
		display: flex;
		background-color: #F8F9FA;
		border-radius: 15rpx;
		padding: 6rpx;
		margin-bottom: 25rpx;
	}

	.tab-item {
		flex: 1;
		padding: 20rpx;
		text-align: center;
		border-radius: 10rpx;
		transition: all 0.3s ease;
	}

	.tab-item.active {
		background-color: #ffffff;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
	}

	.tab-text {
		font-size: 28rpx;
		color: #666666;
		font-weight: 500;
	}

	.tab-item.active .tab-text {
		color: #333333;
		font-weight: 600;
	}

	/* 登录表单 */
	.login-form {
		margin-bottom: 20rpx;
	}

	.form-item {
		margin-bottom: 20rpx;
	}

	.input-wrapper {
		@include input-base;
		position: relative;
		display: flex;
		align-items: center;
		height: 100rpx;
		backdrop-filter: blur(10rpx);
	}

	.input-wrapper:focus-within {
		border-color: #667eea;
		background-color: #ffffff;
		box-shadow: 0 0 0 6rpx rgba(102, 126, 234, 0.1);
	}

	.input-icon {
		font-size: 32rpx;
		margin-right: 20rpx;
		color: #666666;
	}

	.form-input {
		flex: 1;
		font-size: 28rpx;
		color: #333333;
		background-color: transparent;
		border: none;
		outline: none;
	}

	.form-input::placeholder {
		color: #999999;
	}

	.password-toggle {
		width: 88rpx;
		height: 88rpx;
		min-width: 88rpx;
		padding: 0;
		margin-left: 10rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}

	.toggle-icon {
		font-size: 28rpx;
		color: #666666;
	}

	/* 短信输入框 */
	.sms-wrapper {
		padding-right: 0;
	}

	.sms-input {
		padding-right: 20rpx;
	}

	.sms-btn {
		padding: 20rpx 30rpx;
		background-color: #667eea;
		border-radius: 12rpx;
		margin-right: 15rpx;
		transition: all 0.3s ease;
	}

	.sms-btn.disabled {
		background-color: #CCCCCC;
		pointer-events: none;
	}

	.sms-text {
		font-size: 24rpx;
		color: #ffffff;
		font-weight: 500;
		white-space: nowrap;
	}

	/* 表单选项 */
	.form-options {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 25rpx;
	}

	.remember-password {
		display: flex;
		align-items: center;
		gap: 15rpx;
	}

	.checkbox {
		width: 32rpx;
		height: 32rpx;
		border: 2rpx solid #CCCCCC;
		border-radius: 6rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
	}

	.checkbox.checked {
		background-color: #667eea;
		border-color: #667eea;
	}

	.check-icon {
		font-size: 20rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.option-text {
		font-size: 26rpx;
		color: #666666;
	}

	.forgot-password {
		padding: 10rpx;
	}

	.forgot-text {
		font-size: 26rpx;
		color: #667eea;
	}

	/* 协议同意区域 */
	.agreement-section {
		margin-bottom: 20rpx;
	}
	
	.agreement-checkbox {
		display: flex;
		align-items: center;
		gap: 15rpx;
		flex-wrap: wrap;
		line-height: 1.5;
	}
	
	.agreement-checkbox .checkbox {
		width: 32rpx;
		height: 32rpx;
		border: 2rpx solid #CCCCCC;
		border-radius: 6rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		flex-shrink: 0;
	}
	
	.agreement-checkbox .checkbox.checked {
		background-color: #667eea;
		border-color: #667eea;
	}
	
	.agreement-checkbox .agreement-text {
		font-size: 20rpx;
		color: #666666;
	}
	
	.agreement-checkbox .agreement-link {
		font-size: 20rpx;
		color: #667eea;
		text-decoration: underline;
		padding: 5rpx;
		margin: 0 5rpx;
	}
	
	/* 登录按钮 */
	.login-actions {
		margin-bottom: 20rpx;
	}

	.login-btn {
		@include btn-primary;
		width: 100%;
		height: 80rpx;
		font-size: 30rpx;
		font-weight: 600;
		margin-top: 30rpx;
	}

	.login-btn.disabled {
		background: #CCCCCC;
		box-shadow: none;
		pointer-events: none;
	}

	.login-btn:active {
		transform: scale(0.98);
	}

	.btn-text {
		font-size: 32rpx;
		color: #ffffff;
		font-weight: 600;
	}

	/* 注册区域 */
	.register-section {
		text-align: center;
		margin-bottom: 20rpx;
	}

	.register-text {
		font-size: 26rpx;
		color: #666666;
	}

	.register-link {
		font-size: 26rpx;
		color: #667eea;
		font-weight: 600;
		margin-left: 10rpx;
	}

	/* #ifdef MP-WEIXIN */
	/* 分隔线与微信登录仅用于微信小程序 */
	.divider-section {
		display: flex;
		align-items: center;
		margin: 25rpx 0;
		gap: 20rpx;
	}

	.divider-line {
		flex: 1;
		height: 2rpx;
		background-color: #E9ECEF;
	}

	.divider-text {
		font-size: 24rpx;
		color: #999999;
		flex-shrink: 0;
	}

	/* 微信登录 */
	.wechat-login-section {
		margin-bottom: 20rpx;
	}

	.wechat-login-btn {
		width: 100%;
		height: 80rpx;
		background: linear-gradient(135deg, #07C160 0%, #00A854 100%);
		border-radius: $border-radius-lg;
		border: none;
		box-shadow: 0 8rpx 20rpx rgba(7, 193, 96, 0.3);
		transition: all 0.3s ease;
		position: relative;
		overflow: hidden;
	}

	.wechat-login-btn.disabled {
		background: #CCCCCC;
		box-shadow: none;
		pointer-events: none;
	}

	.wechat-login-btn:active {
		transform: scale(0.98);
	}

	.wechat-btn-content {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		width: 100%;
		text-align: center;
		position: relative;
	}

	.wechat-icon {
		position: absolute;
		left: 30rpx;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.wechat-btn-text {
		font-size: 30rpx;
		color: #ffffff;
		font-weight: 600;
		text-align: center;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}

	.wechat-tip {
		display: block;
		text-align: center;
		font-size: 20rpx;
		color: #999999;
		margin-top: 10rpx;
		line-height: 1.4;
	}
	/* #endif */

	/* 底部协议 */
	.footer-section {
		padding: 30rpx 40rpx;
	}

	.agreement {
		text-align: center;
		line-height: 1.6;
	}

	.agreement-text {
		font-size: 22rpx;
		color: rgba(255, 255, 255, 0.7);
	}

	.agreement-link {
		font-size: 22rpx;
		color: #ffffff;
		text-decoration: underline;
	}

	/* 数字减重助手：蓝白临床视觉 */
	.login-container {
		background: linear-gradient(180deg, #236f8e 0%, #4b9fba 31%, #eaf5f9 31%, #f7fbfd 100%);
		overflow-x: hidden;
		overflow-y: auto;
	}

	.bg-decoration {
		display: none;
	}

	.header-section {
		padding: 68rpx 40rpx 36rpx;
	}

	.logo {
		width: 112rpx;
		height: 112rpx;
		margin-bottom: 16rpx;
	}

	.app-name {
		font-size: 44rpx;
		letter-spacing: 4rpx;
		text-shadow: none;
	}

	.app-desc {
		color: rgba(255, 255, 255, 0.9);
	}

	.form-section {
		padding: 0 28rpx 44rpx;
	}

	.form-container {
		min-height: auto;
		padding: 38rpx 34rpx;
		border: 1rpx solid rgba(46, 134, 171, 0.12);
		border-radius: 28rpx;
		box-shadow: 0 18rpx 48rpx rgba(31, 86, 109, 0.14);
	}

	.role-title,
	.tab-item.active .tab-text {
		color: #173b4d;
	}

	.role-option {
		border: 2rpx solid #dceaf0;
		background: #f8fbfc;
	}

	.role-option.active {
		border-color: #2e86ab;
		background: #eaf5fa;
		transform: none;
		box-shadow: 0 8rpx 20rpx rgba(46, 134, 171, 0.12);
	}

	.role-option.active .role-text,
	.forgot-text,
	.agreement-checkbox .agreement-link,
	.register-link {
		color: #2e86ab;
	}

	.login-tabs {
		background: #edf5f8;
	}

	.input-wrapper {
		background: #f7fafc;
		border-color: #dce8ed;
	}

	.input-wrapper:focus-within {
		border-color: #2e86ab;
		box-shadow: 0 0 0 6rpx rgba(46, 134, 171, 0.1);
	}

	.sms-btn,
	.checkbox.checked,
	.agreement-checkbox .checkbox.checked {
		background: #2e86ab;
		border-color: #2e86ab;
	}

	.login-btn {
		background: linear-gradient(135deg, #2e86ab 0%, #246f90 100%);
		border-radius: 16rpx;
		box-shadow: 0 10rpx 24rpx rgba(46, 134, 171, 0.26);
	}
</style>
