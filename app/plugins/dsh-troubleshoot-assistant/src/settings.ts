/**
 * @module @dsh-tools/troubleshoot-assistant/settings
 *
 * 设置命名空间 "troubleshoot"：在 Web 设置页（3080）以卡片形式编辑。
 *
 * 数据源模型（动态数组）：
 *   dataSources: [{ id, type, enabled, name, url, authType, token, username,
 *                  password, headerName, queryPath, timeoutMs, description }, ...]
 * 用户可在卡片中任意【添加/删除】数据源，选择预设类型或输入自定义类型，
 * 再填写 URL / Token / 认证等。工具运行时按"类型或名称"匹配启用数据源。
 *
 * 为什么数组可行（而不是扁平字段）：
 * - 客户端 settingsScope.set(field, value) 的 value 支持任意 JSON（path 深度 1，
 *   值可为数组/对象）；dsh 自身的 llm-pi-ai.providers 就是嵌套对象数组；
 * - redactSecrets 的 walker 支持 object/dict/array 容器递归，
 *   role('secret') 字段在数组条目里同样脱敏。
 *
 * 安全要点：
 * - token / password 字段声明 role('secret')——dsh-settings 会在所有
 *   wire 响应中脱敏，Web 卡片永远看不到已存值，只能写入或清除；
 * - 建议使用 "env:<NAME>" 引用，使机密只存在于运行环境。
 */

import { settingsNamespace, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  defaultQueryPathFor, dataSourceLabel, type AuthConfig, type AuthType,
  type DataSourceConfig, type ResolvedSources, type TimeRange,
} from './types.ts'

/** 本插件在 settings 系统中的命名空间（小写 kebab-case）。 */
export const NAMESPACE: SettingsNamespace = settingsNamespace('troubleshoot')

/** 认证方式的可选值（schemastery union 需要 const 字面量）。 */
export const AUTH_TYPES = ['none', 'bearer', 'basic', 'header'] as const

/** settings 文档中一个数据源条目的原始结构（用户文档形态）。 */
export interface DataSourceEntry {
  /** 数据源唯一 ID（客户端生成，uuid）。 */
  id: string
  /** 数据源类型（预设或自定义字符串）。 */
  type: string
  /** 是否启用。 */
  enabled: boolean
  /** 展示名称。 */
  name: string
  /** 基础 URL（仅 http/https）。 */
  url: string
  /** 认证方式。 */
  authType: AuthType
  /** Bearer Token 或自定义头值；支持 "env:<NAME>"。 */
  token: string
  /** Basic 认证用户名。 */
  username: string
  /** Basic 认证密码；支持 "env:<NAME>"。 */
  password: string
  /** 自定义头认证的请求头名。 */
  headerName: string
  /** 查询路径；留空用类型默认。 */
  queryPath: string
  /** 单请求超时（毫秒）；0 = 继承插件默认。 */
  timeoutMs: number
  /** 说明。 */
  description: string
}

/** settings 文档完整结构。 */
export interface TroubleshootSettings {
  /** 全部数据源（动态数组）。 */
  dataSources: DataSourceEntry[]
  /** 默认时间范围（分钟）。 */
  defaultTimeRangeMinutes: number
  /** 默认结果上限。 */
  maxResults: number
}

/** 单个数据源条目的 schemastery schema。 */
function dataSourceEntrySchema() {
  return z.object({
    id: z.string().required(),
    type: z.string().required().description('数据源类型：metrics/logs/trace/cmdb/knowledge 或自定义类型'),
    enabled: z.boolean().default(false),
    name: z.string().required().description('展示名称，便于 agent 识别'),
    url: z.string().required().description('基础 URL，仅 http/https；认证信息请勿写进 URL'),
    authType: z.union(AUTH_TYPES).default('none'),
    token: z.string().role('secret').default(''),
    username: z.string().default(''),
    password: z.string().role('secret').default(''),
    headerName: z.string().default('Authorization'),
    queryPath: z.string().default('').description('查询路径；留空使用类型默认（自定义类型留空则请求 base URL）'),
    timeoutMs: z.number().min(0).max(120000).default(0), // 0 = 继承插件默认超时
    description: z.string().default(''),
  })
}

