/**
 * AG-08 · Validación de la migración de retirada de `passwordHash`.
 * ---------------------------------------------------------------------------
 * Entorno de PRUEBAS con DATOS FICTICIOS: no se conecta a Firestore, no importa
 * `firebase-admin` y no lee ni escribe ningún dato real. Valida la lógica pura del
 * plan (qué se borraría, qué se omite) y, sobre todo, las garantías de seguridad:
 *   · idempotencia (reejecutar sobre estado limpio ⇒ 0 escrituras)
 *   · no filtración de hashes en el manifiesto/logs
 *   · solo se toca el campo `passwordHash`, nunca otros datos
 *   · el manifiesto no puede contener valores de credencial
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(__dirname, '../../../../');
const mod = require(path.join(RAIZ, 'scripts/ag08/migrar-passwordhash.mjs'));

const {
  construirPlan,
  planificarDocumento,
  describirValorSeguro,
  manifiestoAuditable,
  validarManifiestoSinSecretos,
  validarGuardaAplicar,
  huellaRespaldo,
  aplicarPlan,
} = mod;

// Datos FICTICIOS. Hashes inventados (no derivan de ninguna contraseña real).
const HASH_SHA = 'a'.repeat(64);
const HASH_FALLBACK = 'fb_1a2b3c4d';
const HASH_INQUILINO = 'b'.repeat(64);

const documentosFicticios = () => [
  { id: 'user_admin_principal', datos: { email: 'admin@test.invalid', passwordHash: HASH_SHA, rol: 'SUPERADMIN' } },
  { id: 'user_prop_1', datos: { email: 'prop@test.invalid', passwordHash: HASH_FALLBACK, propietarioId: 'CENTINELA-PROPIETARIO' } },
  { id: 'uid_inq_1', datos: { email: 'inq@test.invalid', passwordHash: HASH_INQUILINO, contratoIds: ['CENTINELA-CONTRATO'] } },
  { id: 'user_limpio_1', datos: { email: 'limpio@test.invalid', estado: 'ACTIVO' } },
  { id: 'user_sin_datos', datos: null },
];

describe('AG-08 · plan de migración (offline, datos ficticios)', () => {
  it('identifica exactamente los documentos con el campo y omite el resto', () => {
    const plan = construirPlan(documentosFicticios());
    expect(plan.resumen).toEqual({ total: 5, aBorrar: 3, omitidos: 2 });
    expect(plan.idsAfectados).toEqual(['uid_inq_1', 'user_admin_principal', 'user_prop_1']);
  });

  it('omite el documento ya limpio y el que no tiene datos (idempotencia del plan)', () => {
    expect(planificarDocumento('x', { email: 'a@test.invalid' }).accion).toBe('omitir');
    expect(planificarDocumento('y', null).accion).toBe('omitir');
  });

  it('IDEMPOTENCIA: reejecutar sobre el estado ya migrado produce 0 borrados', () => {
    const plan = construirPlan(documentosFicticios());
    // Simula el resultado de aplicar el plan: documentos sin el campo.
    const tras = documentosFicticios().map(({ id, datos }) => {
      if (!datos) return { id, datos };
      const copia = { ...datos };
      delete copia.passwordHash;
      return { id, datos: copia };
    });
    const plan2 = construirPlan(tras);
    expect(plan2.resumen.aBorrar).toBe(0);
    expect(plan2.idsAfectados).toEqual([]);
    expect(plan2.resumen.total).toBe(plan.resumen.total);
  });

  it('borra el campo sea cual sea su forma (string vacío, null, objeto)', () => {
    for (const valor of ['', null, 0, { heredado: true }]) {
      const r = planificarDocumento('d', { passwordHash: valor });
      expect(r.accion).toBe('borrar-campo');
    }
  });

  it('NO ALTERA otros datos: el plan solo nombra el campo passwordHash', () => {
    const plan = construirPlan(documentosFicticios());
    const claves = new Set();
    for (const e of plan.entradas) Object.keys(e).forEach((k) => claves.add(k));
    expect([...claves].sort()).toEqual(['accion', 'id', 'motivo', 'valorSeguro']);
    // Los datos de terceros siguen intactos porque nunca se copian al plan.
    const detalle = JSON.stringify(plan);
    // Valores centinela: si el plan arrastrara datos del documento, aparecerían.
    expect(detalle).not.toContain('SUPERADMIN');
    expect(detalle).not.toContain('CENTINELA-PROPIETARIO');
    expect(detalle).not.toContain('CENTINELA-CONTRATO');
  });

  it('NO EXPONE el valor del hash: solo tipo y longitud', () => {
    expect(describirValorSeguro(HASH_SHA)).toBe('<string:64>');
    expect(describirValorSeguro(HASH_FALLBACK)).toBe('<string:11>');
    expect(describirValorSeguro(null)).toBe('null');
    expect(describirValorSeguro(undefined)).toBe('undefined');
    const plan = construirPlan(documentosFicticios());
    const serializado = JSON.stringify(plan);
    for (const h of [HASH_SHA, HASH_FALLBACK, HASH_INQUILINO]) {
      expect(serializado).not.toContain(h);
    }
  });

  it('el manifiesto auditable no contiene hashes ni credenciales', () => {
    const plan = construirPlan(documentosFicticios());
    const man = manifiestoAuditable(plan, { modo: 'offline', proyecto: 'demo-test' });
    const texto = JSON.stringify(man);
    for (const h of [HASH_SHA, HASH_FALLBACK, HASH_INQUILINO]) expect(texto).not.toContain(h);
    expect(texto).not.toMatch(/"passwordHash"\s*:/);
    // …pero sí es útil para auditar: ids, motivos y longitudes.
    expect(man.idsAfectados).toHaveLength(3);
    expect(man.resumen).toEqual({ total: 5, aBorrar: 3, omitidos: 2 });
    expect(man.detalle[0]).toHaveProperty('motivo');
  });

  it('la guarda aborta si un hash real llegara a colarse en el manifiesto', () => {
    const plan = construirPlan(documentosFicticios());
    const man = manifiestoAuditable(plan);
    const valores = [HASH_SHA, HASH_FALLBACK, HASH_INQUILINO];
    expect(validarManifiestoSinSecretos(man, valores)).toBe(true);

    // Inyectamos un hash real: la guarda DEBE abortar.
    const contaminado = { ...man, fuga: HASH_SHA };
    expect(() => validarManifiestoSinSecretos(contaminado, valores)).toThrow(/hash real/i);

    // Y también si aparece una clave passwordHash con valor.
    expect(() => validarManifiestoSinSecretos({ passwordHash: 'algo' }, valores)).toThrow(/passwordHash/i);
  });

  it('la guarda no da falsos positivos con valores cortos o irrelevantes', () => {
    const man = { nota: 'texto normal sin credenciales', n: 3 };
    expect(validarManifiestoSinSecretos(man, ['abc', 'corto'])).toBe(true);
  });
});

// ===========================================================================
// Guardas de ejecución real (fail-closed) y núcleo de escritura
// ===========================================================================
describe('AG-08 · guardas de --aplicar (no debe poder apuntarse a producción)', () => {
  const base = { aplicar: true, proyecto: 'demo-x', credencial: 'sa.json', respaldo: 'exp-1', confirmoProduccion: false };

  it('exige proyecto, credencial y respaldo', () => {
    expect(() => validarGuardaAplicar({ ...base, proyecto: '' }, {})).toThrow(/--proyecto/);
    expect(() => validarGuardaAplicar({ ...base, credencial: '' }, {})).toThrow(/--credencial/);
    expect(() => validarGuardaAplicar({ ...base, respaldo: '' }, {})).toThrow(/--respaldo/);
  });

  it('FAIL-CLOSED: sin lista blanca declarada no se aplica nada', () => {
    expect(() => validarGuardaAplicar(base, {})).toThrow(/AG08_PROYECTOS_PRUEBA/);
    expect(() => validarGuardaAplicar(base, { AG08_PROYECTOS_PRUEBA: '  ,  ' })).toThrow(/AG08_PROYECTOS_PRUEBA/);
  });

  it('un proyecto fuera de la lista blanca se rechaza aunque se parezca a pruebas', () => {
    const env = { AG08_PROYECTOS_PRUEBA: 'demo-a,pruebas-b' };
    for (const proyecto of ['gestor-real', 'produccion-test', 'DEMO-A', 'demo-a2']) {
      expect(() => validarGuardaAplicar({ ...base, proyecto }, env)).toThrow(/AG08_PROYECTOS_PRUEBA/);
    }
  });

  it('--confirmo-produccion NO abre la puerta por sí solo', () => {
    const env = { AG08_PROYECTOS_PRUEBA: 'demo-a' };
    expect(() => validarGuardaAplicar({ ...base, proyecto: 'gestor-real', confirmoProduccion: true }, env))
      .toThrow(/AG08_PROYECTOS_PRUEBA/);
  });

  it('solo un proyecto de la lista blanca pasa, y devuelve el acuse', () => {
    const env = { AG08_PROYECTOS_PRUEBA: 'demo-a, pruebas-b' };
    expect(validarGuardaAplicar({ ...base, proyecto: 'pruebas-b' }, env)).toBe(false);
    expect(validarGuardaAplicar({ ...base, proyecto: 'demo-a', confirmoProduccion: true }, env)).toBe(true);
  });

  it('la huella del respaldo no revela bucket ni ruta del export', () => {
    const h = huellaRespaldo('gs://bucket-privado/ag08-pre');
    expect(h).toMatch(/^respaldo#[0-9a-f]+$/);
    expect(h).not.toContain('bucket');
    expect(huellaRespaldo('')).toBe('(ninguno)');
  });
});

describe('AG-08 · núcleo de escritura: solo el campo passwordHash', () => {
  const sentinela = Symbol('delete');

  function fakeDb(estado: Record<string, Record<string, unknown>>) {
    const escrituras: { id: string; campos: string[] }[] = [];
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          update: async (cambios: Record<string, unknown>) => {
            escrituras.push({ id, campos: Object.keys(cambios) });
            for (const [k, v] of Object.entries(cambios)) {
              if (v !== sentinela) throw new Error('campo no sentinela');
              delete (estado[id] as Record<string, unknown>)[k];
            }
          },
        }),
      }),
    };
    return { db, escrituras };
  }

  it('borra el campo en los ids del plan y en ningún otro', async () => {
    const estado = {
      a: { email: 'a@test.invalid', passwordHash: 'x'.repeat(64) },
      b: { email: 'b@test.invalid' },
    };
    const { db, escrituras } = fakeDb(estado);
    const plan = construirPlan([
      { id: 'a', datos: estado.a },
      { id: 'b', datos: estado.b },
    ]);
    const r = await aplicarPlan(db, plan, { deleteSentinela: sentinela });
    expect(r).toEqual({ borrados: 1, fallos: 0 });
    expect(escrituras).toEqual([{ id: 'a', campos: ['passwordHash'] }]);
    expect(estado.a.email).toBe('a@test.invalid');
  });

  it('cuenta fallos y NO aborta el resto (idempotente por reintento)', async () => {
    const estado = { a: { passwordHash: 'x' }, b: { passwordHash: 'y' } };
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          update: async () => {
            if (id === 'a') throw new Error('denegado');
            delete (estado as Record<string, Record<string, unknown>>)[id].passwordHash;
          },
        }),
      }),
    };
    const plan = construirPlan([
      { id: 'a', datos: estado.a },
      { id: 'b', datos: estado.b },
    ]);
    const r = await aplicarPlan(db, plan, { deleteSentinela: sentinela });
    expect(r).toEqual({ borrados: 1, fallos: 1 });
    expect('passwordHash' in estado.b).toBe(false);
  });

  it('la auditoría que falla no impide el borrado', async () => {
    const estado = { a: { passwordHash: 'x' } };
    const { db } = fakeDb(estado);
    const plan = construirPlan([{ id: 'a', datos: estado.a }]);
    const r = await aplicarPlan(db, plan, {
      deleteSentinela: sentinela,
      auditar: async () => {
        throw new Error('audit no disponible');
      },
    });
    expect(r.borrados).toBe(1);
    expect('passwordHash' in estado.a).toBe(false);
  });
});
