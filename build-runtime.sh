#!/usr/bin/env bash
# =============================================================================
# build-runtime.sh — 预编译 dsh 生产运行时（在【有网络】的开发机上执行一次）。
#
# 用法：
#   bash build-runtime.sh                  # 按本机架构编译（amd64/arm64 自动识别）
#   bash build-runtime.sh --arch arm64     # 显式指定目标架构
#   bash build-runtime.sh --image <tag>    # 指定镜像（默认读 .env 的 DSH_IMAGE）
#   bash build-runtime.sh --prod           # 精简模式：prune dev 依赖（默认）
#   bash build-runtime.sh --dev            # 开发模式：保留全量依赖（含编译工具链）
#
# 产物：./runtime/（/opt/dsh-runtime），供 docker-compose up -d 直接运行，
#       以及 pack.sh --mode runtime/dev 打包。
# 说明：这【不是】把编译过程放进 docker-compose；docker-compose 只运行
#       这里编译好的生产运行时。目标机（内网）无需 npm/网络/编译。
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# 默认值
ARCH_ARG=""
IMAGE_ARG=""
MODE="prod"

while [ $# -gt 0 ]; do
  case "$1" in
    --arch)  [ $# -ge 2 ] || { echo "build-runtime: --arch 需要值 (amd64|arm64)" >&2; exit 1; }; ARCH_ARG="$2"; shift 2 ;;
    --image) [ $# -ge 2 ] || { echo "build-runtime: --image 需要值" >&2; exit 1; }; IMAGE_ARG="$2"; shift 2 ;;
    --prod)  MODE="prod"; shift ;;
    --dev)   MODE="dev"; shift ;;
    -h|--help) grep -E "^#   " "$0" | sed "s/^#   //"; exit 0 ;;
    *) echo "build-runtime: 未知参数 $1" >&2; exit 1 ;;
  esac
done

normalize_arch() {
  case "$1" in
    x86_64|x86|amd64) echo amd64 ;;
    aarch64|arm|arm64) echo arm64 ;;
    *) echo "build-runtime: 无法识别的架构 $1" >&2; exit 1 ;;
  esac
}

HOST_ARCH="$(uname -m | sed "s/x86_64/amd64/; s/aarch64/arm64/")"
ARCH="$(normalize_arch "${ARCH_ARG:-$HOST_ARCH}")"
echo "build-runtime: 目标架构 = $ARCH（当前机器 = $HOST_ARCH）"

if [ -n "$IMAGE_ARG" ]; then
  IMAGE="$IMAGE_ARG"
else
  if [ -f .env ]; then
    set -a; source .env; set +a
    IMAGE="${DSH_IMAGE:-}"
  fi
  if [ -z "${IMAGE:-}" ]; then
    echo "build-runtime: 未找到 DSH_IMAGE（.env 缺失或未设置）——请用 --image 指定" >&2
    exit 1
  fi
fi
# 镜像架构防呆：单架构镜像 + --platform 不匹配时 docker 会报“Unable to find image
# locally”然后尝试联网拉取（内网必挂）。这里按命名约定（..._<arch>:<tag>）自动推导
# 目标架构镜像；推导不出或本地没有则大声报错。
case "$IMAGE" in
  *_amd64:*)
    if [ "$ARCH" = "arm64" ]; then
      CANDIDATE="${IMAGE/_amd64/_arm64}"
      if docker image inspect "$CANDIDATE" >/dev/null 2>&1; then
        echo "build-runtime: 镜像架构与目标不符，自动切换 → $CANDIDATE"
        IMAGE="$CANDIDATE"
      else
        echo "build-runtime: 错误：目标架构 $ARCH，但镜像是 amd64（$IMAGE），本地也没有 $CANDIDATE" >&2
        exit 1
      fi
    fi ;;
  *_arm64:*)
    if [ "$ARCH" = "amd64" ]; then
      CANDIDATE="${IMAGE/_arm64/_amd64}"
      if docker image inspect "$CANDIDATE" >/dev/null 2>&1; then
        echo "build-runtime: 镜像架构与目标不符，自动切换 → $CANDIDATE"
        IMAGE="$CANDIDATE"
      else
        echo "build-runtime: 错误：目标架构 $ARCH，但镜像是 arm64（$IMAGE），本地也没有 $CANDIDATE" >&2
        exit 1
      fi
    fi ;;
