import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import { invoke } from "@tauri-apps/api/core";
import ejemploDatos from "../../ejemplos/datos.yaml?raw";
import { compilarSvg, fuentesLibreria } from "./lib/libreria";
import { analizarSvg } from "./lib/geometria";
import { listarTareas } from "./lib/yamlLineas";
import { generarMainTyp, valoresDefault, type Valor } from "./lib/params";
import MenuParametros from "./MenuParametros";
import "./App.css";

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

function App() {
  const [docs, setDocs] = useState<Doc[]>(() => [
    { id: "doc-1", nombre: "datos.yaml", texto: ejemploDatos, sucio: false },
  ]);
  const [idActivo, setIdActivo] = useState("doc-1");
  const [svg, setSvg] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [milis, setMilis] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [zoom, setZoom] = useState(1);
  const [parametros, setParametros] = useState<Record<string, Valor>>(() => valoresDefault());
  const [menuAbierto, setMenuAbierto] = useState(false);

  const mainTyp = useMemo(() => generarMainTyp(parametros), [parametros]);

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
      setZoom((z) => Math.min(8, Math.max(0.2, z * (e.deltaY < 0 ? 1.12 : 1 / 1.12))));
    };
    caja.addEventListener("wheel", alRueda, { passive: false });
    return () => caja.removeEventListener("wheel", alRueda);
  }, [svg]);

  const tareas = useMemo(() => listarTareas(texto), [texto]);
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

  const guardarDoc = useCallback(
    async (como: boolean) => {
      const d = docActual;
      if (!d) return;
      try {
        const nuevaRuta = await invoke<string | null>("guardar_archivo", {
          ruta: como ? null : (d.ruta ?? null),
          contenido: d.texto,
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
  const nivelActual = String(parametros["mostrar-niveles"] ?? "auto");

  const exportarPdf = async () => {
    setExportando(true);
    setMensaje("");
    try {
      const ruta = await invoke<string>("exportar_pdf", {
        yaml: textoRef.current,
        plantilla: generarMainTyp(parametros),
        fuentes: fuentesLibreria(),
      });
      setMensaje(`PDF exportado: ${ruta}`);
    } catch (err) {
      setMensaje(`Error: ${String(err)}`);
    } finally {
      setExportando(false);
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

      <main className="contenido">
        <section className="panel-editor">
          <div ref={contenedorEditor} className="editor" />
        </section>

        <section className="panel-preview">
          {svg && geometria ? (
            <>
              <div className="zoom-barra">
                <button
                  onClick={() => setZoom((z) => Math.max(0.2, z / 1.25))}
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
    </div>
  );
}

export default App;