# patches/ — 对第三方项目的修改补丁

> 本项目**不直接存放第三方项目代码**（deepseek-harness、dshmarket 市场源码、
> better-sidebar 等均为上游官方项目）。我们对它们的修改以**补丁**形式记录，
> 源码更新后重新应用。

## 目录

```
patches/
├── deepseek-harness/
│   ├── 01-connection-trustedhosts.patch   # 源码补丁：privileged 方法放行 trustedHosts
│   └── 02-runtime-fixes.md                # 运行时修复说明（polyfill/isLoopback/LAN 信任）
├── profile/
│   └── 01-webserver-host.patch.yml        # profile patch：webserver 监听 0.0.0.0
└── README.md
```

## 应用补丁

### 源码补丁（deepseek-harness）

```bash
cd deepseek-harness
git apply ../patches/deepseek-harness/01-connection-trustedhosts.patch
```

### 运行时补丁（构建后重新注入，幂等）

```bash
# 源码更新 → 重新构建 runtime 后：
bash build-runtime.sh --arch amd64 --dev
bash scripts/apply-runtime-patches.sh [LAN_IP]   # 默认 192.168.0.127
docker compose up -d
```

## 为什么不直接放代码

- 上游项目有自己的版本管理与授权，直接拷贝会失去溯源
- 我们用补丁记录**我们独有的修改**（LAN 信任/安全增强/容器适配）
- 上游更新时：`git pull` → 重新 `git apply` 补丁（冲突时手动解决）→ 重建

## 第三方项目来源

| 项目 | 来源 |
|---|---|
| deepseek-harness | https://github.com/deepseek-ai/deepseek-harness |
| dshmarket（市场插件） | npm `dshmarket` |
| dsh-better-sidebar | npm `dsh-better-sidebar` |
| 离线市场快照 | https://awesome-dsh-plugin.com/plugins.json（数据，非代码） |
