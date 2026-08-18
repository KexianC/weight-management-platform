# uniCloud 数据与函数迁移

## 迁移映射

| 原域/集合 | 新模型与 API | 迁移规则 |
|---|---|---|
| users / register / login / forgot-password / wechat | User、Profile、AuthIdentity、SmsChallenge、RefreshToken | 原 PBKDF2 密码加前缀导入，首次正确登录自动升级 Argon2id；旧 SHA-256 重置密码无法验证，必须走新短信重置 |
| invite_codes / doctor_patient_relations | CareInvite、CareRelation、`/care/*` | 邀请码和确认绑定分离；重复关系去重；解绑保留结束原因和审计 |
| health_records | HealthRecord、`/health-records`、`/reports` | Decimal、日期、WEIGHT/DIET 等类型转换；早餐/午餐/晚餐/加餐全部保留 |
| patient_tasks | PatientTask、`/tasks` | 状态、优先级、结构化结果及截止时间转换 |
| follow_ups | FollowUp、`/follow-ups` | `pending→SCHEDULED`、`ongoing→IN_PROGRESS`；统一 note/result 字段；重复计划建立 series id |
| messages | Message、`/messages` | 保存上下文和附件；按双方软删除；未读状态从接收者身份计算 |
| notifications | Notification、`/notifications` | 关联对象、动作路径、优先级和过期时间转换 |
| sms_codes | 不导入 | 原字段和用途不一致且含明文验证码；切换后重新申请验证码 |

## 导入命令

从 uniCloud 控制台把每个集合导出为独立 JSONL 文件（uniCloud 使用 `.json` 后缀、每行一条记录），文件名改为对应集合名。导入器同时兼容 JSONL、JSON 数组和常见的 `data`/`records`/`items` 包装格式。先执行只读解析：

导入器会展开 MongoDB Extended JSON 的 `$oid` 等标量包装。用户导入时同时登记 `userId`、`_id` 和 `id` 别名；引用了未导出用户的业务记录会计入 `skipped`，不会虚构用户来满足外键。

```powershell
$env:DATABASE_URL='mysql://user:password@host:3306/weightcare'
npm --prefix apps/api run import:unicloud -- 'D:\exports\weightcare' --dry-run
```

确认统计后执行写入：

```powershell
npm --prefix apps/api run import:unicloud -- 'D:\exports\weightcare'
```

导入器按“手机号 + 角色”映射用户 ID并对业务主键执行 upsert，可重复执行。它不会迁移明文短信验证码，也不会把旧系统未记录的隐私同意凭空补为“已同意”。

## 切换步骤

1. 在副本环境运行 Prisma migration，验证 MySQL 8.4 语法和索引时间。
2. 对旧端进入只读维护窗口，记录各集合总数。
3. 导出 JSON，执行 dry-run，再执行正式导入。
4. 对账用户、关系、记录、随访、消息、通知总数；逐类抽样日期、Decimal、枚举和关联 ID。
5. 对旧 SHA-256 密码用户发起短信重置；其余旧密码在首次登录后自动升级。
6. 用患者 A/B、医生 A/B、营养师执行越权矩阵，确认解绑后立即拒绝写入。
7. 灰度切换 API 域名，观察错误率和审计日志；保留旧库只读快照和回滚 DNS。

没有用户提供的真实 uniCloud 导出数据时，只能验证导入器的类型和静态逻辑，不能声称完成了生产数据迁移或数量对账。
