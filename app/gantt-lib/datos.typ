// datos.typ
// Lectura y normalización de datos de tareas para la carta Gantt.
//
// Formato esperado por tarea (todos los campos son opcionales salvo
// `codigo`, `nombre` e `inicio`; ver README.md para el detalle):
//   codigo, nombre, duracion, inicio, termino, avance, padre, subtareas, hito
//
// Se admiten dos formas de expresar subtareas:
//   1. Lista plana + columna `padre` con el código de la tarea madre
//      (la forma natural de una planilla Excel/CSV).
//   2. Lista anidada con la llave `subtareas` dentro de cada tarea
//      (más cómoda al escribir YAML a mano).
// Ambas se pueden mezclar.

#import "fechas.typ": a-dia-juliano, fecha-desde-dias
#import "cpm.typ": calcular-cpm

#let es-vacio(v) = v == none or (type(v) == str and v.trim() == "")

#let a-numero(v, defecto: none) = {
  if es-vacio(v) { defecto }
  else if type(v) == str { float(v.trim()) }
  else { float(v) }
}

// Número o fórmula aritmética (p. ej. "3*40", "(12+8)/4", "9^0.5"). Se usa
// en campos que admiten fórmulas (`cantidad` y `rendimiento` de los
// `recursos` del APU). Evaluador propio con la misma gramática que
// `expr.rs`/`expr.ts`: números, `+ - * / ^` (potencia asociativa a la
// derecha), paréntesis y unarios. Devuelve `none` si la expresión no es
// válida (no rompe la compilación de la carta).
#let evaluar-formula(s) = {
  let digitos = ("0","1","2","3","4","5","6","7","8","9")
  let n = s.len()
  let saltar = i => { let j = i; while j < n and (s.at(j) == " " or s.at(j) == "\t") { j += 1 }; j }
  let es-digito = c => digitos.contains(c)

  let numero(i) = {
    let j = i
    let v = 0.0
    let escala = 1.0
    let seen = false
    while j < n {
      let c = s.at(j)
      if es-digito(c) {
        seen = true
        if escala == 1.0 { v = v * 10.0 + float(c) }
        else { v = v + float(c) * escala; escala = escala / 10.0 }
      } else if c == "." and escala == 1.0 {
        escala = 0.1
      } else { break }
      j += 1
    }
    if seen { (v, j) } else { none }
  }

  let atomo = i => {
    i = saltar(i)
    if i >= n { none }
    else if s.at(i) == "(" {
      // Busca el ')' de cierre balanceado y evalúa el contenido recursivamente.
      let prof = 1
      let j = i + 1
      while j < n {
        if s.at(j) == "(" { prof += 1 }
        else if s.at(j) == ")" { prof -= 1; if prof == 0 { break } }
        j += 1
      }
      if prof != 0 { none }
      else {
        let interno = evaluar-formula(s.slice(i + 1, j))
        if interno == none { none } else { (interno, j + 1) }
      }
    }
    else { numero(i) }
  }

  let unario(i) = {
    i = saltar(i)
    if i >= n { none }
    else if s.at(i) == "-" {
      let r = unario(i + 1)
      if r == none { none } else { let (v, j) = r; (-v, j) }
    }
    else if s.at(i) == "+" { unario(i + 1) }
    else { atomo(i) }
  }

  let factor(i) = {
    let b = unario(i)
    if b == none { none }
    else {
      let (base, j) = b
      j = saltar(j)
      if j < n and s.at(j) == "^" {
        let e = factor(j + 1)
        if e == none { none } else { let (exp, k) = e; (calc.pow(base, exp), k) }
      } else { (base, j) }
    }
  }

  let termino(i) = {
    let f = factor(i)
    if f == none { none }
    else {
      let (v, j) = f
      while true {
        j = saltar(j)
        if j < n and (s.at(j) == "*" or s.at(j) == "/") {
          let op = s.at(j)
          let g = factor(j + 1)
          if g == none { return none }
          let (w, k) = g
          if op == "/" and w == 0.0 { return none }
          v = if op == "*" { v * w } else { v / w }
          j = k
        } else { return (v, j) }
      }
    }
  }

  let expr(i) = {
    let t = termino(i)
    if t == none { none }
    else {
      let (v, j) = t
      while true {
        j = saltar(j)
        if j < n and (s.at(j) == "+" or s.at(j) == "-") {
          let op = s.at(j)
          let t2 = termino(j + 1)
          if t2 == none { return none }
          let (w, k) = t2
          v = if op == "+" { v + w } else { v - w }
          j = k
        } else { return (v, j) }
      }
    }
  }

  let r = expr(0)
  if r == none { none }
  else {
    let (v, j) = r
    if saltar(j) == n { float(v) } else { none }
  }
}

