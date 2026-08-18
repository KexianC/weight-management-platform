# 阿里云部署与上线验收

## 推荐拓扑

- ECS 2 核 4GB 起步，运行 API 与 Nginx 容器。
- RDS MySQL 8.0/8.4 作为业务库，仅开放 VPC 白名单。
- OSS 私有桶保存随访图片；RAM 用户只授予目标前缀的读写删除权限。
- 短信服务和微信小程序凭据通过环境变量或 KMS/Secrets Manager 注入。
- ALB/SLB 或阿里云 CDN 终止 TLS，再把 HTTP 转发到本仓库默认 Nginx 80 端口。
- H5 静态产物可部署到独立 Nginx 站点或 OSS + CDN；PC 管理后台由默认 Nginx 根目录提供。

`docker-compose.yml` 默认不伪装提供 TLS，也不把 MySQL 端口暴露公网。阿里云生产配置通过 `DATABASE_URL` 连接 VPC 内的 RDS，不启动内置数据库容器。443 证书应在真实域名和证书就绪后由 ALB/SLB 或单独的生产 Nginx 配置承担。

## 构建

先创建生产环境文件并执行不回显密钥的预检。预检会拒绝本机/RDS 占位地址、HTTP 公网地址、重复或过短密钥、默认管理员密码、演示 seed、任何 Redis 配置，以及不完整的短信/微信/OSS 配置。

```bash
cp .env.example .env
chmod 600 .env
# 填写真实 RDS、RAM、短信、微信和 OSS 参数后执行：
node apps/api/scripts/preflight-production.mjs --env-file .env
```

三个前端的生产 API 地址分别固化在各自的 `.env.production`，当前均为 `https://kxjzapi.hzmwmt.cn/api/v1`。修改域名时必须同时修改根 `.env` 的 `VITE_API_BASE_URL/VITE_STORAGE_BASE_URL` 和这些前端文件；预检会校验一致性。

```bash
npm --prefix apps/api ci
npm --prefix apps/api run build
npm --prefix apps/clinician-admin ci
npm --prefix apps/clinician-admin run build
npm --prefix apps/mini-program ci
npm --prefix apps/mini-program run build:h5
npm --prefix apps/mini-program run build:mp-weixin
docker compose build api
```

微信开发者工具上传 `apps/mini-program/dist/build/mp-weixin`。H5 目录为 `apps/mini-program/dist/build/h5`。

构建后禁止产物包含本机或明文生产 API：

```bash
if grep -R -E "127\\.0\\.0\\.1:3000|localhost:3000|http://kxjzapi\\.hzmwmt\\.cn" \
  apps/clinician-admin/dist apps/patient-mobile/dist apps/mini-program/dist; then
  echo "frontend artifact contains a forbidden API origin" >&2
  exit 1
fi
```

## 必填配置

从 `.env.example` 创建仅服务器可读的 `.env`，至少配置：

- `DATABASE_URL`：RDS 内网地址，数据库账号只授予应用 schema 权限。
- `NODE_ENV=production`、不可复用的 `RELEASE_TAG`：发布标签禁止使用 `latest/local/dev`，用于应用回滚。
- `JWT_ACCESS_SECRET`、`SMS_CODE_PEPPER`、`MEDIA_SIGNING_SECRET`、`REMINDER_CRON_SECRET`：互不相同，至少 32 个随机字符。
- `JWT_ISSUER`、`JWT_AUDIENCE`、`CORS_ORIGINS`、`API_PUBLIC_URL`：使用正式域名。
- 短信二选一：完整配置 `ALIBABA_CLOUD_ACCESS_KEY_ID/SECRET + ALIYUN_SMS_SIGN_NAME/TEMPLATE_CODE`，或完整配置 `SMS_DELIVERY_WEBHOOK_URL/TOKEN`。缺少任一组时容器拒绝启动。
- `WECHAT_MINI_APP_ID/SECRET`：仅启用小程序微信登录时配置，两个值必须同时提供；只保存在服务端，不写入小程序包。未部署小程序端时可以留空，微信登录接口会保持不可用，但不阻断 API、后台和 H5 启动。
- `PRACTITIONER_REGISTRATION_CODES`：医护自助注册邀请码；不配置即关闭医护自助注册。
- `OSS_REGION/ENDPOINT/BUCKET/ACCESS_KEY_ID/ACCESS_KEY_SECRET`：建议使用 RAM 用户和私有桶。
- `DEFAULT_ADMIN_USERNAME/PASSWORD`：可选；两者必须同时配置，生产密码至少 16 位且不得使用默认值。不配置时不会创建任何默认管理员。

不要在生产环境设置 `ALLOW_DEMO_SEED=true`，也不要加入任何 `REDIS*` 变量。本项目生产运行仅依赖 MySQL；演示 seed 只用于隔离的本地/验收库。

## 备份与迁移演练

