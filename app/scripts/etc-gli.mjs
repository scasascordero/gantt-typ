import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-actual.svg", "utf8");
let x = 0, y = 0;
const pila = [];
const textos = [];
let i = 0;
let n = 0;
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
    const fill = tag.match(/fill="#([0-9a-f]+)"/)?.[1];
    if (fill && /(?:1e293b|24292f|111827)/.test(fill)) {
      const num = tag.match(/d="([^"]+)"/)?.[1];
      if (num) {
        const ns = (num.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
        const ys = [];
        for (let k = 0; k + 1 < ns.length; k += 2) ys.push(y + ns[k + 1]);
        textos.push({ y: Math.min(...ys), fill: "#" + fill });
      }
    }
    i = fin;
  }
}
const unicos = [...new Set(textos.map((t) => Math.round(t.y * 10) / 10))].sort((a, b) => a - b);
console.log("glifos oscuros:", textos.length);
console.log("alturas agrupadas:", unicos.join(", "));
const resumen = {};
for (const u of unicos) resumen[u] = textos.filter((t) => Math.round(t.y * 10) / 10 === u).length;
console.log(resumen);