#let a-formula(v) = {
  if es-vacio(v) { none }
  else if type(v) == str {
    let s = v.trim()
    if s.len() == 0 { none } else { evaluar-formula(s) }
  } else { a-numero(v) }
}

// Convierte a día juliano un valor que puede ser una fecha ("AAAA-MM-DD",
// como llega de yaml()/csv()) o directamente un número entero de día (para
// usuarios avanzados que trabajan con la aritmética interna de la librería).
#let dia-ancla(v) = {
  if type(v) == int or type(v) == float { int(v) }
  else { a-dia-juliano(v) }
}

// Interpreta el campo crudo `predecesoras`. Puede ser:
//  - una lista en YAML/Typst, donde cada elemento es un código ("1.2"),
//    una especificación "codigo:tipo:lag", o un dict (codigo, tipo, lag);
//  - un texto separado por ";" en CSV/Excel:
//      "1.1"          -> dep fs, lag 0
//      "1.2:ss:2"     -> dep ss, lag 2
//      "1.1;1.3:ff:1" -> dos dependencias
// Retorna una lista de dicts (pred, tipo, lag).
#let interpretar-predecesoras(valor) = {
  let tipos-deps = ("fs", "ss", "ff", "sf")
  let normalizar(dep) = {
    if type(dep) == dictionary {
      let codigo = str(dep.at("codigo"))
      let tipo = str(lower(str(dep.at("tipo", default: "fs"))))
      assert(
        tipo in tipos-deps,
        message: "predecesoras: tipo de dependencia inválido '" + tipo
          + "' para '" + codigo + "'. Tipos válidos: " + tipos-deps.join(", "),
      )
      (pred: codigo, tipo: tipo, lag: int(dep.at("lag", default: 0)))
    } else {
      let partes = str(dep).trim().split(":")
      let codigo = partes.at(0)
      let tipo = if partes.len() >= 2 and partes.at(1) != "" {
        str(lower(partes.at(1)))
      } else { "fs" }
      assert(
        tipo in tipos-deps,
        message: "predecesoras: tipo de dependencia inválido '" + tipo
          + "' para '" + codigo + "'. Tipos válidos: " + tipos-deps.join(", "),
      )
      let lag = if partes.len() >= 3 and partes.at(2) != "" {
        int(float(partes.at(2)))
      } else { 0 }
      (pred: codigo, tipo: tipo, lag: lag)
    }
  }
  if valor == none or es-vacio(valor) {
    ()
  } else if type(valor) == array {
    valor.map(normalizar)
  } else if type(valor) == str {
    if valor.trim() == "" { () }
    else { valor.split(";").map(s => normalizar(s)) }
  } else {
    panic("predecesoras: valor no reconocido: " + str(valor))
  }
}

// Interpreta el valor crudo de "avance". Puede ser:
//  - un número o texto: 0.1, 10, "10", "10%" o "10 %" (0-1 o 0-100,
//    automático; el sufijo % siempre divide entre 100);
//  - una "serie" de incrementos que se van acumulando a lo largo de la
//    tarea: una lista en YAML (avance: (0.1, 0.2, 0.15, 0.2),
//    avance: ("10%", "20%", "15%", "20%")) o texto con punto y coma en
//    CSV/Excel (avance: "0.1;0.2;0.15;0.2" o "10%;20%;15%;20%").
// En ambos casos el avance final (para el rollup y para el % mostrado)
// es la suma de la serie. Retorna (avance: número 0-1, serie: lista o none).

