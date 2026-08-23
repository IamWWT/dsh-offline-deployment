# 复盘记录 · dev/生产容器"未分离"误判事件

> 日期：2026-08-23。类型：**路径迁移未同步 + 未按真实用户路径验证**。
> 关联规范：[09-测试验证规范](09-测试验证规范.md)（验证真实用户路径，而非自我报告）。

---

## 一、现象

用户执行 `docker-compose -f docker-compose.dev.yml ps -a`，输出显示的却是生产容器 `dsh-harness`，
两个命令结果一样 → 误判"dev 和生产没有分开，用了同一个容器"。

## 二、真相

dev 容器 **从未成功启动过**（Exited 1）。compose 在项目里找不到 dev 容器时，
`ps -a` 会回退显示项目内已存在的容器（生产 dsh-harness）——这是 compose 的显示行为，不是配置合并。
用 `docker ps -a` 才能看到真实状态：只有 dsh-harness，没有 dsh-harness-dev。

## 三、dev 容器启动失败的根因链

1. **路径迁移未全仓同步**：插件从 `app/dsh-troubleshoot-assistant` 移到 `app/plugins/dsh-troubleshoot-assistant` 时，
   改了源码与主文档，但以下引用全部过时（grep 出 10+ 处）：
   - `dsh-dev-entry.sh` 第 22 行 `PLUGIN_SRC=/app/dsh-troubleshoot-assistant` → 启动即报"未找到插件源码"；
   - `pack.sh` 前置检查（判断插件是否存在）→ 检查失效；
   - README / MIGRATE / docs/01 / docs/04 / docs/06 的路径说明 → 文档与实现不符。
2. **运行时 patch 键重复（YAML 解析失败）**：`_fix_webapp.mjs` 的"先删旧注入再插新值"逻辑
   只删了注入行 `['IP', ...ctx.webRuntime.trustedHosts]`，**没删原始行** `trustedHosts: !!js ctx.webStartup.trustedHosts`，
   导致同一 config 块出现两行 trustedHosts → YAML 重复键 → 启动即退。
   （触发场景：从干净 patch 首次注入时，原始行还在，插入后变成两行。）
3. **修复了 1 和 2 后，dev 容器才真正可用**；修复前后生产容器一直正常（它用的是已注入好的 runtime），
   这掩盖了问题——生产验证通过 ≠ dev 也正常。

## 四、为什么会犯这个错误（深层原因）

### 1. 路径迁移没有"单一事实来源 + 全仓 grep 验证"
- 移动目录后只改了"记得的地方"，没做 `grep -rn 旧路径 .` 全仓排查；
- 教训：**任何路径/名称变更，改完必须 grep 旧值全仓清零**（列入 docs/00 变更流程）。

### 2. 没有验证 dev 容器的真实启动路径
- 一直用生产容器验证（9488），从未 `docker compose -f docker-compose.dev.yml up` 确认 dev 能起；
- 犯了 [09-测试验证规范](09-测试验证规范.md) 里"反面教材"同样的错：只验证了"我用的那条路径"，没验证"用户/开发者会用的那条路径"；
- 教训：**每套编排都要各自验证真实启动**（dev 起一次、生产起一次），不能一套替代另一套。

### 3. 对 compose 显示行为缺乏警觉
- `docker-compose -f xxx.yml ps` 在容器不存在时回退显示同项目其他容器，容易误判；
- 教训：**判读容器状态用 `docker ps -a`（真实全局视图）**，不要只信 compose 子命令的输出。

## 五、修复动作（已实施）

| # | 动作 | 验证 |
|---|---|---|
| 1 | `dsh-dev-entry.sh` 插件路径 → app/plugins/... | dev 容器 9489 正常启动 |
| 2 | `_fix_webapp.mjs` 同时删除注入行与原始行 | 干净注入/幂等/换 IP 三场景无重复行 |
| 3 | 手工 dedupe 现有 patch（trustedHosts 两行并存的残留） | YAML 解析通过 |
| 4 | 全仓 grep 旧路径，批量修正 README/MIGRATE/pack.sh/docs/01/04/06 | grep 清零 |
| 5 | dev 容器 restart 秒级重建验证（2.56s） | dev 与生产共存 healthy |
| 6 | docs/04 补充 dev/生产分离说明 + 排障 | 文档与实现一致 |

## 六、防止再犯（流程改进，已写入 docs/00）

1. **路径/名称变更三步**：改 → `grep -rn 旧名 .` 全仓清零 → 各入口真实验证；
2. **多套编排各自验证**：dev 容器与生产容器都要 `up -d` 确认能启动（不能一套替代另一套）；
3. **判读容器状态用 `docker ps -a`**，compose 子命令输出仅作参考；
4. **运行时注入脚本的幂等逻辑**：凡"先删后插"，删除必须覆盖所有历史形态（含被替换的原始行），用场景测试验证。

