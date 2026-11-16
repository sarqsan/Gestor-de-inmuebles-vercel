/**
 * P0-B · NÚCLEO DE BACKUP, INTEGRIDAD Y COHERENCIA (puro, sin red)
 * ================================================================
 * Este módulo NO habla con Google Cloud. Define y verifica las invariantes del
 * sistema de copia para que puedan probarse sin credenciales, sin red y sin
 * tocar producción:
 *
 *   1. Identidad del destino: proyecto + base de datos CON NOMBRE + bucket.
 *      Es el punto donde un error de configuración produciría un "verde falso"
 *      (respaldar `(default)` en vez de la base real, que estaría vacía).
 *   2. Identificador de snapshot: un único `snapshotId` para Firestore y
 *      Storage, de modo que no puedan restaurarse desacoplados.
 *   3. Manifiesto de integridad: recuento por colección y hash por objeto.
 *   4. Coherencia documento ↔ archivo: referencias rotas, archivos huérfanos,
 *      duplicados y metadatos inconsistentes.
 *   5. Política de retención: generacional (diaria/semanal/mensual/anual).
 *   6. Guardia anti-producción para restauración.
 *
 * Lo que queda FUERA de este módulo (y requiere credenciales, por tanto se
 * entrega como script operativo, no como prueba unitaria): ejecutar
 * `gcloud firestore export`, `gcloud storage rsync` y la restauración real.
 */

// ---------------------------------------------------------------------------
// 1. Identidad del destino
// ---------------------------------------------------------------------------

/**
 * La base por defecto del proyecto (el identificador literal entre paréntesis)
 * NUNCA es válida aquí: este proyecto opera sobre una base CON NOMBRE. No se
 * exporta el literal como constante ejecutable a propósito — el repositorio
 * tiene un guardia (`tests/custodia-topologia-firestore-storage.test.ts`) que
 * prohíbe ese literal fuera de comentarios, para que ninguna rama pueda
 * seleccionarlo por accidente. La prohibición se aplica por FORMATO: el nombre
 * por defecto lleva paréntesis y no satisface `^[a-z0-9][a-z0-9-]+$`.
 */

/** ¿El identificador tiene forma de base con nombre (y por tanto es utilizable)? */
export function esBaseConNombre(baseDatos: unknown): boolean {
  return typeof baseDatos === 'string' && /^[a-z0-9][a-z0-9-]{1,220}$/i.test(baseDatos);
}

export interface CodigoError {
  codigo: string;
  message: string;
}

export class ErrorDestino extends Error {
  codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDestino';
    this.codigo = codigo;
  }
}

/**
 * Valida y normaliza el destino de una copia.
 * Falla cerrado: sin proyecto, sin base con nombre o apuntando a `(default)`,
 * lanza. Nunca "asume" valores por defecto.
 *
 * @param {{proyecto:string, baseDatos:string, bucket:string}} destino
 * @returns {{proyecto:string, baseDatos:string, bucket:string, huella:string}}
 */
export function validarDestinoBackup(destino) {
  const proyecto = String(destino?.proyecto ?? '').trim();
  const baseDatos = String(destino?.baseDatos ?? '').trim();
  const bucket = String(destino?.bucket ?? '').trim();

  if (!proyecto) {
    throw new ErrorDestino('PROYECTO_AUSENTE', 'El proyecto de origen es obligatorio: sin él no se sabe qué se está copiando.');
  }
  if (!baseDatos) {
    throw new ErrorDestino('BASE_AUSENTE',
      'La base de datos es obligatoria. Este proyecto usa una base CON NOMBRE: omitirla haría que la exportación apunte a la base por defecto, que está vacía, y produciría un falso verde.');
  }
  if (!esBaseConNombre(baseDatos)) {
    throw new ErrorDestino('BASE_POR_DEFECTO',
      'Base de datos no válida: la base por defecto (identificador entre paréntesis) está prohibida. Se exige el identificador real de la base con nombre.');
  }
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/i.test(proyecto)) {
    throw new ErrorDestino('PROYECTO_INVALIDO', `Identificador de proyecto no válido: ${proyecto}`);
  }
  // Los id de base con nombre generados por la plataforma superan los 60
  // caracteres (la base real de este proyecto tiene 63), de ahí el límite amplio.
  if (!bucket) {
    throw new ErrorDestino('BUCKET_AUSENTE', 'El bucket de respaldo es obligatorio.');
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,220}$/i.test(bucket)) {
    throw new ErrorDestino('BUCKET_INVALIDO', `Nombre de bucket no válido: ${bucket}`);
  }

  return { proyecto, baseDatos, bucket, huella: `${proyecto}::${baseDatos}::${bucket}` };
}

