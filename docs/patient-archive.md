# 中医体重管理患者电子档案

## 1. 文档范围

本文档对应当前电子档案模板 `TCM_WEIGHT_V1`，字段 key 与
`apps/clinician-admin/src/archive-schema.ts` 保持一致。

- 字段来源仅为用户提供的三张纸质《中医体重管理档案》空表中的印刷标签、空白栏和勾选项。
- 蓝色手写内容属于示例患者数据，不是产品需求，也不作为默认值、枚举选项或测试数据录入系统。
- 为适配电子建档，少量字段做了结构化、单位规范化或系统扩展；这些项目在下表中明确标注。
- 患者姓名、手机号等账号资料直接读取患者账号，不重复存入 `answers`。档案 `id` 保存后由系统生成，并作为页面上的档案编号展示。
- 纸表使用方框并不代表所有项目均可多选。疾病“无/有”、活动等级、睡眠状态、排便状态等在页面中使用互斥单选；风险因素和症状清单使用多选。

## 2. 建档方式与状态

医生/营养师新增患者时可以选择：

1. **仅创建账号，稍后补录**：成功建立患者账号和照护关系，但不创建档案记录；页面显示“未建档”。
2. **创建账号后立即建档**：创建患者后直接进入独立建档页面。

后续可以从患者详情进入档案页补录、继续编辑或查看。档案状态如下：

| 页面状态 | 持久化状态 | 含义 |
| --- | --- | --- |
| 未建档 | 无 `PatientArchive` 记录，`archiveStatus = null` | 尚未首次保存 |
| 草稿 | `DRAFT` | 允许字段缺失，可反复保存并稍后补录 |
| 已完成 | `COMPLETED` | 操作者主动标记完成；仍可保存后续修订 |

系统按当前模板全部字段的已填写数量计算 `completionPercent`；它是完成度提示，不是临床完整性判断，也不是标记完成的硬性门槛。保存已有档案时提交 `expectedUpdatedAt` 做乐观并发校验，避免覆盖其他医生/营养师刚保存的版本。

## 3. 页面模块与字段

控件名称与前端 schema 一致：`text`、`number`、`date`、`textarea`、`select`、`radio`、`checkboxes`。没有结果的检验和病史字段均可留空后补。

### 3.1 基础体格（`body-basics`）

| 纸表/页面标签 | schema key | 控件 | 单位、选项或说明 |
| --- | --- | --- | --- |
| 建档日期 | `archiveDate` | `date` | 默认当天，可修改 |
| 性别 | `gender` | `select` | `MALE` 男、`FEMALE` 女、`OTHER` 其他、`UNKNOWN` 未知；可从患者资料带入 |
| 出生日期 | `birthDate` | `date` | 纸表印“年龄”；电子表改用出生日期作为可信数据源，年龄自动计算 |
| 从事行业 | `occupation` | `select` | `EMPLOYEE` 企业员工、`SELF_EMPLOYED` 个体工商户、`HOMEMAKER` 家庭妇女、`WORKER` 工人、`HEALTHCARE` 医护、`TEACHER` 教师、`SERVICE` 服务行业、`CIVIL_SERVANT` 公务员、`RETIRED` 退休、`STUDENT` 学生、`CHILD` 儿童、`OTHER` 其他 |
| 其他行业说明 | `occupationOther` | `text` | 选择“其他”时填写；纸表“个体工商”在页面规范为“个体工商户” |
| 身高 | `heightCm` | `number` | cm；纸表印 m，页面统一为常用的 cm |
| 建档体重 | `weightKg` | `number` | kg |
| BMI | `bmi` | `number`（只读） | kg/m²；由身高和体重自动计算 |
| 颈围 | `neckCircumferenceCm` | `number` | cm |
| 腰围 | `waistCircumferenceCm` | `number` | cm |
| 臀围 | `hipCircumferenceCm` | `number` | cm |
| 收缩压 | `systolicBloodPressure` | `number` | mmHg |
| 舒张压 | `diastolicBloodPressure` | `number` | mmHg |
| 体格测量备注 | `bodyMeasurementNotes` | `textarea` | 系统扩展，用于记录测量条件、设备或其他说明 |

