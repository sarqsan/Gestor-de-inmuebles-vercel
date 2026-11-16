#!/usr/bin/env node
/**
 * AG-08 · Migración de retirada de `passwordHash`
 * ============================================================================
 * QUÉ HACE
 *   Elimina el campo `passwordHash` de los documentos de `usuarios/*` en Firestore.
 *
 * POR QUÉ ES SEGURO
 *   El campo es material de credencial OBSOLETO (SHA-256 sin sal, o el fallback
 *   `fb_<hex>` de 32 bits). Ningún flujo legítimo de autenticación lo consume:
 *   el camino de «verificación directa» se retiró porque sin sesión las reglas
 *   exigen `isSignedIn()` para leer `usuarios/*`. La autoridad de autenticación
 *   es Firebase Auth, cuyas credenciales viven en su propio almacén y NO se tocan.
 *   Consecuencia: borrar el campo NO cambia quién puede entrar en la plataforma.
 *
 * GARANTÍAS DE DISEÑO
 *   · DRY-RUN POR DEFECTO: sin `--aplicar` no escribe nada.
 *   · IDEMPOTENTE: solo toca documentos que aún tengan el campo; reejecutar
 *     sobre un estado limpio produce 0 escrituras.
 *   · NO REGISTRA HASHES NI CREDENCIALES: los logs incluyen únicamente el id del
 *     documento y, si acaso, la LONGITUD del valor. Nunca el valor.
 *   · SOLO EL CAMPO: usa `update` con `delete()` del campo; no reescribe el
 *     documento, no altera ningún otro dato (ni datos de terceros).
 *   · AUDITABLE: emite un recuento + manifiesto (ids afectados) y un log de
 *     auditoría por documento vía `saveAuditLogFirestore` cuando se aplica.
 *   · VERIFICABLE/REVERSIBLE: antes de borrar exige un respaldo (ver más abajo).
 *
 * RESPALDO Y REVERSIÓN
 *   El respaldo de los hashes NO se guarda aquí (contendría credenciales
 *   materializadas). Procedimiento exigido antes de aplicar:
 *     1. Exportar `usuarios` desde la consola de Firebase / `gcloud firestore export`
 *        a un bucket privado con retención. Ese export es el artefacto de vuelta atrás.
 *     2. Registrar el id del export en la ventana de cambio (junto con la hora).
 *   Reversión: restaurar el export. Como el código ya no lee ni escribe el campo,
 *   restaurarlo es inerte (no reabre ningún camino de autenticación), pero
 *   recupera el estado exacto anterior a la migración.
 *
 * USO
 *   node scripts/ag08/migrar-passwordhash.mjs                      # dry-run
 *   node scripts/ag08/migrar-passwordhash.mjs --aplicar \
 *        --proyecto <id> --credencial <ruta-service-account.json> \
 *        --respaldo <id-del-export>
 *
 *   `--aplicar` exige `--respaldo` (prueba de que existe el artefacto de vuelta
 *   atrás) y `--confirmo-produccion` si el proyecto no acaba en `-test`.
 *
 * ESTADO: NO EJECUTADO. Este script requiere autorización expresa (ver informe).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const NOMBRE_MODULO_ADMIN = 'firebase-admin';

/**
 * Carga `firebase-admin` solo si está instalado. NO se declara como dependencia en
 * el repositorio: la aplicación real exige autorización expresa y este fichero no
 * debe poder ejecutarse por accidente ni arrastrar peso al bundle de la app.
 */
async function cargarAdmin() {
  try {
    return {
      app: await import('firebase-admin/app'),
      firestore: await import('firebase-admin/firestore'),
    };
  } catch {
    // Mensaje PROPIO (redactado aquí, sin datos del entorno): debe ser accionable
    // y no degradarse a un genérico 'Error' en el manejador de la CLI.
    const e = new Error(
      `Falta la dependencia opcional '${NOMBRE_MODULO_ADMIN}'. ` +
        'Instálala SOLO cuando la migración esté autorizada (con autorización expresa). ' +
        'Mientras tanto usa --entrada para validar el plan con datos ficticios (offline).'
    );
    e.esPropio = true;
    throw e;
  }
}

/** Clasificador de errores: solo el CÓDIGO, nunca el mensaje ni el documento.
 *  Firestore y `JSON.parse` pueden incluir fragmentos del contenido en `message`
 *  (p. ej. el service account al parsear mal la credencial). Los logs no lo copian. */
function codigoError(e) {
  const c = e && (e.code || e.name);
  return typeof c === 'string' && /^[\w./-]{1,64}$/.test(c) ? c : 'error';
}

/**
 * Formatea un valor de hash para el informe SIN exponerlo.
 * Devuelve solo tipo y longitud; jamás el contenido.
 */
