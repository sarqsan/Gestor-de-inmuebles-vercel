/**
 * BLOQUE 10 · UX-1 — Tests del CATÁLOGO ÚNICO DE NAVEGACIÓN (sin DOM).
 *
 * Cubre los puntos A, B, D, E, F, G y H del encargo de UX-1:
 *  A. catálogo coherente (grupo, orden determinista, sin duplicados, secciones válidas);
 *  B. navegación por perfil (ADMINISTRADOR / PROPIETARIO / PROFESIONAL);
 *  D. invariante `menú visible ⊆ acceso existente` (guard real de App.tsx, sin tocarlo);
 *  E. seis grupos, nombres y orden exactos;
 *  F. etiquetas confirmadas (D-4);
 *  G. identificadores `data-tour` de los tutoriales §6;
 *  H. fail-closed: `inversion` no se ofrece al PROFESIONAL.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  ATRIBUTO_TOUR_NAV,
  GRUPOS_NAVEGACION,
  NAVEGACION,
  definicionesDePerfil,
  etiquetaDeItem,
  gruposDePerfil,
  iconoDeItem,
  idTourDeSeccion,
  itemDisponible,
  perfilNavegacionDe,
  seccionesDePerfil,
  valorBadge,
} from './navegacion';
import type { GrupoNavId, PerfilNavegacion } from './navegacion';
import type { SectionType } from '../types';

const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
const TYPES = readFileSync(resolve(__dirname, '../types.ts'), 'utf8');

/** Secciones del route guard real, leídas de App.tsx (no se modifica el guard). */
function guardDeApp(nombreConstante: string): SectionType[] {
  const inicio = APP.indexOf(`const ${nombreConstante}`);
  expect(inicio).toBeGreaterThan(0);
  const bloque = APP.slice(inicio, APP.indexOf('];', inicio));
  return Array.from(bloque.matchAll(/'([a-z_]+)'/g)).map((m) => m[1] as SectionType);
}

/** Secciones declaradas en el union `SectionType` de types.ts. */
function seccionesDeclaradas(): SectionType[] {
  const inicio = TYPES.indexOf('export type SectionType');
  const bloque = TYPES.slice(inicio, TYPES.indexOf(';', inicio));
  return Array.from(bloque.matchAll(/'([a-z_]+)'/g)).map((m) => m[1] as SectionType);
}

const GRUPOS_ESPERADOS: { id: GrupoNavId; nombre: string }[] = [
  { id: 'CONTROL', nombre: 'Inicio y control' },
  { id: 'CARTERA', nombre: 'Cartera y propiedad' },
  { id: 'ECONOMICO', nombre: 'Económico' },
  { id: 'COMERCIAL', nombre: 'Comercial y alquiler' },
  { id: 'OPERACIONES', nombre: 'Operaciones y seguros' },
  { id: 'SISTEMA', nombre: 'Sistema' },
];

/** Orden de render esperado (contrato de UX-1; cualquier cambio es deliberado). */
const ORDEN_ESPERADO: Record<PerfilNavegacion, SectionType[]> = {
  ADMINISTRADOR: [
    'dashboard', 'administracion',
    'inmuebles', 'propietarios', 'inversion', 'inquilinos', 'suministros',
    'cobros', 'tesoreria', 'gastos', 'financiacion', 'conciliacion', 'facturacion', 'fiscal', 'informes', 'morosidad',
    'candidatos', 'preseleccionados', 'seguro_impago', 'formalizacion', 'recomercializacion', 'analisis',
    'incidencias', 'operaciones', 'polizas', 'actas',
    'configuracion', 'ayuda',
  ],
  PROPIETARIO: [
    'dashboard',
    'propietarios', 'inmuebles', 'inversion', 'suministros',
    'cobros', 'tesoreria', 'gastos', 'financiacion', 'conciliacion', 'facturacion', 'fiscal', 'informes',
    'formalizacion', 'recomercializacion',
    'incidencias', 'operaciones', 'polizas', 'actas',
    'configuracion', 'ayuda',
  ],
  PROFESIONAL: ['administracion', 'inmuebles', 'cobros', 'formalizacion', 'configuracion', 'ayuda'],
};

