/**
 * @module @dsh-tools/troubleshoot-assistant/client
 *
 * 浏览器半插件入口：把"troubleshoot"命名空间的设置卡片注册进
 * settings.plugin.item 槽位（Web 设置页 → 插件配置 标签页）。
 *
 * 协作只经 Cordis 服务（slots / settingsScope），不导入任何其他插件的
 * 值导出——满足客户端 bundle 纯净性要求；槽位声明通过类型导入拉取。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** 声明依赖的服务。 */
export declare const inject: string[];
/**
 * 浏览器插件入口：注册设置卡片。
 * @param ctx - 浏览器插件上下文（slots / settingsScope 已就绪）。
 */
export declare function apply(ctx: ClientContext): void;
