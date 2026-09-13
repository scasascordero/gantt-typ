import { readFileSync } from "node:fs";
const svg = readFileSync(process.argv[2] ?? process.env.TEMP + "/opencode/cli-planta/main.svg", "utf8");
console.log("viewBox:", svg.match(/viewBox="[^"]+"/)?.[0]);
console.log("ocurrencias 923.89:", (svg.match(/923\.89/g) || []).length);
const filas = [];
for (const m of svg.matchAll(/<g transform="translate\((-?[\d.]+)[ ,](-?[\d.]+)\)">/g)) {
  const x = Number(m[1]), y = Number(m[2]);
  const ven = svg.slice(m.index, m.index + 2600);
  const tiene = ven.includes("923.89");
  const uses = (ven.match(/<use /g) || []).length;
  if (tiene || uses > 0) {
    filas.push({ x, y, tiene, uses });
  }
}
console.log("grupos con 923.89 o texto:");
for (const f of filas) {
  if (f.tiene) console.log(`  y=${f.y.toFixed(2)} x=${f.x.toFixed(2)} 923.89=SI uses=${f.uses}`);
}
console.log("total con linea:", filas.filter((f) => f.tiene).length);