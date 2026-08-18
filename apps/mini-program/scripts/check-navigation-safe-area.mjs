import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const navigationSource = fs.readFileSync(path.join(root, 'src/utils/navigation.js'), 'utf8')
const navigationModule = await import(`data:text/javascript;base64,${Buffer.from(navigationSource).toString('base64')}`)

const iphoneLayout = navigationModule.resolveCustomNavigationLayout(
	{ statusBarHeight: 47, windowWidth: 390 },
	{ top: 51, left: 295, width: 80, height: 32, bottom: 83, right: 375 }
)
assert.deepEqual(iphoneLayout, { topInset: 91, rightInset: 0 })

const androidLayout = navigationModule.resolveCustomNavigationLayout(
	{ statusBarHeight: 24, windowWidth: 360 },
	{ top: 30, left: 270, width: 78, height: 32, bottom: 62, right: 348 }
)
assert.deepEqual(androidLayout, { topInset: 70, rightInset: 0 })

const h5Layout = navigationModule.resolveCustomNavigationLayout({}, null)
assert.deepEqual(h5Layout, { topInset: 10, rightInset: 0 })

for (const relativePath of ['src/pages/patient/index.vue', 'src/pages/doctor/index.vue']) {
	const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
	assert.match(source, /getCustomNavigationLayout/)
	assert.match(source, /navigationTopInset/)
	assert.match(source, /navigationRightInset/)
}

console.log('navigation safe-area checks passed')
