#!/usr/bin/env bash
# dsh-dev-entry.sh — 故障助手插件开发入口（docker-compose.dev.yml 专用）。
#
# 开发循环（秒级，无需 20-40 分钟的 dsh 全量编译）：
#   1. 从 /app/plugins/dsh-troubleshoot-assistant 源码构建插件
#      （esbuild/tsc 复用 ./runtime 的 node_modules，DSH_REPO 指向 runtime）；
#   2. 把构建产物刷新到已安装副本 /opt/dsh/profiles/node_modules/@dsh-tools/troubleshoot-assistant/lib；
#   3. 走 dsh-entry.sh run 阶段启动 dsh web（从 ./runtime 启动，不挂 dsh 源码）。
#
# 用法：
#   docker compose -f docker-compose.dev.yml up -d
#   改完插件源码后：
#   docker compose -f docker-compose.dev.yml restart
#   看日志：docker compose -f docker-compose.dev.yml logs -f
#
# 说明：
#   - 宿主 uid 必须为 1000（与容器内 appuser 一致），插件源码目录才可写；
#   - 构建失败时本脚本直接退出（不会带着旧插件启动），错误见日志；
#   - 端口 9489（与生产 9488 隔离，可同时运行）。
set -euo pipefail

PLUGIN_SRC="${PLUGIN_SRC:-/app/plugins/dsh-troubleshoot-assistant}"
PLUGIN_INSTALLED="${PLUGIN_INSTALLED:-/opt/dsh/profiles/node_modules/@dsh-tools/troubleshoot-assistant}"
REPO="${DSH_REPO:-/opt/dsh-runtime}"
APP_USER="appuser"

echo "[dsh-dev] 插件源码: $PLUGIN_SRC"
echo "[dsh-dev] 构建工具来源: $REPO (runtime node_modules)"

if [ ! -d "$PLUGIN_SRC/src" ]; then
  echo "[dsh-dev] 错误: 未找到插件源码 $PLUGIN_SRC/src —— 请确认 ./app 已挂载" >&2
  exit 1
fi
if [ ! -d "$PLUGIN_INSTALLED/lib" ]; then
  echo "[dsh-dev] 错误: 未找到已安装插件副本 $PLUGIN_INSTALLED/lib —— 请先在生产环境安装插件" >&2
  exit 1
fi

echo "[dsh-dev] [1/3] 构建插件 (node build.mjs；SKIP_TYPES=1：类型在宿主重建) ..."
su "$APP_USER" -c "cd '$PLUGIN_SRC' && DSH_REPO='$REPO' SKIP_TYPES=1 node build.mjs"

echo "[dsh-dev] [2/3] 刷新已安装副本 -> $PLUGIN_INSTALLED/lib ..."
su "$APP_USER" -c "cp '$PLUGIN_SRC'/lib/index.js '$PLUGIN_SRC'/lib/client.js '$PLUGIN_SRC'/lib/index.js.map '$PLUGIN_INSTALLED'/lib/ && cp -r '$PLUGIN_SRC'/lib/types/. '$PLUGIN_INSTALLED'/lib/types/"

echo "[dsh-dev] [3/3] 启动 dsh web (run 阶段) ..."
exec /usr/local/bin/dsh-entry.sh run