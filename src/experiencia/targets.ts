/**
 * CAPA TRANSVERSAL §6 — FASE 2 · Localización y resaltado visual de `target` (DOM).
 *
 * Reglas:
 *  - El resaltado es un overlay posicionado sobre el elemento (no se modifica el
 *    elemento destino ni sus clases/atributos): DOM funcional intacto.
 *  - `pointer-events: none` en el overlay → nunca bloquea la interacción.
 *  - Un único resaltado activo por documento; `limpiarResaltado()` es idempotente.
 *  - Sin dependencias externas. Seguro en SSR/tests (comprueba `document`).
 */

export const ATRIBUTO_TOUR = 'data-tour';
export const ID_OVERLAY_RESALTADO = 'experiencia-resaltado';

/** Selector estándar para un target declarado con `data-tour="<id>"`. */
export function selectorTour(id: string): string {
  return `[${ATRIBUTO_TOUR}="${id}"]`;
}

export function localizarTarget(selector: string, raiz: ParentNode | null = typeof document !== 'undefined' ? document : null): HTMLElement | null {
  if (!raiz || !selector) return null;
  try {
    const el = raiz.querySelector(selector);
    return el instanceof HTMLElement ? el : null;
  } catch {
    return null; // selector inválido → tratado como inexistente
  }
}

/**
 * Visible = existe, está conectado, no oculto por `hidden`/`display:none`/`visibility:hidden`
 * y (si el entorno lo soporta) tiene caja con tamaño. En jsdom `getBoundingClientRect`
 * devuelve 0×0 siempre, por eso el tamaño solo se exige cuando hay layout real.
 */
export function esVisible(el: HTMLElement | null): boolean {
  if (!el || !el.isConnected) return false;
  let nodo: HTMLElement | null = el;
  while (nodo) {
    if (nodo.hidden) return false;
    const inline = nodo.style;
    if (inline && (inline.display === 'none' || inline.visibility === 'hidden')) return false;
    if (typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(nodo);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    nodo = nodo.parentElement;
  }
  const rect = el.getBoundingClientRect();
  const hayLayout = typeof (el as HTMLElement).offsetParent !== 'undefined' && (rect.width > 0 || rect.height > 0 || document.body.getBoundingClientRect().width > 0);
  return hayLayout ? rect.width > 0 || rect.height > 0 : true;
}

export function targetVisible(selector: string): boolean {
  return esVisible(localizarTarget(selector));
}

function obtenerOverlay(crear: boolean): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let ov = document.getElementById(ID_OVERLAY_RESALTADO);
  if (!ov && crear) {
    ov = document.createElement('div');
    ov.id = ID_OVERLAY_RESALTADO;
    ov.setAttribute('aria-hidden', 'true');
    ov.setAttribute('data-experiencia-overlay', '1');
    Object.assign(ov.style, {
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: '60',
      borderRadius: '14px',
      boxShadow: '0 0 0 4px rgba(79, 70, 229, 0.85), 0 0 0 9999px rgba(15, 23, 42, 0.28)',
      transition: 'top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(ov);
  }
  return ov;
}

function posicionar(ov: HTMLElement, el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  const margen = 6;
  ov.style.top = `${Math.max(0, r.top - margen)}px`;
  ov.style.left = `${Math.max(0, r.left - margen)}px`;
  ov.style.width = `${r.width + margen * 2}px`;
  ov.style.height = `${r.height + margen * 2}px`;
  ov.setAttribute('data-target', el.getAttribute(ATRIBUTO_TOUR) || '');
}

export interface ResultadoResaltado {
  estado: 'RESALTADO' | 'NO_ENCONTRADO' | 'NO_VISIBLE';
  elemento: HTMLElement | null;
  /** Deshace el resaltado y los listeners de reposicionamiento. Idempotente. */
  limpiar: () => void;
}

/**
 * Resalta el target. Si no existe o no es visible, no crea overlay y lo comunica.
 * Hace scroll suave al elemento cuando el navegador lo soporta.
 */
export function resaltarTarget(selector: string): ResultadoResaltado {
  const el = localizarTarget(selector);
  if (!el) return { estado: 'NO_ENCONTRADO', elemento: null, limpiar: limpiarResaltado };
  if (!esVisible(el)) return { estado: 'NO_VISIBLE', elemento: el, limpiar: limpiarResaltado };

  limpiarResaltado();
  const ov = obtenerOverlay(true);
  if (!ov) return { estado: 'NO_ENCONTRADO', elemento: null, limpiar: limpiarResaltado };

  if (typeof el.scrollIntoView === 'function') {
    try {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      /* jsdom u otros: ignorar */
    }
  }
  posicionar(ov, el);

  const reposicionar = () => {
    if (!el.isConnected) {
      limpiarResaltado();
      return;
    }
    posicionar(ov, el);
  };
  window.addEventListener('scroll', reposicionar, true);
  window.addEventListener('resize', reposicionar);
  limpiadores.push(() => {
    window.removeEventListener('scroll', reposicionar, true);
    window.removeEventListener('resize', reposicionar);
  });

  return { estado: 'RESALTADO', elemento: el, limpiar: limpiarResaltado };
}

const limpiadores: Array<() => void> = [];

/** Elimina el overlay y los listeners. Puede llamarse tantas veces como se quiera. */
export function limpiarResaltado(): void {
  while (limpiadores.length) limpiadores.pop()?.();
  const ov = obtenerOverlay(false);
  ov?.remove();
}

export function hayResaltadoActivo(): boolean {
  return !!obtenerOverlay(false);
}
