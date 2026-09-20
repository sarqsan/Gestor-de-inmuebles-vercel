import { describe, it, expect } from 'vitest';

import { DispatcherNotificaciones } from '../src/notificaciones/dispatcher';
import type { EnviadorCanal, RepositorioNotificaciones } from '../src/notificaciones/dispatcher';
import { CanalEmail, CanalInApp, EmailProviderSafeMode } from '../src/notificaciones/canales';
import {
  seleccionarPlantilla,
  seleccionarCanal,
  resolverPlantilla,
  validarPayload,
} from '../src/notificaciones/resolucion';
import { PLANTILLAS } from '../src/notificaciones/plantillas';
import { idempotenciaDeEvento, idDeNotificacion } from '../src/types/notificaciones';
import type { Notificacion, EnviarNotificacionPayload } from '../src/types/notificaciones';

// ---------------------------------------------------------------------------
// Repositorio en memoria (simula Firestore)
// ---------------------------------------------------------------------------

class RepoMemoria implements RepositorioNotificaciones {
  store = new Map<string, Notificacion>();
  async buscarPorId(id: string) { return this.store.get(id) || null; }
  async buscarPorIdempotencia(key: string) {
    for (const n of this.store.values()) if (n.idempotencyKey === key) return n;
    return null;
  }
  async guardar(n: Notificacion) { this.store.set(n.id, n); }
}

// ---------------------------------------------------------------------------
// Canales mock
// ---------------------------------------------------------------------------

class MockEmailOk implements EnviadorCanal {
  canal = 'EMAIL' as const;
  enviados: Notificacion[] = [];
  async enviar(n: Notificacion) { this.enviados.push(n); return { ok: true, provider: 'email', externalId: `ext-${n.id}`, enviadoEn: new Date().toISOString() }; }
}

class MockEmailFalla implements EnviadorCanal {
  canal = 'EMAIL' as const;
  async enviar(_n: Notificacion) { return { ok: false, provider: 'email', error: 'bounce', enviadoEn: new Date().toISOString() }; }
}

function contexto(overrides: Partial<{ canales: Record<string, EnviadorCanal | null | undefined> }> = {}) {
  const canales = overrides.canales || {};
  return {
    repo: new RepoMemoria(),
    canales: {
      EMAIL: canales.EMAIL || new MockEmailOk(),
      INAPP: canales.INAPP || new CanalInApp(),
      WEBHOOK: canales.WEBHOOK || null,
      WHATSAPP: canales.WHATSAPP || null,
    },
  };
}

function dispatcherAdmin(repo: RepoMemoria, canales: Record<string, EnviadorCanal | null | undefined> = {}) {
  return new DispatcherNotificaciones({
    autorizacion: { perfil: 'ADMINISTRADOR', uid: 'u_admin', inmuebleIds: [] },
    repositorio: repo,
    canales: {
      EMAIL: canales.EMAIL ?? new MockEmailOk(),
      INAPP: canales.INAPP ?? new CanalInApp(),
      WEBHOOK: null,
      WHATSAPP: null,
    },
  });
}

const payloadEmail: EnviarNotificacionPayload = {
  origen: 'COBRO',
  tipoEvento: 'cobro.proximo_vencimiento',
  entidadId: 'cobro_1',
  propietarioId: 'prop_1',
  inmuebleId: 'inm_1',
  canal: 'EMAIL',
  destinatario: { email: 'prop@example.com', nombre: 'Prop A' },
  datos: { periodoMesAnio: '2026-10', importePrevisto: 1200, inmuebleDireccion: 'Gran Vía 42' },
};

