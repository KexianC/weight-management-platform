# 第三方部署指南

本指南使用独立的 `docker-compose.deploy.yml`：API、PC 管理端、患者及工作人员 H5，连接部署者自己的外部 MySQL。Docker 构建同时生成两个前端，无需提交 `dist`。配置与业务数据由部署方自行提供。

公开仓库可直接克隆；向私有仓库镜像时，部署人员须先获得相应访问权限。本次上传不等于已经在目标服务器部署，Docker 实际构建、数据库连接及目标环境验收仍须执行以下步骤。

## 1. 获取代码

```sh
git clone --branch main https://github.com/KexianC/weight-management-platform.git
cd weight-management-platform
```

生产服务器需要 Docker Engine、Docker Compose v2、Git、可用 HTTPS 域名及宿主机 HTTPS 反向代理。数据库使用 MySQL 8.x，字符集 `utf8mb4`；阿里云 RDS 可使用与服务器互通的私网地址。数据库账号需拥有目标库的迁移建表权限。应用不依赖 Redis。

## 2. 填写独立环境配置

```sh
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，所有密码和密钥均由部署方生成或配置。可用 `openssl rand -hex 32` 分别生成随机秘密；四个秘密不能相同。不要直接沿用示例占位符。

同域部署示例（将域名换为自己的有效 HTTPS 域名）：

```dotenv
RELEASE_TAG=deploy-20261028-1
API_PUBLIC_URL=https://health.example.org
PATIENT_APP_URL=https://health.example.org/h5/
CORS_ORIGINS=https://health.example.org
VITE_API_BASE_URL=https://health.example.org/api/v1
VITE_STORAGE_BASE_URL=https://health.example.org
WEB_PORT=8080
```

还必须配置：

| 配置 | 要求 |
| --- | --- |
| `DATABASE_URL` | 自己的外部 MySQL 连接串，完整包含账号、密码、主机与库名。密码中的特殊字符须做 URL 编码。生产预检拒绝 `mysql`、`localhost`、`127.0.0.1` 主机名。 |
| `JWT_ACCESS_SECRET`、`SMS_CODE_PEPPER`、`MEDIA_SIGNING_SECRET`、`REMINDER_CRON_SECRET` | 四个不同的至少 32 字符随机秘密。 |
| `JWT_ISSUER`、`JWT_AUDIENCE` | 非空，沿用示例中的应用标识即可。 |
| 短信 | 完整填写阿里云 AK/Secret、签名、验证码模板；或成对填写 `SMS_DELIVERY_WEBHOOK_URL` 和至少 16 字符的 token。预检要求至少配置一种真实通道。 |
| OSS | 自己的私有 OSS `ENDPOINT`、`REGION`、`BUCKET`、`ACCESS_KEY_ID`、`ACCESS_KEY_SECRET`，运行账号需有相应对象访问权限。 |
| `DEFAULT_ADMIN_USERNAME`、`DEFAULT_ADMIN_PASSWORD` | 首次安装时成对设置；用户名 4–32 字符，密码 16–72 字符且不能使用默认弱口令。 |
| `ALLOW_DEMO_SEED` | 保持 `false`。不运行历史演示种子或导入生产数据脚本。 |

微信手机号登录需要自己的 `WECHAT_MINI_APP_ID` 与 `WECHAT_MINI_APP_SECRET`，两者成对配置。OCR 默认 `disabled`，没有配置云服务时保留人工录入；启用真实 OCR 需要单独完成服务配置与业务验收。随访短信模板、定时提醒和 Webhook 也应使用部署方自己的配置。`ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE` 必须填写自己账号已获批的随访模板；自定义模板还需填写 `ALIYUN_SMS_FOLLOWUP_TEMPLATE_PARAMS` 的 JSON 字段映射（允许字段参见 `.env.example`）。不启用直接随访短信时，显式设置 `ALIYUN_SMS_FOLLOWUP_TEMPLATE_CODE=`，避免使用代码内保留的历史默认模板。

所有 `VITE_*` 都会编入公开前端，不能放入服务密钥。Compose 将上述两个公开 URL 作为 Docker build args 注入两个前端，覆盖旧的构建环境；改 URL 后必须重新构建 web 镜像。新网关按同域访问设计，`VITE_API_BASE_URL` 与站点应使用同一个 HTTPS origin。

## 3. 配置 HTTPS 入口

新 Compose 只把 web 映射到服务器 `127.0.0.1:8080`（可通过 `WEB_PORT` 修改），API 仅供容器网络内部访问。HTTPS 由宿主机 Nginx、宝塔或已有负载均衡处理；仓库不签发证书，也不直接占用 443。

在自己域名已配置证书的 HTTPS server 中，将站点转发至该端口，例如：

```nginx
client_max_body_size 24m;
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```

外层代理须重写 `X-Forwarded-Proto`，不能原样信任访客传入值。容器网关继续传递该协议给 API。若外层代理本身运行在容器内，应另行配置它到 web 的连通方式；它的 `127.0.0.1` 不是宿主机。

## 4. 构建、预检、显式迁移、启动

以下命令均在仓库根目录运行。第一次安装使用自己的空数据库；已有业务库升级前先备份数据库、私有媒体原件及当前镜像。迁移没有自动逆向删除脚本。

```sh
# 只校验 Compose 结构，不输出解析后的秘密。
docker compose -f docker-compose.deploy.yml config --quiet

