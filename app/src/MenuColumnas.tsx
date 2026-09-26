// MenuColumnas.tsx — menú contextual del botón derecho sobre las celdas de
// cabecera de las columnas de datos: qué columnas se muestran en la carta.

import { PARAMETROS, type Valor } from "./lib/params";
import { cerrarYReenviarClicDerecho } from "./lib/menuContextual";
import { Fila } from "./MenuParametros";

interface Props {
  x: number;
  y: number;
  valores: Record<string, Valor>;
  onCambiar: (clave: string, valor: Valor) => void;
  onVerMas: () => void;
  onCerrar: () => void;
}

export default function MenuColumnas({ x, y, valores, onCambiar, onVerMas, onCerrar }: Props) {
  const p = PARAMETROS.find((q) => q.clave === "mostrar-columnas");
  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => cerrarYReenviarClicDerecho(e, onCerrar)} />
      <div
        className="menu-columna"
        style={{
          left: Math.min(x, window.innerWidth - 320),
          top: Math.min(y, window.innerHeight - 320),
        }}
        role="dialog"
        aria-label="Columnas de la carta"
      >
        <div className="menu-titulo">
          Columnas
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="menu-columna-cuerpo">
          {p && (
            <label className="param-fila" title={p.ayuda ?? p.clave}>
              <span className="param-etiqueta">Columnas de datos</span>
              <Fila
                p={p}
                valor={p.clave in valores ? valores[p.clave] : p.defecto}
                onCambiar={(v) => onCambiar(p.clave, v)}
              />
            </label>
          )}
          <div className="menu-columna-ayuda">
            Marca las columnas que quieres que la carta muestre junto a las bandas. Clic en un nombre la selecciona y las flechas ↑ ↓ de arriba la mueven. Al desmarcar una columna queda en su lugar, lista para reactivarla.
          </div>
          <button className="menu-columna-mas" onClick={onVerMas}>
            Más parámetros…
          </button>
        </div>
      </div>
    </>
  );
}