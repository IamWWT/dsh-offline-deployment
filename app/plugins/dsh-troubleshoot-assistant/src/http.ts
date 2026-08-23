/**
 * @module @dsh-tools/troubleshoot-assistant/http
 *
 * 安全数据源 HTTP 客户端。安全与可靠要求：
 *
 * 1. URL 白名单：仅 http/https，拒绝内嵌 userinfo（user:pass@）、拒绝 hash；
 * 2. 全链路超时：AbortSignal.any([调用方 signal, AbortSignal.timeout(ms)])，
 *    任一触发即中止；
 * 3. 响应体字节上限：流式读取，超过即截断并取消，防 OOM / 防恶意大响应；
 * 4. 凭据防护：构建请求头后立即丢弃原文，任何错误信息/诊断一律不含凭据；
 *    redactText() 兜底把可能泄漏的机密替换为 ***；
 * 5. TLS 校验保持开启（Node/undici 默认），不支持关闭——内网自签证书请配置
 *    正确的 CA/系统信任，而不是降低校验强度；
 * 6. 结构化错误码：SOURCE_NOT_CONFIGURED / INVALID_URL / INVALID_SCHEME /
 *    MISSING_CREDENTIAL / TIMEOUT / RESPONSE_TOO_LARGE / HTTP_ERROR /
 *    INVALID_RESPONSE / NETWORK_ERROR。
 *
 * SSRF 说明：这是运维排障工具，数据源 URL 由部署者显式配置，必须能访问
 * 内网地址，因此不做域名白名单；网络安全由部署环境的网络策略负责。
 */

import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { AuthConfig, QueryOutcome, DataSourceType } from './types.ts'

/** 单请求的最大默认响应字节数（可由插件 Config 覆盖）。 */
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024

/** 结构化失败。 */
export class SourceRequestError extends Error {
  /** 稳定机器码。 */
  readonly code: string
  /** 状态码（HTTP_ERROR 时）。 */
  readonly status?: number

  /**
   * @param code - 稳定错误码。
   * @param message - 不含凭据的安全信息。
   * @param status - 可选 HTTP 状态码。
   */
  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'SourceRequestError'
    this.code = code
    this.status = status
  }
}

/** 解析一次凭据引用：字面量直接返回；"env:NAME" 从环境变量读取。 */
function resolveSecret(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  const envRef = /^env:(?<name>[A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed)
  if (envRef?.groups?.name !== undefined) {
    const fromEnv = process.env[envRef.groups.name]
    if (fromEnv === undefined || fromEnv === '') {
      throw new SourceRequestError('MISSING_CREDENTIAL', `${label} references env:${envRef.groups.name} but it is unset`)
    }
    return fromEnv
  }
  return trimmed
}

/**
 * 把请求参数拼进 URL（覆盖同名已有参数）。
 * @param base - 基础 URL（不含 query）。
 * @param params - 追加的查询参数。
 * @returns 完整 URL。
 */
export function buildUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

/**
 * 把查询路径拼接到基础 URL（路径级拼接，base 既有 query 保留，由 buildUrl 统一处理参数）。
 * @param base - 基础 URL（未校验也可传入；非法 URL 原样返回，交由 validateSourceUrl 报错）。
 * @param queryPath - 要追加的查询路径（如 /api/v1/query_range）；空串表示不修改。
 * @returns 拼接后的完整路径 URL。
 */
export function appendQueryPath(base: string, queryPath: string): string {
  const trimmed = queryPath.trim()
  if (trimmed === '') return base
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return base // 非法 base 由 validateSourceUrl 在后续统一报告
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const basePath = url.pathname.replace(/\/+$/, '')
  url.pathname = `${basePath}${path}`
  return url.toString()
}

/**
 * 校验并规范化数据源 URL。
 * @param raw - 用户配置的 URL。
 * @returns 规范化后的 URL 字符串。
 * @throws SourceRequestError 当协议非法、内嵌凭据或格式错误。
 */
export function validateSourceUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new SourceRequestError('INVALID_URL', 'data source URL is not a valid absolute URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SourceRequestError('INVALID_SCHEME', `data source URL scheme must be http or https, got "${url.protocol}"`)
  }
  if (url.username !== '' || url.password !== '') {
    throw new SourceRequestError('INVALID_URL', 'data source URL must not embed credentials; configure auth separately')
  }
  if (url.hash !== '') {
    throw new SourceRequestError('INVALID_URL', 'data source URL must not contain a fragment')
  }
  return url.toString().replace(/\/$/, '')
}

