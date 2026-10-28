/**
 * P1.5-pre (D3) — Modalidad del sistema de facturación, CONFIGURABLE y HONESTA.
 * ===========================================================================
 * Antes de este cambio `FacturacionSection` fijaba `modalidad: 'VERIFACTU'` y
 * `claseSistema: 'VERIFACTU'` en tres puntos. Eso AFIRMABA, en el registro y en
 * el QR, que el ERP era un sistema VERI*FACTU cuando NO existe remisión alguna
 * a la AEAT. El plan P1.4/P1.5 exige un dictamen fiscal previo; mientras no
 * exista, la modalidad por defecto es `PREPARACION` (preparación interna, SIN
 * remisión) y el QR usa la URL de NO_VERIFACTU.
 *
 * REGLAS:
 * - Este módulo es PURO (sin `import.meta.env`, sin red, sin secretos): se puede
 *   probar y reutilizar desde servidor. La lectura de la variable pública la
 *   hace el componente.
 * - Un valor desconocido NUNCA activa VERI*FACTU: cae en `PREPARACION` y avisa.
 * - `VERIFACTU` solo debe configurarse tras el dictamen de P1.4 y con transporte
 *   AEAT implementado y verificado. Esta sesión NO lo configura.
 */
import type { ModalidadFacturacion } from '../types/facturacion';

export type ModalidadSistemaFacturacion = 'VERIFACTU' | 'NO_VERIFACTU' | 'PREPARACION';

/** Fallo cerrado: sin configuración explícita, preparación sin remisión. */
export const MODALIDAD_SISTEMA_POR_DEFECTO: ModalidadSistemaFacturacion = 'PREPARACION';

export interface ResolucionModalidad {
  modalidad: ModalidadSistemaFacturacion;
  valorReconocido: boolean;
  /** Aviso cuando el valor configurado no es válido. Nunca se activa VERI*FACTU. */
  aviso: string | null;
  /** Texto mostrado al usuario; distingue preparación de remisión real. */
  descripcion: string;
}

const DESCRIPCIONES: Record<ModalidadSistemaFacturacion, string> = {
  VERIFACTU:
    'Modalidad VERI*FACTU declarada. Requiere dictamen fiscal previo (P1.4) y transporte AEAT verificado.',
  NO_VERIFACTU:
    'Modalidad NO VERI*FACTU. Registro interno sin remisión a la AEAT.',
  PREPARACION:
    'Preparación interna, sin remisión a la AEAT. Pendiente de dictamen fiscal (P1.4).',
};

export const VARIABLE_MODALIDAD_SISTEMA = 'VITE_MODALIDAD_SISTEMA_FACTURACION';

/**
 * Resuelve la modalidad desde un valor de configuración (variable pública
 * `VITE_MODALIDAD_SISTEMA_FACTURACION`). Acepta los tres valores en mayúsculas
 * o minúsculas. Cualquier otra cosa → `PREPARACION` + aviso.
 */
export function resolverModalidadSistema(valor?: string | null): ResolucionModalidad {
  const crudo = String(valor ?? '').trim();
  if (!crudo) {
    return {
      modalidad: MODALIDAD_SISTEMA_POR_DEFECTO,
      valorReconocido: true,
      aviso: null,
      descripcion: DESCRIPCIONES[MODALIDAD_SISTEMA_POR_DEFECTO],
    };
  }
  const normalizado = crudo.toUpperCase();
  if (normalizado === 'VERIFACTU' || normalizado === 'NO_VERIFACTU' || normalizado === 'PREPARACION') {
    const modalidad = normalizado as ModalidadSistemaFacturacion;
    return { modalidad, valorReconocido: true, aviso: null, descripcion: DESCRIPCIONES[modalidad] };
  }
  return {
    modalidad: MODALIDAD_SISTEMA_POR_DEFECTO,
    valorReconocido: false,
    aviso: `Valor «${crudo}» no reconocido para ${VARIABLE_MODALIDAD_SISTEMA}. Se usa PREPARACION sin remisión.`,
    descripcion: DESCRIPCIONES[MODALIDAD_SISTEMA_POR_DEFECTO],
  };
}

/**
 * `ModalidadFacturacion` solo admite dos valores. En PREPARACION se usa
 * `NO_VERIFACTU` para NO afirmar una adherencia VERI*FACTU inexistente; la
 * ausencia de remisión se comunica por separado con `esPreparacionSinRemision`.
 */
export function claseSistemaParaRegistro(modalidad: ModalidadSistemaFacturacion): ModalidadFacturacion {
  return modalidad === 'VERIFACTU' ? 'VERIFACTU' : 'NO_VERIFACTU';
}

export function esPreparacionSinRemision(modalidad: ModalidadSistemaFacturacion): boolean {
  return modalidad !== 'VERIFACTU';
}
