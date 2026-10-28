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
