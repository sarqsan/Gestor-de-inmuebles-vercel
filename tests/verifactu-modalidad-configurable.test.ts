/**
 * P1.5-pre — La modalidad del sistema de facturación YA NO está fijada en
 * `'VERIFACTU'`. Prueba REAL del resolvedor y contraste con el componente.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolverModalidadSistema,
  claseSistemaParaRegistro,
  esPreparacionSinRemision,
  MODALIDAD_SISTEMA_POR_DEFECTO,
  VARIABLE_MODALIDAD_SISTEMA,
} from '../src/lib/configuracionFiscal';

const codigo = readFileSync(resolve(__dirname, '../src/components/sections/FacturacionSection.tsx'), 'utf8');
const ejemplo = readFileSync(resolve(__dirname, '../.env.example'), 'utf8');

describe('modalidad fiscal configurable (D3 / P1.4)', () => {
  it('por defecto es PREPARACION: sin remisión y clase de registro NO_VERIFACTU', () => {
    expect(MODALIDAD_SISTEMA_POR_DEFECTO).toBe('PREPARACION');
    const r = resolverModalidadSistema(undefined);
    expect(r.modalidad).toBe('PREPARACION');
    expect(r.valorReconocido).toBe(true);
    expect(r.aviso).toBeNull();
    expect(r.descripcion).toContain('sin remisión');
    expect(claseSistemaParaRegistro(r.modalidad)).toBe('NO_VERIFACTU');
    expect(esPreparacionSinRemision(r.modalidad)).toBe(true);
  });

  it.each([
    ['NO_VERIFACTU', 'NO_VERIFACTU'],
    ['no_verifactu', 'NO_VERIFACTU'],
    ['VERIFACTU', 'VERIFACTU'],
    ['PREPARACION', 'PREPARACION'],
  ])('reconoce %s → %s', (entrada, esperado) => {
    const r = resolverModalidadSistema(entrada);
    expect(r.modalidad).toBe(esperado);
    expect(r.valorReconocido).toBe(true);
    expect(claseSistemaParaRegistro(r.modalidad)).toBe(esperado === 'VERIFACTU' ? 'VERIFACTU' : 'NO_VERIFACTU');
  });

  it('un valor inventado NUNCA activa VERI*FACTU: cae en PREPARACION con aviso', () => {
    for (const valor of ['SI', 'true', 'PRODUCCION', 'AEAT', '  verifactu_off  ']) {
      const r = resolverModalidadSistema(valor);
      expect(r.modalidad, valor).toBe('PREPARACION');
      expect(r.valorReconocido, valor).toBe(false);
      expect(r.aviso, valor).toContain(VARIABLE_MODALIDAD_SISTEMA);
    }
  });

  it('el componente ya no fija la modalidad y muestra un aviso visible', () => {
    expect(codigo).toContain('resolverModalidadSistema(');
    expect(codigo).toContain('claseSistemaParaRegistro(');
    expect(codigo).toContain('data-testid="aviso-modalidad-fiscal"');
    expect(codigo).toContain('no se remite nada a la AEAT');
    expect(codigo).toContain('dictamen P1.4');
    expect(codigo).not.toContain("modalidad: 'VERIFACTU'");
    expect(codigo).not.toContain("claseSistema: 'VERIFACTU'");
  });

  it('la variable pública está documentada y SIN valor activo', () => {
    expect(ejemplo).toContain(VARIABLE_MODALIDAD_SISTEMA);
    const activas = ejemplo.split(/\r?\n/).filter((l) => /^VITE_MODALIDAD_SISTEMA_FACTURACION\s*=/.test(l));
    expect(activas).toEqual([]);
    expect(ejemplo).toContain('# VITE_MODALIDAD_SISTEMA_FACTURACION=PREPARACION');
  });
});
