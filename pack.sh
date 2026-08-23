#!/usr/bin/env bash
# =============================================================================
# pack.sh — 把整个 dsh 离线部署目录打包成自包含压缩包。
#
# 目标场景：迁移到 arm64 机器（或任意新机器）。
#   1) 把压缩包拷贝过去并解压（建议以 uid 1000 解压，或解压后 chown -R 1000:1000）；
#   2) 编辑 .env 里的 DSH_IMAGE 为 arm64 镜像标签（docker-compose.yml 引用 ${DSH_IMAGE}）；
#   3) docker compose up -d
#   4) dsh-entry.sh 检测到架构变化（.dsh-state/arch 与宿主架构不一致）会自动
#      pnpm install + pnpm build 重装/重建依赖，然后启动 dsh web（3080）。
#
# 打包策略（体积与必要性权衡）：
#   - 排除 deepseek-harness/node_modules（约 1.5G，含 amd64 原生二进制；
#     目标机无论 amd64/arm64 都会按 entry 脚本重新安装，携带纯属浪费；
#     如需携带可设 KEEP_NODE_MODULES=1）；
#   - 排除 deepseek-harness/.git（133M，运行时不需要）；
#   - 排除 build/（1.1G，DSH_IMAGE 镜像的构建上下文，非运行时材料；
#     如需在目标机本地重建镜像可设 KEEP_BUILD=1）；
#   - 保留：源码 + 编译产物（lib/、apps/web dist 等）、data/（DSH_HOME：
#     profiles、sessions、settings、含插件与 profile node_modules——纯 JS 架构无关）、
#     workspace/（含故障排查助手插件）、.dsh-state/、docker-compose.yml、
#     dsh-entry.sh、.env、install、MIGRATE.md。
#
# 用法：
#   ./pack.sh                         # 默认输出 ./dsh-offline-<时间戳>.tar.gz（按本机架构）
#   ./pack.sh --arch amd64            # 指定目标架构 amd64（别名 x86）
#   ./pack.sh --arch arm64            # 指定目标架构 arm64（别名 arm）
#   OUT_DIR=/tmp ./pack.sh            # 指定输出目录
#   KEEP_NODE_MODULES=1 ./pack.sh     # 额外携带 dsh 仓库 node_modules（体积大增）
#   KEEP_BUILD=1 ./pack.sh            # 额外携带镜像构建上下文 build/
#
# # 打包模式：
#   --mode runtime（默认）  精简直跑包：runtime + data + 插件 + 配置，不含源码；目标机解压即跑
#   --mode dev             全量开发包：含源码（deepseek-harness），目标机可重新编译
# 压缩方式：
#   --compress gzip（默认） 兼容性最好；--compress xz 更小（慢）；--compress zstd 快且小
#
# KEEP_RUNTIME（关键！内网直跑模式）：
#   auto（默认）  runtime 模式：./runtime 必须存在且架构 == 目标架构，
#                 否则【报错退出】（防呆：x86 只打 x86 包、arm 只打 arm 包，绝不混合）；
#                 dev 模式：架构匹配才带，不匹配跳过并提示。
#   1            强制带上 ./runtime（架构不匹配时报错退出，防止打出错误架构包）。
#   0            强制精简包（不带 runtime，目标机需联网执行 PHASE 1；仅 dev 模式允许）。
#
# 架构一致性自动处理（无需手工）：
#   - 包内 .env 的 DSH_IMAGE 自动改写为目标架构镜像（打包后恢复本机值）；
#   - 包内 .dsh-state/arch、runtime-arch 自动改写为目标架构（打包后恢复）；
#   - data/profiles 内原生模块（node-pty）打包前自动重建为目标架构
#     （一次性 docker 容器，需本地有目标架构镜像；REBUILD_NATIVE=0 跳过并排除二进制）。
#   - 可用 DSH_IMAGE_AMD64 / DSH_IMAGE_ARM64 显式指定目标镜像（缺省按
#     rocky8-pygojava-wwt_<arch>:<tag> 约定从当前 .env 推导）。
#
#   用法示例（arm64 目标机直跑）：
#     在有网络的 arm64 机器上：docker compose --profile build run --rm dsh-build
#     （构建 arm64 runtime 到 ./runtime），然后 KEEP_RUNTIME=auto ./pack.sh --arch arm64
#     → 把包拷到内网 arm64 机器解压 → docker compose up -d，无需任何安装/编译。
#
# --arch 说明：包内 data/（profiles node_modules 含 node-pty 等原生二进制）架构相关；
#   --arch 写入包内 pack-arch.txt 标记/校验，目标架构 != 本机时自动排除本机
#   node-pty/build，避免错误架构的二进制进包；runtime 需在目标架构机器上构建。
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

