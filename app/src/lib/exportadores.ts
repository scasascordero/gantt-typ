// exportadores.ts — Serializadores MSPDI (MS Project 2003 XML), PMXML
// (Primavera P6 XML) y XER (Primavera P6, texto delimitado por tabs).
// Todos parten de la lista de filas ya resuelta por el motor Rust
// (`preparar_filas`): fechas, duraciones, rollup, CPM, dependencias.
//
// Nota: los cronogramas de la librería son en días de calendario. Los
// planificadores usan calendarios de 8h x 5 días por defecto; los archivos
// generados incluyen un calendario "24 Hour Calendar" (7 días) para las
// tareas, así P6 respeta las fechas tal cual. En MS Project, definí un
// calendario de 7 días o aceptá que recalcule los fines de semana.

import { fechaIso } from "./fechas";
import type { Fila, TipoDep } from "./modelo";

export interface ProyectoExportable {
  nombre: string;
  filas: Fila[];
}

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Uid {
  uid: number;
  wbs: string;
  outline: number;
}

// UID secuencial + WBS punteado (1, 1.2, 1.2.3) según el nivel DFS.
function numerar(filas: Fila[]): Map<string, Uid> {
  const m = new Map<string, Uid>();
  const contador = new Map<number, number>();
  const prefijo = new Map<number, string>();
  filas.forEach((f, i) => {
    for (const [n] of contador) if (n > f.nivel) contador.delete(n);
    const c = (contador.get(f.nivel) ?? 0) + 1;
    contador.set(f.nivel, c);
    const wbs = f.nivel > 0 ? `${prefijo.get(f.nivel - 1)}.${c}` : String(c);
    prefijo.set(f.nivel, wbs);
    m.set(f.codigo, { uid: i + 1, wbs, outline: f.nivel + 1 });
  });
  return m;
}

const MSPDI_TIPOS: Record<TipoDep, number> = { ff: 0, fs: 1, sf: 2, ss: 3 };
const PMXML_TIPOS: Record<TipoDep, string> = {
  fs: "FinishToStart",
  ss: "StartToStart",
  ff: "FinishToFinish",
  sf: "StartToFinish",
};
const XER_TIPOS: Record<TipoDep, string> = { fs: "PR_FS", ss: "PR_SS", ff: "PR_FF", sf: "PR_SF" };

// --- MSPDI (Microsoft Project 2003 XML) ------------------------------------

export function aMSPDI(p: ProyectoExportable): string {
  const uids = numerar(p.filas);
  const porCodigo = new Map(p.filas.map((f) => [f.codigo, f]));
  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  L.push('<Project xmlns="http://schemas.microsoft.com/project">');
  L.push(`  <Name>${esc(p.nombre)}</Name>`);
  L.push(`  <Title>${esc(p.nombre)}</Title>`);
  L.push(`  <CreationDate>${new Date().toISOString().replace(/\.\d+Z$/, "")}</CreationDate>`);
  L.push("  <Tasks>");
  for (const f of p.filas) {
    const u = uids.get(f.codigo)!;
    const inicio = fechaIso(f.inicioDias);
    const fin = fechaIso(f.terminoDias);
    const durH = f.hito || f.esGrupo ? 0 : f.duracion * 24;
    L.push("    <Task>");
    L.push(`      <UID>${u.uid}</UID>`);
    L.push(`      <ID>${u.uid}</ID>`);
    L.push(`      <Name>${esc(f.nombre)}</Name>`);
    L.push(`      <Text1>${esc(f.codigo)}</Text1>`);
    L.push("      <Active>1</Active>");
    if (f.esGrupo) L.push("      <Summary>1</Summary>");
    if (f.hito) L.push("      <Milestone>1</Milestone>");
    L.push(`      <Start>${inicio}T08:00:00</Start>`);
    L.push(`      <Finish>${fin}T17:00:00</Finish>`);
    L.push(`      <Duration>PT${durH}H0M0S</Duration>`);
    L.push(`      <PercentComplete>${Math.round(f.avance * 100)}</PercentComplete>`);
    L.push(`      <PhysicalPercentComplete>${Math.round(f.avance * 100)}</PhysicalPercentComplete>`);
    if (f.critico !== undefined) L.push(`      <Critical>${f.critico ? 1 : 0}</Critical>`);
    if (f.holgura !== undefined) L.push(`      <TotalSlack>${f.holgura * 24 * 60 * 100}</TotalSlack>`);
    L.push(`      <OutlineLevel>${u.outline}</OutlineLevel>`);
    L.push(`      <OutlineNumber>${u.wbs}</OutlineNumber>`);
    L.push(`      <WBS>${u.wbs}</WBS>`);
    if (f.padre && uids.has(f.padre)) L.push(`      <ParentID>${uids.get(f.padre)!.uid}</ParentID>`);
    for (const d of f.predecesoras) {
      if (!porCodigo.has(d.pred)) continue;
      L.push("      <PredecessorLink>");
      L.push(`        <PredecessorUID>${uids.get(d.pred)!.uid}</PredecessorUID>`);
      L.push(`        <Type>${MSPDI_TIPOS[d.tipo]}</Type>`);
      L.push(`        <Lag>${d.lag * 24 * 60 * 10}</Lag>`);
      L.push("      </PredecessorLink>");
    }
    L.push("    </Task>");
  }
  L.push("  </Tasks>");
  L.push("</Project>");
  return L.join("\r\n");
}

