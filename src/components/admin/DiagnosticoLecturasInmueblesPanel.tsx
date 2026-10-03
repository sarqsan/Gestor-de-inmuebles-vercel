import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import type { AuditLog, UsuarioApp } from '../../types';
import { ADMIN_MASTER_EMAIL } from '../../lib/authService';
import {
  incidenciasDesdeAuditLogs,
  incidenciasLecturaInmueblesLocales,
  limpiarIncidenciasLecturaInmueblesLocales,
  suscribirIncidenciasLecturaInmuebles,
  type IncidenciaLecturaInmuebles,
} from '../../lib/observabilidadLecturaInmuebles';

/**
 * «Diagnóstico de lecturas de Inmuebles» — pantalla de administración.
 *
 * QUÉ RESUELVE
 *  El aviso «Lectura · Inmuebles: No tienes permisos…» no distingue CUÁL de las cinco
 *  lecturas falló. Las incidencias se registran en el libro de auditoría existente
 *  (`audit_logs`) con la etiqueta `DIAGNOSTICO_LECTURA_INMUEBLES`; esta pantalla las
 *  presenta para que la próxima vez se identifique el origen exacto sin reproducciones
 *  manuales.
 *
 * QUIÉN PUEDE VERLA
 *  Solo el administrador principal, que es exactamente lo que ya exigen las Rules
 *  (`allow read: if isMasterAdmin()`). La comprobación del cliente es un espejo de esa
 *  regla, no una autorización: si no coincide, la pantalla no muestra datos.
 *
 * QUÉ NO HACE
 *  · No consulta Firestore por su cuenta: recibe los `audit_logs` que App ya suscribe
 *    para administración (cero consultas nuevas, cero índices nuevos).
 *  · No borra ni modifica el libro remoto (es inmutable por diseño): «Limpiar» solo
 *    vacía la copia local de ESTE dispositivo.
 *  · Nunca mezcla entornos: producción (sesiones reales) y desarrollo (vista previa/Arena)
 *    se muestran en bloques separados, y las incidencias locales aún no confirmadas
 *    tienen su propio bloque.
 */

/** Espejo exacto de `isMasterAdmin()` de `firestore.rules` (email de sesión + perfil). */
export function puedeConsultarDiagnosticoLecturas(usuario: UsuarioApp | null | undefined, emailSesion?: string | null): boolean {
  if (!usuario) return false;
  if (usuario.tipoPerfil !== 'ADMINISTRADOR') return false;
  const normal = (v: string | null | undefined) => (v || '').trim().toLowerCase();
  if (normal(usuario.email) !== ADMIN_MASTER_EMAIL) return false;
  if (emailSesion !== undefined && emailSesion !== null && normal(emailSesion) !== ADMIN_MASTER_EMAIL) return false;
  return true;
}

const ORIGENES = ['INM-OWN', 'INM-COT', 'INM-GEST', 'INM-ID', 'INM-ADMIN'] as const;

const identificador = (id: { prefijo: string; huella: string } | null): string =>
  id ? `${id.prefijo}…[${id.huella}]` : '—';

const fecha = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

interface FilaProps {
  incidencia: IncidenciaLecturaInmuebles;
  estado: string;
  abierta: boolean;
  onAlternar: () => void;
}