const PERFILES: PerfilNavegacion[] = ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'];

// ── A. Catálogo ──────────────────────────────────────────────────────────────
describe('UX-1 · A — Catálogo de navegación', () => {
  it('todas las entradas tienen grupo, perfiles y textos, y declaran un icono', () => {
    expect(NAVEGACION.length).toBeGreaterThan(0);
    const idsGrupo = GRUPOS_NAVEGACION.map((g) => g.id);
    for (const def of NAVEGACION) {
      expect(idsGrupo).toContain(def.grupo);
      expect(def.perfiles.length).toBeGreaterThan(0);
      expect(typeof def.etiquetas.porDefecto).toBe('string');
      expect(def.etiquetas.porDefecto.length).toBeGreaterThan(0);
      expect(typeof def.descripciones.porDefecto).toBe('string');
      expect(def.descripciones.porDefecto.length).toBeGreaterThan(0);
      expect(def.icono).toBeTruthy();
    }
  });

  it('no hay secciones duplicadas en el catálogo', () => {
    const secciones = NAVEGACION.map((d) => d.section);
    expect(new Set(secciones).size).toBe(secciones.length);
  });

  it('todas las secciones del catálogo están declaradas en SectionType y son navegables hoy', () => {
    const declaradas = new Set(seccionesDeclaradas());
    for (const def of NAVEGACION) expect(declaradas.has(def.section)).toBe(true);
    // Secciones fuera de alcance de UX-1 (D-1 y D-3): no se ofrece ninguna.
    const fueraDeAlcance: SectionType[] = ['inicio', 'solicitudes', 'cuestionario', 'nuevo_candidato', 'mi_perfil', 'mis_profesionales', 'mis_contratos', 'mis_servicios', 'mis_zonas', 'mis_asignaciones'];
    for (const s of fueraDeAlcance) expect(seccionesDePerfil('ADMINISTRADOR')).not.toContain(s);
  });

  it('el orden es determinista: grupos según GRUPOS_NAVEGACION y entradas según el catálogo', () => {
    for (const perfil of PERFILES) {
      const grupos = gruposDePerfil(perfil, { gestorPatrimonial: true });
      // Grupos en el orden aprobado, sin huecos ni grupos vacíos
      expect(grupos.map((g) => g.id)).toEqual(
        GRUPOS_ESPERADOS.map((g) => g.id).filter((id) => grupos.some((g) => g.id === id))
      );
      // Los dos accesos (por grupos y plano) exponen exactamente la misma secuencia
      expect(grupos.flatMap((g) => g.items.map((i) => i.id))).toEqual([...seccionesDePerfil(perfil, { gestorPatrimonial: true })]);
      // Estable entre llamadas (catálogo puro, sin estado)
      expect(seccionesDePerfil(perfil, { gestorPatrimonial: true })).toEqual(seccionesDePerfil(perfil, { gestorPatrimonial: true }));
    }
  });

  it('el ajuste de orden por perfil está declarado de forma explícita y acotada', () => {
    const conAjuste = NAVEGACION.filter((d) => d.ordenPorPerfil);
    expect(conAjuste.map((d) => d.section)).toEqual(['propietarios']);
    // No altera a los demás perfiles
    expect(seccionesDePerfil('ADMINISTRADOR').indexOf('inmuebles')).toBeLessThan(seccionesDePerfil('ADMINISTRADOR').indexOf('propietarios'));
    expect(seccionesDePerfil('PROPIETARIO').indexOf('propietarios')).toBeLessThan(seccionesDePerfil('PROPIETARIO').indexOf('inmuebles'));
  });

  it('no se devuelven grupos sin entradas para el perfil', () => {
    for (const perfil of PERFILES) {
      for (const grupo of gruposDePerfil(perfil)) expect(grupo.items.length).toBeGreaterThan(0);
    }
  });

  it('las entradas del PROFESIONAL se resuelven por rol GESTOR_PATRIMONIAL (resto incondicional)', () => {
    for (const def of NAVEGACION) {
      expect(itemDisponible(def, 'PROFESIONAL', {})).toBe(def.perfiles.includes('PROFESIONAL') && !def.requiereGestorPatrimonial);
      expect(itemDisponible(def, 'PROFESIONAL', { gestorPatrimonial: true })).toBe(def.perfiles.includes('PROFESIONAL'));
      // El rol delegado sólo afecta a PROFESIONAL
      for (const otro of ['ADMINISTRADOR', 'PROPIETARIO'] as PerfilNavegacion[]) {
        expect(itemDisponible(def, otro, {})).toBe(itemDisponible(def, otro, { gestorPatrimonial: true }));
      }
    }
  });

  it('perfilNavegacionDe conserva el comportamiento previo del shell', () => {
    expect(perfilNavegacionDe('ADMINISTRADOR')).toBe('ADMINISTRADOR');
    expect(perfilNavegacionDe('PROPIETARIO')).toBe('PROPIETARIO');
    expect(perfilNavegacionDe('PROFESIONAL')).toBe('PROFESIONAL');
    // No contemplado (p. ej. INQUILINO, que nunca monta el menú del ERP) → menú de administración
    expect(perfilNavegacionDe('INQUILINO')).toBe('ADMINISTRADOR');
    expect(perfilNavegacionDe(undefined)).toBe('ADMINISTRADOR');
  });
});

