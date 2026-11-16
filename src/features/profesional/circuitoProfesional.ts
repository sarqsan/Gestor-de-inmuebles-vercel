/**
 * P1 · CIRCUITO DE TRABAJO DEL PROFESIONAL — núcleo puro
 * =======================================================
 * Sin React, sin Firebase, sin red. Toda la lógica del circuito que el portal
 * necesita, para poder probarla de verdad:
 *
 *   · qué transiciones de estado puede hacer el profesional (y cuáles NO);
 *   · aceptación y rechazo con motivo;
 *   · construcción de presupuestos con conceptos, cantidades, IVA e importes;
 *   · versionado del presupuesto y bloqueo cuando está aceptado;
 *   · clasificación de evidencias (antes / durante / después);
 *   · finalización por el profesional y confirmación por el propietario;
 *   · qué ve el profesional en su panel (los seis bloques de P1 §3).
 *
 * PRINCIPIO RECTOR: el profesional solo puede AÑADIR progreso. No puede
 * asignarse trabajos, no puede tocar inmuebles ni datos de otros propietarios,
 * no puede modificar un presupuesto aceptado y no puede borrar historial.
 * Estas reglas son las MISMAS que aplican `firestore.rules` y el servidor
 * documental; aquí se replican para que un fallo se vea en una prueba unitaria
 * y no en producción.
 */
import type {
  EstadoPresupuestoProfesional,
  EstadoTrabajoProfesional,
  PartidaPresupuesto,
} from '../../types';

// ---------------------------------------------------------------------------
// 1. Transiciones de estado permitidas al PROFESIONAL
// ---------------------------------------------------------------------------

/**
 * Estados a los que el profesional puede llevar un trabajo.
 *
 * NO incluye `CANCELADO` (cancelar es del propietario), ni volver a
 * `PENDIENTE`/`BUSCANDO_PROFESIONAL` (eso rompería la trazabilidad de la
 * asignación), ni `ASIGNADO` (no se autoasigna).
 */
export const ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL: readonly EstadoTrabajoProfesional[] = Object.freeze([
  'ACEPTADO',            // A · acepta el encargo
  'PROGRAMADO',          // visita técnica agendada
  'EN_EJECUCION',        // intervención en curso
  'PENDIENTE_MATERIAL',  // pausa por repuesto
  'PENDIENTE_PROPIETARIO', // necesita una decisión del propietario
  'FINALIZADO',          // E · informa de que ha terminado (pendiente de confirmar)
]);

/** Estados desde los que el profesional puede empezar a actuar. */
export const ESTADOS_ENCARGABLES: readonly EstadoTrabajoProfesional[] = Object.freeze([
  'ASIGNADO', 'ASIGNADA', 'PROFESIONAL_PROPUESTO', 'PRESUPUESTO_SOLICITADO',
]);

/** Estados terminales: no admiten más cambios del profesional. */
export const ESTADOS_CERRADOS: readonly EstadoTrabajoProfesional[] = Object.freeze([
  'CANCELADO', 'CANCELADA',
]);

export type MotivoRechazoTransicion =
  | 'ESTADO_NO_PERMITIDO_AL_PROFESIONAL'
  | 'TRABAJO_CERRADO'
  | 'TRANSICION_NO_VALIDA'
  | 'SIN_PROFESIONAL_ASIGNADO'
  | 'PROFESIONAL_DISTINTO'
  | 'FALTA_MOTIVO_RECHAZO';

export interface ResultadoTransicion {
  ok: boolean;
  motivo?: MotivoRechazoTransicion;
  mensaje?: string;
}

/**
 * ¿Puede este profesional llevar el trabajo a `destino`?
 *
 * @param trabajo        documento actual (solo los campos que importan)
 * @param profesionalId  id de ficha del profesional autenticado (myProfId de las reglas)
 * @param destino        estado pretendido
 * @param motivo         texto de rechazo (obligatorio si destino === 'ACEPTADO' vía rechazo)
 */
