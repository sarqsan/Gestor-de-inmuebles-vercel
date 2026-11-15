/**
 * P0-C · Contrato de protección de la cuenta master.
 * Pruebas puras: no activan MFA ni tocan Firebase.
 */
import { describe, expect, it } from 'vitest';

import {
  CODIGO_MFA_REQUERIDO,
  PROCEDIMIENTO_RECUPERACION_MASTER,
  clasificarIntentoLogin,
  esErrorMfa,
  escrituraAdministrativaAuditada,
  evaluarProteccionMaster,
  requisitosParaActivarMfa,
  type DatosProteccionMaster,
} from './masterSeguridad';

const PROTEGIDA: DatosProteccionMaster = {
  emailVerificado: true,
  segundoFactorActivo: true,
  soporteSegundoFactor: true,
  recuperacionDisponible: true,
};

/** Estado REAL del sistema hoy (verificado en P0). */
const ESTADO_ACTUAL: DatosProteccionMaster = {
  emailVerificado: true,
  segundoFactorActivo: false,
  soporteSegundoFactor: false,
  recuperacionDisponible: true,
};

describe('P0-C · detección del reto de segundo factor', () => {
  it('reconoce el código de Firebase', () => {
    expect(esErrorMfa({ code: CODIGO_MFA_REQUERIDO })).toBe(true);
    expect(esErrorMfa({ code: 'auth/wrong-password' })).toBe(false);
    expect(esErrorMfa(null)).toBe(false);
    expect(esErrorMfa(undefined)).toBe(false);
  });

  it('clasifica el reto como REQUIERE_SEGUNDO_FACTOR, no como credenciales malas', () => {
    const r = clasificarIntentoLogin({ code: CODIGO_MFA_REQUERIDO, resolver: { hint: 'x' } });
    expect(r.tipo).toBe('REQUIERE_SEGUNDO_FACTOR');
    if (r.tipo === 'REQUIERE_SEGUNDO_FACTOR') {
      expect(r.resolver).toEqual({ hint: 'x' });
      expect(r.mensaje).toMatch(/verificación en dos pasos/i);
    }
  });

  it('un login correcto se clasifica como AUTENTICADO', () => {
    expect(clasificarIntentoLogin(null)).toEqual({ tipo: 'AUTENTICADO' });
  });

  it('un error ordinario no se confunde con MFA', () => {
    const r = clasificarIntentoLogin({ code: 'auth/wrong-password' });
    expect(r.tipo).toBe('ERROR');
  });
});

describe('P0-C · evaluación del estado de protección', () => {
  it('el estado actual del sistema es SIN_PROTECCION por riesgo de bloqueo controlado', () => {
    const r = evaluarProteccionMaster(ESTADO_ACTUAL);
    // Sin segundo factor y sin soporte: PARCIAL (protegida por contraseña + email).
    expect(r.estado).toBe('PARCIAL');
    expect(r.riesgoBloqueo).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/segundo factor activo/i);
  });

  it('DETECTA el bloqueo inminente: factor activo pero app sin soporte', () => {
    const r = evaluarProteccionMaster({ ...ESTADO_ACTUAL, segundoFactorActivo: true, soporteSegundoFactor: false });
    expect(r.riesgoBloqueo).toBe(true);
    expect(r.estado).toBe('SIN_PROTECCION');
    expect(r.motivos.join(' ')).toMatch(/BLOQUEO INMINENTE/);
  });

  it('protegida solo si todo está en su sitio', () => {
    expect(evaluarProteccionMaster(PROTEGIDA).estado).toBe('PROTEGIDA');
  });

  it('email sin verificar impide PROTEGIDA', () => {
    const r = evaluarProteccionMaster({ ...PROTEGIDA, emailVerificado: false });
    expect(r.estado).toBe('PARCIAL');
    expect(r.motivos.join(' ')).toMatch(/no está verificado/i);
  });

  it('sin recuperación no se considera protegida', () => {
    expect(evaluarProteccionMaster({ ...PROTEGIDA, recuperacionDisponible: false }).estado).toBe('PARCIAL');
  });
});

describe('P0-C · requisitos antes de activar MFA', () => {
  it('hoy faltan requisitos: NO se debe activar el factor', () => {
    const faltan = requisitosParaActivarMfa(ESTADO_ACTUAL);
    expect(faltan.length).toBeGreaterThan(0);
    expect(faltan.join(' ')).toMatch(/segundo factor en el login|cablear/i);
  });

  it('siempre exige procedimiento de recuperación y validación previa', () => {
    const faltan = requisitosParaActivarMfa(PROTEGIDA);
    expect(faltan.join(' ')).toMatch(/recuperación ante pérdida/i);
    expect(faltan.join(' ')).toMatch(/entorno aislado/i);
  });

  it('el procedimiento de recuperación está definido y es accionable', () => {
    expect(PROCEDIMIENTO_RECUPERACION_MASTER.length).toBeGreaterThanOrEqual(3);
    for (const p of PROCEDIMIENTO_RECUPERACION_MASTER) {
      expect(p.paso).toBeGreaterThan(0);
      expect(p.accion.length).toBeGreaterThan(20);
      expect(p.requiere.length).toBeGreaterThan(5);
    }
  });
});

describe('P0-C · invariante de auditoría (paridad con firestore.rules)', () => {
  const datos = { roadmap01AuditId: 'evt-1', valor: 'x' };
  const evento = { id: 'evt-1', usuarioEmail: 'a@b.c', rutas: ['usuarios_auth/uid1'], resultado: 'EXITO' };

  it('acepta la escritura con evento válido y ruta declarada', () => {
    expect(escrituraAdministrativaAuditada(datos, 'usuarios_auth/uid1', evento)).toEqual({ ok: true });
  });

  it('rechaza escritura sin roadmap01AuditId', () => {
    const r = escrituraAdministrativaAuditada({ valor: 'x' }, 'usuarios_auth/uid1', evento);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/roadmap01AuditId/);
  });

  it('rechaza evento ausente, con id distinto o sin resultado EXITO', () => {
    expect(escrituraAdministrativaAuditada(datos, 'usuarios_auth/uid1', null).ok).toBe(false);
    expect(escrituraAdministrativaAuditada(datos, 'usuarios_auth/uid1', { ...evento, id: 'otro' }).ok).toBe(false);
    expect(escrituraAdministrativaAuditada(datos, 'usuarios_auth/uid1', { ...evento, resultado: 'ERROR' }).ok).toBe(false);
  });

  it('rechaza si el evento no declara la ruta escrita', () => {
    const r = escrituraAdministrativaAuditada(datos, 'usuarios_auth/OTRO', evento);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/no declara la ruta/);
  });
});
