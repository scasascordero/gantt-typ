#import "@local/gantt:0.1.0": carta-gantt

// Este archivo define su propia página (us-letter), a diferencia de
// los demás ejemplos, que dejan que carta-gantt autodimensione la suya.
#set page(paper: "us-letter", margin: 2cm)
#set text(font: "Liberation Sans", size: 10pt)

= Informe de avance del proyecto

Este es un documento normal, con su propio título, texto y márgenes.
La carta Gantt de abajo se inserta como cualquier otro contenido, usando
el ancho disponible de la página (sin `pagina: false` tendría que crear
su propia página, del tamaño exacto de la carta, y eso rompería este
documento).

#carta-gantt(
  yaml("datos.yaml"),
  pagina: false,
  titulo: [Cronograma],
  nivel-semana: false
)

O puede mostrar solamente el nivel 1:

#carta-gantt(
  yaml("datos.yaml"),
  pagina: false,
  titulo: [Cronograma],
  nivel-semana: false,
  mostrar-niveles: 1,
)


O la puede mostrar en una página apaisada:

#pagebreak()
#set page(flipped: true)

#carta-gantt(
  yaml("datos.yaml"),
  pagina: false,
  titulo: [Cronograma],
  nivel-semana: false
)


#pagebreak()
#set page(flipped: false)

Después de la carta Gantt sigue más texto normal.