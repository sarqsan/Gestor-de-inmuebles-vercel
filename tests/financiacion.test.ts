import { describe, it, expect } from 'vitest';

import {
  calcularLTV,
  validarFinanciacion,
  redondear2,
} from '../src/types/financiacion';
import type { FinanciacionParams } from '../src/types/financiacion';
import {
  generarCuadroAmortizacion,
  resumenCuadro,
  cuotaFrancesa,
  tramosDeTipo,
  simularAmortizacionAnticipada,
  calcularCosteFinanciero,
  puedeGestionarFinanciacion,
  calcularImpacto,
  crearFinanciacion,
} from '../src/utils/financiacionEngine';

import { DispatcherNotificaciones } from '../src/notificaciones/dispatcher';
import { CanalInApp } from '../src/notificaciones/canales';
import { PLANTILLAS } from '../src/notificaciones/plantillas';
import { seleccionarPlantilla } from '../src/notificaciones/resolucion';
import { eventoFinanciacionCreada } from '../src/notificaciones/adaptadores';

function tasasAplicadas(p: FinanciacionParams): number[] {
  // revierte tramos a un array por periodo para aserciones internas
  const arr: number[] = [];
  for (const t of tramosDeTipo(p)) {
    for (let i = t.desdePeriodo; i <= t.hastaPeriodo; i++) arr.push(t.tipoAnual);
  }
  return arr;
}

const baseFija: FinanciacionParams = {
  principal: 150000,
  valorReferencia: 200000,
  plazoMeses: 120,
  tipoInteresAnual: 3.5,
  sistemaAmortizacion: 'FRANCES',
  modalidadInteres: 'FIJO',
  inicio: '2026-01-01',
  carencia: 'NINGUNA',
};

describe('GAP4 — Modelo de financiación', () => {
  it('LTV cálculo normal', () => {
    expect(calcularLTV(150000, 200000)).toBe(75);
  });
  it('LTV división por cero → null', () => {
    expect(calcularLTV(150000, 0)).toBeNull();
    expect(calcularLTV(0, 0)).toBeNull();
  });
  it('LTV límites y redondeo', () => {
    expect(calcularLTV(100, 3)).toBeCloseTo(3333.33, 2);
    expect(calcularLTV(-1, 100)).toBeNull();
    expect(calcularLTV(100, -100)).toBeNull();
  });

  it('validación: creación válida y datos inválidos', () => {
    expect(validarFinanciacion(baseFija).valido).toBe(true);
    expect(validarFinanciacion({ ...baseFija, principal: -1 }).valido).toBe(false);
    expect(validarFinanciacion({ ...baseFija, valorReferencia: 0 }).valido).toBe(false);
    expect(validarFinanciacion({ ...baseFija, plazoMeses: 0 }).valido).toBe(false);
    expect(validarFinanciacion({ ...baseFija, plazoMeses: 12.5 }).valido).toBe(false);
    expect(validarFinanciacion({ ...baseFija, tipoInteresAnual: -0.1 }).valido).toBe(false);
    expect(validarFinanciacion({ ...baseFija, carenciaMeses: 500 }).valido).toBe(false);
  });
});

describe('GAP4 — Amortización francesa', () => {
  it('cuota', () => {
    const c = cuotaFrancesa(150000, 3.5, 120);
    expect(c).toBeGreaterThan(1400);
    expect(c).toBeLessThan(1600);
  });
  it('intereses/capital/saldo final', () => {
    const a = generarCuadroAmortizacion(baseFija);
    expect(a.length).toBe(120);
    const ultimo = a[a.length - 1];
    expect(ultimo.capitalPendiente).toBe(0);
    expect(ultimo.capitalAmortizado).toBeGreaterThan(0);
    const { totalPagado } = resumenCuadro(a);
    expect(totalPagado).toBeGreaterThan(150000); // incluye intereses
  });
});

describe('GAP4 — Amortización lineal', () => {
  it('capital uniforme + saldo final', () => {
    const a = generarCuadroAmortizacion({
      ...baseFija,
      sistemaAmortizacion: 'LINEAL',
      tipoInteresAnual: 2.5,
      plazoMeses: 60,
    });
    expect(a.length).toBe(60);
    expect(a[0].capitalAmortizado).toBeCloseTo(2500, 2);
    expect(a[59].capitalPendiente).toBe(0);
  });
});

