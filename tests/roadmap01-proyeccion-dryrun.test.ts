import { describe, expect, it } from 'vitest';
import { crearGestion, registrarEvento, type GestionCartera } from '../src/lib/gestionesCartera';
import { auditarProyeccionCarteras } from '../src/lib/auditoriaProyeccionCarteras';
const F = '2026-09-28T10:00:00Z';
function gestion(id: string, propietarioId: string, inmuebleIds: string[] = []): GestionCartera {
  const r = crearGestion({ id, propietarioId, gestorUsuarioId:'u', tipoGestor:'GESTOR_PROFESIONAL',
    inmuebleIds, propietarioTieneCuenta:false, permiso:'LECTURA_ESCRITURA', fecha:F, actorId:'master' });
  if (!('gestion' in r)) throw new Error(r.error);
  const a = registrarEvento(r.gestion, {tipo:'ACTIVACION',fecha:F,actorId:'master'});
  if (!('gestion' in a)) throw new Error(a.error);
  return a.gestion;
}

describe('ROADMAP-01 · inspección read-only de proyecciones existentes (sin Firebase)', () => {
  it('detecta espejo ampliado por delegación parcial aun con propietario válido', () => {
    const g = gestion('g','A',['inm_1']);
    const r = auditarProyeccionCarteras('u',[g],{carterasL:['A'],carterasE:['A']},new Set(['A']));
    expect(r.esperado).toEqual({carterasL:[],carterasE:[]});
    expect(r.hallazgos.map(h=>h.codigo)).toContain('GESTION_PARCIAL');
    expect(r.hallazgos.filter(h=>h.codigo==='ESPEJO_SOBREAUTORIZADO')).toHaveLength(2);
    expect(r.requiereRevisionAntesDeUsar).toBe(true);
  });
  it('detecta ajenos, inexistentes, duplicados, pendientes y revocados en espejo', () => {
    const g = gestion('g','A');
    const rev = registrarEvento(g,{tipo:'REVOCACION',actorId:'master',fecha:F,conservarLecturaHistorica:false});
    if (!('gestion' in rev)) throw new Error(rev.error);
    const r = auditarProyeccionCarteras('u',[rev.gestion,gestion('g2','A'),gestion('g3','A'),
      gestion('g4','inexistente'),{...gestion('g5','B'),gestorUsuarioId:'otro'}],
      {carterasL:['B','inexistente','A'],carterasE:['B']},new Set(['A','B']));
    expect(r.hallazgos.map(h=>h.codigo)).toEqual(expect.arrayContaining([
      'GESTION_DUPLICADA','PROPIETARIO_INEXISTENTE','GESTOR_INCORRECTO','ESPEJO_SOBREAUTORIZADO'
    ]));
    expect(r.esperado.carterasE).toEqual(['A']);
  });
  it('un espejo exacto de gestor propietario o profesional no amplía su propio titular', () => {
    const r = auditarProyeccionCarteras('u',[gestion('g','A')],{carterasL:['A'],carterasE:['A']},new Set(['A']));
    expect(r.hallazgos).toEqual([]);
    expect(r.requiereRevisionAntesDeUsar).toBe(false);
  });
});
