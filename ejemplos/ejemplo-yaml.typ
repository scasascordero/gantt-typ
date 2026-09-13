#import "@local/gantt:0.1.0": carta-gantt

// yaml() es nativo de Typst y se resuelve relativo a este archivo, así
// que no depende de --root ni de dónde viva la librería.
// Se listan explícitamente todos los parámetros de carta-gantt (aunque
// queden en su valor por defecto) a modo de referencia rápida.
#carta-gantt(
  yaml("datos.yaml"),
  titulo: [Cronograma de Proyecto],
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
  color: none,
  mostrar-codigo: true,
  mostrar-duracion: false,
  mostrar-barra-grupo: true,
  mostrar-hoy: false,
  ventana-inicio: none,
  ventana-fin: none,
  nivel-anio: auto,
  nivel-mes: auto,
  nivel-semana: auto,
  nivel-dia: auto,
  mostrar-dia-inicio-semana: false,
  mostrar-columnas: (),
)
