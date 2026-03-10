/**
 * 初始设置页面 — openclaw 未安装时的引导
 * 自动检测环境 → 版本选择 → 一键安装 → 初始化向导
 */
import { api, invalidate } from '../lib/tauri-api.js'
import { showUpgradeModal } from '../components/modal.js'
import { toast } from '../components/toast.js'
import { setUpgrading, isMacPlatform } from '../lib/app-state.js'
import { diagnoseInstallError } from '../lib/error-diagnosis.js'
import { icon, statusIcon } from '../lib/icons.js'
import { navigate } from '../router.js'

function isMacClient() {
  return isMacPlatform() || navigator.platform?.startsWith('Mac') || navigator.userAgent?.includes('Macintosh')
}

function isWindowsClient() {
  return /Windows/i.test(navigator.userAgent || navigator.platform || '')
}

function getOnboardCommand() {
  return isMacClient() ? 'sudo openclaw onboard --install-daemon' : 'openclaw onboard --install-daemon'
}

function getOnboardPlatformText() {
  if (isMacClient()) {
    return {
      openLabel: '终端',
      openAction: '打开终端并预填 sudo 命令',
      openHint: '可以直接从这里打开 Terminal，并预填 sudo 命令。',
      success: '已打开 Terminal，请在终端中输入系统密码继续',
      successCopied: '已打开 Terminal，命令也已复制；请在终端中输入系统密码继续',
      fallback: '自动打开失败，请在 Terminal 中粘贴执行',
      installDone: '安装完成。关闭后可在页面中的“初始化向导”卡片继续打开 Terminal，并执行',
    }
  }
  if (isWindowsClient()) {
    return {
      openLabel: '管理员命令行',
      openAction: '打开管理员命令行',
      openHint: '可以直接从这里打开管理员命令行。',
      success: '已打开管理员 PowerShell',
      successCopied: '已打开管理员 PowerShell，命令也已复制',
      fallback: '自动打开失败，请在管理员命令行中粘贴执行',
      installDone: '安装完成。关闭后可在页面中的“初始化向导”卡片继续打开管理员命令行，并执行',
    }
  }
  return {
    openLabel: '终端',
    openAction: '尝试打开初始化',
    openHint: '如果当前环境支持自动打开终端，可以直接从这里继续。',
    success: '已打开终端',
    successCopied: '已打开终端，命令也已复制',
    fallback: '自动打开失败，请在终端中粘贴执行',
    installDone: '安装完成。关闭后可在页面中的“初始化向导”卡片继续执行',
  }
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div style="max-width:560px;margin:48px auto;text-align:center">
      <div style="margin-bottom:var(--space-lg)">
        <img src="/images/openclaw-logo-text.png" alt="OpenClaw" style="max-width:160px;width:100%;height:auto">
      </div>
      <p style="color:var(--text-secondary);margin-bottom:var(--space-xl);line-height:1.6">
        OpenClaw CLI 一键安装
      </p>

      <div id="setup-steps"></div>

      <div style="margin-top:var(--space-lg)">
        <button class="btn btn-secondary btn-sm" id="btn-recheck" style="min-width:120px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="margin-right:4px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          重新检测
        </button>
      </div>
    </div>
  `

  page.querySelector('#btn-recheck').addEventListener('click', () => runDetect(page))
  runDetect(page)
  return page
}

async function runDetect(page) {
  const stepsEl = page.querySelector('#setup-steps')
  stepsEl.innerHTML = `
    <div class="stat-card loading-placeholder" style="height:48px"></div>
    <div class="stat-card loading-placeholder" style="height:48px;margin-top:8px"></div>
    <div class="stat-card loading-placeholder" style="height:48px;margin-top:8px"></div>
  `
  // 并行检测 Node.js、OpenClaw CLI、配置文件
  const [nodeRes, clawRes, configRes] = await Promise.allSettled([
    api.checkNode(),
    api.getServicesStatus(),
    api.checkInstallation(),
  ])

  const node = nodeRes.status === 'fulfilled' ? nodeRes.value : { installed: false }
  const cliOk = clawRes.status === 'fulfilled'
    && clawRes.value?.length > 0
    && clawRes.value[0]?.cli_installed !== false
  const config = configRes.status === 'fulfilled' ? configRes.value : { installed: false }

  renderSteps(page, { node, cliOk, config })
}

function stepIcon(ok) {
  const color = ok ? 'var(--success)' : 'var(--text-tertiary)'
  return `<span style="color:${color};font-weight:700;width:18px;display:inline-block">${ok ? '✓' : '✗'}</span>`
}

function renderSteps(page, { node, cliOk, config }) {
  const stepsEl = page.querySelector('#setup-steps')
  const nodeOk = node.installed
  const allOk = nodeOk && cliOk && config.installed

  let html = ''

  // 第一步：Node.js
  html += `
    <div class="config-section" style="text-align:left">
      <div class="config-section-title" style="display:flex;align-items:center;gap:4px">
        ${stepIcon(nodeOk)} Node.js 环境
      </div>
      ${nodeOk
        ? `<p style="color:var(--success);font-size:var(--font-size-sm)">已安装 ${node.version || ''}</p>`
        : `<p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-sm)">
            OpenClaw 基于 Node.js 运行，请先安装。
          </p>
          ${window.__TAURI_INTERNALS__
            ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
                <button class="btn btn-primary btn-sm" id="btn-auto-install-node" disabled>
                  一键安装 Node.js <span id="node-lts-ver" style="opacity:0.7">v22 LTS</span>
                </button>
                <select id="node-mirror-select" style="padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-primary);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-xs)">
                  <option value="cn">npmmirror 淘宝镜像（国内推荐）</option>
                  <option value="official">nodejs.org 官方</option>
                </select>
              </div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                <span style="font-size:var(--font-size-xs);color:var(--text-secondary);white-space:nowrap">安装到:</span>
                <input id="node-install-path" type="text"
                  value="${isWindowsClient() ? '~\\.openclaw\\node' : '~/.openclaw/node'}"
                  style="flex:1;padding:3px 8px;border:1px solid var(--border-primary);border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary);font-size:11px;font-family:monospace">
              </div>
              <div class="form-hint" style="margin-bottom:var(--space-sm)">绿色安装，不修改系统 PATH，安装完成后无需重启即可继续</div>
              <a class="btn btn-secondary btn-sm" href="https://nodejs.org/" target="_blank" rel="noopener" style="margin-right:8px">手动下载</a>`
            : `<a class="btn btn-primary btn-sm" href="https://nodejs.org/" target="_blank" rel="noopener">下载 Node.js</a>
               <span class="form-hint" style="margin-left:8px">安装后点击「重新检测」</span>`
          }
          <div style="margin-top:var(--space-sm);padding:8px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:var(--font-size-xs);color:var(--text-secondary);line-height:1.6">
            <strong>已经装了但检测不到？</strong>
            ${isMacPlatform()
              ? `macOS 上从 Finder 启动可能找不到 Node.js。试试关掉 ClawPanel 后从终端启动：<br>
                 <code style="background:var(--bg-secondary);padding:2px 6px;border-radius:3px;user-select:all">open /Applications/ClawPanel.app</code>`
              : `若使用上方「一键安装」，无需重启即可识别。<br>
                 若手动安装了 Node.js，需要<strong>重启 ClawPanel</strong> 后再检测（Windows 进程继承 PATH 在启动时固定）。`
            }
            <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <button class="btn btn-secondary btn-sm" id="btn-scan-node" style="font-size:11px;padding:3px 10px">${icon('search', 12)} 自动扫描</button>
              <span style="color:var(--text-tertiary)">或手动指定路径：</span>
            </div>
            <div style="margin-top:6px;display:flex;gap:6px">
              <input id="input-node-path" type="text" placeholder="${isMacPlatform() ? '/usr/local/bin' : 'F:\\\\AI\\\\Node'}"
                style="flex:1;padding:4px 8px;border:1px solid var(--border-primary);border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary);font-size:11px;font-family:monospace">
              <button class="btn btn-primary btn-sm" id="btn-check-path" style="font-size:11px;padding:3px 10px">检测</button>
            </div>
            <div id="scan-result" style="margin-top:6px;display:none"></div>
          </div>`
      }
    </div>
  `

  // 第二步：OpenClaw CLI
  html += `
    <div class="config-section" style="text-align:left;${nodeOk ? '' : 'opacity:0.4;pointer-events:none'}">
      <div class="config-section-title" style="display:flex;align-items:center;gap:4px">
        ${stepIcon(cliOk)} OpenClaw CLI
      </div>
      ${cliOk
        ? `<p style="color:var(--success);font-size:var(--font-size-sm);margin-bottom:var(--space-sm)">CLI npm 包已可用</p>${renderOnboardActionCard(true)}`
        : renderInstallSection()
      }
    </div>
  `
  // 第三步：初始化向导
  html += `
    <div class="config-section" style="text-align:left;${cliOk ? '' : 'opacity:0.4;pointer-events:none'}">
      <div class="config-section-title" style="display:flex;align-items:center;gap:4px">
        ${stepIcon(config.installed)} 初始化向导
      </div>
      ${config.installed
        ? `<p style="color:var(--success);font-size:var(--font-size-sm)">已完成初始化，配置文件位于 ${config.path || ''}</p>`
        : `<p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:0">
            还没有完成初始化。请在上方卡片中打开终端，或复制命令后手动执行 <code>${getOnboardCommand()}</code>。
          </p>`
      }
    </div>
  `

  // 全部就绪 → 进入面板
  if (allOk) {
    html += `
      <div style="margin-top:var(--space-lg)">
        <button class="btn btn-primary" id="btn-enter" style="min-width:200px">进入面板</button>
      </div>
    `
  }

  stepsEl.innerHTML = html
  bindEvents(page, { nodeOk, cliOk })

  // Node.js 未安装时，异步获取最新 LTS 版本并更新按钮
  if (!nodeOk && window.__TAURI_INTERNALS__) {
    const btn = page.querySelector('#btn-auto-install-node')
    const verEl = page.querySelector('#node-lts-ver')
    api.getLatestNodeLtsVersion().then(ver => {
      if (verEl) verEl.textContent = `v${ver}`
      if (btn) {
        btn.disabled = false
        btn.dataset.nodeVersion = ver
      }
    }).catch(() => {
      // 获取失败则使用 fallback，按钮仍可用
      if (btn) {
        btn.disabled = false
        btn.dataset.nodeVersion = '22.14.0'
      }
    })
  }
}

