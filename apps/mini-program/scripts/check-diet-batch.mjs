import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { reactive, computed, effect, stop } from 'vue'

// Execute the actual SFC methods with isolated, synthetic dependencies. No API,
// media server, login credentials, or real patient records are used here.
const root = resolve(import.meta.dirname, '..')
const model = await import(`data:text/javascript;base64,${Buffer.from(readFileSync(resolve(root, 'src/utils/record-model.js'), 'utf8')).toString('base64')}`)
const source = readFileSync(resolve(root, 'src/pages/patient/record.vue'), 'utf8')
const { descriptor, errors } = parse(source)
assert.deepEqual(errors, [])
compileScript(descriptor, { id: 'synthetic-diet-batch' })
assert.deepEqual(compileTemplate({ id: 'synthetic-diet-batch', source: descriptor.template.content, filename: 'record.vue' }).errors, [])
const script = descriptor.script.content.replace(/^import .*$/gm, '').replace('export default', 'const page =')
const openedRecord = {
  id: 'synthetic-existing-meal', mealType: 'DINNER', recordDate: '2026-10-19', mealTime: '18:30',
  note: '虚构历史晚餐', mealItems: [{ name: '虚构历史食物', caloriesKcal: 80 }],
  imageAssetIds: ['synthetic-saved-photo'], caloriesSource: 'MANUAL', caloriesKcal: 100,
  updatedAt: '2026-10-19T11:00:00.000Z'
}
const harnesses = []
function harness(options = {}) {
  const calls = [], uploads = [], releases = [], messages = [], estimates = [], imageChoices = [], failures = { ...(options.failMeals || {}) }
  let account = 'synthetic-account-a'
  const store = { isLogin: () => true, getUserInfo: () => ({ id: account, height: 165 }) }
  const uni = {
    showToast: value => messages.push(value.title), showModal: value => value.success({ confirm: true }),
    pageScrollTo() {}, getStorageSync: () => '', removeStorageSync() {}, reLaunch() {},
    previewImage() {}, chooseImage: request => imageChoices.push(request)
  }
  const deps = {
    ...model, store, uni,
    createHealthRecord: async payload => {
      calls.push({ kind: 'create', payload: structuredClone(payload) })
      if (failures[payload.mealType] > 0) { failures[payload.mealType]--; throw new Error('虚构可重试失败') }
      return { code: 200, data: { id: `synthetic-${payload.mealType}` } }
    },
    updateHealthRecord: async (id, payload) => { calls.push({ kind: 'update', id, payload: structuredClone(payload) }); return { code: 200 } },
    getHealthRecord: async () => ({ code: 200, data: structuredClone(openedRecord) }),
    getHealthRecords: async () => ({ code: 200, data: [] }), getDietPlans: async () => ({ code: 200, data: [] }),
    deleteHealthRecord: async () => ({ code: 200 }), replyToRecordReview: async () => ({ code: 200 }),
    upload: async path => { uploads.push(path); return { code: 200, data: { id: `synthetic-uploaded-${path}` } } },
    resolveMediaFile: async id => `synthetic-authorized-${id}`, releaseMediaFile: path => releases.push(path),
    calculateCaloriesWithAI: async (...args) => {
      estimates.push(args)
      if (options.estimate) return options.estimate(...args)
      return { code: 200, data: { calories: Number(args[1]) * 1.5, source: 'COMMON_FOOD_DATABASE' } }
    }
  }
  const page = new Function('deps', `const { ${Object.keys(deps).join(',')} } = deps; ${script}; return page;`)(deps)
  const state = { ...page.data() }
  const vm = options.reactive ? reactive(state) : state
  vm.$refs = {}
  for (const [key, fn] of Object.entries(page.methods)) vm[key] = fn.bind(vm)
  for (const [key, fn] of Object.entries(page.computed || {})) {
    const value = options.reactive ? computed(() => fn.call(vm)) : null
    Object.defineProperty(state, key, { get: () => value ? value.value : fn.call(vm) })
  }
  vm.$nextTick = async fn => fn?.()
  vm.accountId = account
  vm.activeTab = 'diet'
  vm.loadHistory = async () => {}
  // Store what a Vue render effect observed, so raw mutations cannot pass by
  // reading vm.photos again after the callback has already skipped invalidation.
  const renders = []
  const renderEffect = options.reactive ? effect(() => renders.push({
    mealType: vm.diet.mealType, photoCount: vm.photos.length,
    photoPaths: vm.photos.map(photo => photo.path),
    pendingMealCount: vm.pendingMealCount, photoError: vm.photoError
  })) : null
  const result = { vm, page, calls, uploads, releases, messages, estimates, imageChoices, renders,
    dispose: () => { if (renderEffect) stop(renderEffect); vm.cancelMealEstimate() },
    setAccount: value => { account = value } }
  harnesses.push(result)
  return result
}
const photo = name => ({ key: name, path: `synthetic-local-${name}`, assetId: '' })
const formEvent = fields => ({ detail: { value: { note: '', foodName: '', foodWeightGrams: '', foodCaloriesKcal: '', mealCaloriesKcal: '', ...fields } } })
const created = h => h.calls.filter(call => call.kind === 'create')
function assertBlank(vm, meal) {
  assert.equal(vm.diet.mealType, meal)
  assert.equal(vm.diet.note, '', `${meal} must open a separate blank text field`)
  assert.deepEqual(vm.diet.mealItems, [])
  assert.equal(vm.draftFood.name, '')
  assert.equal(vm.draftFood.weightGrams, '')
  assert.equal(vm.draftFood.caloriesKcal, '')
  assert.equal(vm.diet.calories, '')
  assert.deepEqual(vm.photos, [])
  assert.deepEqual(vm.estimateCache, {})
}

