/**
 * CENTRO DE OPERACIONES Y MANTENIMIENTO — tests del motor de agregación.
 * Capa pura de solo lectura: sin Firebase, sin fechas reales salvo en pólizas
 * (detectarPolizasProximasVencer usa hoy real: fechas relativas en esos casos).
 */
import { describe, it, expect } from 'vitest';
import type {
  Gasto,
  GarantiaReparacion,
  Incidencia,
  NecesidadReforma,
  PolizaSeguro,
  PresupuestoProfesional,
  Profesional,
  ProyectoReforma,
  Siniestro,
  TareaMantenimiento,
  TrabajoProfesional,
} from '../types';
import { detectarPolizasProximasVencer } from './segurosEngine';
import {
  agendaOperativa,
  cargaProfesionales,
  costeOperativo,
  diasEntreDias,
  filtrarPorAlcance,
  filtrarSiniestrosPorAlcance,
  garantiasProximasVencer,
  garantiasVigentes,
  incidenciasCriticas,
  necesidadesAbiertas,
  presupuestosPendientesDecision,
  proyectosActivos,
  resumenOperativo,
  siniestrosAbiertos,
  tareasProximas,
  tareasVencidas,
  trabajosAbiertos,
  trabajosBloqueados,
  trabajosSinProfesional,
  type AlcanceOperativa,
} from './operacionesEngine';

// Fecha de referencia fija (UTC): 2026-09-22.
const HOY = new Date('2026-09-22T12:00:00.000Z');
const TS = '2026-01-01T00:00:00.000Z';
const PROP_A = 'prop-A';
const PROP_B = 'prop-B';
const INM_1 = 'inm-1';
const INM_2 = 'inm-2';
const INM_X = 'inm-x';

function incidencia(
  parcial: Partial<Incidencia> & { id: string }
): Incidencia {
  return {
    propietarioId: PROP_A,
    inmuebleId: INM_1,
    titulo: `inc ${parcial.id}`,
    descripcion: 'desc',
    categoria: 'FONTANERIA',
    prioridad: 'MEDIA',
    estado: 'ABIERTA',
    origen: 'PROPIETARIO',
    ...parcial,
  };
}

