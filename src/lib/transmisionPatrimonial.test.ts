/**
 * K.2-B2 — TRANSMISIÓN PATRIMONIAL ATÓMICA (H1)
 * ==============================================
 * Demuestra el criterio de seguridad de H1:
 *   «Después de A → B, A ya no accede al inmueble transmitido por la relación
 *    patrimonial vigente, B sí accede, y el histórico de A permanece.»
 *
 * No basta con comprobar `propietarioId = B`: se verifica también la
 * sincronización de `titularesIds`, de `titularidades`, el acceso resultante y
 * la conservación del histórico.
 *
 * El doble de transacción reproduce la semántica real de Firestore: las
 * escrituras quedan EN ESPERA y sólo se aplican si el commit confirma. Así el
 * caso de fallo demuestra ausencia de estado parcial sin emulador ni red.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Inmueble, Propietario, Titularidad } from '../types';
import { idTitularidad, construirTitularidad } from '../utils/titularidadesEngine';
import { puedeLeerTitularidadesDe } from './titularidadInmueble';
import { planificarTransmision, validarTransmision } from './transmisionPatrimonial';
import {
  aplicarTransmisionEnTransaccion,
  type ContextoTransmision,
  type PeticionTransmision,
} from './transmisionPatrimonialFirestore';

// --- espejo de las Rules (firestore.rules → `inmuebleEsMio`) ----------------
// Reproduce literalmente las tres vías de acceso al inmueble de un PROPIETARIO.
// La fidelidad del espejo se ancla más abajo contra el fichero real de Rules.
function inmuebleEsMio(inm: Inmueble, pid: string): boolean {
  return (
    inm.propietarioId === pid ||
    inm.propietarioPrincipalId === pid ||
    (Array.isArray(inm.titularesIds) && inm.titularesIds.includes(pid))
  );
}
/** Rama 2 de `allow get` de `titularidades`: la propia relación, por su clave. */
function puedeLeerSuPropiaTitularidad(t: Titularidad, pid: string): boolean {
  return t.propietarioId === pid;
}

