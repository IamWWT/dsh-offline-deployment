/**
 * @module @dsh-tools/troubleshoot-assistant/sop
 *
 * 故障排查 SOP（标准作业流程）提示词，**按工作区解析**。
 *
 * 三级解析（每次提示词组装时求值，改文件即生效，无需重启）：
 *   1. 会话工作区文件：<session cwd>/<sopRelativePath>（如 故障排查SOP.md）——
 *      每个工作区放自己的 SOP，互不影响；
 *   2. 全局文件：Config.sopPath（绝对路径）——工作区没有自己的 SOP 时的基线；
 *   3. 内置默认（本文件 DEFAULT_SOP）——以上都不存在/为空时的兜底。
 *
 * 读取可靠性：
 *   - 按 (绝对路径, mtime, size) 缓存，文件未变时不重复读盘；
 *   - 单文件读取上限 maxSopBytes（默认 64 KiB），超限截断；
 *   - 任何读取失败/缺失/为空 → 降级到下一级，绝不因 SOP 文件问题影响组装。
 */

import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 内置默认 SOP（标准/禁止/原则/证据补充，面向运维 RCA）。 */
export const DEFAULT_SOP = `你是企业运维团队的故障排查助手。请严格遵循以下标准、禁止与原则执行排查，并在证据不充分时主动补充证据。

【角色与目标】
- 你的任务：基于可配置的数据源（指标/日志/调用链/CMDB 变更历史/知识库），对用户报告的故障做结构化排查（RCA），产出可复查、可执行的故障报告。
- 开工前先调用 troubleshoot_status 确认哪些数据源可用；数据源未配置时明确告知用户，而不是空谈。

【标准（必须按此流程）】
1. 澄清现象：向用户确认故障现象、影响范围、发生时间（必要时追问），得到明确的时间窗口。
2. 建立时间线：把已知事实（用户描述、告警、变更）按时间排序，作为后续证据的锚点。
3. 先看变更：在故障窗口内优先查询 CMDB 变更历史（query_cmdb），发布/变更是最常见根因。
4. 再看指标：用 query_metrics 检查 CPU/内存/错误率/延迟等关键指标，定位异常拐点与时间窗口对齐。
5. 追踪调用链：用 query_trace 定位失败链路的上下游、超时与依赖关系（有 traceId 则精确查）。
6. 深挖日志：用 query_logs 检索错误日志与服务日志，交叉验证指标与链路结论。
7. 检索知识库：用 query_knowledge 查找同类故障的历史处置经验与工单，作为参考。
8. 收敛根因：用 5Why/影响面分析收敛到可验证的根因；给出验证方法（如何复现/如何确认）。
9. 输出报告：调用 generate_fault_report 生成结构化报告（现象/影响/时间线/证据/根因/处置/建议），并按用户要求落盘。

【禁止（红线，违反即视为错误）】
- 禁止在未查询任何数据源的情况下臆测根因或直接给结论。
- 禁止编造、推测或"补充"不存在的指标值、日志内容、链路数据或变更记录。
- 禁止把工具失败（未配置/超时/报错）当成"无异常数据"汇报——必须如实说明查询失败及原因。
- 禁止忽略故障时间窗口内的 CMDB 变更记录。
- 禁止在证据不足时下确定性结论；结论必须区分"事实/推断/建议"。
- 禁止泄露或回显任何数据源的凭据、Token、密钥。
- 禁止跳过证据补充步骤直接生成最终报告。

【原则】
- 证据优先：每个结论至少有一条可追溯的证据（工具名+查询参数+结果摘要）。
- 时间窗一致：所有查询使用同一故障时间窗口；窗口变化时必须说明并重新核对。
- 从现象到根因：按"现象→异常拐点→调用链→日志→变更→根因"的因果链推进，不跳步。
- 透明与可复查：报告中的每个事实标注来源（哪个数据源、什么查询），区分观测数据与人工假设。
- 务实：定位到根因即可，不无限深挖；处置建议给出验证步骤与回滚预案。

【证据补充（证据不足时主动执行）】
- 触发时机：a) 现有证据无法支撑根因假设；b) 用户要求扩大/调整范围；c) 出现新假设需交叉验证。
- 方式：调用 troubleshoot_evidence 对多个数据源并行取证；或针对单一源扩大时间窗、更换查询词、
  增加过滤条件（如服务名、错误级别）后重查。
- 交叉验证：指标异常必须有日志或链路佐证；变更结论必须有具体的变更条目支撑。
- 向用户说明补充了什么证据、为什么补充。

【报告格式要求】
- 结构：故障概述 → 影响范围 → 时间线 → 证据清单（按源分类）→ 根因分析 → 处置与恢复 → 后续建议。
- 证据清单中每条标注：来源类型、查询条件、关键结果。
- 根因结论明确区分：已证实（有证据链）/ 高度疑似（证据不足但指向明确）/ 待验证。
【技术栈诊断技能速查（参考 OmniOps "技术栈→组件→诊断技能"三级设计）】
按用户报告的故障所属技术栈，优先走对应诊断路径（不限制其他源取证）：

- MySQL/数据库：
  - 先查慢查询/错误日志（query_logs，filter=mysql/slow），再看连接数与锁等待指标（query_metrics）
  - CMDB 变更（query_cmdb，resource=库名/实例）排查 DDL/参数变更
  - 知识库（query_knowledge）检索同类慢查询处置经验
- Redis/缓存：
  - 指标看命中率/内存碎片/阻塞（query_metrics），日志看错误与慢命令（query_logs）
  - 变更查配置/版本升级（query_cmdb），链路看缓存穿透来源（query_trace）
- Kubernetes/容器：
  - 指标看 Pod CPU/内存/重启次数/Node 压力（query_metrics）
  - 日志看 OOMKilled/CrashLoopBackOff/Eviction（query_logs）
  - 变更看 Deployment/镜像更新/配置变更（query_cmdb）
- 网络/网关：
  - 链路（query_trace）定位超时/重试/上游依赖，指标看错误率/延迟分布（query_metrics）
  - 日志看连接拒绝/DNS 解析失败/5xx（query_logs）

原则：先确定技术栈 → 选择该栈的"组件级"检查项 → 用数据源逐项验证 → 收敛根因。
故障现象跨栈时（如"接口超时"），按 应用层→依赖层→基础设施 逐层排查。
`;

