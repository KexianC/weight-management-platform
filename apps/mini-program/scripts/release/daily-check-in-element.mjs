// Release adapter for the verified legacy H5 runtime whose complete source is unavailable.
// The caller injects the existing authenticated API, session store and clipboard functions.
export function registerDailyCheckInElement({ get, user, copy }) {
  if (customElements.get('daily-check-in-share')) return
  const identity = () => {
    const actor = user() || {}
    return `${actor.userId || actor.id || ''}:${String(actor.backendRole || actor.role || '').toUpperCase()}`
  }
  class DailyCheckInShare extends HTMLElement {
    static get observedAttributes() { return ['patient-id'] }
    constructor() { super(); this.attachShadow({ mode: 'open' }); this.epoch = 0; this.active = false; this.link = ''; this.loading = false }
    connectedCallback() { this.resume() }
    disconnectedCallback() { this.suspend() }
    attributeChangedCallback() { if (this.isConnected) this.resume() }
    allowed() {
      const actor = user() || {}
      return !!(actor.userId || actor.id) && !actor.mustChangePassword && ['HEALTH_MANAGER', 'DOCTOR'].includes(String(actor.backendRole || actor.role || '').toUpperCase())
    }
    suspend() { this.epoch++; this.active = false; this.link = ''; this.owner = ''; this.loading = false; this.shadowRoot.replaceChildren() }
    resume() { this.suspend(); this.active = true; this.draw() }
    current(context) { return this.isConnected && this.active && this.allowed() && context.epoch === this.epoch && context.patient === this.getAttribute('patient-id') && context.owner === identity() }
    draw() {
      this.shadowRoot.replaceChildren()
      if (!this.allowed()) return
      this.shadowRoot.innerHTML = `<style>:host{display:block;font-family:inherit;color:#213941}.card{margin:14px 0;padding:20px;background:#fff;border:1px solid #dce8ed;border-radius:18px}h3{font-size:18px;margin:0 0 10px}p{font-size:13px;line-height:1.7;color:#667d85}button{display:block;width:100%;border:0;border-radius:10px;min-height:44px;padding:10px 12px;font:inherit;font-size:14px;color:#176581;background:#e8f3f7}button:disabled{opacity:.6}.copy{color:#fff;background:#167c9b;margin-top:12px}.error{color:#a1373c}img{display:block;width:220px;height:220px;max-width:100%;margin:16px auto;background:#fff}.record{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #edf2f5;font-size:14px}h4{font-size:15px;margin:18px 0 5px}</style><section class="card"><h3>每日填报</h3><p>每位客户一个专属入口，体重必填，其余选填。请将链接或二维码发到该客户本人的服务群。</p><button class="load" type="button">获取专属链接和二维码</button><p class="error" role="alert"></p><div class="result"></div></section>`
      this.shadowRoot.querySelector('.load').addEventListener('click', () => this.load())
    }
    text(tag, text, parent, className = '') { const element = document.createElement(tag); element.textContent = text; element.className = className; parent.append(element); return element }
    async load() {
      if (this.loading || !this.active || !this.allowed()) { if (!this.allowed()) this.suspend(); return }
      const patient = this.getAttribute('patient-id') || ''
      if (!/^[A-Za-z0-9_-]{1,191}$/.test(patient)) return
      this.epoch++; this.link = ''; this.owner = identity(); this.loading = true
      const context = { epoch: this.epoch, owner: this.owner, patient }
      const button = this.shadowRoot.querySelector('.load'), error = this.shadowRoot.querySelector('.error'), result = this.shadowRoot.querySelector('.result')
      button.disabled = true; button.textContent = '正在获取…'; error.textContent = ''; result.replaceChildren()
      try {
        const base = `/care-management/patients/${encodeURIComponent(patient)}/daily-check-in`
        const history = (await get(`${base}/records`, { page: 1 }, { loading: false, showError: false })).data
        if (!this.current(context)) return
        if (!Array.isArray(history?.items)) throw new Error('填报记录暂不可用，请稍后重试')
        if (history.canManageLink === true) {
          const share = (await get(`${base}/link`, {}, { loading: false, showError: false })).data
          if (!this.current(context)) return
          if (share?.revoked) this.text('p', '填报链接已停用，请在电脑管理端重新启用。', result)
          else {
            if (typeof share?.url !== 'string') throw new Error('专属链接暂不可用')
            const url = new URL(share.url)
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || !/^#\/daily-check-in\/[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new Error('专属链接格式无效，请联系管理员')
            this.link = url.href
            if (typeof share.qrDataUrl === 'string' && share.qrDataUrl.length < 700000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(share.qrDataUrl)) {
              const image = document.createElement('img'); image.src = share.qrDataUrl; image.alt = '此客户的每日填报二维码'; image.addEventListener('error', () => { if (this.current(context)) { image.remove(); this.text('p', '二维码显示失败，可复制专属链接。', result) } }); result.append(image)
            }
            const copyButton = this.text('button', '复制专属填报链接', result, 'copy'); copyButton.type = 'button'
            copyButton.addEventListener('click', () => {
              if (!this.current(context) || !this.link) { this.suspend(); return }
              copy({ data: this.link, success: () => { if (this.current(context)) error.textContent = '已复制，请发到该客户服务群。' }, fail: () => { if (this.current(context)) error.textContent = '复制失败，请重试。' } })
            })
          }
        } else this.text('p', '此客户的填报记录可查看，专属链接由负责的健管师或医生管理。', result)
        this.text('h4', '最近填报', result)
        const rows = history.items.slice(0, 5)
        for (const row of rows) { const line = this.text('div', '', result, 'record'); this.text('span', String(row.date || '').slice(0, 10), line); this.text('span', `${row.weightKg} kg`, line) }
        this.text('p', rows.length ? '显示最近5条，完整内容可在电脑管理端查看。' : '客户尚未提交每日填报。', result)
      } catch (failure) { if (this.current(context)) { this.link = ''; result.replaceChildren(); error.textContent = failure.message || '专属填报入口获取失败，请稍后重试' } }
      finally { if (this.current(context)) { this.loading = false; button.disabled = false; button.textContent = '刷新链接与填报记录' } else if (context.epoch === this.epoch) this.suspend() }
    }
  }
  customElements.define('daily-check-in-share', DailyCheckInShare)
  document.addEventListener('visibilitychange', () => { for (const element of document.querySelectorAll('daily-check-in-share')) document.hidden ? element.suspend() : element.resume() })
}

export function suspendDailyCheckInElements(root) { for (const element of root?.querySelectorAll?.('daily-check-in-share') || []) element.suspend?.() }
export function resumeDailyCheckInElements(root) { for (const element of root?.querySelectorAll?.('daily-check-in-share') || []) element.resume?.() }