let failed = 0
async function check(name, run) {
  const start = harnesses.length
  try { await run(); console.log(`PASS ${name}`) }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`) }
  finally { for (const h of harnesses.slice(start)) h.dispose() }
}

await check('meal tabs retain independent text, unadded food, photos, manual totals, and estimate caches', async () => {
  const { vm } = harness()
  vm.diet.note = '虚构早餐文字'
  vm.diet.date = '2026-10-19'; vm.diet.time = '08:20'; vm.diet.calories = '350'
  vm.diet.mealItems = [{ name: '虚构已添加早餐食物', caloriesKcal: 120 }]
  vm.draftFood = { name: '虚构未添加早餐食物', weightGrams: '100', caloriesKcal: '' }
  vm.photos = [photo('breakfast')]
  const breakfastKey = model.foodEstimateKey(vm.draftFood)
  vm.estimateCache = { [breakfastKey]: { status: 'matched', caloriesKcal: 150, source: 'COMMON_FOOD_DATABASE' } }
  vm.switchMeal('LUNCH')
  assertBlank(vm, 'LUNCH')
  vm.diet.note = '虚构午餐文字'; vm.diet.time = '12:10'
  vm.draftFood = { name: '虚构未添加午餐食物', weightGrams: '200', caloriesKcal: '' }
  vm.photos = [photo('lunch')]
  const lunchKey = model.foodEstimateKey(vm.draftFood)
  vm.estimateCache = { [lunchKey]: { status: 'matched', caloriesKcal: 300, source: 'COMMON_FOOD_DATABASE' } }
  vm.switchMeal('DINNER'); assertBlank(vm, 'DINNER')
  vm.switchMeal('BREAKFAST')
  assert.equal(vm.diet.note, '虚构早餐文字'); assert.equal(vm.diet.time, '08:20'); assert.equal(vm.diet.date, '2026-10-19')
  assert.equal(vm.diet.calories, '350'); assert.equal(vm.diet.mealItems[0].name, '虚构已添加早餐食物')
  assert.equal(vm.draftFood.name, '虚构未添加早餐食物'); assert.equal(vm.photos[0].path, 'synthetic-local-breakfast')
  assert.equal(vm.estimateCache[breakfastKey].caloriesKcal, 150); assert.equal(vm.estimateCache[lunchKey], undefined)
  vm.switchMeal('LUNCH')
  assert.equal(vm.diet.note, '虚构午餐文字'); assert.equal(vm.diet.time, '12:10'); assert.equal(vm.diet.calories, '')
  assert.equal(vm.draftFood.name, '虚构未添加午餐食物'); assert.equal(vm.photos[0].path, 'synthetic-local-lunch')
  assert.equal(vm.calorieSummary.caloriesKcal, 300); assert.equal(vm.estimateCache[breakfastKey], undefined)
})

await check('one submit creates all three distinct meals and skips a blank snack', async () => {
  const h = harness(), { vm } = h
  for (const [meal, label, calories] of [['BREAKFAST', '早餐', 100], ['LUNCH', '午餐', 200], ['DINNER', '晚餐', 300]]) {
    vm.switchMeal(meal)
    vm.diet.note = `虚构${label}`
    vm.draftFood = { name: `虚构${label}未添加食物`, weightGrams: '100', caloriesKcal: String(calories) }
    vm.photos = [photo(meal)]
  }
  vm.switchMeal('SNACK'); assertBlank(vm, 'SNACK')
  await vm.saveAllDiet(formEvent({}))
  const writes = created(h)
  assert.equal(writes.length, 3)
  assert.deepEqual(writes.map(c => c.payload.mealType).sort(), ['BREAKFAST', 'DINNER', 'LUNCH'])
  assert.equal(h.uploads.length, 3)
  for (const [meal, label, calories] of [['BREAKFAST', '早餐', 100], ['LUNCH', '午餐', 200], ['DINNER', '晚餐', 300]]) {
    const payload = writes.find(c => c.payload.mealType === meal).payload
    assert.equal(payload.note, `虚构${label}`)
    assert.equal(payload.mealItems.length, 1)
    assert.equal(payload.mealItems[0].name, `虚构${label}未添加食物`)
    assert.equal(payload.caloriesKcal, calories)
    assert.deepEqual(payload.imageAssetIds, [`synthetic-uploaded-synthetic-local-${meal}`])
    assert.match(payload.idempotencyKey, /^[A-Za-z0-9_-]{16,80}$/)
  }
  assert.equal(new Set(writes.map(c => c.payload.idempotencyKey)).size, 3, 'each meal has its own idempotency key')
  await vm.saveAllDiet()
  assert.equal(created(h).length, 3, 'another submit must not repeat meals already confirmed saved')
})

await check('the final submit reads current native form values before saving the active meal', async () => {
  const h = harness(), { vm } = h
  vm.diet.note = '虚构早餐'; vm.switchMeal('LUNCH')
  vm.diet.note = '旧表单文字'; vm.diet.calories = 999
  vm.draftFood = { name: '旧食物', weightGrams: 100, caloriesKcal: 999 }
  await vm.saveAllDiet(formEvent({ note: '当前午餐文字', foodName: '当前午餐食物', foodWeightGrams: '100' }))
  const lunch = created(h).find(c => c.payload.mealType === 'LUNCH')?.payload
  assert.ok(lunch, 'active lunch must be included')
  assert.equal(lunch.note, '当前午餐文字'); assert.equal(lunch.mealItems[0].name, '当前午餐食物')
  assert.equal(lunch.caloriesKcal, 150); assert.equal(lunch.caloriesSource, 'ESTIMATE')
})

await check('switching immediately after typing captures native values before delayed v-model updates', async () => {
  const { vm } = harness()
  vm.diet.note = '尚未更新的旧文字'; vm.diet.calories = 999
  vm.draftFood = { name: '旧食物', weightGrams: 1, caloriesKcal: 999 }
  const fields = {
    dietNoteInput: '刚输入的完整早餐文字', foodNameInput: '刚输入的早餐食物',
    foodWeightInput: '180', foodCaloriesInput: '250', mealCaloriesInput: ''
  }
  vm.$refs = Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, { $el: { querySelector: () => ({ value }) } }]))
  vm.switchMeal('LUNCH')
  assertBlank(vm, 'LUNCH')
  vm.$refs = {} // Native nodes would have re-rendered to the new empty meal.
  vm.switchMeal('BREAKFAST')
  assert.equal(vm.diet.note, '刚输入的完整早餐文字')
  assert.equal(vm.draftFood.name, '刚输入的早餐食物')
  assert.equal(vm.draftFood.weightGrams, '180'); assert.equal(vm.draftFood.caloriesKcal, '250')
  assert.equal(vm.diet.calories, '', 'clearing the native manual total must also survive a meal switch')
})

await check('every nonblank meal is validated before any upload or record write', async () => {
  const h = harness(), { vm } = h
  vm.diet.note = '虚构有效早餐'; vm.photos = [photo('valid-breakfast')]
  vm.switchMeal('LUNCH')
  vm.draftFood = { name: '', weightGrams: '100', caloriesKcal: '' }
  await vm.saveAllDiet()
  assert.equal(created(h).length, 0, 'invalid lunch must prevent a partial breakfast write')
  assert.equal(h.uploads.length, 0, 'prevalidation also precedes media uploads')
  assert.equal(vm.draftFood.weightGrams, '100', 'the invalid input remains available for correction')
  vm.switchMeal('BREAKFAST'); assert.equal(vm.diet.note, '虚构有效早餐'); assert.equal(vm.photos.length, 1)
  vm.switchMeal('LUNCH'); vm.draftFood = { name: '虚构午餐', weightGrams: '', caloriesKcal: '-1' }
  await vm.saveAllDiet()
  assert.equal(created(h).length, 0, 'invalid calories in one meal must prevent all writes')
})

await check('partial failure retains failed meal and its key, reuses uploads, and never resends successful meals', async () => {
  const h = harness({ failMeals: { LUNCH: 1 } }), { vm } = h
  vm.diet.note = '虚构成功早餐'; vm.photos = [photo('retry-breakfast')]
  vm.switchMeal('LUNCH'); vm.diet.note = '虚构失败午餐'; vm.photos = [photo('retry-lunch')]
  vm.switchMeal('DINNER'); vm.diet.note = '虚构晚餐'
  await vm.saveAllDiet()
  const firstBreakfast = created(h).filter(c => c.payload.mealType === 'BREAKFAST')
  const firstLunch = created(h).find(c => c.payload.mealType === 'LUNCH')
  assert.equal(firstBreakfast.length, 1); assert.ok(firstLunch)
  assert.equal(vm.saving, false)
  vm.switchMeal('LUNCH')
  assert.equal(vm.diet.note, '虚构失败午餐'); assert.equal(vm.photos.length, 1)
  assert.ok(vm.photos[0].assetId, 'completed photo upload stays attached to the failed meal')
  await vm.saveAllDiet()
  assert.equal(created(h).filter(c => c.payload.mealType === 'BREAKFAST').length, 1)
  assert.equal(created(h).filter(c => c.payload.mealType === 'DINNER').length, 1)
  const lunches = created(h).filter(c => c.payload.mealType === 'LUNCH')
  assert.equal(lunches.length, 2)
  assert.equal(lunches[1].payload.idempotencyKey, firstLunch.payload.idempotencyKey)
  assert.equal(h.uploads.filter(path => path === 'synthetic-local-retry-lunch').length, 1)
  assert.notEqual(firstBreakfast[0].payload.idempotencyKey, firstLunch.payload.idempotencyKey)
  await vm.saveAllDiet(); assert.equal(created(h).length, 4)
})

await check('an unknown submission outcome retries its frozen payload even when the estimate cache later changes', async () => {
  const h = harness({ failMeals: { BREAKFAST: 1 }, estimate: async () => ({ code: 200, data: { source: 'GENERIC_ESTIMATE' } }) }), { vm } = h
  vm.diet.note = '虚构未知提交结果早餐'
  vm.draftFood = { name: '虚构未匹配食物', weightGrams: '100', caloriesKcal: '' }
  vm.photos = [photo('frozen-retry')]
  await vm.saveAllDiet()
  assert.equal(created(h).length, 1)
  const first = structuredClone(created(h)[0].payload)
  assert.equal(first.caloriesKcal, undefined); assert.equal(first.caloriesSource, 'UNKNOWN')
  const key = model.foodEstimateKey(vm.draftFood)
  vm.estimateCache[key] = { status: 'matched', caloriesKcal: 333, source: 'COMMON_FOOD_DATABASE' }
  await vm.saveAllDiet()
  assert.equal(created(h).length, 2)
  assert.deepEqual(created(h)[1].payload, first, 'same user input must retry the exact uncertain request payload and key')
  assert.equal(h.uploads.length, 1, 'frozen retry keeps its previously uploaded photo')
})

await check('canceling and saving a historical edit restore the pending multi-meal drafts', async () => {
  for (const action of ['cancel', 'save']) {
    const h = harness(), { vm } = h
    vm.diet.note = '虚构待提交早餐'; vm.draftFood.name = '虚构早餐食物'; vm.photos = [photo(`edit-breakfast-${action}`)]
    vm.switchMeal('LUNCH'); vm.diet.note = '虚构待提交午餐'; vm.draftFood.name = '虚构午餐食物'; vm.photos = [photo(`edit-lunch-${action}`)]
    await vm.editDiet({ id: openedRecord.id })
    assert.equal(vm.editingId, openedRecord.id); assert.equal(vm.diet.note, openedRecord.note)
    vm.diet.note = '虚构历史记录修改'
    if (action === 'cancel') await vm.cancelEdit()
    else await vm.saveDiet()
    assert.equal(vm.editingId, '')
    assert.equal(vm.diet.mealType, 'LUNCH'); assert.equal(vm.diet.note, '虚构待提交午餐')
    assert.equal(vm.draftFood.name, '虚构午餐食物'); assert.equal(vm.photos[0].path, `synthetic-local-edit-lunch-${action}`)
    vm.switchMeal('BREAKFAST'); assert.equal(vm.diet.note, '虚构待提交早餐'); assert.equal(vm.draftFood.name, '虚构早餐食物')
    assert.equal(vm.photos[0].path, `synthetic-local-edit-breakfast-${action}`)
    assert.equal(created(h).length, 0, 'editing history never posts the unsubmitted drafts')
    const updates = h.calls.filter(c => c.kind === 'update')
    assert.equal(updates.length, action === 'save' ? 1 : 0)
    if (action === 'save') { assert.equal(updates[0].id, openedRecord.id); assert.equal(updates[0].payload.expectedUpdatedAt, openedRecord.updatedAt) }
  }
})

await check('switching meals ignores an old meal estimate that resolves after the switch', async () => {
  let resolveEstimate
  const h = harness({ estimate: () => new Promise(resolve => { resolveEstimate = resolve }) }), { vm } = h
  vm.draftFood = { name: '虚构早餐估算食物', weightGrams: 100, caloriesKcal: '' }
  const pending = vm.estimateMealNow()
  assert.equal(typeof resolveEstimate, 'function')
  vm.switchMeal('LUNCH')
  resolveEstimate({ code: 200, data: { calories: 150, source: 'COMMON_FOOD_DATABASE' } })
  await pending
  assertBlank(vm, 'LUNCH')
})

await check('a late camera callback adds photos and errors only to its original meal and is discarded after an account change', async () => {
  const h = harness(), { vm } = h
  vm.choosePhotos()
  const breakfastSelection = h.imageChoices[0]
  vm.switchMeal('LUNCH')
  breakfastSelection.success({ tempFilePaths: ['synthetic-delayed-breakfast-photo'], tempFiles: [{ size: 1024 }] })
  assertBlank(vm, 'LUNCH')
  vm.switchMeal('BREAKFAST')
  assert.equal(vm.photos.length, 1); assert.equal(vm.photos[0].path, 'synthetic-delayed-breakfast-photo')
  vm.choosePhotos()
  const breakfastFailure = h.imageChoices[1]
  vm.switchMeal('DINNER')
  breakfastFailure.fail({ errMsg: 'synthetic camera permission denied' })
  assert.equal(vm.photoError, '', 'an old camera error must not appear in dinner')
  vm.switchMeal('BREAKFAST'); assert.match(vm.photoError, /相机|相册|权限/)
  vm.choosePhotos()
  const previousAccountSelection = h.imageChoices[2]
  h.setAccount('synthetic-account-b'); h.page.onShow.call(vm)
  previousAccountSelection.success({ tempFilePaths: ['synthetic-old-account-photo'], tempFiles: [{ size: 1024 }] })
  for (const meal of ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']) { vm.switchMeal(meal); assertBlank(vm, meal) }
})


await check('the first photo selection invalidates the Vue render after native picker hide/show', async () => {
  // Native album/camera pages may deliver success before or after onShow.
  for (const successBeforeShow of [false, true]) {
    const h = harness({ reactive: true }), { vm } = h
    vm.choosePhotos()
    h.page.onHide.call(vm)
    if (!successBeforeShow) h.page.onShow.call(vm)
    const renderCount = h.renders.length
    h.imageChoices[0].success({ tempFilePaths: ['synthetic-first-visible-photo'], tempFiles: [{ size: 1024 }] })
    assert.equal(vm.photos.length, 1, 'the selected file is present in the live draft')
    assert.ok(h.renders.length > renderCount, 'the first callback must invalidate the tracked render without another meal switch or selection')
    assert.deepEqual(h.renders.at(-1), {
      mealType: 'BREAKFAST', photoCount: 1, photoPaths: ['synthetic-first-visible-photo'],
      pendingMealCount: 1, photoError: ''
    })
    if (successBeforeShow) h.page.onShow.call(vm)
    assert.equal(h.renders.at(-1).photoCount, 1)
  }
})

await check('a late selection updates its original meal badge and render without leaking into the active meal', async () => {
  const h = harness({ reactive: true }), { vm } = h
  vm.choosePhotos()
  h.page.onHide.call(vm); h.page.onShow.call(vm)
  vm.switchMeal('LUNCH')
  const renderCount = h.renders.length
  h.imageChoices[0].success({ tempFilePaths: ['synthetic-late-reactive-breakfast'], tempFiles: [{ size: 1024 }] })
  assert.ok(h.renders.length > renderCount, 'an inactive meal photo must invalidate the pending-meal badge')
  assert.deepEqual(h.renders.at(-1), {
    mealType: 'LUNCH', photoCount: 0, photoPaths: [], pendingMealCount: 1, photoError: ''
  })
  assert.equal(vm.mealDrafts.BREAKFAST.photos.length, 1)
  vm.switchMeal('BREAKFAST')
  assert.deepEqual(h.renders.at(-1).photoPaths, ['synthetic-late-reactive-breakfast'])
  vm.choosePhotos()
  h.page.onHide.call(vm); h.page.onShow.call(vm)
  vm.switchMeal('DINNER')
  h.imageChoices[1].fail({ errMsg: 'synthetic permission denied' })
  assert.equal(h.renders.at(-1).photoError, '', 'a late error belongs to breakfast only')
  vm.switchMeal('BREAKFAST')
  assert.match(h.renders.at(-1).photoError, /相机|相册|权限/)
})

await check('picker errors and oversize photos reach the active Vue render, while cancellation leaves it blank', async () => {
  for (const outcome of ['permission', 'oversize', 'cancel']) {
    const h = harness({ reactive: true }), { vm } = h
    vm.choosePhotos()
    h.page.onHide.call(vm); h.page.onShow.call(vm)
    const request = h.imageChoices[0]
    if (outcome === 'oversize') request.success({ tempFilePaths: ['synthetic-oversize-photo'], tempFiles: [{ size: 10 * 1024 * 1024 + 1 }] })
    else request.fail({ errMsg: outcome === 'cancel' ? 'chooseImage:fail cancel' : 'synthetic permission denied' })
    const rendered = h.renders.at(-1)
    assert.equal(rendered.photoCount, 0)
    assert.equal(rendered.pendingMealCount, 0)
    if (outcome === 'cancel') assert.equal(rendered.photoError, '')
    else assert.match(rendered.photoError, outcome === 'oversize' ? /10MB/ : /相机|相册|权限/)
  }
})

await check('repeated native selections keep the visible photos reactive, removable, and capped at nine', async () => {
  const h = harness({ reactive: true }), { vm } = h
  for (let index = 0; index < 2; index++) {
    vm.choosePhotos()
    h.page.onHide.call(vm); h.page.onShow.call(vm)
    assert.equal(h.imageChoices[index].count, 9 - index)
    h.imageChoices[index].success({ tempFilePaths: ['synthetic-repeated-photo-' + index], tempFiles: [{ size: 1024 }] })
    assert.deepEqual(h.renders.at(-1).photoPaths, Array.from({ length: index + 1 }, (_, i) => 'synthetic-repeated-photo-' + i))
    assert.equal(h.renders.at(-1).pendingMealCount, 1)
  }
  vm.removePhoto(0)
  assert.deepEqual(h.renders.at(-1).photoPaths, ['synthetic-repeated-photo-1'])
  assert.ok(h.releases.includes('synthetic-repeated-photo-0'))
  vm.choosePhotos()
  h.page.onHide.call(vm); h.page.onShow.call(vm)
  h.imageChoices[2].success({ tempFilePaths: Array.from({ length: 10 }, (_, i) => 'synthetic-limit-photo-' + i), tempFiles: Array.from({ length: 10 }, () => ({ size: 1024 })) })
  assert.equal(h.renders.at(-1).photoCount, 9)
  assert.equal(h.renders.at(-1).pendingMealCount, 1)
})

await check('changing accounts clears active, inactive, and suspended edit drafts plus pending submissions', async () => {
  const h = harness(), { vm } = h
  vm.diet.note = '虚构账号甲早餐'; vm.photos = [photo('account-breakfast')]
  vm.switchMeal('LUNCH'); vm.diet.note = '虚构账号甲午餐'; vm.photos = [photo('account-lunch')]
  await vm.editDiet({ id: openedRecord.id })
  vm.pendingCreates = { 'DIET:BREAKFAST': { payload: { idempotencyKey: 'synthetic-account-a-only' } } }
  h.setAccount('synthetic-account-b')
  h.page.onShow.call(vm)
  assert.equal(vm.accountId, 'synthetic-account-b'); assert.equal(vm.editingId, '')
  assert.deepEqual(vm.pendingCreates, {})
  for (const meal of ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']) { vm.switchMeal(meal); assertBlank(vm, meal) }
  assert.ok(h.releases.includes('synthetic-local-account-breakfast'))
  assert.ok(h.releases.includes('synthetic-local-account-lunch'))
  assert.equal(created(h).length, 0)
})

if (failed) throw new Error(`${failed} diet batch regression check(s) failed`)
console.log('Diet batch regression passed: separate drafts, immediate native input, all-meal validation, three-meal submit, blank skip, partial/frozen retry, edit restoration, reactive first-picker rendering, repeated/error/late media callbacks, and account isolation.')
