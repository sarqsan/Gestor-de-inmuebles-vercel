import type { ModalidadUso, ReferenciaInmueble, ReferenciaPropietario } from '../contracts.ts';

/** Exclusivamente ficticios. No se cargan en la aplicación productiva. */
export const PROPIETARIOS_DEMO: readonly ReferenciaPropietario[] = [
  {
    id: 'demo-propietario-a',
    nombre: 'A · Aurora de Papel (ficticia)',
    nifCif: '',
    email: 'aurora@example.invalid',
    telefono: '',
    estadoAcceso: 'ACTIVO',
    cuentaId: 'demo-cuenta-aurora',
    inmuebles: [
      { id: 'demo-inmueble-a1', nombre: 'Casa Nube · ficticia' },
      { id: 'demo-inmueble-a2', nombre: 'Estudio Cometa · ficticio' },
      { id: 'demo-inmueble-a3', nombre: 'Casa Brisa · ficticia' },
    ],
  },
  {
    id: 'demo-propietario-b',
    nombre: 'B · Bosque de Cartón (ficticio)',
    nifCif: '',
    email: '',
    telefono: '',
    estadoAcceso: 'SIN_CUENTA',
    cuentaId: null,
    inmuebles: [
      { id: 'demo-inmueble-b1', nombre: 'Casa Duna · ficticia' },
      { id: 'demo-inmueble-b2', nombre: 'Estudio Faro · ficticio' },
    ],
  },
  {
    id: 'demo-propietario-c',
    nombre: 'C · Cobalto Imaginario (ficticio)',
    nifCif: '',
    email: 'cobalto@example.invalid',
    telefono: '',
    estadoAcceso: 'INVITADO',
    cuentaId: null,
    inmuebles: [],
  },
];

export interface ContextoGestorDemo {
  readonly nombre: string;
  readonly modalidad: ModalidadUso;
  readonly inmueblesPropios: readonly ReferenciaInmueble[];
  /** Contexto ficticio de trabajo; NO es una lista de permisos efectivos. */
  readonly propietariosContextoIds: readonly string[];
}

export const GESTOR_PROFESIONAL_DEMO: ContextoGestorDemo = {
  nombre: 'Estudio Órbita de Papel · gestor ficticio',
  modalidad: 'GESTOR_PROFESIONAL',
  inmueblesPropios: [],
  propietariosContextoIds: PROPIETARIOS_DEMO.map(({ id }) => id),
};
