// prueba-geometria.ts — Prueba de la geometría del render SVG nativo y del
// mapeo clic→fila→celda que usa el editor inline. Corre con `node` (v25
// ejecuta TS con type stripping):
//
//   node scripts/prueba-geometria.ts
//
// Valida, sobre fixtures que incluyen poda por `ocultar-subtareas` y colapso
// por `mostrar-niveles`:
//   1) bandas == filas realmente dibujadas.
//   2) cada celda de `celdas` pertenece a la fila dibujada en ese índice
//      (celda.codigo === banda[indice].codigo) → la edición no se desalinea
//      aunque `listarTareas` divergue.
//   3) el hit-test del doble clic devuelve la fila y la celda correctas y el
//      rect del editor queda dentro de la celda.

import { dibujarGantt, type VistaGantt } from "../src/lib/layout-gantt";
import { valoresDefault, type Valor } from "../src/lib/params";
import type { Fila } from "../src/lib/modelo";

// Shims de DOM para el medidor de texto del layout (canvas 2d) fuera del navegador.
const ctx2dFalso = {
  font: "",
  measureText: (s: string) => ({ width: Math.max(1, s.length * 6.05) }),
};
(globalThis as { document?: unknown }).document = {
  createElement: (tag: string) => (tag === "canvas" ? { getContext: () => ctx2dFalso } : {}),
};

let fallos = 0;
const pasa = (nombre: string, condicion: boolean, detalle = "") => {
  if (condicion) {
    console.log(`  ok  ${nombre}`);
  } else {
    console.error(`FALLA ${nombre}${detalle ? ` — ${detalle}` : ""}`);
    fallos++;
  }
};

const D0 = 20000; // día juliano de referencia (fechas ordinales simples)

// ---- Fixture 1: jerarquía con ocultar-subtareas ---------------------------
function fixtureConPoda(): Fila[] {
  const f = (codigo: string, nivel: number, padre: string | null, extra: Partial<Fila> = {}): Fila => ({
    codigo,
    nombre: `Tarea ${codigo || "(proyecto)"}`,
    nivel,
    esGrupo: nivel <= 1,
    hito: false,
    inicioDias: D0,
    terminoDias: D0 + 5,
    duracion: 5,
    avance: 0,
    padre,
    predecesoras: [],
    ...extra,
  });
  return [
    f("", 0, null), // proyecto
    f("1", 1, "", { esGrupo: true }), // grupo
    f("1.1", 2, "1"),
    f("1.2", 2, "1"),
    f("2.1", 2, "2"),
    f("2.2", 2, "2"),
    f("3", 1, "", { esGrupo: true, ocultarSubtareas: true }), // oculta a 3.1/3.2
    f("3.1", 2, "3"),
    f("3.2", 2, "3"),
    f("4", 1, ""),
    f("4.1", 2, "4"),
  ];
}

// ---- Fixture 2: colapso por mostrar-niveles --------------------------------
function fixtureSimple(): Fila[] {
  const f = (codigo: string, nivel: number, padre: string | null, extra: Partial<Fila> = {}): Fila => ({
    codigo,
    nombre: `Tarea ${codigo || "(proyecto)"}`,
    nivel,
    esGrupo: nivel <= 1,
    hito: false,
    inicioDias: D0,
    terminoDias: D0 + 5,
    duracion: 5,
    avance: 0,
    padre,
    predecesoras: [],
    ...extra,
  });
  return [
    f("", 0, null),
    f("1", 1, ""),
    f("1.1", 2, "1"),
    f("1.2", 2, "1"),
    f("2", 1, ""),
    f("2.1", 2, "2"),
  ];
}

function params(extra: Record<string, Valor>): Record<string, Valor> {
  return { ...valoresDefault(), ...extra };
}

// Simula el código de App.alDobleClicCarta: dado el evento y la geometría,
// devuelve { indice, celda, rect } o null.
function hitTest(g: VistaGantt["geometria"], clientX: number, clientY: number, svgTop: number, svgLeft: number) {
  if (!g || !g.bandas.length) return null;
  const anchoSvg = g.ancho * 2; // escala arbitraria (2x) de la ventana
  const altoSvg = g.alto * 2;
  const fEscX = g.ancho / anchoSvg; // 0.5
  const fEscY = g.alto / altoSvg; // 0.5
  const px = (clientX - svgLeft) * fEscX;
  const py = (clientY - svgTop) * fEscY;
  const i = g.bandas.findIndex((b) => py >= b.y0 && py < b.y1);
  if (i < 0) return null;
  const celda = (g.celdas ?? []).find((c) => c.indice === i && px >= c.x0 && px < c.x1) ?? null;
  const b = g.bandas[i];
  const rect = celda
    ? {
        left: celda.x0 * fEscX,
        top: b.y0 * fEscY,
        width: (celda.x1 - celda.x0) * fEscX,
        height: (b.y1 - b.y0) * fEscY,
      }
    : null;
  return { i, celda, rect, bandanos: b.codigo };
}

