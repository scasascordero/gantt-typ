// Inyección de fechas a Typst: serializa las filas ya resueltas por el motor
// Rust como un documento YAML con claves kebab-case, listo para que
// `gantt.typ::carta-gantt` lo consuma sin volver a llamar `preparar-tareas`
// (la llave `inicio-dias` en la fila 0 activa esa ruta en `tareas-listas`).
//
// El contrato de salida replica los campos que produce `preparar-tareas`
// en `datos.typ` (ver líneas 425-458): las claves obligatorias y los
// passthrough opcionales que lee el renderer (`formato-barra`, `negrita`,
// `italica`, `color-texto`, `vinculo`, `avance-serie`, `ocultar-subtareas`).

use super::modelo::Fila;
use serde_yaml::{Mapping, Value};

fn push_str(m: &mut Mapping, clave: &str, valor: Value) {
    m.insert(Value::String(clave.to_string()), valor);
}

// Serializa las filas a YAML. Devuelve el texto del documento (forma
// `tareas: [...]`, soportada por `tareas-listas` y por los llamadores que
// pasan el resultado crudo de yaml()).
pub fn filas_a_yaml(filas: &[Fila]) -> String {
    let lista: Vec<Value> = filas.iter().map(fila_a_mapa).collect();
    let mut doc = Mapping::new();
    doc.insert(Value::String("tareas".to_string()), Value::Sequence(lista));
    serde_yaml::to_string(&doc).expect("serializar YAML")
}

// Una fila resuelta: siempre lleva las claves que el renderer accede sin
// default (`codigo`, `nombre`, `nivel`, `es-grupo`, `hito`, fechas,
// `duracion`, `avance`, `predecesoras`); el resto va solo cuando existe,
// para que la salida sea estable e idéntica a la de `preparar-tareas`.
fn fila_a_mapa(f: &Fila) -> Value {
    let mut m = Mapping::new();
    push_str(&mut m, "codigo", Value::String(f.codigo.clone()));
    push_str(&mut m, "nombre", Value::String(f.nombre.clone()));
    push_str(&mut m, "nivel", Value::Number(f.nivel.into()));
    push_str(&mut m, "es-grupo", Value::Bool(f.es_grupo));
    push_str(&mut m, "hito", Value::Bool(f.hito));
    push_str(&mut m, "inicio-dias", Value::Number(f.inicio_dias.into()));
    push_str(&mut m, "termino-dias", Value::Number(f.termino_dias.into()));
    push_str(&mut m, "duracion", Value::Number(f.duracion.into()));
    push_str(&mut m, "avance", Value::Number(num_f64(f.avance)));

    let predecesoras: Vec<Value> = f
        .predecesoras
        .iter()
        .map(|d| {
            let mut dm = Mapping::new();
            push_str(&mut dm, "pred", Value::String(d.pred.clone()));
            push_str(&mut dm, "tipo", Value::String(d.tipo.clone()));
            push_str(&mut dm, "lag", Value::Number(d.lag.into()));
            Value::Mapping(dm)
        })
        .collect();
    push_str(&mut m, "predecesoras", Value::Sequence(predecesoras));

    if let Some(v) = &f.critico {
        push_str(&mut m, "critico", Value::Bool(*v));
    }
    if let Some(v) = &f.holgura {
        push_str(&mut m, "holgura", Value::Number((*v).into()));
    }
    if let Some(v) = &f.cantidad {
        push_str(&mut m, "cantidad", Value::Number(num_f64(*v)));
    }
    if let Some(v) = &f.unidad {
        push_str(&mut m, "unidad", Value::String(v.clone()));
    }
    if let Some(v) = &f.costo_unitario {
        push_str(&mut m, "costo-unitario", Value::Number(num_f64(*v)));
    }
    if let Some(v) = &f.costo {
        push_str(&mut m, "costo", Value::Number(num_f64(*v)));
    }
    if let Some(v) = &f.avance_serie {
        let serie: Vec<Value> = v.iter().map(|x| Value::Number(num_f64(*x))).collect();
        push_str(&mut m, "avance-serie", Value::Sequence(serie));
    }
    if let Some(v) = &f.formato_barra {
        push_str(&mut m, "formato-barra", Value::String(v.clone()));
    }
    if let Some(v) = &f.negrita {
        push_str(&mut m, "negrita", Value::Bool(*v));
    }
    if let Some(v) = &f.italica {
        push_str(&mut m, "italica", Value::Bool(*v));
    }
    if let Some(v) = &f.color_texto {
        push_str(&mut m, "color-texto", Value::String(v.clone()));
    }
    if let Some(v) = &f.vinculo {
        push_str(&mut m, "vinculo", Value::String(v.clone()));
    }
    if let Some(v) = &f.ocultar_subtareas {
        push_str(&mut m, "ocultar-subtareas", Value::Bool(*v));
    }

    Value::Mapping(m)
}

fn num_f64(v: f64) -> serde_yaml::Number {
    serde_yaml::Number::from(v)
}

