/**
 * AG-01 — Alta pública de solicitud: contrato cliente ↔ reglas y ausencia de
 * falso éxito.
 * ---------------------------------------------------------------------------
 * Se evalúa el TEXTO REAL de `firestore.rules` con el harness compartido
 * (`tests/harness/firestoreRulesEval.ts`). No es el emulador oficial: sin Java
 * en este entorno la verificación con el motor de Google queda pendiente (V),
 * pero el harness reproduce la condición exacta que denegaba el alta.
 *
 * Casos:
 *  A. El documento que construye el portal, tal como estaba (solo `candidato*`),
 *     es DENEGADO por `solicitudes.create` → confirma AG-01.
 *  B. Con los alias canónicos que añade `conIdentidadCanonica` es PERMITIDO.
 *  C. `registrarSolicitudPublica` solo resuelve si la solicitud se escribió; un
 *     rechazo se propaga y no se escribe el candidato.
 *  D. Invariantes de código: la vista espera la promesa antes del acuse de
 *     recibo y el alta usa la escritura estricta (no la que silencia errores).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Candidato, SolicitudAlquiler } from '../src/types';
import { conIdentidadCanonica, registrarSolicitudPublica } from '../src/lib/solicitudPublica';
import { crearEvaluadorReglas } from './harness/firestoreRulesEval';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(RULES);

/** Documento equivalente al que construía `PortalSolicitudPublicaView` (AG-01). */
function solicitudDelPortal(): SolicitudAlquiler {
  return {
    id: 'sol-1750000000000',
    token: 'sol-inm-1-abc123',
    ownerId: 'owner-1',
    inmuebleId: 'inm-1',
    inmuebleNombre: 'Calle Ficticia 1, Alicante',
    inmueblePrecio: 900,
    candidatoId: 'cand-1750000000000',
    candidatoNombre: 'Persona Sintética',
    candidatoTelefono: '600000000',
    candidatoEmail: 'sintetica@example.test',
    numAdultos: 1,
    numMenores: 0,
    numTotalPersonas: 1,
    fechaEntradaAproximada: '2026-11-01',
    duracionPrevista: '1 año',
    tieneMascotas: false,
    esFumador: false,
    situacionLaboral: 'cuenta_ajena',
    tipoContrato: 'indefinido',
    antiguedadLaboral: '2 años',
    ingresosNetosMensuales: 1800,
    tieneAvalista: false,
    consentimientoAceptado: true,
    fechaConsentimiento: '2026-10-20T10:00:00.000Z',
    estado: 'CUESTIONARIO COMPLETADO',
    cuestionarioCompletado: true,
    documentosCompletados: false,
    documentos: [],
    historial: [],
    fechaCreacion: '2026-10-20',
    fechaActualizacion: '2026-10-20T10:00:00.000Z',
  };
}

function altaAnonima(documento: Record<string, unknown>) {
  return permite('solicitudes', 'create', {
    auth: null,
    db: {},
    resource: null,
    requestResource: documento,
    docId: String(documento.id),
  });
}

describe('AG-01 · contrato con `firestore.rules` §4', () => {
  it('A · el documento anterior (solo `candidato*`) es denegado: defecto reproducido', () => {
    expect(altaAnonima(solicitudDelPortal() as unknown as Record<string, unknown>)).toBe(false);
  });

  it('B · con `nombre/email/telefono` canónicos el alta anónima es permitida', () => {
    const canonica = conIdentidadCanonica(solicitudDelPortal());
    expect(altaAnonima(canonica as unknown as Record<string, unknown>)).toBe(true);
    // Sin cambiar el modelo: los campos heredados se conservan.
    expect(canonica.candidatoNombre).toBe('Persona Sintética');
    expect(canonica.nombre).toBe('Persona Sintética');
    expect(canonica.email).toBe('sintetica@example.test');
    expect(canonica.telefono).toBe('600000000');
  });

  it('B2 · la regla sigue exigiendo los tres alias (ninguno se puede omitir)', () => {
    const base = conIdentidadCanonica(solicitudDelPortal()) as unknown as Record<string, unknown>;
    for (const clave of ['nombre', 'email', 'telefono']) {
      const { [clave]: _omitida, ...resto } = base;
      expect(altaAnonima(resto), `sin ${clave}`).toBe(false);
    }
  });
});

describe('AG-01 · sin falso éxito en el alta pública', () => {
  const candidato = { id: 'cand-1', nombre: 'N', email: 'n@example.test', telefono: '600' } as Candidato;

  it('C1 · si la solicitud no se persiste, la promesa rechaza y NO se intenta el candidato', async () => {
    const guardarSolicitud = vi.fn(async () => {
      throw new Error('Missing or insufficient permissions.');
    });
    const guardarCandidato = vi.fn(async () => undefined);

    await expect(
      registrarSolicitudPublica(solicitudDelPortal(), candidato, { guardarSolicitud, guardarCandidato })
    ).rejects.toThrow('Missing or insufficient permissions.');
    expect(guardarCandidato).not.toHaveBeenCalled();
  });

  it('C2 · el alta solo resuelve tras escribir `solicitudes` y devuelve el documento canónico', async () => {
    const orden: string[] = [];
    const guardarSolicitud = vi.fn(async (sol: SolicitudAlquiler) => {
      orden.push('solicitud');
      expect((sol as unknown as Record<string, unknown>).nombre).toBe('Persona Sintética');
    });
    const guardarCandidato = vi.fn(async () => {
      orden.push('candidato');
    });

    const persistida = await registrarSolicitudPublica(solicitudDelPortal(), candidato, {
      guardarSolicitud,
      guardarCandidato,
    });

    expect(orden).toEqual(['solicitud', 'candidato']);
    expect(persistida.nombre).toBe('Persona Sintética');
  });

  it('C3 · un fallo del candidato (secundario) no convierte un alta ya persistida en error', async () => {
    const avisarCandidatoNoGuardado = vi.fn();
    const guardarSolicitud = vi.fn(async () => undefined);
    const guardarCandidato = vi.fn(async () => {
      throw new Error('candidato no disponible');
    });

    await expect(
      registrarSolicitudPublica(solicitudDelPortal(), candidato, {
        guardarSolicitud,
        guardarCandidato,
        avisarCandidatoNoGuardado,
      })
    ).resolves.toMatchObject({ nombre: 'Persona Sintética' });
    expect(avisarCandidatoNoGuardado).toHaveBeenCalledTimes(1);
  });
});

describe('AG-01 · invariantes de código', () => {
  const vista = readFileSync(resolve(RAIZ, 'src/components/PortalSolicitudPublicaView.tsx'), 'utf8');
  const app = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');

  it('D1 · la vista espera `onCompleteSolicitud` antes de marcar el envío como completado', () => {
    const posicionEspera = vista.indexOf('await onCompleteSolicitud(newSolicitud, newCandidate);');
    const posicionExito = vista.indexOf('setSubmitted(true);');
    expect(posicionEspera).toBeGreaterThan(-1);
    expect(posicionExito).toBeGreaterThan(posicionEspera);
  });

  it('D2 · la vista no usa la escritura silenciosa de solicitudes', () => {
    expect(vista).not.toContain('saveSolicitudFirestore');
    expect(vista).not.toContain('saveCandidatoFirestore');
  });

  it('D3 · la App usa la persistencia estricta y devuelve la promesa a la vista', () => {
    expect(app).toContain('registrarSolicitudPublica(');
    expect(app).toContain('guardarSolicitudPublicaFirestore');
    expect(app).toContain('onCompleteSolicitud={handleSavePublicSolicitud}');
  });
});
