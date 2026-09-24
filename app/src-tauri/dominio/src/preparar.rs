use std::collections::HashMap;
use super::apu;
use super::cpm::calcular_cpm;
use super::fechas::a_dias;
use super::modelo::*;

struct Ctx {
    indice: Indice,
    orden: Vec<(String, i32)>,
    es_hoja: HashMap<String, bool>,
}

fn es_hoja_de(indice: &Indice, codigo: &str) -> bool {
    !indice.hijos_de.contains_key(codigo)
}

fn a_numero_o(v: Option<&serde_yaml::Value>) -> Option<f64> {
    match v {
        Some(val) => a_numero(val),
        None => None,
    }
}

fn a_bool_o(v: Option<&serde_yaml::Value>) -> Option<bool> {
    match v {
        Some(serde_yaml::Value::Bool(b)) => Some(*b),
        Some(serde_yaml::Value::String(s)) if s.to_lowercase() == "true" => Some(true),
        Some(serde_yaml::Value::String(s)) if s.to_lowercase() == "false" => Some(false),
        _ => None,
    }
}

fn a_texto(v: Option<&serde_yaml::Value>) -> Option<String> {
    match v {
        Some(val) if !es_vacio(val) => Some(val.as_str().unwrap_or("").to_string()),
        _ => None,
    }
}

fn resolver_hoja(
    ctx: &Ctx,
    codigo: &str,
    fechas_de: Option<&HashMap<String, (i64, i64)>>,
) -> Resuelto {
    let item = ctx.indice.mapa.get(codigo).expect("mapa");
    let dur: i64;
    let inicio_dias: i64;
    let termino_dias: i64;

    if let Some(fechas) = fechas_de {
        if let Some(&(es, ef)) = fechas.get(&item.id) {
            inicio_dias = es;
            termino_dias = ef;
            dur = ef - es + 1;
        } else {
            // No está en CPM (no es hoja?): caer a resolución directa
            let f = resolver_fechas_hoja(item);
            inicio_dias = f.0;
            termino_dias = f.1;
            dur = f.2;
        }
    } else {
        let f = resolver_fechas_hoja(item);
        inicio_dias = f.0;
        termino_dias = f.1;
        dur = f.2;
    }

    let av = interpretar_avance(campo(&item.map, "avance").unwrap_or(&serde_yaml::Value::Null));
    let cantidad = a_numero_o(campo(&item.map, "cantidad"));
    // costo-unitario explícito manda; si no, sale del APU (recursos x
    // rendimiento), mismo cálculo que precio-unitario-de-recursos (datos.typ).
    let cu = a_numero_o(campo(&item.map, "costo-unitario"))
        .or_else(|| apu::precio_unitario(campo(&item.map, "recursos").unwrap_or(&serde_yaml::Value::Null)));
    let costo_expl = a_numero_o(campo(&item.map, "costo"));
    let costo = costo_expl
        .or_else(|| match (cantidad, cu) {
            (Some(cc), Some(cuu)) => Some(cc * cuu),
            _ => None,
        });

    Resuelto {
        inicio_dias,
        termino_dias,
        duracion: dur,
        avance: av,
        cantidad,
        unidad: match campo(&item.map, "unidad") {
            Some(v) if !es_vacio(v) => Some(v.as_str().unwrap_or("").to_string()),
            _ => None,
        },
        costo_unitario: cu,
        costo,
    }
}

fn resolver_fechas_hoja(item: &ItemCrudo) -> (i64, i64, i64) {
    let inicio_raw = campo(&item.map, "inicio");
    assert!(
        !es_vacio(inicio_raw.unwrap_or(&serde_yaml::Value::Null)),
        "La tarea '{}' no tiene 'inicio' ni subtareas de las que heredar fechas.",
        item.codigo
    );
    let inicio_dias = a_dias(inicio_raw.unwrap()).expect("inicio");

    let termino_raw = campo(&item.map, "termino");
    let duracion_raw = a_numero_o(campo(&item.map, "duracion"));

    let termino_dias: i64;
    let duracion: i64;
    if !es_vacio(termino_raw.unwrap_or(&serde_yaml::Value::Null)) {
        termino_dias = a_dias(termino_raw.unwrap()).expect("termino");
        duracion = match duracion_raw {
            Some(d) => d as i64,
            None => termino_dias - inicio_dias + 1,
        };
    } else if let Some(d) = duracion_raw {
        duracion = d as i64;
        termino_dias = inicio_dias + (duracion.max(1)) - 1;
    } else {
        duracion = 1;
        termino_dias = inicio_dias;
    }

    (inicio_dias, termino_dias, duracion)
}

