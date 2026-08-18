# 轻衡健康体重管理平台

该仓库把原 uniCloud 小程序重构为三端共用的体重管理系统：

- `apps/mini-program`：正式患者端/医生端 uni-app（Vue 3 + Vite），保留原 20 个页面，可构建 H5 与微信小程序。
- `apps/clinician-admin`：医生/营养师工作台与系统管理员后台（React + Vite）。
- `apps/api`：独立 NestJS REST API（Prisma + MySQL），不依赖 uniCloud。
- `apps/patient-mobile`：方案一视觉方向的 React 交互参考，不是正式小程序交付入口。

## 本地启动 H5

只预览页面可直接运行：

```powershell
npm --prefix apps/mini-program install
npm --prefix apps/mini-program run dev:h5
```

默认 API 地址为 `http://127.0.0.1:3000/api/v1`。完整联调需先启动 MySQL 和 API：

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql
$env:DATABASE_URL='mysql://weightcare:change_me@127.0.0.1:3307/weightcare'
$env:JWT_ACCESS_SECRET='local-only-secret-at-least-32-characters-long'
npm --prefix apps/api run prisma:migrate
npm --prefix apps/api run prisma:seed
npm --prefix apps/api run start:dev
```

另开终端启动两端：

```powershell
npm --prefix apps/mini-program run dev:h5
npm --prefix apps/clinician-admin run dev -- --port 4174
```

PC 后台默认打开管理员登录。本地开发首次启动 API 时会自动创建 `admin / admin123`，仅用于本机联调；管理员可查看平台概览、创建账号、调整角色与启停状态、重置密码并查询审计日志。生产环境不会创建默认管理员：只有同时提供 `DEFAULT_ADMIN_USERNAME` 与至少 16 位的非默认 `DEFAULT_ADMIN_PASSWORD` 才会引导创建，已存在的管理员密码不会在重启时被覆盖。正式后台域名为 `https://kxjz.hzmwmt.cn`。

API 存活检查为 `GET /api/v1/health`，数据库就绪检查为 `GET /api/v1/health/ready`。本地种子账号及密码策略见 `apps/api/prisma/seed.ts`；生产环境默认拒绝写入演示账号。

## 构建与测试

```powershell
npm run build
npm run test
```

微信开发者工具导入 `apps/mini-program/dist/build/mp-weixin`。H5 产物位于 `apps/mini-program/dist/build/h5`。

## 生产边界

患者只能访问本人数据；医生和营养师只能访问存在 `ACTIVE` 照护关系的患者；管理员没有绕过临床数据关系校验的权限。邀请码预览为只读，只有患者确认后才原子建立关系。解绑后立即禁止继续发送消息，但历史记录保留用于审计。

仓库包含阿里云部署配置和迁移工具，但“可部署”不等于已经上线。真实发布前仍需填写 RDS、短信、微信、OSS、域名与 TLS 配置，并完成真实 MySQL 迁移、数据对账、微信真机和备份恢复验收。详见 `docs/aliyun-deployment.md` 与 `docs/cloud-function-migration.md`。
