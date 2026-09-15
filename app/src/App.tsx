import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import { invoke } from "@tauri-apps/api/core";
import ejemploDatos from "../../ejemplos/ejemplo_1.yaml?raw";
import { compilarSvg, fuentesLibreria } from "./lib/libreria";
import { analizarSvg } from "./lib/geometria";
import { listarTareas } from "./lib/yamlLineas";
import { generarMainTyp, valoresDefault, type Valor } from "./lib/params";
import { prepararProyecto, type Fila } from "./lib/proyecto";
import { aMSPDI, aPMXML, aXER } from "./lib/exportadores";
import { desdeMSPDI, esMSPDI } from "./lib/mspdi";
import { excelAYaml, detectarColumnas, type ColumnasExcel, type Deteccion, type MatrizExcel } from "./lib/excelImport";
import { editarCampo, leerCampo, leerConfigYaml, type ValorCampo } from "./lib/yamlEdicion";
import { proyectoAYaml, yamlAProyecto, type ProyectoCompleto } from "./lib/proyectoDb";
import MenuParametros from "./MenuParametros";
import MenuProyectos, { type ProyectoInfo } from "./MenuProyectos";
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
  const [arrastrandoDivisor, setArrastrandoDivisor] = useState(false);
  const contenidoRef = useRef<HTMLElement | null>(null);
  const [parametros, setParametros] = useState<Record<string, Valor>>(() => valoresDefault());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuProyectosAbierto, setMenuProyectosAbierto] = useState(false);
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

  useEffect(() => {
    let vivo = true;
    const temporizador = window.setTimeout(async () => {
      const r = await compilarSvg(texto, mainTyp);
      if (!vivo) return;
      setSvg(r.svg);
      setErrores(r.errores);
      setMilis(r.milis);
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(temporizador);
    };
  }, [texto, mainTyp]);

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
      if (i >= 0) saltarATarea(i);
    },
    [indiceDePunto, saltarATarea],
  );

  const ponerEnEditor = useCallback((textoNuevo: string) => {
    const v = editorRef.current;
    if (!v) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: textoNuevo } });
  }, []);

  const alClicDerechoCarta = useCallback(
    (e: React.MouseEvent) => {
      const i = indiceDePunto(e);
      if (i >= 0 && tareas[i]) {
        e.preventDefault();
        setPropsTarea({ x: e.clientX, y: e.clientY, codigo: tareas[i].id });
      }
    },
    [indiceDePunto, tareas],
  );

  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);
  const cambiarParametro = useCallback(
    (clave: string, valor: Valor) =>
      setParametros((prev) => ({ ...prev, [clave]: valor })),
    [],
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
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsTarea, texto]);

  const aplicarCampoTarea = useCallback(
    (clave: string, valor: ValorCampo) => {
      if (!propsTarea) return;
      try {
        ponerEnEditor(editarCampo(textoRef.current, propsTarea.codigo, clave, valor));
      } catch (err) {
        setMensaje(`Error al editar: ${String(err)}`);
      }
    },
    [propsTarea, ponerEnEditor],
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

  const cerrarDoc = useCallback(
    (id: string) => {
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
      // Motor en Rust (dominio), misma API Fila[] que proyecto.ts
      let filas: Fila[];
      try {
        filas = await invoke<Fila[]>("preparar_filas", {
          texto: textoRef.current,
          cpm: parametros["cpm"] === true,
          inicioProyecto: fechaOpt("inicio-proyecto"),
          terminoProyecto: fechaOpt("termino-proyecto"),
        });
      } catch (err) {
        setMensaje(`Motor Rust no disponible, usando TS: ${String(err)}`);
        filas = prepararProyecto(textoRef.current, {
          cpm: parametros["cpm"] === true,
          inicioProyecto: fechaOpt("inicio-proyecto"),
          terminoProyecto: fechaOpt("termino-proyecto"),
        });
      }
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

  const estados: "ok" | "error" | "compilando" = errores.length
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
          {errores.length
            ? `${errores.length} error(es)`
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
          <button onClick={() => guardarDoc(false)} title="Guardar (Ctrl+S)">
            Guardar
          </button>
          <button onClick={() => guardarDoc(true)} title="Guardar como…">
            Guardar como…
          </button>
          <button
            onClick={() => setEditorOculto((o) => !o)}
            title="Ocultar o mostrar el editor YAML (la carta usa todo el ancho)"
          >
            {editorOculto ? "Mostrar YAML" : "Ocultar YAML"}
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
          <div ref={contenedorEditor} className="editor" />
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
      {menuAbierto && (
        <MenuParametros
          valores={parametros}
          onCambiar={cambiarParametro}
          onRestablecer={restablecerParametros}
          onCerrar={cerrarMenu}
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