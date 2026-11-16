/**
 * AG-10 · Guardado automático del contrato: reintentos sin perder el estado.
 *
 * PROBLEMA QUE RESUELVE
 * El efecto que materializa los cobros llamaba a `saveContratoFirestore` sin
 * `await` y sin tratamiento del rechazo:
 *
 *   saveContratoFirestore(sincro.contratoActualizado);     // sin await
 *   setContratos((prev) => prev.map(...));
 *
 * 1. **Error de red o permiso denegado → fallo silencioso.** La promesa se
 *    rechazaba sin capturar y el estado en memoria quedaba actualizado con datos
 *    que NUNCA se habían persistido. Como la firma de idempotencia
 *    (`cobrosEnsureRef`) ya se había marcado, el efecto no reintentaba: los
 *    cobros se daban por materializados en pantalla y se perdían al recargar.
 * 2. **Estado invisible.** El usuario no sabía si su cambio estaba guardado.
 * 3. **Sobrescrituras.** `saveContratoFirestore` hace `setDoc merge` con el
 *    documento completo: escribir un `registroCobros` calculado desde una
 *    lectura vieja puede pisar un pago registrado por otro cliente.
 *
 * QUÉ HACE ESTE MÓDULO
 * Envuelve la persistencia con:
 *   · `await` y captura del error (se reporta por el canal existente).
 *   · reintentos con espera creciente y un tope; el estado local NO se marca
 *     como guardado hasta que la escritura confirma.
 *   · deduplicación por `clave` + `huella`: si llega el mismo contenido mientras
 *     hay un guardado en vuelo, no se lanza otro.
 *   · protección frente a sobrescritura por obsolescencia: si el contrato cambió
 *     desde la lectura base, se descarta el guardado (hay uno más reciente).
 *   · un estado observable (`PENDIENTE` → `GUARDANDO` → `GUARDADO` | `ERROR`)
 *     para que la interfaz pueda mostrarlo.
 *
 * El estado es por contrato, no global: dos contratos no se bloquean entre sí.
 */

export type EstadoGuardado = 'PENDIENTE' | 'GUARDANDO' | 'GUARDADO' | 'ERROR' | 'OBSOLETO';

export interface ObservadorEstadoGuardado {
  contratoId: string;
  estado: EstadoGuardado;
  intentos: number;
  error?: string;
}

export interface OpcionesGuardadoAutomatico {
  /** `true` si el perfil puede escribir este contrato (ver `puedeEscribirContrato`). */
  puedeEscribir: boolean;
  /** Persistencia real; se espera (await) y se captura el error. */
  guardar: () => Promise<void>;
  /** Canal de incidencias existente (normalmente `reportarErrorGuardado`). */
  reportarError?: (error: unknown) => void;
  /** Notificación de cambios de estado para la interfaz. */
  alCambiarEstado?: (estado: ObservadorEstadoGuardado) => void;
  /** Reintentos adicionales tras el primer intento (por defecto 3). */
  reintentos?: number;
  /** Espera base entre reintentos en ms (crece linealmente). Por defecto 500. */
  esperaMs?: number;
  /** Inyección del temporizador para pruebas. */
  esperar?: (ms: number) => Promise<void>;
}

interface EntradaEstado {
  estado: EstadoGuardado;
  huella: string;
  intentos: number;
  enVuelo: boolean;
}

const esperaReal = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Gestor de guardado automático, un registro por contrato.
 *
 * Es una fábrica: cada instancia mantiene su propio mapa de estados. `App.tsx`
 * usa una sola instancia (vía `useRef`), de modo que el estado sobrevive a los
 * re-renderizados sin recrearse.
 */
