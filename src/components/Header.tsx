import React from 'react';
import { SectionType, UserProfile, GmailIntegracionConfig, UsuarioApp, EnlaceRegistro } from '../types';
import { Plus, Database, User, ShieldCheck, Mail, LogOut, CheckCircle2, Shield, Home, Wrench, Link2, Copy, Check } from 'lucide-react';
// CAPA TRANSVERSAL §6 (Fase 1): ayuda contextual de la pantalla activa
import { ContextualHelp } from './experiencia/ContextualHelp';
import { AsistentePanel } from './experiencia/AsistentePanel';
import type { AccionHost, ProveedorIA } from '../experiencia';

interface HeaderProps {
  activeSection: SectionType;
  userProfile: UserProfile;
  gmailConfig?: GmailIntegracionConfig;
  currentUser?: UsuarioApp;
  activeRegistrationLink?: EnlaceRegistro | null;
  onSelectSection: (section: SectionType) => void;
  onOpenAddCandidateModal?: () => void;
  onOpenAuthModal?: () => void;
  onLogout?: () => void;
  onConnectGoogle?: () => void;
  onDisconnectGoogle?: () => void;
  /** CAPA TRANSVERSAL §6: iniciar un tutorial desde la ayuda contextual. */
  onIniciarTutorial?: (tutorialId: string) => void;
  /** §6 F4: el host ejecuta la acción validada del asistente (navegar/tutorial). */
  onAccionAsistente?: (accion: Exclude<AccionHost, { tipo: 'NINGUNA' }>) => void;
  proveedorIA?: ProveedorIA;
  /** Secciones accesibles (route guard del host) para el asistente. */
  accessibleSections?: SectionType[];
}

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  userProfile,
  gmailConfig,
  currentUser,
  activeRegistrationLink,
  onSelectSection,
  onOpenAddCandidateModal,
  onOpenAuthModal,
  onLogout,
  onConnectGoogle,
  onDisconnectGoogle,
  onIniciarTutorial,
  onAccionAsistente,
  proveedorIA,
  accessibleSections,
}) => {
  const [copiedLink, setCopiedLink] = React.useState(false);

  const getSectionTitle = (section: SectionType) => {
    switch (section) {
      case 'inicio':
        return { title: 'Inicio y Resumen General', subtitle: 'Panel de control de candidatos e inmuebles' };
      case 'inmuebles':
        return { title: 'Gestión de Inmuebles', subtitle: 'Listado de viviendas en alquiler' };
      case 'propietarios':
        return { title: 'Gestión de Propietarios e IBAN', subtitle: 'Base de datos de arrendadores, domicilios fiscales y cuentas bancarias' };
      case 'preseleccionados':
        return { title: 'Preseleccionados e Invitaciones', subtitle: 'Agenda de visitas a viviendas y citaciones por WhatsApp' };
      case 'solicitudes':
        return { title: 'Solicitudes y Captura', subtitle: 'Enlaces públicos de inscripción para candidatos' };
      case 'candidatos':
        return { title: 'Listado de Candidatos', subtitle: 'Gestión, estado y filtro de solicitantes' };
      case 'nuevo_candidato':
        return { title: 'Añadir Nuevo Candidato', subtitle: 'Formulario de registro inicial de candidatos' };
      case 'cuestionario':
        return { title: 'Cuestionarios de Incidencias', subtitle: 'Preguntas y verificación de antecedentes' };
      case 'formalizacion':
        return { title: 'Formalización de Contrato LAU', subtitle: 'Generación de contratos, scoring y entrega de llaves' };
      case 'seguro_impago':
        return { title: 'Seguro de Impago & Aseguradoras', subtitle: 'SEAG, ARAG, Caser, Mutua de Propietarios y control de pólizas' };
      case 'analisis':
        return { title: 'Análisis Gemini IA', subtitle: 'Evaluación automatizada de solvencia y documentación' };
      case 'administracion':
        return { title: 'Administración Global & Seguridad', subtitle: 'Usuarios, roles, módulos, invitaciones y registro de auditoría' };
      case 'actas':
        return { title: 'Actas de Entrada y Salida — BLOQUE D', subtitle: 'Inventario, estados, evidencias Storage, incidencias, comparación determinista, firma OTP, PDF y trazabilidad canónica' };
      case 'configuracion':
        return { title: 'Configuración del Sistema', subtitle: 'Preferencias, aseguradoras y conexión Google Workspace' };
      case 'ayuda':
        return { title: 'Centro de Ayuda', subtitle: 'Explicaciones por pantalla y tutoriales guiados según tu perfil' };
      default:
        return { title: 'Gestión de Alquileres', subtitle: 'Preselección de candidatos' };
    }
  };

  const { title, subtitle } = getSectionTitle(activeSection);

  const handleCopyRegistrationLink = () => {
    if (!activeRegistrationLink) return;
    const url = `${window.location.origin}?registro=${activeRegistrationLink.token}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <header className="hidden md:flex items-center justify-between px-8 py-5 bg-white border-b border-slate-200/80 sticky top-0 z-20">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-1">
          <span>RentSelect</span>
          <span>/</span>
          <span className="text-slate-600 capitalize">{activeSection.replace('_', ' ')}</span>
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
          {currentUser && (
            <ContextualHelp
              usuario={currentUser}
              section={activeSection}
              onAbrirCentro={() => onSelectSection('ayuda')}
              onIniciarTutorial={onIniciarTutorial}
            />
          )}
          {currentUser && onAccionAsistente && (
            <AsistentePanel usuario={currentUser} section={activeSection} accessibleSections={accessibleSections} proveedor={proveedorIA} onAccion={onAccionAsistente} />
          )}
        </div>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Link to Share Active Registration Link */}
        {activeRegistrationLink && (
          <button
            onClick={handleCopyRegistrationLink}
            title={`Copiar enlace: ${activeRegistrationLink.textoVisible}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5 text-purple-600" />}
            <span className="truncate max-w-[150px]">{copiedLink ? '¡Enlace copiado!' : activeRegistrationLink.textoVisible}</span>
          </button>
        )}

        {/* Google / Gmail Connected Badge */}
        {gmailConfig?.conectado ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold">
            <Mail className="w-3.5 h-3.5 text-indigo-600" />
            <span className="truncate max-w-[140px]">{gmailConfig.emailConectado || 'Gmail Activo'}</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          </div>
        ) : onConnectGoogle ? (
          <button
            onClick={onConnectGoogle}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <Mail className="w-3.5 h-3.5 text-slate-600" />
            <span>Conectar Gmail</span>
          </button>
        ) : null}

        {/* Primary Action Button (Admin or Owner only) */}
        {currentUser?.tipoPerfil !== 'PROFESIONAL' && (
          <button
            onClick={() => (onOpenAddCandidateModal ? onOpenAddCandidateModal() : onSelectSection('candidatos'))}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl shadow-xs transition-all hover:shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Candidato</span>
          </button>
        )}

        {/* User / Session Pill */}
        <div className="flex items-center pl-3 border-l border-slate-200">
          <button
            onClick={onOpenAuthModal}
            title="Ver información de mi perfil"
            className="flex items-center gap-2.5 hover:bg-slate-50 p-1.5 rounded-xl transition-all cursor-pointer text-left"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                currentUser?.tipoPerfil === 'ADMINISTRADOR'
                  ? 'bg-purple-100 border-purple-300 text-purple-800'
                  : currentUser?.tipoPerfil === 'PROPIETARIO'
                  ? 'bg-blue-100 border-blue-300 text-blue-800'
                  : 'bg-amber-100 border-amber-300 text-amber-800'
              }`}
            >
              {currentUser ? currentUser.nombre.charAt(0) : userProfile.nombre.charAt(0)}
            </div>
            <div className="text-left text-xs">
              <p className="font-semibold text-slate-800 leading-none">
                {currentUser ? currentUser.nombre : userProfile.nombre}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider font-semibold">
                {currentUser ? currentUser.tipoPerfil : 'PROPIETARIO'}
              </p>
            </div>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="ml-2 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
