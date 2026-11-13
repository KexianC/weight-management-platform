# MedTalent 健康数字助手（减重管理平台）

包含 NestJS API、React 医护管理后台，以及 uni-app 患者/医护 H5 和微信小程序。此仓库交付可构建源码与数据库迁移；数据库、上传的业务资料、生产密钥和本机测试账号由部署方单独管理。

## 部署

从 [部署指南](docs/DEPLOY.md) 开始。推荐使用 `docker-compose.deploy.yml`，在 Linux 服务器上构建 API、后台和 H5，并通过自己的 HTTPS 域名提供服务。需要 Docker Compose、外部 MySQL、私有 OSS 与短信服务配置。首次管理员通过部署方自行设置的环境变量初始化。

```bash
git clone https://github.com/KexianC/weight-management-platform.git
cd weight-management-platform
cp .env.example .env
# 按 docs/DEPLOY.md 填写自己的域名、数据库和服务凭据
docker compose -f docker-compose.deploy.yml build
# 新数据库初始化前确认目标库；已有数据先备份并审核迁移
docker compose -f docker-compose.deploy.yml run --rm api npx prisma migrate deploy
docker compose -f docker-compose.deploy.yml up -d
```

配置未填写完整时，生产启动检查会拒绝启动。`docker-compose.yml` 与 `docker-compose.aliyun.yml` 是旧部署入口，第三方交付以 `docker-compose.deploy.yml` 和部署指南为准。仓库若为私有，下载者需要仓库访问权限。

## 目录

| 目录 | 用途 |
| --- | --- |
| `apps/api` | NestJS、Prisma、认证、健康记录、随访、报告、营养和活动业务 |
| `apps/clinician-admin` | 医护管理后台 |
| `apps/mini-program` | 正式 uni-app H5 / 微信小程序 |
| `apps/patient-mobile` | 早期患者端视觉参考，非当前正式入口 |
| `deploy` | 容器构建与 Nginx 配置 |
| `docs/DEPLOY.md` | 配置、迁移、首次管理员、HTTPS、小程序构建与回滚 |

## 客户专属每日填报

工作人员在客户档案的「每日填报」中查看固定专属链接、复制群通知文案或下载二维码。负责该客户的健管师、医生可管理入口；负责营养师可获取和分享链接、二维码，并按服务关系查看记录，重置和停用仍由负责健管师或医生操作。移动端健管师、医生和营养师客户详情也可复制链接、展示二维码。客户在浏览器或微信中打开链接即可填写，无需登录。仅体重必填，支持公斤/斤；腰围、运动分钟、饮水量、睡眠起止时间、三餐文字和照片，以及元气盏日常表中的疲劳、饥饿、食欲、睡眠质量、精力和排便信息均为选填。睡眠时长按跨夜时间计算，三餐分别记录并统计已填餐次，每餐最多3张10MiB以内的静态JPG/PNG/WebP照片。当天可以修改，每天仅维护一条填报及对应体重记录，腰围同步到同一记录，日期按北京时间计算。

部署需同时更新 API 与管理端网页，并应用新增迁移 `20261112090000_daily_check_in`。`DAILY_CHECK_IN_APP_URL` 指向管理端网页地址（不是 `/h5/` 小程序地址）；未设置时使用 `API_PUBLIC_URL` 的域名根地址。所有客户均可按需获取专属入口，无需加入元气盏活动。链接没有每日有效期；停用或重置后原链接、二维码失效，历史数据保留。链接持有人可以读写该客户当天填报，请只发到对应客户服务群。签名使用独立用途的 `JWT_ACCESS_SECRET` HMAC，轮换密钥后需重新获取并发送链接。

生活字段和餐食照片复用现有填报 JSON 与私有媒体表，无需额外数据库迁移。照片先校验专属链接再接收文件，并验证图片完整性和客户、日期、餐次归属；每天最多预留30次上传。公共照片地址10分钟有效，可刷新预览，链接重置、停用或提交移除照片后旧地址失效。工作人员仅能按现有客户权限读取已提交餐食照片，营养师的排便附加观察仍不展示。

## 开发和验证

使用 Node.js 22（建议 22.12 或更高）。各应用独立安装锁定依赖，不是根目录 workspace 安装：

```bash
npm --prefix apps/api ci
npm --prefix apps/api run prisma:generate
npm --prefix apps/clinician-admin ci
npm --prefix apps/mini-program ci
npm --prefix apps/api run build:release
npm --prefix apps/clinician-admin run build
npm --prefix apps/mini-program run build:h5
npm --prefix apps/mini-program run build:mp-weixin
```

前端编译前必须设置自己的 `VITE_API_BASE_URL`、`VITE_STORAGE_BASE_URL`。Docker 部署入口已显式传入根目录 `.env` 的构建参数；直接运行 npm 时需自行设置环境变量或应用内 `.env.production.local`。

微信小程序需使用部署方自己的 AppID、合法域名、隐私政策和协议主体。上传开发版、真机验收、平台审核和正式发布由部署方完成；源码上传不代表这些步骤已通过。OCR、短信、微信和对象存储等外部能力应使用部署方账号配置并验收。
