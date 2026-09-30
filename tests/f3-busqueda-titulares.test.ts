/**
 * F3 — LÓGICA PURA DE BÚSQUEDA DE TITULARES.
 * Mínimo 3 caracteres, máximo 10 resultados, proyección {id, nombre},
 * insensible a acentos y mayúsculas.
 */
import { describe, expect, it } from 'vitest';
import {
  LIMITE_LECTURA,
  MAXIMO_RESULTADOS,
  MINIMO_CARACTERES,
  coincide,
  normalizarTermino,
  proyectarResultados,
  seleccionarCoincidencias,
  terminoValido,
} from '../src/titularidades/busquedaTitulares';

describe('normalización', () => {
  it('minúsculas, sin acentos y sin espacios sobrantes', () => {
    expect(normalizarTermino('  ÁNGELES   Ruiz ')).toBe('angeles ruiz');
    expect(normalizarTermino('JOSE MARÍA')).toBe('jose maria');
    expect(normalizarTermino('')).toBe('');
  });

  it('el mínimo son 3 caracteres (tras normalizar)', () => {
    expect(MINIMO_CARACTERES).toBe(3);
    expect(terminoValido('an')).toBe(false);
    expect(terminoValido('   a  ')).toBe(false);
    expect(terminoValido('ana')).toBe(true);
  });
});

describe('coincidencia por prefijo de palabra', () => {
  it('encuentra por nombre y por apellido', () => {
    expect(coincide('Ana Ruiz', 'ana')).toBe(true);
    expect(coincide('Ana Ruiz', 'ruiz')).toBe(true);
    expect(coincide('Ana Ruiz', ' Ruiz ')).toBe(true);
  });

  it('no encuentra por subcadenas internas', () => {
    expect(coincide('Ana Ruiz', 'uiz')).toBe(false);
  });

  it('es insensible a acentos y mayúsculas', () => {
    expect(coincide('José María', 'jose')).toBe(true);
    expect(coincide('JOSÉ', 'josé')).toBe(true);
    expect(coincide('Ángeles', 'angeles')).toBe(true);
  });

  it('sin término no hay coincidencia', () => {
    expect(coincide('Ana', '')).toBe(false);
  });
});

describe('selección y tope', () => {
  const muchos = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, nombre: `Ana ${i}` }));

  it('nunca devuelve más de 10 resultados', () => {
    expect(MAXIMO_RESULTADOS).toBe(10);
    expect(seleccionarCoincidencias(muchos, 'ana')).toHaveLength(10);
  });

  it('con 2 caracteres no busca (evita barridos)', () => {
    expect(seleccionarCoincidencias(muchos, 'an')).toHaveLength(0);
  });

  it('ordena por nombre y elimina duplicados por id', () => {
    const seleccion = seleccionarCoincidencias(
      [
        { id: 'p2', nombre: 'Zoe' },
        { id: 'p1', nombre: 'Ana' },
        { id: 'p1', nombre: 'Ana (duplicado)' },
        { id: '', nombre: 'Sin id' },
      ],
      'ana',
    );
    expect(seleccion.map((s) => s.id)).toEqual(['p1']);
  });

  it('el límite de lectura del datastore es mayor que el de respuesta', () => {
    expect(LIMITE_LECTURA).toBeGreaterThanOrEqual(MAXIMO_RESULTADOS);
  });
});

describe('proyección: lista blanca {id, nombre}', () => {
  it('descarta NIF, email, IBAN y cualquier otro campo', () => {
    const proyectados = proyectarResultados([
      {
        id: 'p1',
        nombre: 'Ana Ruiz',
        nifCif: '12345678Z',
        email: 'ana@correo.com',
        cuentasBancarias: [{ iban: 'ES00' }],
        telefono: '600000000',
        direccion: 'Calle 1',
      } as never,
    ]);
    expect(proyectados).toEqual([{ id: 'p1', nombre: 'Ana Ruiz' }]);
    const serializado = JSON.stringify(proyectados);
    for (const sensible of ['12345678Z', 'ana@correo.com', 'ES00', '600000000', 'Calle 1']) {
      expect(serializado).not.toContain(sensible);
    }
  });

  it('devuelve copias nuevas (no referencias al documento)', () => {
    const original = { id: 'p1', nombre: 'Ana' };
    const copia = proyectarResultados([original])[0];
    copia.nombre = 'Modificado';
    expect(original.nombre).toBe('Ana');
  });
});