OUT_DIR="${OUT_DIR:-$ROOT}"
# OUT_NAME 留空则按架构+时间戳生成（见下方）；用户显式指定时尊重原值
KEEP_NODE_MODULES="${KEEP_NODE_MODULES:-0}"
KEEP_BUILD="${KEEP_BUILD:-0}"
KEEP_GIT="${KEEP_GIT:-0}"
# runtime 携带策略：auto（默认，匹配即带）/ 1（强制带）/ 0（强制精简）
if [ "${PACK_MODE:-runtime}" = "dev" ]; then
  # dev 模式：默认不带 runtime（开发机可自行编译）；显式 KEEP_RUNTIME=1 可带
  KEEP_RUNTIME="${KEEP_RUNTIME:-0}"
else
  # runtime 模式：必须带 runtime（直跑包），默认 auto
  KEEP_RUNTIME="${KEEP_RUNTIME:-auto}"
fi

# --- 目标架构参数：./pack.sh --arch amd64|arm64（x86/arm 为别名） ---
# 说明：包内容是**架构通用**的——原生二进制（node-pty 等）由目标机 PHASE 1
# 按当前架构重建（entry 已自动 pnpm rebuild）。--arch 用于：记录/标记目标架构
# （写入包内 pack-arch.txt），并在"打包时带上本机原生二进制"的情况下校验
# 架构一致（本机架构 != 目标架构时自动排除本机构建的原生二进制，避免跨架构携带）。
ARCH_ARG=""
MODE_ARG=""
COMPRESS_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --compress)
      [ $# -ge 2 ] || { echo "pack: --compress 需要一个值 (gzip|xz|zstd)" >&2; exit 1; }
      COMPRESS_ARG="$2"; shift 2 ;;
    --compress=*)
      COMPRESS_ARG="${1#--compress=}"; shift ;;
    --mode)
      [ $# -ge 2 ] || { echo "pack: --mode 需要一个值 (runtime|dev)" >&2; exit 1; }
      MODE_ARG="$2"; shift 2 ;;
    --mode=*)
      MODE_ARG="${1#--mode=}"; shift ;;
    --arch)
      [ $# -ge 2 ] || { echo "pack: --arch 需要一个值 (amd64|arm64)" >&2; exit 1; }
      ARCH_ARG="$2"; shift 2 ;;
    --arch=*)
      ARCH_ARG="${1#--arch=}"; shift ;;
    -h|--help)
      grep -E '^#   ' "$0" | sed 's/^#   //'; exit 0 ;;
    *)
      echo "pack: 未知参数 $1（支持 --arch amd64|arm64）" >&2; exit 1 ;;
  esac
done
normalize_arch() {
  case "$1" in
    x86_64|x86|amd64) echo amd64 ;;
    aarch64|arm|arm64) echo arm64 ;;
    "") echo "" ;;
    *) echo "pack: 无法识别的架构 $1（支持 amd64/x86、arm64/arm）" >&2; exit 1 ;;
  esac
}
HOST_ARCH="$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')"
PACK_ARCH="$(normalize_arch "${ARCH_ARG:-$HOST_ARCH}")"
echo "pack: 目标架构 = $PACK_ARCH（当前机器 = $HOST_ARCH）"
# ---- 打包模式：runtime（默认，精简直跑）/ dev（全量开发）----
case "${MODE_ARG:-runtime}" in
  runtime) PACK_MODE="runtime" ;;
  dev)     PACK_MODE="dev" ;;
  *) echo "pack: --mode 取值必须为 runtime 或 dev，当前为 '$MODE_ARG'" >&2; exit 1 ;;
esac
echo "pack: 打包模式 = $PACK_MODE"
# ---- 压缩方式：gzip（默认，兼容）/ xz（更小更慢）/ zstd（快+小）----
case "${COMPRESS_ARG:-gzip}" in
  gzip) COMPRESS="gzip"; COMPRESS_EXT="gz" ;;
  xz)   COMPRESS="xz";   COMPRESS_EXT="tar.xz" ;;
  zstd) COMPRESS="zstd"; COMPRESS_EXT="tar.zst" ;;
  *) echo "pack: --compress 取值必须为 gzip/xz/zstd，当前为 '$COMPRESS_ARG'" >&2; exit 1 ;;
