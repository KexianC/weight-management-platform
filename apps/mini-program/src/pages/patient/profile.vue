<template>
	<view class="profile-page patient-theme">
		<view class="profile-card">
			<view class="avatar-wrap">
				<Icon name="User/user-line.svg" size="32" color="$patient-primary" />
			</view>
			<view class="profile-copy">
				<text class="profile-name">{{ userInfo.name || '患者用户' }}</text>
				<text class="profile-phone">{{ maskedPhone }}</text>
			</view>
			<view class="role-chip">患者</view>
		</view>

		<view class="status-card">
			<view class="status-item" @tap="goToMessages">
				<text class="status-value">{{ unreadCount }}</text>
				<text class="status-label">未读消息</text>
			</view>
			<view class="status-divider"></view>
			<view class="status-item" @tap="goToBinding">
				<text class="status-value binding-value">{{ bindingLabel }}</text>
				<text class="status-label">医生/营养师</text>
			</view>
		</view>

		<view class="section-title">常用服务</view>
		<view class="menu-card">
			<view class="menu-row" @tap="goToMessages">
				<view class="menu-icon"><Icon name="Communication/message-line.svg" size="20" color="$patient-primary" /></view>
				<text class="menu-label">我的消息</text>
				<view class="row-badge" v-if="unreadCount > 0">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
				<Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-400" />
			</view>
			<view class="menu-divider"></view>
			<view class="menu-row" @tap="goToBinding">
				<view class="menu-icon"><Icon name="Business/links-line.svg" size="20" color="$patient-primary" /></view>
				<view class="menu-copy">
					<text class="menu-label">医生/营养师绑定</text>
					<text class="menu-hint">{{ bindingHint }}</text>
				</view>
				<Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-400" />
			</view>
		</view>

		<view class="section-title">关于与安全</view>
		<view class="menu-card">
			<view class="menu-row" @tap="openPage('/pages/agreement/user-agreement')">
				<view class="menu-icon neutral"><Icon name="Document/file-text-line.svg" size="20" color="$gray-600" /></view>
				<text class="menu-label">用户协议</text>
				<Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-400" />
			</view>
			<view class="menu-divider"></view>
			<view class="menu-row" @tap="openPage('/pages/agreement/privacy-policy')">
				<view class="menu-icon neutral"><Icon name="System/lock-line.svg" size="20" color="$gray-600" /></view>
				<text class="menu-label">隐私政策</text>
				<Icon name="Arrows/arrow-right-s-line.svg" size="18" color="$gray-400" />
			</view>
		</view>

		<button class="logout-button" @tap="confirmLogout">退出登录</button>
		<text class="version-text">MedTalent健康数字助手</text>
	</view>
</template>

<script>
	import Icon from '../../components/Icon.vue'
	import store from '../../store/index.js'
	import { getPatientDoctors, getUnreadMessageCount, logout as apiLogout } from '../../utils/api.js'

	export default {
		components: { Icon },
		data() {
			return {
				userInfo: {},
				unreadCount: 0,
				bindingCount: 0
			}
		},
		computed: {
			maskedPhone() {
				const phone = String(this.userInfo.phone || this.userInfo.mobile || '')
				if (!phone) return '完善健康资料，获得持续管理'
				return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
			},
			bindingLabel() {
				return this.bindingCount > 0 ? `${this.bindingCount} 位` : '未绑定'
			},
			bindingHint() {
				return this.bindingCount > 0 ? `已绑定 ${this.bindingCount} 位专业人员` : '绑定后获取专业健康指导'
			}
		},
		onShow() {
			if (!store.isLogin()) {
				uni.reLaunch({ url: '/pages/login/login' })
				return
			}
			this.userInfo = store.getUserInfo() || {}
			this.refreshSummary()
		},
		methods: {
			async refreshSummary() {
				const userId = this.userInfo.userId
				if (!userId) return
				const [messageResult, doctorResult] = await Promise.allSettled([
					getUnreadMessageCount(userId, { loading: false, showError: false }),
					getPatientDoctors(userId, { loading: false, showError: false })
				])
				if (messageResult.status === 'fulfilled') {
					this.unreadCount = Number(messageResult.value?.data?.unreadCount || 0)
				}
				if (doctorResult.status === 'fulfilled') {
					this.bindingCount = doctorResult.value?.data?.doctors?.length || 0
				}
			},
			goToMessages() {
				uni.navigateTo({ url: '/pages/common/messages' })
			},
			goToBinding() {
				uni.navigateTo({ url: '/pages/patient-bind/patient-bind' })
			},
			openPage(url) {
				uni.navigateTo({ url })
			},
			confirmLogout() {
				uni.showModal({
					title: '确认退出',
					content: '确定要退出当前账号吗？',
					confirmColor: '#E25F63',
					success: async ({ confirm }) => {
						if (!confirm) return
						try {
							await apiLogout({ loading: false, showError: false })
						} catch (error) {
							console.warn('服务端退出失败，已继续清理本地会话:', error)
						} finally {
							store.logout()
							uni.reLaunch({ url: '/pages/login/login' })
						}
					}
				})
			}
		}
	}
</script>

