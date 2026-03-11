# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ClawPanel 是 OpenClaw AI Agent 框架的可视化管理面板。支持两种运行模式：
- **Tauri 桌面应用**：Rust 后端 + Vite 前端，跨平台（macOS/Windows/Linux）
- **Headless Web 服务器**：纯 Node.js，无需 GUI，适用于 Linux 服务器/Docker

## 开发命令

### 前置条件
- Node.js >= 18，Rust stable，Tauri v2 系统依赖

### 开发模式
```bash
# 启动完整 Tauri 桌面应用（macOS/Linux）
./scripts/dev.sh

# 仅启动 Vite 前端（浏览器调试，有 mock 数据回退）
./scripts/dev.sh web
# 等价于：
npm run dev

# Windows
npm run tauri dev
```

### 构建
```bash
# 检查 Rust 编译（最快，无产物）
./scripts/build.sh check
# 等价于：cd src-tauri && cargo check

# Debug 构建
./scripts/build.sh

# 正式发布版本（含安装包）
./scripts/build.sh release
# 等价于：npm run tauri build

# 产物位置：src-tauri/target/release/bundle/
```

### Web 服务器模式
```bash
npm run build       # 先构建前端
npm run serve       # 启动 headless 服务器（默认 0.0.0.0:1420）
npm run serve -- --port 8080 --host 127.0.0.1
```

### 版本同步
```bash
npm run version:sync   # 同步 package.json 与 Cargo.toml 版本号
```

## 架构设计

### 层级总览

```
前端 (src/)          ← Vanilla JS + Vite，零框架
  ↕ Tauri IPC / /__api/ HTTP
后端 (src-tauri/)    ← Rust + Tauri v2
  ↕ WebSocket ws://127.0.0.1:18789
OpenClaw Gateway     ← 外部进程（被管理对象）
```

### 前端架构 (`src/`)

**入口与路由**
- `main.js`：引导序列（认证检查 → 路由注册 → 渲染侧边栏 → 检测 OpenClaw 状态 → 自动连接 WebSocket）
- `router.js`：极简 hash 路由，页面模块懒加载并缓存，支持竞态防护和网络重试

**页面模块约定**（`src/pages/*.js`）
- 每个页面导出 `render()` 函数，返回 `HTMLElement | string`
- 可选导出 `cleanup()` 函数，路由离开时由 router 调用
- 页面包括：dashboard、chat、services、models、agents、gateway、logs、memory、extensions、skills、security、about、setup、docker

**核心库**（`src/lib/`）
- `tauri-api.js`：**唯一 API 抽象层**，统一处理三种调用路径：
  1. Tauri 环境 → `invoke()` 调用 Rust 命令
  2. Web 模式 → `fetch('/__api/{cmd}')` 调用 Node.js 后端
  3. 浏览器开发 → 回退 mock 数据（仅读操作，`NO_MOCK_CMDS` 中的写操作直接报错）
  - `WEB_ONLY_CMDS`：Docker/实例管理命令，仅由 Node.js 处理，Tauri 不实现
  - 内置 15s 缓存（`cachedInvoke`），写操作通过 `invalidate()` 清缓存
- `app-state.js`：全局状态（OpenClaw 安装状态、Gateway 运行状态、活跃实例），含 Gateway 守护逻辑（意外停止后最多自动重启 3 次）
- `ws-client.js`：WebSocket 客户端，实现 Ed25519 握手协议：
  收到 `connect.challenge` → 调用 Rust `create_connect_frame` 生成签名 → Gateway 验证 → 返回 snapshot
- `theme.js`：暗色/亮色主题切换（CSS Variables）
- `message-db.js`：聊天消息本地缓存（IndexedDB）

**样式**：纯 CSS + CSS Variables，无预处理器

### Rust 后端架构 (`src-tauri/src/`)

**命令模块**（`src/commands/`，按领域划分）
- `config.rs`：配置读写、版本检测、安装/升级/卸载 OpenClaw、Gateway 管理、模型测试
- `service.rs`：服务启停控制
- `agent.rs`：Agent CRUD
- `memory.rs`：记忆文件管理（读/写/删/ZIP 导出）
- `logs.rs`：日志读取与搜索
- `extensions.rs`：cftunnel、ClawApp 管理
- `skills.rs`：openclaw skills CLI 封装
- `device.rs`：设备密钥（Ed25519）生成与 connect frame 签名
- `pairing.rs`：设备配对（allowedOrigins 写入）
- `update.rs`：前端热更新（下载到 `~/.openclaw/clawpanel/web-update/`，`lib.rs` 中 URI 协议优先加载）

**URI 协议**：`lib.rs` 注册 `tauri://` 协议，优先从热更新目录提供文件，回退内嵌资源

**配置文件路径**（均在 `~/.openclaw/`）
- `openclaw.json`：OpenClaw 主配置（模型、Gateway、Agent 等）
- `clawpanel.json`：面板自身配置（访问密码、主题等）
- `mcp.json`：MCP 服务器配置
- `logs/`：日志目录
- `backups/`：配置备份
- `clawpanel/web-update/`：热更新文件

### Web 服务器模式 (`scripts/`)

- `dev-api.js`：Vite 插件，在开发服务器上注册 `/__api/*` 路由，提供真实 Node.js 后端实现。同时被 `serve.js` 复用
- `serve.js`：生产级 Node.js HTTP 服务器，serve `dist/` 静态文件 + API 处理，适用于 Linux/Docker 无桌面部署

### Gateway WebSocket 协议

```
客户端连接 ws://host/ws?token=xxx
  ↓ Gateway 发 connect.challenge { nonce }
  ↓ 客户端调用 Rust create_connect_frame(nonce, token) → Ed25519 签名 frame
  ↓ Gateway 验证 → 返回 connect res { snapshot, sessionKey }
  ↓ 开始 chat.send / chat.history / sessions.* RPC 通信
```

## 关键约定

- **API 调用**：始终通过 `src/lib/tauri-api.js` 中的 `api` 对象，不直接 `invoke` 或 `fetch`
- **新增 Tauri 命令**：在 `src-tauri/src/commands/` 对应文件添加 `#[tauri::command]`，在 `lib.rs` 的 `invoke_handler!` 中注册，在 `tauri-api.js` 的 `api` 对象和 mock 中补充
- **Docker/实例命令**：加入 `WEB_ONLY_CMDS` 集合，仅在 `dev-api.js` 中实现
- **写操作**：加入 `NO_MOCK_CMDS` 集合，防止 mock 假成功
- **页面导航**：使用 `navigate('/path')` 而非直接操作 `location.hash`
