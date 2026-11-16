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
import { readFileSync } from 'node:fs';
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
  huellaDocumento,
  crearManifiestoRespaldo,
  verificarRespaldo,
  verificarSoloCambioElCampo,
  crearDiario,
  aplicarPlanConDiario,
  tokenDocumento,
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
    for (const proyecto of ['gestor-real', 'produccion-test', 'demo-a2']) {
      expect(() => validarGuardaAplicar({ ...base, proyecto }, env)).toThrow(/AG08_PROYECTOS_PRUEBA/);
    }
    // Además, un id con mayúsculas no tiene formato válido de proyecto GCP: se
    // rechaza antes, por formato (defensa en profundidad).
    expect(() => validarGuardaAplicar({ ...base, proyecto: 'DEMO-A' }, env)).toThrow(/formato/);
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
    expect(r.borrados).toBe(1);
    expect(r.fallos).toBe(0);
    expect(r.idsFallidos).toEqual([]);
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
    expect(r.borrados).toBe(1);
    expect(r.fallos).toBe(1);
    expect(r.idsFallidos).toEqual(['a']);
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

// ===========================================================================
// FASE 2 · respaldo verificable, interrupción y blindaje de producción
// ===========================================================================
describe('AG-08 F2 · manifiesto de respaldo (huellas sin material de credencial)', () => {
  const H1 = 'a'.repeat(64);
  const docs = () => [
    { id: 'u1', datos: { email: 'a@test.invalid', passwordHash: H1, rol: 'X' } },
    { id: 'u2', datos: { email: 'b@test.invalid' } },
  ];

  it('la huella de un documento EXCLUYE passwordHash (no se deriva material del hash)', () => {
    const con = huellaDocumento({ email: 'a@test.invalid', passwordHash: H1, rol: 'X' });
    const sin = huellaDocumento({ email: 'a@test.invalid', rol: 'X' });
    expect(con).toBe(sin);
    // Y cambiar el hash NO cambia la huella; cambiar otro campo SÍ.
    expect(huellaDocumento({ email: 'a@test.invalid', rol: 'X', passwordHash: 'b'.repeat(64) })).toBe(sin);
    expect(huellaDocumento({ email: 'a@test.invalid', rol: 'Y' })).not.toBe(sin);
  });

  it('el manifiesto no contiene hashes y registra presencia y longitud', () => {
    const m = crearManifiestoRespaldo(docs());
    const texto = JSON.stringify(m);
    expect(texto).not.toContain(H1);
    expect(texto).not.toContain('passwordHash');
    expect(m.total).toBe(2);
    expect(m.documentos.find((d) => d.id === 'u1').tieneHash).toBe(true);
    expect(m.documentos.find((d) => d.id === 'u1').hashLongitud).toBe(64);
    expect(m.documentos.find((d) => d.id === 'u2').tieneHash).toBe(false);
    expect(m.huellaGlobal).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el manifiesto es determinista para el mismo contenido', () => {
    const a = crearManifiestoRespaldo(docs());
    const b = crearManifiestoRespaldo([...docs()].reverse());
    expect(a.huellaGlobal).toBe(b.huellaGlobal);
  });
});

describe('AG-08 F2 · verificación del respaldo (fail-closed)', () => {
  const H = 'a'.repeat(64);
  const docs = () => [
    { id: 'u1', datos: { email: 'a@test.invalid', passwordHash: H } },
    { id: 'u2', datos: { email: 'b@test.invalid', passwordHash: H } },
  ];

  it('acepta un respaldo que cubre el conjunto y coincide con la base', () => {
    const m = crearManifiestoRespaldo(docs());
    expect(verificarRespaldo(m, docs(), { idsAfectados: ['u1', 'u2'] }).ok).toBe(true);
  });

  it('rechaza un manifiesto manipulado (huella global rota)', () => {
    const m = crearManifiestoRespaldo(docs());
    m.documentos[0].huella = 'f'.repeat(64);
    const r = verificarRespaldo(m, docs());
    expect(r.ok).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/manipulado/);
  });

  it('rechaza un respaldo incompleto que no cubre un documento a modificar', () => {
    const m = crearManifiestoRespaldo([docs()[0]]);
    const r = verificarRespaldo(m, docs(), { idsAfectados: ['u1', 'u2'] });
    expect(r.ok).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/sin respaldo|no cubre/);
  });

  it('rechaza un respaldo obsoleto si la base cambió en otros campos', () => {
    const m = crearManifiestoRespaldo(docs());
    const cambiada = [{ id: 'u1', datos: { email: 'OTRO@test.invalid', passwordHash: H } }, docs()[1]];
    const r = verificarRespaldo(m, cambiada);
    expect(r.ok).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/obsoleto|ha cambiado/);
  });

  it('rechaza un manifiesto de otro tipo o versión', () => {
    expect(verificarRespaldo({ tipo: 'OTRO', version: 1, documentos: [] }, docs()).ok).toBe(false);
    expect(verificarRespaldo({ tipo: 'AG08_RESPALDO', version: 99, documentos: [] }, docs()).ok).toBe(false);
    expect(verificarRespaldo(null, docs()).ok).toBe(false);
  });
});

