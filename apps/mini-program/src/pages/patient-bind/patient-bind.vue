<template>
	<view class="bind-container">
		<!-- 背景装饰 -->
		<view class="bg-decoration">
			<view class="bg-circle circle-1"></view>
			<view class="bg-circle circle-2"></view>
		</view>
		
		<!-- 头部区域 -->
		<view class="header-section">
			<view class="header-content">
				<view class="brand-lockup">
					<view class="brand-mark">
						<image class="brand-logo" src="/static/logo.png" mode="aspectFit"></image>
					</view>
					<text class="brand-name">数字减重助手</text>
				</view>
				<view class="bind-icon"><Icon name="Business/shake-hands-line.svg" size="40" color="$primary-color" /></view>
				<text class="bind-title">医生/营养师绑定</text>
				<text class="bind-desc">与您的医生/营养师建立连接，获得专业健康指导</text>
			</view>
		</view>
		
		<!-- 绑定方式选择 -->
		<view class="bind-methods">
			<view class="method-title">选择绑定方式</view>
			<view class="method-options">
				<view 
					class="method-option" 
					:class="{active: bindMethod === 'qrcode'}"
					role="radio"
					:aria-checked="bindMethod === 'qrcode'"
					@click="selectBindMethod('qrcode')"
				>
					<view class="method-icon"><Icon name="Device/phone-line.svg" size="24" :color="bindMethod === 'qrcode' ? '$primary-color' : '#ffffff'" /></view>
					<text class="method-text">扫描二维码</text>
					<text class="method-desc">扫描医生/营养师提供的二维码</text>
				</view>
				<view 
					class="method-option" 
					:class="{active: bindMethod === 'code'}"
					role="radio"
					:aria-checked="bindMethod === 'code'"
					@click="selectBindMethod('code')"
				>
					<view class="method-icon"><Icon name="System/hashtag.svg" size="24" :color="bindMethod === 'code' ? '$primary-color' : '#ffffff'" /></view>
					<text class="method-text">输入绑定码</text>
					<text class="method-desc">手动输入医生/营养师绑定码</text>
				</view>
			</view>
		</view>
		
		<!-- 绑定内容区域 -->
		<view class="bind-content">
			<!-- 二维码扫描 -->
			<view v-if="bindMethod === 'qrcode'" class="qrcode-section">
				<view class="scan-area">
					<view class="scan-frame">
						<view class="scan-corners">
							<view class="corner corner-tl"></view>
							<view class="corner corner-tr"></view>
							<view class="corner corner-bl"></view>
							<view class="corner corner-br"></view>
						</view>
						<view class="scan-line"></view>
					</view>
					<text class="scan-tip">将二维码放入框内，即可自动扫描</text>
				</view>
				
				<view class="scan-actions">
					<button class="scan-btn" @click="startScan">
						<text class="btn-text">开始扫描</text>
					</button>
					<view class="scan-help" @click="showHelp">
						<text class="help-text">扫描遇到问题？</text>
					</view>
				</view>
			</view>
			
			<!-- 绑定码输入 -->
			<view v-if="bindMethod === 'code'" class="code-section">
				<view class="code-form">
					<view class="form-item">
						<view class="input-label">医生/营养师绑定码</view>
						<view class="input-wrapper">
							<input 
								class="bind-input" 
								type="text" 
								placeholder="请输入6-8位绑定码"
								v-model="bindCode"
								maxlength="8"
								@input="formatBindCode"
							/>
							<view class="input-clear" v-if="bindCode" role="button" aria-label="清空绑定码" @click="clearBindCode">
								<Icon name="System/close-line.svg" size="20" color="$gray-600" />
							</view>
						</view>
					</view>
					
					<view class="code-tip">
						<view class="tip-icon"><Icon name="Others/lightbulb-line.svg" size="16" color="$warning-color" /></view>
						<text class="tip-text">绑定码由您的医生/营养师提供，通常为6-8位数字或字母组合</text>
					</view>
				</view>
				
				<view class="code-actions">
					<button 
						class="bind-btn" 
						:class="{disabled: !canBind}"
						:disabled="!canBind"
						@click="handleBind"
					>
						<text class="btn-text">确认绑定</text>
					</button>
				</view>
			</view>
		</view>
		
		<!-- 绑定历史 -->
		<view class="bind-history" v-if="bindHistory.length > 0">
			<view class="history-title">已绑定</view>
			<view class="history-list">
				<view 
					v-for="(item, index) in bindHistory" 
					:key="index"
					class="history-item"
					@click="unbindDoctor(item)"
				>
					<view class="doctor-avatar">
						<text class="avatar-text">{{item.doctorName.charAt(0)}}</text>
					</view>
					<view class="doctor-info">
						<text class="doctor-name">{{item.doctorName}}</text>
						<text class="doctor-dept">{{item.department}} · {{item.hospital}}</text>
					</view>
					<view class="bind-status">
						<text class="status-text">取消绑定</text>
					</view>
				</view>
			</view>
		</view>
		
		<!-- 绑定说明 -->
		<view class="bind-info">
			<view class="info-title">绑定说明</view>
			<view class="info-list">
				<view class="info-item">
					<view class="info-icon"><Icon name="System/number-1.svg" size="20" color="$primary-color" /></view>
					<text class="info-text">获取医生/营养师提供的绑定码或二维码</text>
				</view>
				<view class="info-item">
					<view class="info-icon"><Icon name="System/number-2.svg" size="20" color="$primary-color" /></view>
					<text class="info-text">选择对应的绑定方式进行绑定</text>
				</view>
				<view class="info-item">
					<view class="info-icon"><Icon name="System/number-3.svg" size="20" color="$primary-color" /></view>
					<text class="info-text">绑定成功后即可开始健康管理</text>
				</view>
			</view>
		</view>
		
		<!-- 扫描帮助弹窗 -->
		<view class="help-modal" v-if="showHelpModal" @click="hideHelp">
			<view class="modal-content" @click.stop>
				<view class="modal-header">
					<text class="modal-title">扫描帮助</text>
					<view class="modal-close" role="button" aria-label="关闭扫描帮助" @click="hideHelp"><Icon name="System/close-line.svg" size="20" color="$gray-600" /></view>
				</view>
				<view class="help-content">
					<view class="help-item">
						<text class="help-question">Q: 扫描不成功怎么办？</text>
						<text class="help-answer">A: 请确保二维码清晰完整，光线充足，手机摄像头对焦清楚。</text>
					</view>
					<view class="help-item">
						<text class="help-question">Q: 二维码过期了怎么办？</text>
						<text class="help-answer">A: 请联系您的医生/营养师重新生成绑定二维码。</text>
					</view>
					<view class="help-item">
						<text class="help-question">Q: 可以绑定多位医生/营养师吗？</text>
						<text class="help-answer">A: 可以，您可以同时绑定多位医生/营养师进行健康管理。</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'
	import { getInviteInfo, bindByInviteCode, getPatientDoctors, unbindPatient } from '../../utils/api.js'
	import { showToast, showLoading, hideLoading } from '../../utils/common.js'
	import store from '../../store/index.js'
	
	export default {
		components: {
			Icon
		},
		data() {
			return {
				// 绑定方式：qrcode-二维码扫描，code-绑定码输入
				bindMethod: 'qrcode',
				// 绑定码
				bindCode: '',
				// 是否显示帮助弹窗
				showHelpModal: false,
				// 绑定历史
				bindHistory: []
			}
		},
		
		computed: {
			// 是否可以绑定
			canBind() {
				return this.bindCode && this.bindCode.length >= 6
			}
		},
		
		onLoad(options) {
			// 如果从其他页面传入绑定码，直接填入
			if (options.code) {
				this.bindCode = options.code
				this.bindMethod = 'code'
			}
			
			// 如果传入二维码数据，直接处理
			if (options.qrData) {
				this.handleQRCodeData(options.qrData)
			}
			
			// 加载绑定历史
			this.updateBindHistory()
		},
		
		methods: {
			// 选择绑定方式
			selectBindMethod(method) {
				this.bindMethod = method
				// 切换方式时清空输入
				if (method === 'qrcode') {
					this.bindCode = ''
				}
			},
			
			// 格式化绑定码输入
			formatBindCode() {
				// 转换为大写并移除非字母数字字符
				this.bindCode = this.bindCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
			},
			
			// 清空绑定码
			clearBindCode() {
				this.bindCode = ''
			},
			
			// 开始扫描二维码
			startScan() {
				uni.scanCode({
					success: (res) => {
						this.handleQRCodeData(res.result)
					},
					fail: (err) => {
						console.error('扫描失败:', err)
						showToast('扫描失败，请重试')
					}
				})
			},
			
			// 处理二维码数据
			handleQRCodeData(data) {
				if (!data) {
					showToast('二维码数据无效')
					return
				}
				
				try {
					// 尝试解析JSON格式的二维码数据
					const qrData = JSON.parse(data)
					
					if (qrData.type === 'doctor_bind' && qrData.bindCode) {
						// 自动填入绑定码
						this.bindCode = qrData.bindCode
						this.bindMethod = 'code'
						
						// 显示医生信息预览
						if (qrData.doctorName) {
							uni.showModal({
								title: '确认绑定',
								content: `扫描到医生/营养师：${qrData.doctorName}\n科室：${qrData.department || '未知'}\n是否立即绑定？`,
								confirmText: '立即绑定',
								cancelText: '取消',
								success: (res) => {
									if (res.confirm) {
										this.handleBind()
									}
								}
							})
						} else {
							// 没有医生信息，直接绑定
							this.handleBind()
						}
					} else {
						showToast('无效的医生/营养师二维码')
					}
				} catch (error) {
					// 如果不是JSON格式，可能是纯绑定码或URL
					let bindCode = data
					
					// 如果是完整的URL，提取参数
					if (data.includes('bind=')) {
						const match = data.match(/bind=([A-Z0-9]+)/)
						if (match) {
							bindCode = match[1]
						}
					}
					
					if (bindCode && bindCode.length >= 6) {
						this.bindCode = bindCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
						this.bindMethod = 'code'
						showToast('扫描成功，请确认绑定')
					} else {
						showToast('无效的二维码')
					}
				}
			},
			
			// 处理绑定
			async handleBind() {
				if (!this.canBind) return
				
				try {
					showLoading('绑定中...')
					
					// 获取当前患者ID
					const userInfo = store.getUserInfo()
					if (!userInfo || !userInfo.userId) {
						hideLoading()
						showToast('请先登录')
						return
					}
					
					// 先只读预览邀请码，确认前绝不写入医患关系
					const bindResult = await getInviteInfo(this.bindCode)
					
					if (bindResult.code === 200) {
						// 绑定成功，获取医生信息
						const rawDoctor = bindResult.data?.doctorInfo || bindResult.data?.practitioner || bindResult.data?.doctor || bindResult.data
						if (!rawDoctor || !(rawDoctor.doctorId || rawDoctor.practitionerId || rawDoctor.id)) {
							throw new Error('邀请码未关联有效医生/营养师')
						}
						const doctorInfo = {
							...rawDoctor,
							doctorId: rawDoctor.doctorId || rawDoctor.practitionerId || rawDoctor.id,
							doctorName: rawDoctor.doctorName || rawDoctor.name || '医生/营养师',
							department: rawDoctor.department || '未填写科室'
						}
						
						await this.confirmBind(doctorInfo)
					} else {
						hideLoading()
						showToast(bindResult.message || '绑定失败')
					}
				} catch (error) {
					console.error('绑定失败:', error)
					hideLoading()
					showToast('绑定失败，请重试')
				}
			},
			
			// 确认绑定
			async confirmBind(doctorInfo) {
				try {
					hideLoading()
					// 显示确认对话框
					const confirmed = await this.showBindConfirm(doctorInfo)
					
					if (!confirmed) {
						hideLoading()
						return
					}
					
					showLoading('绑定中...')
					const result = await bindByInviteCode(this.bindCode)
					if (result.code !== 200) throw new Error(result.message || '绑定失败')

					hideLoading()
					showToast('绑定成功！', 'success')
				
				// 更新绑定历史
				this.updateBindHistory()
				
				// 延迟跳转
					setTimeout(() => {
						uni.switchTab({
							url: '/pages/patient/index'
						})
					}, 1500)
					
				} catch (error) {
					hideLoading()
					showToast(error.message || '绑定失败，请重试')
				}
			},
			
			// 显示绑定确认对话框
			showBindConfirm(doctorInfo) {
				return new Promise((resolve) => {
					uni.showModal({
						title: '确认绑定',
						content: `确定要绑定“${doctorInfo.doctorName}”（${doctorInfo.department}）吗？`,
						confirmText: '确认绑定',
						cancelText: '取消',
						success: (res) => {
							resolve(res.confirm)
						},
						fail: () => {
							resolve(false)
						}
					})
				})
			},
			
			// 取消绑定医生
			async unbindDoctor(doctorInfo) {
				try {
					// 显示确认对话框
					const confirmed = await this.showUnbindConfirm(doctorInfo)
					if (!confirmed) return
					
					showLoading('正在取消绑定...')
					
					// 获取当前患者ID
					const userInfo = store.getUserInfo()
					if (!userInfo || !userInfo.userId) {
						hideLoading()
						showToast('请先登录')
						return
					}
					
					// 调用取消绑定API
					const result = await unbindPatient(doctorInfo.doctorId)
					
					if (result.code === 200) {
						hideLoading()
						showToast('取消绑定成功！', 'success')
						
						// 更新绑定历史列表
						await this.updateBindHistory()
						
						// 延迟跳转
						setTimeout(() => {
							uni.switchTab({
								url: '/pages/patient/index'
							})
						}, 1500)
					} else {
						hideLoading()
						showToast(result.message || '取消绑定失败')
					}
					
				} catch (error) {
					console.error('取消绑定失败:', error)
					hideLoading()
					showToast('取消绑定失败，请重试')
				}
			},
			
			// 显示取消绑定确认对话框
			async showUnbindConfirm(doctorInfo) {
				return new Promise((resolve) => {
					uni.showModal({
						title: '确认取消绑定',
						content: `确定要取消与 ${doctorInfo.doctorName} 的绑定关系吗？\n取消后将无法接收该医生/营养师的随访通知。`,
						confirmText: '确认取消',
						cancelText: '保持绑定',
						confirmColor: '#EF4444',
						success: (res) => {
							resolve(res.confirm)
						},
						fail: () => {
							resolve(false)
						}
					})
				})
			},
			

			
			// 显示扫描帮助
// 显示帮助
			showHelp() {
				this.showHelpModal = true
			},
			
			// 隐藏帮助
			hideHelp() {
				this.showHelpModal = false
			},
			
			// 更新绑定历史
			async updateBindHistory() {
				try {
					const userInfo = store.getUserInfo()
					if (!userInfo || !userInfo.userId) return
					
					// 获取患者的医生列表
					const result = await getPatientDoctors(userInfo.userId)
					
					if (result.code === 200 && result.data.doctors) {
						this.bindHistory = result.data.doctors.map(doctor => ({
							doctorId: doctor.userId,
							doctorName: doctor.name,
							department: doctor.department && doctor.department.trim() ? doctor.department : '全科医学科',
							hospital: doctor.hospital && doctor.hospital.trim() ? doctor.hospital : '综合医院',
							specialty: doctor.specialty && doctor.specialty.trim() ? doctor.specialty : '全科医疗',
							bindTime: doctor.relationInfo ? new Date(doctor.relationInfo.createdAt).toLocaleString() : '未知时间',
							status: doctor.relationInfo ? doctor.relationInfo.status : 'active'
						}))
					}
				} catch (error) {
					console.error('更新绑定历史失败:', error)
				}
			},
			

		}
		
	}
