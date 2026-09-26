// TablaGantt.tsx — Panel izquierdo de la carta: tabla HTML real (nombre +
// columnas de datos) junto al SVG, que lleva solo calendario y barras. Ambos
// están a escala 1:1 en píxeles y comparten altura de encabezado y de fila
// (salen de `geometria`), por lo que quedan alineados y el scroll vertical del
// contenedor común los mueve juntos; la tabla es `sticky` a la izquierda. La
// edición es un <input> de verdad dentro de la celda.

import { useCallback } from "react";
import type { Geometria } from "./lib/geometria";
import { ETIQUETAS, esColumnaDerecha, valorColumna } from "./lib/layout-gantt";
import type { Fila } from "./lib/modelo";

export interface CeldaEdicion {
  codigo: string;
  campo: string;
  valor: string;
}

interface Props {
  geometria: Geometria;
  filasPorCodigo: ReadonlyMap<string, Fila>;
  mostrarCodigo: boolean;
  seleccion: { codigo: string } | null;
  editando: CeldaEdicion | null;
  onSeleccionar: (codigo: string) => void;
  onEditar: (codigo: string, campo: string) => void;
  onPropiedades: (codigo: string) => void;
  onCancelarEdicion: () => void;
  onCommitEdicion: (valor: string) => void;
  onMenuCelda: (clientX: number, clientY: number, codigo: string, nombre: string) => void;
  onMenuCabecera: (clientX: number, clientY: number) => void;
}

export function TablaGantt(props: Props) {
  const { geometria: g, filasPorCodigo, mostrarCodigo, seleccion, editando } = props;
  const { onSeleccionar, onEditar, onPropiedades, onCancelarEdicion, onCommitEdicion, onMenuCelda, onMenuCabecera } = props;

  const anchoTabla = g.anchoTabla ?? 0;

  const alClic = useCallback(
    (codigo: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onSeleccionar(codigo);
    },
    [onSeleccionar],
  );
  const alDobleClic = useCallback(
    (codigo: string, campo: string, editable: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.detail === 1) return; // solo el segundo clic de la secuencia
      if (editable) onEditar(codigo, campo);
      else onPropiedades(codigo);
    },
    [onEditar, onPropiedades],
  );
  const alMenu = useCallback(
    (codigo: string, nombre: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onMenuCelda(e.clientX, e.clientY, codigo, nombre);
    },
    [onMenuCelda],
  );
  const alMenuCabecera = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onMenuCabecera(e.clientX, e.clientY);
    },
    [onMenuCabecera],
  );

  const bandas = g.bandas;
  if (bandas.length === 0 || anchoTabla <= 0) return null;

  const celdas = g.celdas ?? [];
  const cabeceras = celdas.filter((c) => c.indice === 0 && c.campo !== "nombre");
  // La fila 0 (el proyecto) también es cuerpo: solo presta sus x0/x1 a la cabecera.
  const celdasCuerpo = celdas;

  return (
    <div className="tabla-html" style={{ width: anchoTabla, height: g.alto }}>
      <div
        className="tabla-html-cabecera"
        style={{ height: g.altoEncabezado }}
        onContextMenu={alMenuCabecera}
      >
        {cabeceras.map((cd) => (
          <span
            key={cd.campo}
            className={`tabla-html-cab${esColumnaDerecha(cd.campo) ? " tabla-html-der" : ""}`}
            style={{
              left: cd.x0,
              width: cd.x1 - cd.x0,
            }}
          >
            {ETIQUETAS[cd.campo] ?? cd.campo}
          </span>
        ))}
      </div>

      {celdasCuerpo.map((c) => {
        const fila = filasPorCodigo.get(c.codigo);
        const banda = bandas[c.indice];
        if (!fila || !banda) return null;
        const esNombre = c.campo === "nombre";
        const activa = editando !== null && editando.codigo === c.codigo && editando.campo === c.campo;
        const texto = esNombre
          ? (mostrarCodigo && fila.codigo !== "" ? `${fila.codigo}. ` : "") + fila.nombre
          : valorColumna(fila, c.campo);
        const cls = [
          "tabla-html-celda",
          esNombre ? " tabla-html-celda-nombre" : "",
          esNombre ? (fila.nivel === 0 || fila.negrita ? " tabla-html-celda-grupo" : "") : "",
          seleccion && seleccion.codigo === fila.codigo ? " tabla-html-celda-sel" : "",
        ].join("").trim();
        return (
          <div
            key={`${c.indice}:${c.campo}`}
            className={cls}
            style={{
              left: c.x0,
              width: c.x1 - c.x0,
              top: banda.y0,
              height: banda.y1 - banda.y0,
              justifyContent: esNombre ? "flex-start" : esColumnaDerecha(c.campo) ? "flex-end" : "center",
              textAlign: esNombre ? "left" : esColumnaDerecha(c.campo) ? "right" : "center",
              ...(esNombre ? { paddingLeft: fila.nivel * (g.sangria ?? 8) + 4 } : {}),
            }}
            title={c.editable ? "Doble clic para editar" : "Doble clic: propiedades"}
            onClick={(e) => alClic(fila.codigo, e)}
            onDoubleClick={(e) => alDobleClic(fila.codigo, c.campo, c.editable, e)}
            onContextMenu={(e) => alMenu(fila.codigo, fila.nombre, e)}
          >
            {activa && editando ? (
              <input
                className="tabla-html-input"
                autoFocus
                spellCheck={false}
                defaultValue={editando.valor}
                onFocus={(ev) => ev.currentTarget.select()}
                onClick={(ev) => ev.stopPropagation()}
                onBlur={(ev) => onCommitEdicion(ev.currentTarget.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") {
                    ev.preventDefault();
                    ev.currentTarget.blur();
                  } else if (ev.key === "Escape") {
                    onCancelarEdicion();
                  }
                }}
              />
            ) : (
              <span>{texto}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}