/**
 * P6 — DOCUMENTOS ORIGINALES DEL PAQUETE DEL ASESOR (núcleo puro).
 *
 * Reutiliza la custodia documental P2/P3 (`inmuebles/{id}/documentos_patrimoniales`)
 * y su huella SHA-256. Este módulo NO lee Storage ni Firestore: recibe los
 * metadatos ya leídos y, cuando el adaptador aporte los bytes, verifica la
 * huella registrada antes de incorporarlos al ZIP.
 *
 * Reglas que se respetan aquí:
 *  · El ORIGINAL manda: nunca se sustituye por transcripciones OCR, resúmenes
 *    ni Base64. Si no se puede leer, se declara y se conserva su referencia.
 *  · Aislamiento: solo entran documentos de inmuebles y propietarios del
 *    ámbito efectivo ya validado por el motor.
 *  · Integridad: un binario cuyo SHA-256 no coincide con el registrado NO se
 *    incluye (`INTEGRIDAD_DUDOSA`); no se “arregla” ni se re-firma.
 *  · Determinismo: orden por id y contenido; rutas ZIP estables y ASCII.
 */
import type { DocumentoPatrimonial } from '../expedienteDocumental/tipos';
import { sha256Hex } from '../importacion/hash';
import { jsonEstable } from '../migracion/motor';
import type {
  DocumentoIndicePaquete,
  DocumentoOriginalPaquete,
  EstadoDocumentoPaquete,
  FalloBinarioPaquete,
  IncidenciaPaqueteAsesor,
  RangoFechasPaquete,
  ReferenciaRegistroDocumento,
} from './tipos';

/** Límite por documento (el mismo de la custodia P3: 20 MB). */
export const MAX_BYTES_DOCUMENTO_PAQUETE = 20 * 1024 * 1024;
/** Límite total de binarios en un paquete (ZIP STORE, sin compresión). */
export const MAX_BYTES_TOTAL_DOCUMENTOS_PAQUETE = 100 * 1024 * 1024;

/** Entidades canónicas relacionadas por la custodia P3. */
const CAMPOS_RELACION: ReadonlyArray<{ campo: keyof DocumentoPatrimonial; entidad: string }> = [
  { campo: 'contratoId', entidad: 'contratos' },
  { campo: 'gastoId', entidad: 'gastos' },
  { campo: 'facturaId', entidad: 'facturas' },
  { campo: 'polizaId', entidad: 'polizas_seguros' },
  { campo: 'incidenciaId', entidad: 'incidencias' },
  { campo: 'tareaMantenimientoId', entidad: 'tareas_mantenimiento' },
  { campo: 'garantiaId', entidad: 'garantias_reparacion' },
  { campo: 'inventarioId', entidad: 'inventario' },
  { campo: 'movimientoId', entidad: 'movimientos' },
];

const RE_SHA256 = /^[0-9a-f]{64}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Segmento de ruta ZIP seguro y ASCII (sin acentos, sin '..'). */
export function sanearSegmentoRuta(valor: string, maximo = 80): string {
  const sinAcentos = (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '');
  const recortado = sinAcentos.slice(0, maximo);
  return recortado === '' || recortado === '.' || recortado === '..' ? 'documento' : recortado;
}

/** Ruta determinista dentro del ZIP: `documentos/<inmueble>/<tipo>/<hash8>_<nombre>`. */
export function derivarRutaDocumento(documento: Pick<DocumentoPatrimonial, 'id' | 'inmuebleId' | 'tipo' | 'nombre' | 'sha256'>): string {
  const inmueble = sanearSegmentoRuta(documento.inmuebleId, 60);
  const tipo = sanearSegmentoRuta(documento.tipo || 'OTRO', 40);
  const id = sanearSegmentoRuta(documento.id, 80);
  const nombre = sanearSegmentoRuta(documento.nombre || 'documento', 80);
  const prefijo = /^[0-9a-f]{8,}$/.test(documento.sha256 || '') ? documento.sha256.slice(0, 8) : id.slice(0, 12);
  return `documentos/${inmueble}/${tipo}/${prefijo}_${nombre}`;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}

function esFecha(v: unknown): v is string {
  return typeof v === 'string' && RE_FECHA.test(v);
}

