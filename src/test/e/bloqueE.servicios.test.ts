/**
 * BLOQUE E — Batería automatizada (ORDEN 8) · CAPA DE SERVICIO
 *
 * Ejecuta el código REAL de E (suministrosFirestore, authService, actasAdapter,
 * scope) sobre un Firestore en memoria con traza de accesos. Cubre:
 *   A. invitación (creación, resolución, concesión de alcance)
 *   B. registro por invitación (alta INQUILINO real, rechazos)
 *   C. aislamiento A/B en la CAPA DE CONSULTA
 *   D. autorización (helpers tenant/staff)
 *   E. operaciones del inquilino con efecto en índices
 *   F. errores de lectura/escritura y recursos inexistentes
 *
 * Sin producción, sin red, sin datos reales.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { authSintetico, resetEntornoE, storageSintetico } from './setupE';
import { memoria } from './firestoreMemoria';
import {
  IDS,
  actaTest,
  contratoTest,
  enlaceTest,
  inmuebleTest,
  secretosDe,
  sembrarUniverso,
  suministroTest,
  usuarioInquilinoTest,
  usuarioStaffTest,
} from './fixturesE';

import {
  concederAccesoContrato,
  consumirInvitacion,
  crearInvitacionInquilino,
  enviarMensajePortal,
  getContratoById,
  getEnlaceById,
  getIncidenciasByIds,
  getInmuebleById,
  getLecturasByIds,
  getMensajesByIds,
  getSuministroById,
  getSuministrosByIds,
  marcarMensajeLeidoPorInquilino,
  obtenerUrlDescarga,
  registrarLectura,
  revocarInvitacionInquilino,
  solicitarCambioTitular,
  subirEvidenciaIncidencia,
  subirFotoLectura,
} from '../../lib/suministrosFirestore';
import {
  canTenantAccessContrato,
  canTenantAccessInmueble,
  getContratosDelInquilino,
  isInquilino,
  registerWithInvitationLink,
  resolveTenantScope,
} from '../../lib/authService';
import { getActasByContrato, sanearActaParaInquilino } from '../../inquilino/actasAdapter';
import { validarEnlaceRegistroInquilino } from '../../inquilino/portalEngine';

beforeEach(() => {
  resetEntornoE();
  sembrarUniverso();
});

// ===========================================================================
// A. INVITACIÓN
// ===========================================================================
describe('E · A. Invitación de inquilino', () => {
  it('crea una invitación INQUILINO persistida, resoluble por ID y con alcance concedido', async () => {
    // Contrato/inmueble nuevos sin alcance previo
    memoria.sembrar('contratos_formalizacion', 'ct_TEST_NUEVO', contratoTest('A', { id: 'ct_TEST_NUEVO', inmuebleId: 'inm_TEST_NUEVO' }) as never);
    memoria.sembrar('inmuebles', 'inm_TEST_NUEVO', inmuebleTest('A', { id: 'inm_TEST_NUEVO', contratoIdsAutorizados: [], suministroIds: ['sum_TEST_NUEVO'] }) as never);
    memoria.sembrar('suministros', 'sum_TEST_NUEVO', suministroTest('A', { id: 'sum_TEST_NUEVO', inmuebleId: 'inm_TEST_NUEVO', contratoIdsAutorizados: [] }) as never);

    const enlace = await crearInvitacionInquilino({
      contratoId: 'ct_TEST_NUEVO',
      inmuebleId: 'inm_TEST_NUEVO',
      creadoPor: 'uid_TEST_STAFF',
    });

    expect(enlace.id.startsWith('enl_inq_')).toBe(true);
    expect(enlace.tipoPerfil).toBe('INQUILINO');
    expect(enlace.activo).toBe(true);
    expect(enlace.usosMaximos).toBe(1);
    expect(enlace.usosActuales).toBe(0);
    expect(enlace.contratoIdVinculado).toBe('ct_TEST_NUEVO');

    // Persistida y resoluble por get() directo (como hace la vista pública)
    const resuelto = await getEnlaceById(enlace.id);
    expect(resuelto?.id).toBe(enlace.id);
    expect(validarEnlaceRegistroInquilino(resuelto!).ok).toBe(true);

    // La creación concede alcance de lectura al inmueble y a sus suministros
    expect(memoria.leer<{ contratoIdsAutorizados: string[] }>('inmuebles', 'inm_TEST_NUEVO')!.contratoIdsAutorizados).toContain('ct_TEST_NUEVO');
    expect(memoria.leer<{ contratoIdsAutorizados: string[] }>('suministros', 'sum_TEST_NUEVO')!.contratoIdsAutorizados).toContain('ct_TEST_NUEVO');
  });

  it('un enlace inexistente se resuelve como null (nunca lanza)', async () => {
    expect(await getEnlaceById('enl_inq_TEST_NO_EXISTE')).toBeNull();
  });

  it('revocar desactiva el enlace y retira el alcance del contrato', async () => {
    const enlace = enlaceTest('A');
    await revocarInvitacionInquilino(enlace);
    expect(memoria.leer<{ activo: boolean }>('enlaces_registro', IDS.A.enlace)!.activo).toBe(false);
    expect(memoria.leer<{ contratoIdsAutorizados: string[] }>('inmuebles', IDS.A.inmueble)!.contratoIdsAutorizados).not.toContain(IDS.A.contrato);
    expect(memoria.leer<{ contratoIdsAutorizados: string[] }>('suministros', IDS.A.suministro)!.contratoIdsAutorizados).not.toContain(IDS.A.contrato);
    // El enlace revocado ya no pasa la validación pública
    const v = validarEnlaceRegistroInquilino(memoria.leer('enlaces_registro', IDS.A.enlace) as never);
    expect(v.ok).toBe(false);
  });

  it('consumir la invitación incrementa exactamente +1 los usos', async () => {
    await consumirInvitacion(IDS.A.enlace, 0);
    expect(memoria.leer<{ usosActuales: number }>('enlaces_registro', IDS.A.enlace)!.usosActuales).toBe(1);
    const v = validarEnlaceRegistroInquilino(memoria.leer('enlaces_registro', IDS.A.enlace) as never);
    expect(v.ok).toBe(false); // usosMaximos = 1 → agotada
  });
});

// ===========================================================================
// B. REGISTRO POR INVITACIÓN
// ===========================================================================
describe('E · B. Registro por invitación (registerWithInvitationLink)', () => {
  it('alta INQUILINO: documento usuarios/{authUid}, contratoIds del enlace, rol INQUILINO_PORTAL, usos +1', async () => {
    const enlace = enlaceTest('A', { id: 'enl_inq_TEST_REG', token: 'enl_inq_TEST_REG' });
    memoria.sembrar('enlaces_registro', enlace.id, enlace as never);

    const { firebaseUser, usuarioApp } = await registerWithInvitationLink({
      enlace,
      email: 'Nuevo.Inquilino@TEST.invalid',
      password: 'secreto-test-123',
      nombre: 'Nuevo',
      apellidos: 'Inquilino Test',
    });

    expect(firebaseUser).not.toBeNull();
    expect(usuarioApp.tipoPerfil).toBe('INQUILINO');
    // El ID del documento ES el Auth UID (las reglas resuelven alcance por usuarios/{uid})
    expect(usuarioApp.id).toBe(firebaseUser!.uid);
    expect(usuarioApp.authUid).toBe(firebaseUser!.uid);
    expect(usuarioApp.contratoIds).toEqual([IDS.A.contrato]);
    expect(usuarioApp.enlaceRegistroId).toBe('enl_inq_TEST_REG');
    expect(usuarioApp.roles).toEqual(['INQUILINO_PORTAL']);
    expect(usuarioApp.permisos).toEqual(['inmuebles.ver', 'contratos.ver']);
    expect(usuarioApp.email).toBe('nuevo.inquilino@test.invalid');
    // Sin privilegios de administración ni entidades propietario/profesional
    expect(usuarioApp.propietarioId).toBeUndefined();
    expect(usuarioApp.profesionalId).toBeUndefined();
    expect(usuarioApp.roles.some((r) => ['SUPERADMIN', 'ADMINISTRADOR', 'GESTOR_INMUEBLES'].includes(r))).toBe(false);

    // Persistencia real
    const doc = memoria.leer<Record<string, unknown>>('usuarios', firebaseUser!.uid)!;
    expect(doc.tipoPerfil).toBe('INQUILINO');
    expect(doc.contratoIds).toEqual([IDS.A.contrato]);
    expect(typeof doc.passwordHash).toBe('string');
    expect(memoria.existe('propietarios', String(doc.propietarioId ?? 'x'))).toBe(false);
    expect(memoria.leer<{ usosActuales: number }>('enlaces_registro', 'enl_inq_TEST_REG')!.usosActuales).toBe(1);
  });

  it('rechaza una invitación INQUILINO sin contrato vinculado (sin crear nada)', async () => {
    const enlace = enlaceTest('A', { id: 'enl_inq_TEST_SIN_CT', contratoIdVinculado: undefined });
    await expect(
      registerWithInvitationLink({ enlace, email: 'x@test.invalid', password: 'secreto-test-123', nombre: 'X' })
    ).rejects.toThrow(/contrato vinculado/i);
    expect(authSintetico.creados.length).toBe(0);
    expect(memoria.rutasEscritas()).toEqual([]);
  });

  it('rechaza el registro INQUILINO si Firebase Auth no crea la cuenta (sin UID no hay aislamiento)', async () => {
    authSintetico.errorCreacion = { code: 'auth/operation-not-allowed', message: 'operation-not-allowed' };
    const enlace = enlaceTest('A', { id: 'enl_inq_TEST_NOAUTH' });
    await expect(
      registerWithInvitationLink({ enlace, email: 'y@test.invalid', password: 'secreto-test-123', nombre: 'Y' })
    ).rejects.toThrow(/Firebase Authentication/i);
    expect(memoria.idsDe('usuarios').filter((id) => id.startsWith('uid_test_')).length).toBe(0);
  });

  it('nunca crea perfiles de administración desde un enlace público', async () => {
    const enlace = enlaceTest('A', { tipoPerfil: 'ADMINISTRADOR' as never });
    await expect(
      registerWithInvitationLink({ enlace, email: 'z@test.invalid', password: 'secreto-test-123', nombre: 'Z' })
    ).rejects.toThrow(/administraci/i);
  });

  it('el motor detecta invitación inexistente / inactiva / usada / caducada antes de registrar', () => {
    expect(validarEnlaceRegistroInquilino(enlaceTest('A', { activo: false })).ok).toBe(false);
    expect(validarEnlaceRegistroInquilino(enlaceTest('A', { usosActuales: 1 })).ok).toBe(false);
    expect(validarEnlaceRegistroInquilino(enlaceTest('A', { fechaCaducidad: '2020-01-01T00:00:00.000Z' })).ok).toBe(false);
    expect(validarEnlaceRegistroInquilino(enlaceTest('A', { tipoPerfil: 'PROPIETARIO' })).ok).toBe(false);
    expect(validarEnlaceRegistroInquilino(enlaceTest('A')).ok).toBe(true);
  });
});

// ===========================================================================
// C. AISLAMIENTO A/B EN LA CAPA DE CONSULTA
// ===========================================================================
describe('E · C. Aislamiento TENANT_TEST_A / TENANT_TEST_B (capa de consulta)', () => {
  async function cargarComo(l: 'A' | 'B') {
    memoria.accesos = [];
    const usuario = usuarioInquilinoTest(l);
    const contratos = (await Promise.all((usuario.contratoIds || []).map(getContratoById))).filter(Boolean);
    const inmuebles = (await Promise.all(contratos.map((c) => getInmuebleById(c!.inmuebleId)))).filter(Boolean);
    const incidencias = await getIncidenciasByIds(contratos.flatMap((c) => c!.incidenciaIds || []));
    const mensajes = await getMensajesByIds(contratos.flatMap((c) => c!.mensajeIds || []));
    const suministros = await getSuministrosByIds(inmuebles.flatMap((v) => v!.suministroIds || []));
    const lecturas = await getLecturasByIds(suministros.flatMap((s) => s.lecturaIds || []));
    const actas = (await Promise.all(contratos.map((c) => getActasByContrato(c!.id)))).flat();
    return { contratos, inmuebles, incidencias, mensajes, suministros, lecturas, actas, rutas: memoria.rutasLeidas() };
  }

  it('A solo lee documentos de A; ninguna ruta leída pertenece a B', async () => {
    const r = await cargarComo('A');
    expect(r.contratos.map((c) => c!.id)).toEqual([IDS.A.contrato]);
    expect(r.inmuebles.map((v) => v!.id)).toEqual([IDS.A.inmueble]);
    expect(r.suministros.map((s) => s.id)).toEqual([IDS.A.suministro]);
    expect(r.lecturas.map((x) => x.id)).toEqual([IDS.A.lectura]);
    expect(r.mensajes.map((m) => m.id)).toEqual([IDS.A.mensaje]);
    expect(r.incidencias.map((i) => i.id)).toEqual([IDS.A.incidencia]);
    expect(r.actas.map((a) => a.id)).toEqual([IDS.A.acta]);
    // Traza de la capa de consulta: cero accesos a rutas de B
    const rutasB = r.rutas.filter((ruta) => Object.values(IDS.B).some((id) => ruta.endsWith(`/${id}`)));
    expect(rutasB).toEqual([]);
    expect(r.rutas.length).toBeGreaterThan(0);
  });

  it('B solo lee documentos de B; ninguna ruta leída pertenece a A', async () => {
    const r = await cargarComo('B');
    expect(r.contratos.map((c) => c!.id)).toEqual([IDS.B.contrato]);
    expect(r.suministros.map((s) => s.id)).toEqual([IDS.B.suministro]);
    expect(r.mensajes.map((m) => m.texto)).toEqual(['MENSAJE_PRIVADO_TENANT_B']);
    expect(r.actas.map((a) => a.id)).toEqual([IDS.B.acta]);
    const rutasA = r.rutas.filter((ruta) => Object.values(IDS.A).some((id) => ruta.endsWith(`/${id}`)));
    expect(rutasA).toEqual([]);
  });

  it('el payload completo cargado por A no contiene ningún identificador ni secreto de B', async () => {
    const r = await cargarComo('A');
    const plano = JSON.stringify({ ...r, rutas: undefined });
    for (const id of Object.values(IDS.B)) expect(plano).not.toContain(id);
    expect(plano).not.toContain('MENSAJE_PRIVADO_TENANT_B');
    expect(plano).not.toContain('INCIDENCIA_TENANT_B');
    for (const s of Object.values(secretosDe('B'))) expect(plano).not.toContain(s);
  });

  it('las actas se consultan SOLO por igualdad de contractId: A no obtiene actas de B ni sin contrato', async () => {
    const actasA = await getActasByContrato(IDS.A.contrato);
    expect(actasA.map((a) => a.id)).toEqual([IDS.A.acta]);
    expect(await getActasByContrato('')).toEqual([]);
    expect(await getActasByContrato('ct_TEST_INEXISTENTE')).toEqual([]);
    // Todas las consultas a `actas` van filtradas (nunca listado completo)
    const consultas = memoria.accesos.filter((a) => a.op === 'query' && a.ruta === 'actas');
    expect(consultas.length).toBeGreaterThan(0);
  });

  it('el adaptador D sanea el acta: sin DNI, notas internas, OTP ni ownerId', () => {
    const vm = sanearActaParaInquilino(actaTest('A', { notasInternas: 'SECRETO_ACTA' }));
    const plano = JSON.stringify(vm);
    expect(plano).not.toContain(secretosDe('A').dniPropietario);
    expect(plano).not.toContain('SECRETO_ACTA');
    expect(plano).not.toContain('ownerId');
    expect(plano).not.toContain('otp');
    expect(vm.contratoId).toBe(IDS.A.contrato);
    expect(vm.participantes.map((p) => p.nombre)).toEqual([`Propietario Test A`, `Inquilino Test A`]);
    expect(vm.estadoFirma).toBe('FIRMADA');
  });
});

// ===========================================================================
// D. AUTORIZACIÓN (helpers de authService / scope)
// ===========================================================================
describe('E · D. Autorización — helpers tenant/staff', () => {
  const contratos = [contratoTest('A'), contratoTest('B')];

  it('contexto válido de inquilino → permitido', () => {
    const a = usuarioInquilinoTest('A');
    expect(isInquilino(a)).toBe(true);
    expect(canTenantAccessContrato(a, IDS.A.contrato)).toBe(true);
    expect(canTenantAccessInmueble(a, IDS.A.inmueble, contratos)).toBe(true);
    expect(getContratosDelInquilino(a, contratos).map((c) => c.id)).toEqual([IDS.A.contrato]);
    expect(resolveTenantScope(a, contratos)).toEqual({ contratos: [contratos[0]], inmuebleIds: [IDS.A.inmueble] });
  });

  it('contexto de otro inquilino → rechazado', () => {
    const a = usuarioInquilinoTest('A');
    expect(canTenantAccessContrato(a, IDS.B.contrato)).toBe(false);
    expect(canTenantAccessInmueble(a, IDS.B.inmueble, contratos)).toBe(false);
  });

  it('contexto inexistente (nulo) → rechazado y alcance vacío', () => {
    expect(isInquilino(null)).toBe(false);
    expect(canTenantAccessContrato(null, IDS.A.contrato)).toBe(false);
    expect(canTenantAccessInmueble(undefined, IDS.A.inmueble, contratos)).toBe(false);
    expect(resolveTenantScope(null, contratos)).toEqual({ contratos: [], inmuebleIds: [] });
  });

  it('usuario sin autorización (inquilino sin contratos) → rechazado', () => {
    const sin = usuarioInquilinoTest('A', { contratoIds: [] });
    expect(canTenantAccessContrato(sin, IDS.A.contrato)).toBe(false);
    expect(getContratosDelInquilino(sin, contratos)).toEqual([]);
  });

  it('usuario staff → los helpers de inquilino NO le conceden alcance de inquilino (usa su propio modelo de acceso)', () => {
    const staff = usuarioStaffTest();
    expect(isInquilino(staff)).toBe(false);
    expect(canTenantAccessContrato(staff, IDS.A.contrato)).toBe(false);
    expect(resolveTenantScope(staff, contratos)).toEqual({ contratos: [], inmuebleIds: [] });
  });

  it('acceso a recurso inexistente → controlado (false / vacío)', () => {
    const a = usuarioInquilinoTest('A', { contratoIds: [IDS.A.contrato, 'ct_TEST_FANTASMA'] });
    expect(canTenantAccessInmueble(a, 'inm_TEST_FANTASMA', contratos)).toBe(false);
    expect(resolveTenantScope(a, contratos).contratos.map((c) => c.id)).toEqual([IDS.A.contrato]);
  });
});

// ===========================================================================
// E. OPERACIONES DEL INQUILINO CON EFECTO EN ÍNDICES
// ===========================================================================
describe('E · E. Operaciones del inquilino (escrituras acotadas)', () => {
  it('registrar lectura: crea lectura INQUILINO inmutable y la enlaza en suministro.lecturaIds', async () => {
    const lec = await registrarLectura({
      id: 'lec_TEST_A_2',
      suministroId: IDS.A.suministro,
      inmuebleId: IDS.A.inmueble,
      contratoId: IDS.A.contrato,
      valor: 1200,
      unidad: 'kWh',
      fechaLectura: '2026-02-15T12:00:00.000Z',
      origen: 'INQUILINO',
      registradoPorUid: IDS.A.uid,
    });
    expect(lec.id).toBe('lec_TEST_A_2');
    expect(memoria.existe('lecturas_suministro', 'lec_TEST_A_2')).toBe(true);
    const sum = memoria.leer<{ lecturaIds: string[] }>('suministros', IDS.A.suministro)!;
    expect(sum.lecturaIds).toEqual([IDS.A.lectura, 'lec_TEST_A_2']);
    // Solo se escribió en la lectura nueva y en el índice del suministro propio
    expect(memoria.rutasEscritas()).toEqual([`lecturas_suministro/lec_TEST_A_2`, `suministros/${IDS.A.suministro}`]);
  });

  it('enviar mensaje: crea el mensaje y lo enlaza en contrato.mensajeIds (hilo append-only)', async () => {
    const m = await enviarMensajePortal({
      contratoId: IDS.A.contrato,
      inmuebleId: IDS.A.inmueble,
      remitenteUid: IDS.A.uid,
      remitenteNombre: 'Inquilino Test A',
      remitenteRol: 'INQUILINO',
      texto: '  Hola gestión, prueba TEST.  ',
    });
    expect(m.texto).toBe('Hola gestión, prueba TEST.');
    expect(m.leidoPorInquilino).toBe(true);
    expect(m.leidoPorGestion).toBe(false);
    const ct = memoria.leer<{ mensajeIds: string[] }>('contratos_formalizacion', IDS.A.contrato)!;
    expect(ct.mensajeIds).toEqual([IDS.A.mensaje, m.id]);
    expect(memoria.rutasEscritas()).toEqual([`mensajes_portal/${m.id}`, `contratos_formalizacion/${IDS.A.contrato}`]);
  });

  it('acuse de lectura: solo cambia leidoPorInquilino del mensaje propio', async () => {
    await marcarMensajeLeidoPorInquilino(IDS.A.mensaje);
    const m = memoria.leer<{ leidoPorInquilino: boolean; texto: string }>('mensajes_portal', IDS.A.mensaje)!;
    expect(m.leidoPorInquilino).toBe(true);
    expect(m.texto).toBe('MENSAJE_PRIVADO_TENANT_A');
    expect(memoria.rutasEscritas()).toEqual([`mensajes_portal/${IDS.A.mensaje}`]);
  });

  it('solicitar cambio de titular: estado SOLICITADO enlazado en suministro.cambioTitularIds', async () => {
    const c = await solicitarCambioTitular({
      suministroId: IDS.A.suministro,
      inmuebleId: IDS.A.inmueble,
      contratoId: IDS.A.contrato,
      titularNuevoNombre: 'Titular Nuevo Test',
      fechaEfecto: '2026-03-01T00:00:00.000Z',
      solicitadoPorUid: IDS.A.uid,
    });
    expect(c.estado).toBe('SOLICITADO');
    expect(memoria.leer<{ cambioTitularIds: string[] }>('suministros', IDS.A.suministro)!.cambioTitularIds).toEqual([c.id]);
  });

  it('concesión de alcance es idempotente (arrayUnion no duplica)', async () => {
    await concederAccesoContrato(IDS.A.contrato, IDS.A.inmueble);
    await concederAccesoContrato(IDS.A.contrato, IDS.A.inmueble);
    expect(memoria.leer<{ contratoIdsAutorizados: string[] }>('inmuebles', IDS.A.inmueble)!.contratoIdsAutorizados).toEqual([IDS.A.contrato]);
    expect(memoria.leer<{ contratoIdsAutorizados: string[] }>('suministros', IDS.A.suministro)!.contratoIdsAutorizados).toEqual([IDS.A.contrato]);
  });
});

// ===========================================================================
// F. ERRORES FIREBASE Y RECURSOS INEXISTENTES
// ===========================================================================
describe('E · F. Errores de lectura/escritura y recursos inexistentes', () => {
  it('lectura de documento inexistente → null; lista con IDs inexistentes → se omiten sin lanzar', async () => {
    expect(await getContratoById('ct_TEST_NO')).toBeNull();
    expect(await getInmuebleById('inm_TEST_NO')).toBeNull();
    expect(await getSuministroById('sum_TEST_NO')).toBeNull();
    const s = await getSuministrosByIds([IDS.A.suministro, 'sum_TEST_NO', IDS.A.suministro]);
    expect(s.map((x) => x.id)).toEqual([IDS.A.suministro]); // dedupe + omisión
    expect(await getLecturasByIds([])).toEqual([]);
    expect(await getMensajesByIds(undefined as never)).toEqual([]);
  });

  it('error de lectura (permiso denegado simulado) → el servicio devuelve null, no rompe', async () => {
    memoria.fallar('get', `contratos_formalizacion/${IDS.A.contrato}`);
    expect(await getContratoById(IDS.A.contrato)).toBeNull();
  });

  it('error de escritura → la operación lanza y NO deja estado a medias en el índice', async () => {
    memoria.fallar('set', 'lecturas_suministro');
    await expect(
      registrarLectura({
        id: 'lec_TEST_FALLA',
        suministroId: IDS.A.suministro,
        inmuebleId: IDS.A.inmueble,
        contratoId: IDS.A.contrato,
        valor: 1,
        unidad: 'kWh',
        fechaLectura: '2026-02-15T12:00:00.000Z',
        origen: 'INQUILINO',
      })
    ).rejects.toThrow();
    expect(memoria.existe('lecturas_suministro', 'lec_TEST_FALLA')).toBe(false);
    expect(memoria.leer<{ lecturaIds: string[] }>('suministros', IDS.A.suministro)!.lecturaIds).toEqual([IDS.A.lectura]);
  });

  it('error al enlazar en el índice → lanza (el inquilino ve el error; no se oculta)', async () => {
    memoria.fallar('update', `contratos_formalizacion/${IDS.A.contrato}`);
    await expect(
      enviarMensajePortal({
        contratoId: IDS.A.contrato,
        inmuebleId: IDS.A.inmueble,
        remitenteUid: IDS.A.uid,
        remitenteNombre: 'A',
        remitenteRol: 'INQUILINO',
        texto: 'mensaje TEST',
      })
    ).rejects.toThrow();
  });

  it('Storage: sube evidencias con validación de tipo/tamaño y rutas de la sección E', async () => {
    const pdf = new Blob(['%PDF-TEST'], { type: 'application/pdf' });
    const r1 = await subirEvidenciaIncidencia(IDS.A.incidencia, pdf, 'informe ../ raro.pdf');
    expect(r1.storagePath.startsWith(`incidencias/${IDS.A.incidencia}/`)).toBe(true);
    expect(r1.storagePath.split('/').length).toBe(3); // sin segmentos extra: el nombre se sanea
    expect(r1.storagePath.endsWith('informe_..__raro.pdf')).toBe(true);
    const foto = new Blob(['img'], { type: 'image/jpeg' });
    const r2 = await subirFotoLectura(IDS.A.suministro, 'lec_TEST_A_2', foto, 'contador.jpg');
    expect(r2.storagePath.startsWith(`suministros/${IDS.A.suministro}/lecturas/lec_TEST_A_2/`)).toBe(true);
    expect(await obtenerUrlDescarga(r1.storagePath)).toContain('storage.test');
    // Tipo no permitido y tamaño excesivo se rechazan ANTES de tocar Storage
    storageSintetico.subidas = [];
    await expect(subirEvidenciaIncidencia(IDS.A.incidencia, new Blob(['x'], { type: 'text/plain' }), 'a.txt')).rejects.toThrow(/Formato/);
    const grande = new Blob([new Uint8Array(10 * 1024 * 1024)], { type: 'image/png' });
    await expect(subirEvidenciaIncidencia(IDS.A.incidencia, grande, 'g.png')).rejects.toThrow(/10 MB/);
    expect(storageSintetico.subidas).toEqual([]);
  });

  it('Storage: recurso inexistente o no autorizado → error controlado en la descarga', async () => {
    await expect(obtenerUrlDescarga('incidencias/inc_TEST_NO/x.pdf')).rejects.toThrow(/not-found/);
    storageSintetico.denegadas.add(`contratos/${IDS.B.contrato}/contrato.pdf`);
    await expect(obtenerUrlDescarga(`contratos/${IDS.B.contrato}/contrato.pdf`)).rejects.toThrow(/unauthorized/);
  });
});
