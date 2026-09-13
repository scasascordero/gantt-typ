import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? (process.env.TEMP + "/opencode/cli-gm");
for (const f of ["gantt.typ", "datos.typ", "dibujo.typ", "fechas.typ", "cpm.typ"]) {
  copyFileSync("D:/Gantt_typ/app/gantt-lib/" + f, join(dir, f));
}
let g = readFileSync(join(dir, "gantt.typ"), "utf8");

const abrir = "let y-fila-bottom = y-fila-top + alto-fila";
const iny = " metadata((fila: i, codigo: f.codigo, ytop: y-fila-top, ycentro: y-centro, ybottom: y-fila-bottom))";
const i = g.indexOf(abrir);
if (i < 0) throw new Error("no encontrado loop");
g = g.slice(0, i + abrir.length) + "\n" + iny + g.slice(i + abrir.length);

const ancla = "let alto-filas = filas.len() * alto-fila";
const j = g.indexOf(ancla);
if (j < 0) throw new Error("no encontrado alto-filas");
const iny2 = " metadata((layout: \"altos\", encabezado: alto-encabezado, filas: filas.len(), alto-filas: alto-filas))";
g = g.slice(0, j + ancla.length) + "\n" + iny2 + g.slice(j + ancla.length);

writeFileSync(join(dir, "gantt.typ"), g);
console.log("parcheado ok");