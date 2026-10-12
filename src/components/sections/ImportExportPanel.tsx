/**
 * Panel de Importación / Exportación canónicas (`erp-import-export-v1`).
 *
 * Montado en Configuración (ubicación coherente, FASE 3 §H). No sustituye el
 * bloque legacy de sincronización (se conserva intacto).
 *
 * Flujo importar (PASO 1–7): archivo → formato → entidad → analizar (dry-run
 * puro, 0 escrituras) → resumen → problemas → promoción solo de autorizados
 * con decisiones humanas y barrera O7. Nunca upload → escritura automática.
 * Flujo exportar: entidad/ámbito/formato → previsualización → descarga.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import type { Inmueble, UsuarioApp } from '../../types';
import type { GestionCartera } from '../../lib/gestionesCartera';
import { sha256Hex } from '../../lib/importacion/hash';
import { auth, type DataAccessScope } from '../../lib/firebase';
import { getUsuarioByAuthUid } from '../../lib/authService';
import { listarGestionesDeGestor } from '../../lib/gestionesCarteraServicio';
import { dependenciasGestionesCarteraFirestore } from '../../lib/gestionesCarteraServicioFirebase';
import { propietariosGestionadosDe, proyectarCarterasGestionadas } from '../../lib/carterasGestion';
import type { ModalidadUsoB4 } from '../../lib/migracion/tipos';
import {
  ACEPTAR_IMPORTACION,
  validarNombreFicheroImportacion,
  FUENTE_EXTERNA_SIN_VERSION,
  SOPORTE_ENTIDADES,
  analizarEstructuraJson,
  detectarFormatoEntrada,
  ejecutarExportacion,
  ejecutarImportDryRun,
  extraerMarcaExportPropio,
  motivoJsonSinRegistros,
  parseCsv,
  parseJson,
  parseXlsx,
  soporteDe,
  type AmbitoExportacionSolicitado,
  type DecisionPromocion,
  type FormatoEntrada,
  type ImportRun,
  type ResultadoPromocion,
} from '../../lib/importExport';
import {
  autorizarImportRun,
  derivarTokenEjecucion,
  seleccionarAutorizables,
  verificarBarrera,
} from '../../lib/importExport/promocion';
import { ejecutarPromocion, planificarPromocion } from '../../lib/importExport/ejecucion';
import type { ResolucionTitularImport } from '../../lib/importExport/titularidadImportacion';
import {
  ambitoAutorizadoDesdeUsuario,
  cargarFuentesCatalogo,
  catalogosDesdeFuentes,
  crearPuertoFirebase,
  type FuentesCatalogo,
} from '../../lib/importExportFirebase';
import { mensajeDeErrorUsuario } from '../../feedback/mensajes';

interface Props {
  inmuebles: Inmueble[];
  usuario?: UsuarioApp | null;
  gestiones?: GestionCartera[];
  scope?: DataAccessScope;
  /**
   * Fichero entregado por OTRO botón de la aplicación (el importador legacy de
   * Configuración). Permite que ese mismo botón procese JSON/XLSX/CSV por el
   * pipeline canónico en vez de rechazarlos por su estructura.
   */
  ficheroExterno?: { nombre: string; bytes: Uint8Array } | null;
  onFicheroExternoConsumido?: () => void;
}

const ENTIDADES = ['AUTO', 'GASTO', 'COBRO', 'INMUEBLE', 'PROPIETARIO', 'CONTRATO', 'DOCUMENTO'] as const;

function descargar(nombre: string, contenido: string, mime: string): void {
  const blob = new Blob([contenido], { type: mime });
  descargarBlob(nombre, blob);
}

/** Descarga un archivo binario (libro .xlsx generado en memoria). */
function descargarBytes(nombre: string, bytes: Uint8Array, mime: string): void {
  const copia = bytes.slice();
  descargarBlob(nombre, new Blob([copia.buffer], { type: mime }));
}

