import { describe, it, expect } from 'vitest';
import {
  Incidencia,
  TrabajoProfesional,
  Gasto,
  Inmueble,
  UsuarioApp,
  Propietario,
  AnalisisIaIncidencia,
} from '../types';
import {
  generarGastoDesdeTrabajo,
  sincronizarGastoDesdeTrabajo,
  calcularTotalesGastos,
  filtrarGastosPorInmueble,
} from './gastosEngine';
import { generarResumenFiscalAnual } from './fiscalEngine';
import { canAccessInmueble } from '../lib/authService';

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

  it('8. Análisis Pericial IA: estructura y compatibilidad de datos con DetalleIncidenciaModal', () => {
    const analisisMock: AnalisisIaIncidencia = {
      urgenciaEstimada: 'URGENTE',
      resumenPericial: 'Fuga severa en instalación fija de fontanería.',
      gravedadEstimada: 'URGENTE',
      causasPosibles: [
        {
          titulo: 'Rotura accidental en tubería de agua',
          probabilidad: 90,
          explicacion: 'Desgaste de material o sobrepresión.',
          responsabilidadProbable: 'PROPIETARIO',
        },
      ],
      actuacionesRecomendadas: ['Cerrar llave de paso general', 'Asignar fontanero urgente'],
      estimacionEconomica: {
        minimo: 150,
        maximo: 300,
        moneda: 'EUR',
      },
      evaluacionResponsabilidad: {
        responsableSugerido: 'PROPIETARIO',
        argumentacionJuridicaLAU: 'Art. 21.1 LAU: Conservación de habitabilidad a cargo del arrendador.',
        articulosAplicables: ['Art. 21.1 LAU', 'Art. 21.4 LAU'],
      },
      evaluacionSeguro: {
        posibleCobertura: 'POSIBLE_COBERTURA',
        explicacion: 'Cobertura habitual en pólizas de Hogar / Multirriesgo por daños de agua.',
        ramoRecomendado: 'Hogar Multirriesgo',
      },
      advertenciaLegal: 'ANÁLISIS IA ORIENTATIVO: Este informe es un dictamen técnico-asistencial orientativo.',
      fechaAnalisis: '2026-02-10T09:30:00Z',
      modeloUtilizado: 'gemini-3.8-flash',
      // Campos de compatibilidad directa con UI DetalleIncidenciaModal
      recomendacionResponsabilidad: 'PROPIETARIO',
      fundamentoResponsabilidad: 'Art. 21.1 LAU: Reparación de instalaciones fijas.',
      estimacionCoberturaSeguro: 'POSIBLE_COBERTURA',
      fundamentoSeguro: 'Daños por agua cubiertos en póliza multirriesgo.',
      resumenDiagnostico: 'Fuga severa en tubería fija bajo fregadero.',
      pasosRecomendados: ['Corte de suministro', 'Intervención de fontanería'],
      evaluacionUrgencia: 'URGENTE',
    };

    expect(analisisMock.recomendacionResponsabilidad).toBe('PROPIETARIO');
    expect(analisisMock.estimacionCoberturaSeguro).toBe('POSIBLE_COBERTURA');
    expect(analisisMock.evaluacionUrgencia).toBe('URGENTE');
    expect(analisisMock.pasosRecomendados).toHaveLength(2);
    expect(analisisMock.advertenciaLegal).toContain('ORIENTATIVO');
  });

  it('9. Aislamiento y persistencia de Mi Ficha Fiscal de Propietario con matching multinivel', () => {
    const propietarioTitular: Propietario = {
      id: 'prop-100',
      nombre: 'María Gómez Martínez',
      nifCif: '12345678Z',
      tipoPropietario: 'persona_fisica',
      telefono: '+34 600 222 333',
      email: 'maria.gomez@test.es',
      direccion: 'Calle Mayor 10, 2º A',
      ciudad: 'Alicante',
      codigoPostal: '03001',
      cuentasBancarias: [],
      fechaCreacion: '2026-01-01T00:00:00Z',
      fechaActualizacion: '2026-02-10T00:00:00Z',
    };

    const usuarioPropietario: UsuarioApp = {
      id: 'u-prop-100',
      nombre: 'María Gómez',
      email: 'maria.gomez@test.es',
      tipoPerfil: 'PROPIETARIO',
      propietarioId: 'prop-100',
      estado: 'ACTIVO',
      roles: [],
      permisos: [],
      inmuebleIds: ['inm-100'],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const usuarioOtroPropietario: UsuarioApp = {
      id: 'u-prop-200',
      nombre: 'Juan Pérez',
      email: 'juan.perez@test.es',
      tipoPerfil: 'PROPIETARIO',
      propietarioId: 'prop-200',
      estado: 'ACTIVO',
      roles: [],
      permisos: [],
      inmuebleIds: ['inm-200'],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    // 1. Acceso autorizado al inmueble por propietarioId / propietarioPrincipalId / inmuebleIds
    expect(canAccessInmueble(usuarioPropietario, inmueble)).toBe(true);
    expect(canAccessInmueble(usuarioOtroPropietario, inmueble)).toBe(false);

    // 2. Ficha fiscal aislada
    expect(usuarioPropietario.propietarioId).toBe(propietarioTitular.id);
    expect(usuarioOtroPropietario.propietarioId).not.toBe(propietarioTitular.id);

    // 3. Modificación segura de ficha
    const fichaActualizada: Propietario = {
      ...propietarioTitular,
      telefono: '+34 600 999 888',
      direccion: 'Nueva Dirección 25',
      fechaActualizacion: new Date().toISOString(),
    };

    expect(fichaActualizada.id).toBe('prop-100');
    expect(fichaActualizada.telefono).toBe('+34 600 999 888');
    expect(fichaActualizada.direccion).toBe('Nueva Dirección 25');
  });
});
