# dsh 离线部署（deepseek-harness + 故障排查助手）

把 DeepSeek Harness（dsh，245 包 TypeScript monorepo）连同**故障排查助手插件**打包成
**自包含、可离线运行**的部署，支持 **x86（amd64）** 与 **arm（arm64）** 双架构，
面向内网隔离环境（无 npm / 无外网 / 无需编译即可运行）。

本目录既是**开发机**（本机 x86），也是**迁移源**（产出两个架构的直跑包）。

---

## 目录结构

```
offline/
├── deepseek-harness/        # dsh 源码（monorepo；仅 dev 打包/重编译时需要，运行时不挂载）
├── runtime/                 # 当前架构的预编译运行时（node_modules + packages + apps）
│                            #   本机为 amd64；arm64 版在 runtime-arm64/
├── runtime-arm64/           # arm64 运行时（打包 arm 包时换到 ./runtime）
├── data/                    # DSH_HOME：会话 / 配置 / profiles（含预装插件的 node_modules）
│   └── profiles/web/        #   web profile 的 bundles（dshmarket / better-sidebar / 故障助手等）
├── app/                     # 项目材料（非用户空间，挂载到容器 /app）
│   └── dsh-troubleshoot-assistant/   # ★ 故障排查助手插件源码（src/lib/tests/docs）
├── workspace/               # 用户空间（挂载到容器 /workspace；默认工作区 + SOP）
├── build/                   # 镜像构建上下文（非运行时材料）
├── docker-compose.yml       # 生产编排（amd64 本机）
├── docker-compose.arm.yml   # 生产编排（arm64 内网机）
├── docker-compose.dev.yml   # 故障助手插件【开发/测试】编排（端口 9489）
├── dsh-entry.sh             # 生产入口（build / build:prod / run 三阶段）
├── dsh-dev-entry.sh         # 开发入口（源码重建插件 → 刷新副本 → run）
├── build-runtime.sh         # 预编译 runtime（一条 docker 命令，固化到 ./runtime）
├── pack.sh                  # 打包（--arch amd64|arm64，架构防呆 + 原生模块自动重建）
├── .env                     # DSH_IMAGE / API Key（按架构切换）
├── .dsh-state/              # 架构/构建状态标记（arch、runtime-arch）
├── MIGRATE.md               # 迁移指南（pack.sh 生成，随包携带）
└── dsh-offline-<arch>-*.tar.gz   # ★ 直跑包（amd64 / arm64 各一份，互不覆盖）
```

---

## 三个 compose 文件（按用途选择）

| 文件 | 用途 | 端口 | 命令 |
|---|---|---|---|
| `docker-compose.yml` | **生产**（本机 x86 / amd64） | 9488 | `docker compose up -d` |
| `docker-compose.arm.yml` | **生产**（内网 arm64） | 9488 | `docker compose -f docker-compose.arm.yml up -d` |
| `docker-compose.dev.yml` | **故障助手插件开发/测试** | 9489 | `docker compose -f docker-compose.dev.yml up -d` |

- 生产编排**不挂载 dsh 源码**，只从 `./runtime` 启动（编译与运行分离）。
- dev 编排复用 `./runtime` 的依赖，从 `app/dsh-troubleshoot-assistant` **源码秒级重建插件**
  并刷新已安装副本，再启动 dsh web——改完源码 `restart` 即生效，无需 20–40 分钟全量编译。
- 端口 9488（生产）与 9489（开发）**可并存**。

---

## 端口与访问

| 宿主端口 | 容器端口 | 说明 |
|---|---|---|
| 9488 | 3090 → 3080 | dsh web（生产）；socat 桥接，dsh web 本身只监听 127.0.0.1 |
| 9489 | 3090 → 3080 | dsh web（开发，故障助手） |

浏览器访问 `http://127.0.0.1:9488`（生产）或 `http://127.0.0.1:9489`（开发）。
进入 **设置 → 插件配置** 可配置故障排查助手的数据源。

---

## 故障排查助手插件

