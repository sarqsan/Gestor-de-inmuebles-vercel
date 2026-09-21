/**
 * BLOQUE E — Shell del Portal del Inquilino (móvil, distinta del ERP).
 * Pestañas: Inicio · Recibos · Incidencias · Suministros · Más
 * (Más: Mi contrato, Mensajes, Documentos, Historial, Mi cuenta).
 */
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  History,
  Home,
  LogOut,
  Mail,
  MoreHorizontal,
  Receipt,
  RefreshCw,
  User,
  Wrench,
  Zap,
} from 'lucide-react';
import type { UsuarioApp } from '../../types';
import { usePortalInquilino } from './usePortalInquilino';
import { PortalInicio } from './PortalInicio';
import { PortalContrato } from './PortalContrato';
import { PortalRecibos } from './PortalRecibos';
import { PortalIncidencias } from './PortalIncidencias';
import { PortalSuministros } from './PortalSuministros';
import { PortalMensajes } from './PortalMensajes';
import { PortalDocumentos } from './PortalDocumentos';
import { PortalHistorial } from './PortalHistorial';
import { PortalCuenta } from './PortalCuenta';
// CAPA TRANSVERSAL §6 (Fase 2): ayuda contextual y recorridos guiados (misma infraestructura que el ERP)
import { ContextualHelp } from '../experiencia/ContextualHelp';
import { TutorialPlayer } from '../experiencia/TutorialPlayer';
import { servicioProgresoTutoriales } from '../../lib/progresoTutorialesFirestore';
import { contextoDesdeUsuario, iniciarTutorial, obtenerTutorial, PANTALLAS_PORTAL } from '../../experiencia';
import type { SesionTutorial } from '../../experiencia';

type PantallaPortal =
  | 'inicio'
  | 'recibos'
  | 'incidencias'
  | 'suministros'
  | 'mas'
  | 'contrato'
  | 'mensajes'
  | 'documentos'
  | 'historial'
  | 'cuenta';

interface Props {
  usuario: UsuarioApp;
  onLogout: () => void;
}

const TITULOS: Record<PantallaPortal, string> = {
  inicio: 'Mi hogar',
  recibos: 'Recibos y pagos',
  incidencias: 'Incidencias',
  suministros: 'Suministros',
  mas: 'Más opciones',
  contrato: 'Mi contrato',
  mensajes: 'Mensajes',
  documentos: 'Documentos',
  historial: 'Historial',
  cuenta: 'Mi cuenta',
};

