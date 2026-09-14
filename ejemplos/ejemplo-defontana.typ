#import "@local/gantt:0.1.0": carta-gantt

// Cronograma "Defontana" insertado en un documento con formato propio
// (us-letter, márgenes y tipografía de informe). Las fechas y casi todos
// los parámetros vienen del propio defontana.yaml (sección config:); acá
// solo se pasa `pagina: false` para que la carta ocupe el ancho de la
// página en lugar de crearse una propia.

#set page(paper: "us-letter", margin: 2cm)
#set text(font: "Liberation Sans", size: 10pt)

= Informe de avance — cargas mensuales

El siguiente cronograma detalla la carga de los meses de mayo a septiembre
de 2026 y las revisiones asociadas, con su fecha de inicio y su fecha
objetivo.

#carta-gantt(
  yaml("defontana.yaml"),
  pagina: false,
)

Luego de la carta puede seguir el resto del informe.
