// src/index.ts
import { installSettingsSection } from "@deepseek-ai/dsh-settings";
import z2 from "@deepseek-ai/schemastery";

// src/settings.ts
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";

// src/types.ts
var PRESET_DATA_SOURCE_LABELS = {
  metrics: "\u6307\u6807",
  logs: "\u65E5\u5FD7",
  trace: "\u8C03\u7528\u94FE",
  cmdb: "CMDB \u53D8\u66F4\u5386\u53F2",
  knowledge: "\u77E5\u8BC6\u5E93"
};
var PRESET_DEFAULT_QUERY_PATHS = {
  metrics: "/api/v1/query_range",
  logs: "/search",
  trace: "/api/v1/traces",
  cmdb: "/api/v1/changes",
  knowledge: "/api/v1/search"
};
function dataSourceLabel(type) {
  return PRESET_DATA_SOURCE_LABELS[type] ?? type;
}
function defaultQueryPathFor(type) {
  return PRESET_DEFAULT_QUERY_PATHS[type] ?? "";
}

// src/settings.ts
var NAMESPACE = settingsNamespace("troubleshoot");
var AUTH_TYPES = ["none", "bearer", "basic", "header"];
function dataSourceEntrySchema() {
  return z.object({
    id: z.string().required(),
    type: z.string().required().description("\u6570\u636E\u6E90\u7C7B\u578B\uFF1Ametrics/logs/trace/cmdb/knowledge \u6216\u81EA\u5B9A\u4E49\u7C7B\u578B"),
    enabled: z.boolean().default(false),
    name: z.string().required().description("\u5C55\u793A\u540D\u79F0\uFF0C\u4FBF\u4E8E agent \u8BC6\u522B"),
    url: z.string().required().description("\u57FA\u7840 URL\uFF0C\u4EC5 http/https\uFF1B\u8BA4\u8BC1\u4FE1\u606F\u8BF7\u52FF\u5199\u8FDB URL"),
    authType: z.union(AUTH_TYPES).default("none"),
    token: z.string().role("secret").default(""),
    username: z.string().default(""),
    password: z.string().role("secret").default(""),
    headerName: z.string().default("Authorization"),
    queryPath: z.string().default("").description("\u67E5\u8BE2\u8DEF\u5F84\uFF1B\u7559\u7A7A\u4F7F\u7528\u7C7B\u578B\u9ED8\u8BA4\uFF08\u81EA\u5B9A\u4E49\u7C7B\u578B\u7559\u7A7A\u5219\u8BF7\u6C42 base URL\uFF09"),
    timeoutMs: z.number().min(0).max(12e4).default(0),
    // 0 = 继承插件默认超时
    description: z.string().default("")
  });
}
var TroubleshootSettingsSchema = z.object({
  dataSources: z.array(dataSourceEntrySchema()).default([]),
  defaultTimeRangeMinutes: z.number().min(1).max(7 * 24 * 60).default(60),
  maxResults: z.number().min(1).max(5e3).default(200)
});
function entryToDataSource(entry) {
  const url = entry.url.trim();
  if (url === "") return void 0;
  const auth = {
    type: entry.authType,
    token: entry.token,
    username: entry.username,
    password: entry.password,
    headerName: entry.headerName || "Authorization"
  };
  const configuredTimeout = entry.timeoutMs;
  return {
    id: entry.id,
    type: entry.type,
    enabled: entry.enabled,
    name: entry.name.trim() || dataSourceLabel(entry.type),
    url,
    auth,
    queryPath: entry.queryPath.trim() || defaultQueryPathFor(entry.type),
    ...configuredTimeout > 0 ? { timeoutMs: configuredTimeout } : {},
    description: entry.description
  };
}
function sourcesFromSettings(value) {
  const entries = Array.isArray(value.dataSources) ? value.dataSources : [];
  const all = [];
  const byId = /* @__PURE__ */ new Map();
  const byName = /* @__PURE__ */ new Map();
  const byType = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const config = entryToDataSource(entry);
    if (config === void 0) continue;
    all.push(config);
    byId.set(config.id, config);
    if (config.name !== "") byName.set(config.name, config);
    if (config.enabled) {
      const list = byType.get(config.type) ?? [];
      list.push(config);
      byType.set(config.type, list);
    }
  }
  return { all, byId, byName, byType };
}
function resolveTimeRange(start, end, rangeMinutes, now = Date.now()) {
  const parse = (input) => {
    if (input === void 0) return void 0;
    if (typeof input === "number") {
      if (!Number.isFinite(input) || input <= 0) throw new TypeError(`time value must be a positive finite number, got ${String(input)}`);
      return Math.trunc(input);
    }
    const parsed = Date.parse(input);
    if (Number.isNaN(parsed)) throw new TypeError(`time value must be ISO-8601 or epoch ms, got "${input}"`);
    return parsed;
  };
  const startMs = parse(start);
  const endMs = parse(end);
  const range = (rangeMinutes ?? 60) > 0 ? rangeMinutes ?? 60 : 60;
  const resolvedEnd = endMs ?? now;
  const resolvedStart = startMs ?? resolvedEnd - range * 6e4;
  if (resolvedStart >= resolvedEnd) throw new TypeError("time range start must be before end");
  return { start: resolvedStart, end: resolvedEnd };
}
function toIso(ms) {
  return new Date(ms).toISOString();
}

