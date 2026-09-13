// ejemplo-vinculos.typ — clic hacia el editor (VS Code / VSCodium).
//
// Cómo probarlo:
//   1. Asegúrate de que VS Code (o VSCodium) tenga registrado su URI handler
//      (vscode://... / vscodium://...; en Windows se registra al instalarlo).
//   2. Compila este archivo y abre el PDF con un visor que ejecute los
//      enlaces con esquema personalizado (SumatraPDF, PDF-XChange, Okular...;
//      MS Edge y Chrome bloquean los URI "vscode://" en PDFs).
//   3. Clic en el nombre, en una celda de fecha o en la barra de una tarea:
//      se abre su línea en tareas-vinculos.yaml dentro del editor.
//
// `vinculos-desde-texto` escanea el texto y devuelve codigo -> (archivo, lí-
// nea); `carta-gantt` arma el URI con su parámetro `esquema-vinculo`
// (default "vscodium"; usa "vscode" para VS Code). Si prefieres control
// total, cada tarea puede traer su propio campo `vinculo: "vscodium://..."`.

#import "@local/gantt:0.1.0": carta-gantt, vinculos-desde-texto

// La única ruta ABSOLUTA es la carpeta del PDF/proyecto (`ruta-pdf`); el
// resto se arma con el nombre relativo. Si mueves la carpeta, cambias una
// sola línea. Typst solo puede LEER rutas relativas al documento (root de
// compilación); el URI que abre el editor se fabrica como cadena con la
// ruta absoluta, sin cargarla.
#let ruta-pdf = "D:/Gantt_typ/ejemplos"
#let ruta-lectura = "tareas-vinculos.yaml"

#let datos = yaml(ruta-lectura)
#let vinculos = vinculos-desde-texto(read(ruta-lectura), ruta-pdf + "/" + ruta-lectura)

#carta-gantt(
  datos,
  titulo: [Salto a línea en el editor — clic sobre cualquier tarea],
  cpm: true,
  vinculos: vinculos,
  ancho-linea-tiempo: 22cm,
  nivel-anio: true,
  nivel-mes: true,
  nivel-semana: false,
  nivel-dia: false,
  mostrar-duracion: true,
  mostrar-columnas: ("inicio", "duracion"),
)