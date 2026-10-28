/**
 * H-12 — EXCLUSIÓN PERMANENTE DE BANCA Y PAGOS ONLINE, VERIFICADA EN TODO EL CÓDIGO
 * ================================================================================
 * El test previo (`tests/justificantes-sin-contabilizacion.test.ts`) era un
 * escáner de **5 ficheros**: una integración añadida en cualquier otro módulo no
 * se habría detectado. Este recorre `src/` y `server/` completos (excluyendo
 * pruebas, `node_modules` y `dist`) y comprueba:
 *
 *  · que no se importa ningún SDK de pagos, agregación bancaria o PSD2;
 *  · que no hay peticiones a dominios de pasarela/agregador;
 *  · que «Bizum», «transferencia» o «domiciliación» sólo sobreviven como
 *    ETIQUETAS de un método declarado por una persona, nunca como integración;
 *  · que registrar un cobro exige la función humana `registrarPagoPeriodo`.
 *
 * No es una prueba de intención: es una barrera mecánica. Si mañana alguien
 * intenta añadir Stripe/Redsys/PSD2, el test FALLA y hay que justificarlo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const RAIZ = resolve(__dirname, '..');
const RAICES = ['src', 'server'];
const EXTENSIONES = new Set(['.ts', '.tsx', '.mts', '.cts', '.mjs', '.cjs']);
const EXCLUIDOS = /(^|\/)(node_modules|dist|coverage|__snapshots__)(\/|$)/;

function ficherosDeCodigo(directorio: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(directorio)) {
    const ruta = join(directorio, entrada);
    if (EXCLUIDOS.test(ruta)) continue;
    if (statSync(ruta).isDirectory()) ficherosDeCodigo(ruta, salida);
    else if (EXTENSIONES.has(extname(entrada)) && !/\.(test|spec)\.(ts|tsx|mts|mjs)$/.test(entrada)) salida.push(ruta);
  }
  return salida;
}

const FICHEROS = RAICES.flatMap((raiz) => ficherosDeCodigo(resolve(RAIZ, raiz)));
const relativo = (ruta: string) => ruta.slice(RAIZ.length + 1);

/** Paquetes que implicarían banca automatizada, PSD2 o pasarelas de pago. */
const PAQUETES_PROHIBIDOS = [
  'stripe', '@stripe/', 'redsys', 'redsys-js', 'paypal', '@paypal/',
  'adyen', 'mollie', 'braintree', 'square', 'checkout.com',
  'plaid', 'tink', 'tinkoff', 'gocardless', 'nordigen', 'salt-edge',
  'bbva', 'santander', 'openbank', 'klarna', 'sepa-xml',
];

/** Dominios de pasarela/agregador que no deben aparecer como destino de red. */
const DOMINIOS_PROHIBIDOS = [
  'api.stripe.com', 'sis.redsys.es', 'api.paypal.com', 'api.plaid.com',
  'api.tink.com', 'banking-ob.bbva.com', 'api.gocardless.com',
];

describe('H-12 · exclusión permanente verificada en todo el código', () => {
  it('recorre un universo real de ficheros (no una lista de 5)', () => {
    expect(FICHEROS.length).toBeGreaterThan(300);
    expect(FICHEROS.some((f) => f.includes('src/components/sections/CobrosSection.tsx'))).toBe(true);
    expect(FICHEROS.some((f) => f.includes('server/cobros/justificantesCobro.ts'))).toBe(true);
  });

  it('ningún fichero importa un SDK de pagos, agregación bancaria o PSD2', () => {
    const infracciones: string[] = [];
    for (const fichero of FICHEROS) {
      const codigo = readFileSync(fichero, 'utf8');
      const importaciones = codigo.match(/(?:from\s+|require\(\s*|import\(\s*)['"]([^'"]+)['"]/g) || [];
      for (const linea of importaciones) {
        const modulo = linea.slice(linea.search(/['"]/) + 1, -1).toLowerCase();
        for (const prohibido of PAQUETES_PROHIBIDOS) {
          if (modulo === prohibido || modulo.startsWith(prohibido)) {
            infracciones.push(`${relativo(fichero)} → ${modulo}`);
          }
        }
      }
    }
    expect(infracciones).toEqual([]);
  });

  it('ningún fichero llama a un dominio de pasarela o agregador', () => {
    const infracciones: string[] = [];
    for (const fichero of FICHEROS) {
      const codigo = readFileSync(fichero, 'utf8').toLowerCase();
      for (const dominio of DOMINIOS_PROHIBIDOS) {
        if (codigo.includes(dominio)) infracciones.push(`${relativo(fichero)} → ${dominio}`);
      }
    }
    expect(infracciones).toEqual([]);
  });

  it('«bizum»/«transferencia»/«domiciliacion» sólo existen como etiquetas de método', () => {
    const usos = FICHEROS.filter((f) => /bizum/i.test(readFileSync(f, 'utf8'))).map(relativo);
    expect(usos.length).toBeGreaterThan(0);
    for (const ruta of usos) {
      const codigo = readFileSync(resolve(RAIZ, ruta), 'utf8');
      // Nunca como cliente de API ni como endpoint: sólo valores de enum/etiqueta.
      expect(codigo, ruta).not.toMatch(/https?:\/\/[^'"\s]*bizum/i);
      expect(codigo, ruta).not.toMatch(/api[_-]?bizum/i);
    }
  });

  it('no hay conciliación automática: ningún módulo de movimientos bancarios', () => {
    const sospechosos = FICHEROS.filter((f) => {
      const codigo = readFileSync(f, 'utf8');
      return /importarMovimientosBancarios|conciliarAutomaticamente|sincronizarBanco|openBanking/i.test(codigo);
    }).map(relativo);
    expect(sospechosos).toEqual([]);
  });
});
