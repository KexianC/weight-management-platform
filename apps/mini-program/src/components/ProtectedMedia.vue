<template>
  <view v-if="asset" class="protected-overlay" @tap.self="$emit('close')">
    <view class="protected-panel">
      <view class="protected-bar"><text>授权资料预览</text><button @tap="$emit('close')">关闭</button></view>
      <text v-if="error" class="protected-error">{{ error }}</text>
      <text v-else-if="!file">正在校验权限并读取…</text>
      <video v-else-if="asset.mimeType?.startsWith('video/')" :src="file" controls class="protected-video" />
      <template v-else-if="asset.mimeType === 'application/pdf'">
        <!-- #ifdef H5 -->
        <iframe :src="file" title="授权PDF原件" class="protected-pdf" />
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <button @tap="openPdf">在文档阅读器打开PDF</button>
        <!-- #endif -->
      </template>
      <image v-else-if="file" :src="file" mode="widthFix" class="protected-image" />
      <button v-if="error" @tap="load">重新校验</button>
    </view>
  </view>
</template>
<script>
import { resolveMediaFile, releaseMediaFile } from '../utils/media-access.js'
export default {
  props: { asset: Object }, emits: ['close'], data: () => ({ file: '', error: '', attempt: 0 }),
  watch: { asset: { immediate: true, handler() { this.load() } } },
  beforeUnmount() { this.attempt++; releaseMediaFile(this.file); this.file = '' },
  methods: {
    async load() {
      const request = ++this.attempt; releaseMediaFile(this.file); this.file = ''; this.error = ''
      if (!this.asset?.id) return
      try { const file = await resolveMediaFile(this.asset.id); if (request !== this.attempt) releaseMediaFile(file); else this.file = file }
      catch (e) { if (request === this.attempt) this.error = e.message || '附件不可用' }
    },
    openPdf() { uni.openDocument({ filePath: this.file, fileType: 'pdf', showMenu: false, fail: () => { this.error = '当前设备无法打开PDF，请使用支持的阅读器' } }) }
  }
}
</script>
<style scoped>
.protected-overlay{position:fixed;inset:0;background:rgba(14,33,44,.65);z-index:1200;padding:20px 12px calc(20px + env(safe-area-inset-bottom));box-sizing:border-box;display:flex;align-items:center;justify-content:center}
.protected-panel{background:#fff;border-radius:14px;width:100%;max-width:540px;max-height:90vh;overflow:auto;padding:12px;box-sizing:border-box}
.protected-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;background:#fff;z-index:2;padding-bottom:10px}
.protected-bar button,.protected-panel>button{min-height:44px;display:flex;align-items:center;justify-content:center;margin:0;font-size:14px;padding:0 16px}
.protected-image,.protected-video,.protected-pdf{width:100%;display:block}.protected-video{height:260px}.protected-pdf{height:68vh;border:0}.protected-error{display:block;color:#9c3039;overflow-wrap:anywhere;padding:20px 0}
</style>
