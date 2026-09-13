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
    return nodoTareas.items
      .map((item): Tarea | null => {
        if (!isMap(item)) return null;
        const inicio = item.range ? item.range[0] : 0;
        const id = item.get("id", true);
        const nombre = item.get("nombre", true);
        const linea = texto.slice(0, inicio).split("\n").length;
        if (typeof id !== "string") return null;
        return {
          id,
          nombre: typeof nombre === "string" ? nombre : String(id),
          linea,
        };
      })
      .filter((t): t is Tarea => t !== null);
  } catch {
    return [];
  }
}