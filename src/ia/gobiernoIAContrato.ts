/**
 * IA · FASE 2 — CONTRATO COMPARTIDO DEL GOBIERNO DE USO
 * =====================================================
 * Módulo PURO (sin dependencias, como `catalogoOperacionesIA.ts`) que comparten:
 *
 *   · el servidor (`server/ia/gobiernoIA.ts` y `server/ia/nucleoIA.ts`), que
 *     aplica permisos por rol y operación, cuotas y saldo ANTES de llamar al
 *     proveedor; y
 *   · el cliente (`src/lib/adminGobiernoIA.ts` y el panel de administración),
 *     que sólo consulta el estado y NUNCA decide permisos ni saldos.
 *
 * POLÍTICA POR DEFECTO (sin configurar): conserva EXACTAMENTE el comportamiento
 * de Fase 1 — todo usuario autenticado con perfil veraz activo puede usar las
 * 11 operaciones, el coste es 0 créditos y no hay cuotas. NO fija precios ni
 * límites comerciales: esos valores están PENDIENTES DE APROBACIÓN y se
 * configuran de forma explícita (variable de entorno `IA_POLITICA_JSON`, ver
 * `politicaGobiernoIADesdeEntorno`). El saldo inicial de cada cuenta es 0 y
 * sólo lo mueve un administrador con importes explícitos.
 */
import { OPERACIONES_IA, type IdOperacionIA } from './catalogoOperacionesIA.js';

/**
 * Perfiles de la fuente de identidad autorizada (el espejo de identidad que
 * mantiene `authService`; este contrato es puro: no importa Firebase).
 */
export type TipoPerfilIA = 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO' | 'ADMINISTRADOR';

export const TIPOS_PERFIL_IA: readonly TipoPerfilIA[] = ['PROPIETARIO', 'PROFESIONAL', 'INQUILINO', 'ADMINISTRADOR'];

/** Cuota de USOS (operaciones) por ventana; `null` = sin límite (Fase 1). */
export interface CuotasGobiernoIA {
  operacionesPorDia: number | null;
  operacionesPorMes: number | null;
}

/** `'*'` = todas las operaciones del catálogo (Fase 1); o una lista explícita de ids. */
export type AmbitoOperacionesIA = readonly ('*' | IdOperacionIA)[];

export interface PoliticaGobiernoIA {
  version: 1;
  /** `POR_DEFECTO` = sin configurar (Fase 1 intacta); `ENTORNO` = configurada vía `IA_POLITICA_JSON`. */
  origen: 'POR_DEFECTO' | 'ENTORNO';
  permisos: Readonly<Record<TipoPerfilIA, AmbitoOperacionesIA>>;
  costeCreditosPorOperacion: Readonly<Record<IdOperacionIA, number>>;
  cuotas: CuotasGobiernoIA;
}

