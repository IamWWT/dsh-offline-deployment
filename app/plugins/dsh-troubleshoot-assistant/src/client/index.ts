/**
 * @module @dsh-tools/troubleshoot-assistant/client
 *
 * 浏览器半插件入口：把"troubleshoot"命名空间的设置卡片注册进
 * settings.plugin.item 槽位（Web 设置页 → 插件配置 标签页）。
 *
 * 协作只经 Cordis 服务（slots / settingsScope），不导入任何其他插件的
 * 值导出——满足客户端 bundle 纯净性要求；槽位声明通过类型导入拉取。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only：拉取 ctx.settingsScope 的 Context 合并声明。
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only：拉取 settings.plugin.item 槽位的 SlotMap 声明。
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { TroubleshootCard } from './card.tsx'
import { TroubleshootCardController } from './controller.ts'

/** 声明依赖的服务。 */
export const inject = ['slots', 'settingsScope']

/**
 * 浏览器插件入口：注册设置卡片。
 * @param ctx - 浏览器插件上下文（slots / settingsScope 已就绪）。
 */
export function apply(ctx: ClientContext): void {
  const controller = new TroubleshootCardController(
    ctx.settingsScope.bind({ namespace: 'troubleshoot' }),
  )
  // 卡片注册进 settings.plugin.item，key 为命名空间名——Host 提供同名
  // 命名空间时即被"插件配置"标签页渲染，未提供时不显示任何痕迹。
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: 'troubleshoot',
    inject: () => controller.inject(),
  }, TroubleshootCard))
}
