/**
 * P6 — Orquestación pura del paquete del asesor (sin Firebase).
 * Comprueba el reparto vista previa → empaquetado, la declaración de fuentes
 * no legibles y que un documento inaccesible no tumba el paquete.
 */
import { describe, expect, it } from 'vitest';
import type { ContratoFormalizacion, Gasto, Inmueble, PolizaSeguro, Propietario, UsuarioApp } from '../../types';
import type { Factura } from '../../types/facturacion';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
import type { DocumentoPatrimonial } from '../expedienteDocumental/tipos';
import type { DataAccessScope } from '../firebase';
import type { FuentesCatalogo } from '../importExportFirebase';
import { sha256Hex } from '../importacion/hash';
import { verificarPaqueteAsesorZip } from './verificador';
import type { AmbitoAutorizado } from '../importExport/contrato';
import {
  cargarFuentesCon,
  crearLectorBinariosPaquete,
  empaquetarConBinarios,
  vistaPreviaPaqueteAsesor,
  type CargadorFuentesPaquete,
  type ResultadoCarga,
} from './adaptador';

const USUARIO = {
  id: 'u1', email: 'u@example.com', nombre: 'Usuaria', tipoPerfil: 'PROPIETARIO', propietarioId: 'p1',
} as unknown as UsuarioApp;
const SCOPE: DataAccessScope = { tipoPerfil: 'PROPIETARIO', propietarioId: 'p1' };
const AUT: AmbitoAutorizado = {
  propietarioIdsLegibles: ['p1'], propietarioIdsEscribibles: ['p1'], esMaster: false,
};
const GENERADO_EN = '2026-10-20T10:00:00.000Z';

const INMUEBLE = {
  id: 'i1', direccion: 'Calle Mayor 1', ciudad: 'Alicante', propietarioId: 'p1',
  titularesIds: ['p1'], estado: 'alquilado',
} as unknown as Inmueble;

const CONTRATO = {
  id: 'c1', inmuebleId: 'i1', propietarioId: 'p1', candidatoNombre: 'Inquilina',
  fechaInicioContrato: '2024-01-01', rentaMensual: 600, estado: 'FIRMADO',
  registroCobros: [{
    id: 'cob1', contratoId: 'c1', inmuebleId: 'i1', propietarioId: 'p1',
    anio: 2024, mes: 6, periodoMesAnio: '2024-06', fechaPago: '2024-06-03',
    fechaVencimiento: '2024-06-05', importePrevisto: 600, importeRecibido: 600,
    estado: 'RECIBIDO',
  }],
} as unknown as ContratoFormalizacion;

const GASTO = {
  id: 'g1', inmuebleId: 'i1', propietarioId: 'p1', categoria: 'IBI', concepto: 'IBI',
  importe: 100, estado: 'PAGADO', fechaDevengo: '2024-06-10', ejercicioFiscal: 2024,
} as unknown as Gasto;

const BYTES = new TextEncoder().encode('%PDF-1.4 original');

function documento(over: Record<string, unknown> = {}): DocumentoPatrimonial {
  return {
    id: 'd1', inmuebleId: 'i1', propietarioId: 'p1', tipo: 'FACTURA_GASTO',
    nombre: 'Factura.pdf', nombreStorage: 'f.pdf', mimeType: 'application/pdf',
    tamanoBytes: BYTES.byteLength, sha256: sha256Hex(BYTES),
    storagePath: 'inmuebles/i1/documentos_patrimoniales/d1/f.pdf',
    fechaDocumental: '2024-06-10', fechaIncorporacion: '2024-06-11T00:00:00Z',
    actorId: 'p1', actorNombre: 'Propietaria', version: 1, estado: 'DISPONIBLE',
    ...over,
  } as unknown as DocumentoPatrimonial;
}

function cargador(over: Partial<CargadorFuentesPaquete> = {}, documentos: DocumentoPatrimonial[] = [documento()]): CargadorFuentesPaquete {
  const catalogo: FuentesCatalogo = {
    propietarios: [{ id: 'p1', nombre: 'Propietaria' } as Propietario],
    inmuebles: [INMUEBLE], contratos: [CONTRATO], gastos: [GASTO],
  };
  return {
    catalogo: async () => catalogo,
    facturas: async (): Promise<ResultadoCarga<Factura[]>> => ({ datos: [], motivo: null }),
    liquidaciones: async (): Promise<ResultadoCarga<LiquidacionPropietario[]>> => ({ datos: [], motivo: null }),
    polizas: async (): Promise<ResultadoCarga<PolizaSeguro[]>> => ({ datos: [], motivo: null }),
    titularidades: async (): Promise<ResultadoCarga<never[]>> => ({ datos: [], motivo: null }),
    documentos: async () => documentos,
    ...over,
  };
}

