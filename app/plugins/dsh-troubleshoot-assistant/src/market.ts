/**
 * @module @dsh-tools/troubleshoot-assistant/market
 *
 * 本地插件市场目录（dshmarketplace 兼容）。
 *
 * 背景：dshmarketplace-plugin（插件商店）从 DSHM_API 环境变量指向的目录端点
 * 拉取插件清单（默认 https://dshmarketplace.dev/api/v1/plugins）。本模块在
 * dsh web 自身注册同路径的 exact 路由，返回**本地目录**：
 *   - 本插件 @dsh-tools/troubleshoot-assistant（预装，随包分发）；
 *   - dsh-better-sidebar（npm，可一键安装）。
 * 配合容器环境 DSHM_API=http://127.0.0.1:3080，商店即可完全离线工作——
 * 插件市场"装进包里"，无需外部网络。
 *
 * 目录契约（与 dshmarketplace.dev 的 /api/v1/plugins 一致）：
 *   { total, count, results: [{ fullName, name, owner, repo, subpath,
 *     summary, summaryZh, category, install, riskFlags }] }
 * install 必须是 `dsh plugin --profile <p> add <npm名|github:owner/repo>`，
 * 商店侧会做白名单校验（拒绝 file: 等路径形式）。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, statSync } from 'node:fs'

// 局部结构化声明：本插件只用到 register() 的最小面，避免引入 dsh-host-webserver
// 开发依赖（运行时服务由 dsh 提供，结构兼容）。
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** dsh 的 node:http 路由注册服务（由 dsh-host-webserver 提供）。 */
    webServer: {
      /** 注册一条 exact 路径路由；返回该路由的 disposer。 */
      register(options: {
        kind: 'exact'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => unknown
    }
  }
}

/** 一个市场条目。字段与 dshmarketplace.dev 目录兼容。 */
export interface MarketPluginEntry {
  /** 唯一标识，形如 owner/repo 或 npm 包名。 */
  fullName: string
  /** 展示名。 */
  name: string
  /** 维护者（用于分组展示）。 */
  owner: string
  /** 源仓库名。 */
  repo: string
  /** 仓库内子路径（monorepo 时使用；无则 null）。 */
  subpath: string | null
  /** 英文摘要。 */
  summary: string
  /** 中文摘要。 */
  summaryZh: string
  /** 分类：ui / ops / memory / workflow ... */
  category: string
  /** 安装命令（商店白名单校验后执行）。 */
  install: string
  /** 风险标记（空数组 = 未检测到风险；商店据此决定是否需确认）。 */
  riskFlags: string[]
}

/** 内置本地目录条目。 */
export function defaultCatalogEntries(profile = 'web'): MarketPluginEntry[] {
  return [
    {
      fullName: '@dsh-tools/troubleshoot-assistant',
      name: 'Troubleshoot Assistant',
      owner: 'dsh-tools',
      repo: 'troubleshoot-assistant',
      subpath: null,
      summary: 'Troubleshooting assistant: configure metrics/logs/trace/CMDB/knowledge-base data sources in Settings, then let the agent troubleshoot incidents, collect evidence and generate fault reports.',
      summaryZh: '故障排查助手：在设置页配置指标/日志/调用链/CMDB/知识库数据源，agent 即可基于问题排查故障、按需补充证据并生成故障报告（随本部署预装）。',
      category: 'ops',
      install: `dsh plugin --profile ${profile} add @dsh-tools/troubleshoot-assistant`,
      riskFlags: [],
    },
    {
      fullName: 'omdsh-dev/DSH-better-sidebar',
      name: 'DSH-better-sidebar',
      owner: 'omdsh-dev',
      repo: 'DSH-better-sidebar',
      subpath: null,
      summary: 'Full sidebar workbench with file rendering and editing, terminal, Git, and subagents; third-party plugins can register new tabs.',
      summaryZh: '侧边栏完整工作台：内置文件渲染编辑、终端、Git 与子代理，支持三方插件注册新 Tab。',
      category: 'ui',
      install: `dsh plugin --profile ${profile} add dsh-better-sidebar`,
      riskFlags: ['terminal surface'],
    },
  ]
}

/** 把响应以 JSON 写出。 */
function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
  })
  res.end(payload)
}

/** 简单 JSON 正文解析（防御畸形输入）。 */
function tryJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 快照目录缓存：路径 → (mtime, size, json 文本)。 */
const snapshotCache = new Map<string, { mtimeMs: number; size: number; text: string }>()

/**
 * 读取离线市场快照（awesome-dsh-plugin 官方目录的本地副本）。
 * @param path - 快照文件绝对路径。
 * @param maxBytes - 读取上限（默认 8 MiB）。
 * @returns JSON 文本；文件缺失/不可读/超限时 undefined。
 */
