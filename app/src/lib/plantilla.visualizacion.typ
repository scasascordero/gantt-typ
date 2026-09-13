#import "gantt.typ": *
#set page(margin: 20pt, width: auto, height: auto, fill: rgb("#ffffff"))
#let datos = yaml("datos.yaml")
#carta-gantt(
  datos,
  mostrar-columnas: ("inicio", "termino", "duracion", "avance"),
  margenes: false,
)