</script>

<style lang="scss">
	.bind-container {
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
		animation: float 8s ease-in-out infinite;
	}

	.circle-1 {
		width: 300rpx;
		height: 300rpx;
		top: 15%;
		left: -100rpx;
		animation-delay: 0s;
	}

	.circle-2 {
		width: 200rpx;
		height: 200rpx;
		top: 70%;
		right: -50rpx;
		animation-delay: 3s;
	}

	@keyframes float {
		0%, 100% {
			transform: translateY(0px) rotate(0deg);
		}
		50% {
			transform: translateY(-30px) rotate(180deg);
		}
	}

	/* 头部区域 */
	.header-section {
		padding: 80rpx 40rpx 40rpx;
		text-align: center;
	}

	.header-content {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.bind-icon {
		font-size: 80rpx;
		margin-bottom: 20rpx;
	}

	.bind-title {
		font-size: 42rpx;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 10rpx;
		text-shadow: 0 2rpx 4rpx rgba(0, 0, 0, 0.3);
	}

	.bind-desc {
		font-size: 24rpx;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.4;
		max-width: 500rpx;
	}

	/* 绑定方式选择 */
	.bind-methods {
		padding: 0 40rpx 30rpx;
	}

	.method-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #ffffff;
		text-align: center;
		margin-bottom: 25rpx;
	}

	.method-options {
		display: flex;
		gap: 20rpx;
	}

	.method-option {
		flex: 1;
		padding: 30rpx 20rpx;
		background-color: rgba(255, 255, 255, 0.1);
		border: 2rpx solid rgba(255, 255, 255, 0.2);
		border-radius: 20rpx;
		text-align: center;
		transition: all 0.3s ease;
		backdrop-filter: blur(10rpx);
	}

	.method-option.active {
		background-color: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.5);
		transform: scale(1.02);
	}

	.method-icon {
		font-size: 40rpx;
		margin-bottom: 10rpx;
		display: block;
	}

	.method-text {
		font-size: 26rpx;
		color: #ffffff;
		font-weight: 600;
		display: block;
		margin-bottom: 5rpx;
	}

	.method-desc {
		font-size: 20rpx;
		color: rgba(255, 255, 255, 0.8);
		display: block;
	}

	/* 绑定内容区域 */
	.bind-content {
		padding: 0 40rpx;
		margin-bottom: 40rpx;
	}

	/* 二维码扫描区域 */
	.qrcode-section {
		background-color: #ffffff;
		border-radius: 25rpx;
		padding: 40rpx;
		box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.1);
	}

	.scan-area {
		text-align: center;
		margin-bottom: 40rpx;
	}

	.scan-frame {
		position: relative;
		width: 400rpx;
		height: 400rpx;
		margin: 0 auto 30rpx;
		border: 2rpx dashed #CCCCCC;
		border-radius: 20rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #F8F9FA;
	}

	.scan-corners {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.corner {
		position: absolute;
		width: 60rpx;
		height: 60rpx;
		border: 4rpx solid #667eea;
	}

	.corner-tl {
		top: 20rpx;
		left: 20rpx;
		border-right: none;
		border-bottom: none;
		border-radius: 10rpx 0 0 0;
	}

	.corner-tr {
		top: 20rpx;
		right: 20rpx;
		border-left: none;
		border-bottom: none;
		border-radius: 0 10rpx 0 0;
	}

	.corner-bl {
		bottom: 20rpx;
		left: 20rpx;
		border-right: none;
		border-top: none;
		border-radius: 0 0 0 10rpx;
	}

	.corner-br {
		bottom: 20rpx;
		right: 20rpx;
		border-left: none;
		border-top: none;
		border-radius: 0 0 10rpx 0;
	}

	.scan-line {
		width: 300rpx;
		height: 4rpx;
		background: linear-gradient(90deg, transparent, #667eea, transparent);
		animation: scan 2s linear infinite;
	}

	@keyframes scan {
		0% {
			transform: translateY(-150rpx);
		}
		100% {
			transform: translateY(150rpx);
		}
	}

	.scan-tip {
		font-size: 24rpx;
		color: #666666;
		line-height: 1.4;
	}

	.scan-actions {
		text-align: center;
	}

	.scan-btn {
		@include btn-primary;
		width: 300rpx;
		height: 80rpx;
		border-radius: 40rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 20rpx;
	}

	.scan-btn:active {
		transform: scale(0.98);
	}

	.scan-help {
		padding: 10rpx;
	}

	.help-text {
		font-size: 22rpx;
		color: #667eea;
		text-decoration: underline;
	}

	/* 绑定码输入区域 */
	.code-section {
		background-color: #ffffff;
		border-radius: 25rpx;
		padding: 40rpx;
		box-shadow: 0 10rpx 30rpx rgba(0, 0, 0, 0.1);
	}

	.code-form {
		margin-bottom: 40rpx;
	}

	.form-item {
		margin-bottom: 30rpx;
	}

	.input-label {
		font-size: 26rpx;
		color: #333333;
		font-weight: 600;
		margin-bottom: 15rpx;
		display: block;
	}

	.input-wrapper {
		@include input-base;
		position: relative;
		height: 90rpx;
		display: flex;
		align-items: center;
		backdrop-filter: blur(10rpx);
	}

	.input-wrapper:focus-within {
		border-color: #667eea;
		background-color: #ffffff;
		box-shadow: 0 0 0 4rpx rgba(102, 126, 234, 0.1);
	}

	.bind-input {
		flex: 1;
		font-size: 28rpx;
		color: #333333;
		background-color: transparent;
		border: none;
		outline: none;
		letter-spacing: 2rpx;
		font-weight: 600;
	}

	.bind-input::placeholder {
		color: #999999;
		font-weight: normal;
	}

	.input-clear {
		width: 88rpx;
		height: 88rpx;
		min-width: 88rpx;
		padding: 0;
		margin-left: 8rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
	}

	.clear-icon {
		font-size: 24rpx;
		color: #CCCCCC;
	}

	.code-tip {
		display: flex;
		align-items: flex-start;
		padding: 20rpx;
		background-color: #F0F7FF;
		border-radius: 12rpx;
		border-left: 4rpx solid #667eea;
	}

	.tip-icon {
		font-size: 24rpx;
		margin-right: 10rpx;
		flex-shrink: 0;
	}

	.tip-text {
		font-size: 22rpx;
		color: #666666;
		line-height: 1.4;
	}

	.code-actions {
		text-align: center;
	}

	.bind-btn {
		@include btn-primary;
		width: 100%;
		height: 90rpx;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bind-btn.disabled {
		background: #CCCCCC;
		box-shadow: none;
		pointer-events: none;
	}

	.bind-btn:active {
		transform: scale(0.98);
	}

	.btn-text {
		font-size: 28rpx;
		color: #ffffff;
		font-weight: 600;
	}

	/* 绑定历史 */
	.bind-history {
		padding: 0 40rpx 30rpx;
	}

	.history-title {
		font-size: 26rpx;
		font-weight: 600;
		color: #ffffff;
		margin-bottom: 20rpx;
	}

	.history-list {
		background-color: #ffffff;
		border-radius: 20rpx;
		overflow: hidden;
		box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, 0.1);
	}

	.history-item {
		display: flex;
		align-items: center;
		padding: 25rpx 30rpx;
		border-bottom: 1rpx solid #F5F5F5;
		transition: background-color 0.3s ease;
	}

	.history-item:last-child {
		border-bottom: none;
	}

	.history-item:active {
		background-color: #F8F9FA;
	}

	.doctor-avatar {
		width: 80rpx;
		height: 80rpx;
		border-radius: 50%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 20rpx;
		flex-shrink: 0;
	}

	.avatar-text {
		font-size: 28rpx;
		color: #ffffff;
		font-weight: 600;
	}

	.doctor-info {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.doctor-name {
		font-size: 26rpx;
		color: #333333;
		font-weight: 600;
		margin-bottom: 5rpx;
	}

	.doctor-dept {
		font-size: 22rpx;
		color: #666666;
	}

	.bind-status {
		flex-shrink: 0;
	}

	.status-text {
		font-size: 22rpx;
		color: #667eea;
		font-weight: 500;
	}

	/* 绑定说明 */
	.bind-info {
		padding: 0 40rpx 40rpx;
	}

	.info-title {
		font-size: 26rpx;
		font-weight: 600;
		color: #ffffff;
		margin-bottom: 20rpx;
	}

	.info-list {
		background-color: rgba(255, 255, 255, 0.1);
		border-radius: 20rpx;
		padding: 30rpx;
		backdrop-filter: blur(10rpx);
	}

	.info-item {
		display: flex;
		align-items: flex-start;
		margin-bottom: 20rpx;
	}

	.info-item:last-child {
		margin-bottom: 0;
	}

	.info-icon {
		font-size: 24rpx;
		margin-right: 15rpx;
		flex-shrink: 0;
	}

	.info-text {
		font-size: 22rpx;
		color: rgba(255, 255, 255, 0.9);
		line-height: 1.4;
	}

	/* 帮助弹窗 */
	.help-modal {
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
		width: 85%;
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

	.help-content {
		padding: 30rpx;
		max-height: 500rpx;
		overflow-y: auto;
	}

	.help-item {
		margin-bottom: 25rpx;
	}

	.help-item:last-child {
		margin-bottom: 0;
	}

	.help-question {
		font-size: 24rpx;
		color: #333333;
		font-weight: 600;
		display: block;
		margin-bottom: 8rpx;
	}

	.help-answer {
		font-size: 22rpx;
		color: #666666;
		line-height: 1.4;
		display: block;
	}

	/* 数字减重助手：蓝白临床视觉 */
	.bind-container {
		background: linear-gradient(180deg, #236f8e 0%, #4b9fba 650rpx, #eaf5f9 650rpx, #f7fbfd 100%);
		overflow-x: hidden;
		overflow-y: auto;
	}

	.bg-decoration {
		display: none;
	}

	.header-section {
		padding: 56rpx 40rpx 34rpx;
	}

	.brand-lockup {
		display: flex;
		align-items: center;
		gap: 14rpx;
		margin-bottom: 24rpx;
	}

	.brand-mark {
		width: 64rpx;
		height: 64rpx;
		border-radius: 16rpx;
		background: rgba(255, 255, 255, 0.16);
		border: 1rpx solid rgba(255, 255, 255, 0.25);
		display: flex;
		align-items: center;
		justify-content: center;
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

	.bind-icon {
		width: 108rpx;
		height: 108rpx;
		margin-bottom: 18rpx;
		border-radius: 28rpx;
		background: rgba(255, 255, 255, 0.94);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 14rpx 30rpx rgba(19, 68, 88, 0.18);
	}

	.bind-title {
		text-shadow: none;
	}

	.method-option {
		border-color: rgba(255, 255, 255, 0.3);
		background: rgba(24, 97, 126, 0.28);
		backdrop-filter: blur(14rpx);
	}

	.method-option.active {
		background: #ffffff;
		border-color: #ffffff;
		transform: none;
		box-shadow: 0 12rpx 28rpx rgba(20, 66, 85, 0.16);
	}

	.method-option.active .method-text {
		color: #173b4d;
	}

	.method-option.active .method-desc {
		color: #647f8d;
	}

	.qrcode-section,
	.code-section,
	.history-list,
	.info-list,
	.modal-content {
		border: 1rpx solid rgba(46, 134, 171, 0.12);
		border-radius: 24rpx;
		box-shadow: 0 16rpx 40rpx rgba(31, 86, 109, 0.12);
	}

	.scan-frame {
		background: #f5fafc;
		border-color: #bdd5df;
	}

	.corner {
		border-color: #2e86ab;
	}

	.scan-line {
		background: linear-gradient(90deg, transparent, #2e86ab, transparent);
	}

	.help-text,
	.status-text {
		color: #2e86ab;
	}

	.input-wrapper:focus-within {
		border-color: #2e86ab;
		box-shadow: 0 0 0 4rpx rgba(46, 134, 171, 0.1);
	}

	.code-tip {
		background: #edf7fa;
		border-left-color: #2e86ab;
	}

	.scan-btn,
	.bind-btn {
		background: linear-gradient(135deg, #2e86ab 0%, #246f90 100%);
		box-shadow: 0 10rpx 24rpx rgba(46, 134, 171, 0.26);
	}

	.history-title,
	.info-title {
		color: #173b4d;
	}

	.info-list {
		background: #ffffff;
		backdrop-filter: none;
	}

	.info-text {
		color: #55717e;
	}

	.doctor-avatar {
		background: linear-gradient(135deg, #2e86ab 0%, #7fc6d7 100%);
	}
</style>
