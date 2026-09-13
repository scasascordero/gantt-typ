#import "@preview/gantty:0.1.0": gantt, task, milestone, group

#set page(paper: "a4", flipped: true, margin: 1.5cm)
#set text(font: "Liberation Sans", size: 10pt)

#align(center)[
  #text(size: 16pt, weight: "bold", fill: rgb("#1e293b"))[
    Cronograma de Desarrollo de Proyecto
  ]
]

#v(1cm)

#gantt(
  // Tarea: (Nombre, Día Inicio, Día Fin)
  task([1. Investigación de Mercado], 1, 4),
  task([2. Diseño de Arquitectura], 3, 7),
  
  // Hito: (Nombre, Día)
  milestone([Aprobación del Cliente], 7),

  task([3. Desarrollo Backend en Rust], 7, 14),
  task([4. Implementación Frontend], 10, 16),
  
  milestone([Despliegue en Staging], 16),

  task([5. Pruebas de Carga y QA], 16, 19),
  milestone([Lanzamiento a Producción], 20),
)