### 3.2 疾病、用药与检验（`medical-labs`）

疾病状态的通用选项为 `NO` 无、`YES` 有、`UNKNOWN` 不详；“是否用药”的通用选项为 `NO` 无、`YES` 有。

| 纸表/页面标签 | schema key | 控件 | 单位、选项或说明 |
| --- | --- | --- | --- |
| 高血压 | `hypertension` | `radio` | 无/有/不详 |
| 高血压是否用药 | `hypertensionMedicationUsed` | `radio` | 无/有 |
| 高血压用药 | `hypertensionMedication` | `text` | 药名、剂量、频次 |
| 高血脂 | `dyslipidemia` | `radio` | 无/有/不详 |
| 高血脂是否用药 | `dyslipidemiaMedicationUsed` | `radio` | 无/有 |
| 高血脂用药 | `dyslipidemiaMedication` | `text` | 药名、剂量、频次 |
| 糖尿病 | `diabetes` | `radio` | 无/有/不详 |
| 胰岛素抵抗 | `insulinResistance` | `radio` | 无/有/不详 |
| 糖尿病是否用药 | `diabetesMedicationUsed` | `radio` | 无/有 |
| 糖尿病相关用药 | `diabetesMedication` | `text` | 口服药或胰岛素方案 |
| 痛风 | `gout` | `radio` | 无/有/不详 |
| 痛风是否用药 | `goutMedicationUsed` | `radio` | 无/有 |
| 痛风用药 | `goutMedication` | `text` | 药名、剂量、频次 |
| 脂肪肝 | `fattyLiverSeverity` | `radio` | `NONE` 无、`MILD` 轻度、`MODERATE` 中度、`SEVERE` 重度、`UNKNOWN` 不详 |
| 脂肪肝是否用药 | `fattyLiverMedicationUsed` | `radio` | 无/有 |
| 脂肪肝用药 | `fattyLiverMedication` | `text` | 药名、剂量、频次 |
| 甲减 | `hypothyroidism` | `radio` | 无/有/不详 |
| 甲状腺是否用药 | `thyroidMedicationUsed` | `radio` | 无/有 |
| 甲状腺用药 | `thyroidMedication` | `text` | 药名、剂量、频次 |
| 慢性食物过敏 | `foodAllergy` | `radio` | 无/有/不详 |
| 过敏食物或表现 | `foodAllergyDetails` | `text` | 将纸表该行留白结构化为说明字段 |
| 食物过敏是否用药 | `foodAllergyMedicationUsed` | `radio` | 无/有 |
| 食物过敏用药 | `foodAllergyMedication` | `text` | 药名、剂量、频次 |
| 其他病史 | `otherMedicalHistory` | `textarea` | 补充确诊疾病和诊疗情况；纸表勾选病史另见 3.3 的 `comorbidHistory` |
| 目前长期服用药物 | `longTermMedication` | `textarea` | 药名、剂量、频次及开始时间 |
| 是否按时服药 | `medicationAdherence` | `radio` | `YES` 是、`NO` 否 |
| 未按时服药原因 | `medicationNonAdherenceReasons` | `checkboxes` | 仅选择“否”时填写：`FORGET` 容易遗忘、`DISLIKE` 不喜欢吃药、`SIDE_EFFECT` 副作用感受不好、`OTHER` 其他 |
| 其他未按时原因 | `medicationNonAdherenceOther` | `text` | 选择“其他”时填写 |
| 用药补充说明 | `medicationNotes` | `textarea` | 系统扩展 |
| 总胆固醇 | `totalCholesterol` | `number` | mmol/L |
| 高密度脂蛋白 | `hdlCholesterol` | `number` | mmol/L |
| 低密度脂蛋白 | `ldlCholesterol` | `number` | mmol/L |
| 甘油三酯 | `triglycerides` | `number` | mmol/L |
| 空腹血糖 | `fastingGlucose` | `number` | mmol/L |
| 餐后 2h 血糖 | `postprandial2hGlucose` | `number` | mmol/L |
| 空腹胰岛素 | `fastingInsulin` | `number` | pmol/L |
| 餐后 2h 胰岛素 | `postprandial2hInsulin` | `number` | pmol/L |
| 糖化血红蛋白 | `hba1c` | `number` | % |
| 尿酸 | `uricAcid` | `number` | μmol/L |
| 肌酐 | `creatinine` | `number` | μmol/L |
| 尿素氮 | `bloodUreaNitrogen` | `number` | mmol/L；由纸表疑似错印的“尿素尿酸”规范化，见第 5 节 |
| 内脏脂肪指数 | `visceralFatIndex` | `number` | 纸表未标单位 |
| CAP（受控衰减参数） | `liverCap` | `number` | dB/m |
| 肝脏 E 弹性值 | `liverElasticity` | `number` | kPa |
| 丙氨酸转氨酶 ALT | `alt` | `number` | U/L；纸表单位疑点见第 5 节 |
| 天门冬氨酸转氨酶 AST | `ast` | `number` | U/L；纸表单位疑点见第 5 节 |
| 促甲状腺激素 TSH | `tsh` | `number` | mIU/L；纸表单位不清，见第 5 节 |
| 游离三碘甲状腺原氨酸 FT3 | `ft3` | `number` | pmol/L；纸表单位疑点见第 5 节 |
| 游离甲状腺素 FT4 | `ft4` | `number` | pmol/L；照片右侧被裁切，见第 5 节 |
| 食物特异性 IgG | `foodIgg` | `textarea` | 纸表未标单位，保留文本以兼容多项结果 |
| 检验日期 | `laboratoryDate` | `date` | 系统扩展，用于标明结果日期 |
| 检验备注 | `laboratoryNotes` | `textarea` | 系统扩展，可记录参考区间、机构等 |