esac
echo "pack: 压缩方式 = $COMPRESS"

# 输出文件名按压缩方式调整（含架构段：x86 包与 arm 包并存，互不覆盖）
if [ "${OUT_NAME:-}" = "" ]; then
  OUT_NAME="dsh-offline-${PACK_ARCH}-$(date +%Y%m%d-%H%M%S).tar.${COMPRESS_EXT}"
fi

# ---- 前置检查：必须存在的运行要素 ----
for required in docker-compose.yml dsh-entry.sh .env data/profiles/web/package.json workspace; do
  if [ ! -e "$required" ]; then
    echo "pack: 缺少必需路径 '$required' —— 请从正确的离线部署目录运行" >&2
    exit 1
  fi
done
if [ ! -e app/dsh-troubleshoot-assistant/package.json ]; then
  echo "pack: 警告：未找到 app/dsh-troubleshoot-assistant（故障排查助手插件源码）—— 请确认部署目录完整" >&2
fi

# ---- 生成迁移说明（随包携带） ----
cat > MIGRATE.md <<'MDEOF'
# dsh 离线部署迁移指南（随 pack.sh 生成）

本压缩包为自包含的 dsh 离线部署（deepseek-harness 0.1.1-rc.1 + 故障排查助手插件 + 数据/配置）。

## 预编译（开发机，有网络/目标架构镜像时执行一次）

bash build-runtime.sh --arch <amd64|arm64> [--prod|--dev]
# 一条 docker 命令：编译 dsh 并固化 ./runtime。
# --prod（默认）= 精简生产依赖；--dev = 保留全量（含编译工具链）。
# 注：dsh 是 245 包 monorepo，pnpm 全量安装的 node_modules 即运行时依赖本身，
#     dev 依赖仅占 ~11%，故 --prod 与 --dev 体积差异有限。

## 在目标机器上运行

解压（保持 uid 1000 属主，与容器内 appuser 一致）：
   tar -xzf dsh-offline-*.tar.gz
   # 若以 root 解压，请修正属主：
   # sudo chown -R 1000:1000 .

编辑 .env，把 DSH_IMAGE 换成目标架构的镜像标签（arm64 机器用 arm64 标签）：
   DSH_IMAGE=rocky8-pygojava-wwt_arm64:<版本标签>

### 方式 A：包内含 runtime（内网直跑，推荐；无需联网/编译）
本包为【单一架构】直跑包（包内 pack-arch.txt 与 .dsh-state/runtime-arch 标记架构；
pack.sh 保证包内 runtime / .env 镜像 / data 原生模块三者架构一致）：
   # x86 机器（amd64 包）：
   docker compose up -d
   # arm64 机器（arm64 包）：
   docker compose -f docker-compose.arm.yml up -d
   # 访问：http://127.0.0.1:9488（宿主端口桥接到容器 3080）
   # 无需 PHASE 1、无需 npm/联网。适合内网隔离环境。

### 故障助手插件开发（可选，docker-compose.dev.yml）
   docker compose -f docker-compose.dev.yml up -d
   # 从 app/dsh-troubleshoot-assistant 源码秒级重建插件并启动，端口 9489；
   # 改完源码：docker compose -f docker-compose.dev.yml restart

### 方式 B：精简包（无 runtime）——目标机需先联网执行 PHASE 1
1. PHASE 1（安装）：挂载源码，在镜像内构建并固化运行时（架构变化时自动重装依赖+重建）：
   docker compose --profile build run --rm dsh-build
   # 首次/换架构需联网拉依赖；耗时 20-40 分钟。产物固化到 ./runtime（/opt/dsh-runtime）。

2. PHASE 2（运行）：从固化运行时启动，【不再挂载源码】：
   docker compose up -d

> 日常更新代码：git pull → 重跑 PHASE 1 → docker compose restart。

> 想为内网 arm64 机器打"直跑包"：在【有网络的 arm64 机器】上先
> docker compose --profile build run --rm dsh-build（生成 arm64 runtime），
> 再 KEEP_RUNTIME=auto ./pack.sh --arch arm64，把包拷到内网解压 up -d 即可。

> 目标架构标记：包内 pack-arch.txt 记录了打包时的目标架构（amd64/arm64，由
> pack.sh 的 --arch 参数指定，缺省=打包机器架构）。包内容本身架构通用：原生模块
> （node-pty 等）由目标机 PHASE 1 按当前架构自动重建。跨架构打包时
> （--arch 与打包机器不一致），本机已编译的原生二进制会被自动排除，避免误带。

