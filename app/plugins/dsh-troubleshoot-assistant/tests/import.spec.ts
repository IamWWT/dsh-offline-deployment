/**
 * 客户端控制器导入/导出测试：
 * - importData：解析校验、整体替换式暂存（现有 id → 字段编辑；新 id → 新条目；
 *   缺失 id → 标记删除）、secret 空值保留现有值、全局默认值暂存、错误提示；
 * - exportData / fetchTemplate：Node 下无 fetch 目标 → 走本地兜底路径；
 * - 导入后 save 落库 / discard 取消，importInfo 随之清除。
 *
 * 运行：node --test tests/import.spec.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./client-runtime-mock.mjs', import.meta.url))

const { TroubleshootCardController } = await import('../src/client/controller.ts')

/** 最小 SettingsScope mock：持有 dataSources 文档，支持 getSnapshot/subscribe/set。 */
function mockScope(initial: Record<string, unknown> = {}) {
  let value: Record<string, unknown> = { ...initial }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => ({ status: 'ready' as const, value, writable: true, mode: 'host' as const, revision: 1 }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async (field: string, fieldValue: unknown) => { value = { ...value, [field]: fieldValue } },
    unset: async () => {},
    _value: () => value,
  }
}

/** save() 为 void（内部异步），等待一个微任务+定时器周期让落库完成。 */
async function tick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 5))
}

const DOC = {
  dataSources: [
    { id: 'ds-a', type: 'metrics', enabled: true, name: 'A', url: 'https://a.example.com', authType: 'bearer', token: 'env:OLD_TOKEN', username: '', password: '', headerName: 'Authorization', queryPath: '', timeoutMs: 0, description: '' },
    { id: 'ds-b', type: 'logs', enabled: false, name: 'B', url: 'https://b.example.com', authType: 'none', token: '', username: '', password: '', headerName: 'Authorization', queryPath: '', timeoutMs: 0, description: '' },
  ],
  defaultTimeRangeMinutes: 60,
  maxResults: 200,
}

test('import: 对象形态新条目 → 暂存为新条目，importInfo=pending', () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData(JSON.stringify({
    dataSources: [{ type: 'metrics', name: '新指标', url: 'https://new.example.com', authType: 'bearer', token: 'env:NEW_TOKEN' }],
  }))

  const snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.entries.length, 1, '导入后应有 1 条')
  assert.equal(snap.entries[0]?.name, '新指标')
  assert.equal(snap.entries[0]?.url, 'https://new.example.com')
  assert.equal(snap.entries[0]?.isNew, true, '新条目标记 isNew')
  assert.equal(snap.importInfo.kind, 'pending')
  assert.equal(snap.importInfo.count, 1)
  assert.ok(snap.dirty, '导入后应 dirty')
  controller.dispose()
})

test('import: 裸数组形态同样可用', () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData(JSON.stringify([{ type: 'logs', name: '日志', url: 'https://logs.example.com' }]))

  const snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.entries.length, 1)
  assert.equal(snap.entries[0]?.type, 'logs')
  assert.equal(snap.importInfo.kind, 'pending')
  controller.dispose()
})

test('import: 非法 JSON → error，暂存不变', () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData('这不是 JSON {')

  const snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.importInfo.kind, 'error')
  assert.ok(snap.importInfo.message.includes('JSON'))
  assert.equal(snap.entries.length, 0, '失败导入不产生条目')
  assert.equal(snap.dirty, false)
  controller.dispose()
})

test('import: URL 非 http(s) → error', () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData(JSON.stringify({ dataSources: [{ type: 'metrics', url: 'ftp://bad.example.com' }] }))

  const snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.importInfo.kind, 'error')
  assert.ok(snap.importInfo.message.includes('URL'))
  controller.dispose()
})

