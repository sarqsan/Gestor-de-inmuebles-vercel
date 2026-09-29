/**
 * BLOQUE 10 · UX-6 — INTERACCIÓN ACCESIBLE EN CONTENEDORES.
 *
 * Problema real detectado en la inspección (§A1): tarjetas y filas del ERP abren un
 * detalle, seleccionan o alternan con `onClick` sobre un `<div>`, sin semántica ni
 * teclado. Eso hace que la acción **sólo funcione con ratón**.
 *
 * Solución única y mínima: un helper que devuelve las props necesarias para que el
 * contenedor sea un control de verdad para teclado y lectores de pantalla
 * (`role="button"`, foco, `Enter`/`Espacio` y nombre accesible).
 *
 * Se prefiere HTML semántico (`<button>`) siempre que el contenedor no tenga dentro
 * otros controles; cuando la tarjeta contiene botones propios (eliminar, editar…),
 * un `<button>` sería HTML inválido y es aquí donde aplica este helper.
 */
import type React from 'react';

export interface PropsInteraccion {
  role: 'button';
  tabIndex: 0;
  onClick: (evento: React.MouseEvent) => void;
  onKeyDown: (evento: React.KeyboardEvent) => void;
  'aria-label'?: string;
}

/**
 * Convierte un contenedor clicable en un control accesible por teclado.
 *
 * @param accion   la misma acción que ya ejecutaba el `onClick` (no se cambia).
 * @param etiqueta nombre accesible; imprescindible cuando el contenido no describe
 *                 la acción por sí solo (p. ej. una tarjeta de datos).
 */
export function propsInteraccion(
  accion: () => void,
  etiqueta?: string
): PropsInteraccion {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: () => accion(),
    onKeyDown: (evento) => {
      if (evento.key === 'Enter' || evento.key === ' ' || evento.key === 'Spacebar') {
        // Evita el scroll de la página con la barra espaciadora.
        evento.preventDefault();
        accion();
      }
    },
    ...(etiqueta ? { 'aria-label': etiqueta } : {}),
  };
}
