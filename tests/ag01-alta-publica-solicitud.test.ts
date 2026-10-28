/**
 * AG-01 / P0.2 — Alta pública de solicitud: del permiso anónimo al SERVIDOR.
 * ---------------------------------------------------------------------------
 * Antes (AG-01): el portal construía el documento y lo escribía en Firestore
 * con la sesión anónima; la regla `solicitudes.create` exigía los alias
 * `nombre/email/telefono` y, si faltaban, la vista anunciaba éxito igualmente.
 *
 * Ahora (P0.2):
 *  · las reglas DENIEGAN cualquier `create` anónimo en `solicitudes` y
 *    `candidatos` (verificado con el harness real de `firestore.rules`);
 *  · el alta pasa por `POST /api/solicitud/:token`, con honeypot, rate limit
 *    y un commit atómico del servidor;
 *  · se conserva el contrato «sin falso éxito»: la vista solo muestra el acuse
 *    de recibo si la llamada al servidor confirma la escritura.
 *
 * El harness NO sustituye al emulador oficial (Java ausente en este sandbox);
 * la prueba con el motor de Google sigue en CI.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Candidato, SolicitudAlquiler } from '../src/types';
import { conIdentidadCanonica, registrarSolicitudPublica } from '../src/lib/solicitudPublica';
import { crearEvaluadorReglas } from './harness/firestoreRulesEval';

const RAIZ = resolve(__dirname, '..');
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), 'utf8');
const RULES = leer('firestore.rules');
const { permite } = crearEvaluadorReglas(RULES);
const APP = leer('src/App.tsx');
const VISTA = leer('src/components/PortalSolicitudPublicaView.tsx');
const CLIENTE = leer('src/lib/portalPublico.ts');

function solicitudDelPortal(): SolicitudAlquiler {
  return {
    id: 'sol-1750000000000', token: 'sol-inm-1-abc123', ownerId: 'owner-1',
    inmuebleId: 'inm-1', inmuebleNombre: 'Calle Ficticia 1, Alicante', inmueblePrecio: 900,
    candidatoId: 'cand-1750000000000', candidatoNombre: 'Persona Sintética',
    candidatoTelefono: '600000000', candidatoEmail: 'sintetica@example.test',
    numAdultos: 1, numMenores: 0, numTotalPersonas: 1,
    fechaEntradaAproximada: '2026-11-01', duracionPrevista: '1 año',
    tieneMascotas: false, esFumador: false, situacionLaboral: 'cuenta_ajena',
    tipoContrato: 'indefinido', antiguedadLaboral: '2 años',
    ingresosNetosMensuales: 1800, tieneAvalista: false,
    consentimientoAceptado: true, fechaConsentimiento: '2026-10-20T10:00:00.000Z',
    estado: 'CUESTIONARIO COMPLETADO', cuestionarioCompletado: true,
    documentosCompletados: false, documentos: [], historial: [],
    fechaCreacion: '2026-10-20', fechaActualizacion: '2026-10-20T10:00:00.000Z',
  };
}

function altaAnonima(documento: Record<string, unknown>, coleccion = 'solicitudes') {
  return permite(coleccion, 'create', {
    auth: null, db: {}, resource: null, requestResource: documento,
    docId: String(documento.id),
  });
}

describe('P0.2 · `firestore.rules` YA NO admite altas anónimas', () => {
  it('el documento histórico del portal (solo `candidato*`) es denegado', () => {
    expect(altaAnonima(solicitudDelPortal() as unknown as Record<string, unknown>)).toBe(false);
  });

  it('incluso CON los alias canónicos `nombre/email/telefono` es denegado', () => {
    const canonica = conIdentidadCanonica(solicitudDelPortal());
    expect(altaAnonima(canonica as unknown as Record<string, unknown>)).toBe(false);
    // El helper sigue siendo útil para otros flujos y conserva el modelo.
    expect(canonica.nombre).toBe('Persona Sintética');
    expect(canonica.candidatoNombre).toBe('Persona Sintética');
  });

  it('tampoco se puede crear un candidato anónimo con los campos mínimos', () => {
    expect(altaAnonima({
      id: 'cand-nuevo', nombre: 'N', email: 'n@t.local', telefono: '600', estado: 'nuevo',
    }, 'candidatos')).toBe(false);
  });

  it('el personal interno SÍ conserva el alta (reglas de ámbito)', () => {
    const master = {
      uid: 'u-master', token: { email: 'sarqsan2@gmail.com', email_verified: true },
    };
    expect(permite('solicitudes', 'create', {
      auth: master,
      db: { 'usuarios_auth/u-master': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', usuarioId: 'u' } },
      resource: null,
      requestResource: { id: 's', inmuebleId: 'inm-1', estado: 'NUEVA' },
      docId: 's',
    })).toBe(true);
  });
});

describe('AG-01/P0.2 · sin falso éxito en el alta pública', () => {
  const candidato = { id: 'cand-1', nombre: 'N', email: 'n@example.test', telefono: '600' } as Candidato;

  it('si el servidor rechaza, la promesa propaga y NO hay acuse de recibo', async () => {
    const guardarSolicitud = vi.fn(async () => { throw new Error('429 DEMASIADAS_PETICIONES'); });
    const guardarCandidato = vi.fn(async () => undefined);
    await expect(
      registrarSolicitudPublica(solicitudDelPortal(), candidato, { guardarSolicitud, guardarCandidato })
    ).rejects.toThrow('429 DEMASIADAS_PETICIONES');
    expect(guardarCandidato).not.toHaveBeenCalled();
  });

  it('el alta solo resuelve tras la escritura y devuelve el documento canónico', async () => {
    const orden: string[] = [];
    const guardarSolicitud = vi.fn(async (sol: SolicitudAlquiler) => {
      orden.push('solicitud');
      expect((sol as unknown as Record<string, unknown>).nombre).toBe('Persona Sintética');
    });
    const guardarCandidato = vi.fn(async () => { orden.push('candidato'); });
    const persistida = await registrarSolicitudPublica(solicitudDelPortal(), candidato, {
      guardarSolicitud, guardarCandidato,
    });
    expect(orden).toEqual(['solicitud', 'candidato']);
    expect(persistida.nombre).toBe('Persona Sintética');
  });

  it('P0.2: si el SERVIDOR devuelve ids/estado propios, la App usa esos valores', async () => {
    const guardarSolicitud = vi.fn(async () => ({
      ...solicitudDelPortal(),
      id: 'sol-servidor-1', candidatoId: 'cand-servidor-1', estado: 'NUEVA' as const,
    }));
    const persistida = await registrarSolicitudPublica(solicitudDelPortal(), null, { guardarSolicitud });
    expect(persistida.id).toBe('sol-servidor-1');
    expect(persistida.candidatoId).toBe('cand-servidor-1');
    expect(persistida.estado).toBe('NUEVA');
    // Los alias canónicos se conservan aunque el servidor no los repita.
    expect(persistida.nombre).toBe('Persona Sintética');
  });

  it('un fallo del candidato (secundario) no convierte un alta ya persistida en error', async () => {
    const avisarCandidatoNoGuardado = vi.fn();
    const guardarSolicitud = vi.fn(async () => undefined);
    const guardarCandidato = vi.fn(async () => { throw new Error('candidato no disponible'); });
    await expect(
      registrarSolicitudPublica(solicitudDelPortal(), candidato, {
        guardarSolicitud, guardarCandidato, avisarCandidatoNoGuardado,
      })
    ).resolves.toMatchObject({ nombre: 'Persona Sintética' });
    expect(avisarCandidatoNoGuardado).toHaveBeenCalledTimes(1);
  });
});

describe('P0.2 · invariantes del cableado cliente ↔ servidor', () => {
  it('la vista espera `onCompleteSolicitud` antes de marcar el envío como completado', () => {
    const espera = VISTA.indexOf('await onCompleteSolicitud(newSolicitud, newCandidate, honeypot);');
    const exito = VISTA.indexOf('setSubmitted(true);');
    expect(espera).toBeGreaterThan(-1);
    expect(exito).toBeGreaterThan(espera);
    expect(VISTA).toContain('data-testid="honeypot-solicitud"');
  });

  it('la vista no usa escrituras directas de Firestore', () => {
    expect(VISTA).not.toContain('saveSolicitudFirestore');
    expect(VISTA).not.toContain('saveCandidatoFirestore');
  });

  it('la App llama a la ruta de servidor y NO a las escrituras anónimas de Firebase', () => {
    expect(APP).toContain('registrarSolicitudPublica(');
    expect(APP).toContain('crearSolicitudPublicaPorToken(');
    expect(APP).not.toContain('guardarSolicitudPublicaFirestore');
    expect(APP).not.toContain('guardarCandidatoPublicoFirestore');
    expect(APP).toContain('onCompleteSolicitud={handleSavePublicSolicitud}');
  });

  it('el cliente público usa `/api/solicitud` y no importa el SDK de Firebase', () => {
    expect(CLIENTE).toContain("ruta('/api/solicitud', token)");
    expect(CLIENTE).not.toContain("from 'firebase/");
    expect(CLIENTE).toContain('_hp: honeypot');
  });

  it('la ruta del servidor aplica honeypot, rate limit y precondición NO_EXISTE', () => {
    expect(leer('server/portalPublico/rutasPortalPublico.ts')).toContain('honeypot(');
    expect(leer('server/portalPublico/rutasPortalPublico.ts')).toContain('DEMASIADAS_PETICIONES');
    const servicio = leer('server/portalPublico/servicioPortalPublico.ts');
    expect(servicio).toContain("precondicion: { tipo: 'NO_EXISTE' }");
    expect(servicio).toContain("coleccion: 'solicitudes'");
  });
});
