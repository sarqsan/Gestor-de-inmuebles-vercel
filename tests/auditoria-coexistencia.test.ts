/**
 * FASE 9 — Coexistencia documentada de las dos `registrarAuditoriaFirestore`.
 * ---------------------------------------------------------------------------
 * Censo de consumidores (2026-09-27):
 *  · `src/lib/auditoria.ts` (síncrona, TRANSACCIONAL): único consumidor, el
 *    repositorio de operaciones (`repository.ts`), dentro de la misma
 *    transacción que entidad + cabecera.
 *  · `src/lib/firebase.ts` (asíncrona, BEST-EFFORT independiente): actas,
 *    seguros, patrimonial, sindicación, centro operativo y seeds.
 *
 * Decisión: NO consolidar. Unificar exigiría sustituir escrituras
 * transaccionales por best-effort (auditorías fantasma ante abortos:
 * PROHIBIDO) o transaccionalizar a todos los consumidores genéricos (cambio
 * excesivo). Mismo libro mayor (`audit_logs`), dos transportes. Estos tests
 * fijan la coexistencia deliberada para que nadie "limpie" una de las dos.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  auditoriaDe,
  registrarAuditoriaFirestore as registrarTransaccional,
} from '../src/lib/auditoria';
import { registrarAuditoriaFirestore as registrarBestEffort } from '../src/lib/firebase';

const RAIZ = resolve(__dirname, '..');
const leer = (rel: string): string => readFileSync(resolve(RAIZ, rel), 'utf-8');

describe('contratos distintos (firma y transporte)', () => {
  it('la transaccional es síncrona, recibe (log, tx) y delega en tx.crearAuditoria', () => {
    expect(registrarTransaccional.length).toBe(2);
    const crearAuditoria = vi.fn();
    const log = auditoriaDe(
      {
        operacionId: 'op-1',
        fecha: '2026-09-27T12:00:00.000Z',
        actor: 'uid-1',
        motivo: 'motivo',
        ambito: { propietarioId: 'prop-1', inmuebleId: 'inm-1' },
        referencia: { tipo: 'incidencia', id: 'inc-1' },
        revision: 1,
        comando: { accion: 'ANOTAR' },
        antes: null,
        despues: { version: 1 },
      } as never,
      { uid: 'uid-1', usuarioId: 'u-1', usuarioEmail: 'e', usuarioNombre: 'n' } as never
    );
    const retorno = registrarTransaccional(log, { crearAuditoria });
    expect(retorno).toBeUndefined();
    expect(crearAuditoria).toHaveBeenCalledTimes(1);
    expect(crearAuditoria).toHaveBeenCalledWith('operaciones~prop-1~op-1', log);
  });

  it('la best-effort es asíncrona de un argumento (no se invoca: tocaría red)', () => {
    expect(typeof registrarBestEffort).toBe('function');
    expect(registrarBestEffort.length).toBe(1);
    expect(registrarBestEffort.constructor.name).toBe('AsyncFunction');
  });

  it('transportes distintos en el código (setDoc independiente vs tx)', () => {
    const be = leer('src/lib/firebase.ts');
    expect(be).toContain('await setDoc(logRef, clean)');
    // Sin comentarios: la mención documental de `setDoc` no cuenta.
    const tx = leer('src/lib/auditoria.ts')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ');
    expect(tx).toContain('transaccion.crearAuditoria(log.id, log)');
    expect(tx).not.toContain('setDoc');
  });
});

describe('censo de consumidores (sin cruces)', () => {
  it('operaciones usa la transaccional y sólo esa', () => {
    const repo = leer('src/features/operaciones/persistence/repository.ts');
    expect(repo).toContain("from '../../../lib/auditoria.ts'");
    expect(repo).toContain('registrarAuditoriaFirestore(auditoriaDe(evento, identidad), tx)');
    expect(repo).not.toContain("lib/firebase'");
  });

  it('los consumidores genéricos usan la best-effort de firebase.ts', () => {
    const actas = leer('src/components/sections/ActasSection.tsx');
    expect(actas).toContain("from '../../lib/firebase'");
    expect(actas).toContain('registrarAuditoriaFirestore({');
    expect(actas).not.toContain('lib/auditoria');
    const patr = leer('src/lib/patrimonialPersistenciaFirebase.ts');
    expect(patr).toContain("from './firebase'");
    expect(patr).not.toContain('lib/auditoria');
  });

  it('ambas documentan la coexistencia deliberada', () => {
    expect(leer('src/lib/auditoria.ts')).toContain('COEXISTENCIA (FASE 9, decisión NO consolidar)');
    expect(leer('src/lib/firebase.ts')).toContain('COEXISTENCIA (FASE 9, decisión NO consolidar)');
  });
});
