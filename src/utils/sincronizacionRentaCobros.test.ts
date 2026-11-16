import { describe, expect, it } from 'vitest';
import {
  ACCION_HISTORIAL_ACTUALIZACION_RENTA,
  documentoAuditoriaSincronizacionRenta,
  inicioDelPeriodo,
  motivoNoActualizable,
  sincronizarImportesPrevistos,
  type ReciboActualizable,
} from './sincronizacionRentaCobros';

/**
 * AG-06 · Pruebas del motor de sincronización renta → recibos.
 * Datos sintéticos: ningún identificador corresponde a un inmueble real.
 */

const RENTA_ANTERIOR = 900;
const RENTA_NUEVA = 950;
const EFECTIVA = '2026-11-01';
const CLAVE = 'a'.repeat(64);

function recibo(extra: Partial<ReciboActualizable> & { id: string; periodoMesAnio: string }): ReciboActualizable {
  return {
    importePrevisto: RENTA_ANTERIOR,
    importeRecibido: 0,
    estado: 'PENDIENTE',
    historialCambios: [],
    ...extra,
  };
}

const parametros = {
  rentaNueva: RENTA_NUEVA,
  rentaAnterior: RENTA_ANTERIOR,
  fechaEfectividad: EFECTIVA,
  usuarioId: 'usr-propietario-a',
  usuarioNombre: 'Propietario A (sintético)',
  ahora: '2026-10-20T10:00:00.000Z',
  idempotencyKeyHash: CLAVE,
};

describe('AG-06 · periodo y criterio de actualización', () => {
  it('inicioDelPeriodo devuelve el primer día del mes', () => {
    expect(inicioDelPeriodo('2026-11')).toBe('2026-11-01');
    expect(inicioDelPeriodo('2027-01')).toBe('2027-01-01');
  });

  it('inicioDelPeriodo rechaza periodos inválidos sin lanzar', () => {
    for (const valor of ['', '2026', '2026-13', '2026-00', 'noviembre', '2026-1']) {
      expect(inicioDelPeriodo(valor)).toBeNull();
    }
  });

  it('un recibo futuro pendiente y sin cobrar SÍ es actualizable', () => {
    expect(motivoNoActualizable(recibo({ id: 'r', periodoMesAnio: '2026-12' }), EFECTIVA, RENTA_NUEVA)).toBeNull();
  });

  it('el mes de la fecha efectiva NO se actualiza: el periodo ya ha empezado', () => {
    // La regla: solo periodos cuya fecha de inicio sea POSTERIOR a la efectiva.
    expect(motivoNoActualizable(recibo({ id: 'r', periodoMesAnio: '2026-11' }), EFECTIVA, RENTA_NUEVA))
      .toBe('PERIODO_INICIADO');
  });

  it('un recibo de un mes anterior a la efectividad queda fuera', () => {
    expect(motivoNoActualizable(recibo({ id: 'r', periodoMesAnio: '2026-10' }), EFECTIVA, RENTA_NUEVA))
      .toBe('PERIODO_INICIADO');
  });

  it('un recibo ya cobrado no se toca aunque esté PENDIENTE', () => {
    expect(motivoNoActualizable(
      recibo({ id: 'r', periodoMesAnio: '2026-12', importeRecibido: 100 }), EFECTIVA, RENTA_NUEVA,
    )).toBe('YA_COBRADO');
  });

  it('cualquier estado distinto de PENDIENTE queda fuera', () => {
    for (const estado of ['RECIBIDO', 'PAGADO', 'PAGADO_PARCIAL', 'RETRASADO', 'RECLAMADO', 'ANULADO', 'IMPAGADO', 'INCIDENCIA', 'VERIFICADO', 'DEVUELTO']) {
      expect(motivoNoActualizable(recibo({ id: 'r', periodoMesAnio: '2026-12', estado }), EFECTIVA, RENTA_NUEVA))
        .toBe('ESTADO_NO_PENDIENTE');
    }
  });

  it('un recibo que ya tiene la renta nueva no genera un cambio vacío', () => {
    expect(motivoNoActualizable(
      recibo({ id: 'r', periodoMesAnio: '2026-12', importePrevisto: RENTA_NUEVA }), EFECTIVA, RENTA_NUEVA,
    )).toBe('IMPORTE_YA_ACTUALIZADO');
  });

  it('un periodo corrupto se declara omitido, no rompe la operación', () => {
    expect(motivoNoActualizable(recibo({ id: 'r', periodoMesAnio: 'sin-fecha' }), EFECTIVA, RENTA_NUEVA))
      .toBe('SIN_PERIODO_VALIDO');
  });
});

