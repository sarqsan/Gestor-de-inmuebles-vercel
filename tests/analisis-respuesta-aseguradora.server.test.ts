import { describe, expect, it, vi } from 'vitest';
import { ejecutarAnalisisRespuestaAseguradora } from '../server/ia/respuestaAseguradora';
import { esAnalisisRespuestaAseguradoraValido } from '../src/ia/analisisRespuestaAseguradora';

const RESPUESTA_VALIDA = {
  dictamen: 'FAVORABLE_CONDICIONADO',
  dictamenTexto: 'Aprobada con aval adicional.',
  importeMaximoAsegurable: 950,
  condiciones: ['Aportar avalista.'],
  documentosRequeridos: ['DNI del avalista.'],
  resumenEjecutivo: 'La aseguradora condiciona la aceptación a un avalista.',
  requiereAtencionPropietario: true,
} as const;

const PARAMETROS = {
  model: 'modelo-sintético',
  contents: { parts: [{ text: 'correo de prueba, sin contacto externo' }] },
};

describe('contrato de análisis de respuesta de aseguradora', () => {
  it('acepta un objeto completo con un dictamen permitido', () => {
    expect(esAnalisisRespuestaAseguradoraValido(RESPUESTA_VALIDA)).toBe(true);
  });

  it.each([
    ['falta el dictamen', { ...RESPUESTA_VALIDA, dictamen: undefined }],
    ['dictamen no permitido', { ...RESPUESTA_VALIDA, dictamen: 'APROBADO' }],
    ['falta un campo requerido del esquema', { ...RESPUESTA_VALIDA, condiciones: undefined }],
    ['importe no numérico', { ...RESPUESTA_VALIDA, importeMaximoAsegurable: '950' }],
  ])('rechaza una respuesta inválida: %s', (_caso, respuesta) => {
    expect(esAnalisisRespuestaAseguradoraValido(respuesta)).toBe(false);
  });
});

describe('fallo cerrado del servicio de análisis de aseguradora', () => {
  it('responde como no disponible si no hay cliente IA y no llama al proveedor', async () => {
    const generar = vi.fn();
    const resultado = await ejecutarAnalisisRespuestaAseguradora(null, PARAMETROS, generar);

    expect(resultado).toMatchObject({ ok: false, status: 503, codigo: 'IA_NO_DISPONIBLE' });
    expect(generar).not.toHaveBeenCalled();
  });

  it('no produce dictamen cuando el proveedor falla', async () => {
    const generar = vi.fn().mockRejectedValue(new Error('fallo simulado del proveedor'));
    const resultado = await ejecutarAnalisisRespuestaAseguradora({ cliente: 'doble' }, PARAMETROS, generar);

    expect(resultado).toMatchObject({ ok: false, status: 502, codigo: 'ERROR_PROVEEDOR_IA' });
  });

  it('rechaza JSON ausente o mal formado', async () => {
    for (const text of ['', '{ JSON roto']) {
      const resultado = await ejecutarAnalisisRespuestaAseguradora(
        { cliente: 'doble' },
        PARAMETROS,
        vi.fn().mockResolvedValue({ text }),
      );
      expect(resultado).toMatchObject({ ok: false, status: 502, codigo: 'RESPUESTA_IA_INVALIDA' });
    }
  });

  it.each([
    ['dictamen ausente', { ...RESPUESTA_VALIDA, dictamen: undefined }],
    ['dictamen disallowed', { ...RESPUESTA_VALIDA, dictamen: 'APROBADO' }],
    ['esquema incompleto', { dictamen: 'FAVORABLE' }],
  ])('no habilita respuesta inválida: %s', async (_caso, respuesta) => {
    const resultado = await ejecutarAnalisisRespuestaAseguradora(
      { cliente: 'doble' },
      PARAMETROS,
      vi.fn().mockResolvedValue({ text: JSON.stringify(respuesta) }),
    );

    expect(resultado).toMatchObject({ ok: false, status: 502, codigo: 'RESPUESTA_IA_INVALIDA' });
  });

  it('devuelve datos estructurados solo con respuesta válida', async () => {
    const generar = vi.fn().mockResolvedValue({ text: JSON.stringify(RESPUESTA_VALIDA) });
    const resultado = await ejecutarAnalisisRespuestaAseguradora({ cliente: 'doble' }, PARAMETROS, generar);

    expect(generar).toHaveBeenCalledWith({ cliente: 'doble' }, PARAMETROS);
    expect(resultado).toEqual({ ok: true, datos: RESPUESTA_VALIDA });
  });
});
