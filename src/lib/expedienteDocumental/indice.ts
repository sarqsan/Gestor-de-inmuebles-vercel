/**
 * BLOQUE 3 — Índice documental unificado del inmueble (motor puro).
 * ---------------------------------------------------------------------------
 * PROYECTA las referencias documentales que YA existen en los modelos
 * canónicos por dominio hacia un índice único y trazable por inmueble.
 * No copia binarios, no crea colección paralela, no escribe nada.
 *
 * Reglas duras:
 *  · ids deterministas (sha256) → la misma proyección dos veces = mismo índice;
 *  · un mismo documento físico/lógico NO genera duplicados silenciosos
 *    (dedup por hash/ubicación: el segundo se SEÑALA como incidencia, nunca
 *    se borra el primero);
 *  · sustituir un documento es EXPLÍCITO (`registrarSustitucionDocumento`):
 *    el anterior pasa a SUSTITUIDO y sigue recuperable;
 *  · sin referencia localizable → estado PENDIENTE + incidencia (no se inventa).
 */
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  GarantiaReparacion,
  Incidencia,
  Inmueble,
  PolizaSeguro,
  TareaMantenimiento,
} from '../../types';
import { sha256Hex } from '../../utils/sha256';
import type {
  EntradaIndiceDocumental,
  EstadoDocumentoExpediente,
  IncidenciaDocumental,
  IndiceDocumentalInmueble,
  TipoDocumentoExpediente,
} from './tipos';

// ============================================================================
// IDs deterministas
// ============================================================================

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

export function generarIdEntradaIndice(input: {
  entidadOrigen: string;
  origenDocumentoId: string;
  inmuebleId: string;
  nombre: string;
}): string {
  const base = [
    'idx-doc',
    norm(input.entidadOrigen),
    norm(input.origenDocumentoId),
    norm(input.inmuebleId),
    norm(input.nombre),
  ].join('|');
  return `idx_${sha256Hex(base).slice(0, 36).toLowerCase()}`;
}

function anioDe(fecha?: string): number | undefined {
  if (!fecha) return undefined;
  const m = /^(\d{4})/.exec(fecha);
  return m ? Number(m[1]) : undefined;
}

// ============================================================================
// Construcción del índice
// ============================================================================

export interface EntradaIndiceEntrada {
  inmueble: Inmueble;
  gastos?: Gasto[];
  cobros?: CobroPeriodo[];
  contratos?: ContratoFormalizacion[];
  polizas?: PolizaSeguro[];
  incidencias?: Incidencia[];
  tareasMantenimiento?: TareaMantenimiento[];
  garantias?: GarantiaReparacion[];
  /** ISO explícito (determinismo; el motor nunca llama a Date.now()). */
  generadoEl: string;
}

interface SemillaDocumento {
  tipo: TipoDocumentoExpediente;
  entidadOrigen: EntradaIndiceDocumental['entidadOrigen'];
  origenDocumentoId: string;
  nombre: string;
  url?: string;
  storagePath?: string;
  hash?: string; // huella de contenido si el modelo de origen la declara
  fechaDocumental?: string;
  fechaIncorporacion: string;
  actor?: string;
  actorId?: string;
  ejercicio?: number;
  version?: number;
  referenciaSustituida?: string; // id canónico anterior (anexos versionados)
  relations: Partial<
    Pick<
      EntradaIndiceDocumental,
      | 'movimientoId' | 'contratoId' | 'polizaId' | 'gastoId' | 'cobroId'
      | 'incidenciaId' | 'tareaMantenimientoId' | 'garantiaId' | 'inventarioId' | 'siniestroId'
    >
  >;
  clasificacion?: EntradaIndiceDocumental['clasificacion'];
  sistemaOrigen?: string;
  propietarioId?: string;
}

function tipoTributo(categoria: string): TipoDocumentoExpediente {
  if (categoria === 'IBI') return 'LIQUIDACION_IBI';
  if (categoria === 'IMPUESTOS_TASAS') return 'TASA';
  return 'FACTURA_GASTO';
}