describe('AG-06 · sincronización de varios periodos', () => {
  it('actualiza todos los periodos futuros pendientes y conserva el orden', () => {
    const entrada = [
      recibo({ id: 'r-nov', periodoMesAnio: '2026-11' }),
      recibo({ id: 'r-dic', periodoMesAnio: '2026-12' }),
      recibo({ id: 'r-ene', periodoMesAnio: '2027-01' }),
    ];
    const { recibos, cambios } = sincronizarImportesPrevistos(entrada, parametros);

    expect(recibos.map((r) => r.id)).toEqual(['r-nov', 'r-dic', 'r-ene']);
    expect(cambios.map((c) => c.periodoMesAnio)).toEqual(['2026-12', '2027-01']);
    expect(recibos[1].importePrevisto).toBe(RENTA_NUEVA);
    expect(recibos[2].importePrevisto).toBe(RENTA_NUEVA);
    // El periodo ya iniciado conserva su importe.
    expect(recibos[0].importePrevisto).toBe(RENTA_ANTERIOR);
  });

  it('no muta la colección de entrada', () => {
    const original = recibo({ id: 'r', periodoMesAnio: '2026-12' });
    const congelado = JSON.stringify(original);
    sincronizarImportesPrevistos([original], parametros);
    expect(JSON.stringify(original)).toBe(congelado);
  });

  it('conserva cobrados, parciales, retrasados e históricos intactos', () => {
    const entrada = [
      recibo({ id: 'cobrado', periodoMesAnio: '2026-12', estado: 'RECIBIDO', importeRecibido: RENTA_ANTERIOR }),
      recibo({ id: 'parcial', periodoMesAnio: '2027-01', estado: 'PAGADO_PARCIAL', importeRecibido: 400 }),
      recibo({ id: 'retrasado', periodoMesAnio: '2026-10', estado: 'RETRASADO' }),
      recibo({ id: 'historico', periodoMesAnio: '2025-06', estado: 'RECIBIDO', importeRecibido: 800 }),
    ];
    const { recibos, cambios } = sincronizarImportesPrevistos(entrada, parametros);

    expect(cambios).toEqual([]);
    expect(recibos.map((r) => r.importePrevisto)).toEqual([RENTA_ANTERIOR, RENTA_ANTERIOR, RENTA_ANTERIOR, RENTA_ANTERIOR]);
    expect(recibos.map((r) => r.importeRecibido)).toEqual([RENTA_ANTERIOR, 400, 0, 800]);
  });

  it('deja un recibo RETRASADO de un mes futuro sin tocar: es una deuda ya reclamada', () => {
    const { cambios } = sincronizarImportesPrevistos(
      [recibo({ id: 'r', periodoMesAnio: '2027-03', estado: 'RETRASADO' })], parametros,
    );
    expect(cambios).toEqual([]);
  });

  it('un contrato sin recibos materializados no produce cambios ni error', () => {
    const resultado = sincronizarImportesPrevistos([], parametros);
    expect(resultado.recibos).toEqual([]);
    expect(resultado.cambios).toEqual([]);
    expect(resultado.omitidos).toEqual([]);
  });

  it('conserva el historial económico previo del recibo', () => {
    const previo = { id: 'hist-1', fecha: '2026-09-01T00:00:00.000Z', accion: 'ALTA', importeNuevo: RENTA_ANTERIOR };
    const { recibos } = sincronizarImportesPrevistos(
      [recibo({ id: 'r', periodoMesAnio: '2026-12', historialCambios: [previo] })], parametros,
    );
    const historial = recibos[0].historialCambios as Array<Record<string, unknown>>;
    expect(historial).toHaveLength(2);
    expect(historial[0]).toMatchObject(previo);
    expect(historial[1]).toMatchObject({
      accion: ACCION_HISTORIAL_ACTUALIZACION_RENTA,
      importeAnterior: RENTA_ANTERIOR,
      importeNuevo: RENTA_NUEVA,
      usuarioId: 'usr-propietario-a',
    });
  });

  it('la traza registra contrato, recibo, periodo, importes, fecha efectiva y usuario', () => {
    const { recibos } = sincronizarImportesPrevistos([recibo({ id: 'r-1', periodoMesAnio: '2026-12' })], parametros);
    const entrada = (recibos[0].historialCambios as Array<Record<string, unknown>>)[0];

    expect(entrada.fecha).toBe(parametros.ahora);
    expect(entrada.usuarioNombre).toBe('Propietario A (sintético)');
    expect(entrada.importeAnterior).toBe(RENTA_ANTERIOR);
    expect(entrada.importeNuevo).toBe(RENTA_NUEVA);
    expect(String(entrada.detalles)).toContain('2026-11-01');
    expect(String(entrada.detalles)).toContain('Actualización de renta');
  });

  it('declara el motivo de cada omisión para poder explicarlo', () => {
    const { omitidos } = sincronizarImportesPrevistos([
      recibo({ id: 'a', periodoMesAnio: '2026-11' }),
      recibo({ id: 'b', periodoMesAnio: '2026-10', estado: 'RETRASADO' }),
      recibo({ id: 'c', periodoMesAnio: '2026-12', importeRecibido: 300 }),
    ], parametros);

    expect(omitidos).toEqual([
      { reciboId: 'a', periodoMesAnio: '2026-11', motivo: 'PERIODO_INICIADO' },
      { reciboId: 'b', periodoMesAnio: '2026-10', motivo: 'ESTADO_NO_PENDIENTE' },
      { reciboId: 'c', periodoMesAnio: '2026-12', motivo: 'YA_COBRADO' },
    ]);
  });
});

