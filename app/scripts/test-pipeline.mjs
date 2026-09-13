import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createTypstCompiler } from '@myriaddreamin/typst.ts';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '..', 'gantt-lib');

function libSrc(name) {
  return readFileSync(join(lib, name), 'utf8');
}

const template = `#import "gantt.typ": *
#let datos = yaml("datos.yaml")
#carta-gantt(
  datos,
  titulo: [Cronograma],
  mostrar-columnas: ("inicio", "termino", "duracion", "avance"),
)`;

const repoRoot = join(here, '..', '..');
const yamlBytes = readFileSync(join(repoRoot, 'ejemplos', 'datos.yaml'));

const compiler = createTypstCompiler();
await compiler.init();
compiler.addSource('/main.typ', template);
compiler.addSource('/gantt.typ', libSrc('gantt.typ'));
compiler.addSource('/datos.typ', libSrc('datos.typ'));
compiler.addSource('/dibujo.typ', libSrc('dibujo.typ'));
compiler.addSource('/fechas.typ', libSrc('fechas.typ'));
compiler.addSource('/cpm.typ', libSrc('cpm.typ'));
compiler.mapShadow('/datos.yaml', yamlBytes);

const out = await compiler.compile({ mainFilePath: '/main.typ', format: 'vector', diagnostics: 'full' });
if (out.diagnostics?.length) {
  for (const d of out.diagnostics) console.error('[diag]', d);
}
if (!out.result) {
  console.error('SIN RESULTADO — compilación falló');
  process.exitCode = 1;
} else {
  console.log('artifact bytes:', out.result.byteLength);
  const renderer = createTypstRenderer();
  await renderer.init();
  const svg = await renderer.renderSvg({ format: 'vector', artifactContent: out.result });
  console.log('svg chars:', svg.length);
  writeFileSync(join(here, 'out.svg'), svg);

  const world = await compiler.runWithWorld({ mainFilePath: '/main.typ' }, async (w) => {
    await w.compile();
    const q = await w.query({ selector: 'text' });
    return q;
  });
  const textos = world.map((t) => String(t?.text ?? t) );
  console.log('query text count:', textos.length);
  console.log(textos.slice(0, 12).join(' | '));
  writeFileSync(join(here, 'textos.txt'), textos.join('\n'));
}