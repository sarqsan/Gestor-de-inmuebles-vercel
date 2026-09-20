/**
 * GAP7 — Reporting de facturación (INTEGRACIÓN con GAP3 sin duplicarlo).
 * ---------------------------------------------------------------------------
 * Funciones PURAS que agregan facturas para informes anuales/IVA/estado
 * VERI*FACTU. NO sustituye a `reportingEngine` ni a `reportGenerator`:
 * devuelve estructuras agregadas que la capa de reporting existente (GAP3)
 * puede mostrar/exportar. El PDF se apoya en el MOLDE `PdfContenido` del motor
 * PDF de GAP3 (`pdfExportEngine`), de modo que no se construye un generador
 * PDF paralelo.
 */

import type { Factura, ResumenFacturacion } from '../types/facturacion';
import type { PdfContenido } from './pdfExportEngine';

function suma(numeros: number[]): number {
  const total = numeros.reduce((a, b) => a + (b || 0), 0);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function resumenFacturacion(facturas: Factura[]): ResumenFacturacion {
  return {
    totalFacturas: facturas.length,
    emitidas: facturas.filter((f) => f.clase === 'EMITIDA' && f.estado !== 'ANULADA').length,
    aceptadas: facturas.filter((f) => f.estado === 'ACEPTADA' || f.estado === 'ACEPTADA_CON_ERRORES').length,
    rechazadas: facturas.filter((f) => f.estado === 'RECHAZADA').length,
    anuladas: facturas.filter((f) => f.estado === 'ANULADA').length,
    rectificativas: facturas.filter((f) => f.tipo.startsWith('R')).length,
    baseImponible: suma(facturas.filter((f) => f.estado !== 'ANULADA').map((f) => f.baseImponible)),
    cuotaIva: suma(facturas.filter((f) => f.estado !== 'ANULADA').map((f) => f.cuotaIva)),
    retenciones: suma(facturas.map((f) => f.cuotaRetencion || 0)),
    importeTotal: suma(facturas.filter((f) => f.estado !== 'ANULADA').map((f) => f.importeTotal)),
  };
}

export interface FacturacionEjercicio {
  ejercicio: number;
  emitidas: number;
  anuladas: number;
  rectificativas: number;
  baseImponible: number;
  cuotaIva: number;
  retenciones: number;
  importeTotal: number;
}

export function facturacionPorEjercicio(facturas: Factura[]): FacturacionEjercicio[] {
  const porEjercicio = new Map<number, Factura[]>();
  for (const f of facturas) porEjercicio.set(f.ejercicio, [...(porEjercicio.get(f.ejercicio) || []), f]);
  return [...porEjercicio.entries()]
    .sort(([a], [b]) => b - a)
    .map(([ejercicio, lista]) => {
      const r = resumenFacturacion(lista);
      return {
        ejercicio,
        emitidas: r.emitidas,
        anuladas: r.anuladas,
        rectificativas: r.rectificativas,
        baseImponible: r.baseImponible,
        cuotaIva: r.cuotaIva,
        retenciones: r.retenciones,
        importeTotal: r.importeTotal,
      };
    });
}

export interface DesgloseIva {
  tipoIva: number;
  baseImponible: number;
  cuotaIva: number;
  lineas: number;
}

export function desgloseIvaFacturacion(facturas: Factura[]): DesgloseIva[] {
  const mapa = new Map<number, { base: number; cuota: number; lineas: number }>();
  for (const f of facturas) {
    if (f.estado === 'ANULADA') continue;
    for (const l of f.lineas) {
      const tipo = l.tipoIva || 0;
      const prev = mapa.get(tipo) || { base: 0, cuota: 0, lineas: 0 };
      mapa.set(tipo, {
        base: prev.base + (l.baseImponible || 0),
        cuota: prev.cuota + (l.cuotaIva || 0),
        lineas: prev.lineas + 1,
      });
    }
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => b - a)
    .map(([tipoIva, v]) => ({
      tipoIva,
      baseImponible: Math.round((v.base + Number.EPSILON) * 100) / 100,
      cuotaIva: Math.round((v.cuota + Number.EPSILON) * 100) / 100,
      lineas: v.lineas,
    }));
}

export interface ResumenVerifactu {
  pendientes: number;
  preparadas: number;
  enviadas: number;
  aceptadas: number;
  rechazadas: number;
  errores: number;
}

/** Estado VERI*FACTU derivado del estado fiscal de las facturas emitidas. */
export function resumenVerifactuFacturacion(facturas: Factura[]): ResumenVerifactu {
  // Las anuladas no participan en la remisión.
  const emitidas = facturas.filter((f) => f.clase === 'EMITIDA' && f.estado !== 'ANULADA');
  const pendiente = (f: Factura) =>
    !f.estadoFiscal || f.estadoFiscal === 'BORRADOR' || f.estadoFiscal === 'PENDIENTE_REMISION' || f.estado === 'EMITIDA';
  return {
    pendientes: emitidas.filter(pendiente).length,
    preparadas: emitidas.filter((f) => f.estadoFiscal === 'PENDIENTE_REMISION').length,
    enviadas: emitidas.filter((f) => f.estadoFiscal === 'ENVIADA').length,
    aceptadas: emitidas.filter((f) => f.estadoFiscal === 'ACEPTADA' || f.estadoFiscal === 'ACEPTADA_CON_ERRORES').length,
    rechazadas: emitidas.filter((f) => f.estadoFiscal === 'RECHAZADA').length,
    errores: emitidas.filter((f) => f.estadoFiscal === 'ERROR').length,
  };
}

/**
 * Contenido PDF de facturación usando el MOLDE de `pdfExportEngine` (GAP3).
 * Se reutiliza el motor PDF existente; no se genera otro.
 */
export function generarContenidoPdfFacturacion(
  facturas: Factura[],
  propietarioId: string,
  propietarioNombre?: string,
  ejercicio?: number
): PdfContenido {
  const alcance = ejercicio ? facturas.filter((f) => f.ejercicio === ejercicio) : facturas;
  const resumen = resumenFacturacion(alcance);
  const porEjercicio = facturacionPorEjercicio(alcance);
  const iva = desgloseIvaFacturacion(alcance);
  const verifactu = resumenVerifactuFacturacion(alcance);

  return {
    titulo: `Facturación ${ejercicio ? `${ejercicio}` : 'acumulada'} - ${propietarioId}`,
    propietarioId,
    propietarioNombre,
    rango: {
      fechaInicio: ejercicio ? `01-01-${ejercicio}` : 'inicio',
      fechaFin: ejercicio ? `31-12-${ejercicio}` : 'hoy',
      periodo: ejercicio ? `Ejercicio ${ejercicio}` : 'Acumulado',
    },
    fechaGeneracion: new Date().toISOString(),
    secciones: [
      {
        titulo: 'Resumen de facturación',
        lineas: [
          `Facturas: ${resumen.totalFacturas}`,
          `Emitidas: ${resumen.emitidas}`,
          `Rectificativas: ${resumen.rectificativas}`,
          `Anuladas: ${resumen.anuladas}`,
          `Base imponible: ${resumen.baseImponible} €`,
          `Cuota IVA: ${resumen.cuotaIva} €`,
          `Retenciones: ${resumen.retenciones} €`,
          `Importe total: ${resumen.importeTotal} €`,
        ],
      },
      {
        titulo: 'Desglose por tipo de IVA',
        lineas: iva.map((d) => `IVA ${d.tipoIva}% — base ${d.baseImponible} € / cuota ${d.cuotaIva} € (${d.lineas} líneas)`),
      },
      {
        titulo: 'Por ejercicio',
        lineas: porEjercicio.map(
          (e) => `${e.ejercicio}: ${e.emitidas} emitidas, ${e.rectificativas} rectificativas, ${e.anuladas} anuladas — total ${e.importeTotal} €`
        ),
      },
      {
        titulo: 'Estado VERI*FACTU',
        lineas: [
          `Pendientes: ${verifactu.pendientes}`,
          `Preparadas: ${verifactu.preparadas}`,
          `Enviadas: ${verifactu.enviadas}`,
          `Aceptadas: ${verifactu.aceptadas}`,
          `Rechazadas: ${verifactu.rechazadas}`,
          `Errores: ${verifactu.errores}`,
        ],
      },
    ],
    notaAEAT:
      'Registro de facturación con huella/hash SHA-256 encadenada conforme a la especificación AEAT v0.1.2 (preparación VERI*FACTU). La remisión real a la AEAT queda pendiente de certificados/URL oficiales.',
  };
}