### 3.3 肥胖相关症状与家族史（`symptoms-family`）

| 纸表/页面标签 | schema key | 控件 | 单位、选项或说明 |
| --- | --- | --- | --- |
| 肥胖相关症状 | `obesitySymptoms` | `checkboxes` | `FATIGUE` 乏力、`DAYTIME_SLEEPINESS` 易困嗜睡、`SNORING` 打鼾、`ACANTHOSIS` 黑棘皮症、`NECK_LINES` 颈纹、`LIMB_EDEMA` 四肢水肿、`FACIAL_EDEMA` 面部水肿、`OTHER` 其他 |
| 其他症状说明 | `obesitySymptomOther` | `text` | 选择“其他”时填写 |
| 其他相关病史 | `comorbidHistory` | `checkboxes` | `OSAS` 阻塞性睡眠呼吸暂停综合征、`ATHEROSCLEROSIS` 动脉粥样硬化、`REFLUX` 反流性胃炎或食管炎、`OSTEOARTHRITIS` 退行性关节炎、`GROWTH_DELAY` 生长发育迟缓、`PSYCHOLOGICAL` 轻中度心理疾病、`PCOS` 多囊卵巢综合征、`HYPOTHYROID` 甲减、`HYPERTHYROID` 甲亢、`HASHIMOTO` 桥本甲状腺炎、`ALLERGY` 过敏史、`OTHER` 其他 |
| 其他病史说明 | `comorbidHistoryOther` | `textarea` | 选择“其他”时填写 |
| 末次月经 | `menstrualLastDate` | `date` | 女性条件字段 |
| 月经持续天数 | `menstrualDurationDays` | `number` | 天；女性条件字段 |
| 月经周期 | `menstrualCycleDays` | `number` | 天；女性条件字段 |
| 经量 | `menstrualVolumeMl` | `number` | ml/周期；女性条件字段 |
| 家族糖尿病史 | `familyDiabetes` | `radio` | 无/有/不详 |
| 糖尿病亲属关系 | `familyDiabetesRelation` | `text` | 如父亲、兄弟姐妹 |
| 家族冠心病史 | `familyCoronaryDisease` | `radio` | 无/有/不详 |
| 冠心病亲属关系 | `familyCoronaryRelation` | `text` | 直系亲属关系 |
| 家族脑梗死史 | `familyStroke` | `radio` | 无/有/不详 |
| 脑梗死亲属关系 | `familyStrokeRelation` | `text` | 直系亲属关系 |
| 家族高血压史 | `familyHypertension` | `radio` | 无/有/不详 |
| 高血压亲属关系 | `familyHypertensionRelation` | `text` | 直系亲属关系 |
| 其他家族史 | `familyOtherHistory` | `textarea` | 合并记录纸表中的“其他疾病”和“与你的关系” |

