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
import type { AuthConfig, QueryOutcome, DataSourceType } from './types.ts';
/** 单请求的最大默认响应字节数（可由插件 Config 覆盖）。 */
export declare const DEFAULT_MAX_RESPONSE_BYTES: number;
/** 结构化失败。 */
export declare class SourceRequestError extends Error {
    /** 稳定机器码。 */
    readonly code: string;
    /** 状态码（HTTP_ERROR 时）。 */
    readonly status?: number;
    /**
     * @param code - 稳定错误码。
     * @param message - 不含凭据的安全信息。
     * @param status - 可选 HTTP 状态码。
     */
    constructor(code: string, message: string, status?: number);
}
/**
 * 把请求参数拼进 URL（覆盖同名已有参数）。
 * @param base - 基础 URL（不含 query）。
 * @param params - 追加的查询参数。
 * @returns 完整 URL。
 */
export declare function buildUrl(base: string, params: Record<string, string>): string;
/**
 * 把查询路径拼接到基础 URL（路径级拼接，base 既有 query 保留，由 buildUrl 统一处理参数）。
 * @param base - 基础 URL（未校验也可传入；非法 URL 原样返回，交由 validateSourceUrl 报错）。
 * @param queryPath - 要追加的查询路径（如 /api/v1/query_range）；空串表示不修改。
 * @returns 拼接后的完整路径 URL。
 */
export declare function appendQueryPath(base: string, queryPath: string): string;
/**
 * 校验并规范化数据源 URL。
 * @param raw - 用户配置的 URL。
 * @returns 规范化后的 URL 字符串。
 * @throws SourceRequestError 当协议非法、内嵌凭据或格式错误。
 */
export declare function validateSourceUrl(raw: string): string;
/**
 * 构建认证请求头（不会把凭据写进任何返回的诊断中）。
 * @param auth - 认证配置。
 * @param baseHeaders - 既有请求头。
 * @returns 携带认证信息的完整请求头。
 */
export declare function buildAuthHeaders(auth: AuthConfig, baseHeaders?: Record<string, string>): Record<string, string>;
/** 把机密文本替换为 ***（防御纵深：错误信息与诊断的兜底脱敏）。 */
export declare function redactText(text: string, secrets: readonly string[]): string;
/** 单次请求的完整参数。 */
export interface HttpCallOptions {
    /** 基础 URL（未校验前）。 */
    url: string;
    /** 查询参数（GET 追加到 URL）。 */
    params: Record<string, string>;
    /** 认证配置。 */
    auth: AuthConfig;
    /** 额外请求头（非机密，来自插件 Config）。 */
    extraHeaders?: Record<string, string>;
    /** 请求超时（毫秒）。 */
    timeoutMs: number;
    /** 响应体字节上限。 */
    maxResponseBytes: number;
    /** 调用方取消信号（工具的 exec.signal）。 */
    signal: AbortSignal;
    /** 请求类型标签，用于错误信息（"指标查询"等）。 */
    label: string;
}
/** 尝试把响应文本解析为 JSON；失败时原样返回文本。 */
/**
 * 深度清洗任意 JSON 值，保证 dsh 工具框架的 lossless 要求：
 * - NaN / Infinity / -Infinity → 字符串（框架不接受非有限数）；
 * - 超出安全整数范围的大整数 → 字符串（保留精度）；
 * - undefined → null（框架不接受 undefined）；
 * - 递归处理数组与对象。
 */
export declare function sanitizeJson(value: unknown): unknown;
/**
 * 执行一次数据源调用，返回规范化结果（不抛错；错误折叠进 QueryOutcome）。
 * @param type - 数据源类型（用于错误上下文）。
 * @param options - 请求参数。
 * @returns 规范化查询结果。
 */
export declare function callDataSource(type: DataSourceType, options: HttpCallOptions): Promise<QueryOutcome>;