export const InquilinoPortalShell: React.FC<Props> = ({ usuario, onLogout }) => {
  const [pantalla, setPantalla] = useState<PantallaPortal>('inicio');
  const [contratoSel, setContratoSel] = useState<string | null>(null);
  const portal = usePortalInquilino(usuario);
  // §6 F2/F3: sesión de recorrido en memoria (estado UI); progreso persistido por servicioProgresoTutoriales
  const [sesionTutorial, setSesionTutorial] = useState<SesionTutorial | null>(null);
  const tutorialActivo = sesionTutorial ? obtenerTutorial(sesionTutorial.tutorialId) : undefined;
  const iniciarRecorrido = (id: string) => {
    const t = obtenerTutorial(id);
    if (t) setSesionTutorial(iniciarTutorial(t));
  };

  const contratos = portal.contratos;
  const contratoActivo = useMemo(
    () => contratos.find((c) => c.id === contratoSel) || contratos[0] || null,
    [contratos, contratoSel]
  );
  const inmuebleActivo = useMemo(
    () => portal.inmuebles.find((v) => v.id === contratoActivo?.inmuebleId) || portal.inmuebles[0] || null,
    [portal.inmuebles, contratoActivo]
  );

  const noLeidos = portal.mensajes.filter(
    (m) => m.remitenteRol === 'GESTION' && m.leidoPorInquilino !== true
  ).length;

  const ir = (p: PantallaPortal) => {
    setPantalla(p);
    window.scrollTo({ top: 0 });
  };

  const esSubvista = ['contrato', 'mensajes', 'documentos', 'historial', 'cuenta'].includes(pantalla);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-md mx-auto min-h-screen bg-slate-100 shadow-xl flex flex-col">
        {/* Cabecera del portal (identidad propia, distinta del ERP) */}
        <header className="bg-gradient-to-br from-indigo-700 via-indigo-800 to-violet-900 text-white px-5 pt-5 pb-6 rounded-b-3xl shadow-lg sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {esSubvista && (
                <button
                  onClick={() => ir('mas')}
                  className="p-1.5 -ml-1 rounded-full hover:bg-white/10 cursor-pointer"
                  aria-label="Volver"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <p className="text-[11px] uppercase tracking-widest text-indigo-200 font-semibold">
                  Portal del inquilino
                </p>
                <h1 className="text-lg font-extrabold leading-tight">{TITULOS[pantalla]}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {contratoActivo && (
                <ContextualHelp
                  usuario={usuario}
                  host="PORTAL_INQUILINO"
                  section={pantalla}
                  entityType="contrato"
                  entityId={contratoActivo.id}
                  state={contratoActivo.estado}
                  onIniciarTutorial={iniciarRecorrido}
                  tema="oscuro"
                />
              )}
              <button
                onClick={() => portal.recargar()}
                className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
                aria-label="Actualizar"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${portal.loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onLogout}
                className="p-2 rounded-full hover:bg-white/10 cursor-pointer"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {inmuebleActivo && (
            <p className="mt-2 text-xs text-indigo-100 font-medium truncate">
              {inmuebleActivo.direccion} · {inmuebleActivo.ciudad}
            </p>
          )}

          {contratos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {contratos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setContratoSel(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                    (contratoActivo?.id || contratos[0]?.id) === c.id
                      ? 'bg-white text-indigo-900'
                      : 'bg-white/15 text-white hover:bg-white/25'
                  }`}
                >
                  {c.inmuebleDireccion || c.id}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Contenido */}
        <main className="flex-1 px-4 py-4 pb-24">
          {portal.loading && portal.contratos.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">Cargando tu portal…</div>
          ) : portal.error && portal.contratos.length === 0 ? (
            <div className="mt-6 p-4 bg-white rounded-2xl border border-red-200 text-center">
              <p className="text-sm text-red-700 font-medium">{portal.error}</p>
              <button
                onClick={() => portal.recargar()}
                className="mt-3 px-4 py-2 bg-indigo-700 text-white text-sm font-bold rounded-xl cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : contratoActivo ? (
            <>
              {pantalla === 'inicio' && (
                <PortalInicio
                  usuario={usuario}
                  contrato={contratoActivo}
                  inmueble={inmuebleActivo}
                  incidencias={portal.incidencias.filter((i) => i.contratoId === contratoActivo.id)}
                  mensajesNoLeidos={noLeidos}
                  suministros={portal.suministros.filter((s) => s.inmuebleId === contratoActivo.inmuebleId)}
                  ir={ir}
                />
              )}
              {pantalla === 'contrato' && (
                <PortalContrato contrato={contratoActivo} inmueble={inmuebleActivo} />
              )}
              {pantalla === 'recibos' && (
                <PortalRecibos contrato={contratoActivo} />
              )}
              {pantalla === 'incidencias' && (
                <PortalIncidencias
                  usuario={usuario}
                  contrato={contratoActivo}
                  inmueble={inmuebleActivo}
                  incidencias={portal.incidencias.filter((i) => i.contratoId === contratoActivo.id)}
                  onCambio={portal.recargar}
                />
              )}
              {pantalla === 'suministros' && (
                <PortalSuministros
                  usuario={usuario}
                  contrato={contratoActivo}
                  suministros={portal.suministros.filter((s) => s.inmuebleId === contratoActivo.inmuebleId)}
                  lecturas={portal.lecturas.filter((l) => l.contratoId === contratoActivo.id)}
                  cambios={portal.cambios.filter((c) => c.contratoId === contratoActivo.id)}
                  onCambio={portal.recargar}
                />
              )}
              {pantalla === 'mensajes' && (
                <PortalMensajes
                  usuario={usuario}
                  contrato={contratoActivo}
                  mensajes={portal.mensajes.filter((m) => m.contratoId === contratoActivo.id)}
                  onCambio={portal.recargar}
                />
              )}
              {pantalla === 'documentos' && (
                <PortalDocumentos
                  contrato={contratoActivo}
                  incidencias={portal.incidencias.filter((i) => i.contratoId === contratoActivo.id)}
                  lecturas={portal.lecturas.filter((l) => l.contratoId === contratoActivo.id)}
                  actas={portal.actas.filter((a) => a.contratoId === contratoActivo.id)}
                />
              )}
              {pantalla === 'historial' && (
                <PortalHistorial
                  contrato={contratoActivo}
                  incidencias={portal.incidencias.filter((i) => i.contratoId === contratoActivo.id)}
                  mensajes={portal.mensajes.filter((m) => m.contratoId === contratoActivo.id)}
                  lecturas={portal.lecturas.filter((l) => l.contratoId === contratoActivo.id)}
                  cambios={portal.cambios.filter((c) => c.contratoId === contratoActivo.id)}
                  suministros={portal.suministros.filter((s) => s.inmuebleId === contratoActivo.inmuebleId)}
                />
              )}
              {pantalla === 'cuenta' && <PortalCuenta usuario={usuario} onLogout={onLogout} />}
              {pantalla === 'mas' && (
                <nav className="space-y-2">
                  {(
                    [
                      { id: 'contrato', icono: FileText, titulo: 'Mi contrato', desc: 'Condiciones, fianza y firmas' },
                      { id: 'mensajes', icono: Mail, titulo: 'Mensajes', desc: 'Habla con gestión', badge: noLeidos },
                      { id: 'documentos', icono: FileText, titulo: 'Documentos', desc: 'Contrato, recibos y evidencias' },
                      { id: 'historial', icono: History, titulo: 'Historial', desc: 'Tu actividad en el portal' },
                      { id: 'cuenta', icono: User, titulo: 'Mi cuenta', desc: 'Tus datos de acceso' },
                    ] as const
                  ).map((op) => (
                    <button
                      key={op.id}
                      data-tour={`portal-mas-${op.id}`}
                      onClick={() => ir(op.id)}
                      className="w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm text-left cursor-pointer active:scale-[0.99] transition-transform"
                    >
                      <span className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center relative">
                        <op.icono className="w-5 h-5" />
                        {'badge' in op && op.badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {op.badge}
                          </span>
                        )}
                      </span>
                      <span>
                        <span className="block text-sm font-bold">{op.titulo}</span>
                        <span className="block text-xs text-slate-500">{op.desc}</span>
                      </span>
                    </button>
                  ))}
                </nav>
              )}
            </>
          ) : null}
        </main>

        {/* §6 F2: recorrido guiado (panel flotante; navega con `ir`, sin alterar el portal) */}
        {sesionTutorial && tutorialActivo && contratoActivo && (
          <TutorialPlayer
            tutorial={tutorialActivo}
            sesion={sesionTutorial}
            contexto={contextoDesdeUsuario(usuario, pantalla, { host: 'PORTAL_INQUILINO', accessibleSections: [...PANTALLAS_PORTAL], entityType: 'contrato', entityId: contratoActivo.id })}
            onCambio={setSesionTutorial}
            onNavegar={(r) => ir(r as PantallaPortal)}
            onCerrar={() => setSesionTutorial(null)}
            posicion="abajo-centro"
            servicio={servicioProgresoTutoriales}
          />
        )}

        {/* Navegación inferior */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-20">
          <div className="grid grid-cols-5 px-2 py-2">
            {(
              [
                { id: 'inicio', icono: Home, etiqueta: 'Inicio' },
                { id: 'recibos', icono: Receipt, etiqueta: 'Recibos' },
                { id: 'incidencias', icono: Wrench, etiqueta: 'Averías' },
                { id: 'suministros', icono: Zap, etiqueta: 'Luz/Agua' },
                { id: 'mas', icono: MoreHorizontal, etiqueta: 'Más', badge: noLeidos },
              ] as const
            ).map((t) => {
              const activo = pantalla === t.id || (t.id === 'mas' && esSubvista);
              return (
                <button
                  key={t.id}
                  data-tour={`portal-tab-${t.id}`}
                  onClick={() => ir(t.id)}
                  className={`relative flex flex-col items-center gap-0.5 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer ${
                    activo ? 'text-indigo-700' : 'text-slate-400'
                  }`}
                >
                  <t.icono className="w-5 h-5" />
                  {t.etiqueta}
                  {'badge' in t && t.badge > 0 && (
                    <span className="absolute top-0 right-1/2 translate-x-4 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {t.badge}
                    </span>
                  )}
                  {activo && <span className="w-6 h-0.5 rounded-full bg-indigo-600" />}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
};
