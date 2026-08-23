/**
 * @module @dsh-tools/troubleshoot-assistant/client/controller
 *
 * "troubleshoot" 设置命名空间的暂存表单控制器（浏览器半）。
 *
 * 数据源为【动态数组】：用户可添加/删除任意数据源条目（选择预设类型或输入
 * 自定义类型），每条目编辑 URL / Token / 认证等字段。保存时把整个
 * dataSources 数组一次性写入（scope.set('dataSources', [...])），
 * 走修订号围栏；secret 字段（token/password）在 wire 上永不回显。
 *
 * 语义（与 dsh 设置卡片的通用约定一致）：
 * - 输入先暂存（draft），点保存才写入；写入失败回读 Host 最新状态；
 * - secret 字段：wire 上永不回显，卡片渲染为空；输入后保存=写入，
 *   点"清除"= unset（数组场景下置空字符串）；
 * - 空文本的非 secret 字段保存时保留空串（不回退 composition，数组整体写入）。
 *
 * 本控制器不依赖任何其他插件的值导出（客户端 bundle 纯净性要求）。
 */

import {
  createSnapshotStore,
  type SettingsScope,
  type SettingsScopeSnapshot,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'

/** 预设数据源类型与中文标签（与 Host 端保持一致，手写避免跨包值依赖）。 */
const PRESET_SOURCES = [
  { value: 'metrics', label: '指标' },
  { value: 'logs', label: '日志' },
  { value: 'trace', label: '调用链' },
  { value: 'cmdb', label: 'CMDB 变更历史' },
  { value: 'knowledge', label: '知识库' },
] as const
const AUTH_TYPES = ['none', 'bearer', 'basic', 'header'] as const
const AUTH_LABELS = {
  none: '无认证', bearer: 'Bearer Token', basic: 'Basic 认证', header: '自定义请求头',
} as const

/** 一个数据源条目的可编辑字段描述。 */
export interface EntryFieldSpec {
  /** 设置文档中的字段名。 */
  key: keyof DataSourceDraftEntry
  /** 渲染标签（中文）。 */
  label: string
  /** 输入提示。 */
  hint?: string
  /** 是否为 secret（wire 不回显，写入专用）。 */
  secret?: boolean
  /** 是否为数字字段（非法文本阻止保存）。 */
  numeric?: boolean
  /** 可选下拉选项（值 → 标签）。 */
  options?: { value: string; label: string }[]
}

/** 一条数据源条目的暂存形态（字符串化，与 Host DataSourceEntry 对应）。 */
export interface DataSourceDraftEntry {
  id: string
  type: string
  enabled: boolean
  name: string
  url: string
  authType: string
  token: string
  username: string
  password: string
  headerName: string
  queryPath: string
  timeoutMs: string
  description: string
  /** 新建（暂存）且尚未写入文档的条目；卡片据此默认展开待填写，保存后折叠为一行。 */
  isNew: boolean
}

/** 全部条目字段描述。 */
export const ENTRY_FIELD_SPECS: EntryFieldSpec[] = [
  { key: 'type', label: '类型', hint: '选择预设类型或输入自定义类型（如 es / clickhouse）', options: [...PRESET_SOURCES.map(s => ({ value: s.value, label: s.label })), { value: '__custom__', label: '自定义…' }] },
  { key: 'name', label: '名称', hint: '展示名称，便于 agent 识别' },
  { key: 'enabled', label: '启用', hint: '关闭后 agent 不会调用该源' },
  { key: 'url', label: 'URL', hint: '仅 http/https；认证信息请勿写进 URL' },
  { key: 'authType', label: '认证方式', options: AUTH_TYPES.map(value => ({ value, label: AUTH_LABELS[value] })) },
  { key: 'token', label: 'Token', secret: true, hint: 'Bearer Token 或自定义头值；支持 env:环境变量名 引用（推荐，不落盘）；已存值不会回显' },
  { key: 'username', label: '用户名（Basic）', hint: '仅 Basic 认证使用' },
  { key: 'password', label: '密码（Basic）', secret: true, hint: '仅 Basic 认证使用；支持 env:环境变量名 引用' },
  { key: 'headerName', label: 'Token 请求头名', hint: '仅"自定义请求头"认证使用，默认 Authorization' },
  { key: 'queryPath', label: '查询路径', hint: '留空使用类型默认（自定义类型留空则请求 base URL）' },
  { key: 'timeoutMs', label: '超时（毫秒）', numeric: true, hint: '留空/0 继承插件默认超时' },
  { key: 'description', label: '说明', hint: '该源的查询语法说明，会展示给 agent' },
]

/** 新数据源条目的默认值。 */
export function blankEntry(): DataSourceDraftEntry {
  return {
    id: newClientId(),
    type: 'metrics',
    enabled: true,
    name: '',
    url: '',
    authType: 'none',
    token: '',
    username: '',
    password: '',
    headerName: 'Authorization',
    queryPath: '',
    timeoutMs: '',
    description: '',
    isNew: true,
  }
}

/** 生成条目 ID（与 Host 的 newDataSourceId 同格式）。 */
function newClientId(): string {
  return 'ds-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

/** 本地兜底模板（Host 模板端点不可用时下载；完整版以 /api/troubleshoot/template 为准）。 */
function fallbackTemplate(): Record<string, unknown> {
  return {
    '_说明': '故障排查助手数据源导入模板（本地兜底版，字段说明从简）。dataSources 为数组，整体替换现有配置；token/password 推荐 env:环境变量名 引用。',
    dataSources: [
      {
        type: 'metrics', enabled: true, name: '示例 Prometheus',
        url: 'https://prometheus.example.com', authType: 'bearer', token: 'env:PROM_TOKEN',
        description: 'PromQL 查询接口',
      },
    ],
    defaultTimeRangeMinutes: 60,
    maxResults: 200,
  }
}

/** 卡片通用壳状态。 */
export interface CardShell {
  /** 命名空间是否对当前客户端可用（未服务则卡片渲染为空）。 */
  available: boolean
  /** Host 文档是否可写。 */
  writable: boolean
  /** 是否存在未保存的暂存编辑。 */
  dirty: boolean
  /** 是否存在非法暂存（阻止保存）。 */
  invalid: boolean
  /** 是否有写入正在跨线。 */
  saving: boolean
  /** 上次保存是否未按暂存内容落库（由下一次编辑/保存清除）。 */
  failed: boolean
}

/** 导入状态：none=无；pending=已导入待保存；error=导入失败。 */
export interface ImportInfo {
  kind: 'none' | 'pending' | 'error'
  message: string
  count: number
}

/** 卡片完整快照（注入 hooks 绑定为 useTroubleshootCard）。 */
export interface TroubleshootCardState extends CardShell {
  /** 全部条目（含未编辑的已存条目）。 */
  entries: DataSourceDraftEntry[]
  /** 全局默认值字段的暂存文本。 */
  global: {
    defaultTimeRangeMinutes: string
    maxResults: string
  }
  /** 最近一次导入的状态（pending 时"保存"生效、"放弃"取消）。 */
  importInfo: ImportInfo
}

/** 卡片注入面：hooks（快照）+ 表单动作。 */
export interface TroubleshootCardFace {
  hooks: {
    /** 卡片快照，由渲染器绑定为 useTroubleshootCard。 */
    troubleshootCard: SnapshotStore<TroubleshootCardState>
  }
  /** 暂存一个条目字段的文本。 */
  editField: (id: string, key: keyof DataSourceDraftEntry, text: string) => void
  /** 切换条目的启用开关。 */
  toggleEnabled: (id: string) => void
  /** 添加一条新数据源。 */
  addEntry: () => void
  /** 删除一条数据源（未保存条目直接消失，已存条目标记删除）。 */
  removeEntry: (id: string) => void
  /** 标记清除某条目的 secret 字段（保存时置空）。 */
  clearField: (id: string, key: keyof DataSourceDraftEntry) => void
  /** 暂存一个全局字段的文本。 */
  editGlobal: (key: 'defaultTimeRangeMinutes' | 'maxResults', text: string) => void
  /** 写入全部暂存编辑，随后按 Host 接受的值重新播种。 */
  save: () => void
  /** 丢弃全部暂存编辑。 */
  discard: () => void
  /** 导出当前数据源配置为 JSON 文本（优先 Host 导出端点：保留 env: 引用；失败时本地快照兜底）。 */
  exportData: () => Promise<string>
  /** 获取导入模板 JSON 文本（优先 Host 模板端点；失败时本地兜底模板）。 */
  fetchTemplate: () => Promise<string>
  /** 导入 JSON 文本：解析校验后整体暂存（替换语义），点"保存"生效、"放弃"取消。 */
  importData: (jsonText: string) => void
  /** 清除导入状态提示。 */
  clearImportInfo: () => void
}

/** 一个字段的暂存条目。 */
interface StagedEdit {
  /** 草稿文本。 */
  text: string
  /** true 表示保存时清空（secret 专用）。 */
  clear: boolean
}

/** 条目 id → 字段 → 暂存。 */
type StagedEntryEdits = Map<string, Partial<Record<keyof DataSourceDraftEntry, StagedEdit>>>
/** 全局字段暂存。 */
type StagedGlobalEdits = Partial<Record<'defaultTimeRangeMinutes' | 'maxResults', StagedEdit>>

/** 已存值 → 草稿文本。 */
function formatStored(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

/** 草稿文本 → 条目字段值。 */
function parseEntryField(key: keyof DataSourceDraftEntry, text: string): unknown {
  const trimmed = text.trim()
  switch (key) {
    case 'enabled': return trimmed === 'true'
    case 'timeoutMs': {
      if (trimmed === '') return 0
      const value = Number(trimmed)
      return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined
    }
    case 'type': return trimmed === '__custom__' ? '' : trimmed
    default: return trimmed
  }
}

/** 判定草稿是否非法（数字字段的非数字输入）。 */
function draftInvalid(key: keyof DataSourceDraftEntry, text: string): boolean {
  if (key !== 'timeoutMs' || text.trim() === '') return false
  const value = Number(text.trim())
  return !Number.isFinite(value) || value < 0
}

/** 基于 settingsScope 的动态数组暂存控制器。 */
export class TroubleshootCardController {
  private readonly store: SnapshotStore<TroubleshootCardState>
  private readonly stagedEntries: StagedEntryEdits = new Map()
  private readonly stagedGlobal: StagedGlobalEdits = {}
  private readonly removedIds = new Set<string>()
  private saving = false
  private failed = false
  private importInfo: ImportInfo = { kind: 'none', message: '', count: 0 }

  private readonly scope: SettingsScope<Record<string, unknown>>

  /** @param scope - "troubleshoot" 命名空间的绑定 scope。 */
  constructor(scope: SettingsScope<Record<string, unknown>>) {
    this.scope = scope
    this.store = createSnapshotStore<TroubleshootCardState>({
      available: false, writable: false, dirty: false, invalid: false, saving: false, failed: false,
      entries: [], global: { defaultTimeRangeMinutes: '60', maxResults: '200' },
      importInfo: { kind: 'none', message: '', count: 0 },
    })
    const unsubscribe = scope.subscribe(() => { this.reseed() })
    this.reseed()
    this.disposeUnsubscribe = unsubscribe
  }

  private disposeUnsubscribe: () => void

  /** 从最新快照重新播种未编辑字段。 */
  private reseed(): void {
    const snapshot = this.scope.getSnapshot()
    const value = (snapshot.value ?? {}) as Record<string, unknown>
    const available = snapshot.status === 'ready'
    const rawSources = Array.isArray(value.dataSources) ? value.dataSources : []
    const entries: DataSourceDraftEntry[] = rawSources.map((raw) => {
      const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
      const id = String(record.id ?? newClientId())
      const staged = this.stagedEntries.get(id)
      const field = (key: keyof DataSourceDraftEntry): string => {
        const edit = staged?.[key]
        if (edit?.clear === true) return ''
        if (edit?.text !== undefined) return edit.text
        return formatStored(record[key])
      }
      return {
        id,
        type: field('type') || 'metrics',
        enabled: field('enabled') === 'true',
        name: field('name'),
        url: field('url'),
        authType: field('authType') || 'none',
        token: '', // secret 永不回显
        username: field('username'),
        password: '', // secret 永不回显
        headerName: field('headerName') || 'Authorization',
        queryPath: field('queryPath'),
        timeoutMs: field('timeoutMs') || '',
        description: field('description'),
        isNew: false,
      }
    })
    // 追加新建条目（暂存中存在、文档中没有的）。
    // id 必须取暂存键（addEntry 时生成的稳定 id），而非 blankEntry() 的随机 id：
    // 若每次 reseed 都换新 id，React 会把条目当新节点卸载重建，输入框焦点丢失，
    // 表现为"新加的数据源打不进字"。
    for (const [id, staged] of this.stagedEntries) {
      if (entries.some(entry => entry.id === id)) continue
      const blank = blankEntry()
      entries.push({
        ...blank,
        id,
        type: staged.type?.text ?? blank.type,
        enabled: staged.enabled?.text === 'true',
        name: staged.name?.text ?? '',
        url: staged.url?.text ?? '',
        authType: staged.authType?.text ?? 'none',
        token: '', username: '', password: '', headerName: 'Authorization',
        queryPath: staged.queryPath?.text ?? '',
        timeoutMs: staged.timeoutMs?.text ?? '',
        description: staged.description?.text ?? '',
      })
    }
    // 过滤已标记删除的
    const visible = entries.filter(entry => !this.removedIds.has(entry.id))

    const globalValue = (value ?? {}) as Record<string, unknown>
    const global = {
      defaultTimeRangeMinutes: this.stagedGlobal.defaultTimeRangeMinutes?.text ?? (formatStored(globalValue.defaultTimeRangeMinutes) || '60'),
      maxResults: this.stagedGlobal.maxResults?.text ?? (formatStored(globalValue.maxResults) || '200'),
    }

    let invalid = false
    for (const entry of visible) {
      for (const spec of ENTRY_FIELD_SPECS) {
        if (draftInvalid(spec.key, entry[spec.key] as string)) invalid = true
      }
    }
    if (this.stagedGlobal.defaultTimeRangeMinutes !== undefined) {
      const v = Number(this.stagedGlobal.defaultTimeRangeMinutes.text.trim())
      if (!Number.isFinite(v) || v < 1) invalid = true
    }
    if (this.stagedGlobal.maxResults !== undefined) {
      const v = Number(this.stagedGlobal.maxResults.text.trim())
      if (!Number.isFinite(v) || v < 1) invalid = true
    }

    this.store.update((draft) => {
      draft.available = available
      draft.writable = snapshot.writable
      draft.entries = visible
      draft.global = global
      draft.dirty = this.stagedEntries.size > 0 || Object.keys(this.stagedGlobal).length > 0 || this.removedIds.size > 0
      draft.invalid = invalid
      draft.saving = this.saving
      draft.failed = this.failed
      draft.importInfo = { ...this.importInfo }
    })
  }

  /** 设置导入状态并刷新快照。 */
  private setImportInfo(kind: ImportInfo['kind'], message: string, count: number): void {
    this.importInfo = { kind, message, count }
    this.reseed()
  }

  /** 暂存一个条目字段的编辑。 */
  editField(id: string, key: keyof DataSourceDraftEntry, text: string): void {
    const staged = this.stagedEntries.get(id) ?? {}
    staged[key] = { text, clear: false }
    this.stagedEntries.set(id, staged)
    this.failed = false
    this.reseed()
  }

  /** 切换条目启用开关。 */
  toggleEnabled(id: string): void {
    const entry = this.store.getSnapshot().entries.find(candidate => candidate.id === id)
    if (entry === undefined) return
    this.editField(id, 'enabled', entry.enabled ? 'false' : 'true')
  }

  /** 添加一条新数据源。 */
  addEntry(): void {
    const blank = blankEntry()
    const staged: Partial<Record<keyof DataSourceDraftEntry, StagedEdit>> = {}
    for (const spec of ENTRY_FIELD_SPECS) {
      const value = blank[spec.key]
      staged[spec.key] = { text: typeof value === 'string' ? value : String(value), clear: false }
    }
    this.stagedEntries.set(blank.id, staged)
    this.failed = false
    this.reseed()
  }

  /** 删除一条数据源。 */
  removeEntry(id: string): void {
    this.stagedEntries.delete(id)
    this.removedIds.add(id)
    this.failed = false
    this.reseed()
  }

  /** 标记清除某条目的 secret 字段（保存时置空）。 */
  clearField(id: string, key: keyof DataSourceDraftEntry): void {
    const staged = this.stagedEntries.get(id) ?? {}
    const existing = staged[key]
    if (existing?.clear === true) delete staged[key]
    else staged[key] = { text: '', clear: true }
    this.stagedEntries.set(id, staged)
    this.reseed()
  }

  /** 暂存一个全局字段的文本。 */
  editGlobal(key: 'defaultTimeRangeMinutes' | 'maxResults', text: string): void {
    this.stagedGlobal[key] = { text, clear: false }
    this.failed = false
    this.reseed()
  }

  /** 写入全部暂存编辑；随后按 Host 接受的值重新播种。 */
  save(): void {
    if (this.saving) return
    const snapshot = this.scope.getSnapshot()
    if (!snapshot.writable || (!this.stagedEntries.size && Object.keys(this.stagedGlobal).length === 0 && this.removedIds.size === 0)) return

    // 组装完整 dataSources 数组
    const current = (snapshot.value ?? {}) as Record<string, unknown>
    const rawSources = Array.isArray(current.dataSources) ? current.dataSources as Record<string, unknown>[] : []
    const next: Record<string, unknown>[] = []
    for (const raw of rawSources) {
      const id = String((raw as Record<string, unknown>).id ?? '')
      if (this.removedIds.has(id)) continue
      const staged = this.stagedEntries.get(id)
      const merged = { ...raw }
      if (staged !== undefined) {
        for (const spec of ENTRY_FIELD_SPECS) {
          const edit = staged[spec.key]
          if (edit?.clear === true) { merged[spec.key] = ''; continue }
          if (edit?.text === undefined) continue
          const parsed = parseEntryField(spec.key, edit.text)
          if (parsed === undefined) continue
          merged[spec.key] = parsed
        }
      }
      next.push(merged)
    }
    // 追加新条目（staged 中存在但文档没有的）
    for (const [id, staged] of this.stagedEntries) {
      if (rawSources.some(raw => String((raw as Record<string, unknown>).id ?? '') === id) || this.removedIds.has(id)) continue
      const blank = blankEntry()
      const entry: Record<string, unknown> = { id }
      for (const spec of ENTRY_FIELD_SPECS) {
        const edit = staged[spec.key]
        if (edit?.clear === true) { entry[spec.key] = ''; continue }
        const text = edit?.text ?? formatStored(blank[spec.key])
        const parsed = parseEntryField(spec.key, text)
        entry[spec.key] = parsed === undefined ? '' : parsed
      }
      next.push(entry)
    }

    const patch: Record<string, unknown> = { dataSources: next }
    if (this.stagedGlobal.defaultTimeRangeMinutes !== undefined) {
      const v = Number(this.stagedGlobal.defaultTimeRangeMinutes.text.trim())
      if (Number.isFinite(v) && v >= 1) patch.defaultTimeRangeMinutes = Math.trunc(v)
    }
    if (this.stagedGlobal.maxResults !== undefined) {
      const v = Number(this.stagedGlobal.maxResults.text.trim())
      if (Number.isFinite(v) && v >= 1) patch.maxResults = Math.trunc(v)
    }

    this.saving = true
    this.failed = false
    this.reseed()
    void (async () => {
      try {
        await this.scope.set('dataSources', next)
        for (const [key, edit] of Object.entries(this.stagedGlobal)) {
          const k = key as 'defaultTimeRangeMinutes' | 'maxResults'
          if (edit.text.trim() === '') continue
          const v = Number(edit.text.trim())
          if (Number.isFinite(v) && v >= 1) await this.scope.set(k, Math.trunc(v))
        }
      } catch {
        this.failed = true
      } finally {
        this.stagedEntries.clear()
        this.stagedGlobal
        this.removedIds.clear()
        this.saving = false
        this.importInfo = { kind: 'none', message: '', count: 0 }
        this.reseed()
      }
    })()
  }

  /** 丢弃全部暂存编辑。 */
  discard(): void {
    this.stagedEntries.clear()
    Object.keys(this.stagedGlobal).forEach((key) => { delete this.stagedGlobal[key as keyof StagedGlobalEdits] })
    this.removedIds.clear()
    this.failed = false
    this.importInfo = { kind: 'none', message: '', count: 0 }
    this.reseed()
  }

  /**
   * 导出当前数据源配置为 JSON 文本。
   * 优先请求 Host 导出端点（能保留 env: 引用；字面量 secret 由 Host 掩码）；
   * 端点不可用时用本地快照兜底（secret 全空，note 中说明）。
   */
  async exportData(): Promise<string> {
    try {
      const res = await fetch('/api/troubleshoot/export', { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      JSON.parse(text) // 校验可解析
      return text
    } catch {
      const snapshot = this.store.getSnapshot()
      const doc = {
        version: 1,
        exportedAt: new Date().toISOString(),
        note: '兜底导出（页面本地快照）：token/password 页面上读不到，均为空；导入后请重新填写（推荐 env:环境变量名 引用）。',
        dataSources: snapshot.entries.map((entry) => ({
          id: entry.id,
          type: entry.type,
          enabled: entry.enabled,
          name: entry.name,
          url: entry.url,
          authType: entry.authType,
          token: '',
          username: entry.username,
          password: '',
          headerName: entry.headerName,
          queryPath: entry.queryPath,
          timeoutMs: entry.timeoutMs === '' ? 0 : Number(entry.timeoutMs),
          description: entry.description,
        })),
        defaultTimeRangeMinutes: Number(snapshot.global.defaultTimeRangeMinutes) || 60,
        maxResults: Number(snapshot.global.maxResults) || 200,
      }
      return JSON.stringify(doc, null, 2)
    }
  }

  /** 获取导入模板 JSON 文本（优先 Host 模板端点；失败时用本地兜底模板）。 */
  async fetchTemplate(): Promise<string> {
    try {
      const res = await fetch('/api/troubleshoot/template', { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      JSON.parse(text)
      return text
    } catch {
      return JSON.stringify(fallbackTemplate(), null, 2)
    }
  }

  /**
   * 导入 JSON 文本：解析校验后按【整体替换】语义暂存——
   * - 文件中 id 与现有条目一致 → 暂存为对该条目的字段编辑（secret 空值 = 保留现有值）；
   * - 文件中 id 不存在 → 暂存为新条目；
   * - 现有条目不在文件中 → 标记删除。
   * 暂存后需点"保存"才落库；点"放弃"取消。任何解析/校验失败只提示、不改暂存。
   */
  importData(jsonText: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      this.setImportInfo('error', '导入失败：文件不是有效的 JSON', 0)
      return
    }
    // 接受两种形态：裸数组 [ {...}, ... ] 或 { dataSources: [...] }（_ 前缀键忽略）。
    let rawEntries: unknown
    let rawGlobal: Record<string, unknown> | undefined
    if (Array.isArray(parsed)) {
      rawEntries = parsed
    } else if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>
      rawEntries = record.dataSources
      rawGlobal = record
    } else {
      this.setImportInfo('error', '导入失败：格式不识别（应为 dataSources 数组，或含 dataSources 数组的对象）', 0)
      return
    }
    if (!Array.isArray(rawEntries)) {
      this.setImportInfo('error', '导入失败：dataSources 不是数组', 0)
      return
    }

    // 逐条校验 + 规范化
    const seen = new Set<string>()
    const normalized: Record<string, string | boolean | number>[] = []
    for (let i = 0; i < rawEntries.length; i++) {
      const raw = rawEntries[i]
      if (typeof raw !== 'object' || raw === null) {
        this.setImportInfo('error', `导入失败：第 ${i + 1} 条不是对象`, 0)
        return
      }
      const r = raw as Record<string, unknown>
      const str = (key: string): string => {
        const v = r[key]
        if (v === undefined || v === null) return ''
        return typeof v === 'string' ? v : String(v)
      }
      const type = str('type').trim() || 'metrics'
      const url = str('url').trim()
      if (url !== '' && !/^https?:\/\//i.test(url)) {
        this.setImportInfo('error', `导入失败：第 ${i + 1} 条的 URL 须以 http:// 或 https:// 开头（当前 ${url.slice(0, 80)}）`, 0)
        return
      }
      const enabled = r.enabled === undefined ? true : r.enabled === true || r.enabled === 'true'
      const authType = (AUTH_TYPES as readonly string[]).includes(str('authType')) ? str('authType') : 'none'
      let timeoutMs = 0
      if (r.timeoutMs !== undefined && r.timeoutMs !== null && str('timeoutMs') !== '') {
        const v = Number(r.timeoutMs)
        if (!Number.isFinite(v) || v < 0) {
          this.setImportInfo('error', `导入失败：第 ${i + 1} 条的 timeoutMs 须为非负数字（当前 ${String(r.timeoutMs)}）`, 0)
          return
        }
        timeoutMs = Math.trunc(v)
      }
      // id 缺失或文件内重复 → 自动生成（避免静默覆盖）
      let id = str('id').trim()
      if (id === '' || seen.has(id)) id = newClientId()
      seen.add(id)
      normalized.push({
        id, type, enabled,
        name: str('name').trim(), url, authType,
        token: str('token'), username: str('username'), password: str('password'),
        headerName: str('headerName').trim() || 'Authorization',
        queryPath: str('queryPath'), timeoutMs, description: str('description'),
      })
    }

    // 全局默认值（可选；越界忽略）
    const globalEdits: { key: 'defaultTimeRangeMinutes' | 'maxResults'; value: number }[] = []
    if (rawGlobal !== undefined) {
      const limits: { key: 'defaultTimeRangeMinutes' | 'maxResults'; lo: number; hi: number }[] = [
        { key: 'defaultTimeRangeMinutes', lo: 1, hi: 7 * 24 * 60 },
        { key: 'maxResults', lo: 1, hi: 5000 },
      ]
      for (const { key, lo, hi } of limits) {
        const rawValue = rawGlobal[key]
        if (rawValue === undefined || rawValue === '') continue
        const v = Number(rawValue)
        if (Number.isFinite(v) && v >= lo && v <= hi) globalEdits.push({ key, value: Math.trunc(v) })
      }
    }

    // 整体替换式暂存
    const snapshot = this.scope.getSnapshot()
    const value = (snapshot.value ?? {}) as Record<string, unknown>
    const rawSources = Array.isArray(value.dataSources) ? value.dataSources : []
    const docIds = new Set<string>()
    for (const raw of rawSources) {
      const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
      const id = String(record.id ?? '')
      if (id !== '') docIds.add(id)
    }

    this.stagedEntries.clear()
    Object.keys(this.stagedGlobal).forEach((key) => { delete this.stagedGlobal[key as keyof StagedGlobalEdits] })
    this.removedIds.clear()

    const fieldKeys: (keyof DataSourceDraftEntry)[] = [
      'type', 'enabled', 'name', 'url', 'authType', 'token', 'username', 'password',
      'headerName', 'queryPath', 'timeoutMs', 'description',
    ]
    for (const entry of normalized) {
      const staged: Partial<Record<keyof DataSourceDraftEntry, StagedEdit>> = {}
      for (const key of fieldKeys) {
        const text = key === 'enabled' ? (entry.enabled ? 'true' : 'false')
          : key === 'timeoutMs' ? String(entry.timeoutMs)
          : String(entry[key])
        // secret 字段空值 = 保留现有值（与卡片"留空不修改"一致）
        if ((key === 'token' || key === 'password') && text === '') continue
        staged[key] = { text, clear: false }
      }
      this.stagedEntries.set(String(entry.id), staged)
    }
    let removedCount = 0
    for (const id of docIds) {
      if (!seen.has(id)) {
        this.removedIds.add(id)
        removedCount++
      }
    }
    for (const { key, value } of globalEdits) {
      this.stagedGlobal[key] = { text: String(value), clear: false }
    }

    this.failed = false
    this.reseed()
    const removedNote = removedCount > 0 ? `（将删除 ${removedCount} 条现有条目）` : ''
    this.setImportInfo('pending', `已导入 ${normalized.length} 条数据源${removedNote}。检查无误后点「保存」生效；点「放弃」取消。`, normalized.length)
  }

  /** 清除导入状态提示。 */
  clearImportInfo(): void {
    if (this.importInfo.kind === 'none') return
    this.importInfo = { kind: 'none', message: '', count: 0 }
    this.reseed()
  }

  /** 构建卡片注入面。 */
  inject(): TroubleshootCardFace {
    return {
      hooks: { troubleshootCard: this.store },
      editField: (id, key, text) => this.editField(id, key, text),
      toggleEnabled: (id) => this.toggleEnabled(id),
      addEntry: () => this.addEntry(),
      removeEntry: (id) => this.removeEntry(id),
      clearField: (id, key) => this.clearField(id, key),
      editGlobal: (key, text) => this.editGlobal(key, text),
      save: () => this.save(),
      discard: () => this.discard(),
      exportData: () => this.exportData(),
      fetchTemplate: () => this.fetchTemplate(),
      importData: (jsonText) => this.importData(jsonText),
      clearImportInfo: () => this.clearImportInfo(),
    }
  }

  /** 释放订阅（随插件 fiber 卸载调用）。 */
  dispose(): void {
    this.disposeUnsubscribe()
  }
}
