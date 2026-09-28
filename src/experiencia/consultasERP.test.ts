import { describe, expect, it } from 'vitest';
import { ROLES_PREDEFINIDOS } from '../types';
import type { CobroPeriodo, Gasto, Incidencia } from '../types';
import { contextoDesdeUsuario, ejecutarConsultaERP, resolverPeticion } from './index';
import type { FuentesConsultaERP } from './consultasERP';

const permisosAdmin = ROLES_PREDEFINIDOS.find((r) => r.id === 'SUPERADMIN')!.permisos;
const permisosProp = ROLES_PREDEFINIDOS.find((r) => r.id === 'PROPIETARIO_ESTANDAR')!.permisos;
const fuentes: FuentesConsultaERP = {
  inmuebleIdsAutorizados: ['casa-a'],
  gastos: [
    { id: 'g-a', inmuebleId: 'casa-a', propietarioId: 'p1', tipo: 'EXPLOTACION', categoria: 'REPARACION', concepto: 'Reparación', importe: 100, estado: 'PAGADO', aCargoDe: 'arrendador', fechaDevengo: '2026-02-01', deducible: true, createdAt: '2026-02-01', updatedAt: '2026-02-01' } as Gasto,
    { id: 'g-b', inmuebleId: 'casa-b', propietarioId: 'p2', tipo: 'EXPLOTACION', categoria: 'REPARACION', concepto: 'No debe filtrarse', importe: 999, estado: 'PAGADO', aCargoDe: 'arrendador', fechaDevengo: '2026-02-01', deducible: true, createdAt: '2026-02-01', updatedAt: '2026-02-01' } as Gasto,
  ],
  cobros: [
    { id: 'c-a', inmuebleId: 'casa-a', propietarioId: 'p1', contratoId: 'ct1', inquilinoId: 'i1', mes: 1, anio: 2026, periodoMesAnio: '2026-01', nombreMes: 'Enero 2026', importePrevisto: 800, importeRecibido: 200, fechaVencimiento: '2026-01-05', estado: 'PENDIENTE' } as CobroPeriodo,
    { id: 'c-b', inmuebleId: 'casa-b', propietarioId: 'p2', contratoId: 'ct2', inquilinoId: 'i2', mes: 1, anio: 2026, periodoMesAnio: '2026-01', nombreMes: 'Enero 2026', importePrevisto: 990, importeRecibido: 0, fechaVencimiento: '2026-01-05', estado: 'PENDIENTE' } as CobroPeriodo,
  ],
  incidencias: [
    { id: 'inc-a', inmuebleId: 'casa-a', propietarioId: 'p1', titulo: 'Avería', descripcion: 'Detalle privado', categoria: 'CALEFACCION_ACS', prioridad: 'MEDIA', estado: 'ABIERTA', origen: 'PROPIETARIO' } as Incidencia,
    { id: 'inc-b', inmuebleId: 'casa-b', propietarioId: 'p2', titulo: 'Otra', descripcion: 'Privada', categoria: 'CALEFACCION_ACS', prioridad: 'MEDIA', estado: 'ABIERTA', origen: 'PROPIETARIO' } as Incidencia,
  ],
};

const contextoAdmin = (section = 'inmuebles', entityId?: string) => contextoDesdeUsuario({ tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'], permisos: permisosAdmin }, section, entityId ? { entityType: 'inmueble', entityId } : {});
const contextoPropietario = (entityId?: string) => contextoDesdeUsuario({ tipoPerfil: 'PROPIETARIO', roles: ['PROPIETARIO_ESTANDAR'], permisos: permisosProp }, 'inmuebles', entityId ? { entityType: 'inmueble', entityId } : {});

describe('BLOQUE 9 · consultas sobre motores oficiales', () => {
  it('el fallback local conserva un ejercicio fiscal explícito y el validador rechaza años fuera de rango', async () => {
    const request2025 = await resolverPeticion('gastos del ejercicio 2025', contextoAdmin());
    expect(request2025.estado).toBe('RESUELTA');
    expect(request2025.parametros.ejercicio).toBe(2025);
    const invalido = await resolverPeticion('gastos del ejercicio 1999', contextoAdmin());
    expect(invalido.estado).toBe('ERROR');
    expect(invalido.errores).toContain('Parámetro «ejercicio» debe ser un ejercicio entre 2000 y 2100');
  });

  it('usa el motor fiscal y acota por inmueble verificado antes de agregar', () => {
    const resultado = ejecutarConsultaERP('cap.gastos.ejercicio', { ejercicio: 2026 }, contextoAdmin('inmuebles', 'casa-a'), fuentes);
    expect(resultado.estado).toBe('OK');
    expect(resultado.motorOficial).toContain('fiscalEngine.calcularGastosEjercicio');
    expect(resultado.ambito).toBe('INMUEBLE');
    expect(resultado.hechos.find((h) => h.etiqueta === 'Gasto total según el motor')?.valor).toBe(100);
    expect(JSON.stringify(resultado)).not.toContain('No debe filtrarse');
    expect(JSON.stringify(resultado)).not.toContain('g-a');
  });

  it('usa el motor oficial de cobros y no incluye importes de otro inmueble', () => {
    const resultado = ejecutarConsultaERP('cap.cobros.ejercicio', { ejercicio: 2026 }, contextoPropietario('casa-a'), fuentes);
    expect(resultado.estado).toBe('OK');
    expect(resultado.motorOficial).toContain('cobrosEngine.calcularResumenCobros');
    expect(resultado.hechos.find((h) => h.etiqueta === 'Importe pendiente')?.valor).toBe(600);
  });

  it('incidencias solo devuelve el conteo agregado, no títulos, descripciones ni IDs', () => {
    const resultado = ejecutarConsultaERP('cap.incidencias.abiertas', {}, contextoAdmin('inmuebles', 'casa-a'), fuentes);
    expect(resultado.estado).toBe('OK');
    expect(resultado.hechos).toEqual([{ etiqueta: 'Incidencias no cerradas', valor: 1, formato: 'NUMERO' }]);
    expect(JSON.stringify(resultado)).not.toMatch(/Detalle privado|inc-a|Otra/);
  });

  it('un ID inventado o no incluido en el ámbito verificado se rechaza; un rol sin capacidad no consulta', () => {
    const fueraDeAlcance = ejecutarConsultaERP('cap.gastos.ejercicio', {}, contextoAdmin('inmuebles', 'casa-b'), fuentes);
    expect(fueraDeAlcance.estado).toBe('NO_DISPONIBLE');
    const sinPermiso = ejecutarConsultaERP('cap.gastos.ejercicio', {}, contextoDesdeUsuario({ tipoPerfil: 'INQUILINO', roles: ['INQUILINO_PORTAL'], permisos: [] }, 'inmuebles'), fuentes);
    expect(sinPermiso.estado).toBe('NO_DISPONIBLE');
    expect(sinPermiso.hechos).toEqual([]);
  });

  it('sin registros del ejercicio devuelve SIN_DATOS sin inventar ceros', () => {
    const vacias = { ...fuentes, gastos: [], cobros: [], incidencias: [] };
    const resultado = ejecutarConsultaERP('cap.gastos.ejercicio', { ejercicio: 2025 }, contextoAdmin(), vacias);
    expect(resultado.estado).toBe('SIN_DATOS');
    expect(resultado.hechos).toEqual([]);
    expect(resultado.resumen).toMatch(/No hay registros/);
  });
});
