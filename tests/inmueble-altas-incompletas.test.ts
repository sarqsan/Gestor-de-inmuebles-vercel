/**
 * ALTAS INCOMPLETAS POR IMPORTACIÓN (datos SINTÉTICOS, sin Firestore).
 *
 * Demuestra con el pipeline REAL (ejecutarImportDryRun + construirInmueblePatrimonialDestino):
 *  · una fila con sólo dirección y titular se da de alta (AUTO) y el resto queda pendiente;
 *  · una fila sin dirección queda INCOMPLETA sin impedir las demás;
 *  · la cuota del archivo se conserva como RENTA DECLARADA, nunca como `precio`;
 *  · ningún campo ausente se rellena con 0, «NaN», ciudad, estado o fianza inventados;
 *  · la presentación de datos pendientes nunca muestra «NaN €» ni «Alquilado» falso.
 */
import { describe, expect, it } from 'vitest';
import { ejecutarImportDryRun } from '../src/lib/importExport/pipeline';
import { construirInmueblePatrimonialDestino } from '../src/lib/importExport/altaInmueble';
import { parseJson } from '../src/lib/importExport/jsonParser';
import { generarXlsx, parseXlsx, type ColumnaXlsx } from '../src/lib/importExport';
import {
  camposPendientesInmueble,
  estadoInmuebleEtiqueta,
  precioMensualTexto,
  rentaDeclaradaInmueble,
  valorNumericoEditable,
} from '../src/lib/inmuebleCompletitud';

const CATALOGO: any = {
  propietarios: [{ id: 'prop_A', nombre: 'Titular sintético', nifCif: '11111111A', estadoAcceso: 'ACTIVO' }],
  inmuebles: [], contratos: [], mapeos: [], existentes: [],
  propietariosPermitidosIds: ['prop_A'],
  importador: { uid: 'u_sintetico', modalidad: 'PROPIETARIO' },
};

const FICHERO = JSON.stringify([
  { id: 'SYN-1', direccion: 'Calle Sintetica Cuatro 4' },
  { id: 'SYN-2', direccion: 'Calle Sintetica Cinco 5', ciudad: 'Alicante', precio: 650 },
  { id: 'SYN-3', ciudad: 'Alicante' },
  { id: 'SYN-4', direccion: 'Calle Sintetica Seis 6' },
]);

function ejecutar(conTitular: boolean[]) {
  const parseo = parseJson(FICHERO, {} as never);
  const registros = parseo.registros as Record<string, unknown>[];
  return ejecutarImportDryRun({
    registrosCrudos: registros,
    localizaciones: parseo.localizaciones,
    entityType: 'INMUEBLE',
    formato: 'JSON',
    sourceName: 'sintetico-altas-incompletas.json',
    sourceHash: 'hash_altas_incompletas_1',
    sourceTamanoBytes: FICHERO.length,
    sourceType: 'EXTERNAL',
    schemaVersionSource: undefined,
    catalogos: CATALOGO,
    fechaHora: '2026-10-12T10:00:00.000Z',
    actor: 'prop_A',
    parches: registros.map((_, i) => (conTitular[i] ? { propietarioDestinoId: 'prop_A' } : null)),
  } as never);
}

describe('filas: éxito parcial sin bloqueo global', () => {
  const run = ejecutar([true, true, true, false]);
  const porId = (id: string) => run.registros.find((r) => r.sourceRecordId === id)!;

  it('sólo dirección + titular ⇒ AUTO (alta)', () => {
    expect(porId('SYN-1').decision).toBe('AUTO');
  });

  it('dirección + cuota + titular ⇒ AUTO (alta con renta declarada)', () => {
    expect(porId('SYN-2').decision).toBe('AUTO');
  });

  it('sin dirección ⇒ INCOMPLETO con motivo concreto, sin afectar a las demás', () => {
    const r = porId('SYN-3');
    expect(r.decision).toBe('INCOMPLETO');
    expect(r.motivo).toContain('direccion');
    expect(porId('SYN-1').decision).toBe('AUTO');
  });

  it('sin titular determinable ⇒ INCOMPLETO explicado; no se asigna titular inventado', () => {
    const r = porId('SYN-4');
    expect(r.decision).toBe('INCOMPLETO');
    expect(r.propietarioDestinoId).toBeNull();
  });
});