<style scoped>
	.profile-page {
		box-sizing: border-box;
		min-height: 100vh;
		padding: 28rpx 28rpx 54rpx;
		padding-bottom: calc(54rpx + env(safe-area-inset-bottom));
		background: #f4f9fb;
	}

	.profile-card {
		display: flex;
		align-items: center;
		padding: 34rpx 30rpx;
		border-radius: 26rpx;
		background: linear-gradient(128deg, #168fb5 0%, #36a9c5 100%);
		box-shadow: 0 14rpx 34rpx rgba(22, 143, 181, 0.2);
	}

	.avatar-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 92rpx;
		height: 92rpx;
		border: 4rpx solid rgba(255, 255, 255, 0.56);
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.2);
	}

	.profile-copy {
		display: flex;
		flex: 1;
		min-width: 0;
		margin-left: 22rpx;
		flex-direction: column;
	}

	.profile-name {
		overflow: hidden;
		font-size: 34rpx;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #ffffff;
	}

	.profile-phone {
		margin-top: 8rpx;
		font-size: 22rpx;
		color: rgba(255, 255, 255, 0.8);
	}

	.role-chip {
		padding: 8rpx 16rpx;
		border: 1rpx solid rgba(255, 255, 255, 0.45);
		border-radius: 18rpx;
		background: rgba(255, 255, 255, 0.16);
		font-size: 21rpx;
		color: #ffffff;
	}

	.status-card {
		display: flex;
		align-items: stretch;
		margin-top: 22rpx;
		padding: 24rpx 0;
		border: 1rpx solid rgba(42, 119, 151, 0.08);
		border-radius: 22rpx;
		background: #ffffff;
		box-shadow: 0 8rpx 24rpx rgba(25, 81, 106, 0.06);
	}

	.status-item {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: center;
		flex-direction: column;
	}

	.status-value {
		font-size: 30rpx;
		font-weight: 700;
		color: #168fb5;
	}

	.binding-value {
		font-size: 26rpx;
	}

	.status-label {
		margin-top: 6rpx;
		font-size: 21rpx;
		color: #71858f;
	}

	.status-divider {
		width: 1rpx;
		background: #e1edf1;
	}

	.section-title {
		margin: 32rpx 8rpx 14rpx;
		font-size: 24rpx;
		font-weight: 600;
		color: #536a75;
	}

	.menu-card {
		padding: 0 26rpx;
		border: 1rpx solid rgba(42, 119, 151, 0.08);
		border-radius: 24rpx;
		background: #ffffff;
		box-shadow: 0 8rpx 24rpx rgba(25, 81, 106, 0.05);
	}

	.menu-row {
		display: flex;
		align-items: center;
		min-height: 104rpx;
	}

	.menu-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64rpx;
		height: 64rpx;
		margin-right: 20rpx;
		border-radius: 18rpx;
		background: #eaf7fa;
	}

	.menu-icon.neutral {
		background: #f2f6f8;
	}

	.menu-label {
		flex: 1;
		font-size: 27rpx;
		font-weight: 600;
		color: #274b5f;
	}

	.menu-copy {
		display: flex;
		flex: 1;
		min-width: 0;
		flex-direction: column;
	}

	.menu-copy .menu-label {
		flex: none;
	}

	.menu-hint {
		margin-top: 5rpx;
		font-size: 20rpx;
		color: #91a4ac;
	}

	.menu-divider {
		height: 1rpx;
		margin-left: 84rpx;
		background: #e8f0f3;
	}

	.row-badge {
		min-width: 30rpx;
		height: 30rpx;
		margin-right: 10rpx;
		padding: 0 7rpx;
		border-radius: 16rpx;
		background: #e25f63;
		font-size: 18rpx;
		line-height: 30rpx;
		text-align: center;
		color: #ffffff;
	}

	.logout-button {
		height: 88rpx;
		margin-top: 38rpx;
		border: 1rpx solid #f0c8ca;
		border-radius: 22rpx;
		background: #ffffff;
		font-size: 27rpx;
		font-weight: 600;
		line-height: 88rpx;
		color: #d45156;
	}

	.logout-button::after {
		border: 0;
	}

	.version-text {
		display: block;
		margin-top: 24rpx;
		font-size: 20rpx;
		text-align: center;
		color: #a4b5bc;
	}
</style>

<style scoped lang="scss">
@import "../../styles/patient-theme.scss";
.profile-page { padding: 28rpx 28rpx calc(120rpx + env(safe-area-inset-bottom)); background: #f4f7fb; }
.profile-page .profile-card { background: #fff url('../../static/brand/third-wave.webp') no-repeat right center; background-size: cover; border-radius: 16rpx; border: 1px solid #e3e8f2; box-shadow: none; padding: 40rpx 28rpx; }
.profile-page .avatar-wrap { flex: none; border-color: #dce7ff; background: #edf3ff; }.profile-page .profile-name { color: #08163d; }.profile-page .profile-phone { color: #617091; font-size: 24rpx; }
.profile-page .role-chip { background: #edf2ff; border-color: #dce7ff; color: #2458db; flex: none; }
.profile-page .status-card, .profile-page .menu-card { border-color: #e3e8f2; border-radius: 16rpx; box-shadow: none; }.profile-page .status-value { color: #2b5fff; }.profile-page .status-label { font-size: 24rpx; color: #63718e; }
.profile-page .section-title { font-size: 29rpx; color: #12234c; }.profile-page .menu-label { color: #17284c; font-size: 29rpx; }.profile-page .menu-hint { font-size: 23rpx; color: #63718e; }
.profile-page .menu-icon { background: #edf3ff; border-radius: 16rpx; }.profile-page .menu-row { min-height: 112rpx; }.profile-page .menu-divider { background: #e3e8f2; }.profile-page .logout-button { border-radius: 12rpx; }

</style>
