#import "@local/gantt:0.1.0": carta-gantt

// El avance también puede ser una serie de incrementos que se van
// acumulando a lo largo de la tarea, en vez de un solo número. Se puede
// escribir como lista (YAML) o como texto separado por punto y coma
// (útil en CSV/Excel).
#let tareas = (
  (
    codigo: "1",
    nombre: "Diseño (avance en 4 periodos: 10%, 20%, 15%, 20% = 65% total)",
    inicio: "2026-01-01",
    duracion: 40,
    avance: (0.1, 0.2, 0.15, 0.2),
  ),
  (
    codigo: "2",
    nombre: "Desarrollo (misma serie, como texto separado por ;)",
    inicio: "2026-01-01",
    duracion: 40,
    avance: "0.1;0.2;0.15;0.2",
  ),
  (
    codigo: "3",
    nombre: "Referencia: mismo 65% como número único",
    inicio: "2026-01-01",
    duracion: 40,
    avance: 0.65,
  ),
)

#carta-gantt(
  tareas,
  titulo: [Avance como serie de incrementos acumulados],
  mostrar-columnas: ("avance",),
)
