window.__ModuleLoader__.load({
	id: "@dsh-tools/troubleshoot-assistant",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/card.tsx
var import_react = require("react");

// src/client/controller.ts
var import_client = require("@deepseek-ai/dsh-client-runtime/client");
var PRESET_SOURCES = [
  { value: "metrics", label: "\u6307\u6807" },
  { value: "logs", label: "\u65E5\u5FD7" },
  { value: "trace", label: "\u8C03\u7528\u94FE" },
  { value: "cmdb", label: "CMDB \u53D8\u66F4\u5386\u53F2" },
  { value: "knowledge", label: "\u77E5\u8BC6\u5E93" }
];
var AUTH_TYPES = ["none", "bearer", "basic", "header"];
var AUTH_LABELS = {
  none: "\u65E0\u8BA4\u8BC1",
  bearer: "Bearer Token",
  basic: "Basic \u8BA4\u8BC1",
  header: "\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934"
};
var ENTRY_FIELD_SPECS = [
  { key: "type", label: "\u7C7B\u578B", hint: "\u9009\u62E9\u9884\u8BBE\u7C7B\u578B\u6216\u8F93\u5165\u81EA\u5B9A\u4E49\u7C7B\u578B\uFF08\u5982 es / clickhouse\uFF09", options: [...PRESET_SOURCES.map((s) => ({ value: s.value, label: s.label })), { value: "__custom__", label: "\u81EA\u5B9A\u4E49\u2026" }] },
  { key: "name", label: "\u540D\u79F0", hint: "\u5C55\u793A\u540D\u79F0\uFF0C\u4FBF\u4E8E agent \u8BC6\u522B" },
  { key: "enabled", label: "\u542F\u7528", hint: "\u5173\u95ED\u540E agent \u4E0D\u4F1A\u8C03\u7528\u8BE5\u6E90" },
  { key: "url", label: "URL", hint: "\u4EC5 http/https\uFF1B\u8BA4\u8BC1\u4FE1\u606F\u8BF7\u52FF\u5199\u8FDB URL" },
  { key: "authType", label: "\u8BA4\u8BC1\u65B9\u5F0F", options: AUTH_TYPES.map((value) => ({ value, label: AUTH_LABELS[value] })) },
  { key: "token", label: "Token", secret: true, hint: "Bearer Token \u6216\u81EA\u5B9A\u4E49\u5934\u503C\uFF1B\u652F\u6301 env:\u73AF\u5883\u53D8\u91CF\u540D \u5F15\u7528\uFF08\u63A8\u8350\uFF0C\u4E0D\u843D\u76D8\uFF09\uFF1B\u5DF2\u5B58\u503C\u4E0D\u4F1A\u56DE\u663E" },
  { key: "username", label: "\u7528\u6237\u540D\uFF08Basic\uFF09", hint: "\u4EC5 Basic \u8BA4\u8BC1\u4F7F\u7528" },
  { key: "password", label: "\u5BC6\u7801\uFF08Basic\uFF09", secret: true, hint: "\u4EC5 Basic \u8BA4\u8BC1\u4F7F\u7528\uFF1B\u652F\u6301 env:\u73AF\u5883\u53D8\u91CF\u540D \u5F15\u7528" },
  { key: "headerName", label: "Token \u8BF7\u6C42\u5934\u540D", hint: '\u4EC5"\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934"\u8BA4\u8BC1\u4F7F\u7528\uFF0C\u9ED8\u8BA4 Authorization' },
  { key: "queryPath", label: "\u67E5\u8BE2\u8DEF\u5F84", hint: "\u7559\u7A7A\u4F7F\u7528\u7C7B\u578B\u9ED8\u8BA4\uFF08\u81EA\u5B9A\u4E49\u7C7B\u578B\u7559\u7A7A\u5219\u8BF7\u6C42 base URL\uFF09" },
  { key: "timeoutMs", label: "\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09", numeric: true, hint: "\u7559\u7A7A/0 \u7EE7\u627F\u63D2\u4EF6\u9ED8\u8BA4\u8D85\u65F6" },
  { key: "description", label: "\u8BF4\u660E", hint: "\u8BE5\u6E90\u7684\u67E5\u8BE2\u8BED\u6CD5\u8BF4\u660E\uFF0C\u4F1A\u5C55\u793A\u7ED9 agent" }
];
function blankEntry() {
  return {
    id: newClientId(),
    type: "metrics",
    enabled: true,
    name: "",
    url: "",
    authType: "none",
    token: "",
    username: "",
    password: "",
    headerName: "Authorization",
    queryPath: "",
    timeoutMs: "",
    description: "",
    isNew: true
  };
}
function newClientId() {
  return "ds-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function fallbackTemplate() {
  return {
    "_\u8BF4\u660E": "\u6545\u969C\u6392\u67E5\u52A9\u624B\u6570\u636E\u6E90\u5BFC\u5165\u6A21\u677F\uFF08\u672C\u5730\u515C\u5E95\u7248\uFF0C\u5B57\u6BB5\u8BF4\u660E\u4ECE\u7B80\uFF09\u3002dataSources \u4E3A\u6570\u7EC4\uFF0C\u6574\u4F53\u66FF\u6362\u73B0\u6709\u914D\u7F6E\uFF1Btoken/password \u63A8\u8350 env:\u73AF\u5883\u53D8\u91CF\u540D \u5F15\u7528\u3002",
    dataSources: [
      {
        type: "metrics",
        enabled: true,
        name: "\u793A\u4F8B Prometheus",
        url: "https://prometheus.example.com",
        authType: "bearer",
        token: "env:PROM_TOKEN",
        description: "PromQL \u67E5\u8BE2\u63A5\u53E3"
      }
    ],
    defaultTimeRangeMinutes: 60,
    maxResults: 200
  };
}
function formatStored(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
function parseEntryField(key, text) {
  const trimmed = text.trim();
  switch (key) {
    case "enabled":
      return trimmed === "true";
    case "timeoutMs": {
      if (trimmed === "") return 0;
      const value = Number(trimmed);
      return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : void 0;
    }
    case "type":
      return trimmed === "__custom__" ? "" : trimmed;
    default:
      return trimmed;
  }
}
function draftInvalid(key, text) {
  if (key !== "timeoutMs" || text.trim() === "") return false;
  const value = Number(text.trim());
  return !Number.isFinite(value) || value < 0;
}
var TroubleshootCardController = class {
  store;
  stagedEntries = /* @__PURE__ */ new Map();
  stagedGlobal = {};
  removedIds = /* @__PURE__ */ new Set();
  saving = false;
  failed = false;
  importInfo = { kind: "none", message: "", count: 0 };
  scope;
  /** @param scope - "troubleshoot" 命名空间的绑定 scope。 */
  constructor(scope) {
    this.scope = scope;
    this.store = (0, import_client.createSnapshotStore)({
      available: false,
      writable: false,
      dirty: false,
      invalid: false,
      saving: false,
      failed: false,
      entries: [],
      global: { defaultTimeRangeMinutes: "60", maxResults: "200" },
      importInfo: { kind: "none", message: "", count: 0 },
      dirtyIds: [],
      invalidIds: []
    });
    const unsubscribe = scope.subscribe(() => {
      this.reseed();
    });
    this.reseed();
    this.disposeUnsubscribe = unsubscribe;
  }
  disposeUnsubscribe;
  /** 从最新快照重新播种未编辑字段。 */
  reseed() {
    const snapshot = this.scope.getSnapshot();
    const value = snapshot.value ?? {};
    const available = snapshot.status === "ready";
    const rawSources = Array.isArray(value.dataSources) ? value.dataSources : [];
    const entries = rawSources.map((raw) => {
      const record = typeof raw === "object" && raw !== null ? raw : {};
      const id = String(record.id ?? newClientId());
      const staged = this.stagedEntries.get(id);
      const field = (key) => {
        const edit = staged?.[key];
        if (edit?.clear === true) return "";
        if (edit?.text !== void 0) return edit.text;
        return formatStored(record[key]);
      };
      return {
        id,
        type: field("type") || "metrics",
        enabled: field("enabled") === "true",
        name: field("name"),
        url: field("url"),
        authType: field("authType") || "none",
        token: field("token"),
        // secret：回显本次暂存草稿；文档已存值永不回显
        username: field("username"),
        password: field("password"),
        // secret：同上
        headerName: field("headerName") || "Authorization",
        queryPath: field("queryPath"),
        timeoutMs: field("timeoutMs") || "",
        description: field("description"),
        isNew: false
      };
    });
    for (const [id, staged] of this.stagedEntries) {
      if (entries.some((entry) => entry.id === id)) continue;
      const blank = blankEntry();
      entries.push({
        ...blank,
        id,
        type: staged.type?.text ?? blank.type,
        enabled: staged.enabled?.text === "true",
        name: staged.name?.text ?? "",
        url: staged.url?.text ?? "",
        authType: staged.authType?.text ?? "none",
        token: staged.token?.text ?? "",
        username: staged.username?.text ?? "",
        password: staged.password?.text ?? "",
        headerName: "Authorization",
        queryPath: staged.queryPath?.text ?? "",
        timeoutMs: staged.timeoutMs?.text ?? "",
        description: staged.description?.text ?? ""
      });
    }
    const visible = entries.filter((entry) => !this.removedIds.has(entry.id));
    const globalValue = value ?? {};
    const global = {
      defaultTimeRangeMinutes: this.stagedGlobal.defaultTimeRangeMinutes?.text ?? (formatStored(globalValue.defaultTimeRangeMinutes) || "60"),
      maxResults: this.stagedGlobal.maxResults?.text ?? (formatStored(globalValue.maxResults) || "200")
    };
    let invalid = false;
    for (const entry of visible) {
      for (const spec of ENTRY_FIELD_SPECS) {
        if (draftInvalid(spec.key, entry[spec.key])) invalid = true;
      }
    }
    if (this.stagedGlobal.defaultTimeRangeMinutes !== void 0) {
      const v = Number(this.stagedGlobal.defaultTimeRangeMinutes.text.trim());
      if (!Number.isFinite(v) || v < 1) invalid = true;
    }
    if (this.stagedGlobal.maxResults !== void 0) {
      const v = Number(this.stagedGlobal.maxResults.text.trim());
      if (!Number.isFinite(v) || v < 1) invalid = true;
    }
    const dirtyIds = [];
    const invalidIds = [];
    for (const entry of visible) {
      const staged = this.stagedEntries.get(entry.id);
      const hasEdits = staged !== void 0 && Object.keys(staged).length > 0;
      const removed = this.removedIds.has(entry.id);
      if (hasEdits || removed || entry.isNew) dirtyIds.push(entry.id);
      if (invalid && hasEdits) {
        let entryInvalid = false;
        for (const spec of ENTRY_FIELD_SPECS) {
          if (draftInvalid(spec.key, entry[spec.key])) {
            entryInvalid = true;
            break;
          }
        }
        if (entryInvalid) invalidIds.push(entry.id);
      }
    }
    this.store.update((draft) => {
      draft.available = available;
      draft.writable = snapshot.writable;
      draft.entries = visible;
      draft.global = global;
      draft.dirty = this.stagedEntries.size > 0 || Object.keys(this.stagedGlobal).length > 0 || this.removedIds.size > 0;
      draft.invalid = invalid;
      draft.dirtyIds = dirtyIds;
      draft.invalidIds = invalidIds;
      draft.saving = this.saving;
      draft.failed = this.failed;
      draft.importInfo = { ...this.importInfo };
    });
  }
  /** 设置导入状态并刷新快照。 */
  setImportInfo(kind, message, count) {
    this.importInfo = { kind, message, count };
    this.reseed();
  }
  /** 暂存一个条目字段的编辑。 */
  editField(id, key, text) {
    const staged = this.stagedEntries.get(id) ?? {};
    staged[key] = { text, clear: false };
    this.stagedEntries.set(id, staged);
    this.failed = false;
    this.reseed();
  }
  /** 切换条目启用开关。 */
  toggleEnabled(id) {
    const entry = this.store.getSnapshot().entries.find((candidate) => candidate.id === id);
    if (entry === void 0) return;
    this.editField(id, "enabled", entry.enabled ? "false" : "true");
  }
  /** 添加一条新数据源。 */
  addEntry() {
    const blank = blankEntry();
    const staged = {};
    for (const spec of ENTRY_FIELD_SPECS) {
      const value = blank[spec.key];
      staged[spec.key] = { text: typeof value === "string" ? value : String(value), clear: false };
    }
    this.stagedEntries.set(blank.id, staged);
    this.failed = false;
    this.reseed();
  }
  /** 删除一条数据源。 */
  removeEntry(id) {
    this.stagedEntries.delete(id);
    this.removedIds.add(id);
    this.failed = false;
    this.reseed();
  }
  /** 标记清除某条目的 secret 字段（保存时置空）。 */
  clearField(id, key) {
    const staged = this.stagedEntries.get(id) ?? {};
    const existing = staged[key];
    if (existing?.clear === true) delete staged[key];
    else staged[key] = { text: "", clear: true };
    this.stagedEntries.set(id, staged);
    this.reseed();
  }
  /** 暂存一个全局字段的文本。 */
  editGlobal(key, text) {
    this.stagedGlobal[key] = { text, clear: false };
    this.failed = false;
    this.reseed();
  }
  /**
   * 组装写入用的 dataSources 数组。
   * @param onlyIds - 仅重建这些条目（用于单条保存）；缺省重建全部（含移除与新条目）。
   */
  buildNextSources(onlyIds) {
    const snapshot = this.scope.getSnapshot();
    const current = snapshot.value ?? {};
    const rawSources = Array.isArray(current.dataSources) ? current.dataSources : [];
    const next = [];
    for (const raw of rawSources) {
      const id = String(raw.id ?? "");
      if (this.removedIds.has(id)) continue;
      const staged = this.stagedEntries.get(id);
      const merged = { ...raw };
      if (staged !== void 0 && (onlyIds === void 0 || onlyIds.has(id))) {
        for (const spec of ENTRY_FIELD_SPECS) {
          const edit = staged[spec.key];
          if (edit?.clear === true) {
            merged[spec.key] = "";
            continue;
          }
          if (edit?.text === void 0) continue;
          const parsed = parseEntryField(spec.key, edit.text);
          if (parsed === void 0) continue;
          merged[spec.key] = parsed;
        }
      }
      next.push(merged);
    }
    for (const [id, staged] of this.stagedEntries) {
      if (onlyIds !== void 0 && !onlyIds.has(id)) continue;
      if (rawSources.some((raw) => String(raw.id ?? "") === id) || this.removedIds.has(id)) continue;
      const blank = blankEntry();
      const entry = { id };
      for (const spec of ENTRY_FIELD_SPECS) {
        const edit = staged[spec.key];
        if (edit?.clear === true) {
          entry[spec.key] = "";
          continue;
        }
        const text = edit?.text ?? formatStored(blank[spec.key]);
        const parsed = parseEntryField(spec.key, text);
        entry[spec.key] = parsed === void 0 ? "" : parsed;
      }
      next.push(entry);
    }
    return next;
  }
  /** 写入全部暂存编辑；随后按 Host 接受的值重新播种。 */
  save() {
    if (this.saving) return;
    const snapshot = this.scope.getSnapshot();
    if (!snapshot.writable || !this.stagedEntries.size && Object.keys(this.stagedGlobal).length === 0 && this.removedIds.size === 0) return;
    const next = this.buildNextSources();
    const patch = { dataSources: next };
    if (this.stagedGlobal.defaultTimeRangeMinutes !== void 0) {
      const v = Number(this.stagedGlobal.defaultTimeRangeMinutes.text.trim());
      if (Number.isFinite(v) && v >= 1) patch.defaultTimeRangeMinutes = Math.trunc(v);
    }
    if (this.stagedGlobal.maxResults !== void 0) {
      const v = Number(this.stagedGlobal.maxResults.text.trim());
      if (Number.isFinite(v) && v >= 1) patch.maxResults = Math.trunc(v);
    }
    this.saving = true;
    this.failed = false;
    this.reseed();
    void (async () => {
      try {
        await this.scope.set("dataSources", next);
        for (const [key, edit] of Object.entries(this.stagedGlobal)) {
          const k = key;
          if (edit.text.trim() === "") continue;
          const v = Number(edit.text.trim());
          if (Number.isFinite(v) && v >= 1) await this.scope.set(k, Math.trunc(v));
        }
      } catch {
        this.failed = true;
      } finally {
        this.stagedEntries.clear();
        this.stagedGlobal;
        this.removedIds.clear();
        this.saving = false;
        this.importInfo = { kind: "none", message: "", count: 0 };
        this.reseed();
      }
    })();
  }
  /** 仅写入指定条目的暂存编辑（其余条目与全局字段保持不变）。 */
  saveEntry(id) {
    if (this.saving) return;
    const snapshot = this.scope.getSnapshot();
    const staged = this.stagedEntries.get(id);
    if (staged === void 0 || Object.keys(staged).length === 0) return;
    if (!snapshot.writable) return;
    const next = this.buildNextSources(/* @__PURE__ */ new Set([id]));
    this.saving = true;
    this.failed = false;
    this.reseed();
    void (async () => {
      try {
        await this.scope.set("dataSources", next);
      } catch {
        this.failed = true;
      } finally {
        this.stagedEntries.delete(id);
        this.saving = false;
        this.importInfo = { kind: "none", message: "", count: 0 };
        this.reseed();
      }
    })();
  }
  /** 丢弃全部暂存编辑。 */
  discard() {
    this.stagedEntries.clear();
    Object.keys(this.stagedGlobal).forEach((key) => {
      delete this.stagedGlobal[key];
    });
    this.removedIds.clear();
    this.failed = false;
    this.importInfo = { kind: "none", message: "", count: 0 };
    this.reseed();
  }
  /**
   * 导出当前数据源配置为 JSON 文本。
   * 优先请求 Host 导出端点（能保留 env: 引用；字面量 secret 由 Host 掩码）；
   * 端点不可用时用本地快照兜底（secret 全空，note 中说明）。
   */
  async exportData() {
    try {
      const res = await fetch("/api/troubleshoot/export", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      JSON.parse(text);
      return text;
    } catch {
      const snapshot = this.store.getSnapshot();
      const doc = {
        version: 1,
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        note: "\u515C\u5E95\u5BFC\u51FA\uFF08\u9875\u9762\u672C\u5730\u5FEB\u7167\uFF09\uFF1Atoken/password \u9875\u9762\u4E0A\u8BFB\u4E0D\u5230\uFF0C\u5747\u4E3A\u7A7A\uFF1B\u5BFC\u5165\u540E\u8BF7\u91CD\u65B0\u586B\u5199\uFF08\u63A8\u8350 env:\u73AF\u5883\u53D8\u91CF\u540D \u5F15\u7528\uFF09\u3002",
        dataSources: snapshot.entries.map((entry) => ({
          id: entry.id,
          type: entry.type,
          enabled: entry.enabled,
          name: entry.name,
          url: entry.url,
          authType: entry.authType,
          token: "",
          username: entry.username,
          password: "",
          headerName: entry.headerName,
          queryPath: entry.queryPath,
          timeoutMs: entry.timeoutMs === "" ? 0 : Number(entry.timeoutMs),
          description: entry.description
        })),
        defaultTimeRangeMinutes: Number(snapshot.global.defaultTimeRangeMinutes) || 60,
        maxResults: Number(snapshot.global.maxResults) || 200
      };
      return JSON.stringify(doc, null, 2);
    }
  }
  /** 获取导入模板 JSON 文本（优先 Host 模板端点；失败时用本地兜底模板）。 */
  async fetchTemplate() {
    try {
      const res = await fetch("/api/troubleshoot/template", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      JSON.parse(text);
      return text;
    } catch {
      return JSON.stringify(fallbackTemplate(), null, 2);
    }
  }
  /**
   * 导入 JSON 文本：解析校验后按【整体替换】语义暂存——
   * - 文件中 id 与现有条目一致 → 暂存为对该条目的字段编辑（secret 空值 = 保留现有值）；
   * - 文件中 id 不存在 → 暂存为新条目；
   * - 现有条目不在文件中 → 标记删除。
   * 暂存后需点"保存"才落库；点"放弃"取消。任何解析/校验失败只提示、不改暂存。
   */
  importData(jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      this.setImportInfo("error", "\u5BFC\u5165\u5931\u8D25\uFF1A\u6587\u4EF6\u4E0D\u662F\u6709\u6548\u7684 JSON", 0);
      return;
    }
    let rawEntries;
    let rawGlobal;
    if (Array.isArray(parsed)) {
      rawEntries = parsed;
    } else if (typeof parsed === "object" && parsed !== null) {
      const record = parsed;
      rawEntries = record.dataSources;
      rawGlobal = record;
    } else {
      this.setImportInfo("error", "\u5BFC\u5165\u5931\u8D25\uFF1A\u683C\u5F0F\u4E0D\u8BC6\u522B\uFF08\u5E94\u4E3A dataSources \u6570\u7EC4\uFF0C\u6216\u542B dataSources \u6570\u7EC4\u7684\u5BF9\u8C61\uFF09", 0);
      return;
    }
    if (!Array.isArray(rawEntries)) {
      this.setImportInfo("error", "\u5BFC\u5165\u5931\u8D25\uFF1AdataSources \u4E0D\u662F\u6570\u7EC4", 0);
      return;
    }
    const seen = /* @__PURE__ */ new Set();
    const normalized = [];
    for (let i = 0; i < rawEntries.length; i++) {
      const raw = rawEntries[i];
      if (typeof raw !== "object" || raw === null) {
        this.setImportInfo("error", `\u5BFC\u5165\u5931\u8D25\uFF1A\u7B2C ${i + 1} \u6761\u4E0D\u662F\u5BF9\u8C61`, 0);
        return;
      }
      const r = raw;
      const str = (key) => {
        const v = r[key];
        if (v === void 0 || v === null) return "";
        return typeof v === "string" ? v : String(v);
      };
      const type = str("type").trim() || "metrics";
      const url = str("url").trim();
      if (url !== "" && !/^https?:\/\//i.test(url)) {
        this.setImportInfo("error", `\u5BFC\u5165\u5931\u8D25\uFF1A\u7B2C ${i + 1} \u6761\u7684 URL \u987B\u4EE5 http:// \u6216 https:// \u5F00\u5934\uFF08\u5F53\u524D ${url.slice(0, 80)}\uFF09`, 0);
        return;
      }
      const enabled = r.enabled === void 0 ? true : r.enabled === true || r.enabled === "true";
      const authType = AUTH_TYPES.includes(str("authType")) ? str("authType") : "none";
      let timeoutMs = 0;
      if (r.timeoutMs !== void 0 && r.timeoutMs !== null && str("timeoutMs") !== "") {
        const v = Number(r.timeoutMs);
        if (!Number.isFinite(v) || v < 0) {
          this.setImportInfo("error", `\u5BFC\u5165\u5931\u8D25\uFF1A\u7B2C ${i + 1} \u6761\u7684 timeoutMs \u987B\u4E3A\u975E\u8D1F\u6570\u5B57\uFF08\u5F53\u524D ${String(r.timeoutMs)}\uFF09`, 0);
          return;
        }
        timeoutMs = Math.trunc(v);
      }
      let id = str("id").trim();
      if (id === "" || seen.has(id)) id = newClientId();
      seen.add(id);
      normalized.push({
        id,
        type,
        enabled,
        name: str("name").trim(),
        url,
        authType,
        token: str("token"),
        username: str("username"),
        password: str("password"),
        headerName: str("headerName").trim() || "Authorization",
        queryPath: str("queryPath"),
        timeoutMs,
        description: str("description")
      });
    }
    const globalEdits = [];
    if (rawGlobal !== void 0) {
      const limits = [
        { key: "defaultTimeRangeMinutes", lo: 1, hi: 7 * 24 * 60 },
        { key: "maxResults", lo: 1, hi: 5e3 }
      ];
      for (const { key, lo, hi } of limits) {
        const rawValue = rawGlobal[key];
        if (rawValue === void 0 || rawValue === "") continue;
        const v = Number(rawValue);
        if (Number.isFinite(v) && v >= lo && v <= hi) globalEdits.push({ key, value: Math.trunc(v) });
      }
    }
    const snapshot = this.scope.getSnapshot();
    const value = snapshot.value ?? {};
    const rawSources = Array.isArray(value.dataSources) ? value.dataSources : [];
    const docIds = /* @__PURE__ */ new Set();
    for (const raw of rawSources) {
      const record = typeof raw === "object" && raw !== null ? raw : {};
      const id = String(record.id ?? "");
      if (id !== "") docIds.add(id);
    }
    this.stagedEntries.clear();
    Object.keys(this.stagedGlobal).forEach((key) => {
      delete this.stagedGlobal[key];
    });
    this.removedIds.clear();
    const fieldKeys = [
      "type",
      "enabled",
      "name",
      "url",
      "authType",
      "token",
      "username",
      "password",
      "headerName",
      "queryPath",
      "timeoutMs",
      "description"
    ];
    for (const entry of normalized) {
      const staged = {};
      for (const key of fieldKeys) {
        const text = key === "enabled" ? entry.enabled ? "true" : "false" : key === "timeoutMs" ? String(entry.timeoutMs) : String(entry[key]);
        if ((key === "token" || key === "password") && text === "") continue;
        staged[key] = { text, clear: false };
      }
      this.stagedEntries.set(String(entry.id), staged);
    }
    let removedCount = 0;
    for (const id of docIds) {
      if (!seen.has(id)) {
        this.removedIds.add(id);
        removedCount++;
      }
    }
    for (const { key, value: value2 } of globalEdits) {
      this.stagedGlobal[key] = { text: String(value2), clear: false };
    }
    this.failed = false;
    this.reseed();
    const removedNote = removedCount > 0 ? `\uFF08\u5C06\u5220\u9664 ${removedCount} \u6761\u73B0\u6709\u6761\u76EE\uFF09` : "";
    this.setImportInfo("pending", `\u5DF2\u5BFC\u5165 ${normalized.length} \u6761\u6570\u636E\u6E90${removedNote}\u3002\u68C0\u67E5\u65E0\u8BEF\u540E\u70B9\u300C\u4FDD\u5B58\u300D\u751F\u6548\uFF1B\u70B9\u300C\u653E\u5F03\u300D\u53D6\u6D88\u3002`, normalized.length);
  }
  /** 清除导入状态提示。 */
  clearImportInfo() {
    if (this.importInfo.kind === "none") return;
    this.importInfo = { kind: "none", message: "", count: 0 };
    this.reseed();
  }
  /** 构建卡片注入面。 */
  inject() {
    return {
      hooks: { troubleshootCard: this.store },
      editField: (id, key, text) => this.editField(id, key, text),
      toggleEnabled: (id) => this.toggleEnabled(id),
      addEntry: () => this.addEntry(),
      removeEntry: (id) => this.removeEntry(id),
      clearField: (id, key) => this.clearField(id, key),
      editGlobal: (key, text) => this.editGlobal(key, text),
      save: () => this.save(),
      saveEntry: (id) => this.saveEntry(id),
      discard: () => this.discard(),
      exportData: () => this.exportData(),
      fetchTemplate: () => this.fetchTemplate(),
      importData: (jsonText) => this.importData(jsonText),
      clearImportInfo: () => this.clearImportInfo()
    };
  }
  /** 释放订阅（随插件 fiber 卸载调用）。 */
  dispose() {
    this.disposeUnsubscribe();
  }
};

// src/client/card.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var STYLE = {
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
  sectionLabel: { fontSize: 12, color: "#6b7280", marginBottom: 6 }
};
function downloadJson(text, filename) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1e3);
}
function fileStamp() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
function FieldRow(props) {
  const { spec, value, disabled, onEdit, onClear } = props;
  const options = spec.options ?? [];
  const input = options.length > 0 && spec.key !== "type" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { style: STYLE.select, value, disabled, onChange: (event) => {
    onEdit(event.target.value);
  }, children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: option.value, children: option.label }, option.value)) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "input",
    {
      style: STYLE.input,
      type: spec.secret === true ? "password" : "text",
      inputMode: spec.numeric === true ? "numeric" : void 0,
      value,
      disabled,
      placeholder: spec.secret === true ? "\u7559\u7A7A\u4E0D\u4FEE\u6539" : "",
      onChange: (event) => {
        onEdit(event.target.value);
      }
    }
  );
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.fieldRow, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.fieldLabel, children: [
      spec.label,
      spec.secret === true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.secretBadge, children: "\u673A\u5BC6" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1 }, children: [
      input,
      spec.secret === true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: { ...STYLE.button, marginTop: 4 }, disabled, onClick: onClear, children: "\u6E05\u9664\u5DF2\u5B58\u503C" }),
      spec.hint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fieldHint, children: spec.hint })
    ] })
  ] });
}
function GlobalRow(props) {
  const { label, value, disabled, onEdit, hint } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.fieldRow, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fieldLabel, children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: STYLE.input, type: "text", inputMode: "numeric", value, disabled, onChange: (event) => {
        onEdit(event.target.value);
      } }),
      hint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fieldHint, children: hint })
    ] })
  ] });
}
function EntryForm(props) {
  const { entry, disabled, canSave, saving, onEditField, onToggleEnabled, onClearField, onRemove, onSaveEntry } = props;
  const typeOptions = ENTRY_FIELD_SPECS.find((spec) => spec.key === "type")?.options ?? [];
  const isPreset = typeOptions.some((option) => option.value === entry.type);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.body, children: [
    ENTRY_FIELD_SPECS.map((spec) => {
      if (spec.key === "enabled") {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.fieldRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fieldLabel, children: spec.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: entry.enabled === true ? STYLE.switchOn : STYLE.switch, disabled, onClick: () => {
              onToggleEnabled(entry.id);
            }, children: entry.enabled === true ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528" }),
            spec.hint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fieldHint, children: spec.hint })
          ] })
        ] }, spec.key);
      }
      if (spec.key === "type") {
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.fieldRow, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fieldLabel, children: spec.label }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "select",
              {
                style: STYLE.select,
                value: isPreset ? entry.type : "__custom__",
                disabled,
                onChange: (event) => {
                  if (event.target.value === "__custom__") onEditField(entry.id, "type", "");
                  else onEditField(entry.id, "type", event.target.value);
                },
                children: typeOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: option.value, children: option.label }, option.value))
              }
            ),
            !isPreset && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                style: { ...STYLE.input, marginTop: 4 },
                type: "text",
                placeholder: "\u8F93\u5165\u81EA\u5B9A\u4E49\u7C7B\u578B\uFF08\u5982 es / clickhouse / prometheus2\uFF09",
                value: entry.type,
                disabled,
                onChange: (event) => {
                  onEditField(entry.id, "type", event.target.value);
                }
              }
            ),
            spec.hint !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.fieldHint, children: spec.hint })
          ] })
        ] }, spec.key);
      }
      const value = String(entry[spec.key] ?? "");
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FieldRow, { spec, value, disabled, onEdit: (text) => {
        onEditField(entry.id, spec.key, text);
      }, onClear: () => {
        onClearField(entry.id, spec.key);
      } }, spec.key);
    }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, padding: "6px 0" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.buttonPrimary, disabled: disabled || saving || !canSave, onClick: () => {
        onSaveEntry(entry.id);
      }, children: saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u6B64\u6570\u636E\u6E90" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.buttonDanger, disabled: disabled || saving, onClick: () => {
        onRemove(entry.id);
      }, children: "\u5220\u9664\u6B64\u6570\u636E\u6E90" })
    ] })
  ] });
}
function TroubleshootCard(props) {
  const state = props.useTroubleshootCard((snapshot) => snapshot);
  const [userOpen, setUserOpen] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const [userClosed, setUserClosed] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
  const prevDirty = (0, import_react.useRef)(state.dirty);
  (0, import_react.useEffect)(() => {
    if (prevDirty.current && !state.dirty) {
      setUserOpen(/* @__PURE__ */ new Set());
      setUserClosed(/* @__PURE__ */ new Set());
    }
    prevDirty.current = state.dirty;
  }, [state.dirty]);
  if (!state.available) return null;
  const disabled = !state.writable;
  const isExpanded = (entry) => userOpen.has(entry.id) ? true : userClosed.has(entry.id) ? false : entry.isNew;
  const toggle = (entry) => {
    if (isExpanded(entry)) {
      setUserClosed((prev) => new Set(prev).add(entry.id));
      setUserOpen((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    } else {
      setUserOpen((prev) => new Set(prev).add(entry.id));
      setUserClosed((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };
  const handleExport = async () => {
    const text = await props.exportData();
    downloadJson(text, `troubleshoot-datasources-${fileStamp()}.json`);
  };
  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === void 0) return;
    const text = await file.text();
    props.importData(text);
  };
  const handleTemplate = async () => {
    const text = await props.fetchTemplate();
    downloadJson(text, "troubleshoot-datasources-template.json");
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { style: STYLE.card, "aria-label": "\u6545\u969C\u6392\u67E5\u52A9\u624B\u6570\u636E\u6E90\u914D\u7F6E", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { style: STYLE.title, children: "\u6545\u969C\u6392\u67E5\u52A9\u624B \xB7 \u6570\u636E\u6E90\u914D\u7F6E" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: STYLE.desc, children: '\u6DFB\u52A0\u6570\u636E\u6E90\uFF08\u6307\u6807 / \u65E5\u5FD7 / \u8C03\u7528\u94FE / CMDB / \u77E5\u8BC6\u5E93\u6216\u81EA\u5B9A\u4E49\u7C7B\u578B\uFF09\uFF1A\u70B9"\u6DFB\u52A0\u6570\u636E\u6E90"\u5C55\u5F00\u586B\u5199\uFF0C \u586B\u597D\u70B9"\u4FDD\u5B58"\u540E\u5373\u6298\u53E0\u4E3A\u4E00\u884C\uFF1B\u70B9\u884C\u4E0A\u7684"\u8BE6\u60C5"\u53EF\u5C55\u5F00\u4FEE\u6539\u914D\u7F6E\u3002Token \u652F\u6301 env:\u73AF\u5883\u53D8\u91CF\u540D \u5F15\u7528\uFF08\u63A8\u8350\uFF09\uFF1B\u5DF2\u5B58\u503C\u4E0D\u4F1A\u56DE\u663E\u3002 \u914D\u7F6E\u53EF\u5BFC\u51FA\u4E3A JSON \u5907\u4EFD\u3001\u6279\u91CF\u5BFC\u5165\uFF08\u8FC1\u79FB/\u6062\u590D\uFF09\uFF0C\u89C1\u4E0B\u65B9"\u5907\u4EFD\u4E0E\u8FC1\u79FB"\u3002' }),
    state.failed === true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.error, children: "\u4FDD\u5B58\u672A\u6309\u9884\u671F\u843D\u5E93\uFF0C\u8BF7\u91CD\u8BD5" }),
    state.entries.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...STYLE.fieldHint, marginBottom: 8 }, children: '\u5C1A\u672A\u914D\u7F6E\u6570\u636E\u6E90 \u2014\u2014 \u70B9\u51FB\u4E0B\u65B9"\u6DFB\u52A0\u6570\u636E\u6E90"\u5F00\u59CB\u3002' }),
    state.entries.map((entry) => {
      const typeOptions = ENTRY_FIELD_SPECS.find((spec) => spec.key === "type")?.options ?? [];
      const presetLabel = typeOptions.find((option) => option.value === entry.type)?.label;
      const typeLabel = presetLabel ?? (entry.type !== "" ? "\u81EA\u5B9A\u4E49:" + entry.type : "\u81EA\u5B9A\u4E49");
      const expanded = isExpanded(entry);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { style: STYLE.group, open: expanded, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { style: STYLE.summary, onClick: (event) => {
          event.preventDefault();
          toggle(entry);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.chevron, children: expanded ? "\u25BE" : "\u25B8" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.name, children: entry.name || "\u672A\u547D\u540D\u6570\u636E\u6E90" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.typeBadge, children: typeLabel }),
          entry.url !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.rowUrl, title: entry.url, children: entry.url }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: entry.enabled === true ? STYLE.statusOn : STYLE.statusOff, children: entry.enabled === true ? "\u5DF2\u542F\u7528" : "\u5DF2\u505C\u7528" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: STYLE.detailHint, children: expanded ? "\u6536\u8D77" : "\u8BE6\u60C5" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          EntryForm,
          {
            entry,
            disabled,
            canSave: state.dirtyIds.includes(entry.id) && !state.invalidIds.includes(entry.id),
            saving: state.saving,
            onEditField: props.editField,
            onToggleEnabled: props.toggleEnabled,
            onClearField: props.clearField,
            onRemove: props.removeEntry,
            onSaveEntry: props.saveEntry
          }
        )
      ] }, entry.id);
    }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: 4 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.buttonAdd, disabled, onClick: props.addEntry, children: "+ \u6DFB\u52A0\u6570\u636E\u6E90" }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.sectionLabel, children: "\u5907\u4EFD\u4E0E\u8FC1\u79FB\uFF08JSON \u6587\u4EF6\uFF1B\u5BFC\u5165\u4E3A\u6574\u4F53\u66FF\u6362\uFF0C\u4FDD\u5B58\u524D\u53EF\u653E\u5F03\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.button, disabled, onClick: () => {
          void handleExport();
        }, children: "\u5BFC\u51FA JSON" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { ...STYLE.button, display: "inline-block", cursor: disabled ? "not-allowed" : "pointer" }, children: [
          "\u5BFC\u5165 JSON",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "file", accept: ".json,application/json", style: { display: "none" }, disabled, onChange: (event) => {
            void handleImport(event);
          } })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.button, onClick: () => {
          void handleTemplate();
        }, children: "\u4E0B\u8F7D\u6A21\u677F" })
      ] }),
      state.importInfo.kind !== "none" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: state.importInfo.kind === "error" ? STYLE.importErr : STYLE.importOk, role: "status", children: state.importInfo.message })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...STYLE.group, marginTop: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: STYLE.summary, children: "\u5168\u5C40\u9ED8\u8BA4\u503C" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.body, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlobalRow, { label: "\u9ED8\u8BA4\u65F6\u95F4\u8303\u56F4\uFF08\u5206\u949F\uFF09", value: state.global.defaultTimeRangeMinutes, disabled, hint: "\u672A\u663E\u5F0F\u7ED9\u5B9A\u65F6\u95F4\u8303\u56F4\u65F6\u7684\u9ED8\u8BA4\u7A97\u53E3", onEdit: (text) => {
          props.editGlobal("defaultTimeRangeMinutes", text);
        } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlobalRow, { label: "\u9ED8\u8BA4\u7ED3\u679C\u4E0A\u9650", value: state.global.maxResults, disabled, hint: "\u5355\u6B21\u67E5\u8BE2\u9ED8\u8BA4\u8FD4\u56DE\u7684\u6700\u5927\u6761\u6570", onEdit: (text) => {
          props.editGlobal("maxResults", text);
        } })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: STYLE.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.button, disabled: disabled || !state.dirty, onClick: props.discard, children: "\u653E\u5F03" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", style: STYLE.buttonPrimary, disabled: disabled || !state.dirty || state.invalid || state.saving, onClick: props.save, children: state.saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58" })
    ] })
  ] });
}

// src/client/index.ts
var inject = ["slots", "settingsScope"];
function apply(ctx) {
  const controller = new TroubleshootCardController(
    ctx.settingsScope.bind({ namespace: "troubleshoot" })
  );
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: "troubleshoot",
    inject: () => controller.inject()
  }, TroubleshootCard));
}

		return module.exports;
	}
});
