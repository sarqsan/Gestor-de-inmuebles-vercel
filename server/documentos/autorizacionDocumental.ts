/**
 * AG-03.2 · AUTORIZACIÓN DOCUMENTAL EN SERVIDOR (custodia mediada)
 * ================================================================
 * Por qué existe: las reglas de Cloud Storage sólo pueden consultar la base
 * Firestore `(default)` (doc. «Storage Security Rules › Enhance with Cloud
 * Firestore»), y esta aplicación opera EXCLUSIVAMENTE sobre una base con
 * nombre. Por tanto el ámbito documental (titular, carteras, inmuebles,
 * contratos, revocaciones…) se resuelve AQUÍ, leyendo la base con nombre con la
 * credencial de servicio, y `storage.rules` deja de consultar Firestore.
 *
 * Qué replica: la matriz D3 que hasta ahora vivía en `storage.rules`
 * (titular / cartera L lee / cartera E escribe / titular+admin borran;
 * derivaciones inmueble → propietario, contrato → propietario, incidencia,
 * suministro, solicitud → candidato → inmueble; delegación parcial indexada en
 * `gestiones_cartera`; ramas del inquilino y del profesional asignado; metadatos
 * canónicos P3/P5; evidencias de morosidad sólo master). La fuente es la MISMA
 * (`usuarios_auth/{uid}` + `usuarios/{usuarioId}` + colecciones de negocio),
 * leída en cada petición: una revocación deniega la siguiente operación.
 *
 * Principios:
 *  - Deny by default: toda ruta que no case con un destino conocido se deniega.
 *  - El cliente nunca decide: el identificador que viaja en la ruta se valida
 *    contra la base con nombre (conocer un `propietarioId` ajeno no autoriza).
 *  - Fallo cerrado: documento inexistente ⇒ falso; fallo de transporte ⇒
 *    `FUENTE_NO_DISPONIBLE` (nunca se concede por error).
 *  - La administración (master por correo verificado o ficha ADMINISTRADOR
 *    veraz) conserva su operativa; NO sustituye la autorización del resto.
 */
import type { DocumentoLeido, IdentidadVerificada } from '../titularidades/googleBackend.js';
import { EMAIL_MASTER } from '../titularidades/backendTitulares.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type AccionDocumental = 'LEER' | 'CREAR' | 'SOBRESCRIBIR' | 'BORRAR';

export type ClaveDestino =
  | 'COBROS_JUSTIFICANTES'
  | 'COBROS_JUSTIFICANTES_LEGADO'
  | 'GASTOS_FACTURAS'
  | 'DOCUMENTOS_SOLICITADOS'
  | 'DOCUMENTOS_SOLICITADOS_PROFUNDO'
  | 'INMUEBLE_FOTO'
  | 'INMUEBLE_DOCUMENTO_PATRIMONIAL'
  | 'INMUEBLE_INVENTARIO'
  | 'PROFESIONAL_DOCUMENTO'
  | 'RECOMERCIALIZACION_FOTOS'
  | 'INCIDENCIAS_FOTOS'
  | 'REFORMAS_DOCUMENTOS'
  | 'REFORMAS_FOTOS'
  | 'ACTAS_FOTOS'
  | 'ACTAS_PDFS'
  | 'INCIDENCIA_EVIDENCIA'
  | 'SUMINISTRO_LECTURA'
  | 'CONTRATO_DOCUMENTO'
  | 'RECIBO'
  | 'MOROSIDAD_EVIDENCIA';

export interface ReglaContenido {
  /** Tipos MIME admitidos (misma expresión que la regla original). */
  tipos: RegExp;
  /** Tamaño máximo en bytes. */
  maxBytes: number;
  /** `true` ⇒ el límite es inclusivo (`<=`); por defecto estricto (`<`). */
  inclusivo?: boolean;
}

export interface Destino {
  clave: ClaveDestino;
  /** Expresión sobre la ruta completa; los grupos con nombre son los identificadores. */
  patron: RegExp;
  contenido: ReglaContenido | null;
  /** El objeto puede volver a subirse con el MISMO nombre (equivale a `allow update`). */
  sobrescribible: boolean;
  /** La URL con token puede persistirse en el registro (flujos que guardan `url`). */
  urlPersistente: boolean;
  /** El token de descarga se ROTA en cada lectura autorizada (P3/P5: sin enlace permanente). */
  tokenRotatorio: boolean;
  /** Lectura pública del objeto (catálogo). */
  lecturaPublica: boolean;
}

export interface ObjetoDocumental {
  path: string;
  destino: Destino;
  ids: Record<string, string>;
  /** Último segmento (nombre de fichero). */
  nombre: string;
}

export interface ContextoContenido {
  contentType?: string;
  tamanoBytes?: number;
  customMetadata?: Record<string, string>;
}

export interface ActorDocumental {
  uid: string;
  email?: string;
  esMaster: boolean;
}

export interface PuertoLecturaDocumental {
  leerDocumento(ruta: string): Promise<DocumentoLeido | null>;
}

export class ErrorFuenteAutorizacion extends Error {
  constructor(readonly ruta: string) {
    super('FUENTE_NO_DISPONIBLE');
    this.name = 'ErrorFuenteAutorizacion';
  }
}

export interface Decision {
  permitido: boolean;
  /** Motivo estable, sin datos personales (para registro y pruebas). */
  motivo: string;
}

