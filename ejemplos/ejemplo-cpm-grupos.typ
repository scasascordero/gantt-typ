// ejemplo-cpm-grupos.typ
// CPM con dependencias sobre un GRUPO (tarea con subtareas). Depender de un
// grupo equivale a depender de todas sus hojas: el grupo empieza cuando empieza
// su primera hoja y termina cuando termina la última.
//
// La red de ejemplo (2026-01-05 es el día 5):
//   1     grupo, con las hojas
//   1.1   A: inicio fijo día 5, duración 3        (días 5-7)
//   1.2   B: inicio fijo día 8, duración 4        (días 8-11)
//   2     depende del grupo (fs)                  -> empieza el día 12
//   3     depende del grupo (ss + 1 día)          -> empieza el día 6
//   4     depende del grupo (ff), duración 3      -> termina el día 11
//
// Un grupo NO puede depender de una de sus propias subtareas (error de datos).
// Las comprobaciones con #assert corren al compilar: si fallan, la compilación
// de este archivo falla (es la prueba del motor CPM).

#import "@local/gantt:0.1.0": carta-gantt, preparar-tareas, a-dia-juliano

#let tareas = (
  (codigo: "1", nombre: "Estructura", subtareas: (
    (codigo: "1.1", nombre: "Fundaciones", inicio: "2026-01-05", duracion: 3),
    (codigo: "1.2", nombre: "Muros", inicio: "2026-01-08", duracion: 4),
  )),
  (codigo: "2", nombre: "Terminaciones (después del grupo)", duracion: 2, predecesoras: "1"),
  (codigo: "3", nombre: "Instalaciones (con el grupo, +1 día)", duracion: 2, predecesoras: "1:ss:1"),
  (codigo: "4", nombre: "Inspección (termina con el grupo)", duracion: 3, predecesoras: "1:ff"),
)

#let filas = preparar-tareas(tareas, cpm: true)
#let fila(c) = filas.find(f => f.codigo == c)

// --- Pase hacia adelante ---------------------------------------------------
#assert(fila("2").inicio-temprano-dias == a-dia-juliano("2026-01-12"), message: "2 (fs sobre el grupo) debería iniciar el 2026-01-12")
#assert(fila("2").termino-temprano-dias == a-dia-juliano("2026-01-13"), message: "2 debería terminar el 2026-01-13")
#assert(fila("3").inicio-temprano-dias == a-dia-juliano("2026-01-06"), message: "3 (ss+1 sobre el grupo) debería iniciar el 2026-01-06")
#assert(fila("4").termino-temprano-dias == a-dia-juliano("2026-01-11"), message: "4 (ff sobre el grupo) debería terminar el 2026-01-11")
#assert(fila("4").inicio-temprano-dias == a-dia-juliano("2026-01-09"), message: "4 debería iniciar el 2026-01-09")

// --- Pase hacia atrás: ruta crítica ----------------------------------------
#assert(fila("1.2").critico == true, message: "1.2 (última hoja del grupo) es crítica")
#assert(fila("2").critico == true, message: "2 es crítica")
#assert(fila("1.1").critico == false, message: "1.1 tiene holgura")
#assert(fila("1.1").holgura > 0, message: "1.1 debería tener holgura")

#carta-gantt(
  tareas,
  titulo: [CPM con dependencias sobre un grupo],
  cpm: true,
  mostrar-columnas: ("inicio", "duracion", "holgura", "critico"),
  nivel-anio: false,
  nivel-semana: true,
  nivel-dia: true,
)
