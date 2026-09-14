// proyecto.ts — Port en TypeScript de `preparar-tareas` (datos.typ) +
// `calcular-cpm` (cpm.typ) + `fechas.typ`, para generar la lista de filas
// ya resueltas (fechas, duraciones, rollup, CPM, predecesoras) que usan los
// exportadores MSPDI/PMXML. Debe mantenerse fiel a la librería Typst.

import { parse } from "yaml";

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

// --- fechas (fechas.typ) -------------------------------------------------

export function diasDesdeEpoca(anio: number, mes: number, dia: number): number {
  const y = mes <= 2 ? anio - 1 : anio;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = mes > 2 ? mes - 3 : mes + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + dia - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fechaDesdeDias(z: number): { anio: number; mes: number; dia: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const dia = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mes = mp < 10 ? mp + 3 : mp - 9;
  const anio = y + (mes <= 2 ? 1 : 0);
  return { anio, mes, dia };
}

const p2 = (n: number) => String(n).padStart(2, "0");

export function fechaIso(z: number): string {
  const f = fechaDesdeDias(z);
  return `${f.anio}-${p2(f.mes)}-${p2(f.dia)}`;
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

// Acepta Date (el parser YAML convierte 2026-01-05 a Date), "AAAA-MM-DD",
// "AAAA-MM"/"AAAA" (día/mes 1) o número = día juliano directo.
export function aDias(v: Crudo): number | null {
  if (esVacio(v)) return null;
  if (typeof v === "number") return Math.trunc(v);
  if (v instanceof Date) return diasDesdeEpoca(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const s = String(v).trim();
  const partes = s.split("-");
  if (partes.length < 1 || partes.length > 3) throw new Error(`Fecha inválida: ${s}`);
  return diasDesdeEpoca(
    Number(partes[0]),
    partes.length >= 2 ? Number(partes[1]) : 1,
    partes.length >= 3 ? Number(partes[2]) : 1,
  );
}

// --- avance / predecesoras (datos.typ) ------------------------------------

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

// --- modelo de filas (preparar-tareas) ------------------------------------

interface Item {
  codigo: string;
  padre: string | null;
  crudo: Record<string, Crudo>;
}

function aplanar(lista: Crudo, padreContexto: string | null, raiz: boolean, out: Item[]): void {
  if (!Array.isArray(lista)) return;
  for (const t of lista) {
    if (!t || typeof t !== "object") continue;
    const crudo = t as Record<string, Crudo>;
    const codigo = String(crudo.codigo ?? "");
    const hijos = crudo.subtareas ?? [];
    const padreCrudo: Crudo = raiz ? (crudo.padre ?? null) : padreContexto;
    const padre: string | null = esVacio(padreCrudo) ? null : String(padreCrudo);
    out.push({ codigo, padre, crudo });
    aplanar(hijos, codigo, false, out);
  }
}

export interface OpcionesPreparar {
  cpm: boolean;
  inicioProyecto?: string;
  terminoProyecto?: string;
}

export function prepararProyecto(texto: string, opts: OpcionesPreparar): Fila[] {
  const raiz = parse(texto);
  const lista = Array.isArray(raiz) ? raiz : (raiz as Record<string, Crudo>)?.tareas;
  if (!Array.isArray(lista)) throw new Error("el YAML no tiene una lista 'tareas'");
  const plano: Item[] = [];
  aplanar(lista, null, true, plano);

  const mapa = new Map<string, Item>();
  for (const it of plano) mapa.set(it.codigo, it);
  const hijosDe = new Map<string, string[]>();
  const raices: string[] = [];
  for (const it of plano) {
    if (it.padre !== null && mapa.has(it.padre)) {
      if (!hijosDe.has(it.padre)) hijosDe.set(it.padre, []);
      hijosDe.get(it.padre)!.push(it.codigo);
    } else {
      raices.push(it.codigo);
    }
  }

  // orden DFS (padre antes que hijos), con nivel y cadena de padre
  const orden: { codigo: string; nivel: number }[] = [];
  const visitar = (codigo: string, nivel: number) => {
    orden.push({ codigo, nivel });
    for (const h of hijosDe.get(codigo) ?? []) visitar(h, nivel + 1);
  };
  for (const r of raices) visitar(r, 0);

  const esHoja = (codigo: string) => !hijosDe.has(codigo);

  const diaAncla = (v: Crudo) => aDias(v);
  const ip = opts.inicioProyecto && opts.inicioProyecto.trim() !== "" ? diaAncla(opts.inicioProyecto) : null;
  const tp = opts.terminoProyecto && opts.terminoProyecto.trim() !== "" ? diaAncla(opts.terminoProyecto) : null;

  // --- CPM (port de cpm.typ) ---
  let fechasDe: Map<string, { es: number; ef: number }> | null = null;
  let criticoDe: Map<string, boolean> | null = null;
  let holguraDe: Map<string, number> | null = null;
  if (opts.cpm) {
    const hojas = plano.filter((it) => esHoja(it.codigo));
    const durDe = new Map<string, number>();
    const esAnclaDe = new Map<string, number>();
    const efAnclaDe = new Map<string, number>();
    const depsDe = new Map<string, Dep[]>();
    for (const h of hojas) {
      const inicioRaw = h.crudo.inicio;
      const terminoRaw = h.crudo.termino;
      const esA = esVacio(inicioRaw) ? null : diaAncla(inicioRaw)!;
      const efA = esVacio(terminoRaw) ? null : diaAncla(terminoRaw)!;
      const dn = aNumero(h.crudo.duracion);
      const dur = dn !== null ? Math.max(Math.trunc(dn), 1) : esA !== null && efA !== null ? efA - esA + 1 : 1;
      durDe.set(h.codigo, dur);
      if (esA !== null) esAnclaDe.set(h.codigo, esA);
      if (efA !== null) efAnclaDe.set(h.codigo, efA);
      const deps = interpretarPredecesoras(h.crudo.predecesoras);
      for (const d of deps) {
        if (!durDe.has(d.pred)) throw new Error(`CPM: '${h.codigo}' depende de '${d.pred}', que no existe o es un grupo`);
      }
      depsDe.set(h.codigo, deps);
    }
    const succDe = new Map<string, { succ: string; tipo: TipoDep; lag: number }[]>();
    for (const h of hojas) {
      for (const d of depsDe.get(h.codigo) ?? []) {
        if (!succDe.has(d.pred)) succDe.set(d.pred, []);
        succDe.get(d.pred)!.push({ succ: h.codigo, tipo: d.tipo, lag: d.lag });
      }
    }
    const grado = new Map<string, number>();
    for (const h of hojas) grado.set(h.codigo, (depsDe.get(h.codigo) ?? []).length);
    let cola = hojas.filter((h) => grado.get(h.codigo) === 0).map((h) => h.codigo);
    const topo: string[] = [];
    while (cola.length) {
      const c = cola.shift()!;
      topo.push(c);
      for (const s of succDe.get(c) ?? []) {
        grado.set(s.succ, grado.get(s.succ)! - 1);
        if (grado.get(s.succ) === 0) cola.push(s.succ);
      }
    }
    if (topo.length !== hojas.length) {
      const ciclo = hojas.map((h) => h.codigo).filter((c) => !topo.includes(c));
      throw new Error(`CPM: ciclo en dependencias: ${ciclo.join(", ")}`);
    }
    const anclas: number[] = [];
    for (const h of hojas) {
      const esA = esAnclaDe.get(h.codigo);
      const efA = efAnclaDe.get(h.codigo);
      if (esA !== undefined) anclas.push(esA);
      else if (efA !== undefined) anclas.push(efA - durDe.get(h.codigo)! + 1);
    }
    const base = ip ?? (anclas.length ? Math.min(...anclas) : null);
    const esDe = new Map<string, number>();
    const efDe = new Map<string, number>();
    const cotaInicio = (d: Dep, dur: number): number => {
      const es = esDe.get(d.pred)!;
      const ef = efDe.get(d.pred)!;
      if (d.tipo === "fs") return ef + 1 + d.lag;
      if (d.tipo === "ss") return es + d.lag;
      if (d.tipo === "ff") return ef + d.lag - dur + 1;
      return es + d.lag - dur + 1;
    };
    for (const c of topo) {
      const dur = durDe.get(c)!;
      const cands: number[] = [];
      if (esAnclaDe.has(c)) cands.push(esAnclaDe.get(c)!);
      if (efAnclaDe.has(c)) cands.push(efAnclaDe.get(c)! - dur + 1);
      for (const d of depsDe.get(c) ?? []) cands.push(cotaInicio(d, dur));
      let start: number;
      if (cands.length) start = Math.max(...cands);
      else if (base !== null) start = base;
      else throw new Error(`CPM: '${c}' sin inicio, sin predecesoras y sin inicio-proyecto`);
      esDe.set(c, start);
      efDe.set(c, start + dur - 1);
    }
    fechasDe = new Map<string, { es: number; ef: number }>();
    for (const c of topo) fechasDe.set(c, { es: esDe.get(c)!, ef: efDe.get(c)! });
    const proyectoTerm = tp ?? Math.max(...topo.map((c) => efDe.get(c)!));
    const lfDe = new Map<string, number>();
    const lsDe = new Map<string, number>();
    const cotaTermino = (s: { succ: string; tipo: TipoDep; lag: number }, durPred: number): number => {
      const ls = lsDe.get(s.succ)!;
      const lf = lfDe.get(s.succ)!;
      const efS = efDe.get(s.succ)!;
      if (s.tipo === "fs") return ls - 1 - s.lag;
      if (s.tipo === "ss") return ls + durPred - 1 - s.lag;
      if (s.tipo === "ff") return lf - s.lag;
      return efS - s.lag;
    };
    for (const c of [...topo].reverse()) {
      const dur = durDe.get(c)!;
      const cotas = (succDe.get(c) ?? []).map((s) => cotaTermino(s, dur));
      const lf = cotas.length ? Math.min(...cotas) : proyectoTerm;
      lfDe.set(c, lf);
      lsDe.set(c, lf - dur + 1);
    }
    criticoDe = new Map<string, boolean>();
    holguraDe = new Map<string, number>();
    for (const c of topo) {
      const holg = lsDe.get(c)! - esDe.get(c)!;
      holguraDe.set(c, holg);
      criticoDe.set(c, holg === 0);
    }
  }

  const marcarCritico = (codigo: string): boolean => {
    const hijos = hijosDe.get(codigo);
    if (!hijos || !hijos.length) return criticoDe?.get(codigo) ?? false;
    return hijos.some((h) => marcarCritico(h));
  };

  function resolver(codigo: string): {
    inicioDias: number; terminoDias: number; duracion: number; avance: number;
  } {
    const item = mapa.get(codigo)!;
    const hijos = hijosDe.get(codigo) ?? [];
    if (!hijos.length) {
      const fCpm = fechasDe?.get(codigo);
      let f: { inicioDias: number; terminoDias: number; duracion: number };
      if (fCpm) {
        f = { inicioDias: fCpm.es, terminoDias: fCpm.ef, duracion: fCpm.ef - fCpm.es + 1 };
      } else {
        const inicioDias = aDias(item.crudo.inicio);
        if (inicioDias === null) throw new Error(`la tarea '${codigo}' no tiene 'inicio' ni subtareas`);
        const terminoRaw = item.crudo.termino;
        const durRaw = aNumero(item.crudo.duracion);
        if (!esVacio(terminoRaw)) {
          const terminoDias = aDias(terminoRaw)!;
          const duracion = durRaw !== null ? Math.trunc(durRaw) : terminoDias - inicioDias + 1;
          f = { inicioDias, terminoDias, duracion };
        } else if (durRaw !== null) {
          const duracion = Math.trunc(durRaw);
          f = { inicioDias, terminoDias: inicioDias + Math.max(duracion, 1) - 1, duracion };
        } else {
          f = { inicioDias, terminoDias: inicioDias, duracion: 1 };
        }
      }
      return { ...f, avance: interpretarAvance(item.crudo.avance) };
    }
    const sub = hijos.map((h) => resolver(h));
    const inicioDias = !esVacio(item.crudo.inicio) ? aDias(item.crudo.inicio)! : Math.min(...sub.map((s) => s.inicioDias));
    const terminoDias = !esVacio(item.crudo.termino) ? aDias(item.crudo.termino)! : Math.max(...sub.map((s) => s.terminoDias));
    const durRaw = aNumero(item.crudo.duracion);
    const duracion = durRaw !== null ? Math.trunc(durRaw) : terminoDias - inicioDias + 1;
    let avance: number;
    if (!esVacio(item.crudo.avance)) avance = interpretarAvance(item.crudo.avance);
    else {
      const peso = sub.reduce((a, s) => a + s.duracion, 0);
      avance = peso > 0 ? sub.reduce((a, s) => a + s.avance * s.duracion, 0) / peso : 0;
    }
    return { inicioDias, terminoDias, duracion, avance };
  }

  return orden.map((o) => {
    const item = mapa.get(o.codigo)!;
    const r = resolver(o.codigo);
    const esGrupo = (hijosDe.get(o.codigo) ?? []).length > 0;
    const hito =
      item.crudo.hito === true ||
      (r.duracion <= 1 && esVacio(item.crudo.termino) && esVacio(item.crudo.duracion) && !esGrupo);
    const fila: Fila = {
      codigo: o.codigo,
      nombre: String(item.crudo.nombre ?? o.codigo),
      nivel: o.nivel,
      esGrupo,
      hito,
      inicioDias: r.inicioDias,
      terminoDias: r.terminoDias,
      duracion: r.duracion,
      avance: Math.min(Math.max(r.avance, 0), 1),
      padre: item.padre,
      predecesoras: !esGrupo ? interpretarPredecesoras(item.crudo.predecesoras) : [],
    };
    if (opts.cpm) {
      fila.critico = esGrupo ? marcarCritico(o.codigo) : criticoDe?.get(o.codigo) ?? false;
      fila.holgura = esGrupo ? undefined : holguraDe?.get(o.codigo);
    }
    return fila;
  });
}
