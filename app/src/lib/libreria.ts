// libreria.ts — Caché y canal con el Web Worker que compila y renderiza a SVG.

import { parse, stringify } from "yaml";
import plantillaExport from "./plantilla.exportar.typ?raw";

import ganttTyp from "../../gantt-lib/gantt.typ?raw";
import datosTyp from "../../gantt-lib/datos.typ?raw";
import dibujoTyp from "../../gantt-lib/dibujo.typ?raw";
import fechasTyp from "../../gantt-lib/fechas.typ?raw";
import cpmTyp from "../../gantt-lib/cpm.typ?raw";
import type { Fila } from "./proyecto";

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

export interface VistaTipografiada {
  svg: string | null;
  errores: string[];
  milis: number;
}

// --- Caché por hash de (main.typ + yaml) --------------------------------

const cache = new Map<number, VistaTipografiada>();
const CACHE_MAX = 120;

function hashTexto(...partes: string[]): number {
  let h = 5381;
  for (const p of partes) {
    for (let i = 0; i < p.length; i++) {
      h = ((h << 5) + h + p.charCodeAt(i)) | 0;
    }
  }
  return h >>> 0;
}

const enCache = (clave: number): VistaTipografiada | null => cache.get(clave) ?? null;
const guardarCache = (clave: number, r: VistaTipografiada): void => {
  cache.set(clave, r);
  if (cache.size > CACHE_MAX) {
    const primer = cache.keys().next().value;
    if (primer !== undefined) cache.delete(primer);
  }
};

// --- Web Worker de compilación -------------------------------------------

type Respuesta =
  | { id: number; ok: true; resultado: VistaTipografiada }
  | { id: number; ok: false; error: string };

let worker: Worker | undefined;
let proxId = 1;
const pendientes = new Map<number, (r: VistaTipografiada | Error) => void>();

function obtenerWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./workerCompilar.ts", import.meta.url), {
    type: "module",
  });
  w.onmessage = (evento: MessageEvent<Respuesta>) => {
    const m = evento.data;
    const resolver = pendientes.get(m.id);
    pendientes.delete(m.id);
    if (!resolver) return;
    resolver(m.ok ? m.resultado : new Error(m.error));
  };
  w.onerror = (e) => {
    const err = new Error(e.message || "worker de compilación falló");
    for (const resolver of pendientes.values()) resolver(err);
    pendientes.clear();
    w.terminate();
    if (worker === w) worker = undefined;
  };
  worker = w;
  return w;
}

export async function compilarSvg(
  yamlTexto: string,
  mainTyp?: string,
): Promise<VistaTipografiada> {
  const clave = hashTexto(mainTyp ?? "", "\u0000", yamlTexto);
  const previo = enCache(clave);
  if (previo) return previo;

  const id = proxId++;
  const resultado = await new Promise<VistaTipografiada>((resolver, rechazar) => {
    pendientes.set(id, (r) => (r instanceof Error ? rechazar(r) : resolver(r)));
    obtenerWorker().postMessage({ id, tipo: "compilar", texto: yamlTexto, mainTyp });
  });

  guardarCache(clave, resultado);
  return resultado;
}

// --- Inyección de resultados CPM precalculados (petgraph) -----------------

// Detecta si el YAML tiene CPM activo (config.cpm: true). La app lo combina
// con el parámetro de la UI (`parametros["cpm"]`), que ya recibe el valor de
// config vía sincronización. Se usa para decidir si vale la pena llamar a
// preparar_filas con cpm: true antes de compilar.
export function necesitaCpm(yamlTexto: string): boolean {
  return /\bcpm:\s*true\b/.test(yamlTexto);
}

// Inyecta un bloque `fechas-cpm:` al YAML con los resultados CPM que ya
// calculó petgraph (vía el comando Rust preparar_filas). La librería Typst
// lo usa en vez de recalcular el CPM interno (cpm.typ), lo que unifica el
// motor para la app completa (barra de tareas, flechas, columnas CPM y
// exportaciones).
//
// El dict que genera tiene la forma que datos.typ espera:
//   fechas-cpm:
//     <codigo>:
//       es: <int>              # early start (columna ini. temprano)
//       ef: <int>              # early finish (columna fin. temprano)
//       ls: <int>              # late start  (columna ini. tardío)
//       lf: <int>              # late finish (columna fin. tardío)
//       holgura: <int>
//       critico: <bool>
//       inicio-dias: <int>     # dibujo de la barra (= es para hojas)
//       termino-dias: <int>    # dibujo de la barra (= ef para hojas)
//       duracion: <int>
//       predecesoras: [...]    # lista de {pred: <id>, tipo, lag}
//
// `ls` y `lf` se deducen de `holgura` (ls = es + holgura; lf = ef + holgura),
// ya que la Fila de Rust no trae esas columnas directamente.
export function inyectarFechasCpm(yamlTexto: string, filas: Fila[]): string {
  const conCpm = filas.filter((f) => f.holgura !== undefined && f.holgura !== null);
  if (conCpm.length === 0) return yamlTexto;

  const fechasCpm: Record<string, Record<string, unknown>> = {};
  for (const f of conCpm) {
    const es = f.inicioDias;
    const ef = f.terminoDias;
    const h = f.holgura!;
    fechasCpm[f.codigo] = {
      es,
      ef,
      ls: es + h,
      lf: ef + h,
      holgura: h,
      critico: f.critico ?? false,
      "inicio-dias": es,
      "termino-dias": ef,
      duracion: f.duracion,
      predecesoras: f.predecesoras.length > 0 ? f.predecesoras : undefined,
    };
  }

  let doc: unknown;
  try {
    doc = parse(yamlTexto);
  } catch {
    return yamlTexto;
  }
  if (Array.isArray(doc)) doc = { tareas: doc };
  if (doc && typeof doc === "object") {
    (doc as Record<string, unknown>)["fechas-cpm"] = fechasCpm;
  }
  return stringify(doc, { lineWidth: 0 });
}