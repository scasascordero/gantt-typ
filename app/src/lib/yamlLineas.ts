import { parseDocument, isSeq, isMap } from "yaml";

export interface Tarea {
  id: string;
  nombre: string;
  linea: number;
  nivel: number;
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
      const codigo = nodo.get("codigo");
      const nombre = nodo.get("nombre");
      const linea = texto.slice(0, nodo.range ? nodo.range[0] : 0).split("\n").length;
      if (typeof codigo === "string") {
        resultado.push({
          id: codigo,
          nombre: typeof nombre === "string" ? nombre : String(codigo),
          linea,
          nivel,
        });
      }
      // con `ocultar-subtareas: true` la librería no dibuja el subárbol:
      // hay que saltarlo también acá para que el clic siga filando justo
      if (nodo.get("ocultar-subtareas") === true) return;
      const sub = nodo.get("subtareas", true);
      if (isSeq(sub)) for (const item of sub.items) aplanar(item, nivel + 1);
    };
    for (const item of nodoTareas.items) aplanar(item, 0);
    return resultado;
  } catch {
    return [];
  }
}