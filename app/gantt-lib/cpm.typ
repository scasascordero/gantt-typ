// cpm.typ
// Motor CPM (Critical Path Method) en Typst, sobre días consecutivos enteros.
//
// Convenciones:
//  - Un "día" es un entero (el día juliano de fechas.typ). Una tarea de
//    duración `d` que empieza el día `es` termina el día `es + d - 1`.
//  - Tipos de dependencia pred -> succ con desfase entero `lag` (default 0):
//      fs: el inicio de succ >= termino de pred + 1 + lag   (sin lag: empieza
//          al día siguiente de que termina su predecesora)
//      ss: el inicio de succ >= inicio de pred + lag
//      ff: el término de succ >= término de pred + lag
//      sf: el término de succ >= inicio de pred + lag
//  - Este módulo es un motor puro: no lee archivos ni conoce la jerarquía de
//    tareas. Recibe "hojas" ya normalizadas (ver `calcular-cpm`) y devuelve
//    un diccionario código -> (es, ef, ls, lf, holgura, critico).
//  - El punto común del proyecto es la fecha más temprana de las tareas
//    ancladas (las que traen `inicio`/`termino` explícito), salvo que el
//    llamador provea `inicio-proyecto`. El término del proyecto es el mayor
//    `ef` calculado, salvo que se provea `termino-proyecto`.

// Tipos de dependencia soportados.
#let tipos = ("fs", "ss", "ff", "sf")

// Cota inferior del INICIO de una tarea impuesta por una dependencia.
// `dep`: (pred, tipo, lag); `es-de`/`ef-de`: mapas con las fechas ya
// calculadas del predecesor; `dur-sucesor`: duración de la tarea sucesora.
#let cota-inicio(dep, es-de, ef-de, dur-sucesor) = {
  if dep.tipo == "fs" { ef-de.at(dep.pred) + 1 + dep.lag }
  else if dep.tipo == "ss" { es-de.at(dep.pred) + dep.lag }
  else if dep.tipo == "ff" { ef-de.at(dep.pred) + dep.lag - dur-sucesor + 1 }
  else { es-de.at(dep.pred) + dep.lag - dur-sucesor + 1 }
}

// Cota superior del TÉRMINO de una tarea impuesta por uno de sus sucesores.
// `succ-ls`/`succ-lf`/`succ-ef`: fechas ya calculadas del sucesor;
// `dur-pred`: duración de la tarea predecesora (la que se está acotando).
#let cota-termino(succ-ls, succ-lf, succ-ef, tipo, lag, dur-pred) = {
  if tipo == "fs" { succ-ls - 1 - lag }
  else if tipo == "ss" { succ-ls + dur-pred - 1 - lag }
  else if tipo == "ff" { succ-lf - lag }
  else { succ-ef - lag }
}

