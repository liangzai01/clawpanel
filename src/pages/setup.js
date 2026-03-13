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
      openLabel: '管理员 CMD',
      openAction: '打开终端并执行初始化',
      openHint: '可以直接从这里打开管理员 CMD 并自动执行初始化命令。',
      success: '已打开管理员 CMD 并开始执行初始化',
      successCopied: '已打开管理员 CMD 并开始执行初始化，命令也已复制',
      fallback: '自动打开失败，请在管理员 CMD 中粘贴执行',
      installDone: '安装完成。关闭后可在页面中的”初始化向导”卡片打开管理员 CMD 并自动执行',
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
        OpenClaw 安装向导 — 帮你完成运行环境配置、CLI 安装与初始化
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
  // 并行检测 Node.js、Git、OpenClaw CLI、配置文件
  const [nodeRes, gitRes, clawRes, configRes] = await Promise.allSettled([
    api.checkNode(),
    api.checkGit(),
    api.getServicesStatus(),
    api.checkInstallation(),
  ])

  const node = nodeRes.status === 'fulfilled' ? nodeRes.value : { installed: false }
  const git = gitRes.status === 'fulfilled' ? gitRes.value : { installed: false }
  const cliOk = clawRes.status === 'fulfilled'
    && clawRes.value?.length > 0
    && clawRes.value[0]?.cli_installed !== false
  const config = configRes.status === 'fulfilled' ? configRes.value : { installed: false }

  renderSteps(page, { node, git, cliOk, config })
}

function stepIcon(ok) {
  const color = ok ? 'var(--success)' : 'var(--text-tertiary)'
  return `<span style="color:${color};font-weight:700;width:18px;display:inline-block">${ok ? '✓' : '✗'}</span>`
}

