/**
 * H10 — UNA MIGRACIÓN NO FABRICA PORCENTAJES DE TITULARIDAD
 * ==========================================================
 * Regla patrimonial protegida:
 *
 *   «El sistema puede saber QUIÉN es titular sin saber QUÉ PORCENTAJE posee.
 *    Cuando el porcentaje no está acreditado se conserva `null`; nunca se
 *    fabrica un 100 % por descarte.»
 *
 * El planificador deducía `titularesIds.size === 1 ? 100 : null`, es decir,
 * convertía la CARDINALIDAD de un conjunto deducido en una cuota patrimonial.
 * Un inmueble con un solo titular conocido puede tener cotitulares aún no
 * registrados: la ausencia de información no es evidencia de exclusividad.
 *
 * Inventario de fuentes del modelo (auditado en esta orden):
 *   · `titularidades/{id}.porcentajeTitularidad` → ÚNICA fuente explícita;
 *   · `propietarioId`, `propietarioPrincipalId`, `propietarioSecundarioId`,
 *     `titularesIds`, `datosFiscales.*` → identifican a la PERSONA, jamás la cuota
 *     (`PropietarioFiscal` no tiene ningún campo de porcentaje).
 *
 * El planificador es DRY-RUN puro: no importa Firestore y no tiene ejecutor.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  planificarMigracion,
  porcentajeExplicitoValido,
  resolverPorcentajeTitularidad,
  titularesDeducidos,
} from '../src/lib/migracionTitularidades';
import { construirTitularidad } from '../src/utils/titularidadesEngine';
import type { Inmueble, PropietarioFiscal, Titularidad } from '../src/types';

const root = (rel: string) => resolve(process.cwd(), rel);

function inmueble(parcial: Partial<Inmueble> & { id: string }): Inmueble {
  return {
    direccion: 'Calle Test 1',
    ciudad: 'Alicante',
    precio: 800,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...parcial,
  } as Inmueble;
}

const fiscal = (nombre: string, propietarioId?: string): PropietarioFiscal => ({
  nombre,
  nifDni: '00000000X',
  direccion: 'Calle Test 1',
  ...(propietarioId ? { propietarioId } : {}),
});

/** Porcentajes de las altas propuestas para un inmueble. */
const porcentajesDe = (informe: ReturnType<typeof planificarMigracion>) =>
  informe.propuestas[0].altas.map((a) => a.porcentaje);

// ===========================================================================
describe('H10-1 — un único titular', () => {
  it('sin porcentaje explícito el alta queda en null, nunca en 100', () => {
    const informe = planificarMigracion({ inmuebles: [inmueble({ id: 'A', propietarioId: 'pA' })] });

    expect(informe.propuestas[0].altas).toHaveLength(1);
    expect(porcentajesDe(informe)).toEqual([null]);
    expect(porcentajesDe(informe)).not.toContain(100);
  });

  it('la identidad sí se deduce: saber quién es no es saber cuánto posee', () => {
    const informe = planificarMigracion({ inmuebles: [inmueble({ id: 'A', propietarioId: 'pA' })] });

    expect(informe.propuestas[0].altas[0].propietarioId).toBe('pA'); // identidad ✔
    expect(informe.propuestas[0].altas[0].porcentaje).toBeNull(); // cuota ✘
    expect(informe.propuestas[0].titularesIds).toEqual(['pA']);
  });

  it('se deja constancia de que queda PENDIENTE', () => {
    const informe = planificarMigracion({ inmuebles: [inmueble({ id: 'A', propietarioId: 'pA' })] });
    expect(informe.advertencias.some((a) => a.includes('PENDIENTES'))).toBe(true);
  });
});

// ===========================================================================
describe('H10-2 — dos titulares sin porcentaje', () => {
  it('ambos quedan en null', () => {
    const informe = planificarMigracion({
      inmuebles: [
        inmueble({
          id: 'A',
          propietarioId: 'pA',
          datosFiscales: {
            propietarioPrincipal: fiscal('A', 'pA'),
            tieneSegundoPropietario: true,
            segundoPropietario: fiscal('B', 'pB'),
          },
        }),
      ],
    });

    expect(porcentajesDe(informe)).toEqual([null, null]);
    expect(porcentajesDe(informe)).not.toContain(50);
  });
});