fn resolver_grupo(
    ctx: &Ctx,
    codigo: &str,
    fechas_de: Option<&HashMap<String, (i64, i64)>>,
) -> Resuelto {
    let item = ctx.indice.mapa.get(codigo).unwrap();
    let sub: Vec<Resuelto> = ctx.indice.hijos_de.get(codigo).map(|hijos| {
        hijos.iter().map(|h| resolver_en_grupo(ctx, h, fechas_de)).collect()
    }).unwrap_or_default();

    let inicio_raw = campo(&item.map, "inicio");
    let termino_raw = campo(&item.map, "termino");
    let duracion_raw = a_numero_o(campo(&item.map, "duracion"));

    let inicio_dias = if !es_vacio(inicio_raw.unwrap_or(&serde_yaml::Value::Null)) {
        a_dias(inicio_raw.unwrap()).unwrap()
    } else {
        sub.iter().map(|s| s.inicio_dias).min().unwrap_or(0)
    };
    let termino_dias = if !es_vacio(termino_raw.unwrap_or(&serde_yaml::Value::Null)) {
        a_dias(termino_raw.unwrap()).unwrap()
    } else {
        sub.iter().map(|s| s.termino_dias).max().unwrap_or(0)
    };
    let duracion = match duracion_raw {
        Some(d) => d as i64,
        None => termino_dias - inicio_dias + 1,
    };

    let avance_raw = campo(&item.map, "avance");
    let avance = if !es_vacio(avance_raw.unwrap_or(&serde_yaml::Value::Null)) {
        interpretar_avance(avance_raw.unwrap())
    } else {
        let peso_total: i64 = sub.iter().map(|s| s.duracion).sum();
        if peso_total > 0 {
            sub.iter().map(|s| s.avance * s.duracion as f64).sum::<f64>() / peso_total as f64
        } else {
            0.0
        }
    };

    let costos_hijos: f64 = sub.iter().filter_map(|s| s.costo).sum();
    let costo_expl = a_numero_o(campo(&item.map, "costo"));
    let costo = match costo_expl {
        Some(c) => Some(c),
        None => {
            if sub.iter().any(|s| s.costo.is_some()) {
                Some(costos_hijos)
            } else {
                None
            }
        }
    };

    Resuelto {
        inicio_dias,
        termino_dias,
        duracion,
        avance,
        cantidad: a_numero_o(campo(&item.map, "cantidad")),
        unidad: match campo(&item.map, "unidad") {
            Some(v) if !es_vacio(v) => Some(v.as_str().unwrap_or("").to_string()),
            _ => None,
        },
        costo_unitario: a_numero_o(campo(&item.map, "costo-unitario")),
        costo,
    }
}

fn resolver_en_grupo(
    ctx: &Ctx,
    codigo: &str,
    fechas_de: Option<&HashMap<String, (i64, i64)>>,
) -> Resuelto {
    if ctx.es_hoja[&codigo.to_string()] {
        resolver_hoja(ctx, codigo, fechas_de)
    } else {
        resolver_grupo(ctx, codigo, fechas_de)
    }
}

struct ExtraCpm {
    holgura: Option<i64>,
    critico: Option<bool>,
    predecesoras: Vec<Dep>,
}

fn marcar_critico(ctx: &Ctx, codigo: &str, criticos: &HashMap<String, bool>) -> bool {
    let id = ctx.indice.mapa.get(codigo).map(|x| x.id.clone()).unwrap_or_else(|| codigo.to_string());
    let hijos = ctx.indice.hijos_de.get(codigo).cloned().unwrap_or_default();
    if hijos.is_empty() {
        criticos.get(&id).copied().unwrap_or(false)
    } else {
        hijos.iter().any(|h| marcar_critico(ctx, h, criticos))
    }
}

