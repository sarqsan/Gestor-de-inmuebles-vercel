/**
 * UX-1A · Fichas de entrada y recorridos por perfil.
 * El motor no cambia: solo el registro. La ayuda no concede permisos.
 */
import { describe, expect, it } from 'vitest';
import { PERMISOS_SISTEMA, ROLES_PREDEFINIDOS } from '../types';
import { MODULO_POR_SECCION } from './contexto';
import {
  AYUDA_REGISTRO,
  RECORRIDO_ADMIN_CENTRO,
  RECORRIDO_PROFESIONAL_PORTAL,
  RECORRIDO_PROPIETARIO_PORTAL,
  TUTORIALES_REGISTRO,
  ayudaParaContexto,
  contextoDesdeUsuario,
  evaluarTutorial,
  obtenerAyuda,
  obtenerTutorial,
  tutorialesDisponibles,
} from './index';

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const admin = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const gestor = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['GESTOR_INMUEBLES'], permisos: rol('GESTOR_INMUEBLES').permisos };
const propietario = { tipoPerfil: 'PROPIETARIO' as const, roles: ['PROPIETARIO_ESTANDAR'], permisos: rol('PROPIETARIO_ESTANDAR').permisos };
const propietarioVacio = { tipoPerfil: 'PROPIETARIO' as const, roles: ['PROPIETARIO'], permisos: [] as string[] };
const profesional = { tipoPerfil: 'PROFESIONAL' as const, roles: ['PROFESIONAL_MANTENIMIENTO'], permisos: rol('PROFESIONAL_MANTENIMIENTO').permisos };
const profesionalVacio = { tipoPerfil: 'PROFESIONAL' as const, roles: ['PROFESIONAL'], permisos: [] as string[] };
const inquilino = { tipoPerfil: 'INQUILINO' as const, roles: ['INQUILINO_PORTAL'], permisos: rol('INQUILINO_PORTAL').permisos };

const SECCIONES_PROP = ['propietarios', 'inmuebles', 'formalizacion', 'cobros', 'tesoreria', 'actas', 'configuracion', 'ayuda'];
const SECCIONES_PROF = ['administracion', 'inmuebles', 'configuracion', 'ayuda'];

describe('UX-1A · ayuda de entrada', () => {
  it('cada ficha nueva es coherente y no exige un permiso que el perfil de entrada no tiene', () => {
    const ids = [
      'ayuda.admin.centro-control',
      'ayuda.admin.inmuebles',
      'ayuda.admin.configuracion',
      'ayuda.propietario.portal',
      'ayuda.propietario.perfil',
      'ayuda.propietario.inmuebles',
      'ayuda.profesional.portal',
      'ayuda.profesional.ficha',
      'ayuda.profesional.viviendas',
      'ayuda.inmuebles.alta',
    ];
    const codigos = new Set(PERMISOS_SISTEMA.map((p) => p.codigo));
    for (const id of ids) {
      const e = obtenerAyuda(id);
      expect(e, id).toBeTruthy();
      expect(e!.section in MODULO_POR_SECCION || e!.section === 'ayuda').toBe(true);
      expect(e!.content.length).toBeGreaterThan(40);
      for (const p of e!.permissions ?? []) expect(codigos.has(p)).toBe(true);
      expect(e!.permissions ?? []).toEqual([]);
    }
    expect(new Set(AYUDA_REGISTRO.map((e) => e.id)).size).toBe(AYUDA_REGISTRO.length);
  });

  it('el administrador ve el Centro de Control, inmuebles, configuración y el alta; no el portal ajeno', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'administracion')).map((e) => e.id)).toEqual(['ayuda.admin.centro-control']);
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'inmuebles')).map((e) => e.id)).toEqual(['ayuda.admin.inmuebles', 'ayuda.inmuebles.alta']);
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'configuracion')).map((e) => e.id)).toEqual(['ayuda.admin.configuracion']);
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'propietarios')).map((e) => e.id)).not.toContain('ayuda.propietario.portal');
    expect(ayudaParaContexto(contextoDesdeUsuario(gestor, 'administracion')).map((e) => e.id)).toEqual(['ayuda.admin.centro-control']);
  });

  it('el propietario ve su portal, su perfil y sus viviendas; no la configuración del sistema ni el centro de control', () => {
    const portal = ayudaParaContexto(contextoDesdeUsuario(propietario, 'propietarios')).map((e) => e.id);
    expect(portal).toEqual(['ayuda.propietario.portal', 'ayuda.propietario.perfil']);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietarioVacio, 'propietarios')).map((e) => e.id)).toEqual(portal);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'inmuebles')).map((e) => e.id)).toEqual(['ayuda.propietario.inmuebles', 'ayuda.inmuebles.alta']);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'configuracion'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'administracion'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'tesoreria')).map((e) => e.id)).toEqual(['ayuda.tesoreria.mis-liquidaciones']);
  });

  it('el profesional ve su portal y su ficha en la misma sección, y las viviendas asignadas; no el centro de control', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'administracion')).map((e) => e.id)).toEqual(['ayuda.profesional.portal', 'ayuda.profesional.ficha']);
    expect(ayudaParaContexto(contextoDesdeUsuario(profesionalVacio, 'administracion')).map((e) => e.id)).toEqual(['ayuda.profesional.portal', 'ayuda.profesional.ficha']);
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'inmuebles')).map((e) => e.id)).toEqual(['ayuda.profesional.viviendas', 'ayuda.inmuebles.alta']);
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'configuracion'))).toEqual([]);
  });

  it('el inquilino no ve ninguna ficha nueva del ERP', () => {
    for (const section of ['administracion', 'inmuebles', 'configuracion', 'propietarios']) {
      expect(ayudaParaContexto(contextoDesdeUsuario(inquilino, section))).toEqual([]);
    }
  });
});

