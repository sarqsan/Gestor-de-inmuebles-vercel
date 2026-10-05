/** BLOQUE E — Inicio del portal: vivienda, renta del mes y accesos rápidos.
 *  J.3 — Portada «Mi vivienda»: situación del contrato, qué requiere atención
 *  y acciones principales. Todo se deriva de datos que YA llegan al portal:
 *  no se añade ninguna consulta ni se toca `usePortalInquilino`. */
import React, { useMemo } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileText,
  Mail,
  Receipt,
  ShieldCheck,
  User,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ContratoFormalizacion, Incidencia, Inmueble, Suministro, UsuarioApp } from '../../types';
import { etiquetaEstadoContrato, tonoEstadoContrato } from './estadoContrato';

type DestinoPortada =
  | 'recibos'
  | 'incidencias'
  | 'suministros'
  | 'mensajes'
  | 'contrato'
  | 'cuenta';

interface Props {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  inmueble: Inmueble | null;
  incidencias: Incidencia[];
  mensajesNoLeidos: number;
  suministros: Suministro[];
  ir: (pantalla: DestinoPortada) => void;
}

/** Fecha en formato corto español. Devuelve null si no es una fecha utilizable. */
function fmtFechaCorta(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES');
}

export const PortalInicio: React.FC<Props> = ({
  usuario, contrato, inmueble, incidencias, mensajesNoLeidos, suministros, ir,
}) => {
  const periodoActual = useMemo(() => {
    const f = new Date();
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const cobroMes = (contrato.registroCobros || []).find((c) => c.periodoMesAnio === periodoActual);
  const abiertas = incidencias.filter((i) => i.estado !== 'CERRADA' && i.estado !== 'RESUELTA').length;
  const foto = inmueble?.imagenUrl || inmueble?.images?.[0]?.downloadURL;
  const nombre = (usuario.nombre || 'Inquilino').split(' ')[0];

  const pagado = cobroMes && (cobroMes.estado === 'RECIBIDO' || cobroMes.estado === 'VERIFICADO');
  const retrasado = cobroMes?.estado === 'RETRASADO';
  const pendienteSinRetraso = !!cobroMes && !pagado && !retrasado;

  // J.3 NIVEL 2 — Situación del contrato. Sólo datos inequívocos del propio
  // contrato ya cargado; las fechas opcionales se omiten si no son válidas.
  const estadoContratoTexto = etiquetaEstadoContrato(contrato.estado);
  const estadoContratoTono = tonoEstadoContrato(contrato.estado);
  const fechaInicio = fmtFechaCorta(contrato.fechaInicioContrato);
  const fechaFin = fmtFechaCorta(contrato.fechaFinContrato);
  const diaPago =
    typeof contrato.diaLimitePagoMes === 'number' && contrato.diaLimitePagoMes > 0
      ? contrato.diaLimitePagoMes
      : null;

  // J.3 NIVEL 3 — Qué requiere atención (acción real del inquilino) frente a
  // qué es sólo informativo (en curso, no requiere que haga nada ahora).
  const requiereAtencion = useMemo(() => {
    const items: { id: string; texto: string; destino: DestinoPortada }[] = [];
    if (retrasado) {
      items.push({
        id: 'recibo-retrasado',
        texto: 'Tu recibo de este mes figura como retrasado',
        destino: 'recibos',
      });
    }
    if (mensajesNoLeidos > 0) {
      items.push({
        id: 'mensajes',
        texto:
          mensajesNoLeidos === 1
            ? 'Tienes 1 mensaje nuevo de gestión'
            : `Tienes ${mensajesNoLeidos} mensajes nuevos de gestión`,
        destino: 'mensajes',
      });
    }
    return items;
  }, [retrasado, mensajesNoLeidos]);

  const soloInformativo = useMemo(() => {
    const items: { id: string; texto: string; destino: DestinoPortada }[] = [];
    if (pendienteSinRetraso) {
      items.push({
        id: 'recibo-pendiente',
        texto: diaPago
          ? `Tu recibo de este mes está pendiente (vence el día ${diaPago})`
          : 'Tu recibo de este mes está pendiente',
        destino: 'recibos',
      });
    }
    if (abiertas > 0) {
      items.push({
        id: 'averias',
        texto:
          abiertas === 1
            ? 'Tienes 1 avería en seguimiento'
            : `Tienes ${abiertas} averías en seguimiento`,
        destino: 'incidencias',
      });
    }
    return items;
  }, [pendienteSinRetraso, diaPago, abiertas]);

  const sinNadaPendiente = requiereAtencion.length === 0 && soloInformativo.length === 0;

  return (
    <div className="space-y-4">
      {/* Tarjeta vivienda */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {foto && <img src={foto} alt="Mi vivienda" className="w-full h-36 object-cover" />}
        <div className="p-4">
          <p className="text-xs text-slate-500 font-medium">Hola, {nombre}</p>
          <h2 className="text-base font-extrabold leading-snug">{contrato.inmuebleDireccion}</h2>
          <p className="text-xs text-slate-500">
            {contrato.inmuebleCiudad}
            {contrato.modalidadAlquiler === 'habitaciones' && contrato.habitacionIdentificador
              ? ` · Habitación ${contrato.habitacionIdentificador}`
              : ''}
          </p>
          <div className="mt-3 flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-bold">Renta mensual</p>
              <p className="text-xl font-black text-indigo-800">{contrato.rentaMensual.toFixed(2)} €</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-bold">Este mes</p>
              {cobroMes ? (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                    pagado ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {pagado ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                  {pagado ? 'Pagado' : cobroMes.estado === 'RETRASADO' ? 'Retrasado' : 'Pendiente'}
                </span>
              ) : (
                <span className="text-xs text-slate-400 font-medium">Sin recibo generado</span>
              )}
            </div>
          </div>
          <button
            onClick={() => ir('recibos')}
            className="mt-3 w-full flex items-center justify-center gap-1 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold rounded-xl cursor-pointer"
          >
            Ver recibos y cómo pagar <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* J.3 NIVEL 2 — Situación de mi contrato */}
      <section
        className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"
        data-testid="portada-situacion-contrato"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold">Situación de tu contrato</h3>
          <span
            className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${
              estadoContratoTono === 'activo'
                ? 'bg-emerald-100 text-emerald-800'
                : estadoContratoTono === 'tramite'
                  ? 'bg-amber-100 text-amber-800'
                  : estadoContratoTono === 'cerrado'
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-slate-100 text-slate-600'
            }`}
            data-testid="portada-estado-contrato"
          >
            {estadoContratoTexto}
          </span>
        </div>
        <dl className="mt-3 space-y-1.5">
          {fechaInicio && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" /> Desde
              </dt>
              <dd className="text-xs font-bold">{fechaInicio}</dd>
            </div>
          )}
          {fechaFin && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" /> Hasta
              </dt>
              <dd className="text-xs font-bold">{fechaFin}</dd>
            </div>
          )}
          {diaPago && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-slate-400" /> Día de pago
              </dt>
              <dd className="text-xs font-bold">Antes del {diaPago} de cada mes</dd>
            </div>
          )}
        </dl>
        <button
          onClick={() => ir('contrato')}
          className="mt-3 w-full flex items-center justify-center gap-1 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-xl cursor-pointer"
        >
          Ver todas las condiciones <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* J.3 NIVEL 3 — Qué requiere tu atención / información */}
      {sinNadaPendiente ? (
        <section
          className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3"
          data-testid="portada-todo-en-orden"
        >
          <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-900 leading-tight">Todo está en orden</p>
            <p className="text-xs text-emerald-800/80 mt-0.5">
              No tienes recibos retrasados, mensajes sin leer ni averías en curso.
            </p>
          </div>
        </section>
      ) : (
        <>
          {requiereAtencion.length > 0 && (
            <section className="space-y-2" data-testid="portada-requiere-atencion">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                Requiere tu atención
              </h3>
              {requiereAtencion.map((item) => (
                <button
                  key={item.id}
                  onClick={() => ir(item.destino)}
                  data-testid={`portada-atencion-${item.id}`}
                  className="w-full flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-left cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span className="text-xs font-bold text-red-900 flex-1">{item.texto}</span>
                  <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
                </button>
              ))}
            </section>
          )}
          {soloInformativo.length > 0 && (
            <section className="space-y-2" data-testid="portada-informacion">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                Información
              </h3>
              {soloInformativo.map((item) => (
                <button
                  key={item.id}
                  onClick={() => ir(item.destino)}
                  data-testid={`portada-info-${item.id}`}
                  className="w-full flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-left cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <Wrench className="w-5 h-5 text-slate-500 shrink-0" />
                  <span className="text-xs font-bold text-slate-700 flex-1">{item.texto}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </section>
          )}
        </>
      )}

      {/* J.3 NIVEL 4 — Acciones principales. Mismo destino que las vistas que
          ya existen en el Shell; no se crea ningún flujo nuevo. El orden sigue
          la prioridad de J.3 §10 y conserva «Dar lectura» para no perder
          ninguna capacidad previa. */}
      <section className="grid grid-cols-2 gap-2" data-testid="portada-acciones-inquilino">
        {(
          [
            { id: 'contrato', icono: FileText, titulo: 'Mi contrato', desc: 'Condiciones y fianza' },
            { id: 'recibos', icono: Receipt, titulo: 'Mis pagos', desc: 'Justificantes y cómo pagar' },
            { id: 'incidencias', icono: Wrench, titulo: 'Notificar avería', desc: 'Con fotos' },
            { id: 'mensajes', icono: Mail, titulo: 'Mensajes', desc: 'Habla con gestión' },
            { id: 'suministros', icono: Zap, titulo: 'Dar lectura', desc: `${suministros.length} suministros` },
            { id: 'cuenta', icono: User, titulo: 'Mi cuenta', desc: 'Tus datos de acceso' },
          ] as const
        ).map((a) => (
          <button
            key={a.id}
            onClick={() => ir(a.id)}
            className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm text-left cursor-pointer active:scale-[0.98] transition-transform"
          >
            <a.icono className="w-6 h-6 text-indigo-700" />
            <span className="block mt-2 text-sm font-bold">{a.titulo}</span>
            <span className="block text-xs text-slate-500">{a.desc}</span>
          </button>
        ))}
      </section>
    </div>
  );
};
