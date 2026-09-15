// MenuTarea.tsx — menú contextual que abre el botón derecho sobre el código
// de una actividad en el editor YAML: clonar, copiar, pegar, mover, añadir
// hermana/subtarea y borrar. Las mutaciones se aplican al texto del editor.

import { useState } from "react";
import {
  anadirHermana,
  anadirSubtarea,
  borrarTarea,
  clonarTarea,
  copiarTarea,
  moverTareas,
  pegarTareas,
  type Direccion,
} from "./lib/yamlOperaciones";

interface Props {
  x: number;
  y: number;
  codigo: string;
  nombre: string;
  texto: string;
  copiado: string;
  onCambiar: (texto: string) => void;
  onCopia: (texto: string) => void;
  onAviso: (mensaje: string) => void;
  onPredecesoras: () => void;
  onCerrar: () => void;
}

export default function MenuTarea({
  x,
  y,
  codigo,
  nombre,
  texto,
  copiado,
  onCambiar,
  onCopia,
  onAviso,
  onPredecesoras,
  onCerrar,
}: Props) {
  const [armado, setArmado] = useState(false);

  const aplicar = (op: (texto: string, ref: string) => string) => {
    try {
      const nuevo = op(texto, codigo);
      if (nuevo) onCambiar(nuevo);
    } catch (err) {
      onAviso(`No se pudo ejecutar la operación: ${String(err)}`);
    }
    onCerrar();
  };

  const mover = (dir: Direccion) => aplicar((t, c) => moverTareas(t, c, dir));

  const copiar = () => {
    try {
      const copia = copiarTarea(texto, codigo);
      if (copia) onCopia(copia);
      else onAviso("No se pudo copiar la tarea");
    } catch (err) {
      onAviso(`No se pudo copiar la tarea: ${String(err)}`);
    }
  };

  const pegar = () => {
    try {
      const nuevo = pegarTareas(texto, copiado, codigo);
      if (nuevo) onCambiar(nuevo);
    } catch (err) {
      onAviso(`No se pudo pegar: ${String(err)}`);
    }
    onCerrar();
  };

  const borrar = () => {
    if (!armado) {
      setArmado(true);
      return;
    }
    aplicar(borrarTarea);
  };

  return (
    <>
      <div className="menu-fondo" onClick={onCerrar} onContextMenu={(e) => e.preventDefault()} />
      <div
        className="menu-tarea"
        style={{
          left: Math.min(x, window.innerWidth - 230),
          top: Math.min(y, window.innerHeight - 360),
        }}
        role="dialog"
        aria-label={`Acciones para la tarea ${codigo}`}
      >
        <div className="menu-tarea-titulo">
          <span>
            Tarea {codigo}
            <small>{nombre}</small>
          </span>
          <button className="menu-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="menu-tarea-cuerpo">
          <button onClick={copiar} title="Copiar la tarea con su subárbol">
            ⧉ Copiar
          </button>
          <button onClick={() => aplicar(clonarTarea)} title="Duplicar la tarea justo debajo">
            ⧉ Clonar
          </button>
          <button
            onClick={pegar}
            disabled={!copiado}
            title={copiado ? "Pegar la copia debajo de esta tarea" : "Primero copia una tarea"}
          >
            ⧈ Pegar
          </button>
          <div className="menu-tarea-sep" />
          <button onClick={onPredecesoras} title="Abrir el editor de dependencias de esta tarea">
            ↳ Predecesoras…
          </button>
          <div className="menu-tarea-sep" />
          <div className="menu-tarea-grupo">Mover</div>
          <button onClick={() => mover("subir")} title="Subir en su nivel">
            ↑ Subir
          </button>
          <button onClick={() => mover("bajar")} title="Bajar en su nivel">
            ↓ Bajar
          </button>
          <button onClick={() => mover("indentar")} title="Convertir en subtarea de la anterior">
            → Indentar
          </button>
          <button onClick={() => mover("sacar")} title="Sacar del grupo (subir de nivel)">
            ← Sacar
          </button>
          <div className="menu-tarea-sep" />
          <button onClick={() => aplicar(anadirHermana)} title="Añadir una tarea hermana debajo">
            ＋ Añadir hermana
          </button>
          <button onClick={() => aplicar(anadirSubtarea)} title="Añadir una subtarea a esta tarea">
            ＋ Añadir subtarea
          </button>
          <div className="menu-tarea-sep" />
          <button
            className="destructivo"
            onClick={borrar}
            title="Borra la tarea y todo su subárbol"
          >
            {armado ? "¿Seguro? Borrar" : "🗑 Borrar"}
          </button>
        </div>
      </div>
    </>
  );
}