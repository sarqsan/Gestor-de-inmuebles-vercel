import type { ContextoPrevisualizacion, DatosOrigenImportacion, ReglasRevisionDatos } from '../contracts.ts';
import { crearBorrador } from '../domain.ts';
import { PROPIETARIOS_DEMO } from './fixtures.ts';

/** Solo nombre identificativo ya utilizado por la demo. NO es una política fiscal. */
export const REGLA_NOMBRE_DEMO: ReglasRevisionDatos = {
  politica: { id: 'demo-solo-etiqueta-visual', camposRequeridos: ['nombre'] },
};

/** Políticas deliberadamente distintas por ficha; no se derivan del acceso. */
export const REGLAS_PROPIETARIOS_DEMO: ReadonlyMap<string, ReglasRevisionDatos | null> = new Map<string, ReglasRevisionDatos | null>([
  ['demo-propietario-a', REGLA_NOMBRE_DEMO],
  ['demo-propietario-b', { politica: { id: 'demo-sin-requisitos-configurados', camposRequeridos: [] } }],
  ['demo-propietario-c', null],
]);

export const ORIGEN_IMPORTACION_DEMO: readonly DatosOrigenImportacion[] = [
  { ...crearBorrador(), nombre: 'Registro Nube · ficticio', observaciones: 'Campos de origen conservados sin transformar.' },
  { ...crearBorrador(), nombre: '' },
  { ...crearBorrador(), nombre: 'Registro Faro · ficticio' },
  { ...crearBorrador(), nombre: 'Registro Brisa · ficticio' },
];

export const CONTEXTO_IMPORTACION_DEMO: ContextoPrevisualizacion = {
  propietarios: PROPIETARIOS_DEMO,
  // B, sin cuenta, puede ser destino. C se excluye en este fixture, NO por estar invitado.
  propietariosPermitidosIds: ['demo-propietario-a', 'demo-propietario-b'],
  reglasPorRegistro: [
    REGLA_NOMBRE_DEMO,
    REGLA_NOMBRE_DEMO,
    { ...REGLA_NOMBRE_DEMO, bloqueos: [{ codigo: 'DEMO_RETENIDO', mensaje: 'Retención ficticia suministrada por el contexto de prueba.' }] },
    { ...REGLA_NOMBRE_DEMO, revisiones: [{ codigo: 'DEMO_REVISAR', mensaje: 'Revisión manual ficticia solicitada por el contexto de prueba.' }] },
  ],
};
