# 08 · deepseek-harness 上游更新适配检查清单

> **每次 deepseek-harness 版本更新（git pull）后，必须按本文逐项检查**，
> 确保新版本仍与项目适配。对应可执行脚本：`../scripts/check-upstream.sh`。

---

## 0. 更新流程总览

```
1. git pull（deepseek-harness）
2. 跑 scripts/check-upstream.sh —— 快速发现破损点
3. 按本文 1~7 节逐项人工核对
4. 重建 runtime + 重应用补丁
5. 端到端验证（浏览器 LAN + localhost）
6. 提交适配结果
```

## 1. 源码补丁可应用性

```bash
cd deepseek-harness
git apply --check ../patches/deepseek-harness/01-connection-trustedhosts.patch
# 输出为空 = 补丁仍可应用；有冲突 = 需手动解决（见第 8 节）
```

**检查点**：`PRIVILEGED_METHODS` 的 `isTrustedApiRequest(request, [])` → 应为 `trustedHosts`（LAN 配置管理必需）。

## 2. 运行时修复重应用

```bash
bash build-runtime.sh --arch amd64 --dev
bash scripts/apply-runtime-patches.sh [LAN_IP]   # 幂等，重注入
```

**检查点**（apply 脚本覆盖 5 处，逐一确认）：

| # | 修复 | 位置 | 校验方式 |
|---|---|---|---|
| 1 | crypto.randomUUID polyfill | runtime/apps/web/dist/index.html | grep "randomUUID" |
| 2 | __DSH_TRUSTED_HOSTS__ 注入 | runtime/apps/web/dist/index.html | grep "__DSH_TRUSTED_HOSTS__" |
| 3 | isLoopback 可信判定 | runtime/packages/client/connection/lib/client.js | grep "__DSH_TRUSTED_HOSTS__" |
| 4 | web-app trustedHosts 静态 LAN IP | runtime/packages/bundle/web-app/cordis.patch.yml | grep "192.168.0.127" |
| 5 | webserver host=0.0.0.0 | data/profiles/web/cordis.patch.yml | cat 确认 |

## 3. 插件 API 兼容性

插件依赖的 dsh API（`app/plugins/dsh-troubleshoot-assistant/package.json`）：

```
@deepseek-ai/cordis        # apply/ctx/Service/inject
@deepseek-ai/dsh-tools     # defineTool / exec.signal / output.render
@deepseek-ai/dsh-settings  # settingsNamespace / installSettingsSection
@deepseek-ai/schemastery   # z.object / role("secret")
```

**验证**：
```bash
cd app/plugins/dsh-troubleshoot-assistant
DSH_REPO=../../deepseek-harness node build.mjs   # 编译通过 = API 兼容
```

> 若上游 API 变更（如 defineTool 签名、settings 服务重命名），按新 API 更新插件并记录到本清单。

## 4. 预装插件版本

`data/profiles/web/package.json` dependencies：

```
dsh-better-sidebar ^0.15.2   # 需满足 peer：@deepseek-ai/dsh-agent ^rc.8 等
dsh-deeptutor     0.1.9     # 纯 JS，无原生依赖
dshmarket         1.18.1    # 需满足 peer：dsh-settings ^0.1.1-rc.2
```

**检查**：上游大版本变更时，`npm view <pkg> peerDependencies` 是否与当前 dsh 版本匹配；不匹配则升级插件。

## 5. settings.yaml 结构

顶级段：`ui-onboarding` / `locale` / `llm-pi-ai` / `troubleshoot` / `agent-default-model`。

**检查**：
- `llm-pi-ai.providers.local`：api / baseURL / apiKeyEnv / models（模型 id 用 Unsloth 已加载的）
- `troubleshoot.dataSources`：动态数组（插件 schema 兼容）
- `agent-default-model`：provider=local, model=Qwen3.8-27B-GGUF
- 上游若改 settings 命名空间 schema，插件 `installSettingsSection` 需同步

## 6. 网络/安全行为

上游版本可能改变以下行为，需回归：

| 行为 | 期望 | 验证 |
|---|---|---|
| --host 0.0.0.0 拒绝 | 保持拒绝（安全） | dsh web --help |
| webserver config host | 允许 0.0.0.0（容器内） | profile patch 生效 |
| trustedHosts fence | LAN 配置可管理 | 浏览器 LAN 测设置页 |
| settings/credentials | 仅 loopback 管理 | LAN 下应 403（安全护栏） |
| 工具返回值 | lossless JSON | 插件 sanitizeJson 保持 |

## 7. 端到端验证（每次必做）

```bash
# 1. 容器健康 + 双地址可达
docker ps --filter name=dsh-harness --format "{{.Status}}"
curl http://localhost:9488/ && curl http://192.168.0.127:9488/

# 2. 浏览器自动化（LAN + localhost）：
#    工作区 / Agent 预设 / 插件配置 / 插件市场 / 模型页
#    → 用 Playwright 脚本实测（见 docs/03）

# 3. 真实对话：让 agent 调 troubleshoot_status + query_metrics
#    确认：数据源列出、count(up) 返回、无 lossless/schema 错误

# 4. 市场端点
curl http://127.0.0.1:9488/api/dshmarket/plugins.json | head -c 100
```

## 8. 补丁冲突处理

上游更新导致补丁冲突时：

```bash
cd deepseek-harness
git apply ../patches/deepseek-harness/01-connection-trustedhosts.patch 2>&1
# 冲突 → 手动修改 packages/client/connection/src/index.ts：
#   把 PRIVILEGED_METHODS 检查的 isTrustedApiRequest(request, [])
#   改为 isTrustedApiRequest(request, trustedHosts)
git diff > ../patches/deepseek-harness/01-connection-trustedhosts.patch  # 重新导出
```

## 9. 适配结果提交

```
1. 更新补丁/脚本/文档（按 00 规范）
2. 在 docs/README 或本清单记录"适配版本 + 变更点"
3. git commit：chore: 适配 deepseek-harness <版本>
4. 推送前泄漏检查
```

> 本清单随项目维护；上游 API 变更导致的适配动作**必须**记录在这里，形成历史。
