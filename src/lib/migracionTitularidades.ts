/**
 * MIGRACIÓN AL MODELO DE N TITULARES (BLOQUE 2 · 2.4)
 * ====================================================
 *
 * Garantías exigidas y respetadas:
 *
 *   · ADITIVA:  crea la colección `titularidades`. NO modifica, NO sobrescribe
 *               y NO elimina los campos heredados (`propietarioId`,
 *               `propietarioPrincipalId`, `propietarioSecundarioId`).
 *   · REVERSIBLE: `planReversion` devuelve exactamente los registros creados por
 *               un lote (sólo los de `origen === 'MIGRACION'` con su
 *               `migracionId`), para poder borrarlos sin tocar nada más.
 *   · IDEMPOTENTE: la clave determinista `inmuebleId__propietarioId` hace que
 *               ejecutar la migración dos veces NO cree duplicados.
 *   · AUDITABLE: cada registro guarda `origen: 'MIGRACION'`, `migracionId` y un
 *               evento de historial con el detalle del campo del que procede.
 *   · NO INVENTA: los porcentajes sólo salen de una fuente real. Si no la hay,
 *               queda `porcentaje: null` + `porcentajePendiente: true`.
 *
 * DRY-RUN OBLIGATORIO: `planificarMigracion` NO escribe nada; devuelve el
 * informe (nº de documentos afectados, titularidades generadas, incoherencias,
 * inmuebles sin titular, porcentajes desconocidos y duplicados evitados).
 *
 * Este módulo es PURO: no toca Firestore. La escritura la hace otro componente
 * a partir del plan devuelto.
 */

import type {
  Inmueble,
  Propietario,
  RolTitularidad,
  Titularidad,
} from '../types';
import type { ConfigFiscalLiquidacion } from '../tesoreria/tipos';
import {
  cerrarTitularidad,
  claveTitularidad,
  crearTitularidad,
  derivarPorcentajes,
} from '../utils/titularidadesEngine';

/* ------------------------------------------------------------------ */
/* Tipos del plan                                                       */
/* ------------------------------------------------------------------ */

/** De qué campo heredado procede cada titularidad. */
export type OrigenCampo =
  | 'propietarioId'
  | 'propietarioPrincipalId'
  | 'propietarioSecundarioId';

/** De dónde sale el porcentaje. `PENDIENTE` = no se conoce (nunca inventado). */
export type FuentePorcentaje = 'REPARTO_CONFIG' | 'UNICO_TITULAR' | 'PENDIENTE';

export type AccionMigracion = 'CREAR' | 'ACTUALIZAR' | 'SIN_CAMBIOS';

export interface TitularidadPropuesta {
  titularidad: Titularidad;
  origenCampo: OrigenCampo;
  fuentePorcentaje: FuentePorcentaje;
  accion: AccionMigracion;
  /** Motivo cuando la acción es SIN_CAMBIOS. */
  detalle?: string;
}

export type TipoIncoherencia =
  | 'SIN_TITULAR'
  | 'TITULAR_NO_REGISTRADO'
  | 'REPARTO_APUNTA_A_TERCERO'
  | 'REPARTO_INVALIDO'
  | 'RANURAS_EN_CONFLICTO'
  | 'CLAVE_DUPLICADA';

export interface IncoherenciaMigracion {
  inmuebleId: string;
  tipo: TipoIncoherencia;
  detalle: string;
  /** ¿Requiere decisión humana antes de materializar? */
  bloqueante: boolean;
}

export interface EntradaMigracion {
  inmueble: Inmueble;
  /** `config_liquidacion/{titularPrincipal}` — única fuente REAL de reparto. */
  config?: ConfigFiscalLiquidacion | null;
}

export interface OpcionesMigracion {
  migracionId: string;
  /** `fechaDesde` asignada a las titularidades migradas. Por defecto: ahora. */
  fechaCorte?: string;
  actorId?: string;
  actorNombre?: string;
  /** Titularidades ya existentes: para decidir CREAR / ACTUALIZAR / SIN_CAMBIOS. */
  existentes?: Titularidad[];
  /** Catálogo de titulares, para detectar IDs huérfanos. */
  propietarios?: Propietario[];
}

