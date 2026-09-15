// ejemplo-cpm-ids.typ
// Igual red que ejemplo-cpm.typ, pero con `id` persistente: las tareas
// llevan un id estable ("A".."D") y las `predecesoras` referencian esos
// ids. El motor resuelve las flechas por id (el `codigo` puede cambiar al
// reordenar sin romper la red) y las filas exponen `id`.

#import "@local/gantt:0.1.0": carta-gantt, preparar-tareas, a-dia-juliano

#let tareas = (
  (codigo: "1", id: "A", nombre: "Cimentación", inicio: "2026-01-05", duracion: 5),
  (codigo: "1.1", id: "B", nombre: "Obra gruesa", duracion: 4, predecesoras: "A"),
  (codigo: "1.2", id: "C", nombre: "Compras", duracion: 3, predecesoras: "A:ss:2"),
  (codigo: "1.3", id: "D", nombre: "Techado", duracion: 2, predecesoras: "B;C"),
)

#let filas = preparar-tareas(tareas, cpm: true)
#let fila(c) = filas.find(f => f.codigo == c)
#let fila-id(id) = filas.find(f => f.id == id)

// El campo `id` llega a cada fila resuelta
#assert(fila("1").id == "A", message: "la fila 1 debe conservar su id A")
#assert(fila-id("B") != none, message: "el id B debe existir en las filas")

// Las dependencias escritas por id se resuelven igual que por código
#assert(fila-id("B").inicio-temprano-dias == a-dia-juliano("2026-01-10"), message: "B debería iniciar el 2026-01-10")
#assert(fila-id("C").inicio-temprano-dias == a-dia-juliano("2026-01-07"), message: "C debería iniciar el 2026-01-07")
#assert(fila-id("D").inicio-temprano-dias == a-dia-juliano("2026-01-14"), message: "D debería iniciar el 2026-01-14")
#assert(fila-id("D").holgura == 0, message: "D es crítica con holgura 0")

// Las predecesoras de salida quedan expresadas por el id efectivo
#let preds-d = fila-id("D").predecesoras.map(p => p.pred)
#assert("B" in preds-d and "C" in preds-d, message: "D debe depender de los ids B y C")

#carta-gantt(
  tareas,
  titulo: [Cronograma con CPM — ids persistentes],
  cpm: true,
  mostrar-duracion: true,
  mostrar-columnas: ("inicio", "duracion", "holgura", "critico"),
  nivel-anio: false,
  nivel-semana: true,
  nivel-dia: true,
)