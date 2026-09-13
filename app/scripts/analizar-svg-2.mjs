import { readFileSync } from "node:fs";
const svg = readFileSync(process.env.TEMP + "/opencode/svg-actual.svg", "utf8");
const vb = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/);
console.log("viewBox:", vb?.slice(1).join(", "));
for (const color of ["e2e8f0", "719af2", "dc2626", "f8fafc", "6b7280"]) {
  console.log(color, (svg.match(new RegExp("#" + color, "g")) || []).length);
}
const paths = svg.match(/<path class="typst-shape"[^>]*\/>/g) || [];
console.log("shapes(paths):", paths.length);
console.log("transforms:", (svg.match(/<g transform="translate\(/g) || []).length);
console.log("cierra /g:", (svg.match(/<\/g>/g) || []).length);
const sep = paths.filter((p) => p.includes("#e2e8f0"));
console.log("separadores:", sep.length);
console.log("primer separador:", sep[0]?.slice(0, 160));
console.log("---cabecera svg---");
console.log(svg.slice(0, 380));