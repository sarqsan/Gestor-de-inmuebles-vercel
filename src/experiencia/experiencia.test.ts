/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Tests del motor (contexto, ayuda, tutoriales, capacidades/intención, seguridad).
 */
import { describe, expect, it } from 'vitest';
import { PERMISOS_SISTEMA, ROLES_PREDEFINIDOS } from '../types';
import type { HelpEntry, Tutorial } from './tipos';
import {
  AYUDA_REGISTRO,
  CAPACIDADES_ERP,
  MODULO_POR_SECCION,
  PANTALLAS_PORTAL,
  TUTORIALES_REGISTRO,
  TUTORIAL_LIQUIDACION,
  avanzar,
  ayudaDisponible,
  ayudaParaContexto,
  buscarAyuda,
  cancelar,
  capacidadesDisponibles,
  construirIntentRequest,
  contextoDesdeUsuario,
  esUltimoPaso,
  evaluarPaso,
  evaluarTutorial,
  finalizar,
  getExperienceContext,
  iniciarTutorial,
  moduloDeSeccion,
  modulosConAyuda,
  obtenerAyuda,
  pasoActual,
  progreso,
  reanudar,
  resolverIntencionLocal,
  retroceder,
  tutorialesDisponibles,
} from './index';

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const admin = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const gestor = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['GESTOR_INMUEBLES'], permisos: rol('GESTOR_INMUEBLES').permisos };
const propietario = { tipoPerfil: 'PROPIETARIO' as const, roles: ['PROPIETARIO_ESTANDAR'], permisos: rol('PROPIETARIO_ESTANDAR').permisos };
const inquilino = { tipoPerfil: 'INQUILINO' as const, roles: ['INQUILINO_PORTAL'], permisos: rol('INQUILINO_PORTAL').permisos };

const SECCIONES_PROP = ['propietarios', 'inmuebles', 'formalizacion', 'cobros', 'tesoreria', 'gastos', 'financiacion', 'conciliacion', 'facturacion', 'fiscal', 'informes', 'polizas', 'actas', 'incidencias', 'recomercializacion', 'suministros', 'configuracion', 'ayuda'];

describe('§6 · Contexto', () => {
  it('resuelve módulo/sección/ruta a partir de la sección activa', () => {
    const ctx = getExperienceContext({ section: 'tesoreria', role: 'ADMINISTRADOR', permissions: ['tesoreria.ver'] });
    expect(ctx.module).toBe('tesoreria');
    expect(ctx.section).toBe('tesoreria');
    expect(ctx.route).toBe('#tesoreria');
    expect(ctx.missing).not.toContain('section');
    expect(ctx.missing).not.toContain('role');
    expect(ctx.missing).not.toContain('permissions');
  });

  it('respeta una ruta explícita y el módulo forzado por el host', () => {
    const ctx = getExperienceContext({ section: 'mensajes', module: 'inquilinos', route: '/portal/mensajes' });
    expect(ctx.module).toBe('inquilinos');
    expect(ctx.route).toBe('/portal/mensajes');
  });

  it('todas las secciones del ERP tienen módulo asignado y las secciones B/C/D/E apuntan a su bloque', () => {
    expect(moduloDeSeccion('tesoreria')).toBe('tesoreria');
    expect(moduloDeSeccion('morosidad')).toBe('morosidad');
    expect(moduloDeSeccion('actas')).toBe('actas');
    expect(moduloDeSeccion('inquilinos')).toBe('inquilinos');
    expect(moduloDeSeccion('suministros')).toBe('suministros');
    expect(moduloDeSeccion('ayuda')).toBe('ayuda');
    expect(Object.values(MODULO_POR_SECCION).every((m) => m !== 'desconocido')).toBe(true);
  });

  it('contexto incompleto: no lanza, marca lo que falta y no inventa permisos', () => {
    const ctx = getExperienceContext({});
    expect(ctx.module).toBe('desconocido');
    expect(ctx.section).toBe('');
    expect(ctx.permissions).toEqual([]);
    expect(ctx.missing).toEqual(expect.arrayContaining(['section', 'role', 'permissions', 'entity', 'state']));
    const ctx2 = getExperienceContext({ section: 'zona_inexistente', permissions: ['x', 'x', ''] as string[] });
    expect(ctx2.module).toBe('desconocido');
    expect(ctx2.permissions).toEqual(['x']); // deduplicado y sin vacíos
  });

  it('contextoDesdeUsuario toma rol y permisos del usuario canónico (no del rol por su cuenta)', () => {
    const ctx = contextoDesdeUsuario(gestor, 'inquilinos');
    expect(ctx.role).toBe('ADMINISTRADOR');
    expect(ctx.roles).toEqual(['GESTOR_INMUEBLES']);
    expect(ctx.permissions).toEqual(rol('GESTOR_INMUEBLES').permisos);
    expect(ctx.permissions).not.toContain('tesoreria.ver');
    const sinUsuario = contextoDesdeUsuario(null, 'inicio');
    expect(sinUsuario.missing).toContain('permissions');
    expect(sinUsuario.missing).toContain('role');
  });
});

