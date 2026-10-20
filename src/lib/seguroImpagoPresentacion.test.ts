/**
 * P7 · Presentación trazable del expediente de seguro de impago.
 * Pruebas puras: fijan que ningún estado se presente como éxito no confirmado y
 * que ninguna lectura automática se presente como dictamen oficial.
 */
import { describe, expect, it } from 'vitest';
import type { SolicitudSeguroEstado } from '../types';
import {
  normalizarDecisionPropietarioSeguro,
  presentarDictamenSeguro,
  presentarEstadoSolicitudSeguro,
} from './seguroImpagoPresentacion';

const ESTADOS: SolicitudSeguroEstado[] = [
  'BORRADOR',
  'CORREO_ENVIADO',
  'SOLICITUD_PENDIENTE',
  'RESPUESTA_RECIBIDA',
  'RESPUESTA_PROCESADA',
  'ERROR_PROCESAMIENTO',
  'CANCELADA',
];

const base = {
  estado: 'BORRADOR' as SolicitudSeguroEstado,
  procesadoConIA: false,
  emailRespuestaRaw: undefined,
  dictamenAseguradora: 'EN_ESTUDIO' as const,
  dictamenTexto: undefined,
};

describe('presentarEstadoSolicitudSeguro', () => {
  it('solo afirma envío confirmado en CORREO_ENVIADO', () => {
    for (const estado of ESTADOS) {
      const presentado = presentarEstadoSolicitudSeguro(estado);
      if (estado === 'CORREO_ENVIADO') {
        expect(presentado.tono).toBe('exito');
        expect(presentado.descripcion).toMatch(/confirmado/i);
      } else {
        expect(presentado.tono).not.toBe('exito');
      }
    }
  });

  it('marca como revisión humana el error de procesamiento', () => {
    const presentado = presentarEstadoSolicitudSeguro('ERROR_PROCESAMIENTO');
    expect(presentado.requiereRevisionHumana).toBe(true);
    expect(presentado.etiqueta).toMatch(/revisión humana/i);
    expect(presentado.descripcion).toMatch(/se conserva/i);
  });

  it('no exige revisión humana para un borrador', () => {
    expect(presentarEstadoSolicitudSeguro('BORRADOR').requiereRevisionHumana).toBe(false);
  });
});

describe('presentarDictamenSeguro', () => {
  it('trata la lectura de IA como lectura automática y nunca como dictamen oficial', () => {
    const presentado = presentarDictamenSeguro({
      ...base,
      estado: 'RESPUESTA_PROCESADA',
      procesadoConIA: true,
      emailRespuestaRaw: 'Correo de la aseguradora.',
      dictamenAseguradora: 'FAVORABLE_CONDICIONADO',
      dictamenTexto: 'Aceptación condicionada a un aval.',
    });

    expect(presentado.origen).toBe('LECTURA_IA');
    expect(presentado.esDictamenOficial).toBe(false);
    expect(presentado.requiereRevisionHumana).toBe(true);
    expect(presentado.etiqueta).toContain('Lectura IA');
    expect(presentado.descripcion).toMatch(/no es un dictamen oficial/i);
  });

  it('no conserva un dictamen previo como si fuera vigente cuando no hay análisis válido', () => {
    const presentado = presentarDictamenSeguro({
      ...base,
      estado: 'ERROR_PROCESAMIENTO',
      emailRespuestaRaw: 'Correo original conservado.',
      dictamenAseguradora: 'FAVORABLE',
    });

    expect(presentado.origen).toBe('PENDIENTE_REVISION_HUMANA');
    expect(presentado.esDictamenOficial).toBe(false);
    expect(presentado.etiqueta).not.toMatch(/favorable/i);
  });

  it('trata una respuesta recibida sin analizar como pendiente de revisión', () => {
    const presentado = presentarDictamenSeguro({ ...base, estado: 'RESPUESTA_RECIBIDA' });
    expect(presentado.requiereRevisionHumana).toBe(true);
    expect(presentado.esDictamenOficial).toBe(false);
  });

  it('no anuncia dictamen cuando el expediente sigue en trámite', () => {
    const presentado = presentarDictamenSeguro(base);
    expect(presentado.origen).toBe('EN_TRAMITE');
    expect(presentado.etiqueta).toBe('En estudio');
    expect(presentado.requiereRevisionHumana).toBe(false);
  });
});

describe('normalizarDecisionPropietarioSeguro', () => {
  it('traduce las etiquetas heredadas a valores declarados del modelo', () => {
    expect(normalizarDecisionPropietarioSeguro('ACEPTADO')).toBe('ACEPTAR_CANDIDATO');
    expect(normalizarDecisionPropietarioSeguro('CONDICIONADO_AVAL')).toBe('SOLICITAR_AVAL_EXTRA');
    expect(normalizarDecisionPropietarioSeguro('RECHAZADO')).toBe('RECHAZAR_CANDIDATO');
  });

  it('mantiene los valores válidos y descarta los desconocidos', () => {
    expect(normalizarDecisionPropietarioSeguro('TRAMITAR_OTRA_ASEGURADORA')).toBe(
      'TRAMITAR_OTRA_ASEGURADORA',
    );
    expect(normalizarDecisionPropietarioSeguro('PENDIENTE')).toBe('PENDIENTE');
    expect(normalizarDecisionPropietarioSeguro('INVENTADO')).toBe('PENDIENTE');
    expect(normalizarDecisionPropietarioSeguro(undefined)).toBe('PENDIENTE');
  });
});
