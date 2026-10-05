/**
 * H11 — LA PRESENTACIÓN NO INVENTA AFIRMACIONES PATRIMONIALES
 * ============================================================
 * Regla protegida:
 *
 *   «La interfaz debe mostrar exactamente lo que el modelo acredita: quién es
 *    titular, quién es principal fiscal, qué porcentaje está acreditado y qué
 *    relación es histórica. Nunca debe rellenar una ausencia de información
 *    con una conclusión patrimonial.»
 *
 * Seis conceptos distintos se presentaban como uno solo:
 *   1. titular económico canónico      (`propietarioId`)
 *   2. titular principal fiscal        (`propietarioPrincipalId`)
 *   3. cotitulares patrimoniales       (`titularesIds` + `titularidades`)
 *   4. porcentaje de titularidad       (`porcentajeTitularidad`)
 *   5. titularidad histórica           (`estado: 'CERRADA'`)
 *   6. ficha fiscal / campo LEGADO     (`datosFiscales`, `propietarioSecundarioId`)
 *
 * La fuente del porcentaje NO se duplica aquí: se verifica contra el motor
 * (`etiquetaPorcentaje`), que es la única que decide «Pendiente» vs. «N %».
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  VINCULOS,
  acreditaTitularidadActual,
  clasificarVinculoInmueble,
} from '../src/lib/presentacionTitularidad';
import {
  construirTitularidad,
  etiquetaPorcentaje,
  titularidadesVigentes,
} from '../src/utils/titularidadesEngine';
import type { Inmueble, Titularidad } from '../src/types';

const root = (rel: string) => resolve(process.cwd(), rel);

function inmueble(parcial: Partial<Inmueble> & { id: string }): Inmueble {
  return {
    direccion: 'Calle Mayor 1',
    ciudad: 'Alicante',
    precio: 900,
    estado: 'disponible',
    habitaciones: 3,
    banos: 2,
    superficie: 95,
    candidatosCount: 0,
    fianzaMeses: 2,
    ...parcial,
  } as Inmueble;
}

const tit = (propietarioId: string, porcentaje: number | null, estado: 'VIGENTE' | 'CERRADA' = 'VIGENTE') => {
  const t = construirTitularidad({ inmuebleId: 'A', propietarioId, porcentaje });
  return { ...t, estado } as Titularidad;
};

/** Lo que la interfaz escribiría para cada titular. */
const presentar = (ts: Titularidad[]) => ts.map((t) => `${t.propietarioId} — ${etiquetaPorcentaje(t)}`);

// ===========================================================================
describe('H11-1 — un titular con porcentaje null', () => {
  it('no aparece 100 % por ningún lado', () => {
    const salida = presentar([tit('pA', null)]);
    expect(salida).toEqual(['pA — Pendiente']);
    expect(salida.join(' ')).not.toContain('100');
  });

  it('un único titular vigente sigue sin acreditar cuota', () => {
    const vigentes = titularidadesVigentes([tit('pA', null)], 'A');
    expect(vigentes).toHaveLength(1);
    expect(etiquetaPorcentaje(vigentes[0])).toBe('Pendiente');
  });
});

// ===========================================================================
describe('H11-2 — dos titulares sin porcentaje', () => {
  it('ambos visibles y ambos pendientes: ni 50/50 ni 100/0', () => {
    const salida = presentar([tit('pA', null), tit('pB', null)]);
    expect(salida).toEqual(['pA — Pendiente', 'pB — Pendiente']);
    expect(salida.join(' ')).not.toContain('50');
    expect(salida.join(' ')).not.toContain('100');
  });
});

// ===========================================================================
describe('H11-3 — 60/40 explícito', () => {
  it('se muestran tal cual', () => {
    expect(presentar([tit('pA', 60), tit('pB', 40)])).toEqual(['pA — 60 %', 'pB — 40 %']);
  });
});

// ===========================================================================
describe('H11-4 — 60 + pendiente', () => {
  it('muestra 60 % y «Pendiente»; nunca completa 40', () => {
    const salida = presentar([tit('pA', 60), tit('pB', null)]);
    expect(salida).toEqual(['pA — 60 %', 'pB — Pendiente']);
    expect(salida.join(' ')).not.toContain('40');
  });
});

// ===========================================================================
describe('H11-5 — canónico ≠ principal fiscal', () => {
  const inm = inmueble({ id: 'A', propietarioId: 'pA', propietarioPrincipalId: 'pB' });

  it('no se colapsan: cada uno recibe su propio concepto', () => {
    expect(clasificarVinculoInmueble(inm, { id: 'pA' })?.codigo).toBe('TITULAR_CANONICO');
    expect(clasificarVinculoInmueble(inm, { id: 'pB' })?.codigo).toBe('PRINCIPAL_FISCAL');
  });

  it('el principal fiscal no se presenta como titularidad patrimonial actual', () => {
    expect(acreditaTitularidadActual(inm, { id: 'pA' })).toBe(true);
    expect(acreditaTitularidadActual(inm, { id: 'pB' })).toBe(false);
    expect(VINCULOS.PRINCIPAL_FISCAL.etiqueta).not.toMatch(/^Titular$/);
  });

  it('la divergencia no se oculta: ninguno desplaza al otro', () => {
    expect(clasificarVinculoInmueble(inm, { id: 'pA' })?.codigo).not.toBe(
      clasificarVinculoInmueble(inm, { id: 'pB' })?.codigo,
    );
  });
});

