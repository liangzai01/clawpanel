/**
 * OpenClaw 模型预设库
 *
 * 模型对象字段（与 OpenClaw openclaw.json 保持一致）：
 *   id            string    模型标识符，必须与服务商 API 一致（必填）
 *   name          string    显示名称（选填，默认等于 id）
 *   contextWindow number    最大上下文 Token 数（选填）
 *   reasoning     boolean   是否为推理模型，true 时使用特殊调用方式（选填）
 *   input         string[]  支持的输入模态，如 ['text','image']（选填）
 *
 * 服务商预设字段：
 *   key      string   服务商键名（对应 openclaw.json models.providers 的 key）
 *   label    string   显示名称
 *   baseUrl  string   API 地址（自托管类为参考地址）
 *   api      string   接口协议：openai-completions | anthropic-messages |
 *                               openai-responses | google-gemini
 *   keyUrl   string   获取 API 密钥的网页（选填）
 *   category string   分类：intl | cn | agg | self
 *   selfHost boolean  是否需要自托管部署（选填）
 */

// ─── 服务商分类标签 ────────────────────────────────────────────────────────

export const PROVIDER_CATEGORIES = [
  { key: 'intl',  label: '国际主流' },
  { key: 'cn',    label: '国内主流' },
  { key: 'agg',   label: '聚合 / 代理' },
  { key: 'self',  label: '自托管' },
]

// ─── 全部服务商预设 ────────────────────────────────────────────────────────

