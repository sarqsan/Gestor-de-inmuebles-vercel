/**
 * P0-B · Pruebas del núcleo de backup, integridad y coherencia.
 *
 * Se centran en los fallos que producen un FALSO VERDE, que es el riesgo real
 * de un sistema de copias: creer que hay respaldo cuando no lo hay.
 */
import { describe, expect, it } from 'vitest';

import {
  esBaseConNombre,
  POLITICA_RETENCION_POR_DEFECTO,
  crearEventoBackup,
  crearSnapshotId,
  construirManifiesto,
  esRutaAlmacenValida,
  exigirParCompleto,
  validarDestinoBackup,
  validarRestauracionSegura,
  verificarCoherencia,
  verificarManifiesto,
  calcularRetencion,
} from './nucleoBackup';

/** El literal de la base por defecto: PROHIBIDO en código ejecutable, legítimo aquí. */
const BASE_PROHIBIDA = '(default)';

const DESTINO = {
  proyecto: 'gestor-inmuebles-produccion',
  baseDatos: 'ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51',
  bucket: 'gestor-inmuebles-backups',
};

const sha = (c) => c.repeat(64);

describe('P0-B · identidad del destino (anti falso verde)', () => {
  it('acepta un destino completo con base con nombre', () => {
    const d = validarDestinoBackup(DESTINO);
    expect(d.proyecto).toBe(DESTINO.proyecto);
    expect(d.baseDatos).toBe(DESTINO.baseDatos);
    expect(d.huella).toContain('::');
  });

  it('RECHAZA la ausencia de base de datos (el error clásico: exportar la vacía)', () => {
    expect(() => validarDestinoBackup({ ...DESTINO, baseDatos: '' }))
      .toThrowError(/base CON NOMBRE/);
  });

  it('RECHAZA explícitamente la base `(default)`', () => {
    expect(() => validarDestinoBackup({ ...DESTINO, baseDatos: BASE_PROHIBIDA }))
      .toThrowError(/prohibida/);
  });

  it('rechaza proyecto ausente, inválido o bucket ausente', () => {
    expect(() => validarDestinoBackup({ ...DESTINO, proyecto: '' })).toThrowError(/proyecto/i);
    expect(() => validarDestinoBackup({ ...DESTINO, proyecto: 'con espacio' })).toThrowError(/no válido/);
    expect(() => validarDestinoBackup({ ...DESTINO, bucket: '' })).toThrowError(/bucket/i);
  });

  it('nunca "adivina" valores por defecto', () => {
    expect(() => validarDestinoBackup({})).toThrowError(/obligatorio/);
    expect(() => validarDestinoBackup(null)).toThrowError();
  });
});

describe('P0-B · guardia de restauración', () => {
  const politica = { produccion: ['gestor-inmuebles-produccion'], permitidos: ['gestor-inmuebles-restore-test'] };

  it('bloquea restaurar sobre producción', () => {
    expect(() => validarRestauracionSegura({ ...DESTINO }, politica))
      .toThrowError(/es producción/);
  });

  it('bloquea un destino fuera de la lista blanca', () => {
    expect(() => validarRestauracionSegura({ proyecto: 'otro', baseDatos: 'x-base' }, politica))
      .toThrowError(/lista blanca/);
  });

  it('permite el proyecto aislado', () => {
    expect(validarRestauracionSegura(
      { proyecto: 'gestor-inmuebles-restore-test', baseDatos: DESTINO.baseDatos }, politica)
    ).toEqual({ proyecto: 'gestor-inmuebles-restore-test', baseDatos: DESTINO.baseDatos, ok: true });
  });

  it('bloquea restaurar sobre la base por defecto incluso en el proyecto aislado', () => {
    expect(() => validarRestauracionSegura(
      { proyecto: 'gestor-inmuebles-restore-test', baseDatos: BASE_PROHIBIDA }, politica))
      .toThrowError(/base por defecto/i);
  });
});

