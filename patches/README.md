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

## 补丁基线（可靠性）

每个源码补丁（`patches/<上游>/NN-描述.patch`）配同名 `.meta` 文件，记录：
- `baseline_commit`：生成补丁时的上游 commit SHA（`git rev-parse HEAD`）
- `affected_files`：补丁涉及的文件（逗号分隔）
- `semantic_fingerprint`：判定补丁在位的关键代码串

**上游更新后的判定**（`bash scripts/check-upstream.sh` 自动执行）：
1. HEAD == baseline_commit → 补丁必然可信
2. HEAD 变了但 affected_files 未变动 → 补丁仍适用（git apply --check 再确认）
3. affected_files 有变动 → 报 FAIL，需重新生成补丁（`git apply -R` 撤销旧版后重打）

**生成新补丁**：`cd deepseek-harness && git diff -- <文件> > ../patches/deepseek-harness/NN-描述.patch`，并更新 .meta 的 baseline_commit。

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