/**
 * B4 — Resolución de propietario (§7) e inmueble (§8) contra catálogos inyectados.
 *
 * Capa PURA. Reglas inviolables:
 *  · NUNCA "usuario actual = propietario destino" (el motor ni siquiera recibe
 *    un usuario destino; `importador` es solo informativo).
 *  · NUNCA coincidencias aproximadas como confirmación: solo igualdad exacta
 *    (con normalización determinista de espacios/caso donde se indica).
 *  · Dos o más candidatos ⇒ BLOQUEADO. Cero candidatos ⇒ INCOMPLETO.
 *  · El destino explícito final se valida con el patrimonial
 *    `resolverDestinoImportacion` (reutilizado, no duplicado).
 */
import { resolverDestinoImportacion } from '../../features/patrimonial/importPreview';
import type {
  CatalogosMigracion,
  InmuebleCatalogo,
  PropietarioCatalogo,
  ResolucionDestino,
} from './tipos';

function textoPlano(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Normalización determinista para comparaciones exactas (NO aproximación). */
function normalizarExacto(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Figura del titular según catálogo (§7): sin inventar gestión no documentada. */
function figuraTitular(p: PropietarioCatalogo): string {
  if (p.estadoAcceso === 'SIN_CUENTA' || (p.estadoAcceso === undefined && (p.cuentaId === null || p.cuentaId === undefined))) {
    return 'propietario sin cuenta (la migración no crea cuentas)';
  }
  if (p.estadoAcceso === 'INVITADO') return 'propietario invitado (cuenta pendiente de activación; no se activa aquí)';
  return 'propietario con cuenta ACTIVA';
}

function validarDestinoExplicito(
  id: string,
  catalogos: CatalogosMigracion,
): ResolucionDestino {
  const r = resolverDestinoImportacion(id, {
    propietarios: catalogos.propietarios.map((p) => ({ id: p.id, nombre: p.nombre })),
    propietariosPermitidosIds: catalogos.propietariosPermitidosIds ?? catalogos.propietarios.map((p) => p.id),
  });
  if (r.estado === 'VALIDO') {
    const ficha = catalogos.propietarios.find((p) => p.id === id) as PropietarioCatalogo;
    return { id, estado: 'RESUELTO', evidencia: `destino explícito válido en catálogo; ${figuraTitular(ficha)}` };
  }
  if (r.estado === 'AUSENTE') {
    return { id: null, estado: 'INCOMPLETO', evidencia: 'sin propietario destino (ausente; no se suple automáticamente)' };
  }
  if (r.estado === 'AMBIGUO') {
    return { id: null, estado: 'BLOQUEADO', evidencia: 'id de destino ambiguo en catálogo (varias fichas con el mismo id)', candidatos: [id] };
  }
  if (r.estado === 'NO_PERMITIDO') {
    return { id: null, estado: 'BLOQUEADO', evidencia: 'destino no permitido por el contexto de planificación (NO_PERMITIDO)' };
  }
  return { id: null, estado: 'INCOMPLETO', evidencia: `propietario '${id}' no encontrado en catálogo (NO_ENCONTRADO)` };
}

/**
 * Resuelve el propietario destino (§7).
 * Fuentes aceptadas, en orden: (1) id explícito en el registro; (2) mapeo
 * documentado; (3) titular del inmueble ya resuelto; (4) nifCif exacto único
 * (solo entidad PROPIETARIO). Todo lo demás ⇒ INCOMPLETO/BLOQUEADO.
 */
export function resolverPropietario(p: {
  entidad: string;
  datos: Record<string, unknown>;
  normalizadoDestino?: Record<string, unknown>;
  /** Clave de origen con sistema ('RENTASYNC:exp_…') para mapeos. */
  claveOrigen?: string | null;
  inmuebleResueltoId?: string | null;
  catalogos: CatalogosMigracion;
}): ResolucionDestino {
  const { catalogos } = p;

  // (1) Id explícito en el registro (datos o normalizado B1).
  const explicito = textoPlano(p.datos['propietarioId']) ?? textoPlano(p.normalizadoDestino?.['propietarioId']);
  if (explicito) return validarDestinoExplicito(explicito, catalogos);

  // (2) Mapeo documentado inyectado (origen→destino).
  if (p.claveOrigen) {
    const mapeos = catalogos.mapeos.filter((m) => m.alcance === 'PROPIETARIO' && m.origen === p.claveOrigen);
    if (mapeos.length > 1) {
      return {
        id: null, estado: 'BLOQUEADO',
        evidencia: `mapeo documentado contradictorio para '${p.claveOrigen}' (${mapeos.length} destinos)`,
        candidatos: mapeos.map((m) => m.destino),
      };
    }
    if (mapeos.length === 1) {
      const v = validarDestinoExplicito(mapeos[0].destino, catalogos);
      return { ...v, evidencia: `mapeo documentado '${p.claveOrigen}' → '${mapeos[0].destino}'${mapeos[0].nota ? ` (${mapeos[0].nota})` : ''}; ${v.evidencia}` };
    }
  }

  // (3) Titular del inmueble ya resuelto (relación documentada destino).
  if (p.inmuebleResueltoId) {
    const inmuebles = catalogos.inmuebles.filter((i) => i.id === p.inmuebleResueltoId);
    if (inmuebles.length > 1) {
      return {
        id: null, estado: 'BLOQUEADO',
        evidencia: `catálogo con ${inmuebles.length} fichas para '${p.inmuebleResueltoId}': titular indeterminable`,
        candidatos: inmuebles.map((i) => i.id),
      };
    }
    const titular = inmuebles.length === 1 ? textoPlano(inmuebles[0].propietarioId) : null;
    if (titular) {
      const v = validarDestinoExplicito(titular, catalogos);
      return { ...v, evidencia: `titular del inmueble resuelto '${p.inmuebleResueltoId}' → '${titular}'; ${v.evidencia}` };
    }
    return {
      id: null, estado: 'INCOMPLETO',
      evidencia: `inmueble '${p.inmuebleResueltoId}' resuelto pero sin titular en catálogo (entidad sin propietario)`,
    };
  }

  // (4) nifCif exacto único (solo para entidad PROPIETARIO).
  if (p.entidad === 'PROPIETARIO') {
    const nif = textoPlano(p.datos['nifCif']) ?? textoPlano(p.datos['nif']) ?? textoPlano(p.datos['cif']);
    if (nif) {
      const normalizado = normalizarExacto(nif).replace(/[.\- ]/g, '');
      const candidatos = catalogos.propietarios.filter(
        (c) => typeof c.nifCif === 'string' && normalizarExacto(c.nifCif).replace(/[.\- ]/g, '') === normalizado,
      );
      if (candidatos.length === 1) {
        const v = validarDestinoExplicito(candidatos[0].id, catalogos);
        return { ...v, evidencia: `nifCif exacto único en catálogo → '${candidatos[0].id}'; ${v.evidencia}` };
      }
      if (candidatos.length > 1) {
        return {
          id: null, estado: 'BLOQUEADO',
          evidencia: `nifCif duplicado en catálogo (${candidatos.length} fichas): propietario indeterminable`,
          candidatos: candidatos.map((c) => c.id),
        };
      }
      return { id: null, estado: 'INCOMPLETO', evidencia: 'nifCif sin coincidencia exacta en catálogo (posible alta futura; requiere humano)' };
    }
  }

  return { id: null, estado: 'INCOMPLETO', evidencia: 'sin propietario determinable (sin id explícito, sin mapeo, sin inmueble resuelto)' };
}

/**
 * Resuelve el inmueble destino (§8). Prioridad: (1) id canónico; (2) mapeo
 * documentado; (3) idsOrigen documentado en ficha; (4) referencia catastral
 * exacta única; (5) dirección+ciudad exacta única. (4)/(5) resuelven con
 * evidencia pero el MOTOR limita su confianza a REVISIÓN (nunca AUTO).
 */
export function resolverInmueble(p: {
  datos: Record<string, unknown>;
  normalizadoDestino?: Record<string, unknown>;
  /** propertyId de origen (p. ej. 'prop_…') con sistema para mapeos. */
  clavePropertyId?: string | null;
  catalogos: CatalogosMigracion;
}): ResolucionDestino & { via: 'ID_CANONICO' | 'MAPEO' | 'IDS_ORIGEN' | 'CATASTRAL' | 'DIRECCION' | 'NINGUNA' } {
  const { catalogos } = p;
  const porId = (id: string): InmuebleCatalogo[] => catalogos.inmuebles.filter((i) => i.id === id);

  // (1) ID canónico existente.
  const explicito = textoPlano(p.datos['inmuebleId']) ?? textoPlano(p.normalizadoDestino?.['inmuebleId']);
  if (explicito) {
    const fichas = porId(explicito);
    if (fichas.length === 1) {
      return { id: explicito, estado: 'RESUELTO', evidencia: `id canónico '${explicito}' existente en catálogo`, via: 'ID_CANONICO' };
    }
    if (fichas.length > 1) {
      return { id: null, estado: 'BLOQUEADO', evidencia: `id '${explicito}' duplicado en catálogo (${fichas.length} fichas)`, candidatos: fichas.map((f) => f.id), via: 'NINGUNA' };
    }
    return { id: null, estado: 'INCOMPLETO', evidencia: `inmueble '${explicito}' inexistente en catálogo (referencia a inmueble inexistente)`, via: 'NINGUNA' };
  }

  // (2) Mapeo documentado propertyId→inmueble.
  if (p.clavePropertyId) {
    const mapeos = catalogos.mapeos.filter((m) => m.alcance === 'INMUEBLE' && m.origen === p.clavePropertyId);
    if (mapeos.length > 1) {
      return {
        id: null, estado: 'BLOQUEADO',
        evidencia: `mapeo documentado contradictorio para '${p.clavePropertyId}' (${mapeos.length} destinos)`,
        candidatos: mapeos.map((m) => m.destino), via: 'NINGUNA',
      };
    }
    if (mapeos.length === 1) {
      const fichas = porId(mapeos[0].destino);
      if (fichas.length === 1) {
        return { id: mapeos[0].destino, estado: 'RESUELTO', evidencia: `mapeo documentado '${p.clavePropertyId}' → '${mapeos[0].destino}'`, via: 'MAPEO' };
      }
      return { id: null, estado: 'BLOQUEADO', evidencia: `mapeo '${p.clavePropertyId}' apunta a destino inexistente '${mapeos[0].destino}'`, via: 'NINGUNA' };
    }
  }

  // (3) Identificador histórico documentado en ficha (idsOrigen).
  if (p.clavePropertyId) {
    const fichas = catalogos.inmuebles.filter((i) => (i.idsOrigen ?? []).includes(p.clavePropertyId as string));
    if (fichas.length === 1) {
      return { id: fichas[0].id, estado: 'RESUELTO', evidencia: `idsOrigen documentado '${p.clavePropertyId}' en ficha '${fichas[0].id}'`, via: 'IDS_ORIGEN' };
    }
    if (fichas.length > 1) {
      return {
        id: null, estado: 'BLOQUEADO',
        evidencia: `'${p.clavePropertyId}' documentado en ${fichas.length} fichas (mismo inmueble representado varias veces)`,
        candidatos: fichas.map((f) => f.id), via: 'NINGUNA',
      };
    }
  }

  // (4) Referencia catastral exacta única.
  const catastral = textoPlano(p.datos['referenciaCatastral']) ?? textoPlano(p.normalizadoDestino?.['referenciaCatastral'])
    ?? textoPlano(p.datos['cadastralReference']);
  if (catastral) {
    const normalizada = normalizarExacto(catastral).replace(/[^a-z0-9]/g, '');
    const fichas = catalogos.inmuebles.filter(
      (i) => typeof i.referenciaCatastral === 'string'
        && normalizarExacto(i.referenciaCatastral).replace(/[^a-z0-9]/g, '') === normalizada,
    );
    if (fichas.length === 1) {
      return { id: fichas[0].id, estado: 'RESUELTO', evidencia: `referencia catastral exacta única → '${fichas[0].id}' (vía no determinista: tope REVISIÓN)`, via: 'CATASTRAL' };
    }
    if (fichas.length > 1) {
      return {
        id: null, estado: 'BLOQUEADO',
        evidencia: `referencia catastral duplicada en catálogo (${fichas.length} fichas): inmueble indeterminable`,
        candidatos: fichas.map((f) => f.id), via: 'NINGUNA',
      };
    }
    return { id: null, estado: 'INCOMPLETO', evidencia: 'referencia catastral sin coincidencia exacta en catálogo', via: 'NINGUNA' };
  }

  // (5) Dirección + ciudad exactas únicas (igualdad exacta normalizada; tope REVISIÓN).
  const direccion = textoPlano(p.datos['direccion']) ?? textoPlano(p.normalizadoDestino?.['direccion'])
    ?? textoPlano(p.datos['address']);
  const ciudad = textoPlano(p.datos['ciudad']) ?? textoPlano(p.normalizadoDestino?.['ciudad']);
  if (direccion && ciudad) {
    const d = normalizarExacto(direccion);
    const c = normalizarExacto(ciudad);
    const fichas = catalogos.inmuebles.filter(
      (i) => normalizarExacto(i.direccion) === d && typeof i.ciudad === 'string' && normalizarExacto(i.ciudad) === c,
    );
    if (fichas.length === 1) {
      return { id: fichas[0].id, estado: 'RESUELTO', evidencia: `dirección+ciudad exacta única → '${fichas[0].id}' (vía no determinista: tope REVISIÓN)`, via: 'DIRECCION' };
    }
    if (fichas.length > 1) {
      return {
        id: null, estado: 'BLOQUEADO',
        evidencia: `dirección+ciudad repetida en catálogo (${fichas.length} fichas): inmueble indeterminable`,
        candidatos: fichas.map((f) => f.id), via: 'NINGUNA',
      };
    }
    return { id: null, estado: 'INCOMPLETO', evidencia: 'dirección+ciudad sin coincidencia exacta en catálogo', via: 'NINGUNA' };
  }

  if (p.clavePropertyId) {
    return { id: null, estado: 'INCOMPLETO', evidencia: `propertyId '${p.clavePropertyId}' sin mapeo documentado (huérfano potencial: relación sin destino)`, via: 'NINGUNA' };
  }
  return { id: null, estado: 'INCOMPLETO', evidencia: 'sin inmueble determinable (sin id, sin propertyId, sin catastral, sin dirección+ciudad)', via: 'NINGUNA' };
}

/** Vías de resolución de inmueble aptas para AUTO (deterministas y documentadas). */
export function viaInmuebleAptaAuto(via: 'ID_CANONICO' | 'MAPEO' | 'IDS_ORIGEN' | 'CATASTRAL' | 'DIRECCION' | 'NINGUNA'): boolean {
  return via === 'ID_CANONICO' || via === 'MAPEO' || via === 'IDS_ORIGEN';
}
