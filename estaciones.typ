#set page(paper: "a4", flipped: true, margin: 1cm)
#set text(font: "Liberation Sans", size: 8pt)

#align(center)[
  #text(size: 14pt, weight: "bold", fill: rgb("#1e293b"))[
    Cronograma Anual de Proyecto (365 Días)
  ]
]

#v(0.3cm)

// Paleta de colores para Estaciones del Año (Hemisferio Sur)
#let c-verano  = rgb("#fef08a") // 21 Dic - 20 Mar (80 días en 2026: 1 Ene a 20 Mar + 11 Días a Fin de año)
#let c-otono   = rgb("#fed7aa") // 21 Mar - 20 Jun (92 días)
#let c-invierno = rgb("#bae6fd") // 21 Jun - 20 Sep (92 días)
#let c-primavera = rgb("#bbf7d0") // 21 Sep - 20 Dic (91 días)

// Paleta de Tareas
#let t-blue   = rgb("#2563eb")
#let t-emerald = rgb("#059669")
#let t-purple = rgb("#7c3aed")
#let t-amber  = rgb("#d97706")

#table(
  // Columna fija para el nombre de tarea (130pt) y 365 días distribuidos proporcionalmente
  columns: (130pt, ..range(12).map(_ => 1fr)),
  stroke: 0.3pt + rgb("#e2e8f0"),
  align: (col, row) => if col == 0 { left + horizon } else { center + horizon },

  // --------------------------------------------------------------------------
  // FILA 1: ESTACIONES DEL AÑO (Colspan agrupado por días en 365)
  // --------------------------------------------------------------------------
  table.cell(rowspan: 2, fill: rgb("#f8fafc"))[*Tarea / Estación*],
  table.cell(colspan: 3, fill: c-verano)[*Verano* (80d)],
  table.cell(colspan: 3, fill: c-otono)[*Otoño* (92d)],
  table.cell(colspan: 3, fill: c-invierno)[*Invierno* (92d)],
  table.cell(colspan: 3, fill: c-primavera)[*Primavera* (91d)],
  
  // --------------------------------------------------------------------------
  // FILA 2: MESES DEL AÑO (12 Meses = 365 Días totales)
  // --------------------------------------------------------------------------
  [*Ene*], [*Feb*], [*Mar*], [*Abr*], [*May*], [*Jun*],
  [*Jul*], [*Ago*], [*Sep*], [*Oct*], [*Nov*], [*Dic*],

  // --------------------------------------------------------------------------
  // TAREA 1: Planificación e Ingeniería (Ene 1 - Mar 31 -> 3 Meses / 90 días)
  // --------------------------------------------------------------------------
  [1. Ingeniería de Detalles],
  table.cell(colspan: 3, fill: t-blue)[#text(fill: white, weight: "bold")[Ingeniería]],
  table.cell(colspan: 9)[],

  // --------------------------------------------------------------------------
  // TAREA 2: Licitación y Compras (Mar 1 - Jun 30 -> 4 Meses / 122 días)
  // --------------------------------------------------------------------------
  [2. Licitación de Contratos],
  table.cell(colspan: 2)[],
  table.cell(colspan: 4, fill: t-amber)[#text(fill: white, weight: "bold")[Licitación y Adjudicación]],
  table.cell(colspan: 6)[],

  // --------------------------------------------------------------------------
  // TAREA 3: Obras Terrenos (Mayo 1 - Oct 31 -> 6 Meses / 184 días)
  // --------------------------------------------------------------------------
  [3. Ejecución de Obras],
  table.cell(colspan: 4)[],
  table.cell(colspan: 6, fill: t-emerald)[#text(fill: white, weight: "bold")[Construcción en Terreno]],
  table.cell(colspan: 2)[],

  // --------------------------------------------------------------------------
  // TAREA 4: Pruebas y Comisionamiento (Nov 1 - Dic 31 -> 2 Meses / 61 días)
  // --------------------------------------------------------------------------
  [4. Comisionamiento y Cierre],
  table.cell(colspan: 10)[],
  table.cell(colspan: 2, fill: t-purple)[#text(fill: white, weight: "bold")[Puesta en Marcha]],
)