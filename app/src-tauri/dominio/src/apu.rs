// apu.rs — Análisis de precios unitarios (APU) desde la descomposición
// `recursos` de una actividad. Cada recurso aporta la cuota
// `cantidad x precio x (1 + desperdicio) / rendimiento` (rendimiento 1 y
// desperdicio 0 cuando no se declaran) y el precio unitario de la actividad
// es la suma de cuotas. Si la actividad declara `costo-unitario` explícito,
// ese manda (ver preparar::resolver_hoja).
//
// Catálogo: la raíz del documento puede declarar `recursos:` (dict
// llave -> {tipo, nombre, medida, precio} o llave -> {recursos: [...]}).
// Cuando la entrada de una tarea no trae `precio` inline, se resuelve del
// catálogo por la llave (o el nombre), así un cambio de precio en el
// catálogo se propaga a todas las actividades que lo usan. El precio inline
// de la tarea tiene prioridad (compatibilidad).
//
// Actividades Auxiliares (APU compuesto): una entrada del catálogo sin
// `precio` pero con `recursos` es una Actividad Auxiliar — su costo unitario
// se resuelve recursivamente (a N niveles) sumando las cuotas de sus propios
// componentes, que a su vez pueden citar otras Actividades Auxiliares del
// catálogo. Una tarea del Gantt puede vincularse directamente a una de estas
// Partidas reutilizables con `apu: <llave>` en vez de declarar su propia
// lista de `recursos` (ver preparar::resolver_hoja).
//
// Prevención de ciclos: la resolución recursiva lleva la pila de llaves de
// catálogo en curso; si una Actividad Auxiliar termina citándose a sí misma
// (directa o indirectamente a través de otras auxiliares), se corta la
// recursión con un error explícito en vez de recursar infinitamente.

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
    pub desperdicio: f64,
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

fn extraer(m: &serde_yaml::Mapping, clave: &str) -> Option<f64> {
    a_numero_formula(campo(m, clave).unwrap_or(&serde_yaml::Value::Null))
}

fn texto_de(m: &serde_yaml::Mapping, clave: &str) -> Option<String> {
    match campo(m, clave) {
        Some(serde_yaml::Value::String(s)) if !s.trim().is_empty() => Some(s.clone()),
        _ => None,
    }
}

fn entrada_catalogo<'a>(
    catalogo: Option<&'a serde_yaml::Mapping>,
    nombre: &str,
) -> Option<&'a serde_yaml::Mapping> {
    catalogo?
        .get(&serde_yaml::Value::String(nombre.to_string()))?
        .as_mapping()
}

fn cadena_ciclo(pila: &[String], nombre: &str) -> String {
    let mut c = pila.to_vec();
    c.push(nombre.to_string());
    c.join(" -> ")
}

// Precio de un recurso citado por nombre: inline primero; si no, del
// catálogo. Cuando la entrada del catálogo no trae `precio` pero sí
// `recursos`, es una Actividad Auxiliar y su costo unitario se resuelve
// recursivamente. `pila` lleva las llaves de catálogo en resolución, para
// cortar dependencias circulares con un error explícito.
fn precio_de(
    nombre: &str,
    m: &serde_yaml::Mapping,
    catalogo: Option<&serde_yaml::Mapping>,
    pila: &mut Vec<String>,
) -> Result<Option<f64>, String> {
    if let Some(p) = extraer(m, "precio") {
        return Ok(Some(p));
    }
    let Some(entrada) = entrada_catalogo(catalogo, nombre) else {
        return Ok(None);
    };
    if let Some(p) = extraer(entrada, "precio") {
        return Ok(Some(p));
    }
    let Some(recursos_val) = campo(entrada, "recursos") else {
        return Ok(None);
    };
    if pila.iter().any(|k| k == nombre) {
        return Err(format!(
            "APU: dependencia circular entre actividades auxiliares del catálogo: {}",
            cadena_ciclo(pila, nombre)
        ));
    }
    pila.push(nombre.to_string());
    let recursos = analizar_recursos_pila(recursos_val, catalogo, pila);
    pila.pop();
    let recursos = recursos?;
    if recursos.is_empty() {
        Ok(None)
    } else {
        Ok(Some(recursos.iter().map(|r| r.cuota).sum()))
    }
}

