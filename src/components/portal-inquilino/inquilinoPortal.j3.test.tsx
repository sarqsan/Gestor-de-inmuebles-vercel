/**
 * @vitest-environment jsdom
 *
 * J.3 — Portada «Mi vivienda» del Portal Inquilino.
 * Cubre: situación contractual, separación atención/información, estado
 * positivo sin pendientes, acciones principales y no regresión de la capa
 * de ayuda (§6) ni de la navegación existente.
 *
 * No toca `usePortalInquilino` real (ni Firestore): se mockea para poder
 * renderizar el Shell de forma aislada con distintos escenarios.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom no implementa scrollIntoView (lo usa la vista de mensajes al abrirse).
// Es una limitación del entorno de test, no del producto.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
import type { ContratoFormalizacion, Inmueble, UsuarioApp } from '../../types';

/** Periodo del mes en curso, igual que lo calcula PortalInicio. */
const AHORA = new Date();
const PERIODO_ACTUAL = `${AHORA.getFullYear()}-${String(AHORA.getMonth() + 1).padStart(2, '0')}`;

const CONTRATO_BASE = {
  id: 'c-1',
  candidatoId: 'cand-1',
  inmuebleId: 'inm-1',
  inmuebleNombre: 'Piso centro',
  inmuebleDireccion: 'Calle Mayor 1',
  inmuebleCiudad: 'Sevilla',
  propietarioNombre: 'Ana Propietaria',
  propietarioDni: '12345678Z',
  propietarioDireccion: 'Calle Real 5',
  propietarioTelefono: '600999888',
  propietarioEmail: 'ana@correo.test',
  propietarioIban: 'ES0000000000000000000000',
  candidatoNombre: 'Marta García',
  candidatoDni: '87654321X',
  candidatoTelefono: '600111222',
  candidatoEmail: 'marta@correo.test',
  rentaMensual: 750,
  fianzaLegalMeses: 1,
  fianzaLegalImporte: 750,
  garantiaAdicionalMeses: 0,
  garantiaAdicionalImporte: 0,
  fechaInicioContrato: '2026-01-15',
  fechaFinContrato: '2027-01-14',
  duracionAnios: 1,
  diaLimitePagoMes: 5,
  permitirMascotas: false,
  permitirSubarriendo: false,
  incluyeMueblesInventario: false,
  gastosComunidadCargo: 'arrendador',
  ibiCargo: 'arrendador',
  suministrosCargo: 'arrendatario',
  clausulaDesistimientoAnticipado: false,
  clausulasPersonalizadas: [],
  estado: 'FORMALIZADO_ACTIVO',
  esVigente: true,
} as unknown as ContratoFormalizacion;

const INMUEBLE = {
  id: 'inm-1',
  direccion: 'Calle Mayor 1',
  ciudad: 'Sevilla',
  tipo: 'piso',
  habitaciones: 2,
  banos: 1,
  superficie: 80,
  precio: 750,
  estado: 'alquilado',
} as unknown as Inmueble;

/** Escenario mutable que lee el mock del hook. */
const escenario: {
  contratos: ContratoFormalizacion[];
  incidencias: any[];
  mensajes: any[];
} = { contratos: [CONTRATO_BASE], incidencias: [], mensajes: [] };

vi.mock('./usePortalInquilino', () => ({
  usePortalInquilino: () => ({
    contratos: escenario.contratos,
    inmuebles: [INMUEBLE],
    incidencias: escenario.incidencias,
    mensajes: escenario.mensajes,
    suministros: [],
    lecturas: [],
    cambios: [],
    actas: [],
    loading: false,
    error: null,
    recargar: () => Promise.resolve(),
  }),
}));

vi.mock('../../lib/progresoTutorialesFirestore', () => ({
  servicioProgresoTutoriales: {
    cargar: () => Promise.resolve(null),
    guardar: () => Promise.resolve(),
    guardarPaso: () => Promise.resolve(),
    finalizar: () => Promise.resolve(),
  },
}));

import { InquilinoPortalShell } from './InquilinoPortalShell';