export function validarTransicionProfesional(
  trabajo: { estado?: string; profesionalId?: string | null } | null | undefined,
  profesionalId: string | null | undefined,
  destino: EstadoTrabajoProfesional,
): ResultadoTransicion {
  if (!trabajo) return { ok: false, motivo: 'TRANSICION_NO_VALIDA', mensaje: 'Trabajo inexistente.' };
  const actual = String(trabajo.estado || '') as EstadoTrabajoProfesional;

  if (ESTADOS_CERRADOS.includes(actual)) {
    return { ok: false, motivo: 'TRABAJO_CERRADO', mensaje: 'El trabajo está cerrado: no admite cambios.' };
  }
  // Aislamiento: solo el profesional ASIGNADO. Un profesional no puede tocar
  // un trabajo que no es suyo aunque conozca su id.
  if (!trabajo.profesionalId) {
    return { ok: false, motivo: 'SIN_PROFESIONAL_ASIGNADO', mensaje: 'El trabajo no está asignado a ningún profesional.' };
  }
  if (!profesionalId || trabajo.profesionalId !== profesionalId) {
    return { ok: false, motivo: 'PROFESIONAL_DISTINTO', mensaje: 'Este trabajo no está asignado a ti.' };
  }
  // No autoasignación ni reapertura.
  if (!ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL.includes(destino)) {
    return {
      ok: false,
      motivo: 'ESTADO_NO_PERMITIDO_AL_PROFESIONAL',
      mensaje: `El profesional no puede fijar el estado «${destino}».`,
    };
  }
  // Un estado solo cambia si es distinto (evita historial con ruido).
  if (actual === destino) {
    return { ok: false, motivo: 'TRANSICION_NO_VALIDA', mensaje: `El trabajo ya está en «${destino}».` };
  }
  return { ok: true };
}

/** Estados desde los que tiene sentido aceptar o rechazar un encargo. */
export function puedeAceptarORechazar(
  trabajo: { estado?: string; profesionalId?: string | null } | null | undefined,
  profesionalId: string | null | undefined,
): boolean {
  if (!trabajo?.profesionalId || trabajo.profesionalId !== profesionalId) return false;
  return ESTADOS_ENCARGABLES.includes(String(trabajo.estado || '') as EstadoTrabajoProfesional);
}

/** ¿Puede el profesional informar de finalización? Solo si está en curso. */
export function puedeFinalizar(
  trabajo: { estado?: string; profesionalId?: string | null } | null | undefined,
  profesionalId: string | null | undefined,
): boolean {
  if (!trabajo?.profesionalId || trabajo.profesionalId !== profesionalId) return false;
  return ['EN_EJECUCION', 'EN_CURSO', 'PENDIENTE_MATERIAL', 'PENDIENTE_PROPIETARIO']
    .includes(String(trabajo.estado || ''));
}

// ---------------------------------------------------------------------------
// 2. Aceptación y rechazo
// ---------------------------------------------------------------------------

export type AccionEncargo = 'ACEPTAR' | 'RECHAZAR';

export interface ResultadoEncargo {
  ok: boolean;
  estado?: EstadoTrabajoProfesional;
  error?: string;
}

/**
 * Aceptar → `ACEPTADO`. Rechazar → `CANCELADO` **con motivo obligatorio**.
 *
 * El motivo se exige siempre al rechazar: un rechazo sin motivo obliga al
 * propietario a adivinar, y el circuito se rompe en el primer paso.
 */
export function resolverEncargo(
  trabajo: { estado?: string; profesionalId?: string | null } | null | undefined,
  profesionalId: string | null | undefined,
  accion: AccionEncargo,
  motivo?: string,
): ResultadoEncargo {
  if (!puedeAceptarORechazar(trabajo, profesionalId)) {
    return { ok: false, error: 'Este encargo no se puede aceptar ni rechazar en su estado actual.' };
  }
  if (accion === 'ACEPTAR') {
    return { ok: true, estado: 'ACEPTADO' };
  }
  const limpio = String(motivo ?? '').trim();
  if (limpio.length < 5) {
    return { ok: false, error: 'Indica el motivo del rechazo (al menos 5 caracteres).' };
  }
  if (limpio.length > 500) {
    return { ok: false, error: 'El motivo del rechazo no puede superar 500 caracteres.' };
  }
  return { ok: true, estado: 'CANCELADO' };
}

// ---------------------------------------------------------------------------
// 3. Presupuestos
// ---------------------------------------------------------------------------