export function construirIndiceDocumentalInmueble(entrada: EntradaIndiceEntrada): IndiceDocumentalInmueble {
  const { inmueble } = entrada;
  const incidencias: IncidenciaDocumental[] = [];
  const semillas: SemillaDocumento[] = [];

  // -- GASTOS: documento(s), justificante de pago; IBI/tasas tipificados ----
  for (const gasto of (entrada.gastos || []).filter((g) => g.inmuebleId === inmueble.id && g.estado !== 'ANULADO')) {
    const docs = [
      ...(gasto.documento ? [gasto.documento] : []),
      ...(gasto.documentos || []),
    ];
    for (const d of docs) {
      semillas.push({
        tipo: tipoTributo(gasto.categoria),
        entidadOrigen: 'gastos',
        origenDocumentoId: d.id,
        nombre: d.nombre,
        url: d.url,
        storagePath: d.storagePath,
        fechaDocumental: gasto.fechaDevengo || gasto.fechaPago || gasto.fecha,
        fechaIncorporacion: gasto.createdAt || entrada.generadoEl,
        actor: gasto.creadoPor,
        actorId: gasto.creadoPorId,
        ejercicio: gasto.ejercicioFiscal ?? anioDe(gasto.fechaDevengo || gasto.fechaPago || gasto.fecha),
        relations: { gastoId: gasto.id, movimientoId: `GASTO:${gasto.id}`, contratoId: gasto.contratoId, incidenciaId: gasto.incidenciaId },
        clasificacion: 'DOCUMENTAL',
        propietarioId: gasto.propietarioId,
      });
    }
    if (gasto.justificanteUrl || gasto.justificantePath) {
      semillas.push({
        tipo: 'JUSTIFICANTE_PAGO_GASTO',
        entidadOrigen: 'gastos',
        origenDocumentoId: `justificante_${gasto.id}`,
        nombre: `Justificante de pago — ${gasto.concepto}`,
        url: gasto.justificanteUrl,
        storagePath: gasto.justificantePath,
        fechaDocumental: gasto.fechaPago,
        fechaIncorporacion: gasto.updatedAt || gasto.createdAt || entrada.generadoEl,
        ejercicio: gasto.ejercicioFiscal ?? anioDe(gasto.fechaPago || gasto.fechaDevengo),
        relations: { gastoId: gasto.id, movimientoId: `GASTO:${gasto.id}` },
        clasificacion: 'DOCUMENTAL',
        propietarioId: gasto.propietarioId,
      });
    }
  }

  // -- COBROS: justificante ---------------------------------------------------
  for (const cobro of (entrada.cobros || []).filter((c) => c.inmuebleId === inmueble.id && c.estado !== 'ANULADO')) {
    const j = cobro.justificante;
    if (j) {
      semillas.push({
        tipo: 'JUSTIFICANTE_COBRO',
        entidadOrigen: 'cobros',
        origenDocumentoId: j.id,
        nombre: j.nombreArchivo,
        url: j.downloadURL || j.url,
        storagePath: j.storagePath,
        fechaDocumental: cobro.fechaPago || cobro.fechaVencimiento,
        fechaIncorporacion: j.fechaSubida || cobro.ultimaModificacion || entrada.generadoEl,
        actor: j.subidoPor,
        ejercicio: cobro.anio,
        relations: { cobroId: cobro.id, movimientoId: `COBRO:${cobro.id}`, contratoId: cobro.contratoId },
        clasificacion: 'DOCUMENTAL',
        propietarioId: cobro.propietarioId,
      });
    }
  }

  // -- CONTRATOS: anexos versionados (versión y encadenado ya modelados) -----
  for (const contrato of (entrada.contratos || []).filter((c) => c.inmuebleId === inmueble.id)) {
    for (const anexo of contrato.anexos || []) {
      semillas.push({
        tipo: 'ANEXO_CONTRATO',
        entidadOrigen: 'contratos',
        origenDocumentoId: anexo.id,
        nombre: anexo.titulo,
        url: anexo.referenciaDocumental,
        fechaDocumental: anexo.fecha,
        fechaIncorporacion: anexo.fechaCreacion || entrada.generadoEl,
        actor: anexo.creadoPor,
        actorId: anexo.creadoPorId,
        ejercicio: anioDe(anexo.fecha),
        version: anexo.version,
        referenciaSustituida: anexo.anexoOriginalId,
        relations: { contratoId: contrato.id },
        clasificacion: 'DOCUMENTAL',
        propietarioId: anexo.propietarioId || contrato.propietarioId,
      });
    }
  }

  // -- PÓLIZAS (Bloque 1): documentos y documentos de renovación --------------
  for (const poliza of (entrada.polizas || []).filter(
    (p) => p.inmuebleId === inmueble.id || (!p.inmuebleId && p.propietarioId === inmueble.propietarioId)
  )) {
    for (const d of poliza.documentos || []) {
      semillas.push({
        tipo: (d.categoria || d.tipo || 'DOCUMENTO_POLIZA') as TipoDocumentoExpediente,
        entidadOrigen: 'polizas_seguros',
        origenDocumentoId: d.id,
        nombre: d.nombre,
        url: d.url,
        storagePath: d.storagePath,
        fechaDocumental: (d.fechaSubida || '').slice(0, 10) || undefined,
        fechaIncorporacion: d.fechaSubida || entrada.generadoEl,
        actor: d.subidoPor,
        actorId: d.subidoPorId,
        ejercicio: anioDe(d.fechaSubida) ?? anioDe(poliza.fechaInicio),
        version: d.version,
        relations: { polizaId: poliza.id },
        clasificacion: 'DOCUMENTAL',
        propietarioId: poliza.propietarioId,
      });
    }
    for (const d of poliza.documentosRenovacion || []) {
      semillas.push({
        tipo: 'DOCUMENTO_RENOVACION_POLIZA',
        entidadOrigen: 'polizas_seguros',
        origenDocumentoId: d.id,
        nombre: d.nombre,
        url: d.url,
        storagePath: d.storagePath,
        fechaDocumental: d.fechaRecepcion || (d.fechaSubida || '').slice(0, 10) || undefined,
        fechaIncorporacion: d.fechaSubida || entrada.generadoEl,
        actor: d.subidoPor,
        actorId: d.subidoPorId,
        ejercicio: anioDe(d.fechaRecepcion || d.fechaSubida),
        relations: { polizaId: poliza.id },
        clasificacion: 'DOCUMENTAL',
        propietarioId: poliza.propietarioId,
      });
    }
  }

  // -- INCIDENCIAS: fotografías y documentos ----------------------------------
  for (const incidencia of (entrada.incidencias || []).filter((i) => i.inmuebleId === inmueble.id)) {
    for (const adj of [...(incidencia.fotografias || []), ...(incidencia.documentos || [])]) {
      const esFoto = String(adj.tipo || '').toLowerCase().includes('imagen') || String(adj.tipo) === 'IMAGEN';
      semillas.push({
        tipo: esFoto ? 'FOTO_INCIDENCIA' : 'DOCUMENTO_INCIDENCIA',
        entidadOrigen: 'incidencias',
        origenDocumentoId: adj.id,
        nombre: adj.nombre,
        url: adj.url,
        storagePath: adj.storagePath,
        fechaDocumental: (adj.fechaSubida || '').slice(0, 10) || undefined,
        fechaIncorporacion: adj.fechaSubida || entrada.generadoEl,
        actor: adj.subidoPor,
        ejercicio: anioDe(adj.fechaSubida || incidencia.fechaCreacion),
        relations: { incidenciaId: incidencia.id },
        clasificacion: 'DOCUMENTAL',
        propietarioId: incidencia.propietarioId,
      });
    }
  }

  // -- MANTENIMIENTO: documentos de tareas -------------------------------------
  for (const tarea of (entrada.tareasMantenimiento || []).filter((t) => t.inmuebleId === inmueble.id)) {
    for (const d of tarea.documentos || []) {
      semillas.push({
        tipo: 'DOCUMENTO_MANTENIMIENTO',
        entidadOrigen: 'tareas_mantenimiento',
        origenDocumentoId: d.id,
        nombre: d.nombre,
        url: d.url,
        storagePath: d.storagePath,
        fechaDocumental: (d.fechaSubida || '').slice(0, 10) || undefined,
        fechaIncorporacion: d.fechaSubida || entrada.generadoEl,
        ejercicio: anioDe(d.fechaSubida),
        relations: { tareaMantenimientoId: tarea.id },
        clasificacion: 'DOCUMENTAL',
        propietarioId: tarea.propietarioId,
      });
    }
  }

  // -- GARANTÍAS: documento asociado -------------------------------------------
  for (const garantia of (entrada.garantias || []).filter((g) => g.inmuebleId === inmueble.id)) {
    if (garantia.documentoUrl || garantia.documentoStoragePath) {
      semillas.push({
        tipo: 'DOCUMENTO_GARANTIA',
        entidadOrigen: 'garantias_reparacion',
        origenDocumentoId: `doc_${garantia.id}`,
        nombre: `Documento de garantía — ${garantia.titulo}`,
        url: garantia.documentoUrl,
        storagePath: garantia.documentoStoragePath,
        fechaDocumental: garantia.fechaInicio,
        fechaIncorporacion: garantia.createdAt || entrada.generadoEl,
        actor: garantia.creadoPor,
        ejercicio: anioDe(garantia.fechaInicio),
        relations: { garantiaId: garantia.id, incidenciaId: garantia.incidenciaId },
        clasificacion: 'DOCUMENTAL',
        propietarioId: garantia.propietarioId,
      });
    }
  }

  // -- Materialización determinista + dedup + incidencias -----------------------
  const entradas: EntradaIndiceDocumental[] = [];
  const porIdCanónico = new Map<string, string>(); // id canónico de origen → idx id
  const huellasVistas = new Map<string, string>(); // hash/ubicación → idx id

  const ordenadas = [...semillas].sort(
    (a, b) =>
      a.entidadOrigen.localeCompare(b.entidadOrigen) ||
      a.origenDocumentoId.localeCompare(b.origenDocumentoId) ||
      a.nombre.localeCompare(b.nombre)
  );

  for (const s of ordenadas) {
    const id = generarIdEntradaIndice({
      entidadOrigen: s.entidadOrigen,
      origenDocumentoId: s.origenDocumentoId,
      inmuebleId: inmueble.id,
      nombre: s.nombre,
    });

    // Mismo documento canónico ya indexado: no duplicar en silencio.
    const claveCanonica = `${s.entidadOrigen}|${s.origenDocumentoId}`;
    if (porIdCanónico.has(claveCanonica)) continue;
    porIdCanónico.set(claveCanonica, id);

    const estado: EstadoDocumentoExpediente = s.url || s.storagePath ? 'DISPONIBLE' : 'PENDIENTE';
    if (estado === 'PENDIENTE') {
      incidencias.push({
        codigo: 'DOC_SIN_REFERENCIA',
        severidad: 'AVISO',
        descripcion: `Documento «${s.nombre}» (${s.entidadOrigen}/${s.origenDocumentoId}) sin url ni storagePath: queda PENDIENTE, no se inventa.`,
        entidad: s.entidadOrigen,
        id: s.origenDocumentoId,
      });
    }

    // Dedup por contenido/ubicación: el segundo ejemplar SE SEÑALA, no se borra.
    const huella = s.hash || s.storagePath || s.url;
    if (huella) {
      const previo = huellasVistas.get(huella);
      if (previo && previo !== id) {
        incidencias.push({
          codigo: 'POSIBLE_DUPLICADO',
          severidad: 'INFO',
          descripcion: `«${s.nombre}» comparte contenido/ubicación con ${previo}; se conservan ambos con su procedencia (dedup de importación B0-B3: señalar, nunca borrar histórico).`,
          entidad: s.entidadOrigen,
          id: s.origenDocumentoId,
        });
      } else {
        huellasVistas.set(huella, id);
      }
    }

    if (!s.fechaDocumental && !s.fechaIncorporacion) {
      incidencias.push({ codigo: 'DOC_SIN_FECHA', severidad: 'INFO', descripcion: `Documento «${s.nombre}» sin fecha documental ni de incorporación.`, entidad: s.entidadOrigen, id: s.origenDocumentoId });
    }

    entradas.push({
      id,
      tipo: s.tipo,
      inmuebleId: inmueble.id,
      propietarioId: s.propietarioId,
      ejercicio: s.ejercicio,
      ...s.relations,
      nombre: s.nombre,
      entidadOrigen: s.entidadOrigen,
      origenDocumentoId: s.origenDocumentoId,
      url: s.url,
      storagePath: s.storagePath,
      hash: s.hash,
      fechaDocumental: s.fechaDocumental,
      fechaIncorporacion: s.fechaIncorporacion || entrada.generadoEl,
      actor: s.actor,
      actorId: s.actorId,
      version: s.version ?? 1,
      estado,
      clasificacion: s.clasificacion || 'DOCUMENTAL',
      sistemaOrigen: s.sistemaOrigen || 'ERP',
    });
  }

  // Encadenado de versiones conocido (anexos contractuales: anexoOriginalId).
  const idxPorOrigen = new Map<string, EntradaIndiceDocumental>();
  for (const e of entradas) idxPorOrigen.set(`${e.entidadOrigen}|${e.origenDocumentoId}`, e);
  for (const s of ordenadas) {
    if (!s.referenciaSustituida) continue;
    const actual = idxPorOrigen.get(`${s.entidadOrigen}|${s.origenDocumentoId}`);
    const anterior = idxPorOrigen.get(`${s.entidadOrigen}|${s.referenciaSustituida}`);
    if (actual && anterior) {
      actual.sustituyeA = anterior.id;
      actual.version = Math.max(actual.version, anterior.version + 1);
      if (anterior.estado === 'DISPONIBLE' || anterior.estado === 'PENDIENTE') anterior.estado = 'SUSTITUIDO';
    } else if (actual && !anterior) {
      incidencias.push({
        codigo: 'SUSTITUCION_SIN_ANTERIOR',
        severidad: 'INFO',
        descripcion: `El anexo «${s.nombre}» declara sustituir a ${s.referenciaSustituida}, que no está en el índice del inmueble (puede pertenecer a otro inmueble o haber sido archivado).`,
        entidad: s.entidadOrigen,
        id: s.origenDocumentoId,
      });
    }
  }

  entradas.sort((a, b) => a.id.localeCompare(b.id));

  const porTipo: Record<string, number> = {};
  for (const e of entradas) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;

  return {
    inmuebleId: inmueble.id,
    inmuebleDireccion: inmueble.direccion,
    generadoEl: entrada.generadoEl,
    entradas,
    incidencias: incidencias.sort((a, b) => a.codigo.localeCompare(b.codigo) || (a.id || '').localeCompare(b.id || '')),
    estadisticas: {
      total: entradas.length,
      disponibles: entradas.filter((e) => e.estado === 'DISPONIBLE').length,
      pendientes: entradas.filter((e) => e.estado === 'PENDIENTE').length,
      sustituidos: entradas.filter((e) => e.estado === 'SUSTITUIDO').length,
      porTipo,
    },
  };
}

