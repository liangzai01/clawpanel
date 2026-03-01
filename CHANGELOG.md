# 更新日志

本项目的所有重要变更都将记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-03-01

首个公开发布版本，包含 OpenClaw 管理面板的全部核心功能。

### 新增 (Features)

- **仪表盘** — 6 张状态卡片（Gateway、版本、Agent 舰队、模型池、隧道、基础服务）+ 系统概览面板 + 最近日志 + 快捷操作
- **服务管理** — OpenClaw 服务启停控制、版本检测与一键升级（支持官方/汉化源切换）、Gateway 安装/卸载、npm 源配置（淘宝/官方/华为云）、配置备份管理（创建/恢复/删除）
- **模型配置** — 多服务商管理（支持 OpenAI/Anthropic/DeepSeek/Google 预设）、模型增删改查、主模型与 Fallback 选择、批量连通性测试与延迟检测、拖拽排序、自动保存 + 撤销栈（最多 20 步）
- **网关配置** — 端口配置、运行模式（本地/云端）、访问权限（本机/局域网）、认证 Token、Tailscale 组网选项，保存后自动重载 Gateway
- **Agent 管理** — Agent 增删改查、身份编辑（名称/Emoji）、模型配置、工作区管理、Agent 备份
- **聊天** — 流式响应、Markdown 渲染、会话管理、Agent 选择、快捷指令、WebSocket 连接
- **日志查看** — 多日志源（Gateway/守护进程/审计日志）实时查看、关键词搜索、自动滚动
- **记忆管理** — 记忆文件查看/编辑、分类管理（工作记忆/归档/核心文件）、ZIP 导出、Agent 切换
- **扩展工具** — cftunnel 内网穿透隧道管理（启停/日志/路由查看）、ClawApp 守护进程状态监控、一键安装
- **关于页面** — 版本信息、社群二维码（QQ/微信）、相关项目链接、一键升级入口
- **主题切换** — 暗色/亮色主题，CSS Variables 驱动
- **自定义 Modal** — 全局替换浏览器原生弹窗（alert/confirm/prompt），兼容 Tauri WebView
- **CI/CD** — GitHub Actions 持续集成 + 全平台发布构建（macOS ARM64/Intel、Windows x64、Linux x64）
- **手动发布** — 支持 workflow_dispatch 手动触发构建，填入版本号即可一键发布

### 技术亮点

- 零框架依赖：纯 Vanilla JS，无 React/Vue 等框架
- Tauri v2 + Rust 后端，原生性能
- 玻璃拟态暗色主题，现代化 UI
- 全中文界面与代码注释