export function loadMarketSnapshot(path: string, maxBytes: number): string | undefined {
  if (path === '') return undefined
  let stat
  try {
    stat = statSync(path)
  } catch {
    return undefined
  }
  if (stat.size <= 0 || stat.size > maxBytes) return undefined
  const hit = snapshotCache.get(path)
  if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.text
  try {
    const text = readFileSync(path, 'utf8')
    // 校验：dshmarket 要求 plugins 是非空数组。
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed.plugins) || parsed.plugins.length === 0) return undefined
    snapshotCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text })
    return text
  } catch {
    snapshotCache.delete(path)
    return undefined
  }
}

/** 快照缺失时的兜底目录（仅有可安装源的真实条目）。 */
export function fallbackMarketCatalog(): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10)
  return {
    name: 'dsh-offline-market',
    url: 'http://127.0.0.1:3080',
    source: 'https://github.com/omdsh-dev/DSH-better-sidebar',
    updated: today,
    count: 3,
    categories: {
      ui: { en: 'UI Enhancements', zh: 'UI 增强' },
      ops: { en: 'Operations / Troubleshooting', zh: '运维 / 故障排查' },
      learning: { en: 'Learning', zh: '学习' },
    },
    plugins: [
      {
        name: 'Troubleshoot Assistant',
        owner: 'dsh-tools',
        url: 'http://127.0.0.1:3080',
        page: 'http://127.0.0.1:3080/api/dshmarket/plugins.json',
        category: 'ops',
        description: {
          en: 'Troubleshooting assistant: configure data sources, troubleshoot incidents, collect evidence and generate fault reports. Built-in and protected.',
          zh: '故障排查助手：配置数据源后排障、取证并生成故障报告。内置安装、受保护不可卸载。',
        },
        npm: '@dsh-tools/troubleshoot-assistant',
        stars: 0,
        downloads: 0,
        install: 'dsh plugin --profile web add @dsh-tools/troubleshoot-assistant',
        added: today,
      },
      {
        name: 'DSH-better-sidebar',
        owner: 'omdsh-dev',
        url: 'https://github.com/omdsh-dev/DSH-better-sidebar',
        page: 'http://127.0.0.1:3080/api/dshmarket/plugins.json',
        category: 'ui',
        description: {
          en: 'Full sidebar workbench with file rendering and editing, terminal, Git, and subagents.',
          zh: '侧边栏完整工作台：文件渲染编辑、终端、Git 与子代理。',
        },
        npm: 'dsh-better-sidebar',
        stars: 0,
        downloads: 0,
        install: 'dsh plugin --profile web add dsh-better-sidebar',
        added: today,
      },
      {
        name: 'dsh-deeptutor',
        owner: 'TecFancy',
        url: 'https://github.com/TecFancy/dsh-deeptutor',
        page: 'http://127.0.0.1:3080/api/dshmarket/plugins.json',
        category: 'learning',
        description: {
          en: 'Learning assistant: deep explanations, self-test questions, learning paths, personal KB search, note archiving.',
          zh: '学习助手：深入讲解、自测题、学习路径、个人知识库检索与笔记归档。',
        },
        npm: 'dsh-deeptutor',
        stars: 0,
        downloads: 0,
        install: 'dsh plugin --profile web add dsh-deeptutor',
        added: today,
      },
    ],
  }
}

/** 内置插件在 dshmarket 目录中的条目（npm 名 → 条目）。 */
const BUILTIN_MARKET_ENTRIES: Record<string, Record<string, unknown>> = {
  '@dsh-tools/troubleshoot-assistant': {
    name: 'Troubleshoot Assistant',
    owner: 'dsh-tools',
    url: 'http://127.0.0.1:3080',
    page: 'http://127.0.0.1:3080/api/dshmarket/plugins.json',
    category: 'ops',
    description: {
      en: 'Troubleshooting assistant: configure data sources, troubleshoot incidents, collect evidence and generate fault reports. Built-in and protected.',
      zh: '故障排查助手：配置数据源后排障、取证并生成故障报告。内置安装、受保护不可卸载。',
    },
    npm: '@dsh-tools/troubleshoot-assistant',
    stars: 0,
    downloads: 0,
    install: 'dsh plugin --profile web add @dsh-tools/troubleshoot-assistant',
    added: '2026-08-17',
  },
  'dsh-better-sidebar': {
    name: 'DSH-better-sidebar',
    owner: 'omdsh-dev',
    url: 'https://github.com/omdsh-dev/DSH-better-sidebar',
    page: 'http://127.0.0.1:3080/api/dshmarket/plugins.json',
    category: 'ui',
    description: {
      en: 'Full sidebar workbench with file rendering and editing, terminal, Git, and subagents.',
      zh: '侧边栏完整工作台：文件渲染编辑、终端、Git 与子代理。',
    },
    npm: 'dsh-better-sidebar',
    stars: 0,
    downloads: 0,
    install: 'dsh plugin --profile web add dsh-better-sidebar',
    added: '2026-08-14',
  },
  'dsh-deeptutor': {
    name: 'dsh-deeptutor',
    owner: 'TecFancy',
    url: 'https://github.com/TecFancy/dsh-deeptutor',
    page: 'http://127.0.0.1:3080/api/dshmarket/plugins.json',
    category: 'learning',
    description: {
      en: 'Learning assistant: deep explanations, self-test questions, learning paths, personal KB search, note archiving.',
      zh: '学习助手：深入讲解、自测题、学习路径、个人知识库检索与笔记归档。',
    },
    npm: 'dsh-deeptutor',
    stars: 0,
    downloads: 0,
    install: 'dsh plugin --profile web add dsh-deeptutor',
    added: '2026-08-14',
  },
}