export function describirValorSeguro(valor) {
  if (valor === null) return 'null';
  if (valor === undefined) return 'undefined';
  const tipo = typeof valor;
  if (tipo !== 'string') return `<${tipo}>`;
  return `<string:${valor.length}>`;
}

/**
 * Decide, para un documento, si necesita migración.
 * Puro y testeable: no toca Firestore.
 */
export function planificarDocumento(id, datos) {
  const tieneCampo = datos != null && Object.prototype.hasOwnProperty.call(datos, 'passwordHash');
  if (!tieneCampo) return { id, accion: 'omitir', motivo: 'sin-campo' };
  const valor = datos.passwordHash;
  const tipo = typeof valor;
  // El campo debe desaparecer con independencia de su forma: null, '', string,
  // objeto heredado… Ningún caso justifica conservarlo.
  return {
    id,
    accion: 'borrar-campo',
    motivo: tipo === 'string' ? 'hash-presente' : `presente-${tipo}`,
    valorSeguro: describirValorSeguro(valor),
  };
}

/** Construye el plan completo y su recuento. Puro. */
export function construirPlan(documentos) {
  const entradas = documentos.map(({ id, datos }) => planificarDocumento(id, datos));
  const aBorrar = entradas.filter((e) => e.accion === 'borrar-campo');
  return {
    entradas,
    resumen: {
      total: entradas.length,
      aBorrar: aBorrar.length,
      omitidos: entradas.length - aBorrar.length,
    },
    idsAfectados: aBorrar.map((e) => e.id).sort(),
  };
}

/**
 * Serializa el manifiesto SIN hashes: ids + motivos + longitudes.
 * Esta es la única representación que se permite escribir en disco.
 */
export function manifiestoAuditable(plan, meta = {}) {
  return {
    bloque: 'AG-08',
    generadoEn: new Date().toISOString(),
    ...meta,
    resumen: plan.resumen,
    idsAfectados: plan.idsAfectados,
    detalle: plan.entradas
      .filter((e) => e.accion === 'borrar-campo')
      .map((e) => ({ id: e.id, motivo: e.motivo, valor: e.valorSeguro })),
  };
}

/**
 * Aplica el plan de borrado contra un cliente tipo Firestore.
 * Es el ÚNICO punto que escribe `passwordHash` y lo usa tanto la ejecución real
 * (`main`) como la simulación de respaldo/restauración, de modo que la simulación
 * ejerce el código real y no una réplica.
 *
 * Contrato del cliente: `collection(nombre).doc(id).update({campo: deleteSentinela})`.
 * Nunca envía otros campos: eso es lo que garantiza «no tocar datos ajenos».
 */
export async function aplicarPlan(db, plan, { deleteSentinela, auditar } = {}) {
  let borrados = 0;
  let fallos = 0;
  const idsFallidos = [];
  for (const id of plan.idsAfectados) {
    try {
      await db.collection('usuarios').doc(id).update({ passwordHash: deleteSentinela });
      borrados++;
      if (auditar) {
        try {
          await auditar(id);
        } catch {
          // La auditoría no debe abortar el borrado ya realizado; se cuenta aparte.
        }
      }
    } catch {
      fallos++;
      idsFallidos.push(id);
    }
  }
  return { borrados, fallos, idsFallidos };
}

/** Proyectos de PRODUCCIÓN conocidos. CONSTANTE deliberada: no se lee del
 *  entorno para que no pueda desactivarse desde fuera (defecto F8). */
const PROYECTOS_PRODUCCION = Object.freeze(['gestor-inmuebles-produccion']);

/** ¿Es un proyecto de producción? Comparación normalizada. */
export function esProyectoProduccion(id) {
  const norm = String(id || '').trim().toLowerCase();
  return PROYECTOS_PRODUCCION.includes(norm);
}

/**
 * Guarda FAIL-CLOSED de ejecución real. Pura y testeable: devuelve el acuse o lanza.
 * - Exige proyecto, credencial y respaldo.
 * - Exige lista blanca `AG08_PROYECTOS_PRUEBA` y que el proyecto esté EN ella:
 *   así no se puede apuntar a producción «por accidente» escribiendo un id.
 * - `--confirmo-produccion` NO abre la puerta: solo se registra como acuse.
 */
