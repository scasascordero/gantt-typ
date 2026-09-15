// excelImport.ts — convierte una matriz de celdas (.xlsx, leída por el
// comando Rust `leer_excel_celdas`) al YAML de la librería. Detecta la fila
// de encabezados entre nombres conocidos, mapea columnas y, si faltan campos
// importantes, avisa para abrir el diálogo de mapeo manual.

export interface CeldaExcel {
  texto: string | null;
  numero: number | null;
  fecha: string | null;
}
export type MatrizExcel = (CeldaExcel | null)[][];

export interface ColumnasExcel {
  codigo: number | null;
  nombre: number | null;
  inicio: number | null;
  termino: number | null;
  avance: number | null;
  predecesoras: number | null;
  nivel: number | null;
}

export interface Deteccion {
  filaEncabezado: number;
  encabezados: string[];
  columnas: ColumnasExcel;
  dudas: string[];
}

const ALIASES: Record<keyof ColumnasExcel, readonly string[]> = {
  codigo: ["codigo", "codigo wbs", "wbs", "id", "cod"],
  nombre: ["nombre", "tarea", "name", "actividad", "descripcion", "titulo"],
  inicio: ["inicio", "comienzo", "start", "fecha inicio", "inicio plan"],
  termino: ["termino", "fin", "end", "finish", "fecha fin", "fecha de fin"],
  avance: ["avance", "%", "% avance", "progreso", "progress", "completado", "porcentaje", "pct"],
  predecesoras: ["predecesoras", "predecessors", "pred", "secuencia", "dependencias"],
  nivel: ["nivel", "nivel wbs", "outline", "jerarquia", "level"],
};

export function textoCelda(c: CeldaExcel | null): string {
  if (!c) return "";
  return c.texto ?? c.fecha ?? (c.numero != null ? String(c.numero) : "");
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function campoDe(header: string): keyof ColumnasExcel | null {
  const n = norm(header);
  for (const campo of Object.keys(ALIASES) as (keyof ColumnasExcel)[]) {
    if (ALIASES[campo].some((a) => n === norm(a))) return campo;
  }
  return null;
}

export function detectarColumnas(matriz: MatrizExcel): Deteccion {
  let filaEncabezado = -1;
  let encabezados: string[] = [];
  for (let i = 0; i < matriz.length; i++) {
    const textos = (matriz[i] ?? []).map(textoCelda);
    const aciertos = textos.filter((t) => campoDe(t) !== null).length;
    if (aciertos >= 2) {
      filaEncabezado = i;
      encabezados = textos;
      break;
    }
  }
  if (filaEncabezado < 0) {
    filaEncabezado = 0;
    encabezados = (matriz[0] ?? []).map(() => "?");
  }

  const columnas: ColumnasExcel = {
    codigo: null,
    nombre: null,
    inicio: null,
    termino: null,
    avance: null,
    predecesoras: null,
    nivel: null,
  };
  encabezados.forEach((h, j) => {
    const campo = campoDe(h);
    if (campo && columnas[campo] === null) columnas[campo] = j;
  });

  const dudas: string[] = [];
  for (const campo of ["nombre", "inicio", "avance"] as const) {
    if (columnas[campo] === null) {
      dudas.push(campo);
    }
  }
  return { filaEncabezado, encabezados, columnas, dudas };
}

function aFecha(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(t)) {
    const [a, m, d] = t.split("/");
    return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const año = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${año}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  }
  return null;
}

function aAvance(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let n = parseFloat(t.replace("%", "").replace(",", "."));
  if (Number.isNaN(n)) return null;
  if (n < 0) n = 0;
  if (n > 100) n = 100;
  if (t.endsWith("%")) return `${Math.round(n)}%`;
  if (n <= 1) return `${Math.round(n * 100)}%`;
  return `${Math.round(n)}%`;
}