/** Tipos de IVA vigentes en España (2026). */
export const TIPOS_IVA_VALIDOS: readonly number[] = Object.freeze([0, 4, 10, 21]);

export interface LineaPresupuestoEntrada {
  concepto?: string;
  cantidad?: number | string;
  precioUnitario?: number | string;
  /** % de IVA de la línea. Si falta, se usa el del presupuesto. */
  ivaPorcentaje?: number | string;
}

export interface PresupuestoCalculado {
  ok: boolean;
  errores: string[];
  importeBase: number;
  iva: number;
  importeTotal: number;
  partidas: LineaCalculada[];
}

/**
 * Línea calculada. `importe` es el subtotal sin IVA de la línea, que es el
 * campo que ya usa `PartidaPresupuesto` en el modelo existente (no se añade
 * un campo nuevo ni se duplica la estructura).
 */
export interface LineaCalculada extends PartidaPresupuesto {
  ivaPorcentaje: number;
  cuotaIva: number;
}

const redondear2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const aNumero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Calcula un presupuesto a partir de sus líneas.
 *
 * Reglas de negocio (las mismas que debe mostrar la UI):
 *  · concepto obligatorio, no vacío;
 *  · cantidad > 0;
 *  · precio unitario >= 0 (un concepto puede ser cortesía, pero no negativo);
 *  · IVA de línea ∈ {0, 4, 10, 21} si se indica;
 *  · los importes se redondean a 2 decimales, línea a línea, y el total se
 *    calcula sobre las líneas YA redondeadas (para que sume exactamente lo que
 *    se ve en pantalla; sin esto, el total y la suma de líneas difieren en un
 *    céntimo y genera discusiones con el propietario).
 */
export function calcularPresupuesto(
  lineas: LineaPresupuestoEntrada[] | null | undefined,
  ivaPorDefecto = 21,
): PresupuestoCalculado {
  const errores: string[] = [];
  const lista = Array.isArray(lineas) ? lineas : [];

  if (!lista.length) {
    return { ok: false, errores: ['El presupuesto necesita al menos un concepto.'], importeBase: 0, iva: 0, importeTotal: 0, partidas: [] };
  }
  if (!TIPOS_IVA_VALIDOS.includes(Number(ivaPorDefecto))) {
    errores.push(`IVA no válido: ${ivaPorDefecto}. Admitidos: ${TIPOS_IVA_VALIDOS.join(', ')} %.`);
  }

  let base = 0;
  let cuota = 0;
  const partidas: LineaCalculada[] = [];

  lista.forEach((l, i) => {
    const n = i + 1;
    const concepto = String(l?.concepto ?? '').trim();
    const cantidad = aNumero(l?.cantidad);
    const precio = aNumero(l?.precioUnitario);
    const iva = l?.ivaPorcentaje === undefined || l?.ivaPorcentaje === null || l?.ivaPorcentaje === ''
      ? Number(ivaPorDefecto)
      : aNumero(l.ivaPorcentaje);

    if (!concepto) errores.push(`Línea ${n}: el concepto es obligatorio.`);
    if (!Number.isFinite(cantidad) || cantidad <= 0) errores.push(`Línea ${n}: la cantidad debe ser mayor que 0.`);
    if (!Number.isFinite(precio) || precio < 0) errores.push(`Línea ${n}: el precio no puede ser negativo.`);
    if (!TIPOS_IVA_VALIDOS.includes(iva)) errores.push(`Línea ${n}: IVA no válido (${l?.ivaPorcentaje}).`);

    const subtotal = redondear2((Number.isFinite(cantidad) ? cantidad : 0) * (Number.isFinite(precio) ? precio : 0));
    const cuotaLinea = redondear2(subtotal * (Number.isFinite(iva) ? iva : 0) / 100);
    base += subtotal;
    cuota += cuotaLinea;

    partidas.push({
      id: `linea-${n}`,
      concepto,
      cantidad: Number.isFinite(cantidad) ? cantidad : 0,
      precioUnitario: Number.isFinite(precio) ? precio : 0,
      importe: subtotal,
      ivaPorcentaje: Number.isFinite(iva) ? iva : 0,
      cuotaIva: cuotaLinea,
    });
  });

  return {
    ok: errores.length === 0,
    errores,
    importeBase: redondear2(base),
    iva: redondear2(cuota),
    importeTotal: redondear2(base + cuota),
    partidas,
  };
}