// --- PMXML (Primavera P6 XML) ----------------------------------------------

export function aPMXML(p: ProyectoExportable): string {
  const uids = numerar(p.filas);
  const porCodigo = new Map(p.filas.map((f) => [f.codigo, f]));
  const finProyecto = Math.max(...p.filas.map((f) => f.terminoDias));
  const iniProyecto = Math.min(...p.filas.map((f) => f.inicioDias));
  const L: string[] = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push("<PMML>");
  L.push("  <Header>");
  L.push("    <ToolName>gantt-editor</ToolName>");
  L.push("    <ToolVersion>1.0</ToolVersion>");
  L.push('    <Lang xmlns="http://www.w3.org/XML/1998/namespace">es</Lang>');
  L.push("  </Header>");
  L.push("  <Project>");
  L.push("    <ProjectID>1</ProjectID>");
  L.push("    <ProjectUniqueID>1</ProjectUniqueID>");
  L.push("    <ParentProjectUniqueID>-1</ParentProjectUniqueID>");
  L.push(`    <ShortName>${esc(p.nombre).slice(0, 30)}</ShortName>`);
  L.push(`    <ProjectName>${esc(p.nombre)}</ProjectName>`);
  L.push("    <WBSCode>1</WBSCode>");
  L.push("    <ProjectLayoutType>Project</ProjectLayoutType>");
  L.push(`    <StartDate>${fechaIso(iniProyecto)} 00:00</StartDate>`);
  L.push(`    <EndDate>${fechaIso(finProyecto)} 23:59</EndDate>`);
  for (const f of p.filas) {
    const u = uids.get(f.codigo)!;
    L.push("    <Task>");
    L.push(`      <TaskID>${u.uid}</TaskID>`);
    L.push(`      <TaskUniqueID>${u.uid}</TaskUniqueID>`);
    L.push(`      <WBSID>${u.uid}</WBSID>`);
    L.push(`      <Name>${esc(f.nombre)}</Name>`);
    L.push(`      <Type>${f.esGrupo ? "Task Summary" : f.hito ? "Milestone" : "Task Dependent"}</Type>`);
    L.push(`      <Duration>${f.hito ? 0 : Math.max(f.duracion, 1) * 86400000}</Duration>`);
    L.push(`      <DurationOriginal>${f.hito ? 0 : Math.max(f.duracion, 1) * 86400000}</DurationOriginal>`);
    L.push(`      <Start>${fechaIso(f.inicioDias)} 00:00</Start>`);
    L.push(`      <Finish>${fechaIso(f.terminoDias)} 23:59</Finish>`);
    L.push("      <Calendar>2</Calendar>");
    L.push(`      <PercentComplete>${Math.round(f.avance * 100)}</PercentComplete>`);
    L.push(`      <PhysicalPercentComplete>${Math.round(f.avance * 100)}</PhysicalPercentComplete>`);
    L.push(`      <Critical>${f.critico ? 1 : 0}</Critical>`);
    if (f.holgura !== undefined) L.push(`      <TotalFloat>${f.holgura * 24 * 60}</TotalFloat>`);
    if (f.padre && uids.has(f.padre)) L.push(`      <ParentTaskID>${uids.get(f.padre)!.uid}</ParentTaskID>`);
    L.push("    </Task>");
  }
  let relId = 1;
  for (const f of p.filas) {
    for (const d of f.predecesoras) {
      if (!porCodigo.has(d.pred)) continue;
      L.push("    <Relationship>");
      L.push(`      <RelationshipID>${relId}</RelationshipID>`);
      L.push(`      <RelationshipType>${PMXML_TIPOS[d.tipo]}</RelationshipType>`);
      L.push("      <ProjectID>1</ProjectID>");
      L.push(`      <PredecessorTaskID>${uids.get(d.pred)!.uid}</PredecessorTaskID>`);
      L.push(`      <PredecessorTaskUniqueID>${uids.get(d.pred)!.uid}</PredecessorTaskUniqueID>`);
      L.push(`      <SuccessorTaskID>${uids.get(f.codigo)!.uid}</SuccessorTaskID>`);
      L.push(`      <SuccessorTaskUniqueID>${uids.get(f.codigo)!.uid}</SuccessorTaskUniqueID>`);
      L.push(`      <LagDurationInteger>${d.lag}</LagDurationInteger>`);
      L.push("      <LagDurationType>2</LagDurationType>");
      L.push("    </Relationship>");
      relId++;
    }
  }
  for (const f of p.filas) {
    const u = uids.get(f.codigo)!;
    L.push("    <WBS>");
    L.push(`      <WBSID>${u.uid}</WBSID>`);
    L.push("      <ProjectID>1</ProjectID>");
    L.push("      <ProjectUniqueID>1</ProjectUniqueID>");
    L.push("      <ParentWBSID>0</ParentWBSID>");
    L.push(`      <Name>${esc(u.wbs)}</Name>`);
    L.push(`      <Description>${esc(f.nombre)}</Description>`);
    L.push(`      <Type>${f.esGrupo ? "Summary" : "Task"}</Type>`);
    L.push("    </WBS>");
  }
  L.push("  </Project>");
  L.push("  <CalendarData>");
  L.push("    <Calendar>");
  L.push("      <CalendarID>1</CalendarID>");
  L.push("      <CalendarName>Standard</CalendarName>");
  L.push("      <CalendarType>Employee</CalendarType>");
  L.push("      <HoursPerDay>8</HoursPerDay>");
  L.push("      <DaysPerWeek>5</DaysPerWeek>");
  L.push("      <DaysPerMonth>20</DaysPerMonth>");
  L.push("      <WeekWorkDayFlagList>1111100</WeekWorkDayFlagList>");
  L.push("    </Calendar>");
  L.push("    <Calendar>");
  L.push("      <CalendarID>2</CalendarID>");
  L.push("      <CalendarName>24 Hour Calendar</CalendarName>");
  L.push("      <CalendarType>Employee</CalendarType>");
  L.push("      <HoursPerDay>24</HoursPerDay>");
  L.push("      <DaysPerWeek>7</DaysPerWeek>");
  L.push("      <DaysPerMonth>30</DaysPerMonth>");
  L.push("      <WeekWorkDayFlagList>1111111</WeekWorkDayFlagList>");
  L.push("    </Calendar>");
  L.push("  </CalendarData>");
  L.push("</PMML>");
  return L.join("\n");
}

