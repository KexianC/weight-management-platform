<template>
	<view class="login-container">
    <view class="header-section">
      <view class="logo-container">
        <image class="logo" src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" mode="aspectFit"></image>
        <view class="brand-copy"><text class="brand-word">MedTalent</text><text class="app-name">健康数字助手</text></view>
      </view>
      <text class="login-title">{{ selectedRole === 'patient' ? '客户登录' : '工作人员登录' }}</text>
      <text class="app-desc">{{ selectedRole === 'patient' ? '欢迎回到你的健康管理计划' : '工作人员登录 · 请选择岗位' }}</text>
    </view>
		<!-- 登录表单区域 -->
		<view class="form-section">
			<view class="form-container">
        <view v-if="selectedRole === 'doctor'" class="staff-role-field">
          <text class="staff-role-label">工作岗位</text>
          <view class="staff-role-choices" role="radiogroup" aria-label="工作岗位"><button v-for="option in staffLoginOptions" :key="option.value" :class="{selected:staffRoleChoice===option.value,wide:option.value==='practitioner'}" role="radio" :aria-checked="staffRoleChoice===option.value" @tap="selectStaffRole({detail:{value:option.value}})">{{ option.label }}</button></view>
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
						<text class="field-label">手机号</text><view class="input-wrapper">
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
						<text class="field-label">密码</text><view class="input-wrapper">
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
						<text class="field-label">手机号</text><view class="input-wrapper">
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
						<text class="field-label">验证码</text><view class="input-wrapper sms-wrapper">
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
				<view class="wechat-login-section" v-if="selectedRole === 'patient'">
					<button 
						class="wechat-login-btn" 
						open-type="getPhoneNumber" @getphonenumber="handleWechatPhoneLogin" :disabled="!agreeToTerms || wechatBusy"
					>
						<view class="wechat-btn-content">
							<view class="wechat-icon">
								<Icon name="Device/phone-line.svg" size="20" color="#ffffff" />
							</view>
							<text class="wechat-btn-text">手机号快捷登录</text>
						</view>
					</button>
					<text class="wechat-tip">授权手机号用于核对已开通账号；不自动注册</text>
				</view>
				<!-- #endif -->
				
				<view v-if="selectedRole === 'patient'" class="register-section">
					<text class="register-text">账号由健康管理师建档后提供</text>
				</view>
				<!-- 从业者注册链接 -->
				<view v-if="canRegisterStaff" class="register-section">
					<text class="register-text">还没有账号？</text>
					<text class="register-link" @click="goToRegister">立即注册</text>
				</view>
			</view>
		</view>
		

        <view class="staff-entry"><view class="staff-rule"></view><button class="staff-entry-button" @click="selectRole(selectedRole === 'patient' ? 'doctor' : 'patient')">{{ selectedRole === 'patient' ? '工作人员登录' : '返回客户登录' }}</button><view class="staff-rule"></view></view>
	</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'
	import { login, sendSmsCode, wechatPhoneLogin } from '../../utils/api.js'
	import { validatePhone, showToast, setStorage } from '../../utils/common.js'
	import store from '../../store/index.js'
	import { navigateAfterLogin, isSupportedMiniRole } from '../../utils/auth-navigation.js'
