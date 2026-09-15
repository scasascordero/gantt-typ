// EditorPredecesoras.tsx — diálogo que edita las predecesoras (dependencias)
// de una actividad de forma visual: casillas con todas las demás tareas.

import { useMemo, useState } from "react";
import { baseDeToken } from "./lib/yamlOperaciones";
import type { Tarea } from "./lib/yamlLineas";
import "./App.css";

interface Props {
  codigo: string;
  nombre: string;
  tareas: Tarea[];
  cpm: boolean;
  onGuardar: (tokens: string[]) => void;
  onCerrar: () => void;
}

export default function EditorPredecesoras({ codigo, nombre, tareas, cpm, onGuardar, onCerrar }: Props) {
  const otras = useMemo(() => tareas.filter((t) => t.id !== codigo), [tareas, codigo]);
  const actual = useMemo(() => tareas.find((t) => t.id === codigo)?.predecesoras ?? [], [tareas, codigo]);

  // base → token bruto (conserva sufijos como "A:ss:2" si ya existían)
  const [seleccion, setSeleccion] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const t of actual) {
      const base = baseDeToken(t);
      if (base && !m.has(base)) m.set(base, t.trim());
    }
    return m;
  });

  const marcar = (id: string, activa: boolean) => {
    setSeleccion((prev) => {
      const m = new Map(prev);
      if (activa) m.set(id, id);
      else m.delete(id);
      return m;
    });
  };

  const tokens = Array.from(seleccion.values());

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
            {otras.map((t) => (
              <label key={t.id} className="editor-pred-fila">
                <input
                  type="checkbox"
                  checked={seleccion.has(t.id)}
                  onChange={(e) => marcar(t.id, e.target.checked)}
                />
                <span className="editor-pred-tag">{t.id}</span>
                <span className="editor-pred-nombre">{t.nombre}</span>
              </label>
            ))}
          </div>
          <div className="editor-pred-pie">
            <span className="editor-pred-resumen">{tokens.join(" ; ") || "sin predecesoras"}</span>
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