/**
 * AG-10 · Núcleo de la fusión transaccional (`src/lib/contratoTransaccion.ts`).
 *
 * Pruebas PURAS de la política de datos: sin Firebase, sin mocks. Aquí se fija
 * QUÉ significa «no sobrescribir información económica más reciente», que es la
 * regla que después aplica la transacción de `firebase.ts`.
 */
import { describe, expect, it } from 'vitest';
import type { CobroPeriodo, ContratoFormalizacion } from '../../src/types';
import {
  ErrorConflictoContrato,
  contratoTrasPersistir,
  detectarCambioConcurrente,
  escriturasPorDiferencia,
  fusionarContratoParaPersistencia,
  fusionarPeriodos,
  mismoPeriodo,
  reaplicarPeriodo,
  tieneDatosEconomicos,
} from '../../src/lib/contratoTransaccion';

function periodo(mes: number, extra: Partial<CobroPeriodo> = {}): CobroPeriodo {
  const mm = String(mes).padStart(2, '0');
  return {
    id: `cobro_ct_2026_${mm}`,
    inmuebleId: 'inm-1',
    contratoId: 'ct-1',
    inquilinoId: 'cand-1',
    propietarioId: 'prop-1',
    mes,
    anio: 2026,
    periodoMesAnio: `2026-${mm}`,
    nombreMes: `Mes ${mes}`,
    importePrevisto: 900,
    importeRecibido: 0,
    fechaVencimiento: `2026-${mm}-05`,
    estado: 'PENDIENTE',
    historialCambios: [],
    ...extra,
  };
}

const conPago = (p: CobroPeriodo, importe = 900) => ({
  ...p,
  importeRecibido: importe,
  fechaPago: '2026-01-06',
  estado: 'RECIBIDO' as const,
  historialCambios: [
    {
      id: `hist_${p.id}`,
      fecha: '2026-01-06T09:00:00.000Z',
      accion: 'Registro de pago recibido',
      estadoAnterior: 'PENDIENTE' as const,
      estadoNuevo: 'RECIBIDO' as const,
    },
  ],
});