/**
 * Comprueba que el destino del que se copia NO es el de una restauración
 * destructiva. Se usa antes de restaurar.
 *
 * @param {{proyecto:string, baseDatos:string}} destino
 * @param {{produccion:string[], permitidos:string[]}} politica
 */
export function validarRestauracionSegura(destino, politica) {
  const proyecto = String(destino?.proyecto ?? '').trim();
  const baseDatos = String(destino?.baseDatos ?? '').trim();
  // Producción se evalúa ANTES que la lista blanca: si el destino es producción,
  // el motivo del rechazo debe decir eso y no "no está en la lista".
  if (politica?.produccion?.includes(proyecto)) {
    throw new ErrorDestino('DESTINO_PRODUCCION',
      `Restauración bloqueada: «${proyecto}» es producción. Las restauraciones se prueban en un proyecto aislado.`);
  }
  if (politica?.permitidos?.length && !politica.permitidos.includes(proyecto)) {
    throw new ErrorDestino('DESTINO_NO_PERMITIDO',
      `El proyecto destino «${proyecto}» no está en la lista blanca de restauración (${politica.permitidos.join(', ')}).`);
  }
  if (!esBaseConNombre(baseDatos)) {
    throw new ErrorDestino('BASE_POR_DEFECTO', 'No se restaura sobre la base por defecto: se exige el identificador real.');
  }
  return { proyecto, baseDatos, ok: true };
}

// ---------------------------------------------------------------------------
// 2. Identificador de snapshot
// ---------------------------------------------------------------------------

/**
 * Construye el `snapshotId` que comparten Firestore y Storage.
 * Formato: `<YYYYMMDDTHHMMSSZ>-<esquema>`; ordenable lexicográficamente.
 */