export interface PlanMigracion {
  migracionId: string;
  fechaCorte: string;
  /** Nº de documentos de inmueble analizados. */
  inmueblesAnalizados: number;
  /** Nº de inmuebles de los que saldrá al menos una titularidad. */
  inmueblesAfectados: number;
  /** Inmuebles sin NINGUNA ranura de titular: requieren decisión. */
  inmueblesSinTitular: string[];
  /** Total de relaciones propuestas (crear + actualizar). */
  titularidadesGeneradas: number;
  /** Desglose por acción. */
  porAccion: Record<AccionMigracion, number>;
  /** Cuántas quedan con porcentaje PENDIENTE (no inventado). */
  porcentajesPendientes: number;
  /** Cuántas toman el porcentaje de `repartoCopropiedad`. */
  porcentajesDeReparto: number;
  /** Cuántas son de titular único (100 %: no es una invención, es una deducción). */
  porcentajesUnicoTitular: number;
  /** Duplicados detectados y evitados por la clave determinista. */
  duplicadosEvitados: number;
  /** Incoherencias detectadas. */
  incoherencias: IncoherenciaMigracion[];
  /** Propuestas, listas para materializar. */
  propuestas: TitularidadPropuesta[];
  /** Texto para el panel de dry-run. */
  resumen: string;
  /** ¿Se puede materializar sin decisiones humanas previas? */
  requiereDecision: boolean;
}

/* ------------------------------------------------------------------ */
/* Planificación (DRY-RUN)                                              */
/* ------------------------------------------------------------------ */

/**
 * Ranuras heredadas de titularidad, en orden de prelación, SIN repetir IDs.
 * `duplicados` cuenta las apariciones repetidas que se han descartado: es la
 * prueba de que la clave determinista evita crear relaciones duplicadas.
 */
export function ranurasConDescartes(
  inmueble: Inmueble
): { ranuras: Array<{ campo: OrigenCampo; propietarioId: string }>; duplicados: number } {
  const ranuras: Array<{ campo: OrigenCampo; propietarioId: string }> = [];
  const candidatos: Array<[OrigenCampo, string | undefined]> = [
    ['propietarioPrincipalId', inmueble.propietarioPrincipalId],
    ['propietarioId', inmueble.propietarioId],
    ['propietarioSecundarioId', inmueble.propietarioSecundarioId],
  ];
  const vistos = new Set<string>();
  let duplicados = 0;
  for (const [campo, id] of candidatos) {
    if (typeof id !== 'string' || id.trim().length === 0) continue;
    if (vistos.has(id)) {
      duplicados += 1;
      continue;
    }
    vistos.add(id);
    ranuras.push({ campo, propietarioId: id });
  }
  return { ranuras, duplicados };
}

/** Ranuras heredadas de titularidad, en orden de prelación. */
export function ranurasTitularidad(
  inmueble: Inmueble
): Array<{ campo: OrigenCampo; propietarioId: string }> {
  return ranurasConDescartes(inmueble).ranuras;
}

/**
 * Construye el plan COMPLETO sin escribir nada.
 * Es el "dry-run" exigido antes de cualquier backfill real.
 */
