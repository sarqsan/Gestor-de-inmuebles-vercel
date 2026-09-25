/**
 * UX-1B · Decisión de bienvenida. No toca Firestore ni marca completed al descartar.
 */
import { describe, expect, it } from 'vitest';
import { ROLES_PREDEFINIDOS } from '../types';
import {
  RECORRIDO_ADMIN_CENTRO,
  RECORRIDO_PROFESIONAL_PORTAL,
  RECORRIDO_PROPIETARIO_PORTAL,
  RECORRIDO_PORTAL_INQUILINO,
  contextoDesdeUsuario,
  estadoRecorrido,
  etiquetaTutorial,
  modoBienvenida,
  progresoDesdeSesion,
  sesionDescartada,
  tutorialDeBienvenida,
} from './index';
import type { TutorialProgress } from './progreso';

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const admin = { tipoPerfil: 'ADMINISTRADOR' as const, roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const propietario = { tipoPerfil: 'PROPIETARIO' as const, roles: ['PROPIETARIO_ESTANDAR'], permisos: [] as string[] };
const profesional = { tipoPerfil: 'PROFESIONAL' as const, roles: ['PROFESIONAL_MANTENIMIENTO'], permisos: [] as string[] };
const inquilino = { tipoPerfil: 'INQUILINO' as const, roles: ['INQUILINO_PORTAL'], permisos: rol('INQUILINO_PORTAL').permisos };

const reloj = () => '2026-09-25T12:00:00.000Z';

function progreso(tutorialId: string, host: 'ERP' | 'PORTAL_INQUILINO', extra: Partial<TutorialProgress> = {}): TutorialProgress {
  return {
    tutorialId,
    host,
    currentStep: 0,
    stepCount: 5,
    completed: false,
    skippedSteps: [],
    startedAt: reloj(),
    updatedAt: reloj(),
    ...extra,
  };
}

describe('UX-1B · recorrido de entrada por perfil', () => {
  it('cada perfil ve solo su recorrido, y el inquilino solo en su portal', () => {
    expect(tutorialDeBienvenida(contextoDesdeUsuario(admin, 'administracion'))?.id).toBe(RECORRIDO_ADMIN_CENTRO.id);
    expect(tutorialDeBienvenida(contextoDesdeUsuario(propietario, 'propietarios'))?.id).toBe(RECORRIDO_PROPIETARIO_PORTAL.id);
    expect(tutorialDeBienvenida(contextoDesdeUsuario(profesional, 'administracion'))?.id).toBe(RECORRIDO_PROFESIONAL_PORTAL.id);
    expect(tutorialDeBienvenida(contextoDesdeUsuario(inquilino, 'inicio'))).toBeNull();
    expect(tutorialDeBienvenida(contextoDesdeUsuario(inquilino, 'inicio', { host: 'PORTAL_INQUILINO' }))?.id).toBe(RECORRIDO_PORTAL_INQUILINO.id);
    expect(tutorialDeBienvenida(contextoDesdeUsuario(propietario, 'inicio', { host: 'PORTAL_INQUILINO' }))).toBeNull();
    expect(tutorialDeBienvenida(contextoDesdeUsuario(admin, 'inicio', { host: 'PORTAL_INQUILINO' }))).toBeNull();
  });
});

describe('UX-1B · estados sobre el progreso existente', () => {
  const t = RECORRIDO_PROPIETARIO_PORTAL;

  it('sin documento se ofrece la bienvenida; completado y descartado no', () => {
    expect(estadoRecorrido(null, t)).toBe('NO_INICIADO');
    expect(modoBienvenida('NO_INICIADO')).toBe('VER');
    expect(modoBienvenida('COMPLETADO')).toBeNull();
    expect(modoBienvenida('DESCARTADO')).toBeNull();
    expect(modoBienvenida('NO_INICIADO', { ocultoEnSesion: true })).toBeNull();
    expect(modoBienvenida('EN_CURSO', { reproductorAbierto: true })).toBeNull();
  });

  it('«Ahora no» no marca completed y queda como descartado, no como reanudable', () => {
    const sesion = sesionDescartada(t, reloj);
    expect(sesion.estado).toBe('CANCELADO');
    expect(sesion.indice).toBe(0);
    const guardado = progresoDesdeSesion(sesion, t, null, reloj);
    expect(guardado.completed).toBe(false);
    expect(guardado.completedAt).toBeUndefined();
    expect(guardado.currentStep).toBe(0);
    expect(estadoRecorrido(guardado, t)).toBe('DESCARTADO');
    expect(etiquetaTutorial('DESCARTADO')).toBe('Comenzar');
  });

  it('un paso a medias se puede continuar y uno completado no vuelve a la bienvenida', () => {
    const aMedias = progreso(t.id, 'ERP', { currentStep: 2, stepCount: t.steps.length });
    expect(estadoRecorrido(aMedias, t)).toBe('EN_CURSO');
    expect(modoBienvenida('EN_CURSO')).toBe('CONTINUAR');
    expect(etiquetaTutorial('EN_CURSO')).toBe('Continuar recorrido');
    const hecho = progreso(t.id, 'ERP', { completed: true, completedAt: reloj(), stepCount: t.steps.length });
    expect(estadoRecorrido(hecho, t)).toBe('COMPLETADO');
    expect(modoBienvenida('COMPLETADO')).toBeNull();
    expect(etiquetaTutorial('COMPLETADO')).toBe('Volver a realizar');
    expect(etiquetaTutorial('NO_INICIADO')).toBe('Comenzar');
  });
});
