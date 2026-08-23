# 故障排查助手插件 — 开发过程文档

> 本文记录插件 `@dsh-tools/troubleshoot-assistant` 从需求到部署的完整开发过程：需求分析 → 技术调研 → 架构设计 → 安全设计 → 编码实现 → 构建 → 测试 → 容器部署 → 验证。
> 配套源码：`app/dsh-troubleshoot-assistant/`；运行平台：docker-compose 中的 `dsh-harness` 容器（dsh 0.1.1-rc.1）。
>
> 版本记录：2026-08-21 平台从 0.1.0-rc.8 升级到 0.1.1-rc.1（插件依赖固定版本同步更新，48 用例回归通过；
> 插件源码目录由 `workspace/` 迁至 `app/`，下文历史叙述中的旧路径/旧版本号按当时状态保留）。

## 1. 需求分析

用户需求原文（整理）：

1. 拉取官方最新代码（deepseek-harness，已从 0.1.0-rc.7 更新到 0.1.0-rc.8）；
2. 编写一个「故障排查助手」插件：
   - 在 Web 3080 页面配置可调用数据源：指标 / 日志 / 调用链 / CMDB 变更历史（URL、Token 或其他认证方式）；
   - 配置后 agent 能基于用户问题做故障排查；
   - 能生成故障报告；
   - 排查过程中可按用户需求做证据补充；
3. 插件同样部署在 docker-compose 本容器运行；
4. 工程要求：开发过程写成文档、代码注释完整、生产可靠、**安全调用**。

### 1.1 关键决策点

| 决策 | 选择 | 理由 |
|---|---|---|
| 插件形态 | 独立 out-of-tree 包（bundle） | 不改官方仓库源码、不触发仓库 CI 门槛；`dsh plugin add` 一键激活 |
| 数据源配置存放 | dsh-settings 命名空间 `troubleshoot`（Web 卡片可编辑） | 满足「在 3080 页面配置」；配置热生效；与 dsh 官方模型一致 |
| 设置字段模型 | 扁平字段（`metricsUrl`、`logsToken`…） | 客户端 `settingsScope.set/unset` 只支持标量字段名，扁平最贴合；嵌套需走底层 mutate API，过度复杂 |
| 工具集 | 7 个工具：status / 4×单源查询 / evidence / report | 覆盖「排查 + 证据补充 + 报告」全流程，职责单一 |
| 认证实现 | Bearer / Basic / 自定义头 / 无；支持 `env:NAME` 引用 | 覆盖常见数据源；env 引用使机密不落盘 |
| 客户端 bundle 构建 | 自研 esbuild 包装（lazy-CJS factory） | 仓库内 tsdown clientBundle 预设未发布，按 modules 加载器契约手工复刻 |
| 依赖版本 | `@deepseek-ai/*` 固定 rc.8、cordis 4.0.1、schemastery 3.18.1 | 与升级后的运行版本一致，避免双副本 API 漂移 |
## 2. 技术调研（关键结论）

### 2.1 DSH 插件加载模型

- **插件行**：cordis.yml 中的一行 `{id, name, config, inject, disabled}`；Loader 为每行建 fiber，依赖服务就绪后激活；
- **Bundle**：包内 `cordis.patch.yml` + `package.json#dsh.bundle.patch`；`dsh plugin --profile web add <pkg>` 安装后自动加入 `dsh.profile.bundles`，下次启动插入插件行（apps/cli/src/plugin.ts 的 reconcilePlugins）；
- **settings 命名空间**：`installSettingsSection(ctx, ns, schema, entry, {setSource, onChange})`（packages/settings）；`role('secret')` 字段在 wire 响应中脱敏（redact.ts），客户端永远看不到已存值；
- **工具注册**：`ctx.tools.register(defineTool({name, description, parameters, output, execute}))`；参数由 dsh-tools 运行时校验；注册是 effect，卸载自动注销；
- **客户端插件**：包声明 `dsh.client` + `exports['./client']`；modules 节点半扫描 Loader 条目，把 `lib/client.js` 注入 `window.__DSH_BOOT__` 并在 `/plugins` 下发；bundle 必须是 lazy-CJS factory 形态：`window.__ModuleLoader__.load({id, factory})`，外部依赖经 factory 的 `require` 走模块表（react、runtime 等基线外部）；
- **设置卡片**：浏览器半注册进 `settings.plugin.item` 槽位（key = 命名空间名），Host 服务同名命名空间时由「插件配置」标签页渲染（docs/cookbook/adding-a-settings-card.md）。

