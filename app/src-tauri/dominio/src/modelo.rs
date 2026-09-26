use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct ItemCrudo {
    pub codigo: String,
    pub id: String,
    pub padre: Option<String>,
    pub map: serde_yaml::Mapping,
}

#[derive(Clone, Debug)]
pub struct Indice {
    pub mapa: HashMap<String, ItemCrudo>,
    pub hijos_de: HashMap<String, Vec<String>>,
    pub raices: Vec<String>,
}

pub fn es_vacio(v: &serde_yaml::Value) -> bool {
    use serde_yaml::Value;
    match v {
        Value::Null => true,
        Value::String(s) if s.trim().is_empty() => true,
        _ => false,
    }
}

pub fn a_numero(v: &serde_yaml::Value) -> Option<f64> {
    use serde_yaml::Value;
    if es_vacio(v) {
        return None;
    }
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => {
            let s = s.trim();
            s.parse::<f64>().ok()
        }
        _ => None,
    }
}

// Número o fórmula aritmética (p. ej. "3*40"): primero intenta el número
// plano y, si el valor es un texto no numérico, lo evalúa como expresión
// (`cantidad` y `rendimiento` de los `recursos` del APU admiten fórmulas).
pub fn a_numero_formula(v: &serde_yaml::Value) -> Option<f64> {
    if let Some(n) = a_numero(v) {
        return Some(n);
    }
    match v {
        serde_yaml::Value::String(s) => crate::expr::evaluar(s).ok(),
        _ => None,
    }
}

pub fn campo<'a>(map: &'a serde_yaml::Mapping, clave: &str) -> Option<&'a serde_yaml::Value> {
    map.get(&serde_yaml::Value::String(clave.to_string()))
}

#[derive(Clone, Debug, PartialEq)]
pub enum TipoDep {
    Fs,
    Ss,
    Ff,
    Sf,
}

