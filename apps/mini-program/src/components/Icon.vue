<template>
  <image 
    class="icon" 
    :class="isNumericSize ? '' : `icon-${size}`" 
    :style="iconStyle"
    :src="getIconPath(name)"
    aria-hidden="true"
    mode="aspectFit"
  />
</template>

<script>
export default {
  name: 'Icon',
  props: {
    name: {
      type: String,
      required: true
    },
    size: {
      type: [String, Number],
      default: 'md'
    },
    color: {
      type: String,
      default: '$gray-600'
    }
  },
  computed: {
    isNumericSize() {
      return typeof this.size === 'number' || !isNaN(Number(this.size))
    },
    iconStyle() {
      const style = {}
      
      // 处理数字尺寸
      if (this.isNumericSize) {
        const sizeValue = Number(this.size)
        style.width = `${sizeValue}px`
        style.height = `${sizeValue}px`
        style.fontSize = `${sizeValue}px`
      }
      
      const colorMap = {
        '$primary-color': '#168FB5',
        '$secondary-color': '#D8F1F7',
        '$accent-color': '#F28B64',
        '$success-color': '#35A982',
        '$warning-color': '#E99A3A',
        '$error-color': '#E25F63',
        '$gray-300': '#C7D8DE',
        '$gray-400': '#91A4AC',
        '$gray-500': '#71858F',
        '$gray-600': '#536A75',
        '$gray-700': '#334C59',
        '$gray-800': '#1C3544'
      }
      const aliases = {
        '#007AFF': '#168FB5',
        '#1495BD': '#168FB5',
        '#168FB9': '#168FB5',
        '#1693BC': '#168FB5',
        '#178FC0': '#168FB5',
        '#1797C5': '#168FB5',
        '#1996BB': '#168FB5',
        '#2E86AB': '#168FB5',
        '#28A745': '#35A982',
        '#FFC107': '#E99A3A',
        '#B54747': '#E25F63',
        '#EF4444': '#E25F63',
        '#333': '#1C3544',
        '#333333': '#1C3544',
        '#666': '#536A75',
        '#666666': '#536A75',
        '#6B7280': '#536A75',
        '#6F8793': '#71858F',
        '#758997': '#71858F',
        '#8AA0AD': '#91A4AC',
        '#93A6B2': '#91A4AC',
        '#999': '#91A4AC',
        '#9CA3AF': '#91A4AC',
        '#CCC': '#C7D8DE',
        '#D1D5DB': '#C7D8DE',
        '#FFF': '#FFFFFF'
      }
      const colorFilters = {
        '#168FB5': 'brightness(0) saturate(100%) invert(47%) sepia(76%) saturate(706%) hue-rotate(151deg) brightness(88%) contrast(91%)',
        '#D8F1F7': 'brightness(0) saturate(100%) invert(95%) sepia(11%) saturate(726%) hue-rotate(151deg) brightness(101%) contrast(94%)',
        '#F28B64': 'brightness(0) saturate(100%) invert(69%) sepia(49%) saturate(1025%) hue-rotate(324deg) brightness(99%) contrast(91%)',
        '#35A982': 'brightness(0) saturate(100%) invert(54%) sepia(39%) saturate(715%) hue-rotate(111deg) brightness(92%) contrast(91%)',
        '#E99A3A': 'brightness(0) saturate(100%) invert(68%) sepia(63%) saturate(734%) hue-rotate(342deg) brightness(96%) contrast(89%)',
        '#E25F63': 'brightness(0) saturate(100%) invert(48%) sepia(57%) saturate(1116%) hue-rotate(316deg) brightness(92%) contrast(91%)',
        '#C7D8DE': 'brightness(0) saturate(100%) invert(85%) sepia(8%) saturate(593%) hue-rotate(151deg) brightness(99%) contrast(91%)',
        '#91A4AC': 'brightness(0) saturate(100%) invert(69%) sepia(10%) saturate(455%) hue-rotate(151deg) brightness(92%) contrast(88%)',
        '#71858F': 'brightness(0) saturate(100%) invert(55%) sepia(12%) saturate(525%) hue-rotate(151deg) brightness(91%) contrast(87%)',
        '#536A75': 'brightness(0) saturate(100%) invert(40%) sepia(10%) saturate(870%) hue-rotate(151deg) brightness(91%) contrast(86%)',
        '#334C59': 'brightness(0) saturate(100%) invert(27%) sepia(19%) saturate(770%) hue-rotate(151deg) brightness(91%) contrast(87%)',
        '#1C3544': 'brightness(0) saturate(100%) invert(18%) sepia(24%) saturate(894%) hue-rotate(151deg) brightness(91%) contrast(88%)',
        '#FFFFFF': 'brightness(0) invert(1)'
      }
      const requestedColor = colorMap[this.color] || this.color || colorMap['$gray-600']
      const normalizedColor = aliases[requestedColor.toUpperCase()] || requestedColor.toUpperCase()
      style.filter = colorFilters[normalizedColor] || colorFilters['#536A75']
      return style
    }
  },
  methods: {
    getIconPath(name) {
      // 直接使用传入的图标路径，支持完整路径或相对路径
      // 使用方式：
      // 1. 完整路径：name="/static/icons/System/add-line.svg"
      // 2. 相对路径：name="System/add-line.svg" (自动添加/static/icons/前缀)
      // 3. 文件名：name="add-line.svg" (自动添加/static/icons/前缀)
      
      // 小程序组件切换时可能短暂以空 props 复用实例，避免因此中断整页渲染。
      const iconName = typeof name === 'string' ? name.trim() : ''
      if (!iconName) {
        return ''
      }

      // 如果已经是完整路径（以/static/icons/开头），直接返回
      if (iconName.startsWith('/static/icons/')) {
        return iconName
      }
      
      // 如果不是完整路径，自动添加/static/icons/前缀
      return `/static/icons/${iconName}`
    }
  }
}
</script>

<style scoped>
.icon {
  display: inline-block;
  text-align: center;
  line-height: 1;
}

.icon-xs {
  font-size: 14px;
  width: 14px;
  height: 14px;
}

.icon-sm {
  font-size: 16px;
  width: 16px;
  height: 16px;
}

.icon-md {
  font-size: 18px;
  width: 18px;
  height: 18px;
}

.icon-lg {
  font-size: 20px;
  width: 20px;
  height: 20px;
}

.icon-xl {
  font-size: 24px;
  width: 24px;
  height: 24px;
}
</style>
