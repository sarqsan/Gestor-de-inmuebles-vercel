/**
 * TRANSMISIÓN PATRIMONIAL DE UN INMUEBLE (K.2-B2 · H1)
 * =====================================================
 * Operación de dominio que traslada el TITULAR CANÓNICO de un inmueble de A a B.
 *
 * Es una operación DISTINTA de, y no debe confundirse con:
 *  · la edición ordinaria del inmueble (precio, dirección, características…),
 *    que NO transmite nada;
 *  · el cambio de principal fiscal (`marcarTitularPrincipal`), que sólo declara
 *    quién actúa como principal y NO mueve el canónico;
 *  · el cierre aislado de una titularidad, que termina UNA relación;
 *  · el alta aislada de una titularidad, que abre UNA relación.
 *
 * Contrato aprobado en K.2-B1:
 *   ANTES   propietarioId = A · titularesIds = [A, …] · titularidad(A) VIGENTE
 *   DESPUÉS propietarioId = B · titularesIds = [B, …] sin A · titularidad(A) CERRADA
 *           · titularidad(B) VIGENTE con porcentaje `null` · histórico de A intacto
 *
 * POR QUÉ A PIERDE EL ACCESO Y CONSERVA EL HISTÓRICO
 * --------------------------------------------------
 * El acceso al inmueble lo concede el índice `titularesIds` (Rules:
 * `inmuebleEsMio()` / `soyCotitularDelInmueble()`), de modo que retirar a A de
 * ese índice le revoca el acceso patrimonial vigente. En cambio, la rama de
 * `allow get` de `titularidades` que compara `resource.data.propietarioId` con
 * `myPropId()` NO depende del índice: A sigue pudiendo leer su propia
 * titularidad CERRADA por su clave determinista. Histórico sin acceso vigente.
 *
 * ALCANCE DELIBERADO (K.2-B2 §4, §6 y §10)
 * ----------------------------------------
 *  · Se cierra ÚNICAMENTE la titularidad del transmitente. Los demás
 *    cotitulares vigentes se CONSERVAN: el modelo tiene un motivo propio para
 *    disolver una copropiedad (`DISOLUCION_CONDOMINIO`), luego cerrar a todos
 *    no está justificado por una transmisión y sería cerrar en silencio
 *    relaciones ajenas a la operación.
 *  · `porcentajeTitularidad` del adquirente nace `null` (PENDIENTE). NUNCA 100,
 *    nunca 50/50: el reparto se declara después.
 *  · `propietarioSecundarioId` NO se toca, NO se usa como fuente de verdad y NO
 *    se elimina (compatibilidad legacy, fuera de alcance).
 *
 * Módulo PURO: no importa Firebase. La persistencia transaccional vive en
 * `transmisionPatrimonialFirestore.ts`, de modo que este contrato es
 * unit-testeable sin red ni emulador.
 */
import type {
  DatosFiscalesInmueble,
  Inmueble,
  MotivoCierreTitularidad,
  Propietario,
  Titularidad,
} from '../types';
import { fiscalDesdePropietario } from './altaInmuebleTitulares';
import {
  cerrarTitularidadEnMemoria,
  construirTitularidad,
  idTitularidad,
  titularidadesVigentes,
} from '../utils/titularidadesEngine';

/** Motivos admitidos: EXACTAMENTE los del modelo (no se inventa ninguno). */
const MOTIVOS_VALIDOS: readonly MotivoCierreTitularidad[] = [
  'VENTA',
  'DONACION',
  'HERENCIA',
  'DIVORCIO',
  'DISOLUCION_CONDOMINIO',
  'ERROR_DATOS',
  'OTRO',
];

export interface EntradaTransmision {
  /** Inmueble tal y como está AHORA (leído dentro de la transacción). */
  inmueble: Inmueble;
  /** Ficha del adquirente. Debe existir: la transmisión NUNCA crea propietarios. */
  adquirente: Propietario;
  /** Titularidades conocidas del inmueble (vigentes e históricas). */
  titularidades: readonly Titularidad[];
  motivo: MotivoCierreTitularidad;
  detalle?: string;
  actor?: { id?: string; nombre?: string };
  /** ISO. Por defecto, el instante de la operación. */
  fecha?: string;
}

export interface PlanTransmision {
  /** Titular canónico saliente (el `propietarioId` previo del inmueble). */
  transmitenteId: string;
  adquirenteId: string;
  /**
   * Titularidad del transmitente ya cerrada. `null` cuando el transmitente no
   * tenía ninguna vigente (ficha legacy sin modelo moderno): no se inventa un
   * histórico que nunca existió.
   */
  titularidadCerrada: Titularidad | null;
  /** Titularidad VIGENTE del adquirente, con porcentaje `null`. */
  titularidadAdquirente: Titularidad;
  /** Cotitulares vigentes que se conservan (sin el transmitente ni el adquirente). */
  cotitularesConservados: string[];
  /** Campos a escribir sobre el documento del inmueble. */
  cambiosInmueble: {
    propietarioId: string;
    propietarioPrincipalId: string;
    titularesIds: string[];
    datosFiscales: DatosFiscalesInmueble;
  };
}