/**
 * 把内置条目合并进离线快照目录（按 npm 名去重：快照已有同 npm 名的保留快照条目）。
 * @param snapshotText - 离线快照 JSON 文本。
 * @returns 合并后的目录对象（plugins 非空数组，满足 dshmarket 校验）。
 */
export function mergeBuiltinEntries(snapshotText: string): Record<string, unknown> {
  let catalog: Record<string, unknown>
  try {
    catalog = JSON.parse(snapshotText) as Record<string, unknown>
  } catch {
    return fallbackMarketCatalog()
  }
  const plugins = Array.isArray(catalog.plugins) ? catalog.plugins : []
  const byNpm = new Map<string, Record<string, unknown>>()
  for (const plugin of plugins) {
    if (typeof plugin === 'object' && plugin !== null) {
      const npm = (plugin as Record<string, unknown>).npm
      if (typeof npm === 'string' && npm !== '') byNpm.set(npm, plugin as Record<string, unknown>)
    }
  }
  const mergedPlugins = [...plugins]
  for (const [npm, entry] of Object.entries(BUILTIN_MARKET_ENTRIES)) {
    if (byNpm.has(npm)) continue
    mergedPlugins.push(entry)
  }
  const count = mergedPlugins.length
  return { ...catalog, count, plugins: mergedPlugins }
}

/**
 * 在 dsh web 上注册本地市场目录路由（仅当 webServer 服务存在时）：
 *   - /api/dshmarket/plugins.json  dshmarket（与 3080 一致的市场插件）的目录端点，
 *     离线快照优先，缺失时回退兜底目录；
 *   - /api/v1/plugins              兼容 dshmarketplace 商店格式（保留，未启用时无人调用）。
 * @param ctx - Cordis 上下文。
 * @param entries - dshmarketplace 格式的默认条目。
 * @param snapshotPath - 离线快照文件（awesome-dsh-plugin plugins.json）；空串跳过快照。
 * @param maxSnapshotBytes - 快照读取上限。
 */
export function registerMarketCatalog(
  ctx: Context,
  entries: MarketPluginEntry[] = defaultCatalogEntries(),
  snapshotPath = '',
  maxSnapshotBytes = 8 * 1024 * 1024,
): void {
  // webServer 可能不存在（headless 等无 Web 表面）；存在时才注册路由。
  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    webCtx.effect(() => webServer.register({
      kind: 'exact',
      path: '/api/dshmarket/plugins.json',
      handler: (req: IncomingMessage, res: ServerResponse): void => {
        // dshmarket 会带 ETag/If-Modified-Since 重校验；本地快照直接回 200 即可。
        const snapshot = loadMarketSnapshot(snapshotPath, maxSnapshotBytes)
        if (snapshot === undefined) {
          send(res, 200, fallbackMarketCatalog())
          return
        }
        // 合并内置条目（故障排查助手 / better-sidebar / deeptutor）：
        // 离线快照可能缺内置插件条目，注入后市场目录始终可见本部署预装插件。
        const merged = mergeBuiltinEntries(snapshot)
        send(res, 200, merged)
      },
    }), 'troubleshoot-assistant: offline market snapshot route')

    webCtx.effect(() => webServer.register({
      kind: 'exact',
      path: '/api/v1/plugins',
      handler: (req: IncomingMessage, res: ServerResponse): void => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
        const category = (url.searchParams.get('category') ?? '').trim().toLowerCase()
        const rawLimit = Number(url.searchParams.get('limit') ?? 60)
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.trunc(rawLimit), 200) : 60
        const rawPage = Number(url.searchParams.get('page') ?? 0)
        const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 0

        // 过滤（名称/摘要/分类）——与商店的本地过滤语义一致。
        let results = entries
        if (q !== '') {
          results = results.filter((entry) =>
            [entry.name, entry.fullName, entry.summary, entry.summaryZh, entry.category]
              .filter(Boolean)
              .some((field) => String(field).toLowerCase().includes(q)),
          )
        }
        if (category !== '') {
          results = results.filter((entry) => entry.category.toLowerCase() === category)
        }
        const total = results.length
        const sliced = results.slice(page * limit, page * limit + limit)
        send(res, 200, { total, count: sliced.length, results: sliced })
      },
    }), 'troubleshoot-assistant: local market catalog route')
  })
}

// 保持类型导出可用于 Config 校验（扩展条目用）。
export type { IncomingMessage as _IncomingMessage, ServerResponse as _ServerResponse }

/** 目录条目的轻量结构校验（供 Config 扩展条目使用）。 */
export function isMarketPluginEntry(value: unknown): value is MarketPluginEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.fullName === 'string'
    && typeof record.name === 'string'
    && typeof record.install === 'string'
}
