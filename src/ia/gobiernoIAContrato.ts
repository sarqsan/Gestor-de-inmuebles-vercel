/**
 * IA · FASE 2 + 7 — CONTRATO COMPARTIDO DEL GOBIERNO DE USO
 * =========================================================
 * Módulo PURO (sin dependencias, como `catalogoOperacionesIA.ts`) que comparten:
 *
 *   · el servidor (`server/ia/gobiernoIA.ts` y `server/ia/nucleoIA.ts`), que
 *     aplica permisos por rol y operación, cuotas y saldo ANTES de llamar al
 *     proveedor; y
 *   · el cliente (`src/lib/adminGobiernoIA.ts` y el panel de administración),
 *     que sólo consulta el estado y NUNCA decide permisos ni saldos.
 *
 * FASE 7 — SIN COMODINES, SIN TARIFAS IMPLÍCITAS, SIN CUOTAS ILIMITADAS:
 *
 *   · `'*'` ya no existe: el permiso se declara OPERACIÓN A OPERACIÓN y perfil a
 *     perfil (los cuatro perfiles del espejo de identidad).
 *   · la tarifa se declara para las 12 operaciones del catálogo: una operación
 *     sin tarifa declarada NO es «gratis», es una política INVÁLIDA.
 *   · las cuotas son finitas (día y mes), sin `null` ni «sin límite».
 *
 *   Por eso `IA_POLITICA_JSON` es TODO o NADA: si declara algo, declara
 *   permisos de los 4 perfiles, tarifa de las 12 operaciones y cuotas finitas.
 *   Cualquier hueco ⇒ política INVÁLIDA ⇒ 503 `POLITICA_IA_INVALIDA` (fallo
 *   cerrado, nunca un respaldo permisivo).
 *
 * POLÍTICA POR DEFECTO (sin configurar): NO concede nada. Los cuatro perfiles
 * tienen ámbito EXPLÍCITAMENTE VACÍO (`[]`), las tarifas y cuotas de referencia
 * son datos declarados (no implícitos) y `origen: 'POR_DEFECTO'` mantiene el
 * bloqueo preventivo de aprobación comercial: ninguna operación se ejecuta, no
 * se crea el cliente del proveedor y no se consume nada. Es la configuración con
 * la que viaja el repositorio: el consumo de IA sigue DESACTIVADO hasta que un
 * responsable apruebe y declare la política completa (ver
 * `docs/IA-FASE-7-GOBIERNO-IA-PERMISOS-COSTES.md` y
 * `npm run ia:verificar-politica`).
 *
 * El saldo inicial de cada cuenta es 0 y sólo lo mueve un administrador con
 * importes explícitos.
 */
import { OPERACIONES_IA, type IdOperacionIA } from './catalogoOperacionesIA.js';

/**
 * Perfiles de la fuente de identidad autorizada (el espejo de identidad que
 * mantiene `authService`; este contrato es puro: no importa Firebase).
 */
export type TipoPerfilIA = 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO' | 'ADMINISTRADOR';

export const TIPOS_PERFIL_IA: readonly TipoPerfilIA[] = ['PROPIETARIO', 'PROFESIONAL', 'INQUILINO', 'ADMINISTRADOR'];

/** Cuota de USOS (operaciones) por ventana. Fase 7: SIEMPRE finita (sin `null`). */
export interface CuotasGobiernoIA {
  operacionesPorDia: number;
  operacionesPorMes: number;
}

/**
 * Ámbito de operaciones de un perfil: lista EXPLÍCITA de operaciones del
 * catálogo. Fase 7 elimina el comodín `'*'` (y las listas vacías en las
 * políticas configuradas): cada permiso se concede a mano.
 */
export type AmbitoOperacionesIA = readonly IdOperacionIA[];

export interface PoliticaGobiernoIA {
  version: 1;
  /** `POR_DEFECTO` = sin configurar (deniega todo y bloquea el consumo); `ENTORNO` = declarada en `IA_POLITICA_JSON`. */
  origen: 'POR_DEFECTO' | 'ENTORNO';
  permisos: Readonly<Record<TipoPerfilIA, AmbitoOperacionesIA>>;
  costeCreditosPorOperacion: Readonly<Record<IdOperacionIA, number>>;
  cuotas: CuotasGobiernoIA;
}

