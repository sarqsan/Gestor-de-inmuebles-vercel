import { describe, it, expect } from 'vitest';
import { PLANTILLAS } from '../src/notificaciones/plantillas';

describe('Plantillas — familias de negocio', () => {
  it('cobros: próximo / vencimiento / retraso', () => {
    expect(PLANTILLAS['cobro.proximo_vencimiento']).toBeDefined();
    expect(PLANTILLAS['cobro.vencimiento_hoy']).toBeDefined();
    expect(PLANTILLAS['cobro.retraso_pago']).toBeDefined();
    expect(PLANTILLAS['cobro.retraso_pago'].canalesPermitidos).toContain('WEBHOOK');
  });

  it('agenda: confirmación / recordatorio / cancelación', () => {
    expect(PLANTILLAS['agenda.visita_confirmada']).toBeDefined();
    expect(PLANTILLAS['agenda.recordatorio_visita']).toBeDefined();
    expect(PLANTILLAS['agenda.visita_cancelada']).toBeDefined();
  });

  it('contratos: próxima finalización / finalización', () => {
    expect(PLANTILLAS['contrato.proxima_finalizacion']).toBeDefined();
    expect(PLANTILLAS['contrato.finalizacion']).toBeDefined();
    expect(PLANTILLAS['contrato.proxima_finalizacion'].inicio).toBe('SCHEDULED');
  });

  it('incidencias: nueva / cambio / resuelta', () => {
    expect(PLANTILLAS['incidencia.nueva']).toBeDefined();
    expect(PLANTILLAS['incidencia.cambio_estado']).toBeDefined();
    expect(PLANTILLAS['incidencia.resuelta']).toBeDefined();
  });

  it('seguros: renovación / siniestro pendiente', () => {
    expect(PLANTILLAS['seguro.renovacion_poliza']).toBeDefined();
    expect(PLANTILLAS['seguro.siniestro_pendiente']).toBeDefined();
  });

  it('no hay textos jurídicos nuevos: asuntos sin cláusulas legales', () => {
    for (const clave of Object.keys(PLANTILLAS)) {
      const texto = `${PLANTILLAS[clave].asunto} ${PLANTILLAS[clave].cuerpo}`;
      expect(texto).not.toMatch(/cláusula|artículo|artículo \d|legislación vigente|LAU 29|fehaciente/i);
    }
  });
});
