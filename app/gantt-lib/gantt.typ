// gantt.typ — Librería de cartas Gantt para Typst sin paquetes externos.
//
// Todo el dibujo se hace con funciones nativas de Typst (`place`, `line`,
// `rect`, `measure`, `rotate`). La lectura de datos usa las funciones
// nativas `yaml()` y `csv()`. No se depende de ningún paquete de
// @preview.
//
// Ver README.md para el formato de datos y ejemplos de uso.

#import "fechas.typ": dias-desde-epoca, fecha-desde-dias, nombre-mes-corto, a-dia-juliano, formatear-fecha
#import "datos.typ": preparar-tareas, leer-yaml, leer-csv
#import "dibujo.typ": linea, caja, rombo, texto

// Detecta si `tareas` ya viene resuelto por `preparar-tareas` (busca la
// llave "inicio-dias") o si son datos crudos, en cuyo caso los procesa
// automáticamente. Acepta tanto una lista de tareas como el resultado
// crudo de yaml() cuando el archivo tiene la forma { tareas: [...] } —
// así funciona igual si el llamador usó leer-yaml() o el yaml() nativo
// directamente.
#let tareas-listas(tareas, cpm: false, inicio-proyecto: none, termino-proyecto: none) = {
  let tareas = if type(tareas) == dictionary { tareas.at("tareas", default: ()) } else { tareas }
  if tareas.len() == 0 { return () }
  if "inicio-dias" in tareas.at(0) {
    tareas
  } else {
    preparar-tareas(tareas, cpm: cpm, inicio-proyecto: inicio-proyecto, termino-proyecto: termino-proyecto)
  }
}

// Si `valor` es `auto`, usa `valor-auto`; si no, respeta lo que haya
// indicado explícitamente el usuario (true/false).
#let resolver-nivel(valor, valor-auto) = if valor == auto { valor-auto } else { valor }

// --- Vínculos a editor (VS Code / VSCodium) --------------------------------
// Convierte una ruta local en un URI `vscode://file/<ruta>:<linea>` (o
// `vscodium://...`) que abre el archivo en la línea indicada. Windows:
// la letra de unidad y los espacios se codifican (%3A, %20). El esquema lo
// elige de una vez `carta-gantt` con su parámetro `esquema-vinculo`.
#let url-vscode(archivo, linea, esquema: "vscodium") = {
  let ruta = archivo
    .replace("\\", "/")
    .replace("%", "%25")
    .replace("#", "%23")
    .replace("?", "%3F")
    .replace("&", "%26")
    .replace(":", "%3A")
    .replace(" ", "%20")
  esquema + "://file/" + ruta + ":" + str(linea)
}

// Escanea el TEXTO de un archivo de datos (YAML, Typst u otro que ponga los
// códigos como `codigo: "1.1"`) y devuelve un diccionario `codigo -> (archivo,
// linea)` con la PRIMERA línea donde aparece cada código. No lee archivos a sí
// misma: el llamador hace `read()` (la resolución de rutas depende del archivo
// donde se compila, no de la librería) y le pasa el texto. Las menciones en
// `predecesoras` no definen vínculos porque solo cuentan las líneas que
// contienen la llave `codigo`. El URI final lo arma `carta-gantt` con su
// esquema (`esquema-vinculo`).
#let vinculos-desde-texto(texto, archivo) = {
  let salida = (:)
  for (i, linea) in texto.replace("\r\n", "\n").split("\n").enumerate() {
    if not linea.contains("codigo") { continue }
    let partes = linea.split("\"")
    if partes.len() < 2 { continue }
    let token = partes.at(1)
    if token == "" or token in salida { continue }
    salida.insert(token, (archivo, i + 1))
  }
  salida
}

#let meses-en-rango(dia-min, dia-max) = {
  let f0 = fecha-desde-dias(dia-min)
  let anio = f0.anio
  let mes = f0.mes
  let segmentos = ()
  while true {
    let inicio-mes = dias-desde-epoca(anio, mes, 1)
    let sig-anio = if mes == 12 { anio + 1 } else { anio }
    let sig-mes = if mes == 12 { 1 } else { mes + 1 }
    let fin-mes = dias-desde-epoca(sig-anio, sig-mes, 1) - 1
    let ini-clip = calc.max(inicio-mes, dia-min)
    let fin-clip = calc.min(fin-mes, dia-max)
    segmentos.push((anio: anio, mes: mes, inicio: ini-clip, fin: fin-clip))
    if fin-mes >= dia-max { break }
    anio = sig-anio
    mes = sig-mes
  }
  segmentos
}