const USUARIO: UsuarioApp = {
  id: 'u-iq-1',
  nombre: 'Marta',
  apellidos: 'García López',
  email: 'marta@correo.test',
  tipoPerfil: 'INQUILINO',
  estado: 'ACTIVO',
  roles: ['INQUILINO'],
  permisos: [],
  contratoIds: ['c-1'],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as UsuarioApp;

function montar() {
  return render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
}

function reset(parcial: Partial<typeof escenario> = {}) {
  escenario.contratos = parcial.contratos ?? [CONTRATO_BASE];
  escenario.incidencias = parcial.incidencias ?? [];
  escenario.mensajes = parcial.mensajes ?? [];
}

const INCIDENCIA_ABIERTA = {
  id: 'inc-1',
  contratoId: 'c-1',
  inmuebleId: 'inm-1',
  titulo: 'Fuga en el baño',
  estado: 'ABIERTA',
  categoria: 'FONTANERIA',
  prioridad: 'ALTA',
  fechaCreacion: '2026-02-01',
} as any;

const MENSAJE_SIN_LEER = {
  id: 'msg-1',
  contratoId: 'c-1',
  remitenteRol: 'GESTION',
  leidoPorInquilino: false,
  texto: 'Hola, recuerda la revisión de la caldera.',
  createdAt: '2026-02-01T10:00:00.000Z',
} as any;

/** Cobro del mes en curso en estado RETRASADO, con los importes que exige la vista de recibos. */
const COBRO_RETRASADO = {
  id: 'cob-1',
  contratoId: 'c-1',
  inmuebleId: 'inm-1',
  periodoMesAnio: PERIODO_ACTUAL,
  nombreMes: 'Mes en curso',
  anio: AHORA.getFullYear(),
  mes: AHORA.getMonth() + 1,
  estado: 'RETRASADO',
  importePrevisto: 750,
  importeRecibido: 0,
} as any;

// ---------------------------------------------------------------------------

describe('J.3 — A. Inquilino con contrato: portada e identidad', () => {
  afterEach(() => { cleanup(); reset(); });

  it('muestra la identidad de la vivienda sin inventar datos', () => {
    reset();
    montar();
    expect(screen.getByText(/Portal del inquilino/i)).toBeTruthy();
    expect(screen.getAllByText(/Calle Mayor 1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Hola, Marta/)).toBeTruthy();
  });

  it('muestra la situación contractual en lenguaje natural, NO la constante interna', () => {
    reset();
    montar();
    const tarjeta = screen.getByTestId('portada-situacion-contrato');
    expect(tarjeta).toBeTruthy();
    expect(screen.getByTestId('portada-estado-contrato').textContent).toMatch(/En vigor/);
    // El estado interno del ERP no debe aparecer en ninguna parte de la portada
    expect(tarjeta.textContent).not.toMatch(/FORMALIZADO_ACTIVO/);
  });

  it('muestra fechas y día de pago reales procedentes del contrato', () => {
    reset();
    montar();
    const tarjeta = screen.getByTestId('portada-situacion-contrato');
    expect(tarjeta.textContent).toMatch(/Desde/);
    expect(tarjeta.textContent).toMatch(/15\/1\/2026|15\/01\/2026/);
    expect(tarjeta.textContent).toMatch(/Hasta/);
    expect(tarjeta.textContent).toMatch(/Antes del 5 de cada mes/);
  });

  it('omite la fecha de fin cuando el contrato no la tiene (no inventa datos)', () => {
    const sinFin = { ...CONTRATO_BASE, fechaFinContrato: undefined } as ContratoFormalizacion;
    reset({ contratos: [sinFin] });
    montar();
    const tarjeta = screen.getByTestId('portada-situacion-contrato');
    expect(tarjeta.textContent).toMatch(/Desde/);
    expect(tarjeta.textContent).not.toMatch(/Hasta/);
    expect(tarjeta.textContent).not.toMatch(/undefined|null|NaN|Invalid/);
  });

  it('no expone datos personales del propietario ni identificadores en la portada', () => {
    reset();
    const { container } = montar();
    const texto = container.textContent || '';
    expect(texto).not.toMatch(/ana@correo\.test/);
    expect(texto).not.toMatch(/600999888/);
    expect(texto).not.toMatch(/12345678Z/);
    expect(texto).not.toMatch(/\bc-1\b|\binm-1\b|cand-1/);
  });
});

describe('J.3 — B. Inquilino con pendientes', () => {
  afterEach(() => { cleanup(); reset(); });

  it('un recibo retrasado aparece como «Requiere tu atención» y lleva a pagos', () => {
    const conRetraso = {
      ...CONTRATO_BASE,
      registroCobros: [COBRO_RETRASADO],
    } as unknown as ContratoFormalizacion;
    reset({ contratos: [conRetraso] });
    montar();
    const atencion = screen.getByTestId('portada-requiere-atencion');
    expect(atencion.textContent).toMatch(/retrasado/i);
    fireEvent.click(screen.getByTestId('portada-atencion-recibo-retrasado'));
    // Navega a la vista real de recibos
    expect(screen.getAllByText(/Recibos y pagos/i).length).toBeGreaterThan(0);
  });

  it('los mensajes sin leer requieren atención y llevan a la vista de mensajes', () => {
    reset({ mensajes: [MENSAJE_SIN_LEER] });
    montar();
    expect(screen.getByTestId('portada-atencion-mensajes').textContent).toMatch(
      /1 mensaje nuevo de gestión/,
    );
    fireEvent.click(screen.getByTestId('portada-atencion-mensajes'));
    expect(screen.getAllByText(/Mensajes/).length).toBeGreaterThan(0);
  });

  it('una avería abierta es INFORMACIÓN, no una alerta de atención', () => {
    reset({ incidencias: [INCIDENCIA_ABIERTA] });
    montar();
    expect(screen.queryByTestId('portada-requiere-atencion')).toBeNull();
    const info = screen.getByTestId('portada-informacion');
    expect(info.textContent).toMatch(/1 avería en seguimiento/);
  });

  it('distingue ambos bloques cuando coexisten atención e información', () => {
    const conRetraso = {
      ...CONTRATO_BASE,
      registroCobros: [COBRO_RETRASADO],
    } as unknown as ContratoFormalizacion;
    reset({ contratos: [conRetraso], incidencias: [INCIDENCIA_ABIERTA] });
    montar();
    expect(screen.getByTestId('portada-requiere-atencion')).toBeTruthy();
    expect(screen.getByTestId('portada-informacion')).toBeTruthy();
    expect(screen.queryByTestId('portada-todo-en-orden')).toBeNull();
  });
});

describe('J.3 — C. Inquilino sin pendientes', () => {
  afterEach(() => { cleanup(); reset(); });

  it('muestra un estado positivo y NINGUNA sección de pendientes vacía', () => {
    reset();
    montar();
    expect(screen.getByTestId('portada-todo-en-orden')).toBeTruthy();
    expect(screen.getByText(/Todo está en orden/)).toBeTruthy();
    expect(screen.queryByTestId('portada-requiere-atencion')).toBeNull();
    expect(screen.queryByTestId('portada-informacion')).toBeNull();
  });
});

describe('J.3 — D. Inquilino sin contrato (J.1 preservado)', () => {
  afterEach(() => { cleanup(); reset(); });

  it('conserva la bienvenida de J.1 y el acceso real a Mi cuenta', () => {
    reset({ contratos: [] });
    montar();
    expect(screen.getByTestId('portal-inquilino-sin-contrato')).toBeTruthy();
    expect(screen.getByText(/Hola, Marta/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ver mis datos de acceso/i }));
    expect(screen.getAllByText(/marta@correo\.test/).length).toBeGreaterThan(0);
  });

  it('NO muestra información contractual inexistente ni CTAs falsos', () => {
    reset({ contratos: [] });
    montar();
    expect(screen.queryByTestId('portada-situacion-contrato')).toBeNull();
    expect(screen.queryByTestId('portada-estado-contrato')).toBeNull();
    expect(screen.queryByTestId('portada-acciones-inquilino')).toBeNull();
    // §12: sin contrato no puede haber mensajería (PortalMensajes exige contrato)
    expect(screen.queryByRole('button', { name: /Hablar con gesti\u00f3n/i })).toBeNull();
  });
});

