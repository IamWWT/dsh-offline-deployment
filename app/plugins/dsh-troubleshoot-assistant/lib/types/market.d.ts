/**
 * @module @dsh-tools/troubleshoot-assistant/market
 *
 * 本地插件市场目录（dshmarketplace 兼容）。
 *
 * 背景：dshmarketplace-plugin（插件商店）从 DSHM_API 环境变量指向的目录端点
 * 拉取插件清单（默认 https://dshmarketplace.dev/api/v1/plugins）。本模块在
 * dsh web 自身注册同路径的 exact 路由，返回**本地目录**：
 *   - 本插件 @dsh-tools/troubleshoot-assistant（预装，随包分发）；
 *   - dsh-better-sidebar（npm，可一键安装）。
 * 配合容器环境 DSHM_API=http://127.0.0.1:3080，商店即可完全离线工作——
 * 插件市场"装进包里"，无需外部网络。
 *
 * 目录契约（与 dshmarketplace.dev 的 /api/v1/plugins 一致）：
 *   { total, count, results: [{ fullName, name, owner, repo, subpath,
 *     summary, summaryZh, category, install, riskFlags }] }
 * install 必须是 `dsh plugin --profile <p> add <npm名|github:owner/repo>`，
 * 商店侧会做白名单校验（拒绝 file: 等路径形式）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { IncomingMessage, ServerResponse } from 'node:http';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** dsh 的 node:http 路由注册服务（由 dsh-host-webserver 提供）。 */
        webServer: {
            /** 注册一条 exact 路径路由；返回该路由的 disposer。 */
            register(options: {
                kind: 'exact';
                path: string;
                handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
            }): () => unknown;
        };
    }
}
/** 一个市场条目。字段与 dshmarketplace.dev 目录兼容。 */
export interface MarketPluginEntry {
    /** 唯一标识，形如 owner/repo 或 npm 包名。 */
    fullName: string;
    /** 展示名。 */
    name: string;
    /** 维护者（用于分组展示）。 */
    owner: string;
    /** 源仓库名。 */
    repo: string;
    /** 仓库内子路径（monorepo 时使用；无则 null）。 */
    subpath: string | null;
    /** 英文摘要。 */
    summary: string;
    /** 中文摘要。 */
    summaryZh: string;
    /** 分类：ui / ops / memory / workflow ... */
    category: string;
    /** 安装命令（商店白名单校验后执行）。 */
    install: string;
    /** 风险标记（空数组 = 未检测到风险；商店据此决定是否需确认）。 */
    riskFlags: string[];
}
/** 内置本地目录条目。 */
export declare function defaultCatalogEntries(profile?: string): MarketPluginEntry[];
/**
 * 读取离线市场快照（awesome-dsh-plugin 官方目录的本地副本）。
 * @param path - 快照文件绝对路径。
 * @param maxBytes - 读取上限（默认 8 MiB）。
 * @returns JSON 文本；文件缺失/不可读/超限时 undefined。
 */
export declare function loadMarketSnapshot(path: string, maxBytes: number): string | undefined;
/** 快照缺失时的兜底目录（仅有可安装源的真实条目）。 */
export declare function fallbackMarketCatalog(): Record<string, unknown>;
/**
 * 把内置条目合并进离线快照目录（按 npm 名去重：快照已有同 npm 名的保留快照条目）。
 * @param snapshotText - 离线快照 JSON 文本。
 * @returns 合并后的目录对象（plugins 非空数组，满足 dshmarket 校验）。
 */
export declare function mergeBuiltinEntries(snapshotText: string): Record<string, unknown>;
/**
 * 在 dsh web 上注册本地市场目录路由（仅当 webServer 服务存在时）：
 *   - /api/dshmarket/plugins.json  dshmarket（与 3080 一致的市场插件）的目录端点，
 *     离线快照优先，缺失时回退兜底目录；
 *   - /api/v1/plugins              兼容 dshmarketplace 商店格式（保留，未启用时无人调用）。
 * @param ctx - Cordis 上下文。
 * @param entries - dshmarketplace 格式的默认条目。
 * @param snapshotPath - 离线快照文件（awesome-dsh-plugin plugins.json）；空串跳过快照。
 * @param maxSnapshotBytes - 快照读取上限。
 */
export declare function registerMarketCatalog(ctx: Context, entries?: MarketPluginEntry[], snapshotPath?: string, maxSnapshotBytes?: number): void;
export type { IncomingMessage as _IncomingMessage, ServerResponse as _ServerResponse };
/** 目录条目的轻量结构校验（供 Config 扩展条目使用）。 */
export declare function isMarketPluginEntry(value: unknown): value is MarketPluginEntry;
