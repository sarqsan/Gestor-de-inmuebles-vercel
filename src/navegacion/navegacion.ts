/**
 * BLOQUE 10 · UX-1 — FUENTE ÚNICA DE LA NAVEGACIÓN DEL ERP.
 *
 * Catálogo **puro y determinista**: describe qué pantallas se ofrecen en el menú,
 * con qué etiqueta, icono, descripción y agrupación funcional, y para qué perfiles.
 *
 * Reglas de este módulo (UX-1):
 *  - Sin React de render, sin estado, sin efectos secundarios.
 *  - Sin Firestore, Storage, motores, fiscalidad, alquiler ni consultas.
 *  - Sin lógica de permisos: es la **representación de la navegación visible**.
 *    La autoridad de acceso sigue siendo el route guard de `App.tsx`
 *    (`SECCIONES_PROPIETARIO`, `SECCIONES_PROFESIONAL`, `seccionesAccesibles`).
 *    Invariante exigida: menú visible ⊆ capacidad de acceso existente.
 *
 * No duplicar este catálogo en `Sidebar` ni en `MobileNav`: ambos lo consumen.
 */
import type { ComponentType } from 'react';
import {
  Activity,
  Banknote,
  BarChart3,
  Building2,
  Calculator,
  FileText,
  HelpCircle,
  Key,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  Receipt,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  Wrench,
  Zap,
} from 'lucide-react';
import type { SectionType, TipoPerfilUsuario } from '../types';

/** Perfiles que pueden recibir menú de ERP (INQUILINO usa su propio portal, Bloque E). */
export type PerfilNavegacion = 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL';

export type GrupoNavId = 'CONTROL' | 'CARTERA' | 'ECONOMICO' | 'COMERCIAL' | 'OPERACIONES' | 'SISTEMA';

export interface GrupoNavDef {
  readonly id: GrupoNavId;
  readonly nombre: string;
}

/** Orden fijo de los seis grupos aprobados (D-5). */
export const GRUPOS_NAVEGACION: readonly GrupoNavDef[] = [
  { id: 'CONTROL', nombre: 'Inicio y control' },
  { id: 'CARTERA', nombre: 'Cartera y propiedad' },
  { id: 'ECONOMICO', nombre: 'Económico' },
  { id: 'COMERCIAL', nombre: 'Comercial y alquiler' },
  { id: 'OPERACIONES', nombre: 'Operaciones y seguros' },
  { id: 'SISTEMA', nombre: 'Sistema' },
];

/**
 * Contadores de badge disponibles. Cada componente los resuelve con las props
 * que ya recibía: el catálogo no conoce ni consulta datos.
 */
export type ClaveContadorNav =
  | 'inmuebles'
  | 'propietarios'
  | 'solicitudes'
  | 'preseleccionados'
  | 'contratos'
  | 'solicitudesSeguro'
  | 'cobrosPendientes'
  | 'incidenciasAbiertas'
  | 'morosidadAbierta'
  | 'candidatos';

export type ContadoresNav = Partial<Record<ClaveContadorNav, number>>;

export type IconoNav = ComponentType<{ className?: string }>;

/** Etiqueta por perfil con valor por defecto para los perfiles sin override. */
export type TextoPorPerfil = Partial<Record<PerfilNavegacion, string>> & { readonly porDefecto: string };

export interface ItemNavDef {
  readonly section: SectionType;
  readonly grupo: GrupoNavId;
  readonly icono: IconoNav;
  /** Override de icono cuando el mismo destino tiene identidad distinta por perfil. */
  readonly iconoPorPerfil?: Partial<Record<PerfilNavegacion, IconoNav>>;
  readonly etiquetas: TextoPorPerfil;
  readonly descripciones: TextoPorPerfil;
  readonly perfiles: readonly PerfilNavegacion[];
  /**
   * Ajuste explícito de orden dentro del grupo para un perfil concreto
   * (menor = antes; por defecto 0; los empates conservan el orden del catálogo).
   * Sólo se usa cuando el orden previo de un perfil era distinto y se conserva.
   */
  readonly ordenPorPerfil?: Partial<Record<PerfilNavegacion, number>>;
  /** El perfil PROFESIONAL sólo la ve con el rol `GESTOR_PATRIMONIAL` (igual que antes). */
  readonly requiereGestorPatrimonial?: boolean;
  readonly contador?: ClaveContadorNav;
}

