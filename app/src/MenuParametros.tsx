import type { KeyboardEvent } from "react";
import { PARAMETROS, type ParamDef, type Valor } from "./lib/params";

interface Props {
  valores: Record<string, Valor>;
  ventanaCalculada?: { inicio: string; fin: string } | null;
  onCambiar: (clave: string, valor: Valor) => void;
  onRestablecer: () => void;
  onCerrar: () => void;
}

function hexCompleto(v: string): string {
  if (/^[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return v
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return "000000";
}

// Enter en los campos de texto/número confirma el valor editado.
const alEnter =
  (cometer: (v: string, e: KeyboardEvent<HTMLInputElement>) => void) =>
  (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    cometer(e.currentTarget.value, e);
  };

interface FilaProps {
  p: ParamDef;
  valor: Valor;
  onCambiar: (v: Valor) => void;
  // valor calculado a mostrar dentro del campo cuando el parámetro es
  // automático (p. ej. los límites de la ventana cuando están vacíos).
  fallback?: string;
}

export function Fila({ p, valor, onCambiar, fallback }: FilaProps) {
  const arr = Array.isArray(valor) ? (valor as string[]) : ((p.defecto as string[]) ?? []);
  switch (p.tipo) {
    case "color": {
      const hex = hexCompleto(String(valor));
      return (
        <span className="param-control">
          <input
            type="color"
            value={`#${hex}`}
            onChange={(e) => onCambiar(e.target.value.slice(1))}
          />
          <input
            type="text"
            value={String(valor)}
            spellCheck={false}
            onChange={(e) => onCambiar(e.target.value.trim())}
          />
        </span>
      );
    }
    case "bool":
      return (
        <span className="param-control">
          <input type="checkbox" checked={Boolean(valor)} onChange={(e) => onCambiar(e.target.checked)} />
        </span>
      );
    case "numero": {
      const vivo = String(valor);
      return (
        <span className="param-control">
          <input
            type="number"
            step="0.05"
            min="0"
            value={vivo}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(n)) onCambiar(n);
            }}
            onKeyDown={alEnter((v) => {
              const n = Number(v);
              if (v !== "" && Number.isFinite(n)) onCambiar(n);
            })}
          />
          {p.unidad && <span className="param-unidad">{p.unidad}</span>}
        </span>
      );
    }
    case "texto":
    case "fecha": {
      // parámetro automático (vacío) con un valor calculado disponible:
      // el límite se muestra dentro del propio campo, con la marca "auto".
      const auto = p.tipo === "fecha" && (valor == null || valor === "") && fallback !== undefined;
      const mostrado = auto ? fallback : String(valor);
      const commit = (v: string) => onCambiar(auto && v === fallback ? "" : v);
      return (
        <span className="param-control">
          <input
            type="text"
            placeholder={p.tipo === "fecha" ? "AAAA-MM-DD" : ""}
            value={mostrado}
            spellCheck={false}
            onChange={(e) => commit(e.target.value)}
            onKeyDown={alEnter((v) => commit(v))}
          />
          {auto && <span className="param-auto">auto</span>}
        </span>
      );
    }
    case "triestado":
    case "opciones":
    case "auto-entero":
      return (
        <span className="param-control">
          <select value={String(valor)} onChange={(e) => onCambiar(e.target.value)}>
            {(p.opciones ?? ["auto", "true", "false"]).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </span>
      );
    case "auto-longitud": {
      const automatico = valor === "auto";
      return (
        <span className="param-control">
          <label className="param-auto-ck">
            <input
              type="checkbox"
              checked={automatico}
              onChange={(e) => onCambiar(e.target.checked ? "auto" : (p.manual ?? "10"))}
            />{" "}
            auto
          </label>
          {!automatico && (
            <>
              <input
                type="number"
                step="0.5"
                min="0"
                value={String(valor)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (e.target.value !== "" && Number.isFinite(n)) onCambiar(String(n));
                }}
                onKeyDown={alEnter((v) => {
                  const n = Number(v);
                  if (v !== "" && Number.isFinite(n)) onCambiar(String(n));
                })}
              />
              <span className="param-unidad">{p.unidad}</span>
            </>
          )}
        </span>
      );
    }
    case "columnas":
      return (
        <span className="param-control param-checks">
          {(p.columnas ?? []).map((c) => {
            const activo = arr.includes(c.clave);
            return (
              <label
                key={c.clave}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", c.clave)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const origen = e.dataTransfer.getData("text/plain");
                  const destino = c.clave;
                  if (!origen || origen === destino) return;
                  const nuevo = arr.filter((k) => k !== origen);
                  const idx = nuevo.indexOf(destino);
                  nuevo.splice(idx >= 0 ? idx + 1 : nuevo.length, 0, origen);
                  onCambiar(nuevo);
                }}
              >
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => {
                    const actual = arr;
                    const nuevo = e.target.checked
                      ? [...actual, c.clave]
                      : actual.filter((x) => x !== c.clave);
                    onCambiar(nuevo);
                  }}
                />{" "}
                {c.etiqueta}
              </label>
            );
          })}
        </span>
      );
  }
}

export default function MenuParametros({ valores, ventanaCalculada, onCambiar, onRestablecer, onCerrar }: Props) {
  const grupos = [...new Set(PARAMETROS.map((p) => p.grupo))];
  // límites de la ventana deducidos de los datos (vacío = automático)
  const fallbackDe = (clave: string): string | undefined => {
    if (!ventanaCalculada) return undefined;
    if (clave === "ventana-inicio") return ventanaCalculada.inicio;
    if (clave === "ventana-fin") return ventanaCalculada.fin;
    return undefined;
  };
  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div className="menu-contexto" role="dialog" aria-label="Parámetros de carta-gantt">
        <div className="menu-titulo">
          Parámetros · carta-gantt
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="menu-cuerpo">
          {grupos.map((grupo) => (
            <details key={grupo} className="menu-grupo">
              <summary>{grupo}</summary>
              <div className="menu-grupo-cuerpo">
                {PARAMETROS.filter((p) => p.grupo === grupo).map((p) => (
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
              </div>
            </details>
          ))}
        </div>
        <div className="menu-acciones">
          <button onClick={onRestablecer}>Restablecer</button>
          <button onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </>
  );
}