// --- Tests ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modelo::{DepJson, OpcionesCpm};
    use crate::preparar::preparar_proyecto;

    const YAML: &str = r#"
tareas:
  - codigo: "1"
    nombre: Proyecto
    formato-barra: "gradiente"
    negrita: true
    vinculo: "archivo.typ:5"
    subtareas:
      - codigo: "1.1"
        nombre: Diseño
        inicio: "2026-01-05"
        duracion: 3
        avance: "50%"
        subtareas:
          - codigo: "1.1.1"
            nombre: Boceto
            inicio: "2026-01-05"
            duracion: 1
            avance: "30%"
          - codigo: "1.1.2"
            nombre: Detalle
            inicio: "2026-01-06"
            duracion: 2
            avance: ["20%", "50%"]
            predecesoras: "1.1.1"
      - codigo: "1.2"
        nombre: Construcción
        inicio: "2026-01-08"
        duracion: 4
        subtareas:
          - codigo: "1.2.1"
            nombre: Cimientos
            inicio: "2026-01-08"
            duracion: 2
            predecesoras: "1.1.2"
          - codigo: "1.2.2"
            nombre: Estructura
            inicio: "2026-01-10"
            duracion: 2
            predecesoras: "1.2.1"
"#;

    #[test]
    fn salida_tiene_llave_inicio_dias() {
        let filas = preparar_proyecto(YAML, &OpcionesCpm { cpm: true, inicio_proyecto: None, termino_proyecto: None }).unwrap();
        let yaml = filas_a_yaml(&filas);
        let doc: serde_yaml::Value = serde_yaml::from_str(&yaml).unwrap();
        let tareas = doc.get("tareas").unwrap().as_sequence().unwrap();
        assert_eq!(tareas.len(), filas.len());
        // la fila 0 debe tener "inicio-dias" para activar la ruta resuelta
        assert!(tareas[0].get("inicio-dias").is_some(), "falta inicio-dias en fila 0");
        // la hoja 1.1.2 debe conservar la serie de avance
        let serie = tareas.iter().find(|t| t.get("codigo") == Some(&serde_yaml::Value::String("1.1.2".to_string())))
            .and_then(|t| t.get("avance-serie"));
        assert!(serie.is_some(), "falta avance-serie en 1.1.2");
        // passthrough de la raíz
        let raiz = &tareas[0];
        assert_eq!(raiz.get("formato-barra"), Some(&serde_yaml::Value::String("gradiente".to_string())));
        assert_eq!(raiz.get("negrita"), Some(&serde_yaml::Value::Bool(true)));
        assert_eq!(raiz.get("vinculo"), Some(&serde_yaml::Value::String("archivo.typ:5".to_string())));
        // predecesoras de la hoja 1.2.1, en forma resuelta
        let cim = tareas.iter().find(|t| t.get("codigo") == Some(&serde_yaml::Value::String("1.2.1".to_string()))).unwrap();
        let preds = cim.get("predecesoras").unwrap().as_sequence().unwrap();
        assert_eq!(preds[0].get("tipo"), Some(&serde_yaml::Value::String("fs".to_string())));
        assert_eq!(preds[0].get("pred"), Some(&serde_yaml::Value::String("1.1.2".to_string())));
    }

    #[test]
    fn roundtrip_fila_equivalente_a_json() {
        let fila = Fila {
            codigo: "a".to_string(),
            nombre: "Tarea".to_string(),
            nivel: 2,
            es_grupo: false,
            hito: false,
            inicio_dias: 10,
            termino_dias: 12,
            duracion: 3,
            avance: 0.5,
            padre: Some("1".to_string()),
            predecesoras: vec![DepJson { pred: "b".to_string(), tipo: "fs".to_string(), lag: 0 }],
            critico: Some(false),
            holgura: Some(2),
            cantidad: Some(4.0),
            unidad: Some("m".to_string()),
            costo_unitario: Some(2.5),
            costo: Some(10.0),
            avance_serie: Some(vec![0.2, 0.4, 0.4]),
            formato_barra: Some("rayas".to_string()),
            negrita: None,
            italica: Some(true),
            color_texto: Some("#123456".to_string()),
            vinculo: Some("a.typ:1".to_string()),
            ocultar_subtareas: Some(true),
        };
        let yaml = filas_a_yaml(&[fila]);
        let doc: serde_yaml::Value = serde_yaml::from_str(&yaml).unwrap();
        let t = &doc["tareas"][0];
        assert_eq!(t["inicio-dias"], serde_yaml::Value::Number(10.into()));
        assert_eq!(t["costo"], serde_yaml::Value::Number(serde_yaml::Number::from(10.0)));
        assert_eq!(t["avance-serie"], serde_yaml::Value::Sequence(
            vec![0.2, 0.4, 0.4].into_iter().map(|x| Value::Number(serde_yaml::Number::from(x))).collect()
        ));
        assert_eq!(t["color-texto"], serde_yaml::Value::String("#123456".to_string()));
        assert!(t.get("negrita").is_none(), "negrita None debe omitirse");
    }
}