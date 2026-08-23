/**
 * Host 端导出/模板单测：
 * - maskSecret：env 引用放行、字面量掩码、畸形 env 掩码；
 * - buildExportDocument：结构、secret 掩码、全局默认值透传；
 * - buildTemplate：结构完整、示例条目字段合法、_ 前缀说明键存在。
 *
 * 运行：node --test tests/export.spec.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildExportDocument, buildTemplate, maskSecret } from '../src/export.ts'
import type { TroubleshootSettings } from '../src/settings.ts'

const NOW = Date.parse('2026-08-21T12:00:00.000Z')

test('maskSecret: env 引用原样保留', () => {
  assert.equal(maskSecret('env:PROM_TOKEN'), 'env:PROM_TOKEN')
  assert.equal(maskSecret('env:_X1'), 'env:_X1')
})

test('maskSecret: 字面量/畸形 env/空串一律掩码为空', () => {
  assert.equal(maskSecret('sk-literal-secret'), '')
  assert.equal(maskSecret('env:1bad-name'), '', 'env 名不合法 → 视为字面量掩码')
  assert.equal(maskSecret('env:'), '')
  assert.equal(maskSecret(''), '')
  assert.equal(maskSecret('env:PROM_TOKEN extra'), '', '尾部多余字符 → 掩码')
})

test('buildExportDocument: env 引用保留、字面量掩码、结构完整', () => {
  const settings: TroubleshootSettings = {
    dataSources: [
      { id: 'ds-1', type: 'metrics', enabled: true, name: 'A', url: 'https://a.example.com', authType: 'bearer', token: 'env:TOKEN_A', username: '', password: '', headerName: 'Authorization', queryPath: '', timeoutMs: 0, description: 'd1' },
      { id: 'ds-2', type: 'logs', enabled: false, name: 'B', url: 'https://b.example.com', authType: 'basic', token: '', username: 'u', password: 'literal-pw', headerName: 'Authorization', queryPath: '/x', timeoutMs: 5000, description: '' },
    ],
    defaultTimeRangeMinutes: 30,
    maxResults: 500,
  }
  const doc = buildExportDocument(settings, NOW)

  assert.equal(doc.version, 1)
  assert.equal(doc.exportedAt, new Date(NOW).toISOString())
  assert.equal(doc.dataSources.length, 2)
  assert.equal(doc.dataSources[0].token, 'env:TOKEN_A', 'env 引用保留')
  assert.equal(doc.dataSources[1].password, '', '字面量密码掩码')
  assert.equal(doc.dataSources[1].username, 'u', '非 secret 字段原样')
  assert.equal(doc.dataSources[1].timeoutMs, 5000)
  assert.equal(doc.defaultTimeRangeMinutes, 30)
  assert.equal(doc.maxResults, 500)
  assert.ok(doc.note.includes('env:'), 'note 应说明 env 引用保留策略')
})

test('buildExportDocument: 导出文件可直接被 JSON 序列化/再解析', () => {
  const settings: TroubleshootSettings = { dataSources: [], defaultTimeRangeMinutes: 60, maxResults: 200 }
  const doc = buildExportDocument(settings, NOW)
  const roundTrip = JSON.parse(JSON.stringify(doc))
  assert.deepEqual(roundTrip, doc)
})

test('buildTemplate: 结构完整且示例条目字段合法', () => {
  const template = buildTemplate()

  assert.ok(template['_说明'] !== undefined, '应含 _说明 键')
  const sources = template.dataSources as Record<string, unknown>[]
  assert.ok(Array.isArray(sources) && sources.length >= 3, '至少 3 个示例条目（预设/自定义）')
  for (const entry of sources) {
    assert.ok(typeof entry.type === 'string' && entry.type !== '', 'type 必填')
    assert.ok(typeof entry.url === 'string' && /^https?:\/\//.test(entry.url), 'url 须 http(s)')
    assert.ok(['none', 'bearer', 'basic', 'header'].includes(String(entry.authType)), 'authType 合法')
    assert.equal(typeof entry.enabled, 'boolean')
  }
  // 示例应覆盖 env: 引用写法
  assert.ok(sources.some(entry => String(entry.token ?? '').startsWith('env:') || String(entry.password ?? '').startsWith('env:')), '示例应展示 env: 引用')
  // 自定义类型示例
  assert.ok(sources.some(entry => !['metrics', 'logs', 'trace', 'cmdb', 'knowledge'].includes(String(entry.type))), '应含自定义类型示例')
  assert.equal(template.defaultTimeRangeMinutes, 60)
  assert.equal(template.maxResults, 200)
})
