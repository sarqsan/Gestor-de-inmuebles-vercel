/**
 * P0.1.3 — Las 27 variables de la aplicación están documentadas, con origen
 * y efecto, y `.env.example` NO activa ningún valor (ni contiene secretos).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { VARIABLES_DOCUMENTADAS, diagnosticosEstaticos } from '../scripts/doctor.mjs';

const RAIZ = resolve(__dirname, '..');
const ejemplo = readFileSync(join(RAIZ, '.env.example'), 'utf8');
const documento = readFileSync(join(RAIZ, 'docs/CONFIGURACION-VERIFICABLE.md'), 'utf8');

describe('mapa de configuración verificable', () => {
  it('documenta las 27 variables en el documento Y en .env.example', () => {
    for (const variable of VARIABLES_DOCUMENTADAS) {
      expect(documento, `falta ${variable} en el documento`).toContain(variable);
      expect(ejemplo, `falta ${variable} en .env.example`).toContain(variable);
    }
    expect(VARIABLES_DOCUMENTADAS).toHaveLength(27);
  });

  it('cada variable tiene una fila con origen y efecto (tabla de 5 columnas)', () => {
    const filas = documento.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l));
    expect(filas.length).toBe(27);
    for (const fila of filas) {
      const celdas = fila.split('|').slice(1, -1).map((c) => c.trim());
      expect(celdas.length, fila).toBe(5);
      expect(celdas[2].length, `origen vacío: ${fila}`).toBeGreaterThan(8);
      expect(celdas[3].length, `efecto vacío: ${fila}`).toBeGreaterThan(12);
    }
  });

  it('.env.example no activa NINGÚN valor y no contiene secretos reales', () => {
    const activas = ejemplo.split(/\r?\n/).filter((l) => /^[A-Z][A-Z0-9_]*\s*=/.test(l));
    expect(activas).toEqual([]);
    for (const patron of [/AIza[0-9A-Za-z_-]{20,}/, /-----BEGIN [A-Z ]+PRIVATE KEY-----/]) {
      expect(ejemplo).not.toMatch(patron);
    }
    // Los ejemplos de credenciales son SIEMPRE líneas comentadas.
    const lineasConCredencial = ejemplo.split(/\r?\n/).filter((l) => /smtps:\/\/|PRIVATE KEY|API_KEY=|SECRET=/.test(l));
    expect(lineasConCredencial.length).toBeGreaterThan(0);
    for (const linea of lineasConCredencial) {
      expect(linea.trimStart().startsWith('#'), linea).toBe(true);
    }
  });

  it('el documento advierte del destino de producción y del uso de emuladores', () => {
    expect(documento).toContain('gestor-inmuebles-produccion');
    expect(documento).toContain('demo-gestor-reglas');
    expect(documento).toContain('/api/cron/avisos');
    expect(documento).toContain('No contiene secretos');
    expect(documento).toContain('--strict');
    expect(documento).toContain('VITE_SEEDS_ENABLED');
  });

  it('doctor confirma la documentación y la ausencia de valores activos', () => {
    const diagnosticos = diagnosticosEstaticos();
    for (const id of ['entorno.sin_secretos', 'configuracion.documentada', 'scripts']) {
      expect(diagnosticos.find((d: { id: string }) => d.id === id)?.estado, id).toBe('OK');
    }
  });
});