// Convierte un único valor crudo a fracción 0-1.
#let a-avance(v, defecto: 0) = {
  if es-vacio(v) {
    defecto
  } else {
    let es-pct = false
    let num = v
    if type(v) == str {
      let s = v.trim()
      if s.len() > 0 and s.slice(s.len() - 1) == "%" {
        es-pct = true
        s = s.slice(0, s.len() - 1).trim()
      }
      num = s
    }
    let valor = a-numero(num, defecto: defecto)
    if es-pct {
      valor / 100
    } else if valor > 1 {
      valor / 100
    } else {
      valor
    }
  }
}

#let interpretar-avance(valor, defecto: 0) = {
  if type(valor) == array {
    let serie = valor.map(v => a-avance(v, defecto: 0))
    (avance: calc.min(serie.sum(default: 0), 1), serie: serie)
  } else if type(valor) == str and valor.contains(";") {
    let serie = valor.split(";").map(s => a-avance(s, defecto: 0))
    (avance: calc.min(serie.sum(default: 0), 1), serie: serie)
  } else {
    (avance: a-avance(valor, defecto: defecto), serie: none)
  }
}

// --- Carga desde disco -------------------------------------------------

// Lee un archivo YAML. Acepta tanto una lista de tareas en la raíz como
// un mapa con la llave `tareas: [...]`.
#let leer-yaml(ruta) = {
  let datos = yaml(ruta)
  if type(datos) == dictionary {
    datos.at("tareas", default: ())
  } else {
    datos
  }
}

// Lee un archivo CSV (tal como lo exporta Excel con "Guardar como -> CSV").
#let leer-csv(ruta) = csv(ruta, row-type: dictionary)

// --- Aplanado de la jerarquía -------------------------------------------

// Convierte la lista (posiblemente anidada vía `subtareas`) en una lista
// plana de dicts, cada uno con `codigo` (string) y `padre` (string o none)
// ya resueltos.
#let aplanar(lista, padre-contexto: none, raiz: true) = {
  let resultado = ()
  for t in lista {
    let codigo = str(t.at("codigo"))
    let hijos = t.at("subtareas", default: ())
    let padre = if raiz { t.at("padre", default: none) } else { padre-contexto }
    let padre = if es-vacio(padre) { none } else { str(padre) }
    resultado.push((..t, codigo: codigo, padre: padre))
    resultado += aplanar(hijos, padre-contexto: codigo, raiz: false)
  }
  resultado
}

// --- Construcción del árbol y orden de dibujo ---------------------------

// A partir de la lista plana arma:
//  - `mapa`: codigo -> item original
//  - `hijos-de`: codigo del padre -> lista de códigos hijos (en orden)
//  - `raices`: códigos sin padre (o con padre inexistente), en orden
#let construir-indice(items) = {
  let mapa = (:)
  for it in items { mapa.insert(it.codigo, it) }

  let hijos-de = (:)
  let raices = ()
  for it in items {
    let padre = it.padre
    if padre != none and padre in mapa {
      if padre not in hijos-de { hijos-de.insert(padre, ()) }
      hijos-de.at(padre).push(it.codigo)
    } else {
      raices.push(it.codigo)
    }
  }
  (mapa: mapa, hijos-de: hijos-de, raices: raices)
}

// --- Resolución de fechas / avance por tarea ----------------------------

