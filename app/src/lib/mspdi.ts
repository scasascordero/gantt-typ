// mspdi.ts — Importador de MSPDI (MS Project 2003 XML) al formato YAML de
// la librería. Reconoce archivos del propio editor y de MS Project: la
// jerarquía se reconstruye con OutlineLevel + OutlineNumber/WBS, y las
// dependencias con los PredecessorLink (Tipo MS: 0=ff, 1=fs, 2=sf, 3=ss;
// Lag en décimas de minuto → días calendario).

interface NodoMs {
  uid: string;
  nombre: string;
  nivel: number;
  codigo: string;
  codigoPropio: boolean;
  hito: boolean;
  /** Duración de 1 día laboral o menos en el archivo (MS empuja el término al siguiente día hábil, p. ej. tras un fin de semana). */
  corta: boolean;
  inicio?: string;
  termino?: string;
  avance?: number;
  depsRaw: { pUid: string; tipo: string; lagDias: number }[];
  predecesoras: string[];
  hijos: NodoMs[];
}

const campo = (bloque: string, nombre: string): string | undefined =>
  bloque.match(new RegExp(`<${nombre}>([^<]*)</${nombre}>`))?.[1]?.trim();

const fechaDe = (s?: string): string | undefined => s?.match(/\d{4}-\d{2}-\d{2}/)?.[0];

const TIPOS_MSPDI: Record<string, string> = { "0": "ff", "1": "fs", "2": "sf", "3": "ss" };

export function esMSPDI(texto: string): boolean {
  return /<Task[\s>]/.test(texto) && (texto.includes("<Tasks>") || texto.includes("<Project"));
}

function decod(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

export function desdeMSPDI(xml: string): string {
  const uidCodigo = new Map<string, string>();
  const nodos: NodoMs[] = [];
  const minutosPorDia = Number(campo(xml, "MinutesPerDay") ?? "") || 480;

  for (const [, b] of xml.matchAll(/<Task>([\s\S]*?)<\/Task>/g)) {
    const nivel = Number(campo(b, "OutlineLevel") ?? "") || 0;
    if (nivel === 0) continue; // fila resumen del proyecto
    const uid = campo(b, "UID") ?? campo(b, "ID") ?? "";
    // Text1 guarda el `codigo` original en los archivos exportados por este
    // editor; los de MS Project no lo traen y se usa OutlineNumber/WBS.
    const codigo = decod(campo(b, "Text1") ?? "") || decod(campo(b, "OutlineNumber") ?? "") || decod(campo(b, "WBS") ?? "");
    const pc = Number(campo(b, "PercentComplete") ?? "");
    const nombre = decod(campo(b, "Name") ?? "");
    const dm = campo(b, "Duration")?.match(/^PT(\d+)H(\d+)M/);
    const durMin = dm ? Number(dm[1]) * 60 + Number(dm[2]) : undefined;
    nodos.push({
      uid,
      nombre,
      nivel,
      codigo,
      codigoPropio: codigo !== "",
      // hito: marcado como tal en MS Project, de duración 0, o llamado "Hito …"
      // (hay archivos donde los hitos vienen como tareas de 1 día sin la marca)
      hito: campo(b, "Milestone") === "1" || durMin === 0 || /^\s*hito\b/i.test(nombre),
      corta: durMin !== undefined && durMin <= minutosPorDia,
      inicio: fechaDe(campo(b, "Start")),
      termino: fechaDe(campo(b, "Finish")),
      avance: Number.isFinite(pc) && pc > 0 ? pc / 100 : undefined,
      depsRaw: [...b.matchAll(/<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g)].map(([, d]) => ({
        pUid: campo(d, "PredecessorUID") ?? "",
        tipo: TIPOS_MSPDI[campo(d, "Type") ?? "1"] ?? "fs",
        lagDias: Math.round(Number(campo(d, "Lag") ?? "0") / 14400),
      })),
      predecesoras: [],
      hijos: [],
    });
  }
  for (const n of nodos) if (n.codigo) uidCodigo.set(n.uid, n.codigo);

  // árbol: el documento MSPDI lista las tareas en DFS, padre antes que hijos
  const raices: NodoMs[] = [];
  const pila: NodoMs[] = [];
  for (const n of nodos) {
    while (pila.length && pila[pila.length - 1].nivel >= n.nivel) pila.pop();
    if (pila.length) pila[pila.length - 1].hijos.push(n);
    else raices.push(n);
    pila.push(n);
  }

  // códigos secuenciales para los que no traían OutlineNumber
  const asignar = (nodosH: NodoMs[], prefijo: string) => {
    nodosH.forEach((n, i) => {
      const codigo = n.codigoPropio ? n.codigo : (prefijo ? `${prefijo}.` : "") + String(i + 1);
      if (!n.codigoPropio) {
        n.codigo = codigo;
        if (n.uid) uidCodigo.set(n.uid, codigo);
      }
      asignar(n.hijos, codigo);
    });
  };
  asignar(raices, "");

  for (const n of nodos) {
    for (const d of n.depsRaw) {
      const pred = uidCodigo.get(d.pUid);
      if (!pred || pred === n.codigo) continue;
      if (d.tipo === "fs") n.predecesoras.push(d.lagDias !== 0 ? `${pred}:fs:${d.lagDias}` : pred);
      else n.predecesoras.push(d.lagDias !== 0 ? `${pred}:${d.tipo}:${d.lagDias}` : `${pred}:${d.tipo}`);
    }
  }

  const lineas: string[] = ["# importado de MSPDI", "tareas:"];
  const yq = (s: string) => JSON.stringify(s);
  const escribir = (n: NodoMs, prof: number) => {
    const pad = " ".repeat(2 + 2 * prof);
    const pad2 = pad + "  ";
    lineas.push(`${pad}- codigo: ${yq(n.codigo)}`);
    lineas.push(`${pad2}nombre: ${yq(n.nombre)}`);
    if (n.inicio) lineas.push(`${pad2}inicio: ${n.inicio}`);
    // un grupo nunca es hito (MS marca así a algunos resúmenes); una hoja de 1 día
    // laboral o menos se escribe sin `termino`, así dura 1 día aunque cruce un fin de semana
    const hoja = n.hijos.length === 0;
    if (hoja && n.hito) lineas.push(`${pad2}hito: true`);
    else if (n.termino && n.termino !== n.inicio && !(hoja && n.corta)) lineas.push(`${pad2}termino: ${n.termino}`);
    if (n.avance !== undefined) lineas.push(`${pad2}avance: "${Math.round(n.avance * 100)}%"`);
    if (n.predecesoras.length) lineas.push(`${pad2}predecesoras: [${n.predecesoras.map(yq).join(", ")}]`);
    if (n.hijos.length) {
      lineas.push(`${pad2}subtareas:`);
      for (const h of n.hijos) escribir(h, prof + 1);
    }
  };
  for (const r of raices) escribir(r, 0);
  return lineas.join("\n") + "\n";
}