/**
 * Estados en los que el profesional NO puede modificar el presupuesto.
 *
 * Un presupuesto ACEPTADO es un compromiso: cambiarlo después dejaría al
 * propietario con un documento firmado que ya no dice lo mismo. La única vía
 * legítima es crear una VERSIÓN NUEVA, que el propietario deberá aceptar.
 */
export const ESTADOS_PRESUPUESTO_BLOQUEADO: readonly EstadoPresupuestoProfesional[] = Object.freeze([
  'ACEPTADO', 'RECHAZADO', 'CADUCADO',
]);

export interface ResultadoEdicionPresupuesto {
  ok: boolean;
  error?: string;
  requiereNuevaVersion?: boolean;
}

/**
 * ¿Puede el profesional editar (o reenviar) este presupuesto?
 * Si está bloqueado, la vía correcta es una versión nueva — no un `update`.
 */
export function validarEdicionPresupuesto(
  estadoActual: EstadoPresupuestoProfesional | undefined,
  profesionalIdDelPresupuesto: string | undefined,
  profesionalId: string | null | undefined,
): ResultadoEdicionPresupuesto {
  if (!profesionalIdDelPresupuesto || profesionalIdDelPresupuesto !== profesionalId) {
    return { ok: false, error: 'Este presupuesto no es tuyo.' };
  }
  if (estadoActual && ESTADOS_PRESUPUESTO_BLOQUEADO.includes(estadoActual)) {
    return {
      ok: false,
      requiereNuevaVersion: true,
      error: `El presupuesto está ${estadoActual}: no se puede modificar. Crea una versión nueva.`,
    };
  }
  return { ok: true };
}

/**
 * Siguiente número de versión de un presupuesto para el mismo trabajo.
 * Si no hay anteriores → 1. Nunca reutiliza ni salta números.
 */
export function siguienteVersion(versionesExistentes: (number | undefined)[] | null | undefined): number {
  const validas = (Array.isArray(versionesExistentes) ? versionesExistentes : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  return validas.length ? Math.max(...validas) + 1 : 1;
}

/** Estados que puede fijar el profesional a un presupuesto. */
export const ESTADOS_PRESUPUESTO_DEL_PROFESIONAL: readonly EstadoPresupuestoProfesional[] = Object.freeze([
  'BORRADOR',  // guardado, aún no enviado
  'RECIBIDO',  // enviado al propietario
]);

/**
 * ¿El propietario puede aceptar o rechazar? Solo si está recibido o en revisión.
 * Se expone aquí para que el portal del propietario y el del profesional usen
 * el mismo criterio y no se contradigan.
 */
export function propietarioPuedeDecidir(estado: EstadoPresupuestoProfesional | undefined): boolean {
  return ['RECIBIDO', 'EN_REVISION', 'EN_NEGOCIACION'].includes(String(estado || ''));
}

// ---------------------------------------------------------------------------
// 4. Evidencias fotográficas
// ---------------------------------------------------------------------------

export type MomentoEvidencia = 'ANTES' | 'DURANTE' | 'DESPUES';

export const MOMENTOS_EVIDENCIA: readonly MomentoEvidencia[] = Object.freeze(['ANTES', 'DURANTE', 'DESPUES']);

export interface EntradaEvidencia {
  nombre?: string;
  tipo?: string;
  tamanoBytes?: number;
  momento?: MomentoEvidencia;
}

export interface ResultadoEvidencia {
  ok: boolean;
  error?: string;
  momento: MomentoEvidencia;
}

/** 10 MB, el mismo límite que `INCIDENCIA_EVIDENCIA` en el servidor documental. */
export const MAX_BYTES_EVIDENCIA = 10 * 1024 * 1024;

const MIME_EVIDENCIA = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf|video\/(mp4|quicktime))$/i;

/**
 * Valida una evidencia antes de subirla.
 *
 * Se valida en cliente para dar un error útil ANTES de gastar datos del móvil,
 * pero la autoridad es el servidor: `INCIDENCIA_EVIDENCIA` ya acota tipo y
 * tamaño. Esta función no sustituye a la regla, la anticipa.
 */
