#!/usr/bin/env bash
# dsh-entry.sh — two-phase dsh deployment: build (from mounted source) → run (from staged runtime, no source mount).
#
# PHASE 1 (build):  docker compose --profile build run --rm dsh-build
# PROD (build:prod): bash build-runtime.sh --arch <arch> —— 同 build，但 staging 前
#   pnpm prune --prod 剔除 dev 工具链，产出仅生产依赖的精简 runtime（pack.sh --mode runtime 用）。
#   The source (./deepseek-harness) is mounted at /workspace/dsh. This phase
#   installs dependencies, builds the monorepo, then STAGES the whole built
#   tree (node_modules included) into /opt/dsh-runtime and records the arch.
#   Build artifacts are produced as `appuser` (uid 1000, matches the host user).
#
# PHASE 2 (run):    docker compose up -d
#   Starts dsh web FROM /opt/dsh-runtime — the source is NOT mounted and not
#   needed at runtime. On an architecture change the runtime arch marker
#   mismatches and the run fails loud with instructions to re-run phase 1.
#
# Both phases share the same container image (pygojava); the split is the
# entry script + compose services.

set -euo pipefail

DSH_SRC="${DSH_SRC:-/workspace/dsh}"
DSH_STATE="${DSH_STATE:-/opt/dsh-state}"
DSH_HOME="${DSH_HOME:-/opt/dsh}"
DSH_RUNTIME="${DSH_RUNTIME:-/opt/dsh-runtime}"
PNPM_VERSION="11.7.0"
APP_USER="appuser"
TINI="${TINI:-/usr/local/bin/tini}"

# --- PATH: make node / go / rust available to every step ---
source /etc/profile.d/go.sh 2>/dev/null || true
source /etc/profile.d/rust.sh 2>/dev/null || true
export PATH="/usr/local/node/bin:/opt/cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Persist npm/npx cache inside DSH_HOME so restarts and the arm64 migration
# re-use downloaded artifacts instead of fetching them again.
export npm_config_cache="$DSH_HOME/.npm-cache"
export npm_config_store_dir="$DSH_HOME/.pnpm-store"

mkdir -p "$DSH_STATE" "$DSH_HOME" "$npm_config_cache"
chown -R "$APP_USER:$APP_USER" "$DSH_STATE" "$DSH_HOME"

# /workspace/open-here: 无 GUI 容器的 xdg-open 兼容目录（WebUI"打开配置文件"
# 把目标文件复制到这里供用户访问）。必须归 appuser 所有且可写，否则
# WebUI 以 appuser 运行时 cp 会 Permission denied，报"无法打开配置文件"。
# 每次启动强制修正属主（bind mount 重建后可能变回 root）。
mkdir -p /workspace/open-here
chown -R "$APP_USER:$APP_USER" /workspace/open-here

# --- keep the base image's sshd (optional, background) ---
if [ ! -f /etc/ssh/ssh_host_ed25519_key ]; then
  ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N "" >/dev/null 2>&1 || true
  chmod 600 /etc/ssh/ssh_host_ed25519_key || true
  chmod 644 /etc/ssh/ssh_host_ed25519_key.pub || true
fi
/usr/sbin/sshd 2>/dev/null || true

# --- debug escape hatch: `docker compose run --rm dsh bash` ---
if [ $# -ge 1 ]; then
  case "$1" in
    bash|sh|zsh|/bin/bash|/bin/sh|/usr/bin/bash)
      exec "$TINI" -s -- su "$APP_USER" -c "$@" ;;
  esac
fi

arch_short() {
  case "$(uname -m)" in
    x86_64|amd64) echo amd64 ;;
    aarch64|arm64) echo arm64 ;;
    *) echo "$(uname -m)" ;;
  esac
}
ARCH="$(arch_short)"

run_as_app() {
  su "$APP_USER" -c "cd '$DSH_SRC' && $1"
}