describe('alta patrimonial: sólo lo que el archivo declara', () => {
  const run = ejecutar([true, true, true, false]);
  const alta = (id: string) => {
    const r = run.registros.find((x) => x.sourceRecordId === id)!;
    return construirInmueblePatrimonialDestino(r, { fechaHora: '2026-10-12T10:00:00.000Z', actor: 'prop_A' });
  };

  it('sin cuota: no se escribe renta ni precio, y no aparecen valores por defecto', () => {
    const inm = alta('SYN-1') as unknown as Record<string, unknown>;
    expect(inm.direccion).toBe('Calle Sintetica Cuatro 4');
    expect(inm.propietarioId).toBe('prop_A');
    for (const campo of ['precio', 'rentaMensual', 'rentaMensualDeclarada', 'estado', 'ciudad', 'fianzaMeses', 'banos', 'habitaciones', 'superficie', 'candidatosCount']) {
      expect(inm, `campo «${campo}» no debe inventarse`).not.toHaveProperty(campo);
    }
  });

  it('con cuota: se conserva como renta DECLARADA y NUNCA como precio de publicación', () => {
    const inm = alta('SYN-2') as unknown as Record<string, unknown>;
    expect(inm.rentaMensualDeclarada).toBe(650);
    expect(inm).not.toHaveProperty('precio');
    expect(inm).not.toHaveProperty('rentaMensual');
    expect(inm).not.toHaveProperty('estado');
    expect(inm.ciudad).toBe('Alicante');
  });
});

describe('presentación de datos pendientes (sin NaN ni estados falsos)', () => {
  const formato = (n: number) => `${n} €`;

  it('un inmueble importado sin precio no muestra «NaN €» sino «Precio pendiente»', () => {
    expect(precioMensualTexto({ id: 'x' } as never, formato)).toBe('Precio pendiente');
    expect(precioMensualTexto({ id: 'x', precio: 650 } as never, formato)).toBe('650 €/mes');
  });

  it('sin estado declarado no se afirma ni «Alquilado» ni «Disponible»', () => {
    expect(estadoInmuebleEtiqueta({ id: 'x' } as never)).toBe('Estado pendiente');
    expect(estadoInmuebleEtiqueta({ id: 'x', estado: 'disponible' } as never)).toBe('Disponible');
    expect(estadoInmuebleEtiqueta({ id: 'x', estado: 'alquilado' } as never)).toBe('Alquilado');
  });

  it('lista los campos pendientes de un alta mínima', () => {
    const pendientes = camposPendientesInmueble({ id: 'x', direccion: 'Calle', propietarioId: 'prop_A' } as never);
    expect(pendientes).toEqual(expect.arrayContaining(['Ciudad', 'Precio mensual', 'Estado (disponible / alquilado)', 'Fianza (meses)']));
    expect(pendientes).not.toContain('Dirección');
  });

  it('la renta declarada es un dato propio, no el precio', () => {
    expect(rentaDeclaradaInmueble({ id: 'x', rentaMensualDeclarada: 650 } as never)).toBe(650);
    expect(rentaDeclaradaInmueble({ id: 'x', precio: 650 } as never)).toBeUndefined();
  });
});

describe('edición: un campo vacío es «no indicado», nunca 0', () => {
  it('cadena vacía o no numérica ⇒ undefined (no se escribe 0 inventado)', () => {
    expect(valorNumericoEditable('')).toBeUndefined();
    expect(valorNumericoEditable('   ')).toBeUndefined();
    expect(valorNumericoEditable('abc')).toBeUndefined();
    expect(valorNumericoEditable('0')).toBe(0);
    expect(valorNumericoEditable('650')).toBe(650);
  });
});

