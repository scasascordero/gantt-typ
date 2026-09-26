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
//  - Una dependencia puede apuntar a un grupo (tarea con subtareas): equivale
//    a depender de todas sus hojas. El grupo empieza cuando empieza su primera
//    hoja (mínimo de es) y termina cuando termina la última (máximo de ef).
//  - El punto común del proyecto es la fecha más temprana de las tareas
//    ancladas (las que traen `inicio`/`termino` explícito), salvo que el
//    llamador provea `inicio-proyecto`. El término del proyecto es el mayor
//    `ef` calculado, salvo que se provea `termino-proyecto`.

// Tipos de dependencia soportados.
#let tipos = ("fs", "ss", "ff", "sf")

// Cota inferior del INICIO de una tarea impuesta por una dependencia, dado el
// inicio (`pred-es`) y el término (`pred-ef`) de la predecesora (los de una
// hoja o los agregados de un grupo). `dep`: (pred, tipo, lag);
// `dur-sucesor`: duración de la tarea sucesora.
#let cota-desde(dep, pred-es, pred-ef, dur-sucesor) = {
  if dep.tipo == "fs" { pred-ef + 1 + dep.lag }
  else if dep.tipo == "ss" { pred-es + dep.lag }
  else if dep.tipo == "ff" { pred-ef + dep.lag - dur-sucesor + 1 }
  else { pred-es + dep.lag - dur-sucesor + 1 }
}

// Igual que `cota-desde`, leyendo las fechas de la predecesora (una hoja) de
// los mapas `es-de`/`ef-de` ya calculados.
#let cota-inicio(dep, es-de, ef-de, dur-sucesor) = {
  cota-desde(dep, es-de.at(dep.pred), ef-de.at(dep.pred), dur-sucesor)
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
//   `pred` es el código de una hoja o de un grupo.
// grupos: diccionario código-de-grupo -> lista de los códigos de sus hojas
//   (todas las descendientes). Sin él, las dependencias solo pueden apuntar a
//   hojas.
//
// Retorna un diccionario codigo -> (es, ef, ls, lf, holgura, critico),
// donde "es/ef" son el inicio/término más tempranos y "ls/lf" los más
// tardíos; holgura = ls - es; crítico = holgura == 0.
#let calcular-cpm(hojas, grupos: (:), inicio-proyecto: none, termino-proyecto: none) = {
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

  // Hojas que cubre una dependencia: la propia hoja o las de un grupo.
  let cubiertas(pred) = if pred in dur-de { (pred,) } else { grupos.at(pred, default: ()) }

  // Las dependencias deben apuntar a tareas existentes (hoja o grupo).
  for c in hojas.map(h => h.codigo) {
    for dep in deps-de.at(c, default: ()) {
      assert(
        dep.pred in dur-de or dep.pred in grupos,
        message: "CPM: la tarea '" + c + "' depende de '" + dep.pred
          + "', que no existe.",
      )
    }
  }

  // Índice de sucesores: hoja -> lista de (succ, tipo, lag). Una dependencia
  // sobre un grupo aporta una arista desde cada una de sus hojas (una tarea no
  // depende de su propio grupo: esa arista se omite). El grado de entrada de
  // cada hoja cuenta esas aristas.
  let succ-de = (:)
  let grado = (:)
  for h in hojas { grado.insert(h.codigo, 0) }
  for h in hojas {
    for dep in h.predecesoras {
      for hp in cubiertas(dep.pred) {
        if hp == h.codigo { continue }
        if not (hp in succ-de) { succ-de.insert(hp, ()) }
        succ-de.at(hp).push((succ: h.codigo, tipo: dep.tipo, lag: dep.lag))
        grado.insert(h.codigo, grado.at(h.codigo) + 1)
      }
    }
  }

  // Orden topológico (Kahn). El cierre de un ciclo es un error de datos.
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
      // inicio/término de la predecesora: de la hoja o agregados de su grupo
      let hechas = cubiertas(dep.pred).filter(x => x in es-de)
      if hechas.len() == 0 { continue }
      let pred-es = calc.min(..hechas.map(x => es-de.at(x)))
      let pred-ef = calc.max(..hechas.map(x => ef-de.at(x)))
      cands.push(cota-desde(dep, pred-es, pred-ef, dur))
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