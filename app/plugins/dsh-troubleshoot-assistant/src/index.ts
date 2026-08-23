/**
 * @module @dsh-tools/troubleshoot-assistant
 *
 * 故障排查助手（Host 半）：
 * - 注册 settings 命名空间 "troubleshoot"（Web 设置页卡片编辑数据源）；
 * - 注册 7 个模型可见工具（状态 / 指标 / 日志 / 调用链 / CMDB / 取证 / 报告）。
 *
 * 配置（cordis.yml 行 "troubleshoot-assistant" 的 config）：
 *   defaultTimeoutMs   单请求超时（毫秒），默认 15000
 *   maxResponseBytes   单请求响应体上限（字节），默认 2 MiB
 *   maxConcurrency     多源取证并发上限，默认 4
 *   reportDir          故障报告落盘目录（绝对路径）；空串不落盘
 *
 * 数据源配置（settings 命名空间，Web 卡片编辑；也可手改 $DSH_HOME/settings.yaml
 * 的 "troubleshoot:" 段，改完热生效）：
 *   <type>Enabled / <type>Url / <type>AuthType / <type>Token / <type>Username /
 *   <type>Password / <type>HeaderName / <type>QueryPath / <type>TimeoutMs /
 *   <type>Description / defaultTimeRangeMinutes / maxResults
 *
 * 安全契约：
 * - Token/Password 声明 role('secret')，settings 系统在 wire 上脱敏；
 *   推荐填写 "env:<NAME>" 引用，机密不落盘；
 * - HTTP 调用：仅 http/https、无内嵌凭据 URL、全链路超时、响应体字节上限、
 *   TLS 校验保持开启、错误信息经 redactText 兜底脱敏。
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  NAMESPACE, TroubleshootSettingsSchema, type TroubleshootSettings,
} from './settings.ts'
import { defaultCatalogEntries, registerMarketCatalog, type MarketPluginEntry } from './market.ts'
import { resolveSopForWorkspace } from './sop.ts'
import { buildRuntime, registerTools } from './tools.ts'
import { registerExportRoute } from './export.ts'
import type { ToolRuntimeContext } from './types.ts'

/** 插件名（cordis.yml 行的 name 使用包名；此处为 Loader 的日志标识）。 */
export const name = 'troubleshoot-assistant'

/**
 * 声明依赖的服务：仅 tools（注册工具）。
 * settings 不做硬依赖：installSettingsSection 内部以 ctx.inject(['settings'])
 * 自适应——settings 服务存在时注册命名空间并接管读取源；不存在时保持
 * 插件配置默认值运行（自定义 profile 无 settings 行也不阻塞启动）。
 */
export const inject = ['tools']

/** 插件级配置（非敏感；数据源配置在 settings 命名空间）。 */
export interface Config {
  /** 单请求超时（毫秒）。 */
  defaultTimeoutMs: number
  /** 单请求响应体字节上限。 */
  maxResponseBytes: number
  /** 多源取证并发上限。 */
  maxConcurrency: number
  /** 故障报告落盘目录（绝对路径）；空串表示不落盘。 */
  reportDir: string
  /** 本地插件市场目录的额外条目（在默认条目之上追加）。 */
  catalogExtra: MarketPluginEntry[]
  /** 离线市场快照文件（awesome-dsh-plugin plugins.json）；空串 = 仅用兜底目录。 */
  marketSnapshotPath: string
  /** 快照读取上限（字节）。 */
  maxSnapshotBytes: number
  /** 全局 SOP 文件（绝对路径）：工作区没有自己的 SOP 时的基线；空串 = 仅用内置默认。 */
  sopPath: string
  /** 会话工作区内 SOP 文件名（按 cwd 解析，不同工作区可配不同 SOP）。 */
  sopRelativePath: string
  /** SOP 文件单次读取字节上限。 */
  maxSopBytes: number
}

