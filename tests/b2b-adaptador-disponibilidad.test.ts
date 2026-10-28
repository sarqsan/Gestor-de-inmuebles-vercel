/**
 * P1.4/P1.5 — Ningún adaptador B2B finge un envío real a la AEAT o a una
 * plataforma privada antes del dictamen fiscal. Prueba REAL de los adaptadores.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ADAPTADORES_B2B,
  adaptadoresDisponiblesB2B,
  AdaptadorSpfeB2B,
  AdaptadorPlataformaPrivadaPendiente,
  AdaptadorPreparacionB2B,
} from '../src/utils/intercambioB2B/adaptadoresB2B';
import type { FacturaElectronicaB2B } from '../src/types/facturaElectronicaB2B';

const doc = readFileSync(resolve(__dirname, '../docs/P1.4-DICTAMEN-FISCAL-PREVIO-2026-10-27.md'), 'utf8');

const feb = {
  emisor: { nif: 'B12345678' },
  receptor: { nif: '12345678Z' },
} as unknown as FacturaElectronicaB2B;

describe('adaptadores B2B · disponibilidad honesta', () => {
  it('los dos adaptadores de producción declaran disponible() === false', () => {
    expect(new AdaptadorSpfeB2B().disponible()).toBe(false);
    expect(new AdaptadorPlataformaPrivadaPendiente().disponible()).toBe(false);
  });

  it('solo el adaptador de PREPARACIÓN está operativo y se etiqueta como simulado', () => {
    const disponibles = adaptadoresDisponiblesB2B();
    expect(disponibles).toHaveLength(1);
    expect(disponibles[0]).toBeInstanceOf(AdaptadorPreparacionB2B);
    expect(disponibles[0].modo).toBe('PREPARACION');
    const resultado = disponibles[0].enviar(feb, '<Invoice/>');
    expect(resultado.ok).toBe(true);
    expect(resultado.simulado).toBe(true);
    expect(resultado.detalle).toContain('NO es un envío real');
  });

  it('ningún adaptador de producción devuelve ok:true ni un estado ENVIADA', () => {
    for (const adaptador of ADAPTADORES_B2B.filter((a) => a.modo === 'PRODUCCION')) {
      for (const metodo of ['enviar', 'reintentar'] as const) {
        const r = adaptador[metodo](feb, '<Invoice/>');
        expect(r.ok, `${adaptador.id}.${metodo}`).toBe(false);
        expect(r.simulado, `${adaptador.id}.${metodo}`).toBe(false);
        expect(r.error, `${adaptador.id}.${metodo}`).toContain('PENDIENTE');
      }
    }
  });

  it('no hay endpoints ni credenciales inventados', () => {
    const codigo = readFileSync(resolve(__dirname, '../src/utils/intercambioB2B/adaptadoresB2B.ts'), 'utf8');
    expect(codigo).not.toMatch(/https?:\/\/(?!www\.|sed[e]?\.)/);
    expect(codigo).not.toMatch(/api[_-]?key|client_secret|BEGIN .*PRIVATE KEY/i);
    expect(codigo).toContain('Orden HAC/1028/2026');
  });

  it('el dictamen P1.4 existe y condiciona cualquier transporte AEAT/B2B', () => {
    expect(doc).toContain('NO ES UN DICTAMEN FISCAL FIRMADO');
    expect(doc).toContain('sujeto');
    expect(doc).toContain('no sujeto');
    expect(doc).toContain('dudoso');
    expect(doc).toContain('P1.5');
  });
});
