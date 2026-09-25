/**
 * UX-1C · Cobertura contextual. La ayuda no concede permisos ni toca el motor.
 */
import { describe, expect, it } from 'vitest';
import { ROLES_PREDEFINIDOS } from '../types';
import {
  AYUDA_REGISTRO,
  RECORRIDO_ADMIN_CENTRO,
  RECORRIDO_PORTAL_INQUILINO,
  RECORRIDO_PROFESIONAL_PORTAL,
  RECORRIDO_PROPIETARIO_PORTAL,
  ayudaDisponible,
  ayudaParaContexto,
  buscarAyuda,
  construirAIIntentRequest,
  contextoDesdeUsuario,
  obtenerAyuda,
  proveedorLocal,
  resolverIntencionLocal,
  tutorialDeBienvenida,
} from './index';

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const admin = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['SUPERADMIN'], permisos: [...rol('SUPERADMIN').permisos] };
const propietario = { tipoPerfil: 'PROPIETARIO' as const, roles: ['PROPIETARIO_ESTANDAR'], permisos: [...rol('PROPIETARIO_ESTANDAR').permisos] };
const profesional = { tipoPerfil: 'PROFESIONAL' as const, roles: ['PROFESIONAL_MANTENIMIENTO'], permisos: [...rol('PROFESIONAL_MANTENIMIENTO').permisos] };
const inquilino = { tipoPerfil: 'INQUILINO' as const, roles: ['INQUILINO_PORTAL'], permisos: [...rol('INQUILINO_PORTAL').permisos] };

const PREGUNTAS = ['Qué es.', 'Qué puedes hacer.', 'Qué hace falta.', 'Después.'];