## 配置存储与备份（重启/升级不丢数据的保证）

- **所有用户配置都在 `data/` 目录**（容器内挂载为 /opt/dsh，即 DSH_HOME），
  与代码（runtime/、app/）分离：
  - `data/settings.yaml` —— 全部设置，按命名空间分段。故障排查助手的数据源在
    `troubleshoot:` 段（dataSources 数组 + 全局默认值）；
  - `data/profiles/` —— 插件安装（web profile 的 node_modules 等）；
  - `data/sessions/`、`data/storages/` —— 会话与存储。
- **重启容器**：`data/` 是宿主机目录（卷挂载），`docker compose restart` /
  容器崩溃重启都不影响——配置、会话原样保留。
- **升级组件**：升级只替换代码（runtime/ 与 app/ 内插件），**不动 data/**。
  注意：若用新离线包"解压覆盖"升级，包内自带的 `data/settings.yaml` 是打包时的
  快照，可能覆盖你现有的配置。安全升级步骤：
  1. 备份：`cp data/settings.yaml data/settings.yaml.bak-$(date +%Y%m%d)`
     （保险起见整个 data/ 也可 `tar czf data-backup.tgz data/`）；
  2. `docker compose down`；
  3. 解压新包（覆盖 runtime/、app/ 等），但**保留你现有的 data/**（或解压后
     用备份恢复 data/settings.yaml）；
  4. `docker compose up -d`。
- **页面级备份（推荐日常使用）**：故障排查助手设置页有"备份与迁移"——
  「导出 JSON」把数据源配置（含 env: 环境变量引用；明文凭据按安全策略不导出）
  下载为 JSON 文件；换机器/恢复时「导入 JSON」整体导入（先暂存、检查后点保存生效）。
  「下载模板」可获取带逐字段说明的导入模板。

## 说明

- 本包是否含 runtime：解压后查看是否存在 runtime/ 目录；pack.sh 用 KEEP_RUNTIME=auto/1/0 控制（见 pack.sh 头部注释）。
- deepseek-harness/node_modules 未打包：目标机按架构重新安装（需要网络）；含 runtime 的包则无需安装。
- **已预装插件**（web profile）：dshmarketplace-plugin（插件商店）、dsh-better-sidebar（侧边栏）、
  @dsh-tools/troubleshoot-assistant（故障排查助手）。
- **插件市场（与宿主 3080 一致 + 离线可用）**：使用 dshmarket 插件；目录端点由故障排查助手在
  dsh web 自身提供（/api/dshmarket/plugins.json），dsh-entry.sh 已设置
  DSHM_REGISTRY_URL=http://127.0.0.1:3080/api/dshmarket/plugins.json —— 优先返回官方目录的
  本地快照（app/offline-market/plugins.json，1685 个插件离线可浏览），快照缺失时回退兜底目录。
- 市场源码随包携带：app/dsh-plugins-store/、app/dsh-plugin/。
- **目录分工**：workspace/ = 用户空间（仅 故障排查使用助手工作区）；app/ = 项目材料
  （插件源码 app/dsh-troubleshoot-assistant、离线市场快照 app/offline-market、市场源码 app/dsh-plugins-store、app/dsh-plugin），
  容器内挂载 /app。
- **默认工作区（随包挂载）**：workspace/故障排查使用助手工作区/（容器内 /workspace/故障排查使用助手工作区）：
  含 使用手册.md 与 故障排查SOP.md（用户可编辑提示词）。
- **SOP 按工作区生效**：每个工作区可放自己的 故障排查SOP.md（会话在此工作区打开时生效）；
  没有的用默认工作区的 SOP 兜底，再没有用插件内置默认。编辑即生效。
- **预装插件保护**：故障排查助手（@dsh-tools/troubleshoot-assistant）为内置插件——不随 profile 的
  dependencies 管理，安装于共享目录 $DSH_HOME/profiles/node_modules，`dsh plugin remove` 无法卸载
  （pnpm 报 ERR_PNPM_CANNOT_REMOVE_MISSING_DEPS）。需要卸载请先手动移除 data/profiles/node_modules
  下的对应目录与 data/profiles/web/package.json 的 bundles 条目。
- data/ 为 DSH_HOME（profiles/sessions/settings 等），随包迁移；
  若不需要旧会话可在解压后删除 data/sessions 等子目录。
- .env 内含 DEEPSEEK_API_KEY 等凭据，请妥善保管本压缩包。
- 如需在目标机本地重建 DSH_IMAGE 镜像（不依赖 registry），请携带 build/ 目录
  （KEEP_BUILD=1 重新打包）。
MDEOF
chmod +x MIGRATE.md 2>/dev/null || true
echo "pack: 已生成 MIGRATE.md"

# ---- 组装 tar 排除项 ----
EXCLUDES=(
  --exclude="dsh-offline-*.tar.*"
  --exclude='./MIGRATE.md.tmp'
)

if [ "$KEEP_GIT" != "1" ]; then
  EXCLUDES+=(--exclude='deepseek-harness/.git')
fi
if [ "$KEEP_NODE_MODULES" != "1" ]; then
  # 排除 dsh 仓库内所有层级的 node_modules（含 .pnpm 虚拟存储、原生二进制）。
  EXCLUDES+=(
    --exclude='deepseek-harness/node_modules'
    --exclude='deepseek-harness/*/node_modules'
    --exclude='deepseek-harness/*/*/node_modules'
    --exclude='deepseek-harness/*/*/*/node_modules'
    --exclude='deepseek-harness/*/*/*/*/node_modules'
    --exclude='./workspace/*/node_modules'
  )
