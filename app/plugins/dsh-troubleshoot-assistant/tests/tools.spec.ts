/**
 * tools 模块集成测试：工具注册、数据源选择、查询管线（本地 HTTP 桩）、
 * 结果上限钳制、故障报告落盘（权限/路径）。
 * 运行：node --test tests/
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildRuntime, registerTools } from '../src/tools.ts'
import { newDataSourceId } from '../src/settings.ts'
import type { TroubleshootSettings } from '../src/settings.ts'
import type { ToolRuntimeContext } from '../src/types.ts'

/** 捕获 registerTools 注册的工具（假 cordis Context）。 */
function fakeCtx() {
  const tools = new Map<string, { name: string; execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }>()
  const ctx = {
    tools: {
      register: (tool: { name: string; execute: (args: unknown, exec: { signal: AbortSignal }) => Promise<unknown> }) => {
        tools.set(tool.name, tool)
      },
    },
  }
  return { ctx, tools }
}

/** 记录收到的请求（query 字符串）的 JSON 桩服务器。 */
function stubServer(handler: (req: IncomingMessage) => { status?: number; body: string }) {
  const seen: string[] = []
  const server = createServer((req, res) => {
    seen.push(req.url ?? '')
    const { status = 200, body } = handler(req)
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(body)
  })
  return {
    server,
    seen,
    listen: () => new Promise<void>(resolveP => server.listen(0, '127.0.0.1', () => resolveP())),
    url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  }
}

let reportDir: string
before(() => {
  reportDir = mkdtempSync(join(tmpdir(), 'fault-report-'))
})
after(() => {
  rmSync(reportDir, { recursive: true, force: true })
})

function makeRuntime(overrides: Partial<ToolRuntimeContext> = {}): ToolRuntimeContext {
  const settings: TroubleshootSettings = { dataSources: [], defaultTimeRangeMinutes: 60, maxResults: 200 }
  return buildRuntime(settings, {
    defaultTimeoutMs: 15000,
    maxResponseBytes: 2 * 1024 * 1024,
    maxConcurrency: 4,
    reportDir: '',
    ...overrides,
  })
}

test('registerTools: 注册全部 7 个工具', () => {
  const { ctx, tools } = fakeCtx()
  registerTools(ctx, () => makeRuntime())
  const names = [...tools.keys()].sort()
  assert.deepEqual(names, [
    'generate_fault_report', 'query_cmdb', 'query_knowledge', 'query_logs',
    'query_metrics', 'query_trace', 'troubleshoot_evidence', 'troubleshoot_status',
  ].sort())
})

test('troubleshoot_status: 列出数据源且绝不回显凭据', async () => {
  const settings: TroubleshootSettings = {
    dataSources: [{
      id: newDataSourceId(), type: 'metrics', enabled: true, name: '主指标',
      url: 'https://prom.example.com', authType: 'bearer', token: 'super-secret-token-123',
      username: '', password: '', headerName: 'Authorization', queryPath: '', timeoutMs: 0, description: 'prom',
    }],
    defaultTimeRangeMinutes: 30, maxResults: 100,
  }
  const { ctx, tools } = fakeCtx()
  registerTools(ctx, () => buildRuntime(settings, {
    defaultTimeoutMs: 15000, maxResponseBytes: 2 * 1024 * 1024, maxConcurrency: 4, reportDir: '/tmp/x',
  }))
  const result = (await tools.get('troubleshoot_status')?.execute({}, { signal: AbortSignal.timeout(5000) })) as {
    sources: { type: string; name: string; authType: string; url: string }[]
    defaultTimeRangeMinutes: number
    reportDirEnabled: boolean
  }
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0]?.name, '主指标')
  assert.equal(result.sources[0]?.authType, 'bearer')
  assert.equal(result.reportDirEnabled, true)
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes('super-secret-token-123'), 'status 输出不得包含 token')
})

test('query_metrics: 数据源未配置返回 SOURCE_NOT_CONFIGURED（不抛错）', async () => {
  const { ctx, tools } = fakeCtx()
  registerTools(ctx, () => makeRuntime())
  const result = (await tools.get('query_metrics')?.execute(
    { query: 'up' }, { signal: AbortSignal.timeout(5000) },
  )) as { ok: boolean; code: string; error: string }
  assert.equal(result.ok, false)
  assert.equal(result.code, 'SOURCE_NOT_CONFIGURED')
  assert.ok(result.error.length > 0)
})

test('query_metrics: 命中本地桩服务器，结果归一化且 limit 被钳制到 5000', async () => {
  const stub = stubServer(() => ({ body: JSON.stringify({ result: [{ a: 1 }, { a: 2 }, { a: 3 }] }) }))
  await stub.listen()
  try {
    const settings: TroubleshootSettings = {
      dataSources: [{
        id: newDataSourceId(), type: 'metrics', enabled: true, name: '本地指标',
        url: stub.url(), authType: 'none', token: '', username: '', password: '',
        headerName: 'Authorization', queryPath: '/api/v1/query_range', timeoutMs: 0, description: '',
      }],
      defaultTimeRangeMinutes: 60, maxResults: 200,
    }
    const { ctx, tools } = fakeCtx()
    registerTools(ctx, () => buildRuntime(settings, {
      defaultTimeoutMs: 15000, maxResponseBytes: 2 * 1024 * 1024, maxConcurrency: 4, reportDir: '',
    }))
    const result = (await tools.get('query_metrics')?.execute(
      { query: 'up', limit: 999999 }, { signal: AbortSignal.timeout(10000) },
    )) as { ok: boolean; count?: number; value: unknown }
    assert.equal(result.ok, true)
    assert.equal(result.count, 3)
    // limit 钳制：请求参数中 limit 应为 5000（上限）
    assert.ok(stub.seen.length === 1)
    assert.ok(stub.seen[0]?.includes('limit=5000'), `limit 未钳制: ${stub.seen[0]}`)
    assert.ok(stub.seen[0]?.includes('/api/v1/query_range'))
    assert.ok(stub.seen[0]?.includes('query=up'))
  } finally {
    stub.server.close()
  }
})

