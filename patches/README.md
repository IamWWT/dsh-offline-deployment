# patches/ — 对第三方项目的修改补丁

> 本目录只存放**可执行的补丁**（git diff 格式，可 `git apply`）。
> 说明性文档统一放 `docs/`（见 `docs/07-运行时补丁说明.md`）。

## 目录

```
patches/
├── deepseek-harness/
│   └── 01-connection-trustedhosts.patch   # 源码补丁：privileged 方法放行 trustedHosts
└── README.md
```

## 应用补丁

```bash
# 源码补丁（deepseek-harness）
cd deepseek-harness
git apply ../patches/deepseek-harness/01-connection-trustedhosts.patch

# 运行时补丁（构建后重新注入，幂等）—— 详见 docs/07-运行时补丁说明.md
bash scripts/apply-runtime-patches.sh [LAN_IP]
```

## 为什么补丁放这里

- 上游项目源码不 fork 进本仓库，用补丁记录**我们独有的修改**
- 上游更新：`git pull` → 重新 `git apply` 补丁 → 重建
- 第三方项目来源：deepseek-harness / dshmarket / better-sidebar（详见 docs/README）
