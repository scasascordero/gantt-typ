// -----------------------------------------------------------------------------
// Cronograma de Proyecto Masivo (200 Actividades) - versión sin paquetes externos
//
// NOTA DE LA REPARACIÓN:
// El archivo original dependía del paquete "@preview/cetz:0.3.1" para dibujar
// el diagrama. Ese paquete se descarga la primera vez desde
// packages.typst.org, lo cual falla si no hay acceso a internet (o si un
// firewall/proxy corporativo bloquea ese dominio, como ocurre en este
// entorno). Para que el archivo compile siempre, sin depender de red ni de
// paquetes externos, todo el dibujo (líneas, rectángulos y textos anclados)
// se reimplementó con las funciones nativas de Typst (`place`, `line`,
// `rect`, `measure`). El resultado visual es equivalente al original.
//
// También se ajustó el tamaño de página: con 200 filas de 0.35cm cada una,
// el diagrama mide ~70cm de alto, lo que no cabe en una hoja A4 apaisada
// (~19cm de alto útil). Ahora la página se dimensiona automáticamente para
// que el cronograma completo quepa sin recortes.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// 1. GENERACIÓN PROGRAMÁTICA DE DATOS
// -----------------------------------------------------------------------------
#let generar-actividades(total) = {
  let lista = ()
  let colores = (
    rgb("#2563eb"), // Azul: Ingeniería
    rgb("#d97706"), // Naranja: Compras
    rgb("#059669"), // Verde: Construcción
    rgb("#7c3aed")  // Morado: QA/Comisionamiento
  )

  for i in range(1, total + 1) {
    let inicio = calc.rem(i * 3, 42) + 1
    let duracion = calc.rem(i, 8) + 2
    let color-idx = calc.rem(i, colores.len())

    lista.push((
      id: i,
      nombre: [Actividad #i: Tarea de terreno],
      inicio: inicio,
      fin: calc.min(inicio + duracion, 52),
      color: colores.at(color-idx)
    ))
  }
  return lista
}

#let actividades = generar-actividades(200)

// Dimensiones numéricas puras (en cm)
#let ancho-nombre = 4.5
#let ancho-gantt = 20.0
#let alto-fila = 0.35
#let total-filas = actividades.len()
#let alto-total = total-filas * alto-fila

// Espacio reservado arriba del área de filas para bandas de estación y
// etiquetas de semana (equivalente al y=1.2 del diseño original en CeTZ).
#let y0 = 1.2
#let ancho-dibujo = ancho-nombre + ancho-gantt
#let alto-dibujo = y0 + alto-total

// -----------------------------------------------------------------------------
// 2. CONFIGURACIÓN DE PÁGINA (dimensionada para que quepan las 200 filas)
// -----------------------------------------------------------------------------
#let margen-x = 1cm
#let margen-y = 1cm
#let alto-encabezado = 1.6cm // espacio para el título + separación

#set page(
  width: ancho-dibujo * 1cm + 2 * margen-x,
  height: alto-encabezado + alto-dibujo * 1cm + 2 * margen-y,
  margin: (x: margen-x, top: margen-y, bottom: margen-y)
)
#set text(font: "Liberation Sans", size: 6.5pt)

#align(center)[
  #text(size: 13pt, weight: "bold", fill: rgb("#1e293b"))[
    Cronograma de Proyecto Masivo (200 Actividades Programáticas)
  ]
]

#v(0.2cm)

// -----------------------------------------------------------------------------
// 3. FUNCIONES DE DIBUJO (reemplazo nativo de CeTZ canvas/draw)
// -----------------------------------------------------------------------------
// Convención de coordenadas: igual que en el archivo original (x crece a la
// derecha, y crece hacia arriba). y0 marca el borde superior del dibujo.
#let px(x) = x * 1cm
#let py(y) = (y0 - y) * 1cm

// Línea recta entre dos puntos (x1,y1) -> (x2,y2)
#let linea(x1, y1, x2, y2, trazo) = place(
  top + left,
  dx: px(x1),
  dy: py(y1),
  line(end: (px(x2) - px(x1), py(y2) - py(y1)), stroke: trazo)
)

// Rectángulo definido por dos esquinas opuestas (x1,y1) y (x2,y2)
#let caja(x1, y1, x2, y2, relleno: none, trazo: none, radio: 0pt) = {
  let xa = calc.min(x1, x2)
  let xb = calc.max(x1, x2)
  let ya = calc.max(y1, y2) // borde superior (mayor y)
  let yb = calc.min(y1, y2) // borde inferior (menor y)
  place(
    top + left,
    dx: px(xa),
    dy: py(ya),
    rect(
      width: px(xb - xa),
      height: py(yb) - py(ya),
      fill: relleno,
      stroke: trazo,
      radius: radio
    )
  )
}

// Texto anclado en un punto: ancla puede ser "centro", "sur" o "este"
#let texto(x, y, cuerpo, ancla: "centro") = context {
  let tam = measure(cuerpo)
  let ddx = if ancla == "este" { -tam.width } else { -tam.width / 2 }
  let ddy = if ancla == "sur" { -tam.height } else { -tam.height / 2 }
  place(top + left, dx: px(x) + ddx, dy: py(y) + ddy, cuerpo)
}

// -----------------------------------------------------------------------------
// 4. RENDERIZADO DEL DIAGRAMA
// -----------------------------------------------------------------------------
#align(center)[
  #box(width: ancho-dibujo * 1cm, height: alto-dibujo * 1cm)[
    #{
      // A. Líneas verticales de fondo (Eje X en semanas)
      for s in range(0, 53, step: 2) {
        let x = ancho-nombre + (s / 52) * ancho-gantt

        linea(x, 0, x, -alto-total, 0.15pt + rgb("#e2e8f0"))

        if calc.rem(s, 4) == 0 {
          texto(x, 0.4, text(size: 5pt, fill: rgb("#64748b"))[S#s], ancla: "sur")
        }
      }

      // Encabezados de Estaciones
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
        caja(x1, 0.8, x2, 1.2, relleno: est.color, trazo: 0.2pt + rgb("#cbd5e1"), radio: 1pt)
        texto((x1 + x2) / 2, 1.0, text(size: 6pt, weight: "bold")[#est.nombre], ancla: "centro")
      }

      // B. Dibujo de las 200 Filas y Barras Vectoriales
      let y = 0.0

      for act in actividades {
        let y-top = y - 0.05
        let y-bottom = y - alto-fila + 0.05
        let y-center = (y-top + y-bottom) / 2

        // 1. Nombre de la Actividad
        texto(ancho-nombre - 0.2, y-center, text(fill: rgb("#334155"))[#act.nombre], ancla: "este")

        // 2. Coordenadas X
        let x1 = ancho-nombre + ((act.inicio - 1) / 52) * ancho-gantt
        let x2 = ancho-nombre + (act.fin / 52) * ancho-gantt

        // 3. Barra Vectorial
        caja(x1, y-top, x2, y-bottom, relleno: act.color, trazo: none, radio: 0.8pt)

        // 4. Línea separadora horizontal
        let y-line = y - alto-fila
        let x-max = ancho-nombre + ancho-gantt
        linea(0, y-line, x-max, y-line, 0.1pt + rgb("#f1f5f9"))

        y -= alto-fila
      }
    }
  ]
]
