import type { ModalidadUso } from '../contracts.ts';

export const OPCIONES_MODALIDAD: readonly {
  valor: ModalidadUso;
  titulo: string;
  descripcion: string;
  detalle: string;
}[] = [
  {
    valor: 'PROPIETARIO',
    titulo: 'Propietario',
    descripcion: 'Quiero organizar mi patrimonio.',
    detalle: 'Empieza con tu contexto de propietario, aunque todavía no tengas inmuebles registrados.',
  },
  {
    valor: 'GESTOR_PROPIETARIO',
    titulo: 'Gestor propietario',
    descripcion: 'Quiero organizar lo mío y gestionar para otros.',
    detalle: 'Distingue tu contexto propio de las fichas de otros propietarios, sin mezclar sus cuentas.',
  },
  {
    valor: 'GESTOR_PROFESIONAL',
    titulo: 'Gestor-profesional',
    descripcion: 'Quiero trabajar con varios propietarios.',
    detalle: 'No necesitas tener inmuebles propios para elegir esta forma de uso.',
  },
];

export interface SelectorModalidadUsoProps {
  modalidadActual: ModalidadUso | null;
  onChange: (modalidad: ModalidadUso) => void;
  onVolver: () => void;
  nombreGrupo?: string;
}

export function SelectorModalidadUso({
  modalidadActual,
  onChange,
  onVolver,
  nombreGrupo = 'modalidad-patrimonial',
}: SelectorModalidadUsoProps) {
  return (
    <div className="pat-modalidades">
      <fieldset>
        <legend>Elige tu forma de uso</legend>
        <div className="pat-modalidades-grid">
          {OPCIONES_MODALIDAD.map((opcion, index) => (
            <label key={opcion.valor} className={`pat-modalidad ${modalidadActual === opcion.valor ? 'is-selected' : ''}`}>
              <span className="pat-modalidad-top">
                <span className="pat-numero" aria-hidden="true">0{index + 1}</span>
                <input
                  type="radio"
                  name={nombreGrupo}
                  value={opcion.valor}
                  checked={modalidadActual === opcion.valor}
                  onChange={() => onChange(opcion.valor)}
                />
              </span>
              <strong>{opcion.titulo}</strong>
              <span className="pat-modalidad-descripcion">{opcion.descripcion}</span>
              <span className="pat-muted">{opcion.detalle}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="button" className="pat-link" onClick={onVolver}>← Volver atrás</button>
    </div>
  );
}
