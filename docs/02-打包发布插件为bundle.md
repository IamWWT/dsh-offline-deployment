# 02 · 如何把插件打包为 bundle 并发布，让别人可使用

> 参考《DeepSeek Harness 插件开发与发布复盘》：bundle = 带 `dsh.bundle` 声明的
> npm 包 + **lib/ 构建产物入库** + **git tag 固定版本**。别人用 `dsh plugin add` 即可安装。

---

## 1. bundle 是什么

dsh 的 bundle = 一个 npm 包，package.json 里声明 `dsh.bundle.patch`，
patch 文件（cordis.patch.yml）声明插入的插件行。dsh 的 Loader 按层组装：

```
bundle patch → profile bundles → 用户 patch 层 → --patch 覆盖
```

## 2. 声明 bundle（package.json）

```json
{
  "name": "@dsh-tools/troubleshoot-assistant",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  },
  "files": ["lib", "cordis.patch.yml"]
}
```

## 3. cordis.patch.yml（bundle patch）

声明插入的插件行与默认配置：

```yaml
- insert:
    - id: troubleshoot-assistant
      name: '@dsh-tools/troubleshoot-assistant'
      config:
        defaultTimeoutMs: 15000
        marketSnapshotPath: /app/offline-market/plugins.json
        sopPath: /workspace/故障排查使用助手工作区/故障排查SOP.md
```

## 4. 构建并提交 lib/ 产物

**lib/ 构建产物必须提交进仓库**（用户端不做构建）。构建：

```bash
node build.mjs   # 产出 lib/index.js（host ESM）+ lib/client.js（browser bundle）+ lib/types
git add lib/ && git commit -m "build: lib artifacts"
```

## 5. 发布到 npm

```bash
# 登录 npm
npm login

# 发布（version 用语义化版本）
npm publish --access public

# 打 git tag 固定版本（保证部署可复现）
git tag v0.1.0
git push origin v0.1.0
```

## 6. 别人安装你的插件

```bash
# 从 npm 安装（推荐，带版本固定）
dsh plugin --profile web add @dsh-tools/troubleshoot-assistant@0.1.0

# 从 GitHub 源安装（monorepo 子路径）
dsh plugin --profile web add github:owner/repo#path:/packages/my-plugin

# 离线预装（内网无 npm 时）：把包放进 profile 的 node_modules
#   data/profiles/node_modules/@dsh-tools/my-plugin/  （含 lib/ + package.json + cordis.patch.yml）
#   并在 data/profiles/web/package.json 的 bundles 加一行
```

## 7. 市场目录（可选）

如果你的部署自带插件市场（如本项目的 dshmarket 离线快照），
把插件条目加进 `app/offline-market/plugins.json`：

```json
{
  "name": "My Plugin",
  "owner": "you",
  "npm": "@you/my-plugin",
  "install": "dsh plugin --profile web add @you/my-plugin",
  "category": "ops",
  "description": { "zh": "插件说明" }
}
```

## 8. 版本治理

- 发布后**不要**改已发布的 tag；修复发新版本
- 用户用 `@0.1.0` 固定版本，避免破坏性更新
- `lib/` 产物随版本提交，用户无需 Node 构建环境

> 本项目的故障排查助手以"受保护内置插件"方式部署（不进 dependencies，
> 放共享 fallback 目录 → `dsh plugin remove` 无法卸载）。详见 docs/05。
