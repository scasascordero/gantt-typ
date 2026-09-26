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

  // Catálogo de recursos (`recursos:` en la raíz): diccionario de llaves a
  // {tipo?, nombre?, medida?, precio}. `precio` debe evaluar a un número o
  // fórmula; actividades sin `precio` inline resuelven el suyo desde acá.
  // El mapa queda disponible para las tareas vía `catalogoPrecio`.
  const catalogoPrecio = new Map<string, boolean>();
  const seccionCatalogo = doc.get("recursos", true);
  if (seccionCatalogo != null) {
    const lineaCatalogo = nroLinea(texto, (seccionCatalogo as { range?: [number, number] | null }).range?.[0] ?? null);
    if (!isMap(seccionCatalogo)) {
      d.push({
        linea: lineaCatalogo,
        mensaje: "'recursos' de la raíz debe ser un diccionario llave -> {tipo?, nombre?, medida?, precio}",
        severidad: "error",
      });
    } else {
      const catalogoJson = seccionCatalogo.toJSON() as Record<string, unknown>;
      for (const [llave, valor] of Object.entries(catalogoJson)) {
        if (valor == null || typeof valor !== "object") {
          d.push({
            linea: lineaCatalogo,
            mensaje: `'recursos.${llave}' debe ser un mapa con 'precio'`,
            severidad: "aviso",
          });
          catalogoPrecio.set(llave, false);
          continue;
        }
        const precio = (valor as Record<string, unknown>).precio;
        if (precio == null || precio === "") {
          d.push({
            linea: lineaCatalogo,
            mensaje: `'recursos.${llave}' no tiene 'precio'`,
            severidad: "aviso",
          });
          catalogoPrecio.set(llave, false);
        } else if (numeroOFormula(precio) == null) {
          d.push({
            linea: lineaCatalogo,
            mensaje: `'recursos.${llave}': el 'precio' no evalúa a un número o fórmula válida (ej: "45000", "2*22500")`,
            severidad: "aviso",
          });
          catalogoPrecio.set(llave, false);
        } else {
          catalogoPrecio.set(llave, true);
        }
      }
    }
  }

  interface Item {
    codigo: string;
    nombre: string;
    linea: number;
    esHoja: boolean;
    tieneInicio: boolean;
    pred: string[];
    padre: string | null;
  }
  const items: Item[] = [];
  const codigosVistos = new Map<string, number>();
  const idsVistos = new Map<string, string>(); // id -> codigo

  const caminar = (seq: unknown, _nivel: number, enRaiz: boolean, padre: string | null): void => {
    if (!isSeq(seq)) return;
    let primeraRaiz = enRaiz;
    for (const nodo of seq.items) {
      if (!isMap(nodo)) continue;
      const esProyecto = primeraRaiz;
      primeraRaiz = false;
      // `toJSON()` resuelve los campos a valores JS de forma uniforme
      // (el get() de nodos devuelve colecciones crudas según el estilo).
      const datos = nodo.toJSON() as Record<string, unknown>;
      const linea = nroLinea(texto, nodo.range ? nodo.range[0] : null);
      const codigo = datos.codigo;
      if (typeof codigo !== "string" || !codigo.trim()) {
        // La primera tarea de la raíz es el proyecto completo: no requiere un
        // número WBS (su código puede estar vacío o ausente).
        if (!esProyecto) {
          d.push({ linea, mensaje: "Tarea sin 'codigo'", severidad: "error" });
          continue;
        }
      }
      const clave = (typeof codigo === "string" ? codigo : "").trim();
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

      // `recursos` (APU): cada recurso necesita cantidad (numéricos o
      // fórmulas) y precio — inline o, si la entrada no trae `precio`, del
      // catálogo raíz `recursos:` por su llave/nombre. `rendimiento`, si
      // está, también debe evaluar a un número.
      const recursos = datos.recursos;
      if (recursos != null) {
        const llaveDe = (r: Record<string, unknown>): string =>
          typeof r.nombre === "string" ? r.nombre : clave;
        const entradas: { llave: string; obj: unknown }[] = Array.isArray(recursos)
          ? recursos.map((r) => ({ llave: r != null && typeof r === "object" ? llaveDe(r as Record<string, unknown>) : "", obj: r }))
          : Object.entries(recursos as object).map(([k, v]) => ({ llave: k, obj: v }));
        const sinCampos = entradas.filter(({ llave: rclave, obj }) => {
          if (obj == null || typeof obj !== "object") {
            // valor desnudo = solo cantidad; debe resolver el precio del catálogo.
            return !catalogoPrecio.has(rclave);
          }
          const o = obj as Record<string, unknown>;
          const resuelvePrecio = o.precio != null || catalogoPrecio.has(rclave);
          return o.cantidad == null || !resuelvePrecio;
        });
        const conCamposNoEvaluables = entradas.filter(({ obj }) => {
          if (obj == null || typeof obj !== "object") return false;
          const o = obj as Record<string, unknown>;
          const precioEvalua =
            o.precio == null || o.precio === "" || numeroOFormula(o.precio) != null;
          return (
            (o.cantidad != null && numeroOFormula(o.cantidad) == null) ||
            (o.rendimiento != null && o.rendimiento !== "" && numeroOFormula(o.rendimiento) == null) ||
            !precioEvalua
          );
        });
        if (sinCampos.length > 0) {
          d.push({
            linea,
            mensaje: `'${clave}': ${sinCampos.length} recurso(s) del APU sin 'cantidad' o sin 'precio' (ni en el catálogo 'recursos:')`,
            severidad: "aviso",
          });
        }
        if (conCamposNoEvaluables.length > 0) {
          d.push({
            linea,
            mensaje: `'${clave}': ${conCamposNoEvaluables.length} recurso(s) con 'cantidad', 'rendimiento' o 'precio' que no evaluan a un numero o formula valida (ej: "3*40", "(8+4)/2")`,
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
        padre,
      });
      caminar(sub, _nivel + 1, false, clave);
    }
  };
  caminar(raiz, 0, true, null);

  // ¿`codigo` está dentro de `ancestro` (a cualquier profundidad)?
  const padreDe = new Map(items.map((it) => [it.codigo, it.padre] as const));
  const estaDentroDe = (codigo: string, ancestro: string): boolean => {
    let p = padreDe.get(codigo) ?? null;
    while (p !== null) {
      if (p === ancestro) return true;
      p = padreDe.get(p) ?? null;
    }
    return false;
  };

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
      } else if (!t.esHoja) {
        // un grupo no puede depender de una de sus propias subtareas
        const codigoPred = codigosVistos.has(base) ? base : (idsVistos.get(base) ?? base);
        if (estaDentroDe(codigoPred, t.codigo)) {
          d.push({
            linea: t.linea,
            mensaje: `El grupo '${t.codigo}' no puede depender de su propia subtarea '${codigoPred}'`,
            severidad: "error",
          });
        }
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