const limpio = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/**
 * Precondiciones de la transmisión (§4). Devuelve la lista de errores; vacía =
 * puede ejecutarse. Puro: ninguna comprobación toca la red.
 */
export function validarTransmision(entrada: EntradaTransmision): string[] {
  const errores: string[] = [];
  const inmuebleId = limpio(entrada.inmueble?.id);
  const transmitente = limpio(entrada.inmueble?.propietarioId);
  const adquirente = limpio(entrada.adquirente?.id);

  if (!inmuebleId) errores.push('El inmueble no existe o no tiene identificador.');
  if (!transmitente) {
    errores.push('El inmueble no tiene titular canónico actual: no hay nada que transmitir.');
  }
  if (!adquirente) {
    errores.push('El adquirente no existe: la transmisión no crea fichas de propietario.');
  }
  if (transmitente && adquirente && transmitente === adquirente) {
    errores.push('El adquirente ya es el titular canónico del inmueble: no hay transmisión.');
  }
  if (!MOTIVOS_VALIDOS.includes(entrada.motivo)) {
    errores.push('El motivo de la transmisión no pertenece al conjunto admitido por el modelo.');
  }
  return errores;
}

/**
 * Calcula el estado resultante de la transmisión SIN persistir nada.
 *
 * Lanza si las precondiciones no se cumplen: así la transacción aborta ANTES de
 * escribir y nunca queda un estado parcial.
 */
export function planificarTransmision(entrada: EntradaTransmision): PlanTransmision {
  const errores = validarTransmision(entrada);
  if (errores.length > 0) throw new Error(errores[0]);

  const inmueble = entrada.inmueble;
  const inmuebleId = limpio(inmueble.id);
  const transmitenteId = limpio(inmueble.propietarioId);
  const adquirenteId = limpio(entrada.adquirente.id);
  const ahora = entrada.fecha || new Date().toISOString();

  // --- Titularidad del transmitente: se CIERRA (nunca se borra) -------------
  const vigentes = titularidadesVigentes(entrada.titularidades, inmuebleId);
  const claveTransmitente = idTitularidad(inmuebleId, transmitenteId);
  const vigenteTransmitente = vigentes.find((t) => t.id === claveTransmitente) || null;
  const titularidadCerrada = vigenteTransmitente
    ? cerrarTitularidadEnMemoria({
        titularidad: vigenteTransmitente,
        motivo: entrada.motivo,
        detalle: entrada.detalle,
        actor: entrada.actor,
        fechaCierre: ahora,
      })
    : null;

  // --- Titularidad del adquirente: VIGENTE y con porcentaje PENDIENTE -------
  const titularidadAdquirente = construirTitularidad({
    inmuebleId,
    propietarioId: adquirenteId,
    propietarioNombre: entrada.adquirente.nombre,
    // NUNCA 100 ni 50/50: el reparto se declara después (K.2-B1 §4).
    porcentaje: null,
    fechaInicio: ahora,
    actor: entrada.actor,
  });

  // --- Índice `titularesIds`: se COMPONE explícitamente --------------------
  // Un único valor final (nada de arrayRemove + arrayUnion sobre el mismo
  // campo). Sale el transmitente, entra el adquirente, el resto se conserva.
  const cotitularesConservados = (inmueble.titularesIds || [])
    .map(limpio)
    .filter((id) => id && id !== transmitenteId && id !== adquirenteId);
  const titularesIds = [adquirenteId, ...cotitularesConservados];

  // --- Snapshot fiscal derivado de la ficha del adquirente ------------------
  // Se reutiliza el helper existente; el resto de `datosFiscales` (incluido
  // `segundoPropietario`) se conserva tal cual: §10 prohíbe tocar el legacy.
  const datosFiscales: DatosFiscalesInmueble = {
    ...(inmueble.datosFiscales || {}),
    propietarioPrincipal: fiscalDesdePropietario(entrada.adquirente),
  };

  return {
    transmitenteId,
    adquirenteId,
    titularidadCerrada,
    titularidadAdquirente,
    cotitularesConservados,
    cambiosInmueble: {
      propietarioId: adquirenteId,
      propietarioPrincipalId: adquirenteId,
      titularesIds,
      datosFiscales,
    },
  };
}

/**
 * Detalle de auditoría de una transmisión ya consumada. Sólo identificadores y
 * metadatos de la operación: ningún dato personal innecesario (§11).
 */
export function detalleAuditoriaTransmision(plan: PlanTransmision, motivo: MotivoCierreTitularidad) {
  return {
    operacion: 'TRANSMISION_PATRIMONIAL',
    titularAnteriorId: plan.transmitenteId,
    titularNuevoId: plan.adquirenteId,
    motivo,
    titularidadCerradaId: plan.titularidadCerrada?.id,
    titularidadNuevaId: plan.titularidadAdquirente.id,
    cotitularesConservados: plan.cotitularesConservados,
  };
}
