/**
 * F3 — ENDPOINT `POST /api/titulares/buscar`
 * ===========================================
 * Códigos HTTP REALES con dependencias inyectadas (sin red y sin emulator):
 * autenticado, autorizado sobre ESE inmueble, mínimo 3 caracteres, máximo 10
 * resultados y respuesta exclusiva `{ id, nombre }`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { crearManejadorBuscarTitulares } from '../server/titularidades/manejadorBuscarTitulares';
import { buscarTitulares } from '../server/titularidades/backendTitulares';
import type { DependenciasBackendTitulares, DocumentoServidor } from '../server/titularidades/backendTitulares';
import type { CuentaServicio } from '../server/titularidades/googleBackend';

const CUENTA: CuentaServicio = {
  project_id: 'proyecto-demo',
  client_email: 'sa@proyecto-demo.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY-----',
};

/** Documento completo de propietario (con datos sensibles que NUNCA deben salir). */
function propietario(id: string, nombre: string): DocumentoServidor {
  return {
    id,
    datos: {
      nombre,
      nifCif: `NIF-${id}`,
      email: `${id}@correo.com`,
      iban: 'ES91 2100 0418 4502 0005 1332',
      cuentasBancarias: [{ iban: 'ES91', alias: 'Principal' }],
      direccion: 'Calle Privada 1',
      telefono: '600000000',
    },
  };
}

interface Opciones {
  credencial?: CuentaServicio | null;
  tokenValido?: boolean;
  espejo?: Record<string, unknown> | null;
  ficha?: Record<string, unknown> | null;
  inmueble?: Record<string, unknown> | null;
  propietarios?: DocumentoServidor[];
  falloLectura?: boolean;
}

function dependencias(opciones: Opciones = {}) {
  const eventos: unknown[] = [];
  const consultas: Array<{ coleccion: string; campo: string; prefijo: string; limite: number }> = [];
  const deps: DependenciasBackendTitulares = {
    leerCredencial: () => (opciones.credencial === undefined ? CUENTA : opciones.credencial),
    verificarToken: async () => (opciones.tokenValido === false ? null : { uid: 'uid-1', email: 'ana@correo.com' }),
    leerDocumento: async (ruta: string) => {
      if (opciones.falloLectura) throw new Error('Firestore caído');
      if (ruta.startsWith('usuarios_auth/')) {
        return opciones.espejo === undefined
          ? ({ estado: 'ACTIVO', usuarioId: 'u1', tipoPerfil: 'PROPIETARIO', propietarioId: 'p1', authUid: 'uid-1' } as Record<string, unknown>)
          : opciones.espejo;
      }
      if (ruta.startsWith('usuarios/')) {
        return opciones.ficha === undefined
          ? ({ estado: 'ACTIVO', authUid: 'uid-1', tipoPerfil: 'PROPIETARIO' } as Record<string, unknown>)
          : opciones.ficha;
      }
      if (ruta.startsWith('inmuebles/')) {
        return opciones.inmueble === undefined
          ? ({ propietarioId: 'p1', titularesIds: ['p1'] } as Record<string, unknown>)
          : opciones.inmueble;
      }
      return null;
    },
    consultarPrefijo: async (coleccion, campo, prefijo, limite) => {
      consultas.push({ coleccion, campo, prefijo, limite });
      return opciones.propietarios ?? [propietario('p2', 'Ana Ruiz')];
    },
    auditar: (evento) => eventos.push(evento),
  };
  return { deps, eventos, consultas };
}

function respuesta() {
  const res = {
    codigo: 0,
    cuerpo: undefined as unknown,
    status(codigo: number) {
      res.codigo = codigo;
      return res;
    },
    json(cuerpo: unknown) {
      res.cuerpo = cuerpo;
      return res;
    },
  };
  return res as unknown as Response & { codigo: number; cuerpo: unknown };
}

