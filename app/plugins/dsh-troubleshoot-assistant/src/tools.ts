/**
 * @module @dsh-tools/troubleshoot-assistant/tools
 *
 * 模型可见的工具集（7 个）：
 *   - troubleshoot_status       列出已配置/启用的数据源（脱敏）与默认参数
 *   - query_metrics / query_logs / query_trace / query_cmdb
 *                               单源查询（时间范围、limit、额外参数）
 *   - troubleshoot_evidence     多源并行取证（排查中的证据补充）
 *   - generate_fault_report     生成结构化故障报告（可落盘）
 *
 * 契约：
 * - 所有查询失败都返回 { ok:false, code, error } 规范化结果，不抛错
 *   （取消除外——exec.signal 中止时上抛，交给调度器按取消处理）；
 * - 工具返回值永不包含凭据；URL 参数含查询词但无认证信息；
 * - 时间参数统一 ISO-8601 或毫秒时间戳。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { appendQueryPath, callDataSource, type HttpCallOptions } from './http.ts'
import { resolveTimeRange, sourcesFromSettings, toIso, type TroubleshootSettings } from './settings.ts'
import type { DataSourceConfig, DataSourceType, QueryOutcome, ToolRuntimeContext } from './types.ts'
import { PRESET_SOURCE_TYPES, dataSourceLabel } from './types.ts'

/** 全部预设数据源类型，用于工具参数的枚举提示。 */
const SOURCE_TYPES: string[] = PRESET_SOURCE_TYPES

/** 时间参数 schema 片段（各查询工具共用）。 */
function timeRangeParams() {
  return {
    source: { type: 'string' as const, description: '数据源名称或类型；缺省按类型取第一个启用源。可用 troubleshoot_status 查看已配置数据源' },
    start: { type: 'string' as const, description: '起始时间，ISO-8601 或毫秒时间戳；缺省取 end-rangeMinutes' },
    end: { type: 'string' as const, description: '结束时间，ISO-8601 或毫秒时间戳；缺省取当前时间' },
    rangeMinutes: { type: 'number' as const, description: '时间范围（分钟），仅当未给 start/end 时生效；默认取设置值' },
    limit: { type: 'number' as const, description: '返回结果条数上限；默认取设置值 maxResults' },
    extraParams: {
      type: 'object' as const,
      additionalProperties: true,
      description: '附加查询参数（键值对，原样追加到请求），用于数据源特有参数',
    },
  }
}

/** 时间与 limit 参数的规范化结果。 */
interface ResolvedQueryWindow {
  start: number
  end: number
  limit: number
  rangeMinutes: number
}

/** 从工具参数解析查询窗口。 */
function resolveWindow(args: { source?: string; start?: string | number; end?: string | number; rangeMinutes?: number; limit?: number }, runtime: ToolRuntimeContext): ResolvedQueryWindow {
  const range = resolveTimeRange(args.start, args.end, args.rangeMinutes ?? runtime.defaultTimeRangeMinutes)
  const limit = args.limit ?? runtime.maxResults
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5000)
  return { start: range.start, end: range.end, limit: safeLimit, rangeMinutes: args.rangeMinutes ?? runtime.defaultTimeRangeMinutes }
}

/** requireSource 的结果：命中（含配置）或缺失（含失败结果）。 */
type RequireSourceResult =
  | { kind: 'ok'; config: DataSourceConfig }
  | { kind: 'missing'; outcome: QueryOutcome }

/**
 * 解析数据源选择器：优先精确匹配名称（byName），其次按类型取第一个启用源（byType）。
 * 选择器为空时按类型取启用源。
 * @param selector - 数据源名称或类型（可选）。
 * @param type - 预设/目标类型（用于默认匹配与错误提示）。
 * @param runtime - 运行时上下文。
 */
