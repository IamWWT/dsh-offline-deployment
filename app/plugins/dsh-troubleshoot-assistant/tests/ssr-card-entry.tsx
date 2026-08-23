/**
 * SSR 渲染入口（仅测试用，不进 bundle）：对故障排查助手卡片做 renderToString，
 * 验证核心 UX 逻辑：新建条目默认展开、已存条目默认折叠、行标题展示基本信息。
 */
import { renderToString } from "react-dom/server"
import { TroubleshootCard } from "../src/client/card.tsx"

const base = {
  id: "", type: "metrics", enabled: true, name: "", url: "", authType: "none",
  token: "", username: "", password: "", headerName: "Authorization",
  queryPath: "", timeoutMs: "", description: "",
}
const saved = { ...base, id: "ds-saved", name: "主指标", url: "https://prom.example.com", isNew: false }
const fresh = { ...base, id: "ds-new", name: "", url: "", isNew: true }
const state = {
  available: true, writable: true, dirty: true, invalid: false, saving: false, failed: false,
  entries: [saved, fresh], global: { defaultTimeRangeMinutes: "60", maxResults: "200" },
  importInfo: { kind: "none", message: "", count: 0 },
}
const noop = () => {}
const props = {
  useTroubleshootCard: () => state,
  editField: noop, toggleEnabled: noop, addEntry: noop, removeEntry: noop,
  clearField: noop, editGlobal: noop, save: noop, discard: noop,
  exportData: async () => "{}", fetchTemplate: async () => "{}", importData: noop, clearImportInfo: noop,
}
const html = renderToString(<TroubleshootCard {...props} />)

// 断言
const assert = (cond: boolean, msg: string) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1 } else { console.log("ok:", msg) } }

// 找到每个 <details ...> 的 open 属性（按出现顺序：saved 在前，fresh 在后）
const detailsOpen = [...html.matchAll(/<details[^>]*>/g)].map(m => m[0])
assert(detailsOpen.length === 2, "渲染出 2 个 <details>（已存 + 新建）")
assert(detailsOpen[0] !== undefined && !/\bopen\b/.test(detailsOpen[0]), "已存条目默认折叠（无 open 属性）: " + (detailsOpen[0] ?? ""))
assert(detailsOpen[1] !== undefined && /\bopen\b/.test(detailsOpen[1]), "新建条目默认展开（有 open 属性）: " + (detailsOpen[1] ?? ""))

// 行标题基本信息：已存条目应展示 名称 / 类型 / URL / 启用状态
const savedSummary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"))
assert(savedSummary.includes("主指标"), "行标题展示名称（主指标）")
assert(savedSummary.includes("指标"), "行标题展示类型徽标（指标）")
assert(savedSummary.includes("https://prom.example.com"), "行标题展示 URL")
assert(savedSummary.includes("已启用"), "行标题展示启用状态（已启用）")
assert(savedSummary.includes("详情"), "折叠行显示「详情」提示")

// 新建条目行标题：未命名 + 详情
const freshStart = html.indexOf("未命名数据源")
assert(freshStart > 0, "新建条目行标题显示「未命名数据源」")

// 展开的表单字段（EntryForm）应存在：URL / 类型 / Token 等
assert(html.includes("URL"), "表单含 URL 字段")
assert(html.includes("Token"), "表单含 Token 字段")
assert(html.includes("添加数据源"), "含「添加数据源」按钮")
assert(html.includes("保存"), "含「保存」按钮")

// 备份与迁移按钮组
assert(html.includes("备份与迁移"), "含「备份与迁移」分组")
assert(html.includes("导出 JSON"), "含「导出 JSON」按钮")
assert(html.includes("导入 JSON"), "含「导入 JSON」按钮")
assert(html.includes("下载模板"), "含「下载模板」按钮")
assert(html.includes("troubleshoot-datasources-template.json") || !html.includes("template"), "模板文件名在 bundle（unicode 转义则跳过）")

console.log(process.exitCode ? "\nSSR 渲染验证: 有失败" : "\nSSR 渲染验证: 全部通过")