fi
if [ "$KEEP_BUILD" != "1" ]; then
  # 注意：顶层 build/ 不在下方 tar 参数列表中，天然不会进包，无需 exclude。
  # （GNU tar 的 --exclude 模式即使带斜杠也是“后缀匹配”，
  #   写 'build' 或 'build/*' 都会误伤任意深度的 build 目录，如 node-pty/build。）
  :
fi
# ---- runtime 携带策略（KEEP_RUNTIME: auto / 1 / 0）----
# runtime/ 是 PHASE 1 固化的完整构建产物（node_modules + packages + apps），架构相关。
# 【防呆原则：x86 打包 x86 的、arm 打包 arm 的，绝不混合】
#   - runtime 模式（默认）：runtime 必须存在且架构 == 目标架构，否则报错退出；
#   - dev 模式：runtime 可选（架构匹配才带，不匹配跳过并提示）。
INCLUDE_RUNTIME=0
RUNTIME_ARCH=""
if [ -f ".dsh-state/runtime-arch" ]; then
  RUNTIME_ARCH="$(cat .dsh-state/runtime-arch)"
fi
if [ "$PACK_MODE" = "runtime" ] && [ "$KEEP_RUNTIME" = "0" ]; then
  echo "pack: 错误：runtime 模式必须包含 runtime（KEEP_RUNTIME 不能为 0）—— 直跑包需要运行时" >&2
  exit 1
fi
if [ -d "runtime" ] && [ -d "runtime/apps/cli" ]; then
  case "$KEEP_RUNTIME" in
    auto|1)
      if [ "$RUNTIME_ARCH" != "$PACK_ARCH" ]; then
        echo "pack: 错误：runtime 架构（$RUNTIME_ARCH）与目标架构（$PACK_ARCH）不一致 —— 禁止打出混合架构包" >&2
        echo "pack: 处理：先就位 $PACK_ARCH 的 runtime（bash build-runtime.sh --arch $PACK_ARCH，" >&2
        echo "pack:        或把已构建的 $PACK_ARCH runtime 目录换到 ./runtime 并同步 .dsh-state/runtime-arch），" >&2
        echo "pack:        然后重跑 ./pack.sh --arch $PACK_ARCH" >&2
        exit 1
      fi
      INCLUDE_RUNTIME=1
      echo "pack: runtime 架构匹配（$PACK_ARCH）——已包含，目标机解压即跑（免 PHASE 1）" ;;
    0)
      if [ "$PACK_MODE" = "runtime" ]; then
        echo "pack: 错误：runtime 模式必须包含 runtime（KEEP_RUNTIME 不能为 0）" >&2
        exit 1
      fi
      INCLUDE_RUNTIME=0
      echo "pack: KEEP_RUNTIME=0 —— 精简包，目标机需联网执行 PHASE 1" ;;
    *)
      echo "pack: KEEP_RUNTIME 取值必须为 auto/1/0，当前为 '$KEEP_RUNTIME'" >&2
      exit 1 ;;
  esac