test('troubleshoot_evidence: 多源并行取证汇总（成功+未配置混合）', async () => {
  const stub = stubServer(() => ({ body: '[]' }))
  await stub.listen()
  try {
    const settings: TroubleshootSettings = {
      dataSources: [
        {
          id: newDataSourceId(), type: 'logs', enabled: true, name: '应用日志',
          url: stub.url(), authType: 'none', token: '', username: '', password: '',
          headerName: 'Authorization', queryPath: '/search', timeoutMs: 0, description: '',
        },
        {
          id: newDataSourceId(), type: 'trace', enabled: true, name: '链路',
          url: '', authType: 'none', token: '', username: '', password: '',
          headerName: 'Authorization', queryPath: '', timeoutMs: 0, description: '',
        },
      ],
      defaultTimeRangeMinutes: 60, maxResults: 200,
    }
    const { ctx, tools } = fakeCtx()
    registerTools(ctx, () => buildRuntime(settings, {
      defaultTimeoutMs: 15000, maxResponseBytes: 2 * 1024 * 1024, maxConcurrency: 4, reportDir: '',
    }))
    // trace 条目 URL 为空 → 组装时被跳过 → 选择器"链路"未命中任何启用源 → 未配置
    const result = (await tools.get('troubleshoot_evidence')?.execute(
      { sources: ['应用日志', '链路'] }, { signal: AbortSignal.timeout(10000) },
    )) as { window: { start: string; end: string }; collected: { source: string; ok: boolean; code?: string }[] }
    assert.equal(result.collected.length, 2)
    const logs = result.collected.find(o => o.source === 'logs')
    const missing = result.collected.find(o => o.source === '链路')
    assert.equal(logs?.ok, true)
    assert.equal(missing?.ok, false)
    assert.equal(missing?.code, 'SOURCE_NOT_CONFIGURED')
    assert.ok(result.window.start !== '')
  } finally {
    stub.server.close()
  }
})

test('generate_fault_report: 报告结构完整且 writeFile=false 不落盘', async () => {
  const { ctx, tools } = fakeCtx()
  registerTools(ctx, () => makeRuntime({ reportDir }))
  const result = (await tools.get('generate_fault_report')?.execute({
    title: 'API 服务 5xx 升高',
    symptoms: '14:00 起 5xx 比例升至 8%',
    impact: '约 2000 用户请求失败',
    timeline: ['14:00 告警触发', '14:05 定位到发布'],
    evidence: ['指标: 5xx 从 0.1% 升至 8%', '变更: 13:58 发布 v2.3.1'],
    rootCause: 'v2.3.1 引入空指针（已证实）',
    resolution: '回滚至 v2.3.0，5xx 恢复',
    recommendations: ['补充回归测试'],
    writeFile: false,
  }, { signal: AbortSignal.timeout(5000) })) as { report: string; written: boolean }
  assert.equal(result.written, false)
  assert.ok(result.report.startsWith('# API 服务 5xx 升高'))
  for (const heading of ['故障现象', '影响范围', '时间线', '证据', '根因分析', '处置与恢复', '后续建议']) {
    assert.ok(result.report.includes(`## ${heading}`), `缺少章节: ${heading}`)
  }
})

test('generate_fault_report: writeFile=true 时落盘到 reportDir，权限 0600，路径不逃逸', async () => {
  const { ctx, tools } = fakeCtx()
  registerTools(ctx, () => makeRuntime({ reportDir }))
  const result = (await tools.get('generate_fault_report')?.execute({
    title: '落盘测试', symptoms: '现象', writeFile: true,
  }, { signal: AbortSignal.timeout(5000) })) as { written: boolean; path?: string; error?: string }
  assert.equal(result.written, true, `落盘失败: ${result.error}`)
  assert.ok(result.path !== undefined)
  const root = resolve(reportDir)
  assert.ok(result.path?.startsWith(root + '/'), '报告必须落在 reportDir 之内')
  const mode = statSync(result.path as string).mode & 0o777
  assert.equal(mode, 0o600, `文件权限应为 0600，实际 ${mode.toString(8)}`)
})

test('generate_fault_report: reportDir 未配置时 writeFile 被忽略（不落盘）', async () => {
  const { ctx, tools } = fakeCtx()
  registerTools(ctx, () => makeRuntime({ reportDir: '' }))
  const result = (await tools.get('generate_fault_report')?.execute({
    title: '无目录', symptoms: '现象', writeFile: true,
  }, { signal: AbortSignal.timeout(5000) })) as { written: boolean; path?: string }
  assert.equal(result.written, false)
  assert.equal(result.path, undefined)
})
