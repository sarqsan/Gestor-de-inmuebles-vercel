/**
 * INC-06 — Persistencia de fichas patrimoniales y ejecución controlada de
 * importaciones. Tests del NÚCLEO PURO + orquestación sobre puertos dobles
 * (sin Firebase real: las escrituras reales solo ocurren en la app; aquí se
 * verifica el contrato con dobles fieles, incluida la creación estricta que
 * lanza si el documento ya existe).
 *
 * Cobertura exigida por el bloque:
 *  · Identidad: propietario sin cuenta / con cuenta / invitado / activo /
 *    gestor profesional sin propiedades / gestor-propietario.
 *  · Autorización: destino permitido vs no permitido, re-verificación en la
 *    ejecución, lectura histórica ≠ escritura (aquí a nivel de planificación;
 *    las reglas se prueban en seguridad-firestore-patrimonial.test.ts).
 *  · Importación: destinos AUSENTE/NO_ENCONTRADO/AMBIGUO/VALIDO, datos
 *    completos/incompletos/bloqueados, duplicado de origen, origen conservado,
 *    preview sin escrituras, confirmación con escrituras, error parcial
 *    controlado, reejecución determinista/idempotente, colisión sin
 *    sobrescritura.
 *  · Auditoría: operación registrada, actor, propietario, origen, resultado e
 *    incidencias conservadas; fallo de auditoría degrada el resultado.
 */
import { describe, expect, it } from 'vitest';
import {
  aplicarCambiosParciales,
  componerActualizacionFichaPatrimonial,
  componerFichaPatrimonial,
  crearFichaPatrimonial,
  estadoAccesoDesdeVinculo,
  ejecutarImportacionPatrimonial,
  evaluarFichaPatrimonial,
  idDeterministaLote,
  idDeterministaRegistro,
  jsonEstable,
  obtenerFichaPatrimonial,
  actualizarFichaPatrimonial,
  COLECCION_PROPIETARIOS,
  COLECCION_REGISTROS_PATRIMONIALES,
  type ActorPatrimonial,
  type DependenciasPatrimoniales,
  type EntradaAuditoriaPatrimonial,
  type PuertoAuditoria,
  type PuertoDocumentos,
  type VinculoCuenta,
} from '../src/lib/patrimonialPersistencia';
import { contextoDestinoDesdeAmbito, encajarModalidadEnD1R } from '../src/lib/patrimonialIntegracion';
import { previsualizarImportacion, type ContextoPrevisualizacion, type DatosOrigenImportacion, type ReglasRevisionDatos } from '../src/features/patrimonial';

// ---------------------------------------------------------------------------
// Dobles fieles de los puertos
// ---------------------------------------------------------------------------

function crearDobles() {
  const docs = new Map<string, Record<string, unknown>>();
  const auditoria: EntradaAuditoriaPatrimonial[] = [];
  const fallos = { escrituras: false, auditoria: false, escrituraNumero: null as number | null };
  let llamadasEscritura = 0;
  const documentos: PuertoDocumentos = {
    async obtenerDocumento(coleccion, id) {
      const v = docs.get(`${coleccion}/${id}`);
      return v ? structuredClone(v) : null;
    },
    async escribirDocumento(coleccion, id, datos) {
      llamadasEscritura++;
      if (fallos.escrituras) throw new Error('escritura simulada fallida');
      if (fallos.escrituraNumero === llamadasEscritura) throw new Error('escritura fallida selectiva');
      const clave = `${coleccion}/${id}`;
      if (docs.has(clave)) throw new Error(`ya existe ${clave}`); // creación estricta
      docs.set(clave, structuredClone(datos));
    },
    async fusionarDocumento(coleccion, id, datos) {
      const clave = `${coleccion}/${id}`;
      docs.set(clave, { ...(docs.get(clave) ?? {}), ...structuredClone(datos) });
    },
  };
  const puertoAuditoria: PuertoAuditoria = {
    async registrar(entrada) {
      if (fallos.auditoria) throw new Error('auditoría caída');
      auditoria.push(structuredClone(entrada));
    },
  };
  const deps: DependenciasPatrimoniales = { documentos, auditoria: puertoAuditoria };
  return { docs, auditoria, deps, fallos };
}

