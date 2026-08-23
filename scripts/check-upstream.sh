#!/usr/bin/env bash
# =============================================================================
# check-upstream.sh — deepseek-harness 上游更新适配检查（快速体检）。
#
# 用法：bash scripts/check-upstream.sh
# 输出：逐项 PASS/FAIL，FAIL 项需按 docs/08 处理。
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FAIL=0
PASS=0

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

echo "=== 1. 源码补丁已应用 ==="
if [ -d deepseek-harness/.git ]; then
  # 已应用（源码含修改）= PASS；未应用且可 apply = 提示需应用；冲突 = FAIL
  if grep -q "isTrustedApiRequest(request, trustedHosts)" deepseek-harness/packages/client/connection/src/index.ts 2>/dev/null; then
    ok "01-connection-trustedhosts.patch 已应用（trustedHosts 修复在位）"
  elif (cd deepseek-harness && git apply --check ../patches/deepseek-harness/01-connection-trustedhosts.patch 2>/dev/null); then
    fail "补丁未应用（可应用）：cd deepseek-harness && git apply ../patches/deepseek-harness/01-connection-trustedhosts.patch"
  else
    fail "补丁冲突（源码已变，需手动处理，见 docs/08 第 8 节）"
  fi
else
  echo "  （deepseek-harness 未 clone，跳过）"
fi

echo "=== 2. 运行时修复在位 ==="
HTML="runtime/apps/web/dist/index.html"
CLIENT="runtime/packages/client/connection/lib/client.js"
WAPATCH="runtime/packages/bundle/web-app/cordis.patch.yml"
grep -q "randomUUID" "$HTML" 2>/dev/null && ok "polyfill 在位" || fail "polyfill 缺失（跑 apply-runtime-patches.sh）"
grep -q "__DSH_TRUSTED_HOSTS__" "$HTML" 2>/dev/null && ok "trusted hosts 注入在位" || fail "trusted hosts 缺失"
grep -q "__DSH_TRUSTED_HOSTS__" "$CLIENT" 2>/dev/null && ok "isLoopback 修复在位" || fail "isLoopback 缺失"
grep -q "192.168.0.127" "$WAPATCH" 2>/dev/null && ok "web-app LAN 信任在位" || fail "web-app LAN 信任缺失"
grep -q "host: 0.0.0.0" data/profiles/web/cordis.patch.yml 2>/dev/null && ok "webserver 0.0.0.0 在位" || fail "webserver 0.0.0.0 缺失"

echo "=== 3. 插件 API 编译 ==="
if [ -f app/plugins/dsh-troubleshoot-assistant/build.mjs ]; then
  if (cd app/plugins/dsh-troubleshoot-assistant && DSH_REPO="$ROOT/deepseek-harness" node build.mjs >/tmp/check-upstream-build.log 2>&1); then
    ok "插件编译通过（API 兼容）"
  else
    fail "插件编译失败（API 变更？看 /tmp/check-upstream-build.log，按 docs/08 第 3 节处理）"
  fi
fi

echo "=== 4. 受保护副本与构建产物一致 ==="
if [ -f app/plugins/dsh-troubleshoot-assistant/lib/index.js ] && [ -f data/profiles/node_modules/@dsh-tools/troubleshoot-assistant/lib/index.js ]; then
  if cmp -s app/plugins/dsh-troubleshoot-assistant/lib/index.js data/profiles/node_modules/@dsh-tools/troubleshoot-assistant/lib/index.js; then
    ok "受保护副本与构建产物一致"
  else
    fail "受保护副本过期（需重新同步）"
  fi
fi

echo "=== 5. settings.yaml 关键配置 ==="
grep -q "Qwen3.8-27B-GGUF" data/settings.yaml 2>/dev/null && ok "默认模型 = Qwen3.8-27B-GGUF（已加载）" || fail "默认模型配置异常"
grep -q "agent-default-model" data/settings.yaml 2>/dev/null && ok "agent-default-model 段存在" || fail "agent-default-model 缺失"

echo "=== 6. 预装插件存在 ==="
for p in dshmarket dsh-better-sidebar dsh-deeptutor; do
  [ -d "data/profiles/web/node_modules/$p" ] && ok "$p 已安装" || fail "$p 缺失（重新安装）"
done

echo "=== 7. 泄漏检查（仓库内）==="
LEAK=$(git ls-files | xargs grep -lE "sk-[a-zA-Z0-9]{15,}|BEGIN (RSA|OPENSSH|EC) PRIVATE|ghp_[a-zA-Z0-9]{20,}" 2>/dev/null | head -3)
if [ -z "$LEAK" ]; then ok "无密钥泄漏"; else fail "发现疑似泄漏: $LEAK"; fi

echo ""
echo "========== 结果：$PASS 通过 / $FAIL 失败 =========="
[ "$FAIL" -eq 0 ] || echo "⚠️ 有失败项：按 docs/08-dsh上游更新适配清单.md 处理"
exit 0
