/**
 * INTEGRACIÓN Arena C ↔ D1R/D2b — tests del puente `patrimonialIntegracion`.
 *
 * Demuestra:
 *  · encaje exacto y reversible de las modalidades de C en el `TipoGestor`
 *    canónico de D1R (GESTOR_PROPIETARIO ↔ PROPIETARIO_GESTOR), con
 *    `GESTOR_PATRIMONIAL` conservado y `GESTOR_INMUEBLES` intacto;
 *  · S3: ninguna modalidad concede acceso por sí misma;
 *  · el contexto de destino se deriva SOLO del ámbito D2b (titularidad ∪
 *    carteras gestionadas), sin destinos implícitos ni deducciones;
 *  · combinado con `resolverDestinoImportacion` de C: destino ausente,
 *    no permitido, ambiguo y válido se resuelven como especifica C;
 *  · `estadoDatos` (COMPLETO/INCOMPLETO/BLOQUEADO + camposFaltantes) sigue
 *    separado de `estadoAcceso` (SIN_CUENTA/INVITADO/ACTIVO);
 *  · el puente es puro: sin Firebase, sin colección `personas`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contextoDestinoDesdeAmbito,
  encajarModalidadEnD1R,
  tipoGestorD1RAModalidad,
} from '../src/lib/patrimonialIntegracion';
import {
  MODALIDADES_USO,
  evaluarCompletitud,
  resolverDestinoImportacion,
  type ReferenciaPropietario,
} from '../src/features/patrimonial/index.ts';
import { ROL_GESTOR_PATRIMONIAL, ROL_GESTOR_INMUEBLES_OPERATIVO } from '../src/lib/gestionesCartera';

const PROPS: Pick<ReferenciaPropietario, 'id' | 'nombre'>[] = [
  { id: 'prop_A', nombre: 'Titular A' },
  { id: 'prop_X', nombre: 'Titular X' },
  { id: 'prop_Y', nombre: 'Titular Y' },
];

describe('Puente C↔D1R · modalidades', () => {
  it('M1 · las tres modalidades encajan en el modelo canónico', () => {
    expect(MODALIDADES_USO).toEqual(['PROPIETARIO', 'GESTOR_PROPIETARIO', 'GESTOR_PROFESIONAL']);
    expect(encajarModalidadEnD1R('PROPIETARIO')).toEqual({
      modalidad: 'PROPIETARIO', tipoGestor: null, rolGestor: null, requiereCuentaParaAcceso: true,
    });
    expect(encajarModalidadEnD1R('GESTOR_PROPIETARIO').tipoGestor).toBe('PROPIETARIO_GESTOR');
    expect(encajarModalidadEnD1R('GESTOR_PROFESIONAL').tipoGestor).toBe('GESTOR_PROFESIONAL');
    // Ambas modalidades de gestión usan el rol canónico conservado:
    expect(encajarModalidadEnD1R('GESTOR_PROPIETARIO').rolGestor).toBe(ROL_GESTOR_PATRIMONIAL);
    expect(encajarModalidadEnD1R('GESTOR_PROFESIONAL').rolGestor).toBe(ROL_GESTOR_PATRIMONIAL);
  });
  it('M2 · el encaje es reversible para las modalidades de gestión', () => {
    expect(tipoGestorD1RAModalidad('PROPIETARIO_GESTOR')).toBe('GESTOR_PROPIETARIO');
    expect(tipoGestorD1RAModalidad('GESTOR_PROFESIONAL')).toBe('GESTOR_PROFESIONAL');
  });
  it('M3 · S3: ninguna modalidad concede acceso; GESTOR_INMUEBLES no se toca', () => {
    for (const modalidad of MODALIDADES_USO) {
      expect(encajarModalidadEnD1R(modalidad).requiereCuentaParaAcceso).toBe(true);
    }
    // El puente no menciona ni modifica el rol operativo existente:
    const fuente = readFileSync(resolve(__dirname, '../src/lib/patrimonialIntegracion.ts'), 'utf8');
    expect(fuente).not.toContain(ROL_GESTOR_INMUEBLES_OPERATIVO);
    // Ni crea una segunda fuente de verdad:
    expect(fuente).not.toMatch(/\bpersonas\b/);
    expect(fuente).not.toMatch(/from\s+'firebase/);
  });
});

describe('Puente C↔D2b · contexto de destino desde el ámbito', () => {
  it('A1 · permitidos = titularidad propia ∪ carteras gestionadas, deduplicado', () => {
    const ctx = contextoDestinoDesdeAmbito(PROPS, {
      propietarioId: 'prop_A',
      propietariosGestionados: ['prop_X', 'prop_Y', 'prop_X'],
    });
    expect(ctx.propietariosPermitidosIds).toEqual(['prop_A', 'prop_X', 'prop_Y']);
    expect(ctx.propietarios).toBe(PROPS);
  });
  it('A2 · ámbito vacío ⇒ ningún permitido (sin destinos implícitos)', () => {
    expect(contextoDestinoDesdeAmbito(PROPS, {}).propietariosPermitidosIds).toEqual([]);
    expect(contextoDestinoDesdeAmbito(PROPS, { propietarioId: '  ' }).propietariosPermitidosIds).toEqual([]);
  });
  it('A3 · sin propietario propio: sólo carteras (gestor profesional sin inmuebles propios)', () => {
    const ctx = contextoDestinoDesdeAmbito(PROPS, { propietariosGestionados: ['prop_X'] });
    expect(ctx.propietariosPermitidosIds).toEqual(['prop_X']);
  });
});

describe('Puente C↔D2b · destino explícito con el resolver de C', () => {
  const ctx = contextoDestinoDesdeAmbito(PROPS, {
    propietarioId: 'prop_A',
    propietariosGestionados: ['prop_X'],
  });
  it('D1 · destino ausente: ni el único propietario se deduce', () => {
    const unico = contextoDestinoDesdeAmbito([PROPS[0]], { propietarioId: 'prop_A' });
    expect(resolverDestinoImportacion(null, unico).estado).toBe('AUSENTE');
    expect(resolverDestinoImportacion('', unico).estado).toBe('AUSENTE');
  });
  it('D2 · fuera del ámbito ⇒ NO_PERMITIDO; inexistente ⇒ NO_ENCONTRADO', () => {
    expect(resolverDestinoImportacion('prop_Y', ctx).estado).toBe('NO_PERMITIDO');
    expect(resolverDestinoImportacion('prop_Z', ctx).estado).toBe('NO_ENCONTRADO');
  });
  it('D3 · duplicidad en el contexto ⇒ AMBIGUO; destino lícito ⇒ VALIDO', () => {
    const ambiguo = contextoDestinoDesdeAmbito([...PROPS, PROPS[1]], { propietariosGestionados: ['prop_X'] });
    expect(resolverDestinoImportacion('prop_X', ambiguo).estado).toBe('AMBIGUO');
    const ok = resolverDestinoImportacion('prop_X', ctx);
    expect(ok.estado).toBe('VALIDO');
    if (ok.estado === 'VALIDO') expect(ok.propietario.nombre).toBe('Titular X');
  });
});

describe('Puente · separación estadoAcceso / estadoDatos (S6)', () => {
  it('E1 · la evaluación de datos no incorpora jamás campos de acceso', () => {
    const evaluacion = evaluarCompletitud(
      { nombre: 'x', nifCif: '12345678A', estadoAcceso: 'ACTIVO', cuentaId: 'c1' },
      { politica: { id: 'p1', camposRequeridos: ['nombre', 'nifCif', 'email'] }, bloqueos: [], revisiones: [] }
    );
    expect(evaluacion.estadoDatos).toBe('INCOMPLETO');
    expect(evaluacion.camposFaltantes).toEqual(['email']);
    // estadoDatos es el único "estado" del resultado; acceso/cuenta no entran:
    expect(Object.keys(evaluacion).sort()).toEqual(['camposFaltantes', 'estadoDatos', 'incidencias', 'politicaId']);
  });
  it('E2 · sin política válida ⇒ BLOQUEADO (no se asume completitud)', () => {
    const evaluacion = evaluarCompletitud({ nombre: 'x' }, null);
    expect(evaluacion.estadoDatos).toBe('BLOQUEADO');
    expect(evaluacion.incidencias.some((i) => i.codigo === 'POLITICA_NO_DISPONIBLE')).toBe(true);
  });
});