// src/market.ts
import { readFileSync, statSync } from "node:fs";
function defaultCatalogEntries(profile = "web") {
  return [
    {
      fullName: "@dsh-tools/troubleshoot-assistant",
      name: "Troubleshoot Assistant",
      owner: "dsh-tools",
      repo: "troubleshoot-assistant",
      subpath: null,
      summary: "Troubleshooting assistant: configure metrics/logs/trace/CMDB/knowledge-base data sources in Settings, then let the agent troubleshoot incidents, collect evidence and generate fault reports.",
      summaryZh: "\u6545\u969C\u6392\u67E5\u52A9\u624B\uFF1A\u5728\u8BBE\u7F6E\u9875\u914D\u7F6E\u6307\u6807/\u65E5\u5FD7/\u8C03\u7528\u94FE/CMDB/\u77E5\u8BC6\u5E93\u6570\u636E\u6E90\uFF0Cagent \u5373\u53EF\u57FA\u4E8E\u95EE\u9898\u6392\u67E5\u6545\u969C\u3001\u6309\u9700\u8865\u5145\u8BC1\u636E\u5E76\u751F\u6210\u6545\u969C\u62A5\u544A\uFF08\u968F\u672C\u90E8\u7F72\u9884\u88C5\uFF09\u3002",
      category: "ops",
      install: `dsh plugin --profile ${profile} add @dsh-tools/troubleshoot-assistant`,
      riskFlags: []
    },
    {
      fullName: "omdsh-dev/DSH-better-sidebar",
      name: "DSH-better-sidebar",
      owner: "omdsh-dev",
      repo: "DSH-better-sidebar",
      subpath: null,
      summary: "Full sidebar workbench with file rendering and editing, terminal, Git, and subagents; third-party plugins can register new tabs.",
      summaryZh: "\u4FA7\u8FB9\u680F\u5B8C\u6574\u5DE5\u4F5C\u53F0\uFF1A\u5185\u7F6E\u6587\u4EF6\u6E32\u67D3\u7F16\u8F91\u3001\u7EC8\u7AEF\u3001Git \u4E0E\u5B50\u4EE3\u7406\uFF0C\u652F\u6301\u4E09\u65B9\u63D2\u4EF6\u6CE8\u518C\u65B0 Tab\u3002",
      category: "ui",
      install: `dsh plugin --profile ${profile} add dsh-better-sidebar`,
      riskFlags: ["terminal surface"]
    }
  ];
}
function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(payload);
}
var snapshotCache = /* @__PURE__ */ new Map();
function loadMarketSnapshot(path, maxBytes) {
  if (path === "") return void 0;
  let stat;
  try {
    stat = statSync(path);
  } catch {
    return void 0;
  }
  if (stat.size <= 0 || stat.size > maxBytes) return void 0;
  const hit = snapshotCache.get(path);
  if (hit !== void 0 && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.text;
  try {
    const text = readFileSync(path, "utf8");
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.plugins) || parsed.plugins.length === 0) return void 0;
    snapshotCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text });
    return text;
  } catch {
    snapshotCache.delete(path);
    return void 0;
  }
}
function fallbackMarketCatalog() {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return {
    name: "dsh-offline-market",
    url: "http://127.0.0.1:3080",
    source: "https://github.com/omdsh-dev/DSH-better-sidebar",
    updated: today,
    count: 3,
    categories: {
      ui: { en: "UI Enhancements", zh: "UI \u589E\u5F3A" },
      ops: { en: "Operations / Troubleshooting", zh: "\u8FD0\u7EF4 / \u6545\u969C\u6392\u67E5" },
      learning: { en: "Learning", zh: "\u5B66\u4E60" }
    },
    plugins: [
      {
        name: "Troubleshoot Assistant",
        owner: "dsh-tools",
        url: "http://127.0.0.1:3080",
        page: "http://127.0.0.1:3080/api/dshmarket/plugins.json",
        category: "ops",
        description: {
          en: "Troubleshooting assistant: configure data sources, troubleshoot incidents, collect evidence and generate fault reports. Built-in and protected.",
          zh: "\u6545\u969C\u6392\u67E5\u52A9\u624B\uFF1A\u914D\u7F6E\u6570\u636E\u6E90\u540E\u6392\u969C\u3001\u53D6\u8BC1\u5E76\u751F\u6210\u6545\u969C\u62A5\u544A\u3002\u5185\u7F6E\u5B89\u88C5\u3001\u53D7\u4FDD\u62A4\u4E0D\u53EF\u5378\u8F7D\u3002"
        },
        npm: "@dsh-tools/troubleshoot-assistant",
        stars: 0,
        downloads: 0,
        install: "dsh plugin --profile web add @dsh-tools/troubleshoot-assistant",
        added: today
      },
      {
        name: "DSH-better-sidebar",
        owner: "omdsh-dev",
        url: "https://github.com/omdsh-dev/DSH-better-sidebar",
        page: "http://127.0.0.1:3080/api/dshmarket/plugins.json",
        category: "ui",
        description: {
          en: "Full sidebar workbench with file rendering and editing, terminal, Git, and subagents.",
          zh: "\u4FA7\u8FB9\u680F\u5B8C\u6574\u5DE5\u4F5C\u53F0\uFF1A\u6587\u4EF6\u6E32\u67D3\u7F16\u8F91\u3001\u7EC8\u7AEF\u3001Git \u4E0E\u5B50\u4EE3\u7406\u3002"
        },
        npm: "dsh-better-sidebar",
        stars: 0,
        downloads: 0,
        install: "dsh plugin --profile web add dsh-better-sidebar",
        added: today
      },
      {
        name: "dsh-deeptutor",
        owner: "TecFancy",
        url: "https://github.com/TecFancy/dsh-deeptutor",
        page: "http://127.0.0.1:3080/api/dshmarket/plugins.json",
        category: "learning",
        description: {
          en: "Learning assistant: deep explanations, self-test questions, learning paths, personal KB search, note archiving.",
          zh: "\u5B66\u4E60\u52A9\u624B\uFF1A\u6DF1\u5165\u8BB2\u89E3\u3001\u81EA\u6D4B\u9898\u3001\u5B66\u4E60\u8DEF\u5F84\u3001\u4E2A\u4EBA\u77E5\u8BC6\u5E93\u68C0\u7D22\u4E0E\u7B14\u8BB0\u5F52\u6863\u3002"
        },
        npm: "dsh-deeptutor",
        stars: 0,
        downloads: 0,
        install: "dsh plugin --profile web add dsh-deeptutor",
        added: today
      }
    ]
  };
}
var BUILTIN_MARKET_ENTRIES = {
  "@dsh-tools/troubleshoot-assistant": {
    name: "Troubleshoot Assistant",
    owner: "dsh-tools",
    url: "http://127.0.0.1:3080",
    page: "http://127.0.0.1:3080/api/dshmarket/plugins.json",
    category: "ops",
    description: {
      en: "Troubleshooting assistant: configure data sources, troubleshoot incidents, collect evidence and generate fault reports. Built-in and protected.",
      zh: "\u6545\u969C\u6392\u67E5\u52A9\u624B\uFF1A\u914D\u7F6E\u6570\u636E\u6E90\u540E\u6392\u969C\u3001\u53D6\u8BC1\u5E76\u751F\u6210\u6545\u969C\u62A5\u544A\u3002\u5185\u7F6E\u5B89\u88C5\u3001\u53D7\u4FDD\u62A4\u4E0D\u53EF\u5378\u8F7D\u3002"
    },
    npm: "@dsh-tools/troubleshoot-assistant",
    stars: 0,
    downloads: 0,
    install: "dsh plugin --profile web add @dsh-tools/troubleshoot-assistant",
    added: "2026-08-17"
  },
  "dsh-better-sidebar": {
    name: "DSH-better-sidebar",
    owner: "omdsh-dev",
    url: "https://github.com/omdsh-dev/DSH-better-sidebar",
    page: "http://127.0.0.1:3080/api/dshmarket/plugins.json",
    category: "ui",
    description: {
      en: "Full sidebar workbench with file rendering and editing, terminal, Git, and subagents.",
      zh: "\u4FA7\u8FB9\u680F\u5B8C\u6574\u5DE5\u4F5C\u53F0\uFF1A\u6587\u4EF6\u6E32\u67D3\u7F16\u8F91\u3001\u7EC8\u7AEF\u3001Git \u4E0E\u5B50\u4EE3\u7406\u3002"
    },
    npm: "dsh-better-sidebar",
    stars: 0,
    downloads: 0,
    install: "dsh plugin --profile web add dsh-better-sidebar",
    added: "2026-08-14"
  },
  "dsh-deeptutor": {
    name: "dsh-deeptutor",
    owner: "TecFancy",
    url: "https://github.com/TecFancy/dsh-deeptutor",
    page: "http://127.0.0.1:3080/api/dshmarket/plugins.json",
    category: "learning",
    description: {
      en: "Learning assistant: deep explanations, self-test questions, learning paths, personal KB search, note archiving.",
      zh: "\u5B66\u4E60\u52A9\u624B\uFF1A\u6DF1\u5165\u8BB2\u89E3\u3001\u81EA\u6D4B\u9898\u3001\u5B66\u4E60\u8DEF\u5F84\u3001\u4E2A\u4EBA\u77E5\u8BC6\u5E93\u68C0\u7D22\u4E0E\u7B14\u8BB0\u5F52\u6863\u3002"
    },
    npm: "dsh-deeptutor",
    stars: 0,
    downloads: 0,
    install: "dsh plugin --profile web add dsh-deeptutor",
    added: "2026-08-14"
  }
};
function mergeBuiltinEntries(snapshotText) {
  let catalog;
  try {
    catalog = JSON.parse(snapshotText);
  } catch {
    return fallbackMarketCatalog();
  }
  const plugins = Array.isArray(catalog.plugins) ? catalog.plugins : [];
  const byNpm = /* @__PURE__ */ new Map();
  for (const plugin of plugins) {
    if (typeof plugin === "object" && plugin !== null) {
      const npm = plugin.npm;
      if (typeof npm === "string" && npm !== "") byNpm.set(npm, plugin);
    }
  }
  const mergedPlugins = [...plugins];
  for (const [npm, entry] of Object.entries(BUILTIN_MARKET_ENTRIES)) {
    if (byNpm.has(npm)) continue;
    mergedPlugins.push(entry);
  }
  const count = mergedPlugins.length;
  return { ...catalog, count, plugins: mergedPlugins };
}
function registerMarketCatalog(ctx, entries = defaultCatalogEntries(), snapshotPath = "", maxSnapshotBytes = 8 * 1024 * 1024) {
  ctx.inject(["webServer"], (webCtx) => {
    const webServer = webCtx.webServer;
    webCtx.effect(() => webServer.register({
      kind: "exact",
      path: "/api/dshmarket/plugins.json",
      handler: (req, res) => {
        const snapshot = loadMarketSnapshot(snapshotPath, maxSnapshotBytes);
        if (snapshot === void 0) {
          send(res, 200, fallbackMarketCatalog());
          return;
        }
        const merged = mergeBuiltinEntries(snapshot);
        send(res, 200, merged);
      }
    }), "troubleshoot-assistant: offline market snapshot route");
    webCtx.effect(() => webServer.register({
      kind: "exact",
      path: "/api/v1/plugins",
      handler: (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        const category = (url.searchParams.get("category") ?? "").trim().toLowerCase();
        const rawLimit = Number(url.searchParams.get("limit") ?? 60);
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.trunc(rawLimit), 200) : 60;
        const rawPage = Number(url.searchParams.get("page") ?? 0);
        const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 0;
        let results = entries;
        if (q !== "") {
          results = results.filter(
            (entry) => [entry.name, entry.fullName, entry.summary, entry.summaryZh, entry.category].filter(Boolean).some((field) => String(field).toLowerCase().includes(q))
          );
        }
        if (category !== "") {
          results = results.filter((entry) => entry.category.toLowerCase() === category);
        }
        const total = results.length;
        const sliced = results.slice(page * limit, page * limit + limit);
        send(res, 200, { total, count: sliced.length, results: sliced });
      }
    }), "troubleshoot-assistant: local market catalog route");
  });
}

