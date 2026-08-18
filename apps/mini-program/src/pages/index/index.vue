<template>
  <view class="content">
    <view class="brand-card">
      <view class="logo-shell">
        <image class="logo" src="/static/logo.png" mode="aspectFit"></image>
      </view>
      <view class="text-area">
        <text class="title">{{ title }}</text>
        <text class="subtitle">专业体重管理与健康随访</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      title: '数字减重助手',
    }
  },
  onLoad() {},
  methods: {},
}
</script>

<style>
.content {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  box-sizing: border-box;
  background: linear-gradient(180deg, #e8f4f8 0%, #f7fbfd 58%, #ffffff 100%);
}

.brand-card {
  width: 100%;
  padding: 72rpx 44rpx;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.96);
  border: 1rpx solid rgba(46, 134, 171, 0.12);
  border-radius: 28rpx;
  box-shadow: 0 18rpx 48rpx rgba(31, 86, 109, 0.12);
}

.logo-shell {
  width: 160rpx;
  height: 160rpx;
  margin: 0 auto 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 36rpx;
  background: linear-gradient(135deg, #236f8e 0%, #7fc6d7 100%);
  box-shadow: 0 14rpx 32rpx rgba(31, 86, 109, 0.18);
}

.logo {
  height: 124rpx;
  width: 124rpx;
}

.text-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.title {
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 5rpx;
  color: #173b4d;
}

.subtitle {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #6b8390;
}
</style>
