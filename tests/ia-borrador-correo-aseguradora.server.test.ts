/**
 * P7 · Borrador de correo a aseguradora: fallo cerrado y procedencia explícita.
 *
 * El endpoint `/api/generar-correo-aseguradora` sólo puede devolver
 * `generadoConIA: true` si el proveedor entregó un JSON con `asunto` y `cuerpo`
 * válidos. En cualquier otro caso se usa la plantilla determinista del ERP y se
 * declara (`generadoConIA: false`), sin contactar con ninguna aseguradora.
 */
import { describe, expect, it, vi } from 'vitest';
import { ejecutarGeneracionCorreoAseguradora } from '../server/ia/correoAseguradora';
import { esBorradorCorreoAseguradoraValido } from '../src/ia/borradorCorreoAseguradora';

const BORRADOR = {
  asunto: '[REF-P7] Candidato 1 - Vivienda de prueba',
  cuerpo: 'Cuerpo del borrador de prueba.',
};

const PARAMETROS = { model: 'modelo-sintético', contents: { parts: [{ text: 'datos de prueba' }] } };

describe('contrato del borrador generado por IA', () => {
  it('acepta asunto y cuerpo no vacíos', () => {
    expect(esBorradorCorreoAseguradoraValido(BORRADOR)).toBe(true);
  });

  it.each([
    ['sin asunto', { cuerpo: BORRADOR.cuerpo }],
    ['asunto vacío', { ...BORRADOR, asunto: '   ' }],
    ['cuerpo no textual', { ...BORRADOR, cuerpo: 42 }],
    ['no es un objeto', 'texto'],
    ['lista en lugar de objeto', [BORRADOR]],
  ])('rechaza un borrador inválido: %s', (_caso, valor) => {
    expect(esBorradorCorreoAseguradoraValido(valor)).toBe(false);
  });
});

describe('generación de borrador sin IA utilizable', () => {
  it('no llama al proveedor si no hay cliente de IA', async () => {
    const generar = vi.fn();
    const resultado = await ejecutarGeneracionCorreoAseguradora(null, PARAMETROS, generar);

    expect(resultado).toMatchObject({ ok: false, codigo: 'IA_NO_DISPONIBLE' });
    expect(generar).not.toHaveBeenCalled();
  });

  it('declara error de proveedor cuando la llamada falla', async () => {
    const resultado = await ejecutarGeneracionCorreoAseguradora(
      { cliente: 'doble' },
      PARAMETROS,
      vi.fn().mockRejectedValue(new Error('fallo simulado')),
    );

    expect(resultado).toMatchObject({ ok: false, codigo: 'ERROR_PROVEEDOR_IA' });
  });

  it.each([
    ['respuesta sin texto', { text: '' }],
    ['JSON mal formado', { text: '{ roto' }],
    ['esquema incompleto', { text: JSON.stringify({ asunto: 'Solo asunto' }) }],
    ['asunto vacío', { text: JSON.stringify({ ...BORRADOR, asunto: '' }) }],
    ['objeto sin texto', {}],
  ])('no entrega borrador con %s', async (_caso, respuesta) => {
    const resultado = await ejecutarGeneracionCorreoAseguradora(
      { cliente: 'doble' },
      PARAMETROS,
      vi.fn().mockResolvedValue(respuesta),
    );

    expect(resultado).toMatchObject({ ok: false, codigo: 'RESPUESTA_IA_INVALIDA' });
  });

  it('entrega el borrador sólo con JSON completo y válido', async () => {
    const generar = vi.fn().mockResolvedValue({ text: JSON.stringify(BORRADOR) });
    const resultado = await ejecutarGeneracionCorreoAseguradora({ cliente: 'doble' }, PARAMETROS, generar);

    expect(generar).toHaveBeenCalledWith({ cliente: 'doble' }, PARAMETROS);
    expect(resultado).toEqual({ ok: true, datos: BORRADOR });
  });
});