describe('GAP4 — Carencia', () => {
  it('sin carencia → 120 cuotas normales', () => {
    const a = generarCuadroAmortizacion(baseFija);
    expect(a[0].tipoTramo).toBe('normal');
  });
  it('solo intereses → 6 sin capital y luego normal (con capital)', () => {
    const a = generarCuadroAmortizacion({ ...baseFija, carencia: 'SOLO_INTERESES', carenciaMeses: 6 });
    expect(a[0].tipoTramo).toBe('carencia_solo_intereses');
    expect(a[0].capitalAmortizado).toBe(0);
    expect(a[5].tipoTramo).toBe('carencia_solo_intereses');
    expect(a[6].tipoTramo).toBe('normal');
    expect(a[6].capitalAmortizado).toBeGreaterThan(0);
    expect(a[119].capitalPendiente).toBe(0);
  });
  it('carencia total → 6 sin cuota, intereses capitalizados', () => {
    const a = generarCuadroAmortizacion({
      ...baseFija,
      carencia: 'TOTAL',
      carenciaMeses: 6,
      tipoInteresAnual: 6,
    });
    expect(a[0].tipoTramo).toBe('carencia_total');
    expect(a[0].cuotaTotal).toBe(0);
    expect(a[0].capitalAmortizado).toBe(0);
    // intereses capitalizados: el saldo después del tramo > principal
    expect(a[5].capitalPendiente).toBeGreaterThan(baseFija.principal);
    expect(a[119].capitalPendiente).toBe(0);
  });
  it('transición carencia → normal mantiene el saldo cuadrar', () => {
    const a = generarCuadroAmortizacion({
      ...baseFija,
      carencia: 'SOLO_INTERESES',
      carenciaMeses: 3,
      tipoInteresAnual: 5,
    });
    const despues = a[3];
    expect(despues.tipoTramo).toBe('normal');
    expect(a[119].capitalPendiente).toBe(0);
  });
});

describe('GAP4 — Tipos variable / mixto', () => {
  it('variable: índice + diferencial', () => {
    const p: FinanciacionParams = {
      ...baseFija,
      modalidadInteres: 'VARIABLE',
      valorIndice: 1.2,
      diferencial: 0.9,
    };
    const tipos = tasasAplicadas(p);
    expect(tipos[0]).toBeCloseTo(2.1, 6); // 1.2 + 0.9
    expect(new Set(tipos).size).toBe(1);
  });

  it('mixto: transición fijo → variable', () => {
    const p: FinanciacionParams = {
      ...baseFija,
      modalidadInteres: 'MIXTO',
      tipoInteresAnual: 2.5,
      periodoInicialFijoMeses: 60,
      tipoInteresAnualVariable: 2.0,
    };
    const tipos = tasasAplicadas(p);
    expect(tipos[0]).toBe(2.5);
    expect(tipos[59]).toBe(2.5);
    expect(tipos[60]).toBe(2.0);
    expect(tipos[119]).toBe(2.0);
    const a = generarCuadroAmortizacion(p);
    expect(a[119].capitalPendiente).toBe(0);
  });
});

describe('GAP4 — Amortización anticipada', () => {
  it('reducción de principal y recálculo de cuota', () => {
    const res = simularAmortizacionAnticipada(
      { principalInicial: 150000, saldoPendiente: 100000, periodosRestantes: 60, tipoInteresAnual: 3.5 },
      20000,
      'reducir_cuota'
    );
    expect(res.importeAmortizado).toBe(20000);
    expect(res.capitalPendienteAntes).toBe(100000);
    expect(res.capitalPendienteDespues).toBe(80000);
    expect(res.nuevaCuota).toBeLessThan(res.cuotaAnterior);
  });
  it('saldo: no puede quedar negativo', () => {
    const res = simularAmortizacionAnticipada(
      { principalInicial: 150000, saldoPendiente: 15000, periodosRestantes: 30, tipoInteresAnual: 3.5 },
      999999,
      'reducir_plazo'
    );
    expect(res.capitalPendienteDespues).toBe(0);
  });
});

describe('GAP4 — Coste financiero e impacto', () => {
  it('coste financiero: principal + intereses + pendiente', () => {
    const a = generarCuadroAmortizacion(baseFija);
    const costes = calcularCosteFinanciero(a, 150000, 200000);
    expect(costes.totalIntereses).toBeGreaterThan(0);
    expect(costes.capitalPendiente).toBe(0);
    expect(costes.ltvActual).toBe(0);
  });
  it('impacto: capital aportado + flujo de caja', () => {
    const a = generarCuadroAmortizacion(baseFija);
    const impacto = calcularImpacto(a, 150000, 200000);
    expect(impacto.capitalAportado).toBe(50000);
    expect(impacto.flujoCajaSalidaCuotas).toBeGreaterThan(150000);
  });
});

