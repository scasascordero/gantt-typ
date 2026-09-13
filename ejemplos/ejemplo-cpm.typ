// ejemplo-cpm.typ
// Cartas Gantt con CPM: las fechas de B y D se CALCULAN desde sus
// predecesoras (no llevan 'inicio'), y la ruta crítica (B -> D) se resalta
// en rojo con flechas de dependencia.
//
// La red de ejemplo:
//   A: inicio fijo 2026-01-05, duración 5        (ancla)
//   B: duración 4, depende de A (fs)             -> inicia "2026-01-10"
//   C: duración 3, depende de A con ss + 2dias    -> inicia "2026-01-07"
//   D: duración 2, depende de B y C (fs)          -> inicia "2026-01-14"
//
// Ruta crítica: B -> D (holgura 0). Holguras: A=5, C=6.
// Las comprobaciones con #assert corren al compilar: si fallan, la
// compilación de este archivo falla (es la prueba del motor CPM).

#import "@local/gantt:0.1.0": carta-gantt, preparar-tareas, a-dia-juliano

#let tareas = (
  (codigo: "A", nombre: "Cimentación", inicio: "2026-01-05", duracion: 5),
  (codigo: "B", nombre: "Obra gruesa", duracion: 4, predecesoras: "A"),
  (codigo: "C", nombre: "Compras", duracion: 3, predecesoras: "A:ss:2"),
  (codigo: "D", nombre: "Techado", duracion: 2, predecesoras: "B;C"),
)

#let filas = preparar-tareas(tareas, cpm: true)
#let fila(c) = filas.find(f => f.codigo == c)

// --- Comprobaciones del pase hacia adelante ------------------------------
#assert(fila("B").inicio-temprano-dias == a-dia-juliano("2026-01-10"), message: "B debería iniciar el 2026-01-10")
#assert(fila("C").inicio-temprano-dias == a-dia-juliano("2026-01-07"), message: "C debería iniciar el 2026-01-07")
#assert(fila("D").inicio-temprano-dias == a-dia-juliano("2026-01-14"), message: "D debería iniciar el 2026-01-14")
#assert(fila("D").termino-temprano-dias == a-dia-juliano("2026-01-15"), message: "D debería terminar el 2026-01-15")

// --- Comprobaciones del pase hacia atrás (holguras y ruta crítica) -------
#assert(fila("A").holgura == 5, message: "A debería tener holgura 5")
#assert(fila("B").holgura == 0, message: "B debería estar en ruta crítica")
#assert(fila("C").holgura == 6, message: "C debería tener holgura 6")
#assert(fila("D").holgura == 0, message: "D debería estar en ruta crítica")
#assert(fila("A").critico == false, message: "A no es crítica")
#assert(fila("B").critico == true, message: "B debería ser crítica")
#assert(fila("C").critico == false, message: "C no es crítica")
#assert(fila("D").critico == true, message: "D debería ser crítica")

// --- La carta -------------------------------------------------------------
#carta-gantt(
  tareas,
  titulo: [Cronograma con CPM — ruta crítica resaltada],
  cpm: true,
  mostrar-duracion: true,
  mostrar-columnas: ("inicio", "duracion", "holgura", "critico"),
  nivel-anio: false,
  nivel-semana: true,
  nivel-dia: true,
)