// Calcula el CPM de un conjunto de tareas hoja.
//
// hojas: lista de diccionarios
//   (codigo: str,
//    dur: int (>= 1),
//    es-ancla: none | int,   // inicio explícito (día juliano)
//    ef-ancla: none | int,   // término explícito (día juliano)
//    predecesoras: lista de (pred: str, tipo: str, lag: int))
//
// Retorna un diccionario codigo -> (es, ef, ls, lf, holgura, critico),
// donde "es/ef" son el inicio/término más tempranos y "ls/lf" los más
// tardíos; holgura = ls - es; crítico = holgura == 0.
#let calcular-cpm(hojas, inicio-proyecto: none, termino-proyecto: none) = {
  let dur-de = (:)
  let es-ancla-de = (:)
  let ef-ancla-de = (:)
  let deps-de = (:)
  for h in hojas {
    dur-de.insert(h.codigo, h.dur)
    if h.es-ancla != none { es-ancla-de.insert(h.codigo, h.es-ancla) }
    if h.ef-ancla != none { ef-ancla-de.insert(h.codigo, h.ef-ancla) }
    deps-de.insert(h.codigo, h.predecesoras)
  }

  // Las dependencias deben apuntar a tareas hoja existentes.
  for c in hojas.map(h => h.codigo) {
    for dep in deps-de.at(c, default: ()) {
      assert(
        dep.pred in dur-de,
        message: "CPM: la tarea '" + c + "' depende de '" + dep.pred
          + "', que no existe o es una tarea con subtareas. Las dependencias "
          + "deben apuntar a tareas hoja.",
      )
    }
  }

  // Índice de sucesores: pred -> lista de (succ, tipo, lag).
  let succ-de = (:)
  for h in hojas {
    for dep in h.predecesoras {
      if not (dep.pred in succ-de) { succ-de.insert(dep.pred, ()) }
      succ-de.at(dep.pred).push((succ: h.codigo, tipo: dep.tipo, lag: dep.lag))
    }
  }

  // Orden topológico (Kahn). El cierre de un ciclo es un error de datos.
  let grado = (:)
  for h in hojas {
    grado.insert(h.codigo, deps-de.at(h.codigo, default: ()).len())
  }
  let cola = ()
  for h in hojas { if grado.at(h.codigo) == 0 { cola.push(h.codigo) } }
  let orden = ()
  while cola.len() > 0 {
    let c = cola.at(0)
    cola = cola.slice(1)
    orden.push(c)
    for s in succ-de.at(c, default: ()) {
      grado.insert(s.succ, grado.at(s.succ) - 1)
      if grado.at(s.succ) == 0 { cola.push(s.succ) }
    }
  }
  if orden.len() != hojas.len() {
    let con-ciclo = hojas.map(h => h.codigo).filter(c => not (c in orden))
    panic(
      "CPM: hay un ciclo en las dependencias. Tareas involucradas: "
        + con-ciclo.join(", "),
    )
  }

  // Fecha común de arranque para las tareas sin anclas ni predecesoras.
  let anclas = ()
  for h in hojas {
    if h.es-ancla != none { anclas.push(h.es-ancla) }
    else if h.ef-ancla != none { anclas.push(h.ef-ancla - h.dur + 1) }
  }
  let base = if inicio-proyecto != none {
    inicio-proyecto
  } else if anclas.len() > 0 {
    calc.min(..anclas)
  } else {
    none
  }

  // --- Pase hacia adelante: es / ef -------------------------------------
  let es-de = (:)
  let ef-de = (:)
  for c in orden {
    let dur = dur-de.at(c)
    let cands = ()
    if c in es-ancla-de { cands.push(es-ancla-de.at(c)) }
    if c in ef-ancla-de { cands.push(ef-ancla-de.at(c) - dur + 1) }
    for dep in deps-de.at(c, default: ()) {
      cands.push(cota-inicio(dep, es-de, ef-de, dur))
    }
    let start = if cands.len() > 0 {
      calc.max(..cands)
    } else if base != none {
      base
    } else {
      panic(
        "CPM: la tarea '" + c + "' no tiene inicio explícito ni predecesoras "
          + "y no se definió inicio-proyecto. Dale un 'inicio' o configura "
          + "inicio-proyecto.",
      )
    }
    let fin = start + dur - 1
    es-de.insert(c, start)
    ef-de.insert(c, fin)
  }

  // --- Pase hacia atrás: ls / lf ----------------------------------------
  let lf-de = (:)
  let ls-de = (:)
  let proyecto-term = if termino-proyecto != none {
    termino-proyecto
  } else {
    calc.max(..hojas.map(h => ef-de.at(h.codigo)))
  }
  for c in orden.rev() {
    let dur = dur-de.at(c)
    let cotas = ()
    for s in succ-de.at(c, default: ()) {
      cotas.push(
        cota-termino(ls-de.at(s.succ), lf-de.at(s.succ), ef-de.at(s.succ), s.tipo, s.lag, dur),
      )
    }
    let lf-c = if cotas.len() > 0 { calc.min(..cotas) } else { proyecto-term }
    let ls-c = lf-c - dur + 1
    lf-de.insert(c, lf-c)
    ls-de.insert(c, ls-c)
  }

  let res = (:)
  for h in hojas {
    let c = h.codigo
    let es = es-de.at(c)
    let ef = ef-de.at(c)
    let ls = ls-de.at(c)
    let lf = lf-de.at(c)
    let holgura = ls - es
    res.insert(c, (es: es, ef: ef, ls: ls, lf: lf, holgura: holgura, critico: holgura == 0))
  }
  res
}