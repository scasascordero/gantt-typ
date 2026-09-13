use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
async fn exportar_pdf(
    plantilla: String,
    yaml: String,
    fuentes: HashMap<String, String>,
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

    let ruta = salida.to_string_lossy().to_string();
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
        .invoke_handler(tauri::generate_handler![exportar_pdf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}