// Rellena nombre/medida/tipo con los del catálogo cuando la entrada no los trae.
fn completar(
    nombre: &str,
    m: &serde_yaml::Mapping,
    catalogo: Option<&serde_yaml::Mapping>,
) -> (Option<String>, Option<String>, Option<String>) {
    let catalogo_m = entrada_catalogo(catalogo, nombre);
    let c = |clave: &str| -> Option<String> {
        texto_de(m, clave).or_else(|| catalogo_m.and_then(|cm| texto_de(cm, clave)))
    };
    (c("tipo"), c("nombre"), c("medida"))
}

fn to_recurso(
    nombre: &str,
    m: &serde_yaml::Mapping,
    catalogo: Option<&serde_yaml::Mapping>,
    pila: &mut Vec<String>,
) -> Result<Option<RecursoApu>, String> {
    let Some(cantidad) = extraer(m, "cantidad") else {
        return Ok(None);
    };
    let Some(precio) = precio_de(nombre, m, catalogo, pila)? else {
        return Ok(None);
    };
    let rendimiento = extraer(m, "rendimiento").unwrap_or(1.0);
    let rendimiento = if rendimiento > 0.0 { rendimiento } else { 1.0 };
    let desperdicio = extraer(m, "desperdicio").unwrap_or(0.0);
    let (tipo, nombre_completo, medida) = completar(nombre, m, catalogo);
    Ok(Some(RecursoApu {
        tipo,
        nombre: nombre_completo.unwrap_or_else(|| nombre.to_string()),
        medida,
        cantidad,
        precio,
        rendimiento,
        desperdicio,
        cuota: cantidad * precio * (1.0 + desperdicio) / rendimiento,
    }))
}

fn analizar_recursos_pila(
    valor: &serde_yaml::Value,
    catalogo: Option<&serde_yaml::Mapping>,
    pila: &mut Vec<String>,
) -> Result<Vec<RecursoApu>, String> {
    use serde_yaml::Value;
    match valor {
        Value::Sequence(seq) => {
            let mut out = Vec::new();
            for v in seq {
                let Some(m) = v.as_mapping() else { continue };
                let nombre = match campo(m, "nombre") {
                    Some(Value::String(s)) => s.clone(),
                    _ => "recurso".to_string(),
                };
                if let Some(r) = to_recurso(&nombre, m, catalogo, pila)? {
                    out.push(r);
                }
            }
            Ok(out)
        }
        Value::Mapping(m) => {
            let mut out = Vec::new();
            for (k, v) in m {
                let Some(nombre) = k.as_str() else { continue };
                let Some(inner) = v.as_mapping() else { continue };
                if let Some(r) = to_recurso(nombre, inner, catalogo, pila)? {
                    out.push(r);
                }
            }
            Ok(out)
        }
        _ => Ok(Vec::new()),
    }
}

// Acepta una lista de mapas o un diccionario clave -> mapa (o valor númerico).
pub fn analizar_recursos(valor: &serde_yaml::Value) -> Result<Vec<RecursoApu>, String> {
    analizar_recursos_con(valor, None)
}

pub fn analizar_recursos_con(
    valor: &serde_yaml::Value,
    catalogo: Option<&serde_yaml::Mapping>,
) -> Result<Vec<RecursoApu>, String> {
    let mut pila = Vec::new();
    analizar_recursos_pila(valor, catalogo, &mut pila)
}

