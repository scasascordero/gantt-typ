#import "@preview/cetz:0.3.1": canvas, draw

#set page(
  paper: "a4", 
  flipped: true, 
  margin: (x: 1.5cm, top: 1.5cm, bottom: 1.5cm)
)
#set text(font: "Liberation Sans", size: 8pt)

#align(center)[
  #text(size: 15pt, weight: "bold", fill: rgb("#1e293b"))[
    Cronograma de Proyecto (10 Actividades - CeTZ)
  ]
]

#v(0.5cm)

// -----------------------------------------------------------------------------
// 1. DATOS DE LAS 10 ACTIVIDADES
// -----------------------------------------------------------------------------
#let actividades = (
  (id: 1,  nombre: [1. Levantamiento de Requerimientos], inicio: 1,  fin: 6,  color: rgb("#2563eb")),
  (id: 2,  nombre: [2. Ingeniería y Arquitectura Base], inicio: 4,  fin: 12, color: rgb("#2563eb")),
  (id: 3,  nombre: [3. Tramitación de Permisos Vialidad], inicio: 8,  fin: 20, color: rgb("#d97706")),
  (id: 4,  nombre: [4. Licitación de Obras Terreno],     inicio: 16, fin: 24, color: rgb("#d97706")),
  (id: 5,  nombre: [5. Movimiento de Tierras y Excavación], inicio: 22, fin: 32, color: rgb("#059669")),
  (id: 6,  nombre: [6. Montaje Estructural y Obra Gruesa], inicio: 28, fin: 40, color: rgb("#059669")),
  (id: 7,  nombre: [7. Instalación Sistemas Hidráulicos], inicio: 36, fin: 44, color: rgb("#059669")),
  (id: 8,  nombre: [8. Pruebas de Presión y Estanqueidad], inicio: 42, fin: 47, color: rgb("#7c3aed")),
  (id: 9,  nombre: [9. Auditar y Recepción de Obra],      inicio: 46, fin: 50, color: rgb("#7c3aed")),
  (id: 10, nombre: [10. Puesta en Marcha y Entrega Final], inicio: 49, fin: 52, color: rgb("#dc2626")),
)

// Dimensiones con tipo 'length' explícito
#let ancho-nombre = 5.5cm
#let ancho-gantt = 19.0cm
#let alto-fila = 0.7cm
#let total-filas = actividades.len()
#let alto-total = total-filas * alto-fila

// -----------------------------------------------------------------------------
// 2. RENDERIZADO CON CETZ
// -----------------------------------------------------------------------------
#align(center)[
  #canvas({
    import draw: *

    // A. Líneas verticales de fondo (Eje X en semanas)
    for s in range(0, 53, step: 4) {
      let x = ancho-nombre + (s / 52) * ancho-gantt
      
      line((x, 0cm), (x, -alto-total), stroke: 0.2pt + rgb("#e2e8f0"))
      content((x, 0.4cm), text(size: 6.5pt, fill: rgb("#64748b"))[S#s], anchor: "south")
    }

    // Encabezados de Estaciones (Hemisferio Sur)
    let estaciones = (
      (nombre: [Verano], inicio: 0, fin: 11, color: rgb("#fef08a")),
      (nombre: [Otoño], inicio: 11, fin: 24, color: rgb("#fed7aa")),
      (nombre: [Invierno], inicio: 24, fin: 37, color: rgb("#bae6fd")),
      (nombre: [Primavera], inicio: 37, fin: 50, color: rgb("#bbf7d0")),
      (nombre: [Ver], inicio: 50, fin: 52, color: rgb("#fef08a"))
    )

    for est in estaciones {
      let x1 = ancho-nombre + (est.inicio / 52) * ancho-gantt
      let x2 = ancho-nombre + (est.fin / 52) * ancho-gantt
      rect((x1, 0.8cm), (x2, 1.3cm), fill: est.color, stroke: 0.3pt + rgb("#cbd5e1"), radius: 1.5pt)
      content(((x1 + x2) / 2, 1.05cm), text(size: 7.5pt, weight: "bold")[#est.nombre])
    }

    // B. Dibujo de las 10 Filas y Barras Vectoriales
    let y = 0.0cm

    for act in actividades {
      let y-top = y - 0.1cm
      let y-bottom = y - alto-fila + 0.1cm
      let y-center = (y-top + y-bottom) / 2

      // 1. Nombre de la Actividad
      content((ancho-nombre - 0.3cm, y-center), text(fill: rgb("#334155"), weight: "medium")[#act.nombre], anchor: "east")

      // 2. Coordenadas X
      let x1 = ancho-nombre + ((act.inicio - 1) / 52) * ancho-gantt
      let x2 = ancho-nombre + (act.fin / 52) * ancho-gantt

      // 3. Barra Vectorial
      rect(
        (x1, y-top), 
        (x2, y-bottom), 
        fill: act.color, 
        stroke: none, 
        radius: 2pt
      )

      // 4. Línea separadora horizontal
      let y-line = y - alto-fila
      let x-max = ancho-nombre + ancho-gantt
      line((0cm, y-line), (x-max, y-line), stroke: 0.2pt + rgb("#f1f5f9"))

      y -= alto-fila
    }
  })
]