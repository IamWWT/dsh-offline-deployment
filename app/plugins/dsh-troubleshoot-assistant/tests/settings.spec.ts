/**
 * settings 模块单元测试：时间范围解析、数据源条目组装（dataSources 数组模型）、
 * 索引构建与 schema 默认值。
 * 运行：node --test tests/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  entryToDataSource, newDataSourceId, resolveTimeRange,
  sourcesFromSettings, toIso, TroubleshootSettingsSchema,
} from '../src/settings.ts'
import type { DataSourceEntry, TroubleshootSettings } from '../src/settings.ts'

/** 构造一个最小数据源条目（其余字段取默认）。 */
function entry(overrides: Partial<DataSourceEntry> = {}): DataSourceEntry {
  return {
    id: newDataSourceId(), type: 'metrics', enabled: true, name: '', url: '',
    authType: 'none', token: '', username: '', password: '', headerName: 'Authorization',
    queryPath: '', timeoutMs: 0, description: '',
    ...overrides,
  }
}

/** 构造一份 settings 文档。 */
function settings(entries: DataSourceEntry[], overrides: Partial<TroubleshootSettings> = {}): TroubleshootSettings {
  return { dataSources: entries, defaultTimeRangeMinutes: 60, maxResults: 200, ...overrides }
}

// ---------------- resolveTimeRange ----------------

test('resolveTimeRange: 未给时间时按 rangeMinutes 回退', () => {
  const now = Date.parse('2026-01-01T00:00:00Z')
  const range = resolveTimeRange(undefined, undefined, 30, now)
  assert.equal(range.end, now)
  assert.equal(range.start, now - 30 * 60_000)
})

test('resolveTimeRange: 接受 ISO 字符串与毫秒时间戳', () => {
  const startIso = resolveTimeRange('2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z', 60, 0)
  assert.equal(startIso.start, Date.parse('2026-01-01T00:00:00Z'))
  assert.equal(startIso.end, Date.parse('2026-01-01T01:00:00Z'))
  const ms = resolveTimeRange(1_700_000_000_000, 1_700_000_360_000, 60, 0)
  assert.equal(ms.start, 1_700_000_000_000)
  assert.equal(ms.end, 1_700_000_360_000)
})

test('resolveTimeRange: 只给 start 时 end 取 now，start 对齐 end 前移', () => {
  const now = Date.parse('2026-01-01T02:00:00Z')
  const range = resolveTimeRange('2026-01-01T00:00:00Z', undefined, 60, now)
  assert.equal(range.start, Date.parse('2026-01-01T00:00:00Z'))
  assert.equal(range.end, now)
})

test('resolveTimeRange: 非法时间抛 TypeError', () => {
  assert.throws(() => resolveTimeRange('not-a-date', undefined, 60, 0), TypeError)
  assert.throws(() => resolveTimeRange(-1, undefined, 60, 0), TypeError)
  assert.throws(() => resolveTimeRange(Infinity, undefined, 60, 0), TypeError)
  assert.throws(() => resolveTimeRange('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z', 60, 0), /must be before end/)
})

// ---------------- entryToDataSource ----------------

test('entryToDataSource: 空 URL（含纯空白）返回 undefined', () => {
  assert.equal(entryToDataSource(entry({ url: '' })), undefined)
  assert.equal(entryToDataSource(entry({ url: '   ' })), undefined)
})

test('entryToDataSource: 预设类型取默认查询路径，name 空时回退中文标签', () => {
  const source = entryToDataSource(entry({ url: 'https://prom.example.com', token: 'env:OBS_TOKEN' }))
  assert.ok(source !== undefined)
  assert.equal(source?.url, 'https://prom.example.com')
  assert.equal(source?.queryPath, '/api/v1/query_range')
  assert.equal(source?.name, '指标')
  assert.equal(source?.auth.type, 'none')
  assert.equal(source?.auth.token, 'env:OBS_TOKEN') // env 引用原样保留，调用时解析
})

test('entryToDataSource: 各预设类型默认查询路径正确', () => {
  const cases: Array<[string, string]> = [
    ['metrics', '/api/v1/query_range'],
    ['logs', '/search'],
    ['trace', '/api/v1/traces'],
    ['cmdb', '/api/v1/changes'],
    ['knowledge', '/api/v1/search'],
  ]
  for (const [type, path] of cases) {
    const source = entryToDataSource(entry({ type, url: 'https://x.example.com' }))
    assert.equal(source?.queryPath, path, `type=${type}`)
  }
})

test('entryToDataSource: 自定义类型无默认路径（空串）', () => {
  const source = entryToDataSource(entry({ type: 'my-es', url: 'https://es.example.com' }))
  assert.equal(source?.queryPath, '')
  assert.equal(source?.name, 'my-es') // 非预设类型 name 回退为类型名
})

test('entryToDataSource: 自定义查询路径与超时生效；timeoutMs=0 不产生字段', () => {
  const custom = entryToDataSource(entry({
    type: 'trace', url: 'https://trace.example.com', queryPath: '/custom/path', timeoutMs: 5000, name: '  ',
  }))
  assert.equal(custom?.queryPath, '/custom/path')
  assert.equal(custom?.timeoutMs, 5000)
  const inherited = entryToDataSource(entry({ url: 'https://trace.example.com', timeoutMs: 0 }))
  assert.equal(inherited?.timeoutMs, undefined)
  assert.ok(!('timeoutMs' in (inherited as object)))
})

