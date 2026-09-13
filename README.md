# gantt.typ — Cartas Gantt en Typst sin paquetes externos

Librería para dibujar cartas Gantt en [Typst](https://typst.app) usando
**únicamente funciones nativas**: `place`, `line`, `rect` y `measure` para
el dibujo (más `rotate`, `stack`, `box`, también nativos de Typst), y
`yaml()` / `csv()` para leer los datos. No hay ninguna dependencia de red
ni de ningún paquete de `@preview`: `lib/` se instala como paquete
**local** (`@local/gantt`), resuelto enteramente desde tu propio disco.

## Estructura

```
lib/
  typst.toml   -> manifiesto del paquete local @local/gantt:0.1.0
  fechas.typ   -> aritmética de fechas (parseo, suma/resta de días, formato)
  datos.typ    -> lectura y normalización de tareas (jerarquía, rollup)
  cpm.typ      -> motor CPM: pase hacia adelante/atrás, holguras, ruta crítica
  dibujo.typ   -> primitivas de dibujo (linea, caja, rombo, texto)
  gantt.typ    -> función pública carta-gantt() (entrypoint del paquete)
ejemplos/
  datos.yaml, datos.csv       -> datos de ejemplo (con subtareas e hitos)
  ejemplo-yaml.typ            -> carta-gantt() leyendo un .yaml
  ejemplo-csv.typ             -> carta-gantt() leyendo un .csv (p. ej. de Excel)
  ejemplo-largo.typ           -> 60 tareas / 2 años, datos generados en Typst, línea de "hoy"
  ejemplo-niveles.typ         -> niveles año/mes/semana/día, ventana de tiempo, duración
  ejemplo-niveles-ocultos.typ -> mostrar-niveles: oculta subtareas por completo
  ejemplo-avance-serie.typ    -> avance como serie de incrementos acumulados
  ejemplo-columnas.typ        -> columnas de datos (inicio, término, duración, avance)
  ejemplo-insertado.typ       -> pagina: false, insertada en un documento con su propia página
  ejemplo-cpm.typ             -> CPM: fechas calculadas desde predecesoras + ruta crítica + flechas
  ejemplo-cpm-proyecto.typ    -> CPM a 2 años (~20 tareas en 4 frentes), cabecera solo años y meses
  ejemplo-vinculos.typ        -> clic en una tarea -> salta a su línea en tareas-vinculos.yaml (VS Code)
  tareas-vinculos.yaml        -> datos de ejemplo del salto a línea
herramientas/
  xlsx_a_datos.py              -> conversor opcional Excel -> yaml/csv
```

## Instalación (una sola vez)

`lib/` está publicado como **paquete local de Typst** (`@local/gantt`),
no como carpeta que hay que importar con rutas relativas. Esto es lo que
permite abrir cualquier archivo de `ejemplos/` suelto —en la terminal, en
VS Code, en VSCodium, en cualquier preview— sin configurar `--root` ni
nada parecido: los paquetes se resuelven desde una carpeta especial del
sistema, fuera del "sandbox" del proyecto.

Para instalarlo, crea un enlace simbólico desde la carpeta de paquetes
locales de Typst hacia `lib/` (así cualquier cambio en `lib/*.typ` se
refleja al instante, sin reinstalar nada). En Windows, con PowerShell:

```powershell
New-Item -ItemType SymbolicLink `
  -Path "$env:LOCALAPPDATA\typst\packages\local\gantt\0.1.0" `
  -Target "D:\Gantt_typ\lib"
```

(Ajusta la ruta `-Target` a donde tengas este proyecto.) Si el comando
falla por permisos, activa "Modo de desarrollador" en Windows
(Configuración → Privacidad y seguridad → Para desarrolladores) o corre
PowerShell como administrador. **No uses `ln -s` de Git Bash/MSYS para
esto**: sin privilegios crea una copia común en vez de un enlace real, y
los cambios en `lib/` dejan de reflejarse.

En Linux/macOS, el enlace equivalente es:

```bash
mkdir -p ~/.local/share/typst/packages/local/gantt   # Linux
ln -s /ruta/a/Gantt_typ/lib ~/.local/share/typst/packages/local/gantt/0.1.0
```

Verificá que quedó bien:

```bash
typst compile ejemplos/ejemplo-yaml.typ
```

Si compila sin pasar `--root`, quedó instalado correctamente. Si tu
editor (VS Code/VSCodium con la extensión de Typst) seguía abierto desde
antes de crear el enlace y da *"package not found"*, recargá la ventana o
reiniciá la extensión — algunos servidores de lenguaje cachean la lista
de paquetes locales al arrancar.

## Uso rápido

```typst
#import "@local/gantt:0.1.0": carta-gantt

// yaml()/csv() son nativos de Typst: se resuelven relativos a ESTE
// archivo, no a la librería, así que no hace falta --root para nada.
#carta-gantt(
  yaml("datos.yaml"),
  titulo: [Cronograma de Proyecto],
)
```

Compila (o previsualiza en tu editor) sin ningún flag extra:

```bash
typst compile ejemplos/ejemplo-yaml.typ
```

**Importante:** pasa siempre el resultado de `yaml(...)`/`csv(..., row-type: dictionary)`
directamente a `carta-gantt(...)`, llamándolos en tu propio archivo — no
dentro de una función de la librería. Typst resuelve las rutas de
`yaml()`/`csv()`/`read()` relativas al archivo donde esa línea está
escrita; si la lectura ocurriera dentro de `lib/datos.typ` (como hacían
`leer-yaml`/`leer-csv` en versiones anteriores), la ruta se buscaría
junto a la librería instalada, no junto a tu archivo. `leer-yaml`/
`leer-csv` se mantienen en `datos.typ` solo por compatibilidad —usa
`yaml()`/`csv()` nativos en los archivos nuevos.

Por defecto (`pagina: true`), la página se dimensiona automáticamente
(ancho y alto, con margen de 1 cm en los cuatro bordes) para que toda la
carta —título, encabezado de fechas y todas las filas— quepa en una sola
página sin recortes, sin importar cuántas tareas tenga. Este modo es para
cuando el archivo `.typ` **es** la carta Gantt (nada más).

### Insertar la carta en un documento existente

Si en cambio querés poner la carta dentro de un documento con su propia
página, título, texto, etc. (un informe, por ejemplo), usá `pagina: false`.
Ahí la carta no toca la página: se inserta como un bloque más, usando por
defecto el ancho disponible del documento en ese punto (lo que hay entre
los márgenes ya configurados con tu propio `#set page(...)`):

```typst
#set page(paper: "a4", margin: 2cm)

= Informe de avance

Texto normal antes de la carta...

#carta-gantt(
  yaml("datos.yaml"),
  pagina: false,
  titulo: [Cronograma],
)

Texto normal después, en la misma página o en la siguiente si no entra.
```

Ver [ejemplos/ejemplo-insertado.typ](ejemplos/ejemplo-insertado.typ). Si
en vez del ancho de la página querés un ancho fijo, pasá
`ancho-linea-tiempo` explícito (p. ej. `12cm`) en vez de dejarlo en `auto`.

## Formato de los datos

Cada tarea admite estas columnas (solo `codigo`, `nombre` e `inicio` son
obligatorias en una tarea sin subtareas):

| Campo      | Descripción                                                            |
|------------|-------------------------------------------------------------------------|
| `codigo`   | Identificador (texto o número, p. ej. `"1"`, `"1.2"`)                   |
| `nombre`   | Nombre de la tarea                                                       |
| `duracion` | Duración en días (entero)                                                |
| `inicio`   | Fecha de inicio, `"AAAA-MM-DD"`                                          |
| `termino`  | Fecha de término, `"AAAA-MM-DD"`                                         |
| `avance`   | 0–1 (o 0–100, se detecta automáticamente), **o una serie de incrementos** — ver abajo |
| `padre`    | `codigo` de la tarea madre (para subtareas en formato plano/Excel)       |
| `subtareas`| Lista anidada de tareas hijas (alternativa a `padre`, cómoda en YAML)    |
| `hito`     | `true` para forzar que se dibuje como hito (rombo) aunque tenga duración |
| `predecesoras` | Dependencias para el CPM (ver "CPM") — solo tiene efecto con `cpm: true` |
| `vinculo`      | URI (p. ej. `vscode://file/...`) con el que se vuelve clicable la fila (nombre, celdas y barra) para abrir la línea correspondiente en tu editor — ver "Salto a línea en el editor" |

Basta con **inicio + duracion**, o **inicio + termino** — lo que falte se
calcula solo. Si no se da ni `duracion` ni `termino`, la tarea se dibuja
como **hito** (rombo). Con `cpm: true`, `inicio` deja de ser obligatorio
para las tareas que tienen `predecesoras`: su arranque se **calcula** desde
la red (ver sección siguiente).

### Subtareas y "rollup" automático

Una tarea con subtareas (por `padre` o por `subtareas:` anidado) se
dibuja como **barra resumen**: misma altura que una tarea normal, pero
transparente (solo el contorno) para no competir visualmente con sus
hijas. Si no le das `inicio`/`termino`/`avance` explícitos, se calculan
solos a partir de sus hijas:

- `inicio` = la fecha de inicio más temprana de las subtareas.
- `termino` = la fecha de término más tardía de las subtareas.
- `avance`  = promedio de las subtareas ponderado por su duración.

Esto es recursivo (una subtarea puede a su vez tener sub-subtareas).

### Avance como serie de incrementos

En vez de un solo número, `avance` puede ser una **serie de incrementos
que se van acumulando** a lo largo de la tarea — útil para registrar
cuánto avanzó en cada periodo de reporte (semana, sprint, hito de
control, etc.) en vez de un único porcentaje acumulado. Se escribe como
lista en YAML, o como texto separado por `;` en CSV/Excel:

```yaml
avance: [0.1, 0.2, 0.15, 0.2]   # 10% + 20% + 15% + 20% = 65% en total
```
```csv
avance
0.1;0.2;0.15;0.2
```

El avance final (el que ves en la columna `avance` o en el rollup de la
tarea madre) es la suma de la serie — en el ejemplo, 65%. La barra de
avance se dibuja como una serie de bloques contiguos, con ancho
proporcional a cada incremento, todos del mismo color (`color-avance`),
alternando arriba/abajo (patrón en zigzag): cada bloque usa 1/6 de la
altura de la barra principal, así que entre un bloque de arriba y uno de
abajo siguen ocupando en total el mismo 1/3 que un avance de número
único. Ver [ejemplos/ejemplo-avance-serie.typ](ejemplos/ejemplo-avance-serie.typ).

### Ejemplo en YAML (anidado)

```yaml
tareas:
  - codigo: "1"
    nombre: Ingeniería
    inicio: 2026-01-05
    subtareas:
      - codigo: "1.1"
        nombre: Levantamiento de requerimientos
        inicio: 2026-01-05
        duracion: 10
        avance: 1.0
      - codigo: "1.2"
        nombre: Diseño de arquitectura
        inicio: 2026-01-15
        duracion: 15
        avance: 0.6
  - codigo: "2"
    nombre: "Hito: permisos aprobados"
    inicio: 2026-03-18
```

### Ejemplo en CSV / Excel (plano, con columna `padre`)

```csv
codigo,nombre,duracion,inicio,termino,avance,padre
1,Ingeniería,,,,,
1.1,Levantamiento de requerimientos,10,2026-01-05,,1.0,1
1.2,Diseño de arquitectura,15,2026-01-15,,0.6,1
2,Hito: permisos aprobados,,2026-03-18,,,
```

## CPM: ruta crítica y dependencias

Con `cpm: true` la librería **calcula las fechas de las tareas desde sus
dependencias** en vez de pedir `inicio` explícito. Para cada tarea se
obtienen el inicio/termino temprano y tardío (`inicio-temprano-dias`,
`termino-temprano-dias`, `inicio-tardio-dias`, `termino-tardio-dias`), la
**holgura** (días que puede demorar sin afectar el final del proyecto) y el
flag `critico` (holgura 0 → ruta crítica), y se pueden dibujar **flechas de
dependencia** entre las barras.

### Campo `predecesoras`

Cada tarea puede declarar una o más predecesoras. El formato admite:

- En YAML/tipado, una lista de textos `"codigo[:tipo[:lag]]"`, o de mapas
  `{ codigo, tipo, lag }`:
  ```yaml
  tareas:
    - codigo: B
      nombre: Obra gruesa
      duracion: 4
      predecesoras: ["A"]
    - codigo: C
      nombre: Compras
      duracion: 3
      predecesoras: ["A:ss:2"]
    - codigo: D
      nombre: Techado
      duracion: 2
      predecesoras: ["B;C"]
  ```
- En CSV/Excel, texto separado por `;` en la columna `predecesoras`:
  ```csv
  codigo,nombre,duracion,predecesoras
  B,Obra gruesa,4,"A"
  C,Compras,3,"A:ss:2"
  D,Techado,2,"B;C"
  ```

Tipos de dependencia (`tipo`, por defecto `fs`):

| Tipo | Significado                              |
|------|------------------------------------------|
| `fs` | **fin a inicio**: la sucesora empieza el día siguiente al fin de la predecesora (o `lag` días después) |
| `ss` | **inicio a inicio**: la sucesora no empieza antes del inicio de la predecesora + `lag` |
| `ff` | **fin a fin**: la sucesora no termina antes del fin de la predecesora + `lag` |
| `sf` | **inicio a fin**: la sucesora no termina antes del inicio de la predecesora + `lag` |

`lag` es un entero (días, puede ser negativo para adelantar). Internamente
todo se trabaja con "día juliano" (número entero consecutivo); una tarea de
duración `d` que empieza el día `es` termina el día `es + d − 1`.

### Fechas de referencia y anclas

- Las tareas **sin predecesoras** y **con `inicio`/`termino` explícito**
  son "anclas": su fecha es fija y de ellas cuelga el resto.
- Si además se pasa `inicio-proyecto`, se usa como arranque base; si se pasa
  `termino-proyecto`, fija el fin del proyecto para el cómputo de holguras.
  Sin ellos, se toman del mínimo/máximo calculado.
- **Los hitos** (sin duración) duran 1 día.

### Ruta crítica

Se pinta de rojo (`color-critico`) si `resaltar-critico: true` (por
defecto). Las flechas entre barras se dibujan con `mostrar-dependencias:
true` (por defecto) en `color-dependencia`. Las columnas de la tabla de
datos admiten además `inicio-temprano`, `termino-temprano`,
`inicio-tardio`, `termino-tardio`, `holgura` y `critico`.

### Reglas con jerarquías

- **Solo participan en la red las tareas hoja** (sin subtareas): las tareas
  con hijas son "sobres" y no aparecen como predecesoras/sucesoras.
- Una tarea con subtareas es **crítica si alguna de sus hijas lo es**; su
  `holgura` queda indefinida.
- Una `predecesoras` que apunte a una tarea desconocida o a una tarea con
  subtareas detiene la compilación con un `assert` (para cazar datos mal
  escritos), y una **red con ciclos** falla con un `panic` que lista las
  tareas involucradas.

Ver [ejemplos/ejemplo-cpm.typ](ejemplos/ejemplo-cpm.typ).

## Salto a línea en el editor (VS Code / VSCodium)

Para que un clic en el PDF abra la **línea correspondiente** de tus datos
(un YAML, o el propio `.typ`), se usa el URI handler nativo del editor:
`vscode://file/<ruta>:<linea>` (VS Code) o `vscodium://file/<ruta>:<linea>`
(VSCodium). La librería ofrece:

- `url-vscode(archivo, linea, esquema: "vscodium")` — fabrica el URI
  (codifica `:`, espacios, `#`, etc.; `esquema: "vscode"` para VS Code).
- `vinculos-desde-texto(texto, archivo)` — escanea el texto y devuelve un
  dict `codigo -> (archivo, linea)` con la primera línea donde aparece cada
  `codigo` (funciona con YAML o Typst; las menciones en `predecesoras` no
  crean vínculos porque solo cuentan las líneas con la llave `codigo`).
- Parámetros `vinculos:` y `esquema-vinculo:` de `carta-gantt` — el dict les
  da las ubicaciones y la carta arma el URI con `esquema-vinculo` (default
  `"vscodium"`; `"vscode"` para VS Code) y hace clicables las filas (nombre,
  celdas de datos y barra). El campo `vinculo` por tarea tiene prioridad.

Uso típico (ver [ejemplos/ejemplo-vinculos.typ](ejemplos/ejemplo-vinculos.typ)):

```typst
#import "@local/gantt:0.1.0": carta-gantt, vinculos-desde-texto

#let ruta-pdf = "C:/mi/trabajo"        // única ruta ABSOLUTA: carpeta del PDF/proyecto
#let ruta-lectura = "tareas.yaml"      // nombres relativos (los lee Typst)
#carta-gantt(yaml(ruta-lectura),
  vinculos: vinculos-desde-texto(read(ruta-lectura), ruta-pdf + "/" + ruta-lectura),
  esquema-vinculo: "vscodium")         // default; usa "vscode" en VS Code
```

Notas:

- `read`/`yaml` solo cargan rutas **relativas al documento** (el sandbox de
  Typst no permite rutas absolutas de tu disco), pero el URI de salto se
  fabrica como cadena, así que la ruta absoluta puede escribirse a mano.
- El visor del PDF debe ejecutar enlaces con esquema personalizado (ver
  abajo). **Edge y Chrome bloquean los `vscode://`/`vscodium://` dentro de
  un PDF**, como medida de seguridad.
- **SumatraPDF** tiene su propia lista blanca de protocolos: por defecto solo
  `http,https,mailto`. Para que `vscodium://` (o `vscode://`) funcione,
  crea `sumatrapdfrestrict.ini` **en la misma carpeta de SumatraPDF.exe**
  (y reinícialo). Ojo: si creas ese archivo, toda opción no listada queda
  en `0`, así que copia la plantilla completa de
  `docs/sumatrapdfrestrict.ini` y solo agrega el esquema:
  ```ini
  [Policies]
  InternetAccess = 1
  DiskAccess = 1
  SavePreferences = 1
  RegistryAccess = 1
  PrinterAccess = 1
  CopySelection = 1
  FullscreenAccess = 1
  LinkProtocols = http,https,mailto,vscodium,vscode
  SafeFileTypes = audio,video,webpage
  ```
- En SumatraPDF los enlaces se abren con **un clic**; con
  `EnableTeXEnhancements = true` el doble clic está reservado para la
  búsqueda inversa de SyncTeX y no sigue enlaces.

## Leer desde Excel

Typst no puede abrir `.xlsx` directamente (no es una función nativa), así
que hay dos caminos igual de válidos:

1. **Sin instalar nada**: en Excel, `Archivo -> Guardar como -> CSV`, con
   columnas `codigo,nombre,duracion,inicio,termino,avance,padre`. Luego,
   junto a tu archivo `.typ` (misma carpeta que `mi-planilla.csv`):
   ```typst
   #import "@local/gantt:0.1.0": carta-gantt
   #carta-gantt(csv("mi-planilla.csv", row-type: dictionary))
   ```
2. **Conversión asistida** (útil si prefieres editar en YAML o exportar
   por lotes): `herramientas/xlsx_a_datos.py` (requiere
   `pip install openpyxl`):
   ```bash
   python herramientas/xlsx_a_datos.py mi-planilla.xlsx datos.yaml
   # o bien:
   python herramientas/xlsx_a_datos.py mi-planilla.xlsx datos.csv --hoja "Cronograma"
   ```

## Referencia de la API

### `carta-gantt(tareas, ..opciones)`

`tareas` puede ser el resultado crudo de `yaml(...)`/`csv(..., row-type: dictionary)`
(lista, o mapa `{ tareas: [...] }`), o ya procesada con `preparar-tareas`.

Opciones principales:

| Parámetro | Valores posibles | Por defecto | Descripción |
|-----------|-------------------|-------------|-------------|
| `titulo` | `none` \| contenido de Typst, p. ej. `[Mi título]` | `none` | Título centrado sobre la carta |
| `ancho-nombre` | `auto` \| una longitud, p. ej. `6cm` | `auto` | Ancho de la columna de nombres; `auto` mide el texto más largo |
| `ancho-linea-tiempo` | `auto` \| una longitud | `auto` | Ancho del área de barras; `auto` es `20cm` si `pagina: true`, o el ancho que sobra del contenedor actual si `pagina: false` |
| `alto-fila` | una longitud | `0.6cm` | Alto de cada fila |
| `pagina` | `true` \| `false` | `true` | `true`: la carta crea y autodimensiona su propia página (uso independiente). `false`: se inserta como contenido normal en el documento actual (ver "Insertar en un documento" más abajo) |
| `margen` | una longitud, o un dict como `(x: 1cm, y: 1.5cm)` | `1cm` | Margen de página (los 4 lados); solo aplica si `pagina: true` |
| `margenes` | `true` \| `false` | `true` | Si `true`, aplica el margen de la página; si `false`, el chart ocupa exactamente su contenido sin margen extra. Solo aplica si `pagina: true` |
| `fuente` | nombre de una fuente instalada, p. ej. `"Liberation Sans"` | `"Liberation Sans"` | Tipografía |
| `tamano-fuente` | una longitud, p. ej. `9pt` | `8pt` | Tamaño de letra base |
| `indent-por-nivel` | una longitud | `0.4cm` | Sangría por nivel de subtarea |
| `color-tarea`, `color-grupo`, `color-hito`, `color-texto`, `color-rejilla` | un color, p. ej. `rgb("#2563eb")`, `blue`, `luma(40%)` | paleta azul/gris/rojo | Colores por defecto de cada elemento |
| `color-calendario` | un color | `rgb("#f8fafc")` (gris muy suave) | Relleno de fondo de las bandas del calendario (año/mes/semana/día) |
| `color-avance` | un color | `rgb("#6b7280")` (gris) | Color de la barra de avance |
| `color` | `none` \| función `(fila) -> color` | `none` | Colorear a medida; `fila` trae `codigo`, `nombre`, `nivel`, `es-grupo`, `hito`, `inicio-dias`, `termino-dias`, `duracion`, `avance` y, si el CPM está activo, `holgura`, `critico` y `predecesoras` |
| `mostrar-codigo` | `true` \| `false` | `true` | Antepone `codigo. ` al nombre de cada tarea |
| `mostrar-duracion` | `true` \| `false` | `false` | Muestra la duración (p. ej. `10d`) a la derecha de cada barra |
| `mostrar-barra-grupo` | `true` \| `false` | `true` | Si es `false`, las tareas con subtareas **no dibujan ninguna barra/línea** en la línea de tiempo (solo se ve su nombre y sus hijas) |
| `mostrar-hoy` | `true` \| `false` | `false` | Dibuja una línea vertical roja en la fecha de hoy (`datetime.today()`), desde justo debajo del encabezado de fechas hasta la última fila, si hoy cae dentro de la ventana visible |
| `color-hoy` | un color | `rgb("#dc2626")` | Color de la línea de "hoy" |
| `ventana-inicio` | `none` (usa el mínimo de los datos) \| `"AAAA-MM-DD"` | `none` | Fecha desde la que empieza a dibujarse la línea de tiempo — puede ser distinta al inicio real del proyecto (recorta o extiende la ventana visible) |
| `ventana-fin` | `none` (usa el máximo de los datos) \| `"AAAA-MM-DD"` | `none` | Fecha en la que termina la línea de tiempo dibujada; igual que `ventana-inicio`, no tiene por qué coincidir con el término real del proyecto |
| `nivel-anio` | `auto` (se activa solo si el rango cruza más de un año) \| `true` \| `false` | `auto` | Muestra u oculta la banda de años del encabezado |
| `nivel-mes` | `auto` (siempre activo) \| `true` \| `false` | `auto` | Muestra u oculta la banda de meses |
| `nivel-semana` | `auto` (se activa si la ventana visible dura ≤ 200 días) \| `true` \| `false` | `auto` | Muestra u oculta la banda de semanas (bloques de 7 días numerados `S1, S2, ...` desde el inicio de la ventana) |
| `nivel-dia` | `auto` (se activa si la ventana visible dura ≤ 45 días) \| `true` \| `false` | `auto` | Muestra u oculta la banda de días; si la columna de cada día queda muy angosta se sigue dibujando la rejilla pero se omite el número |
| `mostrar-dia-inicio-semana` | `true` \| `false` | `false` | En la banda de semanas, agrega el día del mes en que arranca cada semana, alineado a la izquierda de su celda (junto al `S1`, `S2`, ... centrado) |
| `mostrar-columnas` | una lista con cualquier subconjunto y orden de `("duracion", "inicio", "termino", "avance", "inicio-temprano", "termino-temprano", "inicio-tardio", "termino-tardio", "holgura", "critico")` | `()` (ninguna) | Agrega columnas de datos entre el nombre y la línea de tiempo, con ancho automático; `inicio`/`termino` se muestran como `DD-MM-AAAA` y `avance` como porcentaje entero |
| `cpm` | `true` \| `false` | `false` | Activa el motor CPM: calcula las fechas desde `predecesoras` (ver "CPM") |
| `inicio-proyecto` | `none` \| `"AAAA-MM-DD"` | `none` | Fecha base del proyecto para el CPM, cuando no sale sola de las anclas |
| `termino-proyecto` | `none` \| `"AAAA-MM-DD"` | `none` | Fecha de fin del proyecto para el CPM (referencia de las holguras), cuando no sale sola |
| `resaltar-critico` | `true` \| `false` | `true` | Pinta de `color-critico` las tareas con holgura 0 |
| `color-critico` | un color | `rgb("#dc2626")` (rojo) | Color de la ruta crítica |
| `mostrar-dependencias` | `true` \| `false` | `true` | Dibuja flechas "elbow" desde el término de cada predecesora hasta el inicio de su sucesora |
| `color-dependencia` | un color | `rgb("#64748b")` (gris) | Color de las flechas de dependencia |
| `vinculos` | `none` \| dict `(codigo: (archivo, linea), ...)` (vía `vinculos-desde-texto`) o `(codigo: "vscodium://...")` | `none` | Vuelve clicables las filas cuyo `codigo` esté en el dict (nombre, celdas de fecha y barra). En el primer caso `carta-gantt` arma el URI con `esquema-vinculo` |
| `esquema-vinculo` | `"vscodium"` \| `"vscode"` | `"vscodium"` | Esquema del URI de salto a línea cuando `vinculos` trae ubicaciones `(archivo, linea)` |
| `mostrar-niveles` | `auto` (todos) \| entero ≥ 1 | `auto` | Muestra solo los primeros N niveles de la jerarquía; el resto de las subtareas se ocultan por completo (no solo su barra). Una tarea que se queda sin hijas visibles se dibuja como si nunca hubiera tenido subtareas |
| `mostrar-serie-avance` | `true` \| `false` | `true` | Si `avance` es una serie, `true` la dibuja como bloques arriba/abajo (ver "Avance como serie de incrementos"); `false` ignora la serie y dibuja un solo bloque con el avance total |

Cuando una tarea queda parcial o totalmente fuera de `ventana-inicio`/
`ventana-fin`, su barra se recorta (o se omite del todo) en vez de
desbordar la página; la fila con su nombre se sigue mostrando siempre.

**Ejemplo** (ver [ejemplos/ejemplo-niveles.typ](ejemplos/ejemplo-niveles.typ)):
duraciones visibles, tareas-madre sin barra propia, sin banda de año, con
semanas y días forzados, y una ventana de tiempo que no coincide con el
período real del proyecto:

```typst
#carta-gantt(
  yaml("datos.yaml"),
  mostrar-duracion: true,
  mostrar-barra-grupo: false,
  nivel-anio: false,
  nivel-semana: true,
  nivel-dia: true,
  ventana-inicio: "2025-12-20",
  ventana-fin: "2026-04-15",
)
```

### Lectura de datos: `yaml()` / `csv()` nativos

No hay que envolverlos: llamalos directo en tu archivo (`yaml("datos.yaml")`,
`csv("datos.csv", row-type: dictionary)`) y pasale el resultado a
`carta-gantt(...)`. `carta-gantt` (vía `tareas-listas`) acepta tanto una
lista de tareas en la raíz del YAML como un mapa `{ tareas: [...] }`.

`datos.typ` todavía expone `leer-yaml(ruta)`/`leer-csv(ruta)` por
compatibilidad con versiones anteriores de este proyecto, pero **no las
uses en archivos nuevos**: como viven dentro del paquete, la ruta que les
pases se resuelve relativa a la librería instalada, no a tu archivo — es
decir, dejan de encontrar tu archivo de datos en cuanto la librería vive
en otro lado (como ahora, que es un paquete `@local`).

### `preparar-tareas(datos-crudos, cpm: false, inicio-proyecto: none, termino-proyecto: none)`

Aplana la jerarquía, calcula fechas/duración/avance faltantes (con
rollup) y devuelve la lista final en orden de dibujo. `carta-gantt` la
llama automáticamente si detecta datos crudos, así que normalmente no
hace falta invocarla a mano. Con `cpm: true` cada fila lleva además
`inicio-temprano-dias`, `termino-temprano-dias`, `inicio-tardio-dias`,
`termino-tardio-dias`, `holgura`, `critico` y `predecesoras`.

## Detalles de diseño

- La barra de avance se dibuja centrada verticalmente dentro de la barra
  principal (de tarea o de grupo), con un tercio de su altura, en gris
  (`color-avance`) para no competir con los colores de las tareas. Si
  `avance` es una serie, se dibuja como bloques contiguos (ancho
  proporcional a cada incremento) alternando arriba/abajo, de 1/6 de
  altura cada uno — entre los dos ocupan el mismo 1/3 total.
- Las tareas con subtareas se dibujan **transparentes** (solo el
  contorno, sin relleno ni corchetes en los extremos), de la misma
  altura que una tarea normal, para no competir visualmente con sus
  hijas.
- Las fechas se convierten internamente a un número de día consecutivo
  (algoritmo de Howard Hinnant) porque Typst no permite restar valores
  `datetime` entre sí; solo se construye un `datetime` real para
  formatear texto en pantalla.
- El encabezado tiene hasta 4 bandas apiladas (año, mes, semana, día); cada
  una se controla con `nivel-anio`/`nivel-mes`/`nivel-semana`/`nivel-dia`.
  En `auto`, año solo aparece si el cronograma cruza más de un año, mes
  siempre aparece, semana aparece si la ventana visible dura ≤ 200 días y
  día si dura ≤ 45 días — pero cualquiera se puede forzar a `true`/`false`
  sin importar el largo del rango.
- La banda de semana no usa semanas ISO: numera bloques de 7 días
  (`S1, S2, ...`) contados desde el inicio de la ventana visible.
- El ancho/alto de página se calcula midiendo (`measure`) el contenido
  real ya maquetado, así que el tamaño de página siempre es exacto,
  sin recortes ni páginas de más.