// --- fábricas ---------------------------------------------------------------
function propietario(id: string, extra: Partial<Propietario> = {}): Propietario {
  return {
    id,
    nombre: `Nombre ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: '600000000',
    email: `${id}@correo.test`,
    direccion: `Calle ${id}`,
    ciudad: 'Alicante',
    codigoPostal: '03001',
    cuentasBancarias: [],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
    ...extra,
  };
}

function inmueble(extra: Partial<Inmueble> = {}): Inmueble {
  return {
    id: 'INM1',
    direccion: 'Av. Maisonnave 1',
    ciudad: 'Alicante',
    precio: 900,
    estado: 'disponible',
    habitaciones: 3,
    banos: 1,
    superficie: 90,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'A',
    propietarioPrincipalId: 'A',
    titularesIds: ['A'],
    ...extra,
  };
}

function titularidadDe(inmuebleId: string, propietarioId: string): Titularidad {
  return construirTitularidad({ inmuebleId, propietarioId, fechaInicio: '2026-01-01T00:00:00.000Z' });
}

// --- doble de transacción ---------------------------------------------------
interface Almacen {
  inmuebles: Map<string, Inmueble>;
  propietarios: Map<string, Propietario>;
  titularidades: Map<string, Titularidad>;
}

function crearEntorno(inicial: {
  inmueble?: Inmueble;
  propietarios?: Propietario[];
  titularidades?: Titularidad[];
}) {
  const almacen: Almacen = {
    inmuebles: new Map(),
    propietarios: new Map(),
    titularidades: new Map(),
  };
  if (inicial.inmueble) almacen.inmuebles.set(inicial.inmueble.id, inicial.inmueble);
  for (const p of inicial.propietarios || []) almacen.propietarios.set(p.id, p);
  for (const t of inicial.titularidades || []) almacen.titularidades.set(t.id, t);

  const enEspera: Array<() => void> = [];
  const lecturas: string[] = [];

  const ctx: ContextoTransmision = {
    leerInmueble: async (id) => {
      lecturas.push(`inmuebles/${id}`);
      return almacen.inmuebles.get(id) ?? null;
    },
    leerPropietario: async (id) => {
      lecturas.push(`propietarios/${id}`);
      return almacen.propietarios.get(id) ?? null;
    },
    leerTitularidad: async (id) => {
      lecturas.push(`titularidades/${id}`);
      return almacen.titularidades.get(id) ?? null;
    },
    escribirInmueble: (id, cambios) => {
      enEspera.push(() => {
        const previo = almacen.inmuebles.get(id);
        if (previo) almacen.inmuebles.set(id, { ...previo, ...(cambios as Partial<Inmueble>) });
      });
    },
    escribirTitularidad: (t) => {
      enEspera.push(() => almacen.titularidades.set(t.id, t));
    },
  };

  return {
    almacen,
    ctx,
    lecturas,
    escriturasEnEspera: () => enEspera.length,
    commit: () => enEspera.forEach((aplicar) => aplicar()),
  };
}

/** Ejecuta la operación con la semántica «todo o nada». */
async function transmitir(
  peticion: PeticionTransmision,
  entorno: ReturnType<typeof crearEntorno>,
  opciones: { fallarEnCommit?: boolean } = {},
) {
  try {
    const plan = await aplicarTransmisionEnTransaccion(peticion, entorno.ctx);
    if (opciones.fallarEnCommit) throw new Error('fallo de red durante el commit');
    entorno.commit();
    return { ok: true as const, plan };
  } catch (err) {
    return { ok: false as const, motivoFallo: (err as Error).message };
  }
}

const PETICION: PeticionTransmision = {
  inmuebleId: 'INM1',
  adquirenteId: 'B',
  motivo: 'VENTA',
  detalle: 'Escritura de compraventa ante notario',
  actor: { id: 'u-master', nombre: 'Administrador Principal' },
  fecha: '2026-06-01T10:00:00.000Z',
};

// ===========================================================================

describe('CASO 1 · transmisión simple A → B', () => {
  it('sincroniza canónico, principal, índice y ambas titularidades', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    const res = await transmitir(PETICION, entorno);
    expect(res.ok).toBe(true);

    const final = entorno.almacen.inmuebles.get('INM1')!;
    expect(final.propietarioId).toBe('B');
    expect(final.propietarioPrincipalId).toBe('B');
    expect(final.titularesIds).not.toContain('A');
    expect(final.titularesIds).toContain('B');

    const tA = entorno.almacen.titularidades.get(idTitularidad('INM1', 'A'))!;
    const tB = entorno.almacen.titularidades.get(idTitularidad('INM1', 'B'))!;
    expect(tA.estado).toBe('CERRADA');
    expect(tB.estado).toBe('VIGENTE');
    expect(tB.porcentajeTitularidad).toBeNull();
  });

  it('actualiza el snapshot fiscal al adquirente sin tocar el secundario legacy', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble({
        propietarioSecundarioId: 'LEGACY',
        datosFiscales: {
          referenciaCatastral: 'RC-123',
          propietarioPrincipal: { nombre: 'Nombre A', nifDni: 'NIF-A', direccion: 'Calle A' },
          segundoPropietario: { nombre: 'Legacy', nifDni: 'NIF-L', direccion: 'Calle L' },
        },
      }),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    await transmitir(PETICION, entorno);
    const final = entorno.almacen.inmuebles.get('INM1')!;

    expect(final.datosFiscales?.propietarioPrincipal.propietarioId).toBe('B');
    expect(final.datosFiscales?.propietarioPrincipal.nifDni).toBe('NIF-B');
    // Legacy intacto (K.2-B2 §10).
    expect(final.propietarioSecundarioId).toBe('LEGACY');
    expect(final.datosFiscales?.segundoPropietario?.nombre).toBe('Legacy');
    expect(final.datosFiscales?.referenciaCatastral).toBe('RC-123');
  });
});

describe('CASO 2 · histórico', () => {
  it('la titularidad de A sigue existiendo, cerrada y con trazabilidad completa', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    await transmitir(PETICION, entorno);
    const tA = entorno.almacen.titularidades.get(idTitularidad('INM1', 'A'))!;

    expect(tA).toBeDefined();
    expect(tA.estado).toBe('CERRADA');
    expect(tA.fechaCierre).toBe('2026-06-01T10:00:00.000Z');
    expect(tA.motivoCierre).toBe('VENTA');
    expect(tA.detalleCierre).toBe('Escritura de compraventa ante notario');
    expect(tA.cerradoPorId).toBe('u-master');
    expect(tA.cerradoPorNombre).toBe('Administrador Principal');
    // La relación original no se desvirtúa.
    expect(tA.inmuebleId).toBe('INM1');
    expect(tA.propietarioId).toBe('A');
    expect(tA.fechaInicio).toBe('2026-01-01T00:00:00.000Z');
  });

  it('no elimina la ficha de A ni ningún documento', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    await transmitir(PETICION, entorno);

    expect(entorno.almacen.propietarios.get('A')).toBeDefined();
    expect(entorno.almacen.propietarios.size).toBe(2);
    expect(entorno.almacen.inmuebles.size).toBe(1);
    // A cerrada + B vigente: el histórico SUMA, no sustituye.
    expect(entorno.almacen.titularidades.size).toBe(2);
  });
});

describe('CASO 3 · acceso (criterio de seguridad de H1)', () => {
  it('A pierde el acceso vigente, B lo obtiene y A conserva sólo su histórico', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    const antes = entorno.almacen.inmuebles.get('INM1')!;
    expect(inmuebleEsMio(antes, 'A')).toBe(true);
    expect(inmuebleEsMio(antes, 'B')).toBe(false);

    await transmitir(PETICION, entorno);
    const despues = entorno.almacen.inmuebles.get('INM1')!;

    // 1. A ya no accede al inmueble por ninguna de las tres vías de las Rules.
    expect(inmuebleEsMio(despues, 'A')).toBe(false);
    // 2. B sí accede.
    expect(inmuebleEsMio(despues, 'B')).toBe(true);
    // 3. A tampoco puede leer ya las titularidades del inmueble.
    expect(puedeLeerTitularidadesDe(despues, 'A')).toBe(false);
    expect(puedeLeerTitularidadesDe(despues, 'B')).toBe(true);

    // 4. A conserva la lectura de SU propia titularidad cerrada (histórico).
    const tA = entorno.almacen.titularidades.get(idTitularidad('INM1', 'A'))!;
    expect(puedeLeerSuPropiaTitularidad(tA, 'A')).toBe(true);
    // 5. A NO accede a la titularidad de B.
    const tB = entorno.almacen.titularidades.get(idTitularidad('INM1', 'B'))!;
    expect(puedeLeerSuPropiaTitularidad(tB, 'A')).toBe(false);
  });

  it('el espejo de acceso coincide con el `inmuebleEsMio` real de firestore.rules', () => {
    const reglas = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const cuerpo = reglas.slice(reglas.indexOf('function inmuebleEsMio(d)'));
    const fin = cuerpo.indexOf('\n    }');
    const funcion = cuerpo.slice(0, fin);
    // Las tres vías que reproduce el espejo del test.
    expect(funcion).toContain('d.propietarioId == myPropId()');
    expect(funcion).toContain('d.propietarioPrincipalId == myPropId()');
    expect(funcion).toContain('d.titularesIds.hasAny([myPropId()])');
  });
});

describe('CASO 4 · porcentaje', () => {
  it('la titularidad del adquirente nace con porcentaje null, nunca 100', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    const res = await transmitir(PETICION, entorno);
    const tB = entorno.almacen.titularidades.get(idTitularidad('INM1', 'B'))!;

    expect(tB.porcentajeTitularidad).toBeNull();
    expect(tB.porcentajeTitularidad).not.toBe(100);
    expect(res.ok && res.plan.titularidadAdquirente.porcentajeTitularidad).toBeNull();
  });

  it('tampoco altera el porcentaje que ya tuviera la titularidad cerrada', async () => {
    const conPorcentaje: Titularidad = { ...titularidadDe('INM1', 'A'), porcentajeTitularidad: 100 };
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [conPorcentaje],
    });

    await transmitir(PETICION, entorno);
    const tA = entorno.almacen.titularidades.get(idTitularidad('INM1', 'A'))!;
    expect(tA.porcentajeTitularidad).toBe(100);
  });
});

describe('CASO 5 · cotitulares vigentes legítimos', () => {
  it('conserva a los demás cotitulares: una transmisión no disuelve el condominio', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble({ titularesIds: ['A', 'C'] }),
      propietarios: [propietario('A'), propietario('B'), propietario('C')],
      titularidades: [titularidadDe('INM1', 'A'), titularidadDe('INM1', 'C')],
    });

    const res = await transmitir(PETICION, entorno);
    const final = entorno.almacen.inmuebles.get('INM1')!;

    expect(final.titularesIds).toEqual(['B', 'C']);
    expect(res.ok && res.plan.cotitularesConservados).toEqual(['C']);
    // C sigue vigente: no se cierra en silencio una relación ajena a la operación.
    const tC = entorno.almacen.titularidades.get(idTitularidad('INM1', 'C'))!;
    expect(tC.estado).toBe('VIGENTE');
    expect(inmuebleEsMio(final, 'C')).toBe(true);
    expect(inmuebleEsMio(final, 'A')).toBe(false);
  });

  it('si el transmitente no tenía titularidad moderna (legacy) no inventa histórico', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble({ titularesIds: ['A'] }),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [],
    });

    const res = await transmitir(PETICION, entorno);
    const final = entorno.almacen.inmuebles.get('INM1')!;

    expect(res.ok && res.plan.titularidadCerrada).toBeNull();
    expect(entorno.almacen.titularidades.has(idTitularidad('INM1', 'A'))).toBe(false);
    // Aun así A pierde el acceso y B queda correctamente vinculado.
    expect(final.titularesIds).toEqual(['B']);
    expect(inmuebleEsMio(final, 'A')).toBe(false);
    expect(entorno.almacen.titularidades.get(idTitularidad('INM1', 'B'))!.estado).toBe('VIGENTE');
  });
});

describe('CASO 6 · fallo transaccional', () => {
  it('un fallo en el commit deja el estado previo ÍNTEGRO (sin escritura parcial)', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    const res = await transmitir(PETICION, entorno, { fallarEnCommit: true });
    expect(res.ok).toBe(false);

    const final = entorno.almacen.inmuebles.get('INM1')!;
    // Ninguno de los estados parciales prohibidos.
    expect(final.propietarioId).toBe('A');
    expect(final.propietarioPrincipalId).toBe('A');
    expect(final.titularesIds).toEqual(['A']);
    expect(entorno.almacen.titularidades.get(idTitularidad('INM1', 'A'))!.estado).toBe('VIGENTE');
    expect(entorno.almacen.titularidades.has(idTitularidad('INM1', 'B'))).toBe(false);
    expect(inmuebleEsMio(final, 'A')).toBe(true);
  });

  it('las escrituras quedan en espera: ninguna se aplica antes del commit', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    await aplicarTransmisionEnTransaccion(PETICION, entorno.ctx);
    // 3 escrituras planificadas (inmueble + cierre A + alta B) y 0 aplicadas.
    expect(entorno.escriturasEnEspera()).toBe(3);
    expect(entorno.almacen.inmuebles.get('INM1')!.propietarioId).toBe('A');
  });
});

describe('CASO 7 · adquirente inexistente', () => {
  it('falla antes de planificar ninguna escritura', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    const res = await transmitir({ ...PETICION, adquirenteId: 'FANTASMA' }, entorno);

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.motivoFallo).toContain('El adquirente no existe');
    expect(entorno.escriturasEnEspera()).toBe(0);
    expect(entorno.almacen.inmuebles.get('INM1')!.propietarioId).toBe('A');
    // Y nunca crea la ficha que falta.
    expect(entorno.almacen.propietarios.has('FANTASMA')).toBe(false);
  });

  it('también rechaza un inmueble inexistente', async () => {
    const entorno = crearEntorno({ propietarios: [propietario('B')] });
    const res = await transmitir(PETICION, entorno);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.motivoFallo).toContain('El inmueble no existe');
    expect(entorno.escriturasEnEspera()).toBe(0);
  });
});

describe('CASO 8 · A = B', () => {
  it('rechaza la falsa transmisión sin escribir nada', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    const res = await transmitir({ ...PETICION, adquirenteId: 'A' }, entorno);

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.motivoFallo).toContain('ya es el titular canónico');
    expect(entorno.escriturasEnEspera()).toBe(0);
    expect(entorno.almacen.titularidades.get(idTitularidad('INM1', 'A'))!.estado).toBe('VIGENTE');
  });

  it('rechaza un motivo ajeno al modelo', () => {
    const errores = validarTransmision({
      inmueble: inmueble(),
      adquirente: propietario('B'),
      titularidades: [],
      motivo: 'EXPROPIACION_INVENTADA' as never,
    });
    expect(errores.some((e) => e.includes('motivo'))).toBe(true);
  });

  it('rechaza un inmueble sin titular canónico actual', () => {
    const errores = validarTransmision({
      inmueble: inmueble({ propietarioId: undefined }),
      adquirente: propietario('B'),
      titularidades: [],
      motivo: 'VENTA',
    });
    expect(errores.some((e) => e.includes('no tiene titular canónico'))).toBe(true);
  });
});

describe('CASO 9 · concurrencia', () => {
  it('el índice se compone con el estado LEÍDO en la transacción, no con uno previo', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble({ titularesIds: ['A'] }),
      propietarios: [propietario('A'), propietario('B'), propietario('C')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    // Otro actor añade a C DESPUÉS de preparar la petición y ANTES de ejecutar.
    entorno.almacen.inmuebles.set('INM1', {
      ...entorno.almacen.inmuebles.get('INM1')!,
      titularesIds: ['A', 'C'],
    });

    const res = await transmitir(PETICION, entorno);
    const final = entorno.almacen.inmuebles.get('INM1')!;

    // C sobrevive porque el array se compone desde la lectura transaccional.
    expect(final.titularesIds).toEqual(['B', 'C']);
    expect(res.ok && res.plan.cotitularesConservados).toEqual(['C']);
  });

  it('todas las lecturas preceden a cualquier escritura (requisito del SDK)', async () => {
    const entorno = crearEntorno({
      inmueble: inmueble(),
      propietarios: [propietario('A'), propietario('B')],
      titularidades: [titularidadDe('INM1', 'A')],
    });

    await aplicarTransmisionEnTransaccion(PETICION, entorno.ctx);

    expect(entorno.lecturas).toEqual([
      'inmuebles/INM1',
      'propietarios/B',
      `titularidades/${idTitularidad('INM1', 'A')}`,
    ]);
  });
});

describe('planificación pura', () => {
  it('no duplica al adquirente si ya figuraba en el índice', () => {
    const plan = planificarTransmision({
      inmueble: inmueble({ titularesIds: ['A', 'B'] }),
      adquirente: propietario('B'),
      titularidades: [titularidadDe('INM1', 'A')],
      motivo: 'HERENCIA',
      fecha: '2026-06-01T10:00:00.000Z',
    });
    expect(plan.cambiosInmueble.titularesIds).toEqual(['B']);
  });

  it('admite todos los motivos reales del modelo', () => {
    for (const motivo of ['VENTA', 'DONACION', 'HERENCIA', 'DIVORCIO', 'DISOLUCION_CONDOMINIO', 'ERROR_DATOS', 'OTRO'] as const) {
      expect(
        validarTransmision({
          inmueble: inmueble(),
          adquirente: propietario('B'),
          titularidades: [],
          motivo,
        }),
      ).toEqual([]);
    }
  });
});
