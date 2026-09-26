// apu.rs — Análisis de precios unitarios (APU) desde la descomposición
// `recursos` de una actividad. Cada recurso aporta la cuota
// `cantidad x precio / rendimiento` (rendimiento 1 cuando no se declara) y el
// precio unitario de la actividad es la suma de cuotas. Si la actividad
// declara `costo-unitario` explícito, ese manda (ver preparar::resolver_hoja).
//
// Catálogo: la raíz del documento puede declarar `recursos:` (dict
// llave -> {tipo, nombre, medida, precio}); cuando la entrada de una tarea no
// trae `precio` inline, se resuelve del catálogo por la llave (o el nombre),
// así un cambio de precio en el catálogo se propaga a todas las actividades
// que lo usan. El precio inline de la tarea tiene prioridad (compatibilidad).

use serde::Serialize;

use crate::modelo::{aplanar, campo, construir_indice, es_vacio, a_numero_formula, ItemCrudo};

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

// Catálogo `recursos:` de la raíz del documento (None si no existe o no es un
// dict de dicts). Se lee una sola vez y se comparte entre actividades.
pub fn catalogo_de(raiz: &serde_yaml::Value) -> Option<serde_yaml::Mapping> {
    use serde_yaml::Value;
    let m = raiz.as_mapping()?;
    let v = m.get(&Value::String("recursos".to_string()))?;
    let catalogo = v.as_mapping()?;
    let mut salida = serde_yaml::Mapping::new();
    for (k, val) in catalogo {
        let llave = k.as_str()?.to_string();
        salida.insert(Value::String(llave), val.clone());
    }
    Some(salida)
}

// Acepta una lista de mapas o un diccionario clave -> mapa (o valor númerico).
pub fn analizar_recursos(valor: &serde_yaml::Value) -> Vec<RecursoApu> {
    analizar_recursos_con(valor, None)
}