describe('§6 · Ayuda', () => {
  it('el registro es coherente: ids únicos, secciones válidas, permisos existentes, tutoriales relacionados existentes', () => {
    const ids = AYUDA_REGISTRO.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const codigos = new Set(PERMISOS_SISTEMA.map((p) => p.codigo));
    for (const e of AYUDA_REGISTRO) {
      const seccionValida = (e.host ?? 'ERP') === 'PORTAL_INQUILINO' ? PANTALLAS_PORTAL.includes(e.section) : e.section === 'ayuda' || e.section in MODULO_POR_SECCION;
      expect(seccionValida).toBe(true);
      for (const p of e.permissions ?? []) expect(codigos.has(p)).toBe(true);
      for (const t of e.relatedTutorials ?? []) expect(TUTORIALES_REGISTRO.some((x) => x.id === t)).toBe(true);
    }
  });

  it('coincidencia por sección: la pantalla de tesorería devuelve su ayuda y solo la suya', () => {
    const ctx = contextoDesdeUsuario(admin, 'tesoreria');
    const res = ayudaParaContexto(ctx);
    expect(res.map((e) => e.id)).toEqual(['ayuda.tesoreria.liquidaciones']);
  });

  it('filtrado por rol: propietario ve «Mis liquidaciones», admin ve la de gestión; el inquilino no ve ninguna', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'tesoreria')).map((e) => e.id)).toEqual(['ayuda.tesoreria.mis-liquidaciones']);
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'tesoreria')).map((e) => e.id)).toEqual(['ayuda.tesoreria.liquidaciones']);
    expect(ayudaParaContexto(contextoDesdeUsuario(inquilino, 'tesoreria'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'morosidad'))).toEqual([]);
  });

  it('filtrado por permiso: el gestor (sin tesoreria.ver) no ve la ayuda de liquidaciones aunque sea ADMINISTRADOR', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(gestor, 'tesoreria'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(gestor, 'inquilinos')).map((e) => e.id)).toEqual(['ayuda.inquilinos.portal']);
    // Permisos desconocidos (sin usuario) → el contenido condicionado no se muestra
    expect(ayudaParaContexto(contextoDesdeUsuario(null, 'inquilinos'))).toEqual([]);
    // Pero el contenido sin condición sí
    expect(ayudaParaContexto(contextoDesdeUsuario(null, 'inicio')).length).toBe(1);
  });

  it('ausencia de ayuda: sección sin contenido o sin sección → lista vacía, sin error', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'candidatos'))).toEqual([]);
    expect(ayudaParaContexto(getExperienceContext({}))).toEqual([]);
    expect(obtenerAyuda('no.existe')).toBeUndefined();
  });

  it('búsqueda por texto: acentos/mayúsculas indiferentes, prioriza título/keywords, respeta RBAC', () => {
    const ctxAdmin = contextoDesdeUsuario(admin, 'inicio');
    const r = buscarAyuda(ctxAdmin, 'LIQUIDACIÓN');
    expect(r[0].id).toBe('ayuda.tesoreria.liquidaciones');
    expect(buscarAyuda(ctxAdmin, 'pain.008').map((e) => e.id)).toContain('ayuda.tesoreria.liquidaciones');
    expect(buscarAyuda(ctxAdmin, 'zzzz-nada')).toEqual([]);
    expect(buscarAyuda(ctxAdmin, '')).toHaveLength(ayudaDisponible(ctxAdmin).length);
    // El propietario buscando "liquidación" solo encuentra su versión
    const rProp = buscarAyuda(contextoDesdeUsuario(propietario, 'inicio'), 'liquidación').map((e) => e.id);
    expect(rProp[0]).toBe('ayuda.tesoreria.mis-liquidaciones');
    expect(rProp).not.toContain('ayuda.tesoreria.liquidaciones');
    // El inquilino no encuentra nada de tesorería ni de gestión de inquilinos
    const rInq = buscarAyuda(contextoDesdeUsuario(inquilino, 'inicio'), 'liquidación invitación');
    expect(rInq.map((e) => e.module)).not.toContain('tesoreria');
    expect(rInq.map((e) => e.id)).not.toContain('ayuda.inquilinos.portal');
  });

  it('contenido relacionado: la ayuda de liquidaciones enlaza con el tutorial real y los módulos con ayuda dependen del perfil', () => {
    const e = obtenerAyuda('ayuda.tesoreria.liquidaciones')!;
    expect(e.relatedTutorials).toEqual([TUTORIAL_LIQUIDACION.id]);
    expect(modulosConAyuda(contextoDesdeUsuario(admin, 'inicio'))).toContain('morosidad');
    expect(modulosConAyuda(contextoDesdeUsuario(propietario, 'inicio'))).not.toContain('morosidad');
  });

  it('admite un registro alternativo (pantallas futuras) sin tocar el motor', () => {
    const registro: HelpEntry[] = [{ id: 'x', module: 'cobros', section: 'cobros', title: 'Cobros', summary: 's', content: 'c' }];
    expect(ayudaParaContexto(contextoDesdeUsuario(inquilino, 'cobros'), { registro }).map((e) => e.id)).toEqual(['x']);
  });
});