/**
 * 构建认证请求头（不会把凭据写进任何返回的诊断中）。
 * @param auth - 认证配置。
 * @param baseHeaders - 既有请求头。
 * @returns 携带认证信息的完整请求头。
 */
export function buildAuthHeaders(auth: AuthConfig, baseHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...baseHeaders }
  switch (auth.type) {
    case 'bearer': {
      const token = resolveSecret(auth.token, 'auth token')
      if (token !== '') headers.Authorization = `Bearer ${token}`
      break
    }
    case 'basic': {
      const username = resolveSecret(auth.username, 'auth username')
      const password = resolveSecret(auth.password, 'auth password')
      if (username !== '') {
        headers.Authorization = 'Basic ' + Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
      }
      break
    }
    case 'header': {
      const token = resolveSecret(auth.token, 'auth token')
      const headerName = auth.headerName.trim() || 'Authorization'
      if (token !== '') headers[headerName] = token
      break
    }
    case 'none':
      break
  }
  return headers
}

/** 收集可能泄漏的机密，供 redactText 兜底。 */
function collectSecrets(auth: AuthConfig): string[] {
  const secrets: string[] = []
  const push = (value: string): void => {
    const trimmed = value.trim()
    if (trimmed !== '' && !trimmed.startsWith('env:')) secrets.push(trimmed)
  }
  push(auth.token)
  push(auth.password)
  return secrets
}

/** 把机密文本替换为 ***（防御纵深：错误信息与诊断的兜底脱敏）。 */
export function redactText(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret.length >= 3) out = out.split(secret).join('***')
  }
  return out
}

/** 单次请求的完整参数。 */
export interface HttpCallOptions {
  /** 基础 URL（未校验前）。 */
  url: string
  /** 查询参数（GET 追加到 URL）。 */
  params: Record<string, string>
  /** 认证配置。 */
  auth: AuthConfig
  /** 额外请求头（非机密，来自插件 Config）。 */
  extraHeaders?: Record<string, string>
  /** 请求超时（毫秒）。 */
  timeoutMs: number
  /** 响应体字节上限。 */
  maxResponseBytes: number
  /** 调用方取消信号（工具的 exec.signal）。 */
  signal: AbortSignal
  /** 请求类型标签，用于错误信息（"指标查询"等）。 */
  label: string
}

/** 读取响应体并施加字节上限；超限即截断并取消读取。 */
async function readBoundedBody(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (res.body === null) return { text: '', truncated: false }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      if (total > maxBytes) {
        truncated = true
        // 只保留上限内的字节，随后取消读取。
        const keep = value.byteLength - (total - maxBytes)
        chunks.push(value.subarray(0, keep))
        break
      }
      chunks.push(value)
    }
  } finally {
    // 无论成功还是截断，都释放底层连接。
    reader.releaseLock()
    void res.body.cancel().catch(() => undefined)
  }
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder().decode(merged), truncated }
}

/** 尝试把响应文本解析为 JSON；失败时原样返回文本。 */
/**
 * 深度清洗任意 JSON 值，保证 dsh 工具框架的 lossless 要求：
 * - NaN / Infinity / -Infinity → 字符串（框架不接受非有限数）；
 * - 超出安全整数范围的大整数 → 字符串（保留精度）；
 * - undefined → null（框架不接受 undefined）；
 * - 递归处理数组与对象。
 */
