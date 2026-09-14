/// Conversión civil <-> días desde 1970-01-01 (mismo algoritmo que
/// `diasDesdeEpoca` / `fechaDesdeDias` de proyecto.ts).
///
/// El resultado es el número de días desde la época Unix (1970-01-01 = 0),
/// idéntico a lo que usa la librería Typst internamente.

pub fn dias_desde_epoca(anio: i64, mes: i64, dia: i64) -> i64 {
    let y = if mes <= 2 { anio - 1 } else { anio };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = if mes > 2 { mes - 3 } else { mes + 9 };
    let doy = (153 * mp + 2) / 5 + dia - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

pub fn fecha_desde_dias(z: i64) -> (i64, i64, i64) {
    let zz = z + 719468;
    let era = zz.div_euclid(146097);
    let doe = zz - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let dia = doy - (153 * mp + 2) / 5 + 1;
    let mes = if mp < 10 { mp + 3 } else { mp - 9 };
    let anio = y + if mes <= 2 { 1 } else { 0 };
    (anio, mes, dia)
}

pub fn fecha_iso(z: i64) -> String {
    let (a, m, d) = fecha_desde_dias(z);
    format!("{:04}-{:02}-{:02}", a, m, d)
}

pub fn p2(n: i64) -> String {
    format!("{:02}", n)
}

pub fn a_dias(valor: &serde_yaml::Value) -> Option<i64> {
    use serde_yaml::Value;
    match valor {
        // Número: día juliano directo (aritmética interna de la librería).
        Value::Number(n) => n.as_i64(),
        // Cadena: siempre fecha, "AAAA", "AAAA-MM" o "AAAA-MM-DD".
        Value::String(s) => {
            let s = s.trim();
            let partes: Vec<&str> = s.split('-').collect();
            match partes.len() {
                1 => {
                    let y: i64 = partes[0].parse().ok()?;
                    Some(dias_desde_epoca(y, 1, 1))
                }
                2 => {
                    let y: i64 = partes[0].parse().ok()?;
                    let m: i64 = partes[1].parse().ok()?;
                    Some(dias_desde_epoca(y, m, 1))
                }
                3 => {
                    let y: i64 = partes[0].parse().ok()?;
                    let m: i64 = partes[1].parse().ok()?;
                    let d: i64 = partes[2].parse().ok()?;
                    Some(dias_desde_epoca(y, m, d))
                }
                _ => None,
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_2026_01_05() {
        let z = dias_desde_epoca(2026, 1, 5);
        let (a, m, d) = fecha_desde_dias(z);
        assert_eq!((a, m, d), (2026, 1, 5));
        assert_eq!(fecha_iso(z), "2026-01-05");
    }

    #[test]
    fn roundtrip_2026_09_10() {
        let z = dias_desde_epoca(2026, 9, 10);
        let (a, m, d) = fecha_desde_dias(z);
        assert_eq!((a, m, d), (2026, 9, 10));
    }

    #[test]
    fn roundtrip_2026_12_31() {
        let z = dias_desde_epoca(2026, 12, 31);
        let (a, m, d) = fecha_desde_dias(z);
        assert_eq!((a, m, d), (2026, 12, 31));
    }

    #[test]
    fn roundtrip_2000_01_01() {
        let z = dias_desde_epoca(2000, 1, 1);
        assert_eq!(z, 10957);
        let (a, m, d) = fecha_desde_dias(z);
        assert_eq!((a, m, d), (2000, 1, 1));
    }

    #[test]
    fn iso_prefix_matches() {
        let z = dias_desde_epoca(2026, 1, 1);
        assert!(fecha_iso(z).starts_with("2026"));
    }

    #[test]
    fn a_dias_variants() {
        use serde_yaml::Value;
        assert_eq!(a_dias(&Value::Number(100.into())), Some(100));
        assert_eq!(
            a_dias(&Value::String("2026-01-05".into())),
            Some(dias_desde_epoca(2026, 1, 5))
        );
        assert_eq!(
            a_dias(&Value::String("2026-01".into())),
            Some(dias_desde_epoca(2026, 1, 1))
        );
        assert_eq!(
            a_dias(&Value::String("2026".into())),
            Some(dias_desde_epoca(2026, 1, 1))
        );
        assert_eq!(a_dias(&Value::Null), None);
    }
}
