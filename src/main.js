/**
 * ClawInstaller 入口
 */
import { registerRoute, initRouter, navigate, setDefaultRoute } from './router.js'
import { renderSidebar, openMobileSidebar } from './components/sidebar.js'
import { initTheme } from './lib/theme.js'
import { detectOpenclawStatus, isOpenclawReady, isGatewayRunning, onGatewayChange, startGatewayPoll, loadActiveInstance, getActiveInstance, onInstanceChange } from './lib/app-state.js'
import { wsClient } from './lib/ws-client.js'
import { api } from './lib/tauri-api.js'
import { version as APP_VERSION } from '../package.json'
import { statusIcon } from './lib/icons.js'

// 样式
import './style/variables.css'
import './style/reset.css'
import './style/layout.css'
import './style/components.css'
import './style/pages.css'
import './style/chat.css'
import './style/agents.css'
import './style/debug.css'

// 初始化主题
initTheme()

const isTauri = !!window.__TAURI_INTERNALS__

async function checkAuth() {
  if (isTauri) {
    // 桌面端：读 clawpanel.json，检查密码配置
    try {
      const { api } = await import('./lib/tauri-api.js')
      const cfg = await api.readPanelConfig()
      if (!cfg.accessPassword) return { ok: true }
      if (sessionStorage.getItem('clawpanel_authed') === '1') return { ok: true }
      // 默认密码：直接传给登录页，避免二次读取
      const defaultPw = (cfg.mustChangePassword && cfg.accessPassword) ? cfg.accessPassword : null
      return { ok: false, defaultPw }
    } catch { return { ok: true } }
  }
  // Web 模式
  try {
    const resp = await fetch('/__api/auth_check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const data = await resp.json()
    if (!data.required || data.authenticated) return { ok: true }
    return { ok: false, defaultPw: data.defaultPassword || null }
  } catch { return { ok: true } }
}

const _logoSvg = `<svg class="login-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
  <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/>
</svg>`

function _hideSplash() {
  const splash = document.getElementById('splash')
  if (splash) { splash.classList.add('hide'); setTimeout(() => splash.remove(), 500) }
}

let _loginFailCount = 0
const CAPTCHA_THRESHOLD = 3

function _genCaptcha() {
  const a = Math.floor(Math.random() * 20) + 1
  const b = Math.floor(Math.random() * 20) + 1
  return { q: `${a} + ${b} = ?`, a: a + b }
}

function showLoginOverlay(defaultPw) {
  const hasDefault = !!defaultPw
  const overlay = document.createElement('div')
  overlay.id = 'login-overlay'
  let _captcha = _loginFailCount >= CAPTCHA_THRESHOLD ? _genCaptcha() : null
  overlay.innerHTML = `
    <div class="login-card">
      ${_logoSvg}
      <div class="login-title">ClawInstaller</div>
      <div class="login-desc">${hasDefault
        ? '首次使用，默认密码已自动填充<br><span style="font-size:12px;color:#6366f1;font-weight:600">登录后请前往「安全设置」修改密码</span>'
        : (isTauri ? '应用已锁定，请输入密码' : '请输入访问密码')}</div>
      <form id="login-form">
        <input class="login-input" type="${hasDefault ? 'text' : 'password'}" id="login-pw" placeholder="访问密码" autocomplete="current-password" autofocus value="${hasDefault ? defaultPw : ''}" />
        <div id="login-captcha" style="display:${_captcha ? 'block' : 'none'};margin-bottom:10px">
          <div style="font-size:12px;color:#888;margin-bottom:6px">请先完成验证：<strong id="captcha-q" style="color:var(--text-primary,#333)">${_captcha ? _captcha.q : ''}</strong></div>
          <input class="login-input" type="number" id="login-captcha-input" placeholder="输入计算结果" style="text-align:center" />
        </div>
        <button class="login-btn" type="submit">登 录</button>
        <div class="login-error" id="login-error"></div>
      </form>
      ${!hasDefault ? `<details class="login-forgot" style="margin-top:16px;text-align:center">
        <summary style="font-size:11px;color:#aaa;cursor:pointer;list-style:none;user-select:none">忘记密码？</summary>
        <div style="margin-top:8px;font-size:11px;color:#888;line-height:1.8;text-align:left;background:rgba(0,0,0,.03);border-radius:8px;padding:10px 14px">
          ${isTauri
            ? '删除配置文件中的 <code style="background:rgba(99,102,241,.1);padding:1px 5px;border-radius:3px;font-size:10px">accessPassword</code> 字段即可重置：<br><code style="background:rgba(99,102,241,.1);padding:2px 6px;border-radius:3px;font-size:10px;word-break:break-all">~/.openclaw/clawpanel.json</code>'
            : '编辑服务器上的配置文件，删除 <code style="background:rgba(99,102,241,.1);padding:1px 5px;border-radius:3px;font-size:10px">accessPassword</code> 字段后重启服务：<br><code style="background:rgba(99,102,241,.1);padding:2px 6px;border-radius:3px;font-size:10px;word-break:break-all">~/.openclaw/clawpanel.json</code>'
          }
        </div>
      </details>` : ''}
      <div style="margin-top:${hasDefault ? '20' : '12'}px;font-size:11px;color:#aaa;text-align:center">
        <a href="https://claw.qt.cool" target="_blank" rel="noopener" style="color:#aaa;text-decoration:none">claw.qt.cool</a>
        <span style="margin:0 6px">·</span>v${APP_VERSION}
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  _hideSplash()

  return new Promise((resolve) => {
    overlay.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const pw = overlay.querySelector('#login-pw').value
      const btn = overlay.querySelector('.login-btn')
      const errEl = overlay.querySelector('#login-error')
      btn.disabled = true
      btn.textContent = '登录中...'
      errEl.textContent = ''
      // 验证码校验
      if (_captcha) {
        const captchaVal = parseInt(overlay.querySelector('#login-captcha-input')?.value)
        if (captchaVal !== _captcha.a) {
          errEl.textContent = '验证码错误'
          _captcha = _genCaptcha()
          const qEl = overlay.querySelector('#captcha-q')
          if (qEl) qEl.textContent = _captcha.q
          overlay.querySelector('#login-captcha-input').value = ''
          btn.disabled = false
          btn.textContent = '登 录'
          return
        }
      }
      try {
        if (isTauri) {
          // 桌面端：本地比对密码
          const { api } = await import('./lib/tauri-api.js')
          const cfg = await api.readPanelConfig()
          if (pw !== cfg.accessPassword) {
            _loginFailCount++
            if (_loginFailCount >= CAPTCHA_THRESHOLD && !_captcha) {
              _captcha = _genCaptcha()
              const cEl = overlay.querySelector('#login-captcha')
              if (cEl) { cEl.style.display = 'block'; cEl.querySelector('#captcha-q').textContent = _captcha.q }
            }
            errEl.textContent = `密码错误${_loginFailCount >= CAPTCHA_THRESHOLD ? '' : ` (${_loginFailCount}/${CAPTCHA_THRESHOLD})`}`
            btn.disabled = false
            btn.textContent = '登 录'
            return
          }
          sessionStorage.setItem('clawpanel_authed', '1')
          // 同步建立 web session（WEB_ONLY_CMDS 需要 cookie 认证）
          try {
            await fetch('/__api/auth_login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: pw }),
            })
          } catch {}
          overlay.classList.add('hide')
          setTimeout(() => overlay.remove(), 400)
          if (cfg.accessPassword === '123456') {
            sessionStorage.setItem('clawpanel_must_change_pw', '1')
          }
          resolve()
        } else {
          // Web 模式：调后端
          const resp = await fetch('/__api/auth_login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw }),
          })
          const data = await resp.json()
          if (!resp.ok) {
            _loginFailCount++
            if (_loginFailCount >= CAPTCHA_THRESHOLD && !_captcha) {
              _captcha = _genCaptcha()
              const cEl = overlay.querySelector('#login-captcha')
              if (cEl) { cEl.style.display = 'block'; cEl.querySelector('#captcha-q').textContent = _captcha.q }
            }
            errEl.textContent = (data.error || '登录失败') + (_loginFailCount >= CAPTCHA_THRESHOLD ? '' : ` (${_loginFailCount}/${CAPTCHA_THRESHOLD})`)
            btn.disabled = false
            btn.textContent = '登 录'
            return
          }
          overlay.classList.add('hide')
          setTimeout(() => overlay.remove(), 400)
          if (data.mustChangePassword || data.defaultPassword === '123456') {
            sessionStorage.setItem('clawpanel_must_change_pw', '1')
          }
          resolve()
        }
      } catch (err) {
        errEl.textContent = '网络错误: ' + (err.message || err)
        btn.disabled = false
        btn.textContent = '登 录'
      }
    })
  })
}

// 全局 401 拦截：API 返回 401 时弹出登录
window.__clawpanel_show_login = async function() {
  if (document.getElementById('login-overlay')) return
  await showLoginOverlay()
  location.reload()
}

const sidebar = document.getElementById('sidebar')
const content = document.getElementById('content')
const VISIBLE_ROUTES = new Set(['/setup', '/chat-debug'])

async function boot() {
  // 仅保留初始设置与系统诊断
  registerRoute('/chat-debug', () => import('./pages/chat-debug.js'))
  registerRoute('/setup', () => import('./pages/setup.js'))
  registerRoute('/about', () => import('./pages/about.js'))

  setDefaultRoute('/setup')
  const currentHash = window.location.hash.slice(1)
  if (currentHash && !VISIBLE_ROUTES.has(currentHash)) {
    navigate('/setup')
  }

  renderSidebar(sidebar)
  initRouter(content)

  // 移动端顶栏（汉堡菜单 + 标题）
  const mainCol = document.getElementById('main-col')
  const topbar = document.createElement('div')
  topbar.className = 'mobile-topbar'
  topbar.id = 'mobile-topbar'
  topbar.innerHTML = `
    <button class="mobile-hamburger" id="btn-mobile-menu">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <span class="mobile-topbar-title">ClawInstaller</span>
  `
  topbar.querySelector('.mobile-hamburger').addEventListener('click', openMobileSidebar)
  mainCol.prepend(topbar)

  // 隐藏启动加载屏
  const splash = document.getElementById('splash')
  if (splash) {
    splash.classList.add('hide')
    setTimeout(() => splash.remove(), 500)
  }

  loadActiveInstance().then(() => detectOpenclawStatus()).then(() => {
    // 重新渲染侧边栏（检测完成后 isOpenclawReady 状态已更新）
    renderSidebar(sidebar)
    if (!isOpenclawReady()) {
      setDefaultRoute('/setup')
      navigate('/setup')
    } else {
      setDefaultRoute('/chat-debug')
      if (!window.location.hash || window.location.hash === '#/setup') navigate('/chat-debug')
      startGatewayPoll()

      // 自动连接 WebSocket（如果 Gateway 正在运行）
      if (isGatewayRunning()) {
        autoConnectWebSocket()
      }

      // 监听 Gateway 状态变化，自动连接/断开 WebSocket
      onGatewayChange((running) => {
        if (running) {
          autoConnectWebSocket()
        } else {
          wsClient.disconnect()
        }
      })

      // 实例切换时，重连 WebSocket + 重新检测状态
      onInstanceChange(async () => {
        wsClient.disconnect()
        await detectOpenclawStatus()
        if (isGatewayRunning()) autoConnectWebSocket()
      })
    }
  })
}

async function autoConnectWebSocket() {
  try {
    const inst = getActiveInstance()
    console.log(`[main] 自动连接 WebSocket (实例: ${inst.name})...`)
    const config = await api.readOpenclawConfig()
    const port = config?.gateway?.port || 18789
    const rawToken = config?.gateway?.auth?.token
    const token = (typeof rawToken === 'string') ? rawToken : ''

    // 启动前先确保设备已配对 + allowedOrigins 已写入，无需用户手动操作
    let needReload = false
    try {
      const pairResult = await api.autoPairDevice()
      console.log('[main] 设备配对 + origins 已就绪:', pairResult)
      // 仅在配置实际变更时才需要 reload（dev-api 返回 {changed}，Tauri 返回字符串）
      if (typeof pairResult === 'object' && pairResult.changed) {
        needReload = true
      } else if (typeof pairResult === 'string' && pairResult !== '设备已配对') {
        needReload = true
      }
    } catch (pairErr) {
      console.warn('[main] autoPairDevice 失败（非致命）:', pairErr)
    }

    // 确保模型配置包含 vision 支持（input: ["text", "image"]）
    try {
      const patched = await api.patchModelVision()
      if (patched) {
        console.log('[main] 已为模型添加 vision 支持')
        needReload = true
      }
    } catch (visionErr) {
      console.warn('[main] patchModelVision 失败（非致命）:', visionErr)
    }

    // 统一 reload Gateway（配对 origins + vision patch 合并为一次 reload）
    if (needReload) {
      try {
        await api.reloadGateway()
        console.log('[main] Gateway 已重载')
      } catch (reloadErr) {
        console.warn('[main] reloadGateway 失败（非致命）:', reloadErr)
      }
    }

    let host
    const inst2 = getActiveInstance()
    if (inst2.type !== 'local' && inst2.endpoint) {
      try {
        const url = new URL(inst2.endpoint)
        host = `${url.hostname}:${inst2.gatewayPort || port}`
      } catch {
        host = window.__TAURI_INTERNALS__ ? `127.0.0.1:${port}` : location.host
      }
    } else {
      host = window.__TAURI_INTERNALS__ ? `127.0.0.1:${port}` : location.host
    }
    wsClient.connect(host, token)
    console.log(`[main] WebSocket 连接已启动 -> ${host}`)
  } catch (e) {
    console.error('[main] 自动连接 WebSocket 失败:', e)
  }
}

function setupGatewayBanner() {
  const banner = document.getElementById('gw-banner')
  if (!banner) return

  function update(running) {
    if (running || sessionStorage.getItem('gw-banner-dismissed')) {
      banner.classList.add('gw-banner-hidden')
      return
    } else {
      banner.classList.remove('gw-banner-hidden')
      banner.innerHTML = `
        <div class="gw-banner-content">
          <span class="gw-banner-icon">${statusIcon('warn', 16)}</span>
          <span>Gateway 未启动，部分功能不可用</span>
          <button class="btn btn-sm btn-primary" id="btn-gw-start">启动 Gateway</button>
          <button class="gw-banner-close" id="btn-gw-dismiss" title="关闭提示">&times;</button>
        </div>
      `
      banner.querySelector('#btn-gw-dismiss')?.addEventListener('click', () => {
        banner.classList.add('gw-banner-hidden')
        sessionStorage.setItem('gw-banner-dismissed', '1')
      })
      banner.querySelector('#btn-gw-start')?.addEventListener('click', async (e) => {
        const btn = e.target
        btn.disabled = true
        btn.classList.add('btn-loading')
        btn.textContent = '启动中...'
        try {
          await api.startService('ai.openclaw.gateway')
        } catch (err) {
          const errMsg = err.message || String(err)
          banner.innerHTML = `
            <div class="gw-banner-content">
              <span class="gw-banner-icon">${statusIcon('warn', 16)}</span>
              <span>启动失败: ${errMsg}</span>
              <button class="btn btn-sm btn-primary" id="btn-gw-start">重试</button>
              <a class="btn btn-sm btn-ghost" href="#/logs" style="color:inherit;text-decoration:underline">查看日志</a>
            </div>
          `
          update(false)
          return
        }
        // 轮询等待实际启动
        const t0 = Date.now()
        while (Date.now() - t0 < 30000) {
          try {
            const s = await api.getServicesStatus()
            const gw = s?.find?.(x => x.label === 'ai.openclaw.gateway') || s?.[0]
            if (gw?.running) { update(true); return }
          } catch {}
          const sec = Math.floor((Date.now() - t0) / 1000)
          btn.textContent = `启动中... ${sec}s`
          await new Promise(r => setTimeout(r, 1500))
        }
        // 超时后尝试获取日志帮助排查
        let logHint = ''
        try {
          const logs = await api.readLogTail('gateway', 5)
          if (logs?.trim()) logHint = `<div style="font-size:12px;margin-top:4px;opacity:0.8;font-family:monospace;white-space:pre-wrap">${logs.trim().split('\n').slice(-3).join('\n')}</div>`
        } catch {}
        banner.innerHTML = `
          <div class="gw-banner-content">
            <span class="gw-banner-icon">${statusIcon('warn', 16)}</span>
            <span>启动超时，Gateway 可能仍在启动中</span>
            <button class="btn btn-sm btn-primary" id="btn-gw-start">重试</button>
            <a class="btn btn-sm btn-ghost" href="#/logs" style="color:inherit;text-decoration:underline">查看日志</a>
          </div>
          ${logHint}
        `
        update(false)
      })
    }
  }

  update(isGatewayRunning())
  onGatewayChange(update)
}

function showGuardianRecovery() {
  const banner = document.getElementById('gw-banner')
  if (!banner) return
  banner.classList.remove('gw-banner-hidden')
  banner.innerHTML = `
    <div class="gw-banner-content" style="flex-wrap:wrap;gap:8px">
      <span class="gw-banner-icon">${statusIcon('warn', 16)}</span>
      <span>Gateway 反复启动失败，可能配置有误</span>
      <button class="btn btn-sm btn-primary" id="btn-gw-recover-restart">重试启动</button>
      <button class="btn btn-sm btn-secondary" id="btn-gw-recover-backup">从备份恢复</button>
      <a class="btn btn-sm btn-ghost" href="#/services" style="color:inherit;text-decoration:underline">服务管理</a>
      <a class="btn btn-sm btn-ghost" href="#/logs" style="color:inherit;text-decoration:underline">查看日志</a>
    </div>
  `
  banner.querySelector('#btn-gw-recover-restart')?.addEventListener('click', async (e) => {
    const btn = e.target
    btn.disabled = true
    btn.textContent = '启动中...'
    resetAutoRestart()
    try {
      await api.startService('ai.openclaw.gateway')
      btn.textContent = '已发送启动命令'
    } catch (err) {
      btn.textContent = '启动失败'
      btn.disabled = false
    }
  })
  banner.querySelector('#btn-gw-recover-backup')?.addEventListener('click', () => {
    navigate('/services')
  })
}

// === 全局版本更新检测 ===
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000 // 30 分钟
let _updateCheckTimer = null

async function checkGlobalUpdate() {
  const banner = document.getElementById('update-banner')
  if (!banner) return

  try {
    const info = await api.checkFrontendUpdate()
    if (!info.hasUpdate) return

    const ver = info.latestVersion || info.manifest?.version || ''
    if (!ver) return

    // 用户已忽略过该版本，不再打扰
    const dismissed = sessionStorage.getItem('clawpanel_update_dismissed')
    if (dismissed === ver) return

    const changelog = info.manifest?.changelog || ''
    const isWeb = !window.__TAURI_INTERNALS__

    banner.classList.remove('update-banner-hidden')
    banner.innerHTML = `
      <div class="update-banner-content">
        <div class="update-banner-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span class="update-banner-ver">ClawInstaller v${ver} 可用</span>
          ${changelog ? `<span class="update-banner-changelog">· ${changelog}</span>` : ''}
        </div>
        ${isWeb
          ? `<button class="btn btn-sm" id="btn-update-show-cmd">更新方法</button>
             <a class="btn btn-sm" href="https://github.com/qingchencloud/clawpanel/releases" target="_blank" rel="noopener">Release Notes</a>`
          : `<button class="btn btn-sm" id="btn-update-hot">热更新</button>
             <a class="btn btn-sm" href="https://github.com/qingchencloud/clawpanel/releases" target="_blank" rel="noopener">完整安装包</a>`
        }
        <button class="update-banner-close" id="btn-update-dismiss" title="忽略此版本">✕</button>
      </div>
    `

    // 关闭按钮：记住忽略的版本
    banner.querySelector('#btn-update-dismiss')?.addEventListener('click', () => {
      sessionStorage.setItem('clawpanel_update_dismissed', ver)
      banner.classList.add('update-banner-hidden')
    })

    // Web 模式：显示更新命令弹窗
    banner.querySelector('#btn-update-show-cmd')?.addEventListener('click', () => {
      const overlay = document.createElement('div')
      overlay.className = 'modal-overlay'
      overlay.innerHTML = `
        <div class="modal" style="max-width:480px">
          <div class="modal-title">更新到 v${ver}</div>
          <div style="font-size:var(--font-size-sm);line-height:1.8">
            <p style="margin-bottom:12px">在服务器上执行以下命令：</p>
            <pre style="background:var(--bg-tertiary);padding:12px 16px;border-radius:var(--radius-md);font-family:var(--font-mono);font-size:var(--font-size-xs);overflow-x:auto;white-space:pre-wrap;user-select:all">cd /opt/clawpanel
git pull origin main
npm install
npm run build
sudo systemctl restart clawpanel</pre>
            <p style="margin-top:12px;color:var(--text-tertiary);font-size:var(--font-size-xs)">
              如果 git pull 失败，可先执行 <code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px">git checkout -- .</code> 丢弃本地修改。<br>
              路径请替换为实际的 ClawInstaller 安装目录。
            </p>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary btn-sm" data-action="close">关闭</button>
          </div>
        </div>
      `
      document.body.appendChild(overlay)
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
      overlay.querySelector('[data-action="close"]').onclick = () => overlay.remove()
      overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove() })
    })

    // Tauri 热更新按钮
    banner.querySelector('#btn-update-hot')?.addEventListener('click', async () => {
      const btn = banner.querySelector('#btn-update-hot')
      if (!btn) return
      btn.disabled = true
      btn.textContent = '下载中...'
      try {
        await api.downloadFrontendUpdate(info.manifest?.url || '', info.manifest?.hash || '')
        btn.textContent = '重载应用'
        btn.disabled = false
        btn.onclick = () => window.location.reload()
      } catch (e) {
        btn.textContent = '下载失败'
        btn.disabled = false
        const { toast } = await import('./components/toast.js')
        toast('更新下载失败: ' + (e.message || e), 'error')
      }
    })
  } catch {
    // 检查失败静默忽略
  }
}

function startUpdateChecker() {
  // 启动后 5 秒检查一次
  setTimeout(checkGlobalUpdate, 5000)
  // 之后每 30 分钟检查一次
  _updateCheckTimer = setInterval(checkGlobalUpdate, UPDATE_CHECK_INTERVAL)
}

// 启动：直接进入应用，不再要求访问密码
boot()
startUpdateChecker()
