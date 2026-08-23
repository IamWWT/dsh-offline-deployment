/**
 * @module @dsh-tools/troubleshoot-assistant/export
 *
 * 数据源批量导出 / 导入模板（Host 半，注册 dsh web 只读路由）：
 *   - GET /api/troubleshoot/export    导出当前数据源配置为 JSON（可再导入）；
 *   - GET /api/troubleshoot/template  下载导入模板（含逐字段说明与示例条目）。
 *
 * 安全契约：
 * - token/password 在 settings 文档中为 role('secret')，wire 上对 Web 脱敏；
 *   导出端点在 Host 侧运行、能读到原值，但只放行 "env:<NAME>" 引用（环境变量名，
 *   非机密）；字面量明文一律掩码为空串——导出文件永不包含明文凭据。
 * - 导入端（客户端 controller）对 secret 字段遵循"空 = 保留现有值"，
 *   与卡片"留空不修改"语义一致，避免再导入导出文件时误清空已存 secret。
 * - 路由仅 GET、只读、无写入；dsh web 仅监听 127.0.0.1，访问面与设置页一致。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TroubleshootSettings } from './settings.ts';
/**
 * 掩码一个 secret 字段：env 引用原样保留，其余（含空串）一律返回空串。
 * @param value - 文档中存储的原始值。
 * @returns 可安全导出的值。
 */
export declare function maskSecret(value: string): string;
/** 导出文档结构（与导入解析器对齐；version 供未来格式演进）。 */
export interface ExportDocument {
    version: 1;
    exportedAt: string;
    note: string;
    dataSources: Record<string, unknown>[];
    defaultTimeRangeMinutes: number;
    maxResults: number;
}
/**
 * 由 settings 文档构建导出文档（纯函数，可单测）。
 * @param settings - "troubleshoot" 命名空间的完整文档。
 * @param now - 当前时间（毫秒），测试可注入。
 * @returns 导出文档（JSON 可序列化）。
 */
export declare function buildExportDocument(settings: TroubleshootSettings, now?: number): ExportDocument;
/** 导入模板（含逐字段说明与三类示例条目；_ 前缀键为说明，导入时忽略）。 */
export declare function buildTemplate(): Record<string, unknown>;
/**
 * 注册数据源导出 / 模板下载路由（仅当 webServer 服务存在时）。
 * @param ctx - Cordis 上下文。
 * @param getSource - 返回最新 settings 文档（settings 服务就绪后自动切换为读用户文档）。
 */
export declare function registerExportRoute(ctx: Context, getSource: () => TroubleshootSettings): void;
