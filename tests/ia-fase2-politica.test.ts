/**
 * IA · FASE 2 — POLÍTICA DE GOBIERNO (src/ia/gobiernoIAContrato.ts)
 * =================================================================
 * Módulo puro: sin red, sin Firebase y sin consumo del proveedor.
 *
 * Cubre: los valores POR DEFECTO conservan exactamente el comportamiento de
 * Fase 1 (todos los perfiles activos, coste 0, sin cuotas), la validación
 * rechaza roles inventados / operaciones fuera del catálogo / valores no
 * enteros o negativos, el origen ENTORNO sustituye sólo lo presente, el
 * resumen marca lo pendiente de aprobación y las funciones de permiso y coste.
 */
import { describe, expect, it } from 'vitest';
import { OPERACIONES_IA, type IdOperacionIA } from '../src/ia/catalogoOperacionesIA';
import {
  VARIABLE_ENTORNO_POLITICA_IA,
  costeOperacion,
  permiteOperacion,
  politicaGobiernoIADesdeEntorno,
  resumenPoliticaGobiernoIA,
  validarPoliticaGobiernoIA,
  type TipoPerfilIA,
} from '../src/ia/gobiernoIAContrato';

describe('IA Fase 2 · política por defecto (Fase 1 intacta)', () => {
  it('sin IA_POLITICA_JSON la política es la por defecto: todos los perfiles, coste 0 y sin cuotas', () => {
    const resultado = politicaGobiernoIADesdeEntorno({});
    expect(resultado.estado).toBe('VALIDA');
    if (resultado.estado !== 'VALIDA') throw new Error(resultado.error);
    const politica = resultado.politica;
    expect(politica.origen).toBe('POR_DEFECTO');
    for (const perfil of ['PROPIETARIO', 'PROFESIONAL', 'INQUILINO', 'ADMINISTRADOR'] as TipoPerfilIA[]) {
      for (const { id } of OPERACIONES_IA) {
        expect(permiteOperacion(politica, perfil, id), `${perfil} → ${id}`).toBe(true);
      }
    }
    for (const { id } of OPERACIONES_IA) expect(costeOperacion(politica, id)).toBe(0);
    expect(politica.cuotas).toEqual({ operacionesPorDia: null, operacionesPorMes: null });
  });

  it('el resumen marca las tarifas como PENDIENTES DE APROBACIÓN cuando no hay política comercial', () => {
    const porDefecto = politicaGobiernoIADesdeEntorno({});
    if (porDefecto.estado !== 'VALIDA') throw new Error(porDefecto.error);
    const resumen = resumenPoliticaGobiernoIA(porDefecto.politica);
    expect(resumen.pendienteAprobacionComercial).toBe(true);
    expect(resumen.origen).toBe('POR_DEFECTO');
    expect(Object.keys(resumen.costeCreditosPorOperacion)).toHaveLength(OPERACIONES_IA.length);
    for (const { id } of OPERACIONES_IA) {
      expect(resumen.perfilesPorOperacion[id]).toHaveLength(4);
    }
  });

  it('con costes definidos y aprobados (entorno) el resumen deja de estar pendiente', () => {
    const resultado = politicaGobiernoIADesdeEntorno({
      [VARIABLE_ENTORNO_POLITICA_IA]: JSON.stringify({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } }),
    });
    expect(resultado.estado).toBe('VALIDA');
    if (resultado.estado !== 'VALIDA') throw new Error(resultado.error);
    const politica = resultado.politica;
    expect(politica.origen).toBe('ENTORNO');
    expect(resumenPoliticaGobiernoIA(politica).pendienteAprobacionComercial).toBe(false);
  });
});

describe('IA Fase 2 · validación de la política (nunca un respaldo permisivo)', () => {
  it('null/undefined ⇒ política por defecto válida', () => {
    expect(validarPoliticaGobiernoIA(null).estado).toBe('VALIDA');
    expect(validarPoliticaGobiernoIA(undefined).estado).toBe('VALIDA');
  });

  it('roles inventados se rechazan con error explícito', () => {
    const r = validarPoliticaGobiernoIA({ permisos: { SUPERVILLANO: ['*'] } });
    expect(r.estado).toBe('INVALIDA');
    expect(r.estado === 'INVALIDA' && r.error).toContain('perfil desconocido «SUPERVILLANO»');
  });

  it('operaciones fuera del catálogo se rechazan (permisos y costes)', () => {
    expect(validarPoliticaGobiernoIA({ permisos: { INQUILINO: ['OPERACION_INVENTADA'] } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ costeCreditosPorOperacion: { OPERACION_INVENTADA: 1 } }).estado).toBe('INVALIDA');
  });

  it('costes y cuotas no enteros, negativos o cero (cuotas) se rechazan', () => {
    expect(validarPoliticaGobiernoIA({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: -1 } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 1.5 } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ cuotas: { operacionesPorDia: 0 } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ cuotas: { operacionesPorMes: 2.5 } }).estado).toBe('INVALIDA');
  });

  it('«*» no puede mezclarse con operaciones concretas y las listas no pueden estar vacías', () => {
    expect(validarPoliticaGobiernoIA({ permisos: { INQUILINO: ['*', 'REDACTAR_CLAUSULA'] } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ permisos: { INQUILINO: [] } }).estado).toBe('INVALIDA');
  });

  it('cada sección presente sustituye a la por defecto; las ausentes la conservan', () => {
    const r = validarPoliticaGobiernoIA({ permisos: { INQUILINO: ['ANALIZAR_INCIDENCIA'] } });
    expect(r.estado).toBe('VALIDA');
    if (r.estado !== 'VALIDA') return;
    expect(permiteOperacion(r.politica, 'INQUILINO', 'ANALIZAR_INCIDENCIA')).toBe(true);
    expect(permiteOperacion(r.politica, 'INQUILINO', 'REDACTAR_CLAUSULA')).toBe(false);
    expect(permiteOperacion(r.politica, 'PROPIETARIO', 'REDACTAR_CLAUSULA')).toBe(true);
  });

  it('JSON ilegible en el entorno ⇒ INVALIDA (fallo cerrado, nunca permisivo)', () => {
    const r = politicaGobiernoIADesdeEntorno({ [VARIABLE_ENTORNO_POLITICA_IA]: '{esto no es json' });
    expect(r.estado).toBe('INVALIDA');
    expect(r.estado === 'INVALIDA' && r.error).toContain(VARIABLE_ENTORNO_POLITICA_IA);
  });
});

describe('IA Fase 2 · permiso y coste por operación', () => {
  it('permiteOperacion consulta el ámbito del perfil y costeOperacion devuelve el coste configurado', () => {
    const r = validarPoliticaGobiernoIA({
      permisos: { PROPIETARIO: ['REDACTAR_CLAUSULA', 'ESTIMAR_PRICING'] },
      costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 3 },
    });
    expect(r.estado).toBe('VALIDA');
    if (r.estado !== 'VALIDA') return;
    const ids: IdOperacionIA[] = ['REDACTAR_CLAUSULA', 'ESTIMAR_PRICING', 'ANALIZAR_INCIDENCIA'];
    expect(ids.map((id) => permiteOperacion(r.politica, 'PROPIETARIO', id))).toEqual([true, true, false]);
    expect(costeOperacion(r.politica, 'REDACTAR_CLAUSULA')).toBe(3);
    expect(costeOperacion(r.politica, 'ESTIMAR_PRICING')).toBe(0);
  });
});
