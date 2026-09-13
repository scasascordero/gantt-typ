import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-actual.svg", "utf8");
const fills = {};
for (const m of svg.matchAll(/fill="([^"]+)"/g)) fills[m[1]] = (fills[m[1]] ?? 0) + 1;
console.log(Object.entries(fills).sort((a, b) => b[1] - a[1]));
const sample = svg.match(/class="typst-text"[^>]*d="([^"]{80,})/);
console.log("sample glyph path:", sample?.[0]?.slice(0, 200) ?? "no typst-text path");
const ti = svg.indexOf('typst-text"');
console.log(svg.slice(Math.max(0, ti - 220), ti + 160));