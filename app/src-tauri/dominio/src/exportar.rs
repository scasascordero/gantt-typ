// Serializadores MSPDI (MS Project 2003 XML), PMXML (Primavera P6 XML) y
// XER (Primavera P6). Port en Rust de `exportadores.ts`: mismo contrato de
// salida, partiendo de las filas ya resueltas por `preparar_proyecto`.

use super::fechas::fecha_iso;
use super::modelo::Fila;
use std::collections::HashMap;

pub struct ProyectoExportable {
    pub nombre: String,
    pub filas: Vec<Fila>,
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

struct Uid {
    uid: usize,
    wbs: String,
    outline: usize,
}

impl Clone for Uid {
    fn clone(&self) -> Self {
        Uid { uid: self.uid, wbs: self.wbs.clone(), outline: self.outline }
    }
}

// UID secuencial + WBS punteado (1, 1.2, 1.2.3) según el nivel DFS.
// UIDs empiezan en 1 (como en TS: `i + 1` con i desde 0).
fn numerar(filas: &[Fila]) -> HashMap<String, Uid> {
    let mut m = HashMap::new();
    let mut contador: HashMap<i32, usize> = HashMap::new();
    let mut prefijo: HashMap<i32, String> = HashMap::new();
    for (i, f) in filas.iter().enumerate() {
        // borrar contadores de niveles más profundos (quedan los hermanos
        // del nivel actual y sus ancestros)
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
        m.insert(
            f.id.clone(),
            Uid { uid: i + 1, wbs, outline: f.nivel as usize + 1 },
        );
    }
    m
}

// UID del padre: `padre` apunta al código (identidad del árbol); se traduce
// al id para consultar el mapa de uids (keyed por id).
fn parent_uid(
    padre: &Option<String>,
    codigo_a_id: &HashMap<&str, &str>,
    uids: &HashMap<String, Uid>,
) -> Option<Uid> {
    let c = padre.as_deref()?;
    let id = *codigo_a_id.get(c)?;
    uids.get(id).cloned()
}

fn mspdi_tipo(t: &str) -> usize {
    match t {
        "ff" => 0,
        "fs" => 1,
        "sf" => 2,
        "ss" => 3,
        _ => 1,
    }
}

fn pmxml_tipo(t: &str) -> &'static str {
    match t {
        "ss" => "StartToStart",
        "ff" => "FinishToFinish",
        "sf" => "StartToFinish",
        _ => "FinishToStart",
    }
}

fn xer_tipo(t: &str) -> &'static str {
    match t {
        "ss" => "PR_SS",
        "ff" => "PR_FF",
        "sf" => "PR_SF",
        _ => "PR_FS",
    }
}

fn xer_txt(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\t', " ").replace("\r\n", "\\n").replace('\n', "\\n")
}

fn xer_fecha(z: i64) -> String {
    format!("{} 00:00", fecha_iso(z))
}

fn bloque(tabla: &str, columnas: &[&str], filas: &[Vec<String>]) -> String {
    let mut out = vec![format!("%T\t{}", tabla), format!("%E\t{}", columnas.join("\t"))];
    for f in filas {
        out.push(f.join("\t"));
    }
    out.join("\r\n")
}

// --- MSPDI (Microsoft Project 2003 XML) ------------------------------------

