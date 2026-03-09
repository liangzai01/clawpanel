/**
 * 配置向导组件 — 三步走快速添加第一个服务商
 * 步骤 1：选择服务商
 * 步骤 2：填写接口地址 + API Key（+ 自定义 Model ID）
 * 步骤 3：勾选要启用的模型
 *
 * 调用方式：
 *   openConfigWizard(onDone?)
 *   onDone?: (added: boolean) => void
 */
import { PROVIDER_PRESETS, MODEL_PRESETS, PROVIDER_CATEGORIES, QUICK_PROVIDERS } from '../lib/model-presets.js'
import { toast } from './toast.js'

/**
 * @param {Function} onDone  — 完成/跳过后的回调，added=true 表示成功写入配置
 */
export function openConfigWizard(onDone) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.style.zIndex = '2000'
  document.body.appendChild(overlay)

  const ctx = {
    step: 1,
    preset: null,        // PROVIDER_PRESETS 中选中的项
    customKey: '',
    customUrl: '',
    customLabel: '',
    customApi: 'openai-completions',
    customKeyMode: 'paste',   // 'paste' | 'env' | 'skip'
    customKeyEnvVar: '',
    customModelIds: [],  // 自定义服务商手动输入的 model ID 列表
    selectedModels: [],
    onDone,
    overlay,
  }

  renderStep(ctx)
}

// ─── 渲染当前步骤 ──────────────────────────────────────────────────────────

function renderStep(ctx) {
  ctx.overlay.innerHTML = ''
  const modal = document.createElement('div')
  modal.className = 'modal'
  modal.style.cssText = 'max-width:540px;width:100%'
  ctx.overlay.appendChild(modal)

  switch (ctx.step) {
    case 1: renderStep1(ctx, modal); break
    case 2: renderStep2(ctx, modal); break
    case 3: renderStep3(ctx, modal); break
  }
}

// ─── 步骤 1：选择服务商 ────────────────────────────────────────────────────

function renderStep1(ctx, modal) {
  const quickPresets = QUICK_PROVIDERS.map(k => PROVIDER_PRESETS.find(p => p.key === k)).filter(Boolean)

  modal.innerHTML = `
    <div class="modal-title">配置向导 <span style="font-size:var(--font-size-xs);color:var(--text-tertiary);font-weight:400">第 1 步 / 共 3 步</span></div>
    <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-md)">
      选择你的 AI 服务商。向导将引导你完成密钥填写和模型选择。
    </p>

    <div style="margin-bottom:var(--space-md)">
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-bottom:6px">常用</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
        ${quickPresets.map(p => `
          <button class="wz-quick-btn" data-key="${p.key}" style="
            padding:10px 6px;border-radius:var(--radius-md);border:1px solid var(--border-primary);
            background:var(--bg-tertiary);cursor:pointer;text-align:center;
            font-size:var(--font-size-xs);color:var(--text-primary);
            transition:border-color 0.15s,background 0.15s
          "><div style="font-weight:600">${p.label}</div></button>
        `).join('')}
        <button class="wz-quick-btn" data-key="__custom__" style="
          padding:10px 6px;border-radius:var(--radius-md);border:1px dashed var(--border-primary);
          background:var(--bg-secondary);cursor:pointer;text-align:center;
          font-size:var(--font-size-xs);color:var(--text-tertiary);
          transition:border-color 0.15s,background 0.15s
        "><div style="font-weight:600">自定义</div></button>
      </div>
    </div>

    <div style="margin-bottom:var(--space-md)">
      <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-bottom:6px">全部服务商</div>
      <input id="wz-search" type="text" placeholder="搜索服务商..." style="
        width:100%;padding:6px 10px;box-sizing:border-box;
        border:1px solid var(--border-primary);border-radius:var(--radius-sm);
        background:var(--bg-secondary);color:var(--text-primary);
        font-size:var(--font-size-sm);margin-bottom:6px
      ">
      <div id="wz-provider-list" style="
        max-height:220px;overflow-y:auto;
        border:1px solid var(--border-primary);border-radius:var(--radius-md)
      ">
        ${_renderProviderList(PROVIDER_PRESETS, '')}
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary btn-sm" data-wz="cancel">跳过</button>
      <button class="btn btn-primary btn-sm" data-wz="next" disabled>下一步 →</button>
    </div>
  `

  let selectedKey = ctx.preset?.key || null
  const nextBtn = modal.querySelector('[data-wz="next"]')

  function selectProvider(key) {
    selectedKey = key
    ctx.preset = key === '__custom__'
      ? { key: '__custom__', label: '自定义服务商', baseUrl: '', api: 'openai-completions', keyUrl: null }
      : PROVIDER_PRESETS.find(p => p.key === key)
    nextBtn.disabled = !ctx.preset
    _highlightStep1(modal, key)
  }

  if (selectedKey) selectProvider(selectedKey)

  modal.querySelectorAll('.wz-quick-btn').forEach(btn => {
    btn.onclick = () => selectProvider(btn.dataset.key)
  })

  modal.querySelector('#wz-provider-list').addEventListener('click', e => {
    const item = e.target.closest('.wz-list-item')
    if (item) selectProvider(item.dataset.key)
  })

  modal.querySelector('#wz-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase()
    modal.querySelector('#wz-provider-list').innerHTML = _renderProviderList(PROVIDER_PRESETS, q)
    if (selectedKey) _highlightListItems(modal, selectedKey)
  })

  modal.querySelector('[data-wz="cancel"]').onclick = () => {
    ctx.overlay.remove(); ctx.onDone?.(false)
  }

  nextBtn.onclick = () => {
    if (!ctx.preset) return
    ctx.step = 2
    renderStep(ctx)
  }

  ctx.overlay.onclick = e => {
    if (e.target === ctx.overlay) { ctx.overlay.remove(); ctx.onDone?.(false) }
  }
}

