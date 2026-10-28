<script>
	import store from './store/index.js'
	import { restorePatientTabBar } from './utils/tab-bar.js'

	export default {
		onLaunch() {
			store.init()
		},
		onShow() {
			// Return from WeChat background/camera without replacing the active page.
			restorePatientTabBar(store.getUserInfo())
		}
	}
</script>

<style>
	/* MedTalent健康数字助手全局视觉基线 */
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