describe('AG-08 F2 · verificación de «solo cambió el campo»', () => {
  it('detecta cambios en otros campos, desapariciones y campo residual', () => {
    const antes = [
      { id: 'u1', datos: { email: 'a@test.invalid', passwordHash: 'x'.repeat(64), rol: 'R' } },
      { id: 'u2', datos: { email: 'b@test.invalid' } },
    ];
    const bien = [
      { id: 'u1', datos: { email: 'a@test.invalid', rol: 'R' } },
      { id: 'u2', datos: { email: 'b@test.invalid' } },
    ];
    expect(verificarSoloCambioElCampo(antes, bien).ok).toBe(true);

    const otroCampo = [
      { id: 'u1', datos: { email: 'a@test.invalid', rol: 'CAMBIADO' } },
      { id: 'u2', datos: { email: 'b@test.invalid' } },
    ];
    const r1 = verificarSoloCambioElCampo(antes, otroCampo);
    expect(r1.ok).toBe(false);
    expect(r1.problemas.join(' ')).toMatch(/otros campos alterados/);

    const desaparecido = [bien[0]];
    expect(verificarSoloCambioElCampo(antes, desaparecido).ok).toBe(false);

    const residual = [
      { id: 'u1', datos: { email: 'a@test.invalid', rol: 'R', passwordHash: 'z' } },
      bien[1],
    ];
    const r3 = verificarSoloCambioElCampo(antes, residual);
    expect(r3.ok).toBe(false);
    expect(r3.problemas.join(' ')).toMatch(/sigue presente/);
  });
});

describe('AG-08 F2 · interrupción y reanudación', () => {
  const sentinela = Symbol('delete');
  const H = 'x'.repeat(64);

  function fakeDb(fallarEn: string[] = []) {
    const estado: Record<string, Record<string, unknown>> = {
      a: { email: 'a@test.invalid', passwordHash: H },
      b: { email: 'b@test.invalid', passwordHash: H },
      c: { email: 'c@test.invalid' },
    };
    const escrituras: string[] = [];
    const db = {
      collection: () => ({
        doc: (id: string) => ({
          update: async (cambios: Record<string, unknown>) => {
            if (fallarEn.includes(id)) throw new Error('unavailable');
            for (const [k, v] of Object.entries(cambios)) {
              if (v !== sentinela) throw new Error('campo no sentinela');
              delete estado[id][k];
            }
            escrituras.push(id);
          },
        }),
      }),
    };
    return { db, estado, escrituras };
  }
  const planDe = (estado: Record<string, Record<string, unknown>>) =>
    construirPlan(Object.entries(estado).map(([id, datos]) => ({ id, datos })));

  it('un fallo deja el diario INCOMPLETO y el id fallido NO consta como hecho', async () => {
    const { db, estado, escrituras } = fakeDb(['b']);
    const diario = crearDiario({ prueba: true });
    const r = await aplicarPlanConDiario(db, planDe(estado), { deleteSentinela: sentinela, diario });
    expect(r.borrados).toBe(1);
    expect(r.fallos).toBe(1);
    expect(diario.estado).toBe('INCOMPLETO');
    expect(diario.fallidos).toContain('b');
    expect(diario.hechos).not.toContain('b');
    expect(escrituras).toEqual(['a']);
    expect('passwordHash' in estado.b).toBe(true);
  });

  it('la reanudación del pendiente completa el diario (el fallido deja de serlo)', async () => {
    const { db, estado } = fakeDb(['b']);
    const diario = crearDiario({ prueba: true });
    await aplicarPlanConDiario(db, planDe(estado), { deleteSentinela: sentinela, diario });
    expect(diario.estado).toBe('INCOMPLETO');

    // Se arregla la causa y se reanuda SOLO el pendiente.
    const { db: db2, estado: estado2 } = fakeDb([]);
    estado2.b = { email: 'b@test.invalid', passwordHash: H };
    const pendiente = construirPlan([{ id: 'b', datos: estado2.b }]);
    const r = await aplicarPlanConDiario(db2, pendiente, { deleteSentinela: sentinela, diario });
    expect(r.borrados).toBe(1);
    expect(diario.fallidos).toEqual([]);
    expect(diario.estado).toBe('COMPLETO');
  });

  it('reanudar no repite trabajo ya confirmado', async () => {
    const { db, estado, escrituras } = fakeDb([]);
    const diario = crearDiario({ prueba: true });
    const plan = planDe(estado);
    await aplicarPlanConDiario(db, plan, { deleteSentinela: sentinela, diario });
    const n = escrituras.length;
    await aplicarPlanConDiario(db, planDe(estado), { deleteSentinela: sentinela, diario });
    expect(escrituras.length).toBe(n); // solo a y b la primera vez; la segunda, nada
  });
});

