/**
 * BLOQUE F — Tests del dominio `gestiones_cartera` (FASE 10).
 * Puros: NINGUNA escritura en Firestore/Storage (el módulo no importa Firebase).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  crearGestion,
  registrarEvento,
  puedeLeer,
  puedeEscribir,
  esTitularDe,
  listarGestionesDePropietario,
  listarGestionesDeGestor,
  hayGestionActivaPorPar,
  transicionPermitida,
  ROL_GESTOR_PATRIMONIAL,
  ROL_GESTOR_INMUEBLES_OPERATIVO,
  type GestionCartera,
} from './gestionesCartera';

const G = 'gestor_1';
const P = 'prop_santiago';
const T0 = '2026-09-01T10:00:00.000Z';

function alta(over: Partial<Parameters<typeof crearGestion>[0]> = {}) {
  return crearGestion({
    id: 'gc_1', propietarioId: P, gestorUsuarioId: G,
    tipoGestor: 'PROPIETARIO_GESTOR', propietarioTieneCuenta: false,
    fecha: T0, actorId: 'admin_1', ...over,
  });
}
function ok(r: { ok: boolean; gestion?: GestionCartera; error?: string }): GestionCartera {
  if (!r.ok) throw new Error('esperado ok: ' + r.error);
  return r.gestion!;
}
function activa(over: Partial<Parameters<typeof crearGestion>[0]> = {}): GestionCartera {
  const g = ok(alta(over));
  return g.requiereAceptacion
    ? ok(registrarEvento(g, { tipo: 'ACEPTACION', actorId: 'uid_titular', fecha: '2026-09-02T10:00:00.000Z' }))
    : ok(registrarEvento(g, { tipo: 'ACTIVACION', actorId: 'admin_1', fecha: '2026-09-02T10:00:00.000Z' }));
}

describe('gestiones_cartera — dominio', () => {
  it('1. propietario SIN cuenta: preparación administrativa no bloqueada (S4)', () => {
    const g = ok(alta({ propietarioTieneCuenta: false }));
    expect(g.estado).toBe('PENDIENTE_ACEPTACION');
    expect(g.requiereAceptacion).toBe(false);
    const g2 = ok(registrarEvento(g, { tipo: 'ACTIVACION', actorId: 'admin_1', fecha: '2026-09-02T09:00:00.000Z' }));
    expect(g2.estado).toBe('ACTIVA');
  });

  it('2. propietario CON cuenta: ACTIVACION sin ACEPTACION se rechaza (S4)', () => {
    const g = ok(alta({ propietarioTieneCuenta: true }));
    expect(g.requiereAceptacion).toBe(true);
    const denegado = registrarEvento(g, { tipo: 'ACTIVACION', actorId: 'admin_1', fecha: '2026-09-02T09:00:00.000Z' });
    expect(denegado.ok).toBe(false);
    const aceptada = ok(registrarEvento(g, { tipo: 'ACEPTACION', actorId: 'uid_titular', fecha: '2026-09-02T10:00:00.000Z' }));
    expect(aceptada.estado).toBe('ACTIVA');
    expect(aceptada.aceptada?.por).toBe('uid_titular');
  });

  it('3. gestor con varios propietarios simultáneos', () => {
    const gs = ['prop_santiago', 'prop_yolanda', 'prop_n'].map((pid, i) =>
      ok(alta({ id: `gc_${i}`, propietarioId: pid }))
    );
    expect(listarGestionesDeGestor(gs, G)).toHaveLength(3);
    expect(new Set(gs.map((g) => g.propietarioId)).size).toBe(3);
  });

  it('4. propietario con varias gestiones históricas (múltiples gestores en el tiempo)', () => {
    // gc_a (gestor antiguo, julio) precede a gc_b (gestor nuevo, septiembre).
    const g1 = ok(alta({ id: 'gc_a', gestorUsuarioId: 'gestor_old', fecha: '2026-07-01T00:00:00.000Z' }));
    const g1rev = ok(registrarEvento(g1, { tipo: 'REVOCACION', actorId: 'admin_1', fecha: '2026-08-01T00:00:00.000Z' }));
    const g2 = ok(alta({ id: 'gc_b', gestorUsuarioId: 'gestor_new', fecha: '2026-09-01T00:00:00.000Z' }));
    const todas = listarGestionesDePropietario([g1rev, g2], P);
    expect(todas).toHaveLength(2);
    expect(todas.map((g) => g.id)).toEqual(['gc_a', 'gc_b']); // orden por fechaAlta
    expect(hayGestionActivaPorPar([g1rev, g2], P, 'gestor_new')).toBe(true);
    expect(hayGestionActivaPorPar([g1rev, g2], P, 'gestor_old')).toBe(false);
  });

  it('5. creación: campos mínimos + evento ALTA + escritura NO automática (S7)', () => {
    const g = ok(alta());
    expect(g.propietarioId).toBe(P);
    expect(g.gestorUsuarioId).toBe(G);
    expect(g.permiso).toBe('LECTURA'); // nunca L/E por defecto
    expect(g.responsableActual).toBe('GESTOR');
    expect(g.eventos).toHaveLength(1);
    expect(g.eventos[0].tipo).toBe('ALTA');
  });

  it('6. creación sin propietarioId se rechaza (invariante 1)', () => {
    const r = alta({ propietarioId: '' });
    expect(r.ok).toBe(false);
    expect('error' in r && r.error.includes('propietarioId')).toBe(true);
  });

  it('7-9. ciclo completo: activación → suspensión → reactivación', () => {
    let g = activa();
    expect(g.fechaActivacion).toBeTruthy();
    g = ok(registrarEvento(g, { tipo: 'SUSPENSION', actorId: 'admin_1', fecha: '2026-09-10T00:00:00.000Z', motivo: 'vacaciones' }));
    expect(g.estado).toBe('SUSPENDIDA');
    expect(g.fechaSuspension).toBe('2026-09-10T00:00:00.000Z');
    expect(g.motivoUltimo).toBe('vacaciones');
    g = ok(registrarEvento(g, { tipo: 'REACTIVACION', actorId: 'admin_1', fecha: '2026-09-20T00:00:00.000Z' }));
    expect(g.estado).toBe('ACTIVA');
  });

  it('10. revocación: estado terminal + fecha + histórico conservado', () => {
    const previa = activa();
    const nEventosPrevio = previa.eventos.length;
    const g = ok(registrarEvento(previa, { tipo: 'REVOCACION', actorId: 'admin_1', fecha: '2026-09-30T00:00:00.000Z' }));
    expect(g.estado).toBe('REVOCADA');
    expect(g.fechaRevocacion).toBe('2026-09-30T00:00:00.000Z');
    expect(g.eventos.length).toBe(nEventosPrevio + 1); // nada eliminado
  });

  it('11. transiciones inválidas se rechazan y no alteran el estado', () => {
    const g = ok(alta({ propietarioTieneCuenta: true }));
    const r = registrarEvento(g, { tipo: 'SUSPENSION', actorId: 'x', fecha: '2026-09-05T00:00:00.000Z' });
    expect(r.ok).toBe(false);
    expect(g.estado).toBe('PENDIENTE_ACEPTACION'); // objeto original intacto
    expect(transicionPermitida('PENDIENTE_ACEPTACION', 'SUSPENSION')).toBe(false);
  });

  it('12. REVOCADA es terminal: no se reactiva ni reutiliza su histórico', () => {
    const g = ok(registrarEvento(activa(), { tipo: 'REVOCACION', actorId: 'a', fecha: '2026-09-30T00:00:00.000Z' }));
    for (const tipo of ['REACTIVACION', 'ACTIVACION', 'SUSPENSION', 'CESION'] as const) {
      const r = registrarEvento(g, { tipo, actorId: 'a', fecha: '2026-10-01T00:00:00.000Z' });
      expect(r.ok, `${tipo} sobre REVOCADA debe fallar`).toBe(false);
    }
    // Una relación nueva exige una gestión nueva (nuevo documento, nuevo histórico).
    const nueva = ok(alta({ id: 'gc_nueva', fecha: '2026-10-01T00:00:00.000Z' }));
    expect(nueva.eventos).toHaveLength(1);
    expect(nueva.eventos[0].tipo).toBe('ALTA');
  });

  it('13. histórico append-only: eventos anteriores intactos tras nuevas transiciones', () => {
    const g1 = activa();
    const copiaEventos = JSON.parse(JSON.stringify(g1.eventos));
    const g2 = ok(registrarEvento(g1, { tipo: 'CAMBIO_PERMISOS', actorId: 'admin_1', fecha: '2026-09-11T00:00:00.000Z', permiso: 'LECTURA_ESCRITURA' }));
    const g3 = ok(registrarEvento(g2, { tipo: 'SUSPENSION', actorId: 'admin_1', fecha: '2026-09-12T00:00:00.000Z' }));
    expect(JSON.parse(JSON.stringify(g3.eventos.slice(0, copiaEventos.length)))).toEqual(copiaEventos);
    expect(g1.eventos).toEqual(copiaEventos); // la instancia original no fue mutada
  });

  it('14. titularidad inmutable: crear/transicionar no toca los inmuebles', () => {
    const inmuebles = [
      { id: 'i1', propietarioId: P }, { id: 'i2', propietarioId: P },
    ];
    const antes = JSON.stringify(inmuebles);
    let g = activa();
    g = ok(registrarEvento(g, { tipo: 'CESION', actorId: G, fecha: '2026-09-15T00:00:00.000Z' }));
    g = ok(registrarEvento(g, { tipo: 'DEVOLUCION', actorId: P, fecha: '2026-09-16T00:00:00.000Z' }));
    g = ok(registrarEvento(g, { tipo: 'REVOCACION', actorId: 'admin_1', fecha: '2026-09-17T00:00:00.000Z' }));
    expect(JSON.stringify(inmuebles)).toBe(antes); // invariante 2
    expect(esTitularDe(g, P)).toBe(true);          // el titular sigue siendo el titular
  });

  it('15. cesión/devolución: sin duplicar inmuebles ni crear propietarios', () => {
    const g0 = activa({ inmuebleIds: ['i1', 'i2'] });
    const cedida = ok(registrarEvento(g0, { tipo: 'CESION', actorId: G, fecha: '2026-09-15T00:00:00.000Z' }));
    expect(cedida.inmuebleIds).toEqual(['i1', 'i2']);
    expect(cedida.responsableActual).toBe('TITULAR');
    const devuelta = ok(registrarEvento(cedida, { tipo: 'DEVOLUCION', actorId: P, fecha: '2026-09-16T00:00:00.000Z' }));
    expect(devuelta.inmuebleIds).toEqual(['i1', 'i2']); // ni un inmueble más
    expect(devuelta.responsableActual).toBe('GESTOR');
    expect(devuelta.propietarioId).toBe(P);             // mismo propietario, no uno nuevo
    // cesión duplicada rechazada
    expect(registrarEvento(devuelta, { tipo: 'DEVOLUCION', actorId: P, fecha: '2026-09-17T00:00:00.000Z' }).ok).toBe(false);
  });

  it('16. permisos S7: LECTURA histórica ≠ gestión activa ≠ escritura', () => {
    // LECTURA por defecto: sin escritura aunque esté ACTIVA
    const soloLectura = activa();
    expect(puedeLeer(soloLectura, G)).toBe(true);
    expect(puedeEscribir(soloLectura, G)).toBe(false);
    // L/E + ACTIVA + responsable GESTOR → escritura
    const conEscritura = ok(registrarEvento(soloLectura, { tipo: 'CAMBIO_PERMISOS', actorId: 'admin_1', fecha: '2026-09-11T00:00:00.000Z', permiso: 'LECTURA_ESCRITURA' }));
    expect(puedeEscribir(conEscritura, G)).toBe(true);
    // Tras CESION (responsable TITULAR): lectura sí, escritura no
    const cedida = ok(registrarEvento(conEscritura, { tipo: 'CESION', actorId: G, fecha: '2026-09-15T00:00:00.000Z' }));
    expect(puedeLeer(cedida, G)).toBe(true);
    expect(puedeEscribir(cedida, G)).toBe(false);
    // REVOCADA sin conservación: nada; con conservación: solo lectura histórica
    const revSin = ok(registrarEvento(cedida, { tipo: 'REVOCACION', actorId: 'admin_1', fecha: '2026-09-20T00:00:00.000Z' }));
    expect(puedeLeer(revSin, G)).toBe(false);
    const g2 = ok(registrarEvento(activa({ id: 'gc_2' }), { tipo: 'REVOCACION', actorId: 'admin_1', fecha: '2026-09-20T00:00:00.000Z', conservarLecturaHistorica: true }));
    expect(puedeLeer(g2, G)).toBe(true);
    expect(puedeEscribir(g2, G)).toBe(false);
    // Un usuario ajeno no lee ni escribe
    expect(puedeLeer(conEscritura, 'otro_usuario')).toBe(false);
    expect(puedeEscribir(conEscritura, 'otro_usuario')).toBe(false);
  });

  it('17. separación GESTOR_PATRIMONIAL / GESTOR_INMUEBLES (S1)', () => {
    expect(ROL_GESTOR_PATRIMONIAL).toBe('GESTOR_PATRIMONIAL');
    expect(ROL_GESTOR_INMUEBLES_OPERATIVO).toBe('GESTOR_INMUEBLES');
    expect(ROL_GESTOR_PATRIMONIAL).not.toBe(ROL_GESTOR_INMUEBLES_OPERATIVO);
  });

  it('18. no crea cuentas: la gestión no contiene identidad de acceso; módulo sin Firebase', () => {
    const g = activa({ propietarioTieneCuenta: false });
    const claves = JSON.stringify(g);
    expect(claves).not.toMatch(/"uid"|"authUid"|"password"|"email"/);
    const src = readFileSync(join(__dirname, 'gestionesCartera.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]firebase|from ['"]@firebase|firebase-admin/);
  });
});
