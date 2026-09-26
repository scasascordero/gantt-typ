// MenuCalendario.tsx — menú contextual del botón derecho sobre la cabecera
// del calendario: edición rápida de los parámetros del grupo "Calendario".

import { PARAMETROS, type Valor } from "./lib/params";
import { cerrarYReenviarClicDerecho } from "./lib/menuContextual";
import { Fila } from "./MenuParametros";

interface Props {
  x: number;
  y: number;
  valores: Record<string, Valor>;
  ventanaCalculada: { inicio: string; fin: string } | null;
  onCambiar: (clave: string, valor: Valor) => void;
  onVerMas: () => void;
  onCerrar: () => void;
}

export default function MenuCalendario({ x, y, valores, ventanaCalculada, onCambiar, onVerMas, onCerrar }: Props) {
  const params = PARAMETROS.filter((p) => p.grupo === "Calendario");
  const fallbackDe = (clave: string): string | undefined => {
    if (!ventanaCalculada) return undefined;
    if (clave === "ventana-inicio") return ventanaCalculada.inicio;
    if (clave === "ventana-fin") return ventanaCalculada.fin;
    return undefined;
  };
  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => cerrarYReenviarClicDerecho(e, onCerrar)} />
      <div
        className="menu-calendario"
        style={{
          left: Math.min(x, window.innerWidth - 320),
          top: Math.min(y, window.innerHeight - 360),
        }}
        role="dialog"
        aria-label="Configuración de calendario"
      >
        <div className="menu-titulo">
          Calendario
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="menu-calendario-cuerpo">
          {params.map((p) => (
            <label key={p.clave} className="param-fila" title={p.ayuda ?? p.clave}>
              <span className="param-etiqueta">{p.etiqueta}</span>
              <Fila
                p={p}
                valor={p.clave in valores ? valores[p.clave] : p.defecto}
                fallback={fallbackDe(p.clave)}
                onCambiar={(v) => onCambiar(p.clave, v)}
              />
            </label>
          ))}
          <button className="menu-calendario-mas" onClick={onVerMas}>
            Más parámetros…
          </button>
        </div>
      </div>
    </>
  );
}