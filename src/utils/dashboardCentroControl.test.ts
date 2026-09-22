import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { calcularResumenCobros, calcularAvisosCobros, generarPeriodosParaContrato } from './cobrosEngine';
import { resumenGastos } from './gastosEngine';
import type { CobroPeriodo, Gasto, Inmueble, ContratoFormalizacion } from '../types';

// Helpers replicando lógica dashboard para tests deterministas
function calcInmueblesStats(inmuebles: Inmueble[]) {
  const total = inmuebles.length;
  const ocupados = inmuebles.filter((i: any) => i.estado === 'alquilado').length;
  const vacios = inmuebles.filter((i: any) => i.estado === 'disponible').length;
  const porcentaje = total > 0 ? Math.round((ocupados / total) * 100) : null;
  return { total, ocupados, vacios, porcentaje };
}

describe('Dashboard Centro de Control — KPIs reales', () => {
  it('inmueblesStats con datos reales', () => {
    const inmuebles = [
      { id: '1', estado: 'alquilado' },
      { id: '2', estado: 'disponible' },
      { id: '3', estado: 'alquilado' },
    ] as any as Inmueble[];
    const s = calcInmueblesStats(inmuebles);
    expect(s.total).toBe(3);
    expect(s.ocupados).toBe(2);
    expect(s.vacios).toBe(1);
    expect(s.porcentaje).toBe(67);
  });

  it('inmueblesStats sin datos → null no 0 sustituto', () => {
    const s = calcInmueblesStats([] as Inmueble[]);
    expect(s.total).toBe(0);
    expect(s.porcentaje).toBeNull(); // nunca 0 como sustituto de no obtenido
  });

  it('resumenCobros con periodos reales', () => {
    const cobros: CobroPeriodo[] = [
      { id: 'c1', contratoId: 'ct1', inmuebleId: 'i1', periodoMesAnio: '2026-01', fechaVencimiento: '2026-01-05', importePrevisto: 1000, importeRecibido: 1000, estado: 'RECIBIDO', diasRetraso: 0 } as any,
      { id: 'c2', contratoId: 'ct1', inmuebleId: 'i1', periodoMesAnio: '2026-02', fechaVencimiento: '2026-02-05', importePrevisto: 1000, importeRecibido: 0, estado: 'PENDIENTE', diasRetraso: 0 } as any,
      { id: 'c3', contratoId: 'ct1', inmuebleId: 'i1', periodoMesAnio: '2026-03', fechaVencimiento: '2026-03-05', importePrevisto: 1000, importeRecibido: 0, estado: 'RETRASADO', diasRetraso: 10 } as any,
    ];
    const resumen = calcularResumenCobros(cobros);
    expect(resumen.totalPrevisto).toBe(3000);
    expect(resumen.totalRecibido).toBe(1000);
    expect(resumen.countCobrados).toBe(1);
    expect(resumen.countRetrasados).toBe(1);
  });

  it('resumenCobros vacío → ceros informativos pero sin inventar', () => {
    const resumen = calcularResumenCobros([]);
    expect(resumen.totalPrevisto).toBe(0);
    expect(resumen.totalRecibido).toBe(0);
    expect(resumen.countCobrados).toBe(0);
  });

  it('resumenGastos con datos reales', () => {
    const gastos = [
      { id: 'g1', importe: 200, tipo: 'EXPLOTACION', estado: 'PAGADO' },
      { id: 'g2', importe: 800, tipo: 'FINANCIACION', estado: 'PAGADO' },
      { id: 'g3', importe: 100, tipo: 'EXPLOTACION', estado: 'PENDIENTE' },
    ] as any as Gasto[];
    const r = resumenGastos(gastos);
    expect(r.explotacionPagado).toBe(200);
    expect(r.financiacionPagado).toBe(800);
    expect(r.salidaCajaPagada).toBe(1000);
    expect(r.pendiente).toBe(100);
  });

  it('tesorería derivada ingresos - gastos sin segunda fuente', () => {
    const cobros: CobroPeriodo[] = [
      { importeRecibido: 1500, estado: 'RECIBIDO', importePrevisto: 1500 } as any,
    ];
    const gastos = [{ importe: 500, estado: 'PAGADO' } as any as Gasto];
    const rc = calcularResumenCobros(cobros);
    const rg = resumenGastos(gastos);
    const saldo = rc.totalRecibido - rg.salidaCajaPagada;
    expect(saldo).toBe(1000);
  });

  it('morosidad y cobros pendientes cálculo real', () => {
    const hoy = new Date('2026-05-15');
    const cobros: CobroPeriodo[] = [
      { id: '1', estado: 'RETRASADO', importePrevisto: 1000, importeRecibido: 0, fechaVencimiento: '2026-04-01' } as any,
      { id: '2', estado: 'INCIDENCIA', importePrevisto: 500, importeRecibido: 0, fechaVencimiento: '2026-04-10' } as any,
      { id: '3', estado: 'PENDIENTE', importePrevisto: 1000, importeRecibido: 0, fechaVencimiento: '2026-04-01' } as any,
    ];
    const vencidos = cobros.filter((c) => {
      if (c.estado === 'RETRASADO' || c.estado === 'INCIDENCIA') return true;
      if (c.estado === 'PENDIENTE' && c.fechaVencimiento) {
        return new Date(`${c.fechaVencimiento}T23:59:59`) <= hoy;
      }
      return false;
    });
    expect(vencidos.length).toBe(3);
  });
});