else
  if [ "$PACK_MODE" = "runtime" ] || [ "$KEEP_RUNTIME" = "1" ]; then
    echo "pack: 错误：./runtime 不存在或未构建（缺少 runtime/apps/cli）—— 请先构建 $PACK_ARCH runtime：bash build-runtime.sh --arch $PACK_ARCH" >&2
    exit 1
  fi
  echo "pack: 未找到 ./runtime —— 精简包，目标机需先执行 PHASE 1（联网）"
fi
# 构建中间产物（可再生成，避免陈旧产物干扰目标机重建判断）：
# - lib/（编译产物）：PHASE 1 在目标机必然重建（无 node_modules → NEED_BUILD=1），排除以缩小体积；
# - tsbuildinfo / website node_modules：同上。
EXCLUDES+=(
  --exclude='deepseek-harness/*/lib'
  --exclude='deepseek-harness/*/*/lib'
  --exclude='deepseek-harness/*/*/*/lib'
  --exclude='deepseek-harness/*/*/*/*/lib'
  --exclude='deepseek-harness/*.tsbuildinfo'
  --exclude='deepseek-harness/website/node_modules'
  # pnpm 缓存 / 构建缓存（架构相关、体积巨大；目标机 PHASE 1 重建）
  --exclude='deepseek-harness/.pnpm-store'
  --exclude='deepseek-harness/.turbo'
  --exclude='deepseek-harness/coverage'
  # data 内的 pnpm/npm 缓存（架构相关、体积巨大；目标机 PHASE 1 重建）
  --exclude='data/.pnpm-store'
  --exclude='data/.npm-cache'
  # runtime/.pnpm-store（构建期 pnpm 内容寻址缓存，2G+，含双架构残留二进制）：
  # 运行时【不需要】——node_modules 里的文件是它的硬链接，tar 解压后即为独立
  # 常规文件；dsh-entry.sh 把未来 pnpm install 的 store 指向 $DSH_HOME/.pnpm-store
  # （data/.pnpm-store），与 runtime 内的这份无关。排除后整包 770MB → 约 465MB。
  # 若目标机要复用该缓存做 pnpm install（极少见），可设 KEEP_PNPM_STORE=1 保留。
)
if [ "${KEEP_PNPM_STORE:-0}" = "1" ]; then
  echo "pack: KEEP_PNPM_STORE=1 —— 保留 runtime/.pnpm-store（体积大增）"
else
  EXCLUDES+=(--exclude='runtime/.pnpm-store')
fi

# 架构相关处理（node-pty 等原生模块）：
# - 始终排除 node-pty 的 prebuilds（darwin/win32 预编译，Linux 上 58M 纯浪费）；
# - data/profiles/*/node_modules 里的原生二进制（node-pty/build/Release/*.node）是
#   架构相关且跨包共享的：打包前自动重建为【目标架构】（一次性 docker 容器，
#   与 dsh-entry.sh build 阶段的 pnpm rebuild 等价），保证包内 data 与目标架构一致；
#   打包完成后若目标架构 != 本机架构，再重建回本机架构（保住本地环境）。
#   REBUILD_NATIVE=0 可跳过重建（此时若架构不匹配，把二进制排除出包，
#   目标机 PHASE 1 会重建）。
EXCLUDES+=(
  --exclude='data/profiles/*/node_modules/node-pty/prebuilds'
  --exclude='data/profiles/*/node_modules/*/node_modules/node-pty/prebuilds'
)
# runtime 内的 node-pty prebuilds（npm 包自带全平台预编译，约 23MB）：
# 只保留目标平台（node-pty 的 install 脚本 prebuild.js 按平台挑选；
# packages/terminal 运行时确实会加载它），排除其余平台
# （win32/darwin 在 Linux 无用，另一个 linux 平台是错误架构）。
EXCLUDES+=(
  --exclude='runtime/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/win32-x64'
  --exclude='runtime/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/win32-arm64'
  --exclude='runtime/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/darwin-x64'
  --exclude='runtime/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/darwin-arm64'
)
case "$PACK_ARCH" in
  amd64) EXCLUDES+=(--exclude='runtime/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/linux-arm64') ;;
  arm64) EXCLUDES+=(--exclude='runtime/node_modules/.pnpm/node-pty@*/node_modules/node-pty/prebuilds/linux-x64') ;;
