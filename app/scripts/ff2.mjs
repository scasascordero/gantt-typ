import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-fresco.svg", "utf8");
let x = 0, y = 0;
const pila = [];
const figuras = [];
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
    const num = tag.match(/d="([^"]+)"/)?.[1];
    const fill = tag.match(/fill="([^"]*)"/)?.[1];
    if (num) {
      const ns = (num.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const xs = [], ys = [];
      for (let k = 0; k + 1 < ns.length; k += 2) { xs.push(x + ns[k]); ys.push(y + ns[k + 1]); }
      if (!tag.includes("typst-text")) {
        figuras.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), fill });
      }
    }
    i = fin;
  }
}
const ff = figuras.filter((f) => f.fill === "#f8fafc").sort((a, b) => a.y0 - b.y0);
console.log("f8fafc:", ff.length);
for (const f of ff) console.log(`  x[${f.x0.toFixed(1)}..${f.x1.toFixed(1)}] y[${f.y0.toFixed(2)}..${f.y1.toFixed(2)}]  (w=${(f.x1 - f.x0).toFixed(1)} h=${(f.y1 - f.y0).toFixed(2)})`);