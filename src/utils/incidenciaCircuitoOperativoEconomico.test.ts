import { describe, it, expect } from 'vitest';
import {
  Incidencia,
  TrabajoProfesional,
  Gasto,
  Inmueble,
  UsuarioApp,
} from '../types';
import {
  generarGastoDesdeTrabajo,
  sincronizarGastoDesdeTrabajo,
  calcularTotalesGastos,
  filtrarGastosPorInmueble,
} from './gastosEngine';
import { generarResumenFiscalAnual } from './fiscalEngine';

describe('circuito operativo y económico: Incidencia → Dictamen → OT → Profesional → Coste Real → Gasto → Histórico', () => {
  const inmueble: Inmueble = {
    id: 'inm-100',
    direccion: 'Avenida de la Constitución 15, 4º B',
    ciudad: 'Alicante',
    precio: 950,
    estado: 'alquilado',
    habitaciones: 3,
    banos: 2,
    superficie: 90,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop-100',
    propietarioPrincipalId: 'prop-100',
    valorAdquisicion: 180000,
  };

  const adminUser: UsuarioApp = {
    id: 'u-admin',
    nombre: 'Gestor Principal',
    email: 'admin@gestor.es',
    tipoPerfil: 'ADMINISTRADOR',
    estado: 'ACTIVO',
    roles: ['SUPERADMIN'],
    permisos: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  it('1. Incidencia con responsabilidad y resolución definida', () => {
    const incidencia: Incidencia = {
      id: 'inc-001',
      propietarioId: 'prop-100',
      inmuebleId: inmueble.id,
      titulo: 'Rotura de tubería bajo fregadero de cocina',
      descripcion: 'Fuga persistente que daña el mueble bajo encimera.',
      categoria: 'FONTANERIA',
      prioridad: 'URGENTE',
      estado: 'EN_REPARACION',
      origen: 'INQUILINO',
      fechaCreacion: '2026-02-10T09:00:00Z',
      fechaActualizacion: '2026-02-10T10:30:00Z',
      responsabilidad: 'PROPIETARIO',
      origenReporte: 'INQUILINO',
      responsabilidadNotas: 'Sustitución de tramo de tubería y latiguillo por fatiga de material',
    };

    expect(incidencia.responsabilidad).toBe('PROPIETARIO');
    expect(incidencia.prioridad).toBe('URGENTE');
    expect(incidencia.inmuebleId).toBe(inmueble.id);
  });

  it('2. Creación de Orden de Trabajo (OT) vinculada a la Incidencia y Profesional', () => {
    const trabajo: TrabajoProfesional = {
      id: 'ot-001',
      propietarioId: 'prop-100',
      inmuebleId: inmueble.id,
      incidenciaId: 'inc-001',
      profesionalId: 'prof-font-1',
      profesionalNombre: 'Fontanería Rápida S.L.',
      titulo: 'Reparación tubería fregadero',
      descripcion: 'Sustituir tramo fisurado bajo fregadero.',
      categoria: 'FONTANERIA',
      prioridad: 'URGENTE',
      estado: 'EN_CURSO',
      fechaSolicitud: '2026-02-10T11:00:00Z',
      fechaAsignacion: '2026-02-10T11:00:00Z',
      importeEstimado: 180,
      creadoPor: adminUser.nombre,
      actualizadoPor: adminUser.nombre,
      historial: [],
      createdAt: '2026-02-10T11:00:00Z',
      updatedAt: '2026-02-10T11:00:00Z',
    };

    expect(trabajo.incidenciaId).toBe('inc-001');
    expect(trabajo.profesionalId).toBe('prof-font-1');
    expect(trabajo.importeEstimado).toBe(180);
  });

  it('3. Ejecución y finalización de la OT con Coste Real por el Profesional', () => {
    const trabajoFinalizado: TrabajoProfesional = {
      id: 'ot-001',
      propietarioId: 'prop-100',
      inmuebleId: inmueble.id,
      incidenciaId: 'inc-001',
      profesionalId: 'prof-font-1',
      profesionalNombre: 'Fontanería Rápida S.L.',
      titulo: 'Reparación tubería fregadero',
      descripcion: 'Sustituir tramo fisurado bajo fregadero.',
      categoria: 'FONTANERIA',
      prioridad: 'URGENTE',
      estado: 'FINALIZADO',
      fechaSolicitud: '2026-02-10T11:00:00Z',
      fechaAsignacion: '2026-02-10T11:00:00Z',
      fechaFinalizacion: '2026-02-11T16:00:00Z',
      importeEstimado: 180,
      importeFinal: 195.5, // Coste real ejecutado
      observaciones: 'Trabajo finalizado con éxito. Tubería sustituida y verificada estanqueidad.',
      creadoPor: adminUser.nombre,
      actualizadoPor: 'Fontanería Rápida S.L.',
      historial: [],
      createdAt: '2026-02-10T11:00:00Z',
      updatedAt: '2026-02-11T16:00:00Z',
    };

    expect(trabajoFinalizado.estado).toBe('FINALIZADO');
    expect(trabajoFinalizado.importeFinal).toBe(195.5);
    expect(trabajoFinalizado.fechaFinalizacion).toBeDefined();
  });

  it('4. Generación automática y unívoca del Gasto contable desde la OT finalizada', () => {
    const trabajoFinalizado: TrabajoProfesional = {
      id: 'ot-001',
      propietarioId: 'prop-100',
      inmuebleId: inmueble.id,
      incidenciaId: 'inc-001',
      profesionalId: 'prof-font-1',
      profesionalNombre: 'Fontanería Rápida S.L.',
      titulo: 'Reparación tubería fregadero',
      descripcion: 'Sustituir tramo fisurado bajo fregadero.',
      categoria: 'FONTANERIA',
      prioridad: 'URGENTE',
      estado: 'FINALIZADO',
      fechaSolicitud: '2026-02-10T11:00:00Z',
      fechaAsignacion: '2026-02-10T11:00:00Z',
      fechaFinalizacion: '2026-02-11T16:00:00Z',
      importeEstimado: 180,
      importeFinal: 195.5,
      creadoPor: adminUser.nombre,
      actualizadoPor: 'Fontanería Rápida S.L.',
      historial: [],
      createdAt: '2026-02-10T11:00:00Z',
      updatedAt: '2026-02-11T16:00:00Z',
    };

    const { gasto, yaExiste } = generarGastoDesdeTrabajo({
      trabajo: trabajoFinalizado,
      inmuebles: [inmueble],
      gastosExistentes: [],
      usuarioNombre: adminUser.nombre,
      usuarioId: adminUser.id,
    });

    expect(yaExiste).toBe(false);
    expect(gasto).toBeDefined();
    expect(gasto?.importe).toBe(195.5);
    expect(gasto?.inmuebleId).toBe(inmueble.id);
    expect(gasto?.propietarioId).toBe('prop-100');
    expect(gasto?.trabajoId).toBe('ot-001');
    expect(gasto?.ordenTrabajoId).toBe('ot-001');
    expect(gasto?.incidenciaId).toBe('inc-001');
    expect(gasto?.profesionalId).toBe('prof-font-1');
    expect(gasto?.origen).toBe('ORDEN_TRABAJO');
    expect(gasto?.categoria).toBe('REPARACION');
    expect(gasto?.deducible).toBe(true);
  });

  it('5. Idempotencia y prevención de gastos duplicados ante múltiples llamadas o reintentos', () => {
    const trabajoFinalizado: TrabajoProfesional = {
      id: 'ot-001',
      propietarioId: 'prop-100',
      inmuebleId: inmueble.id,
      incidenciaId: 'inc-001',
      profesionalId: 'prof-font-1',
      profesionalNombre: 'Fontanería Rápida S.L.',
      titulo: 'Reparación tubería fregadero',
      descripcion: 'Reparación tubería fregadero',
      categoria: 'FONTANERIA',
      prioridad: 'URGENTE',
      estado: 'FINALIZADO',
      fechaSolicitud: '2026-02-10T11:00:00Z',
      fechaFinalizacion: '2026-02-11T16:00:00Z',
      importeFinal: 195.5,
      creadoPor: adminUser.nombre,
      actualizadoPor: adminUser.nombre,
      historial: [],
      createdAt: '2026-02-10T11:00:00Z',
      updatedAt: '2026-02-11T16:00:00Z',
    };

    const firstResult = generarGastoDesdeTrabajo({
      trabajo: trabajoFinalizado,
      inmuebles: [inmueble],
      gastosExistentes: [],
      usuarioNombre: adminUser.nombre,
      usuarioId: adminUser.id,
    });
    const gastoCreado = firstResult.gasto!;

    // Segunda invocación con el gasto ya en la colección
    const secondResult = generarGastoDesdeTrabajo({
      trabajo: trabajoFinalizado,
      inmuebles: [inmueble],
      gastosExistentes: [gastoCreado],
      usuarioNombre: adminUser.nombre,
      usuarioId: adminUser.id,
    });

    expect(secondResult.yaExiste).toBe(true);
    expect(secondResult.gasto?.id).toBe(gastoCreado.id);
  });

  it('6. Sincronización de coste real rectificado sin crear nuevo gasto', () => {
    const trabajoFinalizado: TrabajoProfesional = {
      id: 'ot-001',
      propietarioId: 'prop-100',
      inmuebleId: inmueble.id,
      incidenciaId: 'inc-001',
      profesionalId: 'prof-font-1',
      profesionalNombre: 'Fontanería Rápida S.L.',
      titulo: 'Reparación tubería fregadero',
      descripcion: 'Reparación tubería fregadero',
      categoria: 'FONTANERIA',
      prioridad: 'URGENTE',
      estado: 'FINALIZADO',
      fechaSolicitud: '2026-02-10T11:00:00Z',
      fechaFinalizacion: '2026-02-11T16:00:00Z',
      importeFinal: 195.5,
      creadoPor: adminUser.nombre,
      actualizadoPor: adminUser.nombre,
      historial: [],
      createdAt: '2026-02-10T11:00:00Z',
      updatedAt: '2026-02-11T16:00:00Z',
    };

    const firstResult = generarGastoDesdeTrabajo({
      trabajo: trabajoFinalizado,
      inmuebles: [inmueble],
      gastosExistentes: [],
    });
    const gastoOriginal = firstResult.gasto!;

    // Rectificación de importe final por pieza adicional (220 € en vez de 195.5 €)
    const trabajoRectificado = {
      ...trabajoFinalizado,
      importeFinal: 220,
      updatedAt: '2026-02-12T10:00:00Z',
    };

    const gastoActualizado = sincronizarGastoDesdeTrabajo({
      trabajo: trabajoRectificado,
      gastoExistente: gastoOriginal,
    });

    expect(gastoActualizado.id).toBe(gastoOriginal.id);
    expect(gastoActualizado.importe).toBe(220);
    expect(gastoActualizado.incidenciaId).toBe('inc-001');
    expect(gastoActualizado.trabajoId).toBe('ot-001');
  });

  it('7. El Gasto de la OT se incorpora de forma íntegra a la fiscalidad y rentabilidad del Inmueble', () => {
    const gastoOT: Gasto = {
      id: 'gasto-ot-001',
      inmuebleId: inmueble.id,
      propietarioId: 'prop-100',
      tipo: 'EXPLOTACION',
      categoria: 'REPARACION',
      concepto: 'Reparación tubería fregadero - Fontanería Rápida S.L.',
      importe: 220,
      estado: 'PAGADO',
      fechaDevengo: '2026-02-11',
      periodoMesAnio: '2026-02',
      aCargoDe: 'arrendador',
      deducible: true,
      origen: 'ORDEN_TRABAJO',
      trabajoId: 'ot-001',
      incidenciaId: 'inc-001',
      profesionalId: 'prof-font-1',
      createdAt: '2026-02-11T16:00:00Z',
      updatedAt: '2026-02-11T16:00:00Z',
    };

    const gastosDelInmueble = filtrarGastosPorInmueble([gastoOT], inmueble.id);
    expect(gastosDelInmueble).toHaveLength(1);

    const totales = calcularTotalesGastos(gastosDelInmueble);
    expect(totales.totalDeducible).toBe(220);
    expect(totales.totalPagado).toBe(220);
    expect(totales.porCategoria.REPARACION).toBe(220);

    const resumenFiscal = generarResumenFiscalAnual(
      inmueble.id,
      2026,
      [inmueble],
      [],
      [gastoOT],
      adminUser
    );

    expect(resumenFiscal).not.toBeNull();
    expect(resumenFiscal?.gastos.totalDeducible).toBe(220);
    expect(resumenFiscal?.inmuebleId).toBe(inmueble.id);
    expect(resumenFiscal?.propietarioId).toBe('prop-100');
  });
});
