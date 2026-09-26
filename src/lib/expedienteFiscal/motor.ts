/**
 * B6 — MOTOR DE EXPEDIENTE FISCAL (solo lectura + generación).
 *
 * Reutiliza el motor fiscal existente (`generarResumenFiscalAnual` de
 * src/utils/fiscalEngine.ts) en lugar de duplicarlo. Recibe los datos por
 * parámetro (puro): CERO lecturas/escrituras directas a Firestore/Storage.
 *
 * Reglas que implementa:
 *  - No inventa movimientos; no convierte agregados históricos en movimientos.
 *  - Los desgloses calculados (intereses/capital) son `noAcumulable`: no
 *    duplican el importe del gasto del que proceden.
 *  - Documentos no disponibles → PENDIENTE + incidencia; nunca se inventan.
 *  - Determinismo: mismo input + mismo `generatedAt` ⇒ mismo binario ZIP.
 */
import type { Gasto } from '../../types';
import {
  generarResumenFiscalAnual,
  type ResumenFiscalAnual,
} from '../../utils/fiscalEngine';
import { sha256Hex } from '../importacion/hash';
import { resolverAmbito } from './ambito';
import { crearZip, utf8Bytes, type EntradaZip } from './zip';
import {
  CATEGORIAS_CONOCIDAS,
  EXPEDIENTE_SCHEMA,
  type AmbitoExportacion,
  type ContextoActor,
  type DocumentoExpediente,
  type EntradaExpediente,
  type ExpedienteFiscal,
  type IncidenciaExpediente,
  type MovimientoExpediente,
  type ResolverBinarios,
} from './tipos';

// ---------------------------------------------------------------------------
// Utilidades deterministas
// ---------------------------------------------------------------------------