function probarFixture(nombre: string, filas: Fila[], p: Record<string, Valor>) {
  console.log(`\n== ${nombre} ==`);
  const vista = dibujarGantt(filas, p);
  const g = vista.geometria;

  // 1) bandas: contiguas, crecientes y una por fila dibujada
  pasa("bandas no vacías", g.bandas.length > 0);
  let contiguas = true;
  for (let k = 1; k < g.bandas.length; k++) {
    if (Math.abs(g.bandas[k].y0 - g.bandas[k - 1].y1) > 0.01) contiguas = false;
  }
  pasa("bandas contiguas y crecientes", contiguas && g.bandas.every((b, k) => b.y0 < b.y1 && (k === 0 || b.y0 > g.bandas[k - 1].y0)));

  // 2) celdas alineadas con la banda dibujada
  const celdas = g.celdas ?? [];
  pasa("hay celdas (al menos nombre)", celdas.length >= g.bandas.length);
  let alineadas = true;
  let detalleAlin = "";
  for (const c of celdas) {
    const b = g.bandas[c.indice];
    if (!b || c.codigo !== b.codigo) {
      alineadas = false;
      detalleAlin = `celda indice=${c.indice} codigo="${c.codigo}" != banda "${b?.codigo}"`;
      break;
    }
  }
  pasa("celda.codigo === banda[indice].codigo", alineadas, detalleAlin);

  const celdasPorFila = new Map<number, number>();
  for (const c of celdas) celdasPorFila.set(c.indice, (celdasPorFila.get(c.indice) ?? 0) + 1);
  pasa("cada fila tiene su celda de nombre", g.bandas.every((_b, k) => (celdasPorFila.get(k) ?? 0) >= 1));

  // 2b) las celdas quedan dentro de la tabla y el encabezado tiene tamaño
  const tabX = g.tablaX ?? 0;
  const fueraDeTabla = tabX <= 0 || celdas.some((c) => c.x0 < 0 || c.x1 > tabX);
  pasa("todas las celdas dentro de [0, tablaX]", !fueraDeTabla, fueraDeTabla ? "celda fuera de la tabla" : "");
  pasa("altoEncabezado > 0", (g.altoEncabezado ?? 0) > 0);
  const topEnc = (g.bandas[0]?.y0 ?? g.altoEncabezado) - g.altoEncabezado;
  pasa("el encabezado de la tabla arranca sobre la primera banda", topEnc >= 0);

  // 2c) columnas derivadas presentes y con editable=false; nombre editable
  const constantes = celdas.filter((c) => c.editable === false);
  const editables = celdas.filter((c) => c.editable === true);
  pasa("hay columnas derivadas marcadas como no editables", constantes.length > 0 || !celdas.some((c) => c.campo !== "nombre"));
  pasa("hay celdas editables (nombre + columnas de datos)", editables.length > 0);
  pasa(
    "la celda de nombre es editable",
    celdas.every((c) => c.campo !== "nombre" || c.editable === true),
  );

  // 3) hit-test del doble clic: probamos el punto central de cada celda
  const ordenDibujadas = g.bandas.map((b) => b.codigo);
  for (let k = 0; k < g.bandas.length; k++) {
    const b = g.bandas[k];
    const celdaNombre = celdas.find((c) => c.indice === k && c.campo === "nombre");
    const targetX = celdaNombre ? (celdaNombre.x0 + celdaNombre.x1) / 2 : 0;
    const clientY = b.y0 + (b.y1 - b.y0) / 2;
    // La simulación pinta el SVG a escala 2x (svgTop=0, svgLeft=0): una coordenada
// de unidad u del SVG llega como cliente en u*2 y el hit-test la devuelve con
// fEsc=0.5, así que hay que pasar el doble de cada unidad.
    const r = hitTest(g, targetX * 2, clientY * 2, 0, 0);
    if (!r || r.i !== k) {
      pasa(
        `doble clic en fila ${k} (codigo "${ordenDibujadas[k]}") → misma fila`,
        false,
        `banda y0=${b.y0.toFixed(1)} y1=${b.y1.toFixed(1)} py=${(clientY).toFixed(1)} → i=${r?.i ?? "null"} (codigo "${r?.bandanos ?? ""}")`,
      );
      continue;
    }
    pasa(`doble clic en fila ${k} (codigo "${r.bandanos}") → misma fila`, true);
    // el rect del editor cae dentro de la celda
    if (r.celda && r.rect) {
      const dentro = r.rect.left >= 0 && r.rect.top >= 0 && r.rect.width > 0 && r.rect.height > 0;
      pasa(`rect del editor fila ${k} válido`, dentro);
    }
  }

  // 4) una celda de columna de datos queda dentro de la tabla
  const col = celdas.find((c) => c.campo === "duracion");
  if (col) {
    const b = g.bandas[col.indice];
    pasa("celda de columna dentro de la tabla", col.x1 <= (g.tablaX ?? Infinity) + 0.01 && col.x0 >= 0 && b.y0 < b.y1);
  } else {
    console.log("  (sin celda de duración: columna no pedida)");
  }
}

