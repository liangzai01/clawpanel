/**
 * 记忆文件管理页面
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showModal } from '../components/modal.js'

const CATEGORIES = [
  { key: 'memory', label: '工作记忆' },
  { key: 'archive', label: '记忆归档' },
  { key: 'core', label: '核心文件' },
]

export async function render() {
  const page = document.createElement('div')
  page.className = 'page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">记忆文件</h1>
      <p class="page-desc">管理 OpenClaw 工作记忆和归档文件</p>
    </div>
    <div class="tab-bar">
      ${CATEGORIES.map((c, i) => `<div class="tab${i === 0 ? ' active' : ''}" data-tab="${c.key}">${c.label}</div>`).join('')}
    </div>
    <div class="memory-layout">
      <div class="memory-sidebar">
        <div style="padding:0 var(--space-sm) var(--space-sm);display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" id="btn-new-file" style="flex:1">+ 新建</button>
          <button class="btn btn-sm btn-danger" id="btn-del-file" disabled style="flex:1">删除</button>
        </div>
        <div id="file-tree">加载中...</div>
      </div>
      <div class="memory-editor">
        <div class="editor-toolbar">
          <span id="current-file" style="font-size:var(--font-size-sm);color:var(--text-tertiary)">选择文件查看</span>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-secondary" id="btn-preview" disabled>预览</button>
            <button class="btn btn-sm btn-primary" id="btn-save-file" disabled>保存</button>
          </div>
        </div>
        <textarea class="editor-area" id="file-editor" placeholder="选择左侧文件进行编辑..." disabled></textarea>
      </div>
    </div>
  `

  const state = { category: 'memory', currentPath: null }

  // Tab 切换
  page.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      page.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      state.category = tab.dataset.tab
      state.currentPath = null
      resetEditor(page)
      loadFiles(page, state)
    }
  })

  // 保存
  page.querySelector('#btn-save-file').onclick = () => saveFile(page, state)

  // 预览（简易 Markdown 渲染）
  page.querySelector('#btn-preview').onclick = () => togglePreview(page, state)

  // 新建文件
  page.querySelector('#btn-new-file').onclick = () => {
    showModal({
      title: '新建记忆文件',
      fields: [{ name: 'filename', label: '文件名', placeholder: '如 notes.md' }],
      onConfirm: async ({ filename }) => {
        if (!filename) return
        try {
          await api.writeMemoryFile(filename, `# ${filename}\n\n`)
          toast(`已创建 ${filename}`, 'success')
          loadFiles(page, state)
        } catch (e) {
          toast('创建失败: ' + e, 'error')
        }
      },
    })
  }

  // 删除文件
  page.querySelector('#btn-del-file').onclick = async () => {
    if (!state.currentPath) return
    const name = state.currentPath.split('/').pop()
    if (!confirm(`确定删除 ${name}？`)) return
    try {
      await api.deleteMemoryFile(state.currentPath)
      toast(`已删除 ${name}`, 'success')
      state.currentPath = null
      resetEditor(page)
      loadFiles(page, state)
    } catch (e) {
      toast('删除失败: ' + e, 'error')
    }
  }

  loadFiles(page, state)
  return page
}

async function loadFiles(page, state) {
  const tree = page.querySelector('#file-tree')
  tree.innerHTML = '<div style="color:var(--text-tertiary);padding:12px">加载中...</div>'

  try {
    const files = await api.listMemoryFiles(state.category)
    if (!files || !files.length) {
      tree.innerHTML = '<div style="color:var(--text-tertiary);padding:12px">暂无文件</div>'
      return
    }
    renderFileTree(page, state, files)
  } catch (e) {
    toast('加载文件列表失败: ' + e, 'error')
  }
}

function renderFileTree(page, state, files) {
  const tree = page.querySelector('#file-tree')
  tree.innerHTML = files.map(f => {
    const name = f.split('/').pop()
    const active = state.currentPath === f ? ' active' : ''
    return `<div class="file-item${active}" data-path="${f}">${name}</div>`
  }).join('')

  tree.querySelectorAll('.file-item').forEach(item => {
    item.onclick = () => {
      state.currentPath = item.dataset.path
      tree.querySelectorAll('.file-item').forEach(i => i.classList.remove('active'))
      item.classList.add('active')
      loadFileContent(page, state)
    }
  })
}

async function loadFileContent(page, state) {
  const editor = page.querySelector('#file-editor')
  const label = page.querySelector('#current-file')
  const btnSave = page.querySelector('#btn-save-file')
  const btnPreview = page.querySelector('#btn-preview')
  const btnDel = page.querySelector('#btn-del-file')

  editor.disabled = true
  editor.value = '加载中...'
  label.textContent = state.currentPath

  // 退出预览模式
  editor.style.display = ''
  const previewEl = page.querySelector('#md-preview')
  if (previewEl) previewEl.remove()
  btnPreview.textContent = '预览'

  try {
    const content = await api.readMemoryFile(state.currentPath)
    editor.value = content || ''
    editor.disabled = false
    btnSave.disabled = false
    btnPreview.disabled = false
    btnDel.disabled = false
  } catch (e) {
    editor.value = '读取失败: ' + e
    toast('读取文件失败: ' + e, 'error')
  }
}

function resetEditor(page) {
  const editor = page.querySelector('#file-editor')
  editor.value = ''
  editor.disabled = true
  editor.style.display = ''
  const previewEl = page.querySelector('#md-preview')
  if (previewEl) previewEl.remove()
  page.querySelector('#current-file').textContent = '选择文件查看'
  page.querySelector('#btn-save-file').disabled = true
  page.querySelector('#btn-preview').disabled = true
  page.querySelector('#btn-preview').textContent = '预览'
  page.querySelector('#btn-del-file').disabled = true
}

async function saveFile(page, state) {
  if (!state.currentPath) return
  const content = page.querySelector('#file-editor').value
  try {
    await api.writeMemoryFile(state.currentPath, content)
    toast('文件已保存', 'success')
  } catch (e) {
    toast('保存失败: ' + e, 'error')
  }
}

function togglePreview(page) {
  const editor = page.querySelector('#file-editor')
  const btn = page.querySelector('#btn-preview')
  let previewEl = page.querySelector('#md-preview')

  if (previewEl) {
    // 退出预览
    previewEl.remove()
    editor.style.display = ''
    btn.textContent = '预览'
  } else {
    // 进入预览
    const md = editor.value
    previewEl = document.createElement('div')
    previewEl.id = 'md-preview'
    previewEl.style.cssText = 'flex:1;padding:var(--space-lg);overflow-y:auto;line-height:1.8;color:var(--text-primary)'
    previewEl.innerHTML = renderMarkdown(md)
    editor.style.display = 'none'
    editor.parentElement.appendChild(previewEl)
    btn.textContent = '编辑'
  }
}

// 简易 Markdown 渲染
function renderMarkdown(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:var(--font-size-lg);font-weight:600;margin:16px 0 8px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:var(--font-size-xl);font-weight:600;margin:20px 0 8px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:var(--font-size-2xl);font-weight:700;margin:24px 0 12px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:var(--font-size-xs)">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="margin-left:20px">$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}
