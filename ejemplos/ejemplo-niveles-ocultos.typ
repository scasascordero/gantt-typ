#import "@local/gantt:0.1.0": carta-gantt

#carta-gantt(
  yaml("datos.yaml"),
  titulo: [Cronograma — (prueba mostrar-niveles)],
  mostrar-niveles: 2,
  ventana-inicio: "2026-01-01",
  ventana-fin: "2026-07-29",
  nivel-semana: true,
  mostrar-dia-inicio-semana: true,
  color-tarea: rgb("#94b0ec"),
  color-avance: rgb("#6d7b9b"),
  color-calendario: rgb("#f5f9fd"),
  color-rejilla: rgb("#e2e8f0"),
  nivel-anio: true,
  mostrar-columnas: ("inicio", "termino")
)

