import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-actual.svg", "utf8");
let x = 0;
let y = 0;
const pila = [];
const ys = [];
let i = 0;
while (i < svg.length) {
  const a = svg.indexOf('<g transform="translate(', i);
  const c = svg.indexOf("</g>", i);
  const p = svg.indexOf("<path ", i);
  const n = Math.min(a < 0 ? Infinity : a, c < 0 ? Infinity : c, p < 0 ? Infinity : p);
  if (n === Infinity) break;
  if (n === a) {
    const f = svg.indexOf(">", a);
    const m = svg.slice(a, f).match(/translate\((-?[\d.]+),(-?[\d.]+)\)/);
    pila.push([x, y]);
    x += Number(m?.[1] ?? 0);
    y += Number(m?.[2] ?? 0);
    i = f + 1;
  } else if (n === c) {
    const t = pila.pop();
    if (t) { x = t[0]; y = t[1]; }
    i = c + 4;
  } else {
    const ce = svg.indexOf("/>", p);
    const cp = svg.indexOf("</path>", p);
    const fin = (ce < 0 ? Infinity : ce) < (cp < 0 ? Infinity : cp) ? ce + 2 : cp;
    const tag = svg.slice(p, fin);
    const num = tag.match(/d="([^"]+)"/)?.[1];
    if (num && /#e2e8f0/.test(tag)) {
      const ns = (num.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      const pts = [];
      for (let k = 0; k + 1 < ns.length; k += 2) pts.push([x + ns[k], y + ns[k + 1]]);
      const minx = Math.min(...pts.map((q) => q[0]));
      const maxx = Math.max(...pts.map((q) => q[0]));
      const miny = Math.min(...pts.map((q) => q[1]));
      const maxy = Math.max(...pts.map((q) => q[1]));
      if (maxy - miny < 0.01 && maxx - minx > 490) ys.push(miny);
    }
    i = fin;
  }
}
ys.sort((a, b) => a - b);
console.log("sep h=0 w>490:", ys.length, ys.map((v) => v.toFixed(2)).join(", "));
const sep4017 = [];