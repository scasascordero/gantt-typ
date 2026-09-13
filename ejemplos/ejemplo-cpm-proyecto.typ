// ejemplo-cpm-proyecto.typ
// Carta Gantt maestra de ~20 tareas en 4 frentes de trabajo, duración total
// de unos 2 años (ene-2026 a dic-2027), con todas las fechas CALCULADAS por
// el motor CPM desde las predecesoras (solo 1.1 tiene 'inicio' fijo, como
// ancla) y la ruta crítica resaltada en rojo con flechas de dependencia.
//
// La red usa los 4 tipos de dependencia: fs, ss con lag, ff/... — ver el
// campo `predecesoras` de cada tarea:
//   "3.1;2.3"  -> fs de 3.1 y fs de 2.3
//   "1.4:ss:30"-> ss con lag 30 (la sucesora arranca 30 días después del
//                inicio de la predecesora)
// Las tareas con holgura (0 < holgura < 390) son los frentes "elásticos" del
// cronograma; las de holgura 0 son la ruta crítica.
//
// Cabecera: solo años y meses (nivel-anio y nivel-mes); se ocultan semanas y
// días porque a 2 años de ventana no aportan legibilidad.
//
// Las comprobaciones con #assert corren al compilar: son la prueba del motor.

#import "@local/gantt:0.1.0": carta-gantt, preparar-tareas, a-dia-juliano

#let tareas = (
  (
    codigo: "1",
    nombre: "Ingeniería y permisos",
    subtareas: (
      (codigo: "1.1", nombre: "Levantamiento geotécnico", inicio: "2026-01-05", duracion: 60),
      (codigo: "1.2", nombre: "Ingeniería básica", duracion: 80, predecesoras: "1.1"),
      (codigo: "1.3", nombre: "Ingeniería de detalle", duracion: 120, predecesoras: "1.2"),
      (codigo: "1.4", nombre: "Revisión de constructibilidad", duracion: 30, predecesoras: "1.3"),
      (codigo: "1.5", nombre: "Permisos sectoriales", duracion: 40, predecesoras: "1.4"),
    ),
  ),
  (
    codigo: "2",
    nombre: "Obra civil",
    subtareas: (
      (codigo: "2.1", nombre: "Movimiento de tierras", duracion: 70, predecesoras: "1.2"),
      (codigo: "2.2", nombre: "Fundaciones", duracion: 90, predecesoras: "2.1"),
      (codigo: "2.3", nombre: "Estructura de hormigón", duracion: 110, predecesoras: "2.2"),
      (codigo: "2.4", nombre: "Cierres y tabiquería", duracion: 70, predecesoras: "2.3"),
      (codigo: "2.5", nombre: "Techumbre", duracion: 40, predecesoras: "2.4:ss:20"),
    ),
  ),
  (
    codigo: "3",
    nombre: "Equipamiento y montaje",
    subtareas: (
      (codigo: "3.1", nombre: "Adquisición de equipos mayores", duracion: 150, predecesoras: "1.4:ss:30"),
      (codigo: "3.2", nombre: "Distribución eléctrica", duracion: 70, predecesoras: "2.3"),
      (codigo: "3.3", nombre: "Montaje de equipos", duracion: 110, predecesoras: "3.1;2.3"),
      (codigo: "3.4", nombre: "Sistema de climatización", duracion: 50, predecesoras: "2.4"),
      (codigo: "3.5", nombre: "Instrumentación y control", duracion: 60, predecesoras: "3.3:ss:20"),
    ),
  ),
  (
    codigo: "4",
    nombre: "Puesta en marcha",
    subtareas: (
      (codigo: "4.1", nombre: "Pruebas de vacío", duracion: 30, predecesoras: "3.2;3.3;3.4;3.5"),
      (codigo: "4.2", nombre: "Comisionamiento mecánico", duracion: 45, predecesoras: "4.1"),
      (codigo: "4.3", nombre: "Pruebas integrales", duracion: 70, predecesoras: "4.2"),
      (codigo: "4.4", nombre: "Capacitación del personal", duracion: 30, predecesoras: "4.3:ss:20"),
      (codigo: "4.5", nombre: "Entrega y cierre de obra", duracion: 25, predecesoras: "4.3;4.4"),
    ),
  ),
)