esac
PNPM_VERSION="11.7.0"
CURRENT_IMAGE="$(sed -n 's/^DSH_IMAGE=//p' .env | head -1)"
IMAGE_TAG="${CURRENT_IMAGE##*:}"
# 推导目标架构的镜像：显式 DSH_IMAGE_AMD64/DSH_IMAGE_ARM64 优先；
# 否则按当前 .env 镜像名替换架构段（rocky8-pygojava-wwt_<arch>:<tag> 约定）。
derive_target_image() {
  local arch="$1" other
  case "$arch" in
    amd64) other=arm64 ;;
    arm64) other=amd64 ;;
  esac
  case "$arch" in
    amd64) [ -n "${DSH_IMAGE_AMD64:-}" ] && { printf '%s\n' "$DSH_IMAGE_AMD64"; return; } ;;
    arm64) [ -n "${DSH_IMAGE_ARM64:-}" ] && { printf '%s\n' "$DSH_IMAGE_ARM64"; return; } ;;
  esac
  case "$CURRENT_IMAGE" in
    *_${arch}*) printf '%s\n' "$CURRENT_IMAGE"; return ;;
    *_${other}*) printf '%s\n' "${CURRENT_IMAGE/_${other}/_${arch}}"; return ;;
  esac
  printf '%s\n' "rocky8-pygojava-wwt_${arch}:${IMAGE_TAG}"
}
# 报告一个 .node 二进制的架构（amd64/arm64/unknown）。
native_arch_of() {
  local f="$1" sig
  sig="$(file -b "$f" 2>/dev/null || true)"
  case "$sig" in
    *"ARM aarch64"*) echo arm64 ;;
    *"x86-64"*) echo amd64 ;;
    *) echo unknown ;;
  esac
}
# 用一次性容器按指定架构重建 data 内 profile 的原生模块（node-pty）。
rebuild_profile_native() {
  local arch="$1" image
  image="$(derive_target_image "$arch")"
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "pack: 错误：本地没有镜像 $image —— 无法为 $arch 重建原生模块（先 docker pull，或 REBUILD_NATIVE=0 跳过并把二进制排除出包）" >&2
    exit 1
  fi
  echo "pack: 重建 data 原生模块 → $arch（镜像 $image）..."
  docker run --rm --platform "linux/$arch" --entrypoint /bin/bash \
    -v "$ROOT/data:/opt/dsh" \
    -e npm_config_cache=/opt/dsh/.npm-cache \
    "$image" \
    -c "su appuser -c 'cd /opt/dsh/profiles/web && npx -y pnpm@$PNPM_VERSION rebuild node-pty'" >/dev/null
  echo "pack: data 原生模块已重建为 $arch"
}
# 探测 data 内 node-pty 当前架构
DATA_NATIVE_ARCH=""
for npty in data/profiles/*/node_modules/node-pty/build/Release/pty.node \
            data/profiles/*/node_modules/*/node_modules/node-pty/build/Release/pty.node; do
  if [ -f "$npty" ]; then
    DATA_NATIVE_ARCH="$(native_arch_of "$npty")"
    break
  fi
done
NATIVE_REBUILT_FOR=""
if [ "${REBUILD_NATIVE:-1}" = "1" ]; then
  if [ "$DATA_NATIVE_ARCH" != "$PACK_ARCH" ]; then
    rebuild_profile_native "$PACK_ARCH"
    NATIVE_REBUILT_FOR="$PACK_ARCH"
  else
    echo "pack: data 原生模块已是 $PACK_ARCH，无需重建"
  fi
else
  if [ -n "$DATA_NATIVE_ARCH" ] && [ "$DATA_NATIVE_ARCH" != "$PACK_ARCH" ]; then
    echo "pack: 警告：REBUILD_NATIVE=0 且 data 原生模块架构（$DATA_NATIVE_ARCH）!= 目标（$PACK_ARCH）—— 二进制将被排除出包，目标机 PHASE 1 重建"
    EXCLUDES+=(
      --exclude='data/profiles/*/node_modules/node-pty/build'
      --exclude='data/profiles/*/node_modules/*/node_modules/node-pty/build'
    )
  fi
fi

# 架构标记（写入包内，目标机可确认该包面向的架构）
echo "$PACK_ARCH" > pack-arch.txt

# ---- 包内 .env 与 .dsh-state 按目标架构改写（打包后恢复本机值）----
# .env 的 DSH_IMAGE 必须与包的目标架构一致，否则目标机 compose 会用错镜像；
# .dsh-state/arch 与 runtime-arch 必须与包内 runtime 架构一致，否则 entry run
# 阶段的架构防呆会拒绝启动。
TARGET_IMAGE="$(derive_target_image "$PACK_ARCH")"
RESTORE_FILES=()
if [ "$TARGET_IMAGE" != "$CURRENT_IMAGE" ]; then
  cp .env .env.pack-backup
  sed -i "s|^DSH_IMAGE=.*|DSH_IMAGE=${TARGET_IMAGE}|" .env
  RESTORE_FILES+=(.env)
  echo "pack: 包内 .env DSH_IMAGE → $TARGET_IMAGE"
