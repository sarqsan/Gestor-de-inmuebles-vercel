/**
 * BLOQUE 10 · UX-2 — HOOK DE ESTADO DE LECTURAS.
 *
 * Mantiene, para las lecturas que el host tiene activas, un estado explícito
 * `CARGANDO | LISTO | ERROR` (UX-2 §5/§6) sin crear una segunda fuente de verdad:
 * los **datos** siguen viviendo en los estados que ya existían; aquí sólo se
 * deriva el estado de la *lectura*, a partir de las MISMAS suscripciones.
 *
 * - `iniciarLecturas()` marca como pendientes los orígenes activos (al (re)suscribir).
 * - `marcarListo(origen)` lo llama el host en el callback de cada suscripción.
 * - El canal de incidencias marca `ERROR` cuando una lectura falla **sin haber
 *   llegado a `LISTO`** (si ya había datos, se conservan y el aviso lo informa).
 * - `reintentar()` limpia el error, vuelve a `CARGANDO` y devuelve un contador que
 *   el host usa como dependencia para **volver a leer de verdad** (nuevas
 *   suscripciones; nunca recarga de página).
 * - `reintentarCapacidad(origen)` es el reintento dirigido de una CAPACIDAD
 *   ADICIONAL (hoy `gestiones_cartera` = carteras/delegaciones): limpia SÓLO su
 *   aviso y devuelve su propio contador, sin tocar el estado de las lecturas
 *   primarias ni re-suscribirlas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { SectionType } from '../types';
import {
  calcularEstadoDatosPantalla,
  descartarIncidencia as descartarIncidenciaCanal,
  descartarIncidencias as descartarIncidenciasCanal,
  incidenciasDatos,
  limpiarIncidenciasDe,
  origenesDePantalla,
  sembrarEstados,
  suscribirIncidenciasDatos,
} from './canalIncidencias';
import type {
  EstadoDatosPantalla,
  EstadoLectura,
  IncidenciaDatos,
  MapaEstadosLectura,
  OrigenDatos,
} from './canalIncidencias';

export interface EstadoLecturas {
  /** Contador de reintentos: añádelo a las dependencias del efecto de suscripciones. */
  readonly intento: number;
  estadoDe: (origen: OrigenDatos) => EstadoLectura;
  estadoDePantalla: (section: SectionType) => EstadoDatosPantalla;
  /** Callback de suscripción con datos → la lectura terminó bien. */
  marcarListo: (origen: OrigenDatos) => void;
  /** Al (re)crear las suscripciones: todo vuelve a estar pendiente. */
  iniciarLecturas: () => void;
  /** Reintento real: limpia errores, vuelve a CARGANDO y fuerza una nueva lectura. */
  reintentar: () => void;
  /**
   * Reintento DIRIGIDO de una capacidad adicional: limpia SÓLO su aviso y devuelve
   * un contador propio (`intentoDeCapacidad`) para reabrir SÓLO su lectura. No
   * reinicia el estado de las lecturas primarias ni las re-suscribe.
   */
  reintentarCapacidad: (origen: OrigenDatos) => void;
  /** Contador de reintentos de una capacidad adicional (dependencia de su efecto). */
  intentoDeCapacidad: (origen: OrigenDatos) => number;
  readonly incidencias: readonly IncidenciaDatos[];
  descartarIncidencia: (id: string) => void;
  descartarIncidencias: () => void;
}

export function useEstadoLecturas(origenesActivos: readonly OrigenDatos[]): EstadoLecturas {
  const claveActivos = useMemo(() => [...origenesActivos].sort().join('|'), [origenesActivos]);

  const [estados, setEstados] = useState<MapaEstadosLectura>(() => sembrarEstados(origenesActivos));
  const [intento, setIntento] = useState(0);
  // Reintento propio de cada capacidad adicional (no comparte contador con los datos
  // primarios: reintentar Carteras no re-suscribe todo el Portal, y al revés).
  const [intentosCapacidad, setIntentosCapacidad] = useState<Record<string, number>>({});
  const [incidencias, setIncidencias] = useState<readonly IncidenciaDatos[]>(() => incidenciasDatos());

  // Incidencias ya aplicadas al mapa de estados (evita reprocesar en cada notificación).
  const aplicadasRef = useRef<Set<string>>(new Set());

  // Cambio de perfil/ámbito: los orígenes activos se re-siembran como pendientes.
  useEffect(() => {
    setEstados(sembrarEstados(origenesActivos));
    aplicadasRef.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActivos]);

  useEffect(
    () =>
      suscribirIncidenciasDatos(() => {
        const actuales = incidenciasDatos();
        setIncidencias(actuales);
        for (const incidencia of actuales) {
          if (incidencia.tipo !== 'LECTURA') continue;
          // Una capacidad adicional nunca cambia el estado de pantalla: su fallo se
          // avisa aparte y no puede presentarse como error de carga de los datos.
          if (incidencia.alcance === 'CAPACIDAD') continue;
          if (aplicadasRef.current.has(incidencia.id)) continue;
          aplicadasRef.current.add(incidencia.id);
          setEstados((prev) => {
            // Un origen no declarado no se rastrea; y si ya había datos (`LISTO`),
            // se conservan: el aviso informa del fallo pero no se oculta la pantalla.
            if (prev[incidencia.origen] === undefined) return prev;
            if (prev[incidencia.origen] === 'LISTO') return prev;
            return { ...prev, [incidencia.origen]: 'ERROR' };
          });
        }
      }),
    []
  );

  const marcarListo = useCallback((origen: OrigenDatos) => {
    setEstados((prev) => {
      const actual = prev[origen];
      if (actual === undefined || actual === 'LISTO') return prev;
      return { ...prev, [origen]: 'LISTO' };
    });
  }, []);

  const iniciarLecturas = useCallback(() => {
    setEstados(sembrarEstados(origenesActivos));
    aplicadasRef.current = new Set();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActivos]);

  const reintentar = useCallback(() => {
    // Sólo se limpian los fallos de LECTURA: los de guardado siguen vigentes.
    limpiarIncidenciasDe(origenesActivos, 'LECTURA');
    setEstados(sembrarEstados(origenesActivos));
    aplicadasRef.current = new Set();
    setIntento((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveActivos]);

  const estadoDe = useCallback(
    (origen: OrigenDatos): EstadoLectura => estados[origen] ?? 'LISTO',
    [estados]
  );

  const estadoDePantalla = useCallback(
    (section: SectionType): EstadoDatosPantalla =>
      calcularEstadoDatosPantalla(origenesDePantalla(section), estados),
    [estados]
  );

  const descartarIncidencia = useCallback((id: string) => descartarIncidenciaCanal(id), []);
  const descartarIncidencias = useCallback(() => descartarIncidenciasCanal(), []);

  const intentoDeCapacidad = useCallback(
    (origen: OrigenDatos): number => intentosCapacidad[origen] ?? 0,
    [intentosCapacidad]
  );

  const reintentarCapacidad = useCallback((origen: OrigenDatos) => {
    // Su aviso anterior se sustituye por el resultado de este intento; los avisos
    // de los datos primarios y de las demás capacidades no se tocan.
    limpiarIncidenciasDe(origen, 'LECTURA');
    setIntentosCapacidad((prev) => ({ ...prev, [origen]: (prev[origen] ?? 0) + 1 }));
  }, []);

  return {
    intento,
    estadoDe,
    estadoDePantalla,
    marcarListo,
    iniciarLecturas,
    reintentar,
    reintentarCapacidad,
    intentoDeCapacidad,
    incidencias,
    descartarIncidencia,
    descartarIncidencias,
  };
}
