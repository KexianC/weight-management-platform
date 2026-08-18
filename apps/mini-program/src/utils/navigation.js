const DEFAULT_TOP_INSET = 10

export function resolveCustomNavigationLayout(windowInfo = {}, menuRect = null) {
	const statusBarHeight = Number(windowInfo.statusBarHeight) || 0
	const windowWidth = Number(windowInfo.windowWidth) || 0
	const hasMenuRect = menuRect
		&& Number(menuRect.width) > 0
		&& Number(menuRect.height) > 0
		&& Number(menuRect.left) >= 0

	if (!hasMenuRect) {
		return {
			topInset: statusBarHeight > 0 ? statusBarHeight + 8 : DEFAULT_TOP_INSET,
			rightInset: 0
		}
	}

	return {
		topInset: Math.max(Number(menuRect.bottom) + 8, statusBarHeight + Number(menuRect.height) + 12),
		rightInset: 0
	}
}

export function getCustomNavigationLayout() {
	let windowInfo = {}
	let menuRect = null

	try {
		windowInfo = typeof uni.getWindowInfo === 'function'
			? uni.getWindowInfo()
			: uni.getSystemInfoSync()
	} catch (error) {
		windowInfo = {}
	}

	try {
		if (typeof uni.getMenuButtonBoundingClientRect === 'function') {
			menuRect = uni.getMenuButtonBoundingClientRect()
		}
	} catch (error) {
		menuRect = null
	}

	return resolveCustomNavigationLayout(windowInfo, menuRect)
}
