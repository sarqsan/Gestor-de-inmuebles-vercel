import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EstadoSindicacionPortal,
  FormatoFeedPublicacion,
  HabitacionInmueble,
  Inmueble,
  PortalInmobiliario,
  PublicacionInmueble,
  RegistroTrazabilidadPublicacion,
  UsuarioApp,
} from '../types';
import {
  buildPublicacionInmueble,
  estadoSindicacionInicial,
  identidadPublicacionPortal,
  registrarTrazabilidadPublicacion,
  validarPublicacion,
} from '../utils/publicacionEngine';
import { ADAPTADORES_PORTAL, FORMATOS_EXPORTACION, PORTALES_DISPONIBLES, generarExportacion, obtenerAdaptadorPortal } from '../utils/publicacionPortales';
import { subscribeHabitacionesInmueble } from '../lib/firebase';
import { crearRepositorioEstadoSindicacionFirestore } from '../lib/sindicacionFirestore';
import {
  crearEstadoInicialSindicacion,
  leerEstadosSindicacion,
  registrarValidacionSindicacion,
  resumenDelEstado,
  resolverAccionSindicacion,
  type InstantaneaPublicada,
  type PuertoEstadoSindicacion,
  type RegistroEstadoSindicacion,
  type ResultadoOperacionPersistida,
} from '../sindicacion';
import { Megaphone, Download, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

/**
 * GAP 5 — Panel de sindicación/publicación.
 * Exportación manual: valida, genera el feed en el formato elegido, lo muestra y lo descarga.
 * No automatiza la publicación en portales que requieren credenciales/acceso externo.
 *
 * FASE 2B — el estado por (inmueble, portal) deja de ser local: la fuente de verdad es
 * el repositorio de la Fase 2 (`crearRepositorioEstadoSindicacionFirestore` →
 * `sindicacion_inmuebles/{externalId}`), con hidratación al montar y listener vivo que
 * actualiza el panel cuando Firestore cambia. El `useState` del componente es sólo una
 * PROYECCIÓN de ese estado; no decide transiciones ni inventa estados: lo que se ve es
 * lo que el dominio persistió y trazó (`audit_logs`).
 *
 * El cableado del circuito vive en `crearCircuitoSindicacionPanel` (exportado): el
 * componente lo consume tal cual, así que el mismo código que ve el usuario es el que
 * prueban los tests — sin una segunda implementación de persistencia dentro del
 * componente y sin importar Firebase aquí (toda la E/S está en el adaptador).
 */

// ===========================================================================
// CIRCUITO PANEL ↔ REPOSITORIO (exportado para poder probarlo sin DOM)
// ===========================================================================

/** Fila del panel: el registro persistido, o la proyección derivada si aún no hay documento. */
export interface FilaEstadoSindicacionPanel extends RegistroEstadoSindicacion {
  origen: 'repositorio' | 'deriva';
}

export interface InfoHidratacionSindicacion {
  persistidos: number;
  derivados: number;
  creados: PortalInmobiliario[];
  preexistentes: PortalInmobiliario[];
  /** true ⇒ la lectura/escritura contra `sindicacion_inmuebles` funcionó. */
  persistido: boolean;
  /** Motivo legible cuando `persistido` es false (nunca se rompe el panel por esto). */
  aviso: string | null;
}

export interface ParamsCircuitoSindicacion {
  inmuebleId: string;
  portales: PortalInmobiliario[];
  /** Getter: el payload puede cambiar (las habitaciones llegan por listener). */
  publicacion: () => PublicacionInmueble | null;
  actor?: { id?: string; nombre?: string; email?: string } | null;
  /**
   * Propietario en cuyo nombre se lee (ver `OpcionesRepositorioSindicacion`): es lo que
   * hace legal el `list` en `firestore.rules` §38. Se usa SOLO para el alcance de
   * lectura; el `propietarioId` del documento sale del inmueble (`publicacion.propietarioId`).
   */
  propietarioIdAlcance?: string;
  /** El dominio no tiene reloj: la marca de tiempo la aporta quien persiste. */
  fecha: () => string;
  onEstados: (filas: FilaEstadoSindicacionPanel[], info: InfoHidratacionSindicacion) => void;
  /** Permite inyectar otro puerto (tests); en la app se construye el de Firestore. */
  puerto?: PuertoEstadoSindicacion;
}

export interface CircuitoSindicacionPanel {
  readonly puerto: PuertoEstadoSindicacion;
  inicializar(): Promise<InfoHidratacionSindicacion>;
  /** Persiste el resultado REAL de «validar + generar feed» (hubo o no hubo feed). */
  registrarValidacion(args: { portal: PortalInmobiliario; ok: boolean; codigo?: string; mensaje?: string }): Promise<ResultadoOperacionPersistida | null>;
  /** Cierra el listener y bloquea cualquier emisión posterior. Idempotente. */
  disposar(): void;
}

const mensajeDe = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'error desconocido';

/**
 * Instantánea publicada a partir del registro persistido (lo que la Fase 1 necesita para
 * decidir). IMPORTA QUÉ SE CONSIDERA "precedente": sólo hay precedente si hay huella o
 * versión publicada. Un documento en `BORRADOR`/`VALIDADO` (inicializado, nunca enviado)
 * se reporta SIN precedente ⇒ la primera validación correcta decide `NUEVO`, no
 * `ACTUALIZAR`. Omitir `externalId` en ese caso es deliberado: el id existe, el anuncio
 * en el portal no.
 */
function instantaneaDesde(registro: RegistroEstadoSindicacion): InstantaneaPublicada {
  const publicado = Boolean(registro.hashContenido) || (typeof registro.version === 'number' && registro.version > 0);
  const retirado = registro.estado === 'DESPUBLICADO';
  if (!publicado) return { retirado };
  return {
    externalId: registro.externalId,
    ...(registro.hashContenido
      ? { version: { hashContenido: registro.hashContenido, numero: typeof registro.version === 'number' ? registro.version : 1 } }
      : {}),
    retirado,
  };
}

/** Mezcla lo persistido con los portales sin documento (proyección derivada, claramente marcada). */
function mezclarEstadosSindicacion(
  persistidos: RegistroEstadoSindicacion[],
  inmuebleId: string,
  portales: PortalInmobiliario[],
): FilaEstadoSindicacionPanel[] {
  const porPortal = new Map<PortalInmobiliario, RegistroEstadoSindicacion>();
  for (const r of persistidos) if (r && r.inmuebleId === inmuebleId) porPortal.set(r.portal, r);
  return portales.map<FilaEstadoSindicacionPanel>((portal) => {
    const r = porPortal.get(portal);
    if (r) return { ...r, origen: 'repositorio' };
    const derivado: EstadoSindicacionPortal = estadoSindicacionInicial(inmuebleId, [portal])[0];
    return {
      ...(derivado as RegistroEstadoSindicacion),
      id: derivado.externalId,
      clave: `${portal}:${inmuebleId}`,
      inmuebleId,
      operacionesRegistradas: 0,
      creadoEn: '',
      actualizadoEn: '',
      esquema: 1,
      origen: 'deriva',
    };
  });
}

/** Filas de arranque (antes de leer el repositorio): proyección derivada, no un estado inventado. */
export function filasDerivadasSindicacion(inmuebleId: string, portales: PortalInmobiliario[]): FilaEstadoSindicacionPanel[] {
  return mezclarEstadosSindicacion([], inmuebleId, portales);
}

export function crearCircuitoSindicacionPanel(params: ParamsCircuitoSindicacion): CircuitoSindicacionPanel {
  const { inmuebleId, portales, actor } = params;
  const puerto = params.puerto || crearRepositorioEstadoSindicacionFirestore({
    ...(actor ? { actor } : {}),
    ...(params.propietarioIdAlcance ? { propietarioId: params.propietarioIdAlcance } : {}),
  });

  let cerrado = false;
  let desuscribir: (() => void) | null = null;
  let info: InfoHidratacionSindicacion = {
    persistidos: 0,
    derivados: portales.length,
    creados: [],
    preexistentes: [],
    persistido: false,
    aviso: 'El estado de sindicación todavía no se ha leído del repositorio.',
  };
  let filaActual: FilaEstadoSindicacionPanel[] = mezclarEstadosSindicacion([], inmuebleId, portales);

  const emitir = () => {
    if (cerrado) return;
    params.onEstados(filaActual, { ...info });
  };

  const hidratar = async (): Promise<RegistroEstadoSindicacion[]> => {
    const lectura = await leerEstadosSindicacion(inmuebleId, { puerto, fecha: params.fecha(), ...(actor ? { actor } : {}) });
    return lectura.estados;
  };

  const pintar = (persistidos: RegistroEstadoSindicacion[]) => {
    filaActual = mezclarEstadosSindicacion(persistidos, inmuebleId, portales);
    info = {
      ...info,
      persistidos: persistidos.length,
      derivados: Math.max(0, portales.length - persistidos.filter((r) => r.inmuebleId === inmuebleId).length),
    };
    emitir();
  };

  const inicializar = async (): Promise<InfoHidratacionSindicacion> => {
    if (cerrado) return info;
    const ctx = { puerto, fecha: params.fecha(), ...(actor ? { actor } : {}) };
    const publicacion = params.publicacion();
    let aviso: string | null = null;
    let creados: PortalInmobiliario[] = [];
    let preexistentes: PortalInmobiliario[] = [];
    // 1) estado inicial idempotente (si ya hay documento por portal, no lo pisa)
    try {
      const ini = await crearEstadoInicialSindicacion(
        {
          inmuebleId,
          portales,
          ...(publicacion ? { publicacion } : {}),
          ...(publicacion?.propietarioId ? { propietarioId: publicacion.propietarioId } : {}),
        },
        ctx,
      );
      creados = ini.creados;
      preexistentes = ini.preexistentes;
    } catch (e) {
      aviso = `No se pudo inicializar el estado persistido: ${mensajeDe(e)}`;
    }
    if (cerrado) return info;
    // 2) hidratación desde el repositorio
    let persistidos: RegistroEstadoSindicacion[] = [];
    try {
      persistidos = await hidratar();
      if (!aviso) aviso = persistidos.length === 0 && creados.length === 0
        ? 'Sin estado persistido para este inmueble: la escritura puede no estar autorizada para esta sesión.'
        : null;
    } catch (e) {
      // se conserva el PRIMER fallo: es el motivo raíz (si la escritura ya fue denegada,
      // la lectura fallará por lo mismo y no aporta nada pisar el mensaje)
      const motivo = `No se pudo leer el estado persistido: ${mensajeDe(e)}`;
      aviso = aviso || motivo;
    }
    if (cerrado) return info;
    info = {
      persistidos: persistidos.length,
      derivados: Math.max(0, portales.length - persistidos.length),
      creados,
      preexistentes,
      persistido: !aviso,
      aviso,
    };
    filaActual = mezclarEstadosSindicacion(persistidos, inmuebleId, portales);
    emitir();
    // 3) suscripción: el panel se actualiza solo cuando cambia Firestore
    if (!cerrado && typeof puerto.suscribirEstados === 'function' && !desuscribir) {
      try {
        const unsub = puerto.suscribirEstados(inmuebleId, (filas) => {
          if (cerrado) return;
          pintar(Array.isArray(filas) ? filas : []);
        });
        if (cerrado) {
          // se desmontó mientras se abrían: nada de listeners huérfanos
          try { unsub && unsub(); } catch { /* ignora */ }
        } else {
          desuscribir = () => { try { unsub && unsub(); } catch { /* ignora */ } };
        }
      } catch (e) {
        info = { ...info, aviso: `Sin escucha de cambios: ${mensajeDe(e)}` };
        emitir();
      }
    }
    return { ...info };
  };

  const registrarValidacion = async (args: {
    portal: PortalInmobiliario;
    ok: boolean;
    codigo?: string;
    mensaje?: string;
  }): Promise<ResultadoOperacionPersistida | null> => {
    if (cerrado) return null;
    const publicacion = params.publicacion();
    if (!publicacion) return null;
    let previo: RegistroEstadoSindicacion | null = null;
    try {
      previo = await puerto.leerEstado(inmuebleId, args.portal);
    } catch {
      // sin lectura no hay precedente: se decide como si no estuviera publicado
      previo = null;
    }
    if (cerrado) return null;
    // La acción la decide la Fase 1 contra lo QUE YA ESTÁ PUBLICADO (nunca contra la
    // memoria del panel): aquí no hay ningún if sobre el portal ni sobre el contenido.
    const decision = resolverAccionSindicacion({
      publicacion,
      portal: args.portal,
      ...(previo ? { publicada: instantaneaDesde(previo) } : {}),
    });
    let r: ResultadoOperacionPersistida;
    try {
      r = await registrarValidacionSindicacion(
        {
          decision,
          publicacion,
          resultado: { ok: args.ok, ...(args.codigo ? { codigo: args.codigo } : {}), ...(args.mensaje ? { mensaje: args.mensaje } : {}) },
        },
        { puerto, fecha: params.fecha(), ...(actor ? { actor } : {}) },
      );
    } catch (e) {
      // La E/S puede estar denegada (sesión sin permisos, sin espejo de identidad, regla
      // sin desplegar). El panel NO revienta: el feed generado es válido igualmente y se
      // puede descargar; lo que no hay es estado persistido, y eso se dice.
      info = { ...info, persistido: false, aviso: `El estado no se pudo guardar: ${mensajeDe(e)}` };
      emitir();
      return null;
    }
    if (r.escritura === 'CREADO' || r.escritura === 'ACTUALIZADO') {
      // el listener puede ir unos milisegundos por detrás: se pinta ya el resultado
      // persistido (es el registro real, no una transición imaginada).
      const resto = filaActual.filter((f) => f.portal !== args.portal && f.origen === 'repositorio');
      filaActual = mezclarEstadosSindicacion([...resto, r.registro], inmuebleId, portales);
      emitir();
    }
    return r;
  };

  const disposar = () => {
    if (cerrado) return;
    cerrado = true;
    const unsub = desuscribir;
    desuscribir = null;
    if (unsub) unsub();
  };

  return { puerto, inicializar, registrarValidacion, disposar };
}

// ===========================================================================
// COMPONENTE
// ===========================================================================

interface PublicacionInmueblesPanelProps {
  inmueble?: Inmueble | null;
  currentUser?: UsuarioApp | null;
}

export const PublicacionInmueblesPanel: React.FC<PublicacionInmueblesPanelProps> = ({ inmueble, currentUser }) => {
  const [abierto, setAbierto] = useState(false);
  const [habitaciones, setHabitaciones] = useState<HabitacionInmueble[]>([]);
  const [formato, setFormato] = useState<FormatoFeedPublicacion>('XML_KYLERO');
  const [portalSel, setPortalSel] = useState<PortalInmobiliario>('KYERO');
  const [resultado, setResultado] = useState<string | null>(null);
  const [errorGen, setErrorGen] = useState<string | null>(null);
  const [trazabilidad, setTrazabilidad] = useState<RegistroTrazabilidadPublicacion[]>([]);
  // PROYECCIÓN del repositorio (antes `useState<EstadoSindicacionPortal[]>` era la fuente
  // de verdad; ahora sólo refleja lo persistido en `sindicacion_inmuebles`).
  const [filas, setFilas] = useState<FilaEstadoSindicacionPanel[]>(() => filasDerivadasSindicacion(inmueble?.id || '', PORTALES_DISPONIBLES));
  const [info, setInfo] = useState<InfoHidratacionSindicacion | null>(null);
  const [ultimoResumen, setUltimoResumen] = useState<string | null>(null);
  const circuitoRef = useRef<CircuitoSindicacionPanel | null>(null);

  useEffect(() => {
    if (!inmueble || inmueble.modalidadAlquiler !== 'habitaciones') {
      setHabitaciones([]);
      return;
    }
    const unsub = subscribeHabitacionesInmueble(inmueble.id, setHabitaciones);
    return () => unsub && unsub();
  }, [inmueble?.id, inmueble?.modalidadAlquiler]);

  const publicacion = useMemo(
    () => (inmueble ? buildPublicacionInmueble(inmueble, habitaciones) : null),
    [inmueble, habitaciones]
  );
  const validacion = useMemo(() => (publicacion ? validarPublicacion(publicacion) : null), [publicacion]);
  // El circuito necesita leer el payload MÁS NUEVO sin recrearse (las habitaciones
  // llegan por su propio listener): por eso se pasa un getter respaldado por un ref.
  const publicacionRef = useRef<PublicacionInmueble | null>(publicacion);
  publicacionRef.current = publicacion;

  useEffect(() => {
    setResultado(null);
    setErrorGen(null);
    if (!inmueble) {
      setFilas([]);
      setInfo(null);
      return;
    }
    setUltimoResumen(null);
    const esPropietario = currentUser?.tipoPerfil === 'PROPIETARIO' && currentUser.propietarioId;
    const circuito = crearCircuitoSindicacionPanel({
      inmuebleId: inmueble.id,
      portales: PORTALES_DISPONIBLES,
      publicacion: () => publicacionRef.current,
      actor: currentUser ? { id: currentUser.id, nombre: currentUser.nombre, email: currentUser.email } : null,
      ...(esPropietario ? { propietarioIdAlcance: currentUser?.propietarioId } : {}),
      fecha: () => new Date().toISOString(),
      onEstados: (nuevas, nuevaInfo) => {
        setFilas(nuevas);
        setInfo(nuevaInfo);
      },
    });
    circuitoRef.current = circuito;
    void circuito.inicializar();
    // DESMONTAJE: se cierra el listener. No queda ninguna escucha viva por inmueble.
    return () => {
      circuitoRef.current = null;
      circuito.disposar();
    };
  }, [inmueble?.id, currentUser?.id]);

  if (!inmueble) return null;
  const generar = async () => {
    if (!publicacion || !validacion) return;
    const res = generarExportacion([publicacion], formato, portalSel);
    const traza = registrarTrazabilidadPublicacion(
      publicacion,
      portalSel,
      formato,
      validacion,
      res.ok ? identidadPublicacionPortal(publicacion.inmuebleId, portalSel).externalId : undefined
    );
    setTrazabilidad((prev) => [traza, ...prev].slice(0, 20));
    // Lo que se persiste es el resultado REAL de esta operación (feed generado o no).
    // El panel no decide estados: los pide al repositorio y el listener los refresca.
    // `validar` es un hito local: no estampa versión publicada (nunca se llamó al portal).
    const persistido = await circuitoRef.current?.registrarValidacion({
      portal: portalSel,
      ok: res.ok,
      ...(res.ok ? {} : { codigo: 'FEED_NO_GENERADO', mensaje: res.motivo || 'Error generando el feed.' }),
    });
    if (!res.ok) {
      setErrorGen(res.motivo || 'Error generando el feed.');
      setResultado(null);
      return;
    }
    setErrorGen(null);
    setResultado(res.contenido || '');
    if (persistido) {
      // `resumenDelEstado` es el resumen determinista del dominio: el mismo texto que
      // vería cualquier otro consumidor del registro, no un mensaje local del panel.
      setUltimoResumen(`${persistido.resumen} · ${resumenDelEstado(persistido.registro)}`);
      if (persistido.escritura === 'RECHAZADO') setErrorGen(`El estado no se guardó: ${persistido.motivo}`);
    }
  };

  const descargar = () => {
    if (!resultado) return;
    const ext = formato.startsWith('XML') ? 'xml' : formato === 'JSON_LD' ? 'jsonld' : 'json';
    const mime = formato.startsWith('XML') ? 'application/xml' : formato === 'JSON_LD' ? 'application/ld+json' : 'application/json';
    const blob = new Blob([resultado], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feed_${inmueble.id}_${formato.toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100">
            <Megaphone className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-900">Sindicación y Publicación Multicanal</h3>
            <p className="text-[11px] text-slate-500">Valida y exporta el anuncio (Kyero XML, JSON, JSON-LD) sin publicar automáticamente.</p>
          </div>
        </div>
        <span className="text-xs font-bold text-slate-400">{abierto ? 'Cerrar' : 'Abrir'}</span>
      </button>

      {abierto && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
          {/* VALIDACIÓN */}
          {validacion && (
            <div className="space-y-1.5">
              {validacion.erroresBloqueantes.map((e, i) => (
                <div key={`e${i}`} className="flex items-start gap-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}
                </div>
              ))}
              {validacion.advertencias.map((w, i) => (
                <div key={`w${i}`} className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                </div>
              ))}
              {validacion.valido && validacion.advertencias.length === 0 && (
                <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Datos completos y válidos para publicación.
                </div>
              )}
            </div>
          )}

          {/* SELECTORES */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={portalSel} onChange={(e) => setPortalSel(e.target.value as PortalInmobiliario)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
              {PORTALES_DISPONIBLES.map((p) => (
                <option key={p} value={p}>{p} {obtenerAdaptadorPortal(p)?.modo === 'PENDIENTE_ACCESO_OPERADOR' ? '(preparado)' : '(feed)'}</option>
              ))}
            </select>
            <select value={formato} onChange={(e) => setFormato(e.target.value as FormatoFeedPublicacion)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
              {FORMATOS_EXPORTACION.map((f) => (
                <option key={f.formato} value={f.formato}>{f.etiqueta}</option>
              ))}
            </select>
            <button
              onClick={generar}
              disabled={!validacion?.valido}
              className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold"
            >
              Validar y generar feed
            </button>
            {resultado && (
              <button onClick={descargar} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            )}
          </div>

          {errorGen && <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{errorGen}</div>}

          {/* ADAPTADOR: requisitos del portal elegido */}
          {(() => {
            const ad = obtenerAdaptadorPortal(portalSel);
            if (!ad) return null;
            return (
              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-1">
                <p><strong>{ad.nombre}</strong> · {ad.modo === 'FEED_XML_GENERABLE' ? 'Feed generable' : 'Pendiente de acceso del operador'}</p>
                <p>{ad.mecanismo}</p>
                {ad.requisitos.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {ad.requisitos.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* RESULTADO */}
          {resultado && (
            <pre className="text-[10px] leading-relaxed bg-slate-900 text-emerald-200 rounded-xl p-4 overflow-auto max-h-72 whitespace-pre-wrap">{resultado.slice(0, 8000)}{resultado.length > 8000 ? '\n… (descarga el archivo completo)' : ''}</pre>
          )}

          {/* ESTADOS POR PORTAL (independientes del estado interno del inmueble) */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estado de publicación por portal</h4>
              {info && !info.persistido && (
                <span className="text-[9px] font-semibold text-amber-700" title={info.aviso || ''}>sin persistir</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filas.map((e) => (
                <div key={e.portal} className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700">{e.portal}</span>
                    <span className="block text-[9px] text-slate-400">
                      ext: {e.externalId}
                      {e.origen === 'repositorio'
                        ? ` · ${e.version !== undefined ? `v${e.version}` : 'sin versión'} · ${e.ultimaOperacion || '—'}=${e.ultimoResultado || '—'}${e.operacionesRegistradas ? ` · ${e.operacionesRegistradas} op` : ''}`
                        : ' · sin registrar'}
                    </span>
                    {e.ultimoError ? (
                      <span className="block text-[9px] text-rose-600">{e.ultimoError}</span>
                    ) : null}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    e.estado === 'ERROR' ? 'bg-rose-100 text-rose-700'
                    : e.estado === 'PUBLICADO' || e.estado === 'ACTUALIZADO' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'
                  }`}>{e.estado}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TRAZABILIDAD */}
          {trazabilidad.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Trazabilidad (sesión actual)</h4>
              <div className="space-y-1">
                {trazabilidad.map((t, i) => (
                  <div key={i} className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                    {new Date(t.fecha).toLocaleString('es-ES')} · {t.portal} · {t.formato} · {t.resultado}
                    {t.externalId ? ` · ${t.externalId}` : ''}
                    {t.errores.length > 0 ? ` · errores: ${t.errores.join('; ')}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {ultimoResumen && (
            <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              Estado persistido: {ultimoResumen}
            </p>
          )}

          {currentUser && (
            <p className="text-[10px] text-slate-400">
              Identidad estable por inmueble + portal: actualizar el anuncio regenera el contenido sin duplicarlo. La publicación real en portales con acceso restringido se realiza fuera del ERP.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
