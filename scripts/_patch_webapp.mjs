import fs from "node:fs";
const p = process.argv[2], ip = process.argv[3];
let s = fs.readFileSync(p, "utf8");
const old = "trustedHosts: !!js ctx.webRuntime.trustedHosts";
const neu = 'trustedHosts: ["' + ip + '", ...ctx.webRuntime.trustedHosts]';
if (s.includes(old)) { s = s.replace(old, neu); fs.writeFileSync(p, s); console.log("  web-app patched"); }
else console.log("  line not found, skip");
