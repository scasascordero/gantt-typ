// params.ts — Catálogo de parámetros de `carta-gantt` y generador de la
// plantilla principal (/main.typ) para el preview y el export PDF.

export type Valor = boolean | number | string | string[];

export type TipoParam =
  | "color"
  | "bool"
  | "numero"
  | "texto"
  | "fecha"
  | "triestado"
  | "opciones"
  | "columnas"
  | "auto-longitud"
  | "auto-entero";

export interface ParamDef {
  clave: string;
  etiqueta: string;
  grupo: string;
  tipo: TipoParam;
  unidad?: string;
  opciones?: string[];
  columnas?: { clave: string; etiqueta: string }[];
  manual?: string;
  defecto: Valor;
  ayuda?: string;
}

const COLUMNAS = [
  { clave: "duracion", etiqueta: "Duración" },
  { clave: "inicio", etiqueta: "Inicio" },
  { clave: "termino", etiqueta: "Término" },
  { clave: "avance", etiqueta: "Avance" },
  { clave: "cantidad", etiqueta: "Cantidad" },
  { clave: "unidad", etiqueta: "Unidad" },
  { clave: "costo-unitario", etiqueta: "Costo unitario" },
  { clave: "costo", etiqueta: "Costo" },
  { clave: "holgura", etiqueta: "Holgura" },
  { clave: "critico", etiqueta: "Crítico" },
  { clave: "inicio-temprano", etiqueta: "Inicio temprano" },
  { clave: "termino-temprano", etiqueta: "Término temprano" },
  { clave: "inicio-tardio", etiqueta: "Inicio tardío" },
  { clave: "termino-tardio", etiqueta: "Término tardío" },
];

