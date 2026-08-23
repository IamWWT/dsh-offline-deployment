/**
 * @module @dsh-tools/troubleshoot-assistant/types
 *
 * 故障排查助手的数据源模型与工具返回值类型。
 *
 * 设计原则（安全与可靠）：
 * - 任何可能包含机密的位置（token/password）都独立成字段并标注为 secret；
 * - 工具返回值只携带"可安全展示给模型与 UI"的数据，绝不回显凭据；
 * - 所有时间参数统一支持 ISO-8601 字符串或毫秒时间戳（数字），由解析器归一化。
 */
/**
 * 数据源类型：预设类型 + 用户自定义类型（字符串）。
 * 预设类型有默认查询路径与中文标签；自定义类型由用户命名（如 es / clickhouse / custom-api），
 * 查询路径由用户填写。工具按"类型或名称"匹配数据源。
 */
export type DataSourceType = 'metrics' | 'logs' | 'trace' | 'cmdb' | 'knowledge' | (string & {});
/** 支持的数据源认证方式。 */
export type AuthType = 'none' | 'bearer' | 'basic' | 'header';
/**
 * 单个数据源的认证配置。
 * token / password 以两种形式之一承载机密：
 * 1. 字面量（settings 中以 role('secret') 存储，响应中被脱敏）；
 * 2. 引用 "env:<NAME>"——只存储环境变量名，调用时从 process.env 读取，
 *    机密完全不落盘。推荐第二种。
 */
export interface AuthConfig {
    /** 认证方式：none 无认证 / bearer Bearer Token / basic 基本认证 / header 自定义头。 */
    type: AuthType;
    /** Bearer Token 或自定义头的值；支持 "env:<NAME>" 引用。 */
    token: string;
    /** basic 认证的用户名。 */
    username: string;
    /** basic 认证的密码；支持 "env:<NAME>" 引用。 */
    password: string;
    /** header 认证方式下携带 token 的请求头名称，默认 Authorization。 */
    headerName: string;
}
/** 一个数据源的全部配置（来自 settings 命名空间 dataSources 数组的条目）。 */
export interface DataSourceConfig {
    /** 数据源唯一 ID（数组条目标识，删除/更新定位用）。 */
    id: string;
    /** 数据源类型：预设（metrics/logs/trace/cmdb/knowledge）或用户自定义类型。 */
    type: DataSourceType;
    /** 是否启用该数据源。 */
    enabled: boolean;
    /** 展示名称，供 agent 与 UI 识别（同一类型下建议唯一，便于工具按名称精确选择）。 */
    name: string;
    /** 数据源基础 URL（仅 http/https，不允许内嵌 userinfo）。 */
    url: string;
    /** 认证配置。 */
    auth: AuthConfig;
    /**
     * 查询路径：附加在 base URL 之后。缺省时按类型使用默认路径
     * （metrics: /api/v1/query_range，logs: /search，trace: /api/v1/traces，cmdb: /api/v1/changes，
     * knowledge: /api/v1/search；自定义类型无默认，留空则请求 base URL 本身）。
     */
    queryPath: string;
    /** 单请求超时（毫秒）；缺省继承插件 Config 的 defaultTimeoutMs。 */
    timeoutMs?: number;
    /** 数据源说明（供 agent 了解该源支持的查询语法），也会出现在 status 工具中。 */
    description: string;
}
/** 组装后的全部数据源配置（动态数组，用户可增删任意类型）。 */
export interface ResolvedSources {
    /** 全部已配置数据源（含未启用的；调用方按 enabled 过滤）。 */
    all: DataSourceConfig[];
    /** 按数据源 ID 索引（未找到为 undefined）。 */
    byId: ReadonlyMap<string, DataSourceConfig>;
    /** 按数据源名称索引（未找到为 undefined）。 */
    byName: ReadonlyMap<string, DataSourceConfig>;
    /** 按类型列出已启用数据源（未配置为 undefined）。 */
    byType: ReadonlyMap<DataSourceType, DataSourceConfig[]>;
}
/** 工具执行所需的运行时上下文快照（由插件 apply 注入各工具闭包）。 */
export interface ToolRuntimeContext {
    /** 各数据源配置（已从 settings 解析）。 */
    sources: ResolvedSources;
    /** 默认时间范围（分钟），工具未显式给定范围时使用。 */
    defaultTimeRangeMinutes: number;
    /** 单次查询默认最大结果条数。 */
    maxResults: number;
    /** 单请求超时（毫秒）。 */
    defaultTimeoutMs: number;
    /** 单请求响应体字节上限。 */
    maxResponseBytes: number;
    /** 并行查询并发上限。 */
    maxConcurrency: number;
    /** 报告输出目录（绝对路径）；空串表示不落盘。 */
    reportDir: string;
}
/** 一次数据源查询的规范化结果。 */
export interface QueryOutcome {
    /** 数据源类型。 */
    source: DataSourceType;
    /** 查询是否成功。 */
    ok: boolean;
    /** 失败时的稳定错误码（SOURCE_NOT_CONFIGURED / INVALID_URL / TIMEOUT / ...）。 */
    code?: string;
    /** 失败时的安全错误信息（不含任何凭据）。 */
    error?: string;
    /** 响应体是否因超过字节上限被截断。 */
    truncated: boolean;
    /** 解析后的响应值（JSON 或文本），无敏感字段。 */
    value: JsonValue;
    /** 结果条数（尽力而为：数组长度或 undefined）。 */
    count?: number;
}
/** 时间范围：start/end 为毫秒时间戳。 */
export interface TimeRange {
    /** 起始时间（毫秒时间戳）。 */
    start: number;
    /** 结束时间（毫秒时间戳）。 */
    end: number;
}
import type { JsonValue } from '@deepseek-ai/dsh-tools';
/** 预设数据源类型的中文标签。 */
export declare const PRESET_DATA_SOURCE_LABELS: Record<string, string>;
/** 预设数据源类型的默认查询路径。 */
export declare const PRESET_DEFAULT_QUERY_PATHS: Record<string, string>;
/** 预设数据源类型列表（UI 下拉候选；用户仍可输入自定义类型）。 */
export declare const PRESET_SOURCE_TYPES: string[];
/** 数据源类型中文标签：预设取预设表，自定义类型原样展示（或显示"自定义"）。 */
export declare function dataSourceLabel(type: string): string;
/** 数据源类型默认查询路径：预设取预设表，自定义类型无默认（返回空串）。 */
export declare function defaultQueryPathFor(type: string): string;
