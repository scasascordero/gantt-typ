import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import { invoke } from "@tauri-apps/api/core";
import ejemploDatos from "../../ejemplos/ejemplo_1.yaml?raw";
import { compilarSvg, fuentesLibreria, necesitaCpm, inyectarFechasCpm } from "./lib/libreria";
import { analizarSvg } from "./lib/geometria";
import { listarTareas } from "./lib/yamlLineas";
import { validarTexto, idLibre } from "./lib/validacion";
import { generarMainTyp, valoresDefault, type Valor } from "./lib/params";
import { fechaIso } from "./lib/fechas";
import type { Fila } from "./lib/modelo";
import { aMSPDI, aPMXML, aXER } from "./lib/exportadores";
import { desdeMSPDI, esMSPDI } from "./lib/mspdi";
import { excelAYaml, detectarColumnas, type ColumnasExcel, type Deteccion, type MatrizExcel } from "./lib/excelImport";
import { editarCampo, editarCampoConsistente, leerCampo, leerConfigYaml, ponerConfigYaml, type ValorCampo } from "./lib/yamlEdicion";
import { editarPredecesoras } from "./lib/yamlOperaciones";
import EditorPredecesoras from "./EditorPredecesoras";
import AnalisisApu from "./AnalisisApu";
import MenuCalendario from "./MenuCalendario";
import MenuColumnas from "./MenuColumnas";
import { proyectoAYaml, yamlAProyecto, type ProyectoCompleto } from "./lib/proyectoDb";
import MenuParametros from "./MenuParametros";
import MenuProyectos, { type ProyectoInfo } from "./MenuProyectos";
import MenuTarea from "./MenuTarea";
import PanelTabla from "./PanelTabla";
import PropiedadesTarea from "./PropiedadesTarea";
import "./App.css";

const ZOOM_MIN = 1; // "Ajustar" (100%) es el piso: el dibujo nunca queda más
                    // chico que el ancho de su panel
const ZOOM_MAX = 8;

interface Doc {
  id: string;
  nombre: string;
  ruta?: string;
  proyectoId?: number;
  texto: string;
  sucio: boolean;
}

function nombreDe(ruta: string): string {
  return ruta.split(/[\\/]/).pop() || "sin-titulo.yaml";
}

function docVacio(id: string): Doc {
  return { id, nombre: "sin-titulo.yaml", texto: "", sucio: false };
}

interface PopupFecha {
  x: number;
  y: number;
  desde: number;
  hasta: number;
  valor: string;
}

interface ExcelInfo {
  hojaSugerida: string;
  hojas: string[];
  rangos: { nombre: string; refe: string }[];
}