describe('§6 · Tutoriales', () => {
  const t = TUTORIAL_LIQUIDACION;
  const reloj = () => '2026-09-21T10:00:00.000Z';

  it('el tutorial real es coherente: rutas existentes, permisos existentes, ≥ 3 pasos', () => {
    const codigos = new Set(PERMISOS_SISTEMA.map((p) => p.codigo));
    expect(t.steps.length).toBeGreaterThanOrEqual(3);
    for (const p of t.steps) {
      if (p.route) expect(p.route in MODULO_POR_SECCION).toBe(true);
      if (p.requiredPermission) expect(codigos.has(p.requiredPermission)).toBe(true);
    }
  });

  it('inicio → avance → retroceso → finalización (solo en el último paso)', () => {
    let s = iniciarTutorial(t, reloj);
    expect(s).toEqual({ tutorialId: t.id, indice: 0, estado: 'EN_CURSO', iniciadoEn: reloj() });
    expect(pasoActual(s, t).id).toBe('abrir-tesoreria');
    expect(() => finalizar(s, t, reloj)).toThrow(/último paso/);
    s = avanzar(s, t);
    expect(s.indice).toBe(1);
    expect(progreso(s, t)).toBeCloseTo(0.25);
    s = retroceder(s);
    expect(s.indice).toBe(0);
    expect(retroceder(s)).toBe(s); // en el primero no cambia
    for (let i = 0; i < 10; i++) s = avanzar(s, t);
    expect(esUltimoPaso(s, t)).toBe(true);
    expect(s.indice).toBe(t.steps.length - 1); // no se pasa del final
    const fin = finalizar(s, t, reloj);
    expect(fin.estado).toBe('COMPLETADO');
    expect(fin.finalizadoEn).toBe(reloj());
    expect(progreso(fin, t)).toBe(1);
    // Una sesión terminada es inerte
    expect(avanzar(fin, t)).toBe(fin);
    expect(cancelar(fin, reloj)).toBe(fin);
  });

  it('cancelación conserva el paso y puede reanudarse', () => {
    let s = avanzar(iniciarTutorial(t, reloj), t);
    const c = cancelar(s, reloj);
    expect(c.estado).toBe('CANCELADO');
    expect(c.indice).toBe(1);
    expect(avanzar(c, t)).toBe(c);
    const r = reanudar(c);
    expect(r.estado).toBe('EN_CURSO');
    expect(r.indice).toBe(1);
    expect(r.finalizadoEn).toBeUndefined();
    s = avanzar(r, t);
    expect(s.indice).toBe(2);
  });

  it('un tutorial sin pasos no puede iniciarse', () => {
    const vacio: Tutorial = { id: 'v', title: 'v', description: '', steps: [] };
    expect(() => iniciarTutorial(vacio)).toThrow();
  });

  it('permiso insuficiente: el gestor puede leer los pasos pero no ejecutar los de tesorería, con explicación', () => {
    const ctx = contextoDesdeUsuario(gestor, 'tesoreria');
    const ev = evaluarTutorial(t, ctx);
    expect(ev.every((p) => p.puedeNavegar)).toBe(true);
    expect(ev.every((p) => !p.puedeEjecutar)).toBe(true);
    expect(ev[0].motivos).toEqual(['PERMISO_INSUFICIENTE']);
    expect(ev[0].explicacion).toContain('tesoreria.ver');
    // El admin total ejecuta todos
    expect(evaluarTutorial(t, contextoDesdeUsuario(admin, 'tesoreria')).every((p) => p.puedeEjecutar && p.motivos.length === 0)).toBe(true);
  });

  it('ruta inexistente / inaccesible / target no visible → bloqueos explícitos', () => {
    const ctxAdmin = contextoDesdeUsuario(admin, 'inicio');
    const fantasma = evaluarPaso({ id: 'f', title: 'f', description: '', route: 'pantalla_que_no_existe' }, 0, 1, ctxAdmin);
    expect(fantasma.puedeNavegar).toBe(false);
    expect(fantasma.motivos).toEqual(['RUTA_INEXISTENTE']);
    // Propietario con route guard: 'morosidad' existe pero no es accesible para él
    const ctxProp = contextoDesdeUsuario(propietario, 'inicio', { accessibleSections: SECCIONES_PROP });
    const inaccesible = evaluarPaso({ id: 'm', title: 'm', description: '', route: 'morosidad' }, 0, 1, ctxProp);
    expect(inaccesible.puedeNavegar).toBe(false);
    expect(inaccesible.motivos).toEqual(['RUTA_INACCESIBLE']);
    // Target ausente en DOM
    const sinTarget = evaluarPaso({ id: 't', title: 't', description: '', route: 'tesoreria', target: '#no-existe' }, 0, 1, ctxAdmin, { targetVisible: () => false });
    expect(sinTarget.motivos).toEqual(['TARGET_NO_VISIBLE']);
    expect(sinTarget.puedeEjecutar).toBe(true);
  });

  it('tutoriales disponibles por rol: admin sí; propietario e inquilino no ven el de liquidaciones', () => {
    expect(tutorialesDisponibles(contextoDesdeUsuario(admin, 'inicio')).map((x) => x.id)).toEqual([t.id, 'recorrido.inquilinos.invitar']);
    expect(tutorialesDisponibles(contextoDesdeUsuario(propietario, 'inicio'))).toEqual([]);
    // El inquilino en el ERP (host por defecto) no ve nada; en su portal ve su recorrido (F2)
    expect(tutorialesDisponibles(contextoDesdeUsuario(inquilino, 'inicio'))).toEqual([]);
    expect(tutorialesDisponibles(contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO' })).map((x) => x.id)).toEqual(['recorrido.portal.primeros-pasos']);
  });
});

describe('§6 · Seguridad / RBAC', () => {
  it('la capa no concede capacidades: las disponibles son subconjunto exacto de los permisos del usuario', () => {
    const codigos = new Set(PERMISOS_SISTEMA.map((p) => p.codigo));
    for (const c of CAPACIDADES_ERP) if (c.requiredPermission) expect(codigos.has(c.requiredPermission)).toBe(true);
    const ctxGestor = contextoDesdeUsuario(gestor, 'inicio');
    const caps = capacidadesDisponibles(ctxGestor);
    for (const c of caps) expect(!c.requiredPermission || ctxGestor.permissions.includes(c.requiredPermission)).toBe(true);
    expect(caps.map((c) => c.id)).toContain('cap.inquilinos.invitar');
    expect(caps.map((c) => c.id)).not.toContain('cap.tesoreria.liquidar');
    // Permisos desconocidos → solo capacidades sin permiso (ayuda)
    expect(capacidadesDisponibles(getExperienceContext({})).map((c) => c.id)).toEqual(['cap.ayuda.consultar']);
  });

  it('el usuario y su rol permanecen intactos tras consultar ayuda, tutoriales y capacidades', () => {
    const antes = JSON.stringify(gestor);
    const rolAntes = JSON.stringify(rol('GESTOR_INMUEBLES'));
    const ctx = contextoDesdeUsuario(gestor, 'tesoreria');
    ayudaDisponible(ctx);
    buscarAyuda(ctx, 'liquidación sepa pagar');
    evaluarTutorial(TUTORIAL_LIQUIDACION, ctx);
    capacidadesDisponibles(ctx);
    expect(JSON.stringify(gestor)).toBe(antes);
    expect(JSON.stringify(rol('GESTOR_INMUEBLES'))).toBe(rolAntes);
    expect(ctx.permissions).toEqual(rol('GESTOR_INMUEBLES').permisos);
  });

  it('el contenido condicionado por rol/permiso nunca se filtra al inquilino, ni por búsqueda ni por módulo', () => {
    const ctx = contextoDesdeUsuario(inquilino, 'inicio');
    const todo = ayudaDisponible(ctx);
    for (const e of todo) {
      expect(!e.roles || e.roles.includes('INQUILINO')).toBe(true);
      expect((e.permissions ?? []).every((p) => inquilino.permisos.includes(p))).toBe(true);
    }
    expect(todo.map((e) => e.id)).not.toContain('ayuda.tesoreria.liquidaciones');
    expect(todo.map((e) => e.id)).not.toContain('ayuda.morosidad.expedientes');
  });
});

describe('§6 · Contrato de intención (sin IA)', () => {
  it('construye la petición con capacidades ya filtradas y el resolutor local solo propone lo autorizado', async () => {
    const ctx = contextoDesdeUsuario(admin, 'inicio');
    const req = construirIntentRequest('quiero liquidar a un propietario', ctx);
    expect(req.capabilities.map((c) => c.id)).toContain('cap.tesoreria.liquidar');
    const res = await resolverIntencionLocal(req);
    expect(res.kind).toBe('TUTORIAL');
    expect(res.helpEntryId).toBe('ayuda.tesoreria.liquidaciones');
    expect(res.tutorialId).toBe(TUTORIAL_LIQUIDACION.id);
    expect(res.route).toBe('tesoreria');
    expect(req.capabilities.some((c) => c.id === res.capabilityId)).toBe(true);
  });

  it('un gestor sin tesorería obtiene NO_AUTORIZADO sin filtrar contenido; consultas vacías o sin match → NO_RESUELTO', async () => {
    const ctx = contextoDesdeUsuario(gestor, 'inicio');
    const res = await resolverIntencionLocal(construirIntentRequest('ficheros sepa del banco', ctx));
    expect(res.kind).toBe('NO_AUTORIZADO');
    expect(res.helpEntryId).toBeUndefined();
    expect(res.route).toBeUndefined();
    expect((await resolverIntencionLocal(construirIntentRequest('   ', ctx))).kind).toBe('NO_RESUELTO');
    expect((await resolverIntencionLocal(construirIntentRequest('xyzqwv', ctx))).kind).toBe('NO_RESUELTO');
  });
});
