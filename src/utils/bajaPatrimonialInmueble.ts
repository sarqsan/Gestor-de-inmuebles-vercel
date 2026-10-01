/**
 * BAJA PATRIMONIAL DEL INMUEBLE — NÚCLEO PURO
 * ===========================================
 * La operación de usuario que sustituye al borrado físico. NO hay aquí ninguna
 * escritura ni ninguna instrucción de borrado: sólo el cálculo determinista de
 * lo que debe cambiar y de lo que debe RETIRARSE de la publicación.
 *
 * Principios que fija este módulo:
 *  · El documento del inmueble NO se borra jamás: la baja es un cambio de estado
 *    (`VENDIDO` / `BAJA` + `SIN_EXPLOTACION` + registro trazable) que produce
 *    `darDeBajaInmueble()` (motor existente, `cicloPatrimonialEngine`).
 *  · El histórico se conserva: titularidades, propietarios, contratos, gastos,
 *    documentos, incidencias, suministros y `historialBajas` siguen intactos.
 *  · La publicación (sindicación por portal) se RETIRA como `DESPUBLICADO`
 *    conservando el registro y su histórico; nunca se borra el estado.
 *  · El estado de la UI sólo cambia cuando la persistencia confirma la baja.
 */
import type { EstadoPublicacionPortal, Inmueble, MotivoBajaPatrimonial, PortalInmobiliario } from '../types';
import { inmuebleDadoDeBaja } from './cicloPatrimonialEngine';

/** Catálogo de motivos del motor patrimonial, con etiqueta presentable. */
export const MOTIVOS_BAJA_PATRIMONIAL: readonly { valor: MotivoBajaPatrimonial; etiqueta: string }[] = [
  { valor: 'VENTA', etiqueta: 'Venta' },
  { valor: 'DONACION', etiqueta: 'Donación' },
  { valor: 'HERENCIA', etiqueta: 'Herencia' },
  { valor: 'PERMUTA', etiqueta: 'Permuta' },
  { valor: 'DEMOLICION', etiqueta: 'Demolición' },
  { valor: 'BAJA_ADMINISTRATIVA', etiqueta: 'Baja administrativa' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export function etiquetaMotivoBaja(motivo: MotivoBajaPatrimonial | undefined | null): string {
  return MOTIVOS_BAJA_PATRIMONIAL.find((m) => m.valor === motivo)?.etiqueta || 'Baja';
}

/** ¿El inmueble está operativo (no dado de baja)? */
export function inmueblesOperativos(inmuebles: readonly Inmueble[]): Inmueble[] {
  return inmuebles.filter((inmueble) => !inmuebleDadoDeBaja(inmueble));
}

/** Inmuebles conservados en el histórico por estar vendidos o dados de baja. */
export function inmueblesDadosDeBaja(inmuebles: readonly Inmueble[]): Inmueble[] {
  return inmuebles.filter((inmueble) => inmuebleDadoDeBaja(inmueble));
}

/**
 * Aplica el resultado de la baja al estado en memoria.
 *
 * GARANTÍA: si la persistencia NO confirmó (`ok: false` o sin parche), devuelve
 * la MISMA referencia de array. Es decir, es imposible que un fallo de Firestore
 * retire el inmueble de la UI o de la caché: la vista sólo cambia cuando la baja
 * está persistida.
 */
export function aplicarBajaAlEstado(
  inmuebles: readonly Inmueble[],
  inmuebleId: string,
  resultado: { ok: boolean; parche?: Partial<Inmueble> },
): Inmueble[] {
  if (!resultado?.ok || !resultado.parche || !inmuebleId) return inmuebles as Inmueble[];
  const parche = resultado.parche;
  return (inmuebles as Inmueble[]).map((inmueble) =>
    inmueble.id === inmuebleId ? ({ ...inmueble, ...parche } as Inmueble) : inmueble,
  );
}

/**
 * Vista mínima de un registro de `sindicacion_inmuebles` necesaria para decidir
 * su retirada. Se declara estructuralmente para que el núcleo siga siendo puro
 * (no importa el dominio de sindicación) y `RegistroEstadoSindicacion` encaje
 * sin conversiones.
 */
export interface EstadoPublicacionRegistrado {
  inmuebleId: string;
  portal: PortalInmobiliario;
  estado: EstadoPublicacionPortal;
  version?: number;
  hashContenido?: string;
}

/** ¿El registro conserva rastro de algo realmente publicado (versión/huella)? */
export function hayAlgoPublicado(registro: EstadoPublicacionRegistrado): boolean {
  return Boolean(registro?.hashContenido) || (typeof registro?.version === 'number' && registro.version > 0);
}

/**
 * ¿Debe retirarse este registro al dar de baja el inmueble?
 *  · Ya `DESPUBLICADO` ⇒ no hay nada que retirar (idempotente).
 *  · `BORRADOR` sin versión ni huella ⇒ nunca salió a un portal: se deja como está.
 *  · Cualquier otro estado (o un borrador con versión/huella publicada) ⇒ retirar.
 */
export function requiereRetiradaPublicacion(registro: EstadoPublicacionRegistrado): boolean {
  if (!registro) return false;
  if (registro.estado === 'DESPUBLICADO') return false;
  if (registro.estado === 'BORRADOR' && !hayAlgoPublicado(registro)) return false;
  return true;
}

/**
 * Registros de publicación que deben pasar a `DESPUBLICADO` al dar de baja el
 * inmueble (opcionalmente acotado a un `inmuebleId`).
 */
export function registrosARetirarPorBaja<T extends EstadoPublicacionRegistrado>(
  registros: readonly T[],
  inmuebleId?: string,
): T[] {
  return (registros || []).filter(
    (registro) => Boolean(registro) && (!inmuebleId || registro.inmuebleId === inmuebleId) && requiereRetiradaPublicacion(registro),
  );
}

/** Aviso de una baja ya registrada (para cabeceras y fichas). */
export function resumenBajaPatrimonial(inmueble: Inmueble | null | undefined): string | null {
  if (!inmueble || !inmuebleDadoDeBaja(inmueble)) return null;
  const baja = inmueble.bajaPatrimonial;
  const fecha = (baja?.fecha || inmueble.fechaVenta || '').slice(0, 10);
  const motivo = etiquetaMotivoBaja(baja?.motivo);
  const estado = inmueble.estadoPatrimonial === 'VENDIDO' ? 'vendido' : 'dado de baja';
  return `${motivo}${fecha ? ` · ${fecha}` : ''} — inmueble ${estado}; se conserva el histórico completo.`;
}
