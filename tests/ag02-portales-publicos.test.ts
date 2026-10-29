/**
 * AG-02 — Invariantes de los portales públicos por token.
 * ---------------------------------------------------------------------------
 * Los portales anónimos de visita, cuestionario y documentación ya no pueden
 * depender de lecturas/escrituras directas (las reglas las deniegan). Estas
 * comprobaciones fijan el contrato del repositorio:
 *  · la App monta los contenedores de servidor para el visitante anónimo;
 *  · las suscripciones a `invitaciones`, `slots_visita` y
 *    `solicitudes_documentacion` solo se abren con sesión;
 *  · el cliente público habla con `/api/...` y no importa el SDK de Firebase;
 *  · la reserva/cancelación de visita espera la confirmación del servidor.
 *
 * No sustituyen a la prueba manual de los tres enlaces ni al emulador oficial
 * (pendientes: V). Fijan lo que sí se puede demostrar en el árbol.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generarTokenCapacidad } from '../src/lib/tokensPublicos';

const RAIZ = resolve(__dirname, '..');
const leer = (ruta: string) => readFileSync(resolve(RAIZ, ruta), 'utf8');

const APP = leer('src/App.tsx');
const CLIENTE = leer('src/lib/portalPublico.ts');
const VISTA_VISITA = leer('src/components/PortalVisitaPublicaView.tsx');
const MODAL_CANDIDATO = leer('src/components/CandidateModal.tsx');
const FIREBASE = leer('src/lib/firebase.ts');
const MODAL_CUESTIONARIO = leer('src/components/EnviarCuestionarioModal.tsx');

describe('AG-02 · tokens de capacidad', () => {
  it('genera 128 bits con el prefijo esperado y sin colisiones prácticas', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generarTokenCapacidad('q')));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^q-[0-9a-f]{32}$/);
    }
  });

  it('el alta pública de solicitud no reutiliza un token predecible', () => {
    expect(APP).toContain("cuestionarioToken: generarTokenCapacidad('q')");
    expect(APP).not.toContain('cuestionarioToken: `q-${newSol.id}`');
  });
});

describe('AG-02 · App y suscripciones', () => {
  it('el visitante anónimo monta los contenedores de servidor de los tres portales', () => {
    expect(APP).toContain('if (!currentUser) {\n      return <PortalDocumentacionPublicaServidor token={activePublicDocToken} />;');
    expect(APP).toContain('if (!currentUser) {\n      return <PortalVisitaPublicaServidor token={activePublicVisitaToken} />;');
    expect(APP).toContain('if (!currentUser) {\n      return <CuestionarioPublicoServidor token={activePublicQuestionnaireToken} />;');
  });

  it('las tres suscripciones del funnel solo se abren con sesión', () => {
    const inicio = APP.indexOf('const claveInmueblesAlquiler');
    const fin = APP.indexOf('// Ref to track candidate questionnaires', inicio);
    const efecto = APP.slice(inicio, fin);
    expect(efecto).toContain('if (!currentUser ||');
    expect(efecto).toContain('const unsubscribeInv = subscribeInvitaciones(');
    expect(efecto).toContain('const unsubscribeSlot = subscribeVisitSlots(');
    expect(efecto).toContain('const unsubscribeDoc = subscribeSolicitudesDoc(');
    expect(efecto).toContain('}), dataScope)');
  });

  it('la ficha pública de la App ya solo se resuelve para el alta de solicitud', () => {
    expect(APP).toContain('if (!activePublicSolicitudToken) {');
    expect(APP).toContain('await cargarFichaPublicaPorToken(activePublicSolicitudToken)');
    // Las ramas anónimas de visita/cuestionario ya no buscan el candidato o la
    // invitación en el estado local (que solo se llena con sesión).
    expect(APP).not.toContain("const inv = invitaciones.find((i) => i.token === activePublicVisitaToken)");
  });
});

describe('AG-02 · cliente público', () => {
  it('usa las rutas de servidor y no importa el SDK de Firebase', () => {
    expect(CLIENTE).toContain("'/api/visita'");
    expect(CLIENTE).toContain("'/api/cuestionario'");
    expect(CLIENTE).toContain("'/api/documentacion'");
    expect(CLIENTE).not.toMatch(/from ['"]firebase/);
    expect(CLIENTE).not.toMatch(/from ['"]\.\.?\/firebase/);
  });

  it('no escribe documentos desde el navegador en los contenedores públicos', () => {
    for (const archivo of [
      'src/components/portal-publico/PortalVisitaPublicaServidor.tsx',
      'src/components/portal-publico/CuestionarioPublicoServidor.tsx',
      'src/components/portal-publico/PortalDocumentacionPublicaServidor.tsx',
    ]) {
      const fuente = leer(archivo);
      expect(fuente, archivo).not.toMatch(/from ['"].*firebase['"]/);
      expect(fuente, archivo).not.toContain('saveCandidatoFirestore');
      expect(fuente, archivo).not.toContain('saveSolicitudDocFirestore');
      expect(fuente, archivo).not.toMatch(/bookSlotTransaction\s*\(/);
    }
  });
});

describe('AG-02 · vista de visita', () => {
  it('acepta las operaciones de servidor y no las usa de forma optimista', () => {
    expect(VISTA_VISITA).toContain('reservarRemoto?:');
    expect(VISTA_VISITA).toContain('cancelarRemoto?:');
    expect(VISTA_VISITA).toContain('await cancelarRemoto(invitacion);');
    const posicionRemoto = VISTA_VISITA.indexOf('await cancelarRemoto(invitacion);');
    const posicionExito = VISTA_VISITA.indexOf('setSuccessMessage(\'Tu reserva ha sido cancelada');
    expect(posicionExito).toBeGreaterThan(posicionRemoto);
  });

  it('conserva el camino autenticado (bookSlotTransaction) cuando no hay operación de servidor', () => {
    expect(VISTA_VISITA).toContain(': bookSlotTransaction(');
  });
});


describe('AG-02 · enlaces que deben resolver en el servidor', () => {
  it('el enlace de visita usa el token de la invitación, no el del cuestionario', () => {
    expect(MODAL_CANDIDATO).toContain('invitaciones.find');
    expect(MODAL_CANDIDATO).toContain('/#visita/${invitacionVisita.token}');
    expect(MODAL_CANDIDATO).not.toContain("candidato.cuestionarioToken || `vst-");
  });

  it('no se inventa un token de cuestionario en la lectura de candidatos', () => {
    expect(FIREBASE).not.toContain('`q-${docSnap.id}`');
    expect(MODAL_CUESTIONARIO).toContain("generarTokenCapacidad('q')");
  });
});
