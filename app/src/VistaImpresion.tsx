// VistaImpresion.tsx — Modal de vista previa de impresión. Muestra las páginas
// SVG que generó el binario `typst` (mismo que produce el PDF). Incluye el
// control rápido de márgenes (sí/no + cm) que aplica al preview y al PDF sin
// tocar el config, y botones Refrescar / Exportar PDF… / Cerrar.

import { useState } from "react";

export type VistaImpresionEstado =
  | { tipo: "ok"; hojas: string[] }
  | { tipo: "error"; msg: string }
  | null;

interface Props {
  estado: VistaImpresionEstado;
  generando: boolean;
  nombre: string;
  margenesInicial: boolean;
  margenInicial: string;
  onRefrescar: (margenes: boolean, margen: number) => void;
  onExportarPdf: (margenes: boolean, margen: number) => void;
  onCerrar: () => void;
}

export default function VistaImpresion({
  estado,
  generando,
  nombre,
  margenesInicial,
  margenInicial,
  onRefrescar,
  onExportarPdf,
  onCerrar,
}: Props) {
  const [margenes, setMargenes] = useState(margenesInicial);
  const [margen, setMargen] = useState(margenInicial);

  const listo = !generando && estado?.tipo === "ok" && estado.hojas.length > 0;

  const valorMargen = () => {
    const n = Number(margen.trim().replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const alternar = () => {
    const v = !margenes;
    setMargenes(v);
    onRefrescar(v, valorMargen());
  };

  const aplicarMargen = () => onRefrescar(margenes, valorMargen());

  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div className="menu-contexto vista-impresion" role="dialog" aria-label="Vista de impresión">
        <div className="menu-titulo">
          Vista de impresión{nombre ? ` — ${nombre}` : ""}
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="vista-impresion-controles">
          <label className="vista-impresion-margenes-label">
            <input type="checkbox" checked={margenes} onChange={alternar} />
            Márgenes
          </label>
          <label className="vista-impresion-margen-label">
            <input
              type="text"
              inputMode="decimal"
              value={margen}
              spellCheck={false}
              onChange={(e) => setMargen(e.currentTarget.value)}
              onBlur={aplicarMargen}
              onKeyDown={(e) => {
                if (e.key === "Enter") aplicarMargen();
              }}
            />{" "}
            cm
            <span className="vista-impresion-margen-ayuda">aplica al preview y al PDF</span>
          </label>
        </div>
        <div className="menu-cuerpo vista-impresion-cuerpo">
          {generando ? (
            <p className="vista-impresion-vacio">Compilando con Typst…</p>
          ) : estado?.tipo === "error" ? (
            <p className="vista-impresion-error">{estado.msg}</p>
          ) : listo ? (
            estado.hojas.map((svg, i) => (
              <section key={i} className="vista-impresion-pagina" aria-label={`Página ${i + 1}`}>
                <header className="vista-impresion-pagina-titulo">
                  Página {i + 1} de {estado.hojas.length}
                </header>
                <div className="vista-impresion-svg" dangerouslySetInnerHTML={{ __html: svg }} />
              </section>
            ))
          ) : (
            <p className="vista-impresion-vacio">Sin resultado todavía.</p>
          )}
        </div>
        <div className="menu-acciones">
          <button onClick={aplicarMargen} disabled={generando}>
            Refrescar
          </button>
          <button onClick={() => onExportarPdf(margenes, valorMargen())} disabled={generando}>
            Exportar PDF…
          </button>
          <button className="secundario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}