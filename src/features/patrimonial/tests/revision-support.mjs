import assert from 'node:assert/strict';

export function congelarProfundo(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(congelarProfundo);
    Object.freeze(value);
  }
  return value;
}

export function sinEfectosExternos(operacion) {
  const nombres = ['localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket'];
  const originales = nombres.map((nombre) => [nombre, Object.getOwnPropertyDescriptor(globalThis, nombre)]);
  let accesos = 0;
  try {
    for (const nombre of nombres) Object.defineProperty(globalThis, nombre, {
      configurable: true,
      get() { accesos++; throw new Error(`API externa prohibida: ${nombre}`); },
    });
    const resultado = operacion();
    assert.equal(accesos, 0);
    return resultado;
  } finally {
    for (const [nombre, descriptor] of originales) {
      if (descriptor) Object.defineProperty(globalThis, nombre, descriptor);
      else delete globalThis[nombre];
    }
  }
}