// ============================================================================
// Sustitución EXPLÍCITA (nunca silenciosa)
// ============================================================================

export interface DatosNuevaVersionDocumento {
  tipo: TipoDocumentoExpediente;
  nombre: string;
  url?: string;
  storagePath?: string;
  hash?: string;
  fechaDocumental?: string;
  referencia?: string;
  observaciones?: string;
}

export interface ResultadoSustitucion {
  estado: 'OK' | 'ERROR';
  indice?: IndiceDocumentalInmueble;
  entradaNueva?: EntradaIndiceDocumental;
  error?: string;
}

/**
 * Registra una nueva versión que SUSTITUYE EXPLÍCITAMENTE a una entrada:
 *  · la anterior pasa a `SUSTITUIDO` (SIGUE recuperable, con su hash/fecha/actor);
 *  · la nueva hereda relaciones, version+1 y `sustituyeA`;
 *  · nada se borra.
 */
export function registrarSustitucionDocumento(
  indice: IndiceDocumentalInmueble,
  anteriorId: string,
  datos: DatosNuevaVersionDocumento,
  actor: { id?: string; nombre: string },
  ahora: string
): ResultadoSustitucion {
  const anterior = indice.entradas.find((e) => e.id === anteriorId);
  if (!anterior) {
    return { estado: 'ERROR', error: `La entrada ${anteriorId} no existe en el índice: no se registra una sustitución huérfana.` };
  }
  if (anterior.estado === 'SUSTITUIDO') {
    return { estado: 'ERROR', error: `La entrada ${anteriorId} ya fue sustituida; la nueva versión debe encadenarse sobre la vigente.` };
  }

  const nueva: EntradaIndiceDocumental = {
    ...anterior,
    id: generarIdEntradaIndice({
      entidadOrigen: anterior.entidadOrigen,
      origenDocumentoId: `${anterior.origenDocumentoId}_v${anterior.version + 1}`,
      inmuebleId: anterior.inmuebleId,
      nombre: datos.nombre,
    }),
    nombre: datos.nombre,
    url: datos.url,
    storagePath: datos.storagePath,
    hash: datos.hash,
    fechaDocumental: datos.fechaDocumental ?? anterior.fechaDocumental,
    fechaIncorporacion: ahora,
    actor: actor.nombre,
    actorId: actor.id,
    referencia: datos.referencia ?? anterior.referencia,
    version: anterior.version + 1,
    sustituyeA: anterior.id,
    estado: datos.url || datos.storagePath ? 'DISPONIBLE' : 'PENDIENTE',
    observaciones: datos.observaciones ?? `Sustitución explícita de ${anterior.id} (versión ${anterior.version}) por ${actor.nombre}`,
  };

  const entradas = indice.entradas.map((e) =>
    e.id === anteriorId ? { ...e, estado: 'SUSTITUIDO' as const } : e
  );
  entradas.push(nueva);
  entradas.sort((a, b) => a.id.localeCompare(b.id));

  const porTipo: Record<string, number> = {};
  for (const e of entradas) porTipo[e.tipo] = (porTipo[e.tipo] || 0) + 1;

  return {
    estado: 'OK',
    entradaNueva: nueva,
    indice: {
      ...indice,
      generadoEl: ahora,
      entradas,
      incidencias: [
        ...indice.incidencias,
        {
          codigo: 'SUSTITUCION_EXPLICITA',
          severidad: 'INFO',
          descripcion: `Sustitución explícita registrada: ${nueva.id} (v${nueva.version}) sustituye a ${anterior.id}; el anterior sigue recuperable. Actor: ${actor.nombre}.`,
          entidad: 'indice',
          id: nueva.id,
        },
      ],
      estadisticas: {
        total: entradas.length,
        disponibles: entradas.filter((e) => e.estado === 'DISPONIBLE').length,
        pendientes: entradas.filter((e) => e.estado === 'PENDIENTE').length,
        sustituidos: entradas.filter((e) => e.estado === 'SUSTITUIDO').length,
        porTipo,
      },
    },
  };
}

