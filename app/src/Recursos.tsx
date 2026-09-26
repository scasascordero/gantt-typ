// Recursos.tsx — Catálogo de recursos (`recursos:` en la raíz del YAML):
// llave -> {tipo, nombre, medida, precio}. Las actividades pueden referenciar
// una llave en su `recursos` sin `precio` inline; el precio se resuelve desde
// acá, así un cambio se propaga a todas las actividades que lo usan.

import { useState } from "react";
import { leerRecursosYaml, ponerRecursosYaml } from "./lib/yamlEdicion";
import { numeroOFormula } from "./lib/expr";
import "./App.css";

export interface RecursoCatalogoRow {
  llave: string;
  tipo: string;
  nombre: string;
  medida: string;
  precio: string;
}

interface Props {
  texto: string;
  onGuardar: (nuevoTexto: string) => void;
  onCerrar: () => void;
}

const TIPOS = ["", "mano-obra", "material", "equipo"] as const;

function filaVacia(): RecursoCatalogoRow {
  return { llave: "", tipo: "", nombre: "", medida: "", precio: "" };
}

export default function Recursos({ texto, onGuardar, onCerrar }: Props) {
  const [filas, setFilas] = useState<RecursoCatalogoRow[]>(() => leerRecursosYaml(texto));
  const [error, setError] = useState<string | null>(null);

  const setFila = (i: number, parcial: Partial<RecursoCatalogoRow>) => {
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...parcial } : f)));
  };

  const guardar = () => {
    const validaPrecio = (p: string): boolean => p.trim() === "" || numeroOFormula(p.trim()) != null;
    const llaves = new Set<string>();
    for (const f of filas) {
      const llave = f.llave.trim();
      if (llave === "") {
        setError("Todas las llaves deben estar completas (o eliminá la fila vacía).");
        return;
      }
      if (llaves.has(llave)) {
        setError(`La llave '${llave}' está repetida.`);
        return;
      }
      llaves.add(llave);
      if (!validaPrecio(f.precio)) {
        setError(`'${llave}': el precio debe ser un número o fórmula (ej: "45000", "2*22500").`);
        return;
      }
    }
    try {
      onGuardar(ponerRecursosYaml(texto, filas));
    } catch (err) {
      setError(`Error al guardar el catálogo: ${String(err)}`);
    }
  };

  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div className="recursos" role="dialog" aria-label="Catálogo de recursos">
        <div className="apu-titulo">
          <span>
            Catálogo de recursos
            <small>Las actividades referencian una llave en su APU; el precio sale de acá.</small>
          </span>
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="recursos-cuerpo">
          <table className="apu-tabla recursos-tabla">
            <thead>
              <tr>
                <th>Llave</th>
                <th>Tipo</th>
                <th>Nombre</th>
                <th>Medida</th>
                <th className="num">Precio</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="recursos-input"
                      value={f.llave}
                      placeholder="p. ej. armador"
                      onChange={(e) => setFila(i, { llave: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="recursos-input"
                      value={f.tipo}
                      onChange={(e) => setFila(i, { tipo: e.target.value })}
                    >
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>
                          {t === "" ? "—" : t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="recursos-input"
                      value={f.nombre}
                      placeholder="p. ej. Armador jornal"
                      onChange={(e) => setFila(i, { nombre: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="recursos-input"
                      value={f.medida}
                      placeholder="p. ej. jor"
                      onChange={(e) => setFila(i, { medida: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="recursos-input recursos-precio"
                      value={f.precio}
                      placeholder="45000"
                      onChange={(e) => setFila(i, { precio: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      className="recursos-quitar"
                      onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}
                      aria-label={`Quitar ${f.llave || "recurso"}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length === 0 && <p className="apu-cargando">Sin recursos en el catálogo. Agregá el primero.</p>}
          {error && <p className="apu-error">{error}</p>}
          <div className="apu-acciones">
            <button className="recursos-agregar" onClick={() => setFilas((fs) => [...fs, filaVacia()])}>
              + Agregar recurso
            </button>
            <span className="recursos-espacio" />
            <button className="recursos-guardar" onClick={guardar} disabled={filas.some((f) => f.llave.trim() === "")}>
              Guardar catálogo
            </button>
          </div>
        </div>
      </div>
    </>
  );
}