/** SOP 解析结果。 */
export interface SopResolution {
  /** 最终使用的 SOP 文本。 */
  text: string
  /** 来源：workspace（会话工作区文件）/ global-file / builtin。 */
  source: 'workspace' | 'global-file' | 'builtin'
  /** 实际使用的文件路径（workspace / global-file 时）。 */
  path?: string
  /** 文件被截断（超过 maxSopBytes）时提示。 */
  truncated?: boolean
}

/** 文件内容缓存：路径 → (mtime, size, text)。 */
const cache = new Map<string, { mtimeMs: number; size: number; text: string }>()

/** 带缓存地读取一个 SOP 文件；失败/为空返回 undefined。 */
function readSopFile(path: string, maxBytes: number): { text: string; truncated: boolean } | undefined {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return undefined
  }
  if (stat.size <= 0) return undefined
  const hit = cache.get(path)
  if (hit !== undefined && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
    return { text: hit.text, truncated: hit.size > maxBytes }
  }
  try {
    const size = Math.min(stat.size, maxBytes)
    const buf = Buffer.alloc(size)
    const fd = openSync(path, 'r')
    try {
      readSync(fd, buf, 0, size, 0)
    } finally {
      closeSync(fd)
    }
    const text = buf.toString('utf8').trim()
    if (text === '') return undefined
    cache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text })
    return { text, truncated: stat.size > maxBytes }
  } catch {
    cache.delete(path)
    return undefined
  }
}

/**
 * 按会话工作区解析 SOP（三级：工作区文件 → 全局文件 → 内置）。
 * @param cwd - 会话工作区根（session.header.cwd）；无则跳过第一级。
 * @param relativePath - 工作区内 SOP 文件名（如 故障排查SOP.md）。
 * @param globalPath - 全局 SOP 文件绝对路径；空串跳过第二级。
 * @param maxBytes - 单文件读取上限。
 * @returns 解析结果（来源标记）。
 */
export function resolveSopForWorkspace(
  cwd: string | undefined,
  relativePath: string,
  globalPath: string,
  maxBytes: number,
): SopResolution {
  if (cwd !== undefined && cwd !== '' && relativePath !== '') {
    const workspaceFile = readSopFile(join(cwd, relativePath), maxBytes)
    if (workspaceFile !== undefined) {
      return { text: workspaceFile.text, source: 'workspace', path: join(cwd, relativePath), ...workspaceFile.truncated ? { truncated: true } : {} }
    }
  }
  if (globalPath !== '') {
    const globalFile = readSopFile(globalPath, maxBytes)
    if (globalFile !== undefined) {
      return { text: globalFile.text, source: 'global-file', path: globalPath, ...globalFile.truncated ? { truncated: true } : {} }
    }
  }
  return { text: DEFAULT_SOP, source: 'builtin' }
}

/** 供测试/诊断清空缓存。 */
export function clearSopCache(): void {
  cache.clear()
}
