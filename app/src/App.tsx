import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import { invoke } from "@tauri-apps/api/core";
import ejemploDatos from "../../ejemplos/datos.yaml?raw";
import { compilarSvg, plantillaExportar, fuentesLibreria } from "./lib/libreria";
import { analizarSvg } from "./lib/geometria";
import { listarTareas } from "./lib/yamlLineas";
import "./App.css";

function App() {
  const [texto, setTexto] = useState(ejemploDatos);
  const [svg, setSvg] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [milis, setMilis] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const editorRef = useRef<EditorView | null>(null);
  const contenedorEditor = useRef<HTMLDivElement | null>(null);
  const svgCaja = useRef<HTMLDivElement | null>(null);
  const textoRef = useRef(texto);
  textoRef.current = texto;

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
            if (u.docChanged) setTexto(u.state.doc.toString());
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
      const r = await compilarSvg(texto);
      if (!vivo) return;
      setSvg(r.svg);
      setErrores(r.errores);
      setMilis(r.milis);
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(temporizador);
    };
  }, [texto]);

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
      if (!caja || !g) return -1;
      const s = caja.querySelector("svg");
      if (!s) return -1;
      const rect = s.getBoundingClientRect();
      const escala = rect.width / g.ancho;
      const py = (e.clientY - rect.top) / escala;
      return g.bandas.findIndex((b) => py >= b.y0 && py < b.y1);
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

  const exportarPdf = async () => {
    setExportando(true);
    setMensaje("");
    try {
      const ruta = await invoke<string>("exportar_pdf", {
        yaml: textoRef.current,
        plantilla: plantillaExportar(),
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
        <h1>Gantt Viewer</h1>
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

      <main className="contenido">
        <section className="panel-editor">
          <div ref={contenedorEditor} className="editor" />
        </section>

        <section className="panel-preview">
          {svg && geometria ? (
            <div
              ref={svgCaja}
              className="svg-contenedor"
              onClick={alClicSvg}
            >
              <div dangerouslySetInnerHTML={{ __html: svg }} className="svg-hoja" />
            </div>
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
    </div>
  );
}

export default App;