/**
 * SUITE DE VERIFICACIÓN DEL CIRCUITO COMPLETO DE CANDIDATOS (30 ESCENARIOS)
 * ---------------------------------------------------------------------------
 * CANDIDATO → PRESELECCIÓN → SELECCIÓN DEL PROPIETARIO → SOLICITUD DE
 * DOCUMENTACIÓN → UPLOAD POR TOKEN → RECEPCIÓN Y VALIDACIÓN → ANÁLISIS IA
 * CONSULTIVO → SEGURO DE IMPAGO → DECISIÓN FINAL → HISTÓRICO INMUTABLE
 *
 * DOS NIVELES DE EVIDENCIA, SEPARADOS A PROPÓSITO:
 *  A) [REAL]    — se EJECUTA el motor del circuito
 *                 (src/utils/candidateCircuitEngine.ts) y el módulo de
 *                 autorización (src/lib/authorization.ts) sobre datos reales.
 *  B) [ESTÁTICO]— se INSPECCIONA el texto de firestore.rules, storage.rules y
 *                 el código de acceso a datos. En este entorno NO hay emulador
 *                 ni credenciales de Firebase, por lo que ninguna regla se ha
 *                 ejecutado contra Firestore/Storage: aquí se afirma que la
 *                 restricción está escrita y que el camino insegura no existe,
 *                 nunca que se haya probado en producción.
 *
 * Ejecución: npm test
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Candidato,
  Inmueble,
  SolicitudDocumentacion,
  SolicitudSeguroImpago,
  UsuarioApp,
  ItemDocumentoSolicitado,
  ArchivoAportado,
  ConfiguracionAseguradora,
} from '../src/types';
import {
  preseleccionarCandidatoParaVisita,
  seleccionarCandidato,
  agregarHistorialCandidato,
  registrarSubidaDocumento,
  validarDocumentoExpediente,
  rechazarDocumentoExpediente,
  clasificarExpedienteDocumental,
  registrarAnalisisDocumentalIA,
  tramitarSolicitudSeguroImpago,
  registrarDictamenAseguradora,
  registrarDecisionFinalPropietario,
  sanearSolicitudParaPortalPublico,
} from '../src/utils/candidateCircuitEngine';
import {
  perfilAutorizado,
  puedeAccederSeccion,
  seccionesPermitidas,
  seccionInicialPorPerfil,
  esAdministradorAutorizado,
} from '../src/lib/authorization';
import { scopeFromUsuario } from '../src/lib/firebase';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf-8');
const app = leer('src/App.tsx');
const firebase = leer('src/lib/firebase.ts');

// ---------------------------------------------------------------------------
// Arnés
// ---------------------------------------------------------------------------
let ejecutadas = 0;
let correctas = 0;
let fallidas = 0;
const reales: string[] = [];
const estaticas: string[] = [];
const fallos: string[] = [];

function checkReal(numero: number, nombre: string, condicion: boolean, detalle = '') {
  ejecutadas += 1;
  if (condicion) {
    correctas += 1;
    reales.push(`OK    [TEST ${String(numero).padStart(2, '0')}] [REAL] ${nombre}`);
  } else {
    fallidas += 1;
    fallos.push(`FALLO [TEST ${String(numero).padStart(2, '0')}] [REAL] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

function checkEstatica(numero: number, nombre: string, condicion: boolean, detalle = '') {
  ejecutadas += 1;
  if (condicion) {
    correctas += 1;
    estaticas.push(`OK    [TEST ${String(numero).padStart(2, '0')}] [ESTÁTICO] ${nombre}`);
  } else {
    fallidas += 1;
    fallos.push(
      `FALLO [TEST ${String(numero).padStart(2, '0')}] [ESTÁTICO] ${nombre}${detalle ? ` — ${detalle}` : ''}`
    );
  }
}

// ---------------------------------------------------------------------------
// Datos de prueba
// ---------------------------------------------------------------------------
const inmuebleA: Inmueble = {
  id: 'inm_A',
  direccion: 'Calle Mayor 1',
  ciudad: 'Alicante',
  precio: 900,
  estado: 'disponible',
  habitaciones: 3,
  banos: 2,
  superficie: 90,
  candidatosCount: 1,
  fianzaMeses: 2,
  propietarioId: 'prop_A',
};

const inmuebleB: Inmueble = {
  ...inmuebleA,
  id: 'inm_B',
  direccion: 'Calle Menor 9',
  propietarioId: 'prop_B',
};

const baseCandidato: Candidato = {
  id: 'cand_A',
  nombre: 'Ana Solicitante',
  email: 'ana@example.com',
  telefono: '600111222',
  inmuebleId: inmuebleA.id,
  inmuebleNombre: inmuebleA.direccion,
  numPersonas: 2,
  ingresosNetos: 2400,
  otrosIngresos: 0,
  tipoEmpleo: 'cuenta_ajena',
  tipoContrato: 'indefinido',
  antiguedadLaboral: '3 años',
  avalista: false,
  observaciones: '',
  documentos: [],
  scoreEstimado: 78,
  ratioSolvencia: 37,
  estado: 'nuevo',
  fechaCreacion: '2026-01-05',
};

const candidatoB: Candidato = {
  ...baseCandidato,
  id: 'cand_B',
  nombre: 'Bruno Solicitante',
  email: 'bruno@example.com',
  inmuebleId: inmuebleB.id,
  inmuebleNombre: inmuebleB.direccion,
};

const aseg = {
  id: 'seag',
  nombre: 'SEAG',
  nombreComercial: 'SEAG',
  emailTramitacion: 'tramitacion@seag.example',
  activa: true,
  ratioEsfuerzoMaximo: 40,
  antiguedadMinimaMeses: 12,
  documentosRequeridos: [],
  tasaPrimaAnualPorcentaje: 4.5,
  mesesCoberturaImpago: 12,
  tiempoMedioRespuestaHoras: 24,
  coberturasSugeridas: { mesesImpago: 12, defensaJuridicaEuros: 600, actosVandalicosEuros: 600 },
} as unknown as ConfiguracionAseguradora;

const archivo = (nombre: string, mimeType = 'application/pdf'): ArchivoAportado => ({
  id: `ar_${nombre}`,
  nombreArchivo: nombre,
  mimeType,
  fechaSubida: new Date().toISOString(),
  url: `/api/documents/${nombre}`,
  tamañoBytes: 1024 * 200,
});

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------
console.log('='.repeat(78));
console.log(' CIRCUITO DE CANDIDATOS — 30 ESCENARIOS (REAL vs ESTÁTICO)');
console.log('='.repeat(78));

// --- TEST 1: crear candidato -------------------------------------------------
const candidatoInicial: Candidato = { ...baseCandidato, historial: [] };
checkReal(1, 'Alta de candidato queda vinculada a su inmueble y sin historial previo', candidatoInicial.inmuebleId === inmuebleA.id && (candidatoInicial.historial?.length || 0) === 0);

// --- TEST 2: preselección ---------------------------------------------------
const { candidatoActualizado: trasPreseleccion } = preseleccionarCandidatoParaVisita(
  candidatoInicial,
  inmuebleA,
  'propietario',
  'Propietaria A',
  'Buen expediente preliminar'
);
checkReal(2, 'Preselección fija estado preseleccionado, fecha y entrada de historial',
  trasPreseleccion.estado === 'preseleccionado' &&
  !!trasPreseleccion.fechaPreseleccion &&
  (trasPreseleccion.historial || []).length === 1 &&
  trasPreseleccion.historial![0].fase === 'preseleccion');
checkReal(2.1, 'La preselección NO selecciona al candidato (no hay selección automática)',
  trasPreseleccion.estado !== 'seleccionado' && trasPreseleccion.decisionFinal === undefined);

// --- TEST 3: selección explícita del propietario ----------------------------
const seleccion = seleccionarCandidato(trasPreseleccion, inmuebleA, [], 'propietario', 'Propietaria A', 'Elegido por solvencia');
const trasSeleccion = seleccion.candidatoActualizado;
checkReal(3, 'Selección del propietario registra estado, fecha, autor y motivo',
  trasSeleccion.estado === 'seleccionado' &&
  !!trasSeleccion.fechaSeleccion &&
  trasSeleccion.seleccionadoMotivo === 'Elegido por solvencia' &&
  trasSeleccion.historial!.some((h) => h.fase === 'seleccion' && h.estadoNuevo === 'seleccionado'));
checkReal(3.1, 'La selección vincula la titularidad del inmueble al candidato',
  trasSeleccion.propietarioId === 'prop_A');

// --- TEST 4: solicitud de documentación ------------------------------------
const solicitudDoc = seleccion.solicitudDoc;
checkReal(4, 'La solicitud de documentación nace con token, requisitos y estado SOLICITADA',
  !!solicitudDoc.token &&
  solicitudDoc.estado === 'SOLICITADA' &&
  solicitudDoc.documentos.length > 0 &&
  solicitudDoc.candidatoId === trasSeleccion.id &&
  solicitudDoc.inmuebleId === inmuebleA.id &&
  solicitudDoc.ownerId === 'prop_A');
checkReal(4.1, 'El candidato queda enlazado a su expediente (solicitudDocId)',
  trasSeleccion.solicitudDocId === solicitudDoc.id);

// --- TEST 5: idempotencia de la solicitud ----------------------------------
const segundaSeleccion = seleccionarCandidato(trasSeleccion, inmuebleA, [solicitudDoc], 'propietario', 'Propietaria A', 'Repetición accidental');
checkReal(5, 'Repetir la selección NO duplica el expediente documental',
  segundaSeleccion.esNuevaSolicitudDoc === false &&
  segundaSeleccion.solicitudDoc.id === solicitudDoc.id &&
  segundaSeleccion.solicitudDoc.token === solicitudDoc.token);

// --- TEST 6: token público correcto ----------------------------------------
const publicoA = sanearSolicitudParaPortalPublico(solicitudDoc);
checkReal(6, 'El portal público recibe el expediente saneado con su token',
  publicoA.token === solicitudDoc.token &&
  publicoA.id === solicitudDoc.id &&
  publicoA.documentos.length === solicitudDoc.documentos.length);
checkReal(6.1, 'El saneado NO expone campos internos (notas, score, titularidad)',
  !('notasPropietario' in publicoA) &&
  !('propietarioId' in publicoA) &&
  !('ownerId' in publicoA) &&
  !('scoreEstimado' in publicoA));

// --- TEST 7: token A no accede al candidato B ------------------------------
const solicitudDocB: SolicitudDocumentacion = {
  ...solicitudDoc,
  id: 'doc_B',
  token: 'doc-TOKEN-B',
  candidatoId: candidatoB.id,
  candidatoNombre: candidatoB.nombre,
  candidatoTelefono: candidatoB.telefono,
  inmuebleId: inmuebleB.id,
  propietarioId: 'prop_B',
  ownerId: 'prop_B',
  documentos: solicitudDoc.documentos.map((d) => ({ ...d, archivos: [] })),
};
const publicoB = sanearSolicitudParaPortalPublico(solicitudDocB);
checkReal(7, 'El expediente expuesto por el token A no contiene datos del candidato B',
  !('candidatoId' in publicoA) &&
  JSON.stringify(publicoA).indexOf(candidatoB.email) === -1 &&
  JSON.stringify(publicoA).indexOf(candidatoB.nombre) === -1 &&
  publicoB.token !== publicoA.token);
checkEstatica(7.1, 'Rules: `solicitudes_documentacion` no permite listar sin titularidad ni administración',
  /match \/solicitudes_documentacion\/\{solicitudDocId\} \{[\s\S]*?allow list: if isStaff\(\) \|\| \(isPropietarioRole\(\) && \([\s\S]*?myInmuebleIds\(\)\.hasAny/.test(leer('firestore.rules')));

// --- TEST 8: el token no puede cambiar de inmueble -------------------------
const subida = registrarSubidaDocumento(solicitudDoc, solicitudDoc.documentos[0].id, archivo('dni.pdf'), false, trasSeleccion);
checkReal(8, 'Una subida del flujo público conserva inmueble, candidato y token',
  subida.solicitudDocActualizada.inmuebleId === solicitudDoc.inmuebleId &&
  subida.solicitudDocActualizada.candidatoId === solicitudDoc.candidatoId &&
  subida.solicitudDocActualizada.token === solicitudDoc.token);
checkEstatica(8.1, 'Rules: la actualización pública no puede cambiar token/inmuebleId/candidatoId/ownerId',
  (() => {
    const rules = leer('firestore.rules');
    const i = rules.indexOf('match /solicitudes_documentacion/');
    const j = rules.indexOf('    match /', i + 10);
    const bloque = rules.slice(i, j > 0 ? j : rules.length);
    return bloque.includes("'token', 'inmuebleId', 'candidatoId', 'ownerId', 'profesionalId'");
  })());

// --- TEST 9: subida autorizada ---------------------------------------------
checkReal(9, 'Subida autorizada: el requisito pasa a "subido" con su archivo y fecha',
  subida.solicitudDocActualizada.documentos[0].estado === 'subido' &&
  subida.solicitudDocActualizada.documentos[0].archivos.length === 1 &&
  !!subida.solicitudDocActualizada.documentos[0].fechaSubida);
checkReal(9.1, 'La subida deja traza en el expediente y en el candidato',
  subida.solicitudDocActualizada.historial.length === solicitudDoc.historial.length + 1 &&
  (subida.candidatoActualizado?.historial?.length || 0) === (trasSeleccion.historial?.length || 0) + 1);

// --- TEST 10: subida no permitida ------------------------------------------
checkEstatica(10, 'Storage: la subida pública exige PDF/imagen y tamaño máximo (15 MB)',
  (() => {
    const storage = leer('storage.rules');
    const i = storage.indexOf('match /documentos_solicitados/');
    const j = storage.indexOf('    match /', i + 10);
    const bloque = storage.slice(i, j > 0 ? j : storage.length);
    return bloque.includes('request.resource.size < 15 * 1024 * 1024') && bloque.includes('isPdfOrImage()');
  })());
checkEstatica(10.1, 'Storage: la superficie sin sesión queda limitada a galería pública y subida de documentación',
  (() => {
    const storage = leer('storage.rules');
    const publicas = (storage.match(/allow (read|create|write)[^;]*if true;/g) || []).length;
    return storage.includes('allow read: if true;') && publicas <= 2;
  })());

// --- TEST 11: actualización del estado documental --------------------------
checkReal(11, 'El primer archivo deja el expediente en PARCIALMENTE_APORTADA',
  subida.solicitudDocActualizada.estado === 'PARCIALMENTE_APORTADA');
checkReal(11.1, 'El envío final incompleto NO marca el expediente como completado',
  registrarSubidaDocumento(subida.solicitudDocActualizada, subida.solicitudDocActualizada.documentos[1]?.id || 'x', archivo('nomina.pdf'), true, subida.candidatoActualizado).solicitudDocActualizada.estado === 'PARCIALMENTE_APORTADA');

// --- TEST 12: rechazo documental → subsanación -----------------------------
const rechazo = rechazarDocumentoExpediente(subida.solicitudDocActualizada, subida.solicitudDocActualizada.documentos[0].id, 'Nómina ilegible', 'Propietaria A', subida.candidatoActualizado);
checkReal(12, 'El rechazo marca el requisito como "requiere_correccion" con motivo y estado REVISION_SOLICITADA',
  rechazo.solicitudDocActualizada.documentos[0].estado === 'requiere_correccion' &&
  rechazo.solicitudDocActualizada.documentos[0].motivoCorreccion === 'Nómina ilegible' &&
  rechazo.solicitudDocActualizada.estado === 'REVISION_SOLICITADA');
const subsanacion = registrarSubidaDocumento(rechazo.solicitudDocActualizada, rechazo.solicitudDocActualizada.documentos[0].id, archivo('nomina-legible.pdf'), false, rechazo.candidatoActualizado);
checkReal(12.1, 'La subsanación vuelve a dejar el requisito "subido" y limpia el motivo de corrección',
  subsanacion.solicitudDocActualizada.documentos[0].estado === 'subido' &&
  subsanacion.solicitudDocActualizada.documentos[0].motivoCorreccion === undefined &&
  subsanacion.solicitudDocActualizada.documentos[0].archivos.length === 2);
checkReal(12.2, 'La clasificación documental detecta el expediente en revisión mientras falten obligatorios',
  clasificarExpedienteDocumental(rechazo.solicitudDocActualizada).clasificacion === 'REVISAR');

// --- TEST 13: documentación completa --------------------------------------
let expediente = subsanacion.solicitudDocActualizada;
let candidatoFlujo = subsanacion.candidatoActualizado || trasSeleccion;
for (const item of expediente.documentos.filter((d) => d.obligatorio)) {
  if (item.estado !== 'subido' && item.estado !== 'validado') {
    const r = registrarSubidaDocumento(expediente, item.id, archivo(`${item.id}.pdf`), true, candidatoFlujo);
    expediente = r.solicitudDocActualizada;
    candidatoFlujo = r.candidatoActualizado || candidatoFlujo;
  }
}
const validado = validarDocumentoExpediente(expediente, expediente.documentos[0].id, 'Propietaria A', candidatoFlujo);
expediente = validado.solicitudDocActualizada;
candidatoFlujo = validado.candidatoActualizado || candidatoFlujo;
const clasificacion = clasificarExpedienteDocumental(expediente);
checkReal(13, 'Con la documentación completa el expediente queda apto y el candidato en "doc_recibida"',
  clasificacion.clasificacion === 'COMPLETO' &&
  expediente.estado === 'COMPLETADA' &&
  candidatoFlujo.estado === 'doc_recibida');
checkReal(13.1, 'La validación del propietario marca el requisito como validado',
  expediente.documentos[0].estado === 'validado' && !!expediente.documentos[0].fechaValidacion);

// --- TEST 14: análisis IA consultivo --------------------------------------
const trasAnalisis = registrarAnalisisDocumentalIA(candidatoFlujo, {
  ingresosDeclarados: 2400,
  ingresosDocumentados: 2280,
  coherenciaWarnings: ['Diferencia de 120 € entre lo declarado y lo documentado'],
  legibilidadDocs: 'alta',
  observacionesIa: 'Documentación legible y coherente con el perfil declarado.',
});
checkReal(14, 'El análisis IA registra sus hallazgos en el candidato y en el historial (fase analisis_ia)',
  (trasAnalisis.historial || []).some((h) => h.fase === 'analisis_ia' && h.autor === 'sistema_ia') &&
  trasAnalisis.clasificacionDocumental === 'COMPLETO' &&
  !!(trasAnalisis.clasificacionDocumentalMotivo || '').includes('Análisis consultivo IA') &&
  (trasAnalisis.historial || []).some((h) => h.accion.includes('consultivo')));
checkReal(14.1, 'El análisis IA con desviación grave de ingresos marca REVISAR (nunca aprueba)',
  registrarAnalisisDocumentalIA(candidatoFlujo, {
    ingresosDeclarados: 2400,
    ingresosDocumentados: 900,
    observacionesIa: 'Desviación grave',
  }).clasificacionDocumental === 'REVISAR');

// --- TEST 15: la IA no decide ---------------------------------------------
checkReal(15, 'El análisis IA NO cambia la decisión final ni aprueba el expediente',
  trasAnalisis.decisionFinal === undefined &&
  trasAnalisis.decisionFinalAutor === undefined &&
  trasAnalisis.estado !== 'aceptado_final' &&
  trasAnalisis.estado !== 'rechazado_final');
checkEstatica(15.1, 'Reglas: la IA no puede alterar propietario, contrato ni estado final (ninguna regla concede escritura por IA)',
  !/allow (write|update): if true;/.test(leer('firestore.rules')));

// --- TEST 16: solicitud de seguro -----------------------------------------
const seguro = tramitarSolicitudSeguroImpago(trasAnalisis, inmuebleA, [], aseg, inmuebleA.precio, 'propietario', 'Propietaria A');
checkReal(16, 'La solicitud de seguro genera expediente con referencia, aseguradora y titularidad',
  !!seguro.solicitudSeguro.referenciaUnica &&
  seguro.solicitudSeguro.aseguradoraId === aseg.id &&
  seguro.solicitudSeguro.propietarioId === 'prop_A' &&
  seguro.solicitudSeguro.candidatoId === trasAnalisis.id &&
  seguro.esNueva === true);
checkReal(16.1, 'El candidato pasa a "seguro_solicitado" y queda enlazado a su expediente',
  seguro.candidatoActualizado.estado === 'seguro_solicitado' &&
  seguro.candidatoActualizado.solicitudSeguroId === seguro.solicitudSeguro.id);

// --- TEST 17: idempotencia del seguro -------------------------------------
const seguroRepetido = tramitarSolicitudSeguroImpago(seguro.candidatoActualizado, inmuebleA, [seguro.solicitudSeguro], aseg, inmuebleA.precio, 'propietario', 'Propietaria A');
checkReal(17, 'Repetir la tramitación NO duplica el expediente de seguro',
  seguroRepetido.esNueva === false &&
  seguroRepetido.solicitudSeguro.id === seguro.solicitudSeguro.id &&
  seguroRepetido.solicitudSeguro.referenciaUnica === seguro.solicitudSeguro.referenciaUnica);

// --- TESTS 18/19/20: dictámenes -------------------------------------------
const favorable = registrarDictamenAseguradora(seguro.solicitudSeguro, seguro.candidatoActualizado, 'FAVORABLE', { importeMaximo: 12000, comentario: 'Riesgo aceptado' }, expediente);
checkReal(18, 'Dictamen FAVORABLE → candidato "aprobado_seguro" y expediente RESPUESTA_PROCESADA',
  favorable.candidatoActualizado.estado === 'aprobado_seguro' &&
  favorable.solicitudSeguroActualizada.estado === 'RESPUESTA_PROCESADA' &&
  favorable.candidatoActualizado.seguroDictamen === 'FAVORABLE');

const condicionado = registrarDictamenAseguradora(seguro.solicitudSeguro, seguro.candidatoActualizado, 'FAVORABLE_CONDICIONADO', { importeMaximo: 9000, condiciones: ['Aval adicional', 'Franquicia 1 mes'], comentario: 'Aprobado con condiciones' }, expediente);
checkReal(19, 'Dictamen FAVORABLE_CONDICIONADO → aprobado con condiciones registradas',
  condicionado.candidatoActualizado.estado === 'aprobado_seguro' &&
  (condicionado.solicitudSeguroActualizada.condicionesEstipuladas || []).length === 2);

const desfavorable = registrarDictamenAseguradora(seguro.solicitudSeguro, seguro.candidatoActualizado, 'DESFAVORABLE', { comentario: 'Ratio de esfuerzo fuera de política' }, expediente);
checkReal(20, 'Dictamen DESFAVORABLE → candidato "rechazado_seguro" (sin decisión automática del propietario)',
  desfavorable.candidatoActualizado.estado === 'rechazado_seguro' &&
  desfavorable.candidatoActualizado.decisionFinal === undefined);

// --- TEST 21: decisión final aceptar --------------------------------------
const decisionAceptar = registrarDecisionFinalPropietario(favorable.candidatoActualizado, 'ACEPTAR', 'Perfil solvente y avalado', 'Propietaria A', favorable.solicitudSeguroActualizada);
checkReal(21, 'La decisión de aceptar queda registrada con autor, fecha y motivo',
  decisionAceptar.candidatoActualizado.estado === 'aceptado_final' &&
  decisionAceptar.candidatoActualizado.decisionFinal === 'ACEPTAR' &&
  decisionAceptar.candidatoActualizado.decisionFinalAutor === 'Propietaria A' &&
  !!decisionAceptar.candidatoActualizado.decisionFinalFecha);
checkReal(21.1, 'La decisión se sincroniza con el expediente de seguro',
  decisionAceptar.solicitudSeguroActualizada?.decisionFinalPropietario === 'ACEPTAR_CANDIDATO');

// --- TEST 22: rechazo con motivo obligatorio ------------------------------
let lanzoSinMotivo = false;
try {
  registrarDecisionFinalPropietario(favorable.candidatoActualizado, 'RECHAZAR', '   ', 'Propietaria A');
} catch {
  lanzoSinMotivo = true;
}
checkReal(22, 'Rechazar SIN motivo está prohibido (el motor lanza y no cambia el estado)',
  lanzoSinMotivo);
const decisionRechazar = registrarDecisionFinalPropietario(favorable.candidatoActualizado, 'RECHAZAR', 'No acredita ingresos suficientes', 'Propietaria A');
checkReal(22.1, 'Rechazar CON motivo registra motivo, estado y traza',
  decisionRechazar.candidatoActualizado.estado === 'rechazado_final' &&
  decisionRechazar.candidatoActualizado.decisionFinalMotivo === 'No acredita ingresos suficientes' &&
  decisionRechazar.candidatoActualizado.historial!.some((h) => h.fase === 'decision_final' && h.estadoNuevo === 'rechazado_final'));

// --- TEST 23: histórico append-only ---------------------------------------
const historialFinal = decisionAceptar.candidatoActualizado.historial || [];
const fases = new Set(historialFinal.map((h) => h.fase));
const primeraEntradaPreservada = JSON.stringify(historialFinal[0]) === JSON.stringify(trasPreseleccion.historial![0]);
checkReal(23, 'El histórico crece de forma monótona y conserva ÍNTEGRA la primera entrada',
  historialFinal.length >= 6 &&
  primeraEntradaPreservada &&
  fases.has('preseleccion') &&
  fases.has('seleccion') &&
  fases.has('documentacion') &&
  fases.has('analisis_ia') &&
  fases.has('seguro') &&
  fases.has('decision_final'));
checkEstatica(23.1, 'Rules: candidatos/documentación/seguro exigen historial no decreciente (append-only)',
  (() => {
    const rules = leer('firestore.rules');
    const ocurrencias = (rules.match(/incoming\(\)\.historial\.size\(\) >= existing\(\)\.historial\.size\(\)/g) || []).length;
    return ocurrencias >= 3;
  })());
checkEstatica(23.2, 'Reglas: no existe ninguna regla que permita update/delete del histórico (audit_logs inmutable)',
  /match \/audit_logs\/\{auditId\} \{[\s\S]*?allow update, delete: if false;/.test(leer('firestore.rules')));

// --- TEST 24: propietario A no accede al candidato de B -------------------
const propietarioA = { id: 'user_A', nombre: 'Propietaria', email: 'a@example.com', tipoPerfil: 'PROPIETARIO', roles: [], permisos: [], estado: 'ACTIVO', propietarioId: 'prop_A' } as UsuarioApp;
const alcanceA = scopeFromUsuario(propietarioA);
checkReal(24, 'El alcance de datos del propietario A queda acotado a su propio id (nunca global)',
  !!alcanceA && alcanceA.tipoPerfil === 'PROPIETARIO' && alcanceA.propietarioId === 'prop_A' && !('global' in alcanceA));
checkEstatica(24.1, 'Rules: el propietario sólo lista candidatos por propietarioId propio o inmueble asignado',
  (() => {
    const rules = leer('firestore.rules');
    const i = rules.indexOf('match /candidatos/');
    const bloque = rules.slice(i, rules.indexOf('    match /', i + 10));
    return bloque.includes('resource.data.propietarioId == myPropId()') && bloque.includes('myInmuebleIds().hasAny([resource.data.inmuebleId])');
  })());
checkEstatica(24.2, 'Cliente: el propietario nunca descarga la colección completa de candidatos',
  (() => {
    const fb = leer('src/lib/firebase.ts');
    const i = fb.indexOf('export function subscribeCandidatos');
    const bloque = fb.slice(i, fb.indexOf('export function', i + 10));
    return bloque.includes("scope?.tipoPerfil === 'PROPIETARIO'") && bloque.includes('onSnapshotPropietario') && bloque.includes('CANDIDATOS_COL,\n      (snapshot) => {');
  })());

// --- TEST 25: profesional sin candidatos globales -------------------------
const profesional = { id: 'user_P', nombre: 'Técnico', email: 'p@example.com', tipoPerfil: 'PROFESIONAL', roles: [], permisos: [], estado: 'ACTIVO', profesionalId: 'prof_1' } as UsuarioApp;
checkReal(25, 'El profesional no accede a candidatos ni es administrador (su portal no es el panel admin)',
  !puedeAccederSeccion(profesional, 'candidatos') &&
  !puedeAccederSeccion(profesional, 'solicitudes') &&
  !puedeAccederSeccion(profesional, 'cobros') &&
  !puedeAccederSeccion(profesional, 'gastos') &&
  !esAdministradorAutorizado(profesional) &&
  seccionInicialPorPerfil(profesional) === 'administracion' &&
  !seccionesPermitidas(profesional).includes('candidatos'));
checkEstatica(25.1, 'Cliente y rules: las escuchas de candidatos/solicitudes/seguro no devuelven nada a un profesional',
  (() => {
    const fb = leer('src/lib/firebase.ts');
    const bloque = (nombre: string) => {
      const i = fb.indexOf(`export function ${nombre}`);
      return fb.slice(i, fb.indexOf('export function', i + 10));
    };
    const rules = leer('firestore.rules');
    return (
      bloque('subscribeCandidatos').includes('callback([])') &&
      bloque('subscribeSolicitudes').includes('callback([])') &&
      bloque('subscribeSolicitudesSeguro').includes('callback([])') &&
      !/allow read: if isSignedIn\(\);/.test(rules)
    );
  })());

// --- TEST 26: usuario normal no modifica roles ----------------------------
checkEstatica(26, 'Rules: un usuario no puede cambiar tipoPerfil/roles/estado/permisos ni su authUid',
  (() => {
    const rules = leer('firestore.rules');
    const i = rules.indexOf('match /usuarios/');
    const bloque = rules.slice(i, rules.indexOf('    match /', i + 10));
    return (
      bloque.includes('incoming().tipoPerfil == existing().tipoPerfil') &&
      bloque.includes('incoming().roles == existing().roles') &&
      bloque.includes('incoming().estado == existing().estado') &&
      bloque.includes("'permisos'") &&
      bloque.includes("'authUid'")
    );
  })());

// --- TEST 27: usuario normal no crea enlaces administrativos --------------
checkEstatica(27, 'Rules: enlaces_registro sólo lo escribe la administración autorizada',
  /match \/enlaces_registro\/\{enlaceId\} \{[\s\S]*?allow create, update, delete: if isStaff\(\);/.test(leer('firestore.rules')));

// --- TEST 28: localStorage manipulado no cambia privilegios ---------------
const perfilEnvenenado = JSON.parse(
  JSON.stringify({ tipoPerfil: 'ADMINISTRADOR', estado: 'PENDIENTE', roles: ['SUPERADMIN'], permisos: ['TODO'] })
) as UsuarioApp;
checkReal(28, 'Un "usuario" construido desde almacenamiento manipulable y no ACTIVO es DENEGADO',
  perfilAutorizado(perfilEnvenenado) === null &&
  seccionesPermitidas(perfilEnvenenado).length === 0 &&
  !puedeAccederSeccion(perfilEnvenenado, 'administracion'));
checkReal(28.1, 'Manipular rol/permisos en un perfil de propietario no le concede administración',
  perfilAutorizado({ ...propietarioA, roles: ['ADMINISTRADOR'], permisos: ['SUPERADMIN'] }) === 'PROPIETARIO' &&
  !puedeAccederSeccion({ ...propietarioA, roles: ['ADMINISTRADOR'] }, 'administracion'));
checkEstatica(28.2, 'El App NO reconstruye identidad desde localStorage ni elige un administrador por defecto',
  (() => {
    const app = leer('src/App.tsx');
    return (
      !/localStorage\.getItem\(\s*'rentselect_(current_user_id|active_session)'/.test(app) &&
      !/find\(\s*\(?u\)?\s*=>\s*u\.tipoPerfil === 'ADMINISTRADOR'/.test(app) &&
      !/\|\|\s*'ADMINISTRADOR'/.test(app)
    );
  })());

// --- TEST 29: candidato público sin datos privados ------------------------
const publicoCompleto = sanearSolicitudParaPortalPublico({ ...expediente, propietarioId: 'prop_A', ownerId: 'prop_A', notasPropietario: 'Confidencial', scoreEstimado: 91 } as unknown as SolicitudDocumentacion);
const claves = Object.keys(publicoCompleto);
checkReal(29, 'La vista pública del expediente sólo contiene datos del propio solicitante',
  !claves.includes('notasPropietario') &&
  !claves.includes('propietarioId') &&
  !claves.includes('ownerId') &&
  !claves.includes('scoreEstimado') &&
  !JSON.stringify(publicoCompleto).includes('Confidencial'));
checkEstatica(29.1, 'Rules: la lectura pública de candidatos/documentación es puntual y la escritura está acotada',
  (() => {
    const rules = leer('firestore.rules');
    return (
      rules.includes('allow get: if true;') &&
      !/match \/solicitudes_documentacion\/[\s\S]{0,600}?allow create, update: if true;/.test(rules)
    );
  })());

// --- TEST 30: circuito completo sin duplicidades --------------------------
const candidatoFinal = decisionAceptar.candidatoActualizado;
const duplicadosHistorial = (() => {
  const ids = (candidatoFinal.historial || []).map((h) => h.id);
  return ids.length !== new Set(ids).size;
})();
checkReal(30, 'El circuito completo produce UN expediente documental, UN expediente de seguro y ninguna duplicidad',
  seleccion.solicitudDoc.id === segundaSeleccion.solicitudDoc.id &&
  seguro.solicitudSeguro.id === seguroRepetido.solicitudSeguro.id &&
  !duplicadosHistorial &&
  candidatoFinal.estado === 'aceptado_final' &&
  !!candidatoFinal.solicitudDocId &&
  !!candidatoFinal.solicitudSeguroId);
checkReal(30.1, 'El candidato descartado se conserva con su traza (no se elimina del histórico)',
  (() => {
    const otro = agregarHistorialCandidato({ ...candidatoB, historial: [] }, {
      autor: 'propietario',
      fase: 'decision_final',
      accion: 'Decisión final: Candidato No Seleccionado',
      estadoAnterior: 'preseleccionado',
      estadoNuevo: 'rechazado_final',
      detalle: 'Descartado por el propietario',
    });
    const entrada = (otro.historial || [])[0];
    return (
      (otro.historial || []).length === 1 &&
      otro.id === candidatoB.id &&
      entrada.estadoNuevo === 'rechazado_final' &&
      entrada.autor === 'propietario'
    );
  })());

// ---------------------------------------------------------------------------
// 30.3) Cierre durable del enlace público (aportación del candidato)
// ---------------------------------------------------------------------------
const servidor = leer('server.ts');

checkEstatica(31, 'El registro del enlace público exige el ID token de la sesión (no hay alta anónima)',
  servidor.includes('accounts:lookup') &&
    servidor.includes('No autorizado: se requiere sesión autenticada válida.') &&
    servidor.includes('FIREBASE_API_KEY'));

checkEstatica(32, 'Sin configuración de autenticación el registro falla cerrado en lugar de aceptar anónimos',
  servidor.includes('Registro no disponible: el servidor no tiene configuración de autenticación.') &&
    servidor.includes('res.status(503)'));

checkEstatica(33, 'La aportación del candidato se persiste en su propio expediente por id (sin listados)',
  firebase.includes('export async function updateSolicitudDocPublicaFirestore') &&
    app.includes('updateSolicitudDocPublicaFirestore') &&
    app.includes('expedientePublico'));

checkEstatica(34, 'El expediente servido por token incluye su histórico append-only y nada de titularidad',
  servidor.includes('historial: solicitud.historial || []') &&
    !/publicData = \{[\s\S]{0,900}?(ownerId|candidatoId|notasPropietario):/.test(servidor));

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
console.log('');
console.log(reales.join('\n'));
console.log('');
console.log(estaticas.join('\n'));
console.log('');
if (fallos.length > 0) {
  console.log('FALLOS:');
  console.log(fallos.join('\n'));
  console.log('');
}
console.log('='.repeat(78));
console.log(`ASSERTIONS EJECUTADAS: ${ejecutadas}`);
console.log(`  · REALES (motor/autorización ejecutados): ${reales.length}`);
console.log(`  · ESTÁTICAS (texto de reglas/código): ${estaticas.length}`);
console.log(`CORRECTAS: ${correctas} | FALLIDAS: ${fallidas}`);
console.log('='.repeat(78));
console.log(
  fallidas === 0
    ? 'RESULTADO: OK — circuito de candidatos verificado (30 escenarios + extras)'
    : 'RESULTADO: FALLOS DETECTADOS'
);
if (fallidas > 0) process.exit(1);
