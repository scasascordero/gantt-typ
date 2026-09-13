#set page(paper: "a4", flipped: true, margin: 1cm)
#set text(font: "Liberation Sans", size: 7.5pt)

#align(center)[
  #text(size: 14pt, weight: "bold", fill: rgb("#1e293b"))[
    Cronograma Anual de Proyecto (52 Semanas)
  ]
]

#v(0.2cm)

// Colores para Estaciones (Hemisferio Sur)
#let c-verano    = rgb("#fef08a") // Semanas 1-11, 51-52
#let c-otono     = rgb("#fed7aa") // Semanas 12-24
#let c-invierno  = rgb("#bae6fd") // Semanas 25-37
#let c-primavera = rgb("#bbf7d0") // Semanas 38-50

// Colores de Tareas
#let t-blue   = rgb("#2563eb")
#let t-amber  = rgb("#d97706")
#let t-green  = rgb("#059669")
#let t-purple = rgb("#7c3aed")
#let t-red    = rgb("#dc2626")

#table(
  // 1 columna fija para nombres (140pt) + 52 columnas de semanas de igual ancho (1fr)
  columns: (140pt, ..range(52).map(_ => 1fr)),
  stroke: 0.2pt + rgb("#e2e8f0"),
  align: (col, row) => if col == 0 { left + horizon } else { center + horizon },

  // --------------------------------------------------------------------------
  // FILA 1: ESTACIONES DEL AÑO (52 Semanas agrupadas)
  // --------------------------------------------------------------------------
  table.cell(rowspan: 3, fill: rgb("#f8fafc"))[*Tarea / Estación*],
  table.cell(colspan: 11, fill: c-verano)[*Verano* (S1-S11)],
  table.cell(colspan: 13, fill: c-otono)[*Otoño* (S12-S24)],
  table.cell(colspan: 13, fill: c-invierno)[*Invierno* (S25-S37)],
  table.cell(colspan: 13, fill: c-primavera)[*Primavera* (S38-S50)],
  table.cell(colspan: 2, fill: c-verano)[*Ver*],

  // --------------------------------------------------------------------------
  // FILA 2: MESES (12 Meses distribuidos en las 52 Semanas)
  // --------------------------------------------------------------------------
  table.cell(colspan: 4)[*Ene*], table.cell(colspan: 4)[*Feb*], table.cell(colspan: 5)[*Mar*],
  table.cell(colspan: 4)[*Abr*], table.cell(colspan: 4)[*May*], table.cell(colspan: 5)[*Jun*],
  table.cell(colspan: 4)[*Jul*], table.cell(colspan: 4)[*Ago*], table.cell(colspan: 5)[*Sep*],
  table.cell(colspan: 4)[*Oct*], table.cell(colspan: 4)[*Nov*], table.cell(colspan: 5)[*Dic*],

  // --------------------------------------------------------------------------
  // FILA 3: NUMERACIÓN DE SEMANAS (1 a 52)
  // --------------------------------------------------------------------------
  ..range(1, 53).map(s => [#{s}]),

  // --------------------------------------------------------------------------
  // TAREAS DEL PROYECTO
  // --------------------------------------------------------------------------

  // Tarea 1: S1 a S10 (10 semanas)
  [1. Diseño e Ingeniería Base],
  table.cell(colspan: 10, fill: t-blue)[#text(fill: white, weight: "bold")[Ingeniería]],
  table.cell(colspan: 42)[],

  // Tarea 2: S8 a S18 (11 semanas)
  [2. Tramitación de Permisos],
  table.cell(colspan: 7)[],
  table.cell(colspan: 11, fill: t-amber)[#text(fill: white, weight: "bold")[Permisos]],
  table.cell(colspan: 34)[],

  // Hito 1: Semana 18
  [Hito: Permisos Aprobados],
  table.cell(colspan: 17)[],
  table.cell(colspan: 1, fill: t-red)[#text(fill: white, weight: "bold")[★]],
  table.cell(colspan: 34)[],

  // Tarea 3: S19 a S40 (22 semanas)
  [3. Construcción y Montaje],
  table.cell(colspan: 18)[],
  table.cell(colspan: 22, fill: t-green)[#text(fill: white, weight: "bold")[Construcción en Terreno]],
  table.cell(colspan: 12)[],

  // Tarea 4: S38 a S48 (11 semanas)
  [4. Pruebas y Comisionamiento],
  table.cell(colspan: 37)[],
  table.cell(colspan: 11, fill: t-purple)[#text(fill: white, weight: "bold")[QA & Pruebas]],
  table.cell(colspan: 4)[],

  // Hito 2: Semana 50
  [Hito: Puesta en Marcha],
  table.cell(colspan: 49)[],
  table.cell(colspan: 1, fill: t-red)[#text(fill: white, weight: "bold")[★]],
  table.cell(colspan: 2)[],
)