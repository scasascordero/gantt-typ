#import "@local/gantt:0.1.0": carta-gantt

// Se listan explícitamente todos los parámetros de carta-gantt (aunque
// queden en su valor por defecto) a modo de referencia rápida.
#carta-gantt(
  yaml("datos.yaml"),
  titulo: [Cronograma — niveles y ventana personalizados],
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
  mostrar-duracion: true,
  mostrar-barra-grupo: false,
  mostrar-hoy: false,
  ventana-inicio: "2025-12-01",
  ventana-fin: "2026-04-30",
  nivel-anio: false,
  nivel-mes: true,
  nivel-semana: true,
  nivel-dia: true,
  mostrar-dia-inicio-semana: true,
  mostrar-columnas: (),
)
// ejemplo:
// mostrar-columnas: ("inicio", "termino", "duracion", "avance")
