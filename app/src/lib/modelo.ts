// modelo.ts — Tipos compartidos de fila/dependencia y utilidades para leer
// valores crudos del YAML (números, avance, predecesoras). El cálculo de las
// filas ya resueltas vive en el motor Rust (`preparar_proyecto`); aquí queda
// solo lo que necesitan el editor, la persistencia y los exportadores.

export type TipoDep = "fs" | "ss" | "ff" | "sf";

export interface Dep {
  pred: string;
  tipo: TipoDep;
  lag: number;
}

export interface Fila {
  codigo: string;
  nombre: string;
  nivel: number;
  esGrupo: boolean;
  hito: boolean;
  inicioDias: number;
  terminoDias: number;
  duracion: number;
  avance: number;
  padre: string | null;
  predecesoras: Dep[];
  critico?: boolean;
  holgura?: number;
}

type Crudo = unknown;

export const esVacioCrudo = (v: Crudo): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const esVacio = esVacioCrudo;

export function aNumero(v: Crudo, defecto: number | null = null): number | null {
  if (esVacio(v)) return defecto;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : defecto;
  }
  return defecto;
}

function aAvance(v: Crudo, defecto = 0): number {
  if (esVacio(v)) return defecto;
  let esPct = false;
  let n: Crudo = v;
  if (typeof v === "string") {
    let s = v.trim();
    if (s.endsWith("%")) {
      esPct = true;
      s = s.slice(0, -1).trim();
    }
    n = s;
  }
  const valor = aNumero(n, defecto) ?? defecto;
  if (esPct) return valor / 100;
  if (valor > 1) return valor / 100;
  return valor;
}

export function interpretarAvance(v: Crudo): number {
  if (Array.isArray(v)) {
    const serie = v.map((x) => aAvance(x));
    return Math.min(serie.reduce((a, b) => a + b, 0), 1);
  }
  if (typeof v === "string" && v.includes(";")) {
    const serie = v.split(";").map((s) => aAvance(s));
    return Math.min(serie.reduce((a, b) => a + b, 0), 1);
  }
  return aAvance(v);
}

export function interpretarPredecesoras(v: Crudo): Dep[] {
  if (esVacio(v)) return [];
  const norm = (dep: Crudo): Dep => {
    if (dep && typeof dep === "object" && !(dep instanceof Date)) {
      const d = dep as Record<string, Crudo>;
      const codigo = String(d.codigo ?? "");
      const tipo = String(d.tipo ?? "fs").toLowerCase();
      if (!["fs", "ss", "ff", "sf"].includes(tipo)) throw new Error(`predecesoras: tipo inválido '${tipo}' para '${codigo}'`);
      return { pred: codigo, tipo: tipo as TipoDep, lag: Number(d.lag ?? 0) };
    }
    const partes = String(dep).trim().split(":");
    const codigo = partes[0];
    const tipo = partes.length >= 2 && partes[1] !== "" ? partes[1].toLowerCase() : "fs";
    if (!["fs", "ss", "ff", "sf"].includes(tipo)) throw new Error(`predecesoras: tipo inválido '${tipo}' para '${codigo}'`);
    const lag = partes.length >= 3 && partes[2] !== "" ? Math.trunc(Number(partes[2])) : 0;
    return { pred: codigo, tipo: tipo as TipoDep, lag };
  };
  if (Array.isArray(v)) return v.map(norm);
  const s = String(v).trim();
  if (s === "") return [];
  return s.split(";").map(norm);
}