import type { BorradorPropietario, ModalidadUso, ReferenciaPropietario } from '../contracts.ts';
import { crearBorrador, crearReferenciaLocal, editarReferenciaLocal, validarBorradorDemo } from '../domain.ts';
import { PROPIETARIOS_DEMO } from './fixtures.ts';

interface EditorDemo {
  readonly propietarioId: string | null;
  readonly borrador: BorradorPropietario;
  readonly error: string | null;
}

export interface EstadoDemo {
  readonly modalidadSeleccionada: ModalidadUso | null;
  readonly pantalla: 'onboarding' | 'propietarios';
  readonly propietarios: readonly ReferenciaPropietario[];
  readonly propietarioSeleccionadoId: string | null;
  readonly busqueda: string;
  readonly propietarioDestinoId: string | null;
  readonly indiceRevisionImportacion: number | null;
  readonly editor: EditorDemo | null;
  readonly siguienteId: number;
  readonly aviso: string;
}

export type AccionDemo =
  | { readonly type: 'seleccionarModalidad'; readonly modalidad: ModalidadUso }
  | { readonly type: 'continuar' }
  | { readonly type: 'volverModalidad' }
  | { readonly type: 'buscar'; readonly busqueda: string }
  | { readonly type: 'seleccionarPropietario'; readonly propietarioId: string }
  | { readonly type: 'crearBorrador' }
  | { readonly type: 'editarBorrador'; readonly propietarioId: string }
  | { readonly type: 'cambiarBorrador'; readonly borrador: BorradorPropietario }
  | { readonly type: 'cancelarBorrador' }
  | { readonly type: 'guardarBorrador' }
  | { readonly type: 'seleccionarDestinoImportacion'; readonly propietarioDestinoId: string | null }
  | { readonly type: 'revisarRegistroImportacion'; readonly indiceOrigen: number | null };

export function crearEstadoDemo(
  propietarios: readonly ReferenciaPropietario[] = PROPIETARIOS_DEMO,
): EstadoDemo {
  return {
    modalidadSeleccionada: null,
    pantalla: 'onboarding',
    propietarios,
    propietarioSeleccionadoId: null,
    busqueda: '',
    propietarioDestinoId: null,
    indiceRevisionImportacion: null,
    editor: null,
    siguienteId: 1,
    aviso: '',
  };
}

/** Reductor puro: toda operación de la demo queda en el estado que devuelve. */
export function reducirDemo(estado: EstadoDemo, accion: AccionDemo): EstadoDemo {
  switch (accion.type) {
    case 'seleccionarDestinoImportacion':
      return { ...estado, propietarioDestinoId: accion.propietarioDestinoId, indiceRevisionImportacion: null };
    case 'revisarRegistroImportacion':
      return { ...estado, indiceRevisionImportacion: accion.indiceOrigen };
    case 'seleccionarModalidad':
      return { ...estado, modalidadSeleccionada: accion.modalidad };
    case 'continuar':
      return estado.modalidadSeleccionada ? { ...estado, pantalla: 'propietarios' } : estado;
    case 'volverModalidad':
      return { ...estado, pantalla: 'onboarding' };
    case 'buscar':
      return { ...estado, busqueda: accion.busqueda };
    case 'seleccionarPropietario':
      return estado.propietarios.some(({ id }) => id === accion.propietarioId)
        ? { ...estado, propietarioSeleccionadoId: accion.propietarioId }
        : estado;
    case 'crearBorrador':
      return { ...estado, aviso: '', editor: { propietarioId: null, borrador: crearBorrador(), error: null } };
    case 'editarBorrador': {
      const propietario = estado.propietarios.find(({ id }) => id === accion.propietarioId);
      return propietario
        ? { ...estado, aviso: '', editor: { propietarioId: propietario.id, borrador: crearBorrador(propietario), error: null } }
        : estado;
    }
    case 'cambiarBorrador':
      return estado.editor
        ? { ...estado, editor: { ...estado.editor, borrador: crearBorrador(accion.borrador), error: null } }
        : estado;
    case 'cancelarBorrador':
      return { ...estado, editor: null, aviso: 'Borrador descartado. Las fichas no han cambiado.' };
    case 'guardarBorrador': {
      if (!estado.editor) return estado;
      const { borrador, propietarioId } = estado.editor;
      const error = validarBorradorDemo(borrador);
      if (error) return { ...estado, editor: { ...estado.editor, error } };
      if (propietarioId !== null) {
        if (!estado.propietarios.some(({ id }) => id === propietarioId)) {
          return { ...estado, editor: { ...estado.editor, error: 'La ficha ya no está en el contexto de la demo.' } };
        }
        return {
          ...estado,
          propietarios: estado.propietarios.map((p) => p.id === propietarioId ? editarReferenciaLocal(p, borrador) : p),
          propietarioSeleccionadoId: propietarioId,
          editor: null,
          aviso: 'Cambios guardados solo en memoria. Acceso e inmuebles no han cambiado.',
        };
      }
      let siguienteId = estado.siguienteId;
      while (estado.propietarios.some(({ id }) => id === `demo-borrador-${siguienteId}`)) siguienteId++;
      const nuevo = crearReferenciaLocal(`demo-borrador-${siguienteId}`, borrador);
      return {
        ...estado,
        propietarios: [...estado.propietarios, nuevo],
        propietarioSeleccionadoId: nuevo.id,
        busqueda: '',
        siguienteId: siguienteId + 1,
        editor: null,
        aviso: 'Borrador añadido solo en memoria. No se ha creado una cuenta ni un inmueble.',
      };
    }
    default:
      return estado;
  }
}
