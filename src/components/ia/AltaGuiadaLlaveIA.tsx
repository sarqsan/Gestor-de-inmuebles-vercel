/**
 * IA · FASE 9 — ALTA GUIADA DE LA LLAVE PROPIA (Configuración)
 * =============================================================
 * Pantalla del usuario (cualquier perfil) para registrar, sustituir, revocar
 * y —si el entorno lo permite— comprobar SU clave de Google AI Studio
 * (§11.2 del diseño). Todo lo decide el servidor (`server/ia/rutasLlavesIA.ts`):
 * aquí sólo se valida la FORMA de la clave antes de enviarla, se muestra el
 * estado sin secretos (estado, sufijo, fechas) y se ofrece el tutorial
 * imprimible (§11.2.8). La clave no se guarda en el navegador: vive en el
 * estado del campo mientras se escribe y se descarta al enviar.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { KeyRound, ShieldCheck, FileDown, Printer, ExternalLink, Trash2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  llaveActiva,
  validarFormatoLlaveProveedorIA,
  type ResumenLlaveUsuarioIA,
} from '../../ia/llavesUsuarioContrato';
import { TUTORIAL_LLAVE_USUARIO_IA, URL_OFICIAL_CLAVES_AI_STUDIO } from '../../ia/tutorialLlaveUsuarioIA';
import {
  cargarEstadoLlaveIA,
  registrarLlaveIA,
  revocarLlaveIA,
  verificarLlaveIA,
  type EstadoSubsistemaLlavesDTO,
  type OpcionesLlavesUsuarioIA,
  type ResultadoLlaveUsuarioIA,
} from '../../lib/llavesUsuarioIA';
import { abrirTutorialLlaveUsuarioParaImprimir, descargarTutorialLlaveUsuarioPdf } from '../../utils/tutorialLlaveUsuarioPdf';

export interface AltaGuiadaLlaveIAProps {
  /** Inyección para pruebas (fetch y token). */
  opciones?: OpcionesLlavesUsuarioIA;
  /** Inyección para pruebas del PDF. */
  descargarPdf?: () => void;
  imprimirPdf?: () => boolean;
}

interface EstadoPantalla {
  cargando: boolean;
  subsistema: EstadoSubsistemaLlavesDTO | null;
  llave: ResumenLlaveUsuarioIA | null;
  noDisponible: { codigo?: string; error?: string } | null;
  mensaje: string | null;
  error: string | null;
  enviando: boolean;
}

const fechaCorta = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleString();
};

function EtiquetaEstadoLlave({ estado }: { estado: ResumenLlaveUsuarioIA['estado'] }): ReactElement {
  const clase = estado === 'VERIFICADA'
    ? 'bg-emerald-100 text-emerald-700'
    : estado === 'REGISTRADA'
      ? 'bg-blue-100 text-blue-700'
      : estado === 'REVOCADA'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600';
  return <span data-testid="estado-llave" className={`rounded px-2 py-0.5 text-[11px] font-semibold ${clase}`}>{estado}</span>;
}

function textoResultado(resultado: ResultadoLlaveUsuarioIA): string {
  if (resultado.error) return resultado.error;
  if (resultado.codigo) return `Error ${resultado.status} (${resultado.codigo}).`;
  return `Error ${resultado.status}.`;
}

