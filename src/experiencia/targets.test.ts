/**
 * CAPA TRANSVERSAL §6 — FASE 2 · Tests de localización/resaltado de targets y de recorridos (motor).
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { PERMISOS_SISTEMA, ROLES_PREDEFINIDOS } from '../types';
import {
  ATRIBUTO_TOUR,
  ID_OVERLAY_RESALTADO,
  PANTALLAS_PORTAL,
  RECORRIDO_INVITAR_INQUILINO,
  RECORRIDO_PORTAL_INQUILINO,
  TUTORIALES_REGISTRO,
  TUTORIAL_LIQUIDACION,
  avanzar,
  cancelar,
  contextoDesdeUsuario,
  esVisible,
  evaluarPaso,
  evaluarTutorial,
  finalizar,
  hayResaltadoActivo,
  iniciarTutorial,
  limpiarResaltado,
  localizarTarget,
  pasoActual,
  resaltarTarget,
  saltar,
  selectorTour,
  targetVisible,
  tutorialesDisponibles,
} from './index';

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const admin = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const gestor = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['GESTOR_INMUEBLES'], permisos: rol('GESTOR_INMUEBLES').permisos };
const propietario = { tipoPerfil: 'PROPIETARIO' as const, roles: ['PROPIETARIO_ESTANDAR'], permisos: rol('PROPIETARIO_ESTANDAR').permisos };
const inquilino = { tipoPerfil: 'INQUILINO' as const, roles: ['INQUILINO_PORTAL'], permisos: rol('INQUILINO_PORTAL').permisos };

function montar(html: string): void {
  document.body.innerHTML = html;
}

afterEach(() => {
  limpiarResaltado();
  document.body.innerHTML = '';
});

describe('§6 F2 · Targets: localizar, visibilidad y resaltado', () => {
  it('target visible → se resalta con un overlay separado, sin tocar el elemento; limpiar lo elimina (idempotente)', () => {
    montar(`<nav><button ${ATRIBUTO_TOUR}="nav-tesoreria" class="x" id="b1">Tesorería</button></nav>`);
    const boton = document.getElementById('b1')!;
    const htmlAntes = boton.outerHTML;
    const r = resaltarTarget(selectorTour('nav-tesoreria'));
    expect(r.estado).toBe('RESALTADO');
    expect(r.elemento).toBe(boton);
    const ov = document.getElementById(ID_OVERLAY_RESALTADO)!;
    expect(ov).toBeTruthy();
    expect(ov.style.pointerEvents).toBe('none'); // nunca bloquea la interacción
    expect(ov.getAttribute('aria-hidden')).toBe('true');
    expect(ov.getAttribute('data-target')).toBe('nav-tesoreria');
    expect(boton.outerHTML).toBe(htmlAntes); // DOM funcional intacto
    expect(hayResaltadoActivo()).toBe(true);
    limpiarResaltado();
    limpiarResaltado();
    expect(document.getElementById(ID_OVERLAY_RESALTADO)).toBeNull();
    expect(hayResaltadoActivo()).toBe(false);
  });

  it('target inexistente → NO_ENCONTRADO sin overlay; selector inválido → tratado como inexistente', () => {
    montar('<div></div>');
    expect(localizarTarget(selectorTour('nada'))).toBeNull();
    expect(resaltarTarget(selectorTour('nada')).estado).toBe('NO_ENCONTRADO');
    expect(resaltarTarget('[[[').estado).toBe('NO_ENCONTRADO');
    expect(targetVisible('[[[')).toBe(false);
    expect(hayResaltadoActivo()).toBe(false);
  });

  it('target oculto (hidden, display:none, visibility:hidden, ancestro oculto o desconectado) → NO_VISIBLE sin overlay', () => {
    montar(`
      <button ${ATRIBUTO_TOUR}="h1" hidden>a</button>
      <button ${ATRIBUTO_TOUR}="h2" style="display:none">b</button>
      <button ${ATRIBUTO_TOUR}="h3" style="visibility:hidden">c</button>
      <div style="display:none"><button ${ATRIBUTO_TOUR}="h4">d</button></div>
      <button ${ATRIBUTO_TOUR}="ok">e</button>`);
    for (const id of ['h1', 'h2', 'h3', 'h4']) {
      expect(targetVisible(selectorTour(id))).toBe(false);
      expect(resaltarTarget(selectorTour(id)).estado).toBe('NO_VISIBLE');
    }
    expect(hayResaltadoActivo()).toBe(false);
    expect(targetVisible(selectorTour('ok'))).toBe(true);
    const suelto = document.createElement('button');
    expect(esVisible(suelto)).toBe(false);
  });

  it('un solo resaltado activo: resaltar otro target sustituye al anterior; si el elemento desaparece se limpia al reposicionar', () => {
    montar(`<button ${ATRIBUTO_TOUR}="a">a</button><button ${ATRIBUTO_TOUR}="b">b</button>`);
    resaltarTarget(selectorTour('a'));
    resaltarTarget(selectorTour('b'));
    expect(document.querySelectorAll(`#${ID_OVERLAY_RESALTADO}`)).toHaveLength(1);
    expect(document.getElementById(ID_OVERLAY_RESALTADO)!.getAttribute('data-target')).toBe('b');
    document.querySelector(selectorTour('b'))!.remove();
    window.dispatchEvent(new Event('resize'));
    expect(hayResaltadoActivo()).toBe(false);
  });

  it('cambio de sección: el target del paso solo existe en su pantalla; evaluarPaso lo señala hasta que el host la pinta', () => {
    const ctx = contextoDesdeUsuario(admin, 'inicio');
    const paso = RECORRIDO_INVITAR_INQUILINO.steps[1]; // tab Invitaciones (solo existe en la sección inquilinos)
    montar('<div>pantalla inicio</div>');
    expect(evaluarPaso(paso, 1, 5, ctx, { targetVisible }).motivos).toEqual(['TARGET_NO_VISIBLE']);
    montar(`<button ${ATRIBUTO_TOUR}="inquilinos-tab-invitaciones">Invitaciones</button>`);
    expect(evaluarPaso(paso, 1, 5, ctx, { targetVisible }).motivos).toEqual([]);
  });
});

describe('§6 F2 · Recorridos reales', () => {
  const codigos = new Set(PERMISOS_SISTEMA.map((p) => p.codigo));

  it('registro: 3 tutoriales con ids únicos; rutas y permisos reales según su host; targets con el atributo data-tour', () => {
    const ids = TUTORIALES_REGISTRO.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
    for (const t of TUTORIALES_REGISTRO) {
      const rutas = (t.host ?? 'ERP') === 'PORTAL_INQUILINO' ? PANTALLAS_PORTAL : null;
      for (const p of t.steps) {
        if (p.route && rutas) expect(rutas).toContain(p.route);
        if (p.requiredPermission) expect(codigos.has(p.requiredPermission)).toBe(true);
        if (p.target) expect(p.target.startsWith(`[${ATRIBUTO_TOUR}=`)).toBe(true);
      }
    }
    // El recorrido del portal no exige permisos de gestión (el inquilino no los tiene)
    expect(RECORRIDO_PORTAL_INQUILINO.steps.every((p) => !p.requiredPermission)).toBe(true);
  });

  it('recorrido Portal Inquilino: disponible solo en host PORTAL_INQUILINO para INQUILINO; todos los pasos navegables; recorrido completo con salto', () => {
    const ctx = contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO', accessibleSections: [...PANTALLAS_PORTAL] });
    expect(tutorialesDisponibles(ctx).map((t) => t.id)).toEqual([RECORRIDO_PORTAL_INQUILINO.id]);
    expect(tutorialesDisponibles(contextoDesdeUsuario(inquilino, 'inicio'))).toEqual([]); // en el ERP no
    expect(tutorialesDisponibles(contextoDesdeUsuario(admin, 'inicio', { host: 'PORTAL_INQUILINO' }))).toEqual([]); // admin no es inquilino
    const ev = evaluarTutorial(RECORRIDO_PORTAL_INQUILINO, ctx);
    expect(ev.every((p) => p.puedeNavegar && p.puedeEjecutar)).toBe(true);
    let s = iniciarTutorial(RECORRIDO_PORTAL_INQUILINO);
    expect(pasoActual(s, RECORRIDO_PORTAL_INQUILINO).route).toBe('inicio');
    s = avanzar(s, RECORRIDO_PORTAL_INQUILINO); // → recibos
    s = avanzar(s, RECORRIDO_PORTAL_INQUILINO); // → averias
    s = saltar(s, RECORRIDO_PORTAL_INQUILINO); // salta 'averias' → lecturas
    expect(s.indice).toBe(3);
    expect(s.saltados).toEqual(['averias']);
    s = avanzar(s, RECORRIDO_PORTAL_INQUILINO);
    expect(pasoActual(s, RECORRIDO_PORTAL_INQUILINO).route).toBe('mas');
    const fin = finalizar(s, RECORRIDO_PORTAL_INQUILINO);
    expect(fin.estado).toBe('COMPLETADO');
    expect(fin.saltados).toEqual(['averias']);
  });

  it('recorrido ERP «invitar inquilino»: admin y gestor lo ejecutan; propietario/inquilino no lo ven; saltar en el último paso completa', () => {
    expect(evaluarTutorial(RECORRIDO_INVITAR_INQUILINO, contextoDesdeUsuario(admin, 'inicio')).every((p) => p.puedeEjecutar)).toBe(true);
    expect(evaluarTutorial(RECORRIDO_INVITAR_INQUILINO, contextoDesdeUsuario(gestor, 'inicio')).every((p) => p.puedeEjecutar)).toBe(true);
    expect(tutorialesDisponibles(contextoDesdeUsuario(propietario, 'inicio'))).toEqual([]);
    let s = iniciarTutorial(RECORRIDO_INVITAR_INQUILINO);
    for (let i = 0; i < 4; i++) s = avanzar(s, RECORRIDO_INVITAR_INQUILINO);
    const fin = saltar(s, RECORRIDO_INVITAR_INQUILINO);
    expect(fin.estado).toBe('COMPLETADO');
    expect(fin.saltados).toEqual(['mensajes']);
    expect(saltar(fin, RECORRIDO_INVITAR_INQUILINO)).toBe(fin);
    expect(saltar(cancelar(iniciarTutorial(RECORRIDO_INVITAR_INQUILINO)), RECORRIDO_INVITAR_INQUILINO).estado).toBe('CANCELADO');
  });

  it('seguridad: ningún recorrido modifica permisos ni salta route guards (propietario ante rutas de gestión)', () => {
    const permisosAntes = JSON.stringify(propietario.permisos);
    const ctxProp = contextoDesdeUsuario(propietario, 'inicio', { accessibleSections: ['propietarios', 'inmuebles', 'tesoreria', 'ayuda'] });
    const evInv = evaluarTutorial(RECORRIDO_INVITAR_INQUILINO, ctxProp);
    expect(evInv.every((p) => !p.puedeNavegar && p.motivos.includes('RUTA_INACCESIBLE'))).toBe(true);
    expect(evInv.every((p) => !p.puedeEjecutar)).toBe(true);
    const evLiq = evaluarTutorial(TUTORIAL_LIQUIDACION, ctxProp);
    expect(evLiq.every((p) => p.puedeNavegar && !p.puedeEjecutar && p.motivos.includes('PERMISO_INSUFICIENTE'))).toBe(true);
    // Un paso del portal evaluado desde el ERP: la pantalla 'mas' no existe en ese host
    expect(evaluarPaso(RECORRIDO_PORTAL_INQUILINO.steps[4], 4, 5, contextoDesdeUsuario(admin, 'inicio')).motivos).toContain('RUTA_INEXISTENTE');
    // Y un paso del ERP evaluado desde el portal: 'inquilinos' no es pantalla del portal
    expect(evaluarPaso(RECORRIDO_INVITAR_INQUILINO.steps[0], 0, 5, contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO' })).motivos).toContain('RUTA_INEXISTENTE');
    expect(JSON.stringify(propietario.permisos)).toBe(permisosAntes);
  });
});