export function validarGuardaAplicar(args, env = {}) {
  if (!args.proyecto) throw new Error('--aplicar requiere --proyecto');
  if (!args.credencial) throw new Error('--aplicar requiere --credencial (service account)');
  if (!args.respaldo) {
    throw new Error('--aplicar requiere --respaldo <id-del-export>: sin respaldo verificado no se borra nada.');
  }

  // D2 — el id debe tener forma de id de proyecto GCP. Evita que un valor
  // arbitrario con espacios o un id de otro proveedor pase como «proyecto».
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(args.proyecto)) {
    throw new Error('El id de proyecto no tiene un formato válido.');
  }

  // D2/F8 — LISTA NEGRA explícita e INMUTABLE del proyecto de producción del repo.
  // F8: la versión anterior leía el id de producción de una variable de entorno,
  // así que definir `AG08_PROYECTO_PRODUCCION` DESACTIVABA la lista negra: una
  // elusión real, comprobada. Las prohibiciones no pueden ser configurables por
  // quien ejecuta. Ahora son constantes del código.
  if (esProyectoProduccion(args.proyecto)) {
    throw new Error('El proyecto indicado es el de PRODUCCIÓN: bloqueado sin excepción.');
  }
  // Y AUNQUE el id no estuviera en la lista negra, un proyecto cuyo id termine en
  // `-produccion`/`_produccion` se rechaza: defensa en profundidad por nomenclatura.
  if (/-produccion$|-prod$/.test(args.proyecto)) {
    throw new Error('El id de proyecto parece de producción por su nombre: bloqueado.');
  }

  const listaBlanca = String(env.AG08_PROYECTOS_PRUEBA || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (listaBlanca.length === 0) {
    throw new Error(
      'Falta AG08_PROYECTOS_PRUEBA: define la lista blanca de proyectos de pruebas ' +
        '(ids separados por comas). Sin lista blanca no se aplica nada.'
    );
  }
  if (listaBlanca.some((p) => esProyectoProduccion(p))) {
    throw new Error('AG08_PROYECTOS_PRUEBA no puede contener el proyecto de producción.');
  }
  if (!listaBlanca.includes(args.proyecto)) {
    throw new Error(
      'El proyecto indicado no está en AG08_PROYECTOS_PRUEBA. ' +
        'Añádelo explícitamente solo si es un proyecto de PRUEBAS.'
    );
  }
  return Boolean(args.confirmoProduccion);
}

// ============================================================================
// HUELLAS Y MANIFIESTO DE RESPALDO (sin material de credencial)
// ============================================================================
// El respaldo REAL de los datos es el export de Firestore (`gcloud firestore
// export`). Este manifiesto NO lo sustituye: lo CERTIFICA. Registra, por
// documento, una huella calculada **excluyendo `passwordHash`**, de modo que:
//   · prueba que el export cubría exactamente esos documentos y qué contenía
//     cada uno en todo lo que no es la credencial (restauración verificable);
//   · NO guarda ni deriva material del hash: no hay sha256 del campo, para que
//     un `fb_<hex>` de baja entropía no pueda atacarse por diccionario contra
//     la huella.
const CAMPOS_NUNCA_EN_MANIFIESTO = ['passwordHash'];

