use rusqlite::Connection;
use std::path::Path;

/// Abre (o crea) la base SQLite de un proyecto en `ruta`.
/// Devuelve una conexión con el schema listo.
pub fn abrir(ruta: &Path) -> Result<Connection, String> {
    let conn = Connection::open(ruta).map_err(|e| e.to_string())?;
    schema(&conn)?;
    Ok(conn)
}

pub fn en_memoria() -> Result<Connection, String> {
    let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
    schema(&conn)?;
    Ok(conn)
}

pub fn schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS proyectos (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre    TEXT NOT NULL,
            creado_en TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tareas (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id    INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
            codigo         TEXT NOT NULL,
            nombre         TEXT NOT NULL,
            nivel          INTEGER NOT NULL DEFAULT 0,
            padre_codigo   TEXT,
            duracion       REAL,
            inicio_dias    INTEGER,
            termino_dias   INTEGER,
            avance         REAL NOT NULL DEFAULT 0,
            cantidad       REAL,
            unidad         TEXT,
            costo_unitario REAL,
            costo          REAL,
            formato        TEXT,
            color          TEXT,
            ocultar_subtareas INTEGER NOT NULL DEFAULT 0,
            hito           INTEGER NOT NULL DEFAULT 0,
            orden          INTEGER NOT NULL DEFAULT 0,
            UNIQUE(proyecto_id, codigo)
        );

        CREATE TABLE IF NOT EXISTS dependencias (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id  INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
            tarea_codigo TEXT NOT NULL,
            pred_codigo  TEXT NOT NULL,
            tipo         TEXT NOT NULL DEFAULT 'fs',
            lag          INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS recursos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
            nombre      TEXT NOT NULL,
            capacidad   REAL NOT NULL DEFAULT 8,
            UNIQUE(proyecto_id, nombre)
        );

        CREATE TABLE IF NOT EXISTS asignaciones (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            tarea_id    INTEGER NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
            recurso_id  INTEGER NOT NULL REFERENCES recursos(id) ON DELETE CASCADE,
            cantidad    REAL NOT NULL DEFAULT 1,
            UNIQUE(tarea_id, recurso_id)
        );

        CREATE TABLE IF NOT EXISTS params (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            proyecto_id INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
            clave       TEXT NOT NULL,
            valor       TEXT,
            UNIQUE(proyecto_id, clave)
        );
        "#,
    )
    .map_err(|e| e.to_string())
}

