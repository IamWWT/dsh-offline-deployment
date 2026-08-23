/**
 * 客户端控制器回归测试：reseed 时新建（未保存）数据源条目的 id 必须稳定。
 *
 * 背景 bug：reseed() 追加新建条目时若取 blankEntry() 的随机 id（而非暂存键），
 * 每次按键触发 reseed 都会换新 id，React 把条目当新节点卸载重建，输入框焦点丢失，
 * 表现为"新加的数据源打不进字"。
 *
 * 客户端 bundle 依赖浏览器 window.__ModuleLoader__，无法在 Node 直接 import；
 * 用 node:module register 注入 client-runtime-mock.mjs（内存版 createSnapshotStore），
 * 再动态 import 控制器。运行：node --test tests/controller.spec.ts
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

test('reseed: 新建条目 id 稳定 —— 连续编辑不重建、不产生重复条目', async () => {
  const scope = mockScope({ dataSources: [] })
  const controller = new TroubleshootCardController(scope as never)
  const store = controller.inject().hooks.troubleshootCard

  controller.addEntry()
  const first = store.getSnapshot().entries
  assert.equal(first.length, 1, '添加后应只有 1 条')
  const id1 = first[0]?.id
  assert.ok(id1 !== undefined && id1 !== '', '条目应有 id')

  // 模拟连续输入 3 个字符
  controller.editField(id1, 'url', 'h')
  let snap = store.getSnapshot()
  assert.equal(snap.entries.length, 1, '输入第 1 字后仍应 1 条（不重复）')
  assert.equal(snap.entries[0]?.id, id1, '输入第 1 字后 id 不变')
  assert.equal(snap.entries[0]?.url, 'h')

  controller.editField(id1, 'url', 'ht')
  snap = store.getSnapshot()
  assert.equal(snap.entries.length, 1, '输入第 2 字后仍应 1 条')
  assert.equal(snap.entries[0]?.id, id1, '输入第 2 字后 id 不变')
  assert.equal(snap.entries[0]?.url, 'ht')

  controller.editField(id1, 'url', 'https://prom.example.com')
  snap = store.getSnapshot()
  assert.equal(snap.entries.length, 1, '输入完整 URL 后仍应 1 条')
  assert.equal(snap.entries[0]?.id, id1, '输入完整 URL 后 id 不变')
  assert.equal(snap.entries[0]?.url, 'https://prom.example.com')
  controller.dispose()
})

test('reseed: 已存条目编辑后 id 同样稳定，且与新建条目互不干扰', async () => {
  const savedId = 'ds-saved-1'
  const scope = mockScope({
    dataSources: [{ id: savedId, type: 'metrics', enabled: true, name: '主指标', url: 'https://old.example.com' }],
  })
  const controller = new TroubleshootCardController(scope as never)
  const store = controller.inject().hooks.troubleshootCard

  // 编辑已存条目
  controller.editField(savedId, 'url', 'https://new.example.com')
  let snap = store.getSnapshot()
  assert.equal(snap.entries.length, 1)
  assert.equal(snap.entries[0]?.id, savedId, '已存条目 id 稳定')
  assert.equal(snap.entries[0]?.url, 'https://new.example.com')

  // 再加一条新的，两条共存且 id 各自稳定
  controller.addEntry()
  snap = store.getSnapshot()
  assert.equal(snap.entries.length, 2, '已存 + 新建 = 2 条')
  const ids = snap.entries.map(e => e.id).sort()
  assert.deepEqual(ids, [savedId, snap.entries.find(e => e.id !== savedId)?.id ?? ''].sort())
  const newId = snap.entries.find(e => e.id !== savedId)?.id
  assert.ok(newId !== undefined && newId !== savedId)
  controller.editField(newId, 'name', '备用')
  snap = store.getSnapshot()
  assert.equal(snap.entries.length, 2, '编辑新建条目后仍 2 条')
  assert.equal(snap.entries.find(e => e.id === newId)?.name, '备用')
  controller.dispose()
})
