/**
 * IA · FASE 2 + 7 — POLÍTICA DE GOBIERNO (src/ia/gobiernoIAContrato.ts)
 * =====================================================================
 * Módulo puro: sin red, sin Firebase y sin consumo del proveedor.
 *
 * Cubre: la política POR DEFECTO ya NO concede nada (deny-by-default, Fase 7),
 * la validación es TODO O NADA (cuatro perfiles declarados, tarifa de las 12
 * operaciones y cuotas finitas), rechaza roles inventados / operaciones fuera
 * del catálogo / comodines / valores no enteros, el resumen marca lo pendiente
 * de aprobación y las funciones de permiso y coste.
 */
import { describe, expect, it } from 'vitest';
import { OPERACIONES_IA, type IdOperacionIA } from '../src/ia/catalogoOperacionesIA';
import {
  CUOTAS_IA_REFERENCIA,
  PERMISOS_IA_REFERENCIA,
  TARIFAS_IA_REFERENCIA,
  VARIABLE_ENTORNO_POLITICA_IA,
  construirPoliticaIACompleta,
  costeOperacion,
  permiteOperacion,
  politicaCompletaIA,
  politicaGobiernoIADesdeEntorno,
  resumenPoliticaGobiernoIA,
  validarPoliticaGobiernoIA,
  type TipoPerfilIA,
} from '../src/ia/gobiernoIAContrato';

