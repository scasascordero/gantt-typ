import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ejemploDatos from "../../ejemplos/ejemplo_1.yaml?raw";
import { fuentesLibreria, necesitaCpm } from "./lib/libreria";
import { dibujarGantt, formatearFecha, type VistaGantt } from "./lib/layout-gantt";
import { TablaGantt, type CeldaEdicion } from "./TablaGantt";
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
import Recursos from "./Recursos";
import MenuCalendario from "./MenuCalendario";
import MenuColumnas from "./MenuColumnas";
import { proyectoAYaml, yamlAProyecto, type ProyectoCompleto } from "./lib/proyectoDb";
import MenuParametros from "./MenuParametros";
import MenuProyectos, { type ProyectoInfo } from "./MenuProyectos";
import MenuTarea from "./MenuTarea";
import PropiedadesTarea from "./PropiedadesTarea";
import VistaImpresion, { type VistaImpresionEstado } from "./VistaImpresion";
import "./App.css";

// Coerción del texto de una celda editada inline al valor YAML correspondiente.
// Fechas: AAAA-MM-DD. Avance: "50" o "50%" → 0.5. Campos numéricos: número, o
// la cadena tal cual si es una fórmula ("160*2"); vacío → null (borra el campo).
function coerceValorCelda(campo: string, s: string): ValorCampo {
  switch (campo) {
    case "unidad":
      return s === "" ? null : s;
    case "inicio":
    case "termino":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Fecha esperada en formato AAAA-MM-DD ("${s}")`);
      return s;
    case "avance": {
      const t = s.replace(/%$/, "").trim();
      if (!/^-?\d*\.?\d+$/.test(t)) throw new Error(`Avance esperado en % ("${s}")`);
      const n = Number(t);
      return Math.abs(n) > 1 ? n / 100 : n;
    }
    default: {
      if (s === "") return null;
      return /^-?\d*\.?\d+$/.test(s) ? Number(s) : s;
    }
  }
}

// Piezas de la barra de menú: una franja con menús desplegables (Archivo,
// Importar, Exportar, Editar, Ver) que agrupa todos los botones de la UI.
function MenuRaiz({
  nombre,
  abierto,
  onToggle,
  children,
}: {
  nombre: string;
  abierto: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={abierto ? "menu-raiz abierto" : "menu-raiz"}>
      <button
        type="button"
        className="menu-raiz-titulo"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={abierto}
      >
        {nombre}
      </button>
      {abierto && (
        <div className="menu-desp" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuSep() {
  return <div className="menu-sep" />;
}

function MenuItem({
  activa,
  deshabilitado,
  info,
  onClick,
  children,
}: {
  activa?: boolean;
  deshabilitado?: boolean;
  info?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={"menu-item" + (activa ? " activa" : "")}
      role="menuitem"
      disabled={deshabilitado}
      onClick={onClick}
    >
      <span>{children}</span>
      {info && <span className="menu-item-info">{info}</span>}
    </button>
  );
}

function MenuInfo({ children }: { children: ReactNode }) {
  return <span className="menu-info">{children}</span>;
}

function fijarTituloVentana(titulo: string) {
  try {
    document.title = titulo;
  } catch {
    // document.title siempre está disponible; guardia por si Tauri bloquea
  }
  if ("__TAURI_INTERNALS__" in globalThis) {
    void getCurrentWindow()
      .setTitle(titulo)
      .catch(() => {});
  }
}

// Zoom tipo navegador: escala tabla y SVG juntos (CSS `zoom` sobre la carta);
// el calendario no cambia, solo el tamaño de todo.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

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
  const [exportando, setExportando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [zoom, setZoom] = useState(1);
  const [parametros, setParametros] = useState<Record<string, Valor>>(() => valoresDefault());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [menuProyectosAbierto, setMenuProyectosAbierto] = useState(false);
  const [vistaImp, setVistaImp] = useState<VistaImpresionEstado>(null);
  const [vistaImpGenerando, setVistaImpGenerando] = useState(false);
  const [menuCalendario, setMenuCalendario] = useState<{ x: number; y: number } | null>(null);
  const [menuColumnas, setMenuColumnas] = useState<{ x: number; y: number } | null>(null);
  const [menuTarea, setMenuTarea] = useState<{ x: number; y: number; codigo: string; nombre: string } | null>(null);
  const [editorPredecesoras, setEditorPredecesoras] = useState<{ codigo: string; nombre: string } | null>(null);
  const [apuAbierto, setApuAbierto] = useState<{ codigo: string } | null>(null);
  const [recursosAbierto, setRecursosAbierto] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [proyectos, setProyectos] = useState<ProyectoInfo[]>([]);
  const [menuRaizAbierto, setMenuRaizAbierto] = useState<string | null>(null);
  const menuBarraRef = useRef<HTMLDivElement | null>(null);
  const cerrarMenus = useCallback(() => setMenuRaizAbierto(null), []);
  const alternarRaiz = useCallback(
    (nombre: string) =>
      setMenuRaizAbierto((abierto) => (abierto === nombre ? null : nombre)),
    []
  );
  const [zoomTexto, setZoomTexto] = useState("100");
  const [excelRangos, setExcelRangos] = useState<{ ruta: string; info: ExcelInfo } | null>(null);
  const [excelMapa, setExcelMapa] = useState<{
    ruta: string;
    matriz: MatrizExcel;
    det: Deteccion;
    hoja: string;
  } | null>(null);
  const [mapaSel, setMapaSel] = useState<ColumnasExcel | null>(null);
  const [seleccion, setSeleccion] = useState<{ codigo: string } | null>(null);
  const [editandoCelda, setEditandoCelda] = useState<CeldaEdicion | null>(null);
  // Popup de propiedades: se abre solo con doble clic sobre la actividad (el
  // clic simple sólo resalta la fila). Independiente de `seleccion` para poder
  // cerrarlo sin deseleccionar.
  const [propiedadesAbierto, setPropiedadesAbierto] = useState<string | null>(null);

  const nivelActual = String(parametros["mostrar-niveles"] ?? "auto");
  const mostrarCodigo = (() => {
    const v = parametros["mostrar-codigo"];
    return v !== false && String(v ?? "true") !== "false";
  })();

  const docActual = useMemo(
    () => docs.find((d) => d.id === idActivo) ?? docs[0],
    [docs, idActivo],
  );
  const texto = docActual.texto;

  // Configuración viva del panel: los cambios de parámetros se reflejan al
  // instante en el render nativo; el motor Rust solo recalcula las fechas
  // (filasPanel) cuando cambia el YAML o el estado del CPM.
  const parametrosRef = useRef(parametros);
  parametrosRef.current = parametros;
  const cpmActivado = parametros.cpm === true || parametros.cpm === "true";

  const filasFirma = `${String(parametros["inicio-proyecto"] ?? "")}|${String(parametros["termino-proyecto"] ?? "")}`;

  // Fechas resueltas por el motor (petgraph en Rust, la misma fuente que la
  // carta): alimenta la vista nativa, el "término" calculado de cada tarea y
  // los límites de la ventana temporal. Con datos inválidos queda en null
  // (panel en blanco; los diagnósticos muestran el motivo).
  const [filasPanel, setFilasPanel] = useState<Fila[] | null>(null);
  // Vista previa local de la barra que se arrastra: la barra se mueve al
  // instante sin esperar al motor ni tocar el YAML (que se escribe una sola
  // vez al soltar). Se descarta cuando llegan las filas reales del motor.
  const [previaArrastre, setPreviaArrastre] = useState<{
    codigo: string;
    modo: "mover" | "izq" | "der";
    inicioDias: number;
    terminoDias: number;
    duracion: number;
    ventana: { inicio: number; fin: number };
  } | null>(null);
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
        if (vivo) {
          setFilasPanel(filas);
          setPreviaArrastre(null);
        }
      } catch {
        if (vivo) {
          setFilasPanel(null);
          setPreviaArrastre(null);
        }
      }
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, cpmActivado, filasFirma]);

  // Vista nativa: el layout (layout-gantt.ts) se calcula en TypeScript y se
  // emite como SVG. Typst ya no compila en pantalla: sigue siendo el motor de
  // la exportación PDF (mismo contrato de `config:`, misma apariencia).
  // En pantalla el SVG lleva solo calendario y barras (1:1 en px); la tabla es
  // HTML aparte. El zoom no entra aquí: se aplica como CSS a toda la carta.
  const [anchoCarta, setAnchoCarta] = useState(0);
  // Escala del calendario fijada a mano arrastrando el borde de una celda de la
  // cabecera (px por día); null = ajustado al ancho de la ventana.
  const [pxPorDia, setPxPorDia] = useState<number | null>(null);
  const filasVista = useMemo(() => {
    if (!filasPanel || !previaArrastre) return filasPanel;
    return filasPanel.map((f) =>
      f.codigo === previaArrastre.codigo
        ? {
            ...f,
            inicioDias: previaArrastre.inicioDias,
            terminoDias: previaArrastre.terminoDias,
            duracion: previaArrastre.duracion,
          }
        : f,
    );
  }, [filasPanel, previaArrastre]);
  const vista = useMemo<VistaGantt | null>(() => {
    const filas = filasVista;
    if (!filas) return null;
    // Con un arrastre en curso la ventana del calendario se congela: si no, al
    // mover la primera/última tarea la escala cambiaría bajo el puntero.
    const p = previaArrastre
      ? {
          ...parametros,
          "ventana-inicio": fechaIso(previaArrastre.ventana.inicio),
          "ventana-fin": fechaIso(previaArrastre.ventana.fin),
        }
      : parametros;
    return dibujarGantt(filas, p, seleccion?.codigo ?? undefined, {
      soloLineaTiempo: true,
      anchoDisponible: anchoCarta > 0 ? anchoCarta : undefined,
      anchoPorDia: pxPorDia ?? undefined,
    });
  }, [filasVista, parametros, previaArrastre, seleccion, anchoCarta, pxPorDia]);
  const svg = vista?.svg ?? null;
  const geometria = vista?.geometria ?? null;

  // Etiqueta que acompaña a la barra mientras se arrastra: inicio al moverla;
  // duración (y término) al estirar el borde derecho; inicio y duración al
  // estirar el izquierdo.
  const etiquetaArrastre = useMemo(() => {
    const b = previaArrastre && geometria?.barras.find((x) => x.codigo === previaArrastre.codigo);
    if (!previaArrastre || !b || !geometria) return null;
    const texto =
      previaArrastre.modo === "mover"
        ? `Inicio: ${formatearFecha(previaArrastre.inicioDias)}`
        : previaArrastre.modo === "der"
          ? `Duración: ${previaArrastre.duracion} d · Término: ${formatearFecha(previaArrastre.terminoDias)}`
          : `Inicio: ${formatearFecha(previaArrastre.inicioDias)} · Duración: ${previaArrastre.duracion} d`;
    // El inicio se muestra a la izquierda de la barra (junto a su comienzo) y la
    // duración/término a la derecha (junto al borde que se estira); si al lado
    // elegido no cabe, pasa al opuesto.
    const alaIzquierda =
      previaArrastre.modo === "der" ? b.x + b.w > geometria.ancho * 0.7 : b.x > 190;
    return {
      texto,
      top: b.cy,
      left: alaIzquierda ? b.x - 8 : b.x + b.w + 8,
      alaIzquierda,
    };
  }, [previaArrastre, geometria]);
  const milis = vista?.milis ?? 0;

  // el nombre del archivo abierto se muestra en el título de la ventana
  useEffect(() => {
    fijarTituloVentana(`${docActual.nombre}${docActual.sucio ? " •" : ""} — Gantt Editor`);
  }, [docActual.nombre, docActual.sucio]);

  const svgCaja = useRef<HTMLDivElement | null>(null);
  const cartaScroll = useRef<HTMLDivElement | null>(null);
  const textoRef = useRef(texto);
  textoRef.current = texto;
  const idActivoRef = useRef(idActivo);
  idActivoRef.current = idActivo;

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
    const caja = cartaScroll.current;
    if (!caja) return;
    const alRueda = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    caja.addEventListener("wheel", alRueda, { passive: false });
    const medir = () => setAnchoCarta(Math.max(0, caja.clientWidth - 2));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caja);
    return () => {
      caja.removeEventListener("wheel", alRueda);
      ro.disconnect();
    };
  }, [svg !== null]);

  // Resaltado de la fila seleccionada sobre el SVG (1:1 en px: las bandas de
  // la geometría ya están en el espacio del SVG).
  const rectSel = useMemo(() => {
    const b = seleccion && geometria?.bandas.find((x) => x.codigo === seleccion.codigo);
    if (!b || !geometria) return null;
    return { top: b.y0, left: 0, width: geometria.ancho, height: b.y1 - b.y0 };
  }, [seleccion, geometria]);

  const tareas = useMemo(() => {
    const todas = listarTareas(texto);
    if (nivelActual === "auto") return todas;
    const k = Math.max(1, Math.floor(Number(nivelActual)) || 1);
    return todas.filter((t) => t.nivel < k);
  }, [texto, nivelActual]);
  const tareasTodas = useMemo(() => listarTareas(texto), [texto]);

  // Filas realmente dibujadas por el layout (tras poda de ocultar-subtareas y
  // colapso): fuente de verdad para las interacciones. Se resuelven por
  // `codigo` porque `tareas`/`listarTareas` puede divergir en número y orden.
  const filasPorCodigo = useMemo(
    () => new Map((filasVista ?? []).map((f) => [f.codigo, f] as const)),
    [filasVista],
  );

  // "Colapsar" avanza un nivel por clic: 1, 2, … hasta cubrir el nivel más
  // profundo y vuelve a "todos". `mostrar-niveles: k` muestra nivel < k.
  const maxNivel = useMemo(() => tareasTodas.reduce((m, t) => Math.max(m, t.nivel), 0), [tareasTodas]);
  const siguienteColapso = useMemo(() => {
    if (nivelActual === "auto") return "1";
    const k = Math.max(1, Math.floor(Number(nivelActual)) || 1);
    return k + 1 > maxNivel + 1 ? "auto" : String(k + 1);
  }, [nivelActual, maxNivel]);

  // Etiquetas del nivel de colapso en términos del WBS: el proyecto no lleva
  // número; "Nivel 1" es el primer nivel de actividades (sus hijos).
  const etiquetaColapso = (k: string): string => {
    if (k === "auto") return "todos";
    const n = Math.max(1, Math.floor(Number(k)) || 1);
    return n <= 1 ? "Proyecto" : `Nivel ${n - 1}`;
  };

  const indiceDePunto = useCallback(
    (e: React.MouseEvent | PointerEvent) => {
      const caja = svgCaja.current;
      const g = geometria;
      if (!caja || !g || !g.bandas.length) return -1;
      const s = caja.querySelector(".carta-cuerpo-svg svg");
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

  // Selección: un clic sobre una fila de la carta abre sus propiedades y la
  // deja resaltada; el panel anclado a la derecha concentra toda la edición
  // que antes vivía en la tabla y el YAML.
  const alClicSvg = useCallback(
    (e: React.MouseEvent) => {
      const i = indiceDePunto(e);
      if (i < 0) {
        setMenuTarea(null);
        setPropiedadesAbierto(null);
        return;
      }
      const codigo = geometria?.bandas[i]?.codigo;
      if (!geometria || codigo === undefined) return;
      setMenuTarea(null);
      setSeleccion({ codigo });
      setPropiedadesAbierto(null);
    },
    [indiceDePunto, geometria],
  );

  const ponerEnEditor = useCallback((textoNuevo: string) => {
    const id = idActivoRef.current;
    setDocs((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, texto: textoNuevo, sucio: d.texto !== textoNuevo } : d,
      ),
    );
  }, []);

  const alClicDerechoCarta = useCallback(
    (e: React.MouseEvent) => {
      const caja = svgCaja.current;
      const g = geometria;
      if (!caja || !g || !g.bandas.length) return;
      const s = caja.querySelector(".carta-cuerpo-svg svg");
      if (!s || !g.ancho) return;
      const rect = s.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const py = (e.clientY - rect.top) * (g.ancho / rect.width);
      const px = (e.clientX - rect.left) * (g.ancho / rect.width);
      // La cabecera de las columnas de datos es la tabla HTML (tiene su propio menú).
      // Botón derecho sobre la cabecera del calendario: menú de calendario.
      if (g.calendario && py >= g.calendario.y0 && py < g.calendario.y1 && px >= g.calendario.x0) {
        e.preventDefault();
        setMenuCalendario({ x: e.clientX, y: e.clientY });
        return;
      }
      const i = indiceDePunto(e);
      const fila = i >= 0 ? filasPorCodigo.get(geometria.bandas[i]?.codigo ?? "") : undefined;
      if (fila) {
        e.preventDefault();
        // clic derecho en una fila: selecciona y abre las acciones de tarea
        setSeleccion({ codigo: fila.codigo });
        setPropiedadesAbierto(null);
        setMenuTarea({ x: e.clientX, y: e.clientY, codigo: fila.codigo, nombre: fila.nombre });
      }
    },
    [indiceDePunto, filasPorCodigo, geometria],
  );

  const alDobleClicCarta = useCallback(
    (e: React.MouseEvent) => {
      const g = geometria;
      const caja = svgCaja.current;
      if (!g || !g.bandas.length || !caja) return;
      const s = caja.querySelector(".carta-cuerpo-svg svg");
      if (!s) return;
      const rect = s.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      // Posición del clic en coordenadas del SVG (misma escala de `rectSel`).
      const fEscY = g.alto / rect.height;
      const py = (e.clientY - rect.top) * fEscY;
      // La tabla HTML cubre el área de las celdas; aquí solo llegan los dobles
      // clics sobre la línea de tiempo (barras) → propiedades de la actividad.
      const i = g.bandas.findIndex((b) => py >= b.y0 && py < b.y1);
      if (i < 0) return;
      const b = g.bandas[i];
      const fila = filasPorCodigo.get(b.codigo);
      if (!fila) return;
      e.preventDefault();
      setMenuTarea(null);
      setSeleccion({ codigo: fila.codigo });
      setPropiedadesAbierto(fila.codigo);
    },
    [filasPorCodigo, geometria],
  );

  const commitEdicionCelda = useCallback(
    (valor: string) => {
      setEditandoCelda((e) => {
        if (!e) return e;
        const v = valor.trim();
        try {
          if (e.campo === "nombre") {
            if (v && v !== e.valor) ponerEnEditor(editarCampo(textoRef.current, e.codigo, "nombre", v));
            return null;
          }
          const actual = leerCampo(textoRef.current, e.codigo, e.campo);
          if (v === (actual == null ? "" : String(actual))) return null;
          ponerEnEditor(editarCampoConsistente(textoRef.current, e.codigo, e.campo, coerceValorCelda(e.campo, v)));
        } catch (err) {
          setMensaje(`Error al editar '${e.campo}': ${String(err)}`);
        }
        return null;
      });
    },
    [ponerEnEditor],
  );

  // Abrir el editor inline de una celda de la tabla (valor crudo del YAML para
  // que se vea como se guarda: "2024-01-15", "50%" o "1.5", no el formateado).
  const abrirEdicionCelda = useCallback(
    (codigo: string, campo: string) => {
      if (campo === "nombre") {
        const fila = filasPorCodigo.get(codigo);
        setEditandoCelda({ codigo, campo, valor: fila?.nombre ?? "" });
        return;
      }
      const valor = leerCampo(textoRef.current, codigo, campo);
      setEditandoCelda({ codigo, campo, valor: valor == null ? "" : String(valor) });
    },
    [filasPorCodigo],
  );
  const cerrarEdicionCelda = useCallback(() => setEditandoCelda(null), []);
  const seleccionarFila = useCallback(
    (codigo: string) => {
      setSeleccion({ codigo });
      setPropiedadesAbierto(null);
      setEditandoCelda(null);
    },
    [],
  );
  const abrirPropiedades = useCallback(
    (codigo: string) => {
      setSeleccion({ codigo });
      setEditandoCelda(null);
      setPropiedadesAbierto(codigo);
    },
    [],
  );
  const menutareaDesdeTabla = useCallback(
    (clientX: number, clientY: number, codigo: string, nombre: string) => {
      setSeleccion({ codigo });
      setPropiedadesAbierto(null);
      setMenuTarea({ x: clientX, y: clientY, codigo, nombre });
    },
    [],
  );
  const menucolumnasDesdeTabla = useCallback(
    (clientX: number, clientY: number) => setMenuColumnas({ x: clientX, y: clientY }),
    [],
  );

  // --- Arrastre/estirado de barras -------------------------------------------
  // Mover una barra desplaza `inicio` (la duración se conserva; el término lo
  // arrastra editarCampoConsistente). Estirar por los bordes cambia el
  // término (o inicio con ancla en el término) recalculando la duración.
  interface ArrastreBarra {
    codigo: string;
    modo: "mover" | "izq" | "der";
    diaIni: number;
    diaFin: number;
    /** Día bajo el puntero al agarrar: el desplazamiento se mide desde aquí. */
    diaAgarre: number;
    ultimoInicio: number;
    ultimoFin: number;
  }
  const arrastreRef = useRef<ArrastreBarra | null>(null);

  const escalaSvg = useCallback((): { rect: DOMRect; fx: number; fy: number } | null => {
    const caja = svgCaja.current;
    const g = geometria;
    if (!caja || !g || !g.ancho) return null;
    const s = caja.querySelector(".carta-cuerpo-svg svg");
    if (!s) return null;
    const rect = s.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { rect, fx: g.ancho / rect.width, fy: g.alto / rect.height };
  }, [geometria]);

  const diaEnPx = useCallback(
    (px: number): number => {
      const g = geometria;
      if (g?.tablaX === undefined || !g.dias || g.ancho <= g.tablaX) return g?.dias?.inicio ?? 0;
      const paso = (g.dias.fin - g.dias.inicio + 1) / (g.ancho - g.tablaX);
      return g.dias.inicio + (px - g.tablaX) * paso;
    },
    [geometria],
  );

  // --- Redimensionar el calendario arrastrando el borde de una celda -----------
  // Se arrastra el borde derecho de una celda (día, semana, mes o año): su ancho
  // nuevo fija los píxeles por día y todo el calendario se reescala en cadena.
  const redimCalRef = useRef<{ x: number; ancho: number; dias: number; escala: number } | null>(null);
  const PX_DIA_MIN = 0.3;
  const PX_DIA_MAX = 300;

  const bordeCalendarioEn = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      const g = geometria;
      const svgEl = (e.currentTarget as HTMLElement).querySelector("svg");
      if (!g?.celdasCalendario || !svgEl) return null;
      const r = svgEl.getBoundingClientRect();
      if (r.width <= 0 || !g.ancho) return null;
      const escala = r.width / g.ancho;
      const x = (e.clientX - r.left) / escala;
      const y = (e.clientY - r.top) / escala;
      const tol = 4;
      const c = g.celdasCalendario.find((k) => y >= k.y0 && y < k.y1 && Math.abs(x - k.x1) <= tol && k.dias > 0);
      return c ? { celda: c, escala } : null;
    },
    [geometria],
  );

  const iniciarRedimCal = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const hit = bordeCalendarioEn(e);
      if (!hit) return;
      e.preventDefault();
      redimCalRef.current = { x: e.clientX, ancho: hit.celda.x1 - hit.celda.x0, dias: hit.celda.dias, escala: hit.escala };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [bordeCalendarioEn],
  );

  const moverRedimCal = useCallback(
    (e: React.PointerEvent) => {
      const d = redimCalRef.current;
      if (!d) {
        (e.currentTarget as HTMLElement).style.cursor = bordeCalendarioEn(e) ? "col-resize" : "";
        return;
      }
      const ancho = d.ancho + (e.clientX - d.x) / d.escala;
      setPxPorDia(Math.min(PX_DIA_MAX, Math.max(PX_DIA_MIN, ancho / d.dias)));
    },
    [bordeCalendarioEn],
  );

  const terminarRedimCal = useCallback((e: React.PointerEvent) => {
    if (!redimCalRef.current) return;
    redimCalRef.current = null;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }, []);

  const iniciarArrastre = useCallback(
    (e: React.PointerEvent) => {
      const g = geometria;
      const esc = escalaSvg();
      if (!g || !esc || g.tablaX === undefined || !g.dias) return;
      const px = (e.clientX - esc.rect.left) * esc.fx;
      const py = (e.clientY - esc.rect.top) * esc.fy;
      const tol = 6 * esc.fx;
      const barra = g.barras.find(
        (b) => px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol,
      );
      if (!barra?.codigo) return;
      const t = filasPanel?.find((x) => x.codigo === barra.codigo);
      if (!t) return;
      e.preventDefault();
      setSeleccion({ codigo: barra.codigo });
      setPropiedadesAbierto(null);
      const diaIni = Math.round(diaEnPx(barra.x));
      const diaFin = Math.round(diaEnPx(barra.x + barra.w)) - 1;
      // zona de agarre de los bordes: 8px, sin pasar de un tercio de la barra
      const zona = Math.min(8 * esc.fx, barra.w / 3);
      const enIzq = px <= barra.x + zona;
      const enDer = px >= barra.x + barra.w - zona;
      arrastreRef.current = {
        codigo: barra.codigo,
        modo: t.esGrupo || t.hito || (!enIzq && !enDer) ? "mover" : enIzq ? "izq" : "der",
        diaIni,
        diaFin,
        diaAgarre: Math.round(diaEnPx(px)),
        ultimoInicio: diaIni,
        ultimoFin: diaFin,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [geometria, escalaSvg, diaEnPx, setSeleccion, filasPanel],
  );

  const moverArrastre = useCallback(
    (e: React.PointerEvent) => {
      const d = arrastreRef.current;
      const g = geometria;
      const esc = escalaSvg();
      const caja = svgCaja.current;
      if (!g || !esc || !caja || g.tablaX === undefined || !g.dias) return;
      const px = (e.clientX - esc.rect.left) * esc.fx;
      const py = (e.clientY - esc.rect.top) * esc.fy;

      if (!d) {
        // feedback de cursor sobre la barra (sin arrastre aún)
        const tol = 6 * esc.fx;
        const barra = g.barras.find(
          (b) => px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol,
        );
        const zona = barra ? Math.min(8 * esc.fx, barra.w / 3) : 0;
        const fila = barra?.codigo ? filasPanel?.find((x) => x.codigo === barra.codigo) : undefined;
        const estirable = !!fila && !fila.esGrupo && !fila.hito;
        caja.style.cursor = !barra
          ? ""
          : estirable && (px <= barra.x + zona || px >= barra.x + barra.w - zona)
            ? "ew-resize"
            : "move";
        return;
      }

      const diaApuntado = Math.round(diaEnPx(px));
      const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
      const dur = d.diaFin - d.diaIni;
      let ini = d.ultimoInicio;
      let fin = d.ultimoFin;
      if (d.modo === "mover") {
        ini = clamp(d.diaIni + (diaApuntado - d.diaAgarre), g.dias.inicio, g.dias.fin - dur);
        fin = ini + dur;
      } else if (d.modo === "izq") {
        ini = clamp(d.diaIni + (diaApuntado - d.diaAgarre), g.dias.inicio, d.diaFin);
      } else {
        fin = clamp(d.diaFin + (diaApuntado - d.diaAgarre), d.diaIni, g.dias.fin);
      }
      if (ini === d.ultimoInicio && fin === d.ultimoFin) return;
      d.ultimoInicio = ini;
      d.ultimoFin = fin;
      setPreviaArrastre({
        codigo: d.codigo,
        modo: d.modo,
        inicioDias: ini,
        terminoDias: fin,
        duracion: d.modo === "mover" ? (filasPanel?.find((x) => x.codigo === d.codigo)?.duracion ?? fin - ini + 1) : fin - ini + 1,
        ventana: { inicio: g.dias.inicio, fin: g.dias.fin },
      });
    },
    [geometria, escalaSvg, diaEnPx, filasPanel],
  );

  const terminarArrastre = useCallback(
    (e: React.PointerEvent) => {
      const d = arrastreRef.current;
      if (!d) return;
      arrastreRef.current = null;
      const caja = svgCaja.current;
      if (caja && caja.hasPointerCapture(e.pointerId)) caja.releasePointerCapture(e.pointerId);
      if (caja) caja.style.cursor = "";
      // Una sola escritura al YAML al soltar (la vista previa ya mostró el resultado).
      if (d.ultimoInicio === d.diaIni && d.ultimoFin === d.diaFin) {
        setPreviaArrastre(null);
        return;
      }
      let textoNuevo: string | null = null;
      try {
        if (d.modo === "mover") {
          textoNuevo = editarCampoConsistente(textoRef.current, d.codigo, "inicio", fechaIso(d.ultimoInicio));
        } else if (d.modo === "izq") {
          let t1 = editarCampoConsistente(textoRef.current, d.codigo, "termino", fechaIso(d.diaFin));
          t1 = editarCampo(t1, d.codigo, "inicio", fechaIso(d.ultimoInicio));
          textoNuevo = editarCampoConsistente(t1, d.codigo, "termino", fechaIso(d.diaFin));
        } else {
          textoNuevo = editarCampoConsistente(textoRef.current, d.codigo, "termino", fechaIso(d.ultimoFin));
        }
      } catch (err) {
        setMensaje(`Error al ${d.modo === "mover" ? "mover" : "estirar"}: ${String(err)}`);
      }
      if (textoNuevo && textoNuevo !== textoRef.current) ponerEnEditor(textoNuevo);
      else setPreviaArrastre(null);
    },
    [ponerEnEditor],
  );

  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);
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
    "nombre", "hito", "inicio", "termino", "duracion", "avance", "id", "vinculo",
    "recursos", "formato-barra",
    "negrita", "italica", "color-texto", "ocultar-subtareas",
    "cantidad", "unidad", "costo-unitario", "costo",
  ];
  const camposTarea = useMemo(() => {
    if (!seleccion) return null;
    const c: Record<string, ValorCampo> = {};
    for (const k of CAMPOS_TAREA) {
      try {
        c[k] = leerCampo(texto, seleccion.codigo, k);
      } catch {
        c[k] = null;
      }
    }
    // "término" no declarado: se muestra el calculado (inicio+duración o CPM)
    if (!c.termino) {
      const calculado = terminoCalculado.get(seleccion.codigo);
      if (calculado) c.termino = calculado;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion, texto, terminoCalculado]);

  const aplicarCampoTarea = useCallback(
    (clave: string, valor: ValorCampo) => {
      if (!seleccion) return;
      try {
        // fechas y duración se mantienen coherentes (inicio+duración-1=término);
        // el resto de los campos se escribe tal cual.
        const especiales = new Set(["inicio", "termino", "duracion", "avance"]);
        const editado = especiales.has(clave)
          ? editarCampoConsistente(textoRef.current, seleccion.codigo, clave, valor)
          : editarCampo(textoRef.current, seleccion.codigo, clave, valor);
        ponerEnEditor(editado);
      } catch (err) {
        setMensaje(`Error al editar: ${String(err)}`);
      }
    },
    [seleccion, ponerEnEditor],
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
    setSeleccion({ codigo: codigoTarea });
    setMenuTarea(null);
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

  useEffect(() => setSeleccion(null), [idActivo]);
  useEffect(() => setEditorPredecesoras(null), [idActivo]);

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

  // cierra la barra de menú al hacer click o Escape afuera de ella
  useEffect(() => {
    if (!menuRaizAbierto) return;
    const cerrar = (ev: Event) => {
      if (ev instanceof KeyboardEvent) {
        if (ev.key === "Escape") setMenuRaizAbierto(null);
        return;
      }
      const el = ev.target as Element | null;
      if (el && menuBarraRef.current?.contains(el)) return;
      setMenuRaizAbierto(null);
    };
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", cerrar);
    return () => {
      window.removeEventListener("mousedown", cerrar);
      window.removeEventListener("keydown", cerrar);
    };
  }, [menuRaizAbierto]);

  useEffect(() => {
    setZoomTexto(String(Math.round(zoom * 100)));
  }, [zoom]);

  const aplicarZoom = () => {
    const n = Math.round(Number(zoomTexto) || 100);
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n / 100));
    setZoom(z);
    setZoomTexto(String(Math.round(z * 100)));
  };

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

  // YAML con fechas y costos resueltos por el motor Rust (inyeccion => YAML que
  // gantt.typ consume sin recalcular): mismo contrato de preparar-tareas. Lo
  // comparten la vista de impresión y la exportación a PDF.
  const yamlParaExportar = async (): Promise<string> => {
    try {
      return await invoke<string>("filas_a_yaml", {
        texto: textoRef.current,
        cpm: parametros["cpm"] === true,
        inicioProyecto: fechaOpt("inicio-proyecto"),
        terminoProyecto: fechaOpt("termino-proyecto"),
      });
    } catch (err) {
      setMensaje(`Inyección Rust no disponible, usando YAML crudo: ${String(err)}`);
      return textoRef.current;
    }
  };

  const exportarPdf = () => ejecutarExportarPdf();

  // Plantilla con márgenes opcionales para impresión: si llega override, se
  // aplican los del modal de vista de impresión sobre los parámetros actuales.
  const plantillaConMargenes = (override?: { margenes: boolean; margen: number }): string =>
    generarMainTyp(
      override
        ? { ...parametros, margenes: override.margenes, margen: override.margen }
        : parametros,
    );

  const ejecutarExportarPdf = async (override?: { margenes: boolean; margen: number }) => {
    setExportando(true);
    setMensaje("");
    try {
      const destino = await elegirDestino("pdf");
      if (!destino) return;
      const yaml = await yamlParaExportar();
      const ruta = await invoke<string>("exportar_pdf", {
        yaml,
        plantilla: plantillaConMargenes(override),
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

  // Vista de impresión: compila la misma plantilla/datos que el PDF (por el
  // binario `typst` de Rust) pero a SVG, para afinar antes de exportar.
  const abrirVistaImpresion = async (override?: { margenes: boolean; margen: number }) => {
    setVistaImpGenerando(true);
    setVistaImp(null);
    try {
      const yaml = await yamlParaExportar();
      const hojas = await invoke<string[]>("vista_impresion", {
        yaml,
        plantilla: plantillaConMargenes(override),
        fuentes: fuentesLibreria(),
      });
      setVistaImp({ tipo: "ok", hojas });
    } catch (err) {
      setVistaImp({ tipo: "error", msg: String(err) });
    } finally {
      setVistaImpGenerando(false);
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

  const nProblemas = erroresValidacion.length;

  const estados: "ok" | "error" | "compilando" =
    nProblemas
      ? "error"
      : svg
        ? "ok"
        : "compilando";

  const columnas = "minmax(0, 1fr)";

  return (
    <div className="app">
      <div className="menu-barra" ref={menuBarraRef}>
        <h1 className="marca">Gantt Editor</h1>
        <MenuRaiz nombre="Archivo" abierto={menuRaizAbierto === "archivo"} onToggle={() => alternarRaiz("archivo")}>
          <MenuItem onClick={() => { cerrarMenus(); nuevoDoc(); }}>Nuevo</MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); void abrirArchivo(); }}>Abrir…</MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); void abrirGtt(); }}>Abrir .gtt…</MenuItem>
          <MenuSep />
          <MenuItem deshabilitado={hayErroresValidacion} info="Ctrl+S" onClick={() => { cerrarMenus(); guardarDoc(false); }}>
            Guardar
          </MenuItem>
          <MenuItem deshabilitado={hayErroresValidacion} onClick={() => { cerrarMenus(); guardarDoc(true); }}>
            Guardar como…
          </MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); void guardarGtt(false); }}>Guardar .gtt</MenuItem>
          <MenuSep />
          <MenuItem onClick={() => { cerrarMenus(); setMenuProyectosAbierto(true); }}>Proyectos…</MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); cerrarDoc(idActivo); }}>Cerrar</MenuItem>
        </MenuRaiz>
        <MenuRaiz nombre="Importar" abierto={menuRaizAbierto === "importar"} onToggle={() => alternarRaiz("importar")}>
          <MenuItem onClick={() => { cerrarMenus(); void importarTexto("mspdi"); }}>MSPDI…</MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); void importarTexto("pmxml"); }}>PMXML…</MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); void importarTexto("xer"); }}>XER…</MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); void importarExcel(); }}>Excel…</MenuItem>
        </MenuRaiz>
        <MenuRaiz nombre="Exportar" abierto={menuRaizAbierto === "exportar"} onToggle={() => alternarRaiz("exportar")}>
          <MenuItem deshabilitado={estados !== "ok"} info="preview del PDF" onClick={() => { cerrarMenus(); void abrirVistaImpresion(); }}>
            Vista de impresión…
          </MenuItem>
          <MenuSep />
          <MenuItem deshabilitado={estados !== "ok" || exportando} onClick={() => { cerrarMenus(); exportarPdf(); }}>
            {exportando ? "Exportando…" : "PDF"}
          </MenuItem>
          <MenuItem deshabilitado={estados !== "ok"} onClick={() => { cerrarMenus(); exportarSvg(); }}>
            SVG
          </MenuItem>
          <MenuSep />
          <MenuItem deshabilitado={estados !== "ok"} info="Plan" onClick={() => { cerrarMenus(); exportarPlan("mspdi"); }}>
            MSPDI
          </MenuItem>
          <MenuItem deshabilitado={estados !== "ok"} info="Plan" onClick={() => { cerrarMenus(); exportarPlan("pmxml"); }}>
            PMXML
          </MenuItem>
          <MenuItem deshabilitado={estados !== "ok"} info="Plan" onClick={() => { cerrarMenus(); exportarPlan("xer"); }}>
            XER
          </MenuItem>
          <MenuItem deshabilitado={estados !== "ok"} info="Plan" onClick={() => { cerrarMenus(); exportarExcel(); }}>
            Excel
          </MenuItem>
        </MenuRaiz>
        <MenuRaiz nombre="Configurar" abierto={menuRaizAbierto === "configurar"} onToggle={() => alternarRaiz("configurar")}>
          <MenuItem onClick={() => { cerrarMenus(); setMenuAbierto(true); }}>
            Parámetros de la carta…
          </MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); setRecursosAbierto(true); }}>
            Recursos…
          </MenuItem>
        </MenuRaiz>
        <MenuRaiz nombre="Ver" abierto={menuRaizAbierto === "ver"} onToggle={() => alternarRaiz("ver")}>
          <MenuItem onClick={() => { cerrarMenus(); setZoom((z) => Math.max(ZOOM_MIN, z / 1.25)); }}>
            Alejar
          </MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); setZoom((z) => Math.min(ZOOM_MAX, z * 1.25)); }}>
            Acercar
          </MenuItem>
          <MenuItem onClick={() => { cerrarMenus(); setZoom(1); }}>Ajustar al ancho</MenuItem>
          <div className="menu-fila">
            <span>Zoom</span>
            <input
              className="zoom-input"
              type="number"
              min={100}
              max={800}
              value={zoomTexto}
              onChange={(e) => setZoomTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aplicarZoom();
                }
              }}
              onBlur={aplicarZoom}
            />
            <span>%</span>
          </div>
          <MenuSep />
          <MenuItem
            info={etiquetaColapso(siguienteColapso)}
            onClick={() => { cerrarMenus(); fijarNiveles(siguienteColapso); }}
          >
            Colapsar
          </MenuItem>
          <MenuItem info="Todos" onClick={() => { cerrarMenus(); fijarNiveles("auto"); }}>
            Expandir
          </MenuItem>
          <MenuInfo>Niveles: {etiquetaColapso(nivelActual)}</MenuInfo>
        </MenuRaiz>
        <MenuRaiz nombre="Ventana" abierto={menuRaizAbierto === "ventana"} onToggle={() => alternarRaiz("ventana")}>
          {docs.map((d) => (
            <MenuItem
              key={d.id}
              activa={d.id === idActivo}
              info={d.sucio ? "•" : undefined}
              onClick={() => { cerrarMenus(); seleccionarDoc(d.id); }}
            >
              {d.proyectoId !== undefined && <span className="pestana-proyecto">◆</span>}
              {d.nombre}
            </MenuItem>
          ))}
        </MenuRaiz>
        <div className={`estado estado-${estados}`}>
          {nProblemas
            ? `${nProblemas} problema(s)`
            : svg
              ? `ok · ${milis.toFixed(0)} ms · ${tareas.length} tareas`
              : "compilando…"}
        </div>
        {mensaje && <span className="mensaje">{mensaje}</span>}
      </div>
      <main
        className="contenido"
        style={{ gridTemplateColumns: columnas }}
      >
        <section className="panel-preview">
          {svg && geometria ? (
            <div
              ref={cartaScroll}
              className="carta-scroll"
              title="Clic: selecciona fila · doble clic en celda: editar · doble clic en la actividad: propiedades · arrastra barras para mover/estirar · clic derecho: menú · Ctrl+rueda: zoom"
            >
              <div className="carta-fila" style={{ zoom }}>
                <TablaGantt
                  geometria={geometria}
                  filasPorCodigo={filasPorCodigo}
                  mostrarCodigo={mostrarCodigo}
                  seleccion={seleccion}
                  editando={editandoCelda}
                  onSeleccionar={seleccionarFila}
                  onEditar={abrirEdicionCelda}
                  onPropiedades={abrirPropiedades}
                  onCancelarEdicion={cerrarEdicionCelda}
                  onCommitEdicion={commitEdicionCelda}
                  onMenuCelda={menutareaDesdeTabla}
                  onMenuCabecera={menucolumnasDesdeTabla}
                />
                <div
                  ref={svgCaja}
                  className="carta-svg"
                  onClick={alClicSvg}
                  onDoubleClick={alDobleClicCarta}
                  onContextMenu={alClicDerechoCarta}
                  onPointerDown={iniciarArrastre}
                  onPointerMove={moverArrastre}
                  onPointerUp={terminarArrastre}
                  onPointerCancel={terminarArrastre}
                >
                  {vista?.svgCabecera && (
                    <div
                      className="carta-cabecera"
                      style={{ height: geometria.altoEncabezado }}
                      title="Arrastra el borde de una celda para cambiar el ancho del calendario · doble clic en un borde: ajustar a la ventana"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (bordeCalendarioEn(e)) setPxPorDia(null);
                      }}
                      onPointerDown={iniciarRedimCal}
                      onPointerMove={moverRedimCal}
                      onPointerUp={terminarRedimCal}
                      onPointerCancel={terminarRedimCal}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuCalendario({ x: e.clientX, y: e.clientY });
                      }}
                      dangerouslySetInnerHTML={{ __html: vista.svgCabecera }}
                    />
                  )}
                  <div
                    className="carta-cuerpo-svg"
                    style={{ marginTop: vista?.svgCabecera ? -geometria.altoEncabezado : 0 }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                  {etiquetaArrastre && (
                    <div
                      className={`etiqueta-arrastre${etiquetaArrastre.alaIzquierda ? " etiqueta-arrastre-izq" : ""}`}
                      style={{ top: etiquetaArrastre.top, left: etiquetaArrastre.left }}
                    >
                      {etiquetaArrastre.texto}
                    </div>
                  )}
                  {rectSel && (
                    <div
                      className="seleccion-carta"
                      style={{
                        top: rectSel.top,
                        left: rectSel.left,
                        width: rectSel.width,
                        height: rectSel.height,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="aviso">
              {erroresValidacion.length ? (
                <pre className="errores">{erroresValidacion.map((d) => d.mensaje).join("\n")}</pre>
              ) : (
                "Compilando…"
              )}
            </div>
          )}
        </section>

        {seleccion && propiedadesAbierto === seleccion.codigo && camposTarea && (
          <div className="panel-propiedades-fondo" onClick={() => setPropiedadesAbierto(null)}>
            <div className="panel-propiedades-popup" onClick={(ev) => ev.stopPropagation()}>
              <PropiedadesTarea
                codigo={seleccion.codigo}
                nombre={String(camposTarea.nombre ?? seleccion.codigo)}
                campos={camposTarea}
                onAplicar={aplicarCampoTarea}
                onCerrar={() => setPropiedadesAbierto(null)}
                onAbrirPredecesoras={() =>
                  abrirPredecesoras(seleccion.codigo, String(camposTarea.nombre ?? seleccion.codigo))
                }
                onAbrirApu={() => setApuAbierto({ codigo: seleccion.codigo })}
                onAbrirRecursos={() => setRecursosAbierto(true)}
              />
            </div>
          </div>
        )}
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
                  : undefined
              }
              title={d.correccion ? "Corregir la duración para que coincida con el término" : undefined}
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
      {recursosAbierto && (
        <Recursos
          texto={texto}
          onGuardar={(nuevoTexto) => {
            try {
              ponerEnEditor(nuevoTexto);
              setMensaje("Catálogo de recursos actualizado: las actividades que lo referencian recalculan su costo");
              setRecursosAbierto(false);
            } catch (err) {
              setMensaje(`Error al guardar el catálogo: ${String(err)}`);
            }
          }}
          onCerrar={() => setRecursosAbierto(false)}
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
      {(vistaImp !== null || vistaImpGenerando) && (
        <VistaImpresion
          estado={vistaImp}
          generando={vistaImpGenerando}
          nombre={docActual.nombre}
          margenesInicial={parametros["margenes"] === true}
          margenInicial={String(parametros["margen"] ?? 1)}
          onRefrescar={(margenes, margen) => void abrirVistaImpresion({ margenes, margen })}
          onExportarPdf={(margenes, margen) => void ejecutarExportarPdf({ margenes, margen })}
          onCerrar={() => {
            setVistaImp(null);
            setVistaImpGenerando(false);
          }}
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
    </div>
  );
}

export default App;