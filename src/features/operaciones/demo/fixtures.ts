import type { ContextoOperativo, DatosPorTipo } from '../contracts.ts';

/** Solo datos ficticios; las proyecciones no necesitan cuenta de usuario ni perfil fiscal. */
export const CONTEXTO_FICTICIO: ContextoOperativo = {
  ambito: { propietarioId: 'prop-demo-a', inmuebleId: 'inm-demo-1' },
  ambitosPermitidos: [
    { propietarioId: 'prop-demo-a', inmuebleId: 'inm-demo-1' },
    { propietarioId: 'prop-demo-a', inmuebleId: 'inm-demo-2' },
    { propietarioId: 'prop-demo-b', inmuebleId: 'inm-demo-3' },
  ],
  propietarios: [{ id: 'prop-demo-a', nombre: 'Propietaria ficticia sin cuenta' }, { id: 'prop-demo-b', nombre: 'Comunidad ficticia' }],
  inmuebles: [{ id: 'inm-demo-1', direccion: 'Calle ficticia 1' }, { id: 'inm-demo-2', direccion: 'Calle ficticia 2' }, { id: 'inm-demo-3', direccion: 'Calle ficticia 3' }],
  contratos: [{ id: 'contrato-demo', inmuebleId: 'inm-demo-1', candidatoId: 'candidato-demo', estado: 'FORMALIZADO_ACTIVO' },
    { id: 'contrato-historico-demo', inmuebleId: 'inm-demo-1', candidatoId: 'candidato-demo', estado: 'CANCELADO' }],
  inquilinos: [{ id: 'candidato-demo', inmuebleId: 'inm-demo-1', nombre: 'Arrendatario ficticio' }],
};
export const DATOS_FICTICIOS: DatosPorTipo = {
  proveedor: { nombre: 'Taller ficticio', servicios: ['Electrodomésticos'], contacto: { email: 'taller@example.invalid' }, activo: true, referenciaExterna: 'taller-demo' },
  equipo: { tipoEquipo: 'LAVADORA', marca: 'Marca ficticia', modelo: 'Demo 1', numeroSerie: 'FICTICIO-001', fechaAdquisicion: '2025-01-02', fechaInstalacion: '2025-01-03' },
  garantia: { equipoId: 'equipo-demo', inicio: '2025-01-02', vencimiento: '2026-10-05', proveedorId: 'proveedor-demo', fabricante: 'Fabricante ficticio', condiciones: 'Consultar exclusivamente el documento original.', referenciaCompra: 'COMPRA-DEMO-001' },
  incidencia: { fecha: '2026-09-26', descripcion: 'Lavadora ficticia no desagua', prioridad: 'ALTA', origen: 'PROPIETARIO', alcance: 'INMUEBLE', equipoId: 'equipo-demo', responsable: 'Responsable ficticio' },
  averia: { incidenciaId: 'incidencia-demo', equipoId: 'equipo-demo', descripcion: 'Posible obstrucción', sintomas: ['Agua retenida'], fecha: '2026-09-26', proveedorId: 'proveedor-demo', garantiaId: 'garantia-demo' },
  reparacion: { incidenciaId: 'incidencia-demo', averiaId: 'averia-demo', equipoId: 'equipo-demo', descripcion: 'Sustitución de bomba', proveedorId: 'proveedor-demo', presupuestoId: 'presupuesto-demo', fechaPrevista: '2026-09-27', moneda: 'EUR', materiales: [] },
  presupuesto: { vinculo: { incidenciaId: 'incidencia-demo', averiaId: 'averia-demo' }, proveedorId: 'proveedor-demo', fecha: '2026-09-26', referencia: 'P-DEMO-2026-001', moneda: 'EUR', importeCentimos: 12000, conceptos: [{ descripcion: 'Bomba y mano de obra, importe final aportado', importeCentimos: 12000 }] },
  factura: { vinculo: null, proveedorId: 'proveedor-demo', fecha: '2026-09-26', referencia: 'F-DEMO-2026-001', moneda: 'EUR', importeCentimos: 12000, conceptos: [{ descripcion: 'Bomba y mano de obra', importeCentimos: 12000 }], origen: 'PROVEEDOR' },
  documento: { archivo: { id: 'archivo-demo', nombreArchivo: 'parte-ficticio.pdf', mimeType: 'application/pdf', fechaSubida: '2026-09-26T09:00:00.000Z', tamañoBytes: 42 }, categoria: 'PARTE', descripcion: 'Referencia ficticia sin URL, fichero ni almacenamiento real' },
};