describe('Sistema de notificaciones — motor', () => {
  it('1. creación de notificación', async () => {
    const repo = new RepoMemoria();
    const d = dispatcherAdmin(repo);
    const res = await d.dispatch(payloadEmail);
    expect(res.ok).toBe(true);
    expect(res.notificacion).toBeTruthy();
    expect(res.notificacion?.estado).toBe('ENVIADA');
  });

  it('2. validación del payload', () => {
    expect(validarPayload(payloadEmail).valido).toBe(true);
    const malo = validarPayload({ origen: '' as any, tipoEvento: '', entidadId: '' });
    expect(malo.valido).toBe(false);
    expect(malo.errores.length).toBeGreaterThan(0);
  });

  it('3. selección de plantilla', () => {
    expect(seleccionarPlantilla('cobro.proximo_vencimiento', PLANTILLAS)?.id).toBe('cobro.proximo_vencimiento');
    expect(seleccionarPlantilla('no.existe', PLANTILLAS)).toBeNull();
  });

  it('4. selección de canal', () => {
    const plantilla = PLANTILLAS['cobro.proximo_vencimiento'];
    expect(seleccionarCanal(plantilla, 'EMAIL', { email: true, inapp: true, webhook: false, whatsapp: false })).toBe('EMAIL');
    // sin email disponible → inapp
    expect(seleccionarCanal(plantilla, 'EMAIL', { email: false, inapp: true, webhook: false, whatsapp: false })).toBe('INAPP');
    // canal no permitido
    expect(seleccionarCanal(PLANTILLAS['cobro.retraso_pago'], 'WHATSAPP', { email: false, inapp: false, webhook: true, whatsapp: true })).toBe('WEBHOOK');
  });

  it('5. idempotencia — misma clave no duplica', async () => {
    const repo = new RepoMemoria();
    const d = dispatcherAdmin(repo);
    const r1 = await d.dispatch(payloadEmail);
    const r2 = await d.dispatch(payloadEmail);
    expect(r1.ok).toBe(true);
    expect(r2.duplicada).toBe(true);
    expect(r2.ok).toBe(true);
    expect(repo.store.size).toBe(1);
  });

  it('6. duplicado rechazado (segundo envío no re-entrega)', async () => {
    const repo = new RepoMemoria();
    const mock = new MockEmailOk();
    const d = dispatcherAdmin(repo, { EMAIL: mock });
    await d.dispatch(payloadEmail);
    await d.dispatch(payloadEmail);
    expect(mock.enviados.length).toBe(1);
  });

  it('7. reintento de fallida', async () => {
    const repo = new RepoMemoria();
    const d = new DispatcherNotificaciones({
      autorizacion: { perfil: 'ADMINISTRADOR', uid: 'u_admin' },
      repositorio: repo,
      canales: { EMAIL: new MockEmailFalla(), INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const res = await d.dispatch(payloadEmail);
    expect(res.ok).toBe(false);
    expect(res.estado).toBe('FALLIDA');
    const fallida = res.notificacion!;

    const dOk = new DispatcherNotificaciones({
      autorizacion: { perfil: 'ADMINISTRADOR', uid: 'u_admin' },
      repositorio: repo,
      canales: { EMAIL: new MockEmailOk(), INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const ret = await dOk.reintentar({ ...fallida, intentos: 0 });
    expect(ret.ok).toBe(true);
    expect(ret.estado).toBe('ENVIADA');
  });

  it('8. estado ENVIADA con proveedor mock', async () => {
    const repo = new RepoMemoria();
    const d = dispatcherAdmin(repo);
    const res = await d.dispatch(payloadEmail);
    expect(res.notificacion?.estado).toBe('ENVIADA');
    expect(res.notificacion?.provider).toBe('email');
    expect(res.notificacion?.externalId).toBeTruthy();
  });

  it('9. estado FALLIDA cuando el proveedor falla', async () => {
    const repo = new RepoMemoria();
    const d = new DispatcherNotificaciones({
      autorizacion: { perfil: 'ADMINISTRADOR', uid: 'u_admin' },
      repositorio: repo,
      canales: { EMAIL: new MockEmailFalla(), INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const res = await d.dispatch(payloadEmail);
    expect(res.notificacion?.estado).toBe('FALLIDA');
    expect(res.notificacion?.error).toBeTruthy();
    expect(res.notificacion?.intentos).toBe(1);
  });

  it('10. cancelación de una programada/pendiente', async () => {
    const repo = new RepoMemoria();
    const d = dispatcherAdmin(repo);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await d.dispatch({ ...payloadEmail, programarPara: tomorrow });
    expect(res.estado).toBe('PROGRAMADA');
    const cancel = await d.cancelar(res.notificacion!);
    expect(cancel.estado).toBe('CANCELADA');
    expect(cancel.notificacion?.estado).toBe('CANCELADA');
  });

  it('11. programación — creada como PROGRAMADA', async () => {
    const repo = new RepoMemoria();
    const d = dispatcherAdmin(repo);
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const res = await d.dispatch({ ...payloadEmail, programarPara: future });
    expect(res.estado).toBe('PROGRAMADA');
    expect(res.notificacion?.programarPara).toBe(future);
  });

  it('12. aislamiento entre propietarios', async () => {
    const repo = new RepoMemoria();
    const d = new DispatcherNotificaciones({
      autorizacion: { perfil: 'PROPIETARIO', uid: 'u_A', propietarioId: 'prop_A', inmuebleIds: ['inm_A'] },
      repositorio: repo,
      canales: { EMAIL: new MockEmailOk(), INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const res = await d.dispatch({ ...payloadEmail, propietarioId: 'prop_B', inmuebleId: 'inm_A' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('propietario_no_autorizado');
  });

  it('13. autorización RBAC — anónimo denegado', async () => {
    const repo = new RepoMemoria();
    const d = new DispatcherNotificaciones({
      autorizacion: { perfil: null },
      repositorio: repo,
      canales: { EMAIL: new MockEmailOk(), INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const res = await d.dispatch(payloadEmail);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('no_autorizado');
  });

  it('14. protección de inmuebleId (no-admin solo su alcance)', async () => {
    const repo = new RepoMemoria();
    const d = new DispatcherNotificaciones({
      autorizacion: { perfil: 'PROPIETARIO', uid: 'u_A', propietarioId: 'prop_A', inmuebleIds: ['inm_A'] },
      repositorio: repo,
      canales: { EMAIL: new MockEmailOk(), INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const res = await d.dispatch({ ...payloadEmail, propietarioId: 'prop_A', inmuebleId: 'inm_Z' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('inmueble_no_autorizado');
  });

  it('15. ausencia de secretos en el documento persistido', async () => {
    const repo = new RepoMemoria();
    const d = dispatcherAdmin(repo);
    const res = await d.dispatch({
      ...payloadEmail,
      datos: {
        ...(payloadEmail.datos || {}),
        periodoMesAnio: '2026-10',
        smtpPassword: 'secreto',
        apiKey: '123',
        accessToken: 'abc',
        refresh_token: 'xyz',
      },
    });
    const persisted = repo.store.get(res.notificacion!.id)!;
    const json = JSON.stringify(persisted);
    // Ni el soporte ni las claves sensibles deben llegar al documento persistido.
    expect(json).not.toContain('secreto');
    expect(json).not.toContain('apiKey');
    expect(Object.keys(persisted.datos)).not.toContain('smtpPassword');
    expect(Object.keys(persisted.datos)).not.toContain('accessToken');
    expect(Object.keys(persisted.datos)).not.toContain('refresh_token');
    // Los datos legítimos siguen presentes.
    expect(persisted.datos.periodoMesAnio).toBe('2026-10');
    expect(persisted.datos.importePrevisto).toBe(1200);
    // El modelo no expone campos de credenciales.
    expect(Object.keys(persisted)).not.toContain('smtpPassword');
  });

  it('16. dispatcher con proveedor mock (entrega + auditoría)', async () => {
    const repo = new RepoMemoria();
    const d = dispatcherAdmin(repo);
    const res = await d.dispatch(payloadEmail);
    expect(res.entregada).toBe(true);
    expect(res.notificacion?.audit.eventos.length).toBeGreaterThanOrEqual(3); // creada → intento → enviada
  });

  it('17. email provider safe-mode: sin configuración no envía', () => {
    const prov = new EmailProviderSafeMode({ activo: false });
    return prov.enviar({ to: 'a@b.c', subject: 's', body: 'b' }).then((r) => {
      expect(r.ok).toBe(false);
      expect(r.error).toContain('safe-mode');
    });
  });

  it('18. resolver {props}', () => {
    const t = resolverPlantilla(PLANTILLAS['cobro.proximo_vencimiento'], { inmuebleDireccion: 'Gran Vía', periodoMesAnio: '2026-10', importePrevisto: 1200 });
    expect(t.asunto).toContain('Gran Vía');
    expect(t.cuerpo).toContain('2026-10');
    expect(t.cuerpo).not.toContain('{');
  });

  it('19. IDs deterministas', () => {
    const k1 = idempotenciaDeEvento('COBRO', 'proximo_vencimiento', 'cobro_1');
    const k2 = idempotenciaDeEvento('COBRO', 'proximo_vencimiento', 'cobro_1');
    expect(k1).toBe(k2);
    expect(idDeNotificacion(k1)).toBe('not_ev_cobro_proximo_vencimiento_cobro_1');
  });

  it('20. no-admin queda anclado a su propietarioId efectivo', async () => {
    const repo = new RepoMemoria();
    const d = new DispatcherNotificaciones({
      autorizacion: { perfil: 'PROPIETARIO', uid: 'u_A', propietarioId: 'prop_A', inmuebleIds: ['inm_A'] },
      repositorio: repo,
      canales: { EMAIL: new MockEmailOk(), INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const res = await d.dispatch({ ...payloadEmail, propietarioId: undefined, inmuebleId: 'inm_A' });
    expect(res.ok).toBe(true);
    expect(res.notificacion?.propietarioId).toBe('prop_A');
  });
});