/**
 * Catálogo de navegación. **El orden de este array es el orden de render**
 * dentro de cada grupo (los grupos se ordenan según `GRUPOS_NAVEGACION`).
 */
export const NAVEGACION: readonly ItemNavDef[] = [
  // ── Inicio y control ───────────────────────────────────────────────────────
  {
    section: 'dashboard',
    grupo: 'CONTROL',
    icono: LayoutDashboard,
    etiquetas: { porDefecto: 'Centro de Control' },
    descripciones: { porDefecto: 'KPIs, atención prioritaria, financiero y operaciones' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'administracion',
    grupo: 'CONTROL',
    icono: Shield,
    iconoPorPerfil: { PROFESIONAL: Wrench },
    etiquetas: { porDefecto: 'Administración y Seguridad', PROFESIONAL: 'Mi Portal Profesional' },
    descripciones: { porDefecto: 'Usuarios, roles, módulos y auditoría', PROFESIONAL: 'Tus datos y especialidades' },
    perfiles: ['ADMINISTRADOR', 'PROFESIONAL'],
  },

  // ── Cartera y propiedad ────────────────────────────────────────────────────
  {
    section: 'inmuebles',
    grupo: 'CARTERA',
    icono: Building2,
    etiquetas: { porDefecto: 'Inmuebles', PROPIETARIO: 'Mis Viviendas', PROFESIONAL: 'Viviendas Asignadas' },
    descripciones: {
      porDefecto: 'Catálogo de propiedades',
      PROPIETARIO: 'Catálogo de propiedades',
      PROFESIONAL: 'Inmuebles a atender',
    },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'],
    contador: 'inmuebles',
  },
  {
    section: 'propietarios',
    grupo: 'CARTERA',
    icono: UserCheck,
    etiquetas: { porDefecto: 'Propietarios & IBAN', PROPIETARIO: 'Mi Portal Propietario' },
    descripciones: {
      porDefecto: 'Base fiscal y cuentas bancarias',
      PROPIETARIO: 'Servicios y profesionales',
    },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
    // El portal del propietario era su primera entrada tras el panel (se conserva).
    ordenPorPerfil: { PROPIETARIO: -1 },
    contador: 'propietarios',
  },
  {
    section: 'inversion',
    grupo: 'CARTERA',
    icono: TrendingUp,
    etiquetas: { porDefecto: 'Inversión y Valoración' },
    descripciones: { porDefecto: 'Compra, reforma, alquiler y rentabilidad' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'inquilinos',
    grupo: 'CARTERA',
    icono: Smartphone,
    etiquetas: { porDefecto: 'Portal Inquilinos' },
    descripciones: { porDefecto: 'Accesos, invitaciones y mensajes' },
    perfiles: ['ADMINISTRADOR'],
  },
  {
    section: 'suministros',
    grupo: 'CARTERA',
    icono: Zap,
    etiquetas: { porDefecto: 'Suministros' },
    descripciones: { porDefecto: 'CUPS, lecturas y reparto', PROPIETARIO: 'Lecturas y consumos' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },

  // ── Económico ──────────────────────────────────────────────────────────────
  {
    section: 'cobros',
    grupo: 'ECONOMICO',
    icono: Receipt,
    etiquetas: { porDefecto: 'Gestión de Cobros', PROPIETARIO: 'Mis Cobros', PROFESIONAL: 'Cobros de alquiler' },
    descripciones: {
      porDefecto: 'Control mensual de alquileres',
      PROPIETARIO: 'Control mensual y pagos',
      PROFESIONAL: 'Seguimiento de alquileres delegados',
    },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'],
    requiereGestorPatrimonial: true,
    contador: 'cobrosPendientes',
  },
  {
    section: 'tesoreria',
    grupo: 'ECONOMICO',
    icono: Wallet,
    etiquetas: { porDefecto: 'Tesorería & SEPA', PROPIETARIO: 'Mis Liquidaciones' },
    descripciones: {
      porDefecto: 'Liquidaciones, SEPA y movimientos',
      PROPIETARIO: 'Estado de cuenta mensual y neto transferido',
    },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'gastos',
    grupo: 'ECONOMICO',
    icono: TrendingDown,
    etiquetas: { porDefecto: 'Gestión de Gastos', PROPIETARIO: 'Mis Gastos' },
    descripciones: { porDefecto: 'Explotación vs financiación', PROPIETARIO: 'Explotación e hipoteca' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'financiacion',
    grupo: 'ECONOMICO',
    icono: Landmark,
    etiquetas: { porDefecto: 'Financiación & Hipotecas', PROPIETARIO: 'Financiación' },
    descripciones: { porDefecto: 'Préstamos, LTV y amortización', PROPIETARIO: 'Hipotecas y amortización' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'conciliacion',
    grupo: 'ECONOMICO',
    icono: Banknote,
    etiquetas: { porDefecto: 'Conciliación Bancaria' },
    descripciones: { porDefecto: 'Importar extractos y conciliar' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'facturacion',
    grupo: 'ECONOMICO',
    icono: FileText,
    etiquetas: { porDefecto: 'Facturación & VERI*FACTU', PROPIETARIO: 'Facturación' },
    descripciones: { porDefecto: 'Facturas y registro AEAT', PROPIETARIO: 'Facturas y registro VERI*FACTU' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'fiscal',
    grupo: 'ECONOMICO',
    icono: Calculator,
    etiquetas: { porDefecto: 'Fiscalidad IRPF' },
    descripciones: { porDefecto: 'Cálculo y rendimiento IRPF' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'informes',
    grupo: 'ECONOMICO',
    icono: BarChart3,
    etiquetas: { porDefecto: 'Informes Ejecutivos', PROPIETARIO: 'Informes & Export' },
    descripciones: {
      porDefecto: 'Patrimonio, rentabilidad y exportación',
      PROPIETARIO: 'Patrimonio, rentabilidad, exportación estructurada',
    },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'morosidad',
    grupo: 'ECONOMICO',
    icono: ShieldAlert,
    etiquetas: { porDefecto: 'Morosidad y Recobro' },
    descripciones: { porDefecto: 'Deuda, recobro y expediente legal' },
    perfiles: ['ADMINISTRADOR'],
    contador: 'morosidadAbierta',
  },

  // ── Comercial y alquiler ───────────────────────────────────────────────────
  {
    section: 'candidatos',
    grupo: 'COMERCIAL',
    icono: Users,
    etiquetas: { porDefecto: 'Candidatos' },
    descripciones: { porDefecto: 'Listado completo' },
    perfiles: ['ADMINISTRADOR'],
    contador: 'candidatos',
  },
  {
    section: 'preseleccionados',
    grupo: 'COMERCIAL',
    icono: Key,
    etiquetas: { porDefecto: 'Preseleccionados' },
    descripciones: { porDefecto: 'Gestión de visitas y citas' },
    perfiles: ['ADMINISTRADOR'],
    contador: 'preseleccionados',
  },
  {
    section: 'seguro_impago',
    grupo: 'COMERCIAL',
    icono: ShieldCheck,
    etiquetas: { porDefecto: 'Seguro Impago' },
    descripciones: { porDefecto: 'Estudio de solvencia con aseguradoras' },
    perfiles: ['ADMINISTRADOR'],
    contador: 'solicitudesSeguro',
  },
  {
    section: 'formalizacion',
    grupo: 'COMERCIAL',
    icono: FileText,
    etiquetas: {
      porDefecto: 'Formalización & LAU',
      PROPIETARIO: 'Mis Contratos',
      PROFESIONAL: 'Contratos de alquiler',
    },
    descripciones: {
      porDefecto: 'Contratos y asegurabilidad',
      PROPIETARIO: 'Contratos de alquiler',
      PROFESIONAL: 'Contratos en inmuebles delegados',
    },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'],
    requiereGestorPatrimonial: true,
    contador: 'contratos',
  },
  {
    section: 'recomercializacion',
    grupo: 'COMERCIAL',
    icono: RefreshCw,
    etiquetas: { porDefecto: 'Recomercialización', PROPIETARIO: 'Recomercializar' },
    descripciones: {
      porDefecto: 'Salida, inspección y nueva comercialización',
      PROPIETARIO: 'Salida, inspección y nueva puesta en mercado',
    },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'analisis',
    grupo: 'COMERCIAL',
    icono: Sparkles,
    etiquetas: { porDefecto: 'Análisis IA' },
    descripciones: { porDefecto: 'Puntuación e informes' },
    perfiles: ['ADMINISTRADOR'],
  },

  // ── Operaciones y seguros ──────────────────────────────────────────────────
  {
    section: 'incidencias',
    grupo: 'OPERACIONES',
    icono: LifeBuoy,
    etiquetas: { porDefecto: 'Incidencias' },
    descripciones: { porDefecto: 'Averías, partes y seguimiento' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
    contador: 'incidenciasAbiertas',
  },
  {
    section: 'operaciones',
    grupo: 'OPERACIONES',
    icono: Activity,
    etiquetas: { porDefecto: 'Operaciones' },
    descripciones: { porDefecto: 'Centro de operaciones y mantenimiento' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'polizas',
    grupo: 'OPERACIONES',
    icono: ShieldCheck,
    etiquetas: { porDefecto: 'Pólizas y Seguros' },
    descripciones: { porDefecto: 'Pólizas, siniestros y renovaciones' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },
  {
    section: 'actas',
    grupo: 'OPERACIONES',
    icono: FileText,
    etiquetas: { porDefecto: 'Actas Entrada/Salida' },
    descripciones: { porDefecto: 'Inventario, evidencias, firma y trazabilidad' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO'],
  },

  // ── Sistema ────────────────────────────────────────────────────────────────
  {
    section: 'configuracion',
    grupo: 'SISTEMA',
    icono: Settings,
    etiquetas: { porDefecto: 'Configuración', PROPIETARIO: 'Mi Cuenta', PROFESIONAL: 'Mi Cuenta' },
    descripciones: { porDefecto: 'Ajustes del sistema', PROPIETARIO: 'Ajustes', PROFESIONAL: 'Ajustes' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'],
  },
  {
    section: 'ayuda',
    grupo: 'SISTEMA',
    icono: HelpCircle,
    etiquetas: { porDefecto: 'Ayuda' },
    descripciones: { porDefecto: 'Centro de ayuda y tutoriales' },
    perfiles: ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'],
  },
];

export interface OpcionesNavegacion {
  /** Rol `GESTOR_PATRIMONIAL`: habilita las entradas delegadas del profesional. */
  readonly gestorPatrimonial?: boolean;
}

export interface ItemNavVisible {
  readonly id: SectionType;
  readonly grupo: GrupoNavId;
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly icono: IconoNav;
  readonly contador?: ClaveContadorNav;
}

export interface GrupoNavVisible {
  readonly id: GrupoNavId;
  readonly nombre: string;
  readonly items: readonly ItemNavVisible[];
}

/** Perfil de navegación a partir del perfil del usuario (mismo criterio que el shell). */
export function perfilNavegacionDe(tipoPerfil?: TipoPerfilUsuario | string | null): PerfilNavegacion {
  if (tipoPerfil === 'PROPIETARIO') return 'PROPIETARIO';
  if (tipoPerfil === 'PROFESIONAL') return 'PROFESIONAL';
  // ADMINISTRADOR y cualquier valor no contemplado conservan el comportamiento previo.
  return 'ADMINISTRADOR';
}

export function etiquetaDeItem(def: ItemNavDef, perfil: PerfilNavegacion): string {
  return def.etiquetas[perfil] ?? def.etiquetas.porDefecto;
}

export function descripcionDeItem(def: ItemNavDef, perfil: PerfilNavegacion): string {
  return def.descripciones[perfil] ?? def.descripciones.porDefecto;
}

export function iconoDeItem(def: ItemNavDef, perfil: PerfilNavegacion): IconoNav {
  return def.iconoPorPerfil?.[perfil] ?? def.icono;
}

/** ¿Esta entrada se ofrece a este perfil? (navegación visible, nunca autorización). */
export function itemDisponible(
  def: ItemNavDef,
  perfil: PerfilNavegacion,
  opciones: OpcionesNavegacion = {}
): boolean {
  if (!def.perfiles.includes(perfil)) return false;
  if (def.requiereGestorPatrimonial && perfil === 'PROFESIONAL' && !opciones.gestorPatrimonial) return false;
  return true;
}

/** Definiciones visibles para un perfil (orden del catálogo). */
export function definicionesDePerfil(
  perfil: PerfilNavegacion,
  opciones: OpcionesNavegacion = {}
): readonly ItemNavDef[] {
  return NAVEGACION.filter((def) => itemDisponible(def, perfil, opciones));
}

/** Entradas de un grupo, ordenadas de forma determinista **dentro del grupo**. */
function itemsDeGrupo(
  defs: readonly ItemNavDef[],
  perfil: PerfilNavegacion,
  grupo: GrupoNavId
): ItemNavDef[] {
  return defs
    .filter((def) => def.grupo === grupo)
    .sort((a, b) => (a.ordenPorPerfil?.[perfil] ?? 0) - (b.ordenPorPerfil?.[perfil] ?? 0));
}

/**
 * Grupos con sus entradas, listos para pintar y **en el orden de render**.
 * Los grupos sin entradas para el perfil **no se devuelven** (sin encabezados vacíos).
 */
export function gruposDePerfil(
  perfil: PerfilNavegacion,
  opciones: OpcionesNavegacion = {}
): readonly GrupoNavVisible[] {
  const visibles = definicionesDePerfil(perfil, opciones);
  return GRUPOS_NAVEGACION.map((grupo) => ({
    id: grupo.id,
    nombre: grupo.nombre,
    items: itemsDeGrupo(visibles, perfil, grupo.id).map<ItemNavVisible>((def) => ({
      id: def.section,
      grupo: def.grupo,
      etiqueta: etiquetaDeItem(def, perfil),
      descripcion: descripcionDeItem(def, perfil),
      icono: iconoDeItem(def, perfil),
      contador: def.contador,
    })),
  })).filter((grupo) => grupo.items.length > 0);
}

/** Secciones visibles para un perfil, en el orden exacto de render del menú. */
export function seccionesDePerfil(
  perfil: PerfilNavegacion,
  opciones: OpcionesNavegacion = {}
): readonly SectionType[] {
  return gruposDePerfil(perfil, opciones).flatMap((grupo) => grupo.items.map((item) => item.id));
}

/** Valor de badge ya resuelto (sólo números > 0 se muestran; mismo criterio previo). */
export function valorBadge(
  contador: ClaveContadorNav | undefined,
  contadores: ContadoresNav
): number | undefined {
  if (!contador) return undefined;
  const valor = contadores[contador];
  return typeof valor === 'number' && valor > 0 ? valor : undefined;
}

export const ATRIBUTO_TOUR_NAV = 'data-tour';

/** Valor de `data-tour` que consumen los tutoriales de la capa transversal §6. */
export function idTourDeSeccion(section: SectionType): string {
  return `nav-${section}`;
}