// src/sop.ts
import { closeSync, openSync, readSync, statSync as statSync2 } from "node:fs";
import { join } from "node:path";
var DEFAULT_SOP = `\u4F60\u662F\u4F01\u4E1A\u8FD0\u7EF4\u56E2\u961F\u7684\u6545\u969C\u6392\u67E5\u52A9\u624B\u3002\u8BF7\u4E25\u683C\u9075\u5FAA\u4EE5\u4E0B\u6807\u51C6\u3001\u7981\u6B62\u4E0E\u539F\u5219\u6267\u884C\u6392\u67E5\uFF0C\u5E76\u5728\u8BC1\u636E\u4E0D\u5145\u5206\u65F6\u4E3B\u52A8\u8865\u5145\u8BC1\u636E\u3002

\u3010\u89D2\u8272\u4E0E\u76EE\u6807\u3011
- \u4F60\u7684\u4EFB\u52A1\uFF1A\u57FA\u4E8E\u53EF\u914D\u7F6E\u7684\u6570\u636E\u6E90\uFF08\u6307\u6807/\u65E5\u5FD7/\u8C03\u7528\u94FE/CMDB \u53D8\u66F4\u5386\u53F2/\u77E5\u8BC6\u5E93\uFF09\uFF0C\u5BF9\u7528\u6237\u62A5\u544A\u7684\u6545\u969C\u505A\u7ED3\u6784\u5316\u6392\u67E5\uFF08RCA\uFF09\uFF0C\u4EA7\u51FA\u53EF\u590D\u67E5\u3001\u53EF\u6267\u884C\u7684\u6545\u969C\u62A5\u544A\u3002
- \u5F00\u5DE5\u524D\u5148\u8C03\u7528 troubleshoot_status \u786E\u8BA4\u54EA\u4E9B\u6570\u636E\u6E90\u53EF\u7528\uFF1B\u6570\u636E\u6E90\u672A\u914D\u7F6E\u65F6\u660E\u786E\u544A\u77E5\u7528\u6237\uFF0C\u800C\u4E0D\u662F\u7A7A\u8C08\u3002

\u3010\u6807\u51C6\uFF08\u5FC5\u987B\u6309\u6B64\u6D41\u7A0B\uFF09\u3011
1. \u6F84\u6E05\u73B0\u8C61\uFF1A\u5411\u7528\u6237\u786E\u8BA4\u6545\u969C\u73B0\u8C61\u3001\u5F71\u54CD\u8303\u56F4\u3001\u53D1\u751F\u65F6\u95F4\uFF08\u5FC5\u8981\u65F6\u8FFD\u95EE\uFF09\uFF0C\u5F97\u5230\u660E\u786E\u7684\u65F6\u95F4\u7A97\u53E3\u3002
2. \u5EFA\u7ACB\u65F6\u95F4\u7EBF\uFF1A\u628A\u5DF2\u77E5\u4E8B\u5B9E\uFF08\u7528\u6237\u63CF\u8FF0\u3001\u544A\u8B66\u3001\u53D8\u66F4\uFF09\u6309\u65F6\u95F4\u6392\u5E8F\uFF0C\u4F5C\u4E3A\u540E\u7EED\u8BC1\u636E\u7684\u951A\u70B9\u3002
3. \u5148\u770B\u53D8\u66F4\uFF1A\u5728\u6545\u969C\u7A97\u53E3\u5185\u4F18\u5148\u67E5\u8BE2 CMDB \u53D8\u66F4\u5386\u53F2\uFF08query_cmdb\uFF09\uFF0C\u53D1\u5E03/\u53D8\u66F4\u662F\u6700\u5E38\u89C1\u6839\u56E0\u3002
4. \u518D\u770B\u6307\u6807\uFF1A\u7528 query_metrics \u68C0\u67E5 CPU/\u5185\u5B58/\u9519\u8BEF\u7387/\u5EF6\u8FDF\u7B49\u5173\u952E\u6307\u6807\uFF0C\u5B9A\u4F4D\u5F02\u5E38\u62D0\u70B9\u4E0E\u65F6\u95F4\u7A97\u53E3\u5BF9\u9F50\u3002
5. \u8FFD\u8E2A\u8C03\u7528\u94FE\uFF1A\u7528 query_trace \u5B9A\u4F4D\u5931\u8D25\u94FE\u8DEF\u7684\u4E0A\u4E0B\u6E38\u3001\u8D85\u65F6\u4E0E\u4F9D\u8D56\u5173\u7CFB\uFF08\u6709 traceId \u5219\u7CBE\u786E\u67E5\uFF09\u3002
6. \u6DF1\u6316\u65E5\u5FD7\uFF1A\u7528 query_logs \u68C0\u7D22\u9519\u8BEF\u65E5\u5FD7\u4E0E\u670D\u52A1\u65E5\u5FD7\uFF0C\u4EA4\u53C9\u9A8C\u8BC1\u6307\u6807\u4E0E\u94FE\u8DEF\u7ED3\u8BBA\u3002
7. \u68C0\u7D22\u77E5\u8BC6\u5E93\uFF1A\u7528 query_knowledge \u67E5\u627E\u540C\u7C7B\u6545\u969C\u7684\u5386\u53F2\u5904\u7F6E\u7ECF\u9A8C\u4E0E\u5DE5\u5355\uFF0C\u4F5C\u4E3A\u53C2\u8003\u3002
8. \u6536\u655B\u6839\u56E0\uFF1A\u7528 5Why/\u5F71\u54CD\u9762\u5206\u6790\u6536\u655B\u5230\u53EF\u9A8C\u8BC1\u7684\u6839\u56E0\uFF1B\u7ED9\u51FA\u9A8C\u8BC1\u65B9\u6CD5\uFF08\u5982\u4F55\u590D\u73B0/\u5982\u4F55\u786E\u8BA4\uFF09\u3002
9. \u8F93\u51FA\u62A5\u544A\uFF1A\u8C03\u7528 generate_fault_report \u751F\u6210\u7ED3\u6784\u5316\u62A5\u544A\uFF08\u73B0\u8C61/\u5F71\u54CD/\u65F6\u95F4\u7EBF/\u8BC1\u636E/\u6839\u56E0/\u5904\u7F6E/\u5EFA\u8BAE\uFF09\uFF0C\u5E76\u6309\u7528\u6237\u8981\u6C42\u843D\u76D8\u3002

\u3010\u7981\u6B62\uFF08\u7EA2\u7EBF\uFF0C\u8FDD\u53CD\u5373\u89C6\u4E3A\u9519\u8BEF\uFF09\u3011
- \u7981\u6B62\u5728\u672A\u67E5\u8BE2\u4EFB\u4F55\u6570\u636E\u6E90\u7684\u60C5\u51B5\u4E0B\u81C6\u6D4B\u6839\u56E0\u6216\u76F4\u63A5\u7ED9\u7ED3\u8BBA\u3002
- \u7981\u6B62\u7F16\u9020\u3001\u63A8\u6D4B\u6216"\u8865\u5145"\u4E0D\u5B58\u5728\u7684\u6307\u6807\u503C\u3001\u65E5\u5FD7\u5185\u5BB9\u3001\u94FE\u8DEF\u6570\u636E\u6216\u53D8\u66F4\u8BB0\u5F55\u3002
- \u7981\u6B62\u628A\u5DE5\u5177\u5931\u8D25\uFF08\u672A\u914D\u7F6E/\u8D85\u65F6/\u62A5\u9519\uFF09\u5F53\u6210"\u65E0\u5F02\u5E38\u6570\u636E"\u6C47\u62A5\u2014\u2014\u5FC5\u987B\u5982\u5B9E\u8BF4\u660E\u67E5\u8BE2\u5931\u8D25\u53CA\u539F\u56E0\u3002
- \u7981\u6B62\u5FFD\u7565\u6545\u969C\u65F6\u95F4\u7A97\u53E3\u5185\u7684 CMDB \u53D8\u66F4\u8BB0\u5F55\u3002
- \u7981\u6B62\u5728\u8BC1\u636E\u4E0D\u8DB3\u65F6\u4E0B\u786E\u5B9A\u6027\u7ED3\u8BBA\uFF1B\u7ED3\u8BBA\u5FC5\u987B\u533A\u5206"\u4E8B\u5B9E/\u63A8\u65AD/\u5EFA\u8BAE"\u3002
- \u7981\u6B62\u6CC4\u9732\u6216\u56DE\u663E\u4EFB\u4F55\u6570\u636E\u6E90\u7684\u51ED\u636E\u3001Token\u3001\u5BC6\u94A5\u3002
- \u7981\u6B62\u8DF3\u8FC7\u8BC1\u636E\u8865\u5145\u6B65\u9AA4\u76F4\u63A5\u751F\u6210\u6700\u7EC8\u62A5\u544A\u3002

\u3010\u539F\u5219\u3011
- \u8BC1\u636E\u4F18\u5148\uFF1A\u6BCF\u4E2A\u7ED3\u8BBA\u81F3\u5C11\u6709\u4E00\u6761\u53EF\u8FFD\u6EAF\u7684\u8BC1\u636E\uFF08\u5DE5\u5177\u540D+\u67E5\u8BE2\u53C2\u6570+\u7ED3\u679C\u6458\u8981\uFF09\u3002
- \u65F6\u95F4\u7A97\u4E00\u81F4\uFF1A\u6240\u6709\u67E5\u8BE2\u4F7F\u7528\u540C\u4E00\u6545\u969C\u65F6\u95F4\u7A97\u53E3\uFF1B\u7A97\u53E3\u53D8\u5316\u65F6\u5FC5\u987B\u8BF4\u660E\u5E76\u91CD\u65B0\u6838\u5BF9\u3002
- \u4ECE\u73B0\u8C61\u5230\u6839\u56E0\uFF1A\u6309"\u73B0\u8C61\u2192\u5F02\u5E38\u62D0\u70B9\u2192\u8C03\u7528\u94FE\u2192\u65E5\u5FD7\u2192\u53D8\u66F4\u2192\u6839\u56E0"\u7684\u56E0\u679C\u94FE\u63A8\u8FDB\uFF0C\u4E0D\u8DF3\u6B65\u3002
- \u900F\u660E\u4E0E\u53EF\u590D\u67E5\uFF1A\u62A5\u544A\u4E2D\u7684\u6BCF\u4E2A\u4E8B\u5B9E\u6807\u6CE8\u6765\u6E90\uFF08\u54EA\u4E2A\u6570\u636E\u6E90\u3001\u4EC0\u4E48\u67E5\u8BE2\uFF09\uFF0C\u533A\u5206\u89C2\u6D4B\u6570\u636E\u4E0E\u4EBA\u5DE5\u5047\u8BBE\u3002
- \u52A1\u5B9E\uFF1A\u5B9A\u4F4D\u5230\u6839\u56E0\u5373\u53EF\uFF0C\u4E0D\u65E0\u9650\u6DF1\u6316\uFF1B\u5904\u7F6E\u5EFA\u8BAE\u7ED9\u51FA\u9A8C\u8BC1\u6B65\u9AA4\u4E0E\u56DE\u6EDA\u9884\u6848\u3002

\u3010\u8BC1\u636E\u8865\u5145\uFF08\u8BC1\u636E\u4E0D\u8DB3\u65F6\u4E3B\u52A8\u6267\u884C\uFF09\u3011
- \u89E6\u53D1\u65F6\u673A\uFF1Aa) \u73B0\u6709\u8BC1\u636E\u65E0\u6CD5\u652F\u6491\u6839\u56E0\u5047\u8BBE\uFF1Bb) \u7528\u6237\u8981\u6C42\u6269\u5927/\u8C03\u6574\u8303\u56F4\uFF1Bc) \u51FA\u73B0\u65B0\u5047\u8BBE\u9700\u4EA4\u53C9\u9A8C\u8BC1\u3002
- \u65B9\u5F0F\uFF1A\u8C03\u7528 troubleshoot_evidence \u5BF9\u591A\u4E2A\u6570\u636E\u6E90\u5E76\u884C\u53D6\u8BC1\uFF1B\u6216\u9488\u5BF9\u5355\u4E00\u6E90\u6269\u5927\u65F6\u95F4\u7A97\u3001\u66F4\u6362\u67E5\u8BE2\u8BCD\u3001
  \u589E\u52A0\u8FC7\u6EE4\u6761\u4EF6\uFF08\u5982\u670D\u52A1\u540D\u3001\u9519\u8BEF\u7EA7\u522B\uFF09\u540E\u91CD\u67E5\u3002
- \u4EA4\u53C9\u9A8C\u8BC1\uFF1A\u6307\u6807\u5F02\u5E38\u5FC5\u987B\u6709\u65E5\u5FD7\u6216\u94FE\u8DEF\u4F50\u8BC1\uFF1B\u53D8\u66F4\u7ED3\u8BBA\u5FC5\u987B\u6709\u5177\u4F53\u7684\u53D8\u66F4\u6761\u76EE\u652F\u6491\u3002
- \u5411\u7528\u6237\u8BF4\u660E\u8865\u5145\u4E86\u4EC0\u4E48\u8BC1\u636E\u3001\u4E3A\u4EC0\u4E48\u8865\u5145\u3002

\u3010\u62A5\u544A\u683C\u5F0F\u8981\u6C42\u3011
- \u7ED3\u6784\uFF1A\u6545\u969C\u6982\u8FF0 \u2192 \u5F71\u54CD\u8303\u56F4 \u2192 \u65F6\u95F4\u7EBF \u2192 \u8BC1\u636E\u6E05\u5355\uFF08\u6309\u6E90\u5206\u7C7B\uFF09\u2192 \u6839\u56E0\u5206\u6790 \u2192 \u5904\u7F6E\u4E0E\u6062\u590D \u2192 \u540E\u7EED\u5EFA\u8BAE\u3002
- \u8BC1\u636E\u6E05\u5355\u4E2D\u6BCF\u6761\u6807\u6CE8\uFF1A\u6765\u6E90\u7C7B\u578B\u3001\u67E5\u8BE2\u6761\u4EF6\u3001\u5173\u952E\u7ED3\u679C\u3002
- \u6839\u56E0\u7ED3\u8BBA\u660E\u786E\u533A\u5206\uFF1A\u5DF2\u8BC1\u5B9E\uFF08\u6709\u8BC1\u636E\u94FE\uFF09/ \u9AD8\u5EA6\u7591\u4F3C\uFF08\u8BC1\u636E\u4E0D\u8DB3\u4F46\u6307\u5411\u660E\u786E\uFF09/ \u5F85\u9A8C\u8BC1\u3002
\u3010\u6280\u672F\u6808\u8BCA\u65AD\u6280\u80FD\u901F\u67E5\uFF08\u53C2\u8003 OmniOps "\u6280\u672F\u6808\u2192\u7EC4\u4EF6\u2192\u8BCA\u65AD\u6280\u80FD"\u4E09\u7EA7\u8BBE\u8BA1\uFF09\u3011
\u6309\u7528\u6237\u62A5\u544A\u7684\u6545\u969C\u6240\u5C5E\u6280\u672F\u6808\uFF0C\u4F18\u5148\u8D70\u5BF9\u5E94\u8BCA\u65AD\u8DEF\u5F84\uFF08\u4E0D\u9650\u5236\u5176\u4ED6\u6E90\u53D6\u8BC1\uFF09\uFF1A

- MySQL/\u6570\u636E\u5E93\uFF1A
  - \u5148\u67E5\u6162\u67E5\u8BE2/\u9519\u8BEF\u65E5\u5FD7\uFF08query_logs\uFF0Cfilter=mysql/slow\uFF09\uFF0C\u518D\u770B\u8FDE\u63A5\u6570\u4E0E\u9501\u7B49\u5F85\u6307\u6807\uFF08query_metrics\uFF09
  - CMDB \u53D8\u66F4\uFF08query_cmdb\uFF0Cresource=\u5E93\u540D/\u5B9E\u4F8B\uFF09\u6392\u67E5 DDL/\u53C2\u6570\u53D8\u66F4
  - \u77E5\u8BC6\u5E93\uFF08query_knowledge\uFF09\u68C0\u7D22\u540C\u7C7B\u6162\u67E5\u8BE2\u5904\u7F6E\u7ECF\u9A8C
- Redis/\u7F13\u5B58\uFF1A
  - \u6307\u6807\u770B\u547D\u4E2D\u7387/\u5185\u5B58\u788E\u7247/\u963B\u585E\uFF08query_metrics\uFF09\uFF0C\u65E5\u5FD7\u770B\u9519\u8BEF\u4E0E\u6162\u547D\u4EE4\uFF08query_logs\uFF09
  - \u53D8\u66F4\u67E5\u914D\u7F6E/\u7248\u672C\u5347\u7EA7\uFF08query_cmdb\uFF09\uFF0C\u94FE\u8DEF\u770B\u7F13\u5B58\u7A7F\u900F\u6765\u6E90\uFF08query_trace\uFF09
- Kubernetes/\u5BB9\u5668\uFF1A
  - \u6307\u6807\u770B Pod CPU/\u5185\u5B58/\u91CD\u542F\u6B21\u6570/Node \u538B\u529B\uFF08query_metrics\uFF09
  - \u65E5\u5FD7\u770B OOMKilled/CrashLoopBackOff/Eviction\uFF08query_logs\uFF09
  - \u53D8\u66F4\u770B Deployment/\u955C\u50CF\u66F4\u65B0/\u914D\u7F6E\u53D8\u66F4\uFF08query_cmdb\uFF09
- \u7F51\u7EDC/\u7F51\u5173\uFF1A
  - \u94FE\u8DEF\uFF08query_trace\uFF09\u5B9A\u4F4D\u8D85\u65F6/\u91CD\u8BD5/\u4E0A\u6E38\u4F9D\u8D56\uFF0C\u6307\u6807\u770B\u9519\u8BEF\u7387/\u5EF6\u8FDF\u5206\u5E03\uFF08query_metrics\uFF09
  - \u65E5\u5FD7\u770B\u8FDE\u63A5\u62D2\u7EDD/DNS \u89E3\u6790\u5931\u8D25/5xx\uFF08query_logs\uFF09

\u539F\u5219\uFF1A\u5148\u786E\u5B9A\u6280\u672F\u6808 \u2192 \u9009\u62E9\u8BE5\u6808\u7684"\u7EC4\u4EF6\u7EA7"\u68C0\u67E5\u9879 \u2192 \u7528\u6570\u636E\u6E90\u9010\u9879\u9A8C\u8BC1 \u2192 \u6536\u655B\u6839\u56E0\u3002
\u6545\u969C\u73B0\u8C61\u8DE8\u6808\u65F6\uFF08\u5982"\u63A5\u53E3\u8D85\u65F6"\uFF09\uFF0C\u6309 \u5E94\u7528\u5C42\u2192\u4F9D\u8D56\u5C42\u2192\u57FA\u7840\u8BBE\u65BD \u9010\u5C42\u6392\u67E5\u3002
`;
var cache = /* @__PURE__ */ new Map();
function readSopFile(path, maxBytes) {
  let stat;
  try {
    stat = statSync2(path);
  } catch {
    return void 0;
  }
  if (stat.size <= 0) return void 0;
  const hit = cache.get(path);
  if (hit !== void 0 && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
    return { text: hit.text, truncated: hit.size > maxBytes };
  }
  try {
    const size = Math.min(stat.size, maxBytes);
    const buf = Buffer.alloc(size);
    const fd = openSync(path, "r");
    try {
      readSync(fd, buf, 0, size, 0);
    } finally {
      closeSync(fd);
    }
    const text = buf.toString("utf8").trim();
    if (text === "") return void 0;
    cache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text });
    return { text, truncated: stat.size > maxBytes };
  } catch {
    cache.delete(path);
    return void 0;
  }
}
function resolveSopForWorkspace(cwd, relativePath, globalPath, maxBytes) {
  if (cwd !== void 0 && cwd !== "" && relativePath !== "") {
    const workspaceFile = readSopFile(join(cwd, relativePath), maxBytes);
    if (workspaceFile !== void 0) {
      return { text: workspaceFile.text, source: "workspace", path: join(cwd, relativePath), ...workspaceFile.truncated ? { truncated: true } : {} };
    }
  }
  if (globalPath !== "") {
    const globalFile = readSopFile(globalPath, maxBytes);
    if (globalFile !== void 0) {
      return { text: globalFile.text, source: "global-file", path: globalPath, ...globalFile.truncated ? { truncated: true } : {} };
    }
  }
  return { text: DEFAULT_SOP, source: "builtin" };
}