1. 在 RDS 控制台创建发布前手工快照，记录快照 ID、库实例 ID和时间点；没有可恢复快照不得执行迁移。
2. 在同版本的 RDS 克隆实例执行 `npm --prefix apps/api run prisma:migrate`，再运行 API 测试和核心接口冒烟，记录迁移耗时。
3. 额外生成逻辑备份（命令中的账号、地址由运维安全注入，不要写入仓库）：

```bash
mkdir -p /opt/kxjz-backups
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF \
  -h <rds-private-host> -u <backup-user> -p weightcare \
  | gzip > /opt/kxjz-backups/weightcare-before-${RELEASE_TAG}.sql.gz
test -s /opt/kxjz-backups/weightcare-before-${RELEASE_TAG}.sql.gz
tar -C apps/clinician-admin -czf /opt/kxjz-backups/admin-before-${RELEASE_TAG}.tgz dist
```

当前患者档案迁移只新增表、字段和索引，旧应用可忽略它们；仍须先在克隆库验证，不能把“Prisma 可生成”当作生产迁移已验证。

## 部署

当前 `kxjz.hzmwmt.cn` 拓扑由宝塔 Nginx 提供 TLS 与后台静态文件，API 容器只监听回环地址 `127.0.0.1:13000`：

```bash
node apps/api/scripts/preflight-production.mjs --env-file .env
docker compose --env-file .env -f deploy/docker-compose.remote.yml build --pull api
docker compose --env-file .env -f deploy/docker-compose.remote.yml run --rm --no-deps api \
  sh -c 'node scripts/preflight-production.mjs && npm run prisma:migrate'
docker compose --env-file .env -f deploy/docker-compose.remote.yml up -d --no-build api
docker compose --env-file .env -f deploy/docker-compose.remote.yml ps
curl -fsS http://127.0.0.1:13000/api/v1/health
curl -fsS http://127.0.0.1:13000/api/v1/health/ready
curl -fsS https://kxjzapi.hzmwmt.cn/api/v1/health/ready
curl -fsSI https://kxjz.hzmwmt.cn/
```

若改用仓库内全容器 Nginx 拓扑，则执行：

```bash
docker compose --env-file .env -f docker-compose.aliyun.yml up -d --build
docker compose --env-file .env -f docker-compose.aliyun.yml ps
curl -fsS http://127.0.0.1/api/v1/health/ready
```

API 容器启动时执行 `prisma migrate deploy`；失败会阻止应用启动。首次发布前仍应在 RDS 克隆库先跑同一迁移并记录耗时。

## 回滚

- 应用回滚：保留每个不可变 `RELEASE_TAG` 的本地镜像。异常时用上一标签重新创建 API，不重新执行破坏性 SQL：

```bash
RELEASE_TAG=<previous-release-tag> docker compose --env-file .env \
  -f deploy/docker-compose.remote.yml up -d --no-build api
curl -fsS http://127.0.0.1:13000/api/v1/health/ready
```

- 后台静态文件回滚：将 `/opt/kxjz-backups/admin-before-<release>.tgz` 解压到单独目录，验证后再原子切换 Nginx `root` 或发布软链接并执行 `nginx -t && nginx -s reload`。
- 数据库回滚：大多数迁移为向前兼容的加法迁移；`20260818130000_multi_role_phone_accounts` 会把手机号唯一约束改为“手机号 + 角色”。产生同手机号多身份数据后，不可直接回滚到只按手机号查询的旧应用，也不可恢复旧唯一索引。需要回滚应用时，应保留新版身份解析逻辑；只有确认数据层损坏时，才从 RDS 快照恢复到新实例，完成对账后切换 `DATABASE_URL`，直接覆盖原实例会丢失发布后的写入。

配置阿里云定时任务每 15–30 分钟调用：

```text
POST https://api.example.com/api/v1/internal/reminders/run
X-Cron-Secret: <REMINDER_CRON_SECRET>
```

## 上线验收

1. 患者、医生、营养师三种账号登录，refresh token 轮换与退出生效。
2. 患者预览邀请码时不产生关系；确认后医生移动端和 PC 同时出现该患者。
3. 患者新增体重、早餐/午餐/晚餐/加餐，报告和医护详情同步更新。
4. 医护创建单次与重复随访；开始后患者仍能提交；体重随访只生成一条健康记录。
5. 双向消息、未读、通知深链、附件私有 URL 在两台设备验证。
6. 患者 A/B、医生 A/B 做 IDOR 矩阵；解绑后新消息和临床写入立即返回 403。
7. 对真实导出执行数量与抽样对账；验证旧 PBKDF2 首次登录自动升级及旧 SHA-256 用户短信重置。
8. 演练 RDS 恢复、OSS 生命周期/删除、日志脱敏、密钥轮换和回滚。

完成上述外部配置与真实环境验收前，仓库只能称为“具备部署配置”，不能称为已经完成生产发布。