/** Resumen SIN secretos que el panel de administración puede mostrar. */
export interface ResumenPoliticaIA {
  version: 1;
  origen: 'POR_DEFECTO' | 'ENTORNO';
  /** true = aún no hay política comercial aprobada y completa: el servidor BLOQUEA el consumo. */
  pendienteAprobacionComercial: boolean;
  /** true = permisos de los 4 perfiles + tarifa de las 12 operaciones + cuotas finitas. */
  politicaCompleta: boolean;
  cuotas: CuotasGobiernoIA;
  costeCreditosPorOperacion: Record<IdOperacionIA, number>;
  perfilesPorOperacion: Record<IdOperacionIA, TipoPerfilIA[]>;
}

/** Variable de entorno con la política en JSON (opcional). Fallo de validación ⇒ bloqueo (fallo cerrado). */
export const VARIABLE_ENTORNO_POLITICA_IA = 'IA_POLITICA_JSON';

// ---------------------------------------------------------------------------
// Tipos de datos compartidos con el panel de administración (solo lectura)
// ---------------------------------------------------------------------------

/** Perfil veraz tal y como lo usa el gobierno (sin email ni nombre). */
export interface PerfilVerazIADTO {
  uid: string;
  tipoPerfil: TipoPerfilIA;
  estado: 'ACTIVO';
}

/** Cuenta de créditos y contadores de uso por usuario (`ia_cuentas/{uid}`). */
export interface CuentaIADTO {
  version: number;
  uid: string;
  saldoCreditos: number;
  bloqueada: boolean;
  motivoBloqueo?: string;
  /** Ventanas en UTC: 'YYYY-MM-DD' y 'YYYY-MM'. */
  ventanaDiaClave: string;
  ventanaDiaUsos: number;
  ventanaMesClave: string;
  ventanaMesUsos: number;
  totalOperaciones: number;
  totalCreditosConsumidos: number;
  ultimoOperacionId?: string;
  actualizadoEn: string;
}

/** Resumen de operación para el panel (sin prompts ni datos personales). */
export interface OperacionResumenIADTO {
  id: string;
  /** UID del actor autenticado que inició la operación. */
  uid: string;
  /** UID de la cuenta titular a la que se imputan llave, cuota y créditos. */
  uidTitular?: string;
  propietarioId?: string;
  operacion: string;
  estado: string;
  codigoHttp?: number;
  origenRespuesta?: string;
  iniciadaEn: string;
  finalizadaEn?: string;
  tokensTotales?: number;
  costeCreditos?: number;
  creditosReembolsados?: number;
}

export type TipoAjusteIADTO = 'CREDITO' | 'BLOQUEO' | 'DESBLOQUEO';

export interface AjusteResumenIADTO {
  id: string;
  tipo: TipoAjusteIADTO;
  uidDestino: string;
  uidAdmin: string;
  creditos?: number;
  motivo?: string;
  estado: 'PENDIENTE' | 'APLICADO';
  creadoEn: string;
}

// ---------------------------------------------------------------------------
// Datos DECLARADOS de referencia (no implícitos): la plantilla que el operador
// aprueba y publica en `IA_POLITICA_JSON` (ver `config/ia/politica-ia.ejemplo.json`).
// ---------------------------------------------------------------------------

const IDS_OPERACIONES: readonly IdOperacionIA[] = OPERACIONES_IA.map((o) => o.id);
const MAX_CREDITOS = 1_000_000;

/** Las 12 operaciones del catálogo, en orden. Útil para plantillas, scripts y pruebas. */
export const OPERACIONES_IA_IDS: readonly IdOperacionIA[] = IDS_OPERACIONES;

/**
 * Tarifas de REFERENCIA en créditos por operación (propuesta comercial; el
 * valor efectivo es siempre el que declare la política aprobada). Se usan:
 *   · como tabla por defecto de la política `POR_DEFECTO` (que está bloqueada); y
 *   · como base de la plantilla `construirPoliticaIACompleta()`.
 * Ninguna operación queda sin tarifa: el catálogo y esta tabla se mantienen
 * sincronizados a prueba de deriva (ver `tests/ia-fase7-*.test.ts`).
 */