// src/tools.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// src/http.ts
var DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
var SourceRequestError = class extends Error {
  /** 稳定机器码。 */
  code;
  /** 状态码（HTTP_ERROR 时）。 */
  status;
  /**
   * @param code - 稳定错误码。
   * @param message - 不含凭据的安全信息。
   * @param status - 可选 HTTP 状态码。
   */
  constructor(code, message, status) {
    super(message);
    this.name = "SourceRequestError";
    this.code = code;
    this.status = status;
  }
};
function resolveSecret(value, label) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const envRef = /^env:(?<name>[A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
  if (envRef?.groups?.name !== void 0) {
    const fromEnv = process.env[envRef.groups.name];
    if (fromEnv === void 0 || fromEnv === "") {
      throw new SourceRequestError("MISSING_CREDENTIAL", `${label} references env:${envRef.groups.name} but it is unset`);
    }
    return fromEnv;
  }
  return trimmed;
}
function buildUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
function appendQueryPath(base, queryPath) {
  const trimmed = queryPath.trim();
  if (trimmed === "") return base;
  let url;
  try {
    url = new URL(base);
  } catch {
    return base;
  }
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${basePath}${path}`;
  return url.toString();
}
function validateSourceUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new SourceRequestError("INVALID_URL", "data source URL is not a valid absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SourceRequestError("INVALID_SCHEME", `data source URL scheme must be http or https, got "${url.protocol}"`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new SourceRequestError("INVALID_URL", "data source URL must not embed credentials; configure auth separately");
  }
  if (url.hash !== "") {
    throw new SourceRequestError("INVALID_URL", "data source URL must not contain a fragment");
  }
  return url.toString().replace(/\/$/, "");
}
function buildAuthHeaders(auth, baseHeaders = {}) {
  const headers = { ...baseHeaders };
  switch (auth.type) {
    case "bearer": {
      const token = resolveSecret(auth.token, "auth token");
      if (token !== "") headers.Authorization = `Bearer ${token}`;
      break;
    }
    case "basic": {
      const username = resolveSecret(auth.username, "auth username");
      const password = resolveSecret(auth.password, "auth password");
      if (username !== "") {
        headers.Authorization = "Basic " + Buffer.from(`${username}:${password}`, "utf8").toString("base64");
      }
      break;
    }
    case "header": {
      const token = resolveSecret(auth.token, "auth token");
      const headerName = auth.headerName.trim() || "Authorization";
      if (token !== "") headers[headerName] = token;
      break;
    }
    case "none":
      break;
  }
  return headers;
}
function collectSecrets(auth) {
  const secrets = [];
  const push = (value) => {
    const trimmed = value.trim();
    if (trimmed !== "" && !trimmed.startsWith("env:")) secrets.push(trimmed);
  };
  push(auth.token);
  push(auth.password);
  return secrets;
}
function redactText(text, secrets) {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 3) out = out.split(secret).join("***");
  }
  return out;
}
async function readBoundedBody(res, maxBytes) {
  if (res.body === null) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === void 0) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        truncated = true;
        const keep = value.byteLength - (total - maxBytes);
        chunks.push(value.subarray(0, keep));
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    void res.body.cancel().catch(() => void 0);
  }
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged), truncated };
}
function sanitizeJson(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    if (!Number.isInteger(value)) return String(value);
    if (!Number.isSafeInteger(value)) return String(value);
    return value;
  }
  if (typeof value === "undefined") return null;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (typeof value === "object" && value !== null) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeJson(v);
    return out;
  }
  return value;
}
function parseBody(text) {
  try {
    return JSON.parse(text, (_key, value) => {
      if (typeof value === "number") {
        if (Number.isInteger(value) && !Number.isSafeInteger(value)) return String(value);
        if (!Number.isInteger(value)) {
          const raw = String(value);
          if (raw === "NaN" || raw === "Infinity" || raw === "-Infinity") return raw;
          const reparsed = Number(raw);
          if (!Number.isNaN(reparsed) && reparsed !== value) return raw;
        }
      }
      return value;
    });
  } catch {
    return text;
  }
}
async function callDataSource(type, options) {
  const secrets = collectSecrets(options.auth);
  const failure = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof SourceRequestError ? error.code : "NETWORK_ERROR";
    return {
      source: type,
      ok: false,
      code,
      error: redactText(message, secrets),
      truncated: false,
      value: null
    };
  };
  let target;
  try {
    target = buildUrl(validateSourceUrl(options.url), options.params);
  } catch (error) {
    return failure(error);
  }
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const combined = AbortSignal.any([options.signal, timeoutSignal]);
  try {
    const headers = buildAuthHeaders(options.auth, options.extraHeaders);
    const res = await fetch(target, { method: "GET", headers, signal: combined });
    const { text, truncated } = await readBoundedBody(res, options.maxResponseBytes);
    if (!res.ok) {
      const snippet = truncated ? text + "\u2026(truncated)" : text;
      throw new SourceRequestError(
        "HTTP_ERROR",
        `${options.label} returned HTTP ${res.status} ${res.statusText}: ${snippet.slice(0, 200)}`,
        res.status
      );
    }
    return { source: type, ok: true, truncated, value: sanitizeJson(parseBody(text)) };
  } catch (error) {
    if (error instanceof SourceRequestError) return failure(error);
    const aborted = options.signal.aborted ? "CANCELLED" : "TIMEOUT";
    if (aborted === "CANCELLED") {
      throw error;
    }
    return failure(new SourceRequestError("TIMEOUT", `${options.label} timed out after ${options.timeoutMs}ms`));
  }
}

// src/tools.ts
function timeRangeParams() {
  return {
    source: { type: "string", description: "\u6570\u636E\u6E90\u540D\u79F0\u6216\u7C7B\u578B\uFF1B\u7F3A\u7701\u6309\u7C7B\u578B\u53D6\u7B2C\u4E00\u4E2A\u542F\u7528\u6E90\u3002\u53EF\u7528 troubleshoot_status \u67E5\u770B\u5DF2\u914D\u7F6E\u6570\u636E\u6E90" },
    start: { type: "string", description: "\u8D77\u59CB\u65F6\u95F4\uFF0CISO-8601 \u6216\u6BEB\u79D2\u65F6\u95F4\u6233\uFF1B\u7F3A\u7701\u53D6 end-rangeMinutes" },
    end: { type: "string", description: "\u7ED3\u675F\u65F6\u95F4\uFF0CISO-8601 \u6216\u6BEB\u79D2\u65F6\u95F4\u6233\uFF1B\u7F3A\u7701\u53D6\u5F53\u524D\u65F6\u95F4" },
    rangeMinutes: { type: "number", description: "\u65F6\u95F4\u8303\u56F4\uFF08\u5206\u949F\uFF09\uFF0C\u4EC5\u5F53\u672A\u7ED9 start/end \u65F6\u751F\u6548\uFF1B\u9ED8\u8BA4\u53D6\u8BBE\u7F6E\u503C" },
    limit: { type: "number", description: "\u8FD4\u56DE\u7ED3\u679C\u6761\u6570\u4E0A\u9650\uFF1B\u9ED8\u8BA4\u53D6\u8BBE\u7F6E\u503C maxResults" },
    extraParams: {
      type: "object",
      additionalProperties: true,
      description: "\u9644\u52A0\u67E5\u8BE2\u53C2\u6570\uFF08\u952E\u503C\u5BF9\uFF0C\u539F\u6837\u8FFD\u52A0\u5230\u8BF7\u6C42\uFF09\uFF0C\u7528\u4E8E\u6570\u636E\u6E90\u7279\u6709\u53C2\u6570"
    }
  };
}
function resolveWindow(args, runtime) {
  const range = resolveTimeRange(args.start, args.end, args.rangeMinutes ?? runtime.defaultTimeRangeMinutes);
  const limit = args.limit ?? runtime.maxResults;
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5e3);
  return { start: range.start, end: range.end, limit: safeLimit, rangeMinutes: args.rangeMinutes ?? runtime.defaultTimeRangeMinutes };
}
function resolveSource(selector, type, runtime) {
  const sources = runtime.sources;
  if (selector !== void 0 && selector !== "") {
    const byName = sources.byName.get(selector);
    if (byName !== void 0 && byName.enabled) return byName;
  }
  const candidates = sources.byType.get(type) ?? [];
  return candidates.find((config) => config.enabled);
}
function requireSource(selector, type, runtime) {
  const config = resolveSource(selector, type, runtime);
  if (config === void 0 || !config.enabled) {
    const label = dataSourceLabel(type);
    const hint = selector !== void 0 && selector !== "" ? `\uFF08\u9009\u62E9\u5668 "${selector}"\uFF09` : "";
    return {
      kind: "missing",
      outcome: {
        source: type,
        ok: false,
        code: "SOURCE_NOT_CONFIGURED",
        error: `${label} \u6570\u636E\u6E90\u672A\u914D\u7F6E\u6216\u672A\u542F\u7528${hint}\uFF1A\u8BF7\u5728 Web \u8BBE\u7F6E\u9875\uFF08troubleshoot \u5361\u7247\uFF09\u6DFB\u52A0\u6570\u636E\u6E90\u5E76\u586B\u5199 URL\u3001\u542F\u7528`,
        truncated: false,
        value: null
      }
    };
  }
  return { kind: "ok", config };
}
function inferCount(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "object" && value !== null) {
    for (const key of ["items", "result", "data", "hits", "changes", "records"]) {
      const candidate = value[key];
      if (Array.isArray(candidate)) return candidate.length;
    }
  }
  return void 0;
}
async function runQuery(type, runtime, window, query, extraParams, signal, selector) {
  const found = requireSource(selector, type, runtime);
  if (found.kind === "missing") return found.outcome;
  const { config } = found;
  const params = {
    ...extraParams ?? {},
    start: toIso(window.start),
    end: toIso(window.end),
    limit: String(window.limit)
  };
  if (type === "metrics" && params.step === void 0) params.step = "60s";
  if (query !== "") params.query = query;
  const options = {
    // 查询路径（按类型默认或用户自定义）拼在 base URL 之后；空串时即 base 本身。
    url: appendQueryPath(config.url, config.queryPath),
    params,
    auth: config.auth,
    timeoutMs: config.timeoutMs ?? runtime.defaultTimeoutMs,
    maxResponseBytes: runtime.maxResponseBytes,
    signal,
    label: `${dataSourceLabel(type)}\u67E5\u8BE2(${config.name})`
  };
  const outcome = await callDataSource(type, options);
  if (!outcome.ok) return outcome;
  try {
    const count = inferCount(outcome.value);
    return count === void 0 ? { ...outcome } : { ...outcome, count };
  } catch (error) {
    return {
      source: type,
      ok: false,
      code: "INVALID_RESPONSE",
      error: `\u6570\u636E\u6E90\u8FD4\u56DE\u65E0\u6CD5\u5E8F\u5217\u5316\u4E3A lossless JSON \u7684\u7ED3\u679C\uFF1A${error instanceof Error ? error.message : String(error)}`,
      truncated: false,
      value: null
    };
  }
}
function buildRuntime(settings, defaults) {
  return {
    sources: sourcesFromSettings(settings),
    defaultTimeRangeMinutes: settings.defaultTimeRangeMinutes,
    maxResults: settings.maxResults,
    ...defaults
  };
}
function registerTools(ctx, getRuntime) {
  ctx.tools.register(defineTool({
    name: "troubleshoot_status",
    description: "\u5217\u51FA\u5DF2\u914D\u7F6E\u7684\u6570\u636E\u6E90\uFF08\u6307\u6807/\u65E5\u5FD7/\u8C03\u7528\u94FE/CMDB\uFF09\u53CA\u5176\u72B6\u6001\uFF0C\u4F9B\u6392\u67E5\u5F00\u59CB\u524D\u4E86\u89E3\u53EF\u7528\u80FD\u529B\u3002\u7EDD\u4E0D\u8FD4\u56DE\u4EFB\u4F55\u51ED\u636E\u3002",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                type: { type: "string" },
                enabled: { type: "boolean" },
                name: { type: "string" },
                url: { type: "string" },
                authType: { type: "string" },
                description: { type: "string" }
              }
            }
          },
          defaultTimeRangeMinutes: { type: "number" },
          maxResults: { type: "number" },
          reportDirEnabled: { type: "boolean" }
        }
      },
      render: (_args, value) => {
        const status = value;
        const lines = status.sources.map((s) => `- ${s.type}: ${s.enabled ? "\u5DF2\u542F\u7528" : "\u672A\u542F\u7528"} ${s.name || ""} (${s.url || "\u672A\u914D\u7F6EURL"}, auth=${s.authType})`);
        return [{ type: "text", text: ["\u5F53\u524D\u6570\u636E\u6E90\u72B6\u6001\uFF1A", ...lines, `\u9ED8\u8BA4\u65F6\u95F4\u8303\u56F4 ${status.defaultTimeRangeMinutes} \u5206\u949F\uFF0C\u9ED8\u8BA4\u7ED3\u679C\u4E0A\u9650 ${status.maxResults}\uFF0C\u62A5\u544A\u843D\u76D8 ${status.reportDirEnabled ? "\u5DF2\u5F00\u542F" : "\u672A\u5F00\u542F"}`].join("\n") }];
      }
    },
    async execute(_args, exec) {
      const runtime = getRuntime();
      const sources = runtime.sources.all.map((config) => ({
        id: config.id,
        type: config.type,
        enabled: config.enabled,
        name: config.name,
        url: config.url,
        authType: config.auth.type,
        description: config.description
      }));
      return {
        sources,
        defaultTimeRangeMinutes: runtime.defaultTimeRangeMinutes,
        maxResults: runtime.maxResults,
        reportDirEnabled: runtime.reportDir !== ""
      };
    }
  }));
  function renderQueryOutcome(outcome) {
    const label = dataSourceLabel(outcome.source);
    if (!outcome.ok) {
      return [{ type: "text", text: `${label}\u67E5\u8BE2\u5931\u8D25 [${outcome.code}]: ${outcome.error}` }];
    }
    const countLine = outcome.count === void 0 ? "" : `\uFF08${outcome.count} \u6761\uFF09`;
    const truncLine = outcome.truncated ? "\uFF1B\u54CD\u5E94\u8D85\u8FC7\u4E0A\u9650\u5DF2\u622A\u65AD" : "";
    const body = typeof outcome.value === "string" ? outcome.value : JSON.stringify(outcome.value, null, 2);
    return [{ type: "text", text: `${label}\u67E5\u8BE2\u7ED3\u679C${countLine}${truncLine}:
${String(body).slice(0, 2e4)}` }];
  }
  function collectExtraParams(args) {
    const extraParams = {};
    for (const [key, value] of Object.entries(args.extraParams ?? {})) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") extraParams[key] = String(value);
    }
    for (const key of ["step", "filter", "traceId", "service", "resource", "region"]) {
      const value = args[key];
      if (typeof value === "string" && value.trim() !== "") {
        const trimmed = value.trim();
        if (key === "step" && !/^\d+(ms|s|m|h|d|w|y)$/.test(trimmed)) continue;
        extraParams[key] = trimmed;
      }
    }
    return extraParams;
  }
  const queryOutputSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      source: { type: "string" },
      ok: { type: "boolean" },
      code: { type: "string" },
      error: { type: "string" },
      truncated: { type: "boolean" },
      count: { type: "number" },
      value: { type: "json" }
    }
  };
  ctx.tools.register(defineTool({
    name: "query_metrics",
    description: "\u67E5\u8BE2\u6307\u6807\u6570\u636E\u6E90\uFF08\u5982 Prometheus / Thanos\uFF09\u3002query \u4E3A\u6307\u6807\u67E5\u8BE2\u8868\u8FBE\u5F0F\uFF08PromQL \u6216\u6570\u636E\u6E90\u539F\u751F\u8BED\u6CD5\uFF09\uFF0C\u652F\u6301\u65F6\u95F4\u8303\u56F4\u4E0E step\u3002",
    parameters: {
      query: { type: "string", required: true, description: "\u6307\u6807\u67E5\u8BE2\u8868\u8FBE\u5F0F\uFF08PromQL \u6216\u6570\u636E\u6E90\u539F\u751F\u8BED\u6CD5\uFF09" },
      ...timeRangeParams(),
      step: { type: "string", description: "\u91C7\u6837\u6B65\u957F\uFF08\u5982 30s / 5m\uFF09\uFF0C\u900F\u4F20\u7ED9\u6570\u636E\u6E90" }
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value) },
    async execute(args, exec) {
      const runtime = getRuntime();
      const window = resolveWindow(args, runtime);
      return runQuery("metrics", runtime, window, (args.query ?? "").trim(), collectExtraParams(args), exec.signal, args.source);
    }
  }));
  ctx.tools.register(defineTool({
    name: "query_logs",
    description: "\u67E5\u8BE2\u65E5\u5FD7\u6570\u636E\u6E90\uFF08\u5982 Loki / Elasticsearch / \u81EA\u7814\u65E5\u5FD7\u5E73\u53F0\uFF09\u3002query \u4E3A\u65E5\u5FD7\u68C0\u7D22\u8868\u8FBE\u5F0F\uFF0C\u652F\u6301\u65F6\u95F4\u8303\u56F4\u4E0E\u8FC7\u6EE4\u3002",
    parameters: {
      query: { type: "string", required: true, description: "\u65E5\u5FD7\u68C0\u7D22\u8868\u8FBE\u5F0F" },
      ...timeRangeParams(),
      filter: { type: "string", description: "\u9644\u52A0\u8FC7\u6EE4\u6761\u4EF6\uFF08\u5982 service=api, level=error\uFF09\uFF0C\u900F\u4F20\u7ED9\u6570\u636E\u6E90" }
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value) },
    async execute(args, exec) {
      const runtime = getRuntime();
      const window = resolveWindow(args, runtime);
      return runQuery("logs", runtime, window, (args.query ?? "").trim(), collectExtraParams(args), exec.signal, args.source);
    }
  }));
  ctx.tools.register(defineTool({
    name: "query_trace",
    description: "\u67E5\u8BE2\u8C03\u7528\u94FE\uFF08trace\uFF09\u6570\u636E\u6E90\uFF08\u5982 Jaeger / Tempo / SkyWalking\uFF09\u3002\u53EF\u6309 traceId \u67E5\u5355\u6761\u94FE\u8DEF\uFF0C\u6216\u6309 service \u67E5\u4E00\u6BB5\u65F6\u95F4\u7684\u94FE\u8DEF\u3002",
    parameters: {
      query: { type: "string", description: "\u67E5\u8BE2\u8868\u8FBE\u5F0F\uFF08\u53EF\u9009\uFF1BtraceId/service \u53EF\u7528\u4F5C\u66F4\u7CBE\u786E\u7684\u68C0\u7D22\u6761\u4EF6\uFF09" },
      ...timeRangeParams(),
      traceId: { type: "string", description: "\u94FE\u8DEF ID\uFF0C\u7CBE\u786E\u67E5\u8BE2\u5355\u6761 trace" },
      service: { type: "string", description: "\u670D\u52A1\u540D\u8FC7\u6EE4" }
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value) },
    async execute(args, exec) {
      const runtime = getRuntime();
      const window = resolveWindow(args, runtime);
      return runQuery("trace", runtime, window, (args.query ?? "").trim(), collectExtraParams(args), exec.signal, args.source);
    }
  }));
  ctx.tools.register(defineTool({
    name: "query_knowledge",
    description: "\u67E5\u8BE2\u77E5\u8BC6\u5E93\uFF08KB\uFF09\u6570\u636E\u6E90\u3002query \u4E3A\u68C0\u7D22\u8868\u8FBE\u5F0F\uFF08\u5173\u952E\u8BCD/\u8BED\u4E49\u68C0\u7D22\uFF09\uFF0C\u652F\u6301\u65F6\u95F4\u8303\u56F4\u8FC7\u6EE4\uFF08\u82E5\u77E5\u8BC6\u5E93\u6309\u65F6\u95F4\u5206\u7247\uFF09\u4E0E\u7ED3\u679C\u6761\u6570\u9650\u5236\u3002\u7528\u4E8E\u6545\u969C\u6392\u67E5\u65F6\u68C0\u7D22\u540C\u7C7B\u6545\u969C\u7684\u5904\u7F6E\u7ECF\u9A8C\u4E0E\u5386\u53F2\u5DE5\u5355\u3002",
    parameters: {
      query: { type: "string", required: true, description: "\u68C0\u7D22\u8868\u8FBE\u5F0F\uFF08\u5173\u952E\u8BCD\u6216\u81EA\u7136\u8BED\u8A00\u67E5\u8BE2\uFF09" },
      ...timeRangeParams(),
      filter: { type: "string", description: "\u9644\u52A0\u8FC7\u6EE4\u6761\u4EF6\uFF08\u5982 category=incident, service=api\uFF09\uFF0C\u900F\u4F20\u7ED9\u6570\u636E\u6E90" }
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value) },
    async execute(args, exec) {
      const runtime = getRuntime();
      const window = resolveWindow(args, runtime);
      return runQuery("knowledge", runtime, window, (args.query ?? "").trim(), collectExtraParams(args), exec.signal, args.source);
    }
  }));
  ctx.tools.register(defineTool({
    name: "query_cmdb",
    description: "\u67E5\u8BE2 CMDB \u53D8\u66F4\u5386\u53F2\u6570\u636E\u6E90\u3002\u7528\u4E8E\u6545\u969C\u65F6\u6BB5\u5185\u8BE5\u8D44\u6E90/\u533A\u57DF\u662F\u5426\u6709\u53D8\u66F4\u53D1\u5E03\u3002resource \u4E3A\u76EE\u6807\u8D44\u6E90\u540D\uFF0Cregion \u4E3A\u533A\u57DF/\u73AF\u5883\u8FC7\u6EE4\u3002",
    parameters: {
      query: { type: "string", description: "\u67E5\u8BE2\u8868\u8FBE\u5F0F\uFF08\u53EF\u9009\uFF09" },
      ...timeRangeParams(),
      resource: { type: "string", description: "\u76EE\u6807\u8D44\u6E90/\u5E94\u7528\u540D" },
      region: { type: "string", description: "\u533A\u57DF\u6216\u73AF\u5883" }
    },
    output: { schema: queryOutputSchema, render: (_args, value) => renderQueryOutcome(value) },
    async execute(args, exec) {
      const runtime = getRuntime();
      const window = resolveWindow(args, runtime);
      return runQuery("cmdb", runtime, window, (args.query ?? "").trim(), collectExtraParams(args), exec.signal, args.source);
    }
  }));
  ctx.tools.register(defineTool({
    name: "troubleshoot_evidence",
    description: "\u6309\u9700\u8865\u5145\u8BC1\u636E\uFF1A\u5BF9\u591A\u4E2A\u5DF2\u914D\u7F6E\u6570\u636E\u6E90\u5E76\u884C\u6267\u884C\u67E5\u8BE2\uFF0C\u6C47\u603B\u4E00\u6B21\u8FD4\u56DE\u3002\u7528\u4E8E\u6392\u67E5\u8FC7\u7A0B\u4E2D\u9700\u8981\u540C\u4E00\u65F6\u95F4\u7A97\u5185\u7684\u6307\u6807+\u65E5\u5FD7+\u8C03\u7528\u94FE+\u53D8\u66F4\u8BC1\u636E\u65F6\u3002",
    parameters: {
      sources: {
        type: "array",
        items: { type: "string" },
        description: "\u8981\u67E5\u8BE2\u7684\u6570\u636E\u6E90\u540D\u79F0\u6216\u7C7B\u578B\u5B50\u96C6\uFF08\u7F3A\u7701 = \u6240\u6709\u5DF2\u542F\u7528\u7684\u6E90\uFF1B\u53EF\u7528 troubleshoot_status \u67E5\u770B\uFF09"
      },
      queries: {
        type: "object",
        additionalProperties: true,
        description: "\u5404\u6E90\u7684\u67E5\u8BE2\u8868\u8FBE\u5F0F\uFF1A{ metrics?: string, logs?: string, trace?: string, cmdb?: string }"
      },
      start: { type: "string", description: "\u8D77\u59CB\u65F6\u95F4\uFF0CISO-8601 \u6216\u6BEB\u79D2\u65F6\u95F4\u6233" },
      end: { type: "string", description: "\u7ED3\u675F\u65F6\u95F4\uFF0CISO-8601 \u6216\u6BEB\u79D2\u65F6\u95F4\u6233" },
      rangeMinutes: { type: "number", description: "\u65F6\u95F4\u8303\u56F4\uFF08\u5206\u949F\uFF09\uFF0C\u672A\u7ED9 start/end \u65F6\u751F\u6548" },
      limitPerSource: { type: "number", description: "\u6BCF\u6E90\u7ED3\u679C\u4E0A\u9650\uFF1B\u9ED8\u8BA4\u53D6\u8BBE\u7F6E\u503C maxResults" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          window: { type: "object", additionalProperties: true },
          collected: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                source: { type: "string" },
                ok: { type: "boolean" },
                code: { type: "string" },
                error: { type: "string" },
                truncated: { type: "boolean" },
                count: { type: "number" },
                value: { type: "json" }
              }
            }
          }
        }
      },
      render: (_args, value) => {
        const data = value;
        const lines = data.collected.map((outcome) => {
          const label = dataSourceLabel(outcome.source);
          if (!outcome.ok) return `- ${label}: \u5931\u8D25 [${outcome.code}] ${outcome.error}`;
          const count = outcome.count === void 0 ? "" : `\uFF0C${outcome.count} \u6761`;
          return `- ${label}: \u6210\u529F${count}${outcome.truncated ? "\uFF08\u622A\u65AD\uFF09" : ""}`;
        });
        return [{ type: "text", text: [`\u53D6\u8BC1\u7A97\u53E3 ${data.window.start} ~ ${data.window.end}\uFF1A`, ...lines].join("\n") }];
      }
    },
    async execute(args, exec) {
      const runtime = getRuntime();
      const window = resolveTimeRange(args.start, args.end, args.rangeMinutes ?? runtime.defaultTimeRangeMinutes);
      const requested = Array.isArray(args.sources) && args.sources.length > 0 ? args.sources.map(String) : runtime.sources.all.filter((config) => config.enabled).map((config) => config.name);
      const queries = args.queries ?? {};
      const limit = Math.min(Math.max(Math.trunc(args.limitPerSource ?? runtime.maxResults), 1), 5e3);
      const qWindow = { start: window.start, end: window.end, limit, rangeMinutes: args.rangeMinutes ?? runtime.defaultTimeRangeMinutes };
      const batches = [];
      for (let i = 0; i < requested.length; i += runtime.maxConcurrency) {
        batches.push(requested.slice(i, i + runtime.maxConcurrency));
      }
      const collected = [];
      for (const batch of batches) {
        const outcomes = await Promise.all(batch.map(async (selector) => {
          const byName = runtime.sources.byName.get(selector);
          const type = byName !== void 0 ? byName.type : selector;
          const query = (queries[selector] ?? queries[type] ?? "").trim();
          return runQuery(type, runtime, qWindow, query, void 0, exec.signal, selector);
        }));
        collected.push(...outcomes);
      }
      return {
        window: { start: toIso(window.start), end: toIso(window.end) },
        collected
      };
    }
  }));
  ctx.tools.register(defineTool({
    name: "generate_fault_report",
    description: "\u57FA\u4E8E\u5DF2\u6536\u96C6\u7684\u8BC1\u636E\u751F\u6210\u7ED3\u6784\u5316\u6545\u969C\u62A5\u544A\uFF08Markdown\uFF09\u3002\u586B\u5199\u73B0\u8C61\u3001\u5F71\u54CD\u3001\u65F6\u95F4\u7EBF\u3001\u5404\u6E90\u8BC1\u636E\u6458\u8981\u3001\u6839\u56E0\u4E0E\u5904\u7F6E\u5EFA\u8BAE\uFF1BwriteFile \u4E3A true \u4E14\u5DF2\u914D\u7F6E reportDir \u65F6\u5199\u5165\u6587\u4EF6\u3002",
    parameters: {
      title: { type: "string", required: true, description: "\u6545\u969C\u6807\u9898" },
      symptoms: { type: "string", required: true, description: "\u6545\u969C\u73B0\u8C61\u63CF\u8FF0" },
      impact: { type: "string", description: "\u5F71\u54CD\u8303\u56F4\u4E0E\u7528\u6237\u5F71\u54CD" },
      start: { type: "string", description: "\u6545\u969C\u8D77\u59CB\u65F6\u95F4" },
      end: { type: "string", description: "\u6545\u969C\u7ED3\u675F/\u89C2\u6D4B\u65F6\u95F4" },
      timeline: { type: "array", items: { type: "string" }, description: "\u5173\u952E\u65F6\u95F4\u7EBF\u6761\u76EE" },
      evidence: { type: "array", items: { type: "string" }, description: "\u8BC1\u636E\u6458\u8981\uFF08\u6307\u6807/\u65E5\u5FD7/\u8C03\u7528\u94FE/\u53D8\u66F4\u7ED3\u8BBA\uFF0C\u6765\u81EA\u5404\u67E5\u8BE2\u5DE5\u5177\u7684\u7ED3\u679C\uFF09" },
      rootCause: { type: "string", description: "\u6839\u56E0\u5206\u6790\u7ED3\u8BBA" },
      resolution: { type: "string", description: "\u5904\u7F6E\u8FC7\u7A0B\u4E0E\u7ED3\u679C" },
      recommendations: { type: "array", items: { type: "string" }, description: "\u540E\u7EED\u5EFA\u8BAE" },
      writeFile: { type: "boolean", description: "\u5199\u5165\u62A5\u544A\u6587\u4EF6\uFF08\u9700\u63D2\u4EF6\u914D\u7F6E reportDir\uFF09" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          report: { type: "string" },
          written: { type: "boolean" },
          path: { type: "string" },
          error: { type: "string" }
        }
      },
      render: (_args, value) => {
        const data = value;
        const lines = [data.report];
        if (data.written) lines.push(`
[\u62A5\u544A\u5DF2\u5199\u5165: ${data.path}]`);
        if (data.error !== void 0) lines.push(`
[\u843D\u76D8\u5931\u8D25: ${data.error}]`);
        return [{ type: "text", text: lines.join("\n") }];
      }
    },
    async execute(args, exec) {
      const runtime = getRuntime();
      const startIso = args.start ?? "";
      const endIso = args.end ?? "";
      const section = (heading, body) => {
        if (body === void 0 || body === "") return "";
        return `## ${heading}

${body}
`;
      };
      const listSection = (heading, items) => {
        if (items === void 0 || items.length === 0) return "";
        return `## ${heading}

${items.map((item) => `- ${item}`).join("\n")}
`;
      };
      const report = [
        "# " + args.title,
        "",
        "> \u672C\u62A5\u544A\u7531\u6545\u969C\u6392\u67E5\u52A9\u624B\u57FA\u4E8E\u6570\u636E\u6E90\u8BC1\u636E\u81EA\u52A8\u751F\u6210\uFF08\u65F6\u95F4\u7A97\u53E3\uFF1A" + (startIso || "\u672A\u77E5") + " ~ " + (endIso || "\u672A\u77E5") + "\uFF09",
        "",
        section("\u6545\u969C\u73B0\u8C61", args.symptoms),
        section("\u5F71\u54CD\u8303\u56F4", args.impact),
        listSection("\u65F6\u95F4\u7EBF", args.timeline),
        listSection("\u8BC1\u636E", args.evidence),
        section("\u6839\u56E0\u5206\u6790", args.rootCause),
        section("\u5904\u7F6E\u4E0E\u6062\u590D", args.resolution),
        listSection("\u540E\u7EED\u5EFA\u8BAE", args.recommendations)
      ].join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
      if (args.writeFile !== true || runtime.reportDir === "") {
        return { report, written: false };
      }
      try {
        const root = resolve(runtime.reportDir);
        const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filename = `fault-report-${stamp}.md`;
        const target = resolve(root, filename);
        if (!target.startsWith(root + "/") && target !== root) {
          throw new Error("resolved report path escapes reportDir");
        }
        await mkdir(root, { recursive: true });
        await writeFile(target, report, { encoding: "utf8", mode: 384 });
        return { report, written: true, path: target };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { report, written: false, error: `REPORT_WRITE_FAILED: ${message}` };
      }
    }
  }));
}

// src/export.ts
var ENV_REF = /^env:[A-Za-z_][A-Za-z0-9_]*$/;
function maskSecret(value) {
  return ENV_REF.test(value) ? value : "";
}
function buildExportDocument(settings, now = Date.now()) {
  const entries = Array.isArray(settings.dataSources) ? settings.dataSources : [];
  return {
    version: 1,
    exportedAt: new Date(now).toISOString(),
    note: "\u6545\u969C\u6392\u67E5\u52A9\u624B\u6570\u636E\u6E90\u5BFC\u51FA\u3002token/password \u4EC5\u4FDD\u7559 env:\u73AF\u5883\u53D8\u91CF\u540D \u5F15\u7528\uFF0C\u5B57\u9762\u91CF\u5DF2\u63A9\u7801\u4E3A\u7A7A\uFF1B\u5BFC\u5165\u65F6\u7A7A secret \u8868\u793A\u4FDD\u7559\u73B0\u6709\u503C\u3002\u4EE5 _ \u5F00\u5934\u7684\u952E\u4E3A\u8BF4\u660E\uFF0C\u53EF\u5FFD\u7565\u3002",
    dataSources: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      enabled: entry.enabled,
      name: entry.name,
      url: entry.url,
      authType: entry.authType,
      token: maskSecret(entry.token),
      username: entry.username,
      password: maskSecret(entry.password),
      headerName: entry.headerName,
      queryPath: entry.queryPath,
      timeoutMs: entry.timeoutMs,
      description: entry.description
    })),
    defaultTimeRangeMinutes: settings.defaultTimeRangeMinutes,
    maxResults: settings.maxResults
  };
}
function buildTemplate() {
  return {
    "_\u8BF4\u660E": {
      \u7528\u9014: "\u6545\u969C\u6392\u67E5\u52A9\u624B\u6570\u636E\u6E90\u5BFC\u5165\u6A21\u677F\u3002\u6309\u793A\u4F8B\u6539\u6210\u4F60\u81EA\u5DF1\u7684\u6570\u636E\u6E90\uFF0C\u4FDD\u5B58\u4E3A .json \u540E\u5728\u8BBE\u7F6E\u9875\u70B9\u300C\u5BFC\u5165 JSON\u300D\uFF0C\u68C0\u67E5\u65E0\u8BEF\u518D\u70B9\u300C\u4FDD\u5B58\u300D\u751F\u6548\u3002",
      \u5BFC\u5165\u89C4\u5219: [
        "dataSources \u6570\u7EC4\u91CC\u7684\u6BCF\u4E2A\u5BF9\u8C61\u662F\u4E00\u4E2A\u6570\u636E\u6E90\uFF1B\u6574\u4E2A\u6570\u7EC4\u4F1A\u88AB\u6574\u4F53\u66FF\u6362\uFF08\u6587\u4EF6\u91CC\u6CA1\u6709\u7684\u73B0\u6709\u6761\u76EE\u5C06\u88AB\u5220\u9664\uFF0C\u4FDD\u5B58\u524D\u53EF\u70B9\u300C\u653E\u5F03\u300D\u53D6\u6D88\uFF09\u3002",
        "id \u53EF\u7701\u7565\uFF08\u5BFC\u5165\u65F6\u81EA\u52A8\u751F\u6210\uFF09\uFF0C\u4F46\u540C\u4E00\u6587\u4EF6\u5185\u4E0D\u8981\u5199\u91CD\u590D\u7684 id\u3002",
        "token/password \u652F\u6301\u4E24\u79CD\u5199\u6CD5\uFF1Aenv:\u73AF\u5883\u53D8\u91CF\u540D\uFF08\u63A8\u8350\uFF0C\u673A\u5BC6\u4E0D\u843D\u76D8\uFF0C\u5BFC\u51FA/\u5BFC\u5165\u90FD\u4F1A\u4FDD\u7559\uFF09\uFF1B\u76F4\u63A5\u5199\u660E\u6587\uFF08\u4F1A\u5199\u8FDB\u914D\u7F6E\u6587\u4EF6\uFF0C\u8BF7\u59A5\u5584\u4FDD\u7BA1\u6587\u4EF6\uFF09\u3002",
        '\u5BFC\u5165\u6587\u4EF6\u4E2D secret \u7559\u7A7A = \u4FDD\u7559\u8BE5\u6570\u636E\u6E90\u5DF2\u5B58\u7684 secret\uFF08\u4E0E\u9875\u9762\u4E0A"\u7559\u7A7A\u4E0D\u4FEE\u6539"\u4E00\u81F4\uFF09\u3002',
        "\u4EE5 _ \u5F00\u5934\u7684\u952E\uFF08\u5982\u672C\u8BF4\u660E\uFF09\u5BFC\u5165\u65F6\u81EA\u52A8\u5FFD\u7565\u3002"
      ],
      \u5B57\u6BB5\u8BF4\u660E: {
        type: "\u7C7B\u578B\uFF1Ametrics(\u6307\u6807) / logs(\u65E5\u5FD7) / trace(\u8C03\u7528\u94FE) / cmdb(CMDB\u53D8\u66F4\u5386\u53F2) / knowledge(\u77E5\u8BC6\u5E93)\uFF0C\u6216\u4EFB\u610F\u81EA\u5B9A\u4E49\u5B57\u7B26\u4E32\uFF08\u5982 es\u3001clickhouse\u3001grafana\uFF09\u3002",
        enabled: "\u662F\u5426\u542F\u7528\uFF1Atrue/false\u3002\u505C\u7528\u540E agent \u4E0D\u4F1A\u8C03\u7528\u8BE5\u6E90\uFF08\u914D\u7F6E\u4ECD\u4FDD\u7559\uFF09\u3002",
        name: '\u5C55\u793A\u540D\u79F0\uFF0C\u4FBF\u4E8E agent \u4E0E\u4F60\u8BC6\u522B\uFF0C\u5EFA\u8BAE\u586B\u5199\uFF08\u5982"\u751F\u4EA7 Prometheus"\uFF09\u3002',
        url: "\u6570\u636E\u6E90\u5730\u5740\uFF0C\u4EC5\u652F\u6301 http:// \u6216 https://\u3002\u8BA4\u8BC1\u4FE1\u606F\u4E0D\u8981\u5199\u8FDB URL\u3002",
        authType: "\u8BA4\u8BC1\u65B9\u5F0F\uFF1Anone(\u65E0) / bearer(Bearer Token) / basic(\u7528\u6237\u540D\u5BC6\u7801) / header(\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934)\u3002",
        token: "bearer \u7684 Token \u6216 header \u7684\u8BF7\u6C42\u5934\u503C\u3002\u63A8\u8350 env:\u73AF\u5883\u53D8\u91CF\u540D\uFF08\u5982 env:PROM_TOKEN\uFF09\uFF0C\u5BB9\u5668\u73AF\u5883\u91CC\u914D\u7F6E\u8BE5\u53D8\u91CF\u5373\u53EF\u3002",
        username: "basic \u8BA4\u8BC1\u7684\u7528\u6237\u540D\uFF08\u4EC5 authType=basic \u65F6\u4F7F\u7528\uFF09\u3002",
        password: "basic \u8BA4\u8BC1\u7684\u5BC6\u7801\uFF0C\u652F\u6301 env: \u73AF\u5883\u53D8\u91CF\u5F15\u7528\uFF08\u4EC5 authType=basic \u65F6\u4F7F\u7528\uFF09\u3002",
        headerName: "\u81EA\u5B9A\u4E49\u8BF7\u6C42\u5934\u7684\u5934\u540D\uFF08\u4EC5 authType=header \u65F6\u4F7F\u7528\uFF0C\u9ED8\u8BA4 Authorization\uFF09\u3002",
        queryPath: "\u67E5\u8BE2\u8DEF\u5F84\uFF0C\u62FC\u5728 url \u4E4B\u540E\u3002\u7559\u7A7A\u4F7F\u7528\u7C7B\u578B\u9ED8\u8BA4\u8DEF\u5F84\uFF08\u81EA\u5B9A\u4E49\u7C7B\u578B\u7559\u7A7A\u5219\u76F4\u63A5\u8BF7\u6C42 base URL\uFF09\u3002",
        timeoutMs: "\u5355\u8BF7\u6C42\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09\uFF0C0 \u6216\u7701\u7565 = \u7EE7\u627F\u63D2\u4EF6\u9ED8\u8BA4\uFF0815000\uFF09\u3002",
        description: '\u8BE5\u6E90\u7684\u67E5\u8BE2\u8BED\u6CD5/\u7528\u9014\u8BF4\u660E\uFF0C\u4F1A\u5C55\u793A\u7ED9 agent\uFF0C\u5EFA\u8BAE\u586B\u5199\uFF08\u5982"PromQL \u67E5\u8BE2\uFF0C\u5E38\u7528\u6307\u6807 http_requests_total"\uFF09\u3002'
      },
      \u5168\u5C40\u9ED8\u8BA4: {
        defaultTimeRangeMinutes: "\u672A\u6307\u5B9A\u65F6\u95F4\u8303\u56F4\u65F6\u7684\u67E5\u8BE2\u7A97\u53E3\uFF08\u5206\u949F\uFF09\uFF0C\u9ED8\u8BA4 60\u3002",
        maxResults: "\u5355\u6B21\u67E5\u8BE2\u8FD4\u56DE\u7684\u6700\u5927\u6761\u6570\uFF081-5000\uFF09\uFF0C\u9ED8\u8BA4 200\u3002"
      }
    },
    dataSources: [
      {
        type: "metrics",
        enabled: true,
        name: "\u751F\u4EA7 Prometheus",
        url: "https://prometheus.example.com",
        authType: "bearer",
        token: "env:PROM_TOKEN",
        description: "Prometheus \u67E5\u8BE2\u63A5\u53E3\uFF0C\u652F\u6301 PromQL\u3002\u793A\u4F8B\uFF1Arate(http_requests_total[5m]) by (service)"
      },
      {
        type: "logs",
        enabled: true,
        name: "ES \u5E94\u7528\u65E5\u5FD7",
        url: "https://es.example.com:9200",
        authType: "basic",
        username: "elastic",
        password: "env:ES_PASSWORD",
        queryPath: "/logs-*/_search",
        description: "Elasticsearch \u65E5\u5FD7\uFF0CES query_string \u8BED\u6CD5\uFF1B\u7D22\u5F15\u524D\u7F00 logs-\uFF0C\u65F6\u95F4\u5B57\u6BB5 @timestamp"
      },
      {
        type: "clickhouse",
        enabled: false,
        name: "ClickHouse \u4E8B\u4EF6\u6D41\uFF08\u81EA\u5B9A\u4E49\u7C7B\u578B\u793A\u4F8B\uFF09",
        url: "http://ch.example.com:8123",
        authType: "header",
        token: "env:CH_TOKEN",
        headerName: "X-CH-Token",
        timeoutMs: 15e3,
        description: "\u81EA\u5B9A\u4E49\u7C7B\u578B\u793A\u4F8B\uFF1ASQL \u67E5\u8BE2\uFF0C\u8868 events\uFF0C\u65F6\u95F4\u5217 ts\uFF08Unix \u79D2\uFF09"
      }
    ],
    defaultTimeRangeMinutes: 60,
    maxResults: 200
  };
}
function sendJson(res, status, body, filename) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
    ...filename !== void 0 ? { "content-disposition": `attachment; filename="${filename}"` } : {}
  });
  res.end(payload);
}
function registerExportRoute(ctx, getSource) {
  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/api/troubleshoot/export",
      handler: (_req, res) => {
        const doc = buildExportDocument(getSource());
        const stamp = doc.exportedAt.replace(/[:T]/g, "-").slice(0, 16);
        sendJson(res, 200, doc, `troubleshoot-datasources-${stamp}.json`);
      }
    }), "troubleshoot-assistant: data source export route");
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: "/api/troubleshoot/template",
      handler: (_req, res) => {
        sendJson(res, 200, buildTemplate(), "troubleshoot-datasources-template.json");
      }
    }), "troubleshoot-assistant: import template route");
  });
}

// src/index.ts
var name = "troubleshoot-assistant";
var inject = ["tools"];
var marketEntrySchema = z2.object({
  fullName: z2.string(),
  name: z2.string(),
  owner: z2.string().default(""),
  repo: z2.string().default(""),
  subpath: z2.string().default(""),
  summary: z2.string().default(""),
  summaryZh: z2.string().default(""),
  category: z2.string().default("ops"),
  install: z2.string(),
  riskFlags: z2.array(z2.string()).default([])
});
var Config = z2.object({
  defaultTimeoutMs: z2.number().min(1e3).max(12e4).default(15e3),
  maxResponseBytes: z2.number().min(4096).max(50 * 1024 * 1024).default(2 * 1024 * 1024),
  maxConcurrency: z2.number().min(1).max(16).default(4),
  reportDir: z2.string().default(""),
  catalogExtra: z2.array(marketEntrySchema).default([]),
  marketSnapshotPath: z2.string().default(""),
  maxSnapshotBytes: z2.number().min(65536).max(64 * 1024 * 1024).default(8 * 1024 * 1024),
  sopPath: z2.string().default(""),
  sopRelativePath: z2.string().default("\u6545\u969C\u6392\u67E5SOP.md"),
  maxSopBytes: z2.number().min(1024).max(1024 * 1024).default(64 * 1024)
});
function emptySettings() {
  return TroubleshootSettingsSchema({});
}
function apply(ctx, config) {
  let source = () => emptySettings();
  const getRuntime = () => buildRuntime(source(), config);
  installSettingsSection(ctx, NAMESPACE, TroubleshootSettingsSchema, emptySettings(), {
    setSource: (current) => {
      source = current;
    },
    onChange: () => {
    }
  });
  registerTools(ctx, getRuntime);
  registerExportRoute(ctx, () => source());
  registerMarketCatalog(ctx, [...defaultCatalogEntries(), ...config.catalogExtra], config.marketSnapshotPath, config.maxSnapshotBytes);
  ctx.inject(["systemPrompt"], (promptCtx) => {
    promptCtx.systemPrompt.section({
      name: "troubleshoot:sop",
      order: 50,
      // persona(0) 之后、工具指引(100-199) 之前
      text: (context) => {
        const agent = context.agent;
        const cwd = agent?.session?.header?.cwd;
        return resolveSopForWorkspace(cwd, config.sopRelativePath, config.sopPath, config.maxSopBytes).text;
      }
    });
  });
}
export {
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
