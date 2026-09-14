// Tests de integración del motor: comparan los resultados del CPM en Rust
// contra el fixture YAML de ejemplo (mismo dataset que `ejemplo_1.yaml`),
// verificando fechas, duraciones, costos y ruta crítica esperados.

use dominio::fechas::dias_desde_epoca;
use dominio::modelo::OpcionesCpm;
use dominio::preparar::preparar_proyecto;

// El shape JSON es la API hacia React: se serializa exactamente igual que
// la Fila de proyecto.ts (camelCase, opcionales omitidos cuando faltan).
#[test]
fn json_shape_equivale_a_proyecto_ts() {
    let filas = preparar_proyecto(YAML, &OpcionesCpm {
        cpm: true,
        inicio_proyecto: None,
        termino_proyecto: None,
    }).expect("preparar");

    let json = serde_json::to_value(&filas).unwrap();
    let arr = json.as_array().unwrap();
    // orden DFS: 0=1, 1=1.1(grupo), 2=1.1.1(hoja), ...
    let hoja = arr[2].as_object().unwrap(); // 1.1.1 (sin costos ni predecesoras)

    // claves obligatorias
    for k in ["codigo", "nombre", "nivel", "esGrupo", "hito", "inicioDias",
              "terminoDias", "duracion", "avance", "padre", "predecesoras"] {
        assert!(hoja.contains_key(k), "falta {k}");
    }
    // con CPM las hojas traen critico y holgura
    assert_eq!(hoja.get("critico"), Some(&serde_json::Value::Bool(true)));
    assert!(hoja.contains_key("holgura"));
    // costo ausente si la hoja no lo declara (como en TS: undefined)
    assert!(!hoja.contains_key("costo"));

    let raiz = arr[0].as_object().unwrap();
    assert_eq!(raiz.get("esGrupo"), Some(&serde_json::Value::Bool(true)));
    // grupo con costo heredado de hijas
    assert!(raiz.contains_key("costo"));
    // grupos no traen holgura (undefined en TS)
    assert!(!raiz.contains_key("holgura"));
}

const YAML: &str = r#"
tareas:
  - codigo: "1"
    nombre: Proyecto
    subtareas:
      - codigo: "1.1"
        nombre: Diseño
        inicio: "2026-01-05"
        duracion: 3
        avance: "100%"
        costo-unitario: 100000
        cantidad: 2
        subtareas:
          - codigo: "1.1.1"
            nombre: Boceto
            inicio: "2026-01-05"
            duracion: 1
            avance: "100%"
          - codigo: "1.1.2"
            nombre: Detalle
            inicio: "2026-01-06"
            duracion: 2
            avance: "100%"
            predecesoras: "1.1.1"
            costo: 80000
      - codigo: "1.2"
        nombre: Construcción
        inicio: "2026-01-08"
        duracion: 4
        cantidad: 1
        costo-unitario: 450000
        subtareas:
          - codigo: "1.2.1"
            nombre: Cimientos
            inicio: "2026-01-08"
            duracion: 2
            avance: "50%"
            predecesoras: "1.1.2"
          - codigo: "1.2.2"
            nombre: Muros
            inicio: "2026-01-10"
            duracion: 2
            predecesoras: "1.2.1"
      - codigo: "1.3"
        nombre: Hito final
        inicio: "2026-01-12"
        hito: true
        predecesoras: "1.2.2"
"#;

#[test]
fn filas_sin_cpm() {
    let filas = preparar_proyecto(YAML, &OpcionesCpm {
        cpm: false,
        inicio_proyecto: None,
        termino_proyecto: None,
    }).expect("preparar");

    // 1, 1.1, 1.1.1, 1.1.2, 1.2, 1.2.1, 1.2.2, 1.3
    assert_eq!(filas.len(), 8);
    assert_eq!(filas[0].codigo, "1");
    assert_eq!(filas[0].nivel, 0);
    assert!(filas[0].es_grupo);
    assert_eq!(filas[1].codigo, "1.1");
    assert_eq!(filas[2].codigo, "1.1.1");
    assert_eq!(filas[7].codigo, "1.3");
    assert!(filas[7].hito);
}

#[test]
fn fechas_rollup() {
    let filas = preparar_proyecto(YAML, &OpcionesCpm {
        cpm: false,
        inicio_proyecto: None,
        termino_proyecto: None,
    }).expect("preparar");

    let ini = dias_desde_epoca(2026, 1, 5);
    let fin = dias_desde_epoca(2026, 1, 12);

    // Grupo raíz: min inicio de hijas, max término
    assert_eq!(filas[0].inicio_dias, ini);
    assert_eq!(filas[0].termino_dias, fin);
    // Duración del grupo = término - inicio + 1
    assert_eq!(filas[0].duracion, fin - ini + 1);
    // Avance ponderado por duración
    assert!((filas[1].avance - 1.0).abs() < 1e-9);
    assert_eq!(filas[1].duracion, 3);
}

