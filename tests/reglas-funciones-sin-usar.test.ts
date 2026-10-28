import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La consola de Firebase RECHAZA publicar un ruleset que declara una función sin
 * usar en su ámbito («Unused function: …»), aunque los emuladores la acepten con
 * un aviso. Ese desajuste bloqueó la publicación de 2026-10-28: `sinSecretosBancarios()`
 * estaba definida en tres bloques `match` y solo se llamaba en uno.
 *
 * Este test reproduce la comprobación de la consola: cada `function` debe tener al
 * menos una llamada DENTRO de su ámbito (el `match` más interno que la contiene, o
 * el fichero completo si está en la raíz), ignorando comentarios y su propia
 * definición. Es estático: no necesita emulador ni credenciales.
 */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reglasCrudas = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');

// Los comentarios de línea de las reglas no contienen cadenas con `//`, así que
// basta con recortarlos para no contar una mención en un comentario como uso real.
const lineas = reglasCrudas
  .split('\n')
  .map((linea) => linea.replace(/\/\/.*$/, ''));

const DEFINICION = /^\s*function\s+([A-Za-z_]\w*)\s*\(/;
const LLAMADA = (nombre: string) => new RegExp(`(?<![\\w.])${nombre}\\s*\\(`);

interface Bloque {
  desde: number;
  hasta: number;
}

/** Bloques `match /…` con su cierre real, contando llaves (no por indentación). */
function bloquesMatch(): Bloque[] {
  const bloques: Bloque[] = [];
  const pila: Array<{ indice: number; profundidad: number }> = [];
  let profundidad = 0;
  lineas.forEach((linea, indice) => {
    if (/^\s*match\s+\//.test(linea)) pila.push({ indice, profundidad });
    profundidad += (linea.match(/{/g)?.length ?? 0) - (linea.match(/}/g)?.length ?? 0);
    while (pila.length > 0 && profundidad <= pila[pila.length - 1].profundidad) {
      bloques.push({ desde: pila[pila.length - 1].indice, hasta: indice });
      pila.pop();
    }
  });
  return bloques;
}

function funciones(): Array<{ nombre: string; linea: number }> {
  return lineas.flatMap((linea, indice) => {
    const coincidencia = DEFINICION.exec(linea);
    return coincidencia ? [{ nombre: coincidencia[1], linea: indice + 1 }] : [];
  });
}

/** Ámbito de la función: el `match` más interno que la contiene, o todo el fichero. */
function ambito(lineaFuncion: number, bloques: Bloque[]): Bloque {
  const contenedores = bloques.filter((b) => b.desde < lineaFuncion - 1 && lineaFuncion - 1 <= b.hasta);
  if (contenedores.length === 0) return { desde: 0, hasta: lineas.length - 1 };
  return contenedores.reduce((a, b) => (b.hasta < a.hasta ? b : a));
}

describe('reglas · funciones usadas en su ámbito (requisito de publicación)', () => {
  it('no hay ninguna función declarada y sin llamar', () => {
    const bloques = bloquesMatch();
    const sinUsar = funciones().filter(({ nombre, linea }) => {
      const { desde, hasta } = ambito(linea, bloques);
      const patron = LLAMADA(nombre);
      let llamadas = 0;
      for (let i = desde; i <= hasta; i += 1) {
        if (i === linea - 1) continue;
        if (DEFINICION.test(lineas[i])) continue;
        llamadas += lineas[i].match(new RegExp(patron, 'g'))?.length ?? 0;
      }
      return llamadas === 0;
    });
    expect(sinUsar).toEqual([]);
  });

  it('el análisis detecta un caso real: una función muerta en un bloque sí se ve', () => {
    // Control negativo: si el detector dejara de funcionar, este caso lo delata.
    const sintetico = [
      'service cloud.firestore {',
      '  match /databases/{database}/documents {',
      '    match /a/{id} {',
      '      function usada() { return true; }',
      '      allow read: if usada();',
      '    }',
      '    match /b/{id} {',
      '      function muerta() { return true; }',
      '      allow read: if true;',
      '    }',
      '  }',
      '}',
    ];
    const limpias = sintetico.map((l) => l.replace(/\/\/.*$/, ''));
    const detectar = (nombre: string, desde: number, hasta: number) => {
      let llamadas = 0;
      for (let i = desde; i <= hasta; i += 1) {
        if (DEFINICION.test(limpias[i])) continue;
        llamadas += limpias[i].match(LLAMADA(nombre))?.length ?? 0;
      }
      return llamadas;
    };
    expect(detectar('usada', 2, 5)).toBeGreaterThan(0);
    expect(detectar('muerta', 6, 9)).toBe(0);
  });
});
