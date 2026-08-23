import fs from "node:fs";
const p = process.argv[2], ip = process.argv[3];
let s = fs.readFileSync(p, "utf8");
const inj = '<script>' + String.fromCharCode(10) + '  window.__DSH_TRUSTED_HOSTS__ = ["' + ip + '"];' + String.fromCharCode(10) + '</script>' + String.fromCharCode(10) + '    ';
const anchor = '<script>' + String.fromCharCode(10) + '  (function () { if (typeof crypto !== "undefined"';
if (s.includes(anchor)) { s = s.replace(anchor, inj + anchor); fs.writeFileSync(p, s); console.log("  trusted injected"); }
else console.log("  anchor not found, skip");
