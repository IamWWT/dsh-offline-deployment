# 项目文档

基于「故障排查助手」插件的 DeepSeek Harness 离线部署项目文档。

## 文档索引

| [00-项目开发规范.md](00-项目开发规范.md) | **必须遵守**：命名/目录/插件/补丁/文档/Git/安全规范 | 全体 |
| [source-guide/](source-guide/) | deepseek-harness 源码讲解（rc.7） | 开发者 |
| 文档 | 内容 | 面向 |
|---|---|---|
| [01-从源码创建插件.md](01-从源码创建插件.md) | 如何从零创建一个 dsh 插件（含最小示例、配置化、设置命名空间、浏览器半） | 插件开发者 |
| [02-打包发布插件为bundle.md](02-打包发布插件为bundle.md) | 如何把插件打包为 bundle、发布 npm/GitHub、别人安装 | 插件开发者 |
| [03-网络与服务器部署.md](03-网络与服务器部署.md) | 如何开放网络让服务器/局域网访问（DSH_BIND=0.0.0.0） | 运维 |
| [04-开发容器环境源码部署打包.md](04-开发容器环境源码部署打包.md) | 开发容器里从源码部署、编译、打包本项目 | 开发者 |
| [05-生产级部署到x86-arm服务器.md](05-生产级部署到x86-arm服务器.md) | 生产级部署到 x86/arm 服务器（内网离线零编译） | 运维 |
| [08-dsh上游更新适配清单.md](08-dsh上游更新适配清单.md) | **deepseek-harness 更新必做**：补丁/运行时/API/插件/验证逐项检查（脚本 check-upstream.sh） |
| [07-运行时补丁说明.md](07-运行时补丁说明.md) | 对上游的运行时修复（polyfill/isLoopback/LAN 信任）与重应用 | 运维/开发者 |
| [06-故障插件架构与加载机制.md](06-故障插件架构与加载机制.md) | 故障助手插件：源码→编译→加载全链路；打开配置文件修复原理 | 开发者/运维 |
| [09-测试验证规范.md](09-测试验证规范.md) | **必须遵守**：按真实用户路径验证（分层 L0-L4、Playwright 浏览器验证） | 全体 |
| [上游测试策略-参考.md](上游测试策略-参考.md) | 上游 deepseek-harness 测试策略 copy（rc.2，未修改），09 规范的依据 | 开发者 |
| [CHANGELOG.md](CHANGELOG.md) | 变更记录：每次改动的验证证据（按 09 规范） | 全体 |

## 快速参考

```bash
# 预编译 runtime（构建机，有网络）
bash build-runtime.sh --arch <amd64|arm64> [--image <镜像>]

# 打包
./pack.sh --mode runtime --arch <arch> [--compress xz]   # 精简直跑包（默认）
./pack.sh --mode dev --arch <arch>                       # 开发全量包

# 运行（目标机）
docker compose up -d

# 服务器模式（局域网访问）
echo "DSH_BIND=0.0.0.0" >> .env && docker compose up -d
```

## 参考文章

- 《DeepSeek Harness 插件开发与发布复盘》：插件架构、配置化、bundle 发布
- 《OmniOps：基于 Agent 框架的 MySQL 慢查询诊断实践》：技术栈→组件→诊断技能三级结构、SKILL.md 方法论、MCP 数据采集

> 故障排查助手插件源码：`app/dsh-troubleshoot-assistant/`