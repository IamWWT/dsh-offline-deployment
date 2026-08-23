/**
 * @module @dsh-tools/troubleshoot-assistant/export
 *
 * 数据源批量导出 / 导入模板（Host 半，注册 dsh web 只读路由）：
 *   - GET /api/troubleshoot/export    导出当前数据源配置为 JSON（可再导入）；
 *   - GET /api/troubleshoot/template  下载导入模板（含逐字段说明与示例条目）。
 *
 * 安全契约：
 * - token/password 在 settings 文档中为 role('secret')，wire 上对 Web 脱敏；
 *   导出端点在 Host 侧运行、能读到原值，但只放行 "env:<NAME>" 引用（环境变量名，
 *   非机密）；字面量明文一律掩码为空串——导出文件永不包含明文凭据。
 * - 导入端（客户端 controller）对 secret 字段遵循"空 = 保留现有值"，
 *   与卡片"留空不修改"语义一致，避免再导入导出文件时误清空已存 secret。
 * - 路由仅 GET、只读、无写入；dsh web 仅监听 127.0.0.1，访问面与设置页一致。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TroubleshootSettings } from './settings.ts'

/** env 引用格式（与 http.ts resolveCredential 一致）。 */
const ENV_REF = /^env:[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 掩码一个 secret 字段：env 引用原样保留，其余（含空串）一律返回空串。
 * @param value - 文档中存储的原始值。
 * @returns 可安全导出的值。
 */
export function maskSecret(value: string): string {
  return ENV_REF.test(value) ? value : ''
}

/** 导出文档结构（与导入解析器对齐；version 供未来格式演进）。 */
export interface ExportDocument {
  version: 1
  exportedAt: string
  note: string
  dataSources: Record<string, unknown>[]
  defaultTimeRangeMinutes: number
  maxResults: number
}

/**
 * 由 settings 文档构建导出文档（纯函数，可单测）。
 * @param settings - "troubleshoot" 命名空间的完整文档。
 * @param now - 当前时间（毫秒），测试可注入。
 * @returns 导出文档（JSON 可序列化）。
 */
export function buildExportDocument(settings: TroubleshootSettings, now: number = Date.now()): ExportDocument {
  const entries = Array.isArray(settings.dataSources) ? settings.dataSources : []
  return {
    version: 1,
    exportedAt: new Date(now).toISOString(),
    note: '故障排查助手数据源导出。token/password 仅保留 env:环境变量名 引用，字面量已掩码为空；导入时空 secret 表示保留现有值。以 _ 开头的键为说明，可忽略。',
    dataSources: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      enabled: entry.enabled,
      name: entry.name,
      url: entry.url,
      authType: entry.authType,
      token: maskSecret(entry.token),
      username: entry.username,
      password: maskSecret(entry.password),
      headerName: entry.headerName,
      queryPath: entry.queryPath,
      timeoutMs: entry.timeoutMs,
      description: entry.description,
    })),
    defaultTimeRangeMinutes: settings.defaultTimeRangeMinutes,
    maxResults: settings.maxResults,
  }
}

