# 变更记录（CHANGELOG）

> 记录每次改动的**验证证据**（按 [09-测试验证规范.md](09-测试验证规范.md)：验证什么、怎么验的、结果），
> 避免"当时 curl 通过了"式的误判。格式：日期 + 改动 + 验证方式 + 结果。

---

## 2026-08-23

### 打开配置文件"没有反应"修复（含前端 toast）
- **现象**：WebUI「通用设置 → 打开配置文件」点击无反馈（早期为"无法打开配置文件"报错）。
- **排查**：
  1. 容器内 curl `settings.openDocument` RPC → `ok:true`（后端正常，但**不能证明浏览器侧**）；
  2. 读上游源码：按钮 → `settings.openDocument` → `openTextFile` → Linux 分支 `run('xdg-open', [path])`（`native-path-opener.ts:148`），宿主确实调 xdg-open；
  3. 容器内以 appuser 手动执行 xdg-open → 报 `Permission denied`（`/workspace/open-here/` 属主是 root，Web 进程以 appuser 运行）→ 修复：`chown appuser:appuser /workspace/open-here` + dsh-entry.sh 启动时强制修正；
  4. 权限修复后点击仍"无反应"：浏览器自动化（Playwright）发现 `settings.openDocument` 请求 200 但**无 toast**——注入脚本用 `input.url` 取地址，而 WebApiClient 传的是 **URL 对象**（属性是 `.href`），导致匹配短路；修复：`input.href || input.url`。
- **验证**（L3 浏览器自动化，`scripts/verify-open-document.cjs`）：localhost 与 192.168.0.127 双路径，5 项断言全 PASS——按钮存在 / toast 出现 / 请求发出 / 响应 200 / OPEN_LOG 落盘。
- **改动**：`scripts/_fix_openfeedback.mjs`（注入 toast + fetch hook）、`app/xdg-open`（复制到 open-here）、`dsh-entry.sh`（open-here 属主）、`docs/09-测试验证规范.md`（新增）。

### SOP 去产品化重写 + 资产文档
- **现象**：SOP 写死具体产品（PromQL/ES/Jaeger/MySQL/Redis/K8s），与企业实际组件不符。
- **改动**：
  1. `workspace/故障排查使用助手工作区/故障排查SOP.md` 重写——数据源只说能力（指标/日志/调用链/CMDB/知识库），不再提具体产品名；排查路径按故障类型（性能劣化/错误率/不可用/数据异常/跨系统）组织；
  2. 新增 `workspace/故障排查使用助手工作区/assets/企业基础设施基线.md`（企业按需填写组件清单与检查项）；
  3. 新增 `workspace/故障排查使用助手工作区/assets/报告格式模板.md`（通用模板 + 企业专属格式位）。
- **验证**：容器内确认文件存在、SOP 无产品名残留（grep 检查）。

### 数据源独立保存/删除按钮
- **需求**：设置卡片每个数据源应有独立保存/删除，而非仅全局保存。
- **改动**：插件 `src/client/controller.ts`（`saveEntry(id)` 单条写入 + `buildNextSources(onlyIds?)` 重构 + state 增加 `dirtyIds`/`invalidIds`）、`src/client/card.tsx`（条目表单加"保存此数据源"按钮）。
- **验证**（L3）：Playwright 添加条目 → 修改 URL → 点"保存此数据源" → `settings.mutate` 200 → settings.yaml 落库且仅更新该条 → 改回验证。

### patches/scripts 定位区分
- **问题**：`scripts/` 里 `_patch_*.mjs` 与 `patches/` 目录语义混淆。
- **改动**：脚本改名 `_patch_*` → `_fix_*`（`apply-runtime-patches.sh` → `apply-runtime-fixes.sh`）；docs/00 第 4 节补充"patches=补丁文件 vs scripts=执行脚本"定位说明；docs/07、08、09 引用同步。
- **验证**：重命名后 `bash scripts/apply-runtime-fixes.sh` 幂等可重跑；grep 无 `_patch_` 残留（脚本名层面）。

### 测试验证规范落地
- 新增 `docs/09-测试验证规范.md`：核心原则"验证真实用户路径，而非自我报告"（含本次"curl 通过但浏览器无反应"反面教材）；L0-L4 分层；Playwright 要求；最小验证清单。
- Copy 上游 `deepseek-harness/docs/testing.zh.md` → `docs/上游测试策略-参考.md`（未修改）。
- 新增 `scripts/verify-open-document.cjs`：一键 L3 浏览器验证（5 项断言）。

---

## 历史记录（早期）

- LAN 访问 403：PRIVILEGED_METHODS 信任围栏 → trustedHosts patch；runtime index.html 注入 `__DSH_TRUSTED_HOSTS__`。
- `crypto.randomUUID` 缺失（LAN 非 secure context）→ index.html polyfill。
- `--host 0.0.0.0` 被拒 → profile webserver host 配置 + socat 桥接。
- Prometheus 查询缺 `step` → metrics 默认 60s + 参数校验。
- 工具输出非 lossless JSON → `sanitizeJson`。