// ---------------------------------------------------------------------------
// Catálogo de destinos (paridad con los bloques de `storage.rules`)
// ---------------------------------------------------------------------------

const ID = '[A-Za-z0-9._-]{1,180}';
const FICHERO = '[A-Za-z0-9](?:[A-Za-z0-9._-]{0,253}[A-Za-z0-9_-])?';
const RESTO = '(?:[A-Za-z0-9._-]{1,255}/)*' + FICHERO;

const PDF_O_IMAGEN: ReglaContenido['tipos'] = /^(application\/pdf|application\/octet-stream|image\/.+)$/;
const IMAGEN: ReglaContenido['tipos'] = /^image\/.+$/;
const EVIDENCIA: ReglaContenido['tipos'] = /^(application\/pdf|image\/(jpeg|jpg|png|webp))$/;
const DOCUMENTO_PATRIMONIAL: ReglaContenido['tipos'] = /^(application\/pdf|image\/(jpeg|png|webp))$/;
const MB = 1024 * 1024;

const base = { sobrescribible: false, urlPersistente: true, tokenRotatorio: false, lecturaPublica: false };

export const DESTINOS: readonly Destino[] = [
  { ...base, clave: 'COBROS_JUSTIFICANTES', patron: new RegExp(`^cobros_justificantes/(?<propietarioId>${ID})/(?<cobroPeriodoId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: PDF_O_IMAGEN, maxBytes: 12 * MB } },
  { ...base, clave: 'COBROS_JUSTIFICANTES_LEGADO', patron: new RegExp(`^cobros_justificantes/(?<cobroPeriodoId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: null },
  { ...base, clave: 'GASTOS_FACTURAS', patron: new RegExp(`^gastos_facturas/(?<propietarioId>${ID})/(?<gastoId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: PDF_O_IMAGEN, maxBytes: 12 * MB } },
  { ...base, clave: 'DOCUMENTOS_SOLICITADOS', patron: new RegExp(`^documentos_solicitados/(?<solicitudDocId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: PDF_O_IMAGEN, maxBytes: 15 * MB } },
  { ...base, clave: 'DOCUMENTOS_SOLICITADOS_PROFUNDO', patron: new RegExp(`^documentos_solicitados/(?<solicitudDocId>${ID})/(?<resto>${RESTO})$`),
    contenido: null },
  { ...base, clave: 'INMUEBLE_DOCUMENTO_PATRIMONIAL', patron: new RegExp(`^inmuebles/(?<inmuebleId>${ID})/documentos_patrimoniales/(?<documentoId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: DOCUMENTO_PATRIMONIAL, maxBytes: 20 * MB, inclusivo: true }, urlPersistente: false, tokenRotatorio: true },
  { ...base, clave: 'INMUEBLE_INVENTARIO', patron: new RegExp(`^inmuebles/(?<inmuebleId>${ID})/inventario/(?<resto>${RESTO})$`),
    contenido: { tipos: IMAGEN, maxBytes: 15 * MB }, sobrescribible: true },
  { ...base, clave: 'INMUEBLE_FOTO', patron: new RegExp(`^inmuebles/(?<inmuebleId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: IMAGEN, maxBytes: 15 * MB }, lecturaPublica: true },
  { ...base, clave: 'PROFESIONAL_DOCUMENTO', patron: new RegExp(`^profesionales/(?<profesionalId>${ID})/documentos/(?<documentoId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: DOCUMENTO_PATRIMONIAL, maxBytes: 20 * MB, inclusivo: true }, urlPersistente: false, tokenRotatorio: true },
  { ...base, clave: 'RECOMERCIALIZACION_FOTOS', patron: new RegExp(`^recomercializacion_fotos/(?<propietarioId>${ID})/(?<expedienteId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: IMAGEN, maxBytes: 15 * MB } },
  { ...base, clave: 'INCIDENCIAS_FOTOS', patron: new RegExp(`^incidencias_fotos/(?<propietarioId>${ID})/(?<incidenciaId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: IMAGEN, maxBytes: 15 * MB } },
  { ...base, clave: 'REFORMAS_DOCUMENTOS', patron: new RegExp(`^reformas_documentos/(?<propietarioId>${ID})/(?<proyectoId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: PDF_O_IMAGEN, maxBytes: 20 * MB } },
  { ...base, clave: 'REFORMAS_FOTOS', patron: new RegExp(`^reformas_fotos/(?<propietarioId>${ID})/(?<proyectoId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: IMAGEN, maxBytes: 20 * MB } },
  { ...base, clave: 'ACTAS_FOTOS', patron: new RegExp(`^actas_fotos/(?<propietarioId>${ID})/(?<actaId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: IMAGEN, maxBytes: 15 * MB } },
  { ...base, clave: 'ACTAS_PDFS', patron: new RegExp(`^actas_pdfs/(?<propietarioId>${ID})/(?<actaId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: PDF_O_IMAGEN, maxBytes: 20 * MB }, sobrescribible: true },
  { ...base, clave: 'INCIDENCIA_EVIDENCIA', patron: new RegExp(`^incidencias/(?<incidenciaId>${ID})/(?<resto>${RESTO})$`),
    contenido: { tipos: EVIDENCIA, maxBytes: 10 * MB }, sobrescribible: true },
  { ...base, clave: 'SUMINISTRO_LECTURA', patron: new RegExp(`^suministros/(?<suministroId>${ID})/lecturas/(?<lecturaId>${ID})/(?<resto>${RESTO})$`),
    contenido: { tipos: EVIDENCIA, maxBytes: 10 * MB }, sobrescribible: true },
  // E.3/E.4: la regla original no acotaba tipo ni tamaño; aquí se aplica el
  // mismo criterio que el resto de documentos contractuales (PDF/imagen, 20 MB).
  { ...base, clave: 'CONTRATO_DOCUMENTO', patron: new RegExp(`^contratos/(?<contratoId>${ID})/(?<resto>${RESTO})$`),
    contenido: { tipos: PDF_O_IMAGEN, maxBytes: 20 * MB }, sobrescribible: true },
  { ...base, clave: 'RECIBO', patron: new RegExp(`^recibos/(?<contratoId>${ID})/(?<claveCobro>${ID})/(?<resto>${RESTO})$`),
    contenido: { tipos: PDF_O_IMAGEN, maxBytes: 20 * MB }, sobrescribible: true },
  { ...base, clave: 'MOROSIDAD_EVIDENCIA', patron: new RegExp(`^morosidad_evidencias/(?<propietarioId>${ID})/(?<expedienteId>${ID})/(?<fileName>${FICHERO})$`),
    contenido: { tipos: EVIDENCIA, maxBytes: 10 * MB } },
];

/** Forma segura del nombre completo (paridad con `hasSafeObjectName()`). */
export function esRutaSegura(path: string): boolean {
  return typeof path === 'string'
    && path.length > 0
    && path.length <= 1024
    && !path.startsWith('/')
    && !path.includes('//')
    && !path.includes('\\')
    && path.split('/').every((segmento) => segmento !== '' && segmento !== '.' && segmento !== '..')
    && new RegExp(`(^|/)${FICHERO}$`).test(path);
}

/**
 * Resuelve la ruta a su destino. `null` ⇒ ruta sin bloque (p. ej. `presupuestos/`,
 * `trabajos/`, la ruta plana heredada de profesionales): denegación por defecto.
 */
export function resolverObjeto(path: string): ObjetoDocumental | null {
  if (!esRutaSegura(path)) return null;
  for (const destino of DESTINOS) {
    const m = destino.patron.exec(path);
    if (!m) continue;
    const ids: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.groups || {})) if (typeof v === 'string') ids[k] = v;
    return { path, destino, ids, nombre: path.slice(path.lastIndexOf('/') + 1) };
  }
  return null;
}

/** Valida tipo y tamaño contra la regla del destino. */
export function validarContenido(destino: Destino, contentType: string | undefined, tamanoBytes: number | undefined): Decision {
  const regla = destino.contenido;
  if (!regla) return { permitido: false, motivo: 'DESTINO_SIN_SUBIDA' };
  const tipo = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!tipo || !regla.tipos.test(tipo)) return { permitido: false, motivo: 'TIPO_NO_ADMITIDO' };
  if (!Number.isInteger(tamanoBytes) || (tamanoBytes as number) <= 0) return { permitido: false, motivo: 'TAMANO_INVALIDO' };
  const dentro = regla.inclusivo ? (tamanoBytes as number) <= regla.maxBytes : (tamanoBytes as number) < regla.maxBytes;
  if (!dentro) return { permitido: false, motivo: 'TAMANO_EXCEDIDO' };
  return { permitido: true, motivo: 'CONTENIDO_VALIDO' };
}

// ---------------------------------------------------------------------------
// Utilidades de lectura
// ---------------------------------------------------------------------------

type Datos = Record<string, unknown>;

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

function lista(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
}

function mapa(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

export function identidadAActor(identidad: IdentidadVerificada): ActorDocumental {
  const email = typeof identidad.email === 'string' ? identidad.email : undefined;
  return {
    uid: identidad.uid,
    ...(email ? { email } : {}),
    esMaster: Boolean(email) && (email as string).toLowerCase() === EMAIL_MASTER.toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Contexto de autorización (una instancia por petición; memoriza lecturas)
// ---------------------------------------------------------------------------

export class ContextoAutorizacion {
  private readonly cache = new Map<string, Promise<Datos | null>>();
  private espejoPromesa: Promise<Datos | null> | null = null;
  private fichaPromesa: Promise<Datos | null> | null = null;

  constructor(readonly actor: ActorDocumental | null, private readonly puerto: PuertoLecturaDocumental) {}

  /** Lectura memorizada; un documento inexistente es `null`; un fallo de transporte se propaga. */
  leer(ruta: string): Promise<Datos | null> {
    let p = this.cache.get(ruta);
    if (!p) {
      p = this.puerto.leerDocumento(ruta).then(
        (doc) => (doc ? doc.datos : null),
        () => { throw new ErrorFuenteAutorizacion(ruta); },
      );
      this.cache.set(ruta, p);
    }
    return p;
  }

  // --- identidad -----------------------------------------------------------

  private espejoCrudo(): Promise<Datos | null> {
    if (!this.actor) return Promise.resolve(null);
    if (!this.espejoPromesa) {
      const uid = this.actor.uid;
      this.espejoPromesa = this.leer(`usuarios_auth/${encodeURIComponent(uid)}`).then((espejo) => {
        if (!espejo) return null;
        const authUid = texto(espejo.authUid);
        if (authUid && authUid !== uid) return null;
        return espejo;
      });
    }
    return this.espejoPromesa;
  }

  /** `espejoActivo()`: espejo existente y ACTIVO (la suspensión revoca de inmediato). */
  async espejoActivo(): Promise<Datos | null> {
    const espejo = await this.espejoCrudo();
    return espejo && espejo.estado === 'ACTIVO' ? espejo : null;
  }

  /**
   * Ficha autoritativa `usuarios/{usuarioId}` enlazada por el espejo y coherente
   * con él (`perfilActualVeraz()`); `null` si no es veraz.
   */
  private async fichaVeraz(): Promise<Datos | null> {
    if (!this.fichaPromesa) {
      this.fichaPromesa = (async () => {
        const espejo = await this.espejoCrudo();
        const usuarioId = texto(espejo?.usuarioId);
        if (!espejo || !usuarioId || !this.actor) return null;
        const ficha = await this.leer(`usuarios/${encodeURIComponent(usuarioId)}`);
        if (!ficha || ficha.authUid !== this.actor.uid || ficha.estado !== 'ACTIVO' || ficha.tipoPerfil !== espejo.tipoPerfil) return null;
        return ficha;
      })();
    }
    return this.fichaPromesa;
  }

  /**
   * `usuarios/{uid}` (forma que leían las reglas: inquilinos y perfil
   * ADMINISTRADOR). Sólo se acepta ACTIVA (la suspensión revoca) y, si declara
   * `authUid`, coherente con la sesión verificada.
   */
  private async fichaPorUid(): Promise<Datos | null> {
    if (!this.actor) return null;
    const ficha = await this.leer(`usuarios/${encodeURIComponent(this.actor.uid)}`);
    if (!ficha || ficha.estado !== 'ACTIVO') return null;
    const authUid = texto(ficha.authUid);
    if (authUid && authUid !== this.actor.uid) return null;
    return ficha;
  }

  /** `adminStorage()`: master por correo verificado o perfil ADMINISTRADOR veraz. */
  async admin(): Promise<boolean> {
    if (!this.actor) return false;
    if (this.actor.esMaster) return true;
    const ficha = await this.fichaVeraz();
    if (ficha && ficha.tipoPerfil === 'ADMINISTRADOR') return true;
    const porUid = await this.fichaPorUid();
    return Boolean(porUid && porUid.tipoPerfil === 'ADMINISTRADOR');
  }

  // --- ámbito por propietario ---------------------------------------------

  async pidMio(pid: string): Promise<boolean> {
    const espejo = await this.espejoActivo();
    return Boolean(espejo && texto(espejo.propietarioId) && espejo.propietarioId === pid);
  }

  private async enCartera(pid: string, campo: 'carterasL' | 'carterasE'): Promise<boolean> {
    const espejo = await this.espejoActivo();
    if (!espejo) return false;
    // Con relación indexada (delegación parcial) la cartera completa no aplica.
    if (pid in mapa(espejo.gestionesPorPropietario)) return false;
    return lista(espejo[campo]).includes(pid);
  }

  enCarteraL(pid: string): Promise<boolean> { return this.enCartera(pid, 'carterasL'); }
  enCarteraE(pid: string): Promise<boolean> { return this.enCartera(pid, 'carterasE'); }

  async ambitoPidLectura(pid: string): Promise<boolean> {
    if (!pid) return this.admin();
    return (await this.admin()) || (await this.pidMio(pid)) || (await this.enCarteraL(pid)) || (await this.enCarteraE(pid));
  }

  async ambitoPidEscritura(pid: string): Promise<boolean> {
    if (!pid) return this.admin();
    return (await this.admin()) || (await this.pidMio(pid)) || (await this.enCarteraE(pid));
  }

  async ambitoPidBorrado(pid: string): Promise<boolean> {
    if (!pid) return this.admin();
    return (await this.admin()) || (await this.pidMio(pid));
  }

  // --- derivaciones ---------------------------------------------------------

  async inmueble(inmuebleId: string): Promise<Datos | null> {
    return this.leer(`inmuebles/${encodeURIComponent(inmuebleId)}`);
  }

  async pidDeInmueble(inmuebleId: string): Promise<string> {
    return texto((await this.inmueble(inmuebleId))?.propietarioId);
  }

  /** ROADMAP-03: delegación parcial = sólo inmuebles enumerados en la relación viva indexada. */
  async parcialVigente(pid: string, inmuebleId: string, escritura: boolean): Promise<boolean> {
    const espejo = await this.espejoActivo();
    if (!espejo || !pid || !inmuebleId) return false;
    const indice = mapa(espejo.gestionesPorPropietario);
    const relacionId = texto(indice[pid]);
    if (!relacionId) return false;
    const gestion = await this.leer(`gestiones_cartera/${encodeURIComponent(relacionId)}`);
    if (!gestion) return false;
    const inmuebles = gestion.inmuebleIds;
    if (!Array.isArray(inmuebles)) return false;
    const acotada = inmuebles.length === 0 || inmuebles.includes(inmuebleId);
    const viva = gestion.propietarioId === pid
      && gestion.gestorUsuarioId === espejo.usuarioId
      && gestion.estado === 'ACTIVA'
      && gestion.resolucionInvitacion === 'ACEPTADA'
      && acotada;
    if (!viva) return false;
    return !escritura || (gestion.permiso === 'LECTURA_ESCRITURA' && gestion.responsableActual === 'GESTOR');
  }

  async ambitoInmuebleLectura(inmuebleId: string): Promise<boolean> {
    if (await this.admin()) return true;
    if (!(await this.espejoActivo())) return false;
    const pid = await this.pidDeInmueble(inmuebleId);
    if (!pid) return false;
    return (await this.ambitoPidLectura(pid)) || (await this.parcialVigente(pid, inmuebleId, false));
  }

  async ambitoInmuebleEscritura(inmuebleId: string): Promise<boolean> {
    if (await this.admin()) return true;
    if (!(await this.espejoActivo())) return false;
    const pid = await this.pidDeInmueble(inmuebleId);
    if (!pid) return false;
    return (await this.ambitoPidEscritura(pid)) || (await this.parcialVigente(pid, inmuebleId, true));
  }

  async ambitoInmuebleBorrado(inmuebleId: string): Promise<boolean> {
    if (await this.admin()) return true;
    if (!(await this.espejoActivo())) return false;
    const pid = await this.pidDeInmueble(inmuebleId);
    return Boolean(pid) && this.ambitoPidBorrado(pid);
  }

  async incidencia(incidenciaId: string): Promise<Datos | null> {
    return this.leer(`incidencias/${encodeURIComponent(incidenciaId)}`);
  }

  async ambitoIncidencia(incidenciaId: string, nivel: 'LECTURA' | 'ESCRITURA' | 'BORRADO'): Promise<boolean> {
    if (await this.admin()) return true;
    if (!(await this.espejoActivo())) return false;
    const pid = texto((await this.incidencia(incidenciaId))?.propietarioId);
    if (!pid) return false;
    if (nivel === 'LECTURA') return this.ambitoPidLectura(pid);
    if (nivel === 'ESCRITURA') return this.ambitoPidEscritura(pid);
    return this.ambitoPidBorrado(pid);
  }

  /** Profesional asignado a la incidencia: lee y aporta; no borra. */
  async profesionalAsignadoA(incidenciaId: string): Promise<boolean> {
    const espejo = await this.espejoActivo();
    const profesionalId = texto(espejo?.profesionalId);
    if (!espejo || !profesionalId) return false;
    const incidencia = await this.incidencia(incidenciaId);
    return Boolean(incidencia) && texto(incidencia!.profesionalAsignadoId) === profesionalId;
  }

  async contrato(contratoId: string): Promise<Datos | null> {
    return this.leer(`contratos_formalizacion/${encodeURIComponent(contratoId)}`);
  }

  async contratoParcialVigente(contratoId: string, escritura: boolean): Promise<boolean> {
    const contrato = await this.contrato(contratoId);
    const inmuebleId = texto(contrato?.inmuebleId);
    const pid = texto(contrato?.propietarioId);
    if (!contrato || !inmuebleId || !pid) return false;
    const inmueble = await this.inmueble(inmuebleId);
    if (!inmueble) return false;
    const coherente = typeof inmueble.propietarioId === 'string'
      ? inmueble.propietarioId === pid
      : texto(inmueble.propietarioPrincipalId) === pid && Boolean(inmueble.propietarioPrincipalId);
    if (!coherente) return false;
    return this.parcialVigente(pid, inmuebleId, escritura);
  }

  async ambitoContrato(contratoId: string, nivel: 'LECTURA' | 'ESCRITURA' | 'BORRADO'): Promise<boolean> {
    if (await this.admin()) return true;
    if (!(await this.espejoActivo())) return false;
    const pid = texto((await this.contrato(contratoId))?.propietarioId);
    if (!pid) return false;
    if (nivel === 'LECTURA') return (await this.ambitoPidLectura(pid)) || (await this.contratoParcialVigente(contratoId, false));
    if (nivel === 'ESCRITURA') return (await this.ambitoPidEscritura(pid)) || (await this.contratoParcialVigente(contratoId, true));
    return this.ambitoPidBorrado(pid);
  }

  async suministro(suministroId: string): Promise<Datos | null> {
    return this.leer(`suministros/${encodeURIComponent(suministroId)}`);
  }

  async ambitoSuministro(suministroId: string, nivel: 'LECTURA' | 'ESCRITURA' | 'BORRADO'): Promise<boolean> {
    if (await this.admin()) return true;
    if (!(await this.espejoActivo())) return false;
    const inmuebleId = texto((await this.suministro(suministroId))?.inmuebleId);
    if (!inmuebleId) return false;
    if (nivel === 'LECTURA') return this.ambitoInmuebleLectura(inmuebleId);
    if (nivel === 'ESCRITURA') return this.ambitoInmuebleEscritura(inmuebleId);
    return this.ambitoInmuebleBorrado(inmuebleId);
  }

  /** solicitud → candidato → inmueble → propietario (+carteras, +admin). */
  async ambitoSolicitudDoc(solicitudDocId: string): Promise<boolean> {
    if (await this.admin()) return true;
    if (!(await this.espejoActivo())) return false;
    const candidatoId = texto((await this.leer(`solicitudes_documentacion/${encodeURIComponent(solicitudDocId)}`))?.candidatoId);
    if (!candidatoId) return false;
    const inmuebleId = texto((await this.leer(`candidatos/${encodeURIComponent(candidatoId)}`))?.inmuebleId);
    if (!inmuebleId) return false;
    return this.ambitoInmuebleLectura(inmuebleId);
  }

  // --- inquilino (bloque E) ------------------------------------------------

  /** Ficha del inquilino (veraz por espejo o, como en las reglas, `usuarios/{uid}`); `null` si no lo es. */
  private async fichaInquilino(): Promise<Datos | null> {
    if (!this.actor || this.actor.esMaster) return null;
    const veraz = await this.fichaVeraz();
    if (veraz && veraz.tipoPerfil === 'INQUILINO') return veraz;
    const porUid = await this.fichaPorUid();
    return porUid && porUid.tipoPerfil === 'INQUILINO' ? porUid : null;
  }

  async tenantVeContrato(contratoId: string): Promise<boolean> {
    if (!contratoId) return false;
    const ficha = await this.fichaInquilino();
    return Boolean(ficha) && lista(ficha!.contratoIds).includes(contratoId);
  }

  async tenantEnSuministroPorInmueble(suministroId: string): Promise<boolean> {
    if (!(await this.fichaInquilino())) return false;
    const inmuebleId = texto((await this.suministro(suministroId))?.inmuebleId);
    if (!inmuebleId) return false;
    const inmueble = await this.inmueble(inmuebleId);
    if (!inmueble) return false;
    return this.tenantVeContrato(texto(inmueble.contratoActivoId));
  }

  async tenantVeIncidencia(incidenciaId: string): Promise<boolean> {
    const incidencia = await this.incidencia(incidenciaId);
    return Boolean(incidencia) && this.tenantVeContrato(texto(incidencia!.contratoId));
  }

  async tenantVeLectura(lecturaId: string): Promise<boolean> {
    const lectura = await this.leer(`lecturas_suministro/${encodeURIComponent(lecturaId)}`);
    return Boolean(lectura) && this.tenantVeContrato(texto(lectura!.contratoId));
  }

  // --- profesional (P3) ----------------------------------------------------

  async fichaProfesional(profesionalId: string): Promise<Datos | null> {
    return this.leer(`profesionales/${encodeURIComponent(profesionalId)}`);
  }

  async soyProfesional(profesionalId: string): Promise<boolean> {
    const espejo = await this.espejoActivo();
    return Boolean(espejo && espejo.tipoPerfil === 'PROFESIONAL' && texto(espejo.profesionalId) === profesionalId && profesionalId);
  }

  private async pidCreadorProfesional(profesionalId: string): Promise<string> {
    return texto((await this.fichaProfesional(profesionalId))?.creadoPorPropietarioId);
  }

  async ambitoProfesionalLectura(profesionalId: string): Promise<boolean> {
    if (await this.admin()) return true;
    if (await this.soyProfesional(profesionalId)) return true;
    const pid = await this.pidCreadorProfesional(profesionalId);
    return Boolean(pid) && this.ambitoPidLectura(pid);
  }

  async ambitoProfesionalEscritura(profesionalId: string): Promise<boolean> {
    if (await this.admin()) return true;
    if (await this.soyProfesional(profesionalId)) return true;
    const pid = await this.pidCreadorProfesional(profesionalId);
    return Boolean(pid) && this.ambitoPidEscritura(pid);
  }

  async ambitoProfesionalBorrado(profesionalId: string): Promise<boolean> {
    if (await this.admin()) return true;
    const pid = await this.pidCreadorProfesional(profesionalId);
    return Boolean(pid) && this.ambitoPidBorrado(pid);
  }

  // --- metadatos canónicos P5 (patrimonial) y P3 (profesional) -------------

  async metadataPatrimonial(inmuebleId: string, documentoId: string): Promise<Datos | null> {
    return this.leer(`inmuebles/${encodeURIComponent(inmuebleId)}/documentos_patrimoniales/${encodeURIComponent(documentoId)}`);
  }

  async metadataPatrimonialCoherente(o: ObjetoDocumental): Promise<Datos | null> {
    const { inmuebleId, documentoId } = o.ids;
    const md = await this.metadataPatrimonial(inmuebleId, documentoId);
    if (!md) return null;
    const coherente = md.id === documentoId
      && md.inmuebleId === inmuebleId
      && md.storagePath === `inmuebles/${inmuebleId}/documentos_patrimoniales/${documentoId}/${o.nombre}`
      && md.nombreStorage === o.nombre
      && texto(md.propietarioId) !== ''
      && md.propietarioId === (await this.pidDeInmueble(inmuebleId));
    return coherente ? md : null;
  }

  async metadataProfesional(profesionalId: string, documentoId: string): Promise<Datos | null> {
    return this.leer(`profesionales/${encodeURIComponent(profesionalId)}/documentos_profesionales/${encodeURIComponent(documentoId)}`);
  }

  async metadataProfesionalCoherente(o: ObjetoDocumental): Promise<Datos | null> {
    const { profesionalId, documentoId } = o.ids;
    const md = await this.metadataProfesional(profesionalId, documentoId);
    if (!md) return null;
    const coherente = md.id === documentoId
      && md.profesionalId === profesionalId
      && md.nombreStorage === o.nombre
      && md.storagePath === `profesionales/${profesionalId}/documentos/${documentoId}/${o.nombre}`;
    return coherente ? md : null;
  }
}

// ---------------------------------------------------------------------------
// Decisión por destino y acción
// ---------------------------------------------------------------------------

function decision(permitido: boolean, motivo: string): Decision {
  return { permitido, motivo };
}

/** Coherencia del contenido con el metadato PENDIENTE_STORAGE (regla `create` de P3/P5). */
function contenidoCoherenteConMetadata(md: Datos, ctx: ContextoContenido, clavesPropias: Record<string, string>): string | null {
  if (md.estado !== 'PENDIENTE_STORAGE') return 'METADATA_NO_PENDIENTE';
  if (md.mimeType !== ctx.contentType) return 'MIME_DISCREPANTE';
  if (md.tamanoBytes !== ctx.tamanoBytes) return 'TAMANO_DISCREPANTE';
  if (typeof md.sha256 !== 'string' || !md.sha256) return 'SIN_HUELLA';
  const cm = ctx.customMetadata || {};
  for (const [clave, valor] of Object.entries(clavesPropias)) {
    if (cm[clave] !== valor) return `METADATO_${clave.toUpperCase()}_DISCREPANTE`;
  }
  if (cm.sha256 !== md.sha256) return 'HUELLA_DISCREPANTE';
  return null;
}

/**
 * Decide si el actor (o el portal público ya verificado) puede ejecutar la
 * acción sobre el objeto. `publicoVerificado` sólo lo activa el servicio tras
 * validar el token de la solicitud de documentación (portal de candidatos).
 */
export async function decidirAccion(
  ctxAut: ContextoAutorizacion,
  o: ObjetoDocumental,
  accion: AccionDocumental,
  contenido: ContextoContenido = {},
  publicoVerificado = false,
): Promise<Decision> {
  const d = o.destino;
  const escribe = accion === 'CREAR' || accion === 'SOBRESCRIBIR';
  if (accion === 'SOBRESCRIBIR' && !d.sobrescribible) return decision(false, 'SOBRESCRITURA_NO_ADMITIDA');
  if (escribe) {
    const contenidoOk = validarContenido(d, contenido.contentType, contenido.tamanoBytes);
    if (!contenidoOk.permitido) return contenidoOk;
    // AG-04: `sin_asignar` significa "sin titular": no se custodia NADA nuevo
    // ahí (ni la administración); lo heredado sigue siendo legible/borrable
    // por quien tenga ámbito (en la práctica, administración).
    if (o.ids.propietarioId === 'sin_asignar') return decision(false, 'SIN_TITULAR');
  }

  switch (d.clave) {
    case 'COBROS_JUSTIFICANTES':
    case 'GASTOS_FACTURAS':
    case 'RECOMERCIALIZACION_FOTOS':
    case 'INCIDENCIAS_FOTOS':
    case 'REFORMAS_DOCUMENTOS':
    case 'REFORMAS_FOTOS':
    case 'ACTAS_FOTOS':
    case 'ACTAS_PDFS': {
      const pid = o.ids.propietarioId;
      if (accion === 'LEER') return decision(await ctxAut.ambitoPidLectura(pid), 'AMBITO_PROPIETARIO_LECTURA');
      if (escribe) return decision(await ctxAut.ambitoPidEscritura(pid), 'AMBITO_PROPIETARIO_ESCRITURA');
      return decision(await ctxAut.ambitoPidBorrado(pid), 'AMBITO_PROPIETARIO_BORRADO');
    }
    case 'COBROS_JUSTIFICANTES_LEGADO': {
      if (escribe) return decision(false, 'ESQUEMA_HEREDADO_SIN_SUBIDA');
      return decision(await ctxAut.admin(), 'SOLO_ADMINISTRACION');
    }
    case 'DOCUMENTOS_SOLICITADOS': {
      const sol = o.ids.solicitudDocId;
      if (accion === 'CREAR') {
        if (publicoVerificado) return decision(true, 'PORTAL_PUBLICO_TOKEN_VERIFICADO');
        return decision(await ctxAut.ambitoSolicitudDoc(sol), 'AMBITO_SOLICITUD');
      }
      return decision(await ctxAut.ambitoSolicitudDoc(sol), 'AMBITO_SOLICITUD');
    }
    case 'DOCUMENTOS_SOLICITADOS_PROFUNDO': {
      if (escribe) return decision(false, 'SUBIDA_SOLO_RUTA_PLANA');
      return decision(await ctxAut.ambitoSolicitudDoc(o.ids.solicitudDocId), 'AMBITO_SOLICITUD');
    }
    case 'INMUEBLE_FOTO': {
      const inm = o.ids.inmuebleId;
      if (accion === 'LEER') return decision(true, 'CATALOGO_PUBLICO');
      if (escribe) return decision(await ctxAut.ambitoInmuebleEscritura(inm), 'AMBITO_INMUEBLE_ESCRITURA');
      return decision(await ctxAut.ambitoInmuebleBorrado(inm), 'AMBITO_INMUEBLE_BORRADO');
    }
    case 'INMUEBLE_INVENTARIO': {
      const inm = o.ids.inmuebleId;
      if (accion === 'LEER') return decision(await ctxAut.ambitoInmuebleLectura(inm), 'AMBITO_INMUEBLE_LECTURA');
      if (escribe) return decision(await ctxAut.ambitoInmuebleEscritura(inm), 'AMBITO_INMUEBLE_ESCRITURA');
      return decision(await ctxAut.ambitoInmuebleBorrado(inm), 'AMBITO_INMUEBLE_BORRADO');
    }
    case 'INMUEBLE_DOCUMENTO_PATRIMONIAL': {
      const inm = o.ids.inmuebleId;
      if (accion === 'LEER') {
        if (!(await ctxAut.ambitoInmuebleLectura(inm))) return decision(false, 'AMBITO_INMUEBLE_LECTURA');
        const md = await ctxAut.metadataPatrimonialCoherente(o);
        if (!md) return decision(false, 'METADATA_INCOHERENTE');
        return decision(md.estado === 'DISPONIBLE', 'METADATA_DISPONIBLE');
      }
      if (escribe) {
        if (!(await ctxAut.ambitoInmuebleEscritura(inm))) return decision(false, 'AMBITO_INMUEBLE_ESCRITURA');
        const md = await ctxAut.metadataPatrimonialCoherente(o);
        if (!md) return decision(false, 'METADATA_INCOHERENTE');
        const fallo = contenidoCoherenteConMetadata(md, contenido, { documentoId: o.ids.documentoId, inmuebleId: inm });
        return fallo ? decision(false, fallo) : decision(true, 'METADATA_PENDIENTE_COHERENTE');
      }
      if (!(await ctxAut.ambitoInmuebleBorrado(inm))) return decision(false, 'AMBITO_INMUEBLE_BORRADO');
      const md = await ctxAut.metadataPatrimonialCoherente(o);
      if (!md) return decision(false, 'METADATA_INCOHERENTE');
      return decision(md.estado === 'PENDIENTE_ELIMINACION', 'METADATA_PENDIENTE_ELIMINACION');
    }
    case 'PROFESIONAL_DOCUMENTO': {
      const prof = o.ids.profesionalId;
      if (accion === 'LEER') {
        if (!(await ctxAut.ambitoProfesionalLectura(prof))) return decision(false, 'AMBITO_PROFESIONAL_LECTURA');
        const md = await ctxAut.metadataProfesionalCoherente(o);
        if (!md) return decision(false, 'METADATA_INCOHERENTE');
        return decision(md.estado === 'DISPONIBLE', 'METADATA_DISPONIBLE');
      }
      if (escribe) {
        if (!(await ctxAut.ambitoProfesionalEscritura(prof))) return decision(false, 'AMBITO_PROFESIONAL_ESCRITURA');
        const md = await ctxAut.metadataProfesionalCoherente(o);
        if (!md) return decision(false, 'METADATA_INCOHERENTE');
        const fallo = contenidoCoherenteConMetadata(md, contenido, { documentoId: o.ids.documentoId, profesionalId: prof });
        return fallo ? decision(false, fallo) : decision(true, 'METADATA_PENDIENTE_COHERENTE');
      }
      if (!(await ctxAut.ambitoProfesionalBorrado(prof))) return decision(false, 'AMBITO_PROFESIONAL_BORRADO');
      const md = await ctxAut.metadataProfesionalCoherente(o);
      if (!md) return decision(false, 'METADATA_INCOHERENTE');
      return decision(md.estado === 'PENDIENTE_ELIMINACION', 'METADATA_PENDIENTE_ELIMINACION');
    }
    case 'INCIDENCIA_EVIDENCIA': {
      const inc = o.ids.incidenciaId;
      if (accion === 'LEER') {
        return decision(
          (await ctxAut.admin()) || (await ctxAut.ambitoIncidencia(inc, 'LECTURA'))
            || (await ctxAut.profesionalAsignadoA(inc)) || (await ctxAut.tenantVeIncidencia(inc)),
          'AMBITO_INCIDENCIA_LECTURA',
        );
      }
      if (escribe) {
        return decision(
          (await ctxAut.ambitoIncidencia(inc, 'ESCRITURA'))
            || (await ctxAut.profesionalAsignadoA(inc)) || (await ctxAut.tenantVeIncidencia(inc)),
          'AMBITO_INCIDENCIA_ESCRITURA',
        );
      }
      return decision(await ctxAut.ambitoIncidencia(inc, 'BORRADO'), 'AMBITO_INCIDENCIA_BORRADO');
    }
    case 'SUMINISTRO_LECTURA': {
      const sum = o.ids.suministroId;
      const lect = o.ids.lecturaId;
      if (accion === 'LEER') {
        return decision((await ctxAut.ambitoSuministro(sum, 'LECTURA')) || (await ctxAut.tenantVeLectura(lect)), 'AMBITO_SUMINISTRO_LECTURA');
      }
      if (escribe) {
        return decision((await ctxAut.ambitoSuministro(sum, 'ESCRITURA')) || (await ctxAut.tenantEnSuministroPorInmueble(sum)), 'AMBITO_SUMINISTRO_ESCRITURA');
      }
      return decision(await ctxAut.ambitoSuministro(sum, 'BORRADO'), 'AMBITO_SUMINISTRO_BORRADO');
    }
    case 'CONTRATO_DOCUMENTO':
    case 'RECIBO': {
      const con = o.ids.contratoId;
      if (accion === 'LEER') return decision((await ctxAut.ambitoContrato(con, 'LECTURA')) || (await ctxAut.tenantVeContrato(con)), 'AMBITO_CONTRATO_LECTURA');
      if (escribe) return decision(await ctxAut.ambitoContrato(con, 'ESCRITURA'), 'AMBITO_CONTRATO_ESCRITURA');
      return decision(await ctxAut.ambitoContrato(con, 'BORRADO'), 'AMBITO_CONTRATO_BORRADO');
    }
    case 'MOROSIDAD_EVIDENCIA': {
      const master = Boolean(ctxAut.actor?.esMaster);
      if (accion === 'LEER' || accion === 'CREAR') return decision(master, 'SOLO_MASTER');
      return decision(false, 'APPEND_ONLY');
    }
    default:
      return decision(false, 'DESTINO_DESCONOCIDO');
  }
}