/** 导入模板（含逐字段说明与三类示例条目；_ 前缀键为说明，导入时忽略）。 */
export function buildTemplate(): Record<string, unknown> {
  return {
    '_说明': {
      用途: '故障排查助手数据源导入模板。按示例改成你自己的数据源，保存为 .json 后在设置页点「导入 JSON」，检查无误再点「保存」生效。',
      导入规则: [
        'dataSources 数组里的每个对象是一个数据源；整个数组会被整体替换（文件里没有的现有条目将被删除，保存前可点「放弃」取消）。',
        'id 可省略（导入时自动生成），但同一文件内不要写重复的 id。',
        'token/password 支持两种写法：env:环境变量名（推荐，机密不落盘，导出/导入都会保留）；直接写明文（会写进配置文件，请妥善保管文件）。',
        '导入文件中 secret 留空 = 保留该数据源已存的 secret（与页面上"留空不修改"一致）。',
        '以 _ 开头的键（如本说明）导入时自动忽略。',
      ],
      字段说明: {
        type: '类型：metrics(指标) / logs(日志) / trace(调用链) / cmdb(CMDB变更历史) / knowledge(知识库)，或任意自定义字符串（如 es、clickhouse、grafana）。',
        enabled: '是否启用：true/false。停用后 agent 不会调用该源（配置仍保留）。',
        name: '展示名称，便于 agent 与你识别，建议填写（如"生产 Prometheus"）。',
        url: '数据源地址，仅支持 http:// 或 https://。认证信息不要写进 URL。',
        authType: '认证方式：none(无) / bearer(Bearer Token) / basic(用户名密码) / header(自定义请求头)。',
        token: 'bearer 的 Token 或 header 的请求头值。推荐 env:环境变量名（如 env:PROM_TOKEN），容器环境里配置该变量即可。',
        username: 'basic 认证的用户名（仅 authType=basic 时使用）。',
        password: 'basic 认证的密码，支持 env: 环境变量引用（仅 authType=basic 时使用）。',
        headerName: '自定义请求头的头名（仅 authType=header 时使用，默认 Authorization）。',
        queryPath: '查询路径，拼在 url 之后。留空使用类型默认路径（自定义类型留空则直接请求 base URL）。',
        timeoutMs: '单请求超时（毫秒），0 或省略 = 继承插件默认（15000）。',
        description: '该源的查询语法/用途说明，会展示给 agent，建议填写（如"PromQL 查询，常用指标 http_requests_total"）。',
      },
      全局默认: {
        defaultTimeRangeMinutes: '未指定时间范围时的查询窗口（分钟），默认 60。',
        maxResults: '单次查询返回的最大条数（1-5000），默认 200。',
      },
    },
    dataSources: [
      {
        type: 'metrics',
        enabled: true,
        name: '生产 Prometheus',
        url: 'https://prometheus.example.com',
        authType: 'bearer',
        token: 'env:PROM_TOKEN',
        description: 'Prometheus 查询接口，支持 PromQL。示例：rate(http_requests_total[5m]) by (service)',
      },
      {
        type: 'logs',
        enabled: true,
        name: 'ES 应用日志',
        url: 'https://es.example.com:9200',
        authType: 'basic',
        username: 'elastic',
        password: 'env:ES_PASSWORD',
        queryPath: '/logs-*/_search',
        description: 'Elasticsearch 日志，ES query_string 语法；索引前缀 logs-，时间字段 @timestamp',
      },
      {
        type: 'clickhouse',
        enabled: false,
        name: 'ClickHouse 事件流（自定义类型示例）',
        url: 'http://ch.example.com:8123',
        authType: 'header',
        token: 'env:CH_TOKEN',
        headerName: 'X-CH-Token',
        timeoutMs: 15000,
        description: '自定义类型示例：SQL 查询，表 events，时间列 ts（Unix 秒）',
      },
    ],
    defaultTimeRangeMinutes: 60,
    maxResults: 200,
  }
}

/** 以 JSON 写出响应。 */
function sendJson(res: ServerResponse, status: number, body: unknown, filename?: string): void {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
    ...(filename !== undefined
      ? { 'content-disposition': `attachment; filename="${filename}"` }
      : {}),
  })
  res.end(payload)
}

/**
 * 注册数据源导出 / 模板下载路由（仅当 webServer 服务存在时）。
 * @param ctx - Cordis 上下文。
 * @param getSource - 返回最新 settings 文档（settings 服务就绪后自动切换为读用户文档）。
 */
export function registerExportRoute(ctx: Context, getSource: () => TroubleshootSettings): void {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/api/troubleshoot/export',
      handler: (_req: IncomingMessage, res: ServerResponse): void => {
        const doc = buildExportDocument(getSource())
        const stamp = doc.exportedAt.replace(/[:T]/g, '-').slice(0, 16)
        sendJson(res, 200, doc, `troubleshoot-datasources-${stamp}.json`)
      },
    }), 'troubleshoot-assistant: data source export route')

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/api/troubleshoot/template',
      handler: (_req: IncomingMessage, res: ServerResponse): void => {
        sendJson(res, 200, buildTemplate(), 'troubleshoot-datasources-template.json')
      },
    }), 'troubleshoot-assistant: import template route')
  })
}