// ===========================================================================
// FASE 2 · blindaje de producción (D2)
// ===========================================================================
describe('AG-08 F2 · el proyecto de producción está bloqueado sin excepción', () => {
  const base = { aplicar: true, credencial: 'sa.json', respaldo: 'exp-1', confirmoProduccion: false };
  const PROD = 'gestor-inmuebles-produccion';

  it('bloquea el id de producción real del repositorio', () => {
    expect(() => validarGuardaAplicar({ ...base, proyecto: PROD }, {})).toThrow(/PRODUCCIÓN/);
  });

  it('lo bloquea incluso si alguien lo añade a la lista blanca (error humano)', () => {
    const env = { AG08_PROYECTOS_PRUEBA: `${PROD},demo-ok` };
    // La lista negra se evalúa ANTES que la blanca, así que el motivo es el más
    // contundente: «es el proyecto de PRODUCCIÓN». Ambas defensas coinciden.
    expect(() => validarGuardaAplicar({ ...base, proyecto: PROD }, env)).toThrow(/PRODUCCIÓN/);
    // Y si el operador declara producción en la lista blanca pero apunta a otro
    // proyecto, también se rechaza: la lista no puede contener producción.
    expect(() => validarGuardaAplicar({ ...base, proyecto: 'demo-ok' }, env))
      .toThrow(/no puede contener el proyecto de producción/);
  });

  it('lo bloquea incluso con --confirmo-produccion', () => {
    expect(() => validarGuardaAplicar({ ...base, proyecto: PROD, confirmoProduccion: true }, {}))
      .toThrow(/PRODUCCIÓN/);
  });

  it('rechaza ids con formato inválido antes de mirar listas', () => {
    for (const proyecto of ['Gestor Prod', 'con_guion_bajo', 'a', '', '-empieza-mal']) {
      expect(() => validarGuardaAplicar({ ...base, proyecto }, { AG08_PROYECTOS_PRUEBA: proyecto }))
        .toThrow(/formato|--proyecto/);
    }
  });

  it('un proyecto de pruebas válido sigue pasando', () => {
    expect(validarGuardaAplicar({ ...base, proyecto: 'demo-ag08-pruebas' }, { AG08_PROYECTOS_PRUEBA: 'demo-ag08-pruebas' }))
      .toBe(false);
  });
});

// ===========================================================================
// FASE 2 · regresión: los abortos por CLI deben ser ACCIONABLES (no "Error")
// ===========================================================================
describe('AG-08 F2 · mensajes de aborto legibles sin filtrar datos', () => {
  // Reproduce la política del manejador de la CLI sobre el texto del script.
  const fuente = readFileSync(path.join(RAIZ, 'scripts/ag08/migrar-passwordhash.mjs'), 'utf8');

  it('el manejador imprime el mensaje propio y trunca en vez de degradar a "Error"', () => {
    expect(fuente).toMatch(/e\.esPropio/);
    expect(fuente).toMatch(/slice\(0, LIMITE\)/);
    expect(fuente).toMatch(/codigoError\(e\)/);
    // Salvaguarda anti-volcado: no se imprime un mensaje multilínea ni un objeto.
    expect(fuente).toMatch(/!e\.message\.includes\('\\n'\)/);
  });

  it('los errores propios del script llevan la marca que permite imprimirlos', () => {
    // Los mensajes redactados por el script se marcan explícitamente.
    expect(fuente).toMatch(/function abortar\(mensaje\)[\s\S]{0,120}e\.esPropio = true/);
    // El mensaje se construye y luego se marca: entre ambos hay la concatenación
    // del texto completo, de ahí el margen.
    expect(fuente).toMatch(/const e = new Error\(\s*`Falta la dependencia opcional[\s\S]{0,400}?e\.esPropio = true/);
  });

  it('ningún mensaje de error incluye el contenido de la credencial ni su ruta', () => {
    // La lectura de credencial se captura y se sustituye por un motivo opaco.
    expect(fuente).toMatch(/No se pudo leer o interpretar la credencial[\s\S]{0,120}no filtrar/);
    expect(fuente).not.toMatch(/console\.(log|error|warn)\([^)]*args\.credencial/);
    expect(fuente).not.toMatch(/console\.(log|error|warn)\([^)]*\$\{[^}]*credencial[^}]*\}/);
  });
});

describe('AG-08 F2 · token opaco para trazas (no se publican identificadores)', () => {
  it('es estable y no contiene el id original', () => {
    const id = 'uid_ABC123_que_es_un_UID_real';
    const t = tokenDocumento(id);
    expect(t).toMatch(/^doc_[0-9a-f]{12}$/);
    expect(t).toBe(tokenDocumento(id));
    expect(t).not.toContain('ABC123');
    expect(t).not.toContain('uid_');
  });

  it('distingue documentos distintos y tolera vacío', () => {
    expect(tokenDocumento('a')).not.toBe(tokenDocumento('b'));
    expect(tokenDocumento('')).toBe('(vacío)');
  });

  it('la auditoría de la migración registra el token, no el id', () => {
    const fuente = readFileSync(path.join(RAIZ, 'scripts/ag08/migrar-passwordhash.mjs'), 'utf8');
    expect(fuente).toMatch(/documentoToken: tokenDocumento\(id\)/);
    expect(fuente).not.toMatch(/documentoId: id,/);
  });
});