// Precio unitario de una actividad desde sus `recursos` (None si no hay
// recursos válidos). Es el mismo cálculo que `precio-unitario-de-recursos`
// de datos.typ (Typst), catálogo opcional.
pub fn precio_unitario(valor: &serde_yaml::Value) -> Result<Option<f64>, String> {
    precio_unitario_con(valor, None)
}

pub fn precio_unitario_con(
    valor: &serde_yaml::Value,
    catalogo: Option<&serde_yaml::Mapping>,
) -> Result<Option<f64>, String> {
    let recursos = analizar_recursos_con(valor, catalogo)?;
    Ok(if recursos.is_empty() {
        None
    } else {
        Some(recursos.iter().map(|r| r.cuota).sum())
    })
}

// Precio unitario de una Actividad Auxiliar (o recurso simple) del catálogo,
// citada por llave — el vínculo `apu: <llave>` de una tarea del Gantt a una
// Partida reutilizable (ver preparar::resolver_hoja). Resuelve
// recursivamente sus componentes con la misma detección de ciclos que
// `analizar_recursos_con`.
pub fn precio_unitario_de_catalogo(
    clave: &str,
    catalogo: &serde_yaml::Mapping,
) -> Result<Option<f64>, String> {
    let vacio = serde_yaml::Mapping::new();
    let mut pila = Vec::new();
    precio_de(clave, &vacio, Some(catalogo), &mut pila)
}

