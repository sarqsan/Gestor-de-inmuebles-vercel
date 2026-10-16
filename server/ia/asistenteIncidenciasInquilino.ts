/**
 * IA · FASE 5 — ASISTENTE DE INCIDENCIAS PARA INQUILINOS (servidor)
 * =================================================================
 * Operación integrada en el gobierno centralizado de IA (`nucleoIA.operacion`):
 * autentica al inquilino con su ID token verificado, resuelve **en servidor**
 * contrato, inmueble y propietario desde fuentes autorizadas (nunca desde las
 * relaciones enviadas por el cliente), construye el contexto contractual
 * permitido y produce un diagnóstico guiado orientativo.
 *
 * GARANTÍAS DE ESTA UNIDAD
 * ------------------------
 *   1. IDENTIDAD — el uid sale del token verificado por el núcleo; aquí se
 *      exige espejo `usuarios_auth/{uid}` ACTIVO, `tipoPerfil = INQUILINO` y
 *      ficha `usuarios/{usuarioId}` coherente (mismo `authUid`, ACTIVO, mismo
 *      perfil). Cualquier otro perfil ⇒ `PERFIL_INQUILINO_REQUERIDO`.
 *   2. AUTORIZACIÓN SOBRE DATOS — los contratos del inquilino salen de
 *      `usuarios/{usuarioId}.contratoIds` (fuente autorizada), no del cuerpo de
 *      la petición. `contratoId` y `incidenciaId` del cliente son sólo
 *      SUGERENCIAS: se validan contra esa lista y contra las incidencias
 *      visibles (`contratoIdsVisibles`/`contratoId`). Sin autorización ⇒
 *      `CONTRATO_NO_AUTORIZADO` / `INCIDENCIA_NO_AUTORIZADA` (403).
 *   3. MÍNIMO PRIVILEGIO — el contexto que se entrega al análisis es la lista
 *      blanca contractual del portal (`CAMPOS_CONTEXTO_CONTRACTUAL_IA`): nunca
 *      NIF/DNI, avalista, scoring, notas internas, historial de formalización,
 *      contacto del profesional, importes internos ni datos de otros usuarios.
 *   4. TRAZABILIDAD MÍNIMA — si hay `traza` configurada se guarda UN documento
 *      por operación (`ia_incidencias_trazas/{operacionId}`, id determinista
 *      del núcleo) con códigos y contadores: sin prompts, sin descripciones,
 *      sin nombres, sin contacto ni importes.
 *   5. SIN AUTOMATISMOS DE NEGOCIO — este módulo NUNCA escribe en la incidencia,
 *      no cambia estados, no crea órdenes de trabajo, no genera cargos, no fija
 *      responsabilidad y no notifica a terceros por sí solo: la derivación es
 *      una SUGERENCIA que el inquilino decide y que la Fase 6 puede registrar.
 *   6. FALLO CERRADO — si la fuente autorizada no responde, se rechaza (503) en
 *      vez de analizar datos inventados o los del cliente.
 */
import type { CategoriaIncidencia } from '../../src/types.js';
import {
  construirDiagnosticoDeterministaIA,
  construirPromptAsistenteIncidenciasIA,
  detectarSenalesIA,
  fusionarPropuestaProveedorIA,
  MODELO_ASISTENTE_INCIDENCIAS_IA,
  type ContextoContractualInquilinoIA,
  type DiagnosticoIncidenciaIA,
  type RespuestaAclaratoriaIA,
} from '../../src/ia/asistenteIncidenciasIA.js';

export const COLECCION_TRAZAS_INCIDENCIAS_IA = 'ia_incidencias_trazas';

export const CATEGORIAS_INCIDENCIA_IA: readonly CategoriaIncidencia[] = [
  'FONTANERIA', 'ELECTRICIDAD', 'CALEFACCION_ACS', 'CERRAJERIA', 'ELECTRODOMESTICOS', 'HUMEDADES',
  'CARPINTERIA', 'PINTURA', 'CRISTALERIA', 'PLAGAS_SANEAMIENTO', 'LIMPIEZA', 'OTROS',
];

export const MAX_RESPUESTAS_ACLARATORIAS = 12;
export const MAX_LONGITUD_RESPUESTA = 500;
export const MAX_LONGITUD_DESCRIPCION = 2000;