function renderInstallSection() {
  const isWin = navigator.platform?.startsWith('Win') || navigator.userAgent?.includes('Windows')
  const isMac = navigator.platform?.startsWith('Mac') || navigator.userAgent?.includes('Macintosh')
  const isDesktop = !!window.__TAURI_INTERNALS__

  let envHint = ''
  if (isDesktop) {
    envHint = `
      <div style="margin-top:var(--space-sm);padding:10px 12px;background:var(--bg-tertiary);border-radius:var(--radius-sm);border-left:3px solid var(--warning);font-size:var(--font-size-xs);color:var(--text-secondary);line-height:1.7">
        <strong style="color:var(--text-primary)">找不到已安装的 OpenClaw？</strong>
        <p style="margin:6px 0 2px">ClawPanel 桌面版只能管理<strong>本机</strong>安装的 OpenClaw。以下环境中的安装无法被检测到：</p>
        <ul style="margin:4px 0 8px 16px;padding:0">
          ${isWin ? `
            <li><strong>WSL (Windows 子系统)</strong> — OpenClaw 装在 WSL 里，Windows 侧无法访问</li>
            <li><strong>Docker 容器</strong> — 容器内的安装与宿主机隔离</li>
          ` : ''}
          ${isMac ? `
            <li><strong>Docker 容器</strong> — 容器内的安装与宿主机隔离</li>
            <li><strong>远程服务器</strong> — 安装在其他机器上</li>
          ` : ''}
          ${!isWin && !isMac ? `
            <li><strong>Docker 容器</strong> — 容器内的安装与宿主机隔离</li>
          ` : ''}
        </ul>
        <details style="cursor:pointer">
          <summary style="font-weight:600;color:var(--primary);margin-bottom:6px">
            在对应环境中安装管理面板
          </summary>
          <div style="margin-top:8px">
            ${isWin ? `
              <div style="margin-bottom:10px">
                <div style="font-weight:600;margin-bottom:4px">WSL 中使用 Web 版：</div>
                <div style="margin-bottom:2px;opacity:0.8">打开 WSL 终端，一键部署 ClawPanel Web 版：</div>
                <code style="display:block;background:var(--bg-secondary);padding:6px 10px;border-radius:4px;user-select:all;word-break:break-all">curl -fsSL https://raw.githubusercontent.com/qingchencloud/clawpanel/main/deploy.sh | bash</code>
                <div style="margin-top:4px;opacity:0.7">部署后在浏览器访问 WSL 的 IP 即可管理。</div>
              </div>
            ` : ''}
            <div style="margin-bottom:10px">
              <div style="font-weight:600;margin-bottom:4px">Docker 容器中使用：</div>
              <div style="margin-bottom:2px;opacity:0.8">在容器内安装 OpenClaw + ClawPanel Web 版：</div>
              <code style="display:block;background:var(--bg-secondary);padding:6px 10px;border-radius:4px;user-select:all;word-break:break-all;margin-bottom:4px">npm i -g @qingchencloud/openclaw-zh</code>
              <code style="display:block;background:var(--bg-secondary);padding:6px 10px;border-radius:4px;user-select:all;word-break:break-all">curl -fsSL https://raw.githubusercontent.com/qingchencloud/clawpanel/main/deploy.sh | bash</code>
            </div>
            <div>
              <div style="font-weight:600;margin-bottom:4px">远程服务器：</div>
              <div style="margin-bottom:2px;opacity:0.8">SSH 登录服务器后执行：</div>
              <code style="display:block;background:var(--bg-secondary);padding:6px 10px;border-radius:4px;user-select:all;word-break:break-all">curl -fsSL https://raw.githubusercontent.com/qingchencloud/clawpanel/main/deploy.sh | bash</code>
            </div>
          </div>
        </details>
        <div style="margin-top:6px;opacity:0.7">
          或者，你也可以在本机重新安装 OpenClaw（使用下方的「一键安装」）。
        </div>
      </div>`
  }

  return `
    <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-sm)">
      选择版本后点击安装，只会安装 OpenClaw CLI npm 包，不会安装 Gateway 服务。
    </p>
    <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-sm)">
      <label class="setup-source-option" style="flex:1;cursor:pointer">
        <input type="radio" name="install-source" value="chinese" checked style="margin-right:6px">
        <div>
          <div style="font-weight:600;font-size:var(--font-size-sm)">汉化优化版（推荐）</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">@qingchencloud/openclaw-zh</div>
        </div>
      </label>
      <label class="setup-source-option" style="flex:1;cursor:pointer">
        <input type="radio" name="install-source" value="official" style="margin-right:6px">
        <div>
          <div style="font-weight:600;font-size:var(--font-size-sm)">官方原版</div>
          <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">openclaw</div>
        </div>
      </label>
    </div>
    <div style="margin-bottom:var(--space-sm)">
      <label style="font-size:var(--font-size-xs);color:var(--text-tertiary);display:block;margin-bottom:4px">npm 镜像源</label>
      <select id="registry-select" style="width:100%;padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-primary);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-sm)">
        <option value="https://registry.npmmirror.com">淘宝镜像（推荐国内用户）</option>
        <option value="https://registry.npmjs.org">npm 官方源</option>
        <option value="https://repo.huaweicloud.com/repository/npm/">华为云镜像</option>
      </select>
    </div>
    <button class="btn btn-primary btn-sm" id="btn-install">一键安装</button>
    ${renderOnboardActionCard(false)}
    ${envHint}
  `
}