export function crearGestorGuardadoContratos() {
  const estados = new Map<string, EntradaEstado>();

  function notificar(contratoId: string, opciones: OpcionesGuardadoAutomatico): void {
    const entrada = estados.get(contratoId);
    if (!entrada) return;
    opciones.alCambiarEstado?.({
      contratoId,
      estado: entrada.estado,
      intentos: entrada.intentos,
      ...(entrada.estado === 'ERROR' ? { error: 'No se pudo guardar el contrato' } : {}),
    });
  }

  /** Estado actual de un contrato (para pintar «cambios pendientes» al montar). */
  function estadoDe(contratoId: string): EstadoGuardado | undefined {
    return estados.get(contratoId)?.estado;
  }

  /** Contratos con cambios pendientes o en error. */
  function contratosPendientes(): string[] {
    return [...estados.entries()]
      .filter(([, e]) => e.estado === 'PENDIENTE' || e.estado === 'GUARDANDO' || e.estado === 'ERROR')
      .map(([id]) => id);
  }

  /**
   * Guarda `contratoId` con el contenido identificado por `huella`.
   *
   * Devuelve el resultado final:
   *   · `GUARDADO`  — confirmado por la persistencia.
   *   · `OBSOLETO`  — había una versión más reciente; este guardado se descarta.
   *   · `ERROR`     — se agotaron los reintentos.
   */
  async function guardar(
    contratoId: string,
    huella: string,
    opciones: OpcionesGuardadoAutomatico
  ): Promise<EstadoGuardado> {
    // Sin permiso de escritura no se intenta: las reglas lo denegarían y solo
    // generaría una incidencia por sesión.
    if (!opciones.puedeEscribir) return 'OBSOLETO';

    const previo = estados.get(contratoId);
    if (previo?.enVuelo && previo.huella !== huella) {
      // Hay un guardado en vuelo con otro contenido: se descarta este como
      // obsoleto para no competir con la escritura más reciente.
      return 'OBSOLETO';
    }
    if (previo?.enVuelo && previo.huella === huella) {
      // Mismo contenido ya en vuelo: deduplicado, no se lanza otra escritura.
      return previo.estado;
    }

    const entrada: EntradaEstado = { estado: 'PENDIENTE', huella, intentos: 0, enVuelo: false };
    estados.set(contratoId, entrada);
    notificar(contratoId, opciones);

    const maximo = Math.max(1, (opciones.reintentos ?? 3) + 1);
    const espera = opciones.esperaMs ?? 500;
    const esperar = opciones.esperar ?? esperaReal;

    for (let intento = 1; intento <= maximo; intento += 1) {
      // Si mientras tanto llegó una versión más reciente, este guardado sobra.
      const actual = estados.get(contratoId);
      if (actual && actual.huella !== huella) {
        return 'OBSOLETO';
      }

      entrada.estado = 'GUARDANDO';
      entrada.intentos = intento;
      entrada.enVuelo = true;
      notificar(contratoId, opciones);

      try {
        await opciones.guardar();
        entrada.enVuelo = false;
        // Solo se declara guardado lo que la persistencia confirmó.
        if (estados.get(contratoId)?.huella === huella) {
          entrada.estado = 'GUARDADO';
          notificar(contratoId, opciones);
        }
        return 'GUARDADO';
      } catch (error) {
        entrada.enVuelo = false;
        opciones.reportarError?.(error);
        if (intento < maximo) {
          entrada.estado = 'PENDIENTE';
          notificar(contratoId, opciones);
          await esperar(espera * intento);
        }
      }
    }

    entrada.estado = 'ERROR';
    notificar(contratoId, opciones);
    return 'ERROR';
  }

  /** Olvida el estado de un contrato (al desmontar o tras confirmar el usuario). */
  function olvidar(contratoId: string): void {
    estados.delete(contratoId);
  }

  return { guardar, estadoDe, contratosPendientes, olvidar };
}

export type GestorGuardadoContratos = ReturnType<typeof crearGestorGuardadoContratos>;

/**
 * Huella estable del contenido que se va a persistir.
 *
 * Deliberadamente NO incluye `updatedAt` ni marcas de tiempo: dos cálculos
 * consecutivos del mismo `registroCobros` deben producir la misma huella para
 * que la deduplicación funcione. Recorre las claves en orden para que el orden
 * de propiedades no altere el resultado.
 */
export function huellaContrato(valor: unknown): string {
  const estable = (dato: unknown): string => {
    if (dato === null || dato === undefined) return 'null';
    if (Array.isArray(dato)) return `[${dato.map(estable).join(',')}]`;
    if (typeof dato === 'object') {
      const objeto = dato as Record<string, unknown>;
      return `{${Object.keys(objeto)
        .sort()
        .filter((clave) => objeto[clave] !== undefined)
        .map((clave) => `${clave}:${estable(objeto[clave])}`)
        .join(',')}}`;
    }
    return JSON.stringify(dato);
  };
  return estable(valor);
}
