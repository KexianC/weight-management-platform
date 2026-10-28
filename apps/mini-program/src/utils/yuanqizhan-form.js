// Source labels transcribed from the completely read Library v0 contract. Display corrections are explicit in yuanqizhan-model.js.
export const SOURCE_FORMS = [
  {
    "id": "daily",
    "questions": [
      {
        "options": [],
        "timeReference": "identity",
        "key": "name",
        "labelOriginal": "您的姓名：",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "text"
      },
      {
        "options": [],
        "timeReference": "today",
        "key": "fasting_weight",
        "labelOriginal": "今日空腹体重（标注单位）：",
        "subfields": [],
        "unit": "由填写者在文本中标注；日常表未限定单位",
        "required": true,
        "type": "text"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:精力充沛，下班后仍有体力做想做的事",
            "value": 1
          },
          {
            "labelOriginal": "2分:状态不错，偶有疲惫，休息后即恢复",
            "value": 2
          },
          {
            "labelOriginal": "3分:一般疲惫，需要靠咖啡/茶撑过下午",
            "value": 3
          },
          {
            "labelOriginal": "4分:明显乏力，工作间隙总想趴一会儿",
            "value": 4
          },
          {
            "labelOriginal": "5分:极度疲劳，起床就觉得累，全天提不起劲",
            "value": 5
          }
        ],
        "timeReference": "yesterday",
        "key": "fatigue",
        "labelOriginal": "疲劳感:选最接近的昨天整体状态",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:完全不饿，甚至到了饭点也没有食欲",
            "value": 1
          },
          {
            "labelOriginal": "2分:轻微饿感，喝点水就过去",
            "value": 2
          },
          {
            "labelOriginal": "3分:正常饥饿，到饭点该有的饿",
            "value": 3
          },
          {
            "labelOriginal": "4分:明显饥饿，注意力被饥饿打扰",
            "value": 4
          },
          {
            "labelOriginal": "5分:强烈饥饿，头晕、手抖、心慌，必须马上吃",
            "value": 5
          }
        ],
        "timeReference": "yesterday_afternoon_before_dinner_peak",
        "key": "hunger",
        "labelOriginal": "饥饿感:取昨天下午至晚餐前最饿的时段",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "-2分:食欲明显减退，看到食物没什么兴趣",
            "value": -2
          },
          {
            "labelOriginal": "-1分:略微比平时吃得少",
            "value": -1
          },
          {
            "labelOriginal": "0分:和平时一样",
            "value": 0
          },
          {
            "labelOriginal": "+1分::略微比平时想吃/吃得多",
            "value": 1
          },
          {
            "labelOriginal": "+2:分:食欲亢进，总想吃东西",
            "value": 2
          }
        ],
        "timeReference": "yesterday_vs_usual",
        "key": "appetite",
        "labelOriginal": "食欲变化:昨天相对你平时的饭量",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:几乎没睡好，多梦易醒或入睡困难",
            "value": 1
          },
          {
            "labelOriginal": "2分:睡眠浅，醒来仍疲惫",
            "value": 2
          },
          {
            "labelOriginal": "3分:一般，凑合睡了一晚",
            "value": 3
          },
          {
            "labelOriginal": "4分:睡得比较沉，晨起状态不错",
            "value": 4
          },
          {
            "labelOriginal": "5分:一觉到天亮，晨起神清气爽",
            "value": 5
          }
        ],
        "timeReference": "last_night",
        "key": "sleep_quality",
        "labelOriginal": "昨晚的睡眠质量:",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:面色暗沉、精神萎靡，对镜明显疲态",
            "value": 1
          },
          {
            "labelOriginal": "2分:面色略差，略有疲态",
            "value": 2
          },
          {
            "labelOriginal": "3分:一般，与平日无明显差异",
            "value": 3
          },
          {
            "labelOriginal": "4分:面色红润、状态不错",
            "value": 4
          },
          {
            "labelOriginal": "5分:神采奕奕，明显好于平日",
            "value": 5
          }
        ],
        "timeReference": "yesterday",
        "key": "energy_complexion",
        "labelOriginal": "昨日的精力/气色自评：",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [],
        "timeReference": "today",
        "key": "bowel_observation",
        "labelOriginal": "今日排便次数：____    过程是否顺畅：____ （顺畅/稍费力/困难/腹胀） 附加观察：____ （颜色偏深/偏干/偏/气味明显/无异常）",
        "subfields": [
          {
            "key": "bowel_count",
            "labelOriginal": "今日排便次数：",
            "hintOriginal": null
          },
          {
            "key": "bowel_ease",
            "labelOriginal": "过程是否顺畅：",
            "hintOriginal": "（顺畅/稍费力/困难/腹胀）"
          },
          {
            "key": "bowel_extra",
            "labelOriginal": "附加观察：",
            "hintOriginal": "（颜色偏深/偏干/偏/气味明显/无异常）"
          }
        ],
        "unit": null,
        "required": true,
        "type": "inline_multiple_text"
      },
      {
        "options": [
          {
            "labelOriginal": "型1：坚硬颗粒状，像坚果一样分散排出（严重便秘）",
            "value": 1
          },
          {
            "labelOriginal": "型2：腊肠状但表面凹凸结块（轻度便秘）",
            "value": 2
          },
          {
            "labelOriginal": "型3：腊肠状，表面有裂痕（正常偏干）",
            "value": 3
          },
          {
            "labelOriginal": "型4：光滑柔软的腊肠/蛇形（理想态★）",
            "value": 4
          },
          {
            "labelOriginal": "型5：柔软块状、边缘清晰（偏软，纤维不足）",
            "value": 5
          },
          {
            "labelOriginal": "型6：糊状、边缘蓬松（轻度腹泻）",
            "value": 6
          },
          {
            "labelOriginal": "型7：完全水状、无固体（腹泻)",
            "value": 7
          }
        ],
        "timeReference": "not_explicit_in_label",
        "key": "stool_type",
        "labelOriginal": "大便性状",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      }
    ],
    "title": "元气盏日常打卡表",
    "questionCount": 9
  },
  {
    "id": "milestone",
    "questions": [
      {
        "options": [],
        "timeReference": "identity",
        "key": "name",
        "labelOriginal": "您的姓名：",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "text"
      },
      {
        "options": [],
        "timeReference": "today",
        "key": "fasting_weight",
        "labelOriginal": "今日空腹体重（标注单位，斤或者公斤）：",
        "subfields": [],
        "unit": "斤或者公斤，由填写者在文本中标注",
        "required": true,
        "type": "text"
      },
      {
        "options": [],
        "timeReference": "today",
        "key": "fasting_waist",
        "labelOriginal": "今日空腹腰围（厘米）：",
        "subfields": [],
        "unit": "厘米",
        "required": true,
        "type": "text"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:精力充沛，下班后仍有体力做想做的事",
            "value": 1
          },
          {
            "labelOriginal": "2分:状态不错，偶有疲惫，休息后即恢复",
            "value": 2
          },
          {
            "labelOriginal": "3分:一般疲惫，需要靠咖啡/茶撑过下午",
            "value": 3
          },
          {
            "labelOriginal": "4分:明显乏力，工作间隙总想趴一会儿",
            "value": 4
          },
          {
            "labelOriginal": "5分:极度疲劳，起床就觉得累，全天提不起劲",
            "value": 5
          }
        ],
        "timeReference": "yesterday",
        "key": "fatigue",
        "labelOriginal": "疲劳感:选最接近的昨天整体状态",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:完全不饿，甚至到了饭点也没有食欲",
            "value": 1
          },
          {
            "labelOriginal": "2分:轻微饿感，喝点水就过去",
            "value": 2
          },
          {
            "labelOriginal": "3分:正常饥饿，到饭点该有的饿",
            "value": 3
          },
          {
            "labelOriginal": "4分:明显饥饿，注意力被饥饿打扰",
            "value": 4
          },
          {
            "labelOriginal": "5分:强烈饥饿，头晕、手抖、心慌，必须马上吃",
            "value": 5
          }
        ],
        "timeReference": "yesterday_afternoon_before_dinner_peak",
        "key": "hunger",
        "labelOriginal": "饥饿感:取昨天下午至晚餐前最饿的时段",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "-2分:食欲明显减退，看到食物没什么兴趣",
            "value": -2
          },
          {
            "labelOriginal": "-1分:略微比平时吃得少",
            "value": -1
          },
          {
            "labelOriginal": "0分:和平时一样",
            "value": 0
          },
          {
            "labelOriginal": "+1分::略微比平时想吃/吃得多",
            "value": 1
          },
          {
            "labelOriginal": "+2:分:食欲亢进，总想吃东西",
            "value": 2
          }
        ],
        "timeReference": "yesterday_vs_usual",
        "key": "appetite",
        "labelOriginal": "食欲变化:昨天相对你平时的饭量",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:几乎没睡好，多梦易醒或入睡困难",
            "value": 1
          },
          {
            "labelOriginal": "2分:睡眠浅，醒来仍疲惫",
            "value": 2
          },
          {
            "labelOriginal": "3分:一般，凑合睡了一晚",
            "value": 3
          },
          {
            "labelOriginal": "4分:睡得比较沉，晨起状态不错",
            "value": 4
          },
          {
            "labelOriginal": "5分:一觉到天亮，晨起神清气爽",
            "value": 5
          }
        ],
        "timeReference": "last_night",
        "key": "sleep_quality",
        "labelOriginal": "昨晚的睡眠质量:",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [
          {
            "labelOriginal": "1分:面色暗沉、精神萎靡，对镜明显疲态",
            "value": 1
          },
          {
            "labelOriginal": "2分:面色略差，略有疲态",
            "value": 2
          },
          {
            "labelOriginal": "3分:一般，与平日无明显差异",
            "value": 3
          },
          {
            "labelOriginal": "4分:面色红润、状态不错",
            "value": 4
          },
          {
            "labelOriginal": "5分:神采奕奕，明显好于平日",
            "value": 5
          }
        ],
        "timeReference": "yesterday",
        "key": "energy_complexion",
        "labelOriginal": "昨日的精力/气色自评：",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [],
        "timeReference": "today",
        "key": "bowel_observation",
        "labelOriginal": "今日排便次数：____    过程是否顺畅：____ （顺畅/稍费力/困难/腹胀） 附加观察：____ （颜色偏深/偏干/偏/气味明显/无异常）",
        "subfields": [
          {
            "key": "bowel_count",
            "labelOriginal": "今日排便次数：",
            "hintOriginal": null
          },
          {
            "key": "bowel_ease",
            "labelOriginal": "过程是否顺畅：",
            "hintOriginal": "（顺畅/稍费力/困难/腹胀）"
          },
          {
            "key": "bowel_extra",
            "labelOriginal": "附加观察：",
            "hintOriginal": "（颜色偏深/偏干/偏/气味明显/无异常）"
          }
        ],
        "unit": null,
        "required": true,
        "type": "inline_multiple_text"
      },
      {
        "options": [
          {
            "labelOriginal": "型1：坚硬颗粒状，像坚果一样分散排出（严重便秘）",
            "value": 1
          },
          {
            "labelOriginal": "型2：腊肠状但表面凹凸结块（轻度便秘）",
            "value": 2
          },
          {
            "labelOriginal": "型3：腊肠状，表面有裂痕（正常偏干）",
            "value": 3
          },
          {
            "labelOriginal": "型4：光滑柔软的腊肠/蛇形（理想态★）",
            "value": 4
          },
          {
            "labelOriginal": "型5：柔软块状、边缘清晰（偏软，纤维不足）",
            "value": 5
          },
          {
            "labelOriginal": "型6：糊状、边缘蓬松（轻度腹泻）",
            "value": 6
          },
          {
            "labelOriginal": "型7：完全水状、无固体（腹泻)",
            "value": 7
          }
        ],
        "timeReference": "not_explicit_in_label",
        "key": "stool_type",
        "labelOriginal": "大便性状",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "single_choice"
      },
      {
        "options": [],
        "timeReference": "today_morning",
        "key": "tongue_coating",
        "labelOriginal": "今日晨起舌苔照片：",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "file_upload"
      },
      {
        "options": [],
        "timeReference": "today_morning",
        "key": "tongue_underside",
        "labelOriginal": "今日晨起舌底照片：",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "file_upload"
      },
      {
        "options": [],
        "timeReference": "today_morning_after_face_wash",
        "key": "face",
        "labelOriginal": "今日晨起洁面后面部照片：",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "file_upload"
      },
      {
        "options": [],
        "timeReference": "morning_after_bowel_movement",
        "key": "body_front",
        "labelOriginal": "晨起排便后身材正面照:",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "file_upload"
      },
      {
        "options": [],
        "timeReference": "morning_after_bowel_movement",
        "key": "body_side",
        "labelOriginal": "晨起排便后身材测面照:",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "file_upload"
      },
      {
        "options": [],
        "timeReference": "morning_after_bowel_movement",
        "key": "body_back",
        "labelOriginal": "晨起排便后身材背面照:",
        "subfields": [],
        "unit": null,
        "required": true,
        "type": "file_upload"
      }
    ],
    "title": "元气盏第1/8/15日打卡表",
    "questionCount": 16
  }
]
