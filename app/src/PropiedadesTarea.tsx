// PropiedadesTarea.tsx — panel anclado a la derecha con las propiedades de la
// actividad seleccionada. Concentra la edición que antes vivía en la tabla y
// en el menú de clic derecho: nombre, calendario, hitos, vínculos,
// predecesoras, estilo y costos.

import type { KeyboardEvent, ReactNode } from "react";
import type { ValorCampo } from "./lib/yamlEdicion";
import "./App.css";

export interface CamposTarea {
  [clave: string]: ValorCampo;
}

interface Props {
  codigo: string;
  nombre: string;
  campos: CamposTarea;
  onAplicar: (clave: string, valor: ValorCampo) => void;
  onCerrar: () => void;
  onAbrirPredecesoras: () => void;
  onAbrirApu: () => void;
  onAbrirRecursos: () => void;
}

const textoDe = (v: ValorCampo | null | undefined, def = "") => (v === null || v === undefined ? def : String(v));
const numDe = (v: ValorCampo): number | undefined => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};
const boolDe = (v: ValorCampo): boolean => v === true || v === "true";

const alEnter =
  (cometer: (v: string, e: KeyboardEvent<HTMLInputElement>) => void) =>
  (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    cometer(e.currentTarget.value, e);
  };

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="prop-fila">
      <span className="prop-etiqueta">{etiqueta}</span>
      <span className="prop-control">{children}</span>
    </label>
  );
}

function Campo({ etiqueta, serial, defecto, aplicar }: {
  etiqueta: string;
  serial: ValorCampo | null | undefined;
  defecto?: string;
  aplicar: (v: string) => void;
}) {
  return (
    <Fila etiqueta={etiqueta}>
      <input
        type="text"
        defaultValue={textoDe(serial, defecto ?? "")}
        onBlur={(e) => e.target.value !== "" && aplicar(e.target.value)}
        onKeyDown={alEnter((v, e) => {
          if (v !== "") aplicar(v);
          e.currentTarget.blur();
        })}
      />
    </Fila>
  );
}

