/**
 * ORDEN 2 — Tests de `accesoGestores` (D1R §20.5).
 * Puros: NINGUNA escritura en Firestore/Storage (el módulo no importa Firebase).
 *
 * Cubre del mínimo de la orden: alta (validación), resolución
 * propietario/gestor, propietarios sin cuenta, múltiples propietarios,
 * aislamiento/anti-acceso-cruzado (specs + visibilidad), trazabilidad
 * (payloads GESTION_*) y asignación (coherencia tipoGestor↔perfil).
 */
import { describe, expect, it } from 'vitest';
import {
  ACCION_AUDITORIA_POR_EVENTO,
  ambitoConsultaDesdeEspejo,
  construirAuditoriaEventoGestion,
  especificarGestionesDeGestor,
  especificarGestionesDePropietario,
  filtrarGestionesVisibles,
  generarIdGestion,
  gestionVisiblePara,
  validarAltaGestion,
  validarCoherenciaActor,
  type ContextoVisibilidadGestiones,
  type ParametrosValidarAltaGestion,
} from './accesoGestores';
import { crearGestion, type GestionCartera } from './gestionesCartera';

const T0 = '2026-09-01T10:00:00.000Z';
const GESTOR = 'usr_gestor';
const TITULAR = 'usr_titular';
const PROP = 'prop_santiago';

function gestionBase(over: Partial<GestionCartera> = {}): GestionCartera {
  const r = crearGestion({
    id: 'gc_x', propietarioId: PROP, gestorUsuarioId: GESTOR,
    tipoGestor: 'GESTOR_PROFESIONAL', propietarioTieneCuenta: false,
    fecha: T0, actorId: 'master_1', ...over,
  });
  if (r.ok === false) throw new Error('fixture inválida: ' + r.error);
  return r.gestion;
}

function altaParams(over: Parameters<typeof validarAltaGestion>[0] extends never ? never : Partial<Parameters<typeof validarAltaGestion>[0]> = {}) {
  return {
    propietarioId: PROP,
    gestor: { id: GESTOR, estado: 'ACTIVO' as const },
    tipoGestor: 'GESTOR_PROFESIONAL' as const,
    propietarioExiste: true,
    gestionesExistentesDelGestor: [] as GestionCartera[],
    ...over,
  };
}

