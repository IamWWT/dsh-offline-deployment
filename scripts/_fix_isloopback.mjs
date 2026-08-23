import fs from "node:fs";
const p = process.argv[2];
let s = fs.readFileSync(p, "utf8");
const old = "isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname),";
const neu = "isLoopback: pageLocation === void 0 || isLoopbackHostname(pageLocation.hostname) || (typeof globalThis.__DSH_TRUSTED_HOSTS__ !== \"undefined\" && globalThis.__DSH_TRUSTED_HOSTS__.includes(pageLocation.hostname)),";
if (s.includes(old)) { s = s.replace(old, neu); fs.writeFileSync(p, s); console.log("  isLoopback patched"); }
else console.log("  line not found, skip");