/** 市场条目的 schemastery 校验（与 MarketPluginEntry 对齐）。 */
const marketEntrySchema = z.object({
  fullName: z.string(),
  name: z.string(),
  owner: z.string().default(''),
  repo: z.string().default(''),
  subpath: z.string().default(''),
  summary: z.string().default(''),
  summaryZh: z.string().default(''),
  category: z.string().default('ops'),
  install: z.string(),
  riskFlags: z.array(z.string()).default([]),
})

/** 插件级配置 schema（schemastery；越界值在加载时即拒绝）。 */
export const Config: z<Config> = z.object({
  defaultTimeoutMs: z.number().min(1000).max(120000).default(15000),
  maxResponseBytes: z.number().min(4096).max(50 * 1024 * 1024).default(2 * 1024 * 1024),
  maxConcurrency: z.number().min(1).max(16).default(4),
  reportDir: z.string().default(''),
  catalogExtra: z.array(marketEntrySchema).default([]),
  marketSnapshotPath: z.string().default(''),
  maxSnapshotBytes: z.number().min(65536).max(64 * 1024 * 1024).default(8 * 1024 * 1024),
  sopPath: z.string().default(''),
  sopRelativePath: z.string().default('故障排查SOP.md'),
  maxSopBytes: z.number().min(1024).max(1024 * 1024).default(64 * 1024),
})

/** settings 文档不存在时使用的空默认值（全部取 schema 默认）。 */
function emptySettings(): TroubleshootSettings {
  // 通过 schema 校验一次空对象即可得到全部默认值。
  // schemastery 的输入类型是部分结构（可选属性）；空对象经默认值校验后即为完整结构。
  return TroubleshootSettingsSchema({} as TroubleshootSettings) as unknown as TroubleshootSettings
}

/**
 * 插件入口。
 * @param ctx - Cordis 上下文。
 * @param config - 插件级配置（来自 cordis.yml 行 config）。
 */
export function apply(ctx: Context, config: Config): void {
  // 运行时快照：初始为"插件配置 + 空 settings"，settings 服务就绪后
  // installSettingsSection 会把读取源切到用户文档（热更新即时生效）。
  let source = (): TroubleshootSettings => emptySettings()
  const getRuntime = (): ToolRuntimeContext => buildRuntime(source(), config)

  // 注册 settings 命名空间：entry 作为 composition 基线，用户文档覆盖其上。
  // settings 服务未挂载时（自定义 profile 无 settings 行）回退到 entry。
  installSettingsSection(ctx, NAMESPACE, TroubleshootSettingsSchema, emptySettings(), {
    setSource: (current) => { source = current },
    onChange: () => { /* 工具在调用时读取最新快照，无需预计算 */ },
  })

  // 注册全部工具；注册是 effect，卸载自动注销。
  registerTools(ctx, getRuntime)

  // 注册数据源导出 / 导入模板路由（只读 GET；env: 引用放行、字面量 secret 掩码）。
  // 传 () => source() 包装：settings 服务就绪后 source 会被 setSource 重绑，
  // 包装函数保证导出始终读最新文档。
  registerExportRoute(ctx, () => source())

  // 注册本地插件市场目录路由（仅 Web 表面存在时；商店经 DSHM_API 指向自身）。
  registerMarketCatalog(ctx, [...defaultCatalogEntries(), ...config.catalogExtra], config.marketSnapshotPath, config.maxSnapshotBytes)

  // 注册故障排查 SOP 提示词段落：每次组装按"会话工作区 → 全局文件 → 内置"
  // 实时解析用户可编辑文件（改文件即生效，不同工作区可生效不同 SOP）。
  // systemPrompt 服务可能不存在（自定义精简 profile），存在时才注册。
  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: 'troubleshoot:sop',
      order: 50, // persona(0) 之后、工具指引(100-199) 之前
      text: (context) => {
        // 组装上下文携带发起 agent；其 session.header.cwd 即会话工作区根。
        const agent = (context as { agent?: { session?: { header?: { cwd?: string } } } }).agent
        const cwd = agent?.session?.header?.cwd
        return resolveSopForWorkspace(cwd, config.sopRelativePath, config.sopPath, config.maxSopBytes).text
      },
    })
  })
}
