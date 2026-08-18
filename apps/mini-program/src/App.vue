<script>
	import store from './store/index.js'
	
	export default {
		onLaunch: function() {
			console.log('App Launch')
			// 初始化store
			store.init()
			// 设置动态tabBar
			this.setDynamicTabBar()
		},
		onShow: function() {
			console.log('App Show')
			// 每次显示时检查并更新tabBar
			this.setDynamicTabBar()
		},
		onHide: function() {
			console.log('App Hide')
		},
		methods: {
			// 根据用户角色动态设置tabBar
			setDynamicTabBar() {
				const userInfo = store.getUserInfo()
				if (!userInfo || !userInfo.role) return
				
				// 检查当前页面是否为TabBar页面
				const pages = getCurrentPages()
				if (pages.length === 0) return
				
				const currentPage = pages[pages.length - 1]
				const currentRoute = currentPage.route
				
				// 患者端TabBar页面列表
				const patientTabBarPages = [
					'pages/patient/index',
					'pages/patient/record',
					'pages/patient/follow',
					'pages/patient/report'
				]
				
				// 医生端TabBar页面列表
				const doctorTabBarPages = [
					'pages/doctor/index',
					'pages/doctor/patients',
					'pages/doctor/follow',
					'pages/doctor/dashboard'
				]
				
				// 根据用户角色和当前页面设置TabBar显示
				try {
					uni.setTabBarStyle({
						color: '#666666',
						selectedColor: '#2E86AB',
						backgroundColor: '#ffffff',
						borderStyle: 'black'
					})
					
					if (userInfo.role === 'doctor') {
						// 医生端：隐藏患者端TabBar项，显示医生端TabBar项
						for (let i = 0; i < 4; i++) {
							uni.hideTabBarRedDot({ index: i })
							uni.hideTabBar()
						}
						
						// 显示医生端TabBar项
						for (let i = 4; i < 8; i++) {
							uni.showTabBar()
						}
						
						// 如果当前在医生端页面，显示TabBar
						if (doctorTabBarPages.includes(currentRoute)) {
							uni.showTabBar()
						}
					} else {
						// 患者端：隐藏医生端TabBar项，显示患者端TabBar项
						for (let i = 4; i < 8; i++) {
							uni.hideTabBarRedDot({ index: i })
							uni.hideTabBar()
						}
						
						// 如果当前在患者端页面，显示TabBar
						if (patientTabBarPages.includes(currentRoute)) {
							uni.showTabBar()
						}
					}
				} catch (error) {
					console.error('设置tabBar失败:', error)
				}
			}
		}
	}
</script>

<style>
	/* 数字减重助手全局视觉基线 */
	page,
	body {
		min-height: 100%;
		background: #F4F9FB;
		color: #1C3544;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	view,
	text,
	button,
	input,
	textarea,
	image {
		box-sizing: border-box;
	}

	button::after {
		border: 0;
	}

	button,
	input,
	textarea {
		font: inherit;
	}

	.clinical-loading-spinner {
		display: inline-block;
		width: 30rpx;
		height: 30rpx;
		margin-right: 12rpx;
		border: 4rpx solid #D8EDF3;
		border-top-color: #168FB5;
		border-radius: 50%;
		animation: clinical-spin 0.8s linear infinite;
		vertical-align: middle;
	}

	.clinical-loading-text {
		font-size: 24rpx;
		color: #71858F;
		vertical-align: middle;
	}

	@keyframes clinical-spin {
		to { transform: rotate(360deg); }
	}

	/* H5 在桌面端保持手机应用宽度，移动端继续全屏显示 */
	@media screen and (min-width: 768px) {
		body {
			background:
				radial-gradient(circle at 22% 15%, rgba(46, 134, 171, 0.12), transparent 32%),
				linear-gradient(145deg, #E6F2F6 0%, #F4F9FB 48%, #DFEEF3 100%);
		}

		#app {
			width: 100%;
			max-width: 430px;
			min-height: 100vh;
			margin: 0 auto;
			position: relative;
			background: #F4F9FB;
			box-shadow: 0 0 0 1px rgba(28, 70, 87, 0.08), 0 24px 72px rgba(28, 70, 87, 0.18);
			overflow-x: hidden;
		}

		uni-app,
		uni-page {
			width: 100%;
			max-width: 430px;
			min-height: 100vh;
			margin: 0 auto;
		}

		uni-page-body {
			width: 100%;
			max-width: none;
			min-height: 100vh;
			margin: 0;
		}

		uni-page-body > view {
			width: 100% !important;
			max-width: 100% !important;
		}

		/* 权重需高于 uni-h5 的 .uni-tabbar-bottom .uni-tabbar，否则宽屏会贴在视口左侧 */
		uni-tabbar.uni-tabbar-bottom .uni-tabbar {
			width: 100%;
			max-width: 430px;
			left: 50% !important;
			right: auto !important;
			transform: translateX(-50%) !important;
		}
	}
</style>
