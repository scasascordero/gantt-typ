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
import { prepararProyecto } from "./lib/proyecto";
import { aMSPDI, aPMXML, aXER } from "./lib/exportadores";
import { desdeMSPDI, esMSPDI } from "./lib/mspdi";
import MenuParametros from "./MenuParametros";
import "./App.css";

const ZOOM_MIN = 1; // "Ajustar" (100%) es el piso: el dibujo nunca queda más
                    // chico que el ancho de su panel
const ZOOM_MAX = 8;

interface Doc {
  id: string;
  nombre: string;
  ruta?: string;
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
  const [arrastrandoDivisor, setArrastrandoDivisor] = useState(false);
  const contenidoRef = useRef<HTMLElement | null>(null);
  const [parametros, setParametros] = useState<Record<string, Valor>>(() => valoresDefault());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [popupFecha, setPopupFecha] = useState<PopupFecha | null>(null);
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

  const abrirMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuAbierto(true);
  }, []);

  const cerrarMenu = useCallback(() => setMenuAbierto(false), []);
  const cambiarParametro = useCallback(
    (clave: string, valor: Valor) =>
      setParametros((prev) => ({ ...prev, [clave]: valor })),
    [],
  );
  const restablecerParametros = useCallback(() => setParametros(valoresDefault()), []);

  const ponerEnEditor = useCallback((textoNuevo: string) => {
    const v = editorRef.current;
    if (!v) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: textoNuevo } });
  }, []);

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

  const importarMspdi = useCallback(async () => {
    try {
      const r = await invoke<{ ruta: string; contenido: string } | null>("abrir_archivo");
      if (!r) return;
      if (!esMSPDI(r.contenido)) {
        setMensaje("El archivo no parece MSPDI (MS Project 2003 XML)");
        return;
      }
      const yamlTexto = desdeMSPDI(r.contenido);
      const id = `doc-${Date.now()}`;
      idActivoRef.current = id;
      setDocs((prev) => [
        ...prev,
        {
          id,
          nombre: nombreDe(r.ruta).replace(/\.xml$/i, "") + ".yaml",
          texto: yamlTexto,
          sucio: true,
        },
      ]);
      setIdActivo(id);
      ponerEnEditor(yamlTexto);
      setMensaje(`MSPDI importado desde ${nombreDe(r.ruta)} (${listarTareas(yamlTexto).length} tareas)`);
    } catch (err) {
      setMensaje(`Error al importar: ${String(err)}`);
    }
  }, [ponerEnEditor]);

  const guardarDoc = useCallback(
    async (como: boolean) => {
      const d = docActual;
      if (!d) return;
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
    [docActual],
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

  const exportarPdf = async () => {
    setExportando(true);
    setMensaje("");
    try {
      const destino = await elegirDestino("pdf");
      if (!destino) return;
      const ruta = await invoke<string>("exportar_pdf", {
        yaml: textoRef.current,
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
      const fechaOpt = (k: string) => {
        const v = parametros[k];
        return typeof v === "string" && v.trim() !== "" ? v : undefined;
      };
      const filas = prepararProyecto(texto, {
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
      const p = { nombre: docActual.nombre.replace(/\.[^.]+$/, "") || "carta-gantt", filas };
      const contenido =
        formato === "mspdi" ? aMSPDI(p)
        : formato === "pmxml" ? aPMXML(p)
        : aXER(p);
      await invoke<string | null>("guardar_archivo", { ruta: destino, contenido });
      setMensaje(`Exportado ${formato.toUpperCase()}: ${destino}`);
    } catch (err) {
      setMensaje(`Error al exportar: ${String(err)}`);
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
        <span className="grupo-export">
          <button onClick={() => exportarPlan("mspdi")} title="MS Project 2003 XML (.xml)">
            MSPDI
          </button>
          <button onClick={() => exportarPlan("pmxml")} title="Primavera P6 XML (.xml)">
            PMXML
          </button>
          <button onClick={() => exportarPlan("xer")} title="Primavera P6 XER (.xer)">
            XER
          </button>
        </span>
        {mensaje && <span className="mensaje">{mensaje}</span>}
      </header>

      <div className="barra-archivos">
        <div className="pestanas">
          {docs.map((d) => (
            <button
              key={d.id}
              className={`pestana${d.id === idActivo ? " activa" : ""}`}
              onClick={() => seleccionarDoc(d.id)}
              title={d.ruta ?? d.nombre}
            >
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
          <button onClick={() => void importarMspdi()} title="Importar MSPDI (MS Project 2003 XML)">
            Importar MSPDI
          </button>
          <button onClick={() => guardarDoc(false)} title="Guardar (Ctrl+S)">
            Guardar
          </button>
          <button onClick={() => guardarDoc(true)} title="Guardar como…">
            Guardar como…
          </button>
          <button onClick={() => cerrarDoc(idActivo)} title="Cerrar documento">
            Cerrar
          </button>
        </div>
      </div>

      <main
        className="contenido"
        ref={contenidoRef}
        style={{ gridTemplateColumns: `minmax(280px, ${anchoEditorPct}%) 7px 1fr` }}
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
                <span className="zoom-ayuda">Ctrl + rueda: zoom · clic: ir a la línea</span>
              </div>
              <div
                ref={svgCaja}
                className="svg-contenedor"
                onClick={alClicSvg}
                onContextMenu={abrirMenu}
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
    </div>
  );
}

export default App;