纸表将该组亲属范围写作“直系亲属（父母兄弟姐妹）”。纸表病史中的“多内分泌代谢卵巢综合征（PMOS）”明显可疑；页面按临床常用名称规范为“多囊卵巢综合征（PCOS）”，内部选项值为 `PCOS`。

### 3.4 肥胖影响因素（`obesity-factors`）

本模块四个字段均为多选数组，数组中保存下列稳定选项值。

#### 饮食因素（`dietExcessFactors`）

| 选项值 | 印刷项 |
| --- | --- |
| `REFINED_STAPLES` | 主食偏爱精制米面、淀粉类食物 |
| `SUGARY_DRINKS` | 日常经常喝奶茶、果汁、碳酸等含糖饮料 |
| `LOW_WATER` | 每日饮水量少，不爱主动喝水 |
| `SWEETS` | 经常吃蛋糕、饼干、糖果等甜点 |
| `RICH_SOUP` | 常喝浓稠肉汤、甜羹、浓汤（油脂/糖分高） |
| `HEAVY_TASTE` | 饮食口味重，无辣不欢 |
| `ANIMAL_OFFAL` | 频繁食用动物内脏 |
| `HIGH_SUGAR_FRUIT` | 过量食用榴莲、葡萄等高糖分水果 |
| `HIGH_MEAT_RATIO` | 三餐肉类占比过高 |
| `BRAISED_OILY` | 做菜、点餐偏爱红烧、卤味重油做法 |
| `FRIED_FOOD` | 爱吃油条、炸鸡、薯条等油炸食品 |
| `SALTY` | 日常饮食口味偏咸 |
| `FATTY_MEAT` | 经常吃肥肉、五花肉 |
| `LOW_VEGETABLES` | 正餐很少吃绿叶蔬菜，蔬菜摄入不足 |
| `FREQUENT_TAKEOUT` | 每周 3 次以上在外就餐、外卖 |
| `FAST_EATING` | 吃饭速度快，狼吞虎咽 |
| `SKIP_BREAKFAST` | 经常不吃早餐，空腹到中午 |
| `BINGE_EATING` | 容易暴饮暴食，一餐吃撑 |
| `LATE_NIGHT_SNACK` | 有吃宵夜习惯，睡前进食 |
| `ICE_DESSERTS` | 一年四季常吃冰饮、冰甜品 |
| `FREQUENT_ALCOHOL` | 有饮酒习惯，频繁喝酒 |
| `BAKERY` | 常吃面包、糕点、酥皮点心等糖油混合物 |
| `EXTREME_LOW_CARB` | 长期极端控卡、完全不吃主食 |
| `IRREGULAR_MEALS` | 三餐时间混乱，吃饭无固定时段 |

#### 运动消耗因素（`exerciseDeficitFactors`）

| 选项值 | 印刷项 |
| --- | --- |
| `NO_EXERCISE` | 日常不爱运动，几乎无锻炼习惯 |
| `INJURY_LIMIT` | 身体存在伤病，行动不便，活动受限 |
| `POST_MILITARY_ACTIVITY_DROP` | 退伍后作息、活动量大幅下降 |
| `ATHLETE_RETIRED` | 专业运动员退役，运动量断崖式减少 |
| `POST_EXERCISE_BINGE` | 高强度运动后容易出现代偿性暴食 |

