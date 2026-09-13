import { readFileSync } from "node:fs";
const ruta = process.argv[2] ?? "D:/Gantt_typ/app/scripts/out.svg";
const ancla = process.argv[3] ?? "660.4724";
const svg = readFileSync(ruta, "utf8");
const seps = [];
for (const m of svg.matchAll(/<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)"/g)) {
  const ven = svg.slice(m.index, m.index + 250);
  if (ven.includes(ancla)) seps.push(Number(m[2]));
}
seps.sort((a, b) => a - b);
console.log("seps w>=660 en out.svg:", seps.length, seps.map((v) => v.toFixed(2)).join(", "));
const seps0 = [];
for (const m of svg.matchAll(/<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)"/g)) {
  const ven = svg.slice(m.index, m.index + 250);
  if (ven.includes("623.6221")) seps0.push(Number(m[2]));
}
console.log("seps 623 (marco):", seps0.map((v) => v.toFixed(2)).join(", "));