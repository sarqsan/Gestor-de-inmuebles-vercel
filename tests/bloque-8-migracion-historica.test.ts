/**
 * BLOQUE 8 — auditoría del inventario histórico disponible en el clon.
 *
 * Importante: el anexo Rentasync es una transcripción de evidencia reconstruida,
 * no los ficheros originales canónicos. Estos tests lo clasifican y pasan por
 * el motor B4 en solo lectura; nunca promueven datos ni conectan a Firebase.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adaptarMovimientoRentasync,
  autorizarMigracion,
  ejecutarDryRun,
  type CatalogosMigracion,
} from '../src/lib/migracion';
import { jsonEstable } from '../src/lib/migracion/motor';

const ROOT = resolve(__dirname, '..');
const ANEXO_PATH = 'docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json';
const ANEXO_BYTES = readFileSync(resolve(ROOT, ANEXO_PATH));
const ANEXO = JSON.parse(ANEXO_BYTES.toString('utf8')) as {
  __ARTEFACTO__: string;
  __FECHA__: string;
  __PROVENANCE__: {
    origen: string;
    ficheros_originales: string[];
    resets_del_sandbox: string[];
    reconstruccion: string;
    limitacion_clave: string;
  };
  inmuebles_esquema: { registros: number; ids_verificados: string[] };
  gastos_ingresos_registros: Array<Record<string, unknown>>;
};
const SHA256_ANEXO = createHash('sha256').update(ANEXO_BYTES).digest('hex');
const CATALOGOS_VACIOS: CatalogosMigracion = {
  propietarios: [],
  inmuebles: [],
  contratos: [],
  mapeos: [],
  existentes: [],
};

function dryRunEvidencia() {
  const registros = ANEXO.gastos_ingresos_registros.map((registro, indice) => adaptarMovimientoRentasync(
    registro,
    {
      loteId: null,
      fuente: typeof registro._fuente === 'string' ? registro._fuente : 'ANEXO_TRUNCADO',
      sourceFile: ANEXO_PATH,
    },
    indice,
  ));
  return ejecutarDryRun({
    registros,
    catalogos: CATALOGOS_VACIOS,
    esquemaVersion: 'rentasync-v1',
    importadorVersion: 'BLOQUE-8-inventory-test/B4',
  });
}

describe('BLOQUE 8 · inventario histórico y barrera de custodia', () => {
  it('clasifica el anexo como evidencia reconstruida, no como fuente canónica original', () => {
    expect(ANEXO.__PROVENANCE__.origen).toContain('FUENTE EXTERNA');
    expect(ANEXO.__PROVENANCE__.reconstruccion).toContain('SOLO con datos verificados');
    expect(ANEXO.__PROVENANCE__.ficheros_originales).toHaveLength(2);
    expect(ANEXO.__PROVENANCE__.resets_del_sandbox.length).toBeGreaterThan(0);
    expect(ANEXO.__PROVENANCE__.limitacion_clave).toContain('NO son recuperables');
    expect(SHA256_ANEXO).toBe('f1878bac674fee459ab5d78f94942762e37b89a4b83081d564873c525e6cbe88');

    // El hash reproducible del anexo no sustituye al hash de los JSON originales.
    expect(existsSync(resolve(ROOT, 'inmuebles_rentasync_2026-09-25.json'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'gastos_e_ingresos_Todos_Inmuebles_Todas_Anualidades_2026-09-26.json'))).toBe(false);
  });

  it('cuenta únicamente los registros presentes y conserva la fila truncada sin completarla', () => {
    const registros = ANEXO.gastos_ingresos_registros;
    const porTipo = registros.reduce<Record<string, number>>((acc, row) => {
      const tipo = typeof row.type === 'string' ? row.type : 'SIN_TIPO';
      acc[tipo] = (acc[tipo] ?? 0) + 1;
      return acc;
    }, {});
    const porFuente = registros.reduce<Record<string, number>>((acc, row) => {
      const fuente = typeof row._fuente === 'string' ? row._fuente : 'SIN_FUENTE';
      acc[fuente] = (acc[fuente] ?? 0) + 1;
      return acc;
    }, {});

    expect(registros).toHaveLength(52); // 51 registros descritos + 1 evidencia truncada
    expect(porTipo).toEqual({ ingreso: 30, gasto: 21, SIN_TIPO: 1 });
    expect(porFuente).toEqual({
      'B_pegado_2026-09-26': 25,
      ambos_pegados: 1,
      A_pegado_anterior: 25,
      SIN_FUENTE: 1,
    });
    expect(ANEXO.inmuebles_esquema.registros).toBe(7);
    expect(ANEXO.inmuebles_esquema.ids_verificados).toHaveLength(7);
    expect(new Set(ANEXO.inmuebles_esquema.ids_verificados).size).toBe(7);

    const truncado = registros.at(-1)!;
    expect(truncado.__TRUNCADO__).toEqual(expect.any(String));
    expect(truncado.id).toBeUndefined();
    expect(truncado.amount).toBeUndefined();
    expect(truncado.propertyId).toBeUndefined();
  });

  it('distingue metadatos de comprobante de un binario disponible', () => {
    const comprobantes = ANEXO.gastos_ingresos_registros.filter((row) => 'receiptUrl_estado' in row);
    expect(comprobantes).toHaveLength(1);
    expect(comprobantes[0].receiptName).toEqual(expect.any(String));
    expect(comprobantes[0].receiptType).toBe('application/pdf');
    expect(comprobantes[0].receiptUrl).toBeUndefined();
    expect(comprobantes[0].storagePath).toBeUndefined();
  });

  it('ejecuta el dry-run de evidencia dos veces con el mismo resultado y sin registros AUTO', () => {
    const primero = dryRunEvidencia();
    const segundo = dryRunEvidencia();

    expect(jsonEstable(primero)).toBe(jsonEstable(segundo));
    expect(primero.soloLectura).toBe(true);
    expect(primero.resumen).toMatchObject({
      totalRegistros: 52,
      auto: 0,
      incompleto: 36,
      bloqueado: 15,
      noMigrable: 1,
    });
    expect(primero.lineas.every((linea) => linea.proveniencia.sourceFile === ANEXO_PATH)).toBe(true);
    expect(primero.lineas.some((linea) => linea.entidad === 'TRUNCADO' && linea.decision === 'NO_MIGRABLE')).toBe(true);
  });

  it('bloquea autorización sin el fichero original custodiado y su SHA, aunque el anexo tenga hash', () => {
    const dryRun = dryRunEvidencia();
    const autorizacion = autorizarMigracion({
      lote: {
        id: 'RENTASYNC-EVIDENCIA-TRANSCRITA',
        fuente: ANEXO.__PROVENANCE__.origen,
        ficheros: [],
        numRegistros: dryRun.resumen.totalRegistros,
        tamanoBytes: ANEXO_BYTES.byteLength,
        sha256: null,
        generadoEn: ANEXO.__FECHA__,
        esquemaVersion: 'rentasync-v1',
        motorB4Version: 'B4',
        commitDryRun: 'f10a45ee54db2db34761146e2c7b1ed922d8061c',
      },
      dryRun,
    });

    expect(SHA256_ANEXO).toMatch(/^[a-f0-9]{64}$/);
    expect(autorizacion.decision).toBe('BLOQUEADA');
    expect(autorizacion.motivo).toContain('sin fichero canónico');
    expect(autorizacion.resultado).toBe('AUTORIZACIÓN PREVIA (migración no ejecutada)');
  });
});