impl TipoDep {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.to_lowercase().as_str() {
            "fs" => Ok(TipoDep::Fs),
            "ss" => Ok(TipoDep::Ss),
            "ff" => Ok(TipoDep::Ff),
            "sf" => Ok(TipoDep::Sf),
            _ => Err(format!("tipo de dependencia inválido: '{s}'")),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            TipoDep::Fs => "fs",
            TipoDep::Ss => "ss",
            TipoDep::Ff => "ff",
            TipoDep::Sf => "sf",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Dep {
    pub pred: String,
    pub tipo: TipoDep,
    pub lag: i64,
}

#[derive(Clone, Debug)]
pub struct HojaCpm {
    pub codigo: String,
    pub dur: i64,
    pub es_ancla: Option<i64>,
    pub ef_ancla: Option<i64>,
    pub predecesoras: Vec<Dep>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DepJson {
    pub pred: String,
    pub tipo: String,
    pub lag: i64,
}

#[derive(Clone, Debug)]
pub struct ResCpm {
    pub es: i64,
    pub ef: i64,
    pub ls: i64,
    pub lf: i64,
    pub holgura: i64,
    pub critico: bool,
}

#[derive(Clone, Debug)]
pub struct Resuelto {
    pub inicio_dias: i64,
    pub termino_dias: i64,
    pub duracion: i64,
    pub avance: f64,
    pub cantidad: Option<f64>,
    pub unidad: Option<String>,
    pub costo_unitario: Option<f64>,
    pub costo: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fila {
    pub codigo: String,
    pub id: String,
    pub nombre: String,
    pub nivel: i32,
    pub es_grupo: bool,
    pub hito: bool,
    pub inicio_dias: i64,
    pub termino_dias: i64,
    pub duracion: i64,
    pub avance: f64,
    pub padre: Option<String>,
    pub predecesoras: Vec<DepJson>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub critico: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holgura: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cantidad: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unidad: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub costo_unitario: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub costo: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avance_serie: Option<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formato_barra: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub negrita: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub italica: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_texto: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vinculo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ocultar_subtareas: Option<bool>,
}

pub fn interpretar_predecesoras(valor: &serde_yaml::Value) -> Vec<Dep> {
    use serde_yaml::Value;
    if es_vacio(valor) {
        return Vec::new();
    }

    let norm = |dep: &Value| -> Result<Dep, String> {
        match dep {
            Value::Mapping(m) => {
                let codigo = match campo(m, "codigo") {
                    Some(Value::String(s)) => s.clone(),
                    _ => return Err("predecesoras: falta 'codigo'".to_string()),
                };
                let tipo = match campo(m, "tipo") {
                    Some(Value::String(s)) => TipoDep::parse(s)?,
                    _ => TipoDep::Fs,
                };
                let lag = campo(m, "lag")
                    .and_then(|v| a_numero(v))
                    .unwrap_or(0.0) as i64;
                Ok(Dep { pred: codigo, tipo, lag })
            }
            Value::String(s) => {
                let partes: Vec<&str> = s.trim().split(':').collect();
                let codigo = partes[0];
                let tipo = if partes.len() >= 2 && !partes[1].is_empty() {
                    TipoDep::parse(partes[1])?
                } else {
                    TipoDep::Fs
                };
                let lag = if partes.len() >= 3 && !partes[2].is_empty() {
                    partes[2].parse::<i64>().unwrap_or(0)
                } else {
                    0
                };
                Ok(Dep { pred: codigo.to_string(), tipo, lag })
            }
            _ => Err(format!("predecesoras: valor no reconocido: {dep:?}")),
        }
    };

    match valor {
        Value::Sequence(seq) => seq.iter().filter_map(|v| norm(v).ok()).collect(),
        Value::String(s) => {
            if s.trim().is_empty() {
                Vec::new()
            } else {
                s.split(';').filter_map(|s| {
                    let v = Value::String(s.trim().to_string());
                    norm(&v).ok()
                }).collect()
            }
        }
        _ => Vec::new(),
    }
}

// Mapa de resolución codigo→id (y id→id) para normalizar las referencias de
// `predecesoras`: un token puede apuntar al código o al id de la tarea, y
// aquí se lleva al id efectivo de la fila.
pub fn referencias_de(items: &[ItemCrudo]) -> HashMap<String, String> {
    let mut refs: HashMap<String, String> = HashMap::new();
    for it in items {
        refs.insert(it.codigo.clone(), it.id.clone());
        refs.insert(it.id.clone(), it.id.clone());
    }
    refs
}

pub fn resolver_deps(mut deps: Vec<Dep>, referencias: &HashMap<String, String>) -> Vec<Dep> {
    for d in &mut deps {
        if let Some(id) = referencias.get(&d.pred) {
            d.pred = id.clone();
        }
    }
    deps
}

pub fn interpretar_avance(valor: &serde_yaml::Value) -> f64 {
    interpretar_avance_completo(valor).0
}

// Como `interpretar_avance`, pero además devuelve la serie de incrementos
// cuando el avance vino como lista o texto ";": `(avance, Some(serie))`;
// un avance simple da `(avance, None)`. Es lo que necesita la inyección
// a Typst para replicar `interpretar-avance` de datos.typ.
pub fn interpretar_avance_completo(valor: &serde_yaml::Value) -> (f64, Option<Vec<f64>>) {
    use serde_yaml::Value;
    let a_avance = |v: &Value| -> f64 {
        if es_vacio(v) { return 0.0; }
        let mut es_pct = false;
        let num_str = match v {
            Value::Number(n) => return n.as_f64().unwrap_or(0.0),
            Value::String(s) => {
                let mut s = s.trim().to_string();
                if s.ends_with('%') {
                    es_pct = true;
                    s = s[..s.len()-1].trim().to_string();
                }
                s
            }
            _ => return 0.0,
        };
        let valor = num_str.parse::<f64>().unwrap_or(0.0);
        if es_pct { valor / 100.0 } else if valor > 1.0 { valor / 100.0 } else { valor }
    };

    let serie: Vec<f64> = match valor {
        Value::Sequence(arr) => arr.iter().map(|x| a_avance(x)).collect(),
        Value::String(s) if s.contains(';') => s.split(';').map(|x| {
            let v = Value::String(x.trim().to_string());
            a_avance(&v)
        }).collect(),
        _ => Vec::new(),
    };

    if serie.is_empty() {
        (a_avance(valor), None)
    } else {
        (serie.iter().copied().sum::<f64>().min(1.0), Some(serie))
    }
}

pub fn aplanar(lista: &serde_yaml::Value, padre_contexto: Option<String>, raiz: bool, out: &mut Vec<ItemCrudo>) {
    use serde_yaml::Value;
    let Value::Sequence(seq) = lista else { return };
    for t in seq {
        if !t.is_mapping() { continue }
        let Some(m) = t.as_mapping() else { continue };
        let codigo = match campo(m, "codigo") {
            Some(Value::String(s)) => s.clone(),
            // El proyecto (primera tarea de la raíz) no lleva número WBS: puede
            // no traer 'codigo'. Un valor no textual sí sigue siendo inválido.
            Some(Value::Number(_)) => continue,
            _ => String::new(),
        };
        let id = match campo(m, "id") {
            Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
            _ => codigo.clone(),
        };
        let padre = if raiz {
            match campo(m, "padre") {
                Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
                _ => None,
            }
        } else {
            padre_contexto.clone()
        };
        let subtareas = campo(m, "subtareas").cloned().unwrap_or(Value::Null);
        out.push(ItemCrudo { codigo: codigo.clone(), id, padre, map: m.clone() });
        aplanar(&subtareas, Some(codigo), false, out);
    }
}

pub fn construir_indice(items: &[ItemCrudo]) -> Indice {
    let mut mapa = HashMap::new();
    let mut hijos_de: HashMap<String, Vec<String>> = HashMap::new();
    let mut raices = Vec::new();

    for it in items {
        mapa.insert(it.codigo.clone(), it.clone());
    }

    for it in items {
        if let Some(padre) = &it.padre {
            if mapa.contains_key(padre) {
                hijos_de.entry(padre.clone()).or_default().push(it.codigo.clone());
            } else {
                raices.push(it.codigo.clone());
            }
        } else {
            raices.push(it.codigo.clone());
        }
    }

    Indice { mapa, hijos_de, raices }
}

pub struct OpcionesCpm {
    pub cpm: bool,
    pub inicio_proyecto: Option<String>,
    pub termino_proyecto: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preparar::preparar_proyecto;