describe('accesoGestores — alta', () => {
  it('A1 · alta válida (gestor profesional + destino explícito existente)', () => {
    expect(validarAltaGestion(altaParams()).ok).toBe(true);
  });
  it('A2 · destino ausente se rechaza (F.5: nunca deducido de la cuenta ejecutora)', () => {
    for (const propietarioId of ['', '   ']) {
      const r = validarAltaGestion(altaParams({ propietarioId }));
      expect(r.ok).toBe(false);
      expect(r.errores.join(' ')).toMatch(/explícito/);
    }
  });
  it('A3 · propietario destino inexistente se rechaza', () => {
    const r = validarAltaGestion(altaParams({ propietarioExiste: false }));
    expect(r.ok).toBe(false);
  });
  it('A4 · gestor inexistente se rechaza', () => {
    expect(validarAltaGestion(altaParams({ gestor: null })).ok).toBe(false);
    expect(validarAltaGestion(altaParams({ gestor: undefined })).ok).toBe(false);
  });
  it('A5 · gestor no ACTIVO se rechaza en fail-closed', () => {
    for (const estado of ['PENDIENTE', 'BLOQUEADO', 'INACTIVO'] as const) {
      const r = validarAltaGestion(altaParams({ gestor: { id: GESTOR, estado } }));
      expect(r.ok).toBe(false);
      expect(r.errores.join(' ')).toMatch(/fail-closed/);
    }
  });
  it('A6 · coherencia tipoGestor↔perfil (D1R §24.5/6)', () => {
    // PROPIETARIO_GESTOR exige propietarioId propio…
    expect(
      validarAltaGestion(
        altaParams({ tipoGestor: 'PROPIETARIO_GESTOR', gestor: { id: GESTOR, estado: 'ACTIVO' } })
      ).ok
    ).toBe(false);
    expect(
      validarAltaGestion(
        altaParams({
          tipoGestor: 'PROPIETARIO_GESTOR',
          gestor: { id: GESTOR, estado: 'ACTIVO', propietarioId: 'prop_propia' },
        })
      ).ok
    ).toBe(true);
    // …GESTOR_PROFESIONAL lo prohíbe.
    expect(
      validarAltaGestion(
        altaParams({
          tipoGestor: 'GESTOR_PROFESIONAL',
          gestor: { id: GESTOR, estado: 'ACTIVO', propietarioId: 'prop_propia' },
        })
      ).ok
    ).toBe(false);
  });
  it('A7 · autogestión prohibida (D1R §18)', () => {
    const r = validarAltaGestion(
      altaParams({
        tipoGestor: 'PROPIETARIO_GESTOR',
        gestor: { id: GESTOR, estado: 'ACTIVO', propietarioId: PROP },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.errores.join(' ')).toMatch(/Autogestión/);
  });
  it('A8 · par duplicado no-REVOCADO se rechaza; con solo REVOCADA se permite', () => {
    const activa = gestionBase({ id: 'gc_act' });
    const r1 = validarAltaGestion(altaParams({ gestionesExistentesDelGestor: [activa] }));
    expect(r1.ok).toBe(false);
    expect(r1.errores.join(' ')).toMatch(/no-REVOCADA/);
    const revocada: GestionCartera = { ...activa, id: 'gc_rev', estado: 'REVOCADA' };
    expect(
      validarAltaGestion(altaParams({ gestionesExistentesDelGestor: [revocada] })).ok
    ).toBe(true);
  });
  it('A9 · mismo gestor + OTRO titular sí permite alta (múltiples propietarios)', () => {
    const otra = gestionBase({ id: 'gc_otra', propietarioId: 'prop_yolanda' });
    expect(
      validarAltaGestion(altaParams({ gestionesExistentesDelGestor: [otra] })).ok
    ).toBe(true);
  });
});

describe('accesoGestores — coherencia de actor', () => {
  const g = { id: 'gc_1', propietarioId: PROP, gestorUsuarioId: GESTOR };
  it('C1 · master siempre pasa (autorización en servidor)', () => {
    const r = validarCoherenciaActor({
      gestion: g, tipo: 'REVOCACION', actorId: 'master_1', titularUsuarioId: null, esMaster: true,
    });
    expect(r.ok).toBe(true);
  });
  it('C2 · actor vacío se rechaza (F.7: todo evento registra quién)', () => {
    const r = validarCoherenciaActor({
      gestion: g, tipo: 'REVOCACION', actorId: '', titularUsuarioId: TITULAR, esMaster: false,
    });
    expect(r.ok).toBe(false);
  });
  it('C3 · ACEPTACION solo por la cuenta del titular (S4)', () => {
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'ACEPTACION', actorId: TITULAR, titularUsuarioId: TITULAR, esMaster: false,
      }).ok
    ).toBe(true);
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'ACEPTACION', actorId: GESTOR, titularUsuarioId: TITULAR, esMaster: false,
      }).ok
    ).toBe(false);
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'ACEPTACION', actorId: 'otro', titularUsuarioId: null, esMaster: false,
      }).ok
    ).toBe(false);
  });
  it('C4 · CESION solo por el gestor; DEVOLUCION solo por el titular', () => {
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'CESION', actorId: GESTOR, titularUsuarioId: TITULAR, esMaster: false,
      }).ok
    ).toBe(true);
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'CESION', actorId: TITULAR, titularUsuarioId: TITULAR, esMaster: false,
      }).ok
    ).toBe(false);
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'DEVOLUCION', actorId: TITULAR, titularUsuarioId: TITULAR, esMaster: false,
      }).ok
    ).toBe(true);
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'DEVOLUCION', actorId: GESTOR, titularUsuarioId: TITULAR, esMaster: false,
      }).ok
    ).toBe(false);
    // Titular sin cuenta: solo el master registra la devolución.
    expect(
      validarCoherenciaActor({
        gestion: g, tipo: 'DEVOLUCION', actorId: GESTOR, titularUsuarioId: null, esMaster: false,
      }).ok
    ).toBe(false);
  });
  it('C5 · resto de eventos: partes sí, ajenos no', () => {
    for (const tipo of ['SUSPENSION', 'REACTIVACION', 'CAMBIO_PERMISOS', 'REVOCACION'] as const) {
      expect(
        validarCoherenciaActor({
          gestion: g, tipo, actorId: GESTOR, titularUsuarioId: TITULAR, esMaster: false,
        }).ok
      ).toBe(true);
      expect(
        validarCoherenciaActor({
          gestion: g, tipo, actorId: 'ajeno', titularUsuarioId: TITULAR, esMaster: false,
        }).ok
      ).toBe(false);
    }
  });
});