# 构建 API 与包含 PC/H5 的 web 镜像。
docker compose -f docker-compose.deploy.yml build

# 使用容器环境执行生产预检。成功输出 PRODUCTION_PREFLIGHT_OK。
docker compose -f docker-compose.deploy.yml run --rm --no-deps api node scripts/preflight-production.mjs

# 迁移是显式操作；普通启动不会自动修改数据库结构。
docker compose -f docker-compose.deploy.yml run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
docker compose -f docker-compose.deploy.yml run --rm --no-deps api node node_modules/prisma/build/index.js migrate status

# 数据库准备好后启动。
docker compose -f docker-compose.deploy.yml up -d --wait
docker compose -f docker-compose.deploy.yml ps
```

这里不使用旧 `docker-compose.yml` / `docker-compose.aliyun.yml`。旧入口保留历史兼容，新入口负责打包双前端与同域路由。请不要以 `db push`、`migrate reset` 或重新运行种子替代以上迁移。

若启动失败，查看 `docker compose -f docker-compose.deploy.yml logs --tail=100 api`，不要把包含请求或配置的原始日志公开。宿主机执行 `preflight-production.mjs --env-file .env` 还会校验历史前端 `.env.production` 文件；本指南通过容器预检，并通过 build args 配置前端。

## 5. 首次管理员及验收

首次启动会在指定用户名尚不存在时创建管理员。通过管理端登录，验证后清空 `.env` 中的 `DEFAULT_ADMIN_USERNAME` 和 `DEFAULT_ADMIN_PASSWORD`，再运行：

```sh
docker compose -f docker-compose.deploy.yml up -d --force-recreate --wait api web
```

同时重建 web 可刷新 Nginx 解析的 API 容器地址。该操作不会删除已创建账号，也不会重设已有账号密码。妥善保存部署方自行设置的密码。

| 地址 | 验证内容 |
| --- | --- |
| `https://自己的域名/` | PC 管理端可加载和登录。 |
| `https://自己的域名/h5/` | H5 可加载，登录、刷新和页面跳转正常。 |
| `https://自己的域名/api/v1/health/ready` | 返回成功，表示 API 已连接数据库。 |

还应在自己的测试数据上验证建档、角色权限、上传/受保护下载和短信投递。24 MiB 网关请求上限用于容纳 20 MiB 业务照片及 multipart 开销，具体业务格式与文件大小限制仍由 API 执行。数据库就绪不能替代业务验收或微信真机验收。

## 6. 微信原生小程序

Docker web 镜像包含 H5，不包含微信平台发布。需要原生小程序时，在本机安装 Node.js 22 和对应依赖，并使用自己的公开构建配置：

