<template>
	<view class="register-container">
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
				<text class="app-desc">创建账号，开启专业健康管理</text>
			</view>
		</view>
		
		<!-- 注册表单区域 -->
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
							<text class="role-desc">记录健康数据</text>
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
							<text class="role-desc">管理患者健康</text>
						</view>
					</view>
				</view>
				
				<!-- 基础信息表单 -->
				<view class="register-form">
					<!-- 手机号 -->
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
					
					<!-- 短信验证码 -->
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
								@click="sendSmsCode"
							>
								<text class="sms-text">
									{{smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码'}}
								</text>
							</view>
						</view>
					</view>
					
					<!-- 姓名 -->
					<view class="form-item">
						<view class="input-wrapper">
							<view class="input-icon"><Icon name="User/user-line.svg" size="16" color="$gray-500" /></view>
							<input 
								class="form-input" 
								type="text" 
								:placeholder="selectedRole === 'doctor' ? '请输入姓名' : '请输入患者姓名'"
								v-model="formData.name"
							/>
						</view>
					</view>
					
					<!-- 密码（手机号注册） -->
					<view v-if="!isWechatRegister" class="form-item">
						<view class="input-wrapper">
							<view class="input-icon"><Icon name="System/lock-line.svg" size="16" color="$gray-500" /></view>
							<input 
								ref="passwordInput"
								class="form-input" 
								:type="showPassword ? 'text' : 'password'"
								placeholder="请设置密码（8-20位）"
								v-model="formData.password"
							/>
							<view class="password-toggle" role="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click.stop="togglePassword">
								<Icon :name="showPassword ? 'System/eye-off-line.svg' : 'System/eye-line.svg'" size="20" color="$gray-600" />
							</view>
						</view>
					</view>
					
					<!-- 确认密码（手机号注册） -->
					<view v-if="!isWechatRegister" class="form-item">
						<view class="input-wrapper">
							<view class="input-icon"><Icon name="System/lock-line.svg" size="16" color="$gray-500" /></view>
							<input 
								ref="confirmPasswordInput"
								class="form-input" 
								:type="showConfirmPassword ? 'text' : 'password'"
								placeholder="请确认密码"
								v-model="formData.confirmPassword"
							/>
							<view class="password-toggle" role="button" :aria-label="showConfirmPassword ? '隐藏确认密码' : '显示确认密码'" @click.stop="toggleConfirmPassword">
								<Icon :name="showConfirmPassword ? 'System/eye-off-line.svg' : 'System/eye-line.svg'" size="20" color="$gray-600" />
							</view>
						</view>
						<!-- 密码不一致提醒 -->
						<view v-if="passwordMismatchError" class="password-error">
							<text class="error-text">两次输入的密码不一致</text>
						</view>
					</view>
					
					<!-- 医生专用字段 -->
					<view v-if="selectedRole === 'doctor'" class="doctor-fields">
						<!-- 医护子角色：路由共用 doctor，注册时向后端提交真实职业 -->
						<view class="form-item">
							<view class="profession-selector">
								<text class="field-label">执业身份</text>
								<view class="profession-options">
									<view
										class="profession-option"
										:class="{active: practitionerRole === 'doctor'}"
										role="radio"
										:aria-checked="practitionerRole === 'doctor'"
										@click="selectPractitionerRole('doctor')"
									>
										<view class="profession-text"><Icon name="Health/stethoscope-line.svg" size="20" :color="practitionerRole === 'doctor' ? '$primary-color' : '$gray-500'" /><text>医生</text></view>
									</view>
									<view
										class="profession-option"
										:class="{active: practitionerRole === 'nutritionist'}"
										role="radio"
										:aria-checked="practitionerRole === 'nutritionist'"
										@click="selectPractitionerRole('nutritionist')"
									>
										<view class="profession-text"><Icon name="Food/bowl-line.svg" size="20" :color="practitionerRole === 'nutritionist' ? '$primary-color' : '$gray-500'" /><text>营养师</text></view>
									</view>
								</view>
							</view>
						</view>

						<!-- 邀请码 -->
						<view class="form-item">
							<view class="input-wrapper">
								<view class="input-icon"><Icon name="Business/award-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input" 
									type="text" 
									placeholder="请输入医生/营养师邀请码"
									v-model="formData.inviteCode"
								/>
							</view>
						</view>
						
						<!-- 科室 -->
						<view class="form-item">
							<view class="input-wrapper" @click="showDepartmentPicker">
								<view class="input-icon"><Icon name="Health/stethoscope-line.svg" size="16" color="$gray-500" /></view>
								<view class="form-input picker-input">
									<text :class="{placeholder: !formData.department}">
										{{formData.department || '请选择科室'}}
									</text>
								</view>
								<view class="picker-arrow"><Icon name="Arrows/arrow-down-s-line.svg" size="20" color="$gray-600" /></view>
							</view>
						</view>
						
						<!-- 医院 -->
						<view class="form-item">
							<view class="input-wrapper">
								<view class="input-icon"><Icon name="Buildings/hospital-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input" 
									type="text" 
									placeholder="请输入所在医院"
									v-model="formData.hospital"
								/>
							</view>
						</view>
					</view>
					
					<!-- 患者专用字段 -->
					<view v-if="selectedRole === 'patient'" class="patient-fields">
						<!-- 性别 -->
						<view class="form-item">
							<view class="gender-selector">
								<text class="field-label">性别</text>
								<view class="gender-options">
									<view 
										class="gender-option" 
										:class="{active: formData.gender === 'male'}"
										role="radio"
										:aria-checked="formData.gender === 'male'"
										@click="selectGender('male')"
									>
										<view class="gender-text"><Icon name="User/men-line.svg" size="20" :color="formData.gender === 'male' ? '$primary-color' : '$gray-500'" /><text>男</text></view>
									</view>
									<view 
										class="gender-option" 
										:class="{active: formData.gender === 'female'}"
										role="radio"
										:aria-checked="formData.gender === 'female'"
										@click="selectGender('female')"
									>
										<view class="gender-text"><Icon name="User/women-line.svg" size="20" :color="formData.gender === 'female' ? '$primary-color' : '$gray-500'" /><text>女</text></view>
									</view>
								</view>
							</view>
						</view>
						
						<!-- 年龄 -->
						<view class="form-item">
							<view class="input-wrapper">
								<view class="input-icon"><Icon name="Business/calendar-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input" 
									type="number" 
									placeholder="请输入年龄"
									v-model="formData.age"
								/>
								<text class="input-unit">岁</text>
							</view>
						</view>
						
						<!-- 身高 -->
						<view class="form-item">
							<view class="input-wrapper">
								<view class="input-icon"><Icon name="Design/ruler-line.svg" size="16" color="$gray-500" /></view>
								<input 
									class="form-input" 
									type="number" 
									placeholder="请输入身高"
									v-model="formData.height"
								/>
								<text class="input-unit">cm</text>
							</view>
						</view>
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
				
				<!-- 注册按钮 -->
				<view class="register-actions">
					<button 
						class="register-btn" 
						@click="handleRegister"
					>
						<text class="btn-text">立即注册</text>
					</button>
				</view>
				
				<!-- 登录链接 -->
				<view class="login-section">
					<text class="login-text">已有账号？</text>
					<text class="login-link" @click="goToLogin">立即登录</text>
				</view>
			</view>
		</view>
		
		<!-- 科室选择弹窗 -->
		<view class="department-modal" v-if="showDepartmentModal" @click="hideDepartmentPicker">
			<view class="modal-content" @click.stop>
				<view class="modal-header">
					<text class="modal-title">选择科室</text>
					<view class="modal-close" role="button" aria-label="关闭科室选择" @click="hideDepartmentPicker"><Icon name="System/close-line.svg" size="20" color="$gray-600" /></view>
				</view>
				<view class="department-list">
					<view 
						v-for="dept in departments" 
						:key="dept"
						class="department-item"
						@click="selectDepartment(dept)"
					>
						<text class="department-name">{{dept}}</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'
	import { register, sendSmsCode, wechatRegister, updateUserInfo } from '../../utils/api.js'
	import { validatePhone, showToast } from '../../utils/common.js'
	import store from '../../store/index.js'
	
	export default {
		components: {
			Icon
		},
		data() {
			return {
				// 选择的角色
				selectedRole: 'patient',
				// 医生与营养师共用工作台，但注册时保留真实执业身份
				practitionerRole: 'doctor',
				// 表单数据
				formData: {
					phone: '',
					smsCode: '',
					name: '',
					password: '',
					confirmPassword: '',
					// 医生字段
					inviteCode: '',
					department: '',
					hospital: '',
					// 患者字段
					gender: '',
					age: '',
					height: ''
				},
				// 密码显示状态
				showPassword: false,
				showConfirmPassword: false,
				// 短信倒计时
				smsCountdown: 0,
				// 倒计时定时器
				countdownTimer: null,
				// 协议同意状态
				agreeToTerms: false,
				// 科室选择弹窗
				showDepartmentModal: false,
				// 科室列表
				departments: [
					'内科', '外科', '妇产科', '儿科', '眼科', '耳鼻喉科',
					'口腔科', '皮肤科', '神经科', '精神科', '康复科', '营养科',
					'内分泌科', '心血管科', '消化科', '呼吸科', '肾内科', '血液科',
					'肿瘤科', '急诊科', '麻醉科', '影像科', '检验科', '其他'
				],
				// 微信注册相关
				isWechatRegister: false,
				wechatInfo: null
			}
		},
		
		computed: {
			// 是否可以发送短信
			canSendSms() {
				return validatePhone(this.formData.phone) && this.smsCountdown === 0
			},
			
			// 密码不一致错误提示
			passwordMismatchError() {
				return this.formData.confirmPassword && 
							this.formData.password && 
							this.formData.password !== this.formData.confirmPassword
			},
			
			// 是否可以注册
			canRegister() {
				// 微信注册模式的验证
				if (this.isWechatRegister) {
					const basicValid = this.formData.phone && 
										this.formData.smsCode &&
										this.formData.name && 
										this.agreeToTerms
					
					// 角色特定验证
					let roleValid = true
					if (this.selectedRole === 'doctor') {
						roleValid = this.formData.inviteCode && this.formData.department && this.formData.hospital
					} else if (this.selectedRole === 'patient') {
						roleValid = this.formData.gender && this.formData.age && this.formData.height
					}
					
					return basicValid && roleValid
				} else {
					// 普通注册模式的验证
					const basicValid = this.formData.phone && 
										this.formData.smsCode && 
										this.formData.name && 
										this.formData.password && 
										this.formData.confirmPassword &&
										this.agreeToTerms
					
					// 密码一致性验证
					const passwordValid = this.formData.password === this.formData.confirmPassword
					
					// 角色特定验证
					let roleValid = true
					if (this.selectedRole === 'doctor') {
						roleValid = this.formData.inviteCode && this.formData.department && this.formData.hospital
					} else if (this.selectedRole === 'patient') {
						roleValid = this.formData.gender && this.formData.age && this.formData.height
					}
					
					return basicValid && passwordValid && roleValid
				}
			}
		},
		
		onLoad(options) {
			// 检查是否来自微信登录
			if (options.fromWechat === 'true') {
				this.initWechatRegister()
			}
		},
		
		onUnload() {
			// 清除倒计时定时器
			if (this.countdownTimer) {
				clearInterval(this.countdownTimer)
			}
			// 清除微信注册信息
			if (this.isWechatRegister) {
				uni.removeStorageSync('wechatRegisterInfo')
			}
		},
		
		methods: {
				// 初始化微信注册
				initWechatRegister() {
					try {
						// 获取微信注册信息
						const wechatInfo = uni.getStorageSync('wechatRegisterInfo')
						if (wechatInfo) {
							this.isWechatRegister = true
							this.wechatInfo = wechatInfo
							
							// 预填充数据
							this.formData.phone = wechatInfo.phone || ''
							const wechatRole = String(wechatInfo.role || 'patient').toLowerCase()
							this.selectedRole = ['doctor', 'nutritionist', 'practitioner'].includes(wechatRole) ? 'doctor' : 'patient'
							this.practitionerRole = wechatRole === 'nutritionist' ? 'nutritionist' : 'doctor'
							
							// 微信注册默认同意协议
							this.agreeToTerms = true
							
							console.log('微信注册模式初始化完成:', wechatInfo)
							showToast('请验证手机号并完善微信注册信息', 'none')
						} else {
							console.error('未找到微信注册信息')
							showToast('微信信息获取失败，请重新登录')
							uni.navigateBack()
						}
					} catch (error) {
						console.error('初始化微信注册失败:', error)
						showToast('初始化失败，请重新登录')
						uni.navigateBack()
					}
				},
				
				// 选择角色
				selectRole(role) {
					this.selectedRole = role
					
					// 清空角色特定字段
					if (role === 'doctor') {
						this.formData.gender = ''
						this.formData.age = ''
						this.formData.height = ''
					} else {
						this.formData.inviteCode = ''
						this.formData.department = ''
						this.formData.hospital = ''
					}
					
					// 微信注册模式下切换角色时的提示
					if (this.isWechatRegister) {
						showToast(`已切换为${role === 'doctor' ? '医生/营养师' : '患者'}身份`, 'none')
					}
				},

				selectPractitionerRole(role) {
					this.practitionerRole = role === 'nutritionist' ? 'nutritionist' : 'doctor'
				},
			
			// 切换密码显示状态
			togglePassword() {
				this.showPassword = !this.showPassword
				this.$nextTick(() => {
					const input = this.$refs.passwordInput
					if (input) {
						input.type = this.showPassword ? 'text' : 'password'
					}
				})
			},
			
			// 切换确认密码显示状态
			toggleConfirmPassword() {
				this.showConfirmPassword = !this.showConfirmPassword
				this.$nextTick(() => {
					const input = this.$refs.confirmPasswordInput
					if (input) {
						input.type = this.showConfirmPassword ? 'text' : 'password'
					}
				})
			},
			
			// 发送短信验证码
			async sendSmsCode() {
				// 检查手机号
				if (!this.formData.phone) {
					showToast('请先输入手机号')
					return
				}
				
				if (!validatePhone(this.formData.phone)) {
					showToast('请输入正确的手机号')
					return
				}
				
				// 检查倒计时状态
				if (this.smsCountdown > 0) {
					showToast(`请等待${this.smsCountdown}秒后再试`)
					return
				}
				
				try {
					// 通过独立后端发送短信验证码
					const result = await sendSmsCode(this.formData.phone, this.isWechatRegister ? 'verify_phone' : 'register')
					
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
			
			// 选择性别
			selectGender(gender) {
				this.formData.gender = gender
			},
			
			// 显示科室选择器
			showDepartmentPicker() {
				this.showDepartmentModal = true
			},
			
			// 隐藏科室选择器
			hideDepartmentPicker() {
				this.showDepartmentModal = false
			},
			
			// 选择科室
			selectDepartment(dept) {
				this.formData.department = dept
				this.hideDepartmentPicker()
			},
			
			// 切换协议同意状态
			toggleAgreement() {
				this.agreeToTerms = !this.agreeToTerms
			},
			
			// 处理注册
			async handleRegister() {
				// 检查协议同意状态
				if (!this.agreeToTerms) {
					showToast('请先阅读并同意用户协议和隐私政策')
					return
				}
				
				// 基础字段验证
				if (!this.formData.phone) {
					showToast('请输入手机号')
					return
				}
				
				if (!validatePhone(this.formData.phone)) {
					showToast('请输入正确的手机号')
					return
				}
				
				if (!this.formData.smsCode) {
					showToast('请输入验证码')
					return
				}
				
				if (!this.formData.name) {
					showToast(this.selectedRole === 'doctor' ? '请输入姓名' : '请输入患者姓名')
					return
				}
				
				if (!this.isWechatRegister && !this.formData.password) {
					showToast('请设置密码')
					return
				}
				
				if (!this.isWechatRegister && !this.formData.confirmPassword) {
					showToast('请确认密码')
					return
				}
				
				// 角色特定字段验证
				if (this.selectedRole === 'doctor') {
					if (!this.formData.inviteCode) {
						showToast('请输入医生/营养师邀请码')
						return
					}
					
					if (!this.formData.department) {
						showToast('请选择科室')
						return
					}
					
					if (!this.formData.hospital) {
						showToast('请输入所在医院')
						return
					}
				} else if (this.selectedRole === 'patient') {
					if (!this.formData.gender) {
						showToast('请选择性别')
						return
					}
					
					if (!this.formData.age) {
						showToast('请输入年龄')
						return
					}
					
					if (!this.formData.height) {
						showToast('请输入身高')
						return
					}
					
					// 年龄范围验证
					const age = parseInt(this.formData.age)
					if (age < 1 || age > 120) {
						showToast('请输入正确的年龄（1-120岁）')
						return
					}
					
					// 身高范围验证
					const height = parseFloat(this.formData.height)
					if (height < 80 || height > 250) {
						showToast('请输入正确的身高（80-250cm）')
						return
					}
				}
				
				// 验证密码强度
				if (!this.isWechatRegister && this.formData.password.length < 8) {
					showToast('密码长度不能少于8位')
					return
				}
				
				// 验证密码一致性
				if (!this.isWechatRegister && this.formData.password !== this.formData.confirmPassword) {
					showToast('两次输入的密码不一致')
					return
				}
				
				try {
					// 显示加载状态
					uni.showLoading({
						title: '注册中...'
					})
					
					let result
					
					if (this.isWechatRegister) {
					// 微信注册模式
					const wechatRegisterData = {
						phone: this.formData.phone,
						smsCode: this.formData.smsCode,
						name: this.formData.name,
						role: this.selectedRole === 'doctor' ? this.practitionerRole : 'patient',
						acceptedTerms: true
					}
						
						// 添加角色特定数据
						if (this.selectedRole === 'doctor') {
							wechatRegisterData.practitionerInviteCode = this.formData.inviteCode
							wechatRegisterData.department = this.formData.department
							wechatRegisterData.hospital = this.formData.hospital || ''
							wechatRegisterData.title = ''
							wechatRegisterData.specialization = ''
						} else {
							wechatRegisterData.gender = this.formData.gender
							wechatRegisterData.age = parseInt(this.formData.age)
							wechatRegisterData.height = parseFloat(this.formData.height)
							wechatRegisterData.weight = null
							wechatRegisterData.targetWeight = null
						}
						
						// 调用独立后端微信注册接口
						result = await wechatRegister(wechatRegisterData)
					} else {
						// 普通注册模式
						const registerData = {
							phone: this.formData.phone,
							smsCode: this.formData.smsCode,
							name: this.formData.name,
							password: this.formData.password,
							role: this.selectedRole === 'doctor' ? this.practitionerRole : 'patient'
						}
						
						// 添加角色特定数据
						if (this.selectedRole === 'doctor') {
							registerData.practitionerInviteCode = this.formData.inviteCode
							registerData.department = this.formData.department
							registerData.hospital = this.formData.hospital
						} else {
							registerData.gender = this.formData.gender
							registerData.age = parseInt(this.formData.age)
							registerData.height = parseInt(this.formData.height)
						}
						
						// 调用独立后端注册接口
						result = await register(registerData)
					}
					
					uni.hideLoading()
					
					if (result.code === 200) {
					const { token, user } = result.data || {}
					if (!token || !user) throw new Error('注册成功但未返回登录会话')
					store.login(user, token)
					if (this.isWechatRegister) {
						const updated = await updateUserInfo(this.selectedRole === 'doctor' ? {
							name: this.formData.name,
							department: this.formData.department,
							hospital: this.formData.hospital
						} : {
							name: this.formData.name,
							gender: this.formData.gender,
							age: Number(this.formData.age),
							height: Number(this.formData.height)
						}, { loading: false })
						if (updated.code === 200) store.updateUserInfo(updated.data)
					}
					showToast('注册成功', 'success')
					setTimeout(() => {
						uni.reLaunch({ url: this.selectedRole === 'patient' ? '/pages/patient/index' : '/pages/doctor/index' })
					}, 500)
					} else {
						showToast(result.message || '注册失败')
					}
					
				} catch (error) {
					uni.hideLoading()
					console.error('注册错误:', error)
					showToast(error.message || '注册失败，请重试')
				}
			},
			
			// 去登录页面
			goToLogin() {
				uni.navigateBack()
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
			}
		}
	}
</script>

<style lang="scss">
	.register-container {
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
		padding: 80rpx 40rpx 40rpx;
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
		font-size: 24rpx;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.4;
	}

	/* 表单区域 */
	.form-section {
		flex: 1;
		padding: 0 40rpx 40rpx;
	}

	.form-container {
		background-color: #ffffff;
		border-radius: 30rpx;
		padding: 40rpx;
		box-shadow: 0 -10rpx 30rpx rgba(0, 0, 0, 0.1);
	}

	/* 角色选择 */
	.role-selector {
		margin-bottom: 30rpx;
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
		gap: 20rpx;
		justify-content: center;
	}

	.role-option {
		flex: 1;
		padding: 25rpx 15rpx;
		border: 2rpx solid #E9ECEF;
		border-radius: 15rpx;
		text-align: center;
		transition: all 0.3s ease;
		background-color: #ffffff;
	}

	.role-option.active {
		border-color: #667eea;
		background-color: #F8F9FF;
		transform: scale(1.02);
	}

	.role-icon {
		font-size: 36rpx;
		margin-bottom: 8rpx;
		display: block;
	}

	.role-text {
		font-size: 24rpx;
		color: #333333;
		font-weight: 600;
		display: block;
		margin-bottom: 4rpx;
	}

	.role-desc {
		font-size: 20rpx;
		color: #999999;
		display: block;
	}

	.role-option.active .role-text {
		color: #667eea;
	}

	.role-option.active .role-desc {
		color: #667eea;
	}

	/* 注册表单 */
	.register-form {
		margin-bottom: 30rpx;
	}

	.form-item {
		margin-bottom: $spacing-lg;
	}

	.input-wrapper {
		@include input-base;
		position: relative;
		display: flex;
		align-items: center;
		height: 90rpx;
	}

	.input-wrapper:focus-within {
		border-color: #667eea;
		background-color: #ffffff;
		box-shadow: 0 0 0 4rpx rgba(102, 126, 234, 0.1);
	}

	.input-icon {
		font-size: 28rpx;
		margin-right: 15rpx;
		color: #666666;
	}

	.form-input {
		flex: 1;
		font-size: 26rpx;
		color: #333333;
		background-color: transparent;
		border: none;
		outline: none;
	}

	.form-input::placeholder {
		color: #999999;
	}

	.input-unit {
		font-size: 24rpx;
		color: #666666;
		margin-left: 10rpx;
	}

	.password-toggle {
		width: 88rpx;
		height: 88rpx;
		padding: 0;
		margin-left: 8rpx;
		position: relative;
		z-index: 10;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 88rpx;
		min-height: 88rpx;
		box-sizing: border-box;
	}

	.toggle-icon {
		font-size: 24rpx;
		color: #666666;
	}

	/* 密码错误提示 */
	.password-error {
		margin-top: 8rpx;
		padding-left: 40rpx;
	}

	.error-text {
		font-size: 22rpx;
		color: #ff4757;
		line-height: 1.4;
	}

	/* 短信输入框 */
	.sms-wrapper {
		padding-right: 0;
	}

	.sms-input {
		padding-right: 15rpx;
	}

	.sms-btn {
		padding: 15rpx 25rpx;
		background-color: #667eea;
		border-radius: 8rpx;
		margin-right: 12rpx;
		transition: all 0.3s ease;
	}

	.sms-btn.disabled {
		background-color: #CCCCCC;
		pointer-events: none;
	}

	.sms-text {
		font-size: 22rpx;
		color: #ffffff;
		font-weight: 500;
		white-space: nowrap;
	}

	/* 选择器样式 */
	.picker-input {
		display: flex;
		align-items: center;
		height: 100%;
	}

	.picker-input .placeholder {
		color: #999999;
	}

	.picker-arrow {
		font-size: 20rpx;
		color: #666666;
		margin-left: 10rpx;
		transform: rotate(0deg);
		transition: transform 0.3s ease;
	}

	/* 执业身份与性别选择 */
	.gender-selector,
	.profession-selector {
		padding: 20rpx 0;
	}

	.field-label {
		font-size: 26rpx;
		color: #333333;
		font-weight: 600;
		margin-bottom: 15rpx;
		display: block;
	}

	.gender-options,
	.profession-options {
		display: flex;
		gap: 20rpx;
	}

	.gender-option,
	.profession-option {
		flex: 1;
		padding: 20rpx;
		border: 2rpx solid #E9ECEF;
		border-radius: 12rpx;
		text-align: center;
		transition: all 0.3s ease;
		background-color: #ffffff;
	}

	.gender-option.active,
	.profession-option.active {
		border-color: #667eea;
		background-color: #F8F9FF;
	}

	.gender-text,
	.profession-text {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8rpx;
		font-size: 24rpx;
		color: #333333;
		font-weight: 500;
	}

	.gender-option.active .gender-text,
	.profession-option.active .profession-text {
		color: #667eea;
		font-weight: 600;
	}

	/* 协议区域 */
	.agreement-section {
		margin-bottom: 30rpx;
	}

	.agreement-checkbox {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8rpx;
	}

	.checkbox {
		width: 28rpx;
		height: 28rpx;
		border: 2rpx solid #CCCCCC;
		border-radius: 4rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s ease;
		flex-shrink: 0;
	}

	.checkbox.checked {
		background-color: #667eea;
		border-color: #667eea;
	}

	.check-icon {
		font-size: 18rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.agreement-text {
		font-size: 24rpx;
		color: #666666;
	}

	.agreement-link {
		font-size: 24rpx;
		color: #667eea;
		text-decoration: underline;
	}

	/* 注册按钮 */
	.register-actions {
		margin-bottom: 25rpx;
	}

	.register-btn {
		@include btn-primary;
		width: 100%;
		height: 88rpx;
		font-size: 32rpx;
		font-weight: 600;
		margin-top: 60rpx;
	}

	.register-btn.disabled {
		background: #CCCCCC;
		box-shadow: none;
		pointer-events: none;
	}

	.register-btn:active {
		transform: scale(0.98);
	}

	.btn-text {
		font-size: 28rpx;
		color: #ffffff;
		font-weight: 600;
	}

	/* 登录区域 */
	.login-section {
		text-align: center;
	}

	.login-text {
		font-size: 24rpx;
		color: #666666;
	}

	.login-link {
		font-size: 24rpx;
		color: #667eea;
		font-weight: 600;
		margin-left: 8rpx;
	}

	/* 科室选择弹窗 */
	.department-modal {
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

	.modal-content {
		width: 80%;
		max-height: 70%;
		background-color: #ffffff;
		border-radius: 20rpx;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 30rpx;
		border-bottom: 1rpx solid #E9ECEF;
	}

	.modal-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #333333;
	}

	.modal-close {
		width: 88rpx;
		height: 88rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		box-sizing: border-box;
	}

	.department-list {
		max-height: 600rpx;
		overflow-y: auto;
	}

	.department-item {
		padding: 25rpx 30rpx;
		border-bottom: 1rpx solid #F5F5F5;
		transition: background-color 0.3s ease;
	}

	.department-item:active {
		background-color: #F8F9FA;
	}

	.department-name {
		font-size: 28rpx;
		color: #333333;
	}

	/* 微信注册相关样式 */
	.input-wrapper.readonly {
		background-color: #F8F9FA;
		border-color: #E9ECEF;
	}

	.input-wrapper.readonly .form-input {
		color: #666666;
		background-color: transparent;
	}

	.wechat-verified {
		display: flex;
		align-items: center;
		gap: 8rpx;
		margin-left: 10rpx;
	}

	.verified-text {
		font-size: 22rpx;
		color: #07c160;
		font-weight: 500;
	}

	/* 数字减重助手：蓝白临床视觉 */
	.register-container {
		background: linear-gradient(180deg, #236f8e 0%, #4b9fba 24%, #eaf5f9 24%, #f7fbfd 100%);
		overflow-x: hidden;
		overflow-y: auto;
	}

	.bg-decoration {
		display: none;
	}

	.header-section {
		padding: 60rpx 40rpx 34rpx;
	}

	.logo {
		width: 108rpx;
		height: 108rpx;
		margin-bottom: 14rpx;
	}

	.app-name {
		font-size: 42rpx;
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
		padding: 38rpx 34rpx;
		border: 1rpx solid rgba(46, 134, 171, 0.12);
		border-radius: 28rpx;
		box-shadow: 0 18rpx 48rpx rgba(31, 86, 109, 0.14);
	}

	.role-title,
	.field-label,
	.modal-title {
		color: #173b4d;
	}

	.role-option,
	.gender-option,
	.profession-option {
		border-color: #dce8ed;
		background: #f8fbfc;
	}

	.role-option.active,
	.gender-option.active,
	.profession-option.active {
		border-color: #2e86ab;
		background: #eaf5fa;
		transform: none;
	}

	.role-option.active .role-text,
	.role-option.active .role-desc,
	.gender-option.active .gender-text,
	.profession-option.active .profession-text,
	.agreement-link,
	.login-link {
		color: #2e86ab;
	}

	.input-wrapper {
		background: #f7fafc;
		border-color: #dce8ed;
	}

	.input-wrapper:focus-within {
		border-color: #2e86ab;
		box-shadow: 0 0 0 4rpx rgba(46, 134, 171, 0.1);
	}

	.sms-btn,
	.checkbox.checked {
		background: #2e86ab;
		border-color: #2e86ab;
	}

	.picker-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		color: #55717e;
	}

	.register-btn {
		background: linear-gradient(135deg, #2e86ab 0%, #246f90 100%);
		border-radius: 16rpx;
		box-shadow: 0 10rpx 24rpx rgba(46, 134, 171, 0.26);
	}

	.modal-content {
		border: 1rpx solid rgba(46, 134, 171, 0.12);
		border-radius: 24rpx;
		box-shadow: 0 24rpx 64rpx rgba(23, 59, 77, 0.22);
	}
</style>