describe('AG-06 · idempotencia y aislamiento', () => {
  it('aplicar dos veces no duplica la traza ni cambia el importe', () => {
    const primera = sincronizarImportesPrevistos([recibo({ id: 'r', periodoMesAnio: '2026-12' })], parametros);
    const segunda = sincronizarImportesPrevistos(primera.recibos, parametros);

    expect(segunda.recibos[0].importePrevisto).toBe(RENTA_NUEVA);
    expect((segunda.recibos[0].historialCambios as unknown[])).toHaveLength(1);
    // La segunda pasada no tiene nada que hacer: es la propia idempotencia.
    expect(segunda.cambios).toEqual([]);
    expect(segunda.recibos[0].historialCambios).toEqual(primera.recibos[0].historialCambios);
  });

  it('un historial ya trazado con la misma clave no se duplica al reconstruir el recibo', () => {
    const primera = sincronizarImportesPrevistos([recibo({ id: 'r', periodoMesAnio: '2026-12' })], parametros);
    // Se fuerza el escenario: el recibo conserva la traza pero vuelve el importe anterior.
    const reconstruido: ReciboActualizable = {
      ...primera.recibos[0],
      importePrevisto: RENTA_ANTERIOR,
    };
    const segunda = sincronizarImportesPrevistos([reconstruido], parametros);

    expect(segunda.recibos[0].importePrevisto).toBe(RENTA_NUEVA);
    expect((segunda.recibos[0].historialCambios as unknown[])).toHaveLength(1);
  });

  it('solo toca los recibos del contrato cuyos periodos se pasan', () => {
    const contratoA = [recibo({ id: 'a-dic', periodoMesAnio: '2026-12' })];
    const contratoB = [recibo({ id: 'b-dic', periodoMesAnio: '2026-12' })];

    const resultadoA = sincronizarImportesPrevistos(contratoA, parametros);

    expect(resultadoA.cambios.map((c) => c.reciboId)).toEqual(['a-dic']);
    expect(contratoB[0].importePrevisto).toBe(RENTA_ANTERIOR);
  });

  it('el id de auditoría depende de la clave: reintentar no la duplica', () => {
    const base = {
      cambios: [{ reciboId: 'r', periodoMesAnio: '2026-12', importeAnterior: RENTA_ANTERIOR, importeNuevo: RENTA_NUEVA }],
      omitidos: [],
      contratoId: 'contrato-a',
      rentaAnterior: RENTA_ANTERIOR,
      rentaNueva: RENTA_NUEVA,
      fechaEfectividad: EFECTIVA,
      anexoId: 'anexo-a',
      actor: { uid: 'uid-a', usuarioId: 'usr-a', email: 'a@example.invalid', nombre: 'Actor A' },
      ahora: parametros.ahora,
      idempotencyKeyHash: CLAVE,
    };
    expect(documentoAuditoriaSincronizacionRenta(base).id)
      .toBe(documentoAuditoriaSincronizacionRenta(base).id);
  });
});