/// Inserta un proyecto y devuelve su id.
pub fn crear_proyecto(conn: &Connection, nombre: &str) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO proyectos (nombre) VALUES (?1)",
        [nombre],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn borrar_proyecto(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM proyectos WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn listar_proyectos(conn: &Connection) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT id, nombre FROM proyectos ORDER BY id")
        .map_err(|e| e.to_string())?;
    let filas = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TareaDb {
    pub codigo: String,
    pub nombre: String,
    pub nivel: i32,
    pub padre_codigo: Option<String>,
    pub duracion: Option<f64>,
    pub inicio_dias: Option<i64>,
    pub termino_dias: Option<i64>,
    pub avance: f64,
    pub cantidad: Option<f64>,
    pub unidad: Option<String>,
    pub costo_unitario: Option<f64>,
    pub costo: Option<f64>,
    pub formato: Option<String>,
    pub color: Option<String>,
    pub ocultar_subtareas: bool,
    pub hito: bool,
}

pub fn insertar_tarea(
    conn: &Connection,
    proyecto_id: i64,
    t: &TareaDb,
    orden: i64,
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO tareas
            (proyecto_id, codigo, nombre, nivel, padre_codigo, duracion,
             inicio_dias, termino_dias, avance, cantidad, unidad,
             costo_unitario, costo, formato, color, ocultar_subtareas,
             hito, orden)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
        ON CONFLICT(proyecto_id, codigo) DO UPDATE SET
            nombre=excluded.nombre,
            nivel=excluded.nivel,
            padre_codigo=excluded.padre_codigo,
            duracion=excluded.duracion,
            inicio_dias=excluded.inicio_dias,
            termino_dias=excluded.termino_dias,
            avance=excluded.avance,
            cantidad=excluded.cantidad,
            unidad=excluded.unidad,
            costo_unitario=excluded.costo_unitario,
            costo=excluded.costo,
            formato=excluded.formato,
            color=excluded.color,
            ocultar_subtareas=excluded.ocultar_subtareas,
            hito=excluded.hito,
            orden=excluded.orden
        "#,
        rusqlite::params![
            proyecto_id, t.codigo, t.nombre, t.nivel, t.padre_codigo, t.duracion,
            t.inicio_dias, t.termino_dias, t.avance, t.cantidad, t.unidad,
            t.costo_unitario, t.costo, t.formato, t.color,
            if t.ocultar_subtareas { 1 } else { 0 },
            if t.hito { 1 } else { 0 },
            orden,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reemplazar_tareas(
    conn: &mut Connection,
    proyecto_id: i64,
    tareas: &[TareaDb],
) -> Result<(), String> {
    conn.execute("DELETE FROM tareas WHERE proyecto_id = ?1", [proyecto_id])
        .map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (i, t) in tareas.iter().enumerate() {
        insertar_tarea(&tx, proyecto_id, t, i as i64)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn cargar_tareas(conn: &Connection, proyecto_id: i64) -> Result<Vec<TareaDb>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT codigo, nombre, nivel, padre_codigo, duracion,
                   inicio_dias, termino_dias, avance, cantidad, unidad,
                   costo_unitario, costo, formato, color, ocultar_subtareas, hito
            FROM tareas
            WHERE proyecto_id = ?1
            ORDER BY orden
            "#,
        )
        .map_err(|e| e.to_string())?;
    let filas = stmt
        .query_map([proyecto_id], |r| {
            Ok(TareaDb {
                codigo: r.get(0)?,
                nombre: r.get(1)?,
                nivel: r.get(2)?,
                padre_codigo: r.get(3)?,
                duracion: r.get(4)?,
                inicio_dias: r.get(5)?,
                termino_dias: r.get(6)?,
                avance: r.get(7)?,
                cantidad: r.get(8)?,
                unidad: r.get(9)?,
                costo_unitario: r.get(10)?,
                costo: r.get(11)?,
                formato: r.get(12)?,
                color: r.get(13)?,
                ocultar_subtareas: r.get::<_, i64>(14)? != 0,
                hito: r.get::<_, i64>(15)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn insertar_dependencia(
    conn: &Connection,
    proyecto_id: i64,
    tarea_codigo: &str,
    dep: &super::modelo::Dep,
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO dependencias (proyecto_id, tarea_codigo, pred_codigo, tipo, lag)
        VALUES (?1,?2,?3,?4,?5)
        ON CONFLICT(proyecto_id, tarea_codigo, pred_codigo) DO UPDATE SET
            tipo=excluded.tipo, lag=excluded.lag
        "#,
        rusqlite::params![
            proyecto_id, tarea_codigo, dep.pred, dep.tipo.as_str(), dep.lag
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn reemplazar_dependencias(
    conn: &mut Connection,
    proyecto_id: i64,
    deps: &[super::modelo::Dep],
) -> Result<(), String> {
    conn.execute("DELETE FROM dependencias WHERE proyecto_id = ?1", [proyecto_id])
        .map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for d in deps {
        insertar_dependencia(&tx, proyecto_id, &d.pred, &super::modelo::Dep {
            pred: d.pred.clone(),
            tipo: super::modelo::TipoDep::Fs,
            lag: d.lag,
        })?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn guardar_param(conn: &Connection, proyecto_id: i64, clave: &str, valor: &str) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO params (proyecto_id, clave, valor) VALUES (?1,?2,?3)
        ON CONFLICT(proyecto_id, clave) DO UPDATE SET valor=excluded.valor
        "#,
        rusqlite::params![proyecto_id, clave, valor],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn cargar_params(conn: &Connection, proyecto_id: i64) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT clave, valor FROM params WHERE proyecto_id = ?1")
        .map_err(|e| e.to_string())?;
    let filas = stmt
        .query_map([proyecto_id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for f in filas {
        out.push(f.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alta_y_relectura() {
        let mut conn = en_memoria().unwrap();
        let pid = crear_proyecto(&conn, "prueba").unwrap();
        let t = TareaDb {
            codigo: "1".into(),
            nombre: "Tarea 1".into(),
            nivel: 0,
            padre_codigo: None,
            duracion: Some(3.0),
            inicio_dias: Some(20458),
            termino_dias: Some(20460),
            avance: 0.5,
            cantidad: Some(2.0),
            unidad: Some("un".into()),
            costo_unitario: Some(100.0),
            costo: None,
            formato: None,
            color: None,
            ocultar_subtareas: false,
            hito: false,
        };
        reemplazar_tareas(&mut conn, pid, &[t]).unwrap();
        let cargadas = cargar_tareas(&conn, pid).unwrap();
        assert_eq!(cargadas.len(), 1);
        assert_eq!(cargadas[0].codigo, "1");
        assert_eq!(cargadas[0].costo.unwrap_or(0.0) as i64, 0);
        guardar_param(&conn, pid, "titulo", "mi proyecto").unwrap();
        let params = cargar_params(&conn, pid).unwrap();
        assert_eq!(params, vec![("titulo".to_string(), "mi proyecto".to_string())]);
        borrar_proyecto(&conn, pid).unwrap();
        assert!(listar_proyectos(&conn).unwrap().is_empty());
    }
}