use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use serde::Serialize;

#[derive(Serialize)]
struct ArchivoAbierto {
    ruta: String,
    contenido: String,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            exportar_pdf,
            elegir_destino,
            abrir_archivo,
            guardar_archivo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}