describe('P0-B · snapshotId y par completo', () => {
  it('genera un id ordenable y estable', () => {
    const id = crearSnapshotId(new Date('2026-11-15T03:00:00.000Z'));
    expect(id).toBe('20261115T030000Z-s1');
    const posterior = crearSnapshotId(new Date('2026-11-16T03:00:00.000Z'));
    expect(posterior > id).toBe(true);
  });

  it('rechaza fechas inválidas y esquemas no positivos', () => {
    expect(() => crearSnapshotId(new Date('no-es-fecha'))).toThrowError();
    expect(() => crearSnapshotId(new Date(), 0)).toThrowError();
  });

  it('exige Firestore Y Storage del mismo snapshot', () => {
    const id = '20261115T030000Z-s1';
    expect(exigirParCompleto(id, {
      firestore: { snapshotId: id }, storage: { snapshotId: id },
    })).toBe(true);
  });

  it('RECHAZA restaurar solo una parte', () => {
    const id = '20261115T030000Z-s1';
    expect(() => exigirParCompleto(id, { firestore: { snapshotId: id } }))
      .toThrowError(/falta storage/);
  });

  it('RECHAZA partes desacopladas de snapshots distintos', () => {
    expect(() => exigirParCompleto('a', {
      firestore: { snapshotId: '20261115T030000Z-s1' },
      storage: { snapshotId: '20261114T030000Z-s1' },
    })).toThrowError(/desfasados/);
  });
});

describe('P0-B · manifiesto e integridad', () => {
  const objetos = [
    { ruta: 'contratos/c1/doc.pdf', bytes: 100, sha256: sha('a') },
    { ruta: 'incidencias/i1/foto.jpg', bytes: 200, sha256: sha('b') },
  ];
  const manifiesto = construirManifiesto({
    snapshotId: '20261115T030000Z-s1',
    destino: DESTINO,
    recuentoColecciones: { inmuebles: 3, contratos_formalizacion: 2 },
    objetos,
  });

  it('cuenta documentos y objetos, y suma bytes', () => {
    expect(manifiesto.totalDocumentos).toBe(5);
    expect(manifiesto.totalObjetos).toBe(2);
    expect(manifiesto.bytesTotales).toBe(300);
    expect(manifiesto.objetos.map((o) => o.ruta)).toEqual([...objetos.map((o) => o.ruta)].sort());
  });

  it('rechaza objetos sin hash o con hash inválido', () => {
    expect(() => construirManifiesto({
      snapshotId: 'x', destino: DESTINO, recuentoColecciones: {}, objetos: [{ ruta: 'a', bytes: 1 }],
    })).toThrowError(/Hash SHA-256/);
  });

  it('rechaza rutas duplicadas en el manifiesto', () => {
    expect(() => construirManifiesto({
      snapshotId: 'x', destino: DESTINO, recuentoColecciones: {},
      objetos: [{ ruta: 'a', bytes: 1, sha256: sha('a') }, { ruta: 'a', bytes: 1, sha256: sha('a') }],
    })).toThrowError(/duplicada/);
  });

  it('verifica OK cuando todo coincide', () => {
    const obs = { objetos: [...objetos], recuentoColecciones: { inmuebles: 3, contratos_formalizacion: 2 } };
    expect(verificarManifiesto(manifiesto, obs)).toEqual({ ok: true, incidencias: [] });
  });

  it('detecta archivo ausente, hash distinto, tamaño distinto y sobrante', () => {
    const obs = {
      objetos: [
        { ruta: 'contratos/c1/doc.pdf', bytes: 999, sha256: sha('c') }, // hash y tamaño mal
        { ruta: 'sobrante/x.pdf', bytes: 1, sha256: sha('d') },          // sobrante
        // falta incidencias/i1/foto.jpg
      ],
      recuentoColecciones: { inmuebles: 3, contratos_formalizacion: 2 },
    };
    const r = verificarManifiesto(manifiesto, obs);
    expect(r.ok).toBe(false);
    const tipos = r.incidencias.map((i) => i.tipo).sort();
    expect(tipos).toContain('OBJETO_AUSENTE');
    expect(tipos).toContain('HASH_DISTINTO');
    expect(tipos).toContain('TAMANO_DISTINTO');
    expect(tipos).toContain('OBJETO_SOBRANTE');
  });

  it('detecta recuento de colección distinto o no verificado', () => {
    const obs = { objetos: [...objetos], recuentoColecciones: { inmuebles: 4, contratos_formalizacion: 2 } };
    const r = verificarManifiesto(manifiesto, obs);
    expect(r.incidencias.some((i) => i.tipo === 'RECUENTO_DISTINTO' && i.coleccion === 'inmuebles')).toBe(true);

    const r2 = verificarManifiesto(manifiesto, { objetos: [...objetos], recuentoColecciones: {} });
    expect(r2.incidencias.some((i) => i.tipo === 'COLECCION_NO_VERIFICADA')).toBe(true);
  });
});

