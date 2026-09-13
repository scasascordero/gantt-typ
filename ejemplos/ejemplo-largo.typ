#import "@local/gantt:0.1.0": carta-gantt, fecha-desde-dias, dias-desde-epoca

#let base = dias-desde-epoca(2026, 1, 1)
#let tareas-largas = range(1, 61).map(i => {
  let ini = base + calc.rem(i * 11, 900)
  let f = fecha-desde-dias(ini)
  (
    codigo: str(i),
    nombre: "Actividad de terreno número " + str(i),
    inicio: str(f.anio) + "-" + str(f.mes) + "-" + str(f.dia),
    duracion: calc.rem(i * 7, 20) + 5,
    avance: calc.rem(i, 10) / 10,
  )
})

// Se listan explícitamente todos los parámetros de carta-gantt (aunque
// queden en su valor por defecto) a modo de referencia rápida.
#carta-gantt(
  tareas-largas,
  titulo: [Cronograma Multi-Año (60 actividades)],
  ancho-nombre: auto,
  ancho-linea-tiempo: 20cm,
  alto-fila: 0.6cm,
  margen: 1cm,
  fuente: "Liberation Sans",
  tamano-fuente: 8pt,
  indent-por-nivel: 0.4cm,
  color-grupo: rgb("#475569"),
  color-tarea: rgb("#2563eb"),
  color-avance: rgb("#6b7280"),
  color-hito: rgb("#dc2626"),
  color-texto: rgb("#1e293b"),
  color-rejilla: rgb("#e2e8f0"),
  color-calendario: rgb("#f8fafc"),
  color-hoy: rgb("#dc2626"),
  color: f => if f.avance >= 1 { rgb("#16a34a") } else if f.avance > 0 { rgb("#2563eb") } else { rgb("#94a3b8") },
  mostrar-codigo: false,
  mostrar-duracion: false,
  mostrar-barra-grupo: true,
  mostrar-hoy: true,
  ventana-inicio: none,
  ventana-fin: none,
  nivel-anio: auto,
  nivel-mes: auto,
  nivel-semana: auto,
  nivel-dia: auto,
  mostrar-dia-inicio-semana: false,
  mostrar-columnas: (),
)
