import { PARAMETROS, type ParamDef, type Valor } from "./lib/params";

interface Props {
  valores: Record<string, Valor>;
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

function Fila({ p, valor, onCambiar }: { p: ParamDef; valor: Valor; onCambiar: (v: Valor) => void }) {
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
          />
          {p.unidad && <span className="param-unidad">{p.unidad}</span>}
        </span>
      );
    }
    case "texto":
    case "fecha":
      return (
        <span className="param-control">
          <input
            type={p.tipo === "fecha" ? "text" : "text"}
            placeholder={p.tipo === "fecha" ? "AAAA-MM-DD" : ""}
            value={String(valor)}
            spellCheck={false}
            onChange={(e) => onCambiar(e.target.value)}
          />
        </span>
      );
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
            const activo = (valor as string[]).includes(c.clave);
            return (
              <label key={c.clave}>
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => {
                    const actual = valor as string[];
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

export default function MenuParametros({ valores, onCambiar, onRestablecer, onCerrar }: Props) {
  const grupos = [...new Set(PARAMETROS.map((p) => p.grupo))];
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