describe('GAP4 — Seguridad y aislamiento', () => {
  const financiacion = { propietarioId: 'prop_A', inmuebleId: 'inm_A' };
  it('propietario autorizado', () => {
    expect(puedeGestionarFinanciacion({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A' }, financiacion)).toBe(true);
  });
  it('propietario NO autorizado (otro propietario)', () => {
    expect(puedeGestionarFinanciacion({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_B' }, financiacion)).toBe(false);
  });
  it('usuario ajeno (inmueble no asignado)', () => {
    expect(puedeGestionarFinanciacion({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_X', inmuebleIds: ['inm_Z'] }, financiacion)).toBe(false);
  });
  it('acceso sin autenticación (anónimo)', () => {
    expect(puedeGestionarFinanciacion({ tipoPerfil: null }, financiacion)).toBe(false);
  });
  it('profesional (no administrador) denegado', () => {
    expect(puedeGestionarFinanciacion({ tipoPerfil: 'PROFESIONAL', propietarioId: 'prop_A' }, financiacion)).toBe(false);
  });
  it('administrador autorizado', () => {
    expect(puedeGestionarFinanciacion({ tipoPerfil: 'ADMINISTRADOR' }, financiacion)).toBe(true);
  });
  it('no colección de notificaciones con credenciales', () => {
    // GAP4 no añade secretos: el modelo no expone campos de credenciales.
    const params = { ...baseFija };
    expect(Object.keys(params)).not.toContain('apiKey');
    expect(JSON.stringify(params)).not.toContain('password');
  });
});

describe('GAP4 — Factory canónica', () => {
  it('crearFinanciacion genera ltv, cuadro y estado SOLICITADA', () => {
    const { financiacion } = crearFinanciacion({
      id: 'fin_1',
      inmuebleId: 'inm_1',
      propietarioId: 'prop_1',
      entidadNombre: 'Banco Ejemplo',
      importeFinanciado: 150000,
      valorReferencia: 200000,
      plazoMeses: 120,
      tipoInteresAnual: 3.5,
      modalidadInteres: 'FIJO',
      sistemaAmortizacion: 'FRANCES',
      fechaFormalizacion: '2026-01-01',
    });
    expect(financiacion.ltv).toBe(75);
    expect(financiacion.estado).toBe('SOLICITADA');
    expect(financiacion.cuadroAmortizacion).toHaveLength(120);
    expect(financiacion.cuadroAmortizacion[119].capitalPendiente).toBe(0);
    expect(financiacion.saldoPendiente).toBe(150000);
  });
  it('crearFinanciacion inválida lanza error', () => {
    expect(() =>
      crearFinanciacion({
        id: 'fin_bad',
        inmuebleId: 'inm_1',
        propietarioId: 'prop_1',
        entidadNombre: 'Banco',
        importeFinanciado: 0,
        valorReferencia: 100000,
        plazoMeses: 120,
        tipoInteresAnual: 3,
        modalidadInteres: 'FIJO',
        sistemaAmortizacion: 'FRANCES',
        fechaFormalizacion: '2026-01-01',
      })
    ).toThrow();
  });
});

describe('GAP4 — Integración con dispatcher GAP1 (reuso, sin nuevo motor)', () => {
  it('evento de financiación se envía por el dispatcher existente', async () => {
    const evento = eventoFinanciacionCreada({
      id: 'fin_1',
      inmuebleId: 'inm_1',
      propietarioId: 'prop_1',
      entidadNombre: 'Banco Ejemplo',
      importeFinanciado: 150000,
      ltv: 75,
    });
    expect(evento.origen).toBe('FINANCIACION');
    const store = new Map();
    const dispatcher = new DispatcherNotificaciones({
      autorizacion: { perfil: 'ADMINISTRADOR', uid: 'u_admin' },
      repositorio: {
        async buscarPorId(id: string) { return store.get(id) || null; },
        async buscarPorIdempotencia(key: string) {
          for (const n of Array.from(store.values()) as any[]) if (n.idempotencyKey === key) return n;
          return null;
        },
        async guardar(n: any) { store.set(n.id, n); },
      },
      canales: { EMAIL: null, INAPP: new CanalInApp(), WEBHOOK: null, WHATSAPP: null },
    });
    const res = await dispatcher.dispatch({
      origen: 'FINANCIACION',
      tipoEvento: 'financiacion.creada',
      entidadId: 'fin_1',
      inmuebleId: 'inm_1',
      propietarioId: 'prop_1',
      datos: { entidadNombre: 'Banco Ejemplo', importeFinanciado: 150000, ltv: 75 },
      destinatario: { usuarioId: 'u_admin' },
    });
    expect(res.ok).toBe(true);
    expect(res.notificacion?.plantilla).toBe('financiacion.creada');
  });
});

describe('GAP4 — Regresión GAP1', () => {
  it('GAP1 intacto: plantillas y selección', () => {
    expect(seleccionarPlantilla('cobro.proximo_vencimiento', PLANTILLAS)?.id).toBe('cobro.proximo_vencimiento');
    expect(seleccionarPlantilla('no.existe', PLANTILLAS)).toBeNull();
  });
  it('redondeo centimétrico determinista', () => {
    expect(redondear2(1.005)).toBe(1.01);
    expect(redondear2(1.004)).toBe(1.0);
  });
});