export type CodigoRechazoAsistenteIncidenciasIA =
  | 'PERFIL_INQUILINO_REQUERIDO'
  | 'PERFIL_NO_ACTIVO'
  | 'SIN_CONTRATO_AUTORIZADO'
  | 'CONTRATO_NO_AUTORIZADO'
  | 'INCIDENCIA_NO_AUTORIZADA'
  | 'PETICION_INVALIDA'
  | 'FUENTE_NO_DISPONIBLE';

/** Puerto de lectura ya existente en el servidor (lo cumple `ClienteFirestoreRest`). */
export interface PuertoDatosInquilinoIA {
  leerDocumento(ruta: string): Promise<{ datos: Record<string, unknown>; updateTime?: string } | null>;
}

/** Documento mínimo de incidencia que este asistente puede leer (lista blanca). */
export interface IncidenciaAutorizadaIA {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: CategoriaIncidencia;
  prioridad: string;
  estado: string;
  fotografias: number;
  tieneTrabajoAsignado: boolean;
}

export interface ContextoAutorizadoInquilinoIA {
  uid: string;
  usuarioId: string;
  contratoId: string;
  contrato: ContextoContractualInquilinoIA;
  inmueble: { id: string; direccion: string; ciudad: string };
  propietario: { id: string; nombreVisible: string };
  incidencia?: IncidenciaAutorizadaIA;
}

export type ResultadoContextoInquilinoIA =
  | { estado: 'AUTORIZADO'; contexto: ContextoAutorizadoInquilinoIA }
  | { estado: 'RECHAZADO'; codigo: CodigoRechazoAsistenteIncidenciasIA; codigoHttp: number };

export interface PeticionAsistenteIncidenciasIA {
  /** Sugerencia del cliente: se valida contra el alcance real del inquilino. */
  contratoId?: string;
  incidenciaId?: string;
  /** Relato libre del inquilino (título + descripción). */
  descripcion?: string;
  categoria?: string;
  respuestas?: RespuestaAclaratoriaIA[];
}

function texto(valor: unknown, max: number): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.replace(/\s+/g, ' ').trim();
  if (limpio === '') return undefined;
  return limpio.length > max ? limpio.slice(0, max) : limpio;
}

function listaTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === 'string');
}

export function categoriaValidaIA(valor: unknown): CategoriaIncidencia {
  return typeof valor === 'string' && (CATEGORIAS_INCIDENCIA_IA as readonly string[]).includes(valor)
    ? (valor as CategoriaIncidencia)
    : 'OTROS';
}

/**
 * Normaliza el cuerpo de la petición: sólo campos conocidos, longitudes
 * acotadas y tipos primitivos. Todo lo demás (relaciones, importes, estados,
 * roles, uids) se ignora por completo: no existe ruta para que el cliente
 * amplíe el alcance.
 */
export function normalizarPeticionAsistenteIncidenciasIA(cuerpo: unknown): PeticionAsistenteIncidenciasIA {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  const respuestas: RespuestaAclaratoriaIA[] = [];
  if (Array.isArray(c.respuestas)) {
    for (const entrada of c.respuestas.slice(0, MAX_RESPUESTAS_ACLARATORIAS)) {
      const item = (entrada ?? {}) as Record<string, unknown>;
      const preguntaId = texto(item.preguntaId, 60);
      const respuesta = texto(item.respuesta, MAX_LONGITUD_RESPUESTA);
      if (preguntaId && respuesta) respuestas.push({ preguntaId, respuesta });
    }
  }
  return {
    ...(texto(c.contratoId, 120) ? { contratoId: texto(c.contratoId, 120) as string } : {}),
    ...(texto(c.incidenciaId, 120) ? { incidenciaId: texto(c.incidenciaId, 120) as string } : {}),
    ...(texto(c.descripcion, MAX_LONGITUD_DESCRIPCION) ? { descripcion: texto(c.descripcion, MAX_LONGITUD_DESCRIPCION) as string } : {}),
    ...(typeof c.categoria === 'string' ? { categoria: c.categoria.slice(0, 40) } : {}),
    ...(respuestas.length > 0 ? { respuestas } : {}),
  };
}