export const PARAMETROS: ParamDef[] = [
  // --- General -----------------------------------------------------------------
  {
    clave: "titulo",
    etiqueta: "Título",
    grupo: "General",
    tipo: "texto",
    defecto: "",
    ayuda: "Título opcional arriba de la carta (vacío = ninguno)",
  },
  {
    clave: "pagina",
    etiqueta: "Página propia",
    grupo: "General",
    tipo: "bool",
    defecto: true,
    ayuda: "true: página autodimensionada | false: se inserta en el flujo del documento",
  },
  {
    clave: "margenes",
    etiqueta: "Márgenes",
    grupo: "General",
    tipo: "bool",
    defecto: false,
    ayuda: "Rodea la carta con el margen configurado (false = vista ajustada)",
  },
  { clave: "margen", etiqueta: "Margen", grupo: "General", tipo: "numero", unidad: "cm", defecto: 1 },
  { clave: "alto-fila", etiqueta: "Alto de fila", grupo: "General", tipo: "numero", unidad: "cm", defecto: 0.6 },
  {
    clave: "indent-por-nivel",
    etiqueta: "Indentación por nivel",
    grupo: "General",
    tipo: "numero",
    unidad: "cm",
    defecto: 0.4,
  },
  {
    clave: "ancho-nombre",
    etiqueta: "Ancho columna nombres",
    grupo: "General",
    tipo: "auto-longitud",
    unidad: "cm",
    manual: "8",
    defecto: "auto",
  },
  {
    clave: "ancho-linea-tiempo",
    etiqueta: "Ancho línea de tiempo",
    grupo: "General",
    tipo: "auto-longitud",
    unidad: "cm",
    manual: "20",
    defecto: "auto",
  },

  // --- Texto -------------------------------------------------------------------
  {
    clave: "fuente",
    etiqueta: "Fuente",
    grupo: "Texto",
    tipo: "texto",
    defecto: "Liberation Sans",
  },
  { clave: "tamano-fuente", etiqueta: "Tamaño de fuente", grupo: "Texto", tipo: "numero", unidad: "pt", defecto: 8 },
  {
    clave: "mostrar-codigo",
    etiqueta: "Mostrar código",
    grupo: "Texto",
    tipo: "bool",
    defecto: true,
    ayuda: "Antepone 'codigo. ' al nombre",
  },
  {
    clave: "mostrar-duracion",
    etiqueta: "Mostrar duración",
    grupo: "Texto",
    tipo: "bool",
    defecto: false,
    ayuda: "Muestra 'Nd' a la derecha de cada barra",
  },
  {
    clave: "mostrar-barra-grupo",
    etiqueta: "Barra de grupo",
    grupo: "Texto",
    tipo: "bool",
    defecto: true,
    ayuda: "Dibuja la barra resumen de tareas con subtareas",
  },
  {
    clave: "mostrar-serie-avance",
    etiqueta: "Avance por período (arriba/abajo)",
    grupo: "Avance",
    tipo: "bool",
    defecto: true,
    ayuda: "Dibuja la serie de avance como bloques contiguos en patrón zigzag; false: un solo bloque con el avance total",
  },
  {
    clave: "mostrar-avance",
    etiqueta: "Mostrar barra de avance",
    grupo: "Avance",
    tipo: "bool",
    defecto: true,
    ayuda: "Dibuja la barra de avance dentro de cada tarea",
  },
  {
    clave: "mostrar-niveles",
    etiqueta: "Niveles visibles",
    grupo: "Texto",
    tipo: "auto-entero",
    opciones: ["auto", "1", "2", "3", "4", "5"],
    defecto: "auto",
    ayuda: "Cuántos niveles de jerarquía mostrar; el resto se oculta",
  },

  // --- Colores -----------------------------------------------------------------
  { clave: "color-grupo", etiqueta: "Grupo", grupo: "Colores", tipo: "color", defecto: "475569" },
  { clave: "color-tarea", etiqueta: "Tarea", grupo: "Colores", tipo: "color", defecto: "2563eb" },
  { clave: "color-avance", etiqueta: "Barra de avance", grupo: "Colores", tipo: "color", defecto: "6b7280" },
  { clave: "color-hito", etiqueta: "Hito", grupo: "Colores", tipo: "color", defecto: "dc2626" },
  { clave: "color-texto", etiqueta: "Texto", grupo: "Colores", tipo: "color", defecto: "1e293b" },
  { clave: "color-rejilla", etiqueta: "Rejilla", grupo: "Colores", tipo: "color", defecto: "e2e8f0" },
  { clave: "color-calendario", etiqueta: "Calendario", grupo: "Colores", tipo: "color", defecto: "f8fafc" },
  { clave: "color-hoy", etiqueta: "Hoy", grupo: "Colores", tipo: "color", defecto: "dc2626" },
  { clave: "color-critico", etiqueta: "Ruta crítica", grupo: "Colores", tipo: "color", defecto: "dc2626" },
  { clave: "color-dependencia", etiqueta: "Dependencia", grupo: "Colores", tipo: "color", defecto: "64748b" },

  // --- Calendario --------------------------------------------------------------
  {
    clave: "ventana-inicio",
    etiqueta: "Ventana inicio",
    grupo: "Calendario",
    tipo: "fecha",
    defecto: "",
    ayuda: "vacío = mínimo de los datos",
  },
  {
    clave: "ventana-fin",
    etiqueta: "Ventana fin",
    grupo: "Calendario",
    tipo: "fecha",
    defecto: "",
    ayuda: "vacío = máximo de los datos",
  },
  { clave: "nivel-anio", etiqueta: "Nivel año", grupo: "Calendario", tipo: "triestado", defecto: "auto" },
  { clave: "nivel-mes", etiqueta: "Nivel mes", grupo: "Calendario", tipo: "triestado", defecto: "auto" },
  { clave: "nivel-semana", etiqueta: "Nivel semana", grupo: "Calendario", tipo: "triestado", defecto: "auto" },
  { clave: "nivel-dia", etiqueta: "Nivel día", grupo: "Calendario", tipo: "triestado", defecto: "auto" },
  {
    clave: "mostrar-dia-inicio-semana",
    etiqueta: "Día inicio de semana",
    grupo: "Calendario",
    tipo: "bool",
    defecto: false,
    ayuda: "Muestra el día del mes en que arranca cada semana",
  },
  {
    clave: "mostrar-hoy",
    etiqueta: "Línea de hoy",
    grupo: "Calendario",
    tipo: "bool",
    defecto: false,
    ayuda: "Línea vertical roja en la fecha de hoy",
  },

  // --- Columnas ----------------------------------------------------------------
  {
    clave: "mostrar-columnas",
    etiqueta: "Columnas de datos",
    grupo: "Columnas",
    tipo: "columnas",
    columnas: COLUMNAS,
    defecto: ["inicio", "termino", "duracion", "avance"],
  },

  // --- CPM y vínculos ----------------------------------------------------------
  {
    clave: "cpm",
    etiqueta: "CPM",
    grupo: "CPM y vínculos",
    tipo: "bool",
    defecto: false,
    ayuda: "Calcula fechas y ruta crítica desde predecesoras",
  },
  {
    clave: "inicio-proyecto",
    etiqueta: "Inicio proyecto",
    grupo: "CPM y vínculos",
    tipo: "fecha",
    defecto: "",
    ayuda: "vacío = se deduce de los datos",
  },
  {
    clave: "termino-proyecto",
    etiqueta: "Término proyecto",
    grupo: "CPM y vínculos",
    tipo: "fecha",
    defecto: "",
    ayuda: "vacío = se deduce de los datos",
  },
  {
    clave: "resaltar-critico",
    etiqueta: "Resaltar críticos",
    grupo: "CPM y vínculos",
    tipo: "bool",
    defecto: true,
    ayuda: "Pinta con color-critico las tareas de la ruta crítica",
  },
  {
    clave: "mostrar-dependencias",
    etiqueta: "Mostrar dependencias",
    grupo: "CPM y vínculos",
    tipo: "bool",
    defecto: true,
    ayuda: "Dibuja flechas entre predecesora y sucesora",
  },
  {
    clave: "esquema-vinculo",
    etiqueta: "Esquema de vínculo",
    grupo: "CPM y vínculos",
    tipo: "opciones",
    opciones: ["vscodium", "vscode"],
    defecto: "vscodium",
    ayuda: "Esquema del URI para abrir la línea en el editor",
  },
];

