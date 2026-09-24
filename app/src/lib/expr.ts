// expr.ts — Evaluador de expresiones aritméticas para campos que admiten
// fórmulas (`cantidad`, `rendimiento`), espejo de dominio/src/expr.rs y de
// `a-formula` de datos.typ:
//   Expr   := Term (('+'|'-') Term)*
//   Term   := Factor (('*'|'/') Factor)*
//   Factor := Unary ('^' Factor)?     // potencia, asociativa a la derecha
//   Unary  := ('-'|'+') Unary | Atom
//   Atom   := numero | '(' Expr ')'

type Op = "+" | "-" | "*" | "/" | "^" | "(" | ")";
type Tok = { kind: "num"; v: number } | { kind: "op"; o: Op };

function esOp(tok: Tok | undefined, o: Op): tok is { kind: "op"; o: Op } {
  return tok !== undefined && tok.kind === "op" && tok.o === o;
}

function tokenizar(s: string): Tok[] {
  const t: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let num = "";
      while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === ".")) {
        num += s[i];
        i++;
      }
      const v = Number(num);
      if (Number.isNaN(v)) throw new Error(`número inválido: '${num}'`);
      t.push({ kind: "num", v });
      continue;
    }
    const simbolo: Record<string, "+" | "-" | "*" | "/" | "^" | "(" | ")"> = {
      "+": "+",
      "-": "-",
      "*": "*",
      "/": "/",
      "^": "^",
      "(": "(",
      ")": ")",
    };
    const op = simbolo[c];
    if (!op) throw new Error(`carácter no permitido: '${c}'`);
    t.push({ kind: "op", o: op });
    i++;
  }
  return t;
}

// Devuelve el número o lanza Error con un mensaje en español.
export function evaluar(expresion: string): number {
  const s = expresion.trim();
  if (s === "") throw new Error("expresión vacía");
  const t = tokenizar(s);
  if (t.length === 0) throw new Error("expresión vacía");

  let i = 0;
  const peek = (): Tok | undefined => t[i];
  const consumir = (): Tok | undefined => t[i++];

  function atomo(): number {
    const tok = consumir();
    if (tok?.kind === "num") return tok.v;
    if (esOp(tok, "(")) {
      const v = expr();
      const cierre = consumir();
      if (!esOp(cierre, ")")) throw new Error("falta ')'");
      return v;
    }
    throw new Error("se esperaba un número");
  }

  function unario(): number {
    const tok = peek();
    if (esOp(tok, "-")) {
      consumir();
      return -unario();
    }
    if (esOp(tok, "+")) {
      consumir();
      return unario();
    }
    return atomo();
  }

  function factor(): number {
    const base = unario();
    if (esOp(peek(), "^")) {
      consumir();
      const exp = factor();
      return Math.pow(base, exp);
    }
    return base;
  }

  function termino(): number {
    let v = factor();
    for (;;) {
      const tok = peek();
      if (esOp(tok, "*")) {
        consumir();
        v *= factor();
      } else if (esOp(tok, "/")) {
        consumir();
        v /= factor();
      } else {
        return v;
      }
    }
  }

  function expr(): number {
    let v = termino();
    for (;;) {
      const tok = peek();
      if (esOp(tok, "+")) {
        consumir();
        v += termino();
      } else if (esOp(tok, "-")) {
        consumir();
        v -= termino();
      } else {
        return v;
      }
    }
  }

  const v = expr();
  if (i !== t.length) throw new Error("operador o paréntesis sobrante");
  return v;
}

// Acepta un número (int/float) o un texto que sea número o fórmula; devuelve
// el valor o null si no es evaluable.
export function numeroOFormula(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return null;
    try {
      const n = Number(s);
      if (!Number.isNaN(n)) return n;
      return evaluar(s);
    } catch {
      return null;
    }
  }
  return null;
}