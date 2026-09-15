// importar.rs — Importadores PMXML (Primavera P6 XML) y XER (Primavera P6)
// + lectores de Excel (.xlsx). Homólogos Rust de `mspdi.ts`: reconstruyen la
// jerarquía y emiten el YAML que consume la librería (`tareas` con
// `subtareas`). PMXML/XER no llevan el código original → se regenera
// secuencial (1, 1.1, 1.1.2…) igual que mspdi.ts cuando no trae Text1.

use serde::Serialize;
use std::collections::HashMap;

// --- Nodo intermedio: tarea plana del formato, antes de armar árbol --------

struct NodoPlano {
    uid: String, // identificador del formato (PMXML UID / XER TASK_ID)
    nombre: String,
    inicio: Option<String>,
    termino: Option<String>,
    hito: bool,
    avance: Option<f64>,
    nivel: usize,
    deps: Vec<(String, String, i64)>, // (uid_dep, tipo, lag_dias)
}

fn decod(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&amp;", "&")
}

fn fecha_de(s: &str) -> Option<String> {
    let partes: Vec<&str> = s.split('-').collect();
    if partes.len() >= 3 && partes[0].len() == 4 && partes[1].len() == 2 {
        let d: String = partes[2].chars().take_while(|c| c.is_ascii_digit()).collect();
        if d.len() == 2 {
            return Some(format!("{}-{}-{}", partes[0], partes[1], d));
        }
    }
    None
}

// --- Construcción de YAML final a partir de la lista plana ------------------

fn k(s: &str) -> serde_yaml::Value {
    serde_yaml::Value::String(s.to_string())
}

