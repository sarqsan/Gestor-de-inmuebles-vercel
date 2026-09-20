import React, { useState, useEffect, useMemo } from 'react';
import { UserPlus, X } from 'lucide-react';
import {
  SectionType,
  Candidato,
  Inmueble,
  UserProfile,
  CandidateStatus,
  InformeInteligente,
  RespuestaIncidencia,
  SolicitudAlquiler,
  SolicitudEstado,
  InvitacionVisita,
  VisitSlot,
  SolicitudDocumentacion,
  ItemDocumentoSolicitado,
  SolicitudDocPublicData,
  ContratoFormalizacion,
  Gasto,
  GastoRecurrente,
  Prestamo,
  ExpedienteRecomercializacion,
  InmobiliariaDirectorio,
  PropuestaInmobiliaria,
  LeadInmobiliario,
  DocumentoAnalizado,
  SolicitudSeguroImpago,
  ConfiguracionAseguradora,
  GmailIntegracionConfig,
  Propietario,
  UsuarioApp,
  Profesional,
  EnlaceRegistro,
  Especialidad,
  AuditLog,
  ModulosConfig,
  RolDefinicion,
} from './types';
import {
  INITIAL_CANDIDATOS,
  INITIAL_INMUEBLES,
  INITIAL_PROPIETARIOS,
  INITIAL_USER_PROFILE,
  INITIAL_SOLICITUDES,
  INITIAL_INVITACIONES,
  INITIAL_VISIT_SLOTS,
  INITIAL_SOLICITUDES_DOC,
  INITIAL_CONTRATOS,
  INITIAL_ASEGURADORAS,
  INITIAL_SOLICITUDES_SEGURO,
  INITIAL_GMAIL_CONFIG,
} from './data/mockData';
import { generarInformeInteligente } from './utils/reportGenerator';
import {
  obtenerTodosCobros,
  generarPeriodosParaContrato,
  actualizarEstadosVencimiento,
} from './utils/cobrosEngine';
import {
  crearGastoRecurrente,
  generarGastosRecurrentes,
  normalizarRecurrente,
} from './utils/gastosEngine';
import {
  calcularCuotaConstante,
  cuotaDelPeriodo,
  generarTablaAmortizacion,
} from './utils/prestamosEngine';
import {
  seedInitialDataIfEmpty,
  subscribeInmuebles,
  subscribeCandidatos,
  subscribePropietarios,
  subscribeSolicitudes,
  subscribeInvitaciones,
  subscribeVisitSlots,
  subscribeSolicitudesDoc,
  subscribeContratos,
  subscribeGastos,
  subscribeGastosRecurrentes,
  subscribePrestamos,
  subscribeExpedientesRecomercializacion,
  subscribeInmobiliarias,
  subscribePropuestasInmobiliaria,
  subscribeLeadsInmobiliarios,
  subscribeAseguradoras,
  subscribeSolicitudesSeguro,
  subscribeGmailConfig,
  subscribeUsuarios,
  subscribeProfesionales,
  subscribeEnlacesRegistro,
  subscribeEspecialidades,
  subscribeAuditLogs,
  subscribeModulosConfig,
  saveInmuebleFirestore,
  deleteInmuebleFirestore,
  saveCandidatoFirestore,
  deleteCandidatoFirestore,
  savePropietarioFirestore,
  deletePropietarioFirestore,
  saveSolicitudFirestore,
  deleteSolicitudFirestore,
  saveInvitacionFirestore,
  deleteInvitacionFirestore,
  saveVisitSlotFirestore,
  deleteVisitSlotFirestore,
  deleteMultipleSlotsFirestore,
  saveAgendaSlotsFirestore,
  saveSolicitudDocFirestore,
  deleteSolicitudDocFirestore,
  saveContratoFirestore,
  deleteContratoFirestore,
  saveGastoFirestore,
  deleteGastoFirestore,
  saveGastoRecurrenteFirestore,
  deleteGastoRecurrenteFirestore,
  savePrestamoFirestore,
  deletePrestamoFirestore,
  saveExpedienteRecomercializacionFirestore,
  deleteExpedienteRecomercializacionFirestore,
  saveInmobiliariaFirestore,
  deleteInmobiliariaFirestore,
  savePropuestaInmobiliariaFirestore,
  saveLeadInmobiliarioFirestore,
  deleteFotoInspeccionStorage,
  saveAseguradoraFirestore,
  deleteAseguradoraFirestore,
  saveSolicitudSeguroFirestore,
  deleteSolicitudSeguroFirestore,
  saveGmailConfigFirestore,
  saveUsuarioFirestore,
  deleteUsuarioFirestore,
  saveProfesionalFirestore,
  deleteProfesionalFirestore,
  saveEnlaceRegistroFirestore,
  deleteEnlaceRegistroFirestore,
  saveEspecialidadFirestore,
  deleteEspecialidadFirestore,
  saveAuditLogFirestore,
  saveModulosConfigFirestore,
} from './lib/firebase';

import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { Header } from './components/Header';
import { CandidateModal } from './components/CandidateModal';
import { SmartReportModal } from './components/SmartReportModal';
import { CrearAgendaVisitasModal } from './components/CrearAgendaVisitasModal';
import { CuestionarioPublicoView } from './components/CuestionarioPublicoView';
import { EnviarCuestionarioModal } from './components/EnviarCuestionarioModal';

import { PortalSolicitudPublicaView } from './components/PortalSolicitudPublicaView';
import { SolicitudDetailModal } from './components/SolicitudDetailModal';
import { CrearEnlaceSolicitudModal } from './components/CrearEnlaceSolicitudModal';
import { PortalVisitaPublicaView } from './components/PortalVisitaPublicaView';
import { CrearSolicitudDocModal } from './components/CrearSolicitudDocModal';
import { DetalleSolicitudDocModal } from './components/DetalleSolicitudDocModal';
import { PortalDocumentacionPublicaView } from './components/PortalDocumentacionPublicaView';
import { FormalizarContratoModal } from './components/FormalizarContratoModal';
import { CrearSolicitudSeguroModal } from './components/CrearSolicitudSeguroModal';
import { DetalleSolicitudSeguroModal } from './components/DetalleSolicitudSeguroModal';
import { ConfiguracionAseguradorasModal } from './components/ConfiguracionAseguradorasModal';

import { InicioSection } from './components/sections/InicioSection';
import { InmueblesSection } from './components/sections/InmueblesSection';
import { CandidatosSection } from './components/sections/CandidatosSection';
import { NuevoCandidatoSection } from './components/sections/NuevoCandidatoSection';
import { CuestionarioSection } from './components/sections/CuestionarioSection';
import { AnalisisSection } from './components/sections/AnalisisSection';
import { ConfiguracionSection } from './components/sections/ConfiguracionSection';
import { SolicitudesSection } from './components/sections/SolicitudesSection';
import { PreseleccionadosSection } from './components/sections/PreseleccionadosSection';
import { FormalizacionSection } from './components/sections/FormalizacionSection';
import { CobrosSection } from './components/sections/CobrosSection';
import { FinanciacionSection } from './components/sections/FinanciacionSection';
import { GastosSection } from './components/sections/GastosSection';
import { FiscalidadSection } from './components/sections/FiscalidadSection';
import { InformesSection } from './components/sections/InformesSection';
import { PolizasSegurosSection } from './components/sections/PolizasSegurosSection';
import { RecomercializacionSection } from './components/sections/RecomercializacionSection';
import type { ContextoNuevoExpediente } from './components/modals/RecomercializarModal';
import { SeguroImpagoSection } from './components/sections/SeguroImpagoSection';
import { IncidenciasSection } from './components/sections/IncidenciasSection';
import { PropietariosSection } from './components/sections/PropietariosSection';

