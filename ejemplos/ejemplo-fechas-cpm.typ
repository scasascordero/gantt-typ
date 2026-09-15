// ejemplo-fechas-cpm.typ
// Carta Gantt con CPM INYECTADO (`fechas-cpm`): los resultados del motor
// llegan precalculados (p. ej. desde petgraph/Rust en la app) y la librería
// los usa sin recalcular el CPM interno. Este ejemplo construye el dict de
// inyección a partir de las filas del CPM interno y demuestra que ambos
// caminos producen las MISMAS filas: la prueba son los #assert de abajo.
//
// Red de ejemplo (idéntica a ejemplo-cpm.typ):
//   A: inicio fijo 2026-01-05, duración 5        (ancla)
//   B: duración 4, predecesora A (fs)            -> inicia "2026-01-10"
//   C: duración 3, predecesora A (ss + 2 días)    -> inicia "2026-01-07"
//   D: duración 2, predecesoras B y C (fs)        -> inicia "2026-01-14"
// Ruta crítica: A -> B -> D (holgura 0). Holgura de C: 4.

#import "@local/gantt:0.1.0": carta-gantt, preparar-tareas, a-dia-juliano

#let tareas = (
  (codigo: "A", nombre: "Cimentación", inicio: "2026-01-05", duracion: 5),
  (codigo: "B", nombre: "Obra gruesa", duracion: 4, predecesoras: "A"),
  (codigo: "C", nombre: "Compras", duracion: 3, predecesoras: "A:ss:2"),
  (codigo: "D", nombre: "Techado", duracion: 2, predecesoras: "B;C"),
)

// Referencia: CPM interno (motor cpm.typ).
#let filas-ref = preparar-tareas(tareas, cpm: true)
#let fila-ref(c) = filas-ref.find(f => f.codigo == c)

// Construye el dict de inyección tal como lo arma la app (desde las filas
// enriquecidas del motor): las hojas con holgura definida entran con
// es/ef/ls/lf/holgura/critico + inicio-dias/termino-dias/duracion +
// predecesoras (ya normalizadas a id). Los grupos no llevan entrada.
#let construir-inyeccion(filas) = {
  let inj = (:)
  for f in filas {
    if f.at("holgura", default: none) == none { continue }
    inj.insert(f.codigo, (
      es: f.inicio-temprano-dias,
      ef: f.termino-temprano-dias,
      ls: f.inicio-tardio-dias,
      lf: f.termino-tardio-dias,
      holgura: f.holgura,
      critico: f.critico,
      "inicio-dias": f.inicio-dias,
      "termino-dias": f.termino-dias,
      duracion: f.duracion,
      predecesoras: f.predecesoras,
    ))
  }
  inj
}

#let iny = construir-inyeccion(filas-ref)
#let filas-inj = preparar-tareas(tareas, fechas-cpm: iny)
#let fila-inj(c) = filas-inj.find(f => f.codigo == c)

// --- La inyección respeta las fechas, holguras y la ruta crítica ----------
#assert(fila-inj("B").inicio-dias == a-dia-juliano("2026-01-10"), message: "B debería iniciar 2026-01-10 con CPM inyectado")
#assert(fila-inj("C").inicio-dias == a-dia-juliano("2026-01-07"), message: "C debería iniciar 2026-01-07 con CPM inyectado")
#assert(fila-inj("D").inicio-dias == a-dia-juliano("2026-01-14"), message: "D debería iniciar 2026-01-14 con CPM inyectado")
#assert(fila-inj("D").termino-dias == a-dia-juliano("2026-01-15"), message: "D debería terminar 2026-01-15 con CPM inyectado")
#assert(fila-inj("A").holgura == 0, message: "A debería tener holgura 0")
#assert(fila-inj("C").holgura == 4, message: "C debería tener holgura 4")
#assert(fila-inj("A").critico == true and fila-inj("B").critico == true and fila-inj("C").critico == false and fila-inj("D").critico == true, message: "La ruta crítica inyectada debería ser A->B->D")

// --- La inyección produce las mismas filas que el CPM interno --------------
#let campos = ("inicio-dias", "termino-dias", "duracion", "inicio-temprano-dias", "termino-temprano-dias", "inicio-tardio-dias", "termino-tardio-dias", "holgura", "critico")
#for c in ("A", "B", "C", "D") {
  for campo in campos {
    assert(fila-ref(c).at(campo) == fila-inj(c).at(campo), message: "Divergencia CPM interno vs inyectado en " + c + "." + campo)
  }
}

// --- La carta con inyección (mismo dibujo que con CPM interno) -------------
#carta-gantt(
  tareas,
  titulo: [Cronograma con CPM inyectado (fechas-cpm)],
  fechas-cpm: iny,
  mostrar-duracion: true,
  mostrar-columnas: ("inicio", "duracion", "holgura", "critico"),
  nivel-anio: false,
  nivel-semana: true,
  nivel-dia: true,
)