fi
for f in .dsh-state/arch .dsh-state/runtime-arch; do
  if [ -f "$f" ] && [ "$(cat "$f")" != "$PACK_ARCH" ]; then
    cp "$f" "$f.pack-backup"
    echo "$PACK_ARCH" > "$f"
    RESTORE_FILES+=("$f")
  fi
done
[ ${#RESTORE_FILES[@]} -gt 0 ] && echo "pack: 包内架构标记 → $PACK_ARCH（.dsh-state）"

# 清理历史压缩包（避免堆积）：只删【同架构】旧包，保留其他架构的包
# （x86 包与 arm 包并存，互不覆盖）；保留本次 OUT_NAME（若与旧包重名会覆盖）。
rm -f "$OUT_DIR"/dsh-offline-${PACK_ARCH}-*.tar.gz "$OUT_DIR"/dsh-offline-${PACK_ARCH}-*.tar.xz "$OUT_DIR"/dsh-offline-${PACK_ARCH}-*.tar.zst
mkdir -p "$OUT_DIR"
echo "pack: 已清理同架构历史压缩包（$OUT_DIR/dsh-offline-${PACK_ARCH}-*.tar.*；其他架构包保留）"
echo "pack: 开始打包 → $OUT_DIR/$OUT_NAME（目标架构 $PACK_ARCH）"
echo "pack: 排除项：${EXCLUDES[*]}"

# runtime 模式：精简直跑包（不含源码，目标机零编译）；dev 模式：全量（含源码）。
# 三个 compose 全部随包：docker-compose.yml（amd64 生产）、docker-compose.arm.yml
# （arm64 生产）、docker-compose.dev.yml（故障助手插件开发，端口 9489）。
TAR_ARGS=(.env docker-compose.yml docker-compose.arm.yml docker-compose.dev.yml dsh-entry.sh dsh-dev-entry.sh install MIGRATE.md pack-arch.txt .dsh-state data workspace app docs)
if [ "$PACK_MODE" = "dev" ]; then
  TAR_ARGS+=(deepseek-harness)
  echo "pack: dev 模式 —— 携带源码（deepseek-harness），包体积较大"
else
  echo "pack: runtime 模式 —— 精简包（不含源码），目标机解压即跑"
fi
if [ "$INCLUDE_RUNTIME" = "1" ]; then
  TAR_ARGS+=(runtime)
fi

case "$COMPRESS" in
  gzip) tar --anchored -czf "$OUT_DIR/$OUT_NAME" "${EXCLUDES[@]}" "${TAR_ARGS[@]}" ;;
  xz)   tar --anchored -cJf "$OUT_DIR/$OUT_NAME" "${EXCLUDES[@]}" "${TAR_ARGS[@]}" ;;
  zstd) tar --anchored -c --zstd -f "$OUT_DIR/$OUT_NAME" "${EXCLUDES[@]}" "${TAR_ARGS[@]}" ;;
esac
rm -f pack-arch.txt

# ---- 恢复本机 .env / .dsh-state / 原生模块架构 ----
for f in "${RESTORE_FILES[@]}"; do
  mv "$f.pack-backup" "$f"
done
[ ${#RESTORE_FILES[@]} -gt 0 ] && echo "pack: 本机 .env / .dsh-state 已恢复"
if [ -n "$NATIVE_REBUILT_FOR" ] && [ "$HOST_ARCH" != "$PACK_ARCH" ]; then
  rebuild_profile_native "$HOST_ARCH"
fi

SIZE=$(du -h "$OUT_DIR/$OUT_NAME" | cut -f1)
echo "pack: 完成 → $OUT_DIR/$OUT_NAME（$SIZE）"
if [ "$INCLUDE_RUNTIME" = "1" ]; then
  echo "pack: 本包含 runtime —— 目标机解压后 docker compose up -d 即可直接运行（免 PHASE 1）"
else
  echo "pack: 本包为精简包 —— 目标机需先执行 PHASE 1（docker compose --profile build run --rm dsh-build）"
fi
echo "pack: 迁移步骤见包内 MIGRATE.md（或当前目录 MIGRATE.md）"
