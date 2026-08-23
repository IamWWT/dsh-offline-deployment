/**
 * @module @dsh-tools/troubleshoot-assistant/client/card
 *
 * "troubleshoot" 设置卡片（浏览器半，注册进 settings.plugin.item 槽位）。
 *
 * 数据源为【动态列表】，交互按"添加 → 填写 → 保存 → 折叠为一行"组织：
 * - 已存条目默认折叠为一行，行标题展示基本信息（名称 / 类型 / URL / 启用状态），
 *   点击行头（"详情"）展开完整配置，再点（"收起"）折叠；
 * - 新建条目默认展开待填写；点"保存"写入后折叠为一行；
 * - 条目内可编辑类型（预设下拉/自定义）、名称、URL、认证、Token、查询路径、超时、说明；条目可删除。
 *
 * 纯展示组件：全部数据与动作经 props（运行时 share + 注入 face）传入，
 * 不直接触达 ctx；样式使用内联 style（无 CSS 模块依赖，客户端 bundle 纯净）。
 */

import { useEffect, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import type { InjectFace, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots"
import type {} from "./slot-contract.ts"
import { ENTRY_FIELD_SPECS, type DataSourceDraftEntry, type TroubleshootCardFace } from "./controller.ts"
import type { TroubleshootCardState } from "./controller.ts"

/** 卡片组件 props：槽位运行时 share + 注入 face。 */
export type TroubleshootCardProps =
  PropsRuntime<"settings.plugin.item">
  & InjectFace<TroubleshootCardFace>

/** 配色常量（与 dsh 深色/浅色主题协调的中性色）。 */
const STYLE = {
  card: { border: "1px solid var(--dsw-alias-border-l2, #e5e7eb)", borderRadius: 12, padding: "16px 20px", marginBottom: 16, background: "var(--dsw-alias-bg-module, #ffffff)" },
  title: { fontSize: 15, fontWeight: 600, margin: "0 0 4px" },
  desc: { fontSize: 13, color: "#6b7280", margin: "0 0 12px" },
  group: { border: "1px solid var(--dsw-alias-border-l2, #e5e7eb)", borderRadius: 8, marginBottom: 8, padding: "0 12px" },
  summary: { fontSize: 13, fontWeight: 600, color: "#374151", padding: "10px 0", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 8 },
  typeBadge: { fontSize: 11, padding: "1px 8px", borderRadius: 8, background: "#ecfdf5", color: "#047857", flexShrink: 0 },
  statusOn: { fontSize: 11, padding: "1px 8px", borderRadius: 8, background: "#dcfce7", color: "#166534", flexShrink: 0 },
  statusOff: { fontSize: 11, padding: "1px 8px", borderRadius: 8, background: "#f3f4f6", color: "#6b7280", flexShrink: 0 },
  name: { fontSize: 13, fontWeight: 600, color: "#374151", flexShrink: 0 },
  rowUrl: { fontSize: 12, fontWeight: 400, color: "#6b7280", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  detailHint: { fontSize: 12, color: "#2563eb", flexShrink: 0 },
  chevron: { fontSize: 11, color: "#9ca3af", flexShrink: 0 },
  body: { paddingBottom: 6 },
  fieldRow: { display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0" },
  fieldLabel: { width: 160, fontSize: 13, flexShrink: 0, paddingTop: 6 },
  fieldHint: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  input: { flex: 1, fontSize: 13, padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", color: "inherit", boxSizing: "border-box" },
  select: { flex: 1, fontSize: 13, padding: "6px 4px", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", color: "inherit" },
  secretBadge: { display: "inline-block", fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "#fee2e2", color: "#991b1b", marginLeft: 8 },
  error: { fontSize: 12, color: "#b91c1c", marginTop: 8 },
  actions: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 },
  button: { fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", cursor: "pointer", color: "inherit" },
  buttonPrimary: { fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px solid #2563eb", background: "#2563eb", color: "#ffffff", cursor: "pointer" },
  buttonDanger: { fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "transparent", color: "#b91c1c", cursor: "pointer" },
  buttonAdd: { fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "1px dashed #2563eb", background: "transparent", color: "#2563eb", cursor: "pointer" },
  switch: { fontSize: 13, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "transparent", cursor: "pointer", color: "inherit" },
  switchOn: { fontSize: 13, padding: "4px 10px", borderRadius: 6, border: "1px solid #2563eb", background: "#2563eb", color: "#ffffff", cursor: "pointer" },
  importOk: { fontSize: 12, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "6px 10px", marginTop: 8 },
  importErr: { fontSize: 12, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px", marginTop: 8 },
  sectionLabel: { fontSize: 12, color: "#6b7280", marginBottom: 6 },
} as const

/** 触发浏览器下载一段 JSON 文本。 */
function downloadJson(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
}

/** 文件名时间戳（YYYYMMDD-HHMM）。 */
function fileStamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, "0")
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 单条目字段控件的行。 */
function FieldRow(props: {
  spec: { key: keyof DataSourceDraftEntry; label: string; hint?: string; secret?: boolean; numeric?: boolean; options?: { value: string; label: string }[] }
  value: string
  disabled: boolean
  onEdit: (text: string) => void
  onClear: () => void
}) {
  const { spec, value, disabled, onEdit, onClear } = props
  const options = spec.options ?? []
  const input = options.length > 0 && spec.key !== "type"
    ? (
      <select style={STYLE.select} value={value} disabled={disabled} onChange={(event) => { onEdit(event.target.value) }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
    : (
      <input
        style={STYLE.input}
        type={spec.secret === true ? "password" : "text"}
        inputMode={spec.numeric === true ? "numeric" : undefined}
        value={value}
        disabled={disabled}
        placeholder={spec.secret === true ? "留空不修改" : ""}
        onChange={(event) => { onEdit(event.target.value) }}
      />
    )
  return (
    <div style={STYLE.fieldRow}>
      <div style={STYLE.fieldLabel}>
        {spec.label}
        {spec.secret === true && <span style={STYLE.secretBadge}>机密</span>}
      </div>
      <div style={{ flex: 1 }}>
        {input}
        {spec.secret === true && (
          <button type="button" style={{ ...STYLE.button, marginTop: 4 }} disabled={disabled} onClick={onClear}>清除已存值</button>
        )}
        {spec.hint !== undefined && <div style={STYLE.fieldHint}>{spec.hint}</div>}
      </div>
    </div>
  )
}

/** 全局字段行。 */
function GlobalRow(props: {
  label: string
  value: string
  hint?: string
  disabled: boolean
  onEdit: (text: string) => void
}) {
  const { label, value, disabled, onEdit, hint } = props
  return (
    <div style={STYLE.fieldRow}>
      <div style={STYLE.fieldLabel}>{label}</div>
      <div style={{ flex: 1 }}>
        <input style={STYLE.input} type="text" inputMode="numeric" value={value} disabled={disabled} onChange={(event) => { onEdit(event.target.value) }} />
        {hint !== undefined && <div style={STYLE.fieldHint}>{hint}</div>}
      </div>
    </div>
  )
}

/** 条目完整配置表单（展开时渲染）。 */
function EntryForm(props: {
  entry: DataSourceDraftEntry
  disabled: boolean
  onEditField: (id: string, key: keyof DataSourceDraftEntry, text: string) => void
  onToggleEnabled: (id: string) => void
  onClearField: (id: string, key: keyof DataSourceDraftEntry) => void
  onRemove: (id: string) => void
}) {
  const { entry, disabled, onEditField, onToggleEnabled, onClearField, onRemove } = props
  const typeOptions = ENTRY_FIELD_SPECS.find(spec => spec.key === "type")?.options ?? []
  const isPreset = typeOptions.some(option => option.value === entry.type)
  return (
    <div style={STYLE.body}>
      {ENTRY_FIELD_SPECS.map((spec) => {
        if (spec.key === "enabled") {
          return (
            <div key={spec.key} style={STYLE.fieldRow}>
              <div style={STYLE.fieldLabel}>{spec.label}</div>
              <div style={{ flex: 1 }}>
                <button type="button" style={entry.enabled === true ? STYLE.switchOn : STYLE.switch} disabled={disabled} onClick={() => { onToggleEnabled(entry.id) }}>
                  {entry.enabled === true ? "已启用" : "已停用"}
                </button>
                {spec.hint !== undefined && <div style={STYLE.fieldHint}>{spec.hint}</div>}
              </div>
            </div>
          )
        }
        if (spec.key === "type") {
          return (
            <div key={spec.key} style={STYLE.fieldRow}>
              <div style={STYLE.fieldLabel}>{spec.label}</div>
              <div style={{ flex: 1 }}>
                <select
                  style={STYLE.select}
                  value={isPreset ? entry.type : "__custom__"}
                  disabled={disabled}
                  onChange={(event) => {
                    if (event.target.value === "__custom__") onEditField(entry.id, "type", "")
                    else onEditField(entry.id, "type", event.target.value)
                  }}
                >
                  {typeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {!isPreset && (
                  <input
                    style={{ ...STYLE.input, marginTop: 4 }}
                    type="text"
                    placeholder="输入自定义类型（如 es / clickhouse / prometheus2）"
                    value={entry.type}
                    disabled={disabled}
                    onChange={(event) => { onEditField(entry.id, "type", event.target.value) }}
                  />
                )}
                {spec.hint !== undefined && <div style={STYLE.fieldHint}>{spec.hint}</div>}
              </div>
            </div>
          )
        }
        const value = String(entry[spec.key] ?? "")
        return <FieldRow key={spec.key} spec={spec} value={value} disabled={disabled} onEdit={(text) => { onEditField(entry.id, spec.key, text) }} onClear={() => { onClearField(entry.id, spec.key) }} />
      })}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 0" }}>
        <button type="button" style={STYLE.buttonDanger} disabled={disabled} onClick={() => { onRemove(entry.id) }}>删除此数据源</button>
      </div>
    </div>
  )
}

/**
 * 渲染故障排查助手设置卡片（动态数据源列表：已存折叠为一行、新建展开待填、点详情展开配置）。
 * @param props - 运行时 share + 注入 face（快照与表单动作）。
 * @returns 卡片。
 */
export function TroubleshootCard(props: TroubleshootCardProps): React.JSX.Element | null {
  const state = props.useTroubleshootCard(snapshot => snapshot)
  // 每行展开状态：默认"新建展开、已存折叠"；用户点行头可切换；保存完成后重置回默认。
  const [userOpen, setUserOpen] = useState<Set<string>>(() => new Set())
  const [userClosed, setUserClosed] = useState<Set<string>>(() => new Set())
  const prevDirty = useRef(state.dirty)
  useEffect(() => {
    if (prevDirty.current && !state.dirty) {
      // 保存/放弃完成：回到默认展开状态（新建展开、已存折叠为一行）。
      setUserOpen(new Set())
      setUserClosed(new Set())
    }
    prevDirty.current = state.dirty
  }, [state.dirty])
  if (!state.available) return null
  const disabled = !state.writable

  const isExpanded = (entry: DataSourceDraftEntry): boolean =>
    userOpen.has(entry.id) ? true : userClosed.has(entry.id) ? false : entry.isNew
  const toggle = (entry: DataSourceDraftEntry): void => {
    if (isExpanded(entry)) {
      setUserClosed(prev => new Set(prev).add(entry.id))
      setUserOpen(prev => { const next = new Set(prev); next.delete(entry.id); return next })
    } else {
      setUserOpen(prev => new Set(prev).add(entry.id))
      setUserClosed(prev => { const next = new Set(prev); next.delete(entry.id); return next })
    }
  }

  // 备份与迁移：导出 / 导入 / 模板下载
  const handleExport = async (): Promise<void> => {
    const text = await props.exportData()
    downloadJson(text, `troubleshoot-datasources-${fileStamp()}.json`)
  }
  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = "" // 允许再次选择同一文件
    if (file === undefined) return
    const text = await file.text()
    props.importData(text)
  }
  const handleTemplate = async (): Promise<void> => {
    const text = await props.fetchTemplate()
    downloadJson(text, "troubleshoot-datasources-template.json")
  }

  return (
    <section style={STYLE.card} aria-label="故障排查助手数据源配置">
      <h3 style={STYLE.title}>故障排查助手 · 数据源配置</h3>
      <p style={STYLE.desc}>
        添加数据源（指标 / 日志 / 调用链 / CMDB / 知识库或自定义类型）：点"添加数据源"展开填写，
        填好点"保存"后即折叠为一行；点行上的"详情"可展开修改配置。Token 支持 env:环境变量名 引用（推荐）；已存值不会回显。
        配置可导出为 JSON 备份、批量导入（迁移/恢复），见下方"备份与迁移"。
      </p>
      {state.failed === true && <div style={STYLE.error}>保存未按预期落库，请重试</div>}
      {state.entries.length === 0 && (
        <div style={{ ...STYLE.fieldHint, marginBottom: 8 }}>尚未配置数据源 —— 点击下方"添加数据源"开始。</div>
      )}
      {state.entries.map((entry) => {
        const typeOptions = ENTRY_FIELD_SPECS.find(spec => spec.key === "type")?.options ?? []
        const presetLabel = typeOptions.find(option => option.value === entry.type)?.label
        const typeLabel = presetLabel ?? (entry.type !== "" ? "自定义:" + entry.type : "自定义")
        const expanded = isExpanded(entry)
        return (
          <details key={entry.id} style={STYLE.group} open={expanded}>
            <summary style={STYLE.summary} onClick={(event) => { event.preventDefault(); toggle(entry) }}>
              <span style={STYLE.chevron}>{expanded ? "▾" : "▸"}</span>
              <span style={STYLE.name}>{entry.name || "未命名数据源"}</span>
              <span style={STYLE.typeBadge}>{typeLabel}</span>
              {entry.url !== "" && <span style={STYLE.rowUrl} title={entry.url}>{entry.url}</span>}
              <span style={entry.enabled === true ? STYLE.statusOn : STYLE.statusOff}>{entry.enabled === true ? "已启用" : "已停用"}</span>
              <span style={STYLE.detailHint}>{expanded ? "收起" : "详情"}</span>
            </summary>
            <EntryForm
              entry={entry}
              disabled={disabled}
              onEditField={props.editField}
              onToggleEnabled={props.toggleEnabled}
              onClearField={props.clearField}
              onRemove={props.removeEntry}
            />
          </details>
        )
      })}
      <div style={{ marginTop: 4 }}>
        <button type="button" style={STYLE.buttonAdd} disabled={disabled} onClick={props.addEntry}>+ 添加数据源</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={STYLE.sectionLabel}>备份与迁移（JSON 文件；导入为整体替换，保存前可放弃）</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={STYLE.button} disabled={disabled} onClick={() => { void handleExport() }}>导出 JSON</button>
          <label style={{ ...STYLE.button, display: "inline-block", cursor: disabled ? "not-allowed" : "pointer" }}>
            导入 JSON
            <input type="file" accept=".json,application/json" style={{ display: "none" }} disabled={disabled} onChange={(event) => { void handleImport(event) }} />
          </label>
          <button type="button" style={STYLE.button} onClick={() => { void handleTemplate() }}>下载模板</button>
        </div>
        {state.importInfo.kind !== "none" && (
          <div style={state.importInfo.kind === "error" ? STYLE.importErr : STYLE.importOk} role="status">
            {state.importInfo.message}
          </div>
        )}
      </div>
      <div style={{ ...STYLE.group, marginTop: 12 }}>
        <div style={STYLE.summary}>全局默认值</div>
        <div style={STYLE.body}>
          <GlobalRow label="默认时间范围（分钟）" value={state.global.defaultTimeRangeMinutes} disabled={disabled} hint="未显式给定时间范围时的默认窗口" onEdit={(text) => { props.editGlobal("defaultTimeRangeMinutes", text) }} />
          <GlobalRow label="默认结果上限" value={state.global.maxResults} disabled={disabled} hint="单次查询默认返回的最大条数" onEdit={(text) => { props.editGlobal("maxResults", text) }} />
        </div>
      </div>
      <div style={STYLE.actions}>
        <button type="button" style={STYLE.button} disabled={disabled || !state.dirty} onClick={props.discard}>放弃</button>
        <button type="button" style={STYLE.buttonPrimary} disabled={disabled || !state.dirty || state.invalid || state.saving} onClick={props.save}>
          {state.saving ? "保存中…" : "保存"}
        </button>
      </div>
    </section>
  )
}