export function validarEvidencia(entrada: EntradaEvidencia | null | undefined): ResultadoEvidencia {
  const momento = (entrada?.momento || 'DURANTE') as MomentoEvidencia;
  if (!MOMENTOS_EVIDENCIA.includes(momento)) {
    return { ok: false, error: 'Momento no válido: usa ANTES, DURANTE o DESPUES.', momento: 'DURANTE' };
  }
  if (!entrada?.nombre || !String(entrada.nombre).trim()) {
    return { ok: false, error: 'El archivo no tiene nombre.', momento };
  }
  const tipo = String(entrada.tipo || '').trim();
  if (!tipo) {
    return { ok: false, error: 'No se ha podido determinar el tipo del archivo.', momento };
  }
  if (!MIME_EVIDENCIA.test(tipo)) {
    return { ok: false, error: `Tipo de archivo no admitido: ${tipo}.`, momento };
  }
  const tamano = Number(entrada.tamanoBytes);
  if (!Number.isFinite(tamano) || tamano <= 0) {
    return { ok: false, error: 'El archivo está vacío.', momento };
  }
  if (tamano > MAX_BYTES_EVIDENCIA) {
    return { ok: false, error: `El archivo supera 10 MB (${Math.round(tamano / 1024 / 1024)} MB).`, momento };
  }
  return { ok: true, momento };
}

/**
 * Ruta de almacenamiento de una evidencia.
 *
 * SIEMPRE bajo `incidencias/{incidenciaId}/`, que es el único prefijo que el
 * servidor documental autoriza para `INCIDENCIA_EVIDENCIA` y que el
 * profesional asignado puede escribir. Nunca se construye una URL pública.
 */
export function rutaEvidencia(incidenciaId: string, momento: MomentoEvidencia, nombreArchivo: string): string | null {
  const id = String(incidenciaId || '').trim();
  if (!id || id.includes('/') || id.includes('..')) return null;
  const limpio = String(nombreArchivo || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!limpio) return null;
  return `incidencias/${id}/${momento.toLowerCase()}_${Date.now()}_${limpio}`;
}

// ---------------------------------------------------------------------------
// 5. Finalización y confirmación
// ---------------------------------------------------------------------------

/**
 * El profesional informa de finalización → `FINALIZADO`.
 * El propietario confirma → estado final (lo fija él, no el profesional).
 *
 * Se separa en dos funciones a propósito: son dos actores distintos y el
 * circuito P1 exige que el propietario revise. Si el profesional pudiera
 * cerrar el trabajo por su cuenta, la revisión del propietario no existiría.
 */
export function validarInformeFinalizacion(
  trabajo: { estado?: string; profesionalId?: string | null } | null | undefined,
  profesionalId: string | null | undefined,
  observaciones?: string,
): { ok: boolean; error?: string; exigeEvidencias: boolean } {
  if (!puedeFinalizar(trabajo, profesionalId)) {
    return { ok: false, error: 'Solo puedes informar de la finalización de un trabajo en curso.', exigeEvidencias: false };
  }
  if (String(observaciones ?? '').length > 2000) {
    return { ok: false, error: 'Las observaciones no pueden superar 2000 caracteres.', exigeEvidencias: false };
  }
  // El circuito exige documentar: sin evidencia, el propietario no puede
  // revisar nada. No se bloquea la operación (hay trabajos sin foto posible),
  // pero se marca para que la UI lo pida de forma explícita.
  return { ok: true, exigeEvidencias: true };
}

/** Estados en los que el propietario puede confirmar la finalización. */
export const ESTADOS_PARA_CONFIRMAR = Object.freeze(['FINALIZADO', 'FINALIZADA']);

export function propietarioPuedeConfirmar(trabajo: { estado?: string } | null | undefined): boolean {
  return ESTADOS_PARA_CONFIRMAR.includes(String(trabajo?.estado || ''));
}

// ---------------------------------------------------------------------------
// 6. Panel del profesional: los seis bloques de P1 §3
// ---------------------------------------------------------------------------

export type BloquePanel =
  | 'PENDIENTES_ACEPTAR'
  | 'ACEPTADOS'
  | 'PRESUPUESTOS_PENDIENTES'
  | 'EN_CURSO'
  | 'PENDIENTES_DOCUMENTAR'
  | 'FINALIZADOS';