export const PROVIDER_PRESETS = [

  // ── 国际主流 ─────────────────────────────────────────────────────────────
  {
    key: 'openai', label: 'OpenAI', category: 'intl',
    baseUrl: 'https://api.openai.com/v1', api: 'openai-completions',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    key: 'anthropic', label: 'Anthropic', category: 'intl',
    baseUrl: 'https://api.anthropic.com', api: 'anthropic-messages',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    key: 'google', label: 'Google Gemini', category: 'intl',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', api: 'google-gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    key: 'xai', label: 'xAI (Grok)', category: 'intl',
    baseUrl: 'https://api.x.ai/v1', api: 'openai-completions',
    keyUrl: 'https://console.x.ai/',
  },
  {
    key: 'mistral', label: 'Mistral AI', category: 'intl',
    baseUrl: 'https://api.mistral.ai/v1', api: 'openai-completions',
    keyUrl: 'https://console.mistral.ai/api-keys/',
  },
  {
    key: 'groq', label: 'Groq', category: 'intl',
    baseUrl: 'https://api.groq.com/openai/v1', api: 'openai-completions',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    key: 'together', label: 'Together AI', category: 'intl',
    baseUrl: 'https://api.together.xyz/v1', api: 'openai-completions',
    keyUrl: 'https://api.together.ai/settings/api-keys',
  },
  {
    key: 'huggingface', label: 'Hugging Face', category: 'intl',
    baseUrl: 'https://router.huggingface.co/v1', api: 'openai-completions',
    keyUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    key: 'venice', label: 'Venice AI', category: 'intl',
    baseUrl: 'https://api.venice.ai/api/v1', api: 'openai-completions',
    keyUrl: 'https://venice.ai/settings/api',
  },
  {
    key: 'chutes', label: 'Chutes', category: 'intl',
    baseUrl: 'https://llm.chutes.ai/v1', api: 'openai-completions',
    keyUrl: 'https://chutes.ai/app/token',
  },
  {
    key: 'synthetic', label: 'Synthetic', category: 'intl',
    baseUrl: 'https://api.synthetic.new/v1', api: 'openai-completions',
    keyUrl: 'https://synthetic.new',
  },
  {
    key: 'byteplus', label: 'BytePlus', category: 'intl',
    baseUrl: 'https://api.byteplus.com/api/v3', api: 'openai-completions',
    keyUrl: 'https://console.byteplus.com/ark/region:ark+cn-beijing/apiKey',
  },

  // ── 国内主流 ─────────────────────────────────────────────────────────────
  {
    key: 'deepseek', label: 'DeepSeek', category: 'cn',
    baseUrl: 'https://api.deepseek.com/v1', api: 'openai-completions',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    key: 'dashscope', label: '阿里云百炼 (Qwen)', category: 'cn',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', api: 'openai-completions',
    keyUrl: 'https://bailian.console.aliyun.com/',
  },
  {
    key: 'siliconflow', label: '硅基流动', category: 'cn',
    baseUrl: 'https://api.siliconflow.cn/v1', api: 'openai-completions',
    keyUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
  {
    key: 'moonshot', label: 'Moonshot AI (Kimi)', category: 'cn',
    baseUrl: 'https://api.moonshot.cn/v1', api: 'openai-completions',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    key: 'minimax', label: 'MiniMax', category: 'cn',
    baseUrl: 'https://api.minimax.chat/v1', api: 'openai-completions',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
  {
    key: 'volcengine', label: '火山引擎 (Doubao)', category: 'cn',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', api: 'openai-completions',
    keyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  },
  {
    key: 'qianfan', label: '百度千帆', category: 'cn',
    baseUrl: 'https://qianfan.baidubce.com/v2', api: 'openai-completions',
    keyUrl: 'https://console.bce.baidu.com/qianfan/ais/console/applicationConsole/application',
  },
  {
    key: 'xiaomi', label: '小米 MiMo', category: 'cn',
    baseUrl: 'https://api.xiaomimimo.com/anthropic', api: 'anthropic-messages',
    keyUrl: 'https://platform.xiaomi.com/mimo',
  },
  {
    key: 'shengsuan', label: '胜算云', category: 'cn',
    baseUrl: 'https://api.shengsuanyun.com/v1', api: 'openai-completions',
    keyUrl: 'https://www.shengsuanyun.com',
  },

  // ── 聚合 / 代理 ──────────────────────────────────────────────────────────
  {
    key: 'openrouter', label: 'OpenRouter', category: 'agg',
    baseUrl: 'https://openrouter.ai/api/v1', api: 'openai-completions',
    keyUrl: 'https://openrouter.ai/settings/keys',
  },
  {
    key: 'cloudflare', label: 'Cloudflare AI Gateway', category: 'agg',
    baseUrl: 'https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/openai', api: 'openai-completions',
    keyUrl: 'https://dash.cloudflare.com/',
  },
  {
    key: 'vercel', label: 'Vercel AI Gateway', category: 'agg',
    baseUrl: 'https://gateway.ai.vercel.com/v1', api: 'openai-completions',
    keyUrl: 'https://vercel.com/account/settings',
  },
  {
    key: 'kilocode', label: 'Kilo Gateway', category: 'agg',
    baseUrl: 'https://api.kilocode.ai/v1', api: 'openai-completions',
    keyUrl: 'https://kilocode.ai',
  },
  {
    key: 'zai', label: 'Z.AI', category: 'agg',
    baseUrl: 'https://api.z.ai/api/openai/v1', api: 'openai-completions',
    keyUrl: 'https://z.ai',
  },
  {
    key: 'copilot', label: 'GitHub Copilot', category: 'agg',
    baseUrl: 'https://api.githubcopilot.com', api: 'openai-completions',
    keyUrl: 'https://github.com/settings/tokens',
  },
  {
    key: 'opencodezen', label: 'OpenCode Zen', category: 'agg',
    baseUrl: 'https://gateway.opencode.ai/v1', api: 'openai-completions',
    keyUrl: 'https://opencode.ai',
  },

  // ── 自托管 ───────────────────────────────────────────────────────────────
  {
    key: 'vllm', label: 'vLLM (自托管)', category: 'self', selfHost: true,
    baseUrl: 'http://localhost:8000/v1', api: 'openai-completions',
  },
  {
    key: 'litellm', label: 'LiteLLM (代理)', category: 'self', selfHost: true,
    baseUrl: 'http://localhost:4000/v1', api: 'openai-completions',
    keyUrl: 'https://docs.litellm.ai/docs/proxy/quick_start',
  },
]

// ─── 模型预设（按服务商分组） ──────────────────────────────────────────────

export const MODEL_PRESETS = {

  // ── OpenAI ──────────────────────────────────────────────────────────────
  openai: [
    { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', contextWindow: 400000, reasoning: true, input: ['text', 'image'] },
    { id: 'gpt-4.1',      name: 'GPT-4.1',      contextWindow: 1047576, input: ['text', 'image'] },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', contextWindow: 1047576, input: ['text', 'image'] },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', contextWindow: 1047576, input: ['text', 'image'] },
    { id: 'gpt-4o',       name: 'GPT-4o',        contextWindow: 128000,  input: ['text', 'image'] },
    { id: 'gpt-4o-mini',  name: 'GPT-4o Mini',   contextWindow: 128000,  input: ['text', 'image'] },
    { id: 'o3',           name: 'o3',            contextWindow: 200000,  reasoning: true, input: ['text', 'image'] },
    { id: 'o3-mini',      name: 'o3 Mini',       contextWindow: 200000,  reasoning: true, input: ['text'] },
    { id: 'o4-mini',      name: 'o4 Mini',       contextWindow: 200000,  reasoning: true, input: ['text', 'image'] },
    { id: 'o1',           name: 'o1',            contextWindow: 200000,  reasoning: true, input: ['text', 'image'] },
    { id: 'o1-mini',      name: 'o1 Mini',       contextWindow: 128000,  reasoning: true, input: ['text'] },
  ],

  // ── Anthropic ───────────────────────────────────────────────────────────
  anthropic: [
    { id: 'claude-opus-4-6',   name: 'Claude Opus 4.6',   contextWindow: 200000, input: ['text', 'image'] },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000, input: ['text', 'image'] },
    { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',  contextWindow: 200000, input: ['text', 'image'] },
    { id: 'claude-haiku-3-5',  name: 'Claude Haiku 3.5',  contextWindow: 200000, input: ['text', 'image'] },
    { id: 'claude-sonnet-3-7', name: 'Claude Sonnet 3.7', contextWindow: 200000, reasoning: true, input: ['text', 'image'] },
  ],

  // ── Google Gemini ────────────────────────────────────────────────────────
  google: [
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview', contextWindow: 1000000, reasoning: true, input: ['text', 'image'] },
    { id: 'gemini-2.5-pro',    name: 'Gemini 2.5 Pro',    contextWindow: 1000000, reasoning: true, input: ['text', 'image'] },
    { id: 'gemini-2.5-flash',  name: 'Gemini 2.5 Flash',  contextWindow: 1000000, input: ['text', 'image'] },
    { id: 'gemini-2.0-flash',  name: 'Gemini 2.0 Flash',  contextWindow: 1000000, input: ['text', 'image'] },
    { id: 'gemini-1.5-pro',    name: 'Gemini 1.5 Pro',    contextWindow: 2000000, input: ['text', 'image'] },
    { id: 'gemini-1.5-flash',  name: 'Gemini 1.5 Flash',  contextWindow: 1000000, input: ['text', 'image'] },
  ],

  // ── xAI Grok ────────────────────────────────────────────────────────────
  xai: [
    { id: 'grok-3',             name: 'Grok 3',             contextWindow: 131072, input: ['text', 'image'] },
    { id: 'grok-3-mini',        name: 'Grok 3 Mini',        contextWindow: 131072, reasoning: true, input: ['text'] },
    { id: 'grok-2-1212',        name: 'Grok 2',             contextWindow: 131072, input: ['text', 'image'] },
    { id: 'grok-2-vision-1212', name: 'Grok 2 Vision',      contextWindow: 32768,  input: ['text', 'image'] },
  ],

  // ── Mistral AI ───────────────────────────────────────────────────────────
  mistral: [
    { id: 'mistral-large-latest',  name: 'Mistral Large',   contextWindow: 131072, input: ['text', 'image'] },
    { id: 'mistral-small-latest',  name: 'Mistral Small',   contextWindow: 131072, input: ['text', 'image'] },
    { id: 'codestral-latest',       name: 'Codestral',       contextWindow: 256000, input: ['text'] },
    { id: 'pixtral-large-latest',  name: 'Pixtral Large',   contextWindow: 131072, input: ['text', 'image'] },
    { id: 'magistral-medium-2506', name: 'Magistral Medium', contextWindow: 131072, reasoning: true, input: ['text'] },
    { id: 'magistral-small-2506',  name: 'Magistral Small',  contextWindow: 131072, reasoning: true, input: ['text'] },
  ],

  // ── Groq ────────────────────────────────────────────────────────────────
  groq: [
    { id: 'llama-3.3-70b-versatile',            name: 'Llama 3.3 70B',          contextWindow: 128000, input: ['text'] },
    { id: 'llama-3.1-8b-instant',               name: 'Llama 3.1 8B Instant',   contextWindow: 128000, input: ['text'] },
    { id: 'llama-4-scout-17b-16e-instruct',     name: 'Llama 4 Scout 17B',      contextWindow: 131072, input: ['text', 'image'] },
    { id: 'llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick 17B',   contextWindow: 131072, input: ['text', 'image'] },
    { id: 'deepseek-r1-distill-llama-70b',      name: 'DeepSeek R1 Distill 70B', contextWindow: 128000, reasoning: true, input: ['text'] },
    { id: 'mixtral-8x7b-32768',                 name: 'Mixtral 8x7B',           contextWindow: 32768,  input: ['text'] },
    { id: 'gemma2-9b-it',                       name: 'Gemma2 9B',              contextWindow: 8192,   input: ['text'] },
  ],

  // ── Together AI ─────────────────────────────────────────────────────────
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',          name: 'Llama 3.3 70B Turbo',    contextWindow: 131072, input: ['text'] },
    { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',   name: 'Llama 3.2 11B Vision',   contextWindow: 131072, input: ['text', 'image'] },
    { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',      name: 'Llama 3.1 8B Turbo',     contextWindow: 131072, input: ['text'] },
    { id: 'deepseek-ai/DeepSeek-R1',                           name: 'DeepSeek R1',             contextWindow: 64000,  reasoning: true, input: ['text'] },
    { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',                   name: 'Qwen2.5 72B Turbo',       contextWindow: 32768,  input: ['text'] },
    { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1',             name: 'Mixtral 8x22B',           contextWindow: 65536,  input: ['text'] },
  ],

  // ── Hugging Face ────────────────────────────────────────────────────────
  huggingface: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct',    name: 'Llama 3.3 70B',        contextWindow: 131072, input: ['text'] },
    { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct', name: 'Llama 3.2 11B Vision', contextWindow: 131072, input: ['text', 'image'] },
    { id: 'Qwen/Qwen2.5-72B-Instruct',            name: 'Qwen2.5 72B',           contextWindow: 131072, input: ['text'] },
    { id: 'deepseek-ai/DeepSeek-R1',              name: 'DeepSeek R1',            contextWindow: 64000,  reasoning: true, input: ['text'] },
    { id: 'microsoft/Phi-4',                       name: 'Phi-4',                 contextWindow: 16384,  input: ['text'] },
  ],

  // ── OpenRouter ──────────────────────────────────────────────────────────
  openrouter: [
    { id: 'openai/gpt-5.1-codex',                       name: 'GPT-5.1 Codex',         contextWindow: 400000,  reasoning: true, input: ['text', 'image'] },
    { id: 'anthropic/claude-opus-4.6',                  name: 'Claude Opus 4.6',       contextWindow: 200000,  input: ['text', 'image'] },
    { id: 'anthropic/claude-sonnet-4-5',                name: 'Claude Sonnet 4.5',     contextWindow: 200000,  input: ['text', 'image'] },
    { id: 'google/gemini-3-pro-preview',                name: 'Gemini 3 Pro Preview',  contextWindow: 1000000, reasoning: true, input: ['text', 'image'] },
    { id: 'google/gemini-2.5-pro',                      name: 'Gemini 2.5 Pro',        contextWindow: 1000000, reasoning: true, input: ['text', 'image'] },
    { id: 'moonshotai/kimi-k2.5',                       name: 'Kimi K2.5',             contextWindow: 131072,  input: ['text'] },
    { id: 'z-ai/glm-5',                                 name: 'GLM-5',                 contextWindow: 128000,  reasoning: true, input: ['text'] },
    { id: 'deepseek/deepseek-r1',                       name: 'DeepSeek R1',           contextWindow: 64000,   reasoning: true, input: ['text'] },
    { id: 'deepseek/deepseek-chat-v3-0324',             name: 'DeepSeek V3',           contextWindow: 64000,   input: ['text'] },
    { id: 'x-ai/grok-3',                                name: 'Grok 3',                contextWindow: 131072,  input: ['text', 'image'] },
    { id: 'qwen/qwen-2.5-72b-instruct',                 name: 'Qwen2.5 72B',           contextWindow: 131072,  input: ['text'] },
  ],

  // ── Z.AI ────────────────────────────────────────────────────────────────
  zai: [
    { id: 'glm-5',      name: 'GLM-5',      contextWindow: 128000, reasoning: true, input: ['text'] },
    { id: 'glm-4.6',    name: 'GLM-4.6',    contextWindow: 128000, input: ['text'] },
    { id: 'glm-4.5-air', name: 'GLM-4.5 Air', contextWindow: 128000, input: ['text'] },
  ],

  // ── DeepSeek ────────────────────────────────────────────────────────────
  deepseek: [
    { id: 'deepseek-chat',     name: 'DeepSeek V3',      contextWindow: 64000, input: ['text'] },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1',       contextWindow: 64000, reasoning: true, input: ['text'] },
    { id: 'deepseek-r1-0528',  name: 'DeepSeek R1 0528',  contextWindow: 64000, reasoning: true, input: ['text'] },
  ],

  // ── 阿里云百炼 (DashScope / Qwen) ────────────────────────────────────────
  dashscope: [
    { id: 'qwen-max',             name: 'Qwen Max',             contextWindow: 32768,    input: ['text', 'image'] },
    { id: 'qwen-plus',            name: 'Qwen Plus',            contextWindow: 131072,   input: ['text', 'image'] },
    { id: 'qwen-turbo',           name: 'Qwen Turbo',           contextWindow: 1000000,  input: ['text'] },
    { id: 'qwen-long',            name: 'Qwen Long',            contextWindow: 10000000, input: ['text'] },
    { id: 'qwq-plus',             name: 'QwQ Plus',             contextWindow: 131072,   reasoning: true, input: ['text'] },
    { id: 'qwen3-235b-a22b',      name: 'Qwen3 235B-A22B',      contextWindow: 131072,   reasoning: true, input: ['text'] },
    { id: 'qwen3-30b-a3b',        name: 'Qwen3 30B-A3B',        contextWindow: 131072,   reasoning: true, input: ['text'] },
    { id: 'qwen3-32b',            name: 'Qwen3 32B',            contextWindow: 131072,   reasoning: true, input: ['text'] },
    { id: 'qwen2.5-72b-instruct', name: 'Qwen2.5 72B',          contextWindow: 131072,   input: ['text'] },
    { id: 'qwen2.5-vl-72b-instruct', name: 'Qwen2.5-VL 72B',   contextWindow: 131072,   input: ['text', 'image'] },
  ],

  // ── 硅基流动 (SiliconFlow) ────────────────────────────────────────────────
  siliconflow: [
    { id: 'deepseek-ai/DeepSeek-V3',                       name: 'DeepSeek V3',          contextWindow: 64000,  input: ['text'] },
    { id: 'deepseek-ai/DeepSeek-R1',                       name: 'DeepSeek R1',           contextWindow: 64000,  reasoning: true, input: ['text'] },
    { id: 'deepseek-ai/DeepSeek-R1-0528',                  name: 'DeepSeek R1 0528',      contextWindow: 64000,  reasoning: true, input: ['text'] },
    { id: 'Qwen/Qwen3-235B-A22B',                          name: 'Qwen3 235B-A22B',       contextWindow: 131072, reasoning: true, input: ['text'] },
    { id: 'Qwen/Qwen3-30B-A3B',                            name: 'Qwen3 30B-A3B',         contextWindow: 131072, reasoning: true, input: ['text'] },
    { id: 'Qwen/Qwen2.5-72B-Instruct',                     name: 'Qwen2.5 72B',           contextWindow: 131072, input: ['text'] },
    { id: 'Qwen/Qwen2.5-VL-72B-Instruct',                  name: 'Qwen2.5-VL 72B',        contextWindow: 131072, input: ['text', 'image'] },
    { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct',        name: 'Llama 3.1 70B',         contextWindow: 131072, input: ['text'] },
    { id: 'google/gemma-2-27b-it',                          name: 'Gemma2 27B',            contextWindow: 8192,   input: ['text'] },
    { id: 'THUDM/glm-4-9b-chat',                           name: 'GLM-4 9B',              contextWindow: 131072, input: ['text'] },
  ],

  // ── Moonshot AI (Kimi) ────────────────────────────────────────────────────
  moonshot: [
    { id: 'kimi-k2.5',       name: 'Kimi K2.5',      contextWindow: 131072, input: ['text'] },
    { id: 'kimi-k2-0711-preview', name: 'Kimi K2 Preview', contextWindow: 131072, input: ['text'] },
    { id: 'moonshot-v1-8k',   name: 'Moonshot 8K',    contextWindow: 8192,   input: ['text'] },
    { id: 'moonshot-v1-32k',  name: 'Moonshot 32K',   contextWindow: 32768,  input: ['text'] },
    { id: 'moonshot-v1-128k', name: 'Moonshot 128K',  contextWindow: 131072, input: ['text'] },
  ],

  // ── MiniMax ──────────────────────────────────────────────────────────────
  minimax: [
    { id: 'MiniMax-M2.1',            name: 'MiniMax M2.1',            contextWindow: 1000000, input: ['text'] },
    { id: 'MiniMax-M2.1-lightning',  name: 'MiniMax M2.1 Lightning',  contextWindow: 1000000, input: ['text'] },
    { id: 'minimax-m2.1-gs32',       name: 'MiniMax M2.1 GS32',       contextWindow: 32768,   input: ['text'] },
    { id: 'MiniMax-Text-01',         name: 'MiniMax Text-01',         contextWindow: 1000000, input: ['text'] },
  ],

  // ── 火山引擎 (Doubao / Volcano Engine) ────────────────────────────────────
  // 注：实际 model ID 为用户自建的推理接入点 (ep-xxxxxxxx)，以下为官方命名模型
  volcengine: [
    { id: 'doubao-1.5-pro-256k', name: 'Doubao 1.5 Pro 256K', contextWindow: 262144, input: ['text', 'image'] },
    { id: 'doubao-1.5-pro-32k',  name: 'Doubao 1.5 Pro 32K',  contextWindow: 32768,  input: ['text', 'image'] },
    { id: 'doubao-1.5-lite-32k', name: 'Doubao 1.5 Lite 32K', contextWindow: 32768,  input: ['text'] },
    { id: 'doubao-vision-pro-32k', name: 'Doubao Vision Pro',  contextWindow: 32768,  input: ['text', 'image'] },
    { id: 'deepseek-r1-250528',  name: 'DeepSeek R1 (Ark)',    contextWindow: 64000,  reasoning: true, input: ['text'] },
    { id: 'deepseek-v3-250324',  name: 'DeepSeek V3 (Ark)',    contextWindow: 64000,  input: ['text'] },
  ],

  // ── 百度千帆 (Qianfan) ────────────────────────────────────────────────────
  qianfan: [
    { id: 'ernie-4.5-8k',          name: 'ERNIE 4.5 8K',       contextWindow: 8192,  input: ['text', 'image'] },
    { id: 'ernie-4.0-8k',          name: 'ERNIE 4.0 8K',       contextWindow: 8192,  input: ['text', 'image'] },
    { id: 'ernie-3.5-8k',          name: 'ERNIE 3.5 8K',       contextWindow: 8192,  input: ['text'] },
    { id: 'ernie-speed-128k',       name: 'ERNIE Speed 128K',   contextWindow: 131072, input: ['text'] },
    { id: 'deepseek-v3',            name: 'DeepSeek V3',         contextWindow: 64000,  input: ['text'] },
    { id: 'deepseek-r1',            name: 'DeepSeek R1',         contextWindow: 64000,  reasoning: true, input: ['text'] },
  ],

  // ── 小米 MiMo ─────────────────────────────────────────────────────────────
  xiaomi: [
    { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', contextWindow: 128000, input: ['text', 'image'] },
    { id: 'mimo-v1',       name: 'MiMo V1',       contextWindow: 128000, input: ['text', 'image'] },
  ],
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

/**
 * 根据 provider key 获取服务商预设
 */
export function getProviderPreset(key) {
  return PROVIDER_PRESETS.find(p => p.key === key)
}

/**
 * 获取某服务商的模型预设列表（不存在则返回空数组）
 */
export function getModelPresets(providerKey) {
  return MODEL_PRESETS[providerKey] || []
}

/**
 * 过滤已添加的模型，返回尚未添加的预设
 */
export function getAvailablePresets(providerKey, existingIds) {
  const existing = new Set(existingIds)
  return getModelPresets(providerKey).filter(m => !existing.has(m.id))
}

/**
 * 将模型对象规范化为 OpenClaw 格式
 * 自动补全 input 默认值，剔除 UI 专属字段
 */
export function normalizeModel(raw) {
  const model = {
    id:   String(raw.id   || '').trim(),
    name: String(raw.name || raw.id || '').trim(),
  }
  if (raw.contextWindow) model.contextWindow = Number(raw.contextWindow) || 0
  if (raw.reasoning)     model.reasoning = true
  model.input = Array.isArray(raw.input) && raw.input.length
    ? raw.input
    : ['text', 'image']
  return model
}

/** 支持的输入模态选项 */
export const INPUT_MODALITIES = [
  { value: 'text',  label: '文本' },
  { value: 'image', label: '图像' },
]

/** 接口类型选项（OpenClaw 支持的协议） */
export const API_TYPES = [
  { value: 'openai-completions', label: 'OpenAI 兼容 (最常用)' },
  { value: 'anthropic-messages', label: 'Anthropic 原生' },
  { value: 'openai-responses',   label: 'OpenAI Responses' },
  { value: 'google-gemini',      label: 'Google Gemini' },
]

/** 顶部 4 个快捷服务商（3 常用 + 1 自定义占位） */
export const QUICK_PROVIDERS = ['openai', 'anthropic', 'deepseek']
