import { copyFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function asegurarCarpeta(ruta) {
  if (!existsSync(ruta)) mkdirSync(ruta, { recursive: true });
}

function sincronizar(origen, destino, filtro) {
  asegurarCarpeta(destino);
  for (const archivo of readdirSync(origen)) {
    if (filtro(archivo)) {
      copyFileSync(join(origen, archivo), join(destino, archivo));
      console.log(`← ${archivo}`);
    }
  }
}

const raizGit = join(appRoot, "..");
if (existsSync(join(raizGit, "lib"))) {
  console.log("Sincronizando librería gantt → gantt-lib/");
  sincronizar(join(raizGit, "lib"), join(appRoot, "gantt-lib"), (n) => n.endsWith(".typ"));
}

console.log("Copiando WASM del compilador → public/wasm/");
sincronizar(
  join(appRoot, "node_modules", "@myriaddreamin", "typst-ts-web-compiler", "pkg"),
  join(appRoot, "public", "wasm"),
  (n) => n === "typst_ts_web_compiler_bg.wasm",
);
console.log("Copiando WASM del renderizador → public/wasm/");
sincronizar(
  join(appRoot, "node_modules", "@myriaddreamin", "typst-ts-renderer", "pkg"),
  join(appRoot, "public", "wasm"),
  (n) => n === "typst_ts_renderer_bg.wasm",
);
console.log("listo");