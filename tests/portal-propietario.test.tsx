/**
 * PORTAL PROPIETARIO — Gastos / Cobros / Incidencias (solo lectura).
 *
 * Renderiza el componente REAL sobre props directas (jsdom, sin Firestore) y
 * comprueba comportamiento observable:
 *   lectura → filtrado → aislamiento por propietario/cartera → resúmenes del
 *   motor → estados/etiquetas del motor → detalle → privacidad (sin contactos
 *   del inquilino, sin notas internas, sin referencias bancarias).
 *
 * Los esperados numéricos se calculan con los MISMOS motores puros que el
 * portal reutiliza (`resumenGastos`, `calcularResumenCobros`), de modo que el
 * test pinna "el portal muestra lo que dice el motor", no cifras a mano.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Incidencia,
  Inmueble,
  Propietario,
  UsuarioApp,
} from '../src/types';
import { PropietarioPortalSection } from '../src/components/sections/PropietarioPortalSection';
import { resumenGastos } from '../src/utils/gastosEngine';
import {
  actualizarEstadosVencimiento,
  calcularResumenCobros,
  obtenerTodosCobros,
} from '../src/utils/cobrosEngine';
import { formatoImporteSepa } from '../src/tesoreria/sepaUtils';

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Fixtures (objetos parciales con cast, patrón habitual del repo en tests).
// ---------------------------------------------------------------------------

const USER = {
  id: 'user-prop1',
  nombre: 'Pepe',
  email: 'pepe@test.es',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: 'PROP1',
  inmuebleIds: ['VIV1', 'VIV2'],
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
} as unknown as UsuarioApp;

function inmueble(id: string, propietarioId: string, alias: string): Inmueble {
  return {
    id,
    direccion: `Calle ${alias} 1`,
    ciudad: 'Madrid',
    precio: 1000,
    estado: 'alquilado',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    alias,
    propietarioId,
  } as unknown as Inmueble;
}
const INMUEBLES = [
  inmueble('VIV1', 'PROP1', 'Piso Centro'),
  inmueble('VIV2', 'PROP1', 'Piso Norte'),
  inmueble('VIV_X', 'OTRO', 'Piso Ajeno'),
];

const FICHA = { id: 'PROP1', nombre: 'Pepe Propietario' } as unknown as Propietario;

function periodo(
  mes: number,
  nombreMes: string,
  estado: CobroPeriodo['estado'],
  previsto: number,
  recibido: number,
  extra: Partial<CobroPeriodo> = {},
): CobroPeriodo {
  return {
    id: `cobro_C1_2025_${String(mes).padStart(2, '0')}`,
    inmuebleId: 'VIV1',
    contratoId: 'C1',
    inquilinoId: 'INQ1',
    propietarioId: 'PROP1',
    inmuebleDireccion: 'Calle Piso Centro 1',
    inquilinoNombre: 'Inquilino Bueno',
    mes,
    anio: 2025,
    periodoMesAnio: `2025-${String(mes).padStart(2, '0')}`,
    nombreMes,
    importePrevisto: previsto,
    importeRecibido: recibido,
    fechaVencimiento: `2025-${String(mes).padStart(2, '0')}-05`,
    estado,
    historialCambios: [],
    ...extra,
  };
}
// Contrato CERRADO (ene–mar 2025): el motor no genera periodos nuevos
// (determinista, independiente de la fecha actual) y conserva los 3 dados.
const REGISTRO_C1 = [
  periodo(1, 'Enero 2025', 'RECIBIDO', 1000, 1000, {
    fechaPago: '2025-01-04',
    metodoPago: 'transferencia',
    inquilinoDni: '11111111A',
    inquilinoTelefono: '600111222',
    inquilinoEmail: 'bueno@test.es',
    referenciaBancaria: 'REF-SECRETA-001',
  }),
  periodo(2, 'Febrero 2025', 'RECIBIDO', 1000, 1000, {
    fechaPago: '2025-02-03',
    metodoPago: 'domiciliacion',
    referenciaBancaria: 'REF-SECRETA-002',
  }),
  periodo(3, 'Marzo 2025', 'PENDIENTE', 1000, 0, {
    motivoIncidencia: 'Recibo devuelto por el banco',
    observaciones: 'Se reclama el pago pendiente.',
  }),
];
const C1 = {
  id: 'C1',
  inmuebleId: 'VIV1',
  candidatoId: 'INQ1',
  candidatoNombre: 'Inquilino Bueno',
  rentaMensual: 1000,
  fechaInicioContrato: '2025-01-10',
  fechaFinContrato: '2025-03-20',
  esVigente: false,
  diaLimitePagoMes: 5,
  estado: 'FINALIZADO',
  propietarioId: 'PROP1',
  inmuebleDireccion: 'Calle Piso Centro 1',
  registroCobros: REGISTRO_C1,
} as unknown as ContratoFormalizacion;
// Contrato ajeno VIGENTE: si el aislamiento fallase, generaría periodos con
// este nombre hasta el mes actual+2 (siempre visible → chivato robusto).
const CX = {
  id: 'CX',
  inmuebleId: 'VIV_X',
  candidatoId: 'INQX',
  candidatoNombre: 'INQUILINO AJENO UNICO',
  rentaMensual: 9999,
  fechaInicioContrato: '2025-01-01',
  esVigente: true,
  diaLimitePagoMes: 5,
  estado: 'FORMALIZADO_ACTIVO',
  propietarioId: 'OTRO',
  inmuebleDireccion: 'Calle Piso Ajeno 1',
  registroCobros: [],
} as unknown as ContratoFormalizacion;

function gasto(
  id: string,
  inmuebleId: string,
  propietarioId: string,
  extra: Partial<Gasto> & { concepto: string; importe: number },
): Gasto {
  return {
    id,
    inmuebleId,
    propietarioId,
    tipo: 'EXPLOTACION',
    categoria: 'COMUNIDAD',
    estado: 'PAGADO',
    aCargoDe: 'arrendador',
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...extra,
  } as Gasto;
}
const GASTOS: Gasto[] = [
  gasto('g1', 'VIV1', 'PROP1', {
    concepto: 'Cuota comunidad enero',
    importe: 120.5,
    proveedor: 'Comunidad Propietarios',
    fechaDevengo: '2025-01-05',
    periodoMesAnio: '2025-01',
    deducible: true,
    metodoPago: 'domiciliacion',
    justificanteUrl: 'https://ejemplo.test/factura-g1.pdf',
  }),
  // Propio por CARTERA (segunda rama del filtro defensivo).
  gasto('g2', 'VIV2', 'OTRO', {
    concepto: 'IBI 2025 segundo piso',
    importe: 450,
    categoria: 'IBI',
    estado: 'PENDIENTE',
    proveedor: 'Ayuntamiento',
    fechaDevengo: '2025-04-01',
    periodoMesAnio: '2025-04',
  }),
  gasto('gAJENO', 'VIV_X', 'OTRO', {
    concepto: 'GASTO AJENO UNICO',
    importe: 9999,
  }),
  gasto('g4', 'VIV1', 'PROP1', {
    concepto: 'Hipoteca enero',
    importe: 500,
    tipo: 'FINANCIACION',
    categoria: 'CUOTA_HIPOTECARIA',
    proveedor: 'Banco Ejemplo',
    fechaDevengo: '2025-01-01',
    periodoMesAnio: '2025-01',
    intereses: 80,
    capitalAmortizado: 420,
  }),
];

function incidencia(
  id: string,
  inmuebleId: string,
  propietarioId: string,
  extra: Partial<Incidencia> & { titulo: string },
): Incidencia {
  return {
    id,
    inmuebleId,
    propietarioId,
    descripcion: 'Descripción de prueba.',
    categoria: 'FONTANERIA',
    prioridad: 'NORMAL',
    estado: 'ABIERTA',
    origen: 'INQUILINO',
    ...extra,
  } as Incidencia;
}
const INCIDENCIAS: Incidencia[] = [
  incidencia('i1', 'VIV1', 'PROP1', {
    titulo: 'Fuga bajo fregadero UNICA',
    numero: 'INC-2025-0001',
    descripcion: 'Goteo constante bajo el fregadero de la cocina.',
    prioridad: 'URGENTE',
    estado: 'ABIERTA',
    fechaCreacion: '2025-05-01',
    profesionalAsignadoNombre: 'Fontanero Ruiz',
    inquilinoNombre: 'Inquilino Bueno',
    inquilinoTelefono: '600111222',
    contactoTelefono: '600333444',
    notasInternas: 'NOTA INTERNA SECRETA',
  }),
  // Propia por inmuebleIds (segunda rama de `canAccessIncidencia`).
  incidencia('i2', 'VIV2', 'OTRO', {
    titulo: 'Mancha humedad dormitorio SEGUNDA',
    categoria: 'HUMEDADES',
    estado: 'RESUELTA',
    fechaCreacion: '2025-02-01',
    resolucion: 'Sellado e pintado de la zona afectada.',
  }),
  incidencia('i3', 'VIV_X', 'OTRO', { titulo: 'INCIDENCIA AJENA UNICA' }),
];

// Esperados calculados con los motores (lo que el portal debe mostrar).
const ESP_GASTOS = resumenGastos(GASTOS.filter((g) => g.id !== 'gAJENO'));
const COBROS_MOTOR = obtenerTodosCobros(
  [actualizarEstadosVencimiento(C1).contratoActualizado],
);
const ESP_COBROS = calcularResumenCobros(COBROS_MOTOR);

function renderPortal() {
  const noop = () => undefined;
  return render(
    <PropietarioPortalSection
      currentUser={USER}
      inmuebles={INMUEBLES}
      profesionales={[]}
      contratos={[C1, CX]}
      especialidades={[]}
      propietarios={[FICHA]}
      liquidaciones={[]}
      resumenMorosidad={[]}
      gastos={GASTOS}
      incidencias={INCIDENCIAS}
      onOpenCrearProfesionalModal={noop}
      onSaveProfesional={async () => undefined}
    />,
  );
}

function irATab(nombre: 'Gastos' | 'Cobros' | 'Incidencias') {
  fireEvent.click(screen.getByText(nombre));
}

function textoTab(nombre: 'Gastos' | 'Cobros' | 'Incidencias'): string {
  return screen.getByText(nombre).closest('button')?.textContent || '';
}

// Las etiquetas de estado aparecen también en los <option> de los filtros;
// las insignias de las tarjetas son SPAN: se filtra por tag para pinnarlas.
function spansCon(texto: string): HTMLElement[] {
  return screen.getAllByText(texto).filter((el) => el.tagName === 'SPAN');
}

// ---------------------------------------------------------------------------
// A. GASTOS
// ---------------------------------------------------------------------------
describe('Portal Propietario · alta de inmueble', () => {
  it('el estado vacío no espera al administrador y el CTA reutiliza el callback de alta', () => {
    const onCrear = vi.fn();
    render(
      <PropietarioPortalSection
        currentUser={USER}
        inmuebles={[]}
        profesionales={[]}
        contratos={[]}
        especialidades={[]}
        propietarios={[FICHA]}
        onOpenCrearProfesionalModal={() => undefined}
        onSaveProfesional={async () => undefined}
        onCrearInmueble={onCrear}
      />,
    );

    expect(screen.queryByText(/El administrador principal asignará/)).toBeNull();
    expect(screen.getByText(/Puedes crear tu primer inmueble desde aquí/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: (nombre) => nombre === 'Nuevo inmueble' }));
    expect(onCrear).toHaveBeenCalledTimes(1);
    expect(onCrear).toHaveBeenCalledWith('PROP1');
  });
});

describe('Portal Propietario · Gastos', () => {
  it('muestra los gastos propios (por propietarioId y por cartera) y excluye los ajenos', () => {
    renderPortal();
    irATab('Gastos');
    expect(screen.getByText('Cuota comunidad enero')).toBeTruthy();
    expect(screen.getByText('IBI 2025 segundo piso')).toBeTruthy();
    expect(screen.getByText('Hipoteca enero')).toBeTruthy();
    expect(document.body.textContent).not.toContain('GASTO AJENO UNICO');
    expect(document.body.textContent).not.toContain('9999');
  });

  it('el resumen coincide con `resumenGastos` del motor', () => {
    renderPortal();
    irATab('Gastos');
    expect(ESP_GASTOS.numero).toBe(3);
    expect(document.body.textContent).toContain(`${formatoImporteSepa(ESP_GASTOS.explotacionPagado)} €`);
    expect(document.body.textContent).toContain(`${formatoImporteSepa(ESP_GASTOS.pendiente)} €`);
    expect(document.body.textContent).toContain(`${formatoImporteSepa(ESP_GASTOS.salidaCajaPagada)} €`);
  });

  it('filtra por categoría, estado, vivienda y búsqueda', () => {
    const { container } = renderPortal();
    irATab('Gastos');
    const [selViv, selCat, selEst] = Array.from(container.querySelectorAll('select'));
    fireEvent.change(selCat, { target: { value: 'COMUNIDAD' } });
    expect(screen.queryByText('Cuota comunidad enero')).toBeTruthy();
    expect(screen.queryByText('IBI 2025 segundo piso')).toBeNull();
    fireEvent.change(selCat, { target: { value: 'TODAS' } });
    fireEvent.change(selEst, { target: { value: 'PENDIENTE' } });
    expect(screen.queryByText('IBI 2025 segundo piso')).toBeTruthy();
    expect(screen.queryByText('Cuota comunidad enero')).toBeNull();
    fireEvent.change(selEst, { target: { value: 'TODOS' } });
    fireEvent.change(selViv, { target: { value: 'VIV2' } });
    expect(screen.queryByText('IBI 2025 segundo piso')).toBeTruthy();
    expect(screen.queryByText('Hipoteca enero')).toBeNull();
    fireEvent.change(selViv, { target: { value: 'TODOS' } });
    const input = container.querySelector('input[placeholder^="Buscar por concepto"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hipoteca' } });
    expect(screen.queryByText('Hipoteca enero')).toBeTruthy();
    expect(screen.queryByText('Cuota comunidad enero')).toBeNull();
  });

  it('el detalle muestra proveedor, deducible y enlace al justificante', () => {
    renderPortal();
    irATab('Gastos');
    const tarjetaG1 = screen.getByText('Cuota comunidad enero').closest('div.p-4') as HTMLElement;
    fireEvent.click(tarjetaG1.querySelector('button') as HTMLButtonElement);
    expect(document.body.textContent).toContain('Comunidad Propietarios');
    expect(document.body.textContent).toContain('Deducible IRPF');
    expect((document.querySelector('a[href="https://ejemplo.test/factura-g1.pdf"]') as HTMLAnchorElement)?.textContent).toContain(
      'Ver justificante / factura',
    );
  });

  it('el detalle del gasto de financiación desglosa intereses y capital', () => {
    renderPortal();
    irATab('Gastos');
    const tarjetaG4 = screen.getByText('Hipoteca enero').closest('div.p-4') as HTMLElement;
    fireEvent.click(tarjetaG4.querySelector('button') as HTMLButtonElement);
    expect(document.body.textContent).toContain('Intereses');
    expect(document.body.textContent).toContain(`${formatoImporteSepa(80)} €`);
    expect(document.body.textContent).toContain('Capital amortizado');
    expect(document.body.textContent).toContain(`${formatoImporteSepa(420)} €`);
  });
});

// ---------------------------------------------------------------------------
// B. COBROS
// ---------------------------------------------------------------------------
describe('Portal Propietario · Cobros', () => {
  it('deriva los periodos de MIS contratos con el motor y excluye el contrato ajeno', () => {
    renderPortal();
    irATab('Cobros');
    expect(COBROS_MOTOR.map((c) => c.periodoMesAnio)).toEqual(['2025-03', '2025-02', '2025-01']);
    expect(screen.getByText('Enero 2025')).toBeTruthy();
    expect(screen.getByText('Febrero 2025')).toBeTruthy();
    expect(screen.getByText('Marzo 2025')).toBeTruthy();
    expect(document.body.textContent).not.toContain('INQUILINO AJENO UNICO');
    expect(document.body.textContent).not.toContain('9999');
  });

  it('el resumen coincide con `calcularResumenCobros` del motor', () => {
    renderPortal();
    irATab('Cobros');
    expect(ESP_COBROS.totalPrevisto).toBe(3000);
    expect(ESP_COBROS.totalRecibido).toBe(2000);
    expect(document.body.textContent).toContain(`${formatoImporteSepa(3000)} €`);
    expect(document.body.textContent).toContain(`${formatoImporteSepa(2000)} €`);
    expect(document.body.textContent).toContain(
      `${formatoImporteSepa(ESP_COBROS.totalPendiente + ESP_COBROS.totalRetrasado)} €`,
    );
    expect(document.body.textContent).toContain(`${ESP_COBROS.porcentajeCobrado} %`);
  });

  it('muestra los estados del motor (marzo vencido → Retrasado) sin datos de contacto ni referencias', () => {
    renderPortal();
    irATab('Cobros');
    expect(COBROS_MOTOR.find((c) => c.periodoMesAnio === '2025-03')?.estado).toBe('RETRASADO');
    expect(spansCon('Retrasado')).toHaveLength(1);
    expect(spansCon('Recibido')).toHaveLength(2);
    // Detalle del periodo de marzo (primero: orden cronológico inverso).
    const botones = screen.getAllByText('Ver detalle');
    fireEvent.click(botones[0]);
    expect(document.body.textContent).toContain('Recibo devuelto por el banco');
    expect(document.body.textContent).not.toContain('11111111A');
    expect(document.body.textContent).not.toContain('600111222');
    expect(document.body.textContent).not.toContain('bueno@test.es');
    expect(document.body.textContent).not.toContain('REF-SECRETA-001');
    expect(document.body.textContent).not.toContain('REF-SECRETA-002');
  });

  it('filtra por estado y vivienda', () => {
    const { container } = renderPortal();
    irATab('Cobros');
    const [selViv, selEst] = Array.from(container.querySelectorAll('select'));
    fireEvent.change(selEst, { target: { value: 'RETRASADO' } });
    expect(screen.queryByText('Marzo 2025')).toBeTruthy();
    expect(screen.queryByText('Enero 2025')).toBeNull();
    fireEvent.change(selEst, { target: { value: 'TODOS' } });
    fireEvent.change(selViv, { target: { value: 'VIV1' } });
    expect(screen.queryByText('Marzo 2025')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// C. INCIDENCIAS
// ---------------------------------------------------------------------------
describe('Portal Propietario · Incidencias', () => {
  it('muestra las propias (puerta `canAccess` + cartera) y excluye la ajena', () => {
    renderPortal();
    irATab('Incidencias');
    expect(screen.getByText('INC-2025-0001 · Fuga bajo fregadero UNICA')).toBeTruthy();
    expect(screen.getByText('Mancha humedad dormitorio SEGUNDA')).toBeTruthy();
    expect(document.body.textContent).not.toContain('INCIDENCIA AJENA UNICA');
  });

  it('etiquetas del motor y detalle sin notas internas ni teléfonos', () => {
    renderPortal();
    irATab('Incidencias');
    expect(document.body.textContent).toContain('Fontanería ·');
    expect(spansCon('Abierta')).toHaveLength(1);
    expect(spansCon('Urgente (Inmediata)')).toHaveLength(1);
    fireEvent.click(screen.getAllByText('Ver detalle')[0]);
    expect(document.body.textContent).toContain('Goteo constante bajo el fregadero');
    expect(document.body.textContent).toContain('Fontanero Ruiz');
    expect(document.body.textContent).toContain('Inquilino Bueno');
    expect(document.body.textContent).not.toContain('600111222');
    expect(document.body.textContent).not.toContain('600333444');
    expect(document.body.textContent).not.toContain('NOTA INTERNA SECRETA');
  });

  it('filtra con el motor por estado, categoría y búsqueda', () => {
    const { container } = renderPortal();
    irATab('Incidencias');
    const selectsArr = Array.from(container.querySelectorAll('select'));
    const selEst = selectsArr[selectsArr.length - 1];
    fireEvent.change(selEst, { target: { value: 'RESUELTA' } });
    expect(screen.queryByText('Mancha humedad dormitorio SEGUNDA')).toBeTruthy();
    expect(screen.queryByText('INC-2025-0001 · Fuga bajo fregadero UNICA')).toBeNull();
    fireEvent.change(selEst, { target: { value: 'TODOS' } });
    const input = container.querySelector('input[placeholder^="Buscar por título"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'fregadero' } });
    expect(screen.queryByText('INC-2025-0001 · Fuga bajo fregadero UNICA')).toBeTruthy();
    expect(screen.queryByText('Mancha humedad dormitorio SEGUNDA')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D. CONTADORES DE TABS
// ---------------------------------------------------------------------------
describe('Portal Propietario · contadores', () => {
  it('gastos = total propios; cobros = periodos que requieren atención; incidencias = abiertas', () => {
    renderPortal();
    expect(textoTab('Gastos')).toContain('3');
    expect(ESP_COBROS.countPendientes + ESP_COBROS.countRetrasados + ESP_COBROS.countIncidencias).toBe(1);
    expect(textoTab('Cobros')).toContain('1');
    expect(textoTab('Incidencias')).toContain('1');
  });
});
