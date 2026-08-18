# Design QA — 数字减重助手小程序

## Source truth

- 用户原始参考图：`C:\Users\10622\AppData\Local\Temp\codex-clipboard-f8c2106d-0873-4f02-b03b-5b5dd4a6f19c.png`
- 本次桌面 TabBar 问题图：`C:\Users\10622\AppData\Local\Temp\codex-clipboard-fe656b17-fbde-4d07-a9d7-ac4bb7868500.png`
- 本次体重输入截断问题图：`C:\Users\10622\AppData\Local\Temp\codex-clipboard-30f1f79c-d390-4bb8-a739-072d2a796237.png`
- 本次小程序顶部遮挡问题图：`C:\Users\10622\AppData\Local\Temp\codex-clipboard-da663e24-7d78-47b9-897a-a93d49005361.png`
- 归一化参考区：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\reference-patient-home.png`
- 参考区尺寸：392 × 856 px
- 强制品牌差异：参考图中的“轻盈伴行”不作为品牌来源；实现按用户最新要求统一为“数字减重助手”，图形 Logo 使用登录页 `/static/logo.png`。

## Implementation evidence

- 同尺寸患者首页：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\implementation-patient-home-392x856.png`
- 完整患者首页：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\implementation-patient-home-full.png`
- 聚焦对比：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\comparison-patient-home-focused.png`
- 完整对比：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\comparison-patient-home-full.png`
- 体重输入桌面截图：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\implementation-weight-input-wide-20260818.png`
- 体重输入移动截图：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\implementation-weight-input-mobile-390x844-20260818.png`
- 体重输入修复前后对比：`C:\Users\10622\Desktop\体重管理\apps\mini-program\design-qa\comparison-weight-input-20260818.png`

## Viewport, density, and state

- 环境：uni-app H5，Codex 内置浏览器，`http://127.0.0.1:4175`
- 浏览器能力视口：407 × 896 CSS px；页面截图区：392 × 856 px；DPR 约 1.0
- 状态：本地 MySQL 演示患者“陈晨”已登录；当前体重 69.6 kg，目标 62 kg，1 条未读提醒。
- 数据原则：趋势图展示数据库中真实可用记录（当前为 2 个点），未为了贴图伪造 7 条数据。

## Comparison review

聚焦对比确认以下视觉骨架与参考一致：

1. 浅蓝雾面页头、品牌区、个人入口与问候信息。
2. 白色主数据卡、超大体重数字、短趋势、蓝色主 CTA 与说明文字。
3. “今日任务”标题行和饮食、医生/营养师两行任务卡。
4. 任务后立即出现 7 日趋势卡；线图、单位、数值层级清晰。
5. 健康免责声明与饮水提示延续同一临床卡片体系。

为保持原小程序完整功能，实现保留了 BMI、目标体重、目标进度，并把快捷服务、最近通知放在核心参考区之后。完整对比图中的固定底部 TabBar 位于截图视口边界，是 full-page 捕获固定元素产生的截图现象，不是页面断层。

## Iteration history

- Iteration 1：将旧四宫格/通知中心首页重组为参考图的品牌、问候、体重、任务、趋势、健康提示顺序。
- Iteration 2：压缩首屏密度，把快捷服务和动态通知移到趋势及健康提示之后；统一 20 个路由页的蓝白卡片、状态与 CTA。
- Iteration 3：按用户更新统一“数字减重助手”名称，加入品牌契约检查；所有 Logo 锁定 `/static/logo.png`。
- Iteration 4：修复浅色背景中白色 Logo 不可见、含空格目录 SVG 在 H5 不加载、6 个错误图标路径与绑定帮助按钮失效问题。
- Iteration 5：移除嵌套组件于 `<text>` 和未注册 `uni-load-more` 的跨端警告；重新执行同尺寸对比与核心导航回归。
- Iteration 6：提高桌面端 TabBar 容器选择器权重，覆盖 uni-h5 框架的左右定位，使其与 430 px 患者内容区同轴居中。
- Iteration 7：将体重输入宽度从 280rpx 增至可伸缩的 360rpx，并保留单位独立间距，使“请输入体重”五字在桌面与移动视口中完整显示。
- Iteration 8：患者首页与医生/营养师工作台改为读取实际状态栏和微信胶囊尺寸，页面品牌区从胶囊底部以下开始；iPhone 12/13 Pro 开发者工具复检确认 Logo、标题、“我的”和问候语均未进入刘海、状态栏或胶囊区域。

## Findings

- P0：0
- P1：0
- P2：0
- 品牌扫描：禁用名称 0；“数字减重助手”27 处；Logo 路径统一。
- 资源扫描：215 个 Vue SVG 引用全部存在并可由 H5 加载。
- 核心交互：密码登录、协议勾选、患者首页、记录入口、随访入口均通过。
- 最终浏览器回归时间窗内控制台 error/warn：0。
- 构建：H5 与 mp-weixin 生产构建通过；20 路由、媒体、品牌、图标契约通过。
- 线上桌面回归：`https://kxjz.hzmwmt.cn/h5/`，1920 × 1009 CSS px；患者内容区与 TabBar 均为 430 px，横坐标均为 745 px；4 个入口“首页 / 数据记录 / 随访任务 / 健康报告”完整显示。
- 线上移动回归：390 × 844 CSS px；TabBar 与页面可用宽度均为 374.67 px，4 个入口完整显示，固定于视口底部。
- 体重输入桌面回归：1233 × 1065 CSS px；输入区宽 180 px、单位间距 6 px，“请输入体重”完整显示且 `kg` 不覆盖文字。
- 体重输入移动回归：390 × 844 CSS px；输入区仍为 180 px，卡片宽 321.33 px，占位文案、下划线和 `kg` 均完整显示。
- 小程序安全区回归：iPhone 12/13 Pro 模拟器中，原生胶囊位于品牌区上方，品牌栏与问候区完整可见；调试器 Errors 0，Warnings 2（均为开发者工具内部 preload 提示）。
- 安全区契约：iPhone、Android 与 H5 回退计算均通过；患者页和医生/营养师页均接入动态导航尺寸。

## Final result

passed