export function planificarMigracion(
  entradas: EntradaMigracion[],
  opciones: OpcionesMigracion
): PlanMigracion {
  const fechaCorte = opciones.fechaCorte ?? new Date().toISOString();
  const existentes = opciones.existentes ?? [];
  const indiceExistentes = new Map(existentes.map((t) => [t.id, t]));
  const idsTitularesRegistrados = new Set((opciones.propietarios ?? []).map((p) => p.id));

  const propuestas: TitularidadPropuesta[] = [];
  const incoherencias: IncoherenciaMigracion[] = [];
  const inmueblesSinTitular: string[] = [];

  let duplicadosEvitados = 0;
  let porcentajesPendientes = 0;
  let porcentajesDeReparto = 0;
  let porcentajesUnicoTitular = 0;
  const porAccion: Record<AccionMigracion, number> = {
    CREAR: 0,
    ACTUALIZAR: 0,
    SIN_CAMBIOS: 0,
  };
  const clavesVistas = new Set<string>();
  const inmueblesAfectados = new Set<string>();

  for (const entrada of entradas) {
    const inm = entrada.inmueble;
    const { ranuras, duplicados } = ranurasConDescartes(inm);
    duplicadosEvitados += duplicados;

    if (ranuras.length === 0) {
      inmueblesSinTitular.push(inm.id);
      incoherencias.push({
        inmuebleId: inm.id,
        tipo: 'SIN_TITULAR',
        detalle:
          'El inmueble no tiene ninguna ranura de titularidad. ' +
          'No se crea ninguna titularidad: no hay base para decidir a quién pertenece.',
        // No bloquea la migración del resto, pero este inmueble queda pendiente.
        bloqueante: false,
      });
      continue;
    }

    inmueblesAfectados.add(inm.id);

    // --- Titular principal -------------------------------------------------
    // Prelación: propietarioPrincipalId > propietarioId.
    const principal = ranuras[0];
    const resto = ranuras.slice(1);

    // --- Porcentajes: SÓLO de fuente real ----------------------------------
    let porcentajes: Map<string, number> | null = null;
    let fuente: FuentePorcentaje = 'PENDIENTE';

    if (ranuras.length === 1) {
      // Un único titular ⇒ 100 %: no es una invención, es una consecuencia.
      porcentajes = new Map([[principal.propietarioId, 100]]);
      fuente = 'UNICO_TITULAR';
    } else if (ranuras.length === 2 && entrada.config) {
      const segundo = resto[0];
      const derivado = derivarPorcentajes(
        entrada.config,
        principal.propietarioId,
        segundo.propietarioId
      );
      if (derivado) {
        porcentajes = new Map([
          [principal.propietarioId, derivado.primero],
          [segundo.propietarioId, derivado.segundo],
        ]);
        fuente = 'REPARTO_CONFIG';
      } else {
        incoherencias.push({
          inmuebleId: inm.id,
          tipo: 'REPARTO_APUNTA_A_TERCERO',
          detalle:
            'Existe configuración de reparto, pero no cuadra con los titulares del inmueble ' +
            `(reparto: ${entrada.config.repartoCopropiedad?.segundoPropietarioId ?? '—'}; ` +
            `inmueble: ${segundo.propietarioId}). ` +
            'NO se extrapola: los porcentajes quedan PENDIENTES.',
          bloqueante: false,
        });
      }
    }

    if (!porcentajes && ranuras.length > 2) {
      incoherencias.push({
        inmuebleId: inm.id,
        tipo: 'REPARTO_INVALIDO',
        detalle:
          `El inmueble tiene ${ranuras.length} titulares y la única fuente real de reparto ` +
          'disponible (`repartoCopropiedad`) es binaria. NO se reparte a partes iguales: ' +
          'todos los porcentajes quedan PENDIENTES.',
        bloqueante: false,
      });
    }

    // --- Coherencia de ranuras --------------------------------------------
    if (
      typeof inm.propietarioId === 'string' &&
      typeof inm.propietarioPrincipalId === 'string' &&
      inm.propietarioId !== inm.propietarioPrincipalId
    ) {
      incoherencias.push({
        inmuebleId: inm.id,
        tipo: 'RANURAS_EN_CONFLICTO',
        detalle:
          `propietarioId (${inm.propietarioId}) y propietarioPrincipalId ` +
          `(${inm.propietarioPrincipalId}) difieren. Se tratan como DOS titulares y se ` +
          `toma ${principal.propietarioId} como principal. Requiere revisión humana.`,
        bloqueante: true,
      });
    }

    // --- Construcción de las propuestas ------------------------------------
    for (let i = 0; i < ranuras.length; i++) {
      const ranura = ranuras[i];
      const clave = claveTitularidad(inm.id, ranura.propietarioId);

      if (clavesVistas.has(clave)) {
        duplicadosEvitados += 1;
        continue;
      }
      clavesVistas.add(clave);

      // Titular referenciado pero no dado de alta en la colección `propietarios`.
      if (
        idsTitularesRegistrados.size > 0 &&
        !idsTitularesRegistrados.has(ranura.propietarioId)
      ) {
        incoherencias.push({
          inmuebleId: inm.id,
          tipo: 'TITULAR_NO_REGISTRADO',
          detalle: `El titular ${ranura.propietarioId} no consta en la colección 'propietarios'.`,
          bloqueante: false,
        });
      }

      const esPrincipal = i === 0;
      const porcentaje = porcentajes ? (porcentajes.get(ranura.propietarioId) ?? null) : null;
      const rol: RolTitularidad = esPrincipal ? 'PROPIETARIO' : 'COTITULAR';

      const nueva = crearTitularidad({
        inmuebleId: inm.id,
        propietarioId: ranura.propietarioId,
        porcentaje,
        esPrincipal,
        rol,
        fechaDesde: fechaCorte,
        origen: 'MIGRACION',
        migracionId: opciones.migracionId,
        actorId: opciones.actorId,
        actorNombre: opciones.actorNombre,
        motivo: `Migración desde el campo heredado '${ranura.campo}'.`,
      });

      const previa = indiceExistentes.get(clave);
      let accion: AccionMigracion = 'CREAR';
      let detalle: string | undefined;

      if (previa) {
        // IDEMPOTENCIA: si ya existe una titularidad migrada equivalente, no se toca.
        const equivalente =
          previa.propietarioId === nueva.propietarioId &&
          previa.esPrincipal === nueva.esPrincipal &&
          previa.porcentaje === nueva.porcentaje;
        if (equivalente) {
          accion = 'SIN_CAMBIOS';
          detalle = 'Ya existe una titularidad equivalente procedente de la migración.';
        } else if (previa.origen === 'MIGRACION') {
          accion = 'ACTUALIZAR';
          detalle = 'Se actualiza el registro creado por una migración anterior.';
        } else {
          // Creada a mano por un usuario: NUNCA se sobrescribe (podría tener
          // porcentajes reales introducidos por administración).
          accion = 'SIN_CAMBIOS';
          detalle =
            'Ya existe una titularidad creada manualmente: se respeta y NO se sobrescribe ' +
            '(podría contener porcentajes reales). Revisar a mano.';
          incoherencias.push({
            inmuebleId: inm.id,
            tipo: 'CLAVE_DUPLICADA',
            detalle: `La titularidad ${clave} ya existe con origen ${previa.origen}. No se sobrescribe.`,
            bloqueante: false,
          });
        }
      }

      if (porcentaje === null) porcentajesPendientes += 1;
      else if (fuente === 'REPARTO_CONFIG') porcentajesDeReparto += 1;
      else porcentajesUnicoTitular += 1;

      porAccion[accion] += 1;

      propuestas.push({
        titularidad: previa && accion === 'ACTUALIZAR' ? { ...nueva, version: previa.version + 1 } : nueva,
        origenCampo: ranura.campo,
        fuentePorcentaje: fuente,
        accion,
        detalle,
      });
    }
  }

  const requiereDecision =
    inmueblesSinTitular.length > 0 || incoherencias.some((i) => i.bloqueante);

  const plan: PlanMigracion = {
    migracionId: opciones.migracionId,
    fechaCorte,
    inmueblesAnalizados: entradas.length,
    inmueblesAfectados: inmueblesAfectados.size,
    inmueblesSinTitular,
    titularidadesGeneradas: propuestas.length,
    porAccion,
    porcentajesPendientes,
    porcentajesDeReparto,
    porcentajesUnicoTitular,
    duplicadosEvitados,
    incoherencias,
    propuestas,
    resumen: '',
    requiereDecision,
  };

  plan.resumen = redactarResumen(plan);
  return plan;
}