// Análisis completo de una actividad `codigo` (debe ser hoja y tener
// `recursos`, o un vínculo `apu: <llave>` a una Partida del catálogo):
// devuelve la tabla de recursos con cuotas y el precio unitario resultante.
// `Ok(None)` si la tarea no existe, es un grupo o no declara recursos ni
// vínculo `apu`; `Err` si la resolución encuentra un ciclo en el catálogo.
pub fn analizar(texto: &str, codigo: &str) -> Result<Option<ApuAnalisis>, String> {
    let raiz: serde_yaml::Value = match serde_yaml::from_str(texto) {
        Ok(v) => v,
        Err(_) => return Ok(None),
    };
    let catalogo = catalogo_de(&raiz);
    let lista = match &raiz {
        serde_yaml::Value::Sequence(_) => &raiz,
        serde_yaml::Value::Mapping(m) => match m.get(&serde_yaml::Value::String("tareas".to_string())) {
            Some(v) => v,
            None => return Ok(None),
        },
        _ => return Ok(None),
    };
    let mut plano: Vec<ItemCrudo> = Vec::new();
    aplanar(lista, None, true, &mut plano);
    let indice = construir_indice(&plano);
    let Some(item) = indice.mapa.get(codigo) else { return Ok(None) };
    if indice.hijos_de.contains_key(codigo) {
        return Ok(None); // grupos: no APU propio
    }
    // `recursos` inline tiene prioridad; si no hay, cae al vínculo `apu: <llave>`
    // (la Partida citada se analiza como si fuera la propia descomposición).
    let (recursos_val, pila_inicial): (Option<&serde_yaml::Value>, Vec<String>) =
        match campo(&item.map, "recursos") {
            Some(v) if !es_vacio(v) => (Some(v), Vec::new()),
            _ => match campo(&item.map, "apu") {
                Some(serde_yaml::Value::String(clave)) => {
                    match entrada_catalogo(catalogo.as_ref(), clave).and_then(|e| campo(e, "recursos")) {
                        Some(v) => (Some(v), vec![clave.clone()]),
                        None => (None, Vec::new()),
                    }
                }
                _ => (None, Vec::new()),
            },
        };
    let Some(recursos_val) = recursos_val else { return Ok(None) };
    let mut pila = pila_inicial;
    let recursos = analizar_recursos_pila(recursos_val, catalogo.as_ref(), &mut pila)?;
    if recursos.is_empty() {
        return Ok(None);
    }
    let costo_unitario = recursos.iter().map(|r| r.cuota).sum::<f64>();
    let cantidad = a_numero_formula(campo(&item.map, "cantidad").unwrap_or(&serde_yaml::Value::Null));
    let costo = cantidad.map(|c| c * costo_unitario);
    let nombre = match campo(&item.map, "nombre") {
        Some(serde_yaml::Value::String(s)) => s.clone(),
        _ => codigo.to_string(),
    };
    Ok(Some(ApuAnalisis {
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
    }))
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
        let pu = precio_unitario(&item_11["recursos"]).unwrap().unwrap();
        // 0.1*45000/1 + 0.2*1500/1 + 0.05*48000/1
        assert!((pu - 7200.0).abs() < 1e-9, "pu = {pu}");
    }

    #[test]
    fn precio_unitario_diccionario_con_rendimiento() {
        let raiz: serde_yaml::Value = serde_yaml::from_str(YAML).unwrap();
        let tareas = raiz["tareas"].as_sequence().unwrap();
        let item_12 = &tareas[0]["subtareas"][1];
        let pu = precio_unitario(&item_12["recursos"]).unwrap().unwrap();
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
        let a = analizar(yaml, "9.1").unwrap().expect("9.1");
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
        assert_eq!(precio_unitario(&serde_yaml::Value::Null).unwrap(), None);
        let raiz: serde_yaml::Value = serde_yaml::from_str(YAML).unwrap();
        let tareas = raiz["tareas"].as_sequence().unwrap();
        assert_eq!(precio_unitario(&tareas[0]["subtareas"][2]["recursos"]).unwrap(), None);
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
        let a = analizar(yaml, "1.1").unwrap().expect("1.1");
        // armador: 0.1*48000/2 = 2400 ; fierro: 95*1500/1 = 142500
        assert!((a.costo_unitario - 144900.0).abs() < 1e-9, "cu = {}", a.costo_unitario);
        assert_eq!(a.costo, Some(120.0 * 144900.0));
        // nombre/medida se completan desde el catálogo
        assert_eq!(a.recursos[0].nombre, "Armador jornal");
        assert_eq!(a.recursos[0].medida.as_deref(), Some("jor"));
        assert_eq!(a.recursos[1].nombre, "Fierro recocido");

        // Precio inline de la tarea manda sobre el catálogo.
        let yaml_inline = yaml.replace("          fierro:\n            cantidad: 95\n", "          fierro:\n            cantidad: 95\n            precio: 2000\n");
        let b = analizar(&yaml_inline, "1.1").unwrap().expect("1.1");
        // fierro: 95*2000 = 190000
        assert!((b.costo_unitario - 192400.0).abs() < 1e-9, "cu = {}", b.costo_unitario);

        // Sin catálogo (todo sin precio inline): el APU no resuelve.
        let yaml_sin_catalogo = yaml.replace(
            "recursos:\n  armador:\n    tipo: mano-obra\n    nombre: Armador jornal\n    medida: jor\n    precio: 48000\n  fierro:\n    tipo: material\n    nombre: Fierro recocido\n    medida: kg\n    precio: 1500\n",
            "",
        );
        assert!(analizar(&yaml_sin_catalogo, "1.1").unwrap().is_none());
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
        let a = analizar(YAML, "1.1").unwrap().expect("1.1");
        assert_eq!(a.nombre, "Excavación");
        assert_eq!(a.unidad.as_deref(), Some("m3"));
        assert_eq!(a.cantidad, Some(120.0));
        assert!((a.costo_unitario - 7200.0).abs() < 1e-9);
        assert_eq!(a.costo, Some(864000.0));
        assert_eq!(a.recursos.len(), 3);

        let b = analizar(YAML, "1.2").unwrap().expect("1.2");
        assert!((b.costo_unitario - 4000.0).abs() < 1e-9);
        assert_eq!(b.recursos[0].nombre, "Ayudante (jornada)");

        assert!(analizar(YAML, "1").unwrap().is_none(), "grupo sin APU");
        assert!(analizar(YAML, "1.3").unwrap().is_none(), "sin recursos");
        assert!(analizar(YAML, "nope").unwrap().is_none(), "no existe");
    }

    // --- Actividades Auxiliares (APU compuesto, roll-up en cascada) --------
    //
    // Escenario de la especificación: Recursos básicos *Hormigón H25* ($/m³)
    // y *Capataz* ($/hh); APU Auxiliar *Confección de Viga de Fundación*
    // compuesta por ambos; Tarea Gantt "Construcción de Cimientos - Sector A"
    // (50 m³) vinculada a esa Partida con `apu:`.
    const YAML_CASCADA: &str = r#"