function enRango(fecha: string, rango: RangoFechasPaquete): boolean {
  return fecha >= rango.desde && fecha <= rango.hasta;
}

function referenciasDe(documento: DocumentoPatrimonial): ReferenciaRegistroDocumento[] {
  const refs: ReferenciaRegistroDocumento[] = [];
  for (const { campo, entidad } of CAMPOS_RELACION) {
    const id = documento[campo];
    if (typeof id === 'string' && id.trim() !== '') refs.push({ entidad, id });
  }
  return refs.sort((a, b) => a.entidad.localeCompare(b.entidad) || a.id.localeCompare(b.id));
}

export interface ContextoSeleccionDocumentos {
  inmueblesEfectivos: ReadonlySet<string>;
  propietariosEfectivos: ReadonlySet<string>;
  /** Registros incluidos por entidad (para atribuir documentos sin fecha). */
  registrosIncluidos: Readonly<Record<string, ReadonlySet<string>>>;
  rango: RangoFechasPaquete | null;
  ejercicios: readonly number[] | null;
  meses: readonly string[] | null;
  /** Tipos solicitados; null/undefined = todos. */
  tiposDocumento?: readonly string[];
  documentosPatrimoniales: readonly DocumentoPatrimonial[];
}

export interface ResultadoIndiceDocumentos {
  documentos: DocumentoIndicePaquete[];
  incidencias: IncidenciaPaqueteAsesor[];
  /** Avisos resumidos (no por documento) para el manifiesto. */
  avisos: string[];
  /** Nº de documentos existentes descartados por el filtro de tipos. */
  descartadosPorTipo: number;
  /** Nº de documentos descartados por no poder atribuirse al periodo. */
  descartadosPorPeriodo: number;
}

/**
 * Construye el índice documental del paquete a partir de los metadatos P3.
 * No incluye binarios: deja en `PENDIENTE_BINARIO` los que el adaptador puede
 * resolver y declara expresamente los que no son incluibles.
 */
