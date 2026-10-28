/**
 * P0.2.1 — Pruebas REALES del alta pública de solicitud en el SERVIDOR.
 * Espejo de AG-02: se inyecta un doble del puerto Firestore (sin red, sin
 * emulador) y se comprueba el contrato del commit atómico, el saneo de
 * campos, el honeypot indirecto y la resolución del token.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  crearServicioPortalPublico,
  ErrorPortalPublico,
  type PuertoPortalPublico,
} from '../server/portalPublico/servicioPortalPublico';
import type {
  DocumentoLeido,
  EscrituraDocumentoFirestoreAtomica,
} from '../server/titularidades/googleBackend';

const FICHA: DocumentoLeido = {
  id: 'inm-1',
  updateTime: '2026-10-20T10:00:00Z',
  datos: {
    id: 'inm-1', inmuebleId: 'inm-1', propietarioId: 'prop-1',
    direccion: 'Calle Real 12, Alicante', ciudad: 'Alicante', precio: 950,
    estado: 'disponible', actualizadoEn: '2026-10-20T10:00:00Z',
  },
};

function formulario(sobreescribir: Record<string, unknown> = {}) {
  return {
    candidatoNombre: 'Persona Sintética',
    candidatoEmail: 'sintetica@example.test',
    candidatoTelefono: '600111222',
    consentimientoAceptado: true,
    numAdultos: 2, numMenores: 1, numTotalPersonas: 3,
    ingresosNetosMensuales: 2100,
    situacionLaboral: 'cuenta_ajena',
    cuestionarioCompletado: true,
    cuestionarioData: { completado: true, respuestas: [{ id: 1, respuesta: 'ok' }] },
    // Intento de inyección: el servidor NO debe copiar estos campos.
    id: 'sol-falso', inmuebleId: 'inm-OTRO', propietarioId: 'prop-OTRO',
    ownerId: 'atacante', estado: 'SELECCIONADO', historial: [{ accion: 'falso' }],
    ...sobreescribir,
  };
}

function puerto(opciones: {
  ficha?: DocumentoLeido | null;
  commit?: 'COMMIT' | 'CONFLICTO';
} = {}) {
  const escrituras: EscrituraDocumentoFirestoreAtomica[] = [];
  const impl: PuertoPortalPublico = {
    async leerDocumento(ruta: string) {
      if (ruta.startsWith('fichas_publicas_inmueble/')) {
        return opciones.ficha === undefined ? FICHA : opciones.ficha;
      }
      return null;
    },
    async consultarIgualdadesOrden() { return []; },
    async escribirAtomico(escriturasRecibidas) {
      escrituras.push(...escriturasRecibidas);
      return opciones.commit ?? 'COMMIT';
    },
  };
  return { impl, escrituras, servicio: crearServicioPortalPublico({ puerto: impl, ahora: () => new Date('2026-10-27T10:00:00Z') }) };
}

describe('POST /api/solicitud/:token · servicio', () => {
  it('resuelve el token contra la ficha pública y escribe DOS documentos en un solo commit', async () => {
    const { servicio, escrituras, impl } = puerto();
    const lector = vi.spyOn(impl, 'leerDocumento');
    const resultado = await servicio.crearSolicitud('sol-inm-1-abc123', { solicitud: formulario() });
    expect(lector).toHaveBeenCalled();
    expect(escrituras).toHaveLength(2);
    expect(escrituras.map((e) => e.coleccion).sort()).toEqual(['candidatos', 'solicitudes']);
    for (const e of escrituras) expect(e.precondicion).toEqual({ tipo: 'NO_EXISTE' });
    const sol = escrituras.find((e) => e.coleccion === 'solicitudes')!;
    expect(sol.datos.inmuebleId).toBe('inm-1');
    expect(sol.datos.propietarioId).toBe('prop-1');
    expect(sol.datos.nombre).toBe('Persona Sintética');
    expect(sol.datos.email).toBe('sintetica@example.test');
    expect(sol.datos.telefono).toBe('600111222');
    expect(sol.datos.estado).toBe('CUESTIONARIO COMPLETADO');
    expect(resultado.solicitud.id).toBe(sol.id);
    expect(resultado.candidatoId).toBe(escrituras.find((e) => e.coleccion === 'candidatos')!.id);
  });

  it('IGNORA ids, propietario, estado e historial enviados por el cliente', async () => {
    const { servicio, escrituras } = puerto();
    await servicio.crearSolicitud('sol-inm-1-abc123', { solicitud: formulario() });
    const sol = escrituras.find((e) => e.coleccion === 'solicitudes')!;
    expect(sol.datos.id).not.toBe('sol-falso');
    expect(sol.datos.estado).not.toBe('SELECCIONADO');
    expect(sol.datos.ownerId).toBe('prop-1');
    expect(sol.datos.historial).toEqual([expect.objectContaining({ accion: 'Solicitud recibida' })]);
    expect((sol.datos.historial as unknown[]).length).toBe(1);
  });

  it('el token de cuestionario del candidato tiene 128 bits y no se deduce del id', async () => {
    const { servicio, escrituras } = puerto();
    await servicio.crearSolicitud('sol-inm-1-abc123', { solicitud: formulario() });
    const cand = escrituras.find((e) => e.coleccion === 'candidatos')!;
    expect(cand.datos.cuestionarioToken).toMatch(/^q-[0-9a-f]{32}$/);
    expect(cand.id).not.toBe('cand-1750000000000');
  });

  it('sin ficha pública (enlace inventado) ⇒ 404 y CERO escrituras', async () => {
    const { servicio, escrituras } = puerto({ ficha: null });
    await expect(servicio.crearSolicitud('sol-inventado-abc123', { solicitud: formulario() }))
      .rejects.toMatchObject({ codigo: 'ENLACE_NO_VALIDO', status: 404 });
    expect(escrituras).toHaveLength(0);
  });

  it('ficha no disponible ⇒ 404 y CERO escrituras', async () => {
    const alquilada: DocumentoLeido = { ...FICHA, datos: { ...FICHA.datos, estado: 'alquilado' } };
    const { servicio, escrituras } = puerto({ ficha: alquilada });
    await expect(servicio.crearSolicitud('sol-inm-1-abc123', { solicitud: formulario() }))
      .rejects.toMatchObject({ codigo: 'ENLACE_NO_VALIDO' });
    expect(escrituras).toHaveLength(0);
  });

  it.each([
    [{ candidatoNombre: '' }, 'CAMPO_NOMBRE'],
    [{ candidatoEmail: 'no-es-email' }, 'CAMPO_EMAIL_FORMATO'],
    [{ consentimientoAceptado: false }, 'CAMPO_CONSENTIMIENTO'],
    [{ consentimientoAceptado: undefined }, 'CAMPO_CONSENTIMIENTO'],
    [{ numAdultos: -3 }, 'CAMPO_NUMADULTOS'],
    [{ ingresosNetosMensuales: Number.POSITIVE_INFINITY }, 'CAMPO_INGRESOSNETOSMENSUALES'],
  ])('rechaza formulario inválido %j con %s y no escribe', async (parche, motivo) => {
    const { servicio, escrituras } = puerto();
    await expect(servicio.crearSolicitud('sol-inm-1-abc123', { solicitud: formulario(parche) }))
      .rejects.toMatchObject({ codigo: 'PETICION_INVALIDA', status: 400, motivo: expect.stringContaining(motivo.slice(0, 12)) });
    expect(escrituras).toHaveLength(0);
  });

  it('un payload anidado descomunado se corta y no se cuela como dato profundo', async () => {
    const profundo: Record<string, unknown> = { valor: 1 };
    let nodo: Record<string, unknown> = profundo;
    for (let i = 0; i < 10; i += 1) { nodo.hijo = { valor: i }; nodo = nodo.hijo as Record<string, unknown>; }
    const { servicio, escrituras } = puerto();
    await expect(servicio.crearSolicitud('sol-inm-1-abc123', {
      solicitud: formulario({ cuestionarioData: profundo }),
    })).rejects.toBeInstanceOf(ErrorPortalPublico);
    expect(escrituras).toHaveLength(0);
  });

  it('un CONFLICTO del commit se traduce en 409, nunca en éxito', async () => {
    const { servicio } = puerto({ commit: 'CONFLICTO' });
    await expect(servicio.crearSolicitud('sol-inm-1-abc123', { solicitud: formulario() }))
      .rejects.toMatchObject({ codigo: 'CONFLICTO', status: 409 });
  });

  it('token con formato inválido ⇒ 404 sin tocar la base', async () => {
    const { servicio, escrituras, impl } = puerto();
    const lector = vi.spyOn(impl, 'leerDocumento');
    await expect(servicio.crearSolicitud('../etc/passwd', { solicitud: formulario() }))
      .rejects.toMatchObject({ codigo: 'ENLACE_NO_VALIDO' });
    expect(lector).not.toHaveBeenCalled();
    expect(escrituras).toHaveLength(0);
  });
});
