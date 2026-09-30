import { describe, it, expect } from 'vitest';
import {
  archivarEnHistorico,
  CLAVES_PERMITIDAS_EN_VENTA,
  clavesAfectadasPorVenta,
  darDeBajaPatrimonial,
  esBorrableFisicamente,
  esCarteraActiva,
  esHistorico,
  estadoExplotacionDe,
  estadoPatrimonialDe,
  filtrarCarteraActiva,
  filtrarHistorico,
  marcarTransmitido,
  marcarVendido,
  ponerEnVenta,
  reactivarPatrimonial,
  validarTransicion,
} from './cicloPatrimonialEngine';
import type { Inmueble } from '../types';

/** Inmueble ALQUILADO con TODO su histórico operativo (caso exigido por la orden). */
/** Documentos del inmueble: la ficha real los modela en `images`/`notasInternas`;
 *  aquí se usa una clave explícita para poder verificar que la venta NO los toca. */
type InmuebleConDocumentos = Inmueble & { documentos?: Array<{ id: string; nombre: string }> };

const inmAlquilado = (): InmuebleConDocumentos =>
  ({
    id: 'inm-1',
    direccion: 'Calle Uno 1',
    ciudad: 'Alicante',
    precio: 850,
    estado: 'alquilado',
    habitaciones: 3,
    banos: 2,
    superficie: 88,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop-A',
    titularesIds: ['prop-A', 'prop-B'],
    contratoActivoId: 'ct-1',
    // Documentos / fiscalidad / suministros que NO deben desaparecer.
    documentos: [{ id: 'doc-1', nombre: 'Contrato firmado.pdf' }],
    referenciaCatastral: '1234567AB1234C',
    ibanCobro: 'ES00 0000 0000 0000 0000',
    datosFiscales: { propietarioPrincipal: { nombre: 'A', nifDni: 'X', direccion: '' } },
  }) as unknown as InmuebleConDocumentos;

/* ------------------------------------------------------------------ */

describe('BLOQUE 2 · Dos ejes ortogonales (2.7)', () => {
  it('sin estadoPatrimonial → ACTIVO (ningún documento existente cambia)', () => {
    expect(estadoPatrimonialDe({ id: 'x' } as Inmueble)).toBe('ACTIVO');
  });

  it('la explotación se DERIVA del campo `estado` (no se rompe lo actual)', () => {
    expect(estadoExplotacionDe({ estado: 'alquilado' } as Inmueble)).toBe('ALQUILADO');
    expect(estadoExplotacionDe({ estado: 'disponible' } as Inmueble)).toBe('DISPONIBLE');
  });

  it('la explotación explícita manda sobre la derivada', () => {
    expect(
      estadoExplotacionDe({ estado: 'disponible', estadoExplotacion: 'EN_REFORMA' } as Inmueble)
    ).toBe('EN_REFORMA');
  });

  it('los dos ejes son independientes', () => {
    const vendido = marcarVendido(inmAlquilado());
    expect(estadoPatrimonialDe(vendido)).toBe('VENDIDO');
    // Vendido y, aun así, la explotación sigue reflejando la realidad del contrato.
    expect(estadoExplotacionDe(vendido)).toBe('ALQUILADO');
  });
});

describe('BLOQUE 2 · VENDER ≠ BORRAR (2.8)', () => {
  it('un inmueble VENDIDO sale de la cartera activa', () => {
    const vendido = marcarVendido(inmAlquilado());
    expect(esCarteraActiva(vendido)).toBe(false);
  });

  it('...pero SIGUE SIENDO ALCANZABLE desde el histórico', () => {
    const vendido = marcarVendido(inmAlquilado());
    expect(esHistorico(vendido)).toBe(true);
    expect(filtrarHistorico([inmAlquilado(), vendido]).map((i) => i.id)).toContain('inm-1');
  });

  it('EN_VENTA sigue en la cartera activa (se está comercializando)', () => {
    expect(esCarteraActiva(ponerEnVenta(inmAlquilado()))).toBe(true);
  });

  it('el filtro de cartera activa excluye el vendido y el histórico lo incluye', () => {
    const activo = inmAlquilado();
    const vendido = { ...marcarVendido(inmAlquilado()), id: 'inm-2' } as Inmueble;
    expect(filtrarCarteraActiva([activo, vendido]).map((i) => i.id)).toEqual(['inm-1']);
    expect(filtrarHistorico([activo, vendido]).map((i) => i.id)).toEqual(['inm-2']);
  });

  it('transmisión y baja tienen las mismas garantías', () => {
    expect(esHistorico(marcarTransmitido(inmAlquilado()))).toBe(true);
    expect(esHistorico(darDeBajaPatrimonial(inmAlquilado()))).toBe(true);
  });

  it('reactivar devuelve el inmueble a la cartera activa y limpia la baja', () => {
    const baja = darDeBajaPatrimonial(inmAlquilado());
    const reactivado = reactivarPatrimonial(baja);
    expect(esCarteraActiva(reactivado)).toBe(true);
    expect(reactivado.bajaPatrimonial).toBeUndefined();
  });
});