// ===========================================================================
describe('H11-6 — propietarioSecundarioId legado', () => {
  it('sin titularidad moderna NO se presenta como cotitular', () => {
    const inm = inmueble({ id: 'A', propietarioId: 'pA', propietarioSecundarioId: 'pB' });
    const v = clasificarVinculoInmueble(inm, { id: 'pB' });

    expect(v?.codigo).toBe('LEGADO_SECUNDARIO');
    expect(v?.acreditaTitularidadActual).toBe(false);
    expect(v?.etiqueta).not.toMatch(/titular/i);
  });

  it('si existe titularidad moderna, el índice manda y sí es titular', () => {
    const inm = inmueble({ id: 'A', propietarioId: 'pA', propietarioSecundarioId: 'pB', titularesIds: ['pA', 'pB'] });
    expect(clasificarVinculoInmueble(inm, { id: 'pB' })?.codigo).toBe('TITULAR_VIGENTE');
    expect(acreditaTitularidadActual(inm, { id: 'pB' })).toBe(true);
  });
});

// ===========================================================================
describe('H11-7 — ficha fiscal', () => {
  const inm = inmueble({
    id: 'A',
    datosFiscales: {
      propietarioPrincipal: { nombre: 'Ana', nifDni: '11111111A', direccion: 'X' },
      tieneSegundoPropietario: true,
      segundoPropietario: { nombre: 'Luis', nifDni: '22222222B', direccion: 'X' },
    },
  });

  it('una coincidencia de NIF es declarativa, no titularidad', () => {
    const v = clasificarVinculoInmueble(inm, { id: 'pZ', nif: '11111111A' });
    expect(v?.codigo).toBe('FICHA_FISCAL');
    expect(v?.acreditaTitularidadActual).toBe(false);
  });

  it('el segundo de la ficha fiscal tampoco acredita cotitularidad', () => {
    expect(acreditaTitularidadActual(inm, { id: 'pZ', nif: '22222222B' })).toBe(false);
  });

  it('no genera ningún porcentaje', () => {
    expect(JSON.stringify(VINCULOS.FICHA_FISCAL)).not.toContain('100');
    expect(presentar([])).toEqual([]);
  });

  // ORDEN 1 — ALCANCE AISLADO: el Portal Propietario queda EXPRESAMENTE fuera
  // de este bloque (se recuperará en el bloque de portales, junto con H8 y las
  // Rules). La adaptación no relaja H11: se protege la INVARIANTE —la ficha
  // fiscal no puede presentarse como cotitularidad y su etiqueta sale de la
  // fuente única— en lugar del copy de una pantalla diferida.
  it('la fuente del dato fiscal es el módulo puro (Portal Propietario diferido, no se copia el literal)', () => {
    expect(VINCULOS.FICHA_FISCAL.acreditaTitularidadActual).toBe(false);
    expect(VINCULOS.LEGADO_SECUNDARIO.acreditaTitularidadActual).toBe(false);
    expect(VINCULOS.FICHA_FISCAL.etiqueta).not.toMatch(/cotitular/i);
    expect(VINCULOS.LEGADO_SECUNDARIO.etiqueta).not.toMatch(/cotitular/i);
  });

  it('la ficha del inmueble cualifica el segundo propietario fiscal', () => {
    const sec = readFileSync(root('src/components/sections/InmueblesSection.tsx'), 'utf8');
    expect(sec).toContain('Cotitular (datos fiscales):');
    expect(sec).not.toMatch(/\n\s*Cotitular: <strong/);
  });
});

// ===========================================================================
describe('H11-8 — titularidad cerrada', () => {
  it('no se presenta como vigente', () => {
    const vigentes = titularidadesVigentes([tit('pA', 50, 'CERRADA'), tit('pB', 50, 'VIGENTE')], 'A');
    expect(vigentes.map((t) => t.propietarioId)).toEqual(['pB']);
  });

  it('el panel separa el histórico y no lo borra', () => {
    const panel = readFileSync(root('src/components/titularidades/TitularidadesPanel.tsx'), 'utf8');
    expect(panel).toContain('Histórico patrimonial');
    expect(panel).toContain('NUNCA se borra');
  });

  it('una titularidad cerrada conserva su porcentaje acreditado en el histórico', () => {
    expect(etiquetaPorcentaje(tit('pA', 60, 'CERRADA'))).toBe('60 %');
  });
});

