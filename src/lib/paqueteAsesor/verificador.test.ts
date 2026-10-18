/**
 * FASE F (continuación) — Verificador independiente: manifiesto, SHA-256,
 * integridad ZIP/CRC y cuadre recalculado desde los bytes del paquete.
 * Todo sintético; el paquete base se genera con el motor y luego se MANIPULA
 * a nivel de bytes/entradas para comprobar que el verificador lo detecta y
 * que NUNCA muta ni reconstruye el paquete verificado.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CobroPeriodo, ContratoFormalizacion, Gasto, Inmueble } from '../../types';
import type { Factura } from '../../types/facturacion';
import { crearZip, utf8Bytes, type EntradaZip } from '../expedienteFiscal/zip';
import { empaquetarPaqueteAsesor, generarPaqueteAsesor } from './motor';
import type { AmbitoAutorizado } from '../importExport/contrato';
import type { EntradaPaqueteAsesor } from './tipos';
import {
  leerEntradasZipPaqueteAsesor,
  verificarPaqueteAsesorZip,
} from './verificador';

const generadoEn = '2026-10-18T10:00:00.000Z';
const autorizado: AmbitoAutorizado = {
  esMaster: false, propietarioIdsLegibles: ['prop-1'],
  propietarioIdsEscribibles: ['prop-1'],
};

function inmueble(id: string): Inmueble {
  return {
    id, direccion: `Calle ${id}`, propietarioId: 'prop-1', propietarioPrincipalId: 'prop-1',
    propietarioNombre: 'Persona Uno', ciudad: 'Alicante', referenciaCatastral: `RC-${id}`,
    estado: 'alquilado', tipoInmueble: 'piso',
  } as unknown as Inmueble;
}

function cobro(id: string, extra: Partial<CobroPeriodo> = {}): CobroPeriodo {
  return {
    id, contratoId: 'c1', inmuebleId: 'inm-1', propietarioId: 'prop-1',
    anio: 2025, mes: 2, nombreMes: 'Febrero', periodoMesAnio: '2025-02',
    fechaVencimiento: '2025-02-05', fechaPago: '2025-02-05',
    importePrevisto: 600, importeRecibido: 600, estado: 'COBRADO',
    inquilinoNombre: 'Inquilina', inmuebleDireccion: 'Calle inm-1',
    ...extra,
  } as unknown as CobroPeriodo;
}

function gasto(id: string, extra: Partial<Gasto> = {}): Gasto {
  return {
    id, inmuebleId: 'inm-1', propietarioId: 'prop-1', fechaDevengo: '2025-03-10',
    categoria: 'MANTENIMIENTO', concepto: `Gasto ${id}`, importe: 121,
    estado: 'PAGADO', esDeducible: true, ...extra,
  } as unknown as Gasto;
}

function factura(id: string, extra: Partial<Factura> = {}): Factura {
  return {
    id, propietarioId: 'prop-1', inmuebleId: 'inm-1', clase: 'EMITIDA', tipo: 'COMPLETA',
    serie: 'A', numero: 1, ejercicio: 2025, fechaExpedicion: '10-03-2025',
    baseImponible: 100, cuotaIva: 21, cuotaRetencion: 0, importeTotal: 121,
    estado: 'EMITIDA', ...extra,
  } as unknown as Factura;
}

function entrada(extra: Partial<EntradaPaqueteAsesor> = {}): EntradaPaqueteAsesor {
  return {
    inmuebles: [inmueble('inm-1')],
    contratos: [{
      id: 'c1', inmuebleId: 'inm-1', propietarioId: 'prop-1',
      candidatoNombre: 'Inquilina', fechaInicioContrato: '2024-06-01',
      rentaMensual: 600, estado: 'ACTIVO', registroCobros: [cobro('cob-1')],
    } as unknown as ContratoFormalizacion],
    gastos: [gasto('g1', { facturaId: 'f1', documento: { nombre: 'factura-f1.pdf' } } as Partial<Gasto>)],
    facturas: [factura('f1')],
    liquidaciones: [],
    polizas: [],
    ...extra,
  };
}

function zipBase(ent: EntradaPaqueteAsesor = entrada()): Uint8Array {
  const paquete = generarPaqueteAsesor(ent, { propietarioIds: ['prop-1'], ejercicios: [2025] }, autorizado, {
    generatedAt: generadoEn, generatedBy: 'test',
  });
  return empaquetarPaqueteAsesor(paquete).zip;
}

function erroresDe(informe: { problemas: { codigo: string; nivel: string }[] }): string[] {
  return informe.problemas.filter((p) => p.nivel === 'ERROR').map((p) => p.codigo);
}

/** Re-empaca las ENTRADAS del zip con una manipulada (CRC correctos y nuevos). */
function zipConEntradaManipulada(
  zip: Uint8Array, nombre: string, manipular: (texto: string) => string,
): Uint8Array {
  const dec = new TextDecoder('utf-8');
  const { entradas } = leerEntradasZipPaqueteAsesor(zip);
  const nuevas: EntradaZip[] = entradas.map((e) => (e.nombre === nombre
    ? { ruta: e.nombre, contenido: utf8Bytes(manipular(dec.decode(e.bytes))) }
    : { ruta: e.nombre, contenido: e.bytes }));
  return crearZip(nuevas);
}