/** 设置文档的 schemastery schema（同时用于设置页渲染与写入校验）。 */
export const TroubleshootSettingsSchema: z<TroubleshootSettings> = z.object({
  dataSources: z.array(dataSourceEntrySchema()).default([]),
  defaultTimeRangeMinutes: z.number().min(1).max(7 * 24 * 60).default(60),
  maxResults: z.number().min(1).max(5000).default(200),
})

/** 生成一个新的数据源条目 ID（客户端与服务端共用格式：ds-<timestamp>-<rand>）。 */
export function newDataSourceId(): string {
  return `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 把 settings 文档中的一条数据源条目组装成运行时配置。
 * @param entry - 用户文档条目。
 * @returns 组装后的数据源配置；URL 为空时返回 undefined。
 */
export function entryToDataSource(entry: DataSourceEntry): DataSourceConfig | undefined {
  const url = entry.url.trim()
  if (url === '') return undefined
  const auth: AuthConfig = {
    type: entry.authType,
    token: entry.token,
    username: entry.username,
    password: entry.password,
    headerName: entry.headerName || 'Authorization',
  }
  const configuredTimeout = entry.timeoutMs
  return {
    id: entry.id,
    type: entry.type,
    enabled: entry.enabled,
    name: entry.name.trim() || dataSourceLabel(entry.type),
    url,
    auth,
    queryPath: entry.queryPath.trim() || defaultQueryPathFor(entry.type),
    ...configuredTimeout > 0 ? { timeoutMs: configuredTimeout } : {},
    description: entry.description,
  }
}

/**
 * 从 settings 文档组装全部数据源（动态数组 → ResolvedSources）。
 * @param value - settings 文档。
 * @returns 解析后的数据源集合（含索引 Map）。
 */
export function sourcesFromSettings(value: TroubleshootSettings): ResolvedSources {
  const entries = Array.isArray(value.dataSources) ? value.dataSources : []
  const all: DataSourceConfig[] = []
  const byId = new Map<string, DataSourceConfig>()
  const byName = new Map<string, DataSourceConfig>()
  const byType = new Map<string, DataSourceConfig[]>()
  for (const entry of entries) {
    const config = entryToDataSource(entry)
    if (config === undefined) continue
    all.push(config)
    byId.set(config.id, config)
    if (config.name !== '') byName.set(config.name, config)
    if (config.enabled) {
      const list = byType.get(config.type) ?? []
      list.push(config)
      byType.set(config.type, list)
    }
  }
  return { all, byId, byName, byType }
}

/**
 * 解析时间参数（ISO-8601 字符串或毫秒时间戳）为毫秒范围。
 * 未给出 start/end 时回退到 [now - rangeMinutes, now]。
 * 任何解析失败抛 TypeError（由工具层转成结构化错误）。
 * @param start - 起始时间（可选）。
 * @param end - 结束时间（可选）。
 * @param rangeMinutes - 默认范围（分钟）。
 * @param now - 当前时间（毫秒），测试可注入。
 * @returns 规范化后的时间范围。
 */
export function resolveTimeRange(start?: string | number, end?: string | number, rangeMinutes?: number, now: number = Date.now()): TimeRange {
  const parse = (input: string | number | undefined): number | undefined => {
    if (input === undefined) return undefined
    if (typeof input === 'number') {
      if (!Number.isFinite(input) || input <= 0) throw new TypeError(`time value must be a positive finite number, got ${String(input)}`)
      return Math.trunc(input)
    }
    const parsed = Date.parse(input)
    if (Number.isNaN(parsed)) throw new TypeError(`time value must be ISO-8601 or epoch ms, got "${input}"`)
    return parsed
  }
  const startMs = parse(start)
  const endMs = parse(end)
  const range = (rangeMinutes ?? 60) > 0 ? (rangeMinutes ?? 60) : 60
  const resolvedEnd = endMs ?? now
  const resolvedStart = startMs ?? resolvedEnd - range * 60_000
  if (resolvedStart >= resolvedEnd) throw new TypeError('time range start must be before end')
  return { start: resolvedStart, end: resolvedEnd }
}

/** 将毫秒时间戳格式化为 ISO-8601（用于请求参数）。 */
export function toIso(ms: number): string {
  return new Date(ms).toISOString()
}
