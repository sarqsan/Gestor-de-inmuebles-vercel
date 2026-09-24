/**
 * BLOQUE C — Política de recobro (dunning) configurable + plan de recobro.
 * Motor PURO, determinista y sin I/O.
 *
 * ADVERTENCIA NORMATIVA (verificada 2026-09-20, docs/BLOQUE-C-NORMATIVA.md):
 * los desfases D+3 / D+10 / D+20 / D+30 son una POLÍTICA OPERATIVA CONFIGURABLE.
 * Ninguna norma del ordenamiento español impone ese calendario al arrendador. La
 * LAU no fija un plazo de requerimiento previo para la reclamación de rentas ni
 * para el desahucio por falta de pago (art. 27.1 LAU / 156.1 LEC en relación con
 * el art. 22 LAU); el requerimiento sí es relevante como prueba de la constitución
 * en mora (art. 1100 CC) y como medio de actividad negociadora previa (LO 1/2025).
 * Por eso el motor permite días de gracia configurables y NUNCA presenta un paso
 * como «plazo legal».
 *
 * Inmutabilidad del histórico (FASE 4): una política se versiona, no se edita.
 * `generarPlanRecobro` congela `versionPolitica` en cada paso, de modo que cambiar
 * la política no reescribe los planes ya generados ni el histórico existente.
 */

import type {
  CriterioEscalado,
  EstadoPasoPlan,
  PasoPlanRecobro,
  PasoPoliticaMorosidad,
  PiezaDeuda,
  PoliticaMorosidad,
} from '../../types/morosidad';
import { simpleHash } from './morosidadEstados';

/** Familia de plantillas GAP1 por código de paso (mapeo aditivo, sin duplicar). */
export const PLANTILLA_POR_CODIGO: Record<string, string> = {
  'PRE-5': 'cobro.proximo_vencimiento',
  'D+0': 'cobro.vencimiento_hoy',
  'D+3': 'morosidad.primer_recordatorio',
  'D+10': 'morosidad.requerimiento_pago',
  'D+20': 'morosidad.requerimiento_fehaciente',
  'D+30': 'morosidad.escalado_aseguradora',
};

/** Política de referencia del ERP (los umbrales son editables por el usuario). */
export const PASOS_POLITICA_DEFECTO: PasoPoliticaMorosidad[] = [
  {
    codigo: 'PRE-5',
    nombre: 'Aviso de vencimiento (5 días antes)',
    diasOffset: -5,
    accion: 'NOTIFICAR',
    canal: 'EMAIL',
    destinatarios: ['INQUILINO', 'ADMINISTRACION'],
    prioridad: 3,
    activo: true,
    notas:
      'Reciclado de la plantilla canónica cobro.proximo_vencimiento (GAP1): no se crea una segunda plantilla de aviso.',
  },
  {
    codigo: 'D+0',
    nombre: 'Vencimiento del periodo',
    diasOffset: 0,
    accion: 'NOTIFICAR',
    canal: 'EMAIL',
    destinatarios: ['INQUILINO'],
    prioridad: 3,
    activo: true,
    notas: 'Plantilla canónica cobro.vencimiento_hoy (GAP1).',
  },
  {
    codigo: 'D+3',
    nombre: 'Primer recordatorio',
    diasOffset: 3,
    accion: 'NOTIFICAR',
    canal: 'EMAIL',
    destinatarios: ['INQUILINO', 'ADMINISTRACION'],
    prioridad: 2,
    accionPosterior: 'D+10',
    activo: true,
    notas: 'Plazo configurable: no es un requisito legal.',
  },
  {
    codigo: 'D+10',
    nombre: 'Requerimiento de pago',
    diasOffset: 10,
    accion: 'NOTIFICAR',
    canal: 'EMAIL',
    destinatarios: ['INQUILINO', 'PROPIETARIO'],
    prioridad: 2,
    accionPosterior: 'D+20',
    activo: true,
    notas:
      'Conviene que sea fehaciente (burofax/correo certificado/acta notarial) a efectos probatorios y de actividad negociadora previa; el medio lo decide el usuario.',
  },
  {
    codigo: 'D+20',
    nombre: 'Reclamación formal y aviso de consecuencias',
    diasOffset: 20,
    accion: 'NOTIFICAR',
    canal: 'EMAIL',
    destinatarios: ['INQUILINO', 'PROPIETARIO'],
    prioridad: 1,
    accionPosterior: 'D+30',
    activo: true,
    notas:
      'El texto de la plantilla es neutro: no amenaza con acciones que el ERP no puede verificar.',
  },
  {
    codigo: 'D+30',
    nombre: 'Escalado: aseguradora / jurídico',
    diasOffset: 30,
    accion: 'TAREA INTERNA',
    tipoEvento: 'morosidad.escalado_aseguradora',
    destinatarios: ['ADMINISTRACION', 'PROPIETARIO'],
    prioridad: 1,
    activo: true,
    notas:
      'No afirma envío a terceros: prepara el expediente y abre la decisión humana.',
  },
];

