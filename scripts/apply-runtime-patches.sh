#!/usr/bin/env bash
# apply-runtime-patches.sh — 重新应用 deepseek-harness 运行时修复（源码更新后需重跑）。
# 用法: bash scripts/apply-runtime-patches.sh [LAN_IP]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LAN_IP="${1:-192.168.0.127}"
HTML="runtime/apps/web/dist/index.html"
CLIENT="runtime/packages/client/connection/lib/client.js"
WAPATCH="runtime/packages/bundle/web-app/cordis.patch.yml"

[ -f "$HTML" ] || { echo "错误: 未找到 runtime（先运行 build-runtime.sh）" >&2; exit 1; }

echo "[1/5] polyfill ..."
grep -q "randomUUID polyfilled" "$HTML" 2>/dev/null || node scripts/_patch_polyfill.mjs "$HTML"
echo "[2/5] trusted hosts ..."
grep -q "__DSH_TRUSTED_HOSTS__" "$HTML" 2>/dev/null || node scripts/_patch_trusted.mjs "$HTML" "$LAN_IP"
echo "[3/5] isLoopback ..."
grep -q "__DSH_TRUSTED_HOSTS__" "$CLIENT" 2>/dev/null || node scripts/_patch_isloopback.mjs "$CLIENT"
echo "[4/5] web-app bundle ..."
grep -q "'$LAN_IP'" "$WAPATCH" 2>/dev/null || node scripts/_patch_webapp.mjs "$WAPATCH" "$LAN_IP"
echo "[5/5] profile webserver ..."
cat > data/profiles/web/cordis.patch.yml <<EOF
# 用户 patch 层：webserver 监听容器内 0.0.0.0（官方拒绝 CLI --host，config 层允许）
- id: webserver
  config:
    host: 0.0.0.0
    port: 3080
EOF
echo "  profile written"
echo "=== 完成：docker compose up -d dsh ==="