recursos:
  hormigon-h25:
    tipo: material
    nombre: Hormigón H25
    medida: m3
    precio: 90000
  capataz:
    tipo: mano-obra
    nombre: Capataz
    medida: hh
    precio: 8000
  viga-fundacion:
    nombre: Confección de Viga de Fundación
    recursos:
      hormigon-h25:
        cantidad: 1.05
        desperdicio: 0.05
      capataz:
        cantidad: 0.8
tareas:
  - codigo: "1"
    nombre: Cimientos
    subtareas:
      - codigo: "1.1"
        nombre: "Construcción de Cimientos - Sector A"
        inicio: 2026-03-02
        duracion: 5
        unidad: m3
        cantidad: 50
        apu: viga-fundacion
"#;

    fn costo_unitario_1_1(yaml: &str) -> f64 {
        let filas = crate::preparar::preparar_proyecto(yaml, &crate::modelo::OpcionesCpm {
            cpm: false,
            inicio_proyecto: None,
            termino_proyecto: None,
        }).expect("filas");
        filas.iter().find(|f| f.codigo == "1.1").expect("1.1").costo_unitario.expect("cu")
    }

    // Test 1 (spec): cambiar el precio del Recurso Básico *Hormigón H25* y
    // verificar que el costo del APU Auxiliar y el costo de la Tarea Gantt se
    // recalculan (roll-up automático: todo se recalcula desde el YAML).
    #[test]
    fn cascada_recurso_basico_hasta_tarea_gantt() {
        // hormigón: 1.05*90000*1.05 = 99225 ; capataz: 0.8*8000 = 6400
        let cu = costo_unitario_1_1(YAML_CASCADA);
        assert!((cu - 105625.0).abs() < 1e-6, "cu = {cu}");

        let filas = crate::preparar::preparar_proyecto(YAML_CASCADA, &crate::modelo::OpcionesCpm {
            cpm: false, inicio_proyecto: None, termino_proyecto: None,
        }).unwrap();
        let hoja = filas.iter().find(|f| f.codigo == "1.1").unwrap();
        assert!((hoja.costo.unwrap() - 50.0 * cu).abs() < 1e-6);

        // Sube el precio del Hormigón H25 de 90000 a 100000: se propaga.
        let yaml2 = YAML_CASCADA.replace("precio: 90000", "precio: 100000");
        let cu2 = costo_unitario_1_1(&yaml2);
        // hormigón: 1.05*100000*1.05 = 110250 ; capataz: 6400
        assert!((cu2 - 116650.0).abs() < 1e-6, "cu2 = {cu2}");
        assert!(cu2 > cu, "el alza del recurso básico debe subir el costo de la tarea");
    }

    // Test 2 (spec): cambiar la cantidad de obra (workQuantity) de la Tarea
    // Gantt actualiza el costo presupuestado, con el mismo PU del APU.
    #[test]
    fn cascada_cantidad_obra_actualiza_costo_tarea() {
        let filas = crate::preparar::preparar_proyecto(YAML_CASCADA, &crate::modelo::OpcionesCpm {
            cpm: false, inicio_proyecto: None, termino_proyecto: None,
        }).unwrap();
        let hoja = filas.iter().find(|f| f.codigo == "1.1").unwrap();
        let cu = hoja.costo_unitario.unwrap();
        let costo_50 = hoja.costo.unwrap();

        let yaml2 = YAML_CASCADA.replace("cantidad: 50", "cantidad: 120");
        let filas2 = crate::preparar::preparar_proyecto(&yaml2, &crate::modelo::OpcionesCpm {
            cpm: false, inicio_proyecto: None, termino_proyecto: None,
        }).unwrap();
        let hoja2 = filas2.iter().find(|f| f.codigo == "1.1").unwrap();
        assert_eq!(hoja2.costo_unitario.unwrap(), cu, "el PU del APU no cambia");
        assert!((hoja2.costo.unwrap() - 120.0 * cu).abs() < 1e-6);
        assert_ne!(hoja2.costo.unwrap(), costo_50);
    }

    // También se propaga al presupuesto del grupo/proyecto (suma de costos
    // de las hojas), la agregación "Curva S" más básica del roll-up.
    #[test]
    fn cascada_actualiza_presupuesto_del_grupo() {
        let filas = crate::preparar::preparar_proyecto(YAML_CASCADA, &crate::modelo::OpcionesCpm {
            cpm: false, inicio_proyecto: None, termino_proyecto: None,
        }).unwrap();
        let hoja = filas.iter().find(|f| f.codigo == "1.1").unwrap();
        let grupo = filas.iter().find(|f| f.codigo == "1").unwrap();
        assert_eq!(grupo.costo, hoja.costo);
    }

    // Test 3 (spec): una Actividad Auxiliar no puede citarse a sí misma
    // (directa o indirectamente): se bloquea con un error explícito.
    #[test]
    fn detecta_ciclo_directo_entre_apus() {
        let yaml = r#"
recursos:
  a:
    nombre: A
    recursos:
      a:
        cantidad: 1
tareas:
  - codigo: "1"
    nombre: T1
    inicio: 2026-01-01
    duracion: 1
    cantidad: 1
    apu: a
"#;
        let err = analizar(yaml, "1").unwrap_err();
        assert!(err.contains("circular"), "err = {err}");
    }

    #[test]
    fn detecta_ciclo_indirecto_entre_apus() {
        // a -> b -> a
        let yaml = r#"
recursos:
  a:
    nombre: A
    recursos:
      b:
        cantidad: 1
  b:
    nombre: B
    recursos:
      a:
        cantidad: 1
tareas:
  - codigo: "1"
    nombre: T1
    inicio: 2026-01-01
    duracion: 1
    cantidad: 1
    apu: a
"#;
        let err = analizar(yaml, "1").unwrap_err();
        assert!(err.contains("circular"), "err = {err}");

        // El mismo ciclo, detectado también desde preparar_proyecto (la carta).
        let err2 = crate::preparar::preparar_proyecto(yaml, &crate::modelo::OpcionesCpm {
            cpm: false, inicio_proyecto: None, termino_proyecto: None,
        }).unwrap_err();
        assert!(err2.contains("circular"), "err2 = {err2}");
    }

    // Actividad Auxiliar de varios niveles (A contiene B, B contiene un
    // recurso básico): la resolución recorre N niveles sin necesitar ciclos.
    #[test]
    fn apu_auxiliar_recursiva_a_n_niveles() {
        let yaml = r#"
recursos:
  cemento:
    nombre: Cemento
    precio: 6000
  mortero:
    nombre: Mortero
    recursos:
      cemento:
        cantidad: 2
  estuco:
    nombre: Estuco con mortero
    recursos:
      mortero:
        cantidad: 3
tareas:
  - codigo: "1"
    nombre: Estucado
    inicio: 2026-01-01
    duracion: 1
    cantidad: 10
    apu: estuco
"#;
        // mortero: 2*6000 = 12000 ; estuco: 3*12000 = 36000
        let a = analizar(yaml, "1").unwrap().expect("1");
        assert!((a.costo_unitario - 36000.0).abs() < 1e-6, "cu = {}", a.costo_unitario);
        assert_eq!(a.costo, Some(360000.0));
    }
}