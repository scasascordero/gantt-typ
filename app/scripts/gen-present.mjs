// Genera las imágenes de la presentación usando el pipeline EXACTO de la app:
// compila con el wasm de public/wasm + el main.typ que genera params.ts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTypstCompiler, loadFonts } from '@myriaddreamin/typst.ts';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const repo = join(app, '..');
const outDir = join(repo, 'presentacion', 'assets');
mkdirSync(outDir, { recursive: true });
const lib = join(app, 'gantt-lib');
const libSrc = (n) => readFileSync(join(lib, n), 'utf8');

const origFetch = globalThis.fetch;
globalThis.fetch = async (url, ...a) => {
  const s = String(url);
  const m = s.match(/\/(wasm|fonts)\/(.+)$/);
  if (m) {
    try { return new Response(readFileSync(join(app, 'public', m[1], m[2])), { status: 200 }); }
    catch { return new Response('x', { status: 404 }); }
  }
  return origFetch(url, ...a);
};

const { generarMainTyp, valoresDefault } = await import('../src/lib/params.ts');
const { leerConfigYaml } = await import('../src/lib/yamlEdicion.ts');

const compiler = createTypstCompiler();
await compiler.init({
  getModule: () => fetch(new URL('http://localhost/wasm/typst_ts_web_compiler_bg.wasm')),
  beforeBuild: [loadFonts(['/fonts/LiberationSans-Regular.ttf', '/fonts/LiberationSans-Bold.ttf'])],
});
for (const n of ['gantt.typ', 'datos.typ', 'dibujo.typ', 'fechas.typ', 'cpm.typ']) compiler.addSource('/' + n, libSrc(n));
const renderer = createTypstRenderer();
await renderer.init({
  getModule: () => fetch(new URL('http://localhost/wasm/typst_ts_renderer_bg.wasm')),
  beforeBuild: [loadFonts(['/fonts/LiberationSans-Regular.ttf', '/fonts/LiberationSans-Bold.ttf'])],
});

function svgLimpio(s) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + s.replace(/<script[\s\S]*?<\/script>/g, '');
}

async function render(nombre, yamlTexto, valores) {
  compiler.addSource('/main.typ', generarMainTyp(valores));
  compiler.mapShadow('/datos.yaml', new TextEncoder().encode(yamlTexto));
  const out = await compiler.compile({ mainFilePath: '/main.typ', format: 'vector', diagnostics: 'full' });
  if (!out.result) throw new Error(nombre + ': ' + (out.diagnostics ?? []).map((d) => d.message).join('\n'));
  const svg = await renderer.renderSvg({ format: 'vector', artifactContent: out.result });
  writeFileSync(join(outDir, nombre + '.svg'), svgLimpio(svg));
  console.log('ok', nombre);
}

const ejemplo1 = readFileSync(join(repo, 'ejemplos', 'ejemplo_1.yaml'), 'utf8');
const datosConfig = readFileSync(join(repo, 'ejemplos', 'datos-config.yaml'), 'utf8');
const D = valoresDefault();

// 1) vista del editor con el plan de 31 actividades
await render('p1-editor', ejemplo1, { ...D, titulo: 'Centro de distribución — edición en vivo' });

// 2) config embebida del YAML + costos (el menú adopta config, como la app)
await render('p2-config', datosConfig, { ...D, ...leerConfigYaml(datosConfig) });

// 3) CPM con flechas y ruta crítica
const cpmYaml = `tareas:
  - codigo: "1"
    nombre: Ingeniería
    subtareas:
      - codigo: "1.1"
        nombre: Relevamiento
        duracion: 6
        avance: 1.0
      - codigo: "1.2"
        nombre: Diseño
        duracion: 8
        predecesoras: ["1.1"]
        avance: "60%"
      - codigo: "1.3"
        nombre: Calculo estructural
        duracion: 6
        predecesoras: ["1.2:ss:2"]
  - codigo: "2"
    nombre: Compras
    duracion: 10
    predecesoras: ["1.2"]
  - codigo: "3"
    nombre: Montaje
    duracion: 12
    predecesoras: ["1.3", "2"]
  - codigo: "4"
    nombre: Puesta en marcha
    duracion: 4
    predecesoras: ["3"]
  - codigo: "5"
    nombre: Fin de obra
    predecesoras: ["4"]
    formato-barra: contorno
`;
await render('p3-cpm', cpmYaml, {
  ...D,
  titulo: 'Ruta crítica calculada por el motor CPM (cpm: true)',
  cpm: true,
  'inicio-proyecto': '2026-02-02',
  'mostrar-columnas': ['inicio', 'termino', 'holgura', 'critico'],
  'resaltar-critico': true,
});

// 4) primer plano de las columnas de costos (derecha)
await render('p4-costos', datosConfig, {
  ...D,
  ...leerConfigYaml(datosConfig),
  titulo: 'Costos: cantidad × unitario, acumulados por nivel y alineados a la derecha',
  'mostrar-duracion': false,
  'mostrar-columnas': ['inicio', 'cantidad', 'unidad', 'costo-unitario', 'costo'],
  'mostrar-niveles': '2',
});