describe('accesoGestores — ámbito y consultas acotadas', () => {
  it('B1 · ámbito desde espejo: propio + L + E + unión L∪E', () => {
    const a = ambitoConsultaDesdeEspejo({
      propietarioId: 'prop_propia', carterasL: ['p1', 'p2'], carterasE: ['p2', 'p3'],
    });
    expect(a.propietarioPropio).toBe('prop_propia');
    expect(a.carterasL).toEqual(['p1', 'p2']);
    expect(a.carterasE).toEqual(['p2', 'p3']);
    expect(a.gestionadas).toEqual(['p1', 'p2', 'p3']);
  });
  it('B2 · ámbito sanea (no-titular, vacíos, duplicados, basura)', () => {
    const a = ambitoConsultaDesdeEspejo({
      carterasL: ['p1', 'p1', '', 1 as unknown as string], carterasE: undefined,
    });
    expect(a.propietarioPropio).toBeNull();
    expect(a.carterasL).toEqual(['p1']);
    expect(a.carterasE).toEqual([]);
    expect(a.gestionadas).toEqual(['p1']);
  });
  it('B3 · specs acotadas por propietario y por gestor (+ estado opcional)', () => {
    const s1 = especificarGestionesDePropietario(PROP);
    expect(s1.ok && s1.spec.filtros).toEqual([{ campo: 'propietarioId', op: '==', valor: PROP }]);
    const s2 = especificarGestionesDeGestor(GESTOR, 'ACTIVA');
    expect(s2.ok && s2.spec).toEqual({
      coleccion: 'gestiones_cartera',
      filtros: [
        { campo: 'gestorUsuarioId', op: '==', valor: GESTOR },
        { campo: 'estado', op: '==', valor: 'ACTIVA' },
      ],
    });
  });
  it('B4 · specs sin ámbito o estado inválido: fail-closed (jamás global)', () => {
    expect(especificarGestionesDePropietario('').ok).toBe(false);
    expect(especificarGestionesDeGestor('  ').ok).toBe(false);
    expect(especificarGestionesDeGestor(GESTOR, 'NOPE' as never).ok).toBe(false);
  });
});

describe('accesoGestores — visibilidad (defensa en profundidad)', () => {
  const g1 = gestionBase({ id: 'gc_1' });
  const g2 = gestionBase({ id: 'gc_2', propietarioId: 'prop_yolanda', gestorUsuarioId: 'usr_otro' });
  const todas = [g1, g2];
  it('V1 · admin ve todo; anónimo nada', () => {
    const admin: ContextoVisibilidadGestiones = { esAdmin: true, usuarioId: 'x', propietarioId: null };
    expect(filtrarGestionesVisibles(todas, admin)).toHaveLength(2);
    const anon: ContextoVisibilidadGestiones = { esAdmin: false, usuarioId: null, propietarioId: null };
    expect(filtrarGestionesVisibles(todas, anon)).toHaveLength(0);
  });
  it('V2 · titular ve su cartera; gestor ve sus designadas; cruce denegado', () => {
    const titular: ContextoVisibilidadGestiones = {
      esAdmin: false, usuarioId: TITULAR, propietarioId: PROP,
    };
    expect(filtrarGestionesVisibles(todas, titular).map((g) => g.id)).toEqual(['gc_1']);
    const gestor: ContextoVisibilidadGestiones = { esAdmin: false, usuarioId: GESTOR, propietarioId: null };
    expect(filtrarGestionesVisibles(todas, gestor).map((g) => g.id)).toEqual(['gc_1']);
    // Cruce: titular de OTRA cartera no ve gc_1; gestor de OTRA no ve gc_2.
    const otro: ContextoVisibilidadGestiones = {
      esAdmin: false, usuarioId: 'usr_otro', propietarioId: 'prop_yolanda',
    };
    expect(gestionVisiblePara(g1, otro)).toBe(false);
    expect(gestionVisiblePara(g2, otro)).toBe(true);
    expect(gestionVisiblePara(g2, gestor)).toBe(false);
  });
});

describe('accesoGestores — trazabilidad', () => {
  it('T1 · vocabulario cerrado: un accion por tipo de evento', () => {
    expect(Object.keys(ACCION_AUDITORIA_POR_EVENTO)).toHaveLength(10);
    expect(ACCION_AUDITORIA_POR_EVENTO.REVOCACION).toBe('GESTION_REVOCADA');
    expect(ACCION_AUDITORIA_POR_EVENTO.CAMBIO_PERMISOS).toBe('GESTION_PERMISO_MODIFICADO');
  });
  it('T2 · payload determinista con entidad gestion_cartera', () => {
    const g = gestionBase({ id: 'gc_9' });
    const evento = g.eventos[0]!;
    const a = construirAuditoriaEventoGestion({
      evento, gestion: g,
      actor: { id: 'master_1', email: 'master@x.es', nombre: 'Master' },
      resultado: 'EXITO',
    });
    expect(a.entidadAfectada).toBe('gestion_cartera');
    expect(a.idAfectado).toBe('gc_9');
    expect(a.accion).toBe('GESTION_ALTA');
    expect(a.fechaHora).toBe(evento.fecha);
    expect(a.detalles).toMatchObject({
      gestionId: 'gc_9', propietarioId: PROP, gestorUsuarioId: GESTOR,
      evento: 'ALTA', estadoAnterior: 'PENDIENTE_ACEPTACION', estadoNuevo: 'PENDIENTE_ACEPTACION',
    });
  });
  it('T3 · generarIdGestion determinista con inyección', () => {
    const azar = () => 0.5;
    expect(generarIdGestion(azar, 1000)).toBe(generarIdGestion(azar, 1000));
    expect(generarIdGestion(azar, 1000)).toMatch(/^gc_1000_/);
  });
});