#let anios-en-rango(dia-min, dia-max) = {
  let f0 = fecha-desde-dias(dia-min)
  let anio = f0.anio
  let segmentos = ()
  while true {
    let inicio-anio = dias-desde-epoca(anio, 1, 1)
    let fin-anio = dias-desde-epoca(anio + 1, 1, 1) - 1
    let ini-clip = calc.max(inicio-anio, dia-min)
    let fin-clip = calc.min(fin-anio, dia-max)
    segmentos.push((anio: anio, inicio: ini-clip, fin: fin-clip))
    if fin-anio >= dia-max { break }
    anio += 1
  }
  segmentos
}

// Bloques de 7 días consecutivos dentro de [dia-min, dia-max], numerados
// desde 1 a partir del inicio de la ventana visible (no son semanas ISO).
#let semanas-en-rango(dia-min, dia-max) = {
  let segmentos = ()
  let inicio = dia-min
  let indice = 1
  while inicio <= dia-max {
    let fin = calc.min(inicio + 6, dia-max)
    segmentos.push((indice: indice, inicio: inicio, fin: fin))
    inicio = fin + 1
    indice += 1
  }
  segmentos
}

// Un segmento por cada día individual dentro de [dia-min, dia-max].
#let dias-en-rango(dia-min, dia-max) = {
  range(dia-min, dia-max + 1).map(d => (
    inicio: d, fin: d, numero: fecha-desde-dias(d).dia,
  ))
}

// Dibuja la barra de avance, centrada en la barra principal (de
// `alto-barra` de altura). Si `avance` es un número simple, es un solo
// bloque redondeado de un tercio de esa altura. Si `avance-serie` trae la
// lista de incrementos que se van acumulando a lo largo de la tarea, se
// dibuja como bloques contiguos —ancho proporcional a cada incremento,
// un cuarto de `alto-barra` cada uno— alternando arriba/abajo (mismo
// color, sin alternar tono); solo se redondea el extremo de inicio del
// primer bloque y el de término del último, nunca las uniones internas.
// `x1-real`/`x2-real` son las coordenadas verdaderas de la barra (pueden
// salirse de la ventana visible); `x1`/`x2` son esas mismas coordenadas
// ya recortadas.
#let dibujar-avance(x1-real, x2-real, x1, x2, y-centro, alto-barra, avance, avance-serie, color-avance) = {
  if avance-serie != none and avance-serie.len() > 0 {
    let ancho-real = x2-real - x1-real
    let alto-segmento = alto-barra / 4
    let n = avance-serie.len()
    let acumulado = 0
    for (i, incremento) in avance-serie.enumerate() {
      let seg-x1 = calc.max(x1-real + ancho-real * acumulado, x1)
      acumulado += incremento
      let seg-x2 = calc.min(x1-real + ancho-real * acumulado, x2)
      if seg-x2 > seg-x1 {
        let y-seg = if calc.rem(i, 2) == 0 { y-centro - alto-segmento } else { y-centro }
        let radio = (
          top-left: if i == 0 { 1pt } else { 0pt },
          bottom-left: if i == 0 { 1pt } else { 0pt },
          top-right: if i == n - 1 { 1pt } else { 0pt },
          bottom-right: if i == n - 1 { 1pt } else { 0pt },
        )
        caja(seg-x1, y-seg, seg-x2, y-seg + alto-segmento, relleno: color-avance, radio: radio)
      }
    }
  } else if avance > 0 {
    let alto-avance = alto-barra / 3
    let y-avance = y-centro - alto-avance / 2
    let x-avance = calc.min(calc.max(x1-real + (x2-real - x1-real) * avance, x1), x2)
    caja(x1, y-avance, x-avance, y-avance + alto-avance, relleno: color-avance, radio: 1pt)
  }
}

// --- Función principal ----------------------------------------------------

