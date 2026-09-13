#set page(paper: "a4", flipped: true, margin: 1.5cm)
#set text(font: "Liberation Sans", size: 9pt)

#align(center)[
  #text(size: 15pt, weight: "bold", fill: rgb("#1e293b"))[
    Cronograma de Proyecto Nativo
  ]
]

#v(0.5cm)

// Colores del tema
#let bg-header = rgb("#f1f5f9")
#let c-blue = rgb("#3b82f6")
#let c-green = rgb("#10b981")
#let c-purple = rgb("#8b5cf6")
#let c-red = rgb("#ef4444")

#table(
  // Definimos la columna de tareas y 10 columnas de días/semanas
  columns: (150pt, ..range(10).map(_ => 1fr)),
  stroke: (x, y) => if y == 0 { (bottom: 1.5pt + rgb("#94a3b8")) } else { 0.5pt + rgb("#e2e8f0") },
  align: (col, row) => if col == 0 { left + horizon } else { center + horizon },
  fill: (col, row) => if row == 0 { bg-header },

  // --- Encabezado ---
  [*Tarea / Etapa*], [*D1*], [*D2*], [*D3*], [*D4*], [*D5*], [*D6*], [*D7*], [*D8*], [*D9*], [*D10*],

  // --- Fila 1: Investigación ---
  [1. Investigación y Requerimientos],
  table.cell(colspan: 3, fill: c-blue)[#text(fill: white, weight: "bold")[Inicio]],
  table.cell(colspan: 7)[],

  // --- Fila 2: Diseño de Arquitectura ---
  [2. Diseño de Arquitectura],
  table.cell(colspan: 2)[],
  table.cell(colspan: 3, fill: c-blue)[#text(fill: white, weight: "bold")[Diseño]],
  table.cell(colspan: 5)[],

  // --- Fila 3: Desarrollo Backend ---
  [3. Desarrollo Backend (Rust)],
  table.cell(colspan: 4)[],
  table.cell(colspan: 4, fill: c-green)[#text(fill: white, weight: "bold")[Backend]],
  table.cell(colspan: 2)[],

  // --- Fila 4: Pruebas y QA ---
  [4. Pruebas y QA],
  table.cell(colspan: 7)[],
  table.cell(colspan: 2, fill: c-purple)[#text(fill: white, weight: "bold")[QA]],
  table.cell(colspan: 1)[],

  // --- Fila 5: Hito / Lanzamiento ---
  [5. Hito: Lanzamiento],
  table.cell(colspan: 9)[],
  table.cell(colspan: 1, fill: c-red)[#text(fill: white, weight: "bold")[★]],
)