// ===========================================================================
describe('H11-9 — tras una transmisión K.2 (A→B)', () => {
  const inm = inmueble({ id: 'A', propietarioId: 'pB', propietarioPrincipalId: 'pB', titularesIds: ['pB'] });
  const historial = [tit('pA', null, 'CERRADA'), tit('pB', null, 'VIGENTE')];

  it('B es el titular actual y A ya no lo es', () => {
    expect(acreditaTitularidadActual(inm, { id: 'pB' })).toBe(true);
    expect(acreditaTitularidadActual(inm, { id: 'pA' })).toBe(false);
    expect(titularidadesVigentes(historial, 'A').map((t) => t.propietarioId)).toEqual(['pB']);
  });

  it('A sigue existiendo en el histórico (no se borra)', () => {
    expect(historial.find((t) => t.propietarioId === 'pA')?.estado).toBe('CERRADA');
    expect(historial).toHaveLength(2);
  });

  it('el porcentaje de B sigue pendiente: la transmisión no lo inventa', () => {
    expect(etiquetaPorcentaje(historial[1])).toBe('Pendiente');
  });
});

// ===========================================================================
describe('H11-10 — tras un cierre H9 con cotitulares', () => {
  it('B permanece como titular vigente y A pasa al histórico', () => {
    const inm = inmueble({ id: 'A', titularesIds: ['pB'] });
    const historial = [tit('pA', null, 'CERRADA'), tit('pB', null, 'VIGENTE')];

    expect(acreditaTitularidadActual(inm, { id: 'pB' })).toBe(true);
    expect(acreditaTitularidadActual(inm, { id: 'pA' })).toBe(false);
    expect(titularidadesVigentes(historial, 'A').map((t) => t.propietarioId)).toEqual(['pB']);
  });
});

// ===========================================================================
describe('H11-11 — datos ausentes', () => {
  it('un inmueble sin ningún dato de titularidad no vincula a nadie', () => {
    const inm = inmueble({ id: 'A' });
    expect(clasificarVinculoInmueble(inm, { id: 'pA', nif: '11111111A' })).toBeNull();
    expect(acreditaTitularidadActual(inm, { id: 'pA' })).toBe(false);
  });

  it('identificadores vacíos o ausentes no generan falsos vínculos', () => {
    const inm = inmueble({ id: 'A', propietarioId: 'pA', titularesIds: ['pB'] });
    expect(clasificarVinculoInmueble(inm, {})).toBeNull();
    expect(clasificarVinculoInmueble(inm, { id: '' })).toBeNull();
    expect(clasificarVinculoInmueble(inm, { id: '   ' })).toBeNull();
    expect(clasificarVinculoInmueble(inm, { nif: '' })).toBeNull();
  });

  it('un NIF vacío no empareja con una ficha fiscal sin NIF', () => {
    const inm = inmueble({
      id: 'A',
      datosFiscales: { propietarioPrincipal: { nombre: 'Ana', nifDni: '', direccion: 'X' } },
    });
    expect(clasificarVinculoInmueble(inm, { id: 'pZ', nif: '' })).toBeNull();
  });

  it('el porcentaje de una titularidad ausente nunca se fabrica', () => {
    expect(etiquetaPorcentaje({ porcentajeTitularidad: null } as Titularidad)).toBe('Pendiente');
  });

  it('la clasificación es pura y determinista', () => {
    const inm = inmueble({ id: 'A', propietarioId: 'pA' });
    const copia = JSON.parse(JSON.stringify(inm));
    expect(clasificarVinculoInmueble(inm, { id: 'pA' })).toBe(clasificarVinculoInmueble(inm, { id: 'pA' }));
    expect(inm).toEqual(copia);
  });
});

// ===========================================================================
describe('H11 — integridad del contrato de presentación', () => {
  const fuente = readFileSync(root('src/lib/presentacionTitularidad.ts'), 'utf8');

  it('el módulo es puro: sin Firestore, sin red, sin permisos', () => {
    expect(fuente).not.toContain('firebase');
    expect(/\b(setDoc|getDoc|updateDoc|fetch|onSnapshot)\s*\(/.test(fuente)).toBe(false);
    expect(fuente).not.toContain('isMasterAdmin');
  });

  it('no duplica la lógica de porcentajes (una sola fuente de verdad)', () => {
    expect(fuente).not.toContain('porcentajeTitularidad');
    expect(fuente).not.toContain('100');
  });

  it('sólo el canónico y el índice moderno acreditan titularidad actual', () => {
    const acreditan = Object.values(VINCULOS)
      .filter((v) => v.acreditaTitularidadActual)
      .map((v) => v.codigo);
    expect(acreditan.sort()).toEqual(['TITULAR_CANONICO', 'TITULAR_VIGENTE']);
  });

  it('la sección de propietarios ya no colapsa los seis vínculos', () => {
    const sec = readFileSync(root('src/components/sections/PropietariosSection.tsx'), 'utf8');
    expect(sec).toContain('clasificarVinculoInmueble');
    expect(sec).not.toContain('inm.propietarioSecundarioId === propId');
  });
});
