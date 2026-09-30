/**
 * BLOQUE 3 · 3.2 y 3.6
 * =====================
 * 3.2 · La ficha del inmueble ya no muestra " €/mes" ni "0 m²" cuando hay
 *       dato real: se leen los campos correctos y, si faltan, se muestra "—".
 * 3.6 · Vender o dar de baja RETIRA la publicación activa SIN BORRARLA.
 */

import { describe, expect, it } from 'vitest';
import {
  formatearRentaMensual,
  formatearSuperficie,
  rentaMensualDe,
  superficieDe,
  tieneDatosEconomicos,
} from '../src/utils/fichaInmueblePresentacion';
import {
  contarRetiradas,
  retirarPublicacionesTrasBaja,
} from '../src/utils/publicacionCicloPatrimonial';
import {
  etiquetaEstadoExplotacion,
  etiquetaEstadoPatrimonial,
  formatearPorcentaje,
  resumenPorcentaje,
} from '../src/utils/titularidadesPresentacion';
import type { Inmueble } from '../src/types';

describe('3.2 · Renta y superficie de la ficha (adiós a " €/mes" y "0 m²")', () => {
  it('lee `precio` cuando existe', () => {
    expect(rentaMensualDe({ precio: 850 } as Inmueble)).toBe(850);
    expect(formatearRentaMensual({ precio: 850 } as Inmueble)).toBe('850 €/mes');
  });

  it('cae a `rentaMensual` si `precio` no está', () => {
    expect(rentaMensualDe({ rentaMensual: 1200 } as unknown as Inmueble)).toBe(1200);
  });

  it('NUNCA muestra "undefined €/mes": sin dato muestra "—"', () => {
    // El bug original leía `precioRentaMensual`, que no existe en el modelo.
    expect(formatearRentaMensual({ precioRentaMensual: 900 } as unknown as Inmueble)).toBe('—');
    expect(formatearRentaMensual({} as Inmueble)).toBe('—');
    expect(formatearRentaMensual(null)).toBe('—');
  });

  it('NUNCA muestra "0 m²": sin dato muestra "—"', () => {
    // El bug original leía `superficieConstruida`, que no existe en el modelo.
    expect(formatearSuperficie({ superficieConstruida: 90 } as unknown as Inmueble)).toBe('—');
    expect(formatearSuperficie({} as Inmueble)).toBe('—');
  });

  it('lee la superficie real de `superficie`', () => {
    expect(superficieDe({ superficie: 74 } as Inmueble)).toBe(74);
    expect(formatearSuperficie({ superficie: 74 } as Inmueble)).toBe('74 m²');
  });

  it('cae al dato catastral cuando no hay `superficie`', () => {
    const inm = {
      datosCatastrales: { superficieCatastralConstruida: 88 },
    } as unknown as Inmueble;
    expect(superficieDe(inm)).toBe(88);
    expect(formatearSuperficie(inm)).toBe('88 m²');
  });

  it('un 0 explícito NO se pinta como dato: se trata como ausente', () => {
    expect(formatearSuperficie({ superficie: 0 } as Inmueble)).toBe('—');
    expect(formatearRentaMensual({ precio: 0 } as Inmueble)).toBe('—');
  });

  it('acepta números en texto (importaciones) y formatea con separador de miles', () => {
    expect(rentaMensualDe({ precio: '1250' } as unknown as Inmueble)).toBe(1250);
    // El separador de miles depende de la ICU de Node: se acepta '.' o ','.
    expect(formatearRentaMensual({ precio: 1250 } as Inmueble)).toMatch(/^1[.,]?250 €\/mes$/);
  });

  it('tieneDatosEconomicos distingue "hay dato" de "no hay dato"', () => {
    expect(tieneDatosEconomicos({ precio: 850 } as Inmueble)).toBe(true);
    expect(tieneDatosEconomicos({} as Inmueble)).toBe(false);
  });
});

describe('3.6 · La venta/baja retira la publicación SIN borrarla', () => {
  const publicaciones = [
    { inmuebleId: 'inm-1', portal: 'IDEALISTA', estado: 'PUBLICADO' },
    { inmuebleId: 'inm-1', portal: 'FOTOCASA', estado: 'ACTUALIZADO' },
    { inmuebleId: 'inm-1', portal: 'HABITACLIA', estado: 'DESPUBLICADO' },
    { inmuebleId: 'inm-2', portal: 'IDEALISTA', estado: 'PUBLICADO' },
  ];

  it('sólo retira las publicaciones activas DEL inmueble vendido', () => {
    const r = retirarPublicacionesTrasBaja(publicaciones, 'inm-1');
    expect(contarRetiradas(r)).toBe(2);
    expect(r[0].retirada).toBe(true);
    expect(r[2].retirada).toBe(false);
    expect(r[3].retirada).toBe(false);
  });

  it('RETIRAR ≠ BORRAR: el registro sigue existiendo y pasa a DESPUBLICADO', () => {
    const r = retirarPublicacionesTrasBaja(publicaciones, 'inm-1');
    expect(r).toHaveLength(publicaciones.length); // no se borra ninguna
    expect(r[0].registro.estado).toBe('DESPUBLICADO');
    expect(r[0].registro.portal).toBe('IDEALISTA'); // se conserva la identidad
  });

  it('deja trazabilidad: motivo y fecha de la retirada', () => {
    const r = retirarPublicacionesTrasBaja(publicaciones, 'inm-1', 'Venta');
    expect(r[0].registro.motivoRetirada).toBe('Venta');
    expect(typeof r[0].registro.fechaRetirada).toBe('string');
    expect(r[2].registro.motivoRetirada).toBeUndefined();
  });

  it('no inventa retiradas: las que ya estaban DESPUBLICADO se respetan', () => {
    const r = retirarPublicacionesTrasBaja(publicaciones, 'inm-1');
    expect(r[2].registro.estado).toBe('DESPUBLICADO');
    expect(r[2].detalle).toContain('no requiere retirada');
  });

  it('identifica el inmueble por `externalId` si no trae `inmuebleId`', () => {
    const r = retirarPublicacionesTrasBaja(
      [{ externalId: 'inm-9__IDEALISTA', estado: 'PUBLICADO' }],
      'inm-9'
    );
    expect(contarRetiradas(r)).toBe(1);
  });

  it('no toca nada si el inmueble no tiene publicaciones', () => {
    const r = retirarPublicacionesTrasBaja(publicaciones, 'inm-99');
    expect(contarRetiradas(r)).toBe(0);
  });
});

describe('Presentación: porcentajes y ejes (Bloque 2 · 2.3 / 3.1)', () => {
  it('un porcentaje nulo se muestra como PENDIENTE, nunca como 0 ni 50', () => {
    expect(formatearPorcentaje(null)).toBe('Pendiente');
    expect(formatearPorcentaje(undefined)).toBe('Pendiente');
    expect(resumenPorcentaje(null)).toBe('Pendiente');
  });

  it('un porcentaje real se muestra tal cual', () => {
    expect(formatearPorcentaje(30)).toBe('30 %');
    expect(formatearPorcentaje(33.33)).toMatch(/^33[.,]33 %$/);
  });

  it('etiquetas legibles de los dos ejes', () => {
    expect(etiquetaEstadoPatrimonial('VENDIDO')).toBe('Vendido');
    expect(etiquetaEstadoPatrimonial(undefined)).toBe('Activo'); // heredado
    expect(etiquetaEstadoExplotacion('ALQUILADO')).toBe('Alquilado');
    expect(etiquetaEstadoExplotacion(undefined)).toBe('—');
  });
});
