// layout-gantt.ts — Render SVG nativo de la carta Gantt para la vista de
// edición. Port fiel del layout de lib/gantt.typ a TypeScript: bandas del
// calendario, columnas de datos, filas, barras, avance, dependencias, marco
// y línea de hoy se calculan aquí mismo y se emiten a SVG sin pasar por el
// compilador Typst. La impresión/exportación sigue usando Typst con los
// mismos datos (mismo contrato de `config:`), así que los dos renders
// comparten parámetros y modelo; aquí solo cambia el motor de dibujo.

import type { Fila } from "./modelo";
import { aDias, diasDesdeEpoca, fechaDesdeDias } from "./fechas";
import type { Geometria } from "./geometria";
import type { Valor } from "./params";

const PX_PT = 96 / 72;
const PX_CM = 96 / 2.54;
const pt = (v: number) => v * PX_PT;
const cm = (v: number) => v * PX_CM;

type Params = Record<string, Valor>;

export interface VistaGantt {
  svg: string;
  /** Solo con `soloLineaTiempo`: SVG de la cabecera del calendario (queda fija al hacer scroll); `svg` lleva el resto en las mismas coordenadas. */
  svgCabecera?: string;
  geometria: Geometria;
  milis: number;
}

const NOMBRES_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// --- Pequeñas utilidades ----------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function aNumero(v: Valor, def: number): number {
  const n = typeof v === "number" ? v : Number(String(v));
  return Number.isFinite(n) ? n : def;
}

function aBoolean(v: Valor, def: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
}

function aTriestado(v: Valor, autoValor: boolean): boolean {
  if (v === "auto") return autoValor;
  return aBoolean(v, autoValor);
}

