// workerCompilar.ts — Compila el YAML con typst.ts dentro de un Web Worker
// para no bloquear la UI (el WASM corre fuera del hilo principal).

import { createTypstCompiler, loadFonts } from "@myriaddreamin/typst.ts";
import { createTypstRenderer } from "@myriaddreamin/typst.ts/renderer";
import type { TypstCompiler } from "@myriaddreamin/typst.ts";
import type { TypstRenderer } from "@myriaddreamin/typst.ts/renderer";

import ganttTyp from "../../gantt-lib/gantt.typ?raw";
import datosTyp from "../../gantt-lib/datos.typ?raw";
import dibujoTyp from "../../gantt-lib/dibujo.typ?raw";
import fechasTyp from "../../gantt-lib/fechas.typ?raw";
import cpmTyp from "../../gantt-lib/cpm.typ?raw";
import plantillaViz from "./plantilla.visualizacion.typ?raw";

// Tipos del protocolo con el hilo principal (libreria.ts).
interface Peticion {
  id: number;
  tipo: "compilar";
  texto: string;
  mainTyp?: string;
}

export type ResultadoCompilar = { svg: string | null; errores: string[]; milis: number };
type Respuesta =
  | { id: number; ok: true; resultado: ResultadoCompilar }
  | { id: number; ok: false; error: string };

// `globalThis` en vez de `self` para no depender del tipo global de worker.
const scope = globalThis as unknown as {
  onmessage: ((evento: MessageEvent<Peticion>) => void) | null;
  postMessage: (mensaje: Respuesta) => void;
  location: { origin: string };
};

const fuentesSvg = () => [
  "/fonts/LiberationSans-Regular.ttf",
  "/fonts/LiberationSans-Bold.ttf",
];

let compiler: TypstCompiler | undefined;
let renderer: TypstRenderer | undefined;
let listo: Promise<void> | undefined;

function iniciar(): Promise<void> {
  if (!listo) {
    listo = (async () => {
      compiler = createTypstCompiler();
      renderer = createTypstRenderer();
      const moduleWasm = (nombre: string) => () =>
        fetch(new URL(`/wasm/${nombre}`, scope.location.origin));
      await compiler.init({
        getModule: moduleWasm("typst_ts_web_compiler_bg.wasm"),
        beforeBuild: [loadFonts(fuentesSvg())],
      });
      await renderer.init({
        getModule: moduleWasm("typst_ts_renderer_bg.wasm"),
        beforeBuild: [loadFonts(fuentesSvg())],
      });
      compiler.addSource("/gantt.typ", ganttTyp);
      compiler.addSource("/datos.typ", datosTyp);
      compiler.addSource("/dibujo.typ", dibujoTyp);
      compiler.addSource("/fechas.typ", fechasTyp);
      compiler.addSource("/cpm.typ", cpmTyp);
    })();
  }
  return listo;
}

async function compilar(texto: string, mainTyp?: string): Promise<Respuesta> {
  try {
    await iniciar();
    const t0 = performance.now();
    compiler!.mapShadow("/datos.yaml", new TextEncoder().encode(texto));
    compiler!.addSource("/main.typ", mainTyp ?? plantillaViz);
    const salida = await (compiler!.compile as (opciones: {
      mainFilePath: string;
      format?: "vector" | "pdf";
      diagnostics?: "none" | "unix" | "full";
    }) => Promise<{ result?: Uint8Array; diagnostics?: Array<{ message: string }> }>)({
      mainFilePath: "/main.typ",
      format: "vector",
      diagnostics: "full",
    });
    const errores = (salida.diagnostics ?? []).map((d) => d.message);
    if (!salida.result) {
      return {
        id: -1,
        ok: true,
        resultado: { svg: null, errores, milis: performance.now() - t0 },
      };
    }
    const svg = await renderer!.renderSvg({
      format: "vector",
      artifactContent: salida.result,
    });
    return { id: -1, ok: true, resultado: { svg, errores, milis: performance.now() - t0 } };
  } catch (e) {
    return { id: -1, ok: false, error: String(e) };
  }
}

scope.onmessage = (evento: MessageEvent<Peticion>) => {
  const peticion = evento.data;
  if (peticion.tipo !== "compilar") return;
  void compilar(peticion.texto, peticion.mainTyp).then((respuesta) => {
    scope.postMessage({ ...respuesta, id: peticion.id });
  });
};