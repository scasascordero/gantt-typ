// yamlOperaciones.ts — operaciones sobre el árbol de tareas del YAML que
// invoca el menú contextual del editor (botón derecho sobre el código de una
// actividad): mover, clonar, copiar, pegar, añadir y borrar. Toda operación
// renumerera los códigos y deja `ids` persistentes (backfill t<seq> cuando
// faltan), reescribiendo las `predecesoras` para que sigan apuntando al id.

import {
  parseDocument,
  isMap,
  isScalar,
  isSeq,
  type Document,
  type YAMLMap,
  type YAMLSeq,
} from "yaml";

export type Direccion = "subir" | "bajar" | "indentar" | "sacar";

interface Fila {
  nodo: YAMLMap;
  secuencia: YAMLSeq;
  tope: number;
  padre: YAMLMap | null;
  abuelo: YAMLSeq | null;
  codigo: string;
  id: string;
}

function raizTareas(doc: Document): YAMLSeq | null {
  const t = doc.get("tareas", true);
  return isSeq(t) ? t : null;
}

function codigoDe(n: YAMLMap): string {
  const v = n.get("codigo");
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function idDe(n: YAMLMap): string {
  const v = n.get("id");
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return codigoDe(n);
}

function igual(f: Fila, ref: string): boolean {
  return f.id === ref || f.codigo === ref;
}

function listar(
  secuencia: YAMLSeq,
  tope: number,
  padre: YAMLMap | null,
  abuelo: YAMLSeq | null,
  filas: Fila[],
): void {
  for (const item of secuencia.items) {
    if (!isMap(item)) continue;
    filas.push({
      nodo: item,
      secuencia,
      tope,
      padre,
      abuelo,
      codigo: codigoDe(item),
      id: idDe(item),
    });
    const sub = item.get("subtareas", true);
    if (isSeq(sub)) listar(sub, tope + 1, item, secuencia, filas);
  }
}

function filasDe(doc: Document): Fila[] {
  const r = raizTareas(doc);
  if (!r) return [];
  const filas: Fila[] = [];
  listar(r, 0, null, null, filas);
  return filas;
}

function localizar(doc: Document, ref: string): Fila | undefined {
  return filasDe(doc).find((f) => igual(f, ref));
}

function limpiarIds(n: YAMLMap): void {
  n.delete("id");
  const sub = n.get("subtareas", true);
  if (isSeq(sub)) for (const i of sub.items) if (isMap(i)) limpiarIds(i);
}

// Reordena códigos (1, 1.1, 1.2…) en orden de documento, completa los ids
// que falten y traduce las predecesoras al id efectivo de su destino.
function renumerar(doc: Document): void {
  const r = raizTareas(doc);
  if (!r) return;

  const actuales = filasDe(doc);
  const porCodigo = new Map<string, YAMLMap>();
  const porId = new Map<string, YAMLMap>();
  for (const f of actuales) {
    if (f.codigo) porCodigo.set(f.codigo, f.nodo);
    if (f.id) porId.set(f.id, f.nodo);
  }
  for (const f of actuales) {
    const pre = f.nodo.get("predecesoras");
    if (!isSeq(pre)) continue;
    let cambio = false;
    const nuevos: string[] = [];
    for (const s of pre.items) {
      const token = String(isScalar(s) ? s.value : s);
      const destino = porId.get(token) ?? porCodigo.get(token);
      if (!destino) {
        nuevos.push(token);
        continue;
      }
      const nuevoToken = idDe(destino);
      if (nuevoToken !== token) cambio = true;
      nuevos.push(nuevoToken);
    }
    if (cambio) f.nodo.set("predecesoras", doc.createNode(nuevos));
  }

  let contador = 0;
  const descender = (seq: YAMLSeq, nivel: number, numeros: number[]): void => {
    for (const item of seq.items) {
      if (!isMap(item)) continue;
      contador += 1;
      numeros[nivel] = (numeros[nivel] ?? 0) + 1;
      item.set("codigo", numeros.slice(0, nivel + 1).join("."));
      const idActual = item.get("id");
      if (typeof idActual !== "string" || idActual.length === 0) {
        item.set("id", `t${contador}`);
      }
      const sub = item.get("subtareas", true);
      if (isSeq(sub)) descender(sub, nivel + 1, [...numeros.slice(0, nivel + 1), 0]);
    }
  };
  descender(r, 0, []);
}

function plantilla(doc: Document): YAMLMap {
  return doc.createNode({ nombre: "Nueva tarea" }) as YAMLMap;
}

function subtareas(n: YAMLMap, doc: Document): YAMLSeq {
  const sub = n.get("subtareas", true);
  if (isSeq(sub)) return sub;
  const nueva = doc.createNode([]) as YAMLSeq;
  n.set("subtareas", nueva);
  return nueva;
}

function operar(
  texto: string,
  accion: (doc: Document) => boolean,
): string {
  const doc = parseDocument(texto);
  if (doc.errors.length > 0 || !raizTareas(doc)) return texto;
  if (!accion(doc)) return texto;
  renumerar(doc);
  return doc.toString();
}

export function moverTareas(texto: string, ref: string, dir: Direccion): string {
  return operar(texto, (doc) => {
    const fila = localizar(doc, ref);
    if (!fila) return false;
    const { nodo, secuencia, padre, abuelo } = fila;
    if (dir === "subir" || dir === "bajar") {
      const i = secuencia.items.indexOf(nodo);
      const j = i + (dir === "subir" ? -1 : 1);
      if (i < 0 || j < 0 || j >= secuencia.items.length) return false;
      secuencia.items[i] = secuencia.items[j];
      secuencia.items[j] = nodo;
    } else if (dir === "indentar") {
      const i = secuencia.items.indexOf(nodo);
      if (i <= 0) return false;
      const hermano = secuencia.items[i - 1];
      if (!isMap(hermano)) return false;
      secuencia.items.splice(i, 1);
      subtareas(hermano, doc).items.push(nodo);
    } else if (dir === "sacar") {
      if (!padre || !abuelo) return false;
      const i = secuencia.items.indexOf(nodo);
      const j = abuelo.items.indexOf(padre);
      if (i < 0 || j < 0) return false;
      secuencia.items.splice(i, 1);
      abuelo.items.splice(j + 1, 0, nodo);
    }
    return true;
  });
}

export function clonarTarea(texto: string, ref: string): string {
  return operar(texto, (doc) => {
    const fila = localizar(doc, ref);
    if (!fila) return false;
    const clon = doc.createNode(fila.nodo.toJSON()) as YAMLMap;
    limpiarIds(clon);
    const i = fila.secuencia.items.indexOf(fila.nodo);
    fila.secuencia.items.splice(i + 1, 0, clon);
    return true;
  });
}

export function borrarTarea(texto: string, ref: string): string {
  return operar(texto, (doc) => {
    const fila = localizar(doc, ref);
    if (!fila) return false;
    const i = fila.secuencia.items.indexOf(fila.nodo);
    fila.secuencia.items.splice(i, 1);
    return true;
  });
}

export function anadirHermana(texto: string, ref: string | null): string {
  return operar(texto, (doc) => {
    const nueva = plantilla(doc);
    const fila = ref ? localizar(doc, ref) : undefined;
    if (fila) {
      const i = fila.secuencia.items.indexOf(fila.nodo);
      fila.secuencia.items.splice(i + 1, 0, nueva);
    } else {
      const r = raizTareas(doc);
      if (!r) return false;
      r.items.push(nueva);
    }
    return true;
  });
}

export function anadirSubtarea(texto: string, ref: string): string {
  return operar(texto, (doc) => {
    const fila = localizar(doc, ref);
    if (!fila) return false;
    subtareas(fila.nodo, doc).items.push(plantilla(doc));
    return true;
  });
}

// Copia la tarea completa (con su subárbol) como texto YAML válido.
export function copiarTarea(texto: string, ref: string): string {
  const doc = parseDocument(texto);
  if (doc.errors.length > 0) return "";
  const fila = localizar(doc, ref);
  if (!fila) return "";
  const bloque = `- ${String(fila.nodo)}`;
  if (parseDocument(bloque).errors.length > 0) return "";
  return bloque;
}

// Inserta la copia (una o más tareas) después del destino y renumera.
export function pegarTareas(texto: string, copiado: string, ref: string | null): string {
  if (!copiado.trim()) return texto;
  const src = parseDocument(copiado);
  if (src.errors.length > 0) return texto;
  const items: YAMLMap[] = [];
  if (isSeq(src.contents)) {
    for (const i of src.contents.items) if (isMap(i)) items.push(i);
  } else if (isMap(src.contents)) {
    items.push(src.contents);
  }
  if (items.length === 0) return texto;
  return operar(texto, (doc) => {
    const fila = ref ? localizar(doc, ref) : undefined;
    const r = raizTareas(doc);
    if (!r) return false;
    const seq = fila ? fila.secuencia : r;
    const idx = fila ? seq.items.indexOf(fila.nodo) + 1 : seq.items.length;
    for (const s of items) {
      const clon = doc.createNode(s.toJSON()) as YAMLMap;
      limpiarIds(clon);
      seq.items.splice(idx, 0, clon);
    }
    return true;
  });
}