describe('IA Fase 2 + 7 · política por defecto (deny-by-default, consumo bloqueado)', () => {
  it('sin IA_POLITICA_JSON la política por defecto NO concede ninguna operación y declara cuotas finitas', () => {
    const resultado = politicaGobiernoIADesdeEntorno({});
    expect(resultado.estado).toBe('VALIDA');
    if (resultado.estado !== 'VALIDA') throw new Error(resultado.error);
    const politica = resultado.politica;
    expect(politica.origen).toBe('POR_DEFECTO');
    // FASE 7 · sin comodines: los cuatro perfiles quedan declarados y vacíos.
    for (const perfil of ['PROPIETARIO', 'PROFESIONAL', 'INQUILINO', 'ADMINISTRADOR'] as TipoPerfilIA[]) {
      expect(politica.permisos[perfil]).toEqual([]);
      for (const { id } of OPERACIONES_IA) {
        expect(permiteOperacion(politica, perfil, id), `${perfil} → ${id}`).toBe(false);
      }
    }
    // Sin tarifas implícitas: la tabla de referencia está declarada (no se hereda nada).
    expect(politica.costeCreditosPorOperacion).toEqual(TARIFAS_IA_REFERENCIA);
    expect(politica.cuotas).toEqual(CUOTAS_IA_REFERENCIA);
    expect(politica.cuotas.operacionesPorDia).toBeGreaterThan(0);
    expect(politica.cuotas.operacionesPorMes).toBeGreaterThan(0);
    // Y aun así NO puede gobernar el consumo: la política efectiva no está declarada.
    expect(resumenPoliticaGobiernoIA(politica).politicaCompleta).toBe(false);
    expect(resumenPoliticaGobiernoIA(politica).pendienteAprobacionComercial).toBe(true);
  });

  it('la plantilla versionada sí está completa: 4 perfiles, 12 tarifas finitas y cuotas finitas', () => {
    const plantilla = construirPoliticaIACompleta();
    expect(politicaCompletaIA(plantilla)).toBe(true);
    expect(validarPoliticaGobiernoIA(plantilla).estado).toBe('VALIDA');
    const resumen = resumenPoliticaGobiernoIA(plantilla);
    expect(resumen.politicaCompleta).toBe(true);
    expect(resumen.pendienteAprobacionComercial).toBe(false);
    expect(Object.keys(plantilla.costeCreditosPorOperacion)).toHaveLength(OPERACIONES_IA.length);
    for (const { id } of OPERACIONES_IA) {
      expect(Number.isInteger(plantilla.costeCreditosPorOperacion[id])).toBe(true);
      expect(plantilla.costeCreditosPorOperacion[id]).toBeGreaterThanOrEqual(0);
    }
    for (const perfil of ['PROPIETARIO', 'PROFESIONAL', 'INQUILINO', 'ADMINISTRADOR'] as TipoPerfilIA[]) {
      expect(plantilla.permisos[perfil]).toEqual(PERMISOS_IA_REFERENCIA[perfil]);
      expect(plantilla.permisos[perfil].length).toBeGreaterThan(0);
    }
  });

  it('el resumen marca las tarifas como PENDIENTES DE APROBACIÓN cuando no hay política comercial', () => {
    const porDefecto = politicaGobiernoIADesdeEntorno({});
    if (porDefecto.estado !== 'VALIDA') throw new Error(porDefecto.error);
    const resumen = resumenPoliticaGobiernoIA(porDefecto.politica);
    expect(resumen.pendienteAprobacionComercial).toBe(true);
    expect(resumen.origen).toBe('POR_DEFECTO');
    expect(Object.keys(resumen.costeCreditosPorOperacion)).toHaveLength(OPERACIONES_IA.length);
    for (const { id } of OPERACIONES_IA) {
      // FASE 7 · sin política declarada ningún perfil tiene ámbitos concedidos.
      expect(resumen.perfilesPorOperacion[id]).toEqual([]);
    }
  });

  it('con la política COMPLETA declarada (ENTORNO) el resumen deja de estar pendiente', () => {
    const resultado = politicaGobiernoIADesdeEntorno({
      [VARIABLE_ENTORNO_POLITICA_IA]: JSON.stringify(construirPoliticaIACompleta({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } })),
    });
    expect(resultado.estado).toBe('VALIDA');
    if (resultado.estado !== 'VALIDA') throw new Error(resultado.error);
    const politica = resultado.politica;
    expect(politica.origen).toBe('ENTORNO');
    expect(politica.costeCreditosPorOperacion.REDACTAR_CLAUSULA).toBe(2);
    const resumen = resumenPoliticaGobiernoIA(politica);
    expect(resumen.pendienteAprobacionComercial).toBe(false);
    expect(resumen.politicaCompleta).toBe(true);
  });

  it('una política DECLARADA pero incompleta sigue pendiente (huecos = sin aprobación)', () => {
    // Fusión directa: se permite construir el objeto con huecos para comprobar que el
    // resumen y el núcleo los tratan como NO aprobados (nunca como valores implícitos).
    const politica = construirPoliticaIACompleta();
    const incompleta = { ...politica, costeCreditosPorOperacion: { ...politica.costeCreditosPorOperacion } } as Record<string, unknown>;
    delete (incompleta.costeCreditosPorOperacion as Record<string, number>).REDACTAR_CLAUSULA;
    const resumen = resumenPoliticaGobiernoIA(incompleta as never);
    expect(resumen.politicaCompleta).toBe(false);
    expect(resumen.pendienteAprobacionComercial).toBe(true);
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

  it('FASE 7 · el comodín «*» ya no se admite en ninguna forma', () => {
    const r = validarPoliticaGobiernoIA({ permisos: { INQUILINO: ['*', 'REDACTAR_CLAUSULA'] } });
    expect(r.estado).toBe('INVALIDA');
    expect(r.estado === 'INVALIDA' && r.error).toMatch(/comodín|\*/);
    expect(validarPoliticaGobiernoIA({ permisos: { INQUILINO: '*' } }).estado).toBe('INVALIDA');
  });

  it('FASE 7 · una política parcial es INVÁLIDA: faltan perfiles, tarifas o cuotas', () => {
    const sinPerfiles = validarPoliticaGobiernoIA({ permisos: { INQUILINO: ['ANALIZAR_INCIDENCIA'] } });
    expect(sinPerfiles.estado).toBe('INVALIDA');
    expect(sinPerfiles.estado === 'INVALIDA' && sinPerfiles.error).toMatch(/faltan perfiles/i);
    // Sólo tarifas: tampoco (falta declarar los permisos de los cuatro perfiles).
    const soloTarifas = validarPoliticaGobiernoIA({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } });
    expect(soloTarifas.estado).toBe('INVALIDA');
    expect(soloTarifas.estado === 'INVALIDA' && soloTarifas.error).toMatch(/permisos/i);
    // Permisos completos y sólo UNA tarifa: falta la tarifa del resto del catálogo.
    const sinTarifa = validarPoliticaGobiernoIA({
      ...construirPoliticaIACompleta(),
      costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 },
    });
    expect(sinTarifa.estado).toBe('INVALIDA');
    expect(sinTarifa.estado === 'INVALIDA' && sinTarifa.error).toMatch(/tarifa/i);
    const sinCuotas = validarPoliticaGobiernoIA({
      permisos: construirPoliticaIACompleta().permisos,
      costeCreditosPorOperacion: construirPoliticaIACompleta().costeCreditosPorOperacion,
    });
    expect(sinCuotas.estado).toBe('INVALIDA');
    expect(sinCuotas.estado === 'INVALIDA' && sinCuotas.error).toMatch(/cuotas/i);
  });

  it('FASE 7 · las cuotas ilimitadas («null») y las listas vacías declaradas tampoco valen como hueco', () => {
    expect(validarPoliticaGobiernoIA({ cuotas: { operacionesPorDia: null } }).estado).toBe('INVALIDA');
    expect(validarPoliticaGobiernoIA({ cuotas: { operacionesPorMes: null } }).estado).toBe('INVALIDA');
    // La lista vacía sí se admite como ámbito DECLARADO de un perfil…
    const conPerfilVacio = construirPoliticaIACompleta({ permisos: { PROFESIONAL: [] } });
    expect(validarPoliticaGobiernoIA(conPerfilVacio).estado).toBe('VALIDA');
    const valida = validarPoliticaGobiernoIA(conPerfilVacio);
    if (valida.estado !== 'VALIDA') return;
    expect(permiteOperacion(valida.politica, 'PROFESIONAL', 'ANALIZAR_INSPECCION')).toBe(false);
    expect(permiteOperacion(valida.politica, 'INQUILINO', 'ASISTENTE_INCIDENCIAS_INQUILINO')).toBe(true);
  });

  it('una sobrescritura de perfil SUSTITUYE su ámbito completo (no se acumula)', () => {
    const r = validarPoliticaGobiernoIA(construirPoliticaIACompleta({ permisos: { INQUILINO: ['ANALIZAR_INCIDENCIA'] } }));
    expect(r.estado).toBe('VALIDA');
    if (r.estado !== 'VALIDA') return;
    expect(permiteOperacion(r.politica, 'INQUILINO', 'ANALIZAR_INCIDENCIA')).toBe(true);
    expect(permiteOperacion(r.politica, 'INQUILINO', 'ASISTENTE_INCIDENCIAS_INQUILINO')).toBe(false);
    expect(permiteOperacion(r.politica, 'ADMINISTRADOR', 'REDACTAR_CLAUSULA')).toBe(true);
  });

  it('JSON ilegible en el entorno ⇒ INVALIDA (fallo cerrado, nunca permisivo)', () => {
    const r = politicaGobiernoIADesdeEntorno({ [VARIABLE_ENTORNO_POLITICA_IA]: '{esto no es json' });
    expect(r.estado).toBe('INVALIDA');
    expect(r.estado === 'INVALIDA' && r.error).toContain(VARIABLE_ENTORNO_POLITICA_IA);
  });
});