// ── B. Perfiles ──────────────────────────────────────────────────────────────
describe('UX-1 · B — Navegación por perfil', () => {
  it('ADMINISTRADOR: 28 destinos en el orden aprobado', () => {
    const s = seccionesDePerfil('ADMINISTRADOR');
    expect(s).toEqual(ORDEN_ESPERADO.ADMINISTRADOR);
    expect(s.length).toBe(28);
  });

  it('PROPIETARIO: 21 destinos, sin secciones de gestión interna', () => {
    const s = seccionesDePerfil('PROPIETARIO');
    expect(s).toEqual(ORDEN_ESPERADO.PROPIETARIO);
    expect(s.length).toBe(21);
    for (const prohibida of ['inquilinos', 'morosidad', 'candidatos', 'preseleccionados', 'seguro_impago', 'analisis', 'administracion'] as SectionType[]) {
      expect(s).not.toContain(prohibida);
    }
    // Conservadas explícitamente (invariante del BLOQUE E, sin regresión de navegación)
    for (const requerida of ['suministros', 'incidencias', 'inmuebles', 'formalizacion', 'cobros', 'tesoreria', 'actas'] as SectionType[]) {
      expect(s).toContain(requerida);
    }
  });

  it('PROFESIONAL sin rol delegado: 4 destinos; con GESTOR_PATRIMONIAL: 6', () => {
    const sin = seccionesDePerfil('PROFESIONAL');
    expect(sin).toEqual(['administracion', 'inmuebles', 'configuracion', 'ayuda']);
    const con = seccionesDePerfil('PROFESIONAL', { gestorPatrimonial: true });
    expect(con).toEqual(ORDEN_ESPERADO.PROFESIONAL);
    expect(con.length).toBe(6);
    for (const interna of ['morosidad', 'candidatos', 'inquilinos', 'propietarios', 'tesoreria'] as SectionType[]) {
      expect(con).not.toContain(interna);
    }
  });

  it('los tres perfiles reciben etiquetas e iconos resueltos (sin huecos)', () => {
    for (const perfil of PERFILES) {
      for (const def of definicionesDePerfil(perfil, { gestorPatrimonial: true })) {
        expect(etiquetaDeItem(def, perfil).length).toBeGreaterThan(0);
        expect(iconoDeItem(def, perfil)).toBeTruthy();
      }
    }
  });
});