#### 生理、疾病、药物与情绪因素（`physiologyDiseaseEmotionFactors`）

| 选项值 | 印刷项 |
| --- | --- |
| `CHILDHOOD_OBESITY` | 幼儿时期就存在超重/肥胖 |
| `PUBERTY_GAIN` | 青春期体重快速上涨发胖 |
| `POST_PREGNANCY` | 怀孕后体重增长过多难以回落 |
| `LACTATION_OVERFEED` | 哺乳期进补过度，体重居高不下 |
| `MENOPAUSE` | 更年期代谢下降，持续发胖 |
| `MIDDLE_AGE` | 中年后逐年发胖，控制困难 |
| `PARENTS_OBESE` | 父母单方或双方均肥胖 |
| `GENETIC_TENDENCY` | 有明显家族肥胖遗传倾向 |
| `OBESOGENIC_DRUGS` | 长期服用激素类、抗抑郁等易致发胖药物 |
| `EMOTIONAL_EATING` | 容易焦虑、压力大，靠吃东西缓解情绪（情绪性进食） |
| `ENDOCRINE_DISEASE` | 患有甲减、多囊、库欣等易引发肥胖的基础疾病 |
| `JET_LAG` | 经常跨地区出差、倒时差，作息紊乱 |

#### 成长、生活与工作环境因素（`growthWorkEnvironmentFactors`）

| 选项值 | 印刷项 |
| --- | --- |
| `MACROSOMIA` | 出生时为巨大儿 |
| `LOW_BIRTH_WEIGHT` | 出生低体重，后天易发胖 |
| `PRETERM` | 属于早产儿 |
| `MARITAL_CHANGE` | 经历离婚、分居等婚姻重大变故 |
| `SINGLE_PARENT` | 单亲家庭生活 |
| `SEDENTARY_WORK` | 日常工作久坐，几乎无活动时间 |
| `LIVED_WITH_GRANDPARENTS` | 从小和爷爷奶奶/外公外婆同住，饮食重油重糖 |
| `STUDY_STRESS` | 学生阶段学习压力大，情绪性暴食 |
| `JOB_CHANGE` | 近期更换工作，生活节奏打乱 |
| `UNEMPLOYED` | 经历失业，作息饮食失控 |
| `LONG_HIGH_PRESSURE` | 长期工作高压，精神持续紧绷 |
| `FREQUENT_TRANSFER` | 频繁调换岗位，工作内容变动 |
| `AFTER_MARRIAGE` | 婚后饮食习惯改变，逐步长胖 |
| `OVERTIME` | 经常加班，作息不规律 |
| `NIGHT_SHIFT` | 长期上夜班、昼夜颠倒 |
| `BUSINESS_ENTERTAINMENT` | 商务应酬多，频繁聚餐喝酒 |
| `FREQUENT_TRAVEL` | 常年各地出差，饮食运动无法规律 |

`obesityFactorNotes` 为 `textarea` 系统扩展字段，用于补充诱因、发生时间及其对体重的影响。

### 3.5 既往减重史（`weight-loss-history`）

| 纸表/页面标签 | schema key | 控件 | 单位、选项或说明 |
| --- | --- | --- | --- |
| 使用过的减重方法 | `pastWeightLossMethods` | `checkboxes` | `NONE` 无、`EXERCISE` 运动、`MEDICATION` 药物、`ACUPUNCTURE` 针灸、`DIET` 节食、`LIPOSUCTION` 吸脂、`OTHER` 其他；`NONE` 与其余选项互斥 |
| 其他减重方法 | `pastWeightLossOther` | `text` | 选择“其他”时填写 |
| 减重经历 | `weightLossExperience` | `textarea` | 时间、方法、减重幅度、维持时间、反弹及不良反应 |
| 成年最低体重 | `lowestAdultWeightKg` | `number` | kg；系统扩展，纸表未单列 |
| 成年最高体重 | `highestAdultWeightKg` | `number` | kg；系统扩展，纸表未单列 |
| 明显增重开始时间 | `weightGainStartDate` | `date` | 系统扩展，纸表未单列 |

