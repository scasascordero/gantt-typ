import { useState } from "react";

export interface ProyectoInfo {
  id: number;
  nombre: string;
}

interface Props {
  proyectos: ProyectoInfo[];
  proyectoActivo: number | null; // proyecto al que está vinculada la pestaña actual
  onAbrir: (id: number) => void;
  onGuardarEn: (id: number) => void;
  onNuevoYGuardar: (nombre: string) => void;
  onBorrar: (id: number) => void;
  onCerrar: () => void;
}

export default function MenuProyectos({
  proyectos,
  proyectoActivo,
  onAbrir,
  onGuardarEn,
  onNuevoYGuardar,
  onBorrar,
  onCerrar,
}: Props) {
  const [nuevo, setNuevo] = useState("");

  const crear = () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    onNuevoYGuardar(nombre);
    setNuevo("");
  };

  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div className="menu-contexto" role="dialog" aria-label="Proyectos guardados">
        <div className="menu-titulo">
          Proyectos
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="menu-cuerpo menu-proyectos">
          {proyectos.length === 0 ? (
            <p className="proyectos-vacio">
              No hay proyectos guardados todavía. Crea uno con «Guardar como proyecto…».
            </p>
          ) : (
            proyectos.map((p) => (
              <div key={p.id} className={`proyecto-fila${p.id === proyectoActivo ? " activo" : ""}`}>
                <span className="proyecto-nombre" title={`Proyecto #${p.id}`}>
                  {p.nombre}
                  {p.id === proyectoActivo && <span className="proyecto-activo-marca"> · vinculado</span>}
                </span>
                <span className="proyecto-acciones">
                  <button onClick={() => onAbrir(p.id)} title="Abrir el proyecto en una pestaña nueva">
                    Abrir
                  </button>
                  <button onClick={() => onGuardarEn(p.id)} title="Guardar la pestaña actual en este proyecto">
                    Guardar aquí
                  </button>
                  <button
                    onClick={() => onBorrar(p.id)}
                    title="Borrar el proyecto"
                    className="proyecto-borrar"
                  >
                    Borrar
                  </button>
                </span>
              </div>
            ))
          )}
          <div className="proyecto-nuevo">
            <input
              value={nuevo}
              placeholder="Nombre del proyecto nuevo…"
              spellCheck={false}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") crear();
              }}
            />
            <button onClick={crear} disabled={!nuevo.trim()} title="Crear proyecto y guardar la pestaña actual en él">
              Guardar como proyecto…
            </button>
          </div>
        </div>
        <div className="menu-acciones">
          <button onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </>
  );
}