import { AdministracionSection } from './components/sections/AdministracionSection';
import { PropietarioPortalSection } from './components/sections/PropietarioPortalSection';
import { ProfesionalPortalSection } from './components/sections/ProfesionalPortalSection';
import { PortalRegistroView } from './components/PortalRegistroView';
import { LoginView } from './components/LoginView';
import { AdminControlCenter } from './components/admin/AdminControlCenter';
import {
  subscribeAuthState,
  logoutUser,
  isAdmin,
  isPropietario,
  isProfesional,
  canAccessInmueble,
  canAccessContrato,
  canAccessCandidato,
  syncAuthIndex,
} from './lib/authService';
import { AuthModal } from './components/modals/AuthModal';
import { CrearUsuarioModal } from './components/modals/CrearUsuarioModal';
import { CrearProfesionalModal } from './components/modals/CrearProfesionalModal';
import { CrearEnlaceRegistroModal } from './components/modals/CrearEnlaceRegistroModal';

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionType>('inicio');
  const [propietarios, setPropietarios] = useState<Propietario[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_propietarios');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_PROPIETARIOS;
  });
  const [candidatos, setCandidatos] = useState<Candidato[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_candidatos');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_CANDIDATOS;
  });
  const [inmuebles, setInmuebles] = useState<Inmueble[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_inmuebles');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_INMUEBLES;
  });
  const [solicitudes, setSolicitudes] = useState<SolicitudAlquiler[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_solicitudes');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_SOLICITUDES;
  });
  const [invitaciones, setInvitaciones] = useState<InvitacionVisita[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_invitaciones');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_INVITACIONES;
  });
  const [slots, setSlots] = useState<VisitSlot[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_slots');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_VISIT_SLOTS;
  });
  const [solicitudesDoc, setSolicitudesDoc] = useState<SolicitudDocumentacion[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_solicitudes_doc');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_SOLICITUDES_DOC;
  });
  const [contratos, setContratos] = useState<ContratoFormalizacion[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_contratos');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_CONTRATOS;
  });
  // FASE 2.0: gastos (explotación vs financiación). Colección nueva, sin caché local.
  const [gastos, setGastos] = useState<Gasto[]>([]);
  // FASE 2.2: plantillas de gastos recurrentes.
  const [gastosRecurrentes, setGastosRecurrentes] = useState<GastoRecurrente[]>([]);
  // FASE 2.3: préstamos / hipotecas.
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  // FASE 3.0/3.1: expedientes de recomercialización y contexto de alta.
  const [expedientesRecomerc, setExpedientesRecomerc] = useState<ExpedienteRecomercializacion[]>([]);
  // FASE 3.6: bolsa de inmobiliarias, RFPs (propuestas) y leads.
  const [inmobiliariasDirectorio, setInmobiliariasDirectorio] = useState<InmobiliariaDirectorio[]>([]);
  const [propuestasInmobiliaria, setPropuestasInmobiliaria] = useState<PropuestaInmobiliaria[]>([]);
  const [leadsInmobiliarios, setLeadsInmobiliarios] = useState<LeadInmobiliario[]>([]);
  const [nuevoExpedienteCtx, setNuevoExpedienteCtx] = useState<ContextoNuevoExpediente | null>(null);
  const [aseguradoras, setAseguradoras] = useState<ConfiguracionAseguradora[]>(INITIAL_ASEGURADORAS);
  const [solicitudesSeguro, setSolicitudesSeguro] = useState<SolicitudSeguroImpago[]>(() => {
    try {
      const cached = localStorage.getItem('rentselect_solicitudes_seguro');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return INITIAL_SOLICITUDES_SEGURO;
  });
  const [gmailConfig, setGmailConfig] = useState<GmailIntegracionConfig>(INITIAL_GMAIL_CONFIG);
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);

  const [selectedCandidateForModal, setSelectedCandidateForModal] = useState<Candidato | null>(null);
  const [selectedCandidateForAnalysis, setSelectedCandidateForAnalysis] = useState<Candidato | null>(null);

  // State for Seguro Impago Modals
  const [showCrearSeguroModal, setShowCrearSeguroModal] = useState<boolean>(false);
  const [candidateForCrearSeguro, setCandidateForCrearSeguro] = useState<Candidato | null>(null);
  const [inmuebleForCrearSeguro, setInmuebleForCrearSeguro] = useState<Inmueble | null>(null);
  const [selectedSolicitudSeguroForDetail, setSelectedSolicitudSeguroForDetail] = useState<SolicitudSeguroImpago | null>(null);
  const [showConfigAseguradorasModal, setShowConfigAseguradorasModal] = useState<boolean>(false);

  // State for Formalizar Contrato Modal (Fase 3)
  const [formalizarModalState, setFormalizarModalState] = useState<{
    isOpen: boolean;
    candidato: Candidato | null;
    inmueble?: Inmueble;
    contrato?: ContratoFormalizacion;
  }>({ isOpen: false, candidato: null });

  // State for Solicitud Alquiler Modal & Public View
  const [selectedSolicitudForModal, setSelectedSolicitudForModal] = useState<SolicitudAlquiler | null>(null);
  const [activePublicSolicitudToken, setActivePublicSolicitudToken] = useState<string | null>(null);
  const [inmuebleForLinkModal, setInmuebleForLinkModal] = useState<Inmueble | null>(null);

  // State for Visita Public Token
  const [activePublicVisitaToken, setActivePublicVisitaToken] = useState<string | null>(null);

  // State for Documentacion Public Token (Fase 2)
  const [activePublicDocToken, setActivePublicDocToken] = useState<string | null>(null);
  const [candidateForCrearDocModal, setCandidateForCrearDocModal] = useState<{
    candidato: Candidato;
    inmueble?: Inmueble;
    invitacion?: InvitacionVisita;
  } | null>(null);
  const [selectedSolicitudDocForDetail, setSelectedSolicitudDocForDetail] = useState<SolicitudDocumentacion | null>(null);

  // State for Crear Agenda Visitas Modal
  const [showCrearAgendaModal, setShowCrearAgendaModal] = useState<boolean>(false);
  const [selectedInmuebleForAgenda, setSelectedInmuebleForAgenda] = useState<string | undefined>(undefined);

  // State for Smart Report modal
  const [selectedCandidateForReport, setSelectedCandidateForReport] = useState<Candidato | null>(null);
  const [activeReport, setActiveReport] = useState<InformeInteligente | null>(null);

  // State for Public/Standalone Questionnaire Token
  const [activePublicQuestionnaireToken, setActivePublicQuestionnaireToken] = useState<string | null>(null);

  // State for Enviar Cuestionario Modal
  const [candidateForEnviarModal, setCandidateForEnviarModal] = useState<Candidato | null>(null);

  // State for Nuevo Candidato Modal
  const [showNuevoCandidatoModal, setShowNuevoCandidatoModal] = useState<boolean>(false);

  // --- NUEVA CAPA DE USUARIOS, PERFILES, PERMISOS E INVITACIONES ---
  const [usuarios, setUsuarios] = useState<UsuarioApp[]>([]);
  const [profesionales, setProfesionales] = useState<Profesional[]>([]);
  const [enlacesRegistro, setEnlacesRegistro] = useState<EnlaceRegistro[]>([]);
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [modulosConfig, setModulosConfig] = useState<ModulosConfig | null>(null);

  // Sesión y autenticación real con Firebase Authentication
  const [currentUser, setCurrentUser] = useState<UsuarioApp | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // 1. Suscripción a Firebase Authentication como única fuente de verdad
  useEffect(() => {
    const unsubscribeAuth = subscribeAuthState((fbUser, usuarioApp, loading) => {
      setAuthLoading(loading);
      if (!fbUser) {
        setCurrentUser(null);
        return;
      }

      if (usuarioApp) {
        if (usuarioApp.estado === 'BLOQUEADO' || usuarioApp.estado === 'INACTIVO') {
          logoutUser();
          setCurrentUser(null);
          alert('Tu cuenta se encuentra bloqueada o inactiva. Por favor, contacta con el administrador del sistema.');
          return;
        }

        setCurrentUser(usuarioApp);
        // Redirigir al panel correspondiente según el perfil
        setActiveSection((prev) => {
          if (usuarioApp.tipoPerfil === 'ADMINISTRADOR') {
            return prev === 'inicio' ? 'administracion' : prev;
          }
          if (usuarioApp.tipoPerfil === 'PROPIETARIO') {
            return 'propietarios';
          }
          if (usuarioApp.tipoPerfil === 'PROFESIONAL') {
            return 'administracion';
          }
          return prev;
        });
      } else {
        setCurrentUser(null);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // 2. Route Guard Estricto de Navegación por Perfil
  useEffect(() => {
    if (!currentUser) return;
    const perfil = currentUser.tipoPerfil;

    if (perfil === 'PROPIETARIO') {
      const allowedSections: SectionType[] = [
        'propietarios',
        'inmuebles',
        'formalizacion',
        'cobros',
        'gastos',
        'financiacion',
        'fiscal',
        'informes',
        'polizas',
        'incidencias',
        'recomercializacion',
        'configuracion',
      ];
      if (!allowedSections.includes(activeSection)) {
        setActiveSection('propietarios');
      }
    } else if (perfil === 'PROFESIONAL') {
      const allowedSections: SectionType[] = ['administracion', 'inmuebles', 'configuracion'];
      if (!allowedSections.includes(activeSection)) {
        setActiveSection('administracion');
      }
    }
  }, [currentUser, activeSection]);

  // 3. Aislamiento y Ámbito de Datos (RBAC & Tenant Scoping)
  const scopedInmuebles = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return inmuebles;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      return inmuebles.filter((i) =>
        (currentUser.propietarioId && (i.propietarioId === currentUser.propietarioId || i.propietarioPrincipalId === currentUser.propietarioId)) ||
        (currentUser.inmuebleIds && currentUser.inmuebleIds.includes(i.id))
      );
    }
    if (currentUser.tipoPerfil === 'PROFESIONAL') {
      const prof = profesionales.find((p) => p.id === currentUser.profesionalId || p.usuarioId === currentUser.id);
      return inmuebles.filter((i) =>
        (prof?.inmuebleIdsAsignados && prof.inmuebleIdsAsignados.includes(i.id)) ||
        (currentUser.inmuebleIds && currentUser.inmuebleIds.includes(i.id))
      );
    }
    return [];
  }, [currentUser, inmuebles, profesionales]);

  const scopedPropietarios = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return propietarios;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      return propietarios.filter((p) =>
        p.id === currentUser.propietarioId ||
        p.email.toLowerCase() === currentUser.email.toLowerCase()
      );
    }
    return [];
  }, [currentUser, propietarios]);

  const scopedContratos = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return contratos;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const allowedInmIds = new Set(scopedInmuebles.map((i) => i.id));
      return contratos.filter(
        (c) =>
          (currentUser.propietarioId && c.propietarioId === currentUser.propietarioId) ||
          allowedInmIds.has(c.inmuebleId)
      );
    }
    return [];
  }, [currentUser, contratos, scopedInmuebles]);

  // FASE 2.0: gastos visibles. La suscripción ya viene acotada para el propietario;
  // aquí se refuerza el filtro (defensa en profundidad) y se entrega todo al admin.
  const scopedGastos = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return gastos;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const allowedInmIds = new Set(scopedInmuebles.map((i) => i.id));
      return gastos.filter(
        (g) =>
          (currentUser.propietarioId && g.propietarioId === currentUser.propietarioId) ||
          allowedInmIds.has(g.inmuebleId)
      );
    }
    return []; // Los profesionales no acceden a datos económicos.
  }, [currentUser, gastos, scopedInmuebles]);

  // FASE 2.2: plantillas recurrentes visibles (la suscripción ya viene acotada).
  const scopedRecurrentes = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return gastosRecurrentes;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const allowedInmIds = new Set(scopedInmuebles.map((i) => i.id));
      return gastosRecurrentes.filter(
        (r) =>
          (currentUser.propietarioId && r.propietarioId === currentUser.propietarioId) ||
          allowedInmIds.has(r.inmuebleId)
      );
    }
    return [];
  }, [currentUser, gastosRecurrentes, scopedInmuebles]);

  // FASE 2.3: préstamos visibles (la suscripción ya viene acotada por propietario).
  const scopedPrestamos = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return prestamos;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const allowedInmIds = new Set(scopedInmuebles.map((i) => i.id));
      return prestamos.filter(
        (p) =>
          (currentUser.propietarioId && p.propietarioId === currentUser.propietarioId) ||
          allowedInmIds.has(p.inmuebleId)
      );
    }
    return [];
  }, [currentUser, prestamos, scopedInmuebles]);

  // FASE 3.0: expedientes de recomercialización visibles (la suscripción ya
  // viene acotada por propietarioId; aquí se refuerza por inmueble asignado).
  const scopedExpedientesRecomerc = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return expedientesRecomerc;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const allowedInmIds = new Set(scopedInmuebles.map((i) => i.id));
      return expedientesRecomerc.filter(
        (e) =>
          (currentUser.propietarioId && e.propietarioId === currentUser.propietarioId) ||
          allowedInmIds.has(e.inmuebleId)
      );
    }
    return [];
  }, [currentUser, expedientesRecomerc, scopedInmuebles]);

  // Cobros derivados de los contratos visibles para el usuario (con su histórico por inmuebleId).
  // El motor genera los periodos al vuelo cuando un contrato aún no los tiene persistidos.
  const scopedCobros = useMemo(() => obtenerTodosCobros(scopedContratos), [scopedContratos]);

  // Número de mensualidades que requieren atención: ya vencidas y no cobradas o en incidencia.
  const cobrosPendientesCount = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    return scopedCobros.filter((c) => {
      if (c.estado === 'RETRASADO' || c.estado === 'INCIDENCIA') return true;
      if (c.estado === 'PENDIENTE' && c.fechaVencimiento) {
        return new Date(`${c.fechaVencimiento}T23:59:59`) <= hoy;
      }
      return false;
    }).length;
  }, [scopedCobros]);

  const scopedCandidatos = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return candidatos;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const allowedInmIds = new Set(scopedInmuebles.map((i) => i.id));
      return candidatos.filter((c) => c.inmuebleId && allowedInmIds.has(c.inmuebleId));
    }
    return []; // Los profesionales tienen acceso CERO a candidatos
  }, [currentUser, candidatos, scopedInmuebles]);

  const scopedProfesionales = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return profesionales;
    if (currentUser.tipoPerfil === 'PROFESIONAL') {
      return profesionales.filter((p) => p.id === currentUser.profesionalId || p.usuarioId === currentUser.id);
    }
    return profesionales;
  }, [currentUser, profesionales]);

  // Modales de administración
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showCrearUsuarioModal, setShowCrearUsuarioModal] = useState<boolean>(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<UsuarioApp | undefined>(undefined);
  const [showCrearProfesionalModal, setShowCrearProfesionalModal] = useState<boolean>(false);
  const [selectedProfForEdit, setSelectedProfForEdit] = useState<Profesional | undefined>(undefined);
  const [showCrearEnlaceModal, setShowCrearEnlaceModal] = useState<boolean>(false);
  const [selectedEnlaceForEdit, setSelectedEnlaceForEdit] = useState<EnlaceRegistro | undefined>(undefined);

  // Token de registro público (por enlace o invitación)
  const [activePublicRegistroToken, setActivePublicRegistroToken] = useState<string | null>(null);

  // Public subscriptions and URL token checking
  useEffect(() => {
    const checkUrlForTokens = () => {
      const pathname = window.location.pathname;
      const hash = window.location.hash;
      const params = new URLSearchParams(window.location.search);

      // Check Registro / Invitación Token
      let regToken = params.get('registro') || params.get('invitacion') || params.get('tokenRegistro');
      if (pathname.includes('/registro/')) {
        regToken = pathname.split('/registro/')[1];
      } else if (hash.includes('registro/')) {
        regToken = hash.split('registro/')[1];
      }
      if (regToken) {
        setActivePublicRegistroToken(regToken);
      }

      // Check Visita Public Token
      let visitaToken = params.get('visita') || params.get('visitaToken');
      if (pathname.includes('/visita/')) {
        visitaToken = pathname.split('/visita/')[1];
      } else if (hash.includes('visita/')) {
        visitaToken = hash.split('visita/')[1];
      }

      if (visitaToken) {
        setActivePublicVisitaToken(visitaToken);
      }

      // Check Solicitud Public Token
      let solToken = params.get('solicitud') || params.get('solicitudToken');
      if (pathname.includes('/solicitud/')) {
        solToken = pathname.split('/solicitud/')[1];
      } else if (hash.includes('solicitud/')) {
        solToken = hash.split('solicitud/')[1];
      }

      if (solToken) {
        setActivePublicSolicitudToken(solToken);
      }

      // Check Documentación Public Token (Fase 2)
      let docToken = params.get('documentacion') || params.get('docToken') || params.get('doc');
      if (pathname.includes('/documentacion/')) {
        docToken = pathname.split('/documentacion/')[1];
      } else if (hash.includes('documentacion/')) {
        docToken = hash.split('documentacion/')[1];
      }

      if (docToken) {
        setActivePublicDocToken(docToken);
      }

      // Check Cuestionario Token
      let tokenFromUrl = params.get('cuestionario') || params.get('cuestionarioToken');
      if (pathname.includes('/cuestionario/')) {
        tokenFromUrl = pathname.split('/cuestionario/')[1];
      } else if (hash.includes('cuestionario/')) {
        tokenFromUrl = hash.split('cuestionario/')[1];
      }

      if (tokenFromUrl) {
        setActivePublicQuestionnaireToken(tokenFromUrl);
      }
    };

    checkUrlForTokens();
    window.addEventListener('hashchange', checkUrlForTokens);

    const unsubscribeInm = subscribeInmuebles((data) => {
      if (data && data.length > 0) {
        setInmuebles(data);
        try { localStorage.setItem('rentselect_inmuebles', JSON.stringify(data)); } catch (e) {}
      } else {
        setInmuebles((current) => {
          if (current.length > 0) {
            current.forEach((inm) => saveInmuebleFirestore(inm));
            return current;
          }
          return [];
        });
      }
    });

    const unsubscribeInv = subscribeInvitaciones((data) => {
      if (data && data.length > 0) {
        setInvitaciones(data);
        try { localStorage.setItem('rentselect_invitaciones', JSON.stringify(data)); } catch (e) {}
      }
    });

    const unsubscribeSlot = subscribeVisitSlots((data) => {
      if (data && data.length > 0) {
        setSlots(data);
        try { localStorage.setItem('rentselect_slots', JSON.stringify(data)); } catch (e) {}
      }
    });

    const unsubscribeDoc = subscribeSolicitudesDoc((data) => {
      if (data && data.length > 0) {
        setSolicitudesDoc(data);
        try { localStorage.setItem('rentselect_solicitudes_doc', JSON.stringify(data)); } catch (e) {}
      }
      // Auto-sync incoming Firestore docs into local candidate profiles
      if (data && data.length > 0) {
        setCandidatos((currentCandidates) => {
          let updatedList = [...currentCandidates];
          data.forEach((solDoc) => {
            const { updatedCandidates } = syncCandidateWithSolicitudDoc(solDoc, updatedList);
            updatedList = updatedCandidates;
          });
          return updatedList;
        });

        // Also update open modal states in real-time
        setSelectedCandidateForModal((prev) => {
          if (!prev) return null;
          const matchingSol = data.find(
            (s) =>
              s.candidatoId === prev.id ||
              (s.candidatoNombre && prev.nombre && s.candidatoNombre.trim().toLowerCase() === prev.nombre.trim().toLowerCase()) ||
              (s.candidatoTelefono && prev.telefono && s.candidatoTelefono.replace(/\s+/g, '') === prev.telefono.replace(/\s+/g, ''))
          );
          if (matchingSol) {
            const { targetCand } = syncCandidateWithSolicitudDoc(matchingSol, [prev]);
            return targetCand || prev;
          }
          return prev;
        });

        setSelectedSolicitudDocForDetail((prev) => {
          if (!prev) return null;
          const fresh = data.find((s) => s.id === prev.id || s.token === prev.token);
          return fresh || prev;
        });
      }
    });

    const unsubscribeEnlacesHook = subscribeEnlacesRegistro((data) => {
      setEnlacesRegistro(data);
    });

    const unsubscribeEspecialidadesHook = subscribeEspecialidades((data) => {
      setEspecialidades(data);
    });

    const unsubscribeModulosHook = subscribeModulosConfig((data) => {
      if (data) setModulosConfig(data);
    });

    return () => {
      window.removeEventListener('hashchange', checkUrlForTokens);
      unsubscribeInm();
      unsubscribeInv();
      unsubscribeSlot();
      unsubscribeDoc();
      unsubscribeEnlacesHook();
      unsubscribeEspecialidadesHook();
      unsubscribeModulosHook();
    };
  }, []);

  // Authenticated subscriptions (attached strictly when a user is authenticated)
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.tipoPerfil === 'ADMINISTRADOR') {
      seedInitialDataIfEmpty();
    }

    // FASE 1.4: ámbito de datos para que las escuchas nunca soliciten la
    // colección completa a un propietario (defensa en profundidad; la UI ya
    // filtraba, pero ahora la propia consulta queda acotada en origen).
    const dataScope = {
      tipoPerfil: currentUser.tipoPerfil,
      propietarioId: currentUser.propietarioId,
      inmuebleIds: currentUser.inmuebleIds || [],
    };

    const unsubscribeCand = subscribeCandidatos((data) => {
      if (data && data.length > 0) {
        setCandidatos(data);
        try { localStorage.setItem('rentselect_candidatos', JSON.stringify(data)); } catch (e) {}
      } else {
        setCandidatos((current) => {
          if (current.length > 0) {
            current.forEach((c) => saveCandidatoFirestore(c));
            return current;
          }
          return [];
        });
      }
    });

    const unsubscribeProp = subscribePropietarios((data) => {
      if (data && data.length > 0) {
        setPropietarios(data);
        try { localStorage.setItem('rentselect_propietarios', JSON.stringify(data)); } catch (e) {}
      }
    }, dataScope);

    const unsubscribeSol = subscribeSolicitudes((data) => {
      if (data && data.length > 0) {
        setSolicitudes(data);
        try { localStorage.setItem('rentselect_solicitudes', JSON.stringify(data)); } catch (e) {}
      }
    });

    const unsubscribeContratos = subscribeContratos((data) => {
      if (data && data.length > 0) {
        setContratos(data);
        try { localStorage.setItem('rentselect_contratos', JSON.stringify(data)); } catch (e) {}
      }
    }, dataScope);

    // FASE 2.0: gastos acotados por propietario (profesionales no reciben nada).
    const unsubscribeGastos = subscribeGastos((data) => {
      setGastos(Array.isArray(data) ? data : []);
    }, dataScope);

    // FASE 2.2: plantillas recurrentes con el mismo ámbito.
    const unsubscribeRecurrentes = subscribeGastosRecurrentes((data) => {
      setGastosRecurrentes(Array.isArray(data) ? data : []);
    }, dataScope);

    // FASE 2.3: préstamos/hipotecas con el mismo ámbito.
    const unsubscribePrestamos = subscribePrestamos((data) => {
      setPrestamos(Array.isArray(data) ? data : []);
    }, dataScope);

    // FASE 3.0: expedientes de recomercialización con el mismo ámbito.
    const unsubscribeExpedientes = subscribeExpedientesRecomercializacion((data) => {
      setExpedientesRecomerc(Array.isArray(data) ? data : []);
    }, dataScope);

    // FASE 3.6: directorio de inmobiliarias (bolsa común) con RFPs y leads acotados por propietario.
    const unsubscribeInmobiliarias = subscribeInmobiliarias((data) => {
      setInmobiliariasDirectorio(Array.isArray(data) ? data : []);
    }, dataScope);
    const unsubscribePropuestas = subscribePropuestasInmobiliaria((data) => {
      setPropuestasInmobiliaria(Array.isArray(data) ? data : []);
    }, dataScope);
    const unsubscribeLeads = subscribeLeadsInmobiliarios((data) => {
      setLeadsInmobiliarios(Array.isArray(data) ? data : []);
    }, dataScope);

    const unsubscribeProfesionalesHook = subscribeProfesionales((data) => {
      setProfesionales(data);
    });

    const unsubscribeSolicitudesSeguro = subscribeSolicitudesSeguro((data) => {
      if (data && data.length > 0) {
        setSolicitudesSeguro(data);
        try { localStorage.setItem('rentselect_solicitudes_seguro', JSON.stringify(data)); } catch (e) {}
      }
    });

    let unsubscribeAseguradoras: (() => void) | undefined;
    let unsubscribeGmail: (() => void) | undefined;
    let unsubscribeUsuariosHook: (() => void) | undefined;
    let unsubscribeAuditHook: (() => void) | undefined;

    if (currentUser.tipoPerfil === 'ADMINISTRADOR') {
      unsubscribeAseguradoras = subscribeAseguradoras((data) => {
        setAseguradoras(data || []);
      });

      unsubscribeGmail = subscribeGmailConfig((data) => {
        if (data) setGmailConfig(data);
      });

      unsubscribeUsuariosHook = subscribeUsuarios((data) => {
        setUsuarios(data);
        setCurrentUser((current) => {
          if (!current) return null;
          const fresh = data.find((u) => u.id === current.id || (current.authUid && u.authUid === current.authUid));
          if (fresh) {
            if (fresh.estado === 'BLOQUEADO' || fresh.estado === 'INACTIVO') {
              logoutUser();
              return null;
            }
            return fresh;
          }
          return current;
        });
      });

      unsubscribeAuditHook = subscribeAuditLogs((data) => {
        setAuditLogs(data);
      });
    }

    return () => {
      unsubscribeCand();
      unsubscribeProp();
      unsubscribeSol();
      unsubscribeContratos();
      unsubscribeGastos();
      unsubscribeRecurrentes();
      unsubscribePrestamos();
      unsubscribeExpedientes();
      unsubscribeInmobiliarias();
      unsubscribePropuestas();
      unsubscribeLeads();
      unsubscribeProfesionalesHook();
      unsubscribeSolicitudesSeguro();
      if (unsubscribeAseguradoras) unsubscribeAseguradoras();
      if (unsubscribeGmail) unsubscribeGmail();
      if (unsubscribeUsuariosHook) unsubscribeUsuariosHook();
      if (unsubscribeAuditHook) unsubscribeAuditHook();
    };
  }, [currentUser?.id, currentUser?.tipoPerfil]);

  // Ref to track candidate questionnaires currently being auto-analyzed
  const autoAnalyzingSetRef = React.useRef<Set<string>>(new Set());

  // Ref para evitar reescrituras innecesarias al materializar el calendario de cobros.
  // Clave: contrato.id -> firma (día actual + nº periodos + nº retrasados + último periodo).
  const cobrosEnsureRef = React.useRef<Map<string, string>>(new Map());

  // Fases 1.1 y 1.3 — Materializa el calendario de cobros y sincroniza estados por fecha.
  // Para cada contrato visible: se generan los periodos que falten y se pasa a RETRASADO
  // de forma automática (con trazabilidad) toda mensualidad PENDIENTE vencida más el margen
  // de cortesía. No se tocan RECIBIDO/VERIFICADO/INCIDENCIA ni los datos ya registrados.
  useEffect(() => {
    if (!currentUser) return;
    const hoy = new Date();

    scopedContratos.forEach((contrato) => {
      const sincro = actualizarEstadosVencimiento(contrato, hoy);
      if (sincro.periodos.length === 0) return;

      const retrasados = sincro.periodos.filter((p) => p.estado === 'RETRASADO').length;
      const firma = `${hoy.toISOString().slice(0, 10)}|${sincro.periodos.length}|${retrasados}|${sincro.periodos[sincro.periodos.length - 1].periodoMesAnio}`;
      if (cobrosEnsureRef.current.get(contrato.id) === firma) return;
      cobrosEnsureRef.current.set(contrato.id, firma);

      if (sincro.necesitaGuardado) {
        saveContratoFirestore(sincro.contratoActualizado);
        setContratos((prev) =>
          prev.map((c) => (c.id === sincro.contratoActualizado.id ? sincro.contratoActualizado : c))
        );
      }
    });
  }, [currentUser, scopedContratos]);

  // FASE 2.2 — Materializa automáticamente los apuntes pendientes de las
  // plantillas recurrentes (hasta el mes en curso). Es idempotente: los IDs son
  // deterministas y nunca se pisan pagos/ediciones de apuntes ya existentes.
  const recurrentesGenRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentUser || scopedRecurrentes.length === 0) return;
    const firma = scopedRecurrentes
      .map((r) => `${r.id}:${r.activo ? 1 : 0}:${r.ultimoPeriodoGenerado || ''}`)
      .sort()
      .join('|');
    if (recurrentesGenRef.current.has(firma)) return;

    const { gastos: nuevos, plantillasActualizadas } = generarGastosRecurrentes(
      scopedRecurrentes,
      scopedGastos
    );
    if (nuevos.length === 0) {
      recurrentesGenRef.current.add(firma);
      return;
    }
    recurrentesGenRef.current.add(firma);

    (async () => {
      for (const g of nuevos) {
        setGastos((prev) => (prev.some((x) => x.id === g.id) ? prev : [g, ...prev]));
        await saveGastoFirestore(g);
      }
      for (const r of plantillasActualizadas) {
        setGastosRecurrentes((prev) => prev.map((x) => (x.id === r.id ? r : x)));
        await saveGastoRecurrenteFirestore(r);
      }
    })();
  }, [currentUser, scopedRecurrentes, scopedGastos]);

  // FASE 2.3 — Cuando un recibo de CUOTA_HIPOTECARIA procede de la plantilla
  // vinculada a un préstamo, desglosa automáticamente capital e intereses según
  // su cuadro de amortización. Solo rellena recibos sin desglose (no pisa
  // ediciones manuales).
  const prestamosSplitRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentUser || scopedPrestamos.length === 0) return;
    const pendientes: Gasto[] = [];
    scopedPrestamos.forEach((p) => {
      if (!p.gastoRecurrenteId || !p.activo) return;
      scopedGastos.forEach((g) => {
        if (
          g.creadoPorId === p.gastoRecurrenteId &&
          g.tipo === 'FINANCIACION' &&
          g.periodoMesAnio &&
          g.intereses === undefined &&
          g.capitalAmortizado === undefined &&
          !prestamosSplitRef.current.has(g.id)
        ) {
          const split = cuotaDelPeriodo(p, g.periodoMesAnio);
          if (split) {
            prestamosSplitRef.current.add(g.id);
            // El importe del recibo se ajusta al cuadro (carencia: sólo intereses;
            // mes con amortización anticipada: incluye esa salida de caja).
            pendientes.push({
              ...g,
              importe: split.cuota,
              capitalAmortizado: split.capital,
              intereses: split.intereses,
            });
          }
        }
      });
    });
    pendientes.forEach((g) => {
      setGastos((prev) => prev.map((x) => (x.id === g.id ? g : x)));
      saveGastoFirestore(g);
    });
  }, [currentUser, scopedPrestamos, scopedGastos]);

  // Auto-analyze any candidate questionnaire that is completed but missing AI analysis
  useEffect(() => {
    if (candidatos.length > 0) {
      candidatos.forEach((cand) => {
        if (
          cand.cuestionarioIncidencias?.completado &&
          cand.cuestionarioIncidencias?.respuestas &&
          cand.cuestionarioIncidencias.respuestas.length > 0 &&
          !cand.cuestionarioIncidencias?.analisisIa &&
          !autoAnalyzingSetRef.current.has(cand.id)
        ) {
          autoAnalyzingSetRef.current.add(cand.id);
          handleRunAiAnalysisQuestionnaire(
            cand.id,
            cand.cuestionarioIncidencias.respuestas,
            cand.cuestionarioIncidencias.informacionAdicional,
            cand.nombre
          );
        }
      });
    }
  }, [candidatos]);

  // Handler to update candidate token
  const handleUpdateCandidateToken = (candidateId: string, newToken: string) => {
    setCandidatos((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const updated = { ...c, cuestionarioToken: newToken };
          saveCandidatoFirestore(updated);
          return updated;
        }
        return c;
      })
    );
    if (candidateForEnviarModal && candidateForEnviarModal.id === candidateId) {
      setCandidateForEnviarModal((prev) => (prev ? { ...prev, cuestionarioToken: newToken } : null));
    }
  };

  // Handler to update candidate questionnaire from public view
  const handlePublicQuestionnaireSubmit = async (
    candidatoId: string,
    updatedCandidateData: Partial<Candidato>,
    respuestas: RespuestaIncidencia[],
    informacionAdicional: string
  ) => {
    const currentCandidate = candidatos.find((c) => c.id === candidatoId);
    const candidateName = updatedCandidateData.nombre || currentCandidate?.nombre || 'Candidato';

    setCandidatos((prev) =>
      prev.map((c) => {
        if (c.id === candidatoId) {
          const updated: Candidato = {
            ...c,
            ...updatedCandidateData,
            estado: 'analizado',
            cuestionarioIncidencias: {
              ...c.cuestionarioIncidencias,
              completado: true,
              fechaCompletado: new Date().toISOString(),
              numRespuestas: respuestas.length,
              totalPreguntas: 12,
              respuestas,
              informacionAdicional,
            },
          };
          saveCandidatoFirestore(updated);
          return updated;
        }
        return c;
      })
    );

    if (selectedCandidateForModal && selectedCandidateForModal.id === candidatoId) {
      setSelectedCandidateForModal((prev) =>
        prev
          ? {
              ...prev,
              ...updatedCandidateData,
              estado: 'analizado',
              cuestionarioIncidencias: {
                ...prev.cuestionarioIncidencias,
                completado: true,
                fechaCompletado: new Date().toISOString(),
                numRespuestas: respuestas.length,
                totalPreguntas: 12,
                respuestas,
                informacionAdicional,
              },
            }
          : null
      );
    }

    // Automatically trigger AI analysis
    await handleRunAiAnalysisQuestionnaire(candidatoId, respuestas, informacionAdicional, candidateName);
  };

  // Handler to update candidate questionnaire
  const handleUpdateCandidatoQuestionnaire = async (
    candidatoId: string,
    respuestas: RespuestaIncidencia[],
    informacionAdicional: string
  ) => {
    const currentCandidate = candidatos.find((c) => c.id === candidatoId);
    const candidateName = currentCandidate?.nombre || 'Candidato';

    setCandidatos((prev) =>
      prev.map((c) => {
        if (c.id === candidatoId) {
          const updated: Candidato = {
            ...c,
            cuestionarioIncidencias: {
              ...c.cuestionarioIncidencias,
              completado: true,
              fechaCompletado: new Date().toISOString(),
              numRespuestas: respuestas.length,
              totalPreguntas: 12,
              respuestas,
              informacionAdicional,
            },
          };
          saveCandidatoFirestore(updated);
          return updated;
        }
        return c;
      })
    );

    if (selectedCandidateForModal && selectedCandidateForModal.id === candidatoId) {
      setSelectedCandidateForModal((prev) =>
        prev
          ? {
              ...prev,
              cuestionarioIncidencias: {
                ...prev.cuestionarioIncidencias,
                completado: true,
                fechaCompletado: new Date().toISOString(),
                numRespuestas: respuestas.length,
                totalPreguntas: 12,
                respuestas,
                informacionAdicional,
              },
            }
          : null
      );
    }

    // Automatically run AI analysis
    await handleRunAiAnalysisQuestionnaire(candidatoId, respuestas, informacionAdicional, candidateName);
  };

  // Add candidate handler
  const handleAddCandidato = (newCand: Candidato) => {
    setCandidatos((prev) => [newCand, ...prev]);
    saveCandidatoFirestore(newCand);

    // Update candidate count on corresponding property
    setInmuebles((prevInm) =>
      prevInm.map((inm) => {
        if (inm.id === newCand.inmuebleId) {
          const updatedInm = { ...inm, candidatosCount: inm.candidatosCount + 1 };
          saveInmuebleFirestore(updatedInm);
          return updatedInm;
        }
        return inm;
      })
    );
  };

  // Update candidate status handler
  const handleUpdateStatus = (candidateId: string, newStatus: CandidateStatus) => {
    let updatedCandObj: Candidato | undefined;
    setCandidatos((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const updated = { ...c, estado: newStatus };
          updatedCandObj = updated;
          saveCandidatoFirestore(updated);
          return updated;
        }
        return c;
      })
    );

    if (selectedCandidateForModal && selectedCandidateForModal.id === candidateId) {
      setSelectedCandidateForModal((prev) => (prev ? { ...prev, estado: newStatus } : null));
    }

    // Auto-create visit invitation if candidate is preselected
    if (newStatus === 'preseleccionado') {
      const cand = updatedCandObj || candidatos.find((c) => c.id === candidateId);
      if (cand) {
        const existingInv = invitaciones.find((i) => i.candidateId === candidateId);
        if (!existingInv) {
          const sol = solicitudes.find((s) => s.candidatoId === cand.id);
          const tokenVal = cand.cuestionarioToken || `vst-${cand.id}-${Math.random().toString(36).substring(2, 7)}`;
          const newInv: InvitacionVisita = {
            id: `inv-${cand.id}`,
            token: tokenVal,
            candidateId: cand.id,
            candidateNombre: cand.nombre,
            candidateTelefono: cand.telefono,
            candidateEmail: cand.email,
            inmuebleId: cand.inmuebleId,
            inmuebleNombre: cand.inmuebleNombre || 'Inmueble',
            inmueblePrecio: sol?.inmueblePrecio || 900,
            inmuebleCiudad: sol?.inmuebleCiudad || 'Ciudad',
            solicitudEstado: sol?.estado || 'DOCUMENTACIÓN COMPLETA',
            cuestionarioCompletado: !!cand.cuestionarioIncidencias?.completado,
            scoreSolvencia: cand.scoreEstimado || sol?.scoreSolvencia || 80,
            perfilOperativo: sol?.perfilOperativo || 80,
            status: 'PENDIENTE DE ENVIAR',
            fechaPreseleccion: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
          };
          handleSaveInvitacion(newInv);
        }
      }
    }
  };

  // Save / Update invitation handler
  const handleSaveInvitacion = (inv: InvitacionVisita) => {
    setInvitaciones((prev) => {
      const idx = prev.findIndex((i) => i.id === inv.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = inv;
        return next;
      }
      return [...prev, inv];
    });
    saveInvitacionFirestore(inv);
  };

  // Save / Update visit slot handler
  const handleSaveVisitSlot = (slot: VisitSlot) => {
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === slot.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = slot;
        return next;
      }
      return [...prev, slot];
    });
    saveVisitSlotFirestore(slot);
  };

  // Update candidate analyzed documents handler
  const handleUpdateCandidateDocs = (
    candidateId: string,
    docs: any[],
    updatedCandidateData?: Partial<Candidato>
  ) => {
    setCandidatos((prev) =>
      prev.map((c) => {
        if (c.id === candidateId) {
          const updated = {
            ...c,
            ...updatedCandidateData,
            documentosAnalizados: docs,
          };
          saveCandidatoFirestore(updated);
          return updated;
        }
        return c;
      })
    );

    if (selectedCandidateForModal && selectedCandidateForModal.id === candidateId) {
      setSelectedCandidateForModal((prev) =>
        prev
          ? {
              ...prev,
              ...updatedCandidateData,
              documentosAnalizados: docs,
            }
          : null
      );
    }
  };

  // Handle generating/opening Smart Candidate Report
  const handleOpenOrGenerateReport = (cand: Candidato, forceRegenerate: boolean = false) => {
    const property = inmuebles.find((i) => i.id === cand.inmuebleId);

    let reportToView: InformeInteligente;
    let updatedCand = { ...cand };

    if (!forceRegenerate && cand.ultimoInforme) {
      reportToView = cand.ultimoInforme;
    } else {
      // Generate fresh report
      const newReport = generarInformeInteligente(cand, property);
      const updatedHistory = [newReport, ...(cand.informesHistorico || [])];
      
      updatedCand = {
        ...cand,
        informesHistorico: updatedHistory,
        ultimoInforme: newReport,
      };

      // Save updated candidate in state and Firestore
      setCandidatos((prev) =>
        prev.map((c) => (c.id === cand.id ? updatedCand : c))
      );
      saveCandidatoFirestore(updatedCand);

      if (selectedCandidateForModal && selectedCandidateForModal.id === cand.id) {
        setSelectedCandidateForModal(updatedCand);
      }

      reportToView = newReport;
    }

    setSelectedCandidateForReport(updatedCand);
    setActiveReport(reportToView);
  };

  // Delete candidate handler
  const handleDeleteCandidato = (candidateId: string) => {
    // 1. Free any visit slots booked by this candidate
    const candidateInvitations = invitaciones.filter((inv) => inv.candidateId === candidateId);
    const candidateInvIds = new Set(candidateInvitations.map((inv) => inv.id));

    const slotsToUpdate = slots.filter(
      (s) => s.reservaCandidateId === candidateId || (s.reservaInvitationId && candidateInvIds.has(s.reservaInvitationId))
    );

    if (slotsToUpdate.length > 0) {
      slotsToUpdate.forEach((slot) => {
        const freedSlot: VisitSlot = {
          ...slot,
          disponible: true,
          reservaCandidateId: undefined,
          reservaCandidateNombre: undefined,
          reservaInvitationId: undefined,
        };
        saveVisitSlotFirestore(freedSlot);
      });

      setSlots((prev) =>
        prev.map((s) => {
          if (s.reservaCandidateId === candidateId || (s.reservaInvitationId && candidateInvIds.has(s.reservaInvitationId))) {
            return {
              ...s,
              disponible: true,
              reservaCandidateId: undefined,
              reservaCandidateNombre: undefined,
              reservaInvitationId: undefined,
            };
          }
          return s;
        })
      );
    }

    // 2. Delete candidate's invitations
    candidateInvitations.forEach((inv) => {
      deleteInvitacionFirestore(inv.id);
    });
    setInvitaciones((prev) => prev.filter((inv) => inv.candidateId !== candidateId));

    // 3. Delete candidate
    setCandidatos((prev) => prev.filter((c) => c.id !== candidateId));
    deleteCandidatoFirestore(candidateId);

    if (selectedCandidateForModal?.id === candidateId) {
      setSelectedCandidateForModal(null);
    }
    if (selectedCandidateForReport?.id === candidateId) {
      setSelectedCandidateForReport(null);
      setActiveReport(null);
    }
  };

  // Delete inmueble handler
  const handleDeleteInmueble = (inmuebleId: string) => {
    setInmuebles((prev) => {
      const next = prev.filter((i) => i.id !== inmuebleId);
      try { localStorage.setItem('rentselect_inmuebles', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    deleteInmuebleFirestore(inmuebleId);

    // Safely update candidates associated with this property
    setCandidatos((prev) => {
      const next = prev.map((c) => {
        if (c.inmuebleId === inmuebleId) {
          const updated = { ...c, inmuebleId: '', inmuebleNombre: 'Sin inmueble asignado' };
          saveCandidatoFirestore(updated);
          return updated;
        }
        return c;
      });
      try { localStorage.setItem('rentselect_candidatos', JSON.stringify(next)); } catch (e) {}
      return next;
    });
  };

  // Add inmueble handler
  const handleAddInmueble = (newInmueble: Inmueble) => {
    setInmuebles((prev) => {
      const next = [newInmueble, ...prev];
      try { localStorage.setItem('rentselect_inmuebles', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    saveInmuebleFirestore(newInmueble);
  };

  // Update inmueble handler
  const handleUpdateInmueble = (updatedInmueble: Inmueble) => {
    setInmuebles((prev) => {
      const next = prev.map((i) => (i.id === updatedInmueble.id ? updatedInmueble : i));
      try { localStorage.setItem('rentselect_inmuebles', JSON.stringify(next)); } catch (e) {}
      return next;
    });
    saveInmuebleFirestore(updatedInmueble);
  };

  // Slot Handlers
  const handleDeleteSlot = (slotId: string) => {
    const slotToDelete = slots.find((s) => s.id === slotId);

    setSlots((prev) => prev.filter((s) => s.id !== slotId));
    deleteVisitSlotFirestore(slotId);

    if (slotToDelete) {
      const candidateId = slotToDelete.reservaCandidateId;
      const invitationId = slotToDelete.reservaInvitationId;

      // Find affected invitations
      const affectedInvs = invitaciones.filter(
        (inv) =>
          inv.reserva?.slotId === slotId ||
          (invitationId && inv.id === invitationId) ||
          (candidateId && inv.candidateId === candidateId)
      );

      const affectedCandIds = new Set<string>();
      if (candidateId) affectedCandIds.add(candidateId);

      affectedInvs.forEach((inv) => {
        if (inv.candidateId) affectedCandIds.add(inv.candidateId);

        const updatedInv: InvitacionVisita = {
          ...inv,
          status: 'ABIERTO',
          reserva: undefined,
        };
        saveInvitacionFirestore(updatedInv);
        setInvitaciones((prev) =>
          prev.map((i) => (i.id === updatedInv.id ? updatedInv : i))
        );
      });

      affectedCandIds.forEach((cId) => {
        setCandidatos((prev) =>
          prev.map((c) => {
            if (c.id === cId) {
              const updated = { ...c, estado: 'preseleccionado' as CandidateStatus };
              saveCandidatoFirestore(updated);
              return updated;
            }
            return c;
          })
        );
      });
    }
  };

  const handleDeleteSlotsBatch = (slotIds: string[]) => {
    if (!slotIds || slotIds.length === 0) return;
    const idsSet = new Set(slotIds);
    const targetSlots = slots.filter((s) => idsSet.has(s.id));

    setSlots((prev) => prev.filter((s) => !idsSet.has(s.id)));
    deleteMultipleSlotsFirestore(slotIds);

    const candidateIds = new Set<string>();
    const invitationIds = new Set<string>();

    targetSlots.forEach((s) => {
      if (s.reservaCandidateId) candidateIds.add(s.reservaCandidateId);
      if (s.reservaInvitationId) invitationIds.add(s.reservaInvitationId);
    });

    const affectedInvs = invitaciones.filter(
      (inv) =>
        (inv.reserva?.slotId && idsSet.has(inv.reserva.slotId)) ||
        invitationIds.has(inv.id) ||
        candidateIds.has(inv.candidateId)
    );

    affectedInvs.forEach((inv) => {
      if (inv.candidateId) candidateIds.add(inv.candidateId);

      const updatedInv: InvitacionVisita = {
        ...inv,
        status: 'ABIERTO',
        reserva: undefined,
      };
      saveInvitacionFirestore(updatedInv);
      setInvitaciones((prev) =>
        prev.map((i) => (i.id === updatedInv.id ? updatedInv : i))
      );
    });

    candidateIds.forEach((cId) => {
      setCandidatos((prev) =>
        prev.map((c) => {
          if (c.id === cId) {
            const updated = { ...c, estado: 'preseleccionado' as CandidateStatus };
            saveCandidatoFirestore(updated);
            return updated;
          }
          return c;
        })
      );
    });
  };

  const handleUpdateSlot = (updatedSlot: VisitSlot) => {
    const prevSlot = slots.find((s) => s.id === updatedSlot.id);

    setSlots((prev) =>
      prev.map((s) => (s.id === updatedSlot.id ? updatedSlot : s))
    );
    saveVisitSlotFirestore(updatedSlot);

    // If a previously reserved slot is now freed/unreserved
    if (prevSlot && (prevSlot.reservaCandidateId || prevSlot.reservaInvitationId)) {
      if (!updatedSlot.reservaCandidateId || updatedSlot.disponible) {
        const candidateId = prevSlot.reservaCandidateId;
        const invitationId = prevSlot.reservaInvitationId;

        const affectedInvs = invitaciones.filter(
          (inv) =>
            inv.reserva?.slotId === updatedSlot.id ||
            (invitationId && inv.id === invitationId) ||
            (candidateId && inv.candidateId === candidateId)
        );

        const affectedCandIds = new Set<string>();
        if (candidateId) affectedCandIds.add(candidateId);

        affectedInvs.forEach((inv) => {
          if (inv.candidateId) affectedCandIds.add(inv.candidateId);

          const updatedInv: InvitacionVisita = {
            ...inv,
            status: 'ABIERTO',
            reserva: undefined,
          };
          saveInvitacionFirestore(updatedInv);
          setInvitaciones((prev) =>
            prev.map((i) => (i.id === updatedInv.id ? updatedInv : i))
          );
        });

        affectedCandIds.forEach((cId) => {
          setCandidatos((prev) =>
            prev.map((c) => {
              if (c.id === cId) {
                const updated = { ...c, estado: 'preseleccionado' as CandidateStatus };
                saveCandidatoFirestore(updated);
                return updated;
              }
              return c;
            })
          );
        });
      }
    }
  };

  // Import data handler (for syncing from other app)
  const handleImportData = (importedData: { candidatos?: Candidato[]; inmuebles?: Inmueble[] }) => {
    if (importedData.inmuebles && Array.isArray(importedData.inmuebles)) {
      setInmuebles((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newItems = importedData.inmuebles!.filter((i) => !existingIds.has(i.id));
        newItems.forEach((inm) => saveInmuebleFirestore(inm));
        return [...newItems, ...prev];
      });
    }

    if (importedData.candidatos && Array.isArray(importedData.candidatos)) {
      setCandidatos((prev) => {
        const existingIds = new Set(prev.map((c) => c.id));
        const newItems = importedData.candidatos!.filter((c) => !existingIds.has(c.id));
        newItems.forEach((cand) => saveCandidatoFirestore(cand));
        return [...newItems, ...prev];
      });
    }
  };

  // Handler to run AI analysis for questionnaire responses
  const handleRunAiAnalysisQuestionnaire = async (
    candidateId: string,
    customRespuestas?: RespuestaIncidencia[],
    customInfoAdicional?: string,
    customNombre?: string
  ) => {
    const candidate = candidatos.find((c) => c.id === candidateId);
    const respuestasToAnalyze = customRespuestas || candidate?.cuestionarioIncidencias?.respuestas;
    if (!respuestasToAnalyze || respuestasToAnalyze.length === 0) return;

    const candidatoNombre = customNombre || candidate?.nombre || 'Candidato';
    const informacionAdicional =
      customInfoAdicional !== undefined
        ? customInfoAdicional
        : candidate?.cuestionarioIncidencias?.informacionAdicional || '';

    try {
      const response = await fetch('/api/analizar-cuestionario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidatoNombre,
          respuestas: respuestasToAnalyze,
          informacionAdicional,
        }),
      });

      if (!response.ok) {
        throw new Error('Error en servidor al analizar cuestionario');
      }

      const analysisResult = await response.json();

      setCandidatos((prev) =>
        prev.map((c) => {
          if (c.id === candidateId) {
            const updated: Candidato = {
              ...c,
              cuestionarioIncidencias: {
                ...c.cuestionarioIncidencias!,
                completado: true,
                fechaCompletado: c.cuestionarioIncidencias?.fechaCompletado || new Date().toISOString(),
                numRespuestas: respuestasToAnalyze.length,
                totalPreguntas: 12,
                respuestas: respuestasToAnalyze,
                informacionAdicional,
                analisisIa: analysisResult,
              },
            };
            saveCandidatoFirestore(updated);
            return updated;
          }
          return c;
        })
      );

      if (selectedCandidateForModal && selectedCandidateForModal.id === candidateId) {
        setSelectedCandidateForModal((prev) =>
          prev
            ? {
                ...prev,
                cuestionarioIncidencias: {
                  ...prev.cuestionarioIncidencias!,
                  completado: true,
                  fechaCompletado: prev.cuestionarioIncidencias?.fechaCompletado || new Date().toISOString(),
                  numRespuestas: respuestasToAnalyze.length,
                  totalPreguntas: 12,
                  respuestas: respuestasToAnalyze,
                  informacionAdicional,
                  analisisIa: analysisResult,
                },
              }
            : null
        );
      }
    } catch (err) {
      console.error('Error al realizar el análisis del cuestionario:', err);
    }
  };

  // Handler for creating/submitting new Solicitud from Candidate Portal
  const handleSavePublicSolicitud = (newSol: SolicitudAlquiler) => {
    setSolicitudes((prev) => [newSol, ...prev]);
    saveSolicitudFirestore(newSol);

    // Also sync or create candidate record if not present
    const existingCandidate = candidatos.find(
      (c) => c.email.toLowerCase() === newSol.candidatoEmail.toLowerCase()
    );

    if (!existingCandidate) {
      const respuestas = newSol.cuestionarioData?.respuestas || [];
      const newCand: Candidato = {
        id: newSol.candidatoId,
        nombre: newSol.candidatoNombre,
        email: newSol.candidatoEmail,
        telefono: newSol.candidatoTelefono,
        estado: 'nuevo',
        fechaCreacion: new Date().toISOString().split('T')[0],
        inmuebleId: newSol.inmuebleId,
        inmuebleNombre: newSol.inmuebleNombre,
        tipoEmpleo: newSol.situacionLaboral,
        tipoContrato: newSol.tipoContrato,
        antiguedadLaboral: newSol.antiguedadLaboral,
        ingresosNetos: newSol.ingresosNetosMensuales,
        numPersonas: newSol.numTotalPersonas,
        otrosIngresos: newSol.otrosIngresos || 0,
        avalista: newSol.tieneAvalista,
        observaciones: '',
        documentos: newSol.documentos || [],
        scoreEstimado: newSol.scoreSolvencia || 82,
        cuestionarioToken: `q-${newSol.id}`,
        cuestionarioIncidencias: {
          completado: newSol.cuestionarioCompletado,
          fechaCompletado: newSol.cuestionarioCompletado ? new Date().toISOString() : undefined,
          numRespuestas: respuestas.length,
          totalPreguntas: 12,
          respuestas,
        },
      };
      saveCandidatoFirestore(newCand);
    }
  };

  // Handler for updating Solicitud Status / Notes
  const handleUpdateSolicitudState = (
    solicitudId: string,
    nuevoEstado: SolicitudEstado,
    notaPropietario?: string
  ) => {
    setSolicitudes((prev) =>
      prev.map((sol) => {
        if (sol.id === solicitudId) {
          const historialItem = {
            id: `h-${Date.now()}`,
            fecha: new Date().toISOString(),
            accion: `Cambio de estado a ${nuevoEstado}`,
            comentario: notaPropietario || `Estado cambiado a ${nuevoEstado}`,
            estadoAnterior: sol.estado,
            estadoNuevo: nuevoEstado,
          };

          const updated: SolicitudAlquiler = {
            ...sol,
            estado: nuevoEstado,
            notasPropietario: notaPropietario !== undefined ? notaPropietario : sol.notasPropietario,
            observacionesOwner: notaPropietario !== undefined ? notaPropietario : sol.observacionesOwner,
            historial: [historialItem, ...(sol.historial || [])],
            fechaActualizacion: new Date().toISOString(),
          };

          saveSolicitudFirestore(updated);
          if (selectedSolicitudForModal && selectedSolicitudForModal.id === solicitudId) {
            setSelectedSolicitudForModal(updated);
          }

          return updated;
        }
        return sol;
      })
    );
  };

  // Trigger AI analysis on a Solicitud
  const handleAiAnalysisSolicitud = async (sol: SolicitudAlquiler) => {
    try {
      const respuestasToAnalyze = sol.cuestionarioData?.respuestas || [];
      const response = await fetch('/api/analizar-cuestionario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidatoNombre: sol.candidatoNombre,
          respuestas: respuestasToAnalyze,
          informacionAdicional: '',
        }),
      });

      if (!response.ok) throw new Error('Error al analizar solicitud con IA');
      const analysisResult = await response.json();

      setSolicitudes((prev) =>
        prev.map((s) => {
          if (s.id === sol.id) {
            const updated = {
              ...s,
              estado: 'EN ANÁLISIS' as SolicitudEstado,
              analisisIa: analysisResult,
            };
            saveSolicitudFirestore(updated);
            if (selectedSolicitudForModal && selectedSolicitudForModal.id === sol.id) {
              setSelectedSolicitudForModal(updated);
            }
            return updated;
          }
          return s;
        })
      );
    } catch (err) {
      console.error('Error analizando solicitud con IA:', err);
    }
  };

  // Helper to synchronize documents from SolicitudDocumentacion into the candidate profile
  const syncCandidateWithSolicitudDoc = (
    solDoc: SolicitudDocumentacion,
    candidateList: Candidato[]
  ): { updatedCandidates: Candidato[]; targetCand: Candidato | null } => {
    const targetCand = candidateList.find(
      (c) =>
        c.id === solDoc.candidatoId ||
        (solDoc.candidatoNombre && c.nombre && c.nombre.trim().toLowerCase() === solDoc.candidatoNombre.trim().toLowerCase()) ||
        (solDoc.candidatoTelefono && c.telefono.replace(/\s+/g, '') === solDoc.candidatoTelefono.replace(/\s+/g, '')) ||
        (solDoc.candidatoEmail && c.email.toLowerCase() === solDoc.candidatoEmail.toLowerCase())
    );

    if (!targetCand) {
      return { updatedCandidates: candidateList, targetCand: null };
    }

    const existingDocs: DocumentoAnalizado[] = targetCand.documentosAnalizados || [];
    const mergedDocsMap = new Map<string, DocumentoAnalizado>();

    // 1. Add existing analyzed documents
    existingDocs.forEach((d) => {
      mergedDocsMap.set(d.id, d);
      if (d.nombreArchivo) {
        mergedDocsMap.set(`name_${d.nombreArchivo}`, d);
      }
    });

    // 2. Extract and merge uploaded files from SolicitudDocumentacion
    solDoc.documentos.forEach((item) => {
      (item.archivos || []).forEach((archivo) => {
        const existingById = mergedDocsMap.get(archivo.id);
        const existingByName = archivo.nombreArchivo ? mergedDocsMap.get(`name_${archivo.nombreArchivo}`) : undefined;
        const matched = existingById || existingByName;

        if (matched) {
          const updatedDoc: DocumentoAnalizado = {
            ...matched,
            tipoDocumento: item.tipo || matched.tipoDocumento,
            base64Data: archivo.base64Data || matched.base64Data,
            url: archivo.url || (matched as any).url,
            nombreArchivo: archivo.nombreArchivo || matched.nombreArchivo,
            estadoAnalisis: item.estado === 'validado' ? 'analizado' : matched.estadoAnalisis || 'pendiente',
          };
          mergedDocsMap.set(matched.id, updatedDoc);
        } else {
          const newDoc: DocumentoAnalizado = {
            id: archivo.id,
            candidatoId: targetCand.id,
            nombreArchivo: archivo.nombreArchivo,
            mimeType: archivo.mimeType || 'application/pdf',
            base64Data: archivo.base64Data,
            url: archivo.url,
            tipoDocumento: item.tipo || 'otro',
            fechaSubida: archivo.fechaSubida || new Date().toISOString().split('T')[0],
            estadoAnalisis: item.estado === 'validado' ? 'analizado' : 'pendiente',
          };
          mergedDocsMap.set(newDoc.id, newDoc);
        }
      });
    });

    const finalDocsAnalizados = Array.from(mergedDocsMap.values()).filter(
      (doc, index, self) => self.findIndex((d) => d.id === doc.id) === index
    );

    const updatedDocumentosList = (targetCand.documentos || []).map((docStatus) => {
      const isUploaded = solDoc.documentos.some((d) => {
        const hasFiles = d.archivos && d.archivos.length > 0;
        if (!hasFiles) return false;
        const normItemName = d.nombre.toLowerCase();
        const normStatusName = docStatus.nombre.toLowerCase();
        return (
          normItemName.includes(normStatusName) ||
          normStatusName.includes(normItemName) ||
          (d.tipo === 'nomina' && normStatusName.includes('nómina')) ||
          (d.tipo === 'dni_nie' && (normStatusName.includes('dni') || normStatusName.includes('nie'))) ||
          (d.tipo === 'contrato' && normStatusName.includes('contrato')) ||
          (d.tipo === 'vida_laboral' && normStatusName.includes('laboral')) ||
          (d.tipo === 'renta' && normStatusName.includes('renta'))
        );
      });

      return {
        ...docStatus,
        subido: isUploaded || docStatus.subido,
      };
    });

    const isComplete =
      solDoc.estado === 'COMPLETADA' ||
      solDoc.estado === 'APROBADA' ||
      solDoc.documentos.every((d) => !d.obligatorio || (d.archivos && d.archivos.length > 0));

    const isPartial =
      solDoc.estado === 'PARCIALMENTE_APORTADA' ||
      solDoc.documentos.some((d) => d.archivos && d.archivos.length > 0);

    const estadoDoc = isComplete ? 'completa' : isPartial ? 'parcial' : targetCand.estadoDocumentacion || 'solicitada';

    const updatedCand: Candidato = {
      ...targetCand,
      documentosAnalizados: finalDocsAnalizados,
      documentos: updatedDocumentosList,
      estadoDocumentacion: estadoDoc,
    };

    const updatedCandidates = candidateList.map((c) => (c.id === updatedCand.id ? updatedCand : c));
    return { updatedCandidates, targetCand: updatedCand };
  };

  // Handlers for Solicitudes de Documentación (Fase 2)
  const handleSaveSolicitudDoc = async (solDoc: SolicitudDocumentacion) => {
    setSolicitudesDoc((prev) => {
      const exists = prev.some((s) => s.id === solDoc.id);
      if (exists) {
        return prev.map((s) => (s.id === solDoc.id ? solDoc : s));
      }
      return [solDoc, ...prev];
    });
    await saveSolicitudDocFirestore(solDoc);

    // Synchronize uploaded documents immediately to candidate profile
    setCandidatos((currentCandidatos) => {
      const { updatedCandidates, targetCand } = syncCandidateWithSolicitudDoc(solDoc, currentCandidatos);
      if (targetCand) {
        saveCandidatoFirestore(targetCand);
        if (selectedCandidateForModal && selectedCandidateForModal.id === targetCand.id) {
          setSelectedCandidateForModal(targetCand);
        }
      }
      return updatedCandidates;
    });
  };

  const handlePublicDocSubmit = async (
    targetToken: string,
    updatedDocs: ItemDocumentoSolicitado[],
    isFinalSubmit: boolean
  ) => {
    const existing = solicitudesDoc.find(
      (s) =>
        s.token === targetToken ||
        s.id === targetToken ||
        s.id === `doc-${targetToken}` ||
        s.token === activePublicDocToken ||
        s.id === activePublicDocToken ||
        (activePublicDocToken && (s.token.includes(activePublicDocToken) || activePublicDocToken.includes(s.token)))
    );
    if (!existing) return;

    const allUploaded = updatedDocs.every(
      (d) => (d.archivos && d.archivos.length > 0) || !d.obligatorio
    );

    const newEstado = isFinalSubmit
      ? allUploaded
        ? 'COMPLETADA'
        : 'PARCIALMENTE_APORTADA'
      : existing.estado === 'PENDIENTE' || existing.estado === 'SOLICITADA'
      ? 'PARCIALMENTE_APORTADA'
      : existing.estado;

    const newHistorial = [
      ...existing.historial,
      {
        id: `h-${Date.now()}`,
        fecha: new Date().toLocaleString('es-ES'),
        autor: 'candidato' as const,
        accion: isFinalSubmit ? 'Documentación enviada' : 'Documentos actualizados',
        detalle: isFinalSubmit
          ? 'El candidato finalizó y envió la documentación para su revisión'
          : 'El candidato aportó o modificó archivos adjuntos',
      },
    ];

    const updated: SolicitudDocumentacion = {
      ...existing,
      documentos: updatedDocs,
      estado: newEstado,
      fechaUltimaActividad: new Date().toISOString(),
      historial: newHistorial,
    };

    await handleSaveSolicitudDoc(updated);
  };

  // Handlers for Formalización & Contratos LAU (Fase 3)
  const handleOpenFormalizarModal = (
    candidato: Candidato,
    inmueble?: Inmueble,
    contrato?: ContratoFormalizacion
  ) => {
    const targetInm = inmueble || inmuebles.find((i) => i.id === candidato.inmuebleId);
    const existing = contrato || contratos.find((c) => c.candidatoId === candidato.id);
    setFormalizarModalState({
      isOpen: true,
      candidato,
      inmueble: targetInm,
      contrato: existing,
    });
  };

  const handleSaveContrato = async (
    savedContrato: ContratoFormalizacion,
    marcarInmuebleAlquilado?: boolean
  ) => {
    // FASE 1.4: si quien formaliza es un propietario, el contrato debe llevar
    // SIEMPRE su propietarioId (clave de aislamiento y de las reglas de acceso),
    // aunque el inmueble aún no lo tuviera informado.
    let contratoAsegurado = savedContrato;
    if (
      currentUser?.tipoPerfil === 'PROPIETARIO' &&
      currentUser.propietarioId &&
      !savedContrato.propietarioId
    ) {
      contratoAsegurado = { ...savedContrato, propietarioId: currentUser.propietarioId };
    }

    // Garantiza que el contrato nazca ya con su calendario de cobros materializado,
    // conservando cualquier periodo ya existente (pagos/justificantes no se tocan).
    const contratoConCobros: ContratoFormalizacion =
      contratoAsegurado.registroCobros && contratoAsegurado.registroCobros.length > 0
        ? contratoAsegurado
        : { ...contratoAsegurado, registroCobros: generarPeriodosParaContrato(contratoAsegurado) };

    setContratos((prev) => {
      const exists = prev.some((c) => c.id === contratoConCobros.id);
      if (exists) {
        return prev.map((c) => (c.id === contratoConCobros.id ? contratoConCobros : c));
      }
      return [contratoConCobros, ...prev];
    });
    await saveContratoFirestore(contratoConCobros);

    if (marcarInmuebleAlquilado && savedContrato.inmuebleId) {
      setInmuebles((prev) =>
        prev.map((i) => {
          if (i.id === savedContrato.inmuebleId) {
            const updated: Inmueble = {
              ...i,
              estado: 'alquilado',
              inquilinoActualId: savedContrato.candidatoId,
              inquilinoActualNombre: savedContrato.candidatoNombre,
              contratoActivoId: savedContrato.id,
            };
            saveInmuebleFirestore(updated);
            return updated;
          }
          return i;
        })
      );
    }
  };

  const handleFinalizarContrato = async (contratoId: string) => {
    const targetContrato = contratos.find((c) => c.id === contratoId);
    if (!targetContrato) return;

    const fechaFin = new Date().toISOString().split('T')[0];
    const updatedContrato: ContratoFormalizacion = {
      ...targetContrato,
      estado: 'FINALIZADO',
      esVigente: false,
      fechaFinContrato: targetContrato.fechaFinContrato || fechaFin,
      fechaActualizacion: new Date().toISOString(),
      historial: [
        {
          id: `hist-${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'sistema',
          accion: 'Contrato finalizado',
          detalle: 'El contrato concluyó su vigencia y pasa a formar parte del historial del inmueble.',
        },
        ...targetContrato.historial,
      ],
    };

    setContratos((prev) => prev.map((c) => (c.id === contratoId ? updatedContrato : c)));
    await saveContratoFirestore(updatedContrato);

    if (targetContrato.inmuebleId) {
      setInmuebles((prev) =>
        prev.map((i) => {
          if (i.id === targetContrato.inmuebleId) {
            const updated: Inmueble = {
              ...i,
              estado: 'disponible',
              inquilinoActualId: undefined,
              inquilinoActualNombre: undefined,
              contratoActivoId: undefined,
            };
            saveInmuebleFirestore(updated);
            return updated;
          }
          return i;
        })
      );
    }
  };

  const handleDeleteContrato = async (contratoId: string) => {
    setContratos((prev) => prev.filter((c) => c.id !== contratoId));
    await deleteContratoFirestore(contratoId);
  };

  // FASE 2.0 — Handlers de gastos. Se garantiza SIEMPRE propietarioId (clave de
  // aislamiento), resolviéndolo desde el inmueble o el propietario autenticado.
  // Devuelve el documento final (lo necesita la subida de factura del modal).
  const resolvePropietarioId = (inmuebleId: string, previo?: string): string => {
    if (previo) return previo;
    const inm = inmuebles.find((i) => i.id === inmuebleId);
    return (
      inm?.propietarioId ||
      inm?.propietarioPrincipalId ||
      (currentUser?.tipoPerfil === 'PROPIETARIO' ? currentUser.propietarioId || '' : '') ||
      ''
    );
  };

  const handleSaveGasto = async (gasto: Gasto): Promise<Gasto> => {
    const finalGasto: Gasto = {
      ...gasto,
      propietarioId: resolvePropietarioId(gasto.inmuebleId, gasto.propietarioId),
    };

    setGastos((prev) => {
      const exists = prev.some((g) => g.id === finalGasto.id);
      return exists
        ? prev.map((g) => (g.id === finalGasto.id ? finalGasto : g))
        : [finalGasto, ...prev];
    });
    await saveGastoFirestore(finalGasto);
    return finalGasto;
  };

  const handleDeleteGasto = async (gastoId: string) => {
    setGastos((prev) => prev.filter((g) => g.id !== gastoId));
    await deleteGastoFirestore(gastoId);
  };

  // FASE 2.2 — Plantillas de gastos recurrentes.
  const handleSaveRecurrente = async (plantilla: GastoRecurrente): Promise<void> => {
    const finalPlantilla: GastoRecurrente = {
      ...plantilla,
      propietarioId: resolvePropietarioId(plantilla.inmuebleId, plantilla.propietarioId),
    };
    setGastosRecurrentes((prev) => {
      const exists = prev.some((r) => r.id === finalPlantilla.id);
      return exists
        ? prev.map((r) => (r.id === finalPlantilla.id ? finalPlantilla : r))
        : [finalPlantilla, ...prev];
    });
    await saveGastoRecurrenteFirestore(finalPlantilla);
  };

  const handleDeleteRecurrente = async (plantillaId: string) => {
    // Los apuntes ya materializados se conservan (histórico).
    setGastosRecurrentes((prev) => prev.filter((r) => r.id !== plantillaId));
    await deleteGastoRecurrenteFirestore(plantillaId);
  };

  // FASE 2.3 — Préstamos. Al guardar se crea/actualiza la plantilla recurrente
  // de la cuota (importe = cuota constante francesa); al eliminar se desactiva
  // esa plantilla, conservando los recibos ya generados.
  const handleSavePrestamo = async (prestamo: Prestamo): Promise<void> => {
    const propietarioId = resolvePropietarioId(prestamo.inmuebleId, prestamo.propietarioId);
    const inm = inmuebles.find((i) => i.id === prestamo.inmuebleId);

    // FASE 2.4: con carencia/tipo variable, la primera cuota debida y el mes de
    // inicio de la plantilla se derivan del cuadro; en el caso simple coinciden
    // con la cuota constante francesa y el mes de inicio del préstamo.
    const tabla = generarTablaAmortizacion(prestamo);
    const primeraConCuota = tabla.find((f) => f.cuota > 0);
    const cuotaNominal =
      primeraConCuota?.cuota ||
      calcularCuotaConstante(prestamo.capitalInicial, prestamo.tasaInteresAnual, prestamo.plazoMeses);
    const inicioPlantilla = primeraConCuota?.periodo || prestamo.fechaInicio;

    const concepto = `Cuota ${prestamo.tipo === 'HIPOTECARIO' ? 'hipotecaria' : 'de préstamo'}${
      inm ? ` · ${inm.direccion}` : ''
    }`;

    const recurrenteId = prestamo.gastoRecurrenteId;
    const existente = recurrenteId
      ? gastosRecurrentes.find((r) => r.id === recurrenteId)
      : undefined;

    const base = crearGastoRecurrente({
      inmuebleId: prestamo.inmuebleId,
      propietarioId,
      categoria: 'CUOTA_HIPOTECARIA',
      concepto,
      importe: cuotaNominal,
      frecuencia: 'MENSUAL',
      diaVencimiento: prestamo.diaVencimiento,
      fechaInicio: inicioPlantilla,
      creadoPor: currentUser?.nombre,
      creadoPorId: currentUser?.id,
    });
    const plantilla: GastoRecurrente = normalizarRecurrente({
      ...base,
      ...(recurrenteId ? { id: recurrenteId } : {}),
      proveedor: prestamo.entidad?.trim() || undefined,
      concepto,
      importe: cuotaNominal,
      aCargoDe: 'arrendador',
      deducible: false,
      metodoPago: 'domiciliacion',
      notas: prestamo.descripcion?.trim() || undefined,
      activo: prestamo.activo,
      ...(existente
        ? { ultimoPeriodoGenerado: existente.ultimoPeriodoGenerado, createdAt: existente.createdAt }
        : {}),
    });
    await handleSaveRecurrente(plantilla);

    const finalPrestamo: Prestamo = {
      ...prestamo,
      propietarioId,
      gastoRecurrenteId: plantilla.id,
      updatedAt: new Date().toISOString(),
    };
    setPrestamos((prev) => {
      const exists = prev.some((p) => p.id === finalPrestamo.id);
      return exists
        ? prev.map((p) => (p.id === finalPrestamo.id ? finalPrestamo : p))
        : [finalPrestamo, ...prev];
    });
    await savePrestamoFirestore(finalPrestamo);
  };

  const handleDeletePrestamo = async (prestamoId: string) => {
    const prestamo = prestamos.find((p) => p.id === prestamoId);
    if (prestamo?.gastoRecurrenteId) {
      const plantilla = gastosRecurrentes.find((r) => r.id === prestamo.gastoRecurrenteId);
      // Se desactiva la plantilla vinculada; los recibos históricos se conservan.
      if (plantilla && plantilla.activo) {
        await handleSaveRecurrente({
          ...plantilla,
          activo: false,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    setPrestamos((prev) => prev.filter((p) => p.id !== prestamoId));
    await deletePrestamoFirestore(prestamoId);
  };

  // FASE 3.1 — Expedientes de recomercialización.
  const handleSaveExpedienteRecomerc = async (expediente: ExpedienteRecomercializacion) => {
    const propietarioId = resolvePropietarioId(expediente.inmuebleId, expediente.propietarioId);
    const finalExp: ExpedienteRecomercializacion = { ...expediente, propietarioId };
    setExpedientesRecomerc((prev) => {
      const exists = prev.some((e) => e.id === finalExp.id);
      return exists
        ? prev.map((e) => (e.id === finalExp.id ? finalExp : e))
        : [finalExp, ...prev];
    });
    await saveExpedienteRecomercializacionFirestore(finalExp);
  };
  const handleDeleteExpedienteRecomerc = async (id: string) => {
    // FASE 3.2: limpia también las fotos de inspección de Storage (best-effort).
    const expediente = expedientesRecomerc.find((e) => e.id === id);
    const fotos = expediente?.revisionFotografica?.fotografias ?? [];
    await Promise.all(fotos.map((f) => deleteFotoInspeccionStorage(f.storagePath)));
    setExpedientesRecomerc((prev) => prev.filter((e) => e.id !== id));
    await deleteExpedienteRecomercializacionFirestore(id);
  };
  // Puntos de entrada desde la ficha del inmueble / el contrato.
  const handleRecomercializarInmueble = (inmuebleId: string, contratoAnteriorId?: string) => {
    setNuevoExpedienteCtx({ inmuebleId, contratoAnteriorId });
    setActiveSection('recomercializacion');
  };

  // FASE 3.6 — directorio de inmobiliarias, propuestas (RFP) y leads.
  const handleSaveInmobiliaria = async (agencia: InmobiliariaDirectorio) => {
    setInmobiliariasDirectorio((prev) => {
      const exists = prev.some((a) => a.id === agencia.id);
      return exists ? prev.map((a) => (a.id === agencia.id ? agencia : a)) : [agencia, ...prev];
    });
    await saveInmobiliariaFirestore(agencia);
  };
  const handleDeleteInmobiliaria = async (id: string) => {
    setInmobiliariasDirectorio((prev) => prev.filter((a) => a.id !== id));
    await deleteInmobiliariaFirestore(id);
  };
  const handleSavePropuestaInmobiliaria = async (propuesta: PropuestaInmobiliaria) => {
    setPropuestasInmobiliaria((prev) => {
      const exists = prev.some((p) => p.id === propuesta.id);
      return exists ? prev.map((p) => (p.id === propuesta.id ? propuesta : p)) : [propuesta, ...prev];
    });
    await savePropuestaInmobiliariaFirestore(propuesta);
  };
  const handleSaveLeadInmobiliario = async (lead: LeadInmobiliario) => {
    setLeadsInmobiliarios((prev) => {
      const exists = prev.some((l) => l.id === lead.id);
      return exists ? prev.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...prev];
    });
    await saveLeadInmobiliarioFirestore(lead);
  };

  // FASE 3.6 — cierre del ciclo: garantiza que el contrato anterior queda
  // FINALIZADO y el inmueble liberado (disponible) para un nuevo anuncio o
  // contrato, SIEMPRE sobre la misma ficha (mismo inmuebleId).
  const handleCerrarExpedienteRecomerc = async (
    expediente: ExpedienteRecomercializacion,
    _resultado: 'REARRENDADO' | 'VENDIDO'
  ) => {
    await handleSaveExpedienteRecomerc(expediente);

    const contratoVinculado =
      (expediente.contratoAnteriorId && contratos.find((c) => c.id === expediente.contratoAnteriorId)) ||
      contratos
        .filter((c) => c.inmuebleId === expediente.inmuebleId && c.estado !== 'FINALIZADO')
        .sort((a, b) => (b.fechaInicioContrato || '').localeCompare(a.fechaInicioContrato || ''))[0];

    if (contratoVinculado && contratoVinculado.estado !== 'FINALIZADO') {
      // Reutiliza el flujo oficial: finaliza el contrato y libera el inmueble.
      await handleFinalizarContrato(contratoVinculado.id);
    } else {
      const inm = inmuebles.find((i) => i.id === expediente.inmuebleId);
      if (inm && (inm.estado !== 'disponible' || inm.contratoActivoId || inm.inquilinoActualId)) {
        const libre: Inmueble = {
          ...inm,
          estado: 'disponible',
          inquilinoActualId: undefined,
          inquilinoActualNombre: undefined,
          contratoActivoId: undefined,
        };
        setInmuebles((prev) => prev.map((i) => (i.id === libre.id ? libre : i)));
        await saveInmuebleFirestore(libre);
      }
    }
  };

  // Handlers for Propietarios y Cuentas Bancarias
  const handleSavePropietario = async (propietario: Propietario) => {
    setPropietarios((prev) => {
      const exists = prev.some((p) => p.id === propietario.id);
      const updated = exists
        ? prev.map((p) => (p.id === propietario.id ? propietario : p))
        : [propietario, ...prev];
      try {
        localStorage.setItem('rentselect_propietarios', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    await savePropietarioFirestore(propietario);
  };

  const handleDeletePropietario = async (propietarioId: string) => {
    setPropietarios((prev) => {
      const updated = prev.filter((p) => p.id !== propietarioId);
      try {
        localStorage.setItem('rentselect_propietarios', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    await deletePropietarioFirestore(propietarioId);
  };

  // Handlers for Seguro de Impago
  const handleOpenCrearSeguroModal = (candidato?: Candidato, inmueble?: Inmueble) => {
    setCandidateForCrearSeguro(candidato || null);
    setInmuebleForCrearSeguro(inmueble || null);
    setShowCrearSeguroModal(true);
  };

  const handleSaveSolicitudSeguro = async (sol: SolicitudSeguroImpago) => {
    setSolicitudesSeguro((prev) => {
      const idx = prev.findIndex((s) => s.id === sol.id);
      if (idx >= 0) {
        return prev.map((s) => (s.id === sol.id ? sol : s));
      }
      return [sol, ...prev];
    });
    await saveSolicitudSeguroFirestore(sol);
  };

  const handleDeleteSolicitudSeguro = async (solId: string) => {
    setSolicitudesSeguro((prev) => prev.filter((s) => s.id !== solId));
    await deleteSolicitudSeguroFirestore(solId);
  };

  const handleSaveAseguradora = async (aseg: ConfiguracionAseguradora) => {
    setAseguradoras((prev) => {
      const idx = prev.findIndex((a) => a.id === aseg.id);
      if (idx >= 0) {
        return prev.map((a) => (a.id === aseg.id ? aseg : a));
      }
      return [...prev, aseg];
    });
    await saveAseguradoraFirestore(aseg);
  };

  const handleSaveAllAseguradoras = async (newList: ConfiguracionAseguradora[]) => {
    setAseguradoras(newList);
    for (const aseg of newList) {
      await saveAseguradoraFirestore(aseg);
    }
  };

  const handleDeleteAseguradora = async (asegId: string) => {
    setAseguradoras((prev) => prev.filter((a) => a.id !== asegId));
    await deleteAseguradoraFirestore(asegId);
  };

  const handleSaveGmailConfig = async (newConfig: GmailIntegracionConfig) => {
    setGmailConfig(newConfig);
    await saveGmailConfigFirestore(newConfig);
  };

  // --- AUDIT LOG HELPER ---
  const logAudit = async (accion: string, modulo: string, detalle: string, entidadId?: string) => {
    const log: AuditLog = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fechaHora: new Date().toISOString(),
      usuarioId: currentUser?.id || 'admin_root',
      usuarioEmail: currentUser?.email || 'admin@rentselect.es',
      usuarioNombre: currentUser?.nombre || 'Administrador',
      accion,
      descripcion: detalle,
      entidadAfectada: (modulo === 'USUARIOS'
        ? 'usuario'
        : modulo === 'PROFESIONALES'
        ? 'profesional'
        : modulo === 'INMUEBLES'
        ? 'inmueble'
        : modulo === 'INVITACIONES'
        ? 'enlace'
        : modulo === 'ESPECIALIDADES'
        ? 'especialidad'
        : 'modulo') as any,
      idAfectado: entidadId || 'sistema',
      resultado: 'EXITO',
      detalles: { modulo },
    };
    setAuditLogs((prev) => [log, ...prev]);
    await saveAuditLogFirestore(log);
  };

  // --- HANDLERS FOR USERS & RBAC ---
  const handleSaveUsuario = async (user: UsuarioApp) => {
    setUsuarios((prev) => {
      const idx = prev.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = user;
        return next;
      }
      return [user, ...prev];
    });
    await saveUsuarioFirestore(user);
    await logAudit(
      'GUARDAR_USUARIO',
      'USUARIOS',
      `Usuario ${user.nombre} (${user.email}) guardado con perfil ${user.tipoPerfil}`,
      user.id
    );
  };

  const handleDeleteUsuario = async (userId: string) => {
    const u = usuarios.find((x) => x.id === userId);
    setUsuarios((prev) => prev.filter((x) => x.id !== userId));
    await deleteUsuarioFirestore(userId);
    await logAudit(
      'ELIMINAR_USUARIO',
      'USUARIOS',
      `Usuario eliminado: ${u?.nombre || userId} (${u?.email || ''})`,
      userId
    );
  };

  // --- HANDLERS FOR PROFESIONALES ---
  const handleSaveProfesional = async (prof: Profesional) => {
    setProfesionales((prev) => {
      const idx = prev.findIndex((p) => p.id === prof.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = prof;
        return next;
      }
      return [prof, ...prev];
    });
    await saveProfesionalFirestore(prof);
    await logAudit(
      'GUARDAR_PROFESIONAL',
      'PROFESIONALES',
      `Profesional ${prof.nombreComercial} guardado. Especialidades: ${prof.especialidades.join(', ')}`,
      prof.id
    );
  };

  const handleDeleteProfesional = async (profId: string) => {
    const p = profesionales.find((x) => x.id === profId);
    setProfesionales((prev) => prev.filter((x) => x.id !== profId));
    await deleteProfesionalFirestore(profId);
    await logAudit(
      'ELIMINAR_PROFESIONAL',
      'PROFESIONALES',
      `Profesional eliminado: ${p?.nombreComercial || profId}`,
      profId
    );
  };

  const handleAssignProfesionalToInmueble = async (
    inmuebleId: string,
    profesionalId: string,
    accion: 'asignar' | 'desasignar'
  ) => {
    const inm = inmuebles.find((i) => i.id === inmuebleId);
    if (!inm) return;
    const currentList = inm.profesionalesAsignados || [];
    const updatedList =
      accion === 'asignar'
        ? Array.from(new Set([...currentList, profesionalId]))
        : currentList.filter((id) => id !== profesionalId);

    const updatedInm: Inmueble = {
      ...inm,
      profesionalesAsignados: updatedList,
      updatedAt: new Date().toISOString(),
    };

    setInmuebles((prev) => prev.map((i) => (i.id === inm.id ? updatedInm : i)));
    await saveInmuebleFirestore(updatedInm);
    await logAudit(
      accion === 'asignar' ? 'ASIGNAR_PROFESIONAL_INMUEBLE' : 'DESASIGNAR_PROFESIONAL_INMUEBLE',
      'INMUEBLES',
      `Profesional ${profesionalId} ${accion === 'asignar' ? 'asignado a' : 'desvinculado de'} ${inm.titulo}`,
      inmuebleId
    );
  };

  // --- HANDLERS FOR ENLACES DE REGISTRO ---
  const handleSaveEnlaceRegistro = async (enlace: EnlaceRegistro) => {
    setEnlacesRegistro((prev) => {
      const idx = prev.findIndex((e) => e.id === enlace.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = enlace;
        return next;
      }
      return [enlace, ...prev];
    });
    await saveEnlaceRegistroFirestore(enlace);
    await logAudit(
      'GUARDAR_ENLACE_REGISTRO',
      'INVITACIONES',
      `Enlace de registro creado/actualizado: ${enlace.textoVisible} (${enlace.tipoPerfil})`,
      enlace.id
    );
  };

  const handleDeleteEnlaceRegistro = async (enlaceId: string) => {
    setEnlacesRegistro((prev) => prev.filter((e) => e.id !== enlaceId));
    await deleteEnlaceRegistroFirestore(enlaceId);
    await logAudit('ELIMINAR_ENLACE_REGISTRO', 'INVITACIONES', `Enlace eliminado: ${enlaceId}`, enlaceId);
  };

  // --- HANDLERS FOR ESPECIALIDADES ---
  const handleSaveEspecialidad = async (esp: Especialidad) => {
    setEspecialidades((prev) => {
      const idx = prev.findIndex((e) => e.id === esp.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = esp;
        return next;
      }
      return [...prev, esp];
    });
    await saveEspecialidadFirestore(esp);
    await logAudit('GUARDAR_ESPECIALIDAD', 'ESPECIALIDADES', `Especialidad técnica: ${esp.nombre}`, esp.id);
  };

  const handleDeleteEspecialidad = async (espId: string) => {
    setEspecialidades((prev) => prev.filter((e) => e.id !== espId));
    await deleteEspecialidadFirestore(espId);
    await logAudit('ELIMINAR_ESPECIALIDAD', 'ESPECIALIDADES', `Especialidad eliminada: ${espId}`, espId);
  };

  // --- HANDLER FOR MODULOS CONFIG (FEATURE FLAGS) ---
  const handleToggleModulo = async (key: keyof ModulosConfig) => {
    if (!modulosConfig) return;
    const updated: ModulosConfig = {
      ...modulosConfig,
      [key]: !modulosConfig[key],
      updatedAt: new Date().toISOString(),
    };
    setModulosConfig(updated);
    await saveModulosConfigFirestore(updated);
    await logAudit(
      'MODIFICAR_MODULO',
      'CONFIGURACION',
      `Módulo ${String(key)} ${updated[key] ? 'ACTIVADO' : 'DESACTIVADO'}`
    );
  };

  // --- HANDLER FOR COMPLETING SELF-REGISTRATION ---
  const handleCompleteSelfRegistration = async (
    nuevoUsuario: UsuarioApp,
    propietarioData?: Partial<Propietario>,
    profesionalData?: Partial<Profesional>,
    enlaceUtilizado?: EnlaceRegistro
  ) => {
    await saveUsuarioFirestore(nuevoUsuario);
    setUsuarios((prev) => [nuevoUsuario, ...prev]);

    // FASE 1.4: crear el espejo de identidad usuarios_auth/{uid} ANTES de la
    // ficha de propietario/profesional, porque las reglas de escritura de esas
    // colecciones resuelven el rol/propietarioId a través de ese documento.
    await syncAuthIndex(nuevoUsuario);

    if (propietarioData && nuevoUsuario.propietarioId) {
      const nuevoProp: Propietario = {
        id: nuevoUsuario.propietarioId,
        nombre: propietarioData.nombre || nuevoUsuario.nombre,
        nifCif: propietarioData.nifCif || 'NO_APORTADO',
        email: nuevoUsuario.email,
        telefono: nuevoUsuario.telefono || '',
        direccion: propietarioData.direccion || '',
        ciudad: propietarioData.ciudad || '',
        codigoPostal: propietarioData.codigoPostal || '',
        tipoPropietario: (propietarioData.tipoPropietario as any) || 'persona_fisica',
        cuentasBancarias: [],
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      };
      await savePropietarioFirestore(nuevoProp);
      setPropietarios((prev) => [nuevoProp, ...prev]);
    }

    if (profesionalData && nuevoUsuario.profesionalId) {
      const nuevoProf: Profesional = {
        id: nuevoUsuario.profesionalId,
        usuarioId: nuevoUsuario.id,
        nombreComercial: profesionalData.nombreComercial || nuevoUsuario.nombre,
        contactoNombre: profesionalData.contactoNombre || nuevoUsuario.nombre,
        cifNif: profesionalData.cifNif,
        email: nuevoUsuario.email,
        telefono: nuevoUsuario.telefono,
        especialidades: profesionalData.especialidades || [],
        tipo: profesionalData.tipo || 'AUTONOMO',
        zonasServicio: profesionalData.zonasServicio || [{ id: 'z1', provincia: 'Almería' }],
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveProfesionalFirestore(nuevoProf);
      setProfesionales((prev) => [nuevoProf, ...prev]);
    }

    if (enlaceUtilizado) {
      const updatedEnlace: EnlaceRegistro = {
        ...enlaceUtilizado,
        usosActuales: enlaceUtilizado.usosActuales + 1,
      };
      await saveEnlaceRegistroFirestore(updatedEnlace);
      setEnlacesRegistro((prev) =>
        prev.map((e) => (e.id === updatedEnlace.id ? updatedEnlace : e))
      );
    }

    setCurrentUser(nuevoUsuario);
    await logAudit(
      'AUTO_REGISTRO',
      'AUTENTICACION',
      `Nuevo usuario auto-registrado: ${nuevoUsuario.nombre} (${nuevoUsuario.email}) como ${nuevoUsuario.tipoPerfil}`,
      nuevoUsuario.id
    );
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setShowAuthModal(false);
  };

  // Standalone Registration Portal View (Public Link or Token)
  if (activePublicRegistroToken) {
    return (
      <PortalRegistroView
        token={activePublicRegistroToken}
        enlaces={enlacesRegistro}
        profesionales={profesionales}
        especialidades={especialidades}
        onCompleteRegistro={handleCompleteSelfRegistration}
        onCancel={() => {
          setActivePublicRegistroToken(null);
          window.history.pushState({}, '', window.location.pathname);
        }}
      />
    );
  }

  // Standalone Candidate Document Submission Portal View (Public URL - Fase 2)
  if (activePublicDocToken) {
    const publicSolDoc = solicitudesDoc.find(
      (s) => s.token === activePublicDocToken || s.id === activePublicDocToken
    );

    if (!publicSolDoc) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 text-white p-6 rounded-2xl shadow-xl text-center space-y-3 max-w-md">
            <p className="text-base font-bold text-white">Solicitud de documentación no encontrada o enlace caducado</p>
            <p className="text-xs text-slate-400">
              El enlace no es válido o ha expirado. Por favor, contacta con la propiedad o agencia inmobiliaria para solicitar un nuevo acceso.
            </p>
          </div>
        </div>
      );
    }

    // Isolated sanitized representation for candidate portal
    // Guarantees zero leakage of private owner notes or internal scores
    const sanitizedPublicDocData: SolicitudDocPublicData = {
      id: publicSolDoc.id,
      token: publicSolDoc.token,
      candidatoNombre: publicSolDoc.candidatoNombre,
      candidatoTelefono: publicSolDoc.candidatoTelefono,
      inmuebleNombre: publicSolDoc.inmuebleNombre,
      inmuebleCiudad: publicSolDoc.inmuebleCiudad,
      fechaVisita: publicSolDoc.fechaVisita,
      mensajePropietario: publicSolDoc.mensajePropietario,
      documentos: publicSolDoc.documentos,
      estado: publicSolDoc.estado,
      fechaCreacion: publicSolDoc.fechaCreacion,
    };

    return (
      <PortalDocumentacionPublicaView
        solicitud={sanitizedPublicDocData}
        onSubmit={async (updatedDocs, isFinalSubmit) => {
          await handlePublicDocSubmit(publicSolDoc.token, updatedDocs, isFinalSubmit);
        }}
      />
    );
  }

  // Standalone Candidate Visita Booking Portal View (Public URL)
  if (activePublicVisitaToken) {
    return (
      <PortalVisitaPublicaView
        token={activePublicVisitaToken}
        invitaciones={invitaciones}
        slots={slots}
        inmuebles={inmuebles}
        onUpdateInvitacion={(inv) => handleSaveInvitacion(inv)}
        onUpdateSlot={(slot) => handleSaveVisitSlot(slot)}
        onUpdateCandidateState={(candidateId, newState) => {
          handleUpdateStatus(candidateId, newState);
        }}
      />
    );
  }

  // Standalone Candidate Portal View (Public URL)
  if (activePublicSolicitudToken) {
    const targetInmueble = inmuebles.find(
      (i) => i.tokenSolicitud === activePublicSolicitudToken || i.id === activePublicSolicitudToken
    );

    if (!targetInmueble) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center space-y-3 max-w-md">
            <p className="text-base font-bold text-slate-800">Inmueble no encontrado o enlace caducado</p>
            <p className="text-xs text-slate-500">
              El enlace de candidatura ya no está activo. Por favor, contacta con el anunciante si deseas información sobre la disponibilidad.
            </p>
          </div>
        </div>
      );
    }

    return (
      <PortalSolicitudPublicaView
        inmueble={targetInmueble}
        onCompleteSolicitud={(newSol) => {
          handleSavePublicSolicitud(newSol);
        }}
      />
    );
  }

  // Standalone Public Questionnaire View (Mobile & Desktop)
  if (activePublicQuestionnaireToken) {
    const publicCand = candidatos.find(
      (c) => c.cuestionarioToken === activePublicQuestionnaireToken || c.id === activePublicQuestionnaireToken
    );

    const publicInmueble = inmuebles.find((i) => i.id === publicCand?.inmuebleId);

    if (!publicCand) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 text-center space-y-3 max-w-md">
            <p className="text-base font-bold text-slate-800">Candidatura no encontrada o enlace caducado</p>
            <p className="text-xs text-slate-500">
              El enlace no es válido o ha expirado. Por favor, contacta con el arrendador para recibir un nuevo enlace de cuestionario.
            </p>
          </div>
        </div>
      );
    }

    // Versión sanitizada para el flujo público:
    // Se eliminan completamente las notas privadas y datos internos de evaluación del propietario
    const {
      notasPrivadas: _notasPrivadas,
      documentosAnalizados: _documentosAnalizados,
      informesHistorico: _informesHistorico,
      ultimoInforme: _ultimoInforme,
      scoreEstimado: _scoreEstimado,
      ratioSolvencia: _ratioSolvencia,
      ...sanitizedPublicCand
    } = publicCand;

    return (
      <CuestionarioPublicoView
        candidato={sanitizedPublicCand}
        inmueble={publicInmueble}
        onSubmit={async (updatedCandidateData, respuestas, infoAdic) => {
          await handlePublicQuestionnaireSubmit(publicCand.id, updatedCandidateData, respuestas, infoAdic);
        }}
      />
    );
  }

  const preselectedCount = scopedCandidatos.filter(
    (c) => c.estado === 'preseleccionado' || c.estado === 'visita_reservada' || invitaciones.some((i) => i.candidateId === c.id)
  ).length;

  // --- SEGURIDAD & AUTENTICACIÓN: PUERTA DE ENTRADA OBLIGATORIA (AUTH GUARD) ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100 p-6">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 animate-pulse">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-300">Verificando credenciales de acceso seguro...</p>
        <p className="text-xs text-slate-500 mt-1 font-mono">RentSelect Security & Identity Engine</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginView
        onLoginSuccess={(usuario) => {
          setCurrentUser(usuario);
          if (usuario.tipoPerfil === 'ADMINISTRADOR') {
            setActiveSection('administracion');
          } else if (usuario.tipoPerfil === 'PROPIETARIO') {
            setActiveSection('propietarios');
          } else if (usuario.tipoPerfil === 'PROFESIONAL') {
            setActiveSection('administracion');
          }
        }}
        onOpenRegisterWithToken={(token) => {
          setActivePublicRegistroToken(token);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 font-sans text-slate-800 flex flex-col md:flex-row pb-16 md:pb-0 antialiased">
      {/* Desktop Sidebar Navigation */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        candidatos={scopedCandidatos}
        inmueblesCount={scopedInmuebles.length}
        propietariosCount={scopedPropietarios.length}
        solicitudesCount={solicitudes.length}
        preseleccionadosCount={preselectedCount}
        contratosCount={scopedContratos.length}
        solicitudesSeguroCount={solicitudesSeguro.length}
        cobrosPendientesCount={cobrosPendientesCount}
        currentUser={currentUser}
        onOpenAuthModal={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />

      {/* Main App Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header & Mobile Navigation */}
        <MobileNav
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          candidatos={scopedCandidatos}
          inmueblesCount={scopedInmuebles.length}
          propietariosCount={scopedPropietarios.length}
          solicitudesCount={solicitudes.length}
          preseleccionadosCount={preselectedCount}
          contratosCount={scopedContratos.length}
          solicitudesSeguroCount={solicitudesSeguro.length}
          cobrosPendientesCount={cobrosPendientesCount}
          onOpenAddCandidateModal={() => setShowNuevoCandidatoModal(true)}
          currentUser={currentUser}
          onOpenAuthModal={() => setShowAuthModal(true)}
        />

        {/* Desktop Header */}
        <Header
          activeSection={activeSection}
          userProfile={userProfile}
          onSelectSection={setActiveSection}
          onOpenAddCandidateModal={() => setShowNuevoCandidatoModal(true)}
          currentUser={currentUser}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onLogout={handleLogout}
        />

        {/* Dynamic Section Renderer */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeSection === 'inicio' && (
            <InicioSection
              candidatos={scopedCandidatos}
              inmuebles={scopedInmuebles}
              onSelectCandidate={(cand) => setSelectedCandidateForModal(cand)}
              onSelectSection={setActiveSection}
              onOpenAddCandidateModal={() => setShowNuevoCandidatoModal(true)}
            />
          )}

          {activeSection === 'propietarios' && (
            currentUser.tipoPerfil === 'PROPIETARIO' ? (
              <PropietarioPortalSection
                currentUser={currentUser}
                inmuebles={scopedInmuebles}
                profesionales={scopedProfesionales}
                contratos={scopedContratos}
                especialidades={especialidades}
                propietarios={scopedPropietarios}
                onOpenCrearProfesionalModal={(prof) => {
                  setSelectedProfForEdit(prof);
                  setShowCrearProfesionalModal(true);
                }}
                onSaveProfesional={handleSaveProfesional}
                onSavePropietario={handleSavePropietario}
                onNavigateToInmueble={() => setActiveSection('inmuebles')}
              />
            ) : (
              <PropietariosSection
                propietarios={scopedPropietarios}
                inmuebles={scopedInmuebles}
                onSavePropietario={handleSavePropietario}
                onDeletePropietario={handleDeletePropietario}
                onSelectInmueble={() => setActiveSection('inmuebles')}
              />
            )
          )}

          {activeSection === 'preseleccionados' && (
            <PreseleccionadosSection
              candidatos={scopedCandidatos}
              inmuebles={scopedInmuebles}
              invitaciones={invitaciones}
              solicitudes={solicitudes}
              slots={slots}
              solicitudesDoc={solicitudesDoc}
              contratos={scopedContratos}
              onSaveInvitacion={handleSaveInvitacion}
              onOpenPublicVisita={(token) => setActivePublicVisitaToken(token)}
              onOpenConfigurarAgenda={(inmId) => {
                setSelectedInmuebleForAgenda(inmId);
                setShowCrearAgendaModal(true);
              }}
              onOpenCrearSolicitudDoc={(cand, inm, inv) => {
                setCandidateForCrearDocModal({ candidato: cand, inmueble: inm, invitacion: inv });
              }}
              onOpenDetalleSolicitudDoc={(solDoc) => {
                setSelectedSolicitudDocForDetail(solDoc);
              }}
              onOpenFormalizarModal={handleOpenFormalizarModal}
            />
          )}

          {activeSection === 'seguro_impago' && (
            <SeguroImpagoSection
              solicitudesSeguro={solicitudesSeguro}
              aseguradoras={aseguradoras}
              candidatos={scopedCandidatos}
              inmuebles={scopedInmuebles}
              onOpenCrearModal={() => handleOpenCrearSeguroModal()}
              onOpenConfigModal={() => setShowConfigAseguradorasModal(true)}
              onOpenDetalleModal={(sol) => setSelectedSolicitudSeguroForDetail(sol)}
              onDeleteSolicitud={handleDeleteSolicitudSeguro}
            />
          )}

          {activeSection === 'formalizacion' && (
            <FormalizacionSection
              contratos={scopedContratos}
              inmuebles={scopedInmuebles}
              candidatos={scopedCandidatos}
              solicitudesDoc={solicitudesDoc}
              userProfile={userProfile}
              currentUser={currentUser}
              onOpenFormalizarModal={handleOpenFormalizarModal}
              onDeleteContrato={handleDeleteContrato}
              onRecomercializarContrato={(c) => handleRecomercializarInmueble(c.inmuebleId, c.id)}
              onSaveContrato={async (c) => { await saveContratoFirestore(c); }}
            />
          )}

          {activeSection === 'cobros' && (
            <CobrosSection
              contratos={scopedContratos}
              inmuebles={scopedInmuebles}
              propietarios={scopedPropietarios}
              currentUser={currentUser}
              onSaveContrato={handleSaveContrato}
              onNavigateToInmueble={() => setActiveSection('inmuebles')}
            />
          )}

          {activeSection === 'gastos' && (
            <GastosSection
              gastos={scopedGastos}
              cobros={scopedCobros}
              recurrentes={scopedRecurrentes}
              prestamos={scopedPrestamos}
              inmuebles={scopedInmuebles}
              currentUser={currentUser}
              onSaveGasto={handleSaveGasto}
              onDeleteGasto={handleDeleteGasto}
              onSaveRecurrente={handleSaveRecurrente}
              onDeleteRecurrente={handleDeleteRecurrente}
              onSavePrestamo={handleSavePrestamo}
              onDeletePrestamo={handleDeletePrestamo}
            />
          )}

          {activeSection === 'financiacion' && (
            <FinanciacionSection
              inmuebles={scopedInmuebles}
              propietarios={scopedPropietarios}
              currentUser={currentUser}
            />
          )}

          {activeSection === 'fiscal' && (
            <FiscalidadSection
              inmuebles={scopedInmuebles}
              contratos={scopedContratos}
              gastos={scopedGastos}
              currentUser={currentUser}
              onNavigateToInmueble={() => setActiveSection('inmuebles')}
            />
          )}

          {activeSection === 'informes' && (
            <InformesSection
              inmuebles={scopedInmuebles}
              contratos={scopedContratos}
              gastos={scopedGastos}
              currentUser={currentUser}
            />
          )}

          {activeSection === 'polizas' && (
            <PolizasSegurosSection
              inmuebles={scopedInmuebles}
              propietarios={scopedPropietarios}
              currentUser={currentUser || undefined}
              modo={currentUser?.tipoPerfil === 'PROPIETARIO' ? 'PROPIETARIO' : 'ADMIN'}
            />
          )}

          {activeSection === 'recomercializacion' && (
            <RecomercializacionSection
              expedientes={scopedExpedientesRecomerc}
              inmuebles={scopedInmuebles}
              contratos={scopedContratos}
              profesionales={scopedProfesionales}
              currentUser={currentUser}
              inmobiliarias={inmobiliariasDirectorio}
              propuestas={propuestasInmobiliaria}
              leads={leadsInmobiliarios}
              contextoNuevo={nuevoExpedienteCtx}
              onConsumirContexto={() => setNuevoExpedienteCtx(null)}
              onCreate={handleSaveExpedienteRecomerc}
              onGuardar={handleSaveExpedienteRecomerc}
              onEliminar={handleDeleteExpedienteRecomerc}
              onGuardarInmobiliaria={handleSaveInmobiliaria}
              onEliminarInmobiliaria={handleDeleteInmobiliaria}
              onGuardarPropuesta={handleSavePropuestaInmobiliaria}
              onGuardarLead={handleSaveLeadInmobiliario}
              onCerrarCiclo={handleCerrarExpedienteRecomerc}
            />
          )}

          {activeSection === 'incidencias' && (
            <IncidenciasSection
              inmuebles={scopedInmuebles}
              propietarios={scopedPropietarios}
              contratos={scopedContratos}
              profesionales={scopedProfesionales}
              currentUser={currentUser}
            />
          )}

          {activeSection === 'inmuebles' && (
            <InmueblesSection
              inmuebles={scopedInmuebles}
              candidatos={scopedCandidatos}
              propietarios={scopedPropietarios}
              slots={slots}
              invitaciones={invitaciones}
              onSelectCandidate={(cand) => setSelectedCandidateForModal(cand)}
              onDeleteInmueble={handleDeleteInmueble}
              onAddInmueble={handleAddInmueble}
              onUpdateInmueble={handleUpdateInmueble}
              onOpenLinkModal={(inm) => setInmuebleForLinkModal(inm)}
              onOpenConfigurarAgenda={(inmId) => {
                setSelectedInmuebleForAgenda(inmId);
                setShowCrearAgendaModal(true);
              }}
              onDeleteSlot={handleDeleteSlot}
              onDeleteSlotsBatch={handleDeleteSlotsBatch}
              onUpdateSlot={handleUpdateSlot}
              onNavigateToPropietarios={() => setActiveSection('propietarios')}
              contratos={scopedContratos}
              profesionales={scopedProfesionales}
              currentUser={currentUser}
              onOpenFormalizarModal={handleOpenFormalizarModal}
              onFinalizarContrato={handleFinalizarContrato}
              onRecomercializarInmueble={(inmuebleId, contratoAnteriorId) =>
                handleRecomercializarInmueble(inmuebleId, contratoAnteriorId)
              }
            />
          )}

          {(activeSection === 'candidatos' || activeSection === 'solicitudes' || activeSection === 'nuevo_candidato' || activeSection === 'cuestionario') && (
            <CandidatosSection
              candidatos={scopedCandidatos}
              inmuebles={scopedInmuebles}
              onSelectCandidate={(cand) => setSelectedCandidateForModal(cand)}
              onUpdateStatus={handleUpdateStatus}
              onGenerarInforme={(cand) => handleOpenOrGenerateReport(cand)}
              onDeleteCandidate={handleDeleteCandidato}
              onOpenAddCandidateModal={() => setShowNuevoCandidatoModal(true)}
            />
          )}

          {activeSection === 'analisis' && (
            <AnalisisSection
              candidatos={scopedCandidatos}
              inmuebles={scopedInmuebles}
              initialCandidateId={selectedCandidateForAnalysis?.id}
              onSelectCandidateModal={(cand) => setSelectedCandidateForModal(cand)}
              onGenerarInforme={(cand) => handleOpenOrGenerateReport(cand)}
            />
          )}

          {activeSection === 'configuracion' && (
            <ConfiguracionSection
              userProfile={userProfile}
              candidatos={scopedCandidatos}
              inmuebles={scopedInmuebles}
              onUpdateProfile={(updated) => setUserProfile(updated)}
              onImportData={handleImportData}
              onOpenConfigAseguradoras={() => setShowConfigAseguradorasModal(true)}
            />
          )}

          {activeSection === 'administracion' && (
            currentUser.tipoPerfil === 'ADMINISTRADOR' ? (
              <AdminControlCenter
                currentUser={currentUser}
                usuarios={usuarios}
                inmuebles={inmuebles}
                propietarios={propietarios}
                profesionales={profesionales}
                contratos={contratos}
                auditLogs={auditLogs}
                enlacesRegistro={enlacesRegistro}
                especialidades={especialidades}
                modulosConfig={modulosConfig || undefined}
                onLogout={handleLogout}
                onSaveUsuario={handleSaveUsuario}
                onDeleteUsuario={handleDeleteUsuario}
                onSaveEnlaceRegistro={handleSaveEnlaceRegistro}
                onDeleteEnlaceRegistro={handleDeleteEnlaceRegistro}
                onSaveEspecialidad={handleSaveEspecialidad}
                onDeleteEspecialidad={handleDeleteEspecialidad}
                onSaveModulosConfig={async (cfg) => {
                  setModulosConfig(cfg);
                  await saveModulosConfigFirestore(cfg);
                }}
                onOpenCrearUsuarioModal={() => {
                  setSelectedUserForEdit(undefined);
                  setShowCrearUsuarioModal(true);
                }}
                onOpenCrearEnlaceModal={() => {
                  setSelectedEnlaceForEdit(undefined);
                  setShowCrearEnlaceModal(true);
                }}
              />
            ) : currentUser.tipoPerfil === 'PROFESIONAL' ? (
              <ProfesionalPortalSection
                currentUser={currentUser}
                profesional={scopedProfesionales.find((p) => p.id === currentUser.profesionalId || p.usuarioId === currentUser.id) || null}
                inmuebles={scopedInmuebles}
                especialidades={especialidades}
                onSaveProfesional={handleSaveProfesional}
              />
            ) : (
              <PropietarioPortalSection
                currentUser={currentUser}
                inmuebles={scopedInmuebles}
                profesionales={scopedProfesionales}
                contratos={scopedContratos}
                especialidades={especialidades}
                propietarios={scopedPropietarios}
                onOpenCrearProfesionalModal={(prof) => {
                  setSelectedProfForEdit(prof);
                  setShowCrearProfesionalModal(true);
                }}
                onSaveProfesional={handleSaveProfesional}
                onSavePropietario={handleSavePropietario}
                onNavigateToInmueble={() => setActiveSection('inmuebles')}
              />
            )
          )}
        </main>
      </div>

      {/* Reusable Candidate Detail Modal Sheet */}
      <CandidateModal
        candidato={selectedCandidateForModal}
        inmuebles={scopedInmuebles}
        solicitudesDoc={solicitudesDoc}
        contratos={scopedContratos}
        onClose={() => setSelectedCandidateForModal(null)}
        onUpdateStatus={handleUpdateStatus}
        onUpdateCandidateDocs={handleUpdateCandidateDocs}
        onGoToAnalysis={(cand) => {
          setSelectedCandidateForAnalysis(cand);
          setActiveSection('analisis');
        }}
        onGenerarInforme={(cand) => handleOpenOrGenerateReport(cand)}
        onDeleteCandidate={handleDeleteCandidato}
        onOpenQuestionnaireSimulation={(candId) => {
          setSelectedCandidateForModal(null);
          const cand = candidatos.find((c) => c.id === candId);
          const token = cand?.cuestionarioToken || candId;
          setActivePublicQuestionnaireToken(token);
        }}
        onRunAiAnalysis={handleRunAiAnalysisQuestionnaire}
        onEnviarCuestionario={(cand) => setCandidateForEnviarModal(cand)}
        onOpenCrearSolicitudDoc={(cand, inm) => {
          setSelectedCandidateForModal(null);
          setCandidateForCrearDocModal({ candidato: cand, inmueble: inm });
        }}
        onOpenDetalleSolicitudDoc={(solDoc) => {
          setSelectedCandidateForModal(null);
          setSelectedSolicitudDocForDetail(solDoc);
        }}
        onOpenFormalizarModal={handleOpenFormalizarModal}
      />

      {/* Formalizar Contrato Modal (Fase 3) */}
      {formalizarModalState.isOpen && formalizarModalState.candidato && (
        <FormalizarContratoModal
          isOpen={formalizarModalState.isOpen}
          onClose={() => setFormalizarModalState({ isOpen: false, candidato: null })}
          candidato={formalizarModalState.candidato}
          inmueble={formalizarModalState.inmueble}
          existingContrato={formalizarModalState.contrato}
          solicitudDoc={solicitudesDoc.find((s) => s.candidatoId === formalizarModalState.candidato?.id)}
          userProfile={userProfile}
          propietarios={propietarios}
          onSaveContrato={handleSaveContrato}
        />
      )}

      {/* Crear Solicitud de Documentación Modal (Fase 2) */}
      {candidateForCrearDocModal && (
        <CrearSolicitudDocModal
          isOpen={!!candidateForCrearDocModal}
          onClose={() => setCandidateForCrearDocModal(null)}
          candidato={candidateForCrearDocModal.candidato}
          inmueble={candidateForCrearDocModal.inmueble}
          invitacion={candidateForCrearDocModal.invitacion}
          existingSolicitud={solicitudesDoc.find(
            (s) => s.candidatoId === candidateForCrearDocModal.candidato.id
          )}
          onSaveSolicitud={async (solDoc) => {
            await handleSaveSolicitudDoc(solDoc);
          }}
          onOpenPublicView={(token) => {
            setCandidateForCrearDocModal(null);
            setActivePublicDocToken(token);
          }}
        />
      )}

      {/* Detalle y Validación de Documentación Modal (Fase 2) */}
      {selectedSolicitudDocForDetail && (
        <DetalleSolicitudDocModal
          isOpen={!!selectedSolicitudDocForDetail}
          onClose={() => setSelectedSolicitudDocForDetail(null)}
          solicitud={
            solicitudesDoc.find((s) => s.id === selectedSolicitudDocForDetail.id) ||
            selectedSolicitudDocForDetail
          }
          candidato={candidatos.find((c) => c.id === selectedSolicitudDocForDetail.candidatoId)}
          inmueble={inmuebles.find((i) => i.id === selectedSolicitudDocForDetail.inmuebleId)}
          onUpdateSolicitud={async (updatedSol) => {
            await handleSaveSolicitudDoc(updatedSol);
            setSelectedSolicitudDocForDetail(updatedSol);
          }}
          onUpdateCandidateDocs={(candId, docs) => {
            handleUpdateCandidateDocs(candId, docs);
          }}
          onDeleteSolicitud={async (solId) => {
            setSolicitudesDoc((prev) => prev.filter((s) => s.id !== solId));
            await deleteSolicitudDocFirestore(solId);
            setSelectedSolicitudDocForDetail(null);
          }}
          onOpenPublicView={(token) => {
            setSelectedSolicitudDocForDetail(null);
            setActivePublicDocToken(token);
          }}
        />
      )}

      {/* Enviar Cuestionario Shareable Link Modal */}
      {candidateForEnviarModal && (
        <EnviarCuestionarioModal
          isOpen={!!candidateForEnviarModal}
          onClose={() => setCandidateForEnviarModal(null)}
          candidato={candidateForEnviarModal}
          inmueble={inmuebles.find((i) => i.id === candidateForEnviarModal.inmuebleId)}
          onUpdateCandidateToken={handleUpdateCandidateToken}
          onOpenPublicView={(token) => {
            setCandidateForEnviarModal(null);
            setSelectedCandidateForModal(null);
            setActivePublicQuestionnaireToken(token);
          }}
        />
      )}

      {/* Solicitud Detail Modal */}
      {selectedSolicitudForModal && (
        <SolicitudDetailModal
          solicitud={selectedSolicitudForModal}
          inmueble={inmuebles.find((i) => i.id === selectedSolicitudForModal.inmuebleId)}
          onClose={() => setSelectedSolicitudForModal(null)}
          onUpdateEstado={(solId, newEstado, nota) => {
            handleUpdateSolicitudState(solId, newEstado, nota);
          }}
          onTriggerAiAnalysis={(sol) => {
            handleAiAnalysisSolicitud(sol);
          }}
        />
      )}

      {/* Shareable Solicitud Link Modal for Property */}
      {inmuebleForLinkModal && (
        <CrearEnlaceSolicitudModal
          inmueble={inmuebleForLinkModal}
          onClose={() => setInmuebleForLinkModal(null)}
          onOpenPortal={(inm) => {
            setInmuebleForLinkModal(null);
            const token = inm.tokenSolicitud || `sol-${inm.id}`;
            setActivePublicSolicitudToken(token);
          }}
        />
      )}

      {/* Smart Candidate Report Modal */}
      {selectedCandidateForReport && activeReport && (
        <SmartReportModal
          candidato={selectedCandidateForReport}
          inmueble={inmuebles.find((i) => i.id === selectedCandidateForReport.inmuebleId)}
          report={activeReport}
          historyReports={selectedCandidateForReport.informesHistorico || [activeReport]}
          onClose={() => {
            setSelectedCandidateForReport(null);
            setActiveReport(null);
          }}
          onRegenerateReport={() => {
            handleOpenOrGenerateReport(selectedCandidateForReport, true);
          }}
          onSelectHistoryReport={(selectedHistReport) => {
            setActiveReport(selectedHistReport);
          }}
          onOpenSolvenciaBreakdown={() => {
            const cand = selectedCandidateForReport;
            setSelectedCandidateForReport(null);
            setActiveReport(null);
            setSelectedCandidateForAnalysis(cand);
            setActiveSection('analisis');
          }}
        />
      )}

      {/* Crear / Configurar Agenda Modal */}
      {showCrearAgendaModal && (
        <CrearAgendaVisitasModal
          isOpen={showCrearAgendaModal}
          onClose={() => setShowCrearAgendaModal(false)}
          inmuebles={inmuebles}
          candidatos={candidatos}
          existingSlots={slots}
          existingInvitaciones={invitaciones}
          selectedInmuebleIdDefault={selectedInmuebleForAgenda}
          onSaveSlots={(newSlots) => {
            setSlots(newSlots);
            saveAgendaSlotsFirestore(newSlots);
          }}
          onSaveInvitacion={(newInv) => {
            handleSaveInvitacion(newInv);
          }}
        />
      )}

      {/* Nuevo Candidato Modal */}
      {showNuevoCandidatoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">Registrar Nuevo Candidato</h3>
              </div>
              <button
                onClick={() => setShowNuevoCandidatoModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <NuevoCandidatoSection
                inmuebles={inmuebles}
                onAddCandidato={handleAddCandidato}
                onSelectSection={(sec) => {
                  setShowNuevoCandidatoModal(false);
                  if (sec && sec !== 'nuevo_candidato') {
                    setActiveSection(sec);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Crear Solicitud de Seguro de Impago Modal */}
      {showCrearSeguroModal && (
        <CrearSolicitudSeguroModal
          candidato={candidateForCrearSeguro}
          inmueble={inmuebleForCrearSeguro}
          candidatosList={candidatos}
          inmueblesList={inmuebles}
          aseguradoras={aseguradoras}
          onClose={() => {
            setShowCrearSeguroModal(false);
            setCandidateForCrearSeguro(null);
            setInmuebleForCrearSeguro(null);
          }}
          onCrearSolicitud={async (nuevaSol) => {
            await handleSaveSolicitudSeguro(nuevaSol);
            setSelectedSolicitudSeguroForDetail(nuevaSol);
          }}
        />
      )}

      {/* Detalle y Tramitación de Solicitud de Seguro Modal */}
      {selectedSolicitudSeguroForDetail && (
        <DetalleSolicitudSeguroModal
          solicitud={selectedSolicitudSeguroForDetail}
          aseguradoras={aseguradoras}
          onClose={() => setSelectedSolicitudSeguroForDetail(null)}
          onUpdateSolicitud={async (updatedSol) => {
            await handleSaveSolicitudSeguro(updatedSol);
          }}
        />
      )}

      {/* Configuración de Aseguradoras Modal */}
      {showConfigAseguradorasModal && (
        <ConfiguracionAseguradorasModal
          aseguradoras={aseguradoras}
          gmailConfig={gmailConfig}
          onClose={() => setShowConfigAseguradorasModal(false)}
          onSaveAseguradora={handleSaveAseguradora}
          onSaveAllAseguradoras={handleSaveAllAseguradoras}
          onDeleteAseguradora={handleDeleteAseguradora}
          onSaveGmailConfig={handleSaveGmailConfig}
        />
      )}

      {/* Selector de Sesión y Autenticación Modal */}
      {showAuthModal && (
        <AuthModal
          currentUser={currentUser}
          onLogout={handleLogout}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {/* Crear o Editar Usuario del Sistema Modal */}
      {showCrearUsuarioModal && (
        <CrearUsuarioModal
          usuarioParaEditar={selectedUserForEdit}
          inmuebles={inmuebles}
          propietarios={propietarios}
          onSave={async (u) => {
            await handleSaveUsuario(u);
            setShowCrearUsuarioModal(false);
            setSelectedUserForEdit(undefined);
          }}
          onClose={() => {
            setShowCrearUsuarioModal(false);
            setSelectedUserForEdit(undefined);
          }}
        />
      )}

      {/* Crear o Editar Profesional Modal */}
      {showCrearProfesionalModal && currentUser && (
        <CrearProfesionalModal
          profesionalParaEditar={selectedProfForEdit}
          especialidades={especialidades}
          inmueblesDisponibles={inmuebles}
          currentUser={currentUser}
          onSave={async (p) => {
            await handleSaveProfesional(p);
            setShowCrearProfesionalModal(false);
            setSelectedProfForEdit(undefined);
          }}
          onClose={() => {
            setShowCrearProfesionalModal(false);
            setSelectedProfForEdit(undefined);
          }}
        />
      )}

      {/* Crear o Editar Enlace de Registro Público Modal */}
      {showCrearEnlaceModal && (
        <CrearEnlaceRegistroModal
          enlaceParaEditar={selectedEnlaceForEdit}
          onSave={async (e) => {
            await handleSaveEnlaceRegistro(e);
            setShowCrearEnlaceModal(false);
            setSelectedEnlaceForEdit(undefined);
          }}
          onClose={() => {
            setShowCrearEnlaceModal(false);
            setSelectedEnlaceForEdit(undefined);
          }}
        />
      )}
    </div>
  );
}
