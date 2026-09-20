/**
 * GAP 8 — ADAPTADORES DE INTERCAMBIO B2B (FASES 7 y 8).
 * ========================================================
 * Arquitectura desacoplada: Factura → FacturaElectronicaB2B → AdaptadorIntercambio
 * → Plataforma (solución pública, privada u oficial).
 *
 * REGLAS INQUEBRANTABLES:
 * - NO se inventan APIs, endpoints, certificados, credenciales ni plataformas.
 * - NO se simula una conexión real como si fuera producción.
 * - Lo pendiente de especificación/oferta oficial se marca PENDIENTE y el
 *   adaptador lo declara abiertamente (requisitosExternos).
 * - Interoperabilidad: ningún adaptador acopla el ERP a un proveedor concreto;
 *   la selección de plataforma se guarda en el documento y puede cambiarse.
 */

import {
  AdaptadorIntercambioB2B,
  FacturaElectronicaB2B,
  PlataformaIntercambio,
  ResultadoTransporteB2B,
} from '../../types/facturaElectronicaB2B';

// ---------------------------------------------------------------------------
// Adaptador de PREPARACIÓN (no es un envío real; queda etiquetado como tal)
// ---------------------------------------------------------------------------

/**
 * Adaptador de preparación/simulación ETIQUETADA: verifica que el documento está
 * dispuesto para el intercambio y produce un acuse interno. NUNCA se presenta
 * como envío de producción: `simulado: true` y el estado resultante es
 * DISPUESTA_PARA_ENVIO (no ENVIADA).
 */
export class AdaptadorPreparacionB2B implements AdaptadorIntercambioB2B {
  readonly id = 'b2b_prep_local';
  readonly nombre = 'Adaptador de preparación local (sin envío externo)';
  readonly plataforma: PlataformaIntercambio = 'PLATAFORMA_PRIVADA';
  readonly modo = 'PREPARACION' as const;
  readonly mecanismo =
    'Prepara la factura electrónica para el intercambio: valida la presencia de emisor/receptor, formato y contenido. No realiza transmisión externa alguna.';
  readonly requisitosExternos: string[] = [
    'Ninguno: este adaptador no transmite datos fuera del sistema.',
    'Para el envío efectivo se requiere una plataforma de intercambio habilitada (solución pública AEAT o plataforma privada certificada).',
  ];

  enviar(feb: FacturaElectronicaB2B, contenido: string): ResultadoTransporteB2B {
    if (!contenido || !contenido.trim()) {
      return { ok: false, simulado: true, error: 'La factura electrónica no tiene contenido generado.', detalle: 'Generación ausente.' };
    }
    if (!feb.emisor?.nif || !feb.receptor?.nif) {
      return { ok: false, simulado: true, error: 'Emisor o receptor incompletos para el intercambio.', detalle: 'Datos de parte ausentes.' };
    }
    return {
      ok: true,
      simulado: true,
      detalle:
        'Factura DISPUESTA PARA ENVÍO (preparación local). Esto NO es un envío real: el intercambio efectivo requiere una plataforma habilitada.',
    };
  }

  reintentar(feb: FacturaElectronicaB2B, contenido: string): ResultadoTransporteB2B {
    return this.enviar(feb, contenido);
  }
}

// ---------------------------------------------------------------------------
// Solución pública (SPFE / AEAT / FACeB2B) — PENDIENTE DE ESPECIFICACIÓN
// ---------------------------------------------------------------------------

/**
 * Adaptador de la solución pública de facturación electrónica (AEAT, acceso vía
 * punto general FACeB2B según RD 238/2026).
 *
 * ESTADO REAL: las especificaciones técnicas de conexión (APIs, certificados,
 * credenciales) dependen de desarrollo normativo/técnico posterior. NO se
 * inventan endpoints: mientras no exista integración oficial publicada, este
 * adaptador se declara NO DISPONIBLE y cualquier intento de envío devuelve un
 * resultado PENDIENTE explícito (nunca un falso envío).
 */