export const TARIFAS_IA_REFERENCIA: Readonly<Record<IdOperacionIA, number>> = Object.freeze({
  ANALIZAR_DOCUMENTO: 2,
  GENERAR_CORREO_ASEGURADORA: 1,
  ANALIZAR_RESPUESTA_ASEGURADORA: 1,
  ASISTENTE_INTERPRETAR: 1,
  ANALIZAR_CUESTIONARIO: 2,
  REDACTAR_CLAUSULA: 2,
  ANALIZAR_INSPECCION: 3,
  PROPONER_MEJORAS: 2,
  ESTIMAR_PRICING: 2,
  GENERAR_KIT_PUBLICACION: 2,
  ANALIZAR_INCIDENCIA: 2,
  ASISTENTE_INCIDENCIAS_INQUILINO: 2,
});

/**
 * Límites de REFERENCIA por usuario y ventana UTC (operaciones, no créditos).
 * Finitos y deliberadamente bajos: un uso anómalo choca con la cuota antes que
 * con la factura del proveedor.
 */
export const CUOTAS_IA_REFERENCIA: Readonly<CuotasGobiernoIA> = Object.freeze({
  operacionesPorDia: 20,
  operacionesPorMes: 200,
});

/**
 * Permisos de REFERENCIA por perfil: mínimo privilegio, operación a operación.
 * `ADMINISTRADOR` ve las 12 (opera el ERP completo y el panel de gobierno); el
 * resto, sólo lo que su área utiliza.
 */
export const PERMISOS_IA_REFERENCIA: Readonly<Record<TipoPerfilIA, AmbitoOperacionesIA>> = Object.freeze({
  PROPIETARIO: Object.freeze<IdOperacionIA[]>([
    'ANALIZAR_DOCUMENTO',
    'PROPONER_MEJORAS',
    'ESTIMAR_PRICING',
    'GENERAR_KIT_PUBLICACION',
    'ASISTENTE_INTERPRETAR',
  ]),
  PROFESIONAL: Object.freeze<IdOperacionIA[]>([
    'ANALIZAR_INSPECCION',
    'ANALIZAR_INCIDENCIA',
    'PROPONER_MEJORAS',
    'ASISTENTE_INTERPRETAR',
  ]),
  INQUILINO: Object.freeze<IdOperacionIA[]>([
    'ASISTENTE_INCIDENCIAS_INQUILINO',
    'ASISTENTE_INTERPRETAR',
  ]),
  ADMINISTRADOR: Object.freeze([...IDS_OPERACIONES]),
});

/** Sobrescrituras admitidas al construir una política completa (se fusionan sobre la referencia). */
export interface SobrescriturasPoliticaIA {
  /** Un perfil presente SUSTITUYE su ámbito completo (no se acumula al de referencia). */
  permisos?: Partial<Record<TipoPerfilIA, AmbitoOperacionesIA>>;
  /** Se fusiona operación a operación sobre la tabla de referencia (las 12 quedan declaradas). */
  costeCreditosPorOperacion?: Partial<Record<IdOperacionIA, number>>;
  cuotas?: Partial<CuotasGobiernoIA>;
}

/**
 * Construye una política COMPLETA (la misma forma que exige `IA_POLITICA_JSON`)
 * a partir de la referencia, aplicando sobrescrituras. Sirve para el ejemplo
 * versionado, para `scripts/verificar-politica-ia.mts` y para las pruebas.
 */
export function construirPoliticaIACompleta(sobrescrituras: SobrescriturasPoliticaIA = {}): PoliticaGobiernoIA {
  const permisos = {} as Record<TipoPerfilIA, AmbitoOperacionesIA>;
  for (const perfil of TIPOS_PERFIL_IA) {
    permisos[perfil] = [...(sobrescrituras.permisos?.[perfil] ?? PERMISOS_IA_REFERENCIA[perfil])];
  }
  const coste = {} as Record<IdOperacionIA, number>;
  for (const id of IDS_OPERACIONES) {
    coste[id] = sobrescrituras.costeCreditosPorOperacion?.[id] ?? TARIFAS_IA_REFERENCIA[id];
  }
  return {
    version: 1,
    origen: 'ENTORNO',
    permisos,
    costeCreditosPorOperacion: coste,
    cuotas: {
      operacionesPorDia: sobrescrituras.cuotas?.operacionesPorDia ?? CUOTAS_IA_REFERENCIA.operacionesPorDia,
      operacionesPorMes: sobrescrituras.cuotas?.operacionesPorMes ?? CUOTAS_IA_REFERENCIA.operacionesPorMes,
    },
  };
}