function redactarResumen(p: PlanMigracion): string {
  const lineas = [
    `Migración ${p.migracionId} (DRY-RUN, no se ha escrito nada)`,
    `· Inmuebles analizados: ${p.inmueblesAnalizados}`,
    `· Inmuebles que generarán titularidad: ${p.inmueblesAfectados}`,
    `· Titularidades propuestas: ${p.titularidadesGeneradas} ` +
      `(crear ${p.porAccion.CREAR} · actualizar ${p.porAccion.ACTUALIZAR} · sin cambios ${p.porAccion.SIN_CAMBIOS})`,
    `· Porcentajes: ${p.porcentajesDeReparto} desde reparto real · ` +
      `${p.porcentajesUnicoTitular} de titular único · ` +
      `${p.porcentajesPendientes} PENDIENTES (no inventados)`,
    `· Inmuebles sin titular: ${p.inmueblesSinTitular.length}`,
    `· Duplicados evitados por clave determinista: ${p.duplicadosEvitados}`,
    `· Incoherencias: ${p.incoherencias.length} (bloqueantes: ${p.incoherencias.filter((i) => i.bloqueante).length})`,
  ];
  if (p.requiereDecision) {
    lineas.push('· ATENCIÓN: hay casos que requieren decisión humana antes de materializar.');
  }
  return lineas.join('\n');
}

