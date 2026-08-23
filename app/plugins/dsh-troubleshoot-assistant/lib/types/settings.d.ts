/**
 * @module @dsh-tools/troubleshoot-assistant/settings
 *
 * 设置命名空间 "troubleshoot"：在 Web 设置页（3080）以卡片形式编辑。
 *
 * 数据源模型（动态数组）：
 *   dataSources: [{ id, type, enabled, name, url, authType, token, username,
 *                  password, headerName, queryPath, timeoutMs, description }, ...]
 * 用户可在卡片中任意【添加/删除】数据源，选择预设类型或输入自定义类型，
 * 再填写 URL / Token / 认证等。工具运行时按"类型或名称"匹配启用数据源。
 *
 * 为什么数组可行（而不是扁平字段）：
 * - 客户端 settingsScope.set(field, value) 的 value 支持任意 JSON（path 深度 1，
 *   值可为数组/对象）；dsh 自身的 llm-pi-ai.providers 就是嵌套对象数组；
 * - redactSecrets 的 walker 支持 object/dict/array 容器递归，
 *   role('secret') 字段在数组条目里同样脱敏。
 *
 * 安全要点：
 * - token / password 字段声明 role('secret')——dsh-settings 会在所有
 *   wire 响应中脱敏，Web 卡片永远看不到已存值，只能写入或清除；
 * - 建议使用 "env:<NAME>" 引用，使机密只存在于运行环境。
 */
import { type SettingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { type AuthType, type DataSourceConfig, type ResolvedSources, type TimeRange } from './types.ts';
/** 本插件在 settings 系统中的命名空间（小写 kebab-case）。 */
export declare const NAMESPACE: SettingsNamespace;
/** 认证方式的可选值（schemastery union 需要 const 字面量）。 */
export declare const AUTH_TYPES: readonly ["none", "bearer", "basic", "header"];
/** settings 文档中一个数据源条目的原始结构（用户文档形态）。 */
export interface DataSourceEntry {
    /** 数据源唯一 ID（客户端生成，uuid）。 */
    id: string;
    /** 数据源类型（预设或自定义字符串）。 */
    type: string;
    /** 是否启用。 */
    enabled: boolean;
    /** 展示名称。 */
    name: string;
    /** 基础 URL（仅 http/https）。 */
    url: string;
    /** 认证方式。 */
    authType: AuthType;
    /** Bearer Token 或自定义头值；支持 "env:<NAME>"。 */
    token: string;
    /** Basic 认证用户名。 */
    username: string;
    /** Basic 认证密码；支持 "env:<NAME>"。 */
    password: string;
    /** 自定义头认证的请求头名。 */
    headerName: string;
    /** 查询路径；留空用类型默认。 */
    queryPath: string;
    /** 单请求超时（毫秒）；0 = 继承插件默认。 */
    timeoutMs: number;
    /** 说明。 */
    description: string;
}
/** settings 文档完整结构。 */
export interface TroubleshootSettings {
    /** 全部数据源（动态数组）。 */
    dataSources: DataSourceEntry[];
    /** 默认时间范围（分钟）。 */
    defaultTimeRangeMinutes: number;
    /** 默认结果上限。 */
    maxResults: number;
}
/** 设置文档的 schemastery schema（同时用于设置页渲染与写入校验）。 */
export declare const TroubleshootSettingsSchema: z<TroubleshootSettings>;
/** 生成一个新的数据源条目 ID（客户端与服务端共用格式：ds-<timestamp>-<rand>）。 */
export declare function newDataSourceId(): string;
/**
 * 把 settings 文档中的一条数据源条目组装成运行时配置。
 * @param entry - 用户文档条目。
 * @returns 组装后的数据源配置；URL 为空时返回 undefined。
 */
export declare function entryToDataSource(entry: DataSourceEntry): DataSourceConfig | undefined;
/**
 * 从 settings 文档组装全部数据源（动态数组 → ResolvedSources）。
 * @param value - settings 文档。
 * @returns 解析后的数据源集合（含索引 Map）。
 */
export declare function sourcesFromSettings(value: TroubleshootSettings): ResolvedSources;
/**
 * 解析时间参数（ISO-8601 字符串或毫秒时间戳）为毫秒范围。
 * 未给出 start/end 时回退到 [now - rangeMinutes, now]。
 * 任何解析失败抛 TypeError（由工具层转成结构化错误）。
 * @param start - 起始时间（可选）。
 * @param end - 结束时间（可选）。
 * @param rangeMinutes - 默认范围（分钟）。
 * @param now - 当前时间（毫秒），测试可注入。
 * @returns 规范化后的时间范围。
 */
export declare function resolveTimeRange(start?: string | number, end?: string | number, rangeMinutes?: number, now?: number): TimeRange;
/** 将毫秒时间戳格式化为 ISO-8601（用于请求参数）。 */
export declare function toIso(ms: number): string;