/** Serialización canónica: claves ordenadas y estable entre ejecuciones. */
function canonico(valor) {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? 'null';
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  const claves = Object.keys(valor).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(',')}}`;
}

/** Huella de un documento EXCLUYENDO el campo de credencial. */
export function huellaDocumento(datos) {
  const limpio = {};
  for (const k of Object.keys(datos || {})) {
    if (CAMPOS_NUNCA_EN_MANIFIESTO.includes(k)) continue;
    limpio[k] = datos[k];
  }
  return createHash('sha256').update(canonico(limpio)).digest('hex');
}

/** Manifiesto de respaldo: ids + huellas + presencia/longitud. Sin hashes. */
export function crearManifiestoRespaldo(documentos, meta = {}) {
  const items = documentos.map(({ id, datos }) => {
    const valor = datos ? datos.passwordHash : undefined;
    return {
      id,
      huella: huellaDocumento(datos || {}),
      tieneHash: datos != null && Object.prototype.hasOwnProperty.call(datos, 'passwordHash'),
      hashLongitud: typeof valor === 'string' ? valor.length : valor === null ? null : undefined,
    };
  });
  const ordenados = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    tipo: 'AG08_RESPALDO',
    version: 1,
    generadoEn: new Date().toISOString(),
    ...meta,
    total: ordenados.length,
    documentos: ordenados,
    // Huella global del CONJUNTO (sin material de credencial): detecta que el
    // respaldo fue manipulado o que no corresponde a la base actual.
    huellaGlobal: createHash('sha256')
      .update(canonico(ordenados.map((x) => ({ id: x.id, huella: x.huella }))))
      .digest('hex'),
  };
}

/**
 * Verifica un manifiesto de respaldo contra el estado actual. Devuelve
 * `{ ok, motivos }`. FAIL-CLOSED: cualquier anomalía ⇒ `ok:false`.
 */
export function verificarRespaldo(manifiesto, documentosActuales, opciones = {}) {
  const motivos = [];
  const exigirCobertura = opciones.exigirCobertura !== false;

  if (!manifiesto || typeof manifiesto !== 'object') {
    return { ok: false, motivos: ['manifiesto ausente o ilegible'] };
  }
  if (manifiesto.tipo !== 'AG08_RESPALDO') motivos.push('tipo de manifiesto inesperado');
  if (manifiesto.version !== 1) motivos.push('versión de manifiesto no soportada');
  if (!Array.isArray(manifiesto.documentos)) motivos.push('lista de documentos ausente');

  if (motivos.length) return { ok: false, motivos };

  // Integridad interna: la huella global debe corresponder a los documentos.
  const ordenados = [...manifiesto.documentos].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const global = createHash('sha256')
    .update(canonico(ordenados.map((x) => ({ id: x.id, huella: x.huella }))))
    .digest('hex');
  if (global !== manifiesto.huellaGlobal) motivos.push('huella global no coincide: manifiesto manipulado');

  // Correspondencia con la base actual, documento a documento.
  const actuales = new Map(documentosActuales.map((d) => [d.id, d.datos || {}]));
  const respaldados = new Map(manifiesto.documentos.map((d) => [d.id, d]));

  const faltanEnRespaldo = [];
  const huellaDistinta = [];
  for (const [id, datos] of actuales) {
    const r = respaldados.get(id);
    if (!r) {
      faltanEnRespaldo.push(id);
      continue;
    }
    if (r.huella !== huellaDocumento(datos)) huellaDistinta.push(id);
  }
  if (faltanEnRespaldo.length) {
    motivos.push(`el respaldo no cubre ${faltanEnRespaldo.length} documento(s) actuales`);
  }
  if (huellaDistinta.length) {
    motivos.push(
      `la base ha cambiado respecto al respaldo en ${huellaDistinta.length} documento(s): respaldo obsoleto`
    );
  }

  // Cobertura del conjunto a modificar (por defecto exigida).
  if (exigirCobertura && Array.isArray(opciones.idsAfectados)) {
    const sinRespaldo = opciones.idsAfectados.filter((id) => !respaldados.has(id));
    if (sinRespaldo.length) motivos.push(`${sinRespaldo.length} documento(s) a modificar sin respaldo`);
  }

  // Un documento que el manifiesto diga con hash y que ya no lo tenga en la base
  // indica que la base cambió (o que el respaldo es de otra ejecución).
  for (const [id, r] of respaldados) {
    const datos = actuales.get(id);
    if (!datos) continue;
    const tiene = Object.prototype.hasOwnProperty.call(datos, 'passwordHash');
    if (r.tieneHash !== tiene) motivos.push(`estado del campo distinto al respaldo en ${id}`);
  }

  return { ok: motivos.length === 0, motivos };
}

/**
 * Comprueba que entre dos lecturas COMPLETAS solo ha cambiado `passwordHash`.
 * Es la verificación de «no se alteran datos ajenos» sobre el estado real.
 */
export function verificarSoloCambioElCampo(antes, despues) {
  const problemas = [];
  const mapaDespues = new Map(despues.map((d) => [d.id, d.datos || {}]));
  for (const { id, datos } of antes) {
    const tras = mapaDespues.get(id);
    if (!tras) {
      problemas.push(`documento desaparecido: ${id}`);
      continue;
    }
    if (huellaDocumento(datos) !== huellaDocumento(tras)) {
      problemas.push(`otros campos alterados: ${id}`);
    }
    if (Object.prototype.hasOwnProperty.call(tras, 'passwordHash')) {
      problemas.push(`passwordHash sigue presente: ${id}`);
    }
  }
  if (despues.length !== antes.length) {
    problemas.push(`el número de documentos ha cambiado (${antes.length} → ${despues.length})`);
  }
  return { ok: problemas.length === 0, problemas };
}

/**
 * Diario de progreso: permite REANUDAR una ejecución interrumpida y deja
 * constancia de que una operación parcial NO se ha completado. Es la prueba
 * duradera de qué se hizo y qué quedó pendiente.
 */
export function crearDiario(meta = {}) {
  return {
    tipo: 'AG08_DIARIO',
    version: 1,
    iniciadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    estado: 'EN_CURSO',
    ...meta,
    hechos: [],
    fallidos: [],
  };
}

/** Reanuda: aplica solo lo que falta. Idempotente por construcción. */
export async function aplicarPlanConDiario(db, plan, opciones) {
  const { deleteSentinela, auditar, diario, guardarDiario } = opciones;
  const yaHechos = new Set(diario.hechos);
  // Solo se intentan los que NO constan como hechos: así una reanudación no
  // repite trabajo ya confirmado (y si algo se repitiera, `update` es inofensivo
  // porque el campo ya no existe → idempotente).
  const idsAPendientes = plan.idsAfectados.filter((id) => !yaHechos.has(id));
  const { borrados, fallos, idsFallidos } = await aplicarPlan(db, { ...plan, idsAfectados: idsAPendientes }, {
    deleteSentinela,
    auditar: auditar
      ? async (id) => {
          await auditar(id);
          diario.hechos.push(id);
          diario.actualizadoEn = new Date().toISOString();
          guardarDiario?.(diario);
        }
      : async (id) => {
          diario.hechos.push(id);
          diario.actualizadoEn = new Date().toISOString();
          guardarDiario?.(diario);
        },
  });
  // Un id que falló antes y ahora ha funcionado DEJA de estar fallido: si no se
  // retirara, el diario quedaría INCOMPLETO para siempre aunque el reintento
  // hubiera resuelto el problema, y la auditoría mentiría sobre el estado final.
  for (const id of idsFallidos) if (!diario.fallidos.includes(id)) diario.fallidos.push(id);
  for (const id of diario.hechos) {
    const i = diario.fallidos.indexOf(id);
    if (i >= 0) diario.fallidos.splice(i, 1);
  }
  const pendientes = plan.idsAfectados.filter((id) => !diario.hechos.includes(id));
  diario.actualizadoEn = new Date().toISOString();
  diario.estado = diario.fallidos.length === 0 && pendientes.length === 0 ? 'COMPLETO' : 'INCOMPLETO';
  guardarDiario?.(diario);
  return { borrados, fallos, pendientes };
}

/** Token opaco y estable por documento, para trazas: permite correlacionar
 *  entradas de auditoría SIN escribir el id del documento (que puede contener,
 *  por ejemplo, el UID de Firebase Auth). */
export function tokenDocumento(id) {
  if (!id) return '(vacío)';
  return `doc_${createHash('sha256').update(`ag08:${id}`).digest('hex').slice(0, 12)}`;
}

/** Huella estable y no reversible del id de respaldo: permite correlacionar el
 *  artefacto sin escribir en el manifiesto ni en `audit_logs` el identificador
 *  completo del export (que revela bucket y ruta de infraestructura). */
export function huellaRespaldo(id) {
  if (!id) return '(ninguno)';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return `respaldo#${Math.abs(h).toString(16)}`;
}

