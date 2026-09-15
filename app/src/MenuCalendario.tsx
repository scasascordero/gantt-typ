// MenuCalendario.tsx — menú contextual del botón derecho sobre la cabecera
// del calendario: edición rápida de los parámetros del grupo "Calendario".

import { PARAMETROS, type Valor } from "./lib/params";
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
  // ventana-inicio/fin vacíos = automáticos: la librería toma el mínimo/máximo
  // real de los datos; se muestran los límites deducidos para que se vean.
  const vIni = valores["ventana-inicio"];
  const vFin = valores["ventana-fin"];
  const algunaAuto = (vIni == null || vIni === "") || (vFin == null || vFin === "");
  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
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
          {ventanaCalculada && algunaAuto && (
            <div className="menu-calendario-ventana" title="Límites deducidos de los datos (ventana automática)">
              <span className="menu-calendario-ventana-etiqueta">Límites actuales (auto)</span>
              <span className="menu-calendario-ventana-fecha">{ventanaCalculada.inicio}</span>
              <span className="menu-calendario-ventana-flecha">→</span>
              <span className="menu-calendario-ventana-fecha">{ventanaCalculada.fin}</span>
            </div>
          )}
          {params.map((p) => (
            <label key={p.clave} className="param-fila" title={p.ayuda ?? p.clave}>
              <span className="param-etiqueta">{p.etiqueta}</span>
              <Fila
                p={p}
                valor={p.clave in valores ? valores[p.clave] : p.defecto}
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