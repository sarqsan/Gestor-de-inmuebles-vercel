/**
 * FASE 2 — Recuperación de tokens públicos (delta de Arena C `checkUrlForTokens`).
 * ---------------------------------------------------------------------------
 * Fuente C: commit a6ac280, `App.tsx / checkUrlForTokens` (limpieza de tokens
 * obsoletos cuando dejan de estar presentes en la URL).
 *
 * Adaptación B: el sistema de navegación de main (estado + montaje/hashchange,
 * sin router) se conserva; la resolución vive en el helper puro
 * `src/lib/tokensPublicos.ts` y `App.tsx` lo invoca para las 4 superficies
 * heredadas (visita, solicitud, documentación, cuestionario) con semántica
 * set-or-clear. Las rutas públicas nuevas de main (`?registro`, `?registroInq`,
 * `?registroProp`, `/registro/`) quedan fuera del helper y siguen set-only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolverTokensPublicos,
  resolverTokensPublicosDesdeUrl,
} from '../src/lib/tokensPublicos';

const RAIZ = resolve(__dirname, '..');

describe('tokens públicos · query params (conservar cuando presente)', () => {
  it.each([
    ['visita', 'https://x.test/?visita=vst-1', 'visita', 'vst-1'],
    ['visitaToken (alias)', 'https://x.test/?visitaToken=vst-2', 'visita', 'vst-2'],
    ['solicitud', 'https://x.test/?solicitud=sol-1', 'solicitud', 'sol-1'],
    ['solicitudToken (alias)', 'https://x.test/?solicitudToken=sol-2', 'solicitud', 'sol-2'],
    ['documentacion', 'https://x.test/?documentacion=doc-1', 'documentacion', 'doc-1'],
    ['docToken (alias)', 'https://x.test/?docToken=doc-2', 'documentacion', 'doc-2'],
    ['doc (alias)', 'https://x.test/?doc=doc-3', 'documentacion', 'doc-3'],
    ['cuestionario', 'https://x.test/?cuestionario=q-1', 'cuestionario', 'q-1'],
    ['cuestionarioToken (alias)', 'https://x.test/?cuestionarioToken=q-2', 'cuestionario', 'q-2'],
  ])('%s → se conserva', (_nombre, url, campo, esperado) => {
    const resueltos = resolverTokensPublicosDesdeUrl(url);
    expect(resueltos[campo as keyof typeof resueltos]).toBe(esperado);
  });
});

describe('tokens públicos · path y hash', () => {
  it.each([
    ['https://x.test/visita/vst-9', 'visita', 'vst-9'],
    ['https://x.test/solicitud/sol-9', 'solicitud', 'sol-9'],
    ['https://x.test/documentacion/doc-9', 'documentacion', 'doc-9'],
    ['https://x.test/cuestionario/q-9', 'cuestionario', 'q-9'],
    ['https://x.test/#/visita/vst-h', 'visita', 'vst-h'],
    ['https://x.test/#solicitud/sol-h', 'solicitud', 'sol-h'],
    ['https://x.test/#/documentacion/doc-h', 'documentacion', 'doc-h'],
    ['https://x.test/#cuestionario/q-h', 'cuestionario', 'q-h'],
  ])('%s → %s', (url, campo, esperado) => {
    const resueltos = resolverTokensPublicosDesdeUrl(url);
    expect(resueltos[campo as keyof typeof resueltos]).toBe(esperado);
  });

  it('el segmento de path prevalece sobre la query (precedencia observable de C)', () => {
    const resueltos = resolverTokensPublicosDesdeUrl('https://x.test/visita/desde-path?visita=desde-query');
    expect(resueltos.visita).toBe('desde-path');
  });
});

describe('tokens públicos · limpieza cuando ausente', () => {
  it('URL sin tokens → los cuatro a null', () => {
    expect(resolverTokensPublicosDesdeUrl('https://x.test/')).toEqual({
      visita: null,
      solicitud: null,
      documentacion: null,
      cuestionario: null,
    });
  });

  it('cambiar de superficie no conserva el token incompatible', () => {
    // Estado anterior hipotético: visita=vst-1. Nueva URL de solicitud.
    const resueltos = resolverTokensPublicosDesdeUrl('https://x.test/?solicitud=sol-nueva');
    expect(resueltos.visita).toBeNull();
    expect(resueltos.solicitud).toBe('sol-nueva');
    expect(resueltos.documentacion).toBeNull();
    expect(resueltos.cuestionario).toBeNull();
  });

  it('parámetro vacío equivale a ausente', () => {
    expect(resolverTokensPublicosDesdeUrl('https://x.test/?visita=').visita).toBeNull();
    expect(resolverTokensPublicos({ pathname: '/visita/', hash: '', search: '' }).visita).toBeNull();
  });
});

describe('tokens públicos · saneado del segmento (adaptación B)', () => {
  it('recorta restos de query pegados al segmento de path', () => {
    // C tomaba el resto crudo (`abc?x=1`); aquí se recorta a `abc`.
    expect(resolverTokensPublicos({ pathname: '/visita/abc', hash: '', search: '?x=1' }).visita).toBe('abc');
    expect(
      resolverTokensPublicos({ pathname: '/solicitud/abc/def', hash: '', search: '' }).solicitud
    ).toBe('abc');
  });

  it('recorta restos en el hash', () => {
    expect(resolverTokensPublicos({ pathname: '/', hash: '#visita/abc&otro=1', search: '' }).visita).toBe(
      'abc'
    );
  });

  it('ignora espacios en blanco', () => {
    expect(resolverTokensPublicosDesdeUrl('https://x.test/?visita=%20%20').visita).toBeNull();
  });
});

describe('tokens públicos · rutas nuevas de main intactas', () => {
  it('el resolver ignora ?registro/?registroInq/?registroProp', () => {
    const resueltos = resolverTokensPublicosDesdeUrl(
      'https://x.test/?registro=enlace_1&registroInq=enlace_2&registroProp=enlace_3'
    );
    expect(resueltos).toEqual({ visita: null, solicitud: null, documentacion: null, cuestionario: null });
  });

  it('App.tsx cablea el resolver y conserva el set-only de registro', () => {
    const src = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf-8');
    // Cableado nuevo: resolución pura + set-or-clear de las 4 heredadas.
    expect(src).toContain("from './lib/tokensPublicos'");
    expect(src).toContain('resolverTokensPublicos(window.location)');
    expect(src).toContain('setActivePublicVisitaToken(tokensPublicos.visita)');
    expect(src).toContain('setActivePublicSolicitudToken(tokensPublicos.solicitud)');
    expect(src).toContain('setActivePublicDocToken(tokensPublicos.documentacion)');
    expect(src).toContain('setActivePublicQuestionnaireToken(tokensPublicos.cuestionario)');
    // Rutas nuevas de main: set-only intacto (sin limpieza).
    expect(src).toContain('setActivePublicRegistroToken(regToken)');
    expect(src).toContain('setActivePublicRegistroInqId(regInq)');
    expect(src).toContain('setActivePublicRegistroPropId(regProp)');
    // Sin segundo sistema de navegación.
    expect(src).not.toMatch(/react-router|useNavigate|createBrowserRouter/);
  });
});
