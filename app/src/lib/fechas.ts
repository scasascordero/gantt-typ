// fechas.ts — Fechas como días julianos desde la época 1970-01-01 (día 0),
// misma convención que `fechas.typ` y el motor Rust (`fechas.rs`).
// `fechaIso` y `aDias` se comparten entre el editor, la persistencia y los
// exportadores.

import { esVacioCrudo } from "./modelo";

export function diasDesdeEpoca(anio: number, mes: number, dia: number): number {
  const y = mes <= 2 ? anio - 1 : anio;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = mes > 2 ? mes - 3 : mes + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + dia - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function fechaDesdeDias(z: number): { anio: number; mes: number; dia: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const dia = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const mes = mp < 10 ? mp + 3 : mp - 9;
  const anio = y + (mes <= 2 ? 1 : 0);
  return { anio, mes, dia };
}

const p2 = (n: number) => String(n).padStart(2, "0");

export function fechaIso(z: number): string {
  const f = fechaDesdeDias(z);
  return `${f.anio}-${p2(f.mes)}-${p2(f.dia)}`;
}

// Acepta Date (el parser YAML convierte 2026-01-05 a Date), "AAAA-MM-DD",
// "AAAA-MM"/"AAAA" (día/mes 1) o número = día juliano directo.
export function aDias(v: unknown): number | null {
  if (esVacioCrudo(v)) return null;
  if (typeof v === "number") return Math.trunc(v);
  if (v instanceof Date) return diasDesdeEpoca(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const s = String(v).trim();
  const partes = s.split("-");
  if (partes.length < 1 || partes.length > 3) throw new Error(`Fecha inválida: ${s}`);
  return diasDesdeEpoca(
    Number(partes[0]),
    partes.length >= 2 ? Number(partes[1]) : 1,
    partes.length >= 3 ? Number(partes[2]) : 1,
  );
}