function renderOnboardActionCard(cliOk) {
  const isMac = isMacClient()
  const isWin = isWindowsClient()
  const canAutoLaunch = !!window.__TAURI_INTERNALS__ && (isMac || isWin)
  const onboardCommand = getOnboardCommand()
  const platformText = getOnboardPlatformText()

  return `
    <div style="margin-top:var(--space-md);padding:12px;border:1px solid var(--border-primary);border-radius:var(--radius-md);background:var(--bg-tertiary)">
      <div style="display:flex;align-items:center;gap:6px;font-weight:600;color:var(--text-primary);margin-bottom:6px">
        ${icon('terminal', 14)}
        <span>初始化向导</span>
      </div>
      <div style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.7;margin-bottom:10px">
        安装完成后，请执行 <code>${onboardCommand}</code> 完成初始化。
        ${canAutoLaunch ? platformText.openHint : '如果当前环境不支持自动打开，请复制命令后手动执行。'}
      </div>
      <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:8px 10px;font-family:monospace;font-size:12px;color:var(--text-primary);word-break:break-all;margin-bottom:10px">${onboardCommand}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm btn-open-onboard" ${cliOk ? '' : 'disabled'}>${canAutoLaunch ? platformText.openAction : '尝试打开初始化'}</button>
        <button class="btn btn-secondary btn-sm btn-copy-onboard" ${cliOk ? '' : 'disabled'}>复制命令</button>
      </div>
      ${cliOk
        ? '<div class="form-hint" style="margin-top:8px">完成后点击页面底部的“重新检测”更新状态。</div>'
        : '<div class="form-hint" style="margin-top:8px">请先完成上方 OpenClaw CLI 安装，随后这里的按钮会自动可用。</div>'
      }
    </div>
  `
}