源码：`app/dsh-troubleshoot-assistant/`（容器内 `/app/dsh-troubleshoot-assistant`）。
已**预装**到 web profile（`data/profiles/web/package.json` 的 bundles + 共享目录
`data/profiles/node_modules/@dsh-tools/troubleshoot-assistant`），并注册本地离线插件市场
（`GET /api/dshmarket/plugins.json`）。

- 能力：可配置 指标/日志/调用链/CMDB/知识库 数据源，agent 按需取证、生成故障报告。
- 安全：Token/密码 `role('secret')` 脱敏、`env:NAME` 引用不落盘、仅 http/https、全链路超时、
  响应体上限、报告路径防目录穿越、文件 0600。
- 测试：`node --test tests/*.spec.ts`（48 用例，http/settings/sop/tools 全覆盖）。
- 详见插件内 [README](app/dsh-troubleshoot-assistant/README.md) 与
  [docs/DEVELOPMENT.md](app/dsh-troubleshoot-assistant/docs/DEVELOPMENT.md)。

### 插件开发循环（本机）

```bash
docker compose -f docker-compose.dev.yml up -d        # 启动（从源码重建插件）
# …改 app/dsh-troubleshoot-assistant/src/ …
docker compose -f docker-compose.dev.yml restart      # 秒级重建 + 重启
docker compose -f docker-compose.dev.yml logs -f      # 看日志
# 宿主单测（可选）：
cd app/dsh-troubleshoot-assistant && bash link-deps.sh && node --test tests/*.spec.ts
```

---

## 构建与打包

### 预编译 runtime（需要网络，按目标架构）

```bash
bash build-runtime.sh --arch amd64     # 本机 x86
bash build-runtime.sh --arch arm64     # 交叉编译 arm64（本机需有 arm64 镜像 + binfmt）
```

产物固化到 `./runtime`，并写入 `.dsh-state/runtime-arch`。

### 打直跑包（架构防呆，绝不混合）

```bash
./pack.sh --arch amd64     # → dsh-offline-amd64-<时间戳>.tar.gz
./pack.sh --arch arm64     # → dsh-offline-arm64-<时间戳>.tar.gz
```

`pack.sh` 的**架构一致性保证**（x86 只打 x86、arm 只打 arm）：

1. **runtime 防呆**：`./runtime` 必须存在且架构 == 目标架构，否则**报错退出**（不打混合包）；
2. **镜像改写**：包内 `.env` 的 `DSH_IMAGE` 自动改为目标架构镜像（打包后恢复本机值）；
3. **状态标记**：包内 `.dsh-state/arch`、`runtime-arch` 自动改为目标架构（打包后恢复）；
4. **原生模块**：`data/profiles` 里的 node-pty 等原生二进制打包前**自动重建为目标架构**
   （一次性 docker 容器），打包后若目标 != 本机架构则重建回本机架构；
5. **体积**：排除 `runtime/.pnpm-store`（2G+ 构建缓存，运行时不需要）与 node-pty 的
   darwin/win32 prebuilds。

包名含架构段，两个架构的包**并存互不覆盖**；清理只删同架构旧包。

---

## 迁移到内网 arm64 机器

1. 把 `dsh-offline-arm64-*.tar.gz` 拷到 arm64 机器；
2. 解压（建议 uid 1000，或解压后 `chown -R 1000:1000`）；
3. `docker compose -f docker-compose.arm.yml up -d`；
4. 访问 `http://127.0.0.1:9488`。

包内已含 arm64 runtime + arm64 镜像标记 + arm64 原生模块，**无需联网 / 编译 / PHASE 1**。
详细步骤见包内 `MIGRATE.md`。

---

## 关键约定

- **编译与运行分离**：`docker-compose` 只负责运行；编译由 `build-runtime.sh` 独立完成。
- **架构标记**：`.dsh-state/arch`（最近 PHASE 1 架构）、`.dsh-state/runtime-arch`（runtime 架构）。
  entry 的 run 阶段会校验 runtime 架构与容器架构一致，不一致**大声报错**（防呆）。
- **用户空间隔离**：`workspace/` 只放用户文件；项目/插件/脚本放 `app/`。
- **镜像**：`rocky8-pygojava-wwt_{amd64,arm64}:v20260817`（`.env` 的 `DSH_IMAGE` 切换）。
