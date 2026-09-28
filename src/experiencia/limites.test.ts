import { describe, expect, it } from 'vitest';
import { crearLimitadorVentana } from './limites';

describe('BLOQUE 9 · límite de consultas IA', () => {
  it('limita por clave y permite reintentar tras expirar la ventana', () => {
    let ahora = 1000;
    const limite = crearLimitadorVentana(2, 100, () => ahora);
    expect(limite.consumir('ip-a').permitido).toBe(true);
    expect(limite.consumir('ip-a').permitido).toBe(true);
    expect(limite.consumir('ip-a')).toMatchObject({ permitido: false, reintentarEnMs: 100 });
    expect(limite.consumir('ip-b').permitido).toBe(true);
    ahora += 101;
    expect(limite.consumir('ip-a').permitido).toBe(true);
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => crearLimitadorVentana(0, 100)).toThrow('LÍMITE_INVÁLIDO');
    expect(() => crearLimitadorVentana(1, 0)).toThrow('LÍMITE_INVÁLIDO');
  });
});
