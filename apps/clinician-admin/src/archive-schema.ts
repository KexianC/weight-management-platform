import type { ClinicalArchiveData } from './types';

export type ArchiveFieldOption = { value: string; label: string };
export type ArchiveFieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'radio' | 'checkboxes';

export type ArchiveField = {
  key: string;
  label: string;
  type: ArchiveFieldType;
  description?: string;
  placeholder?: string;
  unit?: string;
  options?: ArchiveFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  span?: 'full' | 'half' | 'third';
  rows?: number;
};

export type ArchiveSection = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  fields: ArchiveField[];
};

const yesNo: ArchiveFieldOption[] = [
  { value: 'NO', label: '无' },
  { value: 'YES', label: '有' },
];

const yesNoUnknown: ArchiveFieldOption[] = [
  { value: 'NO', label: '无' },
  { value: 'YES', label: '有' },
  { value: 'UNKNOWN', label: '不详' },
];

const option = (value: string, label: string): ArchiveFieldOption => ({ value, label });

export const archiveSections: ArchiveSection[] = [
  {
    id: 'body-basics',
    title: '基础体格',
    shortTitle: '基础体格',
    description: '登记建档日期、职业和基础人体测量指标，BMI 会根据身高和体重自动计算。',
    fields: [
      { key: 'archiveDate', label: '建档日期', type: 'date', span: 'third' },
      { key: 'gender', label: '性别', type: 'select', span: 'third', options: [option('MALE', '男'), option('FEMALE', '女'), option('OTHER', '其他'), option('UNKNOWN', '未知')] },
      { key: 'birthDate', label: '出生日期', type: 'date', span: 'third', description: '年龄由出生日期自动计算。' },
      { key: 'occupation', label: '从事行业', type: 'select', span: 'third', options: [option('EMPLOYEE', '企业员工'), option('SELF_EMPLOYED', '个体工商户'), option('HOMEMAKER', '家庭妇女'), option('WORKER', '工人'), option('HEALTHCARE', '医护'), option('TEACHER', '教师'), option('SERVICE', '服务行业'), option('CIVIL_SERVANT', '公务员'), option('RETIRED', '退休'), option('STUDENT', '学生'), option('CHILD', '儿童'), option('OTHER', '其他')] },
      { key: 'occupationOther', label: '其他行业说明', type: 'text', span: 'third', placeholder: '如自由职业、待业等' },
      { key: 'heightCm', label: '身高', type: 'number', unit: 'cm', min: 80, max: 250, step: 0.1, span: 'third' },
      { key: 'weightKg', label: '建档体重', type: 'number', unit: 'kg', min: 25, max: 350, step: 0.1, span: 'third' },
      { key: 'bmi', label: 'BMI', type: 'number', unit: 'kg/m²', step: 0.1, span: 'third', description: '根据身高、体重自动计算，也可由后端保存。' },
      { key: 'neckCircumferenceCm', label: '颈围', type: 'number', unit: 'cm', min: 10, max: 100, step: 0.1, span: 'third' },
      { key: 'waistCircumferenceCm', label: '腰围', type: 'number', unit: 'cm', min: 30, max: 250, step: 0.1, span: 'third' },
      { key: 'hipCircumferenceCm', label: '臀围', type: 'number', unit: 'cm', min: 30, max: 250, step: 0.1, span: 'third' },
      { key: 'systolicBloodPressure', label: '收缩压', type: 'number', unit: 'mmHg', min: 50, max: 300, span: 'third' },
      { key: 'diastolicBloodPressure', label: '舒张压', type: 'number', unit: 'mmHg', min: 30, max: 200, span: 'third' },
      { key: 'bodyMeasurementNotes', label: '体格测量备注', type: 'textarea', span: 'full', rows: 2, placeholder: '填写测量条件、设备或其他说明' },
    ],
  },
  {
    id: 'medical-labs',
    title: '疾病、用药与检验',
    shortTitle: '疾病与检验',
    description: '按纸质档案记录代谢相关疾病、长期用药和现有检验结果；无结果的项目可留空后补。',
    fields: [
      { key: 'hypertension', label: '高血压', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'hypertensionMedicationUsed', label: '高血压是否用药', type: 'radio', options: yesNo, span: 'half' },
      { key: 'hypertensionMedication', label: '高血压用药', type: 'text', span: 'half', placeholder: '药名、剂量、频次' },
      { key: 'dyslipidemia', label: '高血脂', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'dyslipidemiaMedicationUsed', label: '高血脂是否用药', type: 'radio', options: yesNo, span: 'half' },
      { key: 'dyslipidemiaMedication', label: '高血脂用药', type: 'text', span: 'half', placeholder: '药名、剂量、频次' },
      { key: 'diabetes', label: '糖尿病', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'insulinResistance', label: '胰岛素抵抗', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'diabetesMedicationUsed', label: '糖尿病是否用药', type: 'radio', options: yesNo, span: 'half' },
      { key: 'diabetesMedication', label: '糖尿病相关用药', type: 'text', span: 'full', placeholder: '口服药或胰岛素方案' },
      { key: 'gout', label: '痛风', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'goutMedicationUsed', label: '痛风是否用药', type: 'radio', options: yesNo, span: 'half' },
      { key: 'goutMedication', label: '痛风用药', type: 'text', span: 'half', placeholder: '药名、剂量、频次' },
      { key: 'fattyLiverSeverity', label: '脂肪肝', type: 'radio', span: 'full', options: [option('NONE', '无'), option('MILD', '轻度'), option('MODERATE', '中度'), option('SEVERE', '重度'), option('UNKNOWN', '不详')] },
      { key: 'fattyLiverMedicationUsed', label: '脂肪肝是否用药', type: 'radio', options: yesNo, span: 'half' },
      { key: 'fattyLiverMedication', label: '脂肪肝用药', type: 'text', span: 'half', placeholder: '药名、剂量、频次' },
      { key: 'hypothyroidism', label: '甲减', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'thyroidMedicationUsed', label: '甲状腺是否用药', type: 'radio', options: yesNo, span: 'half' },
      { key: 'thyroidMedication', label: '甲状腺用药', type: 'text', span: 'half', placeholder: '药名、剂量、频次' },
      { key: 'foodAllergy', label: '慢性食物过敏', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'foodAllergyDetails', label: '过敏食物或表现', type: 'text', span: 'half', placeholder: '食物名称及反应' },
      { key: 'foodAllergyMedicationUsed', label: '食物过敏是否用药', type: 'radio', options: yesNo, span: 'half' },
      { key: 'foodAllergyMedication', label: '食物过敏用药', type: 'text', span: 'half', placeholder: '药名、剂量、频次' },
      { key: 'otherMedicalHistory', label: '其他病史', type: 'textarea', span: 'full', rows: 2, placeholder: '补充其他确诊疾病和诊疗情况' },
      { key: 'longTermMedication', label: '目前长期服用药物', type: 'textarea', span: 'full', rows: 2, placeholder: '填写药名、剂量、频次及开始时间' },
      { key: 'medicationAdherence', label: '是否按时服药', type: 'radio', options: [option('YES', '是'), option('NO', '否')], span: 'half' },
      { key: 'medicationNonAdherenceReasons', label: '未按时服药原因', type: 'checkboxes', options: [option('FORGET', '容易遗忘'), option('DISLIKE', '不喜欢吃药'), option('SIDE_EFFECT', '副作用感受不好'), option('OTHER', '其他')], span: 'full' },
      { key: 'medicationNonAdherenceOther', label: '其他未按时原因', type: 'text', span: 'full' },
      { key: 'medicationNotes', label: '用药补充说明', type: 'textarea', span: 'full', rows: 2 },
      { key: 'totalCholesterol', label: '总胆固醇', type: 'number', unit: 'mmol/L', step: 0.01, span: 'third' },
      { key: 'hdlCholesterol', label: '高密度脂蛋白', type: 'number', unit: 'mmol/L', step: 0.01, span: 'third' },
      { key: 'ldlCholesterol', label: '低密度脂蛋白', type: 'number', unit: 'mmol/L', step: 0.01, span: 'third' },
      { key: 'triglycerides', label: '甘油三酯', type: 'number', unit: 'mmol/L', step: 0.01, span: 'third' },
      { key: 'fastingGlucose', label: '空腹血糖', type: 'number', unit: 'mmol/L', step: 0.01, span: 'third' },
      { key: 'postprandial2hGlucose', label: '餐后 2h 血糖', type: 'number', unit: 'mmol/L', step: 0.01, span: 'third' },
      { key: 'fastingInsulin', label: '空腹胰岛素', type: 'number', unit: 'pmol/L', step: 0.01, span: 'third' },
      { key: 'postprandial2hInsulin', label: '餐后 2h 胰岛素', type: 'number', unit: 'pmol/L', step: 0.01, span: 'third' },
      { key: 'hba1c', label: '糖化血红蛋白', type: 'number', unit: '%', step: 0.1, span: 'third' },
      { key: 'uricAcid', label: '尿酸', type: 'number', unit: 'μmol/L', step: 0.1, span: 'third' },
      { key: 'creatinine', label: '肌酐', type: 'number', unit: 'μmol/L', step: 0.1, span: 'third' },
      { key: 'bloodUreaNitrogen', label: '尿素氮', type: 'number', unit: 'mmol/L', step: 0.01, span: 'third' },
      { key: 'visceralFatIndex', label: '内脏脂肪指数', type: 'number', step: 0.1, span: 'third' },
      { key: 'liverCap', label: 'CAP（受控衰减参数）', type: 'number', unit: 'dB/m', step: 0.1, span: 'third' },
      { key: 'liverElasticity', label: '肝脏 E 弹性值', type: 'number', unit: 'kPa', step: 0.1, span: 'third' },
      { key: 'alt', label: '丙氨酸转氨酶 ALT', type: 'number', unit: 'U/L', step: 0.1, span: 'third' },
      { key: 'ast', label: '天门冬氨酸转氨酶 AST', type: 'number', unit: 'U/L', step: 0.1, span: 'third' },
      { key: 'tsh', label: '促甲状腺激素 TSH', type: 'number', unit: 'mIU/L', step: 0.01, span: 'third' },
      { key: 'ft3', label: '游离三碘甲状腺原氨酸 FT3', type: 'number', unit: 'pmol/L', step: 0.01, span: 'third' },
      { key: 'ft4', label: '游离甲状腺素 FT4', type: 'number', unit: 'pmol/L', step: 0.01, span: 'third' },
      { key: 'foodIgg', label: '食物特异性 IgG', type: 'textarea', span: 'full', rows: 2, placeholder: '填写检验结果或阳性食物' },
      { key: 'laboratoryDate', label: '检验日期', type: 'date', span: 'half' },
      { key: 'laboratoryNotes', label: '检验备注', type: 'textarea', span: 'full', rows: 2, placeholder: '填写参考区间、检验机构或其他结果' },
    ],
  },
  {
    id: 'symptoms-family',
    title: '肥胖相关症状与家族史',
    shortTitle: '症状与家族史',
    description: '记录肥胖相关症状、并发疾病、女性月经情况及直系亲属疾病史。',
    fields: [
      { key: 'obesitySymptoms', label: '肥胖相关症状', type: 'checkboxes', span: 'full', options: [option('FATIGUE', '乏力'), option('DAYTIME_SLEEPINESS', '易困嗜睡'), option('SNORING', '打鼾'), option('ACANTHOSIS', '黑棘皮症'), option('NECK_LINES', '颈纹'), option('LIMB_EDEMA', '四肢水肿'), option('FACIAL_EDEMA', '面部水肿'), option('OTHER', '其他')] },
      { key: 'obesitySymptomOther', label: '其他症状说明', type: 'text', span: 'full' },
      { key: 'comorbidHistory', label: '其他相关病史', type: 'checkboxes', span: 'full', options: [option('OSAS', '阻塞性睡眠呼吸暂停综合征（OSAS）'), option('ATHEROSCLEROSIS', '动脉粥样硬化'), option('REFLUX', '反流性胃炎或食管炎'), option('OSTEOARTHRITIS', '退行性关节炎'), option('GROWTH_DELAY', '生长发育迟缓'), option('PSYCHOLOGICAL', '轻中度心理疾病'), option('PCOS', '多囊卵巢综合征（PCOS）'), option('HYPOTHYROID', '甲减'), option('HYPERTHYROID', '甲亢'), option('HASHIMOTO', '桥本甲状腺炎'), option('ALLERGY', '过敏史'), option('OTHER', '其他')] },
      { key: 'comorbidHistoryOther', label: '其他病史说明', type: 'textarea', span: 'full', rows: 2 },
      { key: 'menstrualLastDate', label: '末次月经', type: 'date', span: 'third' },
      { key: 'menstrualDurationDays', label: '月经持续天数', type: 'number', unit: '天', min: 1, max: 30, span: 'third' },
      { key: 'menstrualCycleDays', label: '月经周期', type: 'number', unit: '天', min: 10, max: 120, span: 'third' },
      { key: 'menstrualVolumeMl', label: '经量', type: 'number', unit: 'ml/周期', min: 0, max: 1000, span: 'third' },
      { key: 'familyDiabetes', label: '家族糖尿病史', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'familyDiabetesRelation', label: '糖尿病亲属关系', type: 'text', span: 'half', placeholder: '如父亲、祖母' },
      { key: 'familyCoronaryDisease', label: '家族冠心病史', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'familyCoronaryRelation', label: '冠心病亲属关系', type: 'text', span: 'half' },
      { key: 'familyStroke', label: '家族脑梗死史', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'familyStrokeRelation', label: '脑梗死亲属关系', type: 'text', span: 'half' },
      { key: 'familyHypertension', label: '家族高血压史', type: 'radio', options: yesNoUnknown, span: 'half' },
      { key: 'familyHypertensionRelation', label: '高血压亲属关系', type: 'text', span: 'half' },
      { key: 'familyOtherHistory', label: '其他家族史', type: 'textarea', span: 'full', rows: 2, placeholder: '疾病名称及亲属关系' },
    ],
  },
  {
    id: 'obesity-factors',
    title: '肥胖影响因素',
    shortTitle: '影响因素',
    description: '按饮食摄入、运动消耗、生理疾病药物情绪及成长工作环境四类因素多选。',
    fields: [
      { key: 'dietExcessFactors', label: '饮食因素（热量摄入过多）', type: 'checkboxes', span: 'full', options: [
        option('REFINED_STAPLES', '主食偏爱精制米面、淀粉类食物'), option('SUGARY_DRINKS', '经常饮用奶茶、果汁、碳酸等含糖饮料'), option('LOW_WATER', '每日饮水量少，不爱主动喝水'), option('SWEETS', '经常吃蛋糕、饼干、糖果等甜点'), option('RICH_SOUP', '常喝浓稠肉汤、甜羹、浓汤'), option('HEAVY_TASTE', '饮食口味重，无辣不欢'), option('ANIMAL_OFFAL', '频繁食用动物内脏'), option('HIGH_SUGAR_FRUIT', '过量食用榴莲、葡萄等高糖水果'), option('HIGH_MEAT_RATIO', '三餐肉类占比过高'), option('BRAISED_OILY', '做菜、点餐偏爱红烧、卤味重油做法'), option('FRIED_FOOD', '爱吃油条、炸鸡、薯条等油炸食品'), option('SALTY', '日常饮食口味偏咸'), option('FATTY_MEAT', '经常吃肥肉、五花肉'), option('LOW_VEGETABLES', '正餐很少吃绿叶蔬菜，蔬菜摄入不足'), option('FREQUENT_TAKEOUT', '每周 3 次以上在外就餐或外卖'), option('FAST_EATING', '吃饭速度快，狼吞虎咽'), option('SKIP_BREAKFAST', '经常不吃早餐，空腹到中午'), option('BINGE_EATING', '容易暴饮暴食，一餐吃撑'), option('LATE_NIGHT_SNACK', '有吃宵夜习惯，睡前进食'), option('ICE_DESSERTS', '一年四季常吃冰饮、冰甜品'), option('FREQUENT_ALCOHOL', '有饮酒习惯，频繁喝酒'), option('BAKERY', '常吃面包、糕点、酥皮点心等糖油混合物'), option('EXTREME_LOW_CARB', '长期极端控碳，完全不吃主食'), option('IRREGULAR_MEALS', '三餐时间混乱，无固定时段'),
      ] },
      { key: 'exerciseDeficitFactors', label: '运动消耗因素（热量消耗过少）', type: 'checkboxes', span: 'full', options: [option('NO_EXERCISE', '日常不爱运动，几乎无锻炼习惯'), option('INJURY_LIMIT', '身体存在伤病、行动不便或活动受限'), option('POST_MILITARY_ACTIVITY_DROP', '退伍后作息、活动量大幅下降'), option('ATHLETE_RETIRED', '专业运动员退役，运动量断崖式减少'), option('POST_EXERCISE_BINGE', '高强度运动后容易出现代偿性暴食')] },
      { key: 'physiologyDiseaseEmotionFactors', label: '生理、疾病、药物与情绪因素', type: 'checkboxes', span: 'full', options: [option('CHILDHOOD_OBESITY', '幼儿时期就存在超重或肥胖'), option('PUBERTY_GAIN', '青春期体重快速上涨发胖'), option('POST_PREGNANCY', '怀孕后体重增长过多难以回落'), option('LACTATION_OVERFEED', '哺乳期进补过度，体重居高不下'), option('MENOPAUSE', '更年期代谢下降，持续发胖'), option('MIDDLE_AGE', '中年后逐年发胖，控制困难'), option('PARENTS_OBESE', '父母单方或双方均肥胖'), option('GENETIC_TENDENCY', '有明显家族肥胖遗传倾向'), option('OBESOGENIC_DRUGS', '长期服用激素类、抗抑郁等易致发胖药物'), option('EMOTIONAL_EATING', '容易焦虑、压力大，依靠进食缓解情绪'), option('ENDOCRINE_DISEASE', '患有甲减、多囊、库欣等易引发肥胖的基础疾病'), option('JET_LAG', '经常跨地区出差、倒时差，作息紊乱')] },
      { key: 'growthWorkEnvironmentFactors', label: '成长、生活与工作环境因素', type: 'checkboxes', span: 'full', options: [option('MACROSOMIA', '出生时为巨大儿'), option('LOW_BIRTH_WEIGHT', '出生低体重，后天易发胖'), option('PRETERM', '属于早产儿'), option('MARITAL_CHANGE', '经历离婚、分居等婚姻重大变故'), option('SINGLE_PARENT', '单亲家庭生活'), option('SEDENTARY_WORK', '日常工作久坐，几乎无活动时间'), option('LIVED_WITH_GRANDPARENTS', '从小和祖辈同住，饮食重油重糖'), option('STUDY_STRESS', '学生阶段学习压力大，情绪性暴食'), option('JOB_CHANGE', '近期更换工作，生活节奏打乱'), option('UNEMPLOYED', '经历失业，作息饮食失控'), option('LONG_HIGH_PRESSURE', '长期工作高压，精神持续紧绷'), option('FREQUENT_TRANSFER', '频繁调换岗位，工作内容变动'), option('AFTER_MARRIAGE', '婚后饮食习惯改变，逐步长胖'), option('OVERTIME', '经常加班，作息不规律'), option('NIGHT_SHIFT', '长期上夜班、昼夜颠倒'), option('BUSINESS_ENTERTAINMENT', '商务应酬多，频繁聚餐喝酒'), option('FREQUENT_TRAVEL', '常年各地出差，饮食运动无法规律')] },
      { key: 'obesityFactorNotes', label: '影响因素补充说明', type: 'textarea', span: 'full', rows: 3, placeholder: '补充诱因、发生时间及对体重的影响' },
    ],
  },
  {
    id: 'weight-loss-history',
    title: '既往减重史',
    shortTitle: '既往减重史',
    description: '记录曾尝试的减重方法、持续时间、效果及反弹情况。',
    fields: [
      { key: 'pastWeightLossMethods', label: '使用过的减重方法', type: 'checkboxes', span: 'full', options: [option('NONE', '无'), option('EXERCISE', '运动'), option('MEDICATION', '药物'), option('ACUPUNCTURE', '针灸'), option('DIET', '节食'), option('LIPOSUCTION', '吸脂'), option('OTHER', '其他')] },
      { key: 'pastWeightLossOther', label: '其他减重方法', type: 'text', span: 'full' },
      { key: 'weightLossExperience', label: '减重经历', type: 'textarea', span: 'full', rows: 4, placeholder: '填写时间、方法、减重幅度、维持时间、反弹及不良反应' },
      { key: 'lowestAdultWeightKg', label: '成年最低体重', type: 'number', unit: 'kg', min: 25, max: 350, step: 0.1, span: 'third' },
      { key: 'highestAdultWeightKg', label: '成年最高体重', type: 'number', unit: 'kg', min: 25, max: 350, step: 0.1, span: 'third' },
      { key: 'weightGainStartDate', label: '明显增重开始时间', type: 'date', span: 'third' },
    ],
  },
  {
    id: 'exercise-diet',
    title: '运动与 24 小时饮食',
    shortTitle: '运动与饮食',
    description: '记录日常运动量、运动爱好、24 小时饮食回顾、口味偏好、饮水及饮酒情况。',
    fields: [
      { key: 'dailyActivityLevel', label: '日常运动量', type: 'radio', span: 'full', options: [option('SEDENTARY', '久坐少运动'), option('LIGHT', '轻度运动'), option('MODERATE', '中度运动'), option('HIGH', '大量运动')] },
      { key: 'exercisePreference', label: '个人运动爱好', type: 'textarea', span: 'full', rows: 2, placeholder: '运动项目、每次时长、频次及限制' },
      { key: 'breakfastRecall', label: '24h 回顾·早餐', type: 'textarea', span: 'half', rows: 3, placeholder: '时间、食物及大致份量' },
      { key: 'lunchRecall', label: '24h 回顾·中餐', type: 'textarea', span: 'half', rows: 3, placeholder: '时间、食物及大致份量' },
      { key: 'dinnerRecall', label: '24h 回顾·晚餐', type: 'textarea', span: 'half', rows: 3, placeholder: '时间、食物及大致份量' },
      { key: 'snackRecall', label: '24h 回顾·加餐', type: 'textarea', span: 'half', rows: 3, placeholder: '时间、食物及大致份量' },
      { key: 'foodPreferences', label: '饮食偏好', type: 'checkboxes', span: 'full', options: [option('RICE', '米饭'), option('NOODLES', '面食'), option('SWEET', '甜食'), option('MEAT', '肉类'), option('FISH', '鱼类'), option('VEGETABLE', '蔬菜'), option('FRUIT', '水果'), option('FRIED', '油炸食品'), option('SNACK', '零食'), option('ALCOHOL', '酒类'), option('DRINKS', '饮料')] },
      { key: 'tastePreferences', label: '口味爱好', type: 'checkboxes', span: 'full', options: [option('SALTY', '咸'), option('SWEET', '甜'), option('SOUR', '酸'), option('SPICY', '辣'), option('OILY', '重油')] },
      { key: 'socialMealsPerWeek', label: '应酬次数', type: 'number', unit: '次/周', min: 0, max: 50, span: 'third' },
      { key: 'alcoholTimesPerWeek', label: '饮酒次数', type: 'number', unit: '次/周', min: 0, max: 50, span: 'third' },
      { key: 'alcoholStrength', label: '酒精度数', type: 'number', unit: '度', min: 0, max: 100, step: 0.1, span: 'third' },
      { key: 'alcoholAmountMl', label: '每次饮酒量', type: 'number', unit: 'ml', min: 0, max: 5000, span: 'third' },
      { key: 'dailyWaterMl', label: '每日饮水量', type: 'number', unit: 'ml', min: 0, max: 10000, span: 'third' },
      { key: 'dietOtherNotes', label: '其他饮食说明', type: 'textarea', span: 'full', rows: 2, placeholder: '如茶饮、咖啡、保健品或特殊饮食' },
    ],
  },
  {
    id: 'sleep-elimination',
    title: '睡眠与二便',
    shortTitle: '睡眠与二便',
    description: '记录作息规律、睡眠表现、夜尿、排尿和排便情况。',
    fields: [
      { key: 'scheduleRegular', label: '作息时间规律', type: 'radio', options: [option('YES', '是'), option('NO', '否')], span: 'half' },
      { key: 'scheduleDescription', label: '作息描述', type: 'text', span: 'half', placeholder: '如 23:00–07:00' },
      { key: 'sleepStatus', label: '睡眠状态', type: 'radio', span: 'half', options: [option('NORMAL', '正常'), option('ABNORMAL', '异常')] },
      { key: 'sleepProblems', label: '睡眠异常表现', type: 'checkboxes', span: 'full', options: [option('FALL_ASLEEP_DIFFICULT', '入睡困难'), option('INSOMNIA', '失眠'), option('DREAMY', '多梦'), option('EASY_WAKE', '易醒'), option('WAKE_DIFFICULT', '起床困难')] },
      { key: 'nocturiaTimes', label: '起夜次数', type: 'number', unit: '次/晚', min: 0, max: 20, span: 'third' },
      { key: 'urinationStatus', label: '排尿情况', type: 'checkboxes', span: 'full', options: [option('NORMAL', '正常'), option('OLIGURIA', '少尿'), option('POLYURIA', '多尿'), option('ANURIA', '无尿'), option('BLADDER_IRRITATION', '膀胱刺激征'), option('RETENTION', '尿潴留'), option('INCONTINENCE', '尿失禁')] },
      { key: 'stoolStatus', label: '排便情况', type: 'radio', span: 'full', options: [option('NORMAL', '正常'), option('CONSTIPATION', '便秘'), option('DIARRHEA', '腹泻')] },
      { key: 'stoolTimesPerDay', label: '排便次数', type: 'number', unit: '次/日', min: 0, max: 30, span: 'third' },
      { key: 'laxativeUse', label: '辅助排便', type: 'radio', options: yesNo, span: 'third' },
      { key: 'diarrheaTimesPerDay', label: '腹泻频次', type: 'number', unit: '次/日', min: 0, max: 30, span: 'third' },
      { key: 'sleepEliminationNotes', label: '睡眠与二便补充', type: 'textarea', span: 'full', rows: 3 },
    ],
  },
  {
    id: 'tcm-plan',
    title: '中医辨证与管理计划',
    shortTitle: '辨证与计划',
    description: '记录中医体质辨证、医嘱、减脂方案和复诊安排。',
    fields: [
      { key: 'tcmConstitution', label: '中医体质辨证', type: 'textarea', span: 'full', rows: 4, placeholder: '填写证型、舌脉等辨证依据' },
      { key: 'medicalAdvice', label: '医嘱', type: 'textarea', span: 'full', rows: 4, placeholder: '填写饮食、运动、用药、监测及风险提醒' },
      { key: 'fatLossPlan', label: '减脂方案', type: 'textarea', span: 'full', rows: 5, placeholder: '填写阶段目标、能量方案、运动处方和随访频率' },
      { key: 'targetWeightKg', label: '目标体重', type: 'number', unit: 'kg', min: 25, max: 350, step: 0.1, span: 'third' },
      { key: 'otherGoals', label: '其他目标', type: 'text', span: 'third', placeholder: '如腰围、体脂率、血糖目标' },
      { key: 'planStartDate', label: '具体开始时间', type: 'date', span: 'third' },
      { key: 'preferredContactTime', label: '方便联系时间', type: 'text', span: 'half', placeholder: '如工作日 18:00 后' },
      { key: 'followUpClinician', label: '复诊医生/营养师', type: 'text', span: 'half' },
      { key: 'followUpDate', label: '复诊日期', type: 'date', span: 'half' },
      { key: 'planNotes', label: '管理计划补充', type: 'textarea', span: 'full', rows: 3 },
    ],
  },
];

