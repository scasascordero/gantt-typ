// proyectoDb.ts — Serialización entre el YAML del editor y el modelo
// estructurado que guarda el comando `guardar_proyecto` (SQLite). El texto
// YAML se conserva además bajo el param `contenido` para round-trip fiel;
// la reconstrucción desde tareas/deps es un respaldo si falta.

import { parse, stringify } from "yaml";
import { aDias, aNumero, fechaIso, interpretarAvance, interpretarPredecesoras } from "./proyecto";

export interface TareaDb {
  codigo: string;
  nombre: string;
  nivel: number;
  padreCodigo: string | null;
  duracion: number | null;
  inicioDias: number | null;
  terminoDias: number | null;
  avance: number;
  cantidad: number | null;
  unidad: string | null;
  costoUnitario: number | null;
  costo: number | null;
  formato: string | null;
  color: string | null;
  ocultarSubtareas: boolean;
  hito: boolean;
}

export interface DepEntrada {
  tareaCodigo: string;
  pred: string;
  tipo: string;
  lag: number;
}

export interface ProyectoCompleto {
  tareas: TareaDb[];
  deps: DepEntrada[];
  params: [string, string][];
}

type Crudo = Record<string, unknown>;

// Aplana la lista del YAML en orden DFS (padre antes que hijos), con el
// nivel y el código del padre, igual que `aplanar` de proyecto.ts.
function aplanar(
  lista: unknown,
  padreContexto: string | null,
  raiz: boolean,
  nivel: number,
  out: { codigo: string; padre: string | null; nivel: number; crudo: Crudo }[],
): void {
  if (!Array.isArray(lista)) return;
  for (const t of lista) {
    if (!t || typeof t !== "object") continue;
    const crudo = t as Crudo;
    const codigo = String(crudo.codigo ?? "");
    const hijos = crudo.subtareas ?? [];
    const padreCrudo = raiz ? crudo.padre ?? null : padreContexto;
    const padre = padreCrudo === null || padreCrudo === undefined || String(padreCrudo).trim() === "" ? null : String(padreCrudo);
    out.push({ codigo, padre, nivel, crudo });
    aplanar(hijos, codigo, false, nivel + 1, out);
  }
}

function textoO(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Convierte el YAML del editor en el modelo estructurado del proyecto:
// tareas (una por nodo, en orden DFS) + dependencias + params con el texto
// original para round-trip fiel.
export function yamlAProyecto(texto: string): { tareas: TareaDb[]; deps: DepEntrada[]; params: [string, string][] } {
  const raiz = parse(texto);
  const lista = Array.isArray(raiz) ? raiz : (raiz as Crudo)?.tareas;
  if (!Array.isArray(lista)) throw new Error("el YAML no tiene una lista 'tareas'");

  const plano: { codigo: string; padre: string | null; nivel: number; crudo: Crudo }[] = [];
  aplanar(lista, null, true, 0, plano);

  const tareas: TareaDb[] = [];
  const deps: DepEntrada[] = [];
  for (const it of plano) {
    const c = it.crudo;
    const juegoAvance = interpretarAvance(c.avance);
    tareas.push({
      codigo: it.codigo,
      nombre: textoO(c.nombre) ?? it.codigo,
      nivel: it.nivel,
      padreCodigo: it.padre,
      duracion: aNumero(c.duracion),
      inicioDias: aDias(c.inicio),
      terminoDias: aDias(c.termino),
      avance: juegoAvance,
      cantidad: aNumero(c.cantidad),
      unidad: textoO(c.unidad),
      costoUnitario: aNumero(c["costo-unitario"]),
      costo: aNumero(c.costo),
      formato: textoO(c["formato-barra"]),
      color: textoO(c["color-texto"]),
      ocultarSubtareas: c["ocultar-subtareas"] === true,
      hito: c.hito === true,
    });
    for (const d of interpretarPredecesoras(c.predecesoras)) {
      deps.push({ tareaCodigo: it.codigo, pred: d.pred, tipo: d.tipo, lag: d.lag });
    }
  }

  return { tareas, deps, params: [["contenido", texto]] };
}

function predecesorasTexto(deps: DepEntrada[], codigo: string): string | null {
  const lista = deps
    .filter((d) => d.tareaCodigo === codigo)
    .map((d) => {
      if (d.tipo === "fs" && d.lag === 0) return d.pred;
      return d.lag !== 0 ? `${d.pred}:${d.tipo}:${d.lag}` : `${d.pred}:${d.tipo}`;
    });
  return lista.length ? lista.join("; ") : null;
}

function nodoYaml(t: TareaDb, deps: DepEntrada[], hijos: TareaDb[], deHijos: Map<string, TareaDb[]>): Crudo {
  const nodo: Crudo = { codigo: t.codigo, nombre: t.nombre };
  if (t.inicioDias !== null) nodo.inicio = fechaIso(t.inicioDias);
  if (t.terminoDias !== null) nodo.termino = fechaIso(t.terminoDias);
  if (t.duracion !== null) nodo.duracion = t.duracion;
  if (t.avance > 0) nodo.avance = t.avance;
  const pred = predecesorasTexto(deps, t.codigo);
  if (pred) nodo.predecesoras = pred;
  if (t.cantidad !== null) nodo.cantidad = t.cantidad;
  if (t.unidad !== null) nodo.unidad = t.unidad;
  if (t.costoUnitario !== null) nodo["costo-unitario"] = t.costoUnitario;
  if (t.costo !== null) nodo.costo = t.costo;
  if (t.formato !== null) nodo["formato-barra"] = t.formato;
  if (t.color !== null) nodo["color-texto"] = t.color;
  if (t.ocultarSubtareas) nodo["ocultar-subtareas"] = true;
  if (t.hito) nodo.hito = true;
  if (hijos.length) nodo.subtareas = hijos.map((h) => nodoYaml(h, deps, deHijos.get(h.codigo) ?? [], deHijos));
  return nodo;
}

// Reconstruye el YAML del editor desde un proyecto cargado. Prefiere el
// param `contenido` (texto original, round-trip fiel); si falta, anida las
// tareas por `padreCodigo` y agrega las dependencias como `predecesoras`.
export function proyectoAYaml(p: ProyectoCompleto): string {
  const contenido = p.params.find(([clave]) => clave === "contenido")?.[1];
  if (contenido !== undefined) return contenido;

  const deHijos = new Map<string, TareaDb[]>();
  const codigos = new Set(p.tareas.map((t) => t.codigo));
  for (const t of p.tareas) {
    if (t.padreCodigo !== null && codigos.has(t.padreCodigo)) {
      if (!deHijos.has(t.padreCodigo)) deHijos.set(t.padreCodigo, []);
      deHijos.get(t.padreCodigo)!.push(t);
    }
  }
  const raices = p.tareas.filter((t) => t.padreCodigo === null || !codigos.has(t.padreCodigo));
  const arbol = raices.map((t) => nodoYaml(t, p.deps, deHijos.get(t.codigo) ?? [], deHijos));
  return stringify({ tareas: arbol }, { lineWidth: 0 });
}