/* ------------------------------------------------------------------ */
/* Materialización (a partir del plan)                                  */
/* ------------------------------------------------------------------ */

/** Sólo las propuestas que realmente hay que escribir. */
export function propuestasAplicables(plan: PlanMigracion): TitularidadPropuesta[] {
  return plan.propuestas.filter((p) => p.accion !== 'SIN_CAMBIOS');
}

/** Inmuebles a los que habría que añadir el índice `titularesIds` (opcional). */
export function inmueblesConIndice(plan: PlanMigracion): Array<{ inmuebleId: string; titularesIds: string[] }> {
  const porInmueble = new Map<string, Set<string>>();
  for (const p of plan.propuestas) {
    if (p.accion === 'SIN_CAMBIOS') continue;
    if (!porInmueble.has(p.titularidad.inmuebleId)) {
      porInmueble.set(p.titularidad.inmuebleId, new Set());
    }
    porInmueble.get(p.titularidad.inmuebleId)!.add(p.titularidad.propietarioId);
  }
  return Array.from(porInmueble.entries()).map(([inmuebleId, ids]) => ({
    inmuebleId,
    titularesIds: Array.from(ids),
  }));
}

/* ------------------------------------------------------------------ */
/* Reversión                                                            */
/* ------------------------------------------------------------------ */

export interface PlanReversion {
  migracionId: string;
  /**
   * Registros que dejan de estar vigentes. NO se borran: se CIERRAN
   * (`estado:'BAJA'` + `fechaHasta` + `motivoBaja`), porque el histórico
   * patrimonial no se destruye (BLOQUE 2 · 2.2) y las reglas de Firestore
   * tienen `allow delete: if false` sobre `titularidades`.
   */
  titularidadesACerrar: Titularidad[];
  /** Registros de otro origen: NO se tocan. */
  clavesProtegidas: string[];
  resumen: string;
}

/**
 * Reversión SEGURA y NO destructiva.
 *
 * Conflicto de diseño resuelto (y documentado, no improvisado):
 *   · La regla `allow delete: if false` impide borrar titularidades.
 *   · Pero la migración debe poder deshacerse.
 *
 * Solución: la reversión CIERRA las titularidades creadas por el lote en lugar
 * de borrarlas. Dejan de estar vigentes (no aparecen en la titularidad actual)
 * y siguen en el histórico. Los campos heredados de los inmuebles no se tocan,
 * así que el sistema vuelve exactamente a su situación anterior.
 */
export function planReversion(
  migracionId: string,
  todas: Titularidad[],
  datos: { fecha?: string; actorId?: string; actorNombre?: string } = {}
): PlanReversion {
  const titularidadesACerrar: Titularidad[] = [];
  const clavesProtegidas: string[] = [];
  const fecha = datos.fecha ?? new Date().toISOString();

  for (const t of todas) {
    if (t.migracionId === migracionId && t.origen === 'MIGRACION' && t.estado === 'ACTIVA') {
      titularidadesACerrar.push(
        cerrarTitularidad(t, {
          fechaHasta: fecha,
          estado: 'BAJA',
          motivo: `REVERSION_MIGRACION:${migracionId}`,
          actorId: datos.actorId,
          actorNombre: datos.actorNombre,
        })
      );
    } else {
      clavesProtegidas.push(t.id);
    }
  }

  return {
    migracionId,
    titularidadesACerrar,
    clavesProtegidas,
    resumen:
      `Reversión del lote ${migracionId}: se CIERRAN ${titularidadesACerrar.length} titularidades ` +
      `creadas por la migración (no se borra nada). Se conservan intactas ` +
      `${clavesProtegidas.length} titularidades de otro origen y los campos heredados de los ` +
      `inmuebles no se modifican: el sistema vuelve a su situación anterior.`,
  };
}