/**
 * ¿La política está COMPLETA (y por tanto puede gobernar el consumo)?
 * Comprueba la política EFECTIVA, no cómo se construyó: aunque alguien arme un
 * objeto a mano con huecos, el servidor lo trata como pendiente y bloquea.
 */
export function politicaCompletaIA(politica: PoliticaGobiernoIA): boolean {
  for (const perfil of TIPOS_PERFIL_IA) {
    const ambito = politica.permisos[perfil];
    if (!Array.isArray(ambito)) return false;
    if (ambito.some((id) => !IDS_OPERACIONES.includes(id))) return false;
  }
  for (const id of IDS_OPERACIONES) {
    const coste = politica.costeCreditosPorOperacion[id];
    if (typeof coste !== 'number' || !Number.isInteger(coste) || coste < 0) return false;
  }
  const { operacionesPorDia, operacionesPorMes } = politica.cuotas;
  return (
    Number.isInteger(operacionesPorDia) && operacionesPorDia >= 1 &&
    Number.isInteger(operacionesPorMes) && operacionesPorMes >= 1
  );
}

function esIdOperacion(valor: unknown): valor is IdOperacionIA {
  return typeof valor === 'string' && (IDS_OPERACIONES as readonly string[]).includes(valor);
}

/**
 * Política `POR_DEFECTO` (sin `IA_POLITICA_JSON`): DENIEGA todo —ámbitos vacíos
 * declarados—, no inventa tarifas (usa la tabla de referencia, que está a la
 * vista) y aplica las cuotas de referencia. Sigue bloqueada por
 * `pendienteAprobacionComercial` (origen `POR_DEFECTO`).
 */
function politicaPorDefecto(): PoliticaGobiernoIA {
  const permisos = {} as Record<TipoPerfilIA, AmbitoOperacionesIA>;
  for (const perfil of TIPOS_PERFIL_IA) permisos[perfil] = [];
  return {
    version: 1,
    origen: 'POR_DEFECTO',
    permisos,
    costeCreditosPorOperacion: { ...TARIFAS_IA_REFERENCIA },
    cuotas: { ...CUOTAS_IA_REFERENCIA },
  };
}

/** Estructura admitida en `IA_POLITICA_JSON` (las tres secciones son obligatorias). */
export interface PoliticaEntornoCruda {
  permisos?: Record<string, unknown>;
  costeCreditosPorOperacion?: Record<string, unknown>;
  cuotas?: { operacionesPorDia?: unknown; operacionesPorMes?: unknown };
}

/**
 * Valida y normaliza una política declarada. Reglas (Fase 7):
 *   · las tres secciones son OBLIGATORIAS: sin permisos, tarifas o cuotas no hay
 *     política, hay una configuración incompleta (y el consumo queda bloqueado);
 *   · `permisos` declara los CUATRO perfiles, cada uno con su lista explícita de
 *     operaciones del catálogo (nada de `'*'`, sin repetir; la lista vacía se
 *     admite y significa que ese perfil no usa IA, pero el perfil se declara);
 *   · `costeCreditosPorOperacion` declara la tarifa de las 12 operaciones
 *     (entero entre 0 y el máximo; 0 es «sin coste» declarado, no un descuido);
 *   · `cuotas` es finita en día y mes (entero ≥ 1; `null` ya no se admite).
 * Los errores de contenido (rol u operación desconocidos, valores no válidos) se
 * informan ANTES que los de completitud, para que el mensaje señale la causa.
 */