#let filas = preparar-tareas(tareas, cpm: true)
#let fila(c) = filas.find(f => f.codigo == c)
#let d0 = a-dia-juliano("2026-01-05")   // día juliano del ancla 1.1

// --- Cálculos clave del pase hacia adelante --------------------------------
#assert(fila("1.1").inicio-temprano-dias == d0, message: "1.1 arranca el 2026-01-05")
#assert(fila("1.3").inicio-temprano-dias == d0 + 140, message: "1.3 inicia 140 días después de 1.1")
#assert(fila("1.5").inicio-temprano-dias == d0 + 290, message: "1.5 inicia tras 1.4 (290)")
#assert(fila("3.1").inicio-temprano-dias == d0 + 290, message: "3.1 = 1.4:ss:30 arranca en 290")
#assert(fila("3.3").inicio-temprano-dias == d0 + 440, message: "3.3 espera a 3.1 (440)")
#assert(fila("4.1").inicio-temprano-dias == d0 + 550, message: "4.1 espera el montaje (550)")
#assert(fila("4.5").inicio-temprano-dias == d0 + 695, message: "4.5 arranca en 695")
#assert(fila("4.5").termino-temprano-dias == d0 + 719, message: "El proyecto termina en 719 (~2027-12-25)")

// --- Holguras y ruta crítica -------------------------------------------------
#assert(fila("1.1").holgura == 0, message: "1.1 en ruta crítica")
#assert(fila("1.4").holgura == 0, message: "1.4 restringe a 3.1 por ss -> crítica")
#assert(fila("1.5").holgura == 390, message: "1.5 tiene 390 días de holgura")
#assert(fila("2.1").holgura == 20, message: "2.1 tiene 20 días de holgura")
#assert(fila("2.5").holgura == 250, message: "2.5 (techumbre) tiene 250 días de holgura")
#assert(fila("3.2").holgura == 70, message: "3.2 tiene 70 días de holgura")
#assert(fila("3.4").holgura == 20, message: "3.4 tiene 20 días de holgura")
#assert(fila("3.5").holgura == 30, message: "3.5 tiene 30 días de holgura")
#assert(fila("4.3").holgura == 0, message: "4.3 en ruta crítica")
#assert(fila("4.4").holgura == 20, message: "4.4 tiene 20 días de holgura")
#assert(fila("4.5").holgura == 0, message: "4.5 cierra la ruta crítica")
#assert(fila("3.1").critico == true, message: "3.1 es crítica")
#assert(fila("3.3").critico == true, message: "3.3 es crítica")
#assert(fila("2.1").critico == false, message: "2.1 no es crítica")
#assert(fila("1.5").critico == false, message: "1.5 no es crítica")

// --- Sobre (rollup) de los grupos -------------------------------------------
#assert(fila("1").inicio-dias == d0, message: "Grupo 1 abre en 2026-01-05")
#assert(fila("4").termino-dias == d0 + 719, message: "Grupo 4 cierra el proyecto")
#assert(fila("4").critico == true, message: "Grupo 4 es crítico (tiene hijas críticas)")

// --- La carta ---------------------------------------------------------------
#carta-gantt(
  tareas,
  titulo: [Cronograma maestro 2026–2027 — 20 actividades en 4 frentes, CPM],
  cpm: true,
  ancho-linea-tiempo: 26cm,
  nivel-anio: true,
  nivel-mes: true,
  nivel-semana: false,
  nivel-dia: false,
  mostrar-duracion: true,
  mostrar-columnas: ("inicio", "duracion", "holgura"),
)