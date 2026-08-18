/**
 * 图标映射文件
 * 自动生成，请勿手动修改
 */

export const iconMapping = {
  '👤': {
    name: 'user',
    normal: '/static/icons/User & Faces/user-line.svg',
    active: '/static/icons/User & Faces/user-fill.svg'
  },
  '👨‍⚕️': {
    name: 'doctor',
    normal: '/static/icons/Health & Medical/nurse-line.svg',
    active: '/static/icons/Health & Medical/nurse-fill.svg'
  },
  '👥': {
    name: 'users',
    normal: '/static/icons/User & Faces/team-line.svg',
    active: '/static/icons/User & Faces/team-fill.svg'
  },
  '⚖️': {
    name: 'scale',
    normal: '/static/icons/Others/scales-line.svg',
    active: '/static/icons/Others/scales-fill.svg'
  },
  '🏥': {
    name: 'hospital',
    normal: '/static/icons/Buildings/hospital-line.svg',
    active: '/static/icons/Buildings/hospital-fill.svg'
  },
  '💊': {
    name: 'pill',
    normal: '/static/icons/Health & Medical/capsule-line.svg',
    active: '/static/icons/Health & Medical/capsule-fill.svg'
  },
  '🩺': {
    name: 'stethoscope',
    normal: '/static/icons/Health & Medical/stethoscope-line.svg',
    active: '/static/icons/Health & Medical/stethoscope-fill.svg'
  },
  '📊': {
    name: 'chart',
    normal: '/static/icons/Business/bar-chart-line.svg',
    active: '/static/icons/Business/bar-chart-fill.svg'
  },
  '📈': {
    name: 'trending-up',
    normal: '/static/icons/Business/line-chart-line.svg',
    active: '/static/icons/Business/line-chart-fill.svg'
  },
  '📉': {
    name: 'trending-down',
    normal: '/static/icons/Business/stock-line.svg',
    active: '/static/icons/Business/stock-fill.svg'
  },
  '📋': {
    name: 'clipboard',
    normal: '/static/icons/Document/clipboard-line.svg',
    active: '/static/icons/Document/clipboard-fill.svg'
  },
  '📱': {
    name: 'smartphone',
    normal: '/static/icons/Device/smartphone-line.svg',
    active: '/static/icons/Device/smartphone-fill.svg'
  },
  '💬': {
    name: 'message-circle',
    normal: '/static/icons/Communication/chat-1-line.svg',
    active: '/static/icons/Communication/chat-1-fill.svg'
  },
  '🔔': {
    name: 'bell',
    normal: '/static/icons/System/notification-line.svg',
    active: '/static/icons/System/notification-fill.svg'
  },
  '🍽️': {
    name: 'utensils',
    normal: '/static/icons/Food/restaurant-line.svg',
    active: '/static/icons/Food/restaurant-fill.svg'
  },
  '🍎': {
    name: 'apple',
    normal: '/static/icons/Food/apple-line.svg',
    active: '/static/icons/Food/apple-fill.svg'
  },
  '🏃': {
    name: 'running',
    normal: '/static/icons/User & Faces/run-line.svg',
    active: '/static/icons/User & Faces/run-fill.svg'
  },
  '🏃‍♂️': {
    name: 'running',
    normal: '/static/icons/User & Faces/run-line.svg',
    active: '/static/icons/User & Faces/run-fill.svg'
  },
  '⚡': {
    name: 'fire',
    normal: '/static/icons/Others/lightbulb-line.svg',
    active: '/static/icons/Weather/fire-fill.svg'
  },
  '✅': {
    name: 'circle',
    normal: '/static/icons/System/checkbox-circle-line.svg',
    active: '/static/icons/System/checkbox-circle-fill.svg'
  },
  '🎯': {
    name: 'target',
    normal: '/static/icons/Design/focus-line.svg',
    active: '/static/icons/Design/focus-fill.svg'
  },
  '📅': {
    name: 'calendar',
    normal: '/static/icons/Business/calendar-line.svg',
    active: '/static/icons/Business/calendar-fill.svg'
  },
  '📄': {
    name: 'clipboard',
    normal: '/static/icons/Document/file-line.svg',
    active: '/static/icons/Document/file-fill.svg'
  },
  '⚠️': {
    name: 'alert-triangle',
    normal: '/static/icons/System/alert-line.svg',
    active: '/static/icons/System/alert-fill.svg'
  },
  '👁️': {
    name: 'eye',
    normal: '/static/icons/System/eye-line.svg',
    active: '/static/icons/System/eye-fill.svg'
  },
  '🙈': {
    name: 'eye-off',
    normal: '/static/icons/System/eye-off-line.svg',
    active: '/static/icons/System/eye-off-fill.svg'
  },
  '1️⃣': {
    name: 'hash',
    normal: '/static/icons/Editor/hashtag.svg',
    active: '/static/icons/Editor/hashtag.svg'
  },
  '2️⃣': {
    name: 'hash',
    normal: '/static/icons/Editor/hashtag.svg',
    active: '/static/icons/Editor/hashtag.svg'
  },
  '3️⃣': {
    name: 'hash',
    normal: '/static/icons/Editor/hashtag.svg',
    active: '/static/icons/Editor/hashtag.svg'
  }
};

// 获取图标路径
export function getIconPath(emoji, isActive = false) {
  const icon = iconMapping[emoji];
  if (!icon) {
    console.warn('未找到图标映射:', emoji);
    return null;
  }
  return isActive ? icon.active : icon.normal;
}

// 获取图标名称
export function getIconName(emoji) {
  const icon = iconMapping[emoji];
  return icon ? icon.name : null;
}