function renderSteps(page, { node, git, cliOk, config }) {
  const stepsEl = page.querySelector('#setup-steps')
  const nodeOk = node.installed
  const gitOk = git.installed
  const depsOk = nodeOk && gitOk

  let html = ''

  // 第一步：Node.js + Git 运行环境
  html += `
    <div class="config-section" style="text-align:left">
      <div class="config-section-title" style="display:flex;align-items:center;gap:4px">
        ${stepIcon(depsOk)} 运行环境
        ${depsOk && window.__TAURI_INTERNALS__
          ? `<button class="btn btn-secondary btn-sm" id="btn-show-node-install" style="margin-left:auto;font-size:11px;padding:2px 8px">重新安装</button>`
          : ''
        }
      </div>
      <div style="display:flex;gap:20px;font-size:var(--font-size-sm);margin-bottom:6px">
        <span>${stepIcon(nodeOk)} Node.js ${nodeOk ? `<span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${node.version || ''}</span>` : '<span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">未安装</span>'}</span>
        <span>${stepIcon(gitOk)} Git ${gitOk ? `<span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">${(git.version || '').replace('git version ', '')}</span>` : '<span style="color:var(--text-tertiary);font-size:var(--font-size-xs)">未安装</span>'}</span>
      </div>
      ${depsOk
        ? `<div id="node-reinstall-panel" style="display:none">
             <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-sm)">
               重新安装运行环境
             </p>
             ${window.__TAURI_INTERNALS__ ? renderNodeInstallTabs() : ''}
           </div>`
        : `<p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-sm)">
            OpenClaw 需要 Node.js 和 Git，请先安装。
          </p>
          ${window.__TAURI_INTERNALS__
            ? renderNodeInstallTabs()
            : `<a class="btn btn-primary btn-sm" href="https://nodejs.org/" target="_blank" rel="noopener">下载 Node.js</a>
               <a class="btn btn-secondary btn-sm" href="https://git-scm.com/" target="_blank" rel="noopener" style="margin-left:8px">下载 Git</a>
               <span class="form-hint" style="margin-left:8px">安装后点击「重新检测」</span>`
          }`
      }
    </div>
  `

  // 第二步：OpenClaw CLI
  html += `
    <div class="config-section" style="text-align:left;${depsOk ? '' : 'opacity:0.4;pointer-events:none'}">
      <div class="config-section-title" style="display:flex;align-items:center;gap:4px">
        ${stepIcon(cliOk)} 安装OpenClaw CLI
      </div>
      ${cliOk
        ? `<p style="color:var(--success);font-size:var(--font-size-sm)">OpenClaw CLI 已安装</p>`
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
        ? `<p style="color:var(--success);font-size:var(--font-size-sm);margin-bottom:var(--space-sm)">已完成初始化，配置文件位于 ${config.path || ''}</p>`
        : ''
      }
      ${renderOnboardActionCard(cliOk)}
    </div>
  `

  stepsEl.innerHTML = html
  bindEvents(page, { nodeOk, cliOk })

  // 未安装时，异步获取最新版本并更新按钮
  if (window.__TAURI_INTERNALS__) {
    if (!nodeOk) {
      const btn = page.querySelector('#btn-auto-install-node')
      const verEl = page.querySelector('#node-lts-ver')
      api.getLatestNodeLtsVersion().then(ver => {
        if (verEl) verEl.textContent = `v${ver}`
        if (btn) {
          btn.disabled = false
          btn.dataset.nodeVersion = ver
        }
      }).catch(() => {
        // Rust 侧已内置 fallback，invoke 本身失败时不强行设版本
        if (btn) btn.disabled = false
      })
    }
    if (isWindowsClient()) {
      const gitBtn = page.querySelector('#btn-auto-install-git')
      const gitVerEl = page.querySelector('#git-lts-ver')
      api.getLatestGitVersion().then(ver => {
        if (gitVerEl) gitVerEl.textContent = `v${ver}`
        if (gitBtn) {
          gitBtn.disabled = false
          gitBtn.dataset.gitVersion = ver
        }
      }).catch(() => {
        if (gitBtn) {
          gitBtn.disabled = false
          gitBtn.dataset.gitVersion = '2.48.1'
        }
      })
    }
  }
}

function renderNodeInstallTabs() {
  const isWin = isWindowsClient()
  const isMac = isMacClient()
  return `
    <div style="margin-bottom:10px">
      <div style="display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--border-primary);padding-bottom:8px">
        <button class="btn btn-primary btn-sm node-install-tab" data-tab="manual" style="padding:4px 14px">官方安装包</button>
        <button class="btn btn-secondary btn-sm node-install-tab" data-tab="auto" style="padding:4px 14px">便携版</button>
        <button class="btn btn-secondary btn-sm node-install-tab" data-tab="cmd" style="padding:4px 14px">命令行安装</button>
      </div>

      <!-- 手动安装 tab（默认显示） -->
      <div id="node-tab-manual">
        <div class="form-hint" style="margin-bottom:10px;line-height:1.6">
          自动识别当前系统，直接获取对应平台的最新 LTS 安装包下载链接。
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);white-space:nowrap">下载源:</span>
          <select id="manual-mirror-select" style="flex:1;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-primary);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-xs)">
            <option value="cn">npmmirror 淘宝镜像（国内推荐）</option>
            <option value="official">nodejs.org 官方</option>
          </select>
        </div>

        <!-- Node.js 下载 -->
        <div style="margin-bottom:12px">
          <div style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:8px">Node.js LTS</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btn-download-node-installer">
              下载安装包
            </button>
            <span id="manual-node-detect" style="font-size:var(--font-size-xs);color:var(--text-secondary)"></span>
          </div>
        </div>

        ${isWin ? `
        <!-- Git 下载（仅 Windows） -->
        <div style="border-top:1px solid var(--border-primary);padding-top:12px;margin-bottom:12px">
          <div style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:8px">Git（OpenClaw 必需）</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btn-download-git-installer">
              下载安装包
            </button>
            <span id="manual-git-detect" style="font-size:var(--font-size-xs);color:var(--text-secondary)"></span>
          </div>
        </div>` : `
        <!-- Git 安装引导（macOS / Linux） -->
        <div style="border-top:1px solid var(--border-primary);padding-top:12px;margin-bottom:12px">
          <div style="font-weight:600;font-size:var(--font-size-sm);margin-bottom:8px">Git（OpenClaw 必需）</div>
          ${isMac ? `
          <div style="margin-bottom:6px">
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">方式一：Xcode 命令行工具（推荐）</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace">xcode-select --install</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="xcode-select --install" style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>
          <div>
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">方式二：Homebrew（如已安装）</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace">brew install git</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="brew install git" style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>` : `
          <div style="margin-bottom:6px">
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">Ubuntu / Debian：</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace">sudo apt-get install git</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="sudo apt-get install git" style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>
          <div>
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">CentOS / RHEL / Fedora：</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace">sudo yum install git</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="sudo yum install git" style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>`}
          <div class="form-hint" style="margin-top:8px">安装后重启 ClawInstaller，点击「重新检测」</div>
        </div>`}

        <ol style="margin:12px 0 0 18px;padding:0;font-size:var(--font-size-xs);color:var(--text-secondary);line-height:2.2;border-top:1px solid var(--border-primary);padding-top:10px">
          <li>点击上方按钮，浏览器自动打开下载链接</li>
          <li>运行下载好的安装包，保持默认选项完成安装</li>
          <li>完全退出并重启 ClawInstaller</li>
          <li>点击「重新检测」</li>
        </ol>
      </div>

      <!-- 自动安装 tab -->
      <div id="node-tab-auto" style="display:none">
        <div class="form-hint" style="margin-bottom:10px;line-height:1.6">
          便携版绿色安装，不修改系统 PATH，安装后<strong>无需重启</strong>即可继续。
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);white-space:nowrap">根目录:</span>
          <input id="root-install-path" type="text"
            value="${isWin ? 'C:\\claw-tools' : '~/claw-tools'}"
            style="flex:1;padding:3px 8px;border:1px solid var(--border-primary);border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary);font-size:11px;font-family:monospace">
          <button class="btn btn-secondary btn-sm" id="btn-pick-root-dir" style="font-size:11px;padding:3px 8px;white-space:nowrap">浏览…</button>
        </div>
        <div class="form-hint" style="margin-bottom:8px">
          将在此目录下自动创建 <code>node</code>${isWin ? '、<code>git</code>' : ''} 子目录（不存在时自动创建）
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="font-size:var(--font-size-xs);color:var(--text-secondary);white-space:nowrap">镜像源:</span>
          <select id="node-mirror-select" style="flex:1;padding:3px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-primary);background:var(--bg-secondary);color:var(--text-primary);font-size:var(--font-size-xs)">
            <option value="cn">npmmirror 淘宝镜像（国内推荐）</option>
            <option value="official">nodejs.org 官方</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn btn-primary btn-sm" id="btn-auto-install-node" disabled style="min-width:180px">
            安装 Node.js <span id="node-lts-ver" style="opacity:0.7">v22 LTS</span>
          </button>
        </div>

        <!-- Git 安装（仅 Windows） -->
        ${isWin ? `
        <div style="border-top:1px solid var(--border-primary);margin-top:12px;padding-top:12px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
            <button class="btn btn-primary btn-sm" id="btn-auto-install-git" disabled style="min-width:180px">
              安装 Git <span id="git-lts-ver" style="opacity:0.7">MinGit</span>
            </button>
          </div>
          <div class="form-hint" style="line-height:1.5">MinGit 精简便携版，含 git 核心命令，约 40MB，不修改系统 PATH。</div>
        </div>` : ''}

        <!-- 配置到系统 PATH（安装后可用） -->
        <div style="border-top:1px solid var(--border-primary);margin-top:14px;padding-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" id="btn-add-to-system-path" style="min-width:200px">
            配置到系统 PATH（终端直接可用）
          </button>
          <span class="form-hint" style="margin:0">安装后点击，重开终端即可用 <code>node</code>${isWin ? ' / <code>git</code>' : ''} 命令</span>
        </div>
      </div>

      <!-- 命令安装 tab -->
      <div id="node-tab-cmd" style="display:none">
        <div style="display:flex;gap:4px;margin-bottom:10px">
          <button class="btn btn-primary btn-sm pkgmgr-tab" data-pkgmgr="winget" style="padding:3px 10px">winget（推荐）</button>
          <button class="btn btn-secondary btn-sm pkgmgr-tab" data-pkgmgr="choco" style="padding:3px 10px">Chocolatey</button>
        </div>

        <!-- winget -->
        <div id="pkgmgr-winget-section">
          <div class="form-hint" style="margin-bottom:8px;line-height:1.6">
            <strong>winget</strong> 是 Windows 包管理器，安装完成后需<strong>重启 ClawInstaller</strong>，然后点击「重新检测」。
          </div>
          <!-- Windows 10 用户提示 -->
          <div style="background:var(--bg-tertiary);border:1px solid var(--color-warning,#f59e0b);border-radius:var(--radius-sm);padding:8px 10px;margin-bottom:10px;line-height:1.6;font-size:var(--font-size-xs)">
            ⚠️ <strong>Windows 10 用户</strong>：winget 默认未内置，需先安装「应用安装程序」才能使用。
            <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
              <button class="btn btn-secondary btn-sm" id="btn-open-ms-store-winget" style="font-size:11px;white-space:nowrap">打开微软商店 → 安装 winget</button>
              <span style="color:var(--text-secondary)">安装后重启本应用，再使用下方命令</span>
            </div>
          </div>
          <div style="margin-bottom:6px">
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">Node.js LTS：</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace">winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements" style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>
          <div style="margin-bottom:10px">
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">Git：</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace">winget install Git.Git --accept-package-agreements --accept-source-agreements</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="winget install Git.Git --accept-package-agreements --accept-source-agreements" style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btn-run-winget-auto">一键自动安装</button>
            <button class="btn btn-secondary btn-sm" id="btn-open-admin-ps-winget">打开管理员 PowerShell</button>
            <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements&#10;winget install Git.Git --accept-package-agreements --accept-source-agreements">复制全部命令</button>
          </div>
        </div>

        <!-- choco -->
        <div id="pkgmgr-choco-section" style="display:none">
          <div class="form-hint" style="margin-bottom:8px;line-height:1.6">
            <strong>Chocolatey</strong> 是 Windows 上流行的社区包管理器，首次使用需先安装 Chocolatey 本身。<br>
            安装完成后需<strong>重启 ClawInstaller</strong>，然后点击「重新检测」。
          </div>
          <div style="margin-bottom:6px">
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">步骤 1 — 安装 Chocolatey（管理员运行）：</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace;word-break:break-all">powershell -c "irm https://community.chocolatey.org/install.ps1|iex"</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd='powershell -c "irm https://community.chocolatey.org/install.ps1|iex"' style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>
          <div style="margin-bottom:10px">
            <div style="font-size:var(--font-size-xs);color:var(--text-secondary);margin-bottom:3px">步骤 2 — 安装 Node.js LTS + Git：</div>
            <div style="display:flex;gap:6px;align-items:center">
              <code style="flex:1;background:var(--bg-secondary);padding:5px 8px;border-radius:var(--radius-sm);font-size:11px;font-family:monospace">choco install nodejs-lts git -y</code>
              <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd="choco install nodejs-lts git -y" style="font-size:11px;padding:2px 8px;white-space:nowrap">复制</button>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="btn-run-choco-auto">一键自动安装</button>
            <button class="btn btn-secondary btn-sm" id="btn-open-admin-ps-choco">打开管理员 PowerShell</button>
            <button class="btn btn-secondary btn-sm copy-cmd-btn" data-cmd='powershell -c "irm https://community.chocolatey.org/install.ps1|iex"&#10;choco install nodejs-lts git -y'>复制全部命令</button>
          </div>
        </div>
      </div>
    </div>
  `
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
        <p style="margin:6px 0 2px">本机安装向导仅能为<strong>当前机器</strong>安装 OpenClaw。以下环境中的安装需要单独操作：</p>
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
            在其他环境中安装 OpenClaw
          </summary>
          <div style="margin-top:8px">
            ${isWin ? `
              <div style="margin-bottom:10px">
                <div style="font-weight:600;margin-bottom:4px">WSL 中使用 Web 版：</div>
                <div style="margin-bottom:2px;opacity:0.8">打开 WSL 终端，一键部署 OpenClaw + 管理面板 Web 版：</div>
                <code style="display:block;background:var(--bg-secondary);padding:6px 10px;border-radius:4px;user-select:all;word-break:break-all">curl -fsSL https://raw.githubusercontent.com/qingchencloud/clawpanel/main/deploy.sh | bash</code>
                <div style="margin-top:4px;opacity:0.7">部署后在浏览器访问 WSL 的 IP 即可管理。</div>
              </div>
            ` : ''}
            <div style="margin-bottom:10px">
              <div style="font-weight:600;margin-bottom:4px">Docker 容器中使用：</div>
              <div style="margin-bottom:2px;opacity:0.8">在容器内安装 OpenClaw + 管理面板 Web 版：</div>
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
          或者，你也可以在本机重新安装 OpenClaw（使用下方的「安装 OpenClaw」）。
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
    <button class="btn btn-primary btn-sm" id="btn-install">安装 OpenClaw</button>
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
      <div style="font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.7;margin-bottom:10px">
        请执行 <code>${onboardCommand}</code> 完成初始化。
        ${canAutoLaunch ? platformText.openHint : '如果当前环境不支持自动打开，请复制命令后手动执行。'}
      </div>
      <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:8px 10px;font-family:monospace;font-size:12px;color:var(--text-primary);word-break:break-all;margin-bottom:10px">${onboardCommand}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm btn-open-onboard" ${cliOk ? '' : 'disabled'}>${canAutoLaunch ? platformText.openAction : '尝试打开初始化'}</button>
        <button class="btn btn-secondary btn-sm btn-copy-onboard" ${cliOk ? '' : 'disabled'}>复制命令</button>
      </div>
      ${cliOk
        ? '<div class="form-hint" style="margin-top:8px">完成后点击页面底部的"重新检测"更新状态。</div>'
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

  if (cliOk) {
    page.querySelectorAll('.btn-copy-onboard').forEach((btn) => {
      btn.addEventListener('click', () => copyOnboardCommand())
    })
    page.querySelectorAll('.btn-open-onboard').forEach((btn) => {
      btn.addEventListener('click', () => openOnboardCommand())
    })
  }

  // 已安装时「重新安装」按钮 — 展开安装面板
  page.querySelector('#btn-show-node-install')?.addEventListener('click', () => {
    const panel = page.querySelector('#node-reinstall-panel')
    const btn = page.querySelector('#btn-show-node-install')
    if (panel) panel.style.display = ''
    if (btn) btn.style.display = 'none'
  })

  // 手动安装 — 平台检测 + 下载 Node.js 安装包
  page.querySelector('#btn-download-node-installer')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    const mirror = page.querySelector('#manual-mirror-select')?.value || 'cn'
    const resultEl = page.querySelector('#manual-node-detect')
    btn.disabled = true
    btn.textContent = '获取版本中...'
    try {
      const version = await api.getLatestNodeLtsVersion()
      const ua = navigator.userAgent.toLowerCase()
      const isArm = ua.includes('arm') || ua.includes('aarch64')
      const base = mirror === 'cn'
        ? `https://registry.npmmirror.com/-/binary/node/v${version}`
        : `https://nodejs.org/dist/v${version}`
      let url, desc
      if (isWindowsClient()) {
        const arch = isArm ? 'arm64' : 'x64'
        url = `${base}/node-v${version}-${arch}.msi`
        desc = `Windows ${arch}`
      } else if (isMacClient()) {
        url = `${base}/node-v${version}.pkg`
        desc = 'macOS (通用)'
      } else {
        const arch = isArm ? 'arm64' : 'x64'
        url = `${base}/node-v${version}-linux-${arch}.tar.gz`
        desc = `Linux ${arch}`
      }
      if (resultEl) resultEl.textContent = `v${version} · ${desc}`
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
      toast(`正在打开下载链接：Node.js v${version} (${desc})`, 'success')
    } catch (err) {
      toast(`获取下载链接失败: ${err}`, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '检测平台并下载安装包'
    }
  })

  // 手动安装 — 平台检测 + 下载 Git 安装包（仅 Windows）
  page.querySelector('#btn-download-git-installer')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    const mirror = page.querySelector('#manual-mirror-select')?.value || 'cn'
    const resultEl = page.querySelector('#manual-git-detect')
    btn.disabled = true
    btn.textContent = '获取版本中...'
    try {
      const version = await api.getLatestGitVersion()
      const tag = `v${version}.windows.1`
      const filename = `Git-${version}-64-bit.exe`
      const url = mirror === 'cn'
        ? `https://registry.npmmirror.com/-/binary/git-for-windows/${tag}/${filename}`
        : `https://github.com/git-for-windows/git/releases/download/${tag}/${filename}`
      if (resultEl) resultEl.textContent = `v${version} · Windows x64`
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
      toast(`正在打开下载链接：Git v${version} (Windows x64)`, 'success')
    } catch (err) {
      toast(`获取下载链接失败: ${err}`, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '检测平台并下载安装包'
    }
  })

  // 拼接子安装路径（根目录 + 子目录名）
  function joinInstallPath(root, sub) {
    if (!root) return null
    const sep = root.includes('\\') ? '\\' : '/'
    return root.replace(/[/\\]+$/, '') + sep + sub
  }

  // 一键安装 Node.js（便携版）
  page.querySelector('#btn-auto-install-node')?.addEventListener('click', async (e) => {
    const mirror = page.querySelector('#node-mirror-select')?.value || 'cn'
    const version = e.currentTarget.dataset.nodeVersion || '24.14.0'
    const root = page.querySelector('#root-install-path')?.value?.trim() || null
    const installPath = joinInstallPath(root, 'node')
    const modal = showUpgradeModal('安装 Node.js')
    let unlistenLog, unlistenProgress

    try {
      if (window.__TAURI_INTERNALS__) {
        const { listen } = await import('@tauri-apps/api/event')
        unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
        unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
      }

      const msg = await api.installNodePortable(mirror, version, installPath)
      modal.setDone(msg)
      // 安装后自动配置系统 PATH，用户重开终端即可直接使用
      try {
        const pathMsg = await api.addPortableToSystemPath()
        modal.appendLog(`🔧 ${pathMsg}`)
        modal.appendLog('✅ 已写入系统 PATH，重新打开终端后即可使用 node 命令')
      } catch (pathErr) {
        modal.appendLog(`⚠️ 自动配置 PATH 失败: ${pathErr}，请手动点击"配置到系统 PATH"按钮`)
      }
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

  // 顶层 Tab 切换（自动安装 / 命令安装 / 手动安装）
  page.querySelectorAll('.node-install-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab
      page.querySelectorAll('.node-install-tab').forEach(t => {
        t.classList.toggle('btn-primary', t.dataset.tab === target)
        t.classList.toggle('btn-secondary', t.dataset.tab !== target)
      })
      page.querySelector('#node-tab-auto').style.display = target === 'auto' ? '' : 'none'
      page.querySelector('#node-tab-cmd').style.display = target === 'cmd' ? '' : 'none'
      page.querySelector('#node-tab-manual').style.display = target === 'manual' ? '' : 'none'
    })
  })

  // 包管理器子标签切换（winget / Chocolatey）
  page.querySelectorAll('.pkgmgr-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const pkgmgr = tab.dataset.pkgmgr
      page.querySelectorAll('.pkgmgr-tab').forEach(t => {
        t.classList.toggle('btn-primary', t.dataset.pkgmgr === pkgmgr)
        t.classList.toggle('btn-secondary', t.dataset.pkgmgr !== pkgmgr)
      })
      const wingetSection = page.querySelector('#pkgmgr-winget-section')
      const chocoSection = page.querySelector('#pkgmgr-choco-section')
      if (wingetSection) wingetSection.style.display = pkgmgr === 'winget' ? '' : 'none'
      if (chocoSection) chocoSection.style.display = pkgmgr === 'choco' ? '' : 'none'
    })
  })

  // 通用复制命令按钮
  page.querySelectorAll('.copy-cmd-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cmd = btn.dataset.cmd
      try {
        await navigator.clipboard.writeText(cmd)
        const orig = btn.textContent
        btn.textContent = '✓ 已复制'
        setTimeout(() => { btn.textContent = orig }, 1500)
      } catch {
        toast('复制失败，请手动复制', 'warning')
      }
    })
  })

  // 一键自动安装 — winget（打开管理员 PS 并自动执行命令）
  page.querySelector('#btn-run-winget-auto')?.addEventListener('click', async () => {
    try {
      await api.runPowershellScriptAsAdmin(
        'winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements\r\nwinget install Git.Git --accept-package-agreements --accept-source-agreements'
      )
      toast('已请求管理员权限，安装窗口正在打开...', 'success')
    } catch (e) {
      const msg = String(e)
      if (msg.includes('winget') || msg.includes('不是内部或外部命令') || msg.includes('not recognized')) {
        toast('未检测到 winget，Windows 10 用户请先点击"打开微软商店 → 安装 winget"', 'warning')
      } else {
        toast(`启动失败: ${msg}`, 'warning')
      }
    }
  })

  // 打开微软商店安装 winget（App Installer）
  page.querySelector('#btn-open-ms-store-winget')?.addEventListener('click', async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open('ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1')
    } catch {
      toast('无法打开微软商店，请手动搜索「应用安装程序」安装', 'warning')
    }
  })

  // 一键自动安装 — Chocolatey（打开管理员 PS 并自动执行命令）
  page.querySelector('#btn-run-choco-auto')?.addEventListener('click', async () => {
    try {
      await api.runPowershellScriptAsAdmin(
        'powershell -c "irm https://community.chocolatey.org/install.ps1|iex"\r\nchoco install nodejs-lts git -y'
      )
      toast('已请求管理员权限，安装窗口正在打开...', 'success')
    } catch (e) {
      toast(`启动失败: ${e}`, 'warning')
    }
  })

  // 打开管理员 PowerShell（仅打开空白窗口）
  const openAdminPs = async () => {
    try {
      await api.launchAdminPowershell()
      toast('已打开管理员 PowerShell，请粘贴命令执行', 'success')
    } catch (e) {
      console.warn('[setup] launchAdminPowershell failed:', e)
      toast('自动打开失败，请手动以管理员身份打开 PowerShell', 'warning')
    }
  }
  page.querySelector('#btn-open-admin-ps-winget')?.addEventListener('click', openAdminPs)
  page.querySelector('#btn-open-admin-ps-choco')?.addEventListener('click', openAdminPs)

  // 浏览选择根安装目录
  page.querySelector('#btn-pick-root-dir')?.addEventListener('click', async () => {
    try {
      const selected = await api.pickDirectory('选择便携版工具根目录')
      if (selected) {
        const input = page.querySelector('#root-install-path')
        if (input) input.value = selected
      }
    } catch (e) {
      toast('目录选择失败，请手动输入路径', 'warning')
    }
  })

  // 一键安装 Git（便携版 MinGit）
  page.querySelector('#btn-auto-install-git')?.addEventListener('click', async (e) => {
    const mirror = page.querySelector('#node-mirror-select')?.value || 'cn'
    const version = e.currentTarget.dataset.gitVersion || '2.48.1'
    const root = page.querySelector('#root-install-path')?.value?.trim() || null
    const installPath = joinInstallPath(root, 'git')
    const modal = showUpgradeModal('安装 Git')
    let unlistenLog, unlistenProgress

    try {
      if (window.__TAURI_INTERNALS__) {
        const { listen } = await import('@tauri-apps/api/event')
        unlistenLog = await listen('upgrade-log', (e) => modal.appendLog(e.payload))
        unlistenProgress = await listen('upgrade-progress', (e) => modal.setProgress(e.payload))
      }

      const msg = await api.installGitPortable(mirror, version, installPath)
      modal.setDone(msg)
      // 安装后自动配置系统 PATH，用户重开终端即可直接使用
      try {
        const pathMsg = await api.addPortableToSystemPath()
        modal.appendLog(`🔧 ${pathMsg}`)
        modal.appendLog('✅ 已写入系统 PATH，重新打开终端后即可使用 git 命令')
      } catch (pathErr) {
        modal.appendLog(`⚠️ 自动配置 PATH 失败: ${pathErr}，请手动点击"配置到系统 PATH"按钮`)
      }
      toast('Git 安装成功', 'success')
      modal.onClose(() => {
        invalidate('check_git')
        runDetect(page)
      })
    } catch (e) {
      modal.appendLog(String(e))
      modal.setError('Git 安装失败')
    } finally {
      unlistenLog?.()
      unlistenProgress?.()
    }
  })

  // 配置到系统 PATH
  page.querySelector('#btn-add-to-system-path')?.addEventListener('click', async () => {
    const btn = page.querySelector('#btn-add-to-system-path')
    const orig = btn.textContent
    btn.disabled = true
    btn.textContent = '配置中...'
    try {
      const msg = await api.addPortableToSystemPath()
      toast(msg, 'success')
    } catch (e) {
      toast(String(e), 'error')
    } finally {
      btn.disabled = false
      btn.textContent = orig
    }
  })

  // 一键安装
  const installBtn = page.querySelector('#btn-install')
  if (installBtn && nodeOk) installBtn.addEventListener('click', async () => {
    const source = page.querySelector('input[name="install-source"]:checked')?.value || 'chinese'
    const registry = page.querySelector('#registry-select')?.value
    const modal = showUpgradeModal('安装 OpenClaw')
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