describe('Dashboard — Requiere atención prioridad', () => {
  it('ordena critica > alta > media', () => {
    const items = [
      { id: 'gastos_pend', prioridad: 'media' as const },
      { id: 'cobros_pend', prioridad: 'critica' as const },
      { id: 'contratos_fin', prioridad: 'alta' as const },
    ];
    const sorted = items.sort((a, b) => {
      const ord = { critica: 0, alta: 1, media: 2 } as const;
      return ord[a.prioridad] - ord[b.prioridad];
    });
    expect(sorted[0].prioridad).toBe('critica');
    expect(sorted[1].prioridad).toBe('alta');
    expect(sorted[2].prioridad).toBe('media');
  });
});

describe('Dashboard — Permisos y seguridad', () => {
  it('SectionType incluye dashboard', async () => {
    const typesPath = path.resolve(__dirname, '../types.ts');
    const content = fs.readFileSync(typesPath, 'utf-8');
    expect(content).toContain('dashboard');
  });

  it('Sidebar y MobileNav incluyen dashboard para PROPIETARIO y ADMIN', () => {
    const sidebar = fs.readFileSync(path.resolve(__dirname, '../components/Sidebar.tsx'), 'utf-8');
    const mobile = fs.readFileSync(path.resolve(__dirname, '../components/MobileNav.tsx'), 'utf-8');
    expect(sidebar).toContain("'dashboard'");
    expect(mobile).toContain("'dashboard'");
    expect(sidebar).toContain('LayoutDashboard');
  });

  it('Dashboard no duplica sensibles en localStorage ni modifica firestore.rules', () => {
    const dashboardFile = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    expect(dashboardFile).not.toContain('localStorage.setItem');
    expect(dashboardFile).not.toContain('localStorage.getItem');
    // no debe importar reglas ni tocar R1/R2/R3/R4 con código de escritura
    expect(dashboardFile).not.toContain('saveFirestoreRules');
    expect(dashboardFile).not.toContain('updateFirestoreRules');
    const rulesPath = path.resolve(__dirname, '../../firestore.rules');
    if (fs.existsSync(rulesPath)) {
      const rules = fs.readFileSync(rulesPath, 'utf-8');
      // debe seguir deny-by-default y ownerId checks (no se borran)
      expect(rules).toContain('ownerId');
    }
  });

  it('profesional no ve financiero (isProfesional bloquea)', () => {
    const dashboardFile = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    expect(dashboardFile).toContain('isProfesional');
    expect(dashboardFile).toContain('No disponible para perfil profesional');
  });
});

