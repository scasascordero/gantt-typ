import { parseDocument, isSeq, isMap } from "yaml";

export interface Tarea {
  id: string;
  nombre: string;
  linea: number;
  nivel: number;
  predecesoras: string[];
  // valores crudos del nodo (tipo YAML resuelto por toJSON): para mostrar y
  // editar en la tabla. Ausente si la tarea no declara el campo.
  inicio?: unknown;
  termino?: unknown;
  duracion?: unknown;
  avance?: unknown;
}

function tokensDePredecesoras(valor: unknown): string[] {
  if (typeof valor === "string") {
    return valor
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(valor)) {
    return valor.map((x) => String(x)).filter(Boolean);
  }
  return [];
}

export function listarTareas(texto: string): Tarea[] {
  try {
    const doc = parseDocument(texto);
    if (doc.errors.length > 0) return [];
    const nodoTareas = doc.get("tareas", true);
    if (!isSeq(nodoTareas)) return [];
    const resultado: Tarea[] = [];
    const aplanar = (nodo: unknown, nivel: number): void => {
      if (!isMap(nodo)) return;
      // `toJSON()` resuelve los campos a valores JS de forma uniforme
      // (el get() directo de nodos devuelve colecciones crudas según el estilo).
      const datos = nodo.toJSON() as Record<string, unknown>;
      const codigo = datos.codigo;
      const nombre = datos.nombre;
      const linea = texto.slice(0, nodo.range ? nodo.range[0] : 0).split("\n").length;
      if (typeof codigo === "string") {
        resultado.push({
          id: codigo,
          nombre: typeof nombre === "string" ? nombre : String(codigo),
          linea,
          nivel,
          predecesoras: tokensDePredecesoras(datos.predecesoras),
          inicio: datos.inicio,
          termino: datos.termino,
          duracion: datos.duracion,
          avance: datos.avance,
        });
      }
      // con `ocultar-subtareas: true` la librería no dibuja el subárbol:
      // hay que saltarlo también acá para que el clic siga filando justo
      if (datos["ocultar-subtareas"] === true) return;
      const sub = nodo.get("subtareas", true);
      if (isSeq(sub)) for (const item of sub.items) aplanar(item, nivel + 1);
    };
    for (const item of nodoTareas.items) aplanar(item, 0);
    return resultado;
  } catch {
    return [];
  }
}