function tarea(parcial: Partial<TareaMantenimiento> & { id: string }): TareaMantenimiento {
  return {
    inmuebleId: INM_1,
    propietarioId: PROP_A,
    titulo: `tar ${parcial.id}`,
    periodicidad: 'ANUAL',
    proximaFecha: '2026-10-01',
    activa: true,
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function trabajo(
  parcial: Partial<TrabajoProfesional> & { id: string }
): TrabajoProfesional {
  return {
    propietarioId: PROP_A,
    inmuebleId: INM_1,
    titulo: `ot ${parcial.id}`,
    descripcion: 'desc',
    categoria: 'FONTANERIA',
    prioridad: 'MEDIA',
    estado: 'PENDIENTE',
    fechaSolicitud: '2026-09-01',
    creadoPor: 'admin',
    actualizadoPor: 'admin',
    historial: [],
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function presupuesto(
  parcial: Partial<PresupuestoProfesional> & { id: string }
): PresupuestoProfesional {
  return {
    trabajoId: 'ot-1',
    profesionalId: 'prof-1',
    propietarioId: PROP_A,
    inmuebleId: INM_1,
    fecha: '2026-09-01',
    importeBase: 100,
    iva: 21,
    importeTotal: 121,
    validez: '30 días',
    descripcion: 'desc',
    partidas: [],
    estado: 'RECIBIDO',
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function garantia(
  parcial: Partial<GarantiaReparacion> & { id: string }
): GarantiaReparacion {
  return {
    inmuebleId: INM_1,
    propietarioId: PROP_A,
    trabajoId: 'ot-1',
    titulo: `gar ${parcial.id}`,
    concepto: 'concepto',
    categoria: 'FONTANERIA',
    proveedor: 'Proveedor SL',
    fechaInicio: '2026-01-01',
    duracionMeses: 12,
    fechaFin: '2026-12-31',
    cobertura: 'cobertura',
    estado: 'ACTIVA',
    incidenciaId: 'inc-1',
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function siniestro(
  parcial: Partial<Siniestro> & { id: string }
): Siniestro {
  return {
    incidenciaId: 'inc-1',
    polizaId: 'pol-1',
    aseguradora: 'Aseguradora',
    fechaComunicacion: '2026-09-01',
    estado: 'COMUNICADO',
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function poliza(parcial: Partial<PolizaSeguro> & { id: string }): PolizaSeguro {
  return {
    aseguradora: 'Aseguradora',
    numeroPoliza: `P-${parcial.id}`,
    tipo: 'HOGAR',
    propietarioId: PROP_A,
    inmuebleId: INM_1,
    fechaInicio: '2026-01-01',
    fechaVencimiento: '2027-01-01',
    estado: 'VIGENTE',
    coberturas: [],
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

/** Fecha YYYY-MM-DD relativa a HOY (determinista). */
function diaRelativo(dias: number): string {
  const d = new Date(HOY);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Fecha YYYY-MM-DD relativa al hoy REAL (para pólizas). */
function diaRealRelativo(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function necesidad(
  parcial: Partial<NecesidadReforma> & { id: string }
): NecesidadReforma {
  return {
    inmuebleId: INM_1,
    propietarioId: PROP_A,
    titulo: `nec ${parcial.id}`,
    descripcion: 'desc',
    prioridad: 'MEDIA',
    estado: 'IDENTIFICADA',
    categoria: 'PARCIAL',
    fecha: '2026-09-01',
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function proyecto(
  parcial: Partial<ProyectoReforma> & { id: string }
): ProyectoReforma {
  return {
    inmuebleId: INM_1,
    propietarioId: PROP_A,
    titulo: `pro ${parcial.id}`,
    descripcion: 'desc',
    categoria: 'PARCIAL',
    estado: 'EN_EJECUCION',
    partidas: [],
    presupuestoPrevisto: 1000,
    costeReal: 0,
    historial: [],
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function gasto(parcial: Partial<Gasto> & { id: string }): Gasto {
  return {
    inmuebleId: INM_1,
    propietarioId: PROP_A,
    tipo: 'EXPLOTACION',
    categoria: 'REPARACION',
    concepto: `gasto ${parcial.id}`,
    importe: 100,
    estado: 'PAGADO',
    aCargoDe: 'arrendador',
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

function profesional(
  parcial: Partial<Profesional> & { id: string }
): Profesional {
  return {
    tipo: 'AUTONOMO',
    nombreComercial: `Prof ${parcial.id}`,
    especialidades: [],
    activo: true,
    zonasServicio: [],
    createdAt: TS,
    updatedAt: TS,
    ...parcial,
  };
}

const ALCANCE_ADMIN: AlcanceOperativa = {
  esAdmin: true,
  inmuebleIdsPermitidos: [],
};
const ALCANCE_PROP_A: AlcanceOperativa = {
  esAdmin: false,
  propietarioId: PROP_A,
  inmuebleIdsPermitidos: [INM_1, INM_2],
};

describe('1. alcance admin: ve todo sin filtrar', () => {
  it('devuelve la colección íntegra', () => {
    const items = [
      incidencia({ id: 'a', propietarioId: PROP_A, inmuebleId: INM_1 }),
      incidencia({ id: 'b', propietarioId: PROP_B, inmuebleId: INM_X }),
    ];
    expect(filtrarPorAlcance(items, ALCANCE_ADMIN)).toHaveLength(2);
  });
});

describe('2. alcance propietario: propietarioId propio o inmueble permitido', () => {
  it('incluye por propietarioId aunque el inmueble no esté en la lista', () => {
    const items = [
      incidencia({ id: 'a', propietarioId: PROP_A, inmuebleId: INM_X }),
    ];
    expect(filtrarPorAlcance(items, ALCANCE_PROP_A).map((i) => i.id)).toEqual([
      'a',
    ]);
  });

  it('incluye por inmueble permitido aunque el propietarioId difiera', () => {
    const items = [
      incidencia({ id: 'b', propietarioId: PROP_B, inmuebleId: INM_2 }),
    ];
    expect(filtrarPorAlcance(items, ALCANCE_PROP_A).map((i) => i.id)).toEqual([
      'b',
    ]);
  });

  it('excluye lo ajeno al propietario y a sus inmuebles', () => {
    const items = [
      incidencia({ id: 'c', propietarioId: PROP_B, inmuebleId: INM_X }),
    ];
    expect(filtrarPorAlcance(items, ALCANCE_PROP_A)).toHaveLength(0);
  });
});

describe('3. alcance vacío: sin propietario ni inmuebles no ve nada', () => {
  it('devuelve vacío para perfil sin alcance', () => {
    const items = [incidencia({ id: 'a' })];
    const alcance: AlcanceOperativa = {
      esAdmin: false,
      inmuebleIdsPermitidos: [],
    };
    expect(filtrarPorAlcance(items, alcance)).toHaveLength(0);
  });
});

describe('4. siniestros visibles vía incidencia o póliza vinculada', () => {
  const incidenciasVisibles = [incidencia({ id: 'inc-1' })];
  const polizasVisibles = [poliza({ id: 'pol-9' })];

  it('visible por incidencia vinculada', () => {
    const items = [
      siniestro({ id: 's1', incidenciaId: 'inc-1', polizaId: 'pol-zz' }),
    ];
    expect(
      filtrarSiniestrosPorAlcance(items, incidenciasVisibles, [])
    ).toHaveLength(1);
  });

  it('visible por póliza vinculada', () => {
    const items = [
      siniestro({ id: 's2', incidenciaId: 'inc-zz', polizaId: 'pol-9' }),
    ];
    expect(
      filtrarSiniestrosPorAlcance(items, [], polizasVisibles)
    ).toHaveLength(1);
  });

  it('oculto si ni incidencia ni póliza son visibles', () => {
    const items = [
      siniestro({ id: 's3', incidenciaId: 'inc-zz', polizaId: 'pol-zz' }),
    ];
    expect(
      filtrarSiniestrosPorAlcance(
        items,
        incidenciasVisibles,
        polizasVisibles
      )
    ).toHaveLength(0);
  });
});

describe('5. incidencias críticas: urgentes abiertas y compromisos vencidos', () => {
  it('incluye URGENTE/ALTA no cerradas y compromisos vencidos', () => {
    const items = [
      incidencia({ id: 'u', prioridad: 'URGENTE', estado: 'ABIERTA' }),
      incidencia({ id: 'a', prioridad: 'ALTA', estado: 'EN_REPARACION' }),
      incidencia({
        id: 'v',
        prioridad: 'MEDIA',
        estado: 'ASIGNADA',
        fechaCompromiso: diaRelativo(-1),
      }),
      incidencia({ id: 'n', prioridad: 'MEDIA', estado: 'ABIERTA' }),
    ];
    const ids = incidenciasCriticas(items, HOY).map((i) => i.id);
    expect(ids).toContain('u');
    expect(ids).toContain('a');
    expect(ids).toContain('v');
    expect(ids).not.toContain('n');
  });

  it('excluye RESUELTA/CERRADA/CANCELADA/RECHAZADA aunque sean urgentes', () => {
    const items = (['RESUELTA', 'CERRADA', 'CANCELADA', 'RECHAZADA'] as const).map(
      (estado, idx) =>
        incidencia({ id: `x${idx}`, prioridad: 'URGENTE', estado })
    );
    expect(incidenciasCriticas(items, HOY)).toHaveLength(0);
  });

  it('ordena URGENTE primero y luego por compromiso', () => {
    const items = [
      incidencia({
        id: 'alta-tarde',
        prioridad: 'ALTA',
        fechaCompromiso: diaRelativo(5),
      }),
      incidencia({ id: 'urg', prioridad: 'URGENTE' }),
      incidencia({
        id: 'alta-pronto',
        prioridad: 'ALTA',
        fechaCompromiso: diaRelativo(1),
      }),
    ];
    expect(incidenciasCriticas(items, HOY).map((i) => i.id)).toEqual([
      'urg',
      'alta-pronto',
      'alta-tarde',
    ]);
  });
});

describe('6. resumen reutiliza métricas de incidenciasEngine', () => {
  it('abiertas/enProceso/urgentes coinciden con calcularMetricasIncidencias', () => {
    const entrada = {
      incidencias: [
        incidencia({ id: 'i1', estado: 'ABIERTA' }),
        incidencia({ id: 'i2', estado: 'EN_VALORACION' }),
        incidencia({ id: 'i3', estado: 'EN_REPARACION' }),
        incidencia({
          id: 'i4',
          estado: 'ASIGNADA',
          prioridad: 'URGENTE',
        }),
        incidencia({ id: 'i5', estado: 'CERRADA' }),
      ],
      tareas: [],
      trabajos: [],
      presupuestos: [],
      polizas: [],
      garantias: [],
      siniestros: [],
      necesidades: [],
      proyectos: [],
      gastos: [],
    };
    const r = resumenOperativo(entrada, HOY);
    // ABIERTA + EN_VALORACION
    expect(r.incidenciasAbiertas).toBe(2);
    // EN_REPARACION + ASIGNADA
    expect(r.incidenciasEnProceso).toBe(2);
    // URGENTE no cerrada
    expect(r.incidenciasUrgentes).toBe(1);
  });
});

describe('7. tareas vencidas y próximas (ventana 30 días)', () => {
  it('vencida = activa con proximaFecha pasada; hoy cuenta como próxima', () => {
    const vencidas = tareasVencidas(
      [
        tarea({ id: 'v', proximaFecha: diaRelativo(-1) }),
        tarea({ id: 'h', proximaFecha: diaRelativo(0) }),
        tarea({ id: 'f', proximaFecha: diaRelativo(10) }),
        tarea({ id: 'i', proximaFecha: diaRelativo(-30), activa: false }),
      ],
      HOY
    ).map((t) => t.id);
    expect(vencidas).toEqual(['v']);
  });

  it('próximas dentro de 30 días ordenadas; inactivas y lejanas fuera', () => {
    const proximas = tareasProximas(
      [
        tarea({ id: 't10', proximaFecha: diaRelativo(10) }),
        tarea({ id: 't2', proximaFecha: diaRelativo(2) }),
        tarea({ id: 't0', proximaFecha: diaRelativo(0) }),
        tarea({ id: 'lejos', proximaFecha: diaRelativo(31) }),
        tarea({ id: 'inac', proximaFecha: diaRelativo(5), activa: false }),
      ],
      HOY
    ).map((t) => t.id);
    expect(proximas).toEqual(['t0', 't2', 't10']);
  });

  it('sin fecha no es vencida ni próxima', () => {
    const sinFecha = [tarea({ id: 's', proximaFecha: '' })];
    expect(tareasVencidas(sinFecha, HOY)).toHaveLength(0);
    expect(tareasProximas(sinFecha, HOY)).toHaveLength(0);
  });
});

describe('8. trabajos abiertos excluyen finalizados y cancelados', () => {
  it('abierto = estado no final/cancel (masculino y femenino)', () => {
    const items = [
      trabajo({ id: 'p', estado: 'PENDIENTE' }),
      trabajo({ id: 'e', estado: 'EN_EJECUCION' }),
      trabajo({ id: 'f1', estado: 'FINALIZADO' }),
      trabajo({ id: 'f2', estado: 'FINALIZADA' }),
      trabajo({ id: 'c1', estado: 'CANCELADO' }),
      trabajo({ id: 'c2', estado: 'CANCELADA' }),
    ];
    expect(trabajosAbiertos(items).map((t) => t.id)).toEqual(['p', 'e']);
  });
});

describe('9. trabajos bloqueados: PENDIENTE_MATERIAL / PENDIENTE_PROPIETARIO', () => {
  it('solo esos dos estados', () => {
    const items = [
      trabajo({ id: 'm', estado: 'PENDIENTE_MATERIAL' }),
      trabajo({ id: 'p', estado: 'PENDIENTE_PROPIETARIO' }),
      trabajo({ id: 'e', estado: 'EN_CURSO' }),
    ];
    expect(trabajosBloqueados(items).map((t) => t.id)).toEqual(['m', 'p']);
  });
});

describe('10. trabajos sin profesional asignado', () => {
  it('abierto sin profesionalId; excluye asignados y cerrados', () => {
    const items = [
      trabajo({ id: 's', estado: 'BUSCANDO_PROFESIONAL' }),
      trabajo({
        id: 'a',
        estado: 'EN_EJECUCION',
        profesionalId: 'prof-1',
      }),
      trabajo({ id: 'c', estado: 'FINALIZADO' }),
    ];
    expect(trabajosSinProfesional(items).map((t) => t.id)).toEqual(['s']);
  });
});

describe('11. presupuestos pendientes de decisión', () => {
  it('RECIBIDO/EN_REVISION/EN_NEGOCIACION; resto fuera', () => {
    const items = [
      presupuesto({ id: 'r', estado: 'RECIBIDO' }),
      presupuesto({ id: 'v', estado: 'EN_REVISION' }),
      presupuesto({ id: 'n', estado: 'EN_NEGOCIACION' }),
      presupuesto({ id: 'b', estado: 'BORRADOR' }),
      presupuesto({ id: 'a', estado: 'ACEPTADO' }),
      presupuesto({ id: 'x', estado: 'RECHAZADO' }),
      presupuesto({ id: 'c', estado: 'CADUCADO' }),
    ];
    expect(presupuestosPendientesDecision(items).map((p) => p.id)).toEqual([
      'r',
      'v',
      'n',
    ]);
  });
});

describe('12. garantías vigentes y próximas a vencer', () => {
  it('vigente = fechaFin futura; vencida y RECLAMADA fuera', () => {
    const items = [
      garantia({ id: 'v', fechaFin: diaRelativo(100) }),
      garantia({ id: 'x', fechaFin: diaRelativo(-1) }),
      garantia({
        id: 'r',
        fechaFin: diaRelativo(100),
        estado: 'RECLAMADA',
      }),
    ];
    expect(garantiasVigentes(items, HOY).map((g) => g.id)).toEqual(['v']);
  });

  it('próximas a vencer dentro de 60 días, ordenadas por fin', () => {
    const items = [
      garantia({ id: 'g50', fechaFin: diaRelativo(50) }),
      garantia({ id: 'g5', fechaFin: diaRelativo(5) }),
      garantia({ id: 'lejos', fechaFin: diaRelativo(61) }),
      garantia({ id: 'venc', fechaFin: diaRelativo(-2) }),
    ];
    expect(garantiasProximasVencer(items, HOY).map((g) => g.id)).toEqual([
      'g5',
      'g50',
    ]);
  });
});

describe('13. pólizas: reutiliza detectarPolizasProximasVencer', () => {
  it('vencida genera alerta y lejana no', () => {
    const alertas = detectarPolizasProximasVencer([
      poliza({ id: 'venc', fechaVencimiento: diaRealRelativo(-10) }),
      poliza({ id: 'lejana', fechaVencimiento: diaRealRelativo(70) }),
    ]);
    expect(alertas.map((a) => a.polizaId)).toEqual(['venc']);
    expect(alertas[0].nivelProximidad).toBe(-1);
  });

  it('RENOVADA queda excluida aunque esté en ventana', () => {
    const alertas = detectarPolizasProximasVencer([
      poliza({
        id: 'ren',
        fechaVencimiento: diaRealRelativo(10),
        estadoRenovacion: 'RENOVADA',
      }),
    ]);
    expect(alertas).toHaveLength(0);
  });
});

describe('14. siniestros abiertos excluyen CERRADO e INDEMNIZADO', () => {
  it('mismo predicado que InformeOperativa', () => {
    const items = [
      siniestro({ id: 'a', estado: 'EN_ESTUDIO' }),
      siniestro({ id: 'b', estado: 'PENDIENTE_COMUNICAR' }),
      siniestro({ id: 'c', estado: 'CERRADO' }),
      siniestro({ id: 'd', estado: 'INDEMNIZADO' }),
    ];
    expect(siniestrosAbiertos(items).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('15. proyectos activos y necesidades abiertas', () => {
  it('proyectos: excluye FINALizado/Cancelado (m/f)', () => {
    const items = [
      proyecto({ id: 'e', estado: 'EN_EJECUCION' }),
      proyecto({ id: 'p', estado: 'PAUSADO' }),
      proyecto({ id: 'f', estado: 'FINALIZADO' }),
      proyecto({ id: 'g', estado: 'FINALIZADA' }),
      proyecto({ id: 'c', estado: 'CANCELADA' }),
    ];
    expect(proyectosActivos(items).map((p) => p.id)).toEqual(['e', 'p']);
  });

  it('necesidades: excluye FINALIZADA/CANCELADA', () => {
    const items = [
      necesidad({ id: 'a', estado: 'APROBADA' }),
      necesidad({ id: 'f', estado: 'FINALIZADA' }),
      necesidad({ id: 'c', estado: 'CANCELADA' }),
    ];
    expect(necesidadesAbiertas(items).map((n) => n.id)).toEqual(['a']);
  });
});

describe('16. resumenOperativo agrega todos los contadores', () => {
  it('cuenta cada bloque y el coste operativo', () => {
    const r = resumenOperativo(
      {
        incidencias: [
          incidencia({
            id: 'i1',
            estado: 'ABIERTA',
            prioridad: 'URGENTE',
            fechaCompromiso: diaRelativo(-3),
          }),
        ],
        tareas: [tarea({ id: 't1', proximaFecha: diaRelativo(-2) })],
        trabajos: [
          trabajo({ id: 'ot1', estado: 'PENDIENTE_MATERIAL' }),
        ],
        presupuestos: [presupuesto({ id: 'p1', estado: 'EN_REVISION' })],
        polizas: [],
        garantias: [garantia({ id: 'g1', fechaFin: diaRelativo(200) })],
        siniestros: [siniestro({ id: 's1', estado: 'ACEPTADO' })],
        necesidades: [necesidad({ id: 'n1', estado: 'EN_ESTUDIO' })],
        proyectos: [proyecto({ id: 'r1', estado: 'ADJUDICADO' })],
        gastos: [
          gasto({
            id: 'x1',
            importe: 200,
            estado: 'PAGADO',
            deducible: true,
            origen: 'ORDEN_TRABAJO',
            trabajoId: 'ot1',
          }),
        ],
      },
      HOY
    );
    expect(r.incidenciasAbiertas).toBe(1);
    expect(r.incidenciasUrgentes).toBe(1);
    expect(r.incidenciasCompromisoVencido).toBe(1);
    expect(r.tareasVencidas).toBe(1);
    expect(r.trabajosAbiertos).toBe(1);
    expect(r.trabajosBloqueados).toBe(1);
    expect(r.trabajosSinProfesional).toBe(1);
    expect(r.presupuestosPendientes).toBe(1);
    expect(r.garantiasVigentes).toBe(1);
    expect(r.siniestrosAbiertos).toBe(1);
    expect(r.proyectosActivos).toBe(1);
    expect(r.necesidadesAbiertas).toBe(1);
    expect(r.costeOperativoTotal).toBe(200);
    expect(r.costeOperativoPagado).toBe(200);
    expect(r.costeOperativoCount).toBe(1);
    // Compromiso vencido + tarea vencida en agenda
    expect(r.eventosAgenda).toBe(2);
  });
});

describe('17. agenda unificada ordenada por fecha', () => {
  it('mezcla tipos y pone vencidos primero', () => {
    const eventos = agendaOperativa(
      {
        incidencias: [
          incidencia({
            id: 'inc-1',
            estado: 'ABIERTA',
            fechaCompromiso: diaRelativo(5),
          }),
        ],
        tareas: [tarea({ id: 'tar-1', proximaFecha: diaRelativo(-1) })],
        polizas: [],
        garantias: [
          garantia({ id: 'gar-1', fechaFin: diaRelativo(10) }),
        ],
        proyectos: [
          proyecto({
            id: 'pro-1',
            estado: 'EN_EJECUCION',
            fechaPrevistaFin: diaRelativo(20),
          }),
        ],
      },
      HOY
    );
    expect(eventos.map((e) => e.tipo)).toEqual([
      'TAREA_VENCIDA',
      'COMPROMISO_INCIDENCIA',
      'FIN_GARANTIA',
      'HITO_PROYECTO',
    ]);
    expect(eventos[0].vencido).toBe(true);
    expect(eventos[1].vencido).toBe(false);
    expect(eventos[0].entidad).toBe('tarea');
    expect(eventos[1].entidadId).toBe('inc-1');
  });
});

describe('18. agenda excluye fuera de ventana, inactivas y cerradas', () => {
  it('filtra futuro >30d, tarea inactiva e incidencia cerrada', () => {
    const eventos = agendaOperativa(
      {
        incidencias: [
          incidencia({
            id: 'lejos',
            estado: 'ABIERTA',
            fechaCompromiso: diaRelativo(31),
          }),
          incidencia({
            id: 'cerr',
            estado: 'CERRADA',
            fechaCompromiso: diaRelativo(1),
          }),
          incidencia({
            id: 'ok',
            estado: 'ABIERTA',
            fechaCompromiso: diaRelativo(1),
          }),
        ],
        tareas: [
          tarea({
            id: 'inac',
            proximaFecha: diaRelativo(1),
            activa: false,
          }),
        ],
        polizas: [],
        garantias: [],
        proyectos: [],
      },
      HOY
    );
    expect(eventos.map((e) => e.entidadId)).toEqual(['ok']);
  });

  it('diasEntreDias calcula días naturales entre días calendario', () => {
    expect(diasEntreDias('2026-09-22', '2026-09-22')).toBe(0);
    expect(diasEntreDias('2026-09-22', '2026-09-25')).toBe(3);
    expect(diasEntreDias('2026-09-25', '2026-09-22')).toBe(-3);
    expect(diasEntreDias('no-fecha', '2026-09-22')).toBeNaN();
  });
});

describe('19. coste operativo: orígenes y trazabilidad', () => {
  it('incluye REPARACION/OT/INCIDENCIA/SEGURO o ids vinculados', () => {
    const c = costeOperativo([
      gasto({ id: 'o1', importe: 100, origen: 'REPARACION' }),
      gasto({ id: 'o2', importe: 50, origen: 'MANUAL', trabajoId: 'ot-1' }),
      gasto({
        id: 'o3',
        importe: 25,
        origen: 'MANUAL',
        incidenciaId: 'inc-1',
      }),
      gasto({ id: 'm', importe: 1000, origen: 'MANUAL' }),
      gasto({ id: 'r', importe: 500, origen: 'RECURRENTE' }),
    ]);
    expect(c.count).toBe(3);
    expect(c.totalPagado).toBe(175);
  });

  it('totales vía calcularTotalesGastos: deducible, pagado y por categoría', () => {
    const c = costeOperativo([
      gasto({
        id: 'a',
        importe: 100,
        estado: 'PAGADO',
        deducible: true,
        categoria: 'REPARACION',
        origen: 'INCIDENCIA',
      }),
      gasto({
        id: 'b',
        importe: 40,
        estado: 'PENDIENTE',
        deducible: false,
        categoria: 'SEGUROS',
        origen: 'SEGURO',
      }),
    ]);
    expect(c.totalDeducible).toBe(100);
    expect(c.totalPagado).toBe(100);
    expect(c.porCategoria).toEqual({ REPARACION: 100, SEGUROS: 40 });
  });
});

describe('20. carga de profesionales por OOTT abiertas', () => {
  it('cuenta activos por profesional, orden desc, sin carga fuera', () => {
    const profesionales = [
      profesional({ id: 'prof-1', nombreComercial: 'B Uno' }),
      profesional({ id: 'prof-2', nombreComercial: 'A Dos' }),
      profesional({ id: 'prof-3', nombreComercial: 'C Tres' }),
    ];
    const carga = cargaProfesionales(profesionales, [
      trabajo({ id: 'a', profesionalId: 'prof-1', estado: 'EN_EJECUCION' }),
      trabajo({ id: 'b', profesionalId: 'prof-1', estado: 'PENDIENTE' }),
      trabajo({
        id: 'c',
        profesionalId: 'prof-2',
        estado: 'PENDIENTE_MATERIAL',
      }),
      trabajo({
        id: 'fin',
        profesionalId: 'prof-2',
        estado: 'FINALIZADO',
      }),
      trabajo({ id: 'sin', estado: 'PENDIENTE' }),
    ]);
    expect(carga.map((x) => x.profesional.id)).toEqual(['prof-1', 'prof-2']);
    expect(carga[0].trabajosActivos).toBe(2);
    expect(carga[0].trabajosBloqueados).toBe(0);
    expect(carga[1].trabajosActivos).toBe(1);
    expect(carga[1].trabajosBloqueados).toBe(1);
  });
});