export function construirIndiceDocumentos(ctx: ContextoSeleccionDocumentos): ResultadoIndiceDocumentos {
  const incidencias: IncidenciaPaqueteAsesor[] = [];
  const avisos: string[] = [];
  const tipos = ctx.tiposDocumento && ctx.tiposDocumento.length > 0
    ? new Set(ctx.tiposDocumento)
    : null;
  let descartadosPorTipo = 0;
  let descartadosPorPeriodo = 0;

  // Dedupe por id (una lectura repetida no duplica el original). Con ids
  // repetidos y contenido distinto se conserva la primera fila canónica y se
  // identifica la ambigüedad: nunca se mezclan metadatos de dos registros.
  const porId = new Map<string, DocumentoPatrimonial[]>();
  for (const d of ctx.documentosPatrimoniales) {
    const id = texto(d.id);
    if (id === '') {
      incidencias.push({
        codigo: 'DOCUMENTO_SIN_ID', severidad: 'CRITICA',
        descripcion: 'Documento patrimonial sin identificador: excluido del paquete (no es referenciable)',
        entidad: 'documento',
      });
      continue;
    }
    const lista = porId.get(id) ?? [];
    lista.push(d);
    porId.set(id, lista);
  }

  const documentos: DocumentoIndicePaquete[] = [];
  for (const [id, lista] of [...porId.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ordenada = [...lista].sort((a, b) => jsonEstable(a).localeCompare(jsonEstable(b)));
    const documento = ordenada[0];
    if (ordenada.length > 1) {
      const identicos = new Set(ordenada.map((d) => jsonEstable(d))).size === 1;
      incidencias.push({
        codigo: identicos ? 'DOCUMENTO_DUPLICADO_EXACTO' : 'DOCUMENTO_ID_CONFLICTIVO',
        severidad: 'CRITICA',
        descripcion: identicos
          ? `El documento ${id} aparece ${ordenada.length} veces idéntico: el índice lo registra una sola vez`
          : `El documento ${id} aparece ${ordenada.length} veces con metadatos distintos: se usa la primera fila canónica y la ambigüedad queda identificada`,
        entidad: 'documento', id,
      });
    }

    // Aislamiento: ni inmuebles ni propietarios fuera del ámbito efectivo.
    if (!ctx.inmueblesEfectivos.has(texto(documento.inmuebleId))) continue;
    const propietarioId = texto(documento.propietarioId);
    if (propietarioId !== '' && !ctx.propietariosEfectivos.has(propietarioId)) continue;

    if (tipos !== null && !tipos.has(texto(documento.tipo))) {
      descartadosPorTipo += 1;
      continue;
    }

    const refs = referenciasDe(documento);
    const fechaDocumental = esFecha(documento.fechaDocumental) ? documento.fechaDocumental : null;

    if (ctx.rango !== null || ctx.ejercicios !== null || ctx.meses !== null) {
      if (fechaDocumental !== null) {
        const cumpleRango = ctx.rango === null || enRango(fechaDocumental, ctx.rango);
        const cumpleEjercicio = ctx.ejercicios === null || ctx.ejercicios.includes(Number(fechaDocumental.slice(0, 4)));
        const cumpleMes = ctx.meses === null || ctx.meses.includes(fechaDocumental.slice(0, 7));
        if (!cumpleRango || !cumpleEjercicio || !cumpleMes) continue;
      } else {
        const atribuible = refs.some((r) => (ctx.registrosIncluidos[r.entidad] ?? new Set<string>()).has(r.id));
        if (!atribuible) {
          descartadosPorPeriodo += 1;
          incidencias.push({
            codigo: 'DOCUMENTO_SIN_FECHA_NO_ATRIBUIBLE', severidad: 'AVISO',
            descripcion: `Documento ${documento.id} (${texto(documento.nombre)}) sin fecha documental válida ni vínculo con un registro incluido: excluido por el filtro temporal`,
            entidad: 'documento', id,
          });
          continue;
        }
      }
    }

    const shaRegistrado = RE_SHA256.test(texto(documento.sha256).toLowerCase())
      ? texto(documento.sha256).toLowerCase() : null;
    const storagePath = texto(documento.storagePath);
    const estadoDocumento = texto(documento.estado);
    let estado: EstadoDocumentoPaquete = 'PENDIENTE_BINARIO';
    let motivo: string | null = null;
    if (estadoDocumento !== 'DISPONIBLE') {
      estado = 'NO_DISPONIBLE';
      motivo = `ESTADO_CUSTODIA_${estadoDocumento || 'DESCONOCIDO'}`;
      incidencias.push({
        codigo: 'DOCUMENTO_NO_DISPONIBLE', severidad: 'AVISO',
        descripcion: `Documento ${documento.id} en estado ${estadoDocumento || 'desconocido'}: se referencia en el índice pero su binario no se incluye`,
        entidad: 'documento', id,
      });
    } else if (storagePath === '') {
      estado = 'NO_DISPONIBLE';
      motivo = 'SIN_REFERENCIA_STORAGE';
      incidencias.push({
        codigo: 'DOCUMENTO_SIN_REFERENCIA_STORAGE', severidad: 'AVISO',
        descripcion: `Documento ${documento.id} declarado DISPONIBLE sin ruta de Storage: no verificable, no se incluye`,
        entidad: 'documento', id,
      });
    } else if (shaRegistrado === null) {
      estado = 'SIN_HASH';
      motivo = 'SIN_HUELLA_REGISTRADA';
      incidencias.push({
        codigo: 'DOCUMENTO_SIN_HASH', severidad: 'AVISO',
        descripcion: `Documento ${documento.id} sin SHA-256 registrado: no puede acreditarse la correspondencia con el original; no se incluye`,
        entidad: 'documento', id,
      });
    }

    documentos.push({
      documentoId: id,
      inmuebleId: texto(documento.inmuebleId),
      propietarioId,
      tipo: texto(documento.tipo) || 'OTRO',
      nombre: texto(documento.nombre),
      mimeType: texto(documento.mimeType),
      tamanoBytes: typeof documento.tamanoBytes === 'number' && Number.isFinite(documento.tamanoBytes)
        ? documento.tamanoBytes : null,
      sha256: shaRegistrado,
      sha256Incluido: null,
      rutaZip: estado === 'PENDIENTE_BINARIO' ? derivarRutaDocumento(documento) : null,
      referencia: texto(documento.referencia) || null,
      fechaDocumental,
      fechaIncorporacion: texto(documento.fechaIncorporacion) || null,
      version: typeof documento.version === 'number' && Number.isInteger(documento.version) ? documento.version : 1,
      sustituyeA: texto(documento.sustituyeA) || null,
      estado,
      motivo,
      relaciones: refs,
      origen: 'P3_DOCUMENTOS_PATRIMONIALES',
    });
  }

  if (descartadosPorTipo > 0) {
    avisos.push(`${descartadosPorTipo} documento(s) excluido(s) por el filtro de tipos documentales solicitado`);
  }
  if (descartadosPorPeriodo > 0) {
    avisos.push(`${descartadosPorPeriodo} documento(s) sin fecha ni vínculo incluible: excluidos por el filtro temporal (ver incidencias)`);
  }
  // Colisión de ruta (dos documentos distintos con igual nombre y prefijo).
  const porRuta = new Map<string, number>();
  for (const d of documentos) {
    if (!d.rutaZip) continue;
    const veces = (porRuta.get(d.rutaZip) ?? 0) + 1;
    porRuta.set(d.rutaZip, veces);
    if (veces > 1) d.rutaZip = d.rutaZip.replace(/(\.[^.]+)?$/, `__${d.documentoId.slice(-8)}$1`);
  }

  return { documentos, incidencias, avisos, descartadosPorTipo, descartadosPorPeriodo };
}

/**
 * Aplica al índice los binarios resueltos (o los fallos de lectura).
 * Recalcula el SHA-256 de cada binario y compara con la huella registrada:
 * solo los coincidentes pasan a `INCLUIDO`. Nunca lanza por un documento.
 */
export function aplicarBinariosAlIndice(
  indice: readonly DocumentoIndicePaquete[],
  originales: readonly DocumentoOriginalPaquete[],
  fallos: readonly FalloBinarioPaquete[],
): { documentos: DocumentoIndicePaquete[]; advertencias: string[] } {
  const advertencias: string[] = [];
  const binarios = new Map<string, DocumentoOriginalPaquete>();
  for (const original of originales) {
    if (!binarios.has(original.documentoId)) binarios.set(original.documentoId, original);
  }
  const falloPorId = new Map<string, FalloBinarioPaquete>();
  for (const fallo of fallos) if (!falloPorId.has(fallo.documentoId)) falloPorId.set(fallo.documentoId, fallo);

  const indexados = new Set(indice.map((d) => d.documentoId));
  for (const id of binarios.keys()) {
    if (!indexados.has(id)) {
      advertencias.push(`Documento ${id} aportado para empaquetar sin entrada en el índice: ignorado (no se incorpora un binario no referenciado)`);
    }
  }

  const documentos = indice.map((documento): DocumentoIndicePaquete => {
    if (documento.estado !== 'PENDIENTE_BINARIO') return { ...documento };
    const fallo = falloPorId.get(documento.documentoId);
    const original = binarios.get(documento.documentoId);
    if (fallo) {
      const estado: EstadoDocumentoPaquete = fallo.codigo === 'OBJETO_AUSENTE'
        ? 'NO_DISPONIBLE' : 'NO_ACCESIBLE';
      advertencias.push(`Documento ${documento.documentoId} (${documento.nombre}) no incluido: ${fallo.codigo}${fallo.detalle ? ` (${fallo.detalle})` : ''}`);
      return { ...documento, estado, motivo: fallo.codigo, rutaZip: null };
    }
    if (!original) {
      advertencias.push(`Documento ${documento.documentoId} (${documento.nombre}) quedó sin binario resuelto: se declara NO_ACCESIBLE y no se incluye`);
      return { ...documento, estado: 'NO_ACCESIBLE', motivo: 'BINARIO_NO_RESUELTO', rutaZip: null };
    }
    if (original.bytes.byteLength === 0) {
      advertencias.push(`Documento ${documento.documentoId} (${documento.nombre}) con contenido vacío: no se incluye`);
      return { ...documento, estado: 'INTEGRIDAD_DUDOSA', motivo: 'BINARIO_VACIO', rutaZip: null };
    }
    const calculado = sha256Hex(original.bytes);
    if (original.sha256 !== undefined && original.sha256.toLowerCase() !== calculado) {
      advertencias.push(`Documento ${documento.documentoId} (${documento.nombre}): la huella declarada por el lector no coincide con los bytes; no se incluye`);
      return { ...documento, estado: 'INTEGRIDAD_DUDOSA', motivo: 'HUELLA_LECTOR_DISCREPANTE', rutaZip: null };
    }
    if (documento.sha256 !== null && documento.sha256 !== calculado) {
      advertencias.push(`Documento ${documento.documentoId} (${documento.nombre}): el SHA-256 recuperado ${calculado.slice(0, 12)}… no coincide con el registrado ${documento.sha256.slice(0, 12)}…; no se incluye`);
      return { ...documento, estado: 'INTEGRIDAD_DUDOSA', motivo: 'INTEGRIDAD_DISCREPANTE', rutaZip: null };
    }
    return {
      ...documento,
      estado: 'INCLUIDO',
      motivo: null,
      sha256Incluido: calculado,
      rutaZip: documento.rutaZip ?? `documentos/${sanearSegmentoRuta(documento.inmuebleId, 60)}/${sanearSegmentoRuta(documento.tipo, 40)}/${calculado.slice(0, 8)}_${sanearSegmentoRuta(documento.nombre, 80)}`,
    };
  });

  return { documentos, advertencias };
}

export interface OpcionesResolucionBinarios {
  maxBytesPorDocumento?: number;
  maxBytesTotal?: number;
}

/**
 * Resuelve los binarios con un lector INYECTADO (el adaptador Firebase usa
 * `getBytes` de Storage con la sesión del usuario; los tests, un doble).
 * Es de SOLO LECTURA: no marca estados ni escribe auditoría.
 */
export async function resolverBinariosDocumentos(
  documentos: readonly DocumentoIndicePaquete[],
  leer: (documento: DocumentoIndicePaquete) => Promise<Uint8Array>,
  opciones: OpcionesResolucionBinarios = {},
): Promise<{ binarios: DocumentoOriginalPaquete[]; fallos: FalloBinarioPaquete[]; avisos: string[] }> {
  const maxDoc = opciones.maxBytesPorDocumento ?? MAX_BYTES_DOCUMENTO_PAQUETE;
  const maxTotal = opciones.maxBytesTotal ?? MAX_BYTES_TOTAL_DOCUMENTOS_PAQUETE;
  const binarios: DocumentoOriginalPaquete[] = [];
  const fallos: FalloBinarioPaquete[] = [];
  const avisos: string[] = [];
  let total = 0;

  for (const documento of documentos) {
    if (documento.estado !== 'PENDIENTE_BINARIO') continue;
    if (total >= maxTotal) {
      fallos.push({ documentoId: documento.documentoId, codigo: 'LIMITE_TOTAL' });
      continue;
    }
    try {
      const bytes = await leer(documento);
      if (bytes.byteLength > maxDoc) {
        fallos.push({
          documentoId: documento.documentoId, codigo: 'TAMANO_EXCESIVO',
          detalle: `${bytes.byteLength} bytes > ${maxDoc} por documento`,
        });
        continue;
      }
      if (total + bytes.byteLength > maxTotal) {
        fallos.push({ documentoId: documento.documentoId, codigo: 'LIMITE_TOTAL' });
        continue;
      }
      total += bytes.byteLength;
      binarios.push({ documentoId: documento.documentoId, bytes });
    } catch (error) {
      const codigo = (error as { code?: unknown } | null)?.code;
      const detalle = error instanceof Error ? error.message : String(error);
      const noEncontrado = codigo === 'storage/object-not-found';
      fallos.push({
        documentoId: documento.documentoId,
        codigo: noEncontrado ? 'OBJETO_AUSENTE' : codigo === 'storage/unauthorized' ? 'NO_ACCESIBLE' : 'ERROR_LECTURA',
        detalle,
      });
    }
  }

  const noIncluidos = documentos.filter((d) => d.estado === 'PENDIENTE_BINARIO').length - binarios.length;
  if (noIncluidos > 0) {
    avisos.push(`${noIncluidos} documento(s) con binario pendiente no pudieron incluirse; su referencia y estado se conservan en documentos.json`);
  }
  return { binarios, fallos, avisos };
}

/** Utilidad de proyección: ¿el índice contiene algún documento incluible? */
export function documentosIncluibles(documentos: readonly DocumentoIndicePaquete[]): DocumentoIndicePaquete[] {
  return documentos.filter((d) => d.estado === 'PENDIENTE_BINARIO' || d.estado === 'INCLUIDO');
}
