/**
 * @module @dsh-tools/troubleshoot-assistant/settings-doc
 *
 * 配置文件查看路由（Host 半，只读 GET）：
 *   GET /api/troubleshoot/settings-doc
 *   返回 { path, text, exists } —— dsh 用户可编辑的 settings 文档原文（YAML 文本）。
 *
 * 背景：无 GUI 容器里"打开配置文件"按钮走 xdg-open（把文件复制到工作区 open-here），
 * 前端只有一句 toast 没有内容。本端点为前端提供文档原文，注入脚本 fetch 后
 * 弹出一个真实可见的内容框（modal）展示配置，满足"我要看到真实内容"。
 *
 * 安全契约：
 * - 仅 GET、只读，不写文件；与设置页同源的 loopback 访问面；
 * - 原文可能包含 secret 字面量（用户手填明文 token/password 时）。本端点按需返回，
 *   展示框在浏览器本地渲染，不落盘、不发送到别处；与"打开配置文件"的本机语义一致。
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * 注册配置文件原文查看路由（仅当 webServer 与 settings 服务都存在时）。
 * @param ctx - Cordis 上下文。
 */
export declare function registerSettingsDocRoute(ctx: Context): void;
