/**
 * P1.1 — INVARIANTE verificable del modelo documental de cobros.
 *
 * Exclusión permanente del propietario: sin banca, PSD2, agregadores,
 * pasarelas ni pagos online. Los inquilinos aportan JUSTIFICANTES; el registro
 * contable definitivo lo hace una persona mediante `registrarPagoPeriodo`.
 * Ningún justificante (ni la IA) puede llamar a esa función.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (r: string) => readFileSync(resolve(__dirname, '../' + r), 'utf8');

const SUPERFICIES_DOCUMENTALES = [
  'server/cobros/justificantesCobro.ts',
  'server/cobros/rutasJustificantesCobro.ts',
  'server/cobros/almacenGoogleStorage.ts',
  'src/components/portal-inquilino/PresentarJustificanteCobro.tsx',
  'src/components/sections/JustificantesCobroInbox.tsx',
];

describe('justificantes de cobro · nunca contabilizan', () => {
  it.each(SUPERFICIES_DOCUMENTALES)('%s no importa ni llama a registrarPagoPeriodo', (ruta) => {
    const codigo = leer(ruta);
    expect(codigo, ruta).not.toMatch(/\bregistrarPagoPeriodo\s*\(/);
    expect(codigo, ruta).not.toMatch(/from\s+['"][^'"]*cobrosEngine['"]/);
  });

  it('ninguna superficie documental marca un cobro como PAGADO/VERIFICADO por su cuenta', () => {
    for (const ruta of SUPERFICIES_DOCUMENTALES) {
      const codigo = leer(ruta);
      // Se permite LEER el estado para impedir aportar sobre un cobro ya pagado,
      // pero no ESCRIBIRLO (asignación a `estado:` del cobro).
      expect(codigo, ruta).not.toMatch(/estado\s*:\s*['"](?:PAGADO|VERIFICADO)['"]/);
      expect(codigo, ruta).not.toMatch(/importeRecibido\s*[:=]/);
    }
  });

  it('la vía contable canónica sigue existiendo y es explícitamente humana', () => {
    const cobros = leer('src/components/sections/CobrosSection.tsx');
    expect(cobros).toContain('registrarPagoPeriodo');
    const bandeja = leer('src/components/sections/JustificantesCobroInbox.tsx');
    expect(bandeja).toContain('No modifica el cobro');
    expect(bandeja).toContain('auditoría');
    expect(bandeja).toContain('Motivo del rechazo');
  });

  it('el modelo de datos declara estados exclusivamente documentales', () => {
    const codigo = leer('server/cobros/justificantesCobro.ts');
    for (const estado of ['SUBIENDO', 'PENDIENTE_REVISION', 'ACEPTADO', 'RECHAZADO', 'ERROR_SUBIDA']) {
      expect(codigo).toContain(estado);
    }
    expect(codigo).toContain('nunca altera');
    expect(codigo).toContain('tesorería');
  });

  it('no aparecen términos de integración bancaria/pagos online en el flujo', () => {
    for (const ruta of SUPERFICIES_DOCUMENTALES) {
      const codigo = leer(ruta).toLowerCase();
      for (const prohibido of ['psd2', 'aisp', 'stripe', 'redsys', 'open banking', 'iniciación de pagos', 'conciliación bancaria automática']) {
        expect(codigo, `${ruta}: ${prohibido}`).not.toContain(prohibido);
      }
    }
  });
});
