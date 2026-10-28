// The API backend role stays authoritative when the shared UI role is 'doctor'.
export function staffNavigationFor(user = {}) {
  const role = String(user.backendRole || user.role || '').toUpperCase()
  if (role === 'NUTRITIONIST') return { role: '营养师', home: '营养师首页', clients: '客户管理' }
  if (['DOCTOR', 'PRACTITIONER'].includes(role)) return { role: '医生', home: '医生首页', clients: '患者管理' }
  return { role: '工作人员', home: '工作台', clients: '客户管理' }
}

export function staffPageTitle(user, page) {
  const labels = staffNavigationFor(user)
  return { index: labels.home, dashboard: labels.role + '数据看板', patients: labels.clients, follow: labels.role + '随访管理' }[page] || labels.home
}