function peticion(cuerpo: unknown, authorization?: string): Request {
  return { body: cuerpo, headers: authorization ? { authorization } : {} } as unknown as Request;
}

describe('F3 — códigos HTTP reales', () => {
  it('200: resultados proyectados a {id, nombre} sin datos sensibles', async () => {
    const { deps, consultas } = dependencias({ propietarios: [propietario('p2', 'Ana Ruiz'), propietario('p3', 'Ana Gómez')] });
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'ana' }, 'Bearer tok'), res);
    expect(res.codigo).toBe(200);
    expect((res.cuerpo as { resultados: unknown[] }).resultados).toEqual([
      { id: 'p3', nombre: 'Ana Gómez' },
      { id: 'p2', nombre: 'Ana Ruiz' },
    ]);
    // La consulta es por PREFIJO, sobre `nombre`, y LIMITADA.
    expect(consultas[0]).toEqual({ coleccion: 'propietarios', campo: 'nombre', prefijo: 'ana', limite: 25 });
    // Ningún dato sensible en la respuesta.
    const serializado = JSON.stringify(res.cuerpo);
    for (const sensible of ['NIF-', '@correo.com', 'ES91', '600000000', 'Calle Privada']) {
      expect(serializado).not.toContain(sensible);
    }
  });

  it('400: término de menos de 3 caracteres', async () => {
    const { deps } = dependencias();
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'an' }, 'Bearer tok'), res);
    expect(res.codigo).toBe(400);
    expect((res.cuerpo as { error: string }).error).toBe('termino_corto');
  });

  it('400: falta el inmueble o el término', async () => {
    const { deps } = dependencias();
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ termino: 'ana' }, 'Bearer tok'), res);
    expect(res.codigo).toBe(400);
    expect((res.cuerpo as { error: string }).error).toBe('peticion_invalida');
  });

  it('401: sin cabecera Authorization', async () => {
    const { deps } = dependencias();
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'ana' }), res);
    expect(res.codigo).toBe(401);
    expect((res.cuerpo as { error: string }).error).toBe('no_autenticado');
  });

  it('401: token inválido o caducado', async () => {
    const { deps } = dependencias({ tokenValido: false });
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'ana' }, 'Bearer malo'), res);
    expect(res.codigo).toBe(401);
  });

  it('403: el llamador no tiene derecho sobre ESE inmueble', async () => {
    const { deps } = dependencias({ inmueble: { propietarioId: 'otro', titularesIds: ['otro'] } });
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'ana' }, 'Bearer tok'), res);
    expect(res.codigo).toBe(403);
    expect((res.cuerpo as { error: string }).error).toBe('sin_autorizacion');
  });

  it('403: inmueble inexistente (no revela si existe)', async () => {
    const { deps } = dependencias({ inmueble: null });
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-X', termino: 'ana' }, 'Bearer tok'), res);
    expect(res.codigo).toBe(403);
  });

  it('503: servidor sin credencial (con instrucciones, nunca degradado)', async () => {
    const { deps } = dependencias({ credencial: null });
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'ana' }, 'Bearer tok'), res);
    expect(res.codigo).toBe(503);
    const cuerpo = res.cuerpo as { error: string; detalle: string };
    expect(cuerpo.error).toBe('servidor_sin_configurar');
    expect(cuerpo.detalle).toContain('FIREBASE_SERVICE_ACCOUNT');
  });

  it('500: error interno sin exponer el detalle técnico', async () => {
    const { deps } = dependencias({ falloLectura: true });
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'ana' }, 'Bearer tok'), res);
    expect(res.codigo).toBe(500);
    expect(JSON.stringify(res.cuerpo)).not.toContain('Firestore caído');
  });

  it('el tope de 10 se aplica aunque el datastore devuelva más', async () => {
    const muchos = Array.from({ length: 25 }, (_, i) => propietario(`p${i}`, `Ana ${i}`));
    const { deps } = dependencias({ propietarios: muchos });
    const res = respuesta();
    await crearManejadorBuscarTitulares(deps)(peticion({ inmuebleId: 'inm-1', termino: 'ana' }, 'Bearer tok'), res);
    expect((res.cuerpo as { resultados: unknown[] }).resultados).toHaveLength(10);
  });
});

