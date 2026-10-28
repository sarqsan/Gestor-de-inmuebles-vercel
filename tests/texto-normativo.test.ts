/** P0.4.5 — El texto B2B obsoleto se corrige SIN implementar integración fiscal. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (r: string) => readFileSync(resolve(__dirname, '../' + r), 'utf8');
const ADAPTADORES = leer('src/utils/intercambioB2B/adaptadoresB2B.ts');
const TIPOS = leer('src/types/facturacion.ts');

describe('texto normativo B2B', () => {
  it('ya no afirma que la orden ministerial está pendiente', () => {
    expect(ADAPTADORES).not.toContain('pendiente de orden ministerial');
    expect(ADAPTADORES).toContain('Orden HAC/1028/2026');
    expect(ADAPTADORES).toContain('6-10-2027');
  });

  it('sigue SIN implementar el envío: `disponible()` continúa siendo false', () => {
    expect(ADAPTADORES.match(/disponible\(\): boolean \{\s*return false;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('no se ha cambiado la modalidad fiscal por defecto sin dictamen (D3)', () => {
    expect(TIPOS.length).toBeGreaterThan(0);
    expect(ADAPTADORES).toContain('PENDIENTE DE DICTAMEN');
  });
});
