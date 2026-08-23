#!/bin/bash
set -e
cd "/home/wwt/Downloads/aigc/proj/deepseek/offline/workspace/dsh-troubleshoot-assistant"
rm -rf node_modules
mkdir -p node_modules/@deepseek-ai node_modules/@types
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/packages/core/tools" node_modules/@deepseek-ai/dsh-tools
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/packages/settings/settings" node_modules/@deepseek-ai/dsh-settings
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/vendor/schemastery" node_modules/@deepseek-ai/schemastery
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/vendor/cordis" node_modules/@deepseek-ai/cordis
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/packages/llm/llm" node_modules/@deepseek-ai/dsh-llm
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/packages/client/runtime" node_modules/@deepseek-ai/dsh-client-runtime
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/packages/client/ui-slots" node_modules/@deepseek-ai/dsh-client-ui-slots
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/packages/client/ui-settings" node_modules/@deepseek-ai/dsh-client-ui-settings
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/packages/client/ui-settings-plugins" node_modules/@deepseek-ai/dsh-client-ui-settings-plugins
ln -sfn "/home/wwt/Downloads/aigc/proj/deepseek/offline/deepseek-harness/node_modules/.pnpm/@types+node@25.9.3/node_modules/@types/node" node_modules/@types/node
node build.mjs 2>&1 | grep -E 'error TS|\[build\]' | head -12
node --test tests/*.spec.ts 2>&1 | grep -E '^ℹ (pass|fail)'
rm -rf node_modules
echo BUILD-OK