export function validarPoliticaGobiernoIA(crudo: unknown): { estado: 'VALIDA'; politica: PoliticaGobiernoIA } | { estado: 'INVALIDA'; error: string } {
  if (crudo === null || crudo === undefined) return { estado: 'VALIDA' as const, politica: politicaPorDefecto() };
  if (typeof crudo !== 'object' || Array.isArray(crudo)) return { estado: 'INVALIDA' as const, error: 'la política debe ser un objeto JSON' };
  const entrada = crudo as PoliticaEntornoCruda;

  // --- 1) Contenido declarado: roles, operaciones y valores válidos -------------
  const permisosDeclarados = {} as Partial<Record<TipoPerfilIA, AmbitoOperacionesIA>>;
  if (entrada.permisos !== undefined) {
    if (typeof entrada.permisos !== 'object' || entrada.permisos === null || Array.isArray(entrada.permisos)) {
      return { estado: 'INVALIDA' as const, error: 'permisos: debe ser un objeto por perfil' };
    }
    for (const [perfil, valor] of Object.entries(entrada.permisos)) {
      if (!(TIPOS_PERFIL_IA as readonly string[]).includes(perfil)) {
        return { estado: 'INVALIDA' as const, error: `permisos: perfil desconocido «${perfil}» (los roles no se inventan: ${TIPOS_PERFIL_IA.join(', ')})` };
      }
      const ambito = validarAmbito(valor, `permisos.${perfil}`);
      if (ambito.estado === 'INVALIDO') return { estado: 'INVALIDA' as const, error: ambito.error };
      permisosDeclarados[perfil as TipoPerfilIA] = ambito.ambito;
    }
  }

  const costesDeclarados = {} as Partial<Record<IdOperacionIA, number>>;
  if (entrada.costeCreditosPorOperacion !== undefined) {
    if (typeof entrada.costeCreditosPorOperacion !== 'object' || entrada.costeCreditosPorOperacion === null || Array.isArray(entrada.costeCreditosPorOperacion)) {
      return { estado: 'INVALIDA' as const, error: 'costeCreditosPorOperacion: debe ser un objeto por operación' };
    }
    for (const [id, valor] of Object.entries(entrada.costeCreditosPorOperacion)) {
      if (!esIdOperacion(id)) return { estado: 'INVALIDA' as const, error: `costeCreditosPorOperacion: operación desconocida «${id}»` };
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > MAX_CREDITOS) {
        return { estado: 'INVALIDA' as const, error: `costeCreditosPorOperacion.${id}: debe ser un entero entre 0 y ${MAX_CREDITOS}` };
      }
      costesDeclarados[id] = valor;
    }
  }

  const cuotasDeclaradas = {} as Partial<CuotasGobiernoIA>;
  if (entrada.cuotas !== undefined) {
    if (typeof entrada.cuotas !== 'object' || entrada.cuotas === null || Array.isArray(entrada.cuotas)) {
      return { estado: 'INVALIDA' as const, error: 'cuotas: debe ser un objeto' };
    }
    for (const clave of ['operacionesPorDia', 'operacionesPorMes'] as const) {
      const valor = entrada.cuotas[clave];
      if (valor === undefined) continue;
      if (valor === null) {
        return { estado: 'INVALIDA' as const, error: `cuotas.${clave}: las cuotas ilimitadas («null») no se admiten; declara un límite finito` };
      }
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > MAX_CREDITOS) {
        return { estado: 'INVALIDA' as const, error: `cuotas.${clave}: debe ser un entero entre 1 y ${MAX_CREDITOS}` };
      }
      cuotasDeclaradas[clave] = valor;
    }
  }

  // --- 2) Completitud: TODO o NADA ---------------------------------------------
  if (entrada.permisos === undefined) {
    return { estado: 'INVALIDA' as const, error: `permisos: falta declarar el ámbito de los ${TIPOS_PERFIL_IA.length} perfiles (${TIPOS_PERFIL_IA.join(', ')}); no hay permisos implícitos` };
  }
  const perfilesSinDeclarar = TIPOS_PERFIL_IA.filter((perfil) => permisosDeclarados[perfil] === undefined);
  if (perfilesSinDeclarar.length > 0) {
    return { estado: 'INVALIDA' as const, error: `permisos: faltan perfiles por declarar (${perfilesSinDeclarar.join(', ')}); los permisos no se heredan` };
  }
  if (entrada.costeCreditosPorOperacion === undefined) {
    return { estado: 'INVALIDA' as const, error: `costeCreditosPorOperacion: falta declarar la tarifa de las ${IDS_OPERACIONES.length} operaciones del catálogo (no hay tarifas implícitas)` };
  }
  const operacionesSinTarifa = IDS_OPERACIONES.filter((id) => costesDeclarados[id] === undefined);
  if (operacionesSinTarifa.length > 0) {
    return { estado: 'INVALIDA' as const, error: `costeCreditosPorOperacion: falta la tarifa de ${operacionesSinTarifa.join(', ')}` };
  }
  if (entrada.cuotas === undefined || cuotasDeclaradas.operacionesPorDia === undefined || cuotasDeclaradas.operacionesPorMes === undefined) {
    return { estado: 'INVALIDA' as const, error: 'cuotas: falta declarar operacionesPorDia y operacionesPorMes (ninguna cuota es ilimitada)' };
  }

  const politica: PoliticaGobiernoIA = {
    version: 1,
    origen: 'ENTORNO',
    permisos: permisosDeclarados as Record<TipoPerfilIA, AmbitoOperacionesIA>,
    costeCreditosPorOperacion: costesDeclarados as Record<IdOperacionIA, number>,
    cuotas: cuotasDeclaradas as CuotasGobiernoIA,
  };
  // Invariante final: lo que salga de aquí está completo (una sola definición de «completa»).
  if (!politicaCompletaIA(politica)) return { estado: 'INVALIDA' as const, error: 'la política declarada no está completa' };
  return { estado: 'VALIDA' as const, politica };
}