function contextoContractualDesdeDocumento(
  contratoId: string,
  datos: Record<string, unknown>,
): ContextoContractualInquilinoIA | null {
  const cargo = (valor: unknown): 'arrendatario' | 'arrendador' => (valor === 'arrendatario' ? 'arrendatario' : 'arrendador');
  const clausulasCrudas = Array.isArray(datos.clausulasPersonalizadas) ? datos.clausulasPersonalizadas : [];
  const clausulas = clausulasCrudas
    .map((c) => (c ?? {}) as Record<string, unknown>)
    .map((c) => ({ titulo: texto(c.titulo, 120) ?? 'Cláusula', contenido: texto(c.contenido, 1200) ?? '' }))
    .filter((c) => c.contenido !== '')
    .slice(0, 20);
  return {
    contratoId,
    estado: texto(datos.estado, 40) ?? 'DESCONOCIDO',
    ...(datos.modalidadAlquiler === 'habitaciones' || datos.modalidadAlquiler === 'completo'
      ? { modalidadAlquiler: datos.modalidadAlquiler }
      : {}),
    fechaInicioContrato: texto(datos.fechaInicioContrato, 40) ?? '',
    ...(texto(datos.fechaFinContrato, 40) ? { fechaFinContrato: texto(datos.fechaFinContrato, 40) as string } : {}),
    esVigente: datos.esVigente === true,
    suministrosCargo: cargo(datos.suministrosCargo),
    gastosComunidadCargo: cargo(datos.gastosComunidadCargo),
    ibiCargo: cargo(datos.ibiCargo),
    incluyeMueblesInventario: datos.incluyeMueblesInventario === true,
    ...(texto(datos.inventarioDetalle, 600) ? { inventarioDetalle: texto(datos.inventarioDetalle, 600) as string } : {}),
    permitirMascotas: datos.permitirMascotas === true,
    ...(texto(datos.clausulaMascotasDetalle, 600) ? { clausulaMascotasDetalle: texto(datos.clausulaMascotasDetalle, 600) as string } : {}),
    permitirSubarriendo: datos.permitirSubarriendo === true,
    clausulaDesistimientoAnticipado: datos.clausulaDesistimientoAnticipado === true,
    clausulasPersonalizadas: clausulas,
  };
}

function incidenciaAutorizadaDesdeDocumento(id: string, datos: Record<string, unknown>): IncidenciaAutorizadaIA {
  return {
    id,
    titulo: texto(datos.titulo, 200) ?? '',
    descripcion: texto(datos.descripcion, MAX_LONGITUD_DESCRIPCION) ?? '',
    categoria: categoriaValidaIA(datos.categoria),
    prioridad: texto(datos.prioridad, 40) ?? 'NORMAL',
    estado: texto(datos.estado, 40) ?? 'ABIERTA',
    fotografias: Array.isArray(datos.fotografias) ? datos.fotografias.length : 0,
    tieneTrabajoAsignado: typeof datos.trabajoProfesional === 'object' && datos.trabajoProfesional !== null,
  };
}

/** El inquilino puede leer la incidencia si pertenece a alguno de sus contratos. */
export function incidenciaVisibleParaContratosIA(
  datos: Record<string, unknown>,
  contratoIds: readonly string[],
): boolean {
  const visibles = listaTextos(datos.contratoIdsVisibles);
  if (visibles.some((id) => contratoIds.includes(id))) return true;
  const contratoId = datos.contratoId;
  return typeof contratoId === 'string' && contratoIds.includes(contratoId);
}

export interface FuenteAutorizadaInquilinoIA {
  /**
   * Resuelve el contexto autorizado de un inquilino a partir de su uid
   * verificado. Devuelve rechazo tipado (nunca datos parciales).
   */
  contextoAutorizado(
    uid: string,
    peticion: PeticionAsistenteIncidenciasIA,
  ): Promise<ResultadoContextoInquilinoIA>;
}