export function isArchiveValueFilled(value: ClinicalArchiveData[string]): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null && value !== '';
}

export function nextArchiveCheckboxValues(key: string, current: string[], optionValue: string, checked: boolean): string[] {
  const exclusiveValue = key === 'pastWeightLossMethods' ? 'NONE' : key === 'urinationStatus' ? 'NORMAL' : undefined;
  if (checked && exclusiveValue === optionValue) return [optionValue];
  let next = checked ? [...new Set([...current, optionValue])] : current.filter((item) => item !== optionValue);
  if (checked && exclusiveValue) next = next.filter((item) => item !== exclusiveValue);
  return next;
}

export function isArchiveFieldVisible(field: ArchiveField, data: ClinicalArchiveData): boolean {
  if (field.key.startsWith('menstrual') && data.gender !== 'FEMALE') return false;
  if (field.key === 'medicationNonAdherenceReasons' && data.medicationAdherence !== 'NO') return false;
  if (field.key === 'medicationNonAdherenceOther') {
    return data.medicationAdherence === 'NO'
      && Array.isArray(data.medicationNonAdherenceReasons)
      && data.medicationNonAdherenceReasons.includes('OTHER');
  }
  return true;
}

export function archiveCompletion(data: ClinicalArchiveData): {
  percentage: number;
  completedSections: number;
  totalSections: number;
  filledFields: number;
  totalFields: number;
} {
  const allFields = archiveSections.flatMap((section) => section.fields.filter((field) => isArchiveFieldVisible(field, data)));
  const filledFields = allFields.filter((field) => isArchiveValueFilled(data[field.key])).length;
  const completedSections = archiveSections.filter((section) => section.fields.filter((field) => isArchiveFieldVisible(field, data)).some((field) => isArchiveValueFilled(data[field.key]))).length;
  return {
    percentage: Math.round((filledFields / allFields.length) * 100),
    completedSections,
    totalSections: archiveSections.length,
    filledFields,
    totalFields: allFields.length,
  };
}

export function archiveDefaults(patient: {
  gender?: string;
  birthDate?: string;
  heightCm?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
}): ClinicalArchiveData {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return {
    archiveDate: now.toISOString().slice(0, 10),
    ...(patient.gender ? { gender: patient.gender } : {}),
    ...(patient.birthDate ? { birthDate: patient.birthDate.slice(0, 10) } : {}),
    ...(patient.heightCm !== undefined ? { heightCm: patient.heightCm } : {}),
    ...(patient.currentWeightKg !== undefined ? { weightKg: patient.currentWeightKg } : {}),
    ...(patient.targetWeightKg !== undefined ? { targetWeightKg: patient.targetWeightKg } : {}),
  };
}
