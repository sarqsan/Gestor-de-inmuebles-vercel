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
import React, { useMemo, useRef, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import type { Inmueble, UsuarioApp } from '../../types';
import type { GestionCartera } from '../../lib/gestionesCartera';
import { sha256Hex } from '../../lib/importacion/hash';
import {
  FUENTE_EXTERNA_SIN_VERSION,
  SOPORTE_ENTIDADES,
  ejecutarExportacion,
  ejecutarImportDryRun,
  extraerMarcaExportPropio,
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
import {
  ambitoAutorizadoDesdeUsuario,
  cargarFuentesCatalogo,
  catalogosDesdeFuentes,
  crearPuertoFirebase,
  type FuentesCatalogo,
} from '../../lib/importExportFirebase';
import type { DataAccessScope } from '../../lib/firebase';

interface Props {
  inmuebles: Inmueble[];
  usuario?: UsuarioApp | null;
  gestiones?: GestionCartera[];
  scope?: DataAccessScope;
}

const ENTIDADES = ['AUTO', 'GASTO', 'COBRO', 'INMUEBLE', 'PROPIETARIO', 'CONTRATO', 'DOCUMENTO'] as const;

function descargar(nombre: string, contenido: string, mime: string): void {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export const ImportExportPanel: React.FC<Props> = ({ inmuebles, usuario = null, gestiones = [], scope }) => {
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
  const [analizando, setAnalizando] = useState(false);
  const [decisiones, setDecisiones] = useState<Record<string, DecisionPromocion>>({});
  const [seleccion, setSeleccion] = useState<string[] | null>(null);
  const [autorizacion, setAutorizacion] = useState<ReturnType<typeof autorizarImportRun> | null>(null);
  const [promocionando, setPromocionando] = useState(false);
  const [resultadoPromo, setResultadoPromo] = useState<ResultadoPromocion | null>(null);
  const [verProblemas, setVerProblemas] = useState(false);

  // ---- exportar ----
  const [expEntidad, setExpEntidad] = useState('GASTO');
  const [expProps, setExpProps] = useState('');
  const [expInms, setExpInms] = useState('');
  const [expEjercicios, setExpEjercicios] = useState('');
  const [expFormato, setExpFormato] = useState<'JSON' | 'CSV'>('JSON');
  const [expError, setExpError] = useState<string | null>(null);
  const [expInfo, setExpInfo] = useState<string | null>(null);
  const [expGenerando, setExpGenerando] = useState(false);

  const ambito = useMemo(() => ambitoAutorizadoDesdeUsuario(usuario, gestiones), [usuario, gestiones]);
  const identidad = usuario ? { usuarioId: usuario.id, usuarioEmail: usuario.email, usuarioNombre: usuario.nombre } : null;

  const onElegirFichero = async (f: File | undefined): Promise<void> => {
    setErrorImport(null); setRun(null); setInsumos(null); setAutorizacion(null); setResultadoPromo(null); setDecisiones({}); setSeleccion(null);
    if (!f) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    const hash = sha256Hex(buf);
    setFichero({ nombre: f.name, bytes: buf, hash });
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext === 'json') setFormato('JSON');
    else if (ext === 'csv') setFormato('CSV');
    else if (ext === 'xlsx' || ext === 'xls') setFormato('XLSX');
    else {
      const inicio = new TextDecoder('utf-8').decode(buf.slice(0, 2000)).trimStart();
      setFormato(inicio.startsWith('{') || inicio.startsWith('[') ? 'JSON' : 'CSV');
    }
  };

  const onAnalizar = async (): Promise<void> => {
    if (!fichero || !formato) return;
    setAnalizando(true); setErrorImport(null);
    try {
      const fuentes: FuentesCatalogo = await cargarFuentesCatalogo(scope);
      const catalogos = catalogosDesdeFuentes(fuentes, {
        propietariosPermitidosIds: ambito.propietarioIdsEscribibles ?? undefined,
        importador: identidad ? { uid: identidad.usuarioId, modalidad: 'PROPIETARIO' } : undefined,
      });
      if (formato === 'XLSX') {
        const r = parseXlsx();
        setErrorImport(r.errores.join(' '));
        return;
      }
      // Marca de exportación propia (solo JSON): versión + entidad + records anidados.
      let tipoFuente: 'ERP_EXPORT' | 'EXTERNAL' = 'EXTERNAL';
      let versionFuente = FUENTE_EXTERNA_SIN_VERSION;
      let entidadEfectiva = entidad;
      let rutaAnidada: readonly string[] | undefined;
      if (formato === 'JSON') {
        try {
          const raiz = JSON.parse(new TextDecoder('utf-8').decode(fichero.bytes));
          const marca = extraerMarcaExportPropio(raiz);
          if (marca) {
            tipoFuente = 'ERP_EXPORT';
            versionFuente = marca.schemaVersion;
            if (entidadEfectiva === 'AUTO') entidadEfectiva = marca.entityType;
            rutaAnidada = ['records'];
          }
        } catch { /* el parseo principal ya informa del error */ }
      }
      const parseo = formato === 'JSON' ? parseJson(fichero.bytes, rutaAnidada ? { rutaAnidada } : {}) : parseCsv(fichero.bytes);
      if (parseo.errores.length > 0 && parseo.registros.length === 0) {
        setErrorImport(parseo.errores.join(' | '));
        return;
      }
      const crudos = (parseo.registros as Record<string, unknown>[]).map((r) => ({ ...r }));
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
      });
      setRun(dry);
      if (parseo.errores.length > 0) setErrorImport(`avisos de parseo: ${parseo.errores.join(' | ')}`);
    } catch (e) {
      setErrorImport(e instanceof Error ? e.message : String(e));
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
    // Re-dry-run con parches de decisión (deducible confirmado) + autorización O7.
    const parches = insumos.crudos.map((_, i) => {
      const rec = run.registros.find((r) => r.indiceOrigen === i);
      const ded = rec ? decisiones[rec.fingerprint]?.deducible : undefined;
      return ded === undefined ? null : { deducible: ded };
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
      setErrorImport(e instanceof Error ? e.message : String(e));
    } finally {
      setPromocionando(false);
    }
  };

  const onExportar = async (): Promise<void> => {
    setExpError(null); setExpInfo(null); setExpGenerando(true);
    try {
      const fuentes = await cargarFuentesCatalogo(scope);
      const porProp = (p: string) => p.trim();
      const solicitado: AmbitoExportacionSolicitado = {
        entidad: expEntidad,
        propietarioIds: expProps.split(',').map(porProp).filter(Boolean),
        inmuebleIds: expInms.split(',').map(porProp).filter(Boolean),
        ejercicios: expEjercicios.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n)),
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
      descargar(
        `export_${expEntidad.toLowerCase()}_${exp.exportRunId}.${expFormato.toLowerCase()}`,
        exp.contenido,
        expFormato === 'JSON' ? 'application/json' : 'text/csv',
      );
      setExpInfo(`${exp.recordCount} registro(s) · run ${exp.exportRunId} · sha256 ${exp.sha256.slice(0, 16)}…`);
    } catch (e) {
      setExpError(e instanceof Error ? e.message : String(e));
    } finally {
      setExpGenerando(false);
    }
  };

  const pendientes = run?.registros.filter((r) => r.decision !== 'AUTO') ?? [];
  const autos = run?.registros.filter((r) => r.decision === 'AUTO') ?? [];

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
          <FileJson className="w-5 h-5 text-emerald-600" />
          <h3>Importación / Exportación canónica (erp-import-export-v1)</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPestana('importar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${pestana === 'importar' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            Importar
          </button>
          <button type="button" onClick={() => setPestana('exportar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${pestana === 'exportar' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
            Exportar
          </button>
        </div>
      </div>

      {pestana === 'importar' && (
        <div className="space-y-3 text-xs">
          <p className="text-slate-600 leading-relaxed">
            PASO 1–3: elige archivo (JSON/CSV) y tipo de datos. PASO 4: <strong>Analizar</strong> ejecuta un dry-run
            puro (0 escrituras). PASO 5–6: revisa el resumen y los problemas. PASO 7: promociona solo autorizados.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center gap-2">
              <Upload className="w-4 h-4" /> {fichero ? fichero.nombre : 'Seleccionar archivo'}
            </button>
            <input ref={fileRef} type="file" accept=".json,.csv" className="hidden"
              onChange={(e) => void onElegirFichero(e.target.files?.[0])} />
            <span className="text-slate-500">Formato: <strong>{formato ?? '—'}</strong></span>
            <label className="text-slate-500">Entidad:
              <select value={entidad} onChange={(e) => setEntidad(e.target.value)}
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700">
                {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void onAnalizar()} disabled={!fichero || analizando}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold">
              {analizando ? 'Analizando…' : 'Analizar (dry-run)'}
            </button>
          </div>
          {fichero && <p className="text-slate-500 font-mono">sha256: {fichero.hash.slice(0, 32)}… ({fichero.bytes.length} bytes)</p>}
          {errorImport && <div className="p-3 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 font-semibold">{errorImport}</div>}
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
              {run.camposDesconocidos.length > 0 && (
                <p className="text-slate-600">Campos desconocidos (ignorados, no fatales): {run.camposDesconocidos.map((c) => `${c.campo}×${c.registros}`).join(', ')}</p>
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
              {autos.length > 0 && (
                <div className="space-y-2">
                  <p className="font-bold text-slate-900">Decisiones de promoción (B1 G-13: sin decisión no se promociona)</p>
                  <ul className="max-h-48 overflow-auto space-y-2">
                    {autos.filter((a) => a.entityType === 'GASTO' || a.entityType === 'COBRO').map((a) => (
                      <li key={a.fingerprint} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                        <label className="flex items-center gap-1 font-semibold text-slate-700">
                          <input type="checkbox" className="w-4 h-4"
                            checked={seleccion === null || seleccion.includes(a.fingerprint)}
                            onChange={(e) => {
                              const pool = autos.filter((x) => x.entityType === 'GASTO' || x.entityType === 'COBRO').map((x) => x.fingerprint);
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
                    <button type="button" onClick={onAutorizar}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Autorizar (O7)
                    </button>
                    {autorizacion && (
                      <span className="px-3 py-2 rounded-xl font-bold bg-slate-100 text-slate-700">
                        {autorizacion.decision}: {autorizacion.motivo}
                      </span>
                    )}
                  </div>
                  {autorizables && <p className="text-slate-600">Elegibles O7 (pre-decisión fiscal): {autorizables.elegibles.length} · excluidos: {autorizables.excluidos.length}</p>}
                  {autorizacion && <p className="text-slate-600">Incluidos O7: {autorizacion.incluidos.length} · excluidos: {autorizacion.excluidos.length}</p>}
                  <button type="button" onClick={() => void onPromocionar()}
                    disabled={!autorizacion || autorizacion.decision !== 'CONCEDIDA' || !identidad || promocionando}
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
              <select value={expFormato} onChange={(e) => setExpFormato(e.target.value as 'JSON' | 'CSV')}
                className="ml-1 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700">
                <option value="JSON">JSON canónico</option>
                <option value="CSV">CSV</option>
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
          <button type="button" onClick={() => void onExportar()} disabled={expGenerando}
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
