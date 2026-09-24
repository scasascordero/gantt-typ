// validacion.ts — Valida el YAML con las mismas reglas que la librería
// (CPM): YAML parseable, "tareas" presente, códigos únicos, toda tarea hoja
// con 'inicio' (o predecesoras si cpm está activo) y predecesoras que existan.
// Devuelve diagnósticos con número de línea para mostrarlos en la UI.

import { parseDocument, isMap, isSeq } from "yaml";
import { inconsistenciasFechas } from "./yamlEdicion.ts";
import { numeroOFormula } from "./expr.ts";

export interface Diagnostico {
  linea: number; // 1-based
  mensaje: string;
  severidad: "error" | "aviso";
  // presente solo en el diagnóstico de id repetido: referencia a la tarea
  // duplicada (la segunda ocurrencia) para que la app la renombre sola.
  repetido?: { id: string; codigo: string };
  // presente en avisos de fechas/duración inconsistentes: la app puede
  // corregir sola la `duracion` dejando el `termino` como ancla.
  correccion?: { codigo: string; duracionCalculada: number };
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function nroLinea(texto: string, pos?: number | null): number {
  if (pos == null || pos < 0) return 1;
  return texto.slice(0, pos).split("\n").length;
}

function tokensDePredecesoras(valor: unknown): string[] {
  if (typeof valor === "string") {
    return valor
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(valor)) return valor.map((x) => String(x)).filter(Boolean);
  return [];
}

export function validarTexto(texto: string, cpm: boolean): Diagnostico[] {
  const d: Diagnostico[] = [];
  if (!texto.trim()) return d;

  const doc = parseDocument(texto);
  if (doc.errors.length > 0) {
    for (const err of doc.errors) {
      d.push({
        linea: nroLinea(texto, err.pos[0]),
        mensaje: String(err.message ?? "YAML inválido"),
        severidad: "error",
      });
    }
    return d;
  }
  for (const w of doc.warnings) {
    d.push({
      linea: nroLinea(texto, w.pos[0]),
      mensaje: String(w.message ?? "aviso"),
      severidad: "aviso",
    });
  }

  const raiz = doc.get("tareas", true);
  if (!isSeq(raiz)) {
    d.push({ linea: 1, mensaje: "Falta la lista 'tareas' en el YAML", severidad: "error" });
    return d;
  }

  interface Item {
    codigo: string;
    nombre: string;
    linea: number;
    esHoja: boolean;
    tieneInicio: boolean;
    pred: string[];
  }
  const items: Item[] = [];
  const codigosVistos = new Map<string, number>();
  const idsVistos = new Map<string, string>(); // id -> codigo

  const caminar = (seq: unknown, _nivel: number): void => {
    if (!isSeq(seq)) return;
    for (const nodo of seq.items) {
      if (!isMap(nodo)) continue;
      // `toJSON()` resuelve los campos a valores JS de forma uniforme
      // (el get() de nodos devuelve colecciones crudas según el estilo).
      const datos = nodo.toJSON() as Record<string, unknown>;
      const linea = nroLinea(texto, nodo.range ? nodo.range[0] : null);
      const codigo = datos.codigo;
      if (typeof codigo !== "string" || !codigo.trim()) {
        d.push({ linea, mensaje: "Tarea sin 'codigo'", severidad: "error" });
        continue;
      }
      const clave = codigo.trim();
      if (codigosVistos.has(clave)) {
        d.push({
          linea,
          mensaje: `El código '${clave}' está repetido (la librería exige códigos únicos)`,
          severidad: "error",
        });
      } else {
        codigosVistos.set(clave, linea);
      }
      const id = datos.id;
      if (typeof id === "string" && id.trim()) {
        if (idsVistos.has(id)) {
          d.push({
            linea,
            mensaje: `El id '${id}' está repetido`,
            severidad: "error",
            repetido: { id: id.trim(), codigo: clave },
          });
        } else {
          idsVistos.set(id.trim(), clave);
        }
      }

      const inicio = datos.inicio;
      const termino = datos.termino;
      if (inicio != null && inicio !== "") {
        if (typeof inicio !== "string" || !RE_FECHA.test(inicio.trim())) {
          d.push({ linea, mensaje: `'inicio' de '${clave}' no es una fecha AAAA-MM-DD`, severidad: "error" });
        }
      }
      if (termino != null && termino !== "") {
        if (typeof termino !== "string" || !RE_FECHA.test(termino.trim())) {
          d.push({ linea, mensaje: `'termino' de '${clave}' no es una fecha AAAA-MM-DD`, severidad: "error" });
        }
      }
      const duracion = datos.duracion;
      if (duracion != null && duracion !== "") {
        const n = typeof duracion === "number" ? duracion : parseFloat(String(duracion));
        if (!Number.isFinite(n) || n <= 0) {
          d.push({ linea, mensaje: `'duracion' de '${clave}' debe ser un número positivo`, severidad: "error" });
        }
      }

      // `recursos` (APU): cada recurso necesita cantidad y precio (numéricos o
      // fórmulas); `rendimiento`, si está, también debe evaluar a un número.
      const recursos = datos.recursos;
      if (recursos != null) {
        const listaR = Array.isArray(recursos) ? recursos : Object.values(recursos as object);
        const sinCampos = listaR.filter(
          (r): r is Record<string, unknown> =>
            r != null && typeof r === "object" && ((r as Record<string, unknown>).cantidad == null || (r as Record<string, unknown>).precio == null),
        );
        const conCamposNoEvaluables = listaR.filter((r) => {
          if (r == null || typeof r !== "object") return false;
          const obj = r as Record<string, unknown>;
          return (obj.cantidad != null && numeroOFormula(obj.cantidad) == null) || (obj.rendimiento != null && obj.rendimiento !== "" && numeroOFormula(obj.rendimiento) == null);
        });
        if (sinCampos.length > 0) {
          d.push({
            linea,
            mensaje: `'${clave}': ${sinCampos.length} recurso(s) del APU sin 'cantidad' ni 'precio'`,
            severidad: "aviso",
          });
        }
        if (conCamposNoEvaluables.length > 0) {
          d.push({
            linea,
            mensaje: `'${clave}': ${conCamposNoEvaluables.length} recurso(s) con 'cantidad' o 'rendimiento' que no evaluan a un numero o formula valida (ej: "3*40", "(8+4)/2")`,
            severidad: "aviso",
          });
        }
      }

      const sub = nodo.get("subtareas", true);
      const tieneSub = isSeq(sub) && sub.items.length > 0;
      // hoja = sin hijos (misma semántica que la librería y el motor Rust):
      // ocultar-subtareas solo afecta el dibujo, no la estructura del árbol.
      const esHoja = !tieneSub;
      items.push({
        codigo: clave,
        nombre: typeof datos.nombre === "string" ? datos.nombre : clave,
        linea,
        esHoja,
        tieneInicio: typeof inicio === "string" && RE_FECHA.test(inicio.trim()),
        pred: tokensDePredecesoras(datos.predecesoras),
      });
      caminar(sub, _nivel + 1);
    }
  };
  caminar(raiz, 0);

  // reglas por tarea (mismas restricciones de resolver-fechas-hoja / cpm)
  for (const t of items) {
    if (t.esHoja) {
      if (!t.tieneInicio) {
        if (!cpm) {
          d.push({
            linea: t.linea,
            mensaje: `La tarea '${t.codigo}' no tiene 'inicio' ni subtareas de las que heredar fechas`,
            severidad: "error",
          });
        } else if (t.pred.length === 0) {
          d.push({
            linea: t.linea,
            mensaje: `Con cpm activo, la tarea '${t.codigo}' necesita 'inicio' o 'predecesoras'`,
            severidad: "error",
          });
        }
      }
    }
    for (const tok of t.pred) {
      if (!tok.trim()) {
        d.push({ linea: t.linea, mensaje: `Predecesora vacía en '${t.codigo}'`, severidad: "aviso" });
        continue;
      }
      const base = tok.split(":")[0].trim();
      if (base === t.codigo) {
        d.push({
          linea: t.linea,
          mensaje: `La tarea '${t.codigo}' no puede precederse a sí misma`,
          severidad: "error",
        });
      } else if (!codigosVistos.has(base) && !idsVistos.has(base)) {
        d.push({
          linea: t.linea,
          mensaje: `La predecesora '${base}' de '${t.codigo}' no existe`,
          severidad: "error",
        });
      }
    }
  }

  for (const inc of inconsistenciasFechas(texto)) {
    d.push({
      linea: inc.linea,
      mensaje:
        `'${inc.codigo}' tiene 'termino' ${inc.termino} que no coincide con duracion ${inc.duracion}: ` +
        `duracion ${inc.duracionCalculada} (si vale el termino) o termino ${inc.terminoCalculado} (si vale la duracion)`,
      severidad: "aviso",
      correccion: { codigo: inc.codigo, duracionCalculada: inc.duracionCalculada },
    });
  }

  return d.sort((a, b) => a.linea - b.linea);
}

// Devuelve un id `t<n>` que no colisiona con ningún id ni código existente.
export function idLibre(texto: string): string {
  const usados = new Set<string>();
  try {
    const doc = parseDocument(texto);
    const rec = (seq: unknown): void => {
      if (!isSeq(seq)) return;
      for (const n of seq.items) {
        if (!isMap(n)) continue;
        const d = n.toJSON() as Record<string, unknown>;
        if (typeof d.codigo === "string") usados.add(d.codigo);
        if (typeof d.id === "string") usados.add(d.id);
        rec(n.get("subtareas", true));
      }
    };
    rec(doc.get("tareas", true));
  } catch {
    // sin documento parseable: se asumen inexistentes
  }
  let n = 1;
  while (usados.has(`t${n}`)) n++;
  return `t${n}`;
}