describe('P0-B · coherencia documento ↔ archivo', () => {
  it('detecta referencia rota, huérfano y duplicado', () => {
    const r = verificarCoherencia({
      referencias: [
        { ruta: 'contratos/c1/a.pdf', origen: 'contratos_formalizacion/c1' },
        { ruta: 'contratos/c1/a.pdf', origen: 'gastos/g9' }, // duplicado
        { ruta: 'incidencias/i1/b.jpg', origen: 'incidencias/i1' }, // rota: no existe
      ],
      objetosPresentes: ['contratos/c1/a.pdf', 'suelto/huerfano.pdf'],
    });
    expect(r.ok).toBe(false);
    expect(r.referenciasRotas).toEqual([{ ruta: 'incidencias/i1/b.jpg', origen: 'incidencias/i1' }]);
    expect(r.objetosHuerfanos).toEqual(['suelto/huerfano.pdf']);
    expect(r.duplicados).toEqual([{ ruta: 'contratos/c1/a.pdf', referencias: 2 }]);
  });

  it('todo coherente ⇒ ok', () => {
    const r = verificarCoherencia({
      referencias: [{ ruta: 'contratos/c1/a.pdf', origen: 'x' }],
      objetosPresentes: ['contratos/c1/a.pdf'],
    });
    expect(r).toEqual({ ok: true, referenciasRotas: [], objetosHuerfanos: [], duplicados: [] });
  });

  it('valida la forma de las rutas de almacén', () => {
    expect(esRutaAlmacenValida('contratos/c1/doc.pdf')).toBe(true);
    expect(esRutaAlmacenValida('/contratos/c1/doc.pdf')).toBe(false);
    expect(esRutaAlmacenValida('contratos//doc.pdf')).toBe(false);
    expect(esRutaAlmacenValida('contratos/../../etc/passwd')).toBe(false);
    expect(esRutaAlmacenValida('')).toBe(false);
  });
});

describe('P0-B · política de retención', () => {
  const dia = (n) => new Date(Date.UTC(2026, 10, 15 - n, 3, 0, 0));

  it('conserva los diarios más recientes y purga el resto', () => {
    const snapshots = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, fecha: dia(i).toISOString() }));
    const { conservar, purgar } = calcularRetencion(snapshots);
    expect(conservar).toContain('s0');
    expect(purgar.length).toBeGreaterThan(0);
    // Nunca conserva y purga el mismo id
    expect(conservar.filter((id) => purgar.includes(id))).toHaveLength(0);
    // No purga todo
    expect(conservar.length).toBeGreaterThanOrEqual(POLITICA_RETENCION_POR_DEFECTO.diarios);
  });

  it('es determinista', () => {
    const snapshots = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, fecha: dia(i).toISOString() }));
    expect(calcularRetencion(snapshots)).toEqual(calcularRetencion([...snapshots].reverse()));
  });

  it('ignora fechas inválidas', () => {
    const r = calcularRetencion([{ id: 'ok', fecha: dia(0).toISOString() }, { id: 'mal', fecha: 'no' }]);
    expect(r.conservar).toContain('ok');
    expect(r.conservar).not.toContain('mal');
  });

  it('conserva al menos un anual por ejercicio', () => {
    const snapshots = [2023, 2024, 2025, 2026].map((y, i) => ({
      id: `y${y}`, fecha: new Date(Date.UTC(y, 5, 1, 3)).toISOString(),
    }));
    const { conservar } = calcularRetencion(snapshots);
    for (const y of [2023, 2024, 2025, 2026]) expect(conservar).toContain(`y${y}`);
  });
});

describe('P0-B · registro de operaciones', () => {
  it('crea un evento con proyecto y base reales', () => {
    const e = crearEventoBackup({
      tipo: 'BACKUP_COMPLETADO', snapshotId: '20261115T030000Z-s1',
      destino: DESTINO, resultado: 'OK',
    });
    expect(e.proyecto).toBe(DESTINO.proyecto);
    expect(e.baseDatos).toBe(DESTINO.baseDatos);
    expect(e.snapshotId).toBe('20261115T030000Z-s1');
  });

  it('rechaza tipos no permitidos y snapshots vacíos', () => {
    expect(() => crearEventoBackup({ tipo: 'OTRA_COSA', snapshotId: 'x', destino: DESTINO, resultado: 'OK' }))
      .toThrowError(/no permitido/);
    expect(() => crearEventoBackup({ tipo: 'PURGA', snapshotId: '', destino: DESTINO, resultado: 'OK' }))
      .toThrowError(/snapshotId/);
  });

  it('no registra un evento sin base válida (evita auditoría sin identidad)', () => {
    expect(() => crearEventoBackup({
      tipo: 'BACKUP_INICIADO', snapshotId: 'x', destino: { ...DESTINO, baseDatos: '' }, resultado: 'OK',
    })).toThrowError();
  });
});