export function valoresDefault(): Record<string, Valor> {
  const r: Record<string, Valor> = {};
  for (const p of PARAMETROS) r[p.clave] = p.defecto;
  return r;
}

function entreComillas(v: string): string {
  return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

function formatoTyp(p: ParamDef, v: Valor): string {
  switch (p.tipo) {
    case "color":
      return `rgb("#${String(v)}")`;
    case "bool":
      return String(v);
    case "numero":
      return `${v}${p.unidad ?? ""}`;
    case "texto":
      return entreComillas(String(v));
    case "fecha":
      return v ? entreComillas(String(v)) : "none";
    case "triestado":
    case "auto-entero":
      return String(v);
    case "opciones":
      return entreComillas(String(v));
    case "columnas":
      return (v as string[]).length
        ? `(${(v as string[]).map(entreComillas).join(", ")})`
        : "()";
    case "auto-longitud":
      return v === "auto" ? "auto" : `${v}${p.unidad ?? ""}`;
  }
}

export function generarMainTyp(valores: Record<string, Valor>): string {
  const lineas = PARAMETROS.map((p) => {
    const v = p.clave in valores ? valores[p.clave] : p.defecto;
    return `  ${p.clave}: ${formatoTyp(p, v)},`;
  }).join("\n");

  return `#import "gantt.typ": *
#set page(margin: 20pt, width: auto, height: auto, fill: rgb("#ffffff"))
#let datos = yaml("datos.yaml")
#carta-gantt(
  datos,
  fechas-cpm: datos.at("fechas-cpm", default: none),
${lineas}
)`;
}