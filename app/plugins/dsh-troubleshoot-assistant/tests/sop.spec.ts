/**
 * sop 模块单元测试：三级解析（工作区 → 全局 → 内置）、截断、缓存失效、降级。
 * 运行：node --test tests/
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { clearSopCache, DEFAULT_SOP, resolveSopForWorkspace } from '../src/sop.ts'

const REL = '故障排查SOP.md'
let root: string
let wsA: string
let wsB: string
let globalFile: string

before(() => {
  root = mkdtempSync(join(tmpdir(), 'sop-test-'))
  wsA = join(root, 'ws-a')
  wsB = join(root, 'ws-b')
  globalFile = join(root, 'global-sop.md')
  mkdirSync(wsA)
  mkdirSync(wsB)
})

after(() => {
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  clearSopCache()
})

test('三级解析：工作区文件优先', () => {
  writeFileSync(join(wsA, REL), 'WS-A SOP')
  writeFileSync(globalFile, 'GLOBAL SOP')
  const r = resolveSopForWorkspace(wsA, REL, globalFile, 65536)
  assert.equal(r.source, 'workspace')
  assert.equal(r.text, 'WS-A SOP')
  assert.equal(r.path, join(wsA, REL))
})

test('三级解析：工作区无文件时回退全局文件', () => {
  writeFileSync(join(wsA, REL), 'WS-A SOP')
  writeFileSync(globalFile, 'GLOBAL SOP')
  const r = resolveSopForWorkspace(wsB, REL, globalFile, 65536)
  assert.equal(r.source, 'global-file')
  assert.equal(r.text, 'GLOBAL SOP')
  assert.equal(r.path, globalFile)
})

test('三级解析：两者皆无时回退内置默认', () => {
  const r = resolveSopForWorkspace(wsB, REL, join(root, 'not-exist.md'), 65536)
  assert.equal(r.source, 'builtin')
  assert.equal(r.text, DEFAULT_SOP)
  assert.ok(r.text.includes('【禁止（红线'))
})

test('三级解析：globalPath 为空串时跳过全局级', () => {
  writeFileSync(globalFile, 'GLOBAL SOP')
  const r = resolveSopForWorkspace(wsB, REL, '', 65536)
  assert.equal(r.source, 'builtin')
})

test('空文件视为缺失，继续降级', () => {
  writeFileSync(join(wsA, REL), '')
  writeFileSync(globalFile, 'GLOBAL SOP')
  const r = resolveSopForWorkspace(wsA, REL, globalFile, 65536)
  assert.equal(r.source, 'global-file')
})

test('超大文件被截断并标记 truncated', () => {
  const big = 'X'.repeat(200_000)
  writeFileSync(join(wsA, REL), big)
  const r = resolveSopForWorkspace(wsA, REL, '', 1024)
  assert.equal(r.source, 'workspace')
  assert.equal(r.truncated, true)
  assert.ok(r.text.length <= 1024)
})

test('缓存：文件未变时复用；内容变化（size 变）后失效重读', () => {
  const file = join(wsA, REL)
  writeFileSync(file, 'V1')
  const r1 = resolveSopForWorkspace(wsA, REL, '', 65536)
  assert.equal(r1.text, 'V1')
  // 同 size 内容变化无法靠 mtime/size 检测（文档已声明按 mtime+size 缓存）；
  // 追加使 size 变化 → 必须重读到新内容。
  appendFileSync(file, '-V2')
  const r2 = resolveSopForWorkspace(wsA, REL, '', 65536)
  assert.equal(r2.text, 'V1-V2')
})

test('不同工作区互不影响（各自文件各自生效）', () => {
  writeFileSync(join(wsA, REL), 'WS-A SOP')
  writeFileSync(join(wsB, REL), 'WS-B SOP')
  assert.equal(resolveSopForWorkspace(wsA, REL, '', 65536).text, 'WS-A SOP')
  assert.equal(resolveSopForWorkspace(wsB, REL, '', 65536).text, 'WS-B SOP')
})

test('cwd 为空/undefined 时直接跳过工作区级', () => {
  writeFileSync(globalFile, 'GLOBAL SOP')
  assert.equal(resolveSopForWorkspace(undefined, REL, globalFile, 65536).source, 'global-file')
  assert.equal(resolveSopForWorkspace('', REL, globalFile, 65536).source, 'global-file')
})