    // El proyecto (primera tarea de la raíz) no lleva número WBS: puede no
    // tener 'codigo'. Sus subtareas son el primer nivel ("1", "2"…).
    #[test]
    fn aplanar_acepta_proyecto_sin_codigo() {
        let yaml = r#"tareas:
  - nombre: Proyecto completo
    subtareas:
      - codigo: "1"
        nombre: Fase A
        inicio: 2026-01-05
        duracion: 10
      - codigo: "2"
        nombre: Fase B
        subtareas:
          - codigo: "2.1"
            nombre: B1
            inicio: 2026-01-20
            duracion: 5
"#;
        let valor: serde_yaml::Value = serde_yaml::from_str(yaml).unwrap();
        let mut crudos: Vec<ItemCrudo> = Vec::new();
        aplanar(&valor["tareas"], None, true, &mut crudos);
        let codigos: Vec<&str> = crudos.iter().map(|c| c.codigo.as_str()).collect();
        assert_eq!(codigos, ["", "1", "2", "2.1"]);

        let filas =
            preparar_proyecto(yaml, &OpcionesCpm { cpm: false, inicio_proyecto: None, termino_proyecto: None })
                .unwrap();
        let presentes: Vec<&str> = filas.iter().map(|f| f.codigo.as_str()).collect();
        assert_eq!(presentes, ["", "1", "2", "2.1"]);
        assert!(filas[0].es_grupo);
    }
}