// ===========================================================================
describe('H10-3 — 100 explícito', () => {
  it('un 100 acreditado en la titularidad se conserva', () => {
    const existente = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 100 });
    expect(resolverPorcentajeTitularidad({ existente })).toBe(100);
  });

  it('el planificador lo respeta y no repropone nada (idempotente)', () => {
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'pA', titularesIds: ['pA'] })],
      titularidades: [construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 100 })],
    });
    expect(informe.altasPropuestas).toBe(0);
    expect(informe.advertencias).toEqual([]);
  });
});

// ===========================================================================
describe('H10-4 — 50/50 explícito', () => {
  it('se conservan ambos porcentajes', () => {
    const a = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 50 });
    const b = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pB', porcentaje: 50 });
    expect(resolverPorcentajeTitularidad({ existente: a })).toBe(50);
    expect(resolverPorcentajeTitularidad({ existente: b })).toBe(50);
  });
});

// ===========================================================================
describe('H10-5 — 60/40 explícito', () => {
  it('se conservan tal cual, sin redondeos ni normalizaciones', () => {
    const a = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 60 });
    const b = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pB', porcentaje: 40 });
    expect(resolverPorcentajeTitularidad({ existente: a })).toBe(60);
    expect(resolverPorcentajeTitularidad({ existente: b })).toBe(40);
  });

  it('§16 — un 60 acreditado NO convierte el desconocido en 40', () => {
    const a = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 60 });
    const informe = planificarMigracion({
      inmuebles: [
        inmueble({
          id: 'A',
          propietarioId: 'pA',
          titularesIds: ['pA'],
          datosFiscales: {
            propietarioPrincipal: fiscal('A', 'pA'),
            tieneSegundoPropietario: true,
            segundoPropietario: fiscal('B', 'pB'),
          },
        }),
      ],
      titularidades: [a],
    });

    const alta = informe.propuestas[0].altas.find((x) => x.propietarioId === 'pB');
    expect(alta?.porcentaje).toBeNull(); // nunca 40
  });
});

// ===========================================================================
describe('H10-6 — principal único sin porcentaje', () => {
  it('propietarioPrincipalId por sí solo no acredita cuota', () => {
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioPrincipalId: 'pA' })],
    });
    expect(informe.propuestas[0].altas[0]).toMatchObject({ propietarioId: 'pA', porcentaje: null });
  });
});

// ===========================================================================
describe('H10-7 — principal + secundario legado', () => {
  it('propietarioSecundarioId no genera titularidad ni reparto 100/0', () => {
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'pA', propietarioSecundarioId: 'pB' })],
    });

    // El campo legado NO deduce identidad (auditado: no es fuente del modelo moderno)…
    expect(informe.propuestas[0].altas.map((a) => a.propietarioId)).toEqual(['pA']);
    // …y desde luego no convierte a pA en dueño del 100 %.
    expect(informe.propuestas[0].altas[0].porcentaje).toBeNull();
  });

  it('con ambos identificados por la ficha fiscal, ninguno recibe 100 ni 0', () => {
    const informe = planificarMigracion({
      inmuebles: [
        inmueble({
          id: 'A',
          propietarioId: 'pA',
          propietarioSecundarioId: 'pB',
          datosFiscales: {
            propietarioPrincipal: fiscal('A', 'pA'),
            tieneSegundoPropietario: true,
            segundoPropietario: fiscal('B', 'pB'),
          },
        }),
      ],
    });

    expect(porcentajesDe(informe)).toEqual([null, null]);
    expect(porcentajesDe(informe)).not.toContain(0);
    expect(porcentajesDe(informe)).not.toContain(100);
  });
});

// ===========================================================================
describe('H10-8 — ficha fiscal principal', () => {
  it('identifica al titular pero no genera 100 %', () => {
    const inm = inmueble({
      id: 'A',
      datosFiscales: { propietarioPrincipal: fiscal('A', 'pA'), tieneSegundoPropietario: false },
    });
    const informe = planificarMigracion({ inmuebles: [inm] });

    expect(titularesDeducidos(inm).map((d) => d.origen)).toEqual(['fichaFiscalPrincipal']);
    expect(informe.propuestas[0].altas[0].porcentaje).toBeNull();
  });

  it('estructuralmente no puede: PropietarioFiscal no tiene campo de porcentaje', () => {
    const ficha = fiscal('A', 'pA');
    expect(Object.keys(ficha).some((k) => /porcentaje|cuota|participacion/i.test(k))).toBe(false);
  });
});

