import { readFileSync } from "node:fs";
const ruta = process.argv[2];
const svg = readFileSync(ruta, "utf8");
const seps = [];
for (const m of svg.matchAll(/<path([^>]*?)stroke="#e2e8f0"([^>]*?)transform="translate\(0 (-?[\d.]+)\)"([^>]*?)d="M 0 0[hL] ?(\d+(?:\.\d+)?)"/g)) {
  const tag = m[0];
  const sw = (tag.match(/stroke-width="([\d.]+)"/) ?? [0, "?"])[1];
  const y = Number(m[3]);
  const w = Number(m[4]);
  seps.push({ y, w, sw });
}
seps.sort((a, b) => a.y - b.y);
for (const s of seps) console.log(`y=${s.y.toFixed(2)} w=${s.w.toFixed(1)} sw=${s.sw}`);
console.log("total:", seps.length);
const unicos = [...new Set(seps.map((s) => s.y.toFixed(2)))];
console.log("unicos y:", unicos.length, unicos.join(", "));