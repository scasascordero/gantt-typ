// EditorPredecesoras.tsx — diálogo que edita las predecesoras (dependencias)
// de una actividad: casillas con todas las demás tareas, tipo de enlace
// (fs/ss/ff/sf) y lag en días. Guarda tokens en el formato que entiende el
// motor: `pred`, `pred:tipo` o `pred:tipo:lag`.

import { useMemo, useState } from "react";
import { baseDeToken } from "./lib/yamlOperaciones";
import type { Tarea } from "./lib/yamlLineas";
import "./App.css";

type TipoDep = "fs" | "ss" | "ff" | "sf";

const TIPOS: { valor: TipoDep; etiqueta: string }[] = [
  { valor: "fs", etiqueta: "fin→inicio" },
  { valor: "ss", etiqueta: "inicio→inicio" },
  { valor: "ff", etiqueta: "fin→fin" },
  { valor: "sf", etiqueta: "inicio→fin" },
];

interface Props {
  codigo: string;
  nombre: string;
  tareas: Tarea[];
  cpm: boolean;
  onGuardar: (tokens: string[]) => void;
  onCerrar: () => void;
}

function tokenDe(base: string, tipo: TipoDep, lag: number): string {
  if (tipo === "fs" && lag === 0) return base;
  return lag === 0 ? `${base}:${tipo}` : `${base}:${tipo}:${lag}`;
}

function partesDe(token: string): { base: string; tipo: TipoDep; lag: number } {
  const partes = token.trim().split(":");
  const tipo = (["fs", "ss", "ff", "sf"] as TipoDep[]).includes(partes[1] as TipoDep)
    ? (partes[1] as TipoDep)
    : "fs";
  const lag = Number.isFinite(Number(partes[2])) ? Math.trunc(Number(partes[2])) : 0;
  return { base: partes[0] || token.trim(), tipo, lag };
}

export default function EditorPredecesoras({ codigo, nombre, tareas, cpm, onGuardar, onCerrar }: Props) {
  const otras = useMemo(() => tareas.filter((t) => t.id !== codigo), [tareas, codigo]);
  const actual = useMemo(() => tareas.find((t) => t.id === codigo)?.predecesoras ?? [], [tareas, codigo]);

  const [seleccion, setSeleccion] = useState<Map<string, { tipo: TipoDep; lag: number }>>(() => {
    const m = new Map<string, { tipo: TipoDep; lag: number }>();
    for (const t of actual) {
      const base = baseDeToken(t);
      if (base && !m.has(base)) m.set(base, partesDe(t));
    }
    return m;
  });

  const marcar = (id: string, activa: boolean) => {
    setSeleccion((prev) => {
      const m = new Map(prev);
      if (activa) m.set(id, { tipo: "fs", lag: 0 });
      else m.delete(id);
      return m;
    });
  };

  const fijar = (id: string, cambios: Partial<{ tipo: TipoDep; lag: number }>) => {
    setSeleccion((prev) => {
      const m = new Map(prev);
      const actualDep = m.get(id);
      if (!actualDep) return prev;
      m.set(id, { ...actualDep, ...cambios });
      return m;
    });
  };

  const tokens = Array.from(seleccion.entries()).map(([base, d]) => tokenDe(base, d.tipo, d.lag));

  return (
    <>
      <div className="editor-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div
        className="editor-pred"
        role="dialog"
        aria-label={`Predecesoras de ${codigo}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="editor-pred-cab">
          <span className="editor-pred-titulo">
            Predecesoras de {codigo}
            <small>{nombre}</small>
          </span>
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="editor-pred-cuerpo">
          {!cpm && (
            <p className="editor-pred-aviso">
              Las predecesoras solo afectan el calendario con el parámetro <code>cpm</code> activado.
            </p>
          )}
          <div className="editor-pred-lista">
            {otras.length === 0 && <p className="editor-pred-vacio">No hay otras actividades.</p>}
            {otras.map((t) => {
              const dep = seleccion.get(t.id);
              const activa = dep !== undefined;
              return (
                <div key={t.id} className={"editor-pred-fila" + (activa ? " activa" : "")}>
                  <label className="editor-pred-caja">
                    <input
                      type="checkbox"
                      checked={activa}
                      onChange={(e) => marcar(t.id, e.target.checked)}
                    />
                    <span className="editor-pred-tag">{t.id}</span>
                    <span className="editor-pred-nombre">{t.nombre}</span>
                  </label>
                  {activa && (
                    <span className="editor-pred-opciones">
                      <select
                        value={dep.tipo}
                        onChange={(e) => fijar(t.id, { tipo: e.target.value as TipoDep })}
                        title="Tipo de enlace"
                      >
                        {TIPOS.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.etiqueta}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={-999}
                        max={999}
                        value={dep.lag}
                        onChange={(e) => fijar(t.id, { lag: Math.trunc(Number(e.target.value) || 0) })}
                        title="Lag en días (negativo = adelanto)"
                        className="editor-pred-lag"
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="editor-pred-pie">
            <span className="editor-pred-resumen">
              {tokens.length ? tokens.join(" ; ") : "sin predecesoras"}
            </span>
            <div className="editor-pred-acciones">
              <button className="editor-pred-cancelar" onClick={onCerrar}>
                Cancelar
              </button>
              <button onClick={() => onGuardar(tokens)}>Guardar</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}