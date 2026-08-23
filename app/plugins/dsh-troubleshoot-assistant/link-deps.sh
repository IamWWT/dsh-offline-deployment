#!/bin/bash
# 建立插件到 dsh 仓库的类型/依赖软链（仅宿主编译/测试环境需要；容器内由 pnpm 管理）。
# 用法：bash link-deps.sh（在插件目录或其任意子目录执行均可，路径自动定位）
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$SCRIPT_DIR"
rm -rf node_modules
mkdir -p node_modules/@deepseek-ai node_modules/@types
ln -sfn "$ROOT/deepseek-harness/packages/core/tools" node_modules/@deepseek-ai/dsh-tools
ln -sfn "$ROOT/deepseek-harness/packages/settings/settings" node_modules/@deepseek-ai/dsh-settings
ln -sfn "$ROOT/deepseek-harness/vendor/schemastery" node_modules/@deepseek-ai/schemastery
ln -sfn "$ROOT/deepseek-harness/vendor/cordis" node_modules/@deepseek-ai/cordis
ln -sfn "$ROOT/deepseek-harness/packages/llm/llm" node_modules/@deepseek-ai/dsh-llm
ln -sfn "$ROOT/deepseek-harness/packages/client/runtime" node_modules/@deepseek-ai/dsh-client-runtime
ln -sfn "$ROOT/deepseek-harness/packages/client/ui-slots" node_modules/@deepseek-ai/dsh-client-ui-slots
ln -sfn "$ROOT/deepseek-harness/packages/client/ui-settings" node_modules/@deepseek-ai/dsh-client-ui-settings
ln -sfn "$ROOT/deepseek-harness/packages/client/ui-settings-plugins" node_modules/@deepseek-ai/dsh-client-ui-settings-plugins
ln -sfn "$ROOT/deepseek-harness/node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node" node_modules/@types/node
echo LINKS-OK