esac
echo "build-runtime: 使用镜像 $IMAGE"

echo "build-runtime: 前置检查（源码、必要文件）..."
for required in deepseek-harness/package.json docker-compose.yml dsh-entry.sh data/profiles/web/package.json; do
  [ -e "$required" ] || { echo "build-runtime: 缺少 $required —— 请从正确的离线部署目录运行" >&2; exit 1; }
done

ENTRY_MODE="build"
[ "$MODE" = "prod" ] && ENTRY_MODE="build:prod"
echo "build-runtime: 执行 PHASE 1（$ENTRY_MODE，$ARCH）—— 一条 docker 命令完成编译并固化 runtime ..."

docker run --rm \
  --platform "linux/$ARCH" \
  --entrypoint /bin/bash \
  -v "$ROOT/deepseek-harness:/workspace/dsh" \
  -v "$ROOT/runtime:/opt/dsh-runtime" \
  -v "$ROOT/data:/opt/dsh" \
  -v "$ROOT/workspace:/workspace" \
  -v "$ROOT/app:/app" \
  -v "$ROOT/.dsh-state:/opt/dsh-state" \
  -v "$ROOT/dsh-entry.sh:/usr/local/bin/dsh-entry.sh:ro" \
  -e DSH_HOME=/opt/dsh \
  -e DSH_TELEMETRY_DISABLED=1 \
  -e "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}" \
  -e "DEEPSEEK_BASE_URL=${DEEPSEEK_BASE_URL:-}" \
  -e "UNSLOTH_API_KEY=${UNSLOTH_API_KEY:-}" \
  "$IMAGE" \
  -c "/usr/local/bin/dsh-entry.sh $ENTRY_MODE"

# ---- 修剪：移除错误架构的平台包（pnpm 虚拟存储）----
# 新 lockfile（0.1.1-rc.1 起）把平台包全部声明为 optional，pnpm 会把 linux 双平台
# 都装进 .pnpm 虚拟存储（错误架构的约 600M+ 死重，且违反“不混合架构”原则）。
# 错误架构的平台包运行时永远不会被加载（包装脚本按 process.platform 选择），
# 安全修剪：1) 删除指向错误架构包的符号链接；2) 删除错误架构包目录。
if [ "$ARCH" = "amd64" ]; then WRONG_ARCH="arm64"; else WRONG_ARCH="x64"; fi
echo "build-runtime: 修剪错误架构平台包（linux-$WRONG_ARCH）..."
PRUNED_LINKS=0
while IFS= read -r -d '' link; do
  case "$(readlink "$link")" in
    *linux-${WRONG_ARCH}*) rm -f "$link"; PRUNED_LINKS=$((PRUNED_LINKS+1)) ;;
  esac
done < <(find runtime/node_modules -type l -print0 2>/dev/null)
PRUNED_DIRS=0
while IFS= read -r -d '' dir; do
  rm -rf "$dir"; PRUNED_DIRS=$((PRUNED_DIRS+1))
done < <(find runtime/node_modules/.pnpm -maxdepth 1 -type d -name "*linux-${WRONG_ARCH}*" -print0 2>/dev/null)
echo "build-runtime: 已修剪 $PRUNED_DIRS 个错误架构包目录 + $PRUNED_LINKS 个符号链接"

echo "build-runtime: 完成 —— runtime 已固化（arch=$ARCH, mode=$MODE）"
echo "build-runtime: 下一步：docker compose up -d（直接运行）或 ./pack.sh --mode $MODE --arch $ARCH 打包"
