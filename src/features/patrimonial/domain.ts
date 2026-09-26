import type { BorradorPropietario, ReferenciaPropietario } from './contracts.ts';

export function crearBorrador(propietario?: BorradorPropietario): BorradorPropietario {
  return {
    nombre: propietario?.nombre ?? '',
    nifCif: propietario?.nifCif ?? '',
    email: propietario?.email ?? '',
    telefono: propietario?.telefono ?? '',
  };
}

/** Único requisito de esta demo: una etiqueta con la que reconocer el borrador. */
export function validarBorradorDemo(borrador: BorradorPropietario): string | null {
  return borrador.nombre.trim() ? null : 'Escribe un nombre para identificar el borrador en la demo.';
}

function limpiarBorrador(borrador: BorradorPropietario): BorradorPropietario {
  const error = validarBorradorDemo(borrador);
  if (error) throw new Error(error);
  return {
    nombre: borrador.nombre.trim(),
    nifCif: borrador.nifCif.trim(),
    email: borrador.email.trim(),
    telefono: borrador.telefono.trim(),
  };
}

export function crearReferenciaLocal(id: string, borrador: BorradorPropietario): ReferenciaPropietario {
  if (!id.trim()) throw new Error('La demo necesita un identificador local.');
  return {
    ...limpiarBorrador(borrador),
    id,
    estadoAcceso: 'SIN_CUENTA',
    cuentaId: null,
    inmuebles: [],
  };
}

/** Solo modifica datos de ficha: preserva acceso, cuenta y referencias de inmuebles. */
export function editarReferenciaLocal(
  propietario: ReferenciaPropietario,
  borrador: BorradorPropietario,
): ReferenciaPropietario {
  return { ...propietario, ...limpiarBorrador(borrador) };
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

export function filtrarPropietarios(
  propietarios: readonly ReferenciaPropietario[],
  busqueda: string,
): readonly ReferenciaPropietario[] {
  const consulta = normalizar(busqueda);
  return propietarios.filter((propietario) =>
    [propietario.nombre, propietario.nifCif, propietario.email, propietario.telefono]
      .some((campo) => normalizar(campo).includes(consulta)),
  );
}
