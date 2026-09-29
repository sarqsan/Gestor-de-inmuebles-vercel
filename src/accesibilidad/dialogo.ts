/**
 * BLOQUE 10 · UX-6 — COMPORTAMIENTO ACCESIBLE DE DIÁLOGOS.
 *
 * Problema real detectado (§A3): de 104 capas de modal, sólo 2 declaraban
 * `role="dialog"`, 4 `aria-modal` y 1 gestionaba `Escape`. Sin un patrón común, el
 * foco no entra en el diálogo, no queda dentro y no vuelve al cerrar.
 *
 * Este hook concentra el comportamiento —sin librerías externas— y devuelve las
 * props que cada modal aplica a su contenedor:
 *  · `role="dialog"` + `aria-modal` + nombre accesible (título del diálogo);
 *  · el foco entra en el diálogo al abrirse y vuelve al punto de origen al cerrarse;
 *  · `Tab`/`Shift+Tab` se mantienen dentro del diálogo;
 *  · `Escape` cierra (cancelar), nunca ejecuta.
 *
 * No cambia ninguna lógica de la operación asociada al diálogo.
 */
import { useEffect, useRef } from 'react';
import type React from 'react';

/**
 * Pila de diálogos abiertos (el último es el que manda).
 *
 * Con dos diálogos abiertos a la vez (una ficha sobre un formulario), `Escape` y el
 * `Tab` sólo deben afectar al de arriba: si no, una pulsación cerraría también el de
 * abajo. No hay contexto en React para diálogos, así que la pila vive en el módulo.
 */
const pilaDialogos: number[] = [];
let siguienteIdDialogo = 0;

const SELECTOR_ENFOCABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Elementos realmente utilizables dentro del diálogo.
 *
 * NO se usa `offsetParent` para decidir: los diálogos son `position: fixed`, y en esa
 * situación el navegador devuelve `offsetParent === null` aunque el control esté
 * visible (además de que jsdom, en los tests, nunca lo calcula). Se descartan los
 * controles deshabilitados, ocultos de forma explícita (`hidden`, `display:none`,
 * `visibility:hidden`) o marcados como decorativos.
 */
function enfocables(contenedor: HTMLElement | null): HTMLElement[] {
  if (!contenedor) return [];
  return Array.from(contenedor.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES)).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
    if (el.style.display === 'none' || el.style.visibility === 'hidden') return false;
    return true;
  });
}

export interface OpcionesDialogo {
  /** Si el diálogo está abierto ahora mismo. */
  abierto: boolean;
  /** Acción de cierre/cancelación (la que ya tenía el modal). */
  onCerrar?: () => void;
  /** `false` para diálogos que no deben cerrarse con Escape (p. ej. operación en curso). */
  cerrableConEscape?: boolean;
}

export interface PropsDialogo {
  role: 'dialog';
  'aria-modal': true;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export interface DialogoAccesible {
  /** Ref que hay que poner en el contenedor del diálogo (no en la capa oscura). */
  refDialogo: React.RefObject<HTMLDivElement | null>;
  /** Props de semántica del diálogo. */
  propsDialogo: PropsDialogo;
}

/**
 * @param etiqueta   título del diálogo (`aria-label`), si no se enlaza por `id`.
 * @param idTitulo   `id` del elemento que contiene el título (`aria-labelledby`).
 */
export function useDialogoAccesible(
  { abierto, onCerrar, cerrableConEscape = true }: OpcionesDialogo,
  etiqueta?: string,
  idTitulo?: string
): DialogoAccesible {
  const refDialogo = useRef<HTMLDivElement | null>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;

  // Identificador estable para saber si este diálogo es el de arriba de la pila.
  const idDialogo = useRef(0);
  if (idDialogo.current === 0) idDialogo.current = ++siguienteIdDialogo;

  // Al abrir: guarda el foco de origen y mete el foco dentro del diálogo.
  useEffect(() => {
    if (!abierto) return;
    pilaDialogos.push(idDialogo.current);
    focoPrevio.current = (document.activeElement as HTMLElement) ?? null;

    // El primer enfocable recibe el foco; si no hay, el propio contenedor.
    const primero = enfocables(refDialogo.current)[0];
    if (primero) primero.focus();
    else refDialogo.current?.focus();

    return () => {
      // Al cerrar: sale de la pila y el foco vuelve a donde estaba (si sigue en el documento).
      const posicion = pilaDialogos.lastIndexOf(idDialogo.current);
      if (posicion !== -1) pilaDialogos.splice(posicion, 1);
      const anterior = focoPrevio.current;
      if (anterior && document.contains(anterior)) anterior.focus();
    };
  }, [abierto]);

  // Escape cierra; Tab y Shift+Tab se mantienen dentro del diálogo.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (evento: KeyboardEvent) => {
      // Sólo responde el diálogo de arriba.
      if (pilaDialogos[pilaDialogos.length - 1] !== idDialogo.current) return;
      if (evento.key === 'Escape' && cerrableConEscape) {
        evento.stopPropagation();
        cerrarRef.current?.();
        return;
      }
      if (evento.key !== 'Tab') return;
      const lista = enfocables(refDialogo.current);
      if (lista.length === 0) return;
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const activo = document.activeElement as HTMLElement | null;
      if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault();
        primero.focus();
      } else if (evento.shiftKey && (activo === primero || !refDialogo.current?.contains(activo))) {
        evento.preventDefault();
        ultimo.focus();
      }
    };
    document.addEventListener('keydown', alPulsar, true);
    return () => document.removeEventListener('keydown', alPulsar, true);
  }, [abierto, cerrableConEscape]);

  return {
    refDialogo,
    propsDialogo: {
      role: 'dialog',
      'aria-modal': true,
      ...(idTitulo ? { 'aria-labelledby': idTitulo } : etiqueta ? { 'aria-label': etiqueta } : {}),
    },
  };
}