export function AltaGuiadaLlaveIA({ opciones = {}, descargarPdf, imprimirPdf }: AltaGuiadaLlaveIAProps): ReactElement {
  const [estado, setEstado] = useState<EstadoPantalla>({
    cargando: true, subsistema: null, llave: null, noDisponible: null, mensaje: null, error: null, enviando: false,
  });
  const [valor, setValor] = useState('');
  const [avisoFormato, setAvisoFormato] = useState<string | null>(null);
  const [confirmarRevocacion, setConfirmarRevocacion] = useState(false);

  const cargar = useCallback(async () => {
    setEstado((previo) => ({ ...previo, cargando: true, error: null }));
    try {
      const respuesta = await cargarEstadoLlaveIA(opciones);
      if (respuesta.ok === false) {
        const { codigo, error } = respuesta.resultado;
        setEstado((previo) => ({ ...previo, cargando: false, noDisponible: { codigo, error } }));
        return;
      }
      const { llaves, llave } = respuesta.datos;
      setEstado((previo) => ({ ...previo, cargando: false, subsistema: llaves, llave, noDisponible: null }));
    } catch {
      setEstado((previo) => ({ ...previo, cargando: false, error: 'No se ha podido consultar el estado de tu llave de IA.' }));
    }
  }, [opciones]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async () => {
    const formato = validarFormatoLlaveProveedorIA(valor);
    if (formato.estado === 'INVALIDA') {
      setAvisoFormato(formato.mensaje);
      return;
    }
    setAvisoFormato(null);
    setEstado((previo) => ({ ...previo, enviando: true, mensaje: null, error: null }));
    const resultado = await registrarLlaveIA(formato.valor, opciones);
    setValor('');
    if (resultado.ok && resultado.llave) {
      setEstado((previo) => ({
        ...previo,
        enviando: false,
        llave: resultado.llave ?? previo.llave,
        subsistema: resultado.llaves ?? previo.subsistema,
        mensaje: resultado.estado === 'SIN_CAMBIOS' ? 'Esa clave ya estaba registrada: no hay cambios.' : 'Clave guardada cifrada. Ya puedes usar la IA con tu cuenta.',
      }));
    } else {
      setEstado((previo) => ({ ...previo, enviando: false, error: textoResultado(resultado) }));
    }
  };

  const revocar = async () => {
    setConfirmarRevocacion(false);
    setEstado((previo) => ({ ...previo, enviando: true, mensaje: null, error: null }));
    const resultado = await revocarLlaveIA(opciones);
    if (resultado.ok && resultado.llave) {
      setEstado((previo) => ({ ...previo, enviando: false, llave: resultado.llave ?? previo.llave, mensaje: 'Clave revocada. Si sospechas una filtración, elimínala también en Google AI Studio.' }));
    } else {
      setEstado((previo) => ({ ...previo, enviando: false, error: textoResultado(resultado) }));
    }
  };

  const verificar = async () => {
    setEstado((previo) => ({ ...previo, enviando: true, mensaje: null, error: null }));
    const resultado = await verificarLlaveIA(opciones);
    if (resultado.ok && resultado.llave) {
      setEstado((previo) => ({ ...previo, enviando: false, llave: resultado.llave ?? previo.llave, mensaje: 'El proveedor ha confirmado tu clave.' }));
    } else {
      setEstado((previo) => ({ ...previo, enviando: false, llave: resultado.llave ?? previo.llave, error: textoResultado(resultado) }));
    }
  };

  const descargar = descargarPdf ?? descargarTutorialLlaveUsuarioPdf;
  const imprimir = imprimirPdf ?? abrirTutorialLlaveUsuarioParaImprimir;
  const activa = estado.llave ? llaveActiva(estado.llave) : false;
  const verificacionDisponible = estado.subsistema?.verificacion === 'PROVEEDOR';

  return (
    <section className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4" aria-labelledby="titulo-llave-ia">
      <h3 id="titulo-llave-ia" className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-blue-600" />
        Llave de IA (clave propia)
      </h3>

      <p className="text-xs text-slate-600">
        {TUTORIAL_LLAVE_USUARIO_IA.introduccion[1]}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => descargar()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <FileDown className="w-3.5 h-3.5" /> Descargar tutorial en PDF
        </button>
        <button type="button" onClick={() => imprimir()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </button>
        <a href={URL_OFICIAL_CLAVES_AI_STUDIO} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">
          <ExternalLink className="w-3.5 h-3.5" /> Abrir Google AI Studio
        </a>
      </div>

      {estado.cargando && <p className="text-xs text-slate-500" role="status">Consultando el estado de tu llave…</p>}

      {!estado.cargando && estado.noDisponible && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2" role="status">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <div>
            <p className="font-semibold">El alta de llaves propias no está disponible en este entorno.</p>
            <p>{estado.noDisponible.error ?? 'Vuelve a intentarlo más tarde.'}{estado.noDisponible.codigo ? ` (${estado.noDisponible.codigo})` : ''}</p>
            <p className="mt-1">Puedes descargar igualmente el tutorial para tener la clave preparada.</p>
          </div>
        </div>
      )}

      {!estado.cargando && estado.error && !estado.noDisponible && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{estado.error}</p>
      )}
      {estado.mensaje && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 flex items-center gap-1.5" role="status">
          <CheckCircle2 className="w-3.5 h-3.5" /> {estado.mensaje}
        </p>
      )}

      {!estado.cargando && estado.llave && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
            <div className="rounded-xl bg-slate-50 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Estado</span>
                <EtiquetaEstadoLlave estado={estado.llave.estado} />
              </div>
              <div>Clave: <span className="font-mono">{estado.llave.sufijo ? `…${estado.llave.sufijo}` : '—'}</span></div>
              <div>Alta: {fechaCorta(estado.llave.registradaEn)}</div>
              <div>Verificada: {fechaCorta(estado.llave.verificadaEn)}{estado.llave.ultimaVerificacion === 'FALLIDA' ? ' (última comprobación fallida)' : ''}</div>
              {estado.llave.revocadaEn && <div>Revocada: {fechaCorta(estado.llave.revocadaEn)}</div>}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 space-y-1">
              <div className="font-semibold flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Cómo se protege</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Se guarda cifrada en el servidor y nunca se muestra.</li>
                <li>Sólo se usa para tus operaciones; los límites del Gestor siguen aplicándose.</li>
                <li>Si no tienes clave: {estado.subsistema?.sinLlave === 'EXIGIR' ? 'la IA te la pedirá antes de ejecutar nada.' : 'las funciones de IA responden en modo básico.'}</li>
              </ul>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="campo-llave-ia" className="block text-xs font-semibold text-slate-700">
              {activa ? 'Sustituir por otra clave' : 'Tu clave de API (empieza por AIza)'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="campo-llave-ia"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={valor}
                onChange={(e) => { setValor(e.target.value); if (avisoFormato) setAvisoFormato(null); }}
                placeholder="Pega aquí la clave copiada de Google AI Studio"
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={estado.enviando || valor.trim() === ''}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <KeyRound className="w-3.5 h-3.5" /> Guardar clave
              </button>
            </div>
            {avisoFormato && <p className="text-xs text-rose-600" role="alert">{avisoFormato}</p>}
          </div>

          {activa && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void verificar()}
                disabled={estado.enviando || !verificacionDisponible}
                title={verificacionDisponible ? 'Consulta mínima al proveedor para confirmar la clave' : 'Desactivada en este entorno: la primera operación de IA servirá de comprobación'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Comprobar con el proveedor
              </button>
              {!confirmarRevocacion ? (
                <button type="button" onClick={() => setConfirmarRevocacion(true)} disabled={estado.enviando} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" /> Revocar
                </button>
              ) : (
                <span className="inline-flex items-center gap-2 text-xs text-rose-700">
                  ¿Seguro? La IA dejará de funcionar con tu cuenta.
                  <button type="button" onClick={() => void revocar()} className="rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white">Sí, revocar</button>
                  <button type="button" onClick={() => setConfirmarRevocacion(false)} className="rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700">Cancelar</button>
                </span>
              )}
              {!verificacionDisponible && (
                <span className="self-center text-[11px] text-slate-500">La comprobación con el proveedor está desactivada en este entorno.</span>
              )}
            </div>
          )}
        </>
      )}

      <details className="rounded-xl border border-slate-100 p-3 text-xs text-slate-700">
        <summary className="cursor-pointer font-semibold">Pasos del alta guiada</summary>
        <ol className="mt-2 space-y-2 list-decimal pl-5">
          {TUTORIAL_LLAVE_USUARIO_IA.pasos.map((paso) => (
            <li key={paso.clave}>
              <span className="font-semibold">{paso.titulo}.</span>{' '}
              {paso.detalle.join(' ')}
              {paso.enlace && (
                <>
                  {' '}
                  <a href={paso.enlace} target="_blank" rel="noreferrer noopener" className="text-blue-700 underline">{paso.enlace}</a>
                </>
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