function hexAparsear(s: string): { r: number; g: number; b: number } {
  const h = s.trim().replace(/^#/, "");
  const n = parseInt(h.padEnd(6, "0").slice(0, 6), 16);
  if (!Number.isFinite(n)) return { r: 100, g: 116, b: 139 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function cor(s: string): string {
  const h = s.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "#64748b";
  return "#" + h.toLowerCase();
}

function aclarar(hex: string, pct: number): string {
  const c = hexAparsear(hex);
  const m = (v: number) => Math.round(v + (255 - v) * pct);
  const p2s = (v: number) => v.toString(16).padStart(2, "0");
  return "#" + p2s(m(c.r)) + p2s(m(c.g)) + p2s(m(c.b));
}

// Medición de texto con el lienzo oculto (misma idea que `measure` de Typst):
// solo útil para el ancho automático de columnas; la impresión usa Typst.
let ctx2d: CanvasRenderingContext2D | null = null;
function medir(t: string, sizePx: number, peso: string, estilo: string, fam: string): number {
  if (ctx2d === null) {
    const c = document.createElement("canvas");
    ctx2d = c.getContext("2d");
  }
  if (!ctx2d) return t.length * sizePx * 0.6;
  ctx2d.font = `${estilo} ${peso} ${sizePx}px "${fam}", sans-serif`;
  return ctx2d.measureText(t).width;
}

// --- Segmentos de calendario (mismo algoritmo que fechas.typ) ---------------

function mesesEnRango(diaMin: number, diaMax: number): { anio: number; mes: number; inicio: number; fin: number }[] {
  const seg: { anio: number; mes: number; inicio: number; fin: number }[] = [];
  let f0 = fechaDesdeDias(diaMin);
  let anio = f0.anio;
  let mes = f0.mes;
  for (;;) {
    const inicioMes = diasDesdeEpoca(anio, mes, 1);
    const [sigAnio, sigMes] = mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
    const finMes = diasDesdeEpoca(sigAnio, sigMes, 1) - 1;
    const iniClip = Math.max(inicioMes, diaMin);
    const finClip = Math.min(finMes, diaMax);
    seg.push({ anio, mes, inicio: iniClip, fin: finClip });
    if (finMes >= diaMax) break;
    anio = sigAnio;
    mes = sigMes;
  }
  return seg;
}

function aniosEnRango(diaMin: number, diaMax: number): { anio: number; inicio: number; fin: number }[] {
  const seg: { anio: number; inicio: number; fin: number }[] = [];
  let anio = fechaDesdeDias(diaMin).anio;
  for (;;) {
    const inicioAnio = diasDesdeEpoca(anio, 1, 1);
    const finAnio = diasDesdeEpoca(anio + 1, 1, 1) - 1;
    seg.push({ anio, inicio: Math.max(inicioAnio, diaMin), fin: Math.min(finAnio, diaMax) });
    if (finAnio >= diaMax) break;
    anio += 1;
  }
  return seg;
}

function semanasEnRango(diaMin: number, diaMax: number): { indice: number; inicio: number; fin: number }[] {
  const seg: { indice: number; inicio: number; fin: number }[] = [];
  let inicio = diaMin;
  let indice = 1;
  while (inicio <= diaMax) {
    const fin = Math.min(inicio + 6, diaMax);
    seg.push({ indice, inicio, fin });
    inicio = fin + 1;
    indice += 1;
  }
  return seg;
}

function diasEnRango(diaMin: number, diaMax: number): { inicio: number; fin: number; numero: number }[] {
  const seg: { inicio: number; fin: number; numero: number }[] = [];
  for (let d = diaMin; d <= diaMax; d++) {
    seg.push({ inicio: d, fin: d, numero: fechaDesdeDias(d).dia });
  }
  return seg;
}

export function formatearFecha(z: number): string {
  const f = fechaDesdeDias(z);
  return `${String(f.dia).padStart(2, "0")}-${String(f.mes).padStart(2, "0")}-${f.anio}`;
}

function formatearImporte(v: number): string {
  const r = Math.round(v * 100) / 100;
  const entero = Math.floor(r);
  const frac = Math.round((r - entero) * 100);
  const fs = frac === 0 ? "" : frac < 10 ? ",0" + frac : "," + frac;
  const digs = String(Math.trunc(Math.abs(entero)));
  let out = "";
  for (let i = 0; i < digs.length; i++) {
    out += digs[i];
    if (i < digs.length - 1 && ((digs.length - 1 - i) % 3) === 0) out += ".";
  }
  return (entero < 0 ? "-" : "") + out + fs;
}

// --- Textos de las columnas (compartidos por el SVG y la tabla HTML) ---------

export const ETIQUETAS: Record<string, string> = {
  duracion: "Duración",
  inicio: "Inicio",
  termino: "Término",
  avance: "Avance",
  cantidad: "Cantidad",
  unidad: "Unidad",
  "costo-unitario": "C.U.",
  costo: "Costo",
  holgura: "Holgura",
  critico: "Crít.",
  "inicio-temprano": "Ini. temp.",
  "termino-temprano": "Fin. temp.",
  "inicio-tardio": "Ini. tardío",
  "termino-tardio": "Fin. tardío",
};

// Columnas cuyo valor se edita escribiendo un campo del YAML (el resto son
// derivadas: costo, holgura, crítico, fechas tempranas/tardías).
export const COL_CAMPO: Record<string, string> = {
  duracion: "duracion",
  inicio: "inicio",
  termino: "termino",
  avance: "avance",
  cantidad: "cantidad",
  unidad: "unidad",
  "costo-unitario": "costo-unitario",
};

// Números y fechas van alineados a la derecha; la duración, el texto (unidad)
// y la marca de crítico quedan centrados.
export function esColumnaDerecha(col: string): boolean {
  return col !== "duracion" && col !== "unidad" && col !== "critico";
}

export function valorColumna(f: Fila, col: string): string {
  switch (col) {
    case "duracion":
      return String(f.duracion);
    case "inicio":
      return formatearFecha(f.inicioDias);
    case "termino":
      return formatearFecha(f.terminoDias);
    case "avance":
      return Math.round(f.avance * 100) + "%";
    case "cantidad":
      return f.cantidad == null ? "" : formatearImporte(f.cantidad);
    case "unidad":
      return f.unidad ?? "";
    case "costo-unitario":
      return f.costoUnitario == null ? "" : formatearImporte(f.costoUnitario);
    case "costo":
      return f.costo == null ? "" : formatearImporte(f.costo);
    case "holgura":
      return f.holgura == null ? "" : String(f.holgura);
    case "critico":
      return f.critico ? "C" : "";
    case "inicio-temprano":
      return f.holgura == null ? "" : formatearFecha(f.inicioDias);
    case "termino-temprano":
      return f.holgura == null ? "" : formatearFecha(f.terminoDias);
    case "inicio-tardio":
      return f.holgura == null ? "" : formatearFecha(f.inicioDias + f.holgura);
    case "termino-tardio":
      return f.holgura == null ? "" : formatearFecha(f.terminoDias + f.holgura);
    default:
      return "";
  }
}

// --- El render principal ----------------------------------------------------

export function dibujarGantt(
  filas: Fila[],
  p: Params,
  resaltar?: string,
  opts?: {
    /** Pantalla: el SVG lleva solo calendario + barras; la tabla (nombre y columnas) es HTML aparte. */
    soloLineaTiempo?: boolean;
    /** Ancho (px) disponible para tabla + línea de tiempo; con `soloLineaTiempo` la línea de tiempo llena el resto. */
    anchoDisponible?: number;
    /** Factor de zoom horizontal de la línea de tiempo (solo con `soloLineaTiempo`). */
    zoom?: number;
    /** Píxeles por día fijados a mano (al arrastrar el borde de una celda del calendario); manda sobre `anchoDisponible`. */
    anchoPorDia?: number;
  },
): VistaGantt {
  const t0 = performance.now();
  const solo = opts?.soloLineaTiempo === true;

  const fuente = String(p["fuente"] ?? "Liberation Sans");
  const tamanoFuente = pt(aNumero(p["tamano-fuente"], 8));
  const altoFilaPx = cm(aNumero(p["alto-fila"], 0.6));
  // En pantalla la sangría es la mitad: el nivel se distingue igual y ahorra
  // espacio a la izquierda (la impresión usa el valor completo).
  const indentPorNivel = cm(aNumero(p["indent-por-nivel"], 0.4)) * (solo ? 0.5 : 1);
  const colorGrupo = cor(String(p["color-grupo"] ?? "475569"));
  const colorTarea = cor(String(p["color-tarea"] ?? "2563eb"));
  const colorAvance = cor(String(p["color-avance"] ?? "6b7280"));
  const colorHito = cor(String(p["color-hito"] ?? "dc2626"));
  const colorTexto = cor(String(p["color-texto"] ?? "1e293b"));
  const colorRejilla = cor(String(p["color-rejilla"] ?? "e2e8f0"));
  const colorCalendario = cor(String(p["color-calendario"] ?? "f8fafc"));
  const colorHoy = cor(String(p["color-hoy"] ?? "dc2626"));
  const colorCritico = cor(String(p["color-critico"] ?? "dc2626"));
  const colorDependencia = cor(String(p["color-dependencia"] ?? "64748b"));

  const mostrarCodigo = aBoolean(p["mostrar-codigo"], true);
  const mostrarDuracion = aBoolean(p["mostrar-duracion"], false);
  const mostrarBarraGrupo = aBoolean(p["mostrar-barra-grupo"], true);
  const mostrarHoy = aBoolean(p["mostrar-hoy"], false);
  const mostrarDiaInicioSemana = aBoolean(p["mostrar-dia-inicio-semana"], false);
  const mostrarColumnas = Array.isArray(p["mostrar-columnas"])
    ? (p["mostrar-columnas"] as string[]).map((x) => String(x))
    : [];
  const mostrarSerieAvance = aBoolean(p["mostrar-serie-avance"], true);
  const mostrarAvance = aBoolean(p["mostrar-avance"], true);
  const resaltarCritico = aBoolean(p["resaltar-critico"], true);
  const mostrarDependencias = aBoolean(p["mostrar-dependencias"], true);
  const titulo = (() => {
    const s = String(p["titulo"] ?? "").trim();
    return s === "" ? null : s;
  })();

  // --- Filas visibles: poda de `ocultar-subtareas` + `mostrar-niveles` -----
  // (mismo contrato que preparar-tareas + mostrar-niveles de gantt.typ)
  let visibles: Fila[] = [];
  {
    const estado = new Map<string, { visible: boolean; ocultar: boolean }>();
    for (const f of filas) {
      const pe = f.padre ? estado.get(f.padre) : undefined;
      const visible = f.padre ? (pe?.visible ?? true) && !(pe?.ocultar ?? false) : true;
      estado.set(f.codigo, { visible, ocultar: f.ocultarSubtareas === true });
      if (visible) visibles.push(f);
    }
  }

  const niveles = p["mostrar-niveles"];
  if (niveles !== "auto") {
    const k = Math.max(1, Math.floor(Number(niveles)) || 1);
    const filtradas = visibles.filter((f) => f.nivel < k);
    visibles = filtradas.map((f, j) => {
      const tieneHijoVisible = j + 1 < filtradas.length && filtradas[j + 1].nivel === f.nivel + 1;
      return { ...f, esGrupo: tieneHijoVisible };
    });
  }

  if (visibles.length === 0) {
    return {
      svg: "",
      geometria: { ancho: 0, alto: 0, bandas: [], barras: [], tablaX: 0, altoEncabezado: 0, dias: { inicio: 0, fin: 0 } },
      milis: performance.now() - t0,
    };
  }

  // --- Medición del ancho de la columna de nombres --------------------------
  const regular = (s: string) => medir(s, tamanoFuente, "regular", "normal", fuente);
  let anchoNombreFinal: number;
  const anchoNombreParam = p["ancho-nombre"];
  if (anchoNombreParam !== "auto") {
    anchoNombreFinal = cm(aNumero(anchoNombreParam, 8));
  } else {
    const negrita = (s: string) => medir(s, tamanoFuente, "bold", "normal", fuente);
    const maxAncho = visibles.reduce((acc, f) => {
      const etiqueta = (mostrarCodigo && f.codigo !== "" ? f.codigo + ". " : "") + f.nombre;
      const ancho = f.nivel === 0 || f.negrita ? negrita(etiqueta) : regular(etiqueta);
      return Math.max(acc, ancho + f.nivel * indentPorNivel);
    }, 0);
    anchoNombreFinal = maxAncho + cm(0.9);
  }
  // Anchos enteros: las columnas caen en píxeles exactos y los bordes de la
  // tabla HTML (celdas y cabecera) coinciden sin desfase de 1px.
  anchoNombreFinal = Math.round(anchoNombreFinal);

  // --- Columnas de datos opcionales -----------------------------------------
  const bold = (s: string) => medir(s, tamanoFuente, "bold", "normal", fuente);

  const anchosColumnas = mostrarColumnas.map((col) => {
    // El título puede partirse en líneas: basta el ancho de su palabra más larga.
    const anchoEtiqueta = Math.max(...(ETIQUETAS[col] ?? col).split(" ").map(bold));
    const anchoValores = visibles.reduce((acc, f) => Math.max(acc, regular(valorColumna(f, col))), 0);
    return Math.round(Math.max(anchoEtiqueta, anchoValores) + cm(0.5));
  });
  const colXInicios: number[] = [];
  {
    let acc = anchoNombreFinal;
    for (const a of anchosColumnas) {
      colXInicios.push(acc);
      acc += a;
    }
  }
  const anchoTabla = anchoNombreFinal + anchosColumnas.reduce((a, b) => a + b, 0);

  // --- Ventana temporal -----------------------------------------------------
  let diaMin: number | null = null;
  let diaMax: number | null = null;
  try {
    const vi = aDias(p["ventana-inicio"]);
    const vf = aDias(p["ventana-fin"]);
    if (vi !== null) diaMin = vi;
    if (vf !== null) diaMax = vf;
  } catch {
    // fechas inválidas de la UI: se ignora y cae al mínimo/máximo de los datos
  }
  if (diaMin === null) diaMin = Math.min(...visibles.map((f) => f.inicioDias));
  if (diaMax === null) diaMax = Math.max(...visibles.map((f) => f.terminoDias));
  if (diaMax < diaMin) diaMax = diaMin;
  // Con una escala fijada a mano (arrastrando el borde de una celda del
  // calendario) que deja el calendario más angosto que el espacio disponible, se
  // muestran más meses después de la ventana hasta llenarlo (la ventana visible
  // no se respeta como tope). Se completa hasta el fin de mes.
  if (solo && opts?.anchoPorDia !== undefined && opts.anchoDisponible !== undefined) {
    const necesarios = Math.ceil((opts.anchoDisponible - anchoTabla) / opts.anchoPorDia);
    if (necesarios > diaMax - diaMin + 1) {
      const f = fechaDesdeDias(diaMin + necesarios - 1);
      const [anioSig, mesSig] = f.mes === 12 ? [f.anio + 1, 1] : [f.anio, f.mes + 1];
      diaMax = diasDesdeEpoca(anioSig, mesSig, 1) - 1;
    }
  }
  const totalDias = diaMax - diaMin + 1;

  const meses = mesesEnRango(diaMin, diaMax);
  const mostrarAnio = aTriestado(p["nivel-anio"], new Set(meses.map((m) => m.anio)).size > 1);
  const mostrarMes = aTriestado(p["nivel-mes"], true);
  const mostrarSemana = aTriestado(p["nivel-semana"], totalDias <= 200);
  const mostrarDia = aTriestado(p["nivel-dia"], totalDias <= 45);
  const anios = mostrarAnio ? aniosEnRango(diaMin, diaMax) : [];
  const semanas = mostrarSemana ? semanasEnRango(diaMin, diaMax) : [];
  const dias = mostrarDia ? diasEnRango(diaMin, diaMax) : [];


  const anchoLineaTiempoParam = p["ancho-linea-tiempo"];
  const anchoLineaTiempo =
    solo && opts?.anchoPorDia !== undefined
      ? opts.anchoPorDia * totalDias
      : solo && opts?.anchoDisponible !== undefined
      ? Math.max(cm(6), opts.anchoDisponible - anchoTabla) * (opts.zoom ?? 1)
      : (anchoLineaTiempoParam === "auto" || anchoLineaTiempoParam == null
          ? cm(20)
          : cm(aNumero(anchoLineaTiempoParam, 20))) * (solo ? (opts?.zoom ?? 1) : 1);
  const xIni = solo ? 0 : anchoTabla;
  const anchoTotal = xIni + anchoLineaTiempo;

  const anchoPorDia = anchoLineaTiempo / totalDias;

  const altoBandaAnio = mostrarAnio ? cm(0.4) : 0;
  const altoBandaSemana = mostrarSemana ? cm(0.4) : 0;
  const altoBandaDia = mostrarDia ? cm(0.4) : 0;
  // En pantalla los títulos de columna con espacio ("Ini. temp.") se parten
  // en dos líneas: la cabecera necesita al menos esa altura; el extra lo toma
  // la banda de meses para que el calendario siga llenando la cabecera.
  const altoMinEncabezado =
    solo && mostrarColumnas.some((c) => (ETIQUETAS[c] ?? c).includes(" ")) ? cm(0.8) : 0;
  const altoBandaMes = mostrarMes
    ? cm(0.5) + Math.max(0, altoMinEncabezado - (altoBandaAnio + cm(0.5) + altoBandaSemana + altoBandaDia))
    : 0;
  const altoEncabezado = altoBandaAnio + altoBandaMes + altoBandaSemana + altoBandaDia;
  const altoFilas = visibles.length * altoFilaPx;
  const y0 = altoEncabezado;

  // Caja del título (como gantt.typ: sobre el dibujo, ancho completo). En modo
  // solo línea de tiempo no se dibuja (queda para la vista de impresión).
  const tituloSize = tamanoFuente + pt(5);
  const altoTitulo = titulo && !solo ? tituloSize * 1.25 : 0;
  const huecoTitulo = titulo && !solo ? cm(0.35) : 0;
  const yDesp = altoTitulo + huecoTitulo;
  const altoTotal = yDesp + altoEncabezado + altoFilas;

  const xDe = (dia: number): number => xIni + ((dia - diaMin) / totalDias) * anchoLineaTiempo;

  const trazoVertical = pt(0.4);
  const separadorHorizontal = pt(0.3);

  // ---- Emisión SVG ---------------------------------------------------------
  const out: string[] = [];
  const defs: string[] = [];

  const linea = (x1: number, y1: number, x2: number, y2: number, color: string, ancho: number) =>
    `<line x1="${fmt(x1)}" y1="${fmt(y1)}" x2="${fmt(x2)}" y2="${fmt(y2)}" stroke="${color}" stroke-width="${fmt(ancho)}" stroke-linecap="square"/>`;

  const rect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    fill?: string | null,
    trazo?: string | null,
    anchoTrazo?: number,
    radio?: number,
  ) =>
    `<rect x="${fmt(Math.min(x1, x2))}" y="${fmt(Math.min(y1, y2))}" width="${fmt(Math.abs(x2 - x1))}" height="${fmt(Math.abs(y2 - y1))}"` +
    `${radio ? ` rx="${fmt(radio)}"` : ""}` +
    ` fill="${fill ?? "none"}"` +
    `${trazo ? ` stroke="${trazo}" stroke-width="${fmt(anchoTrazo ?? 1)}"` : ""}/>`;

  const texto = (
    x: number,
    y: number,
    contenido: string,
    opts: { size?: number; peso?: string; estilo?: string; relleno?: string; halign?: "inicio" | "medio" | "fin" } = {},
  ) => {
    const size = opts.size ?? tamanoFuente;
    const ancla = opts.halign === "inicio" ? "start" : opts.halign === "fin" ? "end" : "middle";
    return (
      `<text x="${fmt(x)}" y="${fmt(y)}" font-size="${fmt(size)}" font-family="${esc(fuente)}"` +
      `${opts.peso ? ` font-weight="${opts.peso}"` : ""}` +
      `${opts.estilo ? ` font-style="${opts.estilo}"` : ""}` +
      ` fill="${opts.relleno ?? colorTexto}" text-anchor="${ancla}" dominant-baseline="central">${esc(contenido)}</text>`
    );
  };

  const rombo = (x: number, y: number, r: number, relleno: string) =>
    `<path d="M ${fmt(x)} ${fmt(y - r)} L ${fmt(x + r)} ${fmt(y)} L ${fmt(x)} ${fmt(y + r)} L ${fmt(x - r)} ${fmt(y)} Z" fill="${relleno}"/>`;

  // Barra de avance: bloque simple o serie en zigzag (paridad dibujar-avance).
  const barraAvance = (
    x1Real: number,
    x2Real: number,
    x1: number,
    x2: number,
    yCentro: number,
    altoB: number,
    avance: number,
    avanceSerie: number[] | null | undefined,
  ) => {
    if (avanceSerie && avanceSerie.length > 0) {
      const anchoReal = x2Real - x1Real;
      const altoSeg = altoB / 4;
      let acumulado = 0;
      for (let i = 0; i < avanceSerie.length; i++) {
        const segX1 = Math.max(x1Real + anchoReal * acumulado, x1);
        acumulado += avanceSerie[i];
        const segX2 = Math.min(x1Real + anchoReal * acumulado, x2);
        if (segX2 > segX1) {
          const ySeg = i % 2 === 0 ? yCentro - altoSeg : yCentro;
          out.push(rect(segX1, ySeg, segX2, ySeg + altoSeg, colorAvance, null, 0, pt(1)));
        }
      }
    } else if (avance > 0) {
      const altoAvance = altoB / 3;
      const yAvance = yCentro - altoAvance / 2;
      const xAvance = Math.min(Math.max(x1Real + (x2Real - x1Real) * avance, x1), x2);
      out.push(rect(x1, yAvance, xAvance, yAvance + altoAvance, colorAvance, null, 0, pt(1)));
    }
  };

  const colorFila = (f: Fila): string => {
    if (f.critico && resaltarCritico) return colorCritico;
    if (f.esGrupo) return colorGrupo;
    return colorTarea;
  };

  const dibujarBarraDesde = (
    f: Fila,
    x1: number,
    x2: number,
    yCentro: number,
    altoB: number,
  ) => {
    const base = colorFila(f);
    const fmtb = f.formatoBarra;
    if (fmtb === "contorno") {
      out.push(rect(x1, yCentro - altoB / 2, x2, yCentro + altoB / 2, null, base, pt(0.8), pt(1.5)));
    } else if (fmtb === "gradiente") {
      const gid = `grad-${out.length}`;
      defs.push(
        `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">` +
          `<stop offset="0" stop-color="${aclarar(base, 0.55)}"/>` +
          `<stop offset="1" stop-color="${aclarar(base, 0.1)}"/>` +
          `</linearGradient>`,
      );
      out.push(rect(x1, yCentro - altoB / 2, x2, yCentro + altoB / 2, `url(#${gid})`, null, 0, pt(1.5)));
    } else if (fmtb === "rayas") {
      out.push(rect(x1, yCentro - altoB / 2, x2, yCentro + altoB / 2, aclarar(base, 0.78), null, 0, pt(1.5)));
      const paso = pt(4);
      for (let k = 0; k <= Math.floor((x2 - x1) / paso); k++) {
        const xs = x1 + k * paso;
        if (xs < x2 - pt(0.5)) {
          out.push(linea(xs, yCentro - altoB / 2 + pt(1.2), xs, yCentro + altoB / 2 - pt(1.2), base, pt(1.2)));
        }
      }
    } else if (f.esGrupo) {
      out.push(rect(x1, yCentro - altoB / 2, x2, yCentro + altoB / 2, null, base, pt(0.6), pt(1.5)));
    } else {
      out.push(rect(x1, yCentro - altoB / 2, x2, yCentro + altoB / 2, aclarar(base, 0.35), null, 0, pt(1.5)));
    }
  };

  const celdasCalendario: { x0: number; x1: number; y0: number; y1: number; dias: number }[] = [];
  const celdaCal = (inicio: number, fin: number, y0c: number, y1c: number) =>
    celdasCalendario.push({ x0: xDe(inicio), x1: xDe(fin + 1), y0: y0c, y1: y1c, dias: fin - inicio + 1 });

  // --- Encabezado: bandas de calendario -------------------------------------
  // Banda de años.
  if (mostrarAnio) {
    for (const a of anios) {
      const x1 = xDe(a.inicio);
      const x2 = xDe(a.fin + 1);
      celdaCal(a.inicio, a.fin, 0, altoBandaAnio);
      out.push(rect(x1, 0, x2, altoBandaAnio, colorCalendario, colorRejilla, pt(0.4)));
      out.push(texto((x1 + x2) / 2, altoBandaAnio / 2, String(a.anio), { peso: "bold" }));
    }
  }
  // Banda de meses.
  if (mostrarMes) {
    const nombresCaben = meses.every(
      (m) => medir(NOMBRES_MES[m.mes - 1] ?? "", tamanoFuente, "bold", "normal", fuente) + pt(3) <= xDe(m.fin + 1) - xDe(m.inicio),
    );
    for (const m of meses) {
      const x1 = xDe(m.inicio);
      const x2 = xDe(m.fin + 1);
      celdaCal(m.inicio, m.fin, altoBandaAnio, altoBandaAnio + altoBandaMes);
      out.push(rect(x1, altoBandaAnio, x2, altoBandaAnio + altoBandaMes, colorCalendario, colorRejilla, pt(0.4)));
      // Si algún nombre no cabe en su celda, toda la banda usa la inicial (un
      // criterio único, no una mezcla); si ni la inicial cabe en la celda, se omite.
      const nombreMes = NOMBRES_MES[m.mes - 1] ?? "";
      const cabeEn = (t: string, ancho: number) => medir(t, tamanoFuente, "bold", "normal", fuente) + pt(3) <= ancho;
      const etiquetaMes = nombresCaben ? nombreMes : cabeEn(nombreMes.charAt(0), x2 - x1) ? nombreMes.charAt(0) : "";
      if (etiquetaMes) out.push(texto((x1 + x2) / 2, altoBandaAnio + altoBandaMes / 2, etiquetaMes, { peso: "bold" }));
    }
  }
  // Banda de semanas.
  if (mostrarSemana) {
    for (const s of semanas) {
      const x1 = xDe(s.inicio);
      const x2 = xDe(s.fin + 1);
      const yTop = altoBandaAnio + altoBandaMes;
      celdaCal(s.inicio, s.fin, yTop, yTop + altoBandaSemana);
      out.push(rect(x1, yTop, x2, yTop + altoBandaSemana, colorCalendario, colorRejilla, pt(0.4)));
      if (mostrarDiaInicioSemana) {
        const diaInicio = fechaDesdeDias(s.inicio).dia;
        out.push(
          texto(x1 + cm(0.06), yTop + altoBandaSemana / 2, String(diaInicio), {
            size: tamanoFuente * 0.65,
            relleno: aclarar(colorTexto, 0.2),
            halign: "inicio",
          }),
        );
      } else {
        out.push(texto((x1 + x2) / 2, yTop + altoBandaSemana / 2, `S${s.indice}`, { size: tamanoFuente * 0.85 }));
      }
    }
  }
  // Banda de días (fondo único + líneas finas + números si caben).
  if (mostrarDia) {
    const yTop = altoBandaAnio + altoBandaMes + altoBandaSemana;
    out.push(rect(xIni, yTop, anchoTotal, yTop + altoBandaDia, colorCalendario, colorRejilla, pt(0.4)));
    for (const d of dias) {
      celdaCal(d.inicio, d.fin, yTop, yTop + altoBandaDia);
      out.push(linea(xDe(d.inicio), yTop, xDe(d.inicio), yTop + altoBandaDia, colorRejilla, trazoVertical));
      if (anchoPorDia >= cm(0.35)) {
        out.push(texto((xDe(d.inicio) + xDe(d.fin + 1)) / 2, yTop + altoBandaDia / 2, String(d.numero), { size: tamanoFuente * 0.75 }));
      }
    }
  }

  // --- Encabezados de las columnas de datos (solo con tabla) ----------------
  if (!solo) {
    for (let i = 0; i < mostrarColumnas.length; i++) {
      const col = mostrarColumnas[i];
      const cx1 = colXInicios[i];
      const cx2 = cx1 + anchosColumnas[i];
      out.push(rect(cx1, 0, cx2, altoEncabezado, null, colorRejilla, pt(0.4)));
      if (esColumnaDerecha(col)) {
        out.push(texto(cx2 - cm(0.12), altoEncabezado / 2, ETIQUETAS[col] ?? col, { peso: "bold", halign: "fin" }));
      } else {
        out.push(texto((cx1 + cx2) / 2, altoEncabezado / 2, ETIQUETAS[col] ?? col, { peso: "bold" }));
      }
    }
  }

  const nCabecera = out.length;

  // --- Rejilla vertical (solo el nivel más fino visible) --------------------
  {
    const finY = y0 + altoFilas;
    if (mostrarDia) {
      for (const d of dias) out.push(linea(xDe(d.inicio), altoEncabezado, xDe(d.inicio), finY, colorRejilla, trazoVertical));
    } else if (mostrarSemana) {
      for (const s of semanas) out.push(linea(xDe(s.inicio), altoEncabezado, xDe(s.inicio), finY, colorRejilla, trazoVertical));
    } else if (mostrarMes) {
      for (const m of meses) out.push(linea(xDe(m.inicio), altoEncabezado, xDe(m.inicio), finY, colorRejilla, trazoVertical));
    }
  }

  // --- Filas ----------------------------------------------------------------
  const bandas: { y0: number; y1: number; codigo: string }[] = [];
  const barras: { x: number; y: number; w: number; h: number; cx: number; cy: number; codigo: string }[] = [];
  const filasPorId = new Map<string, Fila>();
  const filasPorCodigo = new Map<string, Fila>();
  // Celdas de TODAS las columnas visibles (editables y derivadas) para que la
  // tabla HTML pueda replicar el área izquierda del SVG pixel a pixel.
  const celdas: { indice: number; campo: string; codigo: string; editable: boolean; x0: number; x1: number }[] = [];

  visibles.forEach((f, i) => {
    const yFilaTop = y0 + i * altoFilaPx;
    const yCentro = yFilaTop + altoFilaPx / 2;
    const yFilaBottom = yFilaTop + altoFilaPx;
    bandas.push({ y0: yFilaTop + yDesp, y1: yFilaBottom + yDesp, codigo: f.codigo });
    if (f.id) filasPorId.set(f.id, f);
    filasPorCodigo.set(f.codigo, f);

    celdas.push({ indice: i, campo: "nombre", codigo: f.codigo, editable: true, x0: 0, x1: anchoNombreFinal });
    for (let j = 0; j < mostrarColumnas.length; j++) {
      const campo = COL_CAMPO[mostrarColumnas[j]];
      celdas.push({
        indice: i,
        campo: campo ?? mostrarColumnas[j],
        codigo: f.codigo,
        editable: campo != null,
        x0: colXInicios[j],
        x1: colXInicios[j] + anchosColumnas[j],
      });
    }

    // Nivel de texto por fila (paridad gantt.typ): negrita manual o nivel 0.
    const peso = f.negrita === true ? "bold" : f.negrita === false ? "regular" : f.nivel === 0 ? "bold" : "regular";
    const estilo = f.italica === true ? "italic" : "normal";
    const rellenoTxt = f.colorTexto ? cor(String(f.colorTexto)) : colorTexto;

    const xNombre = f.nivel * indentPorNivel + cm(0.15);
    if (!solo) {
      const prefijo = mostrarCodigo && f.codigo !== "" ? f.codigo + ". " : "";
      out.push(texto(xNombre, yCentro, prefijo + f.nombre, { peso, estilo, relleno: rellenoTxt, halign: "inicio" }));

      for (let j = 0; j < mostrarColumnas.length; j++) {
        const col = mostrarColumnas[j];
        const cx1 = colXInicios[j];
        const cx2 = cx1 + anchosColumnas[j];
        const valor = valorColumna(f, col);
        if (esColumnaDerecha(col)) {
          out.push(texto(cx2 - cm(0.12), yCentro, valor, { peso, estilo, relleno: rellenoTxt, halign: "fin" }));
        } else {
          out.push(texto((cx1 + cx2) / 2, yCentro, valor, { peso, estilo, relleno: rellenoTxt }));
        }
      }
    }

    const x1Real = xDe(f.inicioDias);
    const x2Real = xDe(f.terminoDias + 1);
    const fueraDeVentana = x2Real <= xIni || x1Real >= anchoTotal;
    const x1 = Math.max(x1Real, xIni);
    const x2 = Math.min(x2Real, anchoTotal);
    const dibujarBarra = !f.esGrupo || mostrarBarraGrupo;
    const avanceSerie = mostrarSerieAvance ? (f.avanceSerie ?? null) : null;

    if (!fueraDeVentana) {
      const altoB = altoFilaPx * 0.62;
      if (f.hito) {
        out.push(rombo((x1 + x2) / 2, yCentro, altoFilaPx * 0.28, colorHito));
      } else if (f.esGrupo) {
        if (dibujarBarra) {
          dibujarBarraDesde(f, x1, x2, yCentro, altoB);
          if (mostrarAvance) barraAvance(x1Real, x2Real, x1, x2, yCentro, altoB, f.avance, avanceSerie);
          barras.push({ x: x1, y: yCentro - altoB / 2 + yDesp, w: x2 - x1, h: altoB, cx: (x1 + x2) / 2, cy: yCentro + yDesp, codigo: f.codigo });
        }
      } else {
        dibujarBarraDesde(f, x1, x2, yCentro, altoB);
        if (mostrarAvance) barraAvance(x1Real, x2Real, x1, x2, yCentro, altoB, f.avance, avanceSerie);
        barras.push({ x: x1, y: yCentro - altoB / 2 + yDesp, w: x2 - x1, h: altoB, cx: (x1 + x2) / 2, cy: yCentro + yDesp, codigo: f.codigo });
      }
    }

    if (mostrarDuracion && !f.hito && !fueraDeVentana && x2Real <= anchoTotal) {
      out.push(texto(x2Real + cm(0.1), yCentro, `${f.duracion}d`, { size: tamanoFuente * 0.85, peso, estilo, relleno: rellenoTxt, halign: "inicio" }));
    }

    out.push(linea(0, yFilaBottom, anchoTotal, yFilaBottom, colorRejilla, separadorHorizontal));
  });

  // --- Dependencias (conectores ortogonales, sobre las barras) ---------------
  // Cada conector sale y llega por el borde que corresponde al tipo de
  // dependencia (fs: fin→inicio, ss: inicio→inicio, ff: fin→fin, sf:
  // inicio→fin), con un tramo recto corto antes de girar. Si no hay espacio
  // para el giro directo rodea la barra por el margen entre filas. Esquinas
  // redondeadas y punta rellena; la ruta crítica va en rojo y los conectores de
  // la fila seleccionada (que entran o salen de ella) se resaltan.
  function yCentroDe(f: Fila): number {
    const i = visibles.indexOf(f);
    if (i === -1) return 0;
    return y0 + i * altoFilaPx + altoFilaPx / 2 + yDesp;
  }

  const rutaRedondeada = (puntos: [number, number][], radio: number): string => {
    // sin puntos repetidos (segmentos de largo 0)
    const pts = puntos.filter((q, k) => k === 0 || q[0] !== puntos[k - 1][0] || q[1] !== puntos[k - 1][1]);
    let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
    for (let k = 1; k < pts.length - 1; k++) {
      const [x0, y0p] = pts[k - 1];
      const [x1, y1] = pts[k];
      const [x2, y2] = pts[k + 1];
      const l1 = Math.hypot(x1 - x0, y1 - y0p);
      const l2 = Math.hypot(x2 - x1, y2 - y1);
      const rr = Math.min(radio, l1 / 2, l2 / 2);
      if (rr < 0.2) {
        d += ` L ${fmt(x1)} ${fmt(y1)}`;
        continue;
      }
      const ax = x1 - ((x1 - x0) / l1) * rr;
      const ay = y1 - ((y1 - y0p) / l1) * rr;
      const bx = x1 + ((x2 - x1) / l2) * rr;
      const by = y1 + ((y2 - y1) / l2) * rr;
      d += ` L ${fmt(ax)} ${fmt(ay)} Q ${fmt(x1)} ${fmt(y1)} ${fmt(bx)} ${fmt(by)}`;
    }
    const ult = pts[pts.length - 1];
    return d + ` L ${fmt(ult[0])} ${fmt(ult[1])}`;
  };

  if (mostrarDependencias) {
    const rHito = altoFilaPx * 0.28;
    const hueco = pt(4.5);
    const radioEsquina = pt(2.5);
    const largoPunta = pt(4);
    const mediaPunta = pt(2.2);
    // x del borde izquierdo ("ini") o derecho ("fin") de la barra o el rombo de la fila
    const extremo = (f: Fila, lado: "ini" | "fin"): number =>
      f.hito
        ? xDe(f.inicioDias) + (lado === "fin" ? rHito : -rHito)
        : lado === "ini"
          ? xDe(f.inicioDias)
          : xDe(f.terminoDias + 1);

    for (const g of visibles) {
      for (const dep of g.predecesoras) {
        const pred = filasPorId.get(dep.pred) ?? filasPorCodigo.get(dep.pred);
        if (!pred || !visibles.includes(pred)) continue;
        const tipo = dep.tipo;
        const saleDe = tipo === "fs" || tipo === "ff" ? "fin" : "ini";
        const llegaA = tipo === "fs" || tipo === "ss" ? "ini" : "fin";
        const ox = extremo(pred, saleDe);
        const sx = extremo(g, llegaA);
        if (ox < xIni || ox > anchoTotal || sx < xIni || sx > anchoTotal) continue;
        const yp = yCentroDe(pred);
        const ys = yCentroDe(g);
        const d1 = saleDe === "fin" ? 1 : -1; // hacia dónde sale de la predecesora
        const d2 = llegaA === "ini" ? -1 : 1; // por qué lado entra a la sucesora
        const p1x = ox + d1 * hueco;
        const p2x = sx + d2 * hueco;

        let puntos: [number, number][];
        if (tipo === "fs" ? p1x <= p2x : tipo !== "sf") {
          // giro directo: sale, baja/sube en una vertical y entra
          const xm = tipo === "fs" ? p1x : tipo === "ff" ? Math.max(p1x, p2x) : Math.min(p1x, p2x);
          puntos = [[ox, yp], [xm, yp], [xm, ys], [sx, ys]];
        } else {
          // sin espacio: rodea por el margen de la fila de la sucesora
          const yb = ys - (ys > yp ? 1 : -1) * altoFilaPx * 0.42;
          puntos = [[ox, yp], [p1x, yp], [p1x, yb], [p2x, yb], [p2x, ys], [sx, ys]];
        }

        const enfocada = resaltar !== undefined && (g.codigo === resaltar || pred.codigo === resaltar);
        const critica = resaltarCritico && pred.critico === true && g.critico === true;
        const c = enfocada ? colorTarea : critica ? colorCritico : colorDependencia;
        const w = enfocada ? pt(1.3) : pt(0.8);
        out.push(
          `<path d="${rutaRedondeada(puntos, radioEsquina)}" fill="none" stroke="${c}" stroke-width="${fmt(w)}" stroke-linejoin="round" stroke-linecap="round"/>`,
        );
        const bx = sx + d2 * largoPunta;
        out.push(
          `<path d="M ${fmt(sx)} ${fmt(ys)} L ${fmt(bx)} ${fmt(ys - mediaPunta)} L ${fmt(bx)} ${fmt(ys + mediaPunta)} Z" fill="${c}"/>`,
        );
      }
    }
  }

  // --- Separadores y marco ---------------------------------------------------
  if (!solo) {
    out.push(linea(anchoNombreFinal, 0, anchoNombreFinal, y0 + altoFilas, colorRejilla, trazoVertical));
    for (const x of colXInicios.slice(1)) {
      out.push(linea(x, 0, x, y0 + altoFilas, colorRejilla, trazoVertical));
    }
    if (mostrarColumnas.length > 0) {
      out.push(linea(anchoTabla, 0, anchoTabla, y0 + altoFilas, colorRejilla, trazoVertical));
    }
  }
  out.push(linea(xIni, 0, anchoTotal, 0, colorRejilla, trazoVertical));
  out.push(linea(0, y0, solo ? anchoTotal : anchoNombreFinal, y0, colorRejilla, trazoVertical));
  out.push(linea(0, y0, 0, y0 + altoFilas, colorRejilla, trazoVertical));
  out.push(linea(anchoTotal, 0, anchoTotal, y0 + altoFilas, colorRejilla, trazoVertical));
  out.push(linea(0, y0 + altoFilas, anchoTotal, y0 + altoFilas, colorRejilla, trazoVertical));

  // --- Línea de hoy ----------------------------------------------------------
  let geometriaHoy: number | undefined;
  if (mostrarHoy) {
    const ahora = new Date();
    const diaHoy = diasDesdeEpoca(ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate());
    if (diaHoy >= diaMin && diaHoy <= diaMax) {
      const xHoy = (xDe(diaHoy) + xDe(diaHoy + 1)) / 2;
      out.push(linea(xHoy, y0, xHoy, y0 + altoFilas, colorHoy, pt(1)));
      geometriaHoy = xHoy;
    }
  }

  // --- Título y ensamblado ---------------------------------------------------
  // Con `solo`, la cabecera del calendario va en su propio SVG (fija al hacer
  // scroll) y el cuerpo conserva las mismas coordenadas, con esa franja vacía.
  const cuerpo =
    `<g transform="translate(0 ${fmt(yDesp)})">` + (solo ? out.slice(nCabecera) : out).join("") + `</g>`;
  const svgCabecera = solo
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(anchoTotal)} ${fmt(altoEncabezado)}" width="${fmt(anchoTotal)}" height="${fmt(altoEncabezado)}" font-family="${esc(fuente)}">` +
      out.slice(0, nCabecera).join("") +
      linea(xIni, 0, anchoTotal, 0, colorRejilla, trazoVertical) +
      linea(0, altoEncabezado, anchoTotal, altoEncabezado, colorRejilla, trazoVertical) +
      `</svg>`
    : undefined;
  const tituloHtml =
    titulo === null || solo
      ? ""
      : `<text x="${fmt(anchoTotal / 2)}" y="${fmt(altoTitulo / 2)}" font-size="${fmt(tituloSize)}" font-weight="bold" font-family="${esc(fuente)}" fill="${colorTexto}" text-anchor="middle" dominant-baseline="central">${esc(titulo)}</text>`;
  const defsHtml = defs.length ? `<defs>${defs.join("")}</defs>` : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(anchoTotal)} ${fmt(altoTotal)}" width="${fmt(anchoTotal)}" height="${fmt(altoTotal)}" font-family="${esc(fuente)}">` +
    defsHtml +
    tituloHtml +
    cuerpo +
    `</svg>`;

  const geometria: Geometria = {
    ancho: anchoTotal,
    alto: altoTotal,
    bandas,
    barras,
    hoy: geometriaHoy,
    tablaX: xIni,
    anchoTabla,
    sangria: indentPorNivel,
    altoEncabezado,
    dias: { inicio: diaMin, fin: diaMax },
    calendario: { x0: xIni, y0: yDesp, y1: yDesp + altoEncabezado },
    celdasCalendario: celdasCalendario.map((c) => ({ ...c, y0: c.y0 + yDesp, y1: c.y1 + yDesp })),
    columnas:
      mostrarColumnas.length > 0
        ? { x0: anchoNombreFinal, x1: anchoTabla, y0: yDesp, y1: yDesp + altoEncabezado }
        : undefined,
    celdas,
  };

  return { svg, svgCabecera, geometria, milis: performance.now() - t0 };
}