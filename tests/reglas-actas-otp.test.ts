/**
 * H-03/H-07 — Las reglas ya NO permiten fabricar una firma desde el navegador.
 * ---------------------------------------------------------------------------
 * Antes: `actas_otp` admitía `create/update` del propietario (con su hash y su
 * `estado`) y `actas` admitía cambiar `firmas`, `estadoFirma` y `estado` a
 * FIRMADA. Es decir, el cliente podía escribir la evidencia de firma sin OTP.
 *
 * Ahora: el navegador no escribe NINGÚN documento de `actas_otp` (ni el master)
 * y no puede alterar `firmas`/`estadoFirma`/`fechaFirma` ni declarar el acta
 * FIRMADA. El servidor de firma escribe con credencial de servicio y no pasa por
 * estas reglas.
 *
 * Verificación con el harness del fichero REAL `firestore.rules` (no hay Java en
 * este entorno: el emulador oficial sigue pendiente y así se declara).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from '../tests/harness/firestoreRulesEval';

const RULES = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(RULES);

const AUTH_PROPIETARIO = { uid: 'uid-prop', token: { email: 'prop@example.test', email_verified: true } };
const AUTH_MASTER = { uid: 'uid-master', token: { email: 'sarqsan2@gmail.com', email_verified: true } };

const DB = {
  'usuarios_auth/uid-prop': {
    tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', usuarioId: 'u-prop', propietarioId: 'prop_A',
    authUid: 'uid-prop', inmuebleIds: ['inm-1'],
  },
  'usuarios/u-prop': {
    authUid: 'uid-prop', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A',
    inmuebleIds: ['inm-1'],
  },
  'usuarios_auth/uid-master': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', usuarioId: 'u-master', authUid: 'uid-master' },
  'usuarios/u-master': { authUid: 'uid-master', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
};

function acta(sobrescribir: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acta-1',
    ownerId: 'prop_A',
    propertyId: 'inm-1',
    tipo: 'ENTRADA',
    estado: 'BORRADOR',
    version: 1,
    fechaCreacion: '2026-10-01T10:00:00.000Z',
    fechaActualizacion: '2026-10-01T10:00:00.000Z',
    fechaActo: '2026-10-01',
    participantes: [{ id: 'part-inquilino', nombre: 'Inquilino', rol: 'ARRENDATARIO', firmaRequerida: true, haFirmado: false }],
    inventario: [],
    lecturasContadores: [],
    evidenciaIds: [],
    incidenciaIds: [],
    firmas: [],
    estadoFirma: 'PENDIENTE',
    historial: [{ id: 'hist-1', fecha: '2026-10-01T10:00:00.000Z', usuario: 'Propietario', accion: 'CREADA', version: 1 }],
    creadoPor: 'Propietario',
    ...sobrescribir,
  };
}

function peticionActa(
  verbo: 'create' | 'update',
  cambios: Record<string, unknown>,
  auth: typeof AUTH_PROPIETARIO | typeof AUTH_MASTER = AUTH_PROPIETARIO,
): Peticion {
  const existente = acta();
  return {
    auth,
    db: DB,
    resource: verbo === 'update' ? existente : null,
    requestResource: verbo === 'update' ? { ...existente, ...cambios } : acta(cambios),
    docId: 'acta-1',
  };
}

describe('actas · la evidencia de firma sólo la escribe el servidor', () => {
  it('un cambio de `firmas` desde el navegador se DENIEGA', () => {
    const firma = {
      id: 'firma-1', actaId: 'acta-1', versionActa: 1, firmanteId: 'part-inquilino', firmanteNombre: 'Inquilino',
      firmanteRol: 'ARRENDATARIO', estado: 'FIRMADA', metodo: 'OTP', fechaFirma: '2026-10-02T10:00:00.000Z',
    };
    expect(permite('actas', 'update', peticionActa('update', { firmas: [firma], version: 2 }))).toBe(false);
  });

  it('un cambio de `estadoFirma` desde el navegador se DENIEGA', () => {
    expect(permite('actas', 'update', peticionActa('update', { estadoFirma: 'FIRMADA', version: 2 }))).toBe(false);
  });

  it('declarar `estado: FIRMADA` desde el navegador se DENIEGA', () => {
    expect(permite('actas', 'update', peticionActa('update', { estado: 'FIRMADA', version: 2 }))).toBe(false);
  });

  it('`estado: CERRADA` sin estar ya FIRMADA se DENIEGA', () => {
    expect(permite('actas', 'update', peticionActa('update', { estado: 'CERRADA', version: 2 }))).toBe(false);
  });

  it('una edición administrativa normal (observaciones + versión) sigue PERMITIDA', () => {
    expect(permite('actas', 'update', peticionActa('update', {
      observaciones: 'Revisado en presencia de las partes',
      version: 2,
      fechaActualizacion: '2026-10-02T10:00:00.000Z',
    }))).toBe(true);
  });

  it('no se puede crear un acta ya con firmas ni con estado de firma cerrado', () => {
    const firma = { id: 'f', firmanteId: 'part-inquilino', estado: 'FIRMADA', metodo: 'OTP' };
    expect(permite('actas', 'create', peticionActa('create', { firmas: [firma] }))).toBe(false);
    expect(permite('actas', 'create', peticionActa('create', { estadoFirma: 'FIRMADA' }))).toBe(false);
    expect(permite('actas', 'create', peticionActa('create', { fechaFirma: '2026-10-02T10:00:00.000Z' }))).toBe(false);
    expect(permite('actas', 'create', peticionActa('create', {}))).toBe(true);
  });
});

describe('actas_otp · material del servidor, cerrado al navegador', () => {
  const base = {
    id: 'otp_1', actaId: 'acta-1', firmaId: 'firma-1', ownerId: 'prop_A',
    codigoHash: 'a'.repeat(64), codigoSalt: 'b'.repeat(32), estado: 'ACTIVO',
    intentos: 0, maxIntentos: 5, usado: false, transporteRealizado: true,
  };

  function peticionOtp(auth: typeof AUTH_PROPIETARIO | typeof AUTH_MASTER, cambios: Record<string, unknown> = {}, verbo: 'create' | 'update' = 'create'): Peticion {
    return {
      auth,
      db: DB,
      resource: verbo === 'update' ? base : null,
      requestResource: { ...base, ...cambios },
      docId: 'otp_1',
    };
  }

  it('el propietario NO puede crear un OTP', () => {
    expect(permite('actas_otp', 'create', peticionOtp(AUTH_PROPIETARIO))).toBe(false);
  });

  it('NADIE puede actualizar ni borrar un OTP por el cliente, ni el master', () => {
    expect(permite('actas_otp', 'update', peticionOtp(AUTH_PROPIETARIO, { usado: true }, 'update'))).toBe(false);
    expect(permite('actas_otp', 'update', peticionOtp(AUTH_MASTER, { usado: true }, 'update'))).toBe(false);
    expect(permite('actas_otp', 'delete', peticionOtp(AUTH_MASTER))).toBe(false);
  });

  it('el propietario NO puede leer hashes ni listarlos', () => {
    expect(permite('actas_otp', 'get', peticionOtp(AUTH_PROPIETARIO))).toBe(false);
    expect(permite('actas_otp', 'list', peticionOtp(AUTH_PROPIETARIO))).toBe(false);
  });

  it('el master conserva lectura de diagnóstico (nunca escritura)', () => {
    expect(permite('actas_otp', 'get', peticionOtp(AUTH_MASTER))).toBe(true);
  });
});
