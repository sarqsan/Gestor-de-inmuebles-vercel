/**
 * BLOQUE 10 · UX-3 — CONFIRMACIÓN DE ACCIONES (sustituye a `window.confirm`).
 *
 * Requisitos de la orden (§5):
 *  1. indicar claramente qué va a ocurrir;
 *  2. diferenciar cancelar/confirmar;
 *  3. evitar doble ejecución (el diálogo pasa a «ejecutando» y no se puede repetir);
 *  4. bloquear mientras la operación está en curso;
 *  5. mostrar el resultado final (vía el canal de avisos);
 *  6. mostrar el error si la operación falla (el diálogo se queda abierto con el motivo).
 *
 * La operación confirmada se ejecuta **exactamente** la que ya existía tras el
 * `window.confirm`: se pasa como `alConfirmar` y el diálogo sólo espera su resultado.
 *
 * Degradación documentada: si el host visual no está montado (tests de componente
 * aislados o vistas sin shell), se usa `window.confirm`/`window.prompt` para no
 * cambiar el comportamiento existente ni bloquear la aplicación.
 */
import { mensajeDeErrorUsuario } from './mensajes';

export interface EntradaTextoConfirmacion {
  etiqueta: string;
  marcador?: string;
  obligatorio?: boolean;
  valorInicial?: string;
  /** Mensaje de error si se confirma con el campo vacío (y es obligatorio). */
  errorObligatorio?: string;
}

export interface OpcionesConfirmacion {
  /** Título corto: qué acción es. Ej. «Eliminar póliza». */
  titulo: string;
  /** Qué va a ocurrir exactamente. */
  mensaje: string;
  /** Contexto adicional (consecuencias, datos que se conservan…). */
  detalle?: string;
  /** Etiqueta del botón de confirmación. Por defecto «Confirmar». */
  etiquetaConfirmar?: string;
  /** Etiqueta del botón de cancelación. Por defecto «Cancelar». */
  etiquetaCancelar?: string;
  /** Etiqueta mientras la operación se ejecuta. Por defecto «Procesando…». */
  etiquetaEjecutando?: string;
  /** Acción destructiva/irreversible: refuerza el estilo y el aviso. */
  peligroso?: boolean;
  /** Campo de texto opcional (sustituye a `window.prompt`). */
  entradaTexto?: EntradaTextoConfirmacion;
  /** Operación a ejecutar al confirmar (la misma que había tras el `confirm`). */
  alConfirmar?: (texto?: string) => Promise<unknown> | unknown;
}

export interface ResultadoConfirmacion {
  readonly confirmado: boolean;
  readonly texto?: string;
}

export interface PeticionConfirmacion extends OpcionesConfirmacion {
  readonly id: string;
}

export interface EstadoDialogoConfirmacion extends PeticionConfirmacion {
  ejecutando: boolean;
  error?: string;
}

type Resolutor = (resultado: ResultadoConfirmacion) => void;

interface PeticionInterna {
  peticion: PeticionConfirmacion;
  resolver: Resolutor;
  actualizar: (parcial: Partial<EstadoDialogoConfirmacion>) => void;
}

let cola: PeticionInterna[] = [];
let actual: EstadoDialogoConfirmacion | null = null;
let pendienteActual: PeticionInterna | null = null;
let montado = false;
const oyentes = new Set<() => void>();
let secuencia = 0;

function notificar(): void {
  for (const oyente of Array.from(oyentes)) {
    try {
      oyente();
    } catch {
      // Un oyente defectuoso no puede romper el canal.
    }
  }
}

/** El host visual avisa de que está montado (lo monta el shell de la aplicación). */
export function registrarHostConfirmacion(): () => void {
  montado = true;
  notificar();
  return () => {
    montado = false;
    // Las peticiones pendientes no pueden quedarse colgadas al desmontar el host.
    const pendientes = cola;
    cola = [];
    actual = null;
    pendientes.forEach((item) => item.resolver({ confirmado: false }));
    notificar();
  };
}

export function hayHostConfirmacion(): boolean {
  return montado;
}

export function suscribirConfirmacion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function peticionConfirmacion(): EstadoDialogoConfirmacion | null {
  return actual;
}

