/** BLOQUE E — Inicio del portal: vivienda, renta del mes y accesos rápidos. */
import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, FileText, Mail, Wrench, Zap } from 'lucide-react';
import type { ContratoFormalizacion, Incidencia, Inmueble, Suministro, UsuarioApp } from '../../types';

interface Props {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  inmueble: Inmueble | null;
  incidencias: Incidencia[];
  mensajesNoLeidos: number;
  suministros: Suministro[];
  ir: (pantalla: 'recibos' | 'incidencias' | 'suministros' | 'mensajes' | 'contrato') => void;
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

      {/* Avisos */}
      {(abiertas > 0 || mensajesNoLeidos > 0) && (
        <section className="space-y-2">
          {abiertas > 0 && (
            <button
              onClick={() => ir('incidencias')}
              className="w-full flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-left cursor-pointer"
            >
              <Wrench className="w-5 h-5 text-amber-700 shrink-0" />
              <span className="text-xs font-bold text-amber-900">
                Tienes {abiertas} {abiertas === 1 ? 'avería abierta' : 'averías abiertas'} en seguimiento
              </span>
            </button>
          )}
          {mensajesNoLeidos > 0 && (
            <button
              onClick={() => ir('mensajes')}
              className="w-full flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-left cursor-pointer"
            >
              <Mail className="w-5 h-5 text-indigo-700 shrink-0" />
              <span className="text-xs font-bold text-indigo-900">
                {mensajesNoLeidos} {mensajesNoLeidos === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} de gestión
              </span>
            </button>
          )}
        </section>
      )}

      {/* Accesos rápidos */}
      <section className="grid grid-cols-2 gap-2">
        {(
          [
            { id: 'incidencias', icono: Wrench, titulo: 'Notificar avería', desc: 'Con fotos' },
            { id: 'suministros', icono: Zap, titulo: 'Dar lectura', desc: `${suministros.length} suministros` },
            { id: 'mensajes', icono: Mail, titulo: 'Mensajes', desc: 'Habla con gestión' },
            { id: 'contrato', icono: FileText, titulo: 'Mi contrato', desc: 'Condiciones y fianza' },
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
