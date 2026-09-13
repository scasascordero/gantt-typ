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

interface Forma {
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
    .filter((f) => f.stroke === "e2e8f0" && f.y1 - f.y0 === 0 && f.x1 - f.x0 > ancho * 0.5)
    .map((f) => f.y0)
    .sort((a, b) => a - b);

  const unicos = [...new Set(separadores.map((y) => Math.round(y * 100) / 100))];
  const bandas: Banda[] = [];
  for (let i = 0; i + 1 < unicos.length; i++) {
    bandas.push({ y0: unicos[i], y1: unicos[i + 1] });
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

function leerFormas(svg: string): Forma[] {
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
      const fin = svg.indexOf("/>", linea) + 2;
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