async function copyOnboardCommand() {
  const onboardCommand = getOnboardCommand()
  try {
    await navigator.clipboard.writeText(onboardCommand)
    toast('初始化命令已复制到剪贴板', 'success')
    return true
  } catch {
    toast(`请手动复制并执行：${onboardCommand}`, 'warning')
    return false
  }
}

async function openOnboardCommand() {
  const copied = await copyOnboardCommand()
  const platformText = getOnboardPlatformText()
  try {
    await api.launchOpenclawOnboardAdmin()
    toast(copied ? platformText.successCopied : platformText.success, 'success')
  } catch (e) {
    console.warn('[setup] launchOpenclawOnboardAdmin failed:', e)
    toast(copied ? platformText.fallback : `请手动执行：${getOnboardCommand()}`, 'warning')
  }
}

function bindEvents(page, { nodeOk, cliOk }) {
  // 进入面板
  page.querySelector('#btn-enter')?.addEventListener('click', () => {
    navigate('/chat-debug')
  })

  if (cliOk) {
    page.querySelectorAll('.btn-copy-onboard').forEach((btn) => {
      btn.addEventListener('click', () => copyOnboardCommand())
    })
    page.querySelectorAll('.btn-open-onboard').forEach((btn) => {
      btn.addEventListener('click', () => openOnboardCommand())
    })
  }

  // 一键安装 Node.js（便携版）
  page.querySelector('#btn-auto-install-node')?.addEventListener('click', async (e) => {
    const mirror = page.querySelector('#node-mirror-select')?.value || 'cn'
    const version = e.currentTarget.dataset.nodeVersion || '22.14.0'
    const installPath = page.querySelector('#node-install-path')?.value?.trim() || null
    const modal = showUpgradeModal()
    let unlistenLog, unlistenProgress

    try {
      if (window.__TAURI_INTERNALS__) {
        const { listen } = await import('@tauri-apps/api/event')
        unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
        unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
      }

      const msg = await api.installNodePortable(mirror, version, installPath)
      modal.setDone(msg)
      toast('Node.js 安装成功', 'success')
      modal.onClose(() => {
        invalidate('check_node', 'check_installation')
        runDetect(page)
      })
    } catch (e) {
      modal.appendLog(String(e))
      modal.setError('Node.js 安装失败')
    } finally {
      unlistenLog?.()
      unlistenProgress?.()
    }
  })

  // 自动扫描 Node.js
  page.querySelector('#btn-scan-node')?.addEventListener('click', async () => {
    const btn = page.querySelector('#btn-scan-node')
    const resultEl = page.querySelector('#scan-result')
    btn.disabled = true
    btn.textContent = '扫描中...'
    resultEl.style.display = 'block'
    resultEl.innerHTML = '<span style="color:var(--text-tertiary)">正在扫描常见安装路径...</span>'
    try {
      const results = await api.scanNodePaths()
      if (results.length === 0) {
        resultEl.innerHTML = '<span style="color:var(--warning)">未找到 Node.js 安装，请手动指定路径或下载安装。</span>'
      } else {
        resultEl.innerHTML = results.map(r =>
          `<div style="display:flex;align-items:center;gap:6px;margin-top:4px">
            <span style="color:var(--success)">✓</span>
            <code style="flex:1;background:var(--bg-secondary);padding:2px 6px;border-radius:3px;font-size:11px">${r.path}</code>
            <span style="font-size:11px;color:var(--text-tertiary)">${r.version}</span>
            <button class="btn btn-primary btn-sm btn-use-path" data-path="${r.path}" style="font-size:10px;padding:2px 8px">使用</button>
          </div>`
        ).join('')
        resultEl.querySelectorAll('.btn-use-path').forEach(b => {
          b.addEventListener('click', async () => {
            await api.saveCustomNodePath(b.dataset.path)
            toast('Node.js 路径已保存，正在重新检测...', 'success')
            setTimeout(() => window.location.reload(), 500)
          })
        })
      }
    } catch (e) {
      resultEl.innerHTML = `<span style="color:var(--danger)">扫描失败: ${e}</span>`
    } finally {
      btn.disabled = false
      btn.innerHTML = `${icon('search', 12)} 自动扫描`
    }
  })

  // 手动指定路径检测
  page.querySelector('#btn-check-path')?.addEventListener('click', async () => {
    const input = page.querySelector('#input-node-path')
    const resultEl = page.querySelector('#scan-result')
    const dir = input?.value?.trim()
    if (!dir) { toast('请输入 Node.js 安装目录', 'warning'); return }
    resultEl.style.display = 'block'
    resultEl.innerHTML = '<span style="color:var(--text-tertiary)">检测中...</span>'
    try {
      const result = await api.checkNodeAtPath(dir)
      if (result.installed) {
        await api.saveCustomNodePath(dir)
        resultEl.innerHTML = `<span style="color:var(--success)">✓ 找到 Node.js ${result.version}，路径已保存</span>`
        toast('Node.js 路径已保存，正在重新检测...', 'success')
        setTimeout(() => window.location.reload(), 500)
      } else {
        resultEl.innerHTML = `<span style="color:var(--warning)">该目录下未找到 node 可执行文件，请确认路径正确。</span>`
      }
    } catch (e) {
      resultEl.innerHTML = `<span style="color:var(--danger)">检测失败: ${e}</span>`
    }
  })

  // 一键安装
  const installBtn = page.querySelector('#btn-install')
  if (installBtn && nodeOk) installBtn.addEventListener('click', async () => {
    const source = page.querySelector('input[name="install-source"]:checked')?.value || 'chinese'
    const registry = page.querySelector('#registry-select')?.value
    const modal = showUpgradeModal()
    let unlistenLog, unlistenProgress

    setUpgrading(true)
    try {
      if (window.__TAURI_INTERNALS__) {
        try {
          const { listen } = await import('@tauri-apps/api/event')
          unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
          unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
        } catch { /* Web 模式无 Tauri event */ }
      } else {
        modal.appendLog('Web 模式：安装日志不可用，请等待完成...')
      }

      // 先设置镜像源
      if (registry) {
        modal.appendLog(`设置 npm 镜像源: ${registry}`)
        try { await api.setNpmRegistry(registry) } catch {}
      }

      const msg = await api.upgradeOpenclaw(source)
      modal.setDone(msg)
      modal.appendHtmlLog(`${icon('terminal', 14)} ${getOnboardPlatformText().installDone} <code>${getOnboardCommand()}</code>`)

      toast('OpenClaw CLI 安装成功', 'success')
      modal.onClose(() => {
        runDetect(page)
      })
    } catch (e) {
      const errStr = String(e)
      modal.appendLog(errStr)
      // 等待 Tauri 事件队列中残留的 npm 日志行被 JS 处理完毕，
      // 确保 getLogText() 包含完整输出（含 exit code / ENOENT 等关键行）
      await new Promise(r => setTimeout(r, 150))
      const fullLog = modal.getLogText() + '\n' + errStr
      const diagnosis = diagnoseInstallError(fullLog)
      modal.setError(diagnosis.title)
      if (diagnosis.hint) modal.appendLog('')
      if (diagnosis.hint) modal.appendHtmlLog(`${statusIcon('info', 14)} ${diagnosis.hint}`)
      if (diagnosis.command) modal.appendHtmlLog(`${icon('clipboard', 14)} ${diagnosis.command}`)
    } finally {
      setUpgrading(false)
      unlistenLog?.()
      unlistenProgress?.()
    }
  })
}