/** Resumen SIN secretos que el panel de administración puede mostrar. */
export interface ResumenPoliticaIA {
  version: 1;
  origen: 'POR_DEFECTO' | 'ENTORNO';
  /** true = aún no hay política comercial aprobada: rigen los valores neutros de Fase 1. */
  pendienteAprobacionComercial: boolean;
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
  uid: string;
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

const IDS_OPERACIONES: readonly IdOperacionIA[] = OPERACIONES_IA.map((o) => o.id);
const MAX_CREDITOS = 1_000_000;

function esIdOperacion(valor: unknown): valor is IdOperacionIA {
  return typeof valor === 'string' && (IDS_OPERACIONES as readonly string[]).includes(valor);
}

function politicaPorDefecto(): PoliticaGobiernoIA {
  const costes = {} as Record<IdOperacionIA, number>;
  for (const id of IDS_OPERACIONES) costes[id] = 0;
  return {
    version: 1,
    origen: 'POR_DEFECTO',
    permisos: { PROPIETARIO: ['*'], PROFESIONAL: ['*'], INQUILINO: ['*'], ADMINISTRADOR: ['*'] },
    costeCreditosPorOperacion: costes,
    cuotas: { operacionesPorDia: null, operacionesPorMes: null },
  };
}

/** Estructura admitida en `IA_POLITICA_JSON` (todas las secciones opcionales; cada valor presente sustituye al por defecto). */
export interface PoliticaEntornoCruda {
  permisos?: Record<string, unknown>;
  costeCreditosPorOperacion?: Record<string, unknown>;
  cuotas?: { operacionesPorDia?: unknown; operacionesPorMes?: unknown };
}

function validarAmbito(valor: unknown, donde: string): { estado: 'VALIDO'; ambito: AmbitoOperacionesIA } | { estado: 'INVALIDO'; error: string } {
  if (valor === '*') return { estado: 'VALIDO' as const, ambito: ['*' as const] };
  if (!Array.isArray(valor) || valor.length === 0) return { estado: 'INVALIDO' as const, error: `${donde}: debe ser '*' o una lista no vacía de ids del catálogo` };
  const ambito: ('*' | IdOperacionIA)[] = [];
  for (const entrada of valor) {
    if (entrada === '*') return { estado: 'INVALIDO' as const, error: `${donde}: '*' no puede mezclarse con operaciones concretas` };
    if (!esIdOperacion(entrada)) return { estado: 'INVALIDO' as const, error: `${donde}: operación desconocida «${String(entrada)}»` };
    if (ambito.includes(entrada)) return { estado: 'INVALIDO' as const, error: `${donde}: operación repetida «${entrada}»` };
    ambito.push(entrada);
  }
  return { estado: 'VALIDO' as const, ambito };
}

/**
 * Valida y fusiona una política cruda sobre los valores por defecto.
 * Deniega: roles inventados, operaciones fuera del catálogo, costes no enteros
 * o negativos, cuotas no enteras o < 1, o `*` mezclado con operaciones.
 */
export function validarPoliticaGobiernoIA(crudo: unknown): { estado: 'VALIDA'; politica: PoliticaGobiernoIA } | { estado: 'INVALIDA'; error: string } {
  if (crudo === null || crudo === undefined) return { estado: 'VALIDA' as const, politica: politicaPorDefecto() };
  if (typeof crudo !== 'object' || Array.isArray(crudo)) return { estado: 'INVALIDA' as const, error: 'la política debe ser un objeto JSON' };
  const entrada = crudo as PoliticaEntornoCruda;
  const politica = politicaPorDefecto();
  politica.origen = 'ENTORNO';

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
      politica.permisos = { ...politica.permisos, [perfil]: ambito.ambito };
    }
  }

  if (entrada.costeCreditosPorOperacion !== undefined) {
    if (typeof entrada.costeCreditosPorOperacion !== 'object' || entrada.costeCreditosPorOperacion === null || Array.isArray(entrada.costeCreditosPorOperacion)) {
      return { estado: 'INVALIDA' as const, error: 'costeCreditosPorOperacion: debe ser un objeto por operación' };
    }
    const costes = { ...politica.costeCreditosPorOperacion } as Record<IdOperacionIA, number>;
    for (const [id, valor] of Object.entries(entrada.costeCreditosPorOperacion)) {
      if (!esIdOperacion(id)) return { estado: 'INVALIDA' as const, error: `costeCreditosPorOperacion: operación desconocida «${id}»` };
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > MAX_CREDITOS) {
        return { estado: 'INVALIDA' as const, error: `costeCreditosPorOperacion.${id}: debe ser un entero entre 0 y ${MAX_CREDITOS}` };
      }
      costes[id] = valor;
    }
    politica.costeCreditosPorOperacion = costes;
  }

  if (entrada.cuotas !== undefined) {
    if (typeof entrada.cuotas !== 'object' || entrada.cuotas === null || Array.isArray(entrada.cuotas)) {
      return { estado: 'INVALIDA' as const, error: 'cuotas: debe ser un objeto' };
    }
    for (const clave of ['operacionesPorDia', 'operacionesPorMes'] as const) {
      const valor = entrada.cuotas[clave];
      if (valor === undefined) continue;
      if (valor === null) { politica.cuotas[clave] = null; continue; }
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > MAX_CREDITOS) {
        return { estado: 'INVALIDA' as const, error: `cuotas.${clave}: debe ser null o un entero entre 1 y ${MAX_CREDITOS}` };
      }
      politica.cuotas[clave] = valor;
    }
  }

  return { estado: 'VALIDA' as const, politica };
}

/** Política efectiva: por defecto, o la de `IA_POLITICA_JSON` (inválida ⇒ error, nunca un respaldo permisivo). */
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
  return ambito.includes('*') || ambito.includes(operacion);
}

/** Coste en créditos de la operación según la política (entero ≥ 0). */
export function costeOperacion(politica: PoliticaGobiernoIA, operacion: IdOperacionIA): number {
  return politica.costeCreditosPorOperacion[operacion] ?? 0;
}

/** Resumen serializable (sin secretos) para el panel de administración. */
export function resumenPoliticaGobiernoIA(politica: PoliticaGobiernoIA): ResumenPoliticaIA {
  const perfilesPorOperacion = {} as Record<IdOperacionIA, TipoPerfilIA[]>;
  for (const id of IDS_OPERACIONES) {
    perfilesPorOperacion[id] = TIPOS_PERFIL_IA.filter((perfil) => permiteOperacion(politica, perfil, id));
  }
  const tarifasDefinidas = IDS_OPERACIONES.some((id) => (politica.costeCreditosPorOperacion[id] ?? 0) > 0);
  return {
    version: 1,
    origen: politica.origen,
    pendienteAprobacionComercial: politica.origen === 'POR_DEFECTO' || !tarifasDefinidas,
    cuotas: { ...politica.cuotas },
    costeCreditosPorOperacion: { ...politica.costeCreditosPorOperacion } as Record<IdOperacionIA, number>,
    perfilesPorOperacion,
  };
}
