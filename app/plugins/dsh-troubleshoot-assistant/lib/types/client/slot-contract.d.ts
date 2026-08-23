/**
 * @module @dsh-tools/troubleshoot-assistant/client/slot-contract
 *
 * 本地类型声明：把 settings.plugin.item 槽位并入 SlotMap，使
 * PropsRuntime<'settings.plugin.item'> 可解析。该槽位由
 * dsh-client-ui-settings-plugins 声明；此处仅为类型解析而存在，
 * 无任何运行时内容（类型导入会被构建剥离）。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** 一个插件的设置卡片，key = 命名空间名。 */
        'settings.plugin.item': {
            kind: 'keyed';
            scope: 'root';
            owner: {
                children?: never;
            };
        };
    }
}
export type {};