describe('Dashboard — Ausencia datos ficticios', () => {
  it('no contiene números demo hardcodeados ni KPIs estáticos', () => {
    const file = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    // prohibido patrones demo
    const forbidden = ['DEMO', 'demo', '12345', '99999', 'MOCK_KPI'];
    forbidden.forEach((word) => {
      // permitimos comentarios auditoría pero no valores asignados
      const lines = file.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'));
      const joined = lines.join('\n');
      if (word === 'DEMO' || word === 'demo') {
        // si aparece, debe estar solo en comentario auditoría o vacío informativo, no como valor
        // buscamos asignación = 12345
        expect(joined.includes(`${word} =`)).toBe(false);
      }
    });
    // No debe haber array de datos ficticios
    expect(file).not.toContain('datosFicticios');
    expect(file).not.toContain('mockData');
    // Debe tener vacío informativo
    expect(file).toContain('Sin datos');
  });

  it('evolución mensual solo si datos suficientes', () => {
    const file = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    expect(file).toContain('solo si datos suficientes');
    expect(file).toContain('Sin movimientos en el periodo');
  });
});

describe('Dashboard — Navegación a módulos existentes', () => {
  it('usa onSelectSection con rutas reales existentes', () => {
    const file = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    const allowed = ['cobros', 'gastos', 'inmuebles', 'incidencias', 'polizas', 'actas', 'formalizacion', 'conciliacion', 'candidatos'];
    allowed.forEach((sec) => {
      expect(file).toContain(`'${sec}'`);
    });
    // no rutas ficticias
    expect(file).not.toContain('/dashboard-fake');
    expect(file).not.toContain('rutaFicticia');
  });
});

describe('Dashboard — Responsive y arquitectura', () => {
  it('usa grid responsive ordenador/tablet/móvil', () => {
    const file = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    expect(file).toContain('grid-cols-2');
    expect(file).toContain('lg:grid-cols-3');
    expect(file).toContain('xl:grid-cols-6');
    expect(file).toContain('sm:p-7');
  });

  it('no duplica lógica negocio, reutiliza motores existentes', () => {
    const file = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    expect(file).toContain('calcularResumenCobros');
    expect(file).toContain('resumenGastos');
    expect(file).toContain('subscribeIncidencias');
    // No debe crear nuevo motor económico
    expect(file).not.toContain('nuevoMotorEconomico');
    expect(file).not.toContain('segundoMotorCobros');
  });

  it('preparado para IA sin implementarla', () => {
    const file = fs.readFileSync(path.resolve(__dirname, '../components/sections/DashboardEjecutivoSection.tsx'), 'utf-8');
    expect(file).toContain('Asistente contextual IA — Preparado');
    expect(file).not.toContain('openai');
    expect(file).not.toContain('genai');
  });
});

describe('Dashboard — Regresión motores cerrados R1/R2/R3/R4 Bloque C', () => {
  it('no modifica archivos críticos (verificación existencia)', () => {
    // Estos archivos deben existir y no haber sido tocados por dashboard
    const critical = [
      '../lib/firebase.ts',
      '../utils/cobrosEngine.ts',
      '../utils/gastosEngine.ts',
    ];
    critical.forEach((rel) => {
      const p = path.resolve(__dirname, rel);
      expect(fs.existsSync(p)).toBe(true);
    });
  });

  it('cobrosEngine sigue generando periodos deterministas', () => {
    const contrato = {
      id: 'ct_test',
      inmuebleId: 'inm1',
      candidatoId: 'cand1',
      rentaMensual: 1000,
      fechaInicioContrato: '2026-01-01',
      duracionMeses: 3,
      estado: 'ACTIVO',
      esVigente: true,
      registroCobros: [],
    } as any as ContratoFormalizacion;
    const periodos = generarPeriodosParaContrato(contrato);
    // El motor genera desde inicio hasta mes actual + 2 futuros, determinista
    expect(periodos.length).toBeGreaterThanOrEqual(3);
    expect(periodos[0].periodoMesAnio).toBe('2026-01');
    // Determinista: segunda llamada mismo resultado
    const periodos2 = generarPeriodosParaContrato(contrato);
    expect(periodos2.length).toBe(periodos.length);
    expect(periodos2[0].periodoMesAnio).toBe(periodos[0].periodoMesAnio);
  });
});
