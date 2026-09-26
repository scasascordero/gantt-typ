// menuContextual.ts — comportamiento común del fondo de los menús contextuales.

import type { MouseEvent } from "react";

// Un clic derecho fuera de un menú contextual abierto lo cierra y actúa sobre lo
// que hay debajo (p. ej. abre el menú del calendario), en vez de quedar tragado
// por el fondo del menú, que dejaba visible el menú anterior.
export function cerrarYReenviarClicDerecho(e: MouseEvent, onCerrar: () => void): void {
  e.preventDefault();
  const { clientX, clientY } = e;
  onCerrar();
  window.setTimeout(() => {
    const el = document.elementFromPoint(clientX, clientY);
    el?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY, button: 2 }));
  }, 0);
}