function esc(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

interface FilaImportada {
  ref: string; // código original (columna `codigo`, o número de fila si falta)
  auto: boolean;
  nombre: string;
  inicio: string | null;
  termino: string | null;
  avance: string | null;
  preds: string[];
  nivel: number;
}

interface Nodo {
  f: FilaImportada;
  codigo: string;
  hijos: Nodo[];
}

export function excelAYaml(
  matriz: MatrizExcel,
  det: Deteccion,
  columnas: ColumnasExcel,
): string {
  // 1) filas en orden documento
  const filas: FilaImportada[] = [];
  let autoN = 1;
  for (let i = det.filaEncabezado + 1; i < matriz.length; i++) {
    const fila = matriz[i] ?? [];
    const val = (j: number | null) => (j == null ? "" : textoCelda(fila[j] ?? null));
    const nombre = val(columnas.nombre).trim();
    if (!nombre) continue;

    let ref = val(columnas.codigo).trim();
    const auto = !ref;
    if (auto) ref = String(autoN);
    autoN++;

    const raw = val(columnas.predecesoras);
    const preds = raw.trim()
      ? raw.split(/[,;]|\s+/).map((s) => s.trim()).filter(Boolean)
      : [];

    filas.push({
      ref,
      auto,
      nombre,
      inicio: aFecha(val(columnas.inicio)),
      termino: aFecha(val(columnas.termino)),
      avance: aAvance(val(columnas.avance)),
      preds,
      nivel: columnas.nivel != null ? parseInt(val(columnas.nivel), 10) || 1 : 1,
    });
  }

  // 2) árbol por nivel (orden documento = preorden)
  const raices: Nodo[] = [];
  const pila: Nodo[] = [];
  for (const f of filas) {
    while (pila.length && pila[pila.length - 1].f.nivel >= f.nivel) pila.pop();
    const nodo: Nodo = { f, codigo: "", hijos: [] };
    if (pila.length) pila[pila.length - 1].hijos.push(nodo);
    else raices.push(nodo);
    pila.push(nodo);
  }

  // 3) códigos punteados en preorden (solo autos; los del usuario se respetan)
  const finalPorRef: Record<string, string> = {};
  let contador: number[] = [];
  const asignar = (nods: Nodo[], prof: number, ruta: string) => {
    for (const n of nods) {
      contador[prof] = (contador[prof] ?? 0) + 1;
      const autoCod = prof === 0 ? String(contador[prof]) : `${ruta}.${contador[prof]}`;
      n.codigo = n.f.auto ? autoCod : n.f.ref;
      if (n.f.auto) finalPorRef[n.f.ref] = n.codigo;
      asignar(n.hijos, prof + 1, autoCod);
    }
  };
  asignar(raices, 0, "");

  // 4) predecesoras → código final (las que referencian filas autos)
  const resolver = (nods: Nodo[]) => {
    for (const n of nods) {
      n.f.preds = n.f.preds
        .map((p) => finalPorRef[p] ?? p)
        .filter((p, idx, arr) => p && arr.indexOf(p) === idx);
      resolver(n.hijos);
    }
  };
  resolver(raices);

  // 5) emitir YAML en el formato de la librería
  const out: string[] = [`# importado de Excel`, "tareas:"];
  const emitir = (nods: Nodo[], prof: number) => {
    const item = "  ".repeat(prof + 1);
    const campo = `${item}  `;
    for (const n of nods) {
      out.push(`${item}- codigo: ${esc(n.codigo)}`);
      out.push(`${campo}nombre: ${esc(n.f.nombre)}`);
      if (n.f.inicio) out.push(`${campo}inicio: ${esc(n.f.inicio)}`);
      if (n.f.termino && n.f.termino !== n.f.inicio) out.push(`${campo}termino: ${esc(n.f.termino)}`);
      if (n.f.avance) out.push(`${campo}avance: ${esc(n.f.avance)}`);
      if (n.f.preds.length) {
        out.push(
          n.f.preds.length === 1
            ? `${campo}predecesoras: ${esc(n.f.preds[0])}`
            : `${campo}predecesoras: [${n.f.preds.map(esc).join(", ")}]`,
        );
      }
      if (n.hijos.length) {
        out.push(`${campo}subtareas:`);
        emitir(n.hijos, prof + 1);
      }
    }
  };
  emitir(raices, 0);
  return out.join("\n") + "\n";
}