export function crearSnapshotId(fecha, esquema = 1) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) {
    throw new Error('crearSnapshotId requiere una fecha válida');
  }
  if (!Number.isInteger(esquema) || esquema < 1) {
    throw new Error('El esquema debe ser un entero positivo');
  }
  const iso = fecha.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${iso}-s${esquema}`;
}

/** La restauración exige el par completo: Firestore y Storage del mismo id. */
export function exigirParCompleto(snapshotId, partes) {
  const requeridas = ['firestore', 'storage'];
  const faltan = requeridas.filter((p) => !partes?.[p]);
  if (faltan.length) {
    throw new ErrorDestino('SNAPSHOT_INCOMPLETO',
      `El snapshot ${snapshotId} no puede restaurarse: falta ${faltan.join(' y ')}. Restaurar solo una parte deja registros sin archivo (o archivos sin registro).`);
  }
  const ids = new Set(requeridas.map((p) => partes[p].snapshotId));
  if (ids.size !== 1) {
    throw new ErrorDestino('SNAPSHOT_DESACOPLADO',
      `Las partes no comparten snapshotId (${[...ids].join(' ≠ ')}): Firestore y Storage están desfasados y la relación documento↔archivo no puede garantizarse.`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// 3. Manifiesto de integridad
// ---------------------------------------------------------------------------

/**
 * Construye el manifiesto esperado de un snapshot.
 *
 * @param {object} entrada
 * @param {string} entrada.snapshotId
 * @param {{proyecto:string, baseDatos:string, bucket:string}} entrada.destino
 * @param {Record<string, number>} entrada.recuentoColecciones
 * @param {{ruta:string, bytes:number, sha256:string, contentType?:string, metadata?:object}[]} entrada.objetos
 */
export function construirManifiesto({ snapshotId, destino, recuentoColecciones, objetos }) {
  const validado = validarDestinoBackup(destino);
  const lista = Array.isArray(objetos) ? objetos : [];
  /** @type {Map<string, {ruta:string, bytes:number, sha256:string, contentType?:string, metadata?:object}>} */
  const porRuta = new Map();
  for (const o of lista) {
    if (!o || typeof o.ruta !== 'string' || !o.ruta) {
      throw new Error('Objeto sin ruta en el manifiesto');
    }
    if (!/^[a-f0-9]{64}$/i.test(String(o.sha256 || ''))) {
      throw new Error(`Hash SHA-256 ausente o inválido para ${o.ruta}`);
    }
    if (porRuta.has(o.ruta)) {
      throw new Error(`Ruta duplicada en el manifiesto: ${o.ruta}`);
    }
    porRuta.set(o.ruta, { ...o, sha256: o.sha256.toLowerCase() });
  }
  return {
    version: 1,
    snapshotId,
    destino: validado,
    totalDocumentos: (Object.values(recuentoColecciones || {}) as any[]).reduce((s: number, n: any) => s + (Number(n) || 0), 0),
    recuentoColecciones: { ...(recuentoColecciones || {}) },
    totalObjetos: porRuta.size,
    bytesTotales: [...porRuta.values()].reduce((s: number, o: any) => s + (Number(o.bytes) || 0), 0),
    objetos: [...porRuta.values()].sort((a, b) => a.ruta.localeCompare(b.ruta)),
  };
}

/**
 * Compara un manifiesto esperado con lo realmente verificado en el destino.
 * Devuelve las diferencias; `ok` solo si no hay ninguna.
 */
export function verificarManifiesto(manifiesto: any, observado: any) {
  /** @type {{tipo:string, ruta?:string, coleccion?:string, esperado?:any, observado?:any}[]} */
  const incidencias = [];
  const listaEsperada: any[] = Array.isArray(manifiesto?.objetos) ? manifiesto.objetos : [];
  const listaObservada: any[] = Array.isArray(observado?.objetos) ? observado.objetos : [];
  const esperadoPorRuta = new Map<string, any>(listaEsperada.map((o: any) => [String(o.ruta), o] as [string, any]));
  const observadoPorRuta = new Map<string, any>(listaObservada.map((o: any) => [String(o.ruta), o] as [string, any]));

  for (const [ruta, esp] of esperadoPorRuta) {
    const obs = observadoPorRuta.get(ruta);
    if (!obs) { incidencias.push({ tipo: 'OBJETO_AUSENTE', ruta }); continue; }
    if (String(obs.sha256 || '').toLowerCase() !== esp.sha256) {
      incidencias.push({ tipo: 'HASH_DISTINTO', ruta, esperado: esp.sha256, observado: obs.sha256 });
    }
    if (Number(obs.bytes) !== Number(esp.bytes)) {
      incidencias.push({ tipo: 'TAMANO_DISTINTO', ruta, esperado: esp.bytes, observado: obs.bytes });
    }
  }
  for (const ruta of observadoPorRuta.keys()) {
    if (!esperadoPorRuta.has(ruta)) incidencias.push({ tipo: 'OBJETO_SOBRANTE', ruta });
  }
  for (const [col, n] of Object.entries(manifiesto?.recuentoColecciones || {}) as [string, any][]) {
    const obs = Number(observado?.recuentoColecciones?.[col]);
    if (!Number.isFinite(obs)) incidencias.push({ tipo: 'COLECCION_NO_VERIFICADA', coleccion: col });
    else if (obs !== Number(n)) incidencias.push({ tipo: 'RECUENTO_DISTINTO', coleccion: col, esperado: n, observado: obs });
  }
  return { ok: incidencias.length === 0, incidencias };
}

// ---------------------------------------------------------------------------
// 4. Coherencia documento ↔ archivo
// ---------------------------------------------------------------------------

/**
 * Verifica la coherencia entre las referencias documentales de Firestore y los
 * objetos realmente presentes en Storage.
 *
 * @param {{referencias: {ruta:string, origen:string}[], objetosPresentes: string[]}} entrada
 * @returns {{ok:boolean, referenciasRotas:object[], objetosHuerfanos:string[], duplicados:object[]}}
 */
export function verificarCoherencia({ referencias, objetosPresentes }) {
  const refs = Array.isArray(referencias) ? referencias : [];
  const presentes = new Set(Array.isArray(objetosPresentes) ? objetosPresentes : []);

  const referenciasRotas = [];
  const contaRuta = new Map();
  for (const r of refs) {
    const ruta = String(r?.ruta ?? '');
    if (!ruta) continue;
    contaRuta.set(ruta, (contaRuta.get(ruta) || 0) + 1);
    if (!presentes.has(ruta)) referenciasRotas.push({ ruta, origen: r?.origen ?? 'desconocido' });
  }

  // Duplicados: el mismo objeto referenciado por más de un registro.
  const duplicados = [...contaRuta.entries()]
    .filter(([, n]) => n > 1)
    .map(([ruta, n]) => ({ ruta, referencias: n }));

  // Huérfanos: objetos en Storage sin ninguna referencia documental.
  const objetosHuerfanos = [...presentes].filter((p) => !contaRuta.has(p)).sort();

  return {
    ok: referenciasRotas.length === 0 && objetosHuerfanos.length === 0 && duplicados.length === 0,
    referenciasRotas,
    objetosHuerfanos,
    duplicados,
  };
}

/**
 * Comprueba que una ruta de Storage respeta el patrón canónico del proyecto
 * (paridad con `server/documentos/autorizacionDocumental.ts`): segmentos no
 * vacíos, sin `..`, sin barra inicial, longitud acotada.
 */
export function esRutaAlmacenValida(ruta) {
  if (typeof ruta !== 'string' || !ruta || ruta.length > 1024) return false;
  if (ruta.startsWith('/') || ruta.includes('//') || ruta.includes('\\')) return false;
  return ruta.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

// ---------------------------------------------------------------------------
// 5. Política de retención
// ---------------------------------------------------------------------------

export const POLITICA_RETENCION_POR_DEFECTO = Object.freeze({
  diarios: 7,
  semanales: 4,
  mensuales: 12,
  anuales: 5,
});

/**
 * Decide qué snapshots conservar según la política generacional.
 * Entrada: snapshots con fecha ISO. Salida: ids a conservar y a purgar.
 * Determinista y sin efectos: no borra nada, solo decide.
 */
export function calcularRetencion(snapshots, politica = POLITICA_RETENCION_POR_DEFECTO) {
  const validos = (snapshots || [])
    .map((s) => ({ ...s, fecha: new Date(s.fecha) }))
    .filter((s) => !Number.isNaN(s.fecha.getTime()))
    .sort((a, b) => b.fecha - a.fecha); // más reciente primero

  const conservar = new Set();
  const tomar = (grupo, limite) => {
    const vistos = new Set();
    for (const s of grupo) {
      if (vistos.size >= limite) break;
      if (conservar.has(s.id)) continue;
      conservar.add(s.id);
      vistos.add(s.id);
    }
  };

  // Diarios: los N más recientes por día natural (UTC)
  const porDia = new Map();
  const porSemana = new Map();
  const porMes = new Map();
  const porAnio = new Map();
  for (const s of validos) {
    const y = s.fecha.getUTCFullYear();
    const m = s.fecha.getUTCMonth() + 1;
    const d = s.fecha.getUTCDate();
    const dia = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const semana = `${y}-S${Math.ceil(d / 7)}`;
    const mes = `${y}-${String(m).padStart(2, '0')}`;
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(s);
    if (!porSemana.has(semana)) porSemana.set(semana, []);
    porSemana.get(semana).push(s);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes).push(s);
    if (!porAnio.has(y)) porAnio.set(y, []);
    porAnio.get(y).push(s);
  }

  tomar([...porDia.values()].slice(0, politica.diarios).flat(), politica.diarios);
  // Semanales/mensuales/anuales: el más reciente de cada periodo
  tomar([...porSemana.values()].slice(0, politica.semanales * 2).map((g) => g[0]), politica.semanales);
  tomar([...porMes.values()].slice(0, politica.mensuales).map((g) => g[0]), politica.mensuales);
  tomar([...porAnio.values()].slice(0, politica.anuales).map((g) => g[0]), politica.anuales);

  const conservarArr = validos.filter((s) => conservar.has(s.id)).map((s) => s.id);
  const purgar = validos.filter((s) => !conservar.has(s.id)).map((s) => s.id);
  return { conservar: conservarArr, purgar };
}

// ---------------------------------------------------------------------------
// 6. Registro de operaciones (auditoría del backup)
// ---------------------------------------------------------------------------

/**
 * Estructura mínima de un evento de backup. Append-only por convención: el
 * script operativo no reescribe entradas, añade.
 */
export interface EventoBackup {
  tipo: string;
  snapshotId: string;
  proyecto: string;
  baseDatos: string;
  bucket: string;
  resultado: string;
  detalle: any;
  registradoEn: string;
}

export function crearEventoBackup({ tipo, snapshotId, destino, resultado, detalle }: {
  tipo: string;
  snapshotId: string;
  destino: { proyecto: string; baseDatos: string; bucket: string };
  resultado: string;
  detalle?: any;
}): EventoBackup {
  const TIPOS = ['BACKUP_INICIADO', 'BACKUP_COMPLETADO', 'BACKUP_FALLIDO',
    'VERIFICACION_OK', 'VERIFICACION_FALLIDA',
    'RESTAURACION_INICIADA', 'RESTAURACION_COMPLETADA', 'RESTAURACION_FALLIDA', 'PURGA'];
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de evento no permitido: ${tipo}`);
  if (!snapshotId) throw new Error('El evento exige snapshotId');
  const d = validarDestinoBackup(destino);
  return {
    tipo,
    snapshotId,
    proyecto: d.proyecto,
    baseDatos: d.baseDatos,
    bucket: d.bucket,
    resultado,
    detalle: detalle ?? null,
    registradoEn: new Date().toISOString(),
  };
}