### 2.2 关键 API 签名（源码核实）

```ts
// packages/settings/settings/src/index.ts
installSettingsSection<T>(ctx, ns, schema: z<T>, entry: T,
  hooks: { validate?: (v: T) => void; setSource: (cur: () => T) => void; onChange: () => void }): void

// packages/client/runtime/.../settings-scope.ts（浏览器半）
scope.set(field: string, value: unknown): Promise<void>   // 修订号围栏写入
scope.unset(field: string): Promise<void>                // 清除，回退 composition 层
scope.getSnapshot(): SettingsScopeSnapshot<T>            // {value, base, user, revision, writable, ...}
```

### 2.3 客户端 bundle 契约（复刻要点）

- 文件首行调用 `window.__ModuleLoader__.load({ id, factory: (require) => {...} })`；
- factory 内先声明 `module`/`exports`（CJS 包装），外部依赖用 factory 的 `require`；
- 客户端**值导入**只允许基线外部：`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-runtime/client`（预加载行）；其余跨插件符号一律 type-only（构建时擦除）；
- CSS：本插件全部使用内联样式，规避 lightningcss 依赖，保证手写构建可行。

<!-- DEV2 -->
## 3. 架构设计

### 3.1 总体结构

```
workspace/dsh-troubleshoot-assistant/
├── package.json            # bundle + dsh.client 清单；deps 固定 rc.8
├── cordis.patch.yml        # bundle patch：插入插件行 troubleshoot-assistant
├── build.mjs               # 构建：宿主 ESM + 客户端 factory bundle + tsc 声明
├── src/
│   ├── index.ts            # 插件入口：Config / installSettingsSection / registerTools
│   ├── settings.ts         # 扁平设置 schema（46 字段）+ 数据源组装 + 时间解析
│   ├── http.ts             # 安全 HTTP 客户端（URL 校验/超时/字节上限/脱敏/结构化错误）
│   ├── tools.ts            # 7 个工具注册
│   ├── types.ts            # 数据源模型与返回值类型
│   └── client/             # 浏览器半：设置卡片（controller + card.tsx）
├── tests/                  # node:test 单元测试（16 用例）
└── docs/DEVELOPMENT.md     # 本文档
```

### 3.2 数据流（一次排障）

```
用户问题 --> agent 调用 troubleshoot_status 了解可用数据源
         --> query_metrics / query_logs / query_trace / query_cmdb 按时间窗取证
         --> （需要补充证据时）troubleshoot_evidence 多源并行取证 / 扩大时间窗重查
         --> generate_fault_report 汇总为 Markdown 报告（可落盘）
所有工具在 execute 时读取 settings 最新快照（getRuntime），热更新即时生效
```

### 3.3 设置命名空间（扁平字段模型）

- 命名空间 `troubleshoot`；每个数据源 11 个字段：Enabled/Name/Url/AuthType/Token/Username/Password/HeaderName/QueryPath/TimeoutMs/Description；
- 全局字段：defaultTimeRangeMinutes / maxResults；
- Token/Password 声明 `role('secret')`：wire 脱敏、卡片写-only（输入后保存=写入、点清除=unset、留空=不修改）；
- 推荐 `env:NAME` 引用：只存环境变量名，调用时从 process.env 解析，机密完全不落盘。

### 3.4 工具设计

| 工具 | 参数要点 | 返回 |
|---|---|---|
| troubleshoot_status | 无 | 各源启用状态/URL/认证类型（无凭据） |
| query_metrics | query(必填)、start/end/rangeMinutes、limit、step、extraParams | {source,ok,code?,error?,truncated,count?,value} |
| query_logs | query(必填)、filter、时间窗、limit | 同上 |
| query_trace | traceId/service、query、时间窗 | 同上 |
| query_cmdb | resource/region、query、时间窗 | 同上 |
| troubleshoot_evidence | sources[]、queries{}、时间窗、limitPerSource | {window, collected[]}（有界并发） |
| generate_fault_report | title、symptoms、timeline[]、evidence[]、rootCause…、writeFile | {report, written, path?} |

