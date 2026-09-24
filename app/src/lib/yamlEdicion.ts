// yamlEdicion.ts — Lectura y edición quirúrgica de campos de una actividad
// en el YAML, usando los rangos del parser (`yaml`) para reescribir solo la
// línea del campo: conserva comentarios, orden y estilo del resto del archivo.

import { parseDocument, isMap, isSeq, isPair, isScalar, type Document, type Node, type Pair, type YAMLMap, type YAMLSeq } from "yaml";

import { aDias, fechaIso } from "./fechas";
import { aNumero } from "./modelo";

export type ValorCampo = string | number | boolean | null;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// encuentra el mapa de la tarea con `codigo`, recorriendo en el mismo order
// de aplanado que la librería (codigo propio y luego subtareas)
function hallarNodo(doc: Document, codigo: string): YAMLMap | null {
  const raiz = doc.get("tareas", true);
  if (!isSeq(raiz)) return null;
  const buscar = (seq: YAMLSeq): YAMLMap | null => {
    for (const item of seq.items) {
      if (!isMap(item)) continue;
      if (String(item.get("codigo", true) ?? "") === codigo) return item;
      const sub = item.get("subtareas", true);
      if (isSeq(sub)) {
        const r = buscar(sub);
        if (r) return r;
      }
    }
    return null;
  };
  return buscar(raiz);
}

function serializar(v: ValorCampo): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  // fechas AAAA-MM-DD y palabras simples van sin comillas; el resto, citadas
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^[A-Za-z][A-Za-z0-9_-]*$/.test(s)) return s;
  return JSON.stringify(s);
}

export function leerCampo(texto: string, codigo: string, clave: string): ValorCampo {
  const doc = parseDocument(texto);
  const nodo = hallarNodo(doc, codigo);
  if (!nodo) return null;
  for (const pair of nodo.items) {
    if (isPair(pair) && String(pair.key) === clave) {
      const v = isScalar(pair.value) ? pair.value.value : pair.value;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (v === null || v === undefined) return null;
      if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
      return String(v);
    }
  }
  return null;
}

const esVacio = (v: ValorCampo) => v === null || v === "" || (typeof v === "number" && Number.isNaN(v));

// rango [inicio, fin] del par `clave: valor` en el texto fuente, a partir de
// los rangos de los nodos key/value (Pair no expone range directamente)
function rangoPar(pair: Pair): [number, number] | null {
  const k = pair.key as Node | null;
  const v = pair.value as Node | null;
  if (!k || !k.range) return null;
  const start = k.range[0];
  const end = v && v.range ? v.range[1] : k.range[1];
  return [start, end];
}

export function editarCampo(texto: string, codigo: string, clave: string, valor: ValorCampo): string {
  const doc = parseDocument(texto);
  const nodo = hallarNodo(doc, codigo);
  if (!nodo) throw new Error(`no se encontró la tarea ${codigo}`);

  let objetivo: Pair | null = null;
  for (const pair of nodo.items) if (isPair(pair) && String(pair.key) === clave) objetivo = pair;

  // borrar: quitar la línea completa del par
  if (objetivo && esVacio(valor)) {
    const r = rangoPar(objetivo);
    if (!r) throw new Error(`no se pudo ubicar '${clave}' en ${codigo}`);
    const lineStart = texto.lastIndexOf("\n", r[0] - 1) + 1;
    let lineEnd = texto.indexOf("\n", r[1]);
    if (lineEnd === -1) lineEnd = texto.length;
    return texto.slice(0, lineStart) + texto.slice(Math.min(texto.length, lineEnd + 1));
  }

  // actualizar en el lugar
  if (objetivo) {
    const r = rangoPar(objetivo);
    if (!r) throw new Error(`no se pudo ubicar '${clave}' en ${codigo}`);
    return texto.slice(0, r[0]) + `${clave}: ${serializar(valor)}` + texto.slice(r[1]);
  }

  // insertar: después de la línea de un campo escalar propio (prefiere
  // `codigo`); si la tarea solo tiene `subtareas`, antes de esa clave
  const pares = nodo.items.filter(isPair) as Pair[];
  const ancla = pares.find((p) => String(p.key) === "codigo") ?? pares.find((p) => String(p.key) !== "subtareas");
  // en una secuencia, la clave del primer campo viene precedida por "- ":
  // la línea nueva debe sangrarse como las demás claves (sin el guión)
  const sangria = (s: string) => (s.endsWith("- ") ? s.slice(0, -2) + "  " : s);
  if (!ancla) {
    const sub = pares.find((p) => String(p.key) === "subtareas");
    if (!sub) throw new Error(`tarea ${codigo} sin pares ubicables`);
    const rk = (sub.key as Node).range![0];
    const lineStart = texto.lastIndexOf("\n", rk - 1) + 1;
    const indent = sangria(texto.slice(lineStart, rk));
    return texto.slice(0, lineStart) + `${indent}${clave}: ${serializar(valor)}\n` + texto.slice(lineStart);
  }
  const rAncla = rangoPar(ancla);
  if (!rAncla) throw new Error(`ancla sin rango en ${codigo}`);
  let lineEnd = texto.indexOf("\n", rAncla[1]);
  if (lineEnd === -1) lineEnd = texto.length;
  const kStart = (ancla.key as Node).range![0];
  const kLineStart = texto.lastIndexOf("\n", kStart - 1) + 1;
  const indent = sangria(texto.slice(kLineStart, kStart));
  return texto.slice(0, lineEnd) + `\n${indent}${clave}: ${serializar(valor)}` + texto.slice(lineEnd);
}