/** Ficha → sección → quién debe verla. */
const FICHAS: Array<{ id: string; section: string; perfiles: Array<'ADMINISTRADOR' | 'PROPIETARIO'> }> = [
  { id: 'ayuda.dashboard.ejecutivo', section: 'dashboard', perfiles: ['ADMINISTRADOR'] },
  { id: 'ayuda.dashboard.propietario', section: 'dashboard', perfiles: ['PROPIETARIO'] },
  { id: 'ayuda.admin.propietarios', section: 'propietarios', perfiles: ['ADMINISTRADOR'] },
  { id: 'ayuda.gastos.gestion', section: 'gastos', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.fiscal.alquileres', section: 'fiscal', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.informes.cartera', section: 'informes', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.conciliacion.bancaria', section: 'conciliacion', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.facturacion.registro', section: 'facturacion', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.financiacion.hipotecas', section: 'financiacion', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.polizas.gestion', section: 'polizas', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.inversion.analisis', section: 'inversion', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.recomercializacion.expediente', section: 'recomercializacion', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.operaciones.coordinacion', section: 'operaciones', perfiles: ['ADMINISTRADOR', 'PROPIETARIO'] },
  { id: 'ayuda.captacion.preseleccionados', section: 'preseleccionados', perfiles: ['ADMINISTRADOR'] },
  { id: 'ayuda.captacion.seguro-impago', section: 'seguro_impago', perfiles: ['ADMINISTRADOR'] },
  { id: 'ayuda.captacion.candidatos', section: 'candidatos', perfiles: ['ADMINISTRADOR'] },
  { id: 'ayuda.captacion.analisis', section: 'analisis', perfiles: ['ADMINISTRADOR'] },
  { id: 'ayuda.propietario.suministros', section: 'suministros', perfiles: ['PROPIETARIO'] },
];

const usuario = (perfil: 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO') =>
  perfil === 'ADMINISTRADOR' ? admin : perfil === 'PROPIETARIO' ? propietario : perfil === 'PROFESIONAL' ? profesional : inquilino;

describe('UX-1C · fichas nuevas', () => {
  it('cada ficha existe, está en su sección y responde a las cuatro preguntas', () => {
    expect(new Set(FICHAS.map((f) => f.id)).size).toBe(FICHAS.length);
    for (const f of FICHAS) {
      const e = obtenerAyuda(f.id);
      expect(e, f.id).toBeTruthy();
      expect(e!.section).toBe(f.section);
      expect(e!.host ?? 'ERP').toBe('ERP');
      for (const pregunta of PREGUNTAS) expect(e!.content).toContain(pregunta);
      for (const perfil of f.perfiles) {
        expect(ayudaParaContexto(contextoDesdeUsuario(usuario(perfil), f.section)).map((x) => x.id)).toContain(f.id);
      }
    }
  });

  it('un perfil que no corresponde no la recibe, y verla no cambia sus permisos', () => {
    const antes = {
      admin: admin.permisos.length,
      propietario: propietario.permisos.length,
      profesional: profesional.permisos.length,
      inquilino: inquilino.permisos.length,
    };
    for (const f of FICHAS) {
      for (const perfil of ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL', 'INQUILINO'] as const) {
        const ids = ayudaParaContexto(contextoDesdeUsuario(usuario(perfil), f.section)).map((x) => x.id);
        if (perfil === 'PROFESIONAL' || perfil === 'INQUILINO' || !f.perfiles.includes(perfil)) {
          expect(ids, `${perfil} ${f.id}`).not.toContain(f.id);
        }
      }
      expect(obtenerAyuda(f.id)!.permissions ?? []).toEqual([]);
    }
    expect(admin.permisos).toHaveLength(antes.admin);
    expect(propietario.permisos).toHaveLength(antes.propietario);
    expect(profesional.permisos).toHaveLength(antes.profesional);
    expect(inquilino.permisos).toHaveLength(antes.inquilino);
    expect(buscarAyuda(contextoDesdeUsuario(profesional, 'ayuda'), 'verifactu').map((e) => e.id)).toEqual([]);
    expect(buscarAyuda(contextoDesdeUsuario(inquilino, 'inicio'), 'verifactu').map((e) => e.id)).toEqual([]);
  });

  it('el administrador no ve las fichas del portal del propietario, y al revés', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'propietarios')).map((e) => e.id)).toEqual(['ayuda.admin.propietarios']);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'propietarios')).map((e) => e.id)).toEqual([
      'ayuda.propietario.portal',
      'ayuda.propietario.perfil',
    ]);
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'dashboard')).map((e) => e.id)).toEqual(['ayuda.dashboard.ejecutivo']);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'dashboard')).map((e) => e.id)).toEqual(['ayuda.dashboard.propietario']);
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'suministros')).map((e) => e.id)).toEqual(['ayuda.suministros.gestion']);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'suministros')).map((e) => e.id)).toEqual(['ayuda.propietario.suministros']);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'morosidad'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'configuracion'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'administracion'))).toEqual([]);
  });
});

