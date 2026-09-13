// dibujo.typ
// Primitivas de dibujo construidas únicamente con funciones nativas de
// Typst: `place`, `line`, `rect` y `measure` (más `rotate`, también nativo,
// solo para el rombo de los hitos). Sin paquetes externos (sin CeTZ, etc.).
//
// Convención de coordenadas: origen arriba-a-la-izquierda del lienzo,
// x crece hacia la derecha, y crece hacia abajo. Todas las coordenadas son
// longitudes de Typst (cm, pt, etc.), no números sueltos.

// Línea recta entre dos puntos.
#let linea(x1, y1, x2, y2, trazo: 0.5pt + black) = place(
  top + left,
  dx: x1,
  dy: y1,
  line(end: (x2 - x1, y2 - y1), stroke: trazo),
)

// Rectángulo definido por dos esquinas opuestas (admite cualquier orden).
#let caja(x1, y1, x2, y2, relleno: none, trazo: none, radio: 0pt) = {
  let xa = calc.min(x1, x2)
  let xb = calc.max(x1, x2)
  let ya = calc.min(y1, y2)
  let yb = calc.max(y1, y2)
  place(
    top + left,
    dx: xa,
    dy: ya,
    rect(width: xb - xa, height: yb - ya, fill: relleno, stroke: trazo, radius: radio),
  )
}

// Rombo (marcador de hito) centrado en (x, y), de "radio" `r`.
#let rombo(x, y, r, relleno: none, trazo: none) = place(
  top + left,
  dx: x - r,
  dy: y - r,
  rotate(45deg, rect(width: r * 1.41421, height: r * 1.41421, fill: relleno, stroke: trazo)),
)

// Texto anclado en un punto (x, y). `halign`: "izquierda" | "centro" | "derecha".
// `valign`: "arriba" | "centro" | "abajo".
#let texto(x, y, cuerpo, halign: "centro", valign: "centro") = context {
  let tam = measure(cuerpo)
  let dx = if halign == "derecha" { -tam.width } else if halign == "izquierda" { 0pt } else { -tam.width / 2 }
  let dy = if valign == "abajo" { -tam.height } else if valign == "arriba" { 0pt } else { -tam.height / 2 }
  place(top + left, dx: x + dx, dy: y + dy, cuerpo)
}