export const CRITERIOS_ESCALADO_DEFECTO: CriterioEscalado = {
  diasRetrasoMinimo: 30,
  mesesImpagadosMinimos: 2,
  requiereRequerimientoFehaciente: true,
  requiereMascDeclaradoParaJuridica: true,
};

export function politicaDefecto(
  propietarioId: string | undefined,
  fechaISO: string,
): PoliticaMorosidad {
  const id = `pol_${normalizarId(propietarioId || 'global')}_defecto`;
  return {
    id,
    propietarioId: propietarioId || undefined,
    nombre: 'Recobro estándar (política configurable)',
    version: 1,
    diasGracia: 2,
    pasos: PASOS_POLITICA_DEFECTO.map((p) => ({ ...p })),
    escalado: { ...CRITERIOS_ESCALADO_DEFECTO },
    activo: true,
    fechaCreacion: fechaISO,
    fechaActualizacion: fechaISO,
    origenDefecto: true,
    notas:
      'Umbrales orientativos. Ni los días de gracia ni los desfases D+x son plazos legales.',
  };
}

export function normalizarId(texto: string): string {
  return (texto || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Valida una política ANTES de guardarla (evita planes imposibles). */
export function validarPolitica(
  politica: Partial<PoliticaMorosidad>,
): { valida: boolean; errores: string[]; advertencias: string[] } {
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!politica.nombre) errores.push('nombre_requerido');
  if (!Array.isArray(politica.pasos) || politica.pasos.length === 0) {
    errores.push('pasos_requeridos');
  }
  const codigos = new Set<string>();
  for (const paso of politica.pasos || []) {
    if (!paso.codigo) errores.push('paso_sin_codigo');
    if (codigos.has(paso.codigo)) errores.push(`paso_duplicado:${paso.codigo}`);
    codigos.add(paso.codigo);
    if (typeof paso.diasOffset !== 'number' || Number.isNaN(paso.diasOffset)) {
      errores.push(`paso_offset_invalido:${paso.codigo}`);
    }
    if (paso.accion === 'NOTIFICAR') {
      const clave = paso.tipoEvento || PLANTILLA_POR_CODIGO[paso.codigo];
      if (!clave) errores.push(`paso_sin_plantilla:${paso.codigo}`);
      if (!paso.destinatarios || paso.destinatarios.length === 0) {
        errores.push(`paso_sin_destinatarios:${paso.codigo}`);
      }
    }
    if (paso.accionPosterior && !codigos.has(paso.accionPosterior) && paso.accionPosterior !== 'ESCALAR') {
      // El código posterior puede declararse después (pasos ordenados); solo advierte.
      advertencias.push(`paso_accion_posterior_no_declarada:${paso.codigo}->${paso.accionPosterior}`);
    }
  }
  if (typeof politica.diasGracia === 'number' && politica.diasGracia < 0) {
    errores.push('dias_gracia_negativos');
  }
  if (typeof politica.diasGracia === 'number' && politica.diasGracia > 30) {
    advertencias.push('dias_gracia_excesivos_revisar');
  }
  const esc = politica.escalado;
  if (esc) {
    if (esc.diasRetrasoMinimo < 0) errores.push('escalado_dias_negativos');
    if (esc.mesesImpagadosMinimos < 1) errores.push('escalado_meses_minimo_1');
  } else {
    errores.push('escalado_requerido');
  }
  if (!politica.version || politica.version < 1) errores.push('version_requerida');
  return { valida: errores.length === 0, errores, advertencias };
}

/**
 * Versiona una política: `version + 1`, nueva `fechaActualizacion`, `id` igual.
 * Los planes ya generados conservan su `versionPolitica` ⇒ inmutabilidad del
 * histórico garantizada (FASE 4).
 */
export function versionarPolitica(
  anterior: PoliticaMorosidad,
  cambios: Partial<PoliticaMorosidad>,
  fechaISO: string,
): { politica: PoliticaMorosidad; advertencias: string[] } {
  const nueva: PoliticaMorosidad = {
    ...anterior,
    ...cambios,
    id: anterior.id,
    version: (anterior.version || 1) + 1,
    fechaCreacion: anterior.fechaCreacion,
    fechaActualizacion: fechaISO,
  };
  const advertencias: string[] = [];
  const codigosAnteriores = new Set((anterior.pasos || []).map((p) => p.codigo));
  const codigosNuevos = new Set((nueva.pasos || []).map((p) => p.codigo));
  for (const c of codigosAnteriores) {
    if (!codigosNuevos.has(c)) advertencias.push(`paso_retirado:${c}`);
  }
  for (const c of codigosNuevos) {
    if (!codigosAnteriores.has(c)) advertencias.push(`paso_nuevo:${c}`);
  }
  if (nueva.diasGracia !== anterior.diasGracia) {
    advertencias.push('dias_gracia_cambiados_no_reescriben_plan_existente');
  }
  return { politica: nueva, advertencias };
}

// ==========================================================================
// PLAN DE RECOBRO (ejecución de la política sobre los tramos de deuda)
// ==========================================================================

export interface EntradaPlan {
  expedienteId: string;
  politica: PoliticaMorosidad;
  piezas: PiezaDeuda[];
  /** Fecha de referencia YYYY-MM-DD (inyectable → determinista en tests). */
  fechaReferencia: string;
  /** Anclaje: el tramo más antiguo (por defecto) o un plan por tramo. */
  baseAnclaje?: 'MAS_ANTIGUO' | 'CADA_TRAMO';
  /** Estado del expediente: bloquea pasos si está cerrado/pagado. */
  expedienteCerrado?: boolean;
  /** Existe ya una comunicación por clave → el paso queda OMITIDO (idempotencia). */
  clavesComunicacionExistentes?: string[];
  /** Canales con transporte real disponible (GAP1). */
  transporteDisponible?: { email?: boolean; inapp?: boolean };
}

export function fechaIdempotenteAnclada(pieza: PiezaDeuda, fechaISO: string): number {
  return diasEntre(pieza.fechaVencimiento, fechaISO);
}

/** Días naturales entre dos fechas YYYY-MM-DD (positivo si `a` es anterior). */
export function diasEntre(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

export function sumarDias(fecha: string, dias: number): string {
  const base = Date.parse(`${fecha}T00:00:00Z`);
  if (Number.isNaN(base)) return fecha;
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

export function idPasoPlan(expedienteId: string, pasoCodigo: string, piezaId: string): string {
  return `paso_${simpleHash(`${expedienteId}|${pasoCodigo}|${piezaId}`).toString(16).padStart(8, '0')}`;
}

/** Clave GAP1 efectiva de un paso (para comprobar si la comunicación ya existe). */
export function clavePlantillaPaso(paso: PasoPoliticaMorosidad): string | undefined {
  return paso.tipoEvento || PLANTILLA_POR_CODIGO[paso.codigo];
}

/**
 * Genera (o regenera de forma idempotente) el plan de recobro de un expediente.
 * Determinista: mismos inputs ⇒ misma salida, con mismos ids. Re-ejecutar NO
 * duplica pasos ni comunicaciones.
 */
export function generarPlanRecobro(entrada: EntradaPlan): {
  plan: PasoPlanRecobro[];
  resumen: {
    total: number;
    accionables: number;
    programados: number;
    omitidos: number;
    bloqueados: number;
    sinTransporte: number;
  };
} {
  const { politica, fechaReferencia } = entrada;
  const abiertas = (entrada.piezas || [])
    .filter((p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA')
    .slice()
    .sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : a.fechaVencimiento > b.fechaVencimiento ? 1 : a.id < b.id ? -1 : 1));

  const ancla =
    (entrada.baseAnclaje || 'MAS_ANTIGUO') === 'CADA_TRAMO'
      ? abiertas
      : abiertas.slice(0, 1);
  if (ancla.length === 0) {
    return {
      plan: [],
      resumen: { total: 0, accionables: 0, programados: 0, omitidos: 0, bloqueados: 0, sinTransporte: 0 },
    };
  }

  const existentes = new Set(entrada.clavesComunicacionExistentes || []);
  const pasosActivos = (politica.pasos || []).filter((p) => p.activo !== false);
  const plan: PasoPlanRecobro[] = [];
  const generadoEn = `${fechaReferencia}T00:00:00.000Z`;

  for (const pieza of ancla) {
    for (const paso of pasosActivos) {
      const objetivo = sumarDias(pieza.fechaVencimiento, paso.diasOffset + (politica.diasGracia || 0));
      const clave = clavePlantillaPaso(paso);
      const id = idPasoPlan(entrada.expedienteId, paso.codigo, pieza.id);
      const yaComunicado = !!clave && existentes.has(clave);
      let estado: EstadoPasoPlan;
      let motivoBloqueo: string | undefined;

      if (entrada.expedienteCerrado) {
        estado = 'BLOQUEADO';
        motivoBloqueo = 'expediente_cerrado';
      } else if (yaComunicado) {
        estado = 'OMITIDO';
        motivoBloqueo = 'comunicacion_ya_registrada';
      } else if (objetivo > fechaReferencia) {
        estado = 'PROGRAMADO';
      } else if (paso.accion === 'NOTIFICAR') {
        const puede =
          (paso.canal === 'INAPP' && entrada.transporteDisponible?.inapp) ||
          (paso.canal !== 'INAPP' && entrada.transporteDisponible?.email) ||
          !entrada.transporteDisponible;
        estado = puede ? 'PREPARADO' : 'SIN_TRANSPORTE';
        if (!puede) motivoBloqueo = 'sin_transporte_real_canal_email';
      } else if (paso.accion === 'TAREA INTERNA') {
        estado = 'ACCIONABLE';
      } else {
        estado = 'OMITIDO';
        motivoBloqueo = 'paso_sin_accion';
      }

      plan.push({
        id,
        expedienteId: entrada.expedienteId,
        piezaDeudaId: pieza.id,
        cobroId: pieza.cobroId,
        pasoCodigo: paso.codigo,
        pasoNombre: paso.nombre,
        accion: paso.accion,
        fechaObjetivo: objetivo,
        tipoEvento: paso.accion === 'NOTIFICAR' ? clave : undefined,
        canalSolicitado: paso.canal,
        destinatarios: [...(paso.destinatarios || [])],
        prioridad: paso.prioridad,
        estado,
        motivoBloqueo,
        versionPolitica: politica.version,
        politicaId: politica.id,
        // El idempotencyKey GAP1 se materializa al emitir (ver eventoComunicacionMorosidad).
        idempotencyKey:
          paso.accion === 'NOTIFICAR' && clave
            ? `${clave}|${entrada.expedienteId}|${pieza.cobroId}`
            : undefined,
        generadoEn,
        actualizadoEn: generadoEn,
      });
    }
  }

  plan.sort((a, b) =>
    a.fechaObjetivo < b.fechaObjetivo
      ? -1
      : a.fechaObjetivo > b.fechaObjetivo
        ? 1
        : a.pasoCodigo < b.pasoCodigo
          ? -1
          : 1,
  );

  const resumen = {
    total: plan.length,
    accionables: plan.filter((p) => p.estado === 'ACCIONABLE' || p.estado === 'PREPARADO').length,
    programados: plan.filter((p) => p.estado === 'PROGRAMADO').length,
    omitidos: plan.filter((p) => p.estado === 'OMITIDO').length,
    bloqueados: plan.filter((p) => p.estado === 'BLOQUEADO').length,
    sinTransporte: plan.filter((p) => p.estado === 'SIN_TRANSPORTE').length,
  };
  return { plan, resumen };
}

/** Próximas acciones accionables/programadas (para el resumen y la UI). */
export function proximasAcciones(
  plan: PasoPlanRecobro[],
  fechaReferencia: string,
  limite = 5,
): PasoPlanRecobro[] {
  return plan
    .filter(
      (p) =>
        p.estado === 'ACCIONABLE' ||
        p.estado === 'PREPARADO' ||
        p.estado === 'PROGRAMADO' ||
        p.estado === 'SIN_TRANSPORTE',
    )
    .filter((p) => p.fechaObjetivo <= sumarDias(fechaReferencia, 30))
    .sort((a, b) =>
      a.fechaObjetivo < b.fechaObjetivo
        ? -1
        : a.fechaObjetivo > b.fechaObjetivo
          ? 1
          : (a.prioridad || 3) - (b.prioridad || 3),
    )
    .slice(0, limite);
}

export interface VeredictoEscalado {
  puedeEscalarAseguradora: boolean;
  puedeEscalarJuridico: boolean;
  motivos: string[];
  bloqueos: string[];
}

/**
 * Comprueba los criterios de escalado CONFIGURABLES de la política.
 * No emite juicios de legalidad: informa de qué falta según la política y de las
 * dependencias externas (requerimiento fehaciente, MASC declarado).
 */
export function evaluarEscalado(
  politica: Pick<PoliticaMorosidad, 'escalado'>,
  datos: {
    piezasAbiertas: PiezaDeuda[];
    fechaReferencia: string;
    requerimientoFehacienteExiste: boolean;
    mascDeclarado?: boolean;
    compromisoVigente?: boolean;
  },
): VeredictoEscalado {
  const esc = politica.escalado || CRITERIOS_ESCALADO_DEFECTO;
  const motivos: string[] = [];
  const bloqueos: string[] = [];
  const abiertas = (datos.piezasAbiertas || []).filter(
    (p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA' && p.estado !== 'EN_DISPUTA',
  );

  const masAntiguo = abiertas.slice().sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : 1))[0];
  const dias = masAntiguo ? diasEntre(masAntiguo.fechaVencimiento, datos.fechaReferencia) : 0;
  const mesesImpagados = abiertas.length;

  if (masAntiguo) motivos.push(`antiguedad_maxima_dias:${dias}`);
  motivos.push(`tramos_abiertos:${mesesImpagados}`);

  if (dias < esc.diasRetrasoMinimo) {
    bloqueos.push(`politica_dias_minimos:${esc.diasRetrasoMinimo}`);
  }
  if (mesesImpagados < esc.mesesImpagadosMinimos) {
    bloqueos.push(`politica_meses_minimos:${esc.mesesImpagadosMinimos}`);
  }
  if (esc.requiereRequerimientoFehaciente && !datos.requerimientoFehacienteExiste) {
    bloqueos.push('requiere_requerimiento_fehaciente_registrado');
  }

  const puedeEscalarAseguradora = bloqueos.length === 0;
  let puedeEscalarJuridico = bloqueos.length === 0;
  if (esc.requiereMascDeclaradoParaJuridica && !datos.mascDeclarado) {
    // LO 1/2025 art. 5.2: actividad negociadora previa como requisito de
    // procedibilidad (aplicable también al monitorio y al verbal del 250.1.1º LEC,
    // con criterios dispares entre Juntas de Jueces para el desahucio).
    puedeEscalarJuridico = false;
    bloqueos.push('masc_actividad_negociadora_previa_no_declarada');
  }
  if (datos.compromisoVigente) {
    motivos.push('existe_compromiso_vigente_revisar_antes_de_escalar');
  }

  return { puedeEscalarAseguradora, puedeEscalarJuridico, motivos, bloqueos };
}