// Resuelve inicio/término/duración de UNA tarea hoja a partir de los
// valores crudos disponibles (necesita inicio + (duracion o termino)).
#let resolver-fechas-hoja(item) = {
  let inicio-raw = item.at("inicio", default: none)
  assert(
    not es-vacio(inicio-raw),
    message: "La tarea '" + item.codigo + "' no tiene 'inicio' ni subtareas de las que heredar fechas.",
  )
  let inicio-dias = a-dia-juliano(inicio-raw)

  let termino-raw = item.at("termino", default: none)
  let duracion-raw = a-numero(item.at("duracion", default: none))

  // a-numero (y por ende duracion-raw) siempre da `float`; se vuelve a
  // `int` porque duraciones y días son cantidades enteras, y el resto del
  // código (range(), indexado) exige `int`.
  let termino-dias
  let duracion
  if not es-vacio(termino-raw) {
    termino-dias = a-dia-juliano(termino-raw)
    duracion = if duracion-raw != none { int(duracion-raw) } else { termino-dias - inicio-dias + 1 }
  } else if duracion-raw != none {
    duracion = int(duracion-raw)
    termino-dias = inicio-dias + calc.max(duracion, 1) - 1
  } else {
    // Hito: sin duración ni término explícito -> dura 1 día.
    duracion = 1
    termino-dias = inicio-dias
  }
  (inicio-dias: inicio-dias, termino-dias: termino-dias, duracion: duracion)
}

// Precio unitario de una actividad a partir de su descomposición `recursos`
// (análisis de precios unitarios). Cada recurso contribuye con la cuota
// `cantidad x precio / rendimiento` (rendimiento 1 por defecto). El campo
// `recursos` admite una lista de mapas o un diccionario clave -> mapa/valor.
// Si la actividad declara `costo-unitario` explícito, ese manda.
#let precio-unitario-de-recursos(item) = {
  let recursos = item.at("recursos", default: none)
  if recursos == none {
    return none
  }
  let lista = if type(recursos) == dictionary {
    recursos.pairs().map(pair => {
      let nombre = str(pair.at(0))
      let v = pair.at(1)
      let m = if type(v) == dictionary { v } else { (cantidad: v) }
      (nombre: nombre, ..m)
    })
  } else {
    recursos
  }
  let cuotas = lista.map(r => {
    let cantidad = a-formula(r.at("cantidad", default: none))
    let precio = a-numero(r.at("precio", default: none))
    let rendimiento = a-formula(r.at("rendimiento", default: none))
    if cantidad == none or precio == none { 0.0 } else {
      let divisor = if rendimiento == none or rendimiento <= 0.0 { 1.0 } else { rendimiento }
      cantidad * precio / divisor
    }
  })
  if cuotas.len() == 0 { none } else { cuotas.sum() }
}

