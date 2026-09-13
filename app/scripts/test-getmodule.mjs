import { readFileSync } from 'node:fs';
import { createTypstCompiler } from '@myriaddreamin/typst.ts';

const wasm = new Uint8Array(readFileSync('node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm'));
const compiler = createTypstCompiler();
await compiler.init({ getModule: () => wasm });
compiler.addSource('/main.typ', '#let datos = yaml("datos.yaml")\n#datos.proyecto');
compiler.mapShadow('/datos.yaml', new TextEncoder().encode('proyecto: Prueba\n'));
const salida = await compiler.compile({ mainFilePath: '/main.typ', format: 'vector', diagnostics: 'full' });
console.log('diagnostics:', salida.diagnostics?.length ? salida.diagnostics : 'ninguno');
console.log('result:', salida.result ? `${salida.result.byteLength} bytes` : 'NULL');