// ── D. Guard ─────────────────────────────────────────────────────────────────
describe('UX-1 · D — Invariante menú ⊆ acceso (guard intacto)', () => {
  const guardPropietario = guardDeApp('SECCIONES_PROPIETARIO');
  const guardProfesional = guardDeApp('SECCIONES_PROFESIONAL');

  it('el guard real sigue declarado en App.tsx y no se ha tocado para UX-1', () => {
    expect(guardPropietario).toContain('suministros');
    expect(guardPropietario).not.toContain('inquilinos');
    expect(guardPropietario).not.toContain('morosidad');
    expect(guardProfesional).toContain('inversion');
    expect(APP).toContain("if (currentUser?.tipoPerfil === 'PROPIETARIO') return SECCIONES_PROPIETARIO;");
  });

  it('el menú ofrecido nunca excede el acceso existente', () => {
    const permitidasPropietario = new Set<SectionType>(guardPropietario);
    for (const s of seccionesDePerfil('PROPIETARIO')) expect(permitidasPropietario.has(s)).toBe(true);

    // El profesional con rol delegado recibe además formalizacion/cobros (mismo añadido que el host).
    const permitidasProfesional = new Set<SectionType>([...guardProfesional, 'formalizacion', 'cobros']);
    for (const opciones of [{}, { gestorPatrimonial: true }]) {
      for (const s of seccionesDePerfil('PROFESIONAL', opciones)) expect(permitidasProfesional.has(s)).toBe(true);
    }
  });
});

// ── E. Grupos ────────────────────────────────────────────────────────────────
describe('UX-1 · E — Seis grupos aprobados', () => {
  it('son exactamente seis, con los nombres y el orden confirmados', () => {
    expect(GRUPOS_NAVEGACION.map((g) => ({ id: g.id, nombre: g.nombre }))).toEqual(GRUPOS_ESPERADOS);
  });

  it('cada sección pertenece a un grupo válido y aparece en él', () => {
    for (const perfil of PERFILES) {
      const grupos = gruposDePerfil(perfil, { gestorPatrimonial: true });
      for (const grupo of grupos) {
        for (const item of grupo.items) {
          const def = NAVEGACION.find((d) => d.section === item.id)!;
          expect(def.grupo).toBe(grupo.id);
        }
      }
    }
  });

  it('ADMINISTRADOR: composición de cada grupo', () => {
    const porGrupo = Object.fromEntries(gruposDePerfil('ADMINISTRADOR').map((g) => [g.id, g.items.map((i) => i.id)]));
    expect(porGrupo).toEqual({
      CONTROL: ['dashboard', 'administracion'],
      CARTERA: ['inmuebles', 'propietarios', 'inversion', 'inquilinos', 'suministros'],
      ECONOMICO: ['cobros', 'tesoreria', 'gastos', 'financiacion', 'conciliacion', 'facturacion', 'fiscal', 'informes', 'morosidad'],
      COMERCIAL: ['candidatos', 'preseleccionados', 'seguro_impago', 'formalizacion', 'recomercializacion', 'analisis'],
      OPERACIONES: ['incidencias', 'operaciones', 'polizas', 'actas'],
      SISTEMA: ['configuracion', 'ayuda'],
    });
  });

  it('PROPIETARIO y PROFESIONAL sólo reciben grupos con contenido', () => {
    expect(gruposDePerfil('PROPIETARIO').map((g) => g.id)).toEqual(['CONTROL', 'CARTERA', 'ECONOMICO', 'COMERCIAL', 'OPERACIONES', 'SISTEMA']);
    expect(gruposDePerfil('PROFESIONAL').map((g) => g.id)).toEqual(['CONTROL', 'CARTERA', 'SISTEMA']);
    expect(gruposDePerfil('PROFESIONAL', { gestorPatrimonial: true }).map((g) => g.id)).toEqual(['CONTROL', 'CARTERA', 'ECONOMICO', 'COMERCIAL', 'SISTEMA']);
  });
});