describe('UX-1C · perfiles que ya tenían ficha', () => {
  it('el propietario conserva sus fichas y no recibe gestión de plataforma', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'inmuebles')).map((e) => e.id)).toEqual([
      'ayuda.propietario.inmuebles',
      'ayuda.inmuebles.alta',
    ]);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'tesoreria')).map((e) => e.id)).toEqual(['ayuda.tesoreria.mis-liquidaciones']);
    expect(ayudaParaContexto(contextoDesdeUsuario(propietario, 'cobros')).map((e) => e.id)).toEqual(['ayuda.cobros.gestion']);
    expect(ayudaDisponible(contextoDesdeUsuario(propietario, 'ayuda')).map((e) => e.id)).not.toContain('ayuda.admin.centro-control');
    expect(ayudaDisponible(contextoDesdeUsuario(propietario, 'ayuda')).map((e) => e.id)).not.toContain('ayuda.captacion.candidatos');
  });

  it('el profesional conserva portal, ficha y viviendas, y no recibe las fichas nuevas de gestión', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'administracion')).map((e) => e.id)).toEqual([
      'ayuda.profesional.portal',
      'ayuda.profesional.ficha',
    ]);
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'inmuebles')).map((e) => e.id)).toEqual([
      'ayuda.profesional.viviendas',
      'ayuda.inmuebles.alta',
    ]);
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'configuracion'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'inversion'))).toEqual([]);
    expect(ayudaParaContexto(contextoDesdeUsuario(profesional, 'incidencias'))).toEqual([]);
    const ids = ayudaDisponible(contextoDesdeUsuario(profesional, 'ayuda')).map((e) => e.id);
    expect(ids).not.toContain('ayuda.gastos.gestion');
    expect(ids).not.toContain('ayuda.suministros.gestion');
    expect(ids).not.toContain('ayuda.admin.propietarios');
  });

  it('el inquilino conserva sus fichas de portal y no ve las nuevas del ERP', () => {
    const portal = AYUDA_REGISTRO.filter((e) => e.host === 'PORTAL_INQUILINO');
    expect(portal.map((e) => e.id)).toEqual([
      'ayuda.portal.inicio',
      'ayuda.portal.contrato',
      'ayuda.portal.recibos',
      'ayuda.portal.incidencias',
      'ayuda.portal.suministros',
      'ayuda.portal.mensajes',
      'ayuda.portal.documentos',
      'ayuda.portal.historial',
      'ayuda.portal.cuenta',
    ]);
    expect(portal.every((e) => e.roles?.includes('INQUILINO'))).toBe(true);
    expect(obtenerAyuda('ayuda.portal.recibos')!.content).toContain('desde el portal no se marcan pagos');
    expect(obtenerAyuda('ayuda.portal.contrato')!.content).toContain('Es una vista de solo lectura');
    for (const f of FICHAS) {
      expect(ayudaParaContexto(contextoDesdeUsuario(inquilino, f.section, { host: 'PORTAL_INQUILINO' })).map((e) => e.id)).not.toContain(f.id);
      expect(ayudaParaContexto(contextoDesdeUsuario(inquilino, f.section)).map((e) => e.id)).not.toContain(f.id);
    }
    expect(ayudaParaContexto(contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO' })).map((e) => e.id)).toEqual([
      'ayuda.portal.inicio',
    ]);
  });
});

describe('UX-1C · bloques anteriores y asistente', () => {
  it('UX-1A, UX-1B, UX-0A y UX-0B siguen en su sitio', () => {
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'administracion')).map((e) => e.id)).toEqual(['ayuda.admin.centro-control']);
    expect(ayudaParaContexto(contextoDesdeUsuario(admin, 'inmuebles')).map((e) => e.id)).toEqual([
      'ayuda.admin.inmuebles',
      'ayuda.inmuebles.alta',
    ]);
    expect(obtenerAyuda('ayuda.inmuebles.alta')!.content).toContain('el selector sigue editable');
    expect(tutorialDeBienvenida(contextoDesdeUsuario(admin, 'administracion'))?.id).toBe(RECORRIDO_ADMIN_CENTRO.id);
    expect(tutorialDeBienvenida(contextoDesdeUsuario(propietario, 'propietarios'))?.id).toBe(RECORRIDO_PROPIETARIO_PORTAL.id);
    expect(tutorialDeBienvenida(contextoDesdeUsuario(profesional, 'administracion'))?.id).toBe(RECORRIDO_PROFESIONAL_PORTAL.id);
    expect(tutorialDeBienvenida(contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO' }))?.id).toBe(
      RECORRIDO_PORTAL_INQUILINO.id
    );
  });

  it('el asistente existente explica una ficha nueva sin capacidades nuevas', async () => {
    const ctx = contextoDesdeUsuario(admin, 'fiscal');
    const local = await resolverIntencionLocal({ input: 'fiscalidad alquileres', context: ctx, capabilities: [] });
    expect(local.kind).toBe('EXPLICAR');
    expect(local.helpEntryId).toBe('ayuda.fiscal.alquileres');
    const propuesta = await proveedorLocal.interpretar(construirAIIntentRequest('para que sirve la fiscalidad de alquileres', ctx));
    expect(propuesta.intencion).toBe('EXPLICAR');
    expect(propuesta.parametros?.helpEntryId).toBe('ayuda.fiscal.alquileres');
    const ajeno = await proveedorLocal.interpretar(construirAIIntentRequest('para que sirve la fiscalidad de alquileres', contextoDesdeUsuario(profesional, 'administracion')));
    expect(ajeno.parametros?.helpEntryId).not.toBe('ayuda.fiscal.alquileres');
  });
});
