import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-actual.svg", "utf8");
const ids = [];
for (const m of svg.matchAll(/<g transform="translate\(([^)]+)\)"[^>]*data-tid="([^"]+)"/g)) {
  ids.push({ tr: m[1], tid: m[2], idx: m.index });
}
const lines = svg.split(/<path /).slice(1);
console.log("paths totales:", lines.length);
const horizontales = [];
for (const seg of lines) {
  const finC = seg.indexOf("/>");
  const finV = seg.indexOf("</path>");
  const fin = finC >= 0 && finC < (finV < 0 ? Infinity : finV) ? finC + 2 : (finV >= 0 ? finV : 0);
  const tag = seg.slice(0, fin);
  if (!/#e2e8f0/.test(tag)) continue;
  const d = tag.match(/d="([^"]+)"/)?.[1];
  if (!d) continue;
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length < 4) continue;
  const ys = [];
  for (let k = 1; k < nums.length; k += 2) ys.push(nums[k]);
  const xs = [];
  for (let k = 0; k < nums.length; k += 2) xs.push(nums[k]);
  const miny = Math.min(...ys);
  const maxy = Math.max(...ys);
  const minx = Math.min(...xs);
  const maxx = Math.max(...xs);
  if (maxy - miny < 0.5) horizontales.push({ miny, maxy, minx, maxx, tag: tag.slice(0, 150) });
}
console.log("e2e8f0 horizontales (sin transform):", horizontales.length);
for (const h of horizontales.slice(-4)) {
  console.log(`  y=${h.miny}..${h.maxy} x=${h.minx}..${h.maxx}`);
  console.log("   ", h.tag);
}
console.log("--- grupos translate (primeros 8):");
for (const g of ids.slice(0, 8)) console.log(`  y0=${g.tr} tid=${g.tid.slice(0, 20)}`);