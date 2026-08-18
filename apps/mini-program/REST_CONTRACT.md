# 移动端 REST 契约

所有受保护接口均从 `Authorization: Bearer <token>` 识别当前用户。旧页面传入的 `userId` / `doctorId` / `patientId` 不会被当作当前操作人提交；仅在医护人员访问某个已绑定患者时，将患者 ID 作为资源标识。

## 认证请求体

- `POST /auth/sms/send`: `{ phone, purpose }`，`purpose` 仅为 `REGISTER | LOGIN | RESET_PASSWORD | VERIFY_PHONE`。返回的 `challengeId` 由适配层按手机号和用途缓存。
- `POST /auth/sms/verify`: `{ phone, challengeId, purpose, code }`。
- `POST /auth/register`: `{ phone, password, displayName, role, challengeId, code, acceptedTerms: true, ...profile }`。`role` 仅为 `PATIENT | DOCTOR | NUTRITIONIST`；医生/营养师还必须提交 `practitionerInviteCode`。
- `POST /auth/login`: 仅 `{ phone, password }`；短信登录使用 `POST /auth/sms/login` 和 `{ phone, challengeId, code }`。
- `POST /auth/password/reset`: `{ phone, challengeId, code, newPassword }`。
- `POST /auth/wechat/login`: 既用于已绑定微信登录，也用于首次微信注册；首次注册额外提交手机验证、角色、协议同意状态，医护角色同样需要 `practitionerInviteCode`。
- `GET/PATCH /auth/me`、`PATCH /auth/me/target-weight`、`PATCH /auth/password`、`POST /auth/logout`。

## 已映射的原小程序功能

- 健康记录：`GET/POST /health-records`、`GET /health-records/stats`、`PATCH/DELETE /health-records/:id`。饮食记录使用 `recordType/mealType/mealTime/mealItems/caloriesKcal`；体重记录使用 `weightKg/bmi`。
- 医患关系：`GET /care/patients`、`GET /care/doctors`、`GET /care/patients/:id`、`GET /care/patients/:id/stats`、`POST /care/invites`。患者先用 `GET /care/invites/:code` 预览，确认后才调用 `POST /care/invites/:code/bind`。解绑使用 `DELETE /care/patients/:id` 或 `DELETE /care/doctors/:id`。
- 随访：`GET/POST /follow-ups`、`GET/PATCH/DELETE /follow-ups/:id`、`POST /follow-ups/:id/start|complete|cancel`、`GET /follow-ups/stats`。旧类型 `health_assessment/offline_visit/phone_call` 分别转为 `QUESTIONNAIRE/OFFLINE/PHONE`。
- 任务：`GET/POST /tasks`、`PATCH/DELETE /tasks/:id`、`POST /tasks/:id/start|complete|cancel`。
- 留言：`GET/POST /messages`、`GET /messages/item/:id`、`PATCH /messages/read`、`DELETE /messages/:id`、`GET /messages/unread-count`、`GET /messages/activities`。发送仅提交 `receiverId/content/messageType/relatedId/relatedType/attachments`，已读仅提交 `peerId/messageIds`。
- 通知：`GET/POST /notifications`、`PATCH /notifications/:id/read`、`PATCH /notifications/read-all`、`DELETE /notifications/:id`、`GET /notifications/unread-count`。
- 报告与首页：`GET /reports?range=7d|30d|90d`、`GET /dashboard`。
- 文件与热量计算：`POST /media/upload`、`GET /media/:id/url`、`POST /ai/calories`。随访图片上传时携带 `referenceType=FOLLOW_UP` 和 `referenceId=<followId>`，随访结果持久化 `assetId` 而非 600 秒签名 URL；详情展示时按资产 ID 重新获取受权 URL。

## 保留导出但后端尚未映射

下列是旧 `api.js` 的兼容导出，当前 20 个保留页面未直接调用，现有后端也没有对应路由：

- 医生单独资料 `GET /care/doctor`，直接绑定 `POST /care/bind`，修改患者 `PATCH /care/patients/:id`。
- 生成/下载持久化报告：`POST /reports`、`GET /reports/:id`、`GET /reports/:id/download`。
- 聚合看板：`GET /dashboard/stats`、`/dashboard/patient-trends`、`/dashboard/weight-distribution`。
- 设置：`GET/PATCH /settings/me`、`GET/PATCH /settings/system`。
- 导出：`GET /exports/patients`、`/exports/health-records`、`/exports/follow-ups`、`/exports/statistics`。

这些兼容导出不会伪造成功结果；若未来恢复相关页面，需先在独立后端实现并加入集成测试。
