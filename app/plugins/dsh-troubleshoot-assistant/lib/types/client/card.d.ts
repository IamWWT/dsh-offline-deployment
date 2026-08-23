/**
 * @module @dsh-tools/troubleshoot-assistant/client/card
 *
 * "troubleshoot" 设置卡片（浏览器半，注册进 settings.plugin.item 槽位）。
 *
 * 数据源为【动态列表】，交互按"添加 → 填写 → 保存 → 折叠为一行"组织：
 * - 已存条目默认折叠为一行，行标题展示基本信息（名称 / 类型 / URL / 启用状态），
 *   点击行头（"详情"）展开完整配置，再点（"收起"）折叠；
 * - 新建条目默认展开待填写；点"保存"写入后折叠为一行；
 * - 条目内可编辑类型（预设下拉/自定义）、名称、URL、认证、Token、查询路径、超时、说明；条目可删除。
 *
 * 纯展示组件：全部数据与动作经 props（运行时 share + 注入 face）传入，
 * 不直接触达 ctx；样式使用内联 style（无 CSS 模块依赖，客户端 bundle 纯净）。
 */
import type { InjectFace, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { type TroubleshootCardFace } from "./controller.ts";
/** 卡片组件 props：槽位运行时 share + 注入 face。 */
export type TroubleshootCardProps = PropsRuntime<"settings.plugin.item"> & InjectFace<TroubleshootCardFace>;
/**
 * 渲染故障排查助手设置卡片（动态数据源列表：已存折叠为一行、新建展开待填、点详情展开配置）。
 * @param props - 运行时 share + 注入 face（快照与表单动作）。
 * @returns 卡片。
 */
export declare function TroubleshootCard(props: TroubleshootCardProps): React.JSX.Element | null;