const contrato = (extra: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion => ({
  id: 'ct-1',
  candidatoId: 'cand-1',
  inmuebleId: 'inm-1',
  propietarioId: 'prop-1',
  rentaMensual: 900,
  estado: 'FORMALIZADO_ACTIVO',
  firmaArrendador: { firmado: false },
  firmaArrendatario: { firmado: false },
  fechaActualizacion: '2026-01-01T00:00:00.000Z',
  historial: [],
  registroCobros: [periodo(1), periodo(2)],
  ...extra,
} as ContratoFormalizacion);

describe('AG-10 · clasificación de periodos', () => {
  it('reconoce los periodos con datos económicos y los vacíos', () => {
    expect(tieneDatosEconomicos(periodo(1))).toBe(false);
    expect(tieneDatosEconomicos({ ...periodo(1), estado: 'RETRASADO' })).toBe(false);
    expect(tieneDatosEconomicos(conPago(periodo(1)))).toBe(true);
    expect(tieneDatosEconomicos({ ...periodo(1), estado: 'INCIDENCIA' })).toBe(true);
    expect(tieneDatosEconomicos({ ...periodo(1), justificante: { id: 'j', nombreArchivo: 'a.pdf', fechaSubida: 'x' } })).toBe(true);
    expect(tieneDatosEconomicos(null)).toBe(false);
  });

  it('ignora las marcas accesorias al comparar (idempotencia real)', () => {
    const a = periodo(1);
    expect(mismoPeriodo(a, { ...a, ultimaModificacion: 'otra' })).toBe(true);
    expect(mismoPeriodo(a, { ...a, importeRecibido: 10 })).toBe(false);
    expect(mismoPeriodo(a, null)).toBe(false);
  });

  it('calcula la diferencia mínima entre dos calendarios', () => {
    const antes = [periodo(1), periodo(2)];
    const despues = [conPago(periodo(1)), periodo(2), periodo(3)];
    const escrituras = escriturasPorDiferencia(antes, despues, 'descartar');

    expect(escrituras).toHaveLength(2);
    expect(escrituras.map((e) => e.despues.id)).toEqual([
      'cobro_ct_2026_01',
      'cobro_ct_2026_03',
    ]);
    expect(escrituras[0].antes?.importeRecibido).toBe(0);
    expect(escrituras[1].antes).toBeUndefined();
  });
});

describe('AG-10 · conflicto de periodos', () => {
  it('«descartar» conserva el pago persistido y no lo degrada', () => {
    const persistidos = [conPago(periodo(1)), periodo(2)];
    const { cobros, descartados, escritos } = fusionarPeriodos(
      persistidos,
      [{ despues: { ...periodo(1), estado: 'RETRASADO' }, antes: periodo(1), politica: 'descartar' }],
      'FUSIONAR',
    );

    expect(descartados).toEqual(['cobro_ct_2026_01']);
    expect(escritos).toEqual([]);
    expect(cobros).toBeUndefined(); // nada que escribir: no hay commit vacío
  });

  it('«reintentar» reaplica la intención del usuario sin perder el pago ajeno', () => {
    const persistido = {
      ...conPago(periodo(1)),
      justificante: { id: 'just-1', nombreArchivo: 'transferencia.pdf', fechaSubida: '2026-01-06T09:00:00.000Z' },
    };
    const base = periodo(1);
    const intencion = { ...periodo(1), observaciones: 'Revisado por el titular' };

    const { cobros, reaplicados } = fusionarPeriodos(
      [persistido],
      [{ despues: intencion, antes: base, politica: 'reintentar' }],
      'FUSIONAR',
    );

    const enero = cobros?.[0] as CobroPeriodo;
    expect(reaplicados).toEqual(['cobro_ct_2026_01']);
    expect(enero.observaciones).toBe('Revisado por el titular'); // el cambio del usuario
    expect(enero.importeRecibido).toBe(900);                     // el pago del otro cliente
    expect(enero.estado).toBe('RECIBIDO');
    expect(enero.justificante?.id).toBe('just-1');
  });

  it('un periodo nuevo se materializa aunque el cálculo no traiga datos económicos', () => {
    const { cobros, escritos } = fusionarPeriodos(
      [periodo(1)],
      [{ despues: periodo(2), politica: 'descartar' }],
      'FUSIONAR',
    );
    expect(escritos).toEqual(['cobro_ct_2026_02']);
    expect(cobros?.map((p) => p.id)).toEqual(['cobro_ct_2026_01', 'cobro_ct_2026_02']);
  });

  it('no duplica un periodo cuyo id ya existe (colisión de id determinista)', () => {
    const { cobros } = fusionarPeriodos(
      [periodo(1), periodo(2)],
      [{ despues: periodo(1), politica: 'descartar' }],
      'FUSIONAR',
    );
    // Idéntico a lo persistido ⇒ no hay escritura ni periodo duplicado.
    expect(cobros).toBeUndefined();
  });

  it('un pago persistido no se pierde si el cálculo trae el mismo periodo vacío', () => {
    const { cobros, descartados } = fusionarPeriodos(
      [conPago(periodo(1))],
      [{ despues: periodo(1), politica: 'descartar' }],
      'FUSIONAR',
    );
    expect(cobros).toBeUndefined();
    expect(descartados).toEqual(['cobro_ct_2026_01']); // se descarta el vacío
  });

  it('rechaza un periodo de otro contrato (integridad de la estructura)', () => {
    expect(() => fusionarPeriodos(
      [periodo(1)],
      [{ despues: { ...periodo(1), contratoId: 'otro-contrato' }, antes: periodo(1), politica: 'reintentar' }],
      'FUSIONAR',
    )).toThrow(ErrorConflictoContrato);
  });

  it('conserva los periodos que la operación no declara', () => {
    const persistidos = [periodo(1), conPago(periodo(2)), periodo(3)];
    const { cobros } = fusionarPeriodos(
      persistidos,
      [{ despues: { ...periodo(1), estado: 'RECLAMADO' }, antes: periodo(1), politica: 'reintentar' }],
      'FUSIONAR',
    );
    expect(cobros?.find((p) => p.mes === 2)?.estado).toBe('RECIBIDO');
    expect(cobros).toHaveLength(3);
  });
});

describe('AG-10 · fusión del documento del contrato', () => {
  it('protege la firma: una instantánea previa a la firma no la desmarca', () => {
    const persistido = contrato({
      firmaArrendador: { firmado: true, fecha: '2026-01-02' },
      firmaArrendatario: { firmado: true, fecha: '2026-01-02' },
    });
    const viejo = contrato({ notasPrivadas: 'edición del gestor' });

    const { datos } = fusionarContratoParaPersistencia({
      contrato: viejo,
      persistido,
      base: viejo,
      modoCobros: 'CONSERVAR',
    });

    expect((datos.firmaArrendador as { firmado: boolean }).firmado).toBe(true);
    expect((datos.firmaArrendatario as { firmado: boolean }).firmado).toBe(true);
    expect(datos.notasPrivadas).toBe('edición del gestor');
  });

  it('permite desmarcar la firma si el usuario la vio firmada', () => {
    const persistido = contrato({ firmaArrendador: { firmado: true, fecha: '2026-01-02' } });
    const base = contrato({ firmaArrendador: { firmado: true, fecha: '2026-01-02' } });
    const nuevo = contrato({ firmaArrendador: { firmado: false } });

    const { datos } = fusionarContratoParaPersistencia({
      contrato: nuevo,
      persistido,
      base,
      modoCobros: 'CONSERVAR',
    });

    expect((datos.firmaArrendador as { firmado: boolean }).firmado).toBe(false);
  });

  it('une el historial contractual: nunca se pierde una entrada', () => {
    const persistido = contrato({
      historial: [{ id: 'h-viejo', fecha: '2026-01-01', autor: 'sistema', accion: 'Alta' }],
    });
    const nuevo = contrato({
      historial: [{ id: 'h-nuevo', fecha: '2026-02-01', autor: 'sistema', accion: 'Cambio de estado' }],
    });

    const { datos } = fusionarContratoParaPersistencia({
      contrato: nuevo,
      persistido,
      base: persistido,
      modoCobros: 'CONSERVAR',
    });

    expect((datos.historial as Array<{ id: string }>).map((h) => h.id)).toEqual(['h-nuevo', 'h-viejo']);
  });

  it('no escribe cuando el documento ya está persistido (hayCambios = false)', () => {
    const persistido = contrato();
    const { hayCambios } = fusionarContratoParaPersistencia({
      contrato: contrato(),
      persistido,
      base: persistido,
      modoCobros: 'FUSIONAR',
    });
    expect(hayCambios).toBe(false);
  });

  it('respeta los campos omitidos (índices de capacidad del portal)', () => {
    const persistido = contrato({ incidenciaIds: ['inc-1'], mensajeIds: ['msg-1'] });
    const nuevo = contrato({ incidenciaIds: [], mensajeIds: [], notasPrivadas: 'x' });

    const { datos } = fusionarContratoParaPersistencia({
      contrato: nuevo,
      persistido,
      base: persistido,
      modoCobros: 'CONSERVAR',
      omitirCampos: ['incidenciaIds', 'mensajeIds'],
    });

    expect(datos.incidenciaIds).toBeUndefined();
    expect(datos.mensajeIds).toBeUndefined();
  });

  it('detecta el cambio concurrente del documento', () => {
    const base = contrato();
    expect(detectarCambioConcurrente(base, contrato())).toBe(false);
    expect(detectarCambioConcurrente(base, contrato({ rentaMensual: 950 }))).toBe(true);
    // La marca de actualización del propio usuario no es concurrencia.
    expect(detectarCambioConcurrente(base, contrato({ fechaActualizacion: '2026-03-01T00:00:00.000Z' }))).toBe(false);
  });

  it('el contrato devuelto a la UI es el persistido (incluye pagos ajenos)', () => {
    const operacion = contrato();
    const persistido = contrato({ registroCobros: [conPago(periodo(1)), periodo(2)] });
    const resultado = contratoTrasPersistir(operacion, persistido);

    expect(resultado.registroCobros?.[0].estado).toBe('RECIBIDO');
    expect(resultado.id).toBe('ct-1');
  });

  it('reaplicar un periodo une el historial sin duplicar entradas', () => {
    const antes = periodo(1);
    const despues = { ...periodo(1), observaciones: 'nota' };
    const persistido = {
      ...conPago(periodo(1)),
      historialCambios: [
        ...conPago(periodo(1)).historialCambios,
        { id: 'hist_otro', fecha: '2026-02-01T00:00:00.000Z', accion: 'Incidencia reportada' },
      ],
    };

    const unido = reaplicarPeriodo(antes, despues, persistido);
    expect(unido.historialCambios.map((h) => h.id)).toEqual(['hist_cobro_ct_2026_01', 'hist_otro']);
    expect(unido.observaciones).toBe('nota');
  });
});
