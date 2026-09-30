import { describe, it, expect } from 'vitest';
import {
  AVISO_NO_GUARDADO,
  ErrorFirestore,
  esErrorFirestore,
  extraerCodigoFirebase,
  normalizarErrorFirestore,
} from './erroresFirestore';

/**
 * BLOQUE 1 — Errores de Firestore comprensibles.
 *
 * Criterio cubierto: "si Firestore rechaza la escritura, el usuario ve el motivo".
 * Antes el servicio hacía `console.error` y la UI confirmaba la operación igual.
 */
describe('BLOQUE 1 · Normalización de errores de Firestore', () => {
  it('traduce permission-denied a un mensaje accionable en español', () => {
    const err = normalizarErrorFirestore({ code: 'permission-denied' }, 'eliminación del inmueble');

    expect(esErrorFirestore(err)).toBe(true);
    expect(err.codigo).toBe('PERMISOS');
    expect(err.codigoOriginal).toBe('permission-denied');
    expect(err.mensajeUsuario).not.toMatch(/permission-denied/i);
    expect(err.mensajeUsuario.length).toBeGreaterThan(20);
    expect(err.operacion).toBe('eliminación del inmueble');
  });

  it('traduce los códigos de red, sesión y validación', () => {
    const red = normalizarErrorFirestore({ code: 'firestore/unavailable' }, 'alta de inmueble');
    const sesion = normalizarErrorFirestore({ code: 'unauthenticated' }, 'alta de inmueble');
    const validacion = normalizarErrorFirestore({ code: 'invalid-argument' }, 'alta de inmueble');

    expect(red.codigo).toBe('RED');
    expect(sesion.codigo).toBe('SESION');
    expect(validacion.codigo).toBe('VALIDACION');
  });

  it('un error desconocido sigue produciendo un mensaje utilizable', () => {
    const err = normalizarErrorFirestore(new Error('boom inesperado'), 'guardado de cambios');
    expect(err.codigo).toBe('DESCONOCIDO');
    expect(err.mensajeTecnico).toContain('boom inesperado');
    expect(err.mensajeUsuario.length).toBeGreaterThan(20);
  });

  it('soporta errores que no son objetos (string, null, undefined)', () => {
    expect(normalizarErrorFirestore('fallo textual', 'op').codigo).toBe('DESCONOCIDO');
    expect(normalizarErrorFirestore(null, 'op').codigo).toBe('DESCONOCIDO');
    expect(normalizarErrorFirestore(undefined, 'op').codigo).toBe('DESCONOCIDO');
  });

  it('añade la consecuencia real de la operación (qué NO pasó)', () => {
    const err = normalizarErrorFirestore(
      { code: 'permission-denied' },
      'eliminación del inmueble',
      AVISO_NO_GUARDADO
    );
    expect(err.mensajeUsuario).toContain('NO se han guardado');
  });

  it('mensaje específico para un rechazo de permisos sobre un inmueble', () => {
    const err = normalizarErrorFirestore({ code: 'permission-denied' }, 'alta de inmueble');
    expect(err.mensajeUsuario).toMatch(/titularidad|permisos/i);
  });

  it('no vuelve a envolver un error ya normalizado (idempotente)', () => {
    const primero = normalizarErrorFirestore({ code: 'unavailable' }, 'op');
    const segundo = normalizarErrorFirestore(primero, 'op');
    expect(segundo.codigo).toBe('RED');
    expect(segundo.mensajeTecnico).toBe(primero.mensajeTecnico);
  });

  it('extrae el código con y sin prefijo "firestore/"', () => {
    expect(extraerCodigoFirebase({ code: 'permission-denied' })).toBe('permission-denied');
    expect(extraerCodigoFirebase({ code: 'firestore/permission-denied' })).toBe('permission-denied');
    expect(extraerCodigoFirebase({ code: 123 })).toBeUndefined();
    expect(extraerCodigoFirebase(null)).toBeUndefined();
  });

  it('esErrorFirestore discrimina correctamente', () => {
    const err: ErrorFirestore = normalizarErrorFirestore({ code: 'not-found' }, 'op');
    expect(esErrorFirestore(err)).toBe(true);
    expect(esErrorFirestore(new Error('x'))).toBe(false);
    expect(esErrorFirestore({ esErrorFirestore: 'true' })).toBe(false);
  });
});