function resolveSource(selector: string | undefined, type: string, runtime: ToolRuntimeContext): DataSourceConfig | undefined {
  const sources = runtime.sources
  if (selector !== undefined && selector !== '') {
    const byName = sources.byName.get(selector)
    if (byName !== undefined && byName.enabled) return byName
    // 名称未命中时按类型匹配（selector 可能是类型本身）
  }
  const candidates = sources.byType.get(type) ?? []
  return candidates.find(config => config.enabled)
}

/** 获取数据源配置；未配置/未启用时返回失败结果。 */
function requireSource(selector: string | undefined, type: string, runtime: ToolRuntimeContext): RequireSourceResult {
  const config = resolveSource(selector, type, runtime)
  if (config === undefined || !config.enabled) {
    const label = dataSourceLabel(type)
    const hint = selector !== undefined && selector !== '' ? `（选择器 "${selector}"）` : ''
    return {
      kind: 'missing',
      outcome: {
        source: type as DataSourceType,
        ok: false,
        code: 'SOURCE_NOT_CONFIGURED',
        error: `${label} 数据源未配置或未启用${hint}：请在 Web 设置页（troubleshoot 卡片）添加数据源并填写 URL、启用`,
        truncated: false,
        value: null,
      },
    }
  }
  return { kind: 'ok', config }
}

/** 对结果做 count 推断（数组长度 / 常见容器字段）。 */
function inferCount(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length
  if (typeof value === 'object' && value !== null) {
    for (const key of ['items', 'result', 'data', 'hits', 'changes', 'records']) {
      const candidate = (value as Record<string, unknown>)[key]
      if (Array.isArray(candidate)) return candidate.length
    }
  }
  return undefined
}

/** 执行一次数据源查询并归一化结果。 */
async function runQuery(type: string, runtime: ToolRuntimeContext, window: ResolvedQueryWindow, query: string, extraParams: Record<string, string> | undefined, signal: AbortSignal, selector?: string): Promise<QueryOutcome> {
  const found = requireSource(selector, type, runtime)
  if (found.kind === 'missing') return found.outcome
  const { config } = found
  const params: Record<string, string> = {
    ...extraParams ?? {},
    start: toIso(window.start),
    end: toIso(window.end),
    limit: String(window.limit),
  }
  // [修复] metrics 走 Prometheus query_range 必须带 step：未显式指定时默认 60s，
  // 否则返回 HTTP 400 "cannot parse step"。其他类型无需 step。
  if (type === 'metrics' && params.step === undefined) params.step = '60s'
  if (query !== '') params.query = query
  const options: HttpCallOptions = {
    // 查询路径（按类型默认或用户自定义）拼在 base URL 之后；空串时即 base 本身。
    url: appendQueryPath(config.url, config.queryPath),
    params,
    auth: config.auth,
    timeoutMs: config.timeoutMs ?? runtime.defaultTimeoutMs,
    maxResponseBytes: runtime.maxResponseBytes,
    signal,
    label: `${dataSourceLabel(type)}查询(${config.name})`,
  }
  const outcome = await callDataSource(type as DataSourceType, options)
  if (!outcome.ok) return outcome
  // [修复] 工具框架要求 lossless JSON：对 value 做最终验证，
  // 若 sanitizeJson 仍有遗漏（如嵌套非 plain 对象），返回结构化错误而非框架报错。
  try {
    const count = inferCount(outcome.value)
    return count === undefined ? { ...outcome } : { ...outcome, count }
  } catch (error) {
    return {
      source: type as DataSourceType,
      ok: false,
      code: 'INVALID_RESPONSE',
      error: `数据源返回无法序列化为 lossless JSON 的结果：${error instanceof Error ? error.message : String(error)}`,
      truncated: false,
      value: null,
    }
  }
}

