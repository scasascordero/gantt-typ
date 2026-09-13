// fechas.typ
// Utilidades de fechas basadas solo en funciones nativas de Typst.
//
// Typst no permite restar valores `datetime` entre sí, así que en vez de
// depender de eso, cada fecha se convierte a un número de día consecutivo
// ("día juliano-Rata Die") mediante el algoritmo de Howard Hinnant. Sobre
// esos enteros sí se puede sumar, restar y comparar sin problemas, y solo
// se construye un `datetime` real cuando hace falta mostrar una fecha en
// pantalla (con `.display(...)`).

// Fecha civil (año, mes, día) -> día consecutivo (entero, puede ser negativo).
#let dias-desde-epoca(anio, mes, dia) = {
  let y = if mes <= 2 { anio - 1 } else { anio }
  let era = calc.floor(y / 400)
  let yoe = y - era * 400
  let mp = if mes > 2 { mes - 3 } else { mes + 9 }
  let doy = calc.floor((153 * mp + 2) / 5) + dia - 1
  let doe = yoe * 365 + calc.floor(yoe / 4) - calc.floor(yoe / 100) + doy
  // calc.floor conserva el tipo float; se vuelve a entero porque el resto
  // del código (range(), indexado, etc.) exige `int`.
  int(era * 146097 + doe - 719468)
}

// Inversa de `dias-desde-epoca`: entero -> (anio, mes, dia).
#let fecha-desde-dias(z) = {
  let zz = z + 719468
  let era = calc.floor(zz / 146097)
  let doe = zz - era * 146097
  let yoe = calc.floor((doe - calc.floor(doe / 1460) + calc.floor(doe / 36524) - calc.floor(doe / 146096)) / 365)
  let y = yoe + era * 400
  let doy = doe - (365 * yoe + calc.floor(yoe / 4) - calc.floor(yoe / 100))
  let mp = calc.floor((5 * doy + 2) / 153)
  let dia = doy - calc.floor((153 * mp + 2) / 5) + 1
  let mes = if mp < 10 { mp + 3 } else { mp - 9 }
  let anio = y + (if mes <= 2 { 1 } else { 0 })
  // calc.floor conserva el tipo float; se vuelve a enteros porque
  // datetime(...) exige year/month/day de tipo int.
  (anio: int(anio), mes: int(mes), dia: int(dia))
}

// Acepta "AAAA-MM-DD" (como llegan los datos de yaml()/csv()), formas
// parciales "AAAA-MM" o "AAAA" (asumiendo día/mes 1), un `datetime`
// nativo, o un dict (anio, mes, dia), y siempre retorna (anio, mes, dia).
#let interpretar-fecha(valor) = {
  if type(valor) == dictionary {
    valor
  } else if type(valor) == datetime {
    (anio: valor.year(), mes: valor.month(), dia: valor.day())
  } else if type(valor) == int or type(valor) == float {
    // Trampa clásica de Typst: escribir 2026-03-01 SIN comillas no es un
    // texto, Typst lo evalúa como una resta (2026 - 3 - 1 = 2022) antes de
    // que la función reciba el valor. Se detecta aquí para dar un mensaje
    // claro en vez de aceptar un año sin sentido.
    panic(
      "Fecha inválida: se recibió el número " + str(valor) + ". "
      + "¿Escribiste una fecha sin comillas (p. ej. 2026-03-01)? Typst la "
      + "interpreta como una resta. Escríbela como texto: \"2026-03-01\".",
    )
  } else {
    let s = str(valor).trim()
    let partes = s.split("-")
    assert(
      partes.len() >= 1 and partes.len() <= 3,
      message: "Fecha inválida (se espera AAAA-MM-DD, AAAA-MM o AAAA): " + s,
    )
    (
      anio: int(partes.at(0)),
      mes: if partes.len() >= 2 { int(partes.at(1)) } else { 1 },
      dia: if partes.len() >= 3 { int(partes.at(2)) } else { 1 },
    )
  }
}

#let a-dia-juliano(valor) = {
  let f = interpretar-fecha(valor)
  dias-desde-epoca(f.anio, f.mes, f.dia)
}

#let a-datetime(valor) = {
  let f = interpretar-fecha(valor)
  datetime(year: f.anio, month: f.mes, day: f.dia)
}

#let formatear-fecha(valor, patron: "[day]-[month]-[year]") = {
  a-datetime(valor).display(patron)
}

#let nombres-mes = ("Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic")

#let nombre-mes-corto(mes) = nombres-mes.at(mes - 1)
