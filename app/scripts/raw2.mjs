import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-actual.svg", "utf8");
const seps = [];
for (const m of svg.matchAll(/<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)"/g)) {
  const y = Number(m[2]);
  const ventana = svg.slice(m.index, m.index + 600);
  if (ventana.includes('923.8904') && !ventana.includes('class="typst-text"')) {
    seps.push(y);
  }
}
seps.sort((a, b) => a - b);
console.log("seps (wrappers translate con 923.89):", seps.length, seps.map((v) => v.toFixed(2)).join(", "));
const seps2 = [];
for (const m of svg.matchAll(/<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)"/g)) {
  const y = Number(m[2]);
  const ventana = svg.slice(m.index, m.index + 1000);
  if (ventana.includes('923.8904')) seps2.push(y);
}
console.log("seps (incl text, +1000):", seps2.length, [...new Set(seps2.map((v) => v.toFixed(2)))].join(", "));