// Resuelve, en post-orden, fechas/duración/avance de UNA tarea (recursivo
// puro: sin memoización ni estado compartido, para evitar mutar variables
// capturadas de un ámbito externo, algo que Typst no permite dentro de
// funciones). Los árboles de un cronograma son pequeños, así que
// recalcular no tiene costo perceptible.
// Resuelve fechas/duración/avance de UNA tarea (recursivo puro). Si se pasa
// `fechas-de` (mapa codigo -> fechas ya resueltas por el motor CPM para las
// tareas hoja), las hojas toman sus fechas de ahí en vez de resolver fija con
// `resolver-fechas-hoja` (que exige `inicio` explícito).
#let resolver-nodo(indice, codigo, fechas-de: none) = {
  let item = indice.mapa.at(codigo)
  let hijos = indice.hijos-de.at(codigo, default: ())

  if hijos.len() == 0 {
    let f = if fechas-de != none { fechas-de.at(codigo) } else { resolver-fechas-hoja(item) }
    let av = interpretar-avance(item.at("avance", default: none))
    // Costos: `cantidad` x `costo-unitario` = `costo`; un `costo` explícito
    // manda sobre el producto. `unidad` es solo texto descriptivo.
    let cantidad = a-formula(item.at("cantidad", default: none))
    let cu-expl = a-numero(item.at("costo-unitario", default: none))
    let cu = if cu-expl != none { cu-expl } else { precio-unitario-de-recursos(item) }
    let costo-expl = a-numero(item.at("costo", default: none))
    let costo = if costo-expl != none { costo-expl }
      else if cantidad != none and cu != none { cantidad * cu }
      else { none }
    (
      inicio-dias: f.inicio-dias, termino-dias: f.termino-dias, duracion: f.duracion,
      avance: av.avance, avance-serie: av.serie,
      cantidad: cantidad, unidad: item.at("unidad", default: none),
      costo-unitario: cu, costo: costo,
    )
  } else {
    let sub = hijos.map(h => resolver-nodo(indice, h, fechas-de: fechas-de))

    let inicio-raw = item.at("inicio", default: none)
    let termino-raw = item.at("termino", default: none)
    let duracion-raw = a-numero(item.at("duracion", default: none))

    let inicio-dias = if not es-vacio(inicio-raw) {
      a-dia-juliano(inicio-raw)
    } else {
      calc.min(..sub.map(s => s.inicio-dias))
    }
    let termino-dias = if not es-vacio(termino-raw) {
      a-dia-juliano(termino-raw)
    } else {
      calc.max(..sub.map(s => s.termino-dias))
    }
    let duracion = if duracion-raw != none { int(duracion-raw) } else { termino-dias - inicio-dias + 1 }

    let avance-raw = item.at("avance", default: none)
    let (avance, avance-serie) = if not es-vacio(avance-raw) {
      let av = interpretar-avance(avance-raw)
      (av.avance, av.serie)
    } else {
      let peso-total = sub.map(s => s.duracion).sum()
      let v = if peso-total > 0 {
        sub.map(s => s.avance * s.duracion).sum() / peso-total
      } else { 0 }
      (v, none)
    }

    // Rollup de costos: el `costo` de un grupo es la suma de los costos de
    // sus hijas (acumulable por niveles); `costo` explícito manda. Cantidad/
    // unidad/costo-unitario son propios de las hojas y los grupos los heredan
    // solo si los declaran explícitamente.
    let costos-hijos = sub.map(s => s.costo).filter(v => v != none)
    let costo-expl = a-numero(item.at("costo", default: none))
    let costo = if costo-expl != none { costo-expl }
      else if costos-hijos.len() > 0 { costos-hijos.sum() }
      else { none }

    (
      inicio-dias: inicio-dias, termino-dias: termino-dias, duracion: duracion,
      avance: avance, avance-serie: avance-serie,
      cantidad: a-formula(item.at("cantidad", default: none)),
      unidad: item.at("unidad", default: none),
      costo-unitario: a-numero(item.at("costo-unitario", default: none)),
      costo: costo,
    )
  }
}

// --- Orden de dibujo (DFS, padres antes que hijos) -----------------------

// Recursivo puro: retorna la lista de (codigo, nivel) de un nodo y sus
// descendientes, en vez de mutar un acumulador externo. Un nodo con
// `ocultar-subtareas: true` se dibuja pero su subárbol completo no emite
// filas (independientemente de `mostrar-niveles` global); sus fechas y
// avance siguen viniendo del rollup de TODAS las hijas.
#let visitar-nodo(indice, codigo, nivel) = {
  let salida = ((codigo: codigo, nivel: nivel),)
  let item = indice.mapa.at(codigo, default: ())
  let ocultas = item.at("ocultar-subtareas", default: false) == true
  if not ocultas {
    for hijo in indice.hijos-de.at(codigo, default: ()) {
      salida += visitar-nodo(indice, hijo, nivel + 1)
    }
  }
  salida
}

#let orden-dfs(indice) = {
  let orden = ()
  for raiz in indice.raices {
    orden += visitar-nodo(indice, raiz, 0)
  }
  orden
}

// --- Marcado de la ruta crítica en la jerarquía ---------------------------

// Función pura: dice si un nodo (hoja o grupo) es crítico. Las hojas lo
// traen del motor CPM (están en `criticos`); un grupo (tarea con subtareas)
// es crítico si cualquiera de sus descendientes lo es. Nada se modifica por
// efecto (los diccionarios que se pasan como argumento se copian en Typst,
// así que un `.insert` aquí no llegaría a quien llama).
#let marcar-critico(indice, codigo, criticos) = {
  let hijos = indice.hijos-de.at(codigo, default: ())
  if hijos.len() == 0 { criticos.at(codigo) }
  else { hijos.map(h => marcar-critico(indice, h, criticos)).any(v => v) }
}

