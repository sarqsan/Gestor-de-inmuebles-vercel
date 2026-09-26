import type { ReferenciaPropietario } from '../contracts.ts';
import { filtrarPropietarios } from '../domain.ts';
import { EstadoAccesoBadge } from './EstadoAccesoBadge.tsx';

export interface ListaPropietariosProps {
  propietarios: readonly ReferenciaPropietario[];
  busqueda: string;
  onBusquedaChange: (busqueda: string) => void;
  propietarioSeleccionadoId: string | null;
  onSeleccionar: (propietarioId: string) => void;
}

export function ListaPropietarios({
  propietarios,
  busqueda,
  onBusquedaChange,
  propietarioSeleccionadoId,
  onSeleccionar,
}: ListaPropietariosProps) {
  const visibles = filtrarPropietarios(propietarios, busqueda);
  return (
    <section className="pat-panel" aria-label="Listado de propietarios">
      <div className="pat-panel-heading">
        <h2>Propietarios <span className="pat-count">{propietarios.length}</span></h2>
        <p className="pat-muted">Propietario ≠ cuenta de acceso. Una ficha puede existir sin cuenta y con 0 inmuebles.</p>
      </div>
      <label className="pat-search">
        <span>Buscar propietarios</span>
        <input
          type="search"
          value={busqueda}
          placeholder="Nombre, NIF/CIF, email o teléfono"
          onChange={(event) => onBusquedaChange(event.target.value)}
        />
      </label>
      <p className="pat-results" role="status">{visibles.length} de {propietarios.length} propietarios</p>
      {visibles.length === 0 ? (
        <div className="pat-empty">
          <strong>{propietarios.length === 0 ? 'Todavía no hay fichas.' : 'No encontramos coincidencias.'}</strong>
          <p>{propietarios.length === 0 ? 'Puedes añadir un borrador sin crear una cuenta ni un inmueble.' : 'Prueba otro nombre o limpia la búsqueda.'}</p>
        </div>
      ) : (
        <ul className="pat-owner-list">
          {visibles.map((propietario) => (
            <li key={propietario.id}>
              <button
                type="button"
                className={`pat-owner ${propietarioSeleccionadoId === propietario.id ? 'is-selected' : ''}`}
                aria-pressed={propietarioSeleccionadoId === propietario.id}
                onClick={() => onSeleccionar(propietario.id)}
              >
                <span className="pat-owner-top">
                  <strong>{propietario.nombre}</strong>
                  <EstadoAccesoBadge estado={propietario.estadoAcceso} />
                </span>
                <span className="pat-owner-bottom">
                  <span>{propietario.inmuebles.length} {propietario.inmuebles.length === 1 ? 'inmueble' : 'inmuebles'}</span>
                  <span>{propietario.cuentaId === null ? 'Sin cuenta vinculada' : 'Con cuenta vinculada'}</span>
                  <span aria-hidden="true">↗</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