### 3.6 运动与 24 小时饮食（`exercise-diet`）

| 纸表/页面标签 | schema key | 控件 | 单位、选项或说明 |
| --- | --- | --- | --- |
| 日常运动量 | `dailyActivityLevel` | `radio` | `SEDENTARY` 久坐少运动、`LIGHT` 轻度运动、`MODERATE` 中度运动、`HIGH` 大量运动 |
| 个人运动爱好 | `exercisePreference` | `textarea` | 运动项目、时长、频次及限制 |
| 24h 回顾·早餐 | `breakfastRecall` | `textarea` | 时间、食物及大致份量 |
| 24h 回顾·中餐 | `lunchRecall` | `textarea` | 时间、食物及大致份量 |
| 24h 回顾·晚餐 | `dinnerRecall` | `textarea` | 时间、食物及大致份量 |
| 24h 回顾·加餐 | `snackRecall` | `textarea` | 时间、食物及大致份量 |
| 饮食偏好 | `foodPreferences` | `checkboxes` | `RICE` 米饭、`NOODLES` 面食、`SWEET` 甜食、`MEAT` 肉类、`FISH` 鱼类、`VEGETABLE` 蔬菜、`FRUIT` 水果、`FRIED` 油炸食品、`SNACK` 零食、`ALCOHOL` 酒类、`DRINKS` 饮料 |
| 口味爱好 | `tastePreferences` | `checkboxes` | `SALTY` 咸、`SWEET` 甜、`SOUR` 酸、`SPICY` 辣、`OILY` 重油 |
| 应酬次数 | `socialMealsPerWeek` | `number` | 次/周 |
| 饮酒次数 | `alcoholTimesPerWeek` | `number` | 次/周 |
| 酒精度数 | `alcoholStrength` | `number` | 度 |
| 每次饮酒量 | `alcoholAmountMl` | `number` | ml |
| 每日饮水量 | `dailyWaterMl` | `number` | ml；系统扩展，纸表只在风险清单中描述“饮水量少”，未设独立数值栏 |
| 其他饮食说明 | `dietOtherNotes` | `textarea` | 对应纸表“其他”留白，可填茶饮、咖啡、保健品或特殊饮食 |

### 3.7 睡眠与二便（`sleep-elimination`）

| 纸表/页面标签 | schema key | 控件 | 单位、选项或说明 |
| --- | --- | --- | --- |
| 作息时间规律 | `scheduleRegular` | `radio` | `YES` 是、`NO` 否 |
| 作息描述 | `scheduleDescription` | `text` | 例如 23:00–07:00 |
| 睡眠状态 | `sleepStatus` | `radio` | `NORMAL` 正常、`ABNORMAL` 异常 |
| 睡眠异常表现 | `sleepProblems` | `checkboxes` | `FALL_ASLEEP_DIFFICULT` 入睡困难、`INSOMNIA` 失眠、`DREAMY` 多梦、`EASY_WAKE` 易醒、`WAKE_DIFFICULT` 起床困难 |
| 起夜次数 | `nocturiaTimes` | `number` | 次/晚 |
| 排尿情况 | `urinationStatus` | `checkboxes` | `NORMAL` 正常、`OLIGURIA` 少尿、`POLYURIA` 多尿、`ANURIA` 无尿、`BLADDER_IRRITATION` 膀胱刺激征、`RETENTION` 尿潴留、`INCONTINENCE` 尿失禁；正常与异常项应互斥 |
| 排便情况 | `stoolStatus` | `radio` | `NORMAL` 正常、`CONSTIPATION` 便秘、`DIARRHEA` 腹泻 |
| 排便次数 | `stoolTimesPerDay` | `number` | 当前 schema 为次/日；纸表在“便秘”后印的是“日/次”，语义不完全一致，需确认是否应改为便秘间隔天数 |
| 辅助排便 | `laxativeUse` | `radio` | 无/有 |
| 腹泻频次 | `diarrheaTimesPerDay` | `number` | 次/日 |
| 睡眠与二便补充 | `sleepEliminationNotes` | `textarea` | 系统扩展 |

