/**
 * @module @dsh-tools/troubleshoot-assistant/tools
 *
 * 模型可见的工具集（7 个）：
 *   - troubleshoot_status       列出已配置/启用的数据源（脱敏）与默认参数
 *   - query_metrics / query_logs / query_trace / query_cmdb
 *                               单源查询（时间范围、limit、额外参数）
 *   - troubleshoot_evidence     多源并行取证（排查中的证据补充）
 *   - generate_fault_report     生成结构化故障报告（可落盘）
 *
 * 契约：
 * - 所有查询失败都返回 { ok:false, code, error } 规范化结果，不抛错
 *   （取消除外——exec.signal 中止时上抛，交给调度器按取消处理）；
 * - 工具返回值永不包含凭据；URL 参数含查询词但无认证信息；
 * - 时间参数统一 ISO-8601 或毫秒时间戳。
 */
import { type TroubleshootSettings } from './settings.ts';
import type { ToolRuntimeContext } from './types.ts';
/** 从设置文档组装运行时上下文。 */
export declare function buildRuntime(settings: TroubleshootSettings, defaults: Pick<ToolRuntimeContext, 'defaultTimeoutMs' | 'maxResponseBytes' | 'maxConcurrency' | 'reportDir'>): ToolRuntimeContext;
/** 注册全部工具。 */
export declare function registerTools(ctx: import('@deepseek-ai/cordis').Context, getRuntime: () => ToolRuntimeContext): void;