export function sanitizeJson(value: unknown): unknown {
  if (typeof value === 'number') {
    // dsh 工具框架要求 lossless JSON：浮点数（如 Prometheus 时间戳 1787468374.075）在
    // JSON.parse/stringify 往返可能不精确 → 一律转字符串保留原样；整数安全范围保留数值。
    if (!Number.isFinite(value)) return String(value)
    if (!Number.isInteger(value)) return String(value)
    if (!Number.isSafeInteger(value)) return String(value)
    return value
  }
  if (typeof value === 'undefined') return null
  if (Array.isArray(value)) return value.map(sanitizeJson)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeJson(v)
    return out
  }
  return value
}

/**
/**（dsh 工具框架要求返回值不丢精度）：
 * - 超出安全整数范围的大整数（Prometheus 计数器等）→ 保留为字符串；
 * - 精度会丢失的浮点数 → 保留为字符串；
 * - 其余正常 JSON.parse；解析失败回退原文文本。
 */
function parseBody(text: string): unknown {
  try {
    return JSON.parse(text, (_key, value) => {
      if (typeof value === 'number') {
        // 整数超出安全范围：转为字符串保留精度
        if (Number.isInteger(value) && !Number.isSafeInteger(value)) return String(value)
        // 浮点：与原始文本比对，若 JSON.parse 后精度丢失则转字符串
        if (!Number.isInteger(value)) {
          const raw = String(value)
          if (raw === 'NaN' || raw === 'Infinity' || raw === '-Infinity') return raw
          // 用 toString 后的值反序列化对比，检测精度损失
          const reparsed = Number(raw)
          if (!Number.isNaN(reparsed) && reparsed !== value) return raw
        }
      }
      return value
    })
  } catch {
    return text
  }
}

/**
 * 执行一次数据源调用，返回规范化结果（不抛错；错误折叠进 QueryOutcome）。
 * @param type - 数据源类型（用于错误上下文）。
 * @param options - 请求参数。
 * @returns 规范化查询结果。
 */
export async function callDataSource(type: DataSourceType, options: HttpCallOptions): Promise<QueryOutcome> {
  const secrets = collectSecrets(options.auth)
  const failure = (error: unknown): QueryOutcome => {
    const message = error instanceof Error ? error.message : String(error)
    const code = error instanceof SourceRequestError ? error.code : 'NETWORK_ERROR'
    return {
      source: type,
      ok: false,
      code,
      error: redactText(message, secrets),
      truncated: false,
      value: null,
    }
  }

  let target: string
  try {
    target = buildUrl(validateSourceUrl(options.url), options.params)
  } catch (error) {
    return failure(error)
  }

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
  const combined = AbortSignal.any([options.signal, timeoutSignal])
  try {
    const headers = buildAuthHeaders(options.auth, options.extraHeaders)
    const res = await fetch(target, { method: 'GET', headers, signal: combined })
    const { text, truncated } = await readBoundedBody(res, options.maxResponseBytes)
    if (!res.ok) {
      const snippet = truncated ? text + '…(truncated)' : text
      throw new SourceRequestError(
        'HTTP_ERROR',
        `${options.label} returned HTTP ${res.status} ${res.statusText}: ${snippet.slice(0, 200)}`,
        res.status,
      )
    }
    return { source: type, ok: true, truncated, value: sanitizeJson(parseBody(text)) as JsonValue }
  } catch (error) {
    if (error instanceof SourceRequestError) return failure(error)
    // AbortError 需要区分调用方取消与超时。
    const aborted = options.signal.aborted ? 'CANCELLED' : 'TIMEOUT'
    if (aborted === 'CANCELLED') {
      throw error // 调用方取消：向上抛，由工具层按取消处理
    }
    return failure(new SourceRequestError('TIMEOUT', `${options.label} timed out after ${options.timeoutMs}ms`))
  }
}
