// AnalisisApu.tsx — Estudio del precio unitario de una actividad a partir de
// su descomposición `recursos` (análisis de precios unitarios). Muestra la
// tabla de recursos con cuotas (cantidad x precio / rendimiento) y el PU
// resultante. El cálculo lo hace el motor Rust (comando analizar_apu), la
// misma fuente que la carta y que preparar_filas.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ApuRecurso {
  tipo: string | null;
  nombre: string;
  medida: string | null;
  cantidad: number;
  precio: number;
  rendimiento: number;
  desperdicio: number;
  cuota: number;
}

export interface ApuAnalisis {
  codigo: string;
  nombre: string;
  unidad: string | null;
  cantidad: number | null;
  costoUnitario: number;
  costo: number | null;
  recursos: ApuRecurso[];
}

const fmt = (n: number): string =>
  n.toLocaleString("es-CL", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 });

const TIPOS: Record<string, string> = {
  "mano-obra": "Mano de obra",
  material: "Material",
  equipo: "Equipo",
};

interface Props {
  codigo: string;
  texto: string;
  onInsertarPu: (codigo: string, pu: number) => void;
  onCerrar: () => void;
}

export default function AnalisisApu({ codigo, texto, onInsertarPu, onCerrar }: Props) {
  const [apu, setApu] = useState<ApuAnalisis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    invoke<ApuAnalisis | null>("analizar_apu", { texto, codigo })
      .then((r) => {
        if (vivo) {
          if (r) setApu(r);
          else setError("Esta tarea no declara 'recursos' (o es un grupo).");
        }
      })
      .catch((e) => vivo && setError(String(e)));
    return () => {
      vivo = false;
    };
  }, [texto, codigo]);

  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div className="apu" role="dialog" aria-label={`Análisis de precios unitarios de ${codigo}`}>
        <div className="apu-titulo">
          <span>
            Precio unitario · {apu?.codigo ?? codigo}
            <small>{apu?.nombre}</small>
          </span>
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="apu-cuerpo">
          {error ? (
            <p className="apu-error">{error}</p>
          ) : !apu ? (
            <p className="apu-cargando">Analizando…</p>
          ) : (
            <>
              <table className="apu-tabla">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Recurso</th>
                    <th>Medida</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Precio</th>
                    <th className="num">Rendimiento</th>
                    <th className="num">Desperdicio</th>
                    <th className="num">Cuota</th>
                  </tr>
                </thead>
                <tbody>
                  {apu.recursos.map((r, i) => (
                    <tr key={i}>
                      <td>{r.tipo ? (TIPOS[r.tipo] ?? r.tipo) : "—"}</td>
                      <td>{r.nombre}</td>
                      <td>{r.medida ?? "—"}</td>
                      <td className="num">{fmt(r.cantidad)}</td>
                      <td className="num">{fmt(r.precio)}</td>
                      <td className="num">{fmt(r.rendimiento)}</td>
                      <td className="num">{r.desperdicio ? `${fmt(r.desperdicio * 100)}%` : "—"}</td>
                      <td className="num">{fmt(r.cuota)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7}>Precio unitario (PU)</td>
                    <td className="num">{fmt(apu.costoUnitario)}</td>
                  </tr>
                  {apu.cantidad != null && (
                    <tr>
                      <td colSpan={7}>
                        Costo = {fmt(apu.cantidad)}{apu.unidad ? ` ${apu.unidad}` : ""} × PU
                      </td>
                      <td className="num">{apu.costo != null ? fmt(apu.costo) : "—"}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
              <div className="apu-acciones">
                <button onClick={() => onInsertarPu(apu.codigo, apu.costoUnitario)}>Insertar PU en costo-unitario</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}