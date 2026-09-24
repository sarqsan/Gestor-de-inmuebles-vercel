import { describe, it, expect } from 'vitest';
import {
  aplicarBajaLogica,
  asegurarInventarioDelInmueble,
  canAccessHistorialInventario,
  canAccessInventarioInmueble,
  canMutateInventario,
  calcularCompletitudFichaTecnica,
  crearElementoInventario,
  filtrarInventarioPorCategoria,
  modificarElementoInventario,
  obtenerResumenInventario,
  validarInmutabilidadInmuebleId,
} from './inventarioEngine';
import { ElementoInventario, Inmueble, UsuarioApp, Profesional } from '../types';

describe('Auditoría Integral de Inventario, Ficha Técnica y Aislamiento Multitenant', () => {
  const inmA: Inmueble = {
    id: 'inm-A',
    direccion: 'Calle Mayor 10, Alicante',
    ciudad: 'Alicante',
    provincia: 'Alicante',
    precio: 850,
    estado: 'disponible',
    habitaciones: 3,
    banos: 2,
    superficie: 85,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop-A',
    planta: '2º B',
    ascensor: true,
    aireAcondicionado: true,
    calefaccion: true,
    cocinaEquipada: true,
    electrodomesticosIncluidos: true,
    armariosEmpotrados: true,
    tipoInmueble: 'piso',
    estadoConservacion: 'bueno',
    anioConstruccion: 2010,
    orientacion: 'Sureste',
    tipoVentanas: 'Climalit',
    tipoPersianas: 'Aluminio térmico',
    interiorExterior: 'exterior',
  };

  const inmB: Inmueble = {
    ...inmA,
    id: 'inm-B',
    propietarioId: 'prop-B',
    direccion: 'Avenida Maisonnave 25, Alicante',
  };

  const adminUser: UsuarioApp = {
    id: 'u-admin',
    nombre: 'Administrador Global',
    email: 'sarqsan2@gmail.com',
    tipoPerfil: 'ADMINISTRADOR',
    estado: 'ACTIVO',
    roles: ['SUPERADMIN'],
    permisos: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const propA: UsuarioApp = {
    id: 'u-prop-a',
    nombre: 'Propietario Titular A',
    email: 'propietarioA@test.es',
    tipoPerfil: 'PROPIETARIO',
    propietarioId: 'prop-A',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    inmuebleIds: ['inm-A'],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const propB: UsuarioApp = {
    id: 'u-prop-b',
    nombre: 'Propietario Titular B',
    email: 'propietarioB@test.es',
    tipoPerfil: 'PROPIETARIO',
    propietarioId: 'prop-B',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    inmuebleIds: ['inm-B'],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const usuarioAjeno: UsuarioApp = {
    id: 'u-ajeno',
    nombre: 'Usuario Sin Inmuebles',
    email: 'externo@test.es',
    tipoPerfil: 'PROPIETARIO',
    propietarioId: 'prop-C',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    inmuebleIds: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const profesionalUser: UsuarioApp = {
    id: 'u-prof-1',
    nombre: 'Fontanería Rápida',
    email: 'fontaneria@test.es',
    tipoPerfil: 'PROFESIONAL',
    profesionalId: 'prof-100',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const profesionalAsignado: Profesional = {
    id: 'prof-100',
    nombre: 'Fontanería Rápida SL',
    nombreComercial: 'Fontanería Rápida SL',
    tipo: 'EMPRESA',
    especialidades: ['Fontanería'],
    activo: true,
    zonasServicio: [],
    email: 'fontaneria@test.es',
    telefono: '600111222',
    estado: 'ACTIVO',
    inmuebleIdsAsignados: ['inm-A'],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const profesionalNoAsignado: Profesional = {
    ...profesionalAsignado,
    id: 'prof-200',
    inmuebleIdsAsignados: ['inm-X'],
  };

  /* =========================================================================
     1. PRUEBAS FUNCIONALES DEL CIRCUITO DE INVENTARIO Y FICHA TÉCNICA
     ========================================================================= */

  it('1. Crear elemento de inventario con timestamps, estado y trazabilidad inicial', () => {
    const item = crearElementoInventario(
      inmA.id,
      {
        nombre: 'Lavavajillas Balay 3VF5010',
        categoria: 'ELECTRODOMESTICOS',
        descripcion: 'Lavavajillas integrable A+++',
        cantidad: 1,
        estado: 'NUEVO',
        ubicacion: 'Cocina',
        observaciones: 'Garantía oficial hasta 2028',
      },
      'Propietario A',
      propA.id
    );

    expect(item.id).toBeDefined();
    expect(item.inmuebleId).toBe('inm-A');
    expect(item.nombre).toBe('Lavavajillas Balay 3VF5010');
    expect(item.categoria).toBe('ELECTRODOMESTICOS');
    expect(item.cantidad).toBe(1);
    expect(item.estado).toBe('NUEVO');
    expect(item.activo).toBe(true);
    expect(item.historial).toHaveLength(1);
    expect(item.historial![0].accion).toBe('CREACION');
    expect(item.historial![0].usuarioNombre).toBe('Propietario A');
  });

  it('2. Consultar y filtrar inventario por inmuebleId, categoría y resumen', () => {
    const item1 = crearElementoInventario(
      inmA.id,
      { nombre: 'Nevera Bosch', categoria: 'ELECTRODOMESTICOS', cantidad: 1, estado: 'BUEN_ESTADO' },
      'Propietario A'
    );
    const item2 = crearElementoInventario(
      inmA.id,
      { nombre: 'Mesa de Comedor', categoria: 'MOBILIARIO', cantidad: 1, estado: 'BUEN_ESTADO' },
      'Propietario A'
    );
    const itemAjeno = crearElementoInventario(
      inmB.id,
      { nombre: 'Sofá Chaise Longue', categoria: 'SALON', cantidad: 1, estado: 'NUEVO' },
      'Propietario B'
    );

    const todos = [item1, item2, itemAjeno];

    // Consulta aislada por inmueble
    const inventarioInmA = asegurarInventarioDelInmueble(todos, inmA.id);
    expect(inventarioInmA).toHaveLength(2);
    expect(inventarioInmA.every((i) => i.inmuebleId === inmA.id)).toBe(true);

    // Filtrado por categoría
    const electrodomesticos = filtrarInventarioPorCategoria(inventarioInmA, 'ELECTRODOMESTICOS');
    expect(electrodomesticos).toHaveLength(1);
    expect(electrodomesticos[0].nombre).toBe('Nevera Bosch');

    // Resumen de inventario
    const resumen = obtenerResumenInventario(inventarioInmA);
    expect(resumen.totalElementos).toBe(2);
    expect(resumen.activos).toBe(2);
    expect(resumen.porCategoria.ELECTRODOMESTICOS).toBe(1);
    expect(resumen.porCategoria.MOBILIARIO).toBe(1);
  });

  it('3. Modificar inventario registrando histórico de cambios sin perder datos de origen', () => {
    const itemOriginal = crearElementoInventario(
      inmA.id,
      { nombre: 'Caldera de Gas', categoria: 'CLIMATIZACION', estado: 'BUEN_ESTADO', cantidad: 1 },
      'Propietario A'
    );

    const itemModificado = modificarElementoInventario(
      itemOriginal,
      { estado: 'REPARAR', observaciones: 'Requiere revisión anual de quemadores' },
      'Propietario A',
      propA.id
    );

    expect(itemModificado.id).toBe(itemOriginal.id);
    expect(itemModificado.inmuebleId).toBe(inmA.id);
    expect(itemModificado.estado).toBe('REPARAR');
    expect(itemModificado.observaciones).toBe('Requiere revisión anual de quemadores');
    expect(itemModificado.historial).toHaveLength(2);
    expect(itemModificado.historial![0].accion).toBe('CAMBIO_ESTADO');
    expect(itemModificado.historial![0].estadoAnterior).toBe('BUEN_ESTADO');
    expect(itemModificado.historial![0].estadoNuevo).toBe('REPARAR');
  });

  it('4. Aplicar baja lógica a un elemento de inventario preservando el historial inmutable', () => {
    const itemOriginal = crearElementoInventario(
      inmA.id,
      { nombre: 'Tostadora', categoria: 'ELECTRODOMESTICOS', estado: 'USADO' },
      'Propietario A'
    );

    const itemBaja = aplicarBajaLogica(itemOriginal, 'Administrador', adminUser.id);

    expect(itemBaja.estado).toBe('BAJA');
    expect(itemBaja.activo).toBe(false);
    expect(itemBaja.historial![0].accion).toBe('BAJA_LOGICA');
    expect(itemBaja.historial![0].estadoNuevo).toBe('BAJA');
  });

  it('5. Ficha técnica: cálculo de completitud porcentual de atributos constructivos', () => {
    const completitud = calcularCompletitudFichaTecnica(inmA);
    expect(completitud.totalCampos).toBe(9);
    expect(completitud.camposCompletados).toBe(9);
    expect(completitud.porcentaje).toBe(100);
    expect(completitud.faltantes).toHaveLength(0);

    const inmuebleIncompleto: Inmueble = {
      ...inmA,
      provincia: undefined,
      planta: undefined,
      orientacion: undefined,
    };
    const completitudIncompleto = calcularCompletitudFichaTecnica(inmuebleIncompleto);
    expect(completitudIncompleto.porcentaje).toBeLessThan(100);
    expect(completitudIncompleto.faltantes).toContain('Provincia');
    expect(completitudIncompleto.faltantes).toContain('Planta');
    expect(completitudIncompleto.faltantes).toContain('Orientación');
  });

  /* =========================================================================
     2. PRUEBAS DE SEGURIDAD Y AISLAMIENTO MULTI-PROPIETARIO Y RBAC
     ========================================================================= */

  it('6. Aislamiento Propietario A vs Inmueble A (PERMITIDO) y Propietario A vs Inmueble B (DENEGADO)', () => {
    // Propietario A tiene permiso sobre Inmueble A
    expect(canAccessInventarioInmueble(propA, inmA)).toBe(true);
    expect(canMutateInventario(propA, inmA)).toBe(true);

    // Propietario A NO puede acceder ni mutar el Inmueble B (de Propietario B)
    expect(canAccessInventarioInmueble(propA, inmB)).toBe(false);
    expect(canMutateInventario(propA, inmB)).toBe(false);

    // Propietario B NO puede acceder ni mutar el Inmueble A (de Propietario A)
    expect(canAccessInventarioInmueble(propB, inmA)).toBe(false);
    expect(canMutateInventario(propB, inmA)).toBe(false);
  });

  it('7. Usuario autenticado sin autorización sobre el inmueble: DENEGADO', () => {
    expect(canAccessInventarioInmueble(usuarioAjeno, inmA)).toBe(false);
    expect(canMutateInventario(usuarioAjeno, inmA)).toBe(false);
    expect(canAccessInventarioInmueble(usuarioAjeno, inmB)).toBe(false);
    expect(canMutateInventario(usuarioAjeno, inmB)).toBe(false);
  });

  it('8. Usuario no autenticado (null / undefined): DENEGADO', () => {
    expect(canAccessInventarioInmueble(null, inmA)).toBe(false);
    expect(canMutateInventario(null, inmA)).toBe(false);
    expect(canAccessInventarioInmueble(undefined, inmA)).toBe(false);
    expect(canMutateInventario(undefined, inmA)).toBe(false);
  });

  it('9. Intento de modificar o falsear propertyId / inmuebleId: DENEGADO Y EXCEPCIÓN', () => {
    const itemOriginal = crearElementoInventario(
      'inm-A',
      { nombre: 'Aire Acondicionado Mitsubishi', categoria: 'CLIMATIZACION' },
      'Propietario A'
    );

    // Verificación de inmutabilidad
    const intentoTransferencia: ElementoInventario = {
      ...itemOriginal,
      inmuebleId: 'inm-B', // Intento de transferir a otro inmueble
    };

    expect(validarInmutabilidadInmuebleId(itemOriginal, intentoTransferencia)).toBe(false);

    // La función modificarElementoInventario debe arrojar una violación de seguridad
    expect(() => {
      modificarElementoInventario(
        itemOriginal,
        { inmuebleId: 'inm-B' as any, nombre: 'Ataque de suplantación' },
        'Atacante'
      );
    }).toThrowError(/Violación de seguridad/);
  });

  it('10. Acceso al historial de inventario: solo propietario autorizado y bloqueo de acceso cruzado', () => {
    // Propietario A accede al historial de su propio inmueble A
    expect(canAccessHistorialInventario(propA, inmA, 'inm-A')).toBe(true);

    // Propietario A intenta acceder al historial del inmueble B: DENEGADO
    expect(canAccessHistorialInventario(propA, inmB, 'inm-B')).toBe(false);

    // Propietario A intenta consultar historial de B usando contexto de inmueble A: DENEGADO
    expect(canAccessHistorialInventario(propA, inmA, 'inm-B')).toBe(false);

    // Usuario no autenticado: DENEGADO
    expect(canAccessHistorialInventario(null, inmA, 'inm-A')).toBe(false);
  });

  it('11. Control de acceso para profesionales asignados vs no asignados', () => {
    // Profesional asignado a inm-A puede consultar el inventario para reparaciones
    expect(canAccessInventarioInmueble(profesionalUser, inmA, profesionalAsignado)).toBe(true);

    // Profesional asignado NO tiene permisos para mutar o dar de baja el inventario completo
    expect(canMutateInventario(profesionalUser, inmA, profesionalAsignado)).toBe(false);

    // Profesional NO asignado no puede ni siquiera consultar
    expect(canAccessInventarioInmueble(profesionalUser, inmA, profesionalNoAsignado)).toBe(false);
  });

  it('12. Administrador Principal: acceso y mutación autorizados en todos los inmuebles', () => {
    expect(canAccessInventarioInmueble(adminUser, inmA)).toBe(true);
    expect(canMutateInventario(adminUser, inmA)).toBe(true);
    expect(canAccessInventarioInmueble(adminUser, inmB)).toBe(true);
    expect(canMutateInventario(adminUser, inmB)).toBe(true);
    expect(canAccessHistorialInventario(adminUser, inmA, 'inm-A')).toBe(true);
  });
});