pub fn a_mspdi(p: &ProyectoExportable) -> String {
    let uids = numerar(&p.filas);
    let por_id: HashMap<&str, &Fila> = p.filas.iter().map(|f| (f.id.as_str(), f)).collect();
    let codigo_a_id: HashMap<&str, &str> = p.filas.iter().map(|f| (f.codigo.as_str(), f.id.as_str())).collect();
    let ahora = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let mut l = Vec::new();
    l.push("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>".to_string());
    l.push("<Project xmlns=\"http://schemas.microsoft.com/project\">".to_string());
    l.push(format!("  <Name>{}</Name>", esc(&p.nombre)));
    l.push(format!("  <Title>{}</Title>", esc(&p.nombre)));
    l.push(format!("  <CreationDate>{}</CreationDate>", ahora));
    l.push("  <Tasks>".to_string());
    for f in &p.filas {
        let u = &uids[&f.id];
        let inicio = fecha_iso(f.inicio_dias);
        let fin = fecha_iso(f.termino_dias);
        let dur_h = if f.hito || f.es_grupo { 0.0 } else { f.duracion as f64 * 24.0 };
        l.push("    <Task>".to_string());
        l.push(format!("      <UID>{}</UID>", u.uid));
        l.push(format!("      <ID>{}</ID>", u.uid));
        l.push(format!("      <Name>{}</Name>", esc(&f.nombre)));
        l.push(format!("      <Text1>{}</Text1>", esc(&f.codigo)));
        l.push("      <Active>1</Active>".to_string());
        if f.es_grupo {
            l.push("      <Summary>1</Summary>".to_string());
        }
        if f.hito {
            l.push("      <Milestone>1</Milestone>".to_string());
        }
        l.push(format!("      <Start>{}T08:00:00</Start>", inicio));
        l.push(format!("      <Finish>{}T17:00:00</Finish>", fin));
        l.push(format!("      <Duration>PT{}H0M0S</Duration>", dur_h));
        l.push(format!("      <PercentComplete>{}</PercentComplete>", (f.avance * 100.0).round() as i64));
        l.push(format!("      <PhysicalPercentComplete>{}</PhysicalPercentComplete>", (f.avance * 100.0).round() as i64));
        if let Some(c) = f.critico {
            l.push(format!("      <Critical>{}</Critical>", if c { 1 } else { 0 }));
        }
        if let Some(h) = f.holgura {
            l.push(format!("      <TotalSlack>{}</TotalSlack>", (h as f64 * 24.0 * 60.0 * 100.0) as i64));
        }
        l.push(format!("      <OutlineLevel>{}</OutlineLevel>", u.outline));
        l.push(format!("      <OutlineNumber>{}</OutlineNumber>", u.wbs));
        l.push(format!("      <WBS>{}</WBS>", u.wbs));
        if let Some(u_padre) = parent_uid(&f.padre, &codigo_a_id, &uids) {
            l.push(format!("      <ParentID>{}</ParentID>", u_padre.uid));
        }
        for d in &f.predecesoras {
            if !por_id.contains_key(d.pred.as_str()) {
                continue;
            }
            l.push("      <PredecessorLink>".to_string());
            l.push(format!(
                "        <PredecessorUID>{}</PredecessorUID>",
                uids[&d.pred].uid
            ));
            l.push(format!("        <Type>{}</Type>", mspdi_tipo(&d.tipo)));
            l.push(format!("        <Lag>{}</Lag>", d.lag * 24 * 60 * 10));
            l.push("      </PredecessorLink>".to_string());
        }
        l.push("    </Task>".to_string());
    }
    l.push("  </Tasks>".to_string());
    l.push("</Project>".to_string());
    l.join("\r\n")
}

// --- PMXML (Primavera P6 XML) ----------------------------------------------