describe('F3 — autorización sobre el inmueble', () => {
  const llamar = async (opciones: Opciones) => {
    const { deps } = dependencias(opciones);
    return buscarTitulares({ idToken: 'tok', inmuebleId: 'inm-1', termino: 'ana' }, deps);
  };

  it('el titular canónico (propietarioId) puede buscar', async () => {
    await expect(llamar({ inmueble: { propietarioId: 'p1' } })).resolves.toMatchObject({ ok: true, codigo: 200 });
  });

  it('el COTITULAR (titularesIds) también puede buscar', async () => {
    await expect(llamar({ inmueble: { propietarioId: 'p9', titularesIds: ['p9', 'p1'] } })).resolves.toMatchObject({ ok: true });
  });

  it('ADMINISTRADOR activo puede buscar', async () => {
    await expect(
      llamar({
        espejo: { estado: 'ACTIVO', usuarioId: 'u1', tipoPerfil: 'ADMINISTRADOR', authUid: 'uid-1' },
        ficha: { estado: 'ACTIVO', authUid: 'uid-1', tipoPerfil: 'ADMINISTRADOR' },
        inmueble: { propietarioId: 'otro' },
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('espejo INACTIVO ⇒ 401 (el espejo por sí solo no basta)', async () => {
    await expect(llamar({ espejo: { estado: 'INACTIVO', usuarioId: 'u1', tipoPerfil: 'PROPIETARIO', propietarioId: 'p1' } })).resolves.toMatchObject({
      codigo: 401,
    });
  });

  it('ficha que no concuerda en authUid ⇒ 401 (espejo rancio)', async () => {
    await expect(llamar({ ficha: { estado: 'ACTIVO', authUid: 'otro-uid', tipoPerfil: 'PROPIETARIO' } })).resolves.toMatchObject({
      codigo: 401,
    });
  });

  it('ficha con tipoPerfil distinto ⇒ 401', async () => {
    await expect(llamar({ ficha: { estado: 'ACTIVO', authUid: 'uid-1', tipoPerfil: 'INQUILINO' } })).resolves.toMatchObject({ codigo: 401 });
  });

  it('sin ficha de usuario ⇒ 401', async () => {
    await expect(llamar({ ficha: null })).resolves.toMatchObject({ codigo: 401 });
  });
});

describe('F3 — auditoría', () => {
  it('registra la búsqueda concedida y la denegada', async () => {
    const { deps, eventos } = dependencias();
    await buscarTitulares({ idToken: 'tok', inmuebleId: 'inm-1', termino: 'ana' }, deps);
    await buscarTitulares({ idToken: 'tok', inmuebleId: 'inm-1', termino: 'an' }, deps);
    expect(eventos).toEqual([
      expect.objectContaining({ tipo: 'BUSQUEDA_TITULARES', inmuebleId: 'inm-1', uid: 'uid-1', resultados: 1 }),
      expect.objectContaining({ tipo: 'BUSQUEDA_TITULARES_DENEGADA', motivo: 'termino_corto' }),
    ]);
  });

  it('la auditoría por defecto no lanza aunque no haya dónde escribirla', async () => {
    const espia = vi.spyOn(console, 'info').mockImplementation(() => {});
    await buscarTitulares({ idToken: 'tok', inmuebleId: 'inm-1', termino: 'ana' }, {
      leerCredencial: () => CUENTA,
      verificarToken: async () => ({ uid: 'uid-1' }),
      leerDocumento: async (ruta) => (ruta.startsWith('inmuebles/') ? { propietarioId: 'p1' } : null),
      consultarPrefijo: async () => [],
    });
    espia.mockRestore();
  });
});
