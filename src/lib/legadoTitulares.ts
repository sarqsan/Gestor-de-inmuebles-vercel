/**
 * LEGADO DEL MODELO BINARIO DE PROPIEDAD — ANÁLISIS (NO DESTRUCTIVO)
 * ==================================================================
 * Antes de N-TITULARES, un inmueble podía declarar un «segundo propietario /
 * co-arrendador» con datos tecleados a mano:
 *
 *   · `inmuebles.propietarioSecundarioId`
 *   · `inmuebles.datosFiscales.tieneSegundoPropietario`
 *   · `inmuebles.datosFiscales.segundoPropietario` (instantánea fiscal)
 *   · `inmuebles.datosFiscales.propietarioPrincipal` tecleado sin ficha
 *
 * Este módulo es PURO y de SÓLO LECTURA. NO migra, NO borra y NO reescribe nada:
 * clasifica lo que hay para que la interfaz lo conserve y lo explique, y para
 * que una futura migración (intervención aparte) tenga el trabajo identificado.
 *
 * Reglas que respeta:
 *  1. Los datos históricos nunca se eliminan ni se sobrescriben.
 *  2. Una relación legacy sólo es representable como titularidad si apunta a una
 *     FICHA EXISTENTE (id o NIF). Si el nombre está tecleado y no hay ficha, no
 *     se inventa una persona: queda documentado como migración manual.
 *  3. La migración automática masiva no se ejecuta aquí (ni en la app): sería
 *     ambigua (personas sin ficha, porcentajes desconocidos, duplicados).
 */
import type { Inmueble, Propietario } from '../types';
import { normalizarNif } from './titularesModelo';

export type ClaseLegado =
  /** No hay datos del modelo binario. */
  | 'SIN_LEGADO'
  /** Instantánea fiscal del principal sin ficha: se conserva tal cual. */
  | 'PRINCIPAL_SIN_FICHA'
  /** Segundo propietario declarado que SÍ apunta a una ficha existente. */
  | 'SEGUNDO_CON_FICHA'
  /** Segundo propietario tecleado a mano sin ficha localizable. */
  | 'SEGUNDO_SIN_FICHA';

export interface AnalisisLegadoTitularidad {
  clase: ClaseLegado;
  /** ¿Hay algún dato del modelo binario que conservar? */
  tieneLegado: boolean;
  /** El `propietarioPrincipal` guardado no corresponde a ninguna ficha del ámbito. */
  principalSinFicha: boolean;
  /** El segundo propietario del inmueble apunta a una ficha existente. */
  segundoConFicha: boolean;
  /** El segundo propietario está tecleado y no hay ficha: migración MANUAL. */
  segundoSinFicha: boolean;
  /** Ficha (si la hay) con la que se puede representar el legado como titularidad. */
  propietarioIdRepresentable?: string;
  /**
   * `true` cuando representar el legado como N-TITULARES exige una decisión
   * humana (crear la ficha que falta). Nunca se hace en automático.
   */
  requiereMigracionManual: boolean;
  /** Explicación para la interfaz (lenguaje no técnico). */
  mensaje: string;
}

/** ¿Existe una ficha con este id dentro del ámbito visible? */
function fichaPorId(titulares: readonly Propietario[], id: string | undefined): Propietario | undefined {
  const limpio = (id || '').trim();
  if (!limpio) return undefined;
  return (titulares || []).find((t) => t.id === limpio);
}

/** ¿Existe una ficha con este NIF/CIF? */
function fichaPorNif(titulares: readonly Propietario[], nif: string | undefined): Propietario | undefined {
  const norm = normalizarNif(nif);
  if (!norm) return undefined;
  return (titulares || []).find((t) => normalizarNif(t.nifCif) === norm);
}

/**
 * Clasifica el legado binario de un inmueble. Sólo lee; no modifica el inmueble
 * ni las fichas.
 */
