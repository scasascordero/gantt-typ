import { parseDocument, isSeq, isMap } from "yaml";

export interface Tarea {
  id: string;
  nombre: string;
  linea: number;
}

export function listarTareas(texto: string): Tarea[] {
  try {
    const doc = parseDocument(texto);
    if (doc.errors.length > 0) return [];
    const nodoTareas = doc.get("tareas", true);
    if (!isSeq(nodoTareas)) return [];
    const resultado: Tarea[] = [];
    const aplanar = (nodo: unknown): void => {
      if (!isMap(nodo)) return;
      const codigo = nodo.get("codigo");
      const nombre = nodo.get("nombre");
      const linea = texto.slice(0, nodo.range ? nodo.range[0] : 0).split("\n").length;
      if (typeof codigo === "string") {
        resultado.push({
          id: codigo,
          nombre: typeof nombre === "string" ? nombre : String(codigo),
          linea,
        });
      }
      const sub = nodo.get("subtareas", true);
      if (isSeq(sub)) for (const item of sub.items) aplanar(item);
    };
    for (const item of nodoTareas.items) aplanar(item);
    return resultado;
  } catch {
    return [];
  }
}