// ============================================================================
// Consultas de utilidad
// ============================================================================

/** Entradas relacionadas con un movimiento/entidad (para reconstruir cadenas). */
export function entradasPorEntidad(
  indice: IndiceDocumentalInmueble,
  filtro: Partial<Pick<EntradaIndiceDocumental, 'gastoId' | 'cobroId' | 'contratoId' | 'polizaId' | 'incidenciaId' | 'tareaMantenimientoId' | 'garantiaId' | 'movimientoId'>>
): EntradaIndiceDocumental[] {
  return indice.entradas.filter((e) =>
    Object.entries(filtro).every(([k, v]) => v === undefined || e[k as keyof EntradaIndiceDocumental] === v)
  );
}

/** Cadena de versiones de una entrada (más antigua → vigente). */
export function cadenaVersiones(indice: IndiceDocumentalInmueble, entradaId: string): EntradaIndiceDocumental[] {
  const porId = new Map(indice.entradas.map((e) => [e.id, e]));
  const raiz = porId.get(entradaId);
  if (!raiz) return [];
  let actual: EntradaIndiceDocumental | undefined = raiz;
  const visitados = new Set<string>();
  while (actual?.sustituyeA && porId.has(actual.sustituyeA) && !visitados.has(actual.sustituyeA)) {
    visitados.add(actual.sustituyeA);
    actual = porId.get(actual.sustituyeA);
  }
  const cadena: EntradaIndiceDocumental[] = [];
  let cursor: EntradaIndiceDocumental | undefined = actual;
  const vistos = new Set<string>();
  while (cursor && !vistos.has(cursor.id)) {
    vistos.add(cursor.id);
    cadena.push(cursor);
    cursor = indice.entradas.find((e) => e.sustituyeA === cursor!.id);
  }
  return cadena;
}
