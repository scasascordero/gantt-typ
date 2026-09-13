#!/usr/bin/env python3
"""
Convierte una planilla Excel (.xlsx) con columnas
    codigo, nombre, duracion, inicio, termino, avance, padre
a un archivo .yaml o .csv que la librería gantt.typ puede leer
directamente con leer-yaml()/leer-csv().

Uso:
    python xlsx_a_datos.py entrada.xlsx salida.yaml
    python xlsx_a_datos.py entrada.xlsx salida.csv --hoja "Cronograma"

Requiere: pip install openpyxl
(Si prefieres no usar Python, también puedes abrir el Excel y hacer
"Guardar como" -> CSV; Typst lee CSV de forma nativa con csv().)
"""
import argparse
import csv
import datetime
import sys

try:
    import openpyxl
except ImportError:
    sys.exit("Falta la dependencia 'openpyxl'. Instálala con: pip install openpyxl")

# Nombres de columna aceptados (normalizados) -> campo interno.
ALIAS = {
    "codigo": "codigo", "id": "codigo",
    "nombre": "nombre", "actividad": "nombre", "tarea": "nombre",
    "duracion": "duracion", "dias": "duracion",
    "inicio": "inicio", "fechainicio": "inicio",
    "termino": "termino", "fin": "termino", "fechatermino": "termino", "fechafin": "termino",
    "avance": "avance", "progreso": "avance", "avance": "avance",
    "padre": "padre", "tareamadre": "padre", "padrecodigo": "padre",
    "hito": "hito",
}


def normalizar_encabezado(valor):
    s = str(valor or "").strip().lower()
    for ch in (" ", "-", "_", "%"):
        s = s.replace(ch, "")
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")):
        s = s.replace(a, b)
    return s


def celda_a_texto(valor, campo):
    if valor is None:
        return ""
    if isinstance(valor, (datetime.date, datetime.datetime)):
        return valor.strftime("%Y-%m-%d")
    if campo == "avance" and isinstance(valor, (int, float)):
        return str(valor)
    return str(valor).strip()


def leer_filas(ruta_excel, hoja=None):
    libro = openpyxl.load_workbook(ruta_excel, data_only=True)
    ws = libro[hoja] if hoja else libro.active

    filas = list(ws.iter_rows(values_only=True))
    if not filas:
        return []

    encabezados = [ALIAS.get(normalizar_encabezado(c)) for c in filas[0]]

    if "codigo" not in encabezados or "nombre" not in encabezados or "inicio" not in encabezados:
        sys.exit(
            "La planilla debe tener al menos las columnas: codigo, nombre, inicio "
            "(además de duracion/termino/avance/padre, opcionales). "
            f"Encabezados leídos: {filas[0]}"
        )

    registros = []
    for fila in filas[1:]:
        if fila is None or all(v is None for v in fila):
            continue
        reg = {}
        for campo, valor in zip(encabezados, fila):
            if campo is None:
                continue
            reg[campo] = celda_a_texto(valor, campo)
        if not reg.get("codigo") and not reg.get("nombre"):
            continue
        registros.append(reg)
    return registros


CAMPOS_SALIDA = ["codigo", "nombre", "duracion", "inicio", "termino", "avance", "padre"]


def escribir_csv(registros, ruta_salida):
    with open(ruta_salida, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS_SALIDA, extrasaction="ignore")
        w.writeheader()
        for r in registros:
            w.writerow({k: r.get(k, "") for k in CAMPOS_SALIDA})


def escribir_yaml(registros, ruta_salida):
    def esc(valor):
        valor = str(valor)
        if valor == "":
            return '""'
        if any(ch in valor for ch in ':#%"\'') or valor != valor.strip():
            return '"' + valor.replace('"', '\\"') + '"'
        return valor

    lineas = ["tareas:"]
    for r in registros:
        lineas.append(f"  - codigo: {esc(r.get('codigo', ''))}")
        lineas.append(f"    nombre: {esc(r.get('nombre', ''))}")
        for campo in ("duracion", "inicio", "termino", "avance", "padre"):
            v = r.get(campo, "")
            if v != "":
                lineas.append(f"    {campo}: {esc(v)}")
    with open(ruta_salida, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas) + "\n")


def principal():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada", help="Archivo .xlsx de origen")
    ap.add_argument("salida", help="Archivo .yaml o .csv de destino")
    ap.add_argument("--hoja", default=None, help="Nombre de la hoja (por defecto, la activa)")
    args = ap.parse_args()

    registros = leer_filas(args.entrada, args.hoja)
    if args.salida.lower().endswith(".csv"):
        escribir_csv(registros, args.salida)
    else:
        escribir_yaml(registros, args.salida)

    print(f"Listo: {len(registros)} filas escritas en {args.salida}")


if __name__ == "__main__":
    principal()