const ACTOR: ActorPatrimonial = { usuarioId: 'usr_master', email: 'master@test.local', nombre: 'Master' };
const AHORA = '2026-09-26T10:00:00.000Z';
const POLITICA: ReglasRevisionDatos = {
  politica: { id: 'test-base-v1', camposRequeridos: ['nombre', 'nifCif'] },
};
const SIN_CUENTA: VinculoCuenta = { cuentaId: null, cuentaActiva: false, invitacionPendiente: false };

function propietarioDoc(id: string, extra: Record<string, unknown> = {}) {
  return { id, nombre: 'Titular Ejemplo', nifCif: '12345678A', email: 't@example.com', telefono: '', ...extra };
}

// ---------------------------------------------------------------------------
// 1. IDENTIDAD
// ---------------------------------------------------------------------------

describe('INC-06 · Identidad: el acceso nunca se deriva de la modalidad ni del actor', () => {
  it('propietario sin cuenta → SIN_CUENTA', () => {
    expect(estadoAccesoDesdeVinculo(SIN_CUENTA)).toBe('SIN_CUENTA');
  });

  it('propietario invitado (sin cuenta todavía) → INVITADO', () => {
    expect(estadoAccesoDesdeVinculo({ ...SIN_CUENTA, invitacionPendiente: true })).toBe('INVITADO');
  });

  it('propietario con cuenta activa → ACTIVO; cuenta inactiva no es ACTIVO', () => {
    expect(estadoAccesoDesdeVinculo({ cuentaId: 'uid_1', cuentaActiva: true, invitacionPendiente: false })).toBe('ACTIVO');
    expect(estadoAccesoDesdeVinculo({ cuentaId: 'uid_1', cuentaActiva: false, invitacionPendiente: false })).toBe('SIN_CUENTA');
  });

  it('gestor profesional sin propiedades propias: modalidad ≠ acceso', () => {
    const encaje = encajarModalidadEnD1R('GESTOR_PROFESIONAL');
    expect(encaje.tipoGestor).toBe('GESTOR_PROFESIONAL');
    const { ficha } = componerFichaPatrimonial({
      modalidad: 'GESTOR_PROFESIONAL', vinculo: SIN_CUENTA,
      datos: { nombre: 'Gestión SL', nifCif: 'B999', email: '', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: null, fuente: null, loteId: null },
      ahora: AHORA, actorUsuarioId: ACTOR.usuarioId,
    });
    expect(ficha.estadoAcceso).toBe('SIN_CUENTA'); // sin cuenta, sin acceso
    expect(encaje.requiereCuentaParaAcceso).toBe(true);
  });

  it('gestor-propietario con propiedades: encaja como PROPIETARIO_GESTOR', () => {
    expect(encajarModalidadEnD1R('GESTOR_PROPIETARIO').tipoGestor).toBe('PROPIETARIO_GESTOR');
  });

  it('crear ficha sobre propietario existente: SIN_CUENTA por defecto (S3)', async () => {
    const { docs, deps, auditoria } = crearDobles();
    docs.set(`${COLECCION_PROPIETARIOS}/prop_1`, propietarioDoc('prop_1'));
    const r = await crearFichaPatrimonial(deps, {
      propietarioId: 'prop_1', modalidad: 'PROPIETARIO', vinculo: SIN_CUENTA,
      datos: { nombre: 'Titular Ejemplo', nifCif: '12345678A', email: 't@example.com', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: null, fuente: 'alta', loteId: null },
      actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('OK');
    if (r.estado !== 'OK') return;
    expect(r.ficha.estadoAcceso).toBe('SIN_CUENTA');
    expect(r.ficha.estadoDatos).toBe('COMPLETO');
    expect(auditoria[0].accion).toBe('FICHA_PATRIMONIAL_CREADA');
    expect(auditoria[0].usuarioId).toBe('usr_master');
  });
});

// ---------------------------------------------------------------------------
// 2. SERVICIOS DE FICHA (sin sobrescritura silenciosa, semántica explícita)
// ---------------------------------------------------------------------------

describe('INC-06 · Ficha patrimonial persistente', () => {
  it('no crea propietarios: propietario inexistente → PROPIETARIO_NO_ENCONTRADO y cero escrituras', async () => {
    const { docs, deps } = crearDobles();
    const r = await crearFichaPatrimonial(deps, {
      propietarioId: 'prop_ghost', modalidad: 'PROPIETARIO', vinculo: SIN_CUENTA,
      datos: { nombre: 'X', nifCif: '', email: '', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: null, fuente: null, loteId: null },
      actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('PROPIETARIO_NO_ENCONTRADO');
    expect(docs.size).toBe(0);
  });

  it('ficha duplicada → FICHA_YA_EXISTE (actualización explícita, no sobrescritura)', async () => {
    const { docs, deps } = crearDobles();
    docs.set(`${COLECCION_PROPIETARIOS}/prop_1`, propietarioDoc('prop_1'));
    const base = {
      propietarioId: 'prop_1', modalidad: 'PROPIETARIO' as const, vinculo: SIN_CUENTA,
      datos: { nombre: 'Titular Ejemplo', nifCif: '12345678A', email: 't@example.com', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: null, fuente: null, loteId: null },
      actor: ACTOR, ahora: AHORA,
    };
    expect((await crearFichaPatrimonial(deps, base)).estado).toBe('OK');
    expect((await crearFichaPatrimonial(deps, base)).estado).toBe('FICHA_YA_EXISTE');
  });

  it('actualización parcial explícita: solo cambian los campos suministrados y recalcula estadoDatos', async () => {
    const { docs, deps, auditoria } = crearDobles();
    docs.set(`${COLECCION_PROPIETARIOS}/prop_1`, propietarioDoc('prop_1', { nifCif: '' }));
    await crearFichaPatrimonial(deps, {
      propietarioId: 'prop_1', modalidad: 'PROPIETARIO', vinculo: SIN_CUENTA,
      datos: { nombre: 'Titular Ejemplo', nifCif: '', email: 't@example.com', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: null, fuente: null, loteId: null },
      actor: ACTOR, ahora: AHORA,
    });
    const lectura0 = await obtenerFichaPatrimonial(deps, 'prop_1');
    expect(lectura0.estado).toBe('OK');
    if (lectura0.estado !== 'OK') return;
    expect(lectura0.ficha?.estadoDatos).toBe('INCOMPLETO');
    expect(lectura0.ficha?.camposFaltantes).toEqual(['nifCif']);

    const r = await actualizarFichaPatrimonial(deps, {
      propietarioId: 'prop_1', cambios: { nifCif: '12345678A' }, reglas: POLITICA,
      actor: ACTOR, ahora: '2026-09-26T11:00:00.000Z',
    });
    expect(r.estado).toBe('OK');
    if (r.estado !== 'OK') return;
    expect(r.ficha.estadoDatos).toBe('COMPLETO');
    expect(r.ficha.camposFaltantes).toEqual([]);
    expect(r.ficha.creadaEn).toBe(AHORA); // procedencia temporal conservada
    const doc = docs.get(`${COLECCION_PROPIETARIOS}/prop_1`)!;
    expect(doc.nombre).toBe('Titular Ejemplo'); // intacto: solo se fusionó nifCif+ficha
    expect(doc.nifCif).toBe('12345678A');
    const audit = auditoria[auditoria.length - 1];
    expect(audit.accion).toBe('FICHA_PATRIMONIAL_ACTUALIZADA');
    expect(audit.detalles.camposCambiados).toEqual(['nifCif']);
    expect(audit.entidadAfectada).toBe('propietario');
    expect(audit.idAfectado).toBe('prop_1');
  });

  it('sin vinculo explícito el estadoAcceso NO cambia; con vinculo, sí', async () => {
    const { docs, deps } = crearDobles();
    docs.set(`${COLECCION_PROPIETARIOS}/prop_1`, propietarioDoc('prop_1'));
    await crearFichaPatrimonial(deps, {
      propietarioId: 'prop_1', modalidad: 'PROPIETARIO', vinculo: SIN_CUENTA,
      datos: { nombre: 'Titular Ejemplo', nifCif: '12345678A', email: '', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: null, fuente: null, loteId: null },
      actor: ACTOR, ahora: AHORA,
    });
    const sinVinculo = await actualizarFichaPatrimonial(deps, {
      propietarioId: 'prop_1', cambios: { telefono: '600000000' }, reglas: POLITICA, actor: ACTOR, ahora: AHORA,
    });
    expect(sinVinculo.estado === 'OK' && sinVinculo.ficha.estadoAcceso).toBe('SIN_CUENTA');
    const conVinculo = await actualizarFichaPatrimonial(deps, {
      propietarioId: 'prop_1', reglas: POLITICA, actor: ACTOR, ahora: AHORA,
      vinculo: { cuentaId: 'uid_9', cuentaActiva: true, invitacionPendiente: false },
    });
    expect(conVinculo.estado === 'OK' && conVinculo.ficha.estadoAcceso).toBe('ACTIVO');
  });

  it('bloqueo externo → estadoDatos BLOQUEADO en la ficha', () => {
    const { ficha, evaluacion } = componerFichaPatrimonial({
      modalidad: 'PROPIETARIO', vinculo: SIN_CUENTA,
      datos: { nombre: 'A', nifCif: 'B', email: '', telefono: '' },
      reglas: { ...POLITICA, bloqueos: [{ codigo: 'RETENCION', mensaje: 'Retención fiscal pendiente' }] },
      procedencia: { sistema: 'ERP', origenId: null, fuente: null, loteId: null },
      ahora: AHORA, actorUsuarioId: ACTOR.usuarioId,
    });
    expect(ficha.estadoDatos).toBe('BLOQUEADO');
    expect(evaluacion.incidencias.some((i) => i.codigo === 'RETENCION' && i.nivel === 'BLOQUEO')).toBe(true);
  });

  it('actualizar sin ficha creada → FICHA_NO_EXISTE; evaluar no escribe', async () => {
    const { docs, deps } = crearDobles();
    docs.set(`${COLECCION_PROPIETARIOS}/prop_1`, propietarioDoc('prop_1'));
    const r = await actualizarFichaPatrimonial(deps, {
      propietarioId: 'prop_1', cambios: { nombre: 'Otro' }, reglas: POLITICA, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('FICHA_NO_EXISTE');
    const { ficha } = componerFichaPatrimonial({
      modalidad: 'PROPIETARIO', vinculo: SIN_CUENTA,
      datos: { nombre: 'A', nifCif: 'B', email: '', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: null, fuente: null, loteId: null },
      ahora: AHORA, actorUsuarioId: ACTOR.usuarioId,
    });
    const evaluacion = evaluarFichaPatrimonial(ficha, { nombre: 'A', nifCif: '', email: '', telefono: '' }, POLITICA);
    expect(evaluacion.estadoDatos).toBe('INCOMPLETO'); // evaluación separada de escritura
  });

  it('aplicarCambiosParciales: solo claves presentes', () => {
    const base = { nombre: 'A', nifCif: 'B', email: 'C', telefono: 'D' };
    expect(aplicarCambiosParciales(base, { email: 'Z' })).toEqual({ nombre: 'A', nifCif: 'B', email: 'Z', telefono: 'D' });
  });

  it('componerActualizacion conserva creadaEn/procedencia/version', () => {
    const { ficha } = componerFichaPatrimonial({
      modalidad: 'PROPIETARIO', vinculo: SIN_CUENTA,
      datos: { nombre: 'A', nifCif: 'B', email: '', telefono: '' },
      reglas: POLITICA, procedencia: { sistema: 'ERP', origenId: 'o1', fuente: 'f', loteId: null },
      ahora: AHORA, actorUsuarioId: ACTOR.usuarioId,
    });
    const { ficha: f2 } = componerActualizacionFichaPatrimonial({
      existente: ficha, datos: { nombre: 'A2', nifCif: 'B', email: '', telefono: '' },
      reglas: POLITICA, ahora: '2026-09-27T00:00:00.000Z', actorUsuarioId: 'usr_2',
    });
    expect(f2.creadaEn).toBe(AHORA);
    expect(f2.procedencia.origenId).toBe('o1');
    expect(f2.version).toBe(ficha.version);
    expect(f2.actualizadaPor).toBe('usr_2');
  });
});

// ---------------------------------------------------------------------------
// 3. AUTORIZACIÓN Y DESTINO EXPLÍCITO
// ---------------------------------------------------------------------------

const CONTEXTO_BASE = contextoDestinoDesdeAmbito(
  [{ id: 'prop_1', nombre: 'Uno' }, { id: 'prop_2', nombre: 'Dos' }],
  { propietarioId: 'prop_1', propietariosGestionados: ['prop_2'] },
);

function previewPara(datos: readonly DatosOrigenImportacion[], destinoId: string | null, contexto = CONTEXTO_BASE) {
  const ctx: ContextoPrevisualizacion = {
    ...contexto,
    reglasPorRegistro: datos.map(() => POLITICA),
  };
  return previsualizarImportacion({ datosOrigen: datos, propietarioDestinoId: destinoId }, ctx);
}

describe('INC-06 · Autorización: destino explícito obligatorio y re-verificado', () => {
  it('destino AUSENTE → NO_EJECUTADO sin escrituras (audita el rechazo)', async () => {
    const { docs, deps, auditoria } = crearDobles();
    const preview = previewPara([{ nombre: 'R', nifCif: 'N' }], 'prop_1');
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: '',
      origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('NO_EJECUTADO');
    expect(r.incidencias.some((i) => i.codigo === 'DESTINO_AUSENTE')).toBe(true);
    expect(docs.size).toBe(0);
    expect(auditoria[0].accion).toBe('IMPORTACION_PATRIMONIAL_RECHAZADA');
  });

  it('destino NO_ENCONTRADO → NO_EJECUTADO', async () => {
    const { docs, deps } = crearDobles();
    const preview = previewPara([{ nombre: 'R', nifCif: 'N' }], 'prop_1');
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: 'prop_1',
      origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('OK'); // prop_1 sí existe y está permitido
    expect(docs.size).toBeGreaterThan(0);
    const r2 = await ejecutarImportacionPatrimonial(crearDobles().deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: 'prop_inventado',
      origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r2.estado).toBe('NO_EJECUTADO');
    expect(r2.incidencias.some((i) => i.codigo === 'DESTINO_NO_ENCONTRADO' || i.codigo === 'PREVIEW_INCONSISTENTE')).toBe(true);
  });

  it('destino NO_PERMITIDO (existe pero fuera de ámbito) → NO_EJECUTADO', async () => {
    const { docs, deps } = crearDobles();
    const contexto = contextoDestinoDesdeAmbito(
      [{ id: 'prop_1', nombre: 'Uno' }, { id: 'prop_ajeno', nombre: 'Ajeno' }],
      { propietarioId: 'prop_1' }, // prop_ajeno NO está en ámbito
    );
    const preview = previsualizarImportacion(
      { datosOrigen: [{ nombre: 'R', nifCif: 'N' }], propietarioDestinoId: 'prop_ajeno' },
      { ...contexto, reglasPorRegistro: [POLITICA] },
    );
    expect(preview.destino.estado).toBe('NO_PERMITIDO');
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto, previsualizacion: preview, propietarioDestinoId: 'prop_ajeno',
      origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('NO_EJECUTADO');
    expect(docs.size).toBe(0);
  });

  it('destino AMBIGUO (ids duplicados en el contexto) → NO_EJECUTADO', async () => {
    const { docs, deps } = crearDobles();
    const contexto = contextoDestinoDesdeAmbito(
      [{ id: 'prop_1', nombre: 'Uno' }, { id: 'prop_1', nombre: 'Uno duplicado' }],
      { propietarioId: 'prop_1' },
    );
    const preview = previsualizarImportacion(
      { datosOrigen: [{ nombre: 'R', nifCif: 'N' }], propietarioDestinoId: 'prop_1' },
      { ...contexto, reglasPorRegistro: [POLITICA] },
    );
    expect(preview.destino.estado).toBe('AMBIGUO');
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto, previsualizacion: preview, propietarioDestinoId: 'prop_1',
      origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('NO_EJECUTADO');
    expect(docs.size).toBe(0);
  });

  it('preview inconsistente con el destino indicado → NO_EJECUTADO + PREVIEW_INCONSISTENTE', async () => {
    const { docs, deps } = crearDobles();
    const preview = previewPara([{ nombre: 'R', nifCif: 'N' }], 'prop_1');
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: 'prop_2',
      origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('NO_EJECUTADO');
    expect(r.incidencias.some((i) => i.codigo === 'PREVIEW_INCONSISTENTE')).toBe(true);
    expect(docs.size).toBe(0);
  });

  it('contexto sin ámbito: ningún destino es planificable (sin autoasignación)', () => {
    const vacio = contextoDestinoDesdeAmbito([{ id: 'prop_1', nombre: 'Uno' }], {});
    expect(vacio.propietariosPermitidosIds).toEqual([]);
    const preview = previsualizarImportacion(
      { datosOrigen: [{ nombre: 'R' }], propietarioDestinoId: 'prop_1' },
      { ...vacio, reglasPorRegistro: [POLITICA] },
    );
    expect(preview.destino.estado).toBe('NO_PERMITIDO');
  });
});

// ---------------------------------------------------------------------------
// 4. IMPORTACIÓN: preview sin escrituras, ejecución controlada
// ---------------------------------------------------------------------------

describe('INC-06 · Ejecución controlada de importaciones', () => {
  const DATOS: readonly DatosOrigenImportacion[] = [
    { nombre: 'Piso Completo', nifCif: 'N1' },            // COMPLETO → CREARIA
    { nombre: 'Local Sin Nif' },                          // INCOMPLETO → REVISAR
    { nombre: 'Bloqueado', nifCif: 'N3' },                // BLOQUEADO por regla externa
  ];

  function contextoConBloqueo() {
    const ctx: ContextoPrevisualizacion = {
      ...CONTEXTO_BASE,
      reglasPorRegistro: [
        POLITICA,
        POLITICA,
        { ...POLITICA, bloqueos: [{ codigo: 'RETENCION_FISCAL', mensaje: 'Retención pendiente' }] },
      ],
    };
    return previsualizarImportacion({ datosOrigen: DATOS, propietarioDestinoId: 'prop_1' }, ctx);
  }

  it('la previsualización es DRY-RUN: cero escrituras en los puertos', async () => {
    const { docs } = crearDobles();
    const preview = contextoConBloqueo();
    expect(preview.soloLectura).toBe(true);
    expect(preview.registrosQueSeCrearian.length).toBe(1);
    expect(preview.registrosBloqueados.length).toBe(1);
    expect(docs.size).toBe(0);
  });

  it('ejecución válida: crea COMPLETO e INCOMPLETO (marcado), omite BLOQUEADO, conserva origen e incidencias', async () => {
    const { docs, deps, auditoria } = creadoConPropietarios();
    const preview = contextoConBloqueo();
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: 'prop_1',
      origen: { sistema: 'RENTASYNC', fuente: 'pegado_test', origenIdPorRegistro: ['p_ext_1', 'p_ext_2', 'p_ext_3'] },
      actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('OK');
    expect(r.creados).toBe(2);
    expect(r.bloqueados).toBe(1);
    expect(r.errores).toBe(0);
    expect(r.auditoriaRegistrada).toBe(true);
    const registros = [...docs.entries()].filter(([k]) => k.startsWith(`${COLECCION_REGISTROS_PATRIMONIALES}/`));
    expect(registros.length).toBe(2);
    const incompleto = registros.find(([, v]) => v.estadoDatos === 'INCOMPLETO')![1];
    expect(incompleto.camposFaltantes).toEqual(['nifCif']);
    expect(incompleto.decision).toBe('REVISAR');
    const completo = registros.find(([, v]) => v.estadoDatos === 'COMPLETO')![1];
    expect(completo.procedencia).toMatchObject({ sistema: 'RENTASYNC', origenId: 'p_ext_1', fuente: 'pegado_test', loteId: r.loteId });
    expect(completo.propietarioId).toBe('prop_1');
    expect(completo.creadaPor).toBe('usr_master');
    expect(completo.datosOrigen).toEqual({ nombre: 'Piso Completo', nifCif: 'N1' });
    // El BLOQUEADO viaja como incidencia, no como éxito silencioso.
    expect(r.incidencias.some((i) => i.codigo === 'RETENCION_FISCAL' && i.indiceOrigen === 2)).toBe(true);
    const audit = auditoria[auditoria.length - 1];
    expect(audit.accion).toBe('IMPORTACION_PATRIMONIAL_EJECUTADA');
    expect(audit.idAfectado).toBe(r.loteId);
    expect(audit.detalles).toMatchObject({
      propietarioDestinoId: 'prop_1', sistema: 'RENTASYNC', fuente: 'pegado_test',
      creados: 2, bloqueados: 1, estado: 'OK',
    });
    expect(audit.resultado).toBe('EXITO');
  });

  it('duplicado de origen en el mismo lote: el segundo es SIN_CAMBIOS (mismo id determinista)', async () => {
    const { deps } = creadoConPropietarios();
    const datos = [{ nombre: 'Duplicado', nifCif: 'N' }, { nombre: 'Duplicado', nifCif: 'N' }];
    const preview = previewPara(datos, 'prop_1');
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: 'prop_1',
      origen: { sistema: 'TEST', origenIdPorRegistro: ['mismo_id', 'mismo_id'] },
      actor: ACTOR, ahora: AHORA,
    });
    expect(r.creados).toBe(1);
    expect(r.sinCambios).toBe(1);
    expect(r.estado).toBe('OK');
  });

  it('reejecución determinista/idempotente: mismo loteId, cero escrituras nuevas', async () => {
    const { docs, deps } = creadoConPropietarios();
    const p = {
      contexto: CONTEXTO_BASE,
      previsualizacion: previewPara([{ nombre: 'Reejecuta', nifCif: 'N' }], 'prop_1'),
      propietarioDestinoId: 'prop_1',
      origen: { sistema: 'TEST', origenIdPorRegistro: ['id_1'] },
      actor: ACTOR, ahora: AHORA,
    };
    const r1 = await ejecutarImportacionPatrimonial(deps, p);
    const tamano = docs.size;
    const r2 = await ejecutarImportacionPatrimonial(deps, { ...p, ahora: '2026-09-27T00:00:00.000Z' });
    expect(r2.loteId).toBe(r1.loteId);
    expect(r2.estado).toBe('SIN_CAMBIOS');
    expect(r2.creados).toBe(0);
    expect(docs.size).toBe(tamano);
  });

  it('colisión: mismo id determinista con contenido distinto → incidencia y SIN sobrescritura (PARCIAL)', async () => {
    const { docs, deps } = creadoConPropietarios();
    const r1 = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: previewPara([{ nombre: 'Version 1', nifCif: 'N' }], 'prop_1'),
      propietarioDestinoId: 'prop_1', origen: { sistema: 'TEST', origenIdPorRegistro: ['id_col'] },
      actor: ACTOR, ahora: AHORA,
    });
    expect(r1.estado).toBe('OK');
    const r2 = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: previewPara([{ nombre: 'Version 2 DISTINTA', nifCif: 'N' }], 'prop_1'),
      propietarioDestinoId: 'prop_1', origen: { sistema: 'TEST', origenIdPorRegistro: ['id_col'] },
      actor: ACTOR, ahora: AHORA,
    });
    expect(r2.estado).toBe('ERROR'); // nada creado ni reutilizable + colisión
    expect(r2.colisiones).toBe(1);
    expect(r2.incidencias.some((i) => i.codigo === 'COLISION_ORIGEN')).toBe(true);
    const guardado = [...docs.values()].find((v) => v.procedencia && (v.procedencia as { origenId: string }).origenId === 'id_col')!;
    expect((guardado.datosOrigen as { nombre: string }).nombre).toBe('Version 1'); // intacto
  });

  it('error parcial controlado: un fallo de escritura degrada a PARCIAL y se registra', async () => {
    const dobles = creadoConPropietarios();
    dobles.fallos.escrituraNumero = 2; // falla la segunda creación
    const preview = previewPara([{ nombre: 'A', nifCif: '1' }, { nombre: 'B', nifCif: '2' }], 'prop_1');
    const r = await ejecutarImportacionPatrimonial(dobles.deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: 'prop_1',
      origen: { sistema: 'TEST', origenIdPorRegistro: ['a', 'b'] }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('PARCIAL');
    expect(r.creados).toBe(1);
    expect(r.errores).toBe(1);
    expect(r.incidencias.some((i) => i.codigo === 'ESCRITURA_FALLIDA')).toBe(true);
    const audit = dobles.auditoria[dobles.auditoria.length - 1];
    expect(audit.detalles).toMatchObject({ estado: 'PARCIAL', creados: 1, errores: 1 });
  });

  it('auditoría caída: los datos escritos fuerzan PARCIAL + AUDITORIA_FALLIDA (nunca éxito silencioso)', async () => {
    const dobles = creadoConPropietarios();
    dobles.fallos.auditoria = true;
    const r = await ejecutarImportacionPatrimonial(dobles.deps, {
      contexto: CONTEXTO_BASE, previsualizacion: previewPara([{ nombre: 'A', nifCif: '1' }], 'prop_1'),
      propietarioDestinoId: 'prop_1', origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('PARCIAL');
    expect(r.auditoriaRegistrada).toBe(false);
    expect(r.incidencias.some((i) => i.codigo === 'AUDITORIA_FALLIDA')).toBe(true);
  });

  it('origen vacío → NO_EJECUTADO + ORIGEN_VACIO', async () => {
    const { docs, deps } = creadoConPropietarios();
    const preview = previewPara([], 'prop_1');
    const r = await ejecutarImportacionPatrimonial(deps, {
      contexto: CONTEXTO_BASE, previsualizacion: preview, propietarioDestinoId: 'prop_1',
      origen: { sistema: 'TEST' }, actor: ACTOR, ahora: AHORA,
    });
    expect(r.estado).toBe('NO_EJECUTADO');
    expect(r.incidencias.some((i) => i.codigo === 'ORIGEN_VACIO')).toBe(true);
    expect([...docs.keys()].some((k) => k.startsWith(`${COLECCION_REGISTROS_PATRIMONIALES}/`))).toBe(false);
  });

  it('ids deterministas: estables ante el orden de claves y sensibles al contenido/destino', async () => {
    const a = await idDeterministaRegistro({ sistema: 'S', origenId: null, datosOrigen: { x: 1, y: 'z' }, propietarioDestinoId: 'p' });
    const b = await idDeterministaRegistro({ sistema: 'S', origenId: null, datosOrigen: { y: 'z', x: 1 }, propietarioDestinoId: 'p' });
    const c = await idDeterministaRegistro({ sistema: 'S', origenId: null, datosOrigen: { x: 2, y: 'z' }, propietarioDestinoId: 'p' });
    const d = await idDeterministaRegistro({ sistema: 'S', origenId: null, datosOrigen: { x: 1, y: 'z' }, propietarioDestinoId: 'otro' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    const l1 = await idDeterministaLote({ sistema: 'S', fuente: null, propietarioDestinoId: 'p', datosOrigen: [{ x: 1 }] });
    const l2 = await idDeterministaLote({ sistema: 'S', fuente: null, propietarioDestinoId: 'p', datosOrigen: [{ x: 1 }] });
    expect(l1).toBe(l2);
    expect(jsonEstable({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

function creadoConPropietarios() {
  const dobles = crearDobles();
  dobles.docs.set(`${COLECCION_PROPIETARIOS}/prop_1`, propietarioDoc('prop_1'));
  dobles.docs.set(`${COLECCION_PROPIETARIOS}/prop_2`, propietarioDoc('prop_2'));
  return dobles;
}
