# @dsh-tools/troubleshoot-assistant

**故障排查助手** —— DeepSeek Harness 插件：在 Web 设置页配置指标 / 日志 / 调用链 / CMDB 变更历史数据源后，agent 即可基于用户问题做故障排查、按需补充证据并生成故障报告。

## 功能

| 能力 | 说明 |
|---|---|
| 数据源配置（Web 3080） | 设置页 → 插件配置 → 「故障排查助手」卡片：每个数据源可配 URL、认证方式（无 / Bearer / Basic / 自定义头）、Token、用户名/密码、查询路径、超时、说明 |
| 工具 | `troubleshoot_status` 查看可用数据源；`query_metrics` / `query_logs` / `query_trace` / `query_cmdb` 单源查询；`troubleshoot_evidence` 多源并行取证（证据补充）；`generate_fault_report` 生成 Markdown 故障报告（可落盘） |
| 安全 | Token/密码 role('secret') 脱敏；支持 `env:NAME` 引用不落盘；仅 http/https；无内嵌凭据 URL；全链路超时；响应体字节上限；TLS 校验保持开启；错误信息兜底脱敏 |
| 可靠性 | 工具参数 schema 校验；结构化错误码；exec.signal 全程取消；有界并发；报告路径防目录穿越、文件 0600 |

## 安装（docker-compose 容器）

```bash
# 容器内（插件源码挂载在 /app/dsh-troubleshoot-assistant）
docker exec -it dsh-harness bash

# 1) 安装 pnpm（dsh plugin 转发 pnpm）
npm i -g pnpm@11.7.0

# 2) 作为 bundle 加入 web profile（自动写入 dsh.profile.bundles）
dsh plugin --profile web add link:/app/dsh-troubleshoot-assistant

# 3) 重启容器，等待 entry 脚本重建插件并挂载
exit
docker compose restart
# 观察日志：docker compose logs -f dsh
```

> 该插件是 **bundle**（声明 `dsh.bundle.patch`），`dsh plugin add` 会自动把它追加进 `dsh.profile.bundles`，下一次启动即挂载插件行 `troubleshoot-assistant`，无需手工编辑 `cordis.patch.yml`。
>
> 本部署中插件**已预装**（`data/profiles/web/package.json` 的 bundles 已声明，
> 共享目录 `data/profiles/node_modules/@dsh-tools/troubleshoot-assistant` 已就位），
> 无需重复安装；日常开发直接用 `docker-compose.dev.yml`（见下文「开发」）。

## 配置数据源（Web 页面）

1. 打开 `http://127.0.0.1:9488`（docker-compose 把宿主 9488 桥接到容器 3080）；
2. 进入 **设置 → 插件配置**；
3. 找到「故障排查助手 · 数据源配置」卡片，逐项填写并保存。

也可直接编辑 `data/settings.yaml`（容器内 `/opt/dsh/settings.yaml`），热生效。
数据源是**动态数组**（`dataSources`），可在页面任意增删条目、选预设类型或自定义类型：

```yaml
troubleshoot:
  dataSources:
    - id: ds-m1
      type: metrics            # 预设：metrics/logs/trace/cmdb/knowledge；也可自定义（如 es）
      enabled: true
      name: Prometheus
      url: https://prom.example.com
      authType: bearer
      token: env:OBS_TOKEN     # 推荐：只存环境变量名，机密不落盘
      queryPath: /api/v1/query_range   # 留空则用类型默认路径
      timeoutMs: 0             # 0 = 继承插件默认超时
      description: 主指标
    - id: ds-l1
      type: logs
      enabled: true
      name: 应用日志
      url: https://logs.example.com
      authType: basic
      username: ops
      password: env:LOGS_PASSWORD
  defaultTimeRangeMinutes: 60
  maxResults: 200
```

> 若在页面保存 Token，它被写入 `settings.yaml`（role('secret') 在 wire 上脱敏，但文件本身是明文）——请确保 `data/` 目录权限收紧；更推荐 `env:NAME` 引用。

## 备份与迁移（导出 / 导入 / 模板）

卡片下方的「备份与迁移」提供 JSON 文件的批量导出与导入（迁移机器、备份恢复、批量初始化）：

- **导出 JSON**：下载当前全部数据源配置（`GET /api/troubleshoot/export`）。
  `env:NAME` 引用原样保留；字面量明文凭据按安全策略掩码为空（导出文件不含明文机密）。
- **导入 JSON**：选择文件后按【整体替换】语义**暂存**——文件中与现有条目同 id 的按字段
  更新（secret 留空 = 保留现有值）、新 id 的作为新条目、现有但文件中没有的标记删除；
  页面显示导入结果，检查无误点「保存」才落库，点「放弃」取消。
  接受两种格式：`{ "dataSources": [...] }` 或裸数组 `[...]`；以 `_` 开头的键（说明）自动忽略。
- **下载模板**：带逐字段说明与三类示例（bearer/env 引用、basic、自定义类型+header）的
  导入模板（`GET /api/troubleshoot/template`），照示例改成自己的数据源即可导入。

