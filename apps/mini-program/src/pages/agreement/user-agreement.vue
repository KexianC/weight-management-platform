<template>
  <view class="policy-page" :style="{ paddingTop: navigationTopInset + 'px' }">
    <view class="navigation"><button class="back" @tap="goBack">返回</button><text>用户协议</text></view>
    <view class="brand-lockup"><image class="brand-logo" src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" mode="aspectFit" /><text>MedTalent健康数字助手</text></view>
    <text class="policy-title">用户协议</text>
    <text class="updated">版本：2026-10-13 · 生效日期：2026年10月13日</text>
    <view class="section"><text class="section-title">运营主体与服务对象</text><text class="section-body">本协议由木吾木同(杭州)医疗管理有限公司与MedTalent健康数字助手用户订立。客服电话：13456725720。仅服务成年人。版本：2026-10-13；生效日期：2026年10月13日。请在使用前阅读本协议及隐私政策。</text></view>
    <view class="section"><text class="section-title">账号与身份</text><text class="section-body">患者账号由健康管理师建档并提供，不开放自主注册。既有账号继续使用；首次改密和初始凭据有效期按账号实际设置执行。请使用本人获分配的账号，不共享、冒用或出售凭据。可选择手机号加密码、短信验证码或微信授权手机号登录；微信授权仅核对已开通患者账号，不自动注册、不改变档案或密码。审核用独立合成账号可使用密码登录，无须审核人员授权个人手机号。工作人员应使用专属工作人员入口和获授权的岗位账号。</text></view>
    <view class="section"><text class="section-title">服务内容与提交资料</text><text class="section-body">服务支持生活习惯问卷、体重与围度、睡眠、运动、饮食及热量来源记录、专业人员点评和回复、随访任务、人体成分、医学及运动评估报告、原件留档与受限分享。请提交真实且与服务有关的资料，勿上传他人资料、无关身份证明或违法内容。餐食可只填文字或食物，不要求必须拍照。</text></view>
    <view class="section"><text class="section-title">人工评估与健康边界</text><text class="section-body">运动老师人工制定跟练处方，营养师人工复核后向归属客户发送。参考热量估算、OCR草稿和报表统计存在误差，须核对，不自动作出诊疗决策，也不能替代医生诊断、治疗或紧急救助。对不适、异常或急症应及时联系专业医疗机构，不应依赖本应用等待处理。</text></view>
    <view class="section"><text class="section-title">资料访问与分享</text><text class="section-body">您仅能访问本人获授权的资料。报告和原件按岗位、对象及字段权限处理。分享需要归属患者登录，有效期1、7、14或30天，可撤销；分享撤销不删除原件，处方新版本须重新复核发送。请勿传播账号凭据、绕过权限或擅自转发其他客户资料。</text></view>
    <view class="section"><text class="section-title">套餐、费用与退款</text><text class="section-body">本小程序不提供支付入口。已购买健康管理套餐的服务内容、价格及退款事项，以双方另行确认的服务合同为准；本协议不另行设定收费、退款规则或自动续费。套餐、服务问题或争议可联系13456725720协商处理。</text></view>
    <view class="section"><text class="section-title">退出、注销与权益</text><text class="section-body">退出登录结束当前会话，不删除业务历史和原件。需要注销账号或申请删除健康资料时，请联系13456725720或健康管理师，由工作人员核验身份后人工处理；不承诺未实现的即时自动删除。具体处理方式见隐私政策。不得以删除申请为由删除其他客户资料。</text></view>
    <view class="section"><text class="section-title">服务安全与联系</text><text class="section-body">请保护设备和账号，发现未授权访问或数据错误及时联系运营主体。服务可能因必要维护或网络故障暂时不可用，异常时请保留草稿并联系服务人员。本协议更新将在应用内告知；您的法定权利不因本协议而受到限制。</text></view>
    <button class="return-button" @tap="goBack">返回上一页</button>
  </view>
</template>
<script>
import { getCustomNavigationLayout } from '../../utils/navigation.js'
export default {
  data() { return { navigationTopInset: 10 } },
  onLoad() { this.navigationTopInset = getCustomNavigationLayout().topInset },
  methods: {
    goBack() { uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/login/login' }) }) }
  }
}
</script>
<style scoped>
.policy-page { min-height: 100vh; padding: 24rpx 32rpx calc(48rpx + env(safe-area-inset-bottom)); background: #f4f9fb; color: #274b5f; }
.navigation { display: flex; align-items: center; gap: 24rpx; font-size: 32rpx; margin-bottom: 32rpx; }
.back { margin: 0; padding: 0 24rpx; font-size: 26rpx; background: white; color: #168fb5; }
.brand-lockup { display: flex; align-items: center; gap: 16rpx; font-size: 26rpx; color: #168fb5; }
.brand-logo { width: 64rpx; height: 64rpx; }
.policy-title,.policy-note,.updated,.section-title,.section-body { display: block; }
.policy-title { font-size: 38rpx; font-weight: 600; margin: 30rpx 0 20rpx; }
.policy-note { color: #805409; background: #fff3d8; padding: 20rpx; border-radius: 12rpx; font-size: 26rpx; line-height: 1.6; }
.updated { color: #71858f; font-size: 24rpx; margin: 18rpx 0 32rpx; }
.section { padding: 26rpx; background: #fff; margin-bottom: 24rpx; border-radius: 18rpx; }
.section-title { font-size: 30rpx; font-weight: 600; margin-bottom: 14rpx; }
.section-body { font-size: 27rpx; line-height: 1.9; overflow-wrap: anywhere; }
.return-button { color: white; background: #168fb5; margin-top: 32rpx; font-size: 28rpx; }
</style>

<style scoped>
/* Keep actions usable after the shared font reset, including narrow screens. */
.policy-page button { min-height: 44px; display: flex; align-items: center; justify-content: center; padding: 10px 16px; line-height: 1.5; font-size: 14px; border-radius: 8px; }
.policy-page .back { min-width: 64px; flex-shrink: 0; }
.policy-page .return-button { width: 100%; }
</style>