/** 从设置文档组装运行时上下文。 */
export function buildRuntime(settings: TroubleshootSettings, defaults: Pick<ToolRuntimeContext, 'defaultTimeoutMs' | 'maxResponseBytes' | 'maxConcurrency' | 'reportDir'>): ToolRuntimeContext {
  return {
    sources: sourcesFromSettings(settings),
    defaultTimeRangeMinutes: settings.defaultTimeRangeMinutes,
    maxResults: settings.maxResults,
    ...defaults,
  }
}

/** 注册全部工具。 */
export function registerTools(ctx: import('@deepseek-ai/cordis').Context, getRuntime: () => ToolRuntimeContext): void {
  // ---------- 1. troubleshoot_status ----------
  ctx.tools.register(defineTool({
    name: 'troubleshoot_status',
    description: '列出已配置的数据源（指标/日志/调用链/CMDB）及其状态，供排查开始前了解可用能力。绝不返回任何凭据。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                enabled: { type: 'boolean' },
                name: { type: 'string' },
                url: { type: 'string' },
                authType: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          defaultTimeRangeMinutes: { type: 'number' },
          maxResults: { type: 'number' },
          reportDirEnabled: { type: 'boolean' },
        },
      },
      render: (_args, value) => {
        const status = value as { sources: { type: string; name: string; url: string; enabled: boolean; authType: string }[]; defaultTimeRangeMinutes: number; maxResults: number; reportDirEnabled: boolean }
        const lines = status.sources.map(s => `- ${s.type}: ${s.enabled ? '已启用' : '未启用'} ${s.name || ''} (${s.url || '未配置URL'}, auth=${s.authType})`)
        return [{ type: 'text', text: ['当前数据源状态：', ...lines, `默认时间范围 ${status.defaultTimeRangeMinutes} 分钟，默认结果上限 ${status.maxResults}，报告落盘 ${status.reportDirEnabled ? '已开启' : '未开启'}`].join('\n') }]
      },
    },
    async execute(_args, exec) {
      const runtime = getRuntime()
      const sources = runtime.sources.all.map((config) => ({
        id: config.id,
        type: config.type,
        enabled: config.enabled,
        name: config.name,
        url: config.url,
        authType: config.auth.type,
        description: config.description,
      }))
      return {
        sources,
        defaultTimeRangeMinutes: runtime.defaultTimeRangeMinutes,
        maxResults: runtime.maxResults,
        reportDirEnabled: runtime.reportDir !== '',
      }
    },
  }))

  // ---------- 2..5. 四个单源查询工具（显式注册，output 内联以保留 schema 字面量类型） ----------

  /** 查询结果的模型可见渲染（共享）。 */
  function renderQueryOutcome(outcome: QueryOutcome): ContentBlock[] {
    const label = dataSourceLabel(outcome.source)
    if (!outcome.ok) {
      return [{ type: 'text', text: `${label}查询失败 [${outcome.code}]: ${outcome.error}` }]
    }
    const countLine = outcome.count === undefined ? '' : `（${outcome.count} 条）`
    const truncLine = outcome.truncated ? '；响应超过上限已截断' : ''
    const body = typeof outcome.value === 'string' ? outcome.value : JSON.stringify(outcome.value, null, 2)
    return [{ type: 'text', text: `${label}查询结果${countLine}${truncLine}:\n${String(body).slice(0, 20000)}` }]
  }

  /** 解析 extraParams 与各工具特有参数，追加到请求参数。 */
  function collectExtraParams(args: Record<string, unknown>): Record<string, string> {
    const extraParams: Record<string, string> = {}
    for (const [key, value] of Object.entries(args.extraParams ?? {})) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') extraParams[key] = String(value)
    }
    for (const key of ['step', 'filter', 'traceId', 'service', 'resource', 'region']) {
      const value = args[key]
      // 空/空白不追加；step 必须是合法 Prometheus 时长（如 30s / 5m / 1h），避免空 step 400
      if (typeof value === 'string' && value.trim() !== '') {
        const trimmed = value.trim()
        if (key === 'step' && !/^\d+(ms|s|m|h|d|w|y)$/.test(trimmed)) continue
        extraParams[key] = trimmed
      }
    }
    return extraParams
  }

  /** 查询工具的输出 schema（内联在 defineTool 中以保留字面量类型；此处仅类型）。 */
  const queryOutputSchema = {
    type: 'object' as const,
    additionalProperties: false as const,
    properties: {
      source: { type: 'string' as const },
      ok: { type: 'boolean' as const },
      code: { type: 'string' as const },
      error: { type: 'string' as const },
      truncated: { type: 'boolean' as const },
      count: { type: 'number' as const },
      value: { type: 'json' as const },
    },
  }

  ctx.tools.register(defineTool({
    name: 'query_metrics',
    description: '查询指标数据源（如 Prometheus / Thanos）。query 为指标查询表达式（PromQL 或数据源原生语法），支持时间范围与 step。',
    parameters: {
      query: { type: 'string', required: true, description: '指标查询表达式（PromQL 或数据源原生语法）' },
      ...timeRangeParams(),
      step: { type: 'string', description: '采样步长（如 30s / 5m），透传给数据源' },
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value as QueryOutcome) },
    async execute(args, exec) {
      const runtime = getRuntime()
      const window = resolveWindow(args, runtime)
      return runQuery('metrics', runtime, window, (args.query ?? '').trim(), collectExtraParams(args as unknown as Record<string, unknown>), exec.signal, args.source)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'query_logs',
    description: '查询日志数据源（如 Loki / Elasticsearch / 自研日志平台）。query 为日志检索表达式，支持时间范围与过滤。',
    parameters: {
      query: { type: 'string', required: true, description: '日志检索表达式' },
      ...timeRangeParams(),
      filter: { type: 'string', description: '附加过滤条件（如 service=api, level=error），透传给数据源' },
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value as QueryOutcome) },
    async execute(args, exec) {
      const runtime = getRuntime()
      const window = resolveWindow(args, runtime)
      return runQuery('logs', runtime, window, (args.query ?? '').trim(), collectExtraParams(args as unknown as Record<string, unknown>), exec.signal, args.source)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'query_trace',
    description: '查询调用链（trace）数据源（如 Jaeger / Tempo / SkyWalking）。可按 traceId 查单条链路，或按 service 查一段时间的链路。',
    parameters: {
      query: { type: 'string', description: '查询表达式（可选；traceId/service 可用作更精确的检索条件）' },
      ...timeRangeParams(),
      traceId: { type: 'string', description: '链路 ID，精确查询单条 trace' },
      service: { type: 'string', description: '服务名过滤' },
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value as QueryOutcome) },
    async execute(args, exec) {
      const runtime = getRuntime()
      const window = resolveWindow(args, runtime)
      return runQuery('trace', runtime, window, (args.query ?? '').trim(), collectExtraParams(args as unknown as Record<string, unknown>), exec.signal, args.source)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'query_knowledge',
    description: '查询知识库（KB）数据源。query 为检索表达式（关键词/语义检索），支持时间范围过滤（若知识库按时间分片）与结果条数限制。用于故障排查时检索同类故障的处置经验与历史工单。',
    parameters: {
      query: { type: 'string', required: true, description: '检索表达式（关键词或自然语言查询）' },
      ...timeRangeParams(),
      filter: { type: 'string', description: '附加过滤条件（如 category=incident, service=api），透传给数据源' },
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value as QueryOutcome) },
    async execute(args, exec) {
      const runtime = getRuntime()
      const window = resolveWindow(args, runtime)
      return runQuery('knowledge', runtime, window, (args.query ?? '').trim(), collectExtraParams(args as unknown as Record<string, unknown>), exec.signal, args.source)
    },
  }))

  ctx.tools.register(defineTool({
    name: 'query_cmdb',
    description: '查询 CMDB 变更历史数据源。用于故障时段内该资源/区域是否有变更发布。resource 为目标资源名，region 为区域/环境过滤。',
    parameters: {
      query: { type: 'string', description: '查询表达式（可选）' },
      ...timeRangeParams(),
      resource: { type: 'string', description: '目标资源/应用名' },
      region: { type: 'string', description: '区域或环境' },
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value as QueryOutcome) },
    async execute(args, exec) {
      const runtime = getRuntime()
      const window = resolveWindow(args, runtime)
      return runQuery('cmdb', runtime, window, (args.query ?? '').trim(), collectExtraParams(args as unknown as Record<string, unknown>), exec.signal, args.source)
    },
  }))

  // ---------- 6. troubleshoot_evidence（多源并行取证） ----------
  ctx.tools.register(defineTool({
    name: 'troubleshoot_evidence',
    description: '按需补充证据：对多个已配置数据源并行执行查询，汇总一次返回。用于排查过程中需要同一时间窗内的指标+日志+调用链+变更证据时。',
    parameters: {
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: '要查询的数据源名称或类型子集（缺省 = 所有已启用的源；可用 troubleshoot_status 查看）',
      },
      queries: {
        type: 'object',
        additionalProperties: true,
        description: '各源的查询表达式：{ metrics?: string, logs?: string, trace?: string, cmdb?: string }',
      },
      start: { type: 'string', description: '起始时间，ISO-8601 或毫秒时间戳' },
      end: { type: 'string', description: '结束时间，ISO-8601 或毫秒时间戳' },
      rangeMinutes: { type: 'number', description: '时间范围（分钟），未给 start/end 时生效' },
      limitPerSource: { type: 'number', description: '每源结果上限；默认取设置值 maxResults' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          window: { type: 'object', additionalProperties: true },
          collected: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                source: { type: 'string' },
                ok: { type: 'boolean' },
                code: { type: 'string' },
                error: { type: 'string' },
                truncated: { type: 'boolean' },
                count: { type: 'number' },
                value: { type: 'json' },
              },
            },
          },
        },
      },
      render: (_args, value) => {
        const data = value as { window: { start: string; end: string }; collected: QueryOutcome[] }
        const lines = data.collected.map((outcome) => {
          const label = dataSourceLabel(outcome.source)
          if (!outcome.ok) return `- ${label}: 失败 [${outcome.code}] ${outcome.error}`
          const count = outcome.count === undefined ? '' : `，${outcome.count} 条`
          return `- ${label}: 成功${count}${outcome.truncated ? '（截断）' : ''}`
        })
        return [{ type: 'text', text: [`取证窗口 ${data.window.start} ~ ${data.window.end}：`, ...lines].join('\n') }]
      },
    },
    async execute(args, exec) {
      const runtime = getRuntime()
      const window = resolveTimeRange(args.start, args.end, args.rangeMinutes ?? runtime.defaultTimeRangeMinutes)
      // sources 条目：数据源名称或类型；缺省 = 所有已启用的源。
      const requested: string[] = Array.isArray(args.sources) && args.sources.length > 0
        ? (args.sources as string[]).map(String)
        : runtime.sources.all.filter(config => config.enabled).map(config => config.name)
      const queries = (args.queries ?? {}) as Record<string, string>
      const limit = Math.min(Math.max(Math.trunc(args.limitPerSource ?? runtime.maxResults), 1), 5000)
      const qWindow = { start: window.start, end: window.end, limit, rangeMinutes: args.rangeMinutes ?? runtime.defaultTimeRangeMinutes }

      // 有界并发：把源分组成不超过 maxConcurrency 的批次，串行执行批次。
      const batches: string[][] = []
      for (let i = 0; i < requested.length; i += runtime.maxConcurrency) {
        batches.push(requested.slice(i, i + runtime.maxConcurrency))
      }
      const collected: QueryOutcome[] = []
      for (const batch of batches) {
        const outcomes = await Promise.all(batch.map(async (selector) => {
          // 查询表达式键：优先按名称匹配，其次按类型匹配。
          const byName = runtime.sources.byName.get(selector)
          const type = byName !== undefined ? byName.type : selector
          const query = (queries[selector] ?? queries[type] ?? '').trim()
          return runQuery(type, runtime, qWindow, query, undefined, exec.signal, selector)
        }))
        collected.push(...outcomes)
      }
      return {
        window: { start: toIso(window.start), end: toIso(window.end) },
        collected,
      }
    },
  }))

  // ---------- 7. generate_fault_report（故障报告生成） ----------
  ctx.tools.register(defineTool({
    name: 'generate_fault_report',
    description: '基于已收集的证据生成结构化故障报告（Markdown）。填写现象、影响、时间线、各源证据摘要、根因与处置建议；writeFile 为 true 且已配置 reportDir 时写入文件。',
    parameters: {
      title: { type: 'string', required: true, description: '故障标题' },
      symptoms: { type: 'string', required: true, description: '故障现象描述' },
      impact: { type: 'string', description: '影响范围与用户影响' },
      start: { type: 'string', description: '故障起始时间' },
      end: { type: 'string', description: '故障结束/观测时间' },
      timeline: { type: 'array', items: { type: 'string' }, description: '关键时间线条目' },
      evidence: { type: 'array', items: { type: 'string' }, description: '证据摘要（指标/日志/调用链/变更结论，来自各查询工具的结果）' },
      rootCause: { type: 'string', description: '根因分析结论' },
      resolution: { type: 'string', description: '处置过程与结果' },
      recommendations: { type: 'array', items: { type: 'string' }, description: '后续建议' },
      writeFile: { type: 'boolean', description: '写入报告文件（需插件配置 reportDir）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          report: { type: 'string' },
          written: { type: 'boolean' },
          path: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const data = value as { report: string; written: boolean; path?: string; error?: string }
        const lines = [data.report]
        if (data.written) lines.push(`\n[报告已写入: ${data.path}]`)
        if (data.error !== undefined) lines.push(`\n[落盘失败: ${data.error}]`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const runtime = getRuntime()
      const startIso = args.start ?? ''
      const endIso = args.end ?? ''
      const section = (heading: string, body: string | undefined): string => {
        if (body === undefined || body === '') return ''
        return `## ${heading}\n\n${body}\n`
      }
      const listSection = (heading: string, items: string[] | undefined): string => {
        if (items === undefined || items.length === 0) return ''
        return `## ${heading}\n\n${items.map(item => `- ${item}`).join('\n')}\n`
      }
      const report = [
        '# ' + args.title,
        '',
        '> 本报告由故障排查助手基于数据源证据自动生成（时间窗口：' + (startIso || '未知') + ' ~ ' + (endIso || '未知') + '）',
        '',
        section('故障现象', args.symptoms),
        section('影响范围', args.impact),
        listSection('时间线', args.timeline),
        listSection('证据', args.evidence),
        section('根因分析', args.rootCause),
        section('处置与恢复', args.resolution),
        listSection('后续建议', args.recommendations),
      ].join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'

      if (args.writeFile !== true || runtime.reportDir === '') {
        return { report, written: false }
      }
      // 落盘：路径必须位于 reportDir 之下（防目录穿越），文件权限 0600。
      try {
        const root = resolve(runtime.reportDir)
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const filename = `fault-report-${stamp}.md`
        const target = resolve(root, filename)
        if (!target.startsWith(root + '/') && target !== root) {
          throw new Error('resolved report path escapes reportDir')
        }
        await mkdir(root, { recursive: true })
        await writeFile(target, report, { encoding: 'utf8', mode: 0o600 })
        return { report, written: true, path: target }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { report, written: false, error: `REPORT_WRITE_FAILED: ${message}` }
      }
    },
  }))
}
