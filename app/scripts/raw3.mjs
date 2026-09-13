import { readFileSync } from "node:fs";
const svg = readFileSync("D:/Gantt_typ/app/scripts/out.svg", "utf8");
const paths = svg.split(/<path /).slice(1);
console.log("paths:", paths.length);
let n = 0;
for (const seg of paths) {
  const finC = seg.indexOf("/>");
  const finV = seg.indexOf("</path>");
  const fin = finC >= 0 && finC < (finV < 0 ? Infinity : finV) ? finC + 2 : (finV >= 0 ? finV : 0);
  const tag = seg.slice(0, fin);
  if (!/#e2e8f0/.test(tag)) continue;
  const d = tag.match(/d="([^"]+)"/)?.[1];
  if (!d) continue;
  const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (nums.length < 4) continue;
  const xs = [], ys = [];
  for (let k = 0; k + 1 < nums.length; k += 2) { xs.push(nums[k]); ys.push(nums[k + 1]); }
  const miny = Math.min(...ys), maxy = Math.max(...ys), minx = Math.min(...xs), maxx = Math.max(...xs);
  if (maxy - miny < 0.5) {
    n++;
    console.log(`y=${miny.toFixed(2)}..${maxy.toFixed(2)} x=${minx.toFixed(1)}..${maxx.toFixed(1)}  tag=${tag.slice(0, 80)}`);
  }
}
console.log("total horiz e2e8f0:", n);