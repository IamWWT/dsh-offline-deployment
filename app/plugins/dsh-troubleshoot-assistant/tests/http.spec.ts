/**
 * http 模块单元测试：URL 校验、认证头、脱敏、超时、响应上限、HTTP 错误。
 * 运行：node --test tests/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  SourceRequestError, appendQueryPath, buildAuthHeaders, buildUrl, callDataSource, redactText, validateSourceUrl,
} from '../src/http.ts'
import type { AuthConfig } from '../src/types.ts'

const noAuth: AuthConfig = { type: 'none', token: '', username: '', password: '', headerName: 'Authorization' }

test('validateSourceUrl: 拒绝非 http/https、内嵌凭据、hash', () => {
  assert.equal(validateSourceUrl(' https://a.example.com/ '), 'https://a.example.com')
  assert.throws(() => validateSourceUrl('ftp://a.example.com'), SourceRequestError)
  assert.throws(() => validateSourceUrl('https://user:pass@a.example.com'), /must not embed credentials/)
  assert.throws(() => validateSourceUrl('https://a.example.com/#frag'), /must not contain a fragment/)
  assert.throws(() => validateSourceUrl('not a url'), SourceRequestError)
})

test('buildUrl: 追加查询参数并覆盖同名', () => {
  assert.equal(buildUrl('https://a.example.com/p?x=1', { y: '2' }), 'https://a.example.com/p?x=1&y=2')
  assert.equal(buildUrl('https://a.example.com/p?x=1', { x: '3' }), 'https://a.example.com/p?x=3')
})

test('appendQueryPath: 根路径/带路径 base 的拼接', () => {
  assert.equal(appendQueryPath('https://a.example.com', '/api/v1/query_range'), 'https://a.example.com/api/v1/query_range')
  assert.equal(appendQueryPath('https://a.example.com/prometheus', '/api/v1/query_range'), 'https://a.example.com/prometheus/api/v1/query_range')
  assert.equal(appendQueryPath('https://a.example.com/prometheus/', '/api/v1/query_range'), 'https://a.example.com/prometheus/api/v1/query_range')
})

test('appendQueryPath: 无前导斜杠自动补；空串/纯空白不修改', () => {
  assert.equal(appendQueryPath('https://a.example.com', 'api/v1/query_range'), 'https://a.example.com/api/v1/query_range')
  assert.equal(appendQueryPath('https://a.example.com/base', ''), 'https://a.example.com/base')
  assert.equal(appendQueryPath('https://a.example.com/base', '   '), 'https://a.example.com/base')
})

test('appendQueryPath: 非法 base 原样返回（交由 validateSourceUrl 报错）', () => {
  assert.equal(appendQueryPath('not a url', '/x'), 'not a url')
})

test('buildAuthHeaders: bearer / basic / header / env 引用', () => {
  const bearer = buildAuthHeaders({ ...noAuth, type: 'bearer', token: 'abc' })
  assert.equal(bearer.Authorization, 'Bearer abc')
  const basic = buildAuthHeaders({ ...noAuth, type: 'basic', username: 'u', password: 'p' })
  assert.equal(basic.Authorization, 'Basic ' + Buffer.from('u:p', 'utf8').toString('base64'))
  const header = buildAuthHeaders({ ...noAuth, type: 'header', token: 'k', headerName: 'X-API-Key' })
  assert.equal(header['X-API-Key'], 'k')
  process.env.TEST_OBS_TOKEN = 'from-env'
  try {
    const envBearer = buildAuthHeaders({ ...noAuth, type: 'bearer', token: 'env:TEST_OBS_TOKEN' })
    assert.equal(envBearer.Authorization, 'Bearer from-env')
  } finally {
    delete process.env.TEST_OBS_TOKEN
  }
  assert.throws(() => buildAuthHeaders({ ...noAuth, type: 'bearer', token: 'env:MISSING_VAR_XYZ' }), (error: unknown) => (error as SourceRequestError).code === 'MISSING_CREDENTIAL')
})

test('redactText: 替换机密为 ***，短机密跳过', () => {
  assert.equal(redactText('token is abcdef token', ['abcdef']), 'token is *** token')
  assert.equal(redactText('x', ['ab']), 'x') // 长度 <3 不替换，避免误伤
})

test('callDataSource: HTTP 错误返回结构化失败且不含凭据', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' })
    res.end('{"error":"upstream down"}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as AddressInfo
  try {
    const outcome = await callDataSource('metrics', {
      url: `http://127.0.0.1:${port}`,
      params: { query: 'up' },
      auth: { ...noAuth, type: 'bearer', token: 'supersecrettoken' },
      timeoutMs: 5000,
      maxResponseBytes: 1024 * 1024,
      signal: new AbortController().signal,
      label: '测试查询',
    })
    assert.equal(outcome.ok, false)
    assert.equal(outcome.code, 'HTTP_ERROR')
    assert.ok(outcome.error !== undefined)
    assert.ok(!outcome.error.includes('supersecrettoken'))
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('callDataSource: 响应体超上限被截断', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('a'.repeat(4096))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as AddressInfo
  try {
    const outcome = await callDataSource('logs', {
      url: `http://127.0.0.1:${port}`,
      params: {},
      auth: noAuth,
      timeoutMs: 5000,
      maxResponseBytes: 1024,
      signal: new AbortController().signal,
      label: '截断测试',
    })
    assert.equal(outcome.ok, true)
    assert.equal(outcome.truncated, true)
    assert.ok(String(outcome.value).length <= 1024)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('callDataSource: 超时返回 TIMEOUT', async () => {
  const server = createServer((_req, res) => {
    // 永远不响应；客户端超时触发。
    setTimeout(() => { res.writeHead(200); res.end('late') }, 5000).unref()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as AddressInfo
  try {
    const outcome = await callDataSource('cmdb', {
      url: `http://127.0.0.1:${port}`,
      params: {},
      auth: noAuth,
      timeoutMs: 200,
      maxResponseBytes: 1024,
      signal: new AbortController().signal,
      label: '超时测试',
    })
    assert.equal(outcome.ok, false)
    assert.equal(outcome.code, 'TIMEOUT')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('callDataSource: 调用方取消向上抛（AbortError 语义）', async () => {
  const server = createServer((_req, res) => {
    setTimeout(() => { res.writeHead(200); res.end('x') }, 5000).unref()
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as AddressInfo
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 100).unref()
    await assert.rejects(
      callDataSource('metrics', {
        url: `http://127.0.0.1:${port}`,
        params: {},
        auth: noAuth,
        timeoutMs: 10_000,
        maxResponseBytes: 1024,
        signal: controller.signal,
        label: '取消测试',
      }),
      (error: unknown) => controller.signal.aborted === true,
    )
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