import { STAFF_LOGIN_OPTIONS } from '../../utils/staff-role-model.js'
	
	export default {
		components: {
			Icon
		},
		data() {
				return {
					// 选择的角色
					selectedRole: 'patient',
          staffRoleChoice: 'practitioner', staffLoginOptions: STAFF_LOGIN_OPTIONS,
					// 登录方式
					loginType: 'password',
          wechatBusy: false,
          authAttempt: 0,
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
      staffRoleIndex() { return Math.max(0, this.staffLoginOptions.findIndex(x => x.value === this.staffRoleChoice)) },
      canRegisterStaff() { return this.selectedRole === 'doctor' && ['practitioner', 'DOCTOR', 'NUTRITIONIST'].includes(this.staffRoleChoice) },
			// 从业者登录由后端根据账号自动识别医生或营养师。
			accountRole() {
				return this.selectedRole === 'doctor' ? this.staffRoleChoice : 'patient'
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
      this.authAttempt++
			// 清除倒计时定时器
			if (this.countdownTimer) {
				clearInterval(this.countdownTimer)
			}
		},
		
		methods: {
      selectStaffRole(event) { const option = this.staffLoginOptions.find(x=>x.value===event.detail.value); if (!option) return; this.authAttempt++; this.staffRoleChoice = option.value; this.formData.password = ''; this.formData.smsCode = ''; this.agreeToTerms = false },
			// 选择角色
			selectRole(role) {
        this.authAttempt++
                this.formData.password = ''; this.formData.smsCode = ''; this.agreeToTerms = false
				this.selectedRole = role
			},
			
			// 切换登录方式
			switchLoginType(type) {
        this.authAttempt++; this.agreeToTerms = false
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
						if (!isSupportedMiniRole(user)) {
							store.logout()
							showToast('此账号请使用管理端登录')
							return
						}
						
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
						
						navigateAfterLogin(store.getUserInfo())
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
				if (this.selectedRole !== 'doctor') {
					showToast('患者账号由健管师提供')
					return
				}
				uni.navigateTo({
					url: '/pages/register/register?role=practitioner'
				})
			},
			
      async handleWechatPhoneLogin(event) {
        if (this.wechatBusy) return
        if (!this.agreeToTerms) { showToast('请先阅读并同意用户协议和隐私政策'); return }
        const phoneCode = event?.detail?.code
        if (!phoneCode) { showToast('未授权手机号，可使用密码或短信登录'); return }
        this.wechatBusy = true
        const attempt = ++this.authAttempt
        store.logout()
        try {
          const result = await wechatPhoneLogin({ phoneCode, acceptedTerms: true, consentVersion: '2026-10-13' })
          if (attempt !== this.authAttempt) return
          const { token, user, refreshToken } = result.data || {}
          if (result.code !== 200 || !token || !user || !isSupportedMiniRole(user)) throw new Error(result.message || '账号验证失败，请联系健康管理师')
          uni.setStorageSync('token', token)
          if (refreshToken) uni.setStorageSync('refreshToken', refreshToken)
          store.login(user, token)
          showToast('登录成功', 'success')
          navigateAfterLogin(store.getUserInfo())
        } catch (error) { showToast(error.message || '手机号验证暂不可用，请使用密码登录') }
        finally { this.wechatBusy = false }
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
						this.selectedRole = 'patient'
						this.rememberPassword = true
						// 迁移旧数据时立即清除曾经明文保存的密码
						uni.setStorageSync('rememberedLoginInfo', {
							phone: this.formData.phone,
							role: rememberedInfo.role || 'patient'
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


<style scoped lang="scss">
@import "./third-theme.scss";
.staff-role-field { margin:0 0 24rpx; }
.staff-role-label { display:block; margin:0 0 10rpx; font-size:27rpx; line-height:1.5; color:#355b72; }
.staff-role-value { display:flex; justify-content:space-between; align-items:center; min-height:44px; box-sizing:border-box; padding:16rpx 20rpx; background:#f4f9fc; border:1rpx solid #d7e8f0; border-radius:14rpx; font-size:27rpx; line-height:1.5; gap:12rpx; }

.staff-role-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.staff-role-choices button{min-height:44px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;margin:0;padding:8px 10px;font-size:14px;line-height:1.4;white-space:normal;border:1px solid #d7e6ee;background:#fff;color:#36576b;border-radius:10px}.staff-role-choices button.wide{grid-column:1/-1}.staff-role-choices button.selected{background:#edf8fc;border-color:#168fb5;color:#12688e;font-weight:600}
</style>