export default function PropiedadesTarea({
  codigo,
  nombre,
  campos,
  onAplicar,
  onCerrar,
  onAbrirPredecesoras,
  onAbrirApu,
  onAbrirRecursos,
}: Props) {
  const cantidad = numDe(campos.cantidad);
  const cu = numDe(campos["costo-unitario"]);
  const costo = numDe(campos.costo) ?? (cantidad !== undefined && cu !== undefined ? cantidad * cu : undefined);
  const avance = campos.avance;
  const avanceSerie = typeof avance === "string" && avance.includes(";");
  const esGrupo = Array.isArray(campos.subtareas);
  const recursos = campos.recursos;

  return (
    <div className="prop-dock">
      <div className="prop-cab">
        <span className="prop-titulo">
          Actividad <span className="prop-codigo">{codigo}</span>
          <span className="prop-nombre-chico"> · {nombre}</span>
        </span>
        <button className="prop-cerrar" onClick={onCerrar} title="Cerrar propiedades">
          ×
        </button>
      </div>
      <div className="prop-cuerpo">
        <div className="prop-sep">Datos</div>
        <Campo etiqueta="Nombre" serial={campos.nombre} aplicar={(v) => onAplicar("nombre", v)} />
        <Fila etiqueta="Hito">
          <input type="checkbox" checked={boolDe(campos.hito)} onChange={(e) => onAplicar("hito", e.target.checked ? true : null)} />
        </Fila>
        {!esGrupo && (
          <>
            <div className="prop-sep">Calendario</div>
            <Fila etiqueta="Inicio">
              <input
                type="date"
                defaultValue={textoDe(campos.inicio)}
                onChange={(e) => e.target.value && onAplicar("inicio", e.target.value)}
                onKeyDown={alEnter((v, e) => {
                  if (v) onAplicar("inicio", v);
                  e.currentTarget.blur();
                })}
              />
            </Fila>
            <Fila etiqueta="Término">
              <input
                type="date"
                defaultValue={textoDe(campos.termino)}
                onChange={(e) => e.target.value && onAplicar("termino", e.target.value)}
                onKeyDown={alEnter((v, e) => {
                  if (v) onAplicar("termino", v);
                  e.currentTarget.blur();
                })}
              />
            </Fila>
            <Fila etiqueta="Duración (días)">
              <input
                type="number"
                min={0}
                defaultValue={numDe(campos.duracion) ?? ""}
                onChange={(e) => (e.target.value === "" ? onAplicar("duracion", null) : onAplicar("duracion", Number(e.target.value)))}
                onKeyDown={alEnter((v, e) => {
                  onAplicar("duracion", v === "" ? null : Number(v));
                  e.currentTarget.blur();
                })}
              />
            </Fila>
            <Fila etiqueta={avanceSerie ? "Avance (serie)" : "Avance (%)"}>
              {avanceSerie ? (
                <input
                  type="text"
                  defaultValue={String(avance)}
                  onChange={(e) => onAplicar("avance", e.target.value)}
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={avance !== null && avance !== undefined ? Math.round(Number(avance) * 100) : ""}
                  onChange={(e) => (e.target.value === "" ? onAplicar("avance", null) : onAplicar("avance", Number(e.target.value) / 100))}
                  onKeyDown={alEnter((v, e) => {
                    onAplicar("avance", v === "" ? null : Number(v) / 100);
                    e.currentTarget.blur();
                  })}
                />
              )}
            </Fila>
          </>
        )}
        <div className="prop-sep">Relaciones</div>
        <Fila etiqueta="Predecesoras">
          <button className="prop-boton" onClick={onAbrirPredecesoras}>
            Editar…
          </button>
        </Fila>
        <Campo etiqueta="Id" serial={campos.id} aplicar={(v) => onAplicar("id", v)} />
        <Campo etiqueta="Vínculo" serial={campos.vinculo} aplicar={(v) => onAplicar("vinculo", v)} />
        <div className="prop-sep">Costos</div>
        <Fila etiqueta="Cantidad">
          <input
            type="number"
            step="any"
            min={0}
            defaultValue={cantidad ?? ""}
            onChange={(e) => (e.target.value === "" ? onAplicar("cantidad", null) : onAplicar("cantidad", Number(e.target.value)))}
            onKeyDown={alEnter((v, e) => {
              onAplicar("cantidad", v === "" ? null : Number(v));
              e.currentTarget.blur();
            })}
          />
        </Fila>
        <Fila etiqueta="Unidad">
          <input
            type="text"
            defaultValue={textoDe(campos.unidad)}
            onBlur={(e) => onAplicar("unidad", e.target.value === "" ? null : e.target.value)}
            onKeyDown={alEnter((v, e) => {
              onAplicar("unidad", v === "" ? null : v);
              e.currentTarget.blur();
            })}
          />
        </Fila>
        <Fila etiqueta="Costo unitario">
          <input
            type="number"
            step="any"
            min={0}
            defaultValue={cu ?? ""}
            onChange={(e) => (e.target.value === "" ? onAplicar("costo-unitario", null) : onAplicar("costo-unitario", Number(e.target.value)))}
            onKeyDown={alEnter((v, e) => {
              onAplicar("costo-unitario", v === "" ? null : Number(v));
              e.currentTarget.blur();
            })}
          />
        </Fila>
        <Fila etiqueta="Costo">
          <span className="prop-derivado">{costo !== undefined ? costo.toLocaleString("es") : "—"}</span>
        </Fila>
        <Fila etiqueta="APU">
          <button className="prop-boton" onClick={onAbrirApu}>
            Recursos y precio unitario…
          </button>
          <button className="prop-boton prop-boton-sec" onClick={onAbrirRecursos} title="Editar precios del catálogo 'recursos:'">
            Catálogo…
          </button>
        </Fila>
        {recursos !== null && recursos !== undefined && !(Array.isArray(recursos) && recursos.length === 0) && (
          <pre className="prop-recursos">{String(recursos)}</pre>
        )}
        <div className="prop-sep">Estilo</div>
        <Fila etiqueta="Formato de barra">
          <select value={textoDe(campos["formato-barra"], "heredar")} onChange={(e) => onAplicar("formato-barra", e.target.value === "heredar" ? null : e.target.value)}>
            <option value="heredar">heredar</option>
            <option value="solida">rellena</option>
            <option value="contorno">contorno</option>
            <option value="rayas">rayas</option>
            <option value="gradiente">gradiente</option>
          </select>
        </Fila>
        <Fila etiqueta="Texto">
          <select
            value={campos.negrita === null ? "" : boolDe(campos.negrita) ? "si" : "no"}
            onChange={(e) => onAplicar("negrita", e.target.value === "" ? null : e.target.value === "si")}
            title="Negrita"
          >
            <option value="">negrita heredar</option>
            <option value="si">negrita sí</option>
            <option value="no">negrita no</option>
          </select>
          <select
            value={campos.italica === null ? "" : boolDe(campos.italica) ? "si" : "no"}
            onChange={(e) => onAplicar("italica", e.target.value === "" ? null : e.target.value === "si")}
            title="Cursiva"
          >
            <option value="">cursiva heredar</option>
            <option value="si">cursiva sí</option>
            <option value="no">cursiva no</option>
          </select>
          <input
            type="color"
            defaultValue={/^#[0-9a-fA-F]{6}$/.test(textoDe(campos["color-texto"])) ? textoDe(campos["color-texto"]) : "#1e293b"}
            onChange={(e) => onAplicar("color-texto", e.target.value)}
            title="Color del texto (y fechas) de esta actividad"
          />
          <button className="prop-mini" onClick={() => onAplicar("color-texto", null)} title="Quitar color propio">
            ·
          </button>
        </Fila>
        <Fila etiqueta="Ocultar subtareas">
          <input type="checkbox" checked={boolDe(campos["ocultar-subtareas"])} onChange={(e) => onAplicar("ocultar-subtareas", e.target.checked ? true : null)} />
        </Fila>
      </div>
    </div>
  );
}