const FilaIncidencia: React.FC<FilaProps> = ({ incidencia, estado, abierta, onAlternar }) => (
  <div className="border-b border-slate-100 last:border-b-0">
    <button
      type="button"
      onClick={onAlternar}
      data-testid="incidencia-fila"
      data-origen={incidencia.origen}
      className="w-full text-left px-4 py-2.5 hover:bg-slate-50/70 transition-colors flex items-start gap-3"
    >
      <span className="shrink-0 mt-0.5 text-slate-400">{abierta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      <span className="shrink-0 font-mono text-[11px] text-slate-500 whitespace-nowrap">{fecha(incidencia.fechaHora)}</span>
      <span className="shrink-0 px-1.5 py-0.5 rounded-sm bg-red-50 text-red-700 font-bold text-[10px]">{incidencia.origen}</span>
      <span className="shrink-0 px-1.5 py-0.5 rounded-sm bg-amber-50 text-amber-800 font-bold text-[10px]">{incidencia.errorCode}</span>
      <span className="min-w-0 flex-1 font-sans text-[11px] text-slate-600 truncate">
        <span className="font-semibold text-slate-700">{incidencia.causa}</span>
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-mono">{incidencia.query || '(sin consulta)'}</span>
      </span>
      <span className="shrink-0 font-mono text-[10px] text-slate-400 whitespace-nowrap">{estado}</span>
    </button>
    {abierta && (
      <dl className="px-10 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] text-slate-600">
        <div><dt className="inline text-slate-400">primera: </dt><dd className="inline">{fecha(incidencia.primerFechaHora)}</dd></div>
        <div><dt className="inline text-slate-400">repeticiones: </dt><dd className="inline">{incidencia.contador}</dd></div>
        <div><dt className="inline text-slate-400">rol: </dt><dd className="inline">{incidencia.rol ?? '—'}</dd></div>
        <div><dt className="inline text-slate-400">uid: </dt><dd className="inline">{identificador(incidencia.uid)}</dd></div>
        <div><dt className="inline text-slate-400">usuario: </dt><dd className="inline">{identificador(incidencia.usuario)}</dd></div>
        <div><dt className="inline text-slate-400">propietarioId: </dt><dd className="inline">{identificador(incidencia.propietarioId)}</dd></div>
        <div><dt className="inline text-slate-400">pidCliente: </dt><dd className="inline">{identificador(incidencia.propietarioIdCliente)}</dd></div>
        <div><dt className="inline text-slate-400">pidEspejo: </dt><dd className="inline">{identificador(incidencia.mirrorPropietarioId)}</dd></div>
        <div><dt className="inline text-slate-400">pidPerfil: </dt><dd className="inline">{identificador(incidencia.profilePropietarioId)}</dd></div>
        <div><dt className="inline text-slate-400">inmuebleId: </dt><dd className="inline">{identificador(incidencia.inmuebleId)}</dd></div>
        <div><dt className="inline text-slate-400">scope: </dt><dd className="inline">inmuebleIds:{incidencia.scope.inmuebleIds},parciales:{incidencia.scope.parciales},carteras:{incidencia.scope.carteras}</dd></div>
        <div><dt className="inline text-slate-400">entorno: </dt><dd className="inline">{incidencia.environment}</dd></div>
        <div><dt className="inline text-slate-400">proyecto: </dt><dd className="inline">{incidencia.proyecto}</dd></div>
        <div><dt className="inline text-slate-400">base: </dt><dd className="inline">{incidencia.baseDeDatos}</dd></div>
        <div className="md:col-span-2"><dt className="inline text-slate-400">mensaje: </dt><dd className="inline">{incidencia.errorMessage || '—'}</dd></div>
        <div className="md:col-span-2"><dt className="inline text-slate-400">término que falla: </dt><dd className="inline">{incidencia.failingTerm ?? '—'}</dd></div>
      </dl>
    )}
  </div>
);

interface BloqueProps {
  titulo: string;
  descripcion: string;
  testid: string;
  incidencias: readonly IncidenciaLecturaInmuebles[];
  estadoDe: (i: IncidenciaLecturaInmuebles) => string;
  abierta: string | null;
  onAlternar: (clave: string) => void;
}

const BloqueIncidencias: React.FC<BloqueProps> = ({ titulo, descripcion, testid, incidencias, estadoDe, abierta, onAlternar }) => (
  <section className="border border-slate-200 rounded-xl overflow-hidden" data-testid={testid}>
    <header className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
      <h4 className="text-xs font-bold text-slate-800">
        {titulo} <span className="text-slate-400 font-normal">({incidencias.length})</span>
      </h4>
      <p className="text-[11px] text-slate-500">{descripcion}</p>
    </header>
    {incidencias.length === 0 ? (
      <p className="px-4 py-4 text-[11px] text-slate-400 italic">Sin incidencias registradas.</p>
    ) : (
      incidencias.map((incidencia) => (
        <FilaIncidencia
          key={`${incidencia.clave}-${incidencia.fechaHora}`}
          incidencia={incidencia}
          estado={estadoDe(incidencia)}
          abierta={abierta === `${incidencia.clave}-${incidencia.fechaHora}`}
          onAlternar={() => onAlternar(`${incidencia.clave}-${incidencia.fechaHora}`)}
        />
      ))
    )}
  </section>
);

export interface DiagnosticoLecturasInmueblesPanelProps {
  auditLogs?: AuditLog[];
  currentUser?: UsuarioApp | null;
  emailSesion?: string | null;
}

export const DiagnosticoLecturasInmueblesPanel: React.FC<DiagnosticoLecturasInmueblesPanelProps> = ({
  auditLogs = [],
  currentUser,
  emailSesion,
}) => {
  const [locales, setLocales] = useState<readonly IncidenciaLecturaInmuebles[]>(() => incidenciasLecturaInmueblesLocales());
  const [origenFiltro, setOrigenFiltro] = useState<string>('TODOS');
  const [codigoFiltro, setCodigoFiltro] = useState<string>('TODOS');
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    setLocales(incidenciasLecturaInmueblesLocales());
    return suscribirIncidenciasLecturaInmuebles(() => setLocales(incidenciasLecturaInmueblesLocales()));
  }, []);

  const remotas = useMemo(() => incidenciasDesdeAuditLogs(auditLogs), [auditLogs]);
  const codigos = useMemo(() => {
    const conjunto = new Set<string>();
    for (const i of [...remotas, ...locales]) conjunto.add(i.errorCode);
    return Array.from(conjunto).sort();
  }, [remotas, locales]);

  const pasaFiltros = (i: IncidenciaLecturaInmuebles) =>
    (origenFiltro === 'TODOS' || i.origen === origenFiltro) && (codigoFiltro === 'TODOS' || i.errorCode === codigoFiltro);

  const masRecientePrimero = (a: IncidenciaLecturaInmuebles, b: IncidenciaLecturaInmuebles) =>
    new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime();

  const produccion = remotas.filter((i) => i.environment === 'production').filter(pasaFiltros).sort(masRecientePrimero);
  const desarrollo = remotas.filter((i) => i.environment !== 'production').filter(pasaFiltros).sort(masRecientePrimero);
  const localesPendientes = locales
    .filter((local) => !remotas.some((r) => r.clave === local.clave && r.fechaHora === local.fechaHora))
    .filter(pasaFiltros)
    .sort(masRecientePrimero);

  const autorizado = puedeConsultarDiagnosticoLecturas(currentUser, emailSesion);
  const alternar = (clave: string) => setAbierta((actual) => (actual === clave ? null : clave));

  return (
    <div className="mt-6 space-y-3" data-testid="diagnostico-lecturas-inmuebles">
      <div className="flex items-start gap-2">
        <ShieldAlert size={16} className="text-red-600 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">Diagnóstico de lecturas de Inmuebles</h3>
          <p className="text-xs text-slate-500">
            Identifica qué lectura concreta recibió el <span className="font-mono">permission-denied</span> sin
            reproducciones manuales. Los registros de producción viven en el libro inmutable de auditoría; los de
            desarrollo se etiquetan y se muestran aparte.
          </p>
        </div>
      </div>

      {!autorizado ? (
        <p className="text-[11px] text-slate-500 border border-slate-200 rounded-xl px-4 py-3">
          Solo el administrador principal puede consultar este diagnóstico (es la misma condición que aplican las
          reglas de Firestore: <span className="font-mono">isMasterAdmin()</span>).
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <label className="flex items-center gap-1 text-slate-500">
              Origen
              <select
                className="border border-slate-200 rounded-md px-2 py-1 text-slate-700"
                value={origenFiltro}
                onChange={(e) => setOrigenFiltro(e.target.value)}
                data-testid="filtro-origen"
              >
                <option value="TODOS">Todos</option>
                {ORIGENES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-slate-500">
              Código
              <select
                className="border border-slate-200 rounded-md px-2 py-1 text-slate-700"
                value={codigoFiltro}
                onChange={(e) => setCodigoFiltro(e.target.value)}
                data-testid="filtro-codigo"
              >
                <option value="TODOS">Todos</option>
                {codigos.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <span className="flex items-center gap-1 text-slate-400">
              <Activity size={12} /> ordenado por fecha (más reciente primero)
            </span>
            {locales.length > 0 && (
              <button
                type="button"
                onClick={() => limpiarIncidenciasLecturaInmueblesLocales()}
                className="ml-auto border border-slate-200 rounded-md px-2 py-1 text-slate-600 hover:bg-slate-50"
                data-testid="limpiar-local"
                title="Vacía solo la copia local de este dispositivo. El libro de auditoría es inmutable."
              >
                Limpiar vista local ({locales.length})
              </button>
            )}
          </div>

          <BloqueIncidencias
            titulo="Errores reales (producción)"
            descripcion="Generados por sesiones reales de la aplicación desplegada."
            testid="diag-produccion"
            incidencias={produccion}
            estadoDe={(i) => (i.contador > 1 ? `x${i.contador}` : 'registrado')}
            abierta={abierta}
            onAlternar={alternar}
          />
          <BloqueIncidencias
            titulo="Errores de desarrollo (vista previa/Arena)"
            descripcion="Nunca cuentan como incidencia real de usuario."
            testid="diag-desarrollo"
            incidencias={desarrollo}
            estadoDe={(i) => (i.contador > 1 ? `x${i.contador}` : 'registrado')}
            abierta={abierta}
            onAlternar={alternar}
          />
          <BloqueIncidencias
            titulo="Pendiente en este dispositivo (sin confirmar)"
            descripcion="Copia local del fallback: si aparece aquí, la escritura remota aún no ha llegado."
            testid="diag-locales"
            incidencias={localesPendientes}
            estadoDe={(i) => (i.contador > 1 ? `local x${i.contador}` : 'local')}
            abierta={abierta}
            onAlternar={alternar}
          />
        </>
      )}
    </div>
  );
};