describe('UX-1A · recorridos', () => {
  it('los tres recorridos nuevos se filtran por perfil y host, y no se cuelan entre sí', () => {
    expect(tutorialesDisponibles(contextoDesdeUsuario(admin, 'administracion')).map((t) => t.id)).toContain(RECORRIDO_ADMIN_CENTRO.id);
    expect(tutorialesDisponibles(contextoDesdeUsuario(admin, 'administracion')).map((t) => t.id)).not.toContain(RECORRIDO_PROPIETARIO_PORTAL.id);
    expect(tutorialesDisponibles(contextoDesdeUsuario(admin, 'administracion')).map((t) => t.id)).not.toContain(RECORRIDO_PROFESIONAL_PORTAL.id);

    expect(tutorialesDisponibles(contextoDesdeUsuario(propietario, 'propietarios')).map((t) => t.id)).toEqual([RECORRIDO_PROPIETARIO_PORTAL.id]);
    expect(tutorialesDisponibles(contextoDesdeUsuario(propietarioVacio, 'propietarios')).map((t) => t.id)).toEqual([RECORRIDO_PROPIETARIO_PORTAL.id]);

    expect(tutorialesDisponibles(contextoDesdeUsuario(profesional, 'administracion')).map((t) => t.id)).toEqual([RECORRIDO_PROFESIONAL_PORTAL.id]);
    expect(tutorialesDisponibles(contextoDesdeUsuario(profesionalVacio, 'administracion')).map((t) => t.id)).toEqual([RECORRIDO_PROFESIONAL_PORTAL.id]);

    expect(tutorialesDisponibles(contextoDesdeUsuario(inquilino, 'inicio'))).toEqual([]);
    expect(tutorialesDisponibles(contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO' })).map((t) => t.id)).toEqual(['recorrido.portal.primeros-pasos']);
  });

  it('cada paso apunta a una sección real, sin permiso exigido, y el tutorial relacionado existe', () => {
    for (const t of [RECORRIDO_ADMIN_CENTRO, RECORRIDO_PROPIETARIO_PORTAL, RECORRIDO_PROFESIONAL_PORTAL]) {
      expect(TUTORIALES_REGISTRO.filter((x) => x.id === t.id)).toHaveLength(1);
      expect(t.steps.length).toBeGreaterThanOrEqual(5);
      expect(obtenerTutorial(t.id)?.id).toBe(t.id);
      for (const p of t.steps) {
        expect(p.route && p.route in MODULO_POR_SECCION).toBe(true);
        expect(p.target?.startsWith('[data-tour="')).toBe(true);
        expect(p.requiredPermission).toBeUndefined();
      }
    }
    expect(obtenerAyuda('ayuda.admin.centro-control')!.relatedTutorials).toEqual([RECORRIDO_ADMIN_CENTRO.id]);
    expect(obtenerAyuda('ayuda.propietario.portal')!.relatedTutorials).toEqual([RECORRIDO_PROPIETARIO_PORTAL.id]);
    expect(obtenerAyuda('ayuda.profesional.portal')!.relatedTutorials).toEqual([RECORRIDO_PROFESIONAL_PORTAL.id]);
  });

  it('con el route guard real, propietario y profesional pueden navegar todos los pasos de su recorrido', () => {
    const evProp = evaluarTutorial(RECORRIDO_PROPIETARIO_PORTAL, contextoDesdeUsuario(propietarioVacio, 'propietarios', { accessibleSections: SECCIONES_PROP }));
    expect(evProp.every((p) => p.puedeNavegar && p.puedeEjecutar)).toBe(true);
    const evProf = evaluarTutorial(RECORRIDO_PROFESIONAL_PORTAL, contextoDesdeUsuario(profesionalVacio, 'administracion', { accessibleSections: SECCIONES_PROF }));
    expect(evProf.every((p) => p.puedeNavegar && p.puedeEjecutar)).toBe(true);
    const evAdmin = evaluarTutorial(RECORRIDO_ADMIN_CENTRO, contextoDesdeUsuario(admin, 'administracion'));
    expect(evAdmin.every((p) => p.puedeNavegar && p.puedeEjecutar)).toBe(true);
  });
});