# ---------------------------------------------------------------------------
# PHASE 1 — build: install + build from the mounted source, then stage runtime.
# ---------------------------------------------------------------------------
if [ "${1:-}" = "build" ] || [ "${1:-}" = "build:prod" ]; then
  PROD_MODE=0
  [ "${1:-}" = "build:prod" ] && PROD_MODE=1
  if [ "$PROD_MODE" = "1" ]; then
    echo "[dsh] PROD mode: runtime will be pruned to production-only dependencies"
  fi
  if [ ! -d "$DSH_SRC/apps/cli" ]; then
    echo "[dsh] build phase: source not mounted at $DSH_SRC — run with the ./deepseek-harness volume (docker compose --profile build run --rm dsh-build)" >&2
    exit 1
  fi
  echo "[dsh] build phase: source mounted at $DSH_SRC (arch=$ARCH)"

  NEED_INSTALL=0
  NEED_BUILD=0

  # architecture change (the migration case): drop cross-arch artifacts
  if [ -f "$DSH_STATE/arch" ] && [ "$(cat "$DSH_STATE/arch")" != "$ARCH" ]; then
    echo "[dsh] architecture changed: $(cat "$DSH_STATE/arch") -> $ARCH; dropping cross-arch node_modules"
    rm -rf "$DSH_SRC/node_modules"
    rm -f "$DSH_STATE/built"
  fi
  echo "$ARCH" > "$DSH_STATE/arch"

  [ ! -d "$DSH_SRC/node_modules" ] && NEED_INSTALL=1
  [ ! -f "$DSH_STATE/installed" ] && NEED_INSTALL=1
  # reinstall when dependency manifests moved past the install marker (e.g. `git pull`)
  if [ "$NEED_INSTALL" = 0 ]; then
    for depfile in package.json pnpm-lock.yaml pnpm-workspace.yaml apps/cli/package.json; do
      if [ "$DSH_SRC/$depfile" -nt "$DSH_STATE/installed" ]; then
        echo "[dsh] dependency manifest changed ($depfile); reinstalling"
        NEED_INSTALL=1
        break
      fi
    done
  fi
  [ ! -f "$DSH_STATE/built" ] && NEED_BUILD=1
  [ "$NEED_INSTALL" = 1 ] && NEED_BUILD=1

  if [ "$NEED_INSTALL" = 1 ]; then
    echo "[dsh] pnpm install ..."
    run_as_app "CI=true npx -y pnpm@$PNPM_VERSION install"
    touch "$DSH_STATE/installed"
  fi

  if [ "$NEED_BUILD" = 1 ]; then
    echo "[dsh] building dsh (pnpm build) ..."
    run_as_app "CI=true npx -y pnpm@$PNPM_VERSION build"
    touch "$DSH_STATE/built"
  else
    # fast path: marker exists — rebuild if any source file is newer
    newer="$(find "$DSH_SRC" \
      \( -name node_modules -o -name .git -o -name lib -o -name dist \
         -o -name coverage -o -name .turbo -o -name website \) -prune \
      -o -type f -newer "$DSH_STATE/built" -print -quit 2>/dev/null || true)"
    if [ -n "$newer" ]; then
      echo "[dsh] source changed ($newer); rebuilding"
      run_as_app "npx -y pnpm@$PNPM_VERSION build"
      touch "$DSH_STATE/built"
    fi
  fi

  # --- rebuild the web profile's native modules for THIS arch ---
  # Profile 随包预装（data/profiles/web/node_modules）里可能含原生二进制（如
  # better-sidebar 依赖的 node-pty）。跨架构迁移后这些二进制与宿主不匹配，
  # 必须按当前架构重新编译——否则运行时 require 原生模块会失败。
  if [ -d "$DSH_HOME/profiles/web/node_modules" ]; then
    echo "[dsh] rebuilding profile native modules for arch=$ARCH ..."
    su "$APP_USER" -c "cd '$DSH_HOME/profiles/web' && CI=true npx -y pnpm@$PNPM_VERSION rebuild" 2>&1 | tail -3 || true
  fi

  # --- prune to production-only dependencies (PROD mode only) ---
  if [ "$PROD_MODE" = "1" ]; then
    echo "[dsh] pruning dev dependencies (pnpm prune --prod) ..."
    run_as_app "CI=true npx -y pnpm@$PNPM_VERSION prune --prod" 2>&1 | tail -5 || echo "[dsh] prune skipped (warning)"
  fi

  # --- stage the built runtime (no source needed afterwards) ---
  echo "[dsh] staging built runtime to $DSH_RUNTIME ..."
  # /opt/dsh-runtime 是 bind mount 根，不能 rm 挂载点本身；清空内容即可。
  find "$DSH_RUNTIME" -mindepth 1 -delete 2>/dev/null || rm -rf "$DSH_RUNTIME"/* "$DSH_RUNTIME"/.[!.]* 2>/dev/null || true
  mkdir -p "$DSH_RUNTIME"
  # whole-tree copy minus .git: node_modules + lib + vendor + apps + configs
  ( cd "$DSH_SRC" && tar -cf - --exclude=.git --exclude='*.tsbuildinfo' . ) | ( cd "$DSH_RUNTIME" && tar -xf - )
  chown -R "$APP_USER:$APP_USER" "$DSH_RUNTIME"
  echo "$ARCH" > "$DSH_STATE/runtime-arch"
  echo "[dsh] build phase complete: runtime staged at $DSH_RUNTIME (arch=$ARCH)"
  echo "[dsh] next: docker compose up -d  (source mount is no longer needed at runtime)"
  exit 0
fi

# ---------------------------------------------------------------------------
# PHASE 2 — run: start dsh web from the staged runtime (no source mount).
# ---------------------------------------------------------------------------
if [ ! -d "$DSH_RUNTIME/apps/cli" ]; then
  echo "[dsh] run phase: runtime not found at $DSH_RUNTIME — run the build phase first: docker compose --profile build run --rm dsh-build" >&2
  exit 1
fi
if [ -f "$DSH_STATE/runtime-arch" ] && [ "$(cat "$DSH_STATE/runtime-arch")" != "$ARCH" ]; then
  echo "[dsh] run phase: runtime arch mismatch ($(cat "$DSH_STATE/runtime-arch") != $ARCH) — re-run the build phase on this machine: docker compose --profile build run --rm dsh-build" >&2
  exit 1
fi
DSH_BIN="$DSH_RUNTIME/apps/cli/lib/bin.js"

# convenient `dsh` command for interactive `docker compose exec` sessions
ln -sf "$DSH_BIN" /go/bin/dsh

# 网络绑定：DSH_BIND 环境变量控制（compose 里可设）。
#   127.0.0.1（默认） 仅本机访问；经 socat 桥接到 3090（compose 映射宿主端口）。
#   0.0.0.0（服务器） dsh web 直接监听所有网卡（dsh 原生支持，自动收集
#                     LAN IP 为 trustedHosts），供局域网/公网访问。
# dsh web 出于安全只监听 127.0.0.1（--host 0.0.0.0 被官方拒绝：防远程代码执行暴露）。
# socat 在容器内监听 0.0.0.0:DSH_SOCAT_PORT（默认 3090），转发到 127.0.0.1:3080；
# 对外暴露范围由 compose 宿主端口映射（DSH_PUBLIC_PORT）控制，本机与局域网均可访问。
BIND_HOST="${DSH_BIND:-127.0.0.1}"
SOCAT_LISTEN_PORT="${DSH_SOCAT_PORT:-3090}"
echo "[dsh] starting: dsh web on 127.0.0.1:3080 (from runtime, no source mount; bridge 0.0.0.0:3090 -> 127.0.0.1:3080)"
(
  for _ in $(seq 1 60); do
    ncat -z 127.0.0.1 3080 2>/dev/null && break
    sleep 1
  done
  # socat 始终监听容器内 0.0.0.0（docker 端口映射需要）；对外暴露范围由
  # compose 的宿主端口映射 host_ip 控制：127.0.0.1:9488 = 仅本机，0.0.0.0:9488 = 对外。
  exec socat TCP4-LISTEN:$SOCAT_LISTEN_PORT,bind=0.0.0.0,fork,reuseaddr TCP4:127.0.0.1:3080
) &
# --- offline plugin market ---
# dshmarket（与宿主一致的市场插件）从 DSHM_REGISTRY_URL 拉取目录；指向 dsh web 自身的
# /api/dshmarket/plugins.json（由故障排查助手插件提供：官方目录离线快照 + 兜底目录），
# 市场可完全离线浏览。
export DSHM_REGISTRY_URL="http://127.0.0.1:3080/api/dshmarket/plugins.json"
# --trusted-host：局域网/自定义域访问时，把 Host 加入 dsh 的 API 信任围栏（防 403）。
# DSH_TRUSTED_HOSTS 用逗号分隔，例如 "192.168.0.127:9488,harness.internal:9488"。
TRUSTED_FLAGS=""
if [ -n "${DSH_TRUSTED_HOSTS:-}" ]; then
  IFS="," read -r -a TRUSTED_ARRAY <<< "$DSH_TRUSTED_HOSTS"
  for host in "${TRUSTED_ARRAY[@]:-}"; do
    [ -n "$host" ] && TRUSTED_FLAGS="$TRUSTED_FLAGS --trusted-host $host"
  done
fi
exec "$TINI" -s -- su "$APP_USER" -c "cd '$DSH_RUNTIME' && exec node '$DSH_BIN' web $TRUSTED_FLAGS"
