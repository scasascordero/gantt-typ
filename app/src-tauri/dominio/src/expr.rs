// expr.rs — Evaluación de expresiones aritméticas para campos que admiten
// fórmulas (p. ej. `cantidad: 3*40` o `cantidad: (12+8)^2`). Gramática:
//
//   Expr   := Term (('+'|'-') Term)*
//   Term   := Factor (('*'|'/') Factor)*
//   Factor := Unary ('^' Factor)?     // potencia, asociativa a la derecha
//   Unary  := ('-'|'+') Unary | Atom
//   Atom   := numero | '(' Expr ')'
//
// Parser recursivo descendente sin dependencias externas.

#[derive(Clone, Copy, Debug, PartialEq)]
enum Tok {
    Num(f64),
    Mas,
    Menos,
    Por,
    Entre,
    Potencia,
    Abre,
    Cierra,
}

fn tokenizar(s: &str) -> Result<Vec<Tok>, String> {
    let mut t = Vec::new();
    let mut it = s.chars().peekable();
    while let Some(&c) = it.peek() {
        if c.is_whitespace() {
            it.next();
            continue;
        }
        match c {
            '0'..='9' | '.' => {
                let mut num = String::new();
                while let Some(&c) = it.peek() {
                    if c.is_ascii_digit() || c == '.' {
                        num.push(c);
                        it.next();
                    } else {
                        break;
                    }
                }
                let v: f64 = num
                    .parse()
                    .map_err(|_| format!("número inválido: '{num}'"))?;
                t.push(Tok::Num(v));
            }
            '+' => {
                it.next();
                t.push(Tok::Mas);
            }
            '-' => {
                it.next();
                t.push(Tok::Menos);
            }
            '*' => {
                it.next();
                t.push(Tok::Por);
            }
            '/' => {
                it.next();
                t.push(Tok::Entre);
            }
            '^' => {
                it.next();
                t.push(Tok::Potencia);
            }
            '(' => {
                it.next();
                t.push(Tok::Abre);
            }
            ')' => {
                it.next();
                t.push(Tok::Cierra);
            }
            _ => return Err(format!("carácter no permitido: '{c}'")),
        }
    }
    Ok(t)
}

struct P<'a> {
    t: &'a [Tok],
    i: usize,
}

impl<'a> P<'a> {
    fn peek(&self) -> Option<Tok> {
        self.t.get(self.i).copied()
    }
    fn siguiente(&mut self) -> Option<Tok> {
        let tok = self.peek();
        if tok.is_some() {
            self.i += 1;
        }
        tok
    }

    fn expr(&mut self) -> Result<f64, String> {
        let mut v = self.termino()?;
        loop {
            match self.peek() {
                Some(Tok::Mas) => {
                    self.siguiente();
                    v += self.termino()?;
                }
                Some(Tok::Menos) => {
                    self.siguiente();
                    v -= self.termino()?;
                }
                _ => return Ok(v),
            }
        }
    }

    fn termino(&mut self) -> Result<f64, String> {
        let mut v = self.factor()?;
        loop {
            match self.peek() {
                Some(Tok::Por) => {
                    self.siguiente();
                    v *= self.factor()?;
                }
                Some(Tok::Entre) => {
                    self.siguiente();
                    v /= self.factor()?;
                }
                _ => return Ok(v),
            }
        }
    }

    fn factor(&mut self) -> Result<f64, String> {
        let base = self.unario()?;
        if self.peek() == Some(Tok::Potencia) {
            self.siguiente();
            let exp = self.factor()?; // asociativa a la derecha: 2^3^2 = 2^(3^2)
            Ok(base.powf(exp))
        } else {
            Ok(base)
        }
    }

    fn unario(&mut self) -> Result<f64, String> {
        match self.peek() {
            Some(Tok::Menos) => {
                self.siguiente();
                Ok(-self.unario()?)
            }
            Some(Tok::Mas) => {
                self.siguiente();
                self.unario()
            }
            _ => self.atomo(),
        }
    }

    fn atomo(&mut self) -> Result<f64, String> {
        match self.siguiente() {
            Some(Tok::Num(n)) => Ok(n),
            Some(Tok::Abre) => {
                let v = self.expr()?;
                match self.siguiente() {
                    Some(Tok::Cierra) => Ok(v),
                    _ => Err("falta ')'".to_string()),
                }
            }
            _ => Err("se esperaba un número".to_string()),
        }
    }
}

/// Evalúa una expresión aritmética completa. `Err` si está vacía, mal formada
/// o contiene caracteres no permitidos.
pub fn evaluar(s: &str) -> Result<f64, String> {
    let s = s.trim();
    if s.is_empty() {
        return Err("expresión vacía".to_string());
    }
    let t = tokenizar(s)?;
    if t.is_empty() {
        return Err("expresión vacía".to_string());
    }
    let mut p = P { t: &t, i: 0 };
    let v = p.expr()?;
    if p.i != t.len() {
        return Err("operador o paréntesis sobrante".to_string());
    }
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::evaluar;

    fn v(s: &str) -> f64 {
        evaluar(s).unwrap_or_else(|e| panic!("'{s}': {e}"))
    }

    #[test]
    fn aritmetica_basica() {
        assert_eq!(v("2*45"), 90.0);
        assert_eq!(v("120/2"), 60.0);
        assert_eq!(v("3+4*2"), 11.0);
        assert_eq!(v("10-3-2"), 5.0);
        assert_eq!(v("  1.5 * 2 "), 3.0);
        assert_eq!(v("40/8*3"), 15.0);
    }

    #[test]
    fn parentesis_y_unarios() {
        assert_eq!(v("(3+4)*2"), 14.0);
        assert_eq!(v("-(3)*2"), -6.0);
        assert_eq!(v("-3+7"), 4.0);
        assert_eq!(v("2*-3"), -6.0);
        assert_eq!(v("+5"), 5.0);
        assert_eq!(v("2--3"), 5.0);
        assert_eq!(v("((2))"), 2.0);
    }

    #[test]
    fn potencias() {
        assert_eq!(v("2^3"), 8.0);
        assert_eq!(v("2^3^2"), 512.0);
        assert_eq!(v("9^0.5"), 3.0);
    }

    #[test]
    fn errores() {
        assert!(evaluar("").is_err());
        assert!(evaluar("  ").is_err());
        assert!(evaluar("abc").is_err());
        assert!(evaluar("2*").is_err());
        assert!(evaluar("(1+2").is_err());
        assert!(evaluar("2+3)").is_err());
        assert!(evaluar("2 3").is_err());
        assert!(evaluar("2+*3").is_err());
        assert!(evaluar("1,5").is_err());
        assert!(evaluar("2%3").is_err());
        assert!(evaluar("1.2.3").is_err());
    }
}