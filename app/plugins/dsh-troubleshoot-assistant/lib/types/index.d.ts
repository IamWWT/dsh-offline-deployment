/**
 * @module @dsh-tools/troubleshoot-assistant
 *
 * 故障排查助手（Host 半）：
 * - 注册 settings 命名空间 "troubleshoot"（Web 设置页卡片编辑数据源）；
 * - 注册 7 个模型可见工具（状态 / 指标 / 日志 / 调用链 / CMDB / 取证 / 报告）。
 *
 * 配置（cordis.yml 行 "troubleshoot-assistant" 的 config）：
 *   defaultTimeoutMs   单请求超时（毫秒），默认 15000
 *   maxResponseBytes   单请求响应体上限（字节），默认 2 MiB
 *   maxConcurrency     多源取证并发上限，默认 4
 *   reportDir          故障报告落盘目录（绝对路径）；空串不落盘
 *
 * 数据源配置（settings 命名空间，Web 卡片编辑；也可手改 $DSH_HOME/settings.yaml
 * 的 "troubleshoot:" 段，改完热生效）：
 *   <type>Enabled / <type>Url / <type>AuthType / <type>Token / <type>Username /
 *   <type>Password / <type>HeaderName / <type>QueryPath / <type>TimeoutMs /
 *   <type>Description / defaultTimeRangeMinutes / maxResults
 *
 * 安全契约：
 * - Token/Password 声明 role('secret')，settings 系统在 wire 上脱敏；
 *   推荐填写 "env:<NAME>" 引用，机密不落盘；
 * - HTTP 调用：仅 http/https、无内嵌凭据 URL、全链路超时、响应体字节上限、
 *   TLS 校验保持开启、错误信息经 redactText 兜底脱敏。
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type MarketPluginEntry } from './market.ts';
/** 插件名（cordis.yml 行的 name 使用包名；此处为 Loader 的日志标识）。 */
export declare const name = "troubleshoot-assistant";
/**
 * 声明依赖的服务：仅 tools（注册工具）。
 * settings 不做硬依赖：installSettingsSection 内部以 ctx.inject(['settings'])
 * 自适应——settings 服务存在时注册命名空间并接管读取源；不存在时保持
 * 插件配置默认值运行（自定义 profile 无 settings 行也不阻塞启动）。
 */
export declare const inject: string[];
/** 插件级配置（非敏感；数据源配置在 settings 命名空间）。 */
export interface Config {
    /** 单请求超时（毫秒）。 */
    defaultTimeoutMs: number;
    /** 单请求响应体字节上限。 */
    maxResponseBytes: number;
    /** 多源取证并发上限。 */
    maxConcurrency: number;
    /** 故障报告落盘目录（绝对路径）；空串表示不落盘。 */
    reportDir: string;
    /** 本地插件市场目录的额外条目（在默认条目之上追加）。 */
    catalogExtra: MarketPluginEntry[];
    /** 离线市场快照文件（awesome-dsh-plugin plugins.json）；空串 = 仅用兜底目录。 */
    marketSnapshotPath: string;
    /** 快照读取上限（字节）。 */
    maxSnapshotBytes: number;
    /** 全局 SOP 文件（绝对路径）：工作区没有自己的 SOP 时的基线；空串 = 仅用内置默认。 */
    sopPath: string;
    /** 会话工作区内 SOP 文件名（按 cwd 解析，不同工作区可配不同 SOP）。 */
    sopRelativePath: string;
    /** SOP 文件单次读取字节上限。 */
    maxSopBytes: number;
}
/** 插件级配置 schema（schemastery；越界值在加载时即拒绝）。 */
export declare const Config: z<Config>;
/**
 * 插件入口。
 * @param ctx - Cordis 上下文。
 * @param config - 插件级配置（来自 cordis.yml 行 config）。
 */
export declare function apply(ctx: Context, config: Config): void;