// --- API pública ----------------------------------------------------------

// Transforma los datos crudos (de leer-yaml/leer-csv) en la lista final,
// ya en orden de dibujo, con todos los campos resueltos:
//   codigo, nombre, nivel, es-grupo, hito,
//   inicio-dias, termino-dias, duracion, avance
//
// Con `cpm: true` el motor CPM calcula las fechas de las tareas hoja desde
// sus dependencias (`predecesoras`), y cada fila lleva además:
//   inicio-temprano-dias, termino-temprano-dias,
//   inicio-tardio-dias, termino-tardio-dias,
//   holgura, critico, predecesoras (para dibujar flechas)
// `inicio-proyecto`/`termino-proyecto` fijan el arranque/cierre del proyecto
// cuando no salen solos de los datos (ver cpm.typ).
// Con `fechas-cpm` (dict codigo -> {es, ef, ls, lf, holgura, critico,
// inicio-dias, termino-dias, duracion, predecesoras}) se inyectan resultados
// CPM precalculados (p. ej. por petgraph en Rust) y se omite el cálculo
// interno: `cpm: true` se ignora si `fechas-cpm` viene con datos.
#let preparar-tareas(
  datos-crudos,
  cpm: false,
  inicio-proyecto: none,
  termino-proyecto: none,
  fechas-cpm: none,
) = {
  let plano = aplanar(datos-crudos)
  let indice = construir-indice(plano)

  // Referencias codigo→id (y id→id) para normalizar las `predecesoras`
  // de salida: un token puede apuntar al código o al id de la tarea, y se
  // lleva al id efectivo (el CPM interno sigue keyed por código).
  let referencias = (:)
  let codigo-de = (:)
  for it in plano {
    let idd = it.at("id", default: it.codigo)
    referencias.insert(it.codigo, idd)
    referencias.insert(idd, idd)
    codigo-de.insert(idd, it.codigo)
    codigo-de.insert(it.codigo, it.codigo)
  }
  let a-dep-id(d) = (..d, pred: referencias.at(d.pred, default: d.pred))
  // variante para el CPM interno: sus mapas están keyed por `codigo`
  let a-dep-codigo(d) = (..d, pred: codigo-de.at(d.pred, default: d.pred))
  let orden = orden-dfs(indice)

  let dia-proyecto = if inicio-proyecto != none { dia-ancla(inicio-proyecto) } else { none }
  let dia-proyecto-term = if termino-proyecto != none { dia-ancla(termino-proyecto) } else { none }

  // Una tarea sin subtareas ("hoja") es la unidad que participa en el CPM;
  // los grupos son solo el "sobre" de sus hijas y no participan en la red.
  let es-hoja(codigo) = not (codigo in indice.hijos-de)

  let res-cpm = none
  let fechas-de = none
  let critico-de = none
  let cpm-externo = fechas-cpm != none
  if cpm-externo {
    // Resultados CPM precalculados (inyectados desde petgraph/Rust):
    // fechas-cpm es un dict codigo -> {es, ef, ls, lf, holgura, critico,
    //   inicio-dias, termino-dias, duracion, predecesoras}.
    let fech = (:)
    let ck = (:)
    let r = (:)
    for (code, data) in fechas-cpm {
      fech.insert(code, (
        inicio-dias: data.at("inicio-dias"),
        termino-dias: data.at("termino-dias"),
        duracion: data.at("duracion"),
      ))
      ck.insert(code, data.at("critico"))
      r.insert(code, data)
    }
    fechas-de = fech
    critico-de = ck
    res-cpm = r
  } else if cpm {
    let hojas = ()
    for it in plano {
      if not es-hoja(it.codigo) { continue }
      let inicio-raw = it.at("inicio", default: none)
      let termino-raw = it.at("termino", default: none)
      let tiene-inicio = not es-vacio(inicio-raw)
      let tiene-termino = not es-vacio(termino-raw)
      let es-ancla = if tiene-inicio { dia-ancla(inicio-raw) } else { none }
      let ef-ancla = if tiene-termino { dia-ancla(termino-raw) } else { none }
      let dur = if a-numero(it.at("duracion", default: none)) != none {
        calc.max(int(a-numero(it.at("duracion", default: none))), 1)
      } else if tiene-inicio and tiene-termino {
        ef-ancla - es-ancla + 1
      } else { 1 }
      hojas.push((
        codigo: it.codigo, dur: dur,
        es-ancla: es-ancla, ef-ancla: ef-ancla,
        predecesoras: interpretar-predecesoras(it.at("predecesoras", default: none)).map(a-dep-codigo),
      ))
    }
    let r = calcular-cpm(
      hojas,
      inicio-proyecto: dia-proyecto,
      termino-proyecto: dia-proyecto-term,
    )
    res-cpm = r

    let fech = (:)
    for h in hojas {
      let rr = r.at(h.codigo)
      fech.insert(h.codigo, (inicio-dias: rr.es, termino-dias: rr.ef, duracion: rr.ef - rr.es + 1))
    }
    fechas-de = fech

    let ck = (:)
    for h in hojas { ck.insert(h.codigo, r.at(h.codigo).critico) }
    critico-de = ck
  }

  orden.map(o => {
    let item = indice.mapa.at(o.codigo)
    let r = resolver-nodo(indice, o.codigo, fechas-de: fechas-de)
    let es-grupo = indice.hijos-de.at(o.codigo, default: ()).len() > 0
    let hito = item.at("hito", default: false) == true or (r.duracion <= 1 and es-vacio(item.at("termino", default: none)) and es-vacio(item.at("duracion", default: none)) and not es-grupo)
    let base = (
      codigo: o.codigo,
      id: item.at("id", default: o.codigo),
      nombre: item.at("nombre", default: ""),
      nivel: o.nivel,
      es-grupo: es-grupo,
      hito: hito,
      inicio-dias: r.inicio-dias,
      termino-dias: r.termino-dias,
      duracion: r.duracion,
      avance: calc.min(calc.max(r.avance, 0), 1),
      avance-serie: r.avance-serie,
      vinculo: item.at("vinculo", default: none),
      // Formato opcional por actividad (ver gantt.typ): "solida" (default),
      // "contorno", "rayas" o "gradiente" para la barra; negrita/italica
      // (true/false) y color-texto ("#rrggbb") para el nombre y las celdas.
      formato-barra: item.at("formato-barra", default: none),
      negrita: item.at("negrita", default: none),
      italica: item.at("italica", default: none),
      color-texto: item.at("color-texto", default: none),
      cantidad: r.cantidad,
      unidad: r.unidad,
      costo-unitario: r.costo-unitario,
      costo: r.costo,
    )
    if res-cpm == none { base }
    else {
      let extra = if es-grupo {
        (holgura: none, critico: marcar-critico(indice, o.codigo, critico-de), predecesoras: ())
      } else {
        let cr = res-cpm.at(o.codigo)
        let predecesoras-finales = if cpm-externo {
          cr.at("predecesoras", default: ())
        } else {
          interpretar-predecesoras(item.at("predecesoras", default: none))
            .map(a-dep-id)
        }
        (
          inicio-temprano-dias: cr.at("es", default: cr.at("inicio-temprano-dias", default: 0)),
          termino-temprano-dias: cr.at("ef", default: cr.at("termino-temprano-dias", default: 0)),
          inicio-tardio-dias: cr.at("ls", default: cr.at("inicio-tardio-dias", default: 0)),
          termino-tardio-dias: cr.at("lf", default: cr.at("termino-tardio-dias", default: 0)),
          holgura: cr.at("holgura", default: 0),
          critico: cr.at("critico", default: false),
          predecesoras: predecesoras-finales,
        )
      }
      (: ..base, ..extra)
    }
  })
}