```sh
npm --prefix apps/mini-program ci
```

创建 `apps/mini-program/.env.production.local`（不要提交）：

```dotenv
VITE_API_BASE_URL=https://自己的域名/api/v1
VITE_STORAGE_BASE_URL=https://自己的域名
```

将 `apps/mini-program/src/pages/agreement/privacy-policy.vue` 和 `user-agreement.vue` 中的运营主体、联系方式、数据处理说明及业务文案改为本次实际部署信息。把 `apps/mini-program/src/manifest.json` 的 `mp-weixin.appid` 改为自己的 AppID；源码内保留的历史 AppID 不代表你获得其平台权限。随后：

```sh
npm --prefix apps/mini-program run build:mp-weixin
```

用微信开发者工具导入 `apps/mini-program/dist/build/mp-weixin`，配置自己的 request/upload/download 合法域名、隐私协议及相关权限，完成真机测试后按平台流程上传、提审、发布。不能把本地 H5 通过视为原生小程序已发布。

## 7. 不连接外部服务的本地验证

本地源码验证需要 Node.js 22 与一个由自己管理的独立 MySQL 测试库。不要使用正式数据库或复用历史本机账号文件。三个正式应用分别安装依赖：

```sh
npm --prefix apps/api ci
npm --prefix apps/clinician-admin ci
npm --prefix apps/mini-program ci
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run build:release
npm --prefix apps/clinician-admin test
npm --prefix apps/mini-program test
```

API 单元测试执行 `npm --prefix apps/api test -- --silent`。

需要启动本地应用时，在仓库根目录建立忽略文件 `.env.local`，配置 `NODE_ENV=development`、`API_BIND_ADDRESS=127.0.0.1`、`PORT=3000`、独立测试 `DATABASE_URL`、随机 JWT/SMS/media/reminder 秘密、显式的管理员用户名与密码、`API_PUBLIC_URL=http://127.0.0.1:3000`、`PATIENT_APP_URL=http://127.0.0.1:5174/h5/`、适当的本地 CORS origins，并保持所有 OSS、微信和短信外部密钥为空、`OCR_PROVIDER=disabled`。不要复制生产 `.env` 到本地测试。

对自己的新空测试库执行一次迁移，然后启动 API：

```sh
node --env-file=.env.local apps/api/node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
node --env-file=.env.local apps/api/dist-release/main.js
```

另开终端运行 `npm --prefix apps/clinician-admin run dev`。小程序 H5 可在 `apps/mini-program/.env.development.local` 设置本地 `VITE_API_BASE_URL` / `VITE_STORAGE_BASE_URL` 后运行 `npm --prefix apps/mini-program run dev:h5`，以终端显示的实际 URL 和端口为准，并将相应 origin 加入 API 的 `CORS_ORIGINS`。未配置外部服务时短信、微信手机号登录和云 OCR 不会因此可用。

## 8. 升级与数据保留

后续更新先备份、拉取指定 commit，设置新的不可变 `RELEASE_TAG`，再依次构建、预检、迁移与启动。前端配置修改后重新构建 web。应用升级不执行演示 seed；不能使用 `docker compose down -v` 删除媒体卷。外部 MySQL、OSS 和 `media_data` 均须有部署方自己的备份策略。

## 9. 本次源码交付验证（2026-10-28）

- API 发布构建通过；38 个测试套件、794 项测试通过。
- 管理端构建通过；6 个测试文件、50 项测试通过。
- H5 与微信小程序构建通过；Compose 配置静态校验通过。
- 小程序默认 `npm test` 仍有一项已有图标规范检查失败：`src/pages/patient/index.vue:41` 的 `Icon size=28` 不在统一尺寸档位，其余默认检查通过。本次交付未调整业务界面。
- 本机 Docker daemon 未启动，未实际构建容器镜像或运行整套容器。部署方仍须按本指南完成目标服务器的镜像构建、空库迁移与业务验收。