function App() {
  const [docs, setDocs] = useState<Doc[]>(() => [
    { id: "doc-1", nombre: "ejemplo_1.yaml", texto: ejemploDatos, sucio: false },
  ]);
  const [idActivo, setIdActivo] = useState("doc-1");
  const [svg, setSvg] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [milis, setMilis] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [zoom, setZoom] = useState(1);
  const [anchoEditorPct, setAnchoEditorPct] = useState(40);
  const [editorOculto, setEditorOculto] = useState(false);
  const [editorEditable, setEditorEditable] = useState(false); // si mostrar el YAML en modo editable
  const [vistaIzquierda, setVistaIzquierda] = useState<"yaml" | "tabla">("yaml");
  const [tablaSeleccion, setTablaSeleccion] = useState<string | null>(null);
  const tablaPanelRef = useRef<HTMLDivElement | null>(null);
  const editorEditableRef = useRef(editorEditable);
  editorEditableRef.current = editorEditable;
  const readonlyComp = useRef(new Compartment());
  const [arrastrandoDivisor, setArrastrandoDivisor] = useState(false);
  const contenidoRef = useRef<HTMLElement | null>(null);
  const [parametros, setParametros] = useState<Record<string, Valor>>(() => valoresDefault());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuProyectosAbierto, setMenuProyectosAbierto] = useState(false);
  const [menuCalendario, setMenuCalendario] = useState<{ x: number; y: number } | null>(null);
  const [menuColumnas, setMenuColumnas] = useState<{ x: number; y: number } | null>(null);
  const [menuTarea, setMenuTarea] = useState<{ x: number; y: number; codigo: string; nombre: string } | null>(null);
  const [editorPredecesoras, setEditorPredecesoras] = useState<{ codigo: string; nombre: string } | null>(null);
  const [apuAbierto, setApuAbierto] = useState<{ codigo: string } | null>(null);
  const [copiado, setCopiado] = useState("");
  const [proyectos, setProyectos] = useState<ProyectoInfo[]>([]);
  const [popupFecha, setPopupFecha] = useState<PopupFecha | null>(null);
  const [exportMenuAbierto, setExportMenuAbierto] = useState(false);
  const [importMenuAbierto, setImportMenuAbierto] = useState(false);
  const [excelRangos, setExcelRangos] = useState<{ ruta: string; info: ExcelInfo } | null>(null);
  const [excelMapa, setExcelMapa] = useState<{
    ruta: string;
    matriz: MatrizExcel;
    det: Deteccion;
    hoja: string;
  } | null>(null);
  const [mapaSel, setMapaSel] = useState<ColumnasExcel | null>(null);
  const [propsTarea, setPropsTarea] = useState<{ x: number; y: number; codigo: string } | null>(null);
  const inputFecha = useRef<HTMLInputElement | null>(null);

  const mainTyp = useMemo(() => generarMainTyp(parametros), [parametros]);
  const nivelActual = String(parametros["mostrar-niveles"] ?? "auto");

  const docActual = useMemo(
    () => docs.find((d) => d.id === idActivo) ?? docs[0],
    [docs, idActivo],
  );
  const texto = docActual.texto;

  const editorRef = useRef<EditorView | null>(null);
  const contenedorEditor = useRef<HTMLDivElement | null>(null);
  const svgCaja = useRef<HTMLDivElement | null>(null);
  const textoRef = useRef(texto);
  textoRef.current = texto;
  const idActivoRef = useRef(idActivo);
  idActivoRef.current = idActivo;
  const mainTypRef = useRef(mainTyp);
  mainTypRef.current = mainTyp;
  const peticionRef = useRef(0);
  const enVueloRef = useRef(false);
  const pendienteRef = useRef(false);
  const volverACompilar = useCallback(async () => {
    const peticion = peticionRef.current;
    const textoActual = textoRef.current;
    const mainActual = mainTypRef.current;
    // CPM activo (parámetro de la UI o config del YAML): precalcula las
    // fechas con petgraph (preparar_filas) e inyecta `fechas-cpm` para que
    // la librería no recalcule el CPM interno (cpm.typ). Si falla (datos
    // inválidos) se compila con el YAML crudo y Typst reporta el error.
    let textoParaTypst = textoActual;
    const cpmActivo =
      parametrosRef.current["cpm"] === true || necesitaCpm(textoActual);
    if (cpmActivo) {
      const fechaOpt = (k: string) => {
        const v = parametrosRef.current[k];
        return typeof v === "string" && v.trim() !== "" ? v : undefined;
      };
      try {
        const filas = await invoke<Fila[]>("preparar_filas", {
          texto: textoActual,
          cpm: true,
          inicioProyecto: fechaOpt("inicio-proyecto"),
          terminoProyecto: fechaOpt("termino-proyecto"),
        });
        textoParaTypst = inyectarFechasCpm(textoActual, filas);
      } catch {
        // sin inyección: la carta se compila igual (error visible en pantalla)
      }
    }
    const r = await compilarSvg(textoParaTypst, mainActual).catch((e) => ({
      svg: null,
      errores: [String(e)],
      milis: 0,
    }));
    enVueloRef.current = false;
    // descartar el resultado si llegó una edición más nueva mientras tanto
    if (peticionRef.current === peticion && textoRef.current === textoActual) {
      setSvg(r.svg);
      setErrores(r.errores);
      setMilis(r.milis);
    }
    // fusionar: si hubo cambios durante la compilación, se repite una vez más
    if (pendienteRef.current) {
      pendienteRef.current = false;
      void volverACompilar();
    }
  }, []);

  const alCambiarTexto = useCallback((t: string) => {
    const id = idActivoRef.current;
    setDocs((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, texto: t, sucio: d.texto !== t } : d,
      ),
    );
  }, []);

  const cargarProyectos = useCallback(async () => {
    try {
      const lista = await invoke<ProyectoInfo[]>("listar_proyectos");
      setProyectos(lista);
    } catch (err) {
      setMensaje(`Error al listar proyectos: ${String(err)}`);
    }
  }, []);

  useEffect(() => {
    void cargarProyectos();
  }, [cargarProyectos]);

  useEffect(() => {
    if (!contenedorEditor.current) return;
    const vista = new EditorView({
      parent: contenedorEditor.current,
      state: EditorState.create({
        doc: textoRef.current,
        extensions: [
          basicSetup,
          yaml(),
          readonlyComp.current.of(EditorState.readOnly.of(true)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) alCambiarTexto(u.state.doc.toString());
          }),
        ],
      }),
    });
    editorRef.current = vista;
    return () => vista.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compila la carta en un Web Worker (hilo aparte). Las ediciones que
  // llegan durante una compilación se fusionan en una sola repetición final:
  // nunca hay una cola de resultados obsoletos aplicándose en orden.
  useEffect(() => {
    peticionRef.current++;
    if (!enVueloRef.current) {
      enVueloRef.current = true;
      void volverACompilar();
    } else {
      pendienteRef.current = true;
    }
  }, [texto, mainTyp, volverACompilar]);

  useEffect(() => {
    const caja = svgCaja.current;
    if (!caja) return;
    const alRueda = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    caja.addEventListener("wheel", alRueda, { passive: false });
    return () => caja.removeEventListener("wheel", alRueda);
  }, [svg]);

  const tareas = useMemo(() => {
    const todas = listarTareas(texto);
    if (nivelActual === "auto") return todas;
    const k = Math.max(1, Math.floor(Number(nivelActual)) || 1);
    return todas.filter((t) => t.nivel < k);
  }, [texto, nivelActual]);
  const tareasTodas = useMemo(() => listarTareas(texto), [texto]);
  const tareasTodasRef = useRef(tareasTodas);
  tareasTodasRef.current = tareasTodas;
  const geometria = useMemo(() => (svg ? analizarSvg(svg) : null), [svg]);

  const saltarATarea = useCallback(
    (indice: number) => {
      const v = editorRef.current;
      const tarea = tareas[indice];
      if (!v || !tarea) return;
      const linea = v.state.doc.line(Math.min(tarea.linea, v.state.doc.lines));
      v.dispatch({
        selection: { anchor: linea.from, head: linea.to },
        effects: EditorView.scrollIntoView(linea.from, { y: "center" }),
      });
      v.focus();
    },
    [tareas],
  );

  const indiceDePunto = useCallback(
    (e: React.MouseEvent) => {
      const caja = svgCaja.current;
      const g = geometria;
      if (!caja || !g || !g.bandas.length) return -1;
      const s = caja.querySelector("svg");
      if (!s || !g.ancho) return -1;
      const rect = s.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return -1;
      const py = (e.clientY - rect.top) * (g.ancho / rect.width);
      const i = g.bandas.findIndex((b) => py >= b.y0 && py < b.y1);
      if (i >= 0) return i;
      const tol = 7;
      let mejor = -1;
      let menor = Infinity;
      for (let k = 0; k < g.bandas.length; k++) {
        const b = g.bandas[k];
        const dentro = b.y0 <= py && py <= b.y1;
        const d = dentro
          ? 0
          : Math.min(Math.abs(py - b.y0), Math.abs(py - b.y1));
        if (d < menor) {
          menor = d;
          mejor = k;
        }
      }
      return mejor >= 0 && menor <= tol ? mejor : -1;
    },
    [geometria],
  );

  const alClicSvg = useCallback(
    (e: React.MouseEvent) => {
      const i = indiceDePunto(e);
      if (i < 0) return;
      if (vistaIzquierda === "tabla") {
        const t = tareas[i];
        if (t) setTablaSeleccion(t.id);
      } else {
        saltarATarea(i);
      }
    },
    [indiceDePunto, saltarATarea, vistaIzquierda, tareas],
  );

  const ponerEnEditor = useCallback((textoNuevo: string) => {
    const v = editorRef.current;
    if (!v) return;
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: textoNuevo },
    });
  }, []);

  // Alterna la edición de texto libre (por defecto el YAML es solo lectura
  // y toda mutación pasa por la UI, que siempre genera YAML válido).
  const alternarEditorEditable = useCallback(() => {
    const nuevo = !editorEditableRef.current;
    setEditorEditable(nuevo);
    const v = editorRef.current;
    if (v) {
      v.dispatch({
        effects: readonlyComp.current.reconfigure(EditorState.readOnly.of(!nuevo)),
      });
    }
    setMensaje(
      nuevo
        ? "Edición de texto habilitada: cuidá que el YAML siga siendo válido."
        : "Texto bloqueado: edición solo por la carta.",
    );
  }, []);

  const irALinea = useCallback((linea: number) => {
    const v = editorRef.current;
    if (!v) return;
    setEditorOculto(false);
    const doc = v.state.doc;
    const n = Math.min(Math.max(1, linea), doc.lines);
    const line = doc.line(n);
    v.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
    v.focus();
  }, []);

  const alClicDerechoCarta = useCallback(
    (e: React.MouseEvent) => {
      const caja = svgCaja.current;
      const g = geometria;
      if (!caja || !g || !g.bandas.length) return;
      const s = caja.querySelector("svg");
      if (!s || !g.ancho) return;
      const rect = s.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const py = (e.clientY - rect.top) * (g.ancho / rect.width);
      const px = (e.clientX - rect.left) * (g.ancho / rect.width);
      // Botón derecho sobre las celdas de cabecera de las columnas de datos.
      if (
        g.columnas &&
        py >= g.columnas.y0 &&
        py < g.columnas.y1 &&
        px >= g.columnas.x0 &&
        px < g.columnas.x1
      ) {
        e.preventDefault();
        setMenuColumnas({ x: e.clientX, y: e.clientY });
        return;
      }
      // Botón derecho sobre la cabecera del calendario: menú de calendario.
      if (g.calendario && py >= g.calendario.y0 && py < g.calendario.y1 && px >= g.calendario.x0) {
        e.preventDefault();
        setMenuCalendario({ x: e.clientX, y: e.clientY });
        return;
      }
      const i = indiceDePunto(e);
      if (i >= 0 && tareas[i]) {
        e.preventDefault();
        setPropsTarea({ x: e.clientX, y: e.clientY, codigo: tareas[i].id });
      }
    },
    [indiceDePunto, tareas, geometria],
  );

  const alDobleClicCarta = useCallback(
    (e: React.MouseEvent) => {
      const i = indiceDePunto(e);
      if (i < 0) return;
      const t = tareas[i];
      if (!t) return;
      e.preventDefault();
      setMenuTarea({ x: e.clientX, y: e.clientY, codigo: t.id, nombre: t.nombre });
    },
    [indiceDePunto, tareas],
  );

  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);
  const parametrosRef = useRef(parametros);
  parametrosRef.current = parametros;
  const cambiarParametro = useCallback(
    (clave: string, valor: Valor) => {
      const proximos = { ...parametrosRef.current, [clave]: valor };
      setParametros(proximos);
      // la configuración queda persistida en la sección `config:` del YAML
      try {
        const t = ponerConfigYaml(textoRef.current, proximos);
        if (t && t !== textoRef.current) ponerEnEditor(t);
      } catch {
        // no romper el menú si el YAML está a medio escribir
      }
    },
    [ponerEnEditor],
  );
  const restablecerParametros = useCallback(
    () => setParametros({ ...valoresDefault(), ...leerConfigYaml(textoRef.current) }),
    [],
  );

  // la sección `config:` del YAML reemplaza los valores de base del menú;
  // lo que el usuario cambió a mano por encima se conserva
  const configJson = useMemo(() => JSON.stringify(leerConfigYaml(texto)), [texto]);
  const baseConfigRef = useRef<string>("{}");
  useEffect(() => {
    setParametros((prev) => {
      const base: Record<string, Valor> = { ...valoresDefault(), ...JSON.parse(configJson) };
      const baseAnterior: Record<string, Valor> = { ...valoresDefault(), ...JSON.parse(baseConfigRef.current) };
      const ajustes: Record<string, Valor> = {};
      for (const k of Object.keys(prev)) {
        if (JSON.stringify(prev[k]) !== JSON.stringify(baseAnterior[k])) ajustes[k] = prev[k];
      }
      return { ...base, ...ajustes };
    });
    baseConfigRef.current = configJson;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configJson]);

  const cpmActivado = parametros.cpm === true || parametros.cpm === "true";

  // Validación estructural en vivo (mismas reglas que la librería)
  const diagnosticos = useMemo(() => validarTexto(texto, cpmActivado), [texto, cpmActivado]);
  const erroresValidacion = diagnosticos.filter((x) => x.severidad === "error");
  const hayErroresValidacion = erroresValidacion.length > 0;

  // Un id repetido rompe la resolución de dependencias: se renombra solo el
  // id duplicado (la segunda aparición) para dejar el documento válido.
  useEffect(() => {
    const repetido = diagnosticos.find((x) => x.repetido)?.repetido;
    if (!repetido) return;
    const actual = textoRef.current;
    const nuevo = idLibre(actual);
    const corregido = editarCampo(actual, repetido.codigo, "id", nuevo);
    if (corregido === actual) return;
    ponerEnEditor(corregido);
    setMensaje(`Id duplicado: renombré '${repetido.id}' → '${nuevo}'`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosticos]);

  // Fechas resueltas por el motor (petgraph en Rust, la misma fuente que la
  // carta): alimenta el "término" calculado de cada actividad y los límites
  // de la ventana temporal. Con datos inválidos queda en null (panel en
  // blanco, como con el port TS).
  const [filasPanel, setFilasPanel] = useState<Fila[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const id = window.setTimeout(async () => {
      try {
        const fechaOpt = (k: string) => {
          const v = parametrosRef.current[k];
          return typeof v === "string" && v.trim() !== "" ? v : undefined;
        };
        const filas = await invoke<Fila[]>("preparar_filas", {
          texto: textoRef.current,
          cpm: cpmActivado || necesitaCpm(textoRef.current),
          inicioProyecto: fechaOpt("inicio-proyecto"),
          terminoProyecto: fechaOpt("termino-proyecto"),
        });
        if (vivo) setFilasPanel(filas);
      } catch {
        if (vivo) setFilasPanel(null);
      }
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, cpmActivado]);

  const terminoCalculado = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filasPanel ?? []) m.set(f.codigo, fechaIso(f.terminoDias));
    return m;
  }, [filasPanel]);

  const ventanaCalculada = useMemo(() => {
    const filas = filasPanel;
    if (!filas || !filas.length) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const f of filas) {
      if (f.inicioDias < min) min = f.inicioDias;
      if (f.terminoDias > max) max = f.terminoDias;
    }
    return Number.isFinite(min) && Number.isFinite(max)
      ? { inicio: fechaIso(min), fin: fechaIso(max) }
      : null;
  }, [filasPanel]);

  const CAMPOS_TAREA = [
    "nombre", "inicio", "termino", "duracion", "avance", "formato-barra",
    "negrita", "italica", "color-texto", "ocultar-subtareas",
    "cantidad", "unidad", "costo-unitario", "costo",
  ];
  const camposTarea = useMemo(() => {
    if (!propsTarea) return null;
    const c: Record<string, ValorCampo> = {};
    for (const k of CAMPOS_TAREA) {
      try {
        c[k] = leerCampo(texto, propsTarea.codigo, k);
      } catch {
        c[k] = null;
      }
    }
    // "término" no declarado: se muestra el calculado (inicio+duración o CPM)
    if (!c.termino) {
      const calculado = terminoCalculado.get(propsTarea.codigo);
      if (calculado) c.termino = calculado;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsTarea, texto, terminoCalculado]);

  const aplicarCampoTarea = useCallback(
    (clave: string, valor: ValorCampo) => {
      if (!propsTarea) return;
      try {
        ponerEnEditor(editarCampoConsistente(textoRef.current, propsTarea.codigo, clave, valor));
      } catch (err) {
        setMensaje(`Error al editar: ${String(err)}`);
      }
    },
    [propsTarea, ponerEnEditor],
  );

  // Aviso de fechas/duración incoherentes editadas a mano en el YAML: con un
  // clic se corrige sola la `duracion` (el `termino` queda como ancla).
  const corregirInconsistencia = useCallback(
    (codigo: string, duracionCalculada: number) => {
      try {
        const corregido = editarCampo(textoRef.current, codigo, "duracion", duracionCalculada);
        if (corregido !== textoRef.current) {
          ponerEnEditor(corregido);
          setMensaje(`'${codigo}': duración ajustada a ${duracionCalculada} (término inalterado)`);
        }
      } catch (err) {
        setMensaje(`Error al corregir: ${String(err)}`);
      }
    },
    [ponerEnEditor],
  );

  const abrirPredecesoras = useCallback((codigoTarea: string, nombreTarea: string) => {
    setMenuTarea(null);
    setPropsTarea(null);
    setEditorPredecesoras({ codigo: codigoTarea, nombre: nombreTarea });
  }, []);

  const guardarPredecesoras = useCallback(
    (tokens: string[]) => {
      if (!editorPredecesoras) return;
      try {
        ponerEnEditor(editarPredecesoras(textoRef.current, editorPredecesoras.codigo, tokens));
      } catch (err) {
        setMensaje(`Error al guardar predecesoras: ${String(err)}`);
      } finally {
        setEditorPredecesoras(null);
      }
    },
    [editorPredecesoras, ponerEnEditor],
  );

  useEffect(() => setPropsTarea(null), [idActivo]);
  useEffect(() => {
    if (!propsTarea) return;
    const afuera = (ev: PointerEvent) => {
      const el = ev.target as Element | null;
      if (el?.closest?.(".panel-propiedades")) return;
      setPropsTarea(null);
    };
    window.addEventListener("pointerdown", afuera);
    return () => window.removeEventListener("pointerdown", afuera);
  }, [propsTarea]);

  const seleccionarDoc = useCallback(
    (id: string) => {
      const d = docs.find((x) => x.id === id);
      if (!d) return;
      idActivoRef.current = id;
      setIdActivo(id);
      ponerEnEditor(d.texto);
    },
    [docs, ponerEnEditor],
  );

  const nuevoDoc = useCallback(() => {
    const id = `doc-${Date.now()}`;
    idActivoRef.current = id;
    setDocs((prev) => [...prev, docVacio(id)]);
    setIdActivo(id);
    ponerEnEditor("");
  }, [ponerEnEditor]);

  const abrirArchivo = useCallback(async () => {
    try {
      const r = await invoke<{ ruta: string; contenido: string } | null>("abrir_archivo");
      if (!r) return;
      const id = `doc-${Date.now()}`;
      idActivoRef.current = id;
      setDocs((prev) => [
        ...prev,
        { id, nombre: nombreDe(r.ruta), ruta: r.ruta, texto: r.contenido, sucio: false },
      ]);
      setIdActivo(id);
      ponerEnEditor(r.contenido);
    } catch (err) {
      setMensaje(`Error al abrir: ${String(err)}`);
    }
  }, [ponerEnEditor]);

  const abrirDocImportado = (textoYaml: string, rutaSrc: string, origen: string) => {
    const id = `doc-${Date.now()}`;
    const nombre = nombreDe(rutaSrc).replace(/\.[^.]+$/, "") + ".yaml";
    idActivoRef.current = id;
    setDocs((prev) => [...prev, { id, nombre, texto: textoYaml, sucio: true }]);
    setIdActivo(id);
    ponerEnEditor(textoYaml);
    setMensaje(
      `${origen} importado desde ${nombreDe(rutaSrc)} (${listarTareas(textoYaml).length} tareas)`,
    );
  };

  // Importadores de texto: MSPDI (TS, como antes), PMXML y XER (Rust).
  const importarTexto = async (formato: "mspdi" | "pmxml" | "xer") => {
    try {
      const r = await invoke<{ ruta: string; contenido: string } | null>("elegir_archivo_importar", {
        formato,
      });
      if (!r) return;
      let yamlTexto: string;
      if (formato === "mspdi") {
        if (!esMSPDI(r.contenido)) {
          setMensaje("El archivo no parece MSPDI (MS Project 2003 XML)");
          return;
        }
        yamlTexto = desdeMSPDI(r.contenido);
      } else {
        yamlTexto = await invoke<string>("importar_plan", { texto: r.contenido, formato });
      }
      abrirDocImportado(yamlTexto, r.ruta, formato.toUpperCase());
    } catch (err) {
      setMensaje(`Error al importar: ${String(err)}`);
    }
  };

  // Importación de Excel: elige archivo, pregunta por un rango con nombre y,
  // si la detección automática tiene dudas, abre el diálogo de mapeo.
  const importarExcel = async () => {
    try {
      const r = await invoke<{ ruta: string; contenido: string } | null>("elegir_archivo_importar", {
        formato: "excel",
      });
      if (!r) return;
      const info = await invoke<ExcelInfo>("listar_rangos_excel", { ruta: r.ruta });
      setExcelRangos({ ruta: r.ruta, info });
    } catch (err) {
      setMensaje(`Error al importar Excel: ${String(err)}`);
    }
  };

  const usarRangoExcel = async (refe: string | null) => {
    const actual = excelRangos;
    if (!actual) return;
    setExcelRangos(null);
    try {
      const hoja = actual.info.hojaSugerida;
      const matriz = await invoke<MatrizExcel>("leer_excel_celdas", {
        ruta: actual.ruta,
        hoja,
        rango: refe,
      });
      const det = detectarColumnas(matriz);
      if (det.dudas.length === 0) {
        abrirDocImportado(excelAYaml(matriz, det, det.columnas), actual.ruta, "Excel");
      } else {
        setExcelMapa({ ruta: actual.ruta, matriz, det, hoja });
        setMapaSel(det.columnas);
      }
    } catch (err) {
      setMensaje(`Error al leer Excel: ${String(err)}`);
    }
  };

  const confirmarMapa = () => {
    if (!excelMapa || !mapaSel) return;
    const yamlTexto = excelAYaml(excelMapa.matriz, excelMapa.det, mapaSel);
    abrirDocImportado(yamlTexto, excelMapa.ruta, "Excel");
    setExcelMapa(null);
    setMapaSel(null);
  };

  // --- CRUD de proyectos (SQLite, sin pasar por archivos) -------------------

  const guardarEnProyecto = useCallback(
    async (id: number) => {
      const d = docActual;
      if (!d) return;
      try {
        const p = yamlAProyecto(d.texto);
        await invoke("guardar_proyecto", {
          id,
          tareas: p.tareas,
          deps: p.deps,
          params: p.params,
        });
        setDocs((prev) =>
          prev.map((x) => (x.id === d.id ? { ...x, proyectoId: id, sucio: false } : x)),
        );
        const nombre = proyectos.find((pr) => pr.id === id)?.nombre ?? `#${id}`;
        setMensaje(`Guardado en proyecto «${nombre}» (${p.tareas.length} tareas)`);
      } catch (err) {
        setMensaje(`Error al guardar en proyecto: ${String(err)}`);
      }
    },
    [docActual, proyectos],
  );

  const cargarProyecto = useCallback(
    async (id: number) => {
      try {
        const completo = await invoke<ProyectoCompleto>("cargar_proyecto", { id });
        const p = proyectos.find((pr) => pr.id === id);
        const nombre = p?.nombre ?? `proyecto-${id}`;
        const textoNuevo = proyectoAYaml(completo);
        const did = `doc-${Date.now()}`;
        idActivoRef.current = did;
        setDocs((prev) => [...prev, { id: did, nombre: `${nombre}.yaml`, proyectoId: id, texto: textoNuevo, sucio: false }]);
        setIdActivo(did);
        ponerEnEditor(textoNuevo);
        setMensaje(`Abierto «${nombre}»`);
      } catch (err) {
        setMensaje(`Error al abrir el proyecto: ${String(err)}`);
      }
    },
    [proyectos, ponerEnEditor],
  );

  const crearProyectoYGuardar = useCallback(
    async (nombre: string) => {
      const n = nombre.trim();
      if (!n) return;
      try {
        const id = await invoke<number>("crear_proyecto", { nombre: n });
        setProyectos((prev) => [...prev, { id, nombre: n }]);
        await guardarEnProyecto(id);
      } catch (err) {
        setMensaje(`Error al crear el proyecto: ${String(err)}`);
      }
    },
    [guardarEnProyecto],
  );

  const borrarProyecto = useCallback(
    async (id: number) => {
      const nombre = proyectos.find((pr) => pr.id === id)?.nombre ?? `#${id}`;
      if (!window.confirm(`¿Borrar el proyecto «${nombre}»?`)) return;
      try {
        await invoke("borrar_proyecto", { id });
        setProyectos((prev) => prev.filter((pr) => pr.id !== id));
        setDocs((prev) => prev.map((x) => (x.proyectoId === id ? { ...x, proyectoId: undefined } : x)));
        setMensaje(`Proyecto «${nombre}» borrado`);
      } catch (err) {
        setMensaje(`Error al borrar el proyecto: ${String(err)}`);
      }
    },
    [proyectos],
  );

  const guardarDoc = useCallback(
    async (como: boolean) => {
      const d = docActual;
      if (!d) return;
      if (!como && d.proyectoId !== undefined) {
        await guardarEnProyecto(d.proyectoId);
        return;
      }
      try {
        const nuevaRuta = await invoke<string | null>("guardar_archivo", {
          ruta: como ? null : (d.ruta ?? null),
          contenido: d.texto,
          nombre: d.nombre,
        });
        if (!nuevaRuta) return;
        setDocs((prev) =>
          prev.map((x) =>
            x.id === d.id
              ? { ...x, ruta: nuevaRuta, nombre: nombreDe(nuevaRuta), sucio: false }
              : x,
          ),
        );
        setMensaje(`Guardado: ${nuevaRuta}`);
      } catch (err) {
        setMensaje(`Error al guardar: ${String(err)}`);
      }
    },
    [docActual, guardarEnProyecto],
  );

  // Archivos .gtt (una base SQLite por proyecto): guarda/abre el documento
  // actual con round-trip fiel del YAML (se conserva como param `contenido`).
  const guardarGtt = useCallback(
    async (como: boolean) => {
      const d = docActual;
      if (!d) return;
      try {
        const p = yamlAProyecto(d.texto);
        const yaEsGtt = d.ruta?.toLowerCase().endsWith(".gtt") ?? false;
        const ruta = await invoke<string | null>("guardar_gtt", {
          ruta: como || !yaEsGtt ? null : d.ruta,
          tareas: p.tareas,
          deps: p.deps,
          params: p.params,
          nombreSugerido: d.nombre.replace(/\.[^.]+$/, "") || "carta-gantt",
        });
        if (!ruta) return;
        setDocs((prev) =>
          prev.map((x) =>
            x.id === d.id
              ? { ...x, ruta, nombre: nombreDe(ruta), sucio: false, proyectoId: undefined }
              : x,
          ),
        );
        setMensaje(`Guardado .gtt: ${ruta}`);
      } catch (err) {
        setMensaje(`Error al guardar .gtt: ${String(err)}`);
      }
    },
    [docActual],
  );

  const abrirGtt = useCallback(async () => {
    try {
      const r = await invoke<{ ruta: string; nombre: string; proyecto: ProyectoCompleto } | null>(
        "cargar_gtt",
      );
      if (!r) return;
      const textoNuevo = proyectoAYaml(r.proyecto);
      const id = `doc-${Date.now()}`;
      idActivoRef.current = id;
      setDocs((prev) => [
        ...prev,
        { id, nombre: nombreDe(r.ruta), ruta: r.ruta, texto: textoNuevo, sucio: false },
      ]);
      setIdActivo(id);
      ponerEnEditor(textoNuevo);
      setMensaje(`Abierto .gtt: ${r.ruta}`);
    } catch (err) {
      setMensaje(`Error al abrir .gtt: ${String(err)}`);
    }
  }, [ponerEnEditor]);

  const cerrarDoc = useCallback((id: string) => {
      const d = docs.find((x) => x.id === id);
      if (!d) return;
      if (d.sucio && !window.confirm(`"${d.nombre}" tiene cambios sin guardar. ¿Cerrar igualmente?`)) {
        return;
      }
      const restantes = docs.filter((x) => x.id !== id);
      const nuevaLista = restantes.length ? restantes : [docVacio(`doc-${Date.now()}`)];
      setDocs(nuevaLista);
      if (id !== idActivo) return;
      const primera = nuevaLista[0];
      idActivoRef.current = primera.id;
      setIdActivo(primera.id);
      ponerEnEditor(primera.texto);
    },
    [docs, idActivo, ponerEnEditor],
  );

  useEffect(() => {
    const manejar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tecla = e.key.toLowerCase();
      if (tecla === "s") {
        e.preventDefault();
        void guardarDoc(false);
      } else if (tecla === "n") {
        e.preventDefault();
        nuevoDoc();
      } else if (tecla === "o") {
        e.preventDefault();
        void abrirArchivo();
      }
    };
    window.addEventListener("keydown", manejar);
    return () => window.removeEventListener("keydown", manejar);
  }, [guardarDoc, nuevoDoc, abrirArchivo]);

  const fijarNiveles = useCallback(
    (nivel: string) => cambiarParametro("mostrar-niveles", nivel),
    [cambiarParametro],
  );

  useEffect(() => {
    if (!arrastrandoDivisor) return;
    const mover = (e: PointerEvent) => {
      const caja = contenidoRef.current;
      if (!caja) return;
      const r = caja.getBoundingClientRect();
      const pct = ((e.clientX - r.left) / r.width) * 100;
      setAnchoEditorPct(Math.min(78, Math.max(22, pct)));
    };
    const soltar = () => setArrastrandoDivisor(false);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.userSelect = "";
    };
  }, [arrastrandoDivisor]);

  // Sincronización continua de la tabla y la carta: con el mismo paso vertical
  // (alto-fila × escala del SVG) y un delta de desplazamiento constante, la
  // fila i y la banda i quedan a la misma altura en pantalla siempre.
  useEffect(() => {
    const contC = svgCaja.current;
    const contT = tablaPanelRef.current;
    if (vistaIzquierda !== "tabla" || !contC || !contT || !svg || !geometria) return;
    if (!geometria.bandas.length) return;
    const svgEl = contC.querySelector("svg");
    if (!svgEl) return;

    let limpiar: Array<() => void> = [];
    let ultimo = "";
    const aplicar = () => {
      const sr = svgEl.getBoundingClientRect();
      if (sr.height <= 0) return;
      const escala = sr.height / geometria.alto;
      const b = geometria.bandas;
      const pasoBanda = (b[1]?.y0 - b[0].y0) * escala;
      const paso =
        Number.isFinite(pasoBanda) && pasoBanda > 0
          ? pasoBanda
          : Number(parametros["alto-fila"] ?? 0.6) * 28.346 * escala;
      const fila0 = contT.querySelector("tbody tr.fila-tarea") as HTMLElement | null;
    if (!fila0) return;
    // espacio previo de la carta antes de la primera banda (calendario), para
    // replicarlo como espaciador antes de la primera fila de la tabla.
    const cr = contC.getBoundingClientRect();
    const espIni = sr.top + b[0].y0 * escala - (cr.top - contC.scrollTop);
    contT.style.setProperty("--espacio-ini", `${Math.max(0, espIni).toFixed(2)}px`);
    // const K = posición en pantalla (layout) de banda 0 menos la de fila 0,
    // independiente del scroll actual: offC y offR se calculan quitando la
    // dependencia de scrollTop, de modo que K es estable entre re-ejecuciones.
    const offC = sr.top + b[0].y0 * escala + contC.scrollTop;
    const offR = fila0.getBoundingClientRect().top + contT.scrollTop;
    const k = offC - offR;
    const firma = `${Math.max(4, paso).toFixed(2)}|${k.toFixed(2)}`;
    if (firma === ultimo) return;
    ultimo = firma;

    limpiar.forEach((f) => f());
    limpiar = [];
    const pasoPx = Math.max(4, paso).toFixed(2);
    contT.style.setProperty("--fila-px", `${pasoPx}px`);
    contT.style.setProperty("--espacio-ini", `${Math.max(0, espIni).toFixed(2)}px`);

    const tope = (el: HTMLElement, v: number) =>
      Math.min(Math.max(0, v), Math.max(0, el.scrollHeight - el.clientHeight));
    let sincro = false;
    const terminar = () => requestAnimationFrame(() => (sincro = false));
    const onTabla = () => {
      if (sincro) return;
      sincro = true;
      contC.scrollTop = tope(contC, contT.scrollTop + k);
      terminar();
    };
    const onCarta = () => {
      if (sincro) return;
      sincro = true;
      contT.scrollTop = tope(contT, contC.scrollTop - k);
      terminar();
    };
    contT.addEventListener("scroll", onTabla);
    contC.addEventListener("scroll", onCarta);
    limpiar.push(() => {
      contT.removeEventListener("scroll", onTabla);
      contC.removeEventListener("scroll", onCarta);
    });

    // alinear también el estado inicial (sin esperar el primer scroll: al
    // montar la tabla ambos contenedores están en 0 y las filas se desvían de
    // las bandas en k px).
    sincro = true;
    contC.scrollTop = tope(contC, contT.scrollTop + k);
    contT.scrollTop = tope(contT, contC.scrollTop - k);
    terminar();
    };

    aplicar();
    const ro = new ResizeObserver(() => aplicar());
    ro.observe(contC);
    ro.observe(contT);
    return () => {
      ro.disconnect();
      limpiar.forEach((f) => f());
    };
  }, [svg, zoom, anchoEditorPct, vistaIzquierda, geometria, parametros]);

  // clic derecho sobre una fecha AAAA-MM-DD del YAML: calendario para elegirla
  const alClicDerechoEditor = useCallback((e: React.MouseEvent) => {
    const v = editorRef.current;
    if (!v) return;
    const pos = v.posAtCoords({ x: e.clientX, y: e.clientY }, false);
    if (pos === null) return;
    const linea = v.state.doc.lineAt(pos);
    const off = pos - linea.from;
    const re = /\d{4}-\d{2}-\d{2}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(linea.text)) !== null) {
      if (off >= m.index && off <= m.index + m[0].length) {
        e.preventDefault();
        setPopupFecha({
          x: e.clientX,
          y: e.clientY,
          desde: linea.from + m.index,
          hasta: linea.from + m.index + 10,
          valor: m[0],
        });
        return;
      }
    }
    const tarea = tareasTodasRef.current.find((t) => t.linea === linea.number);
    if (tarea) {
      e.preventDefault();
      setMenuTarea({ x: e.clientX, y: e.clientY, codigo: tarea.id, nombre: tarea.nombre });
    }
  }, []);

  const aplicarFecha = (nueva: string) => {
    if (!nueva || !popupFecha) return;
    const v = editorRef.current;
    if (v) {
      v.dispatch({ changes: { from: popupFecha.desde, to: popupFecha.hasta, insert: nueva } });
      v.focus();
    }
    setPopupFecha(null);
  };

  useEffect(() => {
    if (!popupFecha) return;
    const input = inputFecha.current;
    if (input) {
      input.focus();
      try {
        (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      } catch {
        // sin activación de usuario suficiente: el usuario abre el calendario a mano
      }
    }
    const cerrar = (ev: Event) => {
      if (ev instanceof KeyboardEvent) {
        if (ev.key === "Escape") setPopupFecha(null);
        return;
      }
      const el = ev.target as Element | null;
      if (el?.closest?.(".popup-fecha")) return;
      setPopupFecha(null);
    };
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", cerrar);
    return () => {
      window.removeEventListener("mousedown", cerrar);
      window.removeEventListener("keydown", cerrar);
    };
  }, [popupFecha]);

  // cierra el menú desplegable de exportación al hacer click o tecla afuera
  useEffect(() => {
    if (!exportMenuAbierto) return;
    const cerrar = (ev: Event) => {
      if (ev instanceof KeyboardEvent) {
        if (ev.key === "Escape") setExportMenuAbierto(false);
        return;
      }
      const el = ev.target as Element | null;
      if (el?.closest?.(".export-menu")) return;
      setExportMenuAbierto(false);
    };
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", cerrar);
    return () => {
      window.removeEventListener("mousedown", cerrar);
      window.removeEventListener("keydown", cerrar);
    };
  }, [exportMenuAbierto]);

  // cierra el menú desplegable de importación al hacer click o tecla afuera
  useEffect(() => {
    if (!importMenuAbierto) return;
    const cerrar = (ev: Event) => {
      if (ev instanceof KeyboardEvent) {
        if (ev.key === "Escape") setImportMenuAbierto(false);
        return;
      }
      const el = ev.target as Element | null;
      if (el?.closest?.(".import-menu")) return;
      setImportMenuAbierto(false);
    };
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", cerrar);
    return () => {
      window.removeEventListener("mousedown", cerrar);
      window.removeEventListener("keydown", cerrar);
    };
  }, [importMenuAbierto]);

  // todas las exportaciones abren "Guardar como" con nombre propuesto
  // AAAA-MM-DD_<documento>.<ext> (editable, para no pisar archivos) y como
  // carpeta inicial la del .yaml fuente si el documento ya está guardado
  const elegirDestino = async (ext: string): Promise<string | null> => {
    const base = docActual.nombre.replace(/\.[^.]+$/, "") || "carta-gantt";
    const r = docActual.ruta ?? "";
    const i = Math.max(r.lastIndexOf("\\"), r.lastIndexOf("/"));
    const dir = i > 0 ? r.slice(0, i) : null;
    const dt = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    const fecha = `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
    try {
      return await invoke<string | null>("elegir_destino", {
        nombre: `${fecha}_${base}.${ext}`,
        carpeta: dir,
      });
    } catch (err) {
      setMensaje(`Error: ${String(err)}`);
      return null;
    }
  };

  // fecha de un parámetro (inicio-proyecto | termino-proyecto), sin vacíos
  const fechaOpt = (k: string) => {
    const v = parametros[k];
    return typeof v === "string" && v.trim() !== "" ? v : undefined;
  };

  const exportarPdf = async () => {
    setExportando(true);
    setMensaje("");
    try {
      const destino = await elegirDestino("pdf");
      if (!destino) return;
      // Fechas y costos resueltos por el motor Rust (inyeccion => YAML que
      // gantt.typ consume sin recalcular): mismo contrato de preparar-tareas.
      let yaml = textoRef.current;
      try {
        yaml = await invoke<string>("filas_a_yaml", {
          texto: textoRef.current,
          cpm: parametros["cpm"] === true,
          inicioProyecto: fechaOpt("inicio-proyecto"),
          terminoProyecto: fechaOpt("termino-proyecto"),
        });
      } catch (err) {
        setMensaje(`Inyección Rust no disponible, usando YAML crudo: ${String(err)}`);
        yaml = textoRef.current;
      }
      const ruta = await invoke<string>("exportar_pdf", {
        yaml,
        plantilla: generarMainTyp(parametros),
        fuentes: fuentesLibreria(),
        destino,
      });
      setMensaje(`PDF exportado: ${ruta}`);
    } catch (err) {
      setMensaje(`Error: ${String(err)}`);
    } finally {
      setExportando(false);
    }
  };

  const exportarSvg = async () => {
    if (!svg) return;
    const destino = await elegirDestino("svg");
    if (!destino) return;
    try {
      // el renderer incrusta un <script> con JS que trae "&&" sin escapar:
      // inválido como XML y además inútil en un .svg guardado
      const svgLimpio = svg.replace(/<script[\s\S]*?<\/script>/g, "");
      await invoke<string | null>("guardar_archivo", { ruta: destino, contenido: svgLimpio });
      setMensaje(`SVG exportado: ${destino}`);
    } catch (err) {
      setMensaje(`Error: ${String(err)}`);
    }
  };

  const exportarPlan = async (formato: "mspdi" | "pmxml" | "xer") => {
    try {
      // Motor en Rust (dominio), filas Fila[] ya resueltas (misma API que
      // definía proyecto.ts, hoy eliminado)
      const filas: Fila[] = await invoke<Fila[]>("preparar_filas", {
        texto: textoRef.current,
        cpm: parametros["cpm"] === true,
        inicioProyecto: fechaOpt("inicio-proyecto"),
        terminoProyecto: fechaOpt("termino-proyecto"),
      });
      if (!filas.length) {
        setMensaje("nada que exportar: no se reconocieron tareas en el YAML");
        return;
      }
      const ext = formato === "xer" ? "xer" : "xml";
      const destino = await elegirDestino(ext);
      if (!destino) return;
      // Serialización en Rust (exportar.rs, mismo contrato que exportadores.ts)
      let contenido: string;
      try {
        contenido = await invoke<string>("exportar_plan", {
          texto: textoRef.current,
          formato,
          inicioProyecto: fechaOpt("inicio-proyecto"),
          terminoProyecto: fechaOpt("termino-proyecto"),
        });
      } catch (err) {
        setMensaje(`Exportador Rust no disponible, usando TS: ${String(err)}`);
        const p = { nombre: docActual.nombre.replace(/\.[^.]+$/, "") || "carta-gantt", filas };
        contenido =
          formato === "mspdi" ? aMSPDI(p)
          : formato === "pmxml" ? aPMXML(p)
          : aXER(p);
      }
      await invoke<string | null>("guardar_archivo", { ruta: destino, contenido });
      setMensaje(`Exportado ${formato.toUpperCase()}: ${destino}`);
    } catch (err) {
      setMensaje(`Error al exportar: ${String(err)}`);
    }
  };

  const exportarExcel = async () => {
    const destino = await elegirDestino("xlsx");
    if (!destino) return;
    try {
      const ruta = await invoke<string>("exportar_excel", {
        texto: textoRef.current,
        inicioProyecto: fechaOpt("inicio-proyecto"),
        terminoProyecto: fechaOpt("termino-proyecto"),
        destino,
      });
      setMensaje(`Excel exportado: ${ruta}`);
    } catch (err) {
      setMensaje(`Error al exportar Excel: ${String(err)}`);
    }
  };

  const nProblemas = errores.length + erroresValidacion.length;

  const estados: "ok" | "error" | "compilando" =
    nProblemas
      ? "error"
      : svg
        ? "ok"
        : "compilando";

  return (
    <div className="app">
      <header className="cabecera">
        <h1>Gantt Editor</h1>
        <button onClick={() => setMenuAbierto(true)} title="Editar los parámetros de carta-gantt">
          Configurar
        </button>
        <div className={`estado estado-${estados}`}>
          {nProblemas
            ? `${nProblemas} problema(s)`
            : svg
              ? `ok · ${milis.toFixed(0)} ms · ${tareas.length} tareas`
              : "compilando…"}
        </div>
        <button onClick={exportarPdf} disabled={exportando || estados !== "ok"}>
          {exportando ? "Exportando…" : "Exportar PDF"}
        </button>
        <button onClick={exportarSvg} disabled={estados !== "ok"} title="Guardar el SVG del preview">
          Exportar SVG
        </button>
        <div className="export-menu">
          <button
            className="export-toggle"
            onClick={() => setExportMenuAbierto((o) => !o)}
            disabled={estados !== "ok"}
            title="Exportar el plan a formatos de proyecto"
          >
            Exportar plan…
            <span className="export-flecha">{exportMenuAbierto ? "▲" : "▼"}</span>
          </button>
          {exportMenuAbierto && (
            <div className="export-lista">
              <button
                disabled={estados !== "ok"}
                onClick={() => {
                  setExportMenuAbierto(false);
                  exportarPlan("mspdi");
                }}
              >
                MSPDI
              </button>
              <button
                disabled={estados !== "ok"}
                onClick={() => {
                  setExportMenuAbierto(false);
                  exportarPlan("pmxml");
                }}
              >
                PMXML
              </button>
              <button
                disabled={estados !== "ok"}
                onClick={() => {
                  setExportMenuAbierto(false);
                  exportarPlan("xer");
                }}
              >
                XER
              </button>
              <button
                disabled={estados !== "ok"}
                onClick={() => {
                  setExportMenuAbierto(false);
                  exportarExcel();
                }}
              >
                Excel
              </button>
            </div>
          )}
        </div>
        {mensaje && <span className="mensaje">{mensaje}</span>}
      </header>

      <div className="barra-archivos">
        <div className="pestanas">
          {docs.map((d) => (
            <button
              key={d.id}
              className={`pestana${d.id === idActivo ? " activa" : ""}`}
              onClick={() => seleccionarDoc(d.id)}
              title={d.proyectoId !== undefined ? `Proyecto #${d.proyectoId} · ${d.ruta ?? d.nombre}` : (d.ruta ?? d.nombre)}
            >
              {d.proyectoId !== undefined && <span className="pestana-proyecto">◆</span>}
              {d.nombre}
              {d.sucio && <span className="pestana-sucio"> •</span>}
            </button>
          ))}
        </div>
        <div className="acciones-archivo">
          <button onClick={nuevoDoc} title="Nuevo documento">
            Nuevo
          </button>
          <button onClick={() => void abrirArchivo()} title="Abrir archivo…">
            Abrir…
          </button>
          <button onClick={() => void abrirGtt()} title="Abrir un archivo .gtt (proyecto SQLite)">
            Abrir .gtt…
          </button>
          <div className="import-menu">
            <button
              className="import-toggle"
              onClick={() => setImportMenuAbierto((o) => !o)}
              title="Importar un plan desde otro formato"
            >
              Importar…
              <span className="import-flecha">{importMenuAbierto ? "▲" : "▼"}</span>
            </button>
            {importMenuAbierto && (
              <div className="import-lista">
                {(["mspdi", "pmxml", "xer", "excel"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      setImportMenuAbierto(false);
                      if (fmt === "excel") void importarExcel();
                      else void importarTexto(fmt);
                    }}
                  >
                    {fmt === "mspdi" ? "MSPDI" : fmt === "excel" ? "Excel" : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => guardarDoc(false)}
            disabled={hayErroresValidacion}
            title={hayErroresValidacion ? "Corrige los errores de validación antes de guardar" : "Guardar (Ctrl+S)"}
          >
            Guardar
          </button>
          <button
            onClick={() => guardarDoc(true)}
            disabled={hayErroresValidacion}
            title={hayErroresValidacion ? "Corrige los errores de validación antes de guardar" : "Guardar como…"}
          >
            Guardar como…
          </button>
          <button
            onClick={() => void guardarGtt(false)}
            title="Guardar el documento en un archivo .gtt (un proyecto por archivo). Si el archivo ya es .gtt, guarda en el mismo"
          >
            Guardar .gtt
          </button>
          <button
            onClick={() => setEditorOculto((o) => !o)}
            title="Ocultar o mostrar el panel de edición (tabla o YAML) para que la carta use todo el ancho"
          >
            {editorOculto ? "Mostrar panel" : "Ocultar panel"}
          </button>
          <button onClick={() => setMenuProyectosAbierto(true)} title="Proyectos guardados en la biblioteca">
            Proyectos…
          </button>
          <button onClick={() => cerrarDoc(idActivo)} title="Cerrar documento">
            Cerrar
          </button>
        </div>
      </div>

      <main
        className={`contenido${editorOculto ? " editor-oculto" : ""}`}
        ref={contenidoRef}
        style={{
          gridTemplateColumns: editorOculto
            ? "0px 0px 1fr"
            : `minmax(280px, ${anchoEditorPct}%) 7px 1fr`,
        }}
      >
        <section className="panel-editor" onContextMenu={alClicDerechoEditor}>
          <div className="editor-cab">
            <span className="editor-vistas">
              <button
                type="button"
                className={vistaIzquierda === "yaml" ? "activa" : ""}
                onClick={() => setVistaIzquierda("yaml")}
                title="Ver el YAML del proyecto"
              >
                YAML
              </button>
              <button
                type="button"
                className={vistaIzquierda === "tabla" ? "activa" : ""}
                onClick={() => setVistaIzquierda("tabla")}
                title="Editar las tareas en una tabla"
              >
                Tabla
              </button>
            </span>
            {vistaIzquierda === "yaml" && (
              <>
                <span className="editor-estado">
                  <span className={`editor-etiqueta${editorEditable ? " activo" : ""}`}>
                    {editorEditable ? "editable" : "solo lectura"}
                  </span>
                </span>
                <button
                  className="editor-desbloquear"
                  onClick={alternarEditorEditable}
                  title={
                    editorEditable
                      ? "Volver a solo lectura: las ediciones pasan solo por la carta"
                      : "Habilitar la edición directa del YAML (con riesgo de invalidar la carta)"
                  }
                >
                  {editorEditable ? "Bloquear texto" : "Editar texto"}
                </button>
              </>
            )}
          </div>
          <div ref={contenedorEditor} className={`editor${vistaIzquierda === "tabla" ? " oculto" : ""}`} />
          <PanelTabla
            texto={texto}
            oculto={vistaIzquierda !== "tabla"}
            seleccion={tablaSeleccion}
            maxNivel={nivelActual}
            tablaRef={tablaPanelRef}
            onCambiar={ponerEnEditor}
            onSeleccionar={setTablaSeleccion}
          />
        </section>

        <div
          className={`divisor${arrastrandoDivisor ? " divisor-activo" : ""}`}
          title="Arrastrar para redimensionar · doble clic: restablecer"
          onPointerDown={(e) => {
            e.preventDefault();
            setArrastrandoDivisor(true);
          }}
          onDoubleClick={() => setAnchoEditorPct(40)}
        />

        <section className="panel-preview">
          {svg && geometria ? (
            <>
              <div className="zoom-barra">
                <button
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / 1.25))}
                  title="Alejar"
                >
                  −
                </button>
                <button
                  onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
                  title="Acercar"
                >
                  +
                </button>
                <button onClick={() => setZoom(1)} title="Ajustar al ancho">
                  Ajustar
                </button>
                <span className="zoom-pct">{Math.round(zoom * 100)}%</span>
                {/** niveles */}
                <span className="zoom-sep" />
                <button onClick={() => fijarNiveles("1")} title="Colapsar: mostrar solo el nivel 1">
                  Colapsar
                </button>
                <button onClick={() => fijarNiveles("auto")} title="Expandir: mostrar todos los niveles">
                  Expandir
                </button>
                <span className="zoom-pct">
                  Niveles: {nivelActual === "auto" ? "todos" : nivelActual}
                </span>
                <span className="zoom-ayuda">Ctrl + rueda: zoom · clic: ir a la línea · clic derecho: propiedades</span>
              </div>
              <div
                ref={svgCaja}
                className="svg-contenedor"
                onClick={alClicSvg}
                onDoubleClick={alDobleClicCarta}
                onContextMenu={alClicDerechoCarta}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: svg }}
                  className="svg-hoja"
                  style={{ width: `${zoom * 100}%` }}
                />
              </div>
            </>
          ) : (
            <div className="aviso">
              {errores.length ? (
                <pre className="errores">{errores.join("\n")}</pre>
              ) : (
                "Compilando…"
              )}
            </div>
          )}
        </section>
      </main>
      {diagnosticos.length > 0 && (
        <div className="diagnosticos">
          {diagnosticos.slice(0, 12).map((d, i) => (
            <button
              key={i}
              className={`diag diag-${d.severidad}${d.correccion ? " diag-corregible" : ""}`}
              onClick={
                d.correccion
                  ? () => corregirInconsistencia(d.correccion!.codigo, d.correccion!.duracionCalculada)
                  : () => irALinea(d.linea)
              }
              title={d.correccion ? "Corregir la duración para que coincida con el término" : "Mostrar el YAML en esa línea"}
            >
              <span className="diag-linea">{d.linea}</span>
              <span className="diag-texto">{d.mensaje}</span>
            </button>
          ))}
          {diagnosticos.length > 12 && (
            <span className="diag-mas">… y {diagnosticos.length - 12} más</span>
          )}
        </div>
      )}
      {menuAbierto && (
        <MenuParametros
          valores={parametros}
          ventanaCalculada={ventanaCalculada}
          onCambiar={cambiarParametro}
          onRestablecer={restablecerParametros}
          onCerrar={cerrarMenu}
        />
      )}
      {menuCalendario && (
        <MenuCalendario
          x={menuCalendario.x}
          y={menuCalendario.y}
          valores={parametros}
          ventanaCalculada={ventanaCalculada}
          onCambiar={cambiarParametro}
          onVerMas={() => {
            setMenuCalendario(null);
            setMenuAbierto(true);
          }}
          onCerrar={() => setMenuCalendario(null)}
        />
      )}
      {menuColumnas && (
        <MenuColumnas
          x={menuColumnas.x}
          y={menuColumnas.y}
          valores={parametros}
          onCambiar={cambiarParametro}
          onVerMas={() => {
            setMenuColumnas(null);
            setMenuAbierto(true);
          }}
          onCerrar={() => setMenuColumnas(null)}
        />
      )}
      {menuTarea && (
        <MenuTarea
          x={menuTarea.x}
          y={menuTarea.y}
          codigo={menuTarea.codigo}
          nombre={menuTarea.nombre}
          texto={texto}
          copiado={copiado}
          onCambiar={ponerEnEditor}
          onCopia={setCopiado}
          onAviso={setMensaje}
          onPredecesoras={() => abrirPredecesoras(menuTarea.codigo, menuTarea.nombre)}
          onApu={() => {
            setMenuTarea(null);
            setApuAbierto({ codigo: menuTarea.codigo });
          }}
          onCerrar={() => setMenuTarea(null)}
        />
      )}
      {apuAbierto && (
        <AnalisisApu
          codigo={apuAbierto.codigo}
          texto={texto}
          onInsertarPu={(codigo, pu) => {
            try {
              ponerEnEditor(editarCampo(textoRef.current, codigo, "costo-unitario", pu));
              setMensaje(`'${codigo}': costo-unitario = ${pu.toLocaleString("es-CL")} insertado desde el APU`);
            } catch (err) {
              setMensaje(`Error al insertar el PU: ${String(err)}`);
            }
          }}
          onCerrar={() => setApuAbierto(null)}
        />
      )}
      {editorPredecesoras && (
        <EditorPredecesoras
          codigo={editorPredecesoras.codigo}
          nombre={editorPredecesoras.nombre}
          tareas={tareasTodas}
          cpm={cpmActivado}
          onGuardar={guardarPredecesoras}
          onCerrar={() => setEditorPredecesoras(null)}
        />
      )}
      {menuProyectosAbierto && (
        <MenuProyectos
          proyectos={proyectos}
          proyectoActivo={docActual?.proyectoId ?? null}
          onAbrir={(id) => {
            setMenuProyectosAbierto(false);
            void cargarProyecto(id);
          }}
          onGuardarEn={(id) => {
            void guardarEnProyecto(id);
          }}
          onNuevoYGuardar={(nombre) => {
            void crearProyectoYGuardar(nombre);
          }}
          onBorrar={(id) => {
            void borrarProyecto(id);
          }}
          onCerrar={() => setMenuProyectosAbierto(false)}
        />
      )}
      {popupFecha && (
        <div className="popup-fecha" style={{ left: popupFecha.x, top: popupFecha.y + 6 }}>
          <input
            ref={inputFecha}
            type="date"
            defaultValue={popupFecha.valor}
            onChange={(ev) => aplicarFecha(ev.currentTarget.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") aplicarFecha(ev.currentTarget.value);
            }}
          />
          <span className="popup-fecha-ayuda">Enter aplica · Esc cierra</span>
        </div>
      )}
      {excelRangos && (
        <div className="popup-excel">
          <h3 className="popup-excel-titulo">Importar {nombreDe(excelRangos.ruta)}</h3>
          {excelRangos.info.rangos.length === 0 ? (
            <p className="popup-excel-ayuda">El libro no tiene rangos con nombre.</p>
          ) : (
            <div className="popup-excel-lista">
              {excelRangos.info.rangos.map((r) => (
                <button key={r.nombre} onClick={() => void usarRangoExcel(r.refe)}>
                  {r.nombre}
                  <span className="popup-excel-refe">{r.refe}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => void usarRangoExcel(null)}>
            Toda la hoja ({excelRangos.info.hojaSugerida})
          </button>
          <button className="secundario" onClick={() => setExcelRangos(null)}>
            Cancelar
          </button>
        </div>
      )}
      {excelMapa && mapaSel && (
        <div className="popup-excel">
          <h3 className="popup-excel-titulo">Mapear columnas de {nombreDe(excelMapa.ruta)}</h3>
          <p className="popup-excel-ayuda">
            Faltó reconocer: {excelMapa.det.dudas.join(", ")}. Ajusta las columnas o deja "—" para
            omitir un campo.
          </p>
          {(Object.keys(mapaSel) as (keyof ColumnasExcel)[]).map((campo) => (
            <label key={campo} className="popup-excel-campo">
              <span>{campo}</span>
              <select
                value={mapaSel[campo] ?? ""}
                onChange={(ev) =>
                  setMapaSel({
                    ...mapaSel,
                    [campo]: ev.currentTarget.value === "" ? null : Number(ev.currentTarget.value),
                  })
                }
              >
                <option value="">—</option>
                {excelMapa.det.encabezados.map((h, j) => (
                  <option key={j} value={j}>
                    {j + 1}. {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="popup-excel-botones">
            <button onClick={confirmarMapa}>Importar</button>
            <button className="secundario" onClick={() => setExcelMapa(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {propsTarea && camposTarea && (
        <PropiedadesTarea
          x={propsTarea.x}
          y={propsTarea.y}
          codigo={propsTarea.codigo}
          nombre={String(camposTarea.nombre ?? propsTarea.codigo)}
          campos={camposTarea}
          onAplicar={aplicarCampoTarea}
          onCerrar={() => setPropsTarea(null)}
        />
      )}
    </div>
  );
}

export default App;