#[test]
fn costos_rollup() {
    let filas = preparar_proyecto(YAML, &OpcionesCpm {
        cpm: false,
        inicio_proyecto: None,
        termino_proyecto: None,
    }).expect("preparar");

    // 1.1.2: costo explícito 80000
    assert!(filas[3].costo.is_some());
    assert_eq!(filas[3].costo.unwrap(), 80000.0);

    // 1.1: rollup = 1.1.1 (0) + 1.1.2 (80000)
    assert!(filas[1].costo.is_some());
    assert_eq!(filas[1].costo.unwrap(), 80000.0);

    // 1.2: 1.2.1 y 1.2.2 no tienen costo; su cantidad*costo-unitario no hace
    // rollup hacia arriba (es de correa)
    // 1.2: rollup de hijas = none (ninguna tiene costo) => none
    assert!(filas[4].costo.is_none());

    // 1 (raíz): suma de todos los costos de hijas = 80000 + none + none
    let raiz = &filas[0];
    assert!(raiz.costo.is_some());
    assert_eq!(raiz.costo.unwrap(), 80000.0);
}

#[test]
fn cpm_fechas_y_criticos() {
    let filas = preparar_proyecto(YAML, &OpcionesCpm {
        cpm: true,
        inicio_proyecto: None,
        termino_proyecto: None,
    }).expect("preparar");

    let ini = dias_desde_epoca(2026, 1, 5);

    // Ruta crítica: 1.1.1 -> 1.1.2 -> 1.2.1 -> 1.2.2 -> 1.3
    // (todas las hojas son contiguas sin holgura)
    let por_codigo = |c: &str| filas.iter().find(|f| f.codigo == c).unwrap();

    assert_eq!(por_codigo("1.1.1").inicio_dias, ini);
    assert_eq!(por_codigo("1.1.1").termino_dias, ini);
    assert!(por_codigo("1.1.1").critico.unwrap());

    assert_eq!(por_codigo("1.1.2").inicio_dias, ini + 1);
    assert_eq!(por_codigo("1.1.2").termino_dias, ini + 2);
    assert!(por_codigo("1.1.2").critico.unwrap());

    assert_eq!(por_codigo("1.2.1").inicio_dias, ini + 3);
    assert_eq!(por_codigo("1.2.1").termino_dias, ini + 4);
    assert!(por_codigo("1.2.1").critico.unwrap());

    assert_eq!(por_codigo("1.2.2").inicio_dias, ini + 5);
    assert_eq!(por_codigo("1.2.2").termino_dias, ini + 6);
    assert!(por_codigo("1.2.2").critico.unwrap());

    assert_eq!(por_codigo("1.3").inicio_dias, ini + 7);
    assert_eq!(por_codigo("1.3").termino_dias, ini + 7);
    assert!(por_codigo("1.3").critico.unwrap());

    // Grupos heredan crítico de sus hijas
    assert!(por_codigo("1").critico.unwrap());
    assert!(por_codigo("1.1").critico.unwrap());
    assert!(por_codigo("1.2").critico.unwrap());

    // Holgura de la raíz: None (es grupo, no hoja)
    assert!(por_codigo("1").holgura.is_none());
}

#[test]
fn cpm_con_inicio_proyecto() {
    // inicio-proyecto NO afecta tareas con ancla explícita (la ancla gana);
    // solo importa para tareas sin inicio ni predecessors.
    let filas = preparar_proyecto(YAML, &OpcionesCpm {
        cpm: true,
        inicio_proyecto: Some("2026-01-10".to_string()),
        termino_proyecto: None,
    }).expect("preparar");

    let por_codigo = |c: &str| filas.iter().find(|f| f.codigo == c).unwrap();
    // 1.1.1 tiene ancla 2026-01-05: la fecha no cambia
    assert_eq!(por_codigo("1.1.1").inicio_dias, dias_desde_epoca(2026, 1, 5));
}

#[test]
fn predecesoras_se_resuelven() {
    let filas = preparar_proyecto(YAML, &OpcionesCpm {
        cpm: true,
        inicio_proyecto: None,
        termino_proyecto: None,
    }).expect("preparar");

    let por_codigo = |c: &str| filas.iter().find(|f| f.codigo == c).unwrap();
    assert_eq!(por_codigo("1.1.2").predecesoras.len(), 1);
    assert_eq!(por_codigo("1.1.2").predecesoras[0].pred, "1.1.1");
    assert_eq!(por_codigo("1.1.2").predecesoras[0].tipo, "fs");
    assert_eq!(por_codigo("1.1.2").predecesoras[0].lag, 0);
}