pub fn analizar_recursos_con(
    valor: &serde_yaml::Value,
    catalogo: Option<&serde_yaml::Mapping>,
) -> Vec<RecursoApu> {
    use serde_yaml::Value;
    let extraer = |m: &serde_yaml::Mapping, clave: &str| -> Option<f64> {
        a_numero_formula(campo(m, clave).unwrap_or(&Value::Null))
    };
    let cuota_de = |cantidad: f64, precio: f64, rendimiento: f64| -> f64 {
        let rend = if rendimiento > 0.0 { rendimiento } else { 1.0 };
        cantidad * precio / rend
    };
    // Precio: inline primero; si no, del catálogo por llave/nombre.
    let precio_de = |nombre: &str, m: &serde_yaml::Mapping| -> Option<f64> {
        extraer(m, "precio").or_else(|| {
            catalogo?.get(&Value::String(nombre.to_string()))?.as_mapping()
                .and_then(|cm| extraer(cm, "precio"))
        })
    };
    let texto_de = |m: &serde_yaml::Mapping, clave: &str| -> Option<String> {
        match campo(m, clave) {
            Some(Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
            _ => None,
        }
    };
    // Rellena nombre/medida/tipo con los del catálogo cuando la entrada no los trae.
    let completar = |nombre: &str, m: &serde_yaml::Mapping| -> (Option<String>, Option<String>, Option<String>) {
        let catalogo_m = catalogo
            .and_then(|c| c.get(&Value::String(nombre.to_string())))
            .and_then(|v| v.as_mapping());
        let c = |clave: &str| -> Option<String> {
            texto_de(m, clave).or_else(|| catalogo_m.and_then(|cm| texto_de(cm, clave)))
        };
        (c("tipo"), c("nombre"), c("medida"))
    };
    let to_recurso = |nombre: &str, m: &serde_yaml::Mapping| -> Option<RecursoApu> {
        let cantidad = extraer(m, "cantidad")?;
        let precio = precio_de(nombre, m)?;
        let rendimiento = extraer(m, "rendimiento").unwrap_or(1.0);
        let (tipo, nombre_completo, medida) = completar(nombre, m);
        Some(RecursoApu {
            tipo,
            nombre: nombre_completo.unwrap_or_else(|| nombre.to_string()),
            medida,
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
// de datos.typ (Typst), catálogo opcional.
pub fn precio_unitario(valor: &serde_yaml::Value) -> Option<f64> {
    precio_unitario_con(valor, None)
}

pub fn precio_unitario_con(
    valor: &serde_yaml::Value,
    catalogo: Option<&serde_yaml::Mapping>,
) -> Option<f64> {
    let recursos = analizar_recursos_con(valor, catalogo);
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
    let catalogo = catalogo_de(&raiz);
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
    let recursos = analizar_recursos_con(recursos_val, catalogo.as_ref());
    if recursos.is_empty() {
        return None;
    }
    let costo_unitario = recursos.iter().map(|r| r.cuota).sum::<f64>();
    let cantidad = a_numero_formula(campo(&item.map, "cantidad").unwrap_or(&serde_yaml::Value::Null));
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
    fn analizar_con_formulas() {
        let yaml = r#"
tareas:
  - codigo: "9"
    nombre: Partida fórmula
    subtareas:
      - codigo: "9.1"
        nombre: Enfierradura
        inicio: 2026-03-02
        duracion: 10
        unidad: m3
        cantidad: "3*40"
        recursos:
          - tipo: mano-obra
            nombre: Armador
            cantidad: "0.05*2"
            rendimiento: "6/3"
            precio: 45000
          - tipo: material
            nombre: Fierro
            cantidad: 95
            rendimiento: 1
            precio: 1350
"#;
        let a = analizar(yaml, "9.1").expect("9.1");
        // cantidad 3*40 = 120
        assert_eq!(a.cantidad, Some(120.0));
        // cuota Armador = 0.05*2=0.1 * 45000 / (6/3=2) = 2250
        assert!((a.recursos[0].cuota - 2250.0).abs() < 1e-9, "cuota armador = {}", a.recursos[0].cuota);
        // cuota Fierro = 95*1350/1
        assert!((a.recursos[1].cuota - 128250.0).abs() < 1e-9);
        // costo_unitario = 2250 + 128250
        assert!((a.costo_unitario - 130500.0).abs() < 1e-9, "cu = {}", a.costo_unitario);
        // costo = 120 * 130500
        assert_eq!(a.costo, Some(15_660_000.0));
    }

    #[test]
    fn sin_recursos_da_none() {
        assert_eq!(precio_unitario(&serde_yaml::Value::Null), None);
        let raiz: serde_yaml::Value = serde_yaml::from_str(YAML).unwrap();
        let tareas = raiz["tareas"].as_sequence().unwrap();
        assert_eq!(precio_unitario(&tareas[0]["subtareas"][2]["recursos"]), None);
    }

    #[test]
    fn catalogo_resuelve_precio_por_llave() {
        // El diccionario de la tarea NO trae `precio`; sale del catálogo
        // raíz `recursos:` por la llave. Cambiar el precio del catálogo
        // cambia el PU (propagación).
        let yaml = r#"
recursos:
  armador:
    tipo: mano-obra
    nombre: Armador jornal
    medida: jor
    precio: 48000
  fierro:
    tipo: material
    nombre: Fierro recocido
    medida: kg
    precio: 1500
tareas:
  - codigo: "1"
    nombre: Partida
    subtareas:
      - codigo: "1.1"
        nombre: Enfierradura
        cantidad: "3*40"
        recursos:
          armador:
            cantidad: "0.05*2"
            rendimiento: 2
          fierro:
            cantidad: 95
"#;
        let a = analizar(yaml, "1.1").expect("1.1");
        // armador: 0.1*48000/2 = 2400 ; fierro: 95*1500/1 = 142500
        assert!((a.costo_unitario - 144900.0).abs() < 1e-9, "cu = {}", a.costo_unitario);
        assert_eq!(a.costo, Some(120.0 * 144900.0));
        // nombre/medida se completan desde el catálogo
        assert_eq!(a.recursos[0].nombre, "Armador jornal");
        assert_eq!(a.recursos[0].medida.as_deref(), Some("jor"));
        assert_eq!(a.recursos[1].nombre, "Fierro recocido");

        // Precio inline de la tarea manda sobre el catálogo.
        let yaml_inline = yaml.replace("          fierro:\n            cantidad: 95\n", "          fierro:\n            cantidad: 95\n            precio: 2000\n");
        let b = analizar(&yaml_inline, "1.1").expect("1.1");
        // fierro: 95*2000 = 190000
        assert!((b.costo_unitario - 192400.0).abs() < 1e-9, "cu = {}", b.costo_unitario);

        // Sin catálogo (todo sin precio inline): el APU no resuelve.
        let yaml_sin_catalogo = yaml.replace(
            "recursos:\n  armador:\n    tipo: mano-obra\n    nombre: Armador jornal\n    medida: jor\n    precio: 48000\n  fierro:\n    tipo: material\n    nombre: Fierro recocido\n    medida: kg\n    precio: 1500\n",
            "",
        );
        assert!(analizar(&yaml_sin_catalogo, "1.1").is_none());
    }

    #[test]
    fn catalogo_en_precio_unitario_de_preparar() {
        // El `costo-unitario` implícito (desde `recursos` sin precio inline)
        // se resuelve del catálogo en la resolución de filas.
        let yaml = r#"
recursos:
  cuadrilla:
    tipo: mano-obra
    nombre: Cuadrilla A
    precio: 9900
tareas:
  - codigo: "1"
    nombre: Partida
    subtareas:
      - codigo: "1.1"
        nombre: Excavación
        inicio: 2026-03-20
        duracion: 1
        cantidad: 2
        recursos:
          cuadrilla:
            cantidad: 1
"#;
        let filas = crate::preparar::preparar_proyecto(yaml, &crate::modelo::OpcionesCpm {
            cpm: false,
            inicio_proyecto: None,
            termino_proyecto: None,
        }).expect("filas");
        let hoja = filas.iter().find(|f| f.codigo == "1.1").expect("1.1");
        assert!((hoja.costo_unitario.unwrap() - 9900.0).abs() < 1e-9, "cu = {:?}", hoja.costo_unitario);
        assert_eq!(hoja.costo, Some(2.0 * 9900.0));
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