describe('IA Fase 2 · permiso y coste por operación', () => {
  it('permiteOperacion consulta el ámbito declarado y costeOperacion devuelve la tarifa declarada', () => {
    const r = validarPoliticaGobiernoIA(construirPoliticaIACompleta({
      permisos: { PROPIETARIO: ['REDACTAR_CLAUSULA', 'ESTIMAR_PRICING'] },
      costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 3, ESTIMAR_PRICING: 0 },
    }));
    expect(r.estado).toBe('VALIDA');
    if (r.estado !== 'VALIDA') return;
    const ids: IdOperacionIA[] = ['REDACTAR_CLAUSULA', 'ESTIMAR_PRICING', 'ANALIZAR_INCIDENCIA'];
    expect(ids.map((id) => permiteOperacion(r.politica, 'PROPIETARIO', id))).toEqual([true, true, false]);
    expect(costeOperacion(r.politica, 'REDACTAR_CLAUSULA')).toBe(3);
    expect(costeOperacion(r.politica, 'ESTIMAR_PRICING')).toBe(0);
    // Toda operación tiene tarifa declarada: ninguna cae a un 0 implícito.
    for (const { id } of OPERACIONES_IA) {
      expect(Object.prototype.hasOwnProperty.call(r.politica.costeCreditosPorOperacion, id)).toBe(true);
    }
  });
});