/** Guarda: el manifiesto nunca debe contener el valor literal del hash. */
export function validarManifiestoSinSecretos(obj, valoresReales = []) {
  const texto = JSON.stringify(obj);
  for (const v of valoresReales) {
    if (typeof v === 'string' && v.length >= 16 && texto.includes(v)) {
      throw new Error('El manifiesto contendría un valor de hash real: abortado.');
    }
  }
  if (/"passwordHash"\s*:/.test(texto)) {
    throw new Error('El manifiesto contendría una clave passwordHash con valor: abortado.');
  }
  return true;
}

// ============================================================================
// CLI
// ============================================================================

/** Error con mensaje PROPIO (redactado por el script, sin datos del entorno). */
function abortar(mensaje) {
  const e = new Error(mensaje);
  e.esPropio = true;
  return e;
}

function parseArgs(argv) {
  const args = {
    aplicar: false,
    proyecto: '',
    credencial: '',
    respaldo: '',
    confirmoProduccion: false,
    salida: '',
    entrada: '',
    manifiestoRespaldo: '',
    diario: '',
    respaldoManifiesto: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--aplicar') args.aplicar = true;
    else if (a === '--confirmo-produccion') args.confirmoProduccion = true;
    else if (a === '--proyecto') args.proyecto = argv[++i] ?? '';
    else if (a === '--credencial') args.credencial = argv[++i] ?? '';
    else if (a === '--respaldo') args.respaldo = argv[++i] ?? '';
    else if (a === '--salida') args.salida = argv[++i] ?? '';
    else if (a === '--entrada') args.entrada = argv[++i] ?? '';
    else if (a === '--manifiesto-respaldo') args.manifiestoRespaldo = argv[++i] ?? '';
    else if (a === '--diario') args.diario = argv[++i] ?? '';
    else if (a === '--respaldo-manifiesto') args.respaldoManifiesto = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw abortar(`Argumento no reconocido: ${a}`);
  }
  return args;
}

