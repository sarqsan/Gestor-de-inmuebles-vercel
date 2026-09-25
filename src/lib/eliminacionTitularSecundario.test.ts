import { beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, updateDoc } from 'firebase/firestore';
import type { Inmueble } from '../types';
import {
  camposEliminacionTitularSecundario,
  debeEliminarTitularSecundario,
  escribirEliminacionTitularSecundario,
  payloadEliminacionTitularSecundario,
  type PayloadEliminacionTitularSecundario,
} from './eliminacionTitularSecundario';

vi.mock('firebase/firestore', () => ({
  deleteField: () => ({ _methodName: 'deleteField' }),
  doc: vi.fn((_db: unknown, coleccion: string, id: string) => ({ coleccion, id })),
  updateDoc: vi.fn(async () => undefined),
}));

function previo(extra: Partial<Inmueble> = {}): Inmueble {
  return {
    id: 'inm-1',
    direccion: 'Calle Mayor 1',
    ciudad: 'Sevilla',
    precio: 900,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...extra,
  };
}

describe('eliminación física del segundo titular', () => {
  beforeEach(() => {
    vi.mocked(updateDoc).mockClear();
    vi.mocked(doc).mockClear();
  });

  it('solo borra los dos campos y deja la bandera en false, sin sustituir el mapa fiscal', () => {
    const campos = payloadEliminacionTitularSecundario();
    expect(Object.keys(campos).sort()).toEqual([
      'datosFiscales.segundoPropietario',
      'datosFiscales.tieneSegundoPropietario',
      'propietarioSecundarioId',
    ]);
    expect(campos.propietarioSecundarioId).toEqual({ _methodName: 'deleteField' });
    expect(campos['datosFiscales.segundoPropietario']).toEqual({ _methodName: 'deleteField' });
    expect(campos['datosFiscales.tieneSegundoPropietario']).toBe(false);
    expect(campos).not.toHaveProperty('datosFiscales');
    expect(campos).not.toHaveProperty('propietarioId');
    expect(campos).not.toHaveProperty('propietarioPrincipalId');
  });

  it('el writer ignora claves ajenas y escribe exactamente ese update', async () => {
    const sucio = {
      ...payloadEliminacionTitularSecundario(),
      datosFiscales: { propietarioPrincipal: { nombre: 'no debe escribirse' } },
      propietarioId: { _methodName: 'deleteField' },
    } as PayloadEliminacionTitularSecundario;
    const limpio = camposEliminacionTitularSecundario(sucio);
    expect(limpio).not.toHaveProperty('datosFiscales');
    expect(limpio).not.toHaveProperty('propietarioId');

    const database = { marca: 'db' };
    await escribirEliminacionTitularSecundario(database as never, 'inm-9', sucio);

    expect(doc).toHaveBeenCalledWith(database, 'inmuebles', 'inm-9');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const escrito = vi.mocked(updateDoc).mock.calls[0][1] as unknown as PayloadEliminacionTitularSecundario;
    expect(Object.keys(escrito).sort()).toEqual([
      'datosFiscales.segundoPropietario',
      'datosFiscales.tieneSegundoPropietario',
      'propietarioSecundarioId',
    ]);
    expect(escrito['datosFiscales.tieneSegundoPropietario']).toBe(false);
    expect(escrito.propietarioSecundarioId).toEqual({ _methodName: 'deleteField' });
    expect(escrito['datosFiscales.segundoPropietario']).toEqual({ _methodName: 'deleteField' });
  });

  it('la decisión exige edición con segundo titular previo y casilla desactivada', () => {
    const conId = previo({ propietarioSecundarioId: 'P2' });
    const conCopia = previo({
      datosFiscales: {
        propietarioPrincipal: { nombre: 'P1', nifDni: '1', direccion: 'c' },
        segundoPropietario: { nombre: 'P2', nifDni: '2', direccion: 'c' },
        tieneSegundoPropietario: true,
      },
    });
    const sinSegundo = previo({
      propietarioId: 'P1',
      datosFiscales: {
        propietarioPrincipal: { nombre: 'P1', nifDni: '1', direccion: 'c' },
        tieneSegundoPropietario: false,
      },
    });

    expect(debeEliminarTitularSecundario(conId, false)).toBe(true);
    expect(debeEliminarTitularSecundario(conCopia, false)).toBe(true);
    expect(debeEliminarTitularSecundario(conId, true)).toBe(false);
    expect(debeEliminarTitularSecundario(conCopia, true)).toBe(false);
    expect(debeEliminarTitularSecundario(sinSegundo, false)).toBe(false);
  });
});
