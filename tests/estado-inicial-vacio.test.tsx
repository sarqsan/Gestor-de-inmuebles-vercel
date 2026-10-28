/**
 * P0.1.5/P0.1.6 — Banderas y estados iniciales: SIN datos de demostración
 * por defecto. Prueba de comportamiento real sobre `flags.ts` y
 * `estadoInicial.ts` (no es una simulación: se consulta el módulo importado).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

describe('flags de cliente — denegar por defecto', () => {
  it('sin variables, semillas y datos demo están DESACTIVADOS', async () => {
    vi.stubEnv('VITE_SEEDS_ENABLED', '');
    vi.stubEnv('VITE_DEMO_DATA', '');
    const { semillasHabilitadas, datosDemoHabilitados, banderaActivada } = await import('../src/lib/flags');
    expect(semillasHabilitadas()).toBe(false);
    expect(datosDemoHabilitados()).toBe(false);
    expect(banderaActivada('VITE_SEEDS_ENABLED')).toBe(false);
  });

  it('solo valores explícitos activan las banderas; un valor raro NO', async () => {
    vi.stubEnv('VITE_SEEDS_ENABLED', 'quizá');
    vi.stubEnv('VITE_DEMO_DATA', '0');
    const { semillasHabilitadas, datosDemoHabilitados } = await import('../src/lib/flags');
    expect(semillasHabilitadas()).toBe(false);
    expect(datosDemoHabilitados()).toBe(false);
    vi.stubEnv('VITE_SEEDS_ENABLED', 'TRUE');
    vi.stubEnv('VITE_DEMO_DATA', 'sí');
    expect(semillasHabilitadas()).toBe(true);
    expect(datosDemoHabilitados()).toBe(true);
  });
});

describe('estadoInicial — la UI arranca vacía sin VITE_DEMO_DATA', () => {
  it('todas las colecciones están vacías y no hay cuenta de correo conectada', async () => {
    vi.stubEnv('VITE_DEMO_DATA', '');
    const ini = await import('../src/data/estadoInicial');
    expect(ini.inicialPropietarios()).toEqual([]);
    expect(ini.inicialCandidatos()).toEqual([]);
    expect(ini.inicialInmuebles()).toEqual([]);
    expect(ini.inicialSolicitudes()).toEqual([]);
    expect(ini.inicialInvitaciones()).toEqual([]);
    expect(ini.inicialSlots()).toEqual([]);
    expect(ini.inicialSolicitudesDoc()).toEqual([]);
    expect(ini.inicialContratos()).toEqual([]);
    expect(ini.inicialAseguradoras()).toEqual([]);
    expect(ini.inicialSolicitudesSeguro()).toEqual([]);
    expect(ini.inicialGmailConfig().conectado).toBe(false);
    expect(ini.inicialGmailConfig().emailConectado).toBe('');
    expect(ini.inicialPerfilUsuario().email).toBe('');
    expect(ini.inicialPerfilUsuario().nombre).toBe('');
    expect(ini.inicialPerfilUsuario().notificacionesEmail).toBe(false);
  });

  it('con la bandera activada SÍ se entregan los datos de demostración (etiquetados)', async () => {
    vi.stubEnv('VITE_DEMO_DATA', '1');
    const ini = await import('../src/data/estadoInicial');
    expect(ini.inicialAseguradoras().length).toBeGreaterThan(0);
    expect(ini.inicialGmailConfig().conectado).toBe(true);
    expect(ini.inicialPerfilUsuario().nombre).not.toBe('');
  });

  it('los datos demo nunca contienen el correo del administrador real', async () => {
    vi.stubEnv('VITE_DEMO_DATA', '1');
    const ini = await import('../src/data/estadoInicial');
    const { MASTER_ADMIN_EMAIL_POR_DEFECTO } = await import('../src/lib/masterAdmin');
    const serializado = JSON.stringify({
      perfil: ini.inicialPerfilUsuario(),
      gmail: ini.inicialGmailConfig(),
      aseguradoras: ini.inicialAseguradoras(),
    });
    expect(serializado).not.toContain(MASTER_ADMIN_EMAIL_POR_DEFECTO);
  });
});
