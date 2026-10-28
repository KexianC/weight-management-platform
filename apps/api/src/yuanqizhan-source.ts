// Transcribed original contract v0; display corrections are applied separately.
export const YUANQIZHAN_SOURCE_FORMS = [
  {
    "id": "daily",
    "title": "元气盏日常打卡表",
    "source_url": "https://v.wjx.cn/vm/tUPWibG.aspx",
    "question_count": 9,
    "questions": [
      {
        "key": "name",
        "label_original": "您的姓名：",
        "type": "text",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "identity",
        "unit": null,
        "source_question_number": 1
      },
      {
        "key": "fasting_weight",
        "label_original": "今日空腹体重（标注单位）：",
        "type": "text",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today",
        "unit": "由填写者在文本中标注；日常表未限定单位",
        "validation_unknown": [
          "数值范围",
          "小数位",
          "单位枚举"
        ],
        "source_question_number": 2
      },
      {
        "key": "fatigue",
        "label_original": "疲劳感:选最接近的昨天整体状态",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday",
        "options": [
          {
            "order": 1,
            "label_original": "1分:精力充沛，下班后仍有体力做想做的事",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:状态不错，偶有疲惫，休息后即恢复",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:一般疲惫，需要靠咖啡/茶撑过下午",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:明显乏力，工作间隙总想趴一会儿",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:极度疲劳，起床就觉得累，全天提不起劲",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 3
      },
      {
        "key": "hunger",
        "label_original": "饥饿感:取昨天下午至晚餐前最饿的时段",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday_afternoon_before_dinner_peak",
        "options": [
          {
            "order": 1,
            "label_original": "1分:完全不饿，甚至到了饭点也没有食欲",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:轻微饿感，喝点水就过去",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:正常饥饿，到饭点该有的饿",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:明显饥饿，注意力被饥饿打扰",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:强烈饥饿，头晕、手抖、心慌，必须马上吃",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 4
      },
      {
        "key": "appetite",
        "label_original": "食欲变化:昨天相对你平时的饭量",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday_vs_usual",
        "options": [
          {
            "order": 1,
            "label_original": "-2分:食欲明显减退，看到食物没什么兴趣",
            "display_score": -2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "-1分:略微比平时吃得少",
            "display_score": -1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "0分:和平时一样",
            "display_score": 0,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "+1分::略微比平时想吃/吃得多",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "+2:分:食欲亢进，总想吃东西",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 5
      },
      {
        "key": "sleep_quality",
        "label_original": "昨晚的睡眠质量:",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "last_night",
        "options": [
          {
            "order": 1,
            "label_original": "1分:几乎没睡好，多梦易醒或入睡困难",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:睡眠浅，醒来仍疲惫",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:一般，凑合睡了一晚",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:睡得比较沉，晨起状态不错",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:一觉到天亮，晨起神清气爽",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 6
      },
      {
        "key": "energy_complexion",
        "label_original": "昨日的精力/气色自评：",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday",
        "options": [
          {
            "order": 1,
            "label_original": "1分:面色暗沉、精神萎靡，对镜明显疲态",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:面色略差，略有疲态",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:一般，与平日无明显差异",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:面色红润、状态不错",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:神采奕奕，明显好于平日",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 7
      },
      {
        "key": "bowel_observation",
        "label_original": "今日排便次数：____    过程是否顺畅：____ （顺畅/稍费力/困难/腹胀） 附加观察：____ （颜色偏深/偏干/偏/气味明显/无异常）",
        "type": "inline_multiple_text",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today",
        "transcription_note": "____表示页面输入框，非原文下划线；排版空白已规范化，文字保留原样",
        "subfields": [
          {
            "key": "bowel_count",
            "label_original": "今日排便次数：",
            "type": "text",
            "hint_original": null,
            "required": null
          },
          {
            "key": "bowel_ease",
            "label_original": "过程是否顺畅：",
            "type": "text",
            "hint_original": "（顺畅/稍费力/困难/腹胀）",
            "required": null
          },
          {
            "key": "bowel_extra",
            "label_original": "附加观察：",
            "type": "text",
            "hint_original": "（颜色偏深/偏干/偏/气味明显/无异常）",
            "required": null
          }
        ],
        "validation_unknown": [
          "逐空必填规则未通过提交验证",
          "次数数值限制未验证"
        ],
        "source_note": "此题整体标必填。括号内容为输入框旁文字提示，不是选择题选项",
        "source_question_number": 8
      },
      {
        "key": "stool_type",
        "label_original": "大便性状",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "not_explicit_in_label",
        "context_note": "紧接今日排便题，推断为同一观察期；标题自身未写今日，不当成已验证事实",
        "options": [
          {
            "order": 1,
            "label_original": "型1：坚硬颗粒状，像坚果一样分散排出（严重便秘）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 2,
            "label_original": "型2：腊肠状但表面凹凸结块（轻度便秘）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 3,
            "label_original": "型3：腊肠状，表面有裂痕（正常偏干）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 4,
            "label_original": "型4：光滑柔软的腊肠/蛇形（理想态★）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 5,
            "label_original": "型5：柔软块状、边缘清晰（偏软，纤维不足）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 6,
            "label_original": "型6：糊状、边缘蓬松（轻度腹泻）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 7,
            "label_original": "型7：完全水状、无固体（腹泻)",
            "display_score": null,
            "score_evidence": null
          }
        ],
        "category_codes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7
        ],
        "category_note": "型1—型7是分类，不是已验证临床评分或可直接求和的分值",
        "source_question_number": 9
      }
    ]
  },
  {
    "id": "milestone",
    "title": "元气盏第1/8/15日打卡表",
    "source_url": "https://v.wjx.cn/vm/YThognJ.aspx",
    "question_count": 16,
    "questions": [
      {
        "key": "name",
        "label_original": "您的姓名：",
        "type": "text",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "identity",
        "unit": null,
        "source_question_number": 1
      },
      {
        "key": "fasting_weight",
        "label_original": "今日空腹体重（标注单位，斤或者公斤）：",
        "type": "text",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today",
        "unit": "斤或者公斤，由填写者在文本中标注",
        "validation_unknown": [
          "数值范围",
          "小数位",
          "单位枚举"
        ],
        "source_question_number": 2
      },
      {
        "key": "fasting_waist",
        "label_original": "今日空腹腰围（厘米）：",
        "type": "text",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today",
        "unit": "厘米",
        "validation_unknown": [
          "数值范围",
          "小数位"
        ],
        "source_question_number": 3
      },
      {
        "key": "fatigue",
        "label_original": "疲劳感:选最接近的昨天整体状态",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday",
        "options": [
          {
            "order": 1,
            "label_original": "1分:精力充沛，下班后仍有体力做想做的事",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:状态不错，偶有疲惫，休息后即恢复",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:一般疲惫，需要靠咖啡/茶撑过下午",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:明显乏力，工作间隙总想趴一会儿",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:极度疲劳，起床就觉得累，全天提不起劲",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 4
      },
      {
        "key": "hunger",
        "label_original": "饥饿感:取昨天下午至晚餐前最饿的时段",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday_afternoon_before_dinner_peak",
        "options": [
          {
            "order": 1,
            "label_original": "1分:完全不饿，甚至到了饭点也没有食欲",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:轻微饿感，喝点水就过去",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:正常饥饿，到饭点该有的饿",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:明显饥饿，注意力被饥饿打扰",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:强烈饥饿，头晕、手抖、心慌，必须马上吃",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 5
      },
      {
        "key": "appetite",
        "label_original": "食欲变化:昨天相对你平时的饭量",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday_vs_usual",
        "options": [
          {
            "order": 1,
            "label_original": "-2分:食欲明显减退，看到食物没什么兴趣",
            "display_score": -2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "-1分:略微比平时吃得少",
            "display_score": -1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "0分:和平时一样",
            "display_score": 0,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "+1分::略微比平时想吃/吃得多",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "+2:分:食欲亢进，总想吃东西",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 6
      },
      {
        "key": "sleep_quality",
        "label_original": "昨晚的睡眠质量:",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "last_night",
        "options": [
          {
            "order": 1,
            "label_original": "1分:几乎没睡好，多梦易醒或入睡困难",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:睡眠浅，醒来仍疲惫",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:一般，凑合睡了一晚",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:睡得比较沉，晨起状态不错",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:一觉到天亮，晨起神清气爽",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 7
      },
      {
        "key": "energy_complexion",
        "label_original": "昨日的精力/气色自评：",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "yesterday",
        "options": [
          {
            "order": 1,
            "label_original": "1分:面色暗沉、精神萎靡，对镜明显疲态",
            "display_score": 1,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 2,
            "label_original": "2分:面色略差，略有疲态",
            "display_score": 2,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 3,
            "label_original": "3分:一般，与平日无明显差异",
            "display_score": 3,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 4,
            "label_original": "4分:面色红润、状态不错",
            "display_score": 4,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          },
          {
            "order": 5,
            "label_original": "5分:神采奕奕，明显好于平日",
            "display_score": 5,
            "score_evidence": "原文显示分值；未验证问卷星后台评分配置"
          }
        ],
        "source_question_number": 8
      },
      {
        "key": "bowel_observation",
        "label_original": "今日排便次数：____    过程是否顺畅：____ （顺畅/稍费力/困难/腹胀） 附加观察：____ （颜色偏深/偏干/偏/气味明显/无异常）",
        "type": "inline_multiple_text",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today",
        "transcription_note": "____表示页面输入框，非原文下划线；排版空白已规范化，文字保留原样",
        "subfields": [
          {
            "key": "bowel_count",
            "label_original": "今日排便次数：",
            "type": "text",
            "hint_original": null,
            "required": null
          },
          {
            "key": "bowel_ease",
            "label_original": "过程是否顺畅：",
            "type": "text",
            "hint_original": "（顺畅/稍费力/困难/腹胀）",
            "required": null
          },
          {
            "key": "bowel_extra",
            "label_original": "附加观察：",
            "type": "text",
            "hint_original": "（颜色偏深/偏干/偏/气味明显/无异常）",
            "required": null
          }
        ],
        "validation_unknown": [
          "逐空必填规则未通过提交验证",
          "次数数值限制未验证"
        ],
        "source_note": "此题整体标必填。括号内容为输入框旁文字提示，不是选择题选项",
        "source_question_number": 9
      },
      {
        "key": "stool_type",
        "label_original": "大便性状",
        "type": "single_choice",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "not_explicit_in_label",
        "context_note": "紧接今日排便题，推断为同一观察期；标题自身未写今日，不当成已验证事实",
        "options": [
          {
            "order": 1,
            "label_original": "型1：坚硬颗粒状，像坚果一样分散排出（严重便秘）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 2,
            "label_original": "型2：腊肠状但表面凹凸结块（轻度便秘）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 3,
            "label_original": "型3：腊肠状，表面有裂痕（正常偏干）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 4,
            "label_original": "型4：光滑柔软的腊肠/蛇形（理想态★）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 5,
            "label_original": "型5：柔软块状、边缘清晰（偏软，纤维不足）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 6,
            "label_original": "型6：糊状、边缘蓬松（轻度腹泻）",
            "display_score": null,
            "score_evidence": null
          },
          {
            "order": 7,
            "label_original": "型7：完全水状、无固体（腹泻)",
            "display_score": null,
            "score_evidence": null
          }
        ],
        "category_codes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7
        ],
        "category_note": "型1—型7是分类，不是已验证临床评分或可直接求和的分值",
        "source_question_number": 10
      },
      {
        "key": "tongue_coating",
        "label_original": "今日晨起舌苔照片：",
        "type": "file_upload",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today_morning",
        "upload_button_original": "选择文件",
        "size_hint_original": "( 不超过10M )",
        "file_limit_display": "10M",
        "allowed_extensions": null,
        "max_files": null,
        "unknowns": [
          "具体可接收文件扩展名",
          "单题最多文件数",
          "10M按十进制或二进制计算未明确"
        ],
        "source_note": "题干要求照片；未触发文件选择或上传。身材三题标题未显式写今日",
        "source_question_number": 11
      },
      {
        "key": "tongue_underside",
        "label_original": "今日晨起舌底照片：",
        "type": "file_upload",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today_morning",
        "upload_button_original": "选择文件",
        "size_hint_original": "( 不超过10M )",
        "file_limit_display": "10M",
        "allowed_extensions": null,
        "max_files": null,
        "unknowns": [
          "具体可接收文件扩展名",
          "单题最多文件数",
          "10M按十进制或二进制计算未明确"
        ],
        "source_note": "题干要求照片；未触发文件选择或上传。身材三题标题未显式写今日",
        "source_question_number": 12
      },
      {
        "key": "face",
        "label_original": "今日晨起洁面后面部照片：",
        "type": "file_upload",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "today_morning_after_face_wash",
        "upload_button_original": "选择文件",
        "size_hint_original": "( 不超过10M )",
        "file_limit_display": "10M",
        "allowed_extensions": null,
        "max_files": null,
        "unknowns": [
          "具体可接收文件扩展名",
          "单题最多文件数",
          "10M按十进制或二进制计算未明确"
        ],
        "source_note": "题干要求照片；未触发文件选择或上传。身材三题标题未显式写今日",
        "source_question_number": 13
      },
      {
        "key": "body_front",
        "label_original": "晨起排便后身材正面照:",
        "type": "file_upload",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "morning_after_bowel_movement",
        "upload_button_original": "选择文件",
        "size_hint_original": "( 不超过10M )",
        "file_limit_display": "10M",
        "allowed_extensions": null,
        "max_files": null,
        "unknowns": [
          "具体可接收文件扩展名",
          "单题最多文件数",
          "10M按十进制或二进制计算未明确"
        ],
        "source_note": "题干要求照片；未触发文件选择或上传。身材三题标题未显式写今日",
        "source_question_number": 14
      },
      {
        "key": "body_side",
        "label_original": "晨起排便后身材测面照:",
        "type": "file_upload",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "morning_after_bowel_movement",
        "upload_button_original": "选择文件",
        "size_hint_original": "( 不超过10M )",
        "file_limit_display": "10M",
        "allowed_extensions": null,
        "max_files": null,
        "unknowns": [
          "具体可接收文件扩展名",
          "单题最多文件数",
          "10M按十进制或二进制计算未明确"
        ],
        "source_note": "题干要求照片；未触发文件选择或上传。身材三题标题未显式写今日",
        "source_question_number": 15
      },
      {
        "key": "body_back",
        "label_original": "晨起排便后身材背面照:",
        "type": "file_upload",
        "required": true,
        "required_evidence": "页面题号旁红色星号",
        "time_reference": "morning_after_bowel_movement",
        "upload_button_original": "选择文件",
        "size_hint_original": "( 不超过10M )",
        "file_limit_display": "10M",
        "allowed_extensions": null,
        "max_files": null,
        "unknowns": [
          "具体可接收文件扩展名",
          "单题最多文件数",
          "10M按十进制或二进制计算未明确"
        ],
        "source_note": "题干要求照片；未触发文件选择或上传。身材三题标题未显式写今日",
        "source_question_number": 16
      }
    ]
  }
] as const;