test('import: id 命中现有条目 → 字段编辑；secret 空值保留现有值；缺失条目标记删除', async () => {
  const scope = mockScope(structuredClone(DOC))
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  // 只导入 ds-a（token 留空 = 保留现有 env:OLD_TOKEN），ds-b 不在文件中 → 删除
  face.importData(JSON.stringify({
    dataSources: [{ id: 'ds-a', type: 'metrics', enabled: true, name: 'A改', url: 'https://a2.example.com', authType: 'bearer', token: '' }],
  }))

  let snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.entries.length, 1, 'ds-b 被标记删除，仅剩 ds-a')
  assert.equal(snap.entries[0]?.id, 'ds-a')
  assert.equal(snap.entries[0]?.name, 'A改')
  assert.equal(snap.importInfo.kind, 'pending')
  assert.ok(snap.importInfo.message.includes('删除 1 条'), '提示应说明将删除 1 条')

  // 落库：ds-a 的 token 必须保留 env:OLD_TOKEN（空 secret 不覆盖）
  face.save()
  await tick()
  const value = scope._value()
  const saved = (value.dataSources as Record<string, unknown>[]).find(entry => entry.id === 'ds-a')
  assert.ok(saved !== undefined, 'ds-a 应落库')
  assert.equal(saved?.token, 'env:OLD_TOKEN', '空 secret 导入不得清空已存值')
  assert.equal(saved?.name, 'A改')
  assert.equal((value.dataSources as Record<string, unknown>[]).length, 1, 'ds-b 已删除落库')
  snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.importInfo.kind, 'none', '保存后导入提示清除')
  assert.equal(snap.dirty, false)
  controller.dispose()
})

test('import: 文件中重复 id → 后者自动生成新 id', () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData(JSON.stringify({
    dataSources: [
      { id: 'ds-x', type: 'metrics', url: 'https://x1.example.com' },
      { id: 'ds-x', type: 'logs', url: 'https://x2.example.com' },
    ],
  }))

  const snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.entries.length, 2)
  const ids = snap.entries.map(entry => entry.id)
  assert.notEqual(ids[0], ids[1], '重复 id 应被去重（后者换新 id）')
  assert.ok(ids[0] === 'ds-x' || ids[1] === 'ds-x', '首个保留原 id')
  controller.dispose()
})

test('import: 缺省 id → 自动生成；缺省字段取默认值', () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData(JSON.stringify({ dataSources: [{ type: 'metrics', url: 'https://m.example.com' }] }))

  const snap = face.hooks.troubleshootCard.getSnapshot()
  const entry = snap.entries[0]
  assert.ok(entry?.id !== undefined && entry.id.startsWith('ds-'), '自动生成 id')
  assert.equal(entry?.enabled, true, '缺省 enabled=true')
  assert.equal(entry?.authType, 'none')
  assert.equal(entry?.headerName, 'Authorization')
  controller.dispose()
})

test('import: 全局默认值越界忽略、合法暂存', () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData(JSON.stringify({
    dataSources: [{ type: 'metrics', url: 'https://g.example.com' }],
    defaultTimeRangeMinutes: 30,
    maxResults: 999999, // 越界 → 忽略
  }))

  const snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.global.defaultTimeRangeMinutes, '30', '合法全局值已暂存')
  assert.equal(snap.global.maxResults, '200', '越界值忽略，保持现有')
  controller.dispose()
})

test('import → discard：文档不变，importInfo 清除', async () => {
  const scope = mockScope(structuredClone(DOC))
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  face.importData(JSON.stringify({ dataSources: [{ type: 'metrics', url: 'https://only.example.com' }] }))
  assert.equal(face.hooks.troubleshootCard.getSnapshot().importInfo.kind, 'pending')

  face.discard()
  await tick()
  const snap = face.hooks.troubleshootCard.getSnapshot()
  assert.equal(snap.importInfo.kind, 'none')
  assert.equal(snap.entries.length, 2, '放弃后恢复原 2 条')
  assert.equal((scope._value().dataSources as unknown[]).length, 2, '文档未被改动')
  controller.dispose()
})

test('exportData：无 fetch 目标时走本地兜底（secret 全空 + 兜底说明）', async () => {
  const scope = mockScope({
    dataSources: [{ id: 'ds-e', type: 'metrics', enabled: true, name: 'E', url: 'https://e.example.com', authType: 'bearer', token: 'env:E_TOKEN', username: '', password: '', headerName: 'Authorization', queryPath: '', timeoutMs: 0, description: '' }],
  })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  const text = await face.exportData()
  const doc = JSON.parse(text)
  assert.equal(doc.version, 1)
  assert.ok(doc.note.includes('兜底'), '兜底导出应带说明')
  assert.equal(doc.dataSources.length, 1)
  assert.equal(doc.dataSources[0].token, '', '兜底导出 secret 为空')
  assert.equal(doc.dataSources[0].url, 'https://e.example.com')
  controller.dispose()
})

test('fetchTemplate：无 fetch 目标时返回本地兜底模板', async () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const face = controller.inject()

  const text = await face.fetchTemplate()
  const doc = JSON.parse(text)
  assert.ok(Array.isArray(doc.dataSources) && doc.dataSources.length >= 1)
  assert.ok(doc['_说明'] !== undefined, '兜底模板应带说明')
  controller.dispose()
})