export function crearFuenteAutorizadaInquilinoIA(puerto: PuertoDatosInquilinoIA): FuenteAutorizadaInquilinoIA {
  return {
    async contextoAutorizado(uid, peticion) {
      let espejo: Record<string, unknown> | null = null;
      let ficha: Record<string, unknown> | null = null;
      let contratoCrudo: Record<string, unknown> | null = null;
      let inmuebleCrudo: Record<string, unknown> | null = null;
      let propietarioCrudo: Record<string, unknown> | null = null;
      let incidenciaCruda: { id: string; datos: Record<string, unknown> } | null = null;
      let contratoId = '';
      try {
        const docEspejo = await puerto.leerDocumento(`usuarios_auth/${uid}`);
        espejo = docEspejo?.datos ?? null;
        if (!espejo) return { estado: 'RECHAZADO', codigo: 'PERFIL_INQUILINO_REQUERIDO', codigoHttp: 403 };
        if (espejo.estado !== 'ACTIVO') return { estado: 'RECHAZADO', codigo: 'PERFIL_NO_ACTIVO', codigoHttp: 403 };
        if (espejo.tipoPerfil !== 'INQUILINO') return { estado: 'RECHAZADO', codigo: 'PERFIL_INQUILINO_REQUERIDO', codigoHttp: 403 };
        const usuarioId = espejo.usuarioId;
        if (typeof usuarioId !== 'string' || usuarioId === '') {
          return { estado: 'RECHAZADO', codigo: 'PERFIL_INQUILINO_REQUERIDO', codigoHttp: 403 };
        }
        const docFicha = await puerto.leerDocumento(`usuarios/${usuarioId}`);
        ficha = docFicha?.datos ?? null;
        if (!ficha || ficha.authUid !== uid || ficha.estado !== 'ACTIVO' || ficha.tipoPerfil !== 'INQUILINO') {
          return { estado: 'RECHAZADO', codigo: 'PERFIL_INQUILINO_REQUERIDO', codigoHttp: 403 };
        }

        // Fuente autorizada del alcance: los contratos vinculados a la ficha del
        // usuario (NUNCA los del cuerpo de la petición).
        const contratoIds = [...new Set(listaTextos(ficha.contratoIds))];
        if (contratoIds.length === 0) {
          return { estado: 'RECHAZADO', codigo: 'SIN_CONTRATO_AUTORIZADO', codigoHttp: 403 };
        }
        contratoId = contratoIds[0];
        if (peticion.contratoId) {
          if (!contratoIds.includes(peticion.contratoId)) {
            return { estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO', codigoHttp: 403 };
          }
          contratoId = peticion.contratoId;
        }

        if (peticion.incidenciaId) {
          const docIncidencia = await puerto.leerDocumento(`incidencias/${peticion.incidenciaId}`);
          if (!docIncidencia) return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA', codigoHttp: 403 };
          if (!incidenciaVisibleParaContratosIA(docIncidencia.datos, contratoIds)) {
            return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA', codigoHttp: 403 };
          }
          const contratoDeIncidencia = docIncidencia.datos.contratoId;
          if (typeof contratoDeIncidencia === 'string' && contratoIds.includes(contratoDeIncidencia)) {
            contratoId = contratoDeIncidencia;
          }
          incidenciaCruda = { id: peticion.incidenciaId, datos: docIncidencia.datos };
        }

        const docContrato = await puerto.leerDocumento(`contratos_formalizacion/${contratoId}`);
        if (!docContrato) return { estado: 'RECHAZADO', codigo: 'SIN_CONTRATO_AUTORIZADO', codigoHttp: 403 };
        contratoCrudo = docContrato.datos;

        const inmuebleId = contratoCrudo.inmuebleId;
        if (typeof inmuebleId !== 'string' || inmuebleId === '') {
          return { estado: 'RECHAZADO', codigo: 'SIN_CONTRATO_AUTORIZADO', codigoHttp: 403 };
        }
        const docInmueble = await puerto.leerDocumento(`inmuebles/${inmuebleId}`);
        inmuebleCrudo = docInmueble?.datos ?? null;

        const propietarioId = contratoCrudo.propietarioId;
        if (typeof propietarioId === 'string' && propietarioId !== '') {
          const docPropietario = await puerto.leerDocumento(`propietarios/${propietarioId}`);
          propietarioCrudo = docPropietario?.datos ?? null;
        }
      } catch {
        // Fallo cerrado: sin fuente autorizada no se analiza nada.
        return { estado: 'RECHAZADO', codigo: 'FUENTE_NO_DISPONIBLE', codigoHttp: 503 };
      }

      const contrato = contextoContractualDesdeDocumento(contratoId, contratoCrudo);
      if (!inmuebleCrudo && !contratoCrudo) {
        return { estado: 'RECHAZADO', codigo: 'SIN_CONTRATO_AUTORIZADO', codigoHttp: 403 };
      }
      const propietarioIdCrudo = contratoCrudo.propietarioId;
      return {
        estado: 'AUTORIZADO',
        contexto: {
          uid,
          usuarioId: String(espejo.usuarioId),
          contratoId,
          contrato,
          inmueble: {
            id: typeof contratoCrudo.inmuebleId === 'string' ? contratoCrudo.inmuebleId : '',
            direccion: texto(inmuebleCrudo?.direccion, 200) ?? texto(contratoCrudo.inmuebleDireccion, 200) ?? 'Vivienda',
            ciudad: texto(inmuebleCrudo?.ciudad, 120) ?? texto(contratoCrudo.inmuebleCiudad, 120) ?? '',
          },
          // Del propietario sólo se conserva un nombre visible para la derivación:
          // ni contacto, ni NIF, ni datos fiscales entran en el diagnóstico.
          propietario: {
            id: typeof propietarioIdCrudo === 'string' ? propietarioIdCrudo : '',
            nombreVisible: texto(propietarioCrudo?.nombre, 120) ?? texto(contratoCrudo.propietarioNombre, 120) ?? 'Propietario',
          },
          ...(incidenciaCruda ? { incidencia: incidenciaAutorizadaDesdeDocumento(incidenciaCruda.id, incidenciaCruda.datos) } : {}),
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Trazabilidad mínima (opcional): una fila por operación, sin texto libre
// ---------------------------------------------------------------------------

/** Documento de traza: códigos y contadores. NUNCA prompts ni datos personales. */
export interface TrazaIncidenciaIA {
  operacionId: string;
  uid: string;
  contratoId: string;
  incidenciaId: string | null;
  categoria: CategoriaIncidencia;
  urgencia: string;
  senales: string[];
  derivacionRecomendada: boolean;
  destinosDerivacion: string[];
  nivelIncertidumbre: string;
  origenRespuesta: 'DETERMINISTA' | 'PROVEEDOR';
  creadaEn: string;
}

export interface RegistroTrazasIncidenciasIA {
  registrar(traza: TrazaIncidenciaIA): Promise<void>;
}

export function crearRegistroTrazasFirestoreIA(
  puerto: PuertoDatosInquilinoIA & { crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'> },
): RegistroTrazasIncidenciasIA {
  return {
    async registrar(traza) {
      // Id determinista (el del núcleo) ⇒ reintentar la misma operación no duplica.
      await puerto.crearDocumento(COLECCION_TRAZAS_INCIDENCIAS_IA, traza.operacionId, { ...traza });
    },
  };
}

// ---------------------------------------------------------------------------
// Asistente
// ---------------------------------------------------------------------------

export interface EntradaDiagnosticoServidorIA {
  uid: string;
  operacionId: string;
  peticion: PeticionAsistenteIncidenciasIA;
  /**
   * Consulta al proveedor del núcleo (ya instrumentada). Devuelve la propuesta
   * SIN validar o `null` si no hay proveedor disponible. Nunca se llama sin
   * contexto autorizado resuelto.
   */
  consultarProveedor: (prompt: string) => Promise<unknown | null>;
}

export type ResultadoDiagnosticoServidorIA =
  | { estado: 'OK'; contexto: ContextoAutorizadoInquilinoIA; diagnostico: DiagnosticoIncidenciaIA; origenRespuesta: 'DETERMINISTA' | 'PROVEEDOR'; avisos: string[] }
  | { estado: 'RECHAZADO'; codigo: CodigoRechazoAsistenteIncidenciasIA; codigoHttp: number };

export interface DependenciasAsistenteIncidenciasIA {
  fuente: FuenteAutorizadaInquilinoIA;
  traza?: RegistroTrazasIncidenciasIA | null;
  ahora?: () => Date;
  log?: (evento: { evento: 'TRAZA_NO_REGISTRADA' | 'PROVEEDOR_DESCARTADO' | 'DIAGNOSTICO'; operacionId: string; uid: string; codigo?: string }) => void;
}

export interface AsistenteIncidenciasIA {
  diagnosticar(entrada: EntradaDiagnosticoServidorIA): Promise<ResultadoDiagnosticoServidorIA>;
}

export function crearAsistenteIncidenciasIA(deps: DependenciasAsistenteIncidenciasIA): AsistenteIncidenciasIA {
  const ahora = deps.ahora ?? (() => new Date());
  const log = deps.log ?? (() => undefined);

  return {
    async diagnosticar(entrada) {
      const resuelto = await deps.fuente.contextoAutorizado(entrada.uid, entrada.peticion);
      if (resuelto.estado === 'RECHAZADO') return resuelto;
      const { contexto } = resuelto;

      const categoria = categoriaValidaIA(entrada.peticion.categoria ?? contexto.incidencia?.categoria);
      const relato = [entrada.peticion.descripcion ?? '', contexto.incidencia?.titulo ?? '', contexto.incidencia?.descripcion ?? '']
        .filter((t) => t !== '')
        .join('. ')
        .trim();
      if (relato === '') {
        return { estado: 'RECHAZADO', codigo: 'PETICION_INVALIDA', codigoHttp: 400 };
      }

      const base = construirDiagnosticoDeterministaIA({
        categoria,
        texto: relato,
        respuestas: entrada.peticion.respuestas ?? [],
        contrato: contexto.contrato,
        fotografias: contexto.incidencia?.fotografias ?? 0,
        ...(contexto.incidencia
          ? { incidencia: { estado: contexto.incidencia.estado, prioridad: contexto.incidencia.prioridad, tieneTrabajoAsignado: contexto.incidencia.tieneTrabajoAsignado } }
          : {}),
      });

      // El proveedor es OPCIONAL y nunca sustituye la seguridad determinista.
      let diagnostico = base;
      let origenRespuesta: 'DETERMINISTA' | 'PROVEEDOR' = 'DETERMINISTA';
      const avisos: string[] = [];
      let propuesta: unknown | null = null;
      if (contexto.contrato.estado !== 'DESCONOCIDO') {
        try {
          propuesta = await entrada.consultarProveedor(construirPromptAsistenteIncidenciasIA(
            {
              categoria,
              texto: relato,
              respuestas: entrada.peticion.respuestas ?? [],
              contrato: contexto.contrato,
              fotografias: contexto.incidencia?.fotografias ?? 0,
              ...(contexto.incidencia
                ? { incidencia: { estado: contexto.incidencia.estado, prioridad: contexto.incidencia.prioridad, tieneTrabajoAsignado: contexto.incidencia.tieneTrabajoAsignado } }
                : {}),
            },
            base,
          ));
        } catch {
          propuesta = null;
          avisos.push('El servicio de análisis avanzado no ha respondido: se ha aplicado el análisis determinista del asistente.');
        }
      } else {
        avisos.push('Sin contexto contractual utilizable: se ha aplicado el análisis determinista del asistente.');
      }

      if (propuesta) {
        const fusion = fusionarPropuestaProveedorIA(base, propuesta);
        diagnostico = fusion.diagnostico;
        avisos.push(...fusion.avisos);
        if (fusion.proveedorAceptado) origenRespuesta = 'PROVEEDOR';
        else log({ evento: 'PROVEEDOR_DESCARTADO', operacionId: entrada.operacionId, uid: entrada.uid });
      }

      if (deps.traza) {
        try {
          await deps.traza.registrar({
            operacionId: entrada.operacionId,
            uid: entrada.uid,
            contratoId: contexto.contratoId,
            incidenciaId: contexto.incidencia?.id ?? null,
            categoria: diagnostico.categoria,
            urgencia: diagnostico.urgencia,
            senales: [...detectarSenalesIA(`${relato} ${(entrada.peticion.respuestas ?? []).map((r) => r.respuesta).join(' ')}`)],
            derivacionRecomendada: diagnostico.derivacion.recomendada,
            destinosDerivacion: [...diagnostico.derivacion.destinos],
            nivelIncertidumbre: diagnostico.incertidumbre.nivel,
            origenRespuesta,
            creadaEn: ahora().toISOString(),
          });
        } catch {
          // La traza es complementaria: su fallo no invalida el diagnóstico ya
          // calculado, pero queda registrado en el log del servidor.
          log({ evento: 'TRAZA_NO_REGISTRADA', operacionId: entrada.operacionId, uid: entrada.uid });
        }
      }

      log({ evento: 'DIAGNOSTICO', operacionId: entrada.operacionId, uid: entrada.uid, codigo: diagnostico.urgencia });
      return { estado: 'OK', contexto, diagnostico, origenRespuesta, avisos };
    },
  };
}

export const MODELO_PROVEEDOR_ASISTENTE_INCIDENCIAS = MODELO_ASISTENTE_INCIDENCIAS_IA;
