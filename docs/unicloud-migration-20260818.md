# uniCloud 生产数据迁移记录（2026-08-18）

## 范围

- 来源：8 个 uniCloud JSONL 导出文件，共 329 条。
- 目标：阿里云线上 MySQL，部署目录 `/opt/kxjz-weight-care`。
- 敏感配置：直接使用服务器现有 `.env`，迁移过程未输出数据库连接密码。

## 源数据与结果

| 集合 | 源记录 | 写入/处理 | 跳过 | 说明 |
|---|---:|---:|---:|---|
| users | 42 | 42 | 0 | 38 个患者资料，4 个医护资料 |
| invite_codes | 68 | 67 | 1 | 1 条引用未导出的医生 |
| doctor_patient_relations | 22 | 21 | 1 | 21 条有效源记录按患者/医护唯一键归并为 19 条关系 |
| health_records | 74 | 43 | 31 | 跳过记录均引用未导出的患者 |
| follow_ups | 27 | 18 | 9 | 跳过记录均引用未导出的患者 |
| messages | 26 | 15 | 11 | 跳过记录的发送者或接收者未导出 |
| notifications | 35 | 33 | 2 | 跳过记录均引用未导出的用户 |
| sms_codes | 35 | 0 | 35 | 安全验证码不迁移 |

可迁移业务数据共 239 条；孤立业务记录 55 条被隔离跳过；短信验证码 35 条按策略排除。缺失的旧用户标识为 `user_1753255864084_e6e3xrug9` 和 `user_1754363404863_qczga96qu`。

## 执行与修正

1. 本地和服务器 dry-run 结果一致。
2. 首次正式执行因 Docker `--env-file` 对引号的处理差异，在首条写入前失败；改为从健康 API 容器继承已解析的 `DATABASE_URL`。
3. 第二次执行写入用户后发现 MongoDB `$oid` 被旧导入器转换成 `[object Object]`。删除迁移产生的唯一一条错误邀请码，补充 Extended JSON 标量展开后重新执行。
4. 修正版使用“手机号 + 角色”和业务主键 `upsert`，重复执行不会重复创建同一身份用户。

## 最终线上对账

| 表 | 最终记录数 |
|---|---:|
| User | 42 |
| PatientProfile | 38 |
| PractitionerProfile | 4 |
| CareInvite | 67 |
| CareRelation | 19 |
| HealthRecord | 43 |
| FollowUp | 18 |
| PatientTask | 0 |
| Message | 15 |
| Notification | 33 |
| SmsChallenge | 0 |

错误主键 `[object Object]` 的记录数为 0。导入后 `/api/v1/health/ready` 返回 `ready`，数据库状态为 `up`。
