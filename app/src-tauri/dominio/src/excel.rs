// Serializador a libro Excel real (.xlsx) vía rust_xlsxwriter.
// Genera una hoja "Tareas" con el plan ya resuelto por el motor: WBS,
// fechas, duración, avance, predecesoras, crítica y costos.

use super::exportar::ProyectoExportable;
use super::fechas::fecha_desde_dias;
use rust_xlsxwriter::{Color, ExcelDateTime, Format, FormatAlign, FormatBorder, Workbook};

const AZUL: u32 = 0x3054_96;

// Número punteado (1, 1.2, 1.2.3): mismo orden que `numerar` de exportar.rs.
fn wbs_de(filas: &[super::modelo::Fila]) -> Vec<String> {
    let mut contador: std::collections::HashMap<i32, usize> = std::collections::HashMap::new();
    let mut prefijo: std::collections::HashMap<i32, String> = std::collections::HashMap::new();
    let mut out = Vec::with_capacity(filas.len());
    for f in filas {
        let claves: Vec<i32> = contador.keys().copied().filter(|n| *n > f.nivel).collect();
        for c in claves {
            contador.remove(&c);
        }
        let c = contador.get(&f.nivel).copied().unwrap_or(0) + 1;
        contador.insert(f.nivel, c);
        let wbs = if f.nivel > 0 {
            format!("{}.{}", prefijo.get(&(f.nivel - 1)).cloned().unwrap_or_default(), c)
        } else {
            c.to_string()
        };
        prefijo.insert(f.nivel, wbs.clone());
        out.push(wbs);
    }
    out
}