describe('J.3 — E. Acciones principales y no regresión', () => {
  afterEach(() => { cleanup(); reset(); });

  it('ofrece las acciones principales y conserva «Dar lectura» (sin perder capacidades)', () => {
    reset();
    montar();
    const acciones = screen.getByTestId('portada-acciones-inquilino');
    const texto = acciones.textContent || '';
    for (const t of ['Mi contrato', 'Mis pagos', 'Notificar avería', 'Mensajes', 'Dar lectura', 'Mi cuenta']) {
      expect(texto).toContain(t);
    }
  });

  it('la acción «Mi cuenta» de la portada navega a una vista real', () => {
    reset();
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Mi cuenta/ }));
    expect(screen.getAllByText(/Contratos vinculados/i).length).toBeGreaterThan(0);
  });

  it('conserva la navegación inferior de 5 pestañas del Shell', () => {
    reset();
    montar();
    for (const n of [/Inicio/, /Recibos/, /Aver\u00edas/, /Luz\/Agua/, /M\u00e1s/]) {
      expect(screen.getByRole('button', { name: n })).toBeTruthy();
    }
  });

  it('conserva la capa de ayuda §6 montada en la cabecera (ContextualHelp + Asistente)', () => {
    reset();
    montar();
    // ContextualHelp expone aria-label "Ayuda: ..."; el asistente su propio botón.
    expect(screen.getByRole('button', { name: /^Ayuda:/i })).toBeTruthy();
  });

  it('no introduce el ERP administrativo en el portal del inquilino', () => {
    reset();
    montar();
    expect(document.querySelector('#propietario-portal-section')).toBeNull();
    expect(screen.queryByText(/Centro de Control/i)).toBeNull();
    expect(screen.queryByText(/Mi patrimonio de un vistazo/i)).toBeNull();
  });
});
