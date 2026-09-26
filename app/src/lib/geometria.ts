// geometria.ts — Tipos de la geometría del render SVG nativo de la carta.
// La geometría la produce layout-gantt.ts al dibujar; aquí solo se declaran
// los contratos que usan la interacción (selección, arrastre, resaltado).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  codigo?: string;
}

export interface Banda {
  y0: number;
  y1: number;
  codigo: string;
}

export interface Geometria {
  ancho: number;
  alto: number;
  bandas: Banda[];
  barras: Rect[];
  hoy?: number;
  /** X final de la tabla de tareas (arranque de la línea de tiempo). */
  tablaX?: number;
  /** Altura del encabezado (años/meses/semanas/días) en unidades del SVG. */
  altoEncabezado: number;
  /** Ventana temporal de la carta: días julianos visibles (para mapear px↔día). */
  dias?: { inicio: number; fin: number };
  /** Cabecera del calendario (sobre la primera banda), en el área de la línea de tiempo. */
  calendario?: { x0: number; y0: number; y1: number };
  /** Cabecera de las columnas de datos (a la izquierda del calendario). */
  columnas?: { x0: number; x1: number; y0: number; y1: number };
  /**
   * Celdas de TODAS las columnas visibles (nombre, editables y derivadas) en
   * orden de fila: `indice` = fila (mismo orden que `bandas`), `campo` = clave
   * de columna o "nombre", `editable` = se edita con doble clic (tiene campo
   * en el YAML), `x0`/`x1` = extensión horizontal de la celda y `codigo` = la
   * actividad realmente dibujada en esa fila (poda incluida).
   * La interacción debe resolverse por `codigo`, nunca por índice contra otra
   * lista (listarTareas puede diverger con `ocultar-subtareas`/colapso).
   */
  celdas?: { indice: number; campo: string; codigo: string; editable: boolean; x0: number; x1: number }[];
}