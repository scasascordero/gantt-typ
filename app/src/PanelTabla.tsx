// PanelTabla.tsx — Vista mínima tipo hoja de cálculo para editar las tareas.
// Cada celda se edita en su lugar (Enter/↵ confirma, Esc cancela) y el cambio
// se aplica al texto YAML con editarCampo(Consistente), el mismo camino seguro
// que usa el resto de la UI; la carta recompila sola con Typst.

import { useMemo, useRef, useState, type Ref } from "react";
import { listarTareas } from "./lib/yamlLineas";
import { editarCampo, editarCampoConsistente, type ValorCampo } from "./lib/yamlEdicion";

export type CampoTabla = "nombre" | "inicio" | "duracion" | "termino" | "avance" | "predecesoras";

interface Props {
  texto: string;
  oculto?: boolean;
  seleccion: string | null;
  // mismo filtro de niveles que el dibujo de la carta (mostrar-niveles), para
  // que las filas de la tabla coincidan 1:1 con las bandas.
  maxNivel?: string | number;
  // contenedor de scroll de la tabla, para sincronizar con la carta.
  tablaRef?: Ref<HTMLDivElement>;
  onCambiar: (texto: string) => void;
  onSeleccionar: (id: string | null) => void;
}

function crudoTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map((x) => String(x)).join("; ");
  return String(v);
}

export default function PanelTabla({ texto, oculto, seleccion, maxNivel = "auto", tablaRef, onCambiar, onSeleccionar }: Props) {
  const tareas = useMemo(() => {
    const todas = listarTareas(texto);
    if (maxNivel === "auto" || maxNivel === undefined) return todas;
    const k = Math.max(1, Math.floor(Number(maxNivel)) || 1);
    return todas.filter((t) => t.nivel < k);
  }, [texto, maxNivel]);
  const tareasRef = useRef(tareas);
  tareasRef.current = tareas;
  const [edin, setEdin] = useState<{ id: string; campo: CampoTabla } | null>(null);
  const cancelarRef = useRef(false);

  const crudoDe = (id: string, campo: CampoTabla): unknown => {
    const t = tareasRef.current.find((x) => x.id === id);
    if (!t) return undefined;
    if (campo === "nombre") return t.nombre;
    if (campo === "predecesoras") return t.predecesoras.join("; ");
    return t[campo];
  };

  const editar = (id: string, campo: CampoTabla) => {
    cancelarRef.current = false;
    setEdin({ id, campo });
  };

  const commit = (id: string, campo: CampoTabla, bruto: string) => {
    if (cancelarRef.current) return;
    setEdin(null);
    const s = bruto.trim();
    let valor: ValorCampo;
    if (campo === "nombre") {
      if (s === "") return;
      valor = s;
    } else if (campo === "duracion" || campo === "avance") {
      if (s === "") valor = null;
      else if (/^-?\d+(\.\d+)?$/.test(s)) valor = Number(s);
      else valor = s;
    } else {
      if (s === "") valor = null;
      else valor = s;
    }
    if (crudoTexto(valor) === crudoTexto(crudoDe(id, campo))) return;
    try {
      const proximo =
        campo === "inicio" || campo === "termino" || campo === "duracion"
          ? editarCampoConsistente(texto, id, campo, valor)
          : editarCampo(texto, id, campo, valor);
      if (proximo !== texto) onCambiar(proximo);
    } catch (err) {
      // tarea re-removida en paralelo etc.: se ignora y el editor queda igual
      void err;
    }
  };

  const celdas: { campo: CampoTabla; etiqueta: string }[] = [
    { campo: "nombre", etiqueta: "Nombre" },
    { campo: "inicio", etiqueta: "Inicio" },
    { campo: "duracion", etiqueta: "Duración" },
    { campo: "termino", etiqueta: "Término" },
    { campo: "avance", etiqueta: "Avance" },
    { campo: "predecesoras", etiqueta: "Predecesoras" },
  ];

  return (
    <div ref={tablaRef} className={"tabla-panel" + (oculto ? " oculto" : "")}>
      {tareas.length === 0 ? (
        <div className="tabla-vacia">Sin tareas: el YAML está vacío o no es válido.</div>
      ) : (
        <table className="tabla-tareas">
          <thead>
            <tr>
              <th scope="col" className="cel-codigo-h">#</th>
              {celdas.map((c) => (
                <th key={c.campo} scope="col">
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="fila-espacio" aria-hidden="true">
              <td
                colSpan={celdas.length + 1}
                style={{
                  height: "var(--espacio-ini, 4px)",
                  padding: 0,
                  borderBottom: "none",
                }}
              />
            </tr>
            {tareas.map((t) => (
              <tr
                key={t.id}
                className={"fila-tarea" + (seleccion === t.id ? " sel" : "")}
                onClick={() => onSeleccionar(t.id)}
              >
                <td className="cel-codigo">{t.id}</td>
                {celdas.map((c) => (
                  <td
                    key={c.campo}
                    onClick={(e) => {
                      e.stopPropagation();
                      editar(t.id, c.campo);
                    }}
                  >
                    {edin && edin.id === t.id && edin.campo === c.campo ? (
                      <input
                        className="cel-edit"
                        defaultValue={crudoTexto(crudoDe(t.id, c.campo))}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelarRef.current = true;
                            setEdin(null);
                          }
                        }}
                        onBlur={(e) => commit(t.id, c.campo, e.currentTarget.value)}
                      />
                    ) : (
                      <span
                        className="cel-mostrar"
                        title="Clic para editar"
                        style={c.campo === "nombre" ? { paddingLeft: 6 + Math.min(t.nivel, 8) * 14 } : undefined}
                      >
                        {c.campo === "nombre"
                          ? t.nombre
                          : crudoTexto(crudoDe(t.id, c.campo))}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}