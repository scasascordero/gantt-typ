#import "@local/gantt:0.1.0": carta-gantt

#carta-gantt(
  yaml("datos.yaml"),
  titulo: [Cronograma con columnas de datos],
  mostrar-columnas: ("inicio", "termino", "duracion", "avance"),
)