test('entryToDataSource: 认证字段完整组装，headerName 空时回退 Authorization', () => {
  const basic = entryToDataSource(entry({
    type: 'logs', url: 'https://logs.example.com', authType: 'basic', username: 'ops', password: 'env:LOGS_PASSWORD',
  }))
  assert.equal(basic?.auth.type, 'basic')
  assert.equal(basic?.auth.username, 'ops')
  assert.equal(basic?.auth.password, 'env:LOGS_PASSWORD')
  assert.equal(basic?.auth.headerName, 'Authorization')
  const header = entryToDataSource(entry({
    type: 'logs', url: 'https://logs.example.com', authType: 'header', token: 'tk', headerName: '',
  }))
  assert.equal(header?.auth.type, 'header')
  assert.equal(header?.auth.headerName, 'Authorization')
})

// ---------------- sourcesFromSettings ----------------

test('sourcesFromSettings: 空文档 → 空集合', () => {
  const sources = sourcesFromSettings(settings([]))
  assert.equal(sources.all.length, 0)
  assert.equal(sources.byId.size, 0)
  assert.equal(sources.byName.size, 0)
  assert.equal(sources.byType.size, 0)
})

test('sourcesFromSettings: 空 URL 条目被跳过，不进入任何索引', () => {
  const sources = sourcesFromSettings(settings([
    entry({ url: '' }),
    entry({ type: 'logs', url: 'https://logs.example.com' }),
  ]))
  assert.equal(sources.all.length, 1)
  assert.equal(sources.all[0]?.type, 'logs')
})

test('sourcesFromSettings: byType 只收启用条目；停用条目仍在 all/byId/byName', () => {
  const on = entry({ type: 'metrics', url: 'https://prom.example.com', name: '主指标' })
  const off = entry({ type: 'metrics', url: 'https://prom2.example.com', name: '备用', enabled: false })
  const sources = sourcesFromSettings(settings([on, off]))
  assert.equal(sources.all.length, 2)
  assert.equal(sources.byId.get(on.id)?.name, '主指标')
  assert.equal(sources.byId.get(off.id)?.enabled, false)
  assert.equal(sources.byName.get('备用')?.id, off.id)
  const metrics = sources.byType.get('metrics')
  assert.ok(metrics !== undefined)
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0]?.id, on.id)
})

test('sourcesFromSettings: 同类型多个启用条目全部进入 byType 列表', () => {
  const a = entry({ type: 'logs', url: 'https://a.example.com', name: '应用日志' })
  const b = entry({ type: 'logs', url: 'https://b.example.com', name: '网关日志' })
  const sources = sourcesFromSettings(settings([a, b]))
  assert.equal(sources.byType.get('logs')?.length, 2)
})

test('sourcesFromSettings: dataSources 缺失（非数组）时安全回退为空', () => {
  const sources = sourcesFromSettings({ defaultTimeRangeMinutes: 60, maxResults: 200 } as TroubleshootSettings)
  assert.equal(sources.all.length, 0)
})

// ---------------- schema 默认值（Standard Schema 规范：~standard.validate） ----------------

/** schemastery schema 的 Standard Schema 校验入口（成功 → { value }，失败 → { issues }）。 */
function validateSchema(input: unknown): { value?: TroubleshootSettings; issues?: readonly unknown[] } {
  const std = (TroubleshootSettingsSchema as unknown as { '~standard': { validate: (v: unknown) => { value?: TroubleshootSettings; issues?: readonly unknown[] } } })['~standard']
  return std.validate(input)
}

test('TroubleshootSettingsSchema: 空文档解析出全部默认值', () => {
  const result = validateSchema({})
  assert.ok(result.issues === undefined, `不应有校验问题: ${JSON.stringify(result.issues)}`)
  assert.deepEqual(result.value?.dataSources, [])
  assert.equal(result.value?.defaultTimeRangeMinutes, 60)
  assert.equal(result.value?.maxResults, 200)
})

test('TroubleshootSettingsSchema: 条目默认值（enabled=false / authType=none / headerName）', () => {
  const result = validateSchema({
    dataSources: [{ id: 'ds-1', type: 'metrics', name: 'm', url: 'https://m.example.com' }],
  })
  assert.ok(result.issues === undefined, `不应有校验问题: ${JSON.stringify(result.issues)}`)
  const ds = result.value?.dataSources[0]
  assert.ok(ds !== undefined)
  assert.equal(ds.enabled, false)
  assert.equal(ds.authType, 'none')
  assert.equal(ds.headerName, 'Authorization')
  assert.equal(ds.queryPath, '')
  assert.equal(ds.timeoutMs, 0)
})

test('TroubleshootSettingsSchema: 越界值被拒绝（timeoutMs 上限 / maxResults 下限）', () => {
  const badTimeout = validateSchema({
    dataSources: [{ id: 'ds-1', type: 'metrics', name: 'm', url: 'https://m.example.com', timeoutMs: 999999 }],
  })
  assert.ok(badTimeout.issues !== undefined && badTimeout.issues.length > 0)
  const badMax = validateSchema({ maxResults: 0 })
  assert.ok(badMax.issues !== undefined && badMax.issues.length > 0)
})

test('newDataSourceId: 格式与唯一性', () => {
  const a = newDataSourceId()
  const b = newDataSourceId()
  assert.match(a, /^ds-[a-z0-9]+-[a-z0-9]+$/)
  assert.notEqual(a, b)
})

// ---------------- toIso ----------------

test('toIso: 输出 ISO-8601', () => {
  assert.equal(toIso(Date.parse('2026-01-01T00:00:00Z')), '2026-01-01T00:00:00.000Z')
})