fn predecesoras_texto(f: &super::modelo::Fila) -> String {
    f.predecesoras
        .iter()
        .map(|d| {
            let mut s = d.pred.clone();
            if d.tipo != "fs" || d.lag != 0 {
                s.push(':');
                s.push_str(&d.tipo);
            }
            if d.lag != 0 {
                s.push(':');
                s.push_str(&d.lag.to_string());
            }
            s
        })
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn a_excel(p: &ProyectoExportable) -> Result<Vec<u8>, String> {
    let mut libro = Workbook::new();

    let encabezado = Format::new()
        .set_bold()
        .set_font_color(Color::White)
        .set_background_color(Color::RGB(AZUL))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin)
        .set_border_color(Color::RGB(AZUL));

    let texto = Format::new().set_border(FormatBorder::Thin);
    let centro = Format::new().set_border(FormatBorder::Thin).set_align(FormatAlign::Center);
    let fecha = Format::new().set_border(FormatBorder::Thin).set_num_format("yyyy-mm-dd");
    let porc = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("0%")
        .set_align(FormatAlign::Center);
    let num = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0")
        .set_align(FormatAlign::Center);
    let moneda = Format::new()
        .set_border(FormatBorder::Thin)
        .set_num_format("#,##0.00")
        .set_align(FormatAlign::Right);

    use rust_xlsxwriter::Worksheet;
    let hoja: &mut Worksheet = libro.add_worksheet();
    hoja.set_name("Tareas").map_err(|e| e.to_string())?;

    const COLS: [&str; 16] = [
        "WBS", "Código", "Nombre", "Nivel", "Tipo", "Inicio", "Término", "Duración",
        "Avance", "Predecesoras", "Crítico", "Holgura", "Cantidad", "Unidad", "Costo unit.",
        "Costo",
    ];
    for (c, t) in COLS.iter().enumerate() {
        hoja.write_string_with_format(0, c as u16, *t, &encabezado)
            .map_err(|e| e.to_string())?;
    }
    hoja.set_row_height(0, 20).map_err(|e| e.to_string())?;
    hoja.set_freeze_panes(1, 0).map_err(|e| e.to_string())?;

    let wsbs = wbs_de(&p.filas);
    for (i, f) in p.filas.iter().enumerate() {
        let r = (i + 1) as u32;
        let tp = if f.es_grupo {
            "Grupo"
        } else if f.hito {
            "Hito"
        } else {
            "Tarea"
        };
        hoja.write_string_with_format(r, 0, wsbs[i].as_str(), &centro).map_err(|e| e.to_string())?;
        hoja.write_string_with_format(r, 1, &f.codigo, &texto).map_err(|e| e.to_string())?;
        hoja.write_string_with_format(r, 2, &f.nombre, &texto).map_err(|e| e.to_string())?;
        hoja.write_number_with_format(r, 3, f.nivel as f64, &centro).map_err(|e| e.to_string())?;
        hoja.write_string_with_format(r, 4, tp, &centro).map_err(|e| e.to_string())?;

        let (a, m, d) = fecha_desde_dias(f.inicio_dias);
        let ini = ExcelDateTime::from_ymd(a as u16, m as u8, d as u8).map_err(|e| e.to_string())?;
        let (a, m, d) = fecha_desde_dias(f.termino_dias);
        let fin = ExcelDateTime::from_ymd(a as u16, m as u8, d as u8).map_err(|e| e.to_string())?;
        hoja.write_datetime_with_format(r, 5, &ini, &fecha).map_err(|e| e.to_string())?;
        hoja.write_datetime_with_format(r, 6, &fin, &fecha).map_err(|e| e.to_string())?;

        hoja.write_number_with_format(r, 7, f.duracion as f64, &num).map_err(|e| e.to_string())?;
        hoja.write_number_with_format(r, 8, f.avance, &porc).map_err(|e| e.to_string())?;
        let preds = predecesoras_texto(f);
        hoja.write_string_with_format(r, 9, &preds, &texto).map_err(|e| e.to_string())?;
        let crit = f.critico.map(|c| if c { "Sí" } else { "No" }).unwrap_or("No");
        hoja.write_string_with_format(r, 10, crit, &centro).map_err(|e| e.to_string())?;
        hoja.write_number_with_format(r, 11, f.holgura.unwrap_or(0) as f64, &num)
            .map_err(|e| e.to_string())?;
        hoja.write_number_with_format(r, 12, f.cantidad.unwrap_or(0.0), &num)
            .map_err(|e| e.to_string())?;
        let uni = f.unidad.clone().unwrap_or_default();
        hoja.write_string_with_format(r, 13, &uni, &centro).map_err(|e| e.to_string())?;
        hoja.write_number_with_format(r, 14, f.costo_unitario.unwrap_or(0.0), &moneda)
            .map_err(|e| e.to_string())?;
        hoja.write_number_with_format(r, 15, f.costo.unwrap_or(0.0), &moneda)
            .map_err(|e| e.to_string())?;
    }

    let anchos = [
        8.0, 10.0, 40.0, 7.0, 8.0, 12.0, 12.0, 9.0, 9.0, 22.0, 8.0, 9.0, 9.0, 8.0, 11.0, 11.0,
    ];
    for (c, a) in anchos.iter().enumerate() {
        hoja.set_column_width(c as u16, *a).map_err(|e| e.to_string())?;
    }

    if !p.filas.is_empty() {
        let ultima = p.filas.len() as u32;
        hoja.autofilter(0, 0, ultima, COLS.len() as u16 - 1).map_err(|e| e.to_string())?;
    }

    let props = rust_xlsxwriter::DocProperties::new()
        .set_title(&p.nombre)
        .set_subject("Carta Gantt");
    libro.set_properties(&props);

    libro.save_to_buffer().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exportar::proyecto;
    use crate::modelo::OpcionesCpm;
    use crate::preparar::preparar_proyecto;

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
"#;

    fn filas() -> Vec<super::super::modelo::Fila> {
        preparar_proyecto(YAML, &OpcionesCpm { cpm: true, inicio_proyecto: None, termino_proyecto: None }).unwrap()
    }

    #[test]
    fn genera_xlsx_real() {
        let p = proyecto("mi proyecto", filas());
        let bytes = a_excel(&p).unwrap();
        // .xlsx es un zip OOXML: debe empezar con "PK.."
        assert!(bytes.len() > 1000, "tamaño esperado, fue {}", bytes.len());
        assert_eq!(&bytes[0..2], b"PK");
    }

    #[test]
    fn wbs_punteado() {
        let p = proyecto("mi proyecto", filas());
        let ws = wbs_de(&p.filas);
        assert_eq!(ws, vec!["1", "1.1", "1.1.1", "1.1.2", "1.2", "1.2.1"]);
    }
}