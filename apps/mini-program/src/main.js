import App from './App'
import store from './store/index.js'
import { createPatientTabBarLifecycle } from './utils/tab-bar.js'

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'
Vue.config.productionTip = false
Vue.mixin(createPatientTabBarLifecycle(() => store.getUserInfo()))
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
export function createApp() {
  const app = createSSRApp(App)
  app.mixin(createPatientTabBarLifecycle(() => store.getUserInfo()))
  return {
    app
  }
}
// #endif