// tareas: lista cruda (de leer-yaml/leer-csv) o ya preparada con preparar-tareas.
#let carta-gantt(
  tareas,
  titulo: none,
  ancho-nombre: auto,       // longitud, o `auto` para medir el texto más ancho
  ancho-linea-tiempo: auto, // longitud, o `auto`: 20cm si pagina:true, o el ancho disponible si pagina:false
  alto-fila: 0.6cm,
  margen: 1cm,
  margenes: true,
  pagina: true,             // true: página propia autodimensionada (uso independiente) | false: se inserta en el flujo del documento actual, sin tocar el tamaño de página
  fuente: "Liberation Sans",
  tamano-fuente: 8pt,
  indent-por-nivel: 0.4cm,
  color-grupo: rgb("#475569"),
  color-tarea: rgb("#2563eb"),
  color-avance: rgb("#6b7280"), // color de la barra de avance (gris por defecto)
  color-hito: rgb("#dc2626"),
  color-texto: rgb("#1e293b"),
  color-rejilla: rgb("#e2e8f0"),
  color-calendario: rgb("#f8fafc"), // relleno de fondo de las bandas del calendario (año/mes/semana/día); gris muy suave por defecto
  color-hoy: rgb("#dc2626"),
  color: none,               // auto | (fila) -> color, para personalizar por tarea
  mostrar-codigo: true,      // true | false — antepone "codigo. " al nombre
  mostrar-duracion: false,   // true | false — muestra "Nd" a la derecha de cada barra
  mostrar-barra-grupo: true, // true | false — dibuja (o no) la barra resumen de tareas con subtareas
  mostrar-hoy: false,        // true | false — línea vertical roja en la fecha de hoy
  ventana-inicio: none,      // none (usa el mínimo de los datos) | "AAAA-MM-DD"
  ventana-fin: none,         // none (usa el máximo de los datos) | "AAAA-MM-DD"
  nivel-anio: auto,          // auto | true | false
  nivel-mes: auto,           // auto | true | false
  nivel-semana: auto,        // auto | true | false
  nivel-dia: auto,           // auto | true | false
  mostrar-dia-inicio-semana: false, // true | false — día del mes en que arranca cada semana, alineado a la izquierda de su celda
  mostrar-columnas: (),      // subconjunto y orden de ("duracion", "inicio", "termino", "avance", "holgura", "critico", "inicio-temprano", "termino-temprano", "inicio-tardio", "termino-tardio"); columnas de datos entre el nombre y la línea de tiempo
  mostrar-niveles: auto,     // auto (todos) | entero >= 1 — cuántos niveles de la jerarquía mostrar; el resto (subtareas más profundas) se ocultan por completo
  mostrar-serie-avance: true, // true | false — si avance es una serie, dibujarla como bloques arriba/abajo (true) o como un solo bloque con el avance total (false)
  cpm: false,                // true | false — calcula fechas y ruta crítica desde las dependencias (predecesoras)
  inicio-proyecto: none,     // none | "AAAA-MM-DD" — arranque del proyecto cuando no sale solo de los datos
  termino-proyecto: none,    // none | "AAAA-MM-DD" — cierre del proyecto para el pase hacia atrás del CPM
  resaltar-critico: true,    // true | false — pinta con color-critico las tareas de la ruta crítica
  color-critico: rgb("#dc2626"),
  mostrar-dependencias: true, // true | false — dibuja flechas "elbow" entre predecesora y sucesora
  color-dependencia: rgb("#64748b"),
  vinculos: none,            // none | dict codigo -> (archivo, linea) vía vinculos-desde-texto (o codigo -> URI ya armado); cada fila con ese codigo se vuelve clicable y abre su línea
  esquema-vinculo: "vscodium", // "vscodium" | "vscode" — esquema del URI que arma carta-gantt a partir de las ubicaciones de `vinculos` (y el default de url-vscode) para abrir la línea en el editor
) = {
  let filas = tareas-listas(tareas, cpm: cpm, inicio-proyecto: inicio-proyecto, termino-proyecto: termino-proyecto)
  assert(filas.len() > 0, message: "carta-gantt: no hay tareas para dibujar.")

  // Oculta por completo las subtareas de nivel >= mostrar-niveles (no solo
  // su barra: la fila entera desaparece). El "rollup" de fechas/avance de
  // sus tareas madre ya se calculó al preparar los datos, así que las
  // barras resumen siguen reflejando el rango real aunque sus hijas no se
  // dibujen. Además, una tarea que se queda sin hijas visibles (porque se
  // recortaron por el límite de niveles) se recalifica como si no tuviera
  // subtareas, para que su barra se dibuje igual que una tarea normal en
  // vez de como el contorno transparente de un grupo.
  let filas = if mostrar-niveles == auto or mostrar-niveles == none {
    filas
  } else {
    let filtradas = filas.filter(f => f.nivel < mostrar-niveles)
    filtradas.enumerate().map(par => {
      let (j, f) = par
      let tiene-hijo-visible = j + 1 < filtradas.len() and filtradas.at(j + 1).nivel == f.nivel + 1
      (..f, es-grupo: tiene-hijo-visible)
    })
  }
  assert(filas.len() > 0, message: "carta-gantt: mostrar-niveles dejó la lista de tareas vacía.")

  // Vínculos a editor: el campo `vinculo` de la fila (si existe) manda; si
  // no, se busca su codigo en el dict `vinculos`. El dict puede traer ya el
  // URI armado (string) o la ubicación `(archivo, linea)` — en ese caso la
  // carta arma el URI con `esquema-vinculo`.
  let filas = filas.map(f => {
    let explicito = f.at("vinculo", default: none)
    let candidato = if explicito == none and vinculos != none {
      vinculos.at(f.codigo, default: none)
    } else { none }
    let v = if explicito != none { explicito }
      else if candidato == none { none }
      else if type(candidato) == array {
        url-vscode(candidato.at(0), candidato.at(1), esquema: esquema-vinculo)
      } else { candidato }
    if v == none { return f }
    (: ..f, vinculo: v)
  })

  let dia-min = if ventana-inicio != none { a-dia-juliano(ventana-inicio) } else {
    calc.min(..filas.map(f => f.inicio-dias))
  }
  let dia-max = if ventana-fin != none { a-dia-juliano(ventana-fin) } else {
    calc.max(..filas.map(f => f.termino-dias))
  }
  assert(dia-max >= dia-min, message: "carta-gantt: ventana-fin debe ser posterior a ventana-inicio.")
  let total-dias = dia-max - dia-min + 1

  let meses = meses-en-rango(dia-min, dia-max)

  let mostrar-anio = resolver-nivel(nivel-anio, meses.map(m => m.anio).dedup().len() > 1)
  let mostrar-mes = resolver-nivel(nivel-mes, true)
  let mostrar-semana = resolver-nivel(nivel-semana, total-dias <= 200)
  let mostrar-dia = resolver-nivel(nivel-dia, total-dias <= 45)

  let anios = if mostrar-anio { anios-en-rango(dia-min, dia-max) } else { () }
  let semanas = if mostrar-semana { semanas-en-rango(dia-min, dia-max) } else { () }
  let dias = if mostrar-dia { dias-en-rango(dia-min, dia-max) } else { () }

  set text(font: fuente, size: tamano-fuente, fill: color-texto)

  // `layout` da el ancho realmente disponible en el punto donde se llamó a
  // carta-gantt (el del contenedor donde se insertó) — así es como
  // `ancho-linea-tiempo: auto` puede "usar el ancho de la hoja" sin tener
  // que leer page.width a mano. Pero `set page` no se puede usar dentro de
  // un `layout` (Typst lo prohíbe dentro de "contenedores"), así que solo
  // se envuelve en `layout` la rama `pagina: false`; en la rama
  // `pagina: true` se arma el contenido directo, sin depender del ancho
  // disponible (usa 20cm por defecto), para poder llamar `set page` después.
  let construir(ancho-disponible) = {
  // --- Medición para el ancho automático de la columna de nombres --------
  context {
    let ancho-nombre-final = if ancho-nombre != auto { ancho-nombre } else {
      let max-ancho = filas.map(f => {
        let cuerpo = [#f.nombre]
        measure(cuerpo).width + f.nivel * indent-por-nivel
      }).fold(0pt, (a, b) => calc.max(a, b))
      max-ancho + 0.9cm
    }

    // --- Columnas de datos opcionales (duración/inicio/término/avance),
    // entre el nombre y la línea de tiempo -------------------------------
    let etiquetas-columna = (
      duracion: "Duración",
      inicio: "Inicio",
      termino: "Término",
      avance: "Avance",
      holgura: "Holgura",
      critico: "Crít.",
      "inicio-temprano": "Ini. temp.",
      "termino-temprano": "Fin. temp.",
      "inicio-tardio": "Ini. tardío",
      "termino-tardio": "Fin. tardío",
    )
    let valor-columna(f, col) = {
      if col == "duracion" { str(f.duracion) }
      else if col == "inicio" { formatear-fecha(fecha-desde-dias(f.inicio-dias)) }
      else if col == "termino" { formatear-fecha(fecha-desde-dias(f.termino-dias)) }
      else if col == "avance" { str(calc.round(f.avance * 100)) + "%" }
      else if col == "holgura" {
        let h = f.at("holgura", default: none)
        if h == none { "" } else { str(h) }
      }
      else if col == "critico" { if f.at("critico", default: false) { "C" } else { "" } }
      else if col == "inicio-temprano" {
        let d = f.at("inicio-temprano-dias", default: none)
        if d == none { "" } else { formatear-fecha(fecha-desde-dias(d)) }
      }
      else if col == "termino-temprano" {
        let d = f.at("termino-temprano-dias", default: none)
        if d == none { "" } else { formatear-fecha(fecha-desde-dias(d)) }
      }
      else if col == "inicio-tardio" {
        let d = f.at("inicio-tardio-dias", default: none)
        if d == none { "" } else { formatear-fecha(fecha-desde-dias(d)) }
      }
      else if col == "termino-tardio" {
        let d = f.at("termino-tardio-dias", default: none)
        if d == none { "" } else { formatear-fecha(fecha-desde-dias(d)) }
      }
      else { "" }
    }
    let anchos-columnas = mostrar-columnas.map(col => {
      let ancho-etiqueta = measure(text(weight: "bold")[#etiquetas-columna.at(col)]).width
      let ancho-valores = filas.map(f => measure(text[#valor-columna(f, col)]).width).fold(0pt, (a, b) => calc.max(a, b))
      calc.max(ancho-etiqueta, ancho-valores) + 0.5cm
    })
    let col-x-inicios = {
      let acc = ancho-nombre-final
      let salida = ()
      for a in anchos-columnas {
        salida.push(acc)
        acc += a
      }
      salida
    }
    let ancho-tabla = ancho-nombre-final + anchos-columnas.sum(default: 0pt)

    // auto: 20cm si la carta arma su propia página (comportamiento de
    // siempre), o el ancho que sobra del contenedor actual (la hoja, si
    // se inserta en un documento normal) si no.
    let ancho-linea-tiempo = if ancho-linea-tiempo != auto {
      ancho-linea-tiempo
    } else if pagina {
      20cm
    } else {
      calc.max(ancho-disponible - ancho-tabla, 1cm)
    }

    let ancho-total = ancho-tabla + ancho-linea-tiempo

    // Ancho en pantalla de un día, para decidir si caben los números de
    // día sin que se amontonen unos con otros.
    let ancho-por-dia = ancho-linea-tiempo / total-dias

    let alto-banda-anio = if mostrar-anio { 0.4cm } else { 0cm }
    let alto-banda-mes = if mostrar-mes { 0.5cm } else { 0cm }
    let alto-banda-semana = if mostrar-semana { 0.4cm } else { 0cm }
    let alto-banda-dia = if mostrar-dia { 0.4cm } else { 0cm }
    // Sin margen extra: el encabezado termina exactamente donde empieza
    // la fila 1, para que su altura sea igual a la de las demás filas y
    // su techo coincida con el borde inferior del calendario.
    let alto-encabezado = alto-banda-anio + alto-banda-mes + alto-banda-semana + alto-banda-dia
    let alto-filas = filas.len() * alto-fila

    let caja-titulo = if titulo != none {
      box(width: ancho-total)[#align(center)[#text(size: tamano-fuente + 5pt, weight: "bold")[#titulo]]]
    } else { none }

    let caja-dibujo = box(width: ancho-total, height: alto-encabezado + alto-filas)[
      #{
        let y0 = alto-encabezado

        let y-anio-top = 0pt
        let y-anio-bottom = alto-banda-anio
        let y-mes-top = y-anio-bottom
        let y-mes-bottom = y-mes-top + alto-banda-mes
        let y-semana-top = y-mes-bottom
        let y-semana-bottom = y-semana-top + alto-banda-semana
        let y-dia-top = y-semana-bottom
        let y-dia-bottom = y-dia-top + alto-banda-dia

        let x-de(dia) = ancho-tabla + (dia - dia-min) / total-dias * ancho-linea-tiempo

        // Un único color/grosor para todas las líneas verticales del
        // dibujo (rejilla del calendario, separadores de columnas y el
        // marco que envuelve toda la carta), para que se vea homogéneo.
        let trazo-vertical = 0.4pt + color-rejilla

        // Banda de años.
        if mostrar-anio {
          for a in anios {
            let x1 = x-de(a.inicio)
            let x2 = x-de(a.fin + 1)
            caja(x1, y-anio-top, x2, y-anio-bottom, trazo: trazo-vertical, relleno: color-calendario)
            texto((x1 + x2) / 2, (y-anio-top + y-anio-bottom) / 2, text(weight: "bold", size: tamano-fuente)[#str(a.anio)])
          }
        }

        // Banda de meses.
        if mostrar-mes {
          for m in meses {
            let x1 = x-de(m.inicio)
            let x2 = x-de(m.fin + 1)
            caja(x1, y-mes-top, x2, y-mes-bottom, trazo: trazo-vertical, relleno: color-calendario)
            texto((x1 + x2) / 2, (y-mes-top + y-mes-bottom) / 2, text(weight: "bold", size: tamano-fuente)[#nombre-mes-corto(m.mes)])
          }
        }

        // Banda de semanas (bloques de 7 días desde el inicio de la ventana).
        if mostrar-semana {
          for s in semanas {
            let x1 = x-de(s.inicio)
            let x2 = x-de(s.fin + 1)
            caja(x1, y-semana-top, x2, y-semana-bottom, trazo: trazo-vertical, relleno: color-calendario)
            if mostrar-dia-inicio-semana {
              let dia-inicio = fecha-desde-dias(s.inicio).dia
              texto(
                x1 + 0.06cm, (y-semana-top + y-semana-bottom) / 2,
                text(size: tamano-fuente * 0.65, fill: color-texto.lighten(20%))[#dia-inicio],
                halign: "izquierda",
              )
            } else {
              texto((x1 + x2) / 2, (y-semana-top + y-semana-bottom) / 2, text(size: tamano-fuente * 0.85)[S#s.indice])
            }
          }
        }

        // Banda de días (se omite el número si no cabe, pero se deja la rejilla).
        // A diferencia de año/mes/semana, no hay una `caja` por celda (sería
        // una por día); en su lugar se pinta un solo fondo para toda la
        // banda, con el mismo color de calendario y borde por los 4 lados
        // (así el borde inferior coincide con el techo de la fila 1), y
        // encima las líneas finas de cada día.
        if mostrar-dia {
          caja(ancho-tabla, y-dia-top, ancho-total, y-dia-bottom, trazo: trazo-vertical, relleno: color-calendario)
          for d in dias {
            let x1 = x-de(d.inicio)
            let x2 = x-de(d.fin + 1)
            linea(x1, y-dia-top, x1, y-dia-bottom, trazo: trazo-vertical)
            if ancho-por-dia >= 0.35cm {
              texto((x1 + x2) / 2, (y-dia-top + y-dia-bottom) / 2, text(size: tamano-fuente * 0.75)[#d.numero])
            }
          }
        }

        // Encabezados de las columnas de datos opcionales: una celda con
        // borde que ocupa la misma altura que las bandas del calendario
        // (hasta `y-dia-bottom`, no hasta `y0`, que incluye además el
        // pequeño margen antes de la primera fila), para que su borde
        // inferior coincida exactamente con el borde inferior del
        // calendario (el de semanas en este caso) en vez de quedar más
        // abajo.
        for (i, col) in mostrar-columnas.enumerate() {
          let cx1 = col-x-inicios.at(i)
          let cx2 = cx1 + anchos-columnas.at(i)
          caja(cx1, 0pt, cx2, y-dia-bottom, trazo: trazo-vertical)
          texto((cx1 + cx2) / 2, y-dia-bottom / 2, text(weight: "bold", size: tamano-fuente)[#etiquetas-columna.at(col)])
        }

        // Rejilla vertical que baja desde el encabezado hasta la última
        // fila: se dibuja solo con el nivel más fino que esté visible (día
        // > semana > mes), para que un límite más grueso (p. ej. de mes)
        // nunca atraviese la banda de un nivel más fino que va debajo
        // (p. ej. la caja con el número de semana). Arranca justo en
        // `y-dia-bottom` (el borde inferior real de las bandas, sin contar
        // el pequeño margen antes de la primera fila) para que no quede un
        // tramo sin línea entre el calendario y la primera actividad.
        if mostrar-dia {
          for d in dias {
            let x = x-de(d.inicio)
            linea(x, y-dia-bottom, x, y0 + alto-filas, trazo: trazo-vertical)
          }
        } else if mostrar-semana {
          for s in semanas {
            let x = x-de(s.inicio)
            linea(x, y-dia-bottom, x, y0 + alto-filas, trazo: trazo-vertical)
          }
        } else if mostrar-mes {
          for m in meses {
            let x = x-de(m.inicio)
            linea(x, y-dia-bottom, x, y0 + alto-filas, trazo: trazo-vertical)
          }
        }
        // El cierre a la izquierda de las actividades y al final del
        // último mes/semana/día queda cubierto por el marco que envuelve
        // todo el dibujo (ver el final de este bloque).

        // Filas de tareas.
        for (i, f) in filas.enumerate() {
          let y-fila-top = y0 + i * alto-fila
          let y-centro = y-fila-top + alto-fila / 2
          let y-fila-bottom = y-fila-top + alto-fila

          // Vínculo (opcional) de esta fila: si la tarea trae `vinculo`, su
          // nombre, sus celdas de datos y su barra se vuelven clicables y
          // abren la línea correspondiente en el editor.
          let vinculo = f.at("vinculo", default: none)
          let enlazar = if vinculo == none { cuerpo => cuerpo } else { cuerpo => link(vinculo)[#cuerpo] }

          // Nombre (con sangría por nivel de subtarea). El formato depende
          // del nivel (todas las tareas de primer nivel van en negrita,
          // el resto no), no de si la tarea en particular tiene o no
          // subtareas — así todas las de un mismo nivel se ven iguales.
          let x-nombre = f.nivel * indent-por-nivel + 0.15cm
          let prefijo = if mostrar-codigo and f.codigo != "" { f.codigo + ". " } else { "" }
          let peso = if f.nivel == 0 { "bold" } else { "regular" }
          texto(
            x-nombre, y-centro,
            enlazar(text(weight: peso)[#prefijo#f.nombre]),
            halign: "izquierda",
          )

          // Columnas de datos opcionales (duración/inicio/término/avance).
          for (j, col) in mostrar-columnas.enumerate() {
            let cx1 = col-x-inicios.at(j)
            let cx2 = cx1 + anchos-columnas.at(j)
            texto((cx1 + cx2) / 2, y-centro, enlazar(text[#valor-columna(f, col)]))
          }

          // Barra en la línea de tiempo. Las coordenadas "-real" son la
          // posición verdadera (pueden caer fuera de la ventana visible si
          // se usó ventana-inicio/ventana-fin); "x1"/"x2" son esas mismas
          // coordenadas recortadas al área dibujable, para no desbordar la
          // página cuando la tarea empieza antes o termina después de la
          // ventana que se decidió mostrar.
          let x1-real = x-de(f.inicio-dias)
          let x2-real = x-de(f.termino-dias + 1)
          let fuera-de-ventana = x2-real <= ancho-tabla or x1-real >= ancho-total
          let x1 = calc.max(x1-real, ancho-tabla)
          let x2 = calc.min(x2-real, ancho-total)
          let color-base = if color != none { color(f) }
            else if f.at("critico", default: false) and resaltar-critico { color-critico }
            else if f.es-grupo { color-grupo }
            else { color-tarea }
          let dibujar-barra = not f.es-grupo or mostrar-barra-grupo
          // Ausente si `f` viene de datos ya preparados a mano (sin pasar
          // por preparar-tareas), que no tienen por qué traer esta llave.
          // Si mostrar-serie-avance es false, se ignora aunque exista y se
          // dibuja solo el avance total (f.avance), como un bloque único.
          let avance-serie = if mostrar-serie-avance { f.at("avance-serie", default: none) } else { none }

          if not fuera-de-ventana {
            if f.hito {
              rombo((x1 + x2) / 2, y-centro, alto-fila * 0.28, relleno: color-hito)
            } else if f.es-grupo {
              if dibujar-barra {
                // Las tareas con subtareas se dibujan de la misma altura
                // que las actividades normales, pero transparentes (sin
                // relleno, solo el contorno) y sin corchetes en los
                // extremos, para no competir visualmente con sus hijas.
                let alto-barra = alto-fila * 0.62
                let y-top = y-centro - alto-barra / 2
                caja(x1, y-top, x2, y-top + alto-barra, relleno: none, trazo: 0.6pt + color-base, radio: 1.5pt)
                // Avance: barra gris centrada en la barra principal (ver
                // dibujar-avance para el detalle de alturas y redondeos).
                dibujar-avance(x1-real, x2-real, x1, x2, y-centro, alto-barra, f.avance, avance-serie, color-avance)
              }
            } else {
              let alto-barra = alto-fila * 0.62
              let y-top = y-centro - alto-barra / 2
              caja(x1, y-top, x2, y-top + alto-barra, relleno: color-base.lighten(35%), radio: 1.5pt)
              // Avance: barra gris centrada en la barra principal (ver
              // dibujar-avance para el detalle de alturas y redondeos).
              dibujar-avance(x1-real, x2-real, x1, x2, y-centro, alto-barra, f.avance, avance-serie, color-avance)
            }
          }

          // Duración, a la derecha de la barra (solo si el término real de
          // la tarea es visible dentro de la ventana).
          if mostrar-duracion and not f.hito and not fuera-de-ventana and x2-real <= ancho-total {
            texto(x2-real + 0.1cm, y-centro, enlazar(text(size: tamano-fuente * 0.85, fill: color-texto)[#f.duracion#{"d"}]), halign: "izquierda")
          }

          // Zona clicable de la barra (rectángulo transparente sobre el tramo
          // visible de la línea de tiempo), para que el clic no dependa solo
          // del texto del nombre.
          if vinculo != none and not fuera-de-ventana {
            place(top + left, dx: x1, dy: y-fila-top, enlazar(rect(width: x2 - x1, height: alto-fila, fill: none)))
          }

          // Separador horizontal.
          linea(0pt, y-fila-bottom, ancho-total, y-fila-bottom, trazo: 0.3pt + color-rejilla)
        }

        // Flechas de dependencia entre barras (conector "elbow": sale del
        // borde derecho de la predecesora, baja/sube por el punto medio y
        // entra al borde izquierdo de la sucesora). Se dibujan después de
        // las barras, así que quedan por encima de ellas. Si la predecesora
        // o la sucesora es un hito (rombo), el conector va hasta su centro.
        if mostrar-dependencias {
          let y-centro-de = (:)
          let fila-de = (:)
          for (i, g) in filas.enumerate() {
            y-centro-de.insert(g.codigo, y0 + i * alto-fila + alto-fila / 2)
            fila-de.insert(g.codigo, g)
          }
          let trazo-dep = 0.5pt + color-dependencia
          let p = 2.4pt
          for g in filas {
            for dep in g.at("predecesoras", default: ()) {
              let pg = fila-de.at(dep.pred, default: none)
              if pg == none { continue }
              let ox = if pg.hito { x-de(pg.inicio-dias) } else { x-de(pg.termino-dias + 1) }
              let oy = y-centro-de.at(dep.pred)
              let sx = x-de(g.inicio-dias)
              let sy = y-centro-de.at(g.codigo)
              if ox < ancho-tabla or ox > ancho-total or sx < ancho-tabla or sx > ancho-total {
                continue
              }
              let mx = (ox + sx) / 2
              linea(ox, oy, mx, oy, trazo: trazo-dep)
              linea(mx, oy, mx, sy, trazo: trazo-dep)
              linea(mx, sy, sx, sy, trazo: trazo-dep)
              linea(sx, sy, sx - p, sy - p * 0.9, trazo: trazo-dep)
              linea(sx, sy, sx - p, sy + p * 0.9, trazo: trazo-dep)
            }
          }
        }

        // Línea vertical separando la columna de nombres del resto (columnas
        // de datos y/o línea de tiempo), y una línea fina entre cada columna
        // de datos consecutiva.
        linea(ancho-nombre-final, 0pt, ancho-nombre-final, y0 + alto-filas, trazo: trazo-vertical)
        if col-x-inicios.len() > 1 {
          for x in col-x-inicios.slice(1) {
            linea(x, 0pt, x, y0 + alto-filas, trazo: trazo-vertical)
          }
        }
        // Línea vertical separando las columnas de datos (si las hay) de la
        // línea de tiempo.
        if mostrar-columnas.len() > 0 {
          linea(ancho-tabla, 0pt, ancho-tabla, y0 + alto-filas, trazo: trazo-vertical)
        }

        // Marco que envuelve todo el dibujo, con el mismo color/grosor que
        // el resto de las líneas verticales. La columna de nombres no
        // tiene encabezado propio, así que ahí el borde superior baja
        // hasta el techo de la primera fila en vez de dejar un hueco
        // vacío arriba (donde sí lo hay es sobre las columnas de datos y
        // la línea de tiempo, que si tienen encabezado).
        linea(ancho-nombre-final, 0pt, ancho-total, 0pt, trazo: trazo-vertical)
        linea(0pt, y0, ancho-nombre-final, y0, trazo: trazo-vertical)
        linea(0pt, y0, 0pt, y0 + alto-filas, trazo: trazo-vertical)
        linea(ancho-total, 0pt, ancho-total, y0 + alto-filas, trazo: trazo-vertical)
        linea(0pt, y0 + alto-filas, ancho-total, y0 + alto-filas, trazo: trazo-vertical)

        // Fecha de hoy: línea vertical roja que empieza justo debajo del
        // encabezado de fechas (no lo atraviesa) y baja hasta la última
        // fila. Se dibuja al final para que quede por encima de las
        // barras. Solo se muestra si hoy cae dentro de la ventana visible.
        if mostrar-hoy {
          let dia-hoy = a-dia-juliano(datetime.today())
          if dia-hoy >= dia-min and dia-hoy <= dia-max {
            let x-hoy = (x-de(dia-hoy) + x-de(dia-hoy + 1)) / 2
            linea(x-hoy, y0, x-hoy, y0 + alto-filas, trazo: 1pt + color-hoy)
          }
        }
      }
    ]

    // Se arma todo en un `stack` con espaciado explícito (en vez de dejar
    // que Typst inserte su espaciado automático entre bloques) para poder
    // medir la altura real más adelante.
    if caja-titulo != none {
      stack(dir: ttb, spacing: 0.35cm, caja-titulo, caja-dibujo)
    } else {
      caja-dibujo
    }
  }
  }

  // `set page` no está permitido dentro de un `layout` (es un
  // "contenedor"), así que la rama `pagina: true` arma el contenido
  // directo (sin depender del ancho disponible del entorno) para poder
  // autodimensionar la página después; la rama `pagina: false` sí
  // necesita `layout` para conocer el ancho disponible, pero no toca la
  // página.
  if pagina {
    context {
      let contenido = construir(0pt)
      let tamano = measure(contenido)
      let m = if margenes { margen } else { 0pt }
      set page(
        width: tamano.width + 2 * m,
        height: tamano.height + 2 * m,
        margin: m,
      )
      contenido
    }
  } else {
    layout(disponible => construir(disponible.width))
  }
}
