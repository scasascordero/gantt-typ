use std::collections::HashMap;
use petgraph::graph::{NodeIndex, DiGraph};
use super::modelo::{Dep, HojaCpm, ResCpm, TipoDep};

#[derive(Clone, Debug)]
struct NodoGrafo {
    codigo: String,
}

// Una dependencia puede apuntar a una hoja o a un grupo (tarea resumen). `grupos`
// da, por id de grupo, las hojas que contiene: un grupo empieza cuando empieza su
// primera hoja (mínimo de sus ES) y termina cuando termina la última (máximo de
// sus EF), como en MS Project.
pub fn calcular_cpm(
    hojas: &[HojaCpm],
    grupos: &HashMap<String, Vec<String>>,
    inicio_proyecto: Option<i64>,
    termino_proyecto: Option<i64>,
) -> Result<HashMap<String, ResCpm>, String> {
    if hojas.is_empty() {
        return Ok(HashMap::new());
    }

    // 1. Construir grafo dirigido
    let mut g = DiGraph::<NodoGrafo, Dep>::new();
    let mut idx_map: HashMap<String, NodeIndex> = HashMap::new();

    for h in hojas {
        let idx = g.add_node(NodoGrafo { codigo: h.codigo.clone() });
        idx_map.insert(h.codigo.clone(), idx);
    }

    // Hojas que cubre una dependencia: la propia hoja o las de un grupo.
    let cubiertas = |pred: &str| -> Vec<String> {
        if idx_map.contains_key(pred) {
            vec![pred.to_string()]
        } else {
            grupos.get(pred).cloned().unwrap_or_default()
        }
    };
    // ¿la dependencia `pred` alcanza a la hoja `c`?
    let cubre = |pred: &str, c: &str| -> bool {
        pred == c || grupos.get(pred).map_or(false, |v| v.iter().any(|x| x == c))
    };

    // 2. Agregar aristas (predecesora -> succede); una dependencia sobre un grupo
    // pone una arista desde cada una de sus hojas.
    let mut grado: HashMap<String, i64> = HashMap::new();
    for h in hojas {
        grado.insert(h.codigo.clone(), 0);
    }
    for h in hojas {
        let succ = *idx_map.get(&h.codigo).unwrap();
        for d in &h.predecesoras {
            for hoja_pred in cubiertas(&d.pred) {
                // una tarea no depende de su propio grupo
                if hoja_pred == h.codigo {
                    continue;
                }
                g.add_edge(idx_map[&hoja_pred], succ, d.clone());
                *grado.get_mut(&h.codigo).unwrap() += 1;
            }
        }
    }

    // 3. Topological sort (Kahn)
    let mut cola: Vec<String> = hojas.iter()
        .filter(|h| grado[&h.codigo] == 0)
        .map(|h| h.codigo.clone())
        .collect();
    let mut topo: Vec<String> = Vec::new();

    while let Some(c) = cola.first().cloned() {
        cola.remove(0);
        topo.push(c.clone());
        if let Some(&idx) = idx_map.get(&c) {
            for succ in g.neighbors(idx).collect::<Vec<_>>() {
                let succ_code = &g[succ].codigo;
                *grado.get_mut(succ_code).unwrap() -= 1;
                if grado[succ_code] == 0 {
                    cola.push(succ_code.clone());
                }
            }
        }
    }

    if topo.len() != hojas.len() {
        let ciclo: Vec<&str> = hojas.iter()
            .filter(|h| !topo.contains(&h.codigo))
            .map(|h| h.codigo.as_str())
            .collect();
        return Err(format!("CPM: ciclo en dependencias: {}", ciclo.join(", ")));
    }

    // 4. Maps por código
    let mut dur_de: HashMap<String, i64> = HashMap::new();
    let mut es_ancla_de: HashMap<String, i64> = HashMap::new();
    let mut ef_ancla_de: HashMap<String, i64> = HashMap::new();
    let mut deps_de: HashMap<String, Vec<Dep>> = HashMap::new();

    for h in hojas {
        dur_de.insert(h.codigo.clone(), h.dur);
        if let Some(es) = h.es_ancla { es_ancla_de.insert(h.codigo.clone(), es); }
        if let Some(ef) = h.ef_ancla { ef_ancla_de.insert(h.codigo.clone(), ef); }
        deps_de.insert(h.codigo.clone(), h.predecesoras.clone());
    }

    // 5. Base = inicio_proyecto o min de anclas
    let anclas: Vec<i64> = hojas.iter().filter_map(|h| {
        if let Some(es) = es_ancla_de.get(&h.codigo) {
            Some(*es)
        } else if let Some(ef) = ef_ancla_de.get(&h.codigo) {
            Some(ef - h.dur + 1)
        } else {
            None
        }
    }).collect();

    let base = inicio_proyecto.or_else(|| anclas.iter().cloned().min());

    // 6. Forward pass (es, ef)
    let mut es_de: HashMap<String, i64> = HashMap::new();
    let mut ef_de: HashMap<String, i64> = HashMap::new();

    for c in &topo {
        let dur = *dur_de.get(c).unwrap();
        let mut cands: Vec<i64> = Vec::new();

        if let Some(&es) = es_ancla_de.get(c) { cands.push(es); }
        if let Some(&ef) = ef_ancla_de.get(c) { cands.push(ef - dur + 1); }

        for d in deps_de.get(c).unwrap_or(&vec![]) {
            // inicio/término de la predecesora: de la hoja o agregados de su grupo
            let hechas: Vec<String> = cubiertas(&d.pred).into_iter().filter(|x| es_de.contains_key(x)).collect();
            if hechas.is_empty() {
                continue;
            }
            let pred_es = hechas.iter().map(|x| es_de[x]).min().unwrap();
            let pred_ef = hechas.iter().map(|x| ef_de[x]).max().unwrap();
            let cota = match d.tipo {
                TipoDep::Fs => pred_ef + 1 + d.lag,
                TipoDep::Ss => pred_es + d.lag,
                TipoDep::Ff => pred_ef + d.lag - dur + 1,
                TipoDep::Sf => pred_es + d.lag - dur + 1,
            };
            cands.push(cota);
        }

        let start = if !cands.is_empty() {
            cands.iter().cloned().max().unwrap()
        } else if let Some(b) = base {
            b
        } else {
            return Err(format!("CPM: '{}' sin inicio, sin predecesoras y sin inicio-proyecto", c));
        };

        es_de.insert(c.clone(), start);
        ef_de.insert(c.clone(), start + dur - 1);
    }

    // 7. Backward pass (ls, lf)
    let proyecto_term = termino_proyecto.map_or_else(
        || topo.iter().map(|c| *ef_de.get(c).unwrap()).max().unwrap_or(0),
        |t| t,
    );

    let mut lf_de: HashMap<String, i64> = HashMap::new();
    let mut ls_de: HashMap<String, i64> = HashMap::new();

    for c in topo.iter().rev() {
        let dur = *dur_de.get(c).unwrap();
        let cotas: Vec<i64> = g.neighbors(*idx_map.get(c).unwrap()).collect::<Vec<_>>().iter().map(|&succ| {
            let succ_code = &g[succ].codigo;
            let ls = *ls_de.get(succ_code).unwrap();
            let lf = *lf_de.get(succ_code).unwrap();
            let succ_ef = *ef_de.get(succ_code).unwrap();
            // Cota de cada dependencia de `succ` que alcanza a esta hoja (directa o
            // vía un grupo que la contiene); se toma la más restrictiva.
            deps_de.get(succ_code).unwrap().iter()
                .filter(|d| cubre(&d.pred, c))
                .map(|d| match d.tipo {
                    TipoDep::Fs => ls - 1 - d.lag,
                    TipoDep::Ss => ls + dur - 1 - d.lag,
                    TipoDep::Ff => lf - d.lag,
                    TipoDep::Sf => succ_ef - d.lag,
                })
                .min()
                .unwrap_or(i64::MAX)
        }).collect();

        let lf = if !cotas.is_empty() {
            cotas.iter().cloned().min().unwrap()
        } else {
            proyecto_term
        };

        lf_de.insert(c.clone(), lf);
        ls_de.insert(c.clone(), lf - dur + 1);
    }

    // 8. Holgura y ruta crítica
    let mut resultado = HashMap::new();
    for c in topo {
        let es = *es_de.get(&c).unwrap();
        let ef = *ef_de.get(&c).unwrap();
        let ls = *ls_de.get(&c).unwrap();
        let lf = *lf_de.get(&c).unwrap();
        let holgura = ls - es;
        resultado.insert(c, ResCpm { es, ef, ls, lf, holgura, critico: holgura == 0 });
    }

    Ok(resultado)
}
