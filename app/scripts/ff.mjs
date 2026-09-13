import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-fresco.svg", "utf8");
let idx = 0, n = 0;
while (true) {
  const f = svg.indexOf("f8fafc", idx);
  if (f < 0) break;
  n++;
  if (n <= 3) console.log(svg.slice(Math.max(0, f - 160), f + 90).replace(/\n/g, " "));
  idx = f + 6;
}
console.log("total ocurrencias:", n);