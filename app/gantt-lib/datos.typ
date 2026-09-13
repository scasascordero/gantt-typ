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
    (
      inicio-dias: f.inicio-dias, termino-dias: f.termino-dias, duracion: f.duracion,
      avance: av.avance, avance-serie: av.serie,
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

    (
      inicio-dias: inicio-dias, termino-dias: termino-dias, duracion: duracion,
      avance: avance, avance-serie: avance-serie,
    )
  }
}

// --- Orden de dibujo (DFS, padres antes que hijos) -----------------------

// Recursivo puro: retorna la lista de (codigo, nivel) de un nodo y sus
// descendientes, en vez de mutar un acumulador externo.
#let visitar-nodo(indice, codigo, nivel) = {
  let salida = ((codigo: codigo, nivel: nivel),)
  for hijo in indice.hijos-de.at(codigo, default: ()) {
    salida += visitar-nodo(indice, hijo, nivel + 1)
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
#let preparar-tareas(
  datos-crudos,
  cpm: false,
  inicio-proyecto: none,
  termino-proyecto: none,
) = {
  let plano = aplanar(datos-crudos)
  let indice = construir-indice(plano)
  let orden = orden-dfs(indice)

  let dia-proyecto = if inicio-proyecto != none { dia-ancla(inicio-proyecto) } else { none }
  let dia-proyecto-term = if termino-proyecto != none { dia-ancla(termino-proyecto) } else { none }

  // Una tarea sin subtareas ("hoja") es la unidad que participa en el CPM;
  // los grupos son solo el "sobre" de sus hijas y no participan en la red.
  let es-hoja(codigo) = not (codigo in indice.hijos-de)

  let res-cpm = none
  let fechas-de = none
  let critico-de = none
  if cpm {
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
        predecesoras: interpretar-predecesoras(it.at("predecesoras", default: none)),
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
    )
    if not cpm { base }
    else {
      let extra = if es-grupo {
        (holgura: none, critico: marcar-critico(indice, o.codigo, critico-de), predecesoras: ())
      } else {
        let cr = res-cpm.at(o.codigo)
        (
          inicio-temprano-dias: cr.es, termino-temprano-dias: cr.ef,
          inicio-tardio-dias: cr.ls, termino-tardio-dias: cr.lf,
          holgura: cr.holgura, critico: cr.critico,
          predecesoras: interpretar-predecesoras(item.at("predecesoras", default: none)),
        )
      }
      (: ..base, ..extra)
    }
  })
}