describe('Fase F · verificador independiente', () => {
  it('verifica un paquete generado por el motor (solo advertencias de límite)', () => {
    const zip = zipBase();
    const r = verificarPaqueteAsesorZip(zip);
    expect(erroresDe(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.numEntradasZip).toBe(12);
    expect(r.paqueteId).toMatch(/^[0-9a-f]{64}$/);
    expect(r.schema).toBe('erp-paquete-asesor-v1');
    // Límites declarados, no escondidos:
    expect(r.problemas.map((p) => p.codigo)).toContain('PAQUETE_ID_NO_RECOMPUTABLE_DESDE_ZIP');
  });

  it('no muta los bytes verificados ni reconstruye nada', () => {
    const zip = zipBase();
    const copia = new Uint8Array(zip);
    verificarPaqueteAsesorZip(zip);
    expect(Buffer.compare(Buffer.from(zip), Buffer.from(copia))).toBe(0);
  });

  it('detecta un byte manipulado en los datos (CRC y/o SHA-256 fallan) y no lo repara', () => {
    const zip = new Uint8Array(zipBase());
    const { entradas } = leerEntradasZipPaqueteAsesor(zip);
    const libro = entradas.find((e) => e.nombre === 'libro-ingresos-gastos.csv')!;
    zip[libro.datosOffset + 10] = zip[libro.datosOffset + 10] ^ 0xff;
    const r = verificarPaqueteAsesorZip(zip);
    expect(r.ok).toBe(false);
    expect(erroresDe(r)).toContain('CRC32_NO_COINCIDE');
    expect(erroresDe(r)).toContain('HASH_NO_COINCIDE');
  });

  it('detecta un manifiesto con el total inflado (los hashes no protegen las cifras: el recálculo sí)', () => {
    const zip = zipConEntradaManipulada(zipBase(), 'manifest.json', (t) => {
      const m = JSON.parse(t);
      m.totales.totalIngresos = 9999;
      return JSON.stringify(m, null, 2);
    });
    const r = verificarPaqueteAsesorZip(zip);
    expect(r.ok).toBe(false);
    expect(erroresDe(r)).toContain('TOTAL_NO_CUADRA');
    // El resto de la cadena (hashes de entradas) sigue siendo coherente:
    expect(erroresDe(r)).not.toContain('HASH_NO_COINCIDE');
  });

  it('detecta una línea del libro eliminada (cuadre libro↔fuentes y totales)', () => {
    const zip = zipConEntradaManipulada(zipBase(), 'libro-ingresos-gastos.csv', (t) => {
      const lineas = t.split('\n');
      return [lineas[0], ...lineas.slice(1).filter((l) => !l.includes('cob-1'))].join('\n');
    });
    const r = verificarPaqueteAsesorZip(zip);
    expect(r.ok).toBe(false);
    expect(erroresDe(r)).toContain('HASH_NO_COINCIDE'); // el CSV ya no es el firmado
    expect(erroresDe(r)).toContain('CUADRE_COBRO_DISTINTO_LIBRO');
    expect(erroresDe(r)).toContain('TOTAL_NO_CUADRA');
  });

  it('detecta la eliminación de la incidencia que identificaba una referencia documental', () => {
    const zip = zipConEntradaManipulada(zipBase(), 'incidencias.json', (t) => {
      const arr = (JSON.parse(t) as { codigo: string }[])
        .filter((i) => i.codigo !== 'DOCUMENTO_SIN_BINARIO_VERIFICABLE');
      return JSON.stringify(arr, null, 2);
    });
    const r = verificarPaqueteAsesorZip(zip);
    expect(r.ok).toBe(false);
    expect(erroresDe(r)).toContain('REFERENCIA_DOCUMENTAL_NO_IDENTIFICADA');
    expect(erroresDe(r)).toContain('NUM_INCIDENCIAS_NO_COINCIDE');
  });

  it('detecta una entrada ausente y un ZIP con bytes huérfanos', () => {
    const { entradas } = leerEntradasZipPaqueteAsesor(zipBase());
    const sinInforme = crearZip(
      entradas.filter((e) => e.nombre !== 'informe.txt')
        .map((e) => ({ ruta: e.nombre, contenido: e.bytes })),
    );
    const r1 = verificarPaqueteAsesorZip(sinInforme);
    expect(r1.ok).toBe(false);
    expect(erroresDe(r1)).toContain('ENTRADA_AUSENTE');

    const bueno = zipBase();
    const conCola = new Uint8Array(bueno.length + 4);
    conCola.set(bueno); conCola.set([0xde, 0xad, 0xbe, 0xef], bueno.length);
    const r2 = verificarPaqueteAsesorZip(conCola);
    expect(r2.ok).toBe(false);
    expect(erroresDe(r2)).toContain('ZIP_ESTRUCTURA_INVALIDA');
  });

  it('detecta un ZIP truncado y uno que no es ZIP', () => {
    const truncado = verificarPaqueteAsesorZip(zipBase().subarray(0, 60));
    expect(truncado.ok).toBe(false);
    expect(erroresDe(truncado)).toContain('ZIP_ESTRUCTURA_INVALIDA');
    const basura = verificarPaqueteAsesorZip(utf8Bytes('esto no es un zip pero ocupa bytes'));
    expect(basura.ok).toBe(false);
  });

  it('contrasta el paqueteId esperado cuando se aporta (sin fingir re-derivarlo)', () => {
    const zip = zipBase();
    const { paqueteId } = verificarPaqueteAsesorZip(zip);
    expect(verificarPaqueteAsesorZip(zip, { paqueteIdEsperado: paqueteId! }).ok).toBe(true);
    const mal = verificarPaqueteAsesorZip(zip, { paqueteIdEsperado: '0'.repeat(64) });
    expect(mal.ok).toBe(false);
    expect(erroresDe(mal)).toContain('PAQUETE_ID_DISTINTO_ESPERADO');
  });

  it('un paquete con duplicados/exclusiones identificadas sigue verificado (cuadre explicado)', () => {
    const dup = entrada({
      gastos: [
        gasto('g1', { facturaId: 'f1', documento: { nombre: 'factura-f1.pdf' } } as Partial<Gasto>),
        gasto('g-dup', { importe: 30 }),
        gasto('g-dup', { importe: 30 }),
        gasto('g-conf', { importe: 10 }),
        gasto('g-conf', { importe: 99 }),
      ],
    });
    const r = verificarPaqueteAsesorZip(zipBase(dup));
    expect(erroresDe(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('exige incidencia para un desglose de factura que no suma el total', () => {
    const zipOk = zipBase(entrada({ facturas: [factura('f1', { importeTotal: 999 })] }));
    // El motor ya lo identifica ⇒ verifica (la discrepancia está declarada).
    expect(erroresDe(verificarPaqueteAsesorZip(zipOk))).toEqual([]);
    // Si alguien borra esa identificación, el verificador lo marca error.
    const sinIdentificar = zipConEntradaManipulada(zipOk, 'incidencias.json', (t) => {
      const arr = (JSON.parse(t) as { codigo: string }[])
        .filter((i) => i.codigo !== 'FACTURA_DESGLOSE_NO_COINCIDE');
      return JSON.stringify(arr, null, 2);
    });
    expect(erroresDe(verificarPaqueteAsesorZip(sinIdentificar))).toContain('DISCREPANCIA_NO_IDENTIFICADA');
  });

  it('frontera: verificador.ts no importa el motor ni toca red/reloj/Firebase', () => {
    const cod = readFileSync(join(process.cwd(), 'src/lib/paqueteAsesor/verificador.ts'), 'utf8');
    expect(cod).not.toMatch(/from '\.\/motor'/);
    expect(cod).not.toMatch(/firebase|firestore|new Date\(\)|Date\.now/);
    expect(cod).not.toMatch(/\bfetch\(|XMLHttpRequest/);
  });
});
