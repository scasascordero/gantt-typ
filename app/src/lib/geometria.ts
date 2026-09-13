export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface Banda {
  y0: number;
  y1: number;
}

export interface Geometria {
  ancho: number;
  alto: number;
  bandas: Banda[];
  barras: Rect[];
  hoy?: number;
}

export interface Forma {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  fill: string | null;
  stroke: string | null;
}


export function analizarSvg(svg: string): Geometria {
  const vb = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/);
  const ancho = vb ? Number(vb[3]) : 0;
  const alto = vb ? Number(vb[4]) : 0;

  const formas = leerFormas(svg);
  const separadores = formas
    .filter(
      (f) =>
        f.stroke === "e2e8f0" &&
        f.y1 - f.y0 === 0 &&
        f.y0 > 1 &&
        f.x1 - f.x0 > ancho * 0.8,
    )
    .map((f) => f.y0)
    .sort((a, b) => a - b);

  const unicos = [...new Set(separadores.map((y) => Math.round(y * 100) / 100))];

  // Verdad suprema de las filas: el texto de la columna nombres. Una banda
  // por cada línea de nombre, centrada en su baseline. Los separadores solo
  // aportan el paso g (o se deduce de los propios nombres), así que ni el
  // subrayado del header, ni el marco, ni líneas parásito pueden correr el
  // mapeo una fila.
  const bordeNombres = Math.min(
    ...formas
      .filter((f) => f.stroke === "e2e8f0" && f.x1 - f.x0 === 0 && f.x0 > 8 && f.y1 - f.y0 >= 20)
      .map((f) => f.x0),
    ancho * 0.35,
  );
  const nombres = filasNombre(svg, bordeNombres);
  const g = nombres.length >= 2 ? espaciado(nombres) : espaciado(unicos);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  let bandas: Banda[] = nombres.map((b) => ({ y0: r2(b - g / 2), y1: r2(b + g / 2) }));
  if (!bandas.length && unicos.length) {
    // sin texto de nombres detectable: modelo clásico (separadores = fondos)
    const ys = [r2(unicos[0] - g), ...unicos];
    bandas = [];
    for (let i = 0; i + 1 < ys.length; i++) bandas.push({ y0: ys[i], y1: ys[i + 1] });
  }

  const barras: Rect[] = formas
    .filter((f) => f.fill === "719af2" && f.y1 - f.y0 > 1)
    .map((f) => ({
      x: f.x0,
      y: f.y0,
      w: f.x1 - f.x0,
      h: f.y1 - f.y0,
      cx: (f.x0 + f.x1) / 2,
      cy: (f.y0 + f.y1) / 2,
    }));

  const hoyForma = formas.find((f) => f.fill === "dc2626");
  const hoy = hoyForma ? (hoyForma.y0 + hoyForma.y1) / 2 : undefined;

  return { ancho, alto, bandas, barras, hoy };
}

export function leerTextos(svg: string): { x: number; y: number }[] {
  let x = 0;
  let y = 0;
  const pila: Array<[number, number]> = [];
  const out: { x: number; y: number }[] = [];
  const ev = /<g\b[^>]*>|<\/g>/g;
  let m: RegExpExecArray | null;
  while ((m = ev.exec(svg))) {
    if (m[0] === "</g>") {
      const t = pila.pop();
      if (t) {
        x = t[0];
        y = t[1];
      }
    } else {
      const tr = m[0].match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      const nx = x + (tr ? Number(tr[1]) : 0);
      const ny = y + (tr ? Number(tr[2]) : 0);
      if (/class="typst-text"/.test(m[0])) out.push({ x: nx, y: ny });
      pila.push([x, y]);
      x = nx;
      y = ny;
    }
  }
  return out;
}

// Un baseline por fila de la columna nombres (texto a la izquierda del
// borde de la grilla); agrupa glifos de la misma fila con tolerancia de 4pt.
function filasNombre(svg: string, bordeNombres: number): number[] {
  const ts = leerTextos(svg).filter((t) => t.x < bordeNombres);
  const filas: number[] = [];
  for (const t of ts) {
    const i = filas.findIndex((y) => Math.abs(y - t.y) <= 4);
    if (i === -1) filas.push(t.y);
  }
  return filas.sort((a, b) => a - b);
}

function espaciado(ys: number[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < ys.length; i++) {
    const d = Math.round((ys[i] - ys[i - 1]) * 100) / 100;
    if (d > 2) diffs.push(d);
  }
  if (!diffs.length) return 17.01;
  const cuenta = new Map<number, number>();
  for (const d of diffs) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  let mejor = diffs[0];
  let n = 0;
  for (const [d, c] of cuenta) if (c > n) [mejor, n] = [d, c];
  return mejor;
}

export function leerFormas(svg: string): Forma[] {
  let x = 0;
  let y = 0;
  const pila: Array<[number, number]> = [];
  const formas: Forma[] = [];

  for (let i = 0; i < svg.length; ) {
    const abrir = svg.indexOf('<g transform="translate(', i);
    const cerrar = svg.indexOf("</g>", i);
    const linea = svg.indexOf('<path class="typst-shape"', i);

    const siguiente = Math.min(
      abrir === -1 ? Infinity : abrir,
      cerrar === -1 ? Infinity : cerrar,
      linea === -1 ? Infinity : linea,
    );
    if (siguiente === Infinity) break;

    if (siguiente === abrir) {
      const fin = svg.indexOf(">", abrir);
      const attr = svg.slice(abrir, fin);
      const m = attr.match(/translate\((-?[\d.]+),(-?[\d.]+)\)/);
      pila.push([x, y]);
      x += Number(m?.[1] ?? 0);
      y += Number(m?.[2] ?? 0);
      i = fin + 1;
    } else if (siguiente === cerrar) {
      const top = pila.pop();
      if (top) [x, y] = top;
      i = cerrar + 4;
    } else {
      const autoCierre = svg.indexOf("/>", linea);
      const cierrePar = svg.indexOf("</path>", linea);
      const fin =
        (autoCierre === -1 ? Infinity : autoCierre) <
        (cierrePar === -1 ? Infinity : cierrePar)
          ? autoCierre + 2
          : cierrePar;
      const tag = svg.slice(linea, fin);
      const d = tag.match(/d="([^"]+)"/)?.[1];
      if (d) {
        const nums = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (let k = 0; k + 1 < nums.length; k += 2) {
          const ax = x + Number(nums[k]);
          const ay = y + Number(nums[k + 1]);
          if (ax < x0) x0 = ax;
          if (ay < y0) y0 = ay;
          if (ax > x1) x1 = ax;
          if (ay > y1) y1 = ay;
        }
        formas.push({
          x0: Math.round(x0 * 100) / 100,
          y0: Math.round(y0 * 100) / 100,
          x1: Math.round(x1 * 100) / 100,
          y1: Math.round(y1 * 100) / 100,
          fill: tag.match(/fill="#([0-9a-f]+)"/)?.[1] ?? null,
          stroke: tag.match(/stroke="#([0-9a-f]+)"/)?.[1] ?? null,
        });
      }
      i = fin;
    }
  }

  return formas;
}