fn extra_cpm_fila(
    ctx: &Ctx,
    codigo: &str,
    res_cpm: &HashMap<String, ResCpm>,
    critico_de: &HashMap<String, bool>,
    es_grupo: bool,
    referencias: &HashMap<String, String>,
) -> ExtraCpm {
    if es_grupo {
        ExtraCpm {
            holgura: None,
            critico: Some(marcar_critico(ctx, codigo, critico_de)),
            predecesoras: Vec::new(),
        }
    } else {
        let item = ctx.indice.mapa.get(codigo).unwrap();
        let r = &res_cpm[&item.id];
        ExtraCpm {
            holgura: Some(r.holgura),
            critico: Some(r.critico),
            predecesoras: resolver_deps(
                interpretar_predecesoras(
                    campo(&item.map, "predecesoras").unwrap_or(&serde_yaml::Value::Null)
                ),
                referencias,
            ),
        }
    }
}

pub fn preparar_proyecto(texto: &str, opts: &OpcionesCpm) -> Result<Vec<Fila>, String> {
    // Parse YAML: soporta lista raíz o {tareas: [...]}
    let raiz: serde_yaml::Value = serde_yaml::from_str(texto)
        .map_err(|e| format!("YAML inválido: {e}"))?;

    let lista = match &raiz {
        serde_yaml::Value::Sequence(_) => &raiz,
        serde_yaml::Value::Mapping(m) => {
            match m.get(&serde_yaml::Value::String("tareas".to_string())) {
                Some(v) => v,
                None => return Err("el YAML no tiene una lista 'tareas'".to_string()),
            }
        }
        _ => return Err("el YAML no tiene una lista 'tareas'".to_string()),
    };

    let mut plano: Vec<ItemCrudo> = Vec::new();
    aplanar(lista, None, true, &mut plano);
    if plano.is_empty() {
        return Err("el YAML no tiene tareas reconocibles".to_string());
    }

    let indice = construir_indice(&plano);
    let referencias = referencias_de(&plano);

    // Orden DFS (padre antes que hijos), con nivel
    let mut orden: Vec<(String, i32)> = Vec::new();
    fn visitar_dfs(indice: &Indice, codigo: &str, nivel: i32, out: &mut Vec<(String, i32)>) {
        out.push((codigo.to_string(), nivel));
        if let Some(hijos) = indice.hijos_de.get(codigo) {
            for hijo in hijos {
                visitar_dfs(indice, hijo, nivel + 1, out);
            }
        }
    }
    for r in &indice.raices {
        visitar_dfs(&indice, r, 0, &mut orden);
    }

    // Para cada hoja, calcular — es_hoja quick lookup
    let es_hoja: HashMap<String, bool> = indice.mapa.keys()
        .map(|k| (k.clone(), es_hoja_de(&indice, k)))
        .collect();

    let dia_proyecto = opts.inicio_proyecto.as_ref().and_then(|s| {
        serde_yaml::Value::String(s.clone()).as_str().and_then(|_| a_dias(&serde_yaml::Value::String(s.clone())))
    });
    let dia_proyecto_term = opts.termino_proyecto.as_ref().and_then(|s| {
        a_dias(&serde_yaml::Value::String(s.clone()))
    });

    let ctx = Ctx {
        indice: indice.clone(),
        orden,
        es_hoja,
    };

    // Colectar hojas para CPM
    let hojas: Vec<HojaCpm> = plano.iter().filter(|it| es_hoja_de(&indice, &it.codigo)).map(|it| {
        let inicio_raw = campo(&it.map, "inicio");
        let termino_raw = campo(&it.map, "termino");
        let tiene_inicio = !es_vacio(inicio_raw.unwrap_or(&serde_yaml::Value::Null));
        let tiene_termino = !es_vacio(termino_raw.unwrap_or(&serde_yaml::Value::Null));
        let es_ancla = if tiene_inicio {
            a_dias(inicio_raw.unwrap())
        } else { None };
        let ef_ancla = if tiene_termino {
            a_dias(termino_raw.unwrap())
        } else { None };
        let dur = a_numero_o(campo(&it.map, "duracion"))
            .map(|d| (d as i64).max(1))
            .or_else(|| {
                if tiene_inicio && tiene_termino {
                    Some(ef_ancla.unwrap() - es_ancla.unwrap() + 1)
                } else { None }
            })
            .unwrap_or(1);
        let predecesoras = resolver_deps(
            interpretar_predecesoras(
                campo(&it.map, "predecesoras").unwrap_or(&serde_yaml::Value::Null)
            ),
            &referencias,
        );
        HojaCpm { codigo: it.id.clone(), dur, es_ancla, ef_ancla, predecesoras }
    }).collect();

    let mut fechas_de: Option<HashMap<String, (i64, i64)>> = None;
    let mut critico_de: HashMap<String, bool> = HashMap::new();
    let mut res_cpm: HashMap<String, ResCpm> = HashMap::new();

    if opts.cpm {
        // Validar que las dependencias apunten a hojas existentes
        for h in &hojas {
            for d in &h.predecesoras {
                if !hojas.iter().any(|hh| hh.codigo == d.pred) {
                    return Err(format!(
                        "CPM: '{}' depende de '{}', que no existe o es un grupo",
                        h.codigo, d.pred
                    ));
                }
            }
        }

        let r = calcular_cpm(&hojas, dia_proyecto, dia_proyecto_term)?;

        let mut fechas = HashMap::new();
        for h in &hojas {
            let rr = &r[&h.codigo];
            fechas.insert(h.codigo.clone(), (rr.es, rr.ef));
        }
        fechas_de = Some(fechas);

        for h in &hojas {
            critico_de.insert(h.codigo.clone(), r[&h.codigo].critico);
        }
        res_cpm = r;
    }

    // Construir filas
    let mut filas: Vec<Fila> = Vec::new();
    for (codigo, nivel) in &ctx.orden {
        let item = ctx.indice.mapa.get(codigo).unwrap();
        let r = resolver_en_grupo(&ctx, codigo, fechas_de.as_ref());
        let es_grupo_fila = ctx.indice.hijos_de.get(codigo).map_or(false, |h| !h.is_empty());
        let hito = campo(&item.map, "hito") == Some(&serde_yaml::Value::Bool(true))
            || (r.duracion <= 1
                && es_vacio(campo(&item.map, "termino").unwrap_or(&serde_yaml::Value::Null))
                && es_vacio(campo(&item.map, "duracion").unwrap_or(&serde_yaml::Value::Null))
                && !es_grupo_fila);

        let extra = if opts.cpm {
            extra_cpm_fila(&ctx, codigo, &res_cpm, &critico_de, es_grupo_fila, &referencias)
        } else {
            ExtraCpm {
                holgura: None,
                critico: None,
                predecesoras: if es_grupo_fila {
                    Vec::new()
                } else {
                    resolver_deps(
                        interpretar_predecesoras(
                            campo(&item.map, "predecesoras").unwrap_or(&serde_yaml::Value::Null)
                        ),
                        &referencias,
                    )
                },
            }
        };

        let nombre = match campo(&item.map, "nombre") {
            Some(serde_yaml::Value::String(s)) if !s.trim().is_empty() => s.clone(),
            _ => codigo.clone(),
        };

        filas.push(Fila {
            codigo: codigo.clone(),
            id: item.id.clone(),
            nombre,
            nivel: *nivel,
            es_grupo: es_grupo_fila,
            hito,
            inicio_dias: r.inicio_dias,
            termino_dias: r.termino_dias,
            duracion: r.duracion,
            avance: r.avance.clamp(0.0, 1.0),
            padre: item.padre.clone(),
            predecesoras: extra.predecesoras.iter().map(|d| DepJson {
                pred: d.pred.clone(),
                tipo: d.tipo.as_str().to_string(),
                lag: d.lag,
            }).collect(),
            critico: extra.critico,
            holgura: extra.holgura,
            cantidad: r.cantidad,
            unidad: r.unidad,
            costo_unitario: r.costo_unitario,
            costo: r.costo,
            avance_serie: {
                let v = campo(&item.map, "avance").unwrap_or(&serde_yaml::Value::Null);
                interpretar_avance_completo(v).1
            },
            formato_barra: a_texto(campo(&item.map, "formato-barra")),
            negrita: a_bool_o(campo(&item.map, "negrita")),
            italica: a_bool_o(campo(&item.map, "italica")),
            color_texto: a_texto(campo(&item.map, "color-texto")),
            vinculo: a_texto(campo(&item.map, "vinculo")),
            ocultar_subtareas: a_bool_o(campo(&item.map, "ocultar-subtareas")),
        });
    }

    Ok(filas)
}