describe('P6 · orquestación sin Firebase', () => {
  it('una fuente no legible se declara y NO impide generar el paquete', async () => {
    const fuentes = await cargarFuentesCon(cargador({
      facturas: async () => ({ datos: undefined, motivo: 'sin permiso de listado' }),
      liquidaciones: async () => ({ datos: undefined, motivo: 'sin permiso de liquidaciones' }),
    }), USUARIO, SCOPE);
    expect(fuentes.entrada.facturas).toBeUndefined();
    expect(fuentes.entrada.liquidaciones).toBeUndefined();
    expect(fuentes.disponibilidad.facturas).toContain('sin permiso');
    expect(fuentes.avisos.join(' ')).toContain('sin permiso');
    expect(fuentes.entrada.inmuebles).toHaveLength(1);
    expect(fuentes.rutasStorageDocumentos.get('d1')).toContain('documentos_patrimoniales');

    const paquete = vistaPreviaPaqueteAsesor(fuentes, {
      propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true, incluirResumenEstructurado: true,
    }, AUT, { generatedAt: GENERADO_EN });
    expect(paquete.filas.facturas).toEqual([]);
    expect(paquete.manifest.advertencias.join(' ')).toContain('no se inventa');
    const { resultado } = await empaquetarConBinarios(paquete, {
      rutas: fuentes.rutasStorageDocumentos,
      incluirBinarios: false,
      leer: async () => { throw new Error('no debe leer'); },
    });
    expect(verificarPaqueteAsesorZip(resultado.zip).ok).toBe(true);
  });

  it('un inmueble con documentos ilegibles no impide leer el resto', async () => {
    const fuentes = await cargarFuentesCon(cargador({
      documentos: async (inmuebleId) => {
        if (inmuebleId === 'i1') throw new Error('Rules denegaron la subcolección');
        return [];
      },
    }), USUARIO, SCOPE);
    expect(fuentes.disponibilidad.documentos).toContain('Rules denegaron');
    expect(fuentes.avisos.some((a) => a.includes('Rules denegaron'))).toBe(true);
    expect(fuentes.entrada.documentosPatrimoniales).toEqual([]);
  });

  it('el tope de inmuebles se declara (no se consulta en silencio)', async () => {
    const muchos = { ...cargador(), catalogo: async (): Promise<FuentesCatalogo> => ({
      propietarios: [], inmuebles: [INMUEBLE, { ...INMUEBLE, id: 'i2' } as Inmueble],
      contratos: [], gastos: [],
    }) };
    let consultados = 0;
    const fuentes = await cargarFuentesCon({
      ...muchos,
      documentos: async () => { consultados += 1; return []; },
    }, USUARIO, SCOPE, { maxInmueblesDocumentos: 1 });
    expect(consultados).toBe(1);
    expect(fuentes.disponibilidad.documentos).toContain('1 de 2');
  });

  it('sin binarios la vista previa no lee Storage y declara los documentos pendientes', async () => {
    const fuentes = await cargarFuentesCon(cargador(), USUARIO, SCOPE);
    const paquete = view(fuentes);
    let leidos = 0;
    const { resultado } = await empaquetarConBinarios(paquete, {
      rutas: fuentes.rutasStorageDocumentos,
      incluirBinarios: false,
      leer: async () => { leidos += 1; return BYTES; },
    });
    expect(leidos).toBe(0);
    expect(resultado.manifest.incluyeBinariosDocumentales).toBe(false);
    expect(resultado.documentos[0]?.estado).toBe('PENDIENTE_BINARIO');
    expect(resultado.entradas.map((e) => e.ruta)).toContain('documentos.json');
    const informe = verificarPaqueteAsesorZip(resultado.zip);
    expect(informe.problemas.filter((p) => p.nivel === 'ERROR'), JSON.stringify(informe.problemas)).toEqual([]);
  });

  it('un documento que Storage deniega se declara NO_ACCESIBLE y el ZIP sigue válido', async () => {
    const fuentes = await cargarFuentesCon(cargador({
      documentos: async () => [
        documento(),
        documento({ id: 'd2', nombre: 'Sin objeto.pdf', storagePath: 'inmuebles/i1/documentos_patrimoniales/d2/x.pdf' }),
      ],
    }), USUARIO, SCOPE);
    const paquete = view(fuentes);
    const { resultado, avisos } = await empaquetarConBinarios(paquete, {
      rutas: fuentes.rutasStorageDocumentos,
      incluirBinarios: true,
      leer: async (ruta) => {
        if (ruta.includes('/d2/')) {
          const error = new Error('denegado') as Error & { code?: string };
          error.code = 'storage/unauthorized';
          throw error;
        }
        return BYTES;
      },
    });
    expect(resultado.documentos.find((d) => d.documentoId === 'd1')?.estado).toBe('INCLUIDO');
    expect(resultado.documentos.find((d) => d.documentoId === 'd2')?.estado).toBe('NO_ACCESIBLE');
    expect(resultado.manifest.numDocumentosIncluidos).toBe(1);
    expect(resultado.manifest.numDocumentosNoIncluidos).toBe(1);
    expect(resultado.manifest.advertencias.join(' ')).toContain('NO_ACCESIBLE');
    expect(avisos.join(' ')).toContain('no pudieron incluirse');
    expect(verificarPaqueteAsesorZip(resultado.zip).ok).toBe(true);
  });

  it('un documento sobredimensionado no se incluye (cota por documento)', async () => {
    const fuentes = await cargarFuentesCon(cargador(), USUARIO, SCOPE);
    const paquete = view(fuentes);
    const { resultado, avisos } = await empaquetarConBinarios(paquete, {
      rutas: fuentes.rutasStorageDocumentos,
      incluirBinarios: true,
      leer: async () => new Uint8Array(2048),
      maxBytesPorDocumento: 1024,
    });
    expect(resultado.documentos[0]?.estado).toBe('NO_ACCESIBLE');
    expect(resultado.manifest.incluyeBinariosDocumentales).toBe(false);
    expect(resultado.manifest.advertencias.join(' ')).toContain('TAMANO_EXCESIVO');
  });

  it('el lector de binarios exige ruta registrada (no adivina Storage)', async () => {
    const leer = crearLectorBinariosPaquete(new Map(), async () => BYTES);
    await expect(leer({
      documentoId: 'd1',
    } as never)).rejects.toMatchObject({ code: 'storage/object-not-found' });
  });
});

function view(fuentes: Awaited<ReturnType<typeof cargarFuentesCon>>) {
  return vistaPreviaPaqueteAsesor(fuentes, {
    propietarioIds: ['p1'], ejercicios: [2024], incluirDocumentos: true,
  }, AUT, { generatedAt: GENERADO_EN });
}
