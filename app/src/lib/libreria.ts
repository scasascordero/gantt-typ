import { createTypstCompiler } from "@myriaddreamin/typst.ts";
import { createTypstRenderer } from "@myriaddreamin/typst.ts/renderer";
import type { TypstCompiler } from "@myriaddreamin/typst.ts";
import type { TypstRenderer } from "@myriaddreamin/typst.ts/renderer";

import ganttTyp from "../../gantt-lib/gantt.typ?raw";
import datosTyp from "../../gantt-lib/datos.typ?raw";
import dibujoTyp from "../../gantt-lib/dibujo.typ?raw";
import fechasTyp from "../../gantt-lib/fechas.typ?raw";
import cpmTyp from "../../gantt-lib/cpm.typ?raw";
import plantillaViz from "./plantilla.visualizacion.typ?raw";
import plantillaExport from "./plantilla.exportar.typ?raw";

export function plantillaExportar(): string {
  return plantillaExport;
}

export function fuentesLibreria(): Record<string, string> {
  return {
    "gantt.typ": ganttTyp,
    "datos.typ": datosTyp,
    "dibujo.typ": dibujoTyp,
    "fechas.typ": fechasTyp,
    "cpm.typ": cpmTyp,
  };
}

let compiler: TypstCompiler | undefined;
let renderer: TypstRenderer | undefined;
let inicio: Promise<void> | undefined;

async function iniciar(): Promise<void> {
  compiler = createTypstCompiler();
  renderer = createTypstRenderer();
  const moduleWasm = (nombre: string) => () =>
    fetch(new URL(`/wasm/${nombre}`, window.location.origin));
  await compiler.init({
    getModule: moduleWasm("typst_ts_web_compiler_bg.wasm"),
  });
  await renderer.init({
    getModule: moduleWasm("typst_ts_renderer_bg.wasm"),
  });
  compiler.addSource("/main.typ", plantillaViz);
  compiler.addSource("/gantt.typ", ganttTyp);
  compiler.addSource("/datos.typ", datosTyp);
  compiler.addSource("/dibujo.typ", dibujoTyp);
  compiler.addSource("/fechas.typ", fechasTyp);
  compiler.addSource("/cpm.typ", cpmTyp);
}

function runtime(): Promise<void> {
  if (!inicio) inicio = iniciar();
  return inicio;
}

export interface VistaTipografiada {
  svg: string | null;
  errores: string[];
  milis: number;
}

export async function compilarSvg(yamlTexto: string): Promise<VistaTipografiada> {
  const t0 = performance.now();
  await runtime();
  if (!compiler || !renderer) return { svg: null, errores: ["motor no iniciado"], milis: 0 };

  try {
    compiler.mapShadow("/datos.yaml", new TextEncoder().encode(yamlTexto));
  } catch {
    return { svg: null, errores: ["no se pudo inyectar datos.yaml"], milis: performance.now() - t0 };
  }

  const salida = await (compiler.compile as (opciones: {
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
    return { svg: null, errores, milis: performance.now() - t0 };
  }

  try {
    const svg = await renderer.renderSvg({
      format: "vector",
      artifactContent: salida.result,
    });
    return { svg, errores, milis: performance.now() - t0 };
  } catch (e) {
    return { svg: null, errores: [String(e)], milis: performance.now() - t0 };
  }
}