/**
 * BLOQUE 10 · UX-3 — MENSAJES SIN DETALLES TÉCNICOS.
 *
 * La persona usuaria nunca debe ver códigos del SDK, nombres de colecciones,
 * excepciones de JavaScript ni stack traces; el detalle técnico queda en consola.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { esMensajeTecnico, mensajeDeErrorUsuario } from './mensajes';

afterEach(() => vi.restoreAllMocks());

describe('UX-3 · detección de mensajes técnicos', () => {
  it('detecta códigos y textos del SDK', () => {
    expect(esMensajeTecnico('FirebaseError: Missing or insufficient permissions.')).toBe(true);
    expect(esMensajeTecnico('permission-denied')).toBe(true);
    expect(esMensajeTecnico('storage/unauthorized: User is not authorized.')).toBe(true);
    expect(esMensajeTecnico('Cannot read properties of undefined (reading id)')).toBe(true);
    expect(esMensajeTecnico('Error: [object Object]')).toBe(true);
  });

  it('acepta los mensajes de negocio ya redactados para la persona usuaria', () => {
    expect(esMensajeTecnico('No se ha podido guardar el inmueble.')).toBe(false);
    expect(esMensajeTecnico('El motivo de anulación es obligatorio.')).toBe(false);
  });
});

describe('UX-3 · traducción de errores', () => {
  it('sustituye un error técnico por el contexto de la operación', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mensaje = mensajeDeErrorUsuario(
      new Error('FirebaseError: Missing or insufficient permissions.'),
      'No se ha podido eliminar el documento.'
    );
    expect(mensaje).toBe('No se ha podido eliminar el documento.');
    // El detalle no se pierde: queda en consola para diagnóstico.
    expect(warn).toHaveBeenCalled();
  });

  it('conserva un mensaje claro que ya venía del motor', () => {
    const mensaje = mensajeDeErrorUsuario(
      new Error('No se ha podido desvincular el contrato.'),
      'No se ha podido completar la operación.'
    );
    expect(mensaje).toBe('No se ha podido desvincular el contrato.');
  });

  it('sin error, devuelve el contexto', () => {
    expect(mensajeDeErrorUsuario(undefined, 'No se ha podido guardar.')).toBe('No se ha podido guardar.');
  });
});