### 3.8 中医辨证与管理计划（`tcm-plan`）

| 纸表/页面标签 | schema key | 控件 | 单位、选项或说明 |
| --- | --- | --- | --- |
| 中医体质辨证 | `tcmConstitution` | `textarea` | 可记录证型、舌脉等辨证依据 |
| 医嘱 | `medicalAdvice` | `textarea` | 饮食、运动、用药、监测及风险提醒 |
| 减脂方案 | `fatLossPlan` | `textarea` | 阶段目标、能量方案、运动处方和随访频率 |
| 目标体重 | `targetWeightKg` | `number` | kg；纸表未印单位，页面按体重字段约定为 kg |
| 其他目标 | `otherGoals` | `text` | 如腰围、体脂率或代谢指标目标 |
| 具体开始时间 | `planStartDate` | `date` | 纸表留日期/时间空白，页面当前使用日期 |
| 方便联系时间 | `preferredContactTime` | `text` | 时间段，如工作日 18:00 后 |
| 复诊医生/营养师 | `followUpClinician` | `text` | 纸表印“复诊医生”，页面按平台角色统一扩展为医生/营养师 |
| 复诊日期 | `followUpDate` | `date` | 复诊计划日期 |
| 管理计划补充 | `planNotes` | `textarea` | 系统扩展 |

## 4. 系统生成、带入与计算项

| 项目 | 来源/计算方式 |
| --- | --- |
| 患者姓名、手机号 | 来自患者账号和当前照护关系，不进入 `answers` |
| 档案编号 | 首次保存后使用系统生成的 `PatientArchive.id` 展示 |
| 模板版本 | 后端固定保存为 `TCM_WEIGHT_V1` |
| 建档日期 | `archiveDate` 首次打开时默认当前本地日期 |
| 性别、出生日期、身高、建档体重、目标体重 | 优先由患者资料带入，医生/营养师可在档案中补录 |
| 年龄 | 由 `birthDate` 与当前日期计算，只展示，不另存 `ageYears` |
| BMI | `weightKg / (heightCm / 100)²`，保留一位小数；页面只读 |
| 完成度 | 当前模板中有值字段数 ÷ 全部字段数，四舍五入为整数百分比 |
| 创建/更新/完成时间及操作人 | 由后端保存为 `createdAt`、`updatedAt`、`completedAt`、`createdById`、`updatedById` |

## 5. 医学名称与单位疑点

以下内容是对纸表印刷内容的忠实审阅结果，不应把不清晰或疑似错印的文字当作已经获得医学确认：

1. **尿素氮**：纸表实际印为“尿素尿酸”，并标 `umol/L`，名称和单位均可疑。当前页面暂规范为 `bloodUreaNitrogen` / “尿素氮” / `mmol/L`，正式上线前应由医生或检验专业人员确认。
2. **ALT/AST**：纸表旁单位看起来像 `nmol/L`，而当前页面采用临床常见的 `U/L`。需确认原表是否排版或印刷错误。
3. **TSH、FT3、FT4**：TSH 单位在照片中不清楚，FT3 旁似印 `mol/L`，FT4 的右侧值线和单位被照片边缘裁掉。当前页面采用 TSH `mIU/L`、FT3/FT4 `pmol/L`，需结合实际检验单确认；必要时还应记录检验机构和参考区间。
4. **PCOS**：纸表印“多内分泌代谢卵巢综合征（PMOS）”，高度疑似错误。页面使用临床常用的“多囊卵巢综合征（PCOS）”，选项值为 `PCOS`。
5. **排便频率**：纸表“便秘”后为空格加“日/次”，当前 schema 的 `stoolTimesPerDay` 为“次/日”。该字段含义需确认，避免把便秘间隔误录为每日次数。
在上述疑点完成医学确认前，界面不得根据蓝色手写内容推断单位、正常范围、诊断或治疗结论。
