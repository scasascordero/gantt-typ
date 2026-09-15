#import "gantt.typ": *
#set page(margin: 20pt, fill: rgb("#ffffff"))
#let datos = yaml("datos.yaml")
#carta-gantt(
  datos,
  fechas-cpm: datos.at("fechas-cpm", default: none),
  mostrar-columnas: ("inicio", "termino", "duracion", "avance"),
)