export function analizarLegadoTitularidad(
  inmueble: Inmueble | null | undefined,
  opciones: { titulares?: readonly Propietario[] } = {},
): AnalisisLegadoTitularidad {
  const titulares = opciones.titulares || [];
  const df = inmueble?.datosFiscales;
  const segundo = df?.segundoPropietario;
  const principal = df?.propietarioPrincipal;

  const tieneSegundo = Boolean(
    (inmueble?.propietarioSecundarioId || '').trim() ||
      df?.tieneSegundoPropietario ||
      (segundo && (segundo.nombre || segundo.nifDni || segundo.propietarioId)),
  );

  const fichaSegundo =
    fichaPorId(titulares, inmueble?.propietarioSecundarioId) ||
    fichaPorId(titulares, segundo?.propietarioId) ||
    fichaPorNif(titulares, segundo?.nifDni);

  const fichaPrincipal =
    fichaPorId(titulares, inmueble?.propietarioId) ||
    fichaPorId(titulares, inmueble?.propietarioPrincipalId) ||
    fichaPorId(titulares, principal?.propietarioId) ||
    fichaPorNif(titulares, principal?.nifDni);

  const hayPrincipal = Boolean(principal && (principal.nombre || principal.nifDni));
  const principalSinFicha = hayPrincipal && !fichaPrincipal;

  if (!tieneSegundo && !principalSinFicha) {
    return {
      clase: 'SIN_LEGADO',
      tieneLegado: false,
      principalSinFicha: false,
      segundoConFicha: false,
      segundoSinFicha: false,
      requiereMigracionManual: false,
      mensaje: '',
    };
  }

  if (tieneSegundo && fichaSegundo) {
    return {
      clase: 'SEGUNDO_CON_FICHA',
      tieneLegado: true,
      principalSinFicha,
      segundoConFicha: true,
      segundoSinFicha: false,
      propietarioIdRepresentable: fichaSegundo.id,
      requiereMigracionManual: false,
      mensaje:
        'Este inmueble conserva un cotitular del modelo anterior que sí tiene ficha de titular. ' +
        'Aparece en el apartado de titulares del inmueble y no se ha modificado ningún dato suyo.',
    };
  }

  if (tieneSegundo) {
    return {
      clase: 'SEGUNDO_SIN_FICHA',
      tieneLegado: true,
      principalSinFicha,
      segundoConFicha: false,
      segundoSinFicha: true,
      requiereMigracionManual: true,
      mensaje:
        'Este inmueble conserva un cotitular del modelo anterior sin ficha de titular (datos tecleados). ' +
        'Se muestran tal como se guardaron y no se ha inventado ninguna ficha: para regularizarlo, ' +
        'crea su titular en Propietarios/Titulares y asígnalo después al inmueble.',
    };
  }

  return {
    clase: 'PRINCIPAL_SIN_FICHA',
    tieneLegado: true,
    principalSinFicha: true,
    segundoConFicha: false,
    segundoSinFicha: false,
    requiereMigracionManual: true,
    mensaje:
      'El titular principal de este inmueble se guardó como dato del inmueble (modelo anterior), sin ficha de titular. ' +
      'Se conserva tal cual y no se ha creado ninguna ficha automáticamente: para regularizarlo, ' +
      'crea el titular en Propietarios/Titulares y selecciónalo al editar el inmueble.',
  };
}

/**
 * ¿Es SEGURO representar el legado como N-TITULARES ahora mismo?
 *
 * Sólo cuando el segundo propietario apunta a una ficha EXISTENTE y esa
 * relación todavía no está declarada (`titularesIds`). Aun así esta función NO
 * escribe: el alta/edición de una titularidad pasa siempre por el flujo normal
 * (persona que gestiona + confirmación + auditoría de la capa de datos).
 */
export function legadoRepresentableComoTitularidad(
  analisis: AnalisisLegadoTitularidad,
  inmueble: Inmueble | null | undefined,
): { representable: boolean; propietarioId?: string; motivo: string } {
  if (!analisis.tieneLegado || !analisis.propietarioIdRepresentable) {
    return {
      representable: false,
      motivo: analisis.requiereMigracionManual
        ? 'Falta la ficha del titular: requiere decisión humana (no se inventa una persona).'
        : 'No hay legado binario en este inmueble.',
    };
  }
  const yaDeclarado = Array.isArray(inmueble?.titularesIds)
    && inmueble!.titularesIds!.includes(analisis.propietarioIdRepresentable);
  if (yaDeclarado) {
    return { representable: false, propietarioId: analisis.propietarioIdRepresentable, motivo: 'La relación ya está declarada como titularidad.' };
  }
  return {
    representable: true,
    propietarioId: analisis.propietarioIdRepresentable,
    motivo: 'Existe ficha del cotitular: puede declararse su titularidad con el flujo normal (porcentaje PENDIENTE si no consta).',
  };
}
