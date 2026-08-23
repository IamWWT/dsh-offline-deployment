import fs from "node:fs";
const p = process.argv[2], ip = process.argv[3];
let s = fs.readFileSync(p, "utf8");
// 1) 删除已注入行（[IP, ...ctx.webRuntime.trustedHosts] 或 ["IP", ...]）
s = s.replace(/\n?\s*trustedHosts: \[['"][^'"]*['"], \.\.\.ctx\.webRuntime\.trustedHosts\]/g, "");
// 2) 删除原始行（trustedHosts: !!js ctx.webStartup.trustedHosts），避免 YAML 键重复
s = s.replace(/\n?\s*trustedHosts: !!js ctx\.webStartup\.trustedHosts/g, "");
// 3) 在 web-runtime 行的 surfaceContext 之后插入新值
const anchor = "        surfaceContext: true\n";
const inj = "        surfaceContext: true\n" + "        trustedHosts: ['" + ip + "', ...ctx.webRuntime.trustedHosts]\n";
if (s.includes(anchor)) {
  s = s.replace(anchor, inj);
  fs.writeFileSync(p, s);
  console.log("  web-app re-patched: " + ip);
} else { console.log("  anchor not found, skip"); }
