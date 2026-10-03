/**
 * INSTRUMENTACIÓN DIAGNÓSTICA «Lectura · Inmuebles: No tienes permisos…».
 *
 * Comprueba, sobre el módulo PURO, que la clasificación de la denegación es la
 * que dicta la regla del repositorio (`match /inmuebles/{inmuebleId}`):
 *  · estado observable cumplido + denegación persistente ⇒ el veredicto NO acusa
 *    a la persona ni a la consulta (la regla publicada o el planificador quedan
 *    fuera del cliente);
 *  · cualquier divergencia entre el `pid` de la consulta, el espejo y la ficha
 *    se señala como causa de identidad/perfil.
 * Y sobre el CABLEADO real: las cinco lecturas de `inmuebles` están etiquetadas y
 * los cuatro puntos de reporte siguen intactos (la instrumentación no sustituye
 * ningún camino de error).
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  TRAZA_INMUEBLES,
  construirInformeInmuebles,
  diagnosticosInmuebles,
  evaluarComprobacionesInmuebles,
  limpiarDiagnosticosInmuebles,
  registrarDiagnosticoInmuebles,
  renderInformeInmuebles,
  textoDiagnosticosInmuebles,
  type ContextoLecturaInmuebles,
  type ObservacionEspejoInmuebles,
} from '../src/lib/diagnosticoInmuebles';
import type { LecturaDocumento } from '../src/lib/diagnosticoCarteras';

const UID = 'uid-auth-1';
const USUARIO = 'usuario-1';
const PID = 'prop-1';

const espejo = (extra: Record<string, unknown> = {}): LecturaDocumento => ({
  estado: 'EXISTE',
  datos: {
    uid: UID,
    usuarioId: USUARIO,
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    propietarioId: PID,
    inmuebleIds: [],
    carterasL: [],
    carterasE: [],
    ...extra,
  },
});

const perfil = (extra: Record<string, unknown> = {}): LecturaDocumento => ({
  estado: 'EXISTE',
  datos: { authUid: UID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: PID, ...extra },
});

const ctx = (extra: Partial<ContextoLecturaInmuebles> = {}): ContextoLecturaInmuebles => ({
  origen: 'INM-COT',
  consulta: "inmuebles where('titularesIds','array-contains', pid)  [cotitularidad]",
  pid: PID,
  authUid: UID,
  tipoPerfil: 'PROPIETARIO',
  propietarioIdCliente: PID,
  numeroInmuebleIds: 0,
  numeroInmueblesParciales: 0,
  numeroCarterasGestionadas: 0,
  proyecto: 'gestor-inmuebles-produccion',
  baseDeDatos: 'ai-studio-gestordeinmueble-ejemplo',
  codigoError: 'permission-denied',
  mensajeError: 'Missing or insufficient permissions.',
  ...extra,
});

const obs = (extra: Partial<ObservacionEspejoInmuebles> = {}): ObservacionEspejoInmuebles => ({
  espejo: espejo(),
  perfil: perfil(),
  perfilPorUid: { estado: 'NO_EXISTE' },
  ...extra,
});

describe('diagnóstico de inmuebles · veredicto por escucha', () => {
  it('INM-COT con espejo y ficha veraces y pid correcto: el estado observable cumple la regla', () => {
    const informe = construirInformeInmuebles({ ctx: ctx(), observacion: obs(), momento: '2026-10-03T00:00:00.000Z' });
    expect(informe.causa).toBe('ESTADO_CUMPLE_LA_REGLA');
    expect(informe.lectura).toContain('reglas PUBLICADAS');
    expect(informe.comprobaciones.every((c) => c.ok !== false)).toBe(true);
  });

  it('INM-COT con un pid que NO es el propietarioId del espejo: la consulta es indemostrable', () => {
    const informe = construirInformeInmuebles({
      ctx: ctx({ pid: 'otro-propietario' }),
      observacion: obs(),
      momento: '2026-10-03T00:00:00.000Z',
    });
    // El primer término que falla, en el orden de la regla, es myPropId() == pid.
    expect(informe.causa).toBe('PID_DISTINTO_DEL_ESPEJO');
    expect(informe.comprobaciones.find((c) => c.id === 'PID_ESPEJO')?.ok).toBe(false);
  });

  it('espejo ilegible (denegado o inexistente) es causa de identidad, no de consulta', () => {
    const informe = construirInformeInmuebles({
      ctx: ctx({ origen: 'INM-OWN', consulta: "inmuebles where('propietarioId','==', pid)  [propios]" }),
      observacion: obs({ espejo: { estado: 'DENEGADA' }, perfil: null }),
      momento: '2026-10-03T00:00:00.000Z',
    });
    expect(informe.causa).toBe('ESPEJO_AUSENTE_O_ILEGIBLE');
  });

  it('perfilActualVeraz() cae si el tipoPerfil de la ficha no coincide con el espejo', () => {
    const informe = construirInformeInmuebles({
      ctx: ctx(),
      observacion: obs({ perfil: perfil({ tipoPerfil: 'PROFESIONAL' }) }),
      momento: '2026-10-03T00:00:00.000Z',
    });
    expect(informe.causa).toBe('PERFIL_NO_VERAZ');
    const veraz = informe.comprobaciones.find((c) => c.id === 'PERFIL_VERAZ');
    expect(veraz?.ok).toBe(false);
    expect(veraz?.observado).toContain('tipoPerfil');
  });

  it('INM-GEST señala la cartera que el espejo no indexa', () => {
    const informe = construirInformeInmuebles({
      ctx: ctx({
        origen: 'INM-GEST',
        consulta: "inmuebles where('propietarioId','==', pid)  [cartera gestionada]",
        pid: 'prop-gestionado',
      }),
      observacion: obs(),
      momento: '2026-10-03T00:00:00.000Z',
    });
    expect(informe.causa).toBe('CARTERA_NO_INDEXADA_EN_EL_ESPEJO');
  });

  it('INM-ID distingue un id ajeno/obsoleto de una delegación parcial (no concluyente)', () => {
    const ajeno = construirInformeInmuebles({
      ctx: ctx({ origen: 'INM-ID', consulta: 'get(inmuebles/inm-9)', inmuebleId: 'inm-9', inmuebleIdEnEspejo: false, inmuebleIdParcial: false }),
      observacion: obs(),
      momento: '2026-10-03T00:00:00.000Z',
    });
    expect(ajeno.causa).toBe('INMUEBLE_NO_AUTORIZADO_O_INEXISTENTE');
    const parcial = construirInformeInmuebles({
      ctx: ctx({ origen: 'INM-ID', consulta: 'get(inmuebles/inm-9)', inmuebleId: 'inm-9', inmuebleIdEnEspejo: false, inmuebleIdParcial: true }),
      observacion: obs(),
      momento: '2026-10-03T00:00:00.000Z',
    });
    expect(parcial.causa).toBe('INCONCLUSA');
  });

  it('INM-ADMIN sin ficha usuarios/{uid} es denegación por diseño (colección completa)', () => {
    const informe = construirInformeInmuebles({
      ctx: ctx({ origen: 'INM-ADMIN', consulta: 'inmuebles (colección completa, sin where)', pid: null }),
      observacion: obs({ perfilPorUid: { estado: 'NO_EXISTE' } }),
      momento: '2026-10-03T00:00:00.000Z',
    });
    expect(informe.causa).toBe('SIN_AMBITO_ADMINISTRATIVO');
  });

  it('el informe renderizado identifica la escucha y no imprime documentos completos', () => {
    const informe = construirInformeInmuebles({ ctx: ctx(), observacion: obs(), momento: '2026-10-03T00:00:00.000Z' });
    const texto = renderInformeInmuebles(informe);
    expect(texto.startsWith(TRAZA_INMUEBLES)).toBe(true);
    expect(texto).toContain('origen=INM-COT');
    expect(texto).toContain('pid=');
    expect(informe.espejo).not.toHaveProperty('email');
    expect(informe.espejo).not.toHaveProperty('nombre');
  });

  it('la evaluación reproduce los términos de la regla del repositorio', () => {
    const comprobaciones = evaluarComprobacionesInmuebles(ctx(), obs());
    const porId = new Map(comprobaciones.map((c) => [c.id, c.regla]));
    expect(porId.get('PERFIL_VERAZ')).toContain('perfilActualVeraz');
    expect(porId.get('PID_ESPEJO')).toContain('myPropId');
    expect(porId.get('ESPEJO_EXISTE')).toContain('usuarios_auth');
  });
});

describe('diagnóstico de inmuebles · registro visible (observador pasivo)', () => {
  const informe = (extra: Partial<ContextoLecturaInmuebles> = {}) =>
    construirInformeInmuebles({
      ctx: ctx(extra),
      observacion: obs(),
      momento: '2026-10-03T00:00:00.000Z',
    });

  it('conserva TODOS los errores en orden temporal, sin sobrescribir ninguno', () => {
    limpiarDiagnosticosInmuebles();
    registrarDiagnosticoInmuebles(informe({ origen: 'INM-OWN', consulta: 'where propietarioId == pid' }));
    registrarDiagnosticoInmuebles(informe({ origen: 'INM-COT' }));
    registrarDiagnosticoInmuebles(informe({ origen: 'INM-ID', inmuebleId: 'inm-9' }));

    const entradas = diagnosticosInmuebles();
    expect(entradas.map((e) => e.numero)).toEqual([1, 2, 3]);
    expect(entradas.map((e) => e.origen)).toEqual(['INM-OWN', 'INM-COT', 'INM-ID']);
    expect(entradas[0].momento).toBe('2026-10-03T00:00:00.000Z');
  });

  it('expone las correspondencias de identidad ya observadas (nunca nuevas lecturas)', () => {
    limpiarDiagnosticosInmuebles();
    registrarDiagnosticoInmuebles(informe());
    const [entrada] = diagnosticosInmuebles();
    expect(entrada.tipoPerfil).toBe('PROPIETARIO');
    expect(entrada.usuarioIdEspejo).toBe(USUARIO);
    expect(entrada.propietarioIdCliente).toBe(PID);
    expect(entrada.pid).toBe(PID);
    expect(entrada.propietarioIdEspejo).toBe(PID);
    expect(entrada.propietarioIdPerfil).toBe(PID);
    expect(entrada.codigoError).toBe('permission-denied');
  });

  it('el texto de «Copiar diagnóstico» son solo bloques [DIAG-INMUEBLES] técnicos', () => {
    limpiarDiagnosticosInmuebles();
    registrarDiagnosticoInmuebles(informe({ origen: 'INM-OWN' }));
    registrarDiagnosticoInmuebles(informe({ origen: 'INM-COT' }));
    const texto = textoDiagnosticosInmuebles();
    expect((texto.match(/\[DIAG-INMUEBLES\]/g) || []).length).toBe(2);
    expect(texto.indexOf('origen=INM-OWN')).toBeLessThan(texto.indexOf('origen=INM-COT'));
    expect(texto).not.toMatch(/ana@erp\.test|password|token/i);
  });

  it('«Limpiar diagnóstico» vacía solo el registro visible', () => {
    limpiarDiagnosticosInmuebles();
    registrarDiagnosticoInmuebles(informe());
    expect(diagnosticosInmuebles()).toHaveLength(1);
    limpiarDiagnosticosInmuebles();
    expect(diagnosticosInmuebles()).toHaveLength(0);
    expect(textoDiagnosticosInmuebles()).toContain('sin errores de inmuebles en esta sesión');
  });
});

describe('diagnóstico de inmuebles · cableado real', () => {
  const fb = fs.readFileSync(path.resolve(__dirname, '../src/lib/firebase.ts'), 'utf8');

  it('las cinco lecturas están etiquetadas individualmente', () => {
    for (const origen of ['INM-OWN', 'INM-COT', 'INM-GEST', 'INM-ID', 'INM-ADMIN']) {
      expect(fb).toContain(`origen: '${origen}'`);
    }
  });

  it('la instrumentación NO sustituye ningún reporte ni cambia ninguna consulta', () => {
    // Los cuatro caminos de error de inmuebles siguen llamando al canal.
    expect((fb.match(/reportarErrorLectura\('inmuebles', err/g) || []).length).toBe(4);
    // Las consultas son exactamente las mismas (una por forma demostrable).
    expect(fb).toContain("where('propietarioId', '==', pid)");
    expect(fb).toContain("where('titularesIds', 'array-contains', pid)");
    // El diagnóstico es solo lectura y solo consola.
    expect(fb).toContain('leerDocumentoPropio(');
    expect(fb).not.toMatch(/setDoc\([^\n]*inmuebles[^\n]*diagnostic/i);
  });
});