function abrirSiguiente(): void {
  if (actual || cola.length === 0) return;
  const [siguiente, ...resto] = cola;
  cola = resto;
  actual = {
    ...siguiente.peticion,
    ejecutando: false,
    error: undefined,
  };
  pendienteActual = siguiente;
  notificar();
}

/** Solicita confirmación. Nunca lanza: si algo va mal, se resuelve como cancelado. */
export function confirmar(opciones: OpcionesConfirmacion): Promise<ResultadoConfirmacion> {
  if (!montado) {
    // Degradación documentada: mismo comportamiento que tenía la aplicación
    // (`window.confirm`/`window.prompt` seguido de la operación real).
    const texto = [opciones.mensaje, opciones.detalle].filter(Boolean).join('\n\n');
    if (opciones.entradaTexto) {
      const valor =
        typeof window === 'undefined'
          ? null
          : window.prompt(opciones.entradaTexto.etiqueta, opciones.entradaTexto.valorInicial ?? '');
      if (valor === null) return Promise.resolve({ confirmado: false });
      if (opciones.entradaTexto.obligatorio && !valor.trim()) return Promise.resolve({ confirmado: false });
      return ejecutarEnDegradacion(opciones, valor.trim());
    }
    const ok = typeof window === 'undefined' ? false : window.confirm(texto);
    if (!ok) return Promise.resolve({ confirmado: false });
    return ejecutarEnDegradacion(opciones);
  }

  return new Promise<ResultadoConfirmacion>((resolver) => {
    const item: PeticionInterna = {
      peticion: { ...opciones, id: `cf-${++secuencia}` },
      resolver,
      actualizar: (parcial) => {
        if (!actual || actual.id !== item.peticion.id) return;
        actual = { ...actual, ...parcial };
        notificar();
      },
    };
    cola = [...cola, item];
    abrirSiguiente();
  });
}

/**
 * Ejecuta la operación en modo degradado (sin host visual). Si falla, el canal de
 * avisos ya lo comunica: aquí se resuelve como no confirmado y sin éxito.
 */
async function ejecutarEnDegradacion(
  opciones: OpcionesConfirmacion,
  texto?: string
): Promise<ResultadoConfirmacion> {
  try {
    await opciones.alConfirmar?.(texto);
  } catch {
    return { confirmado: false };
  }
  return { confirmado: true, texto };
}

/** Confirmación de una acción destructiva que ejecuta y cierra mostrando el resultado. */
export async function confirmarYEjecutar(opciones: OpcionesConfirmacion): Promise<ResultadoConfirmacion> {
  return confirmar(opciones);
}

function cerrar(resultado: ResultadoConfirmacion): void {
  const item = pendienteActual;
  pendienteActual = null;
  actual = null;
  notificar();
  abrirSiguiente();
  item?.resolver(resultado);
}

/** Llamado por el host: confirma el diálogo actual y ejecuta `alConfirmar`. */
export async function aceptarConfirmacion(texto?: string): Promise<void> {
  const item = pendienteActual;
  if (!item || !actual) return;

  const entrada = item.peticion.entradaTexto;
  const valor = (texto ?? '').trim();
  if (entrada?.obligatorio && !valor) {
    item.actualizar({
      error: entrada.errorObligatorio ?? `«${entrada.etiqueta}» es obligatorio.`,
    });
    return;
  }

  item.actualizar({ ejecutando: true, error: undefined });
  try {
    await item.peticion.alConfirmar?.(valor || undefined);
  } catch (error) {
    // El diálogo permanece abierto con el motivo: la operación no se da por hecha.
    const mensaje = mensajeDeErrorUsuario(error, 'No se ha podido completar la operación.');
    item.actualizar({ ejecutando: false, error: mensaje });
    return;
  }
  cerrar({ confirmado: true, texto: valor || undefined });
}

/** Llamado por el host: cancela (no ejecuta nada). */
export function cancelarConfirmacion(): void {
  if (!actual) return;
  cerrar({ confirmado: false });
}

/** Sólo para pruebas. */
export function reiniciarConfirmacion(): void {
  const pendientes = cola;
  cola = [];
  actual = null;
  pendienteActual = null;
  pendientes.forEach((item) => item.resolver({ confirmado: false }));
  notificar();
}