export class AdaptadorSpfeB2B implements AdaptadorIntercambioB2B {
  readonly id = 'b2b_spfe_aeat';
  readonly nombre = 'Solución Pública de Facturación Electrónica (AEAT / FACeB2B)';
  readonly plataforma: PlataformaIntercambio = 'SPFE_AEAT';
  readonly modo = 'PRODUCCION' as const;
  readonly mecanismo =
    'Intercambio a través de la solución pública de facturación electrónica gestionada por la AEAT (RD 238/2026, art. 6).';
  readonly requisitosExternos: string[] = [
    'PENDIENTE NORMATIVO/TÉCNICO: calendario de obligatoriedad pendiente de orden ministerial.',
    'PENDIENTE TÉCNICO: especificaciones de conexión (API/certificados) de la SPFE no publicadas o no integradas.',
    'No se inventan endpoints ni credenciales: el envío efectivo se habilitará cuando exista integración oficial.',
  ];

  /** No disponible hasta que exista especificación oficial integrada. */
  disponible(): boolean {
    return false;
  }

  enviar(_feb: FacturaElectronicaB2B, _contenido: string): ResultadoTransporteB2B {
    return {
      ok: false,
      simulado: false,
      error:
        'PENDIENTE NORMATIVO/TÉCNICO: el envío a la solución pública (AEAT/FACeB2B) requiere especificaciones oficiales aún no integradas. No se simula un envío de producción.',
      detalle: 'Adaptador SPFE no disponible. Utilice el adaptador de preparación para dejar la factura dispuesta.',
    };
  }

  reintentar(feb: FacturaElectronicaB2B, contenido: string): ResultadoTransporteB2B {
    return this.enviar(feb, contenido);
  }
}

/**
 * Adaptador genérico para plataformas privadas certificadas.
 * PENDIENTE DE INTEGRACIÓN: un proveedor real se conectará implementando
 * AdaptadorIntercambioB2B. No se incluye ningún proveedor inventado.
 */
export class AdaptadorPlataformaPrivadaPendiente implements AdaptadorIntercambioB2B {
  readonly id = 'b2b_plataforma_privada';
  readonly nombre = 'Plataforma privada certificada (pendiente de integración)';
  readonly plataforma: PlataformaIntercambio = 'PLATAFORMA_PRIVADA';
  readonly modo = 'PRODUCCION' as const;
  readonly mecanismo =
    'Intercambio a través de plataforma privada de facturación electrónica certificada e interoperable (RD 238/2026, arts. 6-8).';
  readonly requisitosExternos: string[] = [
    'PENDIENTE TÉCNICO/SERVICIO: requiere contrato con plataforma privada certificada y sus especificaciones de conexión.',
    'No se simula conexión: sin proveedor configurado, el envío devuelve PENDIENTE explícito.',
  ];

  disponible(): boolean {
    return false;
  }

  enviar(_feb: FacturaElectronicaB2B, _contenido: string): ResultadoTransporteB2B {
    return {
      ok: false,
      simulado: false,
      error:
        'PENDIENTE TÉCNICO/SERVICIO: no hay plataforma privada configurada. No se simula un envío de producción.',
      detalle: 'Configure un proveedor real de intercambio B2B para habilitar el envío efectivo.',
    };
  }

  reintentar(feb: FacturaElectronicaB2B, contenido: string): ResultadoTransporteB2B {
    return this.enviar(feb, contenido);
  }
}

// ---------------------------------------------------------------------------
// Registro de adaptadores (interoperabilidad sin acoplamiento a proveedor)
// ---------------------------------------------------------------------------

export const ADAPTADORES_B2B: AdaptadorIntercambioB2B[] = [
  new AdaptadorPreparacionB2B(),
  new AdaptadorSpfeB2B(),
  new AdaptadorPlataformaPrivadaPendiente(),
];

export function obtenerAdaptadorB2B(id: string): AdaptadorIntercambioB2B | undefined {
  return ADAPTADORES_B2B.find((a) => a.id === id);
}

/** El único adaptador operativo hoy es el de preparación (sin envío externo). */
export function adaptadoresDisponiblesB2B(): AdaptadorIntercambioB2B[] {
  return ADAPTADORES_B2B.filter((a) => a.modo === 'PREPARACION');
}
