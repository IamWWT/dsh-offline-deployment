import fs from "node:fs";
const p = process.argv[2];
let s = fs.readFileSync(p, "utf8");
const pf = '<script>' +
  '  (function () { if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") { try {' +
  '    crypto.randomUUID = function () {' +
  '      var b = new Uint8Array(16); crypto.getRandomValues(b);' +
  '      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;' +
  '      var h = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); });' +
  '      return h[0]+h[1]+h[2]+h[3]+"-"+h[4]+h[5]+"-"+h[6]+h[7]+"-"+h[8]+h[9]+"-"+h[10]+h[11]+h[12]+h[13]+h[14]+h[15];' +
  '    }; console.log("[polyfill] ok");' +
  '  } catch (e) { console.warn(e); } } })();' +
  '</script>' +
  String.fromCharCode(10) + '    ';
const anchor = '<script type="module" crossorigin src="/assets/index-';
if (s.includes(anchor)) { s = s.replace(anchor, pf + anchor); fs.writeFileSync(p, s); console.log("  polyfill injected"); }
else console.log("  anchor not found, skip");