配置存储与升级安全：全部配置在 `data/settings.yaml`（`troubleshoot:` 段），容器重启不受影响；
离线包升级只替换代码不动 `data/`，但"解压覆盖"方式升级前请先备份 `data/settings.yaml`
（详见部署目录 MIGRATE.md「配置存储与备份」）。

## 使用（对 agent 说）

数据源配好后，直接向 agent 提问即可，例如：

- 「查一下 API 服务过去 1 小时 CPU 与错误率，看看是不是资源瓶颈」
- 「先看指标，再按 traceId 查这条失败链路的调用链，最后拉取故障窗口内的应用日志」
- 「这个故障窗口内 CMDB 有没有变更发布？」
- 「把以上证据整理成一份故障报告，写到工作区」

agent 会按需调用 `query_*` / `troubleshoot_evidence` 收集证据，需要补充证据时（如扩大时间窗、换查询词）再调用对应工具，最后用 `generate_fault_report` 产出结构化报告。

## 插件级配置（cordis.yml 行 config）

| 字段 | 默认 | 说明 |
|---|---|---|
| `defaultTimeoutMs` | 15000 | 单请求超时（毫秒） |
| `maxResponseBytes` | 2097152 | 单请求响应体上限（字节） |
| `maxConcurrency` | 4 | 多源取证并发上限 |
| `reportDir` | `''` | 故障报告落盘目录（绝对路径）；空串不落盘 |

示例（profile 的 `cordis.patch.yml`）：

```yaml
- id: troubleshoot-assistant
  config:
    reportDir: /workspace/fault-reports
```

## 开发

**容器内开发循环（推荐，秒级）**——用 `docker-compose.dev.yml`：

```bash
docker compose -f docker-compose.dev.yml up -d     # 从源码重建插件并启动（端口 9489）
# 改完 src/ 后：
docker compose -f docker-compose.dev.yml restart
docker compose -f docker-compose.dev.yml logs -f
```

**宿主构建/测试**（需要 dsh 仓库源码在场）：

```bash
bash link-deps.sh          # 建立到 dsh 仓库的类型/依赖软链（路径自动定位）
node build.mjs             # 产出 lib/index.js + lib/client.js + lib/types
node --test tests/*.spec.ts  # 单元测试（48 用例：http/settings/sop/tools）
```

> 容器内构建用 `SKIP_TYPES=1` 跳过 tsc 类型声明（插件 node_modules 的宿主软链在容器内
> 失效）；类型声明在宿主全量重建即可，运行时只加载 JS 产物。
> 开发全过程与设计决策见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 安全说明

- 数据源 URL 由部署者显式配置，插件必须能访问内网地址，因此**不做域名白名单**；内网网络安全由部署环境策略负责（SSRF 面由"谁配置谁负责"约束）；
- TLS 校验不可关闭（Node/undici 默认）；自签证书请配置正确的 CA 信任；
- 日志与工具结果不会包含 Token；`troubleshoot_status` 只返回 URL 与认证类型。
## 数据源类型（5 类，均可在 Web 配置）

| 类型 | 工具 | 默认查询路径 |
|---|---|---|
| 指标 | `query_metrics` | `/api/v1/query_range` |
| 日志 | `query_logs` | `/search` |
| 调用链 | `query_trace` | `/api/v1/traces` |
| CMDB 变更历史 | `query_cmdb` | `/api/v1/changes` |
| 知识库 | `query_knowledge` | `/api/v1/search` |

设置卡片按数据源**分组折叠**（原生可折叠，指标组默认展开），每个分组带"已启用"标记。

## 本地插件市场（离线商店）

本插件在 dsh web 自身注册 `GET /api/v1/plugins`，提供**本地市场目录**（默认收录本插件与 DSH-better-sidebar）。配合 `DSHM_API=http://127.0.0.1:3080`（dsh-entry.sh 已设置），dshmarketplace-plugin 商店即可离线浏览/搜索/安装。

可用 `Config.catalogExtra` 在 cordis.yml 中追加自定义目录条目。
## 预装保护

本插件随部署预装且**不允许通过 `dsh plugin remove` 卸载**：它不写入 profile 的 `dependencies`（仅保留在 `bundles`），安装于共享目录 `$DSH_HOME/profiles/node_modules`，`dsh plugin --profile web remove @dsh-tools/troubleshoot-assistant` 会被 pnpm 以 `ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS` 拒绝。确需移除时需手工删除共享目录副本与 profile 的 bundles 条目。
## SOP 提示词（按工作区生效）

- 插件在每个会话的提示词组装时，按 **会话工作区 → 全局文件 → 内置默认** 三级解析 `故障排查SOP.md`；
- 不同工作区放各自的 `故障排查SOP.md`（配置 `sopRelativePath`），会话在不同工作区打开即生效不同 SOP；
- 全局基线为 `sopPath`（默认指向默认工作区文件）；编辑保存即生效，无需重启；
- 内置默认含「标准 / 禁止 / 原则 / 证据补充」四部分（面向运维 RCA），见 `src/sop.ts`。

> 目录说明（v2 布局）：插件源码位于 `app/dsh-troubleshoot-assistant`（容器 `/app`），离线市场快照位于 `app/offline-market/plugins.json`；`workspace/` 为纯用户空间（默认工作区 `故障排查使用助手工作区`）。