function _highlightStep1(modal, key) {
  modal.querySelectorAll('.wz-quick-btn').forEach(b => {
    const active = b.dataset.key === key
    const isCustom = b.dataset.key === '__custom__'
    b.style.borderStyle  = isCustom && !active ? 'dashed' : 'solid'
    b.style.borderColor  = active ? 'var(--primary, #6366f1)' : 'var(--border-primary)'
    b.style.background   = active ? 'var(--accent-muted, rgba(99,102,241,0.08))' : (isCustom ? 'var(--bg-secondary)' : 'var(--bg-tertiary)')
    b.style.color        = active ? 'var(--primary, #6366f1)' : (isCustom ? 'var(--text-tertiary)' : 'var(--text-primary)')
  })
  _highlightListItems(modal, key)
}

function _highlightListItems(modal, key) {
  modal.querySelectorAll('.wz-list-item').forEach(el => {
    const active = el.dataset.key === key
    el.style.background = active ? 'var(--accent-muted, rgba(99,102,241,0.08))' : ''
    el.style.color = active ? 'var(--primary, #6366f1)' : 'var(--text-primary)'
  })
}

/** 渲染分类服务商列表 + 末尾自定义选项 */
function _renderProviderList(presets, query) {
  const q = (query || '').trim().toLowerCase()
  const filtered = q
    ? presets.filter(p => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
    : presets

  let html = ''

  if (filtered.length === 0 && !q.includes('自定义') && !q.includes('custom')) {
    html = '<div style="padding:12px;text-align:center;color:var(--text-tertiary);font-size:var(--font-size-sm)">无匹配结果</div>'
  } else if (q) {
    // 搜索结果：平铺显示
    html = filtered.map(p => _providerItemHtml(p)).join('')
  } else {
    // 全量：按分类分组
    html = PROVIDER_CATEGORIES.map(cat => {
      const items = filtered.filter(p => p.category === cat.key)
      if (!items.length) return ''
      return `
        <div style="padding:4px 10px 2px;font-size:10px;color:var(--text-tertiary);
                    background:var(--bg-tertiary);border-bottom:1px solid var(--border-primary)">${cat.label}</div>
        ${items.map(p => _providerItemHtml(p)).join('')}
      `
    }).join('')
  }

  // 末尾追加自定义选项（搜索"自定义/custom"时也出现）
  const showCustom = !q || '自定义'.includes(q) || 'custom'.includes(q)
  if (showCustom) {
    html += `
      <div style="padding:4px 10px 2px;font-size:10px;color:var(--text-tertiary);
                  background:var(--bg-tertiary);border-bottom:1px solid var(--border-primary)">其他</div>
      <div class="wz-list-item" data-key="__custom__" style="
        padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-primary);
        display:flex;align-items:center;justify-content:space-between;
        transition:background 0.1s
      " onmouseover="if(!this.style.color||this.style.color==='var(--text-primary)')this.style.background='var(--bg-hover,var(--bg-secondary))'"
         onmouseout="if(!this.style.color||this.style.color==='var(--text-primary)')this.style.background=''">
        <span style="font-size:var(--font-size-sm);font-weight:500">自定义服务商</span>
        <span style="font-size:10px;color:var(--text-tertiary)">手动配置</span>
      </div>
    `
  }

  return html
}

function _providerItemHtml(p) {
  return `
    <div class="wz-list-item" data-key="${p.key}" style="
      padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-primary);
      display:flex;align-items:center;justify-content:space-between;
      transition:background 0.1s
    " onmouseover="if(!this.style.color||this.style.color==='var(--text-primary)')this.style.background='var(--bg-hover,var(--bg-secondary))'"
       onmouseout="if(!this.style.color||this.style.color==='var(--text-primary)')this.style.background=''">
      <span style="font-size:var(--font-size-sm);font-weight:500">${p.label}</span>
      <span style="font-size:10px;color:var(--text-tertiary)">${_apiTypeBadge(p.api)}</span>
    </div>
  `
}

function _apiTypeBadge(api) {
  const map = {
    'openai-completions': 'OpenAI 兼容',
    'anthropic-messages': 'Anthropic 原生',
    'openai-responses':   'Responses API',
    'google-gemini':      'Google Gemini',
  }
  return map[api] || api
}

// ─── 步骤 2：填写接口信息 ──────────────────────────────────────────────────

function renderStep2(ctx, modal) {
  const p = ctx.preset
  const isCustom = p.key === '__custom__'
  const keyLink = p.keyUrl || null

  const apiTypes = [
    { value: 'openai-completions', label: 'OpenAI 兼容（推荐）' },
    { value: 'anthropic-messages', label: 'Anthropic 原生' },
    { value: 'openai-responses',   label: 'OpenAI Responses API' },
    { value: 'google-gemini',      label: 'Google Gemini' },
  ]

  const keyModes = [
    { value: 'paste', label: '直接粘贴 API 密钥' },
    { value: 'env',   label: '使用环境变量' },
    { value: 'skip',  label: '跳过（无需密钥，如本地模型）' },
  ]

  const curKeyMode = ctx.customKeyMode || 'paste'

  modal.innerHTML = `
    <div class="modal-title">配置向导 <span style="font-size:var(--font-size-xs);color:var(--text-tertiary);font-weight:400">第 2 步 / 共 3 步</span></div>
    <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-md)">
      填写 <strong>${p.label}</strong> 的接口信息。
    </p>

    ${isCustom ? `
    <div class="form-group">
      <label class="form-label">服务商名称</label>
      <input class="form-input" id="wz-provider-name" placeholder="我的服务商" value="${_esc(ctx.customLabel)}">
    </div>` : ''}

    <div class="form-group">
      <label class="form-label">接口协议 (Endpoint compatibility)</label>
      <select class="form-input" id="wz-api-type">
        ${apiTypes.map(t => `<option value="${t.value}" ${(isCustom ? ctx.customApi : p.api) === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
      ${!isCustom ? `<div class="form-hint">该服务商默认使用 ${_apiTypeBadge(p.api)}</div>` : ''}
    </div>

    <div class="form-group">
      <label class="form-label">API Base URL</label>
      <input class="form-input" id="wz-base-url" value="${_esc(ctx.customUrl || p.baseUrl || '')}" placeholder="https://...">
      <div class="form-hint">${isCustom ? '填写服务商提供的 API 端点地址（如 Ollama: http://127.0.0.1:11434/v1）' : '通常无需修改，使用中转站时替换为中转地址'}</div>
    </div>

    <div class="form-group">
      <label class="form-label">API 密钥提供方式</label>
      <select class="form-input" id="wz-key-mode">
        ${keyModes.map(m => `<option value="${m.value}" ${curKeyMode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
      </select>
    </div>

    <div id="wz-key-field">
      ${_renderKeyField(curKeyMode, ctx, keyLink)}
    </div>

    ${isCustom ? `
    <div class="form-group" style="margin-top:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--border-primary)">
      <label class="form-label">Model ID <span style="color:var(--text-tertiary);font-weight:400;font-size:var(--font-size-xs)">至少添加一个</span></label>
      <div style="display:flex;gap:6px;margin-bottom:6px">
        <input class="form-input" id="wz-model-id-input" placeholder="例：llama3.2 或 gpt-4o-mini" style="flex:1">
        <button class="btn btn-secondary btn-sm" id="wz-model-id-add" type="button" style="white-space:nowrap">＋ 添加</button>
      </div>
      <div id="wz-model-id-list" style="display:flex;flex-wrap:wrap;gap:6px;min-height:28px">
        ${(ctx.customModelIds || []).map(id => _modelTagHtml(id)).join('')}
      </div>
      <div class="form-hint">输入模型 ID 后点击「添加」，可添加多个</div>
    </div>` : ''}

    <div class="modal-actions">
      <button class="btn btn-secondary btn-sm" data-wz="back">← 上一步</button>
      <button class="btn btn-primary btn-sm" data-wz="next">下一步 →</button>
    </div>
  `

  // 密钥模式切换
  modal.querySelector('#wz-key-mode').addEventListener('change', e => {
    modal.querySelector('#wz-key-field').innerHTML = _renderKeyField(e.target.value, ctx, keyLink)
  })

  // 自定义 Model ID 添加/删除
  if (isCustom) {
    const modelInput = modal.querySelector('#wz-model-id-input')
    const modelList  = modal.querySelector('#wz-model-id-list')

    const addModelId = () => {
      const id = modelInput.value.trim()
      if (!id) return
      if (ctx.customModelIds.includes(id)) { toast('该 Model ID 已添加', 'warning'); return }
      ctx.customModelIds.push(id)
      modelList.insertAdjacentHTML('beforeend', _modelTagHtml(id))
      modelInput.value = ''
      modelInput.focus()
    }

    modal.querySelector('#wz-model-id-add').onclick = addModelId
    modelInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addModelId() } })

    modelList.addEventListener('click', e => {
      const rmBtn = e.target.closest('.wz-model-tag-rm')
      if (!rmBtn) return
      const id = rmBtn.dataset.id
      ctx.customModelIds = ctx.customModelIds.filter(m => m !== id)
      rmBtn.closest('.wz-model-tag')?.remove()
    })
  }

  modal.querySelector('[data-wz="back"]').onclick = () => { ctx.step = 1; renderStep(ctx) }

  modal.querySelector('[data-wz="next"]').onclick = () => {
    const url     = modal.querySelector('#wz-base-url').value.trim()
    const apiType = modal.querySelector('#wz-api-type').value
    const keyMode = modal.querySelector('#wz-key-mode').value

    if (!url) { toast('请填写接口地址', 'warning'); return }

    if (isCustom && ctx.customModelIds.length === 0) {
      toast('请至少添加一个 Model ID', 'warning'); return
    }

    ctx.customUrl = url
    ctx.customApi = apiType
    ctx.customKeyMode = keyMode

    if (keyMode === 'paste') {
      ctx.customKey = modal.querySelector('#wz-api-key')?.value.trim() || ''
    } else if (keyMode === 'env') {
      ctx.customKeyEnvVar = modal.querySelector('#wz-env-var')?.value.trim() || ''
      ctx.customKey = ctx.customKeyEnvVar ? `\${${ctx.customKeyEnvVar}}` : ''
    } else {
      ctx.customKey = ''
    }

    if (isCustom) {
      ctx.customLabel = modal.querySelector('#wz-provider-name')?.value.trim() || '自定义服务商'
      ctx.preset = { ...ctx.preset, label: ctx.customLabel, api: apiType, baseUrl: url }
    }

    ctx.step = 3
    renderStep(ctx)
  }
}

function _renderKeyField(mode, ctx, keyLink) {
  if (mode === 'paste') {
    return `
      <div class="form-group">
        <label class="form-label" style="display:flex;justify-content:space-between">
          <span>API Key</span>
          ${keyLink ? `<a href="${keyLink}" target="_blank" style="font-size:var(--font-size-xs);color:var(--primary)">前往获取 →</a>` : ''}
        </label>
        <input class="form-input" id="wz-api-key" type="password" placeholder="sk-..." value="${_esc(ctx.customKey || '')}">
        <div class="form-hint">密钥不会上传，仅本地存储</div>
      </div>`
  }
  if (mode === 'env') {
    const envVar = ctx.customKeyEnvVar || (ctx.customKey?.replace(/^\$\{|\}$/g, '') || '')
    return `
      <div class="form-group">
        <label class="form-label">环境变量名</label>
        <input class="form-input" id="wz-env-var" placeholder="OPENAI_API_KEY" value="${_esc(envVar)}">
        <div class="form-hint">OpenClaw 将在运行时从该环境变量读取密钥（存储为 <code>\${变量名}</code>）</div>
      </div>`
  }
  // skip
  return `<div class="form-hint" style="padding:6px 0;color:var(--text-tertiary)">无需 API 密钥（适用于本地模型如 Ollama）</div>`
}

function _modelTagHtml(id) {
  return `
    <span class="wz-model-tag" style="
      display:inline-flex;align-items:center;gap:4px;
      padding:3px 8px;border-radius:var(--radius-sm);
      background:var(--accent-muted,rgba(99,102,241,0.1));
      border:1px solid var(--primary,#6366f1);
      font-size:var(--font-size-xs);font-family:var(--font-mono);color:var(--primary,#6366f1)
    ">
      ${_esc(id)}
      <button class="wz-model-tag-rm" data-id="${_esc(id)}" type="button" style="
        background:none;border:none;cursor:pointer;padding:0;line-height:1;
        color:inherit;opacity:0.6;font-size:12px
      ">✕</button>
    </span>`
}

// ─── 步骤 3：勾选模型 ──────────────────────────────────────────────────────

function renderStep3(ctx, modal) {
  const p = ctx.preset
  const isCustom = p.key === '__custom__'

  // 自定义服务商：从 ctx.customModelIds 构造列表
  const presets = isCustom
    ? ctx.customModelIds.map(id => ({ id, name: id }))
    : (MODEL_PRESETS[p.key] || [])

  // 默认全选（非自定义：选前3；自定义：全选）
  if (!ctx.selectedModels.length && presets.length) {
    ctx.selectedModels = isCustom
      ? presets.map(m => m.id)
      : presets.slice(0, Math.min(3, presets.length)).map(m => m.id)
  }

  const listHtml = presets.length
    ? presets.map(m => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border-primary)">
          <input type="checkbox" class="wz-model-cb" data-id="${_esc(m.id)}" ${ctx.selectedModels.includes(m.id) ? 'checked' : ''}>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--font-mono);font-size:var(--font-size-sm)">${_esc(m.id)}</div>
            ${!isCustom && m.name !== m.id ? `
            <div style="font-size:var(--font-size-xs);color:var(--text-tertiary)">
              ${m.name}${m.contextWindow ? ' · ' + (m.contextWindow / 1000) + 'K' : ''}${m.reasoning ? ' · <span style="color:var(--accent)">推理</span>' : ''}
            </div>` : ''}
          </div>
        </label>
      `).join('')
    : `<div style="color:var(--text-tertiary);padding:16px;text-align:center">暂无可选模型</div>`

  modal.innerHTML = `
    <div class="modal-title">配置向导 <span style="font-size:var(--font-size-xs);color:var(--text-tertiary);font-weight:400">第 3 步 / 共 3 步</span></div>
    <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-sm)">
      ${isCustom ? '确认要启用的模型' : '选择要启用的模型（已默认勾选推荐项）'}
    </p>
    ${presets.length >= 2 ? `
    <div style="display:flex;gap:8px;margin-bottom:var(--space-sm)">
      <button class="btn btn-secondary btn-sm" id="wz-select-all">全选</button>
      <button class="btn btn-secondary btn-sm" id="wz-select-none">全不选</button>
    </div>` : ''}
    <div style="max-height:320px;overflow-y:auto;border:1px solid var(--border-primary);border-radius:var(--radius-md);margin-bottom:var(--space-md)">
      ${listHtml}
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary btn-sm" data-wz="back">← 上一步</button>
      <button class="btn btn-primary btn-sm" data-wz="finish">完成配置</button>
    </div>
  `

  modal.querySelector('#wz-select-all')?.addEventListener('click', () => {
    modal.querySelectorAll('.wz-model-cb').forEach(cb => { cb.checked = true })
  })
  modal.querySelector('#wz-select-none')?.addEventListener('click', () => {
    modal.querySelectorAll('.wz-model-cb').forEach(cb => { cb.checked = false })
  })

  modal.querySelector('[data-wz="back"]').onclick = () => {
    ctx.selectedModels = _getChecked(modal)
    ctx.step = 2
    renderStep(ctx)
  }

  modal.querySelector('[data-wz="finish"]').onclick = () => {
    _applyConfig(ctx, _getChecked(modal))
  }
}

function _getChecked(modal) {
  return [...modal.querySelectorAll('.wz-model-cb:checked')].map(cb => cb.dataset.id)
}

// ─── 写入配置 ─────────────────────────────────────────────────────────────

async function _applyConfig(ctx, chosenIds) {
  const { preset: p, customUrl, customKey } = ctx
  const isCustom = p.key === '__custom__'

  // 自定义服务商生成唯一 key（名称清洗 + 随机后缀防冲突）
  const providerKey = isCustom
    ? (ctx.customLabel || 'custom').toLowerCase()
        .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
        + '_' + Math.random().toString(36).slice(2, 6)
    : p.key
  const providerApi = isCustom ? (ctx.customApi || 'openai-completions') : p.api

  let cfg
  try {
    const { api } = await import('../lib/tauri-api.js')
    cfg = await api.readOpenclawConfig()
  } catch (e) {
    toast('读取配置失败: ' + e, 'error'); return
  }

  if (!cfg.models) cfg.models = { mode: 'replace', providers: {} }
  if (!cfg.models.providers) cfg.models.providers = {}

  // 构造 models 列表
  let models
  if (isCustom) {
    // 自定义：用手动输入的 model ID（仅选中的）
    models = chosenIds.map(id => ({ id, name: id, input: ['text', 'image'] }))
  } else {
    const allPresets = MODEL_PRESETS[p.key] || []
    models = chosenIds.length
      ? allPresets.filter(m => chosenIds.includes(m.id)).map(m => ({ ...m, input: ['text', 'image'] }))
      : []
  }

  const existing = cfg.models.providers[providerKey]
  if (existing) {
    const existIds = new Set((existing.models || []).map(m => typeof m === 'string' ? m : m.id))
    models.forEach(m => { if (!existIds.has(m.id)) existing.models.push(m) })
    existing.baseUrl = customUrl
    existing.apiKey  = customKey
  } else {
    cfg.models.providers[providerKey] = {
      baseUrl: customUrl,
      apiKey:  customKey,
      api:     providerApi,
      models,
    }
  }

  // 无主模型时自动设置第一个
  const primary = cfg?.agents?.defaults?.model?.primary
  if (!primary && models.length) {
    if (!cfg.agents) cfg.agents = {}
    if (!cfg.agents.defaults) cfg.agents.defaults = {}
    if (!cfg.agents.defaults.model) cfg.agents.defaults.model = {}
    cfg.agents.defaults.model.primary = `${providerKey}/${models[0].id}`
  }

  try {
    const { api } = await import('../lib/tauri-api.js')
    await api.writeOpenclawConfig(cfg)
    try { await api.restartGateway() } catch {}
  } catch (e) {
    toast('保存配置失败: ' + e, 'error'); return
  }

  ctx.overlay.remove()
  toast(`已添加 ${p.label}（${models.length} 个模型）`, 'success')
  ctx.onDone?.(true)
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
