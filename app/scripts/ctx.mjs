import { readFileSync } from "node:fs";
const svg = readFileSync(process.argv[2] ?? process.env.TEMP + "/opencode/cli-planta/main.svg", "utf8");
for (const m of svg.matchAll(/923\.89/g)) {
  if (m.index > 40000 && m.index < 50000) continue;
  console.log("...");
  console.log(svg.slice(Math.max(0, m.index - 380), m.index + 60));
  break;
}
const i = svg.indexOf("923.89");
console.log("===== primer contexto =====");
console.log(svg.slice(Math.max(0, i - 500), i + 80));
const j = svg.lastIndexOf("923.89");
console.log("===== ultimo contexto =====");
console.log(svg.slice(Math.max(0, j - 500), j + 80));