// ── F. Etiquetas ─────────────────────────────────────────────────────────────
describe('UX-1 · F — Nomenclatura confirmada (D-4)', () => {
  const etiqueta = (section: SectionType, perfil: PerfilNavegacion) => {
    const def = NAVEGACION.find((d) => d.section === section && d.perfiles.includes(perfil))!;
    return etiquetaDeItem(def, perfil);
  };

  it('dashboard → «Centro de Control» para ADMINISTRADOR y PROPIETARIO', () => {
    expect(etiqueta('dashboard', 'ADMINISTRADOR')).toBe('Centro de Control');
    expect(etiqueta('dashboard', 'PROPIETARIO')).toBe('Centro de Control');
  });

  it('administracion → «Administración y Seguridad» para ADMINISTRADOR', () => {
    expect(etiqueta('administracion', 'ADMINISTRADOR')).toBe('Administración y Seguridad');
  });

  it('no coexisten dos destinos distintos con el mismo nombre visible por perfil', () => {
    for (const perfil of PERFILES) {
      const etiquetas = definicionesDePerfil(perfil, { gestorPatrimonial: true }).map((d) => etiquetaDeItem(d, perfil));
      expect(new Set(etiquetas).size).toBe(etiquetas.length);
    }
  });

  it('las etiquetas por perfil justificadas se conservan explícitamente en el catálogo', () => {
    expect(etiqueta('inmuebles', 'PROPIETARIO')).toBe('Mis Viviendas');
    expect(etiqueta('inmuebles', 'PROFESIONAL')).toBe('Viviendas Asignadas');
    expect(etiqueta('formalizacion', 'PROPIETARIO')).toBe('Mis Contratos');
    expect(etiqueta('cobros', 'PROPIETARIO')).toBe('Mis Cobros');
    expect(etiqueta('tesoreria', 'PROPIETARIO')).toBe('Mis Liquidaciones');
    expect(etiqueta('actas', 'ADMINISTRADOR')).toBe('Actas Entrada/Salida');
    expect(etiqueta('incidencias', 'PROPIETARIO')).toBe('Incidencias');
    expect(etiqueta('administracion', 'PROFESIONAL')).toBe('Mi Portal Profesional');
  });
});

// ── G. data-tour ─────────────────────────────────────────────────────────────
describe('UX-1 · G — Identificadores data-tour de los tutoriales §6', () => {
  it('idTourDeSeccion conserva el patrón `nav-<seccion>`', () => {
    expect(ATRIBUTO_TOUR_NAV).toBe('data-tour');
    expect(idTourDeSeccion('inquilinos')).toBe('nav-inquilinos');
    expect(idTourDeSeccion('tesoreria')).toBe('nav-tesoreria');
    for (const def of NAVEGACION) expect(idTourDeSeccion(def.section)).toBe(`nav-${def.section}`);
  });

  it('los destinos usados por los tutoriales existen en el menú de su perfil', () => {
    const admin = seccionesDePerfil('ADMINISTRADOR');
    expect(admin).toContain('inquilinos'); // RECORRIDO_INVITAR_INQUILINO → nav-inquilinos
    expect(admin).toContain('tesoreria');  // TUTORIAL_LIQUIDACION → nav-tesoreria
  });
});

// ── H. Fail-closed ───────────────────────────────────────────────────────────
describe('UX-1 · H — Fail-closed: capabilities permitidas pero no ofrecidas', () => {
  it('`inversion` no se ofrece al PROFESIONAL aunque el guard se lo permita', () => {
    expect(seccionesDePerfil('PROFESIONAL')).not.toContain('inversion');
    expect(seccionesDePerfil('PROFESIONAL', { gestorPatrimonial: true })).not.toContain('inversion');
    expect(guardDeApp('SECCIONES_PROFESIONAL')).toContain('inversion'); // capacidad existente, menú no la ofrece
  });

  it('el PROFESIONAL tampoco recibe secciones internas de otros ámbitos', () => {
    const s = seccionesDePerfil('PROFESIONAL', { gestorPatrimonial: true });
    for (const otra of ['morosidad', 'candidatos', 'inquilinos', 'propietarios', 'suministros', 'actas', 'polizas'] as SectionType[]) {
      expect(s).not.toContain(otra);
    }
  });
});

// ── Helper de badges (comportamiento previo conservado) ──────────────────────
describe('UX-1 · Badges', () => {
  it('valorBadge replica el criterio anterior (sólo números > 0)', () => {
    expect(valorBadge('cobrosPendientes', { cobrosPendientes: 3 })).toBe(3);
    expect(valorBadge('cobrosPendientes', { cobrosPendientes: 0 })).toBeUndefined();
    expect(valorBadge('cobrosPendientes', {})).toBeUndefined();
    expect(valorBadge(undefined, { cobrosPendientes: 3 })).toBeUndefined();
  });
});
