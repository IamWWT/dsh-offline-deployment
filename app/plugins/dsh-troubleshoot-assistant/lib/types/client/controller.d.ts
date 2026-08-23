/**
 * @module @dsh-tools/troubleshoot-assistant/client/controller
 *
 * "troubleshoot" 设置命名空间的暂存表单控制器（浏览器半）。
 *
 * 数据源为【动态数组】：用户可添加/删除任意数据源条目（选择预设类型或输入
 * 自定义类型），每条目编辑 URL / Token / 认证等字段。保存时把整个
 * dataSources 数组一次性写入（scope.set('dataSources', [...])），
 * 走修订号围栏；secret 字段（token/password）在 wire 上永不回显。
 *
 * 语义（与 dsh 设置卡片的通用约定一致）：
 * - 输入先暂存（draft），点保存才写入；写入失败回读 Host 最新状态；
 * - secret 字段：wire 上永不回显，卡片渲染为空；输入后保存=写入，
 *   点"清除"= unset（数组场景下置空字符串）；
 * - 空文本的非 secret 字段保存时保留空串（不回退 composition，数组整体写入）。
 *
 * 本控制器不依赖任何其他插件的值导出（客户端 bundle 纯净性要求）。
 */
import { type SettingsScope, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** 一个数据源条目的可编辑字段描述。 */
export interface EntryFieldSpec {
    /** 设置文档中的字段名。 */
    key: keyof DataSourceDraftEntry;
    /** 渲染标签（中文）。 */
    label: string;
    /** 输入提示。 */
    hint?: string;
    /** 是否为 secret（wire 不回显，写入专用）。 */
    secret?: boolean;
    /** 是否为数字字段（非法文本阻止保存）。 */
    numeric?: boolean;
    /** 可选下拉选项（值 → 标签）。 */
    options?: {
        value: string;
        label: string;
    }[];
}
/** 一条数据源条目的暂存形态（字符串化，与 Host DataSourceEntry 对应）。 */
export interface DataSourceDraftEntry {
    id: string;
    type: string;
    enabled: boolean;
    name: string;
    url: string;
    authType: string;
    token: string;
    username: string;
    password: string;
    headerName: string;
    queryPath: string;
    timeoutMs: string;
    description: string;
    /** 新建（暂存）且尚未写入文档的条目；卡片据此默认展开待填写，保存后折叠为一行。 */
    isNew: boolean;
}
/** 全部条目字段描述。 */
export declare const ENTRY_FIELD_SPECS: EntryFieldSpec[];
/** 新数据源条目的默认值。 */
export declare function blankEntry(): DataSourceDraftEntry;
/** 卡片通用壳状态。 */
export interface CardShell {
    /** 命名空间是否对当前客户端可用（未服务则卡片渲染为空）。 */
    available: boolean;
    /** Host 文档是否可写。 */
    writable: boolean;
    /** 是否存在未保存的暂存编辑。 */
    dirty: boolean;
    /** 是否存在非法暂存（阻止保存）。 */
    invalid: boolean;
    /** 是否有写入正在跨线。 */
    saving: boolean;
    /** 上次保存是否未按暂存内容落库（由下一次编辑/保存清除）。 */
    failed: boolean;
}
/** 导入状态：none=无；pending=已导入待保存；error=导入失败。 */
export interface ImportInfo {
    kind: 'none' | 'pending' | 'error';
    message: string;
    count: number;
}
/** 卡片完整快照（注入 hooks 绑定为 useTroubleshootCard）。 */
export interface TroubleshootCardState extends CardShell {
    /** 全部条目（含未编辑的已存条目）。 */
    entries: DataSourceDraftEntry[];
    /** 全局默认值字段的暂存文本。 */
    global: {
        defaultTimeRangeMinutes: string;
        maxResults: string;
    };
    /** 最近一次导入的状态（pending 时"保存"生效、"放弃"取消）。 */
    importInfo: ImportInfo;
    /** 有未保存暂存编辑（或标记删除）的条目 id；供单条"保存此数据源"按钮启用/禁用。 */
    dirtyIds: string[];
    /** 存在非法字段的条目 id（阻止保存）。 */
    invalidIds: string[];
}
/** 卡片注入面：hooks（快照）+ 表单动作。 */
export interface TroubleshootCardFace {
    hooks: {
        /** 卡片快照，由渲染器绑定为 useTroubleshootCard。 */
        troubleshootCard: SnapshotStore<TroubleshootCardState>;
    };
    /** 暂存一个条目字段的文本。 */
    editField: (id: string, key: keyof DataSourceDraftEntry, text: string) => void;
    /** 切换条目的启用开关。 */
    toggleEnabled: (id: string) => void;
    /** 添加一条新数据源。 */
    addEntry: () => void;
    /** 删除一条数据源（未保存条目直接消失，已存条目标记删除）。 */
    removeEntry: (id: string) => void;
    /** 标记清除某条目的 secret 字段（保存时置空）。 */
    clearField: (id: string, key: keyof DataSourceDraftEntry) => void;
    /** 暂存一个全局字段的文本。 */
    editGlobal: (key: 'defaultTimeRangeMinutes' | 'maxResults', text: string) => void;
    /** 写入全部暂存编辑，随后按 Host 接受的值重新播种。 */
    save: () => void;
    /** 仅写入指定条目的暂存编辑（其余条目与全局字段不变）。 */
    saveEntry: (id: string) => void;
    /** 丢弃全部暂存编辑。 */
    discard: () => void;
    /** 导出当前数据源配置为 JSON 文本（优先 Host 导出端点：保留 env: 引用；失败时本地快照兜底）。 */
    exportData: () => Promise<string>;
    /** 获取导入模板 JSON 文本（优先 Host 模板端点；失败时本地兜底模板）。 */
    fetchTemplate: () => Promise<string>;
    /** 导入 JSON 文本：解析校验后整体暂存（替换语义），点"保存"生效、"放弃"取消。 */
    importData: (jsonText: string) => void;
    /** 清除导入状态提示。 */
    clearImportInfo: () => void;
}
/** 基于 settingsScope 的动态数组暂存控制器。 */
export declare class TroubleshootCardController {
    private readonly store;
    private readonly stagedEntries;
    private readonly stagedGlobal;
    private readonly removedIds;
    private saving;
    private failed;
    private importInfo;
    private readonly scope;
    /** @param scope - "troubleshoot" 命名空间的绑定 scope。 */
    constructor(scope: SettingsScope<Record<string, unknown>>);
    private disposeUnsubscribe;
    /** 从最新快照重新播种未编辑字段。 */
    private reseed;
    /** 设置导入状态并刷新快照。 */
    private setImportInfo;
    /** 暂存一个条目字段的编辑。 */
    editField(id: string, key: keyof DataSourceDraftEntry, text: string): void;
    /** 切换条目启用开关。 */
    toggleEnabled(id: string): void;
    /** 添加一条新数据源。 */
    addEntry(): void;
    /** 删除一条数据源。 */
    removeEntry(id: string): void;
    /** 标记清除某条目的 secret 字段（保存时置空）。 */
    clearField(id: string, key: keyof DataSourceDraftEntry): void;
    /** 暂存一个全局字段的文本。 */
    editGlobal(key: 'defaultTimeRangeMinutes' | 'maxResults', text: string): void;
    /**
     * 组装写入用的 dataSources 数组。
     * @param onlyIds - 仅重建这些条目（用于单条保存）；缺省重建全部（含移除与新条目）。
     */
    private buildNextSources;
    /** 写入全部暂存编辑；随后按 Host 接受的值重新播种。 */
    save(): void;
    /** 仅写入指定条目的暂存编辑（其余条目与全局字段保持不变）。 */
    saveEntry(id: string): void;
    /** 丢弃全部暂存编辑。 */
    discard(): void;
    /**
     * 导出当前数据源配置为 JSON 文本。
     * 优先请求 Host 导出端点（能保留 env: 引用；字面量 secret 由 Host 掩码）；
     * 端点不可用时用本地快照兜底（secret 全空，note 中说明）。
     */
    exportData(): Promise<string>;
    /** 获取导入模板 JSON 文本（优先 Host 模板端点；失败时用本地兜底模板）。 */
    fetchTemplate(): Promise<string>;
    /**
     * 导入 JSON 文本：解析校验后按【整体替换】语义暂存——
     * - 文件中 id 与现有条目一致 → 暂存为对该条目的字段编辑（secret 空值 = 保留现有值）；
     * - 文件中 id 不存在 → 暂存为新条目；
     * - 现有条目不在文件中 → 标记删除。
     * 暂存后需点"保存"才落库；点"放弃"取消。任何解析/校验失败只提示、不改暂存。
     */
    importData(jsonText: string): void;
    /** 清除导入状态提示。 */
    clearImportInfo(): void;
    /** 构建卡片注入面。 */
    inject(): TroubleshootCardFace;
    /** 释放订阅（随插件 fiber 卸载调用）。 */
    dispose(): void;
}