fn esc_y(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn valor_y(v: &serde_yaml::Value) -> String {
    match v {
        serde_yaml::Value::String(s) => esc_y(s),
        serde_yaml::Value::Bool(b) => b.to_string(),
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::Sequence(seq) => {
            let items: Vec<String> = seq.iter().map(valor_y).collect();
            format!("[{}]", items.join(", "))
        }
        _ => String::new(),
    }
}

fn emitir_tareas(nodos: &[serde_yaml::Mapping], prof: usize, out: &mut Vec<String>) {
    let item = "  ".repeat(prof + 1);
    let campo = format!("{item}  ");
    for m in nodos {
        let codigo = m.get(&k("codigo")).map(valor_y).unwrap_or_default();
        out.push(format!("{item}- codigo: {codigo}"));
        for (clave, valor) in m.iter() {
            let c = clave.as_str().unwrap_or("");
            if c == "codigo" || c == "subtareas" {
                continue;
            }
            out.push(format!("{campo}{c}: {}", valor_y(valor)));
        }
        if let Some(serde_yaml::Value::Sequence(sub)) = m.get(&k("subtareas")) {
            out.push(format!("{campo}subtareas:"));
            let hijos: Vec<serde_yaml::Mapping> = sub
                .iter()
                .filter_map(|x| match x {
                    serde_yaml::Value::Mapping(mm) => Some(mm.clone()),
                    _ => None,
                })
                .collect();
            emitir_tareas(&hijos, prof + 1, out);
        }
    }
}

fn armas_yaml(planas: Vec<NodoPlano>, comentario: &str) -> Result<String, String> {
    if planas.is_empty() {
        return Err(format!("{comentario} sin tareas reconocidas"));
    }

    // padre vía pila: el orden documento = preorden del árbol, y el padre es
    // el último nodo abierto con nivel menor.
    let n = planas.len();
    let mut raices: Vec<usize> = Vec::new();
    let mut padre: Vec<usize> = vec![usize::MAX; n];
    let mut pila: Vec<usize> = Vec::new();
    for (i, t) in planas.iter().enumerate() {
        while let Some(&p) = pila.last() {
            if planas[p].nivel >= t.nivel {
                pila.pop();
            } else {
                break;
            }
        }
        if let Some(&p) = pila.last() {
            padre[i] = p;
        } else {
            raices.push(i);
        }
        pila.push(i);
    }

    // códigos punteados por nivel en preorden + mapa uid→id (el id del
    // formato se conserva; si no hay uid, el id es el código)
    let mut id_uid: HashMap<String, String> = HashMap::new();
    let mut contador: HashMap<usize, usize> = HashMap::new();
    let mut prefijo: HashMap<usize, String> = HashMap::new();
    let mut nodes: Vec<serde_yaml::Mapping> = Vec::with_capacity(n);
    for t in &planas {
        let nivel = t.nivel;
        let c = contador.get(&nivel).copied().unwrap_or(0) + 1;
        contador.insert(nivel, c);
        let codigo = if nivel == 0 {
            c.to_string()
        } else {
            let base = prefijo.get(&(nivel - 1)).cloned().unwrap_or_default();
            format!("{base}.{c}")
        };
        prefijo.insert(nivel, codigo.clone());
        let id = if t.uid.is_empty() { codigo.clone() } else { t.uid.clone() };
        if !t.uid.is_empty() {
            id_uid.insert(t.uid.clone(), id.clone());
        }

        let mut m = serde_yaml::Mapping::new();
        m.insert(k("codigo"), k(&codigo));
        m.insert(k("id"), k(&id));
        m.insert(k("nombre"), k(&t.nombre));
        if let Some(ini) = &t.inicio {
            m.insert(k("inicio"), k(ini));
        }
        if t.hito {
            m.insert(k("hito"), serde_yaml::Value::Bool(true));
        } else if let Some(fin) = &t.termino {
            if t.inicio.as_deref() != Some(fin.as_str()) {
                m.insert(k("termino"), k(fin));
            }
        }
        if let Some(av) = t.avance {
            m.insert(k("avance"), k(&format!("{}%", (av * 100.0).round() as i64)));
        }
        nodes.push(m);
    }

    // predecesoras: uid → id del predecesor
    for (i, t) in planas.iter().enumerate() {
        if t.deps.is_empty() {
            continue;
        }
        let lista: Vec<serde_yaml::Value> = t
            .deps
            .iter()
            .filter_map(|(uid, tipo, lag)| {
                let pred = id_uid.get(uid)?;
                let s = if *tipo == "fs" && *lag == 0 {
                    pred.clone()
                } else if *lag == 0 {
                    format!("{pred}:{tipo}")
                } else {
                    format!("{pred}:{tipo}:{lag}")
                };
                Some(serde_yaml::Value::String(s))
            })
            .collect();
        if lista.is_empty() {
            continue;
        }
        if lista.len() == 1 {
            if let serde_yaml::Value::String(una) = &lista[0] {
                nodes[i].insert(k("predecesoras"), k(una));
            }
        } else {
            nodes[i].insert(k("predecesoras"), serde_yaml::Value::Sequence(lista));
        }
    }

    // adjuntar subárboles (en orden inverso: el hijo obtiene sus `subtareas`
    // antes de que el padre capture su clon)
    let mut hijos: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (i, &p) in padre.iter().enumerate() {
        if p != usize::MAX {
            hijos[p].push(i);
        }
    }
    for (p, hs) in hijos.iter().enumerate().rev() {
        if hs.is_empty() {
            continue;
        }
        let sub: Vec<serde_yaml::Value> = hs
            .iter()
            .map(|&h| serde_yaml::Value::Mapping(nodes[h].clone()))
            .collect();
        nodes[p].insert(k("subtareas"), serde_yaml::Value::Sequence(sub));
    }

    let raiz: Vec<serde_yaml::Mapping> = raices
        .iter()
        .map(|&r| nodes[r].clone())
        .collect();
    let mut out = vec![format!("# importado de {comentario}"), "tareas:".to_string()];
    emitir_tareas(&raiz, 0, &mut out);
    Ok(out.join("\n") + "\n")
}

// --- PMXML (Primavera P6 XML) ------------------------------------------------

fn campo(bloque: &str, nombre: &str) -> Option<String> {
    let abrir = format!("<{nombre}>");
    let cerrar = format!("</{nombre}>");
    let i = bloque.find(&abrir)? + abrir.len();
    let r = bloque[i..].find(&cerrar)?;
    let contenido = &bloque[i..i + r];
    Some(decod(contenido.trim()))
}

pub fn desde_pmxml(xml: &str) -> Result<String, String> {
    // 1) tareas en orden documento (uid + padre real) y su bloque XML
    let mut crudas: Vec<(String, String, Option<String>, String)> = Vec::new();
    for bloque in xml.split("<Task>").skip(1) {
        let bloque = bloque.split("</Task>").next().unwrap_or("");
        if campo(bloque, "Name").map(|n| n.trim().is_empty()).unwrap_or(true) {
            continue;
        }
        let uid = campo(bloque, "TaskUniqueID")
            .or_else(|| campo(bloque, "TaskID"))
            .unwrap_or_default();
        if uid.is_empty() {
            continue;
        }
        let padre = campo(bloque, "ParentTaskID");
        crudas.push((uid, campo(bloque, "Name").unwrap_or_default(), padre, bloque.to_string()));
    }
    if crudas.is_empty() {
        return Err("PMXML sin tareas reconocidas".to_string());
    }

    // 2) nivel = profundidad de la cadena de padres (memoizada), raíz = 0
    let mut padres: HashMap<String, String> = HashMap::new();
    for (uid, _, p, _) in &crudas {
        if let Some(puid) = p {
            if crudas.iter().any(|(u, _, _, _)| u == puid) {
                padres.insert(uid.clone(), puid.clone());
            }
        }
    }
    fn profundidad(uid: &str, padres: &HashMap<String, String>, memo: &mut HashMap<String, usize>) -> usize {
        if let Some(&d) = memo.get(uid) {
            return d;
        }
        let d = match padres.get(uid) {
            Some(p) => profundidad(p, padres, memo) + 1,
            None => 0,
        };
        memo.insert(uid.to_string(), d);
        d
    }
    let mut memo: HashMap<String, usize> = HashMap::new();
    let niveles: Vec<usize> = crudas.iter().map(|(uid, _, _, _)| profundidad(uid, &padres, &mut memo)).collect();

    // 3) dependencias desde bloques <Relationship> (Sucesor ← Predecesor)
    let mut deps: HashMap<String, Vec<(String, String, i64)>> = HashMap::new();
    for bloque in xml.split("<Relationship>").skip(1) {
        let bloque = bloque.split("</Relationship>").next().unwrap_or("");
        let tipo = match campo(bloque, "RelationshipType").unwrap_or_default().as_str() {
            "StartToStart" => "ss",
            "FinishToFinish" => "ff",
            "StartToFinish" => "sf",
            _ => "fs",
        };
        let lag = campo(bloque, "LagDurationInteger")
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let pred = campo(bloque, "PredecessorTaskID").unwrap_or_default();
        let succ = campo(bloque, "SuccessorTaskID").unwrap_or_default();
        if pred.is_empty() || succ.is_empty() {
            continue;
        }
        deps.entry(succ).or_default().push((pred, tipo.to_string(), lag));
    }

    // 4) plano final en orden documento
    let mut planas = Vec::with_capacity(crudas.len());
    for ((uid, nombre, _, bloque), nivel) in crudas.into_iter().zip(niveles) {
        let type_ = campo(&bloque, "Type").unwrap_or_default();
        let hito = type_ == "Milestone";
        let pc = campo(&bloque, "PercentComplete")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let avance = if pc >= 100.0 {
            Some(1.0)
        } else if pc > 0.0 {
            Some(pc / 100.0)
        } else {
            None
        };
        planas.push(NodoPlano {
            uid: uid.clone(),
            nombre,
            inicio: campo(&bloque, "Start").and_then(|s| fecha_de(&s)),
            termino: campo(&bloque, "Finish").and_then(|s| fecha_de(&s)),
            hito,
            avance,
            nivel,
            deps: deps.remove(&uid).unwrap_or_default(),
        });
    }
    armas_yaml(planas, "PMXML")
}

// --- XER (Primavera P6, TSV) ------------------------------------------------

fn idx_header(header: &[String], name: &str) -> usize {
    header.iter().position(|c| c == name).unwrap_or(usize::MAX)
}

pub fn desde_xer(texto: &str) -> Result<String, String> {
    let normalize = |l: &str| l.trim_end_matches('\r').trim().to_string();
    let mut bloques: HashMap<String, Vec<String>> = HashMap::new();
    let mut actual: Option<String> = None;
    for l in texto.lines().map(normalize) {
        if let Some(n) = l.strip_prefix("%T") {
            actual = Some(n.trim().to_string());
            continue;
        }
        if let Some(n) = &actual {
            if l == "%F" || l.is_empty() {
                continue;
            }
            // P6 real usa `%F` antes de los campos; nuestro exportador
            // escribe `%E`. Ambos van pegados a la fila de nombres.
            let l = l.strip_prefix("%E").map(|s| s.trim_start().to_string()).unwrap_or(l);
            bloques.entry(n.clone()).or_default().push(l);
        }
    }

    let filas_tarea: Vec<(String, String, usize, bool, Option<f64>, String, String)> = {
        let bloq = bloques.get("TASK");
        let cabecera: Vec<String> = bloq
            .and_then(|v| v.first())
            .map(|s| s.split('\t').map(|c| c.trim().to_string()).collect())
            .unwrap_or_default();
        let h = |name: &str| idx_header(&cabecera, name);
        let c_uid = h("TASK_ID");
        let c_nombre = h("NAME");
        let c_out = h("OUTLVL");
        let c_inicio = h("START_DATE");
        let c_fin = h("FINISH_DATE");
        let c_mile = h("MILESTONE");
        let c_status = h("STATUS_CODE");
        bloq.map(|v| {
            v.iter()
                .skip(1)
                .map(|s| s.split('\t').map(|c| c.trim().to_string()).collect())
                .filter_map(|f: Vec<String>| {
                    let nombre = f.get(c_nombre).cloned().unwrap_or_default();
                    if nombre.trim().is_empty() {
                        return None;
                    }
                    let nivel_raw: usize = f
                        .get(c_out)
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(1);
                    let hito = f
                        .get(c_mile)
                        .map(|s| s == "1" || s.eq_ignore_ascii_case("true"))
                        .unwrap_or(false);
                    let status = f.get(c_status).cloned().unwrap_or_default();
                    let avance = if status == "TK_Complete" { Some(1.0) } else { None };
                    Some((
                        f.get(c_uid).cloned().unwrap_or_default(),
                        nombre,
                        nivel_raw,
                        hito,
                        avance,
                        f.get(c_inicio).cloned().unwrap_or_default(),
                        f.get(c_fin).cloned().unwrap_or_default(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
    };

    if filas_tarea.is_empty() {
        return Err("XER sin bloque TASK".to_string());
    }

    // normalizar niveles: la raíz queda en 0
    let min_nivel = filas_tarea.iter().map(|t| t.2).min().unwrap_or(1);

    // predecesoras: bloque TASKPRED (PRED_TASK_ID → TASK_ID)
    let mut deps: HashMap<String, Vec<(String, String, i64)>> = HashMap::new();
    if let Some(bloq) = bloques.get("TASKPRED") {
        let cabecera: Vec<String> = bloq
            .first()
            .map(|s| s.split('\t').map(|c| c.trim().to_string()).collect())
            .unwrap_or_default();
        let h = |name: &str| idx_header(&cabecera, name);
        let c_pred_task = h("PRED_TASK_ID");
        let c_task = h("TASK_ID");
        let c_tipo = h("PRED_TYPE");
        let c_lag = h("PRED_LAG");
        for s in bloq.iter().skip(1) {
            let f: Vec<String> = s.split('\t').map(|c| c.trim().to_string()).collect();
            let task = f.get(c_task).cloned().unwrap_or_default();
            let pred = f.get(c_pred_task).cloned().unwrap_or_default();
            if task.is_empty() || pred.is_empty() {
                continue;
            }
            let tipo = match f.get(c_tipo).map(|s| s.as_str()).unwrap_or("") {
                "PR_FF" => "ff",
                "PR_SS" => "ss",
                "PR_SF" => "sf",
                _ => "fs",
            };
            let lag_dias = (f
                .get(c_lag)
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0)
                / 1440.0)
                .round() as i64;
            deps.entry(task).or_default().push((pred, tipo.to_string(), lag_dias));
        }
    }

    let planas: Vec<NodoPlano> = filas_tarea
        .into_iter()
        .map(|(uid, nombre, nivel_raw, hito, avance, ini, fin)| {
            let deps = deps.remove(&uid).unwrap_or_default();
            NodoPlano {
                uid,
                nombre,
                inicio: fecha_de(&ini),
                termino: fecha_de(&fin),
                hito,
                avance,
                nivel: nivel_raw.saturating_sub(min_nivel),
                deps,
            }
        })
        .collect();

    armas_yaml(planas, "XER")
}

// --- Excel (.xlsx): información y celdas -------------------------------------

// Ref A1 de un rango con nombre, p.ej. `Hoja1!$A$1:$J$20` o `A1:J20`.
// Devuelve (hoja, fila_ini, fila_fin, col_ini, col_fin) en índices 0-based.
fn refe_rect(refe: &str) -> Result<(String, usize, usize, usize, usize), String> {
    fn col_idx(s: &str) -> Option<usize> {
        let mut idx = 0usize;
        for c in s.chars() {
            let d = c.to_ascii_uppercase();
            if !('A'..='Z').contains(&d) {
                return None;
            }
            idx = idx * 26 + (d as u8 - b'A' + 1) as usize;
        }
        if idx == 0 { None } else { Some(idx - 1) }
    }
    fn celda(s: &str) -> Result<(usize, usize), String> {
        let s = s.trim().trim_start_matches('$');
        let letras: String = s.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
        let dig: String = s.chars().skip_while(|c| c.is_ascii_alphabetic()).collect();
        let col = col_idx(&letras).ok_or("refe inválida: columnas")?;
        let fila = dig.parse::<usize>().map_err(|_| "refe inválida: fila".to_string())?;
        if fila == 0 {
            return Err("refe inválida: fila 0".to_string());
        }
        Ok((col, fila - 1))
    }
    let (hoja, resto) = match refe.find('!') {
        Some(pos) => {
            let mut hoja = refe[..pos].to_string();
            if hoja.len() >= 2 && hoja.starts_with('\'') && hoja.ends_with('\'') {
                hoja = hoja[1..hoja.len() - 1].to_string();
            }
            (hoja, refe[pos + 1..].to_string())
        }
        None => (String::new(), refe.to_string()),
    };
    let (a, b) = resto.split_once(':').unwrap_or((resto.as_str(), ""));
    let (c1, f1) = celda(a)?;
    let (c2, f2) = if b.is_empty() { (c1, f1) } else { celda(b)? };
    Ok((hoja, f1.min(f2), f1.max(f2), c1.min(c2), c1.max(c2)))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcelInfo {
    pub hoja_sugerida: String,
    pub hojas: Vec<String>,
    pub rangos: Vec<RangoExcel>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RangoExcel {
    pub nombre: String,
    pub refe: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CeldaExcel {
    pub texto: Option<String>,
    pub numero: Option<f64>,
    pub fecha: Option<String>,
}

pub fn excel_info(ruta: &str) -> Result<ExcelInfo, String> {
    use calamine::{open_workbook, Reader, Xlsx};
    let wb = open_workbook::<Xlsx<std::io::BufReader<std::fs::File>>, _>(ruta).map_err(|e| e.to_string())?;
    let hojas: Vec<String> = wb.sheet_names().to_vec();
    let rangos: Vec<RangoExcel> = wb
        .defined_names()
        .iter()
        .map(|(nombre, refe)| RangoExcel { nombre: nombre.clone(), refe: refe.clone() })
        .collect();
    let hoja_sugerida = hojas
        .iter()
        .find(|h| h.eq_ignore_ascii_case("tareas"))
        .cloned()
        .unwrap_or_else(|| hojas.first().cloned().unwrap_or_default());
    Ok(ExcelInfo { hoja_sugerida, hojas, rangos })
}

// Lee la hoja indicada (o la sugerida si viene vacía) y devuelve las celdas
// usadas como matriz. `rango` es la ref A1 de un rango con nombre: si viene,
// fija la hoja y recorta la matriz al rectángulo (fila_ini..=fila_fin,
// col_ini..=col_fin). Las celdas con fecha salen en `fecha` (ISO); el resto
// como texto o número.
pub fn leer_excel_celdas(ruta: &str, hoja: &str, rango: Option<&str>) -> Result<Vec<Vec<Option<CeldaExcel>>>, String> {
    use calamine::{open_workbook, Data, Reader, Xlsx};
    use chrono::Datelike;

    let recorte = rango.map(refe_rect).transpose()?;
    let hoja_rango = recorte.as_ref().map(|r| r.0.clone()).unwrap_or_default();
    let hoja_efectiva = if !hoja_rango.is_empty() {
        hoja_rango
    } else if hoja.is_empty() {
        hoja.to_string()
    } else {
        hoja.to_string()
    };

    let mut wb = open_workbook::<Xlsx<std::io::BufReader<std::fs::File>>, _>(ruta).map_err(|e| e.to_string())?;
    let hojas: Vec<String> = wb.sheet_names().to_vec();
    let nombre = if hoja_efectiva.is_empty() {
        hojas
            .iter()
            .find(|h| h.eq_ignore_ascii_case("tareas"))
            .or_else(|| hojas.first())
            .cloned()
            .ok_or("libro Excel sin hojas")?
    } else {
        hoja_efectiva
    };
    let rango_hoja = wb.worksheet_range(&nombre).map_err(|e| e.to_string())?;
    let mut matriz: Vec<Vec<Option<CeldaExcel>>> = Vec::new();
    for fila in rango_hoja.rows() {
        let y: Vec<Option<CeldaExcel>> = fila
            .iter()
            .map(|c| match c {
                Data::Empty => None,
                Data::String(s) => Some(CeldaExcel { texto: Some(s.clone()), numero: None, fecha: None }),
                Data::Int(i) => Some(CeldaExcel { texto: None, numero: Some(*i as f64), fecha: None }),
                Data::Float(f) => Some(CeldaExcel { texto: None, numero: Some(*f), fecha: None }),
                Data::DateTime(dt) => {
                    let fecha = dt
                        .as_datetime()
                        .map(|nd| format!("{:04}-{:02}-{:02}", nd.year(), nd.month(), nd.day()));
                    Some(CeldaExcel {
                        texto: None,
                        numero: Some(dt.as_f64()),
                        fecha,
                    })
                }
                Data::Bool(b) => Some(CeldaExcel {
                    texto: Some(if *b { "verdadero" } else { "falso" }.to_string()),
                    numero: None,
                    fecha: None,
                }),
                Data::Error(e) => Some(CeldaExcel {
                    texto: Some(format!("#ERR {e:?}")),
                    numero: None,
                    fecha: None,
                }),
                Data::DateTimeIso(s) => {
                    Some(CeldaExcel { texto: Some(s.clone()), numero: None, fecha: Some(s.clone()) })
                }
                Data::DurationIso(s) => Some(CeldaExcel { texto: Some(s.clone()), numero: None, fecha: None }),
            })
            .collect();
        matriz.push(y);
    }

    // recortar al rectángulo del rango con nombre (índices 0-based inclusive)
    if let Some((_, fi, ff, ci, cf)) = recorte {
        let mut cortada: Vec<Vec<Option<CeldaExcel>>> = Vec::new();
        for (i, fila) in matriz.into_iter().enumerate() {
            if i < fi || i > ff {
                continue;
            }
            let fila: Vec<Option<CeldaExcel>> = fila
                .into_iter()
                .enumerate()
                .filter(|(j, _)| *j >= ci && *j <= cf)
                .map(|(_, c)| c)
                .collect();
            cortada.push(fila);
        }
        return Ok(cortada);
    }
    Ok(matriz)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pmxml_vacio_error() {
        assert!(desde_pmxml("<PMML></PMML>").is_err());
    }

    #[test]
    fn pmxml_proyecto_clasico() {
        let xml = r#"<?xml version="1.0"?>
<PMML>
  <Project>
    <Tasks>
      <Task>
        <TaskID>1</TaskID>
        <TaskUniqueID>1</TaskUniqueID>
        <Name>&lt;Diseño&gt;</Name>
        <Type>Task Summary</Type>
        <Start>2026-01-05 00:00</Start>
        <Finish>2026-01-12 23:59</Finish>
      </Task>
      <Task>
        <TaskID>2</TaskID>
        <TaskUniqueID>2</TaskUniqueID>
        <Name>Boceto</Name>
        <Type>Task Dependent</Type>
        <Start>2026-01-05 00:00</Start>
        <Finish>2026-01-05 23:59</Finish>
        <PercentComplete>100</PercentComplete>
        <ParentTaskID>1</ParentTaskID>
      </Task>
      <Task>
        <TaskID>3</TaskID>
        <TaskUniqueID>3</TaskUniqueID>
        <Name>Detalle</Name>
        <Type>Task Dependent</Type>
        <Start>2026-01-06 00:00</Start>
        <Finish>2026-01-07 23:59</Finish>
        <ParentTaskID>1</ParentTaskID>
      </Task>
    </Tasks>
    <Relationships>
      <Relationship>
        <RelationshipID>1</RelationshipID>
        <RelationshipType>FinishToStart</RelationshipType>
        <PredecessorTaskID>2</PredecessorTaskID>
        <SuccessorTaskID>3</SuccessorTaskID>
        <LagDurationInteger>0</LagDurationInteger>
      </Relationship>
    </Relationships>
  </Project>
</PMML>"#;
        let y = desde_pmxml(xml).unwrap();
        assert!(y.contains("tareas:"));
        assert!(y.contains("<Diseño>"));
        assert!(y.contains("codigo: \"1\""));
        assert!(y.contains("codigo: \"1.1\""));
        assert!(y.contains("codigo: \"1.2\""));
        assert!(y.contains("avance: \"100%\""));
        assert!(y.contains("predecesoras: \"2\""));
        assert!(y.contains("subtareas:"));
    }

    #[test]
    fn xer_bloques_basico() {
        let xer = r#"EREXP  V95.4.0    1 123
%T	PROJECT
%F
PROJECT_ID	PROJECT_UNIQUE_ID	SHORT_NAME	CREATED_DATE
1	1	Mi Proyecto	2026-01-05 00:00:00
%T	TASK
%F
TASK_ID	PROJECT_ID	WBS_ID	NAME	OUTLVL	MILESTONE	STATUS_CODE	START_DATE	FINISH_DATE
1	1	1	Diseño	1	0	TK_NotStart	2026-01-05 00:00:00	2026-01-12 23:59:59
2	1	1	Boceto	2	0	TK_Complete	2026-01-05 00:00:00	2026-01-05 23:59:59
3	1	1	Detalle	2	0	TK_NotStart	2026-01-06 00:00:00	2026-01-07 23:59:59
%T	TASKPRED
%F
PRED_ID	TASK_ID	PRED_TASK_ID	PROJECT_ID	PRED_TYPE	PRED_LAG
1	3	2	1	PR_FS	0
%F
"#;
        let y = desde_xer(xer).unwrap();
        assert!(y.starts_with("# importado de XER"));
        assert!(y.contains("codigo: \"1\""));
        assert!(y.contains("codigo: \"1.1\""));
        assert!(y.contains("codigo: \"1.2\""));
        assert!(y.contains("avance: \"100%\""));
        assert!(y.contains("predecesoras: \"2\""));
        assert!(y.contains("subtareas:"));
    }

    // Ida y vuelta con la exportación Excel real: genera un .xlsx con
    // `a_excel`, lo relee con calamine y verifica hojas + encabezados.
    #[test]
    fn releer_excel_generado() {
        use crate::exportar::proyecto;
        use crate::modelo::OpcionesCpm;
        use crate::preparar::preparar_proyecto;

        let yaml = r#"
tareas:
  - codigo: "1"
    nombre: Proyecto
    subtareas:
      - codigo: "1.1"
        nombre: Diseño
        inicio: "2026-01-05"
        duracion: 3
        avance: "100%"
"#;
        let filas = preparar_proyecto(yaml, &OpcionesCpm { cpm: true, inicio_proyecto: None, termino_proyecto: None }).unwrap();
        let bytes = crate::excel::a_excel(&proyecto("mi proyecto", filas)).unwrap();

        let ruta = std::env::temp_dir().join(format!(
            "reintenta-excel-{}-{}.xlsx",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()
        ));
        std::fs::write(&ruta, &bytes).unwrap();

        let info = excel_info(ruta.to_str().unwrap()).unwrap();
        assert!(info.hojas.iter().any(|h| h == "Tareas"), "hojas: {:?}", info.hojas);

        let matriz = leer_excel_celdas(ruta.to_str().unwrap(), "Tareas", None).unwrap();
        assert!(matriz.len() >= 2, "matriz: {}", matriz.len());
        let todos: Vec<String> = matriz.iter().flatten().filter_map(|c| c.as_ref()).map(|c| c.texto.clone().unwrap_or_default()).collect();
        assert!(todos.iter().any(|t| t == "Código"), "sin encabezado Código: {:?}", &todos[..todos.len().min(20)]);
        assert!(todos.iter().any(|t| t == "Diseño"), "sin la tarea Diseño");

        let _ = std::fs::remove_file(&ruta);
    }

    // Ida y vuelta con nuestros propios serializadores PMXML y XER: el XML
    // que exportamos debe reimportarse conservando códigos y predecesoras.
    #[test]
    fn reimportar_propio_pmxml_y_xer() {
        use crate::exportar::{a_pmxml, a_xer, proyecto};
        use crate::modelo::OpcionesCpm;
        use crate::preparar::preparar_proyecto;

        let yaml = r#"
tareas:
  - codigo: "1"
    nombre: Proyecto
    inicio: "2026-01-05"
    subtareas:
      - codigo: "1.1"
        nombre: Diseño
        inicio: "2026-01-05"
        duracion: 3
        avance: "100%"
        subtareas:
          - codigo: "1.1.1"
            nombre: Boceto
            inicio: "2026-01-05"
            duracion: 1
          - codigo: "1.1.2"
            nombre: Detalle
            inicio: "2026-01-06"
            duracion: 2
            predecesoras: "1.1.1"
"#;
        let filas = preparar_proyecto(yaml, &OpcionesCpm { cpm: true, inicio_proyecto: None, termino_proyecto: None }).unwrap();
        let p = proyecto("proyecto", filas);

        let y1 = desde_pmxml(&a_pmxml(&p)).unwrap();
        assert!(y1.contains("codigo: \"1\""));
        assert!(y1.contains("codigo: \"1.1.2\""));
        assert!(y1.contains("nombre: \"Detalle\""));
        assert!(y1.contains("predecesoras: \"3\""));
        assert!(y1.contains("avance: \"100%\""));

        let y2 = desde_xer(&a_xer(&p)).unwrap();
        assert!(y2.contains("codigo: \"1.1\""), "XER: {}", &y2[..y2.len().min(300)]);
        assert!(y2.contains("predecesoras: \"3\""));
        assert!(y2.contains("avance: \"100%\""));
    }

    // Bench orientativo a ~3000 tareas: correr con
    //   cargo test --release -p dominio bench_3000 -- --ignored --nocapture
    #[test]
    #[ignore]
    fn bench_3000() {
        use std::time::Instant;
        use crate::exportar::{a_pmxml, a_xer, proyecto};
        use crate::modelo::OpcionesCpm;
        use crate::preparar::preparar_proyecto;

        let mut yaml = String::from("tareas:\n");
        let mut total = 0;
        for g in 1..=60 {
            yaml.push_str(&format!("  - codigo: \"{g}\"\n    nombre: Grupo {g}\n    subtareas:\n"));
            for t in 1..=50 {
                total += 1;
                let av = if t % 4 == 0 { "100%" } else { "0%" };
                yaml.push_str(&format!(
                    "      - codigo: \"{g}.{t}\"\n        nombre: Tarea {g}.{t}\n        inicio: \"2026-01-05\"\n        duracion: 3\n        avance: \"{av}\"\n"
                ));
            }
            total += 1;
        }
        println!("tareas generadas: {total} (bytes YAML: {})", yaml.len());

        let t0 = Instant::now();
        let filas = preparar_proyecto(&yaml, &OpcionesCpm { cpm: true, inicio_proyecto: None, termino_proyecto: None }).unwrap();
        let t1 = Instant::now();
        println!("preparar_proyecto (parse+árbol+CPM): {:?}  filas={}", t1 - t0, filas.len());

        let p = proyecto("bench", filas);
        let t2 = Instant::now();
        let pmx = a_pmxml(&p);
        let t3 = Instant::now();
        println!("a_pmxml: {:?} ({} bytes)", t3 - t2, pmx.len());

        let t4 = Instant::now();
        let xer = a_xer(&p);
        let t5 = Instant::now();
        println!("a_xer: {:?} ({} bytes)", t5 - t4, xer.len());

        let t6 = Instant::now();
        let xl = crate::excel::a_excel(&p).unwrap();
        let t7 = Instant::now();
        println!("a_excel: {:?} ({} bytes)", t7 - t6, xl.len());
    }
}