错误契约：查询失败返回 `{ok:false, code, error}`（不抛错）；稳定错误码：SOURCE_NOT_CONFIGURED / INVALID_URL / INVALID_SCHEME / MISSING_CREDENTIAL / TIMEOUT / RESPONSE_TOO_LARGE / HTTP_ERROR / NETWORK_ERROR / REPORT_WRITE_FAILED；取消（exec.signal）上抛，交给调度器。

## 4. 安全设计（安全调用）

1. **凭据最小暴露**：`role('secret')` 脱敏 + `env:` 引用 + 错误信息 redactText 兜底 + 工具结果/status 永不回显凭据；
2. **URL 白名单**：仅 http/https、拒绝内嵌 userinfo、拒绝 fragment（http.ts validateSourceUrl）；
3. **全链路超时**：`AbortSignal.any([exec.signal, AbortSignal.timeout(ms)])`，任一中止即中断；
4. **响应体字节上限**：流式读取计数，超限截断并释放连接（防 OOM / 防恶意大响应）；
5. **TLS 保持校验**：Node/undici 默认开启，不提供关闭开关；自签证书请配置 CA 信任；
6. **有界并发**：troubleshoot_evidence 按 maxConcurrency 分批并行；
7. **报告落盘**：路径必须位于 reportDir 之下（防目录穿越）、文件权限 0600；
8. **SSRF 边界**：数据源 URL 由部署者显式配置且必须可访问内网，故不做域名白名单——内网安全由部署网络策略负责（README 明示）。

<!-- DEV3 -->
## 5. 编码与构建

### 5.1 编码约束

- TypeScript strict + noUncheckedIndexedAccess；仅 erasable 语法（Node 原生跑 TS 测试）；
- 每个模块/导出有完整 JSDoc（@param/@returns/契约/安全说明）；
- 工具参数由 defineTool 运行时校验，schema 推断与 execute 返回类型强校验；
- 客户端遵守 bundle 纯净性：跨插件符号只允许 type-only。

### 5.2 构建（build.mjs）

