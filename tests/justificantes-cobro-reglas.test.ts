import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decidir as decidirFirestore,
  parsearReglas as parsearFirestore,
  type ContextoPeticion as ContextoFirestore,
} from './helpers/evaluadorReglasFirestore';
import {
  decidir as decidirStorage,
  parsearReglas as parsearStorage,
  type ContextoPeticion as ContextoStorage,
} from './helpers/evaluadorReglasStorage';

const ruta = (nombre: string) => fileURLToPath(new URL(`../${nombre}`, import.meta.url));
const FIRESTORE = parsearFirestore(readFileSync(ruta('firestore.rules'), 'utf8'));
const STORAGE = parsearStorage(readFileSync(ruta('storage.rules'), 'utf8'));

describe('P2 · reglas Firebase permanecen cerradas para acceso directo desde clientes', () => {
  it('la nueva colección privada no tiene regla de cliente y cae en deny-by-default', () => {
    const ctx: ContextoFirestore = {
      auth: { uid: 'uid-prop-a', token: { email: 'synthetic@example.invalid' } },
      firestore: {},
      existente: null,
      entrante: {},
    };
    for (const metodo of ['get', 'list', 'create', 'update', 'delete'] as const) {
      expect(decidirFirestore(FIRESTORE, 'justificantes_cobro/jc_sintetico', metodo, ctx).permitido).toBe(false);
    }
  });

  it('el binario P2 no es accesible por Firebase Storage client rules; sólo el backend autorizado lo sirve', () => {
    const ctx: ContextoStorage = {
      auth: { uid: 'uid-inquilino-a', token: { email: 'synthetic@example.invalid' } },
      firestore: {},
      resource: {
        name: 'cobros_justificantes/prop-a/contrato-a/cobro-a/1_012345678901234567890123/comprobante.pdf',
        size: 1024,
        contentType: 'application/pdf',
      },
    };
    for (const metodo of ['get', 'list', 'create', 'update', 'delete'] as const) {
      expect(decidirStorage(STORAGE, ctx.resource!.name, metodo, ctx).permitido).toBe(false);
    }
  });
});
