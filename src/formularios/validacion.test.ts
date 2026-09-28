/**
 * BLOQUE 10 · UX-4 — REGLAS DE VALIDACIÓN.
 *
 * Sólo reglas reales del ERP (no se inventan reglas de negocio) y mensajes claros:
 * se distingue obligatorio / formato incorrecto / valor no permitido.
 */
import { describe, expect, it } from 'vitest';

import {
  esIbanValido,
  esNifValido,
  hayErrores,
  resumenErrores,
  validarCampo,
  validarFormulario,
} from './validacion';

describe('UX-4 · campo obligatorio', () => {
  it('informa de que falta un campo obligatorio', () => {
    const error = validarCampo('', { etiqueta: 'Dirección del Inmueble', obligatorio: true });
    expect(error).toBe('«Dirección del Inmueble» es obligatorio.');
  });

  it('un espacio en blanco no satisface la obligatoriedad', () => {
    expect(validarCampo('   ', { etiqueta: 'Ciudad', obligatorio: true })).toBeTruthy();
  });

  it('un campo opcional vacío no genera error', () => {
    expect(validarCampo('', { etiqueta: 'Provincia' })).toBeUndefined();
  });
});

describe('UX-4 · formato y valor no permitido', () => {
  it('importe: el valor debe ser mayor que cero', () => {
    expect(validarCampo('0', { etiqueta: 'Importe total (€)', obligatorio: true, importe: true })).toBe(
      'Introduce un importe mayor que 0 en «Importe total (€)».'
    );
    expect(validarCampo('120,50', { etiqueta: 'Importe total (€)', importe: true })).toBeUndefined();
  });

  it('importe: texto no numérico se rechaza con un mensaje distinto', () => {
    expect(validarCampo('abc', { etiqueta: 'Importe total (€)', importe: true })).toBe(
      'Introduce un importe válido en «Importe total (€)».'
    );
  });

  it('formato de correo electrónico', () => {
    expect(validarCampo('sin-arroba', { etiqueta: 'Email', email: true })).toBe(
      'Introduce un correo electrónico válido en «Email».'
    );
    expect(validarCampo('gestora@example.invalid', { etiqueta: 'Email', email: true })).toBeUndefined();
  });

  it('formato de NIF/NIE/CIF (valor no permitido)', () => {
    expect(validarCampo('12345678Z', { etiqueta: 'NIF / NIE', nif: true })).toBeUndefined();
    expect(validarCampo('0000', { etiqueta: 'NIF / NIE', nif: true })).toBeTruthy();
    expect(esNifValido('B-12345674')).toBe(true);
    expect(esNifValido('nif-inventado')).toBe(false);
  });

  it('IBAN con dígito de control (ISO 13616)', () => {
    expect(esIbanValido('ES91 2100 0418 4502 0005 1332')).toBe(true);
    expect(esIbanValido('ES00 0000 0000 0000 0000 0000')).toBe(false);
    expect(validarCampo('ES00 0000', { etiqueta: 'Número de Cuenta IBAN', iban: true })).toBeTruthy();
  });

  it('fechas y enteros', () => {
    expect(validarCampo('2026-13-40', { etiqueta: 'Fecha', fecha: true })).toBeTruthy();
    expect(validarCampo('2026-09-28', { etiqueta: 'Fecha', fecha: true })).toBeUndefined();
    expect(validarCampo('2,5', { etiqueta: 'Habitaciones', entero: true })).toBeTruthy();
    expect(validarCampo('3', { etiqueta: 'Habitaciones', entero: true })).toBeUndefined();
  });

  it('reglas propias del formulario', () => {
    const error = validarCampo('99', {
      etiqueta: 'Plazo',
      personalizadas: [(valor) => (Number(valor) > 60 ? 'El plazo no puede superar 60 días.' : undefined)],
    });
    expect(error).toBe('El plazo no puede superar 60 días.');
  });
});

describe('UX-4 · formulario completo', () => {
  it('devuelve un mensaje por campo y ninguno cuando todo es válido', () => {
    const campos = {
      direccion: { etiqueta: 'Dirección del Inmueble', obligatorio: true },
      ciudad: { etiqueta: 'Ciudad', obligatorio: true },
      precioAlquiler: { etiqueta: 'Precio Alquiler (€/mes)', obligatorio: true, importe: true },
    };

    const errores = validarFormulario({ direccion: '', ciudad: 'Alicante', precioAlquiler: '0' }, campos);
    expect(Object.keys(errores).sort()).toEqual(['direccion', 'precioAlquiler']);
    expect(hayErrores(errores)).toBe(true);

    const sinErrores = validarFormulario(
      { direccion: 'Calle Mayor 1', ciudad: 'Alicante', precioAlquiler: '950' },
      campos
    );
    expect(sinErrores).toEqual({});
    expect(hayErrores(sinErrores)).toBe(false);
  });

  it('el resumen de un formulario largo no mezcla errores de campos distintos', () => {
    const resumen = resumenErrores({ a: '«A» es obligatorio.', b: 'Introduce un importe mayor que 0 en «B».' });
    expect(resumen).toContain('Revisa 2 campos');
    expect(resumen).toContain('«A» es obligatorio.');
    expect(resumen).toContain('«B»');
  });

  it('los mensajes no exponen detalles técnicos', () => {
    const errores = validarFormulario(
      { direccion: '', importe: '0', email: 'x' },
      {
        direccion: { etiqueta: 'Dirección', obligatorio: true },
        importe: { etiqueta: 'Importe', importe: true },
        email: { etiqueta: 'Email', email: true },
      }
    );
    const texto = Object.values(errores).join(' ');
    expect(texto).not.toMatch(/undefined|null|firebase|firestore|\[object/i);
  });
});
