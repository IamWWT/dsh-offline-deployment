#!/usr/bin/env bash
# apply-runtime-fixes.sh — 重新应用 deepseek-harness 运行时修复（源码更新后需重跑）。
# 用法: bash scripts/apply-runtime-fixes.sh [LAN_IP]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LAN_IP="${1:-192.168.0.127}"
HTML="runtime/apps/web/dist/index.html"
CLIENT="runtime/packages/client/connection/lib/client.js"
WAPATCH="runtime/packages/bundle/web-app/cordis.patch.yml"

[ -f "$HTML" ] || { echo "错误: 未找到 runtime（先运行 build-runtime.sh）" >&2; exit 1; }

echo "[1/6] polyfill ..."
grep -q "randomUUID polyfilled" "$HTML" 2>/dev/null || node scripts/_fix_polyfill.mjs "$HTML"
echo "[2/6] trusted hosts ..."
grep -q "__DSH_TRUSTED_HOSTS__" "$HTML" 2>/dev/null || node scripts/_fix_trusted.mjs "$HTML" "$LAN_IP"
echo "[3/6] isLoopback ..."
grep -q "__DSH_TRUSTED_HOSTS__" "$CLIENT" 2>/dev/null || node scripts/_fix_isloopback.mjs "$CLIENT"
echo "[4/6] web-app bundle ..."
grep -q "'$LAN_IP'" "$WAPATCH" 2>/dev/null || node scripts/_fix_webapp.mjs "$WAPATCH" "$LAN_IP"
echo "[5/6] open-feedback toast ..."
grep -q "__dshOpenFeedbackModalInjected" "$HTML" 2>/dev/null || node scripts/_fix_openfeedback.mjs "$HTML"
echo "[6/6] profile webserver ..."
cat > data/profiles/web/cordis.patch.yml <<EOF
# 用户 patch 层：webserver 监听容器内 0.0.0.0（官方拒绝 CLI --host，config 层允许）
- id: webserver
  config:
    host: 0.0.0.0
    port: 3080
EOF
echo "  profile written"
echo "=== 完成：docker compose up -d dsh ==="