// --- consistencia fechas/duración -----------------------------------------

// Cuando una tarea hoja declara `inicio` y `termino`/`duracion`, ambos deben
// ser coherentes (término = inicio + duración - 1, como resuelve la librería).
// Al editar un campo se recalcula el otro para mantener el documento válido:
// - `termino`  -> duración = término - inicio + 1
// - `duracion` -> término  = inicio + duración - 1
// - `inicio`   -> arrastra el término si hay duración propia; si solo hay
//                 término explícito, recalcula la duración (fecha fija como
//                 ancla). Los grupos (con `subtareas`) no se tocan: sus fechas
//                 salen del rollup de las hijas.
export function editarCampoConsistente(texto: string, codigo: string, clave: string, valor: ValorCampo): string {
  let resultado = editarCampo(texto, codigo, clave, valor);
  if (clave !== "inicio" && clave !== "termino" && clave !== "duracion") return resultado;
  if (esVacio(valor)) return resultado;

  const doc = parseDocument(resultado);
  const nodo = hallarNodo(doc, codigo);
  if (!nodo) return resultado;
  if (isSeq(nodo.get("subtareas", true))) return resultado;

  const lee = (key: string): unknown => {
    for (const pair of nodo.items) {
      if (isPair(pair) && String(pair.key) === key && isScalar(pair.value)) return pair.value.value;
    }
    return undefined;
  };
  const escribir = (key: string, v: ValorCampo): void => {
    resultado = editarCampo(resultado, codigo, key, v);
  };

  const aDia = (v: unknown): number | null =>
    typeof v === "string" && ES_FECHA.test(v) ? aDias(v) : null;

  const dInicio = aDia(clave === "inicio" ? valor : lee("inicio"));
  if (dInicio == null) return resultado;

  if (clave === "termino") {
    const dTerm = aDia(valor);
    if (dTerm != null) escribir("duracion", dTerm - dInicio + 1);
  } else if (clave === "duracion") {
    const dur = aNumero(valor, null);
    if (dur != null && Number.isFinite(dur)) escribir("termino", fechaIso(dInicio + Math.max(1, Math.trunc(dur)) - 1));
  } else {
    const dur = aNumero(lee("duracion"), null);
    if (dur != null && Number.isFinite(dur)) {
      escribir("termino", fechaIso(dInicio + Math.max(1, Math.trunc(dur)) - 1));
    } else {
      const dTerm = aDia(lee("termino"));
      if (dTerm != null) escribir("duracion", dTerm - dInicio + 1);
    }
  }
  return resultado;
}

// Detecta las tareas hoja cuyo `termino` no coincide con `inicio + duracion - 1`
// y entrega ambos valores corregidos (duración), para mostrarlos en la UI
// durante la edición directa del YAML y poder aplicar la corrección con un clic.
export interface InconsistenciaFechas {
  codigo: string;
  inicio: string;
  duracion: number;
  termino: string;
  duracionCalculada: number;
  terminoCalculado: string;
  linea: number;
}

