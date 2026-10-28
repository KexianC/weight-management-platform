<template>
  <view class="policy-page" :style="{ paddingTop: navigationTopInset + 'px' }">
    <view class="navigation"><button class="back" @tap="goBack">返回</button><text>隐私政策</text></view>
    <view class="brand-lockup"><image class="brand-logo" src="/static/logo.png" alt="MedTalent健康数字助手" aria-label="MedTalent健康数字助手" mode="aspectFit" /><text>MedTalent健康数字助手</text></view>
    <text class="policy-title">隐私政策</text>
    <text class="updated">版本：2026-10-13 · 生效日期：2026年10月13日</text>
    <view class="section"><text class="section-title">运营主体与适用范围</text><text class="section-body">MedTalent健康数字助手由木吾木同(杭州)医疗管理有限公司运营并负责本服务个人信息处理。客服电话及隐私权益联系渠道：13456725720。本服务仅面向成年人。版本：2026-10-13；生效日期：2026年10月13日。</text></view>
    <view class="section"><text class="section-title">账号与登录</text><text class="section-body">患者账号由健康管理师建档后提供，不开放患者自行注册。为核对已开通账号，我们处理姓名、手机号及账号状态。密码经不可逆哈希存储；登录安全需要处理会话令牌、登录时间、网络地址和必要的安全审计记录。您可选择手机号和密码登录；选择短信验证码时，仅向该手机号发送登录所需验证码。选择微信授权手机号登录时，仅在您主动点击并授权后，由微信服务向本服务核验手机号；不因此创建新患者账号、不要求绑定微信身份，不更改已有密码或档案。拒绝或取消授权时可继续使用密码登录。</text></view>
    <view class="section"><text class="section-title">健康信息及处理目的</text><text class="section-body">为提供您购买的健康管理服务，我们按您提交的内容处理生活习惯问卷、套餐和服务人员分配、体重及围度、人体成分、睡眠、运动、饮食文字和食物明细、热量与来源、餐食图片、体态图片、医学和运动评估报告、知情同意资料、随访记录以及专业人员点评和您的回复。这些健康资料及签名等可能属于敏感个人信息，请仅上传服务所需内容，避免无关身份信息。我们将其用于记录、人工评估、沟通和向本人提供报告，不用于公开展示或广告。</text></view>
    <view class="section"><text class="section-title">相机、相册与文件</text><text class="section-body">相机、相册及文件能力仅在您主动拍照、选图、选择报告或查看下载的原件时使用，并由微信按平台规则请求相应授权。餐食支持只填文字或食物明细，不强制上传照片；拒绝相机或相册授权仍可使用无需拍摄的功能。原件的上传、预览和下载均校验登录状态及归属。</text></view>
    <view class="section"><text class="section-title">岗位权限与报告分享</text><text class="section-body">患者仅查看本人资料。健康管理师按健康管理职责查看客户资料，医生按授权服务关系查看业务信息；营养师仅查看所分配客户的脱敏业务资料，不向其提供手机号、元气盏打卡以外可识别人脸的体态原图、医学原件或原始签字同意书。对于元气盏活动，当前有效绑定的营养师可只读查看该客户逐日打卡回答及舌苔、舌底、面部、体态照片，姓名隐藏；解除绑定后不可继续读取，此权限不扩展至其他医学原件和签字同意书。运动老师仅查看分配客户服务所必需的体态资料，并保护无关身份信息。运动处方由人员人工编写、营养师复核。报告分享仅供归属患者登录读取，有效期可选1、7、14或30天并可撤销，不是健康数据长期公开链接；撤销分享不删除原件。</text></view>
    <view class="section"><text class="section-title">服务提供方与数据去向</text><text class="section-body">微信手机号核验由腾讯微信提供，处理您主动授权的手机号核验凭证。短信验证码由阿里云短信服务处理手机号及验证码发送所需内容。服务器、数据库和原件使用境内阿里云基础设施。百炼视觉识别服务已配置，但当前仅开放指定合成测试样本，真实客户照片不发送到该第三方。若将来开放真实资料的第三方识别，将先告知范围、用途和提供方并取得所需授权。客户端未使用广告或第三方行为追踪 SDK；不将您上传的健康数据用于模型训练。</text></view>
    <view class="section"><text class="section-title">人工核对与识别</text><text class="section-body">热量参考估算与人工填写分别标注来源。识别功能按实际配置显示状态；识别输出为可编辑草稿，须人工核对后保存，不自动覆盖历史记录。估算或识别结果可能不准确，不能替代专业评估。</text></view>
    <view class="section"><text class="section-title">保存、注销与删除申请</text><text class="section-body">为保留连续健康管理历史，业务记录和原件长期保存；页面切换、清理本地临时副本、撤销分享不会删除服务器原件。您可联系13456725720或您的健康管理师申请访问、更正、复制、撤回授权、注销账号或删除资料。经核验申请人身份后由工作人员处理；注销后健康资料按申请人工删除，当前没有即时自动删除功能。对依法需要保留的资料或备份中的资料，将向您说明适用范围及处理安排，不将不能立即清除的资料继续用于正常业务。本政策不另设未经确认的固定保存期限。撤回同意不影响撤回前基于有效同意进行的处理。</text></view>
    <view class="section"><text class="section-title">安全保护与政策更新</text><text class="section-body">我们通过身份验证、岗位及对象权限、字段脱敏、受限原件访问、备份及审计保护数据。请勿共享密码，使用完毕及时退出，设备或账号异常请联系上述电话。本政策变更时将在应用内告知；处理目的、方式或范围发生重大变化时取得所需授权。隐私争议或权益申请可通过13456725720联系运营主体。</text></view>
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
