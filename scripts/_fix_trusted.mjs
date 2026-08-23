import fs from "node:fs";
const p = process.argv[2], ip = process.argv[3];
let s = fs.readFileSync(p, "utf8");
// 构造新注入块（统一格式）
const block = '<script>' + String.fromCharCode(10)
  + '  // [dsh-offline] 声明可信局域网地址：LAN 访问时 settings/模型配置等管理功能可用' + String.fromCharCode(10)
  + '  window.__DSH_TRUSTED_HOSTS__ = ["' + ip + '"];' + String.fromCharCode(10)
  + '</script>' + String.fromCharCode(10);
// 删除所有已存在的注入块（匹配任意 IP）
s = s.replace(/<script>\n\s*\/\/ \[dsh-offline\] 声明可信局域网地址[\s\S]*?<\/script>\n/g, "");
// 在 polyfill 脚本前插入（polyfill 以 <script> 开头，含 randomUUID 注释）
const anchor = /\n\s*<script>\n\s*\/\/ \[dsh-offline 修复\] crypto\.randomUUID/;
const m = s.match(anchor);
if (m) {
  s = s.replace(anchor, String.fromCharCode(10) + "        " + block.replace(/\n$/, "") + String.fromCharCode(10) + m[0]);
  fs.writeFileSync(p, s);
  console.log("  trusted injected: " + ip);
} else { console.log("  anchor not found, skip"); }
