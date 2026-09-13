import { readFileSync } from "node:fs";
const ruta = process.argv[2];
if (!ruta) { console.error("uso: node probe.mjs <archivo.svg> [minW]"); process.exit(1); }
const minW = Number(process.argv[3] ?? 500);
const svg = readFileSync(ruta, "utf8");
const vb = svg.match(/viewBox="[^"]+"/)?.[0] ?? "";
console.log("viewBox:", vb);
let x = 0, y = 0;
const pila = [];
const lineas = [];
let i = 0;
while (i < svg.length) {
  const a = svg.indexOf('<g transform="translate(', i);
  const c = svg.indexOf("</g>", i);
  const p = svg.indexOf("<path ", i);
  const nxt = Math.min(a < 0 ? Infinity : a, c < 0 ? Infinity : c, p < 0 ? Infinity : p);
  if (nxt === Infinity) break;
  if (nxt === a) {
    const f = svg.indexOf(">", a);
    const m = svg.slice(a, f).match(/translate\((-?[\d.]+),(-?[\d.]+)\)/);
    pila.push([x, y]);
    x += Number(m?.[1] ?? 0);
    y += Number(m?.[2] ?? 0);
    i = f + 1;
  } else if (nxt === c) {
    const t = pila.pop();
    if (t) { x = t[0]; y = t[1]; }
    i = c + 4;
  } else {
    const ce = svg.indexOf("/>", p);
    const cp = svg.indexOf("</path>", p);
    const fin = (ce < 0 ? Infinity : ce) < (cp < 0 ? Infinity : cp) ? ce + 2 : cp;
    const tag = svg.slice(p, fin);
    const d = tag.match(/d="([^"]+)"/)?.[1];
    if (!d) { i = fin; continue; }
    const ns = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (ns.length < 4) { i = fin; continue; }
    const pts = [];
    for (let k = 0; k + 1 < ns.length; k += 2) pts.push([x + ns[k], y + ns[k + 1]]);
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const minxi = Math.min(...xs), maxxi = Math.max(...xs);
    const minyi = Math.min(...ys), maxyi = Math.max(...ys);
    const st = tag.match(/stroke="([^"]+)"/)?.[1];
    const sw = tag.match(/stroke-width="([^"]+)"/)?.[1];
    if (maxyi - minyi < 0.01 && maxxi - minxi >= minW) {
      lineas.push({ y: minyi, w: maxxi - minxi, st: st ?? "-", sw });
    }
    i = fin;
  }
}
lineas.sort((a, b) => a.y - b.y);
for (const l of lineas) console.log(`y=${l.y.toFixed(2)} w=${l.w.toFixed(1)} sw=${l.sw} stroke=${l.st}`);
console.log("total:", lineas.length);