describe('BLOQUE 2 · La venta CONSERVA todo (2.9)', () => {
  it('marcar como vendido NO modifica ninguna clave salvo las del eje patrimonial', () => {
    const afectadas = clavesAfectadasPorVenta(inmAlquilado());
    expect(afectadas).toEqual([...CLAVES_PERMITIDAS_EN_VENTA].sort());
  });

  it('conserva contrato, documentos, datos catastrales, IBAN y titularidad', () => {
    const antes = inmAlquilado();
    const despues = marcarVendido(antes) as InmuebleConDocumentos;

    expect(despues.contratoActivoId).toBe('ct-1');
    expect(despues.documentos).toEqual(antes.documentos);
    expect(despues.referenciaCatastral).toBe('1234567AB1234C');
    expect(despues.ibanCobro).toBe('ES00 0000 0000 0000 0000');
    expect(despues.datosFiscales).toEqual(antes.datosFiscales);
    expect(despues.titularesIds).toEqual(['prop-A', 'prop-B']);
    expect(despues.propietarioId).toBe('prop-A');
    expect(despues.id).toBe('inm-1');
  });

  it('registra la baja con autor, motivo y la marca de conservación', () => {
    const vendido = marcarVendido(inmAlquilado(), {
      fecha: '2028-03-15T10:00:00.000Z',
      motivo: 'Venta a tercero',
      actorId: 'u-admin',
      actorNombre: 'Administración',
      publicacionRetirada: true,
    });

    expect(vendido.bajaPatrimonial?.tipo).toBe('VENTA');
    expect(vendido.bajaPatrimonial?.motivo).toBe('Venta a tercero');
    expect(vendido.bajaPatrimonial?.actorId).toBe('u-admin');
    expect(vendido.bajaPatrimonial?.estadoAnterior).toBe('ACTIVO');
    expect(vendido.bajaPatrimonial?.publicacionRetirada).toBe(true);
    expect(vendido.bajaPatrimonial?.conservaHistorico).toBe(true);
    expect(vendido.fechaVenta).toBe('2028-03-15T10:00:00.000Z');
  });

  it('no muta el objeto original', () => {
    const antes = inmAlquilado();
    marcarVendido(antes);
    expect(antes.estadoPatrimonial).toBeUndefined();
    expect(esCarteraActiva(antes)).toBe(true);
  });
});

describe('BLOQUE 2 · Transiciones y borrado físico (2.11)', () => {
  it('transiciones permitidas', () => {
    expect(validarTransicion('ACTIVO', 'EN_VENTA').permitida).toBe(true);
    expect(validarTransicion('ACTIVO', 'VENDIDO').permitida).toBe(true);
    expect(validarTransicion('EN_VENTA', 'VENDIDO').permitida).toBe(true);
    expect(validarTransicion('BAJA', 'ACTIVO').permitida).toBe(true);
  });

  it('transiciones NO permitidas (y con motivo)', () => {
    expect(validarTransicion('VENDIDO', 'ACTIVO').permitida).toBe(false);
    expect(validarTransicion('HISTORICO', 'ACTIVO').permitida).toBe(false);
    expect(validarTransicion('VENDIDO', 'EN_VENTA').permitida).toBe(false);
    expect(validarTransicion('VENDIDO', 'ACTIVO').motivo).toMatch(/No se puede pasar/);
  });

  it('una transición inválida NO se ejecuta: lanza y deja el inmueble intacto', () => {
    const vendido = marcarVendido(inmAlquilado());
    expect(() => ponerEnVenta(vendido)).toThrow();
    expect(() => marcarVendido(archivarEnHistorico(inmAlquilado()))).toThrow();
    // El estado no se ha degradado por el intento fallido.
    expect(estadoPatrimonialDe(vendido)).toBe('VENDIDO');
  });

  it('el borrado físico NO es el mecanismo normal', () => {
    const conContrato = esBorrableFisicamente(inmAlquilado());
    expect(conContrato.ok).toBe(false);
    expect(conContrato.motivo).toMatch(/Dar de baja|Marcar como vendido/);

    // Sin contrato: el freno es precisamente pertenecer al histórico.
    const vendidoSinContrato = { ...marcarVendido(inmAlquilado()), contratoActivoId: undefined };
    const historico = esBorrableFisicamente(vendidoSinContrato);
    expect(historico.ok).toBe(false);
    expect(historico.motivo).toMatch(/histórico/i);
  });

  it('sólo un inmueble sin rastro sería borrable, y aun así se recomienda la baja', () => {
    const virgen = { id: 'inm-9', estado: 'disponible' } as Inmueble;
    const r = esBorrableFisicamente(virgen);
    expect(r.ok).toBe(true);
    expect(r.motivo).toMatch(/recomendada/);
  });
});
