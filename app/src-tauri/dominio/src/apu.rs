// apu.rs — Análisis de precios unitarios (APU) desde la descomposición
// `recursos` de una actividad. Cada recurso aporta la cuota
// `cantidad x precio / rendimiento` (rendimiento 1 cuando no se declara) y el
// precio unitario de la actividad es la suma de cuotas. Si la actividad
// declara `costo-unitario` explícito, ese manda (ver preparar::resolver_hoja).

use serde::Serialize;

use crate::modelo::{aplanar, campo, construir_indice, es_vacio, a_numero, ItemCrudo};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecursoApu {
    pub tipo: Option<String>,
    pub nombre: String,
    pub medida: Option<String>,
    pub cantidad: f64,
    pub precio: f64,
    pub rendimiento: f64,
    pub cuota: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApuAnalisis {
    pub codigo: String,
    pub nombre: String,
    pub unidad: Option<String>,
    pub cantidad: Option<f64>,
    pub costo_unitario: f64,
    pub costo: Option<f64>,
    pub recursos: Vec<RecursoApu>,
}

// Acepta una lista de mapas o un diccionario clave -> mapa (o valor númerico).
pub fn analizar_recursos(valor: &serde_yaml::Value) -> Vec<RecursoApu> {
    use serde_yaml::Value;
    let extraer = |m: &serde_yaml::Mapping, clave: &str| -> Option<f64> {
        a_numero(campo(m, clave).unwrap_or(&Value::Null))
    };
    let cuota_de = |cantidad: f64, precio: f64, rendimiento: f64| -> f64 {
        let rend = if rendimiento > 0.0 { rendimiento } else { 1.0 };
        cantidad * precio / rend
    };
    let to_recurso = |nombre: &str, m: &serde_yaml::Mapping| -> Option<RecursoApu> {
        let cantidad = extraer(m, "cantidad")?;
        let precio = extraer(m, "precio")?;
        let rendimiento = extraer(m, "rendimiento").unwrap_or(1.0);
        Some(RecursoApu {
            tipo: match campo(m, "tipo") {
                Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
                _ => None,
            },
            nombre: nombre.to_string(),
            medida: match campo(m, "medida") {
                Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
                _ => None,
            },
            cantidad,
            precio,
            rendimiento: if rendimiento > 0.0 { rendimiento } else { 1.0 },
            cuota: cuota_de(cantidad, precio, rendimiento),
        })
    };

    match valor {
        Value::Sequence(seq) => seq
            .iter()
            .filter_map(|v| {
                let m = v.as_mapping()?;
                let nombre = match campo(m, "nombre") {
                    Some(Value::String(s)) => s.clone(),
                    _ => "recurso".to_string(),
                };
                to_recurso(&nombre, m)
            })
            .collect(),
        Value::Mapping(m) => m
            .iter()
            .filter_map(|(k, v)| {
                let nombre = k.as_str()?.to_string();
                let inner = v.as_mapping()?;
                to_recurso(&nombre, inner)
            })
            .collect(),
        _ => Vec::new(),
    }
}

// Precio unitario de una actividad desde sus `recursos` (None si no hay
// recursos válidos). Es el mismo cálculo que `precio-unitario-de-recursos`
// de datos.typ (Typst).
pub fn precio_unitario(valor: &serde_yaml::Value) -> Option<f64> {
    let recursos = analizar_recursos(valor);
    if recursos.is_empty() {
        None
    } else {
        Some(recursos.iter().map(|r| r.cuota).sum())
    }
}

// Análisis completo de una actividad `codigo` (debe ser hoja y tener
// `recursos`): devuelve la tabla de recursos con cuotas y el precio unitario
// resultante. None si la tarea no existe, es un grupo o no declara recursos.
pub fn analizar(texto: &str, codigo: &str) -> Option<ApuAnalisis> {
    let raiz: serde_yaml::Value = serde_yaml::from_str(texto).ok()?;
    let lista = match &raiz {
        serde_yaml::Value::Sequence(_) => &raiz,
        serde_yaml::Value::Mapping(m) => m.get(&serde_yaml::Value::String("tareas".to_string()))?,
        _ => return None,
    };
    let mut plano: Vec<ItemCrudo> = Vec::new();
    aplanar(lista, None, true, &mut plano);
    let indice = construir_indice(&plano);
    let item: &ItemCrudo = indice.mapa.get(codigo)?;
    if indice.hijos_de.contains_key(codigo) {
        return None; // grupos: no APU propio
    }
    let recursos_val = campo(&item.map, "recursos")?;
    let recursos = analizar_recursos(recursos_val);
    if recursos.is_empty() {
        return None;
    }
    let costo_unitario = recursos.iter().map(|r| r.cuota).sum::<f64>();
    let cantidad = a_numero(campo(&item.map, "cantidad").unwrap_or(&serde_yaml::Value::Null));
    let costo = cantidad.map(|c| c * costo_unitario);
    let nombre = match campo(&item.map, "nombre") {
        Some(serde_yaml::Value::String(s)) => s.clone(),
        _ => codigo.to_string(),
    };
    Some(ApuAnalisis {
        codigo: codigo.to_string(),
        nombre,
        unidad: match campo(&item.map, "unidad") {
            Some(serde_yaml::Value::String(s)) if !es_vacio(&serde_yaml::Value::String(s.clone())) => Some(s.clone()),
            _ => None,
        },
        cantidad,
        costo_unitario,
        costo,
        recursos,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const YAML: &str = r#"
tareas:
  - codigo: "1"
    nombre: Partida
    subtareas:
      - codigo: "1.1"
        nombre: Excavación
        inicio: 2026-03-02
        duracion: 10
        unidad: m3
        cantidad: 120
        recursos:
          - tipo: mano-obra
            nombre: Excavador
            cantidad: 0.1
            rendimiento: 1
            precio: 45000
          - tipo: material
            nombre: Huincha
            cantidad: 0.2
            precio: 1500
          - tipo: equipo
            nombre: Retroexcavadora
            cantidad: 0.05
            precio: 48000
      - codigo: "1.2"
        nombre: Retiro
        inicio: 2026-03-16
        duracion: 5
        unidad: m3
        cantidad: 95
        recursos:
          "Ayudante (jornada)":
            cantidad: 0.25
            rendimiento: 2
            precio: 32000
      - codigo: "1.3"
        nombre: Sin recursos
        inicio: 2026-03-20
        duracion: 1
"#;

    #[test]
    fn precio_unitario_lista() {
        let raiz: serde_yaml::Value = serde_yaml::from_str(YAML).unwrap();
        let tareas = raiz["tareas"].as_sequence().unwrap();
        let item_11 = &tareas[0]["subtareas"][0];
        let pu = precio_unitario(&item_11["recursos"]).unwrap();
        // 0.1*45000/1 + 0.2*1500/1 + 0.05*48000/1
        assert!((pu - 7200.0).abs() < 1e-9, "pu = {pu}");
    }

    #[test]
    fn precio_unitario_diccionario_con_rendimiento() {
        let raiz: serde_yaml::Value = serde_yaml::from_str(YAML).unwrap();
        let tareas = raiz["tareas"].as_sequence().unwrap();
        let item_12 = &tareas[0]["subtareas"][1];
        let pu = precio_unitario(&item_12["recursos"]).unwrap();
        // 0.25*32000/2 = 4000
        assert!((pu - 4000.0).abs() < 1e-9, "pu = {pu}");
    }

    #[test]
    fn sin_recursos_da_none() {
        assert_eq!(precio_unitario(&serde_yaml::Value::Null), None);
        let raiz: serde_yaml::Value = serde_yaml::from_str(YAML).unwrap();
        let tareas = raiz["tareas"].as_sequence().unwrap();
        assert_eq!(precio_unitario(&tareas[0]["subtareas"][2]["recursos"]), None);
    }

    #[test]
    fn analizar_encontrar_por_codigo() {
        let a = analizar(YAML, "1.1").expect("1.1");
        assert_eq!(a.nombre, "Excavación");
        assert_eq!(a.unidad.as_deref(), Some("m3"));
        assert_eq!(a.cantidad, Some(120.0));
        assert!((a.costo_unitario - 7200.0).abs() < 1e-9);
        assert_eq!(a.costo, Some(864000.0));
        assert_eq!(a.recursos.len(), 3);

        let b = analizar(YAML, "1.2").expect("1.2");
        assert!((b.costo_unitario - 4000.0).abs() < 1e-9);
        assert_eq!(b.recursos[0].nombre, "Ayudante (jornada)");

        assert!(analizar(YAML, "1").is_none(), "grupo sin APU");
        assert!(analizar(YAML, "1.3").is_none(), "sin recursos");
        assert!(analizar(YAML, "nope").is_none(), "no existe");
    }
}