export function inconsistenciasFechas(texto: string): InconsistenciaFechas[] {
  const doc = parseDocument(texto);
  const raiz = doc.get("tareas", true);
  if (!isSeq(raiz)) return [];
  const salida: InconsistenciaFechas[] = [];
  const visitar = (seq: YAMLSeq): void => {
    for (const item of seq.items) {
      if (!isMap(item)) continue;
      const sub = item.get("subtareas", true);
      if (isSeq(sub)) {
        visitar(sub);
        continue;
      }
      const lee = (key: string): unknown => {
        for (const pair of item.items) {
          if (isPair(pair) && String(pair.key) === key && isScalar(pair.value)) return pair.value.value;
        }
        return undefined;
      };
      const codigo = String(item.get("codigo", true) ?? "");
      const inicio = lee("inicio");
      const duracion = lee("duracion");
      const termino = lee("termino");
      if (typeof inicio !== "string" || !ES_FECHA.test(inicio)) continue;
      if (typeof duracion !== "number" || !Number.isFinite(duracion)) continue;
      if (typeof termino !== "string" || !ES_FECHA.test(termino)) continue;
      const dIni = aDias(inicio)!;
      const dTer = aDias(termino)!;
      if (dTer === dIni + Math.max(1, Math.trunc(duracion)) - 1) continue;
      const p = (item.items as Pair[]).find((x) => isPair(x) && String(x.key) === "termino");
      const pos = p ? (p.value && (p.value as Node).range ? ((p.value as Node).range![0] as number) : ((p.key as Node).range?.[0] ?? 0)) : 0;
      salida.push({
        codigo,
        inicio,
        duracion,
        termino,
        duracionCalculada: dTer - dIni + 1,
        terminoCalculado: fechaIso(dIni + Math.max(1, Math.trunc(duracion)) - 1),
        linea: texto.slice(0, pos).split("\n").length,
      });
    }
  };
  visitar(raiz);
  return salida;
}

// --- sección `config:` del YAML -> valores para el menú de parámetros ------

import { PARAMETROS, type Valor } from "./params.ts";

const TIPOS: Record<string, string> = {};
for (const p of PARAMETROS) TIPOS[p.clave] = p.tipo;

export function leerConfigYaml(texto: string): Record<string, Valor> {
  const salida: Record<string, Valor> = {};
  try {
    const doc = parseDocument(texto);
    const cfg = doc.get("config", true);
    if (!isMap(cfg)) return salida;
    for (const pair of cfg.items) {
      if (!isPair(pair) || pair.value == null) continue;
      const clave = String(pair.key);
      const tipo = TIPOS[clave];
      if (!tipo) continue;
      let v: unknown;
      if (isScalar(pair.value)) v = pair.value.value;
      else if (isSeq(pair.value)) v = pair.value.items.map((x) => (isScalar(x) ? String(x.value) : null));
      else v = undefined;
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      switch (tipo) {
        case "color":
          if (typeof v === "string") salida[clave] = v.trim().replace(/^#/, "").toLowerCase();
          break;
        case "bool":
          if (typeof v === "boolean") salida[clave] = v;
          break;
        case "numero":
          if (typeof v === "number") salida[clave] = v;
          else if (typeof v === "string") {
            const n = parseFloat(v.replace(/(cm|pt|mm)$/i, ""));
            if (Number.isFinite(n)) salida[clave] = n;
          }
          break;
        case "triestado":
        case "auto-entero":
          if (
            v === "auto" ||
            v === "true" ||
            v === "false" ||
            typeof v === "number"
          )
            salida[clave] = String(v);
          break;
        case "opciones":
        case "texto":
        case "fecha":
          if (typeof v === "string") salida[clave] = v;
          break;
        case "auto-longitud":
          if (v === "auto") salida[clave] = "auto";
          else {
            const n = typeof v === "number" ? v : parseFloat(String(v).replace(/(cm|pt|mm)$/i, ""));
            if (Number.isFinite(n)) salida[clave] = n;
          }
          break;
        case "columnas":
          if (
            Array.isArray(v) &&
            (v as unknown[]).every((x) =>
              ["duracion", "inicio", "termino", "avance", "cantidad", "unidad", "costo-unitario", "costo", "holgura", "critico", "inicio-temprano", "termino-temprano", "inicio-tardio", "termino-tardio"].includes(String(x)),
            )
          )
            salida[clave] = (v as unknown[]).map((x) => String(x));
          break;
      }
    }
  } catch {
    /* YAML inválido: sin config */
  }
  return salida;
}

// Escribe la sección `config:` del YAML con los parámetros del menú que
// difieren de su valor por defecto (los que coinciden con el defecto se
// omiten). Conserva claves desconocidas que ya estuvieran en `config`.
export function ponerConfigYaml(texto: string, valores: Record<string, Valor>): string {
  const doc = parseDocument(texto);
  if (doc.errors.length > 0) return texto;
  const config: Record<string, unknown> = {};
  for (const p of PARAMETROS) {
    const v = p.clave in valores ? valores[p.clave] : p.defecto;
    if (JSON.stringify(v) !== JSON.stringify(p.defecto)) config[p.clave] = v;
  }
  const actual = doc.get("config", true);
  if (isMap(actual)) {
    for (const pair of actual.items) {
      if (!isScalar(pair.key)) continue;
      const clave = String(pair.key);
      if (clave in TIPOS || pair.value == null) continue;
      config[clave] = (pair.value as unknown as { toJSON?: () => unknown }).toJSON?.() ?? pair.value;
    }
  }
  if (Object.keys(config).length === 0) doc.delete("config");
  else doc.set("config", doc.createNode(config));
  if (doc.errors.length > 0) return texto;
  return doc.toString();
}
