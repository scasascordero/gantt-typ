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
// Son invariantes (no fijan fechas): puedes cambiar duraciones sin tocar los
// asserts. El bloque `ajustes` más abajo además permite probar escenarios
// "qué pasa si" y el motor recalcula todo en cada compilación.

#import "@local/gantt:0.1.0": carta-gantt, preparar-tareas, a-dia-juliano

#let tareas = (
  (
    codigo: "1",
    nombre: "Ingeniería y permisos",
    subtareas: (
      (codigo: "1.1", nombre: "Levantamiento geotécnico", inicio: "2026-01-05", duracion: 30),
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

// --- Qué pasa si: cambia duraciones SIN tocar `tareas` ----------------------
// Cada dict de `ajustes` trae `codigo` + los campos por reemplazar (duracion,
// inicio, predecesoras...). El motor recalcula TODO en cada compilación:
// fechas, holguras, ruta crítica y flechas se derivan solas de esos números.
// Para volver a la red original pon `ajustes = ()`.
#let ajustes = ((codigo: "3.3", duracion: 140),)

#let ajuste-de(ajustes, codigo) = {
  let partidos = ajustes.filter(a => a.codigo == codigo)
  if partidos.len() == 0 { none } else { partidos.at(0) }
}
#let aplicar-ajustes(nodo, ajustes) = nodo.map(t => {
  let a = ajuste-de(ajustes, t.codigo)
  if t.at("subtareas", default: none) != none {
    (: ..t, subtareas: aplicar-ajustes(t.subtareas, ajustes))
  } else if a == none {
    t
  } else {
    let resto = (:)
    for (k, v) in a.pairs() {
      if k != "codigo" { resto.insert(k, v) }
    }
    (: ..t, ..resto)
  }
})
#let filas-aj = preparar-tareas(aplicar-ajustes(tareas, ajustes), cpm: true)
#let fila-aj(c) = filas-aj.find(f => f.codigo == c)

// --- Invariantes del motor (valen para CUALQUIER duración) ------------------
// No fijan fechas ni holguras: comprueban la coherencia interna del motor con
// cualquier dato. Por eso puedes cambiar duraciones a mano y seguir compilando.
#let verificar-invariantes(filas, etiqueta) = {
  for f in filas {
    if f.at("holgura", default: none) == none { continue }
    assert(f.inicio-tardio-dias >= f.inicio-temprano-dias, message: (etiqueta, "/", f.codigo, ": inicio tardío >= temprano").join())
    assert(f.termino-tardio-dias >= f.termino-temprano-dias, message: (etiqueta, "/", f.codigo, ": término tardío >= temprano").join())
    assert(f.holgura == f.inicio-tardio-dias - f.inicio-temprano-dias, message: (etiqueta, "/", f.codigo, ": holgura = tardío - temprano").join())
    assert(f.critico == (f.holgura == 0), message: (etiqueta, "/", f.codigo, ": crítico <=> holgura nula").join())
    assert(f.termino-temprano-dias == f.inicio-temprano-dias + f.duracion - 1, message: (etiqueta, "/", f.codigo, ": término = inicio + duración - 1").join())
  }
}
#verificar-invariantes(filas, "base")

// --- Prueba de recálculo "qué pasa si" --------------------------------------
#if ajustes.len() > 0 {
  verificar-invariantes(filas-aj, "QSF")
  let a0 = ajustes.at(0)
  let br = fila(a0.codigo)
  let delta = if a0.at("duracion", default: none) == none { 0 } else {
    a0.at("duracion") - br.duracion
  }
  assert(fila-aj(a0.codigo).termino-temprano-dias == br.termino-temprano-dias + delta,
    message: ("QSF: ", a0.codigo, " recalculó su término (", str(delta), " días)").join())
  assert(fila-aj("4.5").termino-temprano-dias >= fila("4.5").termino-temprano-dias,
    message: "QSF: el fin del proyecto nunca se adelanta")
}

// --- La carta (línea base) ----------------------------------------------------
#let opciones-proyecto = (
  cpm: true,
  ancho-linea-tiempo: 26cm,
  nivel-anio: true,
  nivel-mes: true,
  nivel-semana: false,
  nivel-dia: false,
  mostrar-duracion: true,
  mostrar-columnas: ("inicio", "duracion", "holgura"),
  mostrar-niveles: 2,
  mostrar-hoy: true,
)
#carta-gantt(tareas, titulo: [Cronograma maestro 2026–2027 — 20 actividades en 4 frentes, CPM], ..opciones-proyecto)

// --- Carta "qué pasa si" (solo cuando hay ajustes) ----------------------------
#if ajustes.len() > 0 [
  #v(1.4em)
  #carta-gantt(
    aplicar-ajustes(tareas, ajustes),
    titulo: [Qué pasa si — #(ajustes.at(0).codigo) con duración de #(ajustes.at(0).duracion) días],
    ..opciones-proyecto,
  )
]