pub fn a_pmxml(p: &ProyectoExportable) -> String {
    let uids = numerar(&p.filas);
    let por_id: HashMap<&str, &Fila> = p.filas.iter().map(|f| (f.id.as_str(), f)).collect();
    let codigo_a_id: HashMap<&str, &str> = p.filas.iter().map(|f| (f.codigo.as_str(), f.id.as_str())).collect();
    let fin_proyecto = p.filas.iter().map(|f| f.termino_dias).max().unwrap_or(0);
    let ini_proyecto = p.filas.iter().map(|f| f.inicio_dias).min().unwrap_or(0);
    let mut l = Vec::new();
    l.push("<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string());
    l.push("<PMML>".to_string());
    let nombre_esc = esc(&p.nombre);
    let corto = nombre_esc.chars().take(30).collect::<String>();
    l.push("    <Header>".to_string());
    l.push("    <ToolName>gantt-editor</ToolName>".to_string());
    l.push("    <ToolVersion>1.0</ToolVersion>".to_string());
    l.push("    <Lang xmlns=\"http://www.w3.org/XML/1998/namespace\">es</Lang>".to_string());
    l.push("  </Header>".to_string());
    l.push("  <Project>".to_string());
    l.push("    <ProjectID>1</ProjectID>".to_string());
    l.push("    <ProjectUniqueID>1</ProjectUniqueID>".to_string());
    l.push("    <ParentProjectUniqueID>-1</ParentProjectUniqueID>".to_string());
    l.push(format!("    <ShortName>{}</ShortName>", corto));
    l.push(format!("    <ProjectName>{}</ProjectName>", nombre_esc));
    l.push("    <WBSCode>1</WBSCode>".to_string());
    l.push("    <ProjectLayoutType>Project</ProjectLayoutType>".to_string());
    l.push(format!("    <StartDate>{} 00:00</StartDate>", fecha_iso(ini_proyecto)));
    l.push(format!("    <EndDate>{} 23:59</EndDate>", fecha_iso(fin_proyecto)));
    for f in &p.filas {
        let u = &uids[&f.id];
        let tp = if f.es_grupo {
            "Task Summary"
        } else if f.hito {
            "Milestone"
        } else {
            "Task Dependent"
        };
        let dur = if f.hito { 0.0 } else { (f.duracion.max(1)) as f64 * 86400000.0 };
        l.push("    <Task>".to_string());
        l.push(format!("      <TaskID>{}</TaskID>", u.uid));
        l.push(format!("      <TaskUniqueID>{}</TaskUniqueID>", u.uid));
        l.push(format!("      <WBSID>{}</WBSID>", u.uid));
        l.push(format!("      <Name>{}</Name>", esc(&f.nombre)));
        l.push(format!("      <Type>{}</Type>", tp));
        l.push(format!("      <Duration>{}</Duration>", dur));
        l.push(format!("      <DurationOriginal>{}</DurationOriginal>", dur));
        l.push(format!("      <Start>{} 00:00</Start>", fecha_iso(f.inicio_dias)));
        l.push(format!("      <Finish>{} 23:59</Finish>", fecha_iso(f.termino_dias)));
        l.push("      <Calendar>2</Calendar>".to_string());
        l.push(format!("      <PercentComplete>{}</PercentComplete>", (f.avance * 100.0).round() as i64));
        l.push(format!("      <PhysicalPercentComplete>{}</PhysicalPercentComplete>", (f.avance * 100.0).round() as i64));
        l.push(format!("      <Critical>{}</Critical>", if f.critico.unwrap_or(false) { 1 } else { 0 }));
        if let Some(h) = f.holgura {
            l.push(format!("      <TotalFloat>{}</TotalFloat>", h as f64 * 24.0 * 60.0));
        }
        if let Some(u_padre) = parent_uid(&f.padre, &codigo_a_id, &uids) {
            l.push(format!("      <ParentTaskID>{}</ParentTaskID>", u_padre.uid));
        }
        l.push("    </Task>".to_string());
    }
    let mut rel_id = 1;
    for f in &p.filas {
        for d in &f.predecesoras {
            if !por_id.contains_key(d.pred.as_str()) {
                continue;
            }
            l.push("    <Relationship>".to_string());
            l.push(format!("      <RelationshipID>{}</RelationshipID>", rel_id));
            l.push(format!("      <RelationshipType>{}</RelationshipType>", pmxml_tipo(&d.tipo)));
            l.push("      <ProjectID>1</ProjectID>".to_string());
            l.push(format!("      <PredecessorTaskID>{}</PredecessorTaskID>", uids[&d.pred].uid));
            l.push(format!("      <PredecessorTaskUniqueID>{}</PredecessorTaskUniqueID>", uids[&d.pred].uid));
            l.push(format!("      <SuccessorTaskID>{}</SuccessorTaskID>", uids[&f.id].uid));
            l.push(format!("      <SuccessorTaskUniqueID>{}</SuccessorTaskUniqueID>", uids[&f.id].uid));
            l.push(format!("      <LagDurationInteger>{}</LagDurationInteger>", d.lag));
            l.push("      <LagDurationType>2</LagDurationType>".to_string());
            l.push("    </Relationship>".to_string());
            rel_id += 1;
        }
    }
    for f in &p.filas {
        let u = &uids[&f.id];
        l.push("    <WBS>".to_string());
        l.push(format!("      <WBSID>{}</WBSID>", u.uid));
        l.push("      <ProjectID>1</ProjectID>".to_string());
        l.push("      <ProjectUniqueID>1</ProjectUniqueID>".to_string());
        l.push("      <ParentWBSID>0</ParentWBSID>".to_string());
        l.push(format!("      <Name>{}</Name>", esc(&u.wbs)));
        l.push(format!("      <Description>{}</Description>", esc(&f.nombre)));
        l.push(format!("      <Type>{}</Type>", if f.es_grupo { "Summary" } else { "Task" }));
        l.push("    </WBS>".to_string());
    }
    l.push("  </Project>".to_string());
    l.push("  <CalendarData>".to_string());
    l.push("    <Calendar>".to_string());
    l.push("      <CalendarID>1</CalendarID>".to_string());
    l.push("      <CalendarName>Standard</CalendarName>".to_string());
    l.push("      <CalendarType>Employee</CalendarType>".to_string());
    l.push("      <HoursPerDay>8</HoursPerDay>".to_string());
    l.push("      <DaysPerWeek>5</DaysPerWeek>".to_string());
    l.push("      <DaysPerMonth>20</DaysPerMonth>".to_string());
    l.push("      <WeekWorkDayFlagList>1111100</WeekWorkDayFlagList>".to_string());
    l.push("    </Calendar>".to_string());
    l.push("    <Calendar>".to_string());
    l.push("      <CalendarID>2</CalendarID>".to_string());
    l.push("      <CalendarName>24 Hour Calendar</CalendarName>".to_string());
    l.push("      <CalendarType>Employee</CalendarType>".to_string());
    l.push("      <HoursPerDay>24</HoursPerDay>".to_string());
    l.push("      <DaysPerWeek>7</DaysPerWeek>".to_string());
    l.push("      <DaysPerMonth>30</DaysPerMonth>".to_string());
    l.push("      <WeekWorkDayFlagList>1111111</WeekWorkDayFlagList>".to_string());
    l.push("    </Calendar>".to_string());
    l.push("  </CalendarData>".to_string());
    l.push("</PMML>".to_string());
    l.join("\n")
}

// --- XER (Primavera P6, delimitado por tabs) -------------------------------

pub fn a_xer(p: &ProyectoExportable) -> String {
    let uids = numerar(&p.filas);
    let por_id: HashMap<&str, &Fila> = p.filas.iter().map(|f| (f.id.as_str(), f)).collect();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let ini_proyecto = p.filas.iter().map(|f| f.inicio_dias).min().unwrap_or(0);
    let mut partes: Vec<String> = Vec::new();
    partes.push(format!("EREXP  V95.4.0    1 {}", now));

    let project_row = vec![
        "1".to_string(),
        "1".to_string(),
        xer_txt(&p.nombre),
        "1".to_string(),
        format!("{} 00:00:00", fecha_iso(ini_proyecto)),
    ];
    partes.push(bloque(
        "PROJECT",
        &["PROJECT_ID", "PROJECT_UNIQUE_ID", "SHORT_NAME", "WBS_CODE", "CREATED_DATE"],
        &[project_row],
    ));

    let cal_rows = vec![
        vec!["1".to_string(), "Standard".to_string(), "1".to_string(), "8".to_string(), "5".to_string(), "20".to_string(), "WWWWWOO".to_string()],
        vec!["2".to_string(), "24 Hour Calendar".to_string(), "1".to_string(), "24".to_string(), "7".to_string(), "30".to_string(), "WWWWWWW".to_string()],
    ];
    partes.push(bloque(
        "CALENDAR",
        &["CAL_ID", "CAL_NAME", "CAL_TYPE", "HRS_PER_DAY", "DAYS_PER_WEEK", "DAYS_PER_MONTH", "WEEK_WORK_FLAG"],
        &cal_rows,
    ));

    let wbs_rows: Vec<Vec<String>> = p
        .filas
        .iter()
        .map(|f| {
            let u = &uids[&f.id];
            vec![
                u.uid.to_string(),
                "1".to_string(),
                "1".to_string(),
                "0".to_string(),
                xer_txt(&u.wbs),
                xer_txt(&f.codigo),
                "tt".to_string(),
            ]
        })
        .collect();
    partes.push(bloque(
        "PROJWBS",
        &["WBS_ID", "PROJECT_ID", "PROJECT_UNIQUE_ID", "PARENT_WBS_ID", "WBS_NAME", "WBS_SHORT_PATH", "WBS_TYPE"],
        &wbs_rows,
    ));

    let task_cols = [
        "TASK_ID",
        "TASK_UNIQUE_ID",
        "PROJECT_ID",
        "PROJECT_UNIQUE_ID",
        "WBS_ID",
        "TASK_TYPE",
        "MILESTONE",
        "STATUS_CODE",
        "NAME",
        "OUTLVL",
        "DURATION_TYPE",
        "DURATION_2",
        "START_DATE",
        "FINISH_DATE",
        "TOTAL_FLOAT",
        "CAL_ID",
        "CRITICAL",
    ];
    let task_rows: Vec<Vec<String>> = p
        .filas
        .iter()
        .map(|f| {
            let u = &uids[&f.id];
            let ttype = if f.es_grupo {
                "TT_Sub"
            } else if f.hito {
                "TT_Mile"
            } else {
                "TT_Task"
            };
            let status = if f.avance >= 1.0 {
                "TK_Complete"
            } else if f.avance > 0.0 {
                "TK_Active"
            } else {
                "TK_NotStart"
            };
            vec![
                u.uid.to_string(),
                u.uid.to_string(),
                "1".to_string(),
                "1".to_string(),
                u.uid.to_string(),
                ttype.to_string(),
                if f.hito { "1" } else { "0" }.to_string(),
                status.to_string(),
                xer_txt(&f.nombre),
                u.outline.to_string(),
                "1".to_string(),
                (if f.hito { 0 } else { (f.duracion.max(1) as f64 * 86400000.0) as i64 })
                    .to_string(),
                xer_fecha(f.inicio_dias),
                xer_fecha(f.termino_dias),
                f.holgura.map(|h| (h as f64 * 1440.0) as i64).unwrap_or(0).to_string(),
                "2".to_string(),
                f.critico.map(|c| if c { "Y" } else { "N" }).unwrap_or("N").to_string(),
            ]
        })
        .collect();
    partes.push(bloque("TASK", &task_cols, &task_rows));

    let mut pred_id = 1;
    let mut preds: Vec<Vec<String>> = Vec::new();
    for f in &p.filas {
        for d in &f.predecesoras {
            if !por_id.contains_key(d.pred.as_str()) {
                continue;
            }
            preds.push(vec![
                pred_id.to_string(),
                uids[&f.id].uid.to_string(),
                uids[&d.pred].uid.to_string(),
                "1".to_string(),
                "1".to_string(),
                xer_tipo(&d.tipo).to_string(),
                (d.lag * 1440).to_string(),
                "1".to_string(),
                "0".to_string(),
            ]);
            pred_id += 1;
        }
    }
    if !preds.is_empty() {
        partes.push(bloque(
            "TASKPRED",
            &["PRED_ID", "TASK_ID", "PRED_TASK_ID", "PROJECT_ID", "PROJECT_UNIQUE_ID", "PRED_TYPE", "PRED_LAG", "PRED_CAL_TYPE", "PRED_PRIORITY"],
            &preds,
        ));
    }
    partes.push("%F".to_string());
    partes.join("\r\n")
}

// Convierte una Fila salida del motor al proyecto exportable que consumen
// los serializadores (misma convención que exportadores.ts).
pub fn proyecto(nombre: &str, filas: Vec<Fila>) -> ProyectoExportable {
    ProyectoExportable { nombre: nombre.to_string(), filas }
}

// --- Tests ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
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
            avance: "100%"
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
      - codigo: "1.3"
        nombre: Entrega
        inicio: "2026-01-12"
        duracion: 1
        predecesoras: "1.2.2"
"#;

    fn filas() -> Vec<Fila> {
        preparar_proyecto(YAML, &OpcionesCpm { cpm: true, inicio_proyecto: None, termino_proyecto: None }).unwrap()
    }

    #[test]
    fn mspdi_text1_y_hierarquia() {
        let p = proyecto("mi proyecto", filas());
        let xml = a_mspdi(&p);
        // el código va en Text1 y el WBS es punteado
        assert!(xml.contains("<Text1>1.1.2</Text1>"));
        assert!(xml.contains("<WBS>1.2</WBS>"));
        assert!(xml.contains("<Summary>1</Summary>"));
        // dependencia fs con lag 0 → PredecessorUID del pred y Type 1
        assert!(xml.contains("<PredecessorUID>3</PredecessorUID>"));
        assert!(xml.contains("<Type>1</Type>"));
    }

    #[test]
    fn pmxml_relaciones_y_calendarios() {
        let p = proyecto("mi proyecto", filas());
        let xml = a_pmxml(&p);
        assert!(xml.contains("<RelationshipType>FinishToStart</RelationshipType>"));
        assert!(xml.contains("<CalendarName>24 Hour Calendar</CalendarName>"));
        assert!(xml.contains("<ParentTaskID>1</ParentTaskID>"));
    }

    #[test]
    fn xer_er_blocks() {
        let p = proyecto("mi proyecto", filas());
        let xer = a_xer(&p);
        assert!(xer.starts_with("EREXP  V95.4.0"));
        assert!(xer.contains("%T\tPROJECT"));
        assert!(xer.contains("%T\tTASK"));
        assert!(xer.contains("%T\tTASKPRED"));
        assert!(xer.contains("PR_FS"));
        assert!(xer.ends_with("%F"));
    }
}