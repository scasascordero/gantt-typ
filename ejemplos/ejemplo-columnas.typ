#import "@local/gantt:0.1.0": carta-gantt, vinculos-desde-texto

// Vínculos al editor (VS Code / VSCodium): un clic en una fila abre su línea
// en datos.yaml. La única ruta ABSOLUTA es la carpeta del PDF/proyecto
// (`ruta-pdf`); el resto se arma con nombres relativos. Si mueves la carpeta,
// cambias un solo literal. Esquema default de carta-gantt: "vscodium".
#let ruta-pdf = "D:/Gantt_typ/ejemplos"
#let ruta-lectura = "datos.yaml"

#carta-gantt(
  yaml(ruta-lectura),
  vinculos: vinculos-desde-texto(read(ruta-lectura), ruta-pdf + "/" + ruta-lectura),
  titulo: [Cronograma con columnas de datos],
  mostrar-columnas: ("inicio", "termino", "duracion", "avance"),
)