// --- XER (Primavera P6, delimitado por tabs) --------------------------------

const xerTxt = (s: string): string => s.replace(/\\/g, "\\\\").replace(/\t/g, " ").replace(/\r?\n/g, "\\n");
const xerFecha = (z: number): string => `${fechaIso(z)} 00:00`;

function bloque(tabla: string, columnas: string[], filas: string[][]): string {
  const out = [`%T\t${tabla}`, `%E\t${columnas.join("\t")}`];
  for (const f of filas) out.push(f.join("\t"));
  return out.join("\r\n");
}

export function aXER(p: ProyectoExportable): string {
  const uids = numerar(p.filas);
  const porCodigo = new Map(p.filas.map((f) => [f.codigo, f]));
  const partes: string[] = [];
  partes.push(`EREXP  V95.4.0    1 ${Date.now()}`);
  partes.push(
    bloque("PROJECT", ["PROJECT_ID", "PROJECT_UNIQUE_ID", "SHORT_NAME", "WBS_CODE", "CREATED_DATE"], [
      ["1", "1", xerTxt(p.nombre), "1", `${fechaIso(Math.min(...p.filas.map((f) => f.inicioDias)))} 00:00:00`],
    ]),
  );
  partes.push(
    bloque("CALENDAR", ["CAL_ID", "CAL_NAME", "CAL_TYPE", "HRS_PER_DAY", "DAYS_PER_WEEK", "DAYS_PER_MONTH", "WEEK_WORK_FLAG"], [
      ["1", "Standard", "1", "8", "5", "20", "WWWWWOO"],
      ["2", "24 Hour Calendar", "1", "24", "7", "30", "WWWWWWW"],
    ]),
  );
  partes.push(
    bloque("PROJWBS", ["WBS_ID", "PROJECT_ID", "PROJECT_UNIQUE_ID", "PARENT_WBS_ID", "WBS_NAME", "WBS_SHORT_PATH", "WBS_TYPE"],
      p.filas.map((f) => {
        const u = uids.get(f.codigo)!;
        return [String(u.uid), "1", "1", "0", xerTxt(u.wbs), xerTxt(f.codigo), f.esGrupo ? "tt" : "tt"];
      }),
    ),
  );
  partes.push(
    bloque(
      "TASK",
      ["TASK_ID", "TASK_UNIQUE_ID", "PROJECT_ID", "PROJECT_UNIQUE_ID", "WBS_ID", "TASK_TYPE", "MILESTONE", "STATUS_CODE", "NAME", "OUTLVL", "DURATION_TYPE", "DURATION_2", "START_DATE", "FINISH_DATE", "TOTAL_FLOAT", "CAL_ID", "CRITICAL"],
      p.filas.map((f) => {
        const u = uids.get(f.codigo)!;
        return [
          String(u.uid), String(u.uid), "1", "1", String(u.uid),
          f.esGrupo ? "TT_Sub" : f.hito ? "TT_Mile" : "TT_Task",
          f.hito ? "1" : "0",
          f.avance >= 1 ? "TK_Complete" : f.avance > 0 ? "TK_Active" : "TK_NotStart",
          xerTxt(f.nombre), String(u.outline), "1",
          String(f.hito ? 0 : Math.max(f.duracion, 1) * 86400000),
          xerFecha(f.inicioDias), xerFecha(f.terminoDias),
          f.holgura !== undefined ? String(f.holgura * 1440) : "0",
          "2",
          f.critico === undefined ? "N" : f.critico ? "Y" : "N",
        ];
      }),
    ),
  );
  let predId = 1;
  const preds: string[][] = [];
  for (const f of p.filas) {
    for (const d of f.predecesoras) {
      if (!porCodigo.has(d.pred)) continue;
      preds.push([
        String(predId++), String(uids.get(f.codigo)!.uid), String(uids.get(d.pred)!.uid),
        "1", "1", XER_TIPOS[d.tipo], String(d.lag * 1440), "1", "0",
      ]);
    }
  }
  if (preds.length) {
    partes.push(
      bloque("TASKPRED", ["PRED_ID", "TASK_ID", "PRED_TASK_ID", "PROJECT_ID", "PROJECT_UNIQUE_ID", "PRED_TYPE", "PRED_LAG", "PRED_CAL_TYPE", "PRED_PRIORITY"], preds),
    );
  }
  partes.push("%F");
  return partes.join("\r\n");
}