// ===========================================================================
describe('H10-9 — porcentajes inválidos', () => {
  const invalidos: Array<[string, unknown]> = [
    ['negativo', -1],
    ['mayor que 100', 101],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['string numérica', '100'],
    ['string vacía', ''],
    ['booleano', true],
    ['objeto', {}],
    ['array', [100]],
    ['undefined', undefined],
    ['null', null],
  ];

  for (const [etiqueta, valor] of invalidos) {
    it(`rechaza ${etiqueta} y devuelve null`, () => {
      expect(porcentajeExplicitoValido(valor)).toBe(false);
      const existente = { porcentajeTitularidad: valor } as unknown as Titularidad;
      expect(resolverPorcentajeTitularidad({ existente })).toBeNull();
    });
  }

  it('acepta los límites legítimos 0 y 100 y los decimales', () => {
    expect(porcentajeExplicitoValido(0)).toBe(true);
    expect(porcentajeExplicitoValido(100)).toBe(true);
    expect(porcentajeExplicitoValido(33.34)).toBe(true);
  });

  it('un dato corrupto genera incidencia en el plan y NO pasa al modelo', () => {
    const corrupta = {
      ...construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 50 }),
      porcentajeTitularidad: -5 as number,
    };
    const informe = planificarMigracion({
      inmuebles: [inmueble({ id: 'A', propietarioId: 'pA', titularesIds: ['pA'] })],
      titularidades: [corrupta],
    });
    expect(informe.advertencias.some((a) => a.includes('porcentaje inválido'))).toBe(true);
  });
});

// ===========================================================================
describe('H10-10 — el planificador sigue siendo DRY-RUN puro', () => {
  const fuente = readFileSync(root('src/lib/migracionTitularidades.ts'), 'utf8');

  it('no importa Firestore ni nada con efectos de red', () => {
    expect(fuente).not.toContain('firebase/firestore');
    expect(fuente).not.toContain("from './firebase'");
    expect(/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction|getDoc|getDocs|fetch)\s*\(/.test(fuente)).toBe(false);
  });

  it('no queda rastro de la inferencia por cardinalidad', () => {
    expect(fuente).not.toContain('porcentajePorDefecto');
    expect(/titularesIds\.size\s*===\s*1\s*\?/.test(fuente)).toBe(false);
  });

  it('planificar no muta la entrada', () => {
    const inm = inmueble({ id: 'A', propietarioId: 'pA', titularesIds: ['pA'] });
    const t = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 70 });
    const copiaInm = JSON.parse(JSON.stringify(inm));
    const copiaT = JSON.parse(JSON.stringify(t));

    planificarMigracion({ inmuebles: [inm], titularidades: [t] });

    expect(inm).toEqual(copiaInm);
    expect(t).toEqual(copiaT);
  });

  it('la función de resolución es pura y sin efectos', () => {
    const existente = construirTitularidad({ inmuebleId: 'A', propietarioId: 'pA', porcentaje: 25 });
    const antes = JSON.parse(JSON.stringify(existente));
    expect(resolverPorcentajeTitularidad({ existente })).toBe(25);
    expect(resolverPorcentajeTitularidad({ existente })).toBe(25); // determinista
    expect(existente).toEqual(antes);
  });
});

// ===========================================================================
describe('H10-11 — H7 / H8 / H9 / K.2 intactos', () => {
  it('H9 sigue cerrando dentro de su transacción', () => {
    const f = readFileSync(root('src/lib/titularidadesFirestore.ts'), 'utf8');
    const cuerpo = f.slice(f.indexOf('export async function cerrarTitularidad'));
    expect(cuerpo).toContain('runTransaction');
    expect(cuerpo).toContain('titularesIds: indice.filter');
  });

  it('K.2 sigue siendo una única transacción', () => {
    const f = readFileSync(root('src/lib/transmisionPatrimonialFirestore.ts'), 'utf8');
    expect(f.match(/runTransaction\(/g) || []).toHaveLength(1);
  });

  it('H7 sigue excluyendo titularesIds de la edición ordinaria', () => {
    const f = readFileSync(root('src/lib/edicionOrdinariaInmueble.ts'), 'utf8');
    expect(f).toContain('const { titularesIds: _indicePatrimonial, ...ordinario } = inmueble;');
  });

  it('H10 no toca la autorización: no menciona Rules ni roles', () => {
    const fuente = readFileSync(root('src/lib/migracionTitularidades.ts'), 'utf8');
    expect(fuente).not.toContain('MASTER_ADMIN');
    expect(fuente).not.toContain('allow ');
  });
});