function validarAmbito(valor: unknown, donde: string): { estado: 'VALIDO'; ambito: AmbitoOperacionesIA } | { estado: 'INVALIDO'; error: string } {
  if (valor === '*' || (Array.isArray(valor) && valor.includes('*'))) {
    return { estado: 'INVALIDO' as const, error: `${donde}: los permisos comodín («*») ya no se admiten; declara cada operación del catálogo` };
  }
  if (!Array.isArray(valor)) return { estado: 'INVALIDO' as const, error: `${donde}: debe ser una lista de operaciones del catálogo` };
  // Lista vacía = el perfil queda SIN operaciones de IA, pero DECLARADO (nunca omitido).
  const ambito: IdOperacionIA[] = [];
  for (const entrada of valor) {
    if (!esIdOperacion(entrada)) return { estado: 'INVALIDO' as const, error: `${donde}: operación desconocida «${String(entrada)}»` };
    if (ambito.includes(entrada)) return { estado: 'INVALIDO' as const, error: `${donde}: operación repetida «${entrada}»` };
    ambito.push(entrada);
  }
  return { estado: 'VALIDO' as const, ambito };
}

/** Política efectiva: por defecto (deniega todo y bloquea) o la de `IA_POLITICA_JSON` (inválida ⇒ error, nunca un respaldo permisivo). */
export function politicaGobiernoIADesdeEntorno(entorno: NodeJS.ProcessEnv = process.env): { estado: 'VALIDA'; politica: PoliticaGobiernoIA } | { estado: 'INVALIDA'; error: string } {
  const crudo = entorno[VARIABLE_ENTORNO_POLITICA_IA];
  if (crudo === undefined || crudo.trim() === '') return { estado: 'VALIDA' as const, politica: politicaPorDefecto() };
  try {
    return validarPoliticaGobiernoIA(JSON.parse(crudo));
  } catch {
    return { estado: 'INVALIDA' as const, error: `${VARIABLE_ENTORNO_POLITICA_IA}: no es un JSON válido` };
  }
}

/** ¿El perfil puede usar la operación? (Los roles no están en el cuerpo: llegan del espejo verificado en servidor.) */
export function permiteOperacion(politica: PoliticaGobiernoIA, perfil: TipoPerfilIA, operacion: IdOperacionIA): boolean {
  const ambito = politica.permisos[perfil];
  if (!ambito) return false;
  return ambito.includes(operacion);
}

/** Coste en créditos de la operación según la política (entero ≥ 0; declarado siempre). */
export function costeOperacion(politica: PoliticaGobiernoIA, operacion: IdOperacionIA): number {
  const coste = politica.costeCreditosPorOperacion[operacion];
  return typeof coste === 'number' ? coste : 0;
}

/** Resumen serializable (sin secretos) para el panel de administración. */
export function resumenPoliticaGobiernoIA(politica: PoliticaGobiernoIA): ResumenPoliticaIA {
  const perfilesPorOperacion = {} as Record<IdOperacionIA, TipoPerfilIA[]>;
  for (const id of IDS_OPERACIONES) {
    perfilesPorOperacion[id] = TIPOS_PERFIL_IA.filter((perfil) => permiteOperacion(politica, perfil, id));
  }
  // Fase 7: sólo una política DECLARADA (ENTORNO) y COMPLETA habilita el consumo.
  const completa = politica.origen === 'ENTORNO' && politicaCompletaIA(politica);
  return {
    version: 1,
    origen: politica.origen,
    pendienteAprobacionComercial: !completa,
    politicaCompleta: completa,
    cuotas: { ...politica.cuotas },
    costeCreditosPorOperacion: { ...politica.costeCreditosPorOperacion } as Record<IdOperacionIA, number>,
    perfilesPorOperacion,
  };
}
