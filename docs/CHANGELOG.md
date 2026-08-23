# 变更记录（CHANGELOG）

> 记录每次改动的**验证证据**（按 [09-测试验证规范.md](09-测试验证规范.md)：验证什么、怎么验的、结果），
> 避免"当时 curl 通过了"式的误判。格式：日期 + 改动 + 验证方式 + 结果。

---

## 2026-08-23

### dev/生产容器真正分离 + 插件路径修正
- **问题**：`docker-compose -f docker-compose.dev.yml ps` 显示生产容器（误判）——dev 容器从未成功启动过；
- **根因**：① dsh-dev-entry.sh 插件路径旧（/app/dsh-troubleshoot-assistant → /app/plugins/...）；② runtime web-app patch 存在 trustedHosts 键重复（YAML 解析失败，dev 启动即退）——此前 _fix_webapp 的"先删后插"逻辑未删除原始行，导致注入行+原始行并存；
- **修复**：dsh-dev-entry.sh 路径 + _fix_webapp.mjs 同时删除注入行与原始行；dedupe 现有 patch；全仓文档/脚本旧路径批量修正（README/MIGRATE/pack.sh/docs/01/04/06）；
- **验证**：dev 容器 9489 与生产 9488 独立共存均 healthy；dev restart 秒级重建（2.56s）插件源码；check-upstream 15/15。

### pack.sh 新增 update 增量打包模式
- **需求**：后续改插件/配置不想全量打包；office 等新装插件需进包（data/profiles 已含，全量自动带）。
- **改动**：`pack.sh --mode update --only <模块>`——模块 plugin(源码+lib)/profile(插件安装+配置)/runtime-fixes(运行时修复)/workspace(工作区)/all(全量)，可逗号分隔；MIGRATE.md 生成段补充增量应用说明。
- **验证**：实测 plugin+workspace=176K、profile=126M(含 office 插件)、runtime-fixes=2.9M，均正确。

### IP 变更适配（换内网/换机器）
- **需求**：机器换 IP 后多处硬编码 IP 需同步，希望只改一处。
- **改动**：
  1. 新增 `.env.example`（含逐项注释 + 换 IP 流程）；`apply-runtime-fixes.sh` 的 LAN_IP 优先读 `.env` 的 DSH_TRUSTED_HOSTS（单一来源），其次命令行参数；
  2. 新增 `docs/10-IP变更适配.md`（换 IP 标准流程、端口、业务 URL、多 IP、FAQ）；
  3. **修复幂等 bug**：`_fix_trusted.mjs`/`_fix_webapp.mjs` 之前只查标记存在，IP 变了不更新——改为"先删旧注入再插新 IP"，演练验证（192.168.9.99→10.1.1.1→0.127）全周期正确；
  4. `check-upstream.sh` 的 web-app 检查改为动态读 .env 的 IP。
- **验证**：换 IP 演练全通过（index.html / web-app patch 跟随 .env）；check-upstream 15/15。

### 打开配置文件：toast → 真实内容框（modal）展示配置原文
- **需求**：点击"打开配置文件"要看到真实内容（弹框），而非仅一句"已打开"提示。
- **实现**：
  1. 插件新增宿主路由 `GET /api/troubleshoot/settings-doc`（`src/settings-doc.ts`）：经 `ctx.get('settings').documentPath` 读 settings.yaml 原文返回；
  2. 前端注入脚本（`scripts/_fix_openfeedback.mjs`）拦截 `settings.openDocument` 成功后 fetch 该端点，弹出 modal（标题=文件路径、可滚动、Esc/遮罩/关闭按钮关闭）展示配置原文；
  3. 修复重复注入：旧 toast 脚本与新 modal 脚本共用防重标记导致新脚本被短路——清理旧块、新脚本改用 `__dshOpenFeedbackModalInjected`。
- **验证**（L3）：`scripts/verify-open-document.cjs` 5 项断言全 PASS（localhost + LAN 双路径）——按钮存在 / modal 弹出且含真实配置（providers）/ openDocument 200 / settings-doc 200 / OPEN_LOG 落盘。

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