describe('mismo criterio para JSON y Excel (pipeline y alta comunes)', () => {
  const CABECERAS = ['ID Inmueble', 'Dirección Completa', 'Titularidad', 'Renta Mensual (€)'];
  const FILAS: Record<string, unknown>[] = [
    { 'ID Inmueble': 'SYN-X1', 'Dirección Completa': 'Calle Sintetica Diez 10', Titularidad: 'Propietario único', 'Renta Mensual (€)': 640 },
    { 'ID Inmueble': 'SYN-X2', 'Dirección Completa': '', Titularidad: 'Propietario único', 'Renta Mensual (€)': '' },
  ];
  const libro = (): Uint8Array => {
    const columnas: ColumnaXlsx[] = CABECERAS.map((nombre) => ({ nombre, tipo: nombre.includes('€') ? 'numero' : 'texto' }));
    return generarXlsx([{ nombre: 'Inmuebles', columnas, filas: FILAS }]);
  };
  const correr = (registros: Record<string, unknown>[], formato: 'JSON' | 'XLSX', hash: string, localizaciones: string[]) =>
    ejecutarImportDryRun({
      registrosCrudos: registros,
      localizaciones,
      entityType: 'INMUEBLE',
      formato,
      sourceName: `sintetico-paridad.${formato.toLowerCase()}`,
      sourceHash: hash,
      sourceTamanoBytes: 1024,
      sourceType: 'EXTERNAL',
      schemaVersionSource: undefined,
      catalogos: CATALOGO,
      fechaHora: '2026-10-12T10:00:00.000Z',
      actor: 'prop_A',
      parches: registros.map((_, i) => (i === 0 ? { propietarioDestinoId: 'prop_A' } : null)),
    } as never);

  const porJson = correr(parseJson(JSON.stringify(FILAS), {} as never).registros as Record<string, unknown>[], 'JSON', 'hash_paridad_json', ['1', '2']);
  const xlsx = parseXlsx(libro());
  const porXlsx = correr(xlsx.registros as Record<string, unknown>[], 'XLSX', 'hash_paridad_xlsx', ['1', '2']);

  it('las mismas filas producen las mismas decisiones en ambos formatos', () => {
    expect(porXlsx.registros.map((r) => r.decision)).toEqual(porJson.registros.map((r) => r.decision));
    expect(porJson.registros.map((r) => r.decision)).toEqual(['AUTO', 'INCOMPLETO']);
  });

  it('la fila incompleta explica el dato que falta en ambos formatos, sin afectar a la válida', () => {
    for (const run of [porJson, porXlsx]) {
      expect(run.registros[1]?.motivo).toContain('direccion');
      expect(run.registros[0]?.decision).toBe('AUTO');
    }
  });

  it('el alta resultante contiene los mismos campos declarados en ambos formatos (cuota → renta declarada)', () => {
    const alta = (run: typeof porJson) => {
      const { id: _id, ...campos } = construirInmueblePatrimonialDestino(run.registros[0]!, { fechaHora: '2026-10-12T10:00:00.000Z', actor: 'prop_A' }) as unknown as Record<string, unknown>;
      void _id;
      return campos;
    };
    const aJson = alta(porJson);
    const aXlsx = alta(porXlsx);
    expect(aXlsx.direccion).toBe(aJson.direccion);
    expect(aXlsx.rentaMensualDeclarada).toBe(aJson.rentaMensualDeclarada);
    expect(aJson.rentaMensualDeclarada).toBe(640);
    for (const campo of ['precio', 'rentaMensual']) {
      expect(aJson).not.toHaveProperty(campo);
      expect(aXlsx).not.toHaveProperty(campo);
    }
  });
});