| 产物 | 方式 | 外部依赖 |
|---|---|---|
| lib/index.js | esbuild，ESM，node 平台 | 全部 `@deepseek-ai/*`（profile node_modules 提供，同版本） |
| lib/client.js | esbuild，CJS，browser 平台 + jsx 自动 | react、react/jsx-runtime、`@deepseek-ai/dsh-client-runtime/client`（模块表） |
| lib/types/** | tsc --emitDeclarationOnly | react/@types 经 tsconfig paths 指向仓库 pnpm store |

esbuild / tsc 从 dsh 仓库 node_modules 解析（宿主编译环境或容器内 /workspace/dsh 均可，build.mjs 自动探测）。

### 5.3 测试

- `tests/settings.spec.ts`：时间范围解析、扁平字段组装、默认路径/自定义路径/超时；
- `tests/http.spec.ts`：URL 校验、Bearer/Basic/Header/env 认证头、脱敏、HTTP 错误（本地 http server）、响应截断、超时、取消语义；
- 当前结果：16/16 通过（node --test）。
## 6. 容器部署

1. 源码位于 `workspace/dsh-troubleshoot-assistant/`，经 docker-compose bind mount 映射为容器内 `/workspace/dsh-troubleshoot-assistant`；
2. 容器内安装 pnpm，执行 `dsh plugin --profile web add link:/workspace/dsh-troubleshoot-assistant`：pnpm 把插件与 rc.8 依赖装入 profile node_modules，reconcilePlugins 检测到 `dsh.bundle` 自动加入 bundles 列表；
3. 重启容器：entry 脚本检测到源码更新 → pnpm install + pnpm build（重建到 rc.8）→ `dsh web` 启动时按 bundles 顺序应用插件 patch，插入 `troubleshoot-assistant` 行；
4. modules 节点半扫描到该行的 `dsh.client` → 下发 `lib/client.js`，浏览器刷新后设置页出现卡片。

> 说明：把插件放在 `/workspace`（bind mount）而非官方源码树，是为了不污染官方仓库、不被仓库 CI 门槛拦截，同时随容器持久化。

## 7. 验证清单

- [ ] 单元测试 16/16 通过；
- [ ] `node build.mjs` 三产物齐全（host ESM / client factory / types）；
- [ ] client.js 外部 require 仅 react/jsx-runtime 与 runtime client；
- [ ] `dsh plugin --profile web add` 后 profile 的 `dsh.profile.bundles` 含插件；
- [ ] 容器重建后 `dsh web` 启动成功，`troubleshoot-assistant` 行 ACTIVE；
- [ ] 浏览器 3080 设置页出现「故障排查助手」卡片，可保存数据源；
- [ ] agent 侧：troubleshoot_status 可见已配置源；query_* 可查；证据补充可用；报告可生成。

## 8. 已知限制与后续

- 每个数据源请求形态为「GET + 查询参数」（默认路径按类型）；如数据源需要 POST/自定义 body 结构，可在 settings 增加请求形态字段扩展；
- Token 页面保存为明文落盘（role('secret') 仅脱敏 wire），推荐 env 引用；后续可接入 dsh-credentials 域做统一凭据管理；
- 客户端卡片暂未接入 locale 字典（卡片文案硬编码中文），后续可按 dsh 国际化规范补充；
- 报告落盘使用 node:fs 直写；若需走 dsh fs 策略（审批/观测），可改为 ctx.fs 能力缝。
## 9. 迭代记录（市场 / 知识库 / 折叠卡片）

### 9.1 插件市场接入（离线商店）

- 事实澄清：`loongsuite/dsh-plugin` 是 LoongSuite 可观测性插件本体，并非插件市场；真正的 DSH 插件市场是 `dshmarketplace-plugin`（npm），目录来自 dshmarketplace.dev（可被 `DSHM_API` 环境变量重定向）；
- 本插件在 dsh web 上注册 `GET /api/v1/plugins` 提供**本地目录**（webServer 路由，`ctx.inject(['webServer'])` 自适应——headless 等无 Web 表面时不注册）；
- dsh-entry.sh 导出 `DSHM_API=http://127.0.0.1:3080`，商店的搜索/安装 RPC 全部走本地目录，**完全离线**；
- 已预装：dshmarketplace-plugin（商店）、dsh-better-sidebar（npm，^0.13.1，非 bundle 需在 cordis.patch.yml 加行挂载）、@dsh-tools/troubleshoot-assistant（file: 预装）；
- **双模块教训（再次验证）**：npm 插件把 @deepseek-ai/* 装进 profile node_modules 会遮蔽 workspace 副本、破坏 TOOL_RUNTIME_SCHEDULER 等符号一致性——装完必须 `rm -rf profiles/web/node_modules/@deepseek-ai`，让所有 @deepseek-ai 解析回落到 `$DSH_HOME/profiles/node_modules` 的 workspace 链接。

### 9.2 知识库数据源

- 新增第 5 类数据源 `knowledge`（知识库）：设置字段组、`query_knowledge` 工具、`troubleshoot_evidence` 与 `troubleshoot_status` 同步覆盖；
- 用途：检索同类故障的处置经验与历史工单，作为排查与报告的补充证据。

### 9.3 设置卡片可折叠

- 客户端卡片改为**原生 `<details>/<summary>` 分组折叠**（指标/日志/调用链/CMDB/知识库/全局），无状态管理、构建零依赖；指标组默认展开；
- 每个分组标题显示"已启用"徽标，展开后才是字段表单——5 类数据源 × 11 字段不再一屏铺满。

### 9.4 端到端验证（本次）

- 本地目录 `/api/v1/plugins` 返回 2 条、`?q=troubleshoot` 命中 1 条；
- 商店 RPC `/api/dshmarketplace/search` 经宿主转发命中本地目录；
- 三个插件 client bundle 均在启动图/`/plugins` 下发（故障助手 rev 更新、商店、better-sidebar）；
- fake-LLM（OpenAI 兼容 SSE，无密钥）驱动真实 agent 循环：`query_knowledge` 工具被真实调用、结果回传、回合完成；
- 容器健康、启动无错误。