describe('AG-06 · documento de auditoría', () => {
  const base = {
    cambios: [
      { reciboId: 'r-1', periodoMesAnio: '2026-12', importeAnterior: RENTA_ANTERIOR, importeNuevo: RENTA_NUEVA },
      { reciboId: 'r-2', periodoMesAnio: '2027-01', importeAnterior: RENTA_ANTERIOR, importeNuevo: RENTA_NUEVA },
    ],
    omitidos: [{ reciboId: 'r-0', periodoMesAnio: '2026-11', motivo: 'PERIODO_INICIADO' as const }],
    contratoId: 'contrato-a',
    inmuebleId: 'inm-a',
    propietarioId: 'prop-a',
    rentaAnterior: RENTA_ANTERIOR,
    rentaNueva: RENTA_NUEVA,
    fechaEfectividad: EFECTIVA,
    anexoId: 'anexo-a',
    actor: { uid: 'uid-a', usuarioId: 'usr-a', email: 'a@example.invalid', nombre: 'Actor A' },
    ahora: '2026-10-20T10:00:00.000Z',
    idempotencyKeyHash: CLAVE,
  };

  it('usa el esquema existente de audit_logs', () => {
    const { datos } = documentoAuditoriaSincronizacionRenta(base);
    expect(datos).toMatchObject({
      usuarioId: 'usr-a',
      usuarioEmail: 'a@example.invalid',
      accion: 'ACTUALIZACION_RENTA_IMPORTES_PREVISTOS',
      entidadAfectada: 'contrato',
      idAfectado: 'contrato-a',
      resultado: 'EXITO',
      fechaHora: '2026-10-20T10:00:00.000Z',
    });
  });

  it('registra los importes de cada recibo, la fecha efectiva y el actor', () => {
    const { datos } = documentoAuditoriaSincronizacionRenta(base);
    const detalles = datos.detalles as Record<string, unknown>;
    expect(detalles).toMatchObject({
      motivo: 'ACTUALIZACION_RENTA',
      fechaEfectividad: EFECTIVA,
      rentaAnterior: RENTA_ANTERIOR,
      rentaNueva: RENTA_NUEVA,
      actorUid: 'uid-a',
      anexoId: 'anexo-a',
    });
    expect(detalles.recibosActualizados).toEqual([
      { reciboId: 'r-1', periodoMesAnio: '2026-12', importeAnterior: RENTA_ANTERIOR, importeNuevo: RENTA_NUEVA },
      { reciboId: 'r-2', periodoMesAnio: '2027-01', importeAnterior: RENTA_ANTERIOR, importeNuevo: RENTA_NUEVA },
    ]);
    expect(detalles.recibosOmitidos).toEqual([
      { reciboId: 'r-0', periodoMesAnio: '2026-11', motivo: 'PERIODO_INICIADO' },
    ]);
  });

  it('declara cuántos recibos se actualizaron en la descripción', () => {
    const { datos } = documentoAuditoriaSincronizacionRenta(base);
    expect(String(datos.descripcion)).toContain('2 recibo(s)');
  });
});
