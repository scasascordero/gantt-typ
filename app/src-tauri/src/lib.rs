use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::Serialize;
use tauri::Manager;

use dominio::db;
use dominio::exportar;
use dominio::modelo::{Dep, Fila, OpcionesCpm, TipoDep};
use dominio::preparar::preparar_proyecto;

#[derive(Serialize)]
struct ArchivoAbierto {
    ruta: String,
    contenido: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProyectoInfo {
    id: i64,
    nombre: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct DepEntrada {
    tarea_codigo: String,
    pred: String,
    tipo: String,
    lag: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DepConTarea {
    tarea_codigo: String,
    pred: String,
    tipo: String,
    lag: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProyectoCompleto {
    tareas: Vec<db::TareaDb>,
    deps: Vec<DepConTarea>,
    params: Vec<(String, String)>,
}

// Motor en Rust: calcula la lista de filas (misma API que proyecto.ts).
// Se invoca en un hilo para no bloquear la UI con YAML/CPM grandes.
#[tauri::command]
async fn preparar_filas(
    texto: String,
    cpm: bool,
    inicio_proyecto: Option<String>,
    termino_proyecto: Option<String>,
) -> Result<Vec<Fila>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        preparar_proyecto(
            &texto,
            &OpcionesCpm {
                cpm,
                inicio_proyecto,
                termino_proyecto,
            },
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn abrir_archivo() -> Result<Option<ArchivoAbierto>, String> {
    let elegido = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .add_filter("YAML", &["yaml", "yml"])
            .add_filter("CSV", &["csv"])
            .add_filter("Texto", &["txt", "typ"])
            .add_filter("Todos", &["*"])
            .pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    let ruta = match elegido {
        Some(r) => r,
        None => return Ok(None),
    };

    let contenido = std::fs::read_to_string(&ruta)
        .map_err(|e| format!("no se pudo leer '{}': {e}", ruta.display()))?;

    Ok(Some(ArchivoAbierto {
        ruta: ruta.to_string_lossy().to_string(),
        contenido,
    }))
}

#[tauri::command]
async fn guardar_archivo(
    ruta: Option<String>,
    contenido: String,
    nombre: Option<String>,
) -> Result<Option<String>, String> {
    let ruta = match ruta {
        Some(r) => PathBuf::from(r),
        None => {
            let nombre_dialogo = nombre.clone().unwrap_or_else(|| "carta-gantt.yaml".to_string());
            let elegido = tauri::async_runtime::spawn_blocking(move || {
                rfd::FileDialog::new()
                    .set_file_name(&nombre_dialogo)
                    .add_filter("YAML", &["yaml", "yml"])
                    .add_filter("XML", &["xml"])
                    .add_filter("SVG", &["svg"])
                    .add_filter("Todos", &["*"])
                    .save_file()
            })
            .await
            .map_err(|e| e.to_string())?;

            match elegido {
                Some(r) => r,
                None => return Ok(None),
            }
        }
    };

    std::fs::write(&ruta, contenido)
        .map_err(|e| format!("no se pudo guardar '{}': {e}", ruta.display()))?;

    Ok(Some(ruta.to_string_lossy().to_string()))
}

// Muestra el diálogo "Guardar como" sin escribir nada: devuelve la ruta
// elegida (el nombre propuesto puede editarse para no pisar archivos).
#[tauri::command]
async fn elegir_destino(
    nombre: Option<String>,
    carpeta: Option<String>,
) -> Result<Option<String>, String> {
    let elegido = tauri::async_runtime::spawn_blocking(move || {
        let mut dialogo = rfd::FileDialog::new();
        if let Some(n) = nombre {
            dialogo = dialogo.set_file_name(n);
        }
        if let Some(c) = carpeta {
            dialogo = dialogo.set_directory(c);
        }
        dialogo
            .add_filter("Documentos", &["pdf", "svg", "xml", "xer"])
            .add_filter("Todos", &["*"])
            .save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(elegido.map(|r| r.to_string_lossy().to_string()))
}

#[tauri::command]
async fn exportar_pdf(
    plantilla: String,
    yaml: String,
    fuentes: HashMap<String, String>,
    destino: Option<String>,
) -> Result<String, String> {
    let milis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let carpeta = std::env::temp_dir().join(format!("gantt-viewer-{milis}"));
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;

    std::fs::write(carpeta.join("datos.yaml"), yaml).map_err(|e| e.to_string())?;
    std::fs::write(carpeta.join("main.typ"), plantilla).map_err(|e| e.to_string())?;
    for (nombre, contenido) in &fuentes {
        if nombre.ends_with(".typ") {
            std::fs::write(carpeta.join(nombre), contenido).map_err(|e| e.to_string())?;
        }
    }

    let salida = carpeta.join("carta-gantt.pdf");
    let resultado = std::process::Command::new("typst")
        .current_dir(&carpeta)
        .args(["compile", "main.typ"])
        .arg(&salida)
        .output()
        .map_err(|e| format!("no se pudo ejecutar `typst`: {e}"))?;

    if !resultado.status.success() {
        let stderr = String::from_utf8_lossy(&resultado.stderr);
        let stdout = String::from_utf8_lossy(&resultado.stdout);
        return Err(format!("typst falló:\n{stdout}{stderr}"));
    }

    let ruta = match destino {
        Some(d) => {
            let destino_path = PathBuf::from(&d);
            if let Some(padre) = destino_path.parent() {
                let _ = std::fs::create_dir_all(padre);
            }
            std::fs::copy(&salida, &destino_path)
                .map_err(|e| format!("no se pudo copiar a '{}': {e}", destino_path.display()))?;
            destino_path.to_string_lossy().to_string()
        }
        None => salida.to_string_lossy().to_string(),
    };
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &ruta])
        .spawn()
        .map_err(|e| format!("no se pudo abrir el PDF: {e}"))?;

    Ok(ruta)
}

// --- CRUD SQLite (persistencia por proyecto) --------------------------------

#[tauri::command]
async fn crear_proyecto(
    estado: tauri::State<'_, Mutex<rusqlite::Connection>>,
    nombre: String,
) -> Result<i64, String> {
    let conn = estado.lock().map_err(|e| e.to_string())?;
    db::crear_proyecto(&conn, &nombre)
}

#[tauri::command]
async fn borrar_proyecto(
    estado: tauri::State<'_, Mutex<rusqlite::Connection>>,
    id: i64,
) -> Result<(), String> {
    let conn = estado.lock().map_err(|e| e.to_string())?;
    db::borrar_proyecto(&conn, id)
}

#[tauri::command]
async fn listar_proyectos(
    estado: tauri::State<'_, Mutex<rusqlite::Connection>>,
) -> Result<Vec<ProyectoInfo>, String> {
    let conn = estado.lock().map_err(|e| e.to_string())?;
    let filas = db::listar_proyectos(&conn)?;
    Ok(filas.iter().map(|(id, nombre)| ProyectoInfo { id: *id, nombre: nombre.clone() }).collect())
}

// Reemplaza de una vez tareas, dependencias y params del proyecto (upsert
// de tareas, recarga de deps y params sin borrar el resto).
#[tauri::command]
async fn guardar_proyecto(
    estado: tauri::State<'_, Mutex<rusqlite::Connection>>,
    id: i64,
    tareas: Vec<db::TareaDb>,
    deps: Vec<DepEntrada>,
    params: Option<Vec<(String, String)>>,
) -> Result<(), String> {
    let mut conn = estado.lock().map_err(|e| e.to_string())?;
    db::reemplazar_tareas(&mut conn, id, &tareas)?;

    let deps_rust: Vec<(String, Dep)> = deps
        .iter()
        .map(|d| {
            (
                d.tarea_codigo.clone(),
                Dep {
                    pred: d.pred.clone(),
                    tipo: TipoDep::parse(&d.tipo).map_err(|e| e.to_string()).unwrap_or(TipoDep::Fs),
                    lag: d.lag,
                },
            )
        })
        .collect();
    db::reemplazar_dependencias(&mut conn, id, &deps_rust)?;

    if let Some(params) = params {
        conn.execute("DELETE FROM params WHERE proyecto_id = ?1", [id]).map_err(|e| e.to_string())?;
        for (clave, valor) in &params {
            db::guardar_param(&conn, id, clave, valor)?;
        }
    }
    Ok(())
}

// Devuelve tareas + dependencias + params del proyecto. Las deps vienen
// como lista plana de DepJson (pred/tipo/lag), aunque el modelo las agrupe
// por tarea; la app rearma el agrupamiento según la fila que corresponda.
#[tauri::command]
async fn cargar_proyecto(
    estado: tauri::State<'_, Mutex<rusqlite::Connection>>,
    id: i64,
) -> Result<ProyectoCompleto, String> {
    let conn = estado.lock().map_err(|e| e.to_string())?;
    let tareas = db::cargar_tareas(&conn, id)?;

    let mut stmt = conn
        .prepare(
            "SELECT tarea_codigo, pred_codigo, tipo, lag
             FROM dependencias WHERE proyecto_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let filas = stmt
        .query_map([id], |r| {
            Ok(DepConTarea {
                tarea_codigo: r.get(0)?,
                pred: r.get(1)?,
                tipo: r.get(2)?,
                lag: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut deps = Vec::new();
    for f in filas {
        deps.push(f.map_err(|e| e.to_string())?);
    }

    let params = db::cargar_params(&conn, id)?;
    Ok(ProyectoCompleto { tareas, deps, params })
}

// --- Exportadores en Rust ---------------------------------------------------

// Exporta el plan a un documento de texto (mspdi | pmxml | xer): prepara las
// filas con el motor y serializa con la misma convención que exportadores.ts.
#[tauri::command]
async fn exportar_plan(
    texto: String,
    formato: String,
    inicio_proyecto: Option<String>,
    termino_proyecto: Option<String>,
) -> Result<String, String> {
    let filas = preparar_proyecto(
        &texto,
        &OpcionesCpm {
            cpm: true,
            inicio_proyecto,
            termino_proyecto,
        },
    )?;
    let nombre = extraer_nombre(&texto).unwrap_or_else(|| "proyecto".to_string());
    let p = exportar::proyecto(&nombre, filas);
    match formato.as_str() {
        "mspdi" => Ok(exportar::a_mspdi(&p)),
        "pmxml" => Ok(exportar::a_pmxml(&p)),
        "xer" => Ok(exportar::a_xer(&p)),
        _ => Err(format!("formato de exportación inválido: '{formato}'")),
    }
}

// Devuelve el YAML resuelto (fechas + CPM + passthrough) que consume Typst
// directamente, sin volver a llamar a preparar-tareas.
#[tauri::command]
async fn filas_a_yaml(
    texto: String,
    cpm: bool,
    inicio_proyecto: Option<String>,
    termino_proyecto: Option<String>,
) -> Result<String, String> {
    let filas = preparar_proyecto(
        &texto,
        &OpcionesCpm {
            cpm,
            inicio_proyecto,
            termino_proyecto,
        },
    )?;
    Ok(dominio::inyeccion::filas_a_yaml(&filas))
}

// Primer nombre razonable para el proyecto exportado: el campo 'nombre' de
// la raíz, el primer título de nivel 0 o un nombre genérico.
fn extraer_nombre(texto: &str) -> Option<String> {
    let raiz: serde_yaml::Value = serde_yaml::from_str(texto).ok()?;
    let lista = match &raiz {
        serde_yaml::Value::Sequence(_) => &raiz,
        serde_yaml::Value::Mapping(m) => m.get(&serde_yaml::Value::String("tareas".to_string()))?,
        _ => return None,
    };
    let seq = lista.as_sequence()?;
    for t in seq {
        let m = t.as_mapping()?;
        if let Some(n) = m.get(&serde_yaml::Value::String("nombre".to_string())) {
            if let Some(s) = n.as_str() {
                if !s.trim().is_empty() {
                    return Some(s.to_string());
                }
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Una sola conexión SQLite compartida bajo el directorio de datos
            // de la app. La db se abre (creando) y queda gestionada como estado.
            let ruta_db = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("gantt-editor.db");
            if let Some(padre) = ruta_db.parent() {
                let _ = std::fs::create_dir_all(padre);
            }
            let conn = db::abrir(&ruta_db)?;
            app.manage(Mutex::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            exportar_pdf,
            elegir_destino,
            abrir_archivo,
            guardar_archivo,
            preparar_filas,
            crear_proyecto,
            borrar_proyecto,
            listar_proyectos,
            guardar_proyecto,
            cargar_proyecto,
            exportar_plan,
            filas_a_yaml
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}