export const BLOQUES_PANEL: readonly { id: BloquePanel; titulo: string; descripcion: string }[] = Object.freeze([
  { id: 'PENDIENTES_ACEPTAR', titulo: 'Pendientes de aceptar', descripcion: 'Encargos que esperan tu respuesta.' },
  { id: 'ACEPTADOS', titulo: 'Aceptados', descripcion: 'Aceptados, aún sin empezar.' },
  { id: 'PRESUPUESTOS_PENDIENTES', titulo: 'Presupuestos pendientes', descripcion: 'Borradores o enviados sin decisión del propietario.' },
  { id: 'EN_CURSO', titulo: 'Intervenciones en curso', descripcion: 'Trabajos empezados y no terminados.' },
  { id: 'PENDIENTES_DOCUMENTAR', titulo: 'Pendientes de documentación', descripcion: 'Terminados sin evidencias suficientes.' },
  { id: 'FINALIZADOS', titulo: 'Finalizados', descripcion: 'Informados o confirmados por el propietario.' },
]);

export interface EntradaClasificacion {
  estado?: string;
  profesionalId?: string | null;
  presupuestos?: { estado?: EstadoPresupuestoProfesional | string }[];
  evidencias?: number;
}

/**
 * Clasifica los trabajos de un profesional en los seis bloques.
 *
 * Un trabajo puede aparecer en más de un bloque cuando es cierto a la vez
 * (p. ej. en curso Y con presupuesto pendiente): eso es información útil para
 * el profesional, no un duplicado. Lo que NO ocurre es que aparezca en bloques
 * mutuamente excluyentes (pendiente de aceptar vs. en curso).
 */
export function clasificarEnBloques(
  trabajos: EntradaClasificacion[] | null | undefined,
  profesionalId: string | null | undefined,
): Record<BloquePanel, EntradaClasificacion[]> {
  const salida: Record<BloquePanel, EntradaClasificacion[]> = {
    PENDIENTES_ACEPTAR: [], ACEPTADOS: [], PRESUPUESTOS_PENDIENTES: [],
    EN_CURSO: [], PENDIENTES_DOCUMENTAR: [], FINALIZADOS: [],
  };
  for (const t of Array.isArray(trabajos) ? trabajos : []) {
    // Aislamiento: solo mis trabajos, aunque la lista venga contaminada.
    if (!t.profesionalId || t.profesionalId !== profesionalId) continue;
    const estado = String(t.estado || '');

    if (ESTADOS_ENCARGABLES.includes(estado as EstadoTrabajoProfesional)) {
      salida.PENDIENTES_ACEPTAR.push(t);
      continue; // aún no ha aceptado: no puede estar "aceptado"
    }
    if (estado === 'ACEPTADO') salida.ACEPTADOS.push(t);
    if (['EN_EJECUCION', 'EN_CURSO', 'PENDIENTE_MATERIAL', 'PENDIENTE_PROPIETARIO'].includes(estado)) {
      salida.EN_CURSO.push(t);
    }
    if (ESTADOS_PARA_CONFIRMAR.includes(estado)) {
      salida.FINALIZADOS.push(t);
      // "Pendiente de documentar" = terminado sin evidencias adjuntas.
      if (!(Number(t.evidencias) > 0)) salida.PENDIENTES_DOCUMENTAR.push(t);
    }
    const pendiente = (t.presupuestos || []).some((p) => ['BORRADOR', 'RECIBIDO', 'EN_REVISION', 'EN_NEGOCIACION'].includes(String(p.estado)));
    if (pendiente) salida.PRESUPUESTOS_PENDIENTES.push(t);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// 7. Historial
// ---------------------------------------------------------------------------

/**
 * Añade una entrada al historial SIN destruir las anteriores.
 *
 * El profesional nunca puede borrar historial: esta función solo concatena.
 * Es la garantía de que el propietario conserva la traza completa de lo que
 * hizo el profesional (P1 §E: «Mantener el historial completo de estados»).
 */
export function anadirAlHistorial<T extends { id: string }>(
  historial: T[] | null | undefined,
  entrada: T,
): T[] {
  const previo = Array.isArray(historial) ? historial : [];
  if (previo.some((h) => h.id === entrada.id)) return previo; // idempotente
  return [...previo, entrada];
}