function descargarBlob(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export const ImportExportPanel: React.FC<Props> = ({ inmuebles, usuario = null, gestiones = [], scope, ficheroExterno = null, onFicheroExternoConsumido }) => {
  const [pestana, setPestana] = useState<'importar' | 'exportar'>('importar');
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- importar ----
  const [fichero, setFichero] = useState<{ nombre: string; bytes: Uint8Array; hash: string } | null>(null);
  const [formato, setFormato] = useState<FormatoEntrada | null>(null);
  const [entidad, setEntidad] = useState<string>('AUTO');
  const [run, setRun] = useState<ImportRun | null>(null);
  const [insumos, setInsumos] = useState<{
    crudos: Record<string, unknown>[];
    localizaciones: string[];
    entidadEfectiva: string;
    tipoFuente: 'ERP_EXPORT' | 'EXTERNAL';
    versionFuente: string;
    catalogos: Parameters<typeof ejecutarImportDryRun>[0]['catalogos'];
  } | null>(null);
  const [errorImport, setErrorImport] = useState<string | null>(null);
  /** Hoja del libro XLSX a leer (vacío = primera hoja, con aviso de cuáles hay). */
  const [hojaXlsx, setHojaXlsx] = useState('');
  /** Avisos del parser (BLOQUE 7: hojas del libro, filas ignoradas, tipos…). */
  const [avisosParseo, setAvisosParseo] = useState<string[]>([]);
  const [analizando, setAnalizando] = useState(false);
  const [decisiones, setDecisiones] = useState<Record<string, DecisionPromocion>>({});
  const [seleccion, setSeleccion] = useState<string[] | null>(null);
  const [autorizacion, setAutorizacion] = useState<ReturnType<typeof autorizarImportRun> | null>(null);
  const [promocionando, setPromocionando] = useState(false);
  const [resultadoPromo, setResultadoPromo] = useState<ResultadoPromocion | null>(null);
  const [verProblemas, setVerProblemas] = useState(false);
  /** Detalle de TODOS los registros del run (no sólo los promocionables). */
  const [verRegistros, setVerRegistros] = useState(false);
  /**
   * INCIDENCIA (cartera/titular destino): la persona elige EXPLÍCITAMENTE a qué
   * titular va la importación. Nunca se asigna «el titular principal del
   * perfil» por defecto ni se deduce de la columna de titularidad.
   */
  const [destinoTitular, setDestinoTitular] = useState('');
  /** Titulares que el ámbito del actor permite escribir (id + nombre). */
  const [titularesDisponibles, setTitularesDisponibles] = useState<{ id: string; nombre: string }[]>([]);

  // ---- exportar ----
  const [expEntidad, setExpEntidad] = useState('GASTO');
  const [expProps, setExpProps] = useState('');
  const [expInms, setExpInms] = useState('');
  const [expEjercicios, setExpEjercicios] = useState('');
  const [expFormato, setExpFormato] = useState<'JSON' | 'CSV' | 'XLSX'>('JSON');
  const [expError, setExpError] = useState<string | null>(null);
  const [expInfo, setExpInfo] = useState<string | null>(null);
  const [expGenerando, setExpGenerando] = useState(false);

  // ---- identidad/ámbito (auditoría 3ac21a5/D2) ----
  // El montaje en Configuración no pasa usuario/gestiones/scope y UserProfile
  // no los contiene: sin esto, el ámbito quedaba vacío (dry-run bloqueado,
  // promoción imposible, exportación vacía) y las lecturas sin scope colgaban
  // al denegar Rules (el suscriptor jamás responde). Si hay props, mandan;
  // si no, el panel carga su propio contexto y, sin identidad, se bloquea
  // honesto (fail-closed) en vez de colgar o acotar a ciegas.
  const [ctx, setCtx] = useState<{
    usuario: UsuarioApp | null;
    gestiones: GestionCartera[];
    scope: DataAccessScope | undefined;
    estado: 'props' | 'cargando' | 'listo' | 'error';
    error: string | null;
  }>({ usuario: null, gestiones: [], scope: undefined, estado: usuario ? 'props' : 'cargando', error: null });
  useEffect(() => {
    if (usuario) return; // identidad por props: sin carga
    let vivo = true;
    (async () => {
      try {
        const fb = auth.currentUser;
        if (!fb) throw new Error('sin sesión de Firebase: inicia sesión para acotar el ámbito');
        const u = await getUsuarioByAuthUid(fb.uid, fb.email ?? null);
        if (!u) throw new Error('sin ficha de usuario para esta sesión (uid sin UsuarioApp)');
        let gests: GestionCartera[] = [];
        try {
          const r = await listarGestionesDeGestor(dependenciasGestionesCarteraFirestore, u.id, 'ACTIVA');
          if (r.ok) gests = [...r.gestiones];
        } catch { /* sin gestiones legibles: se acota por espejo+ficha */ }
        if (!vivo) return;
        const proyectadas = proyectarCarterasGestionadas(gests, u.id);
        setCtx({
          usuario: u,
          gestiones: gests,
          scope: {
            tipoPerfil: u.tipoPerfil,
            ...(u.propietarioId ? { propietarioId: u.propietarioId } : {}),
            ...(u.inmuebleIds ? { inmuebleIds: u.inmuebleIds } : {}),
            propietariosGestionados: propietariosGestionadosDe(proyectadas),
          },
          estado: 'listo',
          error: null,
        });
      } catch (e) {
        if (!vivo) return;
        setCtx({ usuario: null, gestiones: [], scope: undefined, estado: 'error', error: mensajeDeErrorUsuario(e, 'No se ha podido completar la operación.') });
      }
    })();
    return () => { vivo = false; };
    // Solo re-carga si aparece/desaparece la prop usuario (montaje estable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  const usuarioEf = usuario ?? ctx.usuario;
  const gestionesEf = usuario ? gestiones : ctx.gestiones;
  const scopeEf = scope ?? ctx.scope;
  const identidadLista = usuarioEf !== null;
  const modalidad: ModalidadUsoB4 = usuarioEf?.tipoPerfil === 'PROPIETARIO'
    ? 'PROPIETARIO'
    : usuarioEf?.tipoPerfil === 'PROFESIONAL' ? 'GESTOR_PROFESIONAL' : 'GESTOR_PROPIETARIO';

  const ambito = useMemo(() => ambitoAutorizadoDesdeUsuario(usuarioEf, gestionesEf), [usuarioEf, gestionesEf]);
  const identidad = usuarioEf ? { usuarioId: usuarioEf.id, usuarioEmail: usuarioEf.email, usuarioNombre: usuarioEf.nombre } : null;

  // Fichero entregado por el botón legacy de Configuración: se procesa por el
  // MISMO camino que el selector (no hay una segunda importación paralela).
  useEffect(() => {
    if (!ficheroExterno) return;
    const consumido = onFicheroExternoConsumido;
    void (async () => {
      const bytes = ficheroExterno.bytes;
      const pseudo = new File([bytes.slice().buffer as ArrayBuffer], ficheroExterno.nombre);
      await onElegirFichero(pseudo);
      consumido?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ficheroExterno]);

  const onElegirFichero = async (f: File | undefined): Promise<void> => {
    setErrorImport(null); setRun(null); setInsumos(null); setAutorizacion(null); setResultadoPromo(null); setDecisiones({}); setSeleccion(null); setAvisosParseo([]);
    if (!f) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    const hash = sha256Hex(buf);
    setFichero({ nombre: f.name, bytes: buf, hash });
    // INCIDENCIA (Android): el formato se decide por FIRMA, no sólo por la
    // extensión. Un archivo elegido desde Drive/Gmail puede llegar sin
    // extensión o con nombre genérico; antes eso convertía un .xlsx en CSV y
    // el análisis fallaba sin motivo comprensible.
    // La validación de la extensión se hace SIEMPRE tras la selección (el filtro
    // del selector de Android no es fiable) y la FIRMA manda: un libro sin
    // extensión se acepta si sus bytes lo identifican.
    const errorNombre = validarNombreFicheroImportacion(f.name, buf);
    const detectado = detectarFormatoEntrada(f.name, buf);
    if (!detectado) {
      setFormato(null);
      setErrorImport(
        errorNombre
        ?? `No se reconoce el formato de «${f.name}» (${buf.length} bytes): no es JSON, ni CSV, ni un libro XLSX válido. `
          + 'Exporta el archivo como .json, .csv o .xlsx e inténtalo de nuevo.',
      );
      return;
    }
    setFormato(detectado);
    if (errorNombre) setErrorImport(`aviso: ${errorNombre} (se procesa por su contenido, no por el nombre)`);
  };

  const onAnalizar = async (destino?: string): Promise<void> => {
    if (!fichero || !formato || !identidadLista) return;
    setAnalizando(true); setErrorImport(null);
    try {
      const fuentes: FuentesCatalogo = await cargarFuentesCatalogo(scopeEf);
      const catalogos = catalogosDesdeFuentes(fuentes, {
        propietariosPermitidosIds: ambito.propietarioIdsEscribibles ?? undefined,
        // Metadato reservado (B4 aún no lo lee): uid real + modalidad derivada
        // del perfil (antes: 'PROPIETARIO' fijo incluso para master/gestor).
        importador: identidad ? { uid: identidad.usuarioId, modalidad } : undefined,
      });
      // Titulares que este actor puede escribir: la lista del selector de
      // destino. No se usa para elegir nada por defecto.
      const permitidos = new Set(ambito.propietarioIdsEscribibles ?? []);
      setTitularesDisponibles(
        fuentes.propietarios
          .filter((p) => p.id && permitidos.has(p.id))
          .map((p) => ({ id: p.id, nombre: p.nombre ?? p.id })),
      );
      // Marca de exportación propia (solo JSON): versión + entidad + records anidados.
      let tipoFuente: 'ERP_EXPORT' | 'EXTERNAL' = 'EXTERNAL';
      let versionFuente = FUENTE_EXTERNA_SIN_VERSION;
      let entidadEfectiva = entidad;
      let rutaAnidada: readonly string[] | undefined;
      let raizJson: unknown = null;
      if (formato === 'JSON') {
        try {
          raizJson = JSON.parse(new TextDecoder('utf-8').decode(fichero.bytes));
        } catch (e) {
          setErrorImport(`JSON inválido: ${e instanceof Error ? e.message : String(e)}. No se importa nada.`);
          return;
        }
        const marca = extraerMarcaExportPropio(raizJson);
        if (marca) {
          tipoFuente = 'ERP_EXPORT';
          versionFuente = marca.schemaVersion;
          if (entidadEfectiva === 'AUTO') entidadEfectiva = marca.entityType;
          rutaAnidada = ['records'];
        } else {
          // JSON de OTRA aplicación (p. ej. el Gestor Patrimonial del usuario):
          // se usa la lista que la propia estructura declare (raíz, `records`,
          // `inmuebles`, `data.properties`…). Sin esto, un respaldo integral se
          // importaba como UN registro (el objeto entero) en vez de sus filas.
          const estructura = analizarEstructuraJson(raizJson);
          if (estructura.rutaRegistros && estructura.rutaRegistros.length > 0) {
            rutaAnidada = estructura.rutaRegistros;
          } else if ((entidadEfectiva === 'GASTO' || entidadEfectiva === 'COBRO') && estructura.listaMovimientos) {
            // Respaldo con movimientos y sin inmuebles: al importar GASTO/COBRO
            // se lee ESA lista (el mensaje de error diría exactamente qué es si
            // no se hubiera pedido esa entidad).
            rutaAnidada = estructura.listaMovimientos.ruta;
          }
        }
      }
      // Un solo contrato: mismo pipeline para JSON/CSV/XLSX (BLOQUE 7 añade el
      // adaptador XLSX real, sin lógica distinta por pantalla).
      const parseo = formato === 'JSON'
        ? parseJson(fichero.bytes, rutaAnidada ? { rutaAnidada } : {})
        : formato === 'XLSX'
          ? parseXlsx(fichero.bytes, hojaXlsx.trim() !== '' ? { hoja: hojaXlsx.trim() } : {})
          : parseCsv(fichero.bytes);
      setAvisosParseo([...parseo.avisos]);
      if (parseo.errores.length > 0 && parseo.registros.length === 0) {
        setErrorImport(parseo.errores.join(' | '));
        return;
      }
      // INCIDENCIA: un JSON compatible pero sin registros NO se convierte en
      // una importación vacía; se dice exactamente qué estructura se encontró.
      if (formato === 'JSON' && parseo.registros.length === 0) {
        setErrorImport(
          `El archivo es un JSON válido pero no aporta ningún registro: ${motivoJsonSinRegistros(raizJson)}. `
          + 'No se importa nada y no se crean registros vacíos.',
        );
        return;
      }
      const crudos = (parseo.registros as Record<string, unknown>[]).map((r) => ({ ...r }));
      const destinoEfectivo = destino ?? destinoTitular;
      const parchesDestino = crudos.map(() => (destinoEfectivo ? { propietarioDestinoId: destinoEfectivo } : null));
      const parchesTitularidad = crudos.map((_, i) => {
        const rec = run?.registros.find((r) => r.indiceOrigen === i);
        const res = rec ? decisiones[rec.fingerprint]?.titularidad : undefined;
        return res && res.length > 0 ? { resolucionTitularidad: res } : null;
      });
      const dry = ejecutarImportDryRun({
        registrosCrudos: crudos,
        localizaciones: parseo.localizaciones,
        entityType: entidadEfectiva,
        formato,
        sourceName: fichero.nombre,
        sourceHash: fichero.hash,
        sourceTamanoBytes: fichero.bytes.length,
        sourceType: tipoFuente,
        schemaVersionSource: versionFuente,
        catalogos,
        fechaHora: new Date().toISOString(),
        actor: identidad?.usuarioId ?? null,
        parches: parchesDestino.map((p, i) => {
          const extra = parchesTitularidad[i];
          return p === null && extra === null ? null : { ...(p ?? {}), ...(extra ?? {}) };
        }),
        contratosParaVinculoInquilino: fuentes.contratos.map((c) => ({
          id: c.id, inmuebleId: c.inmuebleId,
          ...(c.candidatoDni ? { candidatoDni: c.candidatoDni } : {}),
          ...(c.candidatoNombre ? { candidatoNombre: c.candidatoNombre } : {}),
        })),
      });
      setRun(dry);
      // Insumos para el re-dry-run de Autorizar (auditoría 3ac21a5/D1: este
      // setInsumos faltaba y el botón Autorizar no hacía nada en silencio).
      setInsumos({
        crudos,
        localizaciones: parseo.localizaciones,
        entidadEfectiva,
        tipoFuente,
        versionFuente,
        catalogos,
      });
      if (parseo.errores.length > 0) setErrorImport(`avisos de parseo: ${parseo.errores.join(' | ')}`);
    } catch (e) {
      setErrorImport(mensajeDeErrorUsuario(e, 'No se ha podido completar la operación.'));
    } finally {
      setAnalizando(false);
    }
  };

  const autorizables = useMemo(
    () => (run ? seleccionarAutorizables(run, seleccion) : null),
    [run, seleccion],
  );

  const onAutorizar = (): void => {
    if (!run || !fichero || !insumos || !formato) return;
    // Re-dry-run con parches de decisión (deducible confirmado + destino
    // declarado) + autorización O7.
    const parches = insumos.crudos.map((_, i) => {
      const rec = run.registros.find((r) => r.indiceOrigen === i);
      const dec = rec ? decisiones[rec.fingerprint] : undefined;
      const partes: { deducible?: boolean; propietarioDestinoId?: string; resolucionTitularidad?: readonly ResolucionTitularImport[] } = {};
      if (destinoTitular) partes.propietarioDestinoId = destinoTitular;
      if (dec?.deducible !== undefined) partes.deducible = dec.deducible;
      if (dec?.titularidad && dec.titularidad.length > 0) partes.resolucionTitularidad = dec.titularidad;
      return Object.keys(partes).length > 0 ? partes : null;
    });
    const run2 = ejecutarImportDryRun({
      registrosCrudos: insumos.crudos,
      localizaciones: insumos.localizaciones,
      entityType: insumos.entidadEfectiva,
      formato,
      sourceName: fichero.nombre,
      sourceHash: fichero.hash,
      sourceTamanoBytes: fichero.bytes.length,
      sourceType: insumos.tipoFuente,
      schemaVersionSource: insumos.versionFuente,
      catalogos: insumos.catalogos,
      fechaHora: new Date().toISOString(),
      actor: identidad?.usuarioId ?? null,
      parches,
    });
    setRun(run2);
    setAutorizacion(autorizarImportRun({
      run: run2,
      tamanoBytes: fichero.bytes.length,
      commitDryRun: 'ui',
      autorizador: identidad?.usuarioId ?? null,
      fechaHora: new Date().toISOString(),
    }));
  };

  const onPromocionar = async (): Promise<void> => {
    if (!run || !autorizacion || !fichero || !identidad) return;
    setPromocionando(true); setErrorImport(null);
    try {
      const token = derivarTokenEjecucion(fichero.hash);
      const barrera = verificarBarrera({
        autorizacion, canonicalBatchSha256: fichero.hash, explicitExecutionToken: token, dryRunActual: run.dryRun,
      });
      if (!barrera.pasa) throw new Error(`barrera O7: ${barrera.motivos.join(' | ')}`);
      const plan = planificarPromocion({
        autorizacion, run, canonicalBatchSha256: fichero.hash, explicitExecutionToken: token,
        seleccionFingerprints: seleccion, decisiones, ambito,
      });
      const puerto = crearPuertoFirebase(identidad);
      const res = await ejecutarPromocion({
        plan, run, decisiones, puerto, actor: identidad.usuarioId, fechaHora: new Date().toISOString(),
      });
      setResultadoPromo(res);
    } catch (e) {
      setErrorImport(mensajeDeErrorUsuario(e, 'No se ha podido completar la operación.'));
    } finally {
      setPromocionando(false);
    }
  };

  const onExportar = async (): Promise<void> => {
    if (!identidadLista) return;
    setExpError(null); setExpInfo(null); setExpGenerando(true);
    try {
      // Listas del ámbito: los huecos NO son valores. Antes, un campo vacío
      // producía `Number('') === 0` y el filtro por ejercicio dejaba fuera TODO
      // (`[0]`): la exportación salía vacía sin decir por qué.
      const lista = (valor: string): string[] => valor.split(',').map((x) => x.trim()).filter(Boolean);
      const tokensEjercicio = lista(expEjercicios);
      const ejercicios = tokensEjercicio.map(Number);
      const ejercicioInvalido = tokensEjercicio.find((_, i) => !Number.isInteger(ejercicios[i]) || ejercicios[i] <= 0);
      if (ejercicioInvalido !== undefined) {
        setExpError(`Ejercicio inválido: «${ejercicioInvalido}». Usa años de 4 cifras (p. ej. 2024) separados por comas.`);
        return;
      }
      const fuentes = await cargarFuentesCatalogo(scopeEf);
      const solicitado: AmbitoExportacionSolicitado = {
        entidad: expEntidad,
        propietarioIds: lista(expProps),
        inmuebleIds: lista(expInms),
        ejercicios,
        formato: expFormato,
      };
      const base: Record<string, unknown>[] = expEntidad === 'GASTO'
        ? fuentes.gastos.map((g) => ({ ...(g as unknown as Record<string, unknown>) }))
        : expEntidad === 'COBRO'
          ? fuentes.contratos.flatMap((c) => (c.registroCobros ?? []).map((cb) => ({ ...(cb as unknown as Record<string, unknown>) })))
          : expEntidad === 'INMUEBLE'
            ? fuentes.inmuebles.map((i) => ({ ...(i as unknown as Record<string, unknown>) }))
            : expEntidad === 'PROPIETARIO'
              ? fuentes.propietarios.map((p) => ({ ...(p as unknown as Record<string, unknown>) }))
              : fuentes.contratos.map((c) => {
                const { registroCobros: _omit, ...resto } = c as unknown as Record<string, unknown>;
                void _omit;
                return { ...resto };
              });
      const exp = ejecutarExportacion({
        solicitado,
        autorizado: ambito,
        catalogoInmuebles: fuentes.inmuebles,
        registros: base,
        exportedAt: new Date().toISOString(),
        exportedBy: identidad?.usuarioId ?? null,
      });
      const nombre = `export_${expEntidad.toLowerCase()}_${exp.exportRunId}.${expFormato.toLowerCase()}`;
      if (exp.bytes) {
        // XLSX: libro real generado en memoria (no se sube a Storage/Firestore).
        descargarBytes(nombre, exp.bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        descargar(nombre, exp.contenido, expFormato === 'JSON' ? 'application/json' : 'text/csv');
      }
      setExpInfo(`${exp.recordCount} registro(s) · run ${exp.exportRunId} · sha256 ${exp.sha256.slice(0, 16)}…${exp.avisos.length > 0 ? ` · avisos: ${exp.avisos.join(' | ')}` : ''}`);
    } catch (e) {
      setExpError(mensajeDeErrorUsuario(e, 'No se ha podido completar la operación.'));
    } finally {
      setExpGenerando(false);
    }
  };

  const pendientes = run?.registros.filter((r) => r.decision !== 'AUTO') ?? [];
  const autos = run?.registros.filter((r) => r.decision === 'AUTO') ?? [];
  // INCIDENCIA (cartera destino): registros que aún no tienen titular resuelto.
  // Con más de una cartera escribible, la importación se DETIENE hasta que la
  // persona elija (nunca se asigna el titular principal por defecto).
  const registrosSinTitular = (run?.registros ?? []).filter((r) => !r.propietarioDestinoId && r.decision !== 'NO_MIGRABLE');
  const titularesElegibles = titularesDisponibles.length > 0
    ? titularesDisponibles
    : (ambito.propietarioIdsEscribibles ?? []).map((id) => ({ id, nombre: id }));
  const faltaElegirDestino = registrosSinTitular.length > 0 && destinoTitular === '' && titularesElegibles.length > 0;
  const sinCarteraEscribible = registrosSinTitular.length > 0 && titularesElegibles.length === 0;
  // Sólo informativo y acotado: por encima de 2 MB no se re-parsea el archivo
  // entero en cada render (el análisis real ya lo hace el parser con cotas).
  const estructuraJson = useMemo(
    () => (fichero && formato === 'JSON' && fichero.bytes.length <= 2_000_000
      ? (() => { try { return analizarEstructuraJson(JSON.parse(new TextDecoder('utf-8').decode(fichero.bytes))); } catch { return null; } })()
      : null),
    [fichero, formato],
  );
  const hayInmuebles = (run?.registros ?? []).some((r) => r.entityType === 'INMUEBLE');

  // ---- Correspondencia columna → destino (verificable, no «reconocida y ya») ----
  const correspondencia = useMemo(() => {
    const mapa = new Map<string, { destino: string; clase: string }>();
    for (const r of run?.registros ?? []) {
      for (const m of r.fieldMappings) {
        const regla = m.regla ?? '';
        const clase = regla.includes('conservado_historico')
          ? 'declarado (persistente)'
          : regla.includes('identidad_origen') ? 'identidad de origen'
            : regla.includes('conocido_sin_destino') ? 'SIN destino (declarado)' : 'modelo';
        mapa.set(m.campoOrigen, { destino: m.campoCanonico, clase });
      }
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [run]);

  // ---- Datos declarados conservados (agregado por clave) ----
  const declaradosAgregados = useMemo(() => {
    const mapa = new Map<string, { campoOrigen: string; clave: string; clase: string; estado: string; valores: string[]; motivo: string }>();
    for (const r of run?.registros ?? []) {
      for (const d of r.declarados ?? []) {
        const actual = mapa.get(d.clave) ?? {
          campoOrigen: d.campoOrigen, clave: d.clave, clase: d.clase, estado: d.estado,
          valores: [], motivo: d.motivo,
        };
        const valor = typeof d.valorOriginal === 'string' ? d.valorOriginal.trim() : String(d.valorOriginal ?? '');
        if (valor !== '' && !actual.valores.includes(valor)) actual.valores.push(valor);
        mapa.set(d.clave, actual);
      }
    }
    return [...mapa.values()];
  }, [run]);

  // ---- Relaciones declaradas PENDIENTES de resolución ----
  const pendientesRelaciones = useMemo(() => {
    const vistos = new Set<string>();
    const lista: Array<{ campoOrigen: string; clave: string; motivo: string; valor: string }> = [];
    for (const r of run?.registros ?? []) {
      for (const rel of r.relacionesPendientes ?? []) {
        const k = `${rel.clave}␟${rel.motivo}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        const valor = typeof rel.valorOriginal === 'string' ? rel.valorOriginal.trim() : String(rel.valorOriginal ?? '');
        lista.push({ campoOrigen: rel.campoOrigen, clave: rel.clave, motivo: rel.motivo, valor });
      }
    }
    return lista;
  }, [run]);

  // ---- Resumen previo a la promoción ----
  const resumenPromocion = useMemo(() => {
    const registros = run?.registros ?? [];
    return {
      altas: registros.filter((r) => r.entityType === 'INMUEBLE' && r.operacion === 'CREAR' && r.destinationId).length,
      vinculaciones: registros.filter((r) => r.operacion === 'VINCULAR').length,
      datosConservados: registros.reduce((acc, r) => acc + (r.declarados?.length ?? 0), 0),
      relacionesPendientes: registros.reduce((acc, r) => acc + (r.relacionesPendientes?.length ?? 0), 0),
      bloqueos: registros.filter((r) => r.decision === 'BLOQUEADO').length,
      titularidadesResueltas: registros.reduce((acc, r) => acc + (r.titularidadResuelta?.length ?? 0), 0),
    };
  }, [run]);

  /** Ranuras de titularidad declaradas por un registro (para resolverlas). */
  const ranurasDeclaradasDe = (rec: NonNullable<typeof run>['registros'][number]) =>
    (rec.declarados ?? [])
      .filter((d) => d.clave === 'titularidadDeclarada.propietario1' || d.clave === 'titularidadDeclarada.propietario2')
      .map((d) => ({
        ranura: (d.clave.endsWith('propietario1') ? 1 : 2) as 1 | 2,
        valor: typeof d.valor === 'number' ? d.valor : null,
        valorOriginal: d.valorOriginal,
      }));

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
          <FileJson className="w-5 h-5 text-emerald-600" />
          <h3>Importación / Exportación canónica (erp-import-export-v1)</h3>
        </div>
        <div className="flex gap-2">
          <button
            aria-current={pestana === 'importar' ? 'true' : undefined} type="button" onClick={() => setPestana('importar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${pestana === 'importar' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            Importar
          </button>
          <button
            aria-current={pestana === 'exportar' ? 'true' : undefined} type="button" onClick={() => setPestana('exportar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${pestana === 'exportar' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            Exportar
          </button>
        </div>
      </div>

      {ctx.estado === 'cargando' && (
        <p className="text-xs text-slate-500 font-semibold">Cargando identidad para acotar el ámbito…</p>
      )}
      {ctx.estado === 'error' && (
        <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
          Sin identidad ({ctx.error}): el panel se bloquea (no acota a ciegas ni cuelga).
        </div>
      )}

      {pestana === 'importar' && (
        <div className="space-y-3 text-xs">
          <p className="text-slate-600 leading-relaxed">
            PASO 1–3: elige archivo (JSON/CSV/XLSX) y tipo de datos. PASO 4: <strong>Analizar</strong> ejecuta un dry-run
            puro (0 escrituras). PASO 5–6: revisa el resumen y los problemas. PASO 7: promociona solo autorizados.
            Ámbito: {ambito.esMaster ? 'master' : identidadLista ? `${(ambito.propietarioIdsLegibles ?? []).length} propietario(s)` : 'sin identidad (bloqueado)'}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center gap-2">
              <Upload className="w-4 h-4" /> {fichero ? fichero.nombre : 'Seleccionar archivo'}
            </button>
            {/* INCIDENCIA (Android): MIME + extensión. Sólo extensiones dejaba
                fuera .json/.xlsx en el selector de archivos de Android. */}
            <input ref={fileRef} type="file" accept={ACEPTAR_IMPORTACION} className="hidden"
              onChange={(e) => void onElegirFichero(e.target.files?.[0])} />
            <span className="text-slate-500">Formato: <strong>{formato ?? '—'}</strong></span>
            {formato === 'XLSX' && (
              <label className="text-slate-500" title="Vacío = primera hoja del libro (se avisa de cuál se lee)">
                Hoja:
                <input value={hojaXlsx} onChange={(e) => setHojaXlsx(e.target.value)} placeholder="(por nombre; vacío = primera)"
                  className="ml-1 border border-slate-200 rounded-lg px-2 py-1 font-mono" />
              </label>
            )}
            <label className="text-slate-500">Entidad:
              <select value={entidad} onChange={(e) => setEntidad(e.target.value)}
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700">
                {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void onAnalizar()} disabled={!fichero || analizando || !identidadLista}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold">
              {analizando ? 'Analizando…' : 'Analizar (dry-run)'}
            </button>
          </div>
          {fichero && <p className="text-slate-500 font-mono">sha256: {fichero.hash.slice(0, 32)}… ({fichero.bytes.length} bytes)</p>}
          {errorImport && <div className="p-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-semibold">{errorImport}</div>}
          {avisosParseo.length > 0 && (
            <ul className="p-3 rounded-xl bg-slate-50 text-slate-600 border border-slate-200 space-y-0.5">
              {avisosParseo.map((a, i) => <li key={`${i}-${a}`} className="font-mono text-[11px]">· {a}</li>)}
            </ul>
          )}
          {run && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  ['Total', run.totalRecords], ['AUTO', run.importedRecords],
                  ['Incompletos', run.incompleteRecords], ['Revisión', run.reviewRecords],
                  ['Bloqueados', run.blockedRecords], ['Duplicados', run.duplicateRecords],
                  ['No migrables', run.noMigrables], ['Errores', run.errorRecords],
                ].map(([k, v]) => (
                  <div key={k as string} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <span className="block text-slate-500">{k}</span>
                    <span className="block text-lg font-bold text-slate-900">{v as number}</span>
                  </div>
                ))}
              </div>
              {estructuraJson && (
                <p className="text-slate-500 font-mono text-[11px]">
                  estructura JSON detectada: {estructuraJson.descripcion}
                </p>
              )}
              {run.camposDesconocidos.length > 0 && (
                <p className="text-slate-600">Campos desconocidos (ignorados, no fatales): {run.camposDesconocidos.map((c) => `${c.campo}×${c.registros}`).join(', ')}</p>
              )}
              {run.camposSinDestino.length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <p className="font-bold text-slate-800">Columnas reconocidas SIN destino (no se importan, con motivo):</p>
                  <ul className="space-y-0.5">
                    {run.camposSinDestino.map((c) => (
                      <li key={`${c.campo}-${c.motivo}`} className="font-mono text-[11px] text-slate-600">
                        · {c.campo} ×{c.registros} → {c.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {correspondencia.length > 0 && (
                <details className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <summary className="font-bold text-slate-800 cursor-pointer">
                    Correspondencia columna → destino ({correspondencia.length})
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {correspondencia.map(([campo, d]) => (
                      <li key={campo} className="font-mono text-[11px] text-slate-600">
                        · {campo} → {d.destino} [{d.clase}]
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {declaradosAgregados.length > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                  <p className="font-bold text-emerald-900">
                    Datos declarados CONSERVADOS con destino persistente ({declaradosAgregados.length} tipo(s)):
                  </p>
                  <ul className="space-y-0.5">
                    {declaradosAgregados.map((d) => (
                      <li key={d.clave} className="font-mono text-[11px] text-emerald-900">
                        · {d.campoOrigen} → {d.clave} [{d.clase}{d.estado === 'PENDIENTE_RESOLUCION' ? ' · PENDIENTE' : ''}]
                        {d.valores.length > 0 ? ` = ${d.valores.slice(0, 3).join(', ')}${d.valores.length > 3 ? '…' : ''}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="text-emerald-800 text-[11px]">
                    Se persisten en el inmueble (campos declarados + evidencia) y son releíbles. Los agregados
                    anuales se guardan como tales: <strong>no</strong> se convierten en gastos individuales ni se
                    suman al detalle; la amortización declarada no sustituye al cálculo fiscal.
                  </p>
                </div>
              )}
              {pendientesRelaciones.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                  <p className="font-bold text-amber-900">
                    Relaciones declaradas PENDIENTES de resolución ({pendientesRelaciones.length}) — no se inventan:
                  </p>
                  <ul className="space-y-0.5">
                    {pendientesRelaciones.map((r) => (
                      <li key={`${r.clave}-${r.motivo}`} className="font-mono text-[11px] text-amber-900">
                        · {r.campoOrigen}{r.valor ? ` = ${r.valor}` : ''}: {r.motivo}
                      </li>
                    ))}
                  </ul>
                  <p className="text-amber-800 text-[11px]">
                    El dato original queda guardado en el inmueble; la importación del resto NO se bloquea.
                  </p>
                </div>
              )}
              {run.registros.some((r) => r.entityType === 'INMUEBLE' && ranurasDeclaradasDe(r).length > 0) && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="font-bold text-slate-800">
                    Titularidad declarada: asigna cada porcentaje a un titular existente (o déjalo pendiente)
                  </p>
                  <p className="text-slate-600">
                    Sólo se creará la relación de las ranuras que asignes aquí. Sin asignación, el porcentaje queda
                    declarado y PENDIENTE con su valor original (nunca se reparte, ni 50/50 ni 100 %).
                  </p>
                  <ul className="space-y-2">
                    {run.registros.filter((r) => r.entityType === 'INMUEBLE').map((r) => {
                      const ranuras = ranurasDeclaradasDe(r);
                      if (ranuras.length === 0) return null;
                      return (
                        <li key={r.fingerprint} className="bg-white p-2 rounded-xl border border-slate-200 space-y-1">
                          <p className="font-mono text-[11px] text-slate-600">{r.sourcePath} · {r.sourceRecordId}</p>
                          {ranuras.map((ra) => {
                            const actual = decisiones[r.fingerprint]?.titularidad?.find((x) => x.ranura === ra.ranura)?.propietarioId ?? '';
                            return (
                              <label key={ra.ranura} className="flex flex-wrap items-center gap-2 text-slate-700">
                                <span className="font-semibold">
                                  % Propietario {ra.ranura} ({ra.valor ?? String(ra.valorOriginal)})
                                </span>
                                <select
                                  aria-label={`Titular para % Propietario ${ra.ranura} de ${r.sourceRecordId}`}
                                  value={actual}
                                  onChange={(e) => {
                                    const valor = e.target.value;
                                    const previas = (decisiones[r.fingerprint]?.titularidad ?? []).filter((x) => x.ranura !== ra.ranura);
                                    const siguiente: ResolucionTitularImport[] = valor === ''
                                      ? previas
                                      : [...previas, { ranura: ra.ranura, propietarioId: valor }];
                                    setDecisiones({
                                      ...decisiones,
                                      [r.fingerprint]: { ...decisiones[r.fingerprint], titularidad: siguiente },
                                    });
                                  }}
                                  className="border border-slate-200 rounded-lg px-2 py-1 bg-white font-semibold text-slate-700">
                                  <option value="">(pendiente: no se crea relación)</option>
                                  {titularesElegibles.map((tt) => (
                                    <option key={tt.id} value={tt.id}>{tt.nombre} · {tt.id}</option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" onClick={() => void onAnalizar()} disabled={analizando}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 rounded-xl font-bold">
                    Aplicar titularidad y reanalizar (dry-run)
                  </button>
                </div>
              )}
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 space-y-1">
                <p className="font-bold text-indigo-900">Resumen previo a la promoción</p>
                <ul className="text-indigo-900 text-[11px] font-mono">
                  <li>· altas de inmuebles nuevas: {resumenPromocion.altas}</li>
                  <li>· inmuebles existentes que se VINCULAN (sin sobrescribir): {resumenPromocion.vinculaciones}</li>
                  <li>· relaciones de titularidad resueltas a titular existente: {resumenPromocion.titularidadesResueltas}</li>
                  <li>· datos declarados conservados: {resumenPromocion.datosConservados}</li>
                  <li>· relaciones declaradas pendientes (no se inventan): {resumenPromocion.relacionesPendientes}</li>
                  <li>· registros bloqueados: {resumenPromocion.bloqueos}</li>
                </ul>
              </div>
              {/* INCIDENCIA: titular/cartera de destino. Sin elección explícita
                  no se autoriza ni se promociona (nunca el titular principal
                  por defecto). */}
              {registrosSinTitular.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <p className="font-bold text-amber-900">
                    {registrosSinTitular.length} registro(s) sin titular destino determinado
                  </p>
                  {sinCarteraEscribible ? (
                    <p className="text-amber-800">
                      Tu perfil no tiene ninguna cartera escribible: elige el titular destino desde una sesión con permisos
                      de escritura sobre esa cartera (titular, gestor con cartera E o administración). No se asigna nada
                      por defecto.
                    </p>
                  ) : (
                    <>
                      <label className="text-amber-900 font-semibold block">
                        Titular destino de la importación:
                        <select value={destinoTitular} onChange={(e) => setDestinoTitular(e.target.value)}
                          className="ml-2 border border-amber-300 rounded-lg px-2 py-1 bg-white font-semibold text-slate-700">
                          <option value="">(selecciona un titular)</option>
                          {titularesElegibles.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t.id}</option>)}
                        </select>
                      </label>
                      <p className="text-amber-800">
                        {titularesElegibles.length > 1
                          ? 'Hay más de una cartera escribible: la importación se detiene hasta que elijas destino (no se reparte ni se deduce).'
                          : 'Confirma el destino para continuar (no se asigna automáticamente).'}
                      </p>
                      <button type="button" onClick={() => void onAnalizar(destinoTitular)} disabled={analizando || destinoTitular === ''}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-bold">
                        Aplicar destino y reanalizar (dry-run)
                      </button>
                    </>
                  )}
                </div>
              )}
              <button type="button" onClick={() => setVerProblemas(!verProblemas)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700">
                {verProblemas ? 'Ocultar' : 'Consultar'} problemas ({pendientes.length})
              </button>
              {verProblemas && (
                <ul className="max-h-48 overflow-auto space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {pendientes.length === 0 && <li className="text-slate-500">Sin problemas: todo AUTO.</li>}
                  {pendientes.map((p) => (
                    <li key={p.fingerprint} className="font-mono text-[11px] text-slate-700">
                      {p.sourcePath} [{p.entityType}] → {p.decision}: {p.motivo}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => setVerRegistros(!verRegistros)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-700">
                {verRegistros ? 'Ocultar' : 'Ver'} registros ({run.registros.length})
              </button>
              {verRegistros && (
                <ul className="max-h-64 overflow-auto space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {run.registros.map((p) => (
                    <li key={p.fingerprint} className="font-mono text-[11px] text-slate-700">
                      {p.sourcePath} [{p.entityType}] id={p.sourceRecordId} → {p.decision}
                      {p.propietarioDestinoId ? ` · titular ${p.propietarioDestinoId}` : ' · sin titular'}
                      {p.duplicado !== 'NUEVO' ? ` · ${p.duplicado}` : ''}
                      {p.destinationId ? ` · destino ${p.destinationId}` : ''}
                      {p.decision === 'AUTO' ? '' : `: ${p.motivo}`}
                    </li>
                  ))}
                </ul>
              )}
              {hayInmuebles && (
                <p className="text-slate-600">
                  Inmuebles: el análisis es completo y sin escrituras. Los inmuebles que YA existen se VINCULAN (AUTO)
                  y <strong>nunca se sobrescriben</strong>: reimportar el mismo archivo no duplica ni pisa nada. Las filas
                  NUEVAS se dan de alta como inmuebles patrimoniales con los datos declarados del archivo (dirección,
                  CP, ciudad, referencia catastral, valor y fecha de adquisición, superficie, habitaciones, tipo) y
                  además se persisten con campo propio los datos declarados que el modelo patrimonial distingue:
                  % de suelo catastral (validado 0–100), amortización anual declarada, renta mensual declarada,
                  agregados anuales de gastos (comunidad, IBI, reparaciones, seguro) y fecha de registro. Los
                  porcentajes de titularidad, el inquilino y su DNI se conservan como declaración pendiente de
                  resolución: no se inventan relaciones ni se crean contratos. El alta no publica ficha pública.
                </p>
              )}
              {autos.length > 0 && (
                <div className="space-y-2">
                  <p className="font-bold text-slate-900">Decisiones de promoción (B1 G-13: sin decisión no se promociona)</p>
                  <ul className="max-h-48 overflow-auto space-y-2">
                    {autos.filter((a) => a.entityType === 'GASTO' || a.entityType === 'COBRO' || a.entityType === 'INMUEBLE').map((a) => (
                      <li key={a.fingerprint} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <label className="flex items-center gap-1 font-semibold text-slate-700">
                          <input type="checkbox" className="w-4 h-4"
                            checked={seleccion === null || seleccion.includes(a.fingerprint)}
                            onChange={(e) => {
                              const pool = autos.filter((x) => x.entityType === 'GASTO' || x.entityType === 'COBRO' || x.entityType === 'INMUEBLE').map((x) => x.fingerprint);
                              const actual = seleccion === null ? pool : seleccion;
                              setSeleccion(e.target.checked ? [...actual, a.fingerprint] : actual.filter((f) => f !== a.fingerprint));
                            }} />
                          <span className="font-mono text-[11px]">{a.sourcePath} {a.entityType} → {a.destinationId}</span>
                        </label>
                        {a.entityType === 'GASTO' && (
                          <>
                            <select value={decisiones[a.fingerprint]?.aCargoDe ?? ''}
                              onChange={(e) => setDecisiones({ ...decisiones, [a.fingerprint]: { ...decisiones[a.fingerprint], aCargoDe: e.target.value as 'arrendador' | 'arrendatario' } })}
                              className="border border-slate-200 rounded-lg px-2 py-1">
                              <option value="">aCargoDe…</option>
                              <option value="arrendador">arrendador</option>
                              <option value="arrendatario">arrendatario</option>
                            </select>
                            <select value={decisiones[a.fingerprint]?.estadoGasto ?? ''}
                              onChange={(e) => setDecisiones({ ...decisiones, [a.fingerprint]: { ...decisiones[a.fingerprint], estadoGasto: e.target.value as DecisionPromocion['estadoGasto'] } })}
                              className="border border-slate-200 rounded-lg px-2 py-1">
                              <option value="">estado…</option>
                              <option value="PENDIENTE">PENDIENTE</option>
                              <option value="PAGADO">PAGADO</option>
                              <option value="EN_REVISION">EN_REVISION</option>
                            </select>
                            <select
                              value={decisiones[a.fingerprint]?.deducible === undefined ? '' : String(decisiones[a.fingerprint]?.deducible)}
                              onChange={(e) => setDecisiones({ ...decisiones, [a.fingerprint]: { ...decisiones[a.fingerprint], deducible: e.target.value === '' ? undefined : e.target.value === 'true' } })}
                              className="border border-slate-200 rounded-lg px-2 py-1" title="Deducible (puerta fiscal O7: sin confirmar no promociona)">
                              <option value="">deducible…</option>
                              <option value="true">deducible: sí</option>
                              <option value="false">deducible: no</option>
                            </select>
                          </>
                        )}
                        {a.entityType === 'COBRO' && (
                          <>
                            <select value={decisiones[a.fingerprint]?.estadoCobro ?? ''}
                              onChange={(e) => setDecisiones({ ...decisiones, [a.fingerprint]: { ...decisiones[a.fingerprint], estadoCobro: e.target.value as DecisionPromocion['estadoCobro'] } })}
                              className="border border-slate-200 rounded-lg px-2 py-1">
                              <option value="">estado…</option>
                              <option value="PENDIENTE">PENDIENTE</option>
                              <option value="PAGADO">PAGADO</option>
                              <option value="PAGADO_PARCIAL">PAGADO_PARCIAL</option>
                            </select>
                            <input type="date" value={decisiones[a.fingerprint]?.fechaVencimiento ?? ''}
                              onChange={(e) => setDecisiones({ ...decisiones, [a.fingerprint]: { ...decisiones[a.fingerprint], fechaVencimiento: e.target.value } })}
                              className="border border-slate-200 rounded-lg px-2 py-1" />
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onAutorizar} disabled={faltaElegirDestino}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Autorizar (O7)
                    </button>
                    {faltaElegirDestino && (
                      <span className="px-3 py-2 rounded-xl font-bold bg-amber-100 text-amber-800">
                        Destino pendiente: selecciona el titular y reanaliza antes de autorizar.
                      </span>
                    )}
                    {autorizacion && (
                      <span className="px-3 py-2 rounded-xl font-bold bg-slate-100 text-slate-700">
                        {autorizacion.decision}: {autorizacion.motivo}
                      </span>
                    )}
                  </div>
                  {autorizables && <p className="text-slate-600">Elegibles O7 (pre-decisión fiscal): {autorizables.elegibles.length} · excluidos: {autorizables.excluidos.length}</p>}
                  {autorizacion && <p className="text-slate-600">Incluidos O7: {autorizacion.incluidos.length} · excluidos: {autorizacion.excluidos.length}</p>}
                  <button type="button" onClick={() => void onPromocionar()}
                    disabled={!autorizacion || autorizacion.decision !== 'CONCEDIDA' || !identidad || promocionando || faltaElegirDestino}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold">
                    {promocionando ? 'Promocionando…' : 'Promocionar selección'}
                  </button>
                  {!identidad && <p className="text-amber-700 font-semibold">Promoción desactivada: sin identidad de actor (falta `usuario`). El dry-run sí está disponible.</p>}
                  {resultadoPromo && (
                    <pre className="whitespace-pre-wrap max-h-48 overflow-auto bg-slate-900 text-emerald-200 p-3 rounded-xl text-[11px] font-mono">{resultadoPromo.informe}</pre>
                  )}
                </div>
              )}
            </div>
          )}
          <details className="text-slate-500">
            <summary className="cursor-pointer font-semibold">Soporte por entidad (honesto)</summary>
            <ul className="mt-1 space-y-0.5">
              {SOPORTE_ENTIDADES.map((s) => (
                <li key={s.entidad} className="font-mono text-[11px]">{s.entidad}: {s.soporte} — {s.nota} ({soporteDe(s.entidad)})</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {pestana === 'exportar' && (
        <div className="space-y-3 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Exportación canónica desde el modelo ERP (no depende del origen). Ámbito: {ambito.esMaster ? 'master' : `${(ambito.propietarioIdsLegibles ?? []).length} propietario(s) legible(s)`}.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-slate-600">Entidad:
              <select value={expEntidad} onChange={(e) => setExpEntidad(e.target.value)}
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700">
                {['GASTO', 'COBRO', 'INMUEBLE', 'PROPIETARIO', 'CONTRATO'].map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <label className="text-slate-600">Formato:
              <select value={expFormato} onChange={(e) => setExpFormato(e.target.value as 'JSON' | 'CSV' | 'XLSX')}
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700">
                <option value="JSON">JSON canónico</option>
                <option value="CSV">CSV</option>
                <option value="XLSX">Excel (.xlsx)</option>
              </select>
            </label>
            <label className="text-slate-600">Propietarios (ids, coma; vacío = todos los legibles):
              <input value={expProps} onChange={(e) => setExpProps(e.target.value)} placeholder="prop_1, prop_2"
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 w-full font-mono" />
            </label>
            <label className="text-slate-600">Inmuebles (ids, coma; vacío = todos):
              <input value={expInms} onChange={(e) => setExpInms(e.target.value)} placeholder="inm_1"
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 w-full font-mono" />
            </label>
            <label className="text-slate-600">Ejercicios GASTO/COBRO (coma; vacío = todos):
              <input value={expEjercicios} onChange={(e) => setExpEjercicios(e.target.value)} placeholder="2024, 2025"
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 w-full font-mono" />
            </label>
          </div>
          <p className="text-slate-500">
            Ámbito aplicado: {expProps.trim() === '' ? (ambito.esMaster ? '(master: indicar propietarios)' : 'todos los legibles') : expProps} ·
            inmuebles: {expInms.trim() === '' ? 'todos' : expInms} · {inmuebles.length} inmueble(s) en contexto.
          </p>
          <button type="button" onClick={() => void onExportar()} disabled={expGenerando || !identidadLista}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-2">
            {expFormato === 'JSON' ? <FileJson className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
            {expGenerando ? 'Generando…' : 'Generar y descargar'}
          </button>
          {expError && <div className="p-3 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-semibold">{expError}</div>}
          {expInfo && <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-2"><Download className="w-4 h-4" />{expInfo}</div>}
        </div>
      )}
    </div>
  );
};