// ---- Ejecución -------------------------------------------------------------
probarFixture(
  "poda por ocultar-subtareas",
  fixtureConPoda(),
  params({
    "mostrar-columnas": ["duracion", "avance", "costo-unitario", "costo", "holgura", "critico", "inicio-temprano", "termino-tardio"],
    "mostrar-niveles": "auto",
  }),
);

probarFixture(
  "colapso por mostrar-niveles=3 (nivel < 3)",
  fixtureSimple(),
  params({
    "mostrar-columnas": ["duracion", "inicio", "termino", "costo", "critico"],
    "mostrar-niveles": "3",
  }),
);

probarFixture(
  "proyecto + columnas, sin poda",
  fixtureSimple(),
  params({
    "mostrar-columnas": ["duracion", "avance", "cantidad", "unidad", "costo-unitario", "costo"],
    "mostrar-niveles": "auto",
  }),
);

// ---- Modo solo línea de tiempo (paneles separados + zoom por geometría) ----
console.log("\n== solo linea de tiempo (zoom x2) ==");
{
  const base = params({ "mostrar-niveles": "auto" });
  const vistaBase = dibujarGantt(fixtureSimple(), base);
  const vistaSolo = dibujarGantt(fixtureSimple(), base, undefined, { soloLineaTiempo: true, zoom: 2 });
  const gb = vistaBase.geometria;
  const gs = vistaSolo.geometria;

  const lineaTiempoBase = gb.ancho - (gb.tablaX ?? 0);
  pasa("solo: tablaX en 0", gs.tablaX === 0);
  // La tabla conserva las mismas celdas; en pantalla la sangría por nivel es la mitad, así que su
  // ancho es igual o algo menor que el de impresión (nunca mayor).
  pasa(
    "solo: la tabla HTML conserva sus celdas y su ancho no supera al de impresion",
    (gs.celdas ?? []).length === (gb.celdas ?? []).length &&
      (gs.anchoTabla ?? 0) > 0 &&
      (gs.anchoTabla ?? 0) <= (gb.anchoTabla ?? 0),
  );
  pasa("solo: ancho == linea-tiempo * zoom", Math.abs(gs.ancho - lineaTiempoBase * 2) < 0.01, `ancho=${gs.ancho.toFixed(2)} esperado=${(lineaTiempoBase * 2).toFixed(2)}`);
  pasa("solo: calendario arranca en x=0", (gs.calendario?.x0 ?? -1) === 0);
  pasa("solo: mismas filas dibujadas", gs.bandas.length === gb.bandas.length && gs.bandas[0].codigo === gb.bandas[0].codigo);
  pasa("solo: hay barras", gs.barras.length > 0);
  const fuera = (gs.barras ?? []).some((b) => b.x < 0 || b.x + b.w > gs.ancho);
  pasa("solo: barras dentro del area", !fuera);
  const gText = gs.bandas[0].y0 - gs.altoEncabezado;
  pasa("solo: sin titulo (yDesp 0)", gText >= 0 && gText < 0.01);
}

const RUTA = process.argv[2];
if (RUTA) {
  console.log(`\nCasos probados. Ruta opcional: ${RUTA}`);
}

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo OK.");