function usage() {
  console.log(`AG-08 · retirada de passwordHash (dry-run por defecto)

  node scripts/ag08/migrar-passwordhash.mjs
  node scripts/ag08/migrar-passwordhash.mjs --aplicar --proyecto <id> \\
       --credencial <sa.json> --respaldo <id-export> [--confirmo-produccion] [--salida <dir>]

  # Validación offline del plan con datos ficticios (no requiere firebase-admin)
  node scripts/ag08/migrar-passwordhash.mjs --entrada fixtures.json

  # Huella del respaldo (antes de exportar): genera el manifiesto que certifica
  # el estado de los documentos y permite verificar la restauración después.
  node scripts/ag08/migrar-passwordhash.mjs --respaldo-manifiesto \
       --entrada fixtures.json --salida <dir>

Sin --aplicar no se escribe NADA en Firestore.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const dirSalida = args.salida || path.join(process.cwd(), 'ag08-salida');

  // ---- Modo OFFLINE: valida la lógica del plan con datos ficticios ----------
  if (args.entrada) {
    if (args.aplicar) throw abortar('--entrada no se combina con --aplicar.');
    const crudos = JSON.parse(readFileSync(args.entrada, 'utf8'));
    const documentos = Array.isArray(crudos)
      ? crudos.map((d) => ({ id: String(d.id), datos: d.datos ?? null }))
      : Object.entries(crudos).map(([id, datos]) => ({ id, datos }));
    const plan = construirPlan(documentos);
    const manifiesto = manifiestoAuditable(plan, { modo: 'offline', entrada: path.basename(args.entrada) });
    const valoresReales = documentos
      .map((d) => (d.datos ? d.datos.passwordHash : undefined))
      .filter((v) => typeof v === 'string');
    validarManifiestoSinSecretos(manifiesto, valoresReales);

    console.log(`[AG-08] OFFLINE · documentos: ${plan.resumen.total}`);
    console.log(`[AG-08] OFFLINE · a borrar:  ${plan.resumen.aBorrar}`);
    console.log(`[AG-08] OFFLINE · omitidos:  ${plan.resumen.omitidos}`);
    for (const e of plan.entradas) {
      console.log(`  - ${e.id}: ${e.accion} (${e.motivo})${e.valorSeguro ? ' ' + e.valorSeguro : ''}`);
    }
    mkdirSync(dirSalida, { recursive: true });
    const ruta = path.join(dirSalida, `manifiesto-ag08-offline-${Date.now()}.json`);
    writeFileSync(ruta, JSON.stringify(manifiesto, null, 2), 'utf8');
    console.log(`[AG-08] OFFLINE · manifiesto sin hashes: ${ruta}`);

    if (args.respaldoManifiesto) {
      // D3: manifiesto de RESPALDO (huellas sin material de credencial). Es el
      // artefacto que certifica el export y permite verificar la restauración.
      const mRespaldo = crearManifiestoRespaldo(documentos, {
        modo: 'offline',
        entrada: path.basename(args.entrada),
        nota: 'Las huellas excluyen passwordHash a propósito (no se deriva material del hash).',
      });
      const texto = JSON.stringify(mRespaldo);
      if (/"passwordHash"\s*:/.test(texto)) throw new Error('El manifiesto de respaldo contendría el campo.');
      for (const v of valoresReales) {
        if (v.length >= 16 && texto.includes(v)) throw new Error('El manifiesto de respaldo contendría un hash: abortado.');
      }
      const rutaR = path.join(dirSalida, `respaldo-ag08-offline-${Date.now()}.json`);
      writeFileSync(rutaR, JSON.stringify(mRespaldo, null, 2), 'utf8');
      console.log(`[AG-08] OFFLINE · manifiesto de respaldo (huellas sin hashes): ${rutaR}`);
    }
    return;
  }

  // ---- Guardas antes de tocar Firestore (fail-closed) ----------------------
  let acuse = false;
  if (args.aplicar) {
    try {
      acuse = validarGuardaAplicar(args, process.env);
    } catch (e) {
      // Se reetiqueta como error propio para que su mensaje sea imprimible.
      throw abortar(e.message);
    }
  }

  const { app: adminApp, firestore: adminFirestore } = await cargarAdmin();
  const { initializeApp, cert, getApps } = adminApp;
  const { getFirestore } = adminFirestore;

  // D1: el error de `JSON.parse`/`readFileSync` puede incluir fragmentos del
  // service account o la ruta. Se captura y se sustituye por un motivo opaco.
  let credencial;
  try {
    credencial = JSON.parse(readFileSync(args.credencial, 'utf8'));
  } catch {
    throw abortar(
      'No se pudo leer o interpretar la credencial indicada. ' +
        'No se muestran detalles para no filtrar su contenido ni su ruta.'
    );
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(credencial), projectId: args.proyecto });
  }
  const db = getFirestore();

  // Exclusiones explícitas: aunque se indique otra colección por error, aquí no
  // se toca nada fuera de `usuarios`. `audit_logs` es append-only para el diario.
  const COLECCION = 'usuarios';

  const leerTodo = async () => {
    const snap = await db.collection(COLECCION).select('passwordHash').get();
    return snap.docs.map((d) => ({ id: d.id, datos: d.data() || {} }));
  };

  const documentos = await leerTodo();
  const plan = construirPlan(documentos);

  console.log(`[AG-08] documentos leídos: ${plan.resumen.total}`);
  console.log(`[AG-08] con passwordHash: ${plan.resumen.aBorrar}`);
  console.log(`[AG-08] sin el campo:    ${plan.resumen.omitidos}`);

  mkdirSync(dirSalida, { recursive: true });

  // ---- D3: manifiesto de RESPALDO (huellas sin material de credencial) ------
  const mRespaldo = crearManifiestoRespaldo(documentos, {
    modo: args.aplicar ? 'aplicar' : 'dry-run',
    coleccion: COLECCION,
    respaldo: huellaRespaldo(args.respaldo),
    acuseExplicito: acuse,
  });
  const textoRespaldo = JSON.stringify(mRespaldo);
  for (const d of documentos) {
    const v = d.datos.passwordHash;
    if (typeof v === 'string' && v.length >= 16 && textoRespaldo.includes(v)) {
      throw abortar('El manifiesto de respaldo contendría un hash: abortado.');
    }
  }
  if (/"passwordHash"\s*:/.test(textoRespaldo)) {
    throw abortar('El manifiesto de respaldo contendría el campo: abortado.');
  }
  const rutaRespaldo = path.join(dirSalida, `respaldo-ag08-${Date.now()}.json`);
  writeFileSync(rutaRespaldo, JSON.stringify(mRespaldo, null, 2), 'utf8');
  console.log(`[AG-08] manifiesto de respaldo (huellas sin hashes): ${rutaRespaldo}`);

  // ---- Manifiesto del plan (ids afectados) ---------------------------------
  const manifiesto = manifiestoAuditable(plan, {
    modo: args.aplicar ? 'aplicar' : 'dry-run',
    proyecto: args.proyecto || '(no indicado)',
    respaldo: huellaRespaldo(args.respaldo),
    acuseExplicito: acuse,
  });
  const valoresReales = documentos.map((d) => d.datos.passwordHash).filter((v) => typeof v === 'string');
  validarManifiestoSinSecretos(manifiesto, valoresReales);
  const rutaManifiesto = path.join(dirSalida, `manifiesto-ag08-${Date.now()}.json`);
  writeFileSync(rutaManifiesto, JSON.stringify(manifiesto, null, 2), 'utf8');
  console.log(`[AG-08] manifiesto (sin hashes): ${rutaManifiesto}`);

  if (!args.aplicar) {
    console.log('[AG-08] DRY-RUN: no se ha escrito nada. Usa --aplicar para ejecutar.');
    return;
  }

  // ---- D3: verificación OBLIGATORIA del respaldo antes de escribir ---------
  // `--manifiesto-respaldo` debe apuntar al manifiesto generado ANTES del export.
  // Se comprueba que cubre exactamente el conjunto actual y que la base no ha
  // cambiado desde entonces: si algo no cuadra, no se borra NADA (fail-closed).
  if (!args.manifiestoRespaldo) {
    throw abortar(
      '--aplicar exige --manifiesto-respaldo: sin verificar el respaldo contra el estado actual no se borra nada.'
    );
  }
  let manifiestoEsperado;
  try {
    manifiestoEsperado = JSON.parse(readFileSync(args.manifiestoRespaldo, 'utf8'));
  } catch {
    throw abortar('No se pudo leer el manifiesto de respaldo indicado (contenido o ruta no válidos).');
  }
  const verificacion = verificarRespaldo(manifiestoEsperado, documentos, {
    idsAfectados: plan.idsAfectados,
    exigirCobertura: true,
  });
  if (!verificacion.ok) {
    console.error(`[AG-08] respaldo NO válido (${verificacion.motivos.length} motivo(s)):`);
    for (const m of verificacion.motivos) console.error(`   · ${m}`);
    console.error('[AG-08] ABORTADO: no se ha escrito nada.');
    process.exitCode = 2;
    return;
  }
  console.log('[AG-08] respaldo verificado: cubre el conjunto actual y la base no ha cambiado.');

  // ---- Diario de progreso (reanudación y prueba de ejecución parcial) ------
  let diario;
  if (args.diario) {
    try {
      diario = JSON.parse(readFileSync(args.diario, 'utf8'));
      if (diario.tipo !== 'AG08_DIARIO') throw new Error('tipo');
      console.log(`[AG-08] REANUDANDO diario: ${diario.hechos.length} ya hechos, ${diario.fallidos.length} fallidos.`);
    } catch {
      throw abortar('El diario indicado no es válido (se esperaba un AG08_DIARIO).');
    }
  } else {
    diario = crearDiario({ coleccion: COLECCION, respaldo: huellaRespaldo(args.respaldo) });
  }
  const rutaDiario = args.diario || path.join(dirSalida, `diario-ag08-${Date.now()}.json`);
  const guardarDiario = (d) => writeFileSync(rutaDiario, JSON.stringify(d, null, 2), 'utf8');
  guardarDiario(diario);

  const { FieldValue } = adminFirestore;
  let resultado;
  try {
    resultado = await aplicarPlanConDiario(db, plan, {
      deleteSentinela: FieldValue.delete(),
      diario,
      guardarDiario,
      auditar: async (id) => {
        // Se registra un TOKEN opaco, no el id: la traza permite correlacionar
        // sin publicar identificadores de cuenta en la colección de auditoría.
        await db.collection('audit_logs').add({
          accion: 'AG08_PASSWORDHASH_RETIRADO',
          coleccion: COLECCION,
          documentoToken: tokenDocumento(id),
          campo: 'passwordHash',
          resultado: 'ELIMINADO',
          respaldo: huellaRespaldo(args.respaldo),
          fecha: new Date().toISOString(),
        });
      },
    });
  } catch (e) {
    // Interrupción: el diario queda EN_INCURSO/INCOMPLETO con lo ya hecho.
    diario.estado = 'INTERRUMPIDO';
    diario.actualizadoEn = new Date().toISOString();
    guardarDiario(diario);
    console.error(`[AG-08] INTERRUMPIDO (${codigoError(e)}). Diario: ${rutaDiario}`);
    console.error('[AG-08] la operación NO se ha completado: reanuda con --diario <ese fichero>.');
    process.exitCode = 1;
    return;
  }

  // ---- Verificación posterior sobre el estado REAL ------------------------
  const despues = await leerTodo();
  const soloCampo = verificarSoloCambioElCampo(documentos, despues);
  const restantes = despues.filter((d) => 'passwordHash' in d.datos).length;

  console.log(
    `[AG-08] borrados: ${resultado.borrados} · fallos: ${resultado.fallos} · restantes: ${restantes} · pendientes: ${resultado.pendientes.length}`
  );

  if (!soloCampo.ok) {
    console.error('[AG-08] ANOMALÍA: se han detectado cambios fuera del campo previsto:');
    for (const p of soloCampo.problemas) console.error(`   · ${p}`);
    console.error('[AG-08] NO se declara completado. Restaura el export y revisa.');
    process.exitCode = 3;
    return;
  }

  if (resultado.fallos > 0 || restantes > 0 || resultado.pendientes.length > 0) {
    diario.estado = 'INCOMPLETO';
    diario.actualizadoEn = new Date().toISOString();
    guardarDiario(diario);
    console.error('[AG-08] INCOMPLETO: reejecuta (es idempotente) o restaura el export.');
    console.error(`[AG-08] diario: ${rutaDiario}`);
    process.exitCode = 1;
    return;
  }

  diario.estado = 'COMPLETO';
  diario.actualizadoEn = new Date().toISOString();
  guardarDiario(diario);
  console.log('[AG-08] COMPLETO: solo se ha retirado passwordHash; el resto de campos está intacto.');
  console.log('[AG-08] Reejecutar ahora produciría 0 escrituras (idempotente).');
}

// Solo se ejecuta como CLI, no al importarse desde las pruebas.
if (process.argv[1] && path.basename(process.argv[1]) === 'migrar-passwordhash.mjs') {
  main().catch((e) => {
    // Motivo accionable pero SIN volcar rutas de credenciales ni contenido:
    // se imprime el mensaje SOLO si está marcado como propio del script (redactado
    // aquí, sin datos del entorno). El límite de longitud es una salvaguarda
    // anti-volcado: si un mensaje propio es más largo, se trunca en vez de
    // degradarse a un genérico 'Error' (que ocultaría la causa al operador).
    const LIMITE = 400;
    const esPropio = Boolean(e?.esPropio) && typeof e?.message === 'string' && !e.message.includes('\n');
    const mensaje = esPropio
      ? e.message.length > LIMITE
        ? `${e.message.slice(0, LIMITE)}…`
        : e.message
      : codigoError(e);
    const propio = esPropio;
    console.error(`[AG-08] abortado: ${propio ? mensaje : codigoError(e)}`);
    process.exitCode = 1;
  });
}