/** JSON con claves ordenadas (serialización canónica). */
export function stringifyDeterminista(valor: unknown): string {
  const ordenar = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(ordenar);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = ordenar((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(ordenar(valor), null, 2);
}

function fechaMovimiento(g: Gasto): string {
  return g.fechaDevengo || g.fechaPago || g.fecha || '';
}

/** Sanea PII de conceptos (B6.7): por defecto NO viajan nombres de inquilinos. */
function sanearConcepto(concepto: string, incluirPII: boolean): string {
  if (incluirPII) return concepto;
  return concepto.replace(/\s*-\s*[^-]*$/, '').trim() || concepto;
}

// ---------------------------------------------------------------------------
// Generación del expediente
// ---------------------------------------------------------------------------

export interface OpcionesGeneracion {
  /** ISO explícito; el motor NUNCA llama a Date.now() (reproducibilidad). */
  generatedAt: string;
}

export async function generarExpedienteFiscal(
  entrada: EntradaExpediente,
  ambito: AmbitoExportacion,
  contexto: ContextoActor,
  opciones: OpcionesGeneracion
): Promise<ExpedienteFiscal> {
  const resuelto = resolverAmbito(ambito, entrada.inmuebles);
  const incidencias: IncidenciaExpediente[] = [];
  const movimientos: MovimientoExpediente[] = [];
  const documentos: DocumentoExpediente[] = [];
  const resumenes: ResumenFiscalAnual[] = [];
  const idsSeleccion = new Set(resuelto.inmuebles.map((i) => i.id));

  // -- Validaciones previas sobre los gastos que tocan el ámbito (B6.9) -----
  const gastosAmbito = entrada.gastos.filter((g) => idsSeleccion.has(g.inmuebleId));
  for (const g of entrada.gastos) {
    if (!g.inmuebleId || !idsSeleccion.has(g.inmuebleId)) {
      if (!g.inmuebleId) {
        incidencias.push({ codigo: 'MOV_SIN_INMUEBLE', severidad: 'CRITICA', descripcion: `Gasto ${g.id} sin inmuebleId`, entidad: 'gasto', id: g.id });
      }
      continue;
    }
    if (!fechaMovimiento(g)) {
      incidencias.push({ codigo: 'MOV_SIN_FECHA', severidad: 'CRITICA', descripcion: `Gasto ${g.id} sin fecha (devengo/pago/alias)`, entidad: 'gasto', id: g.id });
    }
    if (typeof g.importe !== 'number' || !isFinite(g.importe) || g.importe < 0) {
      incidencias.push({ codigo: 'IMPORTE_INVALIDO', severidad: 'CRITICA', descripcion: `Gasto ${g.id} con importe inválido: ${g.importe}`, entidad: 'gasto', id: g.id });
    }
    if (!CATEGORIAS_CONOCIDAS.includes(g.categoria)) {
      incidencias.push({ codigo: 'CATEGORIA_DESCONOCIDA', severidad: 'AVISO', descripcion: `Gasto ${g.id} con categoría no reconocida: ${g.categoria}`, entidad: 'gasto', id: g.id });
    }
  }
  // Duplicados de origen: se CONSERVAN y se señalan (nunca se eliminan).
  // Iteración en orden de id para que la incidencia sea determinista.
  const vistos = new Map<string, string>();
  for (const g of [...gastosAmbito].sort((a, b) => a.id.localeCompare(b.id))) {
    if (g.origenId) {
      const clave = `${g.origen}|${g.origenId}|${g.concepto}|${g.importe}`;
      const previo = vistos.get(clave);
      if (previo) {
        incidencias.push({ codigo: 'DUP_ORIGEN', severidad: 'AVISO', descripcion: `Gastos ${previo} y ${g.id} comparten origen ${g.origenId} con mismo concepto/importe; se conservan ambos`, entidad: 'gasto', id: g.id });
      } else {
        vistos.set(clave, g.id);
      }
    }
  }

  // -- Núcleo: motor fiscal existente por (inmueble × ejercicio) ------------
  for (const inmueble of resuelto.inmuebles) {
    for (const ejercicio of resuelto.ejercicios) {
      const resumen = generarResumenFiscalAnual(
        inmueble.id, ejercicio, entrada.inmuebles, entrada.contratos, entrada.gastos
      );
      if (!resumen) continue;
      resumenes.push(resumen);

      // Ingresos = cobros existentes (DERIVADO: sin cálculo nuevo del importe).
      for (const cobro of resumen.ingresos.cobros) {
        if (cobro.estado === 'ANULADO') continue;
        if (cobro.estado === 'IMPAGADO') {
          incidencias.push({ codigo: 'INCIDENCIA_FISCAL', severidad: 'AVISO', descripcion: `Cobro ${cobro.id} IMPAGADO en ${ejercicio} (no genera ingreso)`, entidad: 'cobro', id: cobro.id });
          continue;
        }
        const recibido = cobro.importeRecibido || 0;
        if (recibido <= 0) continue;
        if (!cobro.contratoId) {
          incidencias.push({ codigo: 'RELACION_INCOMPLETA', severidad: 'AVISO', descripcion: `Cobro ${cobro.id} sin contratoId`, entidad: 'cobro', id: cobro.id });
        }
        const fecha = cobro.fechaPago || cobro.fechaVencimiento || '';
        if (!fecha) {
          incidencias.push({ codigo: 'MOV_SIN_FECHA', severidad: 'CRITICA', descripcion: `Cobro ${cobro.id} sin fecha`, entidad: 'cobro', id: cobro.id });
        }
        movimientos.push({
          movimientoId: `INGRESO:${cobro.id}`,
          inmuebleId: inmueble.id,
          ejercicio,
          fecha,
          concepto: sanearConcepto(`Alquiler ${cobro.nombreMes}`, contexto.incluirPII === true),
          importe: recibido,
          categoria: 'ARRENDAMIENTO',
          tipo: 'INGRESO',
          origen: 'COBRO',
          origenId: cobro.id,
          clasificacion: 'DERIVADO',
          fuente: `contratos_formalizacion/${cobro.contratoId}/registroCobros → cobros/${cobro.id}`,
        });
      }

      // Gastos = documentos almacenados (ALMACENADO).
      for (const g of resumen.gastos.gastos) {
        if (g.estado === 'ANULADO') continue;
        const fecha = fechaMovimiento(g);
        // Importe inválido o sin fecha: ya denunciado en validaciones; no se
        // emite movimiento (no se corrige el dato, se excluye y se reporta).
        if (!fecha || typeof g.importe !== 'number' || !isFinite(g.importe) || g.importe < 0) continue;
        const docRef = g.documento || (g.documentos && g.documentos[0]);
        movimientos.push({
          movimientoId: `GASTO:${g.id}`,
          inmuebleId: inmueble.id,
          ejercicio,
          fecha,
          concepto: sanearConcepto(g.concepto, contexto.incluirPII === true),
          importe: g.importe,
          categoria: g.categoria,
          tipo: 'GASTO',
          origen: g.origen || 'GASTO',
          origenId: g.origenId || g.id,
          referenciaDocumental: docRef ? `doc_${docRef.id}` : undefined,
          clasificacion: 'ALMACENADO',
          fuente: `gastos/${g.id}`,
        });
        // Desgloses financieros: CALCULADO y noAcumulable (no duplican el gasto).
        if (typeof g.intereses === 'number' && g.intereses > 0) {
          movimientos.push({
            movimientoId: `INTERES:${g.id}`,
            inmuebleId: inmueble.id, ejercicio, fecha,
            concepto: `Intereses (desglose de ${g.id})`,
            importe: g.intereses, categoria: g.categoria, tipo: 'INTERES',
            origen: 'ERP', origenId: g.id,
            clasificacion: 'CALCULADO', fuente: `gastos/${g.id}.intereses`,
            noAcumulable: true,
          });
        }
        if (typeof g.capitalAmortizado === 'number' && g.capitalAmortizado > 0) {
          movimientos.push({
            movimientoId: `AMORTIZACION:${g.id}`,
            inmuebleId: inmueble.id, ejercicio, fecha,
            concepto: `Capital amortizado (desglose de ${g.id})`,
            importe: g.capitalAmortizado, categoria: g.categoria, tipo: 'AMORTIZACION',
            origen: 'ERP', origenId: g.id,
            clasificacion: 'CALCULADO', fuente: `gastos/${g.id}.capitalAmortizado`,
            noAcumulable: true,
          });
        }
      }

      // Documentos (B6.5): índice desde la documentación recopilada por el motor.
      for (const d of resumen.documentacion) {
        const rutaLogica = `documentos/${inmueble.id}/${ejercicio}/${d.tipo}/${d.nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        documentos.push({
          documentoId: `doc_${d.id}`,
          movimientoId: d.tipo === 'GASTO' ? `GASTO:${d.referenciaId}` : `INGRESO:${d.referenciaId}`,
          inmuebleId: inmueble.id,
          ejercicio,
          tipo: d.tipo,
          nombre: d.nombreArchivo,
          rutaLogica,
          storagePath: d.storagePath,
          estado: 'PENDIENTE', // sin resolver binario; B6.5: no se inventa
        });
      }
    }
  }

  // Referencias rotas: movimiento apunta a documento que no está en el índice.
  const idsDocs = new Set(documentos.map((d) => d.documentoId));
  for (const m of movimientos) {
    if (m.referenciaDocumental && !idsDocs.has(m.referenciaDocumental)) {
      incidencias.push({ codigo: 'REF_ROTA', severidad: 'CRITICA', descripcion: `Movimiento ${m.movimientoId} referencia documento inexistente ${m.referenciaDocumental}`, entidad: 'movimiento', id: m.movimientoId });
    }
  }
  // Documentos referenciados por gastos del ámbito que no llegaron al índice.
  for (const g of gastosAmbito) {
    const docRef = g.documento || (g.documentos && g.documentos[0]);
    if (docRef && !idsDocs.has(`doc_${docRef.id}`)) {
      incidencias.push({ codigo: 'DOC_FALTANTE', severidad: 'AVISO', descripcion: `Documento ${docRef.id} del gasto ${g.id} no disponible en el periodo exportado`, entidad: 'documento', id: docRef.id });
    }
  }

  // Orden determinista.
  movimientos.sort((a, b) => a.inmuebleId.localeCompare(b.inmuebleId) || a.fecha.localeCompare(b.fecha) || a.movimientoId.localeCompare(b.movimientoId));
  documentos.sort((a, b) => a.documentoId.localeCompare(b.documentoId));
  incidencias.sort((a, b) => a.codigo.localeCompare(b.codigo) || (a.id || '').localeCompare(b.id || ''));

  const advertencias: string[] = [
    'Exportación fiscal INTERNA del ERP. NO es un formato oficial de presentación AEAT.',
  ];
  if (contexto.incluirPII !== true) advertencias.push('PII saneada por defecto (conceptos sin nombres de inquilinos).');
  if (movimientos.length === 0) advertencias.push('El ámbito seleccionado no contiene movimientos.');

  const contenidoCanónico = stringifyDeterminista({
    schema: EXPEDIENTE_SCHEMA,
    ambito,
    ejercicios: resuelto.ejercicios,
    inmuebles: resuelto.inmuebles.map((i) => i.id),
    movimientos,
    documentos,
    incidencias,
  });
  const exportId = await sha256Hex(contenidoCanónico);

  return {
    manifest: {
      exportId,
      schemaVersion: EXPEDIENTE_SCHEMA,
      generatedAt: opciones.generatedAt,
      actor: contexto.actor,
      ambito,
      periodo: { ejercicios: resuelto.ejercicios },
      inmueblesIncluidos: resuelto.inmuebles.map((i) => ({ inmuebleId: i.id, direccion: i.direccion })),
      numMovimientos: movimientos.length,
      numDocumentos: documentos.length,
      numDocumentosDisponibles: documentos.filter((d) => d.estado === 'DISPONIBLE').length,
      hashes: {}, // se completa en empaquetarExpediente (hash por entrada)
      numIncidencias: incidencias.length,
      advertencias,
      origenDatos: 'ERP Gestor de Inmuebles (Firestore, solo lectura)',
    },
    resumenFiscal: resumenes,
    movimientos,
    documentos,
    incidencias,
    agregadosOrigen: {
      nota: 'Los agregados históricos del origen externo (expenses.*, yearlyFinancials de Rentasync) NO son campos del Inmueble ERP y NUNCA se convierten en movimientos. Cuando se migren, vivirán en el staging del lote con su procedencia.',
      registros: [],
    },
    datosNoDisponibles: [
      'Binarios documentales (requieren resolverBinarios; sin ellos: PENDIENTE).',
      'Fichero canónico A/B de la migración Rentasync (INC-06) — exportación basada SOLO en datos ya presentes en el ERP.',
    ],
    procedencia: {
      sistema: 'ERP Gestor de Inmuebles',
      modo: 'LECTURA',
      escriturasFirestore: 0,
      escriturasStorage: 0,
      formatoOficialAEAT: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Empaquetado ZIP (B6.6 / B6.7)
// ---------------------------------------------------------------------------

export interface ResultadoEmpaquetado {
  zip: Uint8Array;
  entradas: { ruta: string; sha256: string; bytes: number }[];
}

function movimientosCsv(movs: MovimientoExpediente[]): string {
  const cab = 'movimientoId;inmuebleId;ejercicio;fecha;concepto;importe;categoria;tipo;origen;origenId;referenciaDocumental;hashDocumento;clasificacion;noAcumulable';
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = movs.map((m) =>
    [m.movimientoId, m.inmuebleId, m.ejercicio, m.fecha, m.concepto, m.importe, m.categoria, m.tipo, m.origen, m.origenId, m.referenciaDocumental || '', m.hashDocumento || '', m.clasificacion, m.noAcumulable ? 'true' : 'false'].map(esc).join(';')
  );
  return [cab, ...filas].join('\n');
}

export async function empaquetarExpediente(
  expediente: ExpedienteFiscal,
  resolverBinarios?: ResolverBinarios
): Promise<ResultadoEmpaquetado> {
  const docs = [...expediente.documentos];
  const binarios = new Map<string, Uint8Array>();

  if (resolverBinarios) {
    for (const d of docs) {
      const bin = await resolverBinarios(d);
      if (bin) {
        binarios.set(d.documentoId, bin);
        d.hash = await sha256Hex(bin);
        d.estado = 'DISPONIBLE';
        const mov = expediente.movimientos.find((m) => m.movimientoId === d.movimientoId);
        if (mov) mov.hashDocumento = d.hash;
      } else if (d.estado === 'PENDIENTE') {
        expediente.incidencias.push({ codigo: 'DOC_FALTANTE', severidad: 'AVISO', descripcion: `Documento ${d.documentoId} (${d.nombre}) no disponible: queda PENDIENTE en el expediente`, entidad: 'documento', id: d.documentoId });
      }
    }
    docs.sort((a, b) => a.documentoId.localeCompare(b.documentoId));
    expediente.incidencias.sort((a, b) => a.codigo.localeCompare(b.codigo) || (a.id || '').localeCompare(b.id || ''));
    expediente.manifest.numDocumentosDisponibles = docs.filter((d) => d.estado === 'DISPONIBLE').length;
    expediente.manifest.numIncidencias = expediente.incidencias.length;
  }

  const entradasTexto: EntradaZip[] = [
    { ruta: 'resumen-fiscal.json', contenido: utf8Bytes(stringifyDeterminista(expediente.resumenFiscal)) },
    { ruta: 'movimientos.json', contenido: utf8Bytes(stringifyDeterminista(expediente.movimientos)) },
    { ruta: 'movimientos.csv', contenido: utf8Bytes(movimientosCsv(expediente.movimientos)) },
    { ruta: 'documentos.json', contenido: utf8Bytes(stringifyDeterminista(docs)) },
    { ruta: 'incidencias.json', contenido: utf8Bytes(stringifyDeterminista(expediente.incidencias)) },
    { ruta: 'auditoria/procedencia.json', contenido: utf8Bytes(stringifyDeterminista({ procedencia: expediente.procedencia, agregadosOrigen: expediente.agregadosOrigen, datosNoDisponibles: expediente.datosNoDisponibles })) },
  ];

  // Hashes por entrada ANTES de fijar el manifest (el manifest se excluye a sí mismo).
  const hashes: Record<string, string> = {};
  for (const e of entradasTexto) hashes[e.ruta] = await sha256Hex(e.contenido);
  for (const [id, bin] of binarios) {
    const d = docs.find((x) => x.documentoId === id)!;
    hashes[d.rutaLogica] = await sha256Hex(bin);
  }
  const manifest = { ...expediente.manifest, hashes };
  const manifestBytes = utf8Bytes(stringifyDeterminista(manifest));

  const entradas: EntradaZip[] = [
    { ruta: 'manifest.json', contenido: manifestBytes },
    ...entradasTexto,
    ...docs.filter((d) => binarios.has(d.documentoId)).map((d) => ({ ruta: d.rutaLogica, contenido: binarios.get(d.documentoId)! })),
  ];

  return {
    zip: crearZip(entradas),
    entradas: entradas.map((e) => ({ ruta: e.ruta, sha256: hashes[e.ruta] || '', bytes: e.contenido.length })),
  };
}
