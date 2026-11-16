/**
 * AG-10 · Transacción del contrato: concurrencia real sobre `saveContratoFirestore`.
 *
 * Importa la función REAL de `src/lib/firebase.ts` y la ejecuta contra un
 * Firestore en memoria con control de versión optimista (ver `bancoFirestore.ts`).
 *
 * Qué se demuestra aquí, y por qué no basta con lo que ya había:
 *   · el `setDoc merge` anterior reenviaba `registroCobros` COMPLETO, así que un
 *     pago registrado en otro cliente se perdía aunque la transacción existiera:
 *     la lectura y el cálculo eran de una instantánea vieja;
 *   · ahora cada flujo declara QUÉ periodos toca y la fusión se decide contra el
 *     estado persistido leído dentro de la transacción.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { almacen, commitsDe, leer, reiniciarAlmacen } from './bancoFirestore';

import type { CobroPeriodo, ContratoFormalizacion } from '../../src/types';
import {
  materializarPeriodosCobroFirestore,
  registrarCambioPeriodoCobroFirestore,
  saveContratoFirestore,
} from '../../src/lib/firebase';
import { escriturasPorDiferencia } from '../../src/lib/contratoTransaccion';

const RUTA = 'contratos_formalizacion/ct-ag10';

function periodo(mes: number, extra: Partial<CobroPeriodo> = {}): CobroPeriodo {
  const mm = String(mes).padStart(2, '0');
  return {
    id: `cobro_ct-ag10_2026_${mm}`,
    inmuebleId: 'inm-ag10',
    contratoId: 'ct-ag10',
    inquilinoId: 'cand-ag10',
    propietarioId: 'prop-ag10',
    mes,
    anio: 2026,
    periodoMesAnio: `2026-${mm}`,
    nombreMes: `Mes ${mes} 2026`,
    importePrevisto: 900,
    importeRecibido: 0,
    fechaVencimiento: `2026-${mm}-05`,
    estado: 'PENDIENTE',
    historialCambios: [],
    ...extra,
  };
}

function contrato(extra: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion {
  return {
    id: 'ct-ag10',
    candidatoId: 'cand-ag10',
    inmuebleId: 'inm-ag10',
    propietarioId: 'prop-ag10',
    inmuebleNombre: 'Inmueble AG-10',
    inmuebleDireccion: 'Calle Sintética 1',
    inmuebleCiudad: 'Alicante',
    propietarioNombre: 'Titular AG-10',
    propietarioDni: '00000000T',
    propietarioDireccion: 'Calle Sintética 1',
    propietarioTelefono: '600000000',
    propietarioEmail: 'titular@example.invalid',
    propietarioIban: 'ES0000000000000000000000',
    candidatoNombre: 'Inquilino AG-10',
    candidatoDni: '11111111H',
    candidatoTelefono: '611111111',
    candidatoEmail: 'inquilino@example.invalid',
    rentaMensual: 900,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 900,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: '2026-01-01',
    duracionAnios: 1,
    diaLimitePagoMes: 5,
    permitirMascotas: false,
    permitirSubarriendo: false,
    incluyeMueblesInventario: false,
    gastosComunidadCargo: 'arrendador',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: false,
    clausulasPersonalizadas: [],
    estado: 'FORMALIZADO_ACTIVO',
    evaluacionAsegurabilidad: {} as ContratoFormalizacion['evaluacionAsegurabilidad'],
    actaEntregaLlaves: {} as ContratoFormalizacion['actaEntregaLlaves'],
    firmaArrendador: { firmado: true, fecha: '2026-01-02' },
    firmaArrendatario: { firmado: true, fecha: '2026-01-02' },
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaActualizacion: '2026-01-01T00:00:00.000Z',
    historial: [],
    registroCobros: [periodo(1), periodo(2)],
    ...extra,
  };
}

const pagoDe = (p: CobroPeriodo, importe = 900, fechaPago = '2026-02-06') => ({
  ...p,
  importeRecibido: importe,
  fechaPago,
  estado: 'RECIBIDO' as const,
  ultimaModificacion: '2026-02-06T10:00:00.000Z',
  historialCambios: [
    {
      id: `hist_pago_${p.periodoMesAnio}`,
      fecha: '2026-02-06T10:00:00.000Z',
      accion: 'Registro de pago recibido',
      estadoAnterior: 'PENDIENTE' as const,
      estadoNuevo: 'RECIBIDO' as const,
      importeAnterior: 0,
      importeNuevo: importe,
    },
  ],
});

beforeEach(() => {
  reiniciarAlmacen([[RUTA, contrato() as unknown as Record<string, unknown>]]);
});

describe('AG-10 · la escritura del contrato es transaccional (no un setDoc a ciegas)', () => {
  it('no usa setDoc fuera de transacción para escribir el contrato', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    await saveContratoFirestore({ ...base, notasPrivadas: 'nota AG-10' }, { base, modoCobros: 'CONSERVAR' });

    expect(almacen.escriturasFueraDeTransaccion).toEqual([]);
    expect(almacen.intentosTransaccion).toBeGreaterThan(0);
    expect((leer(RUTA) as { notasPrivadas?: string }).notasPrivadas).toBe('nota AG-10');
    expect(commitsDe(RUTA)).toBe(1);
  });

  it('lee el estado persistido ANTES de escribir y conserva los periodos que no toca', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    // El cliente tiene una copia SIN el pago de febrero (llegó tarde).
    const cliente = { ...base, registroCobros: [periodo(1), periodo(2)] };
    // Otro cliente registró el pago de febrero mientras tanto.
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [periodo(1), pagoDe(periodo(2))],
    });

    // La operación sólo escribe el periodo de enero.
    const enero = { ...periodo(1), estado: 'RECLAMADO' as const, motivoIncidencia: 'Reclamado por el titular' };
    await registrarCambioPeriodoCobroFirestore(cliente, { despues: enero, antes: periodo(1) });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 2)).toMatchObject({
      estado: 'RECIBIDO',
      importeRecibido: 900,
      fechaPago: '2026-02-06',
    });
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({ estado: 'RECLAMADO' });
  });

  it('no escribe si el contenido ya está persistido (idempotencia de la transacción)', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    const editado = { ...base, notasPrivadas: 'nota idempotente' };
    const primero = await saveContratoFirestore(editado, { base, modoCobros: 'CONSERVAR' });
    const segundo = await saveContratoFirestore(editado, { base, modoCobros: 'CONSERVAR' });

    expect(primero.escrito).toBe(true);
    expect(segundo.escrito).toBe(false);
    expect(segundo.contrato).toBeNull();
    expect(commitsDe(RUTA)).toBe(1);
  });

  it('mantiene la integridad: no permite reasignar inmueble ni habitación', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    await expect(saveContratoFirestore(
      { ...base, inmuebleId: 'inm-otro' },
      { base, modoCobros: 'CONSERVAR' },
    )).rejects.toThrow('No se puede reasignar inmuebleId');
    expect(commitsDe(RUTA)).toBe(0);
  });
});

describe('AG-10 · dos modificaciones concurrentes del mismo contrato', () => {
  it('la segunda transacción se reejecuta y ambas intenciones quedan persistidas', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;

    // Cliente A: pago de enero. Cliente B: pago de febrero (ambos desde la misma base).
    const pagoEnero = pagoDe(periodo(1), 900, '2026-01-06');
    const pagoFebrero = pagoDe(periodo(2), 450, '2026-02-10');

    // B se escribe primero...
    await registrarCambioPeriodoCobroFirestore(base, { despues: pagoFebrero, antes: periodo(2) });

    // ...y A commitea DESPUÉS, simulando que su lectura era anterior al pago de B.
    almacen.interceptor = undefined;
    await registrarCambioPeriodoCobroFirestore(
      { ...base, registroCobros: [periodo(1), periodo(2)] },
      { despues: pagoEnero, antes: periodo(1) },
    );

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({ estado: 'RECIBIDO', importeRecibido: 900 });
    expect(guardado.registroCobros?.find((p) => p.mes === 2)).toMatchObject({ estado: 'RECIBIDO', importeRecibido: 450 });
  });

  it('una escritura cuya lectura quedó obsoleta NO se confirma: se reejecuta sobre el estado vivo', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    let actuado = false;

    // El «otro cliente» modifica el documento justo entre la lectura y el commit.
    almacen.interceptor = (docId) => {
      if (actuado || docId !== 'ct-ag10') return;
      actuado = true;
      almacen.docs.set(RUTA, {
        ...(leer(RUTA) as Record<string, unknown>),
        registroCobros: [pagoDe(periodo(1)), periodo(2)],
      });
    };

    const resultado = await registrarCambioPeriodoCobroFirestore(base, {
      despues: pagoDe(periodo(2), 300, '2026-02-11'),
      antes: periodo(2),
    });

    // Hubo al menos una reejecución por conflicto de versión...
    expect(almacen.intentosTransaccion).toBeGreaterThan(1);
    expect(resultado.escrito).toBe(true);
    // ...y el pago de enero que puso el otro cliente sigue ahí.
    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({ estado: 'RECIBIDO', importeRecibido: 900 });
    expect(guardado.registroCobros?.find((p) => p.mes === 2)).toMatchObject({ importeRecibido: 300 });
  });

  it('el contrato devuelto a la UI incorpora lo persistido, no la instantánea vieja', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [pagoDe(periodo(1)), pagoDe(periodo(2))],
    });

    const resultado = await registrarCambioPeriodoCobroFirestore(base, {
      despues: { ...periodo(2), estado: 'VERIFICADO', importeRecibido: 900, fechaPago: '2026-02-06' },
      antes: periodo(2),
    });

    expect(resultado.contrato?.registroCobros?.find((p) => p.mes === 1)?.estado).toBe('RECIBIDO');
    expect(resultado.contrato?.registroCobros?.find((p) => p.mes === 2)?.estado).toBe('VERIFICADO');
  });
});

describe('AG-10 · pago registrado mientras se materializan los periodos', () => {
  it('la materialización automática NO pisa un pago más reciente', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    // El efecto calculó los periodos desde una lectura sin pagos: enero ya
    // vencido ⇒ RETRASADO, más el periodo nuevo de marzo.
    const calculado = {
      ...base,
      registroCobros: [{ ...periodo(1), estado: 'RETRASADO' as const }, periodo(2), periodo(3)],
    };

    // El inquilino/titular registró el pago de enero mientras se calculaba.
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [pagoDe(periodo(1)), periodo(2)],
    });

    const resultado = await materializarPeriodosCobroFirestore(calculado, calculado.registroCobros!, { base });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({
      estado: 'RECIBIDO',
      importeRecibido: 900,
      fechaPago: '2026-02-06',
    });
    // El periodo nuevo sí se materializa.
    expect(guardado.registroCobros?.some((p) => p.mes === 3)).toBe(true);
    expect(resultado.periodosDescartados).toContain('cobro_ct-ag10_2026_01');
  });

  it('si el periodo sólo pasó a RETRASADO, el pago persistido manda (no se degrada el estado)', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [pagoDe(periodo(1)), periodo(2)],
    });

    // El efecto calculó «enero vencido ⇒ RETRASADO» desde su lectura.
    const calculado = {
      ...base,
      registroCobros: [{ ...periodo(1), estado: 'RETRASADO' as const }, periodo(2)],
    };
    await materializarPeriodosCobroFirestore(calculado, calculado.registroCobros!, { base });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)?.estado).toBe('RECIBIDO');
  });

  it('un pago registrado y la materialización simultáneos terminan con el pago y el periodo nuevo', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    const calculado = { ...base, registroCobros: [periodo(1), periodo(2), periodo(3)] };

    let actuado = false;
    almacen.interceptor = (docId) => {
      if (actuado || docId !== 'ct-ag10') return;
      actuado = true;
      almacen.docs.set(RUTA, {
        ...(leer(RUTA) as Record<string, unknown>),
        registroCobros: [pagoDe(periodo(1), 700, '2026-01-07'), periodo(2)],
      });
    };

    await materializarPeriodosCobroFirestore(calculado, calculado.registroCobros!, { base });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({ estado: 'RECIBIDO', importeRecibido: 700 });
    expect(guardado.registroCobros?.some((p) => p.mes === 3)).toBe(true);
    expect(almacen.intentosTransaccion).toBeGreaterThan(1);
  });
});

describe('AG-10 · conflicto de transacción y reintento sin duplicidades', () => {
  it('un conflicto de dominio aborta, reintenta y no deja escrituras a medias', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    let fallos = 1;
    const original = nuevoPagoDe(base, 1, 650);

    // Primer commit falla con `unavailable` (red): el bucle debe reintentar.
    almacen.fallarCommit = (docId) => {
      if (docId === 'ct-ag10' && fallos > 0) {
        fallos -= 1;
        const err = new Error('unavailable');
        (err as { code?: string }).code = 'unavailable';
        return err;
      }
      return undefined;
    };

    const resultado = await registrarCambioPeriodoCobroFirestore(base, original);
    expect(resultado.escrito).toBe(true);
    expect(almacen.intentosTransaccion).toBeGreaterThan(1);
    expect(commitsDe(RUTA)).toBe(1); // una sola escritura efectiva
    expect((leer(RUTA) as unknown as ContratoFormalizacion).registroCobros?.find((p) => p.mes === 1)?.importeRecibido).toBe(650);
  });

  it('reintentar el mismo cambio no duplica periodos ni historial', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    const cambio = { despues: pagoDe(periodo(1)), antes: periodo(1) };

    const primero = await registrarCambioPeriodoCobroFirestore(base, cambio);
    const segundo = await registrarCambioPeriodoCobroFirestore(base, cambio);
    const tercero = await registrarCambioPeriodoCobroFirestore(base, cambio);

    expect(primero.escrito).toBe(true);
    expect(segundo.escrito).toBe(false);
    expect(tercero.escrito).toBe(false);
    expect(commitsDe(RUTA)).toBe(1);
    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros).toHaveLength(2);
    expect(guardado.registroCobros?.[0].historialCambios).toHaveLength(1);
  });

  it('un conflicto real de escritura del usuario reaplica SU intención: no pierde el historial ajeno', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    // El otro cliente puso el mismo periodo con un justificante.
    const conJustificante = {
      ...pagoDe(periodo(1), 900),
      justificante: {
        id: 'just-ag10',
        nombreArchivo: 'transferencia.pdf',
        fechaSubida: '2026-02-06T10:00:00.000Z',
        url: 'https://almacen.example.invalid/just-ag10',
      },
    };
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [conJustificante, periodo(2)],
    });

    const resultado = await registrarCambioPeriodoCobroFirestore(base, {
      despues: { ...periodo(1), estado: 'VERIFICADO', importeRecibido: 900, fechaPago: '2026-02-06' },
      antes: periodo(1),
    });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    const enero = guardado.registroCobros?.find((p) => p.mes === 1);
    expect(enero?.estado).toBe('VERIFICADO');          // intención del usuario
    expect(enero?.justificante?.id).toBe('just-ag10'); // dato del otro cliente
    expect(resultado.periodosReaplicados).toContain('cobro_ct-ag10_2026_01');
  });

  it('una denegación de permisos NO se reintenta (reintentar no la arregla)', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    almacen.fallarCommit = () => {
      const err = new Error('permission-denied');
      (err as { code?: string }).code = 'permission-denied';
      return err;
    };

    await expect(registrarCambioPeriodoCobroFirestore(base, { despues: pagoDe(periodo(1)), antes: periodo(1) }))
      .rejects.toThrow('permission-denied');
    expect(commitsDe(RUTA)).toBe(0);
  });
});

function nuevoPagoDe(base: ContratoFormalizacion, mes: number, importe: number) {
  const previo = base.registroCobros?.find((p) => p.mes === mes);
  return { antes: previo, despues: pagoDe(previo!, importe) };
}

describe('AG-10 · integridad de los cinco flujos consumidores', () => {
  it('ALTA: crea los periodos y nunca pisa la historia existente', async () => {
    const nuevo = contrato({
      id: 'ct-alta',
      estado: 'FORMALIZADO_ACTIVO',
      registroCobros: [periodo(1), periodo(2), periodo(3)],
    });

    const resultado = await saveContratoFirestore(nuevo, { existe: false, modoCobros: 'CREAR_SOLO_NUEVOS' });
    expect(resultado.escrito).toBe(true);
    const guardado = leer('contratos_formalizacion/ct-alta') as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros).toHaveLength(3);
    expect(guardado.id).toBe('ct-alta');

    // Reintento del alta (sin pretender crear de nuevo): no duplica ni reescribe.
    const reintento = await saveContratoFirestore(nuevo, { modoCobros: 'CREAR_SOLO_NUEVOS' });
    expect(reintento.escrito).toBe(false);
    expect(commitsDe('contratos_formalizacion/ct-alta')).toBe(1);
  });

  it('ALTA sobre un contrato existente con pagos: conserva los pagos', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [pagoDe(periodo(1)), periodo(2)],
    });
    // Un alta con el calendario «en blanco» no puede borrar el pago.
    const alta = contrato({ id: 'ct-ag10', registroCobros: [] });

    await expect(saveContratoFirestore(alta, { existe: false, modoCobros: 'CREAR_SOLO_NUEVOS' }))
      .rejects.toThrow('El contrato ya existe');

    await saveContratoFirestore(alta, { modoCobros: 'CREAR_SOLO_NUEVOS' });
    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({ estado: 'RECIBIDO' });
    expect(base.registroCobros).toHaveLength(2);
  });

  it('EDICIÓN: guarda la ficha completa pero no reescribe pagos ajenos', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [pagoDe(periodo(1)), periodo(2)],
    });

    // El formulario cambia la renta y reenvía SU calendario (sin el pago).
    const editado: ContratoFormalizacion = {
      ...base,
      rentaMensual: 950,
      registroCobros: [
        { ...periodo(1), importePrevisto: 950 },
        { ...periodo(2), importePrevisto: 950 },
      ],
    };
    const periodos = escriturasPorDiferencia(base.registroCobros, editado.registroCobros, 'reintentar');
    const resultado = await saveContratoFirestore(editado, { base, modoCobros: 'FUSIONAR', periodos });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.rentaMensual).toBe(950);
    // El pago de enero sobrevive: sólo se reaplicó el importe previsto.
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({
      importePrevisto: 950,
      importeRecibido: 900,
      estado: 'RECIBIDO',
    });
    expect(resultado.periodosReaplicados).toContain('cobro_ct-ag10_2026_01');
  });

  it('IMPORTACIÓN: anexar un cobro no borra los pagos ya registrados', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [pagoDe(periodo(1)), periodo(2)],
    });
    const cobroImportado = periodo(4, { estado: 'RECIBIDO', importeRecibido: 900, fechaPago: '2026-04-06' });
    // El importador leyó el contrato SIN el pago de enero.
    const lecturaVieja = { ...base, registroCobros: [periodo(1), periodo(2)] };

    await registrarCambioPeriodoCobroFirestore(
      { ...lecturaVieja, registroCobros: [...(lecturaVieja.registroCobros ?? []), cobroImportado] },
      { despues: cobroImportado },
    );

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({ estado: 'RECIBIDO', importeRecibido: 900 });
    expect(guardado.registroCobros?.some((p) => p.mes === 4)).toBe(true);
    expect(guardado.registroCobros).toHaveLength(3);
  });

  it('CIERRE: el contrato se finaliza sin tocar el calendario cobrado', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    const conPagos = [pagoDe(periodo(1)), pagoDe(periodo(2))];
    almacen.docs.set(RUTA, { ...(leer(RUTA) as Record<string, unknown>), registroCobros: conPagos });

    const cerrado: ContratoFormalizacion = {
      ...base,
      estado: 'FINALIZADO',
      esVigente: false,
      fechaFinContrato: '2026-02-28',
      registroCobros: [periodo(1), periodo(2)], // instantánea vieja, sin pagos
    };
    await saveContratoFirestore(cerrado, { base, modoCobros: 'CONSERVAR' });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.estado).toBe('FINALIZADO');
    expect(guardado.registroCobros).toEqual(conPagos);
  });

  it('MATERIALIZACIÓN: sólo añade los periodos que faltan y no pisa estados manuales', async () => {
    const base = leer(RUTA) as unknown as ContratoFormalizacion;
    almacen.docs.set(RUTA, {
      ...(leer(RUTA) as Record<string, unknown>),
      registroCobros: [
        { ...periodo(1), estado: 'INCIDENCIA', motivoIncidencia: 'Devuelto por el banco' },
        periodo(2),
      ],
    });
    const calculado = { ...base, registroCobros: [periodo(1), periodo(2), periodo(3)] };

    const resultado = await materializarPeriodosCobroFirestore(calculado, calculado.registroCobros!, { base });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.registroCobros?.find((p) => p.mes === 1)).toMatchObject({
      estado: 'INCIDENCIA',
      motivoIncidencia: 'Devuelto por el banco',
    });
    expect(resultado.periodosEscritos).toEqual(['cobro_ct-ag10_2026_03']);
  });

  it('protege firmas, historial e índices de capacidad frente a instantáneas viejas', async () => {
    // Estado persistido: contrato firmado y con índices del portal.
    const persistido = contrato({
      firmaArrendador: { firmado: true, fecha: '2026-01-02' },
      incidenciaIds: ['inc-1'],
      mensajeIds: ['msg-1'],
      historial: [{ id: 'h-1', fecha: '2026-01-02', autor: 'sistema', accion: 'Contrato firmado' }],
    });
    almacen.docs.set(RUTA, persistido as unknown as Record<string, unknown>);

    // El cliente tiene una copia ANTERIOR a la firma.
    const viejo: ContratoFormalizacion = {
      ...persistido,
      firmaArrendador: { firmado: false },
      incidenciaIds: [],
      mensajeIds: [],
      historial: [],
      notasPrivadas: 'actualización del gestor',
    };
    await saveContratoFirestore(viejo, { modoCobros: 'CONSERVAR', omitirCampos: [] });

    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.firmaArrendador.firmado).toBe(true);
    expect(guardado.incidenciaIds).toEqual(['inc-1']);
    expect(guardado.mensajeIds).toEqual(['msg-1']);
    expect(guardado.historial.map((h) => h.id)).toContain('h-1');
    expect(guardado.notasPrivadas).toBe('actualización del gestor');
  });

  it('un guardado del portal no reenvía los índices de capacidad (los escribe su propio update)', async () => {
    const persistido = contrato({ incidenciaIds: ['inc-1'], mensajeIds: ['msg-1'] });
    almacen.docs.set(RUTA, persistido as unknown as Record<string, unknown>);

    await saveContratoFirestore(
      { ...persistido, incidenciaIds: ['inc-1', 'inc-2'], mensajeIds: ['msg-1', 'msg-2'], notasPrivadas: 'x' },
      { modoCobros: 'CONSERVAR' },
    );

    // Por defecto los índices se omiten del payload: sólo crecen por arrayUnion.
    const guardado = leer(RUTA) as unknown as ContratoFormalizacion;
    expect(guardado.incidenciaIds).toEqual(['inc-1']);
    expect(guardado.mensajeIds).toEqual(['msg-1']);
  });
});
