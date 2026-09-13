#import "gantt.typ": *
#set page(margin: 20pt, fill: rgb("#ffffff"))
#let datos = yaml("datos.yaml")
#carta-